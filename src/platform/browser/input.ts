import type { Schedule } from '@/engine/repeat';
import type { Button, InputBus, Unsubscribe } from '@/engine/types';

/**
 * 键盘到掌机按键的默认映射
 *
 * 设计参考主流 Web 游戏惯例：方向键 + 空格跳、z/x 做动作键、Enter 开始。
 * 调用方可传入自定义映射覆盖（例如适配 WASD）。
 */
export const DEFAULT_KEY_MAP: Readonly<Record<string, Button>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  w: 'Up',
  s: 'Down',
  a: 'Left',
  d: 'Right',
  ' ': 'A',
  z: 'A',
  x: 'B',
  Enter: 'Start',
  Shift: 'Select',
  p: 'Pause',
  m: 'Sound',
  r: 'Reset',
};

/** 基于 setTimeout 的计时器，供 engine 的 bindPressRepeat 使用 */
export const timeoutSchedule: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => {
    clearTimeout(id);
  };
};

export interface BindKeyboardOptions {
  /** 绑定目标；默认 window */
  target?: EventTarget;
  /** 自定义键位映射；不传则用 DEFAULT_KEY_MAP */
  keyMap?: Readonly<Record<string, Button>>;
  /** 命中映射时是否阻止默认行为（如方向键滚动页面）；默认 true */
  preventDefault?: boolean;
}

/**
 * 把键盘事件桥接到 engine 的 InputBus
 *
 * 行为：
 * - 首次 keydown（e.repeat=false）→ inputBus.emit(btn, 'press')
 * - 系统重复 keydown（e.repeat=true）→ 忽略，长按连发由 engine 的 bindPressRepeat 统一产生
 * - keyup → inputBus.emit(btn, 'release')
 * - 未命中映射的按键忽略，不调用 preventDefault
 * - 带 Ctrl / Meta / Alt 修饰键的组合一律不处理，留给浏览器快捷键
 *   （Ctrl+R / Cmd+R 刷新、Cmd+W 关标签、DevTools 等）
 *
 * @returns 解绑函数，调用后移除事件监听
 */
export function bindKeyboardInput(inputBus: InputBus, opts: BindKeyboardOptions = {}): Unsubscribe {
  const { target = window, keyMap = DEFAULT_KEY_MAP, preventDefault = true } = opts;

  const resolve = (ev: Event): Button | undefined => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) return undefined;
    const btn = keyMap[e.key] ?? keyMap[e.key.toLowerCase()];
    if (btn && preventDefault) e.preventDefault();
    return btn;
  };

  const onDown = (ev: Event): void => {
    const btn = resolve(ev);
    if (!btn || (ev as KeyboardEvent).repeat) return;
    inputBus.emit(btn, 'press');
  };

  const onUp = (ev: Event): void => {
    const btn = resolve(ev);
    if (btn) inputBus.emit(btn, 'release');
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);

  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
  };
}
