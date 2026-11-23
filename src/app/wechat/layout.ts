import type { Button } from '@/engine/types';

/**
 * 小游戏机身布局：复刻网页版 Device / Buttons 的设计稿
 *
 * 所有几何都在网页版 580 宽的设计坐标下给出（数值与 Device.module.css、
 * Buttons.module.css、SidePanel.module.css 一致），绘制时整体按 scale 缩放到屏幕，
 * 等价于网页的 transform: scale(var(--device-scale))。缩放与纵向留白规则同 Device.tsx。
 */

/** 设计坐标宽度与最低高度，同 Device.module.css 的 .app */
export const DESIGN_WIDTH = 580;
const DESIGN_MIN_HEIGHT = 950;
/** 缩放基准宽，同 Device.tsx 的 DEVICE_SAFE_WIDTH */
const SAFE_WIDTH = 510;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ButtonShape =
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      /** 圆角胶囊：中心、未旋转时的宽高、圆角半径、旋转角（弧度） */
      readonly kind: 'capsule';
      readonly cx: number;
      readonly cy: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
      readonly ry: number;
      readonly angle: number;
    };

export interface ButtonSpot {
  readonly button: Button;
  readonly shape: ButtonShape;
  /** 触摸判定比可见外形向外扩出的距离（设计坐标） */
  readonly slop: number;
  /** 按下时下压的距离，同网页 :active 的 translateY */
  readonly press: number;
}

export interface DeviceLayout {
  /** 屏幕逻辑像素尺寸 */
  readonly width: number;
  readonly height: number;
  /** 设计坐标 → 屏幕：screen = offset + design * scale */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** 设计坐标下机身高度（随屏幕高度拉长） */
  readonly designHeight: number;
  /** 以下均为设计坐标 */
  readonly titleY: number;
  readonly frame: Rect;
  readonly bevel: Rect;
  readonly screen: Rect;
  readonly screenLeft: Rect;
  readonly lcd: Rect;
  readonly aux: Rect;
  readonly sideX: number;
  readonly sideTop: number;
  readonly buttonsTop: number;
  readonly buttons: ReadonlyArray<ButtonSpot>;
}

export interface LayoutInput {
  readonly width: number;
  readonly height: number;
  /** 顶部不可用高度：状态栏与右上角胶囊按钮取较大者 */
  readonly topInset: number;
  /** 底部不可用高度：Home 指示条等 */
  readonly bottomInset: number;
}

/** 同 Device.tsx 的 computeScale：按内容安全宽缩放，容器过矮时按高度收紧 */
function computeScale(width: number, height: number): number {
  const widthScale = Math.min(1, width / SAFE_WIDTH);
  if (height > 0 && height < DESIGN_MIN_HEIGHT * widthScale) return height / DESIGN_MIN_HEIGHT;
  return widthScale;
}

/**
 * 按 flex-grow 比例分配剩余空间，同时满足各项的最小高度：
 * 份额低于最小值的项固定为最小值，剩余空间再按比例分给其他项
 */
function distribute(free: number, grows: readonly number[], mins: readonly number[]): number[] {
  const sizes = grows.map(() => 0);
  const frozen = grows.map(() => false);
  let remaining = Math.max(0, free);
  for (;;) {
    const total = grows.reduce((sum, g, i) => (frozen[i] ? sum : sum + g), 0);
    let changed = false;
    grows.forEach((g, i) => {
      if (frozen[i]) return;
      const share = total > 0 ? (remaining * g) / total : 0;
      const min = mins[i] ?? 0;
      if (share < min) {
        sizes[i] = min;
        frozen[i] = true;
        remaining -= min;
        changed = true;
      }
    });
    if (!changed) {
      grows.forEach((g, i) => {
        if (!frozen[i]) sizes[i] = total > 0 ? (Math.max(0, remaining) * g) / total : 0;
      });
      return sizes;
    }
  }
}

/** 标题行文字高度、屏幕区（白框）高度、按键区高度（含上方 30 外边距），取自网页版实测 */
const TITLE_LINE = 40;
const FRAME_HEIGHT = 471;
const BUTTONS_HEIGHT = 335;

/**
 * 小键从左到右；同网页 .topControls 靠右对齐（右缘 x=470），间距 52。
 * 小游戏没有系统返回键，在最左侧多一个「返回」键（Select）
 */
const SMALL_KEYS: ReadonlyArray<Button> = ['Select', 'Start', 'Pause', 'Sound', 'Reset'];

export function computeLayout(input: LayoutInput): DeviceLayout {
  const { width: W, height: H } = input;
  const scale = computeScale(W, H - input.topInset - input.bottomInset);
  const designHeight = Math.max(DESIGN_MIN_HEIGHT, H / scale);

  // 纵向：标题上方 : 标题与屏幕之间 : 按键下方 = 3 : 0.5 : 4.5，上下不少于安全区
  const titleBottomMargin = 15 + 80 * (1 - scale);
  const fixed = 20 + TITLE_LINE + titleBottomMargin + FRAME_HEIGHT + BUTTONS_HEIGHT;
  const [before = 0, gap = 0] = distribute(
    designHeight - fixed,
    [3, 0.5, 4.5],
    [input.topInset / scale, 0, input.bottomInset / scale]
  );

  // 比网页版整体上移 5 个屏幕像素
  const titleTop = before + 20 - 5 / scale;
  const frameTop = titleTop + TITLE_LINE + titleBottomMargin + gap;
  // 以下坐标取自网页版在 scale=1、高 950 时的实测值，按实际屏幕位置整体平移
  const dy = frameTop - 105.2;
  const at = (x: number, y: number, width: number, height: number): Rect => ({
    x,
    y: y + dy,
    width,
    height,
  });

  const buttonsTop = frameTop + FRAME_HEIGHT;
  const by = buttonsTop - 576.2;

  const small = SMALL_KEYS.map<ButtonSpot>((button, i) => ({
    button,
    shape: {
      kind: 'circle',
      cx: 455 - (SMALL_KEYS.length - 1 - i) * 52,
      cy: 621.2 + by,
      r: 15,
    },
    slop: 10,
    press: 1,
  }));
  const dpad: ReadonlyArray<readonly [Button, number, number]> = [
    ['Up', 192.5, 711.2],
    ['Right', 272.5, 791.2],
    ['Down', 192.5, 871.2],
    ['Left', 112.5, 791.2],
  ];
  const dpadSpots = dpad.map<ButtonSpot>(([button, cx, cy]) => ({
    button,
    shape: { kind: 'circle', cx, cy: cy + by, r: 40 },
    slop: 6,
    press: 2,
  }));
  // CSS 声明 220×90，但处在 175 宽的 flex 容器里被压缩到 175×90；border-radius 30%/70%
  // 两向圆角之和超过高度，按 CSS 规则统一缩到 90/126。整体 scale(0.85) rotateZ(60deg)
  const radiusFit = 90 / 126;
  const rotate: ButtonSpot = {
    button: 'A',
    shape: {
      kind: 'capsule',
      cx: 420,
      cy: 791.2 + by,
      width: 175 * 0.85,
      height: 90 * 0.85,
      rx: 175 * 0.3 * radiusFit * 0.85,
      ry: 90 * 0.7 * radiusFit * 0.85,
      angle: Math.PI / 3,
    },
    slop: 10,
    press: 2,
  };

  return {
    width: W,
    height: H,
    scale,
    offsetX: (W - DESIGN_WIDTH * scale) / 2,
    offsetY: 0,
    designHeight,
    titleY: titleTop + TITLE_LINE / 2,
    frame: at(80, 105.2, 420, 471),
    bevel: at(103, 128.2, 374, 425),
    screen: at(111, 136.2, 358, 409),
    screenLeft: at(122, 147.2, 188, 387),
    lcd: at(127, 152.2, 178, 377),
    aux: at(320, 251.2, 58, 28),
    sideX: 320,
    sideTop: 147.2 + dy,
    buttonsTop,
    buttons: [...small, ...dpadSpots, rotate],
  };
}

/** 屏幕坐标 → 设计坐标 */
export function toDesign(layout: DeviceLayout, x: number, y: number): readonly [number, number] {
  return [(x - layout.offsetX) / layout.scale, (y - layout.offsetY) / layout.scale];
}

/** 点到按键外形边缘的距离（设计坐标），在外形内部为负 */
function distanceTo(shape: ButtonShape, x: number, y: number): number {
  if (shape.kind === 'circle') return Math.hypot(x - shape.cx, y - shape.cy) - shape.r;
  // 转到胶囊自身坐标系，按两端为半圆的胶囊近似计算
  const cos = Math.cos(-shape.angle);
  const sin = Math.sin(-shape.angle);
  const lx = (x - shape.cx) * cos - (y - shape.cy) * sin;
  const ly = (x - shape.cx) * sin + (y - shape.cy) * cos;
  const half = shape.width / 2 - shape.height / 2;
  const nx = Math.max(Math.abs(lx) - half, 0);
  return Math.hypot(nx, ly) - shape.height / 2;
}

/** 返回触点（屏幕坐标）所在的按键；落在多个判定区时取距离外形最近的 */
export function hitTest(layout: DeviceLayout, x: number, y: number): Button | null {
  const [dx, dy] = toDesign(layout, x, y);
  let best: Button | null = null;
  let bestDist = Infinity;
  for (const spot of layout.buttons) {
    const d = distanceTo(spot.shape, dx, dy);
    if (d <= spot.slop && d < bestDist) {
      best = spot.button;
      bestDist = d;
    }
  }
  return best;
}
