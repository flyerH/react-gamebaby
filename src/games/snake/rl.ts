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
/** 训练 / 推理共用的 Snake RL 场地尺寸；模型按此尺寸训练 */
export const SNAKE_RL_WIDTH = 10;
export const SNAKE_RL_HEIGHT = 20;
/** 观测通道数：蛇头 / 蛇身 / 食物 */
export const SNAKE_RL_CHANNELS = 3;

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
  const width = opts.width ?? SNAKE_RL_WIDTH;
  const height = opts.height ?? SNAKE_RL_HEIGHT;
  // 入口 fail-fast：非法 width/height 不延后到 reset/encodeState 才报
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`createSnakeRLEnv: 非法尺寸 width=${width}, height=${height}`);
  }
  const baseSeed = opts.seed ?? DEFAULT_SEED;
  const maxIdle = opts.maxIdleSteps ?? width * height;
  if (!Number.isInteger(maxIdle) || maxIdle <= 0) {
    throw new Error(`createSnakeRLEnv: 非法 maxIdleSteps=${maxIdle}`);
  }

  return {
    actionSpace: ACTION_SPACE,
    observationShape: [width, height, SNAKE_RL_CHANNELS],

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
      return encodeSnakeObs(rlState.game, width, height);
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

/**
 * 将 SnakeState 编码为 3 通道二值观测向量（与训练时一致）
 *
 * 独立函数，供浏览器推理时直接调用（不需要完整 RLEnv）。
 * 通道 0：蛇头 / 通道 1：蛇身 / 通道 2：食物
 */
export function encodeSnakeObs(game: SnakeState, width: number, height: number): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodeSnakeObs: 非法尺寸 width=${width}, height=${height}`);
  }
  const obs = new Float32Array(width * height * SNAKE_RL_CHANNELS);
  /**
   * 越界 = 上游 state 与 width/height 配置不一致的 bug，直接抛错暴露。
   * 上层 ticker / 训练循环已有 try-catch，不会因此把整个进程搞挂。
   *
   * label 用字面量联合而非模板字符串，避免训练热路径每次循环都分配新字符串；
   * 仅在罕见的越界分支才拼接索引信息
   */
  type PixelLabel = 'head' | 'body' | 'food';
  const writePixel = (
    offset: number,
    x: number,
    y: number,
    label: PixelLabel,
    bodyIndex?: number
  ): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      const where = label === 'body' ? `body[${bodyIndex ?? -1}]` : label;
      throw new Error(`encodeSnakeObs: ${where} 越界 (${x}, ${y}) vs ${width}×${height}`);
    }
    obs[offset + y * width + x] = 1;
  };

  const head = game.body[0];
  if (head) writePixel(0, head[0], head[1], 'head');

  const ch1 = width * height;
  for (let i = 1; i < game.body.length; i++) {
    const seg = game.body[i];
    if (seg) writePixel(ch1, seg[0], seg[1], 'body', i);
  }

  if (game.food) writePixel(width * height * 2, game.food[0], game.food[1], 'food');

  return obs;
}
