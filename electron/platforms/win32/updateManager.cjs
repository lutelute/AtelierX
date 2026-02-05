/**
 * Update Manager - Win32 実装
 * checkForUpdates: GitHub API で実装（クロスプラットフォーム）
 * downloadUpdate: HTTPS でダウンロード
 * installUpdate: ダウンロード済み .exe を shell.openPath で起動
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

let downloadedFilePath = null;

const GITHUB_OWNER = 'lutelute';
const GITHUB_REPO = 'AtelierX';

function getUpdatesPath() {
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }
  return updatesDir;
}

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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
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

          // Windows 用アセットを探す (.exe / .msi)
          const winAsset = release.assets?.find(
            (asset) => asset.name.endsWith('.exe') || asset.name.endsWith('.msi')
          );

          if (latestVersion !== currentVersion) {
            resolve({
              available: true,
              version: latestVersion,
              downloadUrl: winAsset?.browser_download_url || null,
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

async function downloadUpdate(downloadUrl, onProgress) {
  return new Promise((resolve) => {
    if (!downloadUrl) {
      resolve({ success: false, error: 'ダウンロードURLが指定されていません' });
      return;
    }

    cleanupOldFiles(0);
    const updatesPath = getUpdatesPath();
    const fileName = path.basename(new URL(downloadUrl).pathname);
    const filePath = path.join(updatesPath, fileName);

    const download = (url) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : require('http');
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: { 'User-Agent': 'AtelierX-Updater' },
      };

      const req = protocol.request(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (res.headers.location) {
            download(res.headers.location);
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

async function installUpdate() {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    return { success: false, error: 'ダウンロードファイルが見つかりません' };
  }

  try {
    // NSIS インストーラー (.exe) を起動
    await shell.openPath(downloadedFilePath);
    return { success: true, needsRestart: true };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
}

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

function cleanupOldFiles(maxAgeHours = 24) {
  const updatesPath = getUpdatesPath();
  let deleted = 0;
  try {
    if (!fs.existsSync(updatesPath)) return { success: true, deleted: 0 };
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
          }
        }
      } catch { /* ignore */ }
    }
    if (downloadedFilePath && !fs.existsSync(downloadedFilePath)) {
      downloadedFilePath = null;
    }
    return { success: true, deleted };
  } catch (error) {
    return { success: false, deleted };
  }
}

function getDownloadedFilePath() {
  return downloadedFilePath;
}

function startupCleanup() {
  console.log('Running startup cleanup for update files...');
  const result = cleanupOldFiles(24);
  console.log(`Startup cleanup completed: ${result.deleted} files deleted`);
}

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
