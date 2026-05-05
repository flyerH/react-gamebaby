import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';

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
import { currentGame, initialMenuState, type MenuState, selectNext, selectPrev } from './menu';

/** 开机动画速度：约每秒 60 像素 */
const BOOT_TICK_SPEED = 60;

/**
 * Game Over 死亡动画速度：每秒 30 帧。
 *
 * 当前接入的是 Snake 的两阶段动画（爆炸 30 帧 + 填屏 20 帧 ≈ 1.7s），
 * 每帧推进 1 个 overFrame。继续上调到 40+ 会显得仓促。
 */
const GAME_OVER_ANIM_SPEED = 30;

type Mode = 'boot' | 'select' | 'playing';

interface AppState {
  readonly mode: Mode;
  readonly boot: BootState;
  readonly menu: MenuState;
  /** 当前进入 playing 的游戏 id；非 playing 态为 null */
  readonly playingId: string | null;
  /** 具体游戏的内部 state；类型由 Game<S> 的 S 决定，外层用 unknown 持有 */
  readonly gameState: unknown;
}

type Action = { type: 'TICK' } | { type: 'INPUT'; button: Button; kind: ButtonAction };

interface ReduceDeps {
  readonly registry: GameRegistry;
  readonly anim: BootAnimation;
  readonly env: GameEnv;
}

function initialAppState(): AppState {
  return {
    mode: 'boot',
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

  if (state.mode === 'boot') {
    if (kind !== 'press') return state;
    return { ...state, mode: 'select', menu: initialMenuState() };
  }

  if (state.mode === 'select') {
    if (kind !== 'press') return state;
    if (button === 'Up' || button === 'Left') {
      return { ...state, menu: selectPrev(registry, state.menu) };
    }
    if (button === 'Down' || button === 'Right') {
      return { ...state, menu: selectNext(registry, state.menu) };
    }
    if (button === 'Start' || button === 'A') {
      const game = currentGame(registry, state.menu);
      if (!game) return state;
      const initial = isPlayable(game) ? game.init(env) : null;
      return {
        ...state,
        mode: 'playing',
        playingId: game.id,
        gameState: initial,
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
 * 三态状态机：boot（开机动画循环）→ select（方向键切游戏）→
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

  useEffect(() => {
    const unbind = bindKeyboardInput(ctx.input);
    const unsub = ctx.input.subscribe((button, kind) => {
      // Sound 按键在外层拦截：属于"平台设置"范畴，不走游戏 reducer
      // 也不进入 playing 态的 onButton，避免游戏误消费
      if (kind === 'press' && button === 'Sound') {
        const next = !ctx.soundOn.value;
        ctx.soundOn.set(next);
        ctx.sound.setEnabled(next);
        return;
      }
      dispatch({ type: 'INPUT', button, kind });
    });
    return () => {
      unsub();
      unbind();
    };
  }, [ctx]);

  useEffect(() => {
    ctx.ticker.start(() => {
      dispatch({ type: 'TICK' });
    });
    return () => {
      ctx.ticker.stop();
    };
  }, [ctx.ticker]);

  // ticker 速度跟着 mode / 当前游戏 / 是否 game over 走
  useEffect(() => {
    if (state.mode === 'playing' && state.playingId) {
      const game = registry.get(state.playingId);
      const isOver = game?.isGameOver?.(state.gameState) ?? false;
      ctx.ticker.setSpeed(isOver ? GAME_OVER_ANIM_SPEED : (game?.tickSpeed ?? BOOT_TICK_SPEED));
    } else {
      ctx.ticker.setSpeed(BOOT_TICK_SPEED);
    }
  }, [state.mode, state.playingId, state.gameState, ctx.ticker, registry]);

  // 屏幕渲染
  useEffect(() => {
    const { screen } = ctx;
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
        screen={<ContentScreen screen={ctx.screen} />}
        side={
          <SidePanel
            score={score}
            hiScore={hiScore}
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
