# Sample Grid Layouts Plugin

Window Board のサンプルプラグインです。グリッドレイアウトプリセットを追加します。

## 含まれるレイアウト

| ID | 名前 | 説明 | サイズ |
|----|------|------|--------|
| `dev-3col` | 開発 3列 | エディタ・ターミナル・ブラウザを横並び | 3x1 |
| `code-review` | コードレビュー | 3列2行の6分割レイアウト | 3x2 |
| `presentation` | プレゼンテーション | 2つのウィンドウを横並び | 2x1 |
| `focus` | フォーカス | 大きなメインウィンドウ1つ | 1x1 |
| `quad` | 4分割 | 2x2 の4分割グリッド | 2x2 |

## インストール

### 方法1: ローカルテスト

1. このフォルダを Window Board のプラグインディレクトリにコピー:
   ```
   ~/Library/Application Support/Window Board/plugins/sample-grid-layouts/
   ```

2. Window Board を再起動

3. `Cmd + ,` → プラグインタブ → 有効化

### 方法2: GitHub経由

1. このフォルダを GitHub リポジトリとして公開
2. Window Board で `Cmd + ,` → プラグインタブ
3. `your-username/sample-grid-layouts` を入力
4. インストール

## 開発

このプラグインをテンプレートとして使用できます:

1. フォルダをコピー
2. `manifest.json` の `id`, `name`, `description` を変更
3. `main.js` を編集して独自のレイアウトを追加

## ライセンス

MIT
