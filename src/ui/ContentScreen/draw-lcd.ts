import type { Screen } from '@/engine/types';

/** LCD 单格的几何与配色，单位为 CSS px */
export interface LcdStyle {
  /** 单格总边长 */
  readonly cellSize: number;
  /** 单格内部方块边长 */
  readonly innerSize: number;
  /** 外框线宽 */
  readonly outerStroke: number;
  /** 列间距 */
  readonly colGap: number;
  /** 行间距 */
  readonly rowGap: number;
  /** 点亮色 */
  readonly onColor: string;
  /** 熄灭色 —— LCD 阴影格视觉要求熄灭态也要画出 */
  readonly offColor: string;
}

/**
 * drawLcd 需要的最小 2D 绘图接口。
 *
 * 不直接用 DOM 的 CanvasRenderingContext2D，是为了让微信 / 抖音小游戏的
 * canvas context 也能按结构匹配、复用同一份绘制逻辑。strokeStyle / fillStyle
 * 声明成 unknown：浏览器侧类型是 string | CanvasGradient | CanvasPattern，
 * 这里只往里写字符串
 */
export interface LcdContext2D {
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** 点阵整体占用的逻辑尺寸（CSS px）；首尾格外侧不留间距 */
export function lcdSize(
  cols: number,
  rows: number,
  style: LcdStyle
): { readonly width: number; readonly height: number } {
  return {
    width: cols * style.cellSize + Math.max(0, cols - 1) * style.colGap,
    height: rows * style.cellSize + Math.max(0, rows - 1) * style.rowGap,
  };
}

/**
 * 把屏幕全量画成 LCD 阴影格：每格 = 外框 strokeRect + 居中内方块 fillRect，
 * 亮灭只是颜色不同。外框按线宽一半内缩，保证描边完整落在格子内部
 */
export function drawLcd(
  ctx: LcdContext2D,
  screen: Pick<Screen, 'width' | 'height' | 'getPixel'>,
  style: LcdStyle
): void {
  const { cellSize, innerSize, outerStroke, colGap, rowGap, onColor, offColor } = style;
  const size = lcdSize(screen.width, screen.height, style);
  const inset = (cellSize - innerSize) / 2;

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineWidth = outerStroke;

  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      const color = screen.getPixel(x, y) ? onColor : offColor;
      const px = x * (cellSize + colGap);
      const py = y * (cellSize + rowGap);

      ctx.strokeStyle = color;
      ctx.strokeRect(
        px + outerStroke / 2,
        py + outerStroke / 2,
        cellSize - outerStroke,
        cellSize - outerStroke
      );

      ctx.fillStyle = color;
      ctx.fillRect(px + inset, py + inset, innerSize, innerSize);
    }
  }
}
