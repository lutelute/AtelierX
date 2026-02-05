/**
 * プラットフォーム振り分けルーター
 * process.platform に応じて darwin / win32 / linux の実装を読み込み、
 * フラット namespace で全関数を re-export する。
 */

const platform = process.platform;

let platformDir;
if (platform === 'darwin') {
  platformDir = './darwin';
} else if (platform === 'win32') {
  platformDir = './win32';
} else {
  platformDir = './linux';
}

const windowManager = require(`${platformDir}/windowManager.cjs`);
const gridManager = require(`${platformDir}/gridManager.cjs`);
const appScanner = require(`${platformDir}/appScanner.cjs`);
const updateManager = require(`${platformDir}/updateManager.cjs`);
const mainConfig = require(`${platformDir}/mainConfig.cjs`);

module.exports = {
  // windowManager
  ...windowManager,
  // gridManager
  ...gridManager,
  // appScanner
  ...appScanner,
  // updateManager
  ...updateManager,
  // mainConfig
  ...mainConfig,
};
