import { describe, expect, it } from 'vitest';

import { SFX_SAMPLE_PATH } from '@/engine/synth-sound';

import type { WxFileSystemManager } from '../api';
import { createWechatSound } from '../sound';

import { createFakeAudioContext } from './fake-wx';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('createWechatSound', () => {
  it('从包内读取采样并解码，之后 move 走采样播放', async () => {
    const started: string[] = [];
    const paths: string[] = [];
    const fs: WxFileSystemManager = {
      readFile: ({ filePath, success }) => {
        paths.push(filePath);
        success({ data: new ArrayBuffer(8) });
      },
    };
    const sound = createWechatSound({
      createWebAudioContext: () => createFakeAudioContext(started),
      getFileSystemManager: () => fs,
    });
    await flush();

    sound.play('move');
    expect(paths).toEqual([SFX_SAMPLE_PATH]);
    expect(started).toEqual(['sample']);
  });

  it('采样读取失败时 move 静默；方波音效渲染成缓冲区播放，不用振荡器', async () => {
    const started: string[] = [];
    const sound = createWechatSound({
      createWebAudioContext: () => createFakeAudioContext(started),
      getFileSystemManager: () => ({
        readFile: ({ fail }) => {
          fail(new Error('missing'));
        },
      }),
    });
    await flush();

    sound.play('move');
    sound.play('rotate');
    expect(started).toEqual(['sample']);
  });

  it('WebAudio 实现缺方法导致抛错时不向外抛，canAutoplay 返回 false', async () => {
    const broken = {
      ...createFakeAudioContext(),
      state: 'suspended',
      createBuffer: () => {
        throw new Error('not supported');
      },
      resume: () => Promise.reject(new Error('denied')),
    };
    const sound = createWechatSound({
      createWebAudioContext: () => broken,
      getFileSystemManager: () => ({
        readFile: ({ fail }) => {
          fail(new Error('missing'));
        },
      }),
    });
    expect(() => {
      sound.play('rotate');
      sound.playMelody([{ freq: 440, duration: 0.1 }])();
    }).not.toThrow();
    await expect(sound.canAutoplay()).resolves.toBe(false);
  });
});
