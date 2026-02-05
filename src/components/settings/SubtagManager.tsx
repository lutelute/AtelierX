import { useState } from 'react';
import { Settings, CustomSubtag, DefaultSubtagSettings, SUBTAG_LABELS, SUBTAG_COLORS, SubTagType } from '../../types';
import { PRESET_COLORS } from '../../utils/constants';

interface SubtagManagerProps {
  settings: Settings;
  onSettingsChange: (updater: (prev: Settings) => Settings) => void;
}

export function SubtagManager({ settings, onSettingsChange }: SubtagManagerProps) {
  const [newSubtagName, setNewSubtagName] = useState('');
  const [newSubtagColor, setNewSubtagColor] = useState(PRESET_COLORS[0]);
  const [editingSubtagId, setEditingSubtagId] = useState<string | null>(null);
  const [editingDefaultSubtagId, setEditingDefaultSubtagId] = useState<string | null>(null);

  const getDefaultSubtagSettings = (): DefaultSubtagSettings => {
    return settings.defaultSubtagSettings || { hidden: [], overrides: {} };
  };

  const handleAddSubtag = () => {
    if (!newSubtagName.trim()) return;
    const newSubtag: CustomSubtag = {
      id: `subtag-${Date.now()}`,
      name: newSubtagName.trim(),
      color: newSubtagColor,
    };
    onSettingsChange((prev) => ({
      ...prev,
      customSubtags: [...(prev.customSubtags || []), newSubtag],
    }));
    setNewSubtagName('');
    setNewSubtagColor(PRESET_COLORS[0]);
  };

  const handleDeleteSubtag = (id: string) => {
    onSettingsChange((prev) => ({
      ...prev,
      customSubtags: (prev.customSubtags || []).filter((st) => st.id !== id),
    }));
  };

  const handleUpdateSubtag = (id: string, updates: Partial<CustomSubtag>) => {
    onSettingsChange((prev) => ({
      ...prev,
      customSubtags: (prev.customSubtags || []).map((st) =>
        st.id === id ? { ...st, ...updates } : st
      ),
    }));
  };

  const handleHideDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    onSettingsChange((prev) => ({
      ...prev,
      defaultSubtagSettings: { ...current, hidden: [...current.hidden, id] },
    }));
  };

  const handleShowDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    onSettingsChange((prev) => ({
      ...prev,
      defaultSubtagSettings: { ...current, hidden: current.hidden.filter((h) => h !== id) },
    }));
  };

  const handleUpdateDefaultSubtag = (id: string, updates: { name?: string; color?: string }) => {
    const current = getDefaultSubtagSettings();
    onSettingsChange((prev) => ({
      ...prev,
      defaultSubtagSettings: {
        ...current,
        overrides: { ...current.overrides, [id]: { ...current.overrides[id], ...updates } },
      },
    }));
  };

  const handleResetDefaultSubtag = (id: string) => {
    const current = getDefaultSubtagSettings();
    const newOverrides = { ...current.overrides };
    delete newOverrides[id];
    onSettingsChange((prev) => ({
      ...prev,
      defaultSubtagSettings: { ...current, overrides: newOverrides },
    }));
  };

  const defaultSubtags: { id: SubTagType; name: string; color: string; originalName: string; originalColor: string }[] = [
    { id: 'research', name: SUBTAG_LABELS.research, color: SUBTAG_COLORS.research, originalName: SUBTAG_LABELS.research, originalColor: SUBTAG_COLORS.research },
    { id: 'routine', name: SUBTAG_LABELS.routine, color: SUBTAG_COLORS.routine, originalName: SUBTAG_LABELS.routine, originalColor: SUBTAG_COLORS.routine },
    { id: 'misc', name: SUBTAG_LABELS.misc, color: SUBTAG_COLORS.misc, originalName: SUBTAG_LABELS.misc, originalColor: SUBTAG_COLORS.misc },
  ].map((st) => {
    const override = getDefaultSubtagSettings().overrides[st.id];
    return { ...st, name: override?.name || st.name, color: override?.color || st.color };
  });

  const hiddenDefaultSubtags = defaultSubtags.filter((st) => getDefaultSubtagSettings().hidden.includes(st.id));
  const visibleDefaultSubtags = defaultSubtags.filter((st) => !getDefaultSubtagSettings().hidden.includes(st.id));

  return (
    <div className="settings-section">
      <h3>サブタグ管理</h3>

      <div className="form-group">
        <label>デフォルトタグ</label>
        <div className="subtag-list">
          {visibleDefaultSubtags.map((st) => (
            <div key={st.id} className="subtag-item">
              {editingDefaultSubtagId === st.id ? (
                <>
                  <input type="text" className="subtag-edit-name" value={st.name} onChange={(e) => handleUpdateDefaultSubtag(st.id, { name: e.target.value })} autoFocus />
                  <div className="color-picker-inline">
                    {PRESET_COLORS.map((color) => (
                      <button key={color} type="button" className={`color-option ${st.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => handleUpdateDefaultSubtag(st.id, { color })} />
                    ))}
                  </div>
                  <button type="button" className="subtag-action-btn done" onClick={() => setEditingDefaultSubtagId(null)}>完了</button>
                  {(st.name !== st.originalName || st.color !== st.originalColor) && (
                    <button type="button" className="subtag-action-btn reset" onClick={() => handleResetDefaultSubtag(st.id)} title="元に戻す">リセット</button>
                  )}
                </>
              ) : (
                <>
                  <span className="subtag-color" style={{ backgroundColor: st.color }} />
                  <span className="subtag-name">{st.name}</span>
                  {(st.name !== st.originalName || st.color !== st.originalColor) && <span className="subtag-modified">(変更済み)</span>}
                  <button type="button" className="subtag-action-btn edit" onClick={() => setEditingDefaultSubtagId(st.id)}>編集</button>
                  <button type="button" className="subtag-action-btn delete" onClick={() => handleHideDefaultSubtag(st.id)}>非表示</button>
                </>
              )}
            </div>
          ))}
        </div>
        {hiddenDefaultSubtags.length > 0 && (
          <div className="hidden-subtags">
            <label>非表示のデフォルトタグ</label>
            <div className="subtag-list">
              {hiddenDefaultSubtags.map((st) => (
                <div key={st.id} className="subtag-item hidden">
                  <span className="subtag-color" style={{ backgroundColor: st.color, opacity: 0.5 }} />
                  <span className="subtag-name" style={{ opacity: 0.5 }}>{st.name}</span>
                  <button type="button" className="subtag-action-btn restore" onClick={() => handleShowDefaultSubtag(st.id)}>再表示</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>カスタムタグ</label>
        <div className="subtag-list">
          {(settings.customSubtags || []).map((st) => (
            <div key={st.id} className="subtag-item">
              {editingSubtagId === st.id ? (
                <>
                  <input type="text" className="subtag-edit-name" value={st.name} onChange={(e) => handleUpdateSubtag(st.id, { name: e.target.value })} autoFocus />
                  <div className="color-picker-inline">
                    {PRESET_COLORS.map((color) => (
                      <button key={color} type="button" className={`color-option ${st.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => handleUpdateSubtag(st.id, { color })} />
                    ))}
                  </div>
                  <button type="button" className="subtag-action-btn done" onClick={() => setEditingSubtagId(null)}>完了</button>
                </>
              ) : (
                <>
                  <span className="subtag-color" style={{ backgroundColor: st.color }} />
                  <span className="subtag-name">{st.name}</span>
                  <button type="button" className="subtag-action-btn edit" onClick={() => setEditingSubtagId(st.id)}>編集</button>
                  <button type="button" className="subtag-action-btn delete" onClick={() => handleDeleteSubtag(st.id)}>削除</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>新しいタグを追加</label>
        <div className="add-subtag-form">
          <input type="text" placeholder="タグ名" value={newSubtagName} onChange={(e) => setNewSubtagName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtag(); } }} />
          <div className="color-picker-inline">
            {PRESET_COLORS.map((color) => (
              <button key={color} type="button" className={`color-option ${newSubtagColor === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setNewSubtagColor(color)} />
            ))}
          </div>
          <button type="button" className="btn-add-subtag" onClick={handleAddSubtag} disabled={!newSubtagName.trim()}>追加</button>
        </div>
      </div>
    </div>
  );
}
