import { useState, useEffect, useRef } from 'react';
import { Card, TagType, SubTagType, TAG_LABELS, TAG_COLORS, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag, AppWindow } from '../types';

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
  customSubtags?: CustomSubtag[];
  onAddSubtag?: (subtag: CustomSubtag) => void;
}

export function EditCardModal({ card, onClose, onSave, onJump, customSubtags = [], onAddSubtag }: EditCardModalProps) {
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

  // ウィンドウ紐付け用の状態
  const [windowApp, setWindowApp] = useState<'Terminal' | 'Finder' | undefined>(card.windowApp);
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
      const windows = await window.electronAPI.getAppWindows();
      // タグに応じてフィルタ
      const filtered = windows.filter((w: AppWindow) =>
        tag === 'terminal' ? w.app === 'Terminal' : w.app === 'Finder'
      );
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
              placeholder="詳細を入力&#10;- [ ] タスク1&#10;- [ ] タスク2"
              rows={4}
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
              rows={3}
            />
            <span className="form-hint">Markdown対応: **太字**, *斜体*, `コード`, - リスト</span>
          </div>
          <div className="form-group">
            <label>タグ</label>
            <div className="tag-selector">
              {(Object.keys(TAG_LABELS) as TagType[]).map((tagOption) => (
                <button
                  key={tagOption}
                  type="button"
                  className={`tag-option ${tag === tagOption ? 'selected' : ''}`}
                  style={{
                    borderColor: tag === tagOption ? TAG_COLORS[tagOption] : 'transparent',
                    backgroundColor: tag === tagOption ? `${TAG_COLORS[tagOption]}20` : 'transparent',
                  }}
                  onClick={() => setTag(tagOption)}
                >
                  <span
                    className="tag-dot"
                    style={{ backgroundColor: TAG_COLORS[tagOption] }}
                  />
                  {TAG_LABELS[tagOption]}
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
              {(Object.keys(SUBTAG_LABELS) as SubTagType[]).map((subtagOption) => (
                <button
                  key={subtagOption}
                  type="button"
                  className={`tag-option ${subtags.includes(subtagOption) ? 'selected' : ''}`}
                  style={{
                    borderColor: subtags.includes(subtagOption) ? SUBTAG_COLORS[subtagOption as keyof typeof SUBTAG_COLORS] : 'transparent',
                    backgroundColor: subtags.includes(subtagOption) ? `${SUBTAG_COLORS[subtagOption as keyof typeof SUBTAG_COLORS]}20` : 'transparent',
                  }}
                  onClick={() => toggleSubtag(subtagOption)}
                >
                  <span
                    className="tag-dot"
                    style={{ backgroundColor: SUBTAG_COLORS[subtagOption as keyof typeof SUBTAG_COLORS] }}
                  />
                  {SUBTAG_LABELS[subtagOption as keyof typeof SUBTAG_LABELS]}
                </button>
              ))}
              {customSubtags.map((customTag) => (
                <button
                  key={customTag.id}
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
              ))}
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
                    {tag === 'terminal' ? 'Terminal' : 'Finder'} のウィンドウがありません
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
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
