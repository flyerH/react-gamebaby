/**
 * Headless 平台实现入口
 *
 * 目标运行环境：Node（训练 / CLI）、Vitest、任何无 DOM 的场景。
 * 对应的浏览器实现见 `src/platform/browser/`（待建）。
 *
 * 本层只提供**有平台耦合**的组件：
 * - 非自驱 Ticker（由外部显式 advance 推进，Node / 单测专用语义）
 * - createHeadlessContext：把上面的 Ticker 与 L3 engine 跨平台模块
 *   （MemoryStorage / NullSound / Screen / InputBus / ...）组装成 HardwareContext
 */

export { createHeadlessTicker } from './ticker';
export type { HeadlessTicker } from './ticker';
export { createHeadlessContext } from './context';
export type { HeadlessContextOptions } from './context';
