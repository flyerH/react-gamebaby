import { createCounter, createToggle } from './counter';
import { createInputBus } from './input';
import { mulberry32 } from './rng';
import { createScreen } from './screen';
import { createNullSound } from './sound';
import { createMemoryStorage } from './storage';
import { createHeadlessTicker } from './ticker';
import type { HardwareContext } from './types';

/** createHeadlessContext 的可选参数 */
export interface HeadlessContextOptions {
  /** PRNG 种子；同一 seed 在任意环境下产出完全相同的序列 */
  seed: number;
  /** 主屏宽度（像素），默认 20 —— 对应 Brick Game 原机 */
  width?: number;
  /** 主屏高度（像素），默认 10 */
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
 * 浏览器运行时的 `createRealtimeContext` 会在 L4 / runtime 层提供，
 * 内部组合 RealtimeTicker / CanvasScreen / KeyboardInputBus / LocalStorage 等。
 */
export function createHeadlessContext(opts: HeadlessContextOptions): HardwareContext {
  const { seed, width = 20, height = 10, speed = 30, lives = 3 } = opts;

  const ticker = createHeadlessTicker(speed);

  return {
    screen: createScreen(width, height),
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
