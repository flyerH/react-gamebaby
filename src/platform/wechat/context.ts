import { createCounter, createPersistentToggle, createToggle } from '@/engine/counter';
import { createFrameTicker } from '@/engine/frame-ticker';
import { createInputBus } from '@/engine/input';
import type { Schedule } from '@/engine/repeat';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import type { HardwareContext } from '@/engine/types';

import type { WechatHost } from './api';
import { createWechatSound } from './sound';
import { createWxStorage } from './storage';

export interface WechatContextOptions {
  readonly host: WechatHost;
  /** PRNG 种子 */
  readonly seed: number;
  readonly width?: number;
  readonly height?: number;
  readonly speed?: number;
  readonly lives?: number;
}

/**
 * 小游戏环境下组装 HardwareContext
 *
 * 与 createBrowserContext 对应：Ticker 由小游戏全局 requestAnimationFrame 驱动，
 * 存储走 wx 同步存储，声音走 wx.createWebAudioContext。
 */
export function createWechatContext(opts: WechatContextOptions): HardwareContext {
  const { host, seed, width = 10, height = 20, speed = 30, lives = 3 } = opts;
  const ticker = createFrameTicker({
    initialSpeed: speed,
    requestFrame: host.requestAnimationFrame,
    cancelFrame: host.cancelAnimationFrame,
    now: host.now,
  });
  const storage = createWxStorage(host.wx);
  const sound = createWechatSound(host.wx);
  const soundOn = createPersistentToggle(storage, 'soundOn', true);
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

/** 基于小游戏全局 setTimeout 的计时器，供 engine 的 bindPressRepeat 使用 */
export function createTimeoutSchedule(
  host: Pick<WechatHost, 'setTimeout' | 'clearTimeout'>
): Schedule {
  return (fn, ms) => {
    const id = host.setTimeout(fn, ms);
    return () => {
      host.clearTimeout(id);
    };
  };
}
