import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createHeadlessContext } from '@/platform/headless';

import { App } from '../App';

vi.mock('@/platform/browser', async () => {
  const actual = await vi.importActual<typeof import('@/platform/browser')>('@/platform/browser');
  return {
    ...actual,
    bindKeyboardInput: vi.fn(() => () => undefined),
    createBrowserContext: vi.fn(),
  };
});

import { createBrowserContext } from '@/platform/browser';

function createMockContext(soundOn: boolean, canAutoplay = true) {
  const ctx = createHeadlessContext({ seed: 1 });
  ctx.soundOn.set(soundOn);

  const playMelody = vi.fn(() => () => undefined);
  const sound = {
    ...ctx.sound,
    playMelody,
    canAutoplay: vi.fn().mockResolvedValue(canAutoplay),
  };

  return {
    ctx: { ...ctx, sound },
    playMelody,
  };
}

describe('App 开机旋律', () => {
  it('soundOn=false 时，autoplay 通电不会播放开机旋律', async () => {
    const { ctx, playMelody } = createMockContext(false);
    vi.mocked(createBrowserContext).mockReturnValue(ctx);

    render(<App />);

    await waitFor(() => {
      expect(playMelody).not.toHaveBeenCalled();
    });
  });

  it('soundOn=true 时，autoplay 通电会播放开机旋律', async () => {
    const { ctx, playMelody } = createMockContext(true);
    vi.mocked(createBrowserContext).mockReturnValue(ctx);

    render(<App />);

    await waitFor(() => {
      expect(playMelody).toHaveBeenCalledTimes(1);
    });
  });
});

describe('App 关机态按键', () => {
  it('关机状态下按 Sound 不会切换 soundOn', async () => {
    // canAutoplay=false：mount 后保持 off 状态，模拟"未点过页面"或 Safari
    const { ctx } = createMockContext(true, false);
    vi.mocked(createBrowserContext).mockReturnValue(ctx);

    render(<App />);

    // 等 mount 时的 canAutoplay 探测落地，确保进入稳定 off 态
    await waitFor(() => {
      expect(ctx.sound.canAutoplay).toHaveBeenCalled();
    });

    const before = ctx.soundOn.value;
    ctx.input.emit('Sound', 'press');
    expect(ctx.soundOn.value).toBe(before);
  });

  it('关机状态下按 Pause 不会切换 pause', async () => {
    const { ctx } = createMockContext(true, false);
    vi.mocked(createBrowserContext).mockReturnValue(ctx);

    render(<App />);
    await waitFor(() => {
      expect(ctx.sound.canAutoplay).toHaveBeenCalled();
    });

    expect(ctx.pause.value).toBe(false);
    ctx.input.emit('Pause', 'press');
    expect(ctx.pause.value).toBe(false);
  });
});
