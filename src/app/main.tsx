import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('未找到 #root 挂载点');
}

// 混合应用（Capacitor Android WebView）下给 <html> 加 marker，让 CSS 区别于纯网页版：
// - 网页版：body 背景 azure 不变，机身居中 + 四周浅蓝
// - 混合应用：body 填机身蓝，适用范围见 App.module.css 中 html.is-native 的注释
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native');
}

// 本地模式下资源打包在 APK 内、由 Capacitor 以 https://localhost 提供，本就离线可用；
// SW 在这里只会让升级 APK 后的首次启动仍跑旧缓存。远程域名模式（CAP_REMOTE_URL）与网页版
// 仍靠 SW 离线，照常注册
const isBundledNative = Capacitor.isNativePlatform() && location.hostname === 'localhost';

if (isBundledNative) {
  // 装过旧版本的设备上 SW 已注册，不再注册不会让它失效，需主动注销并清掉其 precache
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }
} else {
  // 精确语义见 vite.config.ts 中 VitePWA 配置注释。
  // dev 模式下 virtual:pwa-register 是 no-op，不会干扰 vite HMR。
  registerSW({ immediate: true });
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
