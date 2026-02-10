import { useState } from 'react';

interface BackupSectionProps {
  lastBackupTime?: number;
  onExportBackup?: () => void;
  onImportBackup?: () => void;
  onExportSettingsPreset?: () => void;
  onImportSettingsPreset?: () => void;
  onExportCardBackup?: () => void;
  onImportCardBackup?: () => void;
}

export function BackupSection({ lastBackupTime, onExportBackup, onImportBackup, onExportSettingsPreset, onImportSettingsPreset, onExportCardBackup, onImportCardBackup }: BackupSectionProps) {
  const [showHelp, setShowHelp] = useState(false);

  const handleUninstall = async () => {
    try {
      await window.electronAPI?.uninstallApp();
    } catch {
      // quit時のエラーは無視
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>データバックアップ</h3>
        <button className={`mg-help-btn ${showHelp ? 'active' : ''}`} onClick={() => setShowHelp(!showHelp)} title="ヘルプ">?</button>
      </div>

      {showHelp && (
        <div className="mg-help-panel">
          <div className="mg-help-body">
            <h4>バックアップ機能について</h4>
            <p>カンバンのデータをJSON形式で保存・復元できます。用途に応じて3種類のバックアップが選べます。</p>
            <h4>全データバックアップ</h4>
            <p>ボード・カード・設定・ログの全てを含む完全バックアップです。</p>
            <h4>設定プリセット</h4>
            <p>テーマ・タブ構成・サブタグ・優先順位などの設定のみ。Obsidianパスなどの個人情報は除外されるため、<b>他の人と共有可能</b>です。</p>
            <h4>カードデータ</h4>
            <p>ボード・カード・ログのみ。設定は現在のものが保持されます。</p>
            <h4>自動バックアップ</h4>
            <p>1分ごとに自動で全データバックアップされます。</p>
            <ul>
              <li><b>保存先:</b> <code>~/Library/Application Support/AtelierX/kanban-backup.json</code></li>
              <li><b>ローテーション保護:</b> 保存時に前回データを <code>.prev.json</code> に自動退避。カード0件の場合は前回データから自動復元します。</li>
            </ul>
          </div>
        </div>
      )}

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
        <label>全データ</label>
        <div className="backup-buttons">
          <button type="button" className="btn-secondary" onClick={onExportBackup} disabled={!onExportBackup}>
            エクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={onImportBackup} disabled={!onImportBackup}>
            インポート
          </button>
        </div>
        <span className="form-hint">全データ（ボード・カード・設定・ログ）を保存・復元</span>
      </div>

      <div className="form-group">
        <label>設定プリセット</label>
        <div className="backup-buttons">
          <button type="button" className="btn-secondary" onClick={onExportSettingsPreset} disabled={!onExportSettingsPreset}>
            エクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={onImportSettingsPreset} disabled={!onImportSettingsPreset}>
            インポート
          </button>
        </div>
        <span className="form-hint">設定のみ（個人パス除外）。他の人と共有できます</span>
      </div>

      <div className="form-group">
        <label>カードデータ</label>
        <div className="backup-buttons">
          <button type="button" className="btn-secondary" onClick={onExportCardBackup} disabled={!onExportCardBackup}>
            エクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={onImportCardBackup} disabled={!onImportCardBackup}>
            インポート
          </button>
        </div>
        <span className="form-hint">カード・ボード・ログのみ。設定は保持されます</span>
      </div>

      <div className="form-group">
        <label>アンインストール</label>
        <button type="button" className="btn-uninstall" onClick={handleUninstall}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12" />
            <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
            <path d="M13 4v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4" />
            <line x1="7" y1="7" x2="7" y2="12" />
            <line x1="9" y1="7" x2="9" y2="12" />
          </svg>
          アンインストール
        </button>
        <span className="form-hint">アプリをゴミ箱に移動します。カンバンデータは保持されます。</span>
      </div>
    </div>
  );
}
