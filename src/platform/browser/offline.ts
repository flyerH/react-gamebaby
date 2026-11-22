import { Capacitor } from '@capacitor/core';

export interface SetupOfflineCacheOptions {
  /**
   * 非本地模式时调用的注册函数。由入口传入 `registerSW`，
   * 避免 platform 层直接依赖 Vite 的 `virtual:pwa-register`
   */
  register?: () => void;
}

/** 本地模式：混合应用加载 APK 内打包资源，页面地址为 https://localhost */
function isBundledNative(): boolean {
  return Capacitor.isNativePlatform() && location.hostname === 'localhost';
}

/**
 * 按运行模式配置 Service Worker
 *
 * - 本地模式：资源已在 APK 内，不注册 SW；若旧版本已注册，主动注销并清空缓存
 * - 其余（线上域名模式 / 网页版 / PWA）：调用 register 注册 SW 以支持离线
 */
export function setupOfflineCache(options: SetupOfflineCacheOptions = {}): void {
  if (isBundledNative()) {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }
    if ('caches' in globalThis) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
    return;
  }

  options.register?.();
}
