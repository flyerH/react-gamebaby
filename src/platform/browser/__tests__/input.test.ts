import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createInputBus } from '@/engine/input';
import type { Button, InputBus } from '@/engine/types';

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
    const log: Array<[Button, 'press' | 'release']> = [];
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

  it('长按重复 keydown 被 InputBus 去重，只通知一次', () => {
    const fn = vi.fn();
    input.subscribe(fn);
    bindKeyboardInput(input, { target });

    fireKey(target, 'keydown', 'ArrowUp');
    fireKey(target, 'keydown', 'ArrowUp');
    fireKey(target, 'keydown', 'ArrowUp');
    expect(fn).toHaveBeenCalledTimes(1);
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
