/* Skala und Nullpunkt.
 *
 * Gezeichnet wird an beiden Kanten dieselbe Zentimeterteilung. Einstellbar
 * ist nur, wo die Null liegt. */
window.Scales = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.scales.v1';

  /* step             Millimeter je kleinster Teilung
   * labelEvery       Teilungen zwischen zwei Beschriftungen
   * valuePerDivision Zahlenwert je Teilung
   * tiers            Strichlänge je Teilungsklasse (Anteil des Hauptstrichs) */
  var CM = {
    step: 1,
    labelEvery: 10,
    valuePerDivision: 0.1,
    suffix: ' cm',
    tiers: [{ every: 10, scale: 1 }, { every: 5, scale: 0.62 }, { every: 1, scale: 0.36 }]
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

  var state = load() || { zero: 'top' };
  var listeners = [];

  /* ---------- Speicher ---------- */

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!parsed) return null;
      var known = ZEROS.some(function (z) { return z.key === parsed.zero; });
      return { zero: known ? parsed.zero : 'top' };
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

  /* ---------- Werte ---------- */

  function format(mm) {
    return (mm / 10).toFixed(1).replace('.', ',') + ' cm';
  }

  function formatMm(mm) {
    return Math.round(mm) + ' mm';
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
    var arrow = entry.side === 'center'
      ? (vertical() ? '↕' : '↔')
      : entry.side === 'top'
        ? (vertical() ? '↓' : '→')
        : (vertical() ? '↑' : '←');

    return { arrow: arrow, tag: entry.inset === 'case' ? 'H' : entry.inset === 'cm' ? '1' : '' };
  }

  return {
    unit: function () { return CM; },
    format: format,
    formatMm: formatMm,
    vertical: vertical,
    zero: zero,
    zeroName: zeroName,
    zeroGlyph: zeroGlyph,
    cycleZero: cycleZero,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
