import { Idea, BoardType } from '../types';

interface IdeasPanelProps {
  ideas: Idea[];
  onAddIdea: () => void;
  onRestoreToBoard: (ideaId: string, targetBoard: BoardType) => void;
  onDeleteIdea: (ideaId: string) => void;
}

export function IdeasPanel({ ideas, onAddIdea, onRestoreToBoard, onDeleteIdea }: IdeasPanelProps) {
  return (
    <div className="ideas-panel">
      <div className="ideas-header">
        <h2>Ideas</h2>
        <button onClick={onAddIdea}>+ 新しいアイデア</button>
      </div>
      <div className="ideas-list">
        {ideas.map((idea) => (
          <div key={idea.id} className="idea-card">
            <h3>{idea.title}</h3>
            {idea.description && <p>{idea.description}</p>}
            <div className="idea-actions">
              <button onClick={() => onRestoreToBoard(idea.id, idea.targetBoard || 'terminal')}>
                ボードに追加
              </button>
              <button onClick={() => onDeleteIdea(idea.id)}>削除</button>
            </div>
          </div>
        ))}
        {ideas.length === 0 && (
          <p className="ideas-empty">アイデアはまだありません</p>
        )}
      </div>
    </div>
  );
}
