import type { Game } from '@/sdk';

import { init, isGameOver, onButton, render, step } from './logic';
import { snakePreview } from './preview';
import type { SnakeState } from './state';

/**
 * 9 档起始 tick 速度（ticks/second）。
 *
 * speed=2（1.5）保留接近旧版本默认手感作为基线；档位间不是等差也不是
 * 等比 —— 低档段 +25%~50% 步进，高档段 +30%~50%（专家档逐档明显加快）。
 * speed=9 (10 ticks/s = 100ms) 接近 Brick Game 真机最快 Snake 节奏，
 * 配合长按 repeat 节奏达到极限手感
 */
const SNAKE_TICK_SPEEDS: readonly number[] = [1, 1.5, 2, 2.5, 3.5, 4.5, 6, 8, 10];

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
