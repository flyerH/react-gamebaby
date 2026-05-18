import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA / Service Worker：让线上版本（含 Capacitor 远程域名模式打出的 APK）
    // 在第二次启动起就能离线打开，并在后台静默拉新版本，下次启动自动生效。
    // - registerType: 'autoUpdate' —— 不弹窗，新 SW 安装后通过 skipWaiting 接管，
    //   当前会话不强刷，下次冷启动用新版（与玩家手感一致）
    // - workbox.globPatterns —— 把构建产物全部 precache（JS/CSS/HTML/icon/音效）
    // - navigateFallback —— SPA 路由兜底，离线情况下任意路径都回退到 index.html
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'GameBaby',
        short_name: 'GameBaby',
        description: 'Brick Game 9999-in-1 复古掌机模拟器',
        theme_color: '#4a94c1',
        background_color: '#4a94c1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,m4a}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8088,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    rollupOptions: {
      // 生产构建只打包游戏入口；training.html 仅 dev 时可用
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
