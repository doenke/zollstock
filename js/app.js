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

  function setupToolbar() {
    document.getElementById('btn-swap').addEventListener('click', function () {
      window.Scales.swap();
    });

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
      pending = setTimeout(redraw, 60);
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
    window.Scales.init();
    window.Edge.init();
    window.Ruler.init();
    window.Protractor.init();

    window.Calibration.onChange(function () {
      updateHint();
      redraw();
    });

    window.Scales.onChange(function () { window.Ruler.refresh(); });
    window.Edge.onChange(function () { window.Ruler.refresh(); });

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
