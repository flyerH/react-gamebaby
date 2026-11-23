import { describe, expect, it } from 'vitest';

import { createWxStorage } from '../storage';

import { createFakeWx } from './fake-wx';

describe('createWxStorage', () => {
  it('读写任意 JSON 值，key 自动加前缀', () => {
    const wx = createFakeWx();
    const storage = createWxStorage(wx);
    storage.set('hi-score:snake', 120);
    storage.set('prefs', { sound: false });

    expect(storage.get('hi-score:snake')).toBe(120);
    expect(storage.get('prefs')).toEqual({ sound: false });
    expect(wx.store.get('gamebaby:hi-score:snake')).toBe('120');
  });

  it('未命中返回 null：wx.getStorageSync 对不存在的 key 返回空串', () => {
    expect(createWxStorage(createFakeWx()).get('missing')).toBeNull();
  });

  it('存储内容不是合法 JSON 字符串时视为未命中', () => {
    const wx = createFakeWx();
    wx.store.set('gamebaby:bad', '{oops');
    wx.store.set('gamebaby:num', 42);
    const storage = createWxStorage(wx);
    expect(storage.get('bad')).toBeNull();
    expect(storage.get('num')).toBeNull();
  });

  it('remove 删除单个 key；clear 只清带前缀的 key', () => {
    const wx = createFakeWx();
    wx.store.set('other', 'keep');
    const storage = createWxStorage(wx);
    storage.set('a', 1);
    storage.set('b', 2);

    storage.remove('a');
    expect(storage.get('a')).toBeNull();

    storage.clear();
    expect(storage.get('b')).toBeNull();
    expect(wx.store.get('other')).toBe('keep');
  });

  it('wx 存储抛错时静默降级', () => {
    const wx = createFakeWx();
    const broken = {
      ...wx,
      getStorageSync: () => {
        throw new Error('fail');
      },
      setStorageSync: () => {
        throw new Error('quota');
      },
      removeStorageSync: () => {
        throw new Error('fail');
      },
      getStorageInfoSync: () => {
        throw new Error('fail');
      },
    };
    const storage = createWxStorage(broken);
    expect(() => {
      storage.set('a', 1);
      storage.remove('a');
      storage.clear();
    }).not.toThrow();
    expect(storage.get('a')).toBeNull();
  });
});
