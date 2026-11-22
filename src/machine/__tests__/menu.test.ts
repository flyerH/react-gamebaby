import { describe, it, expect } from 'vitest';

import { createRegistry, type Game } from '@/sdk';

import {
  currentGame,
  incLevel,
  incSpeed,
  initialMenuState,
  MENU_LEVEL_MAX,
  MENU_SPEED_MAX,
  selectNext,
  selectPrev,
} from '../menu';

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

  it('初始 speed / level 均为 1', () => {
    const s = initialMenuState();
    expect(s.speed).toBe(1);
    expect(s.level).toBe(1);
  });

  it('incSpeed 单击递增；达到 MAX 后循环回 1', () => {
    let s = initialMenuState();
    for (let i = 1; i <= MENU_SPEED_MAX - 1; i++) {
      s = incSpeed(s);
      expect(s.speed).toBe(i + 1);
    }
    s = incSpeed(s); // 第 MAX 次：从 MAX 回到 1
    expect(s.speed).toBe(1);
    // level 不应被 incSpeed 改动
    expect(s.level).toBe(1);
  });

  it('incLevel 单击递增；达到 MAX 后循环回 1', () => {
    let s = initialMenuState();
    for (let i = 1; i <= MENU_LEVEL_MAX - 1; i++) {
      s = incLevel(s);
      expect(s.level).toBe(i + 1);
    }
    s = incLevel(s);
    expect(s.level).toBe(1);
    expect(s.speed).toBe(1);
  });

  it('selectNext / selectPrev 不改 speed / level', () => {
    const reg = createRegistry([mk('a'), mk('b')]);
    const s0 = incSpeed(incLevel(initialMenuState())); // speed=2 level=2
    const s1 = selectNext(reg, s0);
    expect(s1.speed).toBe(2);
    expect(s1.level).toBe(2);
    expect(selectPrev(reg, s1).speed).toBe(2);
  });
});
