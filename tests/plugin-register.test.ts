import { describe, expect, test, vi } from "vitest";

describe("registerCodexPoolCodexProvider", () => {
  test("默认 provider 会暴露独立的 stream 与 streamSimple", async () => {
    const { createCodexPoolCodexProvider } =
      await import("../src/plugin/register.js");

    const provider = createCodexPoolCodexProvider();

    expect(provider.stream).toBeTypeOf("function");
    expect(provider.streamSimple).toBeTypeOf("function");
    expect(provider.streamSimple).not.toBe(provider.stream);
  });

  test("会判断哪些请求该走 Codex-Pool 兼容层", async () => {
    const { shouldRouteThroughCodexPool } =
      await import("../src/plugin/register.js");

    expect(
      shouldRouteThroughCodexPool({
        provider: "codex-pool",
        baseUrl: "http://127.0.0.1:8091",
        api: "openai-codex-responses"
      })
    ).toBe(true);
    expect(
      shouldRouteThroughCodexPool({
        provider: "cp",
        baseUrl: "http://127.0.0.1:8091/backend-api",
        api: "openai-codex-responses"
      })
    ).toBe(true);
    expect(
      shouldRouteThroughCodexPool({
        provider: "openai-codex",
        baseUrl: "https://chatgpt.com/backend-api",
        api: "openai-codex-responses"
      })
    ).toBe(false);
  });

  test("注册后会覆盖 openai-codex-responses 并保留 fallback", async () => {
    const { createOpenClawCompatibleProvider, registerCodexPoolCodexProvider } =
      await import("../src/plugin/register.js");

    const fallbackProvider = {
      api: "openai-codex-responses",
      stream: vi.fn(() => "fallback-stream"),
      streamSimple: vi.fn(() => "fallback-simple")
    };
    const codexProvider = {
      api: "openai-codex-responses",
      stream: vi.fn(() => "cp-stream"),
      streamSimple: vi.fn(() => "cp-simple")
    };
    const registry = {
      getApiProvider: vi.fn().mockReturnValue(fallbackProvider),
      registerApiProvider: vi.fn()
    };

    const registered = registerCodexPoolCodexProvider({
      registry,
      codexProvider
    });

    expect(registered).toBe(true);
    expect(registry.getApiProvider).toHaveBeenCalledWith(
      "openai-codex-responses"
    );
    expect(registry.registerApiProvider).toHaveBeenCalledTimes(1);

    const provider = registry.registerApiProvider.mock.calls[0][0];
    const expectedProvider = createOpenClawCompatibleProvider({
      codexProvider,
      fallbackProvider
    });
    expect(provider.api).toBe(expectedProvider.api);
    expect(provider.stream).toBeTypeOf("function");
    expect(provider.streamSimple).toBeTypeOf("function");

    const codexPoolModel = {
      id: "gpt-5.4",
      provider: "codex-pool",
      api: "openai-codex-responses",
      baseUrl: "http://127.0.0.1:8091"
    };
    const foreignModel = {
      id: "gpt-5.4",
      provider: "openai-codex",
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api"
    };
    const context = { messages: [] };
    const cpOptions = { apiKey: "cp_test_key" };
    const foreignOptions = { apiKey: "eyJ.jwt.token" };

    expect(provider.streamSimple(codexPoolModel, context, cpOptions)).toBe(
      "cp-simple"
    );
    expect(provider.streamSimple(foreignModel, context, foreignOptions)).toBe(
      "fallback-simple"
    );
    expect(codexProvider.streamSimple).toHaveBeenCalledWith(
      codexPoolModel,
      context,
      cpOptions
    );
    expect(fallbackProvider.streamSimple).toHaveBeenCalledWith(
      foreignModel,
      context,
      foreignOptions
    );
  });

  test("显式禁止覆盖时，已有 provider 会跳过注册", async () => {
    const { registerCodexPoolCodexProvider } =
      await import("../src/plugin/register.js");

    const registry = {
      getApiProvider: vi
        .fn()
        .mockReturnValue({ api: "openai-codex-responses" }),
      registerApiProvider: vi.fn()
    };

    const registered = registerCodexPoolCodexProvider({
      registry,
      overrideExisting: false
    });

    expect(registered).toBe(false);
    expect(registry.registerApiProvider).not.toHaveBeenCalled();
  });

  test("没有 fallback 时会直接注册 codex provider", async () => {
    const { registerCodexPoolCodexProvider } =
      await import("../src/plugin/register.js");

    const codexProvider = {
      api: "openai-codex-responses",
      stream: vi.fn(() => "cp-stream"),
      streamSimple: vi.fn(() => "cp-simple")
    };
    const registry = {
      getApiProvider: vi.fn().mockReturnValue(undefined),
      registerApiProvider: vi.fn()
    };

    const registered = registerCodexPoolCodexProvider({
      registry,
      codexProvider
    });

    expect(registered).toBe(true);
    expect(registry.registerApiProvider).toHaveBeenCalledWith(
      codexProvider,
      "codex-pool-openclaw"
    );
  });
});

describe("loadPiAiRegistry", () => {
  test("会按候选顺序尝试导入并返回 registry 接口", async () => {
    const { loadPiAiRegistry } = await import("../src/plugin/register.js");

    const imported = [];
    const registryModule = {
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    };

    const registry = await loadPiAiRegistry({
      candidateSpecifiers: ["missing-module", "file:///fallback-pi-ai.js"],
      importModule: async (specifier) => {
        imported.push(specifier);

        if (specifier === "file:///fallback-pi-ai.js") {
          return registryModule;
        }

        throw new Error(`Cannot import ${specifier}`);
      }
    });

    expect(imported).toEqual(["missing-module", "file:///fallback-pi-ai.js"]);
    expect(registry.getApiProvider).toBe(registryModule.getApiProvider);
    expect(registry.registerApiProvider).toBe(
      registryModule.registerApiProvider
    );
  });

  test("全部候选都失败时抛出可读错误", async () => {
    const { loadPiAiRegistry } = await import("../src/plugin/register.js");

    await expect(
      loadPiAiRegistry({
        candidateSpecifiers: ["missing-only"],
        importModule: async () => {
          throw new Error("missing");
        }
      })
    ).rejects.toThrow("Unable to load @mariozechner/pi-ai runtime registry");
  });
});

describe("loadPiAiRegistrySync", () => {
  test("会按候选顺序同步 require 并返回 registry 接口", async () => {
    const { loadPiAiRegistrySync } = await import("../src/plugin/register.js");

    const imported = [];
    const registryModule = {
      getApiProvider: vi.fn(),
      registerApiProvider: vi.fn()
    };

    const registry = loadPiAiRegistrySync({
      candidateSpecifiers: ["missing-sync", "/tmp/fallback-pi-ai.js"],
      requireModule: (specifier) => {
        imported.push(specifier);

        if (specifier === "/tmp/fallback-pi-ai.js") {
          return registryModule;
        }

        throw new Error(`Cannot require ${specifier}`);
      }
    });

    expect(imported).toEqual(["missing-sync", "/tmp/fallback-pi-ai.js"]);
    expect(registry.getApiProvider).toBe(registryModule.getApiProvider);
    expect(registry.registerApiProvider).toBe(
      registryModule.registerApiProvider
    );
  });

  test("同步候选都失败时抛出可读错误", async () => {
    const { loadPiAiRegistrySync } = await import("../src/plugin/register.js");

    expect(() =>
      loadPiAiRegistrySync({
        candidateSpecifiers: ["missing-sync-only"],
        requireModule: () => {
          throw new Error("missing sync");
        }
      })
    ).toThrow(
      "Unable to synchronously load @mariozechner/pi-ai runtime registry"
    );
  });
});

describe("registerCodexPoolCodexProviderInPiAi", () => {
  test("传入 registry 时会委托给 register 逻辑完成注册", async () => {
    const registry = {
      getApiProvider: vi.fn().mockReturnValue(undefined),
      registerApiProvider: vi.fn()
    };
    const { registerCodexPoolCodexProviderInPiAi } =
      await import("../src/plugin/register.js");

    const registered = await registerCodexPoolCodexProviderInPiAi({ registry });

    expect(registered).toBe(true);
    expect(registry.registerApiProvider).toHaveBeenCalledTimes(1);
  });
});

describe("package entry", () => {
  test("暴露默认注册函数与显式导出", async () => {
    const mod = await import("../index.js");

    expect(mod.default).toBe(mod.registerCodexPoolCodexProvider);
    expect(mod.createCodexPoolCodexProvider).toBeTypeOf("function");
  });
});
