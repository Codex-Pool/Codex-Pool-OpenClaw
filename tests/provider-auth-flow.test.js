import { describe, expect, test, vi } from "vitest";

import {
  normalizeCodexPoolBaseUrl,
  runCodexPoolProviderAuth
} from "../src/openclaw/provider-auth.js";

describe("normalizeCodexPoolBaseUrl", () => {
  test("会把 backend-api 变体收敛到 provider 级 baseUrl", () => {
    expect(normalizeCodexPoolBaseUrl("http://127.0.0.1:8091/backend-api/")).toBe(
      "http://127.0.0.1:8091"
    );
    expect(
      normalizeCodexPoolBaseUrl("http://127.0.0.1:8091/backend-api/codex/responses")
    ).toBe("http://127.0.0.1:8091");
  });
});

describe("runCodexPoolProviderAuth", () => {
  test("输出 codex-pool 的官方 provider configPatch 与 defaultModel", async () => {
    const answers = [
      "http://127.0.0.1:8091/backend-api",
      "cp_test_key",
      "gpt-5.4, gpt-5.4-mini"
    ];
    const prompter = {
      text: vi.fn().mockImplementation(async () => answers.shift()),
      note: vi.fn(),
      progress: vi.fn()
    };

    const result = await runCodexPoolProviderAuth({
      config: {},
      prompter
    });

    expect(prompter.text).toHaveBeenCalledTimes(3);
    expect(result.profiles).toEqual([
      {
        profileId: "codex-pool:local",
        credential: {
          type: "token",
          provider: "codex-pool",
          token: "cp_test_key"
        }
      }
    ]);
    expect(result.configPatch.models.providers["codex-pool"]).toMatchObject({
      baseUrl: "http://127.0.0.1:8091",
      apiKey: "cp_test_key",
      api: "openai-codex-responses"
    });
    expect(
      result.configPatch.models.providers["codex-pool"].models.map((model) => model.id)
    ).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(result.defaultModel).toBe("codex-pool/gpt-5.4");
    expect(result.notes.some((note) => note.includes("openclaw logs --follow"))).toBe(
      true
    );
  });
});
