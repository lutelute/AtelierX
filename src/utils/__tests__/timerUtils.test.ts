import { describe, it, expect } from 'vitest';
import { formatDuration, formatDateTime, parseTimerStartTime } from '../timerUtils';

describe('formatDuration', () => {
  it('分のみを返す（1時間未満）', () => {
    expect(formatDuration(0)).toBe('0分');
    expect(formatDuration(60000)).toBe('1分');
    expect(formatDuration(30 * 60000)).toBe('30分');
    expect(formatDuration(59 * 60000)).toBe('59分');
  });

  it('時間+分を返す（1時間以上）', () => {
    expect(formatDuration(60 * 60000)).toBe('1時間0分');
    expect(formatDuration(90 * 60000)).toBe('1時間30分');
    expect(formatDuration(150 * 60000)).toBe('2時間30分');
  });

  it('端数の秒は切り捨て', () => {
    expect(formatDuration(59999)).toBe('0分');
    expect(formatDuration(60001)).toBe('1分');
  });
});

describe('formatDateTime', () => {
  it('YYYY-MM-DD HH:MM 形式で返す', () => {
    // 2026-01-15 09:05 (ローカルタイム)
    const date = new Date(2026, 0, 15, 9, 5, 0);
    const result = formatDateTime(date.getTime());
    expect(result).toBe('2026-01-15 09:05');
  });

  it('月と日をゼロ埋め', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    const result = formatDateTime(date.getTime());
    expect(result).toBe('2026-01-01 00:00');
  });
});

describe('parseTimerStartTime', () => {
  it('正しいタイマー行をパースする', () => {
    const result = parseTimerStartTime('  ⏱ 2026-01-26 12:34開始');
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(26);
    expect(date.getHours()).toBe(12);
    expect(date.getMinutes()).toBe(34);
  });

  it('マッチしない行はnullを返す', () => {
    expect(parseTimerStartTime('普通のテキスト')).toBeNull();
    expect(parseTimerStartTime('')).toBeNull();
    expect(parseTimerStartTime('⏱ invalid format')).toBeNull();
  });
});
