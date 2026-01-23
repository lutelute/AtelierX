import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column as ColumnType, Card as CardType, CustomSubtag, DefaultSubtagSettings } from '../types';
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
  onCardClick?: (cardId: string) => void;
  onArchiveCard?: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  brokenLinkCardIds?: Set<string>;
}

export function Column({ column, cards, onAddCard, onDeleteCard, onEditCard, onJumpCard, onDropWindow, onUpdateDescription, onCardClick, onArchiveCard, customSubtags = [], defaultSubtagSettings, brokenLinkCardIds = new Set() }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className={`column ${isOver ? 'column-over' : ''}`}>
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
              onCardClick={onCardClick}
              onArchive={column.id === 'done' ? onArchiveCard : undefined}
              customSubtags={customSubtags}
              defaultSubtagSettings={defaultSubtagSettings}
              isBrokenLink={brokenLinkCardIds.has(card.id)}
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
