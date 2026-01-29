import { useState } from 'react';
import { Card as CardType, SubTagType, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag, DefaultSubtagSettings } from '../types';

interface ArchiveSectionProps {
  cards: CardType[];
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
}

interface GroupedCards {
  [key: string]: CardType[];
}

function ArchiveCardViewer({ card, onClose, customSubtags = [], defaultSubtagSettings }: {
  card: CardType;
  onClose: () => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
}) {
  const formatDateTime = (timestamp?: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getSubtagLabel = (id: string) => {
    if (id in SUBTAG_LABELS) {
      const override = defaultSubtagSettings?.overrides?.[id];
      return override?.name || SUBTAG_LABELS[id as SubTagType];
    }
    const custom = customSubtags.find((st) => st.id === id);
    return custom?.name || id;
  };

  const getSubtagColor = (id: string) => {
    if (id in SUBTAG_COLORS) {
      const override = defaultSubtagSettings?.overrides?.[id];
      return override?.color || SUBTAG_COLORS[id as SubTagType];
    }
    const custom = customSubtags.find((st) => st.id === id);
    return custom?.color || '#6b7280';
  };

  const subtags = card.subtags || (card.subtag ? [card.subtag] : []);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const totalTime = card.timeRecords?.reduce((sum, r) => sum + (r.durationMs || 0), 0) || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal archive-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>アーカイブ詳細</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="archive-viewer-body">
          <div className="archive-viewer-title">{card.title}</div>

          {subtags.length > 0 && (
            <div className="archive-viewer-subtags">
              {subtags.map((st) => (
                <span
                  key={st}
                  className="archive-viewer-subtag"
                  style={{ backgroundColor: getSubtagColor(st) }}
                >
                  {getSubtagLabel(st)}
                </span>
              ))}
            </div>
          )}

          {card.description && (
            <div className="archive-viewer-section">
              <div className="archive-viewer-label">説明</div>
              <div className="archive-viewer-text">{card.description}</div>
            </div>
          )}

          {card.comment && (
            <div className="archive-viewer-section">
              <div className="archive-viewer-label">コメント</div>
              <div className="archive-viewer-text">{card.comment}</div>
            </div>
          )}

          {totalTime > 0 && (
            <div className="archive-viewer-section">
              <div className="archive-viewer-label">作業時間</div>
              <div className="archive-viewer-text">{formatDuration(totalTime)}</div>
            </div>
          )}

          <div className="archive-viewer-meta">
            <div className="archive-viewer-meta-row">
              <span className="archive-viewer-meta-label">作成</span>
              <span>{formatDateTime(card.createdAt)}</span>
            </div>
            {card.completedAt && (
              <div className="archive-viewer-meta-row">
                <span className="archive-viewer-meta-label">完了</span>
                <span>{formatDateTime(card.completedAt)}</span>
              </div>
            )}
            {card.archivedAt && (
              <div className="archive-viewer-meta-row">
                <span className="archive-viewer-meta-label">アーカイブ</span>
                <span>{formatDateTime(card.archivedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArchiveSection({ cards, onRestore, onDelete, customSubtags = [], defaultSubtagSettings }: ArchiveSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewingCard, setViewingCard] = useState<CardType | null>(null);

  if (cards.length === 0) {
    return null;
  }

  // サブタグでグループ化
  const groupedCards: GroupedCards = cards.reduce((acc, card) => {
    const key = card.subtag || 'none';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(card);
    return acc;
  }, {} as GroupedCards);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const getGroupLabel = (key: string) => {
    if (key === 'none') return 'サブタグなし';
    // デフォルトサブタグの場合
    if (key in SUBTAG_LABELS) {
      const override = defaultSubtagSettings?.overrides?.[key];
      return override?.name || SUBTAG_LABELS[key as SubTagType];
    }
    // カスタムサブタグの場合
    const customTag = customSubtags.find((st) => st.id === key);
    return customTag?.name || key;
  };

  const getGroupColor = (key: string) => {
    if (key === 'none') return '#6b7280';
    // デフォルトサブタグの場合
    if (key in SUBTAG_COLORS) {
      const override = defaultSubtagSettings?.overrides?.[key];
      return override?.color || SUBTAG_COLORS[key as SubTagType];
    }
    // カスタムサブタグの場合
    const customTag = customSubtags.find((st) => st.id === key);
    return customTag?.color || '#6b7280';
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="archive-section">
      <div
        className="archive-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="archive-toggle">{isExpanded ? '▼' : '▶'}</span>
        <h3>アーカイブ ({cards.length})</h3>
      </div>

      {isExpanded && (
        <div className="archive-content">
          {Object.entries(groupedCards).map(([key, groupCards]) => (
            <div key={key} className="archive-group">
              <div
                className="archive-group-header"
                onClick={() => toggleGroup(key)}
              >
                <span className="archive-toggle">
                  {expandedGroups.has(key) ? '▼' : '▶'}
                </span>
                <span
                  className="archive-group-tag"
                  style={{ backgroundColor: getGroupColor(key) }}
                >
                  {getGroupLabel(key)}
                </span>
                <span className="archive-group-count">({groupCards.length})</span>
              </div>

              {expandedGroups.has(key) && (
                <div className="archive-group-cards">
                  {groupCards.map(card => (
                    <div
                      key={card.id}
                      className="archive-card archive-card-clickable"
                      onClick={() => setViewingCard(card)}
                    >
                      <div className="archive-card-info">
                        <span className="archive-card-title">{card.title}</span>
                        <span className="archive-card-date">
                          {formatDate(card.archivedAt || card.completedAt)}
                        </span>
                      </div>
                      <div className="archive-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="archive-restore-btn"
                          onClick={() => onRestore(card.id)}
                          title="復元"
                        >
                          ↩
                        </button>
                        <button
                          className="archive-delete-btn"
                          onClick={() => onDelete(card.id)}
                          title="削除"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingCard && (
        <ArchiveCardViewer
          card={viewingCard}
          onClose={() => setViewingCard(null)}
          customSubtags={customSubtags}
          defaultSubtagSettings={defaultSubtagSettings}
        />
      )}
    </div>
  );
}
