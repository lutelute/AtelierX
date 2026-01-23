import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { Card as CardType, TAG_COLORS, TAG_LABELS, SUBTAG_COLORS, SUBTAG_LABELS, CustomSubtag } from '../types';

interface CardProps {
  card: CardType;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onJump?: (id: string) => void;
  onUpdateDescription?: (id: string, description: string) => void;
  onCardClick?: (id: string) => void;
  onArchive?: (id: string) => void;
  customSubtags?: CustomSubtag[];
}

// Markdownコンテンツをレンダリング（チェックボックス対応）
function MarkdownContent({
  content,
  onToggleTask,
}: {
  content: string;
  onToggleTask?: (lineIndex: number) => void;
}) {
  // タスクリストがあるかチェック
  const hasTaskList = /^- \[([ x])\]/m.test(content);

  if (!hasTaskList) {
    // タスクがない場合は純粋なMarkdown表示
    return (
      <div className="card-markdown">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  // タスクリストがある場合はカスタムレンダリング
  const lines = content.split('\n');

  return (
    <div className="card-markdown">
      {lines.map((line, index) => {
        const taskMatch = line.match(/^- \[([ x])\]\s*(.*)/);
        if (taskMatch) {
          const isChecked = taskMatch[1] === 'x';
          const text = taskMatch[2];
          return (
            <label
              key={index}
              className={`task-item ${isChecked ? 'completed' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTask?.(index);
              }}
            >
              <span className={`task-checkbox ${isChecked ? 'checked' : ''}`}>
                {isChecked ? '✓' : ''}
              </span>
              <span className="task-text">{text}</span>
            </label>
          );
        } else if (line.trim()) {
          // 通常の行はMarkdownとしてレンダリング
          return (
            <div key={index} className="markdown-line">
              <ReactMarkdown>{line}</ReactMarkdown>
            </div>
          );
        }
        return <br key={index} />;
      })}
    </div>
  );
}

export function Card({ card, onDelete, onEdit, onJump, onUpdateDescription, onCardClick, onArchive, customSubtags = [] }: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // サブタグの色とラベルを取得
  const getSubtagInfo = (subtagId: string): { color: string; label: string } | null => {
    // デフォルトサブタグをチェック
    if (subtagId in SUBTAG_COLORS) {
      return {
        color: SUBTAG_COLORS[subtagId as keyof typeof SUBTAG_COLORS],
        label: SUBTAG_LABELS[subtagId as keyof typeof SUBTAG_LABELS],
      };
    }
    // カスタムサブタグをチェック
    const customTag = customSubtags.find((st) => st.id === subtagId);
    if (customTag) {
      return { color: customTag.color, label: customTag.name };
    }
    return null;
  };

  const subtagInfo = card.subtag ? getSubtagInfo(card.subtag) : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // タスクのチェック状態をトグル
  const handleToggleTask = (lineIndex: number) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const taskMatch = line.match(/^- \[([ x])\]\s*(.*)/);

    if (taskMatch) {
      const isChecked = taskMatch[1] === 'x';
      lines[lineIndex] = `- [${isChecked ? ' ' : 'x'}] ${taskMatch[2]}`;
      onUpdateDescription(card.id, lines.join('\n'));
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // ボタンやタスクチェックボックスからのクリックは無視
    if ((e.target as HTMLElement).closest('button, .task-item')) {
      return;
    }
    onCardClick?.(card.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card ${onCardClick ? 'card-clickable' : ''}`}
      onClick={handleCardClick}
      {...attributes}
      {...listeners}
    >
      <div className="card-header">
        <div className="card-tags">
          <span
            className="card-tag"
            style={{ backgroundColor: TAG_COLORS[card.tag] }}
          >
            {TAG_LABELS[card.tag]}
          </span>
          {subtagInfo && (
            <span
              className="card-subtag"
              style={{ backgroundColor: subtagInfo.color }}
            >
              {subtagInfo.label}
            </span>
          )}
        </div>
        <div className="card-actions">
          {onArchive && (
            <button
              className="card-archive"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(card.id);
              }}
              title="アーカイブ"
            >
              ↓
            </button>
          )}
          <button
            className="card-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(card.id);
            }}
            title="編集"
          >
            ...
          </button>
          <button
            className="card-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(card.id);
            }}
            title="削除"
          >
            ×
          </button>
        </div>
      </div>
      <h4 className="card-title">{card.title}</h4>
      {card.description && (
        <MarkdownContent
          content={card.description}
          onToggleTask={handleToggleTask}
        />
      )}
      {card.comment && (
        <div className="card-comment">
          <ReactMarkdown>{card.comment}</ReactMarkdown>
        </div>
      )}
      {card.windowApp && onJump && (
        <button
          className="card-jump-button"
          onClick={(e) => {
            e.stopPropagation();
            onJump(card.id);
          }}
        >
          {card.windowApp} を開く
        </button>
      )}
    </div>
  );
}
