# src/engine/ · L3 Engine 层约束

本目录是**硬件抽象层**：Screen / Ticker / InputBus / Sound / Storage / Counter / Toggle / RNG。

## 硬规则

- **完全 DOM-agnostic**：不得 `import` React、`document`、`window`、`HTMLElement`、`navigator` 等浏览器 API。本目录代码必须能在 Node 中运行（RL 训练依赖）。
- **确定性**：禁用 `Math.random()` / `Date.now()` / `performance.now()`。随机走 `mulberry32` seed PRNG，时间走 Ticker 逻辑时钟。
- **接口在 `types.ts` 集中定义**：所有公开接口（`Screen`、`Ticker`、`InputBus` 等）写在 `types.ts`，实现文件 import 接口后提供工厂函数。
- **平台无关的通用实现**放这里（`screen.ts`、`input.ts`、`counter.ts`、`rng.ts`、`sound.ts`、`storage.ts`）；平台特定实现放 `src/platform/<env>/`。

## 判断标准

问自己：**删掉这个文件，掌机还能开机吗？** 不能 → 放这里。能 → 放 `src/sdk/`。

## 依赖方向

- 只依赖自身和标准库
- 不得 import `@/sdk`、`@/games`、`@/ui`、`@/ai`、`@/platform`
