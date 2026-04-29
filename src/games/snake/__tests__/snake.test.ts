import { describe, it, expect } from 'vitest';

import { createHeadlessContext } from '@/platform/headless';
import { toGameEnv, type GameEnv } from '@/sdk';

import { init, onButton, step } from '../logic';
import type { SnakeState } from '../state';

function makeEnv(width = 10, height = 20, seed = 42): GameEnv {
  return toGameEnv(createHeadlessContext({ seed, width, height }));
}

describe('snake · init', () => {
  it('初始蛇长 3，朝右，score = 0，overFrame = 0，食物不压蛇身', () => {
    const env = makeEnv();
    const s = init(env);
    expect(s.body).toHaveLength(3);
    expect(s.dir).toBe('right');
    expect(s.pendingDir).toBe('right');
    expect(s.over).toBe(false);
    expect(s.overFrame).toBe(0);
    expect(s.score).toBe(0);
    for (const seg of s.body) {
      expect(seg).not.toEqual(s.food);
    }
  });

  it('Counter.score 被清零，作为 SidePanel 显示的副作用', () => {
    const env = makeEnv();
    env.score.set(999);
    init(env);
    expect(env.score.value).toBe(0);
  });
});

describe('snake · step（移动、吃食物、碰撞）', () => {
  it('无事件时头部沿 dir 推进 1 格，尾部去掉末节', () => {
    const env = makeEnv();
    const s0: SnakeState = {
      body: [
        [4, 10],
        [3, 10],
        [2, 10],
      ],
      dir: 'right',
      pendingDir: 'right',
      food: [9, 0],
      over: false,
      overFrame: 0,
      score: 0,
    };
    const s1 = step(env, s0);
    expect(s1.body[0]).toEqual([5, 10]);
    expect(s1.body).toHaveLength(3);
    expect(s1.body[s1.body.length - 1]).toEqual([3, 10]);
    expect(s1.over).toBe(false);
  });

  it('吃到食物长度 +1，score +1，食物重新随机', () => {
    const env = makeEnv();
    const s0: SnakeState = {
      body: [
        [4, 10],
        [3, 10],
        [2, 10],
      ],
      dir: 'right',
      pendingDir: 'right',
      food: [5, 10],
      over: false,
      overFrame: 0,
      score: 0,
    };
    const s1 = step(env, s0);
    expect(s1.body[0]).toEqual([5, 10]);
    expect(s1.body).toHaveLength(4);
    expect(s1.score).toBe(1);
    expect(env.score.value).toBe(1);
    expect(s1.food).not.toEqual([5, 10]);
  });

  it('撞墙 → over，overFrame 清零', () => {
    const env = makeEnv(5, 5);
    const s0: SnakeState = {
      body: [[4, 2]],
      dir: 'right',
      pendingDir: 'right',
      food: [0, 0],
      over: false,
      overFrame: 0,
      score: 0,
    };
    const s1 = step(env, s0);
    expect(s1.over).toBe(true);
    expect(s1.overFrame).toBe(0);
  });

  it('撞自身 → over', () => {
    const env = makeEnv();
    // 构造 U 形蛇，head 下移会踩到紧邻的 body[1]（不是被砍掉的尾巴）
    const s0: SnakeState = {
      body: [
        [5, 10],
        [5, 11],
        [4, 11],
        [4, 10],
      ],
      dir: 'down',
      pendingDir: 'down',
      food: [0, 0],
      over: false,
      overFrame: 0,
      score: 0,
    };
    expect(step(env, s0).over).toBe(true);
  });

  it('head 恰好踩到"本 tick 会被砍掉的尾巴格"不算自撞', () => {
    const env = makeEnv();
    const s0: SnakeState = {
      body: [
        [5, 10],
        [5, 11],
        [6, 11],
        [6, 10],
      ],
      dir: 'up',
      pendingDir: 'right',
      food: [0, 0],
      over: false,
      overFrame: 0,
      score: 0,
    };
    const s1 = step(env, s0);
    expect(s1.over).toBe(false);
    expect(s1.body[0]).toEqual([6, 10]);
  });

  it('over 态下 step 只推进 overFrame，其余不变', () => {
    const env = makeEnv();
    const s0: SnakeState = {
      body: [[0, 0]],
      dir: 'right',
      pendingDir: 'right',
      food: [5, 5],
      over: true,
      overFrame: 7,
      score: 3,
    };
    const s1 = step(env, s0);
    // App 的 useEffect(state) 需要新引用才会重渲染，这里必须不等于原引用
    expect(s1).not.toBe(s0);
    expect(s1.overFrame).toBe(8);
    expect(s1.body).toBe(s0.body);
    expect(s1.score).toBe(3);
    expect(s1.over).toBe(true);
  });
});

describe('snake · onButton', () => {
  const base: SnakeState = {
    body: [
      [5, 10],
      [4, 10],
    ],
    dir: 'right',
    pendingDir: 'right',
    food: [0, 0],
    over: false,
    overFrame: 0,
    score: 0,
  };

  it('方向键 press 更新 pendingDir', () => {
    const env = makeEnv();
    expect(onButton(env, base, 'Up', 'press').pendingDir).toBe('up');
    expect(onButton(env, base, 'Down', 'press').pendingDir).toBe('down');
  });

  it('反向按键被拒绝（防止一 tick 内反向撞自己）', () => {
    const env = makeEnv();
    expect(onButton(env, base, 'Left', 'press')).toBe(base);
  });

  it('release 与非方向键 无副作用', () => {
    const env = makeEnv();
    expect(onButton(env, base, 'Up', 'release')).toBe(base);
    expect(onButton(env, base, 'A', 'press')).toBe(base);
  });

  it('over 态下按键不生效', () => {
    const env = makeEnv();
    const dead: SnakeState = { ...base, over: true };
    expect(onButton(env, dead, 'Up', 'press')).toBe(dead);
  });
});
