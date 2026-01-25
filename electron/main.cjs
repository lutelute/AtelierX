/**
 * AtelierX - Electron メインプロセス
 * あなたの創作空間
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  getAppWindows,
  activateWindow,
  openNewTerminalWindow,
  openNewFinderWindow,
} = require('./windowManager.cjs');
const {
  getDisplayInfo,
  arrangeTerminalGrid,
  arrangeFinderGrid,
} = require('./gridManager.cjs');
const {
  getInstalledPlugins,
  getPluginSettings,
  savePluginSettings,
  installFromGitHub,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  loadEnabledPlugins,
} = require('./pluginManager.cjs');
const { getRegisteredGridLayouts, getRegisteredExportFormats } = require('./pluginAPI.cjs');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // IPC: ウィンドウ一覧を取得
  ipcMain.handle('get-app-windows', async () => {
    return await getAppWindows();
  });

  // IPC: ウィンドウをアクティブにする
  ipcMain.handle('activate-window', async (_, appName, windowId, windowName) => {
    return await activateWindow(appName, windowId, windowName);
  });

  // IPC: 新しいTerminalウィンドウを開く
  ipcMain.handle('open-new-terminal', async (_, initialPath) => {
    return await openNewTerminalWindow(initialPath);
  });

  // IPC: 新しいFinderウィンドウを開く
  ipcMain.handle('open-new-finder', async (_, targetPath) => {
    return await openNewFinderWindow(targetPath);
  });

  // IPC: ログをファイルにエクスポート
  ipcMain.handle('export-log', async (_, content, filename) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'Text', extensions: ['txt'] },
        ],
      });
      if (filePath) {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Export error:', error);
      return false;
    }
  });

  // IPC: フォルダ選択ダイアログ
  ipcMain.handle('select-folder', async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Obsidian Vaultを選択',
        properties: ['openDirectory'],
      });
      return filePaths && filePaths.length > 0 ? filePaths[0] : null;
    } catch (error) {
      console.error('Select folder error:', error);
      return null;
    }
  });

  // IPC: ファイル選択ダイアログ
  ipcMain.handle('select-file', async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'デイリーノートファイルを選択',
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      return filePaths && filePaths.length > 0 ? filePaths[0] : null;
    } catch (error) {
      console.error('Select file error:', error);
      return null;
    }
  });

  // IPC: 指定フォルダ内のノート一覧を取得（デイリーノートフォルダ用）
  ipcMain.handle('list-daily-notes', async (_, folderPath, limit = 30) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, error: 'Folder not found: ' + folderPath, notes: [] };
      }

      const notes = [];
      const files = fs.readdirSync(folderPath);

      for (const file of files) {
        if (file.startsWith('.') || !file.endsWith('.md')) continue;
        const fullPath = path.join(folderPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          notes.push({
            name: file.replace('.md', ''),
            filename: file,
            fullPath,
            mtime: stat.mtime.getTime(),
          });
        }
      }

      // 更新日時でソート（新しい順）
      notes.sort((a, b) => b.mtime - a.mtime);
      return { success: true, notes: notes.slice(0, limit) };
    } catch (error) {
      console.error('List daily notes error:', error);
      return { success: false, error: error.message, notes: [] };
    }
  });

  // ノートに差し込む共通関数
  async function insertToNoteFile(content, notePath, insertMarker) {
    console.log('insertToNoteFile called:', { notePath, insertMarker, contentLength: content?.length });

    if (!notePath) {
      return { success: false, error: 'Note path is required' };
    }

    if (!fs.existsSync(notePath)) {
      // ファイルが存在しない場合は新規作成
      const dir = path.dirname(notePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const newContent = insertMarker ? `${insertMarker}\n\n${content}` : content;
      fs.writeFileSync(notePath, newContent, 'utf-8');
      console.log('Created new note:', notePath);
      return { success: true, created: true };
    }

    // 既存の内容を読み込み
    let existingContent = fs.readFileSync(notePath, 'utf-8');
    console.log('Existing content length:', existingContent.length);

    let newContent;
    if (insertMarker && existingContent.includes(insertMarker)) {
      // マーカーが見つかった場合、その下に差し込み
      const markerIndex = existingContent.indexOf(insertMarker);
      const afterMarker = existingContent.indexOf('\n', markerIndex);
      const insertPos = afterMarker >= 0 ? afterMarker + 1 : existingContent.length;

      // 次の見出しを探す（## で始まる行）
      const restContent = existingContent.slice(insertPos);
      const nextHeadingMatch = restContent.match(/\n##\s/);
      const nextHeadingPos = nextHeadingMatch ? insertPos + nextHeadingMatch.index : existingContent.length;

      newContent =
        existingContent.slice(0, insertPos) +
        '\n' + content + '\n' +
        existingContent.slice(nextHeadingPos);
    } else {
      // マーカーがなければ末尾に追加
      const separator = existingContent ? '\n\n' : '';
      newContent = existingContent + separator + (insertMarker ? insertMarker + '\n\n' : '') + content;
    }

    fs.writeFileSync(notePath, newContent, 'utf-8');
    console.log('Updated note:', notePath);
    return { success: true, created: false };
  }

  // IPC: 指定したノートに差し込み
  ipcMain.handle('insert-to-note', async (_, content, notePath, insertMarker) => {
    try {
      return await insertToNoteFile(content, notePath, insertMarker);
    } catch (error) {
      console.error('Insert to note error:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Obsidianデイリーノートに差し込み（互換性維持）
  ipcMain.handle('insert-to-daily-note', async (_, content, settings) => {
    try {
      console.log('insert-to-daily-note called with:', { content: content?.substring(0, 100), settings });
      const { vaultPath, dailyNotePath, insertMarker } = settings;

      if (!vaultPath || !dailyNotePath) {
        console.error('Obsidian settings not configured:', { vaultPath, dailyNotePath });
        return false;
      }

      // 日付をYYYY-MM-DD形式で取得
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // パスの{{date}}を置換
      const notePath = dailyNotePath.replace('{{date}}', dateStr);
      const fullPath = path.join(vaultPath, notePath);
      console.log('Writing to daily note:', { dateStr, notePath, fullPath });

      const result = await insertToNoteFile(content, fullPath, insertMarker);
      return result.success;
    } catch (error) {
      console.error('Insert to daily note error:', error);
      return false;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// バックアップファイルのデフォルトパスを取得
function getDefaultBackupPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'kanban-backup.json');
}

// IPC: バックアップ保存（自動保存用）
ipcMain.handle('save-backup', async (_, data) => {
  try {
    const backupPath = getDefaultBackupPath();
    const backupData = {
      ...data,
      backupAt: Date.now(),
      version: 1,
    };
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log('Backup saved:', backupPath);
    return { success: true, path: backupPath, timestamp: backupData.backupAt };
  } catch (error) {
    console.error('Backup save error:', error);
    return { success: false, error: error.message };
  }
});

// IPC: バックアップ読み込み（起動時復元用）
ipcMain.handle('load-backup', async () => {
  try {
    const backupPath = getDefaultBackupPath();
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'No backup found', data: null };
    }
    const content = fs.readFileSync(backupPath, 'utf-8');
    const data = JSON.parse(content);
    console.log('Backup loaded:', backupPath);
    return { success: true, data };
  } catch (error) {
    console.error('Backup load error:', error);
    return { success: false, error: error.message, data: null };
  }
});

// IPC: バックアップをファイルにエクスポート（手動）
ipcMain.handle('export-backup', async (_, data) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `kanban-backup-${today}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (filePath) {
      const backupData = {
        ...data,
        backupAt: Date.now(),
        version: 1,
      };
      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
      return { success: true, path: filePath };
    }
    return { success: false, error: 'Cancelled' };
  } catch (error) {
    console.error('Export backup error:', error);
    return { success: false, error: error.message };
  }
});

// IPC: バックアップファイルをインポート（手動）
ipcMain.handle('import-backup', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'バックアップファイルを選択',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (filePaths && filePaths.length > 0) {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      return { success: true, data };
    }
    return { success: false, error: 'Cancelled', data: null };
  } catch (error) {
    console.error('Import backup error:', error);
    return { success: false, error: error.message, data: null };
  }
});

// IPC: バックアップパスを取得
ipcMain.handle('get-backup-path', async () => {
  return getDefaultBackupPath();
});

// =====================================================
// グリッド配置機能 (gridManager.cjs モジュールを使用)
// @see ./gridManager.cjs - terminal_grid.sh / finder_grid.sh と同等のロジック
// =====================================================

// IPC: ディスプレイ情報を取得
ipcMain.handle('get-displays', async () => {
  return getDisplayInfo();
});

// IPC: Terminalウィンドウをグリッド配置
ipcMain.handle('arrange-terminal-grid', async (_, options = {}) => {
  return arrangeTerminalGrid(options);
});

// IPC: Finderウィンドウをグリッド配置
ipcMain.handle('arrange-finder-grid', async (_, options = {}) => {
  return arrangeFinderGrid(options);
});

// =====================================================
// プラグイン管理機能 (pluginManager.cjs モジュールを使用)
// =====================================================

// IPC: インストール済みプラグイン一覧を取得
ipcMain.handle('plugins:list', async () => {
  try {
    const plugins = getInstalledPlugins();
    return { success: true, data: plugins };
  } catch (error) {
    console.error('plugins:list error:', error);
    return { success: false, data: [], error: error.message };
  }
});

// IPC: GitHubからプラグインをインストール
ipcMain.handle('plugins:install', async (_, repoPath) => {
  return await installFromGitHub(repoPath);
});

// IPC: プラグインを有効化
ipcMain.handle('plugins:enable', async (_, pluginId) => {
  return enablePlugin(pluginId);
});

// IPC: プラグインを無効化
ipcMain.handle('plugins:disable', async (_, pluginId) => {
  return disablePlugin(pluginId);
});

// IPC: プラグインをアンインストール
ipcMain.handle('plugins:uninstall', async (_, pluginId) => {
  return uninstallPlugin(pluginId);
});

// IPC: プラグイン設定を取得
ipcMain.handle('plugins:get-settings', async (_, pluginId) => {
  try {
    const settings = getPluginSettings(pluginId);
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, data: {}, error: error.message };
  }
});

// IPC: プラグイン設定を保存
ipcMain.handle('plugins:save-settings', async (_, pluginId, settings) => {
  return savePluginSettings(pluginId, settings);
});

// IPC: プラグインから登録されたグリッドレイアウトを取得
ipcMain.handle('plugins:get-layouts', async () => {
  try {
    const layouts = getRegisteredGridLayouts();
    return { success: true, data: layouts };
  } catch (error) {
    return { success: false, data: [], error: error.message };
  }
});

// IPC: プラグインから登録されたエクスポートフォーマットを取得
ipcMain.handle('plugins:get-export-formats', async () => {
  try {
    const formats = getRegisteredExportFormats();
    return { success: true, data: formats };
  } catch (error) {
    return { success: false, data: [], error: error.message };
  }
});

// 有効なプラグインをロード
loadEnabledPlugins();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
