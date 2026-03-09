# Codex-Pool OpenClaw TypeScript 重构与发布设计

## 背景

当前 `Codex-Pool-OpenClaw` 已经完成了可用的 OpenClaw provider/plugin 适配，但仓库仍以手写 JavaScript 为主，构建、类型检查、lint、格式化、覆盖率与发布流程都还比较轻量。这会带来几个现实问题：

- 开发时缺少静态类型约束，回归风险主要依赖测试兜底
- 对外发布时没有明确的“源码开发 / 构建产物发布”边界
- GitHub Actions 尚未建立 tag 驱动的 npm 发布链路
- 代码质量门禁还没有收敛为一套稳定、自动化、可复用的标准

## 目标

本次重构目标如下：

1. 开发阶段统一迁移到 TypeScript
2. 发布阶段统一输出 `dist/` 下的 JavaScript 构建产物
3. 为请求、流、注册、认证等核心行为补齐更高覆盖率测试
4. 建立 `lint + format + typecheck + test + coverage` 的质量门禁
5. 建立 tag 驱动的 npm publish CI，并采用当前主流最佳实践

## 非目标

本次不做以下事情：

- 不改动插件已验证通过的外部行为语义
- 不新增与 `Codex-Pool` / `OpenClaw` 适配无关的功能
- 不擅自决定新的开源许可证

## 方案选择

### 方案 A：TS 源码开发 + JS 发布产物（采用）

仓库源码迁移为 `src/**/*.ts`，通过构建输出 `dist/**/*.js` 与类型声明，`package.json` 的 `main`、`exports`、`openclaw.extensions` 均指向 `dist`。

优点：

- 本地开发拥有完整类型系统
- 发布包不依赖运行时 TS loader
- 符合 OpenClaw 对“单独发布插件”推荐指向构建入口的做法
- 更容易在 CI 中做稳定验证与 npm 发布

缺点：

- 引入构建步骤
- 需要维护一组 TypeScript / lint / format 配置

### 方案 B：纯 TS 运行时

保留全部 `.ts` 直接运行，发布也发 TS 源码。

不采用原因：

- 对外分发时更依赖宿主运行时 loader
- 调试和兼容性问题更难隔离
- 不符合当前仓库“发布给别人直接安装”的稳定性诉求

## 技术设计

## 1. 代码结构

保留现有目录语义，但迁移为 TypeScript：

- `src/openclaw/*.ts`
- `src/plugin/*.ts`
- `src/provider/*.ts`
- `src/*.ts`
- `tests/*.test.ts`

根入口 `index.ts` 负责导出注册 API；OpenClaw 插件入口编译后位于 `dist/src/openclaw-plugin.js`。

## 2. 构建策略

采用 `tsc` 作为主构建工具，理由：

- 当前仓库模块结构简单，不需要额外 bundling
- 保持目录结构有利于调试与源码映射
- 可以稳定输出 `.d.ts`
- 依赖更少，发布链更透明

构建输出：

- `dist/**/*.js`
- `dist/**/*.d.ts`
- `dist/**/*.js.map`

## 3. 质量门禁

采用以下工具链：

- `typescript`：类型检查与编译
- `vitest`：单元测试与覆盖率
- `eslint` + `typescript-eslint`：静态检查
- `prettier`：格式化

统一脚本：

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run format:check`
- `npm run test`
- `npm run coverage`
- `npm run ci`

其中 `npm run ci` 作为 CI 主入口，串联：

1. `format:check`
2. `lint`
3. `typecheck`
4. `test`

## 4. 测试覆盖策略

优先补齐以下高价值路径：

- `provider/request`：消息转换、tools、reasoning、temperature、headers 相关分支
- `provider/stream`：SSE 事件映射、错误路径、usage/stopReason 归一化
- `plugin/register`：覆盖内置 provider、幂等注册、fallback 分支
- `openclaw/provider-auth`：配置写入、默认模型、输入校验
- `package` / `manifest`：发布入口、`openclaw.extensions` 与构建目录一致性

覆盖率策略：

- 先提升关键模块覆盖
- 在 CI 中至少记录全局覆盖率
- 若当前代码稳定后再加硬阈值，阈值将放在实现时依据基线决定

## 5. npm 包发布设计

### 发布方式

采用 **Git tag 驱动的 GitHub Actions 发布**：

- 触发条件：推送形如 `v*.*.*` 的 tag
- 先执行完整质量门禁
- 再执行 `npm publish`

### 最佳实践

采用 npm Trusted Publishing / GitHub OIDC，而不是长期保存 `NPM_TOKEN`：

- GitHub Actions job 使用 `permissions: id-token: write`
- npm 侧配置 trusted publisher
- 发布时启用 provenance

这样可以降低长期令牌泄露风险，并让 npm 包带上来源证明。

### 版本一致性

CI 在发布前校验：

- git tag `vX.Y.Z`
- `package.json` 中 `version = X.Y.Z`

不一致则失败，避免发布与源码版本漂移。

### 包内容控制

采用 `files` 白名单控制 npm 发布内容，而不是依赖 `.npmignore`：

- `dist/`
- `README.md`
- `openclaw.plugin.json`
- `package.json`

必要时补充许可证文件；若用户未指定许可证，则先不擅自新增。

## 6. CI 设计

新增两类 workflow：

### `ci.yml`

在 `push` / `pull_request` 上运行：

- 安装依赖
- `npm run ci`
- `npm run coverage`
- 可选上传 coverage artifact

### `publish.yml`

在 tag 推送时运行：

1. checkout
2. setup-node（含 npm registry）
3. 安装依赖
4. `npm run ci`
5. `npm run build`
6. 校验 tag 与版本一致
7. `npm publish --provenance --access public`

## 7. README 与开发体验

README 更新为 TS 开发 + JS 发布模型：

- 本地开发命令
- 构建命令
- 发布说明
- tag 发布流程
- OpenClaw 加载的是构建产物，不是源码入口

## 风险与应对

### 风险 1：构建路径和 OpenClaw 发现路径不一致

应对：

- 增加 package-level 测试锁定 `main` / `exports` / `openclaw.extensions`
- 在 CI 中执行 `npm pack --dry-run` 验证发布内容

### 风险 2：TS 迁移改变运行时语义

应对：

- 严格按模块分批迁移
- 每批先补 failing test，再改实现
- 保持输出语义与现有测试一致

### 风险 3：npm Trusted Publishing 配置缺失

应对：

- workflow 支持清晰失败
- README 中注明 npm 端需要提前完成 trusted publisher 绑定

## 决策结论

采用：

- TypeScript 源码开发
- `dist/` JavaScript 发布
- `tsc + vitest + eslint + prettier`
- Git tag 驱动的 GitHub Actions npm publish
- npm Trusted Publishing / provenance

这套方案兼顾开发体验、发布稳定性与当前 OpenClaw 插件生态的实际约束。
