interface BackupSectionProps {
  lastBackupTime?: number;
  onExportBackup?: () => void;
  onImportBackup?: () => void;
}

export function BackupSection({ lastBackupTime, onExportBackup, onImportBackup }: BackupSectionProps) {
  return (
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
          <button type="button" className="btn-secondary" onClick={onExportBackup} disabled={!onExportBackup}>
            JSONにエクスポート
          </button>
          <button type="button" className="btn-secondary" onClick={onImportBackup} disabled={!onImportBackup}>
            JSONからインポート
          </button>
        </div>
        <span className="form-hint">バックアップファイルを保存・復元できます</span>
      </div>
    </div>
  );
}
