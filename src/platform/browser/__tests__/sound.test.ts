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
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
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
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
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
  const g = globalThis as unknown as { AudioContext?: unknown };

  beforeEach(() => {
    fakeCtx = createFakeAudioContext();
    // 必须是 class / function 形式，支持 `new Ctor()`
    g.AudioContext = function AudioContext(this: FakeAudioContext): FakeAudioContext {
      return fakeCtx;
    };
  });

  afterEach(() => {
    delete g.AudioContext;
  });

  it('默认 disabled：play 不建任何 Oscillator', () => {
    const s = createBrowserSound();
    s.play('move');
    expect(fakeCtx.__oscCount.count).toBe(0);
  });

  it('enabled 后 play 触发一次 Oscillator start + stop', () => {
    const s = createBrowserSound();
    s.setEnabled(true);
    s.play('clear');
    expect(fakeCtx.__oscCount.count).toBe(1);
    expect(fakeCtx.__startCount.count).toBe(1);
  });

  it('每次 play 独立建新 Oscillator（不复用旧节点）', () => {
    const s = createBrowserSound();
    s.setEnabled(true);
    s.play('move');
    s.play('rotate');
    s.play('over');
    expect(fakeCtx.__oscCount.count).toBe(3);
  });

  it('enabled 状态能被读取', () => {
    const s = createBrowserSound();
    expect(s.enabled).toBe(false);
    s.setEnabled(true);
    expect(s.enabled).toBe(true);
    s.setEnabled(false);
    expect(s.enabled).toBe(false);
  });

  it('AudioContext 处于 suspended 时 setEnabled(true) 触发 resume', () => {
    fakeCtx.state = 'suspended';
    const s = createBrowserSound();
    s.setEnabled(true);
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
  });
});
