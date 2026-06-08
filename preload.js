const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomidorAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getLanguageVersion: () => ipcRenderer.invoke('pomidor:get-language-version'),
  getLocalLanguageVersion: () => ipcRenderer.invoke('language:get-local-version'),
  checkLanguageUpdates: () => ipcRenderer.invoke('language:check-updates'),
  installLanguageUpdate: () => ipcRenderer.invoke('language:install-update'),
  checkStartupUpdates: () => ipcRenderer.invoke('startup:check-updates'),
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  openFolder: () => ipcRenderer.invoke('file:open-folder'),
  readFolder: (folderPath) => ipcRenderer.invoke('file:read-folder', folderPath),
  run: (payload) => ipcRenderer.invoke('pomidor:run', payload),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadIdeUpdate: () => ipcRenderer.invoke('updates:download-ide'),
  installIdeUpdate: () => ipcRenderer.invoke('updates:install-ide'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, message) => callback(message)),
  onIdeUpdateAvailable: (callback) => ipcRenderer.on('ide-update-available', (_event, payload) => callback(payload)),
  onIdeUpdateDownloaded: (callback) => ipcRenderer.on('ide-update-downloaded', (_event, message) => callback(message)),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (_event, action) => callback(action))
});
