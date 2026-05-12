import { describe, expect, it } from 'vitest';

import { createHeadlessContext } from '@/platform/headless';
import { type GameEnv, toGameEnv } from '@/sdk';

import { init, isAnimating, isGameOver, onButton, render, step } from '../logic';
import {
  type ActivePiece,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  isValidPosition,
  pieceCells,
  TETROMINOES,
  type TetrisState,
} from '../state';

function makeEnv(seed = 42): GameEnv {
  return toGameEnv(createHeadlessContext({ seed, width: FIELD_WIDTH, height: FIELD_HEIGHT }));
}

/** 用空 grid 起手 state，便于测特定形态 */
function emptyState(partial: Partial<TetrisState> = {}): TetrisState {
  return {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    grid: new Array<number>(FIELD_WIDTH * FIELD_HEIGHT).fill(0),
    active: { kind: 'T', rotation: 0, x: 3, y: 0 },
    next: 'I',
    awaitingFirstMove: false,
    over: false,
    overFrame: 0,
    clearingLines: [],
    clearFrame: 0,
    score: 0,
    lines: 0,
    lastOpts: null,
    ...partial,
  };
}

/**
 * 用 ASCII 画面构造 grid，省去手算一维下标的痛苦。
 *
 *   gridFromAscii(`
 *     ..........
 *     ..........
 *     XXX.XXXXXX
 *     XXXXXXXXXX
 *   `)
 *
 * - 'X' / '#' = 砖 (1)，'.' / ' ' = 空 (0)
 * - 行数 < FIELD_HEIGHT 时上方自动补空行
 * - 每行宽度必须 === FIELD_WIDTH
 */
function gridFromAscii(ascii: string): number[] {
  const rows = ascii
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const padded = [
    ...Array.from<string>({ length: FIELD_HEIGHT - rows.length }).fill('.'.repeat(FIELD_WIDTH)),
    ...rows,
  ];
  return padded.flatMap((row) => [...row].map((ch) => (ch === 'X' || ch === '#' ? 1 : 0)));
}

/** 推进若干 tick；用于跨越消行闪烁等多帧动画 */
function advanceTicks(env: ReturnType<typeof makeEnv>, s: TetrisState, n: number): TetrisState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(env, cur);
  return cur;
}

describe('tetris · state helpers', () => {
  it('每种方块的 4 个旋转相位都恰好 4 格', () => {
    for (const kind of Object.keys(TETROMINOES) as (keyof typeof TETROMINOES)[]) {
      for (const rot of TETROMINOES[kind]) {
        expect(rot).toHaveLength(4);
      }
    }
  });

  it('isValidPosition 越界 / 撞已锁砖块 返回 false', () => {
    const grid = new Array<number>(FIELD_WIDTH * FIELD_HEIGHT).fill(0);
    // 撞底
    expect(
      isValidPosition(grid, FIELD_WIDTH, FIELD_HEIGHT, {
        kind: 'I',
        rotation: 0,
        x: 0,
        y: FIELD_HEIGHT - 1,
      })
    ).toBe(false);
    // 撞右墙
    expect(
      isValidPosition(grid, FIELD_WIDTH, FIELD_HEIGHT, {
        kind: 'O',
        rotation: 0,
        x: FIELD_WIDTH - 1,
        y: 0,
      })
    ).toBe(false);
    // 撞已锁砖块
    const grid2 = grid.slice();
    grid2[5 * FIELD_WIDTH + 4] = 1;
    expect(
      isValidPosition(grid2, FIELD_WIDTH, FIELD_HEIGHT, {
        kind: 'O',
        rotation: 0,
        x: 4,
        y: 4,
      })
    ).toBe(false);
  });

  it('pieceCells 给出锚点 + rotation 的绝对坐标', () => {
    const piece: ActivePiece = { kind: 'I', rotation: 0, x: 2, y: 5 };
    const cells = pieceCells(piece);
    // I 0 形：[0,1][1,1][2,1][3,1]，+ 锚点 (2,5)
    expect(cells).toEqual([
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
    ]);
  });
});

describe('tetris · init', () => {
  it('初始：grid 全 0，active 与 next 已生成，awaitingFirstMove=true，score=0', () => {
    const env = makeEnv();
    const s = init(env);
    expect(s.grid).toHaveLength(FIELD_WIDTH * FIELD_HEIGHT);
    expect(s.grid.every((c) => c === 0)).toBe(true);
    expect(s.active).not.toBeNull();
    expect(s.next).toBeTruthy();
    expect(s.awaitingFirstMove).toBe(true);
    expect(s.over).toBe(false);
    expect(s.score).toBe(0);
    expect(s.lines).toBe(0);
    expect(env.score.value).toBe(0);
  });

  it('init 接收 opts 透传到 lastOpts', () => {
    const env = makeEnv();
    const s = init(env, { speed: 7, level: 3 });
    expect(s.lastOpts).toEqual({ speed: 7, level: 3 });
  });

  it('init 不传 opts 时 lastOpts=null', () => {
    const env = makeEnv();
    const s = init(env);
    expect(s.lastOpts).toBeNull();
  });
});

describe('tetris · step', () => {
  it('awaitingFirstMove=true 时 step 不让方块下落', () => {
    const env = makeEnv();
    const s0 = emptyState({ awaitingFirstMove: true });
    expect(step(env, s0)).toBe(s0);
  });

  it('正常下落：active.y +1', () => {
    const env = makeEnv();
    const s0 = emptyState({ active: { kind: 'T', rotation: 0, x: 3, y: 5 } });
    const s1 = step(env, s0);
    expect(s1.active?.y).toBe(6);
  });

  it('落到底无法再下：锁定 + spawn 新方块（active 换种类）', () => {
    const env = makeEnv();
    // T 方块靠底（rotation=0 高度 2 行）；y=18 时 cells 落在 y=18,19，再下走到 y=19,20 越界
    const s0 = emptyState({
      active: { kind: 'T', rotation: 0, x: 3, y: 18 },
      next: 'O',
    });
    const s1 = step(env, s0);
    // 原 T 已锁进 grid（4 个格点）
    const onCount = s1.grid.filter((c) => c === 1).length;
    expect(onCount).toBe(4);
    // 新 active 是之前的 next (O)
    expect(s1.active?.kind).toBe('O');
  });

  it('单消得 1 分 → 进入闪烁阶段（score 立即更新，grid 暂留）', () => {
    const env = makeEnv();
    // T rotation=0 锁在 y=18,19 → 补齐底行 x=3,4,5
    const grid = gridFromAscii(`
      XXX...XXXX
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'T', rotation: 0, x: 3, y: 18 },
    });
    const s1 = step(env, s0);
    expect(s1.score).toBe(1);
    expect(s1.lines).toBe(1);
    expect(env.score.value).toBe(1);
    expect(s1.clearingLines).toEqual([FIELD_HEIGHT - 1]);
    expect(s1.active).toBeNull();
    expect(s1.grid[(FIELD_HEIGHT - 1) * FIELD_WIDTH + 3]).toBe(1);
  });

  it('消行闪烁播完后真正消除并 spawn 下一块', () => {
    const env = makeEnv();
    const grid = gridFromAscii(`
      XXX...XXXX
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'T', rotation: 0, x: 3, y: 18 },
      next: 'O',
    });
    const sFinal = advanceTicks(env, s0, 1 + 15 + 1);
    expect(sFinal.clearingLines).toEqual([]);
    expect(sFinal.active?.kind).toBe('O');
    // T 锁在 y=18 的那行经消行后下移到 y=19（底行被消掉腾出空间）
    expect(sFinal.grid[(FIELD_HEIGHT - 1) * FIELD_WIDTH + 4]).toBe(1);
  });

  it('双消得 3 分', () => {
    const env = makeEnv();
    // O 方块 (0,18)(1,18)(0,19)(1,19) 补齐两行
    const grid = gridFromAscii(`
      ..XXXXXXXX
      ..XXXXXXXX
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'O', rotation: 0, x: 0, y: 18 },
    });
    const s1 = step(env, s0);
    expect(s1.score).toBe(3);
    expect(s1.lines).toBe(2);
    expect(s1.clearingLines).toEqual([FIELD_HEIGHT - 2, FIELD_HEIGHT - 1]);
  });

  it('三消得 5 分', () => {
    const env = makeEnv();
    // I rotation=1 竖着占 (2,0~3)；把底部 3 行 x=2 留空，I 落下补齐
    const grid = gridFromAscii(`
      XX.XXXXXXX
      XX.XXXXXXX
      XX.XXXXXXX
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'I', rotation: 1, x: 0, y: 16 },
    });
    const s1 = step(env, s0);
    expect(s1.score).toBe(5);
    expect(s1.lines).toBe(3);
    expect(s1.clearingLines).toHaveLength(3);
  });

  it('Tetris（四消）得 8 分', () => {
    const env = makeEnv();
    // I rotation=1 竖着占 x=2, y=16~19；底部 4 行 x=2 留空
    const grid = gridFromAscii(`
      XX.XXXXXXX
      XX.XXXXXXX
      XX.XXXXXXX
      XX.XXXXXXX
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'I', rotation: 1, x: 0, y: 16 },
    });
    const s1 = step(env, s0);
    expect(s1.score).toBe(8);
    expect(s1.lines).toBe(4);
    expect(s1.clearingLines).toHaveLength(4);
  });

  it('消行后上方砖块正确下落填补空位', () => {
    const env = makeEnv();
    // y=18 孤砖 x=0；y=19 缺 x=8,9。O(8,18) 补齐底行触发消行
    const grid = gridFromAscii(`
      X.........
      XXXXXXXX..
    `);
    const s0 = emptyState({
      grid,
      active: { kind: 'O', rotation: 0, x: 8, y: 18 },
      next: 'T',
    });
    // 1 tick 锁定 + 进闪烁，15 tick 闪烁，1 tick 真正消除 = 17
    const sFinal = advanceTicks(env, s0, 1 + 15 + 1);
    // 底行被消后，原 y=18 的孤砖 (0,18) 下移到 (0,19)
    expect(sFinal.grid[(FIELD_HEIGHT - 1) * FIELD_WIDTH + 0]).toBe(1);
    expect(sFinal.clearingLines).toEqual([]);
  });

  it('spawn 即非法 → over=true，overFrame=0', () => {
    const env = makeEnv();
    // 顶行非满但堵住 spawn 落点：I (rotation=0) 出生 cells (3,0)(4,0)(5,0)(6,0)。
    // 把 (3,0)(4,0)(5,0)(6,0) 单独堵上，避免顶行被锁定后消空
    const grid = new Array<number>(FIELD_WIDTH * FIELD_HEIGHT).fill(0);
    for (const x of [3, 4, 5, 6]) grid[0 * FIELD_WIDTH + x] = 1;
    // 当前 active 落到底锁定 + 触发 spawn next=I，I 出生撞 (3..6, 0) → over
    const s0 = emptyState({
      grid,
      active: { kind: 'O', rotation: 0, x: 4, y: 18 }, // 已经在底，下一 step 锁定
      next: 'I',
    });
    const s1 = step(env, s0);
    expect(s1.over).toBe(true);
    expect(s1.overFrame).toBe(0);
    expect(s1.active).toBeNull();
  });

  it('over 态推进 overFrame；动画播完后 step 调 init 重开（保留 lastOpts）', () => {
    const env = makeEnv();
    const s0 = emptyState({
      over: true,
      overFrame: 0,
      lastOpts: { speed: 5, level: 2 },
    });
    const s1 = step(env, s0);
    expect(s1.overFrame).toBe(1);
    // 推到最后一帧再 + 1 应该重开
    const sFinal = emptyState({
      over: true,
      overFrame: FIELD_HEIGHT * 2,
      lastOpts: { speed: 5, level: 2 },
    });
    const reborn = step(env, sFinal);
    expect(reborn.over).toBe(false);
    expect(reborn.awaitingFirstMove).toBe(true);
    expect(reborn.lastOpts).toEqual({ speed: 5, level: 2 });
  });
});

describe('tetris · onButton', () => {
  it('awaitingFirstMove=true：任意 press 解除等待，不改 active', () => {
    const env = makeEnv();
    const idle = emptyState({ awaitingFirstMove: true });
    const s = onButton(env, idle, 'A', 'press');
    expect(s.awaitingFirstMove).toBe(false);
    expect(s.active).toBe(idle.active);
  });

  it('Left/Right 横移 active', () => {
    const env = makeEnv();
    const s0 = emptyState({ active: { kind: 'T', rotation: 0, x: 3, y: 5 } });
    expect(onButton(env, s0, 'Right', 'press').active?.x).toBe(4);
    expect(onButton(env, s0, 'Left', 'press').active?.x).toBe(2);
  });

  it('A 键旋转 active；rotation 顺时针 +1', () => {
    const env = makeEnv();
    const s0 = emptyState({ active: { kind: 'T', rotation: 0, x: 3, y: 5 } });
    const s1 = onButton(env, s0, 'A', 'press');
    expect(s1.active?.rotation).toBe(1);
  });

  it('Up 键也旋转 active（与 A 同语义）', () => {
    const env = makeEnv();
    const s0 = emptyState({ active: { kind: 'T', rotation: 0, x: 3, y: 5 } });
    const s1 = onButton(env, s0, 'Up', 'press');
    expect(s1.active?.rotation).toBe(1);
  });

  it('Up / A 旋转仅响应 press；repeat 不持续旋转', () => {
    const env = makeEnv();
    const s0 = emptyState({ active: { kind: 'T', rotation: 0, x: 3, y: 5 } });
    expect(onButton(env, s0, 'Up', 'repeat')).toBe(s0);
    expect(onButton(env, s0, 'A', 'repeat')).toBe(s0);
  });

  it('over 态 onButton 无效', () => {
    const env = makeEnv();
    const s0 = emptyState({ over: true });
    expect(onButton(env, s0, 'A', 'press')).toBe(s0);
    expect(onButton(env, s0, 'Left', 'press')).toBe(s0);
  });

  it('release 无副作用', () => {
    const env = makeEnv();
    const s0 = emptyState();
    expect(onButton(env, s0, 'Right', 'release')).toBe(s0);
  });
});

describe('tetris · render', () => {
  it('未结束：grid 砖块 + active 方块都画到屏上', () => {
    const env = makeEnv();
    const grid = new Array<number>(FIELD_WIDTH * FIELD_HEIGHT).fill(0);
    grid[5 * FIELD_WIDTH + 2] = 1;
    const s = emptyState({
      grid,
      active: { kind: 'O', rotation: 0, x: 4, y: 7 },
    });
    render(env, s);
    expect(env.screen.getPixel(2, 5)).toBe(true);
    // O 块 (4,7)(5,7)(4,8)(5,8)
    expect(env.screen.getPixel(4, 7)).toBe(true);
    expect(env.screen.getPixel(5, 8)).toBe(true);
  });

  it('over + 填屏阶段 1 帧：底部 1 行全亮', () => {
    const env = makeEnv();
    const s = emptyState({ over: true, overFrame: 0 });
    render(env, s);
    for (let x = 0; x < FIELD_WIDTH; x++) {
      expect(env.screen.getPixel(x, FIELD_HEIGHT - 1)).toBe(true);
    }
    expect(env.screen.getPixel(0, FIELD_HEIGHT - 2)).toBe(false);
  });
});

describe('tetris · isGameOver', () => {
  it('返回 state.over', () => {
    expect(isGameOver(emptyState())).toBe(false);
    expect(isGameOver(emptyState({ over: true }))).toBe(true);
  });
});

describe('tetris · isAnimating', () => {
  it('正常游戏中不是动画态', () => {
    expect(isAnimating(emptyState())).toBe(false);
  });
  it('消行闪烁阶段是动画态（让 App 切到 ANIM_TICK_SPEED）', () => {
    expect(isAnimating(emptyState({ clearingLines: [19] }))).toBe(true);
  });
  it('over 也算动画态', () => {
    expect(isAnimating(emptyState({ over: true }))).toBe(true);
  });
});
