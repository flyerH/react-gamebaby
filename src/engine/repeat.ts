import type { Button, InputBus, Unsubscribe } from './types';

/**
 * 参与长按连发的按键：方向键与 A / B 是游戏键，长按表示持续意图；
 * Start / Pause / Sound / Reset / Select 是控制键，长按没有持续语义
 * （按住 Reset 不应反复重开局）。
 *
 * 游戏在 onButton 内根据 ButtonAction='repeat' 自行决定是否响应。
 */
export const REPEAT_BUTTONS: ReadonlySet<Button> = new Set([
  'Up',
  'Down',
  'Left',
  'Right',
  'A',
  'B',
]);

/** 长按起始延迟：250ms 接近系统对点按与长按的分界，太短会把点按误判为长按 */
export const REPEAT_DELAY_MS = 250;

/** 长按重复间隔：100ms，即每秒 10 次 */
export const REPEAT_INTERVAL_MS = 100;

/**
 * 计时器注入：ms 毫秒后调用 fn，返回取消函数
 *
 * engine 不直接使用宿主计时器，由各平台传入实现（浏览器 / 小游戏用 setTimeout，
 * 测试用手动推进的假计时器）。
 */
export type Schedule = (fn: () => void, ms: number) => () => void;

export interface BindPressRepeatOptions {
  schedule: Schedule;
  delayMs?: number;
  intervalMs?: number;
}

/**
 * 在 InputBus 上生成长按连发
 *
 * 监听总线上的 press / release：游戏键 press 后 delayMs 开始，每 intervalMs
 * emit 一次 'repeat'，release 时停止。键盘、屏幕按钮、触控等输入源只需 emit
 * press / release，连发节奏统一在这里产生。
 *
 * @returns 解绑函数：取消订阅并清掉所有未到期的计时器
 */
export function bindPressRepeat(input: InputBus, opts: BindPressRepeatOptions): Unsubscribe {
  const { schedule, delayMs = REPEAT_DELAY_MS, intervalMs = REPEAT_INTERVAL_MS } = opts;
  const cancels = new Map<Button, () => void>();

  const arm = (btn: Button, ms: number): void => {
    cancels.set(
      btn,
      schedule(() => {
        input.emit(btn, 'repeat');
        arm(btn, intervalMs);
      }, ms)
    );
  };

  const disarm = (btn: Button): void => {
    cancels.get(btn)?.();
    cancels.delete(btn);
  };

  const unsub = input.subscribe((btn, action) => {
    if (!REPEAT_BUTTONS.has(btn)) return;
    if (action === 'press' && !cancels.has(btn)) arm(btn, delayMs);
    else if (action === 'release') disarm(btn);
  });

  return () => {
    unsub();
    for (const cancel of cancels.values()) cancel();
    cancels.clear();
  };
}
