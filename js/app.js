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
    redraw();
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

  function setupHint() {
    var hint = document.getElementById('ruler-hint');
    var detected = window.Calibration.detected;
    var calibrated = window.Calibration.state().source !== 'auto';

    if (!calibrated && detected.confidence !== 'hoch') {
      hint.textContent = 'Bildschirm nicht erkannt – bitte einmalig kalibrieren (Zahnrad oben rechts)';
      document.getElementById('btn-calibrate').classList.add('is-on');
    }
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
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        /* Ohne Service Worker läuft die App weiterhin, nur nicht offline. */
      });
    });
  }

  function start() {
    window.Calibration.init();
    window.Scales.init();
    window.Ruler.init();
    window.Protractor.init();

    window.Calibration.onChange(function () {
      document.getElementById('btn-calibrate').classList.remove('is-on');
      redraw();
    });

    window.Scales.onChange(function () { window.Ruler.refresh(); });

    setupTabs();
    setupToolbar();
    setupHint();
    setupLifecycle();
    registerServiceWorker();
    requestWakeLock();

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
