import { useState } from 'react';
import { Card as CardType, SubTagType, SUBTAG_LABELS, SUBTAG_COLORS } from '../types';

interface ArchiveSectionProps {
  cards: CardType[];
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

interface GroupedCards {
  [key: string]: CardType[];
}

export function ArchiveSection({ cards, onRestore, onDelete }: ArchiveSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

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
    return SUBTAG_LABELS[key as SubTagType];
  };

  const getGroupColor = (key: string) => {
    if (key === 'none') return '#6b7280';
    return SUBTAG_COLORS[key as SubTagType];
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
                    <div key={card.id} className="archive-card">
                      <div className="archive-card-info">
                        <span className="archive-card-title">{card.title}</span>
                        <span className="archive-card-date">
                          {formatDate(card.archivedAt || card.completedAt)}
                        </span>
                      </div>
                      <div className="archive-card-actions">
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
    </div>
  );
}
