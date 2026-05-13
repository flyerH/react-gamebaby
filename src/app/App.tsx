import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { createPersistentCounter } from '@/engine/counter';
import type { Button, ButtonAction, Counter } from '@/engine/types';
import { defaultGames } from '@/games';
import { bindKeyboardInput, createBrowserContext } from '@/platform/browser';
import { createHeadlessContext } from '@/platform/headless';
import type { Game, GameEnv, GameRegistry } from '@/sdk';
import { toGameEnv } from '@/sdk';
import { Buttons } from '@/ui/Buttons';
import { ContentScreen } from '@/ui/ContentScreen';
import { Device } from '@/ui/Device';
import { defaultButtonLabels } from '@/ui/locale';
import { SidePanel } from '@/ui/SidePanel';

import {
  type BootAnimation,
  type BootState,
  createBootAnimation,
  initialBootState,
  projectBoot,
  stepBoot,
} from './boot-animation';
import styles from './App.module.css';
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

/** 开机动画速度：约每秒 60 像素 */
const BOOT_TICK_SPEED = 60;

/** AI 动作索引 → 按键的映射（与训练时 SnakeRLEnv.actionSpace 顺序一致） */
const AI_ACTION_MAP: readonly Button[] = ['Up', 'Down', 'Left', 'Right'];

/**
 * 延迟加载的 encodeSnakeObs 缓存；加载 AI agent 时同步填入，
 * ticker 回调里直接读取，避免每 tick 都 dynamic import
 */
const encodeSnakeObsRef: {
  current: ((game: unknown, w: number, h: number) => Float32Array) | null;
} = { current: null };

/**
 * 选关 demo 视口：在主屏中间留出图标（上 6 行）和编号（下 5 行）的空间。
 * demo 游戏在 10×DEMO_H 的小场地里跑，渲染时偏移 DEMO_Y 行画到主屏
 */
const DEMO_W = 10;
const DEMO_H = 8;
const DEMO_Y = 6;

/**
 * 游戏内动画速度：每秒 30 帧。
 *
 * 在 game 进入"动画态"（Snake 死亡爆炸 / Tetris 消行闪烁等）时，App 把 ticker
 * 切到这个固定值。这样动画节奏不被玩家选的 baseline tickSpeed 拖慢——speed=1
 * 的慢节奏游戏也能用 ~33ms/帧 干脆的速度播完动画
 */
const ANIM_TICK_SPEED = 30;

/**
 * 应用 mode 状态机：
 *   off    —— 关机：屏幕黑，无声音，仅 ON/OFF (Start/A) 能"通电"
 *   boot   —— 开机动画 + Korobeiniki 旋律；任意键停止旋律切到 select
 *   select —— 游戏选择菜单
 *   playing—— 游戏运行中
 */
type Mode = 'off' | 'boot' | 'select' | 'playing';

interface AppState {
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
  /** 是否由 AI 控制当前游戏 */
  readonly aiPlaying: boolean;
}

/**
 * Action 四类：
 * - TICK      —— Ticker 推进一拍
 * - INPUT     —— 用户按键 / 屏幕按钮
 * - POWER_ON  —— "通电"动作：把 mode 从 off 切到 boot。封装成独立 action
 *                让"按 ON/OFF 按键"和"探测到允许 autoplay 后自动开机"两个
 *                触发源走同一通路
 * - POWER_OFF —— "断电"动作：从 boot/select/playing 任一模式切回 off，
 *                state 全清。和 POWER_ON 对称
 */
type Action =
  | { type: 'TICK' }
  | { type: 'INPUT'; button: Button; kind: ButtonAction }
  | { type: 'POWER_ON' }
  | { type: 'POWER_OFF' }
  | { type: 'AI_ENTER'; gameId: string }
  | { type: 'AI_EXIT' };

interface ReduceDeps {
  readonly registry: GameRegistry;
  readonly anim: BootAnimation;
  readonly env: GameEnv;
}

function initialAppState(): AppState {
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

/** select 模式下为当前选中游戏创建 demo state；游戏没实现 demoInit 返回 null */
function initDemo(registry: GameRegistry, menu: MenuState, demoEnv: GameEnv): unknown {
  const game = currentGame(registry, menu);
  return game?.demoInit?.(demoEnv) ?? null;
}

/** 创建 demo 用 GameEnv（10×9 小屏幕），每次重建 seed 不同让演示不重复 */
function createDemoEnv(): GameEnv {
  return toGameEnv(createHeadlessContext({ seed: Date.now(), width: DEMO_W, height: DEMO_H }));
}

/** 判断游戏是否满足"真游戏"条件（init/step 都实现了） */
function isPlayable(g: Game | undefined): g is Game & {
  init: NonNullable<Game['init']>;
  step: NonNullable<Game['step']>;
} {
  return !!g && typeof g.init === 'function' && typeof g.step === 'function';
}

/**
 * 主 reducer
 *
 * 纯度说明：本 reducer 会调 game.init / step / onButton，它们内部
 * 可能通过 GameEnv 改 Counter / 放 Sound；这些副作用是 L2 SDK 公开
 * 允许的"游戏可写出口"，不破坏 reducer 自身的"同输入同输出"语义。
 */
function reduce(state: AppState, action: Action, deps: ReduceDeps): AppState {
  const { registry, anim, env } = deps;

  if (action.type === 'POWER_ON') {
    if (state.mode !== 'off') return state;
    return { ...state, mode: 'boot', boot: initialBootState() };
  }

  if (action.type === 'POWER_OFF') {
    if (state.mode === 'off') return state;
    return initialAppState();
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

  if (action.type === 'AI_EXIT') {
    const de = createDemoEnv();
    return {
      ...state,
      mode: 'select',
      playingId: null,
      gameState: null,
      aiPlaying: false,
      demoEnv: de,
      demoState: initDemo(registry, state.menu, de),
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

  if (action.kind !== 'press' && state.mode !== 'playing') return state;
  const { button, kind } = action;

  // 关机状态忽略所有 INPUT —— 通电由外层 powerOn() 直接调度 POWER_ON action，
  // 顺带启动旋律，确保旋律 playMelody 在 user gesture 调用栈内
  if (state.mode === 'off') return state;

  if (state.mode === 'boot') {
    if (kind !== 'press') return state;
    // boot 期间任意按键 → 进 select；旋律的 cancel 由 input subscribe
    // 同步触发，与 dispatch 共处一个事件回调内
    const menu = initialMenuState();
    const de = createDemoEnv();
    return { ...state, mode: 'select', menu, demoEnv: de, demoState: initDemo(registry, menu, de) };
  }

  if (state.mode === 'select') {
    if (kind !== 'press') return state;
    // Brick Game 真机风格菜单：左右切游戏，上调 speed，下调 level，
    // 全部走"单击递增循环到顶回 1"的语义；没有"反向减少"键
    if (button === 'Left') {
      const menu = selectPrev(registry, state.menu);
      const de = createDemoEnv();
      return { ...state, menu, demoEnv: de, demoState: initDemo(registry, menu, de) };
    }
    if (button === 'Right') {
      const menu = selectNext(registry, state.menu);
      const de = createDemoEnv();
      return { ...state, menu, demoEnv: de, demoState: initDemo(registry, menu, de) };
    }
    if (button === 'Up') {
      return { ...state, menu: incSpeed(state.menu) };
    }
    if (button === 'Down') {
      return { ...state, menu: incLevel(state.menu) };
    }
    if (button === 'A') {
      // Start 由 input 层拦截作 ON/OFF 用，select 进游戏只剩 Rotate（'A'）
      const game = currentGame(registry, state.menu);
      // 仅 playable 游戏切到 playing；预览占位条目（无 init/step）按下 A
      // 直接 no-op，避免落到一个 gameState=null 的"假开局"，TICK 永远 no-op
      if (!game || !isPlayable(game)) return state;
      return {
        ...state,
        mode: 'playing',
        playingId: game.id,
        gameState: game.init(env, { speed: state.menu.speed, level: state.menu.level }),
      };
    }
    return state;
  }

  // playing：Reset 重开当前局；Select 退回菜单；其它走 game.onButton。
  // 原本游戏结束时按 Start 重开局的分支已不可达（input 层把 Start 拦截
  // 作 POWER_OFF）。Reset 在 playing 重开 / select 时退回菜单
  if (state.playingId) {
    if (kind === 'press' && button === 'Reset') {
      const game = registry.get(state.playingId);
      if (isPlayable(game)) {
        return {
          ...state,
          gameState: game.init(env, { speed: state.menu.speed, level: state.menu.level }),
        };
      }
    }
    if (kind === 'press' && button === 'Select') {
      const de = createDemoEnv();
      return {
        ...state,
        mode: 'select',
        playingId: null,
        gameState: null,
        aiPlaying: false,
        demoEnv: de,
        demoState: initDemo(registry, state.menu, de),
      };
    }
    const game = registry.get(state.playingId);
    if (game?.onButton) {
      const next = game.onButton(env, state.gameState, button, kind);
      if (next !== state.gameState) {
        return { ...state, gameState: next };
      }
    }
  }

  return state;
}

/**
 * App —— 掌机应用层装配
 *
 * 四态状态机：off（关机）→ boot（开机动画 + 旋律）→ select（方向键切游戏）→
 * playing（真游戏 loop；Select / R 返回 select）。
 *
 * 副作用都集中在 useEffect：键盘绑定、InputBus 订阅、Ticker 启停、
 * 屏幕重绘。其余状态流转都走 useReducer + pure reduce()。
 */
export function App(): React.ReactElement {
  // 真机每次开机都是新局面：seed 用时间戳即可，mulberry32 入口会自动截成 u32。
  // AGENTS.md 的确定性约束只针对 engine/sdk/games/ai，L4 UI 层负责装配，
  // 可以读非确定性源；需要重现的训练 / 测试走 createHeadlessContext({ seed })。
  const [ctx] = useState(() => createBrowserContext({ seed: Date.now() }));
  const registry = defaultGames;
  // 按钮标签按浏览器首选语言一次性装配；语言切换需刷新页面，暂不支持运行时切换
  const [buttonLabels] = useState(() => defaultButtonLabels());
  const env = useMemo<GameEnv>(() => toGameEnv(ctx), [ctx]);
  const anim = useMemo(
    () => createBootAnimation(ctx.screen.width, ctx.screen.height),
    [ctx.screen]
  );

  const [state, dispatch] = useReducer(
    (s: AppState, a: Action) => reduce(s, a, { registry, anim, env }),
    undefined,
    initialAppState
  );

  // 持有当前正在播的开机旋律的 cancel 函数，用于"按任意键停止旋律"+ unmount
  // 时清理。Ref 而非 state：避免改它触发额外渲染
  const melodyCancelRef = useRef<(() => void) | null>(null);
  // useReducer 内拿不到最新 state，需要 ref 转一手给 input subscribe 判断 mode
  const modeRef = useRef(state.mode);
  useEffect(() => {
    modeRef.current = state.mode;
  }, [state.mode]);

  // AI 推理相关 refs —— 存在 ref 里避免触发渲染
  const aiAgentRef = useRef<{ act(obs: Float32Array): number; dispose(): void } | null>(null);
  const aiPlayingRef = useRef(state.aiPlaying);
  const gameStateRef = useRef(state.gameState);
  useEffect(() => {
    aiPlayingRef.current = state.aiPlaying;
  }, [state.aiPlaying]);
  useEffect(() => {
    gameStateRef.current = state.gameState;
  }, [state.gameState]);
  const [aiLoading, setAiLoading] = useState(false);

  // 通电：把"启动旋律"和"切 mode 到 boot"封装成单一动作，让 ON/OFF 按键
  // 触发和 mount 时探测 autoplay 自动触发走同一通路。playMelody 必须在
  // user gesture 同步调用栈内才能被浏览器允许 resume AudioContext
  const powerOn = useCallback(() => {
    if (modeRef.current !== 'off') return;
    melodyCancelRef.current = ctx.sound.playMelody(BOOT_MELODY);
    dispatch({ type: 'POWER_ON' });
  }, [ctx.sound]);

  // 加载 AI 模型并进入 AI 自动玩模式；通过 ref 暴露给 input subscriber，
  // 避免 subscriber effect 因 menu/aiLoading 变化而频繁重建
  const menuRef = useRef(state.menu);
  const aiLoadingRef = useRef(aiLoading);
  useEffect(() => {
    menuRef.current = state.menu;
  }, [state.menu]);
  useEffect(() => {
    aiLoadingRef.current = aiLoading;
  }, [aiLoading]);

  const startAiModeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    startAiModeRef.current = () => {
      if (aiAgentRef.current || aiLoadingRef.current) return;
      const gameId = currentGame(registry, menuRef.current)?.id;
      if (gameId !== 'snake') return;

      setAiLoading(true);
      void (async () => {
        try {
          const [{ loadInferenceAgent }, { encodeSnakeObs }] = await Promise.all([
            import('@/ai/inference'),
            import('@/games/snake/rl'),
          ]);
          encodeSnakeObsRef.current = encodeSnakeObs as (
            game: unknown,
            w: number,
            h: number
          ) => Float32Array;
          const agent = await loadInferenceAgent('/models/snake-dqn/model.json', 10 * 20 * 3);
          aiAgentRef.current = agent;
          dispatch({ type: 'AI_ENTER', gameId: 'snake' });
        } catch (e) {
          console.warn('[AI] 模型加载失败:', e);
        } finally {
          setAiLoading(false);
        }
      })();
    };
  });

  useEffect(() => {
    const unbind = bindKeyboardInput(ctx.input);
    const unsub = ctx.input.subscribe((button, kind) => {
      // 控制键（Start / Pause / Sound / Reset）只响 press，repeat / release 无效。
      // 长按这些键没有"持续"语义；处理完直接 return，不进 reducer
      if (kind === 'press') {
        switch (button) {
          case 'Start':
            if (modeRef.current === 'off') {
              powerOn();
            } else {
              // 关机：取消旋律 + 重置 pause + state 整体清零
              melodyCancelRef.current?.();
              melodyCancelRef.current = null;
              ctx.pause.set(false);
              dispatch({ type: 'POWER_OFF' });
            }
            return;
          case 'Pause':
            // 仅 playing 模式切换暂停，其它模式 no-op 不响 click
            if (modeRef.current === 'playing') {
              ctx.pause.toggle();
              ctx.sound.play('move');
            }
            return;
          case 'Sound':
            // 先 toggle 后 play：切到 ON 那一下听到 click；切到 OFF 时已静音听不见
            ctx.soundOn.toggle();
            ctx.sound.play('move');
            return;
          case 'Reset':
            // Reset 顺带清暂停；reducer 在 playing 模式重开当前局，Reset 自身不响 click
            if (ctx.pause.value) ctx.pause.set(false);
            break;
        }
      }

      // 关机状态：除上面 Start 已处理外，其它按键一律无响应
      if (modeRef.current === 'off') return;

      // 选关模式按 B：加载模型 → AI 自动玩
      if (kind === 'press' && button === 'B' && modeRef.current === 'select') {
        startAiModeRef.current();
        return;
      }

      // 暂停态拦截游戏键 —— 不让 onButton 改 game state。Reset 已在上面先放行 +
      // 清了 pause，到这里 ctx.pause.value 已经是 false 不会被拦
      if (ctx.pause.value && modeRef.current === 'playing') {
        switch (button) {
          case 'Up':
          case 'Down':
          case 'Left':
          case 'Right':
          case 'A':
          case 'B':
            return;
        }
      }

      // 游戏键反馈音：press 和 repeat 都响，让加速期间有"嘀嘀嘀"连击反馈
      // （对齐 react-tetris move 音节奏）。release 不响（松开本来就没声）。
      // Reset 不响（控制键已在前面单独处理）
      if ((kind === 'press' || kind === 'repeat') && button !== 'Reset') {
        ctx.sound.play('move');
      }

      // 开机动画期间任意 press 先打断旋律
      if (kind === 'press' && modeRef.current === 'boot') {
        melodyCancelRef.current?.();
        melodyCancelRef.current = null;
      }

      dispatch({ type: 'INPUT', button, kind });
    });
    return () => {
      unsub();
      unbind();
    };
  }, [ctx, powerOn]);

  // mount 时探测能否 autoplay。常见情况：用户已和站点交互过 / 浏览器允许此源
  // autoplay，AudioContext.resume() 后立即变 'running'，那就直接通电；首次访问 /
  // Safari 等场景 promise reject 或 state 仍 suspended，安静失败，等用户按 ON/OFF
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const canAuto = await ctx.sound.canAutoplay();
      if (cancelled) return;
      if (canAuto) powerOn();
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx.sound, powerOn]);

  useEffect(() => {
    ctx.ticker.start(() => {
      // AI 模式：每 tick 先注入 AI 选择的方向键，再推进游戏。
      // try-catch 防止推理异常阻断 TICK 导致游戏完全冻结
      const agent = aiAgentRef.current;
      if (agent && aiPlayingRef.current && modeRef.current === 'playing') {
        try {
          const gs = gameStateRef.current as {
            readonly body: ReadonlyArray<readonly [number, number]>;
          } | null;
          if (gs?.body) {
            const obs = encodeSnakeObsRef.current?.(gs, 10, 20);
            if (obs) {
              const idx = agent.act(obs);
              const btn = AI_ACTION_MAP[idx];
              if (btn) dispatch({ type: 'INPUT', button: btn, kind: 'press' });
            }
          }
        } catch (e) {
          console.error('[AI] 推理异常:', e);
        }
      }
      dispatch({ type: 'TICK' });
    });
    return () => {
      ctx.ticker.stop();
    };
  }, [ctx.ticker]);

  // ticker 速度跟着 mode / 当前游戏 / 是否 game over 走。
  // playing 态优先用 game.tickSpeeds[speed-1]，回退到 game.tickSpeed，
  // 都没有就沿用开机动画速度（说明这款游戏不关心 tick 节奏）。
  // 加速由各游戏自身在 onButton 内处理（如 Snake 的"按键即走 + 跳一次
  // 自然 tick"），App 层不再统一提频
  useEffect(() => {
    if (state.mode === 'playing' && state.playingId) {
      const game = registry.get(state.playingId);
      const isOver = game?.isGameOver?.(state.gameState) ?? false;
      // 游戏内动画态优先用 ANIM_TICK_SPEED；isGameOver=true 时也视为动画
      // （Snake 不必单独实现 isAnimating，省一次样板代码）
      const isAnimating = isOver || (game?.isAnimating?.(state.gameState) ?? false);
      const baseSpeed =
        game?.tickSpeeds?.[state.menu.speed - 1] ?? game?.tickSpeed ?? BOOT_TICK_SPEED;
      ctx.ticker.setSpeed(isAnimating ? ANIM_TICK_SPEED : baseSpeed);
    } else if (state.mode === 'select' && state.demoState !== null) {
      const game = currentGame(registry, state.menu);
      const isOver = game?.isGameOver?.(state.demoState) ?? false;
      const isAnim = isOver || (game?.isAnimating?.(state.demoState) ?? false);
      const demoSpeed = game?.tickSpeeds?.[2] ?? game?.tickSpeed ?? 3;
      ctx.ticker.setSpeed(isAnim ? ANIM_TICK_SPEED : demoSpeed);
    } else {
      ctx.ticker.setSpeed(BOOT_TICK_SPEED);
    }
  }, [
    state.mode,
    state.playingId,
    state.gameState,
    state.demoState,
    state.menu,
    ctx.ticker,
    registry,
  ]);

  // 屏幕渲染
  useEffect(() => {
    const { screen } = ctx;
    if (state.mode === 'off') {
      // 关机：屏幕全暗（LCD 阴影格仍按底色显示，整体看起来"没通电"）
      screen.clear();
      return;
    }
    if (state.mode === 'boot') {
      screen.clear();
      for (const [x, y] of projectBoot(anim, state.boot)) {
        screen.setPixel(x, y, true);
      }
      return;
    }
    if (state.mode === 'select') {
      screen.clear();
      const game = currentGame(registry, state.menu);
      // demo 画到小屏幕，再偏移复制到主屏中间区域
      if (game?.render && state.demoState !== null && state.demoEnv) {
        game.render(state.demoEnv, state.demoState);
        const ds = state.demoEnv.screen;
        for (let y = 0; y < ds.height; y++)
          for (let x = 0; x < ds.width; x++)
            if (ds.getPixel(x, y)) screen.setPixel(x, y + DEMO_Y, true);
      }
      // 叠加静态 preview（图标 + 编号）
      if (game) {
        for (const [x, y] of game.preview) screen.setPixel(x, y, true);
      }
      return;
    }
    // playing
    const game = state.playingId ? registry.get(state.playingId) : undefined;
    if (game?.render) {
      game.render(env, state.gameState);
    } else if (game) {
      screen.clear();
      for (const [x, y] of game.preview) screen.setPixel(x, y, true);
    }
  }, [state, ctx, registry, anim, env]);

  const score = useSyncExternalStore(
    (notify) => ctx.score.subscribe(notify),
    () => ctx.score.value
  );

  // 每款游戏各自一条 hi-score：key 形如 hi-score:snake，随 playingId 切换重建。
  // 非 playing 态（boot/select）固定拿选中预览那款的，让菜单里也能看到纪录。
  const hiScoreGameId =
    state.mode === 'playing' ? state.playingId : (currentGame(registry, state.menu)?.id ?? null);
  const hiCounter = useMemo<Counter | null>(
    () =>
      hiScoreGameId ? createPersistentCounter(ctx.storage, `hi-score:${hiScoreGameId}`, 0) : null,
    [ctx.storage, hiScoreGameId]
  );
  const hiSubscribe = useMemo<(n: () => void) => () => void>(
    () => (notify) => hiCounter?.subscribe(notify) ?? (() => undefined),
    [hiCounter]
  );
  const hiGetSnapshot = useMemo<() => number>(() => () => hiCounter?.value ?? 0, [hiCounter]);
  const hiScore = useSyncExternalStore(hiSubscribe, hiGetSnapshot);

  const soundOn = useSyncExternalStore(
    useMemo(() => (notify: () => void) => ctx.soundOn.subscribe(notify), [ctx.soundOn]),
    useMemo(() => () => ctx.soundOn.value, [ctx.soundOn])
  );

  const paused = useSyncExternalStore(
    useMemo(() => (notify: () => void) => ctx.pause.subscribe(notify), [ctx.pause]),
    useMemo(() => () => ctx.pause.value, [ctx.pause])
  );

  // 暂停状态接 ticker —— playing+paused 时停掉 tick 调度，否则恢复。其它
  // mode（off/boot/select）不参与 pause 语义；boot 动画始终跑，不让 P 键打断
  useEffect(() => {
    if (state.mode === 'playing' && paused) {
      ctx.ticker.pause();
    } else {
      ctx.ticker.resume();
    }
  }, [state.mode, paused, ctx.ticker]);

  // 本局分数超越 hi-score 时推进。用 ref 式同步调用是安全的：
  // createCounter.set 在值未变时不通知，不会反向触发 score 订阅造成循环。
  useEffect(() => {
    if (state.mode !== 'playing' || !hiCounter) return;
    if (score > hiCounter.value) hiCounter.set(score);
  }, [score, state.mode, hiCounter]);

  // AI 模式下 game over 后自动重开（等死亡动画播完 ~1s）
  useEffect(() => {
    if (!state.aiPlaying || state.mode !== 'playing' || !state.playingId) return;
    const game = registry.get(state.playingId);
    if (!game?.isGameOver?.(state.gameState)) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'AI_ENTER', gameId: state.playingId! });
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [state.aiPlaying, state.mode, state.playingId, state.gameState, registry, env]);

  // 关机 / 退出 AI 时释放推理 agent
  useEffect(() => {
    if (!state.aiPlaying && aiAgentRef.current) {
      aiAgentRef.current.dispose();
      aiAgentRef.current = null;
      encodeSnakeObsRef.current = null;
    }
  }, [state.aiPlaying]);

  return (
    <div className={styles.page}>
      <Device
        screen={<ContentScreen screen={ctx.screen} cellSize={16} innerSize={9} />}
        side={
          <SidePanel
            power={state.mode !== 'off'}
            score={score}
            hiScore={hiScore}
            nextScreen={ctx.nextScreen}
            speed={state.menu.speed}
            level={state.menu.level}
            pauseMode={paused}
            soundOn={soundOn}
            aiMode={state.aiPlaying}
          />
        }
        buttons={
          <Buttons
            labels={buttonLabels}
            onInput={(btn, action) => {
              ctx.input.emit(btn, action);
            }}
          />
        }
      />
    </div>
  );
}
