import { useState, useEffect } from 'react';
import { Settings, CardClickBehavior, CustomSubtag, DefaultSubtagSettings, SUBTAG_LABELS, SUBTAG_COLORS, SubTagType, InstalledPlugin, UpdateStatus, UpdateProgress, AppTabConfig, BUILTIN_APPS, InstalledAppInfo, shortenAppName } from '../types';

export { type CardClickBehavior };
export { type Settings };

type SettingsTab = 'general' | 'plugins';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: Settings) => void;
  initialSettings: Settings;
  onExportBackup?: () => void;
  onImportBackup?: () => void;
  lastBackupTime?: number;
}

export const defaultSettings: Settings = {
  obsidianVaultPath: '',
  dailyNotePath: 'Daily Notes/{{date}}.md',
  insertMarker: '## AtelierX',
  cardClickBehavior: 'edit',  // デフォルトはカード編集
  customSubtags: [],
  theme: 'dark',
};

// プリセットカラー
const PRESET_COLORS = [
  '#ef4444', // 赤
  '#f97316', // オレンジ
  '#f59e0b', // アンバー
  '#eab308', // イエロー
  '#84cc16', // ライム
  '#22c55e', // グリーン
  '#14b8a6', // ティール
  '#06b6d4', // シアン
  '#3b82f6', // ブルー
  '#6366f1', // インディゴ
  '#8b5cf6', // バイオレット
  '#a855f7', // パープル
  '#d946ef', // フクシア
  '#ec4899', // ピンク
  '#6b7280', // グレー
];

export function SettingsModal({ onClose, onSave, initialSettings, onExportBackup, onImportBackup, lastBackupTime }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [newSubtagName, setNewSubtagName] = useState('');
  const [newSubtagColor, setNewSubtagColor] = useState(PRESET_COLORS[0]);
  const [editingSubtagId, setEditingSubtagId] = useState<string | null>(null);
  const [editingDefaultSubtagId, setEditingDefaultSubtagId] = useState<string | null>(null);

  // タブ管理
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // アプリタブ管理
  const [customAppName, setCustomAppName] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('');
  const enabledTabs = settings.enabledAppTabs && settings.enabledAppTabs.length > 0
    ? settings.enabledAppTabs
    : BUILTIN_APPS;

  const addAppTab = (tab: AppTabConfig) => {
    const current = [...enabledTabs];
    if (current.find(t => t.id === tab.id)) return; // 重複防止
    setSettings(prev => ({ ...prev, enabledAppTabs: [...current, tab] }));
  };

  const removeAppTab = (tabId: string) => {
    const updated = enabledTabs.filter(t => t.id !== tabId);
    setSettings(prev => ({ ...prev, enabledAppTabs: updated }));
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

  // インストール済みアプリ
  const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  // インストール済みアプリをロード
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

  // フィルタ済みアプリ一覧
  const filteredApps = installedApps.filter(app => {
    // 検索クエリでフィルタ
    if (appSearchQuery) {
      const q = appSearchQuery.toLowerCase();
      return app.appName.toLowerCase().includes(q) || app.bundleId.toLowerCase().includes(q);
    }
    return true;
  });

  // アプリを追加
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

  // 既に追加済みかチェック
  const isAppAlreadyAdded = (app: InstalledAppInfo): boolean => {
    return enabledTabs.some(t => t.appName === app.appName);
  };

  // プラグイン管理
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginRepoUrl, setPluginRepoUrl] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [pluginSuccess, setPluginSuccess] = useState<string | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<Record<string, { hasUpdate: boolean; latestVersion?: string }>>({});
  const [updatingPlugins, setUpdatingPlugins] = useState<Set<string>>(new Set());

  // バージョン更新確認
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const currentVersion = __APP_VERSION__;

  // 進捗イベントリスナーの登録
  useEffect(() => {
    if (window.electronAPI?.update?.onProgress) {
      const cleanup = window.electronAPI.update.onProgress((data) => {
        setDownloadProgress(data);
      });
      return cleanup;
    }
  }, []);

  const checkForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      if (window.electronAPI?.update) {
        const result = await window.electronAPI.update.check();
        if (result.success) {
          if (result.available) {
            setLatestVersion(result.version || null);
            setDownloadUrl(result.downloadUrl || null);
            setUpdateStatus('available');
          } else {
            setUpdateStatus('latest');
          }
        } else {
          setUpdateError(result.error || '確認に失敗しました');
          setUpdateStatus('error');
        }
      } else {
        // フォールバック: 直接GitHub APIを呼ぶ
        const response = await fetch('https://api.github.com/repos/lutelute/AtelierX/releases/latest');
        if (!response.ok) {
          if (response.status === 404) {
            setUpdateStatus('latest');
            return;
          }
          throw new Error('Failed to fetch');
        }
        const data = await response.json();
        const latest = data.tag_name.replace(/^v/, '');
        setLatestVersion(latest);
        const dmgAsset = data.assets?.find((asset: { name: string }) => asset.name.endsWith('.dmg'));
        setDownloadUrl(dmgAsset?.browser_download_url || null);
        if (latest !== currentVersion) {
          setUpdateStatus('available');
        } else {
          setUpdateStatus('latest');
        }
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError('確認に失敗しました');
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setUpdateStatus('downloading');
    setDownloadProgress(null);
    setUpdateError(null);
    try {
      const result = await window.electronAPI?.update.download(downloadUrl);
      if (result?.success) {
        setUpdateStatus('downloaded');
      } else {
        setUpdateError(result?.error || 'ダウンロードに失敗しました');
        setUpdateStatus('error');
      }
    } catch {
      setUpdateError('ダウンロード中にエラーが発生しました');
      setUpdateStatus('error');
    }
  };

  const handleInstall = async () => {
    setUpdateStatus('installing');
    setUpdateError(null);
    try {
      const result = await window.electronAPI?.update.install();
      if (result?.success) {
        // インストール成功 - 再起動ボタンを表示
        setUpdateStatus('installed' as UpdateStatus);
      } else {
        setUpdateError(result?.error || 'インストールに失敗しました');
        setUpdateStatus('error');
      }
    } catch {
      setUpdateError('インストール中にエラーが発生しました');
      setUpdateStatus('error');
    }
  };

  const handleRestart = async () => {
    try {
      await window.electronAPI?.update.restart();
    } catch {
      setUpdateError('再起動に失敗しました');
    }
  };

  const handleCleanup = async () => {
    try {
      await window.electronAPI?.update.cleanup();
      setUpdateStatus('idle');
      setDownloadProgress(null);
    } catch {
      // エラーは無視
    }
  };

  // プラグイン一覧を取得
  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    if (window.electronAPI?.plugins) {
      const result = await window.electronAPI.plugins.list();
      if (result.success) {
        setPlugins(result.data);
        // プラグインのアップデートを確認
        checkPluginUpdates(result.data);
      }
    }
  };

  // プラグインのアップデートを確認
  const checkPluginUpdates = async (pluginList: InstalledPlugin[]) => {
    if (!window.electronAPI?.plugins?.checkUpdate) return;

    const updates: Record<string, { hasUpdate: boolean; latestVersion?: string }> = {};

    for (const plugin of pluginList) {
      try {
        const result = await window.electronAPI.plugins.checkUpdate(plugin.manifest.id);
        if (result.hasUpdate) {
          updates[plugin.manifest.id] = {
            hasUpdate: true,
            latestVersion: result.latestVersion,
          };
        }
      } catch (error) {
        console.error(`Failed to check update for ${plugin.manifest.id}:`, error);
      }
    }

    setPluginUpdates(updates);
  };

  // プラグインをアップデート
  const handleUpdatePlugin = async (pluginId: string) => {
    if (!window.electronAPI?.plugins?.update) return;

    setUpdatingPlugins((prev) => new Set(prev).add(pluginId));
    setPluginError(null);
    setPluginSuccess(null);

    try {
      const result = await window.electronAPI.plugins.update(pluginId);
      if (result.success) {
        setPluginSuccess(`プラグインを v${result.newVersion} にアップデートしました`);
        setPluginUpdates((prev) => {
          const updated = { ...prev };
          delete updated[pluginId];
          return updated;
        });
        await loadPlugins();
      } else {
        setPluginError(result.error || 'アップデートに失敗しました');
      }
    } catch (error) {
      setPluginError('アップデート中にエラーが発生しました');
    } finally {
      setUpdatingPlugins((prev) => {
        const updated = new Set(prev);
        updated.delete(pluginId);
        return updated;
      });
    }
  };

  // プラグインをインストール
  const handleInstallPlugin = async () => {
    if (!pluginRepoUrl.trim()) return;
    setIsInstalling(true);
    setPluginError(null);
    setPluginSuccess(null);

    try {
      const result = await window.electronAPI?.plugins.install(pluginRepoUrl.trim());
      if (result?.success) {
        setPluginSuccess('プラグインをインストールしました');
        setPluginRepoUrl('');
        await loadPlugins();
      } else {
        setPluginError(result?.error || 'インストールに失敗しました');
      }
    } catch (error) {
      setPluginError('インストール中にエラーが発生しました');
    } finally {
      setIsInstalling(false);
    }
  };

  // プラグインを有効化/無効化
  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      const result = enabled
        ? await window.electronAPI?.plugins.enable(pluginId)
        : await window.electronAPI?.plugins.disable(pluginId);
      if (result?.success) {
        await loadPlugins();
      } else {
        setPluginError(result?.error || '操作に失敗しました');
      }
    } catch (error) {
      setPluginError('操作中にエラーが発生しました');
    }
  };

  // プラグインをアンインストール
  const handleUninstallPlugin = async (pluginId: string, pluginName: string) => {
    if (!confirm(`「${pluginName}」をアンインストールしますか？`)) return;

    try {
      const result = await window.electronAPI?.plugins.uninstall(pluginId);
      if (result?.success) {
        setPluginSuccess('プラグインをアンインストールしました');
        await loadPlugins();
      } else {
        setPluginError(result?.error || 'アンインストールに失敗しました');
      }
    } catch (error) {
      setPluginError('アンインストール中にエラーが発生しました');
    }
  };

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  // サブタグを追加
  const handleAddSubtag = () => {
    if (!newSubtagName.trim()) return;
    const newSubtag: CustomSubtag = {
      id: `subtag-${Date.now()}`,
      name: newSubtagName.trim(),
      color: newSubtagColor,
    };
    setSettings((prev) => ({
      ...prev,
      customSubtags: [...(prev.customSubtags || []), newSubtag],
    }));
    setNewSubtagName('');
    setNewSubtagColor(PRESET_COLORS[0]);
  };

  // サブタグを削除
  const handleDeleteSubtag = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      customSubtags: (prev.customSubtags || []).filter((st) => st.id !== id),
    }));
  };

  // サブタグを編集
  const handleUpdateSubtag = (id: string, updates: Partial<CustomSubtag>) => {
    setSettings((prev) => ({
      ...prev,
      customSubtags: (prev.customSubtags || []).map((st) =>
        st.id === id ? { ...st, ...updates } : st
      ),
    }));
  };

  // デフォルトサブタグの設定を取得（上書きを適用）
  const getDefaultSubtagSettings = (): DefaultSubtagSettings => {
    return settings.defaultSubtagSettings || { hidden: [], overrides: {} };
  };

  // デフォルトサブタグを非表示にする
  const handleHideDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    setSettings((prev) => ({
      ...prev,
      defaultSubtagSettings: {
        ...current,
        hidden: [...current.hidden, id],
      },
    }));
  };

  // デフォルトサブタグを再表示する
  const handleShowDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    setSettings((prev) => ({
      ...prev,
      defaultSubtagSettings: {
        ...current,
        hidden: current.hidden.filter((h) => h !== id),
      },
    }));
  };

  // デフォルトサブタグの名前・色を更新
  const handleUpdateDefaultSubtag = (id: string, updates: { name?: string; color?: string }) => {
    const current = getDefaultSubtagSettings();
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
  };

  // デフォルトサブタグをリセット（元に戻す）
  const handleResetDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    const newOverrides = { ...current.overrides };
    delete newOverrides[id];
    setSettings((prev) => ({
      ...prev,
      defaultSubtagSettings: {
        ...current,
        overrides: newOverrides,
      },
    }));
  };

  // デフォルトサブタグの一覧（上書きを適用済み）
  const defaultSubtags: { id: SubTagType; name: string; color: string; originalName: string; originalColor: string }[] = [
    { id: 'research', name: SUBTAG_LABELS.research, color: SUBTAG_COLORS.research, originalName: SUBTAG_LABELS.research, originalColor: SUBTAG_COLORS.research },
    { id: 'routine', name: SUBTAG_LABELS.routine, color: SUBTAG_COLORS.routine, originalName: SUBTAG_LABELS.routine, originalColor: SUBTAG_COLORS.routine },
    { id: 'misc', name: SUBTAG_LABELS.misc, color: SUBTAG_COLORS.misc, originalName: SUBTAG_LABELS.misc, originalColor: SUBTAG_COLORS.misc },
  ].map((st) => {
    const override = getDefaultSubtagSettings().overrides[st.id];
    return {
      ...st,
      name: override?.name || st.name,
      color: override?.color || st.color,
    };
  });

  // 非表示のデフォルトサブタグ
  const hiddenDefaultSubtags = defaultSubtags.filter((st) =>
    getDefaultSubtagSettings().hidden.includes(st.id)
  );

  // 表示中のデフォルトサブタグ
  const visibleDefaultSubtags = defaultSubtags.filter(
    (st) => !getDefaultSubtagSettings().hidden.includes(st.id)
  );

  const handleBrowseVault = async () => {
    if (window.electronAPI?.selectFolder) {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        setSettings((prev) => ({ ...prev, obsidianVaultPath: path }));
      }
    }
  };

  const handleBrowseDailyNote = async () => {
    if (window.electronAPI?.selectFolder) {
      const path = await window.electronAPI.selectFolder();
      if (path && settings.obsidianVaultPath) {
        // Vaultパスからの相対パスを計算
        let relativePath = path;
        if (path.startsWith(settings.obsidianVaultPath)) {
          relativePath = path.slice(settings.obsidianVaultPath.length + 1);
        }
        // フォルダパス + {{date}}.md を設定
        const dailyNotePath = relativePath ? `${relativePath}/{{date}}.md` : '{{date}}.md';
        setSettings((prev) => ({ ...prev, dailyNotePath }));
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>設定</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* タブナビゲーション */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            一般
          </button>
          <button
            className={`settings-tab ${activeTab === 'plugins' ? 'active' : ''}`}
            onClick={() => setActiveTab('plugins')}
          >
            プラグイン
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <>
          {/* アプリタブ管理セクション */}
          <div className="settings-section">
            <h3>アプリタブ</h3>
            <p className="settings-description">管理するアプリを追加・削除します。Terminal と Finder は常に有効です。</p>

            {/* 有効なタブ一覧 */}
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
                    <button
                      type="button"
                      className="app-tab-remove"
                      onClick={() => removeAppTab(tab.id)}
                      title="削除"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* インストール済みアプリから追加 */}
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

            {/* カスタムアプリ追加 */}
            <div className="app-tabs-custom">
              <label>カスタムアプリを追加:</label>
              <div className="custom-app-form">
                <input
                  type="text"
                  placeholder="macOSアプリ名 (例: Notion)"
                  value={customAppName}
                  onChange={(e) => setCustomAppName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomApp();
                    }
                  }}
                />
                <input
                  type="text"
                  placeholder="表示名 (任意)"
                  value={customDisplayName}
                  onChange={(e) => setCustomDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomApp();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-add-custom-app"
                  onClick={addCustomApp}
                  disabled={!customAppName.trim()}
                >
                  追加
                </button>
              </div>
              <span className="form-hint">macOSのアプリ名を正確に入力してください（例: Google Chrome, Microsoft Word）</span>
            </div>
          </div>

          <div className="settings-section">
            <h3>外観</h3>
            <div className="form-group">
              <label>テーマ</label>
              <div className="theme-selector">
                <button
                  type="button"
                  className={`theme-option ${(settings.theme || 'dark') === 'dark' ? 'active' : ''}`}
                  onClick={() => setSettings((prev) => ({ ...prev, theme: 'dark' }))}
                >
                  🌙 ダーク
                </button>
                <button
                  type="button"
                  className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
                  onClick={() => setSettings((prev) => ({ ...prev, theme: 'light' }))}
                >
                  ☀️ ライト
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Obsidian連携</h3>

            <div className="form-group">
              <label>Vault パス</label>
              <div className="path-input-container">
                <div className="path-input-wrapper">
                  <span className="path-prefix">$</span>
                  <input
                    type="text"
                    className="path-input"
                    value={settings.obsidianVaultPath}
                    onChange={(e) => setSettings((prev) => ({ ...prev, obsidianVaultPath: e.target.value }))}
                    placeholder="パスを入力 または 参照ボタンで選択"
                  />
                </div>
                <button type="button" className="btn-browse" onClick={handleBrowseVault}>
                  フォルダ参照
                </button>
              </div>
              <span className="form-hint">直接パスを入力するか、参照ボタンでフォルダを選択</span>
            </div>

            <div className="form-group">
              <label>デイリーノートパス</label>
              <div className="path-input-container">
                <input
                  type="text"
                  value={settings.dailyNotePath}
                  onChange={(e) => setSettings((prev) => ({ ...prev, dailyNotePath: e.target.value }))}
                  placeholder="Daily Notes/{{date}}.md"
                />
                <button type="button" className="btn-browse" onClick={handleBrowseDailyNote}>
                  フォルダ参照
                </button>
              </div>
              <span className="form-hint">{'{{date}}'} は YYYY-MM-DD に置換。フォルダ選択時は自動で /{'{{date}}'}.md を追加</span>
            </div>

            <div className="form-group">
              <label>差し込みマーカー</label>
              <input
                type="text"
                value={settings.insertMarker}
                onChange={(e) => setSettings((prev) => ({ ...prev, insertMarker: e.target.value }))}
                placeholder="## AtelierX"
              />
              <span className="form-hint">この見出しの下に差し込みます（なければ末尾に追加）</span>
            </div>
          </div>

          <div className="settings-section">
            <h3>動作設定</h3>

            <div className="form-group">
              <label>カードクリック時の動作</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="cardClickBehavior"
                    value="edit"
                    checked={settings.cardClickBehavior === 'edit'}
                    onChange={(e) => setSettings((prev) => ({ ...prev, cardClickBehavior: e.target.value as 'edit' | 'jump' }))}
                  />
                  <span>カード編集を開く</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="cardClickBehavior"
                    value="jump"
                    checked={settings.cardClickBehavior === 'jump'}
                    onChange={(e) => setSettings((prev) => ({ ...prev, cardClickBehavior: e.target.value as 'edit' | 'jump' }))}
                  />
                  <span>ウィンドウにジャンプ</span>
                </label>
              </div>
              <span className="form-hint">カードをクリックした時のデフォルト動作を選択</span>
            </div>
          </div>

          <div className="settings-section">
            <h3>サブタグ管理</h3>

            <div className="form-group">
              <label>デフォルトタグ</label>
              <div className="subtag-list">
                {visibleDefaultSubtags.map((st) => (
                  <div key={st.id} className="subtag-item">
                    {editingDefaultSubtagId === st.id ? (
                      <>
                        <input
                          type="text"
                          className="subtag-edit-name"
                          value={st.name}
                          onChange={(e) => handleUpdateDefaultSubtag(st.id, { name: e.target.value })}
                          autoFocus
                        />
                        <div className="color-picker-inline">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`color-option ${st.color === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => handleUpdateDefaultSubtag(st.id, { color })}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="subtag-action-btn done"
                          onClick={() => setEditingDefaultSubtagId(null)}
                        >
                          完了
                        </button>
                        {(st.name !== st.originalName || st.color !== st.originalColor) && (
                          <button
                            type="button"
                            className="subtag-action-btn reset"
                            onClick={() => handleResetDefaultSubtag(st.id)}
                            title="元に戻す"
                          >
                            リセット
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="subtag-color" style={{ backgroundColor: st.color }} />
                        <span className="subtag-name">{st.name}</span>
                        {(st.name !== st.originalName || st.color !== st.originalColor) && (
                          <span className="subtag-modified">(変更済み)</span>
                        )}
                        <button
                          type="button"
                          className="subtag-action-btn edit"
                          onClick={() => setEditingDefaultSubtagId(st.id)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="subtag-action-btn delete"
                          onClick={() => handleHideDefaultSubtag(st.id)}
                        >
                          非表示
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {hiddenDefaultSubtags.length > 0 && (
                <div className="hidden-subtags">
                  <label>非表示のデフォルトタグ</label>
                  <div className="subtag-list">
                    {hiddenDefaultSubtags.map((st) => (
                      <div key={st.id} className="subtag-item hidden">
                        <span className="subtag-color" style={{ backgroundColor: st.color, opacity: 0.5 }} />
                        <span className="subtag-name" style={{ opacity: 0.5 }}>{st.name}</span>
                        <button
                          type="button"
                          className="subtag-action-btn restore"
                          onClick={() => handleShowDefaultSubtag(st.id)}
                        >
                          再表示
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>カスタムタグ</label>
              <div className="subtag-list">
                {(settings.customSubtags || []).map((st) => (
                  <div key={st.id} className="subtag-item">
                    {editingSubtagId === st.id ? (
                      <>
                        <input
                          type="text"
                          className="subtag-edit-name"
                          value={st.name}
                          onChange={(e) => handleUpdateSubtag(st.id, { name: e.target.value })}
                          autoFocus
                        />
                        <div className="color-picker-inline">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`color-option ${st.color === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => handleUpdateSubtag(st.id, { color })}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="subtag-action-btn done"
                          onClick={() => setEditingSubtagId(null)}
                        >
                          完了
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="subtag-color" style={{ backgroundColor: st.color }} />
                        <span className="subtag-name">{st.name}</span>
                        <button
                          type="button"
                          className="subtag-action-btn edit"
                          onClick={() => setEditingSubtagId(st.id)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="subtag-action-btn delete"
                          onClick={() => handleDeleteSubtag(st.id)}
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>新しいタグを追加</label>
              <div className="add-subtag-form">
                <input
                  type="text"
                  placeholder="タグ名"
                  value={newSubtagName}
                  onChange={(e) => setNewSubtagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtag();
                    }
                  }}
                />
                <div className="color-picker-inline">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${newSubtagColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewSubtagColor(color)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-add-subtag"
                  onClick={handleAddSubtag}
                  disabled={!newSubtagName.trim()}
                >
                  追加
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>データバックアップ</h3>

            <div className="form-group">
              <label>自動バックアップ</label>
              <p className="backup-info">
                {lastBackupTime
                  ? `最終バックアップ: ${new Date(lastBackupTime).toLocaleString()}`
                  : 'バックアップはまだありません'}
              </p>
              <span className="form-hint">データは1分ごとに自動でバックアップされます</span>
            </div>

            <div className="form-group">
              <label>手動バックアップ</label>
              <div className="backup-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onExportBackup}
                  disabled={!onExportBackup}
                >
                  JSONにエクスポート
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onImportBackup}
                  disabled={!onImportBackup}
                >
                  JSONからインポート
                </button>
              </div>
              <span className="form-hint">バックアップファイルを保存・復元できます</span>
            </div>
          </div>
            </>
          )}

          {/* プラグインタブ */}
          {activeTab === 'plugins' && (
            <>
              <div className="settings-section">
                <h3>プラグインをインストール</h3>
                <div className="form-group">
                  <label>GitHubリポジトリ</label>
                  <div className="plugin-install-form">
                    <input
                      type="text"
                      className="plugin-install-input"
                      placeholder="owner/repo"
                      value={pluginRepoUrl}
                      onChange={(e) => setPluginRepoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleInstallPlugin();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-install"
                      onClick={handleInstallPlugin}
                      disabled={isInstalling || !pluginRepoUrl.trim()}
                    >
                      {isInstalling ? 'インストール中...' : 'インストール'}
                    </button>
                  </div>
                  <span className="form-hint">GitHubリポジトリを「owner/repo」形式で入力</span>

                  {pluginError && (
                    <div className="plugin-message error">{pluginError}</div>
                  )}
                  {pluginSuccess && (
                    <div className="plugin-message success">{pluginSuccess}</div>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h3>インストール済みプラグイン</h3>
                {plugins.length === 0 ? (
                  <div className="plugins-empty">
                    <div className="plugins-empty-icon">📦</div>
                    <div className="plugins-empty-text">
                      インストールされたプラグインはありません
                    </div>
                  </div>
                ) : (
                  <div className="plugin-list">
                    {plugins.map((plugin) => (
                      <div key={plugin.manifest.id} className="plugin-card">
                        <div className="plugin-header">
                          <div className="plugin-info">
                            <span className="plugin-name">
                              {plugin.manifest.name}
                              <span className="plugin-version">
                                v{plugin.manifest.version}
                                {pluginUpdates[plugin.manifest.id]?.hasUpdate && (
                                  <span className="plugin-update-badge">
                                    → v{pluginUpdates[plugin.manifest.id].latestVersion}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="plugin-author">by {plugin.manifest.author}</span>
                          </div>
                          <div className="plugin-actions">
                            <button
                              type="button"
                              className={`toggle-switch ${plugin.state.enabled ? 'enabled' : ''}`}
                              onClick={() => handleTogglePlugin(plugin.manifest.id, !plugin.state.enabled)}
                              title={plugin.state.enabled ? '無効化' : '有効化'}
                            >
                              <span className="toggle-switch-knob" />
                            </button>
                          </div>
                        </div>
                        <p className="plugin-description">{plugin.manifest.description}</p>
                        <div className="plugin-footer">
                          <span className="plugin-type">{plugin.manifest.type}</span>
                          <div className="plugin-footer-actions">
                            {pluginUpdates[plugin.manifest.id]?.hasUpdate && (
                              <button
                                type="button"
                                className="btn-update-plugin"
                                onClick={() => handleUpdatePlugin(plugin.manifest.id)}
                                disabled={updatingPlugins.has(plugin.manifest.id)}
                              >
                                {updatingPlugins.has(plugin.manifest.id) ? 'アップデート中...' : 'アップデート'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-uninstall"
                              onClick={() => handleUninstallPlugin(plugin.manifest.id, plugin.manifest.name)}
                            >
                              アンインストール
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* バージョン情報 */}
        <div className="version-info">
          <div className="version-info-header">
            <div className="version-current">
              <span className="version-label">AtelierX</span>
              <span className="version-number">v{currentVersion}</span>
            </div>
            <div className="version-actions">
              {/* 確認ボタン */}
              {(updateStatus === 'idle' || updateStatus === 'latest' || updateStatus === 'error') && (
                <button
                  type="button"
                  className="btn-check-update"
                  onClick={checkForUpdates}
                >
                  更新を確認
                </button>
              )}

              {/* 確認中 */}
              {updateStatus === 'checking' && (
                <span className="update-status-checking">確認中...</span>
              )}

              {/* 最新です */}
              {updateStatus === 'latest' && (
                <span className="update-status-latest">最新です</span>
              )}

              {/* 新バージョンあり - ダウンロードボタン */}
              {updateStatus === 'available' && latestVersion && downloadUrl && (
                <button
                  type="button"
                  className="btn-download-update"
                  onClick={handleDownload}
                >
                  v{latestVersion} をダウンロード
                </button>
              )}

              {/* 新バージョンあり - dmgがない場合はリンク */}
              {updateStatus === 'available' && latestVersion && !downloadUrl && (
                <a
                  href="https://github.com/lutelute/AtelierX/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download-update"
                >
                  v{latestVersion} をダウンロード
                </a>
              )}

              {/* エラー */}
              {updateStatus === 'error' && (
                <span className="update-status-error">
                  {updateError || '確認に失敗'}
                </span>
              )}
            </div>
          </div>

          {/* ダウンロード進捗バー */}
          {updateStatus === 'downloading' && (
            <div className="update-progress">
              <div className="update-progress-bar">
                <div
                  className="update-progress-fill"
                  style={{ width: `${downloadProgress?.percent || 0}%` }}
                />
              </div>
              <span className="update-progress-text">
                {downloadProgress
                  ? `${downloadProgress.percent}% (${downloadProgress.downloadedMB}MB / ${downloadProgress.totalMB}MB)`
                  : 'ダウンロード準備中...'}
              </span>
            </div>
          )}

          {/* ダウンロード完了 - インストールボタン */}
          {updateStatus === 'downloaded' && (
            <div className="update-downloaded">
              <p className="update-downloaded-text">ダウンロード完了！</p>
              <div className="update-downloaded-actions">
                <button
                  type="button"
                  className="btn-install-update"
                  onClick={handleInstall}
                >
                  インストール
                </button>
                <button
                  type="button"
                  className="btn-cleanup"
                  onClick={handleCleanup}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* インストール中 */}
          {updateStatus === 'installing' && (
            <div className="update-installing">
              <p className="update-installing-text">インストール中...</p>
            </div>
          )}

          {/* インストール完了 - 再起動ボタン */}
          {updateStatus === ('installed' as UpdateStatus) && (
            <div className="update-installed">
              <p className="update-installed-text">✓ インストール完了！</p>
              <button
                type="button"
                className="btn-restart-update"
                onClick={handleRestart}
              >
                再起動して更新を適用
              </button>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
