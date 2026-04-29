/**
 * Browser 平台实现入口
 *
 * 目标运行环境：浏览器（requestAnimationFrame / window / document 可用）。
 * 对应的 Node / 测试实现见 `src/platform/headless/`。
 *
 * 本层只提供**有平台耦合**的组件：
 * - RealtimeTicker：rAF + 累积器驱动的固定步长循环
 * - bindKeyboardInput：键盘事件 → L3 InputBus 桥接
 * - createLocalStorage：基于 localStorage 的 Storage 适配
 * - createBrowserSound：基于 Web Audio 的 8-bit 音效合成
 * - createBrowserContext：把上述组件与 engine 跨平台模块组装成完整 HardwareContext
 */

export { createRealtimeTicker } from './ticker';
export type { RealtimeTickerOptions } from './ticker';
export { bindKeyboardInput, DEFAULT_KEY_MAP } from './input';
export type { BindKeyboardOptions } from './input';
export { createLocalStorage } from './storage';
export { createBrowserSound } from './sound';
export { createBrowserContext } from './context';
export type { BrowserContextOptions } from './context';
