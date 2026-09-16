/* Lineal: zeichnet zwei Skalen in Originalgröße – eine an jeder Kante des
 * Bildschirms, jeweils in der eingestellten Einheit. */
window.Ruler = (function () {
  'use strict';

  var canvas, ctx, readout, readoutMain, readoutSub, hint;
  var markerMm = null;
  var dragging = false;
  var frame = null;
  var GRAB_PX = 28;         /* Fassbereich um die Marke */
  var geometry = { vertical: true, length: 0, cross: 0, zero: { px: 0, sign: 1, mirrored: false } };

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* Punkt aus Längs-/Querkoordinate im aktuellen Layout. */
  function pt(along, cross) {
    return geometry.vertical ? { x: cross, y: along } : { x: along, y: cross };
  }

  function line(a1, c1, a2, c2) {
    var p1 = pt(a1, c1);
    var p2 = pt(a2, c2);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }

  /* ---------- Zeichnen ---------- */

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var pxW = Math.round(w * dpr);
    var pxH = Math.round(h * dpr);

    /* Die Zeichenfläche neu aufzusetzen kostet Zeit und leert sie. Beim
     * Ziehen ändert sich die Größe nicht – dann bleibt sie, wie sie ist. */
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geometry.vertical = window.Scales.vertical();
    geometry.length = geometry.vertical ? h : w;
    geometry.cross = geometry.vertical ? w : h;
    geometry.zero = zeroPoint();
  }

  /* base  Querkoordinate der Nulllinie
   * dir   Richtung, in die die Striche zeigen (+1 oder -1)
   * major Länge des Hauptstrichs */
  /* Wo die Null liegt und in welche Richtung gezählt wird.
   *   px       Ort der Null auf der Messachse (darf außerhalb liegen)
   *   sign     Zählrichtung
   *   mirrored bei mittiger Null: zählt nach beiden Seiten */
  function zeroPoint() {
    var pxPerMm = window.Calibration.pxPerMm();
    var entry = window.Scales.zero();

    if (entry.side === 'center') {
      return { px: geometry.length / 2, sign: 1, mirrored: true };
    }

    /* Die Gerätekante liegt außerhalb des Bildschirms, der Zentimeter
     * innerhalb. */
    var inset = entry.inset === 'cm'
      ? 10
      : -window.Edge.offsetOf(entry.inset);

    return entry.side === 'top'
      ? { px: inset * pxPerMm, sign: 1, mirrored: false }
      : { px: geometry.length - inset * pxPerMm, sign: -1, mirrored: false };
  }

  function alongOf(mm) {
    return geometry.zero.px + geometry.zero.sign * mm * window.Calibration.pxPerMm();
  }

  function mmOf(along) {
    var mm = (along - geometry.zero.px) / window.Calibration.pxPerMm() * geometry.zero.sign;
    return geometry.zero.mirrored ? mm : Math.max(0, mm);
  }

  function drawScale(unit, base, dir, major, color) {
    var zero = geometry.zero;
    var pxPerDiv = window.Calibration.pxPerMm() * unit.step;
    var branches = zero.mirrored ? [1, -1] : [zero.sign];
    var reach = geometry.length + Math.abs(zero.px);
    var count = Math.ceil(reach / pxPerDiv) + 1;
    var fontSize = Math.max(11, Math.min(17, geometry.cross * 0.045));
    var textCross = base + dir * (major + fontSize * 0.55);

    function alongAt(branch, i) {
      return zero.px + branch * i * pxPerDiv;
    }

    function onScreen(along) {
      return along >= 0 && along <= geometry.length;
    }

    branches.forEach(function (branch) {
      var i, along, tier;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (i = 0; i <= count; i++) {
        tier = unit.tiers.find(function (t) { return i % t.every === 0; });
        if (!tier) continue;
        along = alongAt(branch, i);
        if (!onScreen(along)) continue;
        line(along, base, along, base + dir * major * tier.scale);
      }

      ctx.stroke();

      /* Hauptstriche kräftiger */
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (i = 0; i <= count; i += unit.labelEvery) {
        along = alongAt(branch, i);
        if (!onScreen(along)) continue;
        line(along, base, along, base + dir * major);
      }
      ctx.stroke();

      /* Beschriftung – die Einheit steht am ersten sichtbaren Wert */
      var labelled = false;

      ctx.fillStyle = color;
      ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, sans-serif';

      for (i = unit.labelEvery; i <= count; i += unit.labelEvery) {
        along = alongAt(branch, i);
        if (along > geometry.length - fontSize * 0.7 || along < fontSize * 0.6) continue;

        var value = Math.round(i * unit.valuePerDivision * 1000) / 1000;
        var text = String(value) + (labelled ? '' : unit.suffix);
        var p = pt(along, textCross);

        if (geometry.vertical) {
          ctx.textAlign = dir > 0 ? 'left' : 'right';
          ctx.textBaseline = 'middle';
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = dir > 0 ? 'top' : 'bottom';
        }
        ctx.fillText(text, p.x, p.y);
        labelled = true;
      }
    });

    /* Die Null groß an die Skala schreiben, wenn sie im Bild liegt. */
    if (onScreen(zero.px)) {
      var zeroSize = fontSize * 1.8;
      var zeroCross = base + dir * (major + zeroSize * 0.5);
      var zp = pt(zero.px, zeroCross);

      ctx.fillStyle = css('--accent');
      ctx.font = '700 ' + zeroSize + 'px system-ui, -apple-system, sans-serif';

      if (geometry.vertical) {
        ctx.textAlign = dir > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = dir > 0 ? 'top' : 'bottom';
      }
      ctx.fillText('0', zp.x, zp.y);
    }

    /* Nulllinie entlang der Kante */
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    line(0, base, geometry.length, base);
    ctx.stroke();

  }

  /* Die Null durchgezogen über die ganze Breite – daran wird angelegt.
   * Die Messmarke ist gestrichelt, so sind beide auseinanderzuhalten. */
  function drawZeroLine() {
    var along = geometry.zero.px;
    if (along < 0 || along > geometry.length) return;

    ctx.strokeStyle = css('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    line(along, 0, along, geometry.cross);
    ctx.stroke();
  }

  function drawMarker() {
    if (markerMm === null) return;

    var along = alongOf(markerMm);
    if (along < 0 || along > geometry.length) return;

    var accent = css('--accent');

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    line(along, 0, along, geometry.cross);
    ctx.stroke();
    ctx.setLineDash([]);

    var p = pt(along, geometry.cross * 0.5);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dragging ? 14 : 12, 0, Math.PI * 2);
    ctx.fill();

    /* Zwei Rillen quer zur Skala: der Griff sieht nach Anfassen aus. */
    ctx.strokeStyle = css('--accent-ink');
    ctx.lineWidth = 1.6;
    var mid = geometry.cross * 0.5;
    ctx.beginPath();
    line(along - 3, mid - 5, along - 3, mid + 5);
    line(along + 3, mid - 5, along + 3, mid + 5);
    ctx.stroke();
  }

  function draw() {
    if (!canvas) return;
    resize();

    var cross = geometry.cross;
    var major = Math.min(cross * 0.3, 104);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    /* Dieselbe Teilung an beiden Kanten – so lässt sich von jeder Seite
     * anlegen. */
    drawScale(window.Scales.unit(), 0, 1, major, css('--text'));
    drawScale(window.Scales.unit(), cross, -1, major * 0.8, css('--text-dim'));

    drawZeroLine();
    drawMarker();
  }

  /* ---------- Anzeige der Messmarke ---------- */

  function updateReadout() {
    if (markerMm === null) {
      readout.hidden = true;
      return;
    }

    var shown = Math.abs(markerMm);
    readout.hidden = false;
    readoutMain.textContent = window.Scales.format(shown);
    readoutSub.textContent = window.Scales.formatMm(shown);
    readoutSub.hidden = false;
  }

  /* ---------- Interaktion ---------- */

  function alongFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return geometry.vertical ? event.clientY - rect.top : event.clientX - rect.left;
  }

  function setMarker(along) {
    markerMm = mmOf(Math.max(0, Math.min(geometry.length, along)));
    hint.classList.add('is-hidden');
    updateReadout();
    schedule();
  }

  /* Beim Ziehen höchstens einmal je Bild zeichnen. */
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = null;
      draw();
    });
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', function (event) {
      var along = alongFromEvent(event);
      var handle = markerMm === null ? null : alongOf(markerMm);

      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      /* Bedienelemente zurücknehmen, damit sie die Skala nicht verdecken. */
      document.body.classList.add('is-measuring');

      /* Dicht an der Marke wird sie angefasst, sonst springt sie hierher. */
      if (handle === null || Math.abs(along - handle) > GRAB_PX) setMarker(along);
    });

    canvas.addEventListener('pointermove', function (event) {
      if (dragging) setMarker(alongFromEvent(event));
    });

    ['pointerup', 'pointercancel'].forEach(function (type) {
      canvas.addEventListener(type, function () {
        dragging = false;
        document.body.classList.remove('is-measuring');
      });
    });
  }

  /* ---------- Öffentlich ---------- */

  function init() {
    canvas = document.getElementById('ruler-canvas');
    ctx = canvas.getContext('2d');
    readout = document.getElementById('readout');
    readoutMain = document.getElementById('readout-main');
    readoutSub = document.getElementById('readout-sub');
    hint = document.getElementById('ruler-hint');
    bindPointer();
  }

  function refresh() {
    updateReadout();
    draw();
  }

  return {
    init: init,
    draw: draw,
    refresh: refresh,
    clearMarker: function () { markerMm = null; refresh(); }
  };
})();
