import { useState, useEffect } from 'react';
import { InstalledPlugin } from '../../types';

export function PluginManager() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginRepoUrl, setPluginRepoUrl] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [pluginSuccess, setPluginSuccess] = useState<string | null>(null);
  const [pluginUpdates, setPluginUpdates] = useState<Record<string, { hasUpdate: boolean; latestVersion?: string }>>({});
  const [updatingPlugins, setUpdatingPlugins] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    if (window.electronAPI?.plugins) {
      const result = await window.electronAPI.plugins.list();
      if (result.success) {
        setPlugins(result.data);
        checkPluginUpdates(result.data);
      }
    }
  };

  const checkPluginUpdates = async (pluginList: InstalledPlugin[]) => {
    if (!window.electronAPI?.plugins?.checkUpdate) return;
    const updates: Record<string, { hasUpdate: boolean; latestVersion?: string }> = {};
    for (const plugin of pluginList) {
      try {
        const result = await window.electronAPI.plugins.checkUpdate(plugin.manifest.id);
        if (result.hasUpdate) {
          updates[plugin.manifest.id] = { hasUpdate: true, latestVersion: result.latestVersion };
        }
      } catch (error) {
        console.error(`Failed to check update for ${plugin.manifest.id}:`, error);
      }
    }
    setPluginUpdates(updates);
  };

  const handleUpdatePlugin = async (pluginId: string) => {
    if (!window.electronAPI?.plugins?.update) return;
    setUpdatingPlugins((prev) => new Set(prev).add(pluginId));
    setPluginError(null);
    setPluginSuccess(null);
    try {
      const result = await window.electronAPI.plugins.update(pluginId);
      if (result.success) {
        setPluginSuccess(`プラグインを v${result.newVersion} にアップデートしました`);
        setPluginUpdates((prev) => { const updated = { ...prev }; delete updated[pluginId]; return updated; });
        await loadPlugins();
      } else {
        setPluginError(result.error || 'アップデートに失敗しました');
      }
    } catch {
      setPluginError('アップデート中にエラーが発生しました');
    } finally {
      setUpdatingPlugins((prev) => { const updated = new Set(prev); updated.delete(pluginId); return updated; });
    }
  };

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
    } catch {
      setPluginError('インストール中にエラーが発生しました');
    } finally {
      setIsInstalling(false);
    }
  };

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
    } catch {
      setPluginError('操作中にエラーが発生しました');
    }
  };

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
    } catch {
      setPluginError('アンインストール中にエラーが発生しました');
    }
  };

  return (
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
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInstallPlugin(); } }}
            />
            <button type="button" className="btn-install" onClick={handleInstallPlugin} disabled={isInstalling || !pluginRepoUrl.trim()}>
              {isInstalling ? 'インストール中...' : 'インストール'}
            </button>
          </div>
          <span className="form-hint">GitHubリポジトリを「owner/repo」形式で入力</span>
          {pluginError && <div className="plugin-message error">{pluginError}</div>}
          {pluginSuccess && <div className="plugin-message success">{pluginSuccess}</div>}
        </div>
      </div>

      <div className="settings-section">
        <h3>インストール済みプラグイン</h3>
        {plugins.length === 0 ? (
          <div className="plugins-empty">
            <div className="plugins-empty-icon">📦</div>
            <div className="plugins-empty-text">インストールされたプラグインはありません</div>
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
                          <span className="plugin-update-badge">→ v{pluginUpdates[plugin.manifest.id].latestVersion}</span>
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
                      <button type="button" className="btn-update-plugin" onClick={() => handleUpdatePlugin(plugin.manifest.id)} disabled={updatingPlugins.has(plugin.manifest.id)}>
                        {updatingPlugins.has(plugin.manifest.id) ? 'アップデート中...' : 'アップデート'}
                      </button>
                    )}
                    <button type="button" className="btn-uninstall" onClick={() => handleUninstallPlugin(plugin.manifest.id, plugin.manifest.name)}>アンインストール</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
