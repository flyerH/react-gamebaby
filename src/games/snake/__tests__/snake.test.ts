import { describe, it, expect } from 'vitest';

import { createHeadlessContext } from '@/platform/headless';
import { toGameEnv, type GameEnv } from '@/sdk';

import { init, onButton, render, step } from '../logic';
import type { SnakeState } from '../state';

function makeEnv(width = 10, height = 20, seed = 42): GameEnv {
  return toGameEnv(createHeadlessContext({ seed, width, height }));
}

/** 让用例字面量保持简洁：所有未指定的字段用安全默认 */
function makeState(partial: Partial<SnakeState>): SnakeState {
  return {
    body: [[0, 0]],
    dir: 'right',
    pendingDir: 'right',
    food: [9, 0],
    over: false,
    won: false,
    overFrame: 0,
    crashCenter: [0, 0],
    crashSnapshot: [],
    score: 0,
    ...partial,
  };
}

describe('snake · init', () => {
  it('初始蛇长 3，朝右，score = 0，overFrame = 0，crashSnapshot 空，食物不压蛇身', () => {
    const env = makeEnv();
    const s = init(env);
    expect(s.body).toHaveLength(3);
    expect(s.dir).toBe('right');
    expect(s.pendingDir).toBe('right');
    expect(s.over).toBe(false);
    expect(s.overFrame).toBe(0);
    expect(s.crashSnapshot).toEqual([]);
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
    const s0 = makeState({
      body: [
        [4, 10],
        [3, 10],
        [2, 10],
      ],
    });
    const s1 = step(env, s0);
    expect(s1.body[0]).toEqual([5, 10]);
    expect(s1.body).toHaveLength(3);
    expect(s1.body[s1.body.length - 1]).toEqual([3, 10]);
    expect(s1.over).toBe(false);
  });

  it('吃到食物长度 +1，score +1，食物重新随机', () => {
    const env = makeEnv();
    const s0 = makeState({
      body: [
        [4, 10],
        [3, 10],
        [2, 10],
      ],
      food: [5, 10],
    });
    const s1 = step(env, s0);
    expect(s1.body[0]).toEqual([5, 10]);
    expect(s1.body).toHaveLength(4);
    expect(s1.score).toBe(1);
    expect(env.score.value).toBe(1);
    expect(s1.food).not.toEqual([5, 10]);
  });

  it('撞墙 → over，overFrame=0，crashCenter=旧头位置，crashSnapshot 含 body+food', () => {
    const env = makeEnv();
    const s0 = makeState({
      body: [[7, 10]],
      pendingDir: 'right',
      food: [3, 5],
    });
    // head=[7,10] 朝右走，新头 [8,10] 还在屏内，需要再多两格才出屏；
    // 改让头在 x=9，下一步出屏
    const s1 = step(env, makeState({ body: [[9, 10]], pendingDir: 'right', food: [3, 5] }));
    expect(s1.over).toBe(true);
    expect(s1.overFrame).toBe(0);
    // x=9 被 clamp 到 7（W-3=10-3=7），y=10 不变
    expect(s1.crashCenter).toEqual([7, 10]);
    expect(s1.crashSnapshot).toEqual([
      [9, 10],
      [3, 5],
    ]);
    // 不读 s0 的字段不会触发 unused 警告，这里仅占位避免误删
    expect(s0.over).toBe(false);
  });

  it('撞自身 → over，crashCenter=新头位置（受 clamp 影响），snapshot 含新 body', () => {
    const env = makeEnv();
    // U 形：head=[5,10] 朝下走会踩到 [5,11]
    const s0 = makeState({
      body: [
        [5, 10],
        [5, 11],
        [4, 11],
        [4, 10],
      ],
      dir: 'down',
      pendingDir: 'down',
    });
    const s1 = step(env, s0);
    expect(s1.over).toBe(true);
    expect(s1.crashCenter).toEqual([5, 11]);
    // 新 body 中第一个就是新头 [5,11]
    expect(s1.crashSnapshot[0]).toEqual([5, 11]);
  });

  it('撞墙的 crashCenter 在 4 个角都被 clamp 到 5×5 完整在屏内', () => {
    const env = makeEnv(10, 20);
    // 撞左墙：head=[0,5] 朝左
    const left = step(
      env,
      makeState({ body: [[0, 5]], dir: 'left', pendingDir: 'left' })
    ).crashCenter;
    expect(left).toEqual([2, 5]);
    // 撞右墙：head=[9,5] 朝右
    const right = step(
      env,
      makeState({ body: [[9, 5]], dir: 'right', pendingDir: 'right' })
    ).crashCenter;
    expect(right).toEqual([7, 5]);
    // 撞上墙：head=[4,0] 朝上
    const up = step(env, makeState({ body: [[4, 0]], dir: 'up', pendingDir: 'up' })).crashCenter;
    expect(up).toEqual([4, 2]);
    // 撞下墙：head=[4,19] 朝下
    const down = step(
      env,
      makeState({ body: [[4, 19]], dir: 'down', pendingDir: 'down' })
    ).crashCenter;
    expect(down).toEqual([4, 17]);
  });

  it('head 恰好踩到"本 tick 会被砍掉的尾巴格"不算自撞', () => {
    const env = makeEnv();
    const s0 = makeState({
      body: [
        [5, 10],
        [5, 11],
        [6, 11],
        [6, 10],
      ],
      dir: 'up',
      pendingDir: 'right',
    });
    const s1 = step(env, s0);
    expect(s1.over).toBe(false);
    expect(s1.body[0]).toEqual([6, 10]);
  });

  it('蛇身吃满全屏 → over=true & won=true，food=null，crashSnapshot 不含 food', () => {
    // 极小 2×2 屏幕（4 格）：body 长度=3 时朝最后一格走，吃完后 newBody 占满 4 格
    const env = makeEnv(2, 2);
    const s0 = makeState({
      body: [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      dir: 'right',
      pendingDir: 'right',
      food: [1, 0],
    });
    const s1 = step(env, s0);
    expect(s1.over).toBe(true);
    expect(s1.won).toBe(true);
    expect(s1.food).toBeNull();
    expect(s1.body).toHaveLength(4);
    expect(s1.score).toBe(1);
    // snapshot 中不应再含食物坐标
    expect(s1.crashSnapshot.some(([x, y]) => x === 1 && y === 0)).toBe(true); // 它是新头/body
    // 而不应是"额外的 food 点"
    expect(s1.crashSnapshot).toHaveLength(s1.body.length);
  });

  it('over 态下 step 推进 overFrame；动画播完后保持不变（同引用）', () => {
    const env = makeEnv();
    const s0 = makeState({
      body: [[0, 0]],
      food: [5, 5],
      over: true,
      overFrame: 7,
      crashCenter: [3, 3],
      crashSnapshot: [
        [0, 0],
        [5, 5],
      ],
      score: 3,
    });
    const s1 = step(env, s0);
    // 仍在动画中：新引用 + overFrame +1，其余字段引用相同
    expect(s1).not.toBe(s0);
    expect(s1.overFrame).toBe(8);
    expect(s1.body).toBe(s0.body);
    expect(s1.crashCenter).toBe(s0.crashCenter);
    expect(s1.crashSnapshot).toBe(s0.crashSnapshot);
    expect(s1.score).toBe(3);

    // 推到 50 帧后保持原引用（动画已播完）
    const sFinal = makeState({
      ...s0,
      overFrame: 50,
    });
    expect(step(env, sFinal)).toBe(sFinal);
  });
});

describe('snake · render（死亡动画）', () => {
  it('未结束：只画 body 与 food', () => {
    const env = makeEnv();
    const s = makeState({
      body: [
        [3, 5],
        [2, 5],
      ],
      food: [7, 8],
    });
    render(env, s);
    expect(env.screen.getPixel(3, 5)).toBe(true);
    expect(env.screen.getPixel(2, 5)).toBe(true);
    expect(env.screen.getPixel(7, 8)).toBe(true);
    // 没画的位置应为暗
    expect(env.screen.getPixel(0, 0)).toBe(false);
  });

  it('爆炸阶段 frame=0：5×5 中心点亮 1 像素 + snapshot 中非 5×5 区域保留', () => {
    const env = makeEnv();
    const s = makeState({
      over: true,
      overFrame: 0,
      crashCenter: [5, 5],
      crashSnapshot: [
        [5, 5],
        [9, 9],
      ],
    });
    render(env, s);
    // 中心点亮（来自 STATES[0]）
    expect(env.screen.getPixel(5, 5)).toBe(true);
    // 5×5 内的 snapshot 点不绘制（被爆炸图案覆盖）；STATES[0] 只点中心，所以 (5,5) 仍亮
    // 5×5 外的 snapshot 点保留
    expect(env.screen.getPixel(9, 9)).toBe(true);
    // 5×5 区域边缘外的 snapshot 应保留；这里 (8,8) 在 5×5 外
    expect(env.screen.getPixel(8, 8)).toBe(false);
  });

  it('填屏阶段 frame=30：底部 1 行全亮；frame=49：满屏全亮', () => {
    const env = makeEnv();
    const s30 = makeState({
      over: true,
      overFrame: 30,
      crashCenter: [5, 5],
      crashSnapshot: [],
    });
    render(env, s30);
    for (let x = 0; x < 10; x++) expect(env.screen.getPixel(x, 19)).toBe(true);
    expect(env.screen.getPixel(0, 18)).toBe(false);

    const s49 = makeState({
      over: true,
      overFrame: 49,
      crashCenter: [5, 5],
      crashSnapshot: [],
    });
    render(env, s49);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) expect(env.screen.getPixel(x, y)).toBe(true);
    }
  });
});

describe('snake · onButton', () => {
  const base = makeState({
    body: [
      [5, 10],
      [4, 10],
    ],
  });

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
    const dead = makeState({ ...base, over: true });
    expect(onButton(env, dead, 'Up', 'press')).toBe(dead);
  });
});
