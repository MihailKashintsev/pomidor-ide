const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomidorAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  run: (payload) => ipcRenderer.invoke('pomidor:run', payload),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, message) => callback(message))
});
