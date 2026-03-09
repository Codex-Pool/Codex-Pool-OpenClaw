# Codex-Pool OpenClaw 消息角色兼容 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `Codex-Pool-OpenClaw` 的请求体构造层，使其兼容 OpenClaw 会话中的 `assistant` 与 `toolResult` 历史消息，不再因 `Unsupported message role: assistant` 失败。

**Architecture:** 在 `src/provider/request.js` 中把当前“只支持 user 纯文本”的转换逻辑，扩展为一个最小的 Responses/Codex 消息映射器。实现遵循 pi-ai 的 `convertResponsesMessages` 语义：`assistant` 展开为 `message` / `function_call` 项，`toolResult` 转换为 `function_call_output`，必要时附加用户图片消息。

**Tech Stack:** Node.js ESM、Vitest、OpenClaw / pi-ai 消息格式、Codex-Pool request builder

---

### Task 1: 写失败测试锁定 `assistant` 历史兼容

**Files:**
- Modify: `tests/provider-request.test.js`
- Test: `tests/provider-request.test.js`

**Step 1: 写失败测试**

覆盖：

- `assistant` 文本历史不会再抛 `Unsupported message role: assistant`
- `assistant` 文本块会被编码为 `role: "assistant"` 的 `message` 输入项

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，错误应指向当前 `request.js` 的角色限制。

**Step 3: 写最小实现**

先只补 `assistant` 文本块映射，不顺手改其他行为。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 2: 写失败测试锁定 `assistant toolCall` 与 `toolResult`

**Files:**
- Modify: `tests/provider-request.test.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- `assistant` 的 `toolCall` 块会转成 `function_call`
- `toolResult` 文本会转成 `function_call_output`

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，提示缺少对应映射或输出结构不对。

**Step 3: 写最小实现**

实现：

- `assistant` 内容块迭代与展开
- `toolCall.id` 到 `call_id` / `id` 的拆分
- `toolResult.toolCallId` 到 `function_call_output.call_id` 的转换

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 3: 补图片/混合内容兼容

**Files:**
- Modify: `tests/provider-request.test.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- `user` 数组内容可转 `input_text` / `input_image`
- `toolResult` 图片在支持图片的模型上会附加 follow-up `user` 输入

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，提示图片分支未实现或被过滤错误。

**Step 3: 写最小实现**

只补图片相关转换，不改无关字段。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 4: 全量回归与运行时复核

**Files:**
- Modify: `src/provider/request.js`
- Test: `tests/provider-request.test.js`

**Step 1: 跑定向测试**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

**Step 2: 跑全量测试**

Run: `npm test`

Expected: PASS

**Step 3: 运行时复核**

重启 OpenClaw gateway，让用户再发一条飞书消息，确认不再出现 `Unsupported message role: assistant`。

**Step 4: 记录结果**

若出现新错误，只记录新错误链路，不顺手扩大修复范围。
