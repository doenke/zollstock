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

  /* Der Schieber läuft immer von 1 bis 8, unabhängig davon, ob die Kamera
   * selbst zoomen kann. Sonst stünde auf zwei Geräten dieselbe Zahl für
   * verschiedene Vergrößerungen. */
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 8;
  var zoom = 1;

  /* Kann die Kamera selbst zoomen, liegen hier ihre Grenzen. Das ist dem
   * Vergrößern im Nachhinein vorzuziehen: Es bleibt scharf. */
  var native = null;
  /* Mit welchem Zoom das Standbild aufgenommen wurde – und ob die Kamera
   * dabei selbst gezoomt hat. Davon hängt ab, ob die Vergrößerung schon im
   * festgehaltenen Rahmen steckt oder erst beim Anzeigen entsteht. */
  var frozenAt = 1;
  var frozenNative = false;

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
    /* Ohne Bild gibt es nichts aufzuziehen – dann soll der Hinweis auch
     * keinen Schieber versprechen, der gar nicht dasteht. */
    els.hint.hidden = !live;
    els.freeze.classList.toggle('is-on', frozen);
    els.freeze.setAttribute('aria-pressed', frozen ? 'true' : 'false');
    els.freeze.textContent = frozen ? 'Weiter' : 'Standbild';

    /* Das Licht gibt nicht jeder Browser her – dann steht der Knopf auch
     * nicht da und verspricht nichts. */
    els.torch.hidden = !(live && capability('torch'));
    els.torch.classList.toggle('is-on', torchOn);
    els.torch.setAttribute('aria-pressed', torchOn ? 'true' : 'false');
  }

  function hideHint() {
    els.hint.classList.add('is-hidden');
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

  function readNativeZoom() {
    var range = capability('zoom');

    native = range && isFinite(range.min) && isFinite(range.max) && range.max > range.min
      ? { min: range.min, max: range.max }
      : null;
  }

  /* Im Standbild einer selbst zoomenden Kamera ist der Zoom von damals die
   * Untergrenze: Was nicht im Rahmen steht, holt kein Schieber zurück. */
  function floor() {
    return frozen && frozenNative ? frozenAt : MIN_ZOOM;
  }

  function setZoom(value) {
    zoom = Math.max(floor(), Math.min(MAX_ZOOM, value));
    applyZoom();
  }

  function applyZoom() {
    var factor = 1;

    if (frozen) {
      /* Hat die Kamera selbst gezoomt, steckt die Vergrößerung bereits im
       * festgehaltenen Rahmen – darüber hinaus geht es nur noch rechnerisch.
       * Sonst war sie von Anfang an rechnerisch und gilt für das Standbild
       * genauso wie vorher für das laufende Bild. Ohne diese Unterscheidung
       * spränge das Bild beim Einfrieren auf 1× zurück. */
      factor = frozenNative ? zoom / frozenAt : zoom;
    } else if (native) {
      var want = native.min + (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM) * (native.max - native.min);
      try {
        track.applyConstraints({ advanced: [{ zoom: want }] });
      } catch (err) {
        /* Dann bleibt es beim Bild, wie die Kamera es liefert. */
      }
    } else {
      factor = zoom;
    }

    shown().style.transform = 'scale(' + factor + ')';
    els.range.min = floor();
    els.range.value = zoom;
    els.out.textContent = fmt(zoom);
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

    frozen = true;
    frozenAt = zoom;
    frozenNative = !!native;
    els.video.hidden = true;
    els.still.hidden = false;

    hideHint();
    showTools();
    applyZoom();
  }

  function thaw() {
    frozen = false;
    frozenAt = 1;
    frozenNative = false;
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
        height: { ideal: 1080 }
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
      applyZoom();
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
      setZoom(1);
    }
  }

  /* Für die Prüfstrecke: läuft gerade ein Datenstrom? */
  function running() {
    return !!stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; });
  }

  return {
    init: init,
    setActive: setActive,
    running: running
  };
})();
