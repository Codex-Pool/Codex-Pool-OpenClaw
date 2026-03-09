type ModelLike = {
  id: string;
  api?: string;
  maxTokens?: number;
  cost?: Partial<UsageCostBreakdown>;
};

type OptionsLike = {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
  cacheRetention?: unknown;
  sessionId?: string;
  headers?: HeadersInit;
  onPayload?: unknown;
  maxRetryDelayMs?: number;
  metadata?: unknown;
};

type BaseOptions = {
  temperature?: number;
  maxTokens: number;
  signal?: AbortSignal;
  apiKey?: string;
  cacheRetention?: unknown;
  sessionId?: string;
  headers?: HeadersInit;
  onPayload?: unknown;
  maxRetryDelayMs?: number;
  metadata?: unknown;
};

type UsageCostBreakdown = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

type UsageLike = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: UsageCostBreakdown;
};

export function buildBaseOptions(
  model: ModelLike,
  options?: OptionsLike,
  apiKey?: string
): BaseOptions {
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

export function clampReasoning(effort?: string): string | undefined {
  return effort === "xhigh" ? "high" : effort;
}

export function supportsXhigh(model: ModelLike): boolean {
  if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3")) {
    return true;
  }

  if (model.api === "anthropic-messages") {
    return model.id.includes("opus-4-6") || model.id.includes("opus-4.6");
  }

  return false;
}

export function calculateCost(
  model: ModelLike,
  usage: UsageLike
): UsageCostBreakdown {
  const cost = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    ...model.cost
  };

  usage.cost.input = (cost.input / 1000000) * usage.input;
  usage.cost.output = (cost.output / 1000000) * usage.output;
  usage.cost.cacheRead = (cost.cacheRead / 1000000) * usage.cacheRead;
  usage.cost.cacheWrite = (cost.cacheWrite / 1000000) * usage.cacheWrite;
  usage.cost.total =
    usage.cost.input +
    usage.cost.output +
    usage.cost.cacheRead +
    usage.cost.cacheWrite;

  return usage.cost;
}
