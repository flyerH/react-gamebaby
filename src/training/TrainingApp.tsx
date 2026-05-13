/**
 * TrainingApp —— 训练可视化页面（MPA 独立入口）
 *
 * 左侧：缩小的 Device 外壳
 *   - 训练中：确定性回放训练子进程实际跑的最新一轮（seed + actions）
 *   - 训练后：加载最终模型做实时推理
 * 右侧：ECharts Dashboard，轮询 JSONL 实时展示训练曲线
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { InferenceAgent, ModelInfo } from '@/ai/inference';
import { loadInferenceAgent } from '@/ai/inference';
import { render as renderSnake } from '@/games/snake/logic';
import { createSnakeRLEnv, type SnakeRLState } from '@/games/snake/rl';
import { createHeadlessContext } from '@/platform/headless';
import type { GameEnv } from '@/sdk';
import { toGameEnv } from '@/sdk';
import { Buttons } from '@/ui/Buttons';
import { ContentScreen } from '@/ui/ContentScreen';
import { Device } from '@/ui/Device';
import { defaultButtonLabels } from '@/ui/locale';
import { SidePanel } from '@/ui/SidePanel';

import { Dashboard } from './Dashboard';
import styles from './TrainingApp.module.css';
import { useTrainingData } from './useTrainingData';

const FIELD_W = 10;
const FIELD_H = 20;
const OBS_SIZE = FIELD_W * FIELD_H * 3;
const AI_TICK_MS = 100;

const LOG_URL = '/api/training/train-log.jsonl';
const MODEL_URL = '/api/training/model.json';
const REPLAY_URL = '/api/training/latest-replay.json';

interface ReplayData {
  readonly ep: number;
  readonly seed: number;
  readonly actions: readonly number[];
}

type DisplayMode = 'waiting' | 'replay' | 'inference';

export function TrainingApp(): React.ReactElement {
  const [displayCtx] = useState(() =>
    createHeadlessContext({ seed: 1, width: FIELD_W, height: FIELD_H })
  );
  const displayEnv = useMemo<GameEnv>(() => toGameEnv(displayCtx), [displayCtx]);

  const rlEnv = useMemo(() => createSnakeRLEnv({ width: FIELD_W, height: FIELD_H }), []);

  const [score, setScore] = useState(0);
  const [hiScore, setHiScore] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('waiting');
  const [replayEp, setReplayEp] = useState(0);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);

  // ── 回放状态 ──
  const replayRef = useRef<ReplayData | null>(null);
  const prefetchedRef = useRef<ReplayData | null>(null);
  const replayStepRef = useRef(0);
  const rlStateRef = useRef<SnakeRLState | null>(null);
  /** 死亡冷却：> 0 时每 tick 递减，到 0 自动切下一条。用 tick 计数代替 setTimeout，避免被 effect 清理取消 */
  const cooldownRef = useRef(0);

  // ── 推理状态 ──
  const agentRef = useRef<InferenceAgent | null>(null);

  // 训练数据轮询
  const data = useTrainingData(LOG_URL);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = data.done;
  }, [data.done]);

  // 拉取最新回放数据
  const fetchReplay = useCallback(async (): Promise<ReplayData | null> => {
    try {
      const res = await fetch(REPLAY_URL);
      if (!res.ok) return null;
      return (await res.json()) as ReplayData;
    } catch {
      return null;
    }
  }, []);

  // 回放进行中持续预取最新数据，结束时无需等 fetch
  useEffect(() => {
    if (displayMode !== 'replay') return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      const data = await fetchReplay();
      if (!cancelled && data) prefetchedRef.current = data;
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [displayMode, fetchReplay]);

  // 开始回放一轮录像
  const startReplay = useCallback(
    (replay: ReplayData) => {
      replayRef.current = replay;
      replayStepRef.current = 0;
      rlStateRef.current = rlEnv.reset(replay.seed);
      setScore(0);
      setReplayEp(replay.ep);
      setDisplayMode('replay');
      cooldownRef.current = 0;

      // 渲染初始帧
      const state = rlStateRef.current;
      if (state) {
        displayEnv.screen.clear();
        renderSnake(displayEnv, state.game);
      }
    },
    [rlEnv, displayEnv]
  );

  // 切换到推理模式（用 ref 存最新引用，避免递归重试时引用声明前变量）
  const switchToInferenceRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const fn = async (): Promise<void> => {
      try {
        const agent = await loadInferenceAgent(MODEL_URL, OBS_SIZE);
        agentRef.current?.dispose();
        agentRef.current = agent;
        setModelInfo(agent.info);
        rlStateRef.current = rlEnv.reset(Date.now());
        setScore(0);
        setDisplayMode('inference');
        cooldownRef.current = 0;
      } catch {
        setTimeout(() => void switchToInferenceRef.current?.(), 3000);
      }
    };
    switchToInferenceRef.current = fn;
  }, [rlEnv]);

  // 训练完成时从回放切到推理
  useEffect(() => {
    if (data.done && displayMode !== 'inference') {
      void switchToInferenceRef.current?.();
    }
  }, [data.done, displayMode]);

  // 首次挂载：尝试拉取回放
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const tryFetch = async (): Promise<void> => {
      const replay = await fetchReplay();
      if (cancelled) return;
      if (replay) {
        startReplay(replay);
      } else {
        retryTimer = setTimeout(() => void tryFetch(), 1000);
      }
    };

    void tryFetch();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [fetchReplay, startReplay]);

  // 主循环：回放 / 推理共用同一个 setInterval
  // 全部用 ref + tick 计数器驱动，不使用 setTimeout，
  // 避免 useEffect 清理函数取消定时器导致卡死
  const COOLDOWN_TICKS = 3; // 死亡后停顿 3 tick（300ms）

  useEffect(() => {
    const timer = setInterval(() => {
      // 冷却中：倒计时，到 0 自动切下一条
      if (cooldownRef.current > 0) {
        cooldownRef.current--;
        if (cooldownRef.current === 0) {
          if (displayMode === 'replay') {
            if (doneRef.current) return;
            const replay = replayRef.current;
            const next = prefetchedRef.current ?? replay;
            prefetchedRef.current = null;
            if (next) startReplay(next);
          } else if (displayMode === 'inference') {
            rlStateRef.current = rlEnv.reset(Date.now());
            setScore(0);
            displayEnv.screen.clear();
            if (rlStateRef.current) renderSnake(displayEnv, rlStateRef.current.game);
          }
        }
        return;
      }

      const state = rlStateRef.current;
      if (!state) return;

      // ── 回放模式 ──
      if (displayMode === 'replay') {
        const replay = replayRef.current;
        if (!replay) return;

        const step = replayStepRef.current;
        if (step >= replay.actions.length) {
          cooldownRef.current = COOLDOWN_TICKS;
          return;
        }

        const actionIdx = replay.actions[step]!;
        const action = rlEnv.actionSpace[actionIdx]!;
        const result = rlEnv.step(state, action);
        rlStateRef.current = result.state;
        replayStepRef.current = step + 1;
        setScore(result.state.score);
        setHiScore((prev) => Math.max(prev, result.state.score));
        displayEnv.screen.clear();

        if (!result.done) {
          renderSnake(displayEnv, result.state.game);
        }
        return;
      }

      // ── 推理模式 ──
      if (displayMode === 'inference') {
        const agent = agentRef.current;
        if (!agent) return;

        const obs = rlEnv.encodeState(state);
        const actionIdx = agent.act(obs);
        const result = rlEnv.step(state, rlEnv.actionSpace[actionIdx]!);
        rlStateRef.current = result.state;
        setScore(result.state.score);
        setHiScore((prev) => Math.max(prev, result.state.score));
        displayEnv.screen.clear();

        if (result.done) {
          cooldownRef.current = COOLDOWN_TICKS;
        } else {
          renderSnake(displayEnv, result.state.game);
        }
      }
    }, AI_TICK_MS);

    return () => clearInterval(timer);
  }, [displayMode, rlEnv, displayEnv, startReplay]);

  // 组件卸载清理
  useEffect(
    () => () => {
      agentRef.current?.dispose();
    },
    []
  );

  const totalEp = data.config?.totalEpisodes ?? 0;
  const statusText =
    displayMode === 'inference' && modelInfo
      ? `训练完成 · 模型推理 · ${modelInfo.layers} 层 ${(modelInfo.params / 1000).toFixed(1)}K 参数`
      : displayMode === 'replay'
        ? `训练中 · 回放第 ${replayEp} 轮${totalEp ? ` / ${totalEp}` : ''}`
        : '等待首轮训练…';

  return (
    <div className={styles.page}>
      <div className={styles.leftCol}>
        <div className={styles.deviceWrap}>
          <Device
            screen={<ContentScreen screen={displayCtx.screen} cellSize={16} innerSize={9} />}
            side={
              <SidePanel
                power
                score={score}
                hiScore={hiScore}
                speed={1}
                level={1}
                soundOn={false}
                pauseMode={false}
                aiMode={displayMode !== 'waiting'}
              />
            }
            buttons={<Buttons labels={defaultButtonLabels()} onInput={() => undefined} />}
          />
        </div>
        <div className={styles.statusLabel}>{statusText}</div>
      </div>
      <div className={styles.dashboardWrap}>
        <Dashboard data={data} />
      </div>
    </div>
  );
}
