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
  return new Promise((resolve, reject) => {
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
        reject(new Error('AppleScript timeout'));
      }
    }, timeout);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && stderr) {
        const errMsg = stderr.trim().slice(0, 200);
        console.error('runAppleScript error:', errMsg);
        reject(new Error(errMsg));
        return;
      }
      resolve(stdout);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error('runAppleScript spawn error:', err.message);
      reject(new Error(err.message));
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
    }).catch((err) => {
      console.error('getAppWindows error:', err.message);
      resolve([]);
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
    }).catch((err) => {
      console.error('getBatchedGenericWindows error:', err.message);
      resolve([]);
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
    }).catch((err) => {
      console.error('getGenericAppWindows error:', err.message);
      resolve([]);
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
 * Dock風アニメーション - NSScreen事前計算（tell process ブロックの外で実行）
 *
 * NSScreen の Cocoa ブリッジ呼び出し（NSMinX, NSHeight 等）は
 * tell process ブロック内で実行すると型衝突（-1700）を起こすため、
 * ディスプレイ境界を事前にプレーンなリストとして計算しておく。
 * @returns {string} AppleScript スニペット（_scr* 変数を定義）
 */
function dockPreComputeSnippet() {
  return `
  set _scrLefts to {}
  set _scrRights to {}
  set _scrTops to {}
  set _scrBottoms to {}
  set _scrCenterXs to {}
  try
    set screenList to current application's NSScreen's screens()
    set mainFrame to (item 1 of screenList)'s frame()
    set _mainH to (current application's NSHeight(mainFrame)) as integer
    repeat with i from 1 to count of screenList
      set frm to (item i of screenList)'s frame()
      set fx to (current application's NSMinX(frm)) as integer
      set fy to (current application's NSMinY(frm)) as integer
      set fw to (current application's NSWidth(frm)) as integer
      set fh to (current application's NSHeight(frm)) as integer
      set end of _scrLefts to fx
      set end of _scrRights to fx + fw
      set end of _scrTops to _mainH - (fy + fh)
      set end of _scrBottoms to _mainH - fy
      set end of _scrCenterXs to fx + (fw div 2)
    end repeat
  end try
  set _scrCount to count of _scrLefts`;
}

/**
 * Dock風アニメーション - ウィンドウ操作（tell process ブロック内で実行）
 *
 * dockPreComputeSnippet() で定義された _scr* 変数を使って
 * ウィンドウが属するディスプレイを特定し、そのDock領域に向かって
 * スライド→復帰アニメーションを実行する。
 *
 * position のみ変更（size は変更しない）:
 *   Terminal.app は System Events 経由の set size 後にウィンドウ参照が
 *   無効化される問題があるため、position のみでアニメーションする。
 *
 * @param {string} windowVar - System Events ウィンドウ変数名
 * @returns {string} AppleScript スニペット
 */
function dockAnimateSnippet(windowVar) {
  return `
    try
      set {origX, origY} to position of ${windowVar}
      set {origW, origH} to size of ${windowVar}

      -- 斜め下方向にぬるっとスライドして戻る
      set dx to 40
      set dy to 70

      -- Phase 1: 斜め下へ（6フレーム、easeInOut）
      repeat with step from 1 to 6
        set t to step / 6
        set easedT to t * t * (3 - 2 * t)
        set newX to (origX + dx * easedT) as integer
        set newY to (origY + dy * easedT) as integer
        set position of ${windowVar} to {newX, newY}
        delay 0.02
      end repeat

      -- じわっと停止
      delay 0.15

      -- Phase 2: 元の位置に復帰（6フレーム、easeInOut逆順）
      repeat with step from 6 to 1 by -1
        set t to step / 6
        set easedT to t * t * (3 - 2 * t)
        set newX to (origX + dx * easedT) as integer
        set newY to (origY + dy * easedT) as integer
        set position of ${windowVar} to {newX, newY}
        delay 0.02
      end repeat

      -- 元の位置に確実に復帰
      set position of ${windowVar} to {origX, origY}
    end try`;
}

/**
 * 最小化復帰アニメーション（System Events / tell process ブロックの**外**で実行）
 *
 * Terminal/Finder はアプリ固有API (miniaturized/collapsed) で最小化→復帰。
 * 汎用アプリは System Events の AXMinimized 属性で操作。
 * 復帰後に再度 AXRaise して確実に前面化。
 *
 * @param {string} appType - 'Terminal' | 'Finder' | その他
 * @param {string} appName - アプリ名（汎用アプリ用）
 * @returns {string} AppleScript スニペット（outerSnippet として使用）
 */
function minimizeAnimationOuter(appType, appName) {
  const escaped = (appName || '').replace(/"/g, '\\"');
  if (appType === 'Terminal') {
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
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') :
                       anim === 'dock' ? dockAnimateSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Generic', appName) : '';
  const preCompute = anim === 'dock' ? dockPreComputeSnippet() : '';

  // 対象ウィンドウだけを前面に表示（AXRaise + activateWithOptions:2）
  // 名前が変わりやすいアプリ（ブラウザ等）のため3段階で検索:
  //   1. 完全一致  2. 部分一致(contains)  3. ウィンドウインデックス
  const script = `
use framework "AppKit"
use scripting additions
${preCompute}

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
      -- 最小化解除 + アクティベーション + アニメーション
      if targetW is not missing value then
        try
          if value of attribute "AXMinimized" of targetW is true then
            set value of attribute "AXMinimized" of targetW to false
            delay 0.3
          end if
        end try
        perform action "AXRaise" of targetW
${innerSnippet}
      end if
    end try
  end tell
end tell
${outerSnippet}
-- activateWithOptions:2 = 対象ウィンドウだけ前面化（AllWindows なし）
try
  set allApps to current application's NSWorkspace's sharedWorkspace()'s runningApplications()
  repeat with a in allApps
    if (a's localizedName() as text) is "${escapedApp}" then
      a's activateWithOptions:2
      exit repeat
    end if
  end repeat
end try
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
    }).catch((err) => {
      resolve({ success: false, error: err.message });
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
    }).catch((err) => {
      resolve({ success: false, error: err.message });
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
  const anim = animation || 'minimize';
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') :
                       anim === 'dock' ? dockAnimateSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Terminal', 'Terminal') : '';
  const preCompute = anim === 'dock' ? dockPreComputeSnippet() : '';

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
      if miniaturized of w then set miniaturized of w to false
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
        if miniaturized of w then set miniaturized of w to false
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
        if miniaturized of w then set miniaturized of w to false
        set index of w to 1
        set found to true
        exit repeat
      end if
    end try
  end repeat
end tell`;
  }

  // Step 2: System Eventsで名前ベースでウィンドウを検索してAXRaise + activateWithOptions:2（対象ウィンドウのみ前面化）
  const script = `
use framework "AppKit"
use scripting additions
${preCompute}

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
${outerSnippet}
  -- activateWithOptions:2 = NSApplicationActivateIgnoringOtherApps のみ（AllWindows なし）
  -- 対象ウィンドウだけが前面に来る（他のTerminalウィンドウは巻き込まない）
  delay 0.15
  try
    set termApp to (current application's NSRunningApplication's runningApplicationsWithBundleIdentifier:"com.apple.Terminal")'s firstObject()
    if termApp is not missing value then
      termApp's activateWithOptions:2
    end if
  end try
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
    set w to Finder window id ${windowId}
    if collapsed of w then set collapsed of w to false
    set targetWindowName to name of w
    set targetWindowId to ${windowId}
    set index of w to 1
    set found to true
  end try
  if not found and "${escapedName}" is not "" then
    try
      set w to Finder window "${escapedName}"
      if collapsed of w then set collapsed of w to false
      set targetWindowName to name of w
      set targetWindowId to id of w
      set index of w to 1
      set found to true
    end try
  end if
end tell`;
  } else {
    findWindow = `
tell application "Finder"
  try
    set w to Finder window "${escapedName}"
    if collapsed of w then set collapsed of w to false
    set targetWindowName to name of w
    set targetWindowId to id of w
    set index of w to 1
    set found to true
  end try
end tell`;
  }

  const anim = animation || 'minimize';
  const innerSnippet = anim === 'pop' ? popAnimationSnippet('targetW') :
                       anim === 'dock' ? dockAnimateSnippet('targetW') : '';
  const outerSnippet = anim === 'minimize' ? minimizeAnimationOuter('Finder', 'Finder') : '';
  const preCompute = anim === 'dock' ? dockPreComputeSnippet() : '';
  const script = `
use framework "AppKit"
use scripting additions
${preCompute}

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
${outerSnippet}
  try
    set finderApp to (current application's NSRunningApplication's runningApplicationsWithBundleIdentifier:"com.apple.finder")'s firstObject()
    if finderApp is not missing value then
      finderApp's activateWithOptions:2
    end if
  end try
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
    }).catch((err) => {
      resolve({ success: false, error: err.message });
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

    // Finder window id X による直接アクセス方式
    // Finder の id は整数型のため、as integer で明示的に型変換
    let script;
    if (isNumericId) {
      script = `
tell application "Finder"
  set targetId to ${windowId} as integer
  try
    close Finder window id targetId
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
    }).catch((err) => {
      resolve({ success: false, error: err.message });
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

// =========================================================
// Terminal ガラス効果（マルチプロファイル方式）
// 色ごとに固有プロファイルを生成→一括import→ウィンドウ別に適用
// =========================================================

const GLASS_PROFILE_PREFIX = 'atelierx-glass';
let glassGenBinaryPath = null;
let glassGenCompiling = false;
const glassGenWaiters = [];

// ガラス適用前のオリジナル背景色キャッシュ (windowId → {r, g, b} 16bit)
const originalBgColors = new Map();
// 現在ガラスが適用されているウィンドウ
const glassActiveWindows = new Set();
// インポート済みプロファイル (hexKey → profileName)
const importedGlassProfiles = new Map();
// インポート中のPromise (hexKey → Promise)
const importingProfiles = new Map();

/**
 * 8bit RGB → hexキー (例: "0d0d14")
 */
function rgb8ToHexKey(r, g, b) {
  return `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * float RGB → hexキー
 */
function rgbFloatToHexKey(r, g, b) {
  return rgb8ToHexKey(
    Math.round(parseFloat(r) * 255),
    Math.round(parseFloat(g) * 255),
    Math.round(parseFloat(b) * 255)
  );
}

/**
 * ガラスプロファイル生成用Swiftバイナリを事前コンパイル（初回のみ）
 * args: bgR bgG bgB profileName
 */
function ensureGlassGenBinary() {
  if (glassGenBinaryPath && fs.existsSync(glassGenBinaryPath)) {
    return Promise.resolve(glassGenBinaryPath);
  }
  return new Promise((resolve) => {
    if (glassGenCompiling) {
      glassGenWaiters.push(resolve);
      return;
    }
    glassGenCompiling = true;

    const binPath = path.join(os.tmpdir(), 'atelierx-glass-gen4');
    const srcPath = path.join(os.tmpdir(), 'atelierx-glass-gen4.swift');
    const src = `import Cocoa
import Foundation
let args = CommandLine.arguments
let r = args.count > 1 ? Double(args[1]) ?? 0.05 : 0.05
let g = args.count > 2 ? Double(args[2]) ?? 0.05 : 0.05
let b = args.count > 3 ? Double(args[3]) ?? 0.08 : 0.08
let profileName = args.count > 4 ? args[4] : "atelierx-glass"
let bgColor = NSColor(calibratedRed: CGFloat(r), green: CGFloat(g), blue: CGFloat(b), alpha: 0.7)
let bgData = try! NSKeyedArchiver.archivedData(withRootObject: bgColor, requiringSecureCoding: false)
let textColor = NSColor(calibratedRed: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
let textData = try! NSKeyedArchiver.archivedData(withRootObject: textColor, requiringSecureCoding: false)
let cursorColor = NSColor(calibratedRed: 0.8, green: 0.8, blue: 0.8, alpha: 1.0)
let cursorData = try! NSKeyedArchiver.archivedData(withRootObject: cursorColor, requiringSecureCoding: false)
let profile: [String: Any] = [
    "name": profileName,
    "BackgroundColor": bgData,
    "TextColor": textData,
    "TextBoldColor": textData,
    "CursorColor": cursorData,
    "type": "Window Settings",
    "ProfileCurrentVersion": 2.07 as Double,
    "BackgroundBlur": 0.4 as Double,
]
let plistData = try! PropertyListSerialization.data(fromPropertyList: profile, format: .xml, options: 0)
let outPath = NSTemporaryDirectory() + profileName + ".terminal"
try! plistData.write(to: URL(fileURLWithPath: outPath))
`;
    fs.writeFileSync(srcPath, src);
    try { fs.unlinkSync(binPath); } catch (_) {}
    execFile('swiftc', ['-o', binPath, srcPath], { timeout: 60000 }, (err) => {
      glassGenCompiling = false;
      if (err) {
        console.error('ensureGlassGenBinary: compile error:', err.message);
        resolve(null);
        glassGenWaiters.forEach(w => w(null));
      } else {
        glassGenBinaryPath = binPath;
        resolve(binPath);
        glassGenWaiters.forEach(w => w(binPath));
      }
      glassGenWaiters.length = 0;
    });
  });
}

/**
 * 既存の atelierx-glass* プロファイルを全て削除
 */
function deleteAllGlassProfiles() {
  importedGlassProfiles.clear();
  return runAppleScript(`tell application "Terminal"
  set profileNames to name of every settings set
  repeat with pName in profileNames
    if pName starts with "atelierx-glass" then
      try
        delete settings set pName
      end try
    end if
  end repeat
end tell`, 10000).catch(() => {});
}

/**
 * ガラスプロファイルを事前準備（Swiftバイナリのコンパイル + デフォルトプロファイルimport）
 */
function preloadGlassProfile() {
  ensureGlassGenBinary().then((bin) => {
    if (!bin) return;
    ensureGlassProfile('0.0500', '0.0500', '0.0800');
  });
}

/**
 * 指定色のガラスプロファイルが存在することを保証し、プロファイル名を返す
 * @param {string} bgR - 0.0-1.0 float
 * @param {string} bgG
 * @param {string} bgB
 * @returns {Promise<string|null>} profileName or null
 */
function ensureGlassProfile(bgR, bgG, bgB) {
  const hexKey = rgbFloatToHexKey(bgR, bgG, bgB);
  const profileName = `${GLASS_PROFILE_PREFIX}-${hexKey}`;

  // 既にインポート済み
  if (importedGlassProfiles.has(hexKey)) {
    return Promise.resolve(profileName);
  }
  // 現在インポート中 → 同じPromiseを返す
  if (importingProfiles.has(hexKey)) {
    return importingProfiles.get(hexKey);
  }

  const importPromise = (async () => {
    const bin = await ensureGlassGenBinary();
    if (!bin) return null;

    // .terminal ファイル生成
    await new Promise((resolve) => {
      execFile(bin, [bgR, bgG, bgB, profileName], { timeout: 15000 }, (err) => {
        if (err) console.error('glass gen error:', err.message);
        resolve();
      });
    });

    const terminalFile = path.join(os.tmpdir(), `${profileName}.terminal`);
    if (!fs.existsSync(terminalFile)) return null;

    // インポート前のウィンドウID一覧
    let beforeIds = new Set();
    try {
      const result = await runAppleScript(
        'tell application "Terminal" to get id of every window', 5000
      );
      result.trim().split(', ').forEach(s => { if (s.trim()) beforeIds.add(s.trim()); });
    } catch (_) {}

    // open -g でバックグラウンドインポート
    await new Promise((resolve) => {
      exec(`open -g "${terminalFile}"`, { timeout: 10000 }, () => resolve());
    });
    await new Promise(r => setTimeout(r, 1200));

    // インポートで生成された新しいウィンドウを閉じる
    try {
      const result = await runAppleScript(
        'tell application "Terminal" to get id of every window', 5000
      );
      const afterIds = result.trim().split(', ').map(s => s.trim()).filter(Boolean);
      for (const id of afterIds) {
        if (!beforeIds.has(id)) {
          await runAppleScript(
            `tell application "Terminal" to close window id ${id}`, 5000
          ).catch(() => {});
          break;
        }
      }
    } catch (_) {}

    importedGlassProfiles.set(hexKey, profileName);
    importingProfiles.delete(hexKey);
    return profileName;
  })();

  importingProfiles.set(hexKey, importPromise);
  return importPromise;
}

/**
 * 複数色のプロファイルを一括インポート（未インポート分のみ）
 * @param {Array<{bgR: string, bgG: string, bgB: string}>} colorSpecs
 * @returns {Promise<Map<string, string>>} hexKey → profileName
 */
async function ensureGlassProfilesBatch(colorSpecs) {
  const result = new Map();
  const toImport = [];

  for (const spec of colorSpecs) {
    const hexKey = rgbFloatToHexKey(spec.bgR, spec.bgG, spec.bgB);
    const profileName = `${GLASS_PROFILE_PREFIX}-${hexKey}`;
    result.set(hexKey, profileName);
    if (!importedGlassProfiles.has(hexKey) && !importingProfiles.has(hexKey)) {
      toImport.push({ ...spec, hexKey, profileName });
    }
  }

  if (toImport.length === 0) return result;

  const bin = await ensureGlassGenBinary();
  if (!bin) return result;

  // 全 .terminal ファイルを並列生成
  await Promise.all(toImport.map(spec =>
    new Promise((resolve) => {
      execFile(bin, [spec.bgR, spec.bgG, spec.bgB, spec.profileName], { timeout: 15000 }, (err) => {
        if (err) console.error('glass gen error:', err.message);
        resolve();
      });
    })
  ));

  // インポート前のウィンドウID一覧
  let beforeIds = new Set();
  try {
    const result2 = await runAppleScript(
      'tell application "Terminal" to get id of every window', 5000
    );
    result2.trim().split(', ').forEach(s => { if (s.trim()) beforeIds.add(s.trim()); });
  } catch (_) {}

  // 全ファイルを一括 open -g
  const files = toImport
    .map(spec => `"${path.join(os.tmpdir(), `${spec.profileName}.terminal`)}"`)
    .join(' ');
  await new Promise((resolve) => {
    exec(`open -g ${files}`, { timeout: 15000 }, () => resolve());
  });
  await new Promise(r => setTimeout(r, 1500));

  // インポートで生成された新しいウィンドウを全て閉じる
  try {
    const result2 = await runAppleScript(
      'tell application "Terminal" to get id of every window', 5000
    );
    const afterIds = result2.trim().split(', ').map(s => s.trim()).filter(Boolean);
    for (const id of afterIds) {
      if (!beforeIds.has(id)) {
        runAppleScript(`tell application "Terminal" to close window id ${id}`, 5000).catch(() => {});
      }
    }
  } catch (_) {}
  await new Promise(r => setTimeout(r, 300));

  for (const spec of toImport) {
    importedGlassProfiles.set(spec.hexKey, spec.profileName);
  }
  return result;
}

/**
 * Terminal ウィンドウの背景色を取得
 * @returns {Promise<{r: number, g: number, b: number} | null>} 16-bit RGB
 */
function readTerminalBgColor(windowId) {
  const isNumericId = /^\d+$/.test(windowId);
  const isTtyPath = windowId.startsWith('/dev/');
  let script;
  if (isNumericId) {
    script = `tell application "Terminal"\n  repeat with w in windows\n    if id of w is ${windowId} then\n      return background color of selected tab of w\n    end if\n  end repeat\nend tell\nreturn ""`;
  } else if (isTtyPath) {
    const esc = windowId.replace(/"/g, '\\"');
    script = `tell application "Terminal"\n  repeat with w in windows\n    try\n      if tty of selected tab of w is equal to "${esc}" then\n        return background color of selected tab of w\n      end if\n    end try\n  end repeat\nend tell\nreturn ""`;
  } else {
    return Promise.resolve(null);
  }
  return runAppleScript(script, 10000).then((out) => {
    const parts = out.trim().split(',').map(s => parseInt(s.trim()));
    return parts.length >= 3 && !isNaN(parts[0]) ? { r: parts[0], g: parts[1], b: parts[2] } : null;
  }).catch(() => null);
}

/**
 * 指定プロファイルをウィンドウに適用
 */
function applyProfileToWindow(windowId, profileName) {
  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);
  let script;
  if (isNumericId) {
    script = `tell application "Terminal"\n  repeat with w in windows\n    if id of w is ${windowId} then\n      set current settings of selected tab of w to settings set "${profileName}"\n      exit repeat\n    end if\n  end repeat\nend tell`;
  } else if (isTtyPath) {
    const esc = windowId.replace(/"/g, '\\"');
    script = `tell application "Terminal"\n  repeat with w in windows\n    try\n      if tty of selected tab of w is equal to "${esc}" then\n        set current settings of selected tab of w to settings set "${profileName}"\n        exit repeat\n      end if\n    end try\n  end repeat\nend tell`;
  } else {
    return;
  }
  runAppleScript(script, 15000).catch((err) => {
    console.error('applyProfileToWindow error:', err.message);
  });
}

/**
 * 16bit色 → ガラス用 float 文字列（白背景はダーク色にフォールバック）
 */
function colorToGlassParams(color16bit) {
  const isLight = color16bit && (color16bit.r + color16bit.g + color16bit.b) > 150000;
  return {
    bgR: isLight ? '0.0500' : (color16bit ? (color16bit.r / 65535).toFixed(4) : '0.0500'),
    bgG: isLight ? '0.0500' : (color16bit ? (color16bit.g / 65535).toFixed(4) : '0.0500'),
    bgB: isLight ? '0.0800' : (color16bit ? (color16bit.b / 65535).toFixed(4) : '0.0800'),
  };
}

/**
 * Terminal ウィンドウにガラス効果を適用/解除
 * @param {string} windowId
 * @param {boolean} enable
 * @param {{r: number, g: number, b: number}|null} [color8bit] - 8bit RGB色
 */
function setTerminalGlass(windowId, enable, color8bit) {
  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);
  if (!isTtyPath && !isNumericId) return;

  if (!enable) {
    glassActiveWindows.delete(windowId);
    const cached = originalBgColors.get(windowId);
    if (cached) {
      const to8bit = (v) => Math.round(v / 257);
      setTerminalColor(windowId, {
        bgColor: { r: to8bit(cached.r), g: to8bit(cached.g), b: to8bit(cached.b) },
        textColor: { r: 230, g: 230, b: 235 },
      });
      originalBgColors.delete(windowId);
    } else {
      setTerminalColor(windowId, {
        bgColor: { r: 0, g: 0, b: 0 },
        textColor: { r: 230, g: 230, b: 235 },
      });
    }
    return;
  }

  // ガラスON
  const applyGlass = (color16bit) => {
    const { bgR, bgG, bgB } = colorToGlassParams(color16bit);
    ensureGlassProfile(bgR, bgG, bgB).then((profileName) => {
      if (profileName) {
        glassActiveWindows.add(windowId);
        setTimeout(() => applyProfileToWindow(windowId, profileName), 300);
      }
    });
  };

  if (color8bit) {
    const color16 = { r: color8bit.r * 257, g: color8bit.g * 257, b: color8bit.b * 257 };
    if (!glassActiveWindows.has(windowId)) {
      readTerminalBgColor(windowId).then((origColor) => {
        if (origColor) originalBgColors.set(windowId, origColor);
        applyGlass(color16);
      });
    } else {
      applyGlass(color16);
    }
  } else if (glassActiveWindows.has(windowId)) {
    const cached = originalBgColors.get(windowId);
    applyGlass(cached || null);
  } else {
    readTerminalBgColor(windowId).then((color) => {
      if (color) originalBgColors.set(windowId, color);
      applyGlass(color);
    });
  }
}

/**
 * 複数ウィンドウに一括でガラス効果を適用/解除
 * windowColorMap がある場合、各ウィンドウに個別の色を適用
 * @param {string[]} windowIds
 * @param {boolean} enable
 * @param {{r: number, g: number, b: number}|null} [color8bit] - 全ウィンドウ共通の8bit色
 * @param {Object|null} [windowColorMap] - windowId → {r,g,b} 8bit の個別色マップ
 */
function setTerminalGlassBatch(windowIds, enable, color8bit, windowColorMap) {
  const valid = windowIds.filter(id => /^\d+$/.test(id) || id.startsWith('/dev/'));
  if (valid.length === 0) return;

  if (!enable) {
    valid.forEach(wid => setTerminalGlass(wid, false));
    return;
  }

  // 個別色マップがある場合 → 各ウィンドウを個別処理
  if (windowColorMap) {
    const uncached = valid.filter(wid => !glassActiveWindows.has(wid));
    const cachePromise = uncached.length > 0
      ? Promise.all(uncached.map(wid =>
          readTerminalBgColor(wid).then(c => { if (c) originalBgColors.set(wid, c); })
        ))
      : Promise.resolve();

    cachePromise.then(() => {
      // 必要な色を全て収集
      const colorSpecs = [];
      const widToSpec = new Map();
      for (const wid of valid) {
        const c = windowColorMap[wid] || color8bit;
        const color16 = c
          ? { r: c.r * 257, g: c.g * 257, b: c.b * 257 }
          : (originalBgColors.get(wid) || null);
        const { bgR, bgG, bgB } = colorToGlassParams(color16);
        const hexKey = rgbFloatToHexKey(bgR, bgG, bgB);
        widToSpec.set(wid, { bgR, bgG, bgB, hexKey });
        if (!colorSpecs.find(s => s.hexKey === hexKey)) {
          colorSpecs.push({ bgR, bgG, bgB, hexKey });
        }
      }

      // 一括インポート
      ensureGlassProfilesBatch(colorSpecs).then((profileMap) => {
        // 各ウィンドウに対応するプロファイルを適用
        setTimeout(() => {
          for (const wid of valid) {
            glassActiveWindows.add(wid);
            const spec = widToSpec.get(wid);
            const profileName = profileMap.get(spec.hexKey) || `${GLASS_PROFILE_PREFIX}-${spec.hexKey}`;
            applyProfileToWindow(wid, profileName);
          }
        }, 300);
      });
    });
    return;
  }

  // 共通色 or 各ウィンドウの現在色を保持して半透明化
  const uncached = valid.filter(wid => !glassActiveWindows.has(wid));
  const cachePromise = uncached.length > 0
    ? Promise.all(uncached.map(wid =>
        readTerminalBgColor(wid).then(c => { if (c) originalBgColors.set(wid, c); })
      ))
    : Promise.resolve();

  cachePromise.then(() => {
    if (color8bit) {
      // 共通色指定あり → 全ウィンドウ同じプロファイル
      const color16 = { r: color8bit.r * 257, g: color8bit.g * 257, b: color8bit.b * 257 };
      const { bgR, bgG, bgB } = colorToGlassParams(color16);
      ensureGlassProfile(bgR, bgG, bgB).then((profileName) => {
        if (!profileName) return;
        valid.forEach(wid => glassActiveWindows.add(wid));
        const conditions = valid.map(wid => {
          if (/^\d+$/.test(wid)) {
            return `          if id of w is ${wid} then\n            set current settings of selected tab of w to settings set "${profileName}"\n          end if`;
          } else if (wid.startsWith('/dev/')) {
            const esc = wid.replace(/"/g, '\\"');
            return `          try\n            if tty of selected tab of w is equal to "${esc}" then\n              set current settings of selected tab of w to settings set "${profileName}"\n            end if\n          end try`;
          }
          return '';
        }).filter(Boolean).join('\n');
        const script = `tell application "Terminal"\n  repeat with w in windows\n${conditions}\n  end repeat\nend tell`;
        setTimeout(() => {
          runAppleScript(script, 15000).catch(err => console.error('batch apply error:', err.message));
        }, 300);
      });
    } else {
      // 色指定なし → 各ウィンドウの現在色を個別に半透明化
      const colorSpecs = [];
      const widToSpec = new Map();
      for (const wid of valid) {
        const color16 = originalBgColors.get(wid) || null;
        const { bgR, bgG, bgB } = colorToGlassParams(color16);
        const hexKey = rgbFloatToHexKey(bgR, bgG, bgB);
        widToSpec.set(wid, { bgR, bgG, bgB, hexKey });
        if (!colorSpecs.find(s => s.hexKey === hexKey)) {
          colorSpecs.push({ bgR, bgG, bgB, hexKey });
        }
      }
      ensureGlassProfilesBatch(colorSpecs).then((profileMap) => {
        setTimeout(() => {
          for (const wid of valid) {
            glassActiveWindows.add(wid);
            const spec = widToSpec.get(wid);
            const profileName = profileMap.get(spec.hexKey) || `${GLASS_PROFILE_PREFIX}-${spec.hexKey}`;
            applyProfileToWindow(wid, profileName);
          }
        }, 300);
      });
    }
  });
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

  runAppleScript(script, 15000).catch((err) => {
    console.error('setTerminalColor error:', err.message);
  });
}

/**
 * ガラス状態のキャッシュだけクリア（AppleScript実行なし）
 * リセット時に setTerminalColor と競合しないようにするため
 */
function clearTerminalGlassState(windowIds) {
  for (const wid of windowIds) {
    glassActiveWindows.delete(wid);
    originalBgColors.delete(wid);
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
  setTerminalColor,
  setTerminalGlass,
  setTerminalGlassBatch,
  preloadGlassProfile,
  clearTerminalGlassState,
};
