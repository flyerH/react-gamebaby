import type { Ticker } from '@/engine/types';

/**
 * HeadlessTicker —— 非自驱的 Ticker 实现
 *
 * 与浏览器版 `RealtimeTicker`（基于 requestAnimationFrame）不同，
 * 这里不依赖任何真实时钟，由外部显式调用 `advance(n)` 推进。
 *
 * 适用场景：
 * - Node 训练：for 循环里按需推进若干步
 * - 单元测试：精确控制执行顺序
 * - 回放：按 Episode.actions 的 tick 序列逐步推进
 *
 * `speed` 字段保留，仅用于告知游戏逻辑"当前逻辑速度"，
 * 不影响 Ticker 自身的运行节奏。
 */
export interface HeadlessTicker extends Ticker {
  /**
   * 推进 n 个 tick（默认 1 步）
   *
   * - 未 start / 已 stop / 已 pause 时立即返回 0
   * - onTick 内若调用了 stop()，立刻中断剩余步数
   *
   * @returns 实际推进的步数
   */
  advance(n?: number): number;
}

/** 公共校验：speed 必须是有限正数，避免 NaN / Infinity 让训练循环卡死 */
function assertSpeed(n: number, what: string): void {
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${what} 必须是有限正数，得到 ${String(n)}`);
  }
}

export function createHeadlessTicker(initialSpeed = 30): HeadlessTicker {
  assertSpeed(initialSpeed, 'initialSpeed');
  let speed = initialSpeed;
  let tickCount = 0;
  let running = false;
  let paused = false;
  let onTick: (() => void) | null = null;

  return {
    get speed() {
      return speed;
    },
    get tickCount() {
      return tickCount;
    },

    setSpeed(n: number): void {
      assertSpeed(n, 'speed');
      speed = n;
    },

    start(fn: () => void): void {
      onTick = fn;
      running = true;
      paused = false;
    },

    stop(): void {
      running = false;
      paused = false;
      onTick = null;
    },

    pause(): void {
      if (running) paused = true;
    },

    resume(): void {
      if (running) paused = false;
    },

    advance(n = 1): number {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`advance(n) 要求非负整数，得到 ${String(n)}`);
      }
      if (!running || paused || !onTick) return 0;
      let executed = 0;
      for (let i = 0; i < n; i++) {
        if (!running || paused) break;
        onTick();
        tickCount++;
        executed++;
      }
      return executed;
    },
  };
}
