import type { Sound } from './types';

/**
 * 无声 Sound：engine 提供的跨平台默认实现
 *
 * 无任何平台耦合，Node / 浏览器 / 测试都可直接使用。
 * 需要真实发声时请改用 `src/platform/browser/sound.ts` 的 Web Audio 适配。
 */
export function createNullSound(): Sound {
  let enabled = false;
  return {
    play: () => {
      /* 无实际发声 */
    },
    playMelody: () => () => {
      /* 无实际发声，cancel 也是 no-op */
    },
    setEnabled: (on: boolean) => {
      enabled = on;
    },
    canAutoplay: () => Promise.resolve(false),
    get enabled() {
      return enabled;
    },
  };
}
