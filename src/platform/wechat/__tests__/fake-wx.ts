import type { AudioParamLike } from '@/engine/synth-sound';

import type {
  MiniGameApi,
  WxCanvas,
  WxContext2D,
  WxTouchEvent,
  WxTouchHandler,
  WxWebAudioContext,
} from '../api';

type Touch = readonly [id: number, x: number, y: number];

/** 假 2D context：绘制不做任何事，只把 fillText 画过的文字记进 texts */
export function createFakeContext2D(texts: string[] = []): WxContext2D {
  const noop = (): void => undefined;
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    rotate: noop,
    measureText: (text) => ({ width: text.length * 6 }),
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: (text) => {
      texts.push(text);
    },
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    drawImage: noop,
  };
}

const param = (): AudioParamLike => ({
  value: 1,
  setValueAtTime: () => undefined,
  exponentialRampToValueAtTime: () => undefined,
  setTargetAtTime: () => undefined,
  cancelScheduledValues: () => undefined,
});

/** 假 WebAudio 上下文：节点方法都是空实现，started 记录启动过的音源类型 */
export function createFakeAudioContext(started: string[] = []): WxWebAudioContext {
  const node = { connect: () => undefined };
  return {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: node,
    createBuffer: (_channels, length) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createGain: () => ({ ...node, gain: param() }),
    createOscillator: () => ({
      ...node,
      type: 'sine',
      frequency: param(),
      start: () => {
        started.push('osc');
      },
      stop: () => undefined,
    }),
    createBufferSource: () => ({
      ...node,
      buffer: null,
      onended: null,
      start: () => {
        started.push('sample');
      },
      stop: () => undefined,
    }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    decodeAudioData: (_data, success) => {
      success({ decoded: true });
    },
  };
}

export interface FakeWx extends MiniGameApi {
  readonly store: Map<string, unknown>;
  /** 所有 canvas 上 fillText 画过的文字 */
  readonly texts: string[];
  readonly canvases: WxCanvas[];
  touch(type: 'start' | 'move' | 'end' | 'cancel', ...touches: Touch[]): void;
  hide(): void;
  show(): void;
  listenerCount(): number;
}

export function createFakeWx(): FakeWx {
  const store = new Map<string, unknown>();
  const canvases: WxCanvas[] = [];
  const texts: string[] = [];
  const touchSubs = {
    start: new Set<WxTouchHandler>(),
    move: new Set<WxTouchHandler>(),
    end: new Set<WxTouchHandler>(),
    cancel: new Set<WxTouchHandler>(),
  };
  const showSubs = new Set<() => void>();
  const hideSubs = new Set<() => void>();

  return {
    store,
    canvases,
    texts,
    createCanvas() {
      const ctx = createFakeContext2D(texts);
      const canvas: WxCanvas = { width: 300, height: 150, getContext: () => ctx };
      canvases.push(canvas);
      return canvas;
    },
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 3,
      safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 },
    }),
    getMenuButtonBoundingClientRect: () => ({
      top: 51,
      bottom: 83,
      left: 297,
      right: 384,
      width: 87,
      height: 32,
    }),
    createWebAudioContext: () => createFakeAudioContext(),
    getFileSystemManager: () => ({
      readFile: ({ fail }) => {
        fail(new Error('no file in tests'));
      },
    }),
    getStorageSync: (key) => (store.has(key) ? store.get(key) : ''),
    setStorageSync: (key, data) => {
      store.set(key, data);
    },
    removeStorageSync: (key) => {
      store.delete(key);
    },
    getStorageInfoSync: () => ({ keys: [...store.keys()] }),
    onTouchStart: (fn) => touchSubs.start.add(fn),
    offTouchStart: (fn) => touchSubs.start.delete(fn),
    onTouchMove: (fn) => touchSubs.move.add(fn),
    offTouchMove: (fn) => touchSubs.move.delete(fn),
    onTouchEnd: (fn) => touchSubs.end.add(fn),
    offTouchEnd: (fn) => touchSubs.end.delete(fn),
    onTouchCancel: (fn) => touchSubs.cancel.add(fn),
    offTouchCancel: (fn) => touchSubs.cancel.delete(fn),
    onShow: (fn) => showSubs.add(fn),
    offShow: (fn) => showSubs.delete(fn),
    onHide: (fn) => hideSubs.add(fn),
    offHide: (fn) => hideSubs.delete(fn),
    touch(type, ...touches) {
      const changed = touches.map(([identifier, clientX, clientY]) => ({
        identifier,
        clientX,
        clientY,
      }));
      const e: WxTouchEvent = { touches: changed, changedTouches: changed };
      for (const fn of touchSubs[type]) fn(e);
    },
    hide() {
      for (const fn of hideSubs) fn();
    },
    show() {
      for (const fn of showSubs) fn();
    },
    listenerCount() {
      return (
        touchSubs.start.size +
        touchSubs.move.size +
        touchSubs.end.size +
        touchSubs.cancel.size +
        showSubs.size +
        hideSubs.size
      );
    },
  };
}
