/**
 * 微信小游戏平台实现入口
 *
 * 与 src/platform/browser/ 对应，把 wx 能力桥接到 engine 接口：
 * - createWechatContext：Ticker（全局 requestAnimationFrame）+ wx 同步存储 + WebAudio Sound
 * - bindTouchInput：触摸事件 → InputBus，支持多指
 * - bindAppLifecycle：wx.onShow / wx.onHide 前后台切换
 * - createTimeoutSchedule：全局 setTimeout 计时器，注入 bindPressRepeat
 */

export type {
  MiniGameApi,
  WechatHost,
  WxCanvas,
  WxContext2D,
  WxRect,
  WxTouch,
  WxTouchEvent,
  WxWebAudioContext,
  WxWindowInfo,
} from './api';
export { createTimeoutSchedule, createWechatContext } from './context';
export type { WechatContextOptions } from './context';
export { bindAppLifecycle } from './lifecycle';
export type { BindLifecycleOptions } from './lifecycle';
export { createWechatSound } from './sound';
export { createWxStorage } from './storage';
export { bindTouchInput } from './touch';
export type { HitTest } from './touch';
