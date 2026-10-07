'use strict';
/* BLOCK CITY TYCOON — PLATFORM: one API for the Windows desktop app (Electron, via preload.js) and the browser.
   Storage (saves on disk in the desktop app, localStorage in the browser), log file, global settings (settings.json),
   native file dialogs, screenshots and window control. Loaded before every other game file. */

const BCT = (typeof window !== 'undefined' && window.bct) ? window.bct : null;   // exposed by preload.js (desktop only)
const DESKTOP = !!(BCT && BCT.isDesktop);
const DEV_MODE = !!(BCT && BCT.dev);
const GAME_VERSION = (BCT && BCT.version) || '1.3.0';

/* --- Storage: same interface as localStorage. Desktop: every key is a file in %APPDATA%\Block City Tycoon\ (atomic writes) --- */
const Store = (function () {
  if (DESKTOP) {
    let cache = {};
    try { cache = BCT.store.loadAll() || {}; } catch (e) { cache = {}; }
    return {
      desktop: true,
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
      setItem: function (k, v) {
        v = String(v);
        const r = BCT.store.write(k, v);                 // main process: write .tmp → verify → replace
        if (!r || !r.ok) throw new Error('Disk write failed: ' + ((r && r.error) || 'unknown error'));
        cache[k] = v;
      },
      removeItem: function (k) { delete cache[k]; try { BCT.store.remove(k); } catch (e) { /* file already gone */ } },
      keys: function () { return Object.keys(cache); }
    };
  }
  return {
    desktop: false,
    getItem: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) { window.localStorage.setItem(k, String(v)); },
    removeItem: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
    keys: function () { try { return Object.keys(window.localStorage); } catch (e) { return []; } }
  };
})();

/* --- Log: desktop → %APPDATA%\Block City Tycoon\logs\latest.log; browser → in-memory (shown in the F3 debug panel) --- */
const Log = {
  lines: [],
  write: function (level, msg) {
    const d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    const line = '[' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '] ' + (level === 'info' ? '' : level.toUpperCase() + ': ') + String(msg).slice(0, 2000);
    this.lines.push(line); if (this.lines.length > 300) this.lines.shift();
    if (DESKTOP) { try { BCT.log(level, String(msg).slice(0, 2000)); } catch (e) { /* logging must never break the game */ } }
  },
  info: function (m) { this.write('info', m); },
  warn: function (m) { this.write('warning', m); },
  error: function (m) { this.write('error', m); },
  debug: function (m) { if (DEV_MODE) this.write('debug', m); }
};
window.addEventListener('error', function (e) {
  if (e && e.target && e.target !== window && (e.target.src || e.target.href)) { Log.warn('Missing asset: ' + (e.target.src || e.target.href)); return; }
  Log.error('Uncaught ' + (e.message || 'error') + (e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno : ''));
}, true);
window.addEventListener('unhandledrejection', function (e) { Log.error('Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason)); });

/* --- Shell texts (splash, dialogs, desktop settings) in English and Turkish --- */
const SHELL_TEXT = {
  en: {
    engine: 'Loading engine...', city: 'Loading city systems...', economy: 'Loading economy...', citizens: 'Loading citizens...', traffic: 'Loading traffic...',
    world: 'Loading world...', ui: 'Loading interface...', ready: 'Ready!', failed: 'Loading failed — see logs/latest.log',
    rWorld: 'World', rBuildings: 'Buildings', rEconomy: 'Economy', rCitizens: 'Citizens', rTraffic: 'Traffic', rUI: 'UI',
    exitTitle: 'EXIT BLOCK CITY TYCOON?', exitSaved: 'Your city has been automatically saved.', exitNotSaved: '⚠️ Your city could not be saved automatically. Exit anyway?', exit: 'EXIT', cancel: 'CANCEL',
    recTitle: 'PREVIOUS SESSION RECOVERY', recText: 'Your previous session was not closed correctly.', recover: 'RECOVER', loadLast: 'LOAD LAST SAVE', discard: 'DISCARD',
    impTitle: 'IMPORT OLD BROWSER SAVE', impText: 'Did you play Block City Tycoon in Chrome or Edge before? Browser saves live inside the browser, so bring them over once:<br>1. Open the game in your browser (src/index.html or your old index.html).<br>2. Settings → <b>📦 Export all saves</b> (or <b>⬇️ Download .json</b> for a single city).<br>3. Choose that file here.',
    impChoose: '📂 CHOOSE FILE…', skip: 'SKIP', desktop: 'Desktop & system', language: 'Language', autosave: 'Autosave', interval: 'Autosave interval',
    volume: 'Master volume', particles: 'Particles', shadows: 'Shadows', npc: 'NPC density', traffic2: 'Traffic density', pauseBlur: 'Pause when the window loses focus',
    resolution: 'Resolution', windowMode: 'Window mode', windowed: 'Windowed', fullscreen: 'Fullscreen', borderless: 'Borderless', restartNote: 'Borderless mode applies after a restart.', applyRestart: '↻ Save & restart',
    folders: 'Folders', saves: '📂 Saves', shots: '🖼️ Screenshots', logs: '📜 Logs', exportAll: '📦 Export all saves', importOld: '📦 Import old browser save', updates: '⬆️ Check for updates', version: 'Version'
  },
  tr: {
    engine: 'Motor yükleniyor...', city: 'Şehir sistemleri yükleniyor...', economy: 'Ekonomi yükleniyor...', citizens: 'Vatandaşlar yükleniyor...', traffic: 'Trafik yükleniyor...',
    world: 'Dünya yükleniyor...', ui: 'Arayüz yükleniyor...', ready: 'Hazır!', failed: 'Yükleme başarısız — logs/latest.log dosyasına bakın',
    rWorld: 'Dünya', rBuildings: 'Binalar', rEconomy: 'Ekonomi', rCitizens: 'Vatandaşlar', rTraffic: 'Trafik', rUI: 'Arayüz',
    exitTitle: 'BLOCK CITY TYCOON KAPATILSIN MI?', exitSaved: 'Şehriniz otomatik olarak kaydedildi.', exitNotSaved: '⚠️ Şehriniz otomatik kaydedilemedi. Yine de çıkılsın mı?', exit: 'ÇIKIŞ', cancel: 'İPTAL',
    recTitle: 'ÖNCEKİ OTURUMU KURTAR', recText: 'Önceki oturum düzgün kapatılmadı.', recover: 'KURTAR', loadLast: 'SON KAYDI YÜKLE', discard: 'YOK SAY',
    impTitle: 'ESKİ TARAYICI KAYDINI İÇE AKTAR', impText: 'Block City Tycoon\'u daha önce Chrome veya Edge\'de oynadınız mı? Tarayıcı kayıtları tarayıcının içinde durur; bir kez aktarın:<br>1. Oyunu tarayıcıda açın (src/index.html veya eski index.html).<br>2. Ayarlar → <b>📦 Export all saves</b> (tek şehir için <b>⬇️ Download .json</b>).<br>3. O dosyayı burada seçin.',
    impChoose: '📂 DOSYA SEÇ…', skip: 'ATLA', desktop: 'Masaüstü ve sistem', language: 'Dil', autosave: 'Otomatik kayıt', interval: 'Otomatik kayıt aralığı',
    volume: 'Ana ses', particles: 'Parçacıklar', shadows: 'Gölgeler', npc: 'NPC yoğunluğu', traffic2: 'Trafik yoğunluğu', pauseBlur: 'Pencere odağı kaybedince duraklat',
    resolution: 'Çözünürlük', windowMode: 'Pencere modu', windowed: 'Pencere', fullscreen: 'Tam ekran', borderless: 'Kenarlıksız', restartNote: 'Kenarlıksız mod yeniden başlatınca uygulanır.', applyRestart: '↻ Kaydet ve yeniden başlat',
    folders: 'Klasörler', saves: '📂 Kayıtlar', shots: '🖼️ Ekran görüntüleri', logs: '📜 Loglar', exportAll: '📦 Tüm kayıtları dışa aktar', importOld: '📦 Eski tarayıcı kaydını aktar', updates: '⬆️ Güncellemeleri denetle', version: 'Sürüm'
  }
};
function T(key) { const L = SHELL_TEXT[GSET.language] || SHELL_TEXT.en; return L[key] !== undefined ? L[key] : (SHELL_TEXT.en[key] !== undefined ? SHELL_TEXT.en[key] : key); }

/* --- Global settings: settings.json (desktop) / localStorage "bct_settings" (browser). Shared by all cities. --- */
const GSET_KEY = 'bct_settings';
const RESOLUTIONS = ['1024x600', '1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440'];
function defaultGSET() {
  const small = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && Math.min(screen.width, screen.height) < 820;
  return {
    settingsVersion: 1, resolution: '1280x720', fullscreen: false, borderless: false,
    music: false, sfx: true, masterVolume: 80, graphics: small ? 'LOW' : 'HIGH', particles: 'ON', shadows: true,
    npcDensity: 100, trafficDensity: 100, autosave: true, autosaveInterval: 30, language: (navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en',
    pauseOnBlur: false, browserImportPrompted: false, localMigrated: false, adminEnabled: false
  };
}
function sanitizeGSET(src) {
  const d = defaultGSET(), o = Object.assign({}, d);
  if (!src || typeof src !== 'object') return o;
  const pickIn = function (v, list, def) { return list.indexOf(v) >= 0 ? v : def; };
  const n = function (v, def, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  o.resolution = pickIn(src.resolution, RESOLUTIONS, d.resolution);
  ['fullscreen', 'borderless', 'music', 'pauseOnBlur', 'browserImportPrompted', 'localMigrated', 'adminEnabled'].forEach(function (k) { o[k] = !!src[k]; });
  ['sfx', 'shadows', 'autosave'].forEach(function (k) { o[k] = src[k] === undefined ? d[k] : !!src[k]; });
  o.masterVolume = Math.round(n(src.masterVolume, d.masterVolume, 0, 100));
  o.graphics = pickIn(src.graphics, ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'], d.graphics);
  o.particles = pickIn(src.particles, ['ON', 'REDUCED', 'OFF'], d.particles);
  o.npcDensity = pickIn(Number(src.npcDensity), [25, 50, 75, 100, 150, 200], d.npcDensity);
  o.trafficDensity = pickIn(Number(src.trafficDensity), [25, 50, 75, 100, 150, 200], d.trafficDensity);
  o.autosaveInterval = pickIn(Number(src.autosaveInterval), [15, 30, 60, 120, 300], d.autosaveInterval);
  o.language = pickIn(src.language, Object.keys(SHELL_TEXT), d.language);
  return o;
}
let GSET = (function () { try { return sanitizeGSET(JSON.parse(Store.getItem(GSET_KEY) || 'null')); } catch (e) { return sanitizeGSET(null); } })();
GSET._rev = 1;
function saveGSET() {
  GSET._rev++;
  const out = {}; for (const k in GSET) if (k.charAt(0) !== '_') out[k] = GSET[k];
  try { Store.setItem(GSET_KEY, JSON.stringify(out, null, 2)); } catch (e) { Log.warn('settings.json could not be written: ' + e.message); }
}
function autosaveInterval() { return GSET.autosaveInterval || 30; }
function masterVolume() { return GSET.masterVolume / 100; }
/* Quality preset × global density settings (cached until a setting changes) */
const PERF_CACHE = { q: null, rev: 0, out: null };
function perfPreset(q) {
  if (PERF_CACHE.q === q && PERF_CACHE.rev === GSET._rev) return PERF_CACHE.out;
  const o = Object.assign({}, q);
  o.npc = Math.max(4, Math.round(q.npc * GSET.npcDensity / 100));
  o.veh = Math.max(2, Math.round(q.veh * GSET.trafficDensity / 100));
  o.shadow = q.shadow && GSET.shadows;
  o.part = GSET.particles === 'OFF' ? 0 : q.part;
  PERF_CACHE.q = q; PERF_CACHE.rev = GSET._rev; PERF_CACHE.out = o;
  return o;
}
/* Game settings (per city) ⇄ global settings (per installation) */
function applyGlobalSettingsToGame() {
  if (typeof S === 'undefined' || !S || !S.settings) return;
  const se = S.settings;
  se.sound = GSET.sfx; se.music = GSET.music;
  if (QUALITY_PRESETS[GSET.graphics]) se.quality = GSET.graphics;
  se.particleReduce = GSET.particles === 'REDUCED';
}
function syncGSETFromGame() {
  if (typeof S === 'undefined' || !S || !S.settings) return;
  const se = S.settings;
  GSET.sfx = !!se.sound; GSET.music = !!se.music;
  if (QUALITY_PRESETS[se.quality]) GSET.graphics = se.quality;
  if (GSET.particles !== 'OFF') GSET.particles = se.particleReduce ? 'REDUCED' : 'ON';
  saveGSET();
}

/* --- Native services (Windows dialogs, Pictures folder, window) with browser fallbacks --- */
function safeFileName(s) { return String(s || 'city').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'city'; }
function browserDownload(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
const Platform = {
  desktop: DESKTOP,
  /* Save text through the Windows "Save as" dialog (browser: download) → Promise<{ok, path?, canceled?, error?}> */
  saveTextFile: function (defaultName, text, filterName, ext) {
    ext = ext || 'json';
    if (DESKTOP) return BCT.files.saveText({ defaultName: defaultName, text: text, filters: [{ name: filterName || 'City save', extensions: [ext] }] });
    try {
      const url = URL.createObjectURL(new Blob([text], { type: ext === 'json' ? 'application/json' : 'text/plain' }));
      browserDownload(url, defaultName); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return Promise.resolve({ ok: true, path: defaultName });
    } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
  },
  /* Pick a text file with the Windows "Open" dialog (browser: file input) → Promise<{ok, text?, name?, canceled?}> */
  openTextFile: function (filterName, exts) {
    exts = exts || ['json'];
    if (DESKTOP) return BCT.files.openText({ filters: [{ name: filterName || 'City save', extensions: exts }, { name: 'All files', extensions: ['*'] }] });
    return new Promise(function (resolve) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = exts.map(function (e) { return '.' + e; }).join(',');
      inp.onchange = function () {
        const f = inp.files && inp.files[0]; if (!f) { resolve({ ok: false, canceled: true }); return; }
        if (f.size > 64e6) { resolve({ ok: false, error: 'File too large' }); return; }
        const r = new FileReader(); r.onload = function () { resolve({ ok: true, text: String(r.result || ''), name: f.name }); }; r.onerror = function () { resolve({ ok: false, error: 'Read failed' }); }; r.readAsText(f);
      };
      inp.click();
    });
  },
  /* Choose a folder (desktop only) → Promise<{ok, path?}> */
  selectFolder: function (title) { return DESKTOP ? BCT.files.selectFolder({ title: title || 'Select folder' }) : Promise.resolve({ ok: false, error: 'Only available in the desktop app' }); },
  /* PNG data URL → Pictures\BLOCK CITY TYCOON\name.png (browser: download) */
  savePicture: function (dataUrl, name) {
    if (DESKTOP) return BCT.files.savePicture({ name: name, dataUrl: dataUrl });
    browserDownload(dataUrl, name); return Promise.resolve({ ok: true, path: name });
  },
  /* Window screenshot (the whole game window as the player sees it) */
  screenshot: function (name) {
    if (DESKTOP) return BCT.window.screenshot({ name: name });
    try { return Platform.savePicture(canvas.toDataURL('image/png'), name); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
  },
  toggleFullscreen: function () {
    if (DESKTOP) return BCT.window.toggleFullscreen().then(function (r) { GSET.fullscreen = !!(r && r.fullscreen); saveGSET(); return r; });
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* not allowed */ }
    return Promise.resolve({ ok: true, fullscreen: !document.fullscreenElement });
  },
  applyWindow: function () { return DESKTOP ? BCT.window.apply({ resolution: GSET.resolution, fullscreen: GSET.fullscreen, borderless: GSET.borderless }) : Promise.resolve({ ok: true }); },
  openFolder: function (kind) { return DESKTOP ? BCT.app.openFolder(kind) : Promise.resolve({ ok: false }); },
  checkForUpdates: function () { return DESKTOP ? BCT.updates.check() : Promise.resolve({ status: 'browser', current: GAME_VERSION }); },
  downloadUpdate: function () { return DESKTOP ? BCT.updates.download() : Promise.resolve({ ok: false }); },
  installUpdate: function () { return DESKTOP ? BCT.updates.install() : Promise.resolve({ ok: false }); },
  relaunch: function () { if (DESKTOP) BCT.app.relaunch(); else location.reload(); },
  quit: function () { if (DESKTOP) BCT.app.quit(); }
};

/* --- Assets: images load with a fallback, and a missing file is written to the log instead of breaking the page --- */
const Assets = {
  image: function (img, src, fallback) {
    img.onerror = function () { Log.warn('Missing asset: ' + src + ' (using fallback)'); img.onerror = null; if (typeof fallback === 'function') fallback(img); else img.style.display = 'none'; };
    img.src = src;
    return img;
  }
};

Log.info('Game started — BLOCK CITY TYCOON v' + GAME_VERSION + (DESKTOP ? ' (desktop app' + (DEV_MODE ? ', development mode' : '') + ')' : ' (browser)'));
