/* Die Prüfungen. Jede bekommt eine frische Seite mit festem Maßstab, damit
 * die Erwartungswerte nicht am erkannten Gerät hängen.
 *
 * Geprüft wird, was sich nachrechnen lässt: Maße in der Zeichenfläche,
 * Umrechnungen und die Anordnung. Was das Handy ausmacht – ob ein Bohrer
 * wirklich in den Schlitz passt, ob 425 ppi für dieses Display stimmen, ob
 * das Vibrieren durchkommt – kann hier nichts sehen. */
'use strict';

const lib = require('./lib');

const PX_PER_MM = 5.5;          /* fester Maßstab für alle Prüfungen */
const BREITE = 360;
const HOEHE = 780;

/* ---------- Messhelfer, laufen in der Seite ---------- */

/* Schwerpunkte der gezeichneten Striche entlang einer Linie. Der Schwerpunkt
 * ist gegen Kantenglättung unempfindlich, die reine Trefferzählung nicht. */
const MESSEN = function (auftrag) {
  const c = document.getElementById(auftrag.canvas);
  const g = c.getContext('2d');
  const dpr = window.devicePixelRatio;
  const quer = auftrag.richtung === 'quer';

  const x0 = Math.round((auftrag.x0 || 0) * dpr);
  const y0 = Math.round((auftrag.y0 || 0) * dpr);
  const breite = quer ? Math.round(auftrag.laenge * dpr) : 1;
  const hoehe = quer ? 1 : Math.round(auftrag.laenge * dpr);
  if (breite < 1 || hoehe < 1) return [];

  const d = g.getImageData(x0, y0, breite, hoehe).data;
  const zahl = quer ? breite : hoehe;
  const treffer = [];
  let summe = 0, gewicht = 0, offen = false;

  for (let i = 0; i <= zahl; i++) {
    const a = i < zahl ? d[i * 4 + 3] / 255 : 0;
    if (a > 0.02) { summe += i * a; gewicht += a; offen = true; }
    else if (offen) { treffer.push(summe / gewicht / dpr); summe = 0; gewicht = 0; offen = false; }
  }

  return treffer;
};

/* ---------- gemeinsame Handgriffe ---------- */

async function messen(page, auftrag) {
  return page.evaluate(MESSEN, auftrag);
}

async function inAnsicht(page, name) {
  await page.click('.tab[data-view="' + name + '"]');
  await page.waitForTimeout(120);
}

async function lage(page, beta, gamma) {
  await page.evaluate(function (werte) {
    for (let i = 0; i < 90; i++) {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {
        beta: werte[0], gamma: werte[1], alpha: 0
      }));
    }
  }, [beta, gamma]);
  await page.waitForTimeout(120);
}

function zahl(text) {
  return parseFloat(String(text).replace(/[^0-9,.-]/g, '').replace(',', '.'));
}

/* ---------- Lineal ---------- */

async function linealNullpunkte(page, t) {
  await page.evaluate(function () {
    localStorage.setItem('zollstock.edge.v2', JSON.stringify({ active: 'top', edges: { top: 7.5, bottom: 15 } }));
  });

  const y = 300;
  const faelle = [
    ['top-edge', y / PX_PER_MM + 7.5],
    ['top', y / PX_PER_MM],
    ['bottom', (HOEHE - y) / PX_PER_MM],
    ['bottom-edge', (HOEHE - y) / PX_PER_MM + 15]
  ];

  for (const [key, sollMm] of faelle) {
    await page.evaluate(function (k) {
      localStorage.setItem('zollstock.scales.v1', JSON.stringify({ zero: k }));
    }, key);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(120);

    await page.mouse.click(BREITE / 2, y);
    await page.waitForTimeout(80);
    const ist = zahl(await page.textContent('#readout-main')) * 10;
    /* Die Anzeige rundet auf Millimeter – mehr Genauigkeit ist nicht drin. */
    t.nahe(ist, sollMm, 0.6, 'Nullpunkt ' + key);
  }
}

/* Welche Gerätekante an welchem Ende des Lineals liegt, hängt an der Drehung
 * des Bildes. Bei 180° und 270° liegt dort die Unterkante – sonst rechnet die
 * Skala mit dem Rand der falschen Kante. */
async function linealDrehung(page, t) {
  await page.evaluate(function () {
    localStorage.setItem('zollstock.edge.v2', JSON.stringify({ active: 'top', edges: { top: 7.5, bottom: 15 } }));
    localStorage.setItem('zollstock.scales.v1', JSON.stringify({ zero: 'top-edge' }));
  });

  /* Die Skala liest ihren Zustand beim Laden – also einmal neu laden. */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(120);

  const faelle = [
    [0, BREITE, HOEHE, 7.5, 'Hochformat: Oberkante'],
    [90, HOEHE, BREITE, 7.5, 'Querformat 90°: Oberkante links'],
    [270, HOEHE, BREITE, 15, 'Querformat 270°: Unterkante links'],
    [180, BREITE, HOEHE, 15, 'Hochformat auf dem Kopf: Unterkante oben']
  ];

  for (const [winkel, breite, hoehe, sollRand, was] of faelle) {
    await page.setViewportSize({ width: breite, height: hoehe });
    /* Von 90° auf 270° bleibt die Fläche gleich groß – ohne das Ereignis
     * merkt die Ansicht nichts davon, so wie auf dem Gerät auch. */
    await page.evaluate(function (w) {
      screen.orientation.angle = w;
      window.dispatchEvent(new Event('orientationchange'));
    }, winkel);
    await page.waitForTimeout(220);

    /* 300 Bildpunkte vom Anfang des Lineals entfernt antippen. */
    const laengs = 300;
    const quer = (breite < hoehe ? breite : hoehe) / 2;
    await page.mouse.click(breite < hoehe ? quer : laengs, breite < hoehe ? laengs : quer);
    await page.waitForTimeout(100);

    const ist = zahl(await page.textContent('#readout-main')) * 10;
    t.nahe(ist, laengs / PX_PER_MM + sollRand, 0.6, was);
  }

  await page.setViewportSize({ width: BREITE, height: HOEHE });
}

/* ---------- Lehre ---------- */

async function schlitze(page, t) {
  await inAnsicht(page, 'gauge');

  for (const satz of ['drill', 'screw', 'wrench']) {
    await page.click('[data-gauge="' + satz + '"]');
    await page.waitForTimeout(150);

    const zeilen = await page.evaluate(function () { return window.Gauge.rows(); });
    let schlimmste = 0;
    let wo = '';

    for (const zeile of zeilen) {
      const treffer = await messen(page, {
        canvas: 'gauge-canvas', richtung: 'laengs',
        x0: 20, y0: zeile.top, laenge: zeile.bottom - zeile.top
      });
      if (treffer.length !== 2) { schlimmste = Infinity; wo = zeile.label + ' (nicht messbar)'; break; }

      /* Die Striche stehen außerhalb des Nennmaßes: Mitte zu Mitte ist das
       * Maß plus einer Strichbreite. */
      const ist = (treffer[1] - treffer[0] - 2) / PX_PER_MM;
      const ab = Math.abs(ist - zeile.mm);
      if (ab > schlimmste) { schlimmste = ab; wo = zeile.label; }
    }

    t.nahe(schlimmste, 0, 0.05, 'Schlitze ' + satz + ' (' + zeilen.length + ' Maße, schlechtestes ' + wo + ')');
  }
}

/* Die Nebenzeilen der Bohrer dürfen den Schlitz nicht zu kurz drücken – er
 * muss lang genug bleiben, um einen Bohrer anzulegen. */
async function bohrerZeilen(page, t) {
  await inAnsicht(page, 'gauge');
  await page.click('[data-gauge="drill"]');
  await page.waitForTimeout(150);

  const zeilen = await page.evaluate(function () { return window.Gauge.rows(); });
  const sechs = zeilen.filter(function (z) { return z.mm === 6; })[0];
  const sechzehn = zeilen.filter(function (z) { return z.mm === 16; })[0];

  await page.mouse.click(BREITE / 2, (sechs.top + sechs.bottom) / 2 - await scrollStand(page));
  await page.waitForTimeout(100);
  t.gleich((await page.textContent('#gauge-main')).trim(), '6 mm', 'Bohrer 6 mm getroffen');
  t.ok((await page.textContent('#gauge-sub')).indexOf('Dübel 6') >= 0, 'Bohrer 6 mm nennt seinen Dübel');

  /* Am oberen Strich des größten Schlitzes liegt nur er selbst – seine
   * Länge ist der letzte gezeichnete Bildpunkt davor. */
  const span = sechzehn.mm * PX_PER_MM;
  const treffer = await messen(page, {
    canvas: 'gauge-canvas', richtung: 'quer',
    x0: 0, y0: (sechzehn.top + sechzehn.bottom) / 2 - span / 2 + 1, laenge: BREITE
  });
  t.ok(treffer.length >= 1 && treffer[treffer.length - 1] / PX_PER_MM > 25,
    'Schlitz bleibt lang genug zum Anlegen (' + lib.fmt(treffer[treffer.length - 1] / PX_PER_MM) + ' mm)');
}

async function scrollStand(page) {
  return page.evaluate(function () { return document.getElementById('gauge-scroll').scrollTop; });
}

async function sechskante(page, t) {
  await inAnsicht(page, 'gauge');
  await page.click('[data-gauge="hex"]');
  await page.waitForTimeout(150);

  const zeilen = await page.evaluate(function () { return window.Gauge.rows(); });
  let weite = 0, ecke = 0, wo = '';

  for (const zeile of zeilen) {
    const mitte = (zeile.top + zeile.bottom) / 2;
    /* Die Beschriftung steht in einer festen Spalte rechts – nur bis dahin
     * messen, sonst zählt die Schrift mit. */
    const treffer = await messen(page, {
      canvas: 'gauge-canvas', richtung: 'quer',
      x0: 0, y0: mitte, laenge: 10 + zeile.mm * PX_PER_MM + 8
    });
    if (treffer.length !== 2) { weite = Infinity; wo = zeile.label; break; }

    const istWeite = (treffer[1] - treffer[0]) / PX_PER_MM;
    if (Math.abs(istWeite - zeile.mm) > weite) { weite = Math.abs(istWeite - zeile.mm); wo = zeile.label; }

    /* Das Eckenmaß steht senkrecht in der Mitte des Sechskants. */
    const senkrecht = await messen(page, {
      canvas: 'gauge-canvas', richtung: 'laengs',
      x0: (treffer[0] + treffer[1]) / 2, y0: zeile.top, laenge: zeile.bottom - zeile.top
    });
    if (senkrecht.length === 2) {
      const istEcke = (senkrecht[1] - senkrecht[0]) / PX_PER_MM;
      ecke = Math.max(ecke, Math.abs(istEcke - zeile.mm * 2 / Math.sqrt(3)));
    }
  }

  t.nahe(weite, 0, 0.06, 'Sechskant, Schlüsselweite (' + zeilen.length + ' Maße, schlechtestes ' + wo + ')');
  t.nahe(ecke, 0, 0.1, 'Sechskant, Eckenmaß = Weite × 2/√3');
}

async function halbkreise(page, t) {
  await inAnsicht(page, 'gauge');

  for (const satz of ['pipe-mm', 'pipe-in']) {
    await page.click('[data-gauge="' + satz + '"]');
    await page.waitForTimeout(150);

    const zeilen = await page.evaluate(function () { return window.Gauge.rows(); });
    let schlimmste = 0;
    let wo = '';

    for (const zeile of zeilen) {
      /* Dicht am Rand liegen nur die beiden Endmarken des Durchmessers.
       * Weiter innen rückt der Bogen an sie heran und zieht den Schwerpunkt
       * mit – bei 6 mm wären das in Spalte 5 schon 0,28 mm. */
      const treffer = await messen(page, {
        canvas: 'gauge-canvas', richtung: 'laengs',
        x0: 3, y0: zeile.top, laenge: zeile.bottom - zeile.top
      });
      if (treffer.length !== 2) { schlimmste = Infinity; wo = zeile.label; break; }

      const ist = (treffer[1] - treffer[0]) / PX_PER_MM;
      const ab = Math.abs(ist - zeile.mm);
      if (ab > schlimmste) { schlimmste = ab; wo = zeile.label; }
    }

    t.nahe(schlimmste, 0, 0.12, 'Halbkreise ' + satz + ' (' + zeilen.length + ' Maße, schlechtestes ' + wo + ')');
  }
}

/* ---------- Winkelmesser ---------- */

async function winkelWerte(page, t) {
  await inAnsicht(page, 'protractor');

  /* In der Bildschirmebene dreht das Gerät nicht über gamma allein: Erst
   * senkrecht stellen (beta 90), dann um die Blickachse kippen. */
  await lage(page, 60, 90);
  let werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.main, 30, 0.2, 'Kante: 30 Grad in der Bildschirmebene');
  t.nahe(werte.tilt, 0, 0.2, 'dabei keine Kippung');

  /* Nach hinten gekippt, aber nicht gedreht. */
  await lage(page, 70, 0);
  werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.main, 0, 0.2, 'Kante bei reiner Kippung unverändert');
  t.nahe(werte.tilt, 20, 0.2, 'Kippung 20 Grad aus der Senkrechten');

  /* Gefälle: der Tangens der Abweichung von der Waagerechten. */
  await lage(page, 90 - 1.1458, 90);              /* 2 % */
  werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.flat, 1.1458, 0.05, 'Abweichung von der Waagerechten');
  t.nahe(werte.percent, 2, 0.05, '2 % Gefälle');

  /* Andersherum angelegt ergibt dasselbe Gefälle. */
  await lage(page, 90 - 178.8542, 90);
  werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(Math.abs(werte.main), 178.854, 0.05, 'Kante nahe der gestreckten Lage');
  t.nahe(werte.percent, 2, 0.05, 'dasselbe Gefälle andersherum');

  await page.click('[data-mode="surface"]');
  await page.waitForTimeout(100);

  /* Flach liegendes Gerät: beta ist hier die Neigung selbst. */
  await lage(page, 1.1458, 0);
  werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.percent, 2, 0.05, 'Fläche: 2 % Gefälle');

  /* Fläche gegen eine gemerkte Bezugsfläche. */
  await lage(page, 20, 0);
  await page.click('#btn-zero');
  await lage(page, 50, 0);
  werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.main, 30, 0.2, 'Fläche: 50 Grad gegen Bezug bei 20');
}

/* Der Fehler, der zweimal auf dem Handy landete: Die Anzeige rechnete mit der
 * falschen Werkzeugleiste und fiel in die obere Ecke zusammen. */
async function winkelPlatz(page, t) {
  await inAnsicht(page, 'protractor');
  await lage(page, 70, 0);

  const unten = await page.evaluate(function () {
    const c = document.getElementById('protractor-canvas');
    const g = c.getContext('2d');
    const dpr = window.devicePixelRatio;
    for (let y = c.height - 1; y >= 0; y--) {
      const d = g.getImageData(0, y, c.width, 1).data;
      for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 40) return y / dpr;
    }
    return -1;
  });

  const leiste = await page.evaluate(function () {
    return document.querySelector('#view-protractor .tools').getBoundingClientRect().top;
  });

  t.ok(unten > leiste - 90, 'Winkelmesser füllt die Höhe (zeichnet bis ' + Math.round(unten) + ', Leiste bei ' + Math.round(leiste) + ')');
}

async function winkelStups(page, t) {
  await inAnsicht(page, 'protractor');

  const stupse = async function (beta, gamma) {
    await lage(page, beta, gamma);
    return page.evaluate(function () { const b = window.__stups.slice(); window.__stups.length = 0; return b; });
  };

  t.ok((await stupse(90, 0)).length > 0, 'Stups auf der Null');
  t.gleich((await stupse(90, 0)).length, 0, 'kein zweiter Stups ohne Wechsel');
  await stupse(70, 90);                                  /* 20 Grad, dazwischen */
  t.ok((await stupse(45, 90)).length > 0, 'Stups auf der 45er-Marke');
}

/* ---------- Gerätekante ---------- */

/* Der zweite Fehler vom Handy: Bei der Unterkante endete die Messfläche über
 * der Bedienleiste, die Linie kam nie ans Kartenende. */
async function kanteMessen(page, t) {
  for (const seite of ['top', 'bottom']) {
    await page.click('#btn-calibrate');
    await page.waitForTimeout(120);
    await page.click('[data-edge-side="' + seite + '"]');
    await page.waitForTimeout(80);
    await page.click('#edge-measure');
    await page.waitForTimeout(200);

    const flaeche = await page.evaluate(function () {
      const r = document.getElementById('edgeview-stage').getBoundingClientRect();
      return { oben: r.top, unten: r.bottom, seite: document.getElementById('edgeview-span').textContent };
    });

    const kante = seite === 'top' ? flaeche.oben : HOEHE - flaeche.unten;
    t.nahe(kante, 0, 1, 'Messfläche reicht an die ' + (seite === 'top' ? 'Ober' : 'Unter') + 'kante');

    /* Karte mit 6 mm Rand: ihr Ende liegt so weit von der Bildschirmkante. */
    const span = flaeche.seite.indexOf('85,6') >= 0 ? 85.6 : 53.98;
    const sichtbar = (span - 6) * PX_PER_MM;
    const y = seite === 'top' ? sichtbar : HOEHE - sichtbar;

    await page.mouse.move(BREITE / 2, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);

    t.nahe(zahl(await page.textContent('#edgeview-value')), 6, 0.3, 'Rand an der ' + (seite === 'top' ? 'Ober' : 'Unter') + 'kante');

    await page.click('#edgeview-cancel');
    await page.waitForTimeout(80);
    await page.click('.sheet__foot [data-close]');
    await page.waitForTimeout(80);
  }
}

/* ---------- Maßstabsprobe ---------- */

async function probe(page, t) {
  await page.click('#btn-calibrate');
  await page.waitForTimeout(120);
  await page.click('#cal-check-open');
  await page.waitForTimeout(200);

  t.nahe(zahl(await page.textContent('#checkview-value')), 0, 0.05, 'Probe beginnt ohne Abweichung');
  t.gleich((await page.textContent('#checkview-done')).trim(), 'Passt', 'Knopf heißt "Passt", solange nichts abweicht');

  const span = (await page.textContent('#checkview-span')).indexOf('85,6') >= 0 ? 85.6 : 53.98;
  const ziel = 26 + (span + 1.5) * PX_PER_MM;

  await page.mouse.move(BREITE / 2, ziel);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);

  t.nahe(zahl(await page.textContent('#checkview-value')), 1.5, 0.15, 'Probe zeigt die Abweichung');

  await page.click('#checkview-done');
  await page.waitForTimeout(120);

  const neu = await page.evaluate(function () { return window.Calibration.pxPerMm(); });
  t.nahe(neu, PX_PER_MM * (span + 1.5) / span, 0.01, 'Probe rechnet den Maßstab um');
}

/* ---------- Gemerktes ---------- */

async function gemerktes(page, t) {
  await inAnsicht(page, 'gauge');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return (document.querySelector('.view.is-active') || {}).id; }),
    'view-gauge', 'Ansicht überlebt das Neuladen');

  await inAnsicht(page, 'protractor');
  await lage(page, 0, 30);
  await page.click('#btn-zero');
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await lage(page, 0, 30);

  const werte = await page.evaluate(function () { return window.Protractor.values(); });
  t.nahe(werte.main, 0, 0.2, 'Nullpunkt überlebt das Neuladen');

  await page.click('#btn-zero');
  await page.waitForTimeout(100);
  t.gleich(await page.evaluate(function () { return localStorage.getItem('zollstock.protractor.v1'); }),
    null, 'Zurücksetzen räumt den Speicher');
}

/* ---------- Drehsperre ---------- */

async function drehsperre(page, t) {
  const gedrueckt = function () {
    return page.getAttribute('#btn-rotation', 'aria-pressed');
  };

  t.gleich(await page.isVisible('#btn-rotation'), true, 'Knopf da, wo die Schnittstelle da ist');
  t.gleich(await gedrueckt(), 'false', 'anfangs nicht gesperrt');

  await page.click('#btn-rotation');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return window.__sperre.slice(); }),
    ['portrait-primary'], 'sperrt auf die Lage, in der das Gerät gerade ist');
  t.gleich(await gedrueckt(), 'true', 'Knopf zeigt die Sperre');

  await page.click('#btn-rotation');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return window.__sperre.slice(); }),
    ['portrait-primary', 'frei'], 'zweiter Druck gibt wieder frei');
  t.gleich(await gedrueckt(), 'false', 'Knopf wieder aus');
}

/* Ohne die Schnittstelle – auf iOS – darf keine tote Taste stehenbleiben. */
async function drehsperreOhne(page, t) {
  await page.evaluate(function () { localStorage.setItem('__ohneSperre', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  t.gleich(await page.isVisible('#btn-rotation'), false, 'Knopf bleibt weg, wenn nichts zu sperren ist');
}

/* ---------- Heller Grund ---------- */

/* Ein gezeichneter Strich, an seiner Helligkeit erkennbar: hell auf dunklem
 * Grund, dunkel auf hellem. */
async function strichHelligkeit(page) {
  return page.evaluate(function () {
    const c = document.getElementById('gauge-canvas');
    const g = c.getContext('2d');
    const dpr = window.devicePixelRatio;
    const zeile = window.Gauge.rows()[0];
    const x = Math.round(20 * dpr);
    const von = Math.round(zeile.top * dpr);
    const d = g.getImageData(x, von, 1, Math.round((zeile.bottom - zeile.top) * dpr)).data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200) return (d[i] + d[i + 1] + d[i + 2]) / 3;
    }
    return null;
  });
}

async function hellerGrund(page, t) {
  await inAnsicht(page, 'gauge');
  const vorher = await strichHelligkeit(page);

  await page.click('#btn-theme');
  await page.waitForTimeout(200);

  t.gleich(await page.evaluate(function () { return document.documentElement.getAttribute('data-theme'); }),
    'light', 'heller Grund gesetzt');
  t.gleich(await page.evaluate(function () {
    return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }), '#ffffff', 'Grundfarbe wechselt');

  const nachher = await strichHelligkeit(page);
  t.ok(vorher > 180 && nachher !== null && nachher < 80,
    'Striche werden neu gezeichnet (hell ' + lib.fmt(vorher) + ' → dunkel ' + lib.fmt(nachher) + ')');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return document.documentElement.getAttribute('data-theme'); }),
    'light', 'heller Grund überlebt das Neuladen');
}

module.exports = {
  PX_PER_MM: PX_PER_MM,
  BREITE: BREITE,
  HOEHE: HOEHE,
  pruefungen: [
    { name: 'Lineal: Nullpunkte', lauf: linealNullpunkte },
    { name: 'Lineal: Kante beim Drehen', lauf: linealDrehung },
    { name: 'Lehre: Schlitze', lauf: schlitze },
    { name: 'Lehre: Bohrerzeilen', lauf: bohrerZeilen },
    { name: 'Lehre: Sechskante', lauf: sechskante },
    { name: 'Lehre: Halbkreise', lauf: halbkreise },
    { name: 'Winkelmesser: Werte', lauf: winkelWerte },
    { name: 'Winkelmesser: Platz', lauf: winkelPlatz },
    { name: 'Winkelmesser: Stups', lauf: winkelStups },
    { name: 'Gerätekante: messen', lauf: kanteMessen },
    { name: 'Maßstabsprobe', lauf: probe },
    { name: 'Gemerktes', lauf: gemerktes },
    { name: 'Drehsperre', lauf: drehsperre },
    { name: 'Drehsperre: ohne Schnittstelle', lauf: drehsperreOhne },
    { name: 'Heller Grund', lauf: hellerGrund }
  ]
};
