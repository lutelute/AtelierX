import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

function dispatchKeydown(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options });
  Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
  window.dispatchEvent(event);
}

describe('useKeyboardShortcuts', () => {
  const createParams = () => ({
    activeBoard: 'terminal',
    handleUndo: vi.fn(),
    setShowSettingsModal: vi.fn(),
    setShowGridModal: vi.fn(),
    isModalOpen: false,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Cmd+commaで設定モーダルを開く', () => {
    const params = createParams();
    renderHook(() => useKeyboardShortcuts(params));
    dispatchKeydown(',', { metaKey: true });
    expect(params.setShowSettingsModal).toHaveBeenCalledWith(true);
  });

  it('Cmd+Gでグリッドモーダルを開く', () => {
    const params = createParams();
    renderHook(() => useKeyboardShortcuts(params));
    dispatchKeydown('g', { metaKey: true });
    expect(params.setShowGridModal).toHaveBeenCalledWith(true);
  });

  it('Cmd+ZでUndoを実行', () => {
    const params = createParams();
    renderHook(() => useKeyboardShortcuts(params));
    dispatchKeydown('z', { metaKey: true });
    expect(params.handleUndo).toHaveBeenCalled();
  });

  it('モーダルが開いているときはショートカットをブロック', () => {
    const params = createParams();
    params.isModalOpen = true;
    renderHook(() => useKeyboardShortcuts(params));
    dispatchKeydown(',', { metaKey: true });
    expect(params.setShowSettingsModal).not.toHaveBeenCalled();
  });

  it('ideasボードではGridモーダルを開かない', () => {
    const params = createParams();
    params.activeBoard = 'ideas';
    renderHook(() => useKeyboardShortcuts(params));
    dispatchKeydown('g', { metaKey: true });
    expect(params.setShowGridModal).not.toHaveBeenCalled();
  });
});
