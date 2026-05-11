import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';

import type { Button, ButtonAction } from '@/engine/types';
import { BUTTON_LABELS, type ButtonLabels } from '@/ui/locale';

import styles from './Buttons.module.css';

/**
 * 屏幕按钮长按节奏 —— 与 bindKeyboardInput 同套（参见对应注释）。
 * 起始延迟 250ms 区分点按 / 长按，到期后每 100ms 发一次 'repeat'
 */
const REPEAT_DELAY_MS = 250;
const REPEAT_INTERVAL_MS = 100;

/**
 * 参与 long-press repeat 的按键集合 —— 平台层对"游戏键"的判断（方向键 / A / B）。
 * 与 bindKeyboardInput 内的 REPEAT_KEYS 保持一致；游戏在 onButton 内通过
 * ButtonAction='repeat' 决定要不要响应
 */
const REPEAT_KEYS: ReadonlySet<Button> = new Set(['Up', 'Down', 'Left', 'Right', 'A', 'B']);

export interface ButtonsProps {
  /**
   * 按键交互回调，press / repeat / release 三类。
   *
   * 实现上用 PointerEvent + setPointerCapture 保证按下后拖出按钮、
   * 触屏滑出边界等场景都能可靠收到 release。游戏键长按时会在 press 后
   * 起每 100ms 发一次 'repeat'，与键盘节奏一致
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
 * 顶部一行小按钮 START / PAUSE / SOUND / RESET 复刻真机的辅助键位。
 *
 * 按键到 InputBus 的映射：
 * - 顶部 START 小按钮 → 'Start'（兼任开/关键 = 真机的 ON/OFF）
 * - 顶部 PAUSE       → 'Pause'
 * - 顶部 SOUND       → 'Sound'
 * - 顶部 RESET       → 'Reset'
 * - D-pad 4 个方向键 → 'Up' / 'Down' / 'Left' / 'Right'
 * - Rotate 大椭圆     → 'A'（游戏内动作键：俄罗斯方块旋转 / 菜单确认 / Snake 启动）
 */
export function Buttons({
  onInput,
  labels = BUTTON_LABELS['en-US'],
}: ButtonsProps): React.ReactElement {
  // 每个正在长按的方向键对应一个 setTimeout（递归 self-reschedule 模式）；
  // pointer release / cancel 时按 btn 清掉。用 ref 持有保证跨渲染稳定，
  // 不参与 React 重渲染依赖
  const repeatTimersRef = useRef<Map<Button, ReturnType<typeof setTimeout>>>(new Map());

  // 组件 unmount 时清掉所有未到期的 timer —— 防御性，正常 release/cancel
  // 会自己清，但极端情况（用户切走 tab）能兜底
  useEffect(() => {
    const timers = repeatTimersRef.current;
    return () => {
      for (const id of timers.values()) clearTimeout(id);
      timers.clear();
    };
  }, []);

  const clearRepeat = useCallback((btn: Button) => {
    const id = repeatTimersRef.current.get(btn);
    if (id !== undefined) {
      clearTimeout(id);
      repeatTimersRef.current.delete(btn);
    }
  }, []);

  const makeHandlers = useCallback(
    (btn: Button) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onInput?.(btn, 'press');
        if (REPEAT_KEYS.has(btn) && !repeatTimersRef.current.has(btn) && onInput) {
          // 递归 setTimeout：到期 emit 'repeat' 后 reschedule 下一次（每 100ms），
          // 首次延迟 250ms。inline 在闭包里避免 useCallback self-reference
          // 触发 react-hooks/immutability
          const timers = repeatTimersRef.current;
          const emit = onInput;
          const schedule = (delay: number): void => {
            const id = setTimeout(() => {
              emit(btn, 'repeat');
              schedule(REPEAT_INTERVAL_MS);
            }, delay);
            timers.set(btn, id);
          };
          schedule(REPEAT_DELAY_MS);
        }
      },
      onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        clearRepeat(btn);
        onInput?.(btn, 'release');
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>): void => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        clearRepeat(btn);
        onInput?.(btn, 'release');
      },
    }),
    [onInput, clearRepeat]
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
            aria-label="Pause"
            className={styles.smallButton}
            {...makeHandlers('Pause')}
          />
          <span className={styles.smallTip}>{labels.pause}</span>
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
