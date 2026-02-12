#!/usr/bin/env node

// AtelierX Screenshot Capture Script
// Playwright で Electron アプリを起動し、各機能のスクリーンショットをキャプチャ
// Usage: node scripts/capture-screenshots.mjs

import { _electron as electron } from 'playwright';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'docs', 'assets');

const SCREENSHOTS = {
  board: 'screenshot-board.png',
  terminalNaming: 'screenshot-terminal-naming.png',
  terminalColor: 'screenshot-terminal-color.png',
  multiWindow: 'screenshot-multi-window.png',
  helpOverview: 'screenshot-help-overview.png',
  helpFeatures: 'screenshot-help-features.png',
  helpPlugins: 'screenshot-help-plugins.png',
  helpShortcuts: 'screenshot-help-shortcuts.png',
};

// サンプルボードデータ（デモ用）
function createSampleBoardData() {
  const now = Date.now();
  return {
    boards: {
      terminal: {
        columns: [
          { id: 'todo', title: '未着手', cardIds: ['card-demo-1', 'card-demo-2'], color: '#9ca3af' },
          { id: 'in-progress', title: '実行中', cardIds: ['card-demo-3', 'card-demo-4'], color: '#3b82f6' },
          { id: 'done', title: '完了', cardIds: ['card-demo-5'], color: '#22c55e' },
        ],
        cards: {
          'card-demo-1': {
            id: 'card-demo-1',
            title: 'API サーバー構築',
            description: '- [ ] エンドポイント設計\n- [ ] DB スキーマ作成\n- [ ] 認証ミドルウェア',
            tag: 'terminal',
            createdAt: now - 86400000,
            windowApp: 'Terminal',
            windowName: 'api-server — zsh',
            windows: [{ app: 'Terminal', id: 'win-1', name: 'api-server — zsh' }],
          },
          'card-demo-2': {
            id: 'card-demo-2',
            title: 'デザインレビュー資料',
            description: '- [ ] Figma リンクまとめ\n- [ ] フィードバック整理',
            tag: 'terminal',
            createdAt: now - 172800000,
          },
          'card-demo-3': {
            id: 'card-demo-3',
            title: 'フロントエンド開発',
            description: '- [/] コンポーネント実装\n- [/] API 連携\n- [ ] テスト追加',
            tag: 'terminal',
            statusMarker: '/',
            createdAt: now - 43200000,
            windowApp: 'Terminal',
            windowName: 'frontend-dev — node',
            windows: [
              { app: 'Terminal', id: 'win-2', name: 'frontend-dev — node' },
              { app: 'Terminal', id: 'win-3', name: 'frontend-test — vitest' },
              { app: 'Finder', id: 'win-4', name: 'src/components' },
            ],
          },
          'card-demo-4': {
            id: 'card-demo-4',
            title: 'CI/CD パイプライン',
            description: '- [/] GitHub Actions 設定\n- [ ] デプロイ自動化',
            tag: 'terminal',
            statusMarker: '/',
            priority: 'high',
            createdAt: now - 21600000,
            windowApp: 'Terminal',
            windowName: 'ci-debug — zsh',
            windows: [{ app: 'Terminal', id: 'win-5', name: 'ci-debug — zsh' }],
          },
          'card-demo-5': {
            id: 'card-demo-5',
            title: 'README 更新',
            description: '- [x] Features セクション\n- [x] スクリーンショット追加',
            tag: 'terminal',
            statusMarker: 'x',
            createdAt: now - 3600000,
            completedAt: now - 1800000,
          },
        },
        columnOrder: ['todo', 'in-progress', 'done'],
      },
      finder: {
        columns: [
          { id: 'todo', title: '未着手', cardIds: [], color: '#9ca3af' },
          { id: 'in-progress', title: '実行中', cardIds: [], color: '#3b82f6' },
          { id: 'done', title: '完了', cardIds: [], color: '#22c55e' },
        ],
        cards: {},
        columnOrder: ['todo', 'in-progress', 'done'],
      },
    },
    ideas: [],
  };
}

// ポートが使用中かチェック
function isPortInUse(port) {
  return new Promise((resolve) => {
    const conn = createConnection({ port }, () => {
      conn.end();
      resolve(true);
    });
    conn.on('error', () => resolve(false));
  });
}

// Vite dev server を起動（未起動の場合のみ）
async function ensureViteServer() {
  if (await isPortInUse(5173)) {
    console.log('  Vite dev server is already running on :5173');
    return null;
  }

  console.log('  Starting Vite dev server...');
  const vite = spawn('npx', ['vite'], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    env: { ...process.env },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite startup timed out (30s)')), 30000);
    vite.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('localhost:5173') || text.includes('Local:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    vite.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('localhost:5173') || text.includes('Local:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    vite.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  await new Promise((r) => setTimeout(r, 1000));
  return vite;
}

// Electron アプリを Playwright で起動（サンプルデータ注入）
async function launchElectron() {
  const electronApp = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'electron', 'main.cjs')],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  const page = await electronApp.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 });

  // サンプルデータを注入してリロード
  const sampleData = createSampleBoardData();
  await page.evaluate((data) => {
    localStorage.setItem('kanban-all-boards', JSON.stringify(data));
  }, sampleData);
  await page.reload();

  // ボードが描画されるまで待機
  await page.waitForSelector('.board', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));

  return { electronApp, page };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. メインボード（名前付きターミナルカード入り）
async function captureBoard(page) {
  await page.screenshot({
    path: path.join(ASSETS_DIR, SCREENSHOTS.board),
  });
  console.log(`  -> ${SCREENSHOTS.board}`);
}

// 2. ターミナル名前付け — カードが名前付きターミナルとして表示
async function captureTerminalNaming(page) {
  // ボード全体をキャプチャ（カードに Terminal 名が表示されている状態）
  await page.screenshot({
    path: path.join(ASSETS_DIR, SCREENSHOTS.terminalNaming),
  });
  console.log(`  -> ${SCREENSHOTS.terminalNaming}`);
}

// 3. Terminal 色メニュー
async function captureTerminalColor(page) {
  // カラーメニューボタンをクリック
  const colorBtn = page.locator('.nav-action-term-color');
  if (await colorBtn.isVisible()) {
    await colorBtn.click();
    await wait(400);
    await page.screenshot({
      path: path.join(ASSETS_DIR, SCREENSHOTS.terminalColor),
    });
    console.log(`  -> ${SCREENSHOTS.terminalColor}`);
    // メニューを閉じる（Escapeでカードクリックを避ける）
    await page.keyboard.press('Escape');
    await wait(300);
  } else {
    console.log('  [skip] Terminal color menu not visible (non-macOS?)');
  }
}

// 4. 複数ウィンドウ紐づけカード
async function captureMultiWindow(page) {
  // まずモーダルが開いていたら閉じる
  await page.keyboard.press('Escape');
  await wait(300);

  // card-demo-3 は3つのウィンドウを持つ → そのカードをキャプチャ
  const card = page.locator('[data-card-id="card-demo-3"]');
  if (await card.isVisible()) {
    await card.screenshot({
      path: path.join(ASSETS_DIR, SCREENSHOTS.multiWindow),
    });
    console.log(`  -> ${SCREENSHOTS.multiWindow}`);
  } else {
    console.log('  [skip] Multi-window card not found');
  }
}

// 5. Help モーダルの各タブ
async function captureHelpTabs(page) {
  await page.click('.sidebar-btn[title="ヘルプ"]');
  await page.waitForSelector('.help-modal', { timeout: 5000 });
  await wait(500);

  const tabCaptures = [
    { label: '概要', file: SCREENSHOTS.helpOverview },
    { label: '機能一覧', file: SCREENSHOTS.helpFeatures },
    { label: 'プラグイン', file: SCREENSHOTS.helpPlugins },
    { label: 'ショートカット', file: SCREENSHOTS.helpShortcuts },
  ];

  for (const { label, file } of tabCaptures) {
    await page.click(`.help-tab:has-text("${label}")`);
    await wait(300);

    const modal = page.locator('.help-modal');
    await modal.screenshot({
      path: path.join(ASSETS_DIR, file),
    });
    console.log(`  -> ${file}`);
  }

  // モーダルを閉じる（overlayクリック or Escape）
  await page.keyboard.press('Escape');
  await wait(300);
}

// メイン処理
async function main() {
  let viteProcess = null;
  let electronApp = null;

  try {
    console.log('[1/7] Vite dev server');
    viteProcess = await ensureViteServer();

    console.log('[2/7] Launching Electron (with sample data)...');
    const result = await launchElectron();
    electronApp = result.electronApp;
    const page = result.page;

    console.log('[3/7] Capturing main board...');
    await captureBoard(page);

    console.log('[4/7] Capturing terminal naming...');
    await captureTerminalNaming(page);

    console.log('[5/7] Capturing terminal color menu...');
    await captureTerminalColor(page);

    console.log('[6/7] Capturing multi-window card...');
    await captureMultiWindow(page);

    console.log('[7/7] Capturing Help modal tabs...');
    await captureHelpTabs(page);

    console.log('');
    console.log('All screenshots captured successfully!');
    console.log(`Output: ${ASSETS_DIR}/`);
    Object.values(SCREENSHOTS).forEach((f) => console.log(`  - ${f}`));
  } catch (error) {
    console.error('Screenshot capture failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
    if (viteProcess) {
      viteProcess.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

main();
