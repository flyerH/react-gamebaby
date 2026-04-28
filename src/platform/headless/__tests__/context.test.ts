import { describe, it, expect } from 'vitest';
import { createHeadlessContext } from '../context';
import type { HeadlessTicker } from '../ticker';

describe('createHeadlessContext', () => {
  it('缺省尺寸 10×20（纵向）、初始计数器归零、rng/now 可用', () => {
    const ctx = createHeadlessContext({ seed: 1 });
    expect(ctx.screen.width).toBe(10);
    expect(ctx.screen.height).toBe(20);
    expect(ctx.score.value).toBe(0);
    expect(ctx.level.value).toBe(0);
    expect(ctx.lives.value).toBe(3);
    expect(ctx.speed.value).toBe(30);
    expect(typeof ctx.rng()).toBe('number');
    expect(ctx.now()).toBe(0);
  });

  it('options 覆盖默认值', () => {
    const ctx = createHeadlessContext({
      seed: 1,
      width: 32,
      height: 16,
      speed: 60,
      lives: 5,
    });
    expect(ctx.screen.width).toBe(32);
    expect(ctx.screen.height).toBe(16);
    expect(ctx.speed.value).toBe(60);
    expect(ctx.lives.value).toBe(5);
  });

  it('相同 seed 下 rng 序列完全一致', () => {
    const a = createHeadlessContext({ seed: 42 });
    const b = createHeadlessContext({ seed: 42 });
    for (let i = 0; i < 20; i++) {
      expect(a.rng()).toBe(b.rng());
    }
  });

  it('now() 返回 ticker 的 tickCount（逻辑时钟）', () => {
    const ctx = createHeadlessContext({ seed: 1 });
    const ticker = ctx.ticker as HeadlessTicker;
    expect(ctx.now()).toBe(0);
    ticker.start(() => {
      /* no-op */
    });
    ticker.advance(5);
    expect(ctx.now()).toBe(5);
  });

  it('完整循环可跑：Ticker 驱动游戏回调消费 rng + screen + score', () => {
    const ctx = createHeadlessContext({ seed: 123 });
    const ticker = ctx.ticker as HeadlessTicker;

    ticker.start(() => {
      // 模拟最小游戏：每 tick 在随机位置画点并加 1 分
      const x = Math.floor(ctx.rng() * ctx.screen.width);
      const y = Math.floor(ctx.rng() * ctx.screen.height);
      ctx.screen.setPixel(x, y, true);
      ctx.score.add(1);
    });

    ticker.advance(10);

    expect(ctx.score.value).toBe(10);
    expect(ctx.now()).toBe(10);
    expect(ctx.screen.buffer.some((v) => v === 1)).toBe(true);
  });

  it('同 seed + 同输入 → 完全一致的最终 state（确定性回放核心）', () => {
    const run = (): { score: number; buffer: Uint8Array } => {
      const ctx = createHeadlessContext({ seed: 777 });
      const ticker = ctx.ticker as HeadlessTicker;
      ticker.start(() => {
        const x = Math.floor(ctx.rng() * ctx.screen.width);
        const y = Math.floor(ctx.rng() * ctx.screen.height);
        ctx.screen.setPixel(x, y, true);
        ctx.score.add(1);
      });
      ticker.advance(50);
      return { score: ctx.score.value, buffer: new Uint8Array(ctx.screen.buffer) };
    };

    const r1 = run();
    const r2 = run();
    expect(r1.score).toBe(r2.score);
    expect(Array.from(r1.buffer)).toEqual(Array.from(r2.buffer));
  });

  it('input 总线可订阅并收到事件', () => {
    const ctx = createHeadlessContext({ seed: 1 });
    const received: string[] = [];
    ctx.input.subscribe((btn, action) => received.push(`${btn}:${action}`));
    ctx.input.emit('Up', 'press');
    ctx.input.emit('Up', 'release');
    expect(received).toEqual(['Up:press', 'Up:release']);
  });
});
