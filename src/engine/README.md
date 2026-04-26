# `src/engine` · L3 硬件抽象层

模拟掌机"硬件"的核心层，**完全不依赖 DOM**，浏览器运行时和 Node 训练运行时共用。

## 职责划分

| 文件（规划） | 导出                                                        | 职责                                          |
| ------------ | ----------------------------------------------------------- | --------------------------------------------- |
| `screen.ts`  | `Screen`、`createScreen`                                    | 纯帧缓冲，提供 `setPixel` / `blit` / `commit` |
| `ticker.ts`  | `Ticker`、`createRealtimeTicker`、`createHeadlessTicker`    | 固定步长游戏循环                              |
| `input.ts`   | `InputBus`、`Button`、`createInputBus`                      | 统一的按键事件总线                            |
| `sound.ts`   | `Sound`、`createSound`                                      | 8bit 音效（zzfx）                             |
| `storage.ts` | `Storage`、`createStorage`                                  | 持久化（localStorage / 内存）                 |
| `counter.ts` | `Counter`、`Toggle`                                         | 可订阅的原子状态                              |
| `rng.ts`     | `mulberry32`                                                | 可播种的伪随机数生成器（确定性回放）          |
| `context.ts` | `Context`、`createRealtimeContext`、`createHeadlessContext` | 硬件上下文工厂                                |
| `types.ts`   | 共享类型定义                                                | `Bitmap`、`SoundEffect` 等                    |

## 规则

- **禁止引入 DOM / React**。本层代码必须能在 Node 下直接运行。
- **禁止使用 `Math.random()` / `Date.now()` / `performance.now()`** —— 由 ESLint 强制。
- **所有随机源走 `ctx.rng`**（可播种）。
- 对外接口**尽量设计成纯函数**，副作用通过订阅机制对外暴露。

完整接口契约见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.1。
