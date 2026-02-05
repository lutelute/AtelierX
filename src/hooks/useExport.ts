import { useState, useCallback } from 'react';
import { Settings, AppTabConfig, GridResult } from '../types';

interface UseExportParams {
  activeBoard: string;
  enabledTabs: AppTabConfig[];
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function useExport({
  activeBoard,
  enabledTabs,
  settings,
  setSettings,
}: UseExportParams) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNoteSelectModal, setShowNoteSelectModal] = useState(false);
  const [showGridModal, setShowGridModal] = useState(false);
  const [exportContent, setExportContent] = useState('');

  const handleOpenExport = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const handleSaveExport = useCallback(async (content: string, filename: string) => {
    if (window.electronAPI?.exportLog) {
      await window.electronAPI.exportLog(content, filename);
    }
  }, []);

  const handleObsidianExport = useCallback((content: string) => {
    if (!settings.obsidianVaultPath) {
      alert('Obsidianの設定を行ってください（設定ボタン）');
      setShowSettingsModal(true);
      return;
    }
    setExportContent(content);
    setShowExportModal(false);
    setShowNoteSelectModal(true);
  }, [settings.obsidianVaultPath]);

  const handleNoteInsertSuccess = useCallback(() => {
    alert('ノートに差し込みました');
  }, []);

  const handleOpenGridModal = useCallback(() => {
    setShowGridModal(true);
  }, []);

  const handleArrangeGrid = useCallback(async (options: { cols?: number; rows?: number; displayIndex?: number; padding?: number }): Promise<GridResult> => {
    if (activeBoard === 'terminal') {
      if (!window.electronAPI?.arrangeTerminalGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeTerminalGrid(options);
    } else if (activeBoard === 'finder') {
      if (!window.electronAPI?.arrangeFinderGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeFinderGrid(options);
    } else {
      const activeTab = enabledTabs.find(t => t.id === activeBoard);
      if (!activeTab || !window.electronAPI?.arrangeGenericGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeGenericGrid(activeTab.appName, options);
    }
  }, [activeBoard, enabledTabs]);

  const toggleTheme = useCallback(() => {
    const newTheme = (settings.theme || 'dark') === 'dark' ? 'light' : 'dark';
    setSettings((prev) => ({ ...prev, theme: newTheme }));
  }, [settings.theme, setSettings]);

  return {
    showExportModal,
    setShowExportModal,
    showSettingsModal,
    setShowSettingsModal,
    showNoteSelectModal,
    setShowNoteSelectModal,
    showGridModal,
    setShowGridModal,
    exportContent,
    handleOpenExport,
    handleSaveExport,
    handleObsidianExport,
    handleNoteInsertSuccess,
    handleOpenGridModal,
    handleArrangeGrid,
    toggleTheme,
  };
}
