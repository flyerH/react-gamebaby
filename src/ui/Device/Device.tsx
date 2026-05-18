import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

import styles from './Device.module.css';

/** 缩放基准宽：缩 Rotate 后按钮组实际占 240+20+187 = 447px，整机 layout 580
 *  减去按钮组 = 133px 是机身两侧蓝色塑料边框（每侧 ~66.5）。SAFE=510 让窄屏
 *  上保留约 35px 蓝边可见（不会被 wrapper 完全裁掉），按钮组离 wrapper 边
 *  视觉约 22px，避免贴边。比按钮组实际宽度 447 大 ~14% 是有意留的"安全余量" */
const DEVICE_SAFE_WIDTH = 510;

/** 整机内容最低高度（屏幕 ~540 + 按钮 ~360 + 间距）。容器低于这个值时
 *  scale 会进一步按高度缩，避免按钮被挤出视口 */
const DEVICE_MIN_HEIGHT = 950;

function computeScale(width: number, height: number): number {
  if (width <= 0) return 1;
  // 主路：按"内容安全宽"算 scale，机身蓝边可被裁。这样在 360 宽手机上整机
  // 视觉宽 580×0.75 = 435 溢出 37.5px each side（恰好等于机身蓝边宽度），
  // 按钮组 480×0.75 = 360 完整可见。.app 的 max(950, 100%/scale) 反向补偿
  // layout 高，让整机视觉贴满容器纵向
  const widthScale = Math.min(1, width / DEVICE_SAFE_WIDTH);
  // 兜底：当容器极矮（h < 950 × widthScale）时，按高度收紧避免内容溢出
  if (height > 0 && height < DEVICE_MIN_HEIGHT * widthScale) {
    return height / DEVICE_MIN_HEIGHT;
  }
  return widthScale;
}

function initialScale(): number {
  if (typeof window === 'undefined') return 1;
  return computeScale(window.innerWidth, window.innerHeight);
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
 * 视觉参考 Brick Game 真机：蓝色塑料机身 + 圆角顶部 + 白色屏幕粗边框 +
 * 3D 凹陷蓝色内框 + LCD 黄绿屏底 + 红色实体按键。
 *
 * 本组件只负责外观与布局，屏幕 / 侧栏 / 按键区等内容由调用方以 slot 形式注入，
 * 这样外壳与内部实现（Canvas renderer、分数、按键映射）完全解耦。
 *
 * 适配策略（"内容安全宽"驱动的连续响应式）：
 * - --device-scale 按 SAFE_WIDTH=480（按钮组实际宽度）而非整机 580 算，
 *   机身蓝边可在窄屏上被 wrapper 裁切，让按钮 / 屏幕在小屏上视觉更大
 * - .app layout 高度反向补偿 scale，让整机视觉贴满 100dvh
 * - 内部 .content flex column 居中：屏幕 + 按钮作为整体居中，多余纵向
 *   空间均分到上下；窄屏上余量更小，整机更紧凑
 *
 * scale 用 useState lazy initializer 在首帧就算好，避免先以默认 scale=1
 * 渲染一次再 effect 里修正带来的"大 → 小"闪烁。
 */
export function Device({
  title = 'GameBaby',
  screen,
  side,
  buttons,
}: DeviceProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(initialScale);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // 用 ResizeObserver 监听 wrapper 的 *实际可用尺寸*：移动端 safe-area
    // padding 已在父级扣掉，window.innerHeight 包含状态栏/手势条，按容器
    // 算缩放比窗口算更准。降级路径用 innerWidth/innerHeight，不保证安全区精度
    const updateFromEl = (): void => {
      setScale(computeScale(el.clientWidth, el.clientHeight));
    };
    updateFromEl();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateFromEl);
      ro.observe(el);
      return () => {
        ro.disconnect();
      };
    }
    const onResize = (): void => {
      setScale(computeScale(window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // CSSProperties 类型里不识别自定义属性，这里走一次类型断言
  const wrapperStyle = { '--device-scale': scale } as CSSProperties;

  return (
    <div ref={wrapperRef} className={styles.wrapper} style={wrapperStyle}>
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
