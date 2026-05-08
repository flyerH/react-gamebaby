import { describe, expect, it } from 'vitest';

import { BUTTON_LABELS, defaultButtonLabels, detectLocale } from '../index';

describe('detectLocale', () => {
  it('navigator.language 以 zh 开头 → zh-CN', () => {
    expect(detectLocale({ language: 'zh-CN' })).toBe('zh-CN');
    expect(detectLocale({ language: 'zh-TW' })).toBe('zh-CN');
    expect(detectLocale({ language: 'ZH' })).toBe('zh-CN');
  });

  it('其他语种 → en-US（默认 fallback）', () => {
    expect(detectLocale({ language: 'en-US' })).toBe('en-US');
    expect(detectLocale({ language: 'fr' })).toBe('en-US');
    expect(detectLocale({ language: '' })).toBe('en-US');
  });

  it('navigator 缺失时 → en-US', () => {
    expect(detectLocale(undefined)).toBe('en-US');
  });
});

describe('BUTTON_LABELS', () => {
  it('每个 locale 都包含完整 8 个按键标签（D-pad + Rotate + Start/Sound/Reset 小按钮）', () => {
    for (const locale of Object.keys(BUTTON_LABELS) as (keyof typeof BUTTON_LABELS)[]) {
      const l = BUTTON_LABELS[locale];
      expect(l.up).toBeTruthy();
      expect(l.down).toBeTruthy();
      expect(l.left).toBeTruthy();
      expect(l.right).toBeTruthy();
      expect(l.rotate).toBeTruthy();
      expect(l.start).toBeTruthy();
      expect(l.sound).toBeTruthy();
      expect(l.reset).toBeTruthy();
    }
  });
});

describe('defaultButtonLabels', () => {
  it('返回对象结构匹配 ButtonLabels', () => {
    const l = defaultButtonLabels();
    expect(l).toHaveProperty('up');
    expect(l).toHaveProperty('rotate');
  });
});
