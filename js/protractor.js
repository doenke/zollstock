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
 */
window.Protractor = (function () {
  'use strict';

  var DEG = 180 / Math.PI;
  var SMOOTHING = 0.25;      /* Tiefpass gegen das Zittern des Sensors */
  var FINE_RANGE = 5;        /* Feinskala zeigt ± 5 Grad */

  var canvas, ctx, els = {};
  var up = { x: 0, y: 0, z: 1 };
  var smooth = null;
  var mode = 'edge';
  var zeroRef = null;      /* null = gegen Waagerechte und Senkrechte */
  var hold = null;           /* eingefrorene Lage, solange gehalten wird */
  var active = false;
  var listening = false;
  var haveData = false;
  var frame = null;
  var gateTimer = null;

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }

  function wrap180(deg) {
    var v = (deg + 180) % 360;
    return (v < 0 ? v + 360 : v) - 180;
  }

  function fmt(deg, digits) {
    return deg.toFixed(digits === undefined ? 1 : digits).replace('.', ',') + '°';
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

  function screenUp() {
    var src = source();
    var a = src.angle / DEG;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    /* Das Bild ist um a im Uhrzeigersinn gedreht, die Koordinaten eines
     * festen Vektors also um a gegen den Uhrzeigersinn. */
    return {
      x: src.up.x * cos - src.up.y * sin,
      y: src.up.x * sin + src.up.y * cos,
      z: src.up.z
    };
  }

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
  function slope() { return Math.acos(Math.min(1, Math.abs(source().up.z))) * DEG; }
  function axisLong() { return Math.asin(clamp1(screenUp().y)) * DEG; }
  function axisCross() { return Math.asin(clamp1(screenUp().x)) * DEG; }

  function reading() { return mode === 'edge' ? edgeAngle() : slope(); }

  /* Nullen setzt die aktuelle Lage als Bezug, nochmal drücken nimmt ihn
   * zurück – dann wird wieder gegen Waagerechte und Senkrechte gemessen. */
  function toggleZero() {
    if (mode !== 'edge') return;
    zeroRef = zeroRef === null ? rawDevice() : null;
    showZero();
  }

  function showZero() {
    els.zero.textContent = zeroRef === null ? 'Nullen' : 'Zurücksetzen';
    els.zero.classList.toggle('is-on', zeroRef !== null);
    els.zero.setAttribute('aria-pressed', zeroRef === null ? 'false' : 'true');
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

  function drawBubble(cx, cy, radius) {
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var perDeg = radius / 10;   /* Rand des Kreises entspricht 10° */

    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    [2, 5, 10].forEach(function (ring) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring * perDeg, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.strokeStyle = text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    [2, 5, 10].forEach(function (ring) {
      ctx.fillText(ring + '°', cx + ring * perDeg - 20, cy - 5);
    });

    /* Die Blase wandert zur angehobenen Seite, wie in einer echten Libelle. */
    var dx = Math.max(-10, Math.min(10, axisCross())) * perDeg;
    var dy = Math.max(-10, Math.min(10, axisLong())) * perDeg;

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx + dx, cy - dy, Math.max(9, radius * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- Feine Skala: Bandteilung ---------- */

  var FINE_SPAN = 14;      /* sichtbarer Bereich in Grad, je Seite */
  var FINE_CLEAR = 10;     /* bis hierher voll sichtbar */
  var FINE_GONE = 14.5;    /* ab hier ausgeblendet */

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
    var labelSize = Math.max(11, Math.min(14, height * 0.17));

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
      var alpha = fade(Math.abs(grid));
      if (alpha <= 0.02) continue;

      var steps = Math.round(grid * 4);
      var whole = steps % 4 === 0;
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

      if (five && px > x + 16 && px < x + width - 16) {
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
      var away = Math.abs(reading());
      fitText('bis 90°  ' + fmt(Math.abs(90 - away)) + '   ·   bis 180°  ' + fmt(180 - away),
        cx, y, 13, width);

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
      fitText('Längs ' + fmt(axisLong()) + '  ·  Quer ' + fmt(axisCross()), cx, y + 15, 13, width);
    }

    var hint = mode === 'edge'
      ? (Math.abs(screenTilt()) > 45 ? 'Bildschirm senkrecht halten' : 'Gerätekante anlegen')
      : 'Gerät flach auflegen';
    if (hold) hint = 'gehalten – zum Lösen erneut tippen';

    ctx.fillStyle = dim;
    ctx.textAlign = 'center';
    fitText(hint, cx, y + 56, 12, width, '');
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
     * Schaltflächen umbrechen – deshalb wird die Leiste ausgemessen. */
    var bottom = els.tools.getBoundingClientRect().top - 14;
    var tapeHeight = 84;

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
    drawTape(16, dialBottom + 14, w - 32, tapeHeight);
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
    els.zero.disabled = mode !== 'edge';
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
      tools: document.querySelector('.tools'),
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
      long: axisLong(),
      cross: axisCross(),
      zeroRef: zeroRef,
      held: !!hold,
      haveData: haveData
    };
  }

  return { init: init, draw: draw, setActive: setActive, values: values };
})();
