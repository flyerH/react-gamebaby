import { Dialog } from '@capacitor/dialog';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { bindPressRepeat } from '@/engine/repeat';
import type { Button, ButtonAction } from '@/engine/types';
import { defaultGames } from '@/games';
import { isMoveDue, type SnakeState } from '@/games/snake/state';
import { type AutopilotProvider, createMachine } from '@/machine';
import {
  bindAppState,
  bindBackButton,
  bindKeyboardInput,
  createBrowserContext,
  isDevBuild,
  timeoutSchedule,
} from '@/platform/browser';
import { Buttons } from '@/ui/Buttons';
import { ContentScreen } from '@/ui/ContentScreen';
import { Device } from '@/ui/Device';
import { defaultButtonLabels, defaultDialogLabels } from '@/ui/locale';
import { SidePanel } from '@/ui/SidePanel';

import styles from './App.module.css';

/** AI 动作索引 → 按键的映射（与训练时 SnakeRLEnv.actionSpace 顺序一致） */
const AI_ACTION_MAP: readonly Button[] = ['Up', 'Down', 'Left', 'Right'];

/** Snake 的 DQN 自动玩：模型与推理代码按需动态加载，不进首屏包 */
const snakeAutopilot: AutopilotProvider = {
  gameId: 'snake',
  async load() {
    try {
      const [inference, rl] = await Promise.all([
        import('@/ai/inference'),
        import('@/games/snake/rl'),
      ]);
      const obsSize = rl.SNAKE_RL_WIDTH * rl.SNAKE_RL_HEIGHT * rl.SNAKE_RL_CHANNELS;
      const agent = await inference.loadInferenceAgent('/models/snake-dqn/model.json', obsSize);
      return {
        act(gameState) {
          const gs = gameState as SnakeState | null;
          if (!gs?.body) return null;
          // 方向键按下即走一格，只在该走格的那一帧出手，保持模型训练时一步一格的节奏；
          // 等待首键时照常出手，由第一次按键开局
          if (!gs.awaitingFirstMove && !isMoveDue(gs)) return null;
          try {
            const obs = rl.encodeSnakeObs(gs, rl.SNAKE_RL_WIDTH, rl.SNAKE_RL_HEIGHT);
            return AI_ACTION_MAP[agent.act(obs)] ?? null;
          } catch (e) {
            console.error('[AI] 推理异常:', e);
            return null;
          }
        },
        dispose: () => {
          agent.dispose();
        },
      };
    } catch (e) {
      console.warn('[AI] 模型加载失败:', e);
      throw e;
    }
  },
};

/**
 * App：网页与 Android WebView 入口的 React 装配
 *
 * 主机规则在 @/machine，这里只负责创建浏览器平台的 HardwareContext、
 * 绑定键盘 / 返回键 / 前后台等宿主事件，并把 machine 状态渲染成 UI。
 */
export function App(): React.ReactElement {
  // 真机每次开机都是新局面，种子用当前时间；需要重现的训练 / 测试走 createHeadlessContext({ seed })
  const [ctx] = useState(() => createBrowserContext({ seed: Date.now() }));
  const [machine] = useState(() =>
    createMachine({ ctx, games: defaultGames, seed: Date.now(), autopilot: snakeAutopilot })
  );
  // 按钮标签 / 弹窗文案按浏览器首选语言一次性装配；语言切换需刷新页面
  const [buttonLabels] = useState(() => defaultButtonLabels());
  const [dialogLabels] = useState(() => defaultDialogLabels());

  useEffect(() => {
    machine.start();
    return () => {
      machine.stop();
    };
  }, [machine]);

  useEffect(() => {
    const unbindKeys = bindKeyboardInput(ctx.input);
    const unbindRepeat = bindPressRepeat(ctx.input, { schedule: timeoutSchedule });
    return () => {
      unbindRepeat();
      unbindKeys();
    };
  }, [ctx.input]);

  // Android 系统返回键 / 边缘手势：playing 态退回菜单，其它模式弹原生确认框后退出。
  // 选用 @capacitor/dialog 的原因见 docs/MOBILE.md「系统返回键 / 边缘右滑行为」；
  // 普通浏览器构建里 bindBackButton 安全 no-op
  useEffect(() => {
    const unbind = bindBackButton({
      handler: async () => {
        if (machine.getState().mode === 'playing') {
          ctx.input.emit('Select', 'press');
          return true;
        }
        const { value } = await Dialog.confirm({
          title: dialogLabels.exitTitle,
          message: dialogLabels.exitMessage,
          okButtonTitle: dialogLabels.exitOk,
          cancelButtonTitle: dialogLabels.exitCancel,
        });
        return !value;
      },
    });
    return () => {
      unbind();
    };
  }, [ctx.input, machine, dialogLabels]);

  useEffect(() => {
    const unbind = bindAppState({
      onBackground: () => {
        machine.suspend();
      },
      onForeground: () => {
        machine.resume();
      },
    });
    return () => {
      unbind();
    };
  }, [machine]);

  // Android 开发版在机身标题旁贴 DEV 角标，与同机安装的正式版区分
  const [devBuild, setDevBuild] = useState(false);
  useEffect(() => {
    let alive = true;
    void isDevBuild().then((dev) => {
      if (alive) setDevBuild(dev);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ctx.input 引用稳定，memo 化的 Buttons 在每 tick 重渲染时被跳过
  const handleInput = useCallback(
    (btn: Button, action: ButtonAction) => {
      ctx.input.emit(btn, action);
    },
    [ctx.input]
  );

  const state = useSyncExternalStore(machine.subscribe, machine.getState);
  const hiScore = useSyncExternalStore(machine.subscribe, machine.getHiScore);
  const score = useSyncExternalStore(
    useMemo(() => (notify: () => void) => ctx.score.subscribe(notify), [ctx.score]),
    () => ctx.score.value
  );
  const soundOn = useSyncExternalStore(
    useMemo(() => (notify: () => void) => ctx.soundOn.subscribe(notify), [ctx.soundOn]),
    () => ctx.soundOn.value
  );
  const paused = useSyncExternalStore(
    useMemo(() => (notify: () => void) => ctx.pause.subscribe(notify), [ctx.pause]),
    () => ctx.pause.value
  );

  return (
    <div className={styles.page}>
      <Device
        badge={devBuild ? 'DEV' : undefined}
        screen={<ContentScreen screen={ctx.screen} cellSize={16} innerSize={8} />}
        side={
          <SidePanel
            power={state.mode !== 'off'}
            score={score}
            hiScore={hiScore}
            auxScreen={ctx.auxScreen}
            speed={state.menu.speed}
            level={state.menu.level}
            pauseMode={paused}
            soundOn={soundOn}
            aiMode={state.aiPlaying}
          />
        }
        buttons={<Buttons labels={buttonLabels} onInput={handleInput} />}
      />
    </div>
  );
}
