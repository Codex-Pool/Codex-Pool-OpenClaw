# Codex-Pool OpenClaw 官方 Provider Onboard 设计文档

**日期：** 2026-03-09

## 目标

把当前仓库从“可 preload 的自定义 API 适配层”升级为“可被 OpenClaw 官方插件/模型配置流程接入的 provider 插件”，让用户可以走：

1. `openclaw plugins install --link ~/Codex-Pool-OpenClaw`
2. `openclaw plugins enable codex-pool-openclaw`
3. `openclaw models auth login --provider codex-pool --set-default`

完成配置，而不是手工改 `models.json` 或手工拼 `NODE_OPTIONS`。

## 真实边界

调研结果表明，**外部 provider 插件当前并不能把自己注入 `openclaw onboard --auth-choice ...` 的内置选项列表**。截至 2026-03-09，OpenClaw 对外部模型 provider 的正式接入面是：

- 插件发现 / 安装 / 启用
- `openclaw models auth login --provider <plugin-provider-id>`

因此，这次实现的“官方 onboard 配置流程”定义为：

- 通过 OpenClaw 官方插件安装/启用机制发现插件
- 通过 OpenClaw 官方 provider auth 机制写入模型配置
- 插件加载时自动注册 `codex-pool-codex` 自定义 API

## 方案对比

### 方案 A：只保留 preload 入口

**优点**

- 改动最小
- 当前代码可复用

**缺点**

- 不走 OpenClaw 官方 provider auth
- 仍需要人工改配置和启动参数
- 不符合“按 onboard 配置流程做好”的要求

### 方案 B：做真正的 OpenClaw provider 插件（推荐）

**优点**

- 完整走 OpenClaw 官方插件 + provider auth 路径
- 用户配置动作标准化
- 可直接通过 `plugins install/enable` + `models auth login` 接入

**缺点**

- 需要补插件清单、插件入口、provider auth flow
- 还要在插件启动时自动注册自定义 API

### 方案 C：修改 OpenClaw 核心 onboarding

**优点**

- 理论上最“原生”

**缺点**

- 需要改 OpenClaw 上游本体
- 对当前独立仓库交付边界不友好
- 后续升级维护成本过高

## 推荐方案

采用 **方案 B**。

仓库将同时提供两层能力：

1. **运行时 API 适配层**
   - 现有 `codex-pool-codex` 自定义 API provider
   - 负责 Codex 风格请求体 / SSE 语义 / `cp_...` token 透传

2. **OpenClaw 官方 provider 插件层**
   - 作为真正可安装的 OpenClaw 插件包
   - 在 `register(api)` 中：
     - 自动注册 `codex-pool-codex` API
     - 注册一个 provider auth 插件 `codex-pool`

## 目标用户流程

最终目标流程应当是：

1. 本地链接安装插件
2. 启用插件
3. 运行 `openclaw models auth login --provider codex-pool --set-default`
4. 向导提示填写：
   - Codex-Pool base URL
   - `cp_...` API key
   - 模型列表（默认最小集合）
5. 向导写入：
   - `models.providers.codex-pool`
   - 默认模型引用
6. 运行时由插件自动完成自定义 API 注册

## 插件结构设计

### 1. 插件包清单

新增：

- `openclaw.plugin.json`
- `package.json` 中的 `openclaw.extensions`

目的：

- 让 OpenClaw 能发现这是一个合法插件包
- 让 `openclaw plugins install --link ...` 能直接工作

### 2. 插件入口

新增一个真正的 OpenClaw 插件入口模块，例如：

- `src/openclaw-plugin.js`

这个入口导出默认插件对象，至少包含：

- `id`
- `name`
- `description`
- `register(api)`

`register(api)` 内部做两件事：

1. 调用本仓库已有的 `registerCodexPoolCodexProviderInPiAi()`
2. `api.registerProvider(...)` 注册 provider auth

### 3. Provider auth 设计

provider id 采用：

- `codex-pool`

理由：

- 避免和用户本地已有的 `cp` provider 命名冲突
- 保持模型引用可读：`codex-pool/gpt-5.4`

auth 方法先做一个最小 `custom` 向导：

- base URL，默认 `http://127.0.0.1:8091`
- API key，要求 `cp_...`
- 模型列表，默认 `gpt-5.4`

auth 结果返回：

- `profiles`
- `configPatch`
- `defaultModel`
- `notes`

其中 `configPatch` 会把 provider 的 `api` 固定写成：

- `codex-pool-codex`

## 为什么插件启动时要自动注册 API

仅有 `configPatch` 不够。

即使 `models.providers.codex-pool.api = "codex-pool-codex"` 已经写入配置，如果运行时没有先注册这个自定义 API，OpenClaw 仍会报：

- `No API provider registered for api: codex-pool-codex`

因此，插件入口必须在加载时主动完成 API 注册。这也是把 preload 逻辑升级为插件逻辑的核心价值。

## 兼容性与约束

### 1. 不强依赖本仓库安装 `openclaw` 作为开发依赖

插件入口尽量使用 plain JS 对象形状，不引入额外的本地 OpenClaw 依赖安装步骤。

### 2. 不强依赖 `@mariozechner/pi-ai` 在本仓库 `node_modules`

沿用当前已实现的 registry loader：

- 优先尝试正常 import
- 失败时回退到 OpenClaw 全局安装路径推导

这样插件被 OpenClaw 进程加载时，也能找到真实运行时里的 `pi-ai`。

### 3. 路径模式先保持最小范围

本阶段默认只走：

- `backend-api/codex/responses`

因为这正是用户当前目标链路。`responses` 路径模式保留为内部能力，但不先纳入 onboard 向导，避免过早复杂化。

## 测试策略

### 单元测试

新增覆盖：

1. 插件入口会自动注册自定义 API
2. 插件入口会向 OpenClaw 注册 provider auth
3. provider auth 输出的 `configPatch` 正确
4. 包根 manifest/package 元数据满足 OpenClaw 发现要求

### 集成/行为测试

用 stub `api` 与 stub `prompter` 验证：

1. `register(api)` 的 side effects
2. `auth.run(ctx)` 的提示顺序与输出结构

## 成功标准

满足以下条件即视为本阶段完成：

1. 仓库可被 OpenClaw 识别为合法插件包
2. `register(api)` 会自动注册 `codex-pool-codex`
3. `openclaw models auth login --provider codex-pool --set-default` 所需的 provider auth 已就位
4. README 能清楚说明官方接入路径
