import { createFrameTicker, type FrameTickerOptions } from '@/engine/frame-ticker';
import type { Ticker } from '@/engine/types';

export type RealtimeTickerOptions = Partial<FrameTickerOptions>;

/** 浏览器 Ticker：用 window.requestAnimationFrame 与 performance.now 驱动 engine 的 FrameTicker */
export function createRealtimeTicker(opts: RealtimeTickerOptions = {}): Ticker {
  // 显式传入 undefined 时也回退到浏览器实现
  const {
    requestFrame = (cb) => window.requestAnimationFrame(cb),
    cancelFrame = (h) => {
      window.cancelAnimationFrame(h);
    },
    now = () => performance.now(),
    ...rest
  } = opts;
  return createFrameTicker({ ...rest, requestFrame, cancelFrame, now });
}
