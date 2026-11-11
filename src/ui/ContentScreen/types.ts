import type { Screen } from '@/engine/types';

import type { LcdStyle } from './draw-lcd';

/** 主屏可选的渲染器实现 */
export type ScreenRenderer = 'dom' | 'canvas';

/** 具体渲染器的 props：样式默认值已由 ContentScreen 统一补齐 */
export interface LcdRendererProps extends LcdStyle {
  /** L3 framebuffer：渲染器订阅其变化并重绘，不主动改 buffer */
  readonly screen: Screen;
}
