/**
 * L3 Engine 对外统一入口
 *
 * 此处只导出**接口**与**跨平台通用实现**（DOM-agnostic，Node 与浏览器共用）。
 * 各平台专属的 Ticker / Storage / Sound / Context 组装在 `src/platform/<platform>/`，
 * 按运行环境从对应路径导入。
 */

export type {
  Bitmap,
  BlitMode,
  Button,
  ButtonAction,
  Counter,
  HardwareContext,
  InputBus,
  Screen,
  Sound,
  SoundEffect,
  Storage,
  Ticker,
  Toggle,
  Unsubscribe,
} from './types';

export { mulberry32, randomInt } from './rng';
export { createCounter, createToggle } from './counter';
export { bitmapFromRows, createScreen } from './screen';
export { createInputBus } from './input';
