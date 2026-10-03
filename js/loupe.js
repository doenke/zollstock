/* Lupe: das Kamerabild vergrößert, mit Standbild, Licht und Objektivwahl.
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
  var active = false;     /* Ansicht offen? */
  var starting = false;   /* getUserMedia unterwegs */
  var switching = false;  /* zwischen zwei Objektiven */
  var frozen = false;
  var torchOn = false;
  var lightBefore = false;  /* brannte das Licht vor dem Einfrieren? */

  /* Eingeprägte Zahlen haben kaum Farbe und kaum Kontrast – sie bestehen nur
   * aus Licht und Schatten an winzigen Kanten. Kontrast macht das Bild grau
   * und steiler, im laufenden Bild wie im Standbild; das rechnet die
   * Grafikkarte, es kostet nichts. Relief gibt es nur im Standbild: Es
   * betont Kanten in einer Richtung, sodass Prägungen plastisch hervortreten.
   * Beides nur für die Anzeige, im Gerät. */
  var CONTRAST = 'grayscale(1) contrast(1.9) brightness(1.05)';
  var contrastOn = false;
  var reliefOn = false;
  var stillData = null;     /* das Standbild ohne Relief, zum Zurückschalten */
  var hintDone = false;   /* der Hinweis hat seinen Dienst getan */
  var noticeTimer = null;

  /* Die Zahl am Schieber ist die Vergrößerung, die man sieht – auf jedem
   * Gerät dieselbe. Den Teil, den die Kamera selbst schafft, übernimmt sie;
   * nur was darüber hinausgeht, wird gerechnet. */
  var STORE_KEY = 'zollstock.loupe.v2';
  var OLD_KEY = 'zollstock.loupe.v1';
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 8;      /* gerechnet geht es live nicht sinnvoll weiter */
  var LIMIT = 10;        /* auch wenn die Kamera selbst mehr verspricht */
  /* Mit 1× ist eine Lupe keine. Beim ersten Mal 3×, danach der Wert vom
   * letzten Mal – je Objektiv, denn 3× am Tele ist etwas anderes als 3× an
   * der Hauptkamera. */
  var START_ZOOM = 3;
  /* Ins Standbild geht es bis zum Vierfachen dessen, was beim Einfrieren zu
   * sehen war. Neue Einzelheiten kommen dabei nicht mehr dazu, aber Kleines
   * wird groß genug zum Lesen. */
  var STILL_EXTRA = 4;
  var STILL_LIMIT = 32;

  var store = load();
  var zoom = store.first;

  /* Kann die Kamera selbst zoomen, liegen hier ihre Grenzen. Das ist dem
   * Vergrößern im Nachhinein vorzuziehen: Es bleibt schärfer. */
  var native = null;

  /* Standbild: wie viel Vergrößerung schon im festgehaltenen Rahmen steckt
   * (der Teil, den die Kamera selbst gezoomt hatte), welcher Zoom live
   * eingestellt war und wohin das Bild verschoben ist. */
  var baked = 1;
  var liveZoom = 1;
  var pan = { x: 0, y: 0 };

  /* Die Objektive auf der Rückseite, soweit der Browser sie zeigt. */
  var lenses = [];
  var lensId = null;

  /* ---------- Speicher ---------- */

  function validZoom(value) {
    return typeof value === 'number' && isFinite(value) && value >= MIN_ZOOM && value <= LIMIT;
  }

  function load() {
    var fresh = { lens: null, zooms: {}, first: START_ZOOM };

    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (parsed && typeof parsed === 'object') {
        var zooms = {};
        Object.keys(parsed.zooms || {}).forEach(function (id) {
          if (validZoom(parsed.zooms[id])) zooms[id] = parsed.zooms[id];
        });
        return {
          lens: typeof parsed.lens === 'string' ? parsed.lens : null,
          zooms: zooms,
          first: START_ZOOM
        };
      }

      /* Bis zur Objektivwahl stand hier nur eine Zahl. Sie gilt weiter für
       * das Objektiv, das zuerst aufgeht. */
      var old = parseFloat(localStorage.getItem(OLD_KEY));
      if (validZoom(old)) fresh.first = old;
    } catch (err) {
      /* Privater Modus oder Unlesbares – dann eben von vorn. */
    }

    return fresh;
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ lens: store.lens, zooms: store.zooms }));
      localStorage.removeItem(OLD_KEY);
    } catch (err) {
      /* Privater Modus – dann beginnt es beim nächsten Mal wieder bei 3×. */
    }
  }

  function zoomFor(id) {
    return id && validZoom(store.zooms[id]) ? store.zooms[id] : store.first;
  }

  /* ---------- Anzeige ---------- */

  function fmt(value) {
    return value.toFixed(1).replace('.', ',') + '×';
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
    /* Beim Wechsel des Objektivs ist kurz kein Strom da – die Werkzeuge
     * bleiben trotzdem stehen, sonst springt die ganze Leiste. */
    var live = !!stream || switching;

    els.tools.hidden = !live;
    /* Der Hinweis steht im Werkzeugkasten: Ohne Bild verschwindet er mit
     * ihm und verspricht keinen Schieber, der gar nicht dasteht. */
    els.hint.hidden = hintDone;
    els.freeze.classList.toggle('is-on', frozen);
    els.freeze.setAttribute('aria-pressed', frozen ? 'true' : 'false');
    els.freeze.textContent = frozen ? 'Weiter' : 'Standbild';

    /* Das Licht steht da, solange das Bild läuft – im Standbild leuchtet es
     * nichts mehr aus. Meldet die Kamera keine Lampe, ist der Knopf
     * blasser; versucht wird es trotzdem, und wenn nichts angeht, steht da,
     * warum. Manche Kameras melden sie erst gar nicht. */
    els.torch.hidden = !live || frozen;
    els.torch.classList.toggle('is-on', torchOn);
    els.torch.classList.toggle('is-unsure', !capability('torch'));
    els.torch.setAttribute('aria-pressed', torchOn ? 'true' : 'false');

    els.contrast.classList.toggle('is-on', contrastOn);
    els.contrast.setAttribute('aria-pressed', contrastOn ? 'true' : 'false');
    els.relief.hidden = !frozen;
    els.relief.classList.toggle('is-on', reliefOn);
    els.relief.setAttribute('aria-pressed', reliefOn ? 'true' : 'false');

    showLenses();
  }

  /* Die Zeile über dem Schieber steht nur im Standbild – dort ist nicht
   * selbstverständlich, dass sich das Bild mit einem Finger verschieben
   * lässt. Im laufenden Bild bleibt sie Meldungen vorbehalten. */
  function showInfo() {
    if (noticeTimer) return;  /* eine Meldung steht gerade */

    if (!frozen || (!stream && !switching)) {
      els.info.hidden = true;
      return;
    }

    els.infoText.textContent = 'Standbild – mit zwei Fingern vergrößern, mit einem verschieben';
    els.info.hidden = false;
  }

  /* Eine Meldung für ein paar Sekunden in der Zeile über dem Schieber. */
  function notice(text) {
    clearTimeout(noticeTimer);
    els.infoText.textContent = text;
    els.info.hidden = false;
    noticeTimer = setTimeout(function () {
      noticeTimer = null;
      showInfo();
    }, 4000);
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

  function liveMax() {
    return native ? Math.max(MAX_ZOOM, Math.min(LIMIT, native.max)) : MAX_ZOOM;
  }

  function maxZoom() {
    return frozen ? Math.min(STILL_LIMIT, Math.max(liveMax(), liveZoom * STILL_EXTRA)) : liveMax();
  }

  /* Im Standbild ist der Zoom, den die Kamera beim Einfrieren selbst hatte,
   * die Untergrenze: Was nicht im Rahmen steht, holt kein Schieber zurück. */
  function floor() {
    return frozen ? baked : MIN_ZOOM;
  }

  function clampZoom(value) {
    return Math.max(floor(), Math.min(maxZoom(), value));
  }

  /* Das Standbild darf nur so weit verschoben werden, dass es den Rahmen
   * noch füllt. */
  function clampPan(scale) {
    var maxX = Math.max(0, (scale - 1) * els.stage.clientWidth / 2);
    var maxY = Math.max(0, (scale - 1) * els.stage.clientHeight / 2);

    pan.x = Math.max(-maxX, Math.min(maxX, pan.x));
    pan.y = Math.max(-maxY, Math.min(maxY, pan.y));
  }

  /* Vom Schieber: im Standbild um die Bildmitte herum, damit das, was gerade
   * in der Mitte steht, dort auch bleibt. */
  function setZoom(value) {
    var before = zoom;
    zoom = clampZoom(value);

    if (frozen && before > 0) {
      pan.x *= zoom / before;
      pan.y *= zoom / before;
    }

    applyZoom();
  }

  function applyZoom() {
    if (frozen) {
      /* Was die Kamera beim Einfrieren selbst gezoomt hatte, steckt schon im
       * Rahmen; nur der Rest wird draufgerechnet. Ohne diese Unterscheidung
       * spränge das Bild beim Einfrieren auf 1× zurück. */
      var scale = zoom / baked;
      clampPan(scale);
      els.still.style.transform =
        'translate(' + round(pan.x) + 'px, ' + round(pan.y) + 'px) scale(' + round(scale) + ')';
    } else {
      var part = nativePart();

      if (native && track) {
        track.applyConstraints({ advanced: [{ zoom: part }] }).catch(function () {
          /* Dann bleibt es beim Bild, wie die Kamera es liefert. */
        });
      }

      els.video.style.transform = 'scale(' + round(zoom / part) + ')';

      /* Gemerkt wird nur der Zoom des laufenden Bildes, je Objektiv. Ins
       * Standbild hineinzuzoomen ist ein Blick, keine Einstellung. */
      if (lensId) {
        store.zooms[lensId] = zoom;
        persist();
      }
    }

    els.range.min = floor();
    els.range.max = maxZoom();
    els.range.value = zoom;
    els.out.textContent = fmt(zoom);
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  /* ---------- Kontrast und Relief ---------- */

  function setContrast(on) {
    contrastOn = on;
    els.video.style.filter = on ? CONTRAST : '';
    els.still.style.filter = on ? CONTRAST : '';
    showTools();
  }

  /* Relief: Helligkeit plus Gefälle schräg von links oben nach rechts unten,
   * der klassische Prägestempel-Filter
   *
   *   -2 -1  0
   *   -1  1  1
   *    0  1  2
   *
   * Die Summe ist 1, das Bild bleibt also erkennbar; Kanten bekommen eine
   * helle und eine dunkle Seite. Danach wird gestreckt: Was zwischen dem
   * hellsten und dunkelsten Hundertstel liegt, füllt den ganzen Bereich. */
  function relief(src, w, h) {
    var s = src.data;
    var n = w * h;
    var lum = new Float32Array(n);
    var val = new Float32Array(n);
    var i, x, y, p;

    for (i = 0, p = 0; i < n; i++, p += 4) {
      lum[i] = 0.299 * s[p] + 0.587 * s[p + 1] + 0.114 * s[p + 2];
    }

    /* Erst leicht weichzeichnen (3 × 3, waagerecht und senkrecht getrennt):
     * Der Filter verstärkt jede Kante, auch das Korn des Sensors und die
     * Riefen im Metall. Eine Prägung ist breiter als ein Bildpunkt und
     * übersteht das, das Korn nicht. */
    for (y = 0; y < h; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        val[i] = (lum[i - 1] + lum[i] + lum[i + 1]) / 3;
      }
    }
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        lum[i] = (val[i - w] + val[i] + val[i + w]) / 3;
      }
    }

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          val[i] = lum[i];
          continue;
        }
        val[i] = lum[i] +
          2 * (lum[i + w + 1] - lum[i - w - 1]) +
          (lum[i + w] - lum[i - w]) +
          (lum[i + 1] - lum[i - 1]);
      }
    }

    /* Streckung über ein Histogramm – Werte von −1275 bis 1530 sind möglich,
     * gezählt wird in ganzen Stufen. */
    var OFF = 1275;
    var hist = new Uint32Array(OFF + 1531);
    for (i = 0; i < n; i++) hist[Math.max(0, Math.min(hist.length - 1, Math.round(val[i]) + OFF))]++;

    var cut = n * 0.01;
    var lo = 0, hi = hist.length - 1, sum = 0;
    for (sum = 0; lo < hist.length && sum + hist[lo] <= cut; lo++) sum += hist[lo];
    for (sum = 0; hi > 0 && sum + hist[hi] <= cut; hi--) sum += hist[hi];
    lo -= OFF;
    hi -= OFF;
    var span = Math.max(1, hi - lo);

    var out = new ImageData(w, h);
    var o = out.data;
    for (i = 0, p = 0; i < n; i++, p += 4) {
      var v = (val[i] - lo) / span * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      o[p] = o[p + 1] = o[p + 2] = v;
      o[p + 3] = 255;
    }
    return out;
  }

  function setRelief(on) {
    if (!frozen) return;

    var ctx = els.still.getContext('2d');
    var w = els.still.width;
    var h = els.still.height;

    /* Das Original wird erst beim ersten Einschalten aufgehoben – wer nie
     * Relief will, zahlt auch nicht dafür. */
    if (!stillData) stillData = ctx.getImageData(0, 0, w, h);

    ctx.putImageData(on ? relief(stillData, w, h) : stillData, 0, 0);
    reliefOn = on;
    showTools();
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

    /* Das Bild ist mit Licht festgehalten; ab hier braucht es keins mehr. */
    lightBefore = torchOn;
    if (torchOn) {
      setTorch(false);
      torchOn = false;
    }

    baked = nativePart();
    liveZoom = zoom;
    pan.x = 0;
    pan.y = 0;
    frozen = true;
    els.video.hidden = true;
    els.still.hidden = false;

    hideHint();
    showTools();
    showInfo();
    applyZoom();
  }

  /* Zurück zum laufenden Bild – mit dem Zoom, der vor dem Einfrieren
   * eingestellt war, und auf Wunsch mit dem Licht von vorher. Beim
   * Schließen der Kamera bleibt es aus. */
  function thaw(relight) {
    if (!frozen) return;

    var light = relight && lightBefore;
    lightBefore = false;

    frozen = false;
    baked = 1;
    pan.x = 0;
    pan.y = 0;
    zoom = liveZoom;
    reliefOn = false;
    stillData = null;
    els.still.hidden = true;
    els.still.style.transform = '';
    els.video.hidden = false;

    showTools();
    showInfo();
    setZoom(zoom);
    if (light) setTorch(true);
  }

  /* ---------- Licht ---------- */

  function torchFailed() {
    torchOn = false;
    showTools();
    notice(lenses.length > 1
      ? 'Dieses Objektiv gibt seine Lampe nicht frei – mit einem anderen versuchen'
      : 'Die Kamera gibt ihre Lampe nicht frei');
  }

  function setTorch(on) {
    if (!track) return;

    var current = track;
    var reported = !!capability('torch');

    current.applyConstraints({ advanced: [{ torch: on }] }).then(function () {
      if (current !== track) return;

      /* Einen Wunsch, den die Kamera nicht erfüllen kann, übergehen manche
       * Browser stillschweigend. Meldet die Kamera keine Lampe, wird deshalb
       * nachgesehen, ob sie wirklich brennt. */
      var settings = current.getSettings ? current.getSettings() : {};
      if (on && !reported && settings.torch !== true) {
        torchFailed();
        return;
      }

      torchOn = on;
      showTools();
    }).catch(function () {
      if (current === track && on) torchFailed();
    });
  }

  /* ---------- Objektive ---------- */

  var BACK = /back|rear|rück|environment/i;
  var FRONT = /front|user|vorder|facetime|selfie/i;

  /* Ein kurzer Name aus der Bezeichnung des Browsers. iOS nennt seine
   * Objektive beim Namen, Android nur „camera2 2, facing back“ – dann
   * bleibt es bei einer Nummer. */
  function nameOf(label, index) {
    if (/tele/i.test(label)) return 'Tele';
    if (/ultra/i.test(label)) return 'Weit';
    if (/dual|triple/i.test(label)) return 'Auto';
    return String(index + 1);
  }

  function listLenses() {
    if (!navigator.mediaDevices.enumerateDevices) return;

    navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var video = devices.filter(function (d) { return d.kind === 'videoinput' && d.deviceId; });
      var back = video.filter(function (d) { return BACK.test(d.label); });
      /* Steht nirgends, wohin eine Kamera schaut (am Rechner etwa), gilt
       * jede, die nicht ausdrücklich nach vorn zeigt. */
      var candidates = back.length ? back : video.filter(function (d) { return !FRONT.test(d.label); });

      lenses = candidates.map(function (d, i) {
        return { id: d.deviceId, label: d.label, name: nameOf(d.label, i) };
      });
      showLenses();
    }).catch(function () {
      lenses = [];
      showLenses();
    });
  }

  function showLenses() {
    var box = els.lenses;

    /* Mit nur einem Objektiv gibt es nichts zu wählen. */
    if (lenses.length < 2 || els.tools.hidden) {
      box.hidden = true;
      return;
    }

    var wanted = lenses.map(function (l) { return l.id; }).join('|');
    if (box.dataset.ids !== wanted) {
      box.dataset.ids = wanted;
      box.querySelectorAll('.seg__btn').forEach(function (b) { b.remove(); });

      lenses.forEach(function (lens) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg__btn';
        b.dataset.lens = lens.id;
        b.textContent = lens.name;
        b.title = lens.label;
        b.addEventListener('click', function () { chooseLens(lens.id); });
        box.appendChild(b);
      });
    }

    box.querySelectorAll('.seg__btn').forEach(function (b) {
      var on = b.dataset.lens === lensId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = frozen;
    });
    box.hidden = false;
  }

  function chooseLens(id) {
    if (id === lensId || starting || frozen) return;

    store.lens = id;
    persist();

    /* Viele Telefone öffnen nicht zwei Kameras zugleich – erst zu, dann auf. */
    switching = true;
    closeStream();
    start();
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

  function constraints() {
    var video = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      /* Chrome rückt die Zoomfähigkeit der Kamera nur heraus, wenn danach
       * gefragt wird. Kann sie es nicht, kommt das Bild trotzdem. */
      zoom: true
    };

    if (store.lens) {
      video.deviceId = { exact: store.lens };
    } else {
      /* ideal statt exact: Ein Gerät mit nur einer Kamera nach vorn soll
       * nicht leer ausgehen. */
      video.facingMode = { ideal: 'environment' };
    }

    return { video: video, audio: false };
  }

  function start() {
    if (stream || starting) return;

    /* Ohne sichere Verbindung gibt kein Browser die Kamera heraus. */
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showGate('Dieser Browser gibt keine Kamera her. Über eine unverschlüsselte Verbindung (http) ist sie gesperrt.', null);
      return;
    }

    starting = true;

    navigator.mediaDevices.getUserMedia(constraints()).then(function (opened) {
      starting = false;

      /* In der Zwischenzeit kann längst weitergeschaltet worden sein. Dann
       * wird der eben geöffnete Strom sofort wieder geschlossen, statt im
       * Hintergrund weiterzulaufen. */
      if (!active || document.visibilityState !== 'visible') {
        opened.getTracks().forEach(function (t) { t.stop(); });
        switching = false;
        return;
      }

      stream = opened;
      track = opened.getVideoTracks()[0] || null;
      switching = false;
      els.video.srcObject = opened;
      els.video.play().catch(function () {
        /* Autoplay verweigert – das Bild steht dann beim ersten Tippen. */
      });

      var settings = track && track.getSettings ? track.getSettings() : {};
      lensId = settings.deviceId || null;
      zoom = zoomFor(lensId);

      readNativeZoom();
      showGate(null);
      showTools();
      showInfo();
      /* setZoom statt applyZoom: Der gemerkte Wert kann über dem liegen, was
       * dieses Gerät hergibt. */
      setZoom(zoom);
      /* Die Bezeichnungen der Kameras gibt der Browser erst nach der
       * Freigabe heraus – deshalb wird erst jetzt nachgesehen. */
      listLenses();
    }).catch(function (err) {
      starting = false;

      /* Das gemerkte Objektiv gibt es nicht mehr (anderes Gerät, Browser
       * zurückgesetzt): vergessen und die übliche Kamera nehmen. */
      if (store.lens && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        store.lens = null;
        persist();
        start();
        return;
      }

      switching = false;
      showGate(message(err), 'Kamera freigeben');
      showTools();
      showInfo();
    });
  }

  /* Schließt den Datenstrom. Die Lampe geht mit dem Strom aus – das Licht
   * ist an die Kamera gebunden, nicht an die App. */
  function closeStream() {
    thaw(false);

    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
    }

    stream = null;
    track = null;
    native = null;
    torchOn = false;
    els.video.srcObject = null;
  }

  function stop() {
    switching = false;
    closeStream();
    showTools();
    showInfo();
  }

  /* ---------- Bedienung ---------- */

  /* Zwei Finger vergrößern, im Standbild um den Punkt zwischen den Fingern
   * herum – was dort liegt, bleibt unter ihnen. Ein Finger verschiebt das
   * Standbild. Im laufenden Bild verschiebt man das Telefon. */
  function bindGestures() {
    var points = [];
    var base = null;

    function index(id) {
      for (var i = 0; i < points.length; i++) {
        if (points[i].id === id) return i;
      }
      return -1;
    }

    function spread() {
      var dx = points[0].x - points[1].x;
      var dy = points[0].y - points[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    /* Mitte zwischen den Fingern, gemessen von der Bildmitte aus. */
    function middle() {
      var rect = els.stage.getBoundingClientRect();
      return {
        x: (points[0].x + points[1].x) / 2 - rect.left - rect.width / 2,
        y: (points[0].y + points[1].y) / 2 - rect.top - rect.height / 2
      };
    }

    function begin() {
      base = { spread: spread(), zoom: zoom, mid: middle(), pan: { x: pan.x, y: pan.y } };
    }

    els.stage.addEventListener('pointerdown', function (event) {
      if (index(event.pointerId) >= 0 || points.length >= 2) return;
      points.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      if (points.length === 2) begin();
    });

    els.stage.addEventListener('pointermove', function (event) {
      var i = index(event.pointerId);
      if (i < 0) return;

      var dx = event.clientX - points[i].x;
      var dy = event.clientY - points[i].y;
      points[i].x = event.clientX;
      points[i].y = event.clientY;

      if (points.length === 2 && base && base.spread > 0) {
        var target = base.zoom * spread() / base.spread;
        hideHint();

        if (!frozen) {
          setZoom(target);
          return;
        }

        /* Neuer Versatz so, dass der Bildpunkt, der beim Aufsetzen zwischen
         * den Fingern lag, jetzt wieder zwischen ihnen liegt. */
        zoom = clampZoom(target);
        var k = zoom / base.zoom;
        var m = middle();
        pan.x = m.x - (base.mid.x - base.pan.x) * k;
        pan.y = m.y - (base.mid.y - base.pan.y) * k;
        applyZoom();
        return;
      }

      if (points.length === 1 && frozen) {
        pan.x += dx;
        pan.y += dy;
        applyZoom();
      }
    });

    ['pointerup', 'pointercancel'].forEach(function (type) {
      els.stage.addEventListener(type, function (event) {
        var i = index(event.pointerId);
        if (i >= 0) points.splice(i, 1);
        base = null;
      });
    });
  }

  function bind() {
    els.range.addEventListener('input', function () {
      setZoom(parseFloat(els.range.value));
      hideHint();
    });

    els.freeze.addEventListener('click', function () {
      if (frozen) thaw(true);
      else freeze();
    });

    els.torch.addEventListener('click', function () {
      setTorch(!torchOn);
    });

    els.contrast.addEventListener('click', function () {
      setContrast(!contrastOn);
    });

    els.relief.addEventListener('click', function () {
      setRelief(!reliefOn);
    });

    els.gateButton.addEventListener('click', function () {
      showGate(null);
      start();
    });

    /* Manche Browser liefern die Fähigkeiten der Kamera erst vollständig,
     * wenn das erste Bild da ist – dann wird nachgelesen. */
    els.video.addEventListener('playing', function () {
      if (!stream) return;
      readNativeZoom();
      showTools();
      showInfo();
      if (!frozen) setZoom(zoom);
    });

    bindGestures();

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
    els.lenses = document.getElementById('loupe-lenses');
    els.range = document.getElementById('loupe-zoom');
    els.out = document.getElementById('loupe-zoom-out');
    els.info = document.getElementById('loupe-info');
    els.infoText = document.getElementById('loupe-info-text');
    els.freeze = document.getElementById('btn-freeze');
    els.torch = document.getElementById('btn-torch');
    els.contrast = document.getElementById('btn-contrast');
    els.relief = document.getElementById('btn-relief');
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

  /* Für die Prüfstrecke: wie sich die Vergrößerung gerade aufteilt, und
   * welches Objektiv offen ist. */
  function split() {
    return {
      zoom: zoom,
      kamera: frozen ? baked : nativePart(),
      max: maxZoom(),
      pan: { x: pan.x, y: pan.y },
      lens: lensId,
      lenses: lenses.map(function (l) { return l.id; })
    };
  }

  return {
    init: init,
    setActive: setActive,
    running: running,
    split: split
  };
})();
