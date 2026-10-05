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
  await page.click('#btn-tools');
  await page.click('.toolcard[data-view="' + name + '"]');
  await page.waitForTimeout(120);
}

/* Zahnrad → Einstellungen. */
async function einstellungen(page) {
  await page.click('#btn-calibrate');
  await page.waitForTimeout(120);
}

/* Zahnrad → Kalibrieren. */
async function kalibrieren(page) {
  await einstellungen(page);
  await page.click('#btn-open-cal');
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

/* Die Marke sitzt an einer Stelle des Bildschirms, nicht bei einem Wert:
 * Beim Wechsel des Nullpunkts bleibt sie liegen und ihre Zahl wandert. */
async function linealMarke(page, t) {
  await page.evaluate(function () {
    localStorage.setItem('zollstock.scales.v1', JSON.stringify({ zero: 'top' }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(120);

  const y = 300;
  await page.mouse.click(BREITE / 2, y);
  await page.waitForTimeout(100);

  const ort = function () {
    return page.evaluate(function () {
      const c = document.getElementById('ruler-canvas');
      const g = c.getContext('2d');
      const dpr = window.devicePixelRatio;
      /* Die Marke ist gestrichelt – ihre Zeile hat Lücken, die durchgezogene
       * Nulllinie hat keine. */
      for (let y = 0; y < c.height; y++) {
        const d = g.getImageData(0, y, c.width, 1).data;
        let treffer = 0, luecken = 0, vorher = false;
        for (let x = 0; x < c.width; x++) {
          const da = d[x * 4 + 3] > 120 && d[x * 4] > 180 && d[x * 4 + 2] < 110;
          if (da) treffer++;
          if (!da && vorher) luecken++;
          vorher = da;
        }
        if (treffer > c.width / 4 && luecken > 8) return y / dpr;
      }
      return -1;
    });
  };

  const vorher = await ort();
  const wert = zahl(await page.textContent('#readout-main'));
  t.nahe(vorher, y, 2, 'Marke liegt, wo getippt wurde');
  t.nahe(wert * 10, y / PX_PER_MM, 0.6, 'und zeigt den Wert dieser Stelle');

  /* Nullpunkt auf "1 cm vom Rand" weiterschalten. */
  await page.click('#btn-zeropoint');
  await page.waitForTimeout(200);

  t.nahe(await ort(), y, 2, 'Marke bleibt beim Nullpunktwechsel liegen');
  t.nahe(zahl(await page.textContent('#readout-main')) * 10, y / PX_PER_MM - 10, 0.6,
    'ihre Zahl wandert um den neuen Bezug');
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
    await kalibrieren(page);
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
  await kalibrieren(page);
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
    return page.getAttribute('#btn-rotation', 'aria-checked');
  };

  t.gleich(await page.evaluate(function () { return !!document.querySelector('.topbar #btn-rotation'); }), false,
    'die Sperre steht nicht mehr in der Kopfzeile');
  await einstellungen(page);
  t.gleich(await page.isVisible('#btn-rotation'), true, 'Schalter da, wo die Schnittstelle da ist');
  t.gleich(await gedrueckt(), 'false', 'anfangs nicht gesperrt');

  await page.click('#btn-rotation');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return window.__sperre.slice(); }),
    ['portrait-primary'], 'sperrt auf die Lage, in der das Gerät gerade ist');
  t.gleich(await gedrueckt(), 'true', 'Schalter zeigt die Sperre');

  await page.click('#btn-rotation');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () { return window.__sperre.slice(); }),
    ['portrait-primary', 'frei'], 'zweiter Druck gibt wieder frei');
  t.gleich(await gedrueckt(), 'false', 'Schalter wieder aus');
}

/* Ohne die Schnittstelle – auf iOS – darf keine tote Taste stehenbleiben. */
async function drehsperreOhne(page, t) {
  await page.evaluate(function () { localStorage.setItem('__ohneSperre', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  /* Bei offenem Menü nachsehen – geschlossen wäre der Schalter ohnehin
   * unsichtbar, und die Prüfung bewiese nichts. */
  await einstellungen(page);
  t.gleich(await page.isVisible('#settings-main'), true, 'Menü ist offen');
  t.gleich(await page.isVisible('#btn-rotation'), false, 'Schalter bleibt weg, wenn nichts zu sperren ist');
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

  t.gleich(await page.evaluate(function () {
    return !!document.querySelector('.topbar #btn-theme') || !!document.querySelector('#toolsheet #btn-theme');
  }), false, 'der Schalter steht weder in der Kopfzeile noch in der Werkzeugwahl');

  await einstellungen(page);
  await page.click('#btn-theme');
  await page.waitForTimeout(200);

  t.gleich(await page.getAttribute('#btn-theme', 'aria-checked'), 'true', 'der Schalter steht auf an');
  t.gleich(await page.isVisible('#sheet'), true, 'die Einstellungen bleiben dabei offen');
  await page.keyboard.press('Escape');

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

/* ---------- Lupe ---------- */

/* Der Browser bekommt eine vorgetäuschte Kamera mitgegeben (run.js). Geprüft
 * wird nicht das Bild, sondern was sich nachhalten lässt: dass ein Strom
 * läuft, wenn die Ansicht offen ist, und dass er aufhört, wenn sie es nicht
 * mehr ist. Das Zweite ist das wichtigere – eine Kamera, die weiterläuft,
 * während man längst im Lineal misst, wäre genau das, was die
 * Datenschutzerklärung ausschließt. */

async function laeuft(page) {
  return page.evaluate(function () { return window.Loupe.running(); });
}

/* Bis die Lupe ruht: Bild läuft, und weder Vergleich noch Wechsel noch die
 * Wahl des Objektivs stehen aus. Beim ersten Öffnen öffnet sie dafür jedes
 * Objektiv einmal kurz – eine feste Pause wäre mal zu kurz, mal vergeudet. */
async function lupeBereit(page) {
  await page.waitForFunction(function () {
    return window.Loupe.running() && !window.Loupe.split().busy;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(80);
}

async function lupeStrom(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  t.gleich(await laeuft(page), true, 'Kamera läuft, sobald die Lupe offen ist');
  t.gleich(await page.isVisible('#loupe-tools'), true, 'Werkzeuge stehen da');
  t.gleich(await page.isVisible('#loupe-gate'), false, 'kein Hinweiskasten bei erteilter Freigabe');

  await inAnsicht(page, 'ruler');
  await page.waitForTimeout(200);
  t.gleich(await laeuft(page), false, 'Kamera aus, sobald das Lineal übernimmt');

  await inAnsicht(page, 'loupe');
  await lupeBereit(page);
  t.gleich(await laeuft(page), true, 'und beim Zurückkommen wieder an');

  /* Weggelegt heißt aus, ohne dass die Ansicht wechselt. */
  await page.evaluate(function () {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  t.gleich(await laeuft(page), false, 'Kamera aus, wenn die App weggelegt wird');
}

/* Das Standbild hält fest, was gerade im Bild war – und zwar so groß, wie es
 * im Bild war. Ohne diese Unterscheidung spränge es beim Einfrieren auf 1×
 * zurück, weil der festgehaltene Rahmen den rechnerischen Zoom nicht enthält. */
async function lupeStandbild(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  await schieber(page, 4);
  t.gleich(await skala(page, 'loupe-video'), 4, 'der Schieber vergrößert das laufende Bild');

  await page.click('#btn-freeze');
  await page.waitForTimeout(200);

  const bild = await page.evaluate(function () {
    const c = document.getElementById('loupe-still');
    const v = document.getElementById('loupe-video');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let summe = 0;
    for (let i = 0; i < d.length; i += 4000) summe += d[i] + d[i + 1] + d[i + 2];
    return {
      steht: !c.hidden && v.hidden,
      inhalt: summe > 0,
      voll: c.width === v.videoWidth && c.height === v.videoHeight
    };
  });

  t.gleich(bild.steht, true, 'das Standbild übernimmt, das laufende Bild tritt ab');
  t.gleich(bild.inhalt, true, 'und es steht wirklich etwas darauf');
  t.gleich(bild.voll, true, 'festgehalten in der vollen Auflösung der Kamera');
  t.gleich(await skala(page, 'loupe-still'), 4, 'ohne Sprung: so groß wie vorher das laufende Bild');
  t.ok((await page.isVisible('#loupe-info')) &&
    (await page.textContent('#loupe-info-text')).indexOf('verschieben') >= 0,
    'im Standbild steht, wie es sich bedienen lässt');

  await schieber(page, 8);
  t.gleich(await skala(page, 'loupe-still'), 8, 'im Standbild geht es weiter hinein');

  /* Weiter, als das laufende Bild geht: bis zum Vierfachen dessen, was beim
   * Einfrieren zu sehen war. */
  await schieber(page, 30);
  t.gleich(await page.textContent('#loupe-zoom-out'), '16,0×', 'im Standbild bis zum Vierfachen, hier 16×');
  t.gleich(await skala(page, 'loupe-still'), 16, 'und so groß ist es dann auch');

  await page.click('#btn-freeze');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () {
    const c = document.getElementById('loupe-still');
    return c.hidden && !document.getElementById('loupe-video').hidden;
  }), true, 'und wieder zurück zum laufenden Bild');
  t.gleich(await page.textContent('#loupe-zoom-out'), '4,0×', 'mit dem Zoom von vor dem Einfrieren');
}

/* Finger auf der Bühne, als Zeigerereignisse nachgestellt: Playwright hat
 * nur eine Maus, für zwei Finger braucht es zwei Zeiger. */
async function finger(page, art, id, x, y) {
  await page.evaluate(function (e) {
    document.getElementById('loupe-stage').dispatchEvent(new PointerEvent(e.art, {
      pointerId: e.id, clientX: e.x, clientY: e.y, bubbles: true, isPrimary: e.id === 1
    }));
  }, { art: art, id: id, x: x, y: y });
}

async function stand(page) {
  return page.evaluate(function () { return window.Loupe.split(); });
}

/* Ein Finger verschiebt das Standbild, aber nur so weit, dass es den Rahmen
 * noch füllt. Zwei Finger vergrößern um den Punkt zwischen ihnen herum:
 * Was beim Aufsetzen dort lag, liegt hinterher immer noch dort. */
async function lupeVerschieben(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);
  await schieber(page, 2);
  await page.click('#btn-freeze');
  await page.waitForTimeout(150);

  const mitte = BREITE / 2;

  await finger(page, 'pointerdown', 1, 300, 400);
  await finger(page, 'pointermove', 1, -700, 400);
  await finger(page, 'pointerup', 1, -700, 400);

  let s = await stand(page);
  t.gleich(s.pan.x, -mitte * (2 - 1), 'ein Finger verschiebt – bis zum Rand und nicht weiter');
  t.ok(/translate\(-180px/.test(await page.evaluate(function () {
    return document.getElementById('loupe-still').style.transform;
  })), 'und das Bild folgt');

  /* Bildpunkt unter der Fingermitte, in Koordinaten des Standbilds. */
  const unterFingern = function (zustand, mx) { return (mx - zustand.pan.x) / zustand.zoom; };
  const mx = 40;  /* Fingermitte 40 px rechts der Bildmitte */
  const vorher = unterFingern(s, mx);

  await finger(page, 'pointerdown', 1, mitte + mx - 30, 400);
  await finger(page, 'pointerdown', 2, mitte + mx + 30, 400);
  await finger(page, 'pointermove', 1, mitte + mx - 60, 400);
  await finger(page, 'pointermove', 2, mitte + mx + 60, 400);
  await finger(page, 'pointerup', 1, mitte + mx - 60, 400);
  await finger(page, 'pointerup', 2, mitte + mx + 60, 400);

  s = await stand(page);
  t.gleich(s.zoom, 4, 'doppelter Fingerabstand, doppelte Vergrößerung');
  t.nahe(unterFingern(s, mx), vorher, 0.001, 'was zwischen den Fingern lag, liegt dort noch');
}

async function lupeOhneFreigabe(page, t) {
  await page.evaluate(function () { localStorage.setItem('__kameraAus', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  await inAnsicht(page, 'loupe');
  await page.waitForTimeout(400);

  t.gleich(await laeuft(page), false, 'kein Datenstrom ohne Freigabe');
  t.gleich(await page.isVisible('#loupe-gate'), true, 'der Hinweiskasten steht da');
  t.gleich(await page.isVisible('#loupe-tools'), false, 'Werkzeuge, die nichts bedienen, bleiben weg');
  t.ok((await page.textContent('#loupe-gate-text')).indexOf('abgelehnt') >= 0,
    'und sagt, dass die Freigabe fehlt');
}

async function schieber(page, wert) {
  await page.evaluate(function (w) {
    const r = document.getElementById('loupe-zoom');
    r.value = String(w);
    r.dispatchEvent(new Event('input'));
  }, wert);
}

/* Der Vergrößerungsfaktor aus der Transformation eines Bildes. */
async function skala(page, id) {
  return page.evaluate(function (i) {
    const m = /scale\(([\d.]+)\)/.exec(document.getElementById(i).style.transform);
    return m ? parseFloat(m[1]) : null;
  }, id);
}

/* Mit 1× ist eine Lupe keine: Beim ersten Mal geht es bei 3× los, danach
 * beim Wert vom letzten Mal – auch nach einem Wechsel und nach Neuladen. */
async function lupeStartwert(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  t.gleich(await page.textContent('#loupe-zoom-out'), '3,0×', 'beim ersten Mal 3×');
  t.gleich(await skala(page, 'loupe-video'), 3, 'und so groß ist das Bild auch');

  await schieber(page, 5);
  await inAnsicht(page, 'ruler');
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);
  t.gleich(await page.textContent('#loupe-zoom-out'), '5,0×', 'nach dem Wechsel bleibt es bei 5×');

  await page.reload({ waitUntil: 'networkidle' });
  await lupeBereit(page);
  t.gleich(await page.textContent('#loupe-zoom-out'), '5,0×', 'und auch nach dem Neuladen');
  t.gleich(await page.isVisible('#loupe-info'), false, 'im laufenden Bild steht keine Zeile über dem Schieber');

  /* Bis zur Objektivwahl stand der Zoom als bloße Zahl unter einem anderen
   * Schlüssel. Der Wert soll den Umzug überstehen. */
  await page.evaluate(function () {
    localStorage.removeItem('zollstock.loupe.v2');
    localStorage.setItem('zollstock.loupe.v1', '6');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await lupeBereit(page);
  t.gleich(await page.textContent('#loupe-zoom-out'), '6,0×', 'der alte gemerkte Zoom gilt weiter');
  t.gleich(await page.evaluate(function () { return localStorage.getItem('zollstock.loupe.v1'); }),
    null, 'und der alte Eintrag ist aufgeräumt');
}

/* Eine Kamera, die selbst bis 4× zoomt. Die Zahl am Schieber ist die
 * Vergrößerung, die man sieht: bis 4× macht die Kamera alles, darüber wird
 * nur der Rest gerechnet. */
async function lupeKamerazoom(page, t) {
  await page.evaluate(function () { localStorage.setItem('__kameraZoom', '4'); });
  await page.reload({ waitUntil: 'networkidle' });
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  const bestellt = function () { return page.evaluate(function () { return window.__zoom[window.__zoom.length - 1]; }); };

  t.gleich(await bestellt(), 3, 'bei 3× zoomt die Kamera genau 3×');
  t.gleich(await skala(page, 'loupe-video'), 1, 'und es wird nichts dazugerechnet');

  await schieber(page, 6);
  t.gleich(await bestellt(), 4, 'bei 6× zoomt die Kamera so weit sie kann');
  t.gleich(await skala(page, 'loupe-video'), 1.5, 'und nur der Rest wird gerechnet');

  await page.click('#btn-freeze');
  await page.waitForTimeout(200);
  t.gleich(await skala(page, 'loupe-still'), 1.5, 'das Standbild bleibt so groß');

  await schieber(page, 2);
  t.gleich(await page.textContent('#loupe-zoom-out'), '4,0×',
    'im Standbild geht es nicht unter das, was die Kamera schon gezoomt hatte');
}

/* Der Browser bekommt drei vorgetäuschte Kameras (run.js). Jedes Objektiv
 * merkt sich seinen eigenen Zoom – 3× am Tele ist etwas anderes als 3× an
 * der Hauptkamera – und das gewählte bleibt gewählt. */
async function lupeObjektive(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  let s = await stand(page);
  const knoepfe = function () {
    return page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('#loupe-lenses .seg__btn'), function (b) {
        return { id: b.dataset.lens, an: b.classList.contains('is-active') };
      });
    });
  };

  t.gleich(s.lenses.length, 3, 'drei Objektive gefunden');
  t.gleich(await page.isVisible('#loupe-lenses'), true, 'die Auswahl steht da');
  let k = await knoepfe();
  t.gleich(k.filter(function (b) { return b.an; }).map(function (b) { return b.id; }), [s.lens],
    'das offene Objektiv ist markiert');

  const drittes = s.lenses[2];
  await page.click('#loupe-lenses .seg__btn[data-lens="' + drittes + '"]');
  await lupeBereit(page);

  s = await stand(page);
  t.gleich(s.lens, drittes, 'ein Druck öffnet das gewählte Objektiv');
  t.gleich(await laeuft(page), true, 'und das Bild läuft');
  t.gleich(await page.isVisible('#loupe-tools'), true, 'die Werkzeuge bleiben dabei stehen');

  await schieber(page, 6);
  await page.click('#loupe-lenses .seg__btn[data-lens="' + s.lenses[0] + '"]');
  await lupeBereit(page);
  t.gleich(await page.textContent('#loupe-zoom-out'), '3,0×', 'das erste Objektiv hat seinen eigenen Zoom');

  await page.click('#loupe-lenses .seg__btn[data-lens="' + drittes + '"]');
  await lupeBereit(page);
  t.gleich(await page.textContent('#loupe-zoom-out'), '6,0×', 'das dritte seinen');

  /* Getippt gilt nur bis zum Verlassen: Neu geöffnet beginnt die Lupe beim
   * Objektiv mit dem größten Zoom – hier zoomt keines selbst, also beim
   * ersten. */
  await page.reload({ waitUntil: 'networkidle' });
  await lupeBereit(page);
  s = await stand(page);
  t.gleich(s.lens, s.lenses[0], 'neu geöffnet bei Gleichstand das erste Objektiv');
  t.gleich(await page.textContent('#loupe-zoom-out'), '3,0×', 'mit seinem Zoom');

  await page.click('#btn-freeze');
  await page.waitForTimeout(150);
  t.gleich(await page.evaluate(function () {
    return Array.prototype.every.call(document.querySelectorAll('#loupe-lenses .seg__btn'), function (b) { return b.disabled; });
  }), true, 'im Standbild lässt sich das Objektiv nicht wechseln');
}

/* Drei Kameras, die selbst verschieden weit zoomen: 2×, 6× und 4×. Beim
 * ersten Öffnen werden alle einmal kurz geöffnet und verglichen, die mit 6×
 * gewinnt. Ab dann ist das bekannt – beim nächsten Öffnen geht sie sofort
 * auf, ohne Umweg über die anderen. Von Hand getippt gilt nur, bis die
 * Lupe verlassen wird. */
async function lupeWeitestesObjektiv(page, t) {
  await page.evaluate(function () { localStorage.setItem('__reichweite', '[2, 6, 4]'); });
  await page.reload({ waitUntil: 'networkidle' });
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  let s = await stand(page);
  const label = function () {
    return page.evaluate(function () {
      return document.getElementById('loupe-video').srcObject.getVideoTracks()[0].label;
    });
  };
  t.gleich(await label(), 'fake_device_1', 'das Objektiv mit dem größten Zoom (6×) ist offen');
  t.gleich(await page.evaluate(function () {
    const b = document.querySelector('#loupe-lenses .seg__btn.is-active');
    return b ? b.dataset.lens : null;
  }), s.lens, 'und in der Auswahl markiert');
  t.gleich(await page.evaluate(function () {
    return Object.keys(JSON.parse(localStorage.getItem('zollstock.loupe.v2')).reach).length;
  }), 3, 'die Reichweite aller drei ist gemerkt');

  /* Von Hand ein anderes – das gilt, bis die Lupe verlassen wird. */
  await page.click('#loupe-lenses .seg__btn[data-lens="' + s.lenses[2] + '"]');
  await lupeBereit(page);
  t.gleich(await label(), 'fake_device_2', 'von Hand gewählt');

  await inAnsicht(page, 'ruler');
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);
  t.gleich(await label(), 'fake_device_1', 'neu geöffnet wieder das weiteste');

  /* Beim nächsten Start ist alles bekannt: ein einziges Öffnen. */
  await page.reload({ waitUntil: 'networkidle' });
  await lupeBereit(page);
  t.gleich(await label(), 'fake_device_1', 'nach dem Neuladen gleich das weiteste');
  t.gleich(await page.evaluate(function () { return window.__gum; }), 1,
    'und dafür nur eine Kamera geöffnet, ohne Umweg');
}

/* Die vorgetäuschten Kameras haben keine Lampe. Der Knopf steht trotzdem
 * da – blasser –, und ein Druck sagt, warum nichts angeht, statt
 * stillschweigend nichts zu tun. */
async function lupeLicht(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  t.gleich(await page.isVisible('#btn-torch'), true, 'der Lichtschalter steht da');
  t.gleich(await page.evaluate(function () {
    return document.getElementById('btn-torch').classList.contains('is-unsure');
  }), true, 'blasser, weil die Kamera keine Lampe meldet');

  await page.click('#btn-torch');
  await page.waitForTimeout(300);
  t.ok((await page.textContent('#loupe-info-text')).indexOf('Lampe nicht frei') >= 0,
    'ein Druck sagt, dass die Lampe nicht freigegeben ist');
  t.gleich(await page.getAttribute('#btn-torch', 'aria-pressed'), 'false', 'und der Schalter steht nicht auf an');
}

/* Im Standbild leuchtet die Lampe nichts mehr aus: Sie geht beim Einfrieren
 * aus, der Schalter verschwindet, und mit „Weiter“ ist beides wieder da. */
async function lupeLichtImStandbild(page, t) {
  await page.evaluate(function () { localStorage.setItem('__lampe', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  const lampe = function () { return page.evaluate(function () { return window.__lampe.slice(); }); };

  await page.click('#btn-torch');
  await page.waitForTimeout(150);
  t.gleich(await lampe(), [true], 'Licht an');

  await page.click('#btn-freeze');
  await page.waitForTimeout(150);
  t.gleich(await lampe(), [true, false], 'beim Einfrieren geht es aus');
  t.gleich(await page.isVisible('#btn-torch'), false, 'und der Schalter verschwindet');

  await page.click('#btn-freeze');
  await page.waitForTimeout(150);
  t.gleich(await lampe(), [true, false, true], 'mit „Weiter“ wieder an');
  t.gleich(await page.getAttribute('#btn-torch', 'aria-pressed'), 'true', 'und der Schalter zeigt es');
}

/* Kontrast gilt für das laufende Bild und das Standbild, Relief nur für das
 * Standbild. Relief macht das Bild grau und verändert es – und beim
 * Ausschalten muss genau das Original zurückkommen, nicht eine Näherung. */
async function lupeKontrast(page, t) {
  await inAnsicht(page, 'loupe');
  await lupeBereit(page);

  const filter = function (id) {
    return page.evaluate(function (i) { return document.getElementById(i).style.filter; }, id);
  };
  const fingerabdruck = function () {
    return page.evaluate(function () {
      const c = document.getElementById('loupe-still');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0, grau = true;
      for (let i = 0; i < d.length; i += 4 * 997) {
        h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) >>> 0;
        if (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2]) grau = false;
      }
      return { h: h, grau: grau };
    });
  };

  t.gleich(await page.isVisible('#btn-relief'), false, 'Relief gibt es im laufenden Bild nicht');

  await page.click('#btn-contrast');
  t.ok((await filter('loupe-video')).indexOf('contrast') >= 0, 'Kontrast wirkt auf das laufende Bild');
  t.gleich(await page.getAttribute('#btn-contrast', 'aria-pressed'), 'true', 'und der Knopf zeigt es');

  await page.click('#btn-freeze');
  await page.waitForTimeout(200);
  t.ok((await filter('loupe-still')).indexOf('contrast') >= 0, 'und auf das Standbild');
  t.gleich(await page.isVisible('#btn-relief'), true, 'im Standbild steht Relief da');

  const original = await fingerabdruck();
  await page.click('#btn-relief');
  const relief = await fingerabdruck();
  t.ok(relief.grau && relief.h !== original.h, 'Relief rechnet das Standbild grau um');

  await page.click('#btn-relief');
  t.gleich((await fingerabdruck()).h, original.h, 'ausgeschaltet kommt genau das Original zurück');

  await page.click('#btn-relief');
  await page.click('#btn-freeze');
  await page.waitForTimeout(150);
  t.gleich(await page.isVisible('#btn-relief'), false, 'mit „Weiter“ verschwindet Relief');
  t.ok((await filter('loupe-video')).indexOf('contrast') >= 0, 'Kontrast bleibt an');
}

/* ---------- Einstellungen ---------- */

/* Das Zahnrad steht in jedem Werkzeug. Dahinter: die Schalter, die für alle
 * gelten, und der Weg zur Kalibrierung, die als zweite Seite im selben
 * Blatt aufgeht. Die Kopfzeile trägt nur noch Pille, Zahnrad und – im
 * Lineal – den Nullpunkt. */
async function einstellungenMenue(page, t) {
  for (const view of ['ruler', 'gauge', 'protractor', 'loupe']) {
    await inAnsicht(page, view);
    const knoepfe = await page.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll('.topbar__actions > button'), function (b) {
        return !b.hidden;
      }).map(function (b) { return b.id; });
    });
    t.gleich(knoepfe, view === 'ruler' ? ['btn-tools', 'btn-zeropoint', 'btn-calibrate'] : ['btn-tools', 'btn-calibrate'],
      'Kopfzeile in ' + view);
  }

  await inAnsicht(page, 'ruler');
  await einstellungen(page);
  t.gleich(await page.textContent('#sheet-title'), 'Einstellungen', 'das Zahnrad öffnet die Einstellungen');
  t.gleich(await page.isVisible('#btn-theme') && await page.isVisible('#btn-rotation') && await page.isVisible('#btn-open-cal'),
    true, 'mit beiden Schaltern und dem Weg zur Kalibrierung');
  t.gleich(await page.isVisible('#cal-save'), false, 'die Kalibrierung selbst liegt dahinter');

  await page.click('#btn-open-cal');
  await page.waitForTimeout(120);
  t.gleich(await page.textContent('#sheet-title'), 'Kalibrieren', 'Kalibrieren öffnet die zweite Seite');
  t.gleich(await page.isVisible('#cal-save') && await page.isVisible('#edge-measure'), true,
    'mit Maßstab und Gerätekante');
  t.ok((await page.textContent('#facts')).length > 10, 'und den erkannten Werten');

  await page.click('#sheet-back');
  await page.waitForTimeout(120);
  t.gleich(await page.isVisible('#btn-theme') && !(await page.isVisible('#cal-save')), true, 'der Pfeil führt zurück');

  await page.click('#btn-open-cal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await einstellungen(page);
  t.gleich(await page.textContent('#sheet-title'), 'Einstellungen', 'wieder geöffnet, beginnt es vorn');
}

/* ---------- Werkzeugwahl ---------- */

/* Die Pille zeigt, wo man ist, und führt zur Auswahl. Jede Karte öffnet ihr
 * Werkzeug und schließt das Blatt. Unten steht keine Leiste mehr. */
async function werkzeugwahl(page, t) {
  t.gleich(await page.textContent('#btn-tools-name'), 'Lineal', 'die Pille zeigt das offene Werkzeug');
  t.gleich(await page.evaluate(function () { return document.querySelector('.tabbar'); }), null,
    'unten steht keine Leiste mehr');

  await page.click('#btn-tools');
  t.gleich(await page.isVisible('#toolsheet'), true, 'ein Druck öffnet die Auswahl');

  const karten = await page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('.toolcard'), function (k) {
      return { view: k.dataset.view, text: k.querySelector('.toolcard__text span').textContent.length };
    });
  });
  t.gleich(karten.map(function (k) { return k.view; }), ['ruler', 'gauge', 'protractor', 'loupe'], 'vier Werkzeuge');
  t.ok(karten.every(function (k) { return k.text > 20; }), 'jedes mit einer Zeile Erklärung');

  const namen = { ruler: 'Lineal', gauge: 'Lehre', protractor: 'Winkel', loupe: 'Lupe' };
  for (const view of ['gauge', 'protractor', 'loupe', 'ruler']) {
    if (!(await page.isVisible('#toolsheet'))) await page.click('#btn-tools');
    await page.click('.toolcard[data-view="' + view + '"]');
    await page.waitForTimeout(150);

    const ist = await page.evaluate(function () {
      return {
        offen: document.querySelector('.view.is-active').id,
        blatt: !document.getElementById('toolsheet').hidden,
        pille: document.getElementById('btn-tools-name').textContent
      };
    });
    t.gleich(ist, { offen: 'view-' + view, blatt: false, pille: namen[view] },
      namen[view] + ': geöffnet, Auswahl zu, Pille stimmt');
  }

  await page.click('#btn-tools');
  await page.keyboard.press('Escape');
  t.gleich(await page.isVisible('#toolsheet'), false, 'Escape schließt die Auswahl');
}

/* Die Knöpfe oben rechts dürfen nicht bis über die Millimeterstriche der
 * Hauptskala am linken Rand reichen – auch nicht im Lineal, wo alle fünf
 * dastehen, und nicht auf einem 320 px schmalen Gerät. */
async function kopfzeilePlatz(page, t) {
  for (const breite of [320, 360]) {
    await page.setViewportSize({ width: breite, height: HOEHE });
    await page.waitForTimeout(150);

    const mass = await page.evaluate(function () {
      const r = document.querySelector('.topbar__actions').getBoundingClientRect();
      /* Millimeterstriche: 0,36 des Hauptstrichs, der höchstens 104 px lang ist. */
      const quer = window.innerWidth;
      const strich = Math.min(quer * 0.3, 104) * 0.36;
      return { links: r.left, rechts: r.right, strich: strich };
    });

    t.ok(mass.rechts <= breite, 'Knopfgruppe bleibt im Bild (' + breite + ' px)');
    t.ok(mass.links > mass.strich,
      'und lässt die Millimeterstriche frei (' + breite + ' px): beginnt bei ' +
      Math.round(mass.links) + ', Striche bis ' + Math.round(mass.strich));
  }
}

/* Beim allerersten Start steht die Auswahl offen; danach geht es mit dem
 * zuletzt benutzten Werkzeug los. */
async function ersterStart(page, t) {
  await page.evaluate(function () {
    localStorage.setItem('__ersterStart', '1');
    localStorage.removeItem('zollstock.view.v1');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  t.gleich(await page.isVisible('#toolsheet'), true, 'beim ersten Start steht die Auswahl offen');

  await page.click('.toolcard[data-view="protractor"]');
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  t.gleich(await page.isVisible('#toolsheet'), false, 'beim nächsten Start nicht mehr');
  t.gleich(await page.evaluate(function () { return document.querySelector('.view.is-active').id; }),
    'view-protractor', 'sondern gleich das zuletzt benutzte Werkzeug');
}

module.exports = {
  PX_PER_MM: PX_PER_MM,
  BREITE: BREITE,
  HOEHE: HOEHE,
  pruefungen: [
    { name: 'Lineal: Nullpunkte', lauf: linealNullpunkte },
    { name: 'Lineal: Kante beim Drehen', lauf: linealDrehung },
    { name: 'Lineal: Marke beim Nullpunktwechsel', lauf: linealMarke },
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
    { name: 'Heller Grund', lauf: hellerGrund },
    { name: 'Lupe: Kamera an und aus', lauf: lupeStrom },
    { name: 'Lupe: Standbild', lauf: lupeStandbild },
    { name: 'Lupe: ohne Freigabe', lauf: lupeOhneFreigabe },
    { name: 'Lupe: Startwert', lauf: lupeStartwert },
    { name: 'Lupe: Kamerazoom', lauf: lupeKamerazoom },
    { name: 'Lupe: Standbild verschieben', lauf: lupeVerschieben },
    { name: 'Lupe: Objektive', lauf: lupeObjektive },
    { name: 'Lupe: Objektiv mit dem größten Zoom', lauf: lupeWeitestesObjektiv },
    { name: 'Lupe: Licht', lauf: lupeLicht },
    { name: 'Lupe: Licht im Standbild', lauf: lupeLichtImStandbild },
    { name: 'Lupe: Kontrast und Relief', lauf: lupeKontrast },
    { name: 'Einstellungen', lauf: einstellungenMenue },
    { name: 'Werkzeugwahl', lauf: werkzeugwahl },
    { name: 'Werkzeugwahl: Platz in der Kopfzeile', lauf: kopfzeilePlatz },
    { name: 'Werkzeugwahl: erster Start', lauf: ersterStart }
  ]
};
