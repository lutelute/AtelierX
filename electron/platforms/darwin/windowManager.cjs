/**
 * Window Manager - macOS ウィンドウ操作モジュール
 * Terminal/Finder は専用API、その他は System Events 経由の汎用APIを使用
 */

const { exec, execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * AppleScriptを実行して結果を返す（stdinパイプ方式 — 一時ファイル不要）
 * @param {string} script - AppleScriptコード
 * @param {number} [timeout=10000] - タイムアウト(ms)
 * @returns {Promise<string>} stdout
 */
function runAppleScript(script, timeout = 10000) {
  return new Promise((resolve) => {
    const child = spawn('osascript', ['-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        console.error('runAppleScript timeout');
        resolve('');
      }
    }, timeout);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && stderr) {
        console.error('runAppleScript error:', stderr.trim().slice(0, 200));
      }
      resolve(stdout);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error('runAppleScript spawn error:', err.message);
      resolve('');
    });
    child.stdin.write(script);
    child.stdin.end();
  });
}

/**
 * AppleScriptをfire-and-forget実行（stdinパイプ方式 — 一時ファイル不要）
 * 結果は待たないが、エラーはログに出力する
 * @param {string} script - AppleScriptコード
 */
function runAppleScriptAsync(script) {
  const child = spawn('osascript', ['-'], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0 && stderr) {
      console.error('runAppleScriptAsync error:', stderr.trim().slice(0, 200));
    }
  });
  child.on('error', (err) => {
    console.error('runAppleScriptAsync spawn error:', err.message);
  });
  child.stdin.write(script);
  child.stdin.end();
}

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

-- Finder（最小化ウィンドウの幽霊エントリ問題を回避するため、countで取得してindexアクセス）
try
  if application "Finder" is running then
    tell application "Finder"
      set winCount to count of Finder windows
      set windowIndex to 1
      repeat with i from 1 to winCount
        try
          set w to Finder window i
          set windowName to name of w
          set windowId to id of w
          set folderPath to ""
          try
            set folderPath to POSIX path of (target of w as alias)
          end try
          set end of windowList to "Finder|" & windowId & "|" & windowName & "||" & windowIndex & "|" & folderPath
          set windowIndex to windowIndex + 1
        end try
      end repeat
    end tell
  end if
end try

return windowList
`;

    runAppleScript(script).then((stdout) => {
      const windows = [];

      if (stdout.trim()) {
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

          const field5 = parts[5]?.trim();
          const numericId = parts[1]?.trim();
          // 常にnumeric window IDをプライマリIDとして使用
          // （ttyは取得失敗することがあり、複数ウィンドウが同一IDになる問題があった）
          const stableId = numericId || String(index + 1);

          // Terminal: field5=tty, Finder: field5=folderPath
          const tty = app === 'Terminal' ? (field5 || undefined) : undefined;
          const path = app === 'Finder' ? (field5 || undefined) : undefined;

          windows.push({
            app,
            id: stableId,
            name: parts[2] || 'Window',
            preview: preview || undefined,
            windowIndex: parseInt(parts[4]) || (index + 1),
            tty: tty,
            path: path,
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

    runAppleScript(script).then((stdout) => {
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

    runAppleScript(script).then((stdout) => {
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
  });
}

/**
 * ポップエフェクト（System Events 内で実行）
 * サイズガード付き: 小さすぎるウィンドウでは縮小幅を調整し最小化を防止
 * @param {string} windowVar - System Events ウィンドウ変数名
 */
function popAnimationSnippet(windowVar) {
  return `
          try
            set origPos to position of ${windowVar}
            set origSize to size of ${windowVar}
            set {x0, y0} to origPos
            set {w0, h0} to origSize
            -- サイズガード: 小さいウィンドウでは縮小量を調整
            if w0 > 120 and h0 > 120 then
              set shrink to 30
            else if w0 > 60 and h0 > 60 then
              set shrink to 10
            else
              set shrink to 0
            end if
            if shrink > 0 then
              set position of ${windowVar} to {x0 + shrink, y0 + shrink}
              set size of ${windowVar} to {w0 - (shrink * 2), h0 - (shrink * 2)}
              delay 0.04
              set position of ${windowVar} to {x0 - 6, y0 - 6}
              set size of ${windowVar} to {w0 + 12, h0 + 12}
              delay 0.04
              set position of ${windowVar} to origPos
              set size of ${windowVar} to origSize
            end if
          end try`;
}

/**
 * 最小化→復帰エフェクト（System Events ブロックの外で実行）
 *
 * 復帰後に再AXRaiseして確実に前面化する。
 * アプリごとにAPIが異なるため分岐:
 *   - Terminal: miniaturized
 *   - Finder: collapsed (miniaturizedは非サポート)
 *   - Generic: System Events の AXMinimized 属性
 */
function minimizeAnimationOuter(appType, appName) {
  const escaped = (appName || '').replace(/"/g, '\\"');
  if (appType === 'Terminal') {
    // window id で直接操作（名前ループは最小化中に失敗しうる）
    return `
  try
    if targetWindowId > 0 then
      tell application "Terminal"
        set miniaturized of window id targetWindowId to true
      end tell
      delay 0.5
      tell application "Terminal"
        set miniaturized of window id targetWindowId to false
        delay 0.1
        set index of window id targetWindowId to 1
      end tell
      delay 0.15
      tell application "System Events"
        tell process "Terminal"
          repeat with w in windows
            if name of w is targetWindowName then
              perform action "AXRaise" of w
              exit repeat
            end if
          end repeat
        end tell
      end tell
    end if
  end try`;
  }
  if (appType === 'Finder') {
    // window id で直接操作
    return `
  try
    if targetWindowId > 0 then
      tell application "Finder"
        set collapsed of Finder window id targetWindowId to true
      end tell
      delay 0.5
      tell application "Finder"
        set collapsed of Finder window id targetWindowId to false
        delay 0.1
        set index of Finder window id targetWindowId to 1
      end tell
      delay 0.15
      tell application "System Events"
        tell process "Finder"
          repeat with w in windows
            if name of w is targetWindowName then
              perform action "AXRaise" of w
              exit repeat
            end if
          end repeat
        end tell
      end tell
    end if
  end try`;
  }
  // Generic: System Events AXMinimized
  return `
  if targetWindowName is not "" then
    try
      tell application "System Events"
        tell process "${escaped}"
          set targetW to missing value
          repeat with w in windows
            if name of w is targetWindowName then
              set targetW to w
              exit repeat
            end if
          end repeat
          if targetW is not missing value then
            set value of attribute "AXMinimized" of targetW to true
            delay 0.5
            set value of attribute "AXMinimized" of targetW to false
            delay 0.15
            perform action "AXRaise" of targetW
          end if
        end tell
      end tell
    end try
  end if`;
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

  const anim = animation || 'pop';
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Generic', escapedApp) : '';

  // 対象ウィンドウだけを前面に表示
  // 名前が変わりやすいアプリ（ブラウザ等）のため3段階で検索:
  //   1. 完全一致  2. 部分一致(contains)  3. ウィンドウインデックス
  // AXRaise後にactivateWithOptions:2で対象ウィンドウだけAtelierXより前に出す
  const script = `
use framework "AppKit"
use scripting additions

set targetWindowName to ""
set targetW to missing value
tell application "System Events"
  tell process "${escapedApp}"
    try
      -- 1. 完全一致
      repeat with w in windows
        if name of w is "${escapedName}" then
          set targetW to w
          set targetWindowName to name of w
          exit repeat
        end if
      end repeat
      -- 2. 部分一致 (ブラウザのタブ切替でタイトルが変わるため)
      if targetW is missing value and "${escapedName}" is not "" then
        repeat with w in windows
          if name of w contains "${escapedName}" then
            set targetW to w
            set targetWindowName to name of w
            exit repeat
          end if
        end repeat
      end if
      -- 3. インデックスフォールバック
      if targetW is missing value then
        if (count of windows) >= ${idx} then
          set targetW to window ${idx}
          set targetWindowName to name of targetW
        end if
      end if
      -- アクティベーション + アニメーション
      if targetW is not missing value then
        perform action "AXRaise" of targetW
${innerSnippet}
      end if
    end try
  end tell
end tell
if targetW is not missing value then
  delay 0.05
  try
    set bundleId to id of application "${escapedApp}"
    set targetApps to current application's NSRunningApplication's runningApplicationsWithBundleIdentifier:bundleId
    if targetApps's |count|() > 0 then
      (targetApps's objectAtIndex:0)'s activateWithOptions:2
    end if
  end try
end if
${outerSnippet}
`;

  runAppleScriptAsync(script);
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

    runAppleScript(script).then((stdout) => {
      const found = (stdout || '').trim() === 'true';
      resolve({ success: found, error: found ? undefined : 'Window not found' });
    });
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

    runAppleScript(script, 15000).then((stdout) => {
      const windowName = (stdout || '').trim();
      resolve({ success: true, windowName: windowName || appName });
    });
  });
}

/**
 * Terminalウィンドウをポップして前面に表示
 *
 * 名前ベースマッチング方式:
 *   Step 1: Terminal.appで対象ウィンドウのnameを取得（IDで安定特定）
 *   Step 2: System Eventsでそのnameのウィンドウを検索してAXRaise
 *
 * ※ 旧方式（window 1への依存）はTerminal.appとSystem Eventsの
 *   ウィンドウ順序同期タイミングに依存し、間違ったウィンドウが
 *   活性化・アニメーションされる問題があった
 *
 * @param {string} windowId - ウィンドウID（ttyパスまたは数値ID）
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateTerminalWindow(windowId, windowName, animation) {
  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);
  const escapedName = (windowName || '').replace(/"/g, '\\"');
  const anim = animation || 'pop';
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Terminal', 'Terminal') : '';

  // Step 1: Terminal.appで対象ウィンドウを特定し、nameを取得
  // numeric window ID → tty → 名前 の優先順でマッチ
  let findWindow;
  if (isNumericId) {
    findWindow = `
tell application "Terminal"
  repeat with w in windows
    if id of w is ${windowId} then
      set targetWindowName to name of w
      set targetWindowId to id of w
      set index of w to 1
      set found to true
      exit repeat
    end if
  end repeat
end tell`;
  } else if (isTtyPath) {
    const escapedTty = windowId.replace(/"/g, '\\"');
    findWindow = `
tell application "Terminal"
  repeat with w in windows
    try
      if tty of selected tab of w is equal to "${escapedTty}" then
        set targetWindowName to name of w
        set targetWindowId to id of w
        set index of w to 1
        set found to true
        exit repeat
      end if
    end try
  end repeat
end tell`;
  } else {
    findWindow = `
tell application "Terminal"
  repeat with w in windows
    try
      if name of w is "${escapedName}" or name of w starts with "${escapedName}" then
        set targetWindowName to name of w
        set targetWindowId to id of w
        set index of w to 1
        set found to true
        exit repeat
      end if
    end try
  end repeat
end tell`;
  }

  // Step 2: System Eventsで名前ベースでウィンドウを検索してAXRaise
  // Step 3: NSRunningApplication.activateWithOptions: で対象ウィンドウだけ前面化
  //   activateWithOptions:2 = NSApplicationActivateIgnoringOtherApps のみ
  //   NSApplicationActivateAllWindows を含めないことで、AXRaiseされた
  //   ウィンドウだけが他アプリのウィンドウより前に出る
  const script = `
use framework "AppKit"
use scripting additions

set targetWindowName to ""
set targetWindowId to 0
set found to false
${findWindow}
if found then
  delay 0.1
  tell application "System Events"
    tell process "Terminal"
      set targetW to missing value
      repeat with w in windows
        if name of w is targetWindowName then
          set targetW to w
          exit repeat
        end if
      end repeat
      if targetW is not missing value then
        perform action "AXRaise" of targetW
${innerSnippet}
      end if
    end tell
  end tell
  delay 0.05
  try
    set termApp to (current application's NSRunningApplication's runningApplicationsWithBundleIdentifier:"com.apple.Terminal")'s firstObject()
    if termApp is not missing value then
      termApp's activateWithOptions:2
    end if
  end try
${outerSnippet}
end if
return found
`;

  runAppleScriptAsync(script);
}

/**
 * Finderウィンドウをポップして前面に表示
 *
 * 直接アクセス方式:
 *   Step 1: Finder.appで対象ウィンドウのnameを取得（IDで直接アクセス、イテレーション不要）
 *   Step 2: System Eventsでそのnameのウィンドウを検索してAXRaise
 *
 * ※ Finderはウィンドウが最小化されると `Finder windows` リストに
 *   幽霊エントリが発生し、イテレーション中に `-1731` エラーになる。
 *   そのため `Finder window id X` で直接アクセスする方式に変更。
 *
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateFinderWindow(windowId, windowName, animation) {
  const isNumericId = /^\d+$/.test(windowId);
  const escapedName = (windowName || '').replace(/"/g, '\\"');

  let findWindow;
  if (isNumericId) {
    // IDで直接アクセス（イテレーション回避で幽霊エントリ問題を解消）
    findWindow = `
tell application "Finder"
  try
    set targetWindowName to name of Finder window id ${windowId}
    set targetWindowId to ${windowId}
    set index of Finder window id ${windowId} to 1
    set found to true
  end try
  if not found and "${escapedName}" is not "" then
    try
      set targetWindowName to name of Finder window "${escapedName}"
      set targetWindowId to id of Finder window "${escapedName}"
      set index of Finder window "${escapedName}" to 1
      set found to true
    end try
  end if
end tell`;
  } else {
    findWindow = `
tell application "Finder"
  try
    set targetWindowName to name of Finder window "${escapedName}"
    set targetWindowId to id of Finder window "${escapedName}"
    set index of Finder window "${escapedName}" to 1
    set found to true
  end try
end tell`;
  }

  const anim = animation || 'pop';
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Finder', 'Finder') : '';
  const script = `
use framework "AppKit"
use scripting additions

set targetWindowName to ""
set targetWindowId to 0
set found to false
${findWindow}
if found then
  delay 0.1
  tell application "System Events"
    tell process "Finder"
      set targetW to missing value
      repeat with w in windows
        if name of w is targetWindowName then
          set targetW to w
          exit repeat
        end if
      end repeat
      if targetW is not missing value then
        perform action "AXRaise" of targetW
${innerSnippet}
      end if
    end tell
  end tell
  delay 0.05
  try
    set finderApp to (current application's NSRunningApplication's runningApplicationsWithBundleIdentifier:"com.apple.finder")'s firstObject()
    if finderApp is not missing value then
      finderApp's activateWithOptions:2
    end if
  end try
${outerSnippet}
end if
return found
`;

  runAppleScriptAsync(script);
}

/**
 * 指定したウィンドウをアクティブにする
 * @param {string} appName - アプリ名
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 * @returns {Promise<boolean>}
 */
function activateWindow(appName, windowId, windowName, animation, windowIndex) {
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
      activateGenericWindow(appName, windowName || '', windowIndex || 1, anim);
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
    if (isNumericId) {
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
    } else if (isTtyPath) {
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

    runAppleScript(script).then((stdout) => {
      const found = (stdout || '').trim() === 'true';
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
    const escapedName = (windowName || windowId).replace(/"/g, '\\"');

    // activateFinderWindowと同様に直接アクセス方式を使用
    let script;
    if (isNumericId) {
      script = `
tell application "Finder"
  try
    close Finder window id ${windowId}
    return true
  on error
    -- ID で見つからない場合、名前でフォールバック
    try
      close Finder window "${escapedName}"
      return true
    end try
  end try
end tell
return false
`;
    } else {
      script = `
tell application "Finder"
  try
    close Finder window "${escapedName}"
    return true
  end try
end tell
return false
`;
    }

    runAppleScript(script).then((stdout) => {
      const found = (stdout || '').trim() === 'true';
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

/**
 * Terminalウィンドウの背景色・テキスト色を設定
 * macOS Terminal.appは16bit色（0-65535）を使用するため、RGB 0-255を×257で変換
 * @param {string} windowId - ウィンドウID（数値IDまたはttyパス）
 * @param {{bgColor?: {r: number, g: number, b: number}, textColor?: {r: number, g: number, b: number}}} options
 */
function setTerminalColor(windowId, options) {
  const { bgColor, textColor } = options || {};
  if (!bgColor && !textColor) return;

  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);

  // RGB 0-255 → Terminal 16bit (0-65535)
  const to16bit = (c) => Math.round(c * 257);

  let findTarget;
  if (isNumericId) {
    findTarget = `
tell application "Terminal"
  repeat with w in windows
    if id of w is ${windowId} then
      set targetTab to selected tab of w
      set found to true
      exit repeat
    end if
  end repeat
end tell`;
  } else if (isTtyPath) {
    const escapedTty = windowId.replace(/"/g, '\\"');
    findTarget = `
tell application "Terminal"
  repeat with w in windows
    try
      if tty of selected tab of w is equal to "${escapedTty}" then
        set targetTab to selected tab of w
        set found to true
        exit repeat
      end if
    end try
  end repeat
end tell`;
  } else {
    return; // 不明なIDフォーマット
  }

  let colorCommands = '';
  if (bgColor) {
    const r = to16bit(bgColor.r);
    const g = to16bit(bgColor.g);
    const b = to16bit(bgColor.b);
    colorCommands += `
      set background color of targetTab to {${r}, ${g}, ${b}}`;
  }
  if (textColor) {
    const r = to16bit(textColor.r);
    const g = to16bit(textColor.g);
    const b = to16bit(textColor.b);
    colorCommands += `
      set normal text color of targetTab to {${r}, ${g}, ${b}}`;
  }

  const script = `
set targetTab to missing value
set found to false
${findTarget}
if found then
  tell application "Terminal"
    ${colorCommands}
  end tell
end if
return found
`;

  runAppleScript(script, 15000);
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
