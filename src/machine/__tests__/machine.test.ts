import { describe, expect, it, vi } from 'vitest';

import type { Button, HardwareContext } from '@/engine/types';
import { createHeadlessContext, type HeadlessTicker } from '@/platform/headless';
import { createRegistry, type Game } from '@/sdk';

import { type AutopilotProvider, createMachine } from '../machine';

interface CountState {
  readonly n: number;
  readonly over: boolean;
}

/** 可玩游戏：每 tick n+1；A 结束本局，Up 加 10 分，松开 Down 加 1 分（用于观察 release 是否送达） */
const countGame: Game<CountState> = {
  id: 'count',
  name: 'Count',
  preview: [[0, 0]],
  tickSpeeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  init: (env, opts) => {
    env.score.set(0);
    return { n: opts?.level ?? 1, over: false };
  },
  step: (_env, s) => (s.over ? s : { ...s, n: s.n + 1 }),
  render: (env, s) => {
    env.screen.clear();
    env.screen.setPixel(s.n % 10, 0, true);
  },
  onButton: (env, s, btn, action) => {
    if (action === 'release' && btn === 'Down') env.score.add(1);
    if (action !== 'press') return s;
    if (btn === 'A') return { ...s, over: true };
    if (btn === 'Up') env.score.add(10);
    return s;
  },
  isGameOver: (s) => s.over,
};

/** 只有 demo 的游戏：demo 起点取自 env.rng，用于验证 demo 种子可重现 */
const demoGame: Game<number> = {
  id: 'demo',
  name: 'Demo',
  preview: [[9, 19]],
  demoInit: (env) => Math.floor(env.rng() * 1000),
  demoStep: (_env, s) => s + 1,
  render: (env, s) => {
    env.screen.clear();
    env.screen.setPixel(s % 10, 0, true);
  },
};

/** 预览占位条目：没有 init / step，按 A 不进入 */
const stubGame: Game = { id: 'stub', name: 'Stub', preview: [[5, 5]] };

const registry = createRegistry([countGame, demoGame, stubGame] as readonly Game[]);

interface SetupOptions {
  canAutoplay?: boolean;
  soundOn?: boolean;
  autopilot?: AutopilotProvider;
  prepare?: (ctx: HardwareContext) => void;
}

function setup(opts: SetupOptions = {}) {
  const base = createHeadlessContext({ seed: 1 });
  base.soundOn.set(opts.soundOn ?? true);
  const cancelMelody = vi.fn();
  const sound = {
    ...base.sound,
    play: vi.fn(),
    playMelody: vi.fn(() => cancelMelody),
    suspend: vi.fn(),
    resume: vi.fn(),
    canAutoplay: vi.fn(() => Promise.resolve(opts.canAutoplay ?? false)),
  };
  const ctx: HardwareContext = { ...base, sound };
  opts.prepare?.(ctx);
  const ticker = ctx.ticker as HeadlessTicker;
  const machine = createMachine({
    ctx,
    games: registry,
    seed: 7,
    ...(opts.autopilot ? { autopilot: opts.autopilot } : {}),
  });
  machine.start();

  const press = (btn: Button): void => {
    ctx.input.emit(btn, 'press');
    ctx.input.emit(btn, 'release');
  };
  /** 通电并跳过开机动画，停在菜单第一款游戏 */
  const toSelect = (): void => {
    press('Start');
    press('Left');
  };
  /** 进入菜单第一款可玩游戏 */
  const toPlaying = (): void => {
    toSelect();
    press('A');
  };

  return { ctx, ticker, machine, sound, cancelMelody, press, toSelect, toPlaying };
}

describe('createMachine · 开关机', () => {
  it('不能自动发声时保持关机，按 Start 通电并播放开机音乐', async () => {
    const { machine, sound, press } = setup();
    await Promise.resolve();
    expect(machine.getState().mode).toBe('off');

    press('Start');
    expect(machine.getState().mode).toBe('boot');
    expect(sound.playMelody).toHaveBeenCalledTimes(1);
  });

  it('能自动发声时启动后自动通电', async () => {
    const { machine } = setup({ canAutoplay: true });
    await vi.waitFor(() => {
      expect(machine.getState().mode).toBe('boot');
    });
  });

  it('能自动发声但检测结果返回前已进入后台时，保持关机', async () => {
    const { machine, sound } = setup({ canAutoplay: true });
    machine.suspend();
    await Promise.resolve();
    await Promise.resolve();
    expect(machine.getState().mode).toBe('off');
    expect(sound.playMelody).not.toHaveBeenCalled();
  });

  it('静音时通电不播放开机音乐', () => {
    const { machine, sound, press } = setup({ soundOn: false });
    press('Start');
    expect(machine.getState().mode).toBe('boot');
    expect(sound.playMelody).not.toHaveBeenCalled();
  });

  it('关机态按 Sound / Pause 不生效', () => {
    const { ctx, press } = setup();
    press('Sound');
    press('Pause');
    expect(ctx.soundOn.value).toBe(true);
    expect(ctx.pause.value).toBe(false);
  });

  it('开机动画期间任意键停止开机音乐并进入菜单', () => {
    const { machine, cancelMelody, press } = setup();
    press('Start');
    press('Down');
    expect(cancelMelody).toHaveBeenCalled();
    expect(machine.getState().mode).toBe('select');
  });

  it('通电态按 Start 关机并清除暂停', () => {
    const { ctx, machine, press, toPlaying } = setup();
    toPlaying();
    press('Pause');
    expect(ctx.pause.value).toBe(true);

    press('Start');
    expect(machine.getState().mode).toBe('off');
    expect(ctx.pause.value).toBe(false);
  });
});

describe('createMachine · 菜单', () => {
  it('Left / Right 切游戏，Up / Down 调 speed / level', () => {
    const { machine, press, toSelect } = setup();
    toSelect();
    press('Right');
    press('Up');
    press('Down');
    press('Down');
    expect(machine.getState().menu).toEqual({ selectedIndex: 1, speed: 2, level: 3 });
  });

  it('A 进入可玩游戏并传入菜单的 speed / level；预览占位条目不进入', () => {
    const { machine, press, toSelect } = setup();
    toSelect();
    press('Left');
    press('A');
    expect(machine.getState().mode).toBe('select');

    press('Right');
    press('Down');
    press('A');
    const state = machine.getState();
    expect(state.mode).toBe('playing');
    expect(state.playingId).toBe('count');
    expect(state.gameState).toEqual({ n: 2, over: false });
  });

  it('demo 种子由 machine 的 seed 派生：两台同 seed 的机器演示画面一致', () => {
    const a = setup();
    const b = setup();
    for (const m of [a, b]) {
      m.toSelect();
      m.press('Right');
      m.ticker.advance(5);
    }
    expect(a.machine.getState().demoState).toBe(b.machine.getState().demoState);
    expect(Array.from(a.ctx.screen.buffer)).toEqual(Array.from(b.ctx.screen.buffer));
    // demo 画到主屏第 6 行起
    const demo = a.machine.getState().demoState as number;
    expect(a.ctx.screen.getPixel(demo % 10, 6)).toBe(true);
  });
});

describe('createMachine · 游戏运行', () => {
  it('tick 推进 step 并绘制，ticker 速度取 tickSpeeds[speed-1]', () => {
    const { ctx, ticker, machine, press, toSelect } = setup();
    toSelect();
    press('Up');
    press('A');
    expect(ticker.speed).toBe(2);

    ticker.advance(3);
    expect(machine.getState().gameState).toEqual({ n: 4, over: false });
    expect(ctx.screen.getPixel(4, 0)).toBe(true);
  });

  it('game over 时切到固定的动画速度', () => {
    const { ticker, press, toPlaying } = setup();
    toPlaying();
    press('A');
    expect(ticker.speed).toBe(30);
  });

  it('暂停时 ticker 停止且拦截游戏键；Reset 清除暂停并重开', () => {
    const { ctx, ticker, machine, press, toPlaying } = setup();
    toPlaying();
    ticker.advance(2);
    press('Pause');
    expect(ticker.advance(1)).toBe(0);
    press('A');
    expect(machine.getState().gameState).toEqual({ n: 3, over: false });

    press('Reset');
    expect(ctx.pause.value).toBe(false);
    expect(machine.getState().gameState).toEqual({ n: 1, over: false });
    expect(ticker.advance(1)).toBe(1);
  });

  it('暂停时仍送达 release，避免恢复后游戏内按住状态残留', () => {
    const { ctx, press, toPlaying } = setup();
    toPlaying();
    press('Pause');
    ctx.input.emit('Down', 'press');
    ctx.input.emit('Down', 'repeat');
    ctx.input.emit('Down', 'release');
    expect(ctx.score.value).toBe(1);
  });

  it('Select 退回菜单并清空副屏', () => {
    const { ctx, machine, press, toPlaying } = setup();
    toPlaying();
    ctx.auxScreen.setPixel(0, 0, true);
    press('Select');
    expect(machine.getState().mode).toBe('select');
    expect(ctx.auxScreen.getPixel(0, 0)).toBe(false);
  });

  it('游戏键按下与长按连发发出提示音，release 与 Reset 不发声', () => {
    const { ctx, sound, toPlaying } = setup();
    toPlaying();
    sound.play.mockClear();
    ctx.input.emit('Left', 'press');
    ctx.input.emit('Left', 'repeat');
    ctx.input.emit('Left', 'release');
    ctx.input.emit('Reset', 'press');
    expect(sound.play).toHaveBeenCalledTimes(2);
  });
});

describe('createMachine · 最高分', () => {
  it('分数超过纪录时写入存储并通知订阅者', () => {
    const { ctx, machine, press, toPlaying } = setup();
    toPlaying();
    const listener = vi.fn();
    machine.subscribe(listener);

    press('Up');
    expect(machine.getHiScore()).toBe(10);
    expect(ctx.storage.get('hi-score:count')).toBe(10);
    expect(listener).toHaveBeenCalled();
  });

  it('菜单态显示选中游戏的纪录', () => {
    const { machine, toSelect } = setup({
      prepare: (ctx) => {
        ctx.storage.set('hi-score:count', 99);
      },
    });
    toSelect();
    expect(machine.getHiScore()).toBe(99);
  });
});

describe('createMachine · 生命周期', () => {
  it('suspend 暂停 ticker 并挂起音频，resume 恢复', () => {
    const { ticker, machine, sound, toPlaying } = setup();
    toPlaying();
    machine.suspend();
    expect(sound.suspend).toHaveBeenCalled();
    expect(ticker.advance(1)).toBe(0);

    machine.resume();
    expect(sound.resume).toHaveBeenCalled();
    expect(ticker.advance(1)).toBe(1);
  });

  it('stop 后不再响应输入与 tick，再次 start 恢复', () => {
    const { ticker, machine, press } = setup();
    machine.stop();
    press('Start');
    expect(machine.getState().mode).toBe('off');
    expect(ticker.advance(1)).toBe(0);

    machine.start();
    press('Start');
    expect(machine.getState().mode).toBe('boot');
  });
});

describe('createMachine · 自动玩', () => {
  function createPilot() {
    const act = vi.fn<(gameState: unknown) => Button | null>(() => null);
    const dispose = vi.fn();
    const provider: AutopilotProvider = {
      gameId: 'count',
      load: vi.fn(() => Promise.resolve({ act, dispose })),
    };
    return { act, dispose, provider };
  }

  it('菜单按 B 加载后进入自动玩，每 tick 注入 act 返回的按键', async () => {
    const { act, provider } = createPilot();
    const { ctx, ticker, machine, press, toSelect } = setup({ autopilot: provider });
    toSelect();
    press('B');
    await vi.waitFor(() => {
      expect(machine.getState().aiPlaying).toBe(true);
    });
    expect(machine.getState().mode).toBe('playing');

    act.mockReturnValueOnce('Up');
    ticker.advance(1);
    expect(act).toHaveBeenCalledTimes(1);
    expect(ctx.score.value).toBe(10);
  });

  it('game over 后约 1.2s（36 tick）自动重开', async () => {
    const { act, provider } = createPilot();
    const { ticker, machine, press, toSelect } = setup({ autopilot: provider });
    toSelect();
    press('B');
    await vi.waitFor(() => {
      expect(machine.getState().aiPlaying).toBe(true);
    });

    act.mockReturnValueOnce('A');
    ticker.advance(35);
    expect(machine.getState().gameState).toMatchObject({ over: true });
    ticker.advance(1);
    expect(machine.getState().gameState).toEqual({ n: 1, over: false });
  });

  it('退出自动玩时释放实例', async () => {
    const { dispose, provider } = createPilot();
    const { machine, press, toSelect } = setup({ autopilot: provider });
    toSelect();
    press('B');
    await vi.waitFor(() => {
      expect(machine.getState().aiPlaying).toBe(true);
    });

    press('Select');
    expect(machine.getState().aiPlaying).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('stop 时释放实例并退出自动玩，再次 start 由玩家接管', async () => {
    const { act, dispose, provider } = createPilot();
    const { ticker, machine, press, toSelect } = setup({ autopilot: provider });
    const listener = vi.fn();
    machine.subscribe(listener);
    toSelect();
    press('B');
    await vi.waitFor(() => {
      expect(machine.getState().aiPlaying).toBe(true);
    });

    listener.mockClear();
    machine.stop();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toMatchObject({ mode: 'playing', aiPlaying: false });
    expect(listener).toHaveBeenCalledTimes(1);

    machine.start();
    ticker.advance(1);
    expect(act).not.toHaveBeenCalled();
  });

  it('加载期间切到其它游戏时丢弃加载结果', async () => {
    const dispose = vi.fn();
    let finish = (): void => undefined;
    const provider: AutopilotProvider = {
      gameId: 'count',
      load: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ act: () => null, dispose });
          };
        }),
    };
    const { machine, press, toSelect } = setup({ autopilot: provider });
    toSelect();
    press('B');
    press('Right');
    finish();

    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
    });
    expect(machine.getState()).toMatchObject({ mode: 'select', aiPlaying: false });
  });

  it('非 gameId 对应的游戏上按 B 不加载；加载失败时留在菜单', async () => {
    const provider: AutopilotProvider = {
      gameId: 'count',
      load: vi.fn(() => Promise.reject(new Error('load failed'))),
    };
    const { machine, press, toSelect } = setup({ autopilot: provider });
    toSelect();
    press('Right');
    press('B');
    expect(provider.load).not.toHaveBeenCalled();

    press('Left');
    press('B');
    await vi.waitFor(() => {
      expect(provider.load).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    expect(machine.getState().mode).toBe('select');
  });
});
