import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createInputBus } from '@/engine/input';
import type { Button, ButtonAction, InputBus } from '@/engine/types';

import { bindKeyboardInput, DEFAULT_KEY_MAP } from '../input';

function fireKey(
  target: EventTarget,
  type: 'keydown' | 'keyup',
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}
): KeyboardEvent {
  const ev = new KeyboardEvent(type, {
    key,
    cancelable: true,
    bubbles: true,
    ...modifiers,
  });
  target.dispatchEvent(ev);
  return ev;
}

describe('bindKeyboardInput', () => {
  let input: InputBus;
  let target: EventTarget;

  beforeEach(() => {
    input = createInputBus();
    target = new EventTarget();
  });

  it('默认映射把方向键 / 空格 / 回车桥接到对应 Button', () => {
    const log: Array<[Button, ButtonAction]> = [];
    input.subscribe((btn, action) => log.push([btn, action]));
    bindKeyboardInput(input, { target });

    fireKey(target, 'keydown', 'ArrowLeft');
    fireKey(target, 'keyup', 'ArrowLeft');
    fireKey(target, 'keydown', ' ');
    fireKey(target, 'keydown', 'Enter');

    expect(log).toEqual([
      ['Left', 'press'],
      ['Left', 'release'],
      ['A', 'press'],
      ['Start', 'press'],
    ]);
  });

  it('未命中映射的键忽略，不触发事件', () => {
    const fn = vi.fn();
    input.subscribe(fn);
    bindKeyboardInput(input, { target });

    fireKey(target, 'keydown', 'F12');
    fireKey(target, 'keydown', 'q');
    expect(fn).not.toHaveBeenCalled();
  });

  it('OS 重复 keydown (e.repeat=true) 被忽略 —— 重复触发由内部 timer 接管', () => {
    const fn = vi.fn();
    input.subscribe(fn);
    bindKeyboardInput(input, { target });

    fireKey(target, 'keydown', 'ArrowUp'); // 首次 → emit press
    const repeat = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      cancelable: true,
      bubbles: true,
      repeat: true,
    });
    target.dispatchEvent(repeat);
    target.dispatchEvent(repeat);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('游戏键长按：press 后 delay ms 起每 interval ms emit "repeat"', () => {
    vi.useFakeTimers();
    const log: Array<[Button, string]> = [];
    input.subscribe((btn, action) => log.push([btn, action]));
    bindKeyboardInput(input, { target, repeatDelayMs: 200, repeatIntervalMs: 50 });

    fireKey(target, 'keydown', 'ArrowRight');
    expect(log).toEqual([['Right', 'press']]);
    vi.advanceTimersByTime(199);
    expect(log).toHaveLength(1);
    // 延迟到期 → 第一次 repeat
    vi.advanceTimersByTime(1);
    expect(log[1]).toEqual(['Right', 'repeat']);
    // 之后每 50ms 一次 repeat
    vi.advanceTimersByTime(150);
    expect(log).toHaveLength(5);
    fireKey(target, 'keyup', 'ArrowRight');
    vi.advanceTimersByTime(200);
    expect(log[log.length - 1]).toEqual(['Right', 'release']);
    vi.useRealTimers();
  });

  it('A 键（Rotate）也是游戏键 —— 长按生成 repeat 序列，让 Snake 用作快进', () => {
    vi.useFakeTimers();
    const log: Array<[Button, string]> = [];
    input.subscribe((btn, action) => log.push([btn, action]));
    bindKeyboardInput(input, { target, repeatDelayMs: 100, repeatIntervalMs: 50 });

    fireKey(target, 'keydown', ' '); // 空格 → 'A'
    expect(log).toEqual([['A', 'press']]);
    vi.advanceTimersByTime(150); // 100 delay + 50 interval = 2 次 repeat
    expect(log.filter(([, a]) => a === 'repeat')).toHaveLength(2);
    vi.useRealTimers();
  });

  it('控制键（Start / Pause / Sound / Reset）长按不触发 repeat —— 没有"持续按下"语义', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    input.subscribe(fn);
    bindKeyboardInput(input, { target, repeatDelayMs: 100, repeatIntervalMs: 50 });

    fireKey(target, 'keydown', 'Enter'); // 'Start'
    fireKey(target, 'keydown', 'p'); // 'Pause'
    fireKey(target, 'keydown', 'm'); // 'Sound'
    fireKey(target, 'keydown', 'r'); // 'Reset'
    expect(fn).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(500); // 即便等 500ms 也不会再触发
    expect(fn).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('detach 时清掉所有未到期的 timer', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    input.subscribe(fn);
    const detach = bindKeyboardInput(input, {
      target,
      repeatDelayMs: 50,
      repeatIntervalMs: 50,
    });

    fireKey(target, 'keydown', 'ArrowLeft');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    detach();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('命中映射时默认会 preventDefault', () => {
    bindKeyboardInput(input, { target });
    const ev = fireKey(target, 'keydown', 'ArrowDown');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('preventDefault: false 时不阻止默认行为', () => {
    bindKeyboardInput(input, { target, preventDefault: false });
    const ev = fireKey(target, 'keydown', 'ArrowDown');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('自定义 keyMap 可覆盖默认映射', () => {
    const log: Button[] = [];
    input.subscribe((btn) => log.push(btn));
    bindKeyboardInput(input, {
      target,
      keyMap: { j: 'Left', l: 'Right' },
    });

    fireKey(target, 'keydown', 'j');
    fireKey(target, 'keydown', 'l');
    fireKey(target, 'keydown', 'ArrowLeft'); // 此时不再命中
    expect(log).toEqual(['Left', 'Right']);
  });

  it('返回的 detach 移除监听', () => {
    const fn = vi.fn();
    input.subscribe(fn);
    const detach = bindKeyboardInput(input, { target });

    fireKey(target, 'keydown', 'ArrowUp');
    expect(fn).toHaveBeenCalledTimes(1);

    detach();
    fireKey(target, 'keydown', 'ArrowDown');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('带 Ctrl / Meta / Alt 修饰键的组合不处理，也不 preventDefault', () => {
    const fn = vi.fn();
    input.subscribe(fn);
    bindKeyboardInput(input, { target });

    const ev1 = fireKey(target, 'keydown', 'r', { ctrlKey: true });
    const ev2 = fireKey(target, 'keydown', 'r', { metaKey: true });
    const ev3 = fireKey(target, 'keydown', 'ArrowUp', { altKey: true });

    expect(fn).not.toHaveBeenCalled();
    expect(ev1.defaultPrevented).toBe(false);
    expect(ev2.defaultPrevented).toBe(false);
    expect(ev3.defaultPrevented).toBe(false);
  });

  it('DEFAULT_KEY_MAP 至少覆盖四个方向键与 Start / A', () => {
    expect(DEFAULT_KEY_MAP.ArrowUp).toBe('Up');
    expect(DEFAULT_KEY_MAP.ArrowDown).toBe('Down');
    expect(DEFAULT_KEY_MAP.ArrowLeft).toBe('Left');
    expect(DEFAULT_KEY_MAP.ArrowRight).toBe('Right');
    expect(DEFAULT_KEY_MAP.Enter).toBe('Start');
    expect(DEFAULT_KEY_MAP[' ']).toBe('A');
  });
});
