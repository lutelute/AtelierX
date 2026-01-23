import { useState, useMemo } from 'react';
import { ActivityLog, BoardData } from '../types';

type ExportFormat = 'md' | 'json' | 'text';

interface ExportModalProps {
  logs: ActivityLog[];
  boardData: BoardData;
  onClose: () => void;
  onSave: (content: string, filename: string) => void;
  onObsidian?: (content: string) => void;
}

export function ExportModal({ logs, boardData, onClose, onSave, onObsidian }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('md');
  const [copied, setCopied] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayLogs = useMemo(() => {
    return logs.filter((log) => log.timestamp >= today.getTime());
  }, [logs, today]);

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const dateStr = today.toLocaleDateString('ja-JP');
  const dateISO = today.toISOString().split('T')[0];

  // 完了・進行中タスクを抽出（重複除去）
  const completedTasksMap = new Map<string, ActivityLog>();
  todayLogs
    .filter((log) => log.toColumn === 'done')
    .forEach((log) => completedTasksMap.set(log.cardTitle, log));
  const completedTasks = Array.from(completedTasksMap.values());

  const inProgressTasksMap = new Map<string, ActivityLog>();
  todayLogs
    .filter((log) => log.toColumn === 'in-progress')
    .forEach((log) => {
      if (!completedTasksMap.has(log.cardTitle)) {
        inProgressTasksMap.set(log.cardTitle, log);
      }
    });
  const inProgressTasks = Array.from(inProgressTasksMap.values());

  // 各形式の出力を生成
  const content = useMemo(() => {
    if (format === 'json') {
      const report = {
        date: dateStr,
        summary: {
          completed: completedTasks.length,
          inProgress: inProgressTasks.length,
          created: todayLogs.filter((log) => log.type === 'create').length,
        },
        completedTasks: completedTasks.map((log) => ({
          title: log.cardTitle,
          description: log.cardDescription,
          completedAt: formatTime(log.timestamp),
        })),
        inProgressTasks: inProgressTasks.map((log) => ({
          title: log.cardTitle,
          description: log.cardDescription,
        })),
        logs: todayLogs,
      };
      return JSON.stringify(report, null, 2);
    }

    // Markdown / Text 共通ロジック
    const isMd = format === 'md';
    let output = isMd ? `# 日報 ${dateStr}\n\n` : `日報 ${dateStr}\n${'='.repeat(20)}\n\n`;

    // 完了タスク
    output += isMd ? `## 完了タスク (${completedTasks.length}件)\n\n` : `【完了タスク】(${completedTasks.length}件)\n`;
    if (completedTasks.length === 0) {
      output += isMd ? '_なし_\n\n' : 'なし\n\n';
    } else {
      completedTasks.forEach((log) => {
        output += isMd
          ? `- **${log.cardTitle}** (${formatTime(log.timestamp)})\n`
          : `・${log.cardTitle} (${formatTime(log.timestamp)})\n`;
        if (log.cardDescription) {
          output += isMd ? `  - ${log.cardDescription}\n` : `  ${log.cardDescription}\n`;
        }
      });
      output += '\n';
    }

    // 進行中タスク
    output += isMd ? `## 進行中タスク (${inProgressTasks.length}件)\n\n` : `【進行中タスク】(${inProgressTasks.length}件)\n`;
    if (inProgressTasks.length === 0) {
      output += isMd ? '_なし_\n\n' : 'なし\n\n';
    } else {
      inProgressTasks.forEach((log) => {
        output += isMd ? `- ${log.cardTitle}\n` : `・${log.cardTitle}\n`;
        if (log.cardDescription) {
          output += isMd ? `  - ${log.cardDescription}\n` : `  ${log.cardDescription}\n`;
        }
      });
      output += '\n';
    }

    // ボード状態
    output += isMd ? `---\n\n## 現在のボード状態\n\n` : `${'─'.repeat(20)}\n【現在のボード状態】\n\n`;

    const doneColumn = boardData.columns.find((c) => c.id === 'done');
    const inProgressColumn = boardData.columns.find((c) => c.id === 'in-progress');

    output += isMd ? `### 完了 (${doneColumn?.cardIds.length || 0}件)\n\n` : `[完了] (${doneColumn?.cardIds.length || 0}件)\n`;
    doneColumn?.cardIds.forEach((id) => {
      const card = boardData.cards[id];
      if (card) {
        output += isMd ? `- ${card.title}\n` : `・${card.title}\n`;
        if (card.description) output += isMd ? `  - 詳細: ${card.description}\n` : `  詳細: ${card.description}\n`;
        if (card.comment) output += isMd ? `  - コメント: ${card.comment}\n` : `  コメント: ${card.comment}\n`;
      }
    });
    output += '\n';

    output += isMd ? `### 実行中 (${inProgressColumn?.cardIds.length || 0}件)\n\n` : `[実行中] (${inProgressColumn?.cardIds.length || 0}件)\n`;
    inProgressColumn?.cardIds.forEach((id) => {
      const card = boardData.cards[id];
      if (card) {
        output += isMd ? `- ${card.title}\n` : `・${card.title}\n`;
        if (card.description) output += isMd ? `  - ${card.description}\n` : `  ${card.description}\n`;
      }
    });

    return output;
  }, [format, dateStr, completedTasks, inProgressTasks, todayLogs, boardData]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    const ext = format === 'json' ? 'json' : format === 'md' ? 'md' : 'txt';
    const filename = `日報_${dateISO}.${ext}`;
    onSave(content, filename);
  };

  const handleObsidian = () => {
    if (onObsidian) {
      onObsidian(content);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>日報エクスポート</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="export-format-selector">
          <button
            className={`format-btn ${format === 'md' ? 'active' : ''}`}
            onClick={() => setFormat('md')}
          >
            Markdown
          </button>
          <button
            className={`format-btn ${format === 'json' ? 'active' : ''}`}
            onClick={() => setFormat('json')}
          >
            JSON
          </button>
          <button
            className={`format-btn ${format === 'text' ? 'active' : ''}`}
            onClick={() => setFormat('text')}
          >
            Text
          </button>
        </div>

        <div className="export-preview">
          <pre>{content}</pre>
        </div>

        <div className="export-actions">
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? '✓ コピー完了' : 'クリップボードにコピー'}
          </button>
          <button className="btn-save" onClick={handleSave}>
            ファイルに保存
          </button>
          {onObsidian && (
            <button className="btn-obsidian" onClick={handleObsidian}>
              Obsidianに追記
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
