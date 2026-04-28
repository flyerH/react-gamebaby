import { type PointerEvent as ReactPointerEvent, useCallback } from 'react';

import type { Button, ButtonAction } from '@/engine/types';

import styles from './Buttons.module.css';

export interface ButtonsProps {
  /**
   * 按键交互回调，press / release 成对触发。
   *
   * 实现上用 PointerEvent + setPointerCapture 保证按下后拖出按钮、
   * 触屏滑出边界等场景都能可靠收到 release——这样 L3 InputBus 的
   * "重复 press 去重 + release 必须配对" 语义才不会被 UI 破坏。
   */
  onInput?: (btn: Button, action: ButtonAction) => void;
}

/**
 * Buttons —— 掌机实体按键区
 *
 * DOM 结构模拟真机按键：每个方向按钮是外层 <button> + 两个子节点
 * （buttonTip 文字标签 + buttonDir 箭头），三者的相对位置由 CSS 绝对定位
 * 落到按钮外围，从而在 4 个按钮的中心围出一个十字形箭头簇。
 *
 * Rotate 按下时 emit 'Start'——与 Enter 键位一致，在菜单里是确认、
 * 在俄罗斯方块里是旋转。
 */
export function Buttons({ onInput }: ButtonsProps): React.ReactElement {
  const makeHandlers = useCallback(
    (btn: Button) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onInput?.(btn, 'press');
      },
      onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onInput?.(btn, 'release');
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onInput?.(btn, 'release');
      },
    }),
    [onInput]
  );

  return (
    <div className={styles.contentBottom}>
      <button
        type="button"
        aria-label="Up"
        className={`${styles.button} ${styles.topButton}`}
        {...makeHandlers('Up')}
      >
        <p className={styles.buttonTip}>Top</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Right"
        className={`${styles.button} ${styles.rightButton}`}
        {...makeHandlers('Right')}
      >
        <p className={styles.buttonTip}>Right</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Down"
        className={`${styles.button} ${styles.bottomButton}`}
        {...makeHandlers('Down')}
      >
        <p className={styles.buttonTip}>Bottom</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Left"
        className={`${styles.button} ${styles.leftButton}`}
        {...makeHandlers('Left')}
      >
        <p className={styles.buttonTip}>Left</p>
        <span className={styles.buttonDir} />
      </button>

      <button
        type="button"
        aria-label="Rotate"
        className={styles.rotateButton}
        {...makeHandlers('Start')}
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
