# AtelierX 開発ガイド

## プロジェクト概要
クロスプラットフォームアプリ（Electron + React + TypeScript）。Terminal/ファイルマネージャー/任意アプリのウィンドウをカンバンボードで管理する。

## 技術スタック
- **フロントエンド**: React 18, TypeScript, Vite, @dnd-kit
- **バックエンド**: Electron (main: CommonJS .cjs), プラットフォーム抽象化レイヤーで macOS/Windows/Linux 対応
- **パッケージ**: electron-builder → DMG (macOS) / NSIS (Windows) / AppImage+deb (Linux)

## ディレクトリ構成
```
electron/                # Electronメインプロセス (.cjs)
  main.cjs               # エントリポイント、IPC定義
  preload.cjs            # contextBridge API公開
  pluginManager.cjs      # プラグイン管理（プラットフォーム非依存）
  pluginAPI.cjs          # プラグインAPI（プラットフォーム非依存）
  platforms/
    index.cjs            # プラットフォーム振り分けルーター（process.platformで判定）
    darwin/              # macOS 実装
      windowManager.cjs  # AppleScript経由でウィンドウ操作
      gridManager.cjs    # AppleScript + NSScreen でGrid配置
      appScanner.cjs     # /Applications スキャン + sips でアイコン抽出
      updateManager.cjs  # GitHub API + hdiutil でDMGインストール
      mainConfig.cjs     # hiddenInset, App Nap対策, .scpt掃除
    win32/               # Windows 実装
      windowManager.cjs  # PowerShell + user32.dll でウィンドウ操作
      gridManager.cjs    # PowerShell + SetWindowPos でGrid配置
      appScanner.cjs     # レジストリ + スタートメニュー スキャン
      updateManager.cjs  # GitHub API + NSIS インストーラー起動
      mainConfig.cjs     # no-op（デフォルトタイトルバー）
    linux/               # Linux 実装
      windowManager.cjs  # wmctrl/xdotool でウィンドウ操作 (X11)
      gridManager.cjs    # wmctrl -e でGrid配置
      appScanner.cjs     # .desktop ファイルスキャン
      updateManager.cjs  # GitHub API + AppImage/deb
      mainConfig.cjs     # no-op
src/
  components/            # Reactコンポーネント
    Board.tsx            # メインボード（タブ管理、ウィンドウ状態チェック、カード操作）
  types/index.ts         # 型定義、BUILTIN_APPS（プラットフォーム動的切替）
  hooks/                 # カスタムフック
  styles/                # CSS
build/                   # アプリアイコン (icon.icns / icon.ico / icon.png)
scripts/                 # リリーススクリプト
.github/workflows/       # CI/CD (ci.yml + build.yml)
```

## 開発ワークフロー

**重要: コード修正が完了したら、必ずdevモードを起動してユーザーに動作確認してもらうこと。**
devモードがまだ起動していなければ `npm run electron:dev` を実行する。

```bash
npm run electron:dev          # 開発モード起動（Vite + Electron）
npm run build                 # TypeScript + Viteビルド（ビルドチェック用）
npm run electron:build:mac    # DMGビルド (macOS)
npm run electron:build:win    # NSISビルド (Windows)
npm run electron:build:linux  # AppImage+debビルド (Linux)
npm run electron:build:all    # 全プラットフォームビルド
```

### 開発の流れ
1. コードを修正する
2. `npm run build` でビルドが通ることを確認
3. **`npm run electron:dev` を起動**してユーザーに動作確認してもらう
4. ユーザーが確認OK → リリース手順へ

## リリース手順

### 自動リリース（推奨）
```bash
npm run release:patch   # パッチ: 0.7.2 → 0.7.3
npm run release:minor   # マイナー: 0.7.2 → 0.8.0
npm run release:major   # メジャー: 0.7.2 → 1.0.0
```
`scripts/release.sh` がバージョン更新→ビルド→コミット→タグ→push→GitHub Release（DMG添付）まで一括実行する。

### CI/CD 自動ビルド
`v*` タグのpushで `.github/workflows/build.yml` が起動し、macOS/Windows/Linux の全プラットフォームでビルド→GitHub Releaseにアーティファクトを添付する。

### 手動リリース
以下の全ステップを**必ず順番通り**実行すること。

1. **package.json のバージョン更新**
2. **`npm run build`** でビルドが通ることを確認
3. **git add & commit** （変更ファイルを明示指定、`git add -A`は使わない）
4. **git push origin main**
5. **`npm run electron:build:mac`** でDMGをビルド
6. **DMGをGitHub Releaseにアップロード**:
   ```bash
   gh release create v{VERSION} release/AtelierX-{VERSION}-arm64.dmg \
     --title "v{VERSION} - タイトル" \
     --notes "リリースノート"
   ```

> **注意: DMGのアップロードを忘れないこと。** コミット・pushだけではユーザーはアプリを更新できない。必ずGitHub Releaseを作成しDMGを添付する。

## インストール手順
- **macOS**: DMGを開いて `/Applications` にドラッグ
- **Windows**: NSISインストーラー (.exe) を実行
- **Linux**: AppImageを実行 (`chmod +x AtelierX.AppImage && ./AtelierX.AppImage`) または .deb をインストール

### Linux の前提条件
ウィンドウ管理機能を使うには以下をインストール:
```bash
sudo apt install wmctrl xdotool
```

## 新機能追加時のチェックリスト

新しい機能を追加した場合、以下のヘルプ・ガイダンス箇所も合わせて更新すること:

1. **`HelpModal.tsx`** - グローバルヘルプモーダル
   - 「概要」タブ: 主要機能カードに該当する場合は追加
   - 「機能一覧」タブ: 新機能の説明を `help-feature-detail` として追加
   - 「プラグイン」タブ: プラグイン関連の変更があれば更新
   - 「ショートカット」タブ: 新しいキーボードショートカットがあれば追加
2. **各モーダルのヘルプパネル** - モーダルにヘルプ (`mg-help-panel`) がある場合、内容を更新
   - `GridArrangeModal.tsx` / `ExportModal.tsx` / `MultiGridModal.tsx` が該当
3. **`Board.tsx` ナビバー tooltip** - ナビボタンを追加・変更した場合は `title` 属性を具体的な説明にする
4. **`PluginManager.tsx` ガイドバナー** - プラグインタイプが増えたら説明を更新

> 新しいモーダルを追加する場合は、既存パターン（`mg-help-btn` + `mg-help-panel`）でヘルプパネルを付けること。

## アーキテクチャ上の注意点

### プラットフォーム抽象化
- `electron/platforms/index.cjs` が `process.platform` で darwin/win32/linux を判定
- 各プラットフォームの5モジュール (windowManager, gridManager, appScanner, updateManager, mainConfig) をフラット namespace で re-export
- main.cjs は1つの `require('./platforms/index.cjs')` のみ。IPC ハンドラはプラットフォーム非依存
- フロントエンドの `BUILTIN_APPS` は `window.electronAPI.platform` で動的切替

### ウィンドウ管理（プラットフォーム別）
- **macOS**: AppleScript (Terminal/Finder専用API + System Events汎用API)
- **Windows**: PowerShell + user32.dll (EnumWindows, SetForegroundWindow, SetWindowPos)
- **Linux**: wmctrl + xdotool (X11, XWayland対応。ネイティブWaylandは将来対応)

### macOS 固有
- ウィンドウアクティブ化は `AXRaise` のみで対象ウィンドウだけ前面化
- Terminal色設定 (setTerminalColor) は macOS 限定。Windows/Linux では no-op、UIも非表示

### パフォーマンス
- ウィンドウチェック間隔: 10秒（`WINDOW_CHECK_INTERVAL`）
- キャッシュ: `cachedWindowsRef` で5秒以内のデータを再利用
- フォーカス復帰時: 3秒デバウンス
- スクリプト実行: 全て10〜15秒タイムアウト付き（フリーズ防止）

### Grid配置
- 比例分割アルゴリズム: `screenW * gridCol / gridCols` で各ウィンドウの位置を計算
- macOS: AppleScript + NSScreen、Windows: PowerShell + SetWindowPos、Linux: wmctrl -e

## リポジトリ
https://github.com/lutelute/AtelierX
