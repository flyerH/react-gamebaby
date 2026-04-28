import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';

import type { Button, ButtonAction } from '@/engine/types';
import { defaultGames } from '@/games';
import { bindKeyboardInput, createBrowserContext } from '@/platform/browser';
import type { Game, GameEnv, GameRegistry } from '@/sdk';
import { toGameEnv } from '@/sdk';
import { Buttons } from '@/ui/Buttons';
import { ContentScreen } from '@/ui/ContentScreen';
import { Device } from '@/ui/Device';
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

  // playing：先给游戏处理按键，再考虑退出键
  if (state.playingId) {
    const game = registry.get(state.playingId);
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
  const [ctx] = useState(() => createBrowserContext({ seed: 42 }));
  const registry = defaultGames;
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
      dispatch({ type: 'INPUT', button, kind });
    });
    return () => {
      unsub();
      unbind();
    };
  }, [ctx.input]);

  useEffect(() => {
    ctx.ticker.start(() => {
      dispatch({ type: 'TICK' });
    });
    return () => {
      ctx.ticker.stop();
    };
  }, [ctx.ticker]);

  // ticker 速度跟着 mode / 当前游戏走
  useEffect(() => {
    if (state.mode === 'playing' && state.playingId) {
      const game = registry.get(state.playingId);
      ctx.ticker.setSpeed(game?.tickSpeed ?? BOOT_TICK_SPEED);
    } else {
      ctx.ticker.setSpeed(BOOT_TICK_SPEED);
    }
  }, [state.mode, state.playingId, ctx.ticker, registry]);

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

  return (
    <div className={styles.page}>
      <Device
        screen={<ContentScreen screen={ctx.screen} />}
        side={<SidePanel score={score} selectMode={state.mode === 'select'} />}
        buttons={
          <Buttons
            onInput={(btn, action) => {
              ctx.input.emit(btn, action);
            }}
          />
        }
      />
    </div>
  );
}
