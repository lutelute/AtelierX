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

> **既知の問題: DMGアップロード404エラー**
> `release.sh` でDMGアップロードが404になることがある（`gh release create`とDMGアップロードの間にタイミング問題）。
> この場合、Release作成とDMGアップロードを手動で分けて実行すること:
> ```bash
> gh release create v{VERSION} --title "v{VERSION}" --notes "リリースノート"
> gh release upload v{VERSION} release/AtelierX-{VERSION}-arm64.dmg --clobber
> ```

### CI/CD 自動ビルド
`v*` タグのpushで `.github/workflows/build.yml` が起動し、macOS/Windows/Linux の全プラットフォームでビルド→GitHub Releaseにアーティファクトを添付する。

### 手動リリース
以下の全ステップを**必ず順番通り**実行すること。

1. **package.json のバージョン更新**
2. **`npm run build`** でビルドが通ることを確認
3. **git add & commit** （変更ファイルを明示指定、`git add -A`は使わない）
4. **git push origin main**
5. **git tag v{VERSION} && git push origin v{VERSION}** でタグを作成・push（CI/CDが自動でWin/Linux/macOSの全プラットフォームビルド+Release添付を行う）
6. **`npm run electron:build:mac`** でローカルDMGをビルド
7. **先にReleaseを作成し、その後DMGをアップロード**:
   ```bash
   gh release create v{VERSION} \
     --title "v{VERSION} - タイトル" \
     --notes "リリースノート"
   gh release upload v{VERSION} release/AtelierX-{VERSION}-universal.dmg --clobber
   ```

> **注意: リリース手順のポイント**
> - DMGのアップロードを忘れないこと。コミット・pushだけではユーザーはアプリを更新できない
> - `gh release create` と `gh release upload` は**分けて実行**する（DMGが100MB超のため、createと同時だとアップロードがタイムアウトで404になることがある）
> - CI/CDの `build.yml` では `--publish never` を使い、electron-builderの自動publishを無効化している。アセットのアップロードは `softprops/action-gh-release` が担当

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
5. **`docs/USER_GUIDE.md`** - ユーザー向けの操作説明を追加
6. **`docs/DEV_GUIDE.md`** - 開発者・AI向けの技術仕様を追加
7. **「機能ドキュメント」セクションの索引テーブル** - 新機能の行を追加

> 新しいモーダルを追加する場合は、既存パターン（`mg-help-btn` + `mg-help-panel`）でヘルプパネルを付けること。

## 機能ドキュメント（人間・AI共同編集）

以下のドキュメントは人間開発者・ユーザー・AIが共同で参照・編集するための技術資料です。
**コード修正時は関連ドキュメントも必ず更新してください。**

### 総合ドキュメント

| ドキュメント | 対象 | 内容 |
|-------------|------|------|
| `docs/USER_GUIDE.md` | ユーザー向け | 全機能の使い方・操作フロー・トラブルシューティング |
| `docs/DEV_GUIDE.md` | 開発者・AI向け | 全機能のアーキテクチャ・型定義・IPC API・フック・変更チェックリスト |

### 機能別詳細ドキュメント

| ドキュメント | 対象 | 内容 |
|-------------|------|------|
| `docs/GLASS_EFFECT_USER_GUIDE.md` | ユーザー向け | ガラス効果の使い方、操作フロー、トラブルシューティング |
| `docs/GLASS_EFFECT_DEV_GUIDE.md` | 開発者・AI向け | ガラス効果のアーキテクチャ、API仕様、内部状態、変更チェックリスト |

### 全機能索引

| # | 機能 | 主要ファイル | ドキュメント |
|---|------|-------------|------------|
| 1 | カンバンボード（カード・カラム・DnD） | `Board.tsx`, `Card.tsx`, `Column.tsx`, `useCardOperations.ts` | DEV_GUIDE §フック |
| 2 | マルチタブ（アプリ切り替え） | `Board.tsx`, `useTabManagement.ts`, `TabAddPopover.tsx` | DEV_GUIDE §フック |
| 3 | ウィンドウ管理・リンク | `useWindowStatus.ts`, `windowManager.cjs`, `WindowSelectModal.tsx` | DEV_GUIDE §フック |
| 4 | 複数ウィンドウ対応 | `EditCardModal.tsx`, `types/index.ts` (WindowRef) | DEV_GUIDE §型定義 |
| 5 | Grid配置 | `GridArrangeModal.tsx`, `gridManager.cjs` | DEV_GUIDE §IPC API |
| 6 | マルチアプリGrid | `MultiGridModal.tsx`, `gridManager.cjs` | DEV_GUIDE §IPC API |
| 7 | タイマー | `useTimerActions.ts`, `Card.tsx`, `checkboxConstants.ts` | DEV_GUIDE §フック |
| 8 | ターミナル背景色（macOS） | `terminalColor.ts`, `windowManager.cjs` | DEV_GUIDE §ユーティリティ |
| 9 | ガラス効果（macOS） | `windowManager.cjs` (darwin) | GLASS_EFFECT_DEV_GUIDE.md |
| 10 | アイデア・バックログ | `IdeasPanel.tsx`, `AddIdeaModal.tsx` | USER_GUIDE §7 |
| 11 | アーカイブ | `ArchiveSection.tsx` | USER_GUIDE §8 |
| 12 | エクスポート・Obsidian連携 | `ExportModal.tsx`, `useExport.ts`, `NoteSelectModal.tsx` | USER_GUIDE §9 |
| 13 | バックアップ・復元 | `useDataPersistence.ts`, `BackupSection.tsx` | DEV_GUIDE §データフロー |
| 14 | プラグインシステム | `pluginManager.cjs`, `pluginAPI.cjs`, `PluginManager.tsx` | DEV_GUIDE §プラグイン |
| 15 | サブタグ・優先順位 | `SubtagManager.tsx`, `checkboxConstants.ts` | DEV_GUIDE §ユーティリティ |
| 16 | 設定 | `SettingsModal.tsx`, `settings/` | USER_GUIDE §12 |
| 17 | アップデート | `UpdateBanner.tsx`, `updateManager.cjs`, `VersionChecker.tsx` | DEV_GUIDE §IPC API |
| 18 | ヘルプ | `HelpModal.tsx` | USER_GUIDE §14 |

> **運用ルール**:
> - 機能のコードを変更した場合、対応するドキュメントの該当セクションを確認・更新すること
> - 新機能を追加した場合、上記の索引テーブルに行を追加すること
> - ガラス効果の詳細は専用ドキュメント（`GLASS_EFFECT_*`）を参照

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
