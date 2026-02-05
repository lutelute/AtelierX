import { describe, it, expect } from 'vitest';
import { getTagColor, getTagLabel, shortenAppName, BUILTIN_APPS } from '../index';
import type { AppTabConfig } from '../index';

describe('getTagColor', () => {
  it('ビルトインタグの色を返す', () => {
    expect(getTagColor('terminal')).toBe('#22c55e');
    expect(getTagColor('finder')).toBe('#3b82f6');
  });

  it('enabledTabsからカスタムタグの色を返す', () => {
    const enabledTabs: AppTabConfig[] = [
      ...BUILTIN_APPS,
      { id: 'custom-app', appName: 'Custom', displayName: 'Custom', icon: '🔧', color: '#ff0000', type: 'custom' },
    ];
    expect(getTagColor('custom-app', enabledTabs)).toBe('#ff0000');
  });

  it('不明なタグにはフォールバック色を返す', () => {
    expect(getTagColor('unknown-tag')).toBe('#6b7280');
  });
});

describe('getTagLabel', () => {
  it('ビルトインタグのラベルを返す', () => {
    expect(getTagLabel('terminal')).toBe('Terminal');
    expect(getTagLabel('finder')).toBe('Finder');
  });

  it('enabledTabsからカスタムラベルを返す', () => {
    const enabledTabs: AppTabConfig[] = [
      ...BUILTIN_APPS,
      { id: 'custom-app', appName: 'Custom', displayName: 'マイアプリ', icon: '🔧', color: '#ff0000', type: 'custom' },
    ];
    expect(getTagLabel('custom-app', enabledTabs)).toBe('マイアプリ');
  });

  it('不明なタグにはIDをそのまま返す', () => {
    expect(getTagLabel('unknown-tag')).toBe('unknown-tag');
  });
});

describe('shortenAppName', () => {
  it('既知のアプリ名を短縮する', () => {
    expect(shortenAppName('Microsoft Word')).toBe('Word');
    expect(shortenAppName('Google Chrome')).toBe('Chrome');
    expect(shortenAppName('Visual Studio Code')).toBe('VS Code');
  });

  it('Apple接頭辞を削除する', () => {
    expect(shortenAppName('Apple Music')).toBe('Music');
    expect(shortenAppName('Apple Notes')).toBe('Notes');
  });

  it('未知のアプリ名はそのまま返す', () => {
    expect(shortenAppName('Terminal')).toBe('Terminal');
    expect(shortenAppName('Finder')).toBe('Finder');
    expect(shortenAppName('MyCustomApp')).toBe('MyCustomApp');
  });
});
