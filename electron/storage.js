'use strict';
/* Save storage for the desktop app.
   Every storage key of the game becomes a file inside the user data folder (%APPDATA%\BLOCK CITY TYCOON):
     bct_pro_save            → saves/city_01.json          bct_pro_save_2 … _4 → saves/city_02.json …
     bct_pro_save_backup     → saves/city_01.backup.json   bct_pro_save_N_backup → saves/city_0N.backup.json
     bct_recovery            → saves/recovery.json         bct_active_slot       → saves/active_slot.txt
     bct_settings            → settings.json               bct_profile           → profile.json
     anything else           → data/<key>.dat
   Writes never touch the real file first: <file>.tmp is written, flushed, read back and verified, then renamed over the old file. */
const fs = require('fs');
const path = require('path');

const KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const pad = function (n) { return String(n).padStart(2, '0'); };

function createStorage(root, log) {
  function keyToRel(key) {
    if (!KEY_RE.test(key)) return null;
    let m;
    if (key === 'bct_pro_save') return 'saves/city_01.json';
    if (key === 'bct_pro_save_backup') return 'saves/city_01.backup.json';
    if ((m = /^bct_pro_save_(\d{1,2})$/.exec(key))) return 'saves/city_' + pad(m[1]) + '.json';
    if ((m = /^bct_pro_save_(\d{1,2})_backup$/.exec(key))) return 'saves/city_' + pad(m[1]) + '.backup.json';
    if (key === 'bct_recovery') return 'saves/recovery.json';
    if (key === 'bct_active_slot') return 'saves/active_slot.txt';
    if (key === 'bct_settings') return 'settings.json';
    if (key === 'bct_profile') return 'profile.json';
    return 'data/' + key + '.dat';
  }
  function relToKey(rel) {
    rel = rel.replace(/\\/g, '/');
    let m;
    if ((m = /^saves\/city_(\d{2})\.json$/.exec(rel))) return +m[1] === 1 ? 'bct_pro_save' : 'bct_pro_save_' + (+m[1]);
    if ((m = /^saves\/city_(\d{2})\.backup\.json$/.exec(rel))) return +m[1] === 1 ? 'bct_pro_save_backup' : 'bct_pro_save_' + (+m[1]) + '_backup';
    if (rel === 'saves/recovery.json') return 'bct_recovery';
    if (rel === 'saves/active_slot.txt') return 'bct_active_slot';
    if (rel === 'settings.json') return 'bct_settings';
    if (rel === 'profile.json') return 'bct_profile';
    if ((m = /^data\/([A-Za-z0-9_.-]{1,64})\.dat$/.exec(rel))) return m[1];
    return null;
  }
  const abs = function (rel) { return path.join(root, rel); };
  function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  /* Windows can briefly lock a file (antivirus, indexer): retry a few times */
  function retry(fn) {
    let last;
    for (let i = 0; i < 6; i++) {
      try { return fn(); } catch (e) { last = e; if (!/EPERM|EBUSY|EACCES/.test(e.code || '')) throw e; sleep(40 * (i + 1)); }
    }
    throw last;
  }

  function ensureDirs() { ['saves', 'data'].forEach(function (d) { fs.mkdirSync(abs(d), { recursive: true }); }); }

  /* Read every known file once at startup (sent synchronously to the renderer's Store cache) */
  function loadAll() {
    ensureDirs();
    const out = {};
    const add = function (rel) {
      const key = relToKey(rel); if (!key) return;
      try { out[key] = fs.readFileSync(abs(rel), 'utf8'); } catch (e) { log.warn('Could not read ' + rel + ': ' + e.message); }
    };
    ['settings.json', 'profile.json'].forEach(function (f) { if (fs.existsSync(abs(f))) add(f); });
    ['saves', 'data'].forEach(function (dir) {
      fs.readdirSync(abs(dir)).forEach(function (f) { if (!/\.tmp$/.test(f)) add(dir + '/' + f); });
    });
    return out;
  }

  /* Atomic write: tmp → fsync → verify → rename */
  function write(key, value) {
    const rel = keyToRel(key);
    if (!rel) return { ok: false, error: 'invalid key' };
    if (typeof value !== 'string') return { ok: false, error: 'value must be text' };
    const file = abs(rel), tmp = file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(tmp, 'w');
      try { fs.writeSync(fd, value, 0, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const back = fs.readFileSync(tmp, 'utf8');
      if (back !== value) throw new Error('verification failed (read-back mismatch)');
      if (/\.json$/.test(rel)) JSON.parse(back);           // a save that does not parse never replaces the old one
      retry(function () { fs.renameSync(tmp, file); });
      return { ok: true, file: rel, bytes: Buffer.byteLength(value) };
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
      log.error('Save write failed for ' + rel + ': ' + e.message);
      return { ok: false, error: e.message };
    }
  }
  function remove(key) {
    const rel = keyToRel(key); if (!rel) return { ok: false };
    try { if (fs.existsSync(abs(rel))) retry(function () { fs.unlinkSync(abs(rel)); }); return { ok: true }; }
    catch (e) { log.warn('Could not delete ' + rel + ': ' + e.message); return { ok: false, error: e.message }; }
  }
  /* Leftover .tmp files mean a write was interrupted: the real file is still the last good version, so they are removed */
  function cleanupTemp() {
    let n = 0;
    ['saves', 'data', '.'].forEach(function (dir) {
      try { fs.readdirSync(abs(dir)).forEach(function (f) { if (/\.tmp$/.test(f)) { fs.unlinkSync(abs(path.join(dir, f))); n++; } }); } catch (e) { /* folder missing */ }
    });
    if (n) log.warn('Removed ' + n + ' unfinished temporary save file(s) from an interrupted write');
  }
  function readSettings() {
    try { return JSON.parse(fs.readFileSync(abs('settings.json'), 'utf8')) || {}; } catch (e) { return {}; }
  }
  return { root: root, keyToRel: keyToRel, relToKey: relToKey, loadAll: loadAll, write: write, remove: remove, cleanupTemp: cleanupTemp, readSettings: readSettings, savesDir: abs('saves') };
}

module.exports = { createStorage: createStorage };
