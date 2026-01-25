import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column as ColumnType, Card as CardType, CardStatusMarker, CustomSubtag, DefaultSubtagSettings, PluginCardActionInfo } from '../types';
import { Card } from './Card';

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  onAddCard: (columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string) => void;
  onJumpCard: (cardId: string) => void;
  onDropWindow: (columnId: string) => void;
  onUpdateDescription: (cardId: string, description: string) => void;
  onUpdateStatusMarker?: (cardId: string, marker: CardStatusMarker) => void;
  onCardClick?: (cardId: string) => void;
  onArchiveCard?: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  brokenLinkCardIds?: Set<string>;
  cardActions?: PluginCardActionInfo[];
  onCardAction?: (cardId: string, actionId: string, taskIndex?: number) => void;
}

export function Column({ column, cards, onAddCard, onDeleteCard, onEditCard, onJumpCard, onDropWindow, onUpdateDescription, onUpdateStatusMarker, onCardClick, onArchiveCard, customSubtags = [], defaultSubtagSettings, brokenLinkCardIds = new Set(), cardActions = [], onCardAction }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className={`column column-${column.id} ${isOver ? 'column-over' : ''}`}>
      <div className="column-header">
        <h3 className="column-title">{column.title}</h3>
        <span className="column-count">{cards.length}</span>
      </div>
      <div ref={setNodeRef} className="column-content">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
              onJump={onJumpCard}
              onUpdateDescription={onUpdateDescription}
              onUpdateStatusMarker={onUpdateStatusMarker}
              onCardClick={onCardClick}
              onArchive={column.id === 'done' ? onArchiveCard : undefined}
              customSubtags={customSubtags}
              defaultSubtagSettings={defaultSubtagSettings}
              isBrokenLink={brokenLinkCardIds.has(card.id)}
              columnId={column.id}
              cardActions={cardActions}
              onCardAction={(actionId, taskIndex) => onCardAction?.(card.id, actionId, taskIndex)}
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
}
