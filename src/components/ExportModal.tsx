import { useState, useMemo, useEffect } from 'react';
import { ActivityLog, BoardData, PluginExportFormatInfo } from '../types';

type BuiltInFormat = 'md' | 'json' | 'text';
type ExportFormat = BuiltInFormat | string; // string for plugin format IDs

// ビルトインフォーマットかどうかを判定
function isBuiltInFormat(format: ExportFormat): format is BuiltInFormat {
  return format === 'md' || format === 'json' || format === 'text';
}

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
  const [pluginFormats, setPluginFormats] = useState<PluginExportFormatInfo[]>([]);
  const [pluginContent, setPluginContent] = useState<string | null>(null);
  const [isLoadingPlugin, setIsLoadingPlugin] = useState(false);

  // 日付関連の計算を先に行う（useEffectで使用するため）
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayLogs = useMemo(() => {
    return logs.filter((log) => log.timestamp >= today.getTime());
  }, [logs, today]);

  const dateStr = today.toLocaleDateString('ja-JP');
  const dateISO = today.toISOString().split('T')[0];

  // プラグインエクスポートフォーマットを取得
  useEffect(() => {
    const fetchPluginFormats = async () => {
      if (window.electronAPI?.plugins?.getExportFormats) {
        const result = await window.electronAPI.plugins.getExportFormats();
        if (result.success) {
          setPluginFormats(result.data);
        }
      }
    };
    fetchPluginFormats();
  }, []);

  // プラグインフォーマット選択時にコンテンツを生成
  useEffect(() => {
    const generatePluginContent = async () => {
      // ビルトインフォーマットの場合はプラグインコンテンツをクリア
      if (isBuiltInFormat(format)) {
        setPluginContent(null);
        return;
      }

      // プラグインフォーマットの場合
      if (window.electronAPI?.plugins?.executeExportFormat) {
        setIsLoadingPlugin(true);
        try {
          const result = await window.electronAPI.plugins.executeExportFormat(format, {
            logs: todayLogs,
            boardData,
          });
          if (result.success && result.data) {
            setPluginContent(result.data);
          } else {
            setPluginContent(`エラー: ${result.error || 'エクスポートに失敗しました'}`);
          }
        } catch (error) {
          setPluginContent(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
        } finally {
          setIsLoadingPlugin(false);
        }
      }
    };
    generatePluginContent();
  }, [format, todayLogs, boardData]);

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

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

  // ビルトイン形式の出力を生成
  const builtInContent = useMemo(() => {
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

  // 表示するコンテンツ（ビルトインまたはプラグイン）
  const displayContent = isBuiltInFormat(format) ? builtInContent : (pluginContent || '読み込み中...');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    // ビルトインフォーマットの場合は対応する拡張子を使用
    // プラグインフォーマットの場合はプラグインの拡張子またはデフォルトでtxt
    let ext = 'txt';
    if (format === 'json') {
      ext = 'json';
    } else if (format === 'md') {
      ext = 'md';
    } else if (format === 'text') {
      ext = 'txt';
    } else {
      // プラグインフォーマットの場合、名前から推測またはデフォルトtxt
      const pluginFormat = pluginFormats.find((pf) => pf.id === format);
      if (pluginFormat) {
        // プラグイン名をファイル名に使用
        ext = pluginFormat.name.toLowerCase().replace(/\s+/g, '-');
      }
    }
    const filename = `日報_${dateISO}.${ext}`;
    onSave(displayContent, filename);
  };

  const handleObsidian = () => {
    if (onObsidian) {
      onObsidian(displayContent);
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
          {/* ビルトインフォーマット */}
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
          {/* プラグインフォーマット */}
          {pluginFormats.map((pf) => (
            <button
              key={pf.id}
              className={`format-btn plugin-format ${format === pf.id ? 'active' : ''}`}
              onClick={() => setFormat(pf.id)}
              title={pf.description || pf.name}
            >
              {pf.name}
            </button>
          ))}
        </div>

        <div className="export-preview">
          {isLoadingPlugin ? (
            <div className="loading-indicator">読み込み中...</div>
          ) : (
            <pre>{displayContent}</pre>
          )}
        </div>

        <div className="export-actions">
          <button className="btn-copy" onClick={handleCopy} disabled={isLoadingPlugin}>
            {copied ? '✓ コピー完了' : 'クリップボードにコピー'}
          </button>
          <button className="btn-save" onClick={handleSave} disabled={isLoadingPlugin}>
            ファイルに保存
          </button>
          {onObsidian && (
            <button className="btn-obsidian" onClick={handleObsidian} disabled={isLoadingPlugin}>
              Obsidianに追記
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
