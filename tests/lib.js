/* Werkzeug für die Prüfstrecke: ein winziger Dateiserver, das Finden eines
 * Browsers und ein paar Behauptungen. Ohne Abhängigkeiten außer
 * playwright-core. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------- Dateiserver ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

/* Die App braucht http, nicht file: – sonst gibt es weder localStorage noch
 * einen Service Worker. Ein eigener Server spart eine Abhängigkeit. */
function serve(root) {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      let name = decodeURIComponent(req.url.split('?')[0]);
      if (name.endsWith('/')) name += 'index.html';

      const full = path.join(root, path.normalize(name));
      if (!full.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }

      fs.readFile(full, function (err, data) {
        if (err) {
          res.writeHead(404);
          res.end('nicht gefunden');
          return;
        }
        res.writeHead(200, {
          'content-type': TYPES[path.extname(full)] || 'application/octet-stream',
          'cache-control': 'no-store'
        });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', function () {
      resolve({
        url: 'http://127.0.0.1:' + server.address().port + '/index.html',
        close: function () { server.close(); }
      });
    });
  });
}

/* ---------- Browser finden ---------- */

function exists(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch (err) {
    return false;
  }
}

/* playwright-core bringt keinen Browser mit. Gesucht wird erst, was gesagt
 * wurde, dann was Playwright abgelegt hat, dann die üblichen Orte. */
function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const store = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (store && fs.existsSync(store)) {
    const dirs = fs.readdirSync(store).filter(function (name) { return name.startsWith('chromium'); }).sort().reverse();
    for (const dir of dirs) {
      for (const rest of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const full = path.join(store, dir, rest);
        if (exists(full)) return full;
      }
    }
  }

  const üblich = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const file of üblich) if (exists(file)) return file;
  return null;
}

/* ---------- Behauptungen ---------- */

function Pruefung(name) {
  this.name = name;
  this.fehler = [];
  this.zahl = 0;
}

Pruefung.prototype.ok = function (bedingung, text) {
  this.zahl++;
  if (!bedingung) this.fehler.push(text);
};

Pruefung.prototype.gleich = function (ist, soll, text) {
  this.zahl++;
  if (ist !== soll) this.fehler.push(text + ': ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll));
};

Pruefung.prototype.nahe = function (ist, soll, toleranz, text) {
  this.zahl++;
  if (!isFinite(ist) || Math.abs(ist - soll) > toleranz) {
    this.fehler.push(text + ': ist ' + fmt(ist) + ', soll ' + fmt(soll) + ' ± ' + fmt(toleranz));
  }
};

function fmt(wert) {
  return typeof wert === 'number' ? (Math.round(wert * 1000) / 1000).toString() : String(wert);
}

module.exports = { serve: serve, findBrowser: findBrowser, Pruefung: Pruefung, fmt: fmt };
