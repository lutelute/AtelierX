import { useState, useEffect } from 'react';
import { Card, AppWindow, WindowHistory, getPrimaryWindow } from '../types';

interface RelinkWindowModalProps {
  card: Card;
  windowHistory: WindowHistory[];
  onClose: () => void;
  onSelectCurrent: (window: AppWindow) => void;
  onSelectHistory: (history: WindowHistory) => void;
  onOpenNew: () => void;
  onUnlink: () => void;
}

export function RelinkWindowModal({
  card,
  windowHistory,
  onClose,
  onSelectCurrent,
  onSelectHistory,
  onOpenNew,
  onUnlink,
}: RelinkWindowModalProps) {
  const [currentWindows, setCurrentWindows] = useState<AppWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // 同じアプリの履歴をフィルタ（複数ウィンドウ対応）
  const primaryWindow = getPrimaryWindow(card);
  const cardApp = primaryWindow?.app || card.windowApp;
  const cardWindowId = primaryWindow?.id || card.windowId;
  const relevantHistory = windowHistory.filter(
    (h) => h.app === cardApp && h.windowId !== cardWindowId
  );

  // 現在のウィンドウ一覧を取得
  useEffect(() => {
    const fetchWindows = async () => {
      if (!window.electronAPI?.getAppWindows) {
        setLoading(false);
        return;
      }
      try {
        const windows = await window.electronAPI.getAppWindows();
        const filtered = windows.filter(
          (w: AppWindow) => w.app === cardApp
        );
        setCurrentWindows(filtered);
      } finally {
        setLoading(false);
      }
    };
    fetchWindows();
  }, [cardApp]);

  // 新しいターミナルを開く
  const handleOpenNew = async () => {
    if (!window.electronAPI?.openNewTerminal) return;
    setOpening(true);
    try {
      await onOpenNew();
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal relink-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>ウィンドウが見つかりません</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="relink-message">
          <p>
            <strong>{card.title}</strong> にリンクされていたウィンドウが見つかりませんでした。
          </p>
          <p className="relink-old-info">
            元のウィンドウ: {(primaryWindow?.name || card.windowName || '').split(' — ')[0]}
            {cardWindowId && <span className="relink-old-id"> (ID: {cardWindowId.slice(-8)})</span>}
          </p>
        </div>

        <div className="relink-tabs">
          <button
            className={`relink-tab ${activeTab === 'current' ? 'active' : ''}`}
            onClick={() => setActiveTab('current')}
          >
            現在のウィンドウ ({currentWindows.length})
          </button>
          <button
            className={`relink-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            履歴 ({relevantHistory.length})
          </button>
        </div>

        <div className="relink-content">
          {activeTab === 'current' && (
            <div className="relink-list">
              {loading && <div className="relink-empty">読み込み中...</div>}
              {!loading && currentWindows.length === 0 && (
                <div className="relink-empty">
                  {cardApp} のウィンドウがありません
                </div>
              )}
              {!loading && currentWindows.map((w) => (
                <button
                  key={`${w.app}-${w.id}`}
                  className="relink-item"
                  onClick={() => {
                    if (window.electronAPI?.activateWindow) {
                      window.electronAPI.activateWindow(w.app, w.id, w.name);
                    }
                    onSelectCurrent(w);
                  }}
                >
                  <span className={`window-app-badge window-app-${w.app.toLowerCase()}`}>
                    {w.app} #{w.windowIndex ?? 1}
                  </span>
                  <span className="relink-item-name">{w.name.split(' — ')[0]}</span>
                  <span className="relink-item-id">ID: {w.id.slice(-8)}</span>
                  {w.preview && (
                    <span className="relink-item-preview">{w.preview}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="relink-list">
              {relevantHistory.length === 0 && (
                <div className="relink-empty">履歴がありません</div>
              )}
              {relevantHistory.map((h) => (
                <button
                  key={h.id}
                  className="relink-item relink-item-history"
                  onClick={() => onSelectHistory(h)}
                >
                  <span className={`window-app-badge window-app-${h.app.toLowerCase()}`}>
                    {h.app}
                  </span>
                  <span className="relink-item-name">{h.windowName.split(' — ')[0]}</span>
                  <span className="relink-item-id">ID: {h.windowId.slice(-8)}</span>
                  <span className="relink-item-card">元カード: {h.cardTitle}</span>
                  <span className="relink-item-date">
                    {new Date(h.lastUsed).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relink-actions">
          {cardApp === 'Terminal' && (
            <button
              className="btn-relink-new"
              onClick={handleOpenNew}
              disabled={opening}
            >
              {opening ? '開いています...' : '+ 新しい Terminal を開く'}
            </button>
          )}
          <button className="btn-relink-unlink" onClick={onUnlink}>
            リンクを解除
          </button>
        </div>
      </div>
    </div>
  );
}
