import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions } from '@/sdk';

import {
  type ActivePiece,
  fallIntervalMs,
  FRAME_MS,
  type HeldKey,
  isValidPosition,
  type PieceKind,
  pickKind,
  pieceCells,
  reached,
  type Rotation,
  ROTATION_STATES,
  TETROMINOES,
  type TetrisState,
} from './state';

/**
 * 消行闪烁动画的 tick 数 —— 真机风格"被消除的行先闪几下"。
 *
 * 游戏固定 30 帧/秒推进，15 帧 ≈ 500ms，给玩家足够视觉反馈
 */
const CLEAR_BLINK_FRAMES = 15;

/*
 * 按住连发参数：左右键按住 200ms 后约每 33ms 移一格；下键按住 200ms 后约每 17ms 降一格。
 * 游戏 30 帧/秒推进，下键在一帧内可能连降两格
 */
const SHIFT_DAS_MS = 200;
const SHIFT_ARR_MS = 1000 / 30;
const DROP_DAS_MS = 200;
const DROP_ARR_MS = 1000 / 60;

/** 包围盒：用于出生时水平居中、底边贴着第 0 行 */
function shapeBounds(
  kind: PieceKind,
  rotation: Rotation
): {
  minX: number;
  maxX: number;
  maxY: number;
} {
  const shape = TETROMINOES[kind][rotation] ?? [];
  return {
    minX: Math.min(...shape.map(([x]) => x)),
    maxX: Math.max(...shape.map(([x]) => x)),
    maxY: Math.max(...shape.map(([, y]) => y)),
  };
}

/**
 * 出生：随机相位（可旋转相位内均匀），水平居中，最下面一格落在第 0 行，
 * 其余部分在屏外，从顶部滑入
 */
function spawnPiece(kind: PieceKind, width: number, rng: () => number): ActivePiece {
  const rotation = Math.floor(rng() * ROTATION_STATES[kind]) as Rotation;
  const { minX, maxX, maxY } = shapeBounds(kind, rotation);
  return {
    kind,
    rotation,
    x: Math.floor((width - (maxX - minX + 1)) / 2) - minX,
    y: -maxY,
  };
}

/**
 * level > 1 时预填 level − 1 行垃圾砖（自底向上），每行在随机的 4~6 列放砖，
 * 留下大量空位，避免开局就能连消
 */
function garbageGrid(env: GameEnv, w: number, h: number, level: number): number[] {
  const grid = new Array<number>(w * h).fill(0);
  const rows = Math.min(level - 1, h - 4);
  for (let i = 0; i < rows; i++) {
    const y = h - 1 - i;
    const cols = Array.from({ length: w }, (_, x) => x);
    const count = 4 + Math.floor(env.rng() * 3);
    for (let n = 0; n < count && cols.length > 0; n++) {
      const [x] = cols.splice(Math.floor(env.rng() * cols.length), 1);
      if (x !== undefined) grid[y * w + x] = 1;
    }
  }
  return grid;
}

export function init(env: GameEnv, opts?: GameInitOptions): TetrisState {
  env.score.set(0);
  const w = env.screen.width;
  const h = env.screen.height;
  const grid = garbageGrid(env, w, h, opts?.level ?? 1);

  const first = pickKind(env.rng);
  const next = pickKind(env.rng);
  return {
    width: w,
    height: h,
    grid,
    active: spawnPiece(first, w, env.rng),
    next,
    awaitingFirstMove: true,
    over: false,
    overFrame: 0,
    clearingLines: [],
    clearFrame: 0,
    score: 0,
    lines: 0,
    lastOpts: opts ?? null,
    fallAcc: 0,
    fallIntervalMs: fallIntervalMs(opts?.speed ?? 1),
    heldShift: null,
    heldDrop: null,
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

/** active 下移一格后的位置；下不去返回 null */
function tryFall(state: TetrisState): ActivePiece | null {
  if (!state.active) return null;
  const fallen: ActivePiece = { ...state.active, y: state.active.y + 1 };
  return isValidPosition(state.grid, state.width, state.height, fallen) ? fallen : null;
}

/**
 * 下落一格（自由下落与软降共用），并清零下落计时；
 * 下不去就锁定 + 检测消行
 */
function fall(env: GameEnv, state: TetrisState): TetrisState {
  const fallen = tryFall(state);
  return fallen ? { ...state, active: fallen, fallAcc: 0 } : lockAndClear(env, state);
}

/** 锁定 active；满行时进入闪烁阶段，否则直接出下一块 */
function lockAndClear(env: GameEnv, state: TetrisState): TetrisState {
  const lockedGrid = lockPiece(state);
  const fullRows = findFullRows({ ...state, grid: lockedGrid });
  if (fullRows.length === 0) return spawnAfter(env, state, lockedGrid);

  const newScore = state.score + (LINE_SCORE[fullRows.length] ?? 0);
  env.score.set(newScore);
  return {
    ...state,
    grid: lockedGrid,
    active: null,
    clearingLines: fullRows,
    clearFrame: 0,
    score: newScore,
    lines: state.lines + fullRows.length,
    fallAcc: 0,
  };
}

/** 换新方块时，仍按住的键重新计起始延迟，避免连发直接带到下一块 */
function restartHold<T extends HeldKey>(held: T | null): T | null {
  return held ? { ...held, heldMs: 0, repeatAcc: 0 } : null;
}

/**
 * 根据指定 grid spawn 下一块；若出生位置非法，转为 game over。
 */
function spawnAfter(env: GameEnv, state: TetrisState, grid: ReadonlyArray<number>): TetrisState {
  const newActive = spawnPiece(state.next, state.width, env.rng);
  const base = {
    ...state,
    grid,
    next: pickKind(env.rng),
    clearingLines: [],
    clearFrame: 0,
    fallAcc: 0,
    heldShift: restartHold(state.heldShift),
    heldDrop: restartHold(state.heldDrop),
  };
  if (!isValidPosition(grid, state.width, state.height, newActive)) {
    env.sound.play('over');
    return { ...base, active: null, over: true, overFrame: 0 };
  }
  return { ...base, active: newActive };
}

/**
 * 推进按住键一帧的计时，返回新的按住状态与本帧应连发的次数：
 * 按住时长达到起始延迟后的下一帧才开始累计连发，每满一个连发间隔连发一次
 */
function tickHeld<T extends HeldKey>(held: T, dasMs: number, arrMs: number): [T, number] {
  const heldMs = held.heldMs + FRAME_MS;
  if (!reached(held.heldMs, dasMs)) return [{ ...held, heldMs }, 0];
  let acc = held.repeatAcc + FRAME_MS;
  let count = 0;
  while (reached(acc, arrMs)) {
    acc -= arrMs;
    count++;
  }
  return [{ ...held, heldMs, repeatAcc: Math.max(0, acc) }, count];
}

/** 左右键连发：撞墙即停 */
function stepShift(state: TetrisState): TetrisState {
  if (!state.heldShift) return state;
  const [held, count] = tickHeld(state.heldShift, SHIFT_DAS_MS, SHIFT_ARR_MS);
  let s: TetrisState = { ...state, heldShift: held };
  for (let i = 0; i < count; i++) {
    const moved = tryShift(s, held.dir);
    if (!moved) break;
    s = { ...s, active: moved };
  }
  return s;
}

/**
 * 下键连发：每次软降一格，落到底立即锁定，本帧不再继续。
 * locked=true 表示这一帧已经锁定，调用方不再做自由下落
 */
function stepDrop(env: GameEnv, state: TetrisState): { state: TetrisState; locked: boolean } {
  if (!state.heldDrop) return { state, locked: false };
  const [held, count] = tickHeld(state.heldDrop, DROP_DAS_MS, DROP_ARR_MS);
  let s: TetrisState = { ...state, heldDrop: held };
  for (let i = 0; i < count; i++) {
    const fallen = tryFall(s);
    // 锁定后 spawnAfter 已把仍按住的键重置为重新计起始延迟
    if (!fallen) return { state: lockAndClear(env, s), locked: true };
    s = { ...s, active: fallen, fallAcc: 0 };
  }
  return { state: s, locked: false };
}

export function step(env: GameEnv, state: TetrisState): TetrisState {
  const { height: h } = state;

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

  // 处理顺序：先左右，再下键，最后自由下落
  const { state: s, locked } = stepDrop(env, stepShift(state));
  if (locked || !s.active) return s;

  const acc = s.fallAcc + FRAME_MS;
  if (!reached(acc, s.fallIntervalMs)) return { ...s, fallAcc: acc };
  return fall(env, s);
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

    // 副屏：画下一块方块（XY 都归一化到 0，避免负坐标越界）。
    // 副屏只有 4×2，竖放的方块画不下，所以统一画相位 0；出生相位在 spawn 时才随机
    const { auxScreen } = env;
    auxScreen.clear();
    const nextShape = TETROMINOES[state.next]?.[0];
    if (nextShape) {
      const minX = Math.min(...nextShape.map(([sx]) => sx));
      const minY = Math.min(...nextShape.map(([, sy]) => sy));
      for (const [sx, sy] of nextShape) auxScreen.setPixel(sx - minX, sy - minY, true);
    }
    return;
  }

  // 死亡后清空副屏
  env.auxScreen.clear();

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

/** 下一个旋转相位：O 不转（返回 null），I / S / Z 在 0、1 间切换，其余顺时针循环 */
function nextRotation(kind: PieceKind, rotation: Rotation): Rotation | null {
  const states = ROTATION_STATES[kind];
  if (states <= 1) return null;
  return ((rotation + 1) % states) as Rotation;
}

/**
 * 旋转规则：
 * - 转后合法直接生效
 * - 转后只是越过左右墙、没有压到砖块时，按越界格数平移回界内再试
 * - 压到砖块或平移后仍非法时放弃这次旋转
 */
function tryRotate(state: TetrisState): ActivePiece | null {
  const { active, grid, width: w, height: h } = state;
  if (!active) return null;
  const rotation = nextRotation(active.kind, active.rotation);
  if (rotation === null) return null;
  const turned: ActivePiece = { ...active, rotation };
  if (isValidPosition(grid, w, h, turned)) return turned;

  const cells = pieceCells(turned);
  const overlaps = cells.some(
    ([x, y]) => x >= 0 && x < w && y >= 0 && y < h && grid[y * w + x] === 1
  );
  if (overlaps) return null;
  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const offset = minX < 0 ? minX : Math.max(0, maxX - (w - 1));
  if (offset === 0) return null;
  const kicked: ActivePiece = { ...turned, x: turned.x - offset };
  return isValidPosition(grid, w, h, kicked) ? kicked : null;
}

/** 横移一格（dx ±1）；非法返回 null */
function tryShift(state: TetrisState, dx: number): ActivePiece | null {
  if (!state.active) return null;
  const candidate: ActivePiece = { ...state.active, x: state.active.x + dx };
  return isValidPosition(state.grid, state.width, state.height, candidate) ? candidate : null;
}

/** 左右键对应的横移方向；其它键返回 null */
function shiftDir(btn: Button): -1 | 1 | null {
  if (btn === 'Left') return -1;
  if (btn === 'Right') return 1;
  return null;
}

/**
 * 输入语义：
 * - Left / Right / Down 按下立即动一格，按住期间由 step 按 SHIFT_* / DROP_* 节奏连发；
 *   平台层的 repeat 事件不参与
 * - Up / A 旋转，只响应 press
 * - release 结束按住，在消行动画等阶段也要处理，避免按住状态残留
 */
export function onButton(
  env: GameEnv,
  state: TetrisState,
  btn: Button,
  action: ButtonAction
): TetrisState {
  if (state.over) return state;

  const dx = shiftDir(btn);
  if (action === 'release') {
    if (dx !== null && state.heldShift?.dir === dx) return { ...state, heldShift: null };
    if (btn === 'Down' && state.heldDrop) return { ...state, heldDrop: null };
    return state;
  }
  if (action === 'repeat') return state;

  if (state.awaitingFirstMove) return { ...state, awaitingFirstMove: false };
  if (!state.active) return state;

  if (dx !== null) {
    const moved = tryShift(state, dx);
    return {
      ...state,
      active: moved ?? state.active,
      heldShift: { dir: dx, heldMs: 0, repeatAcc: 0 },
    };
  }
  switch (btn) {
    case 'Down':
      return { ...fall(env, state), heldDrop: { heldMs: 0, repeatAcc: 0 } };
    case 'Up':
    case 'A': {
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
 * machine 据此把 ticker 切到 ANIM_TICK_SPEED。覆盖两类动画态：
 * - 消行闪烁（clearingLines.length > 0）
 * - 死亡 game over 动画
 */
export function isAnimating(state: TetrisState): boolean {
  return state.over || state.clearingLines.length > 0;
}
