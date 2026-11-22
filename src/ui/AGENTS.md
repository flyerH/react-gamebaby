# src/ui/ · React 视图约束

React 组件层：Device 外壳、ContentScreen 渲染、SidePanel 状态面板、Buttons 按键。

## 硬规则

- **只用函数组件 + hooks**，禁用 class 组件。
- **UI 与状态分离**：组件只通过 `subscribe` / `useSyncExternalStore` 观察状态，不直接修改。输入经由回调交给入口（最终调用 `InputBus.emit`）。
- **组件文件命名 `PascalCase.tsx`**，一个文件一个组件。
- **主机规则不写在组件里**：开关机、暂停、调速等规则在 `src/machine/`，组件只负责呈现与转发输入。
- **样式用 CSS Modules**（`*.module.css`），不用 Tailwind / styled-components。

## 状态管理

- 单组件内部状态：`useState` / `useReducer`
- 跨组件状态：Zustand store
- `props` 超过 5 个或嵌套超过 2 层时，改走 Zustand 或拆组件

## 依赖方向

- 只 import `@/engine/types` 与 `@/ui` 内部模块；需要的数据与回调由 `src/app/` 的入口通过 props 传入
- 核心与 platform 不得 import `@/ui`
