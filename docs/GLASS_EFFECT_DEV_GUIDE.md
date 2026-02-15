# Terminal ガラス効果 — 開発ガイド

> このドキュメントは人間・AIが共同で参照・編集しながら開発を進めるための技術資料です。
> コード修正時は関連セクションも必ず更新してください。

---

## アーキテクチャ概要

```
┌──────────────────┐     IPC      ┌──────────────────────────────┐
│  React (renderer) │ ◄─────────► │  Electron main process       │
│                    │             │                              │
│  Board.tsx         │  set-       │  main.cjs (IPC handler)      │
│  EditCardModal.tsx │  terminal-  │    ↓                         │
│                    │  glass      │  windowManager.cjs (darwin)  │
│  batchGlassEnabled │             │    ↓                         │
│  glassEnabled      │             │  Swift binary → .terminal    │
│                    │             │    ↓                         │
│  App.css (UI)      │             │  open -g → Terminal.app      │
└──────────────────┘             └──────────────────────────────┘
```

### 動作原理

Terminal.app の背景透過は `.terminal` プロファイル（NSColor + alpha）経由でしか実現できない。
AppleScript の `set background color` は alpha を消すため、透過にはプロファイル適用が必須。

1. **Swift バイナリ** が NSColor (alpha=0.7) を含む `.terminal` plist を生成
2. `open -g` でバックグラウンドインポート → Terminal.app のプロファイル一覧に追加
3. AppleScript で対象ウィンドウに `set current settings of selected tab` でプロファイル適用
4. 色ごとに固有プロファイル名（`atelierx-glass-{hexKey}`）を使い、ウィンドウ別に異なる色を実現

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `electron/platforms/darwin/windowManager.cjs` | ガラス効果のコアロジック（1178行目〜） |
| `electron/main.cjs` | IPC ハンドラ登録 |
| `electron/preload.cjs` | API 公開（contextBridge） |
| `src/components/Board.tsx` | バッチ操作 UI・ハンドラ |
| `src/components/EditCardModal.tsx` | カード単位操作 UI |
| `src/styles/App.css` | `.terminal-glass-*` スタイル |
| `src/types/index.ts` | TypeScript 型定義 |

---

## 内部状態（windowManager.cjs）

```javascript
// ガラス適用前のオリジナル背景色キャッシュ
// key: windowId (数値ID or ttyパス), value: {r, g, b} 16bit
const originalBgColors = new Map();

// 現在ガラスが適用されているウィンドウの集合
const glassActiveWindows = new Set();

// インポート済みプロファイル (hexKey → profileName)
// 例: "0d0d14" → "atelierx-glass-0d0d14"
const importedGlassProfiles = new Map();

// 現在インポート中のPromise (hexKey → Promise<string|null>)
// 同じ色の重複インポートを防止
const importingProfiles = new Map();
```

### 状態遷移図

```
[初期状態]
  │
  ├── setTerminalGlass(wid, true) ──────────────────┐
  │   1. readTerminalBgColor → originalBgColors に保存│
  │   2. ensureGlassProfile → プロファイル生成/再利用  │
  │   3. applyProfileToWindow → 半透明適用            │
  │   4. glassActiveWindows.add(wid)                  │
  │                                                   ▼
  │                                          [ガラスON]
  │                                              │
  ├── setTerminalGlass(wid, true, color) ────────┤ 色変更
  │   既にONの場合: キャッシュ上書きなし           │ (プロファイル差替)
  │   新規の場合: 現在色をキャッシュ→新色で適用    │
  │                                              │
  ├── setTerminalGlass(wid, false) ──────────────┤ ガラスOFF
  │   1. originalBgColors から元の色を取得         │
  │   2. setTerminalColor で不透明に復元           │
  │   3. glassActiveWindows.delete(wid)           │
  │   4. originalBgColors.delete(wid)             │
  │                                              │
  └── clearTerminalGlassState([wid]) ────────────┘ リセット
      キャッシュだけクリア（AppleScript実行なし）
      → 呼び出し元が setTerminalColor でデフォルト色を設定
```

---

## API リファレンス

### IPC API（フロントエンド → メインプロセス）

| チャネル | 引数 | 説明 |
|---------|------|------|
| `set-terminal-glass` | `(windowId, enable, color?)` | 単一ウィンドウのガラスON/OFF |
| `set-terminal-glass-batch` | `(windowIds, enable, color?)` | 複数ウィンドウの一括ガラスON/OFF |
| `clear-terminal-glass-state` | `(windowIds)` | ガラスキャッシュのクリア（リセット用） |

### TypeScript 型定義（`src/types/index.ts`）

```typescript
setTerminalGlass: (
  windowId: string,
  enable: boolean,
  color?: { r: number; g: number; b: number }  // 8bit RGB (0-255)
) => Promise<boolean>;

setTerminalGlassBatch: (
  windowIds: string[],
  enable: boolean,
  color?: { r: number; g: number; b: number }
) => Promise<boolean>;

clearTerminalGlassState: (
  windowIds: string[]
) => Promise<boolean>;
```

### バックエンド関数（windowManager.cjs）

#### 公開関数（module.exports）

| 関数 | シグネチャ | 説明 |
|------|-----------|------|
| `setTerminalGlass` | `(windowId, enable, color8bit?)` | 単一ウィンドウのガラス制御 |
| `setTerminalGlassBatch` | `(windowIds, enable, color8bit?, windowColorMap?)` | バッチガラス制御 |
| `preloadGlassProfile` | `()` | 起動時のSwiftコンパイル+デフォルトプロファイルimport |
| `clearTerminalGlassState` | `(windowIds)` | キャッシュクリア（AppleScript不要） |

#### 内部関数

| 関数 | 説明 |
|------|------|
| `ensureGlassGenBinary()` | Swiftバイナリ (`/tmp/atelierx-glass-gen4`) のコンパイル（初回のみ） |
| `ensureGlassProfile(bgR, bgG, bgB)` | 指定色のプロファイル存在を保証。未import分のみ生成+import。Profile名を返す |
| `ensureGlassProfilesBatch(colorSpecs)` | 複数色を一括 `open -g` でimport（高速化） |
| `deleteAllGlassProfiles()` | Terminal.appから `atelierx-glass*` プロファイルを全削除 |
| `readTerminalBgColor(windowId)` | AppleScript経由でウィンドウの現在背景色を読み取り（16bit RGB） |
| `applyProfileToWindow(windowId, profileName)` | AppleScriptでプロファイルをウィンドウに適用 |
| `colorToGlassParams(color16bit)` | 16bit色 → float文字列変換。白背景はダーク色にフォールバック |
| `rgb8ToHexKey(r, g, b)` | 8bit RGB → hex文字列 (例: `"0d0d14"`) |
| `rgbFloatToHexKey(r, g, b)` | float RGB → hex文字列 |

---

## Swift バイナリ仕様

**パス**: `/tmp/atelierx-glass-gen4`
**ソース**: 起動時に `ensureGlassGenBinary()` が `/tmp/atelierx-glass-gen4.swift` を書き出してコンパイル

### コマンドライン引数

```
atelierx-glass-gen4 <bgR> <bgG> <bgB> [profileName]
```

| 引数 | 型 | デフォルト | 説明 |
|------|------|-----------|------|
| `bgR` | float (0.0-1.0) | 0.05 | 背景色 Red |
| `bgG` | float (0.0-1.0) | 0.05 | 背景色 Green |
| `bgB` | float (0.0-1.0) | 0.08 | 背景色 Blue |
| `profileName` | string | `"atelierx-glass"` | Terminal.appプロファイル名 |

### 出力

`/tmp/{profileName}.terminal` — plist XML 形式の Terminal プロファイル

### プロファイル内容

| キー | 値 |
|------|------|
| `name` | `{profileName}` |
| `BackgroundColor` | NSColor (bg色, alpha=**0.7**) |
| `TextColor` | NSColor (白, alpha=1.0) |
| `TextBoldColor` | NSColor (白, alpha=1.0) |
| `CursorColor` | NSColor (ライトグレー 0.8, alpha=1.0) |
| `BackgroundBlur` | 0.4 |
| `ProfileCurrentVersion` | 2.07 |

---

## フロントエンド UI 実装

### Board.tsx — バッチ操作

**状態**: `batchGlassEnabled` (boolean) — カラーメニューのガラスON/OFF

**ハンドラ一覧** （ガラスON中は `setTerminalColor` → `setTerminalGlass` に切り替え）:

| ハンドラ | ガラスOFF時 | ガラスON時 |
|---------|-----------|-----------|
| `handleBatchApplyColumnColor` | `setTerminalColor(wid, color)` | `setTerminalGlass(wid, true, bgColor)` |
| `handleBatchApplyPriorityColor` | `setTerminalColor(wid, color)` | `setTerminalGlass(wid, true, bgColor)` |
| `handleBatchApplyPreset` | `setTerminalColor(wid, preset)` | `setTerminalGlass(wid, true, preset.bg)` |
| `handleBatchApplyGradient` | `setTerminalColor(wid, color)` | `setTerminalGlass(wid, true, color)` |
| `handleBatchApplyGlass` | — | `setTerminalGlassBatch(allWids, enable)` |
| `handleBatchResetColor` | `clearGlassState` + `setTerminalColor(default)` | 同左 |

### EditCardModal.tsx — カード単位

**状態**: `glassEnabled` (boolean) — カード編集モーダル内のガラスON/OFF

同様に、ガラスON時はカラム色/優先順位色/カスタムカラーのボタンが `setTerminalGlass(w.id, true, bgColor)` を呼ぶ。

### CSS クラス (`App.css`)

| クラス | 用途 |
|--------|------|
| `.terminal-glass-section` | ガラスUI セクション コンテナ |
| `.terminal-glass-icon` | ガラスアイコン（紫/白グラデーション + blur） |
| `.terminal-glass-btn` | ガラスボタン（紫系 `rgba(139,92,246,*)`) |
| `.terminal-glass-btn.active` | ガラスON時のボタン（紫グロー） |
| `.terminal-glass-beta` | 「beta」ラベルバッジ |
| `.theme-light .terminal-glass-btn` | ライトテーマ対応 |

---

## プロファイルのライフサイクル

```
アプリ起動
  │
  ├── preloadGlassProfile()
  │   └── ensureGlassGenBinary() → Swiftコンパイル (~5秒後)
  │       └── ensureGlassProfile("0.05","0.05","0.08")
  │           └── .terminal ファイル生成 → open -g → import → 新ウィンドウ閉じる
  │
  ├── ユーザーがガラスON
  │   └── setTerminalGlass(wid, true, color?)
  │       └── ensureGlassProfile(R, G, B)
  │           ├── キャッシュヒット → 即時return profileName
  │           └── キャッシュミス → 生成→import→キャッシュ
  │       └── applyProfileToWindow(wid, profileName)
  │
  ├── ユーザーがバッチでガラス+色
  │   └── setTerminalGlassBatch(wids, true)
  │       └── readTerminalBgColor() × N → 各色をキャッシュ
  │       └── ensureGlassProfilesBatch(uniqueColors)
  │           └── 並列 .terminal 生成 → 一括 open -g → 新ウィンドウ全閉じ
  │       └── applyProfileToWindow() × N（各ウィンドウに対応プロファイル）
  │
  └── アプリ終了 or リセット
      └── deleteAllGlassProfiles()
          └── AppleScript で atelierx-glass* を全削除
```

---

## 既知の制約・設計判断

### Terminal.app の制約

- **プロファイル = 共有設定**: 同じプロファイル名を複数ウィンドウに適用すると全ウィンドウが同じ色になる
  → **対策**: 色ごとに固有プロファイル名を生成（マルチプロファイル方式）
- **`set background color` は alpha を消す**: AppleScript での色設定は不透明になる
  → **対策**: 色変更はプロファイル差替で行い、AppleScript `set background color` は使わない（ガラスOFF時のみ使用）
- **`open .terminal` で新ウィンドウが開く**: プロファイルimportの副作用
  → **対策**: import前後のウィンドウID差分で新ウィンドウを検出・自動閉じ

### パフォーマンス

- **Swiftコンパイル**: 初回のみ ~5秒。バイナリは `/tmp/` にキャッシュ
- **プロファイルimport**: 1色あたり ~1.5秒。`ensureGlassProfilesBatch` で一括importすることで色数に関わらず ~2秒に短縮
- **プロファイルキャッシュ**: 一度importした色は `importedGlassProfiles` にキャッシュ。同じ色の再適用はキャッシュから即時

### 競合回避

- **リセット時の AppleScript 競合**: `setTerminalGlass(false)` と `setTerminalColor(default)` が同時に走ると競合
  → **対策**: `clearTerminalGlassState()` でキャッシュだけクリアし、`setTerminalColor` は1回だけ呼ぶ
- **プロファイル重複import**: 同じ色を同時にimportしようとすると競合
  → **対策**: `importingProfiles` Map で同一色のPromiseを共有

---

## 変更時のチェックリスト

ガラス機能を修正する際は以下を確認:

- [ ] `windowManager.cjs`: ガラスロジック変更時、状態管理（4つのMap/Set）の整合性
- [ ] `main.cjs`: IPC ハンドラの引数が windowManager 関数と一致
- [ ] `preload.cjs`: API公開が main.cjs のハンドラと一致
- [ ] `types/index.ts`: TypeScript型定義が preload.cjs と一致
- [ ] `Board.tsx`: `batchGlassEnabled` に依存する全ハンドラがガラス/非ガラスを分岐
- [ ] `EditCardModal.tsx`: `glassEnabled` に依存する全カラーボタンがガラス/非ガラスを分岐
- [ ] `App.css`: ダーク/ライト両テーマで `.terminal-glass-*` のスタイルが定義済み
- [ ] `npm run build` がエラーなく通ること

---

## 今後の拡張候補

- [ ] alpha値（透明度）のスライダー調整
- [ ] ガラス状態の永続化（アプリ再起動後もガラスONを維持）
- [ ] `BackgroundBlur` 値のカスタマイズ
- [ ] betaラベルの除去（安定性確認後）
- [ ] ガラスプロファイルの自動クリーンアップ（アプリ終了時）

---

*最終更新: 2026-02-15 / v1.9.9*
