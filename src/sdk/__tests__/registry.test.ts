import { describe, it, expect } from 'vitest';

import { createRegistry } from '../registry';
import type { Game } from '../types';

const mockGame = (id: string, name = id): Game => ({
  id,
  name,
  preview: [
    [0, 0],
    [1, 1],
  ],
});

describe('createRegistry', () => {
  it('list / get / size 与输入一致，且 list 返回冻结数组', () => {
    const a = mockGame('snake');
    const b = mockGame('tetris');
    const reg = createRegistry([a, b]);

    expect(reg.size).toBe(2);
    expect(reg.list()).toEqual([a, b]);
    expect(reg.get('snake')).toBe(a);
    expect(reg.get('tetris')).toBe(b);
    expect(reg.get('unknown')).toBeUndefined();
    expect(Object.isFrozen(reg.list())).toBe(true);
  });

  it('list() 多次调用返回同一引用（便于引用相等判断）', () => {
    const reg = createRegistry([mockGame('a'), mockGame('b')]);
    expect(reg.list()).toBe(reg.list());
  });

  it('重复 id 抛错，避免静默覆盖', () => {
    expect(() => createRegistry([mockGame('x'), mockGame('x')])).toThrow(/x/);
  });

  it('空注册表合法', () => {
    const reg = createRegistry([]);
    expect(reg.size).toBe(0);
    expect(reg.list()).toEqual([]);
    expect(reg.get('any')).toBeUndefined();
  });
});
