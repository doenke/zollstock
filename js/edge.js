/* Randversatz: der Abstand zwischen der Kante des Geräts – mit Hülle, wenn
 * eine drauf ist – und dem ersten sichtbaren Bildpunkt.
 *
 * Gemessen wird mit einer genormten Karte: sie liegt bündig an der Kante und
 * ragt mit bekannter Länge auf den Bildschirm. Sichtbar ist davon nur der
 * Teil hinter dem Rand – der Rest steckt darunter:
 *
 *   Rand = Kartenlänge − sichtbarer Anteil
 *
 * Ober- und Unterkante werden getrennt gemessen: das Display sitzt selten
 * mittig im Gehäuse, und Hüllen sind unten oft anders ausgeschnitten als
 * oben. Welche Kante gerade dran ist, sagt die Umschaltung im Sheet. */
window.Edge = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.edge.v2';
  var OLD_KEY = 'zollstock.edge.v1';
  var CARD_LONG = 85.6;      /* ISO/IEC 7810 ID-1 */
  var CARD_SHORT = 53.98;
  var MAX_MM = 30;           /* mehr als 3 cm Rand hat kein Gerät */
  var HINT_PX = 40;          /* Platz für den Hinweis neben der Linie */

  var SIDES = ['top', 'bottom'];
  var migrated = false;
  var state = load() || migrate() || {
    active: 'top',
    edges: { top: 0, bottom: 0 }
  };

  var listeners = [];
  var els = {};
  var draft = 0;
  var cardSpan = CARD_LONG;
  var vertical = true;

  /* ---------- Speicher ---------- */

  function validMm(mm) { return isFinite(mm) && mm >= 0 && mm <= MAX_MM; }

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!parsed || !parsed.edges) return null;
      if (!validMm(parsed.edges.top) || !validMm(parsed.edges.bottom)) return null;
      if (SIDES.indexOf(parsed.active) < 0) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  /* Früher gab es je ein Profil für blankes Gerät und Hülle, für alle Kanten
   * denselben Wert. Der Wert der Hülle ist der, auf den es ankommt. */
  function migrate() {
    try {
      var old = JSON.parse(localStorage.getItem(OLD_KEY));
      var mm = old && old.profiles && old.profiles.case && old.profiles.case.offsetMm;
      if (!validMm(mm) || mm <= 0) return null;
      migrated = true;
      return { active: 'top', edges: { top: mm, bottom: mm } };
    } catch (err) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Privater Modus – gilt dann nur für diese Sitzung. */
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /* ---------- Werte ---------- */

  function offset() { return state.edges[state.active]; }
  function offsetOf(side) { return validMm(state.edges[side]) ? state.edges[side] : 0; }
  function has(side) { return offsetOf(side) > 0; }

  function clamp(mm) { return Math.min(MAX_MM, Math.max(0, mm)); }
  function fmt(mm) { return mm.toFixed(1).replace('.', ',') + ' mm'; }
  function sideName(side) { return side === 'top' ? 'Oberkante' : 'Unterkante'; }

  function setOffset(mm) {
    if (!isFinite(mm)) return;
    state.edges[state.active] = clamp(mm);
    persist();
    render();
    emit();
  }

  function setActive(side) {
    if (SIDES.indexOf(side) < 0 || state.active === side) return;
    state.active = side;
    persist();
    render();
    emit();
  }

  /* ---------- Oberfläche im Sheet ---------- */

  function render() {
    if (!els.sides) return;

    els.sides.querySelectorAll('[data-edge-side]').forEach(function (btn) {
      var on = btn.dataset.edgeSide === state.active;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    els.label.textContent = 'Rand an der ' + sideName(state.active);
    if (document.activeElement !== els.input) els.input.value = offset().toFixed(1);
  }

  /* ---------- Vollbild-Messung ---------- */

  function linePx() {
    return Math.max(0, (cardSpan - draft) * window.Calibration.pxPerMm());
  }

  /* Gemessen wird an der Kante, um die es geht – die Karte liegt dort, also
   * wächst die Fläche unter ihr auch von dort. */
  function applyDraft() {
    var px = linePx();
    var far = state.active === 'bottom';
    var start = vertical ? (far ? 'bottom' : 'top') : (far ? 'right' : 'left');

    els.line.style.cssText = vertical
      ? start + ':' + px + 'px;left:0;right:0;height:0;border-top:2px solid var(--accent)'
      : start + ':' + px + 'px;top:0;bottom:0;width:0;border-left:2px solid var(--accent)';

    els.hatch.style.cssText = vertical
      ? start + ':0;left:0;right:0;height:' + px + 'px'
      : start + ':0;top:0;bottom:0;width:' + px + 'px';

    /* Der Hinweis weicht auf die andere Seite aus. */
    els.hint.style.cssText = far ? 'top:16px;bottom:auto' : '';

    els.value.textContent = fmt(draft);
    els.edge.textContent = sideName(state.active);
    els.span.textContent = cardSpan === CARD_LONG ? 'lange Seite (85,6 mm)' : 'kurze Seite (54,0 mm)';
  }

  /* Die Karte muss neben der Bedienleiste auf den Bildschirm passen. Wie hoch
   * die Leiste ausfällt, hängt vom Umbruch ihrer Texte ab – deshalb wird die
   * Messfläche ausgemessen, statt mit einem festen Wert zu rechnen. */
  function chooseSpan() {
    /* Gemessen wird immer entlang des Lineals. */
    vertical = window.Scales.vertical();
    var available = (vertical ? els.stage.clientHeight : els.stage.clientWidth) - HINT_PX;
    cardSpan = CARD_LONG * window.Calibration.pxPerMm() <= available ? CARD_LONG : CARD_SHORT;
  }

  function openMeasure() {
    /* Erst einblenden, dann messen: vorher hat die Fläche keine Größe. */
    els.view.hidden = false;
    draft = offset();
    chooseSpan();
    applyDraft();
  }

  function closeMeasure(keep) {
    if (keep) setOffset(draft);
    els.view.hidden = true;
  }

  function dragTo(event) {
    var rect = els.stage.getBoundingClientRect();
    var along = vertical ? event.clientY - rect.top : event.clientX - rect.left;
    if (state.active === 'bottom') along = (vertical ? rect.height : rect.width) - along;
    draft = clamp(cardSpan - along / window.Calibration.pxPerMm());
    applyDraft();
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
      sides: document.getElementById('edge-sides'),
      label: document.getElementById('edge-label'),
      input: document.getElementById('edge-mm'),
      view: document.getElementById('edgeview'),
      stage: document.getElementById('edgeview-stage'),
      hint: document.getElementById('edgeview-hint'),
      line: document.getElementById('edgeview-line'),
      hatch: document.getElementById('edgeview-hatch'),
      value: document.getElementById('edgeview-value'),
      edge: document.getElementById('edgeview-edge'),
      span: document.getElementById('edgeview-span')
    };

    els.sides.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-edge-side]');
      if (btn) setActive(btn.dataset.edgeSide);
    });

    els.input.addEventListener('input', function () {
      var mm = parseFloat(String(els.input.value).replace(',', '.'));
      if (isFinite(mm)) setOffset(mm);
    });

    document.getElementById('edge-measure').addEventListener('click', openMeasure);
    document.getElementById('edge-clear').addEventListener('click', function () { setOffset(0); });
    document.getElementById('edgeview-done').addEventListener('click', function () { closeMeasure(true); });
    document.getElementById('edgeview-cancel').addEventListener('click', function () { closeMeasure(false); });

    document.getElementById('edgeview-rotate').addEventListener('click', function () {
      cardSpan = cardSpan === CARD_LONG ? CARD_SHORT : CARD_LONG;
      draft = clamp(draft);
      applyDraft();
    });

    els.view.querySelectorAll('[data-nudge-edge]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        draft = clamp(draft + parseFloat(btn.dataset.nudgeEdge));
        applyDraft();
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !els.view.hidden) closeMeasure(false);
    });

    window.addEventListener('resize', function () {
      if (els.view.hidden) return;
      chooseSpan();
      applyDraft();
    });

    bindStage();
    render();
    /* Den übernommenen Wert gleich festschreiben. */
    if (migrated) { migrated = false; persist(); }
  }

  return {
    init: init,
    offset: offset,
    offsetOf: offsetOf,
    has: has,
    sideName: sideName,
    close: function () { els.view.hidden = true; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
