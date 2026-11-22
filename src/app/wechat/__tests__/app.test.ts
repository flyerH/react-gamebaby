import { afterEach, describe, expect, it } from 'vitest';

import type { Button } from '@/engine/types';
import type { WechatHost } from '@/platform/wechat';
import { createFakeWx, type FakeWx } from '@/platform/wechat/__tests__/fake-wx';

import { startWechatApp, type WechatApp } from '../app';

function createHost(wx: FakeWx): WechatHost & { frames: (n: number, ms?: number) => void } {
  let now = 0;
  let queue = new Map<number, (t: number) => void>();
  let seq = 1;
  return {
    wx,
    requestAnimationFrame: (cb) => {
      const id = seq++;
      queue.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id) => {
      queue.delete(id);
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => {
      clearTimeout(id);
    },
    now: () => now,
    frames(n, ms = 16) {
      for (let i = 0; i < n; i++) {
        now += ms;
        const batch = queue;
        queue = new Map();
        for (const cb of batch.values()) cb(now);
      }
    },
  };
}

describe('startWechatApp', () => {
  let app: WechatApp | null = null;
  afterEach(() => {
    app?.stop();
    app = null;
  });

  function setup() {
    const wx = createFakeWx();
    const host = createHost(wx);
    app = startWechatApp(host);
    const started = app;
    const tap = (button: Button, id = 1): void => {
      const { layout } = started;
      const { shape } = layout.buttons.find((b) => b.button === button)!;
      const x = layout.offsetX + shape.cx * layout.scale;
      const y = layout.offsetY + shape.cy * layout.scale;
      wx.touch('start', [id, x, y]);
      wx.touch('end', [id, x, y]);
    };
    return { wx, host, app: started, tap };
  }

  it('上屏 canvas 按设备像素比设置尺寸', () => {
    const { wx } = setup();
    expect(wx.canvases[0]).toMatchObject({ width: 390 * 3, height: 844 * 3 });
  });

  it('首帧画出机身与侧栏文字', () => {
    const { wx, host } = setup();
    host.frames(1);
    expect(wx.texts).toContain('GameBaby');
    expect(wx.texts).toContain('开/关');
    expect(wx.texts).toContain('返回');
  });

  it('通电后侧栏显示 SCORE 等文字，关机时不显示', () => {
    const { wx, host, tap } = setup();
    host.frames(1);
    expect(wx.texts).not.toContain('S');
    tap('Start');
    host.frames(1);
    expect(wx.texts).toContain('S');
  });

  it('点按开关键通电，任意键进入菜单，旋转键进入游戏，返回键退回菜单', () => {
    const { app: started, host, tap } = setup();
    expect(started.machine.getState().mode).toBe('off');

    tap('Start');
    expect(started.machine.getState().mode).toBe('boot');
    host.frames(10);

    tap('Down');
    expect(started.machine.getState().mode).toBe('select');

    tap('A');
    expect(started.machine.getState().mode).toBe('playing');

    tap('Select');
    expect(started.machine.getState().mode).toBe('select');
  });

  it('切到后台暂停游戏推进，回到前台恢复', () => {
    const { wx, app: started, host, tap } = setup();
    tap('Start');
    host.frames(2);
    const boot = started.machine.getState().boot;
    wx.hide();
    host.frames(30);
    expect(started.machine.getState().boot).toBe(boot);
    wx.show();
    host.frames(30);
    expect(started.machine.getState().boot).not.toBe(boot);
  });

  it('stop 后不再响应触摸', () => {
    const { wx, app: started, tap } = setup();
    started.stop();
    app = null;
    tap('Start');
    expect(started.machine.getState().mode).toBe('off');
    expect(wx.listenerCount()).toBe(0);
  });
});
