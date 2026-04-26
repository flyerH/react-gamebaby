import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('未找到 #root 挂载点');
}

createRoot(rootElement).render(
  <StrictMode>
    <div
      style={{
        fontFamily: "'Courier New', Menlo, monospace",
        background: '#1a1a1a',
        color: '#e6e6e6',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0, letterSpacing: 4 }}>GameBaby</h1>
      <p style={{ margin: 0 }}>Brick Game 9999-in-1 · 重构中</p>
      <p style={{ margin: 0, opacity: 0.5, fontSize: 12 }}>v0.0.1 · feat/refactor</p>
    </div>
  </StrictMode>
);
