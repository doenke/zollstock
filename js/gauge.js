/* Messlehre: Schlitze und Kreise in Originalgröße, zum Anlegen von Bohrern
 * und Rohren.
 *
 * Bohrer werden in einen Schlitz gelegt: zwei Linien mit genau dem lichten
 * Abstand des Nenndurchmessers. Passt der Bohrer ohne Luft und ohne Überstand
 * hinein, stimmt das Maß.
 *
 * Rohre werden an den linken Bildschirmrand gehalten und mit einem Halbkreis
 * verglichen, dessen Mittelpunkt auf der Kante liegt. Die andere Hälfte ragt
 * über den Rand hinaus – so braucht ein Maß nur den halben Platz in der
 * Breite, und es steht immer nur eines im Bild statt vieler ineinander.
 * Durchgeblättert wird durch Scrollen.
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
    'pipe-mm': { kind: 'halves', name: 'Rohr mm', items: PIPES_MM, hint: 'Rohr an den linken Rand halten' },
    'pipe-in': { kind: 'halves', name: 'Rohr Zoll', items: PIPES_IN, hint: 'Rohr an den linken Rand halten' }
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
      : item.note + (set().kind === 'halves' ? ' · Außendurchmesser' : '');
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

  function drawSlots(width, height, pxPerMm, rows) {
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

  /* ---------- Halbkreise ---------- */

  var HALF_GAP_MM = 6;       /* Luft zwischen zwei Halbkreisen */

  function halvesHeight(items, pxPerMm) {
    var total = 0;
    items.forEach(function (item) { total += (item.mm + HALF_GAP_MM) * pxPerMm; });
    return total;
  }

  /* Der Halbkreis sitzt mit seiner geraden Seite am linken Bildschirmrand:
   * Das Rohr wird dort angelegt, seine andere Hälfte ragt über die Kante
   * hinaus. So braucht ein Maß nur den halben Platz in der Breite, und es
   * steht immer nur eines im Bild – durchgeblättert wird durch Scrollen. */
  function drawHalves(width, height, pxPerMm) {
    var items = set().items;
    var text = css('--text');
    var dim = css('--text-dim');
    var accent = css('--accent');
    var gap = HALF_GAP_MM * pxPerMm;
    var y = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    items.forEach(function (item) {
      var r = item.mm * pxPerMm / 2;
      var cy = y + gap / 2 + r;
      var on = pick() === item;

      /* Der Mittelpunkt liegt genau auf der Kante, der Halbmesser zählt von
       * dort – gemessen wird also gegen den ersten sichtbaren Bildpunkt. */
      ctx.strokeStyle = on ? accent : text;
      ctx.lineWidth = on ? 2.5 : 1.4;
      ctx.beginPath();
      ctx.arc(0, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      /* Die beiden Enden des Durchmessers, an denen ausgerichtet wird. */
      ctx.lineWidth = on ? 2.5 : 1.4;
      ctx.beginPath();
      ctx.moveTo(0, cy - r);
      ctx.lineTo(9, cy - r);
      ctx.moveTo(0, cy + r);
      ctx.lineTo(9, cy + r);
      ctx.stroke();

      /* Die gerade Seite nur angedeutet – sie liegt auf der Kante. */
      ctx.strokeStyle = css('--line');
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(1, cy - r);
      ctx.lineTo(1, cy + r);
      ctx.stroke();
      ctx.setLineDash([]);

      /* Neben den Bogen, wenn dort Platz ist – sonst hinein. */
      var inch = item.label.indexOf('\u2033') >= 0;
      var main = inch ? item.label : fmtMm(item.mm);
      var note = inch ? fmtMm(item.mm) + ' außen' : item.note;

      ctx.font = (on ? '700 ' : '600 ') + '17px system-ui, -apple-system, sans-serif';
      var need = ctx.measureText(main).width;
      var lx = r + 16 + need < width - 10 ? r + 16 : Math.max(16, r / 2 - need / 2);

      ctx.fillStyle = on ? accent : text;
      ctx.fillText(main, lx, cy - 8);
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = dim;
      ctx.fillText(note, lx, cy + 10);

      hits.push({ item: item, top: cy - r, bottom: cy + r });
      y += item.mm * pxPerMm + gap;
    });
  }

  /* ---------- Zeichnen ---------- */

  function draw() {
    if (!canvas) return;

    var dpr = window.devicePixelRatio || 1;
    var w = els.scroll.clientWidth;

    /* Solange die Ansicht verborgen ist, hat die Fläche keine Größe. */
    if (w < 2 || els.scroll.clientHeight < 2) return;

    var pxPerMm = window.Calibration.pxPerMm();
    var frame = els.scroll.getBoundingClientRect();
    /* Anzeige und Werkzeugleiste liegen über der Fläche – der Inhalt bekommt
     * oben und unten so viel Luft, dass nichts dahinter verschwindet. Beide
     * brechen je nach Textlänge um, deshalb wird gemessen statt gerechnet. */
    var top = Math.max(0, els.readout.getBoundingClientRect().bottom - frame.top + 10);
    var bottom = Math.max(0, frame.bottom - els.tools.getBoundingClientRect().top + 14);
    var room = Math.max(120, els.scroll.clientHeight - top - bottom);

    /* Was nicht in die Höhe passt, wird gescrollt – deshalb wächst die
     * Zeichenfläche mit dem Inhalt. */
    var items = set().items;
    var slots = set().kind === 'slots';
    var rows = slots ? rowsOf(items, w, pxPerMm) : null;
    var wanted = slots
      ? rows.length * (14 * pxPerMm + LABEL_PX + 12)
      : halvesHeight(items, pxPerMm);
    var height = Math.max(room, wanted);
    var h = top + height + bottom;

    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    hits = [];
    ctx.save();
    ctx.translate(0, top);
    if (slots) drawSlots(w, height, pxPerMm, rows);
    else drawHalves(w, height, pxPerMm);
    ctx.restore();

    /* Die Trefferflächen gelten im Bild, nicht im verschobenen System. */
    hits.forEach(function (hit) {
      if (hit.y !== undefined) hit.y += top;
      if (hit.top !== undefined) { hit.top += top; hit.bottom += top; }
    });
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
      /* Halbkreise bekommen ihr ganzes Band, Schlitze ihr Rechteck. */
      var dist = hit.top !== undefined
        ? Math.max(hit.top - y, y - hit.bottom)
        : Math.max(Math.abs(x - hit.x) - hit.r, Math.abs(y - hit.y) - 26);

      if (dist < bestDist) {
        bestDist = dist;
        best = hit;
      }
    });

    return best && bestDist <= 0 ? best.item : null;
  }

  function setSet(key) {
    if (!SETS[key] || state.set === key) return;
    state.set = key;
    persist();
    /* Der neue Satz fängt oben an, nicht dort, wo der alte gerade stand. */
    els.scroll.scrollTop = 0;
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
      scroll: document.getElementById('gauge-scroll'),
      tools: document.querySelector('#view-gauge .tools'),
      readout: document.getElementById('gauge-readout'),
      main: document.getElementById('gauge-main'),
      sub: document.getElementById('gauge-sub'),
      buttons: Array.prototype.slice.call(document.querySelectorAll('[data-gauge]'))
    };

    els.buttons.forEach(function (btn) {
      btn.addEventListener('click', function () { setSet(btn.dataset.gauge); });
    });

    /* Getippt wird ausgewählt, gezogen wird gescrollt – unterschieden wird
     * am zurückgelegten Weg, das Scrollen selbst macht der Browser. */
    var down = null;

    canvas.addEventListener('pointerdown', function (event) {
      down = { x: event.clientX, y: event.clientY, time: Date.now() };
    });

    canvas.addEventListener('pointerup', function (event) {
      if (!down) return;

      var moved = Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y);
      var quick = Date.now() - down.time < 600;
      down = null;
      if (moved > 10 || !quick) return;

      var rect = canvas.getBoundingClientRect();
      var item = hitAt(event.clientX - rect.left, event.clientY - rect.top);
      /* Nochmal auf dasselbe Maß tippen nimmt die Hervorhebung zurück. */
      choose(item === pick() ? null : item);
    });

    canvas.addEventListener('pointercancel', function () { down = null; });

    window.Calibration.onChange(refresh);

    showSet();
    showReadout();
  }

  return { init: init, draw: draw, refresh: refresh, sets: ORDER };
})();
