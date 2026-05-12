import type { Button, Game, GameEnv } from '@/sdk';

import { init, isGameOver, onButton, render, step } from './logic';
import { snakePreview } from './preview';
import { type Direction, dirVec, isOpposite, type SnakeState } from './state';

/**
 * 9 档起始 tick 速度（ticks/second）。
 *
 * speed=2（1.5）保留接近旧版本默认手感作为基线；档位间不是等差也不是
 * 等比 —— 低档段 +25%~50% 步进，高档段 +30%~50%（专家档逐档明显加快）。
 * speed=9 (10 ticks/s = 100ms) 接近 Brick Game 真机最快 Snake 节奏，
 * 配合长按 repeat 节奏达到极限手感
 */
const SNAKE_TICK_SPEEDS: readonly number[] = [1, 1.5, 2, 2.5, 3.5, 4.5, 6, 8, 10];

const DIR_TO_BTN: Record<Direction, Button> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

/** 贪心 AI：优先靠近食物的方向，跳过会撞墙 / 撞身的选项 */
function pickDemoDir(state: SnakeState, w: number, h: number): Button | null {
  const head = state.body[0];
  if (!head || !state.food) return null;

  const bodySet = new Set(state.body.map(([x, y]) => `${x},${y}`));
  const obstacleSet = new Set(state.obstacles.map(([x, y]) => `${x},${y}`));
  const [fx, fy] = state.food;
  const [hx, hy] = head;

  const candidates: Direction[] = [];
  if (fx < hx) candidates.push('left');
  else if (fx > hx) candidates.push('right');
  if (fy < hy) candidates.push('up');
  else if (fy > hy) candidates.push('down');
  // 补上其余方向作为 fallback
  for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
    if (!candidates.includes(d)) candidates.push(d);
  }

  for (const d of candidates) {
    if (isOpposite(state.dir, d)) continue;
    const [dx, dy] = dirVec(d);
    const nx = hx + dx;
    const ny = hy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    if (bodySet.has(`${nx},${ny}`) || obstacleSet.has(`${nx},${ny}`)) continue;
    return DIR_TO_BTN[d];
  }
  return null;
}

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

  demoInit(env: GameEnv): SnakeState {
    return init(env);
  },

  demoStep(env: GameEnv, state: SnakeState): SnakeState {
    // 死亡或蛇够长 → 静默重开（跳过死亡动画 + 跳过等待首键）
    if (state.over || state.body.length >= Math.floor((env.screen.width * env.screen.height) / 3)) {
      return { ...init(env), awaitingFirstMove: false };
    }
    if (state.awaitingFirstMove) return onButton(env, state, 'Right', 'press');
    const btn = pickDemoDir(state, env.screen.width, env.screen.height);
    if (btn && btn !== DIR_TO_BTN[state.dir]) {
      return onButton(env, state, btn, 'press');
    }
    return step(env, state);
  },
};
