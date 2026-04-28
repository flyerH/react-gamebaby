import { describe, it, expect, vi } from 'vitest';
import { createCounter, createToggle } from '../counter';

describe('createCounter', () => {
  it('初始值默认为 0', () => {
    expect(createCounter().value).toBe(0);
  });

  it('set 改变值并通知订阅者', () => {
    const c = createCounter(5);
    const spy = vi.fn();
    c.subscribe(spy);
    c.set(10);
    expect(c.value).toBe(10);
    expect(spy).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('add 在当前值基础上叠加', () => {
    const c = createCounter(3);
    c.add(4);
    c.add(-1);
    expect(c.value).toBe(6);
  });

  it('值未变化时不通知', () => {
    const c = createCounter(7);
    const spy = vi.fn();
    c.subscribe(spy);
    c.set(7);
    expect(spy).not.toHaveBeenCalled();
  });

  it('unsubscribe 后不再收到通知', () => {
    const c = createCounter();
    const spy = vi.fn();
    const off = c.subscribe(spy);
    c.set(1);
    off();
    c.set(2);
    expect(spy).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('多个订阅者独立工作', () => {
    const c = createCounter();
    const a = vi.fn();
    const b = vi.fn();
    c.subscribe(a);
    c.subscribe(b);
    c.set(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);
  });
});

describe('createToggle', () => {
  it('初始值默认为 false', () => {
    expect(createToggle().value).toBe(false);
  });

  it('toggle 在 true / false 之间切换', () => {
    const t = createToggle();
    t.toggle();
    expect(t.value).toBe(true);
    t.toggle();
    expect(t.value).toBe(false);
  });

  it('set 改变值并通知', () => {
    const t = createToggle(false);
    const spy = vi.fn();
    t.subscribe(spy);
    t.set(true);
    expect(spy).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('值未变化时不通知', () => {
    const t = createToggle(true);
    const spy = vi.fn();
    t.subscribe(spy);
    t.set(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('unsubscribe 后不再收到通知', () => {
    const t = createToggle(false);
    const spy = vi.fn();
    const off = t.subscribe(spy);
    t.toggle();
    off();
    t.toggle();
    expect(spy).toHaveBeenCalledExactlyOnceWith(true);
  });
});
