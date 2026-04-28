import { createCounter, createToggle } from '@/engine/counter';
import { createInputBus } from '@/engine/input';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import { createNullSound } from '@/engine/sound';
import { createMemoryStorage } from '@/engine/storage';
import type { HardwareContext, Unsubscribe } from '@/engine/types';

import { bindKeyboardInput, type BindKeyboardOptions } from './input';
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
  /** 键盘桥接参数；传入 false 表示不绑定键盘（留给调用方自行接入触摸 / 手柄） */
  keyboard?: BindKeyboardOptions | false;
}

/**
 * 浏览器环境下组装完整 HardwareContext
 *
 * 与 `createHeadlessContext` 的差别：
 * - ticker 是 RealtimeTicker，由 requestAnimationFrame 自动驱动
 * - 默认绑定键盘到 InputBus（可关闭），返回 detach 用于清理
 * - Storage / Sound 仍用 engine 的跨平台默认实现；
 *   后续接入 LocalStorage / zzfx 时替换这两处即可
 */
export function createBrowserContext(opts: BrowserContextOptions): {
  ctx: HardwareContext;
  /** 解绑所有副作用（目前是键盘监听），在组件卸载 / 页面切换时调用 */
  detach: Unsubscribe;
} {
  const { seed, width = 20, height = 10, speed = 30, lives = 3, keyboard } = opts;

  const ticker = createRealtimeTicker({ initialSpeed: speed });
  const input = createInputBus();

  const detachKeyboard: Unsubscribe | null =
    keyboard === false ? null : bindKeyboardInput(input, keyboard ?? {});

  const ctx: HardwareContext = {
    screen: createScreen(width, height),
    ticker,
    input,
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

  const detach: Unsubscribe = () => {
    detachKeyboard?.();
    ticker.stop();
  };

  return { ctx, detach };
}
