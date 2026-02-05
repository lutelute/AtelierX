/**
 * App Scanner - Win32 実装
 * レジストリ + Program Files スキャンでインストール済みアプリを取得
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let cachedApps = null;

function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve(stdout || '');
    });
  });
}

/**
 * インストール済みアプリをスキャンして一覧を返す
 */
async function scanInstalledApps() {
  if (cachedApps) return cachedApps;

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$apps = @()
$regPaths = @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
foreach ($regPath in $regPaths) {
    try {
        Get-ItemProperty $regPath -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentDisplayName } |
        ForEach-Object {
            $name = $_.DisplayName
            $icon = $_.DisplayIcon
            $installDir = $_.InstallLocation
            if (-not $installDir) { $installDir = '' }
            $apps += "$name|$icon|$installDir"
        }
    } catch {}
}
# スタートメニューのショートカットからも取得
$startPaths = @(
    [System.Environment]::GetFolderPath('CommonStartMenu') + '\\Programs',
    [System.Environment]::GetFolderPath('StartMenu') + '\\Programs'
)
foreach ($sp in $startPaths) {
    if (Test-Path $sp) {
        Get-ChildItem -Path $sp -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $shell = New-Object -ComObject WScript.Shell
                $lnk = $shell.CreateShortcut($_.FullName)
                $target = $lnk.TargetPath
                if ($target -and $target.EndsWith('.exe') -and (Test-Path $target)) {
                    $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                    $apps += "$name|$target|"
                }
            } catch {}
        }
    }
}
$apps | Sort-Object -Unique | Select-Object -First 500
`;

  const stdout = await runPowerShell(script, 30000);
  const results = [];
  const seen = new Set();

  for (const line of (stdout || '').trim().split('\n')) {
    if (!line) continue;
    const parts = line.trim().split('|');
    const appName = parts[0] || '';
    if (!appName || seen.has(appName.toLowerCase())) continue;
    seen.add(appName.toLowerCase());

    const iconPath = parts[1] || '';
    const installDir = parts[2] || '';

    results.push({
      appName,
      bundleId: '',
      path: installDir || iconPath,
      iconDataUri: '', // アイコン抽出は重いのでスキップ（必要時に getAppIcon で取得）
    });
  }

  results.sort((a, b) => a.appName.localeCompare(b.appName));
  cachedApps = results;
  return results;
}

function clearAppCache() {
  cachedApps = null;
}

/**
 * 単一アプリのアイコンを取得
 * PowerShell で .exe から アイコンを抽出して base64 PNG に変換
 */
async function getAppIcon(appName) {
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$proc = Get-Process -Name '${appName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc -and $proc.Path) {
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($proc.Path)
        if ($icon) {
            $bmp = $icon.ToBitmap()
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $ms.ToArray()
            $b64 = [Convert]::ToBase64String($bytes)
            Write-Output "data:image/png;base64,$b64"
            $ms.Dispose()
            $bmp.Dispose()
            $icon.Dispose()
        }
    } catch {}
}
`;
  const result = await runPowerShell(script, 10000);
  return result.trim() || '';
}

module.exports = {
  scanInstalledApps,
  clearAppCache,
  getAppIcon,
};
