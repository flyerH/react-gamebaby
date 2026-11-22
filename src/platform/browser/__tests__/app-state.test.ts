import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.reject(new Error('not native'))) },
}));

const { bindAppState } = await import('../app-state');

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('bindAppState', () => {
  afterEach(() => {
    setHidden(false);
  });

  it('挂载时页面已隐藏则立即触发 onBackground', () => {
    setHidden(true);
    const onBackground = vi.fn();
    const onForeground = vi.fn();
    const unbind = bindAppState({ onBackground, onForeground });
    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onForeground).not.toHaveBeenCalled();
    unbind();
  });

  it('挂载时页面可见不触发回调，之后随 visibilitychange 切换', () => {
    setHidden(false);
    const onBackground = vi.fn();
    const onForeground = vi.fn();
    const unbind = bindAppState({ onBackground, onForeground });
    expect(onBackground).not.toHaveBeenCalled();

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onForeground).toHaveBeenCalledTimes(1);
    unbind();
  });

  it('解绑后不再响应 visibilitychange', () => {
    const onBackground = vi.fn();
    const unbind = bindAppState({ onBackground, onForeground: vi.fn() });
    unbind();
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onBackground).not.toHaveBeenCalled();
  });
});
