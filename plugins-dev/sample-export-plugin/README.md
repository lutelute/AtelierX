# Sample Export Formats Plugin

AtelierX のサンプルプラグインです。エクスポートフォーマットを追加します。

## 含まれるフォーマット

| ID | 名前 | 説明 |
|----|------|------|
| `slack` | Slack | Slack投稿用フォーマット（絵文字付き） |
| `notion` | Notion | Notionデータベース用JSON |
| `html` | HTML | HTML形式でエクスポート |

## 出力例

### Slack フォーマット

```
:calendar: *日報 2024/1/15*

:clipboard: *今日の活動:*
• `09:00` 朝会に参加
• `10:30` 機能Aの実装を完了
• `14:00` コードレビュー

:pushpin: *ボード項目:*
• TODOリストの項目1
```

### Notion フォーマット

```json
{
  "parent": { "database_id": "YOUR_DATABASE_ID" },
  "properties": {
    "Name": { "title": [{ "text": { "content": "日報 2024-01-15" } }] },
    "Date": { "date": { "start": "2024-01-15" } }
  },
  "children": [...]
}
```

### HTML フォーマット

スタイル付きのHTMLドキュメントを生成します。

## インストール

### 方法1: ローカルテスト

1. このフォルダを AtelierX のプラグインディレクトリにコピー:
   ```
   ~/Library/Application Support/AtelierX/plugins/sample-export-formats/
   ```

2. AtelierX を再起動

3. `Cmd + ,` → プラグインタブ → 有効化

### 方法2: GitHub経由

1. このフォルダを GitHub リポジトリとして公開
2. AtelierX で `Cmd + ,` → プラグインタブ
3. `your-username/sample-export-formats` を入力
4. インストール

## 開発

このプラグインをテンプレートとして使用できます:

1. フォルダをコピー
2. `manifest.json` の `id`, `name`, `description` を変更
3. `main.js` を編集して独自のエクスポートフォーマットを追加

### エクスポートフォーマットの構造

```javascript
{
  id: 'my-format',           // ユニークなID
  name: 'My Format',         // 表示名
  description: '説明文',     // 説明（オプション）
  generate(logs, boardData) {
    // logs: ActivityLog[] - 活動ログの配列
    // boardData: BoardData - ボードデータ
    // 戻り値: string - エクスポートされるコンテンツ
    return '出力内容';
  }
}
```

## ライセンス

MIT
