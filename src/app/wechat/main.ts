import type { MiniGameApi } from '@/platform/wechat';

import { startWechatApp } from './app';

/** 小游戏全局 wx，按结构匹配 platform/wechat 声明的最小子集 */
declare const wx: MiniGameApi;

startWechatApp({
  wx,
  requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  cancelAnimationFrame: (h) => {
    cancelAnimationFrame(h);
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => {
    clearTimeout(h);
  },
  now: () => Date.now(),
});
