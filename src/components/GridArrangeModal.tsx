import { useState, useEffect, useMemo } from 'react';
import { DisplayInfo, GridOptions, PluginGridLayout, Column as ColumnType, Card as CardType } from '../types';

interface GridArrangeModalProps {
  appType: string;
  onClose: () => void;
  onArrange: (options: GridOptions) => Promise<{ success: boolean; arranged: number }>;
  columns?: ColumnType[];
  cards?: Record<string, CardType>;
}

export function GridArrangeModal({ appType, onClose, onArrange, columns, cards }: GridArrangeModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<number>(0); // 0 = 自動（各ディスプレイ内）
  const [showHelp, setShowHelp] = useState(false);
  const [gridMode, setGridMode] = useState<'auto' | 'custom' | 'preset'>('auto');
  const [cols, setCols] = useState<number>(2);
  const [rows, setRows] = useState<number>(2);
  const [padding, setPadding] = useState<number>(5);
  const [isArranging, setIsArranging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; arranged: number; error?: string } | null>(null);
  const [pluginLayouts, setPluginLayouts] = useState<PluginGridLayout[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // カラム別フィルタ用
  const [activeTab, setActiveTab] = useState<'all' | 'column'>('all');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set());

  // カラムデータがあるかどうか（タブ表示の判定）
  const hasColumnData = !!(columns && columns.length > 0 && cards);

  // 全ウィンドウ紐付きカード数
  const totalWindowCount = useMemo(() => {
    if (!columns || !cards) return 0;
    let count = 0;
    for (const col of columns) {
      for (const cardId of col.cardIds) {
        const card = cards[cardId];
        if (card && !card.archived && card.windowId) count++;
      }
    }
    return count;
  }, [columns, cards]);

  // カラムごとのウィンドウ紐付きカード数を計算
  const columnWindowCounts = useMemo(() => {
    if (!columns || !cards) return {};
    const counts: Record<string, number> = {};
    for (const col of columns) {
      counts[col.id] = col.cardIds.filter(cardId => {
        const card = cards[cardId];
        return card && !card.archived && card.windowId;
      }).length;
    }
    return counts;
  }, [columns, cards]);

  // 選択されたカラムのウィンドウIDリストを取得
  const selectedWindowIds = useMemo(() => {
    if (!columns || !cards || selectedColumnIds.size === 0) return [];
    const ids: string[] = [];
    for (const col of columns) {
      if (!selectedColumnIds.has(col.id)) continue;
      for (const cardId of col.cardIds) {
        const card = cards[cardId];
        if (card && !card.archived && card.windowId) {
          ids.push(card.windowId);
        }
      }
    }
    return ids;
  }, [columns, cards, selectedColumnIds]);

  // 自動グリッドサイズ計算（バックエンドの asGridCalc と同じロジック）
  const autoGrid = useMemo(() => {
    const n = activeTab === 'column' ? selectedWindowIds.length : totalWindowCount;
    if (n <= 0) return { cols: 1, rows: 1 };
    let c: number;
    if (n <= 1) c = 1;
    else if (n <= 2) c = 2;
    else if (n <= 3) c = 3;
    else if (n <= 6) c = 3;
    else if (n <= 8) c = 4;
    else if (n <= 12) c = 4;
    else if (n <= 20) c = 5;
    else c = 6;
    const r = Math.ceil(n / c);
    return { cols: c, rows: r };
  }, [totalWindowCount, selectedWindowIds.length, activeTab]);

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

  // プリセット選択時にcols/rows/paddingを更新
  const handlePresetSelect = (layout: PluginGridLayout) => {
    setSelectedPreset(layout.id);
    setCols(layout.cols);
    setRows(layout.rows);
    setPadding(layout.padding || 5);
  };

  const handleColumnToggle = (colId: string) => {
    setSelectedColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  };

  const handleSelectAllColumns = () => {
    if (!columns) return;
    const allIds = columns.filter(col => (columnWindowCounts[col.id] || 0) > 0).map(col => col.id);
    setSelectedColumnIds(new Set(allIds));
  };

  const handleDeselectAllColumns = () => {
    setSelectedColumnIds(new Set());
  };

  const handleArrange = async () => {
    setIsArranging(true);
    setResult(null);

    const options: GridOptions = {
      displayIndex: selectedDisplay,
      cols: gridMode === 'auto' ? 0 : cols,
      rows: gridMode === 'auto' ? 0 : rows,
      padding: padding,
    };

    // カラム別タブで選択がある場合、windowIds を付与
    if (activeTab === 'column' && selectedWindowIds.length > 0) {
      options.windowIds = selectedWindowIds;
    }

    try {
      const res = await onArrange(options);
      setResult(res);
      if (res.success) {
        setTimeout(() => setResult(null), 3000);
      }
    } catch (error: any) {
      setResult({ success: false, arranged: 0, error: error?.message || String(error) });
    } finally {
      setIsArranging(false);
    }
  };

  const canArrange = activeTab === 'all' || (activeTab === 'column' && selectedWindowIds.length > 0);

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
              <h4>配置先ディスプレイ</h4>
              <ul>
                <li><b>自動配置:</b> 各ウィンドウが現在あるディスプレイ内で配置</li>
                <li><b>ディスプレイ指定:</b> 全ウィンドウを選択したディスプレイに集約して配置</li>
              </ul>
              <h4>グリッドサイズ</h4>
              <ul>
                <li><b>自動:</b> ウィンドウ数に応じて最適な行列を自動決定</li>
                <li><b>カスタム:</b> 行数・列数を手動で指定</li>
                <li><b>プリセット:</b> プラグインで追加されたレイアウトを選択</li>
              </ul>
              {hasColumnData && (
                <>
                  <h4>カラム別配置</h4>
                  <p>特定のカラムに属するカードのウィンドウだけを選んで配置できます。</p>
                </>
              )}
              <div className="mg-help-note">
                <b>ヒント:</b> 1つのアプリのウィンドウだけを対象にします。複数アプリをまとめて配置する場合は「マルチアプリGrid」を使用してください。
              </div>
            </div>
          </div>
        )}

        <div className="grid-modal-content">
          {/* タブUI（カラムデータがある場合のみ表示） */}
          {hasColumnData && (
            <div className="grid-filter-tabs">
              <button
                className={`grid-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                全体配置
              </button>
              <button
                className={`grid-filter-tab ${activeTab === 'column' ? 'active' : ''}`}
                onClick={() => setActiveTab('column')}
              >
                カラム別
              </button>
            </div>
          )}

          {/* カラム選択UI（カラム別タブ時のみ） */}
          {activeTab === 'column' && hasColumnData && (
            <div className="grid-section grid-column-filter">
              <div className="grid-column-filter-header">
                <h3>対象カラム</h3>
                <div className="grid-column-filter-actions">
                  <button className="grid-column-select-btn" onClick={handleSelectAllColumns}>全選択</button>
                  <button className="grid-column-select-btn" onClick={handleDeselectAllColumns}>全解除</button>
                </div>
              </div>
              <div className="grid-column-list">
                {columns!.map(col => {
                  const wCount = columnWindowCounts[col.id] || 0;
                  return (
                    <label
                      key={col.id}
                      className={`grid-column-item ${selectedColumnIds.has(col.id) ? 'selected' : ''} ${wCount === 0 ? 'disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumnIds.has(col.id)}
                        onChange={() => handleColumnToggle(col.id)}
                        disabled={wCount === 0}
                      />
                      <span
                        className="grid-column-color"
                        style={{ background: col.color || '#6b7280' }}
                      />
                      <span className="grid-column-name">{col.title}</span>
                      <span className="grid-column-count">{wCount}</span>
                    </label>
                  );
                })}
              </div>
              {selectedWindowIds.length > 0 && (
                <div className="grid-column-summary">
                  {selectedWindowIds.length} 個のウィンドウが対象
                </div>
              )}
              {selectedWindowIds.length === 0 && selectedColumnIds.size === 0 && (
                <div className="grid-column-summary grid-column-summary-warn">
                  カラムを選択してください
                </div>
              )}
            </div>
          )}

          {/* ディスプレイ選択 */}
          <div className="grid-section">
            <h3>配置先ディスプレイ</h3>
            <div className="grid-options">
              <label className={`grid-option ${selectedDisplay === 0 ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="display"
                  checked={selectedDisplay === 0}
                  onChange={() => setSelectedDisplay(0)}
                />
                <div className="option-content">
                  <span className="option-title">自動配置</span>
                  <span className="option-desc">各ディスプレイ内で配置</span>
                </div>
              </label>
              {displays.map((display) => (
                <label
                  key={display.index}
                  className={`grid-option ${selectedDisplay === display.index ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="display"
                    checked={selectedDisplay === display.index}
                    onChange={() => setSelectedDisplay(display.index)}
                  />
                  <div className="option-content">
                    <span className="option-title">
                      ディスプレイ {display.index}
                      {display.isMain && <span className="main-badge">メイン</span>}
                    </span>
                    <span className="option-desc">
                      {display.frameW} x {display.frameH}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* グリッドサイズ選択 */}
          <div className="grid-section">
            <h3>グリッドサイズ</h3>
            <div className="grid-options">
              <label className={`grid-option ${gridMode === 'auto' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="gridMode"
                  checked={gridMode === 'auto'}
                  onChange={() => setGridMode('auto')}
                />
                <div className="option-content">
                  <span className="option-title">自動（おすすめ）</span>
                  <span className="option-desc">ウィンドウ数に応じて最適化</span>
                </div>
              </label>
              <label className={`grid-option ${gridMode === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="gridMode"
                  checked={gridMode === 'custom'}
                  onChange={() => { setGridMode('custom'); setSelectedPreset(null); }}
                />
                <div className="option-content">
                  <span className="option-title">カスタム</span>
                  <span className="option-desc">列・行を指定</span>
                </div>
              </label>
              {pluginLayouts.length > 0 && (
                <label className={`grid-option ${gridMode === 'preset' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="gridMode"
                    checked={gridMode === 'preset'}
                    onChange={() => setGridMode('preset')}
                  />
                  <div className="option-content">
                    <span className="option-title">プリセット</span>
                    <span className="option-desc">プラグインのレイアウト</span>
                  </div>
                </label>
              )}
            </div>

            {gridMode === 'auto' && (
              <div className="custom-grid-inputs">
                <div className="grid-preview">
                  {autoGrid.rows}行 x {autoGrid.cols}列（ウィンドウ {activeTab === 'column' ? selectedWindowIds.length : totalWindowCount} 個）
                </div>
                <div className="grid-preview-visual">
                  {Array.from({ length: Math.min(autoGrid.rows, 8) }).map((_, r) => (
                    <div key={r} className="grid-preview-row">
                      {Array.from({ length: Math.min(autoGrid.cols, 8) }).map((_, c) => {
                        const idx = r * autoGrid.cols + c;
                        const n = activeTab === 'column' ? selectedWindowIds.length : totalWindowCount;
                        return (
                          <div
                            key={c}
                            className={`grid-preview-cell ${idx < n ? '' : 'grid-preview-cell-empty'}`}
                          />
                        );
                      })}
                      {autoGrid.cols > 8 && <span className="grid-preview-ellipsis">...</span>}
                    </div>
                  ))}
                  {autoGrid.rows > 8 && <div className="grid-preview-ellipsis">...</div>}
                </div>
              </div>
            )}

            {gridMode === 'custom' && (
              <div className="custom-grid-inputs">
                <div className="grid-input-group">
                  <label>行数</label>
                  <div className="grid-input-row">
                    <div className="grid-input-buttons">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          className={`grid-size-btn ${rows === n ? 'active' : ''}`}
                          onClick={() => setRows(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      className="grid-number-input"
                      min={1}
                      max={50}
                      value={rows}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v >= 1 && v <= 50) setRows(v);
                      }}
                    />
                  </div>
                </div>
                <div className="grid-input-group">
                  <label>列数</label>
                  <div className="grid-input-row">
                    <div className="grid-input-buttons">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          className={`grid-size-btn ${cols === n ? 'active' : ''}`}
                          onClick={() => setCols(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      className="grid-number-input"
                      min={1}
                      max={50}
                      value={cols}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v >= 1 && v <= 50) setCols(v);
                      }}
                    />
                  </div>
                </div>
                <div className="grid-preview">
                  {rows}行 x {cols}列 = 最大 {cols * rows} ウィンドウ
                </div>
                <div className="grid-preview-visual">
                  {Array.from({ length: Math.min(rows, 8) }).map((_, r) => (
                    <div key={r} className="grid-preview-row">
                      {Array.from({ length: Math.min(cols, 8) }).map((_, c) => (
                        <div key={c} className="grid-preview-cell" />
                      ))}
                      {cols > 8 && <span className="grid-preview-ellipsis">...</span>}
                    </div>
                  ))}
                  {rows > 8 && <div className="grid-preview-ellipsis">...</div>}
                </div>
              </div>
            )}

            {gridMode === 'preset' && pluginLayouts.length > 0 && (
              <div className="preset-grid-list">
                {pluginLayouts.map((layout) => (
                  <button
                    key={layout.id}
                    className={`preset-grid-btn ${selectedPreset === layout.id ? 'active' : ''}`}
                    onClick={() => handlePresetSelect(layout)}
                  >
                    <span className="preset-name">{layout.name}</span>
                    <span className="preset-size">{layout.cols} x {layout.rows}</span>
                    {layout.description && (
                      <span className="preset-desc">{layout.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 結果表示 */}
          {result && (
            <div className={`grid-result ${result.success ? 'success' : 'error'}`}>
              {result.success
                ? `${result.arranged} 個のウィンドウを配置しました`
                : `配置に失敗しました${result.error ? `: ${result.error}` : ''}`}
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
            disabled={isArranging || !canArrange}
          >
            {isArranging ? '配置中...' : '配置する'}
          </button>
        </div>
      </div>
    </div>
  );
}
