import type { CSSProperties, ReactNode } from 'react';

export interface DeviceProps {
  /** 屏幕区 / 侧栏 / 按钮区等 —— 由使用方在外部组合 */
  children: ReactNode;
  /** 机身上部印刷的主标题 */
  title?: string;
  /** 机身上部印刷的副标题（型号字样） */
  subtitle?: string;
}

/**
 * Device —— 最外层掌机外壳
 *
 * 只负责"外观与布局"：塑料机身、logo 区、屏幕凹槽。
 * 真实显示由 children（通常是 ContentScreen）承担。
 *
 * 样式当前内联，D3 阶段会抽成 CSS Module 并加主题切换。
 */
export function Device({
  children,
  title = 'GAMEBABY',
  subtitle = 'BRICK · 9999 IN 1',
}: DeviceProps): React.ReactElement {
  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <div style={brandStyle}>{title}</div>
        <div style={modelStyle}>{subtitle}</div>
      </header>
      <div style={screenWellStyle}>{children}</div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  width: 'fit-content',
  padding: '28px 32px 40px',
  borderRadius: 28,
  background: 'linear-gradient(135deg, #d8d7cf 0%, #a8a69e 100%)',
  boxShadow:
    'inset 0 2px 4px rgba(255,255,255,0.6),' +
    ' inset 0 -2px 6px rgba(0,0,0,0.2),' +
    ' 0 16px 32px rgba(0,0,0,0.35)',
  fontFamily: "'Courier New', Menlo, monospace",
  color: '#1c1c1c',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 18,
  gap: 24,
};

const brandStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 4,
};

const modelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  opacity: 0.55,
};

const screenWellStyle: CSSProperties = {
  padding: 14,
  background: '#2b2b2b',
  borderRadius: 12,
  boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.7)',
  display: 'inline-block',
};
