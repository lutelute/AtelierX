import { useState } from 'react';
import { IdeaCategory, BoardType } from '../types';

interface AddIdeaModalProps {
  onClose: () => void;
  onAdd: (title: string, description: string, category: IdeaCategory, targetBoard?: BoardType) => void;
}

export function AddIdeaModal({ onClose, onAdd }: AddIdeaModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('feature');
  const [targetBoard, setTargetBoard] = useState<BoardType>('terminal');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(title, description, category, targetBoard);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>新しいアイデア</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-content">
          <div className="form-group">
            <label>タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="アイデアのタイトル"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="アイデアの詳細"
            />
          </div>
          <div className="form-group">
            <label>カテゴリ</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory)}>
              <option value="feature">機能</option>
              <option value="improvement">改善</option>
              <option value="bug">バグ</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="form-group">
            <label>対象ボード</label>
            <select value={targetBoard} onChange={(e) => setTargetBoard(e.target.value as BoardType)}>
              <option value="terminal">Terminal</option>
              <option value="finder">Finder</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={!title.trim()}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
