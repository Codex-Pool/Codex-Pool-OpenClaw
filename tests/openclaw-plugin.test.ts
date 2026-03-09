import { afterEach, describe, expect, test, vi } from "vitest";

const registerState = vi.hoisted(() => ({
  loadRuntimeRegistrySync: vi.fn(),
  registerRuntimeApi: vi.fn()
}));

vi.mock("../src/plugin/register.js", async () => {
  const actual = await vi.importActual("../src/plugin/register.js");
  return {
    ...actual,
    loadPiAiRegistrySync: registerState.loadRuntimeRegistrySync,
    registerCodexPoolCodexProvider: registerState.registerRuntimeApi
  };
});

describe("OpenClaw plugin entry", () => {
  afterEach(() => {
    registerState.loadRuntimeRegistrySync.mockReset();
    registerState.registerRuntimeApi.mockReset();
    vi.resetModules();
  });

  test("默认导出合法插件对象", async () => {
    registerState.loadRuntimeRegistrySync.mockReturnValue({
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    });
    const mod = await import("../src/openclaw-plugin.js");

    expect(mod.default).toMatchObject({
      id: "codex-pool-openclaw",
      name: "Codex-Pool OpenClaw",
      description: expect.any(String)
    });
    expect(mod.default.register).toBeTypeOf("function");
  });

  test("register(api) 会先注册运行时 API，再向 OpenClaw 注册 provider", async () => {
    registerState.loadRuntimeRegistrySync.mockReturnValue({
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    });
    const mod = await import("../src/openclaw-plugin.js");

    const api = {
      registerProvider: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    };

    const result = mod.default.register(api);

    expect(result).toBeUndefined();
    expect(registerState.registerRuntimeApi).toHaveBeenCalledTimes(1);
    expect(api.registerProvider).toHaveBeenCalledTimes(1);
  });

  test("注册的 provider 暴露 codex-pool custom auth flow", async () => {
    registerState.loadRuntimeRegistrySync.mockReturnValue({
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    });
    const mod = await import("../src/openclaw-plugin.js");

    const api = {
      registerProvider: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    };

    mod.default.register(api);

    const provider = api.registerProvider.mock.calls[0][0];
    expect(provider.id).toBe("codex-pool");
    expect(provider.label).toBe("Codex-Pool");
    expect(provider.auth).toHaveLength(1);
    expect(provider.auth[0]).toMatchObject({
      id: "local",
      kind: "custom",
      label: "Codex-Pool"
    });
    expect(provider.auth[0].run).toBeTypeOf("function");
  });

  test("模块加载阶段就会准备好 runtime registry，避免 async register 被 OpenClaw 忽略", async () => {
    const registry = {
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    };
    registerState.loadRuntimeRegistrySync.mockReturnValue(registry);

    const mod = await import("../src/openclaw-plugin.js");
    const api = {
      registerProvider: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    };

    mod.default.register(api);

    expect(registerState.loadRuntimeRegistrySync).toHaveBeenCalledTimes(1);
    expect(registerState.registerRuntimeApi).toHaveBeenCalledWith({ registry });
  });
});
