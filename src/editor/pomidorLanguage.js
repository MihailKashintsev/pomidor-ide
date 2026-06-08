window.registerPomidorLanguage = function registerPomidorLanguage(monaco) {
  monaco.languages.register({ id: 'pomidor' });

  monaco.languages.setMonarchTokensProvider('pomidor', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\b(скажи|print|число|number|строка|string|если|if|иначе|else|пока|while|повтор|repeat|верни|return|функция|function)\b/, 'keyword'],
        [/\b(истина|ложь|true|false)\b/, 'constant'],
        [/[0-9]+/, 'number'],
        [/[{}()[\]]/, '@brackets'],
        [/[a-zA-Zа-яА-Я_][\wа-яА-Я_]*/, 'identifier']
      ]
    }
  });

  monaco.languages.setLanguageConfiguration('pomidor', {
    comments: { lineComment: '//' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ]
  });
};
