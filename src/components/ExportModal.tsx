import { useState, useMemo, useEffect } from 'react';
import { ActivityLog, BoardData, AllBoardsData, PluginExportFormatInfo, TagType, Card } from '../types';

type BuiltInFormat = 'md' | 'json' | 'text';
type ExportFormat = BuiltInFormat | string; // string for plugin format IDs

// ビルトインフォーマットかどうかを判定
function isBuiltInFormat(format: ExportFormat): format is BuiltInFormat {
  return format === 'md' || format === 'json' || format === 'text';
}

// カラムID
type ColumnFilter = 'todo' | 'in-progress' | 'done';

interface ExportModalProps {
  logs: ActivityLog[];
  allBoardsData: AllBoardsData;
  activeBoard?: string;
  onClose: () => void;
  onSave: (content: string, filename: string) => void;
  onObsidian?: (content: string) => void;
}

// AllBoardsData から全ボードを統合した BoardData を生成（エクスポート用）
function mergeAllBoards(allBoardsData: AllBoardsData): BoardData {
  const allCards: Record<string, Card> = {};
  // 最初のボードのカラム構成をベースにする
  const firstBoard = Object.values(allBoardsData.boards)[0];
  if (!firstBoard) {
    return { columns: [], cards: {}, columnOrder: [] };
  }

  // 全ボードのカードを統合
  for (const board of Object.values(allBoardsData.boards)) {
    Object.assign(allCards, board.cards);
  }

  // 全ボードのカラムからcardIdsを統合（同名カラムをマージ）
  const mergedColumns = firstBoard.columns.map(col => ({
    ...col,
    cardIds: Object.values(allBoardsData.boards).flatMap(
      board => board.columns.find(c => c.id === col.id)?.cardIds || []
    ),
  }));

  return {
    columns: mergedColumns,
    cards: allCards,
    columnOrder: firstBoard.columnOrder,
  };
}

export function ExportModal({ logs, allBoardsData, activeBoard, onClose, onSave, onObsidian }: ExportModalProps) {
  const boardData = useMemo(() => mergeAllBoards(allBoardsData), [allBoardsData]);
  const [format, setFormat] = useState<ExportFormat>('md');
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pluginFormats, setPluginFormats] = useState<PluginExportFormatInfo[]>([]);
  const [pluginContent, setPluginContent] = useState<string | null>(null);
  const [isLoadingPlugin, setIsLoadingPlugin] = useState(false);

  // フィルター設定: デフォルトは現在のタブ + 完了のみ
  const [selectedColumns, setSelectedColumns] = useState<Set<ColumnFilter>>(
    new Set(['done'])
  );
  const [selectedTags, setSelectedTags] = useState<Set<TagType>>(
    new Set(activeBoard ? [activeBoard as TagType] : ['terminal'])
  );

  // カラムフィルターの切り替え
  const toggleColumn = (column: ColumnFilter) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  // タグフィルターの切り替え
  const toggleTag = (tag: TagType) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

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

  // フィルタリングされたカードを取得
  const getFilteredCards = (columnId: string) => {
    const column = boardData.columns.find((c) => c.id === columnId);
    if (!column) return [];
    return column.cardIds
      .map((id) => boardData.cards[id])
      .filter((card) => card && selectedTags.has(card.tag));
  };

  // 各カラムのカードをタグごとに分類
  const todoCards = useMemo(() => getFilteredCards('todo'), [boardData, selectedTags]);
  const inProgressCards = useMemo(() => getFilteredCards('in-progress'), [boardData, selectedTags]);
  const doneCards = useMemo(() => getFilteredCards('done'), [boardData, selectedTags]);

  // タグごとに分類
  const terminalTodoCards = todoCards.filter((c) => c.tag === 'terminal');
  const finderTodoCards = todoCards.filter((c) => c.tag === 'finder');
  const terminalInProgressCards = inProgressCards.filter((c) => c.tag === 'terminal');
  const finderInProgressCards = inProgressCards.filter((c) => c.tag === 'finder');
  const terminalDoneCards = doneCards.filter((c) => c.tag === 'terminal');
  const finderDoneCards = doneCards.filter((c) => c.tag === 'finder');

  // ビルトイン形式の出力を生成
  const builtInContent = useMemo(() => {
    const isMd = format === 'md';
    const isJson = format === 'json';

    // JSON形式
    if (isJson) {
      const report: Record<string, unknown> = {
        date: dateStr,
        filters: {
          columns: Array.from(selectedColumns),
          tags: Array.from(selectedTags),
        },
      };

      if (selectedTags.has('terminal')) {
        report.terminal = {
          todo: selectedColumns.has('todo') ? terminalTodoCards.map((c) => ({ title: c.title, description: c.description })) : [],
          inProgress: selectedColumns.has('in-progress') ? terminalInProgressCards.map((c) => ({ title: c.title, description: c.description })) : [],
          done: selectedColumns.has('done') ? terminalDoneCards.map((c) => ({ title: c.title, description: c.description, comment: c.comment })) : [],
        };
      }
      if (selectedTags.has('finder')) {
        report.finder = {
          todo: selectedColumns.has('todo') ? finderTodoCards.map((c) => ({ title: c.title, description: c.description })) : [],
          inProgress: selectedColumns.has('in-progress') ? finderInProgressCards.map((c) => ({ title: c.title, description: c.description })) : [],
          done: selectedColumns.has('done') ? finderDoneCards.map((c) => ({ title: c.title, description: c.description, comment: c.comment })) : [],
        };
      }
      return JSON.stringify(report, null, 2);
    }

    // Markdown / Text 共通ロジック
    let output = isMd ? `# 日報 ${dateStr}\n\n` : `日報 ${dateStr}\n${'='.repeat(20)}\n\n`;

    // カードリストを出力するヘルパー
    const renderCards = (cards: typeof todoCards, showComment = false) => {
      if (cards.length === 0) {
        return isMd ? '_なし_\n' : 'なし\n';
      }
      let result = '';
      cards.forEach((card) => {
        result += isMd ? `- ${card.title}\n` : `・${card.title}\n`;
        if (card.description) {
          result += isMd ? `  - ${card.description}\n` : `  ${card.description}\n`;
        }
        if (showComment && card.comment) {
          result += isMd ? `  - コメント: ${card.comment}\n` : `  コメント: ${card.comment}\n`;
        }
      });
      return result;
    };

    // Terminal セクション
    if (selectedTags.has('terminal')) {
      output += isMd ? `## 🖥️ Terminal\n\n` : `【Terminal】\n`;

      if (selectedColumns.has('todo')) {
        output += isMd ? `### 未着手 (${terminalTodoCards.length}件)\n\n` : `[未着手] (${terminalTodoCards.length}件)\n`;
        output += renderCards(terminalTodoCards) + '\n';
      }
      if (selectedColumns.has('in-progress')) {
        output += isMd ? `### 実行中 (${terminalInProgressCards.length}件)\n\n` : `[実行中] (${terminalInProgressCards.length}件)\n`;
        output += renderCards(terminalInProgressCards) + '\n';
      }
      if (selectedColumns.has('done')) {
        output += isMd ? `### 完了 (${terminalDoneCards.length}件)\n\n` : `[完了] (${terminalDoneCards.length}件)\n`;
        output += renderCards(terminalDoneCards, true) + '\n';
      }
    }

    // Finder セクション
    if (selectedTags.has('finder')) {
      output += isMd ? `## 📁 Finder\n\n` : `【Finder】\n`;

      if (selectedColumns.has('todo')) {
        output += isMd ? `### 未着手 (${finderTodoCards.length}件)\n\n` : `[未着手] (${finderTodoCards.length}件)\n`;
        output += renderCards(finderTodoCards) + '\n';
      }
      if (selectedColumns.has('in-progress')) {
        output += isMd ? `### 実行中 (${finderInProgressCards.length}件)\n\n` : `[実行中] (${finderInProgressCards.length}件)\n`;
        output += renderCards(finderInProgressCards) + '\n';
      }
      if (selectedColumns.has('done')) {
        output += isMd ? `### 完了 (${finderDoneCards.length}件)\n\n` : `[完了] (${finderDoneCards.length}件)\n`;
        output += renderCards(finderDoneCards, true) + '\n';
      }
    }

    return output.trim() + '\n';
  }, [format, dateStr, selectedColumns, selectedTags, terminalTodoCards, finderTodoCards, terminalInProgressCards, finderInProgressCards, terminalDoneCards, finderDoneCards]);

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
          <div className="mg-header-actions">
            <button className={`mg-help-btn ${showHelp ? 'active' : ''}`} onClick={() => setShowHelp(!showHelp)} title="ヘルプ">?</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {showHelp && (
          <div className="mg-help-panel">
            <div className="mg-help-body">
              <h4>エクスポート機能とは</h4>
              <p>カンバンボードのカード情報を日報としてエクスポートします。</p>
              <h4>フォーマット</h4>
              <ul>
                <li><b>Markdown:</b> 見出し・箇条書き付きの読みやすい形式</li>
                <li><b>JSON:</b> プログラムで処理しやすい構造化データ</li>
                <li><b>Text:</b> シンプルなテキスト形式</li>
              </ul>
              <h4>フィルター</h4>
              <p>タブ（Terminal/Finderなど）と状態（未着手/実行中/完了）でエクスポート対象を絞り込めます。</p>
              <h4>Obsidian連携</h4>
              <p>設定でObsidian Vaultのパスを指定すると、デイリーノートに直接追記できます。</p>
              <div className="mg-help-note">
                <b>ヒント:</b> プラグインで独自のエクスポートフォーマットを追加できます。
              </div>
            </div>
          </div>
        )}

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

        {/* フィルターセクション */}
        <div className="export-filters">
          <div className="filter-group">
            <span className="filter-label">タブ:</span>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedTags.has('terminal')}
                onChange={() => toggleTag('terminal')}
              />
              <span className="filter-tag terminal">🖥️ Terminal</span>
            </label>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedTags.has('finder')}
                onChange={() => toggleTag('finder')}
              />
              <span className="filter-tag finder">📁 Finder</span>
            </label>
          </div>
          <div className="filter-group">
            <span className="filter-label">状態:</span>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedColumns.has('todo')}
                onChange={() => toggleColumn('todo')}
              />
              <span className="filter-status todo">未着手</span>
            </label>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedColumns.has('in-progress')}
                onChange={() => toggleColumn('in-progress')}
              />
              <span className="filter-status in-progress">実行中</span>
            </label>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={selectedColumns.has('done')}
                onChange={() => toggleColumn('done')}
              />
              <span className="filter-status done">完了</span>
            </label>
          </div>
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
