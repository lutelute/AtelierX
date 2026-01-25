export type TagType = 'terminal' | 'finder';

export type SubTagType = 'research' | 'routine' | 'misc' | string;

export type BoardType = 'terminal' | 'finder';

// アイデアカテゴリ
export type IdeaCategory = 'feature' | 'improvement' | 'bug' | 'other' | string;

// アイデア
export interface Idea {
  id: string;
  title: string;
  description?: string;
  category: IdeaCategory;
  targetBoard?: BoardType;  // 復元先ボード（Terminal/Finder）
  createdAt: number;
  updatedAt?: number;
}

// アイデアカテゴリの色
export const IDEA_CATEGORY_COLORS: Record<string, string> = {
  feature: '#22c55e',     // 緑
  improvement: '#3b82f6', // 青
  bug: '#ef4444',         // 赤
  other: '#6b7280',       // グレー
};

// アイデアカテゴリのラベル
export const IDEA_CATEGORY_LABELS: Record<string, string> = {
  feature: '機能追加',
  improvement: '改善',
  bug: 'バグ修正',
  other: 'その他',
};

// カスタムサブタグ
export interface CustomSubtag {
  id: string;
  name: string;
  color: string;
}

// アプリウィンドウ情報
export interface AppWindow {
  app: 'Terminal' | 'Finder';
  id: string;           // ウィンドウID（Terminalの場合はttyパス）
  name: string;
  path?: string;
  preview?: string;     // ターミナルの実行中プロセス
  windowIndex?: number; // ウィンドウインデックス
  tty?: string;         // ターミナルのttyパス（例: /dev/ttys001）
}

// ウィンドウ履歴（過去にリンクされていたウィンドウ）
export interface WindowHistory {
  id: string;           // 履歴ID
  app: 'Terminal' | 'Finder';
  windowId: string;     // 元のウィンドウID
  windowName: string;   // ウィンドウ名
  cardTitle: string;    // 紐付いていたカードのタイトル
  lastUsed: number;     // 最後に使用された時刻
}

// アクティビティログ
export type ActivityType = 'move' | 'create' | 'delete' | 'complete';

export interface ActivityLog {
  id: string;
  type: ActivityType;
  cardTitle: string;
  cardDescription?: string;
  cardTag: TagType;
  fromColumn?: string;
  toColumn?: string;
  timestamp: number;
}

// Obsidian設定
export interface ObsidianSettings {
  vaultPath: string;
  dailyNotePath: string;
  insertMarker: string;
}

// デフォルトサブタグの設定（編集・削除対応）
export interface DefaultSubtagSettings {
  hidden: string[];  // 非表示（削除）にしたデフォルトサブタグのID
  overrides: Record<string, { name?: string; color?: string }>;  // 名前・色の上書き
}

// アプリ設定
export type CardClickBehavior = 'edit' | 'jump';

export type ThemeType = 'dark' | 'light';

export interface Settings {
  obsidianVaultPath: string;
  dailyNotePath: string;
  insertMarker: string;
  cardClickBehavior: CardClickBehavior;
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  theme?: ThemeType;
}

// ノート情報
export interface NoteInfo {
  name: string;
  filename: string;
  fullPath: string;
  mtime: number;
}

// バックアップデータの型
export interface BackupData {
  boardData: BoardData;
  activityLogs: ActivityLog[];
  settings: Settings;
  backupAt: number;
  version: number;
}

// バックアップ結果の型
export interface BackupResult {
  success: boolean;
  error?: string;
  path?: string;
  timestamp?: number;
}

export interface LoadBackupResult {
  success: boolean;
  error?: string;
  data: BackupData | null;
}

// グリッド配置関連の型
export interface DisplayInfo {
  index: number;
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  asX: number;
  asY: number;
  visibleW: number;
  visibleH: number;
  isMain: boolean;
}

export interface GridOptions {
  cols?: number;
  rows?: number;
  displayIndex?: number;
  padding?: number;
}

export interface GridResult {
  success: boolean;
  error?: string;
  arranged: number;
}

// プラグイン関連の型
export type PluginType = 'grid-layout' | 'export' | 'integration' | 'theme' | 'utility';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  repository?: string;
  type: PluginType;
  main?: string;  // エントリーポイント（デフォルト: main.js）
}

export interface PluginState {
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
  settings: Record<string, unknown>;
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  state: PluginState;
}

export interface PluginResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface PluginGridLayout {
  id: string;
  name: string;
  description?: string;
  cols: number;
  rows: number;
  padding?: number;
  pluginId: string;  // どのプラグインから来たか
}

// プラグインエクスポートフォーマット（レンダラーに送信されるメタデータ）
// 注意: 関数はIPC経由でシリアライズできないため、レンダラーにはメタデータのみを送信
export interface PluginExportFormatInfo {
  id: string;           // 例: "notion-daily-report:notion"
  name: string;         // 例: "Notion"
  description?: string; // 例: "Export to Notion database"
  pluginId: string;     // どのプラグインから来たか
}

// メインプロセスに保存される完全なフォーマット（generate関数を含む）
// 注意: generate関数はメインプロセスに保持され、レンダラーはIPC経由で呼び出す
export interface PluginExportFormat extends PluginExportFormatInfo {
  generate: (logs: ActivityLog[], boardData: BoardData) => string;
}

// プラグインカードアクション（レンダラーに送信されるメタデータ）
export type CardActionPosition = 'task' | 'card-header' | 'card-footer';

export interface PluginCardActionInfo {
  id: string;           // 例: "timer:start"
  label: string;        // ボタンラベル（短いテキストまたは絵文字）
  title?: string;       // ツールチップ
  position: CardActionPosition;  // 表示位置
  pluginId: string;     // どのプラグインから来たか
}

// アップデート関連の型
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'installed' | 'latest' | 'error';

export interface UpdateCheckResult {
  success: boolean;
  available: boolean;
  version?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  releaseName?: string;
  releaseBody?: string;
  error?: string;
}

export interface UpdateDownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface UpdateProgress {
  percent: number;
  downloadedMB: string;
  totalMB: string;
}

export interface UpdateInstallResult {
  success: boolean;
  error?: string;
  needsRestart?: boolean;
}

export interface UpdateCleanupResult {
  success: boolean;
  deleted: number;
  error?: string;
}

// Electron API の型定義
declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      getAppWindows: () => Promise<AppWindow[]>;
      activateWindow: (app: string, windowId: string, windowName?: string) => Promise<boolean>;
      openNewTerminal: (initialPath?: string) => Promise<{ success: boolean; windowName?: string; error?: string }>;
      openNewFinder: (targetPath?: string) => Promise<{ success: boolean; windowName?: string; path?: string; error?: string }>;
      exportLog: (content: string, filename: string) => Promise<boolean>;
      selectFolder: () => Promise<string | null>;
      selectFile: () => Promise<string | null>;
      insertToDailyNote: (content: string, settings: ObsidianSettings) => Promise<boolean>;
      listDailyNotes: (folderPath: string, limit?: number) => Promise<{ success: boolean; error?: string; notes: NoteInfo[] }>;
      insertToNote: (content: string, notePath: string, insertMarker: string) => Promise<{ success: boolean; error?: string; created?: boolean }>;
      // バックアップ関連
      saveBackup: (data: Omit<BackupData, 'backupAt' | 'version'>) => Promise<BackupResult>;
      loadBackup: () => Promise<LoadBackupResult>;
      exportBackup: (data: Omit<BackupData, 'backupAt' | 'version'>) => Promise<BackupResult>;
      importBackup: () => Promise<LoadBackupResult>;
      getBackupPath: () => Promise<string>;
      // グリッド配置関連
      getDisplays: () => Promise<DisplayInfo[]>;
      arrangeTerminalGrid: (options?: GridOptions) => Promise<GridResult>;
      arrangeFinderGrid: (options?: GridOptions) => Promise<GridResult>;
      // プラグイン関連
      plugins: {
        list: () => Promise<{ success: boolean; data: InstalledPlugin[] }>;
        install: (repoPath: string) => Promise<PluginResult>;
        enable: (pluginId: string) => Promise<PluginResult>;
        disable: (pluginId: string) => Promise<PluginResult>;
        uninstall: (pluginId: string) => Promise<PluginResult>;
        getSettings: (pluginId: string) => Promise<{ success: boolean; data: Record<string, unknown> }>;
        saveSettings: (pluginId: string, settings: Record<string, unknown>) => Promise<PluginResult>;
        getGridLayouts: () => Promise<{ success: boolean; data: PluginGridLayout[] }>;
        getExportFormats: () => Promise<{ success: boolean; data: PluginExportFormatInfo[] }>;
        executeExportFormat: (formatId: string, context: { logs: ActivityLog[]; boardData: BoardData }) => Promise<{ success: boolean; data?: string; error?: string }>;
        getCardActions: () => Promise<PluginCardActionInfo[]>;
        executeCardAction: (actionId: string, cardId: string, cardData: Card, taskIndex?: number) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        checkUpdate: (pluginId: string) => Promise<{ hasUpdate: boolean; currentVersion?: string; latestVersion?: string; error?: string }>;
        update: (pluginId: string) => Promise<{ success: boolean; newVersion?: string; error?: string }>;
      };
      // アップデート関連
      update: {
        check: () => Promise<UpdateCheckResult>;
        download: (downloadUrl: string) => Promise<UpdateDownloadResult>;
        install: () => Promise<UpdateInstallResult>;
        cleanup: () => Promise<UpdateCleanupResult>;
        restart: () => Promise<void>;
        onProgress: (callback: (data: UpdateProgress) => void) => () => void;
      };
    };
  }
}

// 時間記録
export interface TimeRecord {
  id: string;
  taskIndex?: number;    // タスク番号（undefined = カード全体）
  startedAt: number;
  endedAt?: number;
  durationMs?: number;   // 計算済みの所要時間
}

// カードステータスマーカー（Minimal theme互換）
export type CardStatusMarker = ' ' | 'x' | '>' | '<' | '-' | '/' | '!' | '?' | 'i' | 'd';

export interface Card {
  id: string;
  title: string;
  description?: string;  // タスクの詳細説明
  comment?: string;      // 完了時のコメント
  tag: TagType;
  subtag?: SubTagType;   // 旧形式（後方互換性用）
  subtags?: SubTagType[]; // サブタグ（複数選択可能）
  statusMarker?: CardStatusMarker;  // カード自体のステータスマーカー
  createdAt: number;
  completedAt?: number;  // 完了時刻
  archived?: boolean;    // アーカイブ済みフラグ
  archivedAt?: number;   // アーカイブ時刻
  // ウィンドウ情報（ジャンプ用）
  windowApp?: 'Terminal' | 'Finder';
  windowId?: string;     // ウィンドウID（一意識別用）
  windowName?: string;
  // 時間記録
  timeRecords?: TimeRecord[];
  activeTimerId?: string; // 現在実行中のタイマーID
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export interface BoardData {
  columns: Column[];
  cards: Record<string, Card>;
  columnOrder: string[];
  ideas?: Idea[];  // アイデアバックログ
}

export const TAG_COLORS: Record<TagType, string> = {
  terminal: '#22c55e',
  finder: '#3b82f6',
};

export const TAG_LABELS: Record<TagType, string> = {
  terminal: 'Terminal',
  finder: 'Finder',
};

export const SUBTAG_COLORS: Record<SubTagType, string> = {
  research: '#8b5cf6',  // 紫
  routine: '#f59e0b',   // オレンジ
  misc: '#6b7280',      // グレー
};

export const SUBTAG_LABELS: Record<SubTagType, string> = {
  research: '研究',
  routine: '雑務',
  misc: 'その他',
};
