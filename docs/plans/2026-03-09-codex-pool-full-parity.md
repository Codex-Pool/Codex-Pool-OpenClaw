# Codex-Pool OpenClaw 官方 Provider 全量对齐 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `Codex-Pool-OpenClaw` 在保留 `cp_...` 认证兼容的前提下，把 `openai-codex-responses` 的 request、auth、stream 语义全面对齐到官方当前实现。

**Architecture:** 以官方 `openai-codex-responses` 和 `openai-responses-shared` 为行为基线，镜像其 request/message/stream 处理逻辑；仅在 auth 相关位置保留 `cp_...` / 可选 `chatgpt-account-id` 的最小差异。用 TDD 先锁定当前缺口，再分层实现并跑全量测试。

**Tech Stack:** Node.js ESM、Vitest、OpenClaw provider runtime、Codex/Responses SSE & WebSocket 语义

---

### Task 1: 写 request/message parity 红灯测试

**Files:**
- Modify: `tests/provider-request.test.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- `thinkingSignature` 会被回放成 reasoning item
- cross-model assistant thinking 会按官方降级
- toolCall id 会规范化
- orphaned toolCall 会补 synthetic `toolResult`
- surrogate 会被清洗

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，且失败原因对应当前行为缺口，而不是测试书写错误。

**Step 3: 写最小实现**

把 `buildCodexPoolRequestBody()` 的消息转换逻辑对齐到官方共享实现。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 2: 写 auth parity 红灯测试

**Files:**
- Modify: `tests/provider-auth.test.js`
- Modify: `src/provider/auth.js`

**Step 1: 写失败测试**

覆盖：

- header 初始化顺序会继承 `model.headers`
- `originator` / `User-Agent` / `OpenAI-Beta` 对齐官方
- runtime `headers` 覆盖顺序对齐官方
- `chatgpt-account-id` 仍保持可选

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/provider-auth.test.js`

Expected: FAIL，提示 header 不完整或覆盖顺序不对。

**Step 3: 写最小实现**

重写 `buildCodexPoolHeaders()`，对齐官方构头行为，只保留可选 account id 定制。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-auth.test.js`

Expected: PASS

### Task 3: 写 stream parity 红灯测试

**Files:**
- Modify: `tests/provider-stream.test.js`
- Modify: `src/provider/stream.js`

**Step 1: 写失败测试**

覆盖：

- `response.done` 被归一化为 `response.completed`
- `response.output_item.done` 产出 `thinking_end` / `text_end` / `toolcall_end`
- `refusal` 增量被正确映射
- `response.completed` 回填 `usage`
- 有工具调用时 `stopReason` 变为 `toolUse`
- 429 / 503 会触发 retry
- 坏 JSON SSE chunk 不会让整条流崩掉

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/provider-stream.test.js`

Expected: FAIL，且分别卡在当前 stream 缺失的行为上。

**Step 3: 写最小实现**

把 `streamCodexPoolCodexResponses()` 主流程对齐到官方 provider，并保留自定义 auth/url 行为。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-stream.test.js`

Expected: PASS

### Task 4: 对齐 provider 导出与 `streamSimple`

**Files:**
- Modify: `src/provider/stream.js`
- Modify: `src/plugin/register.js`
- Modify: `src/index.js`

**Step 1: 写失败测试**

覆盖：

- provider 暴露独立的 `streamSimple`
- `streamSimple` 会按官方 `buildBaseOptions` 与 reasoning clamp 工作

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/plugin-register.test.js tests/provider-stream.test.js`

Expected: FAIL，提示 `streamSimple` 行为与当前 `stream` 直连不一致。

**Step 3: 写最小实现**

补 `streamSimpleCodexPoolCodexResponses()`，并让 provider 注册导出它。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/plugin-register.test.js tests/provider-stream.test.js`

Expected: PASS

### Task 5: 跑全量回归并验证运行态

**Files:**
- Modify: `src/provider/request.js`
- Modify: `src/provider/auth.js`
- Modify: `src/provider/stream.js`
- Modify: `src/plugin/register.js`
- Modify: `tests/provider-request.test.js`
- Modify: `tests/provider-auth.test.js`
- Modify: `tests/provider-stream.test.js`

**Step 1: 跑 request/auth/stream 定向测试**

Run: `npm test -- tests/provider-request.test.js tests/provider-auth.test.js tests/provider-stream.test.js`

Expected: PASS

**Step 2: 跑全量测试**

Run: `npm test`

Expected: PASS

**Step 3: 重启网关**

Run: `openclaw gateway restart`

Expected: 网关重启成功。

**Step 4: 记录剩余差异**

若还有保留差异，明确记录：

- 是“官方外的有意定制”
- 还是“后端能力不支持导致的例外”
