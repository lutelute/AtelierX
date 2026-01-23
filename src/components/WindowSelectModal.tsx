import { useState, useEffect } from 'react';
import { AppWindow } from '../types';

interface WindowSelectModalProps {
  onClose: () => void;
  onSelect: (window: AppWindow) => void;
  appFilter?: 'Terminal' | 'Finder';
}

export function WindowSelectModal({ onClose, onSelect, appFilter }: WindowSelectModalProps) {
  const [windows, setWindows] = useState<AppWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const fetchWindows = async () => {
    try {
      if (window.electronAPI?.getAppWindows) {
        const appWindows = await window.electronAPI.getAppWindows();
        console.log('[WindowSelectModal] All windows:', appWindows.length);
        console.log('[WindowSelectModal] appFilter:', appFilter);
        // フィルタが指定されていればフィルタリング
        const filtered = appFilter
          ? appWindows.filter((w: AppWindow) => w.app === appFilter)
          : appWindows;
        console.log('[WindowSelectModal] Filtered:', filtered.length);
        setWindows(filtered);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWindows();
  }, [appFilter]);

  // 新しいターミナルを開く
  const handleOpenNewTerminal = async () => {
    if (!window.electronAPI?.openNewTerminal) return;
    setOpening(true);
    try {
      const result = await window.electronAPI.openNewTerminal();
      if (result.success && result.windowName) {
        // 少し待ってからウィンドウ一覧を再取得
        await new Promise(resolve => setTimeout(resolve, 500));
        const appWindows = await window.electronAPI.getAppWindows();
        const newWindow = appWindows.find(
          (w: AppWindow) => w.app === 'Terminal' && w.name.includes(result.windowName!)
        );
        if (newWindow) {
          onSelect(newWindow);
        } else {
          // フォールバック: 名前で作成
          onSelect({
            app: 'Terminal',
            id: Date.now().toString(),
            name: result.windowName,
          });
        }
      }
    } finally {
      setOpening(false);
    }
  };

  // 新しいFinderを開く
  const handleOpenNewFinder = async () => {
    if (!window.electronAPI?.openNewFinder) return;
    setOpening(true);
    try {
      const result = await window.electronAPI.openNewFinder();
      if (result.success && result.windowName) {
        // 少し待ってからウィンドウ一覧を再取得
        await new Promise(resolve => setTimeout(resolve, 500));
        const appWindows = await window.electronAPI.getAppWindows();
        const newWindow = appWindows.find(
          (w: AppWindow) => w.app === 'Finder' && w.name === result.windowName
        );
        if (newWindow) {
          onSelect(newWindow);
        } else {
          // フォールバック: 名前で作成
          onSelect({
            app: 'Finder',
            id: Date.now().toString(),
            name: result.windowName,
            path: result.path,
          });
        }
      }
    } finally {
      setOpening(false);
    }
  };

  const showTerminalButton = !appFilter || appFilter === 'Terminal';
  const showFinderButton = !appFilter || appFilter === 'Finder';
  const noWindows = !loading && windows.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal window-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>ウィンドウを選択</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="window-list">
          {loading && <div className="window-empty">読み込み中...</div>}
          {noWindows && (
            <div className="window-empty">
              {appFilter === 'Terminal' && 'Terminal のウィンドウが開いていません'}
              {appFilter === 'Finder' && 'Finder のウィンドウが開いていません'}
              {!appFilter && 'Terminal または Finder のウィンドウが開いていません'}
            </div>
          )}
          {!loading && windows.map((w) => (
            <button
              key={`${w.app}-${w.id}`}
              className={`window-item window-item-${w.app.toLowerCase()}`}
              onClick={() => {
                // 選択したウィンドウをポップアップして確認
                if (window.electronAPI?.activateWindow) {
                  window.electronAPI.activateWindow(w.app, w.id, w.name);
                }
                onSelect(w);
              }}
            >
              <span className={`window-app-badge window-app-${w.app.toLowerCase()}`}>
                {w.app}
              </span>
              <span className="window-name">{w.name.split(' — ')[0]}</span>
              {w.preview && (
                <span className="window-preview">{w.preview}</span>
              )}
            </button>
          ))}
        </div>

        {/* 新規ウィンドウを開くボタン */}
        <div className="window-open-new-section">
          {showTerminalButton && (
            <button
              className="btn-open-new btn-open-new-terminal"
              onClick={handleOpenNewTerminal}
              disabled={opening}
            >
              {opening ? '開いています...' : '新しい Terminal を開く'}
            </button>
          )}
          {showFinderButton && noWindows && (
            <button
              className="btn-open-new btn-open-new-finder"
              onClick={handleOpenNewFinder}
              disabled={opening}
            >
              {opening ? '開いています...' : 'Finder を開く'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
