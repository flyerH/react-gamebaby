import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions } from '@/sdk';

import {
  type ActivePiece,
  isValidPosition,
  type PieceKind,
  pickKind,
  pieceCells,
  type Rotation,
  TETROMINOES,
  type TetrisState,
} from './state';

/**
 * 消行闪烁动画的 tick 数 —— 真机风格"被消除的行先闪几下"。
 *
 * App 检测到 isAnimating=true 时把 ticker 切到 ANIM_TICK_SPEED (30 ticks/s
 * ≈ 33ms/帧)。15 帧 ≈ 500ms，给玩家足够视觉反馈
 */
const CLEAR_BLINK_FRAMES = 15;

/** 出生位置：x 居中，y=-1 让方块顶端从屏外滑入 */
function spawnPiece(kind: PieceKind, width: number): ActivePiece {
  const shape = TETROMINOES[kind][0] ?? [];
  const minX = Math.min(...shape.map(([x]) => x));
  const maxX = Math.max(...shape.map(([x]) => x));
  const pieceWidth = maxX - minX + 1;
  return {
    kind,
    rotation: 0,
    x: Math.floor((width - pieceWidth) / 2) - minX,
    y: -1,
  };
}

export function init(env: GameEnv, opts?: GameInitOptions): TetrisState {
  env.score.set(0);
  const w = env.screen.width;
  const h = env.screen.height;
  const grid = new Array<number>(w * h).fill(0);

  // level > 1：预填垃圾行，每 4 行一组共享同一空位列
  const level = opts?.level ?? 1;
  const garbageRows = Math.min((level - 1) * 2, h - 4);
  if (garbageRows > 0) {
    let gapCol = 0;
    for (let i = 0; i < garbageRows; i++) {
      if (i % 4 === 0) gapCol = Math.floor(env.rng() * w);
      const y = h - 1 - i;
      for (let x = 0; x < w; x++) {
        if (x !== gapCol) grid[y * w + x] = 1;
      }
    }
  }

  const first = pickKind(env.rng);
  const next = pickKind(env.rng);
  return {
    width: w,
    height: h,
    grid,
    active: spawnPiece(first, w),
    next,
    awaitingFirstMove: true,
    over: false,
    overFrame: 0,
    clearingLines: [],
    clearFrame: 0,
    score: 0,
    lines: 0,
    lastOpts: opts ?? null,
  };
}

/** 把当前 active 锁进 grid，返回新 grid（不变性：原数组不动） */
function lockPiece(state: TetrisState): ReadonlyArray<number> {
  if (!state.active) return state.grid;
  const { width: w, height: h } = state;
  const next = state.grid.slice();
  for (const [x, y] of pieceCells(state.active)) {
    if (y < 0 || y >= h || x < 0 || x >= w) continue;
    next[y * w + x] = 1;
  }
  return next;
}

/** 扫整个 grid 找出"全是 1"的行号集合（按 y 升序） */
function findFullRows(state: TetrisState): number[] {
  const { width: w, height: h } = state;
  const rows: number[] = [];
  for (let y = 0; y < h; y++) {
    const rowStart = y * w;
    let full = true;
    for (let x = 0; x < w; x++) {
      if (state.grid[rowStart + x] !== 1) {
        full = false;
        break;
      }
    }
    if (full) rows.push(y);
  }
  return rows;
}

/**
 * 把指定的行从 grid 移除，上方所有行下移；返回新 grid。
 *
 * 与 findFullRows 配对：先 find 列出待消除行号、闪烁动画期间 grid 保留不变，
 * 动画播完后再 remove。这样消行视觉上有"满行先闪后消"的真机感
 */
function removeRows(state: TetrisState, rows: ReadonlyArray<number>): ReadonlyArray<number> {
  if (rows.length === 0) return state.grid;
  const { width: w, height: h } = state;
  const removeSet = new Set(rows);
  const kept: number[] = [];
  for (let y = 0; y < h; y++) {
    if (removeSet.has(y)) continue;
    const rowStart = y * w;
    for (let x = 0; x < w; x++) {
      kept.push(state.grid[rowStart + x] ?? 0);
    }
  }
  const filler = new Array<number>(rows.length * w).fill(0);
  return [...filler, ...kept];
}

/** 消行得分：单 1 / 双 3 / 三 5 / Tetris 8 —— 鼓励 Tetris 不鼓励单消 */
const LINE_SCORE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 8 };

export function step(env: GameEnv, state: TetrisState): TetrisState {
  const { width: w, height: h } = state;

  // game over 动画推进：填屏 + 清屏各 h 帧
  if (state.over) {
    if (state.overFrame >= h * 2) {
      return init(env, state.lastOpts ?? undefined);
    }
    return { ...state, overFrame: state.overFrame + 1 };
  }

  // 消行闪烁阶段：推进 clearFrame，到期后真正消除 + spawn 新方块
  if (state.clearingLines.length > 0) {
    if (state.clearFrame < CLEAR_BLINK_FRAMES) {
      return { ...state, clearFrame: state.clearFrame + 1 };
    }
    return spawnAfter(env, state, removeRows(state, state.clearingLines));
  }

  if (state.awaitingFirstMove || !state.active) return state;

  // 自由下落：尝试把 active 下移 1 格；不合法则锁定 + 消行检测
  const fallen: ActivePiece = { ...state.active, y: state.active.y + 1 };
  if (isValidPosition(state.grid, w, h, fallen)) {
    return { ...state, active: fallen };
  }

  // 撞底：锁定 + 检测哪些行满
  const lockedGrid = lockPiece(state);
  const lockedState = { ...state, grid: lockedGrid };
  const fullRows = findFullRows(lockedState);

  if (fullRows.length === 0) {
    return spawnAfter(env, state, lockedGrid);
  }

  const gained = LINE_SCORE[fullRows.length] ?? 0;
  const newScore = state.score + gained;
  const newLines = state.lines + fullRows.length;
  if (gained > 0) env.score.set(newScore);

  return {
    ...state,
    grid: lockedGrid,
    active: null,
    clearingLines: fullRows,
    clearFrame: 0,
    score: newScore,
    lines: newLines,
  };
}

/**
 * 根据指定 grid spawn 下一块；若出生位置非法，转为 game over。
 */
function spawnAfter(env: GameEnv, state: TetrisState, grid: ReadonlyArray<number>): TetrisState {
  const { width: w, height: h } = state;
  const newActive = spawnPiece(state.next, w);
  if (!isValidPosition(grid, w, h, newActive)) {
    env.sound.play('over');
    return {
      ...state,
      grid,
      active: null,
      next: pickKind(env.rng),
      clearingLines: [],
      clearFrame: 0,
      over: true,
      overFrame: 0,
    };
  }
  return {
    ...state,
    grid,
    active: newActive,
    next: pickKind(env.rng),
    clearingLines: [],
    clearFrame: 0,
  };
}

export function render(env: GameEnv, state: TetrisState): void {
  const { screen } = env;
  const { width: w, height: h } = state;
  screen.clear();

  if (!state.over) {
    // 已锁定砖墙：消行闪烁阶段时，clearingLines 中的行每 6 帧一周期
    // （3 帧亮 / 3 帧暗），制造"满行先闪两三下再消除"的真机视觉
    const blinkOff = state.clearingLines.length > 0 && state.clearFrame % 6 >= 3;
    const clearSet = blinkOff ? new Set(state.clearingLines) : null;
    for (let y = 0; y < h; y++) {
      if (clearSet?.has(y)) continue;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (state.grid[row + x] === 1) screen.setPixel(x, y, true);
      }
    }
    if (state.active) {
      for (const [x, y] of pieceCells(state.active)) screen.setPixel(x, y, true);
    }
    return;
  }

  // 死亡动画：填屏（自底向上）→ 清屏（自顶向下），各 h 帧
  if (state.overFrame < h) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (state.grid[row + x] === 1) screen.setPixel(x, y, true);
      }
    }
    const filled = Math.min(h, state.overFrame + 1);
    const from = h - filled;
    for (let y = from; y < h; y++) {
      for (let x = 0; x < w; x++) screen.setPixel(x, y, true);
    }
    return;
  }
  const cleared = Math.min(h, state.overFrame - h + 1);
  for (let y = cleared; y < h; y++) {
    for (let x = 0; x < w; x++) screen.setPixel(x, y, true);
  }
}

/** 顺时针旋转一档；下一档非法时返回 null 让调用方丢弃这次旋转 */
function tryRotate(state: TetrisState): ActivePiece | null {
  if (!state.active) return null;
  const nextRot = ((state.active.rotation + 1) % 4) as Rotation;
  const candidate: ActivePiece = { ...state.active, rotation: nextRot };
  return isValidPosition(state.grid, state.width, state.height, candidate) ? candidate : null;
}

/** 横移一格（dx ±1）；非法返回 null */
function tryShift(state: TetrisState, dx: number): ActivePiece | null {
  if (!state.active) return null;
  const candidate: ActivePiece = { ...state.active, x: state.active.x + dx };
  return isValidPosition(state.grid, state.width, state.height, candidate) ? candidate : null;
}

/** 立即让 active 下落一格；非法（撞底 / 撞砖）就走完整 step 触发锁定 */
function softDrop(env: GameEnv, state: TetrisState): TetrisState {
  if (!state.active) return state;
  const fallen: ActivePiece = { ...state.active, y: state.active.y + 1 };
  if (isValidPosition(state.grid, state.width, state.height, fallen)) {
    return { ...state, active: fallen };
  }
  return step(env, state);
}

export function onButton(
  env: GameEnv,
  state: TetrisState,
  btn: Button,
  action: ButtonAction
): TetrisState {
  if (state.over) return state;

  if (action === 'release') return state;

  if (state.awaitingFirstMove) {
    if (action !== 'press') return state;
    return { ...state, awaitingFirstMove: false };
  }
  if (!state.active) return state;

  switch (btn) {
    case 'Left': {
      const moved = tryShift(state, -1);
      return moved ? { ...state, active: moved } : state;
    }
    case 'Right': {
      const moved = tryShift(state, 1);
      return moved ? { ...state, active: moved } : state;
    }
    case 'Down': {
      return softDrop(env, state);
    }
    case 'Up':
    case 'A': {
      if (action !== 'press') return state;
      const rotated = tryRotate(state);
      return rotated ? { ...state, active: rotated } : state;
    }
    default:
      return state;
  }
}

export function isGameOver(state: TetrisState): boolean {
  return state.over;
}

/**
 * App 据此把 ticker 切到 ANIM_TICK_SPEED 加速动画。覆盖两类动画态：
 * - 消行闪烁（clearingLines.length > 0）
 * - 死亡 game over 动画
 */
export function isAnimating(state: TetrisState): boolean {
  return state.over || state.clearingLines.length > 0;
}
