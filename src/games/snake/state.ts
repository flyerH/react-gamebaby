import type { GameEnv, Pixel } from '@/sdk';

/** 贪吃蛇的四个方向；用联合字面量避免 enum */
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface SnakeState {
  /** 蛇身坐标，body[0] 是头，length ≥ 1 */
  readonly body: ReadonlyArray<Pixel>;
  /** 当前已生效方向 */
  readonly dir: Direction;
  /** 等待下一 tick 应用的方向；避免一个 tick 内连按两次导致反向 */
  readonly pendingDir: Direction;
  /** 食物坐标；null 表示棋盘已被身体填满（极限通关），不再有空格放食物 */
  readonly food: Pixel | null;
  /** 是否已死亡（撞墙 / 撞自身 / 通关填满都视为本局结束） */
  readonly over: boolean;
  /** 是否通关（蛇身长 = W*H 时由 step 设置）；与 over 同时为 true 表示胜利型结束 */
  readonly won: boolean;
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
export function randomFood(env: GameEnv, body: ReadonlyArray<Pixel>): Pixel | null {
  const { width, height } = env.screen;
  const occupied = new Set<string>();
  for (const [x, y] of body) occupied.add(`${x},${y}`);
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
