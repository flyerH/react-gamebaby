import { type PointerEvent as ReactPointerEvent, useCallback } from 'react';

import type { Button, ButtonAction } from '@/engine/types';
import { BUTTON_LABELS, type ButtonLabels } from '@/ui/locale';

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
  /** 按键外围的文字标签；不传用英文 */
  labels?: ButtonLabels;
}

/**
 * Buttons —— 掌机实体按键区
 *
 * DOM 结构模拟真机按键：D-pad 四个方向按钮各自是外层 <button> + 两个子节点
 * （buttonTip 文字标签 + buttonDir 箭头），三者的相对位置由 CSS 绝对定位
 * 落到按钮外围，从而在 4 个按钮的中心围出一个十字形箭头簇。
 *
 * 顶部一行小按钮 START / SOUND / RESET 复刻真机的辅助键位（真机另有
 * ON/OFF 我们略掉 —— 网页关不掉 tab）。
 *
 * 按键到 InputBus 的映射：
 * - 顶部 START 小按钮 → 'Start'（兼任开/关键 = 真机的 ON/OFF）
 * - 顶部 SOUND       → 'Sound'
 * - 顶部 RESET       → 'Reset'
 * - D-pad 4 个方向键 → 'Up' / 'Down' / 'Left' / 'Right'
 * - Rotate 大椭圆     → 'A'（游戏内动作键：俄罗斯方块旋转 / 菜单确认 / Snake 启动）
 */
export function Buttons({
  onInput,
  labels = BUTTON_LABELS['en-US'],
}: ButtonsProps): React.ReactElement {
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
      {/* 顶部一行辅助键：开/关 · 声音 · 重置；每个按钮 + 标签包成 group，
       * 三个 group 横排在 topControls 内，让 div 自然把文字也包进去 */}
      <div className={styles.topControls}>
        <div className={styles.smallButtonGroup}>
          <button
            type="button"
            aria-label="Start"
            className={styles.smallButton}
            {...makeHandlers('Start')}
          />
          <span className={styles.smallTip}>{labels.start}</span>
        </div>
        <div className={styles.smallButtonGroup}>
          <button
            type="button"
            aria-label="Sound"
            className={styles.smallButton}
            {...makeHandlers('Sound')}
          />
          <span className={styles.smallTip}>{labels.sound}</span>
        </div>
        <div className={styles.smallButtonGroup}>
          <button
            type="button"
            aria-label="Reset"
            className={styles.smallButton}
            {...makeHandlers('Reset')}
          />
          <span className={styles.smallTip}>{labels.reset}</span>
        </div>
      </div>

      {/* 控制行：D-pad 块 + Rotate 块横排，整体水平居中 */}
      <div className={styles.controlRow}>
        <div className={styles.dpadGroup}>
          <button
            type="button"
            aria-label="Up"
            className={`${styles.button} ${styles.topButton}`}
            {...makeHandlers('Up')}
          >
            <p className={styles.buttonTip}>{labels.up}</p>
            <span className={styles.buttonDir} />
          </button>

          <button
            type="button"
            aria-label="Right"
            className={`${styles.button} ${styles.rightButton}`}
            {...makeHandlers('Right')}
          >
            <p className={styles.buttonTip}>{labels.right}</p>
            <span className={styles.buttonDir} />
          </button>

          <button
            type="button"
            aria-label="Down"
            className={`${styles.button} ${styles.bottomButton}`}
            {...makeHandlers('Down')}
          >
            <p className={styles.buttonTip}>{labels.down}</p>
            <span className={styles.buttonDir} />
          </button>

          <button
            type="button"
            aria-label="Left"
            className={`${styles.button} ${styles.leftButton}`}
            {...makeHandlers('Left')}
          >
            <p className={styles.buttonTip}>{labels.left}</p>
            <span className={styles.buttonDir} />
          </button>
        </div>

        <div className={styles.rotateGroup}>
          <button
            type="button"
            aria-label="Rotate"
            className={styles.rotateButton}
            {...makeHandlers('A')}
          >
            <p className={styles.rotateTip}>{labels.rotate}</p>
            <span className={styles.rotateArrowLeft}>
              <span className={styles.rotateArrowBody} />
            </span>
            <span className={styles.rotateArrowRight}>
              <span className={styles.rotateArrowBody} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
