/**
 * ReplayBuffer —— 经验回放循环缓冲区
 *
 * 存储 (observation, action, reward, nextObservation, done) 五元组，
 * 供 DQN 等 off-policy 算法采样训练。
 *
 * 内部用 TypedArray 存储数值数据，避免大量小对象产生 GC 压力。
 * action 用 index（整数）表示，与 actionSpace 索引对应。
 */

import { mulberry32 } from '@/engine/rng';

export interface Transition {
  readonly obs: Float32Array;
  readonly action: number;
  readonly reward: number;
  readonly nextObs: Float32Array;
  readonly done: boolean;
}

export interface SampledBatch {
  /** [batchSize, ...obsShape] 展平为 [batchSize * obsSize] */
  readonly obs: Float32Array;
  readonly actions: Int32Array;
  readonly rewards: Float32Array;
  readonly nextObs: Float32Array;
  /** 1.0 = episode 结束，0.0 = 未结束 */
  readonly dones: Float32Array;
}

export interface ReplayBuffer {
  readonly capacity: number;
  readonly size: number;
  push(t: Transition): void;
  sample(batchSize: number, rngSeed?: number): SampledBatch;
}

/**
 * @param capacity 缓冲区最大容量
 * @param obsSize 单个观测的 Float32Array 长度（= observationShape 各维乘积）
 */
export function createReplayBuffer(capacity: number, obsSize: number): ReplayBuffer {
  const obsBuf = new Float32Array(capacity * obsSize);
  const nextObsBuf = new Float32Array(capacity * obsSize);
  const actionBuf = new Int32Array(capacity);
  const rewardBuf = new Float32Array(capacity);
  const doneBuf = new Float32Array(capacity);

  let writeIdx = 0;
  let currentSize = 0;

  return {
    get capacity() {
      return capacity;
    },
    get size() {
      return currentSize;
    },

    push(t: Transition): void {
      const offset = writeIdx * obsSize;
      obsBuf.set(t.obs, offset);
      nextObsBuf.set(t.nextObs, offset);
      actionBuf[writeIdx] = t.action;
      rewardBuf[writeIdx] = t.reward;
      doneBuf[writeIdx] = t.done ? 1.0 : 0.0;

      writeIdx = (writeIdx + 1) % capacity;
      if (currentSize < capacity) currentSize++;
    },

    sample(batchSize: number, rngSeed?: number): SampledBatch {
      if (batchSize > currentSize) {
        throw new Error(`sample(${batchSize}) 超过 buffer.size(${currentSize})`);
      }
      const rng = mulberry32(rngSeed ?? 0);

      const bObs = new Float32Array(batchSize * obsSize);
      const bNextObs = new Float32Array(batchSize * obsSize);
      const bActions = new Int32Array(batchSize);
      const bRewards = new Float32Array(batchSize);
      const bDones = new Float32Array(batchSize);

      for (let i = 0; i < batchSize; i++) {
        const idx = Math.floor(rng() * currentSize);
        const srcOffset = idx * obsSize;
        const dstOffset = i * obsSize;

        bObs.set(obsBuf.subarray(srcOffset, srcOffset + obsSize), dstOffset);
        bNextObs.set(nextObsBuf.subarray(srcOffset, srcOffset + obsSize), dstOffset);
        bActions[i] = actionBuf[idx]!;
        bRewards[i] = rewardBuf[idx]!;
        bDones[i] = doneBuf[idx]!;
      }

      return {
        obs: bObs,
        actions: bActions,
        rewards: bRewards,
        nextObs: bNextObs,
        dones: bDones,
      };
    },
  };
}
