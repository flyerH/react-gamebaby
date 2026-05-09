import type { GameRegistry } from '@/sdk';

/**
 * 菜单选择状态机：纯函数 + 不可变 state
 *
 * 承载"游戏选择"阶段的 4 个维度：
 * - 选哪款游戏（selectedIndex）
 * - 起始 speed 档（1-9 单击递增循环，模拟 Brick Game 真机）
 * - 起始 level 档（同上）
 *
 * 输入语义（在 App 的 reducer 里串起来）：
 *   Left  / Right → 切换游戏（循环）
 *   Up            → speed +1（到 9 回 1）
 *   Down          → level +1（到 9 回 1）
 *   Start / A     → 进 playing，把 { speed, level } 传给 game.init
 *
 * 不做渲染，由 App 从 registry.list()[selectedIndex].preview 直接取
 * 点阵投影到屏幕；speed / level 数值由 SidePanel 显示。
 */

/** speed / level 的最大档位（含），单击循环到顶后回 1 */
export const MENU_SPEED_MAX = 9;
export const MENU_LEVEL_MAX = 9;

export interface MenuState {
  /** 当前选中游戏在 registry.list() 中的下标 */
  readonly selectedIndex: number;
  /** 起始 speed，1..MENU_SPEED_MAX */
  readonly speed: number;
  /** 起始 level，1..MENU_LEVEL_MAX */
  readonly level: number;
}

export function initialMenuState(): MenuState {
  return { selectedIndex: 0, speed: 1, level: 1 };
}

/** 循环切到下一款游戏 */
export function selectNext(registry: GameRegistry, state: MenuState): MenuState {
  if (registry.size === 0) return state;
  return { ...state, selectedIndex: (state.selectedIndex + 1) % registry.size };
}

/** 循环切到上一款游戏 */
export function selectPrev(registry: GameRegistry, state: MenuState): MenuState {
  if (registry.size === 0) return state;
  const { size } = registry;
  return { ...state, selectedIndex: (state.selectedIndex - 1 + size) % size };
}

/** speed 单击递增；到顶回 1 */
export function incSpeed(state: MenuState): MenuState {
  return { ...state, speed: (state.speed % MENU_SPEED_MAX) + 1 };
}

/** level 单击递增；到顶回 1 */
export function incLevel(state: MenuState): MenuState {
  return { ...state, level: (state.level % MENU_LEVEL_MAX) + 1 };
}

/** 便捷取当前选中游戏；空注册表返回 undefined */
export function currentGame(registry: GameRegistry, state: MenuState) {
  return registry.list()[state.selectedIndex];
}
