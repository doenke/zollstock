/* Prüfstrecke für Zollstock.
 *
 *   cd tests && npm install && npm test
 *
 * Gehört nicht zur App: Die bleibt eine statische Seite ohne Build und ohne
 * Abhängigkeiten. Hier läuft nur nach, was sich nachrechnen lässt – Maße in
 * der Zeichenfläche, Umrechnungen, die Anordnung. Ob ein Bohrer wirklich in
 * den Schlitz passt, sagt weiterhin nur das Handy. */
'use strict';

const path = require('path');
const lib = require('./lib');
const checks = require('./checks');

const WURZEL = path.resolve(__dirname, '..');

async function main() {
  const nurDiese = process.argv.slice(2).filter(function (a) { return !a.startsWith('-'); });

  const browserPfad = lib.findBrowser();
  if (!browserPfad) {
    console.error('Kein Chromium gefunden.');
    console.error('Entweder CHROME_PATH auf einen Chrome/Chromium setzen oder');
    console.error('einen mitbringen lassen:  npx playwright install chromium');
    process.exit(2);
  }

  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch (err) {
    console.error('playwright-core fehlt. Im Ordner tests:  npm install');
    process.exit(2);
  }

  const server = await lib.serve(WURZEL);
  const browser = await chromium.launch({ executablePath: browserPfad });

  console.log('Zollstock – Prüfstrecke');
  console.log('Browser: ' + browserPfad);
  console.log('');

  let behauptungen = 0;
  const gescheitert = [];

  for (const pruefung of checks.pruefungen) {
    if (nurDiese.length && !nurDiese.some(function (teil) { return pruefung.name.toLowerCase().includes(teil.toLowerCase()); })) continue;

    const t = new lib.Pruefung(pruefung.name);
    const meldungen = [];

    const ctx = await browser.newContext({
      viewport: { width: checks.BREITE, height: checks.HOEHE },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });

    /* Fester Maßstab, damit die Erwartungswerte nicht am erkannten Gerät
     * hängen. Und ein Notizblock für die Stupse, die es im Browser nicht
     * gibt. */
    await ctx.addInitScript(function (pxPerMm) {
      localStorage.setItem('zollstock.calibration.v1', JSON.stringify({ pxPerMm: pxPerMm, source: 'manual' }));
      window.__stups = [];
      navigator.vibrate = function (muster) { window.__stups.push(muster); return true; };

      /* Die Drehung des Bildes lässt sich echt nicht herbeiführen – hier
       * steht ein Platzhalter, den die Prüfungen setzen können. */
      Object.defineProperty(screen, 'orientation', {
        configurable: true,
        value: { angle: 0, type: 'portrait-primary', addEventListener: function () {}, removeEventListener: function () {} }
      });
    }, checks.PX_PER_MM);

    const page = await ctx.newPage();
    page.on('pageerror', function (err) { meldungen.push('JS-Fehler: ' + err.message); });
    page.on('console', function (m) { if (m.type() === 'error') meldungen.push('Konsole: ' + m.text()); });

    try {
      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(120);
      await pruefung.lauf(page, t);
    } catch (err) {
      t.fehler.push('abgebrochen: ' + err.message);
    }

    meldungen.forEach(function (text) { t.fehler.push(text); });
    await ctx.close();

    behauptungen += t.zahl;
    const zeichen = t.fehler.length ? '✗' : '✓';
    console.log(zeichen + ' ' + pruefung.name + '  (' + t.zahl + ')');
    t.fehler.forEach(function (text) { console.log('    ' + text); });
    if (t.fehler.length) gescheitert.push(pruefung.name);
  }

  await browser.close();
  server.close();

  console.log('');
  console.log(behauptungen + ' Behauptungen, ' + gescheitert.length + ' Prüfungen gescheitert');
  process.exit(gescheitert.length ? 1 : 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(2);
});
