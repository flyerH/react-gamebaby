import type { Counter, Toggle, Unsubscribe } from './types';

/**
 * 创建一个可订阅的整数 Counter
 *
 * 语义要点：
 * - `set(n)` 在值未变时不通知订阅者（省去重复刷新）
 * - 订阅在返回的 unsubscribe 调用后失效
 */
export function createCounter(initial = 0): Counter {
  let value = initial;
  const subs = new Set<(v: number) => void>();

  const set = (n: number): void => {
    if (n === value) return;
    value = n;
    for (const fn of subs) fn(value);
  };

  return {
    get value() {
      return value;
    },
    set,
    add: (n: number) => set(value + n),
    subscribe(fn: (v: number) => void): Unsubscribe {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/**
 * 创建一个可订阅的布尔 Toggle
 *
 * 语义同 Counter：值未变时不通知。
 */
export function createToggle(initial = false): Toggle {
  let value = initial;
  const subs = new Set<(v: boolean) => void>();

  const set = (v: boolean): void => {
    if (v === value) return;
    value = v;
    for (const fn of subs) fn(value);
  };

  return {
    get value() {
      return value;
    },
    set,
    toggle: () => set(!value),
    subscribe(fn: (v: boolean) => void): Unsubscribe {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
