import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { AppTabConfig, BROWSER_APPS, WEB_TAB_TEMPLATE, InstalledAppInfo, shortenAppName } from '../types';

interface TabAddPopoverProps {
  enabledTabs: AppTabConfig[];
  onAddTab: (tab: AppTabConfig) => void;
}

export const TabAddPopover = memo(function TabAddPopover({ enabledTabs, onAddTab }: TabAddPopoverProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [showBrowserSelect, setShowBrowserSelect] = useState(false);
  const [customAppName, setCustomAppName] = useState('');
  const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const appsLoadedRef = useRef(false);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!showPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowPopover(false);
        setShowBrowserSelect(false);
        setCustomAppName('');
        setAppSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  // ポップオーバーが開いたらインストール済みアプリをバックグラウンドロード（1回のみ）
  useEffect(() => {
    if (!showPopover || appsLoadedRef.current) return;
    const loadApps = async () => {
      if (!window.electronAPI?.scanInstalledApps) return;
      setIsLoading(true);
      try {
        const apps = await window.electronAPI.scanInstalledApps();
        setInstalledApps(apps || []);
        appsLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load installed apps:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadApps();
  }, [showPopover]);

  // Web タブ追加
  const handleAddWebTab = useCallback((browserAppName: string) => {
    const webTab: AppTabConfig = {
      ...WEB_TAB_TEMPLATE,
      appName: browserAppName,
    };
    onAddTab(webTab);
    setShowPopover(false);
    setShowBrowserSelect(false);
  }, [onAddTab]);

  // インストール済みアプリをタブとして追加
  const handleAddInstalledAppTab = useCallback((app: InstalledAppInfo) => {
    const id = `app-${app.appName.toLowerCase().replace(/\s+/g, '-')}`;
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6b7280'];
    const tab: AppTabConfig = {
      id,
      appName: app.appName,
      displayName: shortenAppName(app.appName),
      icon: '🪟',
      iconDataUri: app.iconDataUri || undefined,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: 'custom',
    };
    onAddTab(tab);
    setAppSearch('');
    setShowPopover(false);
  }, [onAddTab]);

  // カスタムアプリタブ追加
  const handleAddCustomTab = useCallback(() => {
    if (!customAppName.trim()) return;
    const name = customAppName.trim();
    const id = `custom-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const tab: AppTabConfig = {
      id,
      appName: name,
      displayName: name,
      icon: '🪟',
      color: '#6b7280',
      type: 'custom',
    };
    onAddTab(tab);
    setCustomAppName('');
    setShowPopover(false);
  }, [customAppName, onAddTab]);

  // 検索2文字以上でフィルタ表示
  const showAppList = appSearch.length >= 2;
  const filteredApps = showAppList
    ? installedApps
        .filter(app => app.appName.toLowerCase().includes(appSearch.toLowerCase()))
        .slice(0, 20)
    : [];

  return (
    <div className="tab-add-wrapper" ref={wrapperRef}>
      <button
        className="nav-tab tab-add-btn"
        onClick={() => setShowPopover(!showPopover)}
        title="アプリタブを追加"
      >
        <span className="tab-icon">+</span>
      </button>
      {showPopover && (
        <div className="tab-add-popover" onPointerDown={(e) => e.stopPropagation()}>
          {!showBrowserSelect ? (
            <>
              <div className="popover-section">
                <div className="popover-label">アプリを追加</div>
                {/* Web (ブラウザ) */}
                {!enabledTabs.find(t => t.id === 'web') && (
                  <button
                    className="popover-item popover-item-web"
                    onClick={() => setShowBrowserSelect(true)}
                  >
                    <span className="popover-icon">🌐</span>
                    <span>Web (ブラウザ)</span>
                  </button>
                )}
                {/* インストール済みアプリ検索 */}
                <input
                  type="text"
                  className="popover-app-search"
                  placeholder="アプリ名を入力して検索..."
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                />
                <div className="popover-app-list">
                  {!showAppList ? (
                    <div className="popover-app-hint">2文字以上で検索</div>
                  ) : isLoading ? (
                    <div className="popover-app-loading">スキャン中...</div>
                  ) : filteredApps.length === 0 ? (
                    <div className="popover-app-hint">該当なし</div>
                  ) : (
                    filteredApps.map(app => {
                      const added = enabledTabs.some(t => t.appName === app.appName);
                      return (
                        <button
                          key={app.path}
                          className={`popover-item ${added ? 'popover-item-disabled' : ''}`}
                          onClick={() => !added && handleAddInstalledAppTab(app)}
                          disabled={added}
                        >
                          {app.iconDataUri ? (
                            <img src={app.iconDataUri} className="popover-icon-img" alt={app.appName} />
                          ) : (
                            <span className="popover-icon">🪟</span>
                          )}
                          <span>{app.appName}</span>
                          {added && <span className="popover-item-badge">追加済</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="popover-divider" />
              <div className="popover-section">
                <div className="popover-label">カスタム</div>
                <div className="popover-custom-form">
                  <input
                    type="text"
                    className="popover-custom-input"
                    placeholder="macOSアプリ名"
                    value={customAppName}
                    onChange={(e) => setCustomAppName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTab();
                      }
                    }}
                  />
                  <button
                    className="popover-custom-add"
                    onClick={handleAddCustomTab}
                    disabled={!customAppName.trim()}
                  >
                    追加
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="popover-section">
              <div className="popover-label">
                <button className="popover-back" onClick={() => setShowBrowserSelect(false)}>←</button>
                ブラウザを選択
              </div>
              {BROWSER_APPS.map(browser => (
                <button
                  key={browser.id}
                  className="popover-item"
                  onClick={() => handleAddWebTab(browser.appName)}
                >
                  <span>{browser.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
