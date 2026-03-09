import { afterEach, describe, expect, test, vi } from "vitest";

const registerState = vi.hoisted(() => ({
  register: vi.fn()
}));

vi.mock("../src/plugin/register.js", () => ({
  CODEX_POOL_CODEX_API: "codex-pool-codex",
  OPENCLAW_COMPAT_API: "openai-codex-responses",
  DEFAULT_REGISTRY_SOURCE: "codex-pool-openclaw",
  registerCodexPoolCodexProviderInPiAi: registerState.register
}));

describe("preload entry", () => {
  afterEach(() => {
    registerState.register.mockReset();
    delete process.env.CODEX_POOL_OPENCLAW_API;
    delete process.env.CODEX_POOL_OPENCLAW_SOURCE;
    delete process.env.CODEX_POOL_OPENCLAW_PATH_MODE;
    vi.resetModules();
  });

  test("导入时自动注册 provider，并读取可选环境变量", async () => {
    process.env.CODEX_POOL_OPENCLAW_API = "cp-codex-custom";
    process.env.CODEX_POOL_OPENCLAW_SOURCE = "custom-source";
    process.env.CODEX_POOL_OPENCLAW_PATH_MODE = "responses";

    registerState.register.mockResolvedValue(true);

    await import("../src/preload.js");

    expect(registerState.register).toHaveBeenCalledWith({
      api: "cp-codex-custom",
      source: "custom-source",
      pathMode: "responses"
    });
  });

  test("未设置环境变量时默认覆盖合法的 openai-codex-responses", async () => {
    registerState.register.mockResolvedValue(true);

    await import("../src/preload.js");

    expect(registerState.register).toHaveBeenCalledWith({
      api: "openai-codex-responses",
      source: "codex-pool-openclaw",
      pathMode: undefined
    });
  });
});
