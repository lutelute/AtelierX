# AtelierX

> *Atelier（アトリエ＝創作空間）+ X（拡張・可能性）*

Terminal/Finderウィンドウをカンバンボードで管理するmacOSアプリ。プラグインで機能を拡張可能。

## 機能

### ウィンドウ管理
- **カンバンボード**: Terminal/Finderウィンドウをカード化して「未着手」「実行中」「完了」で管理
- **ドラッグ&ドロップ**: カードをカラム間で自由に移動
- **ウィンドウジャンプ**: カードをクリックして対象ウィンドウを前面に表示（ポップアニメーション）
- **タブ切り替え**: Terminal / Finder ボードを切り替え
- **リマインダー**: 未登録のウィンドウを自動検出して通知
- **一括追加**: 未登録のウィンドウを全て一括でボードに追加

### グリッド配置
- **ウィンドウ整列**: Terminal/Finderウィンドウをグリッド状に自動配置
- **プリセット**: プラグインでカスタムレイアウトを追加可能
- **マルチディスプレイ対応**: ディスプレイごとに配置先を選択

### 日報・ログ機能
- **アクティビティログ**: カードの移動・完了を自動記録
- **日報エクスポート**: Markdown / JSON / テキスト形式で出力
- **クリップボードコピー**: ワンクリックでコピー
- **ファイル保存**: 任意の場所に保存

### Obsidian連携
- **デイリーノート差し込み**: Obsidianのデイリーノートに日報を追記
- **ノート選択**: 差し込み先のノートを一覧から選択可能
- **マーカー指定**: 特定の見出し下に差し込み（例: `## AtelierX`）
- **自動作成**: ノートが存在しない場合は新規作成

### プラグインシステム
- **GitHub連携**: `owner/repo` 形式でプラグインをインストール
- **拡張API**: グリッドレイアウト追加などの機能拡張
- **ローカル開発**: `plugins-dev/` でプラグインを開発・テスト

## スクリーンショット

```
+-------------------+-------------------+-------------------+
|      未着手       |      実行中       |       完了        |
+-------------------+-------------------+-------------------+
| [Terminal] proj1  | [Terminal] proj2  |                   |
| [Finder] docs     |                   |                   |
+-------------------+-------------------+-------------------+
```

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **Desktop**: Electron
- **DnD**: @dnd-kit
- **macOS API**: AppleScript (Terminal/Finder操作)

## インストール

### macOS
1. [Releases](../../releases)ページから最新の`.dmg`ファイルをダウンロード
2. dmgファイルを開き、AtelierXをApplicationsフォルダにドラッグ
3. Applicationsから起動

### Windows
1. [Releases](../../releases)ページから最新の`.exe`インストーラーをダウンロード
2. インストーラーを実行し、指示に従ってインストール
3. スタートメニューまたはデスクトップから起動

### Linux
1. [Releases](../../releases)ページから最新の`.AppImage`または`.deb`をダウンロード
2. AppImage: 実行権限を付与して起動 (`chmod +x AtelierX*.AppImage && ./AtelierX*.AppImage`)
3. deb: `sudo dpkg -i atelierx_*.deb` でインストール

## 開発

```bash
# 依存関係をインストール
npm install

# 開発モードで起動
npm run electron:dev

# ビルド（macOS）
npm run electron:build:mac

# ビルド（Windows）
npm run electron:build:win

# ビルド（Linux）
npm run electron:build:linux

# ビルド（全プラットフォーム）
npm run electron:build:all
```

詳細なビルド方法は [CROSS_PLATFORM_BUILD_GUIDE.md](./CROSS_PLATFORM_BUILD_GUIDE.md) を参照。

## リリース手順

### 1. バージョン更新 & ビルド

```bash
# バグ修正（0.1.0 → 0.1.1）
npm run release:patch

# 機能追加（0.1.0 → 0.2.0）
npm run release:minor

# 大きな変更（0.1.0 → 1.0.0）
npm run release:major
```

### 2. GitHubにリリース作成

```bash
# タグをプッシュ
git push --tags
```

1. [GitHub Releases](../../releases) ページを開く
2. 「Draft a new release」をクリック
3. 作成されたタグ（例: `v0.2.0`）を選択
4. リリースノートを記入
5. `release/AtelierX-x.x.x-arm64.dmg` をアップロード
6. 「Publish release」をクリック

### 3. 本番アプリの更新

ユーザーは設定画面で「更新を確認」ボタンを押すと、新しいバージョンがある場合はダウンロードリンクが表示されます。

## プロジェクト構成

```
├── electron/
│   ├── main.cjs          # Electronメインプロセス
│   ├── preload.cjs       # プリロードスクリプト
│   ├── windowManager.cjs # macOSウィンドウ操作
│   ├── gridManager.cjs   # グリッド配置
│   ├── pluginManager.cjs # プラグイン管理
│   └── pluginAPI.cjs     # プラグインAPI
├── src/
│   ├── components/       # Reactコンポーネント
│   ├── hooks/            # カスタムフック
│   ├── styles/           # CSS
│   └── types/            # TypeScript型定義
├── plugins-dev/          # プラグイン開発用
├── docs/                 # ドキュメント
└── examples/             # サンプルプラグイン
```

## プラグイン開発

詳細は [docs/plugin-development-guide.md](./docs/plugin-development-guide.md) を参照。

```bash
# ローカルプラグインのインストール
cd plugins-dev
./install-local.sh hello-plugin
```

## 既知の問題

詳細は [ISSUES.md](./ISSUES.md) を参照。

1. ウィンドウジャンプ後にElectronアプリが最前面に来る
2. Finderウィンドウのポップ動作が遅い
3. Obsidianデイリーノートへの差し込みが動作しない場合がある

## ライセンス

MIT
