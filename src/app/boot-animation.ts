import type { Pixel } from '@/sdk';

/**
 * 开机动画：顶部 "9999 IN 1" 静态 logo + 外圈到内圈的螺旋点阵
 *
 * 视觉复刻 Brick Game 真机开机画面：
 * 每 tick 推进一个光标，屏幕上亮起从 trail[0] 到 trail[cursor] 的
 * 累积点；走到末尾后瞬间重置到 0，形成循环。
 *
 * 本模块是纯函数，不依赖 Screen 实例——由调用方（L4 App）把 state
 * 转译到 screen.setPixel 上，便于单测。
 */

/**
 * 顶部固定 logo 的点阵坐标（[x, y]）
 *
 * "9999 IN 1" 字样的手工位图。
 */
export const BOOT_LOGO: ReadonlyArray<Pixel> = [
  [0, 1],
  [1, 1],
  [2, 1],
  [2, 2],
  [0, 3],
  [1, 3],
  [2, 3],
  [0, 4],
  [0, 5],
  [1, 5],
  [2, 5],
  [1, 7],
  [2, 7],
  [3, 7],
  [2, 8],
  [2, 9],
  [2, 10],
  [1, 11],
  [2, 11],
  [3, 11],
  [5, 7],
  [5, 8],
  [5, 9],
  [6, 9],
  [5, 10],
  [7, 10],
  [5, 11],
  [8, 11],
  [8, 10],
  [8, 9],
  [8, 8],
  [8, 7],
  [8, 13],
  [7, 14],
  [8, 14],
  [8, 15],
  [8, 16],
  [7, 17],
  [8, 17],
  [9, 17],
];

/**
 * 生成外到内的回字螺旋轨迹点序列
 *
 * 每层按 4 条边顺序铺点（上行 / 右行 / 下行 / 左行），
 * 层数取 min(w, h)/2 向下取整。
 */
export function spiralTrail(width: number, height: number): ReadonlyArray<Pixel> {
  const trail: Pixel[] = [];
  const layers = Math.floor(Math.min(width, height) / 2);
  for (let i = 0; i < layers; i++) {
    for (let x = i; x < width - i; x++) trail.push([x, i]);
    for (let y = i + 1; y < height - i; y++) trail.push([width - 1 - i, y]);
    for (let x = width - 2 - i; x >= i; x--) trail.push([x, height - 1 - i]);
    for (let y = height - 2 - i; y > i; y--) trail.push([i, y]);
  }
  return trail;
}

export interface BootAnimation {
  readonly logo: ReadonlyArray<Pixel>;
  readonly trail: ReadonlyArray<Pixel>;
}

export interface BootState {
  /** 下一次 tick 之前、当前要亮起的 trail 点数 0..trail.length */
  readonly cursor: number;
}

export function createBootAnimation(width = 10, height = 20): BootAnimation {
  return {
    logo: BOOT_LOGO,
    trail: spiralTrail(width, height),
  };
}

export function initialBootState(): BootState {
  return { cursor: 0 };
}

/**
 * 推进一帧：cursor 自增到 trail.length 时环回 0，形成循环
 */
export function stepBoot(anim: BootAnimation, state: BootState): BootState {
  const next = state.cursor + 1;
  return { cursor: next > anim.trail.length ? 0 : next };
}

/**
 * 把动画状态投影到一组当前该点亮的像素（logo ∪ trail[0..cursor]）
 *
 * 返回新数组，调用方可直接遍历 screen.setPixel；本函数不触碰 Screen，
 * 便于在 Node 里单测。
 */
export function projectBoot(anim: BootAnimation, state: BootState): ReadonlyArray<Pixel> {
  const pixels: Pixel[] = [...anim.logo];
  const end = Math.min(state.cursor, anim.trail.length);
  for (let i = 0; i < end; i++) {
    const p = anim.trail[i];
    if (p) pixels.push(p);
  }
  return pixels;
}
