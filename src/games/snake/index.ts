import type { Button, Game, GameEnv } from '@/sdk';

import { init, isGameOver, onButton, render, step } from './logic';
import { snakePreview } from './preview';
import {
  type Direction,
  dirVec,
  isMoveDue,
  isOpposite,
  SNAKE_TICK_HZ,
  type SnakeState,
} from './state';

/** 选关 demo 的速度档：每 0.5s 走一格，小屏上看得清 */
const DEMO_SPEED = 3;

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
  // 走格快慢由 state.moveIntervalMs 决定，ticker 固定 30 帧/秒即可，与 speed 档无关
  tickSpeed: SNAKE_TICK_HZ,
  init,
  step,
  render,
  onButton,
  isGameOver,

  demoInit(env: GameEnv): SnakeState {
    return init(env, { speed: DEMO_SPEED, level: 1 });
  },

  demoStep(env: GameEnv, state: SnakeState): SnakeState {
    // 死亡或蛇够长 → 静默重开（跳过死亡动画 + 跳过等待首键）
    if (state.over || state.body.length >= Math.floor((env.screen.width * env.screen.height) / 3)) {
      return { ...init(env, { speed: DEMO_SPEED, level: 1 }), awaitingFirstMove: false };
    }
    // 与 machine 一致：按键在帧开头送达，随后照常推进这一帧。
    // 只在该走格的那一帧决策：换向按键会当场走一格，代替这一帧的自然走格
    let s = state;
    if (s.awaitingFirstMove) {
      s = onButton(env, s, 'Right', 'press');
    } else if (isMoveDue(s)) {
      const btn = pickDemoDir(s, env.screen.width, env.screen.height);
      if (btn && btn !== DIR_TO_BTN[s.dir]) s = onButton(env, s, btn, 'press');
    }
    return step(env, s);
  },
};
