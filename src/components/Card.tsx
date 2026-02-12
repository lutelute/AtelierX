import { useState, useEffect, useRef, useMemo, useCallback, memo, } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { Card as CardType, CardStatusMarker, SUBTAG_COLORS, SUBTAG_LABELS, CustomSubtag, DefaultSubtagSettings, PluginCardActionInfo, TimerAction, Priority, PriorityConfig, DEFAULT_PRIORITIES, getTagColor, getTagLabel, Settings, getCardWindows } from '../types';
import { CHECKBOX_EXTRACT, CHECKBOX_DISPLAY, CHECKBOX_GROUPS, CARD_STATUS_MARKERS } from '../utils/checkboxConstants';

interface CardProps {
  card: CardType;
  columnColor?: string;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onJump?: (id: string, windowRefId?: string) => void;
  onCloseWindow?: (id: string, windowRefId?: string) => void;
  onUnlinkWindow?: (id: string, windowRefId?: string) => void;
  onAddWindowToCard?: (id: string) => void;
  onUpdateDescription?: (id: string, description: string) => void;
  onUpdateComment?: (id: string, comment: string) => void;
  onUpdateStatusMarker?: (id: string, marker: CardStatusMarker) => void;
  onUpdatePriority?: (priority: Priority | undefined) => void;
  onCardClick?: (id: string) => void;
  onArchive?: (id: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  isBrokenLink?: boolean;
  columnId?: string;
  cardActions?: PluginCardActionInfo[];
  onCardAction?: (actionId: string, taskIndex?: number) => void;
  onTimerAction?: (taskIndex: number, action: TimerAction) => void;
  priorityConfigs?: PriorityConfig[];
  onAddPriority?: (config: PriorityConfig) => void;
  settings?: Settings;
  onUpdateSettings?: (updater: (prev: Settings) => Settings) => void;
}

// パースされたコンテンツ行の型
interface ParsedLine {
  type: 'task' | 'list' | 'text' | 'empty';
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

// 優先順位メニュー（動的 + カスタム追加）
const PRIORITY_PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

const PriorityMenu = memo(function PriorityMenu({
  currentPriority,
  allPriorities,
  onSelect,
  onAddPriority,
}: {
  currentPriority?: Priority;
  allPriorities: PriorityConfig[];
  onSelect: (priority: Priority | undefined) => void;
  onAddPriority?: (config: PriorityConfig) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRIORITY_PRESET_COLORS[4]);

  const handleAdd = () => {
    if (!newLabel.trim() || !onAddPriority) return;
    const config: PriorityConfig = {
      id: `priority-${Date.now()}`,
      label: newLabel.trim(),
      color: newColor,
    };
    onAddPriority(config);
    setNewLabel('');
    setAdding(false);
  };

  return (
    <>
      <div className="context-menu-section">
        <div className="context-menu-header">優先順位</div>
        <div className="priority-menu">
          {allPriorities.map((p) => (
            <button
              key={p.id}
              className={`priority-item ${currentPriority === p.id ? 'active' : ''}`}
              onClick={() => onSelect(currentPriority === p.id ? undefined : p.id)}
            >
              <span className="priority-dot" style={{ background: p.color }} />
              <span className="priority-label">{p.label}</span>
            </button>
          ))}
          {onAddPriority && (
            <button
              className="priority-item priority-add-btn"
              onClick={() => setAdding(!adding)}
            >
              +
            </button>
          )}
        </div>
        {adding && onAddPriority && (
          <div className="priority-add-form">
            <input
              type="text"
              className="priority-add-input"
              placeholder="ラベル"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              autoFocus
            />
            <div className="priority-add-colors">
              {PRIORITY_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`priority-color-option ${newColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
              <label className="color-custom-input round" title="カスタム色">
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12.5 2.5l1 1-7.5 7.5-2.5.5.5-2.5 7.5-7.5z" />
                </svg>
              </label>
            </div>
            <button
              className="priority-add-confirm"
              onClick={handleAdd}
              disabled={!newLabel.trim()}
            >
              追加
            </button>
          </div>
        )}
      </div>
      <div className="context-menu-divider" />
    </>
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
  onAddTask,
}: {
  content: string;
  onToggleTask?: (lineIndex: number) => void;
  onChangeTaskMarker?: (lineIndex: number, newMarker: string) => void;
  taskActions?: PluginCardActionInfo[];
  onTaskAction?: (actionId: string, taskIndex: number) => void;
  onTimerAction?: (taskIndex: number, action: TimerAction) => void;
  onAddTask?: (text: string) => void;
}) {
  // 未使用変数の警告抑制（将来のプラグイン用に保持）
  void _taskActions;
  void _onTaskAction;
  // 右クリックメニューの状態
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lineIndex: number; taskIndex: number; marker: string; isTimerRunning: boolean } | null>(null);
  // タスク追加入力の状態
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const addTaskInputRef = useRef<HTMLInputElement>(null);

  // コンテンツをパース（メモ化）- taskIndex とタイマー状態とインデントを含める
  const parsedLines = useMemo(() => {
    const lines = content.split('\n');
    let taskCounter = 0;
    return lines.map((line, idx): ParsedLine & { taskIndex?: number; isTimerRunning?: boolean; indent?: number } => {
      // インデント検出: 行頭の空白を除去してからマッチ
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
      const trimmedLine = line.trimStart();
      const taskMatch = trimmedLine.match(CHECKBOX_EXTRACT);
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
          indent: Math.floor(leadingSpaces / 2),
        };
        taskCounter++;
        return result;
      }
      // 通常のリスト項目（- text, * text）を検出
      const listMatch = trimmedLine.match(/^[-*]\s+(.+)/);
      if (listMatch) {
        return {
          type: 'list' as const,
          text: listMatch[1],
          original: line,
          indent: Math.floor(leadingSpaces / 2),
        };
      }
      if (line.trim()) {
        return { type: 'text' as const, original: line };
      }
      return { type: 'empty' as const, original: line };
    });
  }, [content]);

  // タスクリストまたはリストがあるかチェック
  const hasTaskList = useMemo(() => {
    return parsedLines.some((line) => line.type === 'task' || line.type === 'list');
  }, [parsedLines]);

  const handleContextMenu = useCallback((e: React.MouseEvent, lineIndex: number, taskIndex: number, marker: string, isTimerRunning: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex, taskIndex, marker, isTimerRunning });
  }, []);

  const handleSelectMarker = useCallback((marker: string) => {
    if (contextMenu && onChangeTaskMarker) {
      onChangeTaskMarker(contextMenu.lineIndex, marker);
      // メニューは閉じない（マーカーを更新して開いたまま）
      setContextMenu(prev => prev ? { ...prev, marker } : null);
    }
  }, [contextMenu, onChangeTaskMarker]);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // タスク追加
  const handleAddTask = useCallback(() => {
    if (!newTaskText.trim() || !onAddTask) return;
    onAddTask(newTaskText.trim());
    setNewTaskText('');
    // 入力欄は開いたまま、連続追加可能
  }, [newTaskText, onAddTask]);

  const handleAddTaskKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAddTask();
    } else if (e.key === 'Escape') {
      setShowAddTask(false);
      setNewTaskText('');
    }
  }, [handleAddTask]);

  // showAddTaskがtrueになったらフォーカス
  useEffect(() => {
    if (showAddTask && addTaskInputRef.current) {
      addTaskInputRef.current.focus();
    }
  }, [showAddTask]);

  // タイマーアクションのハンドラ（メニューは閉じない）
  const handleTimerAction = useCallback((action: TimerAction) => {
    if (contextMenu && onTimerAction) {
      onTimerAction(contextMenu.taskIndex, action);
      // タイマー状態を更新してメニューは開いたまま
      const newIsRunning = action === 'start';
      setContextMenu(prev => prev ? { ...prev, isTimerRunning: newIsRunning } : null);
    }
  }, [contextMenu, onTimerAction]);

  if (!hasTaskList) {
    // タスクがない場合は純粋なMarkdown表示 + タスク追加ボタン
    return (
      <div className="card-markdown">
        <ReactMarkdown>{content}</ReactMarkdown>
        {onAddTask && (
          <div className="task-add-area">
            {showAddTask ? (
              <div className="task-add-input-wrapper" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={addTaskInputRef}
                  type="text"
                  className="task-add-input"
                  placeholder="新しいタスク..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={handleAddTaskKeyDown}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                <button
                  className="task-add-confirm"
                  onClick={(e) => { e.stopPropagation(); handleAddTask(); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!newTaskText.trim()}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                className="task-add-toggle"
                onClick={(e) => { e.stopPropagation(); setShowAddTask(true); }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                + タスク追加
              </button>
            )}
          </div>
        )}
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
            <div key={index} className={`task-item-wrapper ${isTimerRunning ? 'timer-active' : ''}`} style={line.indent ? { marginLeft: `${line.indent * 16}px` } : undefined}>
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
        } else if (line.type === 'list') {
          return (
            <div key={index} className="list-item-wrapper" style={line.indent ? { marginLeft: `${line.indent * 16}px` } : undefined}>
              <span className="list-item-bullet">-</span>
              <span className="list-item-text">{line.text}</span>
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

      {/* タスク追加UI */}
      {onAddTask && (
        <div className="task-add-area">
          {showAddTask ? (
            <div className="task-add-input-wrapper" onClick={(e) => e.stopPropagation()}>
              <input
                ref={addTaskInputRef}
                type="text"
                className="task-add-input"
                placeholder="新しいタスク..."
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={handleAddTaskKeyDown}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <button
                className="task-add-confirm"
                onClick={(e) => { e.stopPropagation(); handleAddTask(); }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={!newTaskText.trim()}
              >
                +
              </button>
            </div>
          ) : (
            <button
              className="task-add-toggle"
              onClick={(e) => { e.stopPropagation(); setShowAddTask(true); }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              + タスク追加
            </button>
          )}
        </div>
      )}

      {/* 右クリックメニュー（Portal経由） */}
      {contextMenu && (
        <ContextMenuPortal
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeMenu}
        >
          <div className="task-context-menu">
            <div className="context-menu-topbar">
              <span className="context-menu-topbar-title">タスクメニュー</span>
              <button className="context-menu-close" onClick={closeMenu} title="閉じる">✕</button>
            </div>
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

export const Card = memo(function Card({ card, columnColor, onDelete, onEdit, onJump, onCloseWindow, onUnlinkWindow, onAddWindowToCard, onUpdateDescription, onUpdateComment, onUpdateStatusMarker, onUpdatePriority, onCardClick, onArchive, customSubtags = [], defaultSubtagSettings, isBrokenLink = false, columnId: _columnId, cardActions = [], onCardAction, onTimerAction, priorityConfigs, onAddPriority, settings, onUpdateSettings }: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // ウィンドウ閉じる確認
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

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

  // 優先順位の全リスト（デフォルト + カスタム）
  const allPriorities = useMemo(() => {
    return [...DEFAULT_PRIORITIES, ...(priorityConfigs || [])];
  }, [priorityConfigs]);

  // カラム色 + 優先順位に基づくスタイル計算
  const priorityStyle = useMemo(() => {
    if (!card.priority) return { opacity: 0.03, borderWidth: 3 };
    const idx = allPriorities.findIndex(p => p.id === card.priority);
    if (idx === -1) return { opacity: 0.03, borderWidth: 3 };
    // リスト上位ほど高優先 → 太い/濃い
    const ratio = 1 - idx / Math.max(allPriorities.length - 1, 1);
    return {
      opacity: 0.03 + ratio * 0.07,
      borderWidth: 3 + Math.round(ratio * 2),
    };
  }, [card.priority, allPriorities]);

  const columnColorStyle = useMemo(() => {
    if (!columnColor) return undefined;
    const alphaHex = Math.round(priorityStyle.opacity * 255).toString(16).padStart(2, '0');
    return {
      borderLeft: `${priorityStyle.borderWidth}px solid ${columnColor}`,
      background: `${columnColor}${alphaHex}`,
    };
  }, [columnColor, priorityStyle]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...columnColorStyle,
  };

  // タスクのチェック状態をトグル（クリックで完了/未完了を切り替え）
  const handleToggleTask = useCallback((lineIndex: number) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const indent = line.match(/^(\s*)/)?.[1] || '';
    const taskMatch = line.trimStart().match(CHECKBOX_EXTRACT);

    if (taskMatch) {
      const currentMarker = taskMatch[1];
      // 完了/未完了のトグル
      const newMarker = currentMarker === 'x' || currentMarker === 'X' ? ' ' : 'x';
      lines[lineIndex] = `${indent}- [${newMarker}] ${taskMatch[2]}`;
      onUpdateDescription(card.id, lines.join('\n'));
    }
  }, [card.id, card.description, onUpdateDescription]);

  // タスクを追加（リストの末尾に）
  const handleAddTaskToList = useCallback((text: string) => {
    if (!onUpdateDescription) return;
    const currentDesc = card.description || '';
    const newLine = `- [ ] ${text}`;
    // 既存の説明がある場合は改行して追加、ない場合はそのまま
    const newDesc = currentDesc ? `${currentDesc}\n${newLine}` : newLine;
    onUpdateDescription(card.id, newDesc);
  }, [card.id, card.description, onUpdateDescription]);

  // コメントのタスクトグル
  const handleToggleCommentTask = useCallback((lineIndex: number) => {
    if (!card.comment || !onUpdateComment) return;
    const lines = card.comment.split('\n');
    const line = lines[lineIndex];
    const indent = line.match(/^(\s*)/)?.[1] || '';
    const taskMatch = line.trimStart().match(CHECKBOX_EXTRACT);
    if (taskMatch) {
      const currentMarker = taskMatch[1];
      const newMarker = currentMarker === 'x' || currentMarker === 'X' ? ' ' : 'x';
      lines[lineIndex] = `${indent}- [${newMarker}] ${taskMatch[2]}`;
      onUpdateComment(card.id, lines.join('\n'));
    }
  }, [card.id, card.comment, onUpdateComment]);

  // コメントのタスクマーカー変更
  const handleChangeCommentTaskMarker = useCallback((lineIndex: number, newMarker: string) => {
    if (!card.comment || !onUpdateComment) return;
    const lines = card.comment.split('\n');
    const line = lines[lineIndex];
    const indent = line.match(/^(\s*)/)?.[1] || '';
    const taskMatch = line.trimStart().match(CHECKBOX_EXTRACT);
    if (taskMatch) {
      lines[lineIndex] = `${indent}- [${newMarker}] ${taskMatch[2]}`;
      onUpdateComment(card.id, lines.join('\n'));
    }
  }, [card.id, card.comment, onUpdateComment]);

  // タスクのマーカーを変更（右クリックメニューから）
  const handleChangeTaskMarker = useCallback((lineIndex: number, newMarker: string) => {
    if (!card.description || !onUpdateDescription) return;

    const lines = card.description.split('\n');
    const line = lines[lineIndex];
    const indent = line.match(/^(\s*)/)?.[1] || '';
    const taskMatch = line.trimStart().match(CHECKBOX_EXTRACT);

    if (taskMatch) {
      lines[lineIndex] = `${indent}- [${newMarker}] ${taskMatch[2]}`;
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

  // 優先順位変更
  const handleChangePriority = useCallback((priority: Priority | undefined) => {
    onUpdatePriority?.(priority);
    setCardContextMenu(null);
  }, [onUpdatePriority]);

  // カードが「進行中」か判定（タイマー動作中 or [/][d]マーカー）
  const isCardInProgress = useMemo(() => {
    if (!card.description) return false;
    const lines = card.description.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // タイマー動作中
      if (trimmed.startsWith('⏱') && trimmed.endsWith('開始')) return true;
      // [/] 進行中 or [d] 作業中 マーカー
      const match = trimmed.match(CHECKBOX_EXTRACT);
      if (match && (match[1] === '/' || match[1] === 'd')) return true;
    }
    return false;
  }, [card.description]);

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

  // 複数ウィンドウ対応
  const cardWindows = useMemo(() => getCardWindows(card), [card]);

  // ウィンドウリンクの状態でクラスを追加
  const hasWindowLink = cardWindows.length > 0;
  const linkClass = isBrokenLink ? 'card-broken-link' : hasWindowLink ? 'card-linked' : 'card-unlinked';

  // カードステータスマーカーの表示
  const statusMarker = card.statusMarker || ' ';
  const statusDisplay = CHECKBOX_DISPLAY[statusMarker] || CHECKBOX_DISPLAY[' '];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card ${onCardClick ? 'card-clickable' : ''} ${linkClass} ${columnColor ? 'card-column-colored' : ''} ${card.priority && allPriorities.length > 0 && card.priority === allPriorities[0].id ? 'card-priority-high' : ''} ${isCardInProgress ? 'card-in-progress' : ''}`}
      data-card-id={card.id}
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
            style={{ backgroundColor: getTagColor(card.tag) }}
          >
            {getTagLabel(card.tag)}
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
          {card.priority && (() => {
            const pConfig = allPriorities.find(p => p.id === card.priority);
            return pConfig ? (
              <span
                className="card-priority-badge"
                style={{ backgroundColor: pConfig.color }}
              >
                {pConfig.label}
              </span>
            ) : null;
          })()}
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
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
              <path d="M9.5 3.5l3 3" />
            </svg>
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
          onAddTask={onUpdateDescription ? handleAddTaskToList : undefined}
        />
      )}
      {card.comment && (
        <div className="card-comment">
          <MarkdownContent
            content={card.comment}
            onToggleTask={handleToggleCommentTask}
            onChangeTaskMarker={handleChangeCommentTaskMarker}
          />
        </div>
      )}
      {cardWindows.length > 0 && onJump && (
        <div className="card-windows-section" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          {cardWindows.map((ref) => (
            <div
              key={ref.id || ref.name}
              className={`card-window-row window-app-row-${ref.app.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => onJump(card.id, ref.id)}
              title={`${ref.app} を開く: ${ref.name}`}
            >
              <span className={`card-window-row-icon window-app-${ref.app.toLowerCase().replace(/\s+/g, '-')}`}>
                {ref.app === 'Terminal' ? '>_' : ref.app === 'Finder' ? '📁' : '◻'}
              </span>
              <span className="card-window-row-name">{ref.name.split(' — ')[0]}</span>
              <div className="card-window-row-actions">
                {onUnlinkWindow && (
                  <button
                    className="card-window-row-btn card-window-row-unlink"
                    onClick={(e) => { e.stopPropagation(); onUnlinkWindow(card.id, ref.id); }}
                    title="リンク解除"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 5L5 11" /><path d="M5 5l6 6" />
                    </svg>
                  </button>
                )}
                <span className="card-window-row-sep" />
                {onCloseWindow && (
                  <button
                    className="card-window-row-btn card-window-row-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      const needConfirm = settings?.confirmCloseWindow !== false;
                      if (needConfirm) {
                        setShowCloseConfirm(true);
                      } else {
                        onCloseWindow(card.id, ref.id);
                      }
                    }}
                    title="ウィンドウを閉じる"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="2" width="12" height="12" rx="2" />
                      <path d="M6 6l4 4" /><path d="M10 6l-4 4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
          {onAddWindowToCard && (
            <button
              className="card-window-add-btn"
              onClick={(e) => { e.stopPropagation(); onAddWindowToCard(card.id); }}
              title="ウィンドウ追加"
            >
              ＋ ウィンドウ追加
            </button>
          )}
        </div>
      )}
      {showCloseConfirm && onCloseWindow && (
        <div className="card-close-confirm">
          <p className="card-close-confirm-text">{card.windowApp} を閉じますか？</p>
          {card.windowApp === 'Terminal' && (
            <p className="card-close-confirm-warning">内容は失われる可能性があります。</p>
          )}
          <label className="card-close-confirm-check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            <span>次回から確認しない</span>
          </label>
          <div className="card-close-confirm-actions">
            <button
              className="btn-secondary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowCloseConfirm(false);
                setDontAskAgain(false);
              }}
            >
              キャンセル
            </button>
            <button
              className="btn-danger-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (dontAskAgain && onUpdateSettings) {
                  onUpdateSettings(prev => ({ ...prev, confirmCloseWindow: false }));
                }
                setShowCloseConfirm(false);
                setDontAskAgain(false);
                onCloseWindow(card.id);
              }}
            >
              閉じる
            </button>
          </div>
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
            {onUpdatePriority && (
              <PriorityMenu
                currentPriority={card.priority}
                allPriorities={allPriorities}
                onSelect={handleChangePriority}
                onAddPriority={onAddPriority}
              />
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
              {onJump && cardWindows.length > 0 && (
                <button
                  className="context-menu-action"
                  onClick={() => {
                    onJump(card.id);
                    closeCardMenu();
                  }}
                >
                  <span className="context-action-icon">↗️</span>
                  <span>{cardWindows[0].app} を開く</span>
                </button>
              )}
              {onCloseWindow && cardWindows.length > 0 && (
                <button
                  className="context-menu-action"
                  onClick={() => {
                    onCloseWindow(card.id);
                    closeCardMenu();
                  }}
                >
                  <span className="context-action-icon">✕</span>
                  <span>{cardWindows[0].app} を閉じる</span>
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
});
