'use strict';
/* BLOCK CITY TYCOON — SETTINGS 2.0, PERFORMANCE, NOTIFICATIONS & GAMEPAD (Part 12)
   - Settings tabs: GRAPHICS · AUDIO · CONTROLS · CAMERA · SIMULATION · ACCESSIBILITY · SYSTEM (options shown per platform)
   - Performance modes LOW / MEDIUM / HIGH / ULTRA + AUTO PERFORMANCE (device benchmark, FPS + thermal watchdog that lowers
     distant simulation, shadows, particles, vehicle and citizen detail), LOW-END MODE and SIMULATION QUALITY
   - Safe speed limit: heavy speeds (25–100×) step down automatically when the device can't keep up
   - Accessibility: UI scale, text size, high contrast, reduced motion, screen shake off, colour-blind heatmaps,
     larger touch buttons, tutorial hints
   - In-game notifications with per-category switches
   - Gamepad 2.0: browser Gamepad API + native Android controller events, remappable actions */

/* ===================================== GLOBAL SETTINGS (per device) ===================================== */
const GS2_DEFAULTS = { uiScale: 100, textSize: 'M', largeTouch: IS_MOBILE, tutorialHints: true, perfMode: 'AUTO', lowEnd: false, simQuality: IS_MOBILE ? 'MEDIUM' : 'HIGH', orientation: 'landscape', cameraSpeed: 100, invertPan: false, rotateCam: true, edgePan: false, cbHeat: false, setupDone: false, mobileTutDone: false, safeSpeed: true, notify: null, padMap: null, autoPerfLevel: '' };
const NOTIFY_CATS = [['build', '🏗️', 'Construction completed'], ['traffic', '🚦', 'Traffic congestion'], ['population', '👥', 'Population milestones'], ['business', '🏢', 'New companies & business'], ['disaster', '🚨', 'Disasters & emergencies'], ['economy', '💰', 'Economy & budget']];
const PAD_ACTIONS = [['select', 'Select', 0], ['cancel', 'Cancel / back', 1], ['build', 'Build menu', 2], ['city', 'City panel', 3], ['rotatePlace', 'Rotate building', 4], ['rotateCam', 'Rotate camera', 5], ['zoomOut', 'Zoom out', 6], ['zoomIn', 'Zoom in', 7], ['palette', 'Command palette', 8], ['menu', 'Menu / pause', 9]];
(function sanitizeGS2() {
  const pickIn = function (v, list, def) { return list.indexOf(v) >= 0 ? v : def; };
  const n = function (v, def, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  GSET.uiScale = Math.round(n(GSET.uiScale, GS2_DEFAULTS.uiScale, 70, 150));
  GSET.textSize = pickIn(GSET.textSize, ['S', 'M', 'L', 'XL'], 'M');
  ['largeTouch', 'tutorialHints', 'lowEnd', 'invertPan', 'rotateCam', 'edgePan', 'cbHeat', 'setupDone', 'mobileTutDone', 'safeSpeed'].forEach(function (k) { GSET[k] = GSET[k] === undefined ? GS2_DEFAULTS[k] : !!GSET[k]; });
  GSET.perfMode = pickIn(GSET.perfMode, ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], 'AUTO');
  GSET.simQuality = pickIn(GSET.simQuality, ['LOW', 'MEDIUM', 'HIGH'], GS2_DEFAULTS.simQuality);
  GSET.orientation = pickIn(GSET.orientation, ['landscape', 'auto', 'portrait'], 'landscape');
  GSET.cameraSpeed = Math.round(n(GSET.cameraSpeed, 100, 40, 250));
  GSET.autoPerfLevel = pickIn(GSET.autoPerfLevel, ['', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], '');
  const nt = {}; NOTIFY_CATS.forEach(function (c) { nt[c[0]] = !(GSET.notify && GSET.notify[c[0]] === false); }); GSET.notify = nt;
  const pm = {}; PAD_ACTIONS.forEach(function (a) { const v = GSET.padMap && GSET.padMap[a[0]]; pm[a[0]] = (v | 0) === v && v >= 0 && v < 20 ? v : a[2]; }); GSET.padMap = pm;
})();
/* simulation quality × low-end mode scale the agent counts of every quality preset (perfPreset in platform.js) */
function simDensityFactor() { return (GSET.lowEnd ? 0.45 : 1) * ({ LOW: 0.55, MEDIUM: 0.8, HIGH: 1 }[GSET.simQuality] || 1); }
const _perfPreset0 = perfPreset;
window.perfPreset = function (q) {
  const o = _perfPreset0(q), f = simDensityFactor();
  if (f >= 0.999 && !GSET.lowEnd) return o;
  const k = 'p12:' + f + ':' + GSET.lowEnd;
  if (o[k]) return o[k];
  const r = Object.assign({}, o); r.npc = Math.max(4, Math.round(o.npc * f)); r.veh = Math.max(2, Math.round(o.veh * f));
  if (GSET.lowEnd) { r.shadow = false; r.glow = false; r.part = Math.min(r.part, 40); r.windows = false; }
  Object.defineProperty(o, k, { value: r, enumerable: false });
  return r;
};

/* ===================================== PERFORMANCE MODES & AUTO PERFORMANCE ===================================== */
const QUALITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const AUTOP = { lowSec: 0, highSec: 0, lastChange: 0, benchmark: null, log: [] };
function perfModeLabel() { return GSET.perfMode === 'AUTO' ? 'AUTO (' + (S && S.settings ? S.settings.quality : GSET.autoPerfLevel || '?') + ')' : GSET.perfMode; }
/* Quick device benchmark: cores, memory and a 250 ms canvas fill-rate test → starting quality for AUTO PERFORMANCE */
function deviceBenchmark() {
  const dev = Platform.device();
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  const t0 = performance.now(); let ops = 0;
  while (performance.now() - t0 < 250) { for (let i = 0; i < 200; i++) { g.fillStyle = 'rgb(' + (i & 255) + ',' + (ops & 255) + ',90)'; g.fillRect((i * 37) % 480, (ops * 13) % 480, 32, 32); } ops++; }
  const score = ops * 200 / 250;                                    // rectangles per ms
  let lvl = score > 900 ? 'ULTRA' : score > 420 ? 'HIGH' : score > 160 ? 'MEDIUM' : 'LOW';
  if (dev.lowRam || (dev.ramMB && dev.ramMB < 2500) || dev.cores <= 2) lvl = 'LOW';
  else if (IS_MOBILE && lvl === 'ULTRA') lvl = 'HIGH';
  AUTOP.benchmark = { score: Math.round(score), cores: dev.cores, ramMB: dev.ramMB, level: lvl, at: new Date().toISOString() };
  Log.info('AUTO PERFORMANCE benchmark: ' + JSON.stringify(AUTOP.benchmark));
  return lvl;
}
function setQualityLevel(lvl, why) {
  if (!S || !S.settings || QUALITY_ORDER.indexOf(lvl) < 0 || S.settings.quality === lvl) return;
  S.settings.quality = lvl; GSET.graphics = lvl; if (GSET.perfMode === 'AUTO') GSET.autoPerfLevel = lvl; saveGSET();
  FX.particles.length = 0;
  AUTOP.log.unshift(new Date().toLocaleTimeString() + ' → ' + lvl + (why ? ' (' + why + ')' : '')); AUTOP.log.length = Math.min(AUTOP.log.length, 12);
  if (why) { Log.info('AUTO PERFORMANCE: quality → ' + lvl + ' (' + why + ')'); toast('⚙️ AUTO PERFORMANCE: graphics → ' + lvl + ' (' + why + ')', ''); }
}
/* Apply the chosen mode: fixed quality, or AUTO starting from the benchmark result */
function applyPerfMode() {
  if (!S || !S.settings) return;
  if (GSET.lowEnd) { setQualityLevel('LOW'); S.settings.autoQuality = true; return; }
  if (GSET.perfMode === 'AUTO') { if (!GSET.autoPerfLevel) { GSET.autoPerfLevel = deviceBenchmark(); saveGSET(); } setQualityLevel(GSET.autoPerfLevel); S.settings.autoQuality = true; }
  else setQualityLevel(GSET.perfMode);
}
/* Watchdog (1 Hz): FPS too low or the phone too hot → reduce distant simulation, shadows, particles, vehicles, citizens */
function autoPerfTick() {
  if (!STARTED || !S || GSET.perfMode !== 'AUTO' || document.hidden) return;
  const fps = PERF.fps || 60, therm = Platform.thermal(), q = S.settings.quality, i = QUALITY_ORDER.indexOf(q);
  const hot = therm >= 3;                                            // THERMAL_STATUS_SEVERE or worse
  if (fps < 24 || hot) { AUTOP.lowSec++; AUTOP.highSec = 0; } else if (fps > 55 && therm <= 1) { AUTOP.highSec++; AUTOP.lowSec = 0; } else { AUTOP.lowSec = 0; AUTOP.highSec = 0; }
  const now = performance.now();
  if (AUTOP.lowSec >= (hot ? 3 : 6) && i > 0 && now - AUTOP.lastChange > 8000) { AUTOP.lastChange = now; AUTOP.lowSec = 0; setQualityLevel(QUALITY_ORDER[i - 1], hot ? 'device hot' : 'FPS ' + Math.round(fps)); }
  else if (AUTOP.highSec >= 60 && i < QUALITY_ORDER.indexOf(AUTOP.benchmark ? AUTOP.benchmark.level : (IS_MOBILE ? 'HIGH' : 'ULTRA')) && now - AUTOP.lastChange > 30000) { AUTOP.lastChange = now; AUTOP.highSec = 0; setQualityLevel(QUALITY_ORDER[i + 1], 'FPS ' + Math.round(fps)); }
}
/* SAFE SPEED LIMIT: the effective simulation speed steps down (100 → 50 → 25 → 10) while frames take too long */
const SAFE = { cap: 100, slow: 0, fast: 0, warned: false };
function safeSpeedCap() { return SAFE.cap; }
function safeSpeed(sp) { return GSET.safeSpeed === false ? sp : Math.min(sp, SAFE.cap); }
function safeSpeedTick() {
  if (!STARTED || !S) return;
  const sp = S.settings.speed, fm = PERF.frameMs || 0, budget = IS_MOBILE || GSET.lowEnd ? 40 : 90;
  if (sp >= 25 && fm > budget) { SAFE.slow++; SAFE.fast = 0; } else if (fm < budget * 0.55) { SAFE.fast++; SAFE.slow = 0; } else { SAFE.slow = 0; SAFE.fast = 0; }
  const L = [10, 25, 50, 100], i = L.indexOf(SAFE.cap);
  if (SAFE.slow >= 3 && i > (IS_MOBILE ? 0 : 1)) { SAFE.cap = L[i - 1]; SAFE.slow = 0; Log.info('SAFE SPEED LIMIT: ' + SAFE.cap + '× (frame ' + Math.round(fm) + ' ms)'); if (!SAFE.warned) { SAFE.warned = true; toast('🛡️ Safe speed limit: simulation capped at ' + SAFE.cap + '× to protect the device', ''); } }
  else if (SAFE.fast >= 10 && i < L.length - 1) { SAFE.cap = L[i + 1]; SAFE.fast = 0; }
}
setInterval(function () { try { autoPerfTick(); safeSpeedTick(); } catch (e) { /* never break the loop */ } }, 1000);

/* ===================================== ACCESSIBILITY ===================================== */
function applySettings2() {
  applyPlatformClasses();
  if (typeof S !== 'undefined' && S && S.settings) { applyPerfMode(); if (typeof applyAccessibility === 'function') applyAccessibility(); }
  document.body.classList.toggle('cbHeat', !!(GSET.cbHeat || (S && S.settings && S.settings.colorFriendly)));
}
/* Colour-blind friendly heatmaps: viridis-like ramp (dark blue → teal → yellow) instead of red/green */
const _rampColor0 = window.rampColor;
window.rampColor = function (ramp, v, a) {
  if (!(GSET.cbHeat || (S && S.settings && S.settings.colorFriendly))) return _rampColor0(ramp, v, a);
  v = clamp(v, 0, 1); if (ramp === 'good') v = 1 - v;
  const stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]], f = v * 4, k = Math.min(3, Math.floor(f)), t = f - k, A = stops[k], B = stops[k + 1];
  return 'rgba(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ',' + a + ')';
};

/* ===================================== NOTIFICATIONS ===================================== */
const NOTE = { list: [], seenPop: 0, seenCo: null, lastTraffic: 0, lastBuild: 0 };
function notifyCat(cat) { return !GSET.notify || GSET.notify[cat] !== false; }
function pushNotification(cat, icon, text) {
  if (!notifyCat(cat)) return;
  NOTE.list.unshift({ t: Date.now(), cat: cat, icon: icon, text: text }); if (NOTE.list.length > 60) NOTE.list.length = 60;
  toast(icon + ' ' + text, cat === 'disaster' ? 'bad' : cat === 'population' || cat === 'build' ? 'good' : '');
}
const NOTE_POP_MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
function notificationsTick() {
  if (!STARTED || !S) return;
  const p = Math.floor(S.city.population);
  if (!NOTE.seenPop) NOTE.seenPop = p;
  NOTE_POP_MILESTONES.forEach(function (m) { if (NOTE.seenPop < m && p >= m) pushNotification('population', '🎉', 'City reached ' + fmt(m) + ' population.'); });
  NOTE.seenPop = Math.max(NOTE.seenPop, p);
  const cos = AI_DEFS.length; if (NOTE.seenCo === null) NOTE.seenCo = cos; else if (cos > NOTE.seenCo) { pushNotification('business', '🏢', 'New company founded: ' + AI_DEFS[cos - 1].name + '.'); NOTE.seenCo = cos; } else NOTE.seenCo = cos;
  if ((SIM.traffic || 0) > 70 && Date.now() - NOTE.lastTraffic > 180000) { NOTE.lastTraffic = Date.now(); pushNotification('traffic', '🚦', 'Traffic congestion detected (' + Math.round(SIM.traffic) + '%).'); }
}
setInterval(function () { try { notificationsTick(); } catch (e) { /* ignore */ } }, 2000);
/* construction completed (one message per completion burst) */
(function () {
  const pb = window.placeBuilding;
  if (typeof pb !== 'function') return;
  let watch = new Set();
  window.placeBuilding = function () { const r = pb.apply(this, arguments); try { const b = S.buildings.list[S.buildings.list.length - 1]; if (b && !b.built) watch.add(b.id); } catch (e) { /* ignore */ } return r; };
  setInterval(function () {
    if (!STARTED || !watch.size) return;
    const done = []; watch.forEach(function (id) { const b = MAP.byId.get(id); if (!b) watch.delete(id); else if (b.built) { done.push(b); watch.delete(id); } });
    if (done.length) pushNotification('build', '🏗️', done.length === 1 ? 'New building completed: ' + bdef(done[0]).name + '.' : done.length + ' new buildings completed.');
  }, 1500);
})();

/* ===================================== GAMEPAD 2.0 ===================================== */
const PADN = { buttons: [], axes: [0, 0, 0, 0], t: 0 };            // native Android controller state (MainActivity)
window.bctPadKey = function (code, down) {
  const map = { 96: 0, 97: 1, 99: 2, 100: 3, 102: 4, 103: 5, 104: 6, 105: 7, 109: 8, 108: 9, 106: 10, 107: 11, 19: 12, 20: 13, 21: 14, 22: 15, 4: 1, 82: 9 };
  const i = map[code]; if (i === undefined) return false;
  PADN.buttons[i] = !!down; PADN.t = performance.now(); return true;
};
window.bctPadAxes = function (x, y, z, rz, lt, rt) { PADN.axes = [+x || 0, +y || 0, +z || 0, +rz || 0]; PADN.lt = +lt || 0; PADN.rt = +rt || 0; PADN.buttons[6] = PADN.lt > 0.4; PADN.buttons[7] = PADN.rt > 0.4; PADN.t = performance.now(); };
const PAD2 = { prev: {}, listen: null };
window.pollGamepad = function (dt) {
  if (!S || S.settings.gamepad === false) return;
  let gp = null;
  if (PADN.t && performance.now() - PADN.t < 30000) gp = { id: 'Android controller', axes: PADN.axes, buttons: PADN.buttons.map(function (b, i) { return { pressed: !!b, value: i === 6 ? PADN.lt || (b ? 1 : 0) : i === 7 ? PADN.rt || (b ? 1 : 0) : (b ? 1 : 0) }; }) };
  else if (navigator.getGamepads) { try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) if (all[i] && all[i].connected) { gp = all[i]; break; } } catch (e) { return; } }
  if (!gp) { if (PAD.active) { PAD.active = false; UI.gamepadCursor = false; } return; }
  if (!PAD.active) { PAD.active = true; toast('🎮 Gamepad connected: left stick move · triggers zoom · A select · B cancel · X build · RB rotate camera · Start menu', 'good'); Log.info('Gamepad: ' + (gp.id || 'controller')); }
  const btn = function (i) { return !!(gp.buttons[i] && gp.buttons[i].pressed); };
  if (PAD2.listen) { for (let i = 0; i < 18; i++) if (btn(i) && !PAD2.prev[i]) { GSET.padMap[PAD2.listen] = i; saveGSET(); toast('🎮 ' + PAD2.listen + ' → button ' + i, 'good'); PAD2.listen = null; if ($('modalWrap').classList.contains('show')) openSettings('controls'); } for (let i = 0; i < 18; i++) PAD2.prev[i] = btn(i); return; }
  const M = GSET.padMap, ax = function (i) { const v = gp.axes[i] || 0; return Math.abs(v) > 0.18 ? v : 0; };
  const edgeA = function (act) { const i = M[act], p = btn(i), was = PAD2.prev[i]; return p && !was; };
  const edges = {}; PAD_ACTIONS.forEach(function (a) { edges[a[0]] = edgeA(a[0]); });
  for (let i = 0; i < 18; i++) PAD2.prev[i] = btn(i);
  UI.gamepadCursor = STARTED;
  if (!STARTED) { if (edges.select) $('playBtn').click(); return; }
  const sp = 520 * dt / CAM.zoom * (GSET.cameraSpeed / 100);
  let mx = ax(0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0), my = ax(1) + (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
  if (CAM.rot) { const c = Math.cos(-CAM.rot), s = Math.sin(-CAM.rot), x = mx * c - my * s; my = mx * s + my * c; mx = x; }
  CAM.x += mx * sp; CAM.y += my * sp;
  const val = function (act) { const b = gp.buttons[M[act]]; return b ? (b.value || (b.pressed ? 1 : 0)) : 0; };
  const zin = val('zoomIn') - val('zoomOut') - ax(3) * 0.8;
  if (Math.abs(zin) > 0.05) CAM.zoom = clamp(CAM.zoom * (1 + zin * dt * 1.6), 0.3, 2.6);
  if (Math.abs(ax(2)) > 0.5 && GSET.rotateCam !== false) setCamRot((CAM.rot || 0) + ax(2) * dt * 1.4);
  clampCamera();
  if (edges.select) { if (UI.dialog) advanceDialogue(); else if (UI.placing && MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) mobileConfirmPlace(); else { UI.lastPointer = 'mouse'; UI.hover = tileAtScreen(CW / 2, CH / 2); handleTap(CW / 2, CH / 2); } }
  if (edges.cancel) { if (typeof window.bctOnBack === 'function' && IS_MOBILE) window.bctOnBack(); else cancelAction(); }
  if (edges.build) openPanel('build');
  if (edges.city) openPanel('city');
  if (edges.menu) { if ($('modalWrap').classList.contains('show')) closeModal(); else openPauseMenu(); }
  if (edges.rotatePlace && UI.placing) { rotatePlacement(); if (typeof renderBuildBar === 'function') renderBuildBar(); }
  if (edges.rotateCam && GSET.rotateCam !== false) setCamRot((CAM.rot || 0) + Math.PI / 4);
  if (edges.palette) openPalette();
  if (UI.placing && MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { const g = ghostTile(CW / 2, CH / 2); if (!UI.ghost || g.x !== UI.ghost.x || g.y !== UI.ghost.y) { UI.ghost = g; renderBuildBar(); } }
  UI.hover = tileAtScreen(CW / 2, CH / 2);
};

/* ===================================== SETTINGS 2.0 (tabbed) ===================================== */
const SET2 = { tab: 'graphics' };
const SET2_TABS = [['graphics', '🎨', 'GRAPHICS'], ['audio', '🔊', 'AUDIO'], ['controls', '🎮', 'CONTROLS'], ['camera', '🎥', 'CAMERA'], ['simulation', '🧠', 'SIMULATION'], ['accessibility', '♿', 'ACCESSIBILITY'], ['system', '💾', 'SYSTEM']];
window.openSettings = function (tab) {
  if (tab) SET2.tab = tab;
  const se = S.settings;
  const opt = function (key, vals, labels) { return '<div class="row s2Opts">' + vals.map(function (v, i) { return '<button class="btn small ' + (se[key] === v ? 'gold' : '') + '" data-act="set" data-k="' + key + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  const tog = function (key, label) { return '<div class="between s2Row"><span>' + label + '</span><button class="btn small ' + (se[key] ? 'green' : '') + '" data-act="toggle" data-k="' + key + '">' + (se[key] ? 'ON' : 'OFF') + '</button></div>'; };
  const g2 = function (key, vals, labels) { return '<div class="row s2Opts">' + vals.map(function (v, i) { return '<button class="btn small ' + (String(GSET[key]) === String(v) ? 'gold' : '') + '" data-gs2="' + key + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  const t2 = function (key, label) { return '<div class="between s2Row"><span>' + label + '</span><button class="btn small ' + (GSET[key] ? 'green' : '') + '" data-gs2="' + key + '" data-v="' + (GSET[key] ? '0' : '1') + '">' + (GSET[key] ? 'ON' : 'OFF') + '</button></div>'; };
  const sec = function (t) { return '<div class="secTitle">' + t + '</div>'; };
  const themes = UI_THEMES.filter(themeAvailable);
  let h = '';
  switch (SET2.tab) {
    case 'graphics':
      h = sec('Performance mode') + g2('perfMode', ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], ['⚙️ AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA']) +
        '<p class="small">Now: <b>' + perfModeLabel() + '</b>' + (AUTOP.benchmark ? ' · device benchmark ' + AUTOP.benchmark.score + ' (' + AUTOP.benchmark.cores + ' cores' + (AUTOP.benchmark.ramMB ? ', ' + Math.round(AUTOP.benchmark.ramMB / 1024) + ' GB' : '') + ')' : '') + '. AUTO measures the device, then lowers distant simulation, shadows, particles, vehicles and citizen detail when the FPS drops or the device gets hot.</p>' +
        (AUTOP.log.length ? '<p class="small">Recent: ' + AUTOP.log.slice(0, 3).map(esc).join(' · ') + '</p>' : '') +
        t2('lowEnd', '🔋 LOW-END DEVICE MODE (short render distance, no shadows, fewer citizens, traffic aggregation, aggressive chunk streaming)') +
        tog('autoQuality', '⚙️ Adaptive effects (reduce glow and effects below 30 FPS)') + gsTog('shadows', '🌗 ' + T('shadows')) +
        '<div class="small">✨ ' + T('particles') + '</div>' + gsBtns('particles', ['ON', 'REDUCED', 'OFF'], ['ON', 'REDUCED', 'OFF']) +
        tog('deco', '🌳 Procedural decorations') + tog('showFps', '📟 FPS / TPS monitor') +
        sec('UI theme') + opt('theme', themes.map(function (t) { return t.id; }), themes.map(function (t) { return t.name; })) +
        sec('Building skin') + opt('skin', S.meta.skins, S.meta.skins.map(function (s) { return ({ classic: '🧱 Classic', neon: '🌈 Neon (NG+)', gold: '👑 Gold' })[s]; }));
      if (DESKTOP) { const mode = GSET.borderless ? 'borderless' : GSET.fullscreen ? 'fullscreen' : 'windowed'; h += sec('Display') + '<div class="small">' + T('resolution') + '</div>' + gsBtns('resolution', RESOLUTIONS, RESOLUTIONS.map(function (r) { return r.replace('x', '×'); })) + '<div class="small" style="margin-top:6px">' + T('windowMode') + ' (F11)</div><div class="row s2Opts">' + [['windowed', T('windowed')], ['fullscreen', T('fullscreen')], ['borderless', T('borderless')]].map(function (m) { return '<button class="btn small ' + (mode === m[0] ? 'gold' : '') + '" data-gset="windowMode" data-v="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' + (PSH.restartNeeded ? '<p class="small">' + T('restartNote') + ' <button class="btn small blue" data-gset="restart" data-v="1">' + T('applyRestart') + '</button></p>' : ''); }
      if (IS_ANDROID) h += sec('Screen orientation') + g2('orientation', ['landscape', 'auto', 'portrait'], ['🖼 Landscape', '🔄 Auto-rotate', '📱 Portrait']);
      break;
    case 'audio':
      h = sec('Audio') + tog('sound', '🔊 Sound effects') + tog('music', '🎵 Music') + '<div class="small">🔈 ' + T('volume') + ' (' + GSET.masterVolume + '%)</div>' + gsBtns('masterVolume', [0, 25, 50, 80, 100], ['0', '25', '50', '80', '100']) + tog('bubbles', '💬 Citizen speech bubbles');
      break;
    case 'controls':
      h = sec('Gamepad') + tog('gamepad', '🎮 Gamepad / controller support' + (PAD.active ? ' — connected' : '')) +
        '<table class="p10Tbl"><tr><th>Action</th><th>Button</th><th></th></tr>' + PAD_ACTIONS.map(function (a) { return '<tr><td>' + a[1] + '</td><td>' + (PAD2.listen === a[0] ? '<b class="neg">press a button…</b>' : 'button ' + GSET.padMap[a[0]]) + '</td><td><button class="btn small" data-pad="' + a[0] + '">Assign</button></td></tr>'; }).join('') + '</table><p class="small">Left stick / D-pad: move camera · right stick: zoom (Y) and rotate (X). <button class="btn small" data-pad="reset">Reset mapping</button></p>' +
        sec('Purchase confirmation') + opt('confirm', ['always', 'expensive', 'never'], ['Always', 'Expensive only', 'Never']) +
        sec(IS_MOBILE ? 'Touch controls' : 'Keyboard & mouse') +
        (IS_MOBILE ? t2('largeTouch', '👆 Larger touch buttons') + '<p class="small">Tap select · one finger drag: move · pinch: zoom · two-finger twist: rotate · BUILD → MOVE → CONFIRM · ROAD: START → DRAG → END → CONFIRM · back button: close / pause.</p>'
          : '<p class="small">Drag / one finger: pan · wheel / pinch: zoom · click: select · right-click: cancel.<br>Keys: <b>B</b> build · <b>M</b> map · <b>C</b> city · <b>R</b> rotate while placing · <b>T</b> roads · <b>P</b>/<b>Space</b> pause · <b>Esc</b> menu · <b>Z</b> zone · <b>X</b> bulldoze · <b>L</b> layers · <b>N</b> heatmaps · <b>G</b> statistics · <b>Ctrl+S</b> save · <b>F11</b> fullscreen · <b>F12</b> screenshot · <b>Ctrl+K</b> command palette.</p>');
      break;
    case 'camera':
      h = sec('Camera') + '<div class="small">Camera speed (' + GSET.cameraSpeed + '%)</div>' + g2('cameraSpeed', [60, 80, 100, 130, 170, 220], ['60%', '80%', '100%', '130%', '170%', '220%']) +
        t2('rotateCam', '🔄 Camera rotation (two-finger twist, gamepad right stick / RB)') + t2('invertPan', '↔️ Invert drag direction') + (IS_DESKTOP ? t2('edgePan', '🖱 Move camera at the screen edge') : '') +
        '<div class="row s2Opts"><button class="btn small" data-gs2="resetCam" data-v="1">↺ North up (reset rotation)</button><button class="btn small" data-gs2="centerCam" data-v="1">🎯 Center camera</button></div>' + tog('minimap', '🧭 Minimap');
      break;
    case 'simulation': {
      const pct = [25, 50, 75, 100, 150, 200];
      h = sec('Simulation quality') + g2('simQuality', ['LOW', 'MEDIUM', 'HIGH'], ['LOW (more aggregation)', 'MEDIUM', 'HIGH']) +
        '<p class="small">Distant districts use citizen and traffic aggregation, chunk streaming and LOD in every mode; the quality sets how many citizens and vehicles are simulated individually.</p>' +
        '<div class="small">👥 ' + T('npc') + '</div>' + gsBtns('npcDensity', pct, pct.map(function (x) { return x + '%'; })) + '<div class="small" style="margin-top:6px">🚗 ' + T('traffic2') + '</div>' + gsBtns('trafficDensity', pct, pct.map(function (x) { return x + '%'; })) +
        t2('safeSpeed', '🛡️ Safe speed limit (heavy speeds slow down automatically on a struggling device) — now ' + SAFE.cap + '×') +
        gsTog('autosave', '💾 ' + T('autosave')) + '<div class="small">' + T('interval') + '</div>' + gsBtns('autosaveInterval', [15, 30, 60, 120, 300], ['15 s', '30 s', '1 min', '2 min', '5 min']) + gsTog('pauseOnBlur', '⏸️ ' + T('pauseBlur')) +
        tog('dynDiff', '🎚️ Dynamic difficulty') + tog('dailyReport', '📰 Daily city report') + tog('autoEvolve', '✨ Auto-evolve buildings') +
        sec('Notifications') + NOTIFY_CATS.map(function (c) { const on = GSET.notify[c[0]] !== false; return '<div class="between s2Row"><span>' + c[1] + ' ' + c[2] + '</span><button class="btn small ' + (on ? 'green' : '') + '" data-gs2="notify" data-v="' + c[0] + '">' + (on ? 'ON' : 'OFF') + '</button></div>'; }).join('') +
        (NOTE.list.length ? '<p class="small">Latest: ' + NOTE.list.slice(0, 4).map(function (n) { return n.icon + ' ' + esc(n.text); }).join(' · ') + '</p>' : '');
      break;
    }
    case 'accessibility':
      h = sec('Accessibility') + '<div class="small">🔍 UI scale (' + GSET.uiScale + '%)</div>' + g2('uiScale', [80, 90, 100, 115, 130, 145], ['80%', '90%', '100%', '115%', '130%', '145%']) +
        '<div class="small" style="margin-top:6px">🔠 Text size</div>' + g2('textSize', ['S', 'M', 'L', 'XL'], ['Small', 'Medium', 'Large', 'Extra large']) +
        tog('highContrast', '◐ High contrast') + tog('reducedMotion', '🧘 Reduced motion') + '<div class="between s2Row"><span>📳 Screen shake off</span><button class="btn small ' + (se.screenShake === false ? 'green' : '') + '" data-act="toggle" data-k="screenShake">' + (se.screenShake === false ? 'ON' : 'OFF') + '</button></div>' +
        t2('cbHeat', '🎨 Colour-blind friendly heatmaps') + tog('colorFriendly', '🎨 Colour-friendly UI colours') + t2('largeTouch', '👆 Larger touch buttons') + t2('tutorialHints', '💡 Tutorial hints') +
        tog('particleReduce', '✨ Particle reduction') + '<div class="row s2Opts"><button class="btn small" data-gs2="replayTut" data-v="1">🎓 Replay ' + (IS_MOBILE ? 'mobile ' : '') + 'tutorial</button></div>';
      break;
    case 'system':
      h = sec('Save data · format CITY_SAVE_V4 (v' + SAVE_VERSION + ')') + '<div class="row s2Opts"><button class="btn small green" data-act="saveNow">💾 Save now</button><button class="btn small" data-act="downloadSave">📤 Export city</button><button class="btn small" data-act="importSave">📥 Import city</button><button class="btn small" data-gs2="backupNow" data-v="1">🗄 Backup</button><button class="btn small" data-gset="exportAll" data-v="1">' + T('exportAll') + '</button><button class="btn small" data-gset="importOld" data-v="1">' + T('importOld') + '</button></div>' +
        '<p class="small">' + (GSET.autosave ? 'Autosave every ' + autosaveInterval() + ' s' : 'Autosave is OFF') + ' · validated saves with backups · saves are the same file on Windows and Android (platform graphics settings stay on each device).</p>' +
        (premigBackups(S.slot || 1).length ? '<p class="small">Pre-update backup of this slot: v' + premigBackups(S.slot || 1)[0].v + ' <button class="btn small" data-gs2="rollback" data-v="1">⏪ ROLLBACK</button></p>' : '') +
        sec(T('language')) + gsBtns('language', ['en', 'tr'], ['English', 'Türkçe']) +
        (DESKTOP ? sec(T('folders')) + '<div class="row s2Opts"><button class="btn small" data-gset="folder" data-v="saves">' + T('saves') + '</button><button class="btn small" data-gset="folder" data-v="screenshots">' + T('shots') + '</button><button class="btn small" data-gset="folder" data-v="logs">' + T('logs') + '</button><button class="btn small" data-gset="updates" data-v="1">' + T('updates') + '</button></div>' : '') +
        (AdminAuth.active() ? sec('🛡️ Admin session') + '<div class="small">Auto-lock after inactivity</div>' + g2('adminLockMin', [1, 5, 10, 15, 30, 60], ['1 min', '5 min', '10 min', '15 min', '30 min', '60 min']) + '<div class="row s2Opts"><button class="btn small red" data-gs2="adminLogout" data-v="1">⏏ LOG OUT</button></div>' : '') +
        sec('About') + '<p class="small verTap" id="setVersion">' + T('version') + ' ' + GAME_VERSION + ' · ' + PLATFORM_NAME + ' · save v' + SAVE_VERSION + ' · build ' + BUILD.profile.toUpperCase() + '</p><p class="small">Offline-first: the whole city simulation works without internet.</p>';
      break;
  }
  const tabs = '<div class="tabs s2Tabs">' + SET2_TABS.map(function (t) { return '<button class="tab ' + (SET2.tab === t[0] ? 'on' : '') + '" data-s2tab="' + t[0] + '">' + t[1] + ' ' + t[2] + '</button>'; }).join('') + '</div>';
  showModal('⚙️ Settings', tabs + '<div class="s2Body">' + h + '</div>');
};
document.addEventListener('click', function (e) {
  const tb = e.target.closest && e.target.closest('[data-s2tab]');
  if (tb) { e.preventDefault(); SET2.tab = tb.dataset.s2tab; openSettings(); sfx('click'); return; }
  const pd = e.target.closest && e.target.closest('[data-pad]');
  if (pd) { e.preventDefault(); if (pd.dataset.pad === 'reset') { GSET.padMap = null; saveGSET(); location.reload(); return; } PAD2.listen = pd.dataset.pad; openSettings(); return; }
  const el = e.target.closest && e.target.closest('[data-gs2]');
  if (!el) return;
  e.preventDefault();
  const k = el.dataset.gs2, v = el.dataset.v;
  switch (k) {
    case 'notify': GSET.notify[v] = GSET.notify[v] === false; break;
    case 'resetCam': setCamRot(0); break;
    case 'centerCam': { const c = $('centerBtn'); if (c) c.click(); return; }
    case 'replayTut': closeModal(); if (IS_MOBILE) { GSET.mobileTutDone = false; startMobileTutorial(true); } else if (typeof startTutorial === 'function') startTutorial(); return;
    case 'backupNow': { const slot = S.slot || 1; saveGame(true); try { Store.setItem(slotKey(slot) + '_manual', Store.getItem(slotKey(slot))); toast('🗄 Backup saved (slot ' + slot + ')', 'good'); } catch (err) { toast('❌ Backup failed', 'bad'); } return; }
    case 'rollback': confirmDialog('⏪ Roll back to the pre-update save?', 'The slot is replaced by the original save from before the last update (the current one is kept as backup).', 'Roll back', function () { const r = rollbackMigration(S.slot || 1); toast(r.ok ? '✅ ' + r.msg + ' — loading' : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); if (r.ok) loadSlot(S.slot || 1); }); return;
    case 'adminLogout': AdminAuth.logout(); break;
    case 'adminLockMin': if (!AdminAuth.active()) return; GSET.adminLockMin = clamp(+v, 1, 120); AdminAuth.record('sec_lockMin', v, 'from Settings'); break;
    default: {
      const bools = ['lowEnd', 'largeTouch', 'tutorialHints', 'rotateCam', 'invertPan', 'edgePan', 'cbHeat', 'safeSpeed'], nums = ['uiScale', 'cameraSpeed'];
      if (bools.indexOf(k) >= 0) GSET[k] = v === '1'; else if (nums.indexOf(k) >= 0) GSET[k] = +v; else GSET[k] = v;
      if (k === 'perfMode' && v === 'AUTO') GSET.autoPerfLevel = '';
      if (k === 'orientation') applyOrientation();
      if (k === 'safeSpeed' && v === '1') SAFE.cap = 100;
    }
  }
  saveGSET(); applySettings2(); sfx('click');
  if ($('modalWrap').classList.contains('show')) openSettings();
});
/* edge panning (desktop, optional): the camera moves when the mouse rests at the window border */
const EDGE = { x: -1, y: -1 };
window.addEventListener('mousemove', function (e) { EDGE.x = e.clientX; EDGE.y = e.clientY; }, { passive: true });
document.addEventListener('mouseleave', function () { EDGE.x = -1; }, { passive: true });
(function edgeLoop() {
  try {
    if (GSET.edgePan && STARTED && EDGE.x >= 0 && !$('modalWrap').classList.contains('show') && !(typeof ADM !== 'undefined' && ADM.open)) {
      const m = 14, sp = 9 * (GSET.cameraSpeed / 100) / CAM.zoom;
      let dx = EDGE.x < m ? -1 : EDGE.x > CW - m ? 1 : 0, dy = EDGE.y < m ? -1 : EDGE.y > CH - m ? 1 : 0;
      if (dx || dy) { if (CAM.rot) { const c = Math.cos(-CAM.rot), s = Math.sin(-CAM.rot), x = dx * c - dy * s; dy = dx * s + dy * c; dx = x; } CAM.x += dx * sp; CAM.y += dy * sp; clampCamera(); }
    }
  } catch (e) { /* not ready */ }
  requestAnimationFrame(edgeLoop);
})();
