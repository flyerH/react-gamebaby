import styles from './SidePanel.module.css';

export interface SidePanelProps {
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
  score = 0,
  hiScore = 0,
  level = 1,
  speed = 1,
  selectMode = false,
  pauseMode = false,
  soundOn = false,
}: SidePanelProps): React.ReactElement {
  return (
    <div className={styles.panel}>
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
