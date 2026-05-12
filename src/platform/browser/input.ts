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

/**
 * 平台层生成 long-press repeat 的按键集合 —— "游戏键"。
 *
 * 这是 *平台层*（输入硬件抽象）的判断："这种按键的物理特性决定了长按
 * 时玩家有持续触发的期望"。和具体哪款游戏无关：
 * - 方向键 / A / B 是经典游戏键，长按物理上是"持续意图"
 * - Start / Pause / Sound / Reset / Select 是控制键，长按没有"持续"语义
 *   （按住 Reset 不应该重复重开局）
 *
 * 游戏在 onButton 内通过 ButtonAction='repeat' 决定要不要响应这次 repeat。
 * 游戏不需要知道哪些键 repeat、不需要知道节奏，平台层做出合理默认即可
 */
const REPEAT_KEYS: ReadonlySet<Button> = new Set(['Up', 'Down', 'Left', 'Right', 'A', 'B']);

/**
 * 长按起始延迟（毫秒）—— 首次按下到开始 repeat 的间隔。
 *
 * 250ms 接近 OS 习惯的"短点按 vs 长按"分界。低于这个就分不清意图：玩家点
 * 一下方向键打算"走一格 + 改向"，但延迟太短就被当成长按又走多格
 */
const REPEAT_DELAY_MS = 250;

/**
 * 长按重复触发间隔（毫秒）
 *
 * 100ms = 10 steps/s，对齐社区主流 Web 实现的体感
 */
const REPEAT_INTERVAL_MS = 100;

export interface BindKeyboardOptions {
  /** 绑定目标；默认 window */
  target?: EventTarget;
  /** 自定义键位映射；不传则用 DEFAULT_KEY_MAP */
  keyMap?: Readonly<Record<string, Button>>;
  /** 命中映射时是否阻止默认行为（如方向键滚动页面）；默认 true */
  preventDefault?: boolean;
  /** 长按起始延迟（毫秒）；默认 250ms。区分"点按"与"长按"意图 */
  repeatDelayMs?: number;
  /** 长按重复触发间隔（毫秒）；默认 100ms */
  repeatIntervalMs?: number;
}

/**
 * 把键盘事件桥接到 L3 InputBus
 *
 * 行为：
 * - 首次 keydown（e.repeat=false）→ inputBus.emit(btn, 'press')。若 btn 是
 *   游戏键（方向键 / A / B），再调度 repeatDelayMs 后开始按 repeatIntervalMs
 *   周期 emit 'repeat'，直到 keyup
 * - OS 重复 keydown（e.repeat=true）→ 忽略（我们的 timer 接管节奏）
 * - keyup → 清掉该键的 timer（若有）+ inputBus.emit(btn, 'release')
 * - 未命中映射的按键忽略，不吞事件
 * - 带 Ctrl / Meta / Alt 修饰键的组合一律不处理，留给浏览器快捷键
 *   （Ctrl+R / Cmd+R 刷新、Cmd+W 关标签、DevTools 等）
 *
 * @returns 解绑函数，调用后移除事件监听；解绑时也会清掉所有未到期的 timer
 */
export function bindKeyboardInput(inputBus: InputBus, opts: BindKeyboardOptions = {}): Unsubscribe {
  const {
    target = window,
    keyMap = DEFAULT_KEY_MAP,
    preventDefault = true,
    repeatDelayMs = REPEAT_DELAY_MS,
    repeatIntervalMs = REPEAT_INTERVAL_MS,
  } = opts;

  // 每个正在长按的 button 对应一个 setTimeout 句柄（递归 self-reschedule）
  const repeatTimers = new Map<Button, ReturnType<typeof setTimeout>>();

  const scheduleRepeat = (btn: Button, delay: number): void => {
    const id = setTimeout(() => {
      inputBus.emit(btn, 'repeat');
      scheduleRepeat(btn, repeatIntervalMs);
    }, delay);
    repeatTimers.set(btn, id);
  };

  const clearRepeat = (btn: Button): void => {
    const id = repeatTimers.get(btn);
    if (id !== undefined) {
      clearTimeout(id);
      repeatTimers.delete(btn);
    }
  };

  const onDown = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const btn = keyMap[e.key];
    if (!btn) return;
    if (preventDefault) e.preventDefault();
    if (e.repeat) return; // OS 重复 keydown 由我们的 timer 接管
    inputBus.emit(btn, 'press');
    if (REPEAT_KEYS.has(btn) && !repeatTimers.has(btn)) {
      scheduleRepeat(btn, repeatDelayMs);
    }
  };

  const onUp = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const btn = keyMap[e.key];
    if (!btn) return;
    if (preventDefault) e.preventDefault();
    clearRepeat(btn);
    inputBus.emit(btn, 'release');
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);

  return () => {
    for (const id of repeatTimers.values()) clearTimeout(id);
    repeatTimers.clear();
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
  };
}
