import type { Button, ButtonAction, InputBus, Unsubscribe } from './types';

/**
 * 创建纯内存 InputBus
 *
 * DOM-agnostic：不绑定任何事件源（keyboard / touch / gamepad / RL policy）。
 * 具体输入源由上层适配器调用 `emit(btn, action)` 注入。
 *
 * 语义要点：
 * - press   每次都通知订阅者；同时把按键加入 pressed 集合（幂等）
 * - repeat  平台层在 press 后按固定节奏 emit 的"长按重复"信号；fire 订阅者
 *           但不动 pressed 集合（pressed 反映"是否被按住"，与"是否在重复"无关）
 * - release 仅当 pressed 集合内有该键时通知（防御性，过滤无 press 的 release）
 *
 * `pressed` live ReadonlySet 反映"当前是否处于按下态"，订阅者可查询
 */
export function createInputBus(): InputBus {
  const pressed = new Set<Button>();
  const subs = new Set<(btn: Button, action: ButtonAction) => void>();

  return {
    emit(btn: Button, action: ButtonAction): void {
      switch (action) {
        case 'press':
          pressed.add(btn);
          break;
        case 'repeat':
          // 不动 pressed 集合：repeat 不算"新按下"
          break;
        case 'release':
          if (!pressed.has(btn)) return;
          pressed.delete(btn);
          break;
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
