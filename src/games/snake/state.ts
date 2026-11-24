import type { GameEnv, GameInitOptions, Pixel } from '@/sdk';

/** 贪吃蛇的四个方向；用联合字面量避免 enum */
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface SnakeState {
  /** 蛇身坐标，body[0] 是头，length ≥ 1 */
  readonly body: ReadonlyArray<Pixel>;
  /** level > 1 时场地上的障碍砖；蛇撞到视同撞墙 */
  readonly obstacles: ReadonlyArray<Pixel>;
  /** 当前方向；方向键按下立即生效并走一格，因此不需要单独的待生效方向 */
  readonly dir: Direction;
  /** 食物坐标；null 表示棋盘已被身体填满（极限通关），不再有空格放食物 */
  readonly food: Pixel | null;
  /** 是否已死亡（撞墙 / 撞自身 / 通关填满都视为本局结束） */
  readonly over: boolean;
  /** 是否通关（蛇身长 = W*H 时由 step 设置）；与 over 同时为 true 表示胜利型结束 */
  readonly won: boolean;
  /**
   * 等待玩家首次按键再开始推进。
   *
   * - 进入新局（init）时为 true：蛇放好但不动，玩家按方向键确认启动
   * - 任何 press 输入会清掉这个标志（方向键还会同时改向）
   * - step 在 awaitingFirstMove=true 时直接返回原 state，不推进蛇
   *
   * 与 over 配合：死亡动画播完 + 清屏后 step 自动返回新一局 init state，
   * awaitingFirstMove=true，让玩家重开后的第一动是自己按下，不会"还没看清就开跑"。
   */
  readonly awaitingFirstMove: boolean;
  /**
   * game over 后每 tick +1，驱动死亡动画相位。
   * 未结束时恒为 0；App 层据此区分"结束态"来切 Ticker 到动画速度。
   */
  readonly overFrame: number;
  /**
   * 死亡爆炸中心；over=false 时无意义（占位 [0,0]）。
   *
   * 已 clamp 到 [2, W-3] × [2, H-3]：贴边死亡时若不 clamp，5×5
   * 爆炸图案有半边越屏丢失，clamp 保证整张图案完整在屏内。
   */
  readonly crashCenter: Pixel;
  /**
   * 死亡瞬间屏幕上所有亮点的快照（不可变）；over=false 时为空。
   *
   * 死亡动画第一阶段保留这些亮点（5×5 爆炸区域内除外），第二阶段
   * 从底部一行行往上覆盖填亮，最终全屏点亮。
   */
  readonly crashSnapshot: ReadonlyArray<Pixel>;
  /** 本局分数 */
  readonly score: number;
  /**
   * 最近一次进入本游戏时菜单选定的 speed / level（来自 GameInitOptions）。
   *
   * 死亡动画播完后 step 自动重开新一局会再调一次 init，要把当前难度
   * "原样传回"避免重置成默认 1/1。null 表示从未传入 opts（极少数场景）。
   */
  readonly lastOpts: GameInitOptions | null;
  /**
   * 距上一次走格累计的毫秒数，满 moveIntervalMs 自然走一格。
   *
   * 按键触发的立即走格会让它从 KEY_TIMER_START 重新计时，下一次自然走格在一个完整间隔之后，
   * 不会出现按键刚走完、自然节拍紧接着又走一格的情况。
   */
  readonly moveAcc: number;
  /** 自然走格间隔（ms），由 speed 档决定 */
  readonly moveIntervalMs: number;
}

/** 固定 30 帧/秒推进，和 App 的动画帧率一致；走格快慢由 moveIntervalMs 决定 */
export const SNAKE_TICK_HZ = 30;
export const FRAME_MS = 1000 / SNAKE_TICK_HZ;
/** 按键启动的计时起点，原因见 sdk Game.onButton */
export const KEY_TIMER_START = -FRAME_MS;

/**
 * 9 档自然走格频率（格/秒），index 与 speed-1 对应。
 *
 * speed=2（1.5）保留接近旧版本默认手感作为基线；档位间不是等差也不是
 * 等比：低档段 +25%~50% 步进，高档段 +30%~50%（专家档逐档明显加快）。
 * speed=9（10 格/秒 = 100ms）为最快档
 */
const MOVES_PER_SECOND: readonly number[] = [1, 1.5, 2, 2.5, 3.5, 4.5, 6, 8, 10];

/** speed 档对应的自然走格间隔（ms）；越界档位钳到首末档 */
export function moveIntervalMs(speed: number): number {
  const idx = Math.min(MOVES_PER_SECOND.length, Math.max(1, speed)) - 1;
  return 1000 / (MOVES_PER_SECOND[idx] ?? 1);
}

/**
 * 下一次 step 是否会自然走一格。
 *
 * 自动玩按 tick 注入按键，只在这一帧出手，才能保持每个间隔走一格的节奏；
 * 否则每帧都按方向键会让蛇以帧率连续前进。
 */
export function isMoveDue(state: SnakeState): boolean {
  if (state.over || state.awaitingFirstMove) return false;
  return reached(state.moveAcc + FRAME_MS, state.moveIntervalMs);
}

/**
 * 累计时间是否达到间隔。FRAME_MS 不是整数，3 帧累加得到 99.999…，
 * 直接比较会让 100ms 的间隔多等一帧，所以留一个微小容差
 */
export function reached(acc: number, interval: number): boolean {
  return acc >= interval - 1e-6;
}

const DIR_VEC: Readonly<Record<Direction, Pixel>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function dirVec(d: Direction): Pixel {
  return DIR_VEC[d];
}

export function isOpposite(a: Direction, b: Direction): boolean {
  return OPPOSITE[a] === b;
}

/**
 * 在 body 之外的空格随机挑一格放食物
 *
 * 用 RNG 驱动（env.rng 是可播种 PRNG，便于回放 / RL）；如果屏幕已
 * 被 body 填满则返回 null（极限通关场景，App 可据此判终局）。
 */
export function randomFood(
  env: GameEnv,
  body: ReadonlyArray<Pixel>,
  obstacles: ReadonlyArray<Pixel> = []
): Pixel | null {
  const { width, height } = env.screen;
  const occupied = new Set<string>();
  for (const [x, y] of body) occupied.add(`${x},${y}`);
  for (const [x, y] of obstacles) occupied.add(`${x},${y}`);
  const total = width * height;
  if (occupied.size >= total) return null;

  // 在剩余空格里按均匀采样：随机取一个空位的 index
  const emptyCount = total - occupied.size;
  const target = Math.floor(env.rng() * emptyCount);
  let seen = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (occupied.has(`${x},${y}`)) continue;
      if (seen === target) return [x, y];
      seen++;
    }
  }
  return null;
}
