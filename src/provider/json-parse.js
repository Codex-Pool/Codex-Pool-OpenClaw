import { parse as partialParse } from "partial-json";

export function parseStreamingJson(partialJson) {
  if (!partialJson || partialJson.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(partialJson);
  } catch {}

  try {
    return partialParse(partialJson) ?? {};
  } catch {
    return {};
  }
}
