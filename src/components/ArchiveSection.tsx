import { useState, useMemo, useCallback } from 'react';
import { Card as CardType, SubTagType, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag, DefaultSubtagSettings } from '../types';

interface ArchiveSectionProps {
  cards: CardType[];
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
}

interface YearGroup {
  year: number;
  subtagGroups: { [subtagKey: string]: CardType[] };
  totalCount: number;
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
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => {
    const currentYear = new Date().getFullYear();
    return new Set([currentYear]);
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewingCard, setViewingCard] = useState<CardType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubtagFilters, setActiveSubtagFilters] = useState<Set<string>>(new Set());

  const getCardSubtags = useCallback((card: CardType): string[] => {
    return card.subtags || (card.subtag ? [card.subtag] : []);
  }, []);

  const getCardYear = useCallback((card: CardType): number => {
    const ts = card.archivedAt || card.completedAt || card.createdAt;
    return new Date(ts).getFullYear();
  }, []);

  // 全サブタグのリストを収集（フィルタUI用）
  const allSubtags = useMemo(() => {
    const tagSet = new Set<string>();
    cards.forEach(card => {
      const tags = getCardSubtags(card);
      tags.forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [cards, getCardSubtags]);

  // 検索・フィルタ適用済みカード
  const filteredCards = useMemo(() => {
    let result = cards;

    // テキスト検索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(card =>
        card.title.toLowerCase().includes(q) ||
        (card.description || '').toLowerCase().includes(q) ||
        (card.comment || '').toLowerCase().includes(q)
      );
    }

    // サブタグフィルタ
    if (activeSubtagFilters.size > 0) {
      result = result.filter(card => {
        const tags = getCardSubtags(card);
        if (tags.length === 0) {
          return activeSubtagFilters.has('none');
        }
        return tags.some(t => activeSubtagFilters.has(t));
      });
    }

    return result;
  }, [cards, searchQuery, activeSubtagFilters, getCardSubtags]);

  const isSearchActive = searchQuery.trim() !== '' || activeSubtagFilters.size > 0;

  // 年 → サブタグの2階層グループ化
  const yearGroups = useMemo((): YearGroup[] => {
    const yearMap: { [year: number]: { [subtagKey: string]: CardType[] } } = {};

    filteredCards.forEach(card => {
      const year = getCardYear(card);
      if (!yearMap[year]) yearMap[year] = {};

      const tags = getCardSubtags(card);
      if (tags.length === 0) {
        if (!yearMap[year]['none']) yearMap[year]['none'] = [];
        yearMap[year]['none'].push(card);
      } else {
        tags.forEach(tag => {
          if (!yearMap[year][tag]) yearMap[year][tag] = [];
          yearMap[year][tag].push(card);
        });
      }
    });

    return Object.entries(yearMap)
      .map(([yearStr, subtagGroups]) => {
        const totalCount = Object.values(subtagGroups).reduce((sum, arr) => sum + arr.length, 0);
        return { year: Number(yearStr), subtagGroups, totalCount };
      })
      .sort((a, b) => b.year - a.year);
  }, [filteredCards, getCardYear, getCardSubtags]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleSubtagFilter = (tag: string) => {
    setActiveSubtagFilters(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const getGroupLabel = (key: string) => {
    if (key === 'none') return 'サブタグなし';
    if (key in SUBTAG_LABELS) {
      const override = defaultSubtagSettings?.overrides?.[key];
      return override?.name || SUBTAG_LABELS[key as SubTagType];
    }
    const customTag = customSubtags.find((st) => st.id === key);
    return customTag?.name || key;
  };

  const getGroupColor = (key: string) => {
    if (key === 'none') return '#6b7280';
    if (key in SUBTAG_COLORS) {
      const override = defaultSubtagSettings?.overrides?.[key];
      return override?.color || SUBTAG_COLORS[key as SubTagType];
    }
    const customTag = customSubtags.find((st) => st.id === key);
    return customTag?.color || '#6b7280';
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (cards.length === 0) {
    return null;
  }

  const renderCardList = (cardList: CardType[]) => (
    <div className="archive-group-cards">
      {cardList.map(card => (
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
  );

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
          {/* 検索・フィルタバー */}
          <div className="archive-search-bar">
            <input
              type="text"
              className="archive-search-input"
              placeholder="タイトル・説明・コメントで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {(allSubtags.length > 0) && (
              <div className="archive-filter-tags">
                {allSubtags.map(tag => (
                  <button
                    key={tag}
                    className={`archive-filter-tag ${activeSubtagFilters.has(tag) ? 'active' : ''}`}
                    style={{
                      backgroundColor: activeSubtagFilters.has(tag) ? getGroupColor(tag) : 'transparent',
                      borderColor: getGroupColor(tag),
                      color: activeSubtagFilters.has(tag) ? '#fff' : getGroupColor(tag),
                    }}
                    onClick={() => toggleSubtagFilter(tag)}
                  >
                    {getGroupLabel(tag)}
                  </button>
                ))}
                <button
                  className={`archive-filter-tag ${activeSubtagFilters.has('none') ? 'active' : ''}`}
                  style={{
                    backgroundColor: activeSubtagFilters.has('none') ? '#6b7280' : 'transparent',
                    borderColor: '#6b7280',
                    color: activeSubtagFilters.has('none') ? '#fff' : '#6b7280',
                  }}
                  onClick={() => toggleSubtagFilter('none')}
                >
                  タグなし
                </button>
              </div>
            )}
          </div>

          {/* 検索結果表示 */}
          {filteredCards.length === 0 ? (
            <div className="archive-empty">該当するカードがありません</div>
          ) : isSearchActive ? (
            /* 検索/フィルタ時はフラットリスト */
            <div className="archive-flat-results">
              <div className="archive-results-count">
                {filteredCards.length} 件の結果
              </div>
              {renderCardList(filteredCards)}
            </div>
          ) : (
            /* 通常: 年 → サブタグの2階層表示 */
            yearGroups.map(({ year, subtagGroups, totalCount }) => (
              <div key={year} className="archive-year-group">
                <div
                  className="archive-year-header"
                  onClick={() => toggleYear(year)}
                >
                  <span className="archive-toggle">
                    {expandedYears.has(year) ? '▼' : '▶'}
                  </span>
                  <span className="archive-year-label">{year}年</span>
                  <span className="archive-group-count">({totalCount})</span>
                </div>

                {expandedYears.has(year) && (
                  <div className="archive-year-content">
                    {Object.entries(subtagGroups).map(([subtagKey, groupCards]) => {
                      const compositeKey = `${year}:${subtagKey}`;
                      return (
                        <div key={compositeKey} className="archive-group">
                          <div
                            className="archive-group-header"
                            onClick={() => toggleGroup(compositeKey)}
                          >
                            <span className="archive-toggle">
                              {expandedGroups.has(compositeKey) ? '▼' : '▶'}
                            </span>
                            <span
                              className="archive-group-tag"
                              style={{ backgroundColor: getGroupColor(subtagKey) }}
                            >
                              {getGroupLabel(subtagKey)}
                            </span>
                            <span className="archive-group-count">({groupCards.length})</span>
                          </div>

                          {expandedGroups.has(compositeKey) && renderCardList(groupCards)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
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
