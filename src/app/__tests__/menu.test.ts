import { describe, it, expect } from 'vitest';

import { createRegistry, type Game } from '@/sdk';

import { currentGame, initialMenuState, selectNext, selectPrev } from '../menu';

const mk = (id: string): Game => ({ id, name: id.toUpperCase(), preview: [] });

describe('menu 状态机', () => {
  it('selectNext 在注册表内循环递增，末尾回到 0', () => {
    const reg = createRegistry([mk('a'), mk('b'), mk('c')]);
    let s = initialMenuState();
    expect(s.selectedIndex).toBe(0);
    s = selectNext(reg, s);
    expect(s.selectedIndex).toBe(1);
    s = selectNext(reg, s);
    expect(s.selectedIndex).toBe(2);
    s = selectNext(reg, s);
    expect(s.selectedIndex).toBe(0);
  });

  it('selectPrev 在注册表内循环递减，起点回到末尾', () => {
    const reg = createRegistry([mk('a'), mk('b'), mk('c')]);
    let s = initialMenuState();
    s = selectPrev(reg, s);
    expect(s.selectedIndex).toBe(2);
    s = selectPrev(reg, s);
    expect(s.selectedIndex).toBe(1);
  });

  it('注册表为空时 state 保持不变', () => {
    const empty = createRegistry([]);
    const s = initialMenuState();
    expect(selectNext(empty, s)).toBe(s);
    expect(selectPrev(empty, s)).toBe(s);
  });

  it('currentGame 返回 selectedIndex 对应游戏', () => {
    const reg = createRegistry([mk('a'), mk('b')]);
    let s = initialMenuState();
    expect(currentGame(reg, s)?.id).toBe('a');
    s = selectNext(reg, s);
    expect(currentGame(reg, s)?.id).toBe('b');
  });

  it('每次调用返回新的 state 引用（不可变）', () => {
    const reg = createRegistry([mk('a'), mk('b')]);
    const s0 = initialMenuState();
    const s1 = selectNext(reg, s0);
    expect(s1).not.toBe(s0);
  });
});
