# Codex-Pool OpenClaw

> 中文在前 · English follows  
> TypeScript-first OpenClaw provider/plugin for routing Codex-style traffic through Codex-Pool.

`Codex-Pool OpenClaw` 是一个面向 `OpenClaw` 的自定义 provider/plugin。  
它的目标很直接：**保留 Codex 风格请求体与 SSE / tool calling 语义，同时允许 OpenClaw 直接使用 `Codex-Pool` 的 `cp_...` 凭据与本地端点。**

`Codex-Pool OpenClaw` is a custom provider/plugin for `OpenClaw`.  
Its goal is simple: **preserve Codex-style requests, streaming, and tool semantics while letting OpenClaw talk directly to `Codex-Pool` using `cp_...` credentials and local endpoints.**

---

## 📚 目录 / Table of Contents

- [项目简介 / Overview](#overview)
- [快速开始 / Quick Start](#quick-start)
- [OpenClaw 接入流程 / OpenClaw Onboarding](#onboarding)
- [开发与发布 / Development and Release](#development)
- [Tag 发布 / Tag-driven Publish](#publish)
- [高级用法 / Advanced Usage](#advanced)
- [验证与测试 / Verification](#verification)
- [边界与限制 / Limitations](#limitations)

---

## <a id="overview"></a>✨ 项目简介 / Overview

### 中文

这个仓库解决的是一个很具体的兼容性问题：

- `OpenClaw` 内置的 `openai-codex-responses` provider 默认假设 token 可解析出 `accountId`
- `Codex-Pool` 使用的是 `cp_...` 风格凭据，不适合那套假设
- 直接硬接时，常见结果是在 provider 层直接失败，例如 `Failed to extract accountId from token`

这个插件的做法是：

- 保留 Codex 风格请求体、SSE 和工具调用语义
- 兼容 `Codex-Pool` 的认证方式与本地端点
- 尽量对齐官方 `openai-codex-responses` 的 request / auth / stream 行为
- 采用 **TypeScript 开发**、**`dist/` JavaScript 发布**

### English

This repository solves a very specific compatibility problem:

- OpenClaw’s built-in `openai-codex-responses` provider assumes a token format that can expose `accountId`
- `Codex-Pool` uses `cp_...` style credentials, which do not fit that assumption
- Connecting them directly often fails at the provider layer before the request reaches your backend

This plugin fixes that by:

- preserving Codex-style request bodies, SSE, and tool-calling semantics
- adapting authentication for `Codex-Pool` local endpoints
- aligning request / auth / stream behavior as closely as possible with the official provider
- using **TypeScript for development** and **`dist/` JavaScript for publishing**

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="quick-start"></a>⚡ 快速开始 / Quick Start

### 中文

#### 1) 克隆仓库并安装依赖

```bash
git clone https://github.com/Codex-Pool/Codex-Pool-OpenClaw.git
cd Codex-Pool-OpenClaw
npm install
```

#### 2) 构建发布产物

```bash
npm run build
```

#### 3) 在 OpenClaw 中安装并启用插件

```bash
openclaw plugins install --link /absolute/path/to/Codex-Pool-OpenClaw
openclaw plugins enable codex-pool-openclaw
```

#### 4) 运行 provider 登录

```bash
openclaw models auth login --provider codex-pool --set-default
```

你会被提示填写：

- `Codex-Pool base URL`
- `cp_...` API key
- 模型列表（逗号分隔）

#### 5) 重启网关并验证

```bash
openclaw gateway restart
openclaw plugins list
openclaw models status --json
```

### English

#### 1) Clone the repository and install dependencies

```bash
git clone https://github.com/Codex-Pool/Codex-Pool-OpenClaw.git
cd Codex-Pool-OpenClaw
npm install
```

#### 2) Build release artifacts

```bash
npm run build
```

#### 3) Install and enable the plugin in OpenClaw

```bash
openclaw plugins install --link /absolute/path/to/Codex-Pool-OpenClaw
openclaw plugins enable codex-pool-openclaw
```

#### 4) Run provider auth

```bash
openclaw models auth login --provider codex-pool --set-default
```

You will be prompted for:

- `Codex-Pool base URL`
- a `cp_...` API key
- a comma-separated model list

#### 5) Restart the gateway and verify

```bash
openclaw gateway restart
openclaw plugins list
openclaw models status --json
```

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="onboarding"></a>🧭 OpenClaw 接入流程 / OpenClaw Onboarding

### 中文

当前推荐的官方接入路径是：

1. `openclaw plugins install --link ...`
2. `openclaw plugins enable codex-pool-openclaw`
3. `openclaw models auth login --provider codex-pool --set-default`

这条路径会完成三件事：

- 让 OpenClaw 把本仓库识别为合法插件包
- 在运行时对 `Codex-Pool` 场景接管 `openai-codex-responses` 兼容层
- 把 `models.providers.codex-pool` 写入用户配置

> 注意：截至 `2026-03-09`，外部 provider 插件仍不能把自己注入 `openclaw onboard --auth-choice ...` 的内置选项列表。  
> 所以这里的官方接入方式不是 `onboard`，而是 `plugins install/enable + models auth login`。

### English

The recommended onboarding path is:

1. `openclaw plugins install --link ...`
2. `openclaw plugins enable codex-pool-openclaw`
3. `openclaw models auth login --provider codex-pool --set-default`

This flow does three things:

- makes OpenClaw discover this repository as a valid plugin package
- overrides the `openai-codex-responses` compatibility layer at runtime for Codex-Pool traffic
- writes `models.providers.codex-pool` into user config

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="development"></a>🛠️ 开发与发布 / Development and Release

### 中文

这个仓库现在采用：

- **开发时**：`src/**/*.ts`、`tests/**/*.test.ts`
- **发布时**：`dist/**/*.js` + `dist/**/*.d.ts`

常用命令：

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run coverage
npm run build
npm run smoke:dist
npm run ci
```

说明：

- `npm run build` 会清理并重建 `dist/`
- `npm run smoke:dist` 会先构建，再验证 `dist` 入口可导入
- `npm run ci` 会串联格式、lint、类型检查、测试和 dist smoke

### English

This repository now uses:

- **Development**: `src/**/*.ts`, `tests/**/*.test.ts`
- **Publishing**: `dist/**/*.js` + `dist/**/*.d.ts`

Common commands:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run coverage
npm run build
npm run smoke:dist
npm run ci
```

Notes:

- `npm run build` rebuilds `dist/` from scratch
- `npm run smoke:dist` builds first, then validates the published entrypoints
- `npm run ci` chains formatting, lint, typecheck, tests, and dist smoke

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="publish"></a>🏷️ Tag 发布 / Tag-driven Publish

### 中文

这个仓库使用 **Git tag 驱动的 npm 发布**：

```bash
git tag v0.1.0
git push origin v0.1.0
```

发布前提：

- npm 侧已经为这个 GitHub 仓库配置 **Trusted Publishing**
- git tag `vX.Y.Z` 与 `package.json.version` 保持一致

发布工作流会自动执行：

- `npm run ci`
- `npm run coverage`
- `npm run build`
- `vitest run tests/dist-smoke.test.ts`
- `npm pack --dry-run`
- `npm publish --provenance --access public`

### English

This repository uses **Git tag-driven npm publishing**:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Prerequisites:

- npm Trusted Publishing must be configured for this GitHub repository
- the git tag `vX.Y.Z` must match `package.json.version`

The publish workflow automatically runs:

- `npm run ci`
- `npm run coverage`
- `npm run build`
- `vitest run tests/dist-smoke.test.ts`
- `npm pack --dry-run`
- `npm publish --provenance --access public`

### English

This repository now uses:

- **during development**: `src/**/*.ts`, `tests/**/*.test.ts`
- **during publishing**: `dist/**/*.js` + `dist/**/*.d.ts`

Common commands:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run coverage
npm run build
npm run smoke:dist
npm run ci
```

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="publish"></a>🏷️ Tag 发布 / Tag-driven Publish

### 中文

仓库内置了两条 GitHub Actions 工作流：

- `CI`：常规校验，运行 `npm run ci` 和 `npm run coverage`
- `Publish`：当推送 `v*.*.*` tag 时触发 npm 发布

发布流程：

1. 更新 `package.json` 版本号
2. 提交变更
3. 创建并推送 tag，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

`publish.yml` 会自动：

- 校验 tag 版本和 `package.json.version` 一致
- 运行完整 CI
- 重新构建 `dist/`
- 执行 `npm publish --provenance --access public`

推荐使用 **npm Trusted Publishing**（GitHub OIDC），而不是长期 `NPM_TOKEN`。

### English

The repository ships with two GitHub Actions workflows:

- `CI`: runs `npm run ci` and `npm run coverage`
- `Publish`: publishes to npm on `v*.*.*` tags

Recommended release flow:

1. bump `package.json.version`
2. commit changes
3. create and push a tag such as:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The publish workflow will automatically:

- verify that the tag matches `package.json.version`
- run the full CI gate
- rebuild `dist/`
- run `npm publish --provenance --access public`

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="advanced"></a>🔧 高级用法 / Advanced Usage

### 中文

如果你不想走插件安装流程，也可以直接 preload，但要先构建：

```bash
npm run build
NODE_OPTIONS="--import=/absolute/path/to/Codex-Pool-OpenClaw/dist/src/preload.js" openclaw gateway start
```

可选环境变量：

- `CODEX_POOL_OPENCLAW_API`：默认 `openai-codex-responses`
- `CODEX_POOL_OPENCLAW_SOURCE`：默认 `codex-pool-openclaw`
- `CODEX_POOL_OPENCLAW_PATH_MODE`：可选 `responses`

### English

If you prefer not to install the plugin package, you can use the preload fallback after building:

```bash
npm run build
NODE_OPTIONS="--import=/absolute/path/to/Codex-Pool-OpenClaw/dist/src/preload.js" openclaw gateway start
```

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="verification"></a>✅ 验证与测试 / Verification

### 中文

当前测试重点覆盖：

- 认证头构造
- URL 与请求体构造
- assistant / toolResult / thinking 消息兼容
- SSE 与 WebSocket 流式语义
- provider 注册与运行时覆盖逻辑
- OpenClaw provider auth 输出
- 构建产物 smoke test

### English

Current tests focus on:

- auth header construction
- URL and request-body construction
- assistant / toolResult / thinking compatibility
- SSE and WebSocket streaming semantics
- provider registration and runtime override behavior
- OpenClaw provider auth output
- dist build smoke checks

[回到目录 / Back to top](#-目录--table-of-contents)

---

## <a id="limitations"></a>📌 边界与限制 / Limitations

### 中文

- 外部 provider 插件仍不能直接扩展 `openclaw onboard --auth-choice`
- 当前兼容层聚焦 `Codex-Pool` / `cp_...` / 本地 loopback Codex 端点
- 发布工作流默认采用 npm Trusted Publishing，npm 侧需提前配置 publisher

### English

- external provider plugins still cannot inject themselves into `openclaw onboard --auth-choice`
- the compatibility layer is intentionally focused on `Codex-Pool`, `cp_...`, and local loopback Codex endpoints
- the publish workflow assumes npm Trusted Publishing is configured on the npm side
