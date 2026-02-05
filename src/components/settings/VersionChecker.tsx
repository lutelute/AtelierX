import { useState, useEffect } from 'react';
import { UpdateStatus, UpdateProgress } from '../../types';

declare const __APP_VERSION__: string;

export function VersionChecker() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const currentVersion = __APP_VERSION__;

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
        const response = await fetch('https://api.github.com/repos/lutelute/AtelierX/releases/latest');
        if (!response.ok) {
          if (response.status === 404) { setUpdateStatus('latest'); return; }
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
      // ignore
    }
  };

  return (
    <div className="version-info">
      <div className="version-info-header">
        <div className="version-current">
          <span className="version-label">AtelierX</span>
          <span className="version-number">v{currentVersion}</span>
        </div>
        <div className="version-actions">
          {(updateStatus === 'idle' || updateStatus === 'latest' || updateStatus === 'error') && (
            <button type="button" className="btn-check-update" onClick={checkForUpdates}>更新を確認</button>
          )}
          {updateStatus === 'checking' && <span className="update-status-checking">確認中...</span>}
          {updateStatus === 'latest' && <span className="update-status-latest">最新です</span>}
          {updateStatus === 'available' && latestVersion && downloadUrl && (
            <button type="button" className="btn-download-update" onClick={handleDownload}>v{latestVersion} をダウンロード</button>
          )}
          {updateStatus === 'available' && latestVersion && !downloadUrl && (
            <a href="https://github.com/lutelute/AtelierX/releases/latest" target="_blank" rel="noopener noreferrer" className="btn-download-update">v{latestVersion} をダウンロード</a>
          )}
          {updateStatus === 'error' && <span className="update-status-error">{updateError || '確認に失敗'}</span>}
        </div>
      </div>

      {updateStatus === 'downloading' && (
        <div className="update-progress">
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${downloadProgress?.percent || 0}%` }} />
          </div>
          <span className="update-progress-text">
            {downloadProgress ? `${downloadProgress.percent}% (${downloadProgress.downloadedMB}MB / ${downloadProgress.totalMB}MB)` : 'ダウンロード準備中...'}
          </span>
        </div>
      )}

      {updateStatus === 'downloaded' && (
        <div className="update-downloaded">
          <p className="update-downloaded-text">ダウンロード完了！</p>
          <div className="update-downloaded-actions">
            <button type="button" className="btn-install-update" onClick={handleInstall}>インストール</button>
            <button type="button" className="btn-cleanup" onClick={handleCleanup}>キャンセル</button>
          </div>
        </div>
      )}

      {updateStatus === 'installing' && (
        <div className="update-installing"><p className="update-installing-text">インストール中...</p></div>
      )}

      {updateStatus === ('installed' as UpdateStatus) && (
        <div className="update-installed">
          <p className="update-installed-text">✓ インストール完了！</p>
          <button type="button" className="btn-restart-update" onClick={handleRestart}>再起動して更新を適用</button>
        </div>
      )}
    </div>
  );
}
