/**
 * Window Manager - Linux 実装
 * wmctrl / xdotool 経由でウィンドウ操作
 * X11 (XWayland) 対応。ネイティブ Wayland は将来対応。
 */

const { exec, execFile, spawn } = require('child_process');

/**
 * コマンドを実行して stdout を返す
 */
function run(cmd, timeout = 10000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

/**
 * コマンドが利用可能か確認
 */
function commandExists(cmd) {
  return new Promise((resolve) => {
    exec(`which ${cmd}`, (error) => {
      resolve(!error);
    });
  });
}

/**
 * 利用可能なターミナルエミュレータを自動検出
 */
async function detectTerminal() {
  const terminals = [
    'gnome-terminal', 'konsole', 'xfce4-terminal',
    'kitty', 'alacritty', 'x-terminal-emulator',
  ];
  for (const t of terminals) {
    if (await commandExists(t)) return t;
  }
  return 'xterm'; // 最終フォールバック
}

/**
 * 利用可能なファイルマネージャーを自動検出
 */
async function detectFileManager() {
  const managers = ['nautilus', 'dolphin', 'thunar', 'pcmanfm', 'nemo'];
  for (const m of managers) {
    if (await commandExists(m)) return m;
  }
  return 'xdg-open'; // フォールバック
}

/**
 * ウィンドウ一覧を取得
 * wmctrl -l でウィンドウリスト、xprop で WM_CLASS を取得してアプリ名を特定
 */
async function getAppWindows(appNames) {
  const hasWmctrl = await commandExists('wmctrl');
  if (!hasWmctrl) {
    console.error('wmctrl not found. Install with: sudo apt install wmctrl');
    return [];
  }

  const stdout = await run('wmctrl -l -p', 15000);
  if (!stdout.trim()) return [];

  const windows = [];
  const indexCounters = {};
  const terminal = await detectTerminal();
  const fileManager = await detectFileManager();

  for (const line of stdout.trim().split('\n')) {
    // wmctrl -l -p 形式: 0x04a00003  0 12345 hostname Window Title
    const match = line.match(/^(0x[\da-f]+)\s+(\d+)\s+(\d+)\s+\S+\s+(.*)/i);
    if (!match) continue;

    const wid = match[1];
    const pid = match[3];
    const title = match[4] || 'Window';

    // PID から プロセス名を取得
    let procName = '';
    try {
      procName = (await run(`ps -p ${pid} -o comm= 2>/dev/null`)).trim();
    } catch { /* ignore */ }

    if (!procName) continue;

    // プロセス名 → 表示用アプリ名
    let appName;
    const terminalNames = ['gnome-terminal-', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'kitty', 'alacritty', 'xterm', 'x-terminal-emulator'];
    const fileManagerNames = ['nautilus', 'dolphin', 'thunar', 'pcmanfm', 'nemo', 'caja'];

    if (terminalNames.some(t => procName.startsWith(t))) {
      appName = 'Terminal';
    } else if (fileManagerNames.includes(procName)) {
      appName = 'Files';
    } else {
      appName = procName;
    }

    // フィルタリング
    const builtins = ['Terminal', 'Files'];
    const targets = [...builtins, ...(appNames || [])];
    if (!targets.some(t => appName === t || procName === t || procName.startsWith(t))) continue;

    indexCounters[appName] = (indexCounters[appName] || 0) + 1;

    windows.push({
      app: appName,
      id: wid,
      name: title,
      windowIndex: indexCounters[appName],
    });
  }

  return windows;
}

/**
 * ウィンドウをアクティブにする (xdotool windowactivate)
 */
async function activateWindow(appName, windowId, windowName, animation, windowIndex) {
  const hasXdotool = await commandExists('xdotool');
  if (!hasXdotool) {
    // wmctrl フォールバック
    await run(`wmctrl -i -a ${windowId}`);
    return true;
  }

  // 最小化されている場合は復帰
  await run(`xdotool windowminimize --sync ${windowId} || true`);
  await run(`xdotool windowactivate --sync ${windowId}`);
  return true;
}

/**
 * 新しいターミナルウィンドウを開く
 */
async function openNewTerminalWindow(initialPath) {
  const terminal = await detectTerminal();
  let cmd;

  const dir = initialPath || process.env.HOME || '/home';

  switch (terminal) {
    case 'gnome-terminal':
      cmd = `gnome-terminal --working-directory="${dir}"`;
      break;
    case 'konsole':
      cmd = `konsole --workdir "${dir}"`;
      break;
    case 'xfce4-terminal':
      cmd = `xfce4-terminal --default-working-directory="${dir}"`;
      break;
    case 'kitty':
      cmd = `kitty --directory "${dir}"`;
      break;
    case 'alacritty':
      cmd = `alacritty --working-directory "${dir}"`;
      break;
    default:
      cmd = `${terminal}`;
      break;
  }

  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    // ターミナルは非同期で起動するのですぐに成功を返す
    setTimeout(() => {
      resolve({ success: true, windowName: terminal });
    }, 500);
  });
}

/**
 * 新しいファイルマネージャーウィンドウを開く
 */
async function openNewFinderWindow(targetPath) {
  const fileManager = await detectFileManager();
  const dir = targetPath || process.env.HOME || '/home';

  return new Promise((resolve) => {
    const child = spawn(fileManager, [dir], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    setTimeout(() => {
      resolve({ success: true, windowName: dir, path: dir });
    }, 500);
  });
}

/**
 * 汎用アプリの新しいウィンドウを開く
 */
async function openNewGenericWindow(appName) {
  // xdotool で Ctrl+N を送る
  const hasXdotool = await commandExists('xdotool');
  if (!hasXdotool) {
    return { success: false, error: 'xdotool not found' };
  }

  // まずアプリをアクティブにする
  await run(`wmctrl -a "${appName}" || true`);
  await new Promise(r => setTimeout(r, 300));
  await run('xdotool key --clearmodifiers ctrl+n');
  return { success: true, windowName: appName };
}

/**
 * ウィンドウを閉じる
 */
async function closeWindow(appName, windowId, windowName) {
  const result = await run(`wmctrl -i -c ${windowId}`);
  return { success: true };
}

/**
 * 汎用アプリのウィンドウ一覧
 */
async function getGenericAppWindows(appName) {
  return getAppWindows([appName]);
}

/**
 * ターミナル色設定 — Linux では未サポート (no-op)
 */
function setTerminalColor(_windowId, _options) {
  // ターミナルエミュレータ依存、標準APIなし
}

module.exports = {
  getAppWindows,
  activateWindow,
  openNewTerminalWindow,
  openNewFinderWindow,
  openNewGenericWindow,
  closeWindow,
  getGenericAppWindows,
  setTerminalColor,
};
