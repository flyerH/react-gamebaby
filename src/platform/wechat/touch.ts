import type { Button, InputBus, Unsubscribe } from '@/engine/types';

import type { MiniGameApi, WxTouchEvent } from './api';

type TouchApi = Pick<
  MiniGameApi,
  | 'onTouchStart'
  | 'offTouchStart'
  | 'onTouchMove'
  | 'offTouchMove'
  | 'onTouchEnd'
  | 'offTouchEnd'
  | 'onTouchCancel'
  | 'offTouchCancel'
>;

/** 把触点坐标（逻辑像素）映射到按键；不在任何按键上返回 null */
export type HitTest = (x: number, y: number) => Button | null;

/**
 * 把小游戏触摸事件桥接到 InputBus
 *
 * - 按 touch.identifier 跟踪每根手指，支持多指同时按（按住方向键的同时按旋转）
 * - 手指滑到另一个按键上时，松开原按键并按下新按键，便于在方向键之间滑动
 * - 同一按键被多根手指按住时按引用计数处理，最后一根手指离开才 release
 * - 只发 press / release，长按连发由 engine 的 bindPressRepeat 产生
 */
export function bindTouchInput(api: TouchApi, input: InputBus, hitTest: HitTest): Unsubscribe {
  const fingers = new Map<number, Button | null>();
  const holds = new Map<Button, number>();

  const acquire = (btn: Button | null): void => {
    if (!btn) return;
    const n = holds.get(btn) ?? 0;
    holds.set(btn, n + 1);
    if (n === 0) input.emit(btn, 'press');
  };

  const release = (btn: Button | null | undefined): void => {
    if (!btn) return;
    const n = holds.get(btn) ?? 0;
    if (n <= 1) {
      holds.delete(btn);
      if (n === 1) input.emit(btn, 'release');
    } else {
      holds.set(btn, n - 1);
    }
  };

  const onStart = (e: WxTouchEvent): void => {
    for (const t of e.changedTouches) {
      const btn = hitTest(t.clientX, t.clientY);
      fingers.set(t.identifier, btn);
      acquire(btn);
    }
  };

  const onMove = (e: WxTouchEvent): void => {
    for (const t of e.changedTouches) {
      if (!fingers.has(t.identifier)) continue;
      const prev = fingers.get(t.identifier) ?? null;
      const next = hitTest(t.clientX, t.clientY);
      if (next === prev) continue;
      release(prev);
      acquire(next);
      fingers.set(t.identifier, next);
    }
  };

  const onEnd = (e: WxTouchEvent): void => {
    for (const t of e.changedTouches) {
      release(fingers.get(t.identifier));
      fingers.delete(t.identifier);
    }
  };

  api.onTouchStart(onStart);
  api.onTouchMove(onMove);
  api.onTouchEnd(onEnd);
  api.onTouchCancel(onEnd);

  return () => {
    api.offTouchStart(onStart);
    api.offTouchMove(onMove);
    api.offTouchEnd(onEnd);
    api.offTouchCancel(onEnd);
    for (const btn of holds.keys()) input.emit(btn, 'release');
    holds.clear();
    fingers.clear();
  };
}
