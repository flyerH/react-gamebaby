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

/**
 * 加速键集合：按住任一键 → ticker 速度 × BOOST_FACTOR。Rotate / 同向 / 异向
 * 方向键都算进来，按下时长按持续生效；松开后若集合空则取消加速。
 *
 * 选 ticker 提频而不是 step 内一帧两步：保持每帧推进一格的视觉流畅感（用户
 * 反馈"一帧两格"看起来在跳跃），同时切方向时只要新键还按着就不掉 boost
 */
const BOOST_KEYS: ReadonlySet<Button> = new Set(['Up', 'Down', 'Left', 'Right', 'A']);
const BOOST_FACTOR = 3;

/**
 * Game Over 死亡动画速度：每秒 30 帧。
 *
 * 当前接入的是 Snake 的两阶段动画（爆炸 30 帧 + 填屏 20 帧 ≈ 1.7s），
 * 每帧推进 1 个 overFrame。继续上调到 40+ 会显得仓促。
 */
const GAME_OVER_ANIM_SPEED = 30;

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
  | { type: 'POWER_OFF' };

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
  };
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

  if (action.type === 'TICK') {
    if (state.mode === 'boot') {
      return { ...state, boot: stepBoot(anim, state.boot) };
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
    return { ...state, mode: 'select', menu: initialMenuState() };
  }

  if (state.mode === 'select') {
    if (kind !== 'press') return state;
    // Brick Game 真机风格菜单：左右切游戏，上调 speed，下调 level，
    // 全部走"单击递增循环到顶回 1"的语义；没有"反向减少"键
    if (button === 'Left') {
      return { ...state, menu: selectPrev(registry, state.menu) };
    }
    if (button === 'Right') {
      return { ...state, menu: selectNext(registry, state.menu) };
    }
    if (button === 'Up') {
      return { ...state, menu: incSpeed(state.menu) };
    }
    if (button === 'Down') {
      return { ...state, menu: incLevel(state.menu) };
    }
    if (button === 'Start' || button === 'A') {
      const game = currentGame(registry, state.menu);
      // 仅 playable 游戏切到 playing；预览占位条目（无 init/step）按下 Start
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

  // playing：game over 下 Start 重开当前局；否则先给游戏处理按键，再考虑退出键
  if (state.playingId) {
    const game = registry.get(state.playingId);
    if (
      kind === 'press' &&
      button === 'Start' &&
      game &&
      isPlayable(game) &&
      game.isGameOver?.(state.gameState)
    ) {
      return { ...state, gameState: game.init(env) };
    }
    if (game?.onButton) {
      const next = game.onButton(env, state.gameState, button, kind);
      if (next !== state.gameState) {
        return { ...state, gameState: next };
      }
    }
  }

  if (kind === 'press' && (button === 'Select' || button === 'Reset')) {
    return { ...state, mode: 'select', playingId: null, gameState: null };
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

  // 加速：当前按住的 boost 键集合 + 派生 boost 状态。Ref 跟踪集合，state 触发
  // ticker 速度 useEffect 重算。多键场景靠集合天然处理：按 Right + 按 Up，
  // 松开 Right 后 Up 仍按着 → 集合非空 → 仍 boost
  const pressedBoostRef = useRef<Set<Button>>(new Set());
  const [boost, setBoost] = useState(false);

  // 通电：把"启动旋律"和"切 mode 到 boot"封装成单一动作，让 ON/OFF 按键
  // 触发和 mount 时探测 autoplay 自动触发走同一通路。playMelody 必须在
  // user gesture 同步调用栈内才能被浏览器允许 resume AudioContext
  const powerOn = useCallback(() => {
    if (modeRef.current !== 'off') return;
    melodyCancelRef.current = ctx.sound.playMelody(BOOT_MELODY);
    dispatch({ type: 'POWER_ON' });
  }, [ctx.sound]);

  useEffect(() => {
    const unbind = bindKeyboardInput(ctx.input);
    const unsub = ctx.input.subscribe((button, kind) => {
      // 关机状态：仅 ON/OFF（emit='Start'）通电，其它按键全部无响应，
      // 模拟真机"没插电"的表现
      if (modeRef.current === 'off') {
        if (kind === 'press' && button === 'Start') powerOn();
        return;
      }
      // 已开机时按 ON/OFF = 关机：取消旋律 + 清 boost 集合 + dispatch POWER_OFF。
      // 不响 click：电源键自身的"咔哒"是物理动作，不该触发 buzzer
      if (kind === 'press' && button === 'Start') {
        melodyCancelRef.current?.();
        melodyCancelRef.current = null;
        pressedBoostRef.current.clear();
        setBoost(false);
        dispatch({ type: 'POWER_OFF' });
        return;
      }
      // Sound 键：先 toggle 再 play —— "切到 ON 那一下"听到 click 反馈；
      // 切到 OFF 时 masterGain 已被静音，play 调度的 click 听不见
      if (kind === 'press' && button === 'Sound') {
        ctx.soundOn.toggle();
        ctx.sound.play('move');
        return;
      }
      // 其它按键（方向键 / Rotate / Reset）：走 reducer。Reset 由 reducer 在
      // playing 模式实现"回 select 菜单"；Reset 自身不响 click，其它都响
      if (kind === 'press' && button !== 'Reset') ctx.sound.play('move');
      // 开机动画期间任意键先打断旋律，dispatch INPUT 让 reducer 切到 select
      if (kind === 'press' && modeRef.current === 'boot') {
        melodyCancelRef.current?.();
        melodyCancelRef.current = null;
      }
      // 加速键集合维护：press 加入，release 移除；集合非空 ↔ boost on
      if (BOOST_KEYS.has(button)) {
        if (kind === 'press') pressedBoostRef.current.add(button);
        else pressedBoostRef.current.delete(button);
        const next = pressedBoostRef.current.size > 0;
        setBoost((prev) => (prev === next ? prev : next));
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
      dispatch({ type: 'TICK' });
    });
    return () => {
      ctx.ticker.stop();
    };
  }, [ctx.ticker]);

  // ticker 速度跟着 mode / 当前游戏 / 是否 game over 走。
  // playing 态优先用 game.tickSpeeds[speed-1]，回退到 game.tickSpeed，
  // 都没有就沿用开机动画速度（说明这款游戏不关心 tick 节奏）。
  // boost=true 时整体 × BOOST_FACTOR；死亡动画期间不加速（GAME_OVER 固定速度
  // 是动画节奏，不能变）
  useEffect(() => {
    if (state.mode === 'playing' && state.playingId) {
      const game = registry.get(state.playingId);
      const isOver = game?.isGameOver?.(state.gameState) ?? false;
      const baseSpeed =
        game?.tickSpeeds?.[state.menu.speed - 1] ?? game?.tickSpeed ?? BOOT_TICK_SPEED;
      ctx.ticker.setSpeed(
        isOver ? GAME_OVER_ANIM_SPEED : boost ? baseSpeed * BOOST_FACTOR : baseSpeed
      );
    } else {
      ctx.ticker.setSpeed(BOOT_TICK_SPEED);
    }
  }, [state.mode, state.playingId, state.gameState, state.menu.speed, boost, ctx.ticker, registry]);

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

  // 本局分数超越 hi-score 时推进。用 ref 式同步调用是安全的：
  // createCounter.set 在值未变时不通知，不会反向触发 score 订阅造成循环。
  useEffect(() => {
    if (state.mode !== 'playing' || !hiCounter) return;
    if (score > hiCounter.value) hiCounter.set(score);
  }, [score, state.mode, hiCounter]);

  return (
    <div className={styles.page}>
      <Device
        screen={<ContentScreen screen={ctx.screen} cellSize={16} innerSize={9} />}
        side={
          <SidePanel
            score={score}
            hiScore={hiScore}
            speed={state.menu.speed}
            level={state.menu.level}
            selectMode={state.mode === 'select'}
            soundOn={soundOn}
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
