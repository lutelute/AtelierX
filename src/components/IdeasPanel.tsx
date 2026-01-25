import { useState } from 'react';
import { Idea, BoardType, IDEA_CATEGORY_COLORS, IDEA_CATEGORY_LABELS } from '../types';

interface IdeasPanelProps {
  ideas: Idea[];
  onAddIdea: () => void;
  onRestoreToBoard: (ideaId: string, targetBoard: BoardType) => void;
  onDeleteIdea: (ideaId: string) => void;
}

interface GroupedIdeas {
  [key: string]: Idea[];
}

export function IdeasPanel({ ideas, onAddIdea, onRestoreToBoard, onDeleteIdea }: IdeasPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['feature', 'improvement', 'bug', 'other'])
  );

  // カテゴリでグループ化
  const groupedIdeas: GroupedIdeas = ideas.reduce((acc, idea) => {
    const key = idea.category || 'other';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(idea);
    return acc;
  }, {} as GroupedIdeas);

  // カテゴリの順序
  const categoryOrder = ['feature', 'improvement', 'bug', 'other'];

  // カスタムカテゴリも含める
  const allCategories = new Set([...categoryOrder, ...Object.keys(groupedIdeas)]);
  const sortedCategories = [...allCategories].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

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

  const getCategoryLabel = (category: string) => {
    return IDEA_CATEGORY_LABELS[category] || category;
  };

  const getCategoryColor = (category: string) => {
    return IDEA_CATEGORY_COLORS[category] || '#6b7280';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="ideas-panel">
      <div className="ideas-header">
        <button className="ideas-add-btn" onClick={onAddIdea}>
          <span className="add-icon">+</span>
          <span>アイデア追加</span>
        </button>
      </div>

      <div className="ideas-content">
        {sortedCategories.map((category) => {
          const categoryIdeas = groupedIdeas[category] || [];
          const count = categoryIdeas.length;

          return (
            <div key={category} className="ideas-group">
              <div
                className="ideas-group-header"
                onClick={() => toggleGroup(category)}
              >
                <span className="ideas-toggle">
                  {expandedGroups.has(category) ? '▼' : '▶'}
                </span>
                <span
                  className="ideas-group-tag"
                  style={{ backgroundColor: getCategoryColor(category) }}
                >
                  {getCategoryLabel(category)}
                </span>
                <span className="ideas-group-count">({count})</span>
              </div>

              {expandedGroups.has(category) && categoryIdeas.length > 0 && (
                <div className="ideas-group-cards">
                  {categoryIdeas.map(idea => (
                    <div key={idea.id} className="idea-card">
                      <div className="idea-card-content">
                        <div className="idea-card-title">{idea.title}</div>
                        {idea.description && (
                          <div className="idea-card-description">{idea.description}</div>
                        )}
                        <div className="idea-card-date">{formatDate(idea.createdAt)}</div>
                      </div>
                      <div className="idea-card-actions">
                        <button
                          className="idea-restore-btn terminal"
                          onClick={() => onRestoreToBoard(idea.id, 'terminal')}
                          title="Terminalボードに追加"
                        >
                          → Terminal
                        </button>
                        <button
                          className="idea-restore-btn finder"
                          onClick={() => onRestoreToBoard(idea.id, 'finder')}
                          title="Finderボードに追加"
                        >
                          → Finder
                        </button>
                        <button
                          className="idea-delete-btn"
                          onClick={() => onDeleteIdea(idea.id)}
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
          );
        })}

        {ideas.length === 0 && (
          <div className="ideas-empty">
            <p>アイデアがまだありません</p>
            <p className="ideas-empty-hint">「+ アイデア追加」から思いついたことをメモしておきましょう</p>
          </div>
        )}
      </div>
    </div>
  );
}
