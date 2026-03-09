# Codex-Pool OpenClaw Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现一个独立的 `codex-pool-codex` OpenClaw provider/plugin，使 OpenClaw 能用 `cp_...` key 以 Codex 风格请求访问 Codex-Pool，而不再本地报 `Failed to extract accountId from token`。

**Architecture:** 采用独立 Node ESM 插件工程，核心 provider 复刻 `openai-codex-responses` 的请求体与 SSE 语义，但替换认证逻辑：直接透传 `Authorization: Bearer cp_...`，仅在显式配置时附带 `chatgpt-account-id`。测试分成请求构造、头部策略与 SSE 流式响应三层。

**Tech Stack:** Node.js ESM、Vitest、原生 `fetch`/`Headers`、本地 mock HTTP/SSE server

---

### Task 1: 初始化工程骨架

**Files:**

- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `README.md`

**Step 1: 写最小工程清单**

定义：

- `type: "module"`
- `scripts.test = "vitest run"`
- `scripts.test:watch = "vitest"`

**Step 2: 写测试框架配置**

使用单一 Vitest 配置，启用 Node 环境。

**Step 3: 添加最小忽略规则**

忽略：

- `node_modules/`
- `coverage/`
- `dist/`

**Step 4: 写 README 简介**

说明这是一个面向 OpenClaw + Codex-Pool 的 provider/plugin 仓库。

**Step 5: 提交**

```bash
git add package.json vitest.config.js .gitignore README.md
git commit -m "chore: scaffold codex-pool openclaw provider repo"
```

### Task 2: 先写失败测试锁定认证行为

**Files:**

- Create: `tests/provider-auth.test.js`
- Create: `src/provider/auth.js`

**Step 1: 写失败测试**

覆盖：

- `cp_...` key 不应尝试解析 JWT
- 默认只生成 `Authorization`
- 显式配置 `chatgpt-account-id` 时才带该头

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-auth.test.js`

Expected: FAIL，提示认证构造函数或头部构造逻辑尚未实现。

**Step 3: 写最小实现**

实现一个最小 `buildCodexPoolHeaders()`：

- 输入 `apiKey`
- 输入可选 `chatgptAccountId`
- 输出 `Headers`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-auth.test.js`

Expected: PASS

**Step 5: 提交**

```bash
git add tests/provider-auth.test.js src/provider/auth.js
git commit -m "test: lock codex-pool auth header behavior"
```

### Task 3: 先写失败测试锁定 URL 与请求体

**Files:**

- Create: `tests/provider-request.test.js`
- Create: `src/provider/request.js`

**Step 1: 写失败测试**

覆盖：

- 默认 URL 为 `/backend-api/codex/responses`
- 可切换到自定义 path
- 请求体保留 Codex 风格关键字段

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-request.test.js`

Expected: FAIL，提示 URL 解析或请求体构造未实现。

**Step 3: 写最小实现**

实现：

- `resolveCodexPoolUrl(baseUrl, pathMode)`
- `buildCodexPoolRequestBody(model, context, options)`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`

Expected: PASS

**Step 5: 提交**

```bash
git add tests/provider-request.test.js src/provider/request.js
git commit -m "test: lock codex-pool request construction"
```

### Task 4: 先写失败测试锁定 SSE 流式语义

**Files:**

- Create: `tests/provider-stream.test.js`
- Create: `src/provider/stream.js`
- Modify: `src/provider/request.js`

**Step 1: 写失败测试**

用本地 mock server 覆盖：

- SSE 成功事件序列
- `response.failed`
- 非 2xx 响应

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-stream.test.js`

Expected: FAIL，提示 provider stream 或 SSE 解析未实现。

**Step 3: 写最小实现**

实现：

- SSE 读取器
- Codex 事件映射
- 错误转译

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-stream.test.js`

Expected: PASS

**Step 5: 提交**

```bash
git add tests/provider-stream.test.js src/provider/stream.js src/provider/request.js
git commit -m "feat: implement codex-pool streaming provider core"
```

### Task 5: 接入 OpenClaw 注册入口

**Files:**

- Create: `src/plugin/register.js`
- Create: `src/index.js`
- Modify: `README.md`

**Step 1: 写失败测试**

新建或扩展测试，验证：

- 注册后 API provider 可被发现
- 重复注册时不会重复覆盖

**Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，提示注册入口未实现。

**Step 3: 写最小实现**

实现：

- `registerCodexPoolCodexProvider()`
- 导出默认注册函数与显式构造函数

**Step 4: 再跑测试确认通过**

Run: `npm test`

Expected: PASS

**Step 5: 提交**

```bash
git add src/plugin/register.js src/index.js README.md tests
git commit -m "feat: register codex-pool custom api provider"
```

### Task 6: 写 OpenClaw 接入说明与 smoke 流程

**Files:**

- Modify: `README.md`
- Create: `docs/plans/2026-03-09-openclaw-smoke-checklist.md`

**Step 1: 写配置示例**

包括：

- 如何让 OpenClaw 加载该插件
- 如何声明 provider/model
- 如何配置 `cp_...` key
- 如何可选注入 `chatgpt-account-id`

**Step 2: 写 smoke checklist**

记录：

- 启动前检查
- OpenClaw 验证命令
- Codex-Pool 日志观察点

**Step 3: 跑完整测试**

Run: `npm test`

Expected: PASS

**Step 4: 提交**

```bash
git add README.md docs/plans/2026-03-09-openclaw-smoke-checklist.md
git commit -m "docs: add openclaw integration and smoke checklist"
```

### Task 7: 最终验证

**Files:**

- Verify only

**Step 1: 安装依赖**

Run: `npm install`

**Step 2: 执行全部测试**

Run: `npm test`

Expected: 全部通过

**Step 3: 检查 git 状态**

Run: `git status --short`

Expected: 工作区干净或仅有你预期的未提交改动

**Step 4: 输出接入说明摘要**

给出：

- provider 名称
- 关键配置项
- smoke 命令
