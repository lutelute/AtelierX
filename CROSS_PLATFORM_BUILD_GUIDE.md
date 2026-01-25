# AtelierX Cross-Platform Build Guide

## 実装ステータス ✓ 完了

Windows/Linux用のビルドスクリプトと設定がpackage.jsonに追加されました。

## 追加されたスクリプト

| スクリプト | 説明 | 出力 |
|-----------|------|------|
| `npm run electron:build:win` | Windows用ビルド | release/*.exe (NSISインストーラー) |
| `npm run electron:build:linux` | Linux用ビルド | release/*.AppImage, release/*.deb |
| `npm run electron:build:all` | 全プラットフォーム | release/に全プラットフォーム用ファイル |

## 検証方法

### 方法1: macOSからのクロスビルド（お勧め）

macOS上でWindows/Linux向けにビルドできます。

```bash
# 1. Linuxビルド（macOSから直接実行可能）
npm run electron:build:linux

# 成功確認: release/ディレクトリに以下が生成される
# - AtelierX-1.0.0.AppImage
# - atelierx_1.0.0_amd64.deb
```

```bash
# 2. Windowsビルド（Wine必要）
# まずWineをインストール（初回のみ）
brew install --cask wine-stable

# ビルド実行
npm run electron:build:win

# 成功確認: release/ディレクトリに以下が生成される
# - AtelierX Setup 1.0.0.exe
```

### 方法2: ネイティブプラットフォームでのビルド

最も確実な方法は、各プラットフォームで直接ビルドすることです。

**Windows PC/VM上で:**
```bash
git clone <repository>
cd AtelierX
npm install
npm run electron:build:win

# 出力: release/AtelierX Setup 1.0.0.exe
```

**Linux PC/VM上で:**
```bash
git clone <repository>
cd AtelierX
npm install
npm run electron:build:linux

# 出力: release/AtelierX-1.0.0.AppImage
# 出力: release/atelierx_1.0.0_amd64.deb
```

### 方法3: GitHub Actionsを使用（将来的な自動化）

CI/CDで自動ビルドを設定することも可能です。これは別途実装が必要です。

## 検証チェックリスト

### Linuxビルド検証
- [ ] `npm run electron:build:linux` がエラーなく完了
- [ ] `release/AtelierX-1.0.0.AppImage` が生成される
- [ ] Linux環境でAppImageをダブルクリックして起動できる
- [ ] アプリが正常に動作する

### Windowsビルド検証
- [ ] `npm run electron:build:win` がエラーなく完了
- [ ] `release/AtelierX Setup 1.0.0.exe` が生成される
- [ ] Windows環境でインストーラーを実行できる
- [ ] インストール後、アプリが起動する
- [ ] アプリが正常に動作する

## 注意事項

### アイコンについて
- **macOS**: `build/icon.icns` ✓ 存在
- **Windows**: `build/icon.ico` ⚠️ 未作成（デフォルトElectronアイコン使用）
- **Linux**: 自動生成（icnsから変換）

カスタムWindowsアイコンが必要な場合:
```bash
# icon.icnsからicon.icoを生成（要ImageMagick）
brew install imagemagick
convert build/icon.icns build/icon.ico
```

### クロスビルドの制限事項
- macOSからWindowsビルド → Wineが必要
- macOSからLinuxビルド → 追加ツール不要
- Windows/LinuxからmacOSビルド → 不可（macOS環境が必要）

## 開発方針

### 実装アプローチ
1. 既存のmacOS設定パターンに従う
2. electron-builderの標準的な設定を使用
3. 最小限の変更で実装

### 設定内容
```json
{
  "win": {
    "target": ["nsis"],
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "icon": "build/icon.png",
    "category": "Utility"
  }
}
```

### ターゲットフォーマットの選択理由
- **Windows NSIS**: 標準的なインストーラー形式、ユーザーに馴染み深い
- **Linux AppImage**: 依存関係不要のポータブル形式、多くのディストリビューションで動作
- **Linux deb**: Debian/Ubuntu系で標準的なパッケージ形式

## 今すぐ検証を開始

```bash
# 最もシンプルな検証（Linux向けビルド）
npm run electron:build:linux

# 成功すれば release/ ディレクトリにファイルが生成されます
ls -la release/
```
