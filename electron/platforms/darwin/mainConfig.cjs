/**
 * macOS 固有の BrowserWindow 設定 / App Nap 対策 / .scpt 掃除
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * macOS 固有の BrowserWindow オプションを返す
 */
function getBrowserWindowOptions() {
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  };
}

/**
 * アプリ起動直後に呼ぶ（app.whenReady 前）
 * App Nap を無効化してAppleScript実行遅延を防止
 */
function onStartup() {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
}

/**
 * app.whenReady() 内で呼ぶ
 * - powerSaveBlocker でシステムスリープを防止
 * - 孤児 .scpt ファイルを掃除
 */
function onAppReady() {
  // powerSaveBlocker でシステムスリープを防止（App Nap対策）
  const { powerSaveBlocker } = require('electron');
  powerSaveBlocker.start('prevent-app-suspension');

  // 起動時に孤児AppleScript一時ファイルを掃除
  try {
    const tmpDir = os.tmpdir();
    const files = fs.readdirSync(tmpDir);
    let cleaned = 0;
    const now = Date.now();
    for (const f of files) {
      if (f.startsWith('atelierx-') && f.endsWith('.scpt')) {
        try {
          const fullPath = path.join(tmpDir, f);
          const stat = fs.statSync(fullPath);
          // 10分以上前のファイルのみ削除（実行中のスクリプトを守る）
          if (now - stat.mtimeMs > 600000) {
            fs.unlinkSync(fullPath);
            cleaned++;
          }
        } catch { /* ignore */ }
      }
    }
    if (cleaned > 0) console.log(`Cleaned up ${cleaned} orphaned .scpt files`);
  } catch { /* ignore */ }
}

module.exports = {
  getBrowserWindowOptions,
  onStartup,
  onAppReady,
};
