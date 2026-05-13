import { createCounter, createToggle } from '@/engine/counter';
import { createInputBus } from '@/engine/input';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import { createNullSound } from '@/engine/sound';
import { createMemoryStorage } from '@/engine/storage';
import type { HardwareContext } from '@/engine/types';

import { createHeadlessTicker } from './ticker';

/** createHeadlessContext 的可选参数 */
export interface HeadlessContextOptions {
  /** PRNG 种子；同一 seed 在任意环境下产出完全相同的序列 */
  seed: number;
  /** 主屏宽度（像素列数），默认 10 —— 对应 Brick Game 原机纵向 10×20 */
  width?: number;
  /** 主屏高度（像素行数），默认 20 */
  height?: number;
  /** 初始速度（ticks/second），默认 30 */
  speed?: number;
  /** 初始生命数，默认 3 */
  lives?: number;
}

/**
 * 组装一套 Node / 测试 可用的 HardwareContext
 *
 * 特性：
 * - 完全 DOM-agnostic：不触碰 window / document / performance / localStorage
 * - 完全确定性：给定 seed 与输入序列，任意环境下重放一致
 * - Ticker 非自驱：调用方需要显式 `ticker.advance(n)` 推进
 *
 * 对应的浏览器实现（`createBrowserContext`）位于 `src/platform/browser/`，
 * 内部组合 RealtimeTicker / LocalStorage / ZzfxSound / 键盘适配等。
 */
export function createHeadlessContext(opts: HeadlessContextOptions): HardwareContext {
  const { seed, width = 10, height = 20, speed = 30, lives = 3 } = opts;

  const ticker = createHeadlessTicker(speed);

  return {
    screen: createScreen(width, height),
    nextScreen: createScreen(4, 2),
    ticker,
    input: createInputBus(),
    sound: createNullSound(),
    storage: createMemoryStorage(),

    score: createCounter(0),
    level: createCounter(0),
    speed: createCounter(speed),
    lives: createCounter(lives),
    pause: createToggle(false),
    soundOn: createToggle(false),

    rng: mulberry32(seed),
    now: () => ticker.tickCount,
  };
}
