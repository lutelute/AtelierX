import { useState, useCallback, useRef, useEffect } from 'react';
import { BoardData, AllBoardsData, Card as CardType, AppWindow, AppTabConfig, TagType, BoardType, getTabIdForApp } from '../types';
import { createDefaultBoard } from '../utils/boardUtils';

interface UseWindowStatusParams {
  activeBoard: BoardType | 'ideas';
  enabledTabs: AppTabConfig[];
  allDataRef: React.MutableRefObject<AllBoardsData>;
  updateCurrentBoard: (updater: (prev: BoardData) => BoardData) => void;
  settings: { activateAnimation?: string };
  addToWindowHistory: (card: CardType) => void;
}

export function useWindowStatus({
  activeBoard,
  enabledTabs,
  allDataRef,
  updateCurrentBoard,
  settings,
  addToWindowHistory,
}: UseWindowStatusParams) {
  const [unaddedWindows, setUnaddedWindows] = useState<AppWindow[]>([]);
  const [brokenLinkCards, setBrokenLinkCards] = useState<CardType[]>([]);

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
  // ジャンプの連続クリック防止（AppleScriptプロセス積み重なり防止）
  const lastJumpTimeRef = useRef(0);

  // ウィンドウの状態をチェック（未追加ウィンドウ＆リンク切れカード）
  const checkWindowStatus = useCallback(async () => {
    if (!window.electronAPI?.getAppWindows) return;
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const activeTab = enabledTabs.find(t => t.id === activeBoard);
      if (!activeTab) return;

      const genericAppNames = enabledTabs
        .filter(t => t.appName !== 'Terminal' && t.appName !== 'Finder')
        .map(t => t.appName);

      const currentWindows = await window.electronAPI.getAppWindows(
        genericAppNames.length > 0 ? genericAppNames : undefined
      );
      cachedWindowsRef.current = currentWindows;
      lastCheckTimeRef.current = Date.now();
      const currentWindowIds = new Set(currentWindows.map((w: AppWindow) => w.id));

      const boardId = activeBoard === 'ideas' ? 'terminal' : activeBoard;
      const board = allDataRef.current.boards[boardId] || createDefaultBoard();
      const cards = board.cards;

      const registeredWindowIds = new Set(
        Object.values(cards)
          .filter((card) => card.windowId && !card.archived)
          .map((card) => card.windowId)
      );

      const unadded = currentWindows.filter((win: AppWindow) => {
        const isRegistered = registeredWindowIds.has(win.id);
        return !isRegistered && win.app === activeTab.appName;
      });

      const potentiallyBroken = Object.values(cards).filter((card) => {
        if (!card.windowApp || card.archived) return false;
        const matchesActiveBoard =
          card.windowApp === activeTab.appName || card.tag === activeBoard;
        if (!matchesActiveBoard) return false;

        if (!card.windowId) return true;

        if (currentWindowIds.has(card.windowId)) {
          missCountRef.current[card.id] = 0;
          if (card.windowApp === 'Finder') {
            const matchedWin = currentWindows.find((w: AppWindow) => w.id === card.windowId);
            if (matchedWin && (matchedWin.name !== card.windowName || matchedWin.path !== card.windowPath)) {
              updateCurrentBoard((prev) => ({
                ...prev,
                cards: {
                  ...prev.cards,
                  [card.id]: {
                    ...prev.cards[card.id],
                    windowName: matchedWin.name,
                    ...(matchedWin.path ? { windowPath: matchedWin.path } : {}),
                  },
                },
              }));
            }
          }
          return false;
        }

        {
          const appWins = currentWindows.filter((w: AppWindow) => w.app === card.windowApp);
          let nameMatch: AppWindow | undefined;
          if (card.windowName) {
            nameMatch = appWins.find((w: AppWindow) => w.name === card.windowName);
          }
          if (!nameMatch && card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && card.windowName) {
            nameMatch = appWins.find((w: AppWindow) =>
              w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
            );
          }
          if (!nameMatch && card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWins.length === 1) {
            nameMatch = appWins[0];
          }
          if (!nameMatch && card.windowApp === 'Finder' && card.windowPath) {
            nameMatch = appWins.find((w: AppWindow) => w.path && w.path === card.windowPath);
          }
          if (!nameMatch && card.windowApp === 'Finder' && appWins.length === 1) {
            nameMatch = appWins[0];
          }
          if (nameMatch) {
            missCountRef.current[card.id] = 0;
            updateCurrentBoard((prev) => ({
              ...prev,
              cards: {
                ...prev.cards,
                [card.id]: {
                  ...prev.cards[card.id],
                  windowId: nameMatch!.id,
                  windowName: nameMatch!.name,
                  ...(nameMatch!.path ? { windowPath: nameMatch!.path } : {}),
                },
              },
            }));
            return false;
          }
        }

        missCountRef.current[card.id] = (missCountRef.current[card.id] || 0) + 1;
        return true;
      });

      const broken = potentiallyBroken.filter((card) => {
        if (!card.windowId) return true;
        return (missCountRef.current[card.id] || 0) >= 3;
      });

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
  }, [activeBoard, enabledTabs, updateCurrentBoard, allDataRef]);

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
    checkWindowStatus();

    const interval = setInterval(() => {
      if (document.hidden) return;
      checkWindowStatus();
    }, 10000);

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

  // キャッシュからウィンドウを検索（ネットワーク取得なし、即時応答）
  const findWindowInCache = useCallback((card: CardType): AppWindow | null => {
    if (!card.windowApp || !card.windowId) return null;
    const windows = cachedWindowsRef.current;
    const appWindows = windows.filter((w: AppWindow) => w.app === card.windowApp);
    const idMatch = appWindows.find((w: AppWindow) => w.id === card.windowId);
    if (idMatch) return idMatch;
    if (card.windowName) {
      const nameMatch = appWindows.find((w: AppWindow) => w.name === card.windowName);
      if (nameMatch) return nameMatch;
    }
    if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && card.windowName) {
      const partialMatch = appWindows.find((w: AppWindow) =>
        w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
      );
      if (partialMatch) return partialMatch;
    }
    if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWindows.length === 1) {
      return appWindows[0];
    }
    if (card.windowApp === 'Finder' && card.windowPath) {
      const pathMatch = appWindows.find((w: AppWindow) => w.path && w.path === card.windowPath);
      if (pathMatch) return pathMatch;
    }
    if (card.windowApp === 'Finder' && appWindows.length === 1) {
      return appWindows[0];
    }
    return null;
  }, []);

  // ウィンドウが存在するかチェック（キャッシュ優先、古い場合のみ再取得）
  const findMatchingWindow = useCallback(async (card: CardType): Promise<AppWindow | null> => {
    const cached = findWindowInCache(card);
    if (cached) return cached;

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
          if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder') {
            const partialMatch = appWindows.find((w: AppWindow) =>
              w.name.includes(card.windowName!) || card.windowName!.includes(w.name)
            );
            if (partialMatch) return partialMatch;
          }
        }
        if (card.windowApp !== 'Terminal' && card.windowApp !== 'Finder' && appWindows.length === 1) {
          return appWindows[0];
        }
        if (card.windowApp === 'Finder' && card.windowPath) {
          const pathMatch = appWindows.find((w: AppWindow) => w.path && w.path === card.windowPath);
          if (pathMatch) return pathMatch;
        }
        if (card.windowApp === 'Finder' && appWindows.length === 1) {
          return appWindows[0];
        }
      } catch {
        // キャッシュをフォールバックとして使用
      }
    }
    return null;
  }, [findWindowInCache, enabledTabs]);

  // ジャンプ中のカードに視覚フィードバック
  const flashJumpingCard = useCallback((cardId: string) => {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) {
      el.classList.add('card-jumping');
      setTimeout(() => el.classList.remove('card-jumping'), 600);
    }
  }, []);

  // ウィンドウへジャンプ
  const handleJumpToWindow = useCallback(async (card: CardType, setRelinkingCard: (card: CardType | null) => void) => {
    if (!card.windowApp || !card.windowId) return;
    if (!window.electronAPI?.activateWindow) return;

    const now = Date.now();
    if (now - lastJumpTimeRef.current < 300) return;
    lastJumpTimeRef.current = now;

    const anim = settings.activateAnimation || 'pop';

    const cached = findWindowInCache(card);
    if (cached) {
      addToWindowHistory(card);
      flashJumpingCard(card.id);
      if (card.windowApp === 'Finder' && (cached.id !== card.windowId || cached.name !== card.windowName)) {
        updateCurrentBoard((prev) => ({
          ...prev,
          cards: {
            ...prev.cards,
            [card.id]: { ...prev.cards[card.id], windowId: cached.id, windowName: cached.name },
          },
        }));
      }
      window.electronAPI.activateWindow(cached.app, cached.id, cached.name, anim, (cached as any).windowIndex);
      return;
    }

    flashJumpingCard(card.id);
    const matchedWindow = await findMatchingWindow(card);
    if (matchedWindow) {
      addToWindowHistory(card);
      if (card.windowApp === 'Finder' && (matchedWindow.id !== card.windowId || matchedWindow.name !== card.windowName)) {
        updateCurrentBoard((prev) => ({
          ...prev,
          cards: {
            ...prev.cards,
            [card.id]: { ...prev.cards[card.id], windowId: matchedWindow.id, windowName: matchedWindow.name },
          },
        }));
      }
      window.electronAPI.activateWindow(matchedWindow.app, matchedWindow.id, matchedWindow.name, anim, (matchedWindow as any).windowIndex);
    } else {
      setRelinkingCard(card);
    }
  }, [findWindowInCache, findMatchingWindow, addToWindowHistory, flashJumpingCard, updateCurrentBoard, settings.activateAnimation]);

  // ウィンドウを閉じる
  const handleCloseWindowCard = useCallback(async (card: CardType) => {
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
  }, [findMatchingWindow, checkWindowStatus]);

  // リマインダから直接ウィンドウを追加
  const handleAddFromReminder = useCallback((appWindow: AppWindow) => {
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
        if (col.id === 'todo') {
          return { ...col, cardIds: [...col.cardIds, cardId] };
        }
        return col;
      }),
    }));

    checkWindowStatus();
  }, [activeBoard, enabledTabs, updateCurrentBoard, checkWindowStatus]);

  // 未追加のウィンドウを全て追加
  const handleAddAllWindows = useCallback(() => {
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
        windowPath: appWindow.path,
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
          return { ...col, cardIds: [...col.cardIds, ...newCardIds] };
        }
        return col;
      }),
    }));

    checkWindowStatus();
  }, [unaddedWindows, activeBoard, enabledTabs, updateCurrentBoard, checkWindowStatus]);

  return {
    unaddedWindows,
    brokenLinkCards,
    checkWindowStatus,
    findMatchingWindow,
    handleJumpToWindow,
    handleCloseWindowCard,
    handleAddFromReminder,
    handleAddAllWindows,
  };
}
