/* Lupe: das Kamerabild vergrößert, mit Standbild und Licht.
 *
 * Gedacht für das, was die anderen Werkzeuge nicht können – die eingeprägte
 * Zahl auf einem Bohrer lesen, die Schlüsselweite auf einer Mutter, das
 * Typenschild in der dunklen Ecke.
 *
 * Die Kamera läuft ausschließlich, solange diese Ansicht offen und die App
 * im Bild ist; beim Wegschalten wird der Datenstrom sofort beendet. Das Bild
 * bleibt im Gerät: Es wird nicht gespeichert und nirgendwohin geschickt. */
window.Loupe = (function () {
  'use strict';

  var els = {};

  var stream = null;
  var track = null;
  var active = false;    /* Ansicht offen? */
  var starting = false;  /* getUserMedia unterwegs */
  var frozen = false;
  var torchOn = false;
  var hintDone = false;  /* der Hinweis hat seinen Dienst getan */

  /* Die Zahl am Schieber ist die Vergrößerung, die man sieht – auf jedem
   * Gerät dieselbe. Den Teil, den die Kamera selbst schafft, übernimmt sie;
   * nur was darüber hinausgeht, wird gerechnet. */
  var STORE_KEY = 'zollstock.loupe.v1';
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 8;      /* gerechnet geht es nicht sinnvoll weiter */
  var LIMIT = 10;        /* auch wenn die Kamera selbst mehr verspricht */
  /* Mit 1× ist eine Lupe keine. Beim ersten Mal 3×, danach der Wert vom
   * letzten Mal. */
  var START_ZOOM = 3;
  var zoom = load();

  /* Kann die Kamera selbst zoomen, liegen hier ihre Grenzen. Das ist dem
   * Vergrößern im Nachhinein vorzuziehen: Es bleibt schärfer. */
  var native = null;
  /* Wie viel Vergrößerung schon im festgehaltenen Rahmen steckt – den Teil,
   * den die Kamera beim Einfrieren selbst gezoomt hatte. Der Rest entsteht
   * erst beim Anzeigen. */
  var baked = 1;

  /* ---------- Anzeige ---------- */

  function fmt(value) {
    return value.toFixed(1).replace('.', ',') + '×';
  }

  /* Was gerade zu sehen ist: das laufende Bild oder das eingefrorene. */
  function shown() {
    return frozen ? els.still : els.video;
  }

  function showGate(text, action) {
    if (!text) {
      els.gate.hidden = true;
      return;
    }

    els.gateText.textContent = text;
    els.gateButton.hidden = !action;
    if (action) els.gateButton.textContent = action;
    els.gate.hidden = false;
  }

  function showTools() {
    var live = !!stream;

    els.tools.hidden = !live;
    /* Der Hinweis steht im Werkzeugkasten: Ohne Bild verschwindet er mit
     * ihm und verspricht keinen Schieber, der gar nicht dasteht. */
    els.hint.hidden = hintDone;
    els.freeze.classList.toggle('is-on', frozen);
    els.freeze.setAttribute('aria-pressed', frozen ? 'true' : 'false');
    els.freeze.textContent = frozen ? 'Weiter' : 'Standbild';

    /* Das Licht gibt nicht jeder Browser her – dann steht der Knopf auch
     * nicht da und verspricht nichts. */
    els.torch.hidden = !(live && capability('torch'));
    els.torch.classList.toggle('is-on', torchOn);
    els.torch.setAttribute('aria-pressed', torchOn ? 'true' : 'false');
  }

  function short(value) {
    return (Math.round(value * 10) / 10).toString().replace('.', ',') + '×';
  }

  /* Was die Kamera über sich meldet. Ob ein Zoom optisch ist, sagt kein
   * Browser – nur, ob die Kamera überhaupt selbst zoomt und wie weit. Das
   * ist schon die Hälfte: Bis dorthin bleibt das Bild schärfer als
   * gerechnet. */
  function showInfo() {
    if (!stream) {
      els.info.hidden = true;
      return;
    }

    els.infoText.textContent = native
      ? 'Die Kamera zoomt selbst bis ' + short(native.max) +
        (native.max < maxZoom() ? ', darüber wird gerechnet' : '')
      : 'Die Kamera zoomt nicht selbst – die Vergrößerung wird gerechnet';
    els.info.hidden = false;
  }

  function hideHint() {
    hintDone = true;
    els.hint.hidden = true;
  }

  /* ---------- Vergrößerung ---------- */

  function capability(name) {
    if (!track || !track.getCapabilities) return null;

    try {
      var caps = track.getCapabilities();
      return caps && caps[name] !== undefined ? caps[name] : null;
    } catch (err) {
      /* Manche Browser kennen die Methode, werfen aber darauf. */
      return null;
    }
  }

  function load() {
    try {
      var value = parseFloat(localStorage.getItem(STORE_KEY));
      return isFinite(value) && value >= MIN_ZOOM && value <= LIMIT ? value : START_ZOOM;
    } catch (err) {
      return START_ZOOM;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, String(zoom));
    } catch (err) {
      /* Privater Modus – dann beginnt es beim nächsten Mal wieder bei 3×. */
    }
  }

  function readNativeZoom() {
    var range = capability('zoom');

    native = range && isFinite(range.min) && isFinite(range.max) && range.max > 1
      ? { min: range.min, max: range.max }
      : null;
  }

  /* Was die Kamera selbst übernimmt: so viel wie gewünscht, höchstens so
   * viel, wie sie kann. */
  function nativePart() {
    return native ? Math.max(native.min, Math.min(native.max, zoom)) : 1;
  }

  function maxZoom() {
    return native ? Math.max(MAX_ZOOM, Math.min(LIMIT, native.max)) : MAX_ZOOM;
  }

  /* Im Standbild ist der Zoom, den die Kamera beim Einfrieren selbst hatte,
   * die Untergrenze: Was nicht im Rahmen steht, holt kein Schieber zurück. */
  function floor() {
    return frozen ? baked : MIN_ZOOM;
  }

  function setZoom(value) {
    zoom = Math.max(floor(), Math.min(maxZoom(), value));
    applyZoom();
  }

  function applyZoom() {
    var factor;

    if (frozen) {
      /* Was die Kamera beim Einfrieren selbst gezoomt hatte, steckt schon im
       * Rahmen; nur der Rest wird draufgerechnet. Ohne diese Unterscheidung
       * spränge das Bild beim Einfrieren auf 1× zurück. */
      factor = zoom / baked;
    } else {
      var part = nativePart();
      factor = zoom / part;

      if (native) {
        track.applyConstraints({ advanced: [{ zoom: part }] }).catch(function () {
          /* Dann bleibt es beim Bild, wie die Kamera es liefert. */
        });
      }
    }

    shown().style.transform = 'scale(' + factor + ')';
    els.range.min = floor();
    els.range.max = maxZoom();
    els.range.value = zoom;
    els.out.textContent = fmt(zoom);
    persist();
  }

  /* ---------- Standbild ---------- */

  /* Das eigentliche Kunststück der Lupe: in die ungünstige Ecke halten,
   * einfrieren, das Gerät zurückholen und in Ruhe ablesen. */
  function freeze() {
    var w = els.video.videoWidth;
    var h = els.video.videoHeight;

    if (!stream || frozen || !w || !h) return;

    els.still.width = w;
    els.still.height = h;
    els.still.getContext('2d').drawImage(els.video, 0, 0, w, h);

    baked = nativePart();
    frozen = true;
    els.video.hidden = true;
    els.still.hidden = false;

    hideHint();
    showTools();
    applyZoom();
  }

  function thaw() {
    frozen = false;
    baked = 1;
    els.still.hidden = true;
    els.still.style.transform = 'scale(1)';
    els.video.hidden = false;

    showTools();
    applyZoom();
  }

  /* ---------- Licht ---------- */

  function setTorch(on) {
    if (!track || !capability('torch')) return;

    track.applyConstraints({ advanced: [{ torch: on }] }).then(function () {
      torchOn = on;
      showTools();
    }).catch(function () {
      torchOn = false;
      showTools();
    });
  }

  /* ---------- Kamera ---------- */

  function message(err) {
    var name = err && err.name;

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Zugriff auf die Kamera abgelehnt. In den Einstellungen des Browsers lässt er sich wieder erlauben.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'Keine Kamera gefunden.';
    }
    if (name === 'NotReadableError') {
      return 'Die Kamera ließ sich nicht öffnen – vielleicht benutzt sie gerade eine andere App.';
    }
    return 'Die Kamera ließ sich nicht starten.';
  }

  function start() {
    if (stream || starting) return;

    /* Ohne sichere Verbindung gibt kein Browser die Kamera heraus. */
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showGate('Dieser Browser gibt keine Kamera her. Über eine unverschlüsselte Verbindung (http) ist sie gesperrt.', null);
      return;
    }

    starting = true;

    navigator.mediaDevices.getUserMedia({
      /* ideal statt exact: Ein Gerät mit nur einer Kamera nach vorn soll
       * nicht leer ausgehen. */
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        /* Chrome rückt die Zoomfähigkeit der Kamera nur heraus, wenn danach
         * gefragt wird. Kann sie es nicht, kommt das Bild trotzdem. */
        zoom: true
      },
      audio: false
    }).then(function (opened) {
      starting = false;

      /* In der Zwischenzeit kann längst weitergeschaltet worden sein. Dann
       * wird der eben geöffnete Strom sofort wieder geschlossen, statt im
       * Hintergrund weiterzulaufen. */
      if (!active || document.visibilityState !== 'visible') {
        opened.getTracks().forEach(function (t) { t.stop(); });
        return;
      }

      stream = opened;
      track = opened.getVideoTracks()[0] || null;
      els.video.srcObject = opened;
      els.video.play().catch(function () {
        /* Autoplay verweigert – das Bild steht dann beim ersten Tippen. */
      });

      readNativeZoom();
      showGate(null);
      showTools();
      showInfo();
      /* setZoom statt applyZoom: Der gemerkte Wert kann über dem liegen, was
       * dieses Gerät hergibt. */
      setZoom(zoom);
    }).catch(function (err) {
      starting = false;
      showGate(message(err), 'Kamera freigeben');
      showTools();
    });
  }

  function stop() {
    if (stream) {
      if (torchOn) setTorch(false);
      stream.getTracks().forEach(function (t) { t.stop(); });
    }

    stream = null;
    track = null;
    native = null;
    torchOn = false;
    els.video.srcObject = null;
    showInfo();

    thaw();
  }

  /* ---------- Bedienung ---------- */

  /* Aufziehen mit zwei Fingern. Der Abstand beim Aufsetzen gilt als
   * Ausgangsmaß; was danach dazukommt, geht als Faktor auf den Zoom. */
  function bindPinch() {
    var points = [];
    var base = 0;
    var baseZoom = 1;

    function spread() {
      var dx = points[0].x - points[1].x;
      var dy = points[0].y - points[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function index(id) {
      for (var i = 0; i < points.length; i++) {
        if (points[i].id === id) return i;
      }
      return -1;
    }

    els.stage.addEventListener('pointerdown', function (event) {
      if (index(event.pointerId) >= 0 || points.length >= 2) return;
      points.push({ id: event.pointerId, x: event.clientX, y: event.clientY });

      if (points.length === 2) {
        base = spread();
        baseZoom = zoom;
      }
    });

    els.stage.addEventListener('pointermove', function (event) {
      var i = index(event.pointerId);
      if (i < 0) return;

      points[i].x = event.clientX;
      points[i].y = event.clientY;

      if (points.length === 2 && base > 0) {
        setZoom(baseZoom * spread() / base);
        hideHint();
      }
    });

    ['pointerup', 'pointercancel'].forEach(function (type) {
      els.stage.addEventListener(type, function (event) {
        var i = index(event.pointerId);
        if (i >= 0) points.splice(i, 1);
        base = 0;
      });
    });
  }

  function bind() {
    els.range.addEventListener('input', function () {
      setZoom(parseFloat(els.range.value));
      hideHint();
    });

    els.freeze.addEventListener('click', function () {
      if (frozen) thaw();
      else freeze();
    });

    els.torch.addEventListener('click', function () {
      setTorch(!torchOn);
    });

    els.gateButton.addEventListener('click', function () {
      showGate(null);
      start();
    });

    bindPinch();

    /* Weggelegt heißt aus. Niemand soll die Kamera laufen lassen, während
     * er längst etwas anderes tut. */
    document.addEventListener('visibilitychange', function () {
      if (!active) return;
      if (document.visibilityState === 'visible') start();
      else stop();
    });
  }

  /* ---------- Öffentlich ---------- */

  function init() {
    els.view = document.getElementById('view-loupe');
    els.stage = document.getElementById('loupe-stage');
    els.video = document.getElementById('loupe-video');
    els.still = document.getElementById('loupe-still');
    els.hint = document.getElementById('loupe-hint');
    els.tools = document.getElementById('loupe-tools');
    els.range = document.getElementById('loupe-zoom');
    els.out = document.getElementById('loupe-zoom-out');
    els.info = document.getElementById('loupe-info');
    els.infoText = document.getElementById('loupe-info-text');
    els.freeze = document.getElementById('btn-freeze');
    els.torch = document.getElementById('btn-torch');
    els.gate = document.getElementById('loupe-gate');
    els.gateText = document.getElementById('loupe-gate-text');
    els.gateButton = document.getElementById('btn-camera');

    bind();
    showTools();
  }

  function setActive(on) {
    if (active === on) return;
    active = on;

    if (on) {
      start();
    } else {
      stop();
      showGate(null);
    }
  }

  /* Für die Prüfstrecke: läuft gerade ein Datenstrom? */
  function running() {
    return !!stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; });
  }

  /* Für die Prüfstrecke: wie sich die Vergrößerung gerade aufteilt. */
  function split() {
    return { zoom: zoom, kamera: frozen ? baked : nativePart(), max: maxZoom() };
  }

  return {
    init: init,
    setActive: setActive,
    running: running,
    split: split
  };
})();
