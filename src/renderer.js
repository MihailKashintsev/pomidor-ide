let editor;
let currentPath = null;
let dirty = false;
const pompom = new window.PomPom();

const starterCode = `// Pomidor language example\nскажи "Привет, Pom Pom!"\n\nчисло age = 15\nесли age > 10 {\n    скажи "Большой помидор!"\n}\n`;

require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  window.registerPomidorLanguage(monaco);
  monaco.editor.defineTheme('pomidor-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'ff755f', fontStyle: 'bold' },
      { token: 'string', foreground: 'ffd479' },
      { token: 'comment', foreground: '6b7280' },
      { token: 'number', foreground: '7dd3fc' }
    ],
    colors: { 'editor.background': '#111316' }
  });

  editor = monaco.editor.create(document.getElementById('editor'), {
    value: starterCode,
    language: 'pomidor',
    theme: 'pomidor-dark',
    automaticLayout: true,
    fontSize: 15,
    minimap: { enabled: false },
    roundedSelection: true
  });

  editor.onDidChangeModelContent(() => {
    dirty = true;
    setSaveState('не сохранено');
    const lines = editor.getValue().split('\n').length;
    pompom.onCodeChanged(lines);
  });
});

window.pomidorAPI.getVersion().then(v => document.getElementById('version').textContent = `v${v}`);
window.pomidorAPI.onUpdateStatus(message => {
  document.getElementById('runStatus').textContent = 'обновления';
  document.getElementById('terminalOutput').textContent = message;
  pompom.say(message, 'idle');
});

document.getElementById('newBtn').onclick = () => {
  currentPath = null;
  editor.setValue(starterCode);
  setFileName('main.pom');
  setSaveState('не сохранено');
  pompom.say('Новый файл создан. Начинаем свежий код!', 'happy');
};

document.getElementById('openBtn').onclick = async () => {
  const file = await window.pomidorAPI.openFile();
  if (!file) return;
  currentPath = file.path;
  editor.setValue(file.content);
  setFileName(file.name);
  setSaveState('открыт');
  pompom.say(`Открыл файл ${file.name}.`, 'happy');
};

document.getElementById('saveBtn').onclick = saveFile;
document.getElementById('runBtn').onclick = runCode;
document.getElementById('updateBtn').onclick = async () => {
  const result = await window.pomidorAPI.checkUpdates();
  document.getElementById('terminalOutput').textContent = result.message;
};

document.getElementById('feedBtn').onclick = () => pompom.feed();
document.getElementById('playBtn').onclick = () => pompom.play();
document.getElementById('sleepBtn').onclick = () => pompom.sleep();

document.getElementById('templateHello').onclick = () => editor.setValue('скажи "Привет, мир!"\nprint "Hello world!"\n');
document.getElementById('templateIf').onclick = () => editor.setValue('число score = 10\n\nесли score > 5 {\n    скажи "Победа!"\n} иначе {\n    скажи "Попробуй ещё"\n}\n');

async function saveFile() {
  const result = await window.pomidorAPI.saveFile({ path: currentPath, content: editor.getValue() });
  if (!result) return;
  currentPath = result.path;
  dirty = false;
  setFileName(result.name);
  setSaveState('сохранено');
  pompom.say('Файл сохранён. Я спокоен.', 'happy');
}

async function runCode() {
  document.getElementById('runStatus').textContent = 'запуск...';
  const result = await window.pomidorAPI.run({ path: currentPath, content: editor.getValue() });
  const terminal = document.getElementById('terminalOutput');
  if (result.ok) {
    terminal.textContent = result.output || 'Программа завершилась без вывода.';
    document.getElementById('runStatus').textContent = 'успешно';
    pompom.onRunSuccess(result.output || '');
  } else {
    terminal.textContent = result.error || `Процесс завершился с кодом ${result.code}`;
    document.getElementById('runStatus').textContent = 'ошибка';
    pompom.onRunError(result.error || 'unknown error');
  }
}

function setFileName(name) {
  document.getElementById('fileName').textContent = name;
  document.getElementById('currentFile').textContent = name;
}
function setSaveState(text) { document.getElementById('saveState').textContent = text; }
