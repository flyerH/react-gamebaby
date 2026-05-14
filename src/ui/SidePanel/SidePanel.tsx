import { useEffect, useReducer } from 'react';

import type { Screen } from '@/engine/types';

import styles from './SidePanel.module.css';

export interface SidePanelProps {
  /**
   * 是否通电；false 时整个面板视觉隐藏（visibility: hidden 占位仍在，
   * LCD 屏布局不变）。模拟真机关机：LCD 没电，所有印刷字 / 数字 / 灯
   * 都看不见
   */
  power?: boolean;
  score?: number;
  hiScore?: number;
  /** 4×2 预览屏 framebuffer；游戏在 render 里画，此组件订阅渲染 */
  nextScreen?: Screen | null;
  level?: number;
  speed?: number;
  /** 'pause' 指示灯是否点亮 */
  pauseMode?: boolean;
  /** 'sound' 指示灯是否点亮（反映 ctx.soundOn） */
  soundOn?: boolean;
  /** 'AI' 指示灯是否点亮 */
  aiMode?: boolean;
}

/**
 * 固定 4×2 的迷你像素网格，与主屏同风格（外框 + 内方块）。
 * 订阅 Screen buffer 变化触发 re-render，用 DOM span 模拟像素
 */
function NextPreview({
  screen,
}: {
  readonly screen: Screen | null | undefined;
}): React.ReactElement {
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (!screen) return;
    return screen.subscribe(forceUpdate);
  }, [screen]);

  const cols = screen?.width ?? 4;
  const rows = screen?.height ?? 2;
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = screen ? screen.getPixel(x, y) : false;
      cells.push(
        <span key={`${x},${y}`} className={lit ? styles.pixelOn : styles.pixelOff}>
          <span className={styles.pixelInner} />
        </span>
      );
    }
  }
  return <div className={styles.previewGrid}>{cells}</div>;
}

/**
 * SidePanel —— LCD 屏右侧的静态信息区
 *
 * 只显示分数 / 高分 / 等级 / 速度 + 指示灯。
 * 当前游戏的"编号 + 名字"不在这里以文字形式呈现——真机是把
 * 当前游戏的代号用像素字打在主屏上的 preview 点阵里，我们沿用这种做法。
 */
export function SidePanel({
  power = true,
  score = 0,
  hiScore = 0,
  nextScreen,
  level = 1,
  speed = 1,
  pauseMode = false,
  soundOn = false,
  aiMode = false,
}: SidePanelProps): React.ReactElement {
  const className = power ? styles.panel : `${styles.panel} ${styles.poweredOff}`;
  return (
    <div className={className}>
      <div className={styles.group}>
        <p className={styles.label}>SCORE</p>
        <p className={styles.value}>{score}</p>
      </div>
      <div className={styles.group}>
        <p className={styles.label}>HI-SCORE</p>
        <p className={styles.value}>{hiScore}</p>
      </div>
      <div className={styles.group}>
        <p className={styles.label}>NEXT</p>
        <NextPreview screen={nextScreen} />
      </div>
      <div className={styles.group}>
        <p className={styles.label}>LEVEL</p>
        <p className={styles.value}>{level}</p>
      </div>
      <div className={styles.group}>
        <p className={styles.label}>SPEED</p>
        <p className={styles.value}>{speed}</p>
      </div>

      <div className={styles.indicators}>
        <p className={aiMode ? styles.indicatorOn : styles.indicatorOff}>AI</p>
        <p className={pauseMode ? styles.indicatorOn : styles.indicatorOff}>PAUSE</p>
        <p className={soundOn ? styles.indicatorOn : styles.indicatorOff}>SOUND</p>
      </div>
    </div>
  );
}
