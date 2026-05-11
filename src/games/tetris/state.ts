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
 * 场地宽 / 高：与 Screen 10×20 完全一致，方块直接落在屏上不必分图层。
 *
 * 真机 Brick Game 把"已锁定砖墙"画在 LCD 主屏，把"下一块预览"+ score
 * 放在右侧 SidePanel。我们的 SidePanel 暂不显示 next 预览（保持 PR
 * 体量），有需要再扩
 */
export const FIELD_WIDTH = 10;
export const FIELD_HEIGHT = 20;

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
 */
export interface TetrisState {
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
}

/**
 * 七种方块的四个旋转相位下的占格相对坐标
 *
 * 每个 PieceKind 是长度 4 的数组（旋转 0 / 90 / 180 / 270），每个相位是
 * 长度 4 的相对坐标数组（一个方块固定 4 格）。坐标基准是方块包围盒左上角，
 * x 向右 y 向下；具体数值参照 SRS 但因为我们不做踢墙（wallkick）所以不需
 * 要带 kicks 表
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
