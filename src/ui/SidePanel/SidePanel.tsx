import type { Pixel } from '@/sdk';

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
  /**
   * 下一块方块的预览像素（相对坐标）；null / undefined 表示不显示。
   * Tetris playing 时由 App 从 TetrisState.next 提取传入
   */
  nextPreview?: ReadonlyArray<Pixel> | null;
  level?: number;
  speed?: number;
  /** 'pause' 指示灯是否点亮 */
  pauseMode?: boolean;
  /** 'sound' 指示灯是否点亮（反映 ctx.soundOn） */
  soundOn?: boolean;
}

/**
 * 固定 4×2 的迷你像素网格，与主屏同风格（外框 + 内方块）但缩小到 ~80%。
 * 始终占位，有数据时亮格子、没数据时全暗阴影
 */
function NextPreview({
  pixels,
}: {
  readonly pixels: ReadonlyArray<Pixel> | null | undefined;
}): React.ReactElement {
  const set = new Set(pixels?.map(([x, y]) => `${x},${y}`) ?? []);
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = set.has(`${x},${y}`);
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
  nextPreview,
  level = 1,
  speed = 1,
  pauseMode = false,
  soundOn = false,
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
        <NextPreview pixels={nextPreview} />
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
        <p className={pauseMode ? styles.indicatorOn : styles.indicatorOff}>PAUSE</p>
        <p className={soundOn ? styles.indicatorOn : styles.indicatorOff}>SOUND</p>
      </div>
    </div>
  );
}
