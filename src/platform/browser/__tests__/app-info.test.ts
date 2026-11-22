import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn<() => boolean>();
const getInfo = vi.fn<() => Promise<{ id: string }>>();

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));
vi.mock('@capacitor/app', () => ({ App: { getInfo } }));

const { isDevBuild } = await import('../app-info');

describe('isDevBuild', () => {
  beforeEach(() => {
    isNativePlatform.mockReset();
    getInfo.mockReset();
  });

  it('网页版直接返回 false，不读原生包信息', async () => {
    isNativePlatform.mockReturnValue(false);
    await expect(isDevBuild()).resolves.toBe(false);
    expect(getInfo).not.toHaveBeenCalled();
  });

  it('包名带 .dev 后缀时返回 true', async () => {
    isNativePlatform.mockReturnValue(true);
    getInfo.mockResolvedValue({ id: 'com.flyerh.gamebaby.dev' });
    await expect(isDevBuild()).resolves.toBe(true);
  });

  it('正式包名返回 false', async () => {
    isNativePlatform.mockReturnValue(true);
    getInfo.mockResolvedValue({ id: 'com.flyerh.gamebaby' });
    await expect(isDevBuild()).resolves.toBe(false);
  });

  it('读取包信息失败时视为非开发版', async () => {
    isNativePlatform.mockReturnValue(true);
    getInfo.mockRejectedValue(new Error('plugin unavailable'));
    await expect(isDevBuild()).resolves.toBe(false);
  });
});
