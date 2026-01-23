const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getAppWindows: () => ipcRenderer.invoke('get-app-windows'),
  activateWindow: (app, windowId, windowName) => ipcRenderer.invoke('activate-window', app, windowId, windowName),
  openNewTerminal: (initialPath) => ipcRenderer.invoke('open-new-terminal', initialPath),
  openNewFinder: (targetPath) => ipcRenderer.invoke('open-new-finder', targetPath),
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
  },
});
