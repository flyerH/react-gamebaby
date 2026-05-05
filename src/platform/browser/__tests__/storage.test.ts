import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalStorage } from '../storage';

describe('createLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('set / get 往返 + JSON 序列化', () => {
    const s = createLocalStorage('test:');
    s.set('hi', { score: 42, name: 'A' });
    expect(s.get<{ score: number; name: string }>('hi')).toEqual({ score: 42, name: 'A' });
    // 实际底层 key 带 prefix
    expect(localStorage.getItem('test:hi')).toBe(JSON.stringify({ score: 42, name: 'A' }));
  });

  it('未命中返回 null', () => {
    const s = createLocalStorage('test:');
    expect(s.get<number>('nope')).toBeNull();
  });

  it('底层值不是合法 JSON 时当作未命中', () => {
    localStorage.setItem('test:bad', '{not json');
    const s = createLocalStorage('test:');
    expect(s.get<number>('bad')).toBeNull();
  });

  it('remove 清除条目', () => {
    const s = createLocalStorage('test:');
    s.set('k', 1);
    s.remove('k');
    expect(s.get<number>('k')).toBeNull();
  });

  it('clear 只清带 prefix 的条目，不影响外部键', () => {
    localStorage.setItem('other', 'X');
    const s = createLocalStorage('test:');
    s.set('a', 1);
    s.set('b', 2);
    s.clear();
    expect(s.get<number>('a')).toBeNull();
    expect(s.get<number>('b')).toBeNull();
    expect(localStorage.getItem('other')).toBe('X');
  });

  describe('受限存储下静默降级（Safari ITP / 严格 iframe / 配额耗尽）', () => {
    it('getItem 抛错时 get 返回 null', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const s = createLocalStorage('test:');
      expect(s.get<number>('any')).toBeNull();
    });

    it('removeItem 抛错时 remove 不抛', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const s = createLocalStorage('test:');
      expect(() => s.remove('any')).not.toThrow();
    });

    it('clear 内部访问 length / key / removeItem 抛错时不传播', () => {
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const s = createLocalStorage('test:');
      expect(() => s.clear()).not.toThrow();
    });
  });
});
