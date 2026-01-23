import { useState } from 'react';
import { TagType, SubTagType, TAG_LABELS, TAG_COLORS, SUBTAG_LABELS, SUBTAG_COLORS, CustomSubtag } from '../types';

// プリセットカラー
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6b7280',
];

interface AddCardModalProps {
  onClose: () => void;
  onAdd: (title: string, description: string, tag: TagType, subtag?: SubTagType) => void;
  onAddWithNewTerminal?: (title: string, description: string, subtag?: SubTagType) => void;
  customSubtags?: CustomSubtag[];
  onAddSubtag?: (subtag: CustomSubtag) => void;
}

export function AddCardModal({ onClose, onAdd, onAddWithNewTerminal, customSubtags = [], onAddSubtag }: AddCardModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState<TagType>('terminal');
  const [subtag, setSubtag] = useState<SubTagType | undefined>(undefined);
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
    setSubtag(newSubtag.id);
    setNewSubtagName('');
    setNewSubtagColor(PRESET_COLORS[0]);
    setShowAddSubtag(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim(), description.trim(), tag, subtag);
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
              rows={3}
            />
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
            <label>サブタグ（任意）</label>
            <div className="tag-selector">
              <button
                type="button"
                className={`tag-option ${subtag === undefined ? 'selected' : ''}`}
                style={{
                  borderColor: subtag === undefined ? '#888' : 'transparent',
                  backgroundColor: subtag === undefined ? '#88888820' : 'transparent',
                }}
                onClick={() => setSubtag(undefined)}
              >
                なし
              </button>
              {(Object.keys(SUBTAG_LABELS) as SubTagType[]).map((subtagOption) => (
                <button
                  key={subtagOption}
                  type="button"
                  className={`tag-option ${subtag === subtagOption ? 'selected' : ''}`}
                  style={{
                    borderColor: subtag === subtagOption ? SUBTAG_COLORS[subtagOption as keyof typeof SUBTAG_COLORS] : 'transparent',
                    backgroundColor: subtag === subtagOption ? `${SUBTAG_COLORS[subtagOption as keyof typeof SUBTAG_COLORS]}20` : 'transparent',
                  }}
                  onClick={() => setSubtag(subtagOption)}
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
                  className={`tag-option ${subtag === customTag.id ? 'selected' : ''}`}
                  style={{
                    borderColor: subtag === customTag.id ? customTag.color : 'transparent',
                    backgroundColor: subtag === customTag.id ? `${customTag.color}20` : 'transparent',
                  }}
                  onClick={() => setSubtag(customTag.id)}
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
                      await onAddWithNewTerminal(title.trim(), description.trim(), subtag);
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
