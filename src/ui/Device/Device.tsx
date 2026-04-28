import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

import styles from './Device.module.css';

/** 整机内部坐标系固定尺寸（与 legacy 一致），小于此尺寸的窗口会被等比缩放 */
const DEVICE_WIDTH = 650;
const DEVICE_HEIGHT = 950;

function computeScale(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(1, window.innerWidth / DEVICE_WIDTH, window.innerHeight / DEVICE_HEIGHT);
}

export interface DeviceProps {
  /** 机身上部印刷的品牌标题 */
  title?: string;
  /** 主点阵屏；通常传入一个 <ContentScreen> */
  screen: ReactNode;
  /** 屏幕右侧的信息区；通常传入一个 <SidePanel> */
  side?: ReactNode;
  /** 机身下部实体按键区；通常传入一个 <Buttons> */
  buttons?: ReactNode;
}

/**
 * Device —— 模拟 Brick Game 9999-in-1 的最外层掌机外壳
 *
 * 视觉参考 legacy：蓝色塑料机身 + 圆角顶部 + 白色屏幕粗边框 +
 * 3D 凹陷蓝色内框 + LCD 黄绿屏底 + 红色实体按键。
 *
 * 本组件只负责外观与布局，屏幕 / 侧栏 / 按键区等内容由调用方以 slot 形式注入，
 * 这样外壳与内部实现（Canvas renderer、分数、按键映射）完全解耦。
 *
 * 窗口比例适配：小于 650×950 的视窗会通过 CSS 变量 --device-scale
 * 等比缩放整机。scale 用 useState lazy initializer 在首帧就算好，
 * 避免先以默认 scale=1 渲染一次再 effect 里修正带来的"大 → 小"闪烁。
 */
export function Device({
  title = 'GameBaby',
  screen,
  side,
  buttons,
}: DeviceProps): React.ReactElement {
  const [scale, setScale] = useState<number>(computeScale);

  useEffect(() => {
    const onResize = (): void => {
      setScale(computeScale());
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // CSSProperties 类型里不识别自定义属性，这里走一次类型断言
  const wrapperStyle = { '--device-scale': scale } as CSSProperties;

  return (
    <div className={styles.wrapper} style={wrapperStyle}>
      <div className={styles.app}>
        <div className={styles.content}>
          <div className={styles.contentTop}>
            <p className={styles.title}>{title}</p>
            <div className={styles.screenFrame}>
              <div className={styles.screenInner3d}>
                <div className={styles.screen}>
                  <div className={styles.screenLeft}>{screen}</div>
                  <div className={styles.screenRight}>{side}</div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.contentBottom}>{buttons}</div>
        </div>
      </div>
    </div>
  );
}
