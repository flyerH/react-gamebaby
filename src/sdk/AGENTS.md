# src/sdk/ · L2 SDK 层约束

游戏开发者的工具箱：`Game<S>` 接口、`GameEnv`、`Registry`、draw helpers。

## 硬规则

- **单向依赖**：只依赖 `@/engine`，不得 import `@/games`、`@/ui`、`@/ai`、`@/platform`。
- **DOM-agnostic**：不得 import React / DOM API。
- **确定性**：禁用 `Math.random()` / `Date.now()` / `performance.now()`。

## 核心文件

- `types.ts` — `Game<S>`、`GameEnv`、`Pixel`、`GameInitOptions` 等类型定义
- `env.ts` — `toGameEnv(ctx)` 从 HardwareContext 投影出 GameEnv 视图
- `registry.ts` — 游戏注册表（冻结列表、id 唯一、O(1) 查找）
- `index.ts` — 统一 re-export

## 新增接口时

扩展 `Game<S>` 接口前先问：这个方法是**所有游戏都可能需要的通用能力**，还是**某款游戏的特殊需求**？前者加到 SDK，后者留在游戏自己的模块里。
