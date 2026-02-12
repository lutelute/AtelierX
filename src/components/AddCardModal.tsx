import { useState } from 'react';
import { TagType, SubTagType, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag, DefaultSubtagSettings, AppTabConfig, BUILTIN_APPS } from '../types';

// プリセットカラー
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6b7280',
];

interface AddCardModalProps {
  onClose: () => void;
  onAdd: (title: string, description: string, tag: TagType, subtags?: SubTagType[]) => void;
  onAddWithNewTerminal?: (title: string, description: string, subtags?: SubTagType[]) => void;
  customSubtags?: CustomSubtag[];
  onAddSubtag?: (subtag: CustomSubtag) => void;
  defaultSubtagSettings?: DefaultSubtagSettings;
  enabledTabs?: AppTabConfig[];
  activeBoard?: string;
}

export function AddCardModal({ onClose, onAdd, onAddWithNewTerminal, customSubtags = [], onAddSubtag, defaultSubtagSettings, enabledTabs, activeBoard }: AddCardModalProps) {
  const tabs = enabledTabs && enabledTabs.length > 0 ? enabledTabs : BUILTIN_APPS;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState<TagType>(activeBoard && activeBoard !== 'ideas' ? activeBoard : tabs[0].id);
  const [subtags, setSubtags] = useState<SubTagType[]>([]);
  const [showAddSubtag, setShowAddSubtag] = useState(false);
  const [newSubtagName, setNewSubtagName] = useState('');
  const [newSubtagColor, setNewSubtagColor] = useState(PRESET_COLORS[0]);
  const [openingTerminal, setOpeningTerminal] = useState(false);

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
      onAdd(title.trim(), description.trim(), tag, subtags.length > 0 ? subtags : undefined);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>新しいカードを追加</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">タイトル</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タスク名を入力"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">説明（任意）</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細を入力"
              rows={5}
            />
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
                return (
                  <button
                    key={subtagOption}
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
                );
              })}
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
                    if (e.nativeEvent.isComposing) return;
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
                  <label className="color-custom-input" title="カスタム色">
                    <input type="color" value={newSubtagColor} onChange={(e) => setNewSubtagColor(e.target.value)} />
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.5 2.5l1 1-7.5 7.5-2.5.5.5-2.5 7.5-7.5z" /></svg>
                  </label>
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
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            {tag === 'terminal' && onAddWithNewTerminal && (
              <button
                type="button"
                className="btn-terminal-new"
                disabled={!title.trim() || openingTerminal}
                onClick={async () => {
                  if (title.trim()) {
                    setOpeningTerminal(true);
                    try {
                      await onAddWithNewTerminal(title.trim(), description.trim(), subtags.length > 0 ? subtags : undefined);
                      onClose();
                    } finally {
                      setOpeningTerminal(false);
                    }
                  }
                }}
              >
                {openingTerminal ? '開いています...' : '+ 新しい Terminal で開始'}
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
