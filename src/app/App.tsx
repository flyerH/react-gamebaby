import { useEffect, useMemo, useReducer, useState } from 'react';

import type { Button, ButtonAction } from '@/engine/types';
import { defaultGames } from '@/games';
import { bindKeyboardInput, createBrowserContext } from '@/platform/browser';
import type { GameRegistry, Pixel } from '@/sdk';
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

/** 开机动画速度：约每秒 60 像素（legacy 为 67，视觉接近） */
const BOOT_TICK_SPEED = 60;

type Mode = 'boot' | 'select' | 'playing';

interface AppState {
  readonly mode: Mode;
  readonly boot: BootState;
  readonly menu: MenuState;
}

type Action = { type: 'TICK' } | { type: 'INPUT'; button: Button; kind: ButtonAction };

function initialAppState(): AppState {
  return {
    mode: 'boot',
    boot: initialBootState(),
    menu: initialMenuState(),
  };
}

/**
 * 纯 reducer：根据当前 mode 分派输入 / tick
 *
 * 边界：TICK 只在 boot 态推动开机动画；playing 态暂时没有逻辑，
 * 留给后续接入 SDK 真正游戏时再填充。
 */
function reduce(
  state: AppState,
  action: Action,
  registry: GameRegistry,
  anim: BootAnimation
): AppState {
  if (action.type === 'TICK') {
    if (state.mode === 'boot') {
      return { ...state, boot: stepBoot(anim, state.boot) };
    }
    return state;
  }

  if (action.kind !== 'press') return state;
  const { button } = action;

  if (state.mode === 'boot') {
    return { ...state, mode: 'select', menu: initialMenuState() };
  }

  if (state.mode === 'select') {
    if (button === 'Up' || button === 'Left') {
      return { ...state, menu: selectPrev(registry, state.menu) };
    }
    if (button === 'Down' || button === 'Right') {
      return { ...state, menu: selectNext(registry, state.menu) };
    }
    if (button === 'Start' || button === 'A') {
      return { ...state, mode: 'playing' };
    }
    return state;
  }

  if (button === 'Select' || button === 'Reset') {
    return { ...state, mode: 'select' };
  }
  return state;
}

/** 根据当前 state 投影出屏幕应该点亮的像素集合 */
function projectScreen(
  state: AppState,
  registry: GameRegistry,
  anim: BootAnimation
): ReadonlyArray<Pixel> {
  if (state.mode === 'boot') return projectBoot(anim, state.boot);
  const game = currentGame(registry, state.menu);
  return game?.preview ?? [];
}

/**
 * App —— 掌机应用层装配
 *
 * 管三件事：
 * 1. 创建 BrowserContext（只做一次，纯组装）
 * 2. 维护三态状态机：boot（开机动画循环）→ select（方向键切游戏）→
 *    playing（进入占位画面，Select / R 回到 select）
 * 3. 每当 state 变化，把 projectScreen 的像素写到 L3 Screen，
 *    由 ContentScreen 订阅渲染。
 *
 * 所有副作用（键盘、ticker、screen 写入）都在 useEffect 里，cleanup 完整。
 */
export function App(): React.ReactElement {
  const [ctx] = useState(() => createBrowserContext({ seed: 42 }));
  const registry = defaultGames;
  const anim = useMemo(
    () => createBootAnimation(ctx.screen.width, ctx.screen.height),
    [ctx.screen]
  );

  const [state, dispatch] = useReducer(
    (s: AppState, a: Action) => reduce(s, a, registry, anim),
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
    ctx.ticker.setSpeed(BOOT_TICK_SPEED);
    ctx.ticker.start(() => {
      dispatch({ type: 'TICK' });
    });
    return () => {
      ctx.ticker.stop();
    };
  }, [ctx.ticker]);

  useEffect(() => {
    const { screen } = ctx;
    screen.clear();
    for (const [x, y] of projectScreen(state, registry, anim)) {
      screen.setPixel(x, y, true);
    }
  }, [state, ctx, registry, anim]);

  return (
    <div className={styles.page}>
      <Device
        screen={<ContentScreen screen={ctx.screen} />}
        side={<SidePanel selectMode={state.mode === 'select'} />}
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
