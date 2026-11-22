import { createFrameTicker, type FrameTickerOptions } from '@/engine/frame-ticker';
import type { Ticker } from '@/engine/types';

export type RealtimeTickerOptions = Partial<FrameTickerOptions>;

/** 浏览器 Ticker：用 window.requestAnimationFrame 与 performance.now 驱动 engine 的 FrameTicker */
export function createRealtimeTicker(opts: RealtimeTickerOptions = {}): Ticker {
  return createFrameTicker({
    requestFrame: (cb) => window.requestAnimationFrame(cb),
    cancelFrame: (h) => {
      window.cancelAnimationFrame(h);
    },
    now: () => performance.now(),
    ...opts,
  });
}
