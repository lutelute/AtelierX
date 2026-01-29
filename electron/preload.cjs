const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getAppWindows: (appNames) => ipcRenderer.invoke('get-app-windows', appNames),
  activateWindow: (app, windowId, windowName, animation, windowIndex) => ipcRenderer.invoke('activate-window', app, windowId, windowName, animation, windowIndex),
  openNewTerminal: (initialPath) => ipcRenderer.invoke('open-new-terminal', initialPath),
  openNewFinder: (targetPath) => ipcRenderer.invoke('open-new-finder', targetPath),
  closeWindow: (appName, windowId, windowName) => ipcRenderer.invoke('close-window', appName, windowId, windowName),
  openNewGenericWindow: (appName) => ipcRenderer.invoke('open-new-generic-window', appName),
  exportLog: (content, filename) => ipcRenderer.invoke('export-log', content, filename),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  insertToDailyNote: (content, settings) => ipcRenderer.invoke('insert-to-daily-note', content, settings),
  listDailyNotes: (folderPath, limit) => ipcRenderer.invoke('list-daily-notes', folderPath, limit),
  insertToNote: (content, notePath, insertMarker) => ipcRenderer.invoke('insert-to-note', content, notePath, insertMarker),
  // バックアップ関連
  saveBackup: (data) => ipcRenderer.invoke('save-backup', data),
  loadBackup: () => ipcRenderer.invoke('load-backup'),
  exportBackup: (data) => ipcRenderer.invoke('export-backup', data),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  // グリッド配置関連
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  arrangeTerminalGrid: (options) => ipcRenderer.invoke('arrange-terminal-grid', options),
  arrangeFinderGrid: (options) => ipcRenderer.invoke('arrange-finder-grid', options),
  arrangeGenericGrid: (appName, options) => ipcRenderer.invoke('arrange-generic-grid', appName, options),
  // プラグイン関連
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    install: (repoPath) => ipcRenderer.invoke('plugins:install', repoPath),
    enable: (pluginId) => ipcRenderer.invoke('plugins:enable', pluginId),
    disable: (pluginId) => ipcRenderer.invoke('plugins:disable', pluginId),
    uninstall: (pluginId) => ipcRenderer.invoke('plugins:uninstall', pluginId),
    getSettings: (pluginId) => ipcRenderer.invoke('plugins:get-settings', pluginId),
    saveSettings: (pluginId, settings) => ipcRenderer.invoke('plugins:save-settings', pluginId, settings),
    getGridLayouts: () => ipcRenderer.invoke('plugins:get-layouts'),
    getExportFormats: () => ipcRenderer.invoke('plugins:get-export-formats'),
    executeExportFormat: (formatId, context) => ipcRenderer.invoke('plugins:execute-export-format', { formatId, ...context }),
    getCardActions: () => ipcRenderer.invoke('plugins:get-card-actions'),
    executeCardAction: (actionId, cardId, cardData, taskIndex) => ipcRenderer.invoke('plugins:execute-card-action', { actionId, cardId, cardData, taskIndex }),
    checkUpdate: (pluginId) => ipcRenderer.invoke('plugins:check-update', pluginId),
    update: (pluginId) => ipcRenderer.invoke('plugins:update', pluginId),
  },
  // インストール済みアプリスキャン
  scanInstalledApps: () => ipcRenderer.invoke('scan-installed-apps'),
  getAppIcon: (appName) => ipcRenderer.invoke('get-app-icon', appName),
  // アップデート関連
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: (downloadUrl) => ipcRenderer.invoke('update:download', downloadUrl),
    install: () => ipcRenderer.invoke('update:install'),
    cleanup: () => ipcRenderer.invoke('update:cleanup'),
    restart: () => ipcRenderer.invoke('update:restart'),
    onProgress: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on('update:progress', listener);
      // クリーンアップ関数を返す
      return () => ipcRenderer.removeListener('update:progress', listener);
    },
  },
});
