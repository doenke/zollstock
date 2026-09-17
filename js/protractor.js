/* Winkelmesser: liest die Lage des Geräts und zeigt sie auf einer groben
 * Ringskala und einer feinen Bandskala.
 *
 * Aus beta und gamma des Lagesensors wird die Richtung "oben" im
 * Gerätesystem berechnet (dritte Zeile der Drehmatrix Z-X'-Y''):
 *
 *   ux = −cos(beta) · sin(gamma)
 *   uy =  sin(beta)
 *   uz =  cos(beta) · cos(gamma)
 *
 * Senkrecht im Hochformat ergibt (0, 1, 0), flach auf dem Tisch (0, 0, 1).
 * Daraus folgen beide Neigungen:
 *
 *   Kante  – Drehung in der Bildschirmebene: atan2(−ux, uy)
 *   Fläche – Neigung der Auflagefläche:      acos(|uz|)
 *
 * Beide Messarten lassen sich nullen. Bei "Kante" wird ein Winkel im
 * Gerätesystem gemerkt, bei "Fläche" die Richtung "oben" der Bezugsfläche –
 * danach wird der Winkel zwischen Bezugsfläche und aktueller Lage gemessen.
 */
window.Protractor = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.protractor.v1';
  var DEG = 180 / Math.PI;
  var SMOOTHING = 0.25;      /* Tiefpass gegen das Zittern des Sensors */
  var FINE_RANGE = 5;        /* Feinskala zeigt ± 5 Grad */

  var canvas, ctx, els = {};
  var up = { x: 0, y: 0, z: 1 };
  var smooth = null;
  var mode = 'edge';
  var zeroRef = null;      /* null = gegen Waagerechte und Senkrechte */
  var planeRef = null;     /* gemerkte Bezugsfläche, null = Waagerechte */
  var hold = null;           /* eingefrorene Lage, solange gehalten wird */
  var active = false;
  var listening = false;
  var haveData = false;
  var frame = null;
  var gateTimer = null;

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------- Gemerkte Bezüge ---------- */

  /* Ein gesetzter Nullpunkt und eine gemerkte Fläche gehören zur laufenden
   * Arbeit – sie sollen ein Neuladen überstehen. Dass sie gelten, ist an der
   * Taste zu sehen, die dann "Zurücksetzen" heißt. */
  function loadRefs() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!parsed) return;

      if (isFinite(parsed.zeroRef)) zeroRef = parsed.zeroRef;

      var plane = parsed.planeRef;
      if (plane && isFinite(plane.x) && isFinite(plane.y) && isFinite(plane.z)) {
        var len = Math.sqrt(plane.x * plane.x + plane.y * plane.y + plane.z * plane.z);
        /* Nur ein Einheitsvektor ist eine Richtung. */
        if (Math.abs(len - 1) < 0.01) planeRef = { x: plane.x, y: plane.y, z: plane.z };
      }
    } catch (err) {
      /* Unlesbar gespeichert – dann wird eben wieder gegen die Waagerechte
       * gemessen. */
    }
  }

  function persistRefs() {
    try {
      if (zeroRef === null && planeRef === null) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify({ zeroRef: zeroRef, planeRef: planeRef }));
    } catch (err) {
      /* Privater Modus – gilt dann nur für diese Sitzung. */
    }
  }

  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }

  function wrap180(deg) {
    var v = (deg + 180) % 360;
    return (v < 0 ? v + 360 : v) - 180;
  }

  function fmt(deg, digits) {
    var text = deg.toFixed(digits === undefined ? 1 : digits);
    if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);   /* kein "-0,0°" */
    return text.replace('.', ',') + '°';
  }

  /* ---------- Sensor ---------- */

  function onOrientation(event) {
    if (event.beta === null || event.gamma === null) return;

    var b = event.beta / DEG;
    var g = event.gamma / DEG;
    var next = {
      x: -Math.cos(b) * Math.sin(g),
      y: Math.sin(b),
      z: Math.cos(b) * Math.cos(g)
    };

    if (!smooth) {
      smooth = next;
    } else {
      smooth.x += (next.x - smooth.x) * SMOOTHING;
      smooth.y += (next.y - smooth.y) * SMOOTHING;
      smooth.z += (next.z - smooth.z) * SMOOTHING;
    }

    var len = Math.sqrt(smooth.x * smooth.x + smooth.y * smooth.y + smooth.z * smooth.z) || 1;
    up.x = smooth.x / len;
    up.y = smooth.y / len;
    up.z = smooth.z / len;

    if (!haveData) {
      haveData = true;
      showGate(null);
    }
  }

  function needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  function listen() {
    if (listening) return;
    window.addEventListener('deviceorientation', onOrientation);
    listening = true;

    clearTimeout(gateTimer);
    gateTimer = setTimeout(function () {
      if (!haveData) {
        showGate('Kein Lagesensor gefunden – die Anzeige bleibt bei 0°.', false);
      }
    }, 1500);
  }

  function unlisten() {
    if (!listening) return;
    window.removeEventListener('deviceorientation', onOrientation);
    listening = false;
    clearTimeout(gateTimer);
  }

  function requestSensor() {
    DeviceOrientationEvent.requestPermission().then(function (answer) {
      if (answer === 'granted') {
        showGate(null);
        listen();
      } else {
        showGate('Zugriff auf den Lagesensor abgelehnt. In den Einstellungen des Browsers lässt er sich wieder erlauben.', false);
      }
    }).catch(function () {
      showGate('Der Lagesensor ließ sich nicht aktivieren.', false);
    });
  }

  /* ---------- Winkel ---------- */

  /* beta und gamma beziehen sich auf das Gerät in seiner natürlichen Lage.
   * Dreht das Betriebssystem die Ansicht ins Querformat, ist das gezeichnete
   * Bild mitgedreht – die Lage muss in dasselbe System gebracht werden. */
  /* screen.orientation.angle zählt, um wie viel das Bild im Uhrzeigersinn
   * gegenüber der natürlichen Lage gedreht ist. Das alte window.orientation
   * von iOS zählt andersherum und wird deshalb umgerechnet. */
  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') {
      return (360 - window.orientation) % 360;
    }
    return 0;
  }

  /* Gehalten wird die Lage selbst – damit stehen Ring, Libelle, Bandskala und
   * Anzeige gemeinsam still, egal wie das Gerät danach bewegt wird. */
  function source() {
    return hold || { up: up, angle: screenAngle() };
  }

  /* Das Bild ist um a im Uhrzeigersinn gedreht, die Koordinaten eines
   * festen Vektors also um a gegen den Uhrzeigersinn. */
  function screenOf(v) {
    var a = source().angle / DEG;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: v.z };
  }

  function screenUp() { return screenOf(source().up); }

  /* Winkel im Bildschirmsystem: Dreht das Betriebssystem die Ansicht mit,
   * bleibt er gleich – gemessen wird gegen Waagerechte und Senkrechte. */
  function rawScreen() {
    var s = screenUp();
    return Math.atan2(-s.x, s.y) * DEG;
  }

  /* Winkel im Gerätesystem. Daran hängt ein von Hand gesetzter Nullpunkt:
   * Wer gegen eine Bezugskante nullt, will beim Drehen des Geräts den
   * tatsächlichen Abstand zu dieser Kante sehen, nicht den zur Senkrechten. */
  function rawDevice() {
    var u = source().up;
    return Math.atan2(-u.x, u.y) * DEG;
  }

  function edgeAngle() {
    return zeroRef === null ? wrap180(rawScreen()) : wrap180(rawDevice() - zeroRef);
  }
  function screenTilt() { return Math.asin(clamp1(source().up.z)) * DEG; }  /* 0 = senkrecht */

  /* Kippt die Welt so, dass die gemerkte Fläche waagerecht liegt: die
   * kürzeste Drehung, die "oben" der Bezugsfläche auf (0, 0, 1) bringt,
   * angewandt auf v (Formel von Rodrigues).
   *
   * Vom Lagesensor kommt nur die Richtung der Schwerkraft – die Himmels-
   * richtung bleibt unbekannt. Gemessen wird deshalb der Winkel, um den das
   * Gerät zwischen beiden Auflagen gekippt wurde. Solange es dabei nicht um
   * die Senkrechte gedreht wird, ist das genau der Winkel zwischen den
   * beiden Flächen. */
  function levelWith(v, ref) {
    var kx = ref.y, ky = -ref.x;        /* ref × (0, 0, 1) */
    var sin = Math.sqrt(kx * kx + ky * ky);
    var cos = clamp1(ref.z);

    /* Bezugsfläche liegt schon waagerecht – oder genau andersherum. */
    if (sin < 1e-6) {
      return cos >= 0 ? { x: v.x, y: v.y, z: v.z } : { x: v.x, y: -v.y, z: -v.z };
    }

    kx /= sin;
    ky /= sin;
    var dot = kx * v.x + ky * v.y;      /* die z-Achse der Drehachse ist 0 */
    return {
      x: v.x * cos + ky * v.z * sin + kx * dot * (1 - cos),
      y: v.y * cos - kx * v.z * sin + ky * dot * (1 - cos),
      z: v.z * cos + (kx * v.y - ky * v.x) * sin
    };
  }

  /* "Oben" bezogen auf die Bezugsfläche; ohne Bezug ist das die Waagerechte. */
  function planeUp() {
    var u = source().up;
    return planeRef ? levelWith(u, planeRef) : u;
  }

  function slope() { return Math.acos(Math.min(1, Math.abs(planeUp().z))) * DEG; }
  function axisLong() { return Math.asin(clamp1(screenOf(planeUp()).y)) * DEG; }
  function axisCross() { return Math.asin(clamp1(screenOf(planeUp()).x)) * DEG; }

  function reading() { return mode === 'edge' ? edgeAngle() : slope(); }

  /* ---------- Gefälle ---------- */

  var FLAT_MAX = 20;       /* bis hierher ist Gefälle das nützlichere Maß */

  /* Wie weit die Anzeige von der Waagerechten abweicht. Im Kantenmodus zählt
   * auch die Nähe zur gestreckten Lage – ein Rohr, das andersherum anliegt,
   * hat dasselbe Gefälle. */
  function flatAngle() {
    var away = Math.abs(reading());
    return mode === 'edge' ? Math.min(away, 180 - away) : away;
  }

  /* Steigung als Verhältnis: der Tangens der Abweichung. Prozent ist das Maß
   * für Abwasser und Terrassen (2 %), mm/m das für Dachrinnen. */
  function flatPercent() { return Math.tan(flatAngle() / DEG) * 100; }

  function slopeText() {
    var percent = flatPercent();
    return percent.toFixed(1).replace('.', ',') + ' %   ·   ' +
      Math.round(percent * 10) + ' mm/m';
  }

  function zeroed() { return mode === 'edge' ? zeroRef !== null : planeRef !== null; }

  /* Nullen setzt die aktuelle Lage als Bezug, nochmal drücken nimmt ihn
   * zurück – dann wird wieder gegen Waagerechte und Senkrechte gemessen.
   * Bei "Fläche" wird das Gerät dazu auf die Bezugsfläche gelegt. */
  function toggleZero() {
    if (mode === 'edge') {
      zeroRef = zeroRef === null ? rawDevice() : null;
    } else if (planeRef) {
      planeRef = null;
    } else {
      var u = source().up;
      planeRef = { x: u.x, y: u.y, z: u.z };
    }

    persistRefs();
    showZero();
  }

  function showZero() {
    var on = zeroed();
    els.zero.textContent = on ? 'Zurücksetzen' : mode === 'edge' ? 'Nullen' : 'Fläche merken';
    els.zero.classList.toggle('is-on', on);
    els.zero.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* ---------- Grobe Skala: Bogenteilung ---------- */

  var ARC_HALF = 25;       /* sichtbarer Bereich in Grad, je Seite */

  /* Der Bogen nutzt die Breite der Fläche aus. Je größer der Halbmesser,
   * desto weiter liegen die Gradstriche auseinander – ein Vollkreis müsste
   * dafür viel kleiner ausfallen. */
  function arcRadius(width, height) {
    var byWidth = (width / 2 - 6) / Math.sin(ARC_HALF / DEG);
    var byHeight = (height - 34) / (1 - Math.cos(ARC_HALF / DEG));
    return Math.max(90, Math.min(byWidth, byHeight));
  }

  function arcDepth(radius) {
    return radius * (1 - Math.cos(ARC_HALF / DEG));
  }

  /* Punkt auf dem Bogen: 0° oben, positiv im Uhrzeigersinn. */
  function onArc(deg, r) {
    var rad = deg / DEG;
    return { x: Math.sin(rad) * r, y: -Math.cos(rad) * r };
  }

  function drawArc(cx, cy, radius) {
    var value = reading();
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var fontSize = Math.max(14, Math.min(20, radius * 0.055));
    var majorLen = Math.max(24, Math.min(38, radius * 0.09));
    var midLen = majorLen * 0.62;
    var smallLen = majorLen * 0.34;
    /* Bei großem Halbmesser ist Platz für jede fünfte Zahl. */
    var labelStep = radius * 5 / DEG >= 44 ? 5 : 10;

    ctx.save();
    ctx.translate(cx, cy);
    /* Die Teilung steht lotrecht im Raum: sie dreht der Bildschirmdrehung
     * entgegen, der feste Zeiger oben greift den Wert ab. */
    ctx.rotate(-value / DEG);

    ctx.strokeStyle = text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, (value - ARC_HALF - 90) / DEG, (value + ARC_HALF - 90) / DEG);
    ctx.stroke();

    var first = Math.ceil(value - ARC_HALF);
    var last = Math.floor(value + ARC_HALF);

    for (var deg = first; deg <= last; deg++) {
      /* Die Null und jeder Viertelkreis darauf stehen kräftiger da. */
      var quarter = ((deg % 45) + 45) % 45 === 0;
      var major = deg % labelStep === 0;
      var mid = deg % 5 === 0;
      var len = quarter ? majorLen * 1.4 : major ? majorLen : mid ? midLen : smallLen;
      var outer = onArc(deg, radius);
      var inner = onArc(deg, radius - len);

      ctx.strokeStyle = major ? text : dim;
      ctx.lineWidth = quarter ? 3 : major ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(outer.x, outer.y);
      ctx.lineTo(inner.x, inner.y);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = text;

    /* Die Teilung dreht nach dem Messwert, die Zahlen sollen aber lotrecht
     * bleiben. Ohne Nullpunkt ist beides dasselbe; ist von Hand genullt oder
     * die Ansicht gedreht, muss die Beschriftung zurückgedreht werden. */
    var upright = (value - rawScreen()) / DEG;

    /* So dicht neben einer großen Zahl ist kein Platz mehr für eine kleine. */
    var crowded = fontSize * 2.2 / (radius / DEG);

    for (var v = first; v <= last; v++) {
      var isQuarter = ((v % 45) + 45) % 45 === 0;
      /* Viertelkreise werden immer beschriftet, sonst jede labelStep-te Zahl. */
      if (!isQuarter && v % labelStep !== 0) continue;
      if (!isQuarter && Math.abs(toGrid(v)) < crowded) continue;

      var size = isQuarter ? fontSize * 1.45 : fontSize;
      /* Die großen Zahlen stehen eine Reihe tiefer, sonst stoßen sie an die
       * Nachbarn – bei 45 stünde die 50 nur fünf Grad daneben. */
      var p = onArc(v, radius - majorLen * (isQuarter ? 1.4 : 1) - size * (isQuarter ? 1.15 : 0.75));

      ctx.font = (isQuarter ? '700 ' : '600 ') + size + 'px system-ui, -apple-system, sans-serif';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(upright);
      ctx.fillText(String(Math.abs(wrap180(v))), 0, 0);
      ctx.restore();
    }

    ctx.restore();

    /* Fester Zeiger über dem Bogen – er gehört zum Gerät, nicht zur Teilung. */
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius + 12);
    ctx.lineTo(cx - 9, cy - radius - 10);
    ctx.lineTo(cx + 9, cy - radius - 10);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- Grobe Skala: Dosenlibelle ---------- */

  /* Ohne Bezugsfläche geht es um die letzten Grad bis zur Waagerechten, mit
   * Bezugsfläche können es leicht 40 werden. Die Libelle wählt deshalb den
   * kleinsten Bereich, in den die Abweichung noch passt. */
  var BUBBLE_RINGS = { 10: [2, 5, 10], 30: [5, 15, 30], 90: [15, 45, 90] };
  var BUBBLE_STEPS = [10, 30, 90];
  var bubbleRange = 10;

  function pickRange(value) {
    var i = 0;
    while (i < BUBBLE_STEPS.length - 1 && value > BUBBLE_STEPS[i] * 0.98) i++;
    /* Kleiner wird die Skala erst ein Stück innerhalb des nächsten Bereichs,
     * sonst springt sie an der Grenze hin und her. */
    if (BUBBLE_STEPS[i] < bubbleRange && value > BUBBLE_STEPS[i] * 0.85) return bubbleRange;
    bubbleRange = BUBBLE_STEPS[i];
    return bubbleRange;
  }

  function drawBubble(cx, cy, radius) {
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var range = pickRange(reading());
    var rings = BUBBLE_RINGS[range];
    var perDeg = radius / range;

    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    rings.forEach(function (ring) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring * perDeg, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.strokeStyle = text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    /* Das Fadenkreuz ist das Ziel: die Waagerechte – oder, wenn eine Fläche
     * gemerkt ist, diese Fläche. Dann steht es in der Signalfarbe. */
    ctx.strokeStyle = planeRef ? accent : text;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    rings.forEach(function (ring) {
      ctx.fillText(ring + '°', cx + ring * perDeg - 20, cy - 5);
    });

    /* Die Blase wandert zur angehobenen Seite, wie in einer echten Libelle;
     * am Rand bleibt sie auf dem Kreis stehen, nicht in der Ecke. */
    var ax = axisCross(), ay = axisLong();
    var far = Math.sqrt(ax * ax + ay * ay);
    var scale = far > range ? range / far : 1;
    var dx = ax * scale * perDeg;
    var dy = ay * scale * perDeg;

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx + dx, cy - dy, Math.max(9, radius * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- Feine Skala: Bandteilung ---------- */

  var FINE_SPAN = 12;      /* sichtbarer Bereich in Grad, je Seite */
  var FINE_CLEAR = 9.5;    /* bis hierher voll sichtbar */
  var FINE_GONE = 14.5;    /* ab hier bleiben nur die Gradstriche */

  /* Abweichung eines Winkels von der nächsten 45-Grad-Marke. */
  function toGrid(deg) {
    return deg - Math.round(deg / 45) * 45;
  }

  /* Nur der Bereich um jede Null herum ist von Interesse; dazwischen
   * verblasst die Teilung. */
  function fade(distance) {
    if (distance <= FINE_CLEAR) return 1;
    if (distance >= FINE_GONE) return 0;
    return (FINE_GONE - distance) / (FINE_GONE - FINE_CLEAR);
  }

  function drawTape(x, y, width, height) {
    var value = reading();
    var perDeg = width / (FINE_SPAN * 2);
    var cx = x + width / 2;
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var labelSize = Math.max(12, Math.min(19, height * 0.17));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    /* In Vierteln rechnen, damit sich die Schritte nicht aufsummieren. */
    var first = Math.ceil((value - FINE_SPAN) * 4);
    var last = Math.floor((value + FINE_SPAN) * 4);

    for (var q = first; q <= last; q++) {
      var deg = q / 4;
      var grid = toGrid(deg);
      var steps = Math.round(grid * 4);
      var whole = steps % 4 === 0;
      /* Die Gradstriche bleiben überall sichtbar, damit das Band zwischen
       * zwei Nullen nicht abreißt; die feine Teilung blendet aus. */
      var alpha = whole ? Math.max(0.28, fade(Math.abs(grid))) : fade(Math.abs(grid));
      if (alpha <= 0.02) continue;

      var five = steps % 20 === 0;
      /* Viertelgrade nur im wirklich genutzten Bereich – sonst Brei. */
      if (!whole && Math.abs(grid) > FINE_CLEAR) continue;

      var len = five ? height * 0.5 : whole ? height * 0.34 : height * 0.18;
      var px = cx + (deg - value) * perDeg;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = five ? text : whole ? text : dim;
      ctx.lineWidth = five ? 2 : whole ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + len);
      ctx.stroke();

      /* Zahlen nur im genutzten Bereich – weiter außen sagen sie nichts mehr,
       * was die große Anzeige nicht besser sagt. */
      if (five && Math.abs(grid) <= FINE_CLEAR && px > x + 16 && px < x + width - 16) {
        var shown = Math.round(grid);
        ctx.fillStyle = shown === 0 ? accent : dim;
        ctx.font = '600 ' + labelSize + 'px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(shown > 0 ? '+' + shown : String(shown), px, y + len + 4);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    /* Fester Zeiger */
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y - 5);
    ctx.lineTo(cx, y + height * 0.62);
    ctx.stroke();

  }

  /* ---------- Rückmeldung an den Rastermarken ---------- */

  var SNAP_IN = 0.3;       /* so nah an der Marke wird gemeldet */
  var SNAP_OUT = 1.2;      /* so weit weg zählt es wieder als gelöst */
  var snappedMark = null;

  /* Ein kurzer Stups, sobald die Anzeige auf einer 45er-Marke steht – die
   * Null bekommt zwei, damit sie sich unterscheidet. Ohne Hinsehen zu
   * merken, wann es waagerecht oder senkrecht steht, ist der halbe Zweck.
   *
   * Gemerkt wird die Marke selbst, nicht bloß "drin oder draußen": Wandert
   * die Anzeige zwischen zwei Bildern von einer Marke zur nächsten, ist das
   * eine neue Meldung wert. */
  function checkSnap() {
    if (!haveData || hold) return;

    var value = reading();
    var mark = Math.round(value / 45) * 45;
    if (mark === -180) mark = 180;
    var distance = Math.abs(value - mark);

    if (distance <= SNAP_IN) {
      if (snappedMark === mark) return;
      snappedMark = mark;
      if (navigator.vibrate) navigator.vibrate(mark === 0 ? [30, 45, 30] : 30);
    } else if (snappedMark !== null && distance > SNAP_OUT) {
      snappedMark = null;
    }
  }

  /* ---------- Anzeige ---------- */

  function drawReadout(cx, cy, size) {
    var accent = css('--accent');
    var dim = css('--text-dim');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = haveData ? accent : dim;
    ctx.font = '700 ' + size + 'px system-ui, -apple-system, sans-serif';
    ctx.fillText(fmt(reading()), cx, cy);

  }

  /* Das Gerät von der Seite gesehen, um seine Kippung geneigt, neben einem
   * gestrichelten Lot. Das sagt auf einen Blick, ob es senkrecht steht –
   * schneller als eine Zahl. */
  function drawTiltIcon(cx, cy, height, tilt, color) {
    var width = height * 0.34;

    ctx.strokeStyle = css('--text-dim');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - height / 2);
    ctx.lineTo(cx, cy + height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(cx, cy + height / 2);
    ctx.rotate(tilt / DEG);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.rect(-width / 2, -height, width, height);
    ctx.stroke();
    ctx.restore();
  }

  /* Schreibt eine Zeile, notfalls kleiner, damit sie in die Breite passt. */
  function fitText(text, cx, y, size, maxWidth, weight) {
    ctx.font = (weight || '600 ') + size + 'px system-ui, -apple-system, sans-serif';
    var width = ctx.measureText(text).width;

    if (width > maxWidth) {
      size = Math.max(10, size * maxWidth / width);
      ctx.font = (weight || '600 ') + size + 'px system-ui, -apple-system, sans-serif';
    }
    ctx.fillText(text, cx, y);
  }

  /* Was unter dem Messwert steht: wie weit es noch bis zum rechten und zum
   * gestreckten Winkel ist, dazu die Kippung als Bild und als Zahl. */
  function drawSecondary(cx, y, maxWidth) {
    var dim = css('--text-dim');
    var text = css('--text');
    var width = maxWidth || 280;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dim;

    if (mode === 'edge') {
      /* Nahe der Waagerechten ist das Gefälle das gesuchte Maß, weiter weg
       * sagt es nichts mehr – dort zählt, was bis zum rechten und bis zum
       * gestreckten Winkel fehlt. Jedes steht, wo es etwas bedeutet. */
      var away = Math.abs(reading());
      fitText(flatAngle() <= FLAT_MAX
        ? slopeText()
        : fmt(Math.abs(90 - away)) + '   ·   ' + fmt(180 - away), cx, y, 14, width);

      /* Sinnbild und Zahl nebeneinander, zusammen mittig. */
      var tilt = screenTilt();
      var steep = Math.abs(tilt) > 45;
      var label = 'Kippung ' + fmt(tilt, 0);

      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      var labelWidth = ctx.measureText(label).width;
      var iconWidth = 34;
      var left = cx - (labelWidth + iconWidth) / 2;

      drawTiltIcon(left + 13, y + 30, 30, tilt, steep ? css('--danger') : text);
      ctx.fillStyle = steep ? css('--danger') : dim;
      ctx.textAlign = 'left';
      ctx.fillText(label, left + iconWidth, y + 30);
      ctx.textAlign = 'center';
    } else {
      /* Liegt die Fläche fast waagerecht, ist das Gefälle die Zahl, die man
       * braucht; wohin es kippt, zeigt ohnehin die Libelle darüber. */
      fitText(flatAngle() <= FLAT_MAX
        ? slopeText()
        : 'Längs ' + fmt(axisLong()) + '  ·  Quer ' + fmt(axisCross()), cx, y + 15, 13, width);
    }

    /* Nur melden, wenn es etwas zu melden gibt – die Handhabung erklärt sich
     * über das Sinnbild der Kippung. */
    var hint = '';
    if (hold) hint = 'gehalten – zum Lösen erneut tippen';
    else if (mode === 'edge' && Math.abs(screenTilt()) > 45) hint = 'Bildschirm senkrecht halten';

    if (hint) {
      ctx.fillStyle = dim;
      ctx.textAlign = 'center';
      fitText(hint, cx, y + 58, 12, width, '');
    }
  }

  function drawDial(x, y, width, height) {
    if (mode === 'edge') {
      var radius = arcRadius(width, height);
      var arcTop = y + 14;
      drawArc(x + width / 2, arcTop + radius, radius);
      return arcTop + arcDepth(radius);
    }

    var r = Math.max(56, Math.min(width * 0.34, height / 2 - 20));
    drawBubble(x + width / 2, y + r + 14, r);
    return y + 2 * r + 14;
  }

  function draw() {
    if (!canvas) return;

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;

    /* Solange die Ansicht verborgen ist, hat die Fläche keine Größe. */
    if (w < 2 || h < 2) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* Wie viel Platz Werkzeug- und Tableiste brauchen, hängt davon ab, ob die
     * Schaltflächen umbrechen – deshalb wird die Leiste ausgemessen. Liefert
     * die Messung nichts Brauchbares, bleibt ein Platzhalter stehen, statt
     * die Skala in die obere Ecke zu quetschen. */
    var bar = els.tools.getBoundingClientRect().top - 14;
    var bottom = bar > 160 ? bar : h - 150;
    var tapeHeight = 112;

    if (w > h) {
      /* Querformat: Skala links, Anzeige und Feinskala rechts daneben. */
      var top = 16;
      var halfW = w * 0.5;

      drawDial(0, top, halfW, bottom - top);

      /* Rechte Spalte von oben nach unten: Wert, zweite Neigung, Feinskala. */
      var textX = w * 0.74;
      var colTop = top + 12;

      drawReadout(textX, colTop + 24, 42);
      drawSecondary(textX, colTop + 58, w - halfW - 24);
      drawTape(halfW, colTop + 132, w - halfW - 16,
        Math.min(tapeHeight, bottom - colTop - 132));
      return;
    }

    var topP = 74;
    var dialBottom = bottom - tapeHeight - 14;
    var used = drawDial(0, topP, w, dialBottom - topP);
    var size = Math.max(40, Math.min(58, w * 0.16));
    /* Die Anzeige steht mittig im Platz zwischen Bogen und Feinskala. */
    var textY = (used + dialBottom) / 2 - size * 0.4;

    drawReadout(w / 2, textY, size);
    drawSecondary(w / 2, textY + size * 0.72, w - 32);
    drawTape(10, dialBottom + 14, w - 20, tapeHeight);
  }

  function loop() {
    checkSnap();
    draw();
    /* Im Haltezustand ändert sich nichts mehr – dann ruht die Schleife. */
    frame = hold ? null : requestAnimationFrame(loop);
  }

  /* ---------- Bedienung ---------- */

  function showGate(message, withButton) {
    if (!message) {
      els.gate.hidden = true;
      return;
    }
    els.gateText.textContent = message;
    els.gateButton.hidden = withButton === false;
    els.gate.hidden = false;
  }

  function toggleHold() {
    if (!haveData && !hold) return;

    hold = hold ? null : {
      up: { x: up.x, y: up.y, z: up.z },
      angle: screenAngle()
    };

    els.hold.classList.toggle('is-on', !!hold);
    els.hold.setAttribute('aria-pressed', hold ? 'true' : 'false');
    els.hold.textContent = hold ? 'Weiter' : 'Halten';

    cancelAnimationFrame(frame);
    frame = null;
    if (hold || !active) draw();
    else loop();
  }

  function setMode(next) {
    mode = next;
    els.modeButtons.forEach(function (btn) {
      var on = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    showZero();
    draw();
  }

  function setActive(on) {
    active = on;
    cancelAnimationFrame(frame);
    frame = null;

    if (!on) {
      unlisten();
      snappedMark = null;
      return;
    }

    if (needsPermission() && !listening) {
      showGate('Für den Winkelmesser wird der Lagesensor gebraucht.', true);
    } else {
      listen();
    }

    loop();
  }

  function init() {
    canvas = document.getElementById('protractor-canvas');
    ctx = canvas.getContext('2d');

    els = {
      tools: document.querySelector('#view-protractor .tools'),
      gate: document.getElementById('sensor-gate'),
      gateText: document.getElementById('sensor-gate-text'),
      gateButton: document.getElementById('btn-sensor'),
      zero: document.getElementById('btn-zero'),
      hold: document.getElementById('btn-hold'),
      modeButtons: Array.prototype.slice.call(document.querySelectorAll('[data-mode]'))
    };

    els.zero.addEventListener('click', toggleZero);
    els.hold.addEventListener('click', toggleHold);
    /* Die Skala selbst ist die größte Fläche – auch sie hält an. */
    canvas.addEventListener('pointerdown', toggleHold);
    els.gateButton.addEventListener('click', requestSensor);
    els.modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });

    loadRefs();
    setMode(mode);
    showZero();
  }

  /* Die aktuellen Messwerte – für die Anzeige selbst nicht nötig, aber
   * nützlich, um die Umrechnung nachzuvollziehen. */
  function values() {
    return {
      mode: mode,
      main: reading(),
      tilt: screenTilt(),
      slope: slope(),
      flat: flatAngle(),
      percent: flatPercent(),
      long: axisLong(),
      cross: axisCross(),
      zeroRef: zeroRef,
      planeRef: planeRef,
      held: !!hold,
      haveData: haveData
    };
  }

  return { init: init, draw: draw, setActive: setActive, values: values };
})();
