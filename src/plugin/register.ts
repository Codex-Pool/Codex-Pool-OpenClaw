import {
  streamCodexPoolCodexResponses,
  streamSimpleCodexPoolCodexResponses
} from "../provider/stream.js";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CODEX_POOL_CODEX_API = "codex-pool-codex";
export const OPENCLAW_COMPAT_API = "openai-codex-responses";
export const DEFAULT_REGISTRY_SOURCE = "codex-pool-openclaw";

type AnyRecord = Record<string, any>;

type ApiProviderLike = {
  api: string;
  stream(model: AnyRecord, context: AnyRecord, options?: AnyRecord): unknown;
  streamSimple?(
    model: AnyRecord,
    context: AnyRecord,
    options?: AnyRecord
  ): unknown;
};

type PiAiRegistryLike = {
  getApiProvider(api: string): ApiProviderLike | undefined;
  registerApiProvider(provider: ApiProviderLike, source?: string): void;
};

type RegisterOptions = {
  registry?: PiAiRegistryLike;
  source?: string;
  api?: string;
  overrideExisting?: boolean;
  codexProvider?: ApiProviderLike;
  fallbackProvider?: ApiProviderLike;
  [key: string]: any;
};

let defaultProvider: ApiProviderLike | undefined;
const requireFromModule = createRequire(import.meta.url);

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeText(hostname).toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1"
  );
}

function isLoopbackBaseUrl(baseUrl: unknown): boolean {
  const raw = normalizeText(baseUrl);
  if (!raw) {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function shouldRouteThroughCodexPool(
  model: AnyRecord = {},
  options: AnyRecord = {}
): boolean {
  const providerId = normalizeText(model.provider).toLowerCase();
  const baseUrl = normalizeText(model.baseUrl);
  const apiKey = normalizeText(options.apiKey);

  if (providerId === "codex-pool") {
    return true;
  }

  if (apiKey.startsWith("cp_")) {
    return true;
  }

  if (!isLoopbackBaseUrl(baseUrl)) {
    return false;
  }

  if (providerId === "cp") {
    return true;
  }

  return (
    /\/backend-api(?:\/codex(?:\/responses)?)?$/i.test(baseUrl) ||
    /\/v1(?:\/responses)?$/i.test(baseUrl)
  );
}

function omitUndefinedEntries<T extends Record<string, unknown>>(
  value: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

function createStreamHandler(
  streamImpl: (...args: any[]) => unknown,
  defaultOptions: AnyRecord = {}
): (model: AnyRecord, context: AnyRecord, options?: AnyRecord) => unknown {
  return (model, context, options = {}) =>
    streamImpl(model, context, {
      ...defaultOptions,
      ...options
    });
}

function normalizeRegistry(
  registry: PiAiRegistryLike | undefined
): PiAiRegistryLike {
  if (
    !registry ||
    typeof registry.getApiProvider !== "function" ||
    typeof registry.registerApiProvider !== "function"
  ) {
    throw new Error(
      "A registry with getApiProvider() and registerApiProvider() is required"
    );
  }

  return registry;
}

function getDefaultGlobalNodeModulesRoot(execPath = process.execPath): string {
  return path.join(path.dirname(path.dirname(execPath)), "lib", "node_modules");
}

function buildDefaultPiAiSpecifiers({
  execPath = process.execPath,
  env = process.env
}: {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string[] {
  const globalNodeModules =
    env.OPENCLAW_NODE_MODULES?.trim() ||
    getDefaultGlobalNodeModulesRoot(execPath);
  const specifiers = [
    "@mariozechner/pi-ai",
    pathToFileURL(
      path.join(globalNodeModules, "@mariozechner", "pi-ai", "dist", "index.js")
    ).href,
    pathToFileURL(
      path.join(
        globalNodeModules,
        "openclaw",
        "node_modules",
        "@mariozechner",
        "pi-ai",
        "dist",
        "index.js"
      )
    ).href
  ];

  return Array.from(new Set(specifiers));
}

export async function loadPiAiRegistry({
  candidateSpecifiers = buildDefaultPiAiSpecifiers(),
  importModule = (specifier: string) => import(specifier)
}: {
  candidateSpecifiers?: string[];
  importModule?: (specifier: string) => Promise<AnyRecord>;
} = {}): Promise<PiAiRegistryLike> {
  let lastError: unknown;

  for (const specifier of candidateSpecifiers) {
    try {
      const mod = await importModule(specifier);
      return {
        getApiProvider: mod.getApiProvider,
        registerApiProvider: mod.registerApiProvider
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to load @mariozechner/pi-ai runtime registry: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function buildDefaultPiAiRequireSpecifiers({
  execPath = process.execPath,
  env = process.env
}: {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string[] {
  const globalNodeModules =
    env.OPENCLAW_NODE_MODULES?.trim() ||
    getDefaultGlobalNodeModulesRoot(execPath);

  return [
    "@mariozechner/pi-ai",
    path.join(globalNodeModules, "@mariozechner", "pi-ai", "dist", "index.js"),
    path.join(
      globalNodeModules,
      "openclaw",
      "node_modules",
      "@mariozechner",
      "pi-ai",
      "dist",
      "index.js"
    )
  ];
}

export function loadPiAiRegistrySync({
  candidateSpecifiers = buildDefaultPiAiRequireSpecifiers(),
  requireModule = (specifier: string) => requireFromModule(specifier)
}: {
  candidateSpecifiers?: string[];
  requireModule?: (specifier: string) => AnyRecord;
} = {}): PiAiRegistryLike {
  let lastError: unknown;

  for (const specifier of candidateSpecifiers) {
    try {
      const mod = requireModule(specifier);
      return {
        getApiProvider: mod.getApiProvider,
        registerApiProvider: mod.registerApiProvider
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to synchronously load @mariozechner/pi-ai runtime registry: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

export function createCodexPoolCodexProvider(
  options: RegisterOptions = {}
): ApiProviderLike {
  const { api = CODEX_POOL_CODEX_API, ...rawStreamOptions } = options;
  const streamOptions = { ...rawStreamOptions };

  delete streamOptions.registry;
  delete streamOptions.source;
  delete streamOptions.api;

  const normalizedStreamOptions = omitUndefinedEntries(streamOptions);
  const isDefaultProvider =
    api === CODEX_POOL_CODEX_API &&
    Object.keys(normalizedStreamOptions).length === 0;

  if (isDefaultProvider) {
    if (!defaultProvider) {
      const stream = createStreamHandler(streamCodexPoolCodexResponses);
      const streamSimple = createStreamHandler(
        streamSimpleCodexPoolCodexResponses
      );
      defaultProvider = {
        api,
        stream,
        streamSimple
      };
    }

    return defaultProvider;
  }

  const stream = createStreamHandler(
    streamCodexPoolCodexResponses,
    normalizedStreamOptions
  );
  const streamSimple = createStreamHandler(
    streamSimpleCodexPoolCodexResponses,
    normalizedStreamOptions
  );
  return {
    api,
    stream,
    streamSimple
  };
}

export function createOpenClawCompatibleProvider({
  api = OPENCLAW_COMPAT_API,
  codexProvider,
  fallbackProvider
}: {
  api?: string;
  codexProvider?: ApiProviderLike;
  fallbackProvider?: ApiProviderLike;
} = {}): ApiProviderLike {
  if (!codexProvider) {
    throw new Error("codexProvider is required");
  }

  const delegate = (
    method: "stream" | "streamSimple",
    model: AnyRecord,
    context: AnyRecord,
    options?: AnyRecord
  ) => {
    if (shouldRouteThroughCodexPool(model, options)) {
      return codexProvider[method]?.(model, context, options);
    }

    if (fallbackProvider?.[method]) {
      return fallbackProvider[method]?.(model, context, options);
    }

    return codexProvider[method]?.(model, context, options);
  };

  return {
    api,
    stream: (model, context, options) =>
      delegate("stream", model, context, options),
    streamSimple: (model, context, options) =>
      delegate("streamSimple", model, context, options)
  };
}

export function registerCodexPoolCodexProvider({
  registry,
  source = DEFAULT_REGISTRY_SOURCE,
  api = OPENCLAW_COMPAT_API,
  overrideExisting = true,
  codexProvider,
  fallbackProvider,
  ...providerOptions
}: RegisterOptions = {}): boolean {
  const resolvedRegistry = normalizeRegistry(registry);
  const existingProvider = resolvedRegistry.getApiProvider(api);

  if (existingProvider && !overrideExisting) {
    return false;
  }

  const provider =
    codexProvider ??
    createCodexPoolCodexProvider({
      api,
      ...providerOptions
    });
  const compatibleProvider =
    existingProvider || fallbackProvider
      ? createOpenClawCompatibleProvider({
          api,
          codexProvider: provider,
          fallbackProvider: fallbackProvider ?? existingProvider
        })
      : provider;

  resolvedRegistry.registerApiProvider(compatibleProvider, source);
  return true;
}

export async function registerCodexPoolCodexProviderInPiAi(
  options: RegisterOptions = {}
): Promise<boolean> {
  const registry = options.registry ?? (await loadPiAiRegistry());
  return registerCodexPoolCodexProvider({
    ...options,
    registry
  });
}
