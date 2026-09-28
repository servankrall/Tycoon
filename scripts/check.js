'use strict';
/* Pre-build check: every script the game loads exists and parses, and the icon is in place.
   Run with:  npm run check   (also runs automatically before npm run build). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const fail = function (m) { console.error('✖ ' + m); failed++; };
const ok = function (m) { console.log('✔ ' + m); };

const loader = fs.readFileSync(path.join(ROOT, 'src/js/boot/loader.js'), 'utf8');
const files = Array.from(loader.matchAll(/\['[a-z]+', '([a-z0-9-]+\.js)'\]/g)).map(function (m) { return m[1]; });
if (files.length < 20) fail('loader.js script list not found');
files.concat(['boot/loader.js']).forEach(function (f) {
  const p = path.join(ROOT, 'src/js', f);
  if (!fs.existsSync(p)) { fail('missing src/js/' + f); return; }
  try { new vm.Script(fs.readFileSync(p, 'utf8'), { filename: f }); } catch (e) { fail('syntax error in src/js/' + f + ': ' + e.message); }
});
ok(files.length + ' game scripts parse');
['main.js', 'preload.js', 'electron/storage.js', 'electron/logger.js', 'electron/session.js', 'electron/updater.js'].forEach(function (f) {
  try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); } catch (e) { fail('syntax error in ' + f + ': ' + e.message); }
});
ok('Electron main process scripts parse');
const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
Array.from(html.matchAll(/(?:src|href)="([^"#?:]+)"/g)).forEach(function (m) { if (!fs.existsSync(path.join(ROOT, 'src', m[1]))) fail('index.html references missing file ' + m[1]); });
ok('index.html references resolve');
const ico = path.join(ROOT, 'src/assets/icons/icon.ico');
if (!fs.existsSync(ico)) fail('src/assets/icons/icon.ico is missing (run npm run icon)');
else {
  const b = fs.readFileSync(ico);
  const n = b.readUInt16LE(4), sizes = [];
  for (let i = 0; i < n; i++) sizes.push(b[6 + i * 16] || 256);
  [16, 32, 48, 64, 128, 256].forEach(function (s) { if (sizes.indexOf(s) < 0) fail('icon.ico lacks ' + s + 'x' + s); });
  ok('icon.ico contains ' + sizes.join(', ') + ' px');
}
const pkg = require(path.join(ROOT, 'package.json'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail('package.json version must be x.y.z');
ok('version ' + pkg.version);
if (failed) { console.error(failed + ' problem(s) — fix them before building.'); process.exit(1); }
console.log('All checks passed.');
