import {
  convertResponsesMessages,
  convertResponsesTools
} from "./responses-shared.js";

const CODEX_TOOL_CALL_PROVIDERS = new Set([
  "openai",
  "openai-codex",
  "opencode",
  "codex-pool",
  "cp"
] as const);

type CodexPoolModel = {
  id: string;
  [key: string]: unknown;
};

type CodexPoolContext = {
  systemPrompt?: string;
  messages?: Record<string, unknown>[];
  tools?: Record<string, unknown>[];
};

type CodexPoolRequestOptions = {
  pathMode?: "codex" | "responses";
  textVerbosity?: string;
  sessionId?: string;
  temperature?: number;
  reasoningEffort?: string;
  reasoningSummary?: string;
};

type CodexPoolRequestBody = {
  model: string;
  store: false;
  stream: true;
  instructions: string;
  input: unknown;
  text: {
    verbosity: string;
  };
  include: string[];
  prompt_cache_key?: string;
  tool_choice: "auto";
  parallel_tool_calls: true;
  temperature?: number;
  tools?: unknown;
  reasoning?: {
    effort: string | undefined;
    summary: string;
  };
};

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? "").replace(/\/+$/, "");
}

function clampReasoningEffortForCodexPool(
  modelId: string,
  effort?: string
): string | undefined {
  const id = modelId.includes("/")
    ? (modelId.split("/").pop() ?? modelId)
    : modelId;

  if (
    (id.startsWith("gpt-5.2") || id.startsWith("gpt-5.3")) &&
    effort === "minimal"
  ) {
    return "low";
  }

  if (id === "gpt-5.1" && effort === "xhigh") {
    return "high";
  }

  if (id === "gpt-5.1-codex-mini") {
    return effort === "high" || effort === "xhigh" ? "high" : "medium";
  }

  return effort;
}

export function resolveCodexPoolUrl(
  baseUrl: string,
  { pathMode = "codex" }: Pick<CodexPoolRequestOptions, "pathMode"> = {}
): string {
  const normalized = normalizeBaseUrl(baseUrl);

  if (pathMode === "responses") {
    if (normalized.endsWith("/v1")) {
      return `${normalized}/responses`;
    }

    return `${normalized}/v1/responses`;
  }

  if (normalized.endsWith("/backend-api/codex/responses")) {
    return normalized;
  }

  if (normalized.endsWith("/backend-api/codex")) {
    return `${normalized}/responses`;
  }

  if (normalized.endsWith("/backend-api")) {
    return `${normalized}/codex/responses`;
  }

  return `${normalized}/backend-api/codex/responses`;
}

export function buildCodexPoolRequestBody(
  model: CodexPoolModel,
  context: CodexPoolContext,
  options: CodexPoolRequestOptions = {}
): CodexPoolRequestBody {
  const messages = convertResponsesMessages(
    model,
    context,
    CODEX_TOOL_CALL_PROVIDERS,
    {
      includeSystemPrompt: false
    }
  );
  const body: CodexPoolRequestBody = {
    model: model.id,
    store: false,
    stream: true,
    instructions: context.systemPrompt ?? "",
    input: messages,
    text: { verbosity: options.textVerbosity ?? "medium" },
    include: ["reasoning.encrypted_content"],
    prompt_cache_key: options.sessionId,
    tool_choice: "auto",
    parallel_tool_calls: true
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  if (context.tools) {
    body.tools = convertResponsesTools(context.tools, { strict: null });
  }

  if (options.reasoningEffort !== undefined) {
    body.reasoning = {
      effort: clampReasoningEffortForCodexPool(
        model.id,
        options.reasoningEffort
      ),
      summary: options.reasoningSummary ?? "auto"
    };
  }

  return body;
}
