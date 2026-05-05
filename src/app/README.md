# `src/app` · 应用入口与装配

把 L1/L2/L3/UI 各层拼装起来、注入 React 根节点。**应用级组合根**。

## 规划文件

| 文件           | 职责                                                            |
| -------------- | --------------------------------------------------------------- |
| `main.tsx`     | React 19 `createRoot` 入口（当前为占位，后续引入 `App` 等组件） |
| `App.tsx`      | 顶层组件：装配 `Device` + 引擎 + 游戏注册表                     |
| `registry.ts`  | 游戏注册表：把 `src/games/*` 汇总成一份列表                     |
| `bootstrap.ts` | 运行时引擎装配（`createRealtimeContext` 等）                    |
| `store.ts`     | Zustand 全局 UI 状态（音量、主题、当前游戏等）                  |

## 规则

- **唯一可同时依赖 React 和引擎层的地方**。下游层之间仍需单向依赖。
- **不写业务逻辑**：业务归 `games/` 和 `sdk/`，这里只做装配。
- **依赖注入**：引擎实例通过 props 或 Context 传给 UI，不走模块级单例。

完整方案见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §2。
