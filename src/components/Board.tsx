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
import { BoardData, AllBoardsData, Card as CardType, CardStatusMarker, TagType, SubTagType, AppWindow, BoardType, ActivityLog, Settings, WindowHistory, Idea, IdeaCategory, PluginCardActionInfo, TimerAction, AppTabConfig, BUILTIN_APPS, getTabIdForApp } from '../types';
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
import { RelinkWindowModal } from './RelinkWindowModal';
import { IdeasPanel } from './IdeasPanel';
import { AddIdeaModal } from './AddIdeaModal';
import { TabAddPopover } from './TabAddPopover';

function createDefaultBoard(): BoardData {
  return {
    columns: [
      { id: 'todo', title: '未着手', cardIds: [] },
      { id: 'in-progress', title: '実行中', cardIds: [] },
      { id: 'done', title: '完了', cardIds: [] },
    ],
    cards: {},
    columnOrder: ['todo', 'in-progress', 'done'],
  };
}

const initialAllBoardsData: AllBoardsData = {
  boards: {
    terminal: createDefaultBoard(),
    finder: createDefaultBoard(),
  },
  ideas: [],
};

// AllBoardsData かどうかを判定（旧形式BoardDataと区別）
function isAllBoardsData(data: unknown): data is AllBoardsData {
  return data !== null && typeof data === 'object' && 'boards' in (data as Record<string, unknown>);
}

// 旧形式 BoardData → AllBoardsData へのマイグレーション
function migrateBoardDataToAllBoards(oldData: BoardData): AllBoardsData {
  // 全タブのIDを収集（カードのtagから）
  const tabIds = new Set<string>();
  Object.values(oldData.cards).forEach(card => {
    if (card.tag) tabIds.add(card.tag);
  });
  // 最低限 terminal, finder を含める
  tabIds.add('terminal');
  tabIds.add('finder');

  const boards: Record<string, BoardData> = {};

  for (const tabId of tabIds) {
    // そのタブに属するカードのIDを収集
    const tabCardIds = new Set(
      Object.values(oldData.cards)
        .filter(card => card.tag === tabId)
        .map(card => card.id)
    );

    // タブ専用のカードオブジェクト
    const tabCards: Record<string, CardType> = {};
    for (const cardId of tabCardIds) {
      tabCards[cardId] = oldData.cards[cardId];
    }

    // カラム構成を複製し、cardIdsをこのタブのカードのみに絞る
    const tabColumns = oldData.columns.map(col => ({
      ...col,
      cardIds: col.cardIds.filter(id => tabCardIds.has(id)),
    }));

    boards[tabId] = {
      columns: tabColumns,
      cards: tabCards,
      columnOrder: [...oldData.columnOrder],
    };
  }

  return {
    boards,
    ideas: oldData.ideas || [],
  };
}

const BACKUP_INTERVAL = 60000; // 1分ごとに自動バックアップ

export function Board() {
  const [allData, setAllData] = useLocalStorage<AllBoardsData>('kanban-all-boards', initialAllBoardsData);
  const [activityLogs, setActivityLogs] = useLocalStorage<ActivityLog[]>('activity-logs', []);
  const hasMigrated = useRef(false);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [activeColumnDrag, setActiveColumnDrag] = useState<string | null>(null);
  const [modalColumnId, setModalColumnId] = useState<string | null>(null);
  const [windowSelectColumnId, setWindowSelectColumnId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [unaddedWindows, setUnaddedWindows] = useState<AppWindow[]>([]);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [activeBoard, setActiveBoard] = useState<BoardType | 'ideas'>('terminal');

  // 旧形式 kanban-data → kanban-all-boards マイグレーション（起動時1回）
  useEffect(() => {
    if (hasMigrated.current) return;
    hasMigrated.current = true;

    try {
      const oldRaw = localStorage.getItem('kanban-data');
      if (!oldRaw) return;

      const oldData = JSON.parse(oldRaw) as BoardData;
      // 旧形式の場合のみマイグレーション（columnsフィールドの有無で判定）
      if (!oldData.columns) return;

      const migrated = migrateBoardDataToAllBoards(oldData);
      setAllData(migrated);

      // 旧キーをバックアップとしてリネーム
      localStorage.setItem('kanban-data-backup', oldRaw);
      localStorage.removeItem('kanban-data');
      console.log('Migration: kanban-data → kanban-all-boards completed');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNoteSelectModal, setShowNoteSelectModal] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [settings, setSettings] = useLocalStorage<Settings>('app-settings', defaultSettings);
  const [lastBackupTime, setLastBackupTime] = useLocalStorage<number>('last-backup-time', 0);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<{ boardData: AllBoardsData; activityLogs: ActivityLog[]; settings: Settings } | null>(null);
  const hasCheckedBackup = useRef(false);
  const [showGridModal, setShowGridModal] = useState(false);
  const [windowHistory, setWindowHistory] = useLocalStorage<WindowHistory[]>('window-history', []);
  const [relinkingCard, setRelinkingCard] = useState<CardType | null>(null);
  const [brokenLinkCards, setBrokenLinkCards] = useState<CardType[]>([]);
  const [cardActions, setCardActions] = useState<PluginCardActionInfo[]>([]);
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

  // 特定のボードを更新するヘルパー（タブ間でカードを移動する場合に使用）
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

  // TabAddPopover関連のstate/refは TabAddPopover コンポーネントに分離済み
  const navTabsRef = useRef<HTMLDivElement>(null);
  const [tabsScrollState, setTabsScrollState] = useState<'none' | 'left' | 'right' | 'both'>('none');
  // 差分チェック用: 前回のウィンドウID一覧を保持
  const prevWindowIdsRef = useRef<string>('');
  const prevBrokenIdsRef = useRef<string>('');
  // ウィンドウデータキャッシュ（findMatchingWindow用）
  const cachedWindowsRef = useRef<AppWindow[]>([]);
  // 最後のチェック時刻（デバウンス用）
  const lastCheckTimeRef = useRef<number>(0);
  // checkWindowStatus の同時実行防止
  const isCheckingRef = useRef(false);
  // 連続ミスカウント（一時的な失敗でリンク切れ表示を防止）
  const missCountRef = useRef<Record<string, number>>({});
  // useRef化: コールバック内でstateの最新値を参照するため（依存配列から除外可能に）
  const allDataRef = useRef(allData);
  allDataRef.current = allData;
  const activityLogsRef = useRef(activityLogs);
  activityLogsRef.current = activityLogs;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Undo スタック（最大30件の AllBoardsData スナップショット）
  const MAX_UNDO = 30;
  const undoStackRef = useRef<AllBoardsData[]>([]);
  // 直前のデータ状態を保持（変更検出用 — 参照比較で高速化）
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

  // 有効なアプリタブ一覧 (後方互換: 未設定ならビルトインのみ)
  const enabledTabs: AppTabConfig[] = useMemo(() => {
    return settings.enabledAppTabs && settings.enabledAppTabs.length > 0
      ? settings.enabledAppTabs
      : BUILTIN_APPS;
  }, [settings.enabledAppTabs]);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // テーマを適用
  useEffect(() => {
    const theme = settings.theme || 'dark';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }, [settings.theme]);

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

  // 自動バックアップ（useRef経由で最新値を参照 → 依存配列を最小化しintervalリセットを防止）
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
  }, [setLastBackupTime]);

  // 起動時にバックアップを確認（データが空の場合）
  useEffect(() => {
    if (hasCheckedBackup.current) return;
    hasCheckedBackup.current = true;

    const checkBackup = async () => {
      if (!window.electronAPI?.loadBackup) return;

      // 全ボードのカード数を確認
      const totalCards = Object.values(allData.boards).reduce(
        (sum, board) => sum + Object.keys(board.cards).length, 0
      );
      if (totalCards > 0) return;

      try {
        const result = await window.electronAPI.loadBackup();
        if (result.success && result.data && result.data.boardData) {
          // バックアップデータを AllBoardsData に変換
          let backupAllData: AllBoardsData;
          if (isAllBoardsData(result.data.boardData)) {
            backupAllData = result.data.boardData;
          } else {
            backupAllData = migrateBoardDataToAllBoards(result.data.boardData as BoardData);
          }

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
    // 初回バックアップ（起動後5秒）
    const initialBackup = setTimeout(saveBackup, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(initialBackup);
    };
  }, [saveBackup]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // モーダルが開いている場合はショートカットを無効化
      const isModalOpen = modalColumnId || windowSelectColumnId || editingCard || showExportModal || showSettingsModal || showNoteSelectModal || showGridModal || relinkingCard || showAddIdeaModal;
      if (isModalOpen) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + , で設定モーダルを開く
      if (mod && e.key === ',') {
        e.preventDefault();
        setShowSettingsModal(true);
        return;
      }

      // Ctrl + G でGrid配置モーダルを開く
      if (mod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (activeBoard !== 'ideas') {
          setShowGridModal(true);
        }
        return;
      }

      // Cmd/Ctrl + Z でUndo
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBoard, handleUndo, modalColumnId, windowSelectColumnId, editingCard, showExportModal, showSettingsModal, showNoteSelectModal, showGridModal, relinkingCard, showAddIdeaModal]);

  // タブのスクロール状態を監視
  useEffect(() => {
    const el = navTabsRef.current;
    if (!el) return;
    const update = () => {
      const canScrollLeft = el.scrollLeft > 2;
      const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
      const overflow = el.scrollWidth > el.clientWidth;
      if (!overflow) { setTabsScrollState('none'); return; }
      if (canScrollLeft && canScrollRight) setTabsScrollState('both');
      else if (canScrollLeft) setTabsScrollState('left');
      else if (canScrollRight) setTabsScrollState('right');
      else setTabsScrollState('none');
    };
    update();
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [enabledTabs]);

  // タブを追加（ポップオーバーの状態管理は TabAddPopover 側で実施）
  const handleAddTab = useCallback((tab: AppTabConfig) => {
    setSettings(prev => {
      const current = prev.enabledAppTabs && prev.enabledAppTabs.length > 0
        ? prev.enabledAppTabs
        : [...BUILTIN_APPS];
      if (current.find(t => t.id === tab.id)) return prev;
      return { ...prev, enabledAppTabs: [...current, tab] };
    });
    // 新しいタブにデフォルトボードを作成（まだ存在しない場合）
    setAllData(prev => {
      if (prev.boards[tab.id]) return prev;
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [tab.id]: createDefaultBoard(),
        },
      };
    });
  }, [setSettings, setAllData]);

  // タブを削除
  const handleRemoveTab = useCallback((tabId: string) => {
    setSettings(prev => {
      const current = prev.enabledAppTabs && prev.enabledAppTabs.length > 0
        ? prev.enabledAppTabs
        : [...BUILTIN_APPS];
      const updated = current.filter(t => t.id !== tabId);
      return { ...prev, enabledAppTabs: updated };
    });
    // 削除したタブがアクティブならTerminalに切り替え
    if (activeBoard === tabId) {
      setActiveBoard('terminal');
    }
  }, [setSettings, activeBoard]);

  // handleAddWebTab, handleAddInstalledAppTab, handleAddCustomTab は TabAddPopover に移動済み

  // バックアップから復元
  const handleRestoreFromBackup = () => {
    if (backupToRestore) {
      setAllData(backupToRestore.boardData);
      setActivityLogs(backupToRestore.activityLogs);
      setSettings(backupToRestore.settings);
      setShowRestorePrompt(false);
      setBackupToRestore(null);
    }
  };

  // 復元をスキップ
  const handleSkipRestore = () => {
    setShowRestorePrompt(false);
    setBackupToRestore(null);
  };

  // 手動バックアップエクスポート
  const handleExportBackup = async () => {
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
  };

  // 手動バックアップインポート
  const handleImportBackup = async () => {
    if (!window.electronAPI?.importBackup) return;
    try {
      const result = await window.electronAPI.importBackup();
      if (result.success && result.data) {
        const confirmRestore = confirm(
          `バックアップを復元しますか？\n現在のデータは上書きされます。\n\nバックアップ日時: ${new Date(result.data.backupAt).toLocaleString()}`
        );
        if (confirmRestore) {
          // 旧形式のバックアップもサポート
          if (isAllBoardsData(result.data.boardData)) {
            setAllData(result.data.boardData);
          } else {
            setAllData(migrateBoardDataToAllBoards(result.data.boardData as BoardData));
          }
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
  };

  // グリッド配置モーダルを表示
  const handleOpenGridModal = () => {
    setShowGridModal(true);
  };

  // グリッド配置を実行
  const handleArrangeGrid = async (options: { cols?: number; rows?: number; displayIndex?: number; padding?: number }) => {
    if (activeBoard === 'terminal') {
      if (!window.electronAPI?.arrangeTerminalGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeTerminalGrid(options);
    } else if (activeBoard === 'finder') {
      if (!window.electronAPI?.arrangeFinderGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeFinderGrid(options);
    } else {
      // 汎用アプリ: enabledTabsからappNameを取得
      const activeTab = enabledTabs.find(t => t.id === activeBoard);
      if (!activeTab || !window.electronAPI?.arrangeGenericGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeGenericGrid(activeTab.appName, options);
    }
  };

  // エクスポートモーダルを開く
  const handleOpenExport = () => {
    setShowExportModal(true);
  };

  // ファイルに保存
  const handleSaveExport = async (content: string, filename: string) => {
    if (window.electronAPI?.exportLog) {
      await window.electronAPI.exportLog(content, filename);
    }
  };

  // Obsidianのデイリーノートに差し込み（ノート選択モーダルを表示）
  const handleObsidianExport = (content: string) => {
    if (!settings.obsidianVaultPath) {
      alert('Obsidianの設定を行ってください（設定ボタン）');
      setShowSettingsModal(true);
      return;
    }
    setExportContent(content);
    setShowExportModal(false);
    setShowNoteSelectModal(true);
  };

  // ノート差し込み成功時
  const handleNoteInsertSuccess = () => {
    alert('ノートに差し込みました');
  };

  // ウィンドウの状態をチェック（未追加ウィンドウ＆リンク切れカード）
  // 差分チェック付き: 変更がない場合はsetStateをスキップして再レンダリングを防止
  // dataRef経由で最新のcardsを参照 → 依存配列からdata.cardsを除外しintervalリセットを防止
  const checkWindowStatus = useCallback(async () => {
    if (!window.electronAPI?.getAppWindows) return;
    if (isCheckingRef.current) return; // 同時実行防止
    isCheckingRef.current = true;

    try {
      // アクティブタブのアプリ名を取得
      const activeTab = enabledTabs.find(t => t.id === activeBoard);
      if (!activeTab) return; // ideas等の場合はスキップ

      // 汎用アプリ名のリストを作成（Terminal/Finder以外）
      const genericAppNames = enabledTabs
        .filter(t => t.appName !== 'Terminal' && t.appName !== 'Finder')
        .map(t => t.appName);

      const currentWindows = await window.electronAPI.getAppWindows(
        genericAppNames.length > 0 ? genericAppNames : undefined
      );
      // キャッシュに保存（findMatchingWindow用）
      cachedWindowsRef.current = currentWindows;
      lastCheckTimeRef.current = Date.now();
      const currentWindowIds = new Set(currentWindows.map((w: AppWindow) => w.id));

      const boardId = activeBoard === 'ideas' ? 'terminal' : activeBoard;
      const board = allDataRef.current.boards[boardId] || createDefaultBoard();
      const cards = board.cards;

      // ボードに登録されているウィンドウIDを取得
      const registeredWindowIds = new Set(
        Object.values(cards)
          .filter((card) => card.windowId && !card.archived)
          .map((card) => card.windowId)
      );

      // 未登録のウィンドウをフィルタ（アクティブなボードに応じて）
      const unadded = currentWindows.filter((win: AppWindow) => {
        const isRegistered = registeredWindowIds.has(win.id);
        return !isRegistered && win.app === activeTab.appName;
      });

      // リンク切れカードをチェック（連続ミスカウントで一時的な失敗を許容）
      const potentiallyBroken = Object.values(cards).filter((card) => {
        if (!card.windowApp || card.archived) return false;
        const matchesActiveBoard =
          card.windowApp === activeTab.appName || card.tag === activeBoard;
        if (!matchesActiveBoard) return false;

        if (!card.windowId) return true;

        // ID完全一致チェック
        if (currentWindowIds.has(card.windowId)) {
          // 見つかった → ミスカウントをリセット
          missCountRef.current[card.id] = 0;
          return false;
        }

        // 名前ベースでフォールバック検索
        if (card.windowName) {
          const appWins = currentWindows.filter((w: AppWindow) => w.app === card.windowApp);
          // 完全一致
          let nameMatch = appWins.find((w: AppWindow) => w.name === card.windowName);
          // 汎用アプリ: 部分一致フォールバック（ブラウザのタブ切替でタイトル変動）
          if (!nameMatch && card.windowApp !== 'Terminal' && card.windowApp !== 'Finder') {
            nameMatch = appWins.find((w: AppWindow) =>
              w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
            );
          }
          // 汎用アプリ: ウィンドウが1つだけならマッチ
          if (!nameMatch && card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWins.length === 1) {
            nameMatch = appWins[0];
          }
          if (nameMatch) {
            // 見つかった → ミスカウントリセット & カードのwindowIdを自動更新
            missCountRef.current[card.id] = 0;
            updateCurrentBoard((prev) => ({
              ...prev,
              cards: {
                ...prev.cards,
                [card.id]: { ...prev.cards[card.id], windowId: nameMatch!.id },
              },
            }));
            return false;
          }
        }

        // 見つからない → ミスカウント増加
        missCountRef.current[card.id] = (missCountRef.current[card.id] || 0) + 1;
        return true;
      });

      // 3回以上連続でミスしたカードのみリンク切れ表示（点滅緩和）
      const broken = potentiallyBroken.filter((card) => {
        if (!card.windowId) return true; // windowId未設定は即表示
        return (missCountRef.current[card.id] || 0) >= 3;
      });

      // 差分チェック: 前回と同じならsetStateをスキップ
      const unaddedKey = unadded.map((w: AppWindow) => w.id).sort().join(',');
      const brokenKey = broken.map((c) => c.id).sort().join(',');

      if (unaddedKey !== prevWindowIdsRef.current) {
        prevWindowIdsRef.current = unaddedKey;
        setUnaddedWindows(unadded);
      }
      if (brokenKey !== prevBrokenIdsRef.current) {
        prevBrokenIdsRef.current = brokenKey;
        setBrokenLinkCards(broken);
      }
    } catch (error) {
      console.error('Failed to check window status:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [activeBoard, enabledTabs, updateCurrentBoard]);

  // タブ切替時のデバウンス用タイマー
  const checkTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedCheckWindowStatus = useCallback(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      checkWindowStatus();
    }, 300);
  }, [checkWindowStatus]);

  // 定期的にチェック（10秒間隔、非表示時はスキップ）+ フォーカス復帰時にデバウンス付きチェック
  useEffect(() => {
    checkWindowStatus(); // 初回は即時実行（キャッシュ確保のため）

    const interval = setInterval(() => {
      if (document.hidden) return; // 非表示時はスキップ
      checkWindowStatus();
    }, 10000);

    // フォーカス復帰時は3秒以上経過していればデバウンス付きチェック
    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastCheckTimeRef.current > 3000) {
        debouncedCheckWindowStatus();
      }
    };
    const handleFocus = () => {
      if (Date.now() - lastCheckTimeRef.current > 3000) {
        debouncedCheckWindowStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkWindowStatus, debouncedCheckWindowStatus]);

  // リマインダから直接ウィンドウを追加
  const handleAddFromReminder = (appWindow: AppWindow) => {
    const cardId = `card-${Date.now()}`;
    const tag: TagType = getTabIdForApp(appWindow.app, enabledTabs) || activeBoard;
    const displayName = appWindow.name.split(' — ')[0];
    const newCard: CardType = {
      id: cardId,
      title: displayName,
      description: undefined,
      tag,
      createdAt: Date.now(),
      windowApp: appWindow.app,
      windowId: appWindow.id,
      windowName: appWindow.name,
    };

    // デフォルトで「未着手」カラムに追加
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === 'todo') {
          return {
            ...col,
            cardIds: [...col.cardIds, cardId],
          };
        }
        return col;
      }),
    }));

    // 追加後にリストを更新
    checkWindowStatus();
  };

  // 未追加のウィンドウを全て追加
  const handleAddAllWindows = () => {
    if (unaddedWindows.length === 0) return;

    const newCards: Record<string, CardType> = {};
    const newCardIds: string[] = [];

    unaddedWindows.forEach((appWindow, index) => {
      const cardId = `card-${Date.now()}-${index}`;
      const tag: TagType = getTabIdForApp(appWindow.app, enabledTabs) || activeBoard;
      const displayName = appWindow.name.split(' — ')[0];
      newCards[cardId] = {
        id: cardId,
        title: displayName,
        description: undefined,
        tag,
        createdAt: Date.now(),
        windowApp: appWindow.app,
        windowId: appWindow.id,
        windowName: appWindow.name,
      };
      newCardIds.push(cardId);
    });

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        ...newCards,
      },
      columns: prev.columns.map((col) => {
        if (col.id === 'todo') {
          return {
            ...col,
            cardIds: [...col.cardIds, ...newCardIds],
          };
        }
        return col;
      }),
    }));

    checkWindowStatus();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // カラムドラッグ時はカラムターゲットのみ、カードドラッグ時はカードターゲットのみに衝突判定を限定
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = args.active.id as string;
    const isColumnDrag = activeId.startsWith('column-');

    // ドラッグ対象に応じてドロップ先を絞り込む
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

    // カラムのドラッグか判定
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

    // カラムドラッグ中はカード移動ロジックをスキップ
    if (activeId.startsWith('column-') || overId.startsWith('column-')) return;

    const activeColumnId = findColumnByCardId(activeId);
    let overColumnId = findColumnByCardId(overId);

    if (!overColumnId) {
      overColumnId = overId;
    }

    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
      return;
    }

    // カード移動をログに記録
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

      // 完了カラムに移動した場合、completedAtを記録
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

    // カラムの並べ替え
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

    // カードの並べ替え
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

  const handleAddCard = useCallback((columnId: string) => {
    setModalColumnId(columnId);
  }, []);

  const handleCreateCard = (title: string, description: string, tag: TagType, subtags?: SubTagType[]) => {
    if (!modalColumnId) return;

    const cardId = `card-${Date.now()}`;
    const newCard: CardType = {
      id: cardId,
      title,
      description: description || undefined,
      tag,
      subtags,
      createdAt: Date.now(),
    };

    // カード作成をログに記録
    addLog({
      type: 'create',
      cardTitle: title,
      cardDescription: description || undefined,
      cardTag: tag,
      toColumn: modalColumnId,
    });

    // tagが現在のタブと異なる場合は、そのタブのボードに追加
    const targetBoardId = tag || activeBoard;
    updateBoard(targetBoardId === 'ideas' ? 'terminal' : targetBoardId, (prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === modalColumnId) {
          return {
            ...col,
            cardIds: [...col.cardIds, cardId],
          };
        }
        return col;
      }),
    }));
  };

  // 新しいターミナルを開いてカードを作成
  const handleCreateCardWithNewTerminal = async (title: string, description: string, subtags?: SubTagType[]) => {
    if (!modalColumnId) return;
    if (!window.electronAPI?.openNewTerminal) return;

    // 新しいターミナルを開く
    const result = await window.electronAPI.openNewTerminal();
    if (!result.success) {
      console.error('Failed to open new terminal:', result.error);
      return;
    }

    const cardId = `card-${Date.now()}`;
    const newCard: CardType = {
      id: cardId,
      title,
      description: description || undefined,
      tag: 'terminal',
      subtags,
      createdAt: Date.now(),
      windowApp: 'Terminal',
      windowName: result.windowName,
    };

    // カード作成をログに記録
    addLog({
      type: 'create',
      cardTitle: title,
      cardDescription: description || undefined,
      cardTag: 'terminal',
      toColumn: modalColumnId,
    });

    updateBoard('terminal', (prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === modalColumnId) {
          return {
            ...col,
            cardIds: [...col.cardIds, cardId],
          };
        }
        return col;
      }),
    }));
  };

  const handleDeleteCard = useCallback((cardId: string) => {
    updateCurrentBoard((prev) => {
      const { [cardId]: _, ...remainingCards } = prev.cards;
      return {
        ...prev,
        cards: remainingCards,
        columns: prev.columns.map((col) => ({
          ...col,
          cardIds: col.cardIds.filter((id) => id !== cardId),
        })),
      };
    });
  }, [updateCurrentBoard]);

  // カードをアーカイブ
  const handleArchiveCard = useCallback((cardId: string) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          archived: true,
          archivedAt: Date.now(),
        },
      },
      columns: prev.columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((id) => id !== cardId),
      })),
    }));
  }, [updateCurrentBoard]);

  // アーカイブからカードを復元
  const handleRestoreCard = (cardId: string) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          archived: false,
          archivedAt: undefined,
        },
      },
      columns: prev.columns.map((col) => {
        if (col.id === 'done') {
          return {
            ...col,
            cardIds: [...col.cardIds, cardId],
          };
        }
        return col;
      }),
    }));
  };

  // アイデアを追加
  const handleAddIdea = (title: string, description: string, category: IdeaCategory, targetBoard?: BoardType) => {
    const newIdea: Idea = {
      id: `idea-${Date.now()}`,
      title,
      description: description || undefined,
      category,
      targetBoard,
      createdAt: Date.now(),
    };

    setAllData((prev) => ({
      ...prev,
      ideas: [...(prev.ideas || []), newIdea],
    }));
  };

  // アイデアをボードに復元
  const handleRestoreIdeaToBoard = (ideaId: string, targetBoard: BoardType) => {
    const idea = allData.ideas?.find((i) => i.id === ideaId);
    if (!idea) return;

    // カードを作成
    const cardId = `card-${Date.now()}`;
    const tag: TagType = targetBoard;
    const newCard: CardType = {
      id: cardId,
      title: idea.title,
      description: idea.description,
      tag,
      createdAt: Date.now(),
    };

    // カード作成をログに記録
    addLog({
      type: 'create',
      cardTitle: idea.title,
      cardDescription: idea.description,
      cardTag: tag,
      toColumn: 'todo',
    });

    // ターゲットボードにカードを追加 & ideasから削除
    setAllData((prev) => {
      const board = prev.boards[targetBoard] || createDefaultBoard();
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [targetBoard]: {
            ...board,
            cards: {
              ...board.cards,
              [cardId]: newCard,
            },
            columns: board.columns.map((col) => {
              if (col.id === 'todo') {
                return { ...col, cardIds: [...col.cardIds, cardId] };
              }
              return col;
            }),
          },
        },
        ideas: (prev.ideas || []).filter((i) => i.id !== ideaId),
      };
    });

    // ボードを切り替え
    setActiveBoard(targetBoard);
  };

  // アイデアを削除
  const handleDeleteIdea = (ideaId: string) => {
    setAllData((prev) => ({
      ...prev,
      ideas: (prev.ideas || []).filter((i) => i.id !== ideaId),
    }));
  };

  // カードをIdeasに送る（今じゃない）
  const handleSendToIdeas = (cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

    // カードからアイデアを作成
    const newIdea: Idea = {
      id: `idea-${Date.now()}`,
      title: card.title,
      description: card.description,
      category: 'other',  // デフォルトカテゴリ
      targetBoard: card.tag,  // 元のボードを復元先として設定
      createdAt: Date.now(),
    };

    // カードを削除してアイデアを追加
    setAllData((prev) => {
      const boardId = activeBoard === 'ideas' ? 'terminal' : activeBoard;
      const board = prev.boards[boardId] || createDefaultBoard();
      const { [cardId]: _, ...remainingCards } = board.cards;
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: {
            ...board,
            cards: remainingCards,
            columns: board.columns.map((col) => ({
              ...col,
              cardIds: col.cardIds.filter((id) => id !== cardId),
            })),
          },
        },
        ideas: [...(prev.ideas || []), newIdea],
      };
    });
  };

  // アーカイブされたカードを取得 — useMemo化
  const archivedCards = useMemo(() => {
    return Object.values(currentBoard.cards).filter((card) => card.archived);
  }, [currentBoard.cards]);

  const handleEditCard = useCallback((cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (card) {
      setEditingCard(card);
    }
  }, [currentBoard.cards]);

  const handleSaveCard = (updatedCard: CardType) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [updatedCard.id]: updatedCard,
      },
    }));
  };

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
      // 同じウィンドウIDの履歴を削除して新しいものを追加
      const filtered = prev.filter((h) => h.windowId !== card.windowId);
      // 最大20件まで保持
      const updated = [historyEntry, ...filtered].slice(0, 20);
      return updated;
    });
  }, [setWindowHistory]);

  // キャッシュからウィンドウを検索（ネットワーク取得なし、即時応答）
  const findWindowInCache = (card: CardType): AppWindow | null => {
    if (!card.windowApp || !card.windowId) return null;
    const windows = cachedWindowsRef.current;
    const appWindows = windows.filter((w: AppWindow) => w.app === card.windowApp);
    // ID完全一致
    const idMatch = appWindows.find((w: AppWindow) => w.id === card.windowId);
    if (idMatch) return idMatch;
    // 名前完全一致
    if (card.windowName) {
      const nameMatch = appWindows.find((w: AppWindow) => w.name === card.windowName);
      if (nameMatch) return nameMatch;
    }
    // 汎用アプリ: タイトルベースIDから部分一致検索
    // ブラウザ等でタブ切替するとタイトルが変わるため、元のタイトルをcontainsで検索
    if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && card.windowName) {
      const partialMatch = appWindows.find((w: AppWindow) =>
        w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
      );
      if (partialMatch) return partialMatch;
    }
    // 汎用アプリ: ウィンドウが1つしかない場合はそれにマッチ
    if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWindows.length === 1) {
      return appWindows[0];
    }
    return null;
  };

  // ウィンドウが存在するかチェック（キャッシュ優先、古い場合のみ再取得）
  const findMatchingWindow = async (card: CardType): Promise<AppWindow | null> => {
    // まずキャッシュで即時検索
    const cached = findWindowInCache(card);
    if (cached) return cached;

    // キャッシュにない場合のみ、新規取得を試みる
    if (window.electronAPI?.getAppWindows) {
      try {
        const genericAppNames = enabledTabs
          .filter(t => t.appName !== 'Terminal' && t.appName !== 'Finder')
          .map(t => t.appName);
        const windows = await window.electronAPI.getAppWindows(
          genericAppNames.length > 0 ? genericAppNames : undefined
        );
        cachedWindowsRef.current = windows;
        lastCheckTimeRef.current = Date.now();

        const appWindows = windows.filter((w: AppWindow) => w.app === card.windowApp);
        const idMatch = appWindows.find((w: AppWindow) => w.id === card.windowId);
        if (idMatch) return idMatch;
        if (card.windowName) {
          const nameMatch = appWindows.find((w: AppWindow) => w.name === card.windowName);
          if (nameMatch) return nameMatch;
          // 汎用アプリ: 部分一致フォールバック
          if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder') {
            const partialMatch = appWindows.find((w: AppWindow) =>
              w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
            );
            if (partialMatch) return partialMatch;
          }
        }
        // 汎用アプリ: ウィンドウが1つしかない場合はそれにマッチ
        if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWindows.length === 1) {
          return appWindows[0];
        }
      } catch {
        // キャッシュをフォールバックとして使用
      }
    }
    return null;
  };

  // ジャンプ中のカードに視覚フィードバック（DOM直接操作でmemo無効化を回避）
  const flashJumpingCard = (cardId: string) => {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) {
      el.classList.add('card-jumping');
      setTimeout(() => el.classList.remove('card-jumping'), 600);
    }
  };

  // ジャンプの連続クリック防止（AppleScriptプロセス積み重なり防止）
  const lastJumpTimeRef = useRef(0);

  const handleJumpToWindow = async (card: CardType) => {
    if (!card.windowApp || !card.windowId) return;
    if (!window.electronAPI?.activateWindow) return;

    // 300msクールダウン（前回のAppleScriptと競合しないように）
    const now = Date.now();
    if (now - lastJumpTimeRef.current < 300) return;
    lastJumpTimeRef.current = now;

    const anim = settings.activateAnimation || 'pop';

    // キャッシュから即時検索（AppleScript再取得をスキップして即応答）
    const cached = findWindowInCache(card);
    if (cached) {
      addToWindowHistory(card);
      flashJumpingCard(card.id);
      window.electronAPI.activateWindow(cached.app, cached.id, cached.name, anim, (cached as any).windowIndex);
      return;
    }

    // キャッシュに無い場合のみフル検索（再リンクモーダル表示判定のため）
    flashJumpingCard(card.id);
    const matchedWindow = await findMatchingWindow(card);
    if (matchedWindow) {
      addToWindowHistory(card);
      window.electronAPI.activateWindow(matchedWindow.app, matchedWindow.id, matchedWindow.name, anim, (matchedWindow as any).windowIndex);
    } else {
      setRelinkingCard(card);
    }
  };

  const handleJumpCard = async (cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (card) {
      await handleJumpToWindow(card);
    }
  };

  const handleCloseWindowCard = async (cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card?.windowApp || !card?.windowId) return;
    if (!window.electronAPI?.closeWindow) return;

    const matchedWindow = await findMatchingWindow(card);
    if (matchedWindow) {
      const result = await window.electronAPI.closeWindow(
        matchedWindow.app,
        matchedWindow.id,
        matchedWindow.name
      );
      if (result.success) {
        checkWindowStatus();
      }
    }
  };

  // カードクリック時のハンドラ（設定に応じて動作を変更）
  const handleCardClick = async (cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

    if (settings.cardClickBehavior === 'jump' && card.windowApp && card.windowName) {
      await handleJumpToWindow(card);
    } else {
      handleEditCard(cardId);
    }
  };

  // 時間をフォーマット (◯分 or ◯時間◯分)
  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}時間${remainingMinutes}分`;
    }
    return `${minutes}分`;
  };

  // 拡張チェックボックスパターン (Card.tsx と同じ)
  const VALID_MARKERS = ' xX><!?/-+RiBPCQNIpLEArcTt@OWfFH&sDd~';
  const CHECKBOX_PATTERN = new RegExp(`^- \\[([${VALID_MARKERS.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}])\\]`);

  // 日付時刻フォーマット (YYYY-MM-DD HH:MM)
  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  // タイマー行から開始時刻を解析
  const parseTimerStartTime = (timerLine: string): number | null => {
    // パターン: "  ⏱ 2026-01-26 12:34開始"
    const match = timerLine.match(/⏱\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})開始/);
    if (match) {
      const [, dateStr, hours, minutes] = match;
      const date = new Date(`${dateStr}T${hours}:${minutes}:00`);
      return date.getTime();
    }
    return null;
  };

  // プラグインカードアクションを実行
  const handleCardAction = async (cardId: string, actionId: string, taskIndex?: number) => {
    const card = currentBoard.cards[cardId];
    if (!card || !window.electronAPI?.plugins?.executeCardAction) return;

    try {
      const result = await window.electronAPI.plugins.executeCardAction(actionId, cardId, card, taskIndex);
      if (!result.success) {
        console.error('Card action failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to execute card action:', error);
    }
  };

  // タイマーアクションを処理（テキストベース・複数タイマー対応）
  const handleTimerAction = useCallback((cardId: string, taskIndex: number, action: TimerAction) => {
    const now = Date.now();

    updateCurrentBoard((prev) => {
      const card = prev.cards[cardId];
      if (!card || !card.description) return prev;

      const lines = card.description.split('\n');
      const taskLineIndices: number[] = [];

      // タスク行のインデックスを収集
      lines.forEach((line, idx) => {
        if (CHECKBOX_PATTERN.test(line)) {
          taskLineIndices.push(idx);
        }
      });

      if (taskIndex >= taskLineIndices.length) return prev;

      const targetLineIndex = taskLineIndices[taskIndex];
      // 次のタスク行のインデックス（なければ配列の最後）
      const nextTaskLineIndex = taskIndex + 1 < taskLineIndices.length
        ? taskLineIndices[taskIndex + 1]
        : lines.length;

      // タスク直後からタイマー行を探す（実行中のタイマー行を見つける）
      let runningTimerLineIndex = -1;
      for (let i = targetLineIndex + 1; i < nextTaskLineIndex; i++) {
        const trimmedLine = lines[i].trim();
        if (trimmedLine.startsWith('⏱')) {
          // 実行中のタイマー行を見つける（「開始」で終わる）
          // 完了: ⏱ 2026-01-26 12:34-2026-01-26 13:00 (26分)
          // 実行中: ⏱ 2026-01-26 12:34開始
          if (trimmedLine.endsWith('開始')) {
            runningTimerLineIndex = i;
            break;
          }
        }
      }

      let updatedLines = [...lines];

      switch (action) {
        case 'start': {
          // 開始時刻を記録（タスク直下に挿入）
          const timeStr = `  ⏱ ${formatDateTime(now)}開始`;
          if (runningTimerLineIndex >= 0) {
            // 既に実行中のタイマーがある場合は上書き
            updatedLines[runningTimerLineIndex] = timeStr;
          } else {
            // タスク直下に新しいタイマー行を挿入
            updatedLines.splice(targetLineIndex + 1, 0, timeStr);
          }
          break;
        }
        case 'pause':
        case 'stop': {
          // 実行中のタイマー行を見つけて時間を記録
          if (runningTimerLineIndex >= 0) {
            const startedAt = parseTimerStartTime(lines[runningTimerLineIndex]);
            if (startedAt) {
              const elapsed = now - startedAt;
              const timeStr = `  ⏱ ${formatDateTime(startedAt)}-${formatDateTime(now)} (${formatDuration(elapsed)})`;
              updatedLines[runningTimerLineIndex] = timeStr;
            }
          }
          break;
        }
        case 'cancel': {
          // 実行中のタイマー行を削除
          if (runningTimerLineIndex >= 0) {
            updatedLines.splice(runningTimerLineIndex, 1);
          }
          break;
        }
      }

      return {
        ...prev,
        cards: {
          ...prev.cards,
          [cardId]: {
            ...card,
            description: updatedLines.join('\n'),
          },
        },
      };
    });
  }, [updateCurrentBoard, formatDateTime, parseTimerStartTime, formatDuration, CHECKBOX_PATTERN]);

  // 再リンク: 現在のウィンドウを選択
  const handleRelinkSelectCurrent = (appWindow: AppWindow) => {
    if (!relinkingCard) return;

    // 履歴に古いウィンドウ情報を追加
    addToWindowHistory(relinkingCard);

    // カードを更新
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [relinkingCard.id]: {
          ...prev.cards[relinkingCard.id],
          windowId: appWindow.id,
          windowName: appWindow.name,
        },
      },
    }));

    setRelinkingCard(null);

    // 新しいウィンドウをアクティブ化
    if (window.electronAPI?.activateWindow) {
      window.electronAPI.activateWindow(appWindow.app, appWindow.id, appWindow.name, settings.activateAnimation || 'pop');
    }
  };

  // 再リンク: 履歴から選択
  const handleRelinkSelectHistory = async (history: WindowHistory) => {
    if (!relinkingCard) return;

    // 履歴のウィンドウが存在するかチェック
    if (window.electronAPI?.getAppWindows) {
      const windows = await window.electronAPI.getAppWindows();
      const existingWindow = windows.find((w: AppWindow) => w.id === history.windowId);

      if (existingWindow) {
        // ウィンドウが存在する場合はリンク
        updateCurrentBoard((prev) => ({
          ...prev,
          cards: {
            ...prev.cards,
            [relinkingCard.id]: {
              ...prev.cards[relinkingCard.id],
              windowId: existingWindow.id,
              windowName: existingWindow.name,
            },
          },
        }));

        setRelinkingCard(null);

        if (window.electronAPI?.activateWindow) {
          window.electronAPI.activateWindow(existingWindow.app, existingWindow.id, existingWindow.name, settings.activateAnimation || 'pop');
        }
      } else {
        alert('このウィンドウは現在存在しません');
      }
    }
  };

  // 再リンク: 新しいターミナルを開く
  const handleRelinkOpenNew = async () => {
    if (!relinkingCard || !window.electronAPI?.openNewTerminal) return;

    const result = await window.electronAPI.openNewTerminal();
    if (result.success && result.windowName) {
      // 少し待ってからウィンドウ一覧を再取得
      await new Promise(resolve => setTimeout(resolve, 500));
      const windows = await window.electronAPI.getAppWindows();
      const newWindow = windows.find(
        (w: AppWindow) => w.app === 'Terminal' && w.name.includes(result.windowName!)
      );

      if (newWindow) {
        updateCurrentBoard((prev) => ({
          ...prev,
          cards: {
            ...prev.cards,
            [relinkingCard.id]: {
              ...prev.cards[relinkingCard.id],
              windowId: newWindow.id,
              windowName: newWindow.name,
            },
          },
        }));
      }

      setRelinkingCard(null);
    }
  };

  // 再リンク: リンクを解除
  const handleRelinkUnlink = () => {
    if (!relinkingCard) return;

    // 履歴に古いウィンドウ情報を追加
    addToWindowHistory(relinkingCard);

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [relinkingCard.id]: {
          ...prev.cards[relinkingCard.id],
          windowApp: undefined,
          windowId: undefined,
          windowName: undefined,
        },
      },
    }));

    setRelinkingCard(null);
  };

  // ウィンドウリンクを解除（カードからリンク情報をクリア）
  const handleUnlinkWindow = useCallback((cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

    // 履歴に古いウィンドウ情報を追加
    addToWindowHistory(card);

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          windowApp: undefined,
          windowId: undefined,
          windowName: undefined,
        },
      },
    }));
  }, [currentBoard.cards, addToWindowHistory, updateCurrentBoard]);

  // カードの説明を更新（タスクチェック用）
  const handleUpdateDescription = useCallback((cardId: string, description: string) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          description: description || undefined,
        },
      },
    }));
  }, [updateCurrentBoard]);

  // カードのステータスマーカーを更新
  const handleUpdateStatusMarker = useCallback((cardId: string, marker: CardStatusMarker) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          statusMarker: marker === ' ' ? undefined : marker,
        },
      },
    }));
  }, [updateCurrentBoard]);

  const handleDropWindow = useCallback((columnId: string) => {
    setWindowSelectColumnId(columnId);
  }, []);

  const handleSelectWindow = (appWindow: AppWindow) => {
    if (!windowSelectColumnId) return;

    const cardId = `card-${Date.now()}`;
    const tag: TagType = getTabIdForApp(appWindow.app, enabledTabs) || activeBoard;
    // Terminalはフォルダ名だけ表示（最初の部分）
    const displayName = appWindow.name.split(' — ')[0];
    const newCard: CardType = {
      id: cardId,
      title: displayName,
      description: undefined, // パスは表示しない
      tag,
      createdAt: Date.now(),
      windowApp: appWindow.app,
      windowId: appWindow.id, // ウィンドウID（一意識別用）
      windowName: appWindow.name, // 検索用にフルネームを保持
    };

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === windowSelectColumnId) {
          return {
            ...col,
            cardIds: [...col.cardIds, cardId],
          };
        }
        return col;
      }),
    }));

    setWindowSelectColumnId(null);
  };

  // カラムごとのカード（アーカイブ済みを除外）— フィルタリング不要（各ボードに自分のカードのみ存在）
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

  // リンク切れカードのIDセット
  const brokenLinkCardIds = useMemo(() => {
    return new Set(brokenLinkCards.map((card) => card.id));
  }, [brokenLinkCards]);

  // カラム追加
  const handleAddColumn = () => {
    const id = `col-${Date.now()}`;
    updateCurrentBoard(prev => ({
      ...prev,
      columns: [...prev.columns, { id, title: '新規カラム', cardIds: [] }],
      columnOrder: [...prev.columnOrder, id],
    }));
  };

  // 基本カラム（削除不可）
  const DEFAULT_COLUMN_IDS = new Set(['todo', 'in-progress', 'done']);

  // カラム削除（基本3カラムは削除不可、カードは必ず移動先へ退避）
  const handleDeleteColumn = (columnId: string, moveToColumnId?: string) => {
    if (DEFAULT_COLUMN_IDS.has(columnId)) return; // 基本カラムは削除不可
    updateCurrentBoard(prev => {
      const col = prev.columns.find(c => c.id === columnId);
      let newColumns = prev.columns.filter(c => c.id !== columnId);
      if (col && col.cardIds.length > 0) {
        // 移動先が指定されていなければ最初のカラム（未着手）にフォールバック
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

  // カラム色変更
  const handleChangeColumnColor = useCallback((columnId: string, color: string) => {
    updateCurrentBoard(prev => ({
      ...prev,
      columns: prev.columns.map(col =>
        col.id === columnId ? { ...col, color } : col
      ),
    }));
  }, [updateCurrentBoard]);

  // カラムリネーム
  const handleRenameColumn = useCallback((columnId: string, newTitle: string) => {
    updateCurrentBoard(prev => ({
      ...prev,
      columns: prev.columns.map(col =>
        col.id === columnId ? { ...col, title: newTitle } : col
      ),
    }));
  }, [updateCurrentBoard]);

  const toggleTheme = () => {
    const newTheme = (settings.theme || 'dark') === 'dark' ? 'light' : 'dark';
    setSettings((prev) => ({ ...prev, theme: newTheme }));
  };

  return (
    <div className="board-container">
      {/* 左サイドメニュー（将来の拡張用） */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="sidebar-btn active" title="ボード">
            <svg className="sidebar-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="2" width="5" height="5" rx="1"/><rect x="2" y="11" width="5" height="5" rx="1"/><rect x="11" y="11" width="5" height="5" rx="1"/></svg>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-btn" onClick={() => setShowSettingsModal(true)} title="設定">
            <svg className="sidebar-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="9" cy="9" r="2.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/></svg>
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
          {/* タブ追加ポップオーバー（独立コンポーネント — Board再レンダリングから分離） */}
          <TabAddPopover enabledTabs={enabledTabs} onAddTab={handleAddTab} />
        </div>

        <div className="nav-section nav-right">
          {activeBoard !== 'ideas' && unaddedWindows.length > 0 && (
            <button className="nav-action pulse" onClick={handleAddAllWindows} title="未追加のウィンドウを追加">
              <span className="action-badge">+{unaddedWindows.length}</span>
            </button>
          )}
          <button className="nav-action" onClick={handleOpenGridModal} title="Grid配置">
            <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
          </button>
          <button className="nav-action" onClick={handleOpenExport} title="エクスポート">
            <svg className="action-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v9"/><path d="M4 5l4-4 4 4"/><path d="M2 11v3h12v-3"/></svg>
          </button>
          <div className="nav-divider" />
          <div className="theme-slider" onClick={toggleTheme} title="テーマ切替">
            <span className="theme-label light">☀</span>
            <div className="theme-track">
              <div className="theme-thumb" />
            </div>
            <span className="theme-label dark">☽</span>
          </div>
        </div>
      </nav>
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
              <SortableContext items={currentBoard.columns.map(col => `column-${col.id}`)} strategy={horizontalListSortingStrategy}>
              {currentBoard.columns.map((column) => (
                <Column
                  key={column.id}
                  column={column}
                  cards={filteredCardsByColumn[column.id] || []}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                  onJumpCard={handleJumpCard}
                  onCloseWindowCard={handleCloseWindowCard}
                  onUnlinkWindowCard={handleUnlinkWindow}
                  onDropWindow={handleDropWindow}
                  onUpdateDescription={handleUpdateDescription}
                  onUpdateStatusMarker={handleUpdateStatusMarker}
                  onCardClick={handleCardClick}
                  onArchiveCard={handleArchiveCard}
                  customSubtags={settings.customSubtags}
                  defaultSubtagSettings={settings.defaultSubtagSettings}
                  brokenLinkCardIds={brokenLinkCardIds}
                  cardActions={cardActions}
                  onCardAction={handleCardAction}
                  onTimerAction={handleTimerAction}
                  onRenameColumn={handleRenameColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onChangeColumnColor={handleChangeColumnColor}
                  allColumns={currentBoard.columns}
                  canDelete={!DEFAULT_COLUMN_IDS.has(column.id)}
                />
              ))}
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
            onRestore={handleRestoreCard}
            onDelete={handleDeleteCard}
            customSubtags={settings.customSubtags}
            defaultSubtagSettings={settings.defaultSubtagSettings}
          />
        </>
      ) : (
        <IdeasPanel
          ideas={allData.ideas || []}
          onAddIdea={() => setShowAddIdeaModal(true)}
          onRestoreToBoard={handleRestoreIdeaToBoard}
          onDeleteIdea={handleDeleteIdea}
        />
      )}
      {modalColumnId && (
        <AddCardModal
          onClose={() => setModalColumnId(null)}
          onAdd={handleCreateCard}
          onAddWithNewTerminal={handleCreateCardWithNewTerminal}
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
      {windowSelectColumnId && (
        <WindowSelectModal
          onClose={() => setWindowSelectColumnId(null)}
          onSelect={handleSelectWindow}
          appFilter={enabledTabs.find(t => t.id === activeBoard)?.appName || 'Terminal'}
        />
      )}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleSaveCard}
          onJump={() => handleJumpToWindow(editingCard)}
          onSendToIdeas={handleSendToIdeas}
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
        />
      )}
      {!reminderDismissed && (
        <ReminderNotification
          unaddedWindows={unaddedWindows}
          brokenLinkCards={brokenLinkCards}
          onAddWindow={handleAddFromReminder}
          onRelinkCard={(card) => setRelinkingCard(card)}
          onDismiss={() => setReminderDismissed(true)}
        />
      )}
      {showExportModal && (
        <ExportModal
          logs={activityLogs}
          allBoardsData={allData}
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
        />
      )}
      {relinkingCard && (
        <RelinkWindowModal
          card={relinkingCard}
          windowHistory={windowHistory}
          onClose={() => setRelinkingCard(null)}
          onSelectCurrent={handleRelinkSelectCurrent}
          onSelectHistory={handleRelinkSelectHistory}
          onOpenNew={handleRelinkOpenNew}
          onUnlink={handleRelinkUnlink}
        />
      )}
      {showAddIdeaModal && (
        <AddIdeaModal
          onClose={() => setShowAddIdeaModal(false)}
          onAdd={handleAddIdea}
        />
      )}
    </div>
  );
}
