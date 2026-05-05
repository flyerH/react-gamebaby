import type { Counter, Storage, Toggle, Unsubscribe } from './types';

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
 * 创建一个持久化 Counter：从 storage 恢复初值，每次变更写回
 *
 * - 构造时若 key 存在则用 storage 值覆盖 initial；否则写回 initial 一次，
 *   保证下一次恢复能拿到相同的起点。
 * - 用 subscribe 劫持写回时机：只有值"真的变了" Counter 才会通知，
 *   所以不会因为重复 set 同一个值而产生冗余 I/O。
 * - storage 抽象由 engine/types 定义，具体实现（memory / localStorage）
 *   在 engine / platform 各自提供，本函数与平台完全解耦。
 */
export function createPersistentCounter(storage: Storage, key: string, initial = 0): Counter {
  const restored = storage.get<number>(key);
  const start = typeof restored === 'number' ? restored : initial;
  const counter = createCounter(start);
  if (restored === null) storage.set(key, start);
  counter.subscribe((v) => {
    storage.set(key, v);
  });
  return counter;
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
