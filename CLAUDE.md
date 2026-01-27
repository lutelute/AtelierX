# AtelierX 開発ガイド

## プロジェクト概要
macOSアプリ（Electron + React + TypeScript）。Terminal/Finder/任意アプリのウィンドウをカンバンボードで管理する。

## 技術スタック
- **フロントエンド**: React 18, TypeScript, Vite, @dnd-kit
- **バックエンド**: Electron (main: CommonJS .cjs), AppleScript経由でmacOSウィンドウ操作
- **パッケージ**: electron-builder → DMG (macOS arm64)

## ディレクトリ構成
```
electron/          # Electronメインプロセス (.cjs)
  main.cjs         # エントリポイント、IPC定義
  windowManager.cjs # ウィンドウ操作（Terminal/Finder専用API + System Events汎用API）
  gridManager.cjs  # Grid配置（AppleScriptで各アプリのウィンドウを等分割配置）
  preload.cjs      # contextBridge API公開
src/
  components/      # Reactコンポーネント
    Board.tsx       # メインボード（タブ管理、ウィンドウ状態チェック、カード操作）
  types/index.ts   # 型定義、プリセットアプリ定義
  hooks/           # カスタムフック
  styles/          # CSS
build/             # アプリアイコン
scripts/           # リリーススクリプト
```

## 開発ワークフロー

**重要: コード修正が完了したら、必ずdevモードを起動してユーザーに動作確認してもらうこと。**
devモードがまだ起動していなければ `npm run electron:dev` を実行する。

```bash
npm run electron:dev        # 開発モード起動（Vite + Electron）
npm run build               # TypeScript + Viteビルド（ビルドチェック用）
npm run electron:build:mac  # DMGビルド → release/AtelierX-{version}-arm64.dmg
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

## ユーザーへのインストール手順
DMGを開いて `/Applications` にドラッグ。既存のAtelierXを上書きする。

## アーキテクチャ上の注意点

### ウィンドウ管理
- **Terminal/Finder**: 専用AppleScript API（ID/tty/名前で安定識別）
- **汎用アプリ**: System Events経由（タイトルベースID `AppName:WindowTitle`）
- 取得は2段階分離: Terminal/Finderのスクリプトと汎用アプリのスクリプトは独立実行。汎用アプリ側がタイムアウトしてもTerminal/Finderに影響しない
- ウィンドウアクティブ化は `activate` や `set frontmost to true` を使わず、`AXRaise` のみで対象ウィンドウだけ前面化する（他のウィンドウは移動しない）

### パフォーマンス
- ウィンドウチェック間隔: 10秒（`WINDOW_CHECK_INTERVAL`）
- キャッシュ: `cachedWindowsRef` で5秒以内のデータを再利用
- フォーカス復帰時: 3秒デバウンス
- AppleScript実行: 全て10〜15秒タイムアウト付き（フリーズ防止）

### 後方互換性
- 旧IDフォーマット（`Excel-5` 等のインデックスベース）→ `windowName`による名前フォールバックで自動マッチ
- `missCountRef`: 連続2回ミスまでリンク切れ表示を抑制（一時的なスクリプト失敗を許容）
- `settings.enabledAppTabs` 未設定時は BUILTIN_APPS (Terminal/Finder) のみ表示

### Grid配置
- 比例分割アルゴリズム: `screenW * gridCol div gridCols` で各ウィンドウの位置を計算（端のピクセル損失なし）
- `gridManager.cjs` の `runAppleScript()` は15秒タイムアウト付き

## リポジトリ
https://github.com/lutelute/AtelierX
