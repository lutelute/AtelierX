# AtelierX プラグイン開発ガイド

このガイドでは、AtelierX のプラグインを開発・公開する方法を説明します。

## 目次

1. [クイックスタート](#クイックスタート)
2. [プラグイン構造](#プラグイン構造)
3. [マニフェスト仕様](#マニフェスト仕様)
4. [プラグインAPI](#プラグインapi)
5. [ライフサイクル](#ライフサイクル)
6. [プラグインタイプ別ガイド](#プラグインタイプ別ガイド)
7. [デバッグ方法](#デバッグ方法)
8. [公開方法](#公開方法)
9. [ベストプラクティス](#ベストプラクティス)

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
