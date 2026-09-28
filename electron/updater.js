'use strict';
/* Update system (ready for 1.1.0 / 1.2.0 / 2.0.0 …). Offline-safe: every step fails gracefully and the game keeps running.
   1. Update Checker   — reads "bctUpdate.manifestUrl" from package.json (empty = updates disabled)
   2. Version Check    — manifest { "version": "1.1.0", "url": "https://…/BLOCK-CITY-TYCOON-Setup-1.1.0.exe", "sha256": "…", "notes": "…" }
   3. Download Update  — installer is downloaded to %TEMP% and its SHA-256 is verified
   4. Install Update   — the installer is started and the game quits (saves are in %APPDATA%, never in the install folder) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function parseVersion(v) { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '')); return m ? [+m[1], +m[2], +m[3]] : null; }
function isNewer(a, b) {           // a > b ?
  const x = parseVersion(a), y = parseVersion(b); if (!x || !y) return false;
  for (let i = 0; i < 3; i++) { if (x[i] > y[i]) return true; if (x[i] < y[i]) return false; }
  return false;
}

function createUpdater(opts) {
  const { app, net, shell, log, manifestUrl } = opts;
  let pending = null;          // { version, url, sha256, notes }
  let downloaded = null;       // installer path

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, ms);
    try { return await net.fetch(url, { signal: ctrl.signal, cache: 'no-store' }); } finally { clearTimeout(t); }
  }
  async function check() {
    const current = app.getVersion();
    if (!manifestUrl) return { status: 'disabled', current: current };
    if (!/^https:\/\//.test(manifestUrl)) return { status: 'error', current: current, message: 'manifestUrl must use https' };
    try {
      const res = await fetchWithTimeout(manifestUrl, 6000);
      if (!res.ok) return { status: 'error', current: current, message: 'HTTP ' + res.status };
      const m = await res.json();
      if (!m || !parseVersion(m.version) || !/^https:\/\//.test(m.url || '')) return { status: 'error', current: current, message: 'invalid manifest' };
      if (!isNewer(m.version, current)) { pending = null; return { status: 'latest', current: current, latest: m.version }; }
      pending = { version: m.version, url: m.url, sha256: String(m.sha256 || '').toLowerCase(), notes: String(m.notes || '').slice(0, 2000) };
      log.info('Update available: ' + current + ' → ' + m.version);
      return { status: 'available', current: current, latest: m.version, notes: pending.notes };
    } catch (e) {
      log.info('Update check skipped (offline or unreachable): ' + e.message);
      return { status: 'offline', current: current, message: e.message };
    }
  }
  async function download(onProgress) {
    if (!pending) return { ok: false, error: 'no update available — run check first' };
    try {
      const res = await fetchWithTimeout(pending.url, 10 * 60 * 1000);
      if (!res.ok || !res.body) return { ok: false, error: 'HTTP ' + res.status };
      const total = +res.headers.get('content-length') || 0;
      const file = path.join(os.tmpdir(), 'BLOCK-CITY-TYCOON-Update-' + pending.version + '.exe');
      const out = fs.createWriteStream(file);
      const hash = crypto.createHash('sha256');
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const r = await reader.read(); if (r.done) break;
        const buf = Buffer.from(r.value); hash.update(buf); got += buf.length;
        if (!out.write(buf)) await new Promise(function (ok) { out.once('drain', ok); });
        if (onProgress && total) onProgress(got / total);
      }
      await new Promise(function (ok, bad) { out.end(ok); out.on('error', bad); });
      const digest = hash.digest('hex');
      if (pending.sha256 && digest !== pending.sha256) { fs.unlinkSync(file); return { ok: false, error: 'checksum mismatch' }; }
      downloaded = file;
      log.info('Update downloaded: ' + file + ' (' + got + ' bytes)');
      return { ok: true, file: file, version: pending.version };
    } catch (e) { log.warn('Update download failed: ' + e.message); return { ok: false, error: e.message }; }
  }
  async function install(beforeQuit) {
    if (!downloaded || !fs.existsSync(downloaded)) return { ok: false, error: 'nothing downloaded' };
    const err = await shell.openPath(downloaded);
    if (err) return { ok: false, error: err };
    log.info('Starting update installer and quitting');
    if (beforeQuit) beforeQuit();
    setTimeout(function () { app.quit(); }, 500);
    return { ok: true };
  }
  return { check: check, download: download, install: install, isNewer: isNewer };
}

module.exports = { createUpdater: createUpdater, isNewer: isNewer };
