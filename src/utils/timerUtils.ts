// 時間をフォーマット (◯分 or ◯時間◯分)
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}時間${remainingMinutes}分`;
  }
  return `${minutes}分`;
}

// 日付時刻フォーマット (YYYY-MM-DD HH:MM)
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// タイマー行から開始時刻を解析
export function parseTimerStartTime(timerLine: string): number | null {
  // パターン: "  ⏱ 2026-01-26 12:34開始"
  const match = timerLine.match(/⏱\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})開始/);
  if (match) {
    const [, dateStr, hours, minutes] = match;
    const date = new Date(`${dateStr}T${hours}:${minutes}:00`);
    return date.getTime();
  }
  return null;
}
