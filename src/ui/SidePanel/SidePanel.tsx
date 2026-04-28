import styles from './SidePanel.module.css';

export interface SidePanelProps {
  score?: number;
  hiScore?: number;
  level?: number;
  speed?: number;
}

/**
 * SidePanel —— LCD 屏右侧的静态信息区
 *
 * 占位版：只显示 SCORE / HI-SCORE / LEVEL / SPEED 四行 + 静态指示灯。
 * 后续接入 SDK 后会改为订阅 Counter（score / level / speed）自动刷新。
 */
export function SidePanel({
  score = 0,
  hiScore = 0,
  level = 1,
  speed = 1,
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
        <p className={styles.indicatorOff}>PAUSE</p>
        <p className={styles.indicatorOff}>SOUND</p>
      </div>
    </div>
  );
}
