/* Messlehre: Schlitze und Kreise in Originalgröße, zum Anlegen von Bohrern
 * und Rohren.
 *
 * Beide Sätze stehen als Liste untereinander, jedes Maß am linken
 * Bildschirmrand; durchgeblättert wird durch Scrollen.
 *
 * Bohrer werden waagerecht in einen nach links offenen Schlitz gelegt: zwei
 * Linien mit genau dem lichten Abstand des Nenndurchmessers. Passt der Bohrer
 * ohne Luft und ohne Überstand hinein, stimmt das Maß.
 *
 * Rohre werden an die Kante gehalten und mit einem Halbkreis verglichen,
 * dessen Mittelpunkt auf ihr liegt. Die andere Hälfte ragt über den Rand
 * hinaus – so braucht ein Maß nur den halben Platz in der Breite.
 *
 * Alle Maße sind Außendurchmesser. Bei Zollrohren ist die Zollangabe der
 * Gewindename, nicht das Maß: ½″ hat 21,3 mm außen. */
window.Gauge = (function () {
  'use strict';

  var STORE_KEY = 'zollstock.gauge.v1';

  function fmtMm(value) {
    return (Math.round(value * 10) / 10).toString().replace('.', ',') + ' mm';
  }

  /* Ein Eintrag trägt sein Maß, seine Beschriftung und eine Nebenzeile. Bei
   * Schrauben und Zollrohren ist die Beschriftung ein Name, das Maß steht
   * dann in der Nebenzeile. */
  function mm(value, sub) {
    return { mm: value, label: fmtMm(value), sub: sub || '' };
  }

  function named(value, label, sub) {
    return { mm: value, label: label, sub: sub };
  }

  /* Nur ganze Millimeter: Ein halber Millimeter sind auf dem Bildschirm nur
   * ein paar Bildpunkte – so genau lässt sich ein Bohrer nicht anlegen. */
  var DRILLS = [];
  for (var d = 1; d <= 16; d++) DRILLS.push(mm(d));

  /* Metrisches Regelgewinde. Gemessen wird der Schaft über dem Gewinde; das
   * Gewinde selbst misst sich ein bis zwei Zehntel kleiner als sein Nennmaß.
   * Kernloch und Schlüsselweite stehen daneben – die eigentliche Frage am
   * Werkzeugkasten ist ja meist nicht "wie dick", sondern "was brauche ich". */
  var SCREWS = [
    named(3, 'M3', 'Kernloch 2,5 mm · SW 5,5'),
    named(4, 'M4', 'Kernloch 3,3 mm · SW 7'),
    named(5, 'M5', 'Kernloch 4,2 mm · SW 8'),
    named(6, 'M6', 'Kernloch 5,0 mm · SW 10'),
    named(8, 'M8', 'Kernloch 6,8 mm · SW 13'),
    named(10, 'M10', 'Kernloch 8,5 mm · SW 17'),
    named(12, 'M12', 'Kernloch 10,2 mm · SW 19'),
    named(14, 'M14', 'Kernloch 12,0 mm · SW 22'),
    named(16, 'M16', 'Kernloch 14,0 mm · SW 24')
  ];

  /* Schlüsselweite ist der Abstand der beiden Schlüsselflächen – genau das,
   * was zwischen die beiden Striche passt und was der Sechskant breit ist.
   *
   * Die Reihe fängt bei den Innensechskanten an (DIN 912) und geht bis zu den
   * großen Sechskantmuttern (DIN 934): Ein Inbusschlüssel ist selbst ein
   * Sechskant, für ihn gilt dieselbe Lehre. Wo beides auf dieselbe Weite
   * fällt, steht beides daneben. */
  function sw(value, sub) {
    return named(value, 'SW ' + String(value).replace('.', ','), sub);
  }

  var HEX_SIZES = [
    sw(1.5, 'Inbus M2'),
    sw(2, 'Inbus M2,5'),
    sw(2.5, 'Inbus M3'),
    sw(3, 'Inbus M4'),
    sw(4, 'Inbus M5'),
    sw(5, 'Inbus M6'),
    sw(5.5, 'Mutter M3'),
    sw(6, 'Inbus M8'),
    sw(7, 'Mutter M4'),
    sw(8, 'Mutter M5 · Inbus M10'),
    sw(10, 'Mutter M6 · Inbus M12'),
    sw(11, ''),
    sw(12, ''),
    sw(13, 'Mutter M8'),
    sw(14, ''),
    sw(15, ''),
    sw(16, ''),
    sw(17, 'Mutter M10'),
    sw(18, ''),
    sw(19, 'Mutter M12'),
    sw(21, ''),
    sw(22, 'Mutter M14'),
    sw(24, 'Mutter M16')
  ];

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
  function pipe(value, label) { return named(value, label, fmtMm(value) + ' außen'); }

  var PIPES_IN = [
    pipe(10.2, '⅛″'), pipe(13.5, '¼″'), pipe(17.2, '⅜″'), pipe(21.3, '½″'),
    pipe(26.9, '¾″'), pipe(33.7, '1″'), pipe(42.4, '1¼″'), pipe(48.3, '1½″'),
    pipe(60.3, '2″'), pipe(76.1, '2½″'), pipe(88.9, '3″')
  ];

  var SETS = {
    drill: { kind: 'slots', name: 'Bohrer', items: DRILLS, hint: 'Bohrer waagerecht in den Schlitz legen' },
    screw: { kind: 'slots', name: 'Schraube', items: SCREWS, hint: 'Schaft in den Schlitz legen, über dem Gewinde' },
    wrench: { kind: 'slots', name: 'Schlüssel', items: HEX_SIZES, hint: 'Über die beiden Schlüsselflächen anlegen' },
    hex: { kind: 'hex', name: 'Sechskant', items: HEX_SIZES, hint: 'Mutter, Kopf oder Inbus auflegen und drehen, bis er deckt' },
    'pipe-mm': { kind: 'halves', name: 'Rohr mm', items: PIPES_MM, hint: 'Rohr an den linken Rand halten · Außendurchmesser' },
    'pipe-in': { kind: 'halves', name: 'Rohr Zoll', items: PIPES_IN, hint: 'Rohr an den linken Rand halten · Außendurchmesser' }
  };

  var ORDER = ['drill', 'screw', 'wrench', 'hex', 'pipe-mm', 'pipe-in'];

  var canvas, ctx, els = {};
  var state = load() || { set: 'drill' };
  var chosen = {};
  ORDER.forEach(function (key) { chosen[key] = null; });
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

  function showReadout() {
    var item = pick();
    els.main.textContent = item ? item.label : set().name;
    els.sub.textContent = item ? (item.sub || set().name) : set().hint;
  }

  function choose(item) {
    chosen[state.set] = item;
    showReadout();
    draw();
  }

  /* ---------- Zeilen ---------- */

  var GAP_MM = 6;            /* Luft zwischen zwei Maßen */
  var MIN_ROW_PX = 32;       /* damit auch das kleinste Maß beschriftbar bleibt */

  /* Das Eckenmaß eines Sechskants zu seiner Schlüsselweite: 2/√3. Ein
   * Sechskant braucht also mehr Höhe, als seine Weite breit ist. */
  var HEX_TALL = 2 / Math.sqrt(3);

  /* Alle Sätze stehen als Liste untereinander, jedes Maß am linken
   * Bildschirmrand: der Bohrer wird waagerecht in seinen Schlitz gelegt, die
   * Mutter auf den Sechskant, das Rohr an den Halbkreis gehalten. Was nicht
   * auf den Bildschirm passt, wird gescrollt. */
  function spanOf(item, pxPerMm) {
    var px = item.mm * pxPerMm;
    return set().kind === 'hex' ? px * HEX_TALL : px;
  }

  function rowHeight(item, pxPerMm) {
    return Math.max(spanOf(item, pxPerMm), MIN_ROW_PX) + GAP_MM * pxPerMm;
  }

  function listHeight(items, pxPerMm) {
    var total = 0;
    items.forEach(function (item) { total += rowHeight(item, pxPerMm); });
    return total;
  }

  /* Der Schlitz ist nach links offen – der Bohrer wird von der Kante her
   * hineingeschoben. Die Striche stehen außerhalb des Nennmaßes, die lichte
   * Weite dazwischen ist damit genau der Nenndurchmesser. */
  function drawSlot(item, cy, span, length, on) {
    var lw = 2;
    var top = cy - span / 2 - lw / 2;
    var bottom = cy + span / 2 + lw / 2;

    ctx.strokeStyle = on ? css('--accent') : css('--text');
    ctx.lineWidth = lw;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(length, top);
    ctx.lineTo(length, bottom);
    ctx.lineTo(0, bottom);
    ctx.stroke();

    return length + 16;
  }

  /* Der Mittelpunkt liegt genau auf der Kante, der Halbmesser zählt von dort:
   * Das Rohr wird am Rand angelegt, seine andere Hälfte ragt darüber hinaus.
   * So braucht ein Maß nur den halben Platz in der Breite. */
  function drawHalf(item, cy, span, on) {
    var r = span / 2;

    ctx.strokeStyle = on ? css('--accent') : css('--text');
    ctx.lineWidth = on ? 2.5 : 1.4;
    ctx.beginPath();
    ctx.arc(0, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    /* Die beiden Enden des Durchmessers, an denen ausgerichtet wird. */
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

    return r + 16;
  }

  /* Die Mutter wird flach aufgelegt und gedreht, bis sie deckt. Das prüft
   * beide Maße auf einmal – Schlüsselweite und Eckenmaß –, während ein
   * Schlitz nur die Weite kennt und dafür parallel ausgerichtet sein will. */
  function drawHex(item, cy, span, on) {
    var r = span / Math.sqrt(3);      /* Umkreis aus der Schlüsselweite */
    var cx = 10 + span / 2;

    ctx.strokeStyle = on ? css('--accent') : css('--text');
    /* Bei den kleinen Weiten wäre ein dicker Strich ein gutes Stück des
     * Maßes – dann ist nicht mehr zu sehen, was deckt. */
    ctx.lineWidth = span < 24 ? (on ? 1.8 : 1) : (on ? 2.5 : 1.4);
    ctx.lineJoin = 'round';
    ctx.beginPath();

    /* Bei 30 Grad begonnen, damit die beiden Flanken senkrecht stehen und
     * die Breite genau der Schlüsselweite entspricht. */
    for (var i = 0; i < 6; i++) {
      var a = (30 + i * 60) / 180 * Math.PI;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }

    ctx.closePath();
    ctx.stroke();
    return cx + span / 2 + 16;
  }

  function drawList(width, pxPerMm) {
    var items = set().items;
    var slots = set().kind === 'slots';
    var y = 0;

    /* Wie viel Platz die Beschriftung braucht, hängt am längsten Eintrag –
     * "Kernloch 10,2 mm · SW 19" ist breiter als "12 mm". */
    var reserve = 0;
    ctx.font = '700 17px system-ui, -apple-system, sans-serif';
    items.forEach(function (item) { reserve = Math.max(reserve, ctx.measureText(item.label).width); });
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    items.forEach(function (item) { reserve = Math.max(reserve, ctx.measureText(item.sub).width); });

    /* Der Schlitz braucht Länge zum Anlegen, die Beschriftung ihren Platz. */
    var length = Math.max(90, Math.min(52 * pxPerMm, width - reserve - 30));

    /* Sechskante sind verschieden breit – ohne feste Spalte würde die
     * Beschriftung von Zeile zu Zeile wandern. */
    var column = 0;
    if (set().kind === 'hex') {
      var widest = 0;
      items.forEach(function (item) { widest = Math.max(widest, item.mm * pxPerMm); });
      column = Math.min(10 + widest + 16, width - reserve - 10);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    items.forEach(function (item) {
      var span = item.mm * pxPerMm;
      var height = rowHeight(item, pxPerMm);
      var cy = y + height / 2;
      var on = pick() === item;
      var after = slots ? drawSlot(item, cy, span, length, on)
        : set().kind === 'hex' ? Math.max(column, drawHex(item, cy, span, on))
        : drawHalf(item, cy, span, on);

      ctx.font = (on ? '700 ' : '600 ') + '17px system-ui, -apple-system, sans-serif';
      var need = ctx.measureText(item.label).width;
      /* Neben die Form, wenn dort Platz ist – sonst hinein. */
      var lx = after + need < width - 10 ? after : Math.max(16, after / 2 - need / 2);

      ctx.fillStyle = on ? css('--accent') : css('--text');
      ctx.fillText(item.label, lx, item.sub ? cy - 8 : cy);

      if (item.sub) {
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = css('--text-dim');
        ctx.fillText(item.sub, lx, cy + 10);
      }

      hits.push({ item: item, top: y, bottom: y + height });
      y += height;
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
    var height = Math.max(room, listHeight(set().items, pxPerMm));
    var h = top + height + bottom;

    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    hits = [];
    ctx.save();
    ctx.translate(0, top);
    drawList(w, pxPerMm);
    ctx.restore();

    /* Die Trefferflächen gelten im Bild, nicht im verschobenen System. */
    hits.forEach(function (hit) {
      hit.top += top;
      hit.bottom += top;
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

  function hitAt(y) {
    var best = null;
    var bestDist = Infinity;

    hits.forEach(function (hit) {
      /* Jedes Maß bekommt sein ganzes Band – getroffen wird es leicht. */
      var dist = Math.max(hit.top - y, y - hit.bottom);

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
    /* Der gewählte Knopf soll auch sichtbar sein, wenn die Leiste schiebt. */
    els.buttons.forEach(function (btn) {
      if (btn.dataset.gauge === key && btn.scrollIntoView) {
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
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
      var item = hitAt(event.clientY - rect.top);
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
