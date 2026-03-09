import { OPENCLAW_COMPAT_API } from "../plugin/register.js";

const DEFAULT_PROVIDER_ID = "codex-pool";
const DEFAULT_PROFILE_ID = `${DEFAULT_PROVIDER_ID}:local`;
const DEFAULT_BASE_URL = "http://127.0.0.1:8091";
const DEFAULT_MODEL_IDS = ["gpt-5.4"];
const DEFAULT_CONTEXT_WINDOW = 272000;
const DEFAULT_MAX_TOKENS = 32768;
const DEFAULT_API = OPENCLAW_COMPAT_API;

type ProviderPrompter = {
  text(options: {
    message: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
};

type ProviderAuthContext = {
  prompter: ProviderPrompter;
};

type ModelDefinition = {
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
};

type ProviderAuthResult = {
  profiles: Array<{
    profileId: string;
    credential: {
      type: "token";
      provider: string;
      token: string;
    };
  }>;
  configPatch: {
    models: {
      providers: Record<
        string,
        {
          baseUrl: string;
          apiKey: string;
          api: string;
          models: ModelDefinition[];
        }
      >;
    };
    agents: {
      defaults: {
        models: Record<string, Record<string, never>>;
      };
    };
  };
  defaultModel: string;
  notes: string[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function buildModelDefinition(modelId: string): ModelDefinition {
  return {
    id: modelId,
    name: modelId,
    api: DEFAULT_API,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS
  };
}

function parseModelIds(raw: string): string[] {
  const normalized = raw
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function normalizeCodexPoolBaseUrl(rawValue: unknown): string {
  let normalized = normalizeText(rawValue) || DEFAULT_BASE_URL;
  normalized = normalized.replace(/\/+$/, "");
  normalized = normalized.replace(/\/backend-api\/codex\/responses$/i, "");
  normalized = normalized.replace(/\/backend-api\/codex$/i, "");
  normalized = normalized.replace(/\/backend-api$/i, "");
  return normalized;
}

export function buildCodexPoolProviderAuthResult({
  baseUrl,
  apiKey,
  modelIds
}: {
  baseUrl: string;
  apiKey: string;
  modelIds: string[];
}): ProviderAuthResult {
  const normalizedBaseUrl = normalizeCodexPoolBaseUrl(baseUrl);
  const normalizedModelIds = modelIds.length > 0 ? modelIds : DEFAULT_MODEL_IDS;
  const defaultModel = `${DEFAULT_PROVIDER_ID}/${normalizedModelIds[0]}`;

  return {
    profiles: [
      {
        profileId: DEFAULT_PROFILE_ID,
        credential: {
          type: "token",
          provider: DEFAULT_PROVIDER_ID,
          token: apiKey
        }
      }
    ],
    configPatch: {
      models: {
        providers: {
          [DEFAULT_PROVIDER_ID]: {
            baseUrl: normalizedBaseUrl,
            apiKey,
            api: DEFAULT_API,
            models: normalizedModelIds.map(buildModelDefinition)
          }
        }
      },
      agents: {
        defaults: {
          models: {
            [defaultModel]: {}
          }
        }
      }
    },
    defaultModel,
    notes: [
      "Codex-Pool provider 已写入配置；如需更新账号池，重新运行此登录流程即可。",
      "若请求异常，先检查 Codex-Pool 是否可达，再运行 `openclaw logs --follow` 查看运行时错误。"
    ]
  };
}

export async function runCodexPoolProviderAuth(
  ctx: ProviderAuthContext
): Promise<ProviderAuthResult> {
  const baseUrl = normalizeText(
    await ctx.prompter.text({
      message: "Codex-Pool base URL",
      initialValue: DEFAULT_BASE_URL,
      validate: (value) => (normalizeText(value) ? undefined : "Required")
    })
  );
  const apiKey = normalizeText(
    await ctx.prompter.text({
      message: "Codex-Pool API key",
      placeholder: "cp_xxx",
      validate: (value) =>
        normalizeText(value).startsWith("cp_")
          ? undefined
          : "Must start with cp_"
    })
  );
  const modelInput = normalizeText(
    await ctx.prompter.text({
      message: "Model IDs (comma-separated)",
      initialValue: DEFAULT_MODEL_IDS.join(", "),
      validate: (value) =>
        parseModelIds(normalizeText(value)).length > 0 ? undefined : "Required"
    })
  );

  return buildCodexPoolProviderAuthResult({
    baseUrl,
    apiKey,
    modelIds: parseModelIds(modelInput)
  });
}

export {
  DEFAULT_API as CODEX_POOL_DEFAULT_API,
  DEFAULT_BASE_URL as CODEX_POOL_DEFAULT_BASE_URL,
  DEFAULT_MODEL_IDS as CODEX_POOL_DEFAULT_MODEL_IDS,
  DEFAULT_PROVIDER_ID as CODEX_POOL_PROVIDER_ID
};
