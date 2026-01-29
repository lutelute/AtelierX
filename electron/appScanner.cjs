/**
 * AtelierX - インストール済みアプリスキャナー
 * /Applications をスキャンしてアプリ一覧とアイコンを取得
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// キャッシュ
let cachedApps = null;

/**
 * インストール済みアプリをスキャンして一覧を返す
 * @returns {Promise<Array<{appName: string, bundleId: string, path: string, iconDataUri: string}>>}
 */
async function scanInstalledApps() {
  // キャッシュがあればそのまま返す
  if (cachedApps) {
    return cachedApps;
  }

  const appDirs = ['/Applications', '/Applications/Utilities'];
  const results = [];
  const tmpDir = path.join(os.tmpdir(), 'atelierx-icons');

  // 一時ディレクトリを作成
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  for (const dir of appDirs) {
    if (!fs.existsSync(dir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.app')) continue;

      const appPath = path.join(dir, entry);
      const plistPath = path.join(appPath, 'Contents', 'Info.plist');

      if (!fs.existsSync(plistPath)) continue;

      try {
        const appInfo = parseAppInfo(plistPath, appPath);
        if (!appInfo) continue;

        // アイコンを取得
        const iconDataUri = extractIconDataUri(appPath, appInfo.iconFile, tmpDir);

        results.push({
          appName: appInfo.appName,
          bundleId: appInfo.bundleId,
          path: appPath,
          iconDataUri: iconDataUri || '',
        });
      } catch (err) {
        // 個別アプリのエラーは無視して続行
        console.error(`Failed to scan ${entry}:`, err.message);
      }
    }
  }

  // アプリ名でソート
  results.sort((a, b) => a.appName.localeCompare(b.appName, 'ja'));

  // キャッシュに保存
  cachedApps = results;

  // 一時ディレクトリをクリーンアップ
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // クリーンアップ失敗は無視
  }

  return results;
}

/**
 * Info.plist を解析してアプリ情報を取得
 */
function parseAppInfo(plistPath, appPath) {
  try {
    // plutil で JSON に変換して読み取り
    const jsonStr = execSync(
      `/usr/bin/plutil -convert json -o - "${plistPath}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const plist = JSON.parse(jsonStr);

    const appName = plist.CFBundleDisplayName
      || plist.CFBundleName
      || path.basename(appPath, '.app');

    const bundleId = plist.CFBundleIdentifier || '';
    const iconFile = plist.CFBundleIconFile || '';

    return { appName, bundleId, iconFile };
  } catch {
    // plutil 失敗時はファイル名から推測
    return {
      appName: path.basename(appPath, '.app'),
      bundleId: '',
      iconFile: '',
    };
  }
}

/**
 * アプリアイコンを32x32 PNGのbase64 data URIとして抽出
 */
function extractIconDataUri(appPath, iconFile, tmpDir) {
  if (!iconFile) {
    // アイコンファイル名が空の場合、デフォルトの場所を試す
    iconFile = 'AppIcon';
  }

  // .icns 拡張子がなければ追加
  if (!iconFile.endsWith('.icns')) {
    iconFile = iconFile + '.icns';
  }

  const icnsPath = path.join(appPath, 'Contents', 'Resources', iconFile);

  if (!fs.existsSync(icnsPath)) {
    // フォールバック: Resources 内で .icns を探す
    const resourcesDir = path.join(appPath, 'Contents', 'Resources');
    if (!fs.existsSync(resourcesDir)) return '';

    try {
      const files = fs.readdirSync(resourcesDir);
      const icnsFile = files.find(f => f.endsWith('.icns'));
      if (!icnsFile) return '';
      return convertIcnsToDataUri(path.join(resourcesDir, icnsFile), tmpDir);
    } catch {
      return '';
    }
  }

  return convertIcnsToDataUri(icnsPath, tmpDir);
}

/**
 * .icns ファイルを sips で 32x32 PNG に変換し、base64 data URI を返す
 */
function convertIcnsToDataUri(icnsPath, tmpDir) {
  try {
    const hash = icnsPath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
    const outPath = path.join(tmpDir, `${hash}.png`);

    execSync(
      `/usr/bin/sips -s format png -z 32 32 "${icnsPath}" --out "${outPath}" 2>/dev/null`,
      { timeout: 5000 }
    );

    if (!fs.existsSync(outPath)) return '';

    const pngBuffer = fs.readFileSync(outPath);
    const base64 = pngBuffer.toString('base64');

    // 変換後の一時ファイルを即座に削除
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }

    return `data:image/png;base64,${base64}`;
  } catch {
    return '';
  }
}

/**
 * キャッシュをクリアして再スキャンを可能にする
 */
function clearAppCache() {
  cachedApps = null;
}

/**
 * 単一アプリのアイコンをbase64 data URIとして取得
 * @param {string} appName - macOSアプリ名 (例: 'Terminal', 'Finder')
 * @returns {Promise<string>} アイコンdata URI (取得失敗時は空文字)
 */
async function getAppIcon(appName) {
  const appDirs = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities'];
  const tmpDir = path.join(os.tmpdir(), 'atelierx-icons-single');

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  for (const dir of appDirs) {
    const appPath = path.join(dir, `${appName}.app`);
    if (!fs.existsSync(appPath)) continue;

    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) continue;

    try {
      const appInfo = parseAppInfo(plistPath, appPath);
      if (!appInfo) continue;
      const iconDataUri = extractIconDataUri(appPath, appInfo.iconFile, tmpDir);
      if (iconDataUri) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        return iconDataUri;
      }
    } catch {
      continue;
    }
  }

  // クリーンアップ
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  return '';
}

module.exports = {
  scanInstalledApps,
  clearAppCache,
  getAppIcon,
};
