/**
 * DQN Agent —— Deep Q-Network 实现
 *
 * 核心组件：
 * - Q-Network：输入 observation，输出每个 action 的 Q 值
 * - Target Network：定期从 Q-Network 同步权重，稳定训练
 * - Epsilon-greedy 探索：epsilon 从高到低线性衰减
 *
 * 依赖 @tensorflow/tfjs（纯 JS，浏览器/Node 通用）。
 * 训练脚本在 Node 中 import 本模块即可运行。
 */

import * as tf from '@tensorflow/tfjs';

import { mulberry32 } from '@/engine/rng';

import type { SampledBatch } from './replay-buffer';

export interface DQNConfig {
  /** 观测张量形状，如 [10, 10, 3] */
  readonly observationShape: readonly number[];
  /** 动作数量 */
  readonly numActions: number;
  /** 学习率 */
  readonly learningRate?: number;
  /** 折扣因子 gamma */
  readonly gamma?: number;
  /** epsilon 起始值 */
  readonly epsilonStart?: number;
  /** epsilon 最终值 */
  readonly epsilonEnd?: number;
  /** epsilon 从 start 衰减到 end 所需步数 */
  readonly epsilonDecaySteps?: number;
  /** 每隔多少训练步同步 target network */
  readonly targetUpdateFreq?: number;
}

export interface DQNAgent {
  /**
   * 根据当前观测选择动作（epsilon-greedy）
   *
   * @param obs 展平的 Float32Array
   * @param epsilon 当前探索率；不传则用内部衰减值
   * @returns 动作 index
   */
  act(obs: Float32Array, epsilon?: number): number;

  /** 当前 epsilon 值（根据已训练步数自动衰减） */
  readonly epsilon: number;

  /**
   * 用一个 batch 做一步梯度更新
   *
   * @returns 本次的平均 TD loss
   */
  train(batch: SampledBatch): number;

  /** 已执行的训练步数 */
  readonly trainSteps: number;

  /** 手动同步 target network（通常不需要，train 内部按频率自动同步） */
  syncTarget(): void;

  /** 保存模型到指定路径（Node）或下载（浏览器） */
  save(path: string): Promise<void>;

  /** 从路径加载模型权重 */
  load(path: string): Promise<void>;

  /** 释放 GPU/CPU 内存 */
  dispose(): void;
}

/**
 * 构建 Q-Network
 *
 * 全连接架构：Flatten → Dense(128) → Dense(64) → Dense(numActions)
 *
 * 对 10x10x3=300 维输入，全连接比 Conv2D 在纯 JS 后端快 10 倍以上，
 * 且对小棋盘的策略学习效果足够。参数量约 45K。
 */
function buildQNetwork(
  inputShape: number[],
  numActions: number,
  learningRate: number
): tf.LayersModel {
  const flatSize = inputShape.reduce((a, b) => a * b, 1);
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [flatSize],
      units: 128,
      activation: 'relu',
    })
  );

  model.add(
    tf.layers.dense({
      units: 64,
      activation: 'relu',
    })
  );

  model.add(
    tf.layers.dense({
      units: numActions,
    })
  );

  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'meanSquaredError',
  });

  return model;
}

export function createDQNAgent(config: DQNConfig): DQNAgent {
  const {
    observationShape,
    numActions,
    learningRate = 0.001,
    gamma = 0.99,
    epsilonStart = 1.0,
    epsilonEnd = 0.05,
    epsilonDecaySteps = 5000,
    targetUpdateFreq = 1000,
  } = config;

  const inputShape = [...observationShape] as number[];
  const flatSize = inputShape.reduce((a, b) => a * b, 1);
  const qNetwork = buildQNetwork(inputShape, numActions, learningRate);
  const targetNetwork = buildQNetwork(inputShape, numActions, learningRate);

  // 初始同步
  syncWeights(qNetwork, targetNetwork);

  let trainStepCount = 0;
  const rng = mulberry32(12345);

  function currentEpsilon(): number {
    const progress = Math.min(trainStepCount / epsilonDecaySteps, 1.0);
    return epsilonStart + (epsilonEnd - epsilonStart) * progress;
  }

  function syncWeights(source: tf.LayersModel, target: tf.LayersModel): void {
    const sourceWeights = source.getWeights();
    target.setWeights(sourceWeights);
  }

  return {
    get epsilon(): number {
      return currentEpsilon();
    },

    get trainSteps(): number {
      return trainStepCount;
    },

    act(obs: Float32Array, epsilon?: number): number {
      const eps = epsilon ?? currentEpsilon();
      if (rng() < eps) {
        return Math.floor(rng() * numActions);
      }

      return tf.tidy(() => {
        const input = tf.tensor(obs, [1, flatSize]);
        const qValues = qNetwork.predict(input) as tf.Tensor;
        return qValues.argMax(1).dataSync()[0] ?? 0;
      });
    },

    train(batch: SampledBatch): number {
      const batchSize = batch.actions.length;
      const optimizer = (qNetwork as tf.Sequential).optimizer;

      // 输入张量在 minimize 闭包内被引用，闭包外 dispose
      const obsTensor = tf.tensor(batch.obs, [batchSize, flatSize]);
      const actionsTensor = tf.tensor1d(batch.actions, 'int32');
      const rewardsTensor = tf.tensor1d(batch.rewards);
      const nextObsTensor = tf.tensor(batch.nextObs, [batchSize, flatSize]);
      const donesTensor = tf.tensor1d(batch.dones);

      let targets: tf.Tensor | null = null;
      let lossTensor: tf.Scalar | null = null;
      let lossValue = 0;

      try {
        // target Q 在 minimize 闭包外先算好：targetNetwork 不参与梯度，提前算
        // 既避免重复前向，也防止 minimize 把 targetNetwork 的权重误当成可训练变量
        targets = tf.tidy(() => {
          const nextQValues = targetNetwork.predict(nextObsTensor) as tf.Tensor;
          const maxNextQ = nextQValues.max(1);
          return rewardsTensor.add(
            maxNextQ.mul(tf.scalar(gamma)).mul(tf.scalar(1).sub(donesTensor))
          );
        });

        // minimize 一次性完成前向 + 反向 + 取 loss（returnCost=true）
        lossTensor = optimizer.minimize(
          () =>
            tf.tidy(() => {
              const currentQValues = qNetwork.predict(obsTensor) as tf.Tensor;
              const actionMask = tf.oneHot(actionsTensor, numActions);
              const currentQ = currentQValues.mul(actionMask).sum(1);
              const tdLoss: tf.Scalar = targets!.sub(currentQ).square().mean();
              return tdLoss;
            }),
          /* returnCost */ true
        );

        lossValue = lossTensor ? (lossTensor.dataSync()[0] ?? 0) : 0;
      } finally {
        lossTensor?.dispose();
        targets?.dispose();
        obsTensor.dispose();
        actionsTensor.dispose();
        rewardsTensor.dispose();
        nextObsTensor.dispose();
        donesTensor.dispose();
      }

      trainStepCount++;

      // 定期同步 target network
      if (trainStepCount % targetUpdateFreq === 0) {
        syncWeights(qNetwork, targetNetwork);
      }

      return lossValue;
    },

    syncTarget(): void {
      syncWeights(qNetwork, targetNetwork);
    },

    async save(path: string): Promise<void> {
      await qNetwork.save(`file://${path}`);
    },

    async load(path: string): Promise<void> {
      const loaded = await tf.loadLayersModel(`file://${path}/model.json`);
      qNetwork.setWeights(loaded.getWeights());
      syncWeights(qNetwork, targetNetwork);
      loaded.dispose();
    },

    dispose(): void {
      qNetwork.dispose();
      targetNetwork.dispose();
    },
  };
}
