import { useCallback } from 'react';
import { BoardData, TimerAction, CardStatusMarker } from '../types';
import { formatDuration, formatDateTime, parseTimerStartTime } from '../utils/timerUtils';
import { CHECKBOX_PATTERN, CHECKBOX_EXTRACT } from '../utils/checkboxConstants';

interface UseTimerActionsParams {
  currentBoard: BoardData;
  updateCurrentBoard: (updater: (prev: BoardData) => BoardData) => void;
}

export function useTimerActions({
  currentBoard,
  updateCurrentBoard,
}: UseTimerActionsParams) {
  // プラグインカードアクションを実行（結果メッセージを返す）
  const handleCardAction = useCallback(async (cardId: string, actionId: string, taskIndex?: number): Promise<{ message?: string; error?: string } | undefined> => {
    const card = currentBoard.cards[cardId];
    if (!card || !window.electronAPI?.plugins?.executeCardAction) return;

    try {
      const result = await window.electronAPI.plugins.executeCardAction(actionId, cardId, card, taskIndex);
      if (!result.success) {
        console.error('Card action failed:', result.error);
        return { error: result.error || 'アクションに失敗しました' };
      }
      const data = result.data as { message?: string } | undefined;
      return { message: data?.message };
    } catch (error) {
      console.error('Failed to execute card action:', error);
      return { error: 'アクションの実行に失敗しました' };
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
        if (CHECKBOX_PATTERN.test(line.trimStart())) {
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
      let newStatusMarker: CardStatusMarker | undefined;

      switch (action) {
        case 'start': {
          // チェックボックスが未完了なら進行中に変更
          const taskLine = updatedLines[targetLineIndex];
          const taskMatch = taskLine.trimStart().match(CHECKBOX_EXTRACT);
          if (taskMatch && taskMatch[1] === ' ') {
            updatedLines[targetLineIndex] = taskLine.replace('- [ ]', '- [/]');
          }
          const timeStr = `  ⏱ ${formatDateTime(now)}開始`;
          if (runningTimerLineIndex >= 0) {
            updatedLines[runningTimerLineIndex] = timeStr;
          } else {
            updatedLines.splice(targetLineIndex + 1, 0, timeStr);
          }
          // カードのステータスマーカーも進行中に更新（未設定 or 未完了の場合）
          if (!card.statusMarker || card.statusMarker === ' ') {
            newStatusMarker = '/';
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
            ...(newStatusMarker !== undefined ? { statusMarker: newStatusMarker } : {}),
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
