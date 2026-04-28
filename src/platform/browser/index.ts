/**
 * Browser 平台实现入口
 *
 * 目标运行环境：浏览器（requestAnimationFrame / window / document 可用）。
 * 对应的 Node / 测试实现见 `src/platform/headless/`。
 *
 * 本层只提供**有平台耦合**的组件：
 * - RealtimeTicker：rAF + 累积器驱动的固定步长循环
 * - bindKeyboardInput：键盘事件 → L3 InputBus 桥接
 * - createBrowserContext：把上述组件与 engine 跨平台模块组装成完整 HardwareContext
 *
 * Storage / Sound 暂复用 `@/engine` 的默认实现（内存 / 无声），
 * 后续补 localStorage / zzfx 时在此层新增文件并替换装配。
 */

export { createRealtimeTicker } from './ticker';
export type { RealtimeTickerOptions } from './ticker';
export { bindKeyboardInput, DEFAULT_KEY_MAP } from './input';
export type { BindKeyboardOptions } from './input';
export { createBrowserContext } from './context';
export type { BrowserContextOptions } from './context';
