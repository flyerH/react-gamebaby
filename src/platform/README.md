# `src/platform` · 平台适配层

把 L3 Engine 在 `src/engine/types.ts` 中定义的接口（`Ticker` / `Storage` / `Sound` / `HardwareContext` ...）在具体运行环境下落到真实实现。

本层只聚焦 **有平台耦合** 的组件：需要 `requestAnimationFrame` / `window` / `localStorage` / `performance.now()` 等宿主能力才能实现的。`MemoryStorage`、`NullSound` 这类无耦合的默认实现由 `src/engine/` 提供，两个平台都直接使用。

| 子目录      | 运行环境           | 关键实现                                                                                                         |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `headless/` | Node / 训练 / 单测 | `createHeadlessTicker`（非自驱）/ `createHeadlessContext`                                                        |
| `browser/`  | 浏览器（待建）     | `createRealtimeTicker` / `bindKeyboardInput` / `createLocalStorage` / `createZzfxSound` / `createBrowserContext` |

## 规则

- 每个子目录自成一体：对应运行环境所需的有平台耦合的组件在这里一次性补齐
- 仅依赖 `@/engine/*` 的接口与跨平台通用实现，**不得**反向被 `engine/` 依赖，也**不得**跨子目录依赖对方
- 每个子目录提供自己的 `index.ts` 统一导出；调用方按运行环境从 `@/platform/<platform>` 导入
- 单元测试放在各自子目录下的 `__tests__/`
