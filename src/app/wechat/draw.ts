import type { Button } from '@/engine/types';
import type { WxCanvas, WxContext2D } from '@/platform/wechat';
import type { LcdStyle } from '@/ui/ContentScreen/draw-lcd';
import type { ButtonLabels } from '@/ui/locale';

import type { ButtonShape, ButtonSpot, DeviceLayout, Rect } from './layout';

/**
 * 小游戏机身绘制：逐项复刻网页版 Device / SidePanel / Buttons 的样式
 *
 * 绘制前把 context 变换到 580 宽的设计坐标（见 layout.ts），下面的数值与网页版
 * CSS 一一对应。静态部分（drawStatic）只画一次到离屏图层，每帧由 drawDevice
 * 贴图后再画点阵、侧栏数值与按下态按键。
 */

const COLORS = {
  body: '#4a94c1',
  glow: '146, 211, 249',
  frame: '#fff',
  bevelDark: '#316a8e',
  bevelLight: '#5fa0c8',
  lcd: 'rgb(191, 202, 165)',
  lcdBorder: 'rgba(0, 0, 0, 0.6)',
  ink: '#000',
  button: 'rgb(168, 12, 55)',
  buttonPressed: 'rgb(143, 10, 47)',
} as const;

const FONT = 'sans-serif';

/**
 * 主屏与副屏的格子样式，同网页 ContentScreen 与 SidePanel 预览格。
 * cellSize − innerSize 需为偶数，内方块两侧留白才是整像素，不会偏向一侧
 */
export const LCD_STYLE: LcdStyle = {
  cellSize: 16,
  innerSize: 8,
  outerStroke: 2,
  colGap: 2,
  rowGap: 3,
  onColor: '#000',
  offColor: 'rgba(0, 0, 0, 0.3)',
};

export const AUX_STYLE: LcdStyle = {
  cellSize: 13,
  innerSize: 7,
  outerStroke: 1.5,
  colGap: 2,
  rowGap: 2,
  onColor: '#000',
  offColor: 'rgba(0, 0, 0, 0.15)',
};

export interface DeviceView {
  readonly power: boolean;
  readonly score: number;
  readonly hiScore: number;
  readonly level: number;
  readonly speed: number;
  readonly paused: boolean;
  readonly soundOn: boolean;
  readonly pressed: ReadonlySet<Button>;
}

export type WechatButtonLabels = ButtonLabels & { readonly select: string };

/** 把 context 变换到设计坐标后执行绘制 */
function inDesign(ctx: WxContext2D, layout: DeviceLayout, draw: () => void): void {
  ctx.save();
  ctx.translate(layout.offsetX, layout.offsetY);
  ctx.scale(layout.scale, layout.scale);
  draw();
  ctx.restore();
}

/** 静态层：机身、标题、屏幕外框、LCD 底板、全部按键（未按下态）与标签 */
export function drawStatic(
  ctx: WxContext2D,
  layout: DeviceLayout,
  labels: WechatButtonLabels
): void {
  ctx.fillStyle = COLORS.body;
  ctx.fillRect(0, 0, layout.width, layout.height);
  inDesign(ctx, layout, () => {
    drawGlow(ctx, layout.designHeight);

    ctx.fillStyle = COLORS.ink;
    ctx.font = `28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GameBaby', 290, layout.titleY);

    drawScreenFrame(ctx, layout);
    for (const spot of layout.buttons) {
      drawButtonBody(ctx, spot, false);
      drawDecor(ctx, spot, labels);
    }
  });
}

/** 动态层：贴静态层，画点阵 / 副屏图层、侧栏数值与指示灯、按下态的按键 */
export function drawDevice(
  ctx: WxContext2D,
  layout: DeviceLayout,
  view: DeviceView,
  layers: { readonly base: WxCanvas; readonly lcd: WxCanvas; readonly aux: WxCanvas },
  labels: WechatButtonLabels
): void {
  ctx.drawImage(layers.base, 0, 0, layout.width, layout.height);
  inDesign(ctx, layout, () => {
    const { lcd, aux } = layout;
    ctx.drawImage(layers.lcd, lcd.x, lcd.y, lcd.width, lcd.height);
    // 关机时整块侧栏不可见，同网页 .poweredOff { visibility: hidden }
    if (view.power) {
      ctx.drawImage(layers.aux, aux.x, aux.y, aux.width, aux.height);
      drawSide(ctx, layout, view);
    }
    for (const spot of layout.buttons) {
      if (!view.pressed.has(spot.button)) continue;
      eraseButton(ctx, spot);
      drawButtonBody(ctx, spot, true);
      drawDecor(ctx, spot, labels);
    }
  });
}

/** 机身内发光：同 box-shadow: inset 0 0 15px 2px #92d3f9，只画上、左、右三边 */
function drawGlow(ctx: WxContext2D, height: number): void {
  for (let i = 0; i < 16; i++) {
    const alpha = 0.85 * (1 - i / 16) ** 2;
    ctx.fillStyle = `rgba(${COLORS.glow}, ${alpha.toFixed(3)})`;
    ctx.fillRect(i, i, 580 - i * 2, 1);
    ctx.fillRect(i, i + 1, 1, height);
    ctx.fillRect(579 - i, i + 1, 1, height);
  }
}

function drawScreenFrame(ctx: WxContext2D, layout: DeviceLayout): void {
  const { frame, bevel, screen, screenLeft } = layout;
  // 白色粗边 7px
  ctx.strokeStyle = COLORS.frame;
  ctx.lineWidth = 7;
  ctx.strokeRect(frame.x + 3.5, frame.y + 3.5, frame.width - 7, frame.height - 7);
  // 3D 凹陷内框 8px：上左深、下右浅，四角斜切
  drawBevel(ctx, bevel, 8);
  // LCD 底板 + 1px 描边
  ctx.fillStyle = COLORS.lcd;
  ctx.fillRect(screen.x, screen.y, screen.width, screen.height);
  ctx.strokeStyle = COLORS.lcdBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, screen.width - 1, screen.height - 1);
  // 主屏 2px 黑框
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(screenLeft.x + 1, screenLeft.y + 1, screenLeft.width - 2, screenLeft.height - 2);
}

function polygon(ctx: WxContext2D, pts: ReadonlyArray<readonly [number, number]>): void {
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

function drawBevel(ctx: WxContext2D, r: Rect, b: number): void {
  const { x, y, width: w, height: h } = r;
  ctx.fillStyle = COLORS.bevelDark;
  polygon(ctx, [
    [x, y],
    [x + w, y],
    [x + w - b, y + b],
    [x + b, y + b],
  ]);
  polygon(ctx, [
    [x, y],
    [x + b, y + b],
    [x + b, y + h - b],
    [x, y + h],
  ]);
  ctx.fillStyle = COLORS.bevelLight;
  polygon(ctx, [
    [x + w, y],
    [x + w, y + h],
    [x + w - b, y + h - b],
    [x + w - b, y + b],
  ]);
  polygon(ctx, [
    [x, y + h],
    [x + b, y + h - b],
    [x + w - b, y + h - b],
    [x + w, y + h],
  ]);
}

/** 侧栏：字号、字距与各行位置同 SidePanel.module.css（相对侧栏顶部的偏移取自网页实测） */
function drawSide(ctx: WxContext2D, layout: DeviceLayout, view: DeviceView): void {
  const x = layout.sideX;
  const top = layout.sideTop;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.ink;

  const rows: ReadonlyArray<readonly [string, number, number]> = [
    ['SCORE', view.score, 11],
    ['HI-SCORE', view.hiScore, 59],
    ['LEVEL', view.level, 149],
    ['SPEED', view.speed, 197],
  ];
  for (const [label, value, dy] of rows) {
    ctx.font = `bold 10px ${FONT}`;
    fillSpaced(ctx, label, x, top + dy, 1);
    ctx.font = `20px ${FONT}`;
    ctx.fillText(String(value), x + 8, top + dy + 19);
  }

  ctx.font = `bold 10px ${FONT}`;
  const indicators: ReadonlyArray<readonly [string, boolean, number]> = [
    ['PAUSE', view.paused, 358],
    ['SOUND', view.soundOn, 376],
  ];
  for (const [label, on, dy] of indicators) {
    ctx.fillStyle = on ? COLORS.ink : 'rgba(0, 0, 0, 0.3)';
    fillSpaced(ctx, label, x, top + dy, 1);
  }
}

/** 逐字绘制以模拟 letter-spacing；小游戏 canvas 不一定支持 letterSpacing 属性 */
function fillSpaced(ctx: WxContext2D, text: string, x: number, y: number, spacing: number): void {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function traceShape(ctx: WxContext2D, shape: ButtonShape, grow = 0): void {
  ctx.beginPath();
  if (shape.kind === 'circle') {
    ctx.arc(shape.cx, shape.cy, shape.r + grow, 0, Math.PI * 2);
    return;
  }
  const w = shape.width + grow * 2;
  const h = shape.height + grow * 2;
  const rx = shape.rx + grow;
  const ry = shape.ry + grow;
  const x = -w / 2;
  const y = -h / 2;
  // 椭圆圆角用三次贝塞尔近似（k≈0.5523），小游戏 canvas 不一定有 ellipse / roundRect
  const kx = rx * 0.5523;
  const ky = ry * 0.5523;
  ctx.save();
  ctx.translate(shape.cx, shape.cy);
  ctx.rotate(shape.angle);
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.bezierCurveTo(x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry);
  ctx.lineTo(x + w, y + h - ry);
  ctx.bezierCurveTo(x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h);
  ctx.lineTo(x + rx, y + h);
  ctx.bezierCurveTo(x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry);
  ctx.lineTo(x, y + ry);
  ctx.bezierCurveTo(x, y + ry - ky, x + rx - kx, y, x + rx, y);
  ctx.closePath();
  ctx.restore();
}

/** 按键本体：红色 + 1px 黑边 + 底部阴影；按下时变深、下压、阴影收紧，同网页 :active */
function drawButtonBody(ctx: WxContext2D, spot: ButtonSpot, pressed: boolean): void {
  const small = spot.shape.kind === 'circle' && spot.shape.r < 20;
  ctx.save();
  if (pressed) ctx.translate(0, spot.press);
  ctx.shadowColor = pressed ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.2)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = pressed ? 1 : small ? 2 : 3;
  ctx.shadowBlur = pressed ? 1 : small ? 2 : 3;
  traceShape(ctx, spot.shape);
  ctx.fillStyle = pressed ? COLORS.buttonPressed : COLORS.button;
  ctx.fill();
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 按下态重画前，先用机身色盖掉未按下态的按键与阴影 */
function eraseButton(ctx: WxContext2D, spot: ButtonSpot): void {
  traceShape(ctx, spot.shape, 4);
  ctx.fillStyle = COLORS.body;
  ctx.fill();
}

/** 按键外围的标签、方向箭头与旋转键弯箭头；偏移量取自网页版渲染结果 */
function drawDecor(ctx: WxContext2D, spot: ButtonSpot, labels: WechatButtonLabels): void {
  const { shape } = spot;
  ctx.fillStyle = COLORS.ink;
  ctx.textBaseline = 'middle';
  if (shape.kind === 'capsule') {
    drawRotateDecor(ctx, shape.cx, shape.cy, labels.rotate);
    return;
  }
  const { cx, cy } = shape;
  ctx.font = `14px ${FONT}`;
  switch (spot.button) {
    case 'Up':
      ctx.textAlign = 'left';
      ctx.fillText(labels.up, cx + 46, cy - 14);
      polygon(ctx, [
        [cx, cy + 50.5],
        [cx - 10, cy + 65.5],
        [cx + 10, cy + 65.5],
      ]);
      return;
    case 'Down':
      ctx.textAlign = 'center';
      ctx.fillText(labels.down, cx + 1, cy + 51);
      polygon(ctx, [
        [cx, cy - 50.5],
        [cx - 10, cy - 65.5],
        [cx + 10, cy - 65.5],
      ]);
      return;
    case 'Left':
      ctx.textAlign = 'center';
      ctx.fillText(labels.left, cx + 1, cy + 56);
      polygon(ctx, [
        [cx + 50.5, cy],
        [cx + 65.5, cy - 10],
        [cx + 65.5, cy + 10],
      ]);
      return;
    case 'Right':
      ctx.textAlign = 'center';
      ctx.fillText(labels.right, cx + 1, cy + 56);
      polygon(ctx, [
        [cx - 50.5, cy],
        [cx - 65.5, cy - 10],
        [cx - 65.5, cy + 10],
      ]);
      return;
    default:
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(smallLabel(spot.button, labels), cx, cy + 27);
  }
}

function smallLabel(button: Button, labels: WechatButtonLabels): string {
  switch (button) {
    case 'Start':
      return labels.start;
    case 'Pause':
      return labels.pause;
    case 'Sound':
      return labels.sound;
    case 'Reset':
      return labels.reset;
    case 'Select':
      return labels.select;
    default:
      return '';
  }
}

/**
 * 旋转键的斜排标签与两道弯箭头。网页版由多层 CSS 变换叠加而成，
 * 这里按网页渲染结果取相对旋转键中心的坐标直接画
 */
function drawRotateDecor(ctx: WxContext2D, cx: number, cy: number, label: string): void {
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  const chars = [...label];
  const step = 11.7;
  const dir = (59 * Math.PI) / 180;
  chars.forEach((ch, i) => {
    const t = (i - (chars.length - 1) / 2) * step;
    ctx.save();
    ctx.translate(cx + 44.5 + Math.cos(dir) * t, cy - 51.2 + Math.sin(dir) * t);
    ctx.rotate(dir - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(cx - 70, cy - 60.2);
  ctx.quadraticCurveTo(cx - 82, cy - 42.2, cx - 75.5, cy - 28.2);
  ctx.stroke();
  polygon(ctx, [
    [cx - 75.5, cy - 16.2],
    [cx - 83, cy - 29.2],
    [cx - 68, cy - 29.2],
  ]);

  ctx.beginPath();
  ctx.moveTo(cx + 78, cy + 61.3);
  ctx.quadraticCurveTo(cx + 90, cy + 42.8, cx + 83, cy + 30.8);
  ctx.stroke();
  polygon(ctx, [
    [cx + 82.5, cy + 19.3],
    [cx + 75, cy + 31.3],
    [cx + 90, cy + 31.3],
  ]);
}
