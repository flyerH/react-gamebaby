/**
 * RLEnv —— Gym 风格的强化学习环境泛型接口
 *
 * 与具体游戏解耦：每款游戏各自实现一个 RLEnv 适配器（如
 * src/games/snake/rl.ts），智能体（DQN 等）只依赖本接口。
 *
 * 设计取舍：
 * - state 显式传入/返回（纯函数风格），而非 Gym 的隐式内部状态
 *   —— 便于确定性回放与并行训练
 * - encodeState 返回 Float32Array —— 与 tfjs tensor 输入格式对齐
 */

/** step 的返回值三元组 */
export interface StepResult<S> {
  readonly state: S;
  readonly reward: number;
  readonly done: boolean;
}

/**
 * 强化学习环境接口
 *
 * @typeParam S - 游戏状态类型
 * @typeParam A - 动作类型（默认 string，对应 Button 名）
 */
export interface RLEnv<S, A = string> {
  /** 合法动作列表（固定、不随状态变化） */
  readonly actionSpace: readonly A[];

  /**
   * 观测张量的形状描述
   *
   * 如 [10, 20, 3] 表示 10 列 × 20 行 × 3 通道。
   * DQN 据此构建输入层。
   */
  readonly observationShape: readonly number[];

  /**
   * 重置环境，返回初始状态
   *
   * @param seed 可选 PRNG 种子，不传则使用默认种子
   */
  reset(seed?: number): S;

  /**
   * 执行一步动作
   *
   * 内部按需调用游戏的 onButton + step，并计算 reward。
   * state 是不可变的，返回新 state。
   */
  step(state: S, action: A): StepResult<S>;

  /**
   * 把游戏状态编码为 Float32Array
   *
   * 长度 = observationShape 各维乘积。
   * 值域 [0, 1]（二值通道用 0/1）。
   */
  encodeState(state: S): Float32Array;
}
