import type { Pixel } from '@/sdk';

/**
 * Tetris 七种方块标识符（Standard Mapping）。Brick Game 不分颜色——LCD 单色，
 * 我们也只关心形状不关心颜色。
 */
export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 方块旋转相位 0..3，与 SRS（Super Rotation System）顺时针计数一致 */
export type Rotation = 0 | 1 | 2 | 3;

/**
 * 在场方块：种类 + 旋转相位 + 左上角锚点（场地坐标系，列 x、行 y）。
 *
 * 方块的实际占格通过 TETROMINOES[kind][rotation] 的相对偏移 + (x, y) 得到。
 * 这种"种类 + 旋转 + 坐标"三元组而非直接存绝对格列表的设计，能让旋转 /
 * 平移操作只改三个标量，不必为每一步重算 4 个绝对坐标
 */
export interface ActivePiece {
  readonly kind: PieceKind;
  readonly rotation: Rotation;
  readonly x: number;
  readonly y: number;
}

/**
 * 默认场地宽 / 高：与 Screen 10×20 完全一致。
 * init 时从 env.screen 取实际尺寸存进 state，支持 demo 用小屏幕
 */
export const FIELD_WIDTH: number = 10;
export const FIELD_HEIGHT: number = 20;

/**
 * Tetris 完整 state
 *
 * - grid：已锁定的"砖墙"，row-major 一维数组，0 = 空 / 1 = 砖
 * - active：当前正在下落的方块；null 表示游戏未启动 / 已结束 / 消行闪烁中
 * - next：下一块（让 spawn 时无延迟）
 * - awaitingFirstMove：首块停在出生位置，玩家按任意键才开始重力下落
 * - over：玩家堆到顶或 spawn 即撞 → true，进入死亡动画
 * - overFrame：death 动画相位计数（爆炸→填屏→清屏）
 * - clearingLines：本轮消行涉及到的行号（按 y 升序）。空 = 没在消行
 * - clearFrame：消行闪烁阶段的 tick 计数；CLEAR_BLINK_FRAMES 到期后真正消除
 * - score：消行数 × 分（单消 1 / 双消 3 / 三消 5 / Tetris 8）
 * - lines：累计消行数（玩家成长指标）
 * - lastOpts：菜单选定的 speed / level，用于死亡后自动重开时复用
 * - fallAcc / fallIntervalMs：自由下落计时，满间隔下落一格
 * - heldShift / heldDrop：左右键 / 下键的按住状态，由 step 驱动连发
 */
export interface TetrisState {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<number>;
  readonly active: ActivePiece | null;
  readonly next: PieceKind;
  readonly awaitingFirstMove: boolean;
  readonly over: boolean;
  readonly overFrame: number;
  readonly clearingLines: ReadonlyArray<number>;
  readonly clearFrame: number;
  readonly score: number;
  readonly lines: number;
  readonly lastOpts: { readonly speed: number; readonly level: number } | null;
  /** 距上一次下落累计的毫秒数；任何下落（自由下落或软降）都会清零 */
  readonly fallAcc: number;
  /** 自由下落间隔（ms），由 speed 档决定 */
  readonly fallIntervalMs: number;
  readonly heldShift: HeldShift | null;
  readonly heldDrop: HeldKey | null;
}

/** 按住中的键：heldMs 达到起始延迟后，按 repeatAcc 累计连发 */
export interface HeldKey {
  readonly heldMs: number;
  readonly repeatAcc: number;
}

export interface HeldShift extends HeldKey {
  readonly dir: -1 | 1;
}

/** 固定 30 帧/秒推进；下落与连发快慢由各自的毫秒间隔决定 */
export const TETRIS_TICK_HZ = 30;
export const FRAME_MS = 1000 / TETRIS_TICK_HZ;

/**
 * 9 档自由下落频率（格/秒），index 与 speed-1 对应。
 *
 * speed=1 1.5 格/秒 ≈ 670ms/格（新手友好），speed=9 12 格/秒 ≈ 83ms/格为最快档
 */
const FALLS_PER_SECOND: readonly number[] = [1.5, 2, 2.5, 3.5, 5, 7, 9, 10.5, 12];

/** speed 档对应的自由下落间隔（ms）；越界档位钳到首末档 */
export function fallIntervalMs(speed: number): number {
  const idx = Math.min(FALLS_PER_SECOND.length, Math.max(1, speed)) - 1;
  return 1000 / (FALLS_PER_SECOND[idx] ?? 1);
}

/**
 * 累计时间是否达到间隔。FRAME_MS 不是整数，帧长累加有浮点误差，
 * 直接比较会让恰好整数倍的间隔多等一帧，所以留一个微小容差
 */
export function reached(acc: number, interval: number): boolean {
  return acc >= interval - 1e-6;
}

/**
 * 各方块可用的旋转相位数：
 * O 不转；I / S / Z 只在相位 0、1 之间来回切换，避免转动时位置漂移；T / J / L 四个相位循环
 */
export const ROTATION_STATES: Readonly<Record<PieceKind, number>> = {
  I: 2,
  O: 1,
  T: 4,
  S: 2,
  Z: 2,
  J: 4,
  L: 4,
};

/**
 * 七种方块的四个旋转相位下的占格相对坐标
 *
 * 每个 PieceKind 是长度 4 的数组（旋转 0 / 90 / 180 / 270），每个相位是
 * 长度 4 的相对坐标数组（一个方块固定 4 格）。坐标基准是方块包围盒左上角，
 * x 向右 y 向下；具体数值参照 SRS。踢墙只做"越过左右墙时平移回界内"，
 * 不需要 SRS 的 kicks 表。I / S / Z 只用相位 0、1（见 ROTATION_STATES）
 */
export const TETROMINOES: Readonly<Record<PieceKind, ReadonlyArray<ReadonlyArray<Pixel>>>> = {
  // I：横躺 → 竖立 → 横躺（下半）→ 竖立（左半）。SRS 标准 4 行 4 列包围盒
  I: [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ],
  // O：2×2，四个相位相同
  O: [
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  ],
  // T：3×3 包围盒，中心十字加一只伸出的腿
  T: [
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  // S：之字（右上 - 左下）
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  // Z：之字（左上 - 右下）
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  // J：勾子向左
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  // L：勾子向右
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
};

const ALL_KINDS: ReadonlyArray<PieceKind> = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** 用可播种 RNG 抽一种方块；确定性回放要求所有随机来源走 ctx.rng */
export function pickKind(rng: () => number): PieceKind {
  const idx = Math.floor(rng() * ALL_KINDS.length);
  return ALL_KINDS[idx] ?? 'I';
}

/** 返回 (kind, rotation) 在场地上的绝对占格坐标，便于碰撞 / 渲染 */
export function pieceCells(piece: ActivePiece): ReadonlyArray<Pixel> {
  const shape = TETROMINOES[piece.kind][piece.rotation] ?? [];
  return shape.map(([dx, dy]): Pixel => [piece.x + dx, piece.y + dy]);
}

/** 给定锚点 + 旋转，检查该形态在场地是否合法（无越界 / 不压到已锁砖块） */
export function isValidPosition(
  grid: ReadonlyArray<number>,
  width: number,
  height: number,
  piece: ActivePiece
): boolean {
  for (const [x, y] of pieceCells(piece)) {
    // 左右底部越界都返回 false；y<0 是"方块上半部分在屏外"的合法过渡态
    // （spawn 时 y=-1 让方块从顶部滑入），既不算越界也无需检查 grid
    if (x < 0 || x >= width || y >= height) return false;
    if (y >= 0 && grid[y * width + x] === 1) return false;
  }
  return true;
}
