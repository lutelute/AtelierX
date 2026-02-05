import { useCallback } from 'react';
import { BoardData, TimerAction } from '../types';
import { formatDuration, formatDateTime, parseTimerStartTime } from '../utils/timerUtils';
import { CHECKBOX_PATTERN } from '../utils/checkboxConstants';

interface UseTimerActionsParams {
  currentBoard: BoardData;
  updateCurrentBoard: (updater: (prev: BoardData) => BoardData) => void;
}

export function useTimerActions({
  currentBoard,
  updateCurrentBoard,
}: UseTimerActionsParams) {
  // プラグインカードアクションを実行
  const handleCardAction = useCallback(async (cardId: string, actionId: string, taskIndex?: number) => {
    const card = currentBoard.cards[cardId];
    if (!card || !window.electronAPI?.plugins?.executeCardAction) return;

    try {
      const result = await window.electronAPI.plugins.executeCardAction(actionId, cardId, card, taskIndex);
      if (!result.success) {
        console.error('Card action failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to execute card action:', error);
    }
  }, [currentBoard.cards]);

  // タイマーアクションを処理
  const handleTimerAction = useCallback((cardId: string, taskIndex: number, action: TimerAction) => {
    const now = Date.now();

    updateCurrentBoard((prev) => {
      const card = prev.cards[cardId];
      if (!card || !card.description) return prev;

      const lines = card.description.split('\n');
      const taskLineIndices: number[] = [];

      lines.forEach((line, idx) => {
        if (CHECKBOX_PATTERN.test(line)) {
          taskLineIndices.push(idx);
        }
      });

      if (taskIndex >= taskLineIndices.length) return prev;

      const targetLineIndex = taskLineIndices[taskIndex];
      const nextTaskLineIndex = taskIndex + 1 < taskLineIndices.length
        ? taskLineIndices[taskIndex + 1]
        : lines.length;

      let runningTimerLineIndex = -1;
      for (let i = targetLineIndex + 1; i < nextTaskLineIndex; i++) {
        const trimmedLine = lines[i].trim();
        if (trimmedLine.startsWith('⏱')) {
          if (trimmedLine.endsWith('開始')) {
            runningTimerLineIndex = i;
            break;
          }
        }
      }

      const updatedLines = [...lines];

      switch (action) {
        case 'start': {
          const timeStr = `  ⏱ ${formatDateTime(now)}開始`;
          if (runningTimerLineIndex >= 0) {
            updatedLines[runningTimerLineIndex] = timeStr;
          } else {
            updatedLines.splice(targetLineIndex + 1, 0, timeStr);
          }
          break;
        }
        case 'pause':
        case 'stop': {
          if (runningTimerLineIndex >= 0) {
            const startedAt = parseTimerStartTime(lines[runningTimerLineIndex]);
            if (startedAt) {
              const elapsed = now - startedAt;
              const timeStr = `  ⏱ ${formatDateTime(startedAt)}-${formatDateTime(now)} (${formatDuration(elapsed)})`;
              updatedLines[runningTimerLineIndex] = timeStr;
            }
          }
          break;
        }
        case 'cancel': {
          if (runningTimerLineIndex >= 0) {
            updatedLines.splice(runningTimerLineIndex, 1);
          }
          break;
        }
      }

      return {
        ...prev,
        cards: {
          ...prev.cards,
          [cardId]: {
            ...card,
            description: updatedLines.join('\n'),
          },
        },
      };
    });
  }, [updateCurrentBoard]);

  return {
    handleCardAction,
    handleTimerAction,
  };
}
