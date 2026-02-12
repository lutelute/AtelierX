import { useState, useCallback, useEffect } from 'react';
import { AppTabConfig, MultiGridLayout, MultiGridCell, MultiGridArrangeOptions, MultiGridResult, DisplayInfo } from '../types';

interface MultiGridModalProps {
  enabledTabs: AppTabConfig[];
  favorites: MultiGridLayout[];
  onClose: () => void;
  onArrange: (options: MultiGridArrangeOptions) => Promise<MultiGridResult>;
  onSaveFavorite: (layout: MultiGridLayout) => void;
  onDeleteFavorite: (id: string) => void;
}

type Direction = 'horizontal' | 'vertical';

export function MultiGridModal({
  enabledTabs,
  favorites,
  onClose,
  onArrange,
  onSaveFavorite,
  onDeleteFavorite,
}: MultiGridModalProps) {
  // === クイック配置 ===
  const [splitCount, setSplitCount] = useState(2);
  const [direction, setDirection] = useState<Direction>('horizontal');
  const [quickApps, setQuickApps] = useState<string[]>(() => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      ids.push(enabledTabs[i]?.id || enabledTabs[0]?.id || '');
    }
    return ids;
  });
  const [subCols, setSubCols] = useState(0);
  const [subRows, setSubRows] = useState(0);
  const [arranging, setArranging] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [displayIndex, setDisplayIndex] = useState(0);

  // === カスタム配置 ===
  const [showHelp, setShowHelp] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [cells, setCells] = useState<(string | null)[][]>(() =>
    Array.from({ length: 2 }, () => Array(2).fill(null))
  );
  const [selectingCell, setSelectingCell] = useState<{ row: number; col: number } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getDisplays) {
      window.electronAPI.getDisplays().then(setDisplays);
    }
  }, []);

  const getTab = (tabId: string) => enabledTabs.find(t => t.id === tabId);

  // 分割数変更 → quickApps 配列を伸縮
  const handleSplitCountChange = useCallback((count: number) => {
    setSplitCount(count);
    setQuickApps(prev => {
      const next = [...prev];
      while (next.length < count) {
        // 次の未使用タブか、先頭を使う
        const used = new Set(next);
        const unused = enabledTabs.find(t => !used.has(t.id));
        next.push(unused?.id || enabledTabs[0]?.id || '');
      }
      return next.slice(0, count);
    });
  }, [enabledTabs]);

  const handleQuickAppChange = useCallback((index: number, tabId: string) => {
    setQuickApps(prev => {
      const next = [...prev];
      next[index] = tabId;
      return next;
    });
  }, []);

  // --- クイック配置: 実行 ---
  const handleQuickArrange = useCallback(async () => {
    const multiCells: MultiGridCell[] = [];
    for (let i = 0; i < splitCount; i++) {
      const tab = getTab(quickApps[i]);
      if (!tab) continue;
      if (direction === 'horizontal') {
        multiCells.push({ row: 0, col: i, appName: tab.appName, appTabId: tab.id });
      } else {
        multiCells.push({ row: i, col: 0, appName: tab.appName, appTabId: tab.id });
      }
    }
    if (multiCells.length === 0) return;

    setArranging(true);
    setResultMsg('');
    try {
      const result = await onArrange({
        displayIndex,
        rows: direction === 'vertical' ? splitCount : 1,
        cols: direction === 'horizontal' ? splitCount : 1,
        padding: 0,
        cells: multiCells,
        mode: 'fill',
        subCols: subCols || undefined,
        subRows: subRows || undefined,
      });
      setResultMsg(result.success ? `${result.arranged} アプリを配置しました` : (result.error || '配置に失敗'));
    } catch {
      setResultMsg('エラーが発生しました');
    } finally {
      setArranging(false);
    }
  }, [splitCount, direction, quickApps, displayIndex, subCols, subRows, onArrange, enabledTabs]);

  // --- お気に入り ---
  const handleFavoriteArrange = useCallback(async (fav: MultiGridLayout) => {
    const validCells = fav.cells.filter(c =>
      c.appTabId && enabledTabs.some(t => t.id === c.appTabId)
    );
    if (validCells.length === 0) {
      setResultMsg('有効なアプリがありません');
      return;
    }
    setArranging(true);
    setResultMsg('');
    try {
      const result = await onArrange({
        displayIndex: fav.displayIndex,
        rows: fav.rows,
        cols: fav.cols,
        padding: fav.padding,
        cells: validCells,
      });
      setResultMsg(result.success ? `${result.arranged} アプリを配置` : (result.error || '失敗'));
    } catch {
      setResultMsg('エラーが発生しました');
    } finally {
      setArranging(false);
    }
  }, [enabledTabs, onArrange]);

  const handleLoadFavorite = useCallback((fav: MultiGridLayout) => {
    setRows(fav.rows);
    setCols(fav.cols);
    setDisplayIndex(fav.displayIndex);
    const newCells: (string | null)[][] = Array.from({ length: fav.rows }, () =>
      Array(fav.cols).fill(null)
    );
    for (const cell of fav.cells) {
      if (cell.row < fav.rows && cell.col < fav.cols) {
        const tabExists = cell.appTabId && enabledTabs.some(t => t.id === cell.appTabId);
        newCells[cell.row][cell.col] = tabExists ? cell.appTabId! : null;
      }
    }
    setCells(newCells);
    setShowCustom(true);
  }, [enabledTabs]);

  // --- カスタム配置 ---
  const handleChangeRows = useCallback((newRows: number) => {
    setRows(newRows);
    setCells(prev => {
      const next: (string | null)[][] = [];
      for (let r = 0; r < newRows; r++) {
        next.push(r < prev.length ? prev[r].slice(0, cols) : Array(cols).fill(null));
        while (next[r].length < cols) next[r].push(null);
      }
      return next;
    });
  }, [cols]);

  const handleChangeCols = useCallback((newCols: number) => {
    setCols(newCols);
    setCells(prev => prev.map(row => {
      const newRow = row.slice(0, newCols);
      while (newRow.length < newCols) newRow.push(null);
      return newRow;
    }));
  }, []);

  const handleSelectApp = useCallback((tabId: string) => {
    if (!selectingCell) return;
    setCells(prev => {
      const next = prev.map(r => [...r]);
      next[selectingCell.row][selectingCell.col] = tabId;
      return next;
    });
    setSelectingCell(null);
  }, [selectingCell]);

  const handleClearCell = useCallback((row: number, col: number) => {
    setCells(prev => {
      const next = prev.map(r => [...r]);
      next[row][col] = null;
      return next;
    });
  }, []);

  const handleCustomArrange = useCallback(async () => {
    const multiCells: MultiGridCell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tabId = cells[r]?.[c];
        if (!tabId) continue;
        const tab = enabledTabs.find(t => t.id === tabId);
        if (!tab) continue;
        multiCells.push({ row: r, col: c, appName: tab.appName, appTabId: tabId });
      }
    }
    if (multiCells.length === 0) {
      setResultMsg('セルにアプリを割り当ててください');
      return;
    }
    setArranging(true);
    setResultMsg('');
    try {
      const result = await onArrange({ displayIndex, rows, cols, padding: 0, cells: multiCells });
      setResultMsg(result.success ? `${result.arranged} アプリを配置` : (result.error || '失敗'));
    } catch {
      setResultMsg('エラーが発生しました');
    } finally {
      setArranging(false);
    }
  }, [rows, cols, cells, enabledTabs, displayIndex, onArrange]);

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    const multiCells: MultiGridCell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tabId = cells[r]?.[c];
        if (!tabId) continue;
        const tab = enabledTabs.find(t => t.id === tabId);
        if (!tab) continue;
        multiCells.push({ row: r, col: c, appName: tab.appName, appTabId: tabId });
      }
    }
    onSaveFavorite({
      id: `layout-${Date.now()}`,
      name: saveName.trim(),
      rows, cols, cells: multiCells, displayIndex, padding: 0, createdAt: Date.now(),
    });
    setSaveName('');
    setShowSaveInput(false);
  }, [saveName, rows, cols, cells, enabledTabs, displayIndex, onSaveFavorite]);

  // --- プレビューSVG ---
  const renderPreview = () => {
    const w = 120;
    const h = 60;
    const gap = 3;
    const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];

    for (let i = 0; i < splitCount; i++) {
      const tab = getTab(quickApps[i]);
      const color = tab?.color || '#6b7280';
      if (direction === 'horizontal') {
        const cellW = (w - gap * (splitCount - 1)) / splitCount;
        rects.push({ x: i * (cellW + gap), y: 0, w: cellW, h, color });
      } else {
        const cellH = (h - gap * (splitCount - 1)) / splitCount;
        rects.push({ x: 0, y: i * (cellH + gap), w, h: cellH, color });
      }
    }

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mg-preview-svg">
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill={r.color} opacity="0.3" stroke={r.color} strokeWidth="1.5"/>
        ))}
      </svg>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal multi-grid-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>マルチアプリ Grid配置</h2>
          <div className="mg-header-actions">
            <button className={`mg-help-btn ${showHelp ? 'active' : ''}`} onClick={() => setShowHelp(!showHelp)} title="ヘルプ">?</button>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="multi-grid-content">
          {showHelp && (
            <div className="mg-help-panel">
              <div className="mg-help-body">
                <h4>クイック配置</h4>
                <p>画面を2〜4分割し、各領域にアプリの全ウィンドウをグリッド配置します。</p>
                <ul>
                  <li><b>分割:</b> 画面を何分割するか (2/3/4)</li>
                  <li><b>方向:</b> 左右分割 or 上下分割</li>
                  <li><b>領域内 列/行:</b> 各分割領域内でのウィンドウ配置グリッド (自動=ウィンドウ数に応じて決定)</li>
                  <li><b>画面:</b> 配置先ディスプレイ</li>
                </ul>
                <h4>カスタム配置</h4>
                <p>グリッドの各セルにアプリを自由に割り当て、1ウィンドウずつ配置します。お気に入りに保存可能。</p>
                <div className="mg-help-note">
                  <b>注意:</b> この機能は実験的です。アプリやウィンドウ数の組み合わせによっては正確に配置されない場合があります。macOS専用。
                </div>
              </div>
            </div>
          )}
          {/* === クイック配置 === */}
          <div className="mg-quick-section">
            {/* 分割数 + 方向 */}
            <div className="mg-quick-controls">
              <div className="mg-control-group">
                <label>分割</label>
                <div className="mg-size-buttons">
                  {[2, 3, 4].map(n => (
                    <button
                      key={n}
                      className={`mg-size-btn ${splitCount === n ? 'active' : ''}`}
                      onClick={() => handleSplitCountChange(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mg-control-group">
                <label>方向</label>
                <div className="mg-size-buttons">
                  <button
                    className={`mg-size-btn mg-dir-btn ${direction === 'horizontal' ? 'active' : ''}`}
                    onClick={() => setDirection('horizontal')}
                    title="左右"
                  >
                    <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="0" width="7" height="12" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="9" y="0" width="7" height="12" rx="1.5" fill="currentColor" opacity="0.3"/></svg>
                  </button>
                  <button
                    className={`mg-size-btn mg-dir-btn ${direction === 'vertical' ? 'active' : ''}`}
                    onClick={() => setDirection('vertical')}
                    title="上下"
                  >
                    <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="0" width="16" height="5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="0" y="7" width="16" height="5" rx="1.5" fill="currentColor" opacity="0.3"/></svg>
                  </button>
                </div>
              </div>
              <div className="mg-control-group">
                <label>画面</label>
                <select
                  className="mg-display-select"
                  value={displayIndex}
                  onChange={e => setDisplayIndex(parseInt(e.target.value))}
                >
                  {displays.length <= 1 ? (
                    <option value={0}>
                      メイン{displays[0] ? ` (${displays[0].visibleW}x${displays[0].visibleH})` : ''}
                    </option>
                  ) : (
                    <>
                      <option value={0}>自動</option>
                      {displays.map(d => (
                        <option key={d.index} value={d.index}>
                          {d.isMain ? 'メイン' : `#${d.index}`} ({d.visibleW}x{d.visibleH})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* 領域内グリッド (subCols × subRows) */}
            <div className="mg-quick-controls mg-sub-grid-controls">
              <div className="mg-control-group">
                <label>領域内 列</label>
                <div className="mg-size-buttons">
                  {[0, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      className={`mg-size-btn ${subCols === n ? 'active' : ''}`}
                      onClick={() => setSubCols(n)}
                    >
                      {n === 0 ? '自動' : n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mg-control-group">
                <label>領域内 行</label>
                <div className="mg-size-buttons">
                  {[0, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      className={`mg-size-btn ${subRows === n ? 'active' : ''}`}
                      onClick={() => setSubRows(n)}
                    >
                      {n === 0 ? '自動' : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* アプリ選択リスト + プレビュー */}
            <div className="mg-quick-main">
              <div className="mg-quick-apps">
                {quickApps.map((tabId, i) => (
                  <div key={i} className="mg-quick-app">
                    <span className="mg-app-label" style={{ color: getTab(tabId)?.color }}>{i + 1}</span>
                    <select
                      className="mg-app-select"
                      value={tabId}
                      onChange={e => handleQuickAppChange(i, e.target.value)}
                    >
                      {enabledTabs.map(t => (
                        <option key={t.id} value={t.id}>{t.displayName}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mg-quick-preview">
                {renderPreview()}
              </div>
            </div>

            {/* 配置実行ボタン */}
            <button
              className="mg-arrange-btn mg-quick-arrange"
              onClick={handleQuickArrange}
              disabled={arranging}
            >
              {arranging ? '配置中...' : '配置実行'}
            </button>
          </div>

          {resultMsg && <div className="mg-result-bar">{resultMsg}</div>}

          {/* === お気に入り === */}
          {favorites.length > 0 && (
            <div className="mg-favorites-section">
              <h3>お気に入り</h3>
              <div className="mg-favorites-list">
                {favorites.map(fav => (
                  <div key={fav.id} className="mg-favorite-item">
                    <button
                      className="mg-favorite-load"
                      onClick={() => handleFavoriteArrange(fav)}
                      disabled={arranging}
                      title={fav.cells.map(c => c.appName).join(' + ')}
                    >
                      <span className="mg-favorite-name">{fav.name}</span>
                      <span className="mg-favorite-info">{fav.rows}&times;{fav.cols}</span>
                    </button>
                    <button
                      className="mg-favorite-edit"
                      onClick={() => handleLoadFavorite(fav)}
                      title="カスタムに読み込み"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>
                    </button>
                    <button
                      className="mg-favorite-delete"
                      onClick={() => onDeleteFavorite(fav.id)}
                      title="削除"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === カスタム配置 (折りたたみ) === */}
          <div className="mg-custom-section">
            <button className="mg-custom-toggle" onClick={() => setShowCustom(!showCustom)}>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                style={{ transform: showCustom ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
              >
                <path d="M2 1l6 4-6 4z"/>
              </svg>
              カスタム配置
            </button>

            {showCustom && (
              <div className="mg-custom-body">
                <div className="mg-size-section">
                  <div className="mg-size-group">
                    <label>行</label>
                    <div className="mg-size-buttons">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} className={`mg-size-btn ${rows === n ? 'active' : ''}`} onClick={() => handleChangeRows(n)}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mg-size-group">
                    <label>列</label>
                    <div className="mg-size-buttons">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} className={`mg-size-btn ${cols === n ? 'active' : ''}`} onClick={() => handleChangeCols(n)}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className="mg-grid-editor"
                  style={{
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  }}
                >
                  {cells.map((row, rIdx) =>
                    row.map((tabId, cIdx) => {
                      const tab = tabId ? getTab(tabId) : null;
                      const isSelecting = selectingCell?.row === rIdx && selectingCell?.col === cIdx;
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={`mg-cell ${tab ? 'assigned' : 'empty'} ${isSelecting ? 'selecting' : ''}`}
                          style={tab ? { borderColor: tab.color, backgroundColor: `${tab.color}20` } : undefined}
                          onClick={() => setSelectingCell(isSelecting ? null : { row: rIdx, col: cIdx })}
                        >
                          {tab ? (
                            <div className="mg-cell-content">
                              {tab.iconDataUri ? (
                                <img src={tab.iconDataUri} alt="" className="mg-cell-icon" />
                              ) : (
                                <span className="mg-cell-emoji">{tab.icon}</span>
                              )}
                              <span className="mg-cell-name" style={{ color: tab.color }}>{tab.displayName}</span>
                              <button className="mg-cell-clear" onClick={e => { e.stopPropagation(); handleClearCell(rIdx, cIdx); }}>&times;</button>
                            </div>
                          ) : (
                            <span className="mg-cell-placeholder">+</span>
                          )}
                          {isSelecting && (
                            <div className="mg-app-popover" onClick={e => e.stopPropagation()}>
                              {enabledTabs.map(t => (
                                <button key={t.id} className="mg-app-option" onClick={() => handleSelectApp(t.id)}>
                                  {t.iconDataUri ? (
                                    <img src={t.iconDataUri} alt="" className="mg-app-option-icon" />
                                  ) : (
                                    <span className="mg-app-option-emoji">{t.icon}</span>
                                  )}
                                  <span>{t.displayName}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mg-actions">
                  <div className="mg-actions-left">
                    {!showSaveInput ? (
                      <button className="mg-save-btn" onClick={() => setShowSaveInput(true)}>お気に入りに保存</button>
                    ) : (
                      <div className="mg-save-input-group">
                        <input
                          className="mg-save-input"
                          type="text"
                          placeholder="レイアウト名"
                          value={saveName}
                          onChange={e => setSaveName(e.target.value)}
                          onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                          autoFocus
                        />
                        <button className="mg-save-confirm" onClick={handleSave} disabled={!saveName.trim()}>保存</button>
                        <button className="mg-save-cancel" onClick={() => setShowSaveInput(false)}>&times;</button>
                      </div>
                    )}
                  </div>
                  <button className="mg-arrange-btn" onClick={handleCustomArrange} disabled={arranging}>
                    {arranging ? '配置中...' : '配置実行'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
