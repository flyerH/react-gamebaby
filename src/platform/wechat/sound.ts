import { createSynthSound, SFX_SAMPLE_PATH } from '@/engine/synth-sound';
import type { Sound } from '@/engine/types';

import type { MiniGameApi, WxWebAudioContext } from './api';

type SoundApi = Pick<MiniGameApi, 'createWebAudioContext' | 'getFileSystemManager'>;

/** 从小游戏包内读取采样并解码 */
function loadPackagedSample(api: SoundApi, ac: WxWebAudioContext): Promise<unknown> {
  return new Promise((resolve, reject) => {
    api.getFileSystemManager().readFile({
      filePath: SFX_SAMPLE_PATH,
      success: ({ data }) => {
        if (typeof data === 'string') {
          reject(new Error('expected binary data'));
          return;
        }
        ac.decodeAudioData(data, resolve, reject);
      },
      fail: reject,
    });
  });
}

/**
 * 小游戏 Sound：wx.createWebAudioContext + 包内采样，交给 engine 的 createSynthSound
 *
 * 各基础库版本的 WebAudio 实现不完全一致，缺少某个节点方法时会抛错。
 * 音效调用发生在按键处理链上，因此这里捕获每个方法的异常，最差情况是没有声音，
 * 不影响开关机、菜单等主机规则继续执行。
 */
export function createWechatSound(api: SoundApi): Sound {
  const sound = createSynthSound<WxWebAudioContext>({
    createContext: () => api.createWebAudioContext(),
    loadSample: (ac) => loadPackagedSample(api, ac),
    // 真机上振荡器的方波与 stop 表现与浏览器不一致（音色发闷、取消后仍继续播），
    // 方波音效与开机音乐改为预先渲染成 AudioBuffer 播放
    toneMode: 'buffer',
  });
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => R, fallback: R) =>
    (...args: A): R => {
      try {
        return fn(...args);
      } catch {
        return fallback;
      }
    };
  const noop = (): void => undefined;
  return {
    play: guard((effect) => {
      sound.play(effect);
    }, undefined),
    playMelody: guard((notes) => sound.playMelody(notes), noop),
    setEnabled: guard((on) => {
      sound.setEnabled(on);
    }, undefined),
    suspend: guard(() => {
      sound.suspend();
    }, undefined),
    resume: guard(() => {
      sound.resume();
    }, undefined),
    canAutoplay: () => sound.canAutoplay().catch(() => false),
    get enabled() {
      return sound.enabled;
    },
  };
}
