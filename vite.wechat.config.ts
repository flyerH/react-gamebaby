import { cpSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * 微信小游戏构建：把 src/app/wechat/main.ts 打成单文件 game.js，连同
 * src/app/wechat/public/game.json 输出到 wechat/dist/。微信开发者工具导入 wechat/ 目录，
 * 其 project.config.json 通过 miniprogramRoot 指向 dist/。
 *
 * - 产物是 IIFE：小游戏不支持 ES module 加载，也没有 DOM
 * - target es2015：覆盖较老基础库的 JS 引擎，可选链等新语法由构建降级
 * - 音效采样与网页版共用 public/sounds/，构建后复制进小游戏包
 */
const copySounds = (): Plugin => ({
  name: 'copy-wechat-sounds',
  closeBundle() {
    cpSync('public/sounds', 'wechat/dist/sounds', { recursive: true });
  },
});

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  publicDir: 'src/app/wechat/public',
  plugins: [copySounds()],
  build: {
    outDir: 'wechat/dist',
    emptyOutDir: true,
    target: 'es2015',
    lib: {
      entry: fileURLToPath(new URL('./src/app/wechat/main.ts', import.meta.url)),
      formats: ['iife'],
      name: 'GameBabyWechat',
      fileName: () => 'game.js',
    },
  },
});
