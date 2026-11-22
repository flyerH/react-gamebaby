import { describe, expect, it } from 'vitest';

import { computeLayout, DESIGN_WIDTH, type DeviceLayout, hitTest } from '../layout';

const DEVICES = [
  { name: 'iPhone 14（刘海 + Home 条）', width: 390, height: 844, topInset: 83, bottomInset: 34 },
  { name: 'iPhone SE', width: 320, height: 568, topInset: 56, bottomInset: 0 },
  { name: '安卓宽屏', width: 412, height: 915, topInset: 70, bottomInset: 16 },
];

/** 按键中心的屏幕坐标 */
function centerOf(layout: DeviceLayout, i: number): readonly [number, number] {
  const { shape } = layout.buttons[i]!;
  return [layout.offsetX + shape.cx * layout.scale, layout.offsetY + shape.cy * layout.scale];
}

/** 按键外接圆半径（设计坐标），胶囊取半长 */
function extentOf(layout: DeviceLayout, i: number): number {
  const { shape } = layout.buttons[i]!;
  return shape.kind === 'circle' ? shape.r : shape.width / 2;
}

describe('computeLayout', () => {
  it('580×950、无安全区时与网页版实测坐标一致（整体上移 5px）', () => {
    const layout = computeLayout({ width: 580, height: 950, topInset: 0, bottomInset: 0 });
    expect(layout.scale).toBe(1);
    expect(layout.offsetX).toBe(0);
    expect(layout.frame.y).toBeCloseTo(105.2 - 5, 0);
    expect(layout.lcd).toMatchObject({ x: 127, width: 178, height: 377 });
    expect(layout.lcd.y).toBeCloseTo(152.2 - 5, 0);
    const up = layout.buttons.find((b) => b.button === 'Up')!.shape;
    expect(up.kind === 'circle' && up.cy).toBeCloseTo(711.2 - 5, 0);
  });

  for (const d of DEVICES) {
    describe(d.name, () => {
      const layout = computeLayout(d);

      it('按网页版规则缩放并水平居中', () => {
        expect(layout.scale).toBeLessThanOrEqual(1);
        expect(layout.offsetX).toBeCloseTo((d.width - DESIGN_WIDTH * layout.scale) / 2);
      });

      it('标题在顶部不可用区域下方（允许整体上移的 5px）', () => {
        expect((layout.titleY - 20) * layout.scale).toBeGreaterThanOrEqual(d.topInset - 5.01);
      });

      it('按键完整落在屏幕可用区域内', () => {
        layout.buttons.forEach((_, i) => {
          const [x, y] = centerOf(layout, i);
          const r = extentOf(layout, i) * layout.scale;
          expect(x - r).toBeGreaterThanOrEqual(0);
          expect(x + r).toBeLessThanOrEqual(d.width);
          expect(y + r).toBeLessThanOrEqual(d.height - d.bottomInset);
        });
      });

      it('点按每个按键中心命中该按键', () => {
        layout.buttons.forEach((spot, i) => {
          const [x, y] = centerOf(layout, i);
          expect(hitTest(layout, x, y)).toBe(spot.button);
        });
      });

      it('点在点阵屏上不命中任何按键', () => {
        const { lcd } = layout;
        const x = layout.offsetX + (lcd.x + lcd.width / 2) * layout.scale;
        const y = layout.offsetY + (lcd.y + lcd.height / 2) * layout.scale;
        expect(hitTest(layout, x, y)).toBeNull();
      });
    });
  }

  it('屏幕越高，标题与按键之间的留白越大，屏幕区位置随之下移', () => {
    const short = computeLayout({ width: 390, height: 700, topInset: 0, bottomInset: 0 });
    const tall = computeLayout({ width: 390, height: 900, topInset: 0, bottomInset: 0 });
    expect(tall.frame.y).toBeGreaterThan(short.frame.y);
  });

  it('旋转键按倾斜的胶囊外形判定：沿长轴方向的端点命中，垂直方向同距离不命中', () => {
    const layout = computeLayout({ width: 580, height: 950, topInset: 0, bottomInset: 0 });
    const rotate = layout.buttons.find((b) => b.button === 'A')!.shape;
    if (rotate.kind !== 'capsule') throw new Error('expected capsule');
    const along = rotate.width / 2 - 5;
    const ax = rotate.cx + Math.cos(rotate.angle) * along;
    const ay = rotate.cy + Math.sin(rotate.angle) * along;
    const px = rotate.cx - Math.sin(rotate.angle) * along;
    const py = rotate.cy + Math.cos(rotate.angle) * along;
    expect(hitTest(layout, ax, ay)).toBe('A');
    expect(hitTest(layout, px, py)).not.toBe('A');
  });

  it('包含返回、开关、暂停、声音、重置、四个方向与旋转键', () => {
    const buttons = computeLayout(DEVICES[0]!).buttons.map((b) => b.button);
    expect([...buttons].sort()).toEqual(
      ['A', 'Down', 'Left', 'Pause', 'Reset', 'Right', 'Select', 'Sound', 'Start', 'Up'].sort()
    );
  });
});
