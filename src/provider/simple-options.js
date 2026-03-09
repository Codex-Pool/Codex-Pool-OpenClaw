export function buildBaseOptions(model, options, apiKey) {
  return {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens || Math.min(model.maxTokens ?? 32000, 32000),
    signal: options?.signal,
    apiKey: apiKey || options?.apiKey,
    cacheRetention: options?.cacheRetention,
    sessionId: options?.sessionId,
    headers: options?.headers,
    onPayload: options?.onPayload,
    maxRetryDelayMs: options?.maxRetryDelayMs,
    metadata: options?.metadata
  };
}

export function clampReasoning(effort) {
  return effort === "xhigh" ? "high" : effort;
}

export function supportsXhigh(model) {
  if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3")) {
    return true;
  }

  if (model.api === "anthropic-messages") {
    return model.id.includes("opus-4-6") || model.id.includes("opus-4.6");
  }

  return false;
}

export function calculateCost(model, usage) {
  const cost = model.cost ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0
  };

  usage.cost.input = (cost.input / 1000000) * usage.input;
  usage.cost.output = (cost.output / 1000000) * usage.output;
  usage.cost.cacheRead = (cost.cacheRead / 1000000) * usage.cacheRead;
  usage.cost.cacheWrite = (cost.cacheWrite / 1000000) * usage.cacheWrite;
  usage.cost.total =
    usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;

  return usage.cost;
}
