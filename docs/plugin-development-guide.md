# AtelierX プラグイン開発ガイド

このガイドでは、AtelierX のプラグインを開発・公開する方法を説明します。

## 目次

1. [クイックスタート](#クイックスタート)
2. [プラグイン構造](#プラグイン構造)
3. [マニフェスト仕様](#マニフェスト仕様)
4. [プラグインAPI](#プラグインapi)
5. [ライフサイクル](#ライフサイクル)
6. [プラグインタイプ別ガイド](#プラグインタイプ別ガイド)
7. [動作確認ガイド](#動作確認ガイド)
8. [デバッグ方法](#デバッグ方法)
9. [公開方法](#公開方法)
10. [ベストプラクティス](#ベストプラクティス)

---

## クイックスタート

### 1. リポジトリを作成

```bash
mkdir my-atelierx-plugin
cd my-atelierx-plugin
git init
```

### 2. manifest.json を作成

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "プラグインの説明",
  "author": "Your Name",
  "repository": "your-username/my-atelierx-plugin",
  "type": "utility"
}
```

### 3. main.js を作成

```javascript
module.exports = {
  onload(api) {
    api.log('Plugin loaded!');
  },

  onunload() {
    console.log('Plugin unloaded');
  }
};
```

### 4. GitHubにプッシュ

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/my-atelierx-plugin.git
git push -u origin main
```

### 5. インストール

AtelierX で `Cmd + ,` → プラグインタブ → `your-username/my-atelierx-plugin` を入力してインストール

---

## プラグイン構造

```
my-plugin/
├── manifest.json      # 必須: プラグイン定義
├── main.js            # 必須: エントリーポイント
├── README.md          # 推奨: プラグイン説明
├── LICENSE            # 推奨: ライセンス
└── assets/            # オプション: 追加リソース
    └── icon.png
```

### 必須ファイル

| ファイル | 説明 |
|---------|------|
| `manifest.json` | プラグインのメタデータを定義 |
| `main.js` | プラグインのエントリーポイント（`onload`/`onunload` を export） |

---

## マニフェスト仕様

### 完全な例

```json
{
  "id": "custom-grid-layouts",
  "name": "Custom Grid Layouts",
  "version": "1.2.0",
  "minAppVersion": "1.0.0",
  "description": "追加のグリッドレイアウトプリセットを提供します",
  "author": "Plugin Author",
  "authorUrl": "https://github.com/plugin-author",
  "repository": "plugin-author/custom-grid-layouts",
  "type": "grid-layout",
  "main": "main.js"
}
```

### フィールド説明

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `id` | ✅ | 一意のプラグインID（小文字、ハイフンのみ） |
| `name` | ✅ | 表示名 |
| `version` | ✅ | セマンティックバージョン（例: `1.0.0`） |
| `minAppVersion` | ✅ | 必要な最小アプリバージョン |
| `description` | ✅ | プラグインの説明 |
| `author` | ✅ | 作者名 |
| `authorUrl` | ❌ | 作者のWebサイトまたはGitHubプロフィール |
| `repository` | ❌ | GitHubリポジトリ（`owner/repo` 形式） |
| `type` | ❌ | プラグインタイプ（下記参照） |
| `main` | ❌ | エントリーポイント（デフォルト: `main.js`） |

### プラグインタイプ

| タイプ | 説明 |
|--------|------|
| `grid-layout` | グリッドレイアウトを追加 |
| `export` | エクスポート機能を追加 |
| `integration` | 外部サービス連携 |
| `theme` | テーマ・スタイル変更 |
| `utility` | その他ユーティリティ |

---

## プラグインAPI

プラグインの `onload(api)` で受け取る `api` オブジェクトの仕様です。

### グリッドレイアウト関連

#### `api.registerGridLayout(layout)`

グリッドレイアウトを登録します。

```javascript
api.registerGridLayout({
  id: 'my-layout',           // 必須: レイアウトID
  name: 'マイレイアウト',      // 必須: 表示名
  description: '説明文',      // オプション: 説明
  cols: 3,                   // 必須: 列数
  rows: 2,                   // 必須: 行数
  padding: 8                 // オプション: パディング（デフォルト: 5）
});
```

#### `api.unregisterGridLayout(layoutId)`

グリッドレイアウトを登録解除します。

```javascript
api.unregisterGridLayout('my-layout');
```

### エクスポートフォーマット関連

#### `api.registerExportFormat(format)`

カスタムエクスポートフォーマットを登録します。

```javascript
api.registerExportFormat({
  id: 'my-format',            // 必須: フォーマットID
  name: 'マイフォーマット',     // 必須: 表示名
  description: '説明文',       // オプション: 説明
  generate(logs, boardData) { // 必須: 生成関数
    // logs: ActivityLog[] - 活動ログの配列
    // boardData: BoardData - ボードデータ（cards, columns など）
    // 戻り値: string - エクスポートされるコンテンツ
    return '出力内容';
  }
});
```

**パラメータ説明:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | ✅ | 一意のフォーマットID |
| `name` | string | ✅ | UI に表示される名前 |
| `description` | string | ❌ | フォーマットの説明 |
| `generate` | function | ✅ | エクスポート内容を生成する関数 |

**`generate(logs, boardData)` の引数:**

- `logs`: `ActivityLog[]` - 活動ログの配列
  - `log.cardTitle`: カードのタイトル
  - `log.timestamp`: タイムスタンプ
  - `log.columnId`: カラムID

- `boardData`: `BoardData` - ボードの全データ
  - `boardData.cards`: カードのオブジェクト（`{ [cardId]: Card }`）
  - `boardData.columns`: カラムの配列

#### `api.unregisterExportFormat(formatId)`

エクスポートフォーマットを登録解除します。

```javascript
api.unregisterExportFormat('my-format');
```

### 設定関連

#### `api.getSettings()`

プラグインの保存済み設定を取得します。

```javascript
const settings = api.getSettings();
console.log(settings.myOption); // 保存した値
```

#### `api.saveSettings(settings)`

プラグインの設定を保存します。

```javascript
api.saveSettings({
  myOption: 'value',
  anotherOption: true
});
```

### ログ関連

#### `api.log(...args)`

プラグイン名付きでログを出力します。

```javascript
api.log('Something happened');
// 出力: [Plugin:my-plugin] Something happened
```

#### `api.error(...args)`

プラグイン名付きでエラーログを出力します。

```javascript
api.error('Something went wrong');
// 出力: [Plugin:my-plugin] Something went wrong
```

---

## ライフサイクル

### `onload(api)`

プラグインが有効化されたときに呼ばれます。

```javascript
module.exports = {
  onload(api) {
    // 初期化処理
    api.log('Plugin loaded');

    // グリッドレイアウトを登録
    api.registerGridLayout({ ... });

    // 設定を読み込み
    const settings = api.getSettings();
  }
};
```

### `onunload()`

プラグインが無効化されたときに呼ばれます。

```javascript
module.exports = {
  onunload() {
    // クリーンアップ処理
    console.log('Plugin unloaded');

    // ※ registerGridLayout で登録したレイアウトは自動で削除されます
  }
};
```

### ライフサイクル図

```
インストール
    ↓
[無効状態]
    ↓ 有効化
onload(api) 呼び出し
    ↓
[有効状態]
    ↓ 無効化
onunload() 呼び出し
    ↓
[無効状態]
    ↓ アンインストール
削除
```

---

## プラグインタイプ別ガイド

### grid-layout タイプ

グリッドレイアウトプリセットを追加するプラグインです。

```javascript
// main.js
module.exports = {
  onload(api) {
    // コードレビュー用レイアウト
    api.registerGridLayout({
      id: 'code-review',
      name: 'コードレビュー',
      description: 'エディタ、ターミナル、ブラウザを3x2で配置',
      cols: 3,
      rows: 2,
      padding: 8
    });

    // プレゼンテーション用レイアウト
    api.registerGridLayout({
      id: 'presentation',
      name: 'プレゼンテーション',
      description: '2つのウィンドウを横並び',
      cols: 2,
      rows: 1,
      padding: 10
    });

    // フォーカスモード
    api.registerGridLayout({
      id: 'focus',
      name: 'フォーカス',
      description: '大きなメインウィンドウ',
      cols: 1,
      rows: 1,
      padding: 20
    });
  },

  onunload() {
    // 登録解除は自動で行われる
  }
};
```

### export タイプ

エクスポートフォーマットを追加するプラグインです。

```javascript
// main.js
module.exports = {
  onload(api) {
    // Slack形式のエクスポート
    api.registerExportFormat({
      id: 'slack',
      name: 'Slack',
      description: 'Slack投稿用フォーマット',
      generate(logs, boardData) {
        const today = new Date().toLocaleDateString('ja-JP');
        let output = `:calendar: *日報 ${today}*\n\n`;

        output += ':clipboard: *今日の活動:*\n';
        logs.forEach(log => {
          const time = new Date(log.timestamp).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
          });
          output += `• \`${time}\` ${log.cardTitle}\n`;
        });

        // ボードのカード情報を追加
        const cards = Object.values(boardData.cards || {});
        if (cards.length > 0) {
          output += '\n:pushpin: *ボード項目:*\n';
          cards.forEach(card => {
            output += `• ${card.title}\n`;
          });
        }

        return output;
      }
    });

    // 複数フォーマットの登録も可能
    api.registerExportFormat({
      id: 'csv',
      name: 'CSV',
      description: 'カンマ区切り形式',
      generate(logs, boardData) {
        let csv = 'timestamp,cardTitle,columnId\n';
        logs.forEach(log => {
          csv += `${log.timestamp},${log.cardTitle},${log.columnId}\n`;
        });
        return csv;
      }
    });
  },

  onunload() {
    console.log('Export plugin unloaded');
    // 登録解除は自動で行われる
  }
};
```

**manifest.json**
```json
{
  "id": "my-export-formats",
  "name": "My Export Formats",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "カスタムエクスポートフォーマット",
  "author": "Your Name",
  "type": "export"
}
```

### utility タイプ

汎用的なユーティリティプラグインです。

```javascript
// main.js
module.exports = {
  onload(api) {
    api.log('Utility plugin loaded');

    // 設定を使用
    const settings = api.getSettings();
    if (!settings.initialized) {
      api.saveSettings({ initialized: true, count: 0 });
    }
  },

  onunload() {
    console.log('Utility plugin unloaded');
  }
};
```

---

## 動作確認ガイド

プラグインを開発した後、以下の手順で動作確認を行います。

### ステップ 1: ローカル開発環境のセットアップ

```bash
# AtelierX を開発モードで起動
npm run electron:dev
```

### ステップ 2: プラグインを配置

開発中のプラグインを `plugins-dev` ディレクトリにコピーします:

```bash
# プロジェクトルートで実行
cp -r /path/to/your-plugin plugins-dev/
```

または、直接プラグインディレクトリにコピー:

```bash
# macOS
cp -r /path/to/your-plugin ~/Library/Application\ Support/AtelierX/plugins/
```

### ステップ 3: プラグインの有効化

1. アプリで `Cmd + ,` を押して設定画面を開く
2. 「プラグイン」タブを選択
3. プラグイン一覧から開発中のプラグインを探す
4. 「有効化」ボタンをクリック

### ステップ 4: 機能の確認

#### grid-layout タイプの場合

1. メイン画面で「Grid」ボタン（グリッドアイコン）をクリック
2. グリッド整列モーダルが開く
3. プラグインのレイアウトがプリセット一覧に表示されることを確認
4. レイアウトを選択して適用できることを確認

#### export タイプの場合

1. メイン画面で「Export」ボタン（ダウンロードアイコン）をクリック
2. エクスポートモーダルが開く
3. プラグインのエクスポートフォーマットがボタンとして表示されることを確認
4. フォーマットをクリックしてエクスポート内容が生成されることを確認
5. 「Copy to Clipboard」または「Save to File」が機能することを確認

### ステップ 5: 無効化の確認

1. 設定画面でプラグインを「無効化」
2. 機能が消えることを確認:
   - grid-layout: プリセット一覧からレイアウトが消える
   - export: フォーマットボタンが消える

### ステップ 6: コンソールエラーの確認

1. `Cmd + Option + I` で開発者ツールを開く
2. Console タブでエラーがないことを確認
3. プラグインのログ（`[Plugin:your-plugin-id]`）が正常に出力されていることを確認

### 確認チェックリスト

#### 全プラグイン共通

- [ ] プラグインが設定画面に表示される
- [ ] 有効化/無効化が正常に動作する
- [ ] コンソールにエラーが出ない
- [ ] `[Plugin:xxx] Plugin loaded` ログが出力される

#### grid-layout タイプ

- [ ] グリッドモーダルにレイアウトが表示される
- [ ] レイアウトを選択・適用できる
- [ ] 無効化後、レイアウトが一覧から消える

#### export タイプ

- [ ] エクスポートモーダルにフォーマットボタンが表示される
- [ ] フォーマット選択でコンテンツが生成される
- [ ] 生成コンテンツが期待通りの形式である
- [ ] クリップボードコピーが動作する
- [ ] ファイル保存が動作する
- [ ] 無効化後、フォーマットボタンが消える

### トラブルシューティング

| 症状 | 確認ポイント | 解決策 |
|------|-------------|--------|
| プラグインが一覧に表示されない | `manifest.json` の形式 | 必須フィールド（id, name, version, description, author）を確認 |
| 有効化してもレイアウト/フォーマットが出ない | `main.js` の `onload` | `api.registerGridLayout()` や `api.registerExportFormat()` が呼ばれているか確認 |
| エクスポートで空の内容が出る | `generate` 関数 | 関数が文字列を返しているか確認。`boardData.cards`（`boardData.items` ではない）を使用 |
| `log.text is undefined` エラー | データ構造 | `log.text` ではなく `log.cardTitle` を使用 |
| 無効化しても機能が残る | `onunload` | 手動で登録解除が必要な場合は `onunload` で処理 |

---

## デバッグ方法

### ログの確認

Electron の開発者ツールでログを確認できます。

1. アプリを開発モードで起動: `npm run electron:dev`
2. `Cmd + Option + I` で開発者ツールを開く
3. Console タブでログを確認

### プラグインディレクトリの確認

プラグインは以下のディレクトリにインストールされます:

```
macOS:   ~/Library/Application Support/AtelierX/plugins/
Windows: %APPDATA%/AtelierX/plugins/
Linux:   ~/.config/AtelierX/plugins/
```

### よくあるエラー

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `manifest.json not found` | manifest.json がない | ファイルを作成 |
| `Invalid manifest` | 必須フィールドがない | id, name, version, description, author を確認 |
| `Plugin not found` | main.js がない | main.js を作成 |
| `onload is not a function` | エクスポートが正しくない | `module.exports = { onload, onunload }` 形式を使用 |

---

## 公開方法

### 1. GitHubリポジトリを作成

- リポジトリ名は分かりやすいものにする（例: `atelierx-grid-layouts`）
- README.md にプラグインの説明を書く
- LICENSE ファイルを追加（MIT推奨）

### 2. 必須ファイルを配置

```
my-plugin/
├── manifest.json    # 必須
├── main.js          # 必須
├── README.md        # 推奨
└── LICENSE          # 推奨
```

### 3. リリースタグを作成（オプション）

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. ユーザーへの案内

README.md に以下のインストール方法を記載:

```markdown
## インストール

1. AtelierX を開く
2. `Cmd + ,` で設定を開く
3. 「プラグイン」タブを選択
4. `your-username/your-plugin-repo` を入力
5. 「インストール」をクリック
```

---

## ベストプラクティス

### 命名規則

- **プラグインID**: 小文字、ハイフン区切り（例: `my-grid-layouts`）
- **リポジトリ名**: `atelierx-` プレフィックス推奨（例: `atelierx-grid-layouts`）

### バージョニング

セマンティックバージョニングを使用:

- `MAJOR.MINOR.PATCH`
- 例: `1.0.0` → `1.0.1`（バグ修正）→ `1.1.0`（機能追加）→ `2.0.0`（破壊的変更）

### エラーハンドリング

```javascript
module.exports = {
  onload(api) {
    try {
      // 初期化処理
      api.registerGridLayout({ ... });
    } catch (error) {
      api.error('Failed to initialize:', error.message);
    }
  }
};
```

### 設定のデフォルト値

```javascript
module.exports = {
  onload(api) {
    const settings = api.getSettings();

    // デフォルト値をマージ
    const config = {
      enabled: true,
      padding: 5,
      ...settings
    };

    // 初回のみ保存
    if (Object.keys(settings).length === 0) {
      api.saveSettings(config);
    }
  }
};
```

### クリーンアップ

```javascript
let intervalId;

module.exports = {
  onload(api) {
    // インターバルを開始
    intervalId = setInterval(() => {
      api.log('tick');
    }, 1000);
  },

  onunload() {
    // 必ずクリーンアップ
    if (intervalId) {
      clearInterval(intervalId);
    }
  }
};
```

---

## サンプルプラグイン

### minimal-plugin（最小構成）

```
minimal-plugin/
├── manifest.json
└── main.js
```

**manifest.json**
```json
{
  "id": "minimal-plugin",
  "name": "Minimal Plugin",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "最小構成のサンプルプラグイン",
  "author": "Your Name"
}
```

**main.js**
```javascript
module.exports = {
  onload(api) {
    api.log('Hello from minimal plugin!');
  },
  onunload() {}
};
```

### grid-layouts-plugin（グリッドレイアウト）

```
grid-layouts-plugin/
├── manifest.json
├── main.js
└── README.md
```

**manifest.json**
```json
{
  "id": "custom-grid-layouts",
  "name": "Custom Grid Layouts",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "カスタムグリッドレイアウトプリセット集",
  "author": "Your Name",
  "type": "grid-layout"
}
```

**main.js**
```javascript
const layouts = [
  {
    id: 'dev-setup',
    name: '開発セットアップ',
    description: 'IDE + ターミナル + ブラウザ',
    cols: 3,
    rows: 1,
    padding: 5
  },
  {
    id: 'dual-monitor',
    name: 'デュアルモニター',
    description: '左右2分割',
    cols: 2,
    rows: 1,
    padding: 10
  },
  {
    id: 'quad',
    name: '4分割',
    description: '2x2 グリッド',
    cols: 2,
    rows: 2,
    padding: 5
  }
];

module.exports = {
  onload(api) {
    layouts.forEach(layout => {
      api.registerGridLayout(layout);
    });
    api.log(`Registered ${layouts.length} layouts`);
  },

  onunload() {
    console.log('Grid layouts plugin unloaded');
  }
};
```

---

## 将来の拡張予定

以下の機能は将来のバージョンで追加予定です:

- [ ] UI コンポーネント登録 API
- [ ] コマンドパレット登録
- [ ] カスタム設定画面
- [ ] プラグイン間通信
- [ ] ホットリロード対応

---

## サポート・貢献

- **バグ報告**: [Issues](https://github.com/your-repo/atelierx/issues)
- **機能要望**: [Discussions](https://github.com/your-repo/atelierx/discussions)
- **貢献**: プルリクエスト歓迎

---

*Last updated: 2025-01*
