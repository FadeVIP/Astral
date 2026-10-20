/* =====================================================================
   FROSTBORNE DEADLANDS — FrostExtras
   1) Динамический favicon: замёрзший радар/маяк с тускло мигающим
      красным SOS-огоньком (рисуется на canvas, обновляется по таймеру).
   2) Пасхалки:
      • «Великое обледенение» — набрать frost / ice → иней + треск льда
      • Код Конами — ретро-радар + секретная тема
      • «Сигнал SOS» — клик по скрытой радиовышке → Морзе + лор
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- динамический favicon отключён в пользу логотипа Astral ---------------- */
  const fav = {
    draw: () => {}
  };

  /* ---------------- оверлей инея ---------------- */
  function frostOverlay() {
    let el = document.getElementById('frost-overlay');
    if (el) { el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4200); return; }
    el = document.createElement('div');
    el.id = 'frost-overlay';
    el.innerHTML = `<svg width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="frostNoise"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="3" seed="7"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.78  0 0 0 0 1  0 0 0 0.5 0"/></filter>
        <radialGradient id="frostV" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stop-color="rgba(124,206,255,0)"/>
          <stop offset="70%" stop-color="rgba(124,206,255,.12)"/>
          <stop offset="100%" stop-color="rgba(168,224,255,.55)"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" filter="url(#frostNoise)" opacity="0.6"/>
      <rect width="100%" height="100%" fill="url(#frostV)"/>
    </svg>
    <div class="frost-msg">❄ ВЕЛИКОЕ ОБЛЕДЕНЕНИЕ ❄</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    el._t = setTimeout(() => el.classList.remove('show'), 4200);
  }

  /* ---------------- пасхалка: набор frost / ice ---------------- */
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k.length === 1 && /[a-z]/.test(k)) {
      typed = (typed + k).slice(-5);
      if (typed.endsWith('frost') || typed.endsWith('ice')) {
        frostOverlay();
        if (window.FrostSFX) { window.FrostSFX.unlock().then(() => window.FrostSFX.play('crack')); }
        typed = '';
        toast('❄ ВЕЛИКОЕ ОБЛЕДЕНЕНИЕ', 'Иней расползается по экрану станции. Слышен треск ломающегося льда.');
      }
    }
  });

  /* ---------------- код Конами ---------------- */
  const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
  let kSeq = [];
  document.addEventListener('keydown', (e) => {
    kSeq.push((e.key || '').toLowerCase());
    kSeq = kSeq.slice(-KONAMI.length);
    if (KONAMI.every((v, i) => v === kSeq[i])) {
      kSeq = [];
      radarMode();
    }
  });

  function radarMode() {
    document.body.classList.add('radar-mode');
    if (window.FrostSFX) { window.FrostSFX.unlock().then(() => { window.FrostSFX.play('radar'); setTimeout(() => window.FrostSFX.play('secret'), 700); }); }
    let scr = document.getElementById('radar-screen');
    if (!scr) {
      scr = document.createElement('div'); scr.id = 'radar-screen';
      scr.innerHTML = `<div class="radar-ring"></div><div class="radar-sweep"></div>
        <div class="radar-label">// РЕТРО-РАДАР · ПРИБЛИЖЕНИЕ МЕТЕЛИ</div>
        <div class="radar-sub">SECRET THEME UNLOCKED · ICE-17</div>`;
      document.body.appendChild(scr);
    }
    scr.classList.add('show');
    toast('🛰 КОД ПРИНЯТ', 'Ретро-радар активирован. Секретная тема разблокирована.');
    setTimeout(() => {
      scr.classList.remove('show');
      document.body.classList.add('secret-theme'); // оставляем секретную тему
    }, 3600);
  }

  /* ---------------- сигнал SOS (скрытая радиовышка) ---------------- */
  function initTower() {
    let tower = document.getElementById('sos-tower');
    if (!tower) {
      tower = document.createElement('button');
      tower.id = 'sos-tower';
      tower.type = 'button';
      tower.setAttribute('aria-label', 'Скрытый сигнал');
      tower.innerHTML = `<svg viewBox="0 0 40 60" width="26" height="40">
        <path d="M20 4 L8 56 M20 4 L32 56 M11 44 L29 44 M13.5 32 L26.5 32 M16 20 L24 20" stroke="currentColor" stroke-width="1.6" fill="none"/>
        <circle id="sos-light" cx="20" cy="4" r="3" fill="#5a1414"/>
      </svg>`;
      document.body.appendChild(tower);
    }
    tower.addEventListener('click', () => {
      if (window.FrostSFX) window.FrostSFX.unlock().then(() => window.FrostSFX.play('sos'));
      const lore = LORE[Math.floor(Math.random() * LORE.length)];
      toast('📡 ПЕРЕХВАЧЕН СИГНАЛ', lore, 6500);
      const lt = document.getElementById('sos-light');
      if (lt) { let n = 0; const id = setInterval(() => { lt.setAttribute('fill', n % 2 ? '#ff5a5a' : '#5a1414'); if (++n > 8) { clearInterval(id); lt.setAttribute('fill', '#5a1414'); } }, 200); }
    });
  }
  const LORE = [
    '…день 47… генераторы держат тепло, но топлива на неделю… они приходят с метелью… не открывайте шлюз ночью…',
    '…это последняя запись доктора Морозова… вирус не убивает холод… он любит его… ICE-17 был ошибкой…',
    '…если вы это слышите — станция «Буран» ещё стоит… координаты в дневнике… остерегайтесь тех, кто не дышит паром…',
    '…реактор станции 7 заглушен вручную… передайте дальше… МОРОЗ-01 всё ещё в сети… он наблюдает…',
    '…мы думали, зима закончится… прошло 312 дней… паёк закончился вчера… передаю частоту выжившим…',
  ];

  /* ---------------- мини-тост (если на странице нет своего) ---------------- */
  function toast(title, body, ms) {
    let t = document.getElementById('toast');
    if (t && t.querySelector('.toast-title')) {
      t.querySelector('.toast-title').textContent = title;
      t.querySelector('.toast-body').textContent = body;
      t.classList.add('show');
      clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 4200);
      if (window.FrostSFX) window.FrostSFX.play('toast');
      return;
    }
    // создать свой
    t = document.getElementById('fx-toast');
    if (!t) { t = document.createElement('div'); t.id = 'fx-toast'; t.innerHTML = '<div class="fxt-title"></div><div class="fxt-body"></div>'; document.body.appendChild(t); }
    t.querySelector('.fxt-title').textContent = title;
    t.querySelector('.fxt-body').textContent = body;
    t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 4200);
    if (window.FrostSFX) window.FrostSFX.play('toast');
  }

  // экспортируем для отладки
  window.FrostExtras = { frostOverlay, radarMode, toast };

  if (document.readyState !== 'loading') initTower();
  else document.addEventListener('DOMContentLoaded', initTower);
})();
