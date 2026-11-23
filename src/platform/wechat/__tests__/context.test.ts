import { describe, expect, it, vi } from 'vitest';

import type { WechatHost } from '../api';
import { createTimeoutSchedule, createWechatContext } from '../context';
import { bindAppLifecycle } from '../lifecycle';

import { createFakeWx } from './fake-wx';

function createHost(): WechatHost & { frame: (ms: number) => void } {
  let now = 0;
  let queue: Array<(t: number) => void> = [];
  return {
    wx: createFakeWx(),
    requestAnimationFrame: (cb) => queue.push(cb),
    cancelAnimationFrame: () => {
      queue = [];
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => {
      clearTimeout(id);
    },
    now: () => now,
    frame(ms) {
      now += ms;
      const batch = queue;
      queue = [];
      for (const cb of batch) cb(now);
    },
  };
}

describe('createWechatContext', () => {
  it('ticker 由宿主 requestAnimationFrame 与时钟驱动', () => {
    const host = createHost();
    const ctx = createWechatContext({ host, seed: 1, speed: 10 });
    const onTick = vi.fn();
    ctx.ticker.start(onTick);
    host.frame(100);
    host.frame(200);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(ctx.now()).toBe(3);
  });

  it('soundOn 偏好写入 wx 存储，重建 context 后恢复', () => {
    const host = createHost();
    createWechatContext({ host, seed: 1 }).soundOn.set(false);
    expect(createWechatContext({ host, seed: 2 }).soundOn.value).toBe(false);
  });

  it('同一 seed 的 rng 序列一致', () => {
    const host = createHost();
    const a = createWechatContext({ host, seed: 7 });
    const b = createWechatContext({ host, seed: 7 });
    expect([a.rng(), a.rng()]).toEqual([b.rng(), b.rng()]);
  });
});

describe('createTimeoutSchedule', () => {
  it('到期调用回调，取消后不再调用', () => {
    vi.useFakeTimers();
    const schedule = createTimeoutSchedule(createHost());
    const fired = vi.fn();
    const cancelled = vi.fn();
    schedule(fired, 100);
    schedule(cancelled, 100)();
    vi.advanceTimersByTime(100);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('bindAppLifecycle', () => {
  it('wx.onHide / onShow 分别触发后台与前台回调，解绑后不再触发', () => {
    const wx = createFakeWx();
    const onBackground = vi.fn();
    const onForeground = vi.fn();
    const unbind = bindAppLifecycle(wx, { onBackground, onForeground });
    wx.hide();
    wx.show();
    unbind();
    wx.hide();
    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onForeground).toHaveBeenCalledTimes(1);
    expect(wx.listenerCount()).toBe(0);
  });
});
