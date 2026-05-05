import type { GameRegistry } from '@/sdk';

/**
 * 菜单选择状态机：纯函数 + 不可变 state
 *
 * 承载"游戏选择"阶段的切换逻辑：selectedIndex 在注册表范围内循环，
 * 方向键上/左 后退一位，下/右 前进一位。不做渲染，由 App 从
 * registry.list()[selectedIndex].preview 直接取点阵投影到屏幕。
 */

export interface MenuState {
  /** 当前选中游戏在 registry.list() 中的下标 */
  readonly selectedIndex: number;
}

export function initialMenuState(): MenuState {
  return { selectedIndex: 0 };
}

/** 循环前进 */
export function selectNext(registry: GameRegistry, state: MenuState): MenuState {
  if (registry.size === 0) return state;
  return { selectedIndex: (state.selectedIndex + 1) % registry.size };
}

/** 循环后退 */
export function selectPrev(registry: GameRegistry, state: MenuState): MenuState {
  if (registry.size === 0) return state;
  const { size } = registry;
  return { selectedIndex: (state.selectedIndex - 1 + size) % size };
}

/** 便捷取当前选中游戏；空注册表返回 undefined */
export function currentGame(registry: GameRegistry, state: MenuState) {
  return registry.list()[state.selectedIndex];
}
