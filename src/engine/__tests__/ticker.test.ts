import { describe, it, expect, vi } from 'vitest';
import { createHeadlessTicker } from '../ticker';

describe('createHeadlessTicker', () => {
  it('默认 speed = 30，tickCount = 0', () => {
    const t = createHeadlessTicker();
    expect(t.speed).toBe(30);
    expect(t.tickCount).toBe(0);
  });

  it('未 start 时 advance 返回 0，不调用回调', () => {
    const t = createHeadlessTicker();
    const cb = vi.fn();
    expect(t.advance(5)).toBe(0);
    expect(cb).not.toHaveBeenCalled();
  });

  it('start 后 advance(n) 推进 n 次，tickCount 累加', () => {
    const t = createHeadlessTicker();
    const cb = vi.fn();
    t.start(cb);
    expect(t.advance(3)).toBe(3);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(t.tickCount).toBe(3);
  });

  it('advance 默认步数为 1', () => {
    const t = createHeadlessTicker();
    const cb = vi.fn();
    t.start(cb);
    t.advance();
    expect(t.tickCount).toBe(1);
  });

  it('pause 后 advance 不推进；resume 后恢复', () => {
    const t = createHeadlessTicker();
    const cb = vi.fn();
    t.start(cb);
    t.advance(2);
    t.pause();
    expect(t.advance(5)).toBe(0);
    expect(t.tickCount).toBe(2);
    t.resume();
    expect(t.advance(3)).toBe(3);
    expect(t.tickCount).toBe(5);
  });

  it('stop 清空状态，再次 start 可复用但 tickCount 不重置', () => {
    // tickCount 是全局逻辑时钟，不随 stop/start 循环重置
    const t = createHeadlessTicker();
    const cb = vi.fn();
    t.start(cb);
    t.advance(3);
    t.stop();
    expect(t.advance(5)).toBe(0);

    t.start(cb);
    t.advance(2);
    expect(t.tickCount).toBe(5);
  });

  it('onTick 内调用 stop 会立刻中断剩余步数', () => {
    const t = createHeadlessTicker();
    let calls = 0;
    t.start(() => {
      calls++;
      if (calls === 2) t.stop();
    });
    expect(t.advance(10)).toBe(2);
    expect(calls).toBe(2);
  });

  it('setSpeed 改变 speed，非正数抛错', () => {
    const t = createHeadlessTicker(30);
    t.setSpeed(60);
    expect(t.speed).toBe(60);
    expect(() => t.setSpeed(0)).toThrow();
    expect(() => t.setSpeed(-10)).toThrow();
  });

  it('start 未 pause 情况下 pause/resume 互逆', () => {
    const t = createHeadlessTicker();
    const cb = vi.fn();
    t.start(cb);
    t.pause();
    t.pause();
    t.resume();
    t.advance(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
