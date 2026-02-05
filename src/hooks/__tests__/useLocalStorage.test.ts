import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('初期値を返す（localStorageが空のとき）', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('localStorageに保存された値を読み込む', () => {
    localStorage.setItem('test-key', JSON.stringify('saved-value'));
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[0]).toBe('saved-value');
  });

  it('値を更新できる', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    act(() => {
      result.current[1]('updated');
    });
    expect(result.current[0]).toBe('updated');
  });

  it('300msデバウンス後にlocalStorageに書き込む', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('updated');
    });

    // まだ書き込まれていない
    expect(localStorage.getItem('test-key')).toBeNull();

    // 300ms経過後
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(JSON.parse(localStorage.getItem('test-key')!)).toBe('updated');
  });

  it('オブジェクト型の初期値を扱える', () => {
    const initial = { name: 'test', count: 0 };
    const { result } = renderHook(() => useLocalStorage('test-obj', initial));
    expect(result.current[0]).toEqual(initial);
  });

  it('localStorageが壊れている場合は初期値にフォールバック', () => {
    localStorage.setItem('test-key', 'invalid-json{');
    const { result } = renderHook(() => useLocalStorage('test-key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
