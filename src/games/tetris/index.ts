import type { Button } from '@/engine/types';
import type { Game, GameEnv } from '@/sdk';

import { init, isAnimating, isGameOver, onButton, render, step } from './logic';
import { tetrisPreview } from './preview';
import {
  type ActivePiece,
  isValidPosition,
  pieceCells,
  type Rotation,
  ROTATION_STATES,
  TETRIS_TICK_HZ,
  TETROMINOES,
  type TetrisState,
} from './state';

/** 选关 demo 的速度档：每 0.4s 下落一格，小屏上看得清 */
const DEMO_SPEED = 3;

/**
 * Demo AI：穷举当前方块的 4 种旋转 × 所有合法 x，模拟硬降找到"最优"落点。
 * 评分 = 完成行数 × 10 + 落得越低越好 − 高度差惩罚（鼓励平整）
 */
function pickBestPlacement(state: TetrisState): { rotation: Rotation; x: number } | null {
  if (!state.active) return null;
  const { width: w, height: h, grid } = state;
  let bestScore = -Infinity;
  let bestRot: Rotation = 0;
  let bestX = 0;

  for (let r = 0; r < ROTATION_STATES[state.active.kind]; r++) {
    const rot = r as Rotation;
    const shape = TETROMINOES[state.active.kind][rot] ?? [];
    const xs = shape.map(([dx]) => dx);
    const minDx = Math.min(...xs);
    const maxDx = Math.max(...xs);

    for (let x = -minDx; x < w - maxDx; x++) {
      const piece: ActivePiece = { kind: state.active.kind, rotation: rot, x, y: 0 };
      if (!isValidPosition(grid, w, h, piece)) continue;

      // 硬降：不断下移直到非法
      let dropY = 0;
      while (isValidPosition(grid, w, h, { ...piece, y: dropY + 1 })) dropY++;
      const landed = { ...piece, y: dropY };

      // 模拟锁定
      const simGrid = grid.slice();
      for (const [cx, cy] of pieceCells(landed)) {
        if (cy >= 0 && cy < h && cx >= 0 && cx < w) simGrid[cy * w + cx] = 1;
      }

      // 评分：完成行数
      let completedLines = 0;
      for (let y = 0; y < h; y++) {
        let full = true;
        for (let xi = 0; xi < w; xi++) {
          if (simGrid[y * w + xi] !== 1) {
            full = false;
            break;
          }
        }
        if (full) completedLines++;
      }

      // 落点高度（越低越好，即 dropY 越大越好）
      const landingScore = dropY;

      // 相邻列高度差惩罚（越平越好）
      const heights: number[] = [];
      for (let xi = 0; xi < w; xi++) {
        let colH = 0;
        for (let y = 0; y < h; y++) {
          if (simGrid[y * w + xi] === 1) {
            colH = h - y;
            break;
          }
        }
        heights.push(colH);
      }
      let bumpiness = 0;
      for (let i = 1; i < heights.length; i++) {
        bumpiness += Math.abs((heights[i] ?? 0) - (heights[i - 1] ?? 0));
      }

      const score = completedLines * 10 + landingScore - bumpiness;
      if (score > bestScore) {
        bestScore = score;
        bestRot = rot;
        bestX = x;
      }
    }
  }

  return bestScore > -Infinity ? { rotation: bestRot, x: bestX } : null;
}

/** 用 press + release 模拟一次点按，避免按住状态触发连发 */
function tap(env: GameEnv, state: TetrisState, btn: Button): TetrisState {
  return onButton(env, onButton(env, state, btn, 'press'), btn, 'release');
}

/** demo AI 这一帧要按的键：先转到目标相位，再横移到目标列；已就位返回 null */
function demoButton(state: TetrisState): Button | null {
  if (!state.active) return null;
  const target = pickBestPlacement(state);
  if (!target) return null;
  if (state.active.rotation !== target.rotation) return 'A';
  if (state.active.x < target.x) return 'Right';
  if (state.active.x > target.x) return 'Left';
  return null;
}

export const tetris: Game<TetrisState> = {
  id: 'tetris',
  name: 'TETRIS',
  preview: tetrisPreview,
  // 下落与连发快慢由游戏内的毫秒计时决定，ticker 固定 30 帧/秒即可，与 speed 档无关
  tickSpeed: TETRIS_TICK_HZ,
  init,
  step,
  render,
  onButton,
  isGameOver,
  isAnimating,
  demoInit(env: GameEnv): TetrisState {
    return init(env, { speed: DEMO_SPEED, level: 1 });
  },

  demoStep(env: GameEnv, state: TetrisState): TetrisState {
    if (state.over)
      return { ...init(env, { speed: DEMO_SPEED, level: 1 }), awaitingFirstMove: false };
    if (state.awaitingFirstMove) return onButton(env, state, 'A', 'press');
    // 每帧最多操作一次，同时照常推进下落
    const btn = demoButton(state);
    return step(env, btn ? tap(env, state, btn) : state);
  },
};
