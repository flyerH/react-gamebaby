import { useEffect, useRef } from 'react';

import type { Screen } from '@/engine/types';

export interface ContentScreenProps {
  /** L3 framebuffer：组件订阅其变化并重绘，不主动改 buffer */
  screen: Screen;
  /** 单格总边长（CSS px），默认 19 —— 与真机 LCD 单格尺寸一致 */
  cellSize?: number;
  /** 单格内部方块边长，默认 11 */
  innerSize?: number;
  /** 外框线宽，默认 2 */
  outerStroke?: number;
  /** 列间距，默认 2 */
  colGap?: number;
  /** 行间距，默认 3 */
  rowGap?: number;
  /** 点亮色，默认纯黑 */
  onColor?: string;
  /** 熄灭色，默认半透明黑 —— LCD 阴影格视觉要求熄灭态也要画出 */
  offColor?: string;
}

/**
 * ContentScreen —— 主点阵的 Canvas 2D 渲染器
 *
 * LCD 阴影格像素风：每个格子都要画，点亮与熄灭只是颜色不同。
 * 单格构成：2px 外框 + 中心 11×11 方块，外围 cellSize=19。
 *
 * 订阅 L3 Screen 的变化后全量重绘（10×20 = 200 格，开销可忽略）。
 * 本组件只读屏幕状态，不写；像素变化通过 L3 API 发生。
 */
export function ContentScreen({
  screen,
  cellSize = 19,
  innerSize = 11,
  outerStroke = 2,
  colGap = 2,
  rowGap = 3,
  onColor = '#000',
  offColor = 'rgba(0, 0, 0, 0.3)',
}: ContentScreenProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const totalW = screen.width * cellSize + Math.max(0, screen.width - 1) * colGap;
  const totalH = screen.height * cellSize + Math.max(0, screen.height - 1) * rowGap;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const inset = (cellSize - innerSize) / 2;

    const draw = (): void => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (let y = 0; y < screen.height; y++) {
        for (let x = 0; x < screen.width; x++) {
          const lit = screen.getPixel(x, y);
          const color = lit ? onColor : offColor;
          const px = x * (cellSize + colGap);
          const py = y * (cellSize + rowGap);

          context.strokeStyle = color;
          context.lineWidth = outerStroke;
          context.strokeRect(
            px + outerStroke / 2,
            py + outerStroke / 2,
            cellSize - outerStroke,
            cellSize - outerStroke
          );

          context.fillStyle = color;
          context.fillRect(px + inset, py + inset, innerSize, innerSize);
        }
      }
    };

    draw();
    return screen.subscribe(draw);
  }, [screen, cellSize, innerSize, outerStroke, colGap, rowGap, onColor, offColor]);

  return <canvas ref={canvasRef} width={totalW} height={totalH} style={{ display: 'block' }} />;
}
