'use strict';
/* BLOCK CITY TYCOON — MOBILE & CROSS-PLATFORM UI (Part 12)
   Same game engine on every platform; this file only changes INPUT and UI:
   - Android main menu (NEW CITY · CONTINUE · SANDBOX · SCENARIO · CHALLENGES · SETTINGS — no admin anywhere)
   - mobile HUD: Money · Population · Happiness · GDP · Power · Water on top, Build · Road · Transit · Economy · City · Map below
   - touch camera: one finger pan, two fingers pan + pinch zoom + rotate (camera rotation, ↺ resets north)
   - mobile build mode: BUILD · ROTATE · MOVE · CONFIRM · CANCEL with live road / power / water / zone / terrain checks
   - mobile road builder: START → DRAG → END → CONFIRM, road types Small / Medium / Large / Highway / Bridge / Tunnel
   - Android back button, screen orientation, first-launch setup and the mobile tutorial */

const MOB = { hud: null, bar: null, buildBar: null, roadSheet: null, road: { step: 0, kind: 'small' }, ghostMove: false, rot: null, lastHud: 0, tut: null };

/* ===================================== CAMERA ROTATION (shared by touch + gamepad) ===================================== */
function camRot() { return PHOTO.on ? (PHOTO.rot || 0) : (CAM.rot || 0); }
function setCamRot(r) { CAM.rot = Math.atan2(Math.sin(r), Math.cos(r)); if (Math.abs(CAM.rot) < 0.03) CAM.rot = 0; updateRotBtn(); }
function updateRotBtn() { const b = document.getElementById('mRotReset'); if (b) b.classList.toggle('hidden', !CAM.rot); }

/* ===================================== PLATFORM CLASSES & ACCESSIBILITY ===================================== */
function applyPlatformClasses() {
  const b = document.body;
  b.classList.toggle('platform-android', IS_ANDROID);
  b.classList.toggle('platform-windows', IS_WINDOWS);
  b.classList.toggle('platform-desktop', IS_DESKTOP);
  b.classList.toggle('mobileUI', IS_MOBILE);
  b.classList.toggle('largeTouch', !!GSET.largeTouch);
  b.classList.toggle('portrait', window.innerHeight > window.innerWidth);
  b.dataset.textsize = GSET.textSize || 'M';
  document.documentElement.style.setProperty('--ui-scale', String((GSET.uiScale || 100) / 100));
}
window.addEventListener('resize', function () { document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth); });

/* ===================================== MAIN MENU (Android) ===================================== */
function mobileMenuSetup() {
  const m = document.getElementById('menuMain'); if (!m) return;
  m.classList.toggle('mobMenu', IS_MOBILE);
}

/* ===================================== MOBILE HUD ===================================== */
function buildMobileHud() {
  if (!IS_MOBILE || MOB.hud) return;
  const top = document.createElement('div'); top.id = 'mHud';
  top.innerHTML = '<button class="mIcon" id="mMenu" aria-label="Menu">☰</button>' +
    '<div class="mStats">' +
    '<div class="mStat" data-mstat="money"><i>💰</i><b id="mMoney">$0</b></div>' +
    '<div class="mStat" data-mstat="pop"><i>👥</i><b id="mPop">0</b></div>' +
    '<div class="mStat" data-mstat="hap"><i id="mHapI">😊</i><b id="mHap">0%</b></div>' +
    '<div class="mStat" data-mstat="gdp"><i>📈</i><b id="mGdp">$0</b></div>' +
    '<div class="mStat" data-mstat="power"><i>⚡</i><b id="mPow">0</b></div>' +
    '<div class="mStat" data-mstat="water"><i>💧</i><b id="mWat">0</b></div></div>' +
    '<div class="mRight"><span id="mClock">06:00</span><button class="mIcon" id="mSpeed" aria-label="Speed">1×</button><button class="mIcon" id="mPause" aria-label="Pause">⏸</button><button class="mIcon hidden" id="mRotReset" aria-label="Reset rotation">↺</button></div>';
  document.body.appendChild(top); MOB.hud = top;
  const bar = document.createElement('nav'); bar.id = 'mBar';
  bar.innerHTML = [['build', '🏗️', 'Build'], ['road', '🛣️', 'Road'], ['transit', '🚇', 'Transit'], ['economy', '💰', 'Economy'], ['city', '🏙️', 'City'], ['map', '🗺️', 'Map']]
    .map(function (x) { return '<button class="mBtn" data-mbar="' + x[0] + '"><span>' + x[1] + '</span>' + x[2] + '</button>'; }).join('');
  document.body.appendChild(bar); MOB.bar = bar;
  top.querySelector('#mMenu').onclick = function () { if (STARTED) openPauseMenu(); };
  top.querySelector('#mPause').onclick = function () { setSpeed(S.settings.speed === 0 ? 1 : 0); refreshMobileHud(true); };
  top.querySelector('#mSpeed').onclick = function () { const L = [1, 2, 5, 10, 25, 50, 100], i = L.indexOf(S.settings.speed); setSpeed(L[(i + 1) % L.length]); refreshMobileHud(true); };
  top.querySelector('#mRotReset').onclick = function () { setCamRot(0); };
  top.querySelectorAll('[data-mstat]').forEach(function (el) { el.onclick = function () { const k = el.dataset.mstat; if (k === 'money' || k === 'gdp') openPanel('city', 'economy'); else if (k === 'power' || k === 'water') { if (typeof showLayers === 'function') showLayers(); } else openPanel('city'); }; });
  bar.addEventListener('click', function (e) {
    const b = e.target.closest('[data-mbar]'); if (!b || !STARTED) return;
    sfx('click');
    const k = b.dataset.mbar;
    if (k !== 'road') closeRoadBuilder();
    if (k === 'build') { if (UI.panel === 'build') closeLeft(); else openPanel('build'); }
    else if (k === 'road') { if (UI.tool === 'road') { setTool('select'); closeRoadBuilder(); } else { closeLeft(); setTool('road'); openRoadBuilder(); } }
    else if (k === 'transit') openPanel('city', 'transit');
    else if (k === 'economy') openPanel('city', 'economy');
    else if (k === 'city') openPanel('city');
    else if (k === 'map') openWorldMap();
    refreshMobileBar();
  });
}
function refreshMobileBar() {
  if (!MOB.bar) return;
  MOB.bar.querySelectorAll('[data-mbar]').forEach(function (b) { const k = b.dataset.mbar; b.classList.toggle('on', (k === 'road' && UI.tool === 'road') || (k === 'build' && (UI.panel === 'build' || UI.tool === 'build'))); });
}
function hudGdp() { const g = S.p10 && S.p10.graphs && S.p10.graphs.gdp; return g && g.length ? g[g.length - 1] : Math.max(0, (SIM.pInc || 0) + (SIM.bInc || 0)) * YEAR_GAME_SEC / TIME_SCALE; }
function refreshMobileHud(force) {
  if (!MOB.hud || !STARTED || !S) return;
  const t = performance.now(); if (!force && t - MOB.lastHud < 400) return; MOB.lastHud = t;
  const set = function (id, v) { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; };
  set('mMoney', money(S.money)); set('mPop', fmt(Math.floor(S.city.population))); set('mHap', Math.round(S.city.happiness) + '%');
  set('mHapI', S.city.happiness >= 70 ? '😊' : S.city.happiness >= 45 ? '😐' : '😠');
  set('mGdp', money(hudGdp()));
  const pg = SIM.powerGen || 0, pu = SIM.powerUse || 0, wg = SIM.waterGen || 0, wu = SIM.waterUse || 0;
  set('mPow', fmt(Math.round(pu)) + '/' + fmt(Math.round(pg)));
  set('mWat', fmt(Math.round(wu)) + '/' + fmt(Math.round(wg)));
  const pw = document.querySelector('[data-mstat="power"]'), wa = document.querySelector('[data-mstat="water"]');
  if (pw) pw.classList.toggle('bad', pu > pg); if (wa) wa.classList.toggle('bad', wu > wg);
  set('mClock', ($('tClock') || {}).textContent || '');
  set('mSpeed', (safeSpeedCap() < S.settings.speed ? safeSpeedCap() + '×*' : S.settings.speed + '×'));
  set('mPause', S.settings.speed === 0 ? '▶' : '⏸');
  refreshMobileBar();
}

/* ===================================== TOUCH CAMERA ===================================== */
/* Two-finger gesture: pan (midpoint), pinch zoom (distance) and rotate (angle) — registered before main.js's handlers */
function mobileGestureStart() {
  const p = Array.from(INPUT.pointers.values()); if (p.length < 2) return;
  const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  MOB.rot = { a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), rot0: CAM.rot || 0, mid: mid, world: screenToWorld(mid.x, mid.y), d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: CAM.zoom, rotating: false };
}
function mobileGestureMove() {
  const g = MOB.rot, p = Array.from(INPUT.pointers.values()); if (!g || p.length < 2) return false;
  const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  const a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
  let da = a - g.a; da = Math.atan2(Math.sin(da), Math.cos(da));
  if (GSET.rotateCam !== false && !PHOTO.on) { if (!g.rotating && Math.abs(da) > 0.18) g.rotating = true; if (g.rotating) setCamRot(g.rot0 + da); }
  CAM.zoom = clamp(g.zoom * d / Math.max(10, g.d), 0.3, 2.6);
  const now = screenToWorld(mid.x, mid.y);                // keep the world point under the fingers (two-finger pan)
  CAM.x += g.world.x - now.x; CAM.y += g.world.y - now.y; clampCamera();
  return true;
}
function bindTouchCamera() {
  canvas.addEventListener('pointerdown', function () { if (INPUT.pointers.size >= 1 && !MOB.rot) { /* the second pointer is added by main.js right after */ setTimeout(function () { if (INPUT.pointers.size >= 2) mobileGestureStart(); }, 0); } }, true);
  canvas.addEventListener('pointermove', function (e) {
    if (INPUT.pointers.size >= 2 && MOB.rot && INPUT.pointers.has(e.pointerId)) { INPUT.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (mobileGestureMove()) { e.stopImmediatePropagation(); return; } }
    if (MOB.ghostMove && UI.placing && UI.tool === 'build' && INPUT.down && INPUT.pointers.size === 1 && e.pointerType !== 'mouse') { moveGhostTo(e.clientX, e.clientY); INPUT.moved = true; e.stopImmediatePropagation(); return; }
    if (UI.tool === 'road' && UI.roadDrag && UI.roadDrag.touch && INPUT.pointers.size === 1) { const t = tileAtScreen(e.clientX, e.clientY); UI.roadDrag.x1 = t.x; UI.roadDrag.y1 = t.y; INPUT.moved = true; MOB.road.step = 2; updateRoadSheet(); e.stopImmediatePropagation(); }
  }, true);
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' || INPUT.pointers.size > 0) return;
    if (MOB.ghostMove && UI.placing && UI.tool === 'build') { moveGhostTo(e.clientX, e.clientY); return; }
    if (UI.tool === 'road' && MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) {       // START
      const t = tileAtScreen(e.clientX, e.clientY);
      UI.roadDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, touch: true }; MOB.road.step = 1; updateRoadSheet(); $('placeBar').classList.add('hidden');
    }
  }, true);
  canvas.addEventListener('pointerup', function (e) {
    if (INPUT.pointers.size <= 2) MOB.rot = null;
    if (UI.tool === 'road' && UI.roadDrag && UI.roadDrag.touch && INPUT.pointers.size <= 1) {      // END → CONFIRM
      INPUT.pointers.delete(e.pointerId); INPUT.down = null; INPUT.pinch = null;
      MOB.road.step = 3; roadPreviewConfirm(); updateRoadSheet();
      e.stopImmediatePropagation();
    }
  }, true);
}

/* ===================================== MOBILE BUILD MODE ===================================== */
function placementChecks(d, x, y) {
  const out = [], c = canPlace(d, x, y), code = c.code || '';
  const road = d.noRoad || S.city.sandbox || hasRoadNext(d, x, y);
  out.push(['🛣️', 'Road', d.noRoad ? 'na' : road ? 'ok' : 'bad']);
  const pw = d.power < 0 ? (SIM.powerGen - SIM.powerUse >= -d.power ? 'ok' : SIM.powerGen > 0 || S.city.sandbox ? 'warn' : 'bad') : d.power > 0 ? 'ok' : 'na';
  const wt = d.water < 0 ? (SIM.waterGen - SIM.waterUse >= -d.water ? 'ok' : SIM.waterGen > 0 || S.city.sandbox ? 'warn' : 'bad') : d.water > 0 ? 'ok' : 'na';
  out.push(['⚡', 'Power', pw]); out.push(['💧', 'Water', wt]);
  let zoneOk = true; for (let yy = y; yy < y + d.h && zoneOk; yy++) for (let xx = x; xx < x + d.w; xx++) { if (!inMap(xx, yy)) { zoneOk = false; break; } const z = MAP.zone[idx(xx, yy)]; if (z && !zoneAllows(z, d)) { zoneOk = false; break; } }
  out.push(['🟩', 'Zone', zoneOk ? 'ok' : 'bad']);
  out.push(['⛰️', 'Terrain', ['terrain', 'map', 'land', 'occupied'].indexOf(code) >= 0 ? 'bad' : 'ok']);
  return { list: out, chk: c };
}
function checksHtml(d, x, y) {
  const r = placementChecks(d, x, y);
  return '<div class="mChecks">' + r.list.map(function (c) { return '<span class="mChk ' + c[2] + '" title="' + c[1] + '">' + c[0] + ' ' + c[1] + ' ' + ({ ok: '✓', warn: '!', bad: '✗', na: '–' })[c[2]] + '</span>'; }).join('') + '</div>' +
    (r.chk.ok ? '' : '<div class="mWhy">❌ ' + esc(r.chk.reason) + '</div>');
}
function ghostTile(sx, sy) { const d = fpDef(UI.placing, UI.rot | 0), t = tileAtScreen(sx, sy); return { x: t.x - Math.floor((d.w - 1) / 2), y: t.y - Math.floor((d.h - 1) / 2) }; }
function moveGhostTo(sx, sy) { if (!UI.placing) return; const g = ghostTile(sx, sy); UI.ghost = g; UI.hover = { x: g.x, y: g.y }; renderBuildBar(); }
function openBuildBar() {
  if (!MOB.buildBar) {
    const el = document.createElement('div'); el.id = 'mBuildBar'; el.className = 'hidden';
    el.innerHTML = '<div class="mbInfo" id="mbInfo"></div><div class="mbBtns">' +
      '<button class="btn" data-mb="build">🏗️ BUILD</button><button class="btn blue" data-mb="rotate">↻ ROTATE</button><button class="btn" data-mb="move">✥ MOVE</button>' +
      '<button class="btn green" data-mb="confirm">✓ CONFIRM</button><button class="btn red" data-mb="cancel">✕ CANCEL</button></div>';
    document.body.appendChild(el); MOB.buildBar = el;
    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-mb]'); if (!b) return; sfx('click');
      const k = b.dataset.mb;
      if (k === 'build') { closeBuildBar(); setTool('select'); openPanel('build'); }
      else if (k === 'rotate') { rotatePlacement(); $('placeBar').classList.add('hidden'); renderBuildBar(); }
      else if (k === 'move') { MOB.ghostMove = !MOB.ghostMove; renderBuildBar(); toast(MOB.ghostMove ? '✥ MOVE: drag the building with one finger (two fingers move the camera)' : '✥ MOVE off — drag pans the camera', ''); }
      else if (k === 'confirm') mobileConfirmPlace();
      else if (k === 'cancel') { closeBuildBar(); setTool('select'); }
    });
  }
  MOB.buildBar.classList.remove('hidden'); document.body.classList.add('mBuilding');
  renderBuildBar();
}
function closeBuildBar() { MOB.ghostMove = false; if (MOB.buildBar) MOB.buildBar.classList.add('hidden'); document.body.classList.remove('mBuilding'); }
function renderBuildBar() {
  if (!MOB.buildBar || !UI.placing) return;
  if (!UI.ghost) { const g = ghostTile(CW / 2, CH / 2); UI.ghost = g; UI.hover = { x: g.x, y: g.y }; }
  const d = fpDef(UI.placing, UI.rot | 0);
  $('mbInfo').innerHTML = '<b>' + d.icon + ' ' + esc(d.name) + ' ↻' + ((UI.rot | 0) * 90) + '°</b> <span class="small">' + money(buildCost(d)) + ' · ' + d.w + '×' + d.h + '</span>' + checksHtml(d, UI.ghost.x, UI.ghost.y);
  const mv = MOB.buildBar.querySelector('[data-mb="move"]'); if (mv) mv.classList.toggle('gold', MOB.ghostMove);
  const cf = MOB.buildBar.querySelector('[data-mb="confirm"]'); if (cf) cf.disabled = !canPlace(d, UI.ghost.x, UI.ghost.y).ok;
}
function mobileConfirmPlace() {
  if (!UI.placing || !UI.ghost) return;
  const d0 = UI.placing, rot = UI.rot | 0, d = fpDef(d0, rot), g = UI.ghost, chk = canPlace(d, g.x, g.y);
  if (!chk.ok) { toast('❌ ' + chk.reason, 'bad'); sfx('error'); return; }
  placeBuilding(d0, g.x, g.y, rot);
  $('placeBar').classList.add('hidden');
  UI.ghost = null; renderBuildBar();               // keep placing the same building (next ghost at the screen centre)
}
/* Placement on touch: the ghost appears at the screen centre right away; tapping the map moves it */
function mobilePlacementHooks() {
  const sp = window.startPlacing;
  window.startPlacing = function (d) { const r = sp.apply(this, arguments); if (IS_MOBILE && UI.placing) { UI.ghost = null; openBuildBar(); } return r; };
  const ap = window.attemptPlace;
  window.attemptPlace = function (x, y) { if (IS_MOBILE && UI.placing && MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { UI.ghost = { x: x, y: y }; UI.hover = { x: x, y: y }; renderBuildBar(); return; } return ap.apply(this, arguments); };
  const st = window.setTool;
  window.setTool = function (t) { const r = st.apply(this, arguments); if (t !== 'build') closeBuildBar(); if (t !== 'road') closeRoadBuilder(); refreshMobileBar(); return r; };
}

/* ===================================== MOBILE ROAD BUILDER ===================================== */
const MOB_ROADS = [['small', 'Small', 1], ['medium', 'Medium', 2], ['large', 'Large', 3], ['highway', 'Highway', 4], ['bridge', 'Bridge', 3], ['tunnel', 'Tunnel', 2]];
function openRoadBuilder() {
  if (!IS_MOBILE) return;
  if (!MOB.roadSheet) {
    const el = document.createElement('div'); el.id = 'mRoad'; el.className = 'hidden';
    document.body.appendChild(el); MOB.roadSheet = el;
    el.addEventListener('click', function (e) {
      const t = e.target.closest('[data-mroad]'), a = e.target.closest('[data-mra]');
      if (t) { const r = MOB_ROADS.find(function (x) { return x[0] === t.dataset.mroad; }); const def = ROAD_TYPES[r[2]]; if (def.unlock && S.city.peakPop < def.unlock.pop && !S.city.sandbox) { toast('🔒 ' + def.name + ' unlocks at ' + fmt(def.unlock.pop) + ' population', 'bad'); return; } MOB.road.kind = r[0]; UI.roadType = r[2]; sfx('click'); updateRoadSheet(); return; }
      if (a) {
        if (a.dataset.mra === 'confirm') { const f = UI.pendingAction; UI.pendingAction = null; $('placeBar').classList.add('hidden'); if (f) f(); MOB.road.step = 0; UI.roadDrag = null; updateRoadSheet(); }
        else if (a.dataset.mra === 'cancel') { UI.roadDrag = null; UI.pendingAction = null; $('placeBar').classList.add('hidden'); MOB.road.step = 0; updateRoadSheet(); }
        else if (a.dataset.mra === 'close') { setTool('select'); closeRoadBuilder(); }
      }
    });
  }
  $('roadPop').classList.add('hidden');
  MOB.road.step = 0; MOB.roadSheet.classList.remove('hidden'); document.body.classList.add('mRoading');
  updateRoadSheet();
}
function closeRoadBuilder() { if (MOB.roadSheet) MOB.roadSheet.classList.add('hidden'); document.body.classList.remove('mRoading'); }
function updateRoadSheet() {
  if (!MOB.roadSheet) return;
  const steps = ['START', 'DRAG', 'END', 'CONFIRM'], s = MOB.road.step;
  const tip = { bridge: 'Drag across a river or lake — water tiles become a bridge (×4 cost).', tunnel: 'Drag through rock — rock tiles become a tunnel (×6 cost).' }[MOB.road.kind] || 'Touch the map to START, DRAG your finger, lift to END, then CONFIRM. Two fingers move the camera.';
  MOB.roadSheet.innerHTML = '<div class="mrTypes">' + MOB_ROADS.map(function (r) { const def = ROAD_TYPES[r[2]], lock = def.unlock && S.city.peakPop < def.unlock.pop && !S.city.sandbox; return '<button class="' + (MOB.road.kind === r[0] ? 'on' : '') + (lock ? ' dis' : '') + '" data-mroad="' + r[0] + '">' + ({ bridge: '🌉', tunnel: '🚇' }[r[0]] || def.icon) + ' ' + r[1] + '<small>' + money(roadTypeCost(r[2])) + '/tile</small></button>'; }).join('') + '</div>' +
    '<div class="mrSteps">' + steps.map(function (n, i) { return '<span class="' + (i < s ? 'done' : i === s ? 'cur' : '') + '">' + (i + 1) + ' ' + n + '</span>'; }).join('<i>→</i>') + '</div>' +
    '<div class="small mrTip">' + tip + '</div>' +
    '<div class="mrBtns">' + (s >= 3 ? '<button class="btn green" data-mra="confirm">✓ CONFIRM ' + esc(($('placeInfo') || {}).textContent || '') + '</button>' : '') + (s > 0 ? '<button class="btn" data-mra="cancel">↺ Redo</button>' : '') + '<button class="btn red" data-mra="close">✕ Close</button></div>';
}

/* ===================================== BACK BUTTON (Android) ===================================== */
/* Called by MainActivity.onBackPressed(): returns 'handled' or 'exit' (the activity then asks the OS to go home) */
window.bctOnBack = function () {
  try {
    if (document.getElementById('admLogin')) { closeAdminLogin(); return 'handled'; }
    if (MOB.tut) { endMobileTutorial(true); return 'handled'; }
    if (PSH && PSH.dialogOpen) { const btns = $('sysBtns').querySelectorAll('button'); const b = PSH.escIndex >= 0 ? btns[PSH.escIndex] : btns[btns.length - 1]; if (b) b.click(); return 'handled'; }
    if (typeof ADM !== 'undefined' && ADM.open) { closeAdminCenter(); return 'handled'; }
    if ($('modalWrap').classList.contains('show')) { closeModal(); return 'handled'; }
    if (MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) { setTool('select'); closeRoadBuilder(); return 'handled'; }
    if (MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { closeBuildBar(); setTool('select'); return 'handled'; }
    if (STARTED) {
      if (UI.tool !== 'select' || UI.selected || UI.panel || PHOTO.on || !$('placeBar').classList.contains('hidden')) { cancelAction(); $('placeBar').classList.add('hidden'); return 'handled'; }
      openPauseMenu(); return 'handled';
    }
    const vis = Array.from(document.querySelectorAll('#titleScreen .menuBox')).find(function (m) { return !m.classList.contains('hidden'); });
    if (vis && vis.id !== 'menuMain') { showMenu('main'); return 'handled'; }
    sysDialog(T('exitTitle'), '<p>' + T('exitSaved') + '</p>', [[T('exit'), 'red', function () { Platform.quit(); }], [T('cancel'), '', null]], 1);
    return 'handled';
  } catch (e) { Log.warn('Back button: ' + e.message); return 'exit'; }
};

/* ===================================== ORIENTATION ===================================== */
function applyOrientation() { Platform.setOrientation(GSET.orientation || 'landscape'); setTimeout(function () { if (typeof resizeCanvas === 'function') { resizeCanvas(); clampCamera(); } applyPlatformClasses(); }, 400); }

/* ===================================== FIRST LAUNCH SETUP & MOBILE TUTORIAL ===================================== */
function firstLaunchSetup(done) {
  if (GSET.setupDone) { if (done) done(); return; }
  const q = (GSET.perfMode || 'AUTO');
  const seg = function (k, vals, labels, cur) { return '<div class="seg flSeg" data-fl="' + k + '">' + vals.map(function (v, i) { return '<button type="button" class="' + (String(cur) === String(v) ? 'on' : '') + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  sysDialog('👋 WELCOME TO BLOCK CITY TYCOON', '<p class="small">Quick setup for ' + PLATFORM_NAME + ' — you can change everything later in ⚙️ Settings.</p>' +
    '<div class="flRow"><b>🌐 Language / Dil</b>' + seg('language', ['en', 'tr'], ['English', 'Türkçe'], GSET.language === 'tr' ? 'tr' : 'en') + '</div>' +
    '<div class="flRow"><b>🎨 Graphics quality</b>' + seg('perfMode', ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], null, q) + '</div>' +
    '<div class="flRow"><b>🔠 UI scale</b>' + seg('uiScale', [85, 100, 115, 130], ['85%', '100%', '115%', '130%'], GSET.uiScale || 100) + '</div>' +
    '<div class="flRow"><b>🎮 Controls</b>' + seg('controls', ['touch', 'mouse', 'gamepad'], ['👆 Touch', '🖱 Mouse + keyboard', '🎮 Gamepad'], IS_MOBILE ? 'touch' : 'mouse') + '</div>' +
    '<div class="flRow"><b>🧠 Simulation quality</b>' + seg('simQuality', ['LOW', 'MEDIUM', 'HIGH'], null, GSET.simQuality || (IS_MOBILE ? 'MEDIUM' : 'HIGH')) + '</div>',
  [['CREATE YOUR FIRST CITY →', 'gold', function () { GSET.setupDone = true; saveGSET(); applySettings2(); Log.info('First launch setup done'); if (done) done(); }]], 0);
  document.querySelectorAll('[data-fl]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      const b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      const k = g.dataset.fl, v = b.dataset.v;
      if (k === 'language') { GSET.language = v; saveGSET(); if (typeof applyShellTexts === 'function') applyShellTexts(); setLanguage(v); } else if (k === 'perfMode') GSET.perfMode = v; else if (k === 'uiScale') GSET.uiScale = +v; else if (k === 'simQuality') GSET.simQuality = v;
      else if (k === 'controls') { GSET.largeTouch = v === 'touch' && IS_MOBILE; if (S && S.settings) S.settings.gamepad = true; }
      applySettings2();
    });
  });
}
const MOBILE_TUTORIAL = [
  ['👆', 'Tap', 'Tap a building, citizen or vehicle to inspect it. Tap the map to place what you are building.'],
  ['✋', 'Drag', 'Drag with one finger to move around the city.'],
  ['🤏', 'Zoom', 'Pinch with two fingers to zoom in and out.'],
  ['🔄', 'Rotate', 'Twist two fingers to rotate the camera. ↺ in the top bar turns north up again.'],
  ['🏗️', 'Build', 'BUILD (bottom bar) → choose a building → MOVE it into place → CONFIRM. Green checks show road, power, water, zone and terrain.'],
  ['🛣️', 'Road', 'ROAD → pick Small, Medium, Large, Highway, Bridge or Tunnel → touch START, DRAG, lift to END, CONFIRM.'],
  ['🗺️', 'Map', 'MAP opens the world map; the top bar shows money, population, happiness, GDP, power and water.'],
  ['⏸️', 'Pause', '⏸ pauses, 1× changes speed. The Android back button closes windows and opens the pause menu.']
];
function startMobileTutorial(force) {
  if (!IS_MOBILE || (!force && (GSET.mobileTutDone || GSET.tutorialHints === false))) return;
  MOB.tut = { i: 0 };
  const el = document.createElement('div'); el.id = 'mTut'; document.body.appendChild(el);
  renderMobileTutorial();
}
function renderMobileTutorial() {
  const el = document.getElementById('mTut'); if (!el || !MOB.tut) return;
  const s = MOBILE_TUTORIAL[MOB.tut.i];
  el.innerHTML = '<div class="mtCard"><div class="mtIcon">' + s[0] + '</div><div class="mtTitle">' + (MOB.tut.i + 1) + '/' + MOBILE_TUTORIAL.length + ' · ' + s[1] + '</div><p>' + s[2] + '</p>' +
    '<div class="mtDots">' + MOBILE_TUTORIAL.map(function (x, i) { return '<i class="' + (i === MOB.tut.i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
    '<div class="mtBtns"><button class="btn" id="mtSkip">SKIP</button><button class="btn gold" id="mtNext">' + (MOB.tut.i === MOBILE_TUTORIAL.length - 1 ? 'START! 🚀' : 'NEXT →') + '</button></div></div>';
  el.querySelector('#mtSkip').onclick = function () { endMobileTutorial(true); };
  el.querySelector('#mtNext').onclick = function () { MOB.tut.i++; if (MOB.tut.i >= MOBILE_TUTORIAL.length) endMobileTutorial(false); else renderMobileTutorial(); };
}
function endMobileTutorial(skipped) { const el = document.getElementById('mTut'); if (el) el.remove(); MOB.tut = null; GSET.mobileTutDone = true; saveGSET(); Log.info('Mobile tutorial ' + (skipped ? 'skipped' : 'completed')); }

/* ===================================== BOOT ===================================== */
function selftestActive() { return typeof stPhase === 'function' && !!stPhase(); }
function mobileBoot() {
  applyPlatformClasses();
  mobileMenuSetup();
  buildMobileHud();
  bindTouchCamera();
  mobilePlacementHooks();
  if (IS_ANDROID_APP) applyOrientation();
  setInterval(function () { refreshMobileHud(false); }, 500);
  const sg = window.startGame;
  window.startGame = function () {
    const r = sg.apply(this, arguments);
    try { applySettings2(); refreshMobileHud(true); if (IS_MOBILE) toggleRight(true); if (!selftestActive()) setTimeout(function () { startMobileTutorial(false); }, 1500); } catch (e) { Log.warn('Mobile start: ' + e.message); }
    return r;
  };
  // FIRST LAUNCH: short platform setup, then CREATE YOUR FIRST CITY (skipped while an automatic self-test runs)
  const tryFirst = function (n) {
    if (GSET.setupDone || selftestActive()) return;
    if ((PSH && PSH.dialogOpen) || STARTED) { if (n < 40) setTimeout(function () { tryFirst(n + 1); }, 1500); return; }
    firstLaunchSetup(function () { if (!slotInfo(activeSlot()).exists) { showMenu('new'); const t = document.getElementById('newTitle'); if (t) t.textContent = '🏗️ CREATE YOUR FIRST CITY'; } });
  };
  setTimeout(function () { tryFirst(0); }, 1200);
  Log.info('Platform: ' + PLATFORM_NAME + ' · IS_ANDROID=' + IS_ANDROID + ' IS_WINDOWS=' + IS_WINDOWS + ' IS_DESKTOP=' + IS_DESKTOP + ' · mobile UI ' + (IS_MOBILE ? 'ON' : 'off'));
}
