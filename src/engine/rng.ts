/**
 * mulberry32 —— 可播种的伪随机数生成器
 *
 * 选型理由：
 * - 实现约 10 行，跨平台行为一致（仅用 32-bit 位运算 + Math.imul）
 * - 周期 2^32，伪随机质量足够游戏与 RL 训练
 * - 同一 seed 任意环境下得到完全相同的序列 —— 确定性回放的基石
 *
 * 参考：https://en.wikipedia.org/wiki/Linear_congruential_generator 的现代变体
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 返回 [min, max) 之间的整数，基于传入的 rng
 *
 * 该 helper 不自行引入时间源，保持确定性。
 *
 * 区间约束：min / max 必须是有限整数，且 max > min。否则直接抛错——
 * 让游戏 / 训练逻辑里的非法区间在最近调用栈处暴露，避免 `0 - NaN` 这
 * 种值被静默写入 state 后跨 tick 才发现。
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
    throw new Error(`randomInt: 非法区间 [${String(min)}, ${String(max)})`);
  }
  return Math.floor(rng() * (max - min)) + min;
}
