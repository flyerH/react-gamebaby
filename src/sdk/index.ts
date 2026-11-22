/**
 * 游戏契约对外入口：Game 接口、GameEnv 投影与注册表工厂
 */

export type { AnyGame, Game, GameEnv, GameInitOptions, GamePreview, Pixel } from './types';
export type { Button, ButtonAction } from '@/engine/types';
export { toGameEnv } from './env';
export { createRegistry } from './registry';
export type { GameRegistry } from './registry';
