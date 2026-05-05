# `src/ai` · 游戏 AI（自动游玩）

基于**强化学习（DQN）** 的自动游玩模块，**不依赖 DOM**，浏览器和 Node 共享。

## 职责划分

| 文件（规划）           | 导出             | 职责                                                   |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| `env.ts`               | `GameEnv`        | Gym 风格环境抽象：`reset` / `step(action)` / `observe` |
| `autopilot.ts`         | `Autopilot` 接口 | 接管输入的统一抽象                                     |
| `dqn/agent.ts`         | `DQNAgent`       | Q-network、经验回放、epsilon-greedy 探索               |
| `dqn/network.ts`       | `buildQNetwork`  | 用 `@tensorflow/tfjs`(-node) 构建模型                  |
| `dqn/replay.ts`        | `ReplayBuffer`   | 循环缓冲区                                             |
| `runtime/inference.ts` | `InferenceAgent` | 浏览器端纯推理                                         |
| `runtime/training.ts`  | `TrainingLoop`   | Node 端训练循环                                        |
| `models/`              | ——               | Git 跟踪的权重文件（Vite 打包到浏览器）                |

## 规则

- **环境与游戏解耦**：每款游戏实现 `GameEnv` 适配器，智能体接口保持一致。
- **训练（Node） / 推理（浏览器）分离**：分别用 `@tensorflow/tfjs-node` / `@tensorflow/tfjs`。
- **确定性**：随机必须走 `env.rng`，便于"失败样本重放"。
- **禁用 `Math.random()` / `Date.now()` / `performance.now()`**：由 ESLint 强制。

完整方案见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §5。
