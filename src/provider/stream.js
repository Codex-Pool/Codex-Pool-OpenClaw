import { buildCodexPoolHeaders } from "./auth.js";
import { AssistantMessageEventStream } from "./event-stream.js";
import { buildCodexPoolRequestBody, resolveCodexPoolUrl } from "./request.js";
import { processResponsesStream } from "./responses-shared.js";
import { buildBaseOptions, clampReasoning, supportsXhigh } from "./simple-options.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const CODEX_RESPONSE_STATUSES = new Set([
  "completed",
  "incomplete",
  "failed",
  "cancelled",
  "queued",
  "in_progress"
]);
const OPENAI_BETA_RESPONSES_WEBSOCKETS = "responses_websockets=2026-02-06";
const SESSION_WEBSOCKET_CACHE_TTL_MS = 5 * 60 * 1000;
const websocketSessionCache = new Map();

function createOutput(model) {
  return {
    role: "assistant",
    content: [],
    api: "openai-codex-responses",
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "stop",
    timestamp: Date.now()
  };
}

function isRetryableError(status, errorText) {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  return /rate.?limit|overloaded|service.?unavailable|upstream.?connect|connection.?refused/i.test(
    errorText
  );
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request was aborted"));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Request was aborted"));
    });
  });
}

function resolveCodexPoolWebSocketUrl(baseUrl, pathMode) {
  const url = new URL(resolveCodexPoolUrl(baseUrl, { pathMode }));

  if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  }

  return url.toString();
}

async function parseErrorResponse(response) {
  const raw = await response.text();
  let message = raw || response.statusText || "Request failed";
  let friendlyMessage;

  try {
    const parsed = JSON.parse(raw);
    const err = parsed?.error;

    if (err) {
      const code = err.code || err.type || "";

      if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) || response.status === 429) {
        const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : "";
        const mins = err.resets_at
          ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
          : undefined;
        const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
        friendlyMessage = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
      }

      message = err.message || friendlyMessage || message;
    }
  } catch {}

  return { message, friendlyMessage };
}

async function* parseSSE(response) {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");

    while (index !== -1) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const dataLines = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length > 0) {
        const data = dataLines.join("\n").trim();

        if (data && data !== "[DONE]") {
          try {
            yield JSON.parse(data);
          } catch {}
        }
      }

      index = buffer.indexOf("\n\n");
    }
  }
}

async function* mapCodexEvents(events) {
  for await (const event of events) {
    const type = typeof event.type === "string" ? event.type : undefined;

    if (!type) {
      continue;
    }

    if (type === "error") {
      const code = event.code || "";
      const message = event.message || "";
      throw new Error(`Codex error: ${message || code || JSON.stringify(event)}`);
    }

    if (type === "response.failed") {
      const message = event.response?.error?.message;
      throw new Error(message || "Codex response failed");
    }

    if (type === "response.done" || type === "response.completed") {
      const response = event.response;
      const normalizedResponse = response
        ? { ...response, status: normalizeCodexStatus(response.status) }
        : response;
      yield { ...event, type: "response.completed", response: normalizedResponse };
      continue;
    }

    yield event;
  }
}

function normalizeCodexStatus(status) {
  if (typeof status !== "string") {
    return undefined;
  }

  return CODEX_RESPONSE_STATUSES.has(status) ? status : undefined;
}

function headersToRecord(headers) {
  const out = {};

  for (const [key, value] of headers.entries()) {
    out[key] = value;
  }

  return out;
}

function getWebSocketConstructor() {
  const ctor = globalThis.WebSocket;
  return typeof ctor === "function" ? ctor : null;
}

function getWebSocketReadyState(socket) {
  return typeof socket.readyState === "number" ? socket.readyState : undefined;
}

function isWebSocketReusable(socket) {
  const readyState = getWebSocketReadyState(socket);
  return readyState === undefined || readyState === 1;
}

function closeWebSocketSilently(socket, code = 1000, reason = "done") {
  try {
    socket.close(code, reason);
  } catch {}
}

function scheduleSessionWebSocketExpiry(sessionId, entry) {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }

  entry.idleTimer = setTimeout(() => {
    if (entry.busy) {
      return;
    }

    closeWebSocketSilently(entry.socket, 1000, "idle_timeout");
    websocketSessionCache.delete(sessionId);
  }, SESSION_WEBSOCKET_CACHE_TTL_MS);
}

function extractWebSocketError(event) {
  if (event && typeof event === "object" && "message" in event) {
    const message = event.message;
    if (typeof message === "string" && message.length > 0) {
      return new Error(message);
    }
  }

  return new Error("WebSocket error");
}

function extractWebSocketCloseError(event) {
  if (event && typeof event === "object") {
    const code = "code" in event ? event.code : undefined;
    const reason = "reason" in event ? event.reason : undefined;
    const codeText = typeof code === "number" ? ` ${code}` : "";
    const reasonText = typeof reason === "string" && reason.length > 0 ? ` ${reason}` : "";
    return new Error(`WebSocket closed${codeText}${reasonText}`.trim());
  }

  return new Error("WebSocket closed");
}

async function decodeWebSocketData(data) {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }

  if (data && typeof data === "object" && "arrayBuffer" in data) {
    const arrayBuffer = await data.arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(arrayBuffer));
  }

  return null;
}

async function connectWebSocket(url, headers, signal) {
  const WebSocketCtor = getWebSocketConstructor();

  if (!WebSocketCtor) {
    throw new Error("WebSocket transport is not available in this runtime");
  }

  const websocketHeaders = headersToRecord(headers);
  websocketHeaders["OpenAI-Beta"] = OPENAI_BETA_RESPONSES_WEBSOCKETS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;

    try {
      socket = new WebSocketCtor(url, { headers: websocketHeaders });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const onOpen = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(socket);
    };
    const onError = (event) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(extractWebSocketError(event));
    };
    const onClose = (event) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(extractWebSocketCloseError(event));
    };
    const onAbort = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      socket.close(1000, "aborted");
      reject(new Error("Request was aborted"));
    };
    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
    signal?.addEventListener("abort", onAbort);
  });
}

async function acquireWebSocket(url, headers, sessionId, signal) {
  if (!sessionId) {
    const socket = await connectWebSocket(url, headers, signal);
    return {
      socket,
      release: ({ keep } = {}) => {
        if (keep === false) {
          closeWebSocketSilently(socket);
          return;
        }

        closeWebSocketSilently(socket);
      }
    };
  }

  const cached = websocketSessionCache.get(sessionId);
  if (cached) {
    if (cached.idleTimer) {
      clearTimeout(cached.idleTimer);
      cached.idleTimer = undefined;
    }

    if (!cached.busy && isWebSocketReusable(cached.socket)) {
      cached.busy = true;
      return {
        socket: cached.socket,
        release: ({ keep } = {}) => {
          if (!keep || !isWebSocketReusable(cached.socket)) {
            closeWebSocketSilently(cached.socket);
            websocketSessionCache.delete(sessionId);
            return;
          }

          cached.busy = false;
          scheduleSessionWebSocketExpiry(sessionId, cached);
        }
      };
    }

    if (cached.busy) {
      const socket = await connectWebSocket(url, headers, signal);
      return {
        socket,
        release: () => {
          closeWebSocketSilently(socket);
        }
      };
    }

    if (!isWebSocketReusable(cached.socket)) {
      closeWebSocketSilently(cached.socket);
      websocketSessionCache.delete(sessionId);
    }
  }

  const socket = await connectWebSocket(url, headers, signal);
  const entry = { socket, busy: true };
  websocketSessionCache.set(sessionId, entry);

  return {
    socket,
    release: ({ keep } = {}) => {
      if (!keep || !isWebSocketReusable(entry.socket)) {
        closeWebSocketSilently(entry.socket);
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
        }

        if (websocketSessionCache.get(sessionId) === entry) {
          websocketSessionCache.delete(sessionId);
        }

        return;
      }

      entry.busy = false;
      scheduleSessionWebSocketExpiry(sessionId, entry);
    }
  };
}

async function* parseWebSocket(socket, signal) {
  const queue = [];
  let pending = null;
  let done = false;
  let failed = null;
  let sawCompletion = false;
  const wake = () => {
    if (!pending) {
      return;
    }

    const resolve = pending;
    pending = null;
    resolve();
  };
  const onMessage = (event) => {
    void (async () => {
      if (!event || typeof event !== "object" || !("data" in event)) {
        return;
      }

      const text = await decodeWebSocketData(event.data);
      if (!text) {
        return;
      }

      try {
        const parsed = JSON.parse(text);
        const type = typeof parsed.type === "string" ? parsed.type : "";

        if (type === "response.completed" || type === "response.done") {
          sawCompletion = true;
          done = true;
        }

        queue.push(parsed);
        wake();
      } catch {}
    })();
  };
  const onError = (event) => {
    failed = extractWebSocketError(event);
    done = true;
    wake();
  };
  const onClose = (event) => {
    if (sawCompletion) {
      done = true;
      wake();
      return;
    }

    if (!failed) {
      failed = extractWebSocketCloseError(event);
    }

    done = true;
    wake();
  };
  const onAbort = () => {
    failed = new Error("Request was aborted");
    done = true;
    wake();
  };

  socket.addEventListener("message", onMessage);
  socket.addEventListener("error", onError);
  socket.addEventListener("close", onClose);
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Request was aborted");
      }

      if (queue.length > 0) {
        yield queue.shift();
        continue;
      }

      if (done) {
        break;
      }

      await new Promise((resolve) => {
        pending = resolve;
      });
    }

    if (failed) {
      throw failed;
    }

    if (!sawCompletion) {
      throw new Error("WebSocket stream closed before response.completed");
    }
  } finally {
    socket.removeEventListener("message", onMessage);
    socket.removeEventListener("error", onError);
    socket.removeEventListener("close", onClose);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function processWebSocketStream(url, body, headers, output, stream, model, onStart, options) {
  const { socket, release } = await acquireWebSocket(url, headers, options?.sessionId, options?.signal);
  let keepConnection = true;

  try {
    socket.send(JSON.stringify({ type: "response.create", ...body }));
    onStart();
    stream.push({ type: "start", partial: output });
    await processResponsesStream(mapCodexEvents(parseWebSocket(socket, options?.signal)), output, stream, model);

    if (options?.signal?.aborted) {
      keepConnection = false;
    }
  } catch (error) {
    keepConnection = false;
    throw error;
  } finally {
    release({ keep: keepConnection });
  }
}

export function streamCodexPoolCodexResponses(model, context, options = {}) {
  const stream = new AssistantMessageEventStream();

  (async () => {
    const output = createOutput(model);

    try {
      const apiKey = options?.apiKey || "";
      if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
      }

      const body = buildCodexPoolRequestBody(model, context, options);
      options?.onPayload?.(body);
      const headers = buildCodexPoolHeaders({
        initHeaders: model.headers,
        apiKey,
        chatgptAccountId: options?.chatgptAccountId,
        extraHeaders: options?.headers,
        sessionId: options?.sessionId
      });
      const bodyJson = JSON.stringify(body);
      const transport = options?.transport || "sse";

      if (transport !== "sse") {
        let websocketStarted = false;

        try {
          await processWebSocketStream(
            resolveCodexPoolWebSocketUrl(model.baseUrl, options?.pathMode),
            body,
            headers,
            output,
            stream,
            model,
            () => {
              websocketStarted = true;
            },
            options
          );

          if (options?.signal?.aborted) {
            throw new Error("Request was aborted");
          }

          stream.push({
            type: "done",
            reason: output.stopReason,
            message: output
          });
          stream.end();
          return;
        } catch (error) {
          if (transport === "websocket" || websocketStarted) {
            throw error;
          }
        }
      }

      let response;
      let lastError;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        if (options?.signal?.aborted) {
          throw new Error("Request was aborted");
        }

        try {
          response = await fetch(resolveCodexPoolUrl(model.baseUrl, { pathMode: options?.pathMode }), {
            method: "POST",
            headers,
            body: bodyJson,
            signal: options?.signal
          });

          if (response.ok) {
            break;
          }

          const errorText = await response.text();
          if (attempt < MAX_RETRIES && isRetryableError(response.status, errorText)) {
            const delayMs = BASE_DELAY_MS * 2 ** attempt;
            await sleep(delayMs, options?.signal);
            continue;
          }

          const fakeResponse = new Response(errorText, {
            status: response.status,
            statusText: response.statusText
          });
          const info = await parseErrorResponse(fakeResponse);
          throw new Error(info.friendlyMessage || info.message);
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === "AbortError" || error.message === "Request was aborted") {
              throw new Error("Request was aborted");
            }
          }

          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < MAX_RETRIES && !lastError.message.includes("usage limit")) {
            const delayMs = BASE_DELAY_MS * 2 ** attempt;
            await sleep(delayMs, options?.signal);
            continue;
          }

          throw lastError;
        }
      }

      if (!response?.ok) {
        throw lastError ?? new Error("Failed after retries");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      stream.push({ type: "start", partial: output });
      await processResponsesStream(mapCodexEvents(parseSSE(response)), output, stream, model);

      if (options?.signal?.aborted) {
        throw new Error("Request was aborted");
      }

      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

export function streamSimpleCodexPoolCodexResponses(model, context, options = {}) {
  const apiKey = options?.apiKey;

  if (!apiKey) {
    throw new Error(`No API key for provider: ${model.provider}`);
  }

  const base = buildBaseOptions(model, options, apiKey);
  const requestedReasoning = options?.reasoning ?? options?.reasoningEffort;
  const reasoningEffort = supportsXhigh(model)
    ? requestedReasoning
    : clampReasoning(requestedReasoning);

  return streamCodexPoolCodexResponses(model, context, {
    ...options,
    ...base,
    reasoningEffort
  });
}
