import { useState, useEffect, useRef } from 'react';
import { Card, TagType, SubTagType, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag, DefaultSubtagSettings, AppWindow, AppTabConfig, BUILTIN_APPS, getAppNameForTab, PriorityConfig, DEFAULT_PRIORITIES } from '../types';
import { computeTerminalBgColorFromHex, buildPriorityColorMap } from '../utils/terminalColor';

// プリセットカラー
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6b7280',
];

interface EditCardModalProps {
  card: Card;
  onClose: () => void;
  onSave: (card: Card) => void;
  onJump: () => void;
  onSendToIdeas?: (cardId: string) => void;
  customSubtags?: CustomSubtag[];
  onAddSubtag?: (subtag: CustomSubtag) => void;
  onUpdateSubtag?: (id: string, updates: Partial<CustomSubtag>) => void;
  onDeleteSubtag?: (id: string) => void;
  onUpdateDefaultSubtag?: (id: string, updates: { name?: string; color?: string }) => void;
  defaultSubtagSettings?: DefaultSubtagSettings;
  enabledTabs?: AppTabConfig[];
  columnColor?: string;
  customPriorities?: PriorityConfig[];
}

export function EditCardModal({ card, onClose, onSave, onJump, onSendToIdeas, customSubtags = [], onAddSubtag, onUpdateSubtag, onDeleteSubtag, onUpdateDefaultSubtag, defaultSubtagSettings, enabledTabs, columnColor, customPriorities = [] }: EditCardModalProps) {
  const tabs = enabledTabs && enabledTabs.length > 0 ? enabledTabs : BUILTIN_APPS;
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [comment, setComment] = useState(card.comment || '');
  const [tag, setTag] = useState<TagType>(card.tag);
  // 後方互換性: subtag を subtags に変換
  const initialSubtags = card.subtags || (card.subtag ? [card.subtag] : []);
  const [subtags, setSubtags] = useState<SubTagType[]>(initialSubtags);
  const [showAddSubtag, setShowAddSubtag] = useState(false);
  const [newSubtagName, setNewSubtagName] = useState('');
  const [newSubtagColor, setNewSubtagColor] = useState(PRESET_COLORS[0]);
  const [editingSubtagId, setEditingSubtagId] = useState<string | null>(null);

  // ウィンドウ紐付け用の状態
  const [windowApp, setWindowApp] = useState<string | undefined>(card.windowApp);
  const [windowId, setWindowId] = useState<string | undefined>(card.windowId);
  const [windowName, setWindowName] = useState<string | undefined>(card.windowName);
  const [showWindowSelect, setShowWindowSelect] = useState(false);
  const [availableWindows, setAvailableWindows] = useState<AppWindow[]>([]);
  const [loadingWindows, setLoadingWindows] = useState(false);
  const [openingNewTerminal, setOpeningNewTerminal] = useState(false);
  const [currentWindowIndex, setCurrentWindowIndex] = useState(0);
  const isActivating = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // ウィンドウをアクティベート（排他制御付き）
  const activateWindowSafe = async (win: AppWindow) => {
    if (isActivating.current || !window.electronAPI?.activateWindow) return;
    isActivating.current = true;
    try {
      await window.electronAPI.activateWindow(win.app, win.id, win.name);
      // 少し待ってから次のアクティベートを許可
      await new Promise(resolve => setTimeout(resolve, 400));
    } finally {
      isActivating.current = false;
    }
  };

  // ウィンドウ一覧を取得
  const fetchWindows = async () => {
    if (!window.electronAPI?.getAppWindows) return;
    setLoadingWindows(true);
    try {
      // タグに応じたアプリ名を取得
      const appName = getAppNameForTab(tag, enabledTabs);
      const extraApps = appName && appName !== 'Terminal' && appName !== 'Finder'
        ? [appName]
        : undefined;
      const windows = await window.electronAPI.getAppWindows(extraApps);
      // タグに応じてフィルタ
      const filtered = appName
        ? windows.filter((w: AppWindow) => w.app === appName)
        : windows;
      setAvailableWindows(filtered);
      setCurrentWindowIndex(0);
      // 最初のウィンドウをポップアップ
      if (filtered.length > 0) {
        activateWindowSafe(filtered[0]);
      }
    } finally {
      setLoadingWindows(false);
    }
  };

  useEffect(() => {
    if (showWindowSelect) {
      fetchWindows();
    }
  }, [showWindowSelect, tag]);

  // 次のウィンドウへ
  const handleNextWindow = () => {
    if (availableWindows.length === 0 || isActivating.current) return;
    const nextIndex = (currentWindowIndex + 1) % availableWindows.length;
    setCurrentWindowIndex(nextIndex);
    activateWindowSafe(availableWindows[nextIndex]);
  };

  // 前のウィンドウへ
  const handlePrevWindow = () => {
    if (availableWindows.length === 0 || isActivating.current) return;
    const prevIndex = (currentWindowIndex - 1 + availableWindows.length) % availableWindows.length;
    setCurrentWindowIndex(prevIndex);
    activateWindowSafe(availableWindows[prevIndex]);
  };

  // 現在のウィンドウを選択
  const handleConfirmWindow = () => {
    if (availableWindows.length === 0) return;
    const win = availableWindows[currentWindowIndex];
    setWindowApp(win.app);
    setWindowId(win.id);
    setWindowName(win.name);
    setShowWindowSelect(false);
  };

  // ウィンドウを選択（リストから直接）
  const handleSelectWindow = (win: AppWindow, index: number) => {
    if (isActivating.current) return;
    setCurrentWindowIndex(index);
    activateWindowSafe(win);
  };

  // 新しいターミナルを開いて紐付け
  const handleOpenNewTerminal = async () => {
    if (!window.electronAPI?.openNewTerminal) return;
    setOpeningNewTerminal(true);
    try {
      const result = await window.electronAPI.openNewTerminal();
      if (result.success && result.windowName) {
        setWindowApp('Terminal');
        setWindowName(result.windowName);
      }
    } finally {
      setOpeningNewTerminal(false);
    }
  };

  // ウィンドウ紐付けを解除
  const handleUnlinkWindow = () => {
    setWindowApp(undefined);
    setWindowId(undefined);
    setWindowName(undefined);
  };

  const handleAddSubtag = () => {
    if (!newSubtagName.trim() || !onAddSubtag) return;
    const newSubtag: CustomSubtag = {
      id: `subtag-${Date.now()}`,
      name: newSubtagName.trim(),
      color: newSubtagColor,
    };
    onAddSubtag(newSubtag);
    setSubtags([...subtags, newSubtag.id]);
    setNewSubtagName('');
    setNewSubtagColor(PRESET_COLORS[0]);
    setShowAddSubtag(false);
  };

  // サブタグの選択/解除をトグル
  const toggleSubtag = (subtagId: SubTagType) => {
    if (subtags.includes(subtagId)) {
      setSubtags(subtags.filter(s => s !== subtagId));
    } else {
      setSubtags([...subtags, subtagId]);
    }
  };

  // デフォルトサブタグの情報を取得（上書きを適用）
  const getDefaultSubtagInfo = (id: SubTagType) => {
    const override = defaultSubtagSettings?.overrides?.[id];
    return {
      name: override?.name || SUBTAG_LABELS[id as keyof typeof SUBTAG_LABELS],
      color: override?.color || SUBTAG_COLORS[id as keyof typeof SUBTAG_COLORS],
    };
  };

  // 表示するデフォルトサブタグ（非表示を除外）
  const visibleDefaultSubtags = (Object.keys(SUBTAG_LABELS) as SubTagType[]).filter(
    (id) => !defaultSubtagSettings?.hidden?.includes(id)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSave({
        ...card,
        title: title.trim(),
        description: description.trim() || undefined,
        comment: comment.trim() || undefined,
        tag,
        subtag: undefined, // 旧形式は削除
        subtags: subtags.length > 0 ? subtags : undefined,
        windowApp,
        windowId,
        windowName,
      });
      onClose();
    }
  };

  const canJump = windowApp && windowName;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>カードを編集</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-title">タイトル</label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-description">
              説明・タスク（任意）
              <button
                type="button"
                className="btn-add-task"
                onClick={() => {
                  const prefix = description && !description.endsWith('\n') ? '\n' : '';
                  setDescription(description + prefix + '- [ ] ');
                }}
              >
                + タスク追加
              </button>
            </label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const lines = description.split('\n');
                  // カーソル位置の行を特定
                  let charCount = 0;
                  let lineIndex = 0;
                  for (let i = 0; i < lines.length; i++) {
                    if (charCount + lines[i].length >= start) {
                      lineIndex = i;
                      break;
                    }
                    charCount += lines[i].length + 1; // +1 for \n
                  }
                  const line = lines[lineIndex];
                  // リスト行（- [ ] or - ）のみインデント対応
                  if (/^\s*[-*]\s/.test(line)) {
                    if (e.shiftKey) {
                      // Shift+Tab: アンインデント（先頭2スペース削除）
                      if (line.startsWith('  ')) {
                        lines[lineIndex] = line.slice(2);
                        const newDesc = lines.join('\n');
                        setDescription(newDesc);
                        requestAnimationFrame(() => {
                          textarea.selectionStart = Math.max(start - 2, charCount);
                          textarea.selectionEnd = Math.max(end - 2, charCount);
                        });
                      }
                    } else {
                      // Tab: インデント（先頭に2スペース追加）
                      lines[lineIndex] = '  ' + line;
                      const newDesc = lines.join('\n');
                      setDescription(newDesc);
                      requestAnimationFrame(() => {
                        textarea.selectionStart = start + 2;
                        textarea.selectionEnd = end + 2;
                      });
                    }
                  }
                }
              }}
              placeholder="詳細を入力&#10;- [ ] タスク1&#10;- [ ] タスク2"
              rows={6}
            />
            <span className="form-hint">「- [ ] 」でタスクリスト、「- [x] 」で完了</span>
          </div>
          <div className="form-group">
            <label htmlFor="edit-comment">
              コメント（任意）
              <button
                type="button"
                className="btn-add-task"
                onClick={() => {
                  const prefix = comment && !comment.endsWith('\n') ? '\n' : '';
                  setComment(comment + prefix + '- ');
                }}
              >
                + リスト追加
              </button>
            </label>
            <textarea
              id="edit-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="メモやコメントを入力&#10;**太字** *斜体* `コード`"
              rows={5}
            />
            <span className="form-hint">Markdown対応: **太字**, *斜体*, `コード`, - リスト</span>
          </div>
          <div className="form-group">
            <label>タグ</label>
            <div className="tag-selector">
              {tabs.map((tabConfig) => (
                <button
                  key={tabConfig.id}
                  type="button"
                  className={`tag-option ${tag === tabConfig.id ? 'selected' : ''}`}
                  style={{
                    borderColor: tag === tabConfig.id ? tabConfig.color : 'transparent',
                    backgroundColor: tag === tabConfig.id ? `${tabConfig.color}20` : 'transparent',
                  }}
                  onClick={() => setTag(tabConfig.id)}
                >
                  <span
                    className="tag-dot"
                    style={{ backgroundColor: tabConfig.color }}
                  />
                  {tabConfig.displayName}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>サブタグ（複数選択可）</label>
            <div className="tag-selector">
              <button
                type="button"
                className={`tag-option ${subtags.length === 0 ? 'selected' : ''}`}
                style={{
                  borderColor: subtags.length === 0 ? '#888' : 'transparent',
                  backgroundColor: subtags.length === 0 ? '#88888820' : 'transparent',
                }}
                onClick={() => setSubtags([])}
              >
                なし
              </button>
              {visibleDefaultSubtags.map((subtagOption) => {
                const info = getDefaultSubtagInfo(subtagOption);
                const isEditing = editingSubtagId === subtagOption;
                return isEditing && onUpdateDefaultSubtag ? (
                  <div key={subtagOption} className="tag-option-edit">
                    <input
                      type="text"
                      className="subtag-edit-input"
                      value={info.name}
                      onChange={(e) => onUpdateDefaultSubtag(subtagOption, { name: e.target.value })}
                      autoFocus
                    />
                    <div className="color-picker-mini">
                      {PRESET_COLORS.slice(0, 8).map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-option-mini ${info.color === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => onUpdateDefaultSubtag(subtagOption, { color })}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-edit-done"
                      onClick={() => setEditingSubtagId(null)}
                    >
                      完了
                    </button>
                  </div>
                ) : (
                  <div key={subtagOption} className="tag-option-wrapper">
                    <button
                      type="button"
                      className={`tag-option ${subtags.includes(subtagOption) ? 'selected' : ''}`}
                      style={{
                        borderColor: subtags.includes(subtagOption) ? info.color : 'transparent',
                        backgroundColor: subtags.includes(subtagOption) ? `${info.color}20` : 'transparent',
                      }}
                      onClick={() => toggleSubtag(subtagOption)}
                    >
                      <span
                        className="tag-dot"
                        style={{ backgroundColor: info.color }}
                      />
                      {info.name}
                    </button>
                    {onUpdateDefaultSubtag && (
                      <button
                        type="button"
                        className="tag-edit-btn"
                        onClick={() => setEditingSubtagId(subtagOption)}
                        title="編集"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                );
              })}
              {customSubtags.map((customTag) => {
                const isEditing = editingSubtagId === customTag.id;
                return isEditing && onUpdateSubtag ? (
                  <div key={customTag.id} className="tag-option-edit">
                    <input
                      type="text"
                      className="subtag-edit-input"
                      value={customTag.name}
                      onChange={(e) => onUpdateSubtag(customTag.id, { name: e.target.value })}
                      autoFocus
                    />
                    <div className="color-picker-mini">
                      {PRESET_COLORS.slice(0, 8).map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-option-mini ${customTag.color === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => onUpdateSubtag(customTag.id, { color })}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-edit-done"
                      onClick={() => setEditingSubtagId(null)}
                    >
                      完了
                    </button>
                    {onDeleteSubtag && (
                      <button
                        type="button"
                        className="btn-edit-delete"
                        onClick={() => {
                          onDeleteSubtag(customTag.id);
                          setEditingSubtagId(null);
                        }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={customTag.id} className="tag-option-wrapper">
                    <button
                      type="button"
                      className={`tag-option ${subtags.includes(customTag.id) ? 'selected' : ''}`}
                      style={{
                        borderColor: subtags.includes(customTag.id) ? customTag.color : 'transparent',
                        backgroundColor: subtags.includes(customTag.id) ? `${customTag.color}20` : 'transparent',
                      }}
                      onClick={() => toggleSubtag(customTag.id)}
                    >
                      <span
                        className="tag-dot"
                        style={{ backgroundColor: customTag.color }}
                      />
                      {customTag.name}
                    </button>
                    {onUpdateSubtag && (
                      <button
                        type="button"
                        className="tag-edit-btn"
                        onClick={() => setEditingSubtagId(customTag.id)}
                        title="編集"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                );
              })}
              {onAddSubtag && (
                <button
                  type="button"
                  className="tag-option add-subtag-btn"
                  onClick={() => setShowAddSubtag(!showAddSubtag)}
                >
                  + 追加
                </button>
              )}
            </div>
            {showAddSubtag && onAddSubtag && (
              <div className="inline-add-subtag">
                <input
                  type="text"
                  placeholder="タグ名"
                  value={newSubtagName}
                  onChange={(e) => setNewSubtagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtag();
                    }
                  }}
                />
                <div className="color-picker-inline">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${newSubtagColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewSubtagColor(color)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-add-inline"
                  onClick={handleAddSubtag}
                  disabled={!newSubtagName.trim()}
                >
                  追加
                </button>
              </div>
            )}
          </div>
          {/* ウィンドウ紐付けセクション */}
          <div className="form-group">
            <label>ウィンドウ紐付け</label>
            {windowApp && windowName ? (
              <div className="linked-window-info">
                <span className={`window-app-badge window-app-${windowApp.toLowerCase()}`}>
                  {windowApp}
                </span>
                <span className="linked-window-name">
                  {windowName.split(' — ')[0]}
                  {windowId && <span className="linked-window-id"> (ID: {windowId.slice(-8)})</span>}
                </span>
                <button
                  type="button"
                  className="btn-unlink"
                  onClick={handleUnlinkWindow}
                  title="紐付け解除"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="window-link-actions">
                {tag === 'terminal' && (
                  <button
                    type="button"
                    className="btn-link-terminal"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleOpenNewTerminal();
                    }}
                    disabled={openingNewTerminal}
                  >
                    {openingNewTerminal ? '開いています...' : '+ 新しい Terminal を開く'}
                  </button>
                )}
                {tag !== 'terminal' && tag !== 'finder' && (
                  <button
                    type="button"
                    className="btn-link-terminal"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const appName = getAppNameForTab(tag, enabledTabs);
                      if (appName && window.electronAPI?.openNewGenericWindow) {
                        setOpeningNewTerminal(true);
                        try {
                          const result = await window.electronAPI.openNewGenericWindow(appName);
                          if (result.success && result.windowName) {
                            setWindowApp(appName);
                            setWindowName(result.windowName);
                          }
                        } finally {
                          setOpeningNewTerminal(false);
                        }
                      }
                    }}
                    disabled={openingNewTerminal}
                  >
                    {openingNewTerminal ? '開いています...' : `+ 新しい ${getAppNameForTab(tag, enabledTabs) || ''} を開く`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-link-existing"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowWindowSelect(!showWindowSelect);
                  }}
                >
                  既存のウィンドウを選択
                </button>
              </div>
            )}
            {showWindowSelect && (
              <div className="window-select-inline">
                {loadingWindows && <div className="window-loading">読み込み中...</div>}
                {!loadingWindows && availableWindows.length === 0 && (
                  <div className="window-empty-inline">
                    {getAppNameForTab(tag, enabledTabs) || tag} のウィンドウがありません
                  </div>
                )}
                {!loadingWindows && availableWindows.length > 0 && (
                  <>
                    {/* カルーセル式ナビゲーション */}
                    <div
                      className="window-carousel"
                      onWheel={(e) => {
                        e.preventDefault();
                        // デバウンス: 連続スクロールを防ぐ
                        if (scrollTimeout.current) return;
                        scrollTimeout.current = setTimeout(() => {
                          scrollTimeout.current = null;
                        }, 500);
                        if (e.deltaY > 0) {
                          handleNextWindow();
                        } else {
                          handlePrevWindow();
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="carousel-btn carousel-prev"
                        onClick={handlePrevWindow}
                        disabled={availableWindows.length <= 1}
                      >
                        ◀
                      </button>
                      <div className="carousel-current">
                        <span className="carousel-counter">
                          {currentWindowIndex + 1} / {availableWindows.length}
                          {' '}(#{availableWindows[currentWindowIndex]?.windowIndex ?? currentWindowIndex + 1})
                        </span>
                        <span className="carousel-name">
                          {availableWindows[currentWindowIndex]?.name.split(' — ')[0]}
                        </span>
                        <span className="carousel-id">
                          ID: {availableWindows[currentWindowIndex]?.id.slice(-8)}
                        </span>
                        {availableWindows[currentWindowIndex]?.preview && (
                          <span className="carousel-preview">
                            {availableWindows[currentWindowIndex].preview}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="carousel-btn carousel-next"
                        onClick={handleNextWindow}
                        disabled={availableWindows.length <= 1}
                      >
                        ▶
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn-confirm-window"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmWindow();
                      }}
                    >
                      ✓ 決定
                    </button>
                    {/* リスト表示（小さく） */}
                    <div className="window-list-mini">
                      {availableWindows.map((win, index) => (
                        <button
                          key={`${win.app}-${win.id}`}
                          type="button"
                          className={`window-item-mini ${index === currentWindowIndex ? 'active' : ''}`}
                          onClick={() => handleSelectWindow(win, index)}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {canJump && (
            <div className="form-group">
              <button
                type="button"
                className="btn-jump"
                onClick={() => {
                  onJump();
                }}
              >
                {windowApp} ウィンドウを開く
              </button>
            </div>
          )}
          {windowApp === 'Terminal' && windowId && window.electronAPI?.platform === 'darwin' && (
            <div className="form-group">
              <label>Terminal 背景色</label>
              <div className="terminal-color-section">
                <div className="terminal-color-presets">
                  {columnColor && (
                    <button
                      type="button"
                      className="terminal-color-action-btn"
                      onClick={() => {
                        const bgColor = computeTerminalBgColorFromHex(columnColor);
                        window.electronAPI?.setTerminalColor(windowId, { bgColor });
                      }}
                    >
                      <span className="terminal-color-dot" style={{ background: columnColor }} />
                      カラム色
                    </button>
                  )}
                  {card.priority && (() => {
                    const colorMap = buildPriorityColorMap([...DEFAULT_PRIORITIES, ...customPriorities]);
                    const pColor = colorMap[card.priority];
                    return pColor ? (
                      <button
                        type="button"
                        className="terminal-color-action-btn"
                        onClick={() => {
                          const bgColor = computeTerminalBgColorFromHex(pColor);
                          window.electronAPI?.setTerminalColor(windowId, { bgColor });
                        }}
                      >
                        <span className="terminal-color-dot" style={{ background: pColor }} />
                        優先順位色
                      </button>
                    ) : null;
                  })()}
                  <button
                    type="button"
                    className="terminal-color-action-btn terminal-color-reset-btn"
                    onClick={() => {
                      window.electronAPI?.setTerminalColor(windowId, { bgColor: { r: 0, g: 0, b: 0 } });
                    }}
                  >
                    <span className="terminal-color-dot" style={{ background: '#000' }} />
                    リセット
                  </button>
                </div>
                <div className="terminal-color-custom">
                  <input
                    type="color"
                    className="terminal-color-picker-input"
                    defaultValue="#1a1a2e"
                    onChange={(e) => {
                      const bgColor = computeTerminalBgColorFromHex(e.target.value, 0.35);
                      window.electronAPI?.setTerminalColor(windowId, { bgColor });
                    }}
                  />
                  <span className="terminal-color-picker-text">カスタムカラー</span>
                </div>
              </div>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            {onSendToIdeas && (
              <button
                type="button"
                className="btn-send-to-ideas"
                onClick={() => {
                  onSendToIdeas(card.id);
                  onClose();
                }}
                title="今じゃない - Ideasに送る"
              >
                💡 今じゃない
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
