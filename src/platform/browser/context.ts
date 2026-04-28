import { createCounter, createToggle } from '@/engine/counter';
import { createInputBus } from '@/engine/input';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import { createNullSound } from '@/engine/sound';
import { createMemoryStorage } from '@/engine/storage';
import type { HardwareContext } from '@/engine/types';

import { createRealtimeTicker } from './ticker';

/** createBrowserContext 的可选参数 */
export interface BrowserContextOptions {
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
 * 浏览器环境下组装完整 HardwareContext
 *
 * 与 `createHeadlessContext` 的差别仅在 Ticker：
 * RealtimeTicker 由 requestAnimationFrame 自动驱动，其他组件（Screen / Input /
 * Storage / Sound 等）都复用 engine 的跨平台实现。
 *
 * 设计约束：本函数**纯组装，不绑定任何 DOM 副作用**。
 *   需要接键盘时，调用方显式调用 `bindKeyboardInput(ctx.input)`，
 *   并在自己的生命周期里管理 detach（典型地：React useEffect 的 cleanup）。
 *   这样 StrictMode 的 mount-unmount-mount 循环和资源释放能干净配对。
 */
export function createBrowserContext(opts: BrowserContextOptions): HardwareContext {
  const { seed, width = 20, height = 10, speed = 30, lives = 3 } = opts;

  const ticker = createRealtimeTicker({ initialSpeed: speed });

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
