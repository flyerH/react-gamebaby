import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import type { Unsubscribe } from '@/engine/types';

export interface BindAppStateOptions {
  /** 回到前台 / 重新可见时触发 */
  onForeground: () => void;
  /** 进入后台 / 不可见时触发 */
  onBackground: () => void;
}

/**
 * 把"应用进入后台 / 回到前台"桥接到应用层，供暂停 ticker 与音频用。
 *
 * 两个信号源并存并去重：
 * - Capacitor `appStateChange`：混合应用（Android/iOS WebView）的权威前后台信号；
 * - 浏览器 `visibilitychange`：普通浏览器 / PWA 的降级信号，也兜住部分
 *   WebView 不发 appStateChange 的情况。
 *
 * 用 `active` 去重：只有状态真正翻转时才回调一次，避免两个源在 App 内
 * 各发一次导致重复暂停 / 恢复。Capacitor 不可用（普通浏览器）时其监听静默
 * no-op，仅靠 visibilitychange 工作。
 *
 * @returns 解绑函数，移除所有监听器
 */
export function bindAppState(opts: BindAppStateOptions): Unsubscribe {
  let active = true;
  let cancelled = false;

  const setActive = (next: boolean): void => {
    if (cancelled || next === active) return;
    active = next;
    if (next) opts.onForeground();
    else opts.onBackground();
  };

  // Capacitor 前后台信号（Web 环境静默 no-op）
  let handle: PluginListenerHandle | null = null;
  void (async () => {
    try {
      const h = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        setActive(isActive);
      });
      if (cancelled) {
        void h.remove();
        return;
      }
      handle = h;
    } catch {
      // Capacitor 不可用（普通浏览器构建）→ 静默 no-op，仅靠 visibilitychange
    }
  })();

  // 浏览器可见性信号（含 PWA / WebView）
  const onVisibility = (): void => {
    setActive(!document.hidden);
  };
  const hasDocument = typeof document !== 'undefined';
  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    cancelled = true;
    if (handle) {
      void handle.remove();
      handle = null;
    }
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
