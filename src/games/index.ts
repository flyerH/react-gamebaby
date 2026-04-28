import { createRegistry, type GameRegistry } from '@/sdk';

import snake from './snake';
import tetris from './tetris';

/**
 * 默认游戏注册表：顺序即菜单里的默认游戏编号顺序
 *
 * 当前两款均是 preview-only 占位——只提供菜单图标 + 名字，
 * 选中后 Rotate 进入的仍是占位画面；真正的 init / step / render
 * 等接口待首款游戏正式实现时再一并扩展 SDK。
 */
export const defaultGames: GameRegistry = createRegistry([snake, tetris]);
