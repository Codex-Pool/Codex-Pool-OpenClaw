import http from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import { streamCodexPoolCodexResponses } from "../src/provider/stream.js";

const servers = [];

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
});
