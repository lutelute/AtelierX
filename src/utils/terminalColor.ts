import { TerminalColorRGB, PriorityConfig, DEFAULT_PRIORITIES } from '../types';

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
