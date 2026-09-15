/* Lineal: zeichnet eine Zentimeter- und optional eine Zollskala in
 * Originalgröße entlang der längeren Bildschirmkante. */
window.Ruler = (function () {
  'use strict';

  var MM_PER_INCH = window.Devices.MM_PER_INCH;

  var canvas, ctx, readout, readoutMain, readoutSub, hint;
  var flipped = false;
  var showImperial = true;
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

  function drawScale(opts) {
    var base = opts.base;
    var dir = opts.dir;
    var pxPerUnit = opts.pxPerUnit;      /* Pixel je kleinster Teilung */
    var perLabel = opts.perLabel;        /* kleinste Teilungen je beschrifteter Einheit */
    var tiers = opts.tiers;              /* Länge je Teilungsklasse (Anteil von major) */
    var major = opts.major;
    var color = opts.color;
    var label = opts.label;
    var count = Math.floor(geometry.length / pxPerUnit);
    var i, along, len, tier;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (i = 0; i <= count; i++) {
      along = i * pxPerUnit;
      tier = tiers.find(function (t) { return i % t.every === 0; });
      if (!tier) continue;
      len = major * tier.scale;
      /* Hauptstriche etwas kräftiger: doppelt gezeichnete Linie wirkt dicker. */
      line(along, base, along, base + dir * len);
    }

    ctx.stroke();

    /* Hauptstriche verstärken */
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i <= count; i += perLabel) {
      along = i * pxPerUnit;
      line(along, base, along, base + dir * major);
    }
    ctx.stroke();

    /* Nulllinie */
    ctx.lineWidth = 2;
    ctx.beginPath();
    line(0, base, geometry.length, base);
    ctx.stroke();

    /* Beschriftung */
    if (!label) return;

    var fontSize = Math.max(11, Math.min(17, geometry.cross * 0.045));
    ctx.fillStyle = color;
    ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, sans-serif';

    var textCross = base + dir * (major + fontSize * 0.55);
    var labelStep = opts.labelStep || 1;

    for (i = perLabel; i <= count; i += perLabel) {
      var value = i / perLabel;
      if (value % labelStep !== 0) continue;
      along = i * pxPerUnit;
      if (along > geometry.length - fontSize * 0.7) break;

      var p = pt(along, textCross);
      if (geometry.vertical) {
        ctx.textAlign = dir > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = dir > 0 ? 'top' : 'bottom';
      }
      ctx.fillText(String(value) + (i === perLabel ? opts.unit : ''), p.x, p.y);
    }
  }

  function drawMarker(pxPerMm) {
    if (markerMm === null) return;

    var along = markerMm * pxPerMm;
    if (along > geometry.length) return;

    var accent = css('--accent');
    var handleCross = geometry.cross * 0.5;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    line(along, 0, along, geometry.cross);
    ctx.stroke();
    ctx.setLineDash([]);

    var p = pt(along, handleCross);
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

    var pxPerMm = window.Calibration.pxPerMm();
    var cross = geometry.cross;
    var major = Math.min(cross * 0.3, 104);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    var metricBase = flipped ? cross : 0;
    var metricDir = flipped ? -1 : 1;

    drawScale({
      base: metricBase,
      dir: metricDir,
      pxPerUnit: pxPerMm,
      perLabel: 10,
      major: major,
      color: css('--text'),
      tiers: [{ every: 10, scale: 1 }, { every: 5, scale: 0.62 }, { every: 1, scale: 0.36 }],
      label: true,
      unit: ' cm'
    });

    if (showImperial) {
      var inchPx = pxPerMm * MM_PER_INCH;
      drawScale({
        base: cross - metricBase,
        dir: -metricDir,
        pxPerUnit: inchPx / 16,
        perLabel: 16,
        major: major * 0.8,
        color: css('--text-dim'),
        tiers: [
          { every: 16, scale: 1 },
          { every: 8, scale: 0.72 },
          { every: 4, scale: 0.55 },
          { every: 2, scale: 0.4 },
          { every: 1, scale: 0.26 }
        ],
        label: true,
        unit: '″'
      });
    }

    drawMarker(pxPerMm);
  }

  /* ---------- Anzeige der Messmarke ---------- */

  function fractionInch(inch) {
    var whole = Math.floor(inch);
    var sixteenths = Math.round((inch - whole) * 16);
    if (sixteenths === 16) { whole += 1; sixteenths = 0; }
    if (sixteenths === 0) return whole + '″';

    var num = sixteenths;
    var den = 16;
    while (num % 2 === 0) { num /= 2; den /= 2; }
    return (whole ? whole + ' ' : '') + num + '/' + den + '″';
  }

  function updateReadout() {
    if (markerMm === null) {
      readout.hidden = true;
      return;
    }
    var mm = markerMm;
    var inch = mm / MM_PER_INCH;
    readout.hidden = false;
    readoutMain.textContent = (mm / 10).toFixed(1).replace('.', ',') + ' cm';
    readoutSub.textContent = Math.round(mm) + ' mm · ' +
      inch.toFixed(2).replace('.', ',') + ' in · ' + fractionInch(inch);
  }

  /* ---------- Interaktion ---------- */

  function alongFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return geometry.vertical ? event.clientY - rect.top : event.clientX - rect.left;
  }

  function setMarkerFromEvent(event) {
    var along = Math.max(0, Math.min(geometry.length, alongFromEvent(event)));
    markerMm = along / window.Calibration.pxPerMm();
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

  return {
    init: init,
    draw: draw,
    isImperial: function () { return showImperial; },
    toggleFlip: function () { flipped = !flipped; draw(); return flipped; },
    toggleImperial: function () { showImperial = !showImperial; draw(); return showImperial; },
    clearMarker: function () { markerMm = null; updateReadout(); draw(); }
  };
})();
