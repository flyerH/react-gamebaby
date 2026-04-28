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
  m: 'Sound',
  r: 'Reset',
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
 * 把键盘事件桥接到 L3 InputBus
 *
 * 行为：
 * - keydown → inputBus.emit(btn, 'press')
 * - keyup   → inputBus.emit(btn, 'release')
 * - 未命中映射的按键忽略，不吞事件
 * - 长按浏览器会重复发 keydown，InputBus.emit 已对重复 press 去重
 *
 * @returns 解绑函数，调用后移除事件监听
 */
export function bindKeyboardInput(inputBus: InputBus, opts: BindKeyboardOptions = {}): Unsubscribe {
  const { target = window, keyMap = DEFAULT_KEY_MAP, preventDefault = true } = opts;

  const onKey =
    (action: 'press' | 'release') =>
    (ev: Event): void => {
      const e = ev as KeyboardEvent;
      const btn = keyMap[e.key];
      if (!btn) return;
      if (preventDefault) e.preventDefault();
      inputBus.emit(btn, action);
    };

  const down = onKey('press');
  const up = onKey('release');

  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);

  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
  };
}
