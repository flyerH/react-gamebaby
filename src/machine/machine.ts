import { createCounter, createPersistentCounter } from '@/engine/counter';
import { createInputBus } from '@/engine/input';
import { mulberry32 } from '@/engine/rng';
import { createScreen } from '@/engine/screen';
import { createNullSound } from '@/engine/sound';
import type { Button, ButtonAction, Counter, HardwareContext, Unsubscribe } from '@/engine/types';
import { type Game, type GameEnv, type GameRegistry, toGameEnv } from '@/sdk';

import {
  type BootAnimation,
  type BootState,
  createBootAnimation,
  initialBootState,
  projectBoot,
  stepBoot,
} from './boot-animation';
import { BOOT_MELODY } from './boot-melody';
import {
  currentGame,
  incLevel,
  incSpeed,
  initialMenuState,
  type MenuState,
  selectNext,
  selectPrev,
} from './menu';

/** 开机动画速度：约每秒 60 像素；也是不关心 tick 节奏的游戏的回退速度 */
const BOOT_TICK_SPEED = 60;

/**
 * 游戏内动画速度：每秒 30 帧。
 *
 * 游戏进入动画态（Snake 死亡爆炸 / Tetris 消行闪烁等）时切到这个固定值，
 * 动画节奏不受玩家所选 speed 影响：即使 speed=1，动画也按约 33ms/帧播放
 */
const ANIM_TICK_SPEED = 30;

/** select 态 demo 的回退速度：游戏未提供 tickSpeeds / tickSpeed 时使用 */
const DEMO_TICK_SPEED = 3;

/**
 * 选关 demo 视口：在主屏中间留出图标（上 6 行）和编号（下 5 行）的空间。
 * demo 游戏在 DEMO_W×DEMO_H 的小场地里跑，渲染时偏移 DEMO_Y 行画到主屏
 */
const DEMO_W = 10;
const DEMO_H = 8;
const DEMO_Y = 6;

/**
 * 自动玩 game over 后等待多少 tick 再重开。game over 期间按 ANIM_TICK_SPEED
 * 推进，36 tick 约 1.2s，足够播完死亡动画。用 tick 计数而非计时器，
 * 后台或暂停时不会在看不到的地方重开
 */
const AUTOPILOT_RESTART_TICKS = 36;

/** 暂停时被拦截的游戏键；控制键不受暂停影响 */
const GAME_KEYS: ReadonlySet<Button> = new Set(['Up', 'Down', 'Left', 'Right', 'A', 'B']);

/**
 * 主机模式：
 *   off     关机：屏幕黑，无声音，仅 Start 能通电
 *   boot    开机动画 + 开机音乐；任意键停止音乐切到 select
 *   select  游戏选择菜单
 *   playing 游戏运行中
 */
export type Mode = 'off' | 'boot' | 'select' | 'playing';

export interface MachineState {
  readonly mode: Mode;
  readonly boot: BootState;
  readonly menu: MenuState;
  /** 当前进入 playing 的游戏 id；非 playing 态为 null */
  readonly playingId: string | null;
  /** 具体游戏的内部 state；类型由 Game<S> 的 S 决定，外层用 unknown 持有 */
  readonly gameState: unknown;
  /** select 模式下自动演示的 state；null = 该游戏没实现 demo */
  readonly demoState: unknown;
  /** demo 专用 GameEnv（小屏幕），null = 非 select 态 */
  readonly demoEnv: GameEnv | null;
  /** 当前游戏是否由自动玩控制 */
  readonly aiPlaying: boolean;
}

/**
 * 自动玩实例：每个 tick 推进前由 machine 调用 act，返回要按下的键。
 * act 内部的异常由实现自行处理并返回 null，不能让 tick 中断
 */
export interface Autopilot {
  readonly act: (gameState: unknown) => Button | null;
  readonly dispose: () => void;
}

/**
 * 自动玩提供方：select 态在 gameId 对应的游戏上按 B 时调用 load。
 * 加载失败时返回 rejected Promise，machine 保持在 select 态
 */
export interface AutopilotProvider {
  readonly gameId: string;
  readonly load: () => Promise<Autopilot>;
}

export interface MachineOptions {
  readonly ctx: HardwareContext;
  readonly games: GameRegistry;
  /** select 态 demo 场地的种子；每次重建 demo 从这个种子派生新的序列 */
  readonly seed: number;
  readonly autopilot?: AutopilotProvider;
}

/**
 * Machine：掌机固件
 *
 * 持有模式状态机，订阅输入与 ticker，负责调速、每帧绘制、最高分与自动玩。
 * 各入口只需装配 HardwareContext、调用 start / stop，并通过 subscribe 观察状态。
 */
export interface Machine {
  readonly getState: () => MachineState;
  /** 当前游戏（playing 态）或菜单选中游戏的最高分 */
  readonly getHiScore: () => number;
  /** 状态或最高分变化时通知 */
  readonly subscribe: (fn: () => void) => Unsubscribe;
  /** 订阅输入、启动 ticker；能直接发声时自动通电 */
  readonly start: () => void;
  /** 取消订阅、停止 ticker 与开机音乐、释放自动玩；状态保留，可再次 start */
  readonly stop: () => void;
  /** 通电：播放开机音乐并进入 boot。播放需在用户手势调用栈内才能被浏览器允许 */
  readonly powerOn: () => void;
  /** 进入后台：暂停 ticker、挂起音频、停止开机音乐 */
  readonly suspend: () => void;
  /** 回到前台：恢复音频，解除后台暂停 */
  readonly resume: () => void;
}

type Action =
  | { type: 'TICK' }
  | { type: 'INPUT'; button: Button; kind: ButtonAction }
  | { type: 'POWER_ON' }
  | { type: 'POWER_OFF' }
  | { type: 'AI_ENTER'; gameId: string };

interface ReduceDeps {
  readonly registry: GameRegistry;
  readonly anim: BootAnimation;
  readonly env: GameEnv;
  readonly newDemoEnv: () => GameEnv;
}

export function initialMachineState(): MachineState {
  return {
    mode: 'off',
    boot: initialBootState(),
    menu: initialMenuState(),
    playingId: null,
    gameState: null,
    demoState: null,
    demoEnv: null,
    aiPlaying: false,
  };
}

/** demo 场地只需屏幕、计数器与 RNG，直接用 engine 的通用实现组装 */
function createDemoEnv(seed: number): GameEnv {
  return {
    screen: createScreen(DEMO_W, DEMO_H),
    auxScreen: createScreen(4, 2),
    input: createInputBus(),
    sound: createNullSound(),
    rng: mulberry32(seed),
    now: () => 0,
    score: createCounter(0),
    level: createCounter(0),
    speed: createCounter(BOOT_TICK_SPEED),
    lives: createCounter(3),
  };
}

/** 判断游戏是否可玩（实现了 init 与 step） */
function isPlayable(g: Game | undefined): g is Game & {
  init: NonNullable<Game['init']>;
  step: NonNullable<Game['step']>;
} {
  return !!g && typeof g.init === 'function' && typeof g.step === 'function';
}

/** 进入 select 态：为当前选中游戏重建 demo；游戏没实现 demoInit 时 demoState 为 null */
function enterSelect(state: MachineState, menu: MenuState, deps: ReduceDeps): MachineState {
  const demoEnv = deps.newDemoEnv();
  return {
    ...state,
    mode: 'select',
    menu,
    playingId: null,
    gameState: null,
    aiPlaying: false,
    demoEnv,
    demoState: currentGame(deps.registry, menu)?.demoInit?.(demoEnv) ?? null,
  };
}

/**
 * 主 reducer
 *
 * 会调用 game.init / step / onButton，它们可能通过 GameEnv 改 Counter / 放音效；
 * 这些是 SDK 允许的游戏输出，不影响 reducer 同输入同输出的语义。
 */
function reduce(state: MachineState, action: Action, deps: ReduceDeps): MachineState {
  const { registry, anim, env } = deps;

  if (action.type === 'POWER_ON') {
    if (state.mode !== 'off') return state;
    return { ...state, mode: 'boot', boot: initialBootState() };
  }

  if (action.type === 'POWER_OFF') {
    if (state.mode === 'off') return state;
    return initialMachineState();
  }

  if (action.type === 'AI_ENTER') {
    const game = registry.get(action.gameId);
    if (!isPlayable(game)) return state;
    return {
      ...state,
      mode: 'playing',
      playingId: action.gameId,
      gameState: game.init(env, { speed: state.menu.speed, level: state.menu.level }),
      aiPlaying: true,
    };
  }

  if (action.type === 'TICK') {
    if (state.mode === 'boot') {
      return { ...state, boot: stepBoot(anim, state.boot) };
    }
    if (state.mode === 'select' && state.demoState !== null && state.demoEnv) {
      const game = currentGame(registry, state.menu);
      if (game?.demoStep) {
        const next = game.demoStep(state.demoEnv, state.demoState);
        if (next === state.demoState) return state;
        return { ...state, demoState: next };
      }
    }
    if (state.mode === 'playing' && state.playingId) {
      const game = registry.get(state.playingId);
      if (isPlayable(game)) {
        const next = game.step(env, state.gameState);
        if (next === state.gameState) return state;
        return { ...state, gameState: next };
      }
    }
    return state;
  }

  const { button, kind } = action;
  if (kind !== 'press' && state.mode !== 'playing') return state;

  // 关机态的通电由 Machine.powerOn 处理，确保开机音乐在用户手势调用栈内播放
  if (state.mode === 'off') return state;

  if (state.mode === 'boot') {
    return enterSelect(state, initialMenuState(), deps);
  }

  if (state.mode === 'select') {
    // 真机风格菜单：左右切游戏，上调 speed，下调 level，单击递增到顶回 1
    if (button === 'Left') return enterSelect(state, selectPrev(registry, state.menu), deps);
    if (button === 'Right') return enterSelect(state, selectNext(registry, state.menu), deps);
    if (button === 'Up') return { ...state, menu: incSpeed(state.menu) };
    if (button === 'Down') return { ...state, menu: incLevel(state.menu) };
    if (button === 'A') {
      // Start 由输入路由拦截作开关机，进游戏只剩 A。预览占位条目（无 init/step）
      // 按 A 不进入，避免进入一个 gameState=null、TICK 永远 no-op 的局面
      const game = currentGame(registry, state.menu);
      if (!isPlayable(game)) return state;
      return {
        ...state,
        mode: 'playing',
        playingId: game.id,
        gameState: game.init(env, { speed: state.menu.speed, level: state.menu.level }),
      };
    }
    return state;
  }

  // playing：Reset 重开当前局；Select 退回菜单；其它走 game.onButton
  if (!state.playingId) return state;
  const game = registry.get(state.playingId);
  if (kind === 'press' && button === 'Reset' && isPlayable(game)) {
    return {
      ...state,
      gameState: game.init(env, { speed: state.menu.speed, level: state.menu.level }),
    };
  }
  if (kind === 'press' && button === 'Select') {
    return enterSelect(state, state.menu, deps);
  }
  if (game?.onButton) {
    const next = game.onButton(env, state.gameState, button, kind);
    if (next !== state.gameState) return { ...state, gameState: next };
  }
  return state;
}

/**
 * ticker 速度策略：playing 态优先 tickSpeeds[speed-1]，回退 tickSpeed，
 * 都没有就用 BOOT_TICK_SPEED；游戏处于动画态或 game over 时固定 ANIM_TICK_SPEED
 */
function tickSpeedOf(state: MachineState, registry: GameRegistry): number {
  if (state.mode === 'playing' && state.playingId) {
    const game = registry.get(state.playingId);
    if (isAnimating(game, state.gameState)) return ANIM_TICK_SPEED;
    return game?.tickSpeeds?.[state.menu.speed - 1] ?? game?.tickSpeed ?? BOOT_TICK_SPEED;
  }
  if (state.mode === 'select' && state.demoState !== null) {
    const game = currentGame(registry, state.menu);
    if (isAnimating(game, state.demoState)) return ANIM_TICK_SPEED;
    return game?.tickSpeeds?.[2] ?? game?.tickSpeed ?? DEMO_TICK_SPEED;
  }
  return BOOT_TICK_SPEED;
}

/** game over 也视为动画态，游戏不必为死亡动画单独实现 isAnimating */
function isAnimating(game: Game | undefined, gameState: unknown): boolean {
  return (game?.isGameOver?.(gameState) ?? false) || (game?.isAnimating?.(gameState) ?? false);
}

/** 把当前状态画到主屏；select 态的 demo 先画到小屏幕再偏移复制到主屏中部 */
function paint(
  state: MachineState,
  ctx: HardwareContext,
  env: GameEnv,
  registry: GameRegistry,
  anim: BootAnimation
): void {
  const { screen } = ctx;
  if (state.mode === 'off') {
    screen.clear();
    return;
  }
  if (state.mode === 'boot') {
    screen.clear();
    for (const [x, y] of projectBoot(anim, state.boot)) screen.setPixel(x, y, true);
    return;
  }
  if (state.mode === 'select') {
    screen.clear();
    const game = currentGame(registry, state.menu);
    if (game?.render && state.demoState !== null && state.demoEnv) {
      game.render(state.demoEnv, state.demoState);
      const ds = state.demoEnv.screen;
      for (let y = 0; y < ds.height; y++)
        for (let x = 0; x < ds.width; x++)
          if (ds.getPixel(x, y)) screen.setPixel(x, y + DEMO_Y, true);
    }
    if (game) {
      for (const [x, y] of game.preview) screen.setPixel(x, y, true);
    }
    return;
  }
  const game = state.playingId ? registry.get(state.playingId) : undefined;
  if (game?.render) {
    game.render(env, state.gameState);
  } else if (game) {
    screen.clear();
    for (const [x, y] of game.preview) screen.setPixel(x, y, true);
  }
}

export function createMachine(opts: MachineOptions): Machine {
  const { ctx, games: registry, autopilot: provider } = opts;
  const env = toGameEnv(ctx);
  const anim = createBootAnimation(ctx.screen.width, ctx.screen.height);
  const demoRng = mulberry32(opts.seed);
  const deps: ReduceDeps = {
    registry,
    anim,
    env,
    newDemoEnv: () => createDemoEnv(Math.floor(demoRng() * 2 ** 32)),
  };

  let state = initialMachineState();
  const listeners = new Set<() => void>();
  let unsubs: Unsubscribe[] = [];
  let running = false;
  let backgrounded = false;
  let cancelMelody: (() => void) | null = null;
  let pilot: Autopilot | null = null;
  let pilotLoading = false;
  let gameOverTicks = 0;
  let hi: { readonly gameId: string; readonly counter: Counter } | null = null;

  const notify = (): void => {
    for (const fn of listeners) fn();
  };

  const stopMelody = (): void => {
    cancelMelody?.();
    cancelMelody = null;
  };

  const disposePilot = (): void => {
    pilot?.dispose();
    pilot = null;
  };

  // 后台、或 playing 且用户暂停，任一成立都暂停 ticker；其它模式不受用户暂停影响
  const applyPause = (): void => {
    if (backgrounded || (state.mode === 'playing' && ctx.pause.value)) ctx.ticker.pause();
    else ctx.ticker.resume();
  };

  // 每款游戏各自一条最高分；非 playing 态取菜单选中的那款，让菜单里也能看到纪录
  const syncHi = (): void => {
    const gameId =
      state.mode === 'playing' ? state.playingId : (currentGame(registry, state.menu)?.id ?? null);
    if (gameId === (hi?.gameId ?? null)) return;
    hi = gameId
      ? { gameId, counter: createPersistentCounter(ctx.storage, `hi-score:${gameId}`, 0) }
      : null;
  };

  const bumpHi = (): boolean => {
    if (state.mode !== 'playing' || !hi || ctx.score.value <= hi.counter.value) return false;
    hi.counter.set(ctx.score.value);
    return true;
  };

  const render = (): void => {
    ctx.screen.batch(() => {
      ctx.auxScreen.batch(() => {
        paint(state, ctx, env, registry, anim);
      });
    });
  };

  const dispatch = (action: Action): void => {
    const prev = state;
    state = reduce(state, action, deps);
    if (state === prev) return;
    // 切换游戏 / 退出 playing 时清空副屏，避免上一款游戏残留的辅助像素
    if (state.playingId !== prev.playingId) ctx.auxScreen.clear();
    if (!state.aiPlaying) disposePilot();
    ctx.ticker.setSpeed(tickSpeedOf(state, registry));
    render();
    applyPause();
    syncHi();
    bumpHi();
    notify();
  };

  const powerOn = (): void => {
    if (state.mode !== 'off') return;
    // 用户静音时不播放开机音乐，避免音频时序抖动漏出声音
    cancelMelody = ctx.soundOn.value ? ctx.sound.playMelody(BOOT_MELODY) : null;
    dispatch({ type: 'POWER_ON' });
  };

  const requestAutopilot = (): void => {
    if (!provider || pilot || pilotLoading) return;
    if (currentGame(registry, state.menu)?.id !== provider.gameId) return;
    pilotLoading = true;
    provider
      .load()
      .then((loaded) => {
        // 加载期间可能已关机、离开菜单或切到其它游戏，此时丢弃
        if (
          !running ||
          state.mode !== 'select' ||
          currentGame(registry, state.menu)?.id !== provider.gameId
        ) {
          loaded.dispose();
          return;
        }
        pilot = loaded;
        gameOverTicks = 0;
        dispatch({ type: 'AI_ENTER', gameId: provider.gameId });
      })
      .catch(() => undefined)
      .finally(() => {
        pilotLoading = false;
      });
  };

  const onInput = (button: Button, kind: ButtonAction): void => {
    // 关机：只允许 Start 通电，其它按键全部忽略（包括 Sound / Pause）
    if (state.mode === 'off') {
      if (kind === 'press' && button === 'Start') powerOn();
      return;
    }
    // 控制键只响应 press，处理完不进 reducer；Reset 先清除暂停，再交给 reducer 重开局
    if (kind === 'press') {
      switch (button) {
        case 'Start':
          stopMelody();
          ctx.pause.set(false);
          dispatch({ type: 'POWER_OFF' });
          return;
        case 'Pause':
          if (state.mode === 'playing') {
            ctx.pause.toggle();
            ctx.sound.play('move');
          }
          return;
        case 'Sound':
          // 先切换后发声：切到 ON 能听到提示音，切到 OFF 时已静音
          ctx.soundOn.toggle();
          ctx.sound.play('move');
          return;
        case 'Reset':
          if (ctx.pause.value) ctx.pause.set(false);
          break;
      }
    }

    if (kind === 'press' && button === 'B' && state.mode === 'select') {
      requestAutopilot();
      return;
    }

    if (ctx.pause.value && state.mode === 'playing' && GAME_KEYS.has(button)) return;

    // 游戏键反馈音：press 与 repeat 都发声，长按连发期间持续发出；release 与 Reset 不发声
    if ((kind === 'press' || kind === 'repeat') && button !== 'Reset') {
      ctx.sound.play('move');
    }

    if (kind === 'press' && state.mode === 'boot') stopMelody();

    dispatch({ type: 'INPUT', button, kind });
  };

  const onTick = (): void => {
    const piloting =
      pilot !== null &&
      provider !== undefined &&
      state.aiPlaying &&
      state.mode === 'playing' &&
      state.playingId === provider.gameId;

    if (piloting && pilot) {
      const btn = pilot.act(state.gameState);
      if (btn) dispatch({ type: 'INPUT', button: btn, kind: 'press' });
    }
    dispatch({ type: 'TICK' });

    if (!piloting || !provider) return;
    const game = state.playingId ? registry.get(state.playingId) : undefined;
    if (!game?.isGameOver?.(state.gameState)) {
      gameOverTicks = 0;
      return;
    }
    gameOverTicks++;
    if (gameOverTicks >= AUTOPILOT_RESTART_TICKS) {
      gameOverTicks = 0;
      dispatch({ type: 'AI_ENTER', gameId: provider.gameId });
    }
  };

  return {
    getState: () => state,

    getHiScore: () => hi?.counter.value ?? 0,

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    start() {
      if (running) return;
      running = true;
      unsubs = [
        ctx.input.subscribe(onInput),
        ctx.pause.subscribe(applyPause),
        ctx.score.subscribe(() => {
          if (bumpHi()) notify();
        }),
      ];
      ctx.ticker.start(onTick);
      ctx.ticker.setSpeed(tickSpeedOf(state, registry));
      render();
      applyPause();
      syncHi();

      // 已与页面交互过或环境允许自动播放时直接通电；否则等用户按 Start。
      // 检测结果返回前可能已进入后台，此时不自动通电
      ctx.sound
        .canAutoplay()
        .then((ok) => {
          if (ok && running && !backgrounded) powerOn();
        })
        .catch(() => undefined);
    },

    stop() {
      if (!running) return;
      running = false;
      for (const unsub of unsubs) unsub();
      unsubs = [];
      ctx.ticker.stop();
      stopMelody();
      disposePilot();
      // pilot 已释放，再次 start 时由玩家接管当前局
      if (state.aiPlaying) {
        state = { ...state, aiPlaying: false };
        notify();
      }
    },

    powerOn,

    suspend() {
      backgrounded = true;
      stopMelody();
      ctx.sound.suspend();
      applyPause();
    },

    resume() {
      backgrounded = false;
      ctx.sound.resume();
      applyPause();
    },
  };
}
