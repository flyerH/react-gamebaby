import { describe, expect, it } from 'vitest';

import { createScreen } from '@/engine/screen';

import { drawLcd, type LcdContext2D, lcdSize, type LcdStyle } from '../draw-lcd';

const STYLE: LcdStyle = {
  cellSize: 19,
  innerSize: 11,
  outerStroke: 2,
  colGap: 2,
  rowGap: 3,
  onColor: 'on',
  offColor: 'off',
};

type Call = readonly [op: 'stroke' | 'fill', color: unknown, x: number, y: number];

function recordingContext(): { ctx: LcdContext2D; calls: Call[]; cleared: number[][] } {
  const calls: Call[] = [];
  const cleared: number[][] = [];
  const ctx: LcdContext2D = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    clearRect: (x, y, w, h) => {
      cleared.push([x, y, w, h]);
    },
    strokeRect: (x, y) => {
      calls.push(['stroke', ctx.strokeStyle, x, y]);
    },
    fillRect: (x, y) => {
      calls.push(['fill', ctx.fillStyle, x, y]);
    },
  };
  return { ctx, calls, cleared };
}

describe('lcdSize', () => {
  it('格子之间才有间距，首尾外侧不留', () => {
    expect(lcdSize(10, 20, STYLE)).toEqual({ width: 10 * 19 + 9 * 2, height: 20 * 19 + 19 * 3 });
  });

  it('单格时没有间距', () => {
    expect(lcdSize(1, 1, STYLE)).toEqual({ width: 19, height: 19 });
  });
});

describe('drawLcd', () => {
  it('每格各画一次外框与内方块，并先清空整块点阵区域', () => {
    const screen = createScreen(3, 2);
    const { ctx, calls, cleared } = recordingContext();

    drawLcd(ctx, screen, STYLE);

    expect(cleared).toEqual([[0, 0, 3 * 19 + 2 * 2, 2 * 19 + 3]]);
    expect(calls.filter(([op]) => op === 'stroke')).toHaveLength(6);
    expect(calls.filter(([op]) => op === 'fill')).toHaveLength(6);
    expect(ctx.lineWidth).toBe(2);
  });

  it('点亮格用 onColor，其余格用 offColor', () => {
    const screen = createScreen(2, 1);
    screen.setPixel(1, 0, true);
    const { ctx, calls } = recordingContext();

    drawLcd(ctx, screen, STYLE);

    expect(calls).toEqual([
      ['stroke', 'off', 1, 1],
      ['fill', 'off', 4, 4],
      ['stroke', 'on', 19 + 2 + 1, 1],
      ['fill', 'on', 19 + 2 + 4, 4],
    ]);
  });

  it('外框按线宽一半内缩，内方块居中', () => {
    const screen = createScreen(1, 2);
    const { ctx, calls } = recordingContext();

    drawLcd(ctx, screen, STYLE);

    const secondRow = 19 + 3;
    expect(calls[2]).toEqual(['stroke', 'off', 1, secondRow + 1]);
    expect(calls[3]).toEqual(['fill', 'off', 4, secondRow + 4]);
  });
});
