import type { Button } from '@/engine/types';
import type { Game, GameEnv } from '@/sdk';

import { init, isAnimating, isGameOver, onButton, render, step } from './logic';
import { tankPreview } from './preview';
import { type Direction, type TankState, TICK_HZ } from './state';

/** demo AI 每隔多少帧做一次决策；30Hz 下约 0.2s 一次，看起来不至于抽搐 */
const DEMO_THINK_FRAMES = 6;

function dirButton(d: Direction): Button {
  switch (d) {
    case 'up':
      return 'Up';
    case 'down':
      return 'Down';
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
  }
}

/**
 * Demo AI：找最近的敌军，先挪到同一行 / 列，再转向开火。
 * 返回 null 表示这一拍什么都不做
 */
function demoDecide(state: TankState): Button | null {
  const p = state.player;
  if (!p) return null;
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  if (!best) return null;
  const dx = best.x - p.x;
  const dy = best.y - p.y;

  let want: Direction;
  if (dx === 0) want = dy < 0 ? 'up' : 'down';
  else if (dy === 0) want = dx < 0 ? 'left' : 'right';
  else if (Math.abs(dx) <= Math.abs(dy)) want = dx < 0 ? 'left' : 'right';
  else want = dy < 0 ? 'up' : 'down';

  const aligned = dx === 0 || dy === 0;
  if (aligned && p.dir === want) return 'A';
  return dirButton(want);
}

/** 用 press + release 模拟一次点按，避免"按住"状态在 demo 里残留 */
function tap(env: GameEnv, state: TankState, btn: Button): TankState {
  return onButton(env, onButton(env, state, btn, 'press'), btn, 'release');
}

export const tank: Game<TankState> = {
  id: 'tank',
  name: 'TANK',
  preview: tankPreview,
  // 各实体节奏由游戏内毫秒累加器折算，ticker 固定跑逻辑帧率即可，与 speed 档无关
  tickSpeed: TICK_HZ,
  init,
  step,
  render,
  onButton,
  isGameOver,
  isAnimating,

  demoInit(env: GameEnv): TankState {
    return { ...init(env), phase: 'playing' };
  },

  demoStep(env: GameEnv, state: TankState): TankState {
    // demo 小屏放不下 Boss 战，打到 Boss 或 game over 都直接重开
    if (state.phase === 'over' || state.boss) return { ...init(env), phase: 'playing' };
    if (state.phase === 'playing' && state.frame % DEMO_THINK_FRAMES === 0) {
      const btn = demoDecide(state);
      if (btn) return step(env, tap(env, state, btn));
    }
    return step(env, state);
  },
};
