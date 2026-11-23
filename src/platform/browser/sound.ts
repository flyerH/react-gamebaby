import { createSynthSound, SFX_SAMPLE_PATH } from '@/engine/synth-sound';
import type { Sound } from '@/engine/types';

/**
 * 部分 Safari / iOS 仍用 webkitAudioContext 前缀名；测试通过 globalThis 注入桩
 */
interface GlobalWithAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  const g = globalThis as unknown as GlobalWithAudio;
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** 浏览器 Sound：new AudioContext() + fetch 加载采样，交给 engine 的 createSynthSound */
export function createBrowserSound(): Sound {
  return createSynthSound<AudioContext>({
    createContext: () => {
      const Ctor = resolveAudioContextCtor();
      return Ctor ? new Ctor() : null;
    },
    loadSample: async (ac) => {
      if (typeof fetch !== 'function') throw new Error('fetch unavailable');
      const res = await fetch(SFX_SAMPLE_PATH);
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      return ac.decodeAudioData(await res.arrayBuffer());
    },
  });
}
