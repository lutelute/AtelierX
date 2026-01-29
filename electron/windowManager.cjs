/**
 * Window Manager - macOS ウィンドウ操作モジュール
 * Terminal/Finder は専用API、その他は System Events 経由の汎用APIを使用
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Terminal/Finderのウィンドウ一覧を取得（＋汎用アプリのウィンドウも取得）
 *
 * 安定性のため2段階で取得:
 * 1. Terminal/Finder: 専用API（高速・安定）
 * 2. 汎用アプリ: System Events（1回のバッチ呼出、失敗してもT/Fに影響なし）
 *
 * @param {string[]} [appNames] - 追加取得するアプリ名の配列 (Terminal/Finder以外)
 * @returns {Promise<Array<{app: string, id: string, name: string, path?: string}>>}
 */
function getAppWindows(appNames) {
  return new Promise((resolve) => {
    // ステージ1: Terminal/Finder（安定）
    const script = `
set windowList to {}

-- Terminal.app
try
  if application "Terminal" is running then
    tell application "Terminal"
      set windowIndex to 1
      repeat with w in windows
        try
          set windowName to name of w
          set windowId to id of w
          set ttyPath to ""
          try
            set ttyPath to tty of selected tab of w
          end try
          set procList to ""
          try
            set procs to processes of selected tab of w
            set procList to procs as text
          end try
          set end of windowList to "Terminal|" & windowId & "|" & windowName & "|" & procList & "|" & windowIndex & "|" & ttyPath
          set windowIndex to windowIndex + 1
        end try
      end repeat
    end tell
  end if
end try

-- Finder
try
  if application "Finder" is running then
    tell application "Finder"
      set windowIndex to 1
      set finderWindows to Finder windows
      repeat with w in finderWindows
        try
          set windowName to name of w
          set windowId to id of w
          set end of windowList to "Finder|" & windowId & "|" & windowName & "||" & windowIndex
          set windowIndex to windowIndex + 1
        end try
      end repeat
    end tell
  end if
end try

return windowList
`;

    const tmpFile = path.join(os.tmpdir(), `atelierx-windows-${Date.now()}.scpt`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      exec(`osascript "${tmpFile}"`, { timeout: 10000 }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}

        const windows = [];

        if (!error && stdout.trim()) {
          const lines = stdout.trim().split(', ');
          for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (!line) continue;
            const parts = line.split('|');
            const app = parts[0] || 'Terminal';
            let preview = '';

            if (app === 'Terminal' && parts[3]) {
              preview = parts[3].trim();
            }

            const tty = parts[5]?.trim();
            const stableId = (app === 'Terminal' && tty) ? tty : (parts[1] || String(index + 1));

            windows.push({
              app,
              id: stableId,
              name: parts[2] || 'Window',
              preview: preview || undefined,
              windowIndex: parseInt(parts[4]) || (index + 1),
              tty: tty || undefined,
            });
          }
        }

        // ステージ2: 汎用アプリ（バッチ、失敗してもTerminal/Finderに影響なし）
        const genericApps = (appNames || []).filter(name => name !== 'Terminal' && name !== 'Finder');
        if (genericApps.length > 0) {
          getBatchedGenericWindows(genericApps).then((genericWindows) => {
            windows.push(...genericWindows);
            resolve(windows);
          });
        } else {
          resolve(windows);
        }
      });
    } catch (error) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve([]);
    }
  });
}

/**
 * 複数の汎用アプリのウィンドウを1回のSystem Eventsスクリプトでバッチ取得
 * @param {string[]} appNames - アプリ名の配列
 * @returns {Promise<Array<{app: string, id: string, name: string, windowIndex: number}>>}
 */
function getBatchedGenericWindows(appNames) {
  return new Promise((resolve) => {
    const blocks = appNames.map(appName => {
      const escaped = appName.replace(/"/g, '\\"');
      return `
  try
    if exists (process "${escaped}") then
      tell process "${escaped}"
        set windowIndex to 1
        repeat with w in windows
          try
            set windowTitle to name of w
            if windowTitle is not "" then
              set output to output & "${escaped}" & "|" & windowIndex & "|" & windowTitle & linefeed
            end if
            set windowIndex to windowIndex + 1
          end try
        end repeat
      end tell
    end if
  end try`;
    }).join('\n');

    const script = `
set output to ""
tell application "System Events"
${blocks}
end tell
return output
`;

    const tmpFile = path.join(os.tmpdir(), `atelierx-generic-batch-${Date.now()}.scpt`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      // 非同期実行（メインプロセスをブロックしない）
      exec(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout: 10000 }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}

        if (error) {
          console.error('getBatchedGenericWindows error:', error.message);
          resolve([]);
          return;
        }

        const titleCounts = {};
        const windows = (stdout || '').trim().split('\n')
          .filter(line => line.length > 0 && line.includes('|'))
          .map((line) => {
            const parts = line.split('|');
            const appName = parts[0] || 'Unknown';
            const windowIndex = parseInt(parts[1]) || 1;
            const name = parts[2] || 'Window';
            // タイトルベースの安定ID（同名は連番で区別）
            if (!titleCounts[appName]) titleCounts[appName] = {};
            titleCounts[appName][name] = (titleCounts[appName][name] || 0) + 1;
            const titleSuffix = titleCounts[appName][name] > 1 ? `-${titleCounts[appName][name]}` : '';
            return {
              app: appName,
              id: `${appName}:${name}${titleSuffix}`,
              name,
              windowIndex,
            };
          });

        resolve(windows);
      });
    } catch (error) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      console.error('getBatchedGenericWindows error:', error.message);
      resolve([]);
    }
  });
}

/**
 * 汎用アプリのウィンドウ一覧を取得 (System Events経由)
 * @param {string} appName - macOSアプリ名 (例: 'Obsidian', 'Google Chrome')
 * @returns {Promise<Array<{app: string, id: string, name: string, windowIndex: number}>>}
 */
function getGenericAppWindows(appName) {
  return new Promise((resolve) => {
    const escapedApp = appName.replace(/"/g, '\\"');
    const script = `
tell application "System Events"
  if exists (process "${escapedApp}") then
    tell process "${escapedApp}"
      set windowIndex to 1
      set output to ""
      repeat with w in windows
        try
          set windowTitle to name of w
          if windowTitle is not "" then
            set output to output & windowTitle & "|" & windowIndex & linefeed
          end if
          set windowIndex to windowIndex + 1
        end try
      end repeat
      return output
    end tell
  end if
end tell
return ""
`;

    // 一時ファイル経由で非同期実行
    const tmpFile = path.join(os.tmpdir(), `atelierx-generic-${Date.now()}.scpt`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      exec(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout: 10000 }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}

        if (error) {
          console.error(`getGenericAppWindows error for ${appName}:`, error.message);
          resolve([]);
          return;
        }

        const lines = (stdout || '').trim().split('\n');
        // タイトル出現回数を追跡（同名ウィンドウの区別用）
        const titleCounts = {};
        const windows = lines
          .filter(line => line.length > 0 && line.includes('|'))
          .map((line) => {
            const parts = line.split('|');
            const name = parts[0] || 'Window';
            const windowIndex = parseInt(parts[1]) || 1;
            // タイトルベースの安定ID（同名は連番で区別）
            titleCounts[name] = (titleCounts[name] || 0) + 1;
            const titleSuffix = titleCounts[name] > 1 ? `-${titleCounts[name]}` : '';
            return {
              app: appName,
              id: `${appName}:${name}${titleSuffix}`,
              name,
              windowIndex,
            };
          });

        resolve(windows);
      });
    } catch (error) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      console.error(`getGenericAppWindows error for ${appName}:`, error.message);
      resolve([]);
    }
  });
}

/**
 * アクティベーション時のアニメーション AppleScript を生成
 *
 * @param {'pop'|'minimize'} animation - アニメーションタイプ
 * @param {string} windowVar - System Events ウィンドウ変数名
 * @param {string} appName - アプリ名
 * @returns {{ inner: string, outer: string }}
 *   inner: System Events tell block 内に挿入するコード
 *   outer: System Events tell block の後に挿入するコード
 */
function buildActivateAnimation(animation, windowVar, appName) {
  const escaped = (appName || '').replace(/"/g, '\\"');
  if (animation === 'minimize') {
    // minimize: System Events内では何もせず、外でアプリネイティブAPIを使う
    return {
      inner: '',
      outer: `
  try
    tell application "${escaped}"
      repeat with w in windows
        if name of w is targetWindowName then
          set miniaturized of w to true
          exit repeat
        end if
      end repeat
    end tell
    delay 0.3
    tell application "${escaped}"
      repeat with w in windows
        if name of w is targetWindowName then
          set miniaturized of w to false
          exit repeat
        end if
      end repeat
    end tell
  end try`,
    };
  }
  // デフォルト: ポップエフェクト（引っ込んで→飛び出す→戻る）
  return {
    inner: `
          try
            set origPos to position of ${windowVar}
            set origSize to size of ${windowVar}
            set {x0, y0} to origPos
            set {w0, h0} to origSize
            set position of ${windowVar} to {x0 + 30, y0 + 30}
            set size of ${windowVar} to {w0 - 60, h0 - 60}
            delay 0.04
            set position of ${windowVar} to {x0 - 6, y0 - 6}
            set size of ${windowVar} to {w0 + 12, h0 + 12}
            delay 0.04
            set position of ${windowVar} to origPos
            set size of ${windowVar} to origSize
          end try`,
    outer: '',
  };
}

/**
 * 汎用アプリのウィンドウを前面に表示 (System Events AXRaise)
 * @param {string} appName - アプリ名
 * @param {string} windowName - ウィンドウ名
 * @param {number} windowIndex - ウィンドウインデックス
 * @param {string} animation - アニメーションタイプ
 */
function activateGenericWindow(appName, windowName, windowIndex, animation) {
  const escapedApp = appName.replace(/"/g, '\\"');
  const escapedName = (windowName || '').replace(/"/g, '\\"');
  const idx = parseInt(windowIndex) || 1;

  const anim = buildActivateAnimation(animation || 'pop', 'w', escapedApp);

  // 対象ウィンドウだけを前面に表示（frontmostは使わずAXRaiseのみ）
  const script = `
set targetWindowName to ""
tell application "System Events"
  tell process "${escapedApp}"
    try
      set found to false
      repeat with w in windows
        if name of w is "${escapedName}" then
          perform action "AXRaise" of w
          set targetWindowName to name of w
${anim.inner}
          set found to true
          exit repeat
        end if
      end repeat
      if not found then
        if (count of windows) >= ${idx} then
          perform action "AXRaise" of window ${idx}
        end if
      end if
    end try
  end tell
end tell
${anim.outer}
`;

  const tmpFile = path.join(os.tmpdir(), `atelierx-activate-${Date.now()}.scpt`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf-8');
    const child = spawn('osascript', [tmpFile], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('close', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
    child.on('error', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
  } catch (error) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    console.error('activateGenericWindow error:', error.message);
  }
}

/**
 * 汎用アプリのウィンドウを閉じる
 * @param {string} appName - アプリ名
 * @param {string} windowName - ウィンドウ名
 * @param {number} windowIndex - ウィンドウインデックス
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function closeGenericWindow(appName, windowName, windowIndex) {
  return new Promise((resolve) => {
    const escapedApp = appName.replace(/"/g, '\\"');
    const escapedName = (windowName || '').replace(/"/g, '\\"');
    const idx = parseInt(windowIndex) || 1;

    const script = `
set found to false
tell application "System Events"
  tell process "${escapedApp}"
    try
      repeat with w in windows
        if name of w is "${escapedName}" then
          click button 1 of w
          set found to true
          exit repeat
        end if
      end repeat
      if not found then
        if (count of windows) >= ${idx} then
          click button 1 of window ${idx}
          set found to true
        end if
      end if
    end try
  end tell
end tell
return found
`;

    const tmpFile = path.join(os.tmpdir(), `atelierx-close-${Date.now()}.scpt`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      exec(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout: 10000 }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        const found = (stdout || '').trim() === 'true';
        resolve({ success: found, error: found ? undefined : 'Window not found' });
      });
    } catch (error) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 汎用アプリで新しいウィンドウを開く (Cmd+N)
 * @param {string} appName - アプリ名
 * @returns {Promise<{success: boolean, windowName?: string, error?: string}>}
 */
function openNewGenericWindow(appName) {
  return new Promise((resolve) => {
    const escapedApp = appName.replace(/"/g, '\\"');

    const script = `
tell application "${escapedApp}" to activate
delay 0.3
tell application "System Events"
  tell process "${escapedApp}"
    keystroke "n" using command down
  end tell
end tell
delay 0.5
set windowName to ""
tell application "System Events"
  tell process "${escapedApp}"
    try
      set windowName to name of front window
    end try
  end tell
end tell
return windowName
`;

    const tmpFile = path.join(os.tmpdir(), `atelierx-open-${Date.now()}.scpt`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      exec(`osascript "${tmpFile}"`, { encoding: 'utf-8', timeout: 15000 }, (error, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        const windowName = (stdout || '').trim();
        resolve({ success: true, windowName: windowName || appName });
      });
    } catch (error) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Terminalウィンドウをポップして前面に表示
 * @param {string} windowId - ウィンドウID（ttyパスまたは数値ID）
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateTerminalWindow(windowId, windowName, animation) {
  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);

  // 対象ウィンドウだけを前面に表示（他のウィンドウは移動しない）
  // 1. Terminal.appで対象ウィンドウの名前を取得
  // 2. System Eventsで名前マッチしたウィンドウだけAXRaise（frontmostは使わない）
  let findCondition;
  if (isTtyPath) {
    const escapedTty = windowId.replace(/"/g, '\\"');
    findCondition = `tty of selected tab of w is equal to "${escapedTty}"`;
  } else if (isNumericId) {
    findCondition = `id of w is ${windowId}`;
  } else {
    const escapedName = (windowName || windowId).replace(/"/g, '\\"');
    findCondition = `name of w is equal to "${escapedName}"`;
  }

  const escapedName = (windowName || '').replace(/"/g, '\\"');
  const anim = buildActivateAnimation(animation || 'pop', 'w', 'Terminal');
  const script = `
set targetWindowName to ""
tell application "Terminal"
  repeat with w in windows
    try
      if ${findCondition} then
        set targetWindowName to name of w
        exit repeat
      end if
    end try
  end repeat
  ${!isTtyPath && !isNumericId ? `
  if targetWindowName is "" then
    repeat with w in windows
      if name of w starts with "${escapedName}" then
        set targetWindowName to name of w
        exit repeat
      end if
    end repeat
  end if` : ''}
end tell
if targetWindowName is not "" then
  tell application "System Events"
    tell process "Terminal"
      repeat with w in windows
        if name of w is targetWindowName then
          perform action "AXRaise" of w
${anim.inner}
          exit repeat
        end if
      end repeat
    end tell
  end tell
${anim.outer}
end if
return targetWindowName is not ""
`;

  const tmpFile = path.join(os.tmpdir(), `atelierx-activate-term-${Date.now()}.scpt`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf-8');
    const child = spawn('osascript', [tmpFile], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('close', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
    child.on('error', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
  } catch (error) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    console.error('activateTerminalWindow error:', error.message);
  }
}

/**
 * Finderウィンドウをポップして前面に表示
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateFinderWindow(windowId, windowName, animation) {
  const isNumericId = /^\d+$/.test(windowId);
  const escapedName = (windowName || '').replace(/"/g, '\\"');

  // 対象ウィンドウだけを前面に表示（他のウィンドウは移動しない）
  // Finder.appで対象ウィンドウ名を取得→System Eventsで名前マッチしてAXRaiseのみ
  let findBlock;
  if (isNumericId) {
    findBlock = `
set targetId to ${windowId}
tell application "Finder"
  repeat with w in (get every Finder window)
    if id of w is targetId then
      set targetWindowName to name of w
      exit repeat
    end if
  end repeat
end tell`;
  } else {
    findBlock = `
tell application "Finder"
  repeat with w in (get every Finder window)
    if name of w is equal to "${escapedName}" then
      set targetWindowName to name of w
      exit repeat
    end if
  end repeat
  if targetWindowName is "" then
    repeat with w in (get every Finder window)
      if name of w starts with "${escapedName}" then
        set targetWindowName to name of w
        exit repeat
      end if
    end repeat
  end if
end tell`;
  }

  const anim = buildActivateAnimation(animation || 'pop', 'w', 'Finder');
  const script = `
set targetWindowName to ""
${findBlock}
if targetWindowName is not "" then
  tell application "System Events"
    tell process "Finder"
      repeat with w in windows
        if name of w is targetWindowName then
          perform action "AXRaise" of w
${anim.inner}
          exit repeat
        end if
      end repeat
    end tell
  end tell
${anim.outer}
end if
return targetWindowName is not ""
`;

  const tmpFile = path.join(os.tmpdir(), `atelierx-activate-finder-${Date.now()}.scpt`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf-8');
    const child = spawn('osascript', [tmpFile], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('close', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
    child.on('error', () => { try { fs.unlinkSync(tmpFile); } catch (_) {} });
  } catch (error) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    console.error('activateFinderWindow error:', error.message);
  }
}

/**
 * 指定したウィンドウをアクティブにする
 * @param {string} appName - アプリ名
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 * @returns {Promise<boolean>}
 */
function activateWindow(appName, windowId, windowName, animation) {
  const anim = animation || 'pop';
  return new Promise((resolve) => {
    if (appName === 'Terminal') {
      activateTerminalWindow(windowId, windowName || windowId, anim);
      resolve(true);
    } else if (appName === 'Finder') {
      activateFinderWindow(windowId, windowName || windowId, anim);
      resolve(true);
    } else {
      // 汎用アプリ: タイトルベースIDから名前で検索
      activateGenericWindow(appName, windowName || '', 1, anim);
      resolve(true);
    }
  });
}

/**
 * 新しいTerminalウィンドウを開く
 * @param {string} [initialPath] - 初期ディレクトリ（オプション）
 * @returns {Promise<{success: boolean, windowName?: string, error?: string}>}
 */
function openNewTerminalWindow(initialPath) {
  return new Promise((resolve) => {
    const cdCommand = initialPath ? `cd "${initialPath.replace(/"/g, '\\"')}"` : '';

    const script = `
      tell application "Terminal"
        activate
        set newWindow to do script "${cdCommand}"
        delay 0.5
        set windowName to name of front window
        return windowName
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
      if (error) {
        console.error('openNewTerminalWindow error:', error);
        resolve({ success: false, error: error.message });
        return;
      }
      const windowName = stdout.trim();
      resolve({ success: true, windowName });
    });
  });
}

/**
 * 新しいFinderウィンドウを開く
 * @param {string} [targetPath] - 開くフォルダパス（オプション、デフォルトはホーム）
 * @returns {Promise<{success: boolean, windowName?: string, path?: string, error?: string}>}
 */
function openNewFinderWindow(targetPath) {
  return new Promise((resolve) => {
    const homePath = process.env.HOME || '/Users';
    const folderPath = targetPath || homePath;

    const script = `
      tell application "Finder"
        activate
        set newWindow to make new Finder window
        set target of newWindow to POSIX file "${folderPath.replace(/"/g, '\\"')}"
        delay 0.3
        set windowName to name of newWindow
        set windowPath to POSIX path of (target of newWindow as alias)
        return windowName & "|" & windowPath
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
      if (error) {
        console.error('openNewFinderWindow error:', error);
        resolve({ success: false, error: error.message });
        return;
      }
      const parts = stdout.trim().split('|');
      resolve({
        success: true,
        windowName: parts[0] || 'Finder',
        path: parts[1] || folderPath,
      });
    });
  });
}

/**
 * Terminalウィンドウを閉じる
 * @param {string} windowId - ウィンドウID（ttyパスまたは数値ID）
 * @param {string} [windowName] - ウィンドウ名（フォールバック用）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function closeTerminalWindow(windowId, windowName) {
  return new Promise((resolve) => {
    const isTtyPath = windowId.startsWith('/dev/');
    const isNumericId = /^\d+$/.test(windowId);

    let script;
    if (isTtyPath) {
      const escapedTty = windowId.replace(/"/g, '\\"');
      script = `
        set targetTty to "${escapedTty}"
        set found to false
        tell application "Terminal"
          repeat with w in windows
            try
              if tty of selected tab of w is equal to targetTty then
                close w
                set found to true
                exit repeat
              end if
            end try
          end repeat
        end tell
        return found
      `;
    } else if (isNumericId) {
      script = `
        set targetId to ${windowId}
        set found to false
        tell application "Terminal"
          repeat with w in windows
            if id of w is targetId then
              close w
              set found to true
              exit repeat
            end if
          end repeat
        end tell
        return found
      `;
    } else {
      const escapedName = (windowName || windowId).replace(/"/g, '\\"');
      script = `
        set targetName to "${escapedName}"
        set found to false
        tell application "Terminal"
          repeat with w in windows
            if name of w is equal to targetName then
              close w
              set found to true
              exit repeat
            end if
          end repeat
          if not found then
            repeat with w in windows
              if name of w starts with targetName then
                close w
                set found to true
                exit repeat
              end if
            end repeat
          end if
        end tell
        return found
      `;
    }

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
      if (error) {
        console.error('closeTerminalWindow error:', error);
        resolve({ success: false, error: error.message });
        return;
      }
      const found = stdout.trim() === 'true';
      resolve({ success: found, error: found ? undefined : 'Window not found' });
    });
  });
}

/**
 * Finderウィンドウを閉じる
 * @param {string} windowId - ウィンドウID
 * @param {string} [windowName] - ウィンドウ名（フォールバック用）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function closeFinderWindow(windowId, windowName) {
  return new Promise((resolve) => {
    const isNumericId = /^\d+$/.test(windowId);

    let script;
    if (isNumericId) {
      script = `
        set targetId to ${windowId}
        set found to false
        tell application "Finder"
          repeat with w in (get every Finder window)
            if id of w is targetId then
              close w
              set found to true
              exit repeat
            end if
          end repeat
        end tell
        return found
      `;
    } else {
      const escapedName = (windowName || windowId).replace(/"/g, '\\"');
      script = `
        set targetName to "${escapedName}"
        set found to false
        tell application "Finder"
          repeat with w in (get every Finder window)
            if name of w is equal to targetName then
              close w
              set found to true
              exit repeat
            end if
          end repeat
          if not found then
            repeat with w in (get every Finder window)
              if name of w starts with targetName then
                close w
                set found to true
                exit repeat
              end if
            end repeat
          end if
        end tell
        return found
      `;
    }

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
      if (error) {
        console.error('closeFinderWindow error:', error);
        resolve({ success: false, error: error.message });
        return;
      }
      const found = stdout.trim() === 'true';
      resolve({ success: found, error: found ? undefined : 'Window not found' });
    });
  });
}

/**
 * 指定したウィンドウを閉じる
 * @param {string} appName - アプリ名 ('Terminal' | 'Finder')
 * @param {string} windowId - ウィンドウID
 * @param {string} [windowName] - ウィンドウ名（フォールバック用）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function closeWindow(appName, windowId, windowName) {
  if (appName === 'Terminal') {
    return closeTerminalWindow(windowId, windowName);
  } else if (appName === 'Finder') {
    return closeFinderWindow(windowId, windowName);
  } else {
    // 汎用アプリ: タイトルベースIDから名前で検索
    return closeGenericWindow(appName, windowName || '', 1);
  }
}

module.exports = {
  getAppWindows,
  activateWindow,
  openNewTerminalWindow,
  openNewFinderWindow,
  openNewGenericWindow,
  closeWindow,
  getGenericAppWindows,
};
