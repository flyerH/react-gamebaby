import { describe, expect, it } from 'vitest';

import { createSnakeRLEnv } from '../rl';

describe('SnakeRLEnv', () => {
  const env = createSnakeRLEnv({ width: 10, height: 10, seed: 123 });

  it('actionSpace 包含四个方向', () => {
    expect(env.actionSpace).toEqual(['Up', 'Down', 'Left', 'Right']);
  });

  it('observationShape 正确', () => {
    expect(env.observationShape).toEqual([10, 10, 3]);
  });

  it('reset 返回合法初始状态', () => {
    const state = env.reset(42);
    expect(state.game.over).toBe(false);
    expect(state.game.awaitingFirstMove).toBe(false);
    expect(state.game.body.length).toBeGreaterThanOrEqual(1);
    expect(state.idleSteps).toBe(0);
  });

  it('encodeState 输出长度 = w*h*3', () => {
    const state = env.reset(42);
    const obs = env.encodeState(state);
    expect(obs.length).toBe(10 * 10 * 3);
    expect(obs).toBeInstanceOf(Float32Array);
  });

  it('encodeState 蛇头通道只有一个 1', () => {
    const state = env.reset(42);
    const obs = env.encodeState(state);
    const ch0 = obs.slice(0, 100);
    const headCount = ch0.reduce((s, v) => s + v, 0);
    expect(headCount).toBe(1);
  });

  it('step 返回 reward 和 done', () => {
    const s0 = env.reset(42);
    const { state: s1, reward, done } = env.step(s0, 'Right');
    expect(typeof reward).toBe('number');
    expect(typeof done).toBe('boolean');
    expect(s1.game).toBeDefined();
  });

  it('存活步的 reward > 0', () => {
    const s0 = env.reset(42);
    const { reward, done } = env.step(s0, 'Right');
    if (!done) {
      expect(reward).toBe(0.01);
    }
  });

  it('同一 seed reset 结果确定性一致', () => {
    const a = env.reset(999);
    const b = env.reset(999);
    expect(a.game.body).toEqual(b.game.body);
    expect(a.game.food).toEqual(b.game.food);
  });

  it('idle 超时强制结束', () => {
    const shortEnv = createSnakeRLEnv({ width: 10, height: 10, seed: 1, maxIdleSteps: 5 });
    let state = shortEnv.reset(1);
    let done = false;
    let steps = 0;
    // 一直走同一方向，大概率不会吃到食物，直到 idle 超时或撞墙
    while (!done && steps < 20) {
      const result = shortEnv.step(state, 'Right');
      state = result.state;
      done = result.done;
      steps++;
    }
    expect(done).toBe(true);
  });

  it('死亡 reward = -1', () => {
    const tinyEnv = createSnakeRLEnv({ width: 5, height: 5, seed: 42 });
    let state = tinyEnv.reset(42);
    let lastReward = 0;
    // 持续往右走直到撞墙
    for (let i = 0; i < 20; i++) {
      const result = tinyEnv.step(state, 'Right');
      lastReward = result.reward;
      state = result.state;
      if (result.done) break;
    }
    expect(lastReward).toBe(-1.0);
  });
});
