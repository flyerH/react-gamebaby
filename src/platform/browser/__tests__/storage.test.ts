import { beforeEach, describe, expect, it } from 'vitest';

import { createLocalStorage } from '../storage';

describe('createLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
