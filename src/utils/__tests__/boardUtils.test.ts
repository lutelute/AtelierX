import { describe, it, expect } from 'vitest';
import { createDefaultBoard, initialAllBoardsData, isAllBoardsData, migrateBoardDataToAllBoards } from '../boardUtils';
import type { BoardData } from '../../types';

describe('createDefaultBoard', () => {
  it('デフォルトの3カラム構成を返す', () => {
    const board = createDefaultBoard();
    expect(board.columns).toHaveLength(3);
    expect(board.columns[0].id).toBe('todo');
    expect(board.columns[1].id).toBe('in-progress');
    expect(board.columns[2].id).toBe('done');
    expect(board.columnOrder).toEqual(['todo', 'in-progress', 'done']);
    expect(board.cards).toEqual({});
  });

  it('各呼び出しで新しいオブジェクトを返す', () => {
    const a = createDefaultBoard();
    const b = createDefaultBoard();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.columns).not.toBe(b.columns);
  });
});

describe('initialAllBoardsData', () => {
  it('terminalとfinderボードを持つ', () => {
    expect(initialAllBoardsData.boards.terminal).toBeDefined();
    expect(initialAllBoardsData.boards.finder).toBeDefined();
    expect(initialAllBoardsData.ideas).toEqual([]);
  });
});

describe('isAllBoardsData', () => {
  it('boardsプロパティがあればtrue', () => {
    expect(isAllBoardsData({ boards: {} })).toBe(true);
    expect(isAllBoardsData(initialAllBoardsData)).toBe(true);
  });

  it('boardsプロパティがなければfalse', () => {
    expect(isAllBoardsData({ columns: [], cards: {}, columnOrder: [] })).toBe(false);
    expect(isAllBoardsData(null)).toBe(false);
    expect(isAllBoardsData(undefined)).toBe(false);
    expect(isAllBoardsData('string')).toBe(false);
    expect(isAllBoardsData(42)).toBe(false);
  });
});

describe('migrateBoardDataToAllBoards', () => {
  it('カードなしのボードをマイグレートできる', () => {
    const oldData: BoardData = {
      columns: [
        { id: 'todo', title: '未着手', cardIds: [] },
        { id: 'done', title: '完了', cardIds: [] },
      ],
      cards: {},
      columnOrder: ['todo', 'done'],
    };

    const result = migrateBoardDataToAllBoards(oldData);
    expect(isAllBoardsData(result)).toBe(true);
    expect(result.boards.terminal).toBeDefined();
    expect(result.boards.finder).toBeDefined();
    expect(result.ideas).toEqual([]);
  });

  it('カードをタグごとのボードに振り分ける', () => {
    const oldData: BoardData = {
      columns: [
        { id: 'todo', title: '未着手', cardIds: ['c1', 'c2'] },
        { id: 'done', title: '完了', cardIds: ['c3'] },
      ],
      cards: {
        c1: { id: 'c1', title: 'Card 1', tag: 'terminal', createdAt: 1 },
        c2: { id: 'c2', title: 'Card 2', tag: 'finder', createdAt: 2 },
        c3: { id: 'c3', title: 'Card 3', tag: 'terminal', createdAt: 3 },
      },
      columnOrder: ['todo', 'done'],
    };

    const result = migrateBoardDataToAllBoards(oldData);

    // terminal ボード: c1(todo), c3(done)
    expect(Object.keys(result.boards.terminal.cards)).toEqual(expect.arrayContaining(['c1', 'c3']));
    expect(result.boards.terminal.columns[0].cardIds).toEqual(['c1']);
    expect(result.boards.terminal.columns[1].cardIds).toEqual(['c3']);

    // finder ボード: c2(todo)
    expect(Object.keys(result.boards.finder.cards)).toEqual(['c2']);
    expect(result.boards.finder.columns[0].cardIds).toEqual(['c2']);
  });

  it('旧データのideasを引き継ぐ', () => {
    const oldData: BoardData = {
      columns: [],
      cards: {},
      columnOrder: [],
      ideas: [{ id: 'i1', title: 'Idea 1', category: 'feature', createdAt: 1 }],
    };

    const result = migrateBoardDataToAllBoards(oldData);
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas![0].id).toBe('i1');
  });
});
