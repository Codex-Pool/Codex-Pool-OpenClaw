import { describe, expect, test } from "vitest";

import {
  buildCodexPoolRequestBody,
  resolveCodexPoolUrl
} from "../src/provider/request.js";

describe("resolveCodexPoolUrl", () => {
  test("默认拼接到 backend-api/codex/responses", () => {
    expect(resolveCodexPoolUrl("http://127.0.0.1:8091")).toBe(
      "http://127.0.0.1:8091/backend-api/codex/responses"
    );
  });

  test("baseUrl 已包含 backend-api 时继续拼接 codex/responses", () => {
    expect(resolveCodexPoolUrl("http://127.0.0.1:8091/backend-api")).toBe(
      "http://127.0.0.1:8091/backend-api/codex/responses"
    );
  });

  test("可切换到 v1/responses 路径模式", () => {
    expect(
      resolveCodexPoolUrl("http://127.0.0.1:8091", { pathMode: "responses" })
    ).toBe("http://127.0.0.1:8091/v1/responses");
  });
});

describe("buildCodexPoolRequestBody", () => {
  test("保留 Codex 风格关键字段并转换用户消息", () => {
    const body = buildCodexPoolRequestBody(
      { id: "gpt-5.4" },
      {
        systemPrompt: "You are helpful",
        messages: [{ role: "user", content: "ping" }]
      },
      {}
    );

    expect(body).toMatchObject({
      model: "gpt-5.4",
      store: false,
      stream: true,
      instructions: "You are helpful",
      text: { verbosity: "medium" },
      tool_choice: "auto",
      parallel_tool_calls: true
    });
    expect(body.include).toContain("reasoning.encrypted_content");
    expect(body.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "ping" }]
      }
    ]);
  });

  test("兼容 assistant 文本历史消息", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "You are helpful",
        messages: [
          { role: "user", content: "ping" },
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [{ type: "text", text: "pong", textSignature: "msg_prev" }]
          },
          { role: "user", content: "继续" }
        ]
      },
      {}
    );

    expect(body.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "ping" }]
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "pong", annotations: [] }],
        status: "completed",
        id: "msg_prev"
      },
      {
        role: "user",
        content: [{ type: "input_text", text: "继续" }]
      }
    ]);
  });

  test("兼容 assistant toolCall 与 toolResult 文本结果", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          { role: "user", content: "查天气" },
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [
              {
                type: "toolCall",
                id: "call_weather|fc_weather",
                name: "weather_lookup",
                arguments: { city: "北京" }
              }
            ]
          },
          {
            role: "toolResult",
            toolCallId: "call_weather|fc_weather",
            content: [{ type: "text", text: "晴，20°C" }]
          }
        ]
      },
      {}
    );

    expect(body.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "查天气" }]
      },
      {
        type: "function_call",
        id: "fc_weather",
        call_id: "call_weather",
        name: "weather_lookup",
        arguments: JSON.stringify({ city: "北京" })
      },
      {
        type: "function_call_output",
        call_id: "call_weather",
        output: "晴，20°C"
      }
    ]);
  });

  test("兼容混合 user 内容与 toolResult 图片结果", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text", "image"]
      },
      {
        systemPrompt: "",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "帮我看看这张图" },
              { type: "image", mimeType: "image/png", data: "dXNlcg==" }
            ]
          },
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [
              {
                type: "toolCall",
                id: "call_vision|fc_vision",
                name: "inspect_image",
                arguments: { mode: "brief" }
              }
            ]
          },
          {
            role: "toolResult",
            toolCallId: "call_vision|fc_vision",
            content: [{ type: "image", mimeType: "image/png", data: "dG9vbA==" }]
          }
        ]
      },
      {}
    );

    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "帮我看看这张图" },
          {
            type: "input_image",
            detail: "auto",
            image_url: "data:image/png;base64,dXNlcg=="
          }
        ]
      },
      {
        type: "function_call",
        id: "fc_vision",
        call_id: "call_vision",
        name: "inspect_image",
        arguments: JSON.stringify({ mode: "brief" })
      },
      {
        type: "function_call_output",
        call_id: "call_vision",
        output: "(see attached image)"
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Attached image(s) from tool result:" },
          {
            type: "input_image",
            detail: "auto",
            image_url: "data:image/png;base64,dG9vbA=="
          }
        ]
      }
    ]);
  });

  test("可写入 sessionId 和 reasoning 参数", () => {
    const body = buildCodexPoolRequestBody(
      { id: "gpt-5.4" },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        sessionId: "session-1",
        reasoningEffort: "high",
        reasoningSummary: "auto",
        textVerbosity: "low"
      }
    );

    expect(body.prompt_cache_key).toBe("session-1");
    expect(body.text).toEqual({ verbosity: "low" });
    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
  });

  test("透传 context.tools 为 Codex function tools", () => {
    const body = buildCodexPoolRequestBody(
      { id: "gpt-5.4", input: ["text"] },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "帮我查天气" }],
        tools: [
          {
            name: "weather_lookup",
            description: "查询天气",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" }
              },
              required: ["city"]
            }
          }
        ]
      },
      {}
    );

    expect(body.tools).toEqual([
      {
        type: "function",
        name: "weather_lookup",
        description: "查询天气",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string" }
          },
          required: ["city"]
        },
        strict: null
      }
    ]);
  });

  test("显式 temperature 会进入请求体", () => {
    const body = buildCodexPoolRequestBody(
      { id: "gpt-5.4", input: ["text"] },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        temperature: 0.25
      }
    );

    expect(body.temperature).toBe(0.25);
  });

  test("gpt-5.2 minimal reasoning 会按官方规则 clamp 为 low", () => {
    const body = buildCodexPoolRequestBody(
      { id: "gpt-5.2-codex", input: ["text"] },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        reasoningEffort: "minimal",
        reasoningSummary: "auto"
      }
    );

    expect(body.reasoning).toEqual({ effort: "low", summary: "auto" });
  });

  test("same-model assistant thinkingSignature 会回放为 reasoning item", () => {
    const reasoningItem = {
      type: "reasoning",
      id: "rs_123",
      summary: [{ type: "summary_text", text: "先查天气再回复" }]
    };

    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          { role: "user", content: "帮我查天气" },
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [
              {
                type: "thinking",
                thinking: "",
                thinkingSignature: JSON.stringify(reasoningItem)
              }
            ]
          }
        ]
      },
      {}
    );

    expect(body.input).toContainEqual(reasoningItem);
  });

  test("cross-model assistant thinking 会按官方规则降级成文本 replay", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          { role: "user", content: "先思考一下" },
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.2-codex",
            content: [
              {
                type: "thinking",
                thinking: "这里是跨模型 replay 的 thinking",
                thinkingSignature: JSON.stringify({
                  type: "reasoning",
                  id: "rs_cross"
                })
              }
            ]
          }
        ]
      },
      {}
    );

    expect(body.input).toContainEqual({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "这里是跨模型 replay 的 thinking",
          annotations: []
        }
      ],
      status: "completed",
      id: "msg_1"
    });
  });

  test("cross-model 同 provider replay 时会按官方规则省略 fc_* item id", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.2-codex",
            content: [
              {
                type: "toolCall",
                id: "call_weather|fc_weather",
                name: "weather_lookup",
                arguments: { city: "北京" }
              }
            ]
          }
        ]
      },
      {}
    );

    const functionCall = body.input[0];
    expect(functionCall).toMatchObject({
      type: "function_call",
      call_id: "call_weather",
      name: "weather_lookup",
      arguments: JSON.stringify({ city: "北京" })
    });
    expect(functionCall).not.toHaveProperty("id");
  });

  test("orphaned toolCall 会自动补 synthetic toolResult", () => {
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [
              {
                type: "toolCall",
                id: "call_weather|fc_weather",
                name: "weather_lookup",
                arguments: { city: "北京" }
              }
            ]
          },
          { role: "user", content: "继续说" }
        ]
      },
      {}
    );

    expect(body.input).toEqual([
      {
        type: "function_call",
        id: "fc_weather",
        call_id: "call_weather",
        name: "weather_lookup",
        arguments: JSON.stringify({ city: "北京" })
      },
      {
        type: "function_call_output",
        call_id: "call_weather",
        output: "No result provided"
      },
      {
        role: "user",
        content: [{ type: "input_text", text: "继续说" }]
      }
    ]);
  });

  test("会清洗 user 文本中的非法 surrogate", () => {
    const badChar = String.fromCharCode(0xd83d);
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: `sys ${badChar} prompt`,
        messages: [{ role: "user", content: `hello ${badChar} world` }]
      },
      {}
    );

    expect(body.instructions).toBe(`sys ${badChar} prompt`);
    expect(body.input[0]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "hello  world" }]
    });
  });

  test("超长 textSignature 会按官方规则缩成 hash id", () => {
    const longSignature = "sig_".padEnd(120, "x");
    const body = buildCodexPoolRequestBody(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        input: ["text"]
      },
      {
        systemPrompt: "",
        messages: [
          {
            role: "assistant",
            provider: "codex-pool",
            api: "openai-codex-responses",
            model: "gpt-5.4",
            content: [
              {
                type: "text",
                text: "pong",
                textSignature: longSignature
              }
            ]
          }
        ]
      },
      {}
    );

    const messageItem = body.input[0];
    expect(messageItem.id).toMatch(/^msg_/);
    expect(messageItem.id.length).toBeLessThanOrEqual(64);
  });
});
