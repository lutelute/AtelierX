# AtelierX 開発ガイド

> このドキュメントは人間・AIが共同で参照・編集しながら開発を進めるための技術資料です。
> コード修正時は関連セクションも必ず更新してください。

---

## アーキテクチャ概要

```
┌──────────────────────┐     IPC      ┌────────────────────────────────┐
│  React (renderer)     │ ◄──────────► │  Electron main process          │
│                        │             │                                │
│  Board.tsx (メインUI)  │  ipcMain    │  main.cjs (IPC handler 50+)    │
│  hooks/ (ロジック)      │  .handle()  │  platforms/index.cjs (router)  │
│  utils/ (ユーティリティ) │             │    ├── darwin/ (macOS)         │
│  types/index.ts (型)   │             │    ├── win32/ (Windows)         │
│  styles/App.css        │             │    └── linux/ (Linux)           │
│                        │             │  pluginManager.cjs              │
│  preload.cjs           │             │  pluginAPI.cjs                  │
│  (contextBridge)       │             │                                │
└──────────────────────┘             └────────────────────────────────┘
```

### プラットフォーム抽象化

`electron/platforms/index.cjs` が `process.platform` で darwin/win32/linux を判定し、各プラットフォームの5モジュールをフラット namespace で re-export する。

| モジュール | 役割 |
|-----------|------|
| `windowManager.cjs` | ウィンドウ検出・アクティベーション・閉じる・色設定 |
| `gridManager.cjs` | Grid配置アルゴリズム |
| `appScanner.cjs` | インストール済みアプリ検出・アイコン抽出 |
| `updateManager.cjs` | GitHub API経由のアップデート確認・インストール |
| `mainConfig.cjs` | ウィンドウ外観・起動時設定 |

---

## ファイル構成（全体）

```
electron/
  main.cjs               # IPC ハンドラ登録（50+チャネル）
  preload.cjs            # contextBridge API公開
  pluginManager.cjs      # プラグインライフサイクル管理
  pluginAPI.cjs          # プラグインAPI・レジストリ
  platforms/
    index.cjs            # process.platform 判定 → 各プラットフォーム振り分け
    darwin/
      windowManager.cjs  # AppleScript (Terminal/Finder + System Events)
      gridManager.cjs    # AppleScript + NSScreen
      appScanner.cjs     # /Applications + sips
      updateManager.cjs  # GitHub API + hdiutil
      mainConfig.cjs     # hiddenInset, App Nap対策
    win32/
      windowManager.cjs  # PowerShell + user32.dll
      gridManager.cjs    # PowerShell + SetWindowPos
      appScanner.cjs     # レジストリ + スタートメニュー
      updateManager.cjs  # GitHub API + NSIS起動
      mainConfig.cjs     # no-op
    linux/
      windowManager.cjs  # wmctrl + xdotool (X11)
      gridManager.cjs    # wmctrl -e
      appScanner.cjs     # .desktop ファイルスキャン
      updateManager.cjs  # GitHub API + AppImage/deb
      mainConfig.cjs     # no-op

src/
  components/
    Board.tsx            # メインボード（タブ管理、DnD、カラーメニュー、ガラス制御）
    Column.tsx           # カラムコンポーネント
    Card.tsx             # カードコンポーネント（パルスアニメーション、タイマー表示）
    EditCardModal.tsx    # カード編集モーダル（ウィンドウ管理、色設定、ガラス）
    AddCardModal.tsx     # カード作成モーダル
    WindowSelectModal.tsx # ウィンドウ選択モーダル
    RelinkWindowModal.tsx # ウィンドウ再リンクモーダル
    GridArrangeModal.tsx  # Grid配置モーダル
    MultiGridModal.tsx    # マルチアプリGrid配置モーダル
    ExportModal.tsx       # エクスポートモーダル
    SettingsModal.tsx     # 設定モーダル
    HelpModal.tsx         # ヘルプモーダル（4タブ）
    IdeasPanel.tsx        # アイデアパネル
    AddIdeaModal.tsx      # アイデア追加モーダル
    ArchiveSection.tsx    # アーカイブセクション
    NoteSelectModal.tsx   # Obsidianノート選択モーダル
    TabAddPopover.tsx     # タブ追加ポップオーバー
    UpdateBanner.tsx      # アップデート通知バナー
    ReminderNotification.tsx # ウィンドウ検出通知
    ErrorBoundary.tsx     # エラーバウンダリ
    ErrorFallback.tsx     # エラー表示
    settings/
      BasicSettings.tsx   # 基本設定
      AppTabsManager.tsx  # アプリタブ管理
      SubtagManager.tsx   # サブタグ管理
      ObsidianIntegration.tsx # Obsidian連携設定
      BackupSection.tsx   # バックアップ管理
      PluginManager.tsx   # プラグイン管理
      VersionChecker.tsx  # バージョン確認

  hooks/
    useCardOperations.ts  # カードCRUD（30+関数）
    useWindowStatus.ts    # ウィンドウ監視・マッチング
    useDataPersistence.ts # バックアップ・Undo（MAX_UNDO=30）
    useTimerActions.ts    # タイマー開始/停止/キャンセル
    useExport.ts          # エクスポート・Grid配置制御
    useTabManagement.ts   # タブ追加/削除・スクロール状態
    useKeyboardShortcuts.ts # キーボードショートカット
    useLocalStorage.ts    # localStorage永続化

  utils/
    terminalColor.ts      # 色変換・プリセット・グラデーション
    boardUtils.ts         # ボード作成・マイグレーション
    checkboxConstants.ts  # チェックボックスマーカー（36種）
    timerUtils.ts         # タイマーフォーマット関数
    constants.ts          # 定数

  types/
    index.ts             # 全TypeScript型定義 + ヘルパー関数

  styles/
    App.css              # グローバルスタイル

docs/
  USER_GUIDE.md          # ユーザー向けガイド
  DEV_GUIDE.md           # 開発者・AI向けガイド（本ファイル）
  GLASS_EFFECT_USER_GUIDE.md  # ガラス効果ユーザーガイド
  GLASS_EFFECT_DEV_GUIDE.md   # ガラス効果開発ガイド
```

---

## 型定義（types/index.ts）

### コアデータ型

```typescript
// カード
interface Card {
  id: string;
  title: string;
  description?: string;       // チェックリスト形式のタスク記述
  comment?: string;            // 完了時コメント
  tag: TagType;                // タブID ('terminal', 'finder', etc.)
  subtag?: SubTagType;         // 旧形式（後方互換）
  subtags?: SubTagType[];      // 複数サブタグ
  statusMarker?: CardStatusMarker;  // ' '|'x'|'>'|'<'|'-'|'/'|'!'|'?'|'i'|'d'
  createdAt: number;
  completedAt?: number;
  archived?: boolean;
  archivedAt?: number;
  windowApp?: string;          // 旧形式（後方互換）
  windowId?: string;           // 旧形式
  windowName?: string;         // 旧形式
  windowPath?: string;         // 旧形式
  windows?: WindowRef[];       // 複数ウィンドウ対応
  priority?: Priority;
  timeRecords?: TimeRecord[];
  activeTimerId?: string;      // 実行中タイマーID
}

// ウィンドウ参照（複数ウィンドウ対応）
interface WindowRef {
  app: string;     // "Terminal", "Finder", "Obsidian" etc.
  id: string;      // ウィンドウID
  name: string;    // ウィンドウ名
  path?: string;   // Finderフォルダパス
}

// カラム
interface Column {
  id: string;
  title: string;
  cardIds: string[];
  color?: string;   // テーマカラー（hex）
}

// ボードデータ（タブ単位）
interface BoardData {
  columns: Column[];
  cards: Record<string, Card>;
  columnOrder: string[];
  ideas?: Idea[];   // 後方互換用
}

// 全ボードデータ
interface AllBoardsData {
  boards: Record<string, BoardData>;  // タブIDごと
  ideas?: Idea[];                      // 全タブ共通
}
```

### ヘルパー関数

```typescript
getCardWindows(card: Card): WindowRef[]   // 旧形式/新形式両対応でWindowRef[]を返す
hasWindows(card: Card): boolean           // ウィンドウ紐づけ有無
getPrimaryWindow(card: Card): WindowRef?  // 最初のウィンドウ（後方互換用）
getTagColor(tag, enabledTabs?): string    // タブ色を動的取得
getTagLabel(tag, enabledTabs?): string    // タブラベルを動的取得
getAppNameForTab(tabId, tabs?): string?   // タブID → アプリ名
getTabIdForApp(appName, tabs?): string?   // アプリ名 → タブID
```

---

## IPC API リファレンス

### ウィンドウ管理

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `get-app-windows` | `appNames?: string[]` | `AppWindow[]` | ウィンドウ一覧取得 |
| `activate-window` | `app, windowId, windowName?, animation?, windowIndex?` | `boolean` | ウィンドウ前面化 |
| `open-new-terminal` | `initialPath?` | `{success, windowName?}` | 新規Terminal作成 |
| `open-new-finder` | `targetPath?` | `{success, windowName?, path?}` | 新規Finder作成 |
| `open-new-generic-window` | `appName` | `{success, windowName?}` | 新規アプリウィンドウ作成 |
| `close-window` | `appName, windowId, windowName?` | `{success}` | ウィンドウ閉じる |

### ターミナル色設定（macOS限定）

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `set-terminal-color` | `windowId, {bgColor?, textColor?}` | `boolean` | 背景色/テキスト色設定 |
| `set-terminal-glass` | `windowId, enable, color?` | `boolean` | ガラスON/OFF |
| `set-terminal-glass-batch` | `windowIds[], enable, color?` | `boolean` | 一括ガラスON/OFF |
| `clear-terminal-glass-state` | `windowIds[]` | `boolean` | ガラスキャッシュクリア |

> ガラス効果の詳細は **[ガラス効果開発ガイド](GLASS_EFFECT_DEV_GUIDE.md)** を参照

### Grid配置

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `get-displays` | — | `DisplayInfo[]` | ディスプレイ情報取得 |
| `arrange-terminal-grid` | `GridOptions?` | `GridResult` | Terminal Grid配置 |
| `arrange-finder-grid` | `GridOptions?` | `GridResult` | Finder Grid配置 |
| `arrange-generic-grid` | `appName, GridOptions?` | `GridResult` | 任意アプリ Grid配置 |
| `arrange-multi-app-grid` | `MultiGridArrangeOptions` | `MultiGridResult` | マルチアプリ Grid配置 |

### バックアップ

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `save-backup` | `data` | `BackupResult` | 自動バックアップ保存 |
| `load-backup` | — | `LoadBackupResult` | バックアップ読み込み |
| `export-backup` | `data` | `BackupResult` | 手動エクスポート |
| `import-backup` | — | `LoadBackupResult` | 手動インポート |
| `export-settings-preset` | `SettingsPreset` | `BackupResult` | 設定プリセットエクスポート |
| `import-settings-preset` | — | `{success, data}` | 設定プリセットインポート |
| `export-card-backup` | `CardBackup` | `BackupResult` | カードバックアップエクスポート |
| `import-card-backup` | — | `{success, data}` | カードバックアップインポート |

### ファイル操作

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `export-log` | `content, filename` | `boolean` | ファイル保存ダイアログ |
| `select-folder` | — | `string?` | フォルダ選択ダイアログ |
| `select-file` | — | `string?` | ファイル選択ダイアログ |
| `insert-to-daily-note` | `content, ObsidianSettings` | `boolean` | Obsidian デイリーノート挿入 |
| `list-daily-notes` | `folderPath, limit?` | `{success, notes[]}` | デイリーノート一覧 |
| `insert-to-note` | `content, notePath, marker?` | `{success, created?}` | 任意ノート挿入 |

### プラグイン

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `plugins:list` | — | `{data: InstalledPlugin[]}` | プラグイン一覧 |
| `plugins:install` | `repoPath` | `{data: {pluginId, manifest}}` | GitHub からインストール |
| `plugins:enable` | `pluginId` | `{success}` | 有効化 |
| `plugins:disable` | `pluginId` | `{success}` | 無効化 |
| `plugins:uninstall` | `pluginId` | `{success}` | アンインストール |
| `plugins:check-update` | `pluginId` | `{hasUpdate, versions}` | 更新チェック |
| `plugins:update` | `pluginId` | `{success, newVersion}` | 更新実行 |
| `plugins:get-layouts` | — | `{data: PluginGridLayout[]}` | Grid レイアウト取得 |
| `plugins:get-export-formats` | — | `{data: PluginExportFormatInfo[]}` | エクスポート形式取得 |
| `plugins:execute-export-format` | `{formatId, logs, boardData}` | `{data: content}` | エクスポート実行 |
| `plugins:get-card-actions` | — | `PluginCardActionInfo[]` | カードアクション取得 |
| `plugins:execute-card-action` | `{actionId, cardId, cardData, taskIndex?}` | `{data: result}` | カードアクション実行 |

### アップデート

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `update:check` | — | `UpdateCheckResult` | アップデート確認 |
| `update:download` | `downloadUrl` | `UpdateDownloadResult` | ダウンロード |
| `update:install` | — | `UpdateInstallResult` | インストール |
| `update:cleanup` | — | `UpdateCleanupResult` | 旧ファイル削除 |
| `update:restart` | — | `void` | アプリ再起動 |
| `update:get-state` | — | `{status, version, ...}` | 状態取得 |

### その他

| チャネル | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `scan-installed-apps` | — | `InstalledAppInfo[]` | インストール済みアプリスキャン |
| `get-app-icon` | `appName` | `string` | アプリアイコン(base64) |
| `uninstall-app` | — | `{success}` | アプリアンインストール |
| `get-backup-path` | — | `string` | バックアップパス取得 |

---

## フック詳細

### useWindowStatus — ウィンドウ監視

**定数**:
- チェック間隔: **10秒**
- キャッシュTTL: **5秒**
- ブロークンリンク判定: **3回連続ミス**
- ジャンプデバウンス: **300ms**
- フォーカス復帰: **3秒以上経過で再チェック**

**ウィンドウマッチングロジック**:
1. 完全ID一致
2. ウィンドウ名一致（完全一致 or 部分一致）
3. アプリのウィンドウが1つだけ → 自動マッチ
4. Finder: パス一致、または単一ウィンドウ
5. 3回連続ミス → ブロークンリンク判定

**状態**:
- `unaddedWindows[]` — リンクされていない検出済みウィンドウ
- `brokenLinkCards[]` — ブロークンリンクのカード
- `cachedWindowsRef` — ウィンドウキャッシュ（5秒TTL）
- `missCountRef` — カードごとのミスカウント

### useCardOperations — カードCRUD

**30以上の関数** を提供。主要なカテゴリ:

| カテゴリ | 関数 |
|---------|------|
| 作成 | `handleCreateCard`, `handleCreateCardWithNewTerminal` |
| 編集 | `handleSaveCard`, `handleUpdateDescription`, `handleUpdateComment`, `handleUpdateStatusMarker`, `handleUpdatePriority` |
| 削除/アーカイブ | `handleDeleteCard`, `handleArchiveCard`, `handleRestoreCard`, `handleDuplicateCard` |
| ウィンドウ | `handleSelectWindow`, `handleUnlinkWindow`, `handleAddWindowToCard` |
| 再リンク | `handleRelinkSelectCurrent`, `handleRelinkSelectHistory`, `handleRelinkOpenNew`, `handleRelinkUnlink` |
| アイデア | `handleAddIdea`, `handleRestoreIdeaToBoard`, `handleDeleteIdea`, `handleSendToIdeas` |

### useDataPersistence — バックアップ・Undo

**定数**:
- `BACKUP_INTERVAL = 60000` (60秒)
- `MAX_UNDO = 30`

**自動バックアップ**: 60秒間隔。前回と差分がない場合はスキップ（ハッシュ比較）。
**復元**: 起動時にカード数0 → バックアップからの復元を提案。
**ローテーション**: `.json` → `.prev.json` で1世代保持。

### useTimerActions — タイマー

**タイマーアクション**:

| アクション | 動作 |
|-----------|------|
| `start` | チェックボックスを `[/]` に変更、`⏱ YYYY-MM-DD HH:MM開始` を追記、カードステータスを `/` に |
| `pause` | タイマー行を `⏱ YYYY-MM-DD HH:MM-HH:MM (所要時間)` に置換 |
| `stop` | pause と同じ（完了扱い） |
| `cancel` | タイマー行を削除 |

**所要時間フォーマット**: `Xh Ym` / `Xm Ys` / `Xs`

### useExport — エクスポート・Grid

**Grid配置ルーティング**:
- `terminal` → `arrangeTerminalGrid(options)`
- `finder` → `arrangeFinderGrid(options)`
- その他 → `arrangeGenericGrid(appName, options)`

### useTabManagement — タブ管理

- `handleAddTab(tab)` — タブ追加 + ボード初期化 + アイコン非同期取得
- `handleRemoveTab(tabId)` — タブ削除 + アクティブタブ切替

### useKeyboardShortcuts — ショートカット

| キー | アクション |
|-----|----------|
| `Cmd/Ctrl + ,` | 設定モーダル |
| `Cmd/Ctrl + G` | Grid配置モーダル |
| `Cmd/Ctrl + Z` | Undo |

---

## ユーティリティ詳細

### terminalColor.ts — 色計算

```typescript
DARK_BASE = { r: 26, g: 26, b: 46 }  // ダーク系ベース色

TERMINAL_PRESETS = [
  { id: 'ocean',  name: 'Ocean',  bg: {r:14, g:165, b:233} },
  { id: 'forest', name: 'Forest', bg: {r:34, g:197, b:94}  },
  { id: 'sunset', name: 'Sunset', bg: {r:249, g:115, b:22} },
  { id: 'berry',  name: 'Berry',  bg: {r:168, g:85, b:247} },
  { id: 'slate',  name: 'Slate',  bg: {r:148, g:163, b:184}},
  { id: 'rose',   name: 'Rose',   bg: {r:244, g:63, b:94}  },
]
```

**色計算フロー**:
1. `computeTerminalBgColorFromHex(hex, mixRatio=0.20)` — hex → RGB → `DARK_BASE * (1-ratio) + accent * ratio`
2. `generateGradientColors(count)` — HSL空間で等間隔に色相を配分 (S=0.7, L=0.55)
3. `computeContrastTextColor(bg)` — WCAG 2.0 輝度計算 → 白 or 黒テキスト
4. `withAutoTextColor(bg)` — bgColor + 自動テキスト色の `TerminalColorOptions` を返す

### checkboxConstants.ts — チェックボックスマーカー

**36種のマーカー**: ` xX><!?/-+RiBPCQNIpLEArcTt@OWfFH&sDd~`

**マーカーグループ**（右クリックメニュー用）:

| グループ | マーカー |
|---------|---------|
| 基本 | ` `, `x`, `/`, `-`, `>` |
| 優先度 | `!`, `?`, `+` |
| アイデア | `i`, `B`, `R`, `N` |
| 議論 | `P`, `C`, `Q` |
| 情報 | `I`, `b`, `L`, `E` |
| その他 | `T`, `@`, `H`, `s` |

**カードステータスマーカー**（簡易版）: ` `, `x`, `/`, `>`, `-`, `!`, `?`, `i`, `d`

### boardUtils.ts — マイグレーション

| 関数 | 説明 |
|------|------|
| `createDefaultBoard()` | 3カラム（todo/in-progress/done）の空ボード作成 |
| `migrateColumnColors(data)` | 欠損カラム色を `DEFAULT_COLUMN_COLORS` で補完 |
| `migrateCardWindows(data)` | 旧 `windowApp/windowId` → `windows: WindowRef[]` 変換 |
| `migrateBoardDataToAllBoards(old)` | 単一 `BoardData` → `AllBoardsData` 変換 |

**デフォルトカラム色**: todo=#9ca3af, in-progress=#3b82f6, done=#22c55e

---

## プラグインシステム

### プラグイン構造

```
{userData}/plugins/
  plugins.json          # レジストリ（全プラグインの状態管理）
  {pluginId}/
    manifest.json       # プラグインメタデータ
    main.js             # エントリーポイント
```

### プラグインマニフェスト

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "minAppVersion": "1.9.0",
  "description": "説明",
  "author": "作者",
  "type": "export",           // grid-layout | export | integration | theme | utility
  "main": "main.js"           // オプション（デフォルト: main.js）
}
```

### プラグインAPI

プラグインの `onload(api)` に渡される API オブジェクト:

```javascript
// Grid レイアウト登録
api.registerGridLayout({ id, name, description?, cols, rows, padding? })
api.unregisterGridLayout(layoutId)

// エクスポート形式登録
api.registerExportFormat({ id, name, description?, generate(logs, boardData) → string })
api.unregisterExportFormat(formatId)

// カードアクション登録
api.registerCardAction({
  id, label, title?,
  position: 'task' | 'card-header' | 'card-footer',
  handler(cardId, cardData, taskIndex?) → any
})
api.unregisterCardAction(actionId)

// 設定
api.getSettings() → object
api.saveSettings(settings)

// ログ
api.log(...args)
api.error(...args)
```

**ID規則**: 登録時に `{pluginId}:{id}` に自動変換される。

### プラグインライフサイクル

```
インストール
  │ installFromGitHub("owner/repo")
  │ → manifest.json + main.js をダウンロード
  │ → レジストリに登録 (enabled: false)
  │
  ├── 有効化: enablePlugin(id)
  │   → require(main.js) → onload(api) 呼び出し
  │   → 登録されたレイアウト/フォーマット/アクションが利用可能に
  │
  ├── 無効化: disablePlugin(id)
  │   → onunload() 呼び出し → 登録解除 → require キャッシュクリア
  │
  ├── 更新: updatePlugin(id)
  │   → 無効化 → GitHub から再ダウンロード → 有効化
  │
  └── アンインストール: uninstallPlugin(id)
      → 無効化 → ファイル削除 → レジストリから削除
```

---

## データフロー

### バックアップデータ構造

```typescript
interface BackupData {
  boardData: BoardData | AllBoardsData;  // 旧形式/新形式両対応
  activityLogs: ActivityLog[];
  settings: Settings;
  backupAt: number;
  version: number;
}

interface SettingsPreset {   // 共有用（パス除外）
  type: 'settings-preset';
  settings: Omit<Settings, 'obsidianVaultPath' | 'dailyNotePath' | 'insertMarker'>;
}

interface CardBackup {       // カードのみ
  type: 'card-backup';
  boardData: BoardData | AllBoardsData;
  activityLogs: ActivityLog[];
}
```

### アクティビティログ

```typescript
type ActivityType = 'move' | 'create' | 'delete' | 'complete';

interface ActivityLog {
  id: string;
  type: ActivityType;
  cardTitle: string;
  cardDescription?: string;
  cardTag: TagType;
  fromColumn?: string;   // moveの場合
  toColumn?: string;     // moveの場合
  timestamp: number;
}
```

### データマイグレーションフロー

```
アプリ起動
  │
  ├── localStorage 'kanban-data' (旧形式) が存在？
  │   └── migrateBoardDataToAllBoards() → 'kanban-all-boards' に保存
  │       └── 旧データは 'kanban-data-backup' にバックアップ後削除
  │
  ├── AllBoardsData 読み込み
  │   ├── migrateColumnColors() → 欠損カラム色を補完
  │   └── migrateCardWindows() → windowApp/windowId → windows[] 変換
  │
  └── カード数 = 0 の場合
      └── loadBackup() → 復元提案
```

---

## パフォーマンス設計

| 項目 | 値 | 説明 |
|------|------|------|
| ウィンドウチェック間隔 | 10秒 | `useWindowStatus` |
| ウィンドウキャッシュTTL | 5秒 | `cachedWindowsRef` |
| フォーカス復帰デバウンス | 3秒 | 最後のチェックから3秒以上でのみ再チェック |
| ジャンプデバウンス | 300ms | 連打防止 |
| 自動バックアップ間隔 | 60秒 | `useDataPersistence` |
| Undoスタック上限 | 30 | `MAX_UNDO` |
| ブロークンリンク判定 | 3回ミス | `missCountRef` |
| スクリプト実行タイムアウト | 10〜15秒 | AppleScript / PowerShell |

---

## プラットフォーム別実装

### macOS (darwin)

| 機能 | 実装方法 |
|------|---------|
| ウィンドウ列挙 | AppleScript (Terminal/Finder専用API + System Events汎用API) |
| ウィンドウアクティブ化 | AXRaise（対象ウィンドウのみ前面化） |
| Grid配置 | AppleScript + NSScreen（比例分割アルゴリズム） |
| Terminal色設定 | AppleScript `set background color` |
| ガラス効果 | Swift バイナリ → .terminal プロファイル → AppleScript適用 |
| アプリスキャン | /Applications スキャン + sips でアイコン抽出 |
| アップデート | GitHub API + hdiutil (DMG) |

### Windows (win32)

| 機能 | 実装方法 |
|------|---------|
| ウィンドウ列挙 | PowerShell + user32.dll (EnumWindows) |
| ウィンドウアクティブ化 | SetForegroundWindow |
| Grid配置 | PowerShell + SetWindowPos |
| Terminal色設定 | **非対応**（UI非表示） |
| アプリスキャン | レジストリ + スタートメニュースキャン |
| アップデート | GitHub API + NSIS インストーラー起動 |

### Linux

| 機能 | 実装方法 |
|------|---------|
| ウィンドウ列挙 | wmctrl + xdotool (X11) |
| ウィンドウアクティブ化 | wmctrl -i -a |
| Grid配置 | wmctrl -e (x,y,w,h) |
| Terminal色設定 | **非対応**（UI非表示） |
| アプリスキャン | .desktop ファイルスキャン |
| アップデート | GitHub API + AppImage/deb |

---

## 変更時のチェックリスト

### 新機能追加

- [ ] `types/index.ts` — 新しい型・インターフェース定義を追加
- [ ] `electron/main.cjs` — IPC ハンドラ登録
- [ ] `electron/preload.cjs` — API 公開（contextBridge）
- [ ] `src/types/index.ts` — `electronAPI` 型定義に追加
- [ ] `HelpModal.tsx` — ヘルプに新機能を記載
- [ ] `docs/USER_GUIDE.md` — ユーザーガイドに操作方法を追加
- [ ] `docs/DEV_GUIDE.md` — 開発ガイドにAPI・型を追加
- [ ] `npm run build` — ビルドエラーなし確認

### カード関連の変更

- [ ] `Card` 型 (`types/index.ts`) — フィールド追加時はオプショナルに
- [ ] `getCardWindows()` / `hasWindows()` — ウィンドウ系変更時の互換性
- [ ] `useCardOperations.ts` — CRUD操作の更新
- [ ] `EditCardModal.tsx` — UI反映
- [ ] `Card.tsx` — カード表示反映

### ウィンドウ管理の変更

- [ ] `windowManager.cjs`（3プラットフォーム） — 全プラットフォームで動作確認
- [ ] `useWindowStatus.ts` — マッチングロジック影響確認
- [ ] `WindowRef` 型 — フィールド追加時の後方互換性

### バックアップ形式の変更

- [ ] `BackupData` / `AllBoardsData` 型 — バージョンフィールド更新
- [ ] `useDataPersistence.ts` — マイグレーションロジック追加
- [ ] `boardUtils.ts` — 新しいマイグレーション関数

### プラグイン API の変更

- [ ] `pluginAPI.cjs` — 新しい登録関数追加
- [ ] `pluginManager.cjs` — ライフサイクル更新
- [ ] `main.cjs` — IPC ハンドラ追加
- [ ] `preload.cjs` — API公開
- [ ] `types/index.ts` — プラグイン型定義更新

### ガラス効果の変更

→ **[ガラス効果開発ガイド](GLASS_EFFECT_DEV_GUIDE.md)** のチェックリストを参照

---

## 設定型定義

```typescript
interface Settings {
  obsidianVaultPath: string;
  dailyNotePath: string;
  insertMarker: string;
  cardClickBehavior: 'edit' | 'jump';
  customSubtags?: CustomSubtag[];
  defaultSubtagSettings?: DefaultSubtagSettings;
  theme?: 'dark' | 'light';
  enabledAppTabs?: AppTabConfig[];
  activateAnimation?: 'pop' | 'minimize' | 'dock';
  customPriorities?: PriorityConfig[];
  multiGridFavorites?: MultiGridLayout[];
  hiddenColumns?: string[];
  confirmCloseWindow?: boolean;
}
```

---

## 今後の拡張候補

- [ ] ガラス効果: alpha値スライダー、永続化、BackgroundBlurカスタマイズ
- [ ] ネイティブ Wayland 対応 (Linux)
- [ ] Terminal色設定の Windows 対応
- [ ] プラグインタイプの拡張（theme, integration）
- [ ] マルチユーザー対応
- [ ] ウィンドウスナップショット機能

---

*最終更新: 2026-02-15 / v1.9.9*
