import { describe, it, expect } from 'vitest';
import { createMemoryStorage } from '../storage';

describe('createMemoryStorage', () => {
  it('未设置的键读取返回 null', () => {
    const s = createMemoryStorage();
    expect(s.get('nope')).toBeNull();
  });

  it('set / get 能保留原值（含复杂对象）', () => {
    const s = createMemoryStorage();
    s.set('score', 9999);
    s.set('profile', { name: 'brick', level: 3 });
    expect(s.get<number>('score')).toBe(9999);
    expect(s.get<{ name: string; level: number }>('profile')).toEqual({
      name: 'brick',
      level: 3,
    });
  });

  it('remove 之后该键读取为 null，其他键保留', () => {
    const s = createMemoryStorage();
    s.set('a', 1);
    s.set('b', 2);
    s.remove('a');
    expect(s.get('a')).toBeNull();
    expect(s.get<number>('b')).toBe(2);
  });

  it('clear 清空所有键', () => {
    const s = createMemoryStorage();
    s.set('a', 1);
    s.set('b', 2);
    s.clear();
    expect(s.get('a')).toBeNull();
    expect(s.get('b')).toBeNull();
  });

  it('两个独立实例互不影响', () => {
    const s1 = createMemoryStorage();
    const s2 = createMemoryStorage();
    s1.set('k', 'v1');
    s2.set('k', 'v2');
    expect(s1.get('k')).toBe('v1');
    expect(s2.get('k')).toBe('v2');
  });
});
