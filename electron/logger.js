'use strict';
/* Log file: <userData>/logs/latest.log (the previous run is kept as previous.log).
   Lines look like:  [18:30:10] Game started   ·   [18:31:42] WARNING: Missing asset: … */
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 4 * 1024 * 1024;

function createLogger(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'latest.log');
  try { if (fs.existsSync(file)) fs.renameSync(file, path.join(dir, 'previous.log')); } catch (e) { /* locked: keep appending */ }
  let bytes = 0;
  const stamp = function () { const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  function write(level, msg) {
    const lvl = level === 'info' ? '' : String(level).toUpperCase() + ': ';
    const line = '[' + stamp() + '] ' + lvl + String(msg).replace(/[\r\n]+/g, ' ⏎ ').slice(0, 4000) + '\n';
    if (bytes > MAX_BYTES) return;                 // runaway error loops never fill the disk
    try { fs.appendFileSync(file, line, 'utf8'); bytes += line.length; } catch (e) { /* disk full / locked: logging is best effort */ }
    if (process.env.BCT_LOG_STDOUT === '1') process.stdout.write(line);
  }
  write('info', 'Log started ' + new Date().toISOString());
  return {
    file: file, dir: dir,
    info: function (m) { write('info', m); },
    warn: function (m) { write('warning', m); },
    error: function (m) { write('error', m); },
    debug: function (m) { write('debug', m); },
    write: write
  };
}

module.exports = { createLogger: createLogger };
