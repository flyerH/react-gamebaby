import type { Game } from '@/sdk';

import { init, isGameOver, onButton, render, step } from './logic';
import { snakePreview } from './preview';
import type { SnakeState } from './state';

/**
 * 9 档起始 tick 速度（ticks/second）。
 *
 * speed=2（1.25）保留旧版本默认手感作为基线；档位间不是等差也不是
 * 等比 —— 低档段 +25% 步进（让初学玩家感受得到差距但不至于劝退），
 * 高档段 +33%~+50%（专家档逐档明显加快）。speed=9 (6 ticks/s ≈ 167ms)
 * 接近 Brick Game 真机的最快 Snake 节奏。
 */
const SNAKE_TICK_SPEEDS: readonly number[] = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

export const snake: Game<SnakeState> = {
  id: 'snake',
  name: 'SNAKE',
  preview: snakePreview,
  tickSpeeds: SNAKE_TICK_SPEEDS,
  init,
  step,
  render,
  onButton,
  isGameOver,
};
