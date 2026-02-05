import { CardStatusMarker } from '../types';

// 拡張チェックボックスパターン (Minimal theme互換)
export const VALID_MARKERS = ' xX><!?/-+RiBPCQNIpLEArcTt@OWfFH&sDd~';
export const CHECKBOX_EXTRACT = new RegExp(`^- \\[([${VALID_MARKERS.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}])\\]\\s*(.*)`);
export const CHECKBOX_PATTERN = new RegExp(`^- \\[([${VALID_MARKERS.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}])\\]`);

// チェックボックスの状態に応じた表示 (Minimal theme互換)
export const CHECKBOX_DISPLAY: Record<string, { icon: string; className: string; label: string }> = {
  // 基本
  ' ': { icon: '', className: '', label: '未完了' },
  'x': { icon: '✓', className: 'completed', label: '完了' },
  'X': { icon: '✓', className: 'completed', label: '完了' },
  // タスク管理
  '>': { icon: '→', className: 'deferred', label: '先送り' },
  '<': { icon: '←', className: 'scheduled', label: 'スケジュール済み' },
  '-': { icon: '—', className: 'cancelled', label: 'キャンセル' },
  '/': { icon: '◐', className: 'in-progress', label: '進行中' },
  'd': { icon: '◉', className: 'doing', label: '作業中' },
  // 重要度・優先度
  '!': { icon: '❗', className: 'important', label: '重要' },
  '?': { icon: '❓', className: 'question', label: '質問' },
  '+': { icon: '➕', className: 'add', label: '追加' },
  // アイデア・ブレスト
  'i': { icon: '💡', className: 'idea', label: 'アイデア' },
  'B': { icon: '🧠', className: 'brainstorm', label: 'ブレスト' },
  'R': { icon: '🔍', className: 'research', label: 'リサーチ' },
  // 議論・検討
  'P': { icon: '👍', className: 'pro', label: '賛成' },
  'C': { icon: '👎', className: 'con', label: '反対' },
  'Q': { icon: '💬', className: 'quote', label: '引用' },
  'N': { icon: '📝', className: 'note', label: 'メモ' },
  // 情報
  'I': { icon: 'ℹ️', className: 'info', label: '情報' },
  'b': { icon: '🔖', className: 'bookmark', label: 'ブックマーク' },
  'p': { icon: '📄', className: 'paraphrase', label: '要約' },
  'L': { icon: '📍', className: 'location', label: '場所' },
  'E': { icon: '📋', className: 'example', label: '例' },
  'A': { icon: '💡', className: 'answer', label: '回答' },
  // その他
  'r': { icon: '🎁', className: 'reward', label: '報酬' },
  'c': { icon: '🔀', className: 'choice', label: '選択' },
  'T': { icon: '⏰', className: 'time', label: '時間' },
  '@': { icon: '👤', className: 'person', label: '人物' },
  't': { icon: '💭', className: 'talk', label: '会話' },
  'O': { icon: '📊', className: 'outline', label: 'アウトライン' },
  '~': { icon: '⚡', className: 'conflict', label: '課題' },
  'W': { icon: '🌍', className: 'world', label: 'ワールド' },
  'f': { icon: '🔎', className: 'find', label: '発見' },
  'F': { icon: '🎯', className: 'foreshadow', label: '伏線' },
  'H': { icon: '❤️', className: 'favorite', label: 'お気に入り' },
  '&': { icon: '🔣', className: 'symbol', label: 'シンボル' },
  's': { icon: '🤫', className: 'secret', label: '秘密' },
  'D': { icon: '📅', className: 'date', label: '日付' },
};

// よく使うチェックボックスのグループ（右クリックメニュー用）
export const CHECKBOX_GROUPS = [
  { name: '基本', items: [' ', 'x', '/', '-', '>'] },
  { name: '優先度', items: ['!', '?', '+'] },
  { name: 'アイデア', items: ['i', 'B', 'R', 'N'] },
  { name: '議論', items: ['P', 'C', 'Q'] },
  { name: '情報', items: ['I', 'b', 'L', 'E'] },
  { name: 'その他', items: ['T', '@', 'H', 's'] },
];

// カード用のステータスマーカー（簡略版）
export const CARD_STATUS_MARKERS: CardStatusMarker[] = [' ', 'x', '/', '>', '-', '!', '?', 'i', 'd'];
