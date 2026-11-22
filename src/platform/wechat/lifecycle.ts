import type { Unsubscribe } from '@/engine/types';

import type { MiniGameApi } from './api';

export interface BindLifecycleOptions {
  readonly onBackground: () => void;
  readonly onForeground: () => void;
}

/** 小游戏切到后台 / 回到前台：wx.onHide / wx.onShow */
export function bindAppLifecycle(
  api: Pick<MiniGameApi, 'onShow' | 'offShow' | 'onHide' | 'offHide'>,
  opts: BindLifecycleOptions
): Unsubscribe {
  const onHide = (): void => {
    opts.onBackground();
  };
  const onShow = (): void => {
    opts.onForeground();
  };
  api.onHide(onHide);
  api.onShow(onShow);
  return () => {
    api.offHide(onHide);
    api.offShow(onShow);
  };
}
