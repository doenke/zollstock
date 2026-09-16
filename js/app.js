/* Anwendungsgerüst: Ansichtswechsel, Bedienelemente, Neuzeichnen. */
(function () {
  'use strict';

  var currentView = 'ruler';
  var wakeLock = null;

  function redraw() {
    if (currentView === 'ruler') window.Ruler.draw();
    else window.Protractor.draw();
  }

  function showView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(function (view) {
      view.classList.toggle('is-active', view.id === 'view-' + name);
    });
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.view === name);
    });
    /* Der Winkelmesser lauscht am Sensor und zeichnet laufend – das läuft nur,
     * solange seine Ansicht offen ist. */
    window.Protractor.setActive(name === 'protractor');
    if (name === 'ruler') window.Ruler.draw();
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
    });
  }

  /* Der Knopf zeigt als Pfeil, wo die Null liegt und wohin gezählt wird. */
  function showZeroPoint() {
    var entry = window.Scales.zero();
    var glyph = window.Scales.zeroGlyph(entry);

    document.getElementById('btn-zeropoint-arrow').textContent = glyph.arrow;
    document.getElementById('btn-zeropoint-tag').textContent = glyph.tag;
    document.getElementById('btn-zeropoint').title = window.Scales.zeroName(entry);
  }

  /* Beim Wechseln kurz ausschreiben, welche Lage jetzt gilt. */
  var hintTimer = null;
  function flashHint(text) {
    var hint = document.getElementById('ruler-hint');
    hint.textContent = text;
    hint.classList.remove('is-hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.add('is-hidden'); }, 1800);
  }

  function setupToolbar() {
    document.getElementById('btn-zeropoint').addEventListener('click', function () {
      var entry = window.Scales.cycleZero();
      showZeroPoint();
      flashHint(window.Scales.zeroName(entry));
    });

    showZeroPoint();

    document.getElementById('btn-calibrate').addEventListener('click', function () {
      window.Calibration.open();
    });
  }

  /* Ist die Erkennung unsicher, weist der Hinweis auf die Kalibrierung hin. */
  function updateHint() {
    var hint = document.getElementById('ruler-hint');
    var button = document.getElementById('btn-calibrate');
    var detected = window.Calibration.detected();
    var unsure = window.Calibration.state().source === 'auto' &&
      detected.confidence !== 'hoch';

    hint.textContent = unsure
      ? 'Bildschirm nicht sicher erkannt – bitte einmalig kalibrieren (Zahnrad oben rechts)'
      : 'Tippen oder ziehen, um die Messmarke zu setzen';
    button.classList.toggle('is-on', unsure);
  }

  /* Bildschirm während des Messens wach halten. */
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* z. B. bei niedrigem Akkustand – unkritisch */ });
  }

  function setupLifecycle() {
    var pending;

    function schedule() {
      clearTimeout(pending);
      pending = setTimeout(function () {
        /* Beim Drehen des Geräts wechselt auch die Richtung des Pfeils. */
        showZeroPoint();
        redraw();
      }, 60);
    }

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        redraw();
      }
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

    /* Beim ersten Besuch gibt es noch keinen Service Worker. Übernimmt dann
     * der erste die Seite, ist das keine neue Fassung, sondern der Anfang. */
    var hadController = !!navigator.serviceWorker.controller;
    var chip = document.getElementById('update-chip');

    chip.addEventListener('click', function () { location.reload(); });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) chip.hidden = false;
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        /* Eine installierte App wird oft nur aus dem Hintergrund geholt und
         * nie neu geladen – dann muss sie selbst nach einer neuen Fassung
         * sehen. */
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') registration.update();
        });
      }).catch(function () {
        /* Ohne Service Worker läuft die App weiterhin, nur nicht offline. */
      });
    });
  }

  function start() {
    window.Calibration.init();
    window.Edge.init();
    window.Ruler.init();
    window.Protractor.init();

    window.Calibration.onChange(function () {
      updateHint();
      redraw();
    });

    window.Scales.onChange(function () {
      showZeroPoint();
      window.Ruler.refresh();
    });
    window.Edge.onChange(function () {
      /* Ist die Hülle vermessen, kommen ihre Nullpunkte dazu. */
      showZeroPoint();
      window.Ruler.refresh();
    });

    setupTabs();
    setupToolbar();
    updateHint();
    setupLifecycle();
    registerServiceWorker();
    requestWakeLock();

    /* Das Gerätemodell verrät Chrome nur über die Client Hints und nur
     * asynchron – nachreichen, sobald es da ist. */
    window.Devices.refine().then(function (better) {
      if (!better) return;
      window.Calibration.updateDetected(better);
      updateHint();
      redraw();
    });

    redraw();
    /* Nach dem Laden der Systemschrift erneut zeichnen, damit die
     * Beschriftung sauber sitzt. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
