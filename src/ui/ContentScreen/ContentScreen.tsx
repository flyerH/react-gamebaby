import { memo } from 'react';

import type { Screen } from '@/engine/types';

import { CanvasScreen } from './CanvasScreen';
import { DomScreen } from './DomScreen';
import type { ScreenRenderer } from './types';

export interface ContentScreenProps {
  /** L3 framebuffer：组件订阅其变化并重绘，不主动改 buffer */
  screen: Screen;
  /** 渲染器实现，默认 'dom'；切换时会卸载旧渲染器并按当前 buffer 重画 */
  renderer?: ScreenRenderer;
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
 * ContentScreen —— 主点阵屏
 *
 * 只负责补齐样式默认值并选择渲染器；各渲染器对同一份 Screen buffer 平行实现，
 * 视觉一致，游戏逻辑对渲染方式无感。
 */
function ContentScreenImpl({
  screen,
  renderer = 'dom',
  cellSize = 19,
  innerSize = 11,
  outerStroke = 2,
  colGap = 2,
  rowGap = 3,
  onColor = '#000',
  offColor = 'rgba(0, 0, 0, 0.3)',
}: ContentScreenProps): React.ReactElement {
  const Renderer = renderer === 'canvas' ? CanvasScreen : DomScreen;
  return (
    <Renderer
      screen={screen}
      cellSize={cellSize}
      innerSize={innerSize}
      outerStroke={outerStroke}
      colGap={colGap}
      rowGap={rowGap}
      onColor={onColor}
      offColor={offColor}
    />
  );
}

/**
 * memo 化：App 每个 tick 都会重渲染，但主屏的 props（screen 引用、尺寸、颜色）
 * 稳定，memo 让 ContentScreen 在 tick 中被跳过，只靠渲染器的订阅回调更新。
 */
export const ContentScreen = memo(ContentScreenImpl);
