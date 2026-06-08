let editor;
let currentPath = null;
let currentFolderPath = null;
let dirty = false;
let explorerData = null;
const pompom = new window.PomPom();

const starterCode = `// Pomidor language example\nскажи "Привет, Pom Pom!"\nprint "Hello from Pomidor!"\n\nчисло age = 15\nесли age > 10 {\n    скажи "Большой помидор!"\n}\n`;

const el = {
  version: document.getElementById('version'),
  fileName: document.getElementById('fileName'),
  saveState: document.getElementById('saveState'),
  dirtyDot: document.getElementById('dirtyDot'),
  terminalOutput: document.getElementById('terminalOutput'),
  runStatus: document.getElementById('runStatus'),
  folderPathLabel: document.getElementById('folderPathLabel'),
  explorerTree: document.getElementById('explorerTree'),
  explorerEmpty: document.getElementById('explorerEmpty'),
  statusProject: document.getElementById('statusProject'),
  statusFile: document.getElementById('statusFile'),
  statusLanguage: document.getElementById('statusLanguage'),
  statusLanguageVersion: document.getElementById('statusLanguageVersion'),
  sideLanguageVersion: document.getElementById('sideLanguageVersion'),
  topLanguageBadge: document.getElementById('topLanguageBadge')
};

function focusEditor(delay = 0) {
  const run = () => {
    if (!editor) return;
    const model = editor.getModel();
    if (model) {
      const pos = editor.getPosition() || { lineNumber: 1, column: 1 };
      editor.setPosition(pos);
    }
    editor.updateOptions({ readOnly: false, domReadOnly: false });
    editor.focus();
  };
  if (delay > 0) setTimeout(run, delay);
  else run();
}

require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  window.registerPomidorLanguage(monaco);
  monaco.editor.defineTheme('pomidor-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'f44747', fontStyle: 'bold' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'comment', foreground: '6a9955' },
      { token: 'number', foreground: 'b5cea8' }
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editorCursor.foreground': '#aeafad'
    }
  });

  editor = monaco.editor.create(document.getElementById('editor'), {
    value: starterCode,
    language: 'pomidor',
    theme: 'pomidor-dark',
    automaticLayout: true,
    fontSize: 15,
    lineHeight: 22,
    minimap: { enabled: true },
    roundedSelection: true,
    smoothScrolling: true,
    padding: { top: 10 },
    tabSize: 4,
    scrollBeyondLastLine: false,
    readOnly: false,
    domReadOnly: false
  });

  focusEditor(100);

  const editorHost = document.getElementById('editor');
  if (editorHost) {
    editorHost.addEventListener('mousedown', () => focusEditor(0));
    editorHost.addEventListener('click', () => focusEditor(0));
  }

  editor.onDidChangeModelContent(() => {
    dirty = true;
    setSaveState('не сохранено');
    setDirty(true);
    const lines = editor.getValue().split('\n').length;
    pompom.onActivity();
    pompom.onCodeChanged(lines);
  });
});

window.pomidorAPI.getVersion().then(v => el.version.textContent = `v${v}`);
refreshLanguageVersion();
window.pomidorAPI.onUpdateStatus(message => {
  el.runStatus.textContent = 'обновления';
  el.terminalOutput.textContent = message;
  pompom.say(message, 'idle');
});
window.pomidorAPI.onIdeUpdateAvailable(async payload => {
  el.terminalOutput.textContent = payload.message;
  pompom.say(payload.message, 'surprised');
  const ok = confirm(`${payload.message}\n\nСкачать обновление IDE сейчас?`);
  if (ok) {
    const result = await window.pomidorAPI.downloadIdeUpdate();
    el.terminalOutput.textContent = result.message;
  }
});
window.pomidorAPI.onIdeUpdateDownloaded(async message => {
  el.terminalOutput.textContent = message;
  pompom.say(message, 'happy');
  const ok = confirm(`${message}\n\nПерезапустить и установить сейчас?`);
  if (ok) await window.pomidorAPI.installIdeUpdate();
});

bindUi();
bindSideMenu();
bindMenuActions();
refreshStatusBar();
setTimeout(checkStartupUpdates, 1200);
setTimeout(() => focusEditor(), 1800);


async function refreshLanguageVersion() {
  const local = await window.pomidorAPI.getLocalLanguageVersion();
  if (!el.statusLanguageVersion) return;
  if (local.ok) {
    el.statusLanguageVersion.textContent = `Pomidor ${local.version}`;
    if (el.sideLanguageVersion) el.sideLanguageVersion.textContent = `Установлен Pomidor ${local.version}`;
    if (el.topLanguageBadge) el.topLanguageBadge.textContent = `Pomidor ${local.version}`;
  } else {
    el.statusLanguageVersion.textContent = 'Pomidor: не установлен';
    if (el.sideLanguageVersion) el.sideLanguageVersion.textContent = 'Компилятор Pomidor не найден';
    if (el.topLanguageBadge) el.topLanguageBadge.textContent = 'Pomidor: нет';
  }
}

async function checkStartupUpdates() {
  el.runStatus.textContent = 'проверка обновлений...';
  const result = await window.pomidorAPI.checkStartupUpdates();
  const lines = [
    'Проверка обновлений при запуске:',
    `IDE: ${result.ide.message}`,
    `Язык: ${result.language.message}`
  ];
  el.terminalOutput.textContent = lines.join('\n');

  if (result.language?.ok && result.language.hasUpdate) {
    el.statusLanguageVersion.textContent = `Pomidor ${result.language.local?.version || '?'} → ${result.language.latestVersion}`;
    pompom.say(result.language.message, result.language.canInstall ? 'surprised' : 'sleepy');
    if (result.language.canInstall) {
      const ok = confirm(`${result.language.message}\n\nУстановить обновление языка из pomidor-c сейчас?`);
      if (ok) await installLanguageUpdateFromIde();
    } else {
      el.terminalOutput.textContent += '\n\nАвтоустановка языка недоступна: в pomidor-c нужен GitHub Release с архивом pomidor-windows-x64.zip или бинарником pomidor.exe.';
    }
  } else if (result.language?.ok) {
    await refreshLanguageVersion();
  } else {
    pompom.say(result.language.message, 'sleepy');
  }

  el.runStatus.textContent = 'готов';
  focusEditor(150);
}

async function checkAllUpdatesManually() {
  el.runStatus.textContent = 'проверка обновлений...';
  const ide = await window.pomidorAPI.checkUpdates();
  const language = await window.pomidorAPI.checkLanguageUpdates();

  const text = [
    'Проверка обновлений:',
    `IDE: ${ide.message}`,
    `Язык: ${language.message}`
  ];

  if (language.ok && language.asset) {
    text.push(`Файл языка: ${language.asset.name}`);
  }

  el.terminalOutput.textContent = text.join('\n');

  if (language.ok && language.hasUpdate) {
    pompom.say(language.message, language.canInstall ? 'surprised' : 'sleepy');
    if (language.canInstall) {
      const ok = confirm(`${language.message}\n\nУстановить обновление языка сейчас?`);
      if (ok) await installLanguageUpdateFromIde();
    } else {
      text.push('Автоустановка недоступна: в pomidor-c пока нет подходящего GitHub Release asset.');
      el.terminalOutput.textContent = text.join('\n');
    }
  } else if (language.ok) {
    pompom.say('Язык Pomidor уже актуален.', 'happy');
    await refreshLanguageVersion();
  } else {
    pompom.say(language.message, 'sad');
  }

  el.runStatus.textContent = 'готов';
  focusEditor(150);
}

async function installLanguageUpdateFromIde() {
  el.runStatus.textContent = 'установка языка...';
  el.terminalOutput.textContent = 'Скачиваю и устанавливаю язык Pomidor из pomidor-c...';
  const result = await window.pomidorAPI.installLanguageUpdate();
  el.terminalOutput.textContent = result.message + (result.installPath ? `\nПуть: ${result.installPath}` : '');
  if (result.ok) {
    pompom.say('Язык Pomidor обновлён. Теперь запуск использует новую версию.', 'happy');
    await refreshLanguageVersion();
  } else {
    pompom.say(result.message, 'sad');
  }
  el.runStatus.textContent = 'готов';
  focusEditor(150);
}

function bindUi() {
  const safeClick = (id, handler) => {
    const node = document.getElementById(id);
    if (node) node.onclick = handler;
  };

  safeClick('runSideBtn', runCode);
  safeClick('updateSideBtn', checkAllUpdatesManually);
  safeClick('templateHello', () => {
    editor?.setValue('пусть имя = "Pom Pom"\nвыведи "Привет, " + имя\n');
    updateLanguageForFile('main.pom');
    focusEditor(50);
  });
  safeClick('templateIf', () => {
    editor?.setValue('пусть score = 10\n\nесли score > 5 {\n    выведи "Победа!"\n} иначе {\n    выведи "Попробуй ещё"\n}\n');
    updateLanguageForFile('main.pom');
    focusEditor(50);
  });
  safeClick('templateLoop', () => {
    editor?.setValue('пусть i = 1\n\nпока i <= 3 {\n    выведи "Цикл: " + строка(i)\n    i = i + 1\n}\n');
    updateLanguageForFile('main.pom');
    focusEditor(50);
  });
}

function bindMenuActions() {
  if (!window.pomidorAPI.onMenuAction) return;
  window.pomidorAPI.onMenuAction(async (action) => {
    if (action === 'new-file') newFile();
    if (action === 'open-file') await openFileDialog();
    if (action === 'open-folder') await openFolderDialog();
    if (action === 'reload-folder') await reloadCurrentFolder();
    if (action === 'save-file') await saveFile();
    if (action === 'run-code') await runCode();
    if (action === 'check-updates') await checkAllUpdatesManually();
    if (action === 'show-explorer') setSideView('explorer');
    if (action === 'show-run') setSideView('run');
    if (action === 'show-mascot') setSideView('mascot');
    if (action === 'show-settings') setSideView('settings');
  });
}

function bindSideMenu() {
  document.querySelectorAll('.activity-icon').forEach(button => {
    button.addEventListener('click', () => setSideView(button.dataset.view));
  });
}

function setSideView(view) {
  document.querySelectorAll('.activity-icon').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.querySelectorAll('.side-view').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${view}`);
  });
  focusEditor(80);
}

function newFile() {
  currentPath = null;
  editor?.setValue(starterCode);
  updateLanguageForFile('main.pom');
  setFileName('main.pom');
  setSaveState('черновик');
  setDirty(false);
  clearMarkers();
  pompom.say('Создал новый файл. Можем начинать новый проект!', 'surprised');
  focusEditor(80);
}

async function openFileDialog() {
  const file = await window.pomidorAPI.openFile();
  if (!file) return;
  loadFileIntoEditor(file);
  pompom.onActivity();
  pompom.say(`Открыл файл ${file.name}.`, 'surprised');
  focusEditor(120);
}

async function openFolderDialog() {
  const folder = await window.pomidorAPI.openFolder();
  if (!folder) return;
  explorerData = folder.tree;
  currentFolderPath = folder.path;
  renderExplorer(folder.tree);
  el.folderPathLabel.textContent = folder.name;
  el.statusProject.textContent = `Папка: ${folder.path}`;
  setSideView('explorer');
  pompom.onActivity();
  pompom.say(`Папка ${folder.name} открыта. Можно смотреть файлы!`, 'surprised');
  focusEditor(120);
}

async function reloadCurrentFolder() {
  if (!currentFolderPath) {
    pompom.say('Сначала открой папку проекта.', 'sad');
    return;
  }
  const folder = await window.pomidorAPI.readFolder(currentFolderPath);
  if (!folder) return;
  explorerData = folder.tree;
  renderExplorer(folder.tree);
  pompom.say('Дерево файлов обновлено.', 'idle');
  focusEditor(80);
}

function loadFileIntoEditor(file) {
  currentPath = file.path;
  editor?.setValue(file.content);
  updateLanguageForFile(file.name);
  setFileName(file.name);
  setSaveState('открыт');
  setDirty(false);
  clearMarkers();
  highlightActiveTreeFile();
  focusEditor(80);
}

async function openFileByPath(filePath) {
  const file = await window.pomidorAPI.readFile(filePath);
  if (!file) return;
  loadFileIntoEditor(file);
  pompom.onActivity();
  pompom.say(`Переключился на ${file.name}.`, 'code');
  focusEditor(80);
}

function renderExplorer(tree) {
  el.explorerTree.innerHTML = '';
  el.explorerEmpty.style.display = tree ? 'none' : 'block';
  if (!tree) return;

  const rootNode = makeTreeNode(tree, true);
  el.explorerTree.appendChild(rootNode);
  highlightActiveTreeFile();
  focusEditor(80);
}

function makeTreeNode(node, isRoot = false) {
  if (node.type === 'directory') {
    const details = document.createElement('details');
    details.className = 'tree-folder';
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'tree-node-summary';
    summary.innerHTML = `<span class="arrow">▾</span><span class="folder-icon">📁</span><span class="summary-label">${node.name}${isRoot ? ' /' : ''}</span>`;
    details.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'tree-children';

    for (const child of (node.children || [])) {
      children.appendChild(makeTreeNode(child));
    }

    details.appendChild(children);
    details.addEventListener('toggle', () => {
      const arrow = summary.querySelector('.arrow');
      arrow.textContent = details.open ? '▾' : '▸';
    });
    return details;
  }

  const row = document.createElement('div');
  row.className = 'tree-file';
  const btn = document.createElement('button');
  btn.className = 'tree-file-btn';
  btn.dataset.path = node.path;
  btn.innerHTML = `<span class="file-icon">📄</span><span class="file-label">${node.name}</span>`;
  btn.onclick = () => openFileByPath(node.path);
  row.appendChild(btn);
  return row;
}

function highlightActiveTreeFile() {
  const buttons = document.querySelectorAll('.tree-file-btn');
  buttons.forEach(btn => btn.classList.toggle('active', !!currentPath && btn.dataset.path === currentPath));
}

async function saveFile() {
  if (!editor) return;
  const result = await window.pomidorAPI.saveFile({ path: currentPath, content: editor.getValue() });
  if (!result) return;
  currentPath = result.path;
  setFileName(result.name);
  setSaveState('сохранено');
  setDirty(false);
  pompom.say('Файл сохранён. Очень аккуратная работа.', 'love');
  if (currentFolderPath) {
    const folder = await window.pomidorAPI.readFolder(currentFolderPath);
    if (folder) {
      explorerData = folder.tree;
      renderExplorer(folder.tree);
    }
  }
  focusEditor(80);
}

async function runCode() {
  if (!editor) return;
  el.runStatus.textContent = 'запуск...';
  clearMarkers();
  pompom.onTestStarted();
  const result = await window.pomidorAPI.run({ path: currentPath, content: editor.getValue() });
  if (result.ok) {
    el.terminalOutput.textContent = result.output || 'Программа завершилась без вывода.';
    el.runStatus.textContent = 'успешно';
    pompom.onRunSuccess(result.output || '');
  } else {
    const errorText = result.error || `Процесс завершился с кодом ${result.code}`;
    el.terminalOutput.textContent = errorText;
    el.runStatus.textContent = 'ошибка';
    setMarkersFromError(errorText);
    pompom.onRunError(errorText);
  }
  focusEditor(150);
}

function setMarkersFromError(errorText) {
  if (!editor || !window.monaco) return;
  const match = errorText.match(/line\s+(\d+)/i);
  if (!match) return;
  const line = Number(match[1]);
  monaco.editor.setModelMarkers(editor.getModel(), 'pomidor', [{
    startLineNumber: line,
    endLineNumber: line,
    startColumn: 1,
    endColumn: Math.max(2, editor.getModel().getLineLength(line) + 1),
    message: errorText.trim(),
    severity: monaco.MarkerSeverity.Error
  }]);
}

function clearMarkers() {
  if (!editor || !window.monaco) return;
  monaco.editor.setModelMarkers(editor.getModel(), 'pomidor', []);
}

function setFileName(name) {
  el.fileName.textContent = name;
  el.statusFile.textContent = `Файл: ${name}`;
  updateLanguageForFile(name);
  refreshStatusBar();
}

function setSaveState(text) {
  el.saveState.textContent = text;
}

function setDirty(value) {
  dirty = value;
  el.dirtyDot.classList.toggle('active', value);
  refreshStatusBar();
}

function refreshStatusBar() {
  const fileText = currentPath ? currentPath.split(/[/\\]/).pop() : 'main.pom';
  el.statusFile.textContent = `Файл: ${fileText}${dirty ? ' • изменён' : ''}`;
}

function updateLanguageForFile(fileName) {
  if (!editor || !window.monaco) return;
  const lower = (fileName || '').toLowerCase();
  let language = 'plaintext';
  if (lower.endsWith('.pom')) language = 'pomidor';
  else if (lower.endsWith('.js')) language = 'javascript';
  else if (lower.endsWith('.json')) language = 'json';
  else if (lower.endsWith('.html')) language = 'html';
  else if (lower.endsWith('.css')) language = 'css';
  else if (lower.endsWith('.md')) language = 'markdown';
  else if (lower.endsWith('.c')) language = 'c';
  monaco.editor.setModelLanguage(editor.getModel(), language);
  el.statusLanguage.textContent = `Язык: ${language}`;
}
