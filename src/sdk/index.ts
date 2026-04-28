/**
 * L2 Game SDK —— 游戏开发者对外入口
 *
 * 当前只暴露 Game 类型与 Registry 工厂，后续扩展 GameEnv /
 * draw helpers 等也从本文件 re-export。
 */

export type { Game, Pixel, GamePreview } from './types';
export { createRegistry } from './registry';
export type { GameRegistry } from './registry';
