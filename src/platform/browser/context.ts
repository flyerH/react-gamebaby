import { createCounter, createPersistentToggle, createToggle } from '@/engine/counter';
import { createInputBus } from '@/engine/input';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import type { HardwareContext } from '@/engine/types';

import { createBrowserSound } from './sound';
import { createLocalStorage } from './storage';
import { createRealtimeTicker } from './ticker';

/** createBrowserContext 的可选参数 */
export interface BrowserContextOptions {
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
  const { seed, width = 10, height = 20, speed = 30, lives = 3 } = opts;

  const ticker = createRealtimeTicker({ initialSpeed: speed });
  const storage = createLocalStorage();
  const sound = createBrowserSound();

  // soundOn 持久化：跨刷新保留用户上次的开关偏好，默认开
  const soundOn = createPersistentToggle(storage, 'soundOn', true);
  // 启动时同步 sound 实现到持久化值；后续 toggle 变更也驱动 sound.setEnabled，
  // 让"切换 Sound 键"和"刷新页面恢复偏好"走同一通路
  sound.setEnabled(soundOn.value);
  soundOn.subscribe((on) => {
    sound.setEnabled(on);
  });

  return {
    screen: createScreen(width, height),
    auxScreen: createScreen(4, 2),
    ticker,
    input: createInputBus(),
    sound,
    storage,

    score: createCounter(0),
    level: createCounter(0),
    speed: createCounter(speed),
    lives: createCounter(lives),
    pause: createToggle(false),
    soundOn,

    rng: mulberry32(seed),
    now: () => ticker.tickCount,
  };
}
