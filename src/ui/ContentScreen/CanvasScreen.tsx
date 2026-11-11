import { memo, useEffect, useMemo, useRef } from 'react';

import { drawLcd, lcdSize } from './draw-lcd';
import type { LcdRendererProps } from './types';

/**
 * CanvasScreen —— 主点阵的 Canvas 2D 渲染器
 *
 * 订阅 L3 Screen 的变化后全量重绘（10×20 = 200 格，开销可忽略；Screen 的
 * batch 保证一次 render 只重绘一遍）。绘制逻辑在 drawLcd 纯函数里，小游戏
 * Shell 可直接复用。本组件只读屏幕状态，不写。
 */
function CanvasScreenImpl({
  screen,
  cellSize,
  innerSize,
  outerStroke,
  colGap,
  rowGap,
  onColor,
  offColor,
}: LcdRendererProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const style = useMemo(
    () => ({ cellSize, innerSize, outerStroke, colGap, rowGap, onColor, offColor }),
    [cellSize, innerSize, outerStroke, colGap, rowGap, onColor, offColor]
  );
  const size = lcdSize(screen.width, screen.height, style);

  // 位图按 devicePixelRatio 放大、CSS 尺寸保持逻辑像素，否则高分屏上格子边缘发虚。
  // 只在重渲染时重新读取：浏览器缩放 / 窗口跨屏后要等下次重渲染才生效
  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    // 改 width / height 属性会重置变换，所以每次 effect 都重新设一遍
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const draw = (): void => {
      drawLcd(context, screen, style);
    };
    draw();
    return screen.subscribe(draw);
  }, [screen, style, dpr, size.width, size.height]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(size.width * dpr)}
      height={Math.round(size.height * dpr)}
      style={{ display: 'block', width: size.width, height: size.height }}
    />
  );
}

export const CanvasScreen = memo(CanvasScreenImpl);
