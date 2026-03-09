import http from "node:http";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  streamCodexPoolCodexResponses,
  streamSimpleCodexPoolCodexResponses
} from "../src/provider/stream.js";

const servers = [];
const originalWebSocket = globalThis.WebSocket;

function createServer(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function collectEvents(stream) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.WebSocket = originalWebSocket;
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        })
    )
  );
});

beforeEach(() => {
  globalThis.WebSocket = originalWebSocket;
});

describe("streamCodexPoolCodexResponses", () => {
  test("能把 Codex 风格请求发到 Codex-Pool 并解析最小 SSE 文本响应", async () => {
    const { baseUrl } = await createServer(async (req, res) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/backend-api/codex/responses");
      expect(req.headers.authorization).toBe("Bearer cp_stream_key");

      const body = await readJsonBody(req);
      expect(body.model).toBe("gpt-5.4");

      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          'data: {"type":"response.output_text.delta","delta":"pong"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_1","content":[{"type":"output_text","text":"pong","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "cp",
        api: "codex-pool-codex",
        baseUrl
      },
      {
        systemPrompt: "You are helpful",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const events = await collectEvents(stream);
    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "text_start",
      "text_delta",
      "text_end",
      "done"
    ]);
    expect(result.stopReason).toBe("stop");
    expect(result.content[0]).toMatchObject({ type: "text", text: "pong" });
    expect(result.content[0].textSignature).toBe("msg_1");
  });

  test("response.failed 会映射为错误事件", async () => {
    const { baseUrl } = await createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.failed","response":{"error":{"message":"upstream boom"}}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "cp",
        api: "codex-pool-codex",
        baseUrl
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const events = await collectEvents(stream);
    const finalEvent = events.at(-1);
    const result = await stream.result();

    expect(finalEvent.type).toBe("error");
    expect(finalEvent.error.errorMessage).toBe("upstream boom");
    expect(result.errorMessage).toBe("upstream boom");
  });

  test("工具调用完成后会产出 toolcall_end 并把 stopReason 设为 toolUse", async () => {
    const { baseUrl } = await createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_weather","call_id":"call_weather","name":"weather_lookup","arguments":""}}',
          "",
          'data: {"type":"response.function_call_arguments.delta","delta":"{\\"city\\":\\"北京\\"}"}',
          "",
          'data: {"type":"response.function_call_arguments.done","arguments":"{\\"city\\":\\"北京\\"}"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_weather","call_id":"call_weather","name":"weather_lookup","arguments":"{\\"city\\":\\"北京\\"}"}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed","usage":{"input_tokens":12,"output_tokens":6,"total_tokens":18,"input_tokens_details":{"cached_tokens":2}}}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "查天气" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const events = await collectEvents(stream);
    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "toolcall_start",
      "toolcall_delta",
      "toolcall_end",
      "done"
    ]);
    expect(result.stopReason).toBe("toolUse");
    expect(result.usage).toMatchObject({
      input: 10,
      output: 6,
      cacheRead: 2,
      totalTokens: 18
    });
  });

  test("refusal 增量会按官方语义映射为文本输出", async () => {
    const { baseUrl } = await createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"refusal","refusal":""}}',
          "",
          'data: {"type":"response.refusal.delta","delta":"不能帮你做这个"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_refusal","content":[{"type":"refusal","refusal":"不能帮你做这个"}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "帮我做违规操作" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const events = await collectEvents(stream);
    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "text_start",
      "text_delta",
      "text_end",
      "done"
    ]);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "不能帮你做这个",
      textSignature: "msg_refusal"
    });
  });

  test("坏 JSON SSE chunk 不会炸掉整条流", async () => {
    const { baseUrl } = await createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          "data: {not-json}",
          "",
          'data: {"type":"response.output_text.delta","delta":"pong"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_ok","content":[{"type":"output_text","text":"pong","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const result = await stream.result();
    expect(result.content[0]).toMatchObject({ type: "text", text: "pong" });
  });

  test("429 后会按官方逻辑重试再成功", async () => {
    let attempts = 0;
    const { baseUrl } = await createServer(async (_req, res) => {
      attempts += 1;

      if (attempts === 1) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              code: "rate_limit_exceeded",
              message: "too many requests"
            }
          })
        );
        return;
      }

      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          'data: {"type":"response.output_text.delta","delta":"pong"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_retry","content":[{"type":"output_text","text":"pong","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const result = await stream.result();
    expect(attempts).toBe(2);
    expect(result.content[0]).toMatchObject({ type: "text", text: "pong" });
  });

  test("缺少 apiKey 时会直接返回错误事件", async () => {
    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl: "http://127.0.0.1:8091"
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      }
    );

    const events = await collectEvents(stream);
    const finalEvent = events.at(-1);
    const result = await stream.result();

    expect(finalEvent?.type).toBe("error");
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("No API key for provider");
  });

  test("signal 已中止时会返回 aborted 错误", async () => {
    const controller = new AbortController();
    controller.abort();

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl: "http://127.0.0.1:8091"
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        apiKey: "cp_stream_key",
        signal: controller.signal
      }
    );

    const events = await collectEvents(stream);
    const finalEvent = events.at(-1);
    const result = await stream.result();

    expect(finalEvent?.type).toBe("error");
    expect(result.stopReason).toBe("aborted");
    expect(result.errorMessage).toContain("Request was aborted");
  });

  test("streamSimple 会把不支持 xhigh 的模型 clamp 为 high", async () => {
    let receivedBody;
    const { baseUrl } = await createServer(async (req, res) => {
      receivedBody = await readJsonBody(req);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          'data: {"type":"response.output_text.delta","delta":"ok"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_reasoning_clamp","content":[{"type":"output_text","text":"ok","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamSimpleCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        apiKey: "cp_stream_key",
        reasoning: "xhigh"
      }
    );

    await collectEvents(stream);
    await stream.result();

    expect(receivedBody.reasoning).toEqual({ effort: "high", summary: "auto" });
  });

  test("streamSimple 会保留支持 xhigh 模型的 reasoning", async () => {
    let receivedBody;
    const { baseUrl } = await createServer(async (req, res) => {
      receivedBody = await readJsonBody(req);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          'data: {"type":"response.output_text.delta","delta":"ok"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_reasoning_passthrough","content":[{"type":"output_text","text":"ok","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamSimpleCodexPoolCodexResponses(
      {
        id: "gpt-5.2-codex",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      {
        apiKey: "cp_stream_key",
        reasoning: "xhigh"
      }
    );

    await collectEvents(stream);
    await stream.result();

    expect(receivedBody.reasoning).toEqual({
      effort: "xhigh",
      summary: "auto"
    });
  });

  test("显式 websocket 传输但运行时没有 WebSocket 时会返回错误事件", async () => {
    globalThis.WebSocket = undefined;

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl: "http://127.0.0.1:8091"
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key", transport: "websocket" }
    );

    const events = await collectEvents(stream);
    const finalEvent = events.at(-1);
    const result = await stream.result();

    expect(finalEvent.type).toBe("error");
    expect(result.errorMessage).toContain(
      "WebSocket transport is not available in this runtime"
    );
  });

  test("非强制 websocket 模式在 WebSocket 不可用时会回退到 SSE", async () => {
    globalThis.WebSocket = undefined;

    const { baseUrl } = await createServer(async (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        [
          'data: {"type":"response.output_item.added","item":{"type":"message","content":[]}}',
          "",
          'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"","annotations":[]}}',
          "",
          'data: {"type":"response.output_text.delta","delta":"fallback ok"}',
          "",
          'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_ws_fallback","content":[{"type":"output_text","text":"fallback ok","annotations":[]}]}}',
          "",
          'data: {"type":"response.done","response":{"status":"completed"}}',
          "",
          ""
        ].join("\n")
      );
      res.end();
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key", transport: "auto" }
    );

    const events = await collectEvents(stream);
    const result = await stream.result();

    expect(events.at(-1)?.type).toBe("done");
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "fallback ok",
      textSignature: "msg_ws_fallback"
    });
  });

  test("429 usage limit 会映射为更友好的错误消息", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "usage_limit_reached",
            message: "usage exhausted",
            plan_type: "PLUS",
            resets_at: Math.floor(Date.now() / 1000) + 600
          }
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const stream = streamCodexPoolCodexResponses(
      {
        id: "gpt-5.4",
        provider: "codex-pool",
        api: "openai-codex-responses",
        baseUrl: "http://127.0.0.1:8091"
      },
      {
        systemPrompt: "",
        messages: [{ role: "user", content: "ping" }]
      },
      { apiKey: "cp_stream_key" }
    );

    const eventsPromise = collectEvents(stream);
    await vi.runAllTimersAsync();
    const events = await eventsPromise;
    const finalEvent = events.at(-1);
    const result = await stream.result();

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(finalEvent?.type).toBe("error");
    expect(result.errorMessage).toContain("ChatGPT usage limit");
    expect(result.errorMessage).toContain("Try again");
  });
});
