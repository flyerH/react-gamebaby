import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { setupOfflineCache } from '@/platform/browser/offline';

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

// 本地模式 / 线上域名模式 / 网页版的 SW 策略见 setupOfflineCache
setupOfflineCache({
  register: () => {
    // 精确语义见 vite.config.ts 中 VitePWA 配置注释。
    // dev 模式下 virtual:pwa-register 是 no-op，不会干扰 vite HMR。
    registerSW({ immediate: true });
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
