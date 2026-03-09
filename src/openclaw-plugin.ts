import {
  loadPiAiRegistrySync,
  registerCodexPoolCodexProvider
} from "./plugin/register.js";
import { runCodexPoolProviderAuth } from "./openclaw/provider-auth.js";

type ProviderAuthRun = typeof runCodexPoolProviderAuth;

type ProviderRegistration = {
  id: string;
  label: string;
  docsPath: string;
  auth: Array<{
    id: string;
    label: string;
    hint: string;
    kind: "custom";
    run: ProviderAuthRun;
  }>;
};

type OpenClawPluginApi = {
  registerProvider(provider: ProviderRegistration): void;
};

type RuntimeRegistry = {
  getApiProvider(api: string): unknown;
  registerApiProvider(provider: unknown, source?: string): void;
};

const registerCodexPoolCodexProviderCompat =
  registerCodexPoolCodexProvider as unknown as (options: {
    registry: RuntimeRegistry;
  }) => boolean;

let runtimeRegistry: RuntimeRegistry | null = null;
let runtimeRegistryError: unknown = null;

try {
  runtimeRegistry = loadPiAiRegistrySync() as RuntimeRegistry;
} catch (error) {
  runtimeRegistryError = error;
}

function ensureRuntimeApiRegistered() {
  if (runtimeRegistryError) {
    throw runtimeRegistryError;
  }

  if (!runtimeRegistry) {
    throw new Error("Codex-Pool runtime registry is unavailable");
  }

  registerCodexPoolCodexProviderCompat({
    registry: runtimeRegistry
  });
}

const codexPoolProviderPlugin = {
  id: "codex-pool-openclaw",
  name: "Codex-Pool OpenClaw",
  description: "OpenClaw provider plugin for Codex-Pool Codex-style requests",
  register(api: OpenClawPluginApi) {
    ensureRuntimeApiRegistered();

    api.registerProvider({
      id: "codex-pool",
      label: "Codex-Pool",
      docsPath: "/providers/models",
      auth: [
        {
          id: "local",
          label: "Codex-Pool",
          hint: "Configure a local Codex-Pool endpoint with cp_* credentials",
          kind: "custom",
          run: runCodexPoolProviderAuth
        }
      ]
    });
  }
};

export default codexPoolProviderPlugin;
