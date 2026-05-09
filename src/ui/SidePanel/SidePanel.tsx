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
  level?: number;
  speed?: number;
  /** 'select' 指示灯是否点亮（仅在选择态亮） */
  selectMode?: boolean;
  /** 'pause' 指示灯是否点亮 */
  pauseMode?: boolean;
  /** 'sound' 指示灯是否点亮（反映 ctx.soundOn） */
  soundOn?: boolean;
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
  level = 1,
  speed = 1,
  selectMode = false,
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
        <p className={styles.label}>LEVEL</p>
        <p className={styles.value}>{level}</p>
      </div>
      <div className={styles.group}>
        <p className={styles.label}>SPEED</p>
        <p className={styles.value}>{speed}</p>
      </div>

      <div className={styles.indicators}>
        <p className={selectMode ? styles.indicatorOn : styles.indicatorOff}>SELECT</p>
        <p className={pauseMode ? styles.indicatorOn : styles.indicatorOff}>PAUSE</p>
        <p className={soundOn ? styles.indicatorOn : styles.indicatorOff}>SOUND</p>
      </div>
    </div>
  );
}
