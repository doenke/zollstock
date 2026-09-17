/* Maßstabsprobe: prüft den eingestellten Maßstab an einer genormten Karte –
 * und korrigiert ihn gleich mit.
 *
 * Die Karte liegt bündig an einer festen Startlinie, eine zweite Linie wird
 * auf ihr anderes Ende geschoben. Damit steht der Abstand in Bildpunkten für
 * eine bekannte Länge:
 *
 *   px pro Millimeter = Abstand / Kartenlänge
 *
 * Gegenüber dem Kartenumriss ist das die genauere Handhabung: Dort müssen
 * zwei Kanten gleichzeitig zur Deckung gebracht werden, während ein Regler
 * die Größe ändert. Hier liegt eine Kante fest an, und nur das andere Ende
 * wird angefahren – dazu steht die Abweichung als Zahl daneben, so dass auch
 * ein halber Millimeter sichtbar wird. */
window.ScaleCheck = (function () {
  'use strict';

  var CARD_LONG = 85.6;      /* ISO/IEC 7810 ID-1 */
  var CARD_SHORT = 53.98;
  var START_PX = 26;         /* Abstand der Anlegekante vom Rand der Fläche */
  var HEAD_PX = 24;          /* Luft hinter dem Sollmaß – die Karte kann auch
                              * länger sein, als der Maßstab erwartet. */

  var els = {};
  var span = CARD_LONG;      /* welche Kartenseite angelegt wird */
  var vertical = true;
  var endPx = 0;             /* Ort der verschiebbaren Linie in der Fläche */

  function fmt(mm, digits) {
    var text = mm.toFixed(digits === undefined ? 1 : digits);
    if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);   /* kein "-0,0" */
    return text.replace('.', ',');
  }

  /* Der Maßstab, den die aktuelle Linienlage bedeutet. */
  function pxPerMm() { return (endPx - START_PX) / span; }

  /* Wie weit das Kartenende vom erwarteten Ort abweicht, im bisherigen Maß. */
  function offsetMm() { return (endPx - START_PX) / window.Calibration.pxPerMm() - span; }

  /* ---------- Darstellung ---------- */

  function apply() {
    var seite = vertical ? 'top' : 'left';
    var quer = vertical
      ? 'left:0;right:0;height:0;border-top:2px solid '
      : 'top:0;bottom:0;width:0;border-left:2px solid ';

    els.start.style.cssText = seite + ':' + START_PX + 'px;' + quer + 'var(--text-dim)';
    els.line.style.cssText = seite + ':' + endPx + 'px;' + quer + 'var(--accent)';

    els.hatch.style.cssText = vertical
      ? 'top:' + START_PX + 'px;left:0;right:0;height:' + (endPx - START_PX) + 'px'
      : 'left:' + START_PX + 'px;top:0;bottom:0;width:' + (endPx - START_PX) + 'px';

    var off = offsetMm();
    els.value.textContent = (off > 0 ? '+' : '') + fmt(off) + ' mm';
    els.result.textContent = fmt(pxPerMm(), 3) + ' px/mm';
    els.span.textContent = span === CARD_LONG ? 'lange Seite (85,6 mm)' : 'kurze Seite (54,0 mm)';
    /* Stimmt es, gibt es nichts zu übernehmen – das ist die gute Nachricht. */
    els.done.textContent = Math.abs(off) < 0.05 ? 'Passt' : 'Übernehmen';
  }

  /* Die Karte muss neben der Bedienleiste auf den Bildschirm passen. */
  function chooseSpan() {
    vertical = window.Scales.vertical();
    var room = (vertical ? els.stage.clientHeight : els.stage.clientWidth) - START_PX - HEAD_PX;
    span = CARD_LONG * window.Calibration.pxPerMm() <= room ? CARD_LONG : CARD_SHORT;
  }

  function open() {
    /* Erst einblenden, dann messen: vorher hat die Fläche keine Größe. */
    els.view.hidden = false;
    chooseSpan();
    endPx = START_PX + span * window.Calibration.pxPerMm();
    apply();
  }

  function close(keep) {
    if (keep) window.Calibration.apply(pxPerMm());
    els.view.hidden = true;
  }

  function moveTo(px) {
    /* Außerhalb dieser Grenzen wäre der Maßstab so falsch, dass die Karte
     * gar nicht mehr aufs Bild passt – dann hilft nur neu kalibrieren. */
    var min = START_PX + span * 1.5;
    var max = START_PX + span * 20;
    endPx = Math.min(max, Math.max(min, px));
    apply();
  }

  function dragTo(event) {
    var rect = els.stage.getBoundingClientRect();
    moveTo(vertical ? event.clientY - rect.top : event.clientX - rect.left);
  }

  function bindStage() {
    var dragging = false;

    els.stage.addEventListener('pointerdown', function (event) {
      dragging = true;
      els.stage.setPointerCapture(event.pointerId);
      dragTo(event);
    });

    els.stage.addEventListener('pointermove', function (event) {
      if (dragging) dragTo(event);
    });

    ['pointerup', 'pointercancel'].forEach(function (type) {
      els.stage.addEventListener(type, function () { dragging = false; });
    });
  }

  /* ---------- Start ---------- */

  function init() {
    els = {
      view: document.getElementById('checkview'),
      stage: document.getElementById('checkview-stage'),
      start: document.getElementById('checkview-start'),
      line: document.getElementById('checkview-line'),
      hatch: document.getElementById('checkview-hatch'),
      value: document.getElementById('checkview-value'),
      result: document.getElementById('checkview-result'),
      span: document.getElementById('checkview-span'),
      done: document.getElementById('checkview-done')
    };

    document.getElementById('cal-check-open').addEventListener('click', open);
    els.done.addEventListener('click', function () { close(true); });
    document.getElementById('checkview-cancel').addEventListener('click', function () { close(false); });

    document.getElementById('checkview-rotate').addEventListener('click', function () {
      /* Zwischen den beiden Kartenseiten umschalten, die Lage bleibt. */
      var alt = span === CARD_LONG ? CARD_SHORT : CARD_LONG;
      endPx = START_PX + (endPx - START_PX) * alt / span;
      span = alt;
      apply();
    });

    els.view.querySelectorAll('[data-nudge-check]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        moveTo(endPx + parseFloat(btn.dataset.nudgeCheck) * window.Calibration.pxPerMm());
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !els.view.hidden) close(false);
    });

    window.addEventListener('resize', function () {
      if (els.view.hidden) return;
      var mm = (endPx - START_PX) / window.Calibration.pxPerMm();
      chooseSpan();
      endPx = START_PX + mm * window.Calibration.pxPerMm();
      apply();
    });

    bindStage();
  }

  return { init: init, open: open, close: function () { els.view.hidden = true; } };
})();
