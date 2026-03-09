# Codex-Pool OpenClaw 工具透传与低风险对齐 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `cp` provider 无法触发工具调用的问题，并补齐 `temperature`、`reasoning clamp`、`session_id` header 这几项低风险请求层差异。

**Architecture:** 只在 `src/provider/request.js` 与 `src/provider/auth.js` 的请求构造层做改动。先用 TDD 锁定 `tools`、`temperature`、`reasoning clamp`、`session_id` 的行为，再做最小实现，最后跑全量测试并输出与官方 provider 的剩余差异清单。

**Tech Stack:** Node.js ESM、Vitest、OpenAI Responses/Codex request schema、Codex-Pool provider

---

### Task 1: 写失败测试锁定 `tools` 透传

**Files:**

- Modify: `tests/provider-request.test.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- 当 `context.tools` 存在时，`body.tools` 会被写成 function tool schema
- `strict` 应为 `null`

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，提示 `tools` 字段缺失。

**Step 3: 写最小实现**

只补 `convertCodexPoolTools()` 与 `body.tools` 写入。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 2: 写失败测试锁定 `temperature` 与 `reasoning clamp`

**Files:**

- Modify: `tests/provider-request.test.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- `options.temperature` 会进入请求体
- `gpt-5.2* / gpt-5.3*` 上 `minimal` 会被改成 `low`

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，提示字段值不符或缺失。

**Step 3: 写最小实现**

补：

- `temperature`
- `clampReasoningEffortForCodexPool()`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

### Task 3: 写失败测试锁定 `session_id` header

**Files:**

- Modify: `tests/provider-auth.test.js`
- Modify: `src/provider/auth.js`
- Modify: `src/provider/stream.js`

**Step 1: 写失败测试**

覆盖：

- 显式传入 `sessionId` 时，headers 中会带 `session_id`

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-auth.test.js`

Expected: FAIL，提示 `session_id` 为空。

**Step 3: 写最小实现**

补：

- `buildCodexPoolHeaders({ sessionId })`
- `streamCodexPoolCodexResponses()` 调用时传入 `options.sessionId`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-auth.test.js`

Expected: PASS

### Task 4: 全量回归与差异审计

**Files:**

- Modify: `src/provider/request.js`
- Modify: `src/provider/auth.js`
- Modify: `src/provider/stream.js`
- Test: `tests/provider-request.test.js`
- Test: `tests/provider-auth.test.js`

**Step 1: 跑定向测试**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

**Step 2: 跑 header 定向测试**

Run: `npm test -- tests/provider-auth.test.js`

Expected: PASS

**Step 3: 跑全量测试**

Run: `npm test`

Expected: PASS

**Step 4: 记录剩余差异**

输出但不实现：

- stream/usage/refusal/reasoning item 相关差异
- message sanitize / tool id normalize / hash 相关差异
- header `User-Agent` 与 `originator` 风格差异
