import { describe, it, expect } from 'vitest';
import { mulberry32, randomInt } from '../rng';

describe('mulberry32', () => {
  it('同一 seed 产出同一序列（确定性）', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('不同 seed 产出不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 20; i++) {
      seqA.push(a());
      seqB.push(b());
    }
    expect(seqA).not.toEqual(seqB);
  });

  it('输出范围在 [0, 1) 之间', () => {
    const rng = mulberry32(123456);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('分布大致均匀：10 桶落点偏差 < 3%', () => {
    const rng = mulberry32(2026);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      buckets[Math.floor(rng() * 10)]!++;
    }
    const expected = n / 10;
    for (const c of buckets) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.03);
    }
  });

  it('跨会话行为一致：前 5 个值是稳定常量', () => {
    // 把此处当作"锚点测试"：若重构 mulberry32 使序列变化，会立刻暴露。
    const rng = mulberry32(0);
    const first5 = [rng(), rng(), rng(), rng(), rng()];
    expect(first5).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086,
    ]);
  });
});

describe('randomInt', () => {
  it('结果落在 [min, max) 内', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 3, 10);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('相同 rng 状态下可复现', () => {
    const seq = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 10 }, () => randomInt(r, 0, 100));
    };
    expect(seq(99)).toEqual(seq(99));
  });

  it('非法区间抛错：max <= min / 非整数 / NaN / Infinity', () => {
    const rng = mulberry32(1);
    expect(() => randomInt(rng, 5, 5)).toThrow(); // 空区间
    expect(() => randomInt(rng, 10, 3)).toThrow(); // 反向
    expect(() => randomInt(rng, 0.5, 10)).toThrow(); // 非整数
    expect(() => randomInt(rng, 0, 10.5)).toThrow();
    expect(() => randomInt(rng, NaN, 10)).toThrow();
    expect(() => randomInt(rng, 0, Infinity)).toThrow();
  });
});
