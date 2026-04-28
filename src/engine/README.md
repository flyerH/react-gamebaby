# `src/engine` · L3 硬件抽象层

模拟掌机"硬件"的核心层，**完全不依赖 DOM**，Node 训练运行时和浏览器运行时共用。

本目录只保留**接口**与**跨平台通用实现**。平台专属的 `Ticker` / `Storage` / `Sound` / `Context` 组装放在 `src/platform/<platform>/`：

- `src/platform/headless/`：Node / 训练 / 单测专用
- `src/platform/browser/`：浏览器专用（待建）

## 模块

| 文件         | 导出                              | 职责                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `types.ts`   | 所有接口与共享类型                | `Screen` / `Ticker` / `InputBus` / `HardwareContext` |
| `rng.ts`     | `mulberry32` / `randomInt`        | 可播种 PRNG（确定性回放基石）                        |
| `counter.ts` | `createCounter` / `createToggle`  | 可订阅的原子状态（分数、暂停等）                     |
| `screen.ts`  | `createScreen` / `bitmapFromRows` | 纯 framebuffer，提供 `setPixel` / `blit` / `commit`  |
| `input.ts`   | `createInputBus`                  | 统一按键事件总线                                     |
| `index.ts`   | 统一 re-export                    | 外层只从这里导入                                     |
| `__tests__/` | 单元测试                          | 每个模块一个 `<name>.test.ts`                        |

## 规则

- **禁止引入 DOM / React**。本层代码必须能在 Node 下直接运行。
- **禁止使用 `Math.random()` / `Date.now()` / `performance.now()`** —— 由 ESLint 强制。
- **所有随机源走 `ctx.rng`**（可播种）；**所有时间读取走 `ctx.now`**（逻辑时钟）。
- 对外接口**尽量设计成工厂函数**，副作用通过订阅机制对外暴露。

完整接口契约见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.1。
