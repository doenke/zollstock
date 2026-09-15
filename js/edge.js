/* Randversatz: der Abstand zwischen der Kante des Geräts (oder der Hülle)
 * und dem ersten sichtbaren Bildpunkt.
 *
 * Gemessen wird wieder mit einer genormten Karte: sie liegt bündig an der
 * Gerätekante und ragt mit bekannter Länge auf den Bildschirm. Sichtbar ist
 * davon nur der Teil hinter dem Rand – der Rest steckt darunter:
 *
 *   Rand = Kartenlänge − sichtbarer Anteil
 *
 * Für Hülle und blankes Gerät gibt es je ein Profil, umschaltbar mit einem
 * Tipp auf das Schild in der Kopfzeile. */
window.Edge = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.edge.v1';
  var CARD_LONG = 85.6;      /* ISO/IEC 7810 ID-1 */
  var CARD_SHORT = 53.98;
  var MAX_MM = 30;           /* mehr als 3 cm Rand hat kein Gerät */
  var HINT_PX = 40;          /* Platz für den Hinweis unter der Linie */

  var ORDER = ['bare', 'case'];
  var state = load() || {
    active: 'bare',
    profiles: {
      bare: { name: 'Ohne Hülle', offsetMm: 0 },
      case: { name: 'Mit Hülle', offsetMm: 0 }
    }
  };

  var listeners = [];
  var els = {};
  var draft = 0;
  var cardSpan = CARD_LONG;
  var vertical = true;

  /* ---------- Speicher ---------- */

  function valid(profile) {
    return profile && typeof profile.name === 'string' &&
      isFinite(profile.offsetMm) && profile.offsetMm >= 0 && profile.offsetMm <= MAX_MM;
  }

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!parsed || !parsed.profiles) return null;
      if (!valid(parsed.profiles.bare) || !valid(parsed.profiles.case)) return null;
      if (ORDER.indexOf(parsed.active) < 0) return null;
      return parsed;
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

  function offset() { return state.profiles[state.active].offsetMm; }
  function offsetOf(profile) {
    var found = state.profiles[profile];
    return found ? found.offsetMm : 0;
  }
  function hasCase() { return state.profiles.case.offsetMm > 0; }

  function clamp(mm) { return Math.min(MAX_MM, Math.max(0, mm)); }
  function fmt(mm) { return mm.toFixed(1).replace('.', ',') + ' mm'; }

  function setOffset(mm) {
    if (!isFinite(mm)) return;
    state.profiles[state.active].offsetMm = clamp(mm);
    persist();
    render();
    emit();
  }

  function setActive(key) {
    if (!state.profiles[key] || state.active === key) return;
    state.active = key;
    persist();
    render();
    emit();
  }

  /* ---------- Oberfläche im Sheet ---------- */

  function render() {
    if (!els.profiles) return;

    els.profiles.querySelectorAll('[data-profile]').forEach(function (btn) {
      var on = btn.dataset.profile === state.active;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (document.activeElement !== els.input) els.input.value = offset().toFixed(1);
  }

  /* ---------- Vollbild-Messung ---------- */

  function linePx() {
    return Math.max(0, (cardSpan - draft) * window.Calibration.pxPerMm());
  }

  function applyDraft() {
    var px = linePx();

    els.line.style.cssText = vertical
      ? 'top:' + px + 'px;left:0;right:0;height:0;border-top:2px solid var(--accent)'
      : 'left:' + px + 'px;top:0;bottom:0;width:0;border-left:2px solid var(--accent)';

    els.hatch.style.cssText = vertical
      ? 'top:0;left:0;right:0;height:' + px + 'px'
      : 'top:0;bottom:0;left:0;width:' + px + 'px';

    els.value.textContent = fmt(draft);
    els.span.textContent = cardSpan === CARD_LONG ? 'lange Seite (85,6 mm)' : 'kurze Seite (54,0 mm)';
  }

  /* Die Karte muss neben der Bedienleiste auf den Bildschirm passen. Wie hoch
   * die Leiste ausfällt, hängt vom Umbruch ihrer Texte ab – deshalb wird die
   * Messfläche ausgemessen, statt mit einem festen Wert zu rechnen. */
  function chooseSpan() {
    /* Gemessen wird immer an der Kante, an der das Lineal seine Null hat. */
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
      profiles: document.getElementById('edge-profiles'),
      input: document.getElementById('edge-mm'),
      view: document.getElementById('edgeview'),
      stage: document.getElementById('edgeview-stage'),
      line: document.getElementById('edgeview-line'),
      hatch: document.getElementById('edgeview-hatch'),
      value: document.getElementById('edgeview-value'),
      span: document.getElementById('edgeview-span')
    };

    els.profiles.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-profile]');
      if (btn) setActive(btn.dataset.profile);
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
  }

  return {
    init: init,
    offset: offset,
    offsetOf: offsetOf,
    hasCase: hasCase,
    close: function () { els.view.hidden = true; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
