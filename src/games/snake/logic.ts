import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions, Pixel } from '@/sdk';

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
/** 清屏阶段帧数：从顶部一行行往下消除已填满的整屏，同样 20 帧 */
const CRASH_CLEAR_FRAMES = 20;
/** 爆炸 + 填屏阶段结束、清屏阶段开始的帧号 */
const CRASH_CLEAR_BEGIN = CRASH_PAINT_FRAMES + CRASH_FILL_FRAMES;
/** 整段死亡动画总帧数：爆炸 30 + 填屏 20 + 清屏 20 = 70 */
const CRASH_TOTAL_FRAMES = CRASH_CLEAR_BEGIN + CRASH_CLEAR_FRAMES;

/** 把死亡点 clamp 到 [2, W-3] × [2, H-3]，让 5×5 爆炸图案完整在屏内 */
function clampCrashCenter(raw: Pixel, width: number, height: number): Pixel {
  const cx = Math.max(2, Math.min(width - 3, raw[0]));
  const cy = Math.max(2, Math.min(height - 3, raw[1]));
  return [cx, cy];
}

/**
 * 初始状态：蛇放在屏幕水平中线偏左，朝右，长度 3
 *
 * opts 由 App 在进 playing 时传入（菜单选定的 speed / level）；存进
 * state.lastOpts 让死亡动画后的自动重开能继承同一档位，不至于刷新成 1/1。
 * 同时把 env.score 清零，和 SidePanel 订阅的 Counter 对齐。
 */
export function init(env: GameEnv, opts?: GameInitOptions): SnakeState {
  const { width, height } = env.screen;
  const cy = Math.floor(height / 2);
  const startX = Math.floor(width / 2);
  const body: ReadonlyArray<Pixel> = Array.from(
    { length: INITIAL_LENGTH },
    (_, i): Pixel => [startX - i, cy]
  );
  env.score.set(0);

  // body 长度 < W*H 时 randomFood 必有解；用 ?? 兜底防极端 1×1 屏幕
  const food = randomFood(env, body) ?? [0, 0];
  return {
    body,
    dir: 'right',
    pendingDir: 'right',
    food,
    over: false,
    won: false,
    overFrame: 0,
    crashCenter: [0, 0],
    crashSnapshot: [],
    awaitingFirstMove: true,
    score: 0,
    lastOpts: opts ?? null,
  };
}

/** 把死亡瞬间屏幕亮点收集为不可变快照（body + food）；food=null 时跳过食物点 */
function makeCrashSnapshot(body: ReadonlyArray<Pixel>, food: Pixel | null): ReadonlyArray<Pixel> {
  const snapshot: Pixel[] = body.map(([x, y]): Pixel => [x, y]);
  if (food) snapshot.push([food[0], food[1]]);
  return snapshot;
}

export function step(env: GameEnv, state: SnakeState): SnakeState {
  // 已结束：动画播放期间推进 overFrame；
  // 整段动画（爆炸 + 填屏 + 清屏）播完时，step 自动开新一局并停在
  // awaitingFirstMove —— 玩家按任意键确认才开始动
  if (state.over) {
    if (state.overFrame >= CRASH_TOTAL_FRAMES) {
      // 用上次的 opts 重开，保住菜单选定的 speed / level
      return init(env, state.lastOpts ?? undefined);
    }
    return { ...state, overFrame: state.overFrame + 1 };
  }
  // 等待玩家按键启动：step 不推进蛇，画面静止在初始姿态
  if (state.awaitingFirstMove) return state;

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

  const ate = state.food !== null && nx === state.food[0] && ny === state.food[1];
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
    const newFood = randomFood(env, newBody);
    if (newFood === null) {
      // 通关：蛇身已填满整个屏幕，无空格再放食物。复用死亡动画，但标记 won=true
      // 让 isGameOver 一致返回 true、上层可在未来差异化呈现"胜利"画面
      return {
        ...state,
        body: newBody,
        dir,
        food: null,
        score: newScore,
        over: true,
        won: true,
        overFrame: 0,
        crashCenter: clampCrashCenter([nx, ny], width, height),
        crashSnapshot: makeCrashSnapshot(newBody, null),
      };
    }
    return {
      ...state,
      body: newBody,
      dir,
      food: newFood,
      score: newScore,
    };
  }

  // 普通移动不再出声 —— 真机蜂鸣器只在按键 / 事件（吃食物 / 死亡）发声，
  // 不会每个 tick "嘀"一下。按键音改放到 onButton 里
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
    if (state.food) screen.setPixel(state.food[0], state.food[1], true);
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
  if (overFrame < CRASH_CLEAR_BEGIN) {
    for (const [x, y] of crashSnapshot) {
      if (!inCrashSquare(x, y, crashCenter)) screen.setPixel(x, y, true);
    }
    const filled = Math.min(CRASH_FILL_FRAMES, overFrame - CRASH_PAINT_FRAMES + 1);
    const fillFrom = height - filled;
    for (let y = fillFrom; y < height; y++) {
      for (let x = 0; x < width; x++) screen.setPixel(x, y, true);
    }
    return;
  }

  // 阶段 3（清屏）：从顶部一行行往下消除"已被填亮的整屏"。
  // 进入这阶段时整屏全亮（snapshot 已被覆盖），不需要再画 snapshot；
  // 只画 cleared 行往下的部分，让顶部空出。
  const cleared = Math.min(CRASH_CLEAR_FRAMES, overFrame - CRASH_CLEAR_BEGIN + 1);
  for (let y = cleared; y < height; y++) {
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

  // 等待启动：任意 press 解除等待。方向键同时改向（反向键被拒，不解除等待，
  // 让玩家有机会再按一次正向键）。按键反馈音由 App 层统一发，这里不重复 play
  if (state.awaitingFirstMove) {
    if (nextDir && isOpposite(state.dir, nextDir)) return state;
    return {
      ...state,
      awaitingFirstMove: false,
      pendingDir: nextDir ?? state.pendingDir,
      dir: nextDir ?? state.dir,
    };
  }

  if (!nextDir) return state;
  if (isOpposite(state.dir, nextDir)) return state;
  return { ...state, pendingDir: nextDir };
}

export function isGameOver(state: SnakeState): boolean {
  return state.over;
}
