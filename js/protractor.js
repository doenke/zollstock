/* Winkelmesser (Vorschau): Halbkreisskala in Originalgröße.
 * Die interaktive Winkelmessung folgt in einem späteren Schritt. */
window.Protractor = (function () {
  'use strict';

  var canvas, ctx;

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function polar(cx, cy, radius, deg) {
    var rad = (180 - deg) * Math.PI / 180;
    return { x: cx + Math.cos(rad) * radius, y: cy - Math.sin(rad) * radius };
  }

  function draw() {
    if (!canvas) return;

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var pxPerMm = window.Calibration.pxPerMm();
    var cx = w / 2;
    var cy = h - 130;
    /* Radius auf halbe Zentimeter abgerundet, damit die Skala auf einem
     * runden Maß endet. */
    var maxRadius = Math.min(w / 2 - 14, cy - 80);
    var radiusMm = Math.max(15, Math.floor(maxRadius / pxPerMm / 5) * 5);
    var radius = radiusMm * pxPerMm;
    /* Beschriftung nur so dicht, wie es der Bogenabstand auf dem
     * Beschriftungsradius zulässt. */
    var labelStep = radius * 0.84 * 10 * Math.PI / 180 >= 26 ? 10 : 30;
    var showInner = radius >= 180;

    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');

    /* Körper */
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();

    /* Gradteilung */
    for (var deg = 0; deg <= 180; deg++) {
      var isMajor = deg % 10 === 0;
      var isMid = deg % 5 === 0;
      var len = isMajor ? radius * 0.12 : isMid ? radius * 0.08 : radius * 0.045;
      var outer = polar(cx, cy, radius, deg);
      var inner = polar(cx, cy, radius - len, deg);

      ctx.strokeStyle = isMajor ? text : dim;
      ctx.lineWidth = isMajor ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(outer.x, outer.y);
      ctx.lineTo(inner.x, inner.y);
      ctx.stroke();
    }

    /* Beschriftung, außen 0–180°, innen gegenläufig */
    var fontSize = Math.max(10, Math.min(14, radius * 0.055));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var d = 0; d <= 180; d += labelStep) {
      var outerLabel = polar(cx, cy, radius * 0.84, d);
      ctx.fillStyle = text;
      ctx.font = '600 ' + fontSize + 'px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(d), outerLabel.x, outerLabel.y);

      if (!showInner) continue;
      var innerLabel = polar(cx, cy, radius * 0.6, d);
      ctx.fillStyle = dim;
      ctx.font = (fontSize - 1) + 'px system-ui, -apple-system, sans-serif';
      ctx.fillText(String(180 - d), innerLabel.x, innerLabel.y);
    }

    /* Mittelpunkt */
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Radius ' + (radiusMm / 10).toFixed(1).replace('.', ',') + ' cm',
      cx, cy - Math.max(26, radius * 0.16));
  }

  function init() {
    canvas = document.getElementById('protractor-canvas');
    ctx = canvas.getContext('2d');
  }

  return { init: init, draw: draw };
})();
