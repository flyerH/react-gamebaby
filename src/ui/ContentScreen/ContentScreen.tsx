import { useEffect, useRef } from 'react';

import type { Screen } from '@/engine/types';

export interface ContentScreenProps {
  /** L3 framebuffer：组件订阅其变化并重绘，不主动改 buffer */
  screen: Screen;
  /** 单个逻辑像素在屏幕上的边长（CSS px），默认 16 */
  pixelSize?: number;
  /** 亮像素颜色，默认接近纯黑——模拟 LCD 点亮色块 */
  onColor?: string;
  /** 熄像素 / 背景颜色，默认复古 LCD 底色 */
  offColor?: string;
}

/**
 * ContentScreen —— 主 20×10 点阵的 Canvas 2D 渲染器
 *
 * 订阅 L3 Screen 的 subscribe 回调，任何 setPixel / blit / commit / clear
 * 触发后立刻重绘整块屏幕。200 像素规模下全量重绘开销可忽略（见 ARCH §4.1）。
 *
 * 本组件**只读屏幕状态**，不写；所有像素变化通过 L3 API 发生。
 */
export function ContentScreen({
  screen,
  pixelSize = 16,
  onColor = '#1e2721',
  offColor = '#a4b09c',
}: ContentScreenProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const gap = 1;
    const draw = (): void => {
      context.fillStyle = offColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = onColor;
      for (let y = 0; y < screen.height; y++) {
        for (let x = 0; x < screen.width; x++) {
          if (!screen.getPixel(x, y)) continue;
          context.fillRect(
            x * pixelSize + gap,
            y * pixelSize + gap,
            pixelSize - gap * 2,
            pixelSize - gap * 2
          );
        }
      }
    };

    draw();
    const unsubscribe = screen.subscribe(draw);
    return unsubscribe;
  }, [screen, pixelSize, onColor, offColor]);

  return (
    <canvas
      ref={canvasRef}
      width={screen.width * pixelSize}
      height={screen.height * pixelSize}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        background: offColor,
      }}
    />
  );
}
