import type { Button } from '@/engine/types';

import styles from './Buttons.module.css';

export interface ButtonsProps {
  /** 按钮按下时回调；不传则无操作 */
  onPress?: (btn: Button) => void;
}

/**
 * Buttons —— 掌机实体按键区
 *
 * DOM 结构 1:1 复刻 legacy：每个方向按钮是外层 <button> + 两个子节点
 * （buttonTip 文字标签 + buttonDir 箭头），三者的相对位置由 CSS 绝对定位
 * 落到按钮外围，从而在 4 个按钮的中心围出一个十字形箭头簇。
 *
 * Rotate 按下时 emit 'Start'——与 Enter 键位一致，在菜单里是确认、
 * 在俄罗斯方块里是旋转。
 */
export function Buttons({ onPress }: ButtonsProps): React.ReactElement {
  const press =
    (btn: Button): (() => void) =>
    () =>
      onPress?.(btn);

  return (
    <div className={styles.contentBottom}>
      <button
        type="button"
        aria-label="Up"
        className={`${styles.button} ${styles.topButton}`}
        onClick={press('Up')}
      >
        <p className={styles.buttonTip}>Top</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Right"
        className={`${styles.button} ${styles.rightButton}`}
        onClick={press('Right')}
      >
        <p className={styles.buttonTip}>Right</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Down"
        className={`${styles.button} ${styles.bottomButton}`}
        onClick={press('Down')}
      >
        <p className={styles.buttonTip}>Bottom</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Left"
        className={`${styles.button} ${styles.leftButton}`}
        onClick={press('Left')}
      >
        <p className={styles.buttonTip}>Left</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Rotate"
        className={styles.rotateButton}
        onClick={press('Start')}
      >
        <p className={styles.rotateTip}>Rotate</p>
        <span className={styles.rotateArrowLeft}>
          <span className={styles.rotateArrowBody} />
        </span>
        <span className={styles.rotateArrowRight}>
          <span className={styles.rotateArrowBody} />
        </span>
      </button>
    </div>
  );
}
