import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import type { Unsubscribe } from '@/engine/types';

/**
 * 返回键处理回调。
 *
 * 返回 `true` 表示已被应用层吃掉（关掉某个面板 / 回到上一层）；
 * 返回 `false` 表示应用没东西可"回退"了（已在最外层），平台层据此调
 * `App.exitApp()` 退出原生 App。
 *
 * 在非 Android / 普通浏览器环境下，本绑定本身就不会触发，回调永远不会被调用
 */
export type BackButtonHandler = () => boolean | Promise<boolean>;

export interface BindBackButtonOptions {
  /** 返回键处理逻辑 —— 由 L4 应用层根据当前 mode 决定要做什么 */
  handler: BackButtonHandler;
}

/**
 * 把 Android 系统返回键桥接到应用层
 *
 * Capacitor 的契约：一旦添加 `backButton` 监听器，默认行为（关闭 App / 历史回退）
 * 就完全交给 JS。所以这里负责"如果应用层没处理就 exitApp"的兜底。
 *
 * Web 环境下 `@capacitor/app` 仍能 import，但 `addListener('backButton', ...)` 永
 * 远不会触发；Capacitor 缺失等极端情况由 try/catch 静默处理 —— 让本绑定在
 * 浏览器构建里也安全 no-op，调用方不需要做环境检查
 *
 * @returns 解绑函数，调用后移除监听器
 */
export function bindBackButton(opts: BindBackButtonOptions): Unsubscribe {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;

  void (async () => {
    try {
      const h = await CapacitorApp.addListener('backButton', () => {
        void (async () => {
          let handled = false;
          try {
            handled = await opts.handler();
          } catch {
            // 应用层 handler 抛错时按"未处理"算，触发退出兜底但不冒泡
          }
          if (!handled) {
            try {
              await CapacitorApp.exitApp();
            } catch {
              // 非 Android / 不允许 exitApp 的环境吞掉
            }
          }
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
