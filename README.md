# Pomidor IDE

**Pomidor IDE** — редактор кода для языка программирования Pomidor с маскотом **Pom Pom**.

## Возможности

- редактор кода на Monaco Editor;
- подсветка синтаксиса `.pom`;
- запуск Pomidor-кода через компилятор/интерпретатор на C;
- панель вывода и ошибок;
- маскот Pom Pom, который реагирует на запуск, ошибки и активность;
- мини-тамагочи: счастье, энергия, голод;
- автообновления через GitHub Releases;
- GitHub Actions для сборки Windows/Linux/macOS;
- скрипт быстрого релиза.

## Быстрый старт

```bash
npm install
```

Собрать компилятор:

### Windows

```bash
gcc compiler/pomidor.c -o compiler/pomidor.exe
```

### Linux/macOS

```bash
gcc compiler/pomidor.c -o compiler/pomidor
chmod +x compiler/pomidor
```

Запуск IDE:

```bash
npm start
```

## Релиз

```bash
npm run release -- 0.1.1
```

Скрипт обновит версию, сделает commit, создаст tag и отправит в GitHub. После push тега GitHub Actions соберёт релиз.

## Создание репозитория

```bash
git init
git add .
git commit -m "Initial Pomidor IDE"
git branch -M main
git remote add origin https://github.com/MihailKashintsev/pomidor-ide.git
git push -u origin main
```

Потом сделай первый релиз:

```bash
npm run release -- 0.1.0
```

## Автообновления

Автообновления работают в собранной версии приложения через `electron-updater` и GitHub Releases. В `package.json` уже указан репозиторий:

```json
{
  "owner": "MihailKashintsev",
  "repo": "pomidor-ide"
}
```

Если репозиторий будет называться иначе, измени эти значения.
