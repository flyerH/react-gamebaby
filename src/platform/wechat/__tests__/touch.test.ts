import { beforeEach, describe, expect, it } from 'vitest';

import { createInputBus } from '@/engine/input';
import type { Button, ButtonAction, InputBus } from '@/engine/types';

import { bindTouchInput, type HitTest } from '../touch';

import { createFakeWx, type FakeWx } from './fake-wx';

/** x < 100 是 Left，100..199 是 Right，200..299 是 A，其余不是按键 */
const hitTest: HitTest = (x) => (x < 100 ? 'Left' : x < 200 ? 'Right' : x < 300 ? 'A' : null);

describe('bindTouchInput', () => {
  let wx: FakeWx;
  let input: InputBus;
  let log: Array<[Button, ButtonAction]>;

  beforeEach(() => {
    wx = createFakeWx();
    input = createInputBus();
    log = [];
    input.subscribe((btn, action) => log.push([btn, action]));
  });

  it('按下与抬起分别发 press / release', () => {
    bindTouchInput(wx, input, hitTest);
    wx.touch('start', [1, 50, 0]);
    wx.touch('end', [1, 50, 0]);
    expect(log).toEqual([
      ['Left', 'press'],
      ['Left', 'release'],
    ]);
  });

  it('多指同时按不同按键互不影响', () => {
    bindTouchInput(wx, input, hitTest);
    wx.touch('start', [1, 50, 0]);
    wx.touch('start', [2, 250, 0]);
    wx.touch('end', [2, 250, 0]);
    expect(input.pressed.has('Left')).toBe(true);
    expect(log).toEqual([
      ['Left', 'press'],
      ['A', 'press'],
      ['A', 'release'],
    ]);
  });

  it('手指滑到另一个按键上时松开原键、按下新键；滑出按键区则松开', () => {
    bindTouchInput(wx, input, hitTest);
    wx.touch('start', [1, 50, 0]);
    wx.touch('move', [1, 60, 0]);
    wx.touch('move', [1, 150, 0]);
    wx.touch('move', [1, 350, 0]);
    expect(log).toEqual([
      ['Left', 'press'],
      ['Left', 'release'],
      ['Right', 'press'],
      ['Right', 'release'],
    ]);
  });

  it('两根手指按同一个键，最后一根离开才 release', () => {
    bindTouchInput(wx, input, hitTest);
    wx.touch('start', [1, 50, 0]);
    wx.touch('start', [2, 60, 0]);
    wx.touch('end', [1, 50, 0]);
    expect(input.pressed.has('Left')).toBe(true);
    wx.touch('cancel', [2, 60, 0]);
    expect(log).toEqual([
      ['Left', 'press'],
      ['Left', 'release'],
    ]);
  });

  it('解绑后移除监听，并松开仍按住的键', () => {
    const unbind = bindTouchInput(wx, input, hitTest);
    wx.touch('start', [1, 50, 0]);
    unbind();
    expect(wx.listenerCount()).toBe(0);
    expect(input.pressed.has('Left')).toBe(false);
    wx.touch('start', [2, 150, 0]);
    expect(log).toEqual([
      ['Left', 'press'],
      ['Left', 'release'],
    ]);
  });
});
