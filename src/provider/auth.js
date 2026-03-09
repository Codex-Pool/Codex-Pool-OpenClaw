export function buildCodexPoolHeaders({ apiKey, chatgptAccountId, extraHeaders } = {}) {
  if (!apiKey) {
    throw new Error("Missing Codex-Pool API key");
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("accept", "text/event-stream");
  headers.set("content-type", "application/json");
  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("originator", "codex-pool-openclaw");

  if (chatgptAccountId) {
    headers.set("chatgpt-account-id", chatgptAccountId);
  }

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    if (value !== undefined && value !== null) {
      headers.set(key, String(value));
    }
  }

  return headers;
}
