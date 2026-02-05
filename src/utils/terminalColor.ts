import { TerminalColorRGB } from '../types';

/**
 * hex色文字列をRGBに変換
 * @param hex - '#22c55e' 形式
 */
function hexToRgb(hex: string): TerminalColorRGB {
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
