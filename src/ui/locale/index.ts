/**
 * UI 层 i18n —— 仅覆盖实体按键等"机身印刷文字"的标签
 *
 * 设计范围：
 * - Brick Game 真机机身印刷的是英文；LCD 屏幕内一律英文大写（像素字风格），
 *   所以 SidePanel 的 SCORE / HI-SCORE 等**不走 i18n**，刻意保持英文。
 * - 只有机身按键外围的文字标签（上 / 下 / 左 / 右 / 旋转）会随语言切换，
 *   这和旧版 `src/legacy/locale` 的职责范围一致。
 *
 * 新增语种时只需在 BUTTON_LABELS 里补一条，detectLocale 按前缀匹配落回 en-US。
 */

export type Locale = 'zh-CN' | 'en-US';

export interface ButtonLabels {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
  readonly rotate: string;
  readonly start: string;
  readonly pause: string;
  readonly sound: string;
  readonly reset: string;
}

export const BUTTON_LABELS: Readonly<Record<Locale, ButtonLabels>> = {
  'zh-CN': {
    up: '上',
    down: '下',
    left: '左',
    right: '右',
    rotate: '旋转',
    start: '开/关',
    pause: '暂停',
    sound: '声音',
    reset: '重置',
  },
  'en-US': {
    up: 'Top',
    down: 'Bottom',
    left: 'Left',
    right: 'Right',
    rotate: 'Rotate',
    start: 'On/Off',
    pause: 'Pause',
    sound: 'Sound',
    reset: 'Reset',
  },
};

/**
 * 按 navigator.language 主标签选语言
 *
 * - zh* → zh-CN（大陆 / 台湾 / 香港统一到简体，先不细分）
 * - 其他 → en-US（作为默认 fallback）
 * - 非浏览器环境（SSR / 测试）→ en-US
 */
export function detectLocale(
  nav: Pick<Navigator, 'language'> | undefined = globalThis.navigator
): Locale {
  const lang = nav?.language ?? '';
  return lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

/** 按当前 navigator 的首选语言返回按键标签，App 层默认装配用 */
export function defaultButtonLabels(): ButtonLabels {
  return BUTTON_LABELS[detectLocale()];
}
