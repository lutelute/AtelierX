/**
 * App Scanner - Linux 実装
 * .desktop ファイルをスキャンしてインストール済みアプリを取得
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let cachedApps = null;

/**
 * .desktop ファイルを解析して Name, Exec, Icon を抽出
 */
function parseDesktopFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let inDesktopEntry = false;
    const entry = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[Desktop Entry]') {
        inDesktopEntry = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed !== '[Desktop Entry]') {
        inDesktopEntry = false;
        continue;
      }
      if (!inDesktopEntry) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex < 0) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      // ロケール付きキーは無視 (Name[ja] 等)
      if (key.includes('[')) continue;

      if (['Name', 'Exec', 'Icon', 'Type', 'NoDisplay', 'Hidden'].includes(key)) {
        entry[key] = value;
      }
    }

    return entry;
  } catch {
    return null;
  }
}

/**
 * インストール済みアプリをスキャンして一覧を返す
 */
async function scanInstalledApps() {
  if (cachedApps) return cachedApps;

  const searchDirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    path.join(os.homedir(), '.local/share/applications'),
    // Flatpak
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'),
    // Snap
    '/snap/current/meta/gui',
  ];

  const results = [];
  const seen = new Set();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.desktop')) continue;
      const fullPath = path.join(dir, file);
      const entry = parseDesktopFile(fullPath);

      if (!entry || entry.Type !== 'Application') continue;
      if (entry.NoDisplay === 'true' || entry.Hidden === 'true') continue;

      const appName = entry.Name || path.basename(file, '.desktop');
      if (seen.has(appName.toLowerCase())) continue;
      seen.add(appName.toLowerCase());

      // Exec から実行可能ファイルのパスを抽出
      const execPath = (entry.Exec || '').split(/\s/)[0] || '';

      results.push({
        appName,
        bundleId: path.basename(file, '.desktop'),
        path: execPath,
        iconDataUri: '', // アイコンは getAppIcon で取得
      });
    }
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
 * .desktop の Icon エントリからアイコンテーマ内のファイルを探索
 */
async function getAppIcon(appName) {
  const { exec } = require('child_process');

  // .desktop ファイルからアイコン名を取得
  const searchDirs = [
    '/usr/share/applications',
    path.join(os.homedir(), '.local/share/applications'),
  ];

  let iconName = '';
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.desktop')) continue;
        const entry = parseDesktopFile(path.join(dir, file));
        if (entry && entry.Name && entry.Name.toLowerCase() === appName.toLowerCase()) {
          iconName = entry.Icon || '';
          break;
        }
      }
    } catch { /* ignore */ }
    if (iconName) break;
  }

  if (!iconName) return '';

  // 絶対パスの場合
  if (iconName.startsWith('/') && fs.existsSync(iconName)) {
    return iconToDataUri(iconName);
  }

  // アイコンテーマから検索
  const iconDirs = [
    '/usr/share/icons/hicolor',
    '/usr/share/pixmaps',
    path.join(os.homedir(), '.local/share/icons/hicolor'),
  ];

  const sizes = ['32x32', '48x48', '64x64', '128x128', '256x256', 'scalable'];
  const exts = ['.png', '.svg', '.xpm'];

  for (const iconDir of iconDirs) {
    for (const size of sizes) {
      for (const ext of exts) {
        const categories = ['apps', ''];
        for (const cat of categories) {
          const iconPath = cat
            ? path.join(iconDir, size, cat, iconName + ext)
            : path.join(iconDir, iconName + ext);
          if (fs.existsSync(iconPath)) {
            return iconToDataUri(iconPath);
          }
        }
      }
    }
  }

  return '';
}

/**
 * アイコンファイルを base64 data URI に変換
 */
function iconToDataUri(iconPath) {
  try {
    const ext = path.extname(iconPath).toLowerCase();
    const buffer = fs.readFileSync(iconPath);
    const b64 = buffer.toString('base64');

    if (ext === '.svg') {
      return `data:image/svg+xml;base64,${b64}`;
    } else if (ext === '.png') {
      return `data:image/png;base64,${b64}`;
    }
    return '';
  } catch {
    return '';
  }
}

module.exports = {
  scanInstalledApps,
  clearAppCache,
  getAppIcon,
};
