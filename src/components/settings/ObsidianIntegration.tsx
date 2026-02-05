import { Settings } from '../../types';

interface ObsidianIntegrationProps {
  settings: Settings;
  onSettingsChange: (updater: (prev: Settings) => Settings) => void;
}

export function ObsidianIntegration({ settings, onSettingsChange }: ObsidianIntegrationProps) {
  const handleBrowseVault = async () => {
    if (window.electronAPI?.selectFolder) {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        onSettingsChange((prev) => ({ ...prev, obsidianVaultPath: path }));
      }
    }
  };

  const handleBrowseDailyNote = async () => {
    if (window.electronAPI?.selectFolder) {
      const path = await window.electronAPI.selectFolder();
      if (path && settings.obsidianVaultPath) {
        let relativePath = path;
        if (path.startsWith(settings.obsidianVaultPath)) {
          relativePath = path.slice(settings.obsidianVaultPath.length + 1);
        }
        const dailyNotePath = relativePath ? `${relativePath}/{{date}}.md` : '{{date}}.md';
        onSettingsChange((prev) => ({ ...prev, dailyNotePath }));
      }
    }
  };

  return (
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
              onChange={(e) => onSettingsChange((prev) => ({ ...prev, obsidianVaultPath: e.target.value }))}
              placeholder="パスを入力 または 参照ボタンで選択"
            />
          </div>
          <button type="button" className="btn-browse" onClick={handleBrowseVault}>フォルダ参照</button>
        </div>
        <span className="form-hint">直接パスを入力するか、参照ボタンでフォルダを選択</span>
      </div>

      <div className="form-group">
        <label>デイリーノートパス</label>
        <div className="path-input-container">
          <input
            type="text"
            value={settings.dailyNotePath}
            onChange={(e) => onSettingsChange((prev) => ({ ...prev, dailyNotePath: e.target.value }))}
            placeholder="Daily Notes/{{date}}.md"
          />
          <button type="button" className="btn-browse" onClick={handleBrowseDailyNote}>フォルダ参照</button>
        </div>
        <span className="form-hint">{'{{date}}'} は YYYY-MM-DD に置換。フォルダ選択時は自動で /{'{{date}}'}.md を追加</span>
      </div>

      <div className="form-group">
        <label>差し込みマーカー</label>
        <input
          type="text"
          value={settings.insertMarker}
          onChange={(e) => onSettingsChange((prev) => ({ ...prev, insertMarker: e.target.value }))}
          placeholder="## AtelierX"
        />
        <span className="form-hint">この見出しの下に差し込みます（なければ末尾に追加）</span>
      </div>
    </div>
  );
}
