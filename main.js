const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
let mainWindow;

function getCompilerPath() {
  const exe = process.platform === 'win32' ? 'pomidor.exe' : 'pomidor';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'compiler', exe);
  }
  return path.join(__dirname, 'compiler', exe);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 620,
    title: 'Pomidor IDE',
    backgroundColor: '#111316',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  createWindow();
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-status', 'Доступно обновление. Загружаю...');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-status', 'Обновление загружено. Перезапусти IDE для установки.');
});

autoUpdater.on('error', () => {
  mainWindow?.webContents.send('update-status', 'Не удалось проверить обновления.');
});

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('updates:check', async () => {
  if (isDev) return { ok: false, message: 'Автообновление работает только в собранной версии.' };
  try {
    await autoUpdater.checkForUpdatesAndNotify();
    return { ok: true, message: 'Проверка обновлений запущена.' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Pomidor files', extensions: ['pom'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('file:save', async (_event, payload) => {
  let filePath = payload.path;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'main.pom',
      filters: [{ name: 'Pomidor files', extensions: ['pom'] }]
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  fs.writeFileSync(filePath, payload.content, 'utf8');
  return { path: filePath, name: path.basename(filePath) };
});

ipcMain.handle('pomidor:run', async (_event, payload) => {
  const tempDir = path.join(app.getPath('userData'), 'run');
  fs.mkdirSync(tempDir, { recursive: true });
  const sourcePath = payload.path || path.join(tempDir, 'main.pom');
  fs.writeFileSync(sourcePath, payload.content, 'utf8');

  const compiler = getCompilerPath();
  if (!fs.existsSync(compiler)) {
    return {
      ok: false,
      output: '',
      error: `Компилятор не найден: ${compiler}\nСобери его командой: gcc compiler/pomidor.c -o compiler/pomidor`
    };
  }

  return new Promise((resolve) => {
    const child = spawn(compiler, [sourcePath], { cwd: path.dirname(compiler) });
    let output = '';
    let error = '';

    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => error += data.toString());
    child.on('close', (code) => resolve({ ok: code === 0, output, error, code }));
  });
});
