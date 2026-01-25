/**
 * AtelierX - 自動アップデート管理モジュール
 * GitHubリリースから.dmgをダウンロードしてインストールを支援
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { execSync } = require('child_process');

// ダウンロード済みファイルパス
let downloadedFilePath = null;

// GitHub リポジトリ情報
const GITHUB_OWNER = 'lutelute';
const GITHUB_REPO = 'AtelierX';

/**
 * アップデートファイルの保存先ディレクトリを取得
 * ~/Library/Application Support/AtelierX/updates/
 */
function getUpdatesPath() {
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }
  return updatesDir;
}

/**
 * GitHubリリースから最新バージョン情報を取得
 * @returns {Promise<{available: boolean, version?: string, downloadUrl?: string, releaseUrl?: string, error?: string}>}
 */
async function checkForUpdates() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'AtelierX-Updater',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            // リリースがない場合
            resolve({ available: false });
            return;
          }

          if (res.statusCode !== 200) {
            resolve({ available: false, error: `HTTP ${res.statusCode}` });
            return;
          }

          const release = JSON.parse(data);
          const latestVersion = release.tag_name.replace(/^v/, '');
          const currentVersion = app.getVersion();

          // .dmgファイルを探す
          const dmgAsset = release.assets?.find(
            (asset) => asset.name.endsWith('.dmg')
          );

          if (latestVersion !== currentVersion) {
            resolve({
              available: true,
              version: latestVersion,
              downloadUrl: dmgAsset?.browser_download_url || null,
              releaseUrl: release.html_url,
              releaseName: release.name,
              releaseBody: release.body,
            });
          } else {
            resolve({ available: false, version: currentVersion });
          }
        } catch (error) {
          resolve({ available: false, error: error.message });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ available: false, error: error.message });
    });

    req.end();
  });
}

/**
 * .dmgファイルをダウンロード
 * @param {string} downloadUrl - ダウンロードURL
 * @param {function} onProgress - 進捗コールバック (percent, downloadedMB, totalMB)
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
async function downloadUpdate(downloadUrl, onProgress) {
  return new Promise((resolve) => {
    if (!downloadUrl) {
      resolve({ success: false, error: 'ダウンロードURLが指定されていません' });
      return;
    }

    // ダウンロード前に古いファイルをクリーンアップ
    cleanupOldFiles(0);

    const updatesPath = getUpdatesPath();
    const fileName = path.basename(new URL(downloadUrl).pathname);
    const filePath = path.join(updatesPath, fileName);

    // リダイレクトを追跡するための再帰関数
    const download = (url) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : require('http');

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'AtelierX-Updater',
        },
      };

      const req = protocol.request(options, (res) => {
        // リダイレクト処理
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            download(redirectUrl);
            return;
          }
        }

        if (res.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;

        const fileStream = fs.createWriteStream(filePath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
            const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
            onProgress(percent, downloadedMB, totalMB);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          downloadedFilePath = filePath;
          resolve({ success: true, filePath });
        });

        fileStream.on('error', (error) => {
          fs.unlink(filePath, () => {});
          resolve({ success: false, error: error.message });
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.end();
    };

    download(downloadUrl);
  });
}

/**
 * ダウンロード済みの.dmgを自動でApplicationsにインストール
 * @returns {Promise<{success: boolean, error?: string, needsRestart?: boolean}>}
 */
async function installUpdate() {
  return new Promise(async (resolve) => {
    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
      resolve({ success: false, error: 'ダウンロードファイルが見つかりません' });
      return;
    }

    let mountPoint = null;

    try {
      // 1. DMGをマウント
      console.log('Mounting DMG:', downloadedFilePath);
      const mountOutput = execSync(`hdiutil attach "${downloadedFilePath}" -nobrowse -readonly`, {
        encoding: 'utf8',
      });

      // マウントポイントを抽出 (/Volumes/xxx)
      const mountMatch = mountOutput.match(/\/Volumes\/[^\n\r]+/);
      if (!mountMatch) {
        resolve({ success: false, error: 'DMGのマウントに失敗しました' });
        return;
      }
      mountPoint = mountMatch[0].trim();
      console.log('Mounted at:', mountPoint);

      // 2. .appファイルを探す
      const files = fs.readdirSync(mountPoint);
      const appFile = files.find((f) => f.endsWith('.app'));
      if (!appFile) {
        execSync(`hdiutil detach "${mountPoint}" -quiet`);
        resolve({ success: false, error: 'アプリケーションが見つかりません' });
        return;
      }

      const sourceApp = path.join(mountPoint, appFile);
      const destApp = `/Applications/${appFile}`;
      console.log('Copying:', sourceApp, '->', destApp);

      // 3. 既存のアプリを削除して新しいアプリをコピー
      if (fs.existsSync(destApp)) {
        execSync(`rm -rf "${destApp}"`);
      }
      execSync(`cp -R "${sourceApp}" "${destApp}"`);

      // 4. DMGをアンマウント
      console.log('Unmounting DMG...');
      execSync(`hdiutil detach "${mountPoint}" -quiet`);

      // 5. ダウンロードファイルを削除
      cleanupDownload();

      console.log('Installation completed successfully');
      resolve({ success: true, needsRestart: true });
    } catch (error) {
      console.error('Installation error:', error);
      // エラー時もアンマウントを試みる
      if (mountPoint) {
        try {
          execSync(`hdiutil detach "${mountPoint}" -quiet -force`);
        } catch (e) {
          // 無視
        }
      }
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * ダウンロードファイルをクリーンアップ
 * @returns {{success: boolean, deleted: number}}
 */
function cleanupDownload() {
  let deleted = 0;

  if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
    try {
      fs.unlinkSync(downloadedFilePath);
      deleted++;
      downloadedFilePath = null;
    } catch (error) {
      console.error('Failed to delete downloaded file:', error);
    }
  }

  return { success: true, deleted };
}

/**
 * 指定時間より古いファイルを削除
 * @param {number} maxAgeHours - 最大保存時間（時間）、0なら全削除
 * @returns {{success: boolean, deleted: number}}
 */
function cleanupOldFiles(maxAgeHours = 24) {
  const updatesPath = getUpdatesPath();
  let deleted = 0;

  try {
    if (!fs.existsSync(updatesPath)) {
      return { success: true, deleted: 0 };
    }

    const files = fs.readdirSync(updatesPath);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(updatesPath, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const age = now - stat.mtimeMs;
          if (maxAgeHours === 0 || age > maxAgeMs) {
            fs.unlinkSync(filePath);
            deleted++;
            console.log(`Deleted old update file: ${file}`);
          }
        }
      } catch (error) {
        console.error(`Failed to process file ${file}:`, error);
      }
    }

    // 現在のダウンロードファイルが削除された場合はリセット
    if (downloadedFilePath && !fs.existsSync(downloadedFilePath)) {
      downloadedFilePath = null;
    }

    return { success: true, deleted };
  } catch (error) {
    console.error('Failed to cleanup old files:', error);
    return { success: false, deleted };
  }
}

/**
 * ダウンロードファイルのパスを取得
 * @returns {string|null}
 */
function getDownloadedFilePath() {
  return downloadedFilePath;
}

/**
 * アプリ起動時のクリーンアップ（24時間以上前のファイルを削除）
 */
function startupCleanup() {
  console.log('Running startup cleanup for update files...');
  const result = cleanupOldFiles(24);
  console.log(`Startup cleanup completed: ${result.deleted} files deleted`);
}

/**
 * アプリを再起動
 */
function restartApp() {
  console.log('Restarting app...');
  app.relaunch();
  app.exit(0);
}

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  cleanupDownload,
  cleanupOldFiles,
  getDownloadedFilePath,
  startupCleanup,
  getUpdatesPath,
  restartApp,
};
