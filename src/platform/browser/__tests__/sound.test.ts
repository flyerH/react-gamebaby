import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBrowserSound } from '../sound';

/**
 * 造一个最小可观察的 AudioContext mock，跟踪 createOscillator 调用次数，
 * 以及 Oscillator 的 start / stop；不验证精确波形，只验证"效果确实被派发"。
 */
interface FakeAudioContext {
  readonly __oscCount: { count: number };
  readonly __startCount: { count: number };
  currentTime: number;
  destination: unknown;
  state: 'running' | 'suspended' | 'closed';
  createOscillator: () => FakeOscillator;
  createGain: () => FakeGain;
  resume: () => Promise<void>;
}

interface FakeOscillator {
  type: OscillatorType;
  frequency: {
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
  };
  connect: (dst: unknown) => unknown;
  start: (t: number) => void;
  stop: (t: number) => void;
}

interface FakeGain {
  gain: {
    value: number;
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
    setTargetAtTime: (target: number, startTime: number, timeConstant: number) => void;
    cancelScheduledValues: (startTime: number) => void;
  };
  connect: (dst: unknown) => unknown;
}

function createFakeAudioContext(): FakeAudioContext {
  const oscCount = { count: 0 };
  const startCount = { count: 0 };
  const makeOsc = (): FakeOscillator => ({
    type: 'sine',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(() => {
      startCount.count += 1;
    }),
    stop: vi.fn(),
  });
  const makeGain = (): FakeGain => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
  });
  return {
    __oscCount: oscCount,
    __startCount: startCount,
    currentTime: 0,
    destination: {},
    state: 'running',
    createOscillator: vi.fn(() => {
      oscCount.count += 1;
      return makeOsc();
    }),
    createGain: vi.fn(() => makeGain()),
    resume: vi.fn().mockResolvedValue(undefined),
  };
}

describe('createBrowserSound', () => {
  let fakeCtx: FakeAudioContext;
  const g = globalThis as unknown as { AudioContext?: unknown; fetch?: unknown };
  let savedFetch: unknown;

  beforeEach(() => {
    fakeCtx = createFakeAudioContext();
    // 必须是 class / function 形式，支持 `new Ctor()`
    g.AudioContext = function AudioContext(this: FakeAudioContext): FakeAudioContext {
      return fakeCtx;
    };
    // 屏蔽 fetch：测试不验证 sample 加载的异步路径，避免 jsdom 真发请求 / 异步污染断言
    savedFetch = g.fetch;
    delete g.fetch;
  });

  afterEach(() => {
    delete g.AudioContext;
    if (savedFetch !== undefined) g.fetch = savedFetch;
  });

  it('默认 enabled：单 voice 的 effect play 一次起 1 个 Oscillator', () => {
    const s = createBrowserSound();
    s.play('rotate');
    expect(fakeCtx.__oscCount.count).toBe(1);
    expect(fakeCtx.__startCount.count).toBe(1);
  });

  it('setEnabled(false) 后 play 仍调度 Oscillator（实时静音语义：靠 masterGain 控制听感）', () => {
    const s = createBrowserSound();
    s.setEnabled(false);
    s.play('clear');
    // 调度照常发生，便于 "OFF→ON 切换时立即听到正在播的尾段"
    expect(fakeCtx.__oscCount.count).toBe(1);
  });

  it('setEnabled 切换 → masterGain 平滑过渡到 0 / 1，不中断已调度的音源', () => {
    const s = createBrowserSound();
    // ensureCtx 在 createBrowserSound 内已通过 preloadSample → ensureCtx 触发，
    // 这里再 play 一次确保 audioCtx 已就绪
    s.play('rotate');
    // 第 1 个 createGain 是 masterGain（ensureCtx 时建），第 2 个起是 voice gain
    const masterGainMock = (
      fakeCtx.createGain as unknown as { mock: { results: Array<{ value: FakeGain }> } }
    ).mock.results[0]?.value;
    expect(masterGainMock).toBeTruthy();
    s.setEnabled(false);
    expect(masterGainMock?.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      expect.any(Number)
    );
    s.setEnabled(true);
    expect(masterGainMock?.gain.setTargetAtTime).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('每次 play 独立建新 Oscillator（不复用旧节点）', () => {
    const s = createBrowserSound();
    s.play('rotate');
    s.play('clear');
    s.play('start');
    expect(fakeCtx.__oscCount.count).toBe(3);
  });

  it('move / over 走 sample 路径：buffer 没就绪时静默不创建 Oscillator', () => {
    // 测试环境屏蔽了 fetch，sampleBuffer 永远 null，move/over 应该静默 no-op，
    // 而不是退化成 oscillator 合成（用户已确认合成版完全不像）
    const s = createBrowserSound();
    s.play('move');
    s.play('over');
    expect(fakeCtx.__oscCount.count).toBe(0);
  });

  it('enabled 状态能被读取，初始 true', () => {
    const s = createBrowserSound();
    expect(s.enabled).toBe(true);
    s.setEnabled(false);
    expect(s.enabled).toBe(false);
    s.setEnabled(true);
    expect(s.enabled).toBe(true);
  });

  it('play 入口：AudioContext suspended 时自动 resume（用户首次按键即解锁）', () => {
    fakeCtx.state = 'suspended';
    const s = createBrowserSound();
    s.play('rotate');
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
  });

  it('setEnabled(true) 也会兜底 resume 一次（点 Sound 键的路径）', () => {
    fakeCtx.state = 'suspended';
    const s = createBrowserSound();
    s.setEnabled(false);
    s.setEnabled(true);
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
  });

  it('canAutoplay：state running 时直接 true，无需 resume', async () => {
    fakeCtx.state = 'running';
    const s = createBrowserSound();
    await expect(s.canAutoplay()).resolves.toBe(true);
    expect(fakeCtx.resume).not.toHaveBeenCalled();
  });

  it('canAutoplay：suspended → resume 后 running，返回 true', async () => {
    fakeCtx.state = 'suspended';
    fakeCtx.resume = vi.fn(() => {
      fakeCtx.state = 'running';
      return Promise.resolve();
    });
    const s = createBrowserSound();
    await expect(s.canAutoplay()).resolves.toBe(true);
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
  });

  it('canAutoplay：suspended 且 resume 后仍 suspended，返回 false', async () => {
    fakeCtx.state = 'suspended';
    fakeCtx.resume = vi.fn().mockResolvedValue(undefined);
    const s = createBrowserSound();
    await expect(s.canAutoplay()).resolves.toBe(false);
  });

  it('canAutoplay：resume reject（Safari 类）安全降级 false', async () => {
    fakeCtx.state = 'suspended';
    fakeCtx.resume = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const s = createBrowserSound();
    await expect(s.canAutoplay()).resolves.toBe(false);
  });
});
