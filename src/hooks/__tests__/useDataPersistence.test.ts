import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDataPersistence } from '../useDataPersistence';
import { initialAllBoardsData } from '../../utils/boardUtils';

function createTestParams() {
  const allData = { ...initialAllBoardsData };
  const activityLogs = [{ id: 'log1', type: 'create' as const, cardTitle: 'Test', cardTag: 'terminal', timestamp: Date.now() }];
  const settings = {
    obsidianVaultPath: '',
    dailyNotePath: 'Daily Notes/{{date}}.md',
    insertMarker: '## AtelierX',
    cardClickBehavior: 'edit' as const,
    customSubtags: [],
    theme: 'dark' as const,
  };

  return {
    allData,
    setAllData: vi.fn(),
    activityLogs,
    setActivityLogs: vi.fn(),
    settings,
    setSettings: vi.fn(),
    allDataRef: { current: allData },
    activityLogsRef: { current: activityLogs },
    settingsRef: { current: settings },
    setLastBackupTime: vi.fn(),
  };
}

describe('useDataPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('フックが正常に初期化される', () => {
    const params = createTestParams();
    const { result } = renderHook(() => useDataPersistence(params));

    expect(result.current.handleUndo).toBeTypeOf('function');
    expect(result.current.handleExportBackup).toBeTypeOf('function');
    expect(result.current.handleImportBackup).toBeTypeOf('function');
    expect(result.current.showRestorePrompt).toBeTypeOf('boolean');
  });

  it('handleUndoはスタックが空のとき何もしない', () => {
    const params = createTestParams();
    const { result } = renderHook(() => useDataPersistence(params));

    // 初期状態ではUndoスタックは空
    result.current.handleUndo();
    expect(params.setAllData).not.toHaveBeenCalled();
  });
});
