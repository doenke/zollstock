/* Lineal: zeichnet zwei Skalen in Originalgröße – eine an jeder Kante des
 * Bildschirms, jeweils in der eingestellten Einheit. */
window.Ruler = (function () {
  'use strict';

  var canvas, ctx, readout, readoutMain, readoutSub, hint;
  var markerMm = null;
  var dragging = false;
  var geometry = { vertical: true, length: 0, cross: 0 };

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
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geometry.vertical = h >= w;
    geometry.length = geometry.vertical ? h : w;
    geometry.cross = geometry.vertical ? w : h;
  }

  /* base  Querkoordinate der Nulllinie
   * dir   Richtung, in die die Striche zeigen (+1 oder -1)
   * major Länge des Hauptstrichs */
  /* Ein Teilstrich mit dem Wert v liegt bei (v − Randversatz) × Pixel je mm:
   * die Null der Skala sitzt an der Gerätekante, nicht am Bildschirmrand. */
  function alongOf(mm) {
    return (mm - window.Edge.offset()) * window.Calibration.pxPerMm();
  }

  function drawScale(unit, base, dir, major, color) {
    var pxPerMm = window.Calibration.pxPerMm();
    var offsetMm = window.Edge.offset();
    var first = Math.ceil(offsetMm / unit.step - 1e-6);
    var count = Math.floor((geometry.length / pxPerMm + offsetMm) / unit.step);
    var i, along, tier;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (i = first; i <= count; i++) {
      tier = unit.tiers.find(function (t) { return i % t.every === 0; });
      if (!tier) continue;
      along = alongOf(i * unit.step);
      line(along, base, along, base + dir * major * tier.scale);
    }

    ctx.stroke();

    /* Hauptstriche und Nulllinie kräftiger */
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = Math.ceil(first / unit.labelEvery) * unit.labelEvery; i <= count; i += unit.labelEvery) {
      along = alongOf(i * unit.step);
      line(along, base, along, base + dir * major);
    }
    line(0, base, geometry.length, base);
    ctx.stroke();

    /* Beschriftung – die Einheit steht am ersten sichtbaren Wert */
    var fontSize = Math.max(11, Math.min(17, geometry.cross * 0.045));
    var textCross = base + dir * (major + fontSize * 0.55);
    var labelled = false;

    ctx.fillStyle = color;
    ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, sans-serif';

    for (i = Math.max(unit.labelEvery, Math.ceil(first / unit.labelEvery) * unit.labelEvery);
         i <= count; i += unit.labelEvery) {
      along = alongOf(i * unit.step);
      if (along > geometry.length - fontSize * 0.7) break;
      if (along < fontSize * 0.6) continue;

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
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css('--accent-ink');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    if (!canvas) return;
    resize();

    var cross = geometry.cross;
    var major = Math.min(cross * 0.3, 104);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    drawScale(window.Scales.unit('a'), 0, 1, major, css('--text'));
    drawScale(window.Scales.unit('b'), cross, -1, major * 0.8, css('--text-dim'));

    drawMarker();
  }

  /* ---------- Anzeige der Messmarke ---------- */

  function updateReadout() {
    if (markerMm === null) {
      readout.hidden = true;
      return;
    }

    var scales = window.Scales.get();
    /* Zweite Zeile nur, wenn sie etwas hinzufügt. */
    var sub = scales.b === scales.a ? '' : window.Scales.format(scales.b, markerMm);
    if (window.Scales.hasInch()) {
      var fraction = window.Scales.fractionInch(markerMm);
      sub = sub ? sub + ' · ' + fraction : fraction;
    }

    readout.hidden = false;
    readoutMain.textContent = window.Scales.format(scales.a, markerMm);
    readoutSub.textContent = sub;
    readoutSub.hidden = !sub;
  }

  /* ---------- Interaktion ---------- */

  function setMarkerFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    var raw = geometry.vertical ? event.clientY - rect.top : event.clientX - rect.left;
    var along = Math.max(0, Math.min(geometry.length, raw));

    markerMm = window.Edge.offset() + along / window.Calibration.pxPerMm();
    hint.classList.add('is-hidden');
    updateReadout();
    draw();
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', function (event) {
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      /* Bedienelemente zurücknehmen, damit sie die Skala nicht verdecken. */
      document.body.classList.add('is-measuring');
      setMarkerFromEvent(event);
    });

    canvas.addEventListener('pointermove', function (event) {
      if (dragging) setMarkerFromEvent(event);
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
