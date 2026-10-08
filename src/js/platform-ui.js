'use strict';
/* BLOCK CITY TYCOON — PLATFORM UI: exit confirmation, crash recovery, autosave triggers, importing old browser saves,
   desktop settings (window, volume, densities, language), Windows shortcuts (F11, F12, Ctrl+S, Shift+M) and Alt+Tab handling. */

const RECOVERY_KEY = 'bct_recovery';
const SESSION_KEY = 'bct_session';
const BUNDLE_FORMAT = 'bct-bundle';
const PSH = { recAcc: 0, lastEventSave: -1e9, dialogOpen: false, blurSpeed: null };

/* --- System dialog (above every game window) --- */
function sysDialog(title, html, buttons, escIndex) {
  const w = $('sysDialog');
  PSH.escIndex = escIndex === undefined ? buttons.length - 1 : escIndex;   // -1: Esc does nothing
  $('sysTitle').textContent = title;
  $('sysText').innerHTML = html;
  const box = $('sysBtns'); box.innerHTML = '';
  buttons.forEach(function (b) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b[1] || ''); el.textContent = b[0];
    el.onclick = function () { closeSysDialog(); if (b[2]) b[2](); };
    box.appendChild(el);
  });
  w.classList.remove('hidden'); PSH.dialogOpen = true;
  const first = box.querySelector('button'); if (first) first.focus();
}
function closeSysDialog() { $('sysDialog').classList.add('hidden'); PSH.dialogOpen = false; }

/* --- Autosave triggers: before a major crisis, after a disaster (throttled to one save per 10 s) --- */
function eventAutosave(reason) {
  if (!STARTED || !GSET.autosave) return false;
  const now = performance.now();
  if (now - PSH.lastEventSave < 10000) return false;
  PSH.lastEventSave = now;
  const ok = saveGame(true);
  Log.info('Autosave (' + reason + ')' + (ok ? '' : ' FAILED'));
  return ok;
}

/* --- Crash recovery: a snapshot of the running city every 15 s; removed on a clean exit --- */
function recoveryTick(dt) {
  PSH.recAcc += dt;
  if (PSH.recAcc < 15) return;
  PSH.recAcc = 0;
  writeRecovery();
}
function writeRecovery() {
  if (!STARTED || !S) return false;
  try {
    const obj = buildSaveObject();
    if (validateSaveObject(obj).length) return false;
    Store.setItem(RECOVERY_KEY, JSON.stringify({ slot: S.slot || 1, savedAt: Date.now(), city: S.city.name, pop: Math.floor(S.city.population), data: obj }));
    return true;
  } catch (e) { Log.warn('Recovery snapshot failed: ' + e.message); return false; }
}
function clearRecovery() { Store.removeItem(RECOVERY_KEY); PSH.recAcc = 0; }
function readRecovery() {
  try { const r = JSON.parse(Store.getItem(RECOVERY_KEY) || 'null'); return r && r.data && typeof r.data === 'object' ? r : null; } catch (e) { return null; }
}
function showRecoveryDialog(rec) {
  const when = new Date(rec.savedAt || Date.now()).toLocaleString();
  sysDialog(T('recTitle'), '<p>' + T('recText') + '</p><p class="small" style="margin-top:8px">🏙️ <b>' + esc(rec.city || 'City') + '</b> · CITY ' + String(rec.slot || 1).padStart(2, '0') + ' · Pop ' + fmt(rec.pop || 0) + ' · ' + esc(when) + '</p>', [
    [T('recover'), 'gold', function () {
      const slot = clamp(rec.slot | 0, 1, SLOT_COUNT);
      S.slot = slot;
      const r = importSave(JSON.stringify(rec.data));
      if (r.ok) { clearRecovery(); setActiveSlot(slot); clearDialogues(); CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; Log.info('Previous session recovered (slot ' + slot + ')'); startGame({ isNew: false, notes: ['Previous session recovered.'] }); }
      else { Log.error('Recovery failed: ' + r.errors.join('; ')); toast('❌ Recovery failed — loading the last save instead', 'bad'); clearRecovery(); loadSlot(slot); }
    }],
    [T('loadLast'), 'green', function () { clearRecovery(); Log.info('Recovery: loading last save'); loadSlot(clamp(rec.slot | 0, 1, SLOT_COUNT)); }]
  ].concat(lastSnapshot() ? [['📸 LAST SNAPSHOT', 'blue', function () { const sn = lastSnapshot(); clearRecovery(); Log.info('Recovery: last snapshot ' + sn.id); loadSlot(clamp(rec.slot | 0, 1, SLOT_COUNT)); setTimeout(function () { try { rollbackSnapshot(sn.id); } catch (e) { toast('❌ Snapshot could not be restored', 'bad'); } }, 600); }]] : []).concat([
    [T('discard'), '', function () { clearRecovery(); Log.info('Recovery snapshot discarded'); }]
  ]), -1);
}
function lastSnapshot() { try { const idx = snapshotIndex(); return idx.length ? idx[idx.length - 1] : null; } catch (e) { return null; } }
function androidLifecycle() {
  /* MainActivity.onPause / onResume call these directly (the WebView does not always fire visibilitychange) */
  window.bctOnPause = function () { try { if (STARTED) { saveGame(true); writeRecovery(); } Store.setItem(SESSION_KEY, 'paused'); Log.info('App paused (autosaved)'); } catch (e) { /* storage */ } return 'ok'; };
  window.bctOnResume = function () { try { Store.setItem(SESSION_KEY, 'open'); } catch (e) { /* storage */ } return 'ok'; };
  /* Android: the OS may stop a backgrounded app at any time — autosave + recovery snapshot on pause, "open" again on resume */
  document.addEventListener('visibilitychange', function () {
    if (DESKTOP) return;
    try {
      if (document.hidden) { if (STARTED) { saveGame(true); writeRecovery(); } Store.setItem(SESSION_KEY, 'paused'); Log.info('App paused (autosaved)'); }
      else { Store.setItem(SESSION_KEY, 'open'); Log.info('App resumed'); }
    } catch (e) { /* storage blocked */ }
  });
}

/* --- Exit (window X / Alt+F4): autosave, then confirm --- */
function requestExit() {
  if (PSH.dialogOpen && $('sysTitle').textContent === T('exitTitle')) return;
  let saved = true;
  if (STARTED) saved = saveGame(true);
  if (saved) clearRecovery();
  saveProfile();
  sysDialog(T('exitTitle'), '<p>' + (saved ? T('exitSaved') : T('exitNotSaved')) + '</p>', [
    [T('exit'), 'red', function () { Log.info('Exit' + (STARTED ? ' (city saved: ' + saved + ')' : '')); Store.removeItem(SESSION_KEY); Platform.quit(); }],
    [T('cancel'), '', null]
  ]);
}

/* --- Old browser saves → desktop. Browser: "Export all saves" makes one bundle file with every city and the profile. --- */
function isSaveKey(k) { return k === SAVE_KEY || /^bct_pro_save_\d+(_backup)?$/.test(k) || k === SAVE_KEY + '_backup' || k === SAVE_BACKUP_KEY; }
function bundleKeys() {
  return Store.keys().filter(function (k) { return isSaveKey(k) || k === PROFILE_KEY || k === ACTIVE_SLOT_KEY || LEGACY_SAVE_KEYS.indexOf(k) >= 0; });
}
function exportAllSaves() {
  const items = {};
  bundleKeys().forEach(function (k) { const v = Store.getItem(k); if (v) items[k] = v; });
  if (STARTED) { const cur = exportSaveJSON(); if (cur) items[slotKey(S.slot || 1)] = cur; }
  const n = Object.keys(items).filter(function (k) { return isSaveKey(k) && !/_backup$/.test(k); }).length;
  const bundle = { format: BUNDLE_FORMAT, bundleVersion: 1, gameVersion: GAME_VERSION, saveVersion: SAVE_VERSION, exported: new Date().toISOString(), items: items };
  Platform.saveTextFile('block-city-tycoon-all-saves.json', JSON.stringify(bundle), 'Block City Tycoon saves', 'json').then(function (r) {
    if (r && r.ok) { toast('📦 ' + n + ' cities exported: ' + r.path, 'good'); Log.info('All saves exported (' + n + ' cities)'); }
    else if (!(r && r.canceled)) toast('❌ Export failed', 'bad');
  });
}
function isBundleText(text) {
  const t = String(text || '').trim(); if (t.charAt(0) !== '{' || t.indexOf(BUNDLE_FORMAT) < 0) return false;
  try { const d = JSON.parse(t); return !!(d && d.format === BUNDLE_FORMAT && d.items && typeof d.items === 'object'); } catch (e) { return false; }
}
function slotOfKey(k) { if (k === SAVE_KEY) return 1; const m = /^bct_pro_save_(\d+)$/.exec(k); return m ? +m[1] : 0; }
function freeSlot(taken) { for (let n = 1; n <= SLOT_COUNT; n++) if (!slotInfo(n).exists && !taken[n]) return n; return 0; }
/* Imports every valid city of a bundle into its own slot (or the next free one); never overwrites an existing city. */
function importBundleText(text) {
  let d; try { d = JSON.parse(text); } catch (e) { toast('❌ Not a valid bundle', 'bad'); return; }
  const report = [], taken = {};
  let imported = 0, firstSlot = 0;
  Object.keys(d.items).filter(function (k) { return slotOfKey(k) > 0; }).sort().forEach(function (k) {
    let city;
    try { city = parseSaveText(d.items[k]); } catch (e) { report.push('⚠️ ' + k + ': unreadable'); return; }
    const errs = validateImport(city);
    if (errs.length) { report.push('⚠️ ' + ((city.city && city.city.name) || k) + ': ' + errs[0]); return; }
    let slot = slotOfKey(k);
    if (slot > SLOT_COUNT || slotInfo(slot).exists || taken[slot]) slot = freeSlot(taken);
    if (!slot) { report.push('⚠️ ' + esc((city.city && city.city.name) || k) + ': no free city slot'); return; }
    try {
      Store.setItem(slotKey(slot), String(d.items[k]));
      const bk = d.items[k + '_backup'] || (k === SAVE_KEY ? d.items[SAVE_BACKUP_KEY] : null);
      if (bk) Store.setItem(backupKey(slot), String(bk));
      taken[slot] = 1; imported++; if (!firstSlot) firstSlot = slot;
      report.push('✅ ' + esc((city.city && city.city.name) || 'City') + ' → CITY ' + String(slot).padStart(2, '0'));
    } catch (e) { report.push('❌ ' + k + ': ' + esc(e.message)); }
  });
  (LEGACY_SAVE_KEYS || []).forEach(function (k) { if (d.items[k] && !Store.getItem(k)) { try { Store.setItem(k, String(d.items[k])); } catch (e) { /* skip */ } } });
  if (d.items[PROFILE_KEY]) {
    const cur = PROFILE && (PROFILE.citiesCreated || 0);
    if (!cur) { try { JSON.parse(d.items[PROFILE_KEY]); Store.setItem(PROFILE_KEY, String(d.items[PROFILE_KEY])); loadProfile(); applyTheme(); report.push('✅ Player profile'); } catch (e) { report.push('⚠️ Profile: unreadable'); } }
    else report.push('ℹ️ Player profile kept (this installation already has one)');
  }
  Log.info('Bundle import: ' + imported + ' cities');
  if (firstSlot && !STARTED) { setActiveSlot(firstSlot); refreshMenuCity(firstSlot); }
  sysDialog('📦 ' + T('importOld'), '<p>' + imported + ' ' + (imported === 1 ? 'city' : 'cities') + ' imported.</p><p class="small" style="margin-top:6px">' + report.join('<br>') + '</p>', [['OK', 'gold', null]]);
}
/* After slots change in the menu: load the chosen slot as the CONTINUE city */
function refreshMenuCity(slot) {
  const res = loadGame(slot);
  resetSim(); resetAgents();
  MENU.pending = res; MENU.offline = res.isNew ? null : applyOffline();
  if (res.isNew) econTick(1);
  computeDistricts(); MENU.opts.slot = slot;
  CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20;
  if (!$('menuMain').classList.contains('hidden')) renderContinueCard();
}
function importAnyFile() {
  Platform.openTextFile('Block City Tycoon save', ['json', 'txt']).then(function (r) {
    if (!r || !r.ok) { if (r && r.error) toast('❌ ' + r.error, 'bad'); return; }
    if (isBundleText(r.text)) { importBundleText(r.text); return; }
    let d; try { d = parseSaveText(r.text); } catch (e) { toast('❌ ' + e.message, 'bad'); return; }
    const errs = validateImport(d);
    if (errs.length) { sysDialog('❌ Save rejected', '<p class="small">' + errs.map(esc).join('<br>') + '</p>', [['OK', '', null]]); return; }
    const slot = STARTED ? (S.slot || 1) : (freeSlot({}) || activeSlot());
    const go = function () {
      S.slot = slot;
      const res = importSave(r.text);
      if (!res.ok) { sysDialog('❌ Save rejected', '<p class="small">' + res.errors.map(esc).join('<br>') + '</p>', [['OK', '', null]]); return; }
      setActiveSlot(slot); clearDialogues(); CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; selectBuilding(null); applyTheme();
      Log.info('City imported from ' + r.name + ' into slot ' + slot);
      toast('✅ ' + (r.name || 'Save') + ' imported into CITY ' + String(slot).padStart(2, '0'), 'good');
      if (!STARTED) startGame({ isNew: false, notes: ['Save imported.'] });
    };
    if (slotInfo(slot).exists) confirmDialog('Replace CITY ' + String(slot).padStart(2, '0') + '?', '"' + esc(slotInfo(slot).name) + '" will be replaced by the imported city (its previous save stays as the backup).', 'Import', go);
    else go();
  });
}
function showBrowserImportPrompt() {
  GSET.browserImportPrompted = true; saveGSET();
  sysDialog(T('impTitle'), '<p class="small" style="line-height:1.6">' + T('impText') + '</p>', [[T('impChoose'), 'gold', importAnyFile], [T('skip'), '', null]]);
}
/* The desktop app's own Chromium storage (e.g. a development build that still used localStorage) is moved to files once. */
function migrateLocalStorageToDisk() {
  if (!DESKTOP || GSET.localMigrated) return 0;
  let n = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!(isSaveKey(k) || k === PROFILE_KEY || k === ACTIVE_SLOT_KEY) || Store.getItem(k)) continue;
      Store.setItem(k, window.localStorage.getItem(k)); n++;
    }
  } catch (e) { Log.warn('localStorage migration: ' + e.message); }
  GSET.localMigrated = true; saveGSET();
  if (n) Log.info('Migrated ' + n + ' localStorage entries to save files');
  return n;
}

/* --- Screenshots (F12): Windows → Pictures\BLOCK CITY TYCOON\; browser → download --- */
function takeScreenshot() {
  const d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  const name = 'BCT_' + safeFileName(S ? S.city.name : 'city') + '_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + '.png';
  const hideFlash = !PHOTO.on;
  Platform.screenshot(name).then(function (r) {
    if (r && r.ok) { if (hideFlash) flashBig('📸'); toast('📸 Screenshot saved: ' + r.path, 'good'); sfx('money'); Log.info('Screenshot ' + r.path); }
    else toast('❌ Screenshot failed: ' + ((r && r.error) || 'unknown'), 'bad');
  });
}
function toggleMinimapKey() {
  if (!STARTED) return;
  S.settings.minimap = !S.settings.minimap; $('minimap').classList.toggle('hidden', !S.settings.minimap); drawMinimap(true);
  toast('🧭 Minimap ' + (S.settings.minimap ? 'ON' : 'OFF'), ''); sfx('click');
}

/* --- Desktop & system settings (rendered inside ⚙️ Settings) --- */
function gsBtns(key, vals, labels) {
  return '<div class="row" style="flex-wrap:wrap;gap:6px">' + vals.map(function (v, i) {
    return '<button class="btn small ' + (String(GSET[key]) === String(v) ? 'gold' : '') + '" data-gset="' + key + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>';
  }).join('') + '</div>';
}
function gsTog(key, label) { return '<div class="between" style="padding:6px 0"><span>' + label + '</span><button class="btn small ' + (GSET[key] ? 'green' : '') + '" data-gset="' + key + '" data-v="' + (GSET[key] ? '0' : '1') + '">' + (GSET[key] ? 'ON' : 'OFF') + '</button></div>'; }
function globalSettingsHtml() {
  const pct = [25, 50, 75, 100, 150, 200];
  let h = '<div class="secTitle">🖥️ ' + T('desktop') + '</div>' +
    '<div class="small">' + T('language') + '</div>' + gsBtns('language', ['en', 'tr'], ['English', 'Türkçe']) +
    '<p class="small" style="margin-top:2px">Language changes the desktop shell (loading screen, dialogs, this section); the game itself is in English.</p>' +
    gsTog('autosave', '💾 ' + T('autosave')) +
    '<div class="small">' + T('interval') + '</div>' + gsBtns('autosaveInterval', [15, 30, 60, 120, 300], ['15 s', '30 s', '1 min', '2 min', '5 min']) +
    '<div class="small" style="margin-top:6px">🔈 ' + T('volume') + ' (' + GSET.masterVolume + '%)</div>' + gsBtns('masterVolume', [0, 25, 50, 80, 100], ['0', '25', '50', '80', '100']) +
    '<div class="small" style="margin-top:6px">✨ ' + T('particles') + '</div>' + gsBtns('particles', ['ON', 'REDUCED', 'OFF'], ['ON', 'REDUCED', 'OFF']) +
    gsTog('shadows', '🌗 ' + T('shadows')) +
    '<div class="small">👥 ' + T('npc') + '</div>' + gsBtns('npcDensity', pct, pct.map(function (x) { return x + '%'; })) +
    '<div class="small" style="margin-top:6px">🚗 ' + T('traffic2') + '</div>' + gsBtns('trafficDensity', pct, pct.map(function (x) { return x + '%'; })) +
    gsTog('pauseOnBlur', '⏸️ ' + T('pauseBlur'));
  if (DESKTOP) {
    const mode = GSET.borderless ? 'borderless' : GSET.fullscreen ? 'fullscreen' : 'windowed';
    h += '<div class="small" style="margin-top:6px">' + T('resolution') + '</div>' + gsBtns('resolution', RESOLUTIONS, RESOLUTIONS.map(function (r) { return r.replace('x', '×'); })) +
      '<div class="small" style="margin-top:6px">' + T('windowMode') + ' (F11)</div><div class="row" style="flex-wrap:wrap;gap:6px">' +
      [['windowed', T('windowed')], ['fullscreen', T('fullscreen')], ['borderless', T('borderless')]].map(function (m) { return '<button class="btn small ' + (mode === m[0] ? 'gold' : '') + '" data-gset="windowMode" data-v="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      (PSH.restartNeeded ? '<p class="small" style="margin-top:4px">' + T('restartNote') + ' <button class="btn small blue" data-gset="restart" data-v="1">' + T('applyRestart') + '</button></p>' : '') +
      '<div class="small" style="margin-top:6px">' + T('folders') + '</div><div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn small" data-gset="folder" data-v="saves">' + T('saves') + '</button><button class="btn small" data-gset="folder" data-v="screenshots">' + T('shots') + '</button><button class="btn small" data-gset="folder" data-v="logs">' + T('logs') + '</button></div>';
  }
  h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><button class="btn small" data-gset="exportAll" data-v="1">' + T('exportAll') + '</button><button class="btn small" data-gset="importOld" data-v="1">' + T('importOld') + '</button>' +
    (DESKTOP ? '<button class="btn small" data-gset="updates" data-v="1">' + T('updates') + '</button>' : '') + '</div>' +
    '<p class="small" style="margin-top:4px">' + T('version') + ' ' + GAME_VERSION + ' · save format v' + SAVE_VERSION + (DESKTOP ? ' · Windows desktop' : ' · browser') + '</p>';
  return h;
}
function onGsetClick(el) {
  const k = el.dataset.gset, v = el.dataset.v;
  if (k === 'folder') { Platform.openFolder(v); return; }
  if (k === 'exportAll') { exportAllSaves(); return; }
  if (k === 'importOld') { closeModal(); importAnyFile(); return; }
  if (k === 'restart') { if (STARTED) saveGame(true); clearRecovery(); saveProfile(); Store.removeItem(SESSION_KEY); Log.info('Restart to apply window mode'); Platform.relaunch(); return; }
  if (k === 'updates') {
    Platform.checkForUpdates().then(function (r) {
      const msg = r.status === 'available' ? '⬆️ Version ' + r.latest + ' is available.' : r.status === 'latest' ? '✅ You have the latest version (' + GAME_VERSION + ').' :
        r.status === 'offline' ? '📴 No connection — the game works fully offline.' : r.status === 'disabled' ? 'ℹ️ No update server is configured for this build (' + GAME_VERSION + ').' : 'ℹ️ ' + (r.message || r.status);
      if (r.status !== 'available') { toast(msg, ''); return; }
      sysDialog('⬆️ UPDATE ' + r.latest, '<p>' + esc(msg) + '</p>' + (r.notes ? '<p class="small" style="margin-top:6px">' + esc(r.notes) + '</p>' : '') + '<p class="small" style="margin-top:6px">Your cities are stored in your user folder and are kept by the update.</p>', [
        ['DOWNLOAD & INSTALL', 'gold', function () {
          if (STARTED) saveGame(true); clearRecovery(); saveProfile();
          toast('⬇️ Downloading update…', '');
          Platform.downloadUpdate().then(function (d) {
            if (!d || !d.ok) { toast('❌ Update download failed: ' + ((d && d.error) || 'unknown'), 'bad'); return; }
            Platform.installUpdate().then(function (i) { if (!i || !i.ok) toast('❌ Installer could not start: ' + ((i && i.error) || 'unknown'), 'bad'); });
          });
        }],
        ['LATER', '', null]
      ]);
    });
    return;
  }
  if (k === 'windowMode') {
    GSET.fullscreen = v === 'fullscreen'; GSET.borderless = v === 'borderless';
    saveGSET();
    Platform.applyWindow().then(function (r) {
      PSH.restartNeeded = !!(r && r.restartRequired);
      if (PSH.restartNeeded) toast(T('restartNote'), 'gold');
      if ($('modalWrap').classList.contains('show')) openSettings();
    });
    return;
  }
  const bools = ['autosave', 'shadows', 'pauseOnBlur'], nums = ['autosaveInterval', 'masterVolume', 'npcDensity', 'trafficDensity'];
  if (bools.indexOf(k) >= 0) GSET[k] = v === '1';
  else if (nums.indexOf(k) >= 0) GSET[k] = +v;
  else GSET[k] = v;
  GSET = Object.assign(sanitizeGSET(GSET), { _rev: GSET._rev });
  saveGSET();
  if (k === 'masterVolume' && SND.master) SND.master.gain.value = 0.5 * masterVolume();
  if (k === 'particles') { applyGlobalSettingsToGame(); FX.particles.length = 0; }
  if (k === 'resolution') Platform.applyWindow();
  if (k === 'language') applyShellTexts();
  sfx('click');
  if ($('modalWrap').classList.contains('show')) openSettings();
}
function applyShellTexts() {
  const v = $('titleVersion'); if (v) v.textContent = 'v' + GAME_VERSION + (DESKTOP ? '' : ' · browser');
  const ib = $('menuImportOld'); if (ib) ib.textContent = T('importOld');
  const eb = $('menuExportAll'); if (eb) eb.textContent = T('exportAll');
}

/* --- Keyboard (capture phase, before the game's own shortcuts) --- */
function onShellKey(e) {
  const k = e.key;
  if (PSH.dialogOpen) {
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); const btns = $('sysBtns').querySelectorAll('button'); if (PSH.escIndex >= 0 && btns[PSH.escIndex]) btns[PSH.escIndex].click(); }
    else if (k === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); const f = document.activeElement && document.activeElement.closest && document.activeElement.closest('#sysBtns button'); (f || $('sysBtns').querySelector('button')).click(); }
    else e.stopImmediatePropagation();
    return;
  }
  if (k === 'F11') { e.preventDefault(); e.stopImmediatePropagation(); Platform.toggleFullscreen(); return; }
  if (k === 'F12') { e.preventDefault(); e.stopImmediatePropagation(); takeScreenshot(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (k === 's' || k === 'S')) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (STARTED) { if (saveGame(false)) clearRecovery(); } else toast('Start or continue a city to save', '');
    return;
  }
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (k === 'M' || k === 'm')) { e.preventDefault(); e.stopImmediatePropagation(); toggleMinimapKey(); }
}

/* --- Alt+Tab / focus: no stuck drags, audio resumes, optional pause, canvas re-measured --- */
function onWindowBlur() {
  INPUT.pointers.clear(); INPUT.down = null; INPUT.pinch = null; INPUT.moved = false;
  if (typeof UI !== 'undefined') { UI.roadDrag = null; UI.zoneDrag = null; }
  if (STARTED && GSET.pauseOnBlur && S.settings.speed > 0) { PSH.blurSpeed = S.settings.speed; setSpeed(0); }
}
function onWindowFocus() {
  try { if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); } catch (e) { /* audio not started yet */ }
  if (PSH.blurSpeed !== null && STARTED && S.settings.speed === 0) setSpeed(PSH.blurSpeed);
  PSH.blurSpeed = null;
  lastTs = 0;
  resizeCanvas(); clampCamera();
}

/* --- Called once by init() when the main menu is ready --- */
function platformBoot() {
  const crashed = DESKTOP ? !!BCT.session.previousCrashed : Store.getItem(SESSION_KEY) === 'open';
  if (!DESKTOP) { try { Store.setItem(SESSION_KEY, 'open'); } catch (e) { /* storage blocked */ } }   // desktop: main process keeps session.lock
  window.addEventListener('keydown', onShellKey, true);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-gset]'); if (el) { e.preventDefault(); onGsetClick(el); } });
  window.addEventListener('beforeunload', function () { if (!DESKTOP) { if (STARTED && saveGame(true)) clearRecovery(); Store.removeItem(SESSION_KEY); } });
  if (DESKTOP) BCT.onCloseRequest(requestExit);
  const ib = $('menuImportOld'); if (ib) ib.onclick = importAnyFile;
  const eb = $('menuExportAll'); if (eb) eb.onclick = exportAllSaves;
  document.body.classList.toggle('desktop', DESKTOP);
  androidLifecycle();
  bindAdminCenter();
  if (typeof mobileBoot === 'function') mobileBoot();          // Part 12: platform classes, mobile HUD, touch camera, build/road bars
  if (typeof applySettings2 === 'function') applySettings2();
  applyShellTexts();
  const migrated = migrateLocalStorageToDisk();
  if (migrated && !STARTED) refreshMenuCity(activeSlot());
  const rec = readRecovery();
  if (crashed) Log.warn('Previous session was not closed correctly' + (rec ? ' (recovery snapshot found)' : ''));
  const selftest = DESKTOP && BCT.selftest;            // the automatic self-test never waits for first-run prompts
  if (crashed && rec && !selftest) showRecoveryDialog(rec);
  else {
    if (rec) clearRecovery();
    let any = false; for (let n = 1; n <= SLOT_COUNT; n++) if (slotInfo(n).exists) any = true;
    if (DESKTOP && !any && !GSET.browserImportPrompted && !selftest) showBrowserImportPrompt();
  }
}
