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
/** 爆炸阶段总帧数：30 帧（按 App 的 ANIM_TICK_SPEED=30 即 1s）*/
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

  // level > 1：在场地边缘放障碍砖，数量随 level 递增
  const level = opts?.level ?? 1;
  const obstacles = generateObstacles(env, level, width, height, body);

  const food = randomFood(env, body, obstacles) ?? [0, 0];
  return {
    body,
    obstacles,
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
    skipNextTick: false,
  };
}

/**
 * 根据 level 在场地上生成障碍砖。
 *
 * level 1 无障碍；level 2~9 在场地四周（避开蛇初始位置附近）随机放砖，
 * 数量 = (level-1) * 4。用 rng 保证确定性
 */
function generateObstacles(
  env: GameEnv,
  level: number,
  width: number,
  height: number,
  body: ReadonlyArray<Pixel>
): ReadonlyArray<Pixel> {
  if (level <= 1) return [];
  const count = (level - 1) * 4;
  const bodySet = new Set(body.map(([x, y]) => `${x},${y}`));
  // 蛇头附近 3 格内不放障碍，给玩家反应空间
  const head = body[0];
  const safeZone = (x: number, y: number): boolean =>
    !!head && Math.abs(x - head[0]) <= 3 && Math.abs(y - head[1]) <= 3;

  const result: Pixel[] = [];
  const placed = new Set<string>();
  let attempts = 0;
  while (result.length < count && attempts < count * 10) {
    attempts++;
    const x = Math.floor(env.rng() * width);
    const y = Math.floor(env.rng() * height);
    const key = `${x},${y}`;
    if (bodySet.has(key) || placed.has(key) || safeZone(x, y)) continue;
    placed.add(key);
    result.push([x, y]);
  }
  return result;
}

/** 把死亡瞬间屏幕亮点收集为不可变快照（body + food）；food=null 时跳过食物点 */
function makeCrashSnapshot(
  body: ReadonlyArray<Pixel>,
  food: Pixel | null,
  obstacles: ReadonlyArray<Pixel> = []
): ReadonlyArray<Pixel> {
  const snapshot: Pixel[] = [
    ...obstacles.map(([x, y]): Pixel => [x, y]),
    ...body.map(([x, y]): Pixel => [x, y]),
  ];
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

  // 按键即走的补偿：onButton 已经手动推进一格，跳过这次自然 tick
  if (state.skipNextTick) {
    return { ...state, skipNextTick: false };
  }

  return advance(env, state);
}

/**
 * 把蛇沿 pendingDir 推进一格 + 处理墙 / 自撞 / 吃食物 / 通关。
 *
 * 抽出这个函数让 step（ticker tick 触发）和 onButton（按键即走）共享同一段
 * 移动 + 碰撞 + 食物逻辑，避免在两处重复实现。所有副作用（env.score.set /
 * env.sound.play）都集中在这里
 */
function advance(env: GameEnv, state: SnakeState): SnakeState {
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
      crashSnapshot: makeCrashSnapshot(state.body, state.food, state.obstacles),
    };
  }

  // 撞障碍砖
  for (const [ox, oy] of state.obstacles) {
    if (nx === ox && ny === oy) {
      env.sound.play('over');
      return {
        ...state,
        dir,
        over: true,
        overFrame: 0,
        crashCenter: clampCrashCenter([nx, ny], width, height),
        crashSnapshot: makeCrashSnapshot(state.body, state.food, state.obstacles),
      };
    }
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
        crashSnapshot: makeCrashSnapshot(newBody, state.food, state.obstacles),
      };
    }
  }

  if (ate) {
    const newScore = state.score + 1;
    env.score.set(newScore);
    const newFood = randomFood(env, newBody, state.obstacles);
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
        crashSnapshot: makeCrashSnapshot(newBody, null, state.obstacles),
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
    for (const [x, y] of state.obstacles) screen.setPixel(x, y, true);
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

/** 把 Button 翻译成 Direction；非方向键返回 null */
function buttonToDir(btn: Button): Direction | null {
  switch (btn) {
    case 'Up':
      return 'up';
    case 'Down':
      return 'down';
    case 'Left':
      return 'left';
    case 'Right':
      return 'right';
    default:
      return null;
  }
}

export function onButton(
  env: GameEnv,
  state: SnakeState,
  btn: Button,
  action: ButtonAction
): SnakeState {
  if (state.over) return state;

  switch (action) {
    case 'release':
      // 方向键松开后清 skipNextTick：长按期间最后一次 repeat 留下了 skipNextTick=true，
      // 如果不清，松开后第一次自然 ticker tick 会被跳过 → 玩家感觉"松开后停顿一拍才走"
      return state.skipNextTick ? { ...state, skipNextTick: false } : state;
    case 'press':
    case 'repeat':
      break;
  }

  const nextDir = buttonToDir(btn);

  // 等待启动：仅 press 解除等待，repeat 状态下还停在初始姿态没意义
  if (state.awaitingFirstMove) {
    if (action !== 'press') return state;
    if (nextDir && isOpposite(state.dir, nextDir)) return state;
    return {
      ...state,
      awaitingFirstMove: false,
      pendingDir: nextDir ?? state.pendingDir,
      dir: nextDir ?? state.dir,
    };
  }

  // 按键即走：press 和 repeat 都触发"沿目标方向走一格"。Brick-Game 真机
  // 的 Rotate (A) 在 Snake 里等价于"沿当前方向走一步"，所以也走这条路径
  switch (btn) {
    case 'Up':
    case 'Down':
    case 'Left':
    case 'Right': {
      if (!nextDir || isOpposite(state.dir, nextDir)) return state;
      const turned: SnakeState = { ...state, pendingDir: nextDir };
      const moved = advance(env, turned);
      if (moved.over) return moved;
      return { ...moved, skipNextTick: true };
    }
    case 'A': {
      const moved = advance(env, state);
      if (moved.over) return moved;
      return { ...moved, skipNextTick: true };
    }
    default:
      return state;
  }
}

export function isGameOver(state: SnakeState): boolean {
  return state.over;
}
