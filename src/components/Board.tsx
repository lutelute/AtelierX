import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useWindowStatus } from '../hooks/useWindowStatus';
import { useDataPersistence } from '../hooks/useDataPersistence';
import { useCardOperations } from '../hooks/useCardOperations';
import { useTabManagement } from '../hooks/useTabManagement';
import { useExport } from '../hooks/useExport';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTimerActions } from '../hooks/useTimerActions';
import { BoardData, AllBoardsData, Card as CardType, BoardType, ActivityLog, Settings, WindowHistory, PluginCardActionInfo, BUILTIN_APPS, PriorityConfig, DEFAULT_PRIORITIES, MultiGridLayout, getCardWindows } from '../types';
import { createDefaultBoard, initialAllBoardsData, DEFAULT_COLUMN_COLORS, migrateCardWindows } from '../utils/boardUtils';
import { computeTerminalBgColorFromHex, buildPriorityColorMap, generateGradientColors, withAutoTextColor, TERMINAL_PRESETS } from '../utils/terminalColor';
import { Column } from './Column';
import { Card } from './Card';
import { AddCardModal } from './AddCardModal';
import { WindowSelectModal } from './WindowSelectModal';
import { EditCardModal } from './EditCardModal';
import { ReminderNotification } from './ReminderNotification';
import { ExportModal } from './ExportModal';
import { SettingsModal, defaultSettings } from './SettingsModal';
import { NoteSelectModal } from './NoteSelectModal';
import { ArchiveSection } from './ArchiveSection';
import { GridArrangeModal } from './GridArrangeModal';
import { MultiGridModal } from './MultiGridModal';
import { RelinkWindowModal } from './RelinkWindowModal';
import { IdeasPanel } from './IdeasPanel';
import { AddIdeaModal } from './AddIdeaModal';
import { TabAddPopover } from './TabAddPopover';
import { HelpModal } from './HelpModal';
import { migrateBoardDataToAllBoards } from '../utils/boardUtils';
import { UpdateBanner } from './UpdateBanner';

export function Board() {
  const [allData, setAllData] = useLocalStorage<AllBoardsData>('kanban-all-boards', initialAllBoardsData);
  const [activityLogs, setActivityLogs] = useLocalStorage<ActivityLog[]>('activity-logs', []);
  const hasMigrated = useRef(false);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [activeColumnDrag, setActiveColumnDrag] = useState<string | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [activeBoard, setActiveBoard] = useState<BoardType | 'ideas'>('terminal');
  const [settings, setSettings] = useLocalStorage<Settings>('app-settings', defaultSettings);
  const [lastBackupTime, setLastBackupTime] = useLocalStorage<number>('last-backup-time', 0);
  const [windowHistory, setWindowHistory] = useLocalStorage<WindowHistory[]>('window-history', []);
  const [cardActions, setCardActions] = useState<PluginCardActionInfo[]>([]);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  // トースト通知
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // 非表示カラム管理
  const hiddenColumns = useMemo(() => new Set(settings.hiddenColumns || []), [settings.hiddenColumns]);

  const handleHideColumn = useCallback((columnId: string) => {
    setSettings(prev => ({
      ...prev,
      hiddenColumns: [...(prev.hiddenColumns || []), columnId],
    }));
  }, [setSettings]);

  const handleShowColumn = useCallback((columnId: string) => {
    setSettings(prev => ({
      ...prev,
      hiddenColumns: (prev.hiddenColumns || []).filter(id => id !== columnId),
    }));
  }, [setSettings]);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  // 旧形式 kanban-data → kanban-all-boards マイグレーション（起動時1回）
  useEffect(() => {
    if (hasMigrated.current) return;
    hasMigrated.current = true;

    try {
      const oldRaw = localStorage.getItem('kanban-data');
      if (!oldRaw) return;

      const oldData = JSON.parse(oldRaw) as BoardData;
      if (!oldData.columns) return;

      const migrated = migrateBoardDataToAllBoards(oldData);
      setAllData(migrated);

      localStorage.setItem('kanban-data-backup', oldRaw);
      localStorage.removeItem('kanban-data');
      console.log('Migration: kanban-data → kanban-all-boards completed');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // カラム色マイグレーション: デフォルトカラムにcolorが未設定の場合に補完（起動時1回）
  const hasColorMigrated = useRef(false);
  useEffect(() => {
    if (hasColorMigrated.current) return;
    let needsMigration = false;
    for (const board of Object.values(allData.boards)) {
      for (const col of board.columns) {
        if (!col.color && DEFAULT_COLUMN_COLORS[col.id]) {
          needsMigration = true;
          break;
        }
      }
      if (needsMigration) break;
    }
    if (!needsMigration) { hasColorMigrated.current = true; return; }
    hasColorMigrated.current = true;
    setAllData(prev => {
      const updated = JSON.parse(JSON.stringify(prev)) as AllBoardsData;
      for (const board of Object.values(updated.boards)) {
        for (const col of board.columns) {
          if (!col.color && DEFAULT_COLUMN_COLORS[col.id]) {
            col.color = DEFAULT_COLUMN_COLORS[col.id];
          }
        }
      }
      return updated;
    });
  }, [allData]); // eslint-disable-line react-hooks/exhaustive-deps

  // 単一→複数ウィンドウマイグレーション（起動時1回）
  const hasWindowMigrated = useRef(false);
  useEffect(() => {
    if (hasWindowMigrated.current) return;
    let needsMigration = false;
    for (const board of Object.values(allData.boards)) {
      for (const card of Object.values(board.cards)) {
        if (card.windowApp && !card.windows) {
          needsMigration = true;
          break;
        }
      }
      if (needsMigration) break;
    }
    if (!needsMigration) { hasWindowMigrated.current = true; return; }
    hasWindowMigrated.current = true;
    setAllData(prev => {
      const updated = JSON.parse(JSON.stringify(prev)) as AllBoardsData;
      migrateCardWindows(updated);
      return updated;
    });
  }, [allData]); // eslint-disable-line react-hooks/exhaustive-deps

  // useRef化: コールバック内でstateの最新値を参照するため
  const allDataRef = useRef(allData);
  allDataRef.current = allData;
  const activityLogsRef = useRef(activityLogs);
  activityLogsRef.current = activityLogs;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // アクティブボードのデータを取得するヘルパー
  const currentBoard: BoardData = useMemo(() => {
    if (activeBoard === 'ideas') return allData.boards['terminal'] || createDefaultBoard();
    return allData.boards[activeBoard] || createDefaultBoard();
  }, [allData, activeBoard]);

  // アクティブボードのデータを更新するヘルパー
  const updateCurrentBoard = useCallback((updater: (prev: BoardData) => BoardData) => {
    setAllData(prev => {
      const boardId = activeBoard === 'ideas' ? 'terminal' : activeBoard;
      const board = prev.boards[boardId] || createDefaultBoard();
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: updater(board),
        },
      };
    });
  }, [setAllData, activeBoard]);

  // 特定のボードを更新するヘルパー
  const updateBoard = useCallback((boardId: string, updater: (prev: BoardData) => BoardData) => {
    setAllData(prev => {
      const board = prev.boards[boardId] || createDefaultBoard();
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: updater(board),
        },
      };
    });
  }, [setAllData]);

  // アクティビティログを追加（最新2000件に制限）
  const MAX_ACTIVITY_LOGS = 2000;
  const addLog = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const newLog: ActivityLog = {
      ...log,
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
    };
    setActivityLogs((prev) => {
      const updated = [...prev, newLog];
      return updated.length > MAX_ACTIVITY_LOGS
        ? updated.slice(updated.length - MAX_ACTIVITY_LOGS)
        : updated;
    });
  }, [setActivityLogs]);

  // ウィンドウ履歴に追加
  const addToWindowHistory = useCallback((card: CardType) => {
    if (!card.windowApp || !card.windowId || !card.windowName) return;

    const historyEntry: WindowHistory = {
      id: `history-${Date.now()}`,
      app: card.windowApp,
      windowId: card.windowId,
      windowName: card.windowName,
      cardTitle: card.title,
      lastUsed: Date.now(),
    };

    setWindowHistory((prev) => {
      const filtered = prev.filter((h) => h.windowId !== card.windowId);
      const updated = [historyEntry, ...filtered].slice(0, 20);
      return updated;
    });
  }, [setWindowHistory]);

  // === カスタムフック ===

  const {
    navTabsRef,
    tabsScrollState,
    enabledTabs,
    handleAddTab,
    handleRemoveTab,
  } = useTabManagement({
    settings,
    setSettings,
    setAllData,
    activeBoard,
    setActiveBoard,
  });

  const {
    unaddedWindows,
    brokenLinkCards,
    handleJumpToWindow,
    handleCloseWindowCard,
    handleAddFromReminder,
    handleAddAllWindows,
  } = useWindowStatus({
    activeBoard,
    enabledTabs,
    allDataRef,
    updateCurrentBoard,
    settings,
    addToWindowHistory,
  });

  const {
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
  } = useDataPersistence({
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
  });

  const cardOps = useCardOperations({
    activeBoard,
    currentBoard,
    enabledTabs,
    updateCurrentBoard,
    updateBoard,
    setAllData,
    addLog,
    addToWindowHistory,
    setActiveBoard,
  });

  const {
    showExportModal,
    setShowExportModal,
    showSettingsModal,
    setShowSettingsModal,
    showNoteSelectModal,
    setShowNoteSelectModal,
    showGridModal,
    setShowGridModal,
    showMultiGridModal,
    setShowMultiGridModal,
    exportContent,
    handleOpenExport,
    handleSaveExport,
    handleObsidianExport,
    handleNoteInsertSuccess,
    handleOpenGridModal,
    handleArrangeGrid,
    handleOpenMultiGridModal,
    handleArrangeMultiAppGrid,
    toggleTheme,
  } = useExport({
    activeBoard,
    enabledTabs,
    settings,
    setSettings,
  });

  const { handleCardAction: rawHandleCardAction, handleTimerAction } = useTimerActions({
    currentBoard,
    updateCurrentBoard,
  });

  // カードアクション実行 + 結果メッセージをトースト表示
  const handleCardAction = useCallback(async (cardId: string, actionId: string, taskIndex?: number) => {
    const result = await rawHandleCardAction(cardId, actionId, taskIndex);
    if (result?.message || result?.error) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage({
        text: result.error || result.message!,
        type: result.error ? 'error' : 'info',
      });
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
    }
  }, [rawHandleCardAction]);

  // モーダルが開いているか判定
  const isModalOpen = !!(cardOps.modalColumnId || cardOps.windowSelectColumnId || cardOps.editingCard || showExportModal || showSettingsModal || showNoteSelectModal || showGridModal || showMultiGridModal || cardOps.relinkingCard || cardOps.showAddIdeaModal || showHelpModal);

  useKeyboardShortcuts({
    activeBoard,
    handleUndo,
    setShowSettingsModal,
    setShowGridModal,
    isModalOpen,
  });

  // マルチグリッドお気に入り保存
  const handleSaveMultiGridFavorite = useCallback((layout: MultiGridLayout) => {
    setSettings(prev => ({
      ...prev,
      multiGridFavorites: [...(prev.multiGridFavorites || []), layout],
    }));
  }, [setSettings]);

  // マルチグリッドお気に入り削除
  const handleDeleteMultiGridFavorite = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      multiGridFavorites: (prev.multiGridFavorites || []).filter(f => f.id !== id),
    }));
  }, [setSettings]);

  // プラグインカードアクションを取得（起動時のみ）
  useEffect(() => {
    const loadCardActions = async () => {
      if (!window.electronAPI?.plugins?.getCardActions) return;
      try {
        const actions = await window.electronAPI.plugins.getCardActions();
        setCardActions(actions);
      } catch (error) {
        console.error('Failed to load card actions:', error);
      }
    };
    loadCardActions();
  }, []);

  // ビルトインタブにmacOSネイティブアイコンを非同期ロード
  useEffect(() => {
    const loadBuiltinIcons = async () => {
      if (!window.electronAPI?.getAppIcon) return;
      const currentTabs = settings.enabledAppTabs && settings.enabledAppTabs.length > 0
        ? settings.enabledAppTabs
        : [...BUILTIN_APPS];

      let updated = false;
      const updatedTabs = await Promise.all(currentTabs.map(async (tab) => {
        if (tab.type === 'builtin' && !tab.iconDataUri) {
          try {
            const iconDataUri = await window.electronAPI!.getAppIcon(tab.appName);
            if (iconDataUri) {
              updated = true;
              return { ...tab, iconDataUri };
            }
          } catch {
            // ignore
          }
        }
        return tab;
      }));

      if (updated) {
        setSettings(prev => ({ ...prev, enabledAppTabs: updatedTabs }));
      }
    };
    loadBuiltinIcons();
  }, [settings.enabledAppTabs?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // テーマを適用
  useEffect(() => {
    const theme = settings.theme || 'dark';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }, [settings.theme]);

  // メニューからの「設定...」(Cmd+,) をリッスン
  useEffect(() => {
    if (!window.electronAPI?.onOpenSettings) return;
    const cleanup = window.electronAPI.onOpenSettings(() => {
      setShowSettingsModal(true);
    });
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // === DnD ===

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = args.active.id as string;
    const isColumnDrag = activeId.startsWith('column-');

    const filteredContainers = args.droppableContainers.filter((container) => {
      const containerId = container.id as string;
      if (isColumnDrag) {
        return containerId.startsWith('column-');
      }
      return !containerId.startsWith('column-');
    });

    if (isColumnDrag) {
      return closestCorners({ ...args, droppableContainers: filteredContainers });
    }
    return rectIntersection({ ...args, droppableContainers: filteredContainers });
  }, []);

  const findColumnByCardId = (cardId: string): string | undefined => {
    return currentBoard.columns.find((col) => col.cardIds.includes(cardId))?.id;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;

    if (activeId.startsWith('column-')) {
      setActiveColumnDrag(activeId.replace('column-', ''));
      return;
    }

    const card = currentBoard.cards[activeId];
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith('column-') || overId.startsWith('column-')) return;

    const activeColumnId = findColumnByCardId(activeId);
    let overColumnId = findColumnByCardId(overId);

    if (!overColumnId) {
      overColumnId = overId;
    }

    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
      return;
    }

    const card = currentBoard.cards[activeId];
    if (card) {
      addLog({
        type: overColumnId === 'done' ? 'complete' : 'move',
        cardTitle: card.title,
        cardDescription: card.description,
        cardTag: card.tag,
        fromColumn: activeColumnId,
        toColumn: overColumnId,
      });
    }

    updateCurrentBoard((prev) => {
      const activeColumn = prev.columns.find((col) => col.id === activeColumnId)!;
      const overColumn = prev.columns.find((col) => col.id === overColumnId)!;

      const activeCardIndex = activeColumn.cardIds.indexOf(activeId);
      const overCardIndex = overColumn.cardIds.indexOf(overId);

      const newActiveCardIds = [...activeColumn.cardIds];
      newActiveCardIds.splice(activeCardIndex, 1);

      const newOverCardIds = [...overColumn.cardIds];
      const insertIndex = overCardIndex >= 0 ? overCardIndex : newOverCardIds.length;
      newOverCardIds.splice(insertIndex, 0, activeId);

      const updatedCards = { ...prev.cards };
      if (overColumnId === 'done' && updatedCards[activeId]) {
        updatedCards[activeId] = {
          ...updatedCards[activeId],
          completedAt: Date.now(),
        };
      }

      return {
        ...prev,
        cards: updatedCards,
        columns: prev.columns.map((col) => {
          if (col.id === activeColumnId) {
            return { ...col, cardIds: newActiveCardIds };
          }
          if (col.id === overColumnId) {
            return { ...col, cardIds: newOverCardIds };
          }
          return col;
        }),
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    setActiveColumnDrag(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith('column-') && overId.startsWith('column-')) {
      const activeColId = activeId.replace('column-', '');
      const overColId = overId.replace('column-', '');
      if (activeColId !== overColId) {
        updateCurrentBoard((prev) => {
          const oldIndex = prev.columns.findIndex((col) => col.id === activeColId);
          const newIndex = prev.columns.findIndex((col) => col.id === overColId);
          if (oldIndex === -1 || newIndex === -1) return prev;
          const newColumns = arrayMove(prev.columns, oldIndex, newIndex);
          return {
            ...prev,
            columns: newColumns,
            columnOrder: newColumns.map((col) => col.id),
          };
        });
      }
      return;
    }

    const activeColumnId = findColumnByCardId(activeId);
    const overColumnId = findColumnByCardId(overId) || overId;

    if (!activeColumnId) return;

    if (activeColumnId === overColumnId) {
      const column = currentBoard.columns.find((col) => col.id === activeColumnId);
      if (!column) return;

      const oldIndex = column.cardIds.indexOf(activeId);
      const newIndex = column.cardIds.indexOf(overId);

      if (oldIndex !== newIndex && newIndex >= 0) {
        updateCurrentBoard((prev) => ({
          ...prev,
          columns: prev.columns.map((col) => {
            if (col.id === activeColumnId) {
              return {
                ...col,
                cardIds: arrayMove(col.cardIds, oldIndex, newIndex),
              };
            }
            return col;
          }),
        }));
      }
    }
  };

  // === カラム操作 ===

  const handleAddColumn = () => {
    const id = `col-${Date.now()}`;
    updateCurrentBoard(prev => ({
      ...prev,
      columns: [...prev.columns, { id, title: '新規カラム', cardIds: [] }],
      columnOrder: [...prev.columnOrder, id],
    }));
  };

  const DEFAULT_COLUMN_IDS = new Set(['todo', 'in-progress', 'done']);

  const handleDeleteColumn = (columnId: string, moveToColumnId?: string) => {
    if (DEFAULT_COLUMN_IDS.has(columnId)) return;
    updateCurrentBoard(prev => {
      const col = prev.columns.find(c => c.id === columnId);
      let newColumns = prev.columns.filter(c => c.id !== columnId);
      if (col && col.cardIds.length > 0) {
        const targetId = moveToColumnId || prev.columns.find(c => c.id !== columnId)?.id;
        if (targetId) {
          newColumns = newColumns.map(c =>
            c.id === targetId ? { ...c, cardIds: [...c.cardIds, ...col.cardIds] } : c
          );
        }
      }
      return {
        ...prev,
        columns: newColumns,
        columnOrder: prev.columnOrder.filter(id => id !== columnId),
      };
    });
  };

  const handleChangeColumnColor = useCallback((columnId: string, color: string) => {
    updateCurrentBoard(prev => ({
      ...prev,
      columns: prev.columns.map(col =>
        col.id === columnId ? { ...col, color } : col
      ),
    }));
  }, [updateCurrentBoard]);

  const handleRenameColumn = useCallback((columnId: string, newTitle: string) => {
    updateCurrentBoard(prev => ({
      ...prev,
      columns: prev.columns.map(col =>
        col.id === columnId ? { ...col, title: newTitle } : col
      ),
    }));
  }, [updateCurrentBoard]);

  // === 派生データ ===

  const filteredCardsByColumn = useMemo(() => {
    const result: Record<string, CardType[]> = {};
    for (const column of currentBoard.columns) {
      result[column.id] = column.cardIds
        .map((id) => currentBoard.cards[id])
        .filter((card): card is CardType => {
          if (!card || card.archived) return false;
          return true;
        });
    }
    return result;
  }, [currentBoard.columns, currentBoard.cards]);

  const brokenLinkCardIds = useMemo(() => {
    return new Set(brokenLinkCards.map((card) => card.id));
  }, [brokenLinkCards]);

  const archivedCards = useMemo(() => {
    return Object.values(currentBoard.cards).filter((card) => card.archived);
  }, [currentBoard.cards]);

  // === 優先順位設定 ===

  const allPriorities = useMemo(() => {
    return [...DEFAULT_PRIORITIES, ...(settings.customPriorities || [])];
  }, [settings.customPriorities]);

  const priorityColorMap = useMemo(() => buildPriorityColorMap(allPriorities), [allPriorities]);

  const handleAddPriority = useCallback((config: PriorityConfig) => {
    setSettings(prev => ({
      ...prev,
      customPriorities: [...(prev.customPriorities || []), config],
    }));
  }, [setSettings]);

  // カラーメニュー: 外側クリックで閉じる
  useEffect(() => {
    if (!showColorMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setShowColorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColorMenu]);

  // === Terminal 色一括適用 (macOS のみ) ===

  const isMac = window.electronAPI?.platform === 'darwin';
  const isTerminalTab = activeBoard === 'terminal' && isMac;

  // カードからTerminalウィンドウIDを全て取得するヘルパー
  const getTerminalWindowIds = useCallback((card: CardType): string[] => {
    return getCardWindows(card)
      .filter(w => w.app === 'Terminal' && w.id)
      .map(w => w.id);
  }, []);

  const handleBatchApplyColumnColor = useCallback(() => {
    if (!window.electronAPI?.setTerminalColor) return;
    for (const column of currentBoard.columns) {
      if (column.id === 'todo') continue;
      if (!column.color) continue;
      const bgColor = computeTerminalBgColorFromHex(column.color);
      for (const cardId of column.cardIds) {
        const card = currentBoard.cards[cardId];
        if (card && !card.archived) {
          for (const wid of getTerminalWindowIds(card)) {
            window.electronAPI.setTerminalColor(wid, withAutoTextColor(bgColor));
          }
        }
      }
    }
  }, [currentBoard, getTerminalWindowIds]);

  const handleBatchApplyPriorityColor = useCallback(() => {
    if (!window.electronAPI?.setTerminalColor) return;
    const black = { r: 0, g: 0, b: 0 };
    for (const column of currentBoard.columns) {
      for (const cardId of column.cardIds) {
        const card = currentBoard.cards[cardId];
        if (card && !card.archived) {
          const wids = getTerminalWindowIds(card);
          if (wids.length === 0) continue;
          const pColor = card.priority ? priorityColorMap[card.priority] : undefined;
          const colorObj = pColor ? withAutoTextColor(computeTerminalBgColorFromHex(pColor)) : withAutoTextColor(black);
          for (const wid of wids) {
            window.electronAPI.setTerminalColor(wid, colorObj);
          }
        }
      }
    }
  }, [currentBoard, priorityColorMap, getTerminalWindowIds]);

  const handleBatchResetColor = useCallback(() => {
    if (!window.electronAPI?.setTerminalColor) return;
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 230, g: 230, b: 235 };
    for (const column of currentBoard.columns) {
      for (const cardId of column.cardIds) {
        const card = currentBoard.cards[cardId];
        if (card && !card.archived) {
          for (const wid of getTerminalWindowIds(card)) {
            window.electronAPI.setTerminalColor(wid, { bgColor: black, textColor: white });
          }
        }
      }
    }
  }, [currentBoard, getTerminalWindowIds]);

  const handleBatchApplyPreset = useCallback((presetId: string) => {
    if (!window.electronAPI?.setTerminalColor) return;
    const preset = TERMINAL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    for (const column of currentBoard.columns) {
      for (const cardId of column.cardIds) {
        const card = currentBoard.cards[cardId];
        if (card && !card.archived) {
          for (const wid of getTerminalWindowIds(card)) {
            window.electronAPI.setTerminalColor(wid, { bgColor: preset.bg, textColor: preset.text });
          }
        }
      }
    }
  }, [currentBoard, getTerminalWindowIds]);

  const handleBatchApplyGradient = useCallback(() => {
    if (!window.electronAPI?.setTerminalColor) return;
    const termWindowIds: string[] = [];
    for (const column of currentBoard.columns) {
      if (column.id === 'todo') continue;
      for (const cardId of column.cardIds) {
        const card = currentBoard.cards[cardId];
        if (card && !card.archived) {
          termWindowIds.push(...getTerminalWindowIds(card));
        }
      }
    }
    const colors = generateGradientColors(termWindowIds.length);
    termWindowIds.forEach((wid, i) => {
      window.electronAPI!.setTerminalColor(wid, withAutoTextColor(colors[i]));
    });
  }, [currentBoard, getTerminalWindowIds]);

  // === ジャンプ・クリックハンドラ ===

  const handleJumpCard = async (cardId: string, windowRefId?: string) => {
    const card = currentBoard.cards[cardId];
    if (card) {
      await handleJumpToWindow(card, cardOps.setRelinkingCard, windowRefId);
    }
  };

  const handleCloseWindowCardById = async (cardId: string, windowRefId?: string) => {
    const card = currentBoard.cards[cardId];
    if (card) {
      await handleCloseWindowCard(card, windowRefId);
    }
  };

  const handleAddWindowToCardById = (cardId: string) => {
    cardOps.setAddWindowTargetCardId(cardId);
    cardOps.setWindowSelectColumnId('__add-to-card__');
  };

  const handleCardClickById = async (cardId: string) => {
    await cardOps.handleCardClick(cardId, handleJumpToWindow, settings.cardClickBehavior);
  };

  // === JSX ===

  return (
    <div className="board-container">
      {/* 左サイドメニュー */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="sidebar-btn active" title="ボード">
            <svg className="sidebar-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="2" width="5" height="5" rx="1"/><rect x="2" y="11" width="5" height="5" rx="1"/><rect x="11" y="11" width="5" height="5" rx="1"/></svg>
          </button>
          <button className="sidebar-btn" onClick={() => setShowHelpModal(true)} title="ヘルプ">
            <svg className="sidebar-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-btn" onClick={() => setShowSettingsModal(true)} title="設定">
            <svg className="sidebar-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </aside>

      {/* フローティングナビゲーションバー */}
      <nav className="floating-nav">
        <div className="nav-section nav-left">
          <div className="nav-brand">
            <span className="brand-name">AtelierX</span>
          </div>
        </div>

        <div className="nav-section nav-center">
          <div className="nav-tabs-wrapper">
          {(tabsScrollState === 'left' || tabsScrollState === 'both') && (
            <div className="nav-tabs-fade nav-tabs-fade-left" />
          )}
          <div className="nav-tabs" ref={navTabsRef}>
            {enabledTabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-tab ${activeBoard === tab.id ? 'active' : ''}`}
                onClick={() => setActiveBoard(tab.id)}
                style={activeBoard === tab.id ? {
                  background: `linear-gradient(135deg, ${tab.color}40 0%, ${tab.color}26 100%)`,
                  color: tab.color,
                } : undefined}
              >
                {tab.iconDataUri ? (
                  <img src={tab.iconDataUri} className="tab-icon-img" alt={tab.displayName} />
                ) : (
                  <span className="tab-icon">{tab.icon}</span>
                )}
                <span className="tab-label">{tab.displayName}</span>
                {tab.type !== 'builtin' && (
                  <span
                    className="tab-close"
                    onClick={(e) => { e.stopPropagation(); handleRemoveTab(tab.id); }}
                    title="タブを削除"
                  >×</span>
                )}
              </button>
            ))}
            <button
              className={`nav-tab ${activeBoard === 'ideas' ? 'active' : ''}`}
              onClick={() => setActiveBoard('ideas')}
            >
              <span className="tab-icon">💡</span>
              <span className="tab-label">Ideas</span>
              {(allData.ideas?.length || 0) > 0 && (
                <span className="tab-badge">{allData.ideas?.length}</span>
              )}
            </button>
          </div>
          {(tabsScrollState === 'right' || tabsScrollState === 'both') && (
            <div className="nav-tabs-fade nav-tabs-fade-right" />
          )}
          </div>
          <TabAddPopover enabledTabs={enabledTabs} onAddTab={handleAddTab} />
        </div>

        <div className="nav-section nav-right">
          {isTerminalTab && (
            <div className="color-menu-wrapper" ref={colorMenuRef}>
              <button
                className={`nav-action nav-action-term-color ${showColorMenu ? 'active' : ''}`}
                onClick={() => setShowColorMenu(v => !v)}
                title="Terminal色メニュー - カラム色/優先順位色/グラデーション/プリセット"
              >
                <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6"/>
                  <circle cx="5" cy="6.5" r="1.3" fill="#ef4444" stroke="none"/>
                  <circle cx="11" cy="6.5" r="1.3" fill="#3b82f6" stroke="none"/>
                  <circle cx="8" cy="11" r="1.3" fill="#22c55e" stroke="none"/>
                </svg>
              </button>
              {showColorMenu && (
                <div className="color-menu-dropdown">
                  <button className="color-menu-item" onClick={() => { handleBatchApplyColumnColor(); setShowColorMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="10.5" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>
                    <span>カラム色</span>
                  </button>
                  <button className="color-menu-item" onClick={() => { handleBatchApplyPriorityColor(); setShowColorMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><circle cx="5" cy="8" r="1.2" fill="#ef4444" stroke="none"/><circle cx="8" cy="8" r="1.2" fill="#f59e0b" stroke="none"/><circle cx="11" cy="8" r="1.2" fill="#60a5fa" stroke="none"/></svg>
                    <span>優先順位色</span>
                  </button>
                  <button className="color-menu-item" onClick={() => { handleBatchApplyGradient(); setShowColorMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ef4444"/><stop offset="50%" stopColor="#22c55e"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient></defs>
                      <circle cx="8" cy="8" r="6" stroke="url(#grad)" strokeWidth="1.5" fill="none"/>
                    </svg>
                    <span>グラデーション</span>
                  </button>
                  <div className="color-menu-divider" />
                  <div className="color-menu-label">プリセット</div>
                  <div className="color-menu-presets">
                    {TERMINAL_PRESETS.map(p => (
                      <button
                        key={p.id}
                        className="color-preset-chip"
                        onClick={() => { handleBatchApplyPreset(p.id); setShowColorMenu(false); }}
                        title={p.name}
                      >
                        <span className="color-preset-dot" style={{ background: p.previewColor }} />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="color-menu-divider" />
                  <button className="color-menu-item color-menu-reset" onClick={() => { handleBatchResetColor(); setShowColorMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8a6 6 0 1 1 1.8 4.3"/><path d="M2 12.3V8h4.3"/></svg>
                    <span>リセット</span>
                  </button>
                </div>
              )}
            </div>
          )}
          {activeBoard !== 'ideas' && unaddedWindows.length > 0 && (
            <button className="nav-action pulse" onClick={handleAddAllWindows} title={`未追加のウィンドウを一括追加 (${unaddedWindows.length}件)`}>
              <span className="action-badge">+{unaddedWindows.length}</span>
            </button>
          )}
          <button className="nav-action" onClick={handleOpenGridModal} title="Grid配置 - 全ウィンドウをグリッド整列">
            <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
          </button>
          <button className="nav-action" onClick={handleOpenMultiGridModal} title="マルチアプリGrid - 複数アプリを画面分割配置">
            <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.2"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.2"/></svg>
          </button>
          <button className="nav-action" onClick={handleOpenExport} title="日報エクスポート - Markdown/JSON/Obsidian">
            <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v9"/><path d="M4 5l4-4 4 4"/><path d="M2 11v3h12v-3"/></svg>
          </button>
          <div className="nav-divider" />
          <div className="theme-slider" onClick={toggleTheme} title="テーマ切替 (ライト/ダーク)">
            <span className="theme-label light">☀</span>
            <div className="theme-track">
              <div className="theme-thumb" />
            </div>
            <span className="theme-label dark">☽</span>
          </div>
        </div>
      </nav>
      <UpdateBanner onOpenSettings={() => setShowSettingsModal(true)} />
      {activeBoard !== 'ideas' ? (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="board">
              <SortableContext items={currentBoard.columns.filter(col => !hiddenColumns.has(col.id)).map(col => `column-${col.id}`)} strategy={horizontalListSortingStrategy}>
              {currentBoard.columns.filter(col => !hiddenColumns.has(col.id)).map((column) => (
                <Column
                  key={column.id}
                  column={column}
                  cards={filteredCardsByColumn[column.id] || []}
                  onAddCard={cardOps.handleAddCard}
                  onDeleteCard={cardOps.handleDeleteCard}
                  onEditCard={cardOps.handleEditCard}
                  onJumpCard={handleJumpCard}
                  onCloseWindowCard={handleCloseWindowCardById}
                  onUnlinkWindowCard={cardOps.handleUnlinkWindow}
                  onAddWindowToCard={handleAddWindowToCardById}
                  onDropWindow={cardOps.handleDropWindow}
                  onUpdateDescription={cardOps.handleUpdateDescription}
                  onUpdateComment={cardOps.handleUpdateComment}
                  onUpdateStatusMarker={cardOps.handleUpdateStatusMarker}
                  onCardClick={handleCardClickById}
                  onArchiveCard={cardOps.handleArchiveCard}
                  customSubtags={settings.customSubtags}
                  defaultSubtagSettings={settings.defaultSubtagSettings}
                  brokenLinkCardIds={brokenLinkCardIds}
                  cardActions={cardActions}
                  onCardAction={handleCardAction}
                  onTimerAction={handleTimerAction}
                  onUpdatePriority={cardOps.handleUpdatePriority}
                  priorityConfigs={settings.customPriorities}
                  onAddPriority={handleAddPriority}
                  onRenameColumn={handleRenameColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onChangeColumnColor={handleChangeColumnColor}
                  allColumns={currentBoard.columns}
                  canDelete={!DEFAULT_COLUMN_IDS.has(column.id)}
                  onHideColumn={handleHideColumn}
                  settings={settings}
                  onUpdateSettings={(updater) => setSettings(updater)}
                />
              ))}
              {/* 非表示カラム復元パネル（カラム追加ボタンの前） */}
              {hiddenColumns.size > 0 && (
                <div className="hidden-columns-bar">
                  <span className="hidden-columns-label">非表示</span>
                  {currentBoard.columns
                    .filter(col => hiddenColumns.has(col.id))
                    .map(col => (
                      <button
                        key={col.id}
                        className="hidden-column-chip"
                        onClick={() => handleShowColumn(col.id)}
                        title={`${col.title} を表示`}
                        style={col.color ? { borderColor: col.color, color: col.color } : undefined}
                      >
                        <span>{col.title}</span>
                        <span className="hidden-column-count">
                          {(filteredCardsByColumn[col.id] || []).length}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              <button className="add-column-button" onClick={handleAddColumn}>
                + カラム追加
              </button>
              </SortableContext>
            </div>
            <DragOverlay>
              {activeCard ? (
                <Card card={activeCard} onDelete={() => {}} onEdit={() => {}} />
              ) : activeColumnDrag ? (
                <div className="column-drag-overlay">
                  <div className="column-drag-overlay-title">
                    {currentBoard.columns.find(col => col.id === activeColumnDrag)?.title || ''}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <ArchiveSection
            cards={archivedCards}
            onRestore={cardOps.handleRestoreCard}
            onDelete={cardOps.handleDeleteCard}
            customSubtags={settings.customSubtags}
            defaultSubtagSettings={settings.defaultSubtagSettings}
          />
        </>
      ) : (
        <IdeasPanel
          ideas={allData.ideas || []}
          onAddIdea={() => cardOps.setShowAddIdeaModal(true)}
          onRestoreToBoard={(ideaId, targetBoard) => cardOps.handleRestoreIdeaToBoard(ideaId, targetBoard, allData.ideas)}
          onDeleteIdea={cardOps.handleDeleteIdea}
        />
      )}
      {cardOps.modalColumnId && (
        <AddCardModal
          onClose={() => cardOps.setModalColumnId(null)}
          onAdd={cardOps.handleCreateCard}
          onAddWithNewTerminal={cardOps.handleCreateCardWithNewTerminal}
          customSubtags={settings.customSubtags}
          onAddSubtag={(newSubtag) => {
            setSettings((prev) => ({
              ...prev,
              customSubtags: [...(prev.customSubtags || []), newSubtag],
            }));
          }}
          defaultSubtagSettings={settings.defaultSubtagSettings}
          enabledTabs={enabledTabs}
          activeBoard={activeBoard}
        />
      )}
      {cardOps.windowSelectColumnId && (
        <WindowSelectModal
          onClose={() => {
            cardOps.setWindowSelectColumnId(null);
            cardOps.setAddWindowTargetCardId(null);
          }}
          onSelect={(appWindow) => {
            if (cardOps.addWindowTargetCardId) {
              // 既存カードへのウィンドウ追加モード
              cardOps.handleAddWindowToCard(cardOps.addWindowTargetCardId, appWindow);
              cardOps.setAddWindowTargetCardId(null);
              cardOps.setWindowSelectColumnId(null);
            } else {
              cardOps.handleSelectWindow(appWindow);
            }
          }}
          appFilter={cardOps.addWindowTargetCardId ? undefined : enabledTabs.find(t => t.id === activeBoard)?.appName}
        />
      )}
      {cardOps.editingCard && (
        <EditCardModal
          card={cardOps.editingCard}
          onClose={() => cardOps.setEditingCard(null)}
          onSave={cardOps.handleSaveCard}
          onJump={() => handleJumpToWindow(cardOps.editingCard!, cardOps.setRelinkingCard)}
          onSendToIdeas={cardOps.handleSendToIdeas}
          customSubtags={settings.customSubtags}
          onAddSubtag={(newSubtag) => {
            setSettings((prev) => ({
              ...prev,
              customSubtags: [...(prev.customSubtags || []), newSubtag],
            }));
          }}
          onUpdateSubtag={(id, updates) => {
            setSettings((prev) => ({
              ...prev,
              customSubtags: (prev.customSubtags || []).map((st) =>
                st.id === id ? { ...st, ...updates } : st
              ),
            }));
          }}
          onDeleteSubtag={(id) => {
            setSettings((prev) => ({
              ...prev,
              customSubtags: (prev.customSubtags || []).filter((st) => st.id !== id),
            }));
          }}
          onUpdateDefaultSubtag={(id, updates) => {
            const current = settings.defaultSubtagSettings || { hidden: [], overrides: {} };
            setSettings((prev) => ({
              ...prev,
              defaultSubtagSettings: {
                ...current,
                overrides: {
                  ...current.overrides,
                  [id]: {
                    ...current.overrides[id],
                    ...updates,
                  },
                },
              },
            }));
          }}
          defaultSubtagSettings={settings.defaultSubtagSettings}
          enabledTabs={enabledTabs}
          columnColor={(() => {
            const col = currentBoard.columns.find(c => c.cardIds.includes(cardOps.editingCard!.id));
            return col?.color;
          })()}
          customPriorities={settings.customPriorities}
        />
      )}
      {!reminderDismissed && (
        <ReminderNotification
          unaddedWindows={unaddedWindows}
          brokenLinkCards={brokenLinkCards}
          onAddWindow={handleAddFromReminder}
          onRelinkCard={(card) => cardOps.setRelinkingCard(card)}
          onDismiss={() => setReminderDismissed(true)}
        />
      )}
      {showExportModal && (
        <ExportModal
          logs={activityLogs}
          allBoardsData={allData}
          activeBoard={activeBoard}
          onClose={() => setShowExportModal(false)}
          onSave={handleSaveExport}
          onObsidian={handleObsidianExport}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          initialSettings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSave={setSettings}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onExportSettingsPreset={handleExportSettingsPreset}
          onImportSettingsPreset={handleImportSettingsPreset}
          onExportCardBackup={handleExportCardBackup}
          onImportCardBackup={handleImportCardBackup}
          lastBackupTime={lastBackupTime}
        />
      )}
      {showRestorePrompt && backupToRestore && (
        <div className="modal-overlay">
          <div className="modal restore-prompt-modal">
            <div className="modal-header">
              <h2>バックアップを復元しますか？</h2>
            </div>
            <div className="restore-prompt-content">
              <p>前回のバックアップが見つかりました。</p>
              <p>カード数: {Object.values(backupToRestore.boardData.boards).reduce((sum, board) => sum + Object.keys(board.cards).length, 0)}</p>
              <p className="restore-warning">現在のデータは空です。バックアップから復元しますか？</p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleSkipRestore}>
                スキップ
              </button>
              <button type="button" className="btn-primary" onClick={handleRestoreFromBackup}>
                復元する
              </button>
            </div>
          </div>
        </div>
      )}
      {showNoteSelectModal && (
        <NoteSelectModal
          vaultPath={settings.obsidianVaultPath}
          dailyNotePath={settings.dailyNotePath}
          insertMarker={settings.insertMarker}
          content={exportContent}
          onClose={() => setShowNoteSelectModal(false)}
          onSuccess={handleNoteInsertSuccess}
        />
      )}
      {showGridModal && (
        <GridArrangeModal
          appType={enabledTabs.find(t => t.id === activeBoard)?.appName || 'Terminal'}
          onClose={() => setShowGridModal(false)}
          onArrange={handleArrangeGrid}
          columns={currentBoard.columns}
          cards={currentBoard.cards}
        />
      )}
      {showMultiGridModal && (
        <MultiGridModal
          enabledTabs={enabledTabs}
          favorites={settings.multiGridFavorites || []}
          onClose={() => setShowMultiGridModal(false)}
          onArrange={handleArrangeMultiAppGrid}
          onSaveFavorite={handleSaveMultiGridFavorite}
          onDeleteFavorite={handleDeleteMultiGridFavorite}
        />
      )}
      {cardOps.relinkingCard && (
        <RelinkWindowModal
          card={cardOps.relinkingCard}
          windowHistory={windowHistory}
          onClose={() => cardOps.setRelinkingCard(null)}
          onSelectCurrent={cardOps.handleRelinkSelectCurrent}
          onSelectHistory={cardOps.handleRelinkSelectHistory}
          onOpenNew={cardOps.handleRelinkOpenNew}
          onUnlink={cardOps.handleRelinkUnlink}
        />
      )}
      {cardOps.showAddIdeaModal && (
        <AddIdeaModal
          onClose={() => cardOps.setShowAddIdeaModal(false)}
          onAdd={cardOps.handleAddIdea}
        />
      )}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}
      {toastMessage && (
        <div className={`toast-notification toast-${toastMessage.type}`} onClick={() => setToastMessage(null)}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}
