# カンバンボード アプリケーション仕様書

## 概要
タスク管理用のカンバンボードアプリケーション。作業中のターミナルウィンドウやFinderでの作業などをカードとして管理し、進捗状況を視覚的に把握できる。

## 機能要件

### 1. カラム（列）管理
- デフォルトカラム: 「未着手」「実行中」「完了」
- カラムの追加・削除・名前変更が可能
- カラム間でカードをドラッグ＆ドロップで移動

### 2. カード管理
- カードの作成（タイトル、説明、タグ）
- カードの編集・削除
- カードにラベル/タグ付け（例: Terminal, Finder, Browser等）
- ドラッグ＆ドロップでカラム間移動

### 3. データ永続化
- ローカルストレージに保存
- ブラウザを閉じても状態を保持

## 技術スタック
- **フレームワーク**: React + TypeScript
- **スタイリング**: CSS (モダンなデザイン)
- **ドラッグ＆ドロップ**: @dnd-kit/core
- **状態管理**: React useState/useReducer
- **ビルドツール**: Vite

## UI/UXデザイン
- ダークモード対応のモダンなデザイン
- 直感的なドラッグ＆ドロップ操作
- レスポンシブデザイン

## ファイル構成（予定）
```
kanban_app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Board.tsx
│   │   ├── Column.tsx
│   │   ├── Card.tsx
│   │   └── AddCardModal.tsx
│   ├── types/
│   │   └── index.ts
│   ├── hooks/
│   │   └── useLocalStorage.ts
│   └── styles/
│       └── App.css
└── SPECIFICATION.md
```
