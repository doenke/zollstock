/* Skalen: welche Einheit auf welcher Bildschirmkante liegt.
 * Es werden immer zwei Skalen gezeichnet – eine je Kante. */
window.Scales = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.scales.v1';
  var MM_PER_INCH = window.Devices.MM_PER_INCH;

  /* step             Millimeter je kleinster Teilung
   * labelEvery       Teilungen zwischen zwei Beschriftungen
   * valuePerDivision Zahlenwert je Teilung
   * tiers            Strichlänge je Teilungsklasse (Anteil des Hauptstrichs) */
  var UNITS = {
    cm: {
      name: 'Zentimeter', short: 'cm', suffix: ' cm',
      step: 1, labelEvery: 10, valuePerDivision: 0.1,
      tiers: [{ every: 10, scale: 1 }, { every: 5, scale: 0.62 }, { every: 1, scale: 0.36 }]
    },
    mm: {
      name: 'Millimeter', short: 'mm', suffix: ' mm',
      step: 1, labelEvery: 10, valuePerDivision: 1,
      tiers: [{ every: 10, scale: 1 }, { every: 5, scale: 0.62 }, { every: 1, scale: 0.36 }]
    },
    in: {
      name: 'Zoll', short: 'Zoll', suffix: '″',
      step: MM_PER_INCH / 16, labelEvery: 16, valuePerDivision: 1 / 16,
      tiers: [
        { every: 16, scale: 1 }, { every: 8, scale: 0.72 }, { every: 4, scale: 0.55 },
        { every: 2, scale: 0.4 }, { every: 1, scale: 0.26 }
      ]
    }
  };

  /* Mögliche Lagen des Nullpunkts, von der einen Kante zur anderen.
   * inset: 'case'/'bare' = so weit außerhalb des Bildschirms liegt die
   * Gerätekante, 'cm' = einen Zentimeter innerhalb des Bildschirmrands. */
  var ZEROS = [
    { key: 'top-case', side: 'top', inset: 'case' },
    { key: 'top', side: 'top', inset: 'bare' },
    { key: 'top-cm', side: 'top', inset: 'cm' },
    { key: 'center', side: 'center' },
    { key: 'bottom-cm', side: 'bottom', inset: 'cm' },
    { key: 'bottom', side: 'bottom', inset: 'bare' },
    { key: 'bottom-case', side: 'bottom', inset: 'case' }
  ];

  var state = load() || { a: 'cm', b: 'in', zero: 'top' };
  var listeners = [];
  var els = {};

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!parsed || !UNITS[parsed.a] || !UNITS[parsed.b]) return null;
      var zero = ZEROS.some(function (z) { return z.key === parsed.zero; })
        ? parsed.zero : 'top';
      return { a: parsed.a, b: parsed.b, zero: zero };
    } catch (err) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Privater Modus – die Auswahl gilt dann nur für diese Sitzung. */
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /* ---------- Werte formatieren ---------- */

  function comma(value) { return String(value).replace('.', ','); }

  function format(unitKey, mm) {
    if (unitKey === 'mm') return Math.round(mm) + ' mm';
    if (unitKey === 'in') return comma((mm / MM_PER_INCH).toFixed(2)) + ' in';
    return comma((mm / 10).toFixed(1)) + ' cm';
  }

  /* Zoll als Bruch mit sechzehntel Auflösung, wie auf dem Zollstock. */
  function fractionInch(mm) {
    var inch = mm / MM_PER_INCH;
    var whole = Math.floor(inch);
    var sixteenths = Math.round((inch - whole) * 16);
    if (sixteenths === 16) { whole += 1; sixteenths = 0; }
    if (sixteenths === 0) return whole + '″';

    var num = sixteenths;
    var den = 16;
    while (num % 2 === 0) { num /= 2; den /= 2; }
    return (whole ? whole + ' ' : '') + num + '/' + den + '″';
  }

  /* ---------- Auswahl ---------- */

  function set(edge, unitKey) {
    if (!UNITS[unitKey] || state[edge] === unitKey) return;
    state[edge] = unitKey;
    persist();
    render();
    emit();
  }

  function swap() {
    var a = state.a;
    state.a = state.b;
    state.b = a;
    persist();
    render();
    emit();
  }

  /* Das Lineal läuft entlang der längeren Bildschirmkante. Läuft es senkrecht,
   * liegen seine beiden Skalen an der linken und rechten Kante, sonst oben
   * und unten. */
  function vertical() {
    return window.innerHeight >= window.innerWidth;
  }

  /* ---------- Nullpunkt ---------- */

  /* Die Hülle steht nur zur Wahl, wenn sie vermessen wurde. */
  function available() {
    var withCase = window.Edge.hasCase();
    return ZEROS.filter(function (z) { return z.inset !== 'case' || withCase; });
  }

  function zero() {
    var list = available();
    var found = list.filter(function (z) { return z.key === state.zero; })[0];
    return found || list[Math.floor(list.length / 2)];
  }

  function cycleZero() {
    var list = available();
    var index = list.indexOf(zero());
    state.zero = list[(index + 1) % list.length].key;
    persist();
    emit();
    return zero();
  }

  /* Wie die Lage heißt, hängt davon ab, wie das Lineal gerade liegt. */
  function zeroName(entry) {
    var side = entry.side === 'center'
      ? 'mittig'
      : vertical()
        ? (entry.side === 'top' ? 'oben' : 'unten')
        : (entry.side === 'top' ? 'links' : 'rechts');

    if (entry.inset === 'case') return 'Null ' + side + ', mit Hülle';
    if (entry.inset === 'cm') return 'Null ' + side + ', 1 cm vom Rand';
    return 'Null ' + side;
  }

  /* Pfeil und Kürzel für die Schaltfläche. */
  function zeroGlyph(entry) {
    var arrows = entry.side === 'center'
      ? (vertical() ? '↕' : '↔')
      : entry.side === 'top'
        ? (vertical() ? '↓' : '→')
        : (vertical() ? '↑' : '←');

    return { arrow: arrows, tag: entry.inset === 'case' ? 'H' : entry.inset === 'cm' ? '1' : '' };
  }

  function refreshLabels() {
    els.labelA.textContent = vertical() ? 'Linke Kante' : 'Obere Kante';
    els.labelB.textContent = vertical() ? 'Rechte Kante' : 'Untere Kante';
  }

  function render() {
    els.groups.forEach(function (group) {
      var edge = group.dataset.edge;
      group.querySelectorAll('[data-unit]').forEach(function (btn) {
        var on = btn.dataset.unit === state[edge];
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    refreshLabels();
  }

  function init() {
    els = {
      labelA: document.getElementById('scale-a-label'),
      labelB: document.getElementById('scale-b-label'),
      groups: Array.prototype.slice.call(document.querySelectorAll('.seg--units'))
    };

    els.groups.forEach(function (group) {
      group.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-unit]');
        if (btn) set(group.dataset.edge, btn.dataset.unit);
      });
    });

    document.getElementById('scale-swap').addEventListener('click', swap);
    window.addEventListener('resize', refreshLabels);
    render();
  }

  return {
    UNITS: UNITS,
    init: init,
    get: function () { return state; },
    unit: function (edge) { return UNITS[state[edge]]; },
    set: set,
    swap: swap,
    vertical: vertical,
    zero: zero,
    zeroName: zeroName,
    zeroGlyph: zeroGlyph,
    cycleZero: cycleZero,
    format: format,
    fractionInch: fractionInch,
    hasInch: function () { return state.a === 'in' || state.b === 'in'; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
