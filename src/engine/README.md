# `src/engine` · 硬件接口

模拟掌机硬件的核心层，不依赖 DOM，Node 训练运行时和浏览器运行时共用。

本目录只保留接口与跨平台通用实现。平台专属的 `Ticker` / `Storage` / `Sound` / `Context` 组装放在 `src/platform/<platform>/`：

- `src/platform/headless/`：Node / 训练 / 单测专用
- `src/platform/browser/`：浏览器与 Android WebView 专用

## 模块

| 文件              | 导出                              | 职责                                                  |
| ----------------- | --------------------------------- | ----------------------------------------------------- |
| `types.ts`        | 所有接口与共享类型                | `Screen` / `Ticker` / `InputBus` / `HardwareContext`  |
| `rng.ts`          | `mulberry32` / `randomInt`        | 可播种 PRNG（确定性回放基石）                         |
| `counter.ts`      | `createCounter` / `createToggle`  | 可订阅的原子状态（分数、暂停等）                      |
| `screen.ts`       | `createScreen` / `bitmapFromRows` | 纯 framebuffer，提供 `setPixel` / `blit` / `commit`   |
| `input.ts`        | `createInputBus`                  | 统一按键事件总线                                      |
| `repeat.ts`       | `bindPressRepeat`                 | 长按连发；计时器由调用方注入                          |
| `frame-ticker.ts` | `createFrameTicker`               | 帧驱动 Ticker；帧调度与时钟由调用方注入               |
| `storage.ts`      | `createMemoryStorage`             | 内存键值存储（跨平台默认实现）                        |
| `sound.ts`        | `createNullSound`                 | 无声 Sound（跨平台默认实现）                          |
| `synth-sound.ts`  | `createSynthSound`                | 采样切片 + 方波合成；音频上下文与采样加载由调用方注入 |
| `index.ts`        | 统一 re-export                    | 外层只从这里导入                                      |
| `__tests__/`      | 单元测试                          | 每个模块一个 `<name>.test.ts`                         |

## 规则

- **禁止引入 DOM / React**。本层代码必须能在 Node 下直接运行。
- **禁止使用 `Math.random()` / `Date.now()` / `performance.now()`**，由 ESLint 强制。
- **所有随机源走 `ctx.rng`**（可播种）；**所有时间读取走 `ctx.now`**（逻辑时钟）。
- 对外接口尽量设计成工厂函数，副作用通过订阅机制对外暴露。

完整接口契约见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.1。
