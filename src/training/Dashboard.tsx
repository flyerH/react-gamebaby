/**
 * Dashboard —— 训练指标可视化面板
 *
 * 6 个统计卡片 + 5 张 ECharts 图表，从 useTrainingData 的数据驱动。
 * 按需引入 echarts 组件，减少 bundle 体积。
 */

import { useEffect, useRef } from 'react';

import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';

import type { TrainingData, EpisodeData, SummaryData } from './useTrainingData';
import styles from './Dashboard.module.css';

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

/* ---------- 工具函数 ---------- */

function movingAvg(arr: readonly number[], window: number): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]!;
    if (i >= window) sum -= arr[i - window]!;
    const cnt = Math.min(i + 1, window);
    result.push(+(sum / cnt).toFixed(3));
  }
  return result;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

/* ---------- 图表配置 ---------- */

const GRID = { left: 50, right: 16, top: 8, bottom: 28 };
const AXIS_LABEL = { color: '#666', fontSize: 10 };
const AXIS_LINE = { lineStyle: { color: '#333' } };
const SPLIT_LINE = { lineStyle: { color: '#1a1a2e' } };

function useChart(
  containerRef: React.RefObject<HTMLDivElement | null>
): React.RefObject<EChartsType | null> {
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [containerRef]);

  return chartRef;
}

/* ---------- 子图表组件 ---------- */

function RewardChart({ episodes }: { episodes: readonly EpisodeData[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useChart(ref);

  useEffect(() => {
    if (!chart.current || episodes.length === 0) return;
    const eps = episodes.map((e) => e.ep);
    const rewards = episodes.map((e) => e.reward);
    chart.current.setOption(
      {
        animation: false,
        grid: GRID,
        xAxis: { type: 'category', data: eps, axisLabel: AXIS_LABEL, axisLine: AXIS_LINE },
        yAxis: { type: 'value', splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
        tooltip: { trigger: 'axis' },
        series: [
          {
            name: 'Reward',
            type: 'scatter',
            data: rewards,
            symbolSize: 2,
            itemStyle: { color: 'rgba(74,222,128,0.15)' },
          },
          {
            name: '滑动平均(100)',
            type: 'line',
            data: movingAvg(rewards, 100),
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#4ade80', width: 2 },
            itemStyle: { color: '#4ade80' },
          },
        ],
      },
      true
    );
  }, [chart, episodes]);

  return (
    <div className={styles.chartCard + ' ' + styles.wide}>
      <h3 className={styles.chartTitle}>奖励曲线</h3>
      <div ref={ref} className={styles.chart} />
    </div>
  );
}

function LossChart({ summaries }: { summaries: readonly SummaryData[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useChart(ref);

  useEffect(() => {
    if (!chart.current || summaries.length === 0) return;
    chart.current.setOption(
      {
        animation: false,
        grid: GRID,
        xAxis: {
          type: 'category',
          data: summaries.map((s) => s.ep),
          axisLabel: AXIS_LABEL,
          axisLine: AXIS_LINE,
        },
        yAxis: { type: 'value', splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
        tooltip: { trigger: 'axis' },
        series: [
          {
            name: 'Avg Loss',
            type: 'line',
            data: summaries.map((s) => +s.avgLoss.toFixed(4)),
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#fbbf24', width: 2 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(251,191,36,0.3)' },
                  { offset: 1, color: 'rgba(251,191,36,0.02)' },
                ],
              },
            },
          },
        ],
      },
      true
    );
  }, [chart, summaries]);

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Loss 曲线</h3>
      <div ref={ref} className={styles.chart} />
    </div>
  );
}

function EpsilonChart({ episodes }: { episodes: readonly EpisodeData[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useChart(ref);

  useEffect(() => {
    if (!chart.current || episodes.length === 0) return;
    chart.current.setOption(
      {
        animation: false,
        grid: GRID,
        xAxis: {
          type: 'category',
          data: episodes.map((e) => e.ep),
          axisLabel: AXIS_LABEL,
          axisLine: AXIS_LINE,
        },
        yAxis: { type: 'value', min: 0, max: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
        tooltip: { trigger: 'axis' },
        series: [
          {
            name: 'Epsilon',
            type: 'line',
            data: episodes.map((e) => e.epsilon),
            showSymbol: false,
            lineStyle: { color: '#60a5fa', width: 2 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(96,165,250,0.3)' },
                  { offset: 1, color: 'rgba(96,165,250,0.02)' },
                ],
              },
            },
          },
        ],
      },
      true
    );
  }, [chart, episodes]);

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Epsilon 衰减</h3>
      <div ref={ref} className={styles.chart} />
    </div>
  );
}

function ScoreChart({ episodes }: { episodes: readonly EpisodeData[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useChart(ref);

  useEffect(() => {
    if (!chart.current || episodes.length === 0) return;
    const scores = episodes.map((e) => e.score);
    chart.current.setOption(
      {
        animation: false,
        grid: GRID,
        xAxis: {
          type: 'category',
          data: episodes.map((e) => e.ep),
          axisLabel: AXIS_LABEL,
          axisLine: AXIS_LINE,
        },
        yAxis: { type: 'value', splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
        tooltip: { trigger: 'axis' },
        series: [
          {
            name: 'Score',
            type: 'scatter',
            data: scores,
            symbolSize: 2,
            itemStyle: { color: 'rgba(244,114,182,0.2)' },
          },
          {
            name: '滑动平均',
            type: 'line',
            data: movingAvg(scores, 100),
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#f472b6', width: 2 },
          },
        ],
      },
      true
    );
  }, [chart, episodes]);

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>分数分布</h3>
      <div ref={ref} className={styles.chart} />
    </div>
  );
}

function LengthChart({ episodes }: { episodes: readonly EpisodeData[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useChart(ref);

  useEffect(() => {
    if (!chart.current || episodes.length === 0) return;
    const lengths = episodes.map((e) => e.length);
    chart.current.setOption(
      {
        animation: false,
        grid: GRID,
        xAxis: {
          type: 'category',
          data: episodes.map((e) => e.ep),
          axisLabel: AXIS_LABEL,
          axisLine: AXIS_LINE,
        },
        yAxis: { type: 'value', splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
        tooltip: { trigger: 'axis' },
        series: [
          {
            name: '步数',
            type: 'scatter',
            data: lengths,
            symbolSize: 2,
            itemStyle: { color: 'rgba(192,132,252,0.2)' },
          },
          {
            name: '滑动平均',
            type: 'line',
            data: movingAvg(lengths, 100),
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#c084fc', width: 2 },
          },
        ],
      },
      true
    );
  }, [chart, episodes]);

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Episode 长度</h3>
      <div ref={ref} className={styles.chart} />
    </div>
  );
}

/* ---------- 统计卡片 ---------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}): React.ReactElement {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ---------- 进度条 ---------- */

function ProgressBar({ current, total }: { current: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const done = current >= total && total > 0;

  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${pct}%`, background: done ? '#4ade80' : '#60a5fa' }}
        />
      </div>
      <span className={styles.progressText}>
        {done ? '训练完成' : `${current} / ${total}  (${pct.toFixed(1)}%)`}
      </span>
    </div>
  );
}

/* ---------- 主面板 ---------- */

export function Dashboard({ data }: { data: TrainingData }): React.ReactElement {
  const { config, episodes, summaries } = data;
  const lastEp = episodes.length > 0 ? episodes[episodes.length - 1] : undefined;
  const lastSum = summaries.length > 0 ? summaries[summaries.length - 1] : undefined;

  const currentEp = lastEp?.ep ?? 0;
  const totalEp = config?.totalEpisodes ?? 0;

  const recent = episodes.slice(-100);
  const avgReward =
    recent.length > 0 ? (recent.reduce((s, e) => s + e.reward, 0) / recent.length).toFixed(2) : '-';

  return (
    <>
      <h1 className={styles.title}>Snake DQN 训练</h1>

      {totalEp > 0 && <ProgressBar current={currentEp} total={totalEp} />}

      <div className={styles.statsGrid}>
        <StatCard label="Episode" value={lastEp ? String(lastEp.ep) : '0'} color="#f472b6" />
        <StatCard label="平均奖励 (近100)" value={avgReward} color="#4ade80" />
        <StatCard
          label="平均 Loss"
          value={lastSum ? lastSum.avgLoss.toFixed(4) : '-'}
          color="#fbbf24"
        />
        <StatCard
          label="Epsilon"
          value={lastEp ? lastEp.epsilon.toFixed(4) : '-'}
          color="#60a5fa"
        />
        <StatCard
          label="总步数"
          value={lastSum ? lastSum.totalSteps.toLocaleString() : '0'}
          color="#c084fc"
        />
        <StatCard
          label="训练时间"
          value={lastSum ? formatTime(lastSum.elapsedSec) : '-'}
          color="#94a3b8"
        />
      </div>

      <div className={styles.chartsGrid}>
        <RewardChart episodes={episodes} />
        <LossChart summaries={summaries} />
        <EpsilonChart episodes={episodes} />
        <ScoreChart episodes={episodes} />
        <LengthChart episodes={episodes} />
      </div>
    </>
  );
}
