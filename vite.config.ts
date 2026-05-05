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
  },
  build: {
    target: 'es2022',
    // 生产产物默认不出 sourcemap：避免 .map 随 dist 同步上线后泄露源码
    // 映射；本地排障 / CI 调试时可临时开启 vite build --sourcemap
    sourcemap: false,
    outDir: 'dist',
  },
});
