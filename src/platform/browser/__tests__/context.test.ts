import { describe, it, expect } from 'vitest';

import { createBrowserContext } from '../context';

describe('createBrowserContext', () => {
  it('默认尺寸 20×10，初始计数器 / 计时器数值符合期望', () => {
    const { ctx, detach } = createBrowserContext({ seed: 42, keyboard: false });
    try {
      expect(ctx.screen.width).toBe(20);
      expect(ctx.screen.height).toBe(10);
      expect(ctx.ticker.speed).toBe(30);
      expect(ctx.ticker.tickCount).toBe(0);
      expect(ctx.score.value).toBe(0);
      expect(ctx.lives.value).toBe(3);
      expect(ctx.pause.value).toBe(false);
      expect(ctx.soundOn.value).toBe(false);
      expect(ctx.now()).toBe(0);
    } finally {
      detach();
    }
  });

  it('rng 与 seed 绑定，同 seed 多次构造得到一致序列', () => {
    const a = createBrowserContext({ seed: 123, keyboard: false });
    const b = createBrowserContext({ seed: 123, keyboard: false });
    try {
      for (let i = 0; i < 5; i++) {
        expect(a.ctx.rng()).toBe(b.ctx.rng());
      }
    } finally {
      a.detach();
      b.detach();
    }
  });

  it('keyboard 默认启用：键盘事件会进入 InputBus 的 pressed 集合', () => {
    const { ctx, detach } = createBrowserContext({ seed: 0 });
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(ctx.input.pressed.has('Left')).toBe(true);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
      expect(ctx.input.pressed.has('Left')).toBe(false);
    } finally {
      detach();
    }
  });

  it('detach 会解绑键盘监听，卸载后的事件不再影响 InputBus', () => {
    const { ctx, detach } = createBrowserContext({ seed: 0 });
    detach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(ctx.input.pressed.size).toBe(0);
  });

  it('keyboard: false 时不绑定，键盘事件被忽略', () => {
    const { ctx, detach } = createBrowserContext({ seed: 0, keyboard: false });
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(ctx.input.pressed.size).toBe(0);
    } finally {
      detach();
    }
  });
});
