import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { BoardData, Card as CardType, TagType, SubTagType, AppWindow, BoardType, ActivityLog, Settings } from '../types';
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

const initialData: BoardData = {
  columns: [
    { id: 'todo', title: '未着手', cardIds: [] },
    { id: 'in-progress', title: '実行中', cardIds: [] },
    { id: 'done', title: '完了', cardIds: [] },
  ],
  cards: {},
  columnOrder: ['todo', 'in-progress', 'done'],
};

const REMINDER_INTERVAL = 30000; // 30秒ごとにチェック
const BACKUP_INTERVAL = 60000; // 1分ごとに自動バックアップ

export function Board() {
  const [data, setData] = useLocalStorage<BoardData>('kanban-data', initialData);
  const [activityLogs, setActivityLogs] = useLocalStorage<ActivityLog[]>('activity-logs', []);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [modalColumnId, setModalColumnId] = useState<string | null>(null);
  const [windowSelectColumnId, setWindowSelectColumnId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [unaddedWindows, setUnaddedWindows] = useState<AppWindow[]>([]);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [activeBoard, setActiveBoard] = useState<BoardType>('terminal');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNoteSelectModal, setShowNoteSelectModal] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [settings, setSettings] = useLocalStorage<Settings>('app-settings', defaultSettings);
  const [lastBackupTime, setLastBackupTime] = useLocalStorage<number>('last-backup-time', 0);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<{ boardData: BoardData; activityLogs: ActivityLog[]; settings: Settings } | null>(null);
  const hasCheckedBackup = useRef(false);
  const [showGridModal, setShowGridModal] = useState(false);

  // アクティビティログを追加
  const addLog = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const newLog: ActivityLog = {
      ...log,
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
    };
    setActivityLogs((prev) => [...prev, newLog]);
  }, [setActivityLogs]);

  // 自動バックアップ
  const saveBackup = useCallback(async () => {
    if (!window.electronAPI?.saveBackup) return;
    try {
      const result = await window.electronAPI.saveBackup({
        boardData: data,
        activityLogs,
        settings,
      });
      if (result.success && result.timestamp) {
        setLastBackupTime(result.timestamp);
        console.log('Auto backup saved:', new Date(result.timestamp).toLocaleString());
      }
    } catch (error) {
      console.error('Backup failed:', error);
    }
  }, [data, activityLogs, settings, setLastBackupTime]);

  // 起動時にバックアップを確認（データが空の場合）
  useEffect(() => {
    if (hasCheckedBackup.current) return;
    hasCheckedBackup.current = true;

    const checkBackup = async () => {
      if (!window.electronAPI?.loadBackup) return;

      // ローカルストレージにカードがない場合のみ復元を提案
      const hasCards = Object.keys(data.cards).length > 0;
      if (hasCards) return;

      try {
        const result = await window.electronAPI.loadBackup();
        if (result.success && result.data && result.data.boardData) {
          const backupHasCards = Object.keys(result.data.boardData.cards).length > 0;
          if (backupHasCards) {
            setBackupToRestore({
              boardData: result.data.boardData,
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
  }, [data.cards]);

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
      // Cmd/Ctrl + , で設定モーダルを開く
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettingsModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // バックアップから復元
  const handleRestoreFromBackup = () => {
    if (backupToRestore) {
      setData(backupToRestore.boardData);
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
        boardData: data,
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
          setData(result.data.boardData);
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
    } else {
      if (!window.electronAPI?.arrangeFinderGrid) return { success: false, arranged: 0 };
      return await window.electronAPI.arrangeFinderGrid(options);
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

  // ボードに登録されていないウィンドウをチェック
  const checkUnaddedWindows = useCallback(async () => {
    if (!window.electronAPI?.getAppWindows) return;

    try {
      const currentWindows = await window.electronAPI.getAppWindows();

      // ボードに登録されているウィンドウ名を取得
      const registeredWindowNames = new Set(
        Object.values(data.cards)
          .filter((card) => card.windowName)
          .map((card) => card.windowName?.split(' — ')[0])
      );

      // 未登録のウィンドウをフィルタ（アクティブなボードに応じて）
      const unadded = currentWindows.filter((win: AppWindow) => {
        const shortName = win.name.split(' — ')[0];
        const isRegistered = registeredWindowNames.has(shortName);
        const matchesActiveBoard = activeBoard === 'terminal'
          ? win.app === 'Terminal'
          : win.app === 'Finder';
        return !isRegistered && matchesActiveBoard;
      });

      setUnaddedWindows(unadded);
    } catch (error) {
      console.error('Failed to check unadded windows:', error);
    }
  }, [data.cards, activeBoard]);

  // 定期的にチェック
  useEffect(() => {
    checkUnaddedWindows();
    const interval = setInterval(checkUnaddedWindows, REMINDER_INTERVAL);
    return () => clearInterval(interval);
  }, [checkUnaddedWindows]);

  // リマインダから直接ウィンドウを追加
  const handleAddFromReminder = (appWindow: AppWindow) => {
    const cardId = `card-${Date.now()}`;
    const tag: TagType = appWindow.app === 'Terminal' ? 'terminal' : 'finder';
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
    setData((prev) => ({
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
    checkUnaddedWindows();
  };

  // 未追加のウィンドウを全て追加
  const handleAddAllWindows = () => {
    if (unaddedWindows.length === 0) return;

    const newCards: Record<string, CardType> = {};
    const newCardIds: string[] = [];

    unaddedWindows.forEach((appWindow, index) => {
      const cardId = `card-${Date.now()}-${index}`;
      const tag: TagType = appWindow.app === 'Terminal' ? 'terminal' : 'finder';
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

    setData((prev) => ({
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

    checkUnaddedWindows();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const findColumnByCardId = (cardId: string): string | undefined => {
    return data.columns.find((col) => col.cardIds.includes(cardId))?.id;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = data.cards[active.id as string];
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumnId = findColumnByCardId(activeId);
    let overColumnId = findColumnByCardId(overId);

    if (!overColumnId) {
      overColumnId = overId;
    }

    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
      return;
    }

    // カード移動をログに記録
    const card = data.cards[activeId];
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

    setData((prev) => {
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

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumnId = findColumnByCardId(activeId);
    const overColumnId = findColumnByCardId(overId) || overId;

    if (!activeColumnId) return;

    if (activeColumnId === overColumnId) {
      const column = data.columns.find((col) => col.id === activeColumnId);
      if (!column) return;

      const oldIndex = column.cardIds.indexOf(activeId);
      const newIndex = column.cardIds.indexOf(overId);

      if (oldIndex !== newIndex && newIndex >= 0) {
        setData((prev) => ({
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

  const handleAddCard = (columnId: string) => {
    setModalColumnId(columnId);
  };

  const handleCreateCard = (title: string, description: string, tag: TagType, subtag?: SubTagType) => {
    if (!modalColumnId) return;

    const cardId = `card-${Date.now()}`;
    const newCard: CardType = {
      id: cardId,
      title,
      description: description || undefined,
      tag,
      subtag,
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

    setData((prev) => ({
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
  const handleCreateCardWithNewTerminal = async (title: string, description: string, subtag?: SubTagType) => {
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
      subtag,
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

    setData((prev) => ({
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

  const handleDeleteCard = (cardId: string) => {
    setData((prev) => {
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
  };

  // カードをアーカイブ
  const handleArchiveCard = (cardId: string) => {
    setData((prev) => ({
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
  };

  // アーカイブからカードを復元
  const handleRestoreCard = (cardId: string) => {
    setData((prev) => ({
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

  // アーカイブされたカードを取得
  const getArchivedCards = () => {
    return Object.values(data.cards).filter((card) => {
      if (!card.archived) return false;
      if (activeBoard === 'terminal') {
        return card.tag === 'terminal' || card.windowApp === 'Terminal';
      } else {
        return card.tag === 'finder' || card.windowApp === 'Finder';
      }
    });
  };

  const handleEditCard = (cardId: string) => {
    const card = data.cards[cardId];
    if (card) {
      setEditingCard(card);
    }
  };

  const handleSaveCard = (updatedCard: CardType) => {
    setData((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [updatedCard.id]: updatedCard,
      },
    }));
  };

  const handleJumpToWindow = (card: CardType) => {
    if (card.windowApp && (card.windowId || card.windowName) && window.electronAPI?.activateWindow) {
      // awaitせずに実行（Electronに戻らないようにする）
      window.electronAPI.activateWindow(card.windowApp, card.windowId || card.windowName!, card.windowName);
    }
  };

  const handleJumpCard = (cardId: string) => {
    const card = data.cards[cardId];
    if (card) {
      handleJumpToWindow(card);
    }
  };

  // カードクリック時のハンドラ（設定に応じて動作を変更）
  const handleCardClick = (cardId: string) => {
    const card = data.cards[cardId];
    if (!card) return;

    if (settings.cardClickBehavior === 'jump' && card.windowApp && card.windowName) {
      handleJumpToWindow(card);
    } else {
      handleEditCard(cardId);
    }
  };

  // カードの説明を更新（タスクチェック用）
  const handleUpdateDescription = (cardId: string, description: string) => {
    setData((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          description: description || undefined,
        },
      },
    }));
  };

  const handleDropWindow = (columnId: string) => {
    setWindowSelectColumnId(columnId);
  };

  const handleSelectWindow = (appWindow: AppWindow) => {
    if (!windowSelectColumnId) return;

    const cardId = `card-${Date.now()}`;
    const tag: TagType = appWindow.app === 'Terminal' ? 'terminal' : 'finder';
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

    setData((prev) => ({
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

  // アクティブなボードに応じてカードをフィルタリング（アーカイブ済みを除外）
  const getFilteredCards = (cardIds: string[]) => {
    return cardIds
      .map((id) => data.cards[id])
      .filter((card) => {
        if (!card || card.archived) return false;
        if (activeBoard === 'terminal') {
          return card.tag === 'terminal' || card.windowApp === 'Terminal';
        } else {
          return card.tag === 'finder' || card.windowApp === 'Finder';
        }
      });
  };

  return (
    <div className="board-container">
      <header className="board-header">
        <h1>Window Board</h1>
        <div className="board-tabs">
          <button
            className={`board-tab ${activeBoard === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveBoard('terminal')}
          >
            Terminal
          </button>
          <button
            className={`board-tab ${activeBoard === 'finder' ? 'active' : ''}`}
            onClick={() => setActiveBoard('finder')}
          >
            Finder
          </button>
        </div>
        <div className="header-actions">
          {unaddedWindows.length > 0 && (
            <button className="add-all-btn" onClick={handleAddAllWindows}>
              全て追加 ({unaddedWindows.length})
            </button>
          )}
          <button className="grid-btn" onClick={handleOpenGridModal} title="ウィンドウをグリッド配置">
            Grid
          </button>
          <button className="export-btn" onClick={handleOpenExport}>
            日報エクスポート
          </button>
          <button className="settings-btn" onClick={() => setShowSettingsModal(true)}>
            設定
          </button>
        </div>
      </header>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {data.columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={getFilteredCards(column.cardIds)}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onEditCard={handleEditCard}
              onJumpCard={handleJumpCard}
              onDropWindow={handleDropWindow}
              onUpdateDescription={handleUpdateDescription}
              onCardClick={handleCardClick}
              onArchiveCard={handleArchiveCard}
              customSubtags={settings.customSubtags}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <Card card={activeCard} onDelete={() => {}} onEdit={() => {}} />
          ) : null}
        </DragOverlay>
      </DndContext>
      <ArchiveSection
        cards={getArchivedCards()}
        onRestore={handleRestoreCard}
        onDelete={handleDeleteCard}
      />
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
        />
      )}
      {windowSelectColumnId && (
        <WindowSelectModal
          onClose={() => setWindowSelectColumnId(null)}
          onSelect={handleSelectWindow}
          appFilter={activeBoard === 'terminal' ? 'Terminal' : 'Finder'}
        />
      )}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleSaveCard}
          onJump={() => handleJumpToWindow(editingCard)}
          customSubtags={settings.customSubtags}
          onAddSubtag={(newSubtag) => {
            setSettings((prev) => ({
              ...prev,
              customSubtags: [...(prev.customSubtags || []), newSubtag],
            }));
          }}
        />
      )}
      {!reminderDismissed && (
        <ReminderNotification
          unaddedWindows={unaddedWindows}
          onAddWindow={handleAddFromReminder}
          onDismiss={() => setReminderDismissed(true)}
        />
      )}
      {showExportModal && (
        <ExportModal
          logs={activityLogs}
          boardData={data}
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
              <p>カード数: {Object.keys(backupToRestore.boardData.cards).length}</p>
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
          appType={activeBoard === 'terminal' ? 'Terminal' : 'Finder'}
          onClose={() => setShowGridModal(false)}
          onArrange={handleArrangeGrid}
        />
      )}
    </div>
  );
}
