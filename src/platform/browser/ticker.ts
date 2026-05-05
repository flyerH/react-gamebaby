import type { Ticker } from '@/engine/types';

/**
 * RealtimeTicker —— 浏览器 rAF 驱动的 Ticker 实现
 *
 * 用 requestAnimationFrame 做帧循环，累积器做 tick 速率归一：
 *
 *   accumulator += elapsedMs * speed / 1000
 *   while (accumulator >= 1) { onTick(); accumulator -= 1; tickCount++ }
 *
 * 这样无论显示器是 60/120/144 Hz，逻辑速度 `speed ticks/second` 都一致。
 *
 * 边界处理：
 * - 单帧内最多连发 `maxStepsPerFrame` 个 tick，防止标签页切回后追帧失控
 * - 暂停时累加器暂停累积，而非直接清零；resume 后继续
 * - setSpeed 不清零累加器，保证平滑过渡
 * - stop / 再次 start 会重置 tickCount（语义：start 即新一轮循环）
 */
export interface RealtimeTickerOptions {
  /** 初始速度（ticks/second），默认 30 */
  initialSpeed?: number;
  /** 单帧最多推进的 tick 数，默认 5（避免 tab 切回后追帧） */
  maxStepsPerFrame?: number;
  /** rAF 调度函数，测试可注入；默认 window.requestAnimationFrame */
  requestFrame?: (cb: (t: number) => void) => number;
  /** cancel 函数，测试可注入；默认 window.cancelAnimationFrame */
  cancelFrame?: (handle: number) => void;
  /** 当前时间源（毫秒），测试可注入；默认 performance.now */
  now?: () => number;
}

export function createRealtimeTicker(opts: RealtimeTickerOptions = {}): Ticker {
  const {
    initialSpeed = 30,
    maxStepsPerFrame = 5,
    requestFrame = (cb) => window.requestAnimationFrame(cb),
    cancelFrame = (h) => {
      window.cancelAnimationFrame(h);
    },
    now = () => performance.now(),
  } = opts;

  if (!Number.isFinite(initialSpeed) || initialSpeed <= 0) {
    throw new Error(`initialSpeed 必须是有限正数，得到 ${String(initialSpeed)}`);
  }
  if (!Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame <= 0) {
    throw new Error(`maxStepsPerFrame 必须是正整数，得到 ${String(maxStepsPerFrame)}`);
  }

  let speed = initialSpeed;
  let tickCount = 0;
  let running = false;
  let paused = false;
  let onTick: (() => void) | null = null;

  let rafHandle: number | null = null;
  let lastTs = 0;
  let accumulator = 0;

  const loop = (): void => {
    if (!running || !onTick) return;
    const current = now();
    const elapsed = current - lastTs;
    lastTs = current;

    if (!paused) {
      accumulator += (elapsed * speed) / 1000;
      let steps = 0;
      while (accumulator >= 1 && steps < maxStepsPerFrame) {
        accumulator -= 1;
        onTick();
        tickCount++;
        steps++;
        if (!running) return; // onTick 里调用了 stop
      }
      // accumulator 可能还 >= 1：丢弃超出部分，避免跨标签页积债
      if (accumulator >= maxStepsPerFrame) accumulator = 0;
    }

    rafHandle = requestFrame(loop);
  };

  return {
    get speed() {
      return speed;
    },
    get tickCount() {
      return tickCount;
    },

    setSpeed(n: number): void {
      // 必须是有限正数：NaN / Infinity 会让累加器一发不可收拾
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`speed 必须是有限正数，得到 ${String(n)}`);
      }
      speed = n;
    },

    start(fn: () => void): void {
      // 幂等：未 stop 直接再 start 时，先取消上一条 rAF 循环。
      // 否则 React useEffect 依赖变化会把上一条循环留在浏览器 rAF 队列
      // 里，新旧两条循环同时推进 onTick，逻辑速度变成双倍且 stop 后只
      // 能停掉一条。
      if (rafHandle !== null) {
        cancelFrame(rafHandle);
        rafHandle = null;
      }
      onTick = fn;
      running = true;
      paused = false;
      tickCount = 0;
      accumulator = 0;
      lastTs = now();
      rafHandle = requestFrame(loop);
    },

    stop(): void {
      running = false;
      paused = false;
      onTick = null;
      if (rafHandle !== null) {
        cancelFrame(rafHandle);
        rafHandle = null;
      }
    },

    pause(): void {
      if (running) paused = true;
    },

    resume(): void {
      if (running && paused) {
        paused = false;
        lastTs = now();
      }
    },
  };
}
