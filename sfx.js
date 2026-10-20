/* =====================================================================
   ASTRAL RPG — FrostSFX
   Переработанный атмосферный звуковой движок. Все звуки генерируются
   процедурно (без файлов): приглушённые «холодные» клики, треск льда,
   азбука Морзе SOS, помехи радио, низкий гул бури. Через конвольвер
   добавлен реверб «заброшенной станции» для глубины и эха.

   Использование:
     window.FrostSFX.unlock()      // вызвать на первый клик пользователя
     window.FrostSFX.play('click') // одноразовый звук
     window.FrostSFX.setVolume(0.6)
     window.FrostSFX.ctx / .master // для эмбиент-микшера
   ===================================================================== */
(function () {
  'use strict';

  let ctx = null, master = null, verb = null, verbGain = null, ready = false, vol = 0.6;
  let muted = true;

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate, len = rate * seconds;
    const imp = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return imp;
  }

  function ensure() {
    if (ctx) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    // реверб «станции»
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(2.4, 3.2);
    verbGain = ctx.createGain(); verbGain.gain.value = 0.28;
    verb.connect(verbGain); verbGain.connect(master);
    ready = true;
    return true;
  }

  async function unlock() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    muted = false;
    return true;
  }

  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; }
  function setMuted(m) { muted = m; }

  // базовый осциллятор-нота с фильтром + опц. реверб
  function tone({ freq = 440, dur = 0.1, type = 'sine', gain = 0.08, filter = 0, send = 0.2, slideTo = 0 }) {
    if (muted || !ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    let node = o;
    if (filter > 0) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = filter; o.connect(bq); node = bq; }
    node.connect(g); g.connect(master);
    if (send > 0) g.connect(verb);
    o.start(t); o.stop(t + dur + 0.1);
  }

  // шумовой импульс (для треска, помех, ветра-порывов)
  function noise({ dur = 0.25, gain = 0.05, type = 'bandpass', freq = 800, q = 0.8, send = 0.3 }) {
    if (muted || !ready) return;
    const t = ctx.currentTime, n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = freq; bq.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq); bq.connect(g); g.connect(master);
    if (send > 0) g.connect(verb);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const SFX = {
    click() { tone({ freq: 180, dur: 0.05, type: 'triangle', gain: 0.05, filter: 900, send: 0.15 });
              setTimeout(() => tone({ freq: 240, dur: 0.04, type: 'sine', gain: 0.03, filter: 1300, send: 0.1 }), 28); },
    hover() { tone({ freq: 540, dur: 0.025, type: 'sine', gain: 0.012, filter: 2200, send: 0.1 }); },
    tab()   { tone({ freq: 320, dur: 0.06, type: 'sine', gain: 0.04, filter: 1500, send: 0.25 }); },
    toast() { tone({ freq: 520, dur: 0.07, type: 'sine', gain: 0.03, filter: 1700, send: 0.3 });
              setTimeout(() => tone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.022, filter: 2400, send: 0.3 }), 50); },
    error() { tone({ freq: 140, dur: 0.18, type: 'sawtooth', gain: 0.05, filter: 700, send: 0.2 });
              setTimeout(() => tone({ freq: 110, dur: 0.2, type: 'sawtooth', gain: 0.04, filter: 600, send: 0.2 }), 90); },
    unlock() { [392, 523.25, 659.25].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.12, type: i === 2 ? 'sawtooth' : 'sine', gain: 0.05, filter: 2000, send: 0.4 }), i * 70)); },
    // треск ломающегося льда (для пасхалки «Великое обледенение»)
    crack() {
      noise({ dur: 0.06, gain: 0.09, type: 'highpass', freq: 2600, q: 0.5, send: 0.2 });
      setTimeout(() => noise({ dur: 0.12, gain: 0.07, type: 'bandpass', freq: 1400, q: 1.2, send: 0.4 }), 40);
      setTimeout(() => noise({ dur: 0.3, gain: 0.05, type: 'lowpass', freq: 500, q: 0.7, send: 0.6 }), 110);
      setTimeout(() => tone({ freq: 70, dur: 0.5, type: 'sine', gain: 0.04, filter: 200, send: 0.5 }), 120);
    },
    // глухой удар / низкий гул (буря)
    boom() { tone({ freq: 58, dur: 0.7, type: 'sine', gain: 0.06, filter: 160, send: 0.5, slideTo: 40 });
             noise({ dur: 0.6, gain: 0.04, type: 'lowpass', freq: 300, q: 0.6, send: 0.5 }); },
    // короткий «бип» Морзе
    beep(long) { tone({ freq: 620, dur: long ? 0.26 : 0.09, type: 'square', gain: 0.045, filter: 1400, send: 0.45 }); },
    // SOS азбукой Морзе (· · · — — — · · ·) с радио-помехами
    sos() {
      if (muted || !ready) return;
      noise({ dur: 1.6, gain: 0.012, type: 'bandpass', freq: 1800, q: 0.4, send: 0.3 });
      const seq = [0, 0, 0, 1, 1, 1, 0, 0, 0]; // 0 = dot, 1 = dash
      let t = 120;
      seq.forEach((s, i) => {
        setTimeout(() => SFX.beep(s === 1), t);
        t += (s === 1 ? 300 : 140) + 90;
        if (i === 2 || i === 5) t += 120; // паузы между буквами
      });
    },
    // включение секретной темы
    secret() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.1, type: i % 2 ? 'triangle' : 'sine', gain: 0.04, filter: 2400, send: 0.5 }), i * 65)); },
    radar() { // свип ретро-радара
      let f = 300;
      const id = setInterval(() => { tone({ freq: f, dur: 0.04, type: 'sine', gain: 0.02, filter: 1600, send: 0.3 }); f += 120; if (f > 1400) clearInterval(id); }, 45);
    },
  };

  function play(name) { if (SFX[name]) SFX[name](); }

  window.AstralSFX = window.FrostSFX = {
    unlock, setVolume, setMuted, play,
    get ctx() { return ctx; },
    get master() { return master; },
    get verb() { return verb; },
    ensure,
    isReady: () => ready,
  };
})();
