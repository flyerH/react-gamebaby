/**
 * Snake RLEnv 适配器
 *
 * 把 Snake 的纯函数 init/step/onButton 包装成 Gym 风格的 RLEnv 接口，
 * 供 DQN 等智能体使用。
 *
 * 观测编码：3 通道二值网格
 *   - 通道 0：蛇头位置（单个 1）
 *   - 通道 1：蛇身位置（不含头）
 *   - 通道 2：食物位置（单个 1）
 *
 * Reward 设计：
 *   - 吃到食物：+1.0
 *   - 每步存活：+0.01
 *   - 死亡：-1.0
 *   - 超过 maxIdleSteps 不吃食物：强制结束 + -1.0
 */

import { createHeadlessContext } from '@/platform/headless';
import { toGameEnv } from '@/sdk';

import type { RLEnv, StepResult } from '@/ai/rl-env';

import { init, onButton, step } from './logic';
import type { SnakeState } from './state';

const DEFAULT_SEED = 42;
const DEFAULT_WIDTH = 10;
const DEFAULT_HEIGHT = 20;

/** 动作空间：四个方向键 */
const ACTION_SPACE = ['Up', 'Down', 'Left', 'Right'] as const;
type SnakeAction = (typeof ACTION_SPACE)[number];

export interface SnakeRLEnvOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  /**
   * 连续多少步不吃食物就强制结束
   *
   * 防止 agent 学会"原地绕圈保命"而不吃食物的退化策略。
   * 默认 width * height（棋盘格数），足够遍历全场。
   */
  readonly maxIdleSteps?: number;
}

export function createSnakeRLEnv(opts: SnakeRLEnvOptions = {}): RLEnv<SnakeRLState, SnakeAction> {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const baseSeed = opts.seed ?? DEFAULT_SEED;
  const maxIdle = opts.maxIdleSteps ?? width * height;
  const channels = 3;

  return {
    actionSpace: ACTION_SPACE,
    observationShape: [width, height, channels],

    reset(seed?: number): SnakeRLState {
      const ctx = createHeadlessContext({ seed: seed ?? baseSeed, width, height });
      const env = toGameEnv(ctx);
      const raw = init(env);
      // 跳过 awaitingFirstMove，让 agent 立即可操作
      const state: SnakeState = { ...raw, awaitingFirstMove: false };
      return { game: state, env, score: 0, idleSteps: 0 };
    },

    step(rlState: SnakeRLState, action: SnakeAction): StepResult<SnakeRLState> {
      const { game: prev, env } = rlState;
      const prevScore = prev.score;

      // 先按键改方向，再 tick 推进一步
      const afterBtn = onButton(env, prev, action, 'press');
      const next = step(env, afterBtn);

      const ate = next.score > prevScore;
      const dead = next.over;
      const idleSteps = ate ? 0 : rlState.idleSteps + 1;
      const idleTimeout = idleSteps >= maxIdle;

      let reward: number;
      if (dead) {
        reward = -1.0;
      } else if (ate) {
        reward = 1.0;
      } else {
        reward = 0.01;
      }

      if (idleTimeout && !dead) {
        reward = -1.0;
      }

      const done = dead || idleTimeout;

      return {
        state: { game: next, env, score: next.score, idleSteps },
        reward,
        done,
      };
    },

    encodeState(rlState: SnakeRLState): Float32Array {
      const size = width * height * channels;
      const obs = new Float32Array(size);
      const { game } = rlState;

      // 通道 0：蛇头
      const head = game.body[0];
      if (head) {
        const [hx, hy] = head;
        obs[hy * width + hx] = 1;
      }

      // 通道 1：蛇身（不含头）
      const ch1Offset = width * height;
      for (let i = 1; i < game.body.length; i++) {
        const seg = game.body[i];
        if (seg) {
          const [sx, sy] = seg;
          obs[ch1Offset + sy * width + sx] = 1;
        }
      }

      // 通道 2：食物
      const ch2Offset = width * height * 2;
      if (game.food) {
        const [fx, fy] = game.food;
        obs[ch2Offset + fy * width + fx] = 1;
      }

      return obs;
    },
  };
}

/**
 * RL 环境内部状态
 *
 * 包装了 SnakeState + GameEnv 引用 + idle 计步器。
 * 对 DQN agent 而言是不透明的——它只看 encodeState 的输出。
 */
export interface SnakeRLState {
  readonly game: SnakeState;
  readonly env: ReturnType<typeof toGameEnv>;
  readonly score: number;
  readonly idleSteps: number;
}
