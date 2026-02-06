import { TerminalColorRGB, TerminalColorOptions, PriorityConfig, DEFAULT_PRIORITIES } from '../types';

/**
 * 優先順位設定リストから色マップを構築
 */
export function buildPriorityColorMap(configs: PriorityConfig[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of configs) {
    map[p.id] = p.color;
  }
  return map;
}

/** デフォルトの優先順位色マップ（後方互換） */
export const PRIORITY_COLORS: Record<string, string> = buildPriorityColorMap(DEFAULT_PRIORITIES);

/**
 * hex色文字列をRGBに変換
 * @param hex - '#22c55e' 形式
 */
export function hexToRgb(hex: string): TerminalColorRGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * 2色をmixRatio (0-1) で混合
 * mixRatio=0.15 → 15%のaccentColor + 85%のbaseColor
 */
function mixColors(base: TerminalColorRGB, accent: TerminalColorRGB, mixRatio: number): TerminalColorRGB {
  return {
    r: Math.round(base.r * (1 - mixRatio) + accent.r * mixRatio),
    g: Math.round(base.g * (1 - mixRatio) + accent.g * mixRatio),
    b: Math.round(base.b * (1 - mixRatio) + accent.b * mixRatio),
  };
}

// ダーク基調の背景色
const DARK_BASE: TerminalColorRGB = { r: 26, g: 26, b: 46 }; // #1a1a2e

/**
 * タブの色からTerminal背景色を計算（15%ティント）
 * @param tabColorHex - タブの色 (例: '#22c55e')
 * @returns 背景色のRGB
 */
export function computeTerminalBgColor(tabColorHex: string): TerminalColorRGB {
  const accent = hexToRgb(tabColorHex);
  return mixColors(DARK_BASE, accent, 0.15);
}

/**
 * 任意の hex 色から Terminal 背景色を計算（mix 率指定可）
 * @param hex - 色 (例: '#ef4444')
 * @param mixRatio - 0-1 のティント率 (デフォルト 0.20)
 */
export function computeTerminalBgColorFromHex(hex: string, mixRatio = 0.20): TerminalColorRGB {
  const accent = hexToRgb(hex);
  return mixColors(DARK_BASE, accent, mixRatio);
}

/**
 * HSL→RGB 変換
 */
function hslToRgb(h: number, s: number, l: number): TerminalColorRGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * N 個のウィンドウに均等に色相を振り分けた背景色配列を生成
 * @param count - ウィンドウ数
 * @param mixRatio - ティント率 (デフォルト 0.25)
 */
export function generateGradientColors(count: number, mixRatio = 0.25): TerminalColorRGB[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const hue = (i * 360 / count) % 360;
    const accent = hslToRgb(hue, 0.7, 0.55);
    return mixColors(DARK_BASE, accent, mixRatio);
  });
}

/**
 * 背景色の相対輝度を計算 (WCAG 2.0)
 */
function relativeLuminance(c: TerminalColorRGB): number {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/**
 * 背景色に対してコントラストの良いテキスト色を返す
 */
export function computeContrastTextColor(bg: TerminalColorRGB): TerminalColorRGB {
  const lum = relativeLuminance(bg);
  // 暗い背景 → 明るいテキスト、明るい背景 → 暗いテキスト
  return lum > 0.18
    ? { r: 20, g: 20, b: 30 }    // ダークテキスト
    : { r: 230, g: 230, b: 235 }; // ライトテキスト
}

/**
 * bgColor に対して自動で textColor を付与した TerminalColorOptions を返す
 */
export function withAutoTextColor(bgColor: TerminalColorRGB): TerminalColorOptions {
  return { bgColor, textColor: computeContrastTextColor(bgColor) };
}

// =========================================================
// プリセット配色
// =========================================================

export interface TerminalPreset {
  id: string;
  name: string;
  /** プレビュー用のアクセント色 (hex) */
  previewColor: string;
  /** 背景色 */
  bg: TerminalColorRGB;
  /** テキスト色 */
  text: TerminalColorRGB;
}

export const TERMINAL_PRESETS: TerminalPreset[] = [
  {
    id: 'ocean',
    name: 'Ocean',
    previewColor: '#0ea5e9',
    bg: { r: 18, g: 32, b: 52 },
    text: { r: 200, g: 220, b: 240 },
  },
  {
    id: 'forest',
    name: 'Forest',
    previewColor: '#22c55e',
    bg: { r: 20, g: 38, b: 28 },
    text: { r: 190, g: 230, b: 200 },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    previewColor: '#f97316',
    bg: { r: 48, g: 26, b: 18 },
    text: { r: 240, g: 210, b: 180 },
  },
  {
    id: 'berry',
    name: 'Berry',
    previewColor: '#a855f7',
    bg: { r: 34, g: 20, b: 50 },
    text: { r: 220, g: 200, b: 240 },
  },
  {
    id: 'slate',
    name: 'Slate',
    previewColor: '#94a3b8',
    bg: { r: 30, g: 35, b: 42 },
    text: { r: 200, g: 210, b: 220 },
  },
  {
    id: 'rose',
    name: 'Rose',
    previewColor: '#f43f5e',
    bg: { r: 46, g: 20, b: 28 },
    text: { r: 240, g: 200, b: 210 },
  },
];
