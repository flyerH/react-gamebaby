import { describe, it, expect, vi } from 'vitest';
import { createInputBus } from '../input';

describe('createInputBus', () => {
  it('初始 pressed 集合为空', () => {
    const bus = createInputBus();
    expect(bus.pressed.size).toBe(0);
  });

  it('press 后 pressed 集合包含该键，订阅者收到通知', () => {
    const bus = createInputBus();
    const spy = vi.fn();
    bus.subscribe(spy);
    bus.emit('Up', 'press');
    expect(bus.pressed.has('Up')).toBe(true);
    expect(spy).toHaveBeenCalledExactlyOnceWith('Up', 'press');
  });

  it('重复 press 同一按键仍通知（让 OS key repeat 序列穿透到订阅者）', () => {
    const bus = createInputBus();
    const spy = vi.fn();
    bus.subscribe(spy);
    bus.emit('A', 'press');
    bus.emit('A', 'press');
    bus.emit('A', 'press');
    // press 不去重：调用者收到 3 次通知
    expect(spy).toHaveBeenCalledTimes(3);
    // pressed 集合幂等：重复 press 不让 size 变大
    expect(bus.pressed.has('A')).toBe(true);
    expect(bus.pressed.size).toBe(1);
  });

  it('release 让按键离开 pressed 集合', () => {
    const bus = createInputBus();
    bus.emit('Left', 'press');
    bus.emit('Left', 'release');
    expect(bus.pressed.has('Left')).toBe(false);
  });

  it('未 press 过的 release 是 no-op', () => {
    const bus = createInputBus();
    const spy = vi.fn();
    bus.subscribe(spy);
    bus.emit('B', 'release');
    expect(spy).not.toHaveBeenCalled();
  });

  it('多键可以同时按下', () => {
    const bus = createInputBus();
    bus.emit('Up', 'press');
    bus.emit('A', 'press');
    expect(bus.pressed.size).toBe(2);
    expect(bus.pressed.has('Up')).toBe(true);
    expect(bus.pressed.has('A')).toBe(true);
  });

  it('unsubscribe 后不再收到通知', () => {
    const bus = createInputBus();
    const spy = vi.fn();
    const off = bus.subscribe(spy);
    bus.emit('Start', 'press');
    off();
    bus.emit('Start', 'release');
    expect(spy).toHaveBeenCalledExactlyOnceWith('Start', 'press');
  });

  it('多订阅者按注册顺序被调用', () => {
    const bus = createInputBus();
    const calls: string[] = [];
    bus.subscribe(() => calls.push('a'));
    bus.subscribe(() => calls.push('b'));
    bus.emit('Down', 'press');
    expect(calls).toEqual(['a', 'b']);
  });
});
