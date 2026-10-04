'use strict';
/* BLOCK CITY TYCOON — ADMIN PANEL & panel sections */
/* ============================ 🛡️ ADMIN PANEL ============================ */
/* The owner's control room: live diagnostics, economy & world controls, unlocks, cheats,
   entity tools, error log and save tools. Optional PIN protection (stored hashed in the profile). */
const ADMIN = { tab: 'overview', ok: false };
/* F10 / Ctrl+Shift+A / menu: the Part 8 Admin Control Center (classic tools stay available inside it: ⚙ SYSTEM → Classic admin tools) */
function openAdmin() { openAdminCenter(); }
function admBtn(act, label, cls, v) { return '<button class="btn small ' + (cls || '') + '" data-adm="' + act + '"' + (v !== undefined ? ' data-v="' + esc(String(v)) + '"' : '') + '>' + label + '</button>'; }
function admToggle(k, label) { const on = S.p5.admin[k]; return '<div class="between" style="padding:5px 0"><span>' + label + '</span>' + admBtn('toggle', on ? 'ON' : 'OFF', on ? 'green' : '', k) + '</div>'; }
function admNum(id, label, val, act) { return '<div class="admRow"><span>' + label + '</span><input class="admInput" id="' + id + '" value="' + esc(String(val)) + '">' + admBtn(act, 'Set', 'blue') + '</div>'; }
function renderAdmin() {
  const t = ADMIN.tab, p = S.p5;
  const tabs = [['overview', '📟 Overview'], ['economy', '💰 Economy'], ['world', '🌍 World & Events'], ['unlocks', '🔓 Unlocks'], ['cheats', '🎛️ Cheats'], ['entities', '🧍 Entities & Errors'], ['save', '💾 Save'], ['security', '🔐 Security']];
  let h = '<div class="tabs" style="padding:0 0 8px;flex-wrap:wrap">' + tabs.map(function (x) { return '<button class="tab ' + (t === x[0] ? 'on' : '') + '" data-admtab="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (t === 'overview') {
    const kv = function (k, v) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v" style="font-size:14px">' + v + '</div></div>'; };
    h += '<div class="grid3">' + kv('FPS', Math.round(PERF.fps)) + kv('TPS (sim)', Game.tpsMeasured.toFixed(1)) + kv('ADAPTIVE', Math.round(PERF.scale * 100) + '%') +
      kv('CITIZENS', AG.citizens.length) + kv('VEHICLES', AG.vehicles.length) + kv('PARTICLES', FX.particles.length) +
      kv('BUILDINGS', S.buildings.list.length) + kv('ACCIDENTS', AG.accidents.length) + kv('ERRORS', ERRLOG.length) +
      kv('SAVE VERSION', 'v' + SAVE_VERSION) + kv('SAVE SIZE', S._saveBytes ? fmt(S._saveBytes / 1024, 1) + ' KB' : '—') + kv('PATH CACHE', MAP.pathCache.size) + '</div>';
    h += '<div class="card" style="margin-top:8px"><h3>🏙️ ' + esc(S.city.name) + ' · ' + seedLabel() + '</h3><p>Day ' + gameDay() + ' (' + weekdayName() + ') · Economy ' + p.econ.phase + ' @ ' + (p.econ.rate * 100).toFixed(2) + '% · Score ' + p.score.cur + ' · Story chapter ' + Math.min(STORY.length, p.story.ch + 1) + '/' + STORY.length + ' · Adaptive difficulty ' + p.dd.level.toFixed(2) + ' · World event ' + (p.world.active || 'none') + '</p></div>';
    h += '<p class="small">Shortcuts: Ctrl+Shift+A opens this panel. Actions here are real and are flagged in the City Showcase.</p>';
  } else if (t === 'economy') {
    h += '<div class="card"><h3>💰 Money & resources</h3><div class="row" style="flex-wrap:wrap;gap:6px">' + admBtn('money', '+$10K', 'gold', 1e4) + admBtn('money', '+$1M', 'gold', 1e6) + admBtn('money', '+$1B', 'gold', 1e9) +
      admBtn('budget', '+$10K budget', 'blue', 1e4) + admBtn('budget', '+$1M budget', 'blue', 1e6) + admBtn('rp', '+1K RP', '', 1000) + admBtn('rp', '+100K RP', '', 1e5) + admBtn('pp', '+10 LP', '', 10) + '</div></div>';
    h += '<div class="card">' + admNum('admMoney', 'Money', Math.floor(S.money), 'setMoney') + admNum('admBudget', 'City budget', Math.floor(S.budget), 'setBudget') + admNum('admPop', 'Population', Math.floor(S.city.population), 'setPop') +
      admNum('admHap', 'Happiness %', Math.round(S.city.happiness), 'setHap') + admNum('admRep', 'Reputation', Math.round(S.city.reputation), 'setRep') + admNum('admTax', 'Tax %', S.city.tax, 'setTax') +
      admNum('admLevel', 'City level (1-20)', cityLevel(), 'setLevel') + admNum('admRate', 'Interest rate %', (p.econ.rate * 100).toFixed(2), 'setRate') + '</div>';
    h += '<div class="card"><h3>📈 Economic cycle</h3><div class="row" style="flex-wrap:wrap;gap:6px">' + Object.keys(ECON_PHASES).map(function (k) { return admBtn('phase', ECON_PHASES[k].icon + ' ' + k, p.econ.phase === k ? 'gold' : '', k); }).join('') + '</div></div>';
  } else if (t === 'world') {
    h += admNum('admHour', 'Time of day (0-23)', Math.floor(gameHour()), 'setHour') + '<div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0">' + admBtn('day', '+1 day') + admBtn('weekend', 'Jump to Saturday') + '</div>';
    h += '<div class="secTitle">Weather</div><div class="row" style="flex-wrap:wrap;gap:6px">' + ['clear', 'rain', 'snow', 'storm', 'heatwave'].map(function (w) { return admBtn('weather', w, FX.weather === w ? 'gold' : '', w); }).join('') + '</div>';
    h += '<div class="secTitle">World events</div><div class="row" style="flex-wrap:wrap;gap:6px">' + WORLD_EVENTS.map(function (e) { return admBtn('world', e.icon + ' ' + e.name, '', e.id); }).join('') + admBtn('worldEnd', 'End world event', 'red') + '</div>';
    h += '<div class="secTitle">Special weekends</div><div class="row" style="flex-wrap:wrap;gap:6px">' + Object.keys(SPECIAL_WEEKENDS).map(function (k) { return admBtn('special', SPECIAL_WEEKENDS[k].icon + ' ' + SPECIAL_WEEKENDS[k].name, '', k); }).join('') + '</div>';
    h += '<div class="secTitle">City events</div><div class="row" style="flex-wrap:wrap;gap:6px">' + CRISES.map(function (c) { return admBtn('crisis', c.icon + ' ' + c.name, '', c.id); }).join('') + DISASTERS.map(function (c) { return admBtn('disaster', c.icon + ' ' + c.name, '', c.id); }).join('') +
      DYN_EVENTS.map(function (c) { return admBtn('dyn', c.icon + ' ' + c.name, '', c.id); }).join('') + '</div>';
    h += '<div class="secTitle">Show & test</div><div class="row" style="flex-wrap:wrap;gap:6px">' + admBtn('accident', '🚗💥 Traffic accident') + admBtn('fireworks', '🎆 Fireworks') + admBtn('cinematic', '🎬 Cinematic') + admBtn('thought', '💬 Citizen thought') + '</div>';
  } else if (t === 'unlocks') {
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">' + admBtn('unlockBuildings', '🏗️ Unlock all buildings', 'gold') + admBtn('unlockTech', '🔬 Research all technologies', 'gold') + admBtn('storyNext', '📖 Complete story chapter') + admBtn('storyAll', '📖 Complete whole story') +
      admBtn('tutDone', '🎓 Finish tutorial') + admBtn('challengeWin', '🏆 Complete current challenge') + admBtn('titles', '🎖️ Grant all titles') + admBtn('cosmetics', '🎨 Grant all cosmetics') + admBtn('achievements', '🏅 Unlock all achievements') + admBtn('identity', '🌿 Cycle city identity') + '</div>';
    h += '<p class="small" style="margin-top:8px">Story: chapter ' + Math.min(STORY.length, p.story.ch + 1) + ' · unlocked systems: ' + (Object.keys(p.story.unlocked).join(', ') || 'none') + '</p>';
  } else if (t === 'cheats') {
    h += '<div class="card">' + admToggle('god', '🆓 God mode (free buildings & roads)') + admToggle('instant', '⚡ Instant construction') + admToggle('freeze', '🧊 Freeze economy') + admToggle('noEvents', '🛑 No events, accidents or disasters') + '</div>';
    h += '<div class="secTitle">Game speed</div><div class="row" style="flex-wrap:wrap;gap:6px">' + [0, 1, 2, 3, 5, 10].map(function (sp) { return admBtn('speed', sp ? sp + '×' : '⏸', S.settings.speed === sp ? 'gold' : '', sp); }).join('') + '</div>';
  } else if (t === 'entities') {
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">' + admBtn('clearCars', '🚗 Clear vehicles') + admBtn('clearNpc', '🧍 Respawn citizens') + admBtn('repairAll', '🔧 Repair all buildings') + admBtn('fireOut', '🧯 Extinguish fires') +
      admBtn('clearAcc', '🚑 Clear accidents') + admBtn('sanitize', '🩺 Run entity sanitizer') + admBtn('clearLog', '🗑️ Clear error log', 'red') + '</div>';
    h += '<div class="secTitle">Error log (' + ERRLOG.length + ') — ' + Game.errors + ' recovered this session</div>' + (ERRLOG.length ? ERRLOG.map(function (e) { return '<div class="notif"><span class="nt">' + e.t + '</span><span><b>' + esc(e.where) + '</b>: ' + esc(e.msg) + '</span></div>'; }).join('') : '<p class="small">No errors. 🎉</p>');
  } else if (t === 'save') {
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">' + admBtn('save', '💾 Save now', 'green') + admBtn('restore', '♻️ Restore backup') + admBtn('downloadJson', '⬇️ Download save (.json)') + admBtn('importJson', '⬆️ Import save file') + admBtn('viewJson', '👁️ View save JSON') + admBtn('wipeProfile', '🗑️ Reset player profile', 'red') + '</div>';
    h += '<p class="small" style="margin-top:8px">Safe save: state → validate → serialize → backup → write. Slot ' + (S.slot || 1) + ', last save ' + new Date(S.lastSaveTime).toLocaleTimeString() + '.</p><div id="admJsonBox"></div>';
  } else if (t === 'security') {
    h += '<div class="card"><h3>🔐 Admin PIN</h3><p>' + (PROFILE.pin ? 'A PIN protects this panel.' : 'No PIN set — anyone on this device can open the admin panel.') + '</p><div class="admRow"><span>New PIN (4-12 digits)</span><input class="admInput" id="admNewPin" type="password" inputmode="numeric" maxlength="12">' + admBtn('setPin', 'Set PIN', 'green') + '</div>' + (PROFILE.pin ? admBtn('clearPin', 'Remove PIN', 'red') + ' ' + admBtn('lock', '🔒 Lock now') : '') + '</div>';
  }
  showModal('🛡️ Admin Panel', h);
  document.querySelectorAll('[data-admtab]').forEach(function (b) { b.onclick = function () { ADMIN.tab = b.dataset.admtab; renderAdmin(); }; });
  document.querySelectorAll('[data-adm]').forEach(function (b) { b.onclick = function () { adminAction(b.dataset.adm, b.dataset.v); }; });
}
function admVal(id) { const e = $(id); return e ? Number(e.value) : NaN; }
function adminAction(a, v) {
  const p = S.p5; p.admin.used = true;
  const n = Number(v);
  const re = function (msg) { if (msg) toast('🛡️ ' + msg, 'good'); sfx('click'); refreshTopbar(); renderAdmin(); };
  switch (a) {
    case 'money': S.money = Math.min(MONEY_CAP, S.money + n); return re('+' + money(n));
    case 'budget': S.budget = Math.min(MONEY_CAP, S.budget + n); return re('+' + money(n) + ' budget');
    case 'rp': S.research.rp += n; return re('+' + fmt(n) + ' RP');
    case 'pp': S.meta.pp += n; return re('+' + n + ' Legacy Points');
    case 'setMoney': { const x = admVal('admMoney'); if (isFinite(x) && x >= 0) S.money = Math.min(MONEY_CAP, x); return re('Money set'); }
    case 'setBudget': { const x = admVal('admBudget'); if (isFinite(x) && x >= 0) S.budget = Math.min(MONEY_CAP, x); return re('Budget set'); }
    case 'setPop': { const x = admVal('admPop'); if (isFinite(x) && x >= 0) { S.city.population = Math.min(1e7, x); S.city.peakPop = Math.max(S.city.peakPop, S.city.population); } return re('Population set'); }
    case 'setHap': { const x = admVal('admHap'); if (isFinite(x)) S.city.happiness = clamp(x, 0, 100); return re('Happiness set'); }
    case 'setRep': { const x = admVal('admRep'); if (isFinite(x)) S.city.reputation = clamp(x, 0, 100); return re('Reputation set'); }
    case 'setTax': { const x = admVal('admTax'); if (isFinite(x)) S.city.tax = clamp(Math.round(x), 0, MAX_TAX); return re('Tax set'); }
    case 'setLevel': { const x = clamp(admVal('admLevel') | 0, 1, 20); S.city.peakPop = Math.max(S.city.peakPop, CITY_LEVEL_POP[x - 1]); S.city.population = Math.max(S.city.population, CITY_LEVEL_POP[x - 1]); return re('City level ' + cityLevel()); }
    case 'setRate': { const x = admVal('admRate'); if (isFinite(x)) p.econ.rate = clamp(x / 100, 0.005, 0.15); return re('Interest rate set'); }
    case 'phase': forceEconPhase(v); return re();
    case 'setHour': { const x = admVal('admHour'); if (isFinite(x)) S.clock.gameSec = Math.floor(S.clock.gameSec / 86400) * 86400 + clamp(x, 0, 23.99) * 3600; return re('Time set'); }
    case 'day': S.clock.gameSec += 86400; return re('Day ' + gameDay());
    case 'weekend': { const wd = weekdayIndex(); S.clock.gameSec += ((5 - wd + 7) % 7 || 7) * 86400; S.clock.gameSec = Math.floor(S.clock.gameSec / 86400) * 86400 + 10 * 3600; return re(weekdayName()); }
    case 'weather': setWeather(v, 4); return re('Weather: ' + v);
    case 'world': startWorldEvent(v); return re();
    case 'worldEnd': p.world.ends = S.clock.runSec; worldEventsTick(); return re();
    case 'special': p.week.special = v; return re(SPECIAL_WEEKENDS[v].name + ' scheduled this weekend');
    case 'crisis': startCrisis(CRISES.find(function (c) { return c.id === v; })); return re();
    case 'disaster': startDisaster(DISASTERS.find(function (c) { return c.id === v; })); return re();
    case 'dyn': startDynEvent(DYN_EVENTS.find(function (c) { return c.id === v; })); return re();
    case 'accident': closeModal(); if (!triggerAccident()) toast('No road with traffic for an accident', 'bad'); return;
    case 'fireworks': closeModal(); fireworks(16); return;
    case 'cinematic': { closeModal(); const b = S.buildings.list.filter(function (x) { return x.built; }).sort(function (x, y) { return buildingHeight(y) - buildingHeight(x); })[0]; if (b) cinematic(b, 'ADMIN PREVIEW'); return; }
    case 'thought': { closeModal(); const c = AG.citizens.find(function (x) { return !x.inside && !x.driving; }); if (c) { c.bubble = { text: 'Hello, Mayor!', until: FX.time + 5, bad: false }; CAM.x = c.x; CAM.y = c.y; } else toast('No citizen outside right now', 'bad'); return; }
    case 'unlockBuildings': S.debugUnlockAll = true; return re('All buildings unlocked');
    case 'unlockTech': TECH_LIST.forEach(function (tt) { if (!hasTech(tt.id)) S.technology.unlocked.push(tt.id); }); onMapChanged(); return re('All technologies researched');
    case 'storyNext': { const C = storyChapter(); if (!C) return re('Story already complete'); if (C.choice && !p.story.choices[p.story.ch]) p.story.choices[p.story.ch] = C.choice.opts[0].id; clearDialogues(); p.story.unlocked[C.unlock] = 1; grantP5Reward(C.reward, null); logHistory('📖', 'Chapter ' + (p.story.ch + 1) + ' complete: ' + C.title, 'story'); p.story.ch++; p.story.phase = 'intro'; return re('Chapter complete'); }
    case 'storyAll': clearDialogues(); while (p.story.ch < STORY.length) { const C = STORY[p.story.ch]; p.story.unlocked[C.unlock] = 1; p.story.ch++; } return re('Story complete');
    case 'tutDone': p.tut.done = true; S.tutorial.done = true; renderTutorial(); return re('Tutorial finished');
    case 'challengeWin': { const c = activeChallenge(); if (!c) return re('No active challenge'); p.challenge.done = true; PROFILE.challenges[c.id] = 1; saveProfile(); grantP5Reward(c.reward, 'Challenge ' + c.name); return re(); }
    case 'titles': TITLES.forEach(function (tt) { if (PROFILE.titles.indexOf(tt.id) < 0) PROFILE.titles.push(tt.id); }); saveProfile(); return re('All titles granted');
    case 'cosmetics': Object.keys(COSMETICS).forEach(function (c) { if (!hasCosmetic(c)) PROFILE.cosmetics.push(c); }); saveProfile(); return re('All cosmetics granted');
    case 'achievements': ACHIEVEMENTS.forEach(function (x) { S.achievements[x.id] = 1; }); return re('All achievements unlocked');
    case 'identity': { const ks = Object.keys(IDENTITIES), i = ks.indexOf(p.identity.id); p.identity.id = ks[(i + 1) % ks.length]; applyIdentityTheme(); return re('Identity: ' + IDENTITIES[p.identity.id].name); }
    case 'toggle': p.admin[v] = !p.admin[v]; return re(v + (p.admin[v] ? ' ON' : ' OFF'));
    case 'speed': setSpeed(n); return re('Speed ' + n + '×');
    case 'clearCars': while (AG.vehicles.length) removeVehicle(AG.vehicles.length - 1, false); return re('Vehicles cleared');
    case 'clearNpc': AG.citizens.length = 0; return re('Citizens respawning');
    case 'repairAll': S.buildings.list.forEach(function (b) { b.damaged = 0; b.repair = 0; }); return re('All buildings repaired');
    case 'fireOut': S.buildings.list.forEach(function (b) { b.fire = 0; b._truck = false; }); return re('Fires extinguished');
    case 'clearAcc': AG.accidents.forEach(function (x) { MAP.blocked[x.tile] = 0; }); AG.accidents.length = 0; MAP.pathCache.clear(); return re('Accidents cleared');
    case 'sanitize': sanitizeCitizens(); sanitizeVehicles(); repairBuildings(); onMapChanged(); return re('Entities sanitized');
    case 'clearLog': ERRLOG.length = 0; return re('Log cleared');
    case 'save': saveGame(false); return re();
    case 'restore': confirmDialog('♻️ Restore backup?', 'The previous save of this slot becomes the main save and is loaded now.', 'Restore', function () { if (restoreBackup()) { loadSlot(S.slot || 1); toast('♻️ Backup restored', 'good'); } else toast('❌ No valid backup found', 'bad'); }); return;
    case 'downloadJson': downloadSaveFile(); return;
    case 'importJson': openImportDialog(); return;
    case 'viewJson': { const box = $('admJsonBox'); if (box) box.innerHTML = '<textarea readonly class="codeBox" style="height:220px">' + esc(exportSaveJSON()) + '</textarea>'; return; }
    case 'wipeProfile': confirmDialog('Reset player profile?', 'Titles, badges, cosmetics, challenge history and the admin PIN will be erased. Cities are not affected.', 'Reset', function () { try { Store.removeItem(PROFILE_KEY); } catch (e) { /* storage blocked */ } loadProfile(); ADMIN.ok = false; applyTheme(); toast('Profile reset', 'good'); }); return;
    case 'setPin': { const pin = ($('admNewPin') || {}).value || ''; if (!/^\d{4,12}$/.test(pin)) { toast('PIN must be 4-12 digits', 'bad'); return; } PROFILE.pin = hashPin(pin); ADMIN.ok = true; saveProfile(); return re('Admin PIN set'); }
    case 'clearPin': PROFILE.pin = ''; saveProfile(); return re('PIN removed');
    case 'lock': ADMIN.ok = false; closeModal(); toast('🔒 Admin panel locked', 'good'); return;
  }
}
function downloadSaveFile() {
  const json = exportSaveJSON(); if (!json) { toast('❌ Could not export', 'bad'); return; }
  const fname = (S.city.name.replace(/[^a-z0-9]+/gi, '-') || 'city') + '-save-v' + SAVE_VERSION + '.json';
  if (DESKTOP) {      // Windows "Save as" dialog
    Platform.saveTextFile(fname, json, 'Block City Tycoon city', 'json').then(function (r) {
      if (r && r.ok) { toast('📤 City exported: ' + r.path, 'good'); Log.info('City exported to ' + r.path); }
      else if (!(r && r.canceled)) toast('❌ Export failed: ' + ((r && r.error) || 'unknown'), 'bad');
    });
    return;
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = (S.city.name.replace(/[^a-z0-9]+/gi, '-') || 'city') + '-save-v' + SAVE_VERSION + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('⬇️ Save downloaded', 'good');
  } catch (e) { toast('❌ Download blocked by the browser', 'bad'); }
}
/* Import dialog: paste a code / JSON or pick a .json file. Invalid saves are rejected with the reasons. */
function openImportDialog() {
  showModal('📥 Import Save', '<p class="small">Paste a save code or JSON, or choose a .json file. The save is validated (version, data types, negative values, unknown properties, maximum values) before your city is replaced.</p>' +
    '<textarea id="importBox" class="codeBox" style="height:150px;margin-top:8px"></textarea><div class="row" style="justify-content:space-between;margin-top:8px;flex-wrap:wrap;gap:6px">' + (DESKTOP ? '<button class="btn" id="importPick" type="button">📂 Choose .json file…</button>' : '<input type="file" id="importFile" accept=".json,application/json,text/plain" style="font-size:11px;max-width:60%">') + '<button class="btn green" id="doImport">Import</button></div><div id="importErr"></div>');
  if ($('importPick')) $('importPick').onclick = function () {
    Platform.openTextFile('Block City Tycoon save', ['json', 'txt']).then(function (r) {
      if (r && r.ok) { if (isBundleText(r.text)) { closeModal(); importBundleText(r.text); return; } $('importBox').value = r.text; toast('📂 ' + r.name + ' loaded — press Import', 'good'); }
      else if (r && r.error) $('importErr').innerHTML = '<p class="neg small">' + esc(r.error) + '</p>';
    });
  };
  if ($('importFile')) $('importFile').onchange = function () { const f = this.files && this.files[0]; if (!f) return; if (f.size > 8e6) { $('importErr').innerHTML = '<p class="neg small">File too large.</p>'; return; } const r = new FileReader(); r.onload = function () { $('importBox').value = String(r.result || ''); }; r.readAsText(f); };
  $('doImport').onclick = function () {
    if (isBundleText($('importBox').value)) { const t = $('importBox').value; closeModal(); importBundleText(t); return; }
    const res = importSave($('importBox').value);
    if (res.ok) {
      closeModal(); clearDialogues(); CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; selectBuilding(null); applyTheme(); toast('✅ Save imported', 'good');
      if (!STARTED) startGame({ isNew: false, notes: ['Save imported.'] });
    } else { $('importErr').innerHTML = '<div class="card" style="margin-top:8px;border-color:var(--red)"><b class="neg">❌ Save rejected</b>' + res.errors.map(function (e) { return '<p class="small">• ' + esc(e) + '</p>'; }).join('') + '</div>'; sfx('error'); }
  };
}

/* ======================== PANEL SECTIONS (Part 5) ======================== */
function renderScoreTab() {
  computeScore();
  const sc = S.p5.score, g = scoreGate(S.city.population);
  let h = '<div class="card" style="text-align:center"><div class="small">CITY SCORE</div><div style="font-size:40px;font-weight:900;color:var(--accent)">' + sc.cur + '<span style="font-size:16px;color:var(--dim)"> / 1000</span></div><div><span class="tag y">' + scoreTitle() + '</span> <span class="tag">Best ' + sc.best + '</span></div></div>';
  h += '<div class="card"><h3>🧮 Score breakdown</h3><p class="small">Population counts fully; every other category is weighted by city size (×' + g.toFixed(2) + ').</p>';
  SCORE_PARTS.forEach(function (pp) { const v = sc.comp[pp.id] || 0; h += barRow(pp.icon + ' ' + pp.name, v, 100, v > 66 ? '#06d6a0' : v > 33 ? '#ffd166' : '#ef476f', Math.round(v)); });
  h += '</div><div class="secTitle">🏅 Titles</div><p class="small">' + SCORE_TITLES.map(function (t) { return (sc.cur >= t[0] ? '✅ ' : '🔒 ') + t[1] + ' (' + t[0] + ')'; }).join(' · ') + (S.p5.story.unlocked.future ? ' · ✨ Future Civilization (900)' : '') + '</p>';
  if (!p5Unlocked('ranking')) { h += '<div class="card"><h3>🌍 World City Ranking</h3><p>🔒 Unlocks in Story Chapter 6 — Metropolitan Expansion.</p></div>'; return h; }
  h += '<div class="secTitle">🌍 World City Ranking</div><div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:6px">' + RANK_CATS.map(function (c) { return '<button class="btn small ' + (UI.rankCat === c[0] || (!UI.rankCat && c[0] === 'score') ? 'gold' : '') + '" data-act="rankcat" data-v="' + c[0] + '">' + c[2] + ' ' + c[1] + '</button>'; }).join('') + '</div>';
  const cat = UI.rankCat || 'score', rows = rankingTable(cat);
  h += '<div class="card">' + rows.map(function (r, i) {
    const val = cat === 'wealth' ? money(r.v) : cat === 'pop' ? fmt(Math.floor(r.v)) : Math.round(r.v);
    return '<div class="between small" style="padding:5px 4px;border-bottom:1px solid var(--line);' + (r.me ? 'background:rgba(255,209,102,.12);border-radius:6px' : '') + '"><span><b>#' + (i + 1) + '</b> ' + r.icon + ' ' + esc(r.name) + (r.me ? ' <span class="tag y">YOU</span>' : '') + '</span><b style="color:var(--text)">' + val + '</b></div>';
  }).join('') + '</div><p class="small">Rival cities grow, react to world events and chase your progress — the ranking changes all the time.</p>';
  return h;
}
function renderEconCycleCard() {
  const e = S.p5.econ, ph = econPhase(), left = Math.max(0, e.until - S.clock.runSec);
  let h = '<div class="card" style="border-left:4px solid ' + ph.color + '"><div class="between"><h3>' + ph.icon + ' Economy: ' + ph.id + '</h3><span class="tag">~' + Math.ceil(left / 60) + ' min</span></div><p>' + ph.desc + '</p>' +
    '<div class="grid3" style="margin-top:6px">' + kpi('DEMAND', '×' + ph.demand.toFixed(2), ph.demand >= 1 ? 'pos' : 'neg') + kpi('REVENUE', '×' + ph.rev.toFixed(2), ph.rev >= 1 ? 'pos' : 'neg') + kpi('JOBS', '×' + ph.jobs.toFixed(2), ph.jobs >= 1 ? 'pos' : 'neg') + '</div></div>';
  if (p5Unlocked('bank')) {
    h += '<div class="card"><div class="between"><h3>🏦 Central bank interest rate</h3><b style="font-size:18px">' + (e.rate * 100).toFixed(2) + '%</b></div><p>Target for ' + ph.id + ': ' + (ph.rate * 100).toFixed(1) + '%. Affects loan costs (' + (e.rate > 0.05 ? 'higher' : 'lower') + '), business growth ×' + businessGrowthMult().toFixed(2) + ', investment success and housing prices.</p>' +
      '<canvas class="chart" data-chart="rate" data-color="#ffd166" style="height:90px"></canvas></div>';
  } else h += '<div class="card"><p class="small">🔒 Detailed central-bank data unlocks in Story Chapter 4. Current rate: ' + (e.rate * 100).toFixed(1) + '%.</p></div>';
  const wkd = isWeekend(), sp = specialWeekend();
  h += '<div class="card"><h3>📅 ' + weekdayName() + ' · Week ' + weekNumber() + '</h3><p>' + (wkd ? '🎉 Weekend: tourism +25%, entertainment +25%, traffic +15%, offices quieter.' : 'Weekday: offices busy, normal traffic.') + (S.p5.week.special ? ' Upcoming/active: <b>' + SPECIAL_WEEKENDS[S.p5.week.special].icon + ' ' + SPECIAL_WEEKENDS[S.p5.week.special].name + '</b>' + (sp ? ' (LIVE)' : '') : '') + '</p></div>';
  const we = worldEvent();
  if (we) h += '<div class="card" style="border-left:4px solid ' + (we.good ? 'var(--green)' : 'var(--red)') + '"><h3>🌐 ' + we.icon + ' ' + we.name + '</h3><p>' + we.desc + ' · ' + Math.ceil((S.p5.world.ends - S.clock.runSec) / 60) + ' min left</p></div>';
  const dd = S.p5.dd.level;
  if (S.settings.dynDiff !== false && Math.abs(dd) > 0.05) h += '<div class="card"><h3>🎚️ Adaptive difficulty</h3><p>' + (dd > 0 ? 'Your city is thriving: prices +' + Math.round(8 * dd) + '%, events a little more frequent.' : 'Assist active: state grant ×' + (1 - dd).toFixed(1) + ', revenue +' + Math.round(-4 * dd) + '%, calmer events.') + ' (Toggle in Settings.)</p></div>';
  return h;
}
function renderInvestTab() {
  let h = '';
  if (!p5Unlocked('invest')) h += '<div class="card"><h3>💼 Investments</h3><p>🔒 Unlocks in Story Chapter 3 — Growing Town.</p></div>';
  else {
    const inv = S.p5.invest, e = S.p5.econ;
    h += '<div class="grid2">' + kpi('ACTIVE', inv.active.length + '/3') + kpi('TOTAL PROFIT', signMoney(inv.profit), inv.profit >= 0 ? 'pos' : 'neg') + '</div>';
    h += '<p class="small" style="margin:6px 0">Success odds depend on the interest rate (' + (e.rate * 100).toFixed(1) + '%), the economic cycle (' + e.phase + ') and your city reputation.</p>';
    inv.active.forEach(function (a) {
      const T = INVESTMENT_TYPES.find(function (x) { return x.id === a.type; }), f = clamp((S.clock.runSec - a.start) / (a.ends - a.start), 0, 1);
      h += '<div class="card"><div class="between"><b>' + T.icon + ' ' + T.name + ' — ' + money(a.amount) + '</b><span class="tag">' + Math.ceil((a.ends - S.clock.runSec) / 60) + ' min</span></div>' + barRow('Progress', f * 100, 100, '#4cc9f0', pct(f * 100)) + '</div>';
    });
    INVESTMENT_TYPES.forEach(function (T) {
      const o = investOdds(T), sz = investSizes(T);
      h += '<div class="card"><div class="between"><h3>' + T.icon + ' ' + T.name + '</h3><span class="tag ' + (T.risk === 'HIGH' ? 'r' : T.risk === 'LOW' ? 'g' : 'y') + '">' + T.risk + ' RISK</span></div>' +
        '<p>Expected return <b class="pos">+' + Math.round(T.ret * 100) + '%</b> on success · Duration ' + Math.round(T.dur / 60) + ' min · Odds ✅ ' + pct(o.success * 100) + ' ➖ ' + pct(o.neutral * 100) + ' ❌ ' + pct(o.loss * 100) + '<br>' + T.perkText + '</p>' +
        '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">' + sz.map(function (a, k) { return '<button class="btn small ' + (S.money < a || inv.active.length >= 3 ? 'dis' : 'gold') + '" data-act="invest" data-id="' + T.id + '" data-v="' + k + '">Invest ' + money(a) + '</button>'; }).join('') + '</div></div>';
    });
    if (inv.history.length) h += '<div class="secTitle">History</div>' + inv.history.slice().reverse().map(function (x) { const T = INVESTMENT_TYPES.find(function (t) { return t.id === x.type; }); return '<div class="between small" style="padding:3px 0"><span>' + T.icon + ' ' + T.name + ' · Day ' + x.day + '</span><b class="' + (x.back >= x.amount ? 'pos' : 'neg') + '">' + x.res + ' ' + signMoney(x.back - x.amount) + '</b></div>'; }).join('');
  }
  h += '<div class="secTitle">💡 Startups</div>';
  if (!p5Unlocked('startups')) h += '<p class="small">🔒 Unlocks in Story Chapter 5 — The Big Investment.</p>';
  else {
    const su = S.buildings.list.filter(function (b) { return b.type === 'startup' && !isAI(b); });
    h += '<p class="small">Build a <b>Startup Hub</b> (Commercial) inside a Technology District — within 4 tiles of an office, tech campus, data center or science building. Startups produce research and revenue and grow Seed → Growth → Scale-up → Unicorn. Low interest rates, education and a TECH identity speed them up; recessions can make them fail.</p>';
    if (!su.length) h += '<button class="btn small blue" data-act="pickBuild" data-id="startup">💡 Build a Startup Hub</button>';
    su.forEach(function (b) {
      const s = b.su || newStartup(), st = STARTUP_STAGES[s.stage];
      h += '<div class="card"><div class="between"><b>' + st.icon + ' ' + esc(s.name) + '</b><span class="tag">' + st.name + '</span></div>' + barRow('Growth', s.prog * 100, 100, '#9b5de5', pct(s.prog * 100)) +
        '<p class="small">Value ' + money(s.value) + ' · Revenue ' + money(b._rev || 0, 1) + '/s · Output ×' + st.mult + '</p>' + (s.stage >= 2 ? '<button class="btn small gold ' + (p5Unlocked('unicorn') ? '' : 'dis') + '" data-act="ipo" data-id="' + b.id + '">🔔 IPO for ' + money(s.value) + '</button>' : '') + '</div>';
    });
    h += '<p class="small">Founded ' + S.p5.startups.founded + ' · Exits ' + S.p5.startups.exits + ' (' + money(S.p5.startups.exitValue) + ')</p>';
  }
  return h;
}
function renderLinesCard(cid) {
  const st = productLineStats(cid); if (!st) return '';
  let h = '<div class="secTitle" style="margin-top:8px">🛒 Product lines — Brand ' + Math.round(st.brand) + '/100</div><div class="lineTable"><div class="lt head"><span>Product</span><span>Price</span><span>Quality</span><span>Demand</span><span>Supply</span><span>Sales</span></div>';
  st.rows.forEach(function (r, k) {
    h += '<div class="lt' + (st.focus === k ? ' focus' : '') + '"><span><button class="btn small ' + (st.focus === k ? 'gold' : '') + '" data-act="lfocus" data-id="' + cid + '" data-v="' + k + '" title="Focus: +quality, 50% of capacity">' + r.i + '</button> ' + r.n + '</span>' +
      '<span><button class="btn small" data-act="lprice" data-id="' + cid + '" data-v="' + k + ':-1">−</button>×' + r.price.toFixed(2) + '<button class="btn small" data-act="lprice" data-id="' + cid + '" data-v="' + k + ':1">+</button></span>' +
      '<span>' + r.q.toFixed(2) + '</span><span class="' + (r.dem > r.sup ? 'pos' : '') + '">' + r.dem.toFixed(2) + '</span><span>' + r.sup.toFixed(2) + '</span><span class="pos">' + money(r.rev, 1) + '/s</span></div>';
  });
  h += '</div><p class="small">Tap an icon to focus a product (more capacity & quality). Raise prices where demand exceeds supply; lower them to win customers. Total ' + money(st.total, 1) + '/s.</p>';
  return h;
}
function renderAdsCard(s) {
  if (s === 'HOUSING') return '';
  const live = S.p5.ads.live[s], t = S.clock.runSec;
  if (!p5Unlocked('ads')) return '<p class="small">🔒 Advertising unlocks in Story Chapter 2.</p>';
  if (live && live.until > t) { const roi = (live.inc - live.cost) / Math.max(1, live.cost); return '<p class="small">' + AD_TIERS[live.tier].icon + ' <b>' + live.tier + '</b> campaign live · ' + Math.ceil((live.until - t) / 60) + ' min left · Extra revenue so far ' + signMoney(live.inc) + ' · ROI ' + (roi >= 0 ? '+' : '') + Math.round(roi * 100) + '%</p>'; }
  return '<div class="row" style="flex-wrap:wrap;gap:4px;margin-top:4px">' + Object.keys(AD_TIERS).map(function (k) {
    const T = AD_TIERS[k], c = adTierCost(k), lock = T.need && !p5Unlocked(T.need);
    return '<button class="btn small blue ' + (lock || S.money < c ? 'dis' : '') + '" data-act="adtier" data-id="' + s + '" data-v="' + k + '" data-tip="' + esc('<b>' + T.icon + ' ' + k + '</b><div class="ttd">Demand ×' + T.mult + ' for ' + Math.round(T.dur / 60) + ' min · Brand +' + T.brand + (T.tour ? ' · Tourism +' + Math.round(T.tour * 100) + '%' : '') + '</div>') + '">' + T.icon + ' ' + k + ' ' + (lock ? '🔒' : money(c)) + '</button>';
  }).join('') + '</div>';
}
function renderAdHistory() {
  const H = S.p5.ads.hist;
  if (!H.length) return '';
  return '<div class="card"><h3>📊 Marketing ROI</h3>' + H.slice().reverse().map(function (a) { const roi = (a.inc - a.cost) / Math.max(1, a.cost); return '<div class="between small" style="padding:3px 0"><span>' + AD_TIERS[a.tier].icon + ' ' + a.tier + ' · ' + a.sector + ' · Day ' + a.day + '</span><span>cost ' + money(a.cost) + ' · +' + money(Math.max(0, a.inc)) + ' <b class="' + (roi >= 0 ? 'pos' : 'neg') + '">' + (roi >= 0 ? '+' : '') + Math.round(roi * 100) + '%</b></span></div>'; }).join('') + '</div>';
}
/* Bottom-info extras: reviews, business health & recovery, startup */
function bottomInfoExtras(b) {
  const d = BUILDINGS[b.type], s = [], a = [];
  if (b.nrev && p5Unlocked('reviews')) {
    const r = b.rating;
    s.push('⭐ <b>' + r.toFixed(1) + '</b> (' + b.nrev + ' reviews)' + (b._reviews && b._reviews[0] ? ' “' + esc(b._reviews[0].t) + '”' : ''));
    a.push('<button class="btn small" data-act="reviews">⭐ Reviews</button>');
  }
  if (b.owner === 'player' && b.health !== undefined && (d.rev || d.goods)) {
    const hc = b.health > 60 ? 'pos' : b.health > 25 ? '' : 'neg';
    s.push('Health <b class="' + hc + '">' + Math.round(b.health) + '%</b>' + (b.closed ? ' <b class="neg">CLOSED</b>' : b.health < 25 ? ' <b class="neg">STRUGGLING</b>' : ''));
    if (b.closed) a.push(b.closed >= 9e15 ? '<button class="btn small green" data-act="biz" data-v="reopen">🔓 Reopen ' + money(recoveryCost(b, 'reopen')) + '</button>' : '<button class="btn small gold" data-act="biz" data-v="restructure">🔧 Restructure ' + money(recoveryCost(b, 'restructure')) + '</button>');
    else if (b.health < 60) {
      a.push('<button class="btn small" data-act="biz" data-v="marketing" data-tip="Local promotion: +health, +rating for 3 min">📣 ' + money(recoveryCost(b, 'marketing')) + '</button>');
      a.push('<button class="btn small" data-act="biz" data-v="staff" data-tip="Hire and train staff">👷 ' + money(recoveryCost(b, 'staff')) + '</button>');
      a.push('<button class="btn small ' + (b.discount ? 'gold' : '') + '" data-act="biz" data-v="discount" data-tip="Price reduction: -15% revenue, happier customers">🏷️ ' + (b.discount ? 'ON' : '-15%') + '</button>');
      if (b.health < 25) a.push('<button class="btn small gold" data-act="biz" data-v="restructure">🔧 Restructure ' + money(recoveryCost(b, 'restructure')) + '</button><button class="btn small red" data-act="biz" data-v="close">🔒 Close</button>');
    } else if (b.discount) a.push('<button class="btn small gold" data-act="biz" data-v="discount">🏷️ Discount ON</button>');
  }
  if (b.su) { const st = STARTUP_STAGES[b.su.stage]; s.push(st.icon + ' <b>' + esc(b.su.name) + '</b> · ' + st.name + ' · value ' + money(b.su.value)); if (b.su.stage >= 2 && !isAI(b)) a.push('<button class="btn small gold ' + (p5Unlocked('unicorn') ? '' : 'dis') + '" data-act="ipo" data-id="' + b.id + '">🔔 IPO</button>'); }
  if ((b.rot | 0) && !d.noDemolish) s.push('↻ ' + ((b.rot | 0) * 90) + '°');
  return { stats: s, actions: a };
}
function openReviews(b) {
  const r = b._reviews || [];
  showModal('⭐ Reviews — ' + BUILDINGS[b.type].name, '<div class="card" style="text-align:center"><div style="font-size:34px;font-weight:900;color:var(--gold)">' + (b.rating || 0).toFixed(1) + ' ⭐</div><p>' + (b.nrev || 0) + ' reviews · Ratings above 3.5 bring more customers; below 2.5 they stay away.</p></div>' +
    (r.length ? r.map(function (x) { return '<div class="notif"><span class="nt">' + '⭐'.repeat(x.s) + '</span><span>“' + esc(x.t) + '”</span></div>'; }).join('') : '<p class="small">No written reviews yet this session.</p>') +
    '<p class="small" style="margin-top:8px">Reviews react to staffing, goods supply, price level, company quality, land value, crowding and traffic.</p>');
}
/* Right panel: story campaign + challenges */
function renderStoryQuestsHtml() {
  let h = '';
  const st = S.p5.story, C = storyChapter();
  if (S.p5.challenge) {
    const c = challengeDef(S.p5.challenge.id), cc = S.p5.challenge;
    h += '<div class="qitem story"><div class="qt">' + c.icon + ' CHALLENGE — ' + c.name + (cc.done ? ' ✅' : cc.failed ? ' ❌' : '') + '</div><div class="qd">' + esc(c.rules) + '</div><div class="qd" style="color:var(--text)">🎯 ' + esc(c.goal) + '</div>' + barRow('Progress', clamp(c.prog(), 0, 1) * 100, 100, '#ffd166', pct(clamp(c.prog(), 0, 1) * 100)) +
      (c.limit && !cc.done ? '<div class="qd">⏱ ' + Math.max(0, Math.floor((c.limit - (S.clock.runSec - cc.start)) / 60)) + ' min left</div>' : '') + '</div>';
  } else if (!S.city.sandbox) {
    h += '<div class="secTitle">📖 Story Campaign (' + Math.min(st.ch, STORY.length) + '/' + STORY.length + ')</div><div class="row" style="gap:3px;margin-bottom:8px">' + STORY.map(function (x, i) { return '<div data-tip="' + esc('Chapter ' + (i + 1) + ': ' + x.title) + '" style="flex:1;height:6px;border-radius:4px;background:' + (i < st.ch ? '#9b5de5' : i === st.ch ? '#ffd166' : 'rgba(255,255,255,.12)') + '"></div>'; }).join('') + '</div>';
    if (C) h += '<div class="qitem story"><div class="qt">CHAPTER ' + (st.ch + 1) + ' — ' + C.title + '</div><div class="qd" style="color:var(--text);margin-top:4px">🎯 ' + esc(C.goal) + '</div>' + barRow('Progress', clamp(C.prog(), 0, 1) * 100, 100, '#9b5de5', pct(clamp(C.prog(), 0, 1) * 100)) + '<div class="qd">🔓 Unlocks: ' + C.unlockText + ' · 🎁 ' + esc(rewardText(C.reward)) + '</div>' +
      (st.phase === 'intro' ? '<button class="btn small blue" style="margin-top:6px" data-act="storyreplay">▶ Start chapter</button>' : '') + '</div>';
    else h += '<div class="qitem story"><div class="qt">🌟 Campaign complete — Future Civilization!</div><div class="qd">Try the challenges from the main menu.</div></div>';
  }
  ['daily', 'weekly'].forEach(function (k) {
    const x = S.p5[k];
    if (x && !x.done && !x.failed && x.key === (k === 'daily' ? dailyKey() : weeklyKey())) { const tc = todaysChallenge(k); h += '<div class="qitem"><div class="qt">' + (k === 'daily' ? '📅 Daily' : '🗓️ Weekly') + ': ' + esc(tc.text) + '</div>' + barRow('', challengeProgress(k) * 100, 100, '#4cc9f0', pct(challengeProgress(k) * 100)) + '</div>'; }
  });
  h += '<div class="row" style="gap:4px;margin-bottom:6px"><button class="btn small" data-act="challenges">🏅 Challenges</button><button class="btn small" data-act="museum">🏛️ Museum</button><button class="btn small" data-act="advisor">🤖 Advisor</button></div>';
  return h;
}
