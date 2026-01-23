/**
 * Window Manager - macOS Terminal/Finder ウィンドウ操作モジュール
 */

const { exec, spawn } = require('child_process');

/**
 * Terminal/Finderのウィンドウ一覧を取得
 * @returns {Promise<Array<{app: string, id: string, name: string, path?: string}>>}
 */
function getAppWindows() {
  return new Promise((resolve) => {
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
                -- ttyパスを取得（セッション中ユニーク）
                set ttyPath to ""
                try
                  set ttyPath to tty of selected tab of w
                end try
                -- 実行中のプロセス一覧を取得
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

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }

      const lines = stdout.trim().split(', ');
      const windows = lines
        .filter(line => line.length > 0)
        .map((line, index) => {
          const parts = line.split('|');
          const app = parts[0] || 'Terminal';
          let preview = '';

          if (app === 'Terminal' && parts[3]) {
            // プロセス一覧をプレビューとして表示
            preview = parts[3].trim();
          }

          // Terminalの場合はttyをIDとして使用（より安定）
          const tty = parts[5]?.trim();
          const stableId = (app === 'Terminal' && tty) ? tty : (parts[1] || String(index + 1));

          return {
            app,
            id: stableId,  // ttyまたはウィンドウID
            name: parts[2] || 'Window',
            preview: preview || undefined,
            windowIndex: parseInt(parts[4]) || (index + 1),
            tty: tty || undefined,  // ttyパス（Terminal専用）
          };
        });

      resolve(windows);
    });
  });
}

/**
 * Terminalウィンドウをポップして前面に表示
 * @param {string} windowId - ウィンドウID（ttyパスまたは数値ID）
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateTerminalWindow(windowId, windowName) {
  const isTtyPath = windowId.startsWith('/dev/');
  const isNumericId = /^\d+$/.test(windowId);

  let script;
  if (isTtyPath) {
    // ttyパスで検索（最も確実）
    const escapedTty = windowId.replace(/"/g, '\\"');
    script = `
      set targetTty to "${escapedTty}"
      set found to false
      tell application "Terminal"
        repeat with w in windows
          try
            if tty of selected tab of w is equal to targetTty then
              set miniaturized of w to true
              set found to true
              exit repeat
            end if
          end try
        end repeat
        delay 0.2
        repeat with w in windows
          try
            if tty of selected tab of w is equal to targetTty then
              set miniaturized of w to false
              set index of w to 1
              exit repeat
            end if
          end try
        end repeat
        activate
      end tell
      return found
    `;
  } else if (isNumericId) {
    // IDで検索
    script = `
      set targetId to ${windowId}
      set found to false
      tell application "Terminal"
        repeat with w in windows
          if id of w is targetId then
            set miniaturized of w to true
            set found to true
            exit repeat
          end if
        end repeat
        delay 0.2
        repeat with w in windows
          if id of w is targetId then
            set miniaturized of w to false
            set index of w to 1
            exit repeat
          end if
        end repeat
        activate
      end tell
      return found
    `;
  } else {
    // 名前で検索（完全一致を優先、見つからなければ前方一致）
    const escapedName = windowName.replace(/"/g, '\\"');
    script = `
      set targetName to "${escapedName}"
      set found to false
      tell application "Terminal"
        -- 完全一致を試す
        repeat with w in windows
          if name of w is equal to targetName then
            set miniaturized of w to true
            set found to true
            exit repeat
          end if
        end repeat
        delay 0.2
        if found then
          repeat with w in windows
            if name of w is equal to targetName then
              set miniaturized of w to false
              set index of w to 1
              exit repeat
            end if
          end repeat
        else
          -- 完全一致が見つからない場合のみ前方一致を試す
          repeat with w in windows
            if name of w starts with targetName then
              set miniaturized of w to true
              set found to true
              exit repeat
            end if
          end repeat
          delay 0.2
          repeat with w in windows
            if name of w starts with targetName then
              set miniaturized of w to false
              set index of w to 1
              exit repeat
            end if
          end repeat
        end if
        activate
      end tell
      return found
    `;
  }

  const child = spawn('osascript', ['-e', script], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

/**
 * Finderウィンドウをポップして前面に表示
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 */
function activateFinderWindow(windowId, windowName) {
  const isNumericId = /^\d+$/.test(windowId);

  let script;
  if (isNumericId) {
    // IDで検索（最も確実）
    script = `
      set targetId to ${windowId}
      set found to false
      tell application "Finder"
        repeat with w in (get every Finder window)
          if id of w is targetId then
            set collapsed of w to true
            set found to true
            exit repeat
          end if
        end repeat
        delay 0.15
        repeat with w in (get every Finder window)
          if id of w is targetId then
            set collapsed of w to false
            set index of w to 1
            exit repeat
          end if
        end repeat
        activate
      end tell
      return found
    `;
  } else {
    // 名前で検索（完全一致を優先）
    const escapedName = windowName.replace(/"/g, '\\"');
    script = `
      set targetName to "${escapedName}"
      set found to false
      tell application "Finder"
        -- 完全一致を試す
        repeat with w in (get every Finder window)
          if name of w is equal to targetName then
            set collapsed of w to true
            set found to true
            exit repeat
          end if
        end repeat
        delay 0.15
        if found then
          repeat with w in (get every Finder window)
            if name of w is equal to targetName then
              set collapsed of w to false
              set index of w to 1
              exit repeat
            end if
          end repeat
        else
          -- 完全一致が見つからない場合のみ前方一致を試す
          repeat with w in (get every Finder window)
            if name of w starts with targetName then
              set collapsed of w to true
              set found to true
              exit repeat
            end if
          end repeat
          delay 0.15
          repeat with w in (get every Finder window)
            if name of w starts with targetName then
              set collapsed of w to false
              set index of w to 1
              exit repeat
            end if
          end repeat
        end if
        activate
      end tell
      return found
    `;
  }

  const child = spawn('osascript', ['-e', script], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

/**
 * 指定したウィンドウをアクティブにする
 * @param {string} appName - アプリ名 ('Terminal' | 'Finder')
 * @param {string} windowId - ウィンドウID
 * @param {string} windowName - ウィンドウ名（フォールバック用）
 * @returns {Promise<boolean>}
 */
function activateWindow(appName, windowId, windowName) {
  return new Promise((resolve) => {
    if (appName === 'Terminal') {
      activateTerminalWindow(windowId, windowName || windowId);
      resolve(true);
    } else if (appName === 'Finder') {
      activateFinderWindow(windowId, windowName || windowId);
      resolve(true);
    } else {
      resolve(false);
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

module.exports = {
  getAppWindows,
  activateWindow,
  openNewTerminalWindow,
  openNewFinderWindow,
};
