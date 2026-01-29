# AtelierX Grid配置機能ノート

## 概要

Grid配置機能は、Terminal / Finder / 任意のmacOSアプリの複数ウィンドウを画面上に自動的に等分割配置する機能。AppleScriptでmacOSネイティブAPIを直接操作する。

**ショートカット**: `Ctrl + G`（Ideasタブ以外）

---

## 対応アプリと配置方式

| アプリ | 方式 | API | タイムアウト |
|--------|------|-----|------------|
| Terminal | System Events（3パス） | `position` + `size` | 30秒 |
| Finder | ネイティブ bounds | `bounds {left, top, right, bottom}` | 20秒 |
| 汎用アプリ | System Events（3パス） | `position` + `size` | 45秒 |

### Terminal / 汎用アプリ: 3パス方式

System Eventsの `position` / `size` プロパティで配置。Terminalは文字セル境界スナップバグがあるため3パスで補正する。

- **Pass 1**: `position` のみ移動（ディスプレイ間の移動を確実に）
- **Pass 2-3**: `position` + `size` で正確配置（各パス間に0.15〜0.2秒delay）

### Finder: ネイティブ bounds

Finderは `bounds` プロパティで `{left, top, right, bottom}` を直接設定。1パスで完了するためTerminalより高速。

---

## 設定項目

```typescript
interface GridOptions {
  cols?: number;         // 列数（0 = 自動）
  rows?: number;         // 行数（0 = 自動）
  displayIndex?: number; // ディスプレイ番号（0 = 自動、1〜 = 指定）
  padding?: number;      // ウィンドウ間マージン（px）
}
```

**デフォルト padding**:
- Terminal / 汎用: `-5`（文字セル境界スナップ補償で10px大きく配置）
- Finder: `0`（bounds APIで正確）

---

## 自動行列数計算

ウィンドウ数と画面幅に応じて自動決定:

| ウィンドウ数 | 列×行 |
|------------|--------|
| 1 | 1×1 |
| 2 | 2×1 |
| 3 | 3×1 |
| 4-6 | 3×2 |
| 7-8 | 4×2 |
| 9-12 | 4×3 |
| 13-20 | 5×4 |
| 21+ | 6×4+ |

画面幅による最低列数:
- \> 3000px → 5列以上
- \> 2560px → 4列以上
- \> 1920px → 3列以上

---

## 比例分割アルゴリズム

```
gC = idx mod gridCols        // 列インデックス
gR = idx div gridCols        // 行インデックス
x1 = screenX + (screenW × gC ÷ gridCols) + padding
x2 = screenX + (screenW × (gC+1) ÷ gridCols) - padding
y1 = screenY + (screenH × gR ÷ gridRows) + padding
y2 = screenY + (screenH × (gR+1) ÷ gridRows) - padding
```

整数除算による比例分割で、端のピクセル損失がない。

---

## 外部ディスプレイ対応

### 座標系変換

macOSは2種類の座標系を持つ:
- **NSScreen**: 原点=左下、Y軸は上向き
- **AppleScript**: 原点=左上、Y軸は下向き

変換式: `asY = mainScreenHeight - (NSMinY(visibleFrame) + NSHeight(visibleFrame))`

### メニューバー補正

外部ディスプレイで `visibleFrame` の高さがフレーム全体と一致する場合（メニューバーが含まれている）、Y座標に+25pxしてメニューバー領域を回避する。

### ディスプレイモード

- **自動** (`displayIndex = 0`): 各ウィンドウの中心座標で所属ディスプレイを判定し、ディスプレイごとに個別配置
- **指定** (`displayIndex ≥ 1`): 全ウィンドウを指定ディスプレイに集約配置

---

## ウィンドウ活性化（ジャンプ機能）

カードクリックでリンク先ウィンドウにジャンプする機能。

### キャッシュ優先戦略

1. `findWindowInCache` — キャッシュから同期検索（0ms応答）
2. キャッシュ未HIT → `findMatchingWindow` で非同期再取得
3. それでも未HIT → リリンクモーダル表示

### マッチング順序

1. ウィンドウID完全一致
2. ウィンドウ名完全一致（後方互換）

### Generic appの3段階検索

ブラウザ等はタブ切替でウィンドウタイトルが変わるため:

1. **完全一致**: `name of w is "タイトル"`
2. **部分一致**: `name of w contains "タイトル"`
3. **インデックス**: `window ${idx}` フォールバック

全パスでアニメーション動作を保証。

### アニメーション設定

設定画面で選択可能:

| モード | 動作 | 実装 |
|--------|------|------|
| **pop** | 引っ込んで飛び出す | System Events: position/size操作 |
| **minimize** | Dockに吸い込まれて戻る | アプリ別API（下記） |

minimize時のアプリ別API:
- Terminal: `miniaturized` プロパティ
- Finder: `collapsed` プロパティ
- 汎用: System Events `AXMinimized` + `activate` で復帰

### ウィンドウ前面化

`AXRaise` のみ使用。`activate` や `set frontmost` は使わない。これにより対象ウィンドウだけが前面に来て、他のウィンドウは移動しない。

---

## パフォーマンス最適化

| 項目 | 値 |
|------|-----|
| ウィンドウチェック間隔 | 10秒 |
| フォーカス復帰デバウンス | 3秒 |
| バックアップ間隔 | 60秒 |
| リンク切れ判定 | 連続2回ミス |
| AppleScript実行 | 非同期（exec Promise） |
| Grid配置 spawn | detached（UIブロックなし） |
| Finder/Terminal ID検索 | 直接アクセス（`window id N`） |

### 差分チェック

ウィンドウ一覧の `setState` は、前回と内容が変わった場合のみ実行（不要なReact再レンダリング回避）。

---

## ファイル構成

```
electron/gridManager.cjs    — Grid配置コアロジック（AppleScript生成・実行）
electron/windowManager.cjs  — ウィンドウ活性化・検索・操作
electron/main.cjs           — IPC定義（arrange-*-grid, activate-window等）
electron/preload.cjs        — contextBridge API公開
src/components/Board.tsx     — Grid UI呼び出し、キャッシュ管理、ジャンプ処理
src/components/SettingsModal.tsx — アニメーション設定UI
src/types/index.ts           — GridOptions, DisplayInfo, GridResult型定義
```
