import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
