# src/ui/ · L4 UI Shell 层约束

React 组件层：Device 外壳、ContentScreen 渲染、SidePanel 状态面板、Buttons 按键。

## 硬规则

- **只用函数组件 + hooks**，禁用 class 组件。
- **UI 与状态分离**：组件只通过 `subscribe` / `useSyncExternalStore` 观察 L3 状态，不直接修改。所有状态变更经由 L3 API（Counter.set / InputBus.emit 等）。
- **组件文件命名 `PascalCase.tsx`**，一个文件一个组件。
- **副作用只在这一层**：`useEffect`、DOM 事件监听、外部订阅只能出现在 L4。
- **样式用 CSS Modules**（`*.module.css`），不用 Tailwind / styled-components。

## 状态管理

- 单组件内部状态：`useState` / `useReducer`
- 跨组件状态：Zustand store
- `props` 超过 5 个或嵌套超过 2 层时，改走 Zustand 或拆组件

## 依赖方向

- 可 import 全部下层：`@/engine`、`@/sdk`、`@/games`、`@/platform/<env>`
- 不得被下层反向依赖（L1/L2/L3 不得 import `@/ui`）
