import { describe, it, expect, vi } from 'vitest';

import { createRealtimeTicker } from '../ticker';

/** 手工时钟 + 手工 rAF 队列：不依赖真实 requestAnimationFrame / performance.now */
function makeHarness() {
  let currentMs = 1000;
  type FrameCb = (t: number) => void;
  const queue: Array<{ handle: number; cb: FrameCb }> = [];
  let nextHandle = 1;

  return {
    now: () => currentMs,
    advanceMs: (ms: number) => {
      currentMs += ms;
    },
    requestFrame: (cb: FrameCb) => {
      const handle = nextHandle++;
      queue.push({ handle, cb });
      return handle;
    },
    cancelFrame: (handle: number) => {
      const idx = queue.findIndex((q) => q.handle === handle);
      if (idx >= 0) queue.splice(idx, 1);
    },
    /** 触发下一帧回调（模拟浏览器 rAF 推进） */
    drain: () => {
      const batch = queue.splice(0, queue.length);
      for (const { cb } of batch) cb(currentMs);
    },
    pending: () => queue.length,
  };
}

describe('createRealtimeTicker', () => {
  it('start 后按 speed 与帧间时长累积出 tick', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10, // 10 ticks/second
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    const onTick = vi.fn();
    ticker.start(onTick);

    h.advanceMs(100); // 恰好 1 tick
    h.drain();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(ticker.tickCount).toBe(1);

    h.advanceMs(250); // 累加 2.5 → 放出 2 个
    h.drain();
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(ticker.tickCount).toBe(3);
  });

  it('单帧最多推进 maxStepsPerFrame，避免切回标签页后追帧失控', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10,
      maxStepsPerFrame: 3,
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    const onTick = vi.fn();
    ticker.start(onTick);

    h.advanceMs(10_000); // 理论应累积 100 tick
    h.drain();
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('pause 停止累积，resume 以当前时间为新起点，不补欠账', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10,
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    const onTick = vi.fn();
    ticker.start(onTick);

    ticker.pause();
    h.advanceMs(500); // 暂停期间不该累积
    h.drain();
    expect(onTick).not.toHaveBeenCalled();

    ticker.resume();
    h.advanceMs(100);
    h.drain();
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('stop 取消 rAF 并断掉回调', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10,
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    const onTick = vi.fn();
    ticker.start(onTick);
    expect(h.pending()).toBe(1);

    ticker.stop();
    expect(h.pending()).toBe(0);

    h.advanceMs(1000);
    h.drain();
    expect(onTick).not.toHaveBeenCalled();
  });

  it('onTick 中调用 stop 立即终止当前帧剩余步数', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10,
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    const onTick = vi.fn(() => {
      if (onTick.mock.calls.length === 2) ticker.stop();
    });
    ticker.start(onTick);

    h.advanceMs(500); // 理论上 5 tick
    h.drain();
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('setSpeed 非正数抛错', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    expect(() => {
      ticker.setSpeed(0);
    }).toThrow();
    expect(() => {
      ticker.setSpeed(-1);
    }).toThrow();
  });

  it('start 会重置 tickCount 为 0', () => {
    const h = makeHarness();
    const ticker = createRealtimeTicker({
      initialSpeed: 10,
      requestFrame: h.requestFrame,
      cancelFrame: h.cancelFrame,
      now: h.now,
    });
    ticker.start(() => {});
    h.advanceMs(300);
    h.drain();
    expect(ticker.tickCount).toBe(3);

    ticker.stop();
    ticker.start(() => {});
    expect(ticker.tickCount).toBe(0);
  });
});
