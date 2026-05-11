import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions } from '@/sdk';

import {
  type ActivePiece,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  isValidPosition,
  type PieceKind,
  pickKind,
  pieceCells,
  type Rotation,
  TETROMINOES,
  type TetrisState,
} from './state';

/* ------------------------------------------------------------------ *
 * 死亡动画参数（与 Snake 共享同套两阶段节奏：填屏 + 清屏）
 *
 * Tetris 没有"爆炸点"概念（玩家堆顶 game over，没有撞击中心），所以
 * 略掉 Snake 的爆炸阶段，直接走"从底向上填满屏 + 从顶向下清屏"动画。
 * 配合 App 层的 ANIM_TICK_SPEED=30 ticks/s 总时长约 1.3s
 * ------------------------------------------------------------------ */

const FILL_FRAMES = FIELD_HEIGHT;
const CLEAR_FRAMES = FIELD_HEIGHT;
const CLEAR_BEGIN = FILL_FRAMES;
const TOTAL_FRAMES = CLEAR_BEGIN + CLEAR_FRAMES;

/**
 * 消行闪烁动画的 tick 数 —— 真机风格"被消除的行先闪几下"。
 *
 * App 检测到 isAnimating=true 时把 ticker 切到 ANIM_TICK_SPEED (30 ticks/s
 * ≈ 33ms/帧)。15 帧 ≈ 500ms，给玩家足够视觉反馈
 */
const CLEAR_BLINK_FRAMES = 15;

/** 出生位置：x 居中（用 I 块包围盒 4 计算），y=-1 让方块顶端从屏外滑入 */
function spawnPiece(kind: PieceKind): ActivePiece {
  const shape = TETROMINOES[kind][0] ?? [];
  const minX = Math.min(...shape.map(([x]) => x));
  const maxX = Math.max(...shape.map(([x]) => x));
  const pieceWidth = maxX - minX + 1;
  return {
    kind,
    rotation: 0,
    x: Math.floor((FIELD_WIDTH - pieceWidth) / 2) - minX,
    y: -1,
  };
}

export function init(env: GameEnv, opts?: GameInitOptions): TetrisState {
  env.score.set(0);
  const grid = new Array<number>(FIELD_WIDTH * FIELD_HEIGHT).fill(0);
  const first = pickKind(env.rng);
  const next = pickKind(env.rng);
  return {
    grid,
    active: spawnPiece(first),
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
  const next = state.grid.slice();
  for (const [x, y] of pieceCells(state.active)) {
    if (y < 0 || y >= FIELD_HEIGHT || x < 0 || x >= FIELD_WIDTH) continue;
    next[y * FIELD_WIDTH + x] = 1;
  }
  return next;
}

/** 扫整个 grid 找出"全是 1"的行号集合（按 y 升序） */
function findFullRows(grid: ReadonlyArray<number>): number[] {
  const rows: number[] = [];
  for (let y = 0; y < FIELD_HEIGHT; y++) {
    const rowStart = y * FIELD_WIDTH;
    let full = true;
    for (let x = 0; x < FIELD_WIDTH; x++) {
      if (grid[rowStart + x] !== 1) {
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
function removeRows(
  grid: ReadonlyArray<number>,
  rows: ReadonlyArray<number>
): ReadonlyArray<number> {
  if (rows.length === 0) return grid;
  const removeSet = new Set(rows);
  const kept: number[] = [];
  for (let y = 0; y < FIELD_HEIGHT; y++) {
    if (removeSet.has(y)) continue;
    const rowStart = y * FIELD_WIDTH;
    for (let x = 0; x < FIELD_WIDTH; x++) {
      kept.push(grid[rowStart + x] ?? 0);
    }
  }
  const filler = new Array<number>(rows.length * FIELD_WIDTH).fill(0);
  return [...filler, ...kept];
}

/** 消行得分：单 1 / 双 3 / 三 5 / Tetris 8 —— 鼓励 Tetris 不鼓励单消 */
const LINE_SCORE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 8 };

export function step(env: GameEnv, state: TetrisState): TetrisState {
  // game over 动画推进：与 Snake 同节奏
  if (state.over) {
    if (state.overFrame >= TOTAL_FRAMES) {
      return init(env, state.lastOpts ?? undefined);
    }
    return { ...state, overFrame: state.overFrame + 1 };
  }

  // 消行闪烁阶段：推进 clearFrame，到期后真正消除 + spawn 新方块
  if (state.clearingLines.length > 0) {
    if (state.clearFrame < CLEAR_BLINK_FRAMES) {
      return { ...state, clearFrame: state.clearFrame + 1 };
    }
    return spawnAfter(env, state, removeRows(state.grid, state.clearingLines));
  }

  if (state.awaitingFirstMove || !state.active) return state;

  // 自由下落：尝试把 active 下移 1 格；不合法则锁定 + 消行检测
  const fallen: ActivePiece = { ...state.active, y: state.active.y + 1 };
  if (isValidPosition(state.grid, FIELD_WIDTH, FIELD_HEIGHT, fallen)) {
    return { ...state, active: fallen };
  }

  // 撞底：锁定 + 检测哪些行满
  const lockedGrid = lockPiece(state);
  const fullRows = findFullRows(lockedGrid);

  if (fullRows.length === 0) {
    // 无消行 → 直接 spawn
    return spawnAfter(env, state, lockedGrid);
  }

  // 有消行 → 进入闪烁阶段，spawn 推迟到 clearFrame 到期。分数立即结算，
  // 闪烁期间 SidePanel 的 score 就已经更新（视觉反馈先于 grid 真正消除）
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
 *
 * 把"无消行直接 spawn"和"消行闪烁后 spawn"统一到这条路径，省 step 内
 * 两处重复
 */
function spawnAfter(env: GameEnv, state: TetrisState, grid: ReadonlyArray<number>): TetrisState {
  const newActive = spawnPiece(state.next);
  if (!isValidPosition(grid, FIELD_WIDTH, FIELD_HEIGHT, newActive)) {
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
  screen.clear();

  if (!state.over) {
    // 已锁定砖墙：消行闪烁阶段时，clearingLines 中的行每 6 帧一周期
    // （3 帧亮 / 3 帧暗），制造"满行先闪两三下再消除"的真机视觉
    const blinkOff = state.clearingLines.length > 0 && state.clearFrame % 6 >= 3;
    const clearSet = blinkOff ? new Set(state.clearingLines) : null;
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      if (clearSet?.has(y)) continue; // 暗帧：跳过整行不画
      const row = y * FIELD_WIDTH;
      for (let x = 0; x < FIELD_WIDTH; x++) {
        if (state.grid[row + x] === 1) screen.setPixel(x, y, true);
      }
    }
    // 在场方块（出生时 y=-1 的部分会被 setPixel 静默拒绝）；
    // 消行闪烁期间 active=null，自然跳过
    if (state.active) {
      for (const [x, y] of pieceCells(state.active)) screen.setPixel(x, y, true);
    }
    return;
  }

  // 死亡动画：填屏（自底向上）→ 清屏（自顶向下）
  if (state.overFrame < CLEAR_BEGIN) {
    // 先画死前的砖墙，再叠加填亮行
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      const row = y * FIELD_WIDTH;
      for (let x = 0; x < FIELD_WIDTH; x++) {
        if (state.grid[row + x] === 1) screen.setPixel(x, y, true);
      }
    }
    const filled = Math.min(FILL_FRAMES, state.overFrame + 1);
    const from = FIELD_HEIGHT - filled;
    for (let y = from; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) screen.setPixel(x, y, true);
    }
    return;
  }
  // 清屏：cleared 行往下保留全亮
  const cleared = Math.min(CLEAR_FRAMES, state.overFrame - CLEAR_BEGIN + 1);
  for (let y = cleared; y < FIELD_HEIGHT; y++) {
    for (let x = 0; x < FIELD_WIDTH; x++) screen.setPixel(x, y, true);
  }
}

/** 顺时针旋转一档；下一档非法时返回 null 让调用方丢弃这次旋转 */
function tryRotate(state: TetrisState): ActivePiece | null {
  if (!state.active) return null;
  const nextRot = ((state.active.rotation + 1) % 4) as Rotation;
  const candidate: ActivePiece = { ...state.active, rotation: nextRot };
  return isValidPosition(state.grid, FIELD_WIDTH, FIELD_HEIGHT, candidate) ? candidate : null;
}

/** 横移一格（dx ±1）；非法返回 null */
function tryShift(state: TetrisState, dx: number): ActivePiece | null {
  if (!state.active) return null;
  const candidate: ActivePiece = { ...state.active, x: state.active.x + dx };
  return isValidPosition(state.grid, FIELD_WIDTH, FIELD_HEIGHT, candidate) ? candidate : null;
}

/** 立即让 active 下落一格；非法（撞底 / 撞砖）就走完整 step 触发锁定 */
function softDrop(env: GameEnv, state: TetrisState): TetrisState {
  if (!state.active) return state;
  const fallen: ActivePiece = { ...state.active, y: state.active.y + 1 };
  if (isValidPosition(state.grid, FIELD_WIDTH, FIELD_HEIGHT, fallen)) {
    return { ...state, active: fallen };
  }
  // 撞底：直接走 step 路径让它完成"锁定 + 消行 + spawn"
  return step(env, state);
}

export function onButton(
  env: GameEnv,
  state: TetrisState,
  btn: Button,
  action: ButtonAction
): TetrisState {
  if (state.over) return state;

  // release 不做处理
  if (action === 'release') return state;

  // 等待首次按键启动：仅 press 解除等待，repeat 状态下还停着没意义
  if (state.awaitingFirstMove) {
    if (action !== 'press') return state;
    return { ...state, awaitingFirstMove: false };
  }
  if (!state.active) return state;

  switch (btn) {
    case 'Left': {
      // press 和 repeat 都横移
      const moved = tryShift(state, -1);
      return moved ? { ...state, active: moved } : state;
    }
    case 'Right': {
      const moved = tryShift(state, 1);
      return moved ? { ...state, active: moved } : state;
    }
    case 'Down': {
      // 软降：press 和 repeat 都触发，长按 ≈ 10 格/s 的下落速度
      return softDrop(env, state);
    }
    case 'Up':
    case 'A': {
      // Up 与 Rotate 都执行旋转；仅响应 press，长按持续转会让玩家无法
      // 精确控制方块姿态。Up 在真机 Tetris 上常作"软旋转"快捷键，与 A
      // 同语义
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
 * - 消行闪烁（clearingLines.length > 0）—— 否则 baseline 慢 speed 下闪烁会
 *   长达 1~2 秒，玩家觉得卡顿
 * - 死亡 game over 动画 —— 默认 App 已视 isGameOver=true 为动画态，这里
 *   只是显式兜底；返回 over 让逻辑更直白
 */
export function isAnimating(state: TetrisState): boolean {
  return state.over || state.clearingLines.length > 0;
}
