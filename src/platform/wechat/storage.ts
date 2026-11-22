import type { Storage } from '@/engine/types';

import type { MiniGameApi } from './api';

type StorageApi = Pick<
  MiniGameApi,
  'getStorageSync' | 'setStorageSync' | 'removeStorageSync' | 'getStorageInfoSync'
>;

/**
 * 基于 wx 同步存储的 Storage 适配
 *
 * 值统一存成 JSON 字符串：wx.getStorageSync 对不存在的 key 返回空字符串，
 * 存字符串后可以用空串区分未命中。存储异常（配额用尽等）静默降级，与浏览器版一致。
 */
export function createWxStorage(api: StorageApi, prefix = 'gamebaby:'): Storage {
  const k = (key: string): string => prefix + key;
  return {
    get<T>(key: string): T | null {
      try {
        const raw = api.getStorageSync(k(key));
        if (typeof raw !== 'string' || raw === '') return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        api.setStorageSync(k(key), JSON.stringify(value));
      } catch {
        // 配额用尽等写入失败：静默降级
      }
    },
    remove(key: string): void {
      try {
        api.removeStorageSync(k(key));
      } catch {
        // 同上
      }
    },
    clear(): void {
      try {
        for (const key of api.getStorageInfoSync().keys) {
          if (key.startsWith(prefix)) api.removeStorageSync(key);
        }
      } catch {
        // 同上
      }
    },
  };
}
