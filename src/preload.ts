import {
  DEFAULT_REGISTRY_SOURCE,
  OPENCLAW_COMPAT_API,
  registerCodexPoolCodexProviderInPiAi
} from "./plugin/register.js";

await registerCodexPoolCodexProviderInPiAi({
  api: process.env.CODEX_POOL_OPENCLAW_API?.trim() || OPENCLAW_COMPAT_API,
  source:
    process.env.CODEX_POOL_OPENCLAW_SOURCE?.trim() || DEFAULT_REGISTRY_SOURCE,
  pathMode: process.env.CODEX_POOL_OPENCLAW_PATH_MODE?.trim() || undefined
});
