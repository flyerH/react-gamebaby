# L2 Game SDK

> 游戏开发者对外的稳定 API 层。只依赖 `@/engine/types`，不依赖任何具体平台或 UI 框架。

## 当前阶段

仅承载菜单 / 选择所需能力：

- `Game` —— 最小游戏元数据（`id` / `name` / `preview`）
- `createRegistry(games)` —— 构造游戏注册表，提供 `list()` / `get(id)` / `size`

注册表在构造时：

- 冻结输入数组（`list()` 返回同一引用，可做引用相等判断）
- 重复 id 直接抛错，避免运行时静默覆盖

## 规划

待首款真正的游戏落地时，会在不破坏现有 `Game` 字段的前提下扩展：

- `init(env)` / `step(env)` / `render(env)` —— 纯函数游戏循环
- `onButton(env, button, kind)` —— 输入回调
- `scoreOf(state)` / `isGameOver(state)` —— 渲染 SidePanel / 结束条件所需投影
- `GameEnv` —— 把 L3 `HardwareContext` 的只读切片透传给游戏开发者

这些字段都会 **optional / 有 sensible default**，以便占位游戏无需改动就能继续被注册表收录。

## 目录

```
src/sdk/
├─ types.ts      Game / Pixel / GamePreview 类型
├─ registry.ts   createRegistry 工厂 + GameRegistry 接口
├─ index.ts      对外 re-export
└─ __tests__/    单元测试
```
