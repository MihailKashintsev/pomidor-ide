window.PomPom = class PomPom {
  constructor() {
    this.state = JSON.parse(localStorage.getItem('pompom-state') || '{"happiness":80,"energy":100,"hunger":20,"errors":0}');
    this.el = document.getElementById('pompom');
    this.message = document.getElementById('pompomMessage');
    this.updateMeters();
    setInterval(() => this.tick(), 30000);
  }

  say(text, mood = 'idle') {
    this.el.className = `pompom ${mood}`;
    this.message.textContent = text;
  }

  onCodeChanged(lines) {
    this.state.happiness = Math.min(100, this.state.happiness + 1);
    if (lines > 20) this.say('Ого, проект растёт. Я внимательно смотрю!', 'happy');
    this.save();
  }

  onRunSuccess(output) {
    this.state.errors = 0;
    this.state.happiness = Math.min(100, this.state.happiness + 10);
    this.state.energy = Math.max(0, this.state.energy - 2);
    this.say(output.trim() ? 'Код запустился! Вывод уже внизу.' : 'Код запустился без ошибок.', 'happy');
    this.save();
  }

  onRunError(errorText) {
    this.state.errors += 1;
    this.state.happiness = Math.max(0, this.state.happiness - 7);
    this.state.energy = Math.max(0, this.state.energy - 5);
    const hint = this.makeHint(errorText);
    this.say(hint, this.state.errors >= 3 ? 'angry' : 'sad');
    this.save();
  }

  makeHint(errorText) {
    if (errorText.includes('скажы')) return 'Похоже, ты написал «скажы». Нужно «скажи».';
    if (errorText.includes('unknown command')) return 'Я не знаю такую команду. Проверь первое слово в строке.';
    if (errorText.includes('expected')) return 'Где-то не хватает символа или значения. Проверь строку ошибки.';
    return 'В коде ошибка. Посмотри вывод снизу, там есть строка и причина.';
  }

  feed() {
    this.state.hunger = Math.max(0, this.state.hunger - 20);
    this.state.happiness = Math.min(100, this.state.happiness + 5);
    this.say('Спасибо за помидор! Теперь можно кодить дальше.', 'happy');
    this.save();
  }

  play() {
    this.state.energy = Math.max(0, this.state.energy - 10);
    this.state.happiness = Math.min(100, this.state.happiness + 12);
    this.say('Играем! Но потом надо будет писать код.', 'happy');
    this.save();
  }

  sleep() {
    this.state.energy = Math.min(100, this.state.energy + 25);
    this.say('Я немного посплю и восстановлю энергию.', 'sleep');
    this.save();
  }

  tick() {
    this.state.hunger = Math.min(100, this.state.hunger + 2);
    this.state.energy = Math.max(0, this.state.energy - 1);
    if (this.state.energy < 20) this.say('Я устал. Может, немного поспим?', 'sleep');
    if (this.state.hunger > 75) this.say('Я проголодался. Нужен помидор.', 'sad');
    this.save();
  }

  updateMeters() {
    document.getElementById('happyMeter').value = this.state.happiness;
    document.getElementById('energyMeter').value = this.state.energy;
    document.getElementById('hungerMeter').value = this.state.hunger;
  }

  save() {
    this.updateMeters();
    localStorage.setItem('pompom-state', JSON.stringify(this.state));
  }
};
