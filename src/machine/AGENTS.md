# src/machine/ · 主机固件约束

模式状态机（off / boot / select / playing）、菜单、开机动画与音乐、按键路由、调速、绘制、最高分。

## 硬规则

- **不碰宿主**：不得 import React，不得使用 `window` / `document` / `navigator` / `setTimeout` 等宿主 API；平台能力只通过传入的 `HardwareContext` 使用。
- **确定性**：禁用 `Math.random()` / `Date.now()` / `performance.now()`。demo 随机种子由 `MachineOptions.seed` 派生，等待类逻辑按 tick 计数。
- **规则只写在这里**：入口（`src/app/<entry>/`）只做装配，不重复实现开关机、暂停、调速等规则。
- **reducer 保持纯**：状态变化后的调速、绘制、暂停、最高分在 `dispatch` 里同步完成，不写进 reducer。

## 依赖方向

- 可 import `@/sdk`、`@/engine`
- 不得 import `@/games`（具体游戏由入口通过注册表传入）、`@/platform`、`@/ui`、`@/app`、`@/ai`
