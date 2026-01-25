import { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { Card as CardType, TAG_COLORS, TAG_LABELS, SUBTAG_COLORS, SUBTAG_LABELS, CustomSubtag, DefaultSubtagSettings, PluginCardActionInfo } from '../types';

interface CardProps {
  card: CardType;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onJump?: (id: string) => void;
  onUpdateDescription?: (id: string, description: string) => void;
  onCardClick?: (id: string) => void;
  onArchive?: (id: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  isBrokenLink?: boolean;
  columnId?: string;
  cardActions?: PluginCardActionInfo[];
  onCardAction?: (actionId: string, taskIndex?: number) => void;
}

// 拡張チェックボックスパターン (Minimal theme互換)
// 全ての有効な記号を含む
const VALID_MARKERS = ' xX><!?/-+RiBPCQNIpLEArcTt@OWfFH&sDd~';
const CHECKBOX_PATTERN = new RegExp(`^- \\[[${VALID_MARKERS.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}]\\]`, 'm');
const CHECKBOX_EXTRACT = new RegExp(`^- \\[([${VALID_MARKERS.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}])\\]\\s*(.*)`);

// チェックボックスの状態に応じた表示 (Minimal theme互換)
const CHECKBOX_DISPLAY: Record<string, { icon: string; className: string; label: string }> = {
  // 基本
  ' ': { icon: '', className: '', label: '未完了' },
  'x': { icon: '✓', className: 'completed', label: '完了' },
  'X': { icon: '✓', className: 'completed', label: '完了' },
  // タスク管理
  '>': { icon: '→', className: 'deferred', label: '先送り' },
  '<': { icon: '←', className: 'scheduled', label: 'スケジュール済み' },
  '-': { icon: '—', className: 'cancelled', label: 'キャンセル' },
  '/': { icon: '◐', className: 'in-progress', label: '進行中' },
  'd': { icon: '◉', className: 'doing', label: '作業中' },
  // 重要度・優先度
  '!': { icon: '❗', className: 'important', label: '重要' },
  '?': { icon: '❓', className: 'question', label: '質問' },
  '+': { icon: '➕', className: 'add', label: '追加' },
  // アイデア・ブレスト
  'i': { icon: '💡', className: 'idea', label: 'アイデア' },
  'B': { icon: '🧠', className: 'brainstorm', label: 'ブレスト' },
  'R': { icon: '🔍', className: 'research', label: 'リサーチ' },
  // 議論・検討
  'P': { icon: '👍', className: 'pro', label: '賛成' },
  'C': { icon: '👎', className: 'con', label: '反対' },
  'Q': { icon: '💬', className: 'quote', label: '引用' },
  'N': { icon: '📝', className: 'note', label: 'メモ' },
  // 情報
  'I': { icon: 'ℹ️', className: 'info', label: '情報' },
  'b': { icon: '🔖', className: 'bookmark', label: 'ブックマーク' },
  'p': { icon: '📄', className: 'paraphrase', label: '要約' },
  'L': { icon: '📍', className: 'location', label: '場所' },
  'E': { icon: '📋', className: 'example', label: '例' },
  'A': { icon: '💡', className: 'answer', label: '回答' },
  // その他
  'r': { icon: '🎁', className: 'reward', label: '報酬' },
  'c': { icon: '🔀', className: 'choice', label: '選択' },
  'T': { icon: '⏰', className: 'time', label: '時間' },
  '@': { icon: '👤', className: 'person', label: '人物' },
  't': { icon: '💭', className: 'talk', label: '会話' },
  'O': { icon: '📊', className: 'outline', label: 'アウトライン' },
  '~': { icon: '⚡', className: 'conflict', label: '課題' },
  'W': { icon: '🌍', className: 'world', label: 'ワールド' },
  'f': { icon: '🔎', className: 'find', label: '発見' },
  'F': { icon: '🎯', className: 'foreshadow', label: '伏線' },
  'H': { icon: '❤️', className: 'favorite', label: 'お気に入り' },
  '&': { icon: '🔣', className: 'symbol', label: 'シンボル' },
  's': { icon: '🤫', className: 'secret', label: '秘密' },
  'D': { icon: '📅', className: 'date', label: '日付' },
};

// よく使うチェックボックスのグループ（右クリックメニュー用）
const CHECKBOX_GROUPS = [
  { name: '基本', items: [' ', 'x', '/', '-', '>'] },
  { name: '優先度', items: ['!', '?', '+'] },
  { name: 'アイデア', items: ['i', 'B', 'R', 'N'] },
  { name: '議論', items: ['P', 'C', 'Q'] },
  { name: '情報', items: ['I', 'b', 'L', 'E'] },
  { name: 'その他', items: ['T', '@', 'H', 's'] },
];

// Markdownコンテンツをレンダリング（チェックボックス対応）
function MarkdownContent({
  content,
  onToggleTask,
  onChangeTaskMarker,
  taskActions,
  onTaskAction,
}: {
  content: string;
  onToggleTask?: (lineIndex: number) => void;
  onChangeTaskMarker?: (lineIndex: number, newMarker: string) => void;
  taskActions?: PluginCardActionInfo[];
  onTaskAction?: (actionId: string, taskIndex: number) => void;
}) {
  // 右クリックメニューの状態
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lineIndex: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // タスクリストがあるかチェック（拡張チェックボックス対応）
  const hasTaskList = CHECKBOX_PATTERN.test(content);

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

  const handleContextMenu = (e: React.MouseEvent, lineIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex });
  };

  const handleSelectMarker = (marker: string) => {
    if (contextMenu && onChangeTaskMarker) {
      onChangeTaskMarker(contextMenu.lineIndex, marker);
    }
    setContextMenu(null);
  };

  return (
    <div className="card-markdown">
      {lines.map((line, index) => {
        const taskMatch = line.match(CHECKBOX_EXTRACT);
        if (taskMatch) {
          const marker = taskMatch[1];
          const display = CHECKBOX_DISPLAY[marker] || CHECKBOX_DISPLAY[' '];
          const text = taskMatch[2];
          return (
            <div key={index} className="task-item-wrapper">
              <label
                className={`task-item ${display.className}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTask?.(index);
                }}
                onContextMenu={(e) => handleContextMenu(e, index)}
              >
                <span className={`task-checkbox ${display.className}`}>
                  {display.icon}
                </span>
                <span className="task-text">{text}</span>
              </label>
              {taskActions && taskActions.length > 0 && (
                <div className="task-actions">
                  {taskActions.map((action) => (
                    <button
                      key={action.id}
                      className="task-action-btn"
                      title={action.title || action.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskAction?.(action.id, index);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

      {/* 右クリックメニュー */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="checkbox-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {CHECKBOX_GROUPS.map((group) => (
            <div key={group.name} className="checkbox-menu-group">
              <div className="checkbox-menu-group-label">{group.name}</div>
              <div className="checkbox-menu-items">
                {group.items.map((m) => {
                  const d = CHECKBOX_DISPLAY[m];
                  return (
                    <button
                      key={m}
                      className="checkbox-menu-item"
                      onClick={() => handleSelectMarker(m)}
                      title={d?.label}
                    >
                      <span className="checkbox-menu-icon">{d?.icon || '☐'}</span>
                      <span className="checkbox-menu-label">{d?.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="checkbox-menu-help">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://minimal.guide/checklists', '_blank');
              }}
            >
              ヘルプ: チェックボックス一覧
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Card({ card, onDelete, onEdit, onJump, onUpdateDescription, onCardClick, onArchive, customSubtags = [], defaultSubtagSettings, isBrokenLink = false, columnId, cardActions = [], onCardAction }: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // サブタグの色とラベルを取得（上書き設定を適用）
  const getSubtagInfo = (subtagId: string): { color: string; label: string } | null => {
    // デフォルトサブタグをチェック
    if (subtagId in SUBTAG_COLORS) {
      const override = defaultSubtagSettings?.overrides?.[subtagId];
      return {
        color: override?.color || SUBTAG_COLORS[subtagId as keyof typeof SUBTAG_COLORS],
        label: override?.name || SUBTAG_LABELS[subtagId as keyof typeof SUBTAG_LABELS],
      };
    }
    // カスタムサブタグをチェック
    const customTag = customSubtags.find((st) => st.id === subtagId);
    if (customTag) {
      return { color: customTag.color, label: customTag.name };
    }
    return null;
  };

  // 後方互換性: subtag と subtags 両方をサポート
  const cardSubtags = card.subtags || (card.subtag ? [card.subtag] : []);
  const subtagInfos = cardSubtags.map(st => getSubtagInfo(st)).filter((info): info is { color: string; label: string } => info !== null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // タスクのチェック状態をトグル（クリックで完了/未完了を切り替え）
  const handleToggleTask = (lineIndex: number) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const taskMatch = line.match(CHECKBOX_EXTRACT);

    if (taskMatch) {
      const currentMarker = taskMatch[1];
      // 完了/未完了のトグル
      const newMarker = currentMarker === 'x' || currentMarker === 'X' ? ' ' : 'x';
      lines[lineIndex] = `- [${newMarker}] ${taskMatch[2]}`;
      onUpdateDescription(card.id, lines.join('\n'));
    }
  };

  // タスクのマーカーを変更（右クリックメニューから）
  const handleChangeTaskMarker = (lineIndex: number, newMarker: string) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const taskMatch = line.match(CHECKBOX_EXTRACT);

    if (taskMatch) {
      lines[lineIndex] = `- [${newMarker}] ${taskMatch[2]}`;
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

  // プラグインカードアクションを位置別にフィルタリング
  const headerActions = cardActions.filter(a => a.position === 'card-header');
  const footerActions = cardActions.filter(a => a.position === 'card-footer');
  const taskActions = cardActions.filter(a => a.position === 'task');

  // ウィンドウリンクの状態でクラスを追加
  const hasWindowLink = !!card.windowApp;
  const linkClass = isBrokenLink ? 'card-broken-link' : hasWindowLink ? 'card-linked' : 'card-unlinked';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card ${onCardClick ? 'card-clickable' : ''} ${linkClass} ${columnId ? `card-status-${columnId}` : ''}`}
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
          {subtagInfos.map((info, index) => (
            <span
              key={index}
              className="card-subtag"
              style={{ backgroundColor: info.color }}
            >
              {info.label}
            </span>
          ))}
        </div>
        <div className="card-actions">
          {headerActions.map((action) => (
            <button
              key={action.id}
              className="card-plugin-action"
              onClick={(e) => {
                e.stopPropagation();
                onCardAction?.(action.id);
              }}
              title={action.title || action.label}
            >
              {action.label}
            </button>
          ))}
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
          onChangeTaskMarker={handleChangeTaskMarker}
          taskActions={taskActions}
          onTaskAction={(actionId, taskIndex) => onCardAction?.(actionId, taskIndex)}
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
          title={card.windowId ? `ID: ${card.windowId}` : undefined}
        >
          {card.windowApp} を開く
          {card.windowId && <span className="jump-button-id"> ({card.windowId.slice(-8)})</span>}
        </button>
      )}
      {footerActions.length > 0 && (
        <div className="card-footer-actions">
          {footerActions.map((action) => (
            <button
              key={action.id}
              className="card-footer-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCardAction?.(action.id);
              }}
              title={action.title || action.label}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
