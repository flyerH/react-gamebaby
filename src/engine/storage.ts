import type { Storage } from './types';

/**
 * 创建纯内存版本的 Storage
 *
 * 用途：Node 训练 / 测试 / 初次加载缺省。
 * 浏览器运行时会提供 localStorage 适配器（放在 L4 / runtime 层，不在 Engine）。
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
