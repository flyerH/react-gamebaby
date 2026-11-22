import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn<() => boolean>();

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));

const { setupOfflineCache } = await import('../offline');

describe('setupOfflineCache', () => {
  let unregister: ReturnType<typeof vi.fn>;
  let getRegistrations: ReturnType<typeof vi.fn>;
  let cachesKeys: ReturnType<typeof vi.fn>;
  let cachesDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isNativePlatform.mockReset();
    unregister = vi.fn().mockResolvedValue(true);
    getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    cachesKeys = vi.fn().mockResolvedValue(['workbox-precache-v2']);
    cachesDelete = vi.fn().mockResolvedValue(true);

    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistrations },
    });
    vi.stubGlobal('caches', {
      keys: cachesKeys,
      delete: cachesDelete,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('本地模式注销已有 Service Worker 并清空缓存，不调用 register', async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubGlobal('location', { hostname: 'localhost' });
    const register = vi.fn();

    setupOfflineCache({ register });

    expect(register).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
      expect(unregister).toHaveBeenCalled();
      expect(cachesKeys).toHaveBeenCalled();
      expect(cachesDelete).toHaveBeenCalledWith('workbox-precache-v2');
    });
  });

  it('网页版调用 register，不清理缓存', () => {
    isNativePlatform.mockReturnValue(false);
    vi.stubGlobal('location', { hostname: 'example.com' });
    const register = vi.fn();

    setupOfflineCache({ register });

    expect(register).toHaveBeenCalledTimes(1);
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(cachesKeys).not.toHaveBeenCalled();
  });

  it('线上域名模式（原生壳加载远程域名）调用 register', () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubGlobal('location', { hostname: 'gamebaby.strawtc.cn' });
    const register = vi.fn();

    setupOfflineCache({ register });

    expect(register).toHaveBeenCalledTimes(1);
    expect(getRegistrations).not.toHaveBeenCalled();
  });
});
