# `src/platform` · 平台适配层

把 L3 Engine 在 `src/engine/types.ts` 中定义的接口（`Ticker` / `Storage` / `Sound` / `HardwareContext` ...）在具体运行环境下落到真实实现。

| 子目录      | 运行环境           | 关键实现                                                                                                         |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `headless/` | Node / 训练 / 单测 | `createHeadlessTicker` / `createMemoryStorage` / `createNullSound` / `createHeadlessContext`                     |
| `browser/`  | 浏览器（待建）     | `createRealtimeTicker` / `createLocalStorage` / `createZzfxSound` / `bindKeyboardInput` / `createBrowserContext` |

## 规则

- 每个子目录自成一体：对应运行环境所需的 `Ticker` / `Storage` / `Sound` / `Context` 在这里一次性补齐
- 仅依赖 `@/engine/*` 的接口与跨平台通用实现，**不得**反向被 `engine/` 依赖
- 每个子目录提供自己的 `index.ts` 统一导出；调用方按运行环境从 `@/platform/<platform>` 导入
- 单元测试放在各自子目录下的 `__tests__/`
