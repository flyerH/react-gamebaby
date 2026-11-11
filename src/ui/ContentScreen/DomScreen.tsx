import { type CSSProperties, memo, useEffect, useMemo, useRef } from 'react';

import styles from './DomScreen.module.css';
import type { LcdRendererProps } from './types';

/**
 * DomScreen —— 主点阵的保留式 DOM 像素格渲染器
 *
 * 用 width×height 个长期存在的 DOM 格子模拟真机 LCD：每格外框 + 内方块，
 * 点亮与熄灭只是 data-on 属性不同（熄灭态仍画出半透明阴影格）。
 *
 * 性能要点（对齐"一格一格的硬件像素"诉求）：
 * - 格子在尺寸不变时只创建一次，游戏 tick 不重建 React 元素、不触发 200 格
 *   的重协调；
 * - 订阅 `Screen` 后命令式只切"发生亮灭变化"的格子的 data-on 属性，配合
 *   Screen 的 batch（一次 render 只通知一次），把每帧 DOM 写入压到"变化格数"量级。
 *
 * 本组件只读屏幕状态，不写；像素变化通过 L3 API 发生。
 */
function DomScreenImpl({
  screen,
  cellSize,
  innerSize,
  outerStroke,
  colGap,
  rowGap,
  onColor,
  offColor,
}: LcdRendererProps): React.ReactElement {
  const { width, height } = screen;
  const gridRef = useRef<HTMLDivElement>(null);

  // 尺寸不变时格子只创建一次：亮灭状态不进 React，交给订阅回调命令式切换
  const cells = useMemo(() => {
    const arr: React.ReactElement[] = [];
    for (let i = 0; i < width * height; i++) {
      arr.push(
        <div key={i} className={styles.cell} data-on="0">
          <div className={styles.inner} />
        </div>
      );
    }
    return arr;
  }, [width, height]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cellEls = grid.children;
    // 记录上一帧亮灭，仅更新发生变化的格子；首帧强制全量刷新以覆盖复用的旧节点
    const prev = new Uint8Array(width * height);
    let first = true;

    const paint = (): void => {
      const buf = screen.buffer;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] ?? 0;
        if (!first && v === prev[i]) continue;
        prev[i] = v;
        const el = cellEls[i] as HTMLElement | undefined;
        if (el) el.dataset.on = v === 1 ? '1' : '0';
      }
      first = false;
    };

    paint();
    return screen.subscribe(paint);
  }, [screen, width, height]);

  // 自定义属性驱动格子尺寸与颜色；沿用 Device 里对 CSS 变量的类型断言写法
  const gridStyle = {
    gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
    columnGap: `${colGap}px`,
    rowGap: `${rowGap}px`,
    '--cs-cell': `${cellSize}px`,
    '--cs-inner': `${innerSize}px`,
    '--cs-stroke': `${outerStroke}px`,
    '--cs-on': onColor,
    '--cs-off': offColor,
  } as CSSProperties;

  return (
    <div ref={gridRef} className={styles.grid} style={gridStyle}>
      {cells}
    </div>
  );
}

export const DomScreen = memo(DomScreenImpl);
