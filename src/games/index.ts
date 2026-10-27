import { createRegistry, type GameRegistry } from '@/sdk';

import { snake } from './snake';
import { tank } from './tank';
import { tetris } from './tetris';

/** 默认游戏注册表：顺序即菜单里的默认游戏编号顺序 */
export const defaultGames: GameRegistry = createRegistry([snake, tetris, tank]);
