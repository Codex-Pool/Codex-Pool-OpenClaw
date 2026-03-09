# Codex-Pool OpenClaw TypeScript Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `Codex-Pool-OpenClaw` 重构为 TypeScript 开发、`dist/` JavaScript 发布，并补齐质量门禁与 tag 驱动 npm publish CI。

**Architecture:** 保留现有模块边界，先用测试锁定当前行为，再逐步把 `src/` 与 `tests/` 迁移到 TypeScript，并让 `package.json`、OpenClaw 插件入口与构建产物统一指向 `dist/`。CI 分成常规质量门禁和 tag 发布两条链路，发布采用 npm Trusted Publishing。

**Tech Stack:** TypeScript, Vitest, ESLint, Prettier, GitHub Actions, npm Trusted Publishing

---

### Task 1: 建立 TypeScript 与质量工具链

**Files:**
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: 写失败测试，锁定包入口将迁移到 dist**

在 `tests/openclaw-package.test.js` 新增断言，要求未来构建后：

- `main` 指向 `dist/index.js`
- `exports["."]` 指向 `dist/index.js`
- `openclaw.extensions` 指向 `dist/src/openclaw-plugin.js`

**Step 2: 跑测试确认失败**

Run: `npm test -- tests/openclaw-package.test.js`
Expected: 因当前 `package.json` 仍指向源码入口而失败

**Step 3: 添加最小工具链配置**

实现：

- 增加 `typescript`、`eslint`、`@eslint/js`、`typescript-eslint`、`prettier`
- 补 `build`、`typecheck`、`lint`、`format`、`format:check`、`ci`
- 配置 `tsconfig.json` 输出到 `dist/`

**Step 4: 跑定向测试确认通过**

Run: `npm test -- tests/openclaw-package.test.js`
Expected: PASS

**Step 5: 跑基础质量命令**

Run: `npm run typecheck`
Expected: 初始阶段若因尚未迁移 TS 而失败，记录失败并继续下一任务

### Task 2: 迁移源码入口到 TypeScript

**Files:**
- Create: `index.ts`
- Create: `src/index.ts`
- Create: `src/preload.ts`
- Create: `src/openclaw-plugin.ts`
- Modify: `package.json`
- Delete/Replace: 对应 `.js` 入口文件

**Step 1: 写 failing test，锁定编译后的入口导出**

在 `tests/openclaw-package.test.js` 中新增针对 `dist` 入口的断言，要求：

- 根入口可被导入
- `preload` 子路径可被解析
- OpenClaw 插件入口路径存在于构建目录

**Step 2: 跑测试确认失败**

Run: `npm test -- tests/openclaw-package.test.js`
Expected: 因尚未生成 `dist` 和 TS 入口而失败

**Step 3: 迁移最小实现**

把根入口与 OpenClaw 入口迁移到 `.ts`，优先保持函数签名与行为不变。

**Step 4: 构建并重跑测试**

Run: `npm run build && npm test -- tests/openclaw-package.test.js`
Expected: PASS

### Task 3: 迁移 provider 基础模块到 TypeScript

**Files:**
- Create/Replace: `src/provider/auth.ts`
- Create/Replace: `src/provider/json-parse.ts`
- Create/Replace: `src/provider/sanitize-unicode.ts`
- Create/Replace: `src/provider/simple-options.ts`
- Create/Replace: `src/provider/event-stream.ts`
- Create/Replace: `src/provider/responses-shared.ts`
- Test: `tests/provider-auth.test.js`
- Test: `tests/provider-request.test.js`
- Test: `tests/provider-stream.test.js`

**Step 1: 为最容易回归的纯函数补 failing tests**

补足以下断言：

- 认证头拼装完整
- JSON parse 错误路径稳定
- Unicode 清洗不改变正常文本
- simple options 映射不回归

**Step 2: 跑定向测试确认失败**

Run: `npm test -- tests/provider-auth.test.js tests/provider-request.test.js tests/provider-stream.test.js`
Expected: 至少一项因新断言未满足而失败

**Step 3: 迁移最小实现到 TypeScript**

为关键输入输出补类型定义，避免过度抽象。

**Step 4: 重跑定向测试**

Run: `npm test -- tests/provider-auth.test.js tests/provider-request.test.js tests/provider-stream.test.js`
Expected: PASS

### Task 4: 迁移 request / message transform 模块到 TypeScript

**Files:**
- Create/Replace: `src/provider/request.ts`
- Create/Replace: `src/provider/transform-messages.ts`
- Test: `tests/provider-request.test.js`

**Step 1: 写 failing tests，锁定高风险语义**

补充覆盖：

- `assistant` / `toolResult` / 图片消息转换
- tools 透传
- reasoning effort clamp
- temperature 透传
- tool call id 规范化相关分支

**Step 2: 跑定向测试确认失败**

Run: `npm test -- tests/provider-request.test.js`
Expected: FAIL

**Step 3: 迁移最小实现**

逐步迁移到 TS，优先复用已有逻辑，不做行为扩展。

**Step 4: 重跑测试确认通过**

Run: `npm test -- tests/provider-request.test.js`
Expected: PASS

### Task 5: 迁移 stream / register / auth-flow 模块到 TypeScript

**Files:**
- Create/Replace: `src/provider/stream.ts`
- Create/Replace: `src/plugin/register.ts`
- Create/Replace: `src/openclaw/provider-auth.ts`
- Test: `tests/provider-stream.test.js`
- Test: `tests/plugin-register.test.js`
- Test: `tests/provider-auth-flow.test.js`
- Test: `tests/openclaw-plugin.test.js`

**Step 1: 写 failing tests，锁定运行时接线行为**

补充覆盖：

- provider 覆盖只拦 `cp_...`
- fallback 走原 provider
- auth flow 写入 provider 配置与默认模型
- stream 错误事件和 done/completed 映射

**Step 2: 跑定向测试确认失败**

Run: `npm test -- tests/provider-stream.test.js tests/plugin-register.test.js tests/provider-auth-flow.test.js tests/openclaw-plugin.test.js`
Expected: FAIL

**Step 3: 迁移最小实现**

保持对现有测试行为完全兼容，只补类型，不改外部语义。

**Step 4: 重跑测试确认通过**

Run: `npm test -- tests/provider-stream.test.js tests/plugin-register.test.js tests/provider-auth-flow.test.js tests/openclaw-plugin.test.js`
Expected: PASS

### Task 6: 迁移测试本身到 TypeScript 并补 coverage

**Files:**
- Modify/Rename: `tests/*.test.ts`
- Modify: `vitest.config.js`
- Modify: `package.json`

**Step 1: 先写 failing package/config test**

新增或修改测试，要求 `coverage` 脚本存在且能生成覆盖率报告配置。

**Step 2: 跑测试确认失败**

Run: `npm test -- tests/openclaw-package.test.js`
Expected: FAIL

**Step 3: 迁移测试并接入 coverage**

实现：

- 测试文件迁移为 `.ts`
- Vitest 开启 v8 coverage
- 增加 `npm run coverage`

**Step 4: 跑测试与覆盖率**

Run: `npm test && npm run coverage`
Expected: PASS，并生成覆盖率输出

### Task 7: 建立 GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Step 1: 写 failing test，锁定 CI 所需脚本存在**

在 `tests/openclaw-package.test.ts` 中断言：

- `ci`
- `build`
- `lint`
- `format:check`
- `typecheck`
- `coverage`

脚本全部存在。

**Step 2: 跑定向测试确认失败**

Run: `npm test -- tests/openclaw-package.test.ts`
Expected: FAIL

**Step 3: 添加最小 CI workflow**

工作流执行：

- checkout
- setup-node
- npm ci
- `npm run ci`
- `npm run coverage`

**Step 4: 重跑测试确认通过**

Run: `npm test -- tests/openclaw-package.test.ts`
Expected: PASS

### Task 8: 建立 tag 驱动 npm publish

**Files:**
- Create: `.github/workflows/publish.yml`
- Modify: `package.json`
- Modify: `README.md`

**Step 1: 写 failing test，锁定发布元数据**

在 package test 中断言：

- `private` 不再为 `true`
- 存在 `files`
- `publishConfig.access = "public"`

**Step 2: 跑定向测试确认失败**

Run: `npm test -- tests/openclaw-package.test.ts`
Expected: FAIL

**Step 3: 添加发布 workflow**

实现：

- 触发 tag：`v*.*.*`
- 校验 tag 与 `package.json.version`
- 运行 `npm run ci`
- 运行 `npm run build`
- `npm publish --provenance --access public`
- 使用 `permissions: id-token: write`

**Step 4: 更新 README 发布说明**

写清：

- 如何创建 tag
- npm Trusted Publishing 前置配置
- 构建产物发布策略

**Step 5: 重跑测试确认通过**

Run: `npm test -- tests/openclaw-package.test.ts`
Expected: PASS

### Task 9: 全量验证与发布前收口

**Files:**
- Verify only

**Step 1: 运行全量质量门禁**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run coverage && npm run build`
Expected: 全部通过

**Step 2: 验证 npm 打包内容**

Run: `npm pack --dry-run`
Expected: 仅包含预期发布文件

**Step 3: 验证 GitHub Actions 配置语法**

Run: 可选使用本地 YAML 校验或通过 `git diff` 人工检查
Expected: workflow 结构清晰、权限最小化

**Step 4: 整理变更总结**

列出：

- TS 重构范围
- 新增脚本
- 覆盖率提升点
- 发布配置前置条件（npm trusted publisher）

Plan complete and saved to `docs/plans/2026-03-09-typescript-release.md`. Two execution options:

**1. Subagent-Driven (this session)** - 我在当前会话直接按计划实现、分步验证、随时给你同步进展

**2. Parallel Session (separate)** - 另开会话按计划执行，当前会话只做评审与收口
