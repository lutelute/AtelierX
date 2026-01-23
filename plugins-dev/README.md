# プラグイン開発ディレクトリ

このディレクトリでプラグインを開発・テストできます。

## 構造

```
plugins-dev/
├── README.md           # このファイル
├── install-local.sh    # ローカルインストールスクリプト
└── hello-plugin/       # サンプルプラグイン
    ├── manifest.json
    └── main.js
```

## 開発ワークフロー

### 1. 新しいプラグインを作成

```bash
mkdir my-plugin
cd my-plugin
```

### 2. manifest.json を作成

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "プラグインの説明",
  "author": "Your Name",
  "type": "grid-layout"
}
```

### 3. main.js を作成

```javascript
module.exports = {
  onload(api) {
    api.log('プラグイン読み込み');

    // 機能を追加
    api.registerGridLayout({
      id: 'my-layout',
      name: 'マイレイアウト',
      cols: 2,
      rows: 2,
      padding: 5
    });
  },

  onunload() {
    console.log('プラグイン終了');
  }
};
```

### 4. ローカルインストール

```bash
./install-local.sh my-plugin
```

### 5. テスト

1. AtelierX を再起動（または `Cmd + R` でリロード）
2. `Cmd + ,` で設定を開く
3. プラグインタブで有効化
4. 動作確認

### 6. 修正 → 再インストール → テスト

コードを修正したら:

```bash
./install-local.sh my-plugin
# AtelierX を再起動
```

## デバッグ

### ログの確認

1. `Cmd + Option + I` で開発者ツールを開く
2. Console タブでログを確認

### インストール先の確認

```bash
ls -la ~/Library/Application\ Support/AtelierX/plugins/
```

### プラグインを削除

```bash
rm -rf ~/Library/Application\ Support/AtelierX/plugins/my-plugin
```

## 注意事項

- プラグインを修正したら必ず再インストールが必要
- アプリの再起動で変更が反映される
- `plugins.json` を手動で編集しないこと
