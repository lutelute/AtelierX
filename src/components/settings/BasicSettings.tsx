import { Settings, ActivateAnimation } from '../../types';

interface BasicSettingsProps {
  settings: Settings;
  onSettingsChange: (updater: (prev: Settings) => Settings) => void;
}

export function BasicSettings({ settings, onSettingsChange }: BasicSettingsProps) {
  return (
    <>
      <div className="settings-section">
        <h3>外観</h3>
        <div className="form-group">
          <label>テーマ</label>
          <div className="theme-selector">
            <button
              type="button"
              className={`theme-option ${(settings.theme || 'dark') === 'dark' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, theme: 'dark' }))}
            >
              🌙 ダーク
            </button>
            <button
              type="button"
              className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={() => onSettingsChange((prev) => ({ ...prev, theme: 'light' }))}
            >
              ☀️ ライト
            </button>
          </div>
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
                onChange={(e) => onSettingsChange((prev) => ({ ...prev, cardClickBehavior: e.target.value as 'edit' | 'jump' }))}
              />
              <span>カード編集を開く</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="cardClickBehavior"
                value="jump"
                checked={settings.cardClickBehavior === 'jump'}
                onChange={(e) => onSettingsChange((prev) => ({ ...prev, cardClickBehavior: e.target.value as 'edit' | 'jump' }))}
              />
              <span>ウィンドウにジャンプ</span>
            </label>
          </div>
          <span className="form-hint">カードをクリックした時のデフォルト動作を選択</span>
        </div>

        <div className="form-group">
          <label>ウィンドウ活性化アニメーション</label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="activateAnimation"
                value="pop"
                checked={(settings.activateAnimation || 'pop') === 'pop'}
                onChange={(e) => onSettingsChange((prev) => ({ ...prev, activateAnimation: e.target.value as ActivateAnimation }))}
              />
              <span>ポップ（引っ込んで飛び出す）</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="activateAnimation"
                value="minimize"
                checked={settings.activateAnimation === 'minimize'}
                onChange={(e) => onSettingsChange((prev) => ({ ...prev, activateAnimation: e.target.value as ActivateAnimation }))}
              />
              <span>最小化復帰（Dockに吸い込まれて戻る）</span>
            </label>
          </div>
          <span className="form-hint">ウィンドウジャンプ時のアニメーション効果</span>
        </div>
      </div>
    </>
  );
}
