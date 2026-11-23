import { describe, expect, it, vi } from 'vitest';

import {
  type AudioContextLike,
  type AudioParamLike,
  type BufferSourceNodeLike,
  createSynthSound,
  renderSquareTones,
} from '../synth-sound';

function param(): AudioParamLike {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

interface FakeSource extends BufferSourceNodeLike {
  readonly started: Array<readonly [number?, number?, number?]>;
  stopped: number;
}

function createFakeContext(state = 'running') {
  const sources: FakeSource[] = [];
  const gains: Array<{ gain: AudioParamLike; disconnected: number }> = [];
  const calls = { resume: 0, suspend: 0, createBuffer: 0 };
  let oscillators = 0;
  const ctx: AudioContextLike & { state: string } = {
    currentTime: 0,
    sampleRate: 8000,
    state,
    destination: { connect: vi.fn() },
    createGain: () => {
      const g = {
        gain: param(),
        disconnected: 0,
        connect: vi.fn(),
        disconnect: () => {
          g.disconnected++;
        },
      };
      gains.push(g);
      return g;
    },
    createBuffer: (_channels, length) => {
      calls.createBuffer++;
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createOscillator: () => {
      oscillators++;
      return { type: 'sine', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    },
    createBufferSource: () => {
      const src: FakeSource = {
        buffer: null,
        onended: null,
        started: [],
        stopped: 0,
        connect: vi.fn(),
        start(when, offset, duration) {
          src.started.push([when, offset, duration]);
        },
        stop() {
          src.stopped++;
        },
      };
      sources.push(src);
      return src;
    },
    resume: () => {
      calls.resume++;
      return Promise.resolve();
    },
    suspend: () => {
      calls.suspend++;
      return Promise.resolve();
    },
  };
  return { ctx, sources, gains, calls, oscillators: () => oscillators };
}

describe('createSynthSound', () => {
  it('采样加载完成后 move 按切片播放，连续触发时截断上一个', async () => {
    const { ctx, sources } = createFakeContext();
    const buffer = { id: 'sfx' };
    const sound = createSynthSound({
      createContext: () => ctx,
      loadSample: () => Promise.resolve(buffer),
    });
    await Promise.resolve();
    await Promise.resolve();

    sound.play('move');
    sound.play('move');
    expect(sources).toHaveLength(2);
    expect(sources[0]!.buffer).toBe(buffer);
    expect(sources[0]!.started[0]).toEqual([0, 0, 0.1]);
    expect(sources[0]!.stopped).toBe(1);
  });

  it('采样加载失败时 move / over 静默，合成音效照常', async () => {
    const { ctx, sources, oscillators } = createFakeContext();
    const sound = createSynthSound({
      createContext: () => ctx,
      loadSample: () => Promise.reject(new Error('decode failed')),
    });
    await Promise.resolve();
    await Promise.resolve();

    sound.play('over');
    sound.play('rotate');
    expect(sources).toHaveLength(0);
    expect(oscillators()).toBe(1);
  });

  it('不传 loadSample 时不加载采样', () => {
    const { ctx, sources } = createFakeContext();
    const sound = createSynthSound({ createContext: () => ctx });
    sound.play('move');
    expect(sources).toHaveLength(0);
  });

  it('createContext 返回 null 或抛错时所有方法安全 no-op', async () => {
    for (const createContext of [
      () => null,
      () => {
        throw new Error('unsupported');
      },
    ]) {
      const sound = createSynthSound({ createContext });
      expect(() => {
        sound.play('rotate');
        sound.playMelody([{ freq: 440, duration: 0.1 }])();
        sound.setEnabled(false);
        sound.suspend();
        sound.resume();
      }).not.toThrow();
      await expect(sound.canAutoplay()).resolves.toBe(false);
    }
  });

  it('挂起尚未完成就回到前台时仍请求恢复，上下文关闭后不再调用', () => {
    const { ctx, calls } = createFakeContext('running');
    const sound = createSynthSound({ createContext: () => ctx });
    sound.play('rotate');
    sound.suspend();
    sound.resume();
    expect(calls).toMatchObject({ suspend: 1, resume: 1 });

    ctx.state = 'closed';
    sound.suspend();
    sound.resume();
    expect(calls).toMatchObject({ suspend: 1, resume: 1 });
  });

  describe("toneMode: 'buffer'", () => {
    it('方波音效渲染成 AudioBuffer 播放，不创建振荡器，同一音效只渲染一次', () => {
      const { ctx, sources, calls, oscillators } = createFakeContext();
      const sound = createSynthSound({ createContext: () => ctx, toneMode: 'buffer' });
      sound.play('rotate');
      sound.play('rotate');
      expect(oscillators()).toBe(0);
      expect(sources).toHaveLength(2);
      expect(sources[0]!.buffer).toBe(sources[1]!.buffer);
      expect(calls.createBuffer).toBe(1);
    });

    it('开机音乐整段渲染为一个音源；取消时音量置零、停止并断开', () => {
      const { ctx, sources, gains } = createFakeContext();
      const sound = createSynthSound({ createContext: () => ctx, toneMode: 'buffer' });
      const cancel = sound.playMelody([
        { freq: 440, duration: 0.1 },
        { freq: 0, duration: 0.1 },
        { freq: 660, duration: 0.1 },
      ]);
      expect(sources).toHaveLength(1);
      expect(sources[0]!.started).toHaveLength(1);

      cancel();
      const melodyGain = gains[gains.length - 1]!;
      expect(melodyGain.gain.value).toBe(0);
      expect(melodyGain.disconnected).toBe(1);
      expect(sources[0]!.stopped).toBe(1);
    });
  });
});

describe('renderSquareTones', () => {
  it('长度覆盖所有段；起点为峰值电平，衰减结束后静音', () => {
    const out = renderSquareTones(
      [{ start: 0.5, duration: 0.5, freq: 100, peak: 0.1, fadeEnd: 0.25 }],
      1000
    );
    expect(out).toHaveLength(1000);
    expect(out[499]).toBe(0);
    expect(Math.abs(out[500]!)).toBeCloseTo(0.1, 5);
    expect(Math.abs(out[740]!)).toBeLessThan(0.001);
    expect(out[800]).toBe(0);
  });

  it('输出方波：每个周期正负各半', () => {
    const out = renderSquareTones([{ start: 0, duration: 1, freq: 10, peak: 1, fadeEnd: 1 }], 1000);
    const firstPeriod = Array.from(out.slice(0, 100));
    expect(firstPeriod.filter((v) => v > 0)).toHaveLength(50);
    expect(firstPeriod.filter((v) => v < 0)).toHaveLength(50);
  });

  it('slideTo 让频率指数上升：后半段的过零次数多于前半段', () => {
    const out = renderSquareTones(
      [{ start: 0, duration: 1, freq: 20, slideTo: 80, peak: 1, fadeEnd: 1 }],
      2000
    );
    const crossings = (from: number, to: number): number => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (Math.sign(out[i]!) !== Math.sign(out[i - 1]!)) n++;
      return n;
    };
    expect(crossings(1000, 2000)).toBeGreaterThan(crossings(0, 1000));
  });

  it('多段在重叠区间相加', () => {
    const seg = { start: 0, duration: 0.01, freq: 10, peak: 0.2, fadeEnd: 0.01 };
    const out = renderSquareTones([seg, seg], 1000);
    expect(out[0]).toBeCloseTo(0.4, 5);
  });
});
