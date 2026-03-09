import { convertResponsesMessages, convertResponsesTools } from "./responses-shared.js";

const CODEX_TOOL_CALL_PROVIDERS = new Set([
  "openai",
  "openai-codex",
  "opencode",
  "codex-pool",
  "cp"
]);

function normalizeBaseUrl(baseUrl) {
  return (baseUrl ?? "").replace(/\/+$/, "");
}

function clampReasoningEffortForCodexPool(modelId, effort) {
  const id = modelId.includes("/") ? modelId.split("/").pop() : modelId;

  if ((id.startsWith("gpt-5.2") || id.startsWith("gpt-5.3")) && effort === "minimal") {
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

export function resolveCodexPoolUrl(baseUrl, { pathMode = "codex" } = {}) {
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

export function buildCodexPoolRequestBody(model, context, options = {}) {
  const messages = convertResponsesMessages(model, context, CODEX_TOOL_CALL_PROVIDERS, {
    includeSystemPrompt: false
  });
  const body = {
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
      effort: clampReasoningEffortForCodexPool(model.id, options.reasoningEffort),
      summary: options.reasoningSummary ?? "auto"
    };
  }

  return body;
}
