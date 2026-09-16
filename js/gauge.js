/* Messlehre: Schlitze und Kreise in Originalgröße, zum Anlegen von Bohrern
 * und Rohren.
 *
 * Bohrer werden in einen Schlitz gelegt: zwei Linien mit genau dem lichten
 * Abstand des Nenndurchmessers. Passt der Bohrer ohne Luft und ohne Überstand
 * hinein, stimmt das Maß.
 *
 * Rohre werden mit dem Ende auf einen Kreis gestellt. Die Kreise liegen
 * ineinander – so passen viele Maße auf wenig Fläche, und das Rohr verdeckt
 * ohnehin alles, was kleiner ist als es selbst.
 *
 * Alle Maße sind Außendurchmesser. Bei Zollrohren ist die Zollangabe der
 * Gewindename, nicht das Maß: ½″ hat 21,3 mm außen. */
window.Gauge = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.gauge.v1';

  function mm(value, note) {
    return { mm: value, label: String(value).replace('.', ','), note: note || '' };
  }

  /* Gängige Spiralbohrer: bis 10 mm in halben Schritten, darüber in ganzen. */
  var DRILLS = [];
  for (var d = 1; d <= 10.001; d += 0.5) DRILLS.push(mm(Math.round(d * 10) / 10, 'Bohrer'));
  [11, 12, 13, 14, 16].forEach(function (v) { DRILLS.push(mm(v, 'Bohrer')); });

  /* Kupfer nach EN 1057, Verbund- und PE-Rohre in ihrer eigenen Reihe. */
  var PIPES_MM = [
    mm(6, 'Kupfer'), mm(8, 'Kupfer'), mm(10, 'Kupfer'), mm(12, 'Kupfer'),
    mm(15, 'Kupfer'), mm(16, 'Verbund'), mm(18, 'Kupfer'), mm(20, 'Verbund'),
    mm(22, 'Kupfer'), mm(25, 'Verbund'), mm(28, 'Kupfer'), mm(32, 'Verbund'),
    mm(35, 'Kupfer'), mm(40, 'Verbund'), mm(42, 'Kupfer'), mm(50, 'Verbund'),
    mm(54, 'Kupfer'), mm(63, 'Verbund')
  ];

  /* Gewinderohre nach EN 10255 (DIN 2440). Der Zollwert ist der Gewindename,
   * der Außendurchmesser steht daneben. */
  var PIPES_IN = [
    { mm: 10.2, label: '⅛″', note: 'Gewinderohr' },
    { mm: 13.5, label: '¼″', note: 'Gewinderohr' },
    { mm: 17.2, label: '⅜″', note: 'Gewinderohr' },
    { mm: 21.3, label: '½″', note: 'Gewinderohr' },
    { mm: 26.9, label: '¾″', note: 'Gewinderohr' },
    { mm: 33.7, label: '1″', note: 'Gewinderohr' },
    { mm: 42.4, label: '1¼″', note: 'Gewinderohr' },
    { mm: 48.3, label: '1½″', note: 'Gewinderohr' },
    { mm: 60.3, label: '2″', note: 'Gewinderohr' },
    { mm: 76.1, label: '2½″', note: 'Gewinderohr' },
    { mm: 88.9, label: '3″', note: 'Gewinderohr' }
  ];

  var SETS = {
    drill: { kind: 'slots', name: 'Bohrer', items: DRILLS, hint: 'Bohrer in den passenden Schlitz legen' },
    'pipe-mm': { kind: 'rings', name: 'Rohr mm', items: PIPES_MM, hint: 'Rohrende auf den passenden Kreis stellen' },
    'pipe-in': { kind: 'rings', name: 'Rohr Zoll', items: PIPES_IN, hint: 'Rohrende auf den passenden Kreis stellen' }
  };

  var ORDER = ['drill', 'pipe-mm', 'pipe-in'];

  var canvas, ctx, els = {};
  var state = load() || { set: 'drill' };
  var chosen = { drill: null, 'pipe-mm': null, 'pipe-in': null };
  var hits = [];             /* Trefferflächen der letzten Zeichnung */
  var frame = null;

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      return parsed && SETS[parsed.set] ? { set: parsed.set } : null;
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

  function set() { return SETS[state.set]; }
  function pick() { return chosen[state.set]; }

  /* ---------- Anzeige über der Lehre ---------- */

  function fmtMm(value) {
    return (Math.round(value * 10) / 10).toString().replace('.', ',') + ' mm';
  }

  function showReadout() {
    var item = pick();

    if (!item) {
      els.main.textContent = set().name;
      els.sub.textContent = set().hint;
      return;
    }

    /* Beim Zollrohr ist der Name das Gewinde, das Maß gehört daneben. */
    var inch = item.label.indexOf('″') >= 0;
    els.main.textContent = inch ? item.label : fmtMm(item.mm);
    els.sub.textContent = inch
      ? fmtMm(item.mm) + ' außen · ' + item.note
      : item.note + (set().kind === 'rings' ? ' · Außendurchmesser' : '');
  }

  function choose(item) {
    chosen[state.set] = item;
    showReadout();
    draw();
  }

  /* ---------- Schlitze ---------- */

  var SLOT_GAP_MM = 4.5;     /* Luft zwischen zwei Schlitzen */
  var PAD_MM = 3;            /* Rand links und rechts */
  var LABEL_PX = 18;

  /* Die Schlitze werden zeilenweise umbrochen, so viele wie nebeneinander
   * passen. Wie viele das sind, hängt am Maßstab – also wird gerechnet,
   * nicht fest eingeteilt. */
  function rowsOf(items, width, pxPerMm) {
    var usable = width - 2 * PAD_MM * pxPerMm;
    var gap = SLOT_GAP_MM * pxPerMm;
    var rows = [];
    var row = [];
    var used = 0;

    items.forEach(function (item) {
      var need = item.mm * pxPerMm;
      var extra = row.length ? gap + need : need;

      if (row.length && used + extra > usable) {
        rows.push(row);
        row = [];
        used = 0;
        extra = need;
      }

      row.push(item);
      used += extra;
    });

    if (row.length) rows.push(row);
    return rows;
  }

  function drawSlots(width, height, pxPerMm) {
    var items = set().items;
    var rows = rowsOf(items, width, pxPerMm);
    var gap = SLOT_GAP_MM * pxPerMm;
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var rowHeight = height / rows.length;
    /* Der Schlitz soll tief genug sein, um den Bohrer sicher anzulegen. */
    var slotHeight = Math.min(rowHeight - LABEL_PX - 10, 16 * pxPerMm);
    var lw = 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    rows.forEach(function (row, index) {
      var total = 0;
      row.forEach(function (item) { total += item.mm * pxPerMm; });
      total += gap * (row.length - 1);

      var x = (width - total) / 2;
      var top = index * rowHeight + (rowHeight - slotHeight - LABEL_PX) / 2;

      row.forEach(function (item) {
        var span = item.mm * pxPerMm;
        var on = pick() === item;

        /* Gemessen wird der lichte Abstand: die Striche stehen außerhalb,
         * ihre Innenkanten genau einen Nenndurchmesser auseinander. */
        var left = x - lw / 2;
        var right = x + span + lw / 2;

        ctx.strokeStyle = on ? accent : text;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, top + slotHeight);
        ctx.lineTo(right, top + slotHeight);
        ctx.lineTo(right, top);
        ctx.stroke();

        ctx.fillStyle = on ? accent : dim;
        ctx.font = (on ? '700 ' : '600 ') + '13px system-ui, -apple-system, sans-serif';
        ctx.fillText(item.label, x + span / 2, top + slotHeight + 5);

        hits.push({ item: item, x: x + span / 2, y: top + slotHeight / 2, r: Math.max(22, span / 2 + gap / 2) });
        x += span + gap;
      });
    });
  }

  /* ---------- Kreise ---------- */

  function drawRings(width, height, pxPerMm) {
    var items = set().items;
    var cx = width / 2;
    var cy = height / 2;
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var reach = Math.max(width, height) / 2;

    /* Fadenkreuz zum Ausrichten des Rohrs. */
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy);
    ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx, cy + 9);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var labels = [];

    items.forEach(function (item, index) {
      var r = item.mm * pxPerMm / 2;
      /* Was nicht einmal mehr oben und unten ins Bild ragt, nützt nichts. */
      if (r > reach) return;

      var on = pick() === item;

      ctx.strokeStyle = on ? accent : text;
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      hits.push({ item: item, ring: r, x: cx, y: cy });

      /* Die Beschriftung wandert reihum auf vier Schrägen: so haben Nachbarn
       * den vierfachen Abstand und stoßen nicht aneinander. Große Kreise
       * ragen seitlich aus dem Bild – die werden oben oder unten beschriftet,
       * wo von ihnen noch etwas zu sehen ist. */
      var angle = (Math.PI / 4) + (index % 4) * (Math.PI / 2);
      var spots = [
        { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r },
        { x: cx, y: cy - r },
        { x: cx, y: cy + r }
      ];
      var room = r > 5 * pxPerMm / 2;

      if (on || room) {
        for (var i = 0; i < spots.length; i++) {
          var spot = spots[i];
          if (spot.x > 16 && spot.x < width - 16 && spot.y > 10 && spot.y < height - 10) {
            labels.push({ x: spot.x, y: spot.y, text: item.label, on: on });
            break;
          }
        }
      }
    });

    /* Die Zahlen kommen zum Schluss und bekommen nur einen schmalen Saum in
     * der Hintergrundfarbe – ein freigeräumtes Rechteck würde die Nachbar-
     * kreise zerschneiden, und genau an denen wird ja angelegt. */
    labels.forEach(function (label) {
      ctx.font = (label.on ? '700 13px' : '600 11px') + ' system-ui, -apple-system, sans-serif';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css('--bg');
      ctx.strokeText(label.text, label.x, label.y);
      ctx.fillStyle = label.on ? accent : dim;
      ctx.fillText(label.text, label.x, label.y);
    });
  }

  /* ---------- Zeichnen ---------- */

  function draw() {
    if (!canvas) return;

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;

    /* Solange die Ansicht verborgen ist, hat die Fläche keine Größe. */
    if (w < 2 || h < 2) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    hits = [];
    var pxPerMm = window.Calibration.pxPerMm();
    /* Die Werkzeugleiste bricht je nach Textlänge um – sie wird ausgemessen. */
    var bottom = els.tools.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 10;
    var top = els.readout.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 8;
    var height = Math.max(120, bottom - top);

    ctx.save();
    ctx.translate(0, top);
    if (set().kind === 'slots') drawSlots(w, height, pxPerMm);
    else drawRings(w, height, pxPerMm);
    ctx.restore();

    /* Die Trefferflächen gelten im Bild, nicht im verschobenen System. */
    hits.forEach(function (hit) { hit.y += top; });
  }

  function refresh() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = null;
      draw();
    });
  }

  /* ---------- Bedienung ---------- */

  function hitAt(x, y) {
    var best = null;
    var bestDist = Infinity;

    hits.forEach(function (hit) {
      var dist = hit.ring === undefined
        ? Math.max(Math.abs(x - hit.x) - hit.r, Math.abs(y - hit.y) - 26)
        : Math.abs(Math.sqrt((x - hit.x) * (x - hit.x) + (y - hit.y) * (y - hit.y)) - hit.ring);

      if (dist < bestDist) {
        bestDist = dist;
        best = hit;
      }
    });

    return best && bestDist <= (best.ring === undefined ? 0 : 18) ? best.item : null;
  }

  function setSet(key) {
    if (!SETS[key] || state.set === key) return;
    state.set = key;
    persist();
    showSet();
    showReadout();
    draw();
  }

  function showSet() {
    els.buttons.forEach(function (btn) {
      var on = btn.dataset.gauge === state.set;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function init() {
    canvas = document.getElementById('gauge-canvas');
    ctx = canvas.getContext('2d');

    els = {
      tools: document.querySelector('#view-gauge .tools'),
      readout: document.getElementById('gauge-readout'),
      main: document.getElementById('gauge-main'),
      sub: document.getElementById('gauge-sub'),
      buttons: Array.prototype.slice.call(document.querySelectorAll('[data-gauge]'))
    };

    els.buttons.forEach(function (btn) {
      btn.addEventListener('click', function () { setSet(btn.dataset.gauge); });
    });

    canvas.addEventListener('pointerdown', function (event) {
      var rect = canvas.getBoundingClientRect();
      var item = hitAt(event.clientX - rect.left, event.clientY - rect.top);
      /* Nochmal auf dasselbe Maß tippen nimmt die Hervorhebung zurück. */
      choose(item === pick() ? null : item);
    });

    window.Calibration.onChange(refresh);

    showSet();
    showReadout();
  }

  return { init: init, draw: draw, refresh: refresh, sets: ORDER };
})();
