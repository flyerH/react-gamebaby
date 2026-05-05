import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, Pixel } from '@/sdk';

import { type Direction, dirVec, isOpposite, randomFood, type SnakeState } from './state';

const INITIAL_LENGTH = 3;

/* ------------------------------------------------------------------ *
 * 死亡动画参数
 *
 * 两阶段：先在死亡点 5×5 区域循环显示三种爆炸图案；再从屏幕底部
 * 一行行向上把整屏覆盖填亮。爆炸中心做 clamp，避免贴边死亡时 5×5
 * 越屏。
 * ------------------------------------------------------------------ */

/** 三种爆炸图案，按 overFrame 切换；每图案显示 CRASH_PHASE_FRAMES 帧 */
const CRASH_STATES: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 0, 1],
  ],
];

/** 每个爆炸图案在屏幕上停留的 tick 数（<=1 视为每 tick 切图） */
const CRASH_PHASE_FRAMES = 2;
/** 爆炸阶段总帧数：30 帧（按 App 的 GAME_OVER_ANIM_SPEED=30 即 1s）*/
const CRASH_PAINT_FRAMES = 30;
/** 填屏阶段帧数：屏高 H=20，每帧填 1 行，共 20 帧 */
const CRASH_FILL_FRAMES = 20;
const CRASH_TOTAL_FRAMES = CRASH_PAINT_FRAMES + CRASH_FILL_FRAMES;

/** 把死亡点 clamp 到 [2, W-3] × [2, H-3]，让 5×5 爆炸图案完整在屏内 */
function clampCrashCenter(raw: Pixel, width: number, height: number): Pixel {
  const cx = Math.max(2, Math.min(width - 3, raw[0]));
  const cy = Math.max(2, Math.min(height - 3, raw[1]));
  return [cx, cy];
}

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
    overFrame: 0,
    crashCenter: [0, 0],
    crashSnapshot: [],
    score: 0,
  };
}

/** 把死亡瞬间屏幕亮点收集为不可变快照（body + food） */
function makeCrashSnapshot(body: ReadonlyArray<Pixel>, food: Pixel): ReadonlyArray<Pixel> {
  return [...body.map(([x, y]): Pixel => [x, y]), [food[0], food[1]] as Pixel];
}

export function step(env: GameEnv, state: SnakeState): SnakeState {
  // 已结束：动画播放期间推进 overFrame；播完后保持不变（停在最后一帧画面）
  // App 的 useEffect(state) 需要新引用才会重画，所以播放期间必须返回新对象。
  if (state.over) {
    if (state.overFrame >= CRASH_TOTAL_FRAMES) return state;
    return { ...state, overFrame: state.overFrame + 1 };
  }
  const head = state.body[0];
  if (!head) return state;

  const dir = state.pendingDir;
  const [dx, dy] = dirVec(dir);
  const nx = head[0] + dx;
  const ny = head[1] + dy;

  const { width, height } = env.screen;
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
    env.sound.play('over');
    // 撞墙：新头已经出屏，把"旧头"作为爆炸中心（视觉上贴墙位置最直观）
    return {
      ...state,
      dir,
      over: true,
      overFrame: 0,
      crashCenter: clampCrashCenter(head, width, height),
      crashSnapshot: makeCrashSnapshot(state.body, state.food),
    };
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
      return {
        ...state,
        dir,
        over: true,
        overFrame: 0,
        crashCenter: clampCrashCenter([nx, ny], width, height),
        // 新头压在身体上，snapshot 用 newBody 让爆炸覆盖最新形态
        crashSnapshot: makeCrashSnapshot(newBody, state.food),
      };
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

/** 判断 (x, y) 是否落在 crashCenter 周围 5×5 爆炸区域内 */
function inCrashSquare(x: number, y: number, center: Pixel): boolean {
  return Math.abs(x - center[0]) <= 2 && Math.abs(y - center[1]) <= 2;
}

export function render(env: GameEnv, state: SnakeState): void {
  const { screen } = env;
  screen.clear();

  if (!state.over) {
    for (const [x, y] of state.body) screen.setPixel(x, y, true);
    screen.setPixel(state.food[0], state.food[1], true);
    return;
  }

  const { overFrame, crashCenter, crashSnapshot } = state;
  const { width, height } = screen;

  // 阶段 1（爆炸）：snapshot 除 5×5 内的点 + 当前爆炸图案
  if (overFrame < CRASH_PAINT_FRAMES) {
    for (const [x, y] of crashSnapshot) {
      if (!inCrashSquare(x, y, crashCenter)) screen.setPixel(x, y, true);
    }
    const stateIdx = Math.floor(overFrame / CRASH_PHASE_FRAMES) % CRASH_STATES.length;
    const pattern = CRASH_STATES[stateIdx];
    if (!pattern) return;
    for (let dy = -2; dy <= 2; dy++) {
      const row = pattern[dy + 2];
      if (!row) continue;
      for (let dx = -2; dx <= 2; dx++) {
        if (row[dx + 2]) screen.setPixel(crashCenter[0] + dx, crashCenter[1] + dy, true);
      }
    }
    return;
  }

  // 阶段 2（填屏）：snapshot 排除 5×5 区域（让爆炸炸出的"洞"保留到填亮行
  // 覆盖过来），再从底向上叠加全亮行；如果先画完整 snapshot 会让爆炸结束
  // 那一瞬间蛇身突然"复原"，视觉断裂。
  for (const [x, y] of crashSnapshot) {
    if (!inCrashSquare(x, y, crashCenter)) screen.setPixel(x, y, true);
  }

  const filled = Math.min(CRASH_FILL_FRAMES, overFrame - CRASH_PAINT_FRAMES + 1);
  const fillFrom = height - filled;
  for (let y = fillFrom; y < height; y++) {
    for (let x = 0; x < width; x++) screen.setPixel(x, y, true);
  }
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
