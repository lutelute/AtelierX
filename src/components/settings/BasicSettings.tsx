import { Settings, ActivateAnimation } from '../../types';

interface BasicSettingsProps {
  settings: Settings;
  onSettingsChange: (updater: (prev: Settings) => Settings) => void;
}

export function BasicSettings({ settings, onSettingsChange }: BasicSettingsProps) {
  return (
    <div className="settings-section">
      <h3>基本設定</h3>
      <div className="settings-grid-2col">
        <div className="form-group-compact">
          <label>テーマ</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-option ${(settings.theme || 'dark') === 'dark' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, theme: 'dark' }))}
            >
              🌙 ダーク
            </button>
            <button
              type="button"
              className={`toggle-option ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, theme: 'light' }))}
            >
              ☀️ ライト
            </button>
          </div>
        </div>

        <div className="form-group-compact">
          <label>カードクリック</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-option ${settings.cardClickBehavior === 'edit' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, cardClickBehavior: 'edit' as const }))}
            >
              編集
            </button>
            <button
              type="button"
              className={`toggle-option ${settings.cardClickBehavior === 'jump' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, cardClickBehavior: 'jump' as const }))}
            >
              ジャンプ
            </button>
          </div>
        </div>

        <div className="form-group-compact">
          <label>ウィンドウアニメーション</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-option ${settings.activateAnimation === 'pop' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, activateAnimation: 'pop' as ActivateAnimation }))}
            >
              ポップ
            </button>
            <button
              type="button"
              className={`toggle-option ${settings.activateAnimation === 'minimize' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, activateAnimation: 'minimize' as ActivateAnimation }))}
            >
              最小化復帰
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
