import type { Button, ButtonAction, InputBus, Unsubscribe } from './types';

/**
 * 创建纯内存 InputBus
 *
 * DOM-agnostic：不绑定任何事件源（keyboard / touch / gamepad / RL policy）。
 * 具体输入源由上层适配器调用 `emit(btn, action)` 注入。
 *
 * 语义要点：
 * - 重复 press 同一个按键不会重复通知
 * - release 未被 press 的按键是 no-op
 * - `pressed` 是 live ReadonlySet，订阅者可直接查询当前状态
 */
export function createInputBus(): InputBus {
  const pressed = new Set<Button>();
  const subs = new Set<(btn: Button, action: ButtonAction) => void>();

  return {
    emit(btn: Button, action: ButtonAction): void {
      if (action === 'press') {
        if (pressed.has(btn)) return;
        pressed.add(btn);
      } else {
        if (!pressed.has(btn)) return;
        pressed.delete(btn);
      }
      for (const fn of subs) fn(btn, action);
    },

    subscribe(fn: (btn: Button, action: ButtonAction) => void): Unsubscribe {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },

    pressed,
  };
}
