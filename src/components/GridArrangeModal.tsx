import { useState, useEffect, useMemo } from 'react';
import { AppWindow, DisplayInfo, GridOptions, PluginGridLayout, Column as ColumnType, Card as CardType } from '../types';

interface GridArrangeModalProps {
  appType: string;
  onClose: () => void;
  onArrange: (options: GridOptions) => Promise<{ success: boolean; arranged: number }>;
  columns?: ColumnType[];
  cards?: Record<string, CardType>;
}

export function GridArrangeModal({ appType, onClose, onArrange, columns, cards }: GridArrangeModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<number>(0);
  const [showHelp, setShowHelp] = useState(false);
  const [gridMode, setGridMode] = useState<'auto' | 'custom' | 'preset'>('auto');
  const [cols, setCols] = useState<number>(2);
  const [rows, setRows] = useState<number>(2);
  const [padding, setPadding] = useState<number>(5);
  const [isArranging, setIsArranging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; arranged: number } | null>(null);
  const [pluginLayouts, setPluginLayouts] = useState<PluginGridLayout[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  // タブ: 'all' = 全体配置, 'column' = カラム別
  const [activeTab, setActiveTab] = useState<'all' | 'column'>('all');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set());
  const [currentWindows, setCurrentWindows] = useState<AppWindow[]>([]);

  const hasColumns = columns && columns.length > 0;

  // 現在のウィンドウ一覧を取得（windowId→現在のウィンドウ名マップ用）
  useEffect(() => {
    const fetchWindows = async () => {
      if (window.electronAPI?.getAppWindows) {
        const windows = await window.electronAPI.getAppWindows([appType]);
        setCurrentWindows(windows);
      }
    };
    fetchWindows();
  }, [appType]);

  // カラムごとのウィンドウ紐付きカード数を計算（windowIdベース）
  const columnCardCounts = useMemo(() => {
    if (!columns || !cards) return {};
    const liveIds = new Set(currentWindows.map(w => w.id));
    const counts: Record<string, number> = {};
    for (const col of columns) {
      counts[col.id] = col.cardIds.filter(id => {
        const card = cards[id];
        return card && card.windowId && !card.archived && liveIds.has(card.windowId);
      }).length;
    }
    return counts;
  }, [columns, cards, currentWindows]);

  // 選択カラムからウィンドウIDリストを抽出（現在生存しているもののみ）
  const selectedWindowIds = useMemo((): string[] | undefined => {
    if (activeTab !== 'column' || selectedColumnIds.size === 0 || !columns || !cards) {
      return undefined;
    }
    const liveIds = new Set(currentWindows.map(w => w.id));
    const ids: string[] = [];
    for (const col of columns) {
      if (!selectedColumnIds.has(col.id)) continue;
      for (const cardId of col.cardIds) {
        const card = cards[cardId];
        if (card && card.windowId && !card.archived && liveIds.has(card.windowId)) {
          ids.push(card.windowId);
        }
      }
    }
    return ids;
  }, [activeTab, selectedColumnIds, columns, cards, currentWindows]);

  // ディスプレイ情報とプラグインレイアウトを取得
  useEffect(() => {
    const fetchData = async () => {
      if (window.electronAPI?.getDisplays) {
        const displayList = await window.electronAPI.getDisplays();
        setDisplays(displayList);
      }
      if (window.electronAPI?.plugins?.getGridLayouts) {
        const result = await window.electronAPI.plugins.getGridLayouts();
        if (result.success) {
          setPluginLayouts(result.data);
        }
      }
    };
    fetchData();
  }, []);

  const handlePresetSelect = (layout: PluginGridLayout) => {
    setSelectedPreset(layout.id);
    setCols(layout.cols);
    setRows(layout.rows);
    setPadding(layout.padding || 5);
  };

  const handleArrange = async () => {
    setIsArranging(true);
    setResult(null);

    const options: GridOptions = {
      displayIndex: selectedDisplay,
      cols: gridMode === 'auto' ? 0 : cols,
      rows: gridMode === 'auto' ? 0 : rows,
      padding: padding,
      ...(selectedWindowIds !== undefined ? { windowIds: selectedWindowIds } : {}),
    };

    try {
      const res = await onArrange(options);
      setResult(res);
      if (res.success && res.arranged > 0) {
        setTimeout(() => onClose(), 1500);
      }
    } catch (error) {
      setResult({ success: false, arranged: 0 });
    } finally {
      setIsArranging(false);
    }
  };

  // 配置ボタン無効判定
  const isArrangeDisabled = isArranging || (activeTab === 'column' && selectedColumnIds.size === 0);

  // --- 共通UI部品 ---

  const displaySection = (
    <div className="grid-section">
      <h3>配置先ディスプレイ</h3>
      <div className="grid-options">
        <label className={`grid-option ${selectedDisplay === 0 ? 'selected' : ''}`}>
          <input type="radio" name="display" checked={selectedDisplay === 0} onChange={() => setSelectedDisplay(0)} />
          <div className="option-content">
            <span className="option-title">自動配置</span>
            <span className="option-desc">各ディスプレイ内で配置</span>
          </div>
        </label>
        {displays.map((display) => (
          <label key={display.index} className={`grid-option ${selectedDisplay === display.index ? 'selected' : ''}`}>
            <input type="radio" name="display" checked={selectedDisplay === display.index} onChange={() => setSelectedDisplay(display.index)} />
            <div className="option-content">
              <span className="option-title">
                ディスプレイ {display.index}
                {display.isMain && <span className="main-badge">メイン</span>}
              </span>
              <span className="option-desc">{display.frameW} x {display.frameH}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const gridSizeSection = (
    <div className="grid-section">
      <h3>グリッドサイズ</h3>
      <div className="grid-options">
        <label className={`grid-option ${gridMode === 'auto' ? 'selected' : ''}`}>
          <input type="radio" name="gridMode" checked={gridMode === 'auto'} onChange={() => setGridMode('auto')} />
          <div className="option-content">
            <span className="option-title">自動（おすすめ）</span>
            <span className="option-desc">ウィンドウ数に応じて最適化</span>
          </div>
        </label>
        <label className={`grid-option ${gridMode === 'custom' ? 'selected' : ''}`}>
          <input type="radio" name="gridMode" checked={gridMode === 'custom'} onChange={() => { setGridMode('custom'); setSelectedPreset(null); }} />
          <div className="option-content">
            <span className="option-title">カスタム</span>
            <span className="option-desc">列・行を指定</span>
          </div>
        </label>
        {pluginLayouts.length > 0 && (
          <label className={`grid-option ${gridMode === 'preset' ? 'selected' : ''}`}>
            <input type="radio" name="gridMode" checked={gridMode === 'preset'} onChange={() => setGridMode('preset')} />
            <div className="option-content">
              <span className="option-title">プリセット</span>
              <span className="option-desc">プラグインのレイアウト</span>
            </div>
          </label>
        )}
      </div>

      {gridMode === 'custom' && (
        <div className="custom-grid-inputs">
          <div className="grid-input-group">
            <label>行数</label>
            <div className="grid-input-row">
              <div className="grid-input-buttons">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`grid-size-btn ${rows === n ? 'active' : ''}`} onClick={() => setRows(n)}>{n}</button>
                ))}
              </div>
              <input type="number" className="grid-number-input" min={1} max={20} value={rows} onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= 20) setRows(v); }} />
            </div>
          </div>
          <div className="grid-input-group">
            <label>列数</label>
            <div className="grid-input-row">
              <div className="grid-input-buttons">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button key={n} className={`grid-size-btn ${cols === n ? 'active' : ''}`} onClick={() => setCols(n)}>{n}</button>
                ))}
              </div>
              <input type="number" className="grid-number-input" min={1} max={20} value={cols} onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= 20) setCols(v); }} />
            </div>
          </div>
          <div className="grid-preview">
            {rows}行 x {cols}列 = 最大 {cols * rows} ウィンドウ
          </div>
        </div>
      )}

      {gridMode === 'preset' && pluginLayouts.length > 0 && (
        <div className="preset-grid-list">
          {pluginLayouts.map((layout) => (
            <button key={layout.id} className={`preset-grid-btn ${selectedPreset === layout.id ? 'active' : ''}`} onClick={() => handlePresetSelect(layout)}>
              <span className="preset-name">{layout.name}</span>
              <span className="preset-size">{layout.cols} x {layout.rows}</span>
              {layout.description && <span className="preset-desc">{layout.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{appType} ウィンドウをグリッド配置</h2>
          <div className="mg-header-actions">
            <button className={`mg-help-btn ${showHelp ? 'active' : ''}`} onClick={() => setShowHelp(!showHelp)} title="ヘルプ">?</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {showHelp && (
          <div className="mg-help-panel">
            <div className="mg-help-body">
              <h4>Grid配置とは</h4>
              <p>選択したアプリのウィンドウを、ディスプレイ上にグリッド状に整列配置します。</p>
              <h4>全体配置</h4>
              <p>アプリの全ウィンドウを対象にグリッド配置します。</p>
              <h4>カラム別</h4>
              <p>カンバンのカラム（実行中、完了など）を選択し、そのカラムのカードに紐づくウィンドウだけを配置対象にします。</p>
              <div className="mg-help-note">
                <b>ヒント:</b> 複数アプリをまとめて配置する場合は「マルチアプリGrid」を使用してください。
              </div>
            </div>
          </div>
        )}

        {/* タブ切替 */}
        {hasColumns && (
          <div className="grid-modal-tabs">
            <button
              className={`grid-modal-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              全体配置
            </button>
            <button
              className={`grid-modal-tab ${activeTab === 'column' ? 'active' : ''}`}
              onClick={() => setActiveTab('column')}
            >
              カラム別
            </button>
          </div>
        )}

        <div className="grid-modal-content">
          {activeTab === 'all' ? (
            <>
              {displaySection}
              {gridSizeSection}
            </>
          ) : (
            <>
              {/* カラム選択 */}
              <div className="grid-section">
                <h3>対象カラム</h3>
                <div className="column-filter-list">
                  {columns!.map((col) => {
                    const count = columnCardCounts[col.id] || 0;
                    return (
                      <label
                        key={col.id}
                        className={`column-filter-item ${selectedColumnIds.has(col.id) ? 'checked' : ''}`}
                        style={col.color ? { borderColor: selectedColumnIds.has(col.id) ? col.color : undefined } : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumnIds.has(col.id)}
                          onChange={() => {
                            setSelectedColumnIds(prev => {
                              const next = new Set(prev);
                              if (next.has(col.id)) next.delete(col.id);
                              else next.add(col.id);
                              return next;
                            });
                          }}
                        />
                        <span className="column-filter-color" style={{ backgroundColor: col.color || '#6b7280' }} />
                        <span className="column-filter-name">{col.title}</span>
                        <span className="column-filter-count">{count}</span>
                      </label>
                    );
                  })}
                  {selectedWindowIds !== undefined && selectedWindowIds.length > 0 && (
                    <div className="column-filter-summary">
                      対象: {selectedWindowIds.length} ウィンドウ
                    </div>
                  )}
                  {selectedWindowIds !== undefined && selectedWindowIds.length === 0 && (
                    <div className="column-filter-summary warning">
                      選択カラムに現在開いているウィンドウがありません
                    </div>
                  )}
                </div>
              </div>
              {displaySection}
              {gridSizeSection}
            </>
          )}

          {/* 結果表示 */}
          {result && (
            <div className={`grid-result ${result.success ? 'success' : 'error'}`}>
              {result.success
                ? `${result.arranged} 個のウィンドウを配置しました`
                : '配置に失敗しました'}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleArrange}
            disabled={isArrangeDisabled}
          >
            {isArranging ? '配置中...' : '配置する'}
          </button>
        </div>
      </div>
    </div>
  );
}
