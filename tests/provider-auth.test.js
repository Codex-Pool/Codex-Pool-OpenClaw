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

  test("缺少 apiKey 时抛出可读错误", () => {
    expect(() => buildCodexPoolHeaders({ apiKey: "" })).toThrow(
      "Missing Codex-Pool API key"
    );
  });
});
