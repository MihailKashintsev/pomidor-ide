window.PomPom = class PomPom {
  constructor() {
    const now = Date.now();
    this.state = JSON.parse(localStorage.getItem('pompom-state') || '{}');
    this.state.happiness ??= 80;
    this.state.energy ??= 100;
    this.state.hunger ??= 20;
    this.state.errors ??= 0;
    this.state.mood ??= 'idle';
    this.state.lastActivity ??= now;
    this.state.lastSleep ??= now;
    this.state.workStartedAt ??= now;
    this.state.lastWorkWarning ??= 0;

    this.spriteMap = {
      idle: 'assets/pompom-idle.png',
      happy: 'assets/pompom-happy.png',
      sad: 'assets/pompom-sad.png',
      angry: 'assets/pompom-angry.png',
      sleep: 'assets/pompom-sleep.png',
      sleepy: 'assets/pompom-sleepy.png',
      eat: 'assets/pompom-eat.png',
      play: 'assets/pompom-play.png',
      surprised: 'assets/pompom-surprised.png',
      love: 'assets/pompom-love.png',
      code: 'assets/pompom-code.png'
    };

    this.card = document.getElementById('pompomCard');
    this.sprite = document.getElementById('pompomSprite');
    this.message = document.getElementById('pompomMessage');
    this.moodBadge = document.getElementById('moodBadge');
    this.particles = document.getElementById('pixelParticles');
    this.statusMascot = document.getElementById('statusMascot');
    this.sleepText = document.getElementById('sleepText');
    this.updateMeters();
    this.setMood(this.state.mood || 'idle');
    setInterval(() => this.tick(), 30000);
  }

  setMood(mood) {
    this.state.mood = mood;
    this.card.dataset.mood = mood;
    this.moodBadge.textContent = mood.toUpperCase();
    this.statusMascot.textContent = `Pom Pom: ${mood}`;
    this.sleepText.style.opacity = mood === 'sleep' || mood === 'sleepy' ? '1' : '0';
    this.sprite.src = this.spriteMap[mood] || this.spriteMap.idle;
    this.spawnParticles(mood);
  }

  say(text, mood = 'idle') {
    this.setMood(mood);
    this.message.textContent = text;
    this.card.classList.remove('bubble-pop');
    void this.card.offsetWidth;
    this.card.classList.add('bubble-pop');
    this.save();
  }

  onActivity() {
    const now = Date.now();
    this.state.lastActivity = now;
    if (!this.state.workStartedAt) this.state.workStartedAt = now;
    if (this.state.mood === 'sleepy' && this.state.energy > 35) {
      this.setMood('code');
    }
    this.save();
  }

  onTestStarted() {
    this.onActivity();
    this.state.energy = Math.max(0, this.state.energy - 1);
    this.say('Запускаю проверку. Смотрю внимательно.', 'code');
  }

  spawnParticles(mood) {
    const maps = {
      happy: ['★', '✦', '♥'],
      idle: ['·', '•'],
      sad: ['…', '·'],
      angry: ['!', '✦'],
      sleep: ['z', 'Z'],
      sleepy: ['z', '·'],
      play: ['★', '◆'],
      eat: ['♥', '🍅'],
      surprised: ['!', '★'],
      love: ['♥', '♥', '✦'],
      code: ['<', '/', '>']
    };
    const chars = maps[mood] || maps.idle;
    this.particles.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      span.textContent = chars[i % chars.length];
      span.style.left = `${12 + Math.random() * 76}%`;
      span.style.top = `${10 + Math.random() * 60}%`;
      span.style.animationDelay = `${Math.random() * 0.8}s`;
      this.particles.appendChild(span);
    }
  }

  onCodeChanged(lines) {
    this.state.happiness = Math.min(100, this.state.happiness + 1);
    if (lines > 20) {
      this.say('Ого, кодовая база растёт! Я уже чувствую атмосферу большого IDE.', 'happy');
    } else if (Math.random() < 0.2) {
      this.say('Пишем код! Я внимательно смотрю на синтаксис.', 'code');
    } else {
      this.updateMeters();
      this.save();
    }
  }

  onRunSuccess(output) {
    this.state.errors = 0;
    this.state.happiness = Math.min(100, this.state.happiness + 12);
    this.state.energy = Math.min(100, this.state.energy + 4);
    this.state.hunger = Math.max(0, this.state.hunger - 18);
    this.say(output.trim() ? 'Запуск успешный! Я перекусил и доволен результатом.' : 'Код запустился без ошибок. Я перекусил помидоркой.', 'eat');
  }

  onRunError(errorText) {
    this.state.errors += 1;
    this.state.happiness = Math.max(0, this.state.happiness - 8);
    this.state.energy = Math.max(0, this.state.energy - 14);
    this.state.hunger = Math.min(100, this.state.hunger + 4);
    const hint = this.makeHint(errorText);
    this.say(hint, this.state.energy < 20 || this.state.errors >= 3 ? 'angry' : 'sad');
  }

  makeHint(errorText) {
    if (errorText.includes('скажы')) return 'Похоже, у тебя опечатка: нужно «скажи», а не «скажы».';
    if (errorText.includes('unknown command')) return 'IDE не узнаёт команду. Проверь первое слово в строке.';
    if (errorText.includes('expected')) return 'Я жду недостающий символ или блок. Проверь строку с ошибкой.';
    if (errorText.match(/line\s+\d+/i)) return 'Ошибка найдена. Я отметил строку прямо в редакторе.';
    return 'В коде ошибка. Посмотри вывод снизу, там есть причина.';
  }

  feed() {
    this.onActivity();
    this.state.hunger = Math.max(0, this.state.hunger - 20);
    this.state.happiness = Math.min(100, this.state.happiness + 5);
    this.say('Я сам ем после удачных запусков.', 'love');
  }

  play() {
    this.onActivity();
    this.state.energy = Math.max(0, this.state.energy - 10);
    this.state.happiness = Math.min(100, this.state.happiness + 12);
    this.say('Я играю, когда код запускается без ошибок.', 'play');
  }

  sleep() {
    const now = Date.now();
    this.state.lastSleep = now;
    this.state.energy = Math.min(100, this.state.energy + 25);
    this.say('Я ушёл спать и восстанавливаю энергию.', 'sleep');
  }

  tick() {
    const now = Date.now();
    const inactiveMs = now - this.state.lastActivity;
    const noSleepMs = now - this.state.lastSleep;
    const workMs = now - (this.state.workStartedAt || now);

    this.state.hunger = Math.min(100, this.state.hunger + 2);

    if (inactiveMs < 45000) {
      this.state.energy = Math.max(0, this.state.energy - 2);
    } else {
      this.state.energy = Math.max(0, this.state.energy - 1);
    }

    if (this.state.mood === 'sleep' && now - this.state.lastSleep > 90000) {
      this.state.energy = Math.min(100, this.state.energy + 18);
      this.state.workStartedAt = now;
      this.state.lastActivity = now;
      this.say('Я проснулся. Можно продолжать кодить.', 'idle');
      return;
    }

    if (this.state.mood !== 'sleep' && workMs > 900000) {
      this.state.lastSleep = now;
      this.state.workStartedAt = now;
      this.state.energy = Math.min(100, this.state.energy + 20);
      this.say('Ты долго работаешь, я тоже устал и ушёл спать на минутку.', 'sleep');
      return;
    }

    if (this.state.mood !== 'sleep' && noSleepMs > 360000) {
      this.state.energy = Math.max(0, this.state.energy - 4);
      this.say('Я давно не спал. Сижу сонный, но всё ещё слежу за кодом.', 'sleepy');
      return;
    }

    if (this.state.energy < 20) this.say('Энергии мало после ошибок. Мне нужен удачный запуск или сон.', 'sleepy');
    else if (this.state.hunger > 75) this.say('Я проголодался. Следующий удачный запуск меня покормит.', 'sad');
    else if (Math.random() < 0.10) this.say('Я рядом и наблюдаю за кодом.', 'idle');
    else this.save();
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
