import { useState, useEffect } from 'react';
import { DisplayInfo, GridOptions, PluginGridLayout } from '../types';

interface GridArrangeModalProps {
  appType: string;
  onClose: () => void;
  onArrange: (options: GridOptions) => Promise<{ success: boolean; arranged: number }>;
}

export function GridArrangeModal({ appType, onClose, onArrange }: GridArrangeModalProps) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState<number>(0); // 0 = 自動（各ディスプレイ内）
  const [gridMode, setGridMode] = useState<'auto' | 'custom' | 'preset'>('auto');
  const [cols, setCols] = useState<number>(2);
  const [rows, setRows] = useState<number>(2);
  const [padding, setPadding] = useState<number>(5);
  const [isArranging, setIsArranging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; arranged: number } | null>(null);
  const [pluginLayouts, setPluginLayouts] = useState<PluginGridLayout[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

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

  const handleArrange = async () => {
    setIsArranging(true);
    setResult(null);

    const options: GridOptions = {
      displayIndex: selectedDisplay,
      cols: gridMode === 'auto' ? 0 : cols,
      rows: gridMode === 'auto' ? 0 : rows,
      padding: padding,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{appType} ウィンドウをグリッド配置</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="grid-modal-content">
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

            {gridMode === 'custom' && (
              <div className="custom-grid-inputs">
                <div className="grid-input-group">
                  <label>行数</label>
                  <div className="grid-input-row">
                    <div className="grid-input-buttons">
                      {[1, 2, 3, 4, 5].map((n) => (
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
                      max={20}
                      value={rows}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v >= 1 && v <= 20) setRows(v);
                      }}
                    />
                  </div>
                </div>
                <div className="grid-input-group">
                  <label>列数</label>
                  <div className="grid-input-row">
                    <div className="grid-input-buttons">
                      {[2, 3, 4, 5, 6].map((n) => (
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
                      max={20}
                      value={cols}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v >= 1 && v <= 20) setCols(v);
                      }}
                    />
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
            disabled={isArranging}
          >
            {isArranging ? '配置中...' : '配置する'}
          </button>
        </div>
      </div>
    </div>
  );
}
