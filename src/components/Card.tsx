import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { Card as CardType, CardStatusMarker, TAG_COLORS, TAG_LABELS, SUBTAG_COLORS, SUBTAG_LABELS, CustomSubtag, DefaultSubtagSettings, PluginCardActionInfo, TimerAction } from '../types';

interface CardProps {
  card: CardType;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onJump?: (id: string) => void;
  onCloseWindow?: (id: string) => void;
  onUpdateDescription?: (id: string, description: string) => void;
  onUpdateStatusMarker?: (id: string, marker: CardStatusMarker) => void;
  onCardClick?: (id: string) => void;
  onArchive?: (id: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  isBrokenLink?: boolean;
  columnId?: string;
  cardActions?: PluginCardActionInfo[];
  onCardAction?: (actionId: string, taskIndex?: number) => void;
  onTimerAction?: (taskIndex: number, action: TimerAction) => void;
}

// 拡張チェックボックスパターン (Minimal theme互換)
const VALID_MARKERS = ' xX><!?/-+RiBPCQNIpLEArcTt@OWfFH&sDd~';
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

// カード用のステータスマーカー（簡略版）
const CARD_STATUS_MARKERS: CardStatusMarker[] = [' ', 'x', '/', '>', '-', '!', '?', 'i', 'd'];

// パースされたコンテンツ行の型
interface ParsedLine {
  type: 'task' | 'text' | 'empty';
  marker?: string;
  text?: string;
  original: string;
}

// コンテキストメニューのポータルコンポーネント
const ContextMenuPortal = memo(function ContextMenuPortal({
  position,
  onClose,
  children,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // 少し遅延させてからリスナーを追加（即座にクリックイベントが発火するのを防ぐ）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 画面端に近い場合は位置を調整
  const adjustedPosition = useMemo(() => {
    const menuWidth = 220;
    const menuHeight = 300;
    const padding = 10;

    let x = position.x;
    let y = position.y;

    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }

    return { x, y };
  }, [position]);

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu-portal"
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 10000,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body
  );
});

// チェックボックスサブメニュー
const CheckboxSubmenu = memo(function CheckboxSubmenu({
  onSelect,
  currentMarker,
}: {
  onSelect: (marker: string) => void;
  currentMarker?: string;
}) {
  return (
    <div className="checkbox-submenu">
      {CHECKBOX_GROUPS.map((group) => (
        <div key={group.name} className="checkbox-menu-group">
          <div className="checkbox-menu-group-label">{group.name}</div>
          <div className="checkbox-menu-items">
            {group.items.map((m) => {
              const d = CHECKBOX_DISPLAY[m];
              const isActive = currentMarker === m;
              return (
                <button
                  key={m}
                  className={`checkbox-menu-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelect(m)}
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
            e.stopPropagation();
            window.open('https://minimal.guide/checklists', '_blank');
          }}
        >
          ヘルプ: チェックボックス一覧
        </a>
      </div>
    </div>
  );
});

// カードステータスメニュー（簡略版）
const CardStatusMenu = memo(function CardStatusMenu({
  onSelect,
  currentMarker,
}: {
  onSelect: (marker: CardStatusMarker) => void;
  currentMarker?: CardStatusMarker;
}) {
  return (
    <div className="card-status-menu">
      {CARD_STATUS_MARKERS.map((m) => {
        const d = CHECKBOX_DISPLAY[m];
        const isActive = currentMarker === m;
        return (
          <button
            key={m}
            className={`card-status-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(m)}
            title={d?.label}
          >
            <span className="card-status-icon">{d?.icon || '☐'}</span>
            <span className="card-status-label">{d?.label}</span>
          </button>
        );
      })}
    </div>
  );
});

// Markdownコンテンツをレンダリング（チェックボックス対応）
// タイマーメニューコンポーネント（全ボタン常時表示版）
const TimerMenu = memo(function TimerMenu({
  isRunning,
  onAction,
}: {
  isRunning: boolean;
  onAction: (action: TimerAction) => void;
}) {
  return (
    <div className="timer-menu">
      <div className="timer-menu-header">
        <span className="timer-icon">⏱</span>
        <span className="timer-label">タイマー</span>
        {isRunning && <span className="timer-status running">実行中</span>}
      </div>
      <div className="timer-menu-actions horizontal">
        <button
          className={`timer-action-btn start ${isRunning ? 'disabled' : ''}`}
          onClick={() => !isRunning && onAction('start')}
          title="開始"
        >
          ▶
        </button>
        <button
          className={`timer-action-btn pause ${!isRunning ? 'disabled' : ''}`}
          onClick={() => isRunning && onAction('pause')}
          title="一時停止"
        >
          ⏸
        </button>
        <button
          className={`timer-action-btn stop ${!isRunning ? 'disabled' : ''}`}
          onClick={() => isRunning && onAction('stop')}
          title="終了"
        >
          ⏹
        </button>
        <button
          className={`timer-action-btn cancel ${!isRunning ? 'disabled' : ''}`}
          onClick={() => isRunning && onAction('cancel')}
          title="キャンセル"
        >
          ✕
        </button>
      </div>
    </div>
  );
});

const MarkdownContent = memo(function MarkdownContent({
  content,
  onToggleTask,
  onChangeTaskMarker,
  taskActions: _taskActions,  // v0.6.1で無効化（将来のプラグイン用に保持）
  onTaskAction: _onTaskAction,  // v0.6.1で無効化（将来のプラグイン用に保持）
  onTimerAction,
}: {
  content: string;
  onToggleTask?: (lineIndex: number) => void;
  onChangeTaskMarker?: (lineIndex: number, newMarker: string) => void;
  taskActions?: PluginCardActionInfo[];
  onTaskAction?: (actionId: string, taskIndex: number) => void;
  onTimerAction?: (taskIndex: number, action: TimerAction) => void;
}) {
  // 未使用変数の警告抑制（将来のプラグイン用に保持）
  void _taskActions;
  void _onTaskAction;
  // 右クリックメニューの状態
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lineIndex: number; taskIndex: number; marker: string; isTimerRunning: boolean } | null>(null);

  // コンテンツをパース（メモ化）- taskIndex とタイマー状態を含める
  const parsedLines = useMemo(() => {
    const lines = content.split('\n');
    let taskCounter = 0;
    return lines.map((line, idx): ParsedLine & { taskIndex?: number; isTimerRunning?: boolean } => {
      const taskMatch = line.match(CHECKBOX_EXTRACT);
      if (taskMatch) {
        // タスク以下のタイマー行をすべてチェック（実行中のものがあるか）
        let isTimerRunning = false;
        for (let i = idx + 1; i < lines.length; i++) {
          const checkLine = lines[i].trim();
          // 次のタスク行に到達したら終了
          if (CHECKBOX_EXTRACT.test(lines[i])) break;
          // 空行やタイマー行以外もスキップ
          if (!checkLine.startsWith('⏱')) continue;
          // 実行中のタイマー行かチェック（「開始」で終わり、経過時間がない）
          // 完了: ⏱ 2026-01-26 12:34-2026-01-26 13:00 (26分)
          // 実行中: ⏱ 2026-01-26 12:34開始
          if (checkLine.endsWith('開始')) {
            isTimerRunning = true;
            break;
          }
        }
        const result = {
          type: 'task' as const,
          marker: taskMatch[1],
          text: taskMatch[2],
          original: line,
          taskIndex: taskCounter,
          isTimerRunning,
        };
        taskCounter++;
        return result;
      } else if (line.trim()) {
        return { type: 'text' as const, original: line };
      }
      return { type: 'empty' as const, original: line };
    });
  }, [content]);

  // タスクリストがあるかチェック
  const hasTaskList = useMemo(() => {
    return parsedLines.some((line) => line.type === 'task');
  }, [parsedLines]);

  const handleContextMenu = useCallback((e: React.MouseEvent, lineIndex: number, taskIndex: number, marker: string, isTimerRunning: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex, taskIndex, marker, isTimerRunning });
  }, []);

  const handleSelectMarker = useCallback((marker: string) => {
    if (contextMenu && onChangeTaskMarker) {
      onChangeTaskMarker(contextMenu.lineIndex, marker);
    }
    setContextMenu(null);
  }, [contextMenu, onChangeTaskMarker]);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // タイマーアクションのハンドラ
  const handleTimerAction = useCallback((action: TimerAction) => {
    if (contextMenu && onTimerAction) {
      onTimerAction(contextMenu.taskIndex, action);
    }
    setContextMenu(null);
  }, [contextMenu, onTimerAction]);

  if (!hasTaskList) {
    // タスクがない場合は純粋なMarkdown表示
    return (
      <div className="card-markdown">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="card-markdown">
      {parsedLines.map((line, index) => {
        if (line.type === 'task') {
          const display = CHECKBOX_DISPLAY[line.marker!] || CHECKBOX_DISPLAY[' '];
          const taskIndex = line.taskIndex!;
          const isTimerRunning = line.isTimerRunning || false;
          return (
            <div key={index} className={`task-item-wrapper ${isTimerRunning ? 'timer-active' : ''}`}>
              <label
                className={`task-item ${display.className}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTask?.(index);
                }}
                onContextMenu={(e) => handleContextMenu(e, index, taskIndex, line.marker!, isTimerRunning)}
              >
                <span className={`task-checkbox ${display.className}`}>
                  {display.icon}
                </span>
                <span className="task-text">{line.text}</span>
                {isTimerRunning && (
                  <span className="task-timer-indicator running">⏱</span>
                )}
              </label>
              {/* プラグインタスクアクションボタン（v0.6.1で無効化 - タイマーは右クリックメニューに移行）
              {taskActions && taskActions.length > 0 && (
                <div className="task-actions">
                  {taskActions.map((action) => (
                    <button
                      key={action.id}
                      className="task-action-btn"
                      title={action.title || action.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskAction?.(action.id, taskIndex);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              */}
            </div>
          );
        } else if (line.type === 'text') {
          return (
            <div key={index} className="markdown-line">
              <ReactMarkdown>{line.original}</ReactMarkdown>
            </div>
          );
        }
        return <br key={index} />;
      })}

      {/* 右クリックメニュー（Portal経由） */}
      {contextMenu && (
        <ContextMenuPortal
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeMenu}
        >
          <div className="task-context-menu">
            {/* タイマーメニュー */}
            {onTimerAction && (
              <>
                <TimerMenu
                  isRunning={contextMenu.isTimerRunning}
                  onAction={handleTimerAction}
                />
                <div className="context-menu-divider" />
              </>
            )}
            {/* ステータス変更メニュー */}
            <div className="context-menu-header">ステータスを変更</div>
            <CheckboxSubmenu
              onSelect={handleSelectMarker}
              currentMarker={contextMenu.marker}
            />
          </div>
        </ContextMenuPortal>
      )}
    </div>
  );
});

export function Card({ card, onDelete, onEdit, onJump, onCloseWindow, onUpdateDescription, onUpdateStatusMarker, onCardClick, onArchive, customSubtags = [], defaultSubtagSettings, isBrokenLink = false, columnId, cardActions = [], onCardAction, onTimerAction }: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // カード右クリックメニュー
  const [cardContextMenu, setCardContextMenu] = useState<{ x: number; y: number; showStatusSubmenu: boolean } | null>(null);

  // サブタグの色とラベルを取得（上書き設定を適用）
  const getSubtagInfo = useCallback((subtagId: string): { color: string; label: string } | null => {
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
  }, [customSubtags, defaultSubtagSettings]);

  // 後方互換性: subtag と subtags 両方をサポート
  const cardSubtags = card.subtags || (card.subtag ? [card.subtag] : []);
  const subtagInfos = useMemo(() => {
    return cardSubtags.map(st => getSubtagInfo(st)).filter((info): info is { color: string; label: string } => info !== null);
  }, [cardSubtags, getSubtagInfo]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // タスクのチェック状態をトグル（クリックで完了/未完了を切り替え）
  const handleToggleTask = useCallback((lineIndex: number) => {
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
  }, [card.id, card.description, onUpdateDescription]);

  // タスクのマーカーを変更（右クリックメニューから）
  const handleChangeTaskMarker = useCallback((lineIndex: number, newMarker: string) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const taskMatch = line.match(CHECKBOX_EXTRACT);

    if (taskMatch) {
      lines[lineIndex] = `- [${newMarker}] ${taskMatch[2]}`;
      onUpdateDescription(card.id, lines.join('\n'));
    }
  }, [card.id, card.description, onUpdateDescription]);

  // カード自体のステータス変更
  const handleChangeCardStatus = useCallback((marker: CardStatusMarker) => {
    if (onUpdateStatusMarker) {
      onUpdateStatusMarker(card.id, marker);
    }
    setCardContextMenu(null);
  }, [card.id, onUpdateStatusMarker]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // ボタンやタスクチェックボックスからのクリックは無視
    if ((e.target as HTMLElement).closest('button, .task-item, .card-status-marker')) {
      return;
    }
    onCardClick?.(card.id);
  }, [card.id, onCardClick]);

  // カード右クリック
  const handleCardContextMenu = useCallback((e: React.MouseEvent) => {
    // タスク行からの右クリックは無視（タスク専用メニューを表示）
    if ((e.target as HTMLElement).closest('.task-item')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCardContextMenu({ x: e.clientX, y: e.clientY, showStatusSubmenu: false });
  }, []);

  const closeCardMenu = useCallback(() => setCardContextMenu(null), []);

  // プラグインカードアクションを位置別にフィルタリング
  const headerActions = useMemo(() => cardActions.filter(a => a.position === 'card-header'), [cardActions]);
  const footerActions = useMemo(() => cardActions.filter(a => a.position === 'card-footer'), [cardActions]);
  const taskActions = useMemo(() => cardActions.filter(a => a.position === 'task'), [cardActions]);

  // ウィンドウリンクの状態でクラスを追加
  const hasWindowLink = !!card.windowApp;
  const linkClass = isBrokenLink ? 'card-broken-link' : hasWindowLink ? 'card-linked' : 'card-unlinked';

  // カードステータスマーカーの表示
  const statusMarker = card.statusMarker || ' ';
  const statusDisplay = CHECKBOX_DISPLAY[statusMarker] || CHECKBOX_DISPLAY[' '];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card ${onCardClick ? 'card-clickable' : ''} ${linkClass} ${columnId ? `card-status-${columnId}` : ''}`}
      onClick={handleCardClick}
      onContextMenu={handleCardContextMenu}
      {...attributes}
      {...listeners}
    >
      <div className="card-header">
        <div className="card-tags">
          {/* カードステータスマーカー */}
          {onUpdateStatusMarker && (
            <span
              className={`card-status-marker ${statusDisplay.className}`}
              onClick={(e) => {
                e.stopPropagation();
                // クリックで完了/未完了トグル
                const newMarker = statusMarker === 'x' ? ' ' : 'x';
                onUpdateStatusMarker(card.id, newMarker as CardStatusMarker);
              }}
              title={`ステータス: ${statusDisplay.label}`}
            >
              {statusDisplay.icon}
            </span>
          )}
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
          onTimerAction={onTimerAction ? (taskIndex, action) => onTimerAction(taskIndex, action) : undefined}
        />
      )}
      {card.comment && (
        <div className="card-comment">
          <ReactMarkdown>{card.comment}</ReactMarkdown>
        </div>
      )}
      {card.windowApp && onJump && (
        <div className="card-window-actions">
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
          {onCloseWindow && (
            <button
              className="card-close-window-button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseWindow(card.id);
              }}
              title={`${card.windowApp} を閉じる`}
            >
              ✕
            </button>
          )}
        </div>
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

      {/* カード右クリックメニュー */}
      {cardContextMenu && (
        <ContextMenuPortal
          position={{ x: cardContextMenu.x, y: cardContextMenu.y }}
          onClose={closeCardMenu}
        >
          <div className="card-context-menu">
            {onUpdateStatusMarker && (
              <>
                <div className="context-menu-section">
                  <div className="context-menu-header">カードステータス</div>
                  <CardStatusMenu
                    onSelect={handleChangeCardStatus}
                    currentMarker={card.statusMarker}
                  />
                </div>
                <div className="context-menu-divider" />
              </>
            )}
            <div className="context-menu-actions">
              <button
                className="context-menu-action"
                onClick={() => {
                  onEdit(card.id);
                  closeCardMenu();
                }}
              >
                <span className="context-action-icon">✏️</span>
                <span>編集</span>
              </button>
              {onJump && card.windowApp && (
                <button
                  className="context-menu-action"
                  onClick={() => {
                    onJump(card.id);
                    closeCardMenu();
                  }}
                >
                  <span className="context-action-icon">↗️</span>
                  <span>{card.windowApp} を開く</span>
                </button>
              )}
              {onCloseWindow && card.windowApp && (
                <button
                  className="context-menu-action"
                  onClick={() => {
                    onCloseWindow(card.id);
                    closeCardMenu();
                  }}
                >
                  <span className="context-action-icon">✕</span>
                  <span>{card.windowApp} を閉じる</span>
                </button>
              )}
              {onArchive && (
                <button
                  className="context-menu-action"
                  onClick={() => {
                    onArchive(card.id);
                    closeCardMenu();
                  }}
                >
                  <span className="context-action-icon">📥</span>
                  <span>アーカイブ</span>
                </button>
              )}
              <div className="context-menu-divider" />
              <button
                className="context-menu-action danger"
                onClick={() => {
                  onDelete(card.id);
                  closeCardMenu();
                }}
              >
                <span className="context-action-icon">🗑️</span>
                <span>削除</span>
              </button>
            </div>
          </div>
        </ContextMenuPortal>
      )}
    </div>
  );
}
