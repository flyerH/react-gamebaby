# src/games/ · L1 Games 层约束

每款游戏一个子目录（`snake/`、`tetris/`、`tank/`…），实现 `Game<S>` 接口。

## 硬规则

- **纯函数**：`init` / `step` / `render` / `onButton` 除 `env: GameEnv` 参数外不得有外部副作用、不得引用模块级可变状态。
- **State 不可变**：所有字段 `readonly`，函数返回新对象而非修改原 state。
- **确定性**：随机走 `env.rng()`，时间走 `env.now()`。禁用 `Math.random()` / `Date.now()` / `performance.now()`。
- **不依赖 DOM / React**：Games 层必须能在 Node 中运行（RL 训练、单元测试）。

## 目录结构

每款游戏至少包含：

```
src/games/<name>/
  index.ts    —— 导出 Game<S> 对象（id / name / preview + init / step / render / onButton）
  state.ts    —— 状态类型定义 + 纯辅助函数
  logic.ts    —— 核心游戏逻辑（init / step / render / onButton 实现）
  preview.ts  —— 菜单预览点阵
  __tests__/  —— 单元测试
```

可选文件：`rl.ts`（RLEnv 适配器，给 RL 训练用）。

## 依赖方向

- 可 import `@/sdk`（Game 接口、GameEnv、Pixel 等类型）
- 可 import `@/engine/types`（Button、ButtonAction 等类型）
- 不得 import `@/ui`、`@/platform`、`@/ai`、`@/app`
