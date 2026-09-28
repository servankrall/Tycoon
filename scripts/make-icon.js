'use strict';
/* Regenerates src/assets/icons/icon.ico (16, 24, 32, 48, 64, 128, 256 px) and icon.png (512 px) from icon.svg.
   Run with:  npm run icon   (uses the project's own Electron to rasterize the SVG — no extra tools needed).
   ICO layout: 16–128 px as 32-bit BMP entries (best compatibility with Explorer and NSIS), 256 px as PNG. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'assets', 'icons');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function bmpEntry(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14); header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = ((size - 1 - y) * size + x) * 4, d = (y * size + x) * 4;       // bottom-up BGRA
      pixels[d] = rgba[s + 2]; pixels[d + 1] = rgba[s + 1]; pixels[d + 2] = rgba[s]; pixels[d + 3] = rgba[s + 3];
    }
  }
  const rowMask = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(rowMask * size);                                     // AND mask (all 0: alpha channel is used)
  return Buffer.concat([header, pixels, mask]);
}
function buildIco(entries) {
  const head = Buffer.alloc(6 + entries.length * 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(function (e, i) {
    const o = 6 + i * 16;
    head.writeUInt8(e.size >= 256 ? 0 : e.size, o); head.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(e.data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });
  return Buffer.concat([head].concat(entries.map(function (e) { return e.data; })));
}

app.whenReady().then(async function () {
  const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { offscreen: true, contextIsolation: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const js = '(' + function (svgText, sizes) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        const out = {};
        sizes.concat([512]).forEach(function (s) {
          const c = document.createElement('canvas'); c.width = s; c.height = s;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, s, s);
          out[s] = { rgba: Array.from(g.getImageData(0, 0, s, s).data), png: c.toDataURL('image/png') };
        });
        resolve(out);
      };
      img.onerror = function () { reject(new Error('SVG could not be rendered')); };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
    });
  }.toString() + ')(' + JSON.stringify(svg) + ',' + JSON.stringify(SIZES) + ')';
  try {
    const r = await win.webContents.executeJavaScript(js);
    const entries = SIZES.map(function (s) {
      const png = Buffer.from(r[s].png.split(',')[1], 'base64');
      return { size: s, data: s >= 256 ? png : bmpEntry(s, r[s].rgba) };
    });
    fs.writeFileSync(path.join(DIR, 'icon.ico'), buildIco(entries));
    fs.writeFileSync(path.join(DIR, 'icon.png'), Buffer.from(r[512].png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(DIR, 'icon-256.png'), Buffer.from(r[256].png.split(',')[1], 'base64'));
    console.log('icon.ico (' + SIZES.join(', ') + ' px), icon.png (512 px) and icon-256.png written to ' + DIR);
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
