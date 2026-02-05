import { BoardData, AllBoardsData, Card as CardType } from '../types';

export function createDefaultBoard(): BoardData {
  return {
    columns: [
      { id: 'todo', title: '未着手', cardIds: [] },
      { id: 'in-progress', title: '実行中', cardIds: [] },
      { id: 'done', title: '完了', cardIds: [] },
    ],
    cards: {},
    columnOrder: ['todo', 'in-progress', 'done'],
  };
}

export const initialAllBoardsData: AllBoardsData = {
  boards: {
    terminal: createDefaultBoard(),
    finder: createDefaultBoard(),
  },
  ideas: [],
};

// AllBoardsData かどうかを判定（旧形式BoardDataと区別）
export function isAllBoardsData(data: unknown): data is AllBoardsData {
  return data !== null && typeof data === 'object' && 'boards' in (data as Record<string, unknown>);
}

// 旧形式 BoardData → AllBoardsData へのマイグレーション
export function migrateBoardDataToAllBoards(oldData: BoardData): AllBoardsData {
  // 全タブのIDを収集（カードのtagから）
  const tabIds = new Set<string>();
  Object.values(oldData.cards).forEach(card => {
    if (card.tag) tabIds.add(card.tag);
  });
  // 最低限 terminal, finder を含める
  tabIds.add('terminal');
  tabIds.add('finder');

  const boards: Record<string, BoardData> = {};

  for (const tabId of tabIds) {
    // そのタブに属するカードのIDを収集
    const tabCardIds = new Set(
      Object.values(oldData.cards)
        .filter(card => card.tag === tabId)
        .map(card => card.id)
    );

    // タブ専用のカードオブジェクト
    const tabCards: Record<string, CardType> = {};
    for (const cardId of tabCardIds) {
      tabCards[cardId] = oldData.cards[cardId];
    }

    // カラム構成を複製し、cardIdsをこのタブのカードのみに絞る
    const tabColumns = oldData.columns.map(col => ({
      ...col,
      cardIds: col.cardIds.filter(id => tabCardIds.has(id)),
    }));

    boards[tabId] = {
      columns: tabColumns,
      cards: tabCards,
      columnOrder: [...oldData.columnOrder],
    };
  }

  return {
    boards,
    ideas: oldData.ideas || [],
  };
}
