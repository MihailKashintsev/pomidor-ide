const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
let mainWindow;

const POMIDOR_LANGUAGE_REPO = 'MihailKashintsev/pomidor-c';
const POMIDOR_IDE_REPO = 'MihailKashintsev/pomidor-ide';
const FALLBACK_LANGUAGE_VERSION = '0.4.0';

function getCompilerExecutableName() {
  return process.platform === 'win32' ? 'pomidor.exe' : 'pomidor';
}

function getBundledCompilerPath() {
  const exe = getCompilerExecutableName();
  if (app.isPackaged) return path.join(process.resourcesPath, 'compiler', exe);
  return path.join(__dirname, 'compiler', exe);
}

function getInstalledCompilerPath() {
  return path.join(app.getPath('userData'), 'language', getCompilerExecutableName());
}

function getCompilerPath() {
  const installed = getInstalledCompilerPath();
  if (fs.existsSync(installed)) return installed;
  return getBundledCompilerPath();
}

function sendUpdateStatus(message) {
  mainWindow?.webContents.send('update-status', message);
}

function normalizeVersion(value) {
  return String(value || '')
    .replace(/Pomidor\s*Language/ig, '')
    .replace(/^v/i, '')
    .trim();
}

function compareVersions(a, b) {
  const aa = normalizeVersion(a).split(/[.-]/).map(x => Number.parseInt(x, 10) || 0);
  const bb = normalizeVersion(b).split(/[.-]/).map(x => Number.parseInt(x, 10) || 0);
  const max = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < max; i++) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Pomidor-IDE',
        'Accept': 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        requestJson(res.headers.location).then(resolve, reject);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub вернул HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Превышено время ожидания GitHub.'));
    });
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Pomidor-IDE',
        'Accept': 'text/plain, application/vnd.github.raw'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        requestText(res.headers.location).then(resolve, reject);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub вернул HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Превышено время ожидания GitHub.'));
    });
  });
}

async function getLanguageVersionFromSource() {
  const url = `https://raw.githubusercontent.com/${POMIDOR_LANGUAGE_REPO}/main/src/main.c`;
  const source = await requestText(url);
  const match = source.match(/#define\s+POMIDOR_VERSION\s+"([^"]+)"/);
  if (!match) throw new Error('Не удалось найти POMIDOR_VERSION в src/main.c.');
  return normalizeVersion(match[1]);
}

async function getLatestLanguageTagVersion() {
  try {
    const tags = await requestJson(`https://api.github.com/repos/${POMIDOR_LANGUAGE_REPO}/tags`);
    if (!Array.isArray(tags) || tags.length === 0) return null;
    return normalizeVersion(tags[0].name);
  } catch (_error) {
    return null;
  }
}

async function getLanguageRemoteInfo() {
  try {
    const release = await getLatestLanguageRelease();
    const latestVersion = normalizeVersion(release.tag_name || release.name);
    const asset = chooseLanguageAsset(release);
    return {
      ok: true,
      source: 'release',
      latestVersion,
      releaseAvailable: true,
      installable: !!asset,
      releaseName: release.name,
      releaseUrl: release.html_url,
      asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
      message: asset ? `Найден релиз Pomidor ${latestVersion}.` : `Релиз Pomidor ${latestVersion} найден, но подходящего файла для этой ОС нет.`
    };
  } catch (releaseError) {
    let sourceVersion = null;
    let tagVersion = null;

    try { sourceVersion = await getLanguageVersionFromSource(); } catch (_error) {}
    try { tagVersion = await getLatestLanguageTagVersion(); } catch (_error) {}

    const latestVersion = sourceVersion || tagVersion || FALLBACK_LANGUAGE_VERSION;
    return {
      ok: true,
      source: 'source',
      latestVersion,
      releaseAvailable: false,
      installable: false,
      releaseName: null,
      releaseUrl: `https://github.com/${POMIDOR_LANGUAGE_REPO}/releases`,
      asset: null,
      releaseError: releaseError.message,
      message: `В pomidor-c пока нет GitHub Release latest. Версия из исходников: ${latestVersion}. Автоустановка станет доступна после публикации релиза.`
    };
  }
}

function downloadFile(url, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const cleanup = () => {
      try { fs.rmSync(targetPath, { force: true }); } catch (_error) {}
    };

    const start = (downloadUrl, redirectsLeft = 8) => {
      if (redirectsLeft <= 0) {
        cleanup();
        reject(new Error('Слишком много перенаправлений при скачивании.'));
        return;
      }

      const file = fs.createWriteStream(targetPath);
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        file.destroy();
        cleanup();
        reject(error);
      };

      const req = https.get(downloadUrl, { headers: { 'User-Agent': 'Pomidor-IDE' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          settled = true;
          file.destroy();
          cleanup();
          const nextUrl = new URL(res.headers.location, downloadUrl).toString();
          sendUpdateStatus('GitHub перенаправил скачивание языка, продолжаю...');
          start(nextUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          fail(new Error(`Не удалось скачать файл: HTTP ${res.statusCode}`));
          return;
        }

        const total = Number(res.headers['content-length'] || 0);
        let loaded = 0;
        let lastPercent = -1;

        res.on('data', chunk => {
          loaded += chunk.length;
          if (onProgress && total) {
            const percent = Math.round((loaded / total) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              onProgress(percent);
            }
          }
        });

        res.on('error', fail);
        file.on('error', fail);
        file.on('finish', () => {
          if (settled) return;
          settled = true;
          file.close(() => resolve(targetPath));
        });

        res.pipe(file);
      });

      req.on('error', fail);
      req.setTimeout(45000, () => {
        req.destroy(new Error('Превышено время ожидания скачивания языка Pomidor.'));
      });
    };

    start(url);
  });
}

function runCommand(command, args, options = {}) {
  const timeout = options.timeout ?? 60000;
  return new Promise((resolve) => {
    let done = false;
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: !error, error, stdout: stdout || '', stderr: stderr || '', timedOut: false });
    });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch (_error) {}
      resolve({ ok: false, error: new Error(`Команда зависла дольше ${Math.round(timeout / 1000)} сек: ${command}`), stdout: '', stderr: '', timedOut: true });
    }, timeout);
  });
}

function quotePowerShellPath(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function extractArchive(archivePath, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  if (archivePath.toLowerCase().endsWith('.zip')) {
    if (process.platform === 'win32') {
      sendUpdateStatus('Распаковываю ZIP через PowerShell...');
      const command = `Expand-Archive -LiteralPath ${quotePowerShellPath(archivePath)} -DestinationPath ${quotePowerShellPath(targetDir)} -Force`;
      const ps = await runCommand('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command', command
      ], { timeout: 90000, windowsHide: true });
      if (!ps.ok) throw new Error(ps.stderr || ps.stdout || ps.error?.message || 'Не удалось распаковать zip.');
      return;
    }
    const unzip = await runCommand('unzip', ['-o', archivePath, '-d', targetDir], { timeout: 90000 });
    if (!unzip.ok) throw new Error(unzip.stderr || unzip.stdout || unzip.error?.message || 'Не удалось распаковать zip.');
    return;
  }

  if (archivePath.toLowerCase().endsWith('.tar.gz') || archivePath.toLowerCase().endsWith('.tgz')) {
    const tar = await runCommand('tar', ['-xzf', archivePath, '-C', targetDir], { timeout: 90000 });
    if (!tar.ok) throw new Error(tar.stderr || tar.stdout || tar.error?.message || 'Не удалось распаковать tar.gz.');
    return;
  }

  throw new Error('Неподдерживаемый архив языка. Нужен .zip с pomidor.exe внутри.');
}

function findFileRecursive(dir, predicate) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, predicate);
      if (found) return found;
    } else if (predicate(full, entry.name)) {
      return full;
    }
  }
  return null;
}

function chooseLanguageAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (process.platform === 'win32') {
    return assets.find(a => /windows|win/i.test(a.name) && /\.zip$/i.test(a.name)) ||
      assets.find(a => /pomidor\.exe$/i.test(a.name));
  }
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? /arm64|aarch64/i : /x64|amd64/i;
    return assets.find(a => /macos|darwin/i.test(a.name) && arch.test(a.name) && /\.tar\.gz$/i.test(a.name)) ||
      assets.find(a => /macos|darwin/i.test(a.name) && /\.tar\.gz$/i.test(a.name));
  }
  return assets.find(a => /linux/i.test(a.name) && /\.tar\.gz$/i.test(a.name)) ||
    assets.find(a => /linux/i.test(a.name));
}

async function getLatestLanguageRelease() {
  return requestJson(`https://api.github.com/repos/${POMIDOR_LANGUAGE_REPO}/releases/latest`);
}

async function getLatestIdeRelease() {
  return requestJson(`https://api.github.com/repos/${POMIDOR_IDE_REPO}/releases/latest`);
}

function getLocalLanguageVersion() {
  const compiler = getCompilerPath();
  if (!fs.existsSync(compiler)) {
    return Promise.resolve({ ok: false, version: null, compilerPath: compiler, message: 'Локальный компилятор Pomidor не найден.' });
  }

  return new Promise((resolve) => {
    const child = spawn(compiler, ['--version'], { cwd: path.dirname(compiler) });
    let output = '';
    let error = '';
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => error += data.toString());
    child.on('error', err => resolve({ ok: false, version: null, compilerPath: compiler, message: err.message }));
    child.on('close', code => {
      if (code !== 0) {
        resolve({ ok: false, version: null, compilerPath: compiler, message: error || 'Не удалось получить версию Pomidor.' });
        return;
      }
      const raw = output.trim() || `Pomidor Language ${FALLBACK_LANGUAGE_VERSION}`;
      resolve({ ok: true, version: normalizeVersion(raw), rawVersion: raw, compilerPath: compiler, bundledPath: getBundledCompilerPath(), installedPath: getInstalledCompilerPath() });
    });
  });
}


function sendMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action);
  }
}

function buildApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new-file') },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open-file') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+K', click: () => sendMenuAction('open-folder') },
        { label: 'Reload Folder', accelerator: 'F5', click: () => sendMenuAction('reload-folder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-file') },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit', label: process.platform === 'darwin' ? 'Close' : 'Exit' }
      ]
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Run Code', accelerator: 'F6', click: () => sendMenuAction('run-code') },
        { label: 'Check Updates', click: () => sendMenuAction('check-updates') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Explorer', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuAction('show-explorer') },
        { label: 'Run Panel', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendMenuAction('show-run') },
        { label: 'Pom Pom', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendMenuAction('show-mascot') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendMenuAction('show-settings') },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { role: 'reload', label: 'Reload Window' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Pomidor IDE', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Pomidor IDE', message: `Pomidor IDE ${app.getVersion()}`, detail: 'Редактор кода для языка Pomidor с маскотом Pom Pom.' }) }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Pomidor IDE',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    backgroundColor: '#1e1e1e',
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
  buildApplicationMenu();
  createWindow();
  if (!isDev) {
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('ide-update-available', { version: info.version, message: `Доступно обновление IDE: ${info.version}` });
});
autoUpdater.on('update-not-available', () => {
  sendUpdateStatus('Pomidor IDE актуальна.');
});
autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus(`Скачивание IDE: ${Math.round(progress.percent)}%`);
});
autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('ide-update-downloaded', 'Обновление IDE скачано. Перезапусти IDE для установки.');
});
autoUpdater.on('error', (error) => {
  sendUpdateStatus(`Не удалось проверить обновления IDE: ${error.message}`);
});

function shouldSkipEntry(name) {
  const skip = new Set(['node_modules', '.git', 'dist', 'out', '.idea', '.vscode']);
  return skip.has(name);
}

function buildDirectoryTree(dirPath, rootPath = dirPath, depth = 0) {
  const name = path.basename(dirPath) || dirPath;
  const node = { type: 'directory', name, path: dirPath, children: [] };
  if (depth > 5) return node;

  let entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries = entries.filter(entry => !shouldSkipEntry(entry.name));
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) node.children.push(buildDirectoryTree(fullPath, rootPath, depth + 1));
    else node.children.push({ type: 'file', name: entry.name, path: fullPath });
  }
  return node;
}

function readTextFile(filePath) {
  return { path: filePath, name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
}

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('pomidor:get-language-version', () => getLocalLanguageVersion().then(v => v.ok ? `Pomidor Language ${v.version}` : v.message));
ipcMain.handle('language:get-local-version', () => getLocalLanguageVersion());

ipcMain.handle('updates:check', async () => {
  if (isDev) return { ok: false, message: 'Автообновление IDE работает только в собранной версии. Проверка языка работает всегда.' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, message: result?.updateInfo?.version ? `Проверка IDE запущена. Последняя версия: ${result.updateInfo.version}` : 'Проверка IDE запущена.' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('updates:download-ide', async () => {
  if (isDev) return { ok: false, message: 'Скачивание обновления IDE работает только в собранной версии.' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true, message: 'Скачивание обновления IDE началось.' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('updates:install-ide', () => {
  if (isDev) return { ok: false, message: 'Установка обновления IDE работает только в собранной версии.' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true, message: 'IDE перезапускается для установки.' };
});

ipcMain.handle('language:check-updates', async () => {
  try {
    const local = await getLocalLanguageVersion();
    const remote = await getLanguageRemoteInfo();
    const hasUpdate = !local.ok || compareVersions(local.version, remote.latestVersion) < 0;
    const canInstall = hasUpdate && remote.installable && !!remote.asset;
    return {
      ok: true,
      local,
      latestVersion: remote.latestVersion,
      hasUpdate,
      canInstall,
      installable: remote.installable,
      releaseAvailable: remote.releaseAvailable,
      source: remote.source,
      releaseName: remote.releaseName,
      releaseUrl: remote.releaseUrl,
      asset: remote.asset,
      message: !remote.releaseAvailable
        ? `Релизов pomidor-c пока нет. Локально: ${local.version || 'не установлен'}, в исходниках: ${remote.latestVersion}. Автоустановка появится после первого Release.`
        : hasUpdate
          ? (canInstall ? `Доступно обновление языка Pomidor ${local.version || 'не установлен'} → ${remote.latestVersion}` : `Доступна версия Pomidor ${remote.latestVersion}, но в Release нет подходящего файла для этой ОС.`)
          : `Язык Pomidor актуален: ${local.version}`
    };
  } catch (error) {
    return { ok: false, message: `Не удалось проверить язык Pomidor: ${error.message}` };
  }
});

ipcMain.handle('language:install-update', async () => {
  try {
    const remote = await getLanguageRemoteInfo();
    if (!remote.releaseAvailable) {
      return {
        ok: false,
        message: `Установка через IDE пока недоступна: в pomidor-c нет GitHub Release. Создай релиз v${remote.latestVersion} и прикрепи pomidor-windows-x64.zip с pomidor.exe.`
      };
    }
    if (!remote.asset) throw new Error('В последнем релизе pomidor-c не найден подходящий архив для этой ОС.');
    const asset = { name: remote.asset.name, browser_download_url: remote.asset.url, size: remote.asset.size };

    const tempRoot = path.join(app.getPath('temp'), 'pomidor-ide-language-update');
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });

    const archivePath = path.join(tempRoot, asset.name);
    sendUpdateStatus(`Скачиваю язык Pomidor: ${asset.name}`);
    await downloadFile(asset.browser_download_url, archivePath, percent => sendUpdateStatus(`Скачивание языка Pomidor: ${percent}%`));

    const extractDir = path.join(tempRoot, 'extracted');
    if (/\.exe$/i.test(asset.name) && process.platform === 'win32') {
      fs.mkdirSync(path.dirname(getInstalledCompilerPath()), { recursive: true });
      fs.copyFileSync(archivePath, getInstalledCompilerPath());
    } else {
      sendUpdateStatus('Распаковываю язык Pomidor...');
      await extractArchive(archivePath, extractDir);
      const exeName = getCompilerExecutableName();
      const binary = findFileRecursive(extractDir, (_full, name) => name === exeName || name === 'pomidor');
      if (!binary) throw new Error(`В архиве не найден ${exeName}.`);
      fs.mkdirSync(path.dirname(getInstalledCompilerPath()), { recursive: true });
      fs.copyFileSync(binary, getInstalledCompilerPath());
    }

    if (process.platform !== 'win32') fs.chmodSync(getInstalledCompilerPath(), 0o755);

    const local = await getLocalLanguageVersion();
    sendUpdateStatus(`Язык Pomidor установлен: ${local.rawVersion || local.version}`);
    return { ok: true, local, installPath: getInstalledCompilerPath(), message: `Язык Pomidor установлен: ${local.rawVersion || local.version}` };
  } catch (error) {
    return { ok: false, message: `Не удалось установить язык Pomidor: ${error.message}` };
  }
});

ipcMain.handle('startup:check-updates', async () => {
  const result = {
    ide: { ok: false, hasUpdate: false, message: isDev ? 'IDE dev-режим: автообновление IDE отключено.' : 'Проверка IDE запущена.' },
    language: { ok: false, hasUpdate: false, message: 'Проверка языка не выполнена.' }
  };

  if (!isDev) {
    try {
      await autoUpdater.checkForUpdates();
      result.ide.ok = true;
    } catch (error) {
      result.ide.message = `Не удалось проверить IDE: ${error.message}`;
    }
  }

  try {
    const local = await getLocalLanguageVersion();
    const remote = await getLanguageRemoteInfo();
    const hasUpdate = !local.ok || compareVersions(local.version, remote.latestVersion) < 0;
    const canInstall = hasUpdate && remote.installable && !!remote.asset;
    result.language = {
      ok: true,
      local,
      latestVersion: remote.latestVersion,
      hasUpdate,
      canInstall,
      installable: remote.installable,
      releaseAvailable: remote.releaseAvailable,
      source: remote.source,
      releaseUrl: remote.releaseUrl,
      asset: remote.asset,
      message: !remote.releaseAvailable
        ? `Релизов pomidor-c пока нет. Локально: ${local.version || 'не установлен'}, в исходниках: ${remote.latestVersion}. Автоустановка появится после первого Release.`
        : hasUpdate
          ? (canInstall ? `Доступно обновление языка Pomidor ${local.version || 'не установлен'} → ${remote.latestVersion}` : `Доступна версия Pomidor ${remote.latestVersion}, но в Release нет подходящего файла для этой ОС.`)
          : `Язык Pomidor актуален: ${local.version}`
    };
  } catch (error) {
    result.language = { ok: false, hasUpdate: false, message: `Не удалось проверить язык: ${error.message}` };
  }

  return result;
});

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Pomidor and text files', extensions: ['pom', 'txt', 'md', 'json', 'js', 'html', 'css', 'c'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readTextFile(result.filePaths[0]);
});

ipcMain.handle('file:read', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readTextFile(filePath);
});

ipcMain.handle('file:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const folderPath = result.filePaths[0];
  return { path: folderPath, name: path.basename(folderPath), tree: buildDirectoryTree(folderPath) };
});

ipcMain.handle('file:read-folder', async (_event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return null;
  return { path: folderPath, name: path.basename(folderPath), tree: buildDirectoryTree(folderPath) };
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
      error: `Компилятор не найден: ${compiler}\nНажми «Обновления» и установи язык Pomidor из pomidor-c.`
    };
  }

  return new Promise((resolve) => {
    const child = spawn(compiler, [sourcePath], { cwd: path.dirname(compiler) });
    let output = '';
    let error = '';
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => error += data.toString());
    child.on('error', err => resolve({ ok: false, output, error: err.message, code: -1 }));
    child.on('close', code => resolve({ ok: code === 0, output, error, code }));
  });
});
