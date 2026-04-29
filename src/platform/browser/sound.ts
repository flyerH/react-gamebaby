import type { Sound, SoundEffect } from '@/engine/types';

/**
 * Web Audio 合成的 8-bit 短音效
 *
 * 每种 SoundEffect 映射到一段预设：振荡器波形 + 起始频率 + 可选频率滑移
 * + 持续时长。单音合成（OscillatorNode → GainNode），指数衰减包络做收尾，
 * 听感接近真机 buzzer。
 *
 * 浏览器自动播放策略：AudioContext 在首次用户手势前可能处于 'suspended'。
 * setEnabled(true) 里会 resume()；调用入口通常是按下 Sound 键（已算手势）。
 */

interface Preset {
  readonly type: OscillatorType;
  /** 起始频率（Hz） */
  readonly freq: number;
  /** 持续时长（秒） */
  readonly duration: number;
  /** 可选：目标频率，存在时做指数滑移 */
  readonly slideTo?: number;
  /** 峰值音量（0..1），默认 0.12 */
  readonly gain?: number;
}

const PRESETS: Readonly<Record<SoundEffect, Preset>> = {
  move: { type: 'square', freq: 220, duration: 0.02, gain: 0.06 },
  rotate: { type: 'square', freq: 440, duration: 0.05 },
  clear: { type: 'square', freq: 800, duration: 0.12, slideTo: 1200 },
  over: { type: 'sawtooth', freq: 220, duration: 0.35, slideTo: 55 },
  start: { type: 'square', freq: 600, duration: 0.18, slideTo: 900 },
  pause: { type: 'square', freq: 330, duration: 0.1 },
};

/**
 * 跨浏览器 + 测试桩：从 globalThis 上找构造器
 * 部分 Safari / iOS 仍用 webkitAudioContext 前缀名
 */
interface GlobalWithAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  const g = globalThis as unknown as GlobalWithAudio;
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createBrowserSound(): Sound {
  let enabled = false;
  let audioCtx: AudioContext | null = null;

  const ensureCtx = (): AudioContext | null => {
    if (audioCtx) return audioCtx;
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      audioCtx = null;
    }
    return audioCtx;
  };

  return {
    play(effect: SoundEffect): void {
      if (!enabled) return;
      const ac = ensureCtx();
      if (!ac) return;
      const preset = PRESETS[effect];
      const now = ac.currentTime;
      const end = now + preset.duration;
      const osc = ac.createOscillator();
      const gainNode = ac.createGain();

      osc.type = preset.type;
      osc.frequency.setValueAtTime(preset.freq, now);
      if (preset.slideTo !== undefined) {
        // exponentialRampToValueAtTime 要求目标值 > 0；预设里已保证
        osc.frequency.exponentialRampToValueAtTime(preset.slideTo, end);
      }
      const peak = preset.gain ?? 0.12;
      gainNode.gain.setValueAtTime(peak, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gainNode).connect(ac.destination);
      osc.start(now);
      osc.stop(end);
    },
    setEnabled(on: boolean): void {
      enabled = on;
      if (on) {
        const ac = ensureCtx();
        if (ac && ac.state === 'suspended') {
          void ac.resume();
        }
      }
    },
    get enabled() {
      return enabled;
    },
  };
}
