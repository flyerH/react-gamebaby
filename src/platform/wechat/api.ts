import type { AudioContextLike } from '@/engine/synth-sound';

/**
 * 微信小游戏宿主 API 的最小子集
 *
 * 只声明本项目用到的 wx 方法与 canvas 能力，入口把全局 wx 按结构传入，
 * 测试传入假对象。不引入完整的 minigame-api-typings，避免 wx 成为全局类型、
 * 在 platform/wechat 以外被误用。
 */

export interface WxTouch {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface WxTouchEvent {
  readonly touches: ReadonlyArray<WxTouch>;
  readonly changedTouches: ReadonlyArray<WxTouch>;
}

export type WxTouchHandler = (e: WxTouchEvent) => void;

export interface WxRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

export interface WxWindowInfo {
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly pixelRatio: number;
  readonly safeArea?: WxRect;
}

/** 小游戏 canvas 2D context 用到的绘图能力 */
export interface WxContext2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  measureText(text: string): { readonly width: number };
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  drawImage(image: WxCanvas, x: number, y: number, w: number, h: number): void;
}

export interface WxCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): WxContext2D;
}

/** wx.createWebAudioContext 返回的上下文；decodeAudioData 为回调风格 */
export interface WxWebAudioContext extends AudioContextLike {
  decodeAudioData(
    data: ArrayBuffer,
    success: (buffer: unknown) => void,
    fail: (err: unknown) => void
  ): void;
}

export interface WxFileSystemManager {
  readFile(opts: {
    readonly filePath: string;
    readonly success: (res: { readonly data: string | ArrayBuffer }) => void;
    readonly fail: (err: unknown) => void;
  }): void;
}

export interface MiniGameApi {
  /** 首次调用返回上屏 canvas，之后返回离屏 canvas */
  createCanvas(): WxCanvas;
  getWindowInfo(): WxWindowInfo;
  /** 右上角胶囊按钮的位置，布局需要避开 */
  getMenuButtonBoundingClientRect(): WxRect;

  createWebAudioContext(): WxWebAudioContext;
  getFileSystemManager(): WxFileSystemManager;

  getStorageSync(key: string): unknown;
  setStorageSync(key: string, data: unknown): void;
  removeStorageSync(key: string): void;
  getStorageInfoSync(): { readonly keys: ReadonlyArray<string> };

  onTouchStart(fn: WxTouchHandler): void;
  offTouchStart(fn: WxTouchHandler): void;
  onTouchMove(fn: WxTouchHandler): void;
  offTouchMove(fn: WxTouchHandler): void;
  onTouchEnd(fn: WxTouchHandler): void;
  offTouchEnd(fn: WxTouchHandler): void;
  onTouchCancel(fn: WxTouchHandler): void;
  offTouchCancel(fn: WxTouchHandler): void;

  onShow(fn: () => void): void;
  offShow(fn: () => void): void;
  onHide(fn: () => void): void;
  offHide(fn: () => void): void;
}

/**
 * 入口从小游戏全局环境收集的宿主能力
 *
 * requestAnimationFrame / setTimeout 在小游戏里是全局函数而非 wx 方法。
 * 时间用 Date.now：wx.getPerformance().now() 在部分基础库下单位是微秒，不便与毫秒混用
 */
export interface WechatHost {
  readonly wx: MiniGameApi;
  readonly requestAnimationFrame: (cb: (t: number) => void) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly setTimeout: (fn: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  readonly now: () => number;
}
