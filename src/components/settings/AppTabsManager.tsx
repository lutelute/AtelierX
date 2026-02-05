import { useState, useEffect } from 'react';
import { Settings, AppTabConfig, BUILTIN_APPS, InstalledAppInfo, shortenAppName } from '../../types';
import { PRESET_COLORS } from '../../utils/constants';

interface AppTabsManagerProps {
  settings: Settings;
  onSettingsChange: (updater: (prev: Settings) => Settings) => void;
}

export function AppTabsManager({ settings, onSettingsChange }: AppTabsManagerProps) {
  const [customAppName, setCustomAppName] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  const enabledTabs = settings.enabledAppTabs && settings.enabledAppTabs.length > 0
    ? settings.enabledAppTabs
    : BUILTIN_APPS;

  const addAppTab = (tab: AppTabConfig) => {
    const current = [...enabledTabs];
    if (current.find(t => t.id === tab.id)) return;
    onSettingsChange(prev => ({ ...prev, enabledAppTabs: [...current, tab] }));
  };

  const removeAppTab = (tabId: string) => {
    const updated = enabledTabs.filter(t => t.id !== tabId);
    onSettingsChange(prev => ({ ...prev, enabledAppTabs: updated }));
  };

  const addCustomApp = () => {
    if (!customAppName.trim()) return;
    const id = `custom-${customAppName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const tab: AppTabConfig = {
      id,
      appName: customAppName.trim(),
      displayName: customDisplayName.trim() || customAppName.trim(),
      icon: '🪟',
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      type: 'custom',
    };
    addAppTab(tab);
    setCustomAppName('');
    setCustomDisplayName('');
  };

  useEffect(() => {
    const loadApps = async () => {
      if (!window.electronAPI?.scanInstalledApps) return;
      setIsLoadingApps(true);
      try {
        const apps = await window.electronAPI.scanInstalledApps();
        setInstalledApps(apps || []);
      } catch (error) {
        console.error('Failed to load installed apps:', error);
      } finally {
        setIsLoadingApps(false);
      }
    };
    loadApps();
  }, []);

  const filteredApps = installedApps.filter(app => {
    if (appSearchQuery) {
      const q = appSearchQuery.toLowerCase();
      return app.appName.toLowerCase().includes(q) || app.bundleId.toLowerCase().includes(q);
    }
    return true;
  });

  const addInstalledApp = (app: InstalledAppInfo) => {
    const id = `app-${app.appName.toLowerCase().replace(/\s+/g, '-')}`;
    const tab: AppTabConfig = {
      id,
      appName: app.appName,
      displayName: shortenAppName(app.appName),
      icon: '🪟',
      iconDataUri: app.iconDataUri || undefined,
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      type: 'custom',
    };
    addAppTab(tab);
  };

  const isAppAlreadyAdded = (app: InstalledAppInfo): boolean => {
    return enabledTabs.some(t => t.appName === app.appName);
  };

  return (
    <div className="settings-section">
      <h3>アプリタブ</h3>
      <p className="settings-description">管理するアプリを追加・削除します。Terminal と Finder は常に有効です。</p>

      <div className="app-tabs-list">
        {enabledTabs.map((tab) => (
          <div key={tab.id} className="app-tab-item">
            {tab.iconDataUri ? (
              <img src={tab.iconDataUri} className="app-tab-icon-img" alt={tab.displayName} />
            ) : (
              <span className="app-tab-icon" style={{ color: tab.color }}>{tab.icon}</span>
            )}
            <span className="app-tab-name">{tab.displayName}</span>
            <span className="app-tab-type">{tab.type === 'builtin' ? '(ビルトイン)' : tab.type === 'preset' ? '(プリセット)' : '(カスタム)'}</span>
            {tab.type !== 'builtin' && (
              <button type="button" className="app-tab-remove" onClick={() => removeAppTab(tab.id)} title="削除">×</button>
            )}
          </div>
        ))}
      </div>

      <div className="app-tabs-presets">
        <label>アプリを追加:</label>
        <div className="app-picker">
          <input
            type="text"
            className="app-picker-search"
            placeholder="アプリを検索..."
            value={appSearchQuery}
            onChange={(e) => setAppSearchQuery(e.target.value)}
          />
          <div className="app-picker-list">
            {isLoadingApps ? (
              <div className="app-picker-loading">スキャン中...</div>
            ) : filteredApps.length === 0 ? (
              <div className="app-picker-empty">
                {appSearchQuery ? '該当するアプリがありません' : 'アプリが見つかりません'}
              </div>
            ) : (
              filteredApps.map((app) => {
                const added = isAppAlreadyAdded(app);
                return (
                  <button
                    key={app.path}
                    type="button"
                    className={`app-picker-item ${added ? 'disabled' : ''}`}
                    onClick={() => !added && addInstalledApp(app)}
                    disabled={added}
                    title={added ? '追加済み' : app.path}
                  >
                    {app.iconDataUri ? (
                      <img src={app.iconDataUri} className="app-picker-icon-img" alt={app.appName} />
                    ) : (
                      <span className="app-picker-icon-text">🪟</span>
                    )}
                    <span className="app-picker-name">{app.appName}</span>
                    {added && <span className="app-picker-badge">追加済み</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="app-tabs-custom">
        <label>カスタムアプリを追加:</label>
        <div className="custom-app-form">
          <input
            type="text"
            placeholder="macOSアプリ名 (例: Notion)"
            value={customAppName}
            onChange={(e) => setCustomAppName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomApp(); } }}
          />
          <input
            type="text"
            placeholder="表示名 (任意)"
            value={customDisplayName}
            onChange={(e) => setCustomDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomApp(); } }}
          />
          <button type="button" className="btn-add-custom-app" onClick={addCustomApp} disabled={!customAppName.trim()}>追加</button>
        </div>
        <span className="form-hint">macOSのアプリ名を正確に入力してください（例: Google Chrome, Microsoft Word）</span>
      </div>
    </div>
  );
}
