import { useState, useRef, useEffect, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column as ColumnType, Card as CardType, CardStatusMarker, CustomSubtag, DefaultSubtagSettings, PluginCardActionInfo, TimerAction, Priority, PriorityConfig, Settings } from '../types';
import { Card } from './Card';

const COLUMN_COLORS = [
  '#9ca3af', // グレー
  '#3b82f6', // 青
  '#22c55e', // 緑
  '#ef4444', // 赤
  '#f59e0b', // オレンジ
  '#8b5cf6', // 紫
  '#ec4899', // ピンク
  '#06b6d4', // シアン
  '#14b8a6', // ティール
  '#f97316', // ディープオレンジ
];

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  onAddCard: (columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string) => void;
  onJumpCard: (cardId: string) => void;
  onCloseWindowCard?: (cardId: string) => void;
  onUnlinkWindowCard?: (cardId: string) => void;
  onDropWindow: (columnId: string) => void;
  onUpdateDescription: (cardId: string, description: string) => void;
  onUpdateComment?: (cardId: string, comment: string) => void;
  onUpdateStatusMarker?: (cardId: string, marker: CardStatusMarker) => void;
  onCardClick?: (cardId: string) => void;
  onArchiveCard?: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  brokenLinkCardIds?: Set<string>;
  cardActions?: PluginCardActionInfo[];
  onCardAction?: (cardId: string, actionId: string, taskIndex?: number) => void;
  onTimerAction?: (cardId: string, taskIndex: number, action: TimerAction) => void;
  onUpdatePriority?: (cardId: string, priority: Priority | undefined) => void;
  onRenameColumn?: (columnId: string, newTitle: string) => void;
  onDeleteColumn?: (columnId: string, moveToColumnId?: string) => void;
  onChangeColumnColor?: (columnId: string, color: string) => void;
  allColumns?: ColumnType[];
  canDelete?: boolean;
  priorityConfigs?: PriorityConfig[];
  onAddPriority?: (config: PriorityConfig) => void;
  onHideColumn?: (columnId: string) => void;
  settings?: Settings;
  onUpdateSettings?: (updater: (prev: Settings) => Settings) => void;
}

export const Column = memo(function Column({ column, cards, onAddCard, onDeleteCard, onEditCard, onJumpCard, onCloseWindowCard, onUnlinkWindowCard, onDropWindow, onUpdateDescription, onUpdateComment, onUpdateStatusMarker, onCardClick, onArchiveCard, customSubtags = [], defaultSubtagSettings, brokenLinkCardIds = new Set(), cardActions = [], onCardAction, onTimerAction, onUpdatePriority, onRenameColumn, onDeleteColumn, onChangeColumnColor, allColumns = [], canDelete = false, priorityConfigs, onAddPriority, onHideColumn, settings, onUpdateSettings }: ColumnProps) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id,
  });

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  const columnStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(column.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [moveToColumnId, setMoveToColumnId] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // カラーピッカー外クリックで閉じる
  useEffect(() => {
    if (!showColorPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColorPicker]);

  const handleTitleDoubleClick = () => {
    if (!onRenameColumn) return;
    setEditTitle(column.title);
    setIsEditing(true);
  };

  const handleTitleConfirm = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== column.title) {
      onRenameColumn?.(column.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleConfirm();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleDeleteClick = () => {
    if (!onDeleteColumn) return;
    if (cards.length === 0) {
      onDeleteColumn(column.id);
    } else {
      const otherColumns = allColumns.filter(c => c.id !== column.id);
      if (otherColumns.length > 0) {
        setMoveToColumnId(otherColumns[0].id);
      }
      setShowDeleteConfirm(true);
    }
  };

  const handleDeleteConfirm = () => {
    onDeleteColumn?.(column.id, moveToColumnId);
    setShowDeleteConfirm(false);
  };

  const columnColor = column.color;
  const headerStyle = columnColor ? {
    borderBottomColor: `${columnColor}80`,
  } : undefined;
  const titleStyle = columnColor ? { color: columnColor } : undefined;
  const countStyle = columnColor ? {
    background: `${columnColor}33`,
    color: columnColor,
  } : undefined;

  return (
    <div ref={setSortableRef} style={columnStyle} className={`column column-${column.id} ${isOver ? 'column-over' : ''} ${isDragging ? 'column-dragging' : ''}`} {...attributes}>
      <div className="column-header" style={headerStyle}>
        <div className="column-drag-handle" {...listeners} title="ドラッグして列を移動">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </div>
        {isEditing ? (
          <input
            ref={inputRef}
            className="column-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleConfirm}
            onKeyDown={handleTitleKeyDown}
          />
        ) : (
          <div className="column-title-group">
            <h3 className="column-title" style={titleStyle} onDoubleClick={handleTitleDoubleClick}>{column.title}</h3>
            {onRenameColumn && (
              <button
                className="column-edit-btn"
                onClick={handleTitleDoubleClick}
                title="カラム名を編集"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="column-header-right">
          {onChangeColumnColor && (
            <div className="column-color-wrapper" ref={colorPickerRef}>
              <button
                className="column-color-btn"
                style={{ background: columnColor || '#9ca3af' }}
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="カラム色を変更"
              />
              {showColorPicker && (
                <div className="column-color-picker">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      className={`column-color-option ${c === columnColor ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => {
                        onChangeColumnColor(column.id, c);
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                  <label className="column-color-custom" title="カスタム色">
                    <input
                      type="color"
                      value={columnColor || '#9ca3af'}
                      onChange={(e) => {
                        onChangeColumnColor(column.id, e.target.value);
                      }}
                    />
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.5 2.5l1 1-7.5 7.5-2.5.5.5-2.5 7.5-7.5z" />
                      <path d="M2 14h12" />
                    </svg>
                  </label>
                </div>
              )}
            </div>
          )}
          <span className="column-count" style={countStyle}>{cards.length}</span>
          {onHideColumn && (
            <button
              className="column-hide-btn"
              onClick={() => onHideColumn(column.id)}
              title="カラムを非表示"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                <circle cx="8" cy="8" r="2" />
                <line x1="2" y1="14" x2="14" y2="2" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              className="column-delete-btn"
              onClick={handleDeleteClick}
              title="カラムを削除"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      {showDeleteConfirm && (
        <div className="column-delete-confirm">
          <p className="column-delete-confirm-text">カード {cards.length}件 の移動先:</p>
          <select
            className="column-delete-confirm-select"
            value={moveToColumnId}
            onChange={(e) => setMoveToColumnId(e.target.value)}
          >
            {allColumns.filter(c => c.id !== column.id).map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <div className="column-delete-confirm-actions">
            <button className="btn-secondary btn-sm" onClick={() => setShowDeleteConfirm(false)}>
              キャンセル
            </button>
            <button className="btn-primary btn-sm btn-danger" onClick={handleDeleteConfirm}>
              削除
            </button>
          </div>
        </div>
      )}
      <div ref={setDroppableRef} className="column-content">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              columnColor={column.color}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
              onJump={onJumpCard}
              onCloseWindow={onCloseWindowCard}
              onUnlinkWindow={onUnlinkWindowCard}
              onUpdateDescription={onUpdateDescription}
              onUpdateComment={onUpdateComment}
              onUpdateStatusMarker={onUpdateStatusMarker}
              onUpdatePriority={onUpdatePriority ? (priority) => onUpdatePriority(card.id, priority) : undefined}
              onCardClick={onCardClick}
              onArchive={column.id === 'done' ? onArchiveCard : undefined}
              customSubtags={customSubtags}
              defaultSubtagSettings={defaultSubtagSettings}
              isBrokenLink={brokenLinkCardIds.has(card.id)}
              columnId={column.id}
              cardActions={cardActions}
              onCardAction={(actionId, taskIndex) => onCardAction?.(card.id, actionId, taskIndex)}
              onTimerAction={onTimerAction ? (taskIndex, action) => onTimerAction(card.id, taskIndex, action) : undefined}
              priorityConfigs={priorityConfigs}
              onAddPriority={onAddPriority}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
            />
          ))}
        </SortableContext>
      </div>
      <div className="column-actions">
        <button className="add-card-button" onClick={() => onAddCard(column.id)}>
          + カードを追加
        </button>
        <button className="add-window-button" onClick={() => onDropWindow(column.id)}>
          + ウィンドウを追加
        </button>
      </div>
    </div>
  );
});
