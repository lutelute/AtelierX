/**
 * Window Manager - Win32 実装
 * PowerShell 経由でウィンドウ列挙・アクティベーション・操作を実行
 */

const { execFile } = require('child_process');

/**
 * PowerShell スクリプトを実行して stdout を返す
 * @param {string} script - PowerShell コード
 * @param {number} [timeout=10000] - タイムアウト(ms)
 * @returns {Promise<string>}
 */
function runPowerShell(script, timeout = 10000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('PowerShell error:', (stderr || error.message).slice(0, 200));
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

/**
 * ウィンドウ一覧を取得
 * Windows Terminal / PowerShell / CMD / Explorer + 汎用アプリ
 * @param {string[]} [appNames] - 追加取得するアプリ名の配列
 * @returns {Promise<Array<{app: string, id: string, name: string, windowIndex?: number}>>}
 */
async function getAppWindows(appNames) {
  // ビルトインアプリ + 追加アプリ名を統合
  const builtinProcesses = ['WindowsTerminal', 'powershell', 'pwsh', 'cmd', 'explorer'];
  const extraApps = (appNames || []).filter(n => !builtinProcesses.includes(n));
  const allApps = [...builtinProcesses, ...extraApps];

  const processFilter = allApps.map(a => `'${a.replace(/'/g, "''")}'`).join(',');

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static List<string> results = new List<string>();
    public static HashSet<string> targetProcs;
    public static Dictionary<uint, string> procMap;
    public static bool EnumCallback(IntPtr hWnd, IntPtr lParam) {
        if (!IsWindowVisible(hWnd)) return true;
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return true;
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        string title = sb.ToString();
        if (string.IsNullOrWhiteSpace(title)) return true;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        string procName;
        if (!procMap.TryGetValue(pid, out procName)) return true;
        if (!targetProcs.Contains(procName)) return true;
        results.Add(procName + "|" + hWnd.ToInt64() + "|" + title);
        return true;
    }
}
"@
$targets = @(${processFilter})
[WinAPI]::targetProcs = [System.Collections.Generic.HashSet[string]]::new([string[]]$targets, [System.StringComparer]::OrdinalIgnoreCase)
[WinAPI]::procMap = @{}
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -or [WinAPI]::targetProcs.Contains($_.ProcessName) } | ForEach-Object {
    [WinAPI]::procMap[$_.Id] = $_.ProcessName
}
[WinAPI]::results.Clear()
[WinAPI]::EnumWindows([WinAPI+EnumWindowsProc]::new([WinAPI], 'EnumCallback'), [IntPtr]::Zero) | Out-Null
[WinAPI]::results -join [char]10
`;

  const stdout = await runPowerShell(script, 15000);
  const windows = [];
  const indexCounters = {};

  for (const line of (stdout || '').trim().split('\n')) {
    if (!line || !line.includes('|')) continue;
    const parts = line.trim().split('|');
    const procName = parts[0] || '';
    const hwnd = parts[1] || '';
    const title = parts[2] || 'Window';

    // プロセス名 → 表示用アプリ名
    let appName;
    if (/^(WindowsTerminal|powershell|pwsh|cmd)$/i.test(procName)) {
      appName = 'Windows Terminal';
    } else if (/^explorer$/i.test(procName)) {
      appName = 'File Explorer';
    } else {
      appName = procName;
    }

    // ウィンドウインデックス（アプリごと）
    indexCounters[appName] = (indexCounters[appName] || 0) + 1;

    windows.push({
      app: appName,
      id: hwnd,
      name: title,
      windowIndex: indexCounters[appName],
    });
  }

  return windows;
}

/**
 * ウィンドウをアクティブにする (SetForegroundWindow)
 */
async function activateWindow(appName, windowId, windowName, animation, windowIndex) {
  const hwnd = windowId;
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinActivate {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@
$hwnd = [IntPtr]::new(${hwnd})
if ([WinActivate]::IsIconic($hwnd)) {
    [WinActivate]::ShowWindow($hwnd, 9)  # SW_RESTORE
}
[WinActivate]::SetForegroundWindow($hwnd)
`;
  await runPowerShell(script);
  return true;
}

/**
 * 新しいターミナルウィンドウを開く (Windows Terminal → PowerShell → CMD)
 */
async function openNewTerminalWindow(initialPath) {
  return new Promise((resolve) => {
    const dir = initialPath ? `"${initialPath.replace(/"/g, '`"')}"` : '';

    // Windows Terminal を優先
    const wtCmd = dir ? `wt.exe -d ${dir}` : 'wt.exe';
    const fallbackCmd = dir
      ? `powershell.exe -NoExit -Command "Set-Location ${dir}"`
      : 'powershell.exe';

    execFile('where.exe', ['wt.exe'], { windowsHide: true }, (err) => {
      const cmd = err ? fallbackCmd : wtCmd;
      const parts = cmd.split(' ');
      execFile(parts[0], parts.slice(1), { windowsHide: false, detached: true, stdio: 'ignore' }, (launchErr) => {
        if (launchErr) {
          resolve({ success: false, error: launchErr.message });
          return;
        }
        resolve({ success: true, windowName: 'Windows Terminal' });
      });
    });
  });
}

/**
 * 新しいファイルエクスプローラーウィンドウを開く
 */
async function openNewFinderWindow(targetPath) {
  return new Promise((resolve) => {
    const dir = targetPath || process.env.USERPROFILE || 'C:\\';
    execFile('explorer.exe', [dir], { windowsHide: false }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }
      resolve({ success: true, windowName: dir, path: dir });
    });
  });
}

/**
 * 汎用アプリの新しいウィンドウを開く (Ctrl+N をシミュレーション)
 */
async function openNewGenericWindow(appName) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinKeys {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$proc = Get-Process -Name '${appName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc -and $proc.MainWindowHandle -ne 0) {
    [WinKeys]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 300
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('^n')
    Write-Output 'OK'
} else {
    Write-Output 'NOT_FOUND'
}
`;
  const result = await runPowerShell(script, 10000);
  if (result.trim() === 'OK') {
    return { success: true, windowName: appName };
  }
  return { success: false, error: 'App not found or not running' };
}

/**
 * ウィンドウを閉じる
 */
async function closeWindow(appName, windowId, windowName) {
  const hwnd = windowId;
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinClose {
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$hwnd = [IntPtr]::new(${hwnd})
[WinClose]::SendMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)  # WM_CLOSE
Write-Output 'true'
`;
  const result = await runPowerShell(script);
  const success = result.trim() === 'true';
  return { success, error: success ? undefined : 'Failed to close window' };
}

/**
 * 汎用アプリのウィンドウ一覧を取得
 */
async function getGenericAppWindows(appName) {
  return getAppWindows([appName]);
}

/**
 * ターミナル色設定 — Windows では未サポート (no-op)
 */
function setTerminalColor(_windowId, _options) {
  // Windows Terminal はプロファイルベースのテーマ切替のみ
  // リアルタイム色変更 API がないため no-op
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
