import { describe, it, expect } from 'vitest';

import {
  createBootAnimation,
  initialBootState,
  projectBoot,
  spiralTrail,
  stepBoot,
} from '../boot-animation';

describe('spiralTrail', () => {
  it('10×20 屏幕生成 5 层螺旋轨迹，总点数 = 全屏像素数（无遗漏无重复）', () => {
    const trail = spiralTrail(10, 20);
    // 每层周长 = 2w + 2h - 8i - 4，5 层加起来 200（10×20）
    expect(trail.length).toBe(10 * 20);
    expect(new Set(trail.map((p) => p.join(','))).size).toBe(trail.length);
  });

  it('第一个点是 (0,0)，最后一个点在内圈', () => {
    const trail = spiralTrail(10, 20);
    expect(trail[0]).toEqual([0, 0]);
    const last = trail[trail.length - 1];
    expect(last?.[0]).toBeGreaterThanOrEqual(4);
    expect(last?.[0]).toBeLessThanOrEqual(5);
  });

  it('所有坐标在 width×height 范围内', () => {
    const w = 10;
    const h = 20;
    for (const [x, y] of spiralTrail(w, h)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(h);
    }
  });
});

describe('stepBoot / projectBoot', () => {
  it('cursor 每 tick +1，走完 trail 后环回 0', () => {
    const anim = createBootAnimation(10, 20);
    let state = initialBootState();
    expect(state.cursor).toBe(0);

    for (let i = 0; i < anim.trail.length; i++) {
      state = stepBoot(anim, state);
    }
    expect(state.cursor).toBe(anim.trail.length);

    state = stepBoot(anim, state);
    expect(state.cursor).toBe(0);
  });

  it('projectBoot 累积亮起 logo ∪ trail[0..cursor]', () => {
    const anim = createBootAnimation(10, 20);

    const first = projectBoot(anim, { cursor: 0 });
    expect(first.length).toBe(anim.logo.length);

    const mid = projectBoot(anim, { cursor: 3 });
    expect(mid.length).toBe(anim.logo.length + 3);
    expect(mid.slice(anim.logo.length)).toEqual(anim.trail.slice(0, 3));
  });

  it('projectBoot 裁剪超出 trail 长度的 cursor', () => {
    const anim = createBootAnimation(10, 20);
    const full = projectBoot(anim, { cursor: anim.trail.length + 100 });
    expect(full.length).toBe(anim.logo.length + anim.trail.length);
  });
});
