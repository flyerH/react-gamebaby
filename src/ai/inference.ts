/**
 * 浏览器推理 Agent —— 加载训练好的 DQN 权重，只做推理不训练
 *
 * 与 dqn.ts 的区别：
 * - 仅依赖 @tensorflow/tfjs（纯 JS，浏览器可用）
 * - 没有 target network、replay buffer、optimizer 等训练组件
 * - 推理用 epsilon=0（纯贪心），不做探索
 */

import * as tf from '@tensorflow/tfjs';

export interface ModelInfo {
  readonly params: number;
  readonly layers: number;
}

export interface InferenceAgent {
  /** 根据观测选择最优动作（纯贪心，无探索） */
  act(obs: Float32Array): number;
  readonly info: ModelInfo;
  dispose(): void;
}

/**
 * 从 URL 加载训练好的模型并返回推理 Agent
 *
 * @param modelUrl 模型 JSON 文件的 URL，如 `http://localhost:3100/api/model/model.json`
 * @param obsSize  展平的观测向量长度（如 10×10×3 = 300）
 */
export async function loadInferenceAgent(
  modelUrl: string,
  obsSize: number
): Promise<InferenceAgent> {
  const model = await tf.loadLayersModel(modelUrl);

  const params = model.getWeights().reduce((sum, w) => sum + w.size, 0);
  const info: ModelInfo = { params, layers: model.layers.length };

  return {
    info,

    act(obs: Float32Array): number {
      return tf.tidy(() => {
        const input = tf.tensor(obs, [1, obsSize]);
        const qValues = model.predict(input) as tf.Tensor;
        return qValues.argMax(1).dataSync()[0] ?? 0;
      });
    },

    dispose(): void {
      model.dispose();
    },
  };
}
