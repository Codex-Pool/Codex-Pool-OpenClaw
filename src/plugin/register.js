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

let defaultProvider;
const requireFromModule = createRequire(import.meta.url);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isLoopbackHostname(hostname) {
  const normalized = normalizeText(hostname).toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isLoopbackBaseUrl(baseUrl) {
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

export function shouldRouteThroughCodexPool(model = {}, options = {}) {
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

  return /\/backend-api(?:\/codex(?:\/responses)?)?$/i.test(baseUrl) || /\/v1(?:\/responses)?$/i.test(baseUrl);
}

function omitUndefinedEntries(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function createStreamHandler(streamImpl, defaultOptions = {}) {
  return (model, context, options = {}) =>
    streamImpl(model, context, {
      ...defaultOptions,
      ...options
    });
}

function normalizeRegistry(registry) {
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

function getDefaultGlobalNodeModulesRoot(execPath = process.execPath) {
  return path.join(path.dirname(path.dirname(execPath)), "lib", "node_modules");
}

function buildDefaultPiAiSpecifiers({
  execPath = process.execPath,
  env = process.env
} = {}) {
  const globalNodeModules =
    env.OPENCLAW_NODE_MODULES?.trim() || getDefaultGlobalNodeModulesRoot(execPath);
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
  importModule = (specifier) => import(specifier)
} = {}) {
  let lastError;

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
} = {}) {
  const globalNodeModules =
    env.OPENCLAW_NODE_MODULES?.trim() || getDefaultGlobalNodeModulesRoot(execPath);

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
  requireModule = (specifier) => requireFromModule(specifier)
} = {}) {
  let lastError;

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

export function createCodexPoolCodexProvider(options = {}) {
  const {
    api = CODEX_POOL_CODEX_API,
    registry: _registry,
    source: _source,
    ...streamOptions
  } = options;

  const normalizedStreamOptions = omitUndefinedEntries(streamOptions);
  const isDefaultProvider =
    api === CODEX_POOL_CODEX_API && Object.keys(normalizedStreamOptions).length === 0;

  if (isDefaultProvider) {
    if (!defaultProvider) {
      const stream = createStreamHandler(streamCodexPoolCodexResponses);
      const streamSimple = createStreamHandler(streamSimpleCodexPoolCodexResponses);
      defaultProvider = {
        api,
        stream,
        streamSimple
      };
    }

    return defaultProvider;
  }

  const stream = createStreamHandler(streamCodexPoolCodexResponses, normalizedStreamOptions);
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
} = {}) {
  if (!codexProvider) {
    throw new Error("codexProvider is required");
  }

  const delegate = (method, model, context, options) => {
    if (shouldRouteThroughCodexPool(model, options)) {
      return codexProvider[method](model, context, options);
    }

    if (fallbackProvider?.[method]) {
      return fallbackProvider[method](model, context, options);
    }

    return codexProvider[method](model, context, options);
  };

  return {
    api,
    stream: (model, context, options) => delegate("stream", model, context, options),
    streamSimple: (model, context, options) => delegate("streamSimple", model, context, options)
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
} = {}) {
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

export async function registerCodexPoolCodexProviderInPiAi(options = {}) {
  const registry = options.registry ?? (await loadPiAiRegistry());
  return registerCodexPoolCodexProvider({
    ...options,
    registry
  });
}
