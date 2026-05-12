/**
 * TrainingApp —— 训练可视化页面（MPA 独立入口）
 *
 * 左侧：缩小的 Device 外壳，AI Autopilot 操控 Snake
 * 右侧：ECharts Dashboard，轮询 JSONL 实时展示训练曲线
 *
 * TODO: 支持切换已训练模型，在游戏机上展示 AI 自动玩
 * TODO: 实时显示训练过程——固定速度取当前最新路径回放，无需逐步全量展示
 */

import { useEffect, useMemo, useRef, useState } from 'react';

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

type AgentStatus = 'loading' | 'ready' | 'no-model';

export function TrainingApp(): React.ReactElement {
  // AI 用的 headless context：与真机一致的 10x20 场地
  const [displayCtx] = useState(() =>
    createHeadlessContext({ seed: 1, width: FIELD_W, height: FIELD_H })
  );
  const displayEnv = useMemo<GameEnv>(() => toGameEnv(displayCtx), [displayCtx]);

  const [rlEnvSeed] = useState(() => Date.now());
  const rlEnv = useMemo(
    () => createSnakeRLEnv({ width: FIELD_W, height: FIELD_H, seed: rlEnvSeed }),
    [rlEnvSeed]
  );

  const [agentStatus, setAgentStatus] = useState<AgentStatus>('loading');
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const agentRef = useRef<InferenceAgent | null>(null);
  const rlStateRef = useRef<SnakeRLState | null>(null);
  const [score, setScore] = useState(0);

  // 加载推理模型（失败后每 3 秒重试，训练完成时自动加载）
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const tryLoad = async (): Promise<void> => {
      try {
        const agent = await loadInferenceAgent(MODEL_URL, OBS_SIZE);
        if (cancelled) {
          agent.dispose();
          return;
        }
        agentRef.current?.dispose();
        agentRef.current = agent;
        setModelInfo(agent.info);
        setAgentStatus('ready');
      } catch {
        if (!cancelled) {
          setAgentStatus('no-model');
          retryTimer = setTimeout(() => void tryLoad(), 3000);
        }
      }
    };

    void tryLoad();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      agentRef.current?.dispose();
      agentRef.current = null;
    };
  }, []);

  // 初始化第一局
  useEffect(() => {
    rlStateRef.current = rlEnv.reset(rlEnvSeed);
  }, [rlEnv, rlEnvSeed]);

  // AI 游戏循环——死亡后等 300ms 重开，期间跳过 step 防止重复 reset
  const resettingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const timer = setInterval(() => {
      const agent = agentRef.current;
      const state = rlStateRef.current;
      if (!agent || !state || resettingRef.current) return;

      const obs = rlEnv.encodeState(state);
      const actionIdx = agent.act(obs);
      const result = rlEnv.step(state, rlEnv.actionSpace[actionIdx]!);

      rlStateRef.current = result.state;
      setScore(result.state.score);

      displayEnv.screen.clear();

      if (result.done) {
        resettingRef.current = true;
        resetTimerRef.current = setTimeout(() => {
          rlStateRef.current = rlEnv.reset(Date.now());
          setScore(0);
          resettingRef.current = false;
        }, 300);
      } else {
        renderSnake(displayEnv, result.state.game);
      }
    }, AI_TICK_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(resetTimerRef.current);
    };
  }, [rlEnv, displayEnv]);

  // 训练数据轮询
  const data = useTrainingData(LOG_URL);

  const trainedEp = data.config?.totalEpisodes ?? 0;
  const statusText =
    agentStatus === 'ready' && modelInfo
      ? `AI 就绪 · ${trainedEp} 轮训练 · ${modelInfo.layers} 层 ${(modelInfo.params / 1000).toFixed(1)}K 参数`
      : agentStatus === 'loading'
        ? '加载模型中…'
        : '等待训练完成…';

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
                speed={1}
                level={1}
                soundOn={false}
                pauseMode={false}
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
