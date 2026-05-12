# src/ai/ · RL 训练层约束

基于 DQN 的强化学习模块，训练用 `@tensorflow/tfjs-node`（Node），推理用 `@tensorflow/tfjs`（浏览器）。

## 硬规则

- **DOM-agnostic**：不依赖 React / DOM / 浏览器 API。
- **确定性**：随机走 `env.rng` 或传入的 seed PRNG，禁用 `Math.random()` / `Date.now()` / `performance.now()`。
- **环境与游戏解耦**：通过 `RLEnv<S, A>` 泛型接口与游戏交互，智能体不直接依赖某款游戏的内部类型。
- **训练 / 推理分离**：`@tensorflow/tfjs-node` 仅在训练脚本中 import，`src/ai/` 核心代码依赖 `@tensorflow/tfjs-core` 类型，保持浏览器可复用。

## 目录结构

```
src/ai/
  rl-env.ts        —— RLEnv 泛型接口定义
  replay-buffer.ts —— 经验回放循环缓冲区
  dqn.ts           —— DQN Agent（Q-Network + Target Network + epsilon-greedy）
  train.ts         —— Node 训练 CLI（tsx 运行）
  __tests__/       —— 单元测试
```

游戏的 RLEnv 适配器放在游戏自己的目录里（如 `src/games/snake/rl.ts`），不放在 `src/ai/`。

## 依赖方向

- 可 import `@/engine`（RNG、类型）
- 可 import `@/sdk`（GameEnv 类型）
- 可 import `@/platform/headless`（HeadlessContext，仅训练脚本）
- 可 import `@/games/<name>/rl`（具体游戏的 RLEnv 实现，仅训练脚本）
- 不得 import `@/ui`、`@/platform/browser`
