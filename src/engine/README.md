# `src/engine` · L3 硬件抽象层

模拟掌机"硬件"的核心层，**完全不依赖 DOM**，浏览器运行时和 Node 训练运行时共用。

## 模块

| 文件         | 导出                              | 职责                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `types.ts`   | 所有接口与共享类型                | `Screen` / `Ticker` / `InputBus` / `HardwareContext` |
| `rng.ts`     | `mulberry32` / `randomInt`        | 可播种 PRNG（确定性回放基石）                        |
| `counter.ts` | `createCounter` / `createToggle`  | 可订阅的原子状态（分数、暂停等）                     |
| `storage.ts` | `createMemoryStorage`             | 键值持久化（内存版）                                 |
| `sound.ts`   | `createNullSound`                 | 8bit 音效（无声实现，浏览器运行时换为 zzfx）         |
| `screen.ts`  | `createScreen` / `bitmapFromRows` | 纯 framebuffer，提供 `setPixel` / `blit` / `commit`  |
| `input.ts`   | `createInputBus`                  | 统一按键事件总线                                     |
| `ticker.ts`  | `createHeadlessTicker`            | 固定步长循环（非自驱，外部 `advance` 推进）          |
| `context.ts` | `createHeadlessContext`           | 把上述模块组装成 `HardwareContext`                   |
| `index.ts`   | 统一 re-export                    | 外层只从这里导入                                     |
| `__tests__/` | 单元测试                          | 每个模块一个 `<name>.test.ts`                        |

## 规则

- **禁止引入 DOM / React**。本层代码必须能在 Node 下直接运行。
- **禁止使用 `Math.random()` / `Date.now()` / `performance.now()`** —— 由 ESLint 强制。
- **所有随机源走 `ctx.rng`**（可播种）；**所有时间读取走 `ctx.now`**（逻辑时钟）。
- 对外接口**尽量设计成工厂函数**，副作用通过订阅机制对外暴露。

## 运行时差异

Engine 层只提供 **headless 版本**（Node / 测试用）。浏览器专用的实现（`RealtimeTicker` / `CanvasScreen` / `KeyboardInputBus` / `LocalStorage` / `zzfxSound`）在后续版本加入 L4 runtime 层，组合出 `createRealtimeContext`。

完整接口契约见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.1。
