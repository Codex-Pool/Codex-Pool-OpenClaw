import { describe, expect, test } from "vitest";

import { buildCodexPoolHeaders } from "../src/provider/auth.js";

describe("buildCodexPoolHeaders", () => {
  test("对 cp key 不做 accountId 解析且默认只带 Authorization", () => {
    const headers = buildCodexPoolHeaders({
      apiKey: "cp_test_key"
    });

    expect(headers.get("Authorization")).toBe("Bearer cp_test_key");
    expect(headers.get("chatgpt-account-id")).toBeNull();
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("content-type")).toBe("application/json");
  });

  test("显式提供 chatgptAccountId 时才附带 chatgpt-account-id", () => {
    const headers = buildCodexPoolHeaders({
      apiKey: "cp_test_key",
      chatgptAccountId: "acc_123"
    });

    expect(headers.get("Authorization")).toBe("Bearer cp_test_key");
    expect(headers.get("chatgpt-account-id")).toBe("acc_123");
  });

  test("显式提供 sessionId 时附带 session_id", () => {
    const headers = buildCodexPoolHeaders({
      apiKey: "cp_test_key",
      sessionId: "session-42"
    });

    expect(headers.get("session_id")).toBe("session-42");
  });

  test("会继承 model headers 并允许 runtime headers 覆盖", () => {
    const headers = buildCodexPoolHeaders({
      apiKey: "cp_test_key",
      initHeaders: {
        "x-model-only": "keep-me",
        "x-from-model": "model",
        originator: "model-originator"
      },
      extraHeaders: {
        "x-from-model": "runtime",
        "x-extra": "1"
      }
    });

    expect(headers.get("x-model-only")).toBe("keep-me");
    expect(headers.get("x-from-model")).toBe("runtime");
    expect(headers.get("x-extra")).toBe("1");
  });

  test("默认头细节对齐官方 codex provider", () => {
    const headers = buildCodexPoolHeaders({
      apiKey: "cp_test_key"
    });

    expect(headers.get("OpenAI-Beta")).toBe("responses=experimental");
    expect(headers.get("originator")).toBe("pi");
    expect(headers.get("User-Agent")).toMatch(/^pi \(/);
  });

  test("缺少 apiKey 时抛出可读错误", () => {
    expect(() => buildCodexPoolHeaders({ apiKey: "" })).toThrow(
      "Missing Codex-Pool API key"
    );
  });
});
