/**
 * Headless 平台实现入口
 *
 * 目标运行环境：Node（训练 / CLI）、Vitest、任何无 DOM 的场景。
 * 对应的浏览器实现见 `src/platform/browser/`（待建）。
 *
 * 本层只提供**有平台耦合**的组件：
 * - 非自驱 Ticker（由外部显式 advance 推进）
 * - 内存 Storage
 * - 无声 Sound
 * - createHeadlessContext：把上述组件与 L3 engine 跨平台模块组装成 HardwareContext
 */

export { createHeadlessTicker } from './ticker';
export type { HeadlessTicker } from './ticker';
export { createMemoryStorage } from './storage';
export { createNullSound } from './sound';
export { createHeadlessContext } from './context';
export type { HeadlessContextOptions } from './context';
