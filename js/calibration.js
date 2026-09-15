/* Kalibrierung: Ermittelt und speichert, wie viele CSS-Pixel einem
 * Millimeter auf diesem Bildschirm entsprechen. */
window.Calibration = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.calibration.v1';
  var MM_PER_INCH = window.Devices.MM_PER_INCH;
  var CARD_MM = 85.6;          /* ISO/IEC 7810 ID-1, z. B. EC-Karte */
  var CARD_HEIGHT_MM = 53.98;
  var LINE_PX = 240;           /* Referenzlinie der Methode "Linie messen" */
  var MIN = 1.5;
  var MAX = 20;

  var detected = window.Devices.detect();
  var state = load() || { pxPerMm: detected.pxPerMm, source: 'auto' };
  var listeners = [];
  var draft = state.pxPerMm;
  var cardOrientation = 'landscape';
  var els = {};

  /* ---------- Speicher ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !isFinite(parsed.pxPerMm)) return null;
      if (parsed.pxPerMm < MIN || parsed.pxPerMm > MAX) return null;
      return { pxPerMm: parsed.pxPerMm, source: parsed.source || 'manual' };
    } catch (err) {
      return null;
    }
  }

  function persist() {
    try {
      if (state.source === 'auto') localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Privater Modus o. Ä. – dann gilt die Kalibrierung nur für diese Sitzung. */
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /* ---------- Öffentliche Werte ---------- */

  function pxPerMm() { return state.pxPerMm; }
  function ppi() { return state.pxPerMm * MM_PER_INCH * (detected.screen.dpr || 1); }

  function clamp(value) { return Math.min(MAX, Math.max(MIN, value)); }

  function fmt(value, digits) {
    return value.toFixed(digits).replace('.', ',');
  }

  /* ---------- Oberfläche ---------- */

  function setDraft(value, origin) {
    draft = clamp(value);
    if (origin !== 'sheet') els.range.value = draft;
    if (origin !== 'card') els.cardRange.value = draft;

    var text = fmt(draft, 3) + ' px/mm · ' +
      Math.round(draft * MM_PER_INCH * (detected.screen.dpr || 1)) + ' ppi';
    els.out.textContent = text;
    els.cardOut.textContent = text;
    applyCardSize();
  }

  /* ---------- Vollbild-Kartenabgleich ---------- */

  function applyCardSize() {
    var long = CARD_MM * draft;
    var short = CARD_HEIGHT_MM * draft;
    var landscape = cardOrientation === 'landscape';
    els.cardShape.style.width = (landscape ? long : short) + 'px';
    els.cardShape.style.height = (landscape ? short : long) + 'px';
  }

  /* Wählt die Lage, in der die Karte vollständig auf den Bildschirm passt. */
  function chooseOrientation() {
    var availW = window.innerWidth - 40;
    var availH = window.innerHeight - 250;
    var long = CARD_MM * draft;
    var short = CARD_HEIGHT_MM * draft;

    if (long <= availW && short <= availH) cardOrientation = 'landscape';
    else if (short <= availW && long <= availH) cardOrientation = 'portrait';
    else cardOrientation = availW >= availH ? 'landscape' : 'portrait';
  }

  function openCard() {
    chooseOrientation();
    applyCardSize();
    els.cardView.hidden = false;
  }

  function closeCard() {
    els.cardView.hidden = true;
    renderFacts();
  }

  function renderFacts() {
    var s = detected.screen;
    var rows = [
      ['Auflösung', s.pixelWidth + ' × ' + s.pixelHeight + ' px'],
      ['CSS-Auflösung', s.cssWidth + ' × ' + s.cssHeight + ' px'],
      ['Pixelverhältnis', String(Math.round(s.dpr * 100) / 100) + '×'],
      ['Gerät', detected.device || 'nicht erkannt'],
      ['Automatik', fmt(detected.pxPerMm, 2) + ' px/mm (' + detected.confidence + ')'],
      ['Aktiv', fmt(state.pxPerMm, 2) + ' px/mm · ' +
        (state.source === 'auto' ? 'automatisch' : 'kalibriert')]
    ];

    els.facts.innerHTML = rows.map(function (row) {
      return '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>';
    }).join('');
  }

  function selectMethod(name) {
    Array.prototype.forEach.call(els.segButtons, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.method === name);
    });
    ['card', 'line', 'ppi'].forEach(function (key) {
      document.getElementById('method-' + key).classList.toggle('is-active', key === name);
    });
  }

  function open() {
    renderFacts();
    setDraft(state.pxPerMm);
    els.sheet.hidden = false;
  }

  function close() {
    els.sheet.hidden = true;
    els.cardView.hidden = true;
  }

  function save() {
    state = {
      pxPerMm: draft,
      source: Math.abs(draft - detected.pxPerMm) < 1e-6 ? 'auto' : 'manual'
    };
    persist();
    emit();
    close();
  }

  function reset() {
    setDraft(detected.pxPerMm);
  }

  function init() {
    els = {
      sheet: document.getElementById('sheet'),
      facts: document.getElementById('facts'),
      range: document.getElementById('cal-range'),
      out: document.getElementById('cal-out'),
      line: document.getElementById('cal-line'),
      cardView: document.getElementById('calview'),
      cardShape: document.getElementById('calview-card'),
      cardRange: document.getElementById('calview-range'),
      cardOut: document.getElementById('calview-out'),
      segButtons: document.querySelectorAll('.seg__btn')
    };

    [els.range, els.cardRange].forEach(function (range) {
      range.min = MIN;
      range.max = MAX;
    });
    els.line.style.width = LINE_PX + 'px';

    els.range.addEventListener('input', function () {
      setDraft(parseFloat(els.range.value), 'sheet');
    });

    els.cardRange.addEventListener('input', function () {
      setDraft(parseFloat(els.cardRange.value), 'card');
    });

    document.querySelectorAll('[data-nudge]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setDraft(draft + parseFloat(btn.dataset.nudge));
      });
    });

    document.getElementById('cal-card-open').addEventListener('click', openCard);
    document.getElementById('calview-done').addEventListener('click', closeCard);
    document.getElementById('calview-rotate').addEventListener('click', function () {
      cardOrientation = cardOrientation === 'landscape' ? 'portrait' : 'landscape';
      applyCardSize();
    });

    Array.prototype.forEach.call(els.segButtons, function (btn) {
      btn.addEventListener('click', function () { selectMethod(btn.dataset.method); });
    });

    document.getElementById('cal-line-apply').addEventListener('click', function () {
      var mm = parseFloat(String(document.getElementById('cal-line-mm').value).replace(',', '.'));
      if (isFinite(mm) && mm > 0) setDraft(LINE_PX / mm);
    });

    document.getElementById('cal-ppi-apply').addEventListener('click', function () {
      var value = parseFloat(String(document.getElementById('cal-ppi').value).replace(',', '.'));
      if (isFinite(value) && value > 0) {
        setDraft(value / (detected.screen.dpr || 1) / MM_PER_INCH);
      }
    });

    document.getElementById('cal-save').addEventListener('click', save);
    document.getElementById('cal-reset').addEventListener('click', reset);

    els.sheet.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!els.cardView.hidden) closeCard();
      else if (!els.sheet.hidden) close();
    });
  }

  return {
    init: init,
    open: open,
    close: close,
    pxPerMm: pxPerMm,
    ppi: ppi,
    detected: detected,
    state: function () { return state; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
