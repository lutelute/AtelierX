import { useState, useCallback, useRef, useEffect } from 'react';
import { AllBoardsData, BoardType, Settings, AppTabConfig, BUILTIN_APPS } from '../types';
import { createDefaultBoard } from '../utils/boardUtils';

interface UseTabManagementParams {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setAllData: React.Dispatch<React.SetStateAction<AllBoardsData>>;
  activeBoard: BoardType | 'ideas';
  setActiveBoard: (board: BoardType | 'ideas') => void;
}

export function useTabManagement({
  settings,
  setSettings,
  setAllData,
  activeBoard,
  setActiveBoard,
}: UseTabManagementParams) {
  const navTabsRef = useRef<HTMLDivElement>(null);
  const [tabsScrollState, setTabsScrollState] = useState<'none' | 'left' | 'right' | 'both'>('none');

  const enabledTabs = settings.enabledAppTabs && settings.enabledAppTabs.length > 0
    ? settings.enabledAppTabs
    : BUILTIN_APPS;

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

  const handleAddTab = useCallback((tab: AppTabConfig) => {
    setSettings(prev => {
      const current = prev.enabledAppTabs && prev.enabledAppTabs.length > 0
        ? prev.enabledAppTabs
        : [...BUILTIN_APPS];
      if (current.find(t => t.id === tab.id)) return prev;
      return { ...prev, enabledAppTabs: [...current, tab] };
    });
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
    // Webタブ追加時にネイティブアイコンを非同期取得
    if (!tab.iconDataUri && window.electronAPI?.getAppIcon) {
      window.electronAPI.getAppIcon(tab.appName).then(iconDataUri => {
        if (iconDataUri) {
          setSettings(prev => {
            const tabs = prev.enabledAppTabs || [];
            return {
              ...prev,
              enabledAppTabs: tabs.map(t =>
                t.id === tab.id ? { ...t, iconDataUri } : t
              ),
            };
          });
        }
      }).catch(() => {});
    }
  }, [setSettings, setAllData]);

  const handleRemoveTab = useCallback((tabId: string) => {
    setSettings(prev => {
      const current = prev.enabledAppTabs && prev.enabledAppTabs.length > 0
        ? prev.enabledAppTabs
        : [...BUILTIN_APPS];
      const updated = current.filter(t => t.id !== tabId);
      return { ...prev, enabledAppTabs: updated };
    });
    if (activeBoard === tabId) {
      setActiveBoard('terminal');
    }
  }, [setSettings, activeBoard, setActiveBoard]);

  return {
    navTabsRef,
    tabsScrollState,
    enabledTabs,
    handleAddTab,
    handleRemoveTab,
  };
}
