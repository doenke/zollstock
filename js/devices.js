/* Erkennung der physischen Bildschirmdaten.
 *
 * Das Web gibt die echte Pixeldichte nicht direkt preis. Verfügbar sind nur
 * die logische Auflösung (screen.width/height in CSS-Pixeln), devicePixelRatio
 * und – auf Android – die Modellbezeichnung. Daraus wird die Pixeldichte
 * abgeleitet.
 *
 * Zusammenhang:
 *   physische Pixel    = CSS-Pixel * devicePixelRatio
 *   CSS-Pixel pro Zoll = ppi / devicePixelRatio
 *   CSS-Pixel pro mm   = ppi / devicePixelRatio / 25.4
 *
 * Die Tabellenwerte sind Herstellerangaben. Sie sind ein guter Startwert,
 * ersetzen aber keine Kalibrierung – die hat immer Vorrang.
 */
window.Devices = (function () {
  'use strict';

  var MM_PER_INCH = 25.4;

  /* Apple meldet kein Modell, dafür sind CSS-Auflösung und Pixelverhältnis je
   * Gerät eindeutig. Schlüssel: "<kurze Seite>x<lange Seite>@<dpr>".
   * Wird nur bei iOS-Geräten herangezogen – Android-Geräte treffen sonst
   * zufällig denselben Schlüssel (ein Galaxy S23 meldet wie ein iPhone 13 mini
   * 360x780 bei dpr 3). */
  var APPLE = {
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
    '768x1024@1': { ppi: 132, name: 'iPad (1./2. Gen.)' },
    '768x1024@2': { ppi: 264, name: 'iPad / iPad Air / iPad Pro 9,7"' },
    '744x1133@2': { ppi: 326, name: 'iPad mini (6. Gen.)' },
    '810x1080@2': { ppi: 264, name: 'iPad (10,2")' },
    '820x1180@2': { ppi: 264, name: 'iPad Air (10,9")' },
    '834x1112@2': { ppi: 264, name: 'iPad Pro 10,5"' },
    '834x1194@2': { ppi: 264, name: 'iPad Pro 11"' },
    '1024x1366@2': { ppi: 264, name: 'iPad Pro 12,9"' }
  };

  /* Android nennt das Modell (SM-…, Pixel …). "px" ist die native Auflösung
   * des Panels: weicht die gemeldete davon ab – etwa weil am Gerät FHD+ statt
   * WQHD+ eingestellt ist – wird die Dichte entsprechend umgerechnet.
   * Reihenfolge zählt: längere Bezeichnungen zuerst ("Pixel 8 Pro" vor
   * "Pixel 8"). */
  var ANDROID = [
    { match: 'SM-S938', name: 'Galaxy S25 Ultra', px: 3120, ppi: 498 },
    { match: 'SM-S936', name: 'Galaxy S25+', px: 3120, ppi: 513 },
    { match: 'SM-S931', name: 'Galaxy S25', px: 2340, ppi: 416 },
    { match: 'SM-S928', name: 'Galaxy S24 Ultra', px: 3120, ppi: 505 },
    { match: 'SM-S926', name: 'Galaxy S24+', px: 3120, ppi: 513 },
    { match: 'SM-S921', name: 'Galaxy S24', px: 2340, ppi: 416 },
    { match: 'SM-S918', name: 'Galaxy S23 Ultra', px: 3088, ppi: 500 },
    { match: 'SM-S916', name: 'Galaxy S23+', px: 2340, ppi: 393 },
    { match: 'SM-S911', name: 'Galaxy S23', px: 2340, ppi: 425 },
    { match: 'SM-S908', name: 'Galaxy S22 Ultra', px: 3088, ppi: 500 },
    { match: 'SM-S906', name: 'Galaxy S22+', px: 2340, ppi: 393 },
    { match: 'SM-S901', name: 'Galaxy S22', px: 2340, ppi: 425 },
    { match: 'SM-G998', name: 'Galaxy S21 Ultra', px: 3200, ppi: 515 },
    { match: 'SM-G996', name: 'Galaxy S21+', px: 2400, ppi: 394 },
    { match: 'SM-G991', name: 'Galaxy S21', px: 2400, ppi: 421 },
    { match: 'SM-G988', name: 'Galaxy S20 Ultra', px: 3200, ppi: 511 },
    { match: 'SM-G986', name: 'Galaxy S20+', px: 3200, ppi: 525 },
    { match: 'SM-G985', name: 'Galaxy S20+', px: 3200, ppi: 525 },
    { match: 'SM-G981', name: 'Galaxy S20', px: 3200, ppi: 563 },
    { match: 'SM-G980', name: 'Galaxy S20', px: 3200, ppi: 563 },
    { match: 'SM-G975', name: 'Galaxy S10+', px: 3040, ppi: 522 },
    { match: 'SM-G973', name: 'Galaxy S10', px: 3040, ppi: 550 },
    { match: 'SM-G970', name: 'Galaxy S10e', px: 2280, ppi: 438 },
    { match: 'SM-N986', name: 'Galaxy Note 20 Ultra', px: 3088, ppi: 496 },
    { match: 'SM-N981', name: 'Galaxy Note 20', px: 2400, ppi: 393 },
    { match: 'SM-N980', name: 'Galaxy Note 20', px: 2400, ppi: 393 },
    { match: 'SM-N975', name: 'Galaxy Note 10+', px: 3040, ppi: 498 },
    { match: 'SM-N970', name: 'Galaxy Note 10', px: 2280, ppi: 401 },
    { match: 'SM-F731', name: 'Galaxy Z Flip5', px: 2640, ppi: 425 },
    { match: 'SM-F721', name: 'Galaxy Z Flip4', px: 2640, ppi: 426 },
    { match: 'SM-A556', name: 'Galaxy A55', px: 2340, ppi: 390 },
    { match: 'SM-A546', name: 'Galaxy A54', px: 2340, ppi: 403 },
    { match: 'SM-A536', name: 'Galaxy A53', px: 2400, ppi: 405 },
    { match: 'SM-A526', name: 'Galaxy A52', px: 2400, ppi: 407 },
    { match: 'SM-A525', name: 'Galaxy A52', px: 2400, ppi: 407 },
    { match: 'SM-A515', name: 'Galaxy A51', px: 2400, ppi: 405 },
    { match: 'SM-A346', name: 'Galaxy A34', px: 2340, ppi: 390 },
    { match: 'Pixel 9 Pro XL', name: 'Pixel 9 Pro XL', px: 2992, ppi: 486 },
    { match: 'Pixel 9 Pro', name: 'Pixel 9 Pro', px: 2856, ppi: 495 },
    { match: 'Pixel 9', name: 'Pixel 9', px: 2424, ppi: 422 },
    { match: 'Pixel 8 Pro', name: 'Pixel 8 Pro', px: 2992, ppi: 489 },
    { match: 'Pixel 8a', name: 'Pixel 8a', px: 2400, ppi: 430 },
    { match: 'Pixel 8', name: 'Pixel 8', px: 2400, ppi: 428 },
    { match: 'Pixel 7 Pro', name: 'Pixel 7 Pro', px: 3120, ppi: 512 },
    { match: 'Pixel 7a', name: 'Pixel 7a', px: 2400, ppi: 429 },
    { match: 'Pixel 7', name: 'Pixel 7', px: 2400, ppi: 416 },
    { match: 'Pixel 6 Pro', name: 'Pixel 6 Pro', px: 3120, ppi: 512 },
    { match: 'Pixel 6a', name: 'Pixel 6a', px: 2400, ppi: 429 },
    { match: 'Pixel 6', name: 'Pixel 6', px: 2400, ppi: 411 },
    { match: 'Pixel 5', name: 'Pixel 5', px: 2340, ppi: 432 }
  ];

  function round(value, digits) {
    var f = Math.pow(10, digits);
    return Math.round(value * f) / f;
  }

  /* Modellbezeichnung aus dem User-Agent, z. B. "Linux; Android 14; SM-S911B".
   * Chrome kürzt den User-Agent seit einiger Zeit auf "Android 10; K" – dann
   * liefert erst refine() über die Client Hints das echte Modell. */
  function modelFromUA(ua) {
    var match = /Android[^;)]*;\s*([^;)]+)/.exec(ua);
    if (!match) return null;
    var model = match[1].replace(/\s+Build.*$/i, '').trim();
    if (!model || model === 'K' || /^Android/i.test(model)) return null;
    return model;
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
      model: isAndroid ? modelFromUA(ua) : null,
      key: w + 'x' + h + '@' + round(dpr, 2)
    };
  }

  function result(pxPerMm, ppi, device, source, confidence, screen, model) {
    return {
      pxPerMm: pxPerMm,
      ppi: ppi,
      device: device,
      source: source,
      confidence: confidence,
      screen: screen,
      model: model || null
    };
  }

  function fromAndroidModel(model, s) {
    if (!model) return null;

    var normalized = String(model).toUpperCase().replace(/\s+/g, ' ').trim();
    var entry = null;

    for (var i = 0; i < ANDROID.length; i++) {
      if (normalized.indexOf(ANDROID[i].match.toUpperCase()) === 0) {
        entry = ANDROID[i];
        break;
      }
    }
    if (!entry) return null;

    /* Viele Geräte lassen sich auf eine niedrigere Auflösung stellen. Dann
     * sinkt die wirksame Dichte im selben Verhältnis. */
    var factor = s.pixelHeight / entry.px;
    if (factor < 0.5 || factor > 1.2) return null;

    var ppi = entry.ppi * factor;
    var exact = Math.abs(factor - 1) < 0.01;

    return result(ppi / s.dpr / MM_PER_INCH, ppi, entry.name, 'model',
      exact ? 'hoch' : 'mittel', s, model);
  }

  function fromScreen(s) {
    var entry = s.isIOS ? APPLE[s.key] : null;

    if (entry) {
      return result(entry.ppi / s.dpr / MM_PER_INCH, entry.ppi, entry.name,
        'apple', 'hoch', s, null);
    }

    /* Ohne Treffer bleibt nur die Konvention der Plattform: Mobilgeräte
     * skalieren CSS-Pixel auf rund 160 dpi, Desktops auf 96 dpi. */
    var assumedCssPerInch = s.isMobile ? 160 : 96;

    return result(assumedCssPerInch / MM_PER_INCH, assumedCssPerInch * s.dpr,
      null, s.isMobile ? 'mobile-default' : 'desktop-default', 'grob', s, s.model);
  }

  /* Liefert die beste sofort verfügbare Schätzung. */
  function detect() {
    var s = screenInfo();
    return fromAndroidModel(s.model, s) || fromScreen(s);
  }

  /* Nachschlag über die Client Hints: Chrome verrät das Modell nur hier und
   * nur asynchron. Liefert null, wenn sich nichts verbessert. */
  function refine() {
    var uad = navigator.userAgentData;
    var s = screenInfo();

    if (!uad || typeof uad.getHighEntropyValues !== 'function' || !s.isAndroid) {
      return Promise.resolve(null);
    }

    return uad.getHighEntropyValues(['model']).then(function (hints) {
      if (!hints || !hints.model) return null;
      s.model = hints.model;
      return fromAndroidModel(hints.model, s) ||
        result(fromScreen(s).pxPerMm, fromScreen(s).ppi, null, 'mobile-default',
          'grob', s, hints.model);
    }).catch(function () {
      return null;
    });
  }

  return {
    detect: detect,
    refine: refine,
    MM_PER_INCH: MM_PER_INCH
  };
})();
