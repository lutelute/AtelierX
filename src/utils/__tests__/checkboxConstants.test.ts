import { describe, it, expect } from 'vitest';
import { CHECKBOX_EXTRACT, CHECKBOX_PATTERN, CHECKBOX_DISPLAY, CHECKBOX_GROUPS, CARD_STATUS_MARKERS, VALID_MARKERS } from '../checkboxConstants';

describe('CHECKBOX_EXTRACT', () => {
  it('基本的なチェックボックス行にマッチする', () => {
    const match = '- [ ] 未完了タスク'.match(CHECKBOX_EXTRACT);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(' ');
    expect(match![2]).toBe('未完了タスク');
  });

  it('完了マーカーにマッチする', () => {
    const match = '- [x] 完了タスク'.match(CHECKBOX_EXTRACT);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('x');
    expect(match![2]).toBe('完了タスク');
  });

  it('進行中マーカーにマッチする', () => {
    const match = '- [/] 進行中'.match(CHECKBOX_EXTRACT);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('/');
  });

  it('全VALID_MARKERSがマッチする', () => {
    for (const marker of VALID_MARKERS) {
      const line = `- [${marker}] テスト`;
      const match = line.match(CHECKBOX_EXTRACT);
      expect(match, `marker '${marker}' should match`).not.toBeNull();
    }
  });

  it('無効なフォーマットにはマッチしない', () => {
    expect('普通のテキスト'.match(CHECKBOX_EXTRACT)).toBeNull();
    expect('- 箇条書き'.match(CHECKBOX_EXTRACT)).toBeNull();
    expect('[x] ブラケットのみ'.match(CHECKBOX_EXTRACT)).toBeNull();
  });
});

describe('CHECKBOX_PATTERN', () => {
  it('チェックボックスの先頭部分にマッチする', () => {
    expect('- [ ] テスト'.match(CHECKBOX_PATTERN)).not.toBeNull();
    expect('- [x] テスト'.match(CHECKBOX_PATTERN)).not.toBeNull();
    expect('- [!] テスト'.match(CHECKBOX_PATTERN)).not.toBeNull();
  });
});

describe('CHECKBOX_DISPLAY', () => {
  it('全VALID_MARKERSにエントリがある', () => {
    for (const marker of VALID_MARKERS) {
      expect(CHECKBOX_DISPLAY[marker], `missing display for '${marker}'`).toBeDefined();
    }
  });

  it('各エントリにicon, className, labelがある', () => {
    for (const marker of VALID_MARKERS) {
      const entry = CHECKBOX_DISPLAY[marker];
      expect(entry).toHaveProperty('icon');
      expect(entry).toHaveProperty('className');
      expect(entry).toHaveProperty('label');
    }
  });
});

describe('CHECKBOX_GROUPS', () => {
  it('6グループ存在する', () => {
    expect(CHECKBOX_GROUPS).toHaveLength(6);
  });

  it('各グループにname, itemsがある', () => {
    for (const group of CHECKBOX_GROUPS) {
      expect(group.name).toBeTruthy();
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('全アイテムがCHECKBOX_DISPLAYに定義されている', () => {
    for (const group of CHECKBOX_GROUPS) {
      for (const item of group.items) {
        expect(CHECKBOX_DISPLAY[item], `'${item}' in group '${group.name}' should have a display entry`).toBeDefined();
      }
    }
  });
});

describe('CARD_STATUS_MARKERS', () => {
  it('9つのマーカーがある', () => {
    expect(CARD_STATUS_MARKERS).toHaveLength(9);
  });

  it('全てVALID_MARKERSに含まれる', () => {
    for (const marker of CARD_STATUS_MARKERS) {
      expect(VALID_MARKERS.includes(marker), `'${marker}' should be in VALID_MARKERS`).toBe(true);
    }
  });
});
