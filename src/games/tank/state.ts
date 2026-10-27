import type { GameInitOptions, Pixel } from '@/sdk';

/**
 * 坦克大战：消灭 50 辆敌军坦克后迎战 Boss，击毁 Boss 后难度提升进入下一轮。
 *
 * 坐标与 Screen 一致：x 向右、y 向下。
 */

/** 坦克 / 子弹朝向；用联合字面量避免 enum */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * 局内阶段
 *
 * - ready     首帧静止，等玩家按键开局（与 Snake / Tetris 一致）
 * - playing   正常对战（打满 50 辆后同一阶段内切到 Boss 战，由 boss !== null 区分）
 * - dying     玩家被击中：场面冻结 + 爆炸闪烁（1.2s）
 * - continue  还有命：落幕动画（自底向上填满再自顶向下清空），结束后同关重开
 * - bossDown  Boss 被击毁：5×5 爆炸闪烁（1.5s）
 * - levelUp   通关落幕动画，结束后 level / speed 交替 +1 开下一轮
 * - over      命耗尽：落幕动画，结束后自动回到 ready
 */
export type Phase = 'ready' | 'playing' | 'dying' | 'continue' | 'bossDown' | 'levelUp' | 'over';

export type BulletOwner = 'player' | 'enemy';

/** 3×3 坦克：(x, y) 是中心格 */
export interface PlayerTank {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
  /** Boss 战专用形态：只能左右平移、炮口恒朝上 */
  readonly horizontal: boolean;
}

export interface EnemyTank {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
  /** 移动累计时间（ms），满 enemyMoveMs 走一拍 */
  readonly moveAcc: number;
  /** 距下一次开火的剩余时间（ms），到 0 开火并重新随机 1~3s */
  readonly fireIn: number;
  /** 待执行的方向队列；空了就重新规划（随机游走 / 追踪玩家） */
  readonly plan: ReadonlyArray<Direction>;
}

/** 7×7 Boss：(x, y) 是中心格，炮口在 (x, y + 3) 朝下 */
export interface BossTank {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly moveAcc: number;
  readonly fireAcc: number;
  readonly plan: ReadonlyArray<'left' | 'right'>;
}

export interface Bullet {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
  readonly owner: BulletOwner;
  /** 移动累计时间（ms）；玩家 / 敌方子弹速度不同，各自累计 */
  readonly acc: number;
}

export interface TankState {
  readonly width: number;
  readonly height: number;
  readonly phase: Phase;
  /** 当前动画阶段已播放的帧数；非动画阶段恒为 0 */
  readonly phaseFrame: number;
  /** playing 阶段累计帧数，给 demo AI 节流用 */
  readonly frame: number;

  /** dying 阶段玩家坦克已被移除，为 null */
  readonly player: PlayerTank | null;
  readonly enemies: ReadonlyArray<EnemyTank>;
  readonly boss: BossTank | null;
  readonly bullets: ReadonlyArray<Bullet>;
  /** 爆炸动画中心（dying / bossDown 用）；其它阶段为 null */
  readonly explosion: Pixel | null;

  /** 延迟出生队列：每项是剩余等待时间（ms），到 0 且有空位时出生一辆敌军 */
  readonly spawnTimers: ReadonlyArray<number>;
  /** 本轮已出生敌军数（上限 TOTAL_ENEMIES） */
  readonly spawned: number;
  /** 本轮已击毁敌军数；到 TOTAL_ENEMIES 进入 Boss 战 */
  readonly kills: number;
  readonly nextEnemyId: number;

  readonly score: number;
  readonly lives: number;
  /** 局内实际难度；通关 Boss 后会交替 +1，与菜单初值脱钩 */
  readonly level: number;
  readonly speed: number;
  /** 上次升的是 level 则下次升 speed，交替进行 */
  readonly levelIsUp: boolean;

  /** 当前按住的方向键；按下立即走一步，之后每 PLAYER_MOVE_MS 再走一步 */
  readonly heldDir: Direction | null;
  readonly moveAcc: number;
  /** 开火键是否按住；按住期间每 FIRE_WAIT_MS 连发 */
  readonly fireHeld: boolean;
  readonly fireAcc: number;
  /** 距上一发子弹的时间（ms），小于 FIRE_WAIT_MS 不允许再发 */
  readonly sinceShot: number;

  readonly lastOpts: GameInitOptions | null;
}

/** 固定逻辑帧率；各实体按毫秒累加器折算自己的节奏，和 App 的动画帧率一致 */
export const TICK_HZ = 30;
export const FRAME_MS = 1000 / TICK_HZ;

export const TOTAL_ENEMIES = 50;
export const MAX_ALIVE_ENEMIES = 4;
export const START_LIVES = 4;
export const LEVEL_MAX = 9;
export const SPEED_MAX = 9;

export const PLAYER_MOVE_MS = 130;
export const PLAYER_BULLET_MS = 35;
export const FIRE_WAIT_MS = 300;
export const BOSS_FIRE_MS = 1000;
export const RESPAWN_DELAY_MS = 2000;
/** 新出生的敌军与其它坦克（含玩家）中心之间的最小间距 */
export const SPAWN_MIN_DISTANCE = 3;

/** 敌军每走一拍的间隔：0.4 − 0.03 × (speed − 1) 秒 */
export function enemyMoveMs(speed: number): number {
  return (0.4 - 0.03 * (speed - 1)) * 1000;
}

/** 敌军子弹每前进一格的间隔：0.07 − 0.0039 × (speed − 1) 秒 */
export function enemyBulletMs(speed: number): number {
  return (0.07 - 0.0039 * (speed - 1)) * 1000;
}

/** 每击毁一辆坦克 / 命中 Boss 一次的得分 */
export function killScore(level: number, speed: number): number {
  return (level + speed) * 50;
}

/** Boss 血量 */
export function bossHp(level: number, speed: number): number {
  return level + speed;
}

/* ------------------------------------------------------------------ *
 * 形状（朝上时相对中心的偏移，y 向下）
 * ------------------------------------------------------------------ */

/** 玩家坦克 .#. / ### / ###（实心车身） */
const PLAYER_SHAPE: ReadonlyArray<Pixel> = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** 敌军坦克 .#. / ### / #.#（履带中间镂空，和玩家区分） */
const ENEMY_SHAPE: ReadonlyArray<Pixel> = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [1, 1],
];

/** Boss 7×7，最底行中间一格是炮口 */
const BOSS_ROWS: ReadonlyArray<string> = [
  '##.#.##',
  '..###..',
  '###.###',
  '..#.#..',
  '.#.#.#.',
  '#.###.#',
  '...#...',
];

export const BOSS_SHAPE: ReadonlyArray<Pixel> = BOSS_ROWS.flatMap((row, ry) =>
  [...row].flatMap((ch, rx): Pixel[] => (ch === '#' ? [[rx - 3, ry - 3]] : []))
);

/** Boss 半宽 / 半高；中心 x 只能在 [BOSS_HALF, W-1-BOSS_HALF] 之间平移 */
export const BOSS_HALF = 3;

/** 坦克爆炸 4×4：覆盖整辆 3×3 坦克，并向右、向下各多出一格 */
export const TANK_EXPLOSION: ReadonlyArray<Pixel> = [-1, 0, 1, 2].flatMap((dy) =>
  [-1, 0, 1, 2].map((dx): Pixel => [dx, dy])
);

/** Boss 爆炸 5×5 */
export const BOSS_EXPLOSION: ReadonlyArray<Pixel> = [-2, -1, 0, 1, 2].flatMap((dy) =>
  [-2, -1, 0, 1, 2].map((dx): Pixel => [dx, dy])
);

export const DIRECTIONS: ReadonlyArray<Direction> = ['up', 'right', 'down', 'left'];

const DIR_VEC: Readonly<Record<Direction, Pixel>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function dirVec(d: Direction): Pixel {
  return DIR_VEC[d];
}

/** 把"朝上"的偏移旋转到目标朝向（顺时针）；用 0 - v 而不是 -v，避免产生 -0 */
function rotate([dx, dy]: Pixel, dir: Direction): Pixel {
  switch (dir) {
    case 'up':
      return [dx, dy];
    case 'right':
      return [0 - dy, dx];
    case 'down':
      return [0 - dx, 0 - dy];
    case 'left':
      return [dy, 0 - dx];
  }
}

function shapeCells(
  shape: ReadonlyArray<Pixel>,
  x: number,
  y: number,
  dir: Direction
): ReadonlyArray<Pixel> {
  return shape.map((o): Pixel => {
    const [dx, dy] = rotate(o, dir);
    return [x + dx, y + dy];
  });
}

export function playerCells(t: { x: number; y: number; dir: Direction }): ReadonlyArray<Pixel> {
  return shapeCells(PLAYER_SHAPE, t.x, t.y, t.dir);
}

export function enemyCells(t: { x: number; y: number; dir: Direction }): ReadonlyArray<Pixel> {
  return shapeCells(ENEMY_SHAPE, t.x, t.y, t.dir);
}

export function bossCells(b: { x: number; y: number }): ReadonlyArray<Pixel> {
  return shapeCells(BOSS_SHAPE, b.x, b.y, 'up');
}

/** 炮口格：坦克中心沿朝向 1 格；子弹从这里出膛后先走一格 */
export function muzzle(t: { x: number; y: number; dir: Direction }): Pixel {
  const [dx, dy] = dirVec(t.dir);
  return [t.x + dx, t.y + dy];
}

export function inside(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** 玩家初始位置：水平居中偏左、垂直居中偏下（10×20 屏上是 (4, 10)） */
export function playerSpawn(width: number, height: number): Pixel {
  const ux = Math.floor((width - 1) / 2);
  const uy = Math.floor((height - 1) / 2);
  return [ux, height - 1 - uy];
}

/** 敌军出生点共 6 个：四角 + 左右两侧与玩家同高处 */
export function enemySpawnPoints(width: number, height: number): ReadonlyArray<Pixel> {
  const left = 1;
  const right = width - 2;
  const top = 1;
  const bottom = height - 2;
  const [, midY] = playerSpawn(width, height);
  return [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
    [left, midY],
    [right, midY],
  ];
}

/** Boss 出生点：顶部居中，占满最上面 7 行 */
export function bossSpawn(width: number): Pixel {
  return [Math.floor(width / 2), BOSS_HALF];
}

/** [min, maxExclusive) 区间内的随机整数 */
export function randInt(rng: () => number, min: number, maxExclusive: number): number {
  return min + Math.floor(rng() * (maxExclusive - min));
}

/** [min, max) 区间内的随机浮点数 */
export function randFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
