/**
 * L3 Engine 对外统一入口
 *
 * 外层（L2 SDK / L1 Games / L4 UI / 训练脚本）只从此处导入，
 * 不要深入到具体实现模块；具体模块内部可能重构、重命名。
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
export { createMemoryStorage } from './storage';
export { createNullSound } from './sound';
export { bitmapFromRows, createScreen } from './screen';
export { createInputBus } from './input';
export { createHeadlessTicker } from './ticker';
export type { HeadlessTicker } from './ticker';
export { createHeadlessContext } from './context';
export type { HeadlessContextOptions } from './context';
