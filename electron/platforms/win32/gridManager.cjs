/**
 * Grid Manager - Win32 実装
 * getDisplayInfo は Electron screen API で実データ返却
 * Grid 配置は PowerShell + user32.dll SetWindowPos で実装
 */

const { screen } = require('electron');
const { execFile } = require('child_process');

function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('PowerShell grid error:', (stderr || error.message).slice(0, 200));
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

function getDisplayInfo() {
  const displays = screen.getAllDisplays();
  return displays.map((d, i) => ({
    index: i + 1,
    frameX: d.bounds.x,
    frameY: d.bounds.y,
    frameW: d.bounds.width,
    frameH: d.bounds.height,
    asX: d.workArea.x,
    asY: d.workArea.y,
    visibleW: d.workArea.width,
    visibleH: d.workArea.height,
    isMain: d.bounds.x === 0 && d.bounds.y === 0,
  }));
}

/**
 * 指定プロセスのウィンドウをグリッド配置する PowerShell スクリプトを生成
 * @param {string} processName - プロセス名
 * @param {object} options - { cols, rows, displayIndex }
 */
function buildGridScript(processName, options = {}) {
  const { cols = 0, rows = 0, displayIndex = 0 } = options;
  const escaped = processName.replace(/'/g, "''");

  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class GridAPI {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int maxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static List<IntPtr> windowHandles = new List<IntPtr>();
    public static HashSet<uint> targetPids;
    public static bool Callback(IntPtr hWnd, IntPtr lParam) {
        if (!IsWindowVisible(hWnd)) return true;
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return true;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (!targetPids.Contains(pid)) return true;
        RECT r;
        GetWindowRect(hWnd, out r);
        if ((r.Right - r.Left) < 50 || (r.Bottom - r.Top) < 50) return true;
        windowHandles.Add(hWnd);
        return true;
    }
}
"@
$targetProc = '${escaped}'
$pids = [System.Collections.Generic.HashSet[uint]]::new()
Get-Process -Name $targetProc -ErrorAction SilentlyContinue | ForEach-Object { $pids.Add([uint]$_.Id) | Out-Null }
if ($pids.Count -eq 0) { Write-Output '0'; exit }
[GridAPI]::targetPids = $pids
[GridAPI]::windowHandles.Clear()
[GridAPI]::EnumWindows([GridAPI+EnumWindowsProc]::new([GridAPI], 'Callback'), [IntPtr]::Zero) | Out-Null
$windows = [GridAPI]::windowHandles
$cnt = $windows.Count
if ($cnt -eq 0) { Write-Output '0'; exit }

# ディスプレイ情報
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$targetDisplay = ${displayIndex}

function Get-GridDims($count, $screenW) {
    $userCols = ${cols}
    $userRows = ${rows}
    if ($userCols -gt 0) { $gridC = $userCols }
    elseif ($count -le 1) { $gridC = 1 }
    elseif ($count -le 2) { $gridC = 2 }
    elseif ($count -le 6) { $gridC = 3 }
    elseif ($count -le 12) { $gridC = 4 }
    elseif ($count -le 20) { $gridC = 5 }
    else { $gridC = 6 }
    if ($screenW -gt 3000 -and $gridC -lt 5) { $gridC = 5 }
    if ($screenW -gt 2560 -and $gridC -lt 4) { $gridC = 4 }
    if ($screenW -gt 1920 -and $gridC -lt 3) { $gridC = 3 }
    if ($userRows -gt 0) { $gridR = $userRows }
    else { $gridR = [math]::Ceiling($count / $gridC) }
    return @($gridC, $gridR)
}

$SWP_NOZORDER = 0x0004
$arranged = 0

if ($targetDisplay -gt 0 -and $targetDisplay -le $screens.Length) {
    $scr = $screens[$targetDisplay - 1]
    $wa = $scr.WorkingArea
    $dims = Get-GridDims $cnt $wa.Width
    $gridC = $dims[0]; $gridR = $dims[1]
    for ($i = 0; $i -lt $cnt; $i++) {
        $gC = $i % $gridC
        $gR = [math]::Floor($i / $gridC)
        $x1 = $wa.X + [math]::Floor($wa.Width * $gC / $gridC)
        $x2 = $wa.X + [math]::Floor($wa.Width * ($gC + 1) / $gridC)
        $y1 = $wa.Y + [math]::Floor($wa.Height * $gR / $gridR)
        $y2 = $wa.Y + [math]::Floor($wa.Height * ($gR + 1) / $gridR)
        [GridAPI]::SetWindowPos($windows[$i], [IntPtr]::Zero, $x1, $y1, ($x2 - $x1), ($y2 - $y1), $SWP_NOZORDER)
        $arranged++
    }
} else {
    # 自動モード: 各ディスプレイ上のウィンドウを個別に配置
    foreach ($scr in $screens) {
        $wa = $scr.WorkingArea
        $displayWindows = @()
        for ($i = 0; $i -lt $cnt; $i++) {
            $r = New-Object GridAPI+RECT
            [GridAPI]::GetWindowRect($windows[$i], [ref]$r) | Out-Null
            $cx = ($r.Left + $r.Right) / 2
            $cy = ($r.Top + $r.Bottom) / 2
            if ($cx -ge $wa.X -and $cx -lt ($wa.X + $wa.Width) -and $cy -ge $wa.Y -and $cy -lt ($wa.Y + $wa.Height)) {
                $displayWindows += $windows[$i]
            }
        }
        $dc = $displayWindows.Count
        if ($dc -gt 0) {
            $dims = Get-GridDims $dc $wa.Width
            $gridC = $dims[0]; $gridR = $dims[1]
            for ($j = 0; $j -lt $dc; $j++) {
                $gC = $j % $gridC
                $gR = [math]::Floor($j / $gridC)
                $x1 = $wa.X + [math]::Floor($wa.Width * $gC / $gridC)
                $x2 = $wa.X + [math]::Floor($wa.Width * ($gC + 1) / $gridC)
                $y1 = $wa.Y + [math]::Floor($wa.Height * $gR / $gridR)
                $y2 = $wa.Y + [math]::Floor($wa.Height * ($gR + 1) / $gridR)
                [GridAPI]::SetWindowPos($displayWindows[$j], [IntPtr]::Zero, $x1, $y1, ($x2 - $x1), ($y2 - $y1), $SWP_NOZORDER)
                $arranged++
            }
        }
    }
}
Write-Output $arranged
`;
}

async function arrangeTerminalGrid(options = {}) {
  try {
    // Windows Terminal + PowerShell + CMD を対象
    let total = 0;
    for (const proc of ['WindowsTerminal', 'powershell', 'pwsh', 'cmd']) {
      const result = await runPowerShell(buildGridScript(proc, options), 30000);
      total += parseInt(result.trim()) || 0;
    }
    return { success: true, arranged: total };
  } catch (error) {
    console.error('arrangeTerminalGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeFinderGrid(options = {}) {
  try {
    const result = await runPowerShell(buildGridScript('explorer', options), 20000);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeFinderGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

async function arrangeGenericGrid(appName, options = {}) {
  try {
    const result = await runPowerShell(buildGridScript(appName, options), 30000);
    return { success: true, arranged: parseInt(result.trim()) || 0 };
  } catch (error) {
    console.error('arrangeGenericGrid error:', error);
    return { success: false, error: error.message, arranged: 0 };
  }
}

module.exports = {
  getDisplayInfo,
  arrangeTerminalGrid,
  arrangeFinderGrid,
  arrangeGenericGrid,
};
