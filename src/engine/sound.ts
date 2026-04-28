import type { Sound } from './types';

/**
 * 无声实现：训练 / 测试默认使用
 *
 * 浏览器运行时会提供 zzfx 适配器（放在 L4 / runtime 层，不在 Engine）。
 */
export function createNullSound(): Sound {
  let enabled = false;
  return {
    play: () => {
      /* 无实际发声 */
    },
    setEnabled: (on: boolean) => {
      enabled = on;
    },
    get enabled() {
      return enabled;
    },
  };
}
