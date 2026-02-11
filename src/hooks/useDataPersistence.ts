import { useState, useCallback, useRef, useEffect } from 'react';
import { AllBoardsData, BoardData, ActivityLog, Settings, SettingsPreset, CardBackup } from '../types';
import { isAllBoardsData, migrateBoardDataToAllBoards, migrateColumnColors, migrateCardWindows } from '../utils/boardUtils';
import { defaultSettings } from '../components/SettingsModal';

const BACKUP_INTERVAL = 60000; // 1分ごとに自動バックアップ
const MAX_UNDO = 30;

interface UseDataPersistenceParams {
  allData: AllBoardsData;
  setAllData: React.Dispatch<React.SetStateAction<AllBoardsData>>;
  activityLogs: ActivityLog[];
  setActivityLogs: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  allDataRef: React.MutableRefObject<AllBoardsData>;
  activityLogsRef: React.MutableRefObject<ActivityLog[]>;
  settingsRef: React.MutableRefObject<Settings>;
  setLastBackupTime: React.Dispatch<React.SetStateAction<number>>;
}

export function useDataPersistence({
  allData,
  setAllData,
  activityLogs,
  setActivityLogs,
  settings,
  setSettings,
  allDataRef,
  activityLogsRef,
  settingsRef,
  setLastBackupTime,
}: UseDataPersistenceParams) {
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<{ boardData: AllBoardsData; activityLogs: ActivityLog[]; settings: Settings } | null>(null);
  const hasCheckedBackup = useRef(false);

  // Undo スタック
  const undoStackRef = useRef<AllBoardsData[]>([]);
  const prevDataRef = useRef<AllBoardsData | null>(null);

  // allData が変更されたらスナップショットを自動保存
  useEffect(() => {
    if (prevDataRef.current && prevDataRef.current !== allData) {
      undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO - 1)), prevDataRef.current];
    }
    prevDataRef.current = allData;
  }, [allData]);

  // Undo 実行
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    prevDataRef.current = prev;
    setAllData(prev);
  }, [setAllData]);

  // 自動バックアップ
  const saveBackup = useCallback(async () => {
    if (!window.electronAPI?.saveBackup) return;
    try {
      const result = await window.electronAPI.saveBackup({
        boardData: allDataRef.current,
        activityLogs: activityLogsRef.current,
        settings: settingsRef.current,
      });
      if (result.success && result.timestamp) {
        setLastBackupTime(result.timestamp);
        console.log('Auto backup saved:', new Date(result.timestamp).toLocaleString());
      }
    } catch (error) {
      console.error('Backup failed:', error);
    }
  }, [allDataRef, activityLogsRef, settingsRef, setLastBackupTime]);

  // 起動時にバックアップを確認（データが空の場合）
  useEffect(() => {
    if (hasCheckedBackup.current) return;
    hasCheckedBackup.current = true;

    const checkBackup = async () => {
      if (!window.electronAPI?.loadBackup) return;

      const totalCards = Object.values(allData.boards).reduce(
        (sum, board) => sum + Object.keys(board.cards).length, 0
      );
      if (totalCards > 0) return;

      try {
        const result = await window.electronAPI.loadBackup();
        if (result.success && result.data && result.data.boardData) {
          let backupAllData: AllBoardsData;
          if (isAllBoardsData(result.data.boardData)) {
            backupAllData = result.data.boardData;
          } else {
            backupAllData = migrateBoardDataToAllBoards(result.data.boardData as BoardData);
          }
          migrateColumnColors(backupAllData);
          migrateCardWindows(backupAllData);

          const backupTotalCards = Object.values(backupAllData.boards).reduce(
            (sum, board) => sum + Object.keys(board.cards).length, 0
          );
          if (backupTotalCards > 0) {
            setBackupToRestore({
              boardData: backupAllData,
              activityLogs: result.data.activityLogs || [],
              settings: result.data.settings || defaultSettings,
            });
            setShowRestorePrompt(true);
          }
        }
      } catch (error) {
        console.error('Failed to check backup:', error);
      }
    };

    checkBackup();
  }, [allData.boards]);

  // 定期的な自動バックアップ
  useEffect(() => {
    const interval = setInterval(saveBackup, BACKUP_INTERVAL);
    const initialBackup = setTimeout(saveBackup, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(initialBackup);
    };
  }, [saveBackup]);

  // バックアップから復元
  const handleRestoreFromBackup = useCallback(() => {
    if (backupToRestore) {
      setAllData(backupToRestore.boardData);
      setActivityLogs(backupToRestore.activityLogs);
      setSettings(backupToRestore.settings);
      setShowRestorePrompt(false);
      setBackupToRestore(null);
    }
  }, [backupToRestore, setAllData, setActivityLogs, setSettings]);

  // 復元をスキップ
  const handleSkipRestore = useCallback(() => {
    setShowRestorePrompt(false);
    setBackupToRestore(null);
  }, []);

  // 手動バックアップエクスポート
  const handleExportBackup = useCallback(async () => {
    if (!window.electronAPI?.exportBackup) return;
    try {
      const result = await window.electronAPI.exportBackup({
        boardData: allData,
        activityLogs,
        settings,
      });
      if (result.success) {
        alert('バックアップをエクスポートしました');
      }
    } catch (error) {
      console.error('Export backup failed:', error);
      alert('バックアップのエクスポートに失敗しました');
    }
  }, [allData, activityLogs, settings]);

  // 手動バックアップインポート
  const handleImportBackup = useCallback(async () => {
    if (!window.electronAPI?.importBackup) return;
    try {
      const result = await window.electronAPI.importBackup();
      if (result.success && result.data) {
        const confirmRestore = confirm(
          `バックアップを復元しますか？\n現在のデータは上書きされます。\n\nバックアップ日時: ${new Date(result.data.backupAt).toLocaleString()}`
        );
        if (confirmRestore) {
          let imported: AllBoardsData;
          if (isAllBoardsData(result.data.boardData)) {
            imported = result.data.boardData;
          } else {
            imported = migrateBoardDataToAllBoards(result.data.boardData as BoardData);
          }
          migrateColumnColors(imported);
          migrateCardWindows(imported);
          setAllData(imported);
          setActivityLogs(result.data.activityLogs || []);
          if (result.data.settings) {
            setSettings(result.data.settings);
          }
          alert('バックアップを復元しました');
        }
      }
    } catch (error) {
      console.error('Import backup failed:', error);
      alert('バックアップのインポートに失敗しました');
    }
  }, [setAllData, setActivityLogs, setSettings]);

  // 設定プリセットエクスポート
  const handleExportSettingsPreset = useCallback(async () => {
    if (!window.electronAPI?.exportSettingsPreset) return;
    try {
      const { obsidianVaultPath, dailyNotePath, insertMarker, ...shareableSettings } = settings;
      const preset: SettingsPreset = {
        type: 'settings-preset',
        settings: shareableSettings,
        backupAt: Date.now(),
        version: 1,
      };
      const result = await window.electronAPI.exportSettingsPreset(preset);
      if (result.success) {
        alert('設定プリセットをエクスポートしました');
      }
    } catch (error) {
      console.error('Export settings preset failed:', error);
      alert('設定プリセットのエクスポートに失敗しました');
    }
  }, [settings]);

  // 設定プリセットインポート
  const handleImportSettingsPreset = useCallback(async () => {
    if (!window.electronAPI?.importSettingsPreset) return;
    try {
      const result = await window.electronAPI.importSettingsPreset();
      if (result.success && result.data) {
        const confirmRestore = confirm(
          `設定プリセットをインポートしますか？\nObsidian連携パスは現在の設定が保持されます。\n\nプリセット日時: ${new Date(result.data.backupAt).toLocaleString()}`
        );
        if (confirmRestore) {
          setSettings(prev => ({
            ...prev,
            ...result.data!.settings,
            obsidianVaultPath: prev.obsidianVaultPath,
            dailyNotePath: prev.dailyNotePath,
            insertMarker: prev.insertMarker,
          }));
          alert('設定プリセットをインポートしました');
        }
      }
    } catch (error) {
      console.error('Import settings preset failed:', error);
      alert('設定プリセットのインポートに失敗しました');
    }
  }, [setSettings]);

  // カードデータエクスポート
  const handleExportCardBackup = useCallback(async () => {
    if (!window.electronAPI?.exportCardBackup) return;
    try {
      const cardBackup: CardBackup = {
        type: 'card-backup',
        boardData: allData,
        activityLogs,
        backupAt: Date.now(),
        version: 1,
      };
      const result = await window.electronAPI.exportCardBackup(cardBackup);
      if (result.success) {
        alert('カードデータをエクスポートしました');
      }
    } catch (error) {
      console.error('Export card backup failed:', error);
      alert('カードデータのエクスポートに失敗しました');
    }
  }, [allData, activityLogs]);

  // カードデータインポート
  const handleImportCardBackup = useCallback(async () => {
    if (!window.electronAPI?.importCardBackup) return;
    try {
      const result = await window.electronAPI.importCardBackup();
      if (result.success && result.data) {
        const confirmRestore = confirm(
          `カードデータをインポートしますか？\n現在のカードデータは上書きされます。設定は保持されます。\n\nバックアップ日時: ${new Date(result.data.backupAt).toLocaleString()}`
        );
        if (confirmRestore) {
          let imported: AllBoardsData;
          if (isAllBoardsData(result.data.boardData)) {
            imported = result.data.boardData;
          } else {
            imported = migrateBoardDataToAllBoards(result.data.boardData as BoardData);
          }
          migrateColumnColors(imported);
          migrateCardWindows(imported);
          setAllData(imported);
          setActivityLogs(result.data.activityLogs || []);
          alert('カードデータをインポートしました');
        }
      }
    } catch (error) {
      console.error('Import card backup failed:', error);
      alert('カードデータのインポートに失敗しました');
    }
  }, [setAllData, setActivityLogs]);

  return {
    handleUndo,
    showRestorePrompt,
    backupToRestore,
    handleRestoreFromBackup,
    handleSkipRestore,
    handleExportBackup,
    handleImportBackup,
    handleExportSettingsPreset,
    handleImportSettingsPreset,
    handleExportCardBackup,
    handleImportCardBackup,
  };
}
