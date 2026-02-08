import { useState, useCallback } from 'react';
import { BoardData, AllBoardsData, Card as CardType, CardStatusMarker, TagType, SubTagType, AppWindow, BoardType, ActivityLog, WindowHistory, Idea, IdeaCategory, AppTabConfig, Priority, getTabIdForApp } from '../types';
import { createDefaultBoard } from '../utils/boardUtils';

interface UseCardOperationsParams {
  activeBoard: BoardType | 'ideas';
  currentBoard: BoardData;
  enabledTabs: AppTabConfig[];
  updateCurrentBoard: (updater: (prev: BoardData) => BoardData) => void;
  updateBoard: (boardId: string, updater: (prev: BoardData) => BoardData) => void;
  setAllData: React.Dispatch<React.SetStateAction<AllBoardsData>>;
  addLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;
  addToWindowHistory: (card: CardType) => void;
  setActiveBoard: (board: BoardType | 'ideas') => void;
}

export function useCardOperations({
  activeBoard,
  currentBoard,
  enabledTabs,
  updateCurrentBoard,
  updateBoard,
  setAllData,
  addLog,
  addToWindowHistory,
  setActiveBoard,
}: UseCardOperationsParams) {
  const [modalColumnId, setModalColumnId] = useState<string | null>(null);
  const [windowSelectColumnId, setWindowSelectColumnId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [relinkingCard, setRelinkingCard] = useState<CardType | null>(null);
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false);

  const handleAddCard = useCallback((columnId: string) => {
    setModalColumnId(columnId);
  }, []);

  const handleCreateCard = useCallback((title: string, description: string, tag: TagType, subtags?: SubTagType[]) => {
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

    addLog({
      type: 'create',
      cardTitle: title,
      cardDescription: description || undefined,
      cardTag: tag,
      toColumn: modalColumnId,
    });

    const targetBoardId = tag || activeBoard;
    updateBoard(targetBoardId === 'ideas' ? 'terminal' : targetBoardId, (prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === modalColumnId) {
          return { ...col, cardIds: [...col.cardIds, cardId] };
        }
        return col;
      }),
    }));
  }, [modalColumnId, activeBoard, updateBoard, addLog]);

  const handleCreateCardWithNewTerminal = useCallback(async (title: string, description: string, subtags?: SubTagType[]) => {
    if (!modalColumnId) return;
    if (!window.electronAPI?.openNewTerminal) return;

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
          return { ...col, cardIds: [...col.cardIds, cardId] };
        }
        return col;
      }),
    }));
  }, [modalColumnId, updateBoard, addLog]);

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

  const handleRestoreCard = useCallback((cardId: string) => {
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
          return { ...col, cardIds: [...col.cardIds, cardId] };
        }
        return col;
      }),
    }));
  }, [updateCurrentBoard]);

  const handleEditCard = useCallback((cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (card) {
      setEditingCard(card);
    }
  }, [currentBoard.cards]);

  const handleSaveCard = useCallback((updatedCard: CardType) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [updatedCard.id]: updatedCard,
      },
    }));
  }, [updateCurrentBoard]);

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

  const handleUpdateComment = useCallback((cardId: string, comment: string) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          comment: comment || undefined,
        },
      },
    }));
  }, [updateCurrentBoard]);

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

  const handleUpdatePriority = useCallback((cardId: string, priority: Priority | undefined) => {
    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          priority,
        },
      },
    }));
  }, [updateCurrentBoard]);

  const handleDropWindow = useCallback((columnId: string) => {
    setWindowSelectColumnId(columnId);
  }, []);

  const handleSelectWindow = useCallback((appWindow: AppWindow) => {
    if (!windowSelectColumnId) return;

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
      windowPath: appWindow.path,
    };

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: newCard,
      },
      columns: prev.columns.map((col) => {
        if (col.id === windowSelectColumnId) {
          return { ...col, cardIds: [...col.cardIds, cardId] };
        }
        return col;
      }),
    }));

    setWindowSelectColumnId(null);
  }, [windowSelectColumnId, activeBoard, enabledTabs, updateCurrentBoard]);

  const handleUnlinkWindow = useCallback((cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

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

  const handleCardClick = useCallback(async (cardId: string, jumpToWindow: (card: CardType, setRelinkingCard: (card: CardType | null) => void) => Promise<void>, cardClickBehavior: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

    if (cardClickBehavior === 'jump' && card.windowApp && card.windowName) {
      await jumpToWindow(card, setRelinkingCard);
    } else {
      handleEditCard(cardId);
    }
  }, [currentBoard.cards, handleEditCard]);

  // アイデア操作
  const handleAddIdea = useCallback((title: string, description: string, category: IdeaCategory, targetBoard?: BoardType) => {
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
  }, [setAllData]);

  const handleRestoreIdeaToBoard = useCallback((ideaId: string, targetBoard: BoardType, ideas?: Idea[]) => {
    const idea = ideas?.find((i) => i.id === ideaId);
    if (!idea) return;

    const cardId = `card-${Date.now()}`;
    const tag: TagType = targetBoard;
    const newCard: CardType = {
      id: cardId,
      title: idea.title,
      description: idea.description,
      tag,
      createdAt: Date.now(),
    };

    addLog({
      type: 'create',
      cardTitle: idea.title,
      cardDescription: idea.description,
      cardTag: tag,
      toColumn: 'todo',
    });

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

    setActiveBoard(targetBoard);
  }, [setAllData, addLog, setActiveBoard]);

  const handleDeleteIdea = useCallback((ideaId: string) => {
    setAllData((prev) => ({
      ...prev,
      ideas: (prev.ideas || []).filter((i) => i.id !== ideaId),
    }));
  }, [setAllData]);

  const handleSendToIdeas = useCallback((cardId: string) => {
    const card = currentBoard.cards[cardId];
    if (!card) return;

    const newIdea: Idea = {
      id: `idea-${Date.now()}`,
      title: card.title,
      description: card.description,
      category: 'other',
      targetBoard: card.tag,
      createdAt: Date.now(),
    };

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
  }, [currentBoard.cards, activeBoard, setAllData]);

  // 再リンク操作
  const handleRelinkSelectCurrent = useCallback((appWindow: AppWindow) => {
    if (!relinkingCard) return;

    addToWindowHistory(relinkingCard);

    updateCurrentBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [relinkingCard.id]: {
          ...prev.cards[relinkingCard.id],
          windowId: appWindow.id,
          windowName: appWindow.name,
          windowPath: appWindow.path,
        },
      },
    }));

    setRelinkingCard(null);

    if (window.electronAPI?.activateWindow) {
      window.electronAPI.activateWindow(appWindow.app, appWindow.id, appWindow.name);
    }
  }, [relinkingCard, addToWindowHistory, updateCurrentBoard]);

  const handleRelinkSelectHistory = useCallback(async (history: WindowHistory) => {
    if (!relinkingCard) return;

    if (window.electronAPI?.getAppWindows) {
      const windows = await window.electronAPI.getAppWindows();
      const existingWindow = windows.find((w: AppWindow) => w.id === history.windowId);

      if (existingWindow) {
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
          window.electronAPI.activateWindow(existingWindow.app, existingWindow.id, existingWindow.name);
        }
      } else {
        alert('このウィンドウは現在存在しません');
      }
    }
  }, [relinkingCard, updateCurrentBoard]);

  const handleRelinkOpenNew = useCallback(async () => {
    if (!relinkingCard || !window.electronAPI?.openNewTerminal) return;

    const result = await window.electronAPI.openNewTerminal();
    if (result.success && result.windowName) {
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
  }, [relinkingCard, updateCurrentBoard]);

  const handleRelinkUnlink = useCallback(() => {
    if (!relinkingCard) return;

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
  }, [relinkingCard, addToWindowHistory, updateCurrentBoard]);

  return {
    modalColumnId,
    setModalColumnId,
    windowSelectColumnId,
    setWindowSelectColumnId,
    editingCard,
    setEditingCard,
    relinkingCard,
    setRelinkingCard,
    showAddIdeaModal,
    setShowAddIdeaModal,
    handleAddCard,
    handleCreateCard,
    handleCreateCardWithNewTerminal,
    handleDeleteCard,
    handleArchiveCard,
    handleRestoreCard,
    handleEditCard,
    handleSaveCard,
    handleUpdateDescription,
    handleUpdateComment,
    handleUpdateStatusMarker,
    handleUpdatePriority,
    handleDropWindow,
    handleSelectWindow,
    handleUnlinkWindow,
    handleCardClick,
    handleAddIdea,
    handleRestoreIdeaToBoard,
    handleDeleteIdea,
    handleSendToIdeas,
    handleRelinkSelectCurrent,
    handleRelinkSelectHistory,
    handleRelinkOpenNew,
    handleRelinkUnlink,
  };
}
