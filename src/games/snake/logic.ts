import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, Pixel } from '@/sdk';

import { type Direction, dirVec, isOpposite, randomFood, type SnakeState } from './state';

const INITIAL_LENGTH = 3;

/**
 * 初始状态：蛇放在屏幕水平中线偏左，朝右，长度 3
 *
 * 同时把 env.score 清零，和 SidePanel 订阅的 Counter 对齐。
 */
export function init(env: GameEnv): SnakeState {
  const { width, height } = env.screen;
  const cy = Math.floor(height / 2);
  const startX = Math.floor(width / 2);
  const body: ReadonlyArray<Pixel> = Array.from(
    { length: INITIAL_LENGTH },
    (_, i): Pixel => [startX - i, cy]
  );
  env.score.set(0);

  const food = randomFood(env, body) ?? [0, 0];
  return {
    body,
    dir: 'right',
    pendingDir: 'right',
    food,
    over: false,
    score: 0,
  };
}

export function step(env: GameEnv, state: SnakeState): SnakeState {
  if (state.over) return state;
  const head = state.body[0];
  if (!head) return state;

  const dir = state.pendingDir;
  const [dx, dy] = dirVec(dir);
  const nx = head[0] + dx;
  const ny = head[1] + dy;

  const { width, height } = env.screen;
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
    env.sound.play('over');
    return { ...state, dir, over: true };
  }

  const ate = nx === state.food[0] && ny === state.food[1];
  const newBody: ReadonlyArray<Pixel> = ate
    ? [[nx, ny], ...state.body]
    : [[nx, ny], ...state.body.slice(0, -1)];

  // 撞到自身（新头碰到除"被丢弃的尾巴"之外的任何一节）
  for (let i = 1; i < newBody.length; i++) {
    const seg = newBody[i];
    if (seg && seg[0] === nx && seg[1] === ny) {
      env.sound.play('over');
      return { ...state, dir, over: true };
    }
  }

  if (ate) {
    const newScore = state.score + 1;
    env.score.set(newScore);
    env.sound.play('clear');
    const newFood = randomFood(env, newBody) ?? state.food;
    return {
      ...state,
      body: newBody,
      dir,
      food: newFood,
      score: newScore,
    };
  }

  env.sound.play('move');
  return { ...state, body: newBody, dir };
}

export function render(env: GameEnv, state: SnakeState): void {
  const { screen } = env;
  screen.clear();
  for (const [x, y] of state.body) screen.setPixel(x, y, true);
  screen.setPixel(state.food[0], state.food[1], true);
}

export function onButton(
  _env: GameEnv,
  state: SnakeState,
  btn: Button,
  action: ButtonAction
): SnakeState {
  if (action !== 'press' || state.over) return state;
  const nextDir: Direction | null =
    btn === 'Up'
      ? 'up'
      : btn === 'Down'
        ? 'down'
        : btn === 'Left'
          ? 'left'
          : btn === 'Right'
            ? 'right'
            : null;
  if (!nextDir) return state;
  if (isOpposite(state.dir, nextDir)) return state;
  return { ...state, pendingDir: nextDir };
}

export function isGameOver(state: SnakeState): boolean {
  return state.over;
}
