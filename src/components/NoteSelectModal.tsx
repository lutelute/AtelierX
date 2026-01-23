import { useState, useEffect } from 'react';
import { NoteInfo } from '../types';

interface NoteSelectModalProps {
  vaultPath: string;
  dailyNotePath: string; // フォルダパス（{{date}}.md を除いた部分）
  insertMarker: string;
  content: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function NoteSelectModal({
  vaultPath,
  dailyNotePath,
  insertMarker,
  content,
  onClose,
  onSuccess,
}: NoteSelectModalProps) {
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inserting, setInserting] = useState<string | null>(null);

  // デイリーノートフォルダのパスを計算
  const getDailyNoteFolderPath = () => {
    // dailyNotePath: "Daily Notes/{{date}}.md" → "Daily Notes"
    const folderPart = dailyNotePath.replace(/\/?\{\{date\}\}\.md$/, '');
    return folderPart ? `${vaultPath}/${folderPart}` : vaultPath;
  };

  useEffect(() => {
    const loadNotes = async () => {
      if (!window.electronAPI?.listDailyNotes) {
        setError('Electron API が利用できません');
        setLoading(false);
        return;
      }

      const folderPath = getDailyNoteFolderPath();
      console.log('Loading notes from:', folderPath);

      const result = await window.electronAPI.listDailyNotes(folderPath);
      console.log('listDailyNotes result:', result);

      if (result.success) {
        setNotes(result.notes);
      } else {
        setError(result.error || 'ノートの読み込みに失敗しました');
      }
      setLoading(false);
    };

    loadNotes();
  }, [vaultPath, dailyNotePath]);

  const handleInsert = async (note: NoteInfo) => {
    if (!window.electronAPI?.insertToNote) return;

    setInserting(note.fullPath);
    console.log('Inserting to:', note.fullPath);

    const result = await window.electronAPI.insertToNote(content, note.fullPath, insertMarker);
    console.log('insertToNote result:', result);

    if (result.success) {
      onSuccess();
      onClose();
    } else {
      alert(`エラー: ${result.error}`);
    }
    setInserting(null);
  };

  const handleCreateToday = async () => {
    if (!window.electronAPI?.insertToNote) return;

    // 今日の日付でファイルパスを生成
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const notePath = dailyNotePath.replace('{{date}}', dateStr);
    const fullPath = `${vaultPath}/${notePath}`;

    setInserting(fullPath);
    console.log('Creating today note:', fullPath);

    const result = await window.electronAPI.insertToNote(content, fullPath, insertMarker);
    console.log('insertToNote result:', result);

    if (result.success) {
      onSuccess();
      onClose();
    } else {
      alert(`エラー: ${result.error}`);
    }
    setInserting(null);
  };

  const formatDate = (mtime: number) => {
    return new Date(mtime).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal note-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>差し込み先を選択</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="note-select-content">
          {/* 今日のノートを作成/追記ボタン */}
          <button
            className="btn-create-today"
            onClick={handleCreateToday}
            disabled={inserting !== null}
          >
            {inserting ? '処理中...' : '今日のデイリーノートに追記'}
          </button>

          <div className="note-select-divider">
            <span>または既存のノートを選択</span>
          </div>

          {loading && <div className="note-select-loading">読み込み中...</div>}

          {error && <div className="note-select-error">{error}</div>}

          {!loading && !error && notes.length === 0 && (
            <div className="note-select-empty">ノートが見つかりません</div>
          )}

          {!loading && !error && notes.length > 0 && (
            <div className="note-list">
              {notes.map((note) => (
                <button
                  key={note.fullPath}
                  className="note-item"
                  onClick={() => handleInsert(note)}
                  disabled={inserting !== null}
                >
                  <span className="note-name">{note.name}</span>
                  <span className="note-date">{formatDate(note.mtime)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
