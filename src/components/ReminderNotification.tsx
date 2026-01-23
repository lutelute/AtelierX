import { useState } from 'react';
import { AppWindow, Card } from '../types';

interface ReminderNotificationProps {
  unaddedWindows: AppWindow[];
  brokenLinkCards: Card[];
  onAddWindow: (window: AppWindow) => void;
  onRelinkCard: (card: Card) => void;
  onDismiss: () => void;
}

type TabType = 'unadded' | 'broken';

export function ReminderNotification({
  unaddedWindows,
  brokenLinkCards,
  onAddWindow,
  onRelinkCard,
  onDismiss,
}: ReminderNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('unadded');

  const totalCount = unaddedWindows.length + brokenLinkCards.length;

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="reminder-notification">
      <div className="reminder-header">
        <div className="reminder-title">
          <span className="reminder-icon">!</span>
          <span>
            {unaddedWindows.length > 0 && brokenLinkCards.length > 0
              ? `未追加 ${unaddedWindows.length}件 / リンク切れ ${brokenLinkCards.length}件`
              : unaddedWindows.length > 0
              ? `追加されていないウィンドウ (${unaddedWindows.length}件)`
              : `リンク切れカード (${brokenLinkCards.length}件)`}
          </span>
        </div>
        <div className="reminder-actions">
          <button
            className="reminder-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '閉じる' : '表示'}
          </button>
          <button
            className="reminder-dismiss"
            onClick={onDismiss}
            title="このリマインダを閉じる"
          >
            ×
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="reminder-content">
          {unaddedWindows.length > 0 && brokenLinkCards.length > 0 && (
            <div className="reminder-tabs">
              <button
                className={`reminder-tab ${activeTab === 'unadded' ? 'active' : ''}`}
                onClick={() => setActiveTab('unadded')}
              >
                未追加 ({unaddedWindows.length})
              </button>
              <button
                className={`reminder-tab ${activeTab === 'broken' ? 'active' : ''}`}
                onClick={() => setActiveTab('broken')}
              >
                リンク切れ ({brokenLinkCards.length})
              </button>
            </div>
          )}
          <div className="reminder-list">
            {(activeTab === 'unadded' || brokenLinkCards.length === 0) &&
              unaddedWindows.length > 0 &&
              unaddedWindows.map((window, index) => (
                <div key={`unadded-${window.app}-${window.id}-${index}`} className="reminder-item">
                  <div className="reminder-item-info">
                    <span className={`reminder-app-badge ${window.app === 'Terminal' ? 'terminal' : 'finder'}`}>
                      {window.app}
                    </span>
                    <span className="reminder-window-name">{window.name.split(' — ')[0]}</span>
                  </div>
                  <button
                    className="reminder-add-button"
                    onClick={() => onAddWindow(window)}
                  >
                    追加
                  </button>
                </div>
              ))}
            {(activeTab === 'broken' || unaddedWindows.length === 0) &&
              brokenLinkCards.length > 0 &&
              brokenLinkCards.map((card) => (
                <div key={`broken-${card.id}`} className="reminder-item broken">
                  <div className="reminder-item-info">
                    <span className={`reminder-app-badge ${card.windowApp === 'Terminal' ? 'terminal' : 'finder'}`}>
                      {card.windowApp || card.tag}
                    </span>
                    <span className="reminder-window-name">{card.title}</span>
                  </div>
                  <button
                    className="reminder-relink-button"
                    onClick={() => onRelinkCard(card)}
                  >
                    再リンク
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
