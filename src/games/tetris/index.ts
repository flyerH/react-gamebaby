import type { Game, GameEnv } from '@/sdk';

import { init, isAnimating, isGameOver, onButton, render, step } from './logic';
import { tetrisPreview } from './preview';
import {
  type ActivePiece,
  isValidPosition,
  pieceCells,
  type Rotation,
  TETROMINOES,
  type TetrisState,
} from './state';

/**
 * 9 档起始 tick 速度（ticks/second）= 方块自由下落频率。
 *
 * speed=1 1.5 ticks/s ≈ 670ms/格（新手友好），speed=9 12 ticks/s ≈ 83ms/格
 * 接近真机最快档。配合 Down 软降，按住 Down 可达更快的硬降级体感
 */
const TETRIS_TICK_SPEEDS: readonly number[] = [1.5, 2, 2.5, 3.5, 5, 7, 9, 10.5, 12];

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

  for (const rot of [0, 1, 2, 3] as Rotation[]) {
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

export const tetris: Game<TetrisState> = {
  id: 'tetris',
  name: 'TETRIS',
  preview: tetrisPreview,
  tickSpeeds: TETRIS_TICK_SPEEDS,
  init,
  step,
  render,
  onButton,
  isGameOver,
  isAnimating,
  demoInit(env: GameEnv): TetrisState {
    return init(env);
  },

  demoStep(env: GameEnv, state: TetrisState): TetrisState {
    if (state.over) return { ...init(env), awaitingFirstMove: false };
    if (state.awaitingFirstMove) return onButton(env, state, 'A', 'press');
    if (state.clearingLines.length > 0) return step(env, state);
    if (!state.active) return step(env, state);

    // 简单 AI：算出最佳落点（旋转 + x），逐步操作过去
    const target = pickBestPlacement(state);
    if (target) {
      if (state.active.rotation !== target.rotation) {
        return onButton(env, state, 'A', 'press');
      }
      if (state.active.x < target.x) {
        return onButton(env, state, 'Right', 'press');
      }
      if (state.active.x > target.x) {
        return onButton(env, state, 'Left', 'press');
      }
    }
    return step(env, state);
  },
};
