# Codex-Pool OpenClaw 官方 Provider Onboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `Codex-Pool-OpenClaw` 升级为可通过 OpenClaw 官方插件安装/启用与 `models auth login` 配置的 provider 插件。

**Architecture:** 在现有 `codex-pool-codex` 自定义 API 适配层之上，再加一层真正的 OpenClaw 插件入口。插件在加载时自动注册自定义 API，并通过 `api.registerProvider(...)` 暴露 `codex-pool` 的 auth 向导，输出 `configPatch` 到 `models.providers.codex-pool`。

**Tech Stack:** Node.js ESM、Vitest、OpenClaw plugin manifest/package metadata、plain JS plugin object

---

### Task 1: 补插件包清单

**Files:**
- Modify: `package.json`
- Create: `openclaw.plugin.json`
- Test: `tests/openclaw-package.test.js`

**Step 1: 写失败测试**

覆盖：

- `package.json` 必须包含 `openclaw.extensions`
- `openclaw.plugin.json` 必须声明 plugin id 与 providers

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/openclaw-package.test.js`

Expected: FAIL，提示缺少清单字段或文件不存在。

**Step 3: 写最小实现**

补齐：

- `package.json.openclaw.extensions`
- `openclaw.plugin.json`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/openclaw-package.test.js`

Expected: PASS

### Task 2: 先写失败测试锁定插件入口注册行为

**Files:**
- Create: `tests/openclaw-plugin.test.js`
- Create: `src/openclaw-plugin.js`

**Step 1: 写失败测试**

覆盖：

- 插件默认导出合法对象
- `register(api)` 会调用 `registerCodexPoolCodexProviderInPiAi()`
- `register(api)` 会调用 `api.registerProvider(...)`

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/openclaw-plugin.test.js`

Expected: FAIL，提示插件入口尚未实现。

**Step 3: 写最小实现**

实现默认插件对象与 `register(api)`。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/openclaw-plugin.test.js`

Expected: PASS

### Task 3: 先写失败测试锁定 provider auth 输出

**Files:**
- Create: `tests/provider-auth-flow.test.js`
- Create: `src/openclaw/provider-auth.js`

**Step 1: 写失败测试**

覆盖：

- `auth.run(ctx)` 能返回 `profiles`
- `configPatch.models.providers.codex-pool.api = "codex-pool-codex"`
- `defaultModel` 指向第一个模型
- `notes` 包含插件启用/日志排障提示

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/provider-auth-flow.test.js`

Expected: FAIL，提示 auth helper 未实现。

**Step 3: 写最小实现**

实现：

- `normalizeCodexPoolBaseUrl()`
- `buildCodexPoolProviderConfigPatch()`
- `runCodexPoolProviderAuth()`

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/provider-auth-flow.test.js`

Expected: PASS

### Task 4: 把 provider auth 接到插件入口

**Files:**
- Modify: `src/openclaw-plugin.js`
- Modify: `tests/openclaw-plugin.test.js`

**Step 1: 写失败测试**

覆盖：

- 注册的 provider id 是 `codex-pool`
- auth method 至少包含一个 `custom` flow

**Step 2: 运行测试并确认失败**

Run: `npm test -- tests/openclaw-plugin.test.js`

Expected: FAIL，提示 provider 结构不完整。

**Step 3: 写最小实现**

把 `src/openclaw/provider-auth.js` 接到插件入口。

**Step 4: 再跑测试确认通过**

Run: `npm test -- tests/openclaw-plugin.test.js`

Expected: PASS

### Task 5: 更新 README 与 smoke 清单

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-09-openclaw-smoke-checklist.md`

**Step 1: 文档更新**

补充官方接入路径：

- `openclaw plugins install --link ~/Codex-Pool-OpenClaw`
- `openclaw plugins enable codex-pool-openclaw`
- `openclaw models auth login --provider codex-pool --set-default`

**Step 2: 回归测试**

Run: `npm test`

Expected: PASS
