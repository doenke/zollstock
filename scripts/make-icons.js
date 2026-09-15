/* Erzeugt die PNG-Icons der PWA ohne externe Abhängigkeiten.
 * Aufruf: node scripts/make-icons.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [17, 20, 24, 255];
const ACCENT = [255, 176, 32, 255];
const INK = [26, 18, 5, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // Bittiefe
  ihdr[9] = 6;   // Farbtyp RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function canvas(size, color) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) buf.set(color, i * 4);
  return { size, buf };
}

function rect(img, x0, y0, x1, y1, color, radius = 0) {
  const s = img.size;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(s, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(s, Math.round(x1)); x++) {
      if (radius > 0) {
        const dx = Math.min(x - x0, x1 - 1 - x);
        const dy = Math.min(y - y0, y1 - 1 - y);
        if (dx < radius && dy < radius) {
          const d = Math.hypot(radius - dx, radius - dy);
          if (d > radius) continue;
        }
      }
      img.buf.set(color, (y * s + x) * 4);
    }
  }
}

function drawIcon(size, inset) {
  const img = canvas(size, BG);
  const u = size;
  const left = u * inset;
  const right = u * (1 - inset);
  const top = u * 0.355;
  const bottom = u * 0.645;

  rect(img, left, top, right, bottom, ACCENT, u * 0.035);

  const span = right - left;
  const tickWidth = Math.max(2, u * 0.022);
  for (let i = 1; i <= 7; i++) {
    const x = left + (span * i) / 8;
    const long = i % 2 === 1;
    rect(img, x - tickWidth / 2, top, x + tickWidth / 2, top + (bottom - top) * (long ? 0.55 : 0.32), INK);
  }

  return encodePng(size, img.buf);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

[
  ['icon-192.png', 192, 0.11],
  ['icon-512.png', 512, 0.11],
  ['icon-180.png', 180, 0.11],
  ['icon-maskable-512.png', 512, 0.22]
].forEach(([name, size, inset]) => {
  fs.writeFileSync(path.join(out, name), drawIcon(size, inset));
  console.log('geschrieben:', name);
});
