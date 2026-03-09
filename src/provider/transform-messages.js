export function transformMessages(messages, model, normalizeToolCallId) {
  const toolCallIdMap = new Map();

  const transformed = (messages ?? []).map((message) => {
    if (message.role === "user") {
      return message;
    }

    if (message.role === "toolResult") {
      const normalizedId = toolCallIdMap.get(message.toolCallId);

      if (normalizedId && normalizedId !== message.toolCallId) {
        return { ...message, toolCallId: normalizedId };
      }

      return message;
    }

    if (message.role === "assistant") {
      const assistantMessage = message;
      const isSameModel =
        assistantMessage.provider === model.provider &&
        assistantMessage.api === model.api &&
        assistantMessage.model === model.id;
      const transformedContent = (assistantMessage.content ?? []).flatMap((block) => {
        if (block.type === "thinking") {
          if (block.redacted) {
            return isSameModel ? block : [];
          }

          if (isSameModel && block.thinkingSignature) {
            return block;
          }

          if (!block.thinking || block.thinking.trim() === "") {
            return [];
          }

          if (isSameModel) {
            return block;
          }

          return {
            type: "text",
            text: block.thinking
          };
        }

        if (block.type === "text") {
          if (isSameModel) {
            return block;
          }

          return {
            type: "text",
            text: block.text
          };
        }

        if (block.type === "toolCall") {
          const toolCall = block;
          let normalizedToolCall = toolCall;

          if (!isSameModel && toolCall.thoughtSignature) {
            normalizedToolCall = { ...toolCall };
            delete normalizedToolCall.thoughtSignature;
          }

          if (!isSameModel && normalizeToolCallId) {
            const normalizedId = normalizeToolCallId(toolCall.id, model, assistantMessage);

            if (normalizedId !== toolCall.id) {
              toolCallIdMap.set(toolCall.id, normalizedId);
              normalizedToolCall = { ...normalizedToolCall, id: normalizedId };
            }
          }

          return normalizedToolCall;
        }

        return block;
      });

      return {
        ...assistantMessage,
        content: transformedContent
      };
    }

    return message;
  });

  const result = [];
  let pendingToolCalls = [];
  let existingToolResultIds = new Set();

  for (let index = 0; index < transformed.length; index += 1) {
    const message = transformed[index];

    if (message.role === "assistant") {
      if (pendingToolCalls.length > 0) {
        for (const toolCall of pendingToolCalls) {
          if (!existingToolResultIds.has(toolCall.id)) {
            result.push({
              role: "toolResult",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: [{ type: "text", text: "No result provided" }],
              isError: true,
              timestamp: Date.now()
            });
          }
        }

        pendingToolCalls = [];
        existingToolResultIds = new Set();
      }

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        continue;
      }

      const toolCalls = (message.content ?? []).filter((block) => block.type === "toolCall");
      if (toolCalls.length > 0) {
        pendingToolCalls = toolCalls;
        existingToolResultIds = new Set();
      }

      result.push(message);
      continue;
    }

    if (message.role === "toolResult") {
      existingToolResultIds.add(message.toolCallId);
      result.push(message);
      continue;
    }

    if (message.role === "user") {
      if (pendingToolCalls.length > 0) {
        for (const toolCall of pendingToolCalls) {
          if (!existingToolResultIds.has(toolCall.id)) {
            result.push({
              role: "toolResult",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: [{ type: "text", text: "No result provided" }],
              isError: true,
              timestamp: Date.now()
            });
          }
        }

        pendingToolCalls = [];
        existingToolResultIds = new Set();
      }

      result.push(message);
      continue;
    }

    result.push(message);
  }

  return result;
}
