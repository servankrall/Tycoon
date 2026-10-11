'use strict';
/* BLOCK CITY TYCOON — MOBILE UI 2.0 (Part 13) — core
   Android (and touch phones / tablets) get their OWN interface; the game engine, economy, citizens, traffic, save and
   simulation stay the same code on every platform. The desktop UI (#topbar, #leftnav, #toolbar, #rightPanel,
   #bottomInfo, #placeBar) is hidden on mobile and replaced by:
   - RESPONSIVE ENGINE: one scale unit (--u) from the screen's short side, UI SCALE and LARGE TOUCH BUTTONS; the safe area
     (notch, camera hole, rounded corners, navigation bar) from CSS env() and the Android shell (window.bctInsets);
     phone / tablet / portrait classes; the HUD and the side column compact themselves until nothing overlaps
   - MOBILE HUD: top-left city · money · population, top-centre level · date, top-right happiness · power · water · 🔔 · ☰
   - BOTTOM TOOLBAR: BUILD · ROAD · ZONE · TRANSPORT · CITY · ECONOMY · MAP
   - INPUT LAYER: UI touch > build touch > camera touch. One finger: camera (or the ghost / road being drawn), two fingers:
     pan + pinch zoom OR twist rotate (whichever starts first), taps never fire after a multi-touch gesture
   - BUILD MODE (ghost preview, BUILDABLE / CANNOT BUILD, ROTATE · CANCEL · CONFIRM), ROAD and ZONE modes
     (START → DRAG → END → CONFIRM), the Android back button, orientation and the UI bounds audit.
   Panels, inspectors, map, settings, pause, notifications and the tutorial: mobile-panels.js. */

const MOB = {
  hud: null, bar: null, side: null, buildBar: null, roadSheet: null, road: { step: 0, kind: 'small' }, draw: 'road', zoneType: 1,
  ghostMove: false, rot: null, lastHud: 0, tut: null, placeLock: 0, fitLevel: 0
};
const RESP = { w: 0, h: 0, short: 0, tablet: false, portrait: false, scale: 1, sa: { t: 0, r: 0, b: 0, l: 0 }, native: null };
const CAM_SENS = { LOW: 0.6, MEDIUM: 1, HIGH: 1.55 };
function camSens() { return (CAM_SENS[GSET.camSens] || 1) * ((GSET.cameraSpeed || 100) / 100); }
function mobOn() { return IS_MOBILE && document.body.classList.contains('mobileUI'); }

/* ===================================== CAMERA ROTATION (shared by touch + gamepad) ===================================== */
function camRot() { return PHOTO.on ? (PHOTO.rot || 0) : (CAM.rot || 0); }
function setCamRot(r) { CAM.rot = Math.atan2(Math.sin(r), Math.cos(r)); if (Math.abs(CAM.rot) < 0.03) CAM.rot = 0; updateRotBtn(); }
function updateRotBtn() { const b = document.getElementById('mRotReset'); if (b) b.classList.toggle('hidden', !CAM.rot); }

/* ===================================== RESPONSIVE ENGINE & SAFE AREA ===================================== */
function safeAreaEnv() {
  let p = document.getElementById('mSafeProbe');
  if (!p) {
    p = document.createElement('div'); p.id = 'mSafeProbe';
    p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(p);
  }
  const cs = getComputedStyle(p);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
/* Android shell → display cutout, rounded corners and system bars (CSS px), see MainActivity.pushInsets() */
window.bctInsets = function (t, r, b, l) { RESP.native = { t: +t || 0, r: +r || 0, b: +b || 0, l: +l || 0 }; layoutMobile(); return 'ok'; };
function readNativeInsets() { if (!IS_ANDROID_APP || RESP.native) return; try { if (typeof BCTA.insets === 'function') { const o = JSON.parse(BCTA.insets()); if (o) RESP.native = { t: +o.t || 0, r: +o.r || 0, b: +o.b || 0, l: +o.l || 0 }; } } catch (e) { /* older shell */ } }
function applyPlatformClasses() {
  const b = document.body;
  b.classList.toggle('platform-android', IS_ANDROID);
  b.classList.toggle('platform-windows', IS_WINDOWS);
  b.classList.toggle('platform-desktop', IS_DESKTOP);
  b.classList.toggle('mobileUI', IS_MOBILE);
  b.classList.toggle('largeTouch', !!GSET.largeTouch);
  b.dataset.textsize = GSET.textSize || 'M';
  document.documentElement.style.setProperty('--ui-scale', IS_MOBILE ? '1' : String((GSET.uiScale || 100) / 100));    // desktop: zoom; mobile: --u
  layoutMobile();
}
/* Recomputes the scale unit, safe area and layout classes; called on resize, rotation, inset changes and setting changes */
function layoutMobile() {
  if (!IS_MOBILE || !document.body) return;
  const w = window.innerWidth, h = window.innerHeight, sh = Math.min(w, h), b = document.body;
  RESP.w = w; RESP.h = h; RESP.short = sh; RESP.portrait = h > w * 1.05;
  RESP.tablet = sh >= 600 && Math.max(w, h) >= 900;
  readNativeInsets();
  const env = safeAreaEnv(), nat = RESP.native || { t: 0, r: 0, b: 0, l: 0 };
  RESP.sa = { t: Math.max(env.t, nat.t), r: Math.max(env.r, nat.r), b: Math.max(env.b, nat.b), l: Math.max(env.l, nat.l) };
  const base = RESP.tablet ? clamp(sh / 640, 1.02, 1.3) : clamp(sh / 392, 0.86, 1.12);
  RESP.scale = Math.round(base * (GSET.uiScale || 100) / 100 * 1000) / 1000;
  const r = document.documentElement.style;
  r.setProperty('--u', RESP.scale + 'px');
  r.setProperty('--tk', String({ S: 0.92, M: 1, L: 1.1, XL: 1.22 }[GSET.textSize] || 1));
  r.setProperty('--sa-t', RESP.sa.t + 'px'); r.setProperty('--sa-r', RESP.sa.r + 'px'); r.setProperty('--sa-b', RESP.sa.b + 'px'); r.setProperty('--sa-l', RESP.sa.l + 'px');
  r.setProperty('--vh', h + 'px'); r.setProperty('--vw', w + 'px');
  b.classList.toggle('portrait', RESP.portrait);
  b.classList.toggle('tablet', RESP.tablet);
  b.classList.toggle('phone', !RESP.tablet);
  b.classList.toggle('shortScreen', h < 380);
  updateRotateOverlay();
  MOB.fitLevel = 0;
  requestAnimationFrame(function () { fitMobileLayout(); });
}
/* visible? (offsetParent is always null for position:fixed elements, so it can't be used here) */
function shown(el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'; }
/* HUD fit: compaction levels until every group fits inside its own slot (no overlap, nothing cut) */
function hudOverflows() {
  if (!MOB.hud || !shown(MOB.hud)) return false;
  const g = MOB.hud.querySelectorAll('.mGrp');
  for (let i = 0; i < g.length; i++) {                  // content width (children + gaps) vs. the group's slot
    const k = g[i].children; let w = 0; for (let j = 0; j < k.length; j++) if (getComputedStyle(k[j]).display !== 'none') w += k[j].offsetWidth + 4;
    if (w - 4 > g[i].clientWidth + 1 || g[i].scrollWidth > g[i].clientWidth + 1) return true;
  }
  if (g.length === 3) { const a = g[0].getBoundingClientRect(), c = g[1].getBoundingClientRect(), d = g[2].getBoundingClientRect(); const same = function (p, q) { return Math.abs(p.top - q.top) < 2; }; if ((same(a, c) && a.right > c.left + 1) || (same(c, d) && c.right > d.left + 1) || (same(a, d) && a.right > d.left + 1)) return true; }
  return false;
}
function fitMobileLayout() {
  if (!MOB.hud) return;
  const rows = function (n) { MOB.hud.classList.toggle('rows2', n === 2); document.documentElement.style.setProperty('--hud-rows', String(n)); };
  const set = function (lv) { MOB.fitLevel = lv; for (let i = 1; i <= 5; i++) MOB.hud.classList.toggle('fit' + i, lv >= i); };
  rows(RESP.portrait ? 2 : 1); set(0);
  for (let lv = 1; lv <= 5 && hudOverflows(); lv++) set(lv);
  if (hudOverflows() && !RESP.portrait) { rows(2); set(0); for (let lv = 1; lv <= 5 && hudOverflows(); lv++) set(lv); }   // last resort: a second HUD row
  if (MOB.side) {                                         // side column: two columns when it would reach the toolbar
    MOB.side.classList.remove('two');
    const r = MOB.side.getBoundingClientRect(), bar = MOB.bar ? MOB.bar.getBoundingClientRect().top : window.innerHeight;
    if (r.height && r.bottom > bar - 4) MOB.side.classList.add('two');
  }
  if (typeof mobileUiAudit === 'function') mobileUiAudit(true);
}
window.addEventListener('resize', function () { if (IS_MOBILE) { layoutMobile(); if (typeof resizeCanvas === 'function') { resizeCanvas(); if (STARTED) clampCamera(); } } });
window.addEventListener('orientationchange', function () { setTimeout(layoutMobile, 250); });

/* ===================================== ORIENTATION ===================================== */
function applyOrientation() { Platform.setOrientation(GSET.orientation || 'landscape'); setTimeout(function () { if (typeof resizeCanvas === 'function') { resizeCanvas(); clampCamera(); } applyPlatformClasses(); }, 400); }
/* Phones are landscape-first: a portrait phone in the middle of a game shows PLEASE ROTATE YOUR DEVICE (unless the player
   chose portrait in Settings → Graphics, then the portrait layout is used) */
function updateRotateOverlay() {
  let el = document.getElementById('mRotateMsg');
  const show = IS_MOBILE && STARTED && RESP.portrait && !RESP.tablet && GSET.orientation !== 'portrait' && !selftestActive();
  if (!show) { if (el) el.classList.add('hidden'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'mRotateMsg'; el.innerHTML = '<div class="mrIcon">📱↻</div><b>PLEASE ROTATE YOUR DEVICE</b><p>Block City Tycoon is played in landscape.</p><button class="btn small" id="mRotPortrait">Use portrait layout</button>'; document.body.appendChild(el); el.querySelector('#mRotPortrait').onclick = function () { GSET.orientation = 'portrait'; saveGSET(); applyOrientation(); updateRotateOverlay(); }; }
  el.classList.remove('hidden');
}

/* ===================================== MOBILE HUD ===================================== */
function buildMobileHud() {
  if (!IS_MOBILE || MOB.hud) return;
  const top = document.createElement('div'); top.id = 'mHud';
  top.innerHTML =
    '<div class="mGrp mL">' +
    '<button class="mPill mCity" data-mh="cityhall" aria-label="City"><i>🏙</i><b id="mCity" class="noTr">Block City</b></button>' +
    '<button class="mPill" data-mh="economy" data-mstat="money" aria-label="Money"><i>💰</i><b id="mMoney">$0</b></button>' +
    '<button class="mPill" data-mh="city" data-mstat="pop" aria-label="Population"><i>👥</i><b id="mPop">0</b></button></div>' +
    '<div class="mGrp mC">' +
    '<button class="mPill" data-mh="city" aria-label="City level"><i>🏆</i><b id="mLvl">1</b><small id="mLvlN"></small></button>' +
    '<button class="mPill mDate" data-mh="pause" aria-label="Date"><i>📅</i><b id="mDate">Day 1</b></button></div>' +
    '<div class="mGrp mR">' +
    '<button class="mPill" data-mh="city" data-mstat="hap" aria-label="Happiness"><i id="mHapI">😊</i><b id="mHap">0%</b></button>' +
    '<button class="mPill mUtil" data-mh="power" data-mstat="power" aria-label="Power"><i>⚡</i><b id="mPow">0%</b></button>' +
    '<button class="mPill mUtil" data-mh="water" data-mstat="water" aria-label="Water"><i>💧</i><b id="mWat">0%</b></button>' +
    '<button class="mPill mIco" id="mBell" aria-label="Notifications">🔔<em id="mBellN" class="hidden">0</em></button>' +
    '<button class="mPill mIco" id="mMenu" aria-label="Pause menu">☰</button></div>';
  document.body.appendChild(top); MOB.hud = top;
  const side = document.createElement('div'); side.id = 'mSide';
  side.innerHTML = '<button class="mFab" id="mPause" aria-label="Pause">⏸</button><button class="mFab" id="mSpeed" aria-label="Speed">1×</button>' +
    '<button class="mFab" id="mCamReset" aria-label="Reset camera">🎯</button><button class="mFab" id="mMiniBtn" aria-label="Minimap">🧭</button>' +
    '<button class="mFab hidden" id="mRotReset" aria-label="North up">↺</button>';
  document.body.appendChild(side); MOB.side = side;
  const bar = document.createElement('nav'); bar.id = 'mBar';
  bar.innerHTML = [['build', '🏗️', 'BUILD'], ['road', '🛣️', 'ROAD'], ['zone', '🟩', 'ZONE'], ['transport', '🚇', 'TRANSPORT'], ['city', '🏙️', 'CITY'], ['economy', '💰', 'ECONOMY'], ['map', '🗺️', 'MAP']]
    .map(function (x) { return '<button class="mBtn" data-mbar="' + x[0] + '"><span>' + x[1] + '</span><b>' + x[2] + '</b></button>'; }).join('');
  document.body.appendChild(bar); MOB.bar = bar;
  top.addEventListener('click', function (e) {
    if (!STARTED) return;
    const p = e.target.closest('[data-mh]'), id = e.target.closest('button') ? e.target.closest('button').id : '';
    sfx('click');
    if (id === 'mMenu') { openPauseMenu(); return; }
    if (id === 'mBell') { openNotificationCenter(); return; }
    if (!p) return;
    const k = p.dataset.mh;
    if (k === 'economy') openMobilePage('economy');
    else if (k === 'city') openMobilePage('city');
    else if (k === 'cityhall') openCityHall();
    else if (k === 'power' || k === 'water') openCityMap(k === 'power' ? 'power' : 'water');
    else if (k === 'pause') openPauseMenu();
  });
  side.querySelector('#mPause').onclick = function () { if (!STARTED) return; setSpeed(S.settings.speed === 0 ? (UI.lastSpeed || 1) : (UI.lastSpeed = S.settings.speed, 0)); refreshMobileHud(true); sfx('click'); };
  side.querySelector('#mSpeed').onclick = function () { if (!STARTED) return; const L = [1, 2, 5, 10, 25, 50, 100], i = L.indexOf(S.settings.speed); setSpeed(L[(i + 1) % L.length]); refreshMobileHud(true); sfx('click'); };
  side.querySelector('#mCamReset').onclick = function () { if (STARTED) { resetCamera(); sfx('click'); } };
  side.querySelector('#mMiniBtn').onclick = function () { if (!STARTED) return; S.settings.minimap = !S.settings.minimap; $('minimap').classList.toggle('hidden', !S.settings.minimap); syncGSETFromGame(); drawMinimap(true); refreshMobileHud(true); sfx('click'); };
  side.querySelector('#mRotReset').onclick = function () { setCamRot(0); sfx('click'); };
  bar.addEventListener('click', function (e) {
    const b = e.target.closest('[data-mbar]'); if (!b || !STARTED) return;
    sfx('click');
    mobileToolbar(b.dataset.mbar);
  });
}
function mobileToolbar(k) {
  const was = activeBarKey();
  closeMobileOverlays(k === 'build' || k === 'transport' ? 'sheet' : null);
  if (k === 'build') { if (was === 'build') closeSheet(); else openBuildSheet(); }
  else if (k === 'road') { if (was === 'road') exitDrawMode(); else enterDrawMode('road'); }
  else if (k === 'zone') { if (was === 'zone') exitDrawMode(); else enterDrawMode('zone'); }
  else if (k === 'transport') { if (was === 'transport') closeSheet(); else openTransportSheet(); }
  else if (k === 'city') openMobilePage('city');
  else if (k === 'economy') openMobilePage('economy');
  else if (k === 'map') openCityMap();
  refreshMobileBar();
}
function activeBarKey() {
  if (MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) return MOB.draw;
  if (typeof MSHEET !== 'undefined' && MSHEET.open) return MSHEET.kind;
  if (UI.tool === 'build' && UI.placing) return 'build';
  return '';
}
function refreshMobileBar() {
  if (!MOB.bar) return;
  const a = activeBarKey();
  MOB.bar.querySelectorAll('[data-mbar]').forEach(function (b) { b.classList.toggle('on', b.dataset.mbar === a); });
}
/* Closes sheets / inspector / modes before another toolbar action (keep = what stays) */
function closeMobileOverlays(keep) {
  if (keep !== 'sheet' && typeof closeSheet === 'function') closeSheet();
  if (typeof closeInspector === 'function') closeInspector();
  if (MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { closeBuildBar(); setTool('select'); }
  if (MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) exitDrawMode();
  if (UI.panel) closeLeft();
}
function hudGdp() { const g = S.p10 && S.p10.graphs && S.p10.graphs.gdp; return g && g.length ? g[g.length - 1] : Math.max(0, (SIM.pInc || 0) + (SIM.bInc || 0)) * YEAR_GAME_SEC / TIME_SCALE; }
function utilPct(use, gen) { return gen > 0 ? Math.round(use / gen * 100) : (use > 0 ? 999 : 0); }
function refreshMobileHud(force) {
  if (!MOB.hud || !STARTED || !S) return;
  const t = performance.now(); if (!force && t - MOB.lastHud < 400) return; MOB.lastHud = t;
  const set = function (id, v) { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; };
  set('mCity', S.city.name); set('mMoney', money(S.money)); set('mPop', fmt(Math.floor(S.city.population)));
  set('mHap', Math.round(S.city.happiness) + '%'); set('mHapI', S.city.happiness >= 70 ? '😊' : S.city.happiness >= 45 ? '😐' : '😠');
  set('mLvl', 'LV ' + cityLevel()); set('mLvlN', cityLevelName());
  const se = currentSeason();
  set('mDate', 'D' + gameDay() + ' ' + se.icon + ' ' + pad2(Math.floor(gameHour())) + ':' + pad2(Math.floor((S.clock.gameSec / 60) % 60)));
  const pg = SIM.powerGen || 0, pu = SIM.powerUse || 0, wg = SIM.waterGen || 0, wu = SIM.waterUse || 0, pp = utilPct(pu, pg), wp = utilPct(wu, wg);
  set('mPow', pp > 998 ? '!' : pp + '%'); set('mWat', wp > 998 ? '!' : wp + '%');
  const pw = MOB.hud.querySelector('[data-mstat="power"]'), wa = MOB.hud.querySelector('[data-mstat="water"]');
  if (pw) { pw.classList.toggle('bad', pu > pg); pw.classList.toggle('warn', pu <= pg && pp >= 85); }
  if (wa) { wa.classList.toggle('bad', wu > wg); wa.classList.toggle('warn', wu <= wg && wp >= 85); }
  const mo = MOB.hud.querySelector('[data-mstat="money"]'); if (mo) mo.classList.toggle('bad', S.money < 0);
  set('mSpeed', (safeSpeedCap() < S.settings.speed ? safeSpeedCap() + '×*' : (S.settings.speed || 1) + '×'));
  set('mPause', S.settings.speed === 0 ? '▶' : '⏸');
  const pz = document.getElementById('mPause'); if (pz) pz.classList.toggle('on', S.settings.speed === 0);
  const mm = document.getElementById('mMiniBtn'); if (mm) mm.classList.toggle('on', !!S.settings.minimap);
  if (typeof refreshBell === 'function') refreshBell();
  refreshMobileBar();
  if (force || MOB.fitLevel < 5 && hudOverflows() || t - (MOB.lastFit || 0) > 5000) { MOB.lastFit = t; fitMobileLayout(); }
}
/* 🎯 camera reset: city centre (town hall or the centre of all buildings), north up, a zoom that fits the screen */
function cityCentre() {
  const th = S.buildings.list.find(function (b) { return b.type === 'townhall'; });
  if (th) { const c = buildingCenter(th); return { x: c.x, y: c.y }; }
  const L = S.buildings.list; if (!L.length) return { x: MAP.W * TILE / 2, y: MAP.H * TILE / 2 };
  let x = 0, y = 0; L.forEach(function (b) { x += b.x; y += b.y; }); return { x: (x / L.length + 0.5) * TILE, y: (y / L.length + 0.5) * TILE };
}
function defaultZoom() { return clamp(Math.min(window.innerWidth, window.innerHeight) / 360, 0.8, 1.4); }
function resetCamera() {
  const c = cityCentre();
  CAM.tx = null; CAM.ty = null; CAM.x = c.x; CAM.y = c.y; CAM.zoom = defaultZoom(); setCamRot(0); clampCamera();
  if (PHOTO.on) PHOTO.rot = 0;
}

/* ===================================== INPUT LAYER: UI touch > build touch > camera touch ===================================== */
/* All touch pointers on the game canvas go through this recognizer (mouse / pen-as-mouse keep the desktop handlers). UI
   elements sit above the canvas, so a touch on a button never reaches it; the canvas handlers only see touches on the
   world. States: idle → pending → pan | ghost | draw; any second finger → multi (pinch zoom or twist rotate + pan),
   and the gesture stays "multi" until every finger is lifted, so no tap, placement or road fires by accident. */
const GST = { pts: new Map(), mode: 'idle', st: null, multi: null, hadMulti: false, grab: null, draw0: null };
function gstReset() { GST.pts.clear(); GST.mode = 'idle'; GST.st = null; GST.multi = null; GST.hadMulti = false; GST.grab = null; MOB.rot = null; }
function gstIntercept(e) {
  if (!mobOn() || e.pointerType === 'mouse') return false;
  if (typeof WB !== 'undefined' && (WB.on || (typeof RS !== 'undefined' && RS.on))) return false;   // admin world brush / region selector
  return true;
}
/* the player's finger always wins: camera fly-to and the landmark cinematic stop moving the camera (the celebration still plays) */
function stopCameraMotion() { FX.fly = null; if (FX.cine && FX.cine.t < 1.4) FX.cine.t = 1.4; CAM.tx = null; CAM.ty = null; }
function gstMultiStart() {
  const p = Array.from(GST.pts.values()); if (p.length < 2) return;
  const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  GST.multi = { a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), rot0: CAM.rot || 0, mid0: mid, world: screenToWorld(mid.x, mid.y), d: Math.max(10, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), zoom: CAM.zoom, lock: null };
  MOB.rot = GST.multi;
}
function gstMultiMove() {
  const g = GST.multi, p = Array.from(GST.pts.values()); if (!g || p.length < 2) return;
  const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d = Math.max(10, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y));
  let da = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) - g.a; da = Math.atan2(Math.sin(da), Math.cos(da));
  const ls = Math.log(d / g.d);
  if (!g.lock) { if (Math.abs(ls) > 0.12) g.lock = 'zoom'; else if (Math.abs(da) > 0.22 && GSET.rotateCam !== false && !PHOTO.on) g.lock = 'rotate'; }
  const sens = camSens();
  if (g.lock === 'zoom') CAM.zoom = clamp(g.zoom * Math.exp(ls * Math.min(1.4, Math.max(0.6, sens))), 0.3, 2.6);
  if (g.lock === 'rotate') setCamRot(g.rot0 + da);
  const target = { x: g.mid0.x + (mid.x - g.mid0.x) * sens, y: g.mid0.y + (mid.y - g.mid0.y) * sens };   // two-finger pan
  const now = screenToWorld(target.x, target.y);
  CAM.x += g.world.x - now.x; CAM.y += g.world.y - now.y; clampCamera();
}
function ghostRectHit(t) {
  if (!(UI.tool === 'build' && UI.placing && UI.ghost)) return false;
  const d = fpDef(UI.placing, UI.rot | 0), g = UI.ghost;
  return t.x >= g.x - 1 && t.x <= g.x + d.w && t.y >= g.y - 1 && t.y <= g.y + d.h;
}
function drawModeOn() { return !!(MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) && (UI.tool === 'road' || UI.tool === 'zone'); }
function gstDown(e) {
  if (!gstIntercept(e)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  UI.lastPointer = 'touch'; UI.idleTimer = 0;
  stopCameraMotion();
  GST.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (GST.pts.size >= 2) {
    if (GST.mode === 'draw') { cancelDrawStroke(); }
    else if (GST.mode === 'ghost' && GST.grab) { UI.ghost = GST.grab.orig; UI.hover = { x: UI.ghost.x, y: UI.ghost.y }; renderBuildBar(); }
    else if (GST.mode === 'pan' && GST.st) { CAM.x = GST.st.camX; CAM.y = GST.st.camY; }
    GST.mode = 'multi'; GST.hadMulti = true; gstMultiStart(); return;
  }
  if (GST.mode === 'ignore') return;
  GST.hadMulti = false;
  GST.st = { x: e.clientX, y: e.clientY, t: performance.now(), camX: CAM.x, camY: CAM.y, id: e.pointerId };
  const t = tileAtScreen(e.clientX, e.clientY);
  if (ghostRectHit(t)) { GST.mode = 'ghost'; GST.grab = { dx: t.x - UI.ghost.x, dy: t.y - UI.ghost.y, orig: { x: UI.ghost.x, y: UI.ghost.y } }; return; }
  if (drawModeOn() && inMap(t.x, t.y)) {                 // ROAD / ZONE: START
    GST.mode = 'draw';
    const dr = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, touch: true };
    if (UI.tool === 'road') UI.roadDrag = dr; else UI.zoneDrag = dr;
    UI.hover = { x: t.x, y: t.y }; UI.pendingAction = null;
    MOB.road.step = 1; updateRoadSheet(); return;
  }
  GST.mode = 'pending';
}
function gstMove(e) {
  if (!gstIntercept(e) || !GST.pts.has(e.pointerId)) return;
  e.stopImmediatePropagation();
  GST.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (FX.fly || FX.cine) stopCameraMotion();                // also when a cinematic starts mid-gesture
  if (GST.mode === 'multi') { gstMultiMove(); return; }
  const st = GST.st; if (!st || e.pointerId !== st.id) return;
  const dx = e.clientX - st.x, dy = e.clientY - st.y, far = Math.hypot(dx, dy) > 10;
  if (GST.mode === 'pending' && far) GST.mode = 'pan';
  if (GST.mode === 'pan') {
    const s = camSens();
    let px = dx * s, py = dy * s;
    const pr = PHOTO.on ? PHOTO.rot : CAM.rot;
    if (pr) { const c = Math.cos(-pr), sn = Math.sin(-pr); const x = px * c - py * sn; py = px * sn + py * c; px = x; }
    if (GSET.invertPan) { px = -px; py = -py; }
    CAM.tx = null; CAM.ty = null;
    CAM.x = st.camX - px / CAM.zoom; CAM.y = st.camY - py / CAM.zoom; clampCamera();
    UI.hover = UI.ghost ? { x: UI.ghost.x, y: UI.ghost.y } : null;
  } else if (GST.mode === 'ghost' && far) {
    const t = tileAtScreen(e.clientX, e.clientY), g = { x: t.x - GST.grab.dx, y: t.y - GST.grab.dy };
    if (!UI.ghost || g.x !== UI.ghost.x || g.y !== UI.ghost.y) { UI.ghost = g; UI.hover = { x: g.x, y: g.y }; renderBuildBar(); }
  } else if (GST.mode === 'draw') {
    const t = tileAtScreen(e.clientX, e.clientY), dr = UI.tool === 'road' ? UI.roadDrag : UI.zoneDrag;
    if (dr && (dr.x1 !== t.x || dr.y1 !== t.y)) { dr.x1 = clamp(t.x, 0, MAP.W - 1); dr.y1 = clamp(t.y, 0, MAP.H - 1); UI.hover = { x: dr.x1, y: dr.y1 }; if (MOB.road.step !== 2) { MOB.road.step = 2; updateRoadSheet(); } }
  }
}
function gstUp(e) {
  if (!gstIntercept(e)) return;
  e.stopImmediatePropagation();
  if (!GST.pts.has(e.pointerId)) return;
  GST.pts.delete(e.pointerId);
  if (GST.mode === 'multi') {
    if (GST.pts.size >= 2) gstMultiStart();
    else if (GST.pts.size === 1) { GST.mode = 'ignore'; GST.multi = null; MOB.rot = null; }
    else gstReset();
    return;
  }
  if (GST.mode === 'ignore') { if (!GST.pts.size) gstReset(); return; }
  const st = GST.st, mode = GST.mode;
  if (GST.pts.size) return;
  if (mode === 'draw') { finishDrawStroke(); gstReset(); return; }
  if (mode === 'pending' && st && !GST.hadMulti && performance.now() - st.t < 650) mobileTap(e.clientX, e.clientY);
  gstReset();
}
function gstCancel(e) { if (!gstIntercept(e)) return; e.stopImmediatePropagation(); if (GST.mode === 'draw') cancelDrawStroke(); else if (GST.mode === 'ghost' && GST.grab) { UI.ghost = GST.grab.orig; renderBuildBar(); } gstReset(); }
function bindTouchCamera() {
  canvas.addEventListener('pointerdown', gstDown, true);
  canvas.addEventListener('pointermove', gstMove, true);
  canvas.addEventListener('pointerup', gstUp, true);
  canvas.addEventListener('pointercancel', gstCancel, true);
  canvas.addEventListener('lostpointercapture', function (e) { if (gstIntercept(e) && GST.pts.has(e.pointerId) && e.isTrusted) gstCancel(e); }, true);
  /* UI touch priority: a touch that starts on any UI layer never reaches the world, and the page itself never scrolls / zooms */
  document.addEventListener('touchmove', function (e) { if (!mobOn()) return; if (!e.target.closest || !e.target.closest('.mScroll,#modalBody,#lpBody,#rpBody,#sysText,.mSheetBody,.mPageBody,#admBody,#admNavList,#slotList,.menuBox,#titleScreen,#mNotesList,#mInspectBody,.mChips,.mGraphWrap')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
}
/* A clean single tap on the world */
function mobileTap(sx, sy) {
  const t = tileAtScreen(sx, sy);
  UI.hover = { x: t.x, y: t.y };
  if (UI.tool === 'build' && UI.placing) { moveGhostTo(sx, sy); return; }        // tap moves the ghost — CONFIRM builds
  if (drawModeOn()) return;
  if (UI.tool === 'select' && !(typeof ADM !== 'undefined' && ADM.pick)) {
    const b = pickBuilding(t.wx, t.wy), ag = b ? null : pickAgent(t.wx, t.wy);
    if (!b && !ag && inMap(t.x, t.y) && MAP.roads[idx(t.x, t.y)]) { selectBuilding(null); if (typeof showRoadInspector === 'function') showRoadInspector(t.x, t.y); sfx('click'); return; }
    if (!b && !ag && typeof closeInspector === 'function') closeInspector();
  }
  handleTap(sx, sy);
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
  return '<div class="mChecks">' + r.list.map(function (c) { return '<span class="mChk ' + c[2] + '" title="' + c[1] + '">' + c[0] + '<em>' + c[1] + '</em>' + ({ ok: '✓', warn: '!', bad: '✗', na: '–' })[c[2]] + '</span>'; }).join('') + '</div>';
}
function ghostTile(sx, sy) { const d = fpDef(UI.placing, UI.rot | 0), t = tileAtScreen(sx, sy); return { x: t.x - Math.floor((d.w - 1) / 2), y: t.y - Math.floor((d.h - 1) / 2) }; }
/* The ghost starts on the nearest buildable spot around the screen centre (spiral search), else at the centre */
function nearestFreeSpot(g) {
  const d = fpDef(UI.placing, UI.rot | 0);
  if (canPlace(d, g.x, g.y).ok) return g;
  for (let r = 1; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (canPlace(d, g.x + dx, g.y + dy).ok) return { x: g.x + dx, y: g.y + dy };
  }
  return g;
}
function moveGhostTo(sx, sy) { if (!UI.placing) return; const g = ghostTile(sx, sy); UI.ghost = g; UI.hover = { x: g.x, y: g.y }; renderBuildBar(); }
/* World centre of the visible area (between the HUD and the toolbar) */
function viewCentre() { const top = MOB.hud ? MOB.hud.getBoundingClientRect().bottom : 0, bot = MOB.bar && shown(MOB.bar) ? MOB.bar.getBoundingClientRect().top : CH; return { x: CW / 2, y: (top + bot) / 2 }; }
function openBuildBar() {
  if (!MOB.buildBar) {
    const el = document.createElement('div'); el.id = 'mBuildBar'; el.className = 'hidden';
    el.innerHTML = '<div class="mbInfo" id="mbInfo"></div><div class="mbBtns">' +
      '<button class="btn blue" data-mb="rotate">↻ ROTATE</button><button class="btn red" data-mb="cancel">✕ CANCEL</button>' +
      '<button class="btn green" data-mb="confirm">✓ CONFIRM</button></div>';
    document.body.appendChild(el); MOB.buildBar = el;
    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-mb]'); if (!b) return; sfx('click');
      const k = b.dataset.mb;
      if (k === 'rotate') { rotatePlacement(); $('placeBar').classList.add('hidden'); renderBuildBar(); }
      else if (k === 'confirm') mobileConfirmPlace();
      else if (k === 'cancel') { closeBuildBar(); setTool('select'); }
      else if (k === 'catalog') { closeBuildBar(); setTool('select'); openBuildSheet(); }
    });
  }
  if (typeof closeSheet === 'function') closeSheet();
  if (typeof closeInspector === 'function') closeInspector();
  MOB.buildBar.classList.remove('hidden'); document.body.classList.add('mBuilding');
  renderBuildBar();
}
function closeBuildBar() { MOB.ghostMove = false; if (MOB.buildBar) MOB.buildBar.classList.add('hidden'); document.body.classList.remove('mBuilding'); refreshMobileBar(); }
function renderBuildBar() {
  if (!MOB.buildBar || !UI.placing) return;
  if (!UI.ghost) {
    const c = viewCentre(), g = nearestFreeSpot(ghostTile(c.x, c.y)); UI.ghost = g; UI.hover = { x: g.x, y: g.y };
    const d0 = fpDef(UI.placing, UI.rot | 0), wx = (g.x + d0.w / 2) * TILE, wy = (g.y + d0.h / 2) * TILE, p = worldToScreen(wx, wy);   // keep the ghost in view
    const top = MOB.hud ? MOB.hud.getBoundingClientRect().bottom + 30 : 60, bot = CH - 120;
    if (p.x < 60 || p.x > CW - 60 || p.y < top || p.y > bot) { const w0 = screenToWorld(c.x, c.y); CAM.x += wx - w0.x; CAM.y += wy - w0.y; clampCamera(); }
  }
  const d = fpDef(UI.placing, UI.rot | 0), chk = canPlace(d, UI.ghost.x, UI.ghost.y);
  $('mbInfo').innerHTML = '<div class="mbTop"><b class="mbName">' + d.icon + ' ' + esc(d.name) + '</b><span class="mbCost">' + money(buildCost(d)) + ' · ' + d.w + '×' + d.h + ' · ↻' + ((UI.rot | 0) * 90) + '°</span></div>' +
    '<div class="mbState ' + (chk.ok ? 'ok' : 'bad') + '">' + (chk.ok ? '✓ BUILDABLE' + (chk.warn ? ' · ' + esc(chk.warn) : '') : '✗ CANNOT BUILD — ' + esc(chk.reason)) + '</div>' + checksHtml(d, UI.ghost.x, UI.ghost.y);
  const cf = MOB.buildBar.querySelector('[data-mb="confirm"]'); if (cf) cf.disabled = !chk.ok || performance.now() < MOB.placeLock;
}
/* CONFIRM: one building per press — the button locks briefly and the ghost then moves to the next free spot */
function mobileConfirmPlace() {
  if (!UI.placing || !UI.ghost) return;
  const now = performance.now(); if (now < MOB.placeLock) return;
  const d0 = UI.placing, rot = UI.rot | 0, d = fpDef(d0, rot), g = UI.ghost, chk = canPlace(d, g.x, g.y);
  if (!chk.ok) { toast('❌ ' + chk.reason, 'bad'); sfx('error'); return; }
  MOB.placeLock = now + 450;
  const b = placeBuilding(d0, g.x, g.y, rot);
  $('placeBar').classList.add('hidden'); UI.pendingAction = null;
  if (b) {
    if (typeof mobileAutosaveSoon === 'function' && buildCost(d) >= 20000) mobileAutosaveSoon('big building');
    const cand = [[d.w, 0], [0, d.h], [-d.w, 0], [0, -d.h]].map(function (o) { return { x: g.x + o[0], y: g.y + o[1] }; }).find(function (p) { return canPlace(d, p.x, p.y).ok; });
    if (cand) { UI.ghost = cand; UI.hover = { x: cand.x, y: cand.y }; }
  }
  renderBuildBar();
  setTimeout(renderBuildBar, 470);
}
function mobilePlacementHooks() {
  const sp = window.startPlacing;
  window.startPlacing = function (d) { const r = sp.apply(this, arguments); if (IS_MOBILE && UI.placing) { UI.ghost = null; openBuildBar(); } return r; };
  const ap = window.attemptPlace;
  window.attemptPlace = function (x, y) { if (IS_MOBILE && UI.placing && MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { UI.ghost = { x: x, y: y }; UI.hover = { x: x, y: y }; renderBuildBar(); return; } return ap.apply(this, arguments); };
  const st = window.setTool;
  window.setTool = function (t) {
    const r = st.apply(this, arguments);
    if (IS_MOBILE) { if (t !== 'build') closeBuildBar(); if (t !== 'road' && t !== 'zone') closeRoadBuilder(); $('roadPop').classList.add('hidden'); $('zonePicker').classList.add('hidden'); document.body.classList.toggle('mBulldoze', t === 'bulldoze'); }
    refreshMobileBar(); return r;
  };
}

/* ===================================== ROAD & ZONE MODE: START → DRAG → END → CONFIRM ===================================== */
const MOB_ROADS = [['small', 'Small', 1], ['medium', 'Medium', 2], ['large', 'Large', 3], ['highway', 'Highway', 4], ['bridge', 'Bridge', 3], ['tunnel', 'Tunnel', 2]];
function enterDrawMode(kind) {
  if (!IS_MOBILE) return;
  closeMobileOverlays();
  MOB.draw = kind;
  setTool(kind);
  if (kind === 'zone' && (UI.zoneType === undefined || UI.zoneType === null)) UI.zoneType = 1;
  if (kind === 'road') { const r = MOB_ROADS.find(function (x) { return x[0] === MOB.road.kind; }) || MOB_ROADS[0]; UI.roadType = r[2]; }
  openRoadBuilder();
}
function exitDrawMode() { UI.roadDrag = null; UI.zoneDrag = null; UI.pendingAction = null; setTool('select'); closeRoadBuilder(); }
function openRoadBuilder() {
  if (!IS_MOBILE) return;
  if (!MOB.roadSheet) {
    const el = document.createElement('div'); el.id = 'mRoad'; el.className = 'hidden';
    document.body.appendChild(el); MOB.roadSheet = el;
    el.addEventListener('click', function (e) {
      const t = e.target.closest('[data-mroad]'), z = e.target.closest('[data-mzone]'), a = e.target.closest('[data-mra]');
      if (t) {
        const r = MOB_ROADS.find(function (x) { return x[0] === t.dataset.mroad; }), def = ROAD_TYPES[r[2]];
        if (def.unlock && S.city.peakPop < def.unlock.pop && !S.city.sandbox) { toast('🔒 ' + def.name + ' unlocks at ' + fmt(def.unlock.pop) + ' population', 'bad'); sfx('error'); return; }
        MOB.road.kind = r[0]; UI.roadType = r[2]; sfx('click'); if (UI.roadDrag && MOB.road.step >= 3) roadPreviewConfirm(); updateRoadSheet(); return;
      }
      if (z) { UI.zoneType = +z.dataset.mzone; sfx('click'); if (UI.zoneDrag && MOB.road.step >= 3) zonePreviewConfirm(); updateRoadSheet(); return; }
      if (!a) return;
      sfx('click');
      if (a.dataset.mra === 'confirm') confirmDrawStroke();
      else if (a.dataset.mra === 'cancel') { cancelDrawStroke(); }
      else if (a.dataset.mra === 'close') exitDrawMode();
    });
  }
  $('roadPop').classList.add('hidden'); $('zonePicker').classList.add('hidden');
  MOB.road.step = 0; MOB.roadSheet.classList.remove('hidden'); document.body.classList.add('mRoading');
  updateRoadSheet(); refreshMobileBar();
}
function closeRoadBuilder() { if (MOB.roadSheet) MOB.roadSheet.classList.add('hidden'); document.body.classList.remove('mRoading'); MOB.road.step = 0; refreshMobileBar(); }
function cancelDrawStroke() { UI.roadDrag = null; UI.zoneDrag = null; UI.pendingAction = null; $('placeBar').classList.add('hidden'); MOB.road.step = 0; updateRoadSheet(); }
/* END: the finger was lifted → preview with cost, then CONFIRM */
function finishDrawStroke() {
  if (UI.tool === 'road' && UI.roadDrag) roadPreviewConfirm(); else if (UI.tool === 'zone' && UI.zoneDrag) zonePreviewConfirm(); else return;
  $('placeBar').classList.add('hidden');
  MOB.road.step = 3; updateRoadSheet();
}
function confirmDrawStroke() {
  const f = UI.pendingAction; UI.pendingAction = null; $('placeBar').classList.add('hidden');
  if (f) { if (UI.tool === 'zone' && UI.zoneDrag) { const n = rectTiles(UI.zoneDrag.x0, UI.zoneDrag.y0, UI.zoneDrag.x1, UI.zoneDrag.y1).length; f(); toast(ZONES[UI.zoneType].icon + ' ' + n + ' tiles ' + (UI.zoneType ? 'zoned ' + ZONES[UI.zoneType].name : 'unzoned'), 'good'); } else f(); }
  UI.roadDrag = null; UI.zoneDrag = null; MOB.road.step = 0; updateRoadSheet();
}
function updateRoadSheet() {
  if (!MOB.roadSheet) return;
  const zone = MOB.draw === 'zone', steps = ['START', 'DRAG', 'END', 'CONFIRM'], s = MOB.road.step;
  let types;
  if (zone) types = ZONES.map(function (z) { return '<button class="' + (UI.zoneType === z.id ? 'on' : '') + '" data-mzone="' + z.id + '"><span>' + z.icon + '</span>' + esc(z.name) + '<small>' + (z.id ? '$' + zoneCost() + '/tile' : 'free') + '</small></button>'; }).join('');
  else types = MOB_ROADS.map(function (r) { const def = ROAD_TYPES[r[2]], lock = def.unlock && S.city.peakPop < def.unlock.pop && !S.city.sandbox; return '<button class="' + (MOB.road.kind === r[0] ? 'on' : '') + (lock ? ' dis' : '') + '" data-mroad="' + r[0] + '"><span>' + ({ bridge: '🌉', tunnel: '🚇' }[r[0]] || def.icon) + '</span>' + r[1] + '<small>' + (lock ? '🔒 ' + fmt(def.unlock.pop) + ' pop' : money(roadTypeCost(r[2])) + '/tile') + '</small></button>'; }).join('');
  const tip = zone ? 'Touch a corner (START), DRAG to the opposite corner, lift (END), then CONFIRM.' : ({ bridge: 'Drag across a river or lake — water tiles become a bridge.', tunnel: 'Drag through rock — rock tiles become a tunnel.' }[MOB.road.kind] || 'Touch the map (START), DRAG your finger, lift (END), then CONFIRM.');
  const info = s >= 3 ? esc((($('placeInfo') || {}).textContent || '').replace(/^\s+/, '')) : '';
  MOB.roadSheet.innerHTML = '<div class="mrHead"><b>' + (zone ? '🟩 ZONE' : '🛣️ ROAD') + '</b><div class="mrTypes mChips">' + types + '</div><button class="mX" data-mra="close" aria-label="Close">✕</button></div>' +
    '<div class="mrRow"><div class="mrSteps">' + steps.map(function (n, i) { return '<span class="' + (i < s ? 'done' : i === s ? 'cur' : '') + '">' + (i + 1) + ' ' + n + '</span>'; }).join('<i>→</i>') + '</div>' +
    '<div class="mrTip">' + (info ? '<b>' + info + '</b>' : tip + ' Two fingers move the camera.') + '</div>' +
    '<div class="mrBtns">' + (s > 0 ? '<button class="btn" data-mra="cancel">↺ REDO</button>' : '') + (s >= 3 ? '<button class="btn green" data-mra="confirm">✓ CONFIRM</button>' : '') + '</div></div>';
}

/* ===================================== BACK BUTTON (Android) ===================================== */
/* Called by MainActivity.onBackPressed(): returns 'handled' or 'exit'. Never closes the app on the first press:
   gameplay → pause · pause → resume · build mode → cancel build · map → close map · panel → close panel · menu → exit dialog */
window.bctOnBack = function () {
  try {
    if (document.getElementById('admLogin')) { closeAdminLogin(); return 'handled'; }
    if (MOB.tut) { endMobileTutorial(true); return 'handled'; }
    if (PSH && PSH.dialogOpen) { const btns = $('sysBtns').querySelectorAll('button'); const b = PSH.escIndex >= 0 ? btns[PSH.escIndex] : btns[btns.length - 1]; if (b) b.click(); return 'handled'; }
    if (typeof ADM !== 'undefined' && ADM.open) { closeAdminCenter(); return 'handled'; }
    if (!$('paletteWrap').classList.contains('hidden')) { closePalette(); return 'handled'; }
    if ($('modalWrap').classList.contains('show')) { closeModal(); return 'handled'; }          // pause menu → resume
    if (typeof mobileBackPanels === 'function' && mobileBackPanels()) return 'handled';     // map · page · panel · notifications · inspector · sheet
    if (MOB.buildBar && !MOB.buildBar.classList.contains('hidden')) { closeBuildBar(); setTool('select'); return 'handled'; }
    if (MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden')) { if (MOB.road.step > 0) cancelDrawStroke(); else exitDrawMode(); return 'handled'; }
    if (STARTED) {
      if (UI.panel) { closeLeft(); return 'handled'; }
      if (UI.tool !== 'select' || UI.selected || PHOTO.on || !$('placeBar').classList.contains('hidden')) { cancelAction(); $('placeBar').classList.add('hidden'); if (UI.selected) selectBuilding(null); return 'handled'; }
      openPauseMenu(); return 'handled';
    }
    const vis = Array.from(document.querySelectorAll('#titleScreen .menuBox')).find(function (m) { return !m.classList.contains('hidden'); });
    if (vis && vis.id !== 'menuMain') { showMenu('main'); return 'handled'; }
    sysDialog(T('exitTitle'), '<p>' + T('exitSaved') + '</p>', [[T('exit'), 'red', function () { Platform.quit(); }], [T('cancel'), '', null]], 1);
    return 'handled';
  } catch (e) { Log.warn('Back button: ' + e.message); return 'handled'; }
};

/* ===================================== FIRST LAUNCH SETUP ===================================== */
function firstLaunchSetup(done) {
  if (GSET.setupDone) { if (done) done(); return; }
  const q = (GSET.perfMode || 'AUTO');
  const seg = function (k, vals, labels, cur) { return '<div class="seg flSeg" data-fl="' + k + '">' + vals.map(function (v, i) { return '<button type="button" class="' + (String(cur) === String(v) ? 'on' : '') + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  sysDialog('👋 WELCOME TO BLOCK CITY TYCOON', '<p class="small">Quick setup for ' + PLATFORM_NAME + ' — you can change everything later in ⚙️ Settings.</p>' +
    '<div class="flRow"><b>🌐 Language / Dil</b>' + seg('language', ['en', 'tr'], ['English', 'Türkçe'], GSET.language === 'tr' ? 'tr' : 'en') + '</div>' +
    '<div class="flRow"><b>🎨 Graphics quality</b>' + seg('perfMode', ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], null, q) + '</div>' +
    '<div class="flRow"><b>🔠 UI scale</b>' + seg('uiScale', [90, 100, 110, 120], ['90%', '100%', '110%', '120%'], GSET.uiScale || 100) + '</div>' +
    '<div class="flRow"><b>👆 Touch buttons</b>' + seg('largeTouch', ['0', '1'], ['Normal', 'Large'], GSET.largeTouch ? '1' : '0') + '</div>',
  [['CREATE YOUR FIRST CITY →', 'gold', function () { GSET.setupDone = true; saveGSET(); applySettings2(); Log.info('First launch setup done'); if (done) done(); }]], 0);
  document.querySelectorAll('[data-fl]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      const b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      const k = g.dataset.fl, v = b.dataset.v;
      if (k === 'language') { GSET.language = v; saveGSET(); if (typeof applyShellTexts === 'function') applyShellTexts(); setLanguage(v); } else if (k === 'perfMode') { GSET.perfMode = v; if (v === 'AUTO') GSET.autoPerfLevel = ''; } else if (k === 'uiScale') GSET.uiScale = +v; else if (k === 'largeTouch') GSET.largeTouch = v === '1';
      saveGSET(); applySettings2();
    });
  });
}

/* ===================================== BOOT ===================================== */
function selftestActive() { return typeof stPhase === 'function' && !!stPhase(); }
function mobileMenuSetup() { const m = document.getElementById('menuMain'); if (m) m.classList.toggle('mobMenu', IS_MOBILE); }
function mobileBoot() {
  applyPlatformClasses();
  mobileMenuSetup();
  if (!IS_MOBILE) { Log.info('Platform: ' + PLATFORM_NAME + ' · desktop UI'); return; }
  buildMobileHud();
  bindTouchCamera();
  mobilePlacementHooks();
  if (typeof mobilePanelsBoot === 'function') mobilePanelsBoot();
  if (IS_ANDROID_APP) applyOrientation();
  layoutMobile();
  setInterval(function () { refreshMobileHud(false); }, 500);
  const sg = window.startGame;
  window.startGame = function () {
    const r = sg.apply(this, arguments);
    try {
      document.body.classList.add('inGame');
      applySettings2(); toggleRight(true); closeMobileOverlays(); gstReset();
      if (S.settings.minimap === undefined) S.settings.minimap = !RESP.portrait;
      $('minimap').classList.toggle('hidden', !S.settings.minimap);
      refreshMobileHud(true); layoutMobile();
      if (!selftestActive()) setTimeout(function () { startMobileTutorial(false); }, 1200);
    } catch (e) { Log.warn('Mobile start: ' + e.message); }
    return r;
  };
  const rm = window.returnToMenu;
  window.returnToMenu = function () { closeMobileOverlays(); if (typeof closeMobilePage === 'function') closeMobilePage(); const r = rm.apply(this, arguments); document.body.classList.remove('inGame'); updateRotateOverlay(); return r; };
  // FIRST LAUNCH: short platform setup, then CREATE YOUR FIRST CITY (skipped while an automatic self-test runs)
  const tryFirst = function (n) {
    if (GSET.setupDone || selftestActive()) return;
    if ((PSH && PSH.dialogOpen) || STARTED) { if (n < 40) setTimeout(function () { tryFirst(n + 1); }, 1500); return; }
    firstLaunchSetup(function () { if (!slotInfo(activeSlot()).exists) { showMenu('new'); const t = document.getElementById('newTitle'); if (t) t.textContent = '🏗️ CREATE YOUR FIRST CITY'; } });
  };
  setTimeout(function () { tryFirst(0); }, 1200);
  Log.info('Platform: ' + PLATFORM_NAME + ' · IS_ANDROID=' + IS_ANDROID + ' · MOBILE UI 2.0 (' + (RESP.tablet ? 'tablet' : 'phone') + ', ' + RESP.w + '×' + RESP.h + ', scale ' + RESP.scale + ', safe area ' + [RESP.sa.t, RESP.sa.r, RESP.sa.b, RESP.sa.l].join('/') + ')');
}
