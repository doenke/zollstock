/* Anwendungsgerüst: Ansichtswechsel, Bedienelemente, Neuzeichnen. */
(function () {
  'use strict';

  var THEME_KEY = 'zollstock.theme.v1';
  var VIEW_KEY = 'zollstock.view.v1';
  var VIEWS = ['ruler', 'gauge', 'protractor'];
  var currentView = 'ruler';
  var wakeLock = null;

  function redraw() {
    if (currentView === 'ruler') window.Ruler.draw();
    else if (currentView === 'gauge') window.Gauge.draw();
    else window.Protractor.draw();
  }

  function showView(name) {
    currentView = name;

    /* Seit die App sich selbst nachlädt, fiele man sonst jedes Mal ins
     * Lineal zurück – auch mitten im Messen. */
    try {
      localStorage.setItem(VIEW_KEY, name);
    } catch (err) {
      /* Privater Modus – dann gilt die Wahl nur für diese Sitzung. */
    }

    document.querySelectorAll('.view').forEach(function (view) {
      view.classList.toggle('is-active', view.id === 'view-' + name);
    });
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.view === name);
    });
    /* Der Nullpunkt gehört zum Lineal. Die Kalibrierung gilt auch für die
     * Messlehre – nur beim Winkelmesser hat beides nichts zu melden. */
    document.getElementById('btn-zeropoint').hidden = name !== 'ruler';
    document.getElementById('btn-calibrate').hidden = name === 'protractor';

    /* Der Winkelmesser lauscht am Sensor und zeichnet laufend – das läuft nur,
     * solange seine Ansicht offen ist. */
    window.Protractor.setActive(name === 'protractor');
    if (name === 'ruler') window.Ruler.draw();
    if (name === 'gauge') window.Gauge.draw();
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
    });

    var stored = null;
    try {
      stored = localStorage.getItem(VIEW_KEY);
    } catch (err) {
      /* ohne Speicher beginnt es beim Lineal */
    }

    showView(VIEWS.indexOf(stored) >= 0 ? stored : 'ruler');
  }

  /* ---------- Kurze Meldung ---------- */

  var toastTimer = null;

  function toast(text) {
    var box = document.getElementById('toast');
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 2800);
  }

  /* ---------- Drehsperre ---------- */

  var rotationLocked = false;
  var fullscreenForLock = false;

  function showRotation() {
    var button = document.getElementById('btn-rotation');
    button.classList.toggle('is-on', rotationLocked);
    button.setAttribute('aria-pressed', rotationLocked ? 'true' : 'false');
    button.title = rotationLocked ? 'Drehung wieder freigeben' : 'Drehung des Bildschirms sperren';
  }

  /* Gesperrt wird auf die Lage, in der das Gerät gerade ist. Chrome erlaubt
   * das nur einer installierten App oder im Vollbild – läuft die App im
   * Browsertab, holen wir das Vollbild dazu. Randgenau messen lässt sich dort
   * ohnehin nur so. */
  function lockRotation() {
    var art = screen.orientation.type || 'portrait-primary';

    return screen.orientation.lock(art).catch(function (err) {
      var root = document.documentElement;
      if (!root.requestFullscreen) throw err;

      return root.requestFullscreen().then(function () {
        fullscreenForLock = true;
        return screen.orientation.lock(art);
      });
    });
  }

  function releaseRotation() {
    try {
      screen.orientation.unlock();
    } catch (err) {
      /* War nicht gesperrt – dann ist nichts zu tun. */
    }

    if (fullscreenForLock && document.exitFullscreen) {
      document.exitFullscreen().catch(function () { /* schon verlassen */ });
    }

    fullscreenForLock = false;
    rotationLocked = false;
    showRotation();
  }

  function toggleRotation() {
    if (rotationLocked) {
      releaseRotation();
      return;
    }

    lockRotation().then(function () {
      rotationLocked = true;
      showRotation();
      if (fullscreenForLock) toast('Drehung gesperrt – dafür im Vollbild');
    }).catch(function () {
      fullscreenForLock = false;
      rotationLocked = false;
      showRotation();
      toast('Drehsperre geht hier nicht – die App zum Startbildschirm hinzufügen');
    });
  }

  function setupRotationLock() {
    var button = document.getElementById('btn-rotation');

    /* Ohne die Schnittstelle – auf iOS gibt es sie nicht – wäre es eine tote
     * Taste. Dann lieber keine. */
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') {
      button.hidden = true;
      return;
    }

    button.addEventListener('click', toggleRotation);

    /* Wer das Vollbild über die Geste des Systems verlässt, verliert damit
     * auch die Sperre. */
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement && fullscreenForLock) {
        fullscreenForLock = false;
        rotationLocked = false;
        showRotation();
      }
    });

    showRotation();
  }

  /* ---------- Heller Grund ---------- */

  /* Zum Anlegen dunkler Teile – auf schwarzem Grund ist ein Bohrer kaum vom
   * Hintergrund zu unterscheiden. Die Wahl bleibt gespeichert; voreingestellt
   * bleibt Dunkel, weil danach die Skalen am ruhigsten aussehen. */
  function theme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function setTheme(name, remember) {
    var light = name === 'light';

    if (light) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');

    var button = document.getElementById('btn-theme');
    button.classList.toggle('is-on', light);
    button.setAttribute('aria-pressed', light ? 'true' : 'false');
    button.title = light ? 'Zurück auf dunklen Grund' : 'Heller Grund zum Anlegen';

    /* Auch die Leiste des Browsers soll mitgehen. */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();

    if (remember) {
      try {
        localStorage.setItem(THEME_KEY, name);
      } catch (err) {
        /* Privater Modus – gilt dann nur für diese Sitzung. */
      }
    }

    /* Die Zeichenflächen holen ihre Farben aus dem Stylesheet. */
    window.Ruler.refresh();
    window.Gauge.refresh();
    window.Protractor.draw();
  }

  function setupTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (err) {
      /* ohne Speicher bleibt es beim dunklen Grund */
    }

    setTheme(stored === 'light' ? 'light' : 'dark', false);
    document.getElementById('btn-theme').addEventListener('click', function () {
      setTheme(theme() === 'light' ? 'dark' : 'light', true);
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
    var pending = false;
    var reloading = false;

    function reloadOnce() {
      if (reloading) return;
      reloading = true;
      location.reload();
    }

    chip.addEventListener('click', reloadOnce);

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      pending = true;
      chip.hidden = false;
      /* Wer gerade nicht hinsieht, bekommt die neue Fassung sofort. */
      if (document.visibilityState !== 'visible') reloadOnce();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        document.addEventListener('visibilitychange', function () {
          /* Eine installierte App wird oft nur aus dem Hintergrund geholt und
           * nie neu geladen – dann muss sie selbst nach einer neuen Fassung
           * sehen. */
          if (document.visibilityState === 'visible') {
            registration.update();
            return;
          }

          /* Weggelegt, und eine neue Fassung wartet: jetzt nachladen, damit
           * sie beim nächsten Hinsehen da ist. Niemand muss dafür einen
           * Hinweis wegtippen, den er vielleicht gar nicht sieht. */
          if (pending) reloadOnce();
        });
      }).catch(function () {
        /* Ohne Service Worker läuft die App weiterhin, nur nicht offline. */
      });
    });
  }

  /* Welcher Stand gerade läuft – beim Deploy in die Kopfzeile gestempelt.
   * Steht der Platzhalter noch drin, läuft die App aus dem Quellverzeichnis. */
  function showBuild() {
    var meta = document.querySelector('meta[name="build"]');
    var value = meta ? meta.content : '';
    document.getElementById('build-value').textContent =
      !value || value.indexOf('BUILD') >= 0 ? 'lokal' : value;
  }

  function start() {
    window.Calibration.init();
    window.ScaleCheck.init();
    window.Edge.init();
    window.Ruler.init();
    window.Gauge.init();
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
      /* Ist eine Kante vermessen, kommt ihr Nullpunkt dazu. */
      showZeroPoint();
      window.Ruler.refresh();
    });

    /* Erst der Grund, dann die Ansicht: sonst zeichnet die wiederhergestellte
     * Ansicht kurz in den falschen Farben. */
    setupTheme();
    setupRotationLock();
    setupTabs();
    setupToolbar();
    showBuild();
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
