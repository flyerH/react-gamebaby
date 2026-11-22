# src/engine/ · 硬件接口约束

本目录是硬件抽象层：Screen / Ticker / InputBus / Sound / Storage / Counter / Toggle / RNG。

## 硬规则

- **不碰宿主**：不得 `import` React，不得使用 `document`、`window`、`navigator`、`setTimeout` 等宿主 API。本目录代码必须能在 Node 中运行（RL 训练依赖）；需要计时时由调用方注入（见 `repeat.ts`）。
- **确定性**：禁用 `Math.random()` / `Date.now()` / `performance.now()`。随机走 `mulberry32` seed PRNG，时间走 Ticker 逻辑时钟。
- **接口在 `types.ts` 集中定义**：所有公开接口（`Screen`、`Ticker`、`InputBus` 等）写在 `types.ts`，实现文件 import 接口后提供工厂函数。
- **平台无关的通用实现**放这里（`screen.ts`、`input.ts`、`counter.ts`、`rng.ts`、`sound.ts`、`storage.ts`）；平台特定实现放 `src/platform/<env>/`。

## 判断标准

它需要知道游戏接口吗？不需要 → 放这里。需要的话，游戏作者使用的放 `src/sdk/`，负责调度游戏的放 `src/machine/`。

## 依赖方向

- 只依赖自身和标准库
- 不得 import `@/sdk`、`@/games`、`@/machine`、`@/ui`、`@/ai`、`@/platform`、`@/app`
