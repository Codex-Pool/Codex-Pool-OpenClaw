# Codex-Pool OpenClaw

面向 `OpenClaw` 的 `Codex-Pool` 自定义 provider/plugin。

当前目标：

- 保留 Codex 风格请求体与 SSE 语义
- 允许直接使用 `cp_...` key
- 避免内置 `openai-codex-responses` 对 JWT `accountId` 的硬依赖

## 官方接入路径

当前仓库已经支持走 OpenClaw 的官方插件 + provider auth 流程：

```bash
openclaw plugins install --link /Users/wangnov/Codex-Pool-OpenClaw
openclaw plugins enable codex-pool-openclaw
openclaw models auth login --provider codex-pool --set-default
```

这条路径会完成三件事：

- 让 OpenClaw 把本仓库识别为合法插件包
- 在运行时覆盖内置 `openai-codex-responses`，仅拦截 `cp_...` / 本地 Codex-Pool 请求
- 用 `models auth login` 把 `models.providers.codex-pool` 写进配置

注意：截至 `2026-03-09`，外部 provider 插件**不能**把自己注入 `openclaw onboard --auth-choice ...` 的内置认证选项列表；外部插件的官方模型接入路径是 `plugins install/enable + models auth login`。

## 当前能力

- 官方接入时固定使用合法配置值 `openai-codex-responses`
- 运行时仅对 `codex-pool` provider、`cp_...` key、或本地 loopback Codex 端点启用兼容层
- 默认请求路径为 `backend-api/codex/responses`
- 直接透传 `Authorization: Bearer cp_...`
- 仅在显式提供时附带 `chatgpt-account-id`
- 提供一个可直接用于 `NODE_OPTIONS=--import=...` 的 preload 入口（作为高级备用接法）
- 提供真正的 OpenClaw provider 插件入口：`./src/openclaw-plugin.js`

## 导出入口

- 包根入口：`codex-pool-openclaw`
- preload 入口：`codex-pool-openclaw/preload`

主要导出：

- `registerCodexPoolCodexProvider()`
- `registerCodexPoolCodexProviderInPiAi()`
- `createCodexPoolCodexProvider()`
- `streamCodexPoolCodexResponses()`

## `models auth login` 会写入什么

provider id 固定为：

- `codex-pool`

API id 固定为：

- `openai-codex-responses`

默认模型引用格式：

- `codex-pool/<model-id>`

认证向导会提示填写：

- Codex-Pool base URL
- `cp_...` API key
- 模型列表（逗号分隔）

然后自动写入：

- `models.providers.codex-pool`
- `agents.defaults.models`

## 写入后的配置示例

认证向导写出的 provider 结构大致如下：

```json
{
  "models": {
    "providers": {
      "codex-pool": {
        "baseUrl": "http://127.0.0.1:8091",
        "api": "openai-codex-responses",
        "apiKey": "cp_xxx",
        "models": [
          {
            "id": "gpt-5.4",
            "name": "gpt-5.4",
            "api": "openai-codex-responses",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 272000,
            "maxTokens": 32768
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "models": {
        "codex-pool/gpt-5.4": {}
      }
    }
  }
}
```

## 高级备用：preload 接法

如果你不想走插件安装流程，也可以直接 preload：

```bash
NODE_OPTIONS="--import=/Users/wangnov/Codex-Pool-OpenClaw/src/preload.js" openclaw gateway start
```

可选环境变量：

- `CODEX_POOL_OPENCLAW_API`：默认 `openai-codex-responses`
- `CODEX_POOL_OPENCLAW_SOURCE`：默认 `codex-pool-openclaw`
- `CODEX_POOL_OPENCLAW_PATH_MODE`：可选 `responses`

## 验证

运行测试：

```bash
npm test
```

当前覆盖：

- 认证头构造
- URL 与请求体
- SSE 最小流式语义
- 注册入口幂等性
- preload 自动注册
- OpenClaw 插件包 manifest / `openclaw.extensions`
- OpenClaw provider auth 输出

## 目前边界

- 这个仓库现在已经交付“可注册的自定义 API provider + OpenClaw 官方 provider 插件入口”
- 外部 provider 插件仍不能直接扩展 `openclaw onboard --auth-choice` 的内置选项
- 当前官方推荐接法是 `plugins install/enable + models auth login`
