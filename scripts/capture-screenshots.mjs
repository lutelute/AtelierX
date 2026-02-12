#!/usr/bin/env node

// AtelierX Screenshot Capture Script
// Playwright で Electron アプリを起動し、各機能のスクリーンショットをキャプチャ
// Usage: node scripts/capture-screenshots.mjs

import { _electron as electron } from 'playwright';
import { spawn, execSync } from 'child_process';
import { createConnection } from 'net';
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'docs', 'assets');

const SCREENSHOTS = {
  board: 'screenshot-board.png',
  terminalNaming: 'screenshot-terminal-naming.png',
  terminalColor: 'screenshot-terminal-color.png',
  terminalColorGif: 'demo-terminal-color.gif',
  timerPulseGif: 'demo-timer-pulse.gif',
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
            description: `⏱ 2025-01-15 14:30開始\n- [/] GitHub Actions 設定\n- [ ] デプロイ自動化`,
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

// 5. タイマー開始→パルス GIF（右クリック→コンテキストメニュー表示→カード点滅）
async function captureTimerDemoGif(page) {
  await page.keyboard.press('Escape');
  await wait(300);

  // card-demo-1 はタイマー未開始のカード
  const card = page.locator('[data-card-id="card-demo-1"]');
  if (!await card.isVisible()) {
    console.log('  [skip] Timer demo card not found');
    return;
  }

  const tmpDir = path.join(ASSETS_DIR, '.tmp-timer-frames');
  mkdirSync(tmpDir, { recursive: true });

  let frame = 0;
  const fps = 12;
  const interval = Math.round(1000 / fps);

  // キャプチャ用のクリップ領域を決定（カードの周辺 + コンテキストメニュー分の余白）
  const cardBox = await card.boundingBox();
  const clip = {
    x: Math.max(0, cardBox.x - 15),
    y: Math.max(0, cardBox.y - 15),
    width: Math.min(420, cardBox.width + 180),
    height: Math.min(500, cardBox.height + 250),
  };

  const captureFrame = async () => {
    await page.screenshot({
      path: path.join(tmpDir, `frame-${String(frame++).padStart(3, '0')}.png`),
      clip,
    });
  };

  // Phase 1: カード通常表示（0.5秒 = ~6フレーム）
  for (let i = 0; i < 6; i++) {
    await captureFrame();
    await wait(interval);
  }

  // Phase 2: タスクを右クリック → コンテキストメニュー表示
  const taskItem = card.locator('.task-item').first();
  await taskItem.click({ button: 'right' });
  await wait(400);

  // Phase 3: コンテキストメニュー表示中（1.2秒 = ~14フレーム）
  for (let i = 0; i < 14; i++) {
    await captureFrame();
    await wait(interval);
  }

  // Phase 4: メニューを閉じてから、evaluate でタイマー開始状態をシミュレート
  //（UIボタンは条件により disabled の場合があるため、直接データを更新してパルスを発動）
  await page.keyboard.press('Escape');
  await wait(200);

  // localStorage のカードデータに ⏱ マーカーを追加 → パルス発動
  await page.evaluate(() => {
    const raw = localStorage.getItem('kanban-all-boards');
    if (!raw) return;
    const data = JSON.parse(raw);
    const card = data.boards?.terminal?.cards?.['card-demo-1'];
    if (card) {
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      card.description = `⏱ ${ts}開始\n${card.description}`;
      card.statusMarker = '/';
      localStorage.setItem('kanban-all-boards', JSON.stringify(data));
    }
  });

  // リロードしてパルスアニメーションを表示
  await page.reload();
  await page.waitForSelector('.board', { timeout: 15000 });
  await wait(1000);

  // clip を再計算（リロード後にカード位置が変わる可能性）
  const cardAfter = page.locator('[data-card-id="card-demo-1"]');
  await cardAfter.waitFor({ timeout: 5000 });
  const cardBox2 = await cardAfter.boundingBox();
  const clip2 = {
    x: Math.max(0, cardBox2.x - 15),
    y: Math.max(0, cardBox2.y - 15),
    width: Math.min(420, cardBox2.width + 30),
    height: Math.min(300, cardBox2.height + 30),
  };

  const captureFrame2 = async () => {
    await page.screenshot({
      path: path.join(tmpDir, `frame-${String(frame++).padStart(3, '0')}.png`),
      clip: clip2,
    });
  };

  // Phase 5: パルスアニメーション（4秒 = ~48フレーム、2サイクル分）
  for (let i = 0; i < 48; i++) {
    await captureFrame2();
    await wait(interval);
  }

  const gifPath = path.join(ASSETS_DIR, SCREENSHOTS.timerPulseGif);

  try {
    execSync(
      `ffmpeg -y -framerate ${fps} -i "${tmpDir}/frame-%03d.png" ` +
      `-vf "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" ` +
      `-loop 0 "${gifPath}"`,
      { stdio: 'pipe', timeout: 30000 }
    );
    console.log(`  -> ${SCREENSHOTS.timerPulseGif}`);
  } catch (e) {
    console.log(`  [error] ffmpeg timer GIF failed: ${e.message}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 6. Terminal Color GIF（色が変わるアニメーション）
async function captureTerminalColorGif() {
  if (process.platform !== 'darwin') {
    console.log('  [skip] Terminal color demo is macOS only');
    return;
  }

  const tmpDir = path.join(ASSETS_DIR, '.tmp-tc-frames');
  mkdirSync(tmpDir, { recursive: true });

  const captureRegion = '30,30,1030,630';
  let frame = 0;

  const captureFrame = (count = 1) => {
    for (let i = 0; i < count; i++) {
      execSync(
        `screencapture -x -R${captureRegion} "${tmpDir}/frame-${String(frame++).padStart(3, '0')}.png"`,
        { timeout: 5000 }
      );
    }
  };

  const runAS = (script) => {
    const tmp = path.join(ASSETS_DIR, '.tmp-as.applescript');
    writeFileSync(tmp, script);
    try {
      return execSync(`osascript "${tmp}"`, { timeout: 15000 }).toString().trim();
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  };

  const tmpBase = '/tmp/atelierx-demo';

  try {
    // 4つのTerminalウィンドウを開く（デフォルト色）
    // タイトルバーのユーザー名を回避するため、/tmp にデモ用ディレクトリを作成して cd
    const names = ['api-server', 'frontend', 'database', 'ci-runner'];

    // デモ用ディレクトリを作成
    execSync(`mkdir -p ${names.map(n => `"${tmpBase}/${n}"`).join(' ')}`, { timeout: 5000 });

    // ウィンドウを開くスクリプトを構築
    const openLines = [
      'tell application "Terminal"',
      '  activate',
      '  delay 0.3',
    ];

    const positions = [
      '{40, 45, 530, 335}',
      '{540, 45, 1030, 335}',
      '{40, 345, 530, 635}',
      '{540, 345, 1030, 635}',
    ];

    // 各ウィンドウのセットアップスクリプトを事前にファイルに書き出す
    for (const name of names) {
      const script = [
        `cd ${tmpBase}/${name}`,
        `PS1='${name} > '`,
        'unfunction precmd preexec 2>/dev/null',
        `precmd(){ printf '\\033]0;${name}\\007'; }`,
        'clear',
      ].join('\n');
      writeFileSync(`${tmpBase}/setup-${name}.sh`, script);
    }

    for (let i = 0; i < names.length; i++) {
      // source でスクリプト実行 → エコーされず、clear でクリーンに
      openLines.push(`  do script "source ${tmpBase}/setup-${names[i]}.sh"`);
      openLines.push('  delay 1.0');
      openLines.push(`  set bounds of front window to ${positions[i]}`);
      openLines.push(`  set custom title of selected tab of front window to "${names[i]}"`);
      openLines.push('  set title displays custom title of selected tab of front window to true');
      openLines.push('  set title displays shell path of selected tab of front window to false');
      openLines.push('  set title displays window size of selected tab of front window to false');
      openLines.push('  set title displays device name of selected tab of front window to false');
      openLines.push(`  set w${i + 1} to id of front window`);
    }

    openLines.push('  delay 1.0');
    openLines.push('  return (w1 as text) & ", " & (w2 as text) & ", " & (w3 as text) & ", " & (w4 as text)');
    openLines.push('end tell');

    const openResult = runAS(openLines.join('\n'));

    await wait(500);

    // Phase 1: デフォルト色で表示（0.5秒 = 6フレーム @12fps）
    captureFrame(6);

    // Phase 2-5: 1つずつ色を適用（各ウィンドウ適用後に4フレームキャプチャ）
    const colors = [
      { label: 'Ocean',  bg: '{3084, 6682, 14906}',  fg: '{55000, 58000, 62000}' },
      { label: 'Forest', bg: '{3598, 12850, 6425}',   fg: '{55000, 62000, 55000}' },
      { label: 'Sunset', bg: '{16448, 7967, 2827}',   fg: '{62000, 58000, 55000}' },
      { label: 'Berry',  bg: '{11308, 4112, 15163}',  fg: '{58000, 55000, 62000}' },
    ];

    const ids = openResult.split(', ').filter(s => /^\d+$/.test(s)).map(Number);

    for (let i = 0; i < colors.length && i < ids.length; i++) {
      const { bg, fg } = colors[i];
      runAS([
        'tell application "Terminal"',
        `  set targetWindow to window id ${ids[i]}`,
        `  set background color of selected tab of targetWindow to ${bg}`,
        `  set normal text color of selected tab of targetWindow to ${fg}`,
        'end tell',
      ].join('\n'));
      await wait(400);
      captureFrame(5);
    }

    // Phase 6: 最終状態をホールド（1秒 = 12フレーム）
    captureFrame(12);

    // GIF変換（タイトルバー領域にぼかし処理を適用してユーザー情報を隠す）
    // Retina 2x: キャプチャ 2060x1260、タイトルバー上段 y≈10 h≈70、下段 y≈636 h≈70
    const gifPath = path.join(ASSETS_DIR, SCREENSHOTS.terminalColorGif);
    const blurFilter = [
      'split[m1][t1]',
      '[t1]crop=iw:70:0:10,gblur=sigma=30,gblur=sigma=30,gblur=sigma=30[b1]',
      '[m1][b1]overlay=0:10[v1]',
      '[v1]split[m2][t2]',
      '[t2]crop=iw:70:0:636,gblur=sigma=30,gblur=sigma=30,gblur=sigma=30[b2]',
      '[m2][b2]overlay=0:636[v2]',
      '[v2]scale=720:-1:flags=lanczos,split[s0][s1]',
      '[s0]palettegen=max_colors=128[p]',
      '[s1][p]paletteuse=dither=bayer',
    ].join(';');
    execSync(
      `ffmpeg -y -framerate 12 -i "${tmpDir}/frame-%03d.png" ` +
      `-filter_complex "${blurFilter}" ` +
      `-loop 0 "${gifPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log(`  -> ${SCREENSHOTS.terminalColorGif}`);

    // 開いたTerminalウィンドウを閉じる
    for (const id of ids) {
      try {
        execSync(
          `osascript -e 'tell application "Terminal"' -e 'close window id ${id}' -e 'end tell'`,
          { timeout: 5000, stdio: 'pipe' }
        );
      } catch {}
    }
  } catch (e) {
    console.log(`  [error] Terminal color GIF: ${e.message}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(tmpBase, { recursive: true, force: true });
  }
}

// 6. Help モーダルの各タブ
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
    console.log('[1/9] Vite dev server');
    viteProcess = await ensureViteServer();

    console.log('[2/9] Launching Electron (with sample data)...');
    const result = await launchElectron();
    electronApp = result.electronApp;
    const page = result.page;

    console.log('[3/9] Capturing main board...');
    await captureBoard(page);

    console.log('[4/9] Capturing terminal naming...');
    await captureTerminalNaming(page);

    console.log('[5/9] Capturing terminal color menu...');
    await captureTerminalColor(page);

    console.log('[6/9] Capturing timer start → pulse GIF...');
    await captureTimerDemoGif(page);

    console.log('[7/9] Capturing multi-window card...');
    await captureMultiWindow(page);

    console.log('[8/9] Capturing Help modal tabs...');
    await captureHelpTabs(page);

    // Electron を閉じてから Terminal デモを実行（ウィンドウ干渉を回避）
    await electronApp.close().catch(() => {});
    electronApp = null;

    console.log('[9/9] Capturing Terminal color GIF (real Terminal.app)...');
    await captureTerminalColorGif();

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
