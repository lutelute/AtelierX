import { useState } from 'react';
import { AppWindow } from '../types';

interface ReminderNotificationProps {
  unaddedWindows: AppWindow[];
  onAddWindow: (window: AppWindow) => void;
  onDismiss: () => void;
}

export function ReminderNotification({ unaddedWindows, onAddWindow, onDismiss }: ReminderNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (unaddedWindows.length === 0) {
    return null;
  }

  return (
    <div className="reminder-notification">
      <div className="reminder-header">
        <div className="reminder-title">
          <span className="reminder-icon">!</span>
          <span>追加されていないウィンドウがあります ({unaddedWindows.length}件)</span>
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
        <div className="reminder-list">
          {unaddedWindows.map((window, index) => (
            <div key={`${window.app}-${window.id}-${index}`} className="reminder-item">
              <div className="reminder-item-info">
                <span className={`reminder-app-badge ${window.app === 'Terminal' ? 'terminal' : 'finder'}`}>
                  {window.app}
                </span>
                <span className="reminder-window-name">{window.name}</span>
              </div>
              <button
                className="reminder-add-button"
                onClick={() => onAddWindow(window)}
              >
                追加
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
