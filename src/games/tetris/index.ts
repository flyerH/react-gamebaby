import type { Game } from '@/sdk';

import { init, isAnimating, isGameOver, onButton, render, step } from './logic';
import { tetrisPreview } from './preview';
import type { TetrisState } from './state';

/**
 * 9 档起始 tick 速度（ticks/second）= 方块自由下落频率。
 *
 * speed=1 1.5 ticks/s ≈ 670ms/格（新手友好），speed=9 12 ticks/s ≈ 83ms/格
 * 接近真机最快档。配合 Down 软降，按住 Down 可达更快的硬降级体感
 */
const TETRIS_TICK_SPEEDS: readonly number[] = [1.5, 2, 2.5, 3.5, 5, 7, 9, 10.5, 12];

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
};
