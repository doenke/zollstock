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
  var zeroRef = 0;
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
  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    return typeof window.orientation === 'number' ? window.orientation : 0;
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
    return {
      x: src.up.x * cos + src.up.y * sin,
      y: -src.up.x * sin + src.up.y * cos,
      z: src.up.z
    };
  }

  function rawEdge() {
    var s = screenUp();
    return Math.atan2(-s.x, s.y) * DEG;
  }
  function edgeAngle() { return wrap180(rawEdge() - zeroRef); }
  function screenTilt() { return Math.asin(clamp1(source().up.z)) * DEG; }  /* 0 = senkrecht */
  function slope() { return Math.acos(Math.min(1, Math.abs(source().up.z))) * DEG; }
  function axisLong() { return Math.asin(clamp1(screenUp().y)) * DEG; }
  function axisCross() { return Math.asin(clamp1(screenUp().x)) * DEG; }

  function reading() { return mode === 'edge' ? edgeAngle() : slope(); }

  /* Ausrichten: Null auf die nächste Vierteldrehung. Das Gerät darf hochkant,
   * quer oder auf dem Kopf anliegen und zeigt trotzdem die Abweichung von der
   * Waagerechten bzw. Senkrechten – vier mögliche Nullstellungen. */
  function align() {
    if (mode !== 'edge') return;
    zeroRef = Math.round(rawEdge() / 90) * 90;
  }

  /* Nullen: die aktuelle Lage wird zur Null, ohne jede Rundung. Damit lässt
   * sich gegen eine beliebige Bezugskante messen. */
  function zero() {
    if (mode !== 'edge') return;
    zeroRef = rawEdge();
  }

  /* ---------- Grobe Skala: Ringteilung ---------- */

  function drawRing(cx, cy, radius) {
    var value = reading();
    var labelStep = radius * 15 / DEG >= 34 ? 15 : 30;
    var text = css('--text');
    var dim = css('--text-dim');

    ctx.save();
    ctx.translate(cx, cy);

    /* Der Ring steht lotrecht im Raum: er dreht der Bildschirmdrehung entgegen. */
    ctx.rotate(-value / DEG);

    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    for (var deg = 0; deg < 360; deg++) {
      var major = deg % labelStep === 0;
      var mid = deg % 5 === 0;
      var len = major ? radius * 0.14 : mid ? radius * 0.09 : radius * 0.05;
      var rad = deg / DEG;
      var sin = Math.sin(rad);
      var cos = Math.cos(rad);

      ctx.strokeStyle = major ? text : dim;
      ctx.lineWidth = major ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(sin * radius, -cos * radius);
      ctx.lineTo(sin * (radius - len), -cos * (radius - len));
      ctx.stroke();
    }

    var fontSize = Math.max(10, Math.min(15, radius * 0.11));
    ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = text;

    for (var v = 0; v < 360; v += labelStep) {
      var shown = Math.abs(wrap180(v));
      /* Dreistellige Zahlen stehen sich unten sonst gegenseitig im Weg. */
      if (shown > 90 && v % (labelStep * 2) !== 0) continue;
      var r2 = (v / DEG);
      var rr = radius - radius * 0.24;
      ctx.fillText(String(shown), Math.sin(r2) * rr, -Math.cos(r2) * rr);
    }

    ctx.restore();

    /* Fester Zeiger am oberen Rand – er gehört zum Gerät, nicht zum Ring. */
    var accent = css('--accent');
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius + 15);
    ctx.lineTo(cx - 9, cy - radius - 7);
    ctx.lineTo(cx + 9, cy - radius - 7);
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

    ctx.fillStyle = dim;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Abweichung von ' + fmt(Math.round(value / 45) * 45, 0), x + width - 4, y + height);
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

  /* Die jeweils andere Neigung, darunter der Hinweis zur Handhabung. */
  function drawSecondary(cx, y) {
    var second, hint;

    if (mode === 'edge') {
      second = 'Kippung ' + fmt(screenTilt(), 0);
      hint = Math.abs(screenTilt()) > 45 ? 'Bildschirm senkrecht halten' : 'Gerätekante anlegen';
    } else {
      second = 'Längs ' + fmt(axisLong()) + '  ·  Quer ' + fmt(axisCross());
      hint = 'Gerät flach auflegen';
    }
    if (hold) hint = 'gehalten – zum Lösen erneut tippen';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css('--text-dim');
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(second, cx, y);
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText(hint, cx, y + 20);
  }

  function drawDial(cx, cy, radius) {
    if (mode === 'edge') drawRing(cx, cy, radius);
    else drawBubble(cx, cy, radius);
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
      var radius = Math.max(40, Math.min((bottom - top) / 2 - 6, w * 0.2));
      var cy = (top + bottom) / 2;
      var textX = w * 0.66;

      drawDial(w * 0.25, cy, radius);
      drawReadout(textX, cy - 46, 40);
      drawSecondary(textX, cy + 4);
      drawTape(w * 0.42, cy + 34, w * 0.56 - 16, tapeHeight);
      return;
    }

    var topP = 74;
    var dialBottom = bottom - tapeHeight - 14;
    var share = mode === 'edge' ? 0.42 : 0.33;
    var radiusP = Math.max(40, Math.min(w * share, (dialBottom - topP) / 2));
    var size = Math.max(26, Math.min(46, radiusP * 0.4));
    var cyP = mode === 'edge'
      ? (topP + dialBottom) / 2
      : topP + (dialBottom - topP) * 0.36;

    drawDial(w / 2, cyP, radiusP);

    /* Im Ring ist die Mitte frei, bei der Libelle steht die Anzeige darunter. */
    var textY = mode === 'edge' ? cyP - size * 0.1 : cyP + radiusP + size * 0.6;
    drawReadout(w / 2, textY, size);
    drawSecondary(w / 2, textY + size * 0.75);
    drawTape(16, dialBottom + 14, w - 32, tapeHeight);
  }

  function loop() {
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
    els.align.disabled = mode !== 'edge';
    els.zero.disabled = mode !== 'edge';
    draw();
  }

  function setActive(on) {
    active = on;
    cancelAnimationFrame(frame);
    frame = null;

    if (!on) {
      unlisten();
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
      align: document.getElementById('btn-align'),
      zero: document.getElementById('btn-zero'),
      hold: document.getElementById('btn-hold'),
      modeButtons: Array.prototype.slice.call(document.querySelectorAll('[data-mode]'))
    };

    els.align.addEventListener('click', align);
    els.zero.addEventListener('click', zero);
    els.hold.addEventListener('click', toggleHold);
    /* Die Skala selbst ist die größte Fläche – auch sie hält an. */
    canvas.addEventListener('pointerdown', toggleHold);
    els.gateButton.addEventListener('click', requestSensor);
    els.modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });

    setMode(mode);
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
