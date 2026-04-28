import type { Storage } from '@/engine/types';

/**
 * 创建纯内存版本的 Storage
 *
 * 用途：Node 训练 / 测试 / 初次加载缺省。
 * 浏览器实现见 `src/platform/browser/storage.ts`（localStorage 适配）。
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
