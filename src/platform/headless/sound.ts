import type { Sound } from '@/engine/types';

/**
 * 无声实现：训练 / 测试默认使用
 *
 * 浏览器实现见 `src/platform/browser/sound.ts`（zzfx 适配）。
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
