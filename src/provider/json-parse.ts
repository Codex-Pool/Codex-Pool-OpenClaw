import { parse as partialParse } from "partial-json";

export function parseStreamingJson(partialJson?: string | null): unknown {
  if (!partialJson || partialJson.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(partialJson);
  } catch {
    // Fall through to partial JSON parsing.
  }

  try {
    return partialParse(partialJson) ?? {};
  } catch {
    return {};
  }
}
