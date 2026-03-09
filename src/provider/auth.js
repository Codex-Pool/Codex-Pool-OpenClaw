import os from "node:os";

export function buildCodexPoolHeaders({
  initHeaders,
  apiKey,
  chatgptAccountId,
  extraHeaders,
  sessionId
} = {}) {
  if (!apiKey) {
    throw new Error("Missing Codex-Pool API key");
  }

  const headers = new Headers(initHeaders);
  headers.set("Authorization", `Bearer ${apiKey}`);

  if (chatgptAccountId) {
    headers.set("chatgpt-account-id", chatgptAccountId);
  }

  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("originator", "pi");
  headers.set("User-Agent", `pi (${os.platform()} ${os.release()}; ${os.arch()})`);
  headers.set("accept", "text/event-stream");
  headers.set("content-type", "application/json");

  if (sessionId) {
    headers.set("session_id", sessionId);
  }

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    if (value !== undefined && value !== null) {
      headers.set(key, String(value));
    }
  }

  return headers;
}
