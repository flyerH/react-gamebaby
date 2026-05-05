import type { Storage } from '@/engine/types';

/**
 * 基于 localStorage 的 Storage 适配
 *
 * - 用 JSON 序列化承载任意值：适合 hi-score / 设置等小数据，
 *   大块数据应另走 IndexedDB（暂未需要）。
 * - 所有 key 自动加 prefix，避免与宿主页面 / 其他应用撞库。
 * - 运行环境不支持 localStorage（无痕模式可能拒绝写入、SSR 下 window 不存在）
 *   时自动回退到进程内 Map：功能等价 `createMemoryStorage()`，不抛异常，
 *   只是不持久化；这样调用方不需要分支处理。
 * - clear() 只清掉带 prefix 的键，不动页面里其他库写入的条目。
 */
export function createLocalStorage(prefix = 'gamebaby:'): Storage {
  const backing = resolveBacking();
  const k = (key: string): string => prefix + key;

  // 受限环境（Safari ITP / 严格 iframe / 配额耗尽）下，
  // localStorage 的所有方法都可能抛 SecurityError / QuotaExceededError。
  // 用统一兜底：读路径返回 null（视为未命中），写 / 删 / 清路径静默 no-op，
  // 让上层游戏 / UI 不必处理这些异常态。
  return {
    get<T>(key: string): T | null {
      let raw: string | null;
      try {
        raw = backing.getItem(k(key));
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // 存储被外部改动 / 不是合法 JSON：视作未命中，交回调用方决定默认值
        return null;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        backing.setItem(k(key), JSON.stringify(value));
      } catch {
        // QuotaExceededError / 无痕模式的 setItem 抛错：静默降级，不让上层崩
      }
    },
    remove(key: string): void {
      try {
        backing.removeItem(k(key));
      } catch {
        // 同上
      }
    },
    clear(): void {
      try {
        const keys: string[] = [];
        for (let i = 0; i < backing.length; i++) {
          const kk = backing.key(i);
          if (kk !== null && kk.startsWith(prefix)) keys.push(kk);
        }
        for (const kk of keys) backing.removeItem(kk);
      } catch {
        // 同上
      }
    },
  };
}

/**
 * localStorage 可用就用它；否则返回一个满足同样 API 的内存实现
 */
function resolveBacking(): MinimalStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // 访问 localStorage 抛错（某些严格策略的 iframe）：走内存回退
  }
  return createMemoryBacking();
}

interface MinimalStorage {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function createMemoryBacking(): MinimalStorage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    key(i: number): string | null {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
