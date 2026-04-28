import type { Game } from '@/sdk';

import { init, isGameOver, onButton, render, step } from './logic';
import { snakePreview } from './preview';
import type { SnakeState } from './state';

const snake: Game<SnakeState> = {
  id: 'snake',
  name: 'SNAKE',
  preview: snakePreview,
  // Brick Game 真机手感：每步约 800ms（折合 1.25 ticks/s）
  tickSpeed: 1.25,
  init,
  step,
  render,
  onButton,
  isGameOver,
};

export default snake;
