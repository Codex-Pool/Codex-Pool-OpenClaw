# Codex-Pool OpenClaw

[中文](#中文) | [English](#english)

一个面向 `OpenClaw` 的自定义 provider/plugin，用来把 `Codex` 风格请求稳定接到 `Codex-Pool`。

---

## 中文

### 项目简介

`Codex-Pool OpenClaw` 解决的是一个很具体的接入问题：

- `OpenClaw` 内置的 `openai-codex-responses` provider 默认更偏向官方 token 语义
- `Codex-Pool` 使用的是 `cp_...` 风格凭据和本地端点
- 直接硬接时，容易在 provider 层就失败

这个插件的目标是：

- 保留 `Codex` 风格请求体与流式语义
- 兼容 `Codex-Pool` 的认证方式与本地端点
- 让 `OpenClaw` 可以直接使用 `Codex-Pool`

### 快速开始

```bash
git clone https://github.com/Codex-Pool/Codex-Pool-OpenClaw.git
cd Codex-Pool-OpenClaw
npm install
npm run build
```

在 `OpenClaw` 中安装并启用：

```bash
openclaw plugins install --link /absolute/path/to/Codex-Pool-OpenClaw
openclaw plugins enable codex-pool-openclaw
openclaw models auth login --provider codex-pool --set-default
openclaw gateway restart
```

### 插件做了什么

- 接管 `Codex-Pool` 场景下的 `openai-codex-responses` 兼容层
- 保留工具调用、reasoning、streaming 等关键语义
- 支持 `cp_...` API key 与本地 loopback 端点

### 常用开发命令

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:dist
npm run ci
```

### 边界说明

- 这个仓库专注于 `OpenClaw` 与 `Codex-Pool` 的 provider 兼容层
- 它不会替代 `Codex-Pool` 后端本身的可用性治理
- 外部 provider 插件目前仍不能直接扩展 `openclaw onboard --auth-choice`

[返回顶部](#codex-pool-openclaw)

---

## English

### Overview

`Codex-Pool OpenClaw` is a custom provider/plugin for wiring `Codex`-style traffic from `OpenClaw` into `Codex-Pool`.

It focuses on a specific integration gap:

- OpenClaw’s built-in `openai-codex-responses` provider is designed around official token assumptions
- `Codex-Pool` uses `cp_...` credentials and local endpoints
- a direct connection can fail before the request even reaches the backend

This plugin is designed to:

- preserve Codex-style request and streaming semantics
- adapt authentication for `Codex-Pool`
- let OpenClaw work directly with `Codex-Pool`

### Quick Start

```bash
git clone https://github.com/Codex-Pool/Codex-Pool-OpenClaw.git
cd Codex-Pool-OpenClaw
npm install
npm run build
```

Install and enable it in OpenClaw:

```bash
openclaw plugins install --link /absolute/path/to/Codex-Pool-OpenClaw
openclaw plugins enable codex-pool-openclaw
openclaw models auth login --provider codex-pool --set-default
openclaw gateway restart
```

### What the plugin covers

- overrides the compatibility layer for Codex-Pool traffic
- preserves tool calling, reasoning, and streaming semantics
- supports `cp_...` API keys and local loopback endpoints

### Common development commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:dist
npm run ci
```

### Boundaries

- this repository focuses on the provider compatibility layer between OpenClaw and Codex-Pool
- it does not replace backend-side availability handling inside Codex-Pool
- external provider plugins still cannot extend `openclaw onboard --auth-choice` directly

[Back to top](#codex-pool-openclaw)
