/**
 * useTrainingData —— 轮询 JSONL 日志的 React hook
 *
 * 每 500ms fetch 一次训练日志文件，增量解析新行。
 * 按字段区分三种行：config（训练配置）、summary（阶段汇总）、episode（逐局数据）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface EpisodeData {
  readonly ep: number;
  readonly reward: number;
  readonly length: number;
  readonly score: number;
  readonly epsilon: number;
}

export interface SummaryData {
  readonly ep: number;
  readonly avgReward: number;
  readonly avgLength: number;
  readonly avgLoss: number;
  readonly totalSteps: number;
  readonly elapsedSec: number;
}

export interface TrainingConfig {
  readonly totalEpisodes: number;
}

export interface TrainingData {
  readonly config: TrainingConfig | null;
  readonly episodes: readonly EpisodeData[];
  readonly summaries: readonly SummaryData[];
}

const POLL_MS = 500;

export function useTrainingData(url: string): TrainingData {
  const [config, setConfig] = useState<TrainingConfig | null>(null);
  const [episodes, setEpisodes] = useState<readonly EpisodeData[]>([]);
  const [summaries, setSummaries] = useState<readonly SummaryData[]>([]);
  const lastLineCount = useRef(0);
  const pollingRef = useRef(false);

  const poll = useCallback(async () => {
    // 上一次 fetch 还没完成时跳过，防止重复处理
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.trim());

      if (lines.length <= lastLineCount.current) return;

      const newLines = lines.slice(lastLineCount.current);
      lastLineCount.current = lines.length;

      const newEpisodes: EpisodeData[] = [];
      const newSummaries: SummaryData[] = [];

      for (const line of newLines) {
        try {
          const data = JSON.parse(line) as Record<string, unknown>;
          if ('totalEpisodes' in data) {
            setConfig(data as unknown as TrainingConfig);
          } else if ('avgReward' in data) {
            newSummaries.push(data as unknown as SummaryData);
          } else if ('ep' in data) {
            newEpisodes.push(data as unknown as EpisodeData);
          }
        } catch {
          // 忽略不完整行
        }
      }

      if (newEpisodes.length > 0) {
        setEpisodes((prev) => [...prev, ...newEpisodes]);
      }
      if (newSummaries.length > 0) {
        setSummaries((prev) => [...prev, ...newSummaries]);
      }
    } catch {
      // 文件不存在或网络错误，静默重试
    } finally {
      pollingRef.current = false;
    }
  }, [url]);

  useEffect(() => {
    const timer = setInterval(() => void poll(), POLL_MS);
    const first = setTimeout(() => void poll(), 0);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [poll]);

  return { config, episodes, summaries };
}
