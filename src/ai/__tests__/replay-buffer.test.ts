import { describe, expect, it } from 'vitest';

import { createReplayBuffer, type Transition } from '../replay-buffer';

function makeTrans(action: number, reward: number, done: boolean): Transition {
  const obs = new Float32Array([action, 0, 0]);
  const nextObs = new Float32Array([action + 1, 0, 0]);
  return { obs, action, reward, nextObs, done };
}

describe('ReplayBuffer', () => {
  it('push / size / capacity 正确', () => {
    const buf = createReplayBuffer(5, 3);
    expect(buf.capacity).toBe(5);
    expect(buf.size).toBe(0);

    buf.push(makeTrans(0, 1.0, false));
    expect(buf.size).toBe(1);

    buf.push(makeTrans(1, 0.5, false));
    expect(buf.size).toBe(2);
  });

  it('FIFO 覆盖：超出容量后 size 不超过 capacity', () => {
    const buf = createReplayBuffer(3, 3);
    for (let i = 0; i < 10; i++) {
      buf.push(makeTrans(i, i * 0.1, i === 9));
    }
    expect(buf.size).toBe(3);
  });

  it('sample 返回正确形状', () => {
    const buf = createReplayBuffer(100, 3);
    for (let i = 0; i < 20; i++) {
      buf.push(makeTrans(i % 4, 0.1, false));
    }

    const batch = buf.sample(8, 42);
    expect(batch.obs.length).toBe(8 * 3);
    expect(batch.nextObs.length).toBe(8 * 3);
    expect(batch.actions.length).toBe(8);
    expect(batch.rewards.length).toBe(8);
    expect(batch.dones.length).toBe(8);
  });

  it('sample 超过 size 时抛错', () => {
    const buf = createReplayBuffer(100, 3);
    buf.push(makeTrans(0, 0, false));
    expect(() => buf.sample(5)).toThrow();
  });

  it('相同 rngSeed 采样结果一致', () => {
    const buf = createReplayBuffer(100, 3);
    for (let i = 0; i < 50; i++) {
      buf.push(makeTrans(i % 4, i * 0.01, false));
    }

    const a = buf.sample(10, 777);
    const b = buf.sample(10, 777);
    expect(Array.from(a.actions)).toEqual(Array.from(b.actions));
    expect(Array.from(a.rewards)).toEqual(Array.from(b.rewards));
  });

  it('done 标记正确编码为 1.0 / 0.0', () => {
    const buf = createReplayBuffer(10, 3);
    buf.push(makeTrans(0, 0, false));
    buf.push(makeTrans(1, 0, true));

    const batch = buf.sample(2, 42);
    const doneValues = Array.from(batch.dones);
    expect(doneValues).toContain(0.0);
    expect(doneValues).toContain(1.0);
  });
});
