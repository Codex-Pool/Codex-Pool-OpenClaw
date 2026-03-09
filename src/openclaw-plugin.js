import {
  loadPiAiRegistrySync,
  registerCodexPoolCodexProvider
} from "./plugin/register.js";
import { runCodexPoolProviderAuth } from "./openclaw/provider-auth.js";

let runtimeRegistry = null;
let runtimeRegistryError = null;

try {
  runtimeRegistry = loadPiAiRegistrySync();
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

  registerCodexPoolCodexProvider({
    registry: runtimeRegistry
  });
}

const codexPoolProviderPlugin = {
  id: "codex-pool-openclaw",
  name: "Codex-Pool OpenClaw",
  description: "OpenClaw provider plugin for Codex-Pool Codex-style requests",
  register(api) {
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
