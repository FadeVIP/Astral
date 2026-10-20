/* =====================================================================
   ASTRAL RPG — единственный источник правды по версиям.

   Меняешь версию ЗДЕСЬ — она подставляется везде: в баннеры, HUD,
   терминалы, тикер и переводы на всех 6 языках.

   Как выводить версию:
     • в разметке   — <span data-ver="pack">R1.2</span>
                      (data-ver: pack | packName | packFull | site)
     • в переводах  — плейсхолдер {v} внутри строки i18n.js,
                      i18n.js подставляет его сам при apply()
     • в JS         — window.FROST_VERSION.pack

   ⚠ При выпуске новой версии не забудь также поднять ?v= в тегах
     <script src="...?v=2.30"> на всех 4 страницах — иначе вернувшиеся
     посетители получат старые модули из кеша браузера.
   ===================================================================== */
(function () {
  'use strict';

  var V = {
    pack: 'R1.2',                    // версия сборки (внутренняя нумерация — 2.1.0)
    packName: 'Сталь и слово',       // её кодовое имя
    site: '2.30'                      // версия сайта (STATION OS)
  };

  V.packFull = V.pack + ' «' + V.packName + '»';
  V.siteFull = 'STATION OS ' + V.site;

  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-ver]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-ver');
      if (V[key] != null) nodes[i].textContent = V[key];
    }
  }

  V.apply = apply;
  window.ASTRAL_VERSION = window.FROST_VERSION = V;

  if (document.readyState !== 'loading') apply();
  else document.addEventListener('DOMContentLoaded', function () { apply(); });
})();
