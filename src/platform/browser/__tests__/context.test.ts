import { describe, it, expect } from 'vitest';

import { createBrowserContext } from '../context';

describe('createBrowserContext', () => {
  it('默认尺寸 10×20（纵向），初始计数器 / 计时器数值符合期望', () => {
    const ctx = createBrowserContext({ seed: 42 });

    expect(ctx.screen.width).toBe(10);
    expect(ctx.screen.height).toBe(20);
    expect(ctx.ticker.speed).toBe(30);
    expect(ctx.ticker.tickCount).toBe(0);
    expect(ctx.score.value).toBe(0);
    expect(ctx.lives.value).toBe(3);
    expect(ctx.pause.value).toBe(false);
    expect(ctx.soundOn.value).toBe(true);
    expect(ctx.now()).toBe(0);
  });

  it('自定义尺寸 / 速度 / 生命数生效', () => {
    const ctx = createBrowserContext({
      seed: 0,
      width: 32,
      height: 16,
      speed: 15,
      lives: 5,
    });
    expect(ctx.screen.width).toBe(32);
    expect(ctx.screen.height).toBe(16);
    expect(ctx.ticker.speed).toBe(15);
    expect(ctx.speed.value).toBe(15);
    expect(ctx.lives.value).toBe(5);
  });

  it('rng 与 seed 绑定，同 seed 多次构造得到一致序列', () => {
    const a = createBrowserContext({ seed: 123 });
    const b = createBrowserContext({ seed: 123 });
    for (let i = 0; i < 5; i++) {
      expect(a.rng()).toBe(b.rng());
    }
  });

  it('不同 seed 产生不同的 rng 输出', () => {
    const a = createBrowserContext({ seed: 1 });
    const b = createBrowserContext({ seed: 2 });
    expect(a.rng()).not.toBe(b.rng());
  });

  it('纯组装：构造过程不绑定任何键盘事件', () => {
    const ctx = createBrowserContext({ seed: 0 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(ctx.input.pressed.size).toBe(0);
  });
});
