/* Erkennung der physischen Bildschirmdaten.
 *
 * Das Web gibt die echte Pixeldichte nicht direkt preis. Verfügbar sind nur
 * die logische Auflösung (screen.width/height in CSS-Pixeln) und
 * devicePixelRatio. Daraus lässt sich die physische Auflösung berechnen und
 * über eine Gerätetabelle der tatsächlichen Pixeldichte zuordnen.
 *
 * Zusammenhang:
 *   physische Pixel   = CSS-Pixel * devicePixelRatio
 *   CSS-Pixel pro Zoll = ppi / devicePixelRatio
 *   CSS-Pixel pro mm   = ppi / devicePixelRatio / 25.4
 */
window.Devices = (function () {
  'use strict';

  var MM_PER_INCH = 25.4;

  /* Schlüssel: "<kurze Seite>x<lange Seite>@<dpr>" in CSS-Pixeln (Hochformat). */
  var TABLE = {
    /* iPhone */
    '320x480@2': { ppi: 326, name: 'iPhone 4 / 4s' },
    '320x568@2': { ppi: 326, name: 'iPhone 5 / 5s / SE (1. Gen.)' },
    '375x667@2': { ppi: 326, name: 'iPhone 6–8 / SE (2.–3. Gen.)' },
    '414x736@3': { ppi: 401, name: 'iPhone 6+–8+' },
    '375x812@3': { ppi: 458, name: 'iPhone X / XS / 11 Pro' },
    '414x896@2': { ppi: 326, name: 'iPhone XR / 11' },
    '414x896@3': { ppi: 458, name: 'iPhone XS Max / 11 Pro Max' },
    '360x780@3': { ppi: 476, name: 'iPhone 12 mini / 13 mini' },
    '390x844@3': { ppi: 460, name: 'iPhone 12 / 12 Pro / 13 / 13 Pro / 14' },
    '428x926@3': { ppi: 458, name: 'iPhone 12/13 Pro Max / 14 Plus' },
    '393x852@3': { ppi: 460, name: 'iPhone 14 Pro / 15 / 15 Pro / 16' },
    '430x932@3': { ppi: 460, name: 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max' },
    '402x874@3': { ppi: 460, name: 'iPhone 16 Pro' },
    '440x956@3': { ppi: 460, name: 'iPhone 16 Pro Max' },
    /* iPad */
    '768x1024@1': { ppi: 132, name: 'iPad (1./2. Gen.)' },
    '768x1024@2': { ppi: 264, name: 'iPad / iPad Air / iPad Pro 9,7"' },
    '744x1133@2': { ppi: 326, name: 'iPad mini (6. Gen.)' },
    '810x1080@2': { ppi: 264, name: 'iPad (10,2")' },
    '820x1180@2': { ppi: 264, name: 'iPad Air (10,9")' },
    '834x1112@2': { ppi: 264, name: 'iPad Pro 10,5"' },
    '834x1194@2': { ppi: 264, name: 'iPad Pro 11"' },
    '1024x1366@2': { ppi: 264, name: 'iPad Pro 12,9"' }
  };

  function round(value, digits) {
    var f = Math.pow(10, digits);
    return Math.round(value * f) / f;
  }

  function screenInfo() {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.min(screen.width, screen.height);
    var h = Math.max(screen.width, screen.height);
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/.test(ua);
    var isMobile = isIOS || isAndroid ||
      (navigator.maxTouchPoints > 1 && /Mobi|Tablet|Touch/.test(ua));

    return {
      dpr: dpr,
      cssWidth: w,
      cssHeight: h,
      pixelWidth: Math.round(w * dpr),
      pixelHeight: Math.round(h * dpr),
      isIOS: isIOS,
      isAndroid: isAndroid,
      isMobile: isMobile,
      key: w + 'x' + h + '@' + round(dpr, 2)
    };
  }

  /* Liefert die beste verfügbare Schätzung für CSS-Pixel pro Millimeter. */
  function detect() {
    var s = screenInfo();
    var entry = TABLE[s.key];

    if (entry) {
      return {
        pxPerMm: entry.ppi / s.dpr / MM_PER_INCH,
        ppi: entry.ppi,
        device: entry.name,
        source: 'device',
        confidence: 'hoch',
        screen: s
      };
    }

    /* Ohne Treffer bleibt nur die Konvention der Plattform:
     * Mobilgeräte skalieren CSS-Pixel auf rund 160 dpi, Desktops auf 96 dpi. */
    var assumedCssPerInch = s.isMobile ? 160 : 96;

    return {
      pxPerMm: assumedCssPerInch / MM_PER_INCH,
      ppi: assumedCssPerInch * s.dpr,
      device: null,
      source: s.isMobile ? 'mobile-default' : 'desktop-default',
      confidence: 'grob',
      screen: s
    };
  }

  return { detect: detect, screenInfo: screenInfo, MM_PER_INCH: MM_PER_INCH };
})();
