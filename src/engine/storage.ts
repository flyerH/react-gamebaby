import type { Storage } from './types';

/**
 * 纯内存版 Storage：engine 提供的跨平台默认实现
 *
 * 无任何平台耦合，Node / 浏览器 / 测试都可直接使用。
 * 需要持久化时请改用 `src/platform/browser/storage.ts` 的 localStorage 适配。
 */
export function createMemoryStorage(): Storage {
  const map = new Map<string, unknown>();

  return {
    get<T>(key: string): T | null {
      return map.has(key) ? (map.get(key) as T) : null;
    },
    set<T>(key: string, value: T): void {
      map.set(key, value);
    },
    remove(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
  };
}
