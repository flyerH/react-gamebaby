import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import type { Unsubscribe } from '@/engine/types';

/**
 * 返回键处理回调。
 *
 * 返回 `true` 表示应用层已处理（关闭面板或回到上一层）；
 * 返回 `false` 表示已没有可回退的层级（已在最外层），平台层据此调
 * `App.exitApp()` 退出原生 App。
 *
 * 在非 Android / 普通浏览器环境下，本绑定本身就不会触发，回调永远不会被调用
 */
export type BackButtonHandler = () => boolean | Promise<boolean>;

export interface BindBackButtonOptions {
  /** 返回键处理逻辑：由入口根据 machine 当前 mode 决定要做什么 */
  handler: BackButtonHandler;
}

/**
 * 把 Android 系统返回键桥接到应用层
 *
 * Capacitor 的契约：一旦添加 `backButton` 监听器，默认行为（关闭 App / 历史回退）
 * 由 JS 接管，因此应用层未处理时由这里调用 exitApp。
 *
 * Web 环境下 `@capacitor/app` 仍能 import，但 `addListener('backButton', ...)` 永
 * 远不会触发；Capacitor 缺失等极端情况由 try/catch 静默处理，使本绑定在
 * 浏览器构建里也安全 no-op，调用方不需要做环境检查
 *
 * @returns 解绑函数，调用后移除监听器
 */
export function bindBackButton(opts: BindBackButtonOptions): Unsubscribe {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  let inFlight = false;

  void (async () => {
    try {
      const h = await CapacitorApp.addListener('backButton', () => {
        // 并发保护：即便用户连续狂按返回键，也只让最早一次走完异步流程，
        // 避免弹两个确认框 / 重复 exitApp
        if (cancelled || inFlight) return;
        inFlight = true;
        void (async () => {
          let handled = false;
          try {
            handled = await opts.handler();
          } catch (err) {
            // 应用层 handler 抛错时视为未处理并执行退出，异常不再向外抛；
            // 真机调试时可在 console 看到报错，便于定位
            console.error('[bindBackButton] handler 抛错，按未处理处理：', err);
          }
          // await 期间组件可能已经 unmount → 解绑 → cancelled=true，
          // 此时即便 handler 返回 false 也不能再 exitApp，否则 React StrictMode
          // / HMR cleanup 路径会误退应用
          if (cancelled) {
            inFlight = false;
            return;
          }
          if (!handled) {
            try {
              await CapacitorApp.exitApp();
            } catch {
              // 非 Android 或不允许 exitApp 的环境忽略异常
            }
          }
          inFlight = false;
        })();
      });
      if (cancelled) {
        void h.remove();
        return;
      }
      handle = h;
    } catch {
      // Capacitor 不可用（普通浏览器构建）→ 静默 no-op
    }
  })();

  return () => {
    cancelled = true;
    if (handle) {
      void handle.remove();
      handle = null;
    }
  };
}
