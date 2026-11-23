import { bindPressRepeat } from '@/engine/repeat';
import type { Screen, Unsubscribe } from '@/engine/types';
import { defaultGames } from '@/games';
import { createMachine, type Machine } from '@/machine';
import {
  bindAppLifecycle,
  bindTouchInput,
  createTimeoutSchedule,
  createWechatContext,
  type WechatHost,
  type WxCanvas,
} from '@/platform/wechat';
import { drawLcd, type LcdStyle, lcdSize } from '@/ui/ContentScreen/draw-lcd';
import { BUTTON_LABELS } from '@/ui/locale';

import { AUX_STYLE, drawDevice, drawStatic, LCD_STYLE, type WechatButtonLabels } from './draw';
import { computeLayout, type DeviceLayout, hitTest } from './layout';

const LABELS: WechatButtonLabels = { ...BUTTON_LABELS['zh-CN'], select: '返回' };

export interface WechatApp {
  readonly machine: Machine;
  readonly layout: DeviceLayout;
  readonly stop: () => void;
}

/**
 * 点阵屏画到离屏 canvas，主画面每帧直接贴图。
 * 样式按设计坐标给出，图层按缩放比例乘以设备像素比放大，保证清晰
 */
function createLcdLayer(
  host: WechatHost,
  screen: Screen,
  style: LcdStyle,
  pixelScale: number
): { readonly canvas: WxCanvas; readonly paint: () => void } {
  const canvas = host.wx.createCanvas();
  const size = lcdSize(screen.width, screen.height, style);
  canvas.width = Math.ceil(size.width * pixelScale);
  canvas.height = Math.ceil(size.height * pixelScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelScale, pixelScale);
  return {
    canvas,
    paint: () => {
      drawLcd(ctx, screen, style);
    },
  };
}

/**
 * 小游戏入口装配
 *
 * 创建上屏 canvas 与 HardwareContext，交给 machine 运行；触摸、长按连发、
 * 前后台分别接到 InputBus 与 machine。机身静态部分只画一次到离屏 canvas，
 * 状态变化后的下一帧贴静态层与点阵图层，再画数值与按下态按键。
 */
export function startWechatApp(host: WechatHost): WechatApp {
  const { wx } = host;
  // 首次调用 createCanvas 得到上屏 canvas，必须先于离屏 canvas 创建
  const canvas = wx.createCanvas();
  const info = wx.getWindowInfo();
  const dpr = info.pixelRatio;
  const W = info.windowWidth;
  const H = info.windowHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  let menuBottom = 0;
  try {
    menuBottom = wx.getMenuButtonBoundingClientRect().bottom;
  } catch {
    // 部分环境（如开发者工具的某些模式）取不到胶囊按钮位置，退回只避开安全区
  }
  const safeTop = info.safeArea?.top ?? 0;
  const safeBottom = info.safeArea ? H - info.safeArea.bottom : 0;
  const layout = computeLayout({
    width: W,
    height: H,
    topInset: Math.max(safeTop, menuBottom),
    bottomInset: safeBottom,
  });

  const hw = createWechatContext({ host, seed: host.now() });
  const machine = createMachine({ ctx: hw, games: defaultGames, seed: host.now() + 1 });
  const lcd = createLcdLayer(host, hw.screen, LCD_STYLE, layout.scale * dpr);
  const aux = createLcdLayer(host, hw.auxScreen, AUX_STYLE, layout.scale * dpr);
  const base = wx.createCanvas();
  base.width = W * dpr;
  base.height = H * dpr;
  const baseCtx = base.getContext('2d');
  baseCtx.scale(dpr, dpr);
  drawStatic(baseCtx, layout, LABELS);

  let dirty = true;
  let lcdDirty = true;
  let auxDirty = true;
  const markDirty = (): void => {
    dirty = true;
  };

  const unsubs: Unsubscribe[] = [
    bindPressRepeat(hw.input, { schedule: createTimeoutSchedule(host) }),
    bindTouchInput(wx, hw.input, (x, y) => hitTest(layout, x, y)),
    bindAppLifecycle(wx, {
      onBackground: () => {
        machine.suspend();
      },
      onForeground: () => {
        machine.resume();
        markDirty();
      },
    }),
    hw.screen.subscribe(() => {
      lcdDirty = true;
      dirty = true;
    }),
    hw.auxScreen.subscribe(() => {
      auxDirty = true;
      dirty = true;
    }),
    machine.subscribe(markDirty),
    hw.score.subscribe(markDirty),
    hw.pause.subscribe(markDirty),
    hw.soundOn.subscribe(markDirty),
    hw.input.subscribe(markDirty),
  ];

  const render = (): void => {
    if (lcdDirty) lcd.paint();
    if (auxDirty) aux.paint();
    lcdDirty = false;
    auxDirty = false;
    const state = machine.getState();
    drawDevice(
      ctx,
      layout,
      {
        power: state.mode !== 'off',
        score: hw.score.value,
        hiScore: machine.getHiScore(),
        level: state.menu.level,
        speed: state.menu.speed,
        paused: hw.pause.value,
        soundOn: hw.soundOn.value,
        pressed: hw.input.pressed,
      },
      { base, lcd: lcd.canvas, aux: aux.canvas },
      LABELS
    );
    dirty = false;
  };

  let frame = 0;
  const loop = (): void => {
    if (dirty) render();
    frame = host.requestAnimationFrame(loop);
  };

  machine.start();
  frame = host.requestAnimationFrame(loop);

  return {
    machine,
    layout,
    stop: () => {
      host.cancelAnimationFrame(frame);
      machine.stop();
      for (const unsub of unsubs) unsub();
    },
  };
}
