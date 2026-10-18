'use strict';
/* BLOCK CITY TYCOON — MOBILE UI TEST (Part 13 · Part 14: Mobile 2.0)
   Runs the Android UI (browser preview, ?platform=android) in Chromium with touch emulation on real phone / tablet
   screen sizes and checks every main screen: Main Menu, New City, Continue, World Generator, Gameplay, Build, Roads,
   Transport, Economy, City Panel, Map, Settings, Save, Load, Pause and the Back Button. On every screen the in-game UI
   bounds audit (mobileUiAudit: x ≥ left, x + width ≤ right, y ≥ top, y + height ≤ bottom of the safe area) and the touch
   audit (buttons ≥ 36 px, not covered by another element) must pass. Touch input is real: one-finger drag, pinch,
   twist, tap-to-place, START → DRAG → END → CONFIRM road drawing — all through CDP touch events.
   Part 14 adds: HUD modes, speed sheet, search, long press + smart selection, double tap, UNDO, critical alerts, quests,
   daily report, minimap 2.0, readable text (no tiny fonts), HUD overlap and a memory-leak loop over the panels.
   Part 17 adds the ECONOMY CENTER (tabs by touch, cards inside the screen).
   Part 15 adds: Visual Engine night city / rain, Photo Mode 2.0 (HIDE UI) and the landscape → portrait → landscape
   regression (minimap controls, comment bubble, advisor button never stay at old coordinates).
   Usage:  node scripts/mobile-ui-test.js [--out=dist/mobile-ui] [--only=small-phone,tablet] [--shots]
   Needs Playwright (npm i --no-save playwright && npx playwright install chromium) or PLAYWRIGHT_PATH. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..', 'src');
const args = process.argv.slice(2);
const opt = function (k, d) { const a = args.find(function (x) { return x.indexOf('--' + k + '=') === 0; }); return a ? a.split('=')[1] : d; };
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'dist', 'mobile-ui')));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const SHOTS = args.indexOf('--shots') >= 0;
let pw = null;
for (const c of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright']) { if (!c) continue; try { pw = require(c); break; } catch (e) { /* next */ } }
if (!pw) { console.error('Playwright not found — npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

/* CSS viewport = physical pixels / device pixel ratio (landscape) */
const DEVICES = [
  { id: 'small-phone', name: 'SMALL PHONE 720×1280 (dpr 2)', w: 640, h: 360, dpr: 2 },
  { id: 'hd-phone', name: 'HD PHONE 1920×1080 (dpr 1.5)', w: 1280, h: 720, dpr: 1.5 },
  { id: 'medium-phone', name: 'MEDIUM PHONE 1080×1920 (dpr 2.625)', w: 731, h: 411, dpr: 2.625 },
  { id: 'large-phone', name: 'LARGE PHONE 1080×2400 (dpr 2.75), notch + nav bar', w: 873, h: 393, dpr: 2.75, insets: [0, 34, 0, 24] },
  { id: 'qhd-phone', name: 'QHD PHONE 1440×2560 (dpr 3.5)', w: 731, h: 411, dpr: 3.5, insets: [0, 0, 0, 28] },
  { id: 'tall-phone', name: '21:9 PHONE 1080×2520 (dpr 3)', w: 840, h: 360, dpr: 3, insets: [0, 30, 0, 30] },
  { id: 'tablet', name: 'TABLET 2560×1600 (dpr 2)', w: 1280, h: 800, dpr: 2 },
  { id: 'small-tablet', name: 'SMALL TABLET 1280×800 (dpr 1.33)', w: 962, h: 601, dpr: 1.33 },
  { id: 'portrait-phone', name: 'PORTRAIT PHONE 1080×2400 (portrait layout)', w: 393, h: 873, dpr: 2.75, portrait: true }
];
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

async function runDevice(browser, base, dev) {
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [], results = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  const ev = function (f, a) { return page.evaluate(f, a); };
  const touch = async function (type, pts) { await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: pts.map(function (p, i) { return { x: p[0], y: p[1], id: p[2] !== undefined ? p[2] : i, radiusX: 4, radiusY: 4, force: 1 }; }) }); };
  const drag = async function (x0, y0, x1, y1, n) { n = n || 10; await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= n; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]]); await sleep(16); } await touch('touchEnd', []); await sleep(60); };
  const tap = async function (x, y) { await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); await sleep(120); };
  /* Part 16 — NO FLAKY TESTS: wait for the state instead of hoping a fixed sleep was long enough on a busy CI runner */
  const until = async function (fn, arg, ms) { try { await page.waitForFunction(fn, arg, { timeout: ms || 3000, polling: 50 }); return true; } catch (e) { return false; } };
  const tapSel = async function (sel) { await until(function (s) { const e = document.querySelector(s); if (!e) return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; }, sel, 3000); const r = await ev(function (s) { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, sel); if (!r) throw new Error('missing ' + sel); await tap(r[0], r[1]); };
  const audit = function () { return ev(function () { return { ui: mobileUiAudit(false).filter(function (a) { return !a.ok; }), touch: mobileTouchAudit().filter(function (t) { return t.small || t.covered; }) }; }); };
  const check = async function (name, fn) {
    const t0 = Date.now(); let ok = false, detail = '';
    try { const r = await fn(); ok = r.ok; detail = r.detail || ''; } catch (e) { ok = false; detail = 'ERROR ' + e.message; }
    // layout settles asynchronously (HUD fit, sheet animations, toasts): give it up to 1.5 s; a real overlap still fails
    await until(function () { try { return mobileUiAudit(false).every(function (a) { return a.ok; }) && !mobileTouchAudit().some(function (t) { return t.small || t.covered; }); } catch (e) { return true; } }, null, 1500);
    let a = { ui: [], touch: [] }; try { a = await audit(); } catch (e) { /* page gone */ }
    if (a.ui.length) { ok = false; detail += ' · OUT OF BOUNDS: ' + a.ui.map(function (x) { return x.id + ' (' + x.x + ',' + x.y + ' ' + x.w + '×' + x.h + ')'; }).join(', '); }
    if (a.touch.length) { ok = false; detail += ' · TOUCH: ' + a.touch.slice(0, 6).map(function (x) { return '"' + x.text + '" ' + x.w + '×' + x.h + (x.covered ? ' covered' : ' small'); }).join(', '); }
    results.push({ name: name, ok: ok, detail: detail.trim(), ms: Date.now() - t0 });
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + ' — ' + detail.trim());
    if (SHOTS || !ok) await page.screenshot({ path: path.join(OUT, dev.id + '-' + name.replace(/[^a-z0-9]+/gi, '_') + '.png') });
  };
  await page.goto(base + '/index.html?platform=android');
  await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none'; }, null, { timeout: 90000 });
  await sleep(1400);
  if (dev.insets) await ev(function (i) { window.bctInsets(i[0], i[1], i[2], i[3]); }, dev.insets);
  if (dev.portrait) await ev(function () { GSET.orientation = 'portrait'; });
  await check('Main Menu', async function () {
    const r = await ev(function () { if (PSH.dialogOpen) { const b = document.querySelector('#sysBtns button'); if (b) b.click(); } showMenu('main'); return !!document.querySelector('#menuMain:not(.hidden) [data-menu="new"]'); });
    return { ok: r, detail: 'NEW CITY · CONTINUE · SANDBOX · SCENARIO · CHALLENGES · SETTINGS' };
  });
  await check('New City', async function () { await tapSel('#menuMain [data-menu="new"]'); await sleep(300); return { ok: await ev(function () { return !$('menuNew').classList.contains('hidden') && !!$('ncCreate'); }), detail: 'form + Create City' }; });
  await check('Load', async function () { await ev(function () { showMenu('load'); }); await sleep(200); return { ok: await ev(function () { return !$('menuLoad').classList.contains('hidden'); }), detail: 'slot list' }; });
  await check('Back Button (menu)', async function () { const r = await ev(function () { return window.bctOnBack(); }); await sleep(100); return { ok: r === 'handled' && await ev(function () { return !$('menuMain').classList.contains('hidden'); }), detail: 'sub menu → main menu, never exits' }; });
  await check('World Generator', async function () {
    const r = await ev(async function () { GSET.mobileTutDone = true; const g = await generateWorld('balanced', { seed: 424242, name: 'MOBILE TEST', slot: 1, size: 'SMALL' }); closeModal(); clearDialogues(); S.money = 5e7; S.budget = 5e7; setSpeed(0); return !!g && STARTED;   /* paused: the city does not grow on its own during the checks */ });
    await sleep(800); return { ok: r, detail: 'world generated step by step with progress' };
  });
  await check('Gameplay HUD', async function () {
    const r = await ev(function () { return { hud: !!document.querySelector('#mHud') && getComputedStyle($('mHud')).display !== 'none', bar: document.querySelectorAll('#mBar [data-mbar]').length, desk: getComputedStyle($('topbar')).display, fit: MOB.fitLevel }; });
    return { ok: r.hud && r.bar === 7 && r.desk === 'none', detail: 'mobile HUD + 7-button toolbar, desktop top bar hidden · fit level ' + r.fit };
  });
  await check('Touch Camera', async function () {
    const before = await ev(function () { return { x: CAM.x, y: CAM.y, z: CAM.zoom }; });
    const st = await ev(function () { for (let k = 0; k < 40; k++) { const x = innerWidth * (0.35 + (k % 5) * 0.08), y = innerHeight * (0.45 + Math.floor(k / 5) * 0.03); if (document.elementFromPoint(x, y) === canvas) return [x, y]; } return [innerWidth / 2, innerHeight / 2]; });   // a point on the world, not on a UI element
    await drag(st[0], st[1], st[0] - dev.w * 0.25, st[1] - dev.h * 0.1);
    const mid = await ev(function () { return { x: CAM.x, y: CAM.y, z: CAM.zoom, sel: !!UI.selected }; });
    const cx = dev.w / 2, cy = dev.h / 2;
    await touch('touchStart', [[cx - 40, cy, 0], [cx + 40, cy, 1]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 40 - i * 10, cy, 0], [cx + 40 + i * 10, cy, 1]]); await sleep(16); } await touch('touchEnd', []); await sleep(80);
    const zoomed = await ev(function () { return { z: CAM.zoom, sel: !!UI.selected, b: S.buildings.list.length }; });
    await touch('touchStart', [[cx - 90, cy, 0], [cx + 90, cy, 1]]); for (let i = 1; i <= 8; i++) { const a = i * 0.07; await touch('touchMove', [[cx - 90 * Math.cos(a), cy - 90 * Math.sin(a), 0], [cx + 90 * Math.cos(a), cy + 90 * Math.sin(a), 1]]); await sleep(16); } await touch('touchEnd', []); await sleep(80);
    const rot = await ev(function () { const r = CAM.rot; return r; });
    await tapSel('#mCamReset'); await sleep(80);
    const reset = await ev(function () { return CAM.rot === 0 && !UI.selected; });
    const ok = Math.abs(mid.x - before.x) > 20 && zoomed.z > mid.z * 1.2 && !zoomed.sel && Math.abs(rot) > 0.15 && reset;
    return { ok: ok, detail: 'drag moved ' + Math.round(mid.x - before.x) + 'px · pinch ' + mid.z.toFixed(2) + '→' + zoomed.z.toFixed(2) + ' (no selection) · twist ' + Math.round(rot * 57.3) + '° · 🎯 reset ' + reset };
  });
  await check('Build', async function () {
    await tapSel('[data-mbar="build"]'); await sleep(250);
    const cats = await ev(function () { return document.querySelectorAll('#mSheet [data-mcat]').length; });
    await tapSel('#mSheet [data-mcat="res"]'); await sleep(150);
    await ev(function () { const c = document.querySelector('#mSheet [data-mbuild="house"]'); if (c) c.scrollIntoView({ block: 'center' }); });
    await tapSel('#mSheet [data-mbuild="house"]'); await sleep(250);
    const mode = await ev(function () { return { bar: !$('mBuildBar').classList.contains('hidden'), ghost: !!UI.ghost, ok: UI.ghost ? canPlace(fpDef(UI.placing, UI.rot | 0), UI.ghost.x, UI.ghost.y).ok : false, n: S.buildings.list.length, state: ($('mbInfo').querySelector('.mbState') || {}).textContent }; });
    await tapSel('[data-mb="rotate"]'); await sleep(80);
    const g = await ev(function () { const p = worldToScreen((UI.ghost.x + 0.5) * TILE, (UI.ghost.y + 0.5) * TILE); return [p.x, p.y]; });
    await drag(g[0], g[1], g[0] + 3, g[1] + 2, 3);                         // tiny drag on the ghost: stays a ghost move
    const n1 = await ev(function () { return S.buildings.list.length; });
    await ev(function () { UI.ghost = nearestFreeSpot(UI.ghost); renderBuildBar(); });
    await tapSel('[data-mb="confirm"]'); await sleep(60);
    await ev(function () { const b = document.querySelector('[data-mb="confirm"]'); b.disabled = false; b.click(); });   // a fast second press must not build twice
    const n2 = await ev(function () { return S.buildings.list.length; });
    await tapSel('[data-mb="cancel"]'); await sleep(100);
    const closed = await ev(function () { return $('mBuildBar').classList.contains('hidden') && UI.tool === 'select'; });
    return { ok: cats === 8 && mode.bar && mode.ghost && n1 === mode.n && n2 === mode.n + 1 && closed, detail: cats + ' categories · ghost ' + mode.state + ' · ROTATE · CONFIRM built ' + (n2 - mode.n) + ' (double press ignored) · CANCEL ' + closed };
  });
  await check('Roads', async function () {
    await tapSel('[data-mbar="road"]'); await sleep(200);
    const types = await ev(function () { return document.querySelectorAll('#mRoad [data-mroad]').length; });
    const run = await ev(function () {
      for (let y = 2; y < MAP.H - 2; y++) for (let x = 2; x < MAP.W - 8; x++) { let ok = true; for (let k = 0; k < 6; k++) if (!canRoad(x + k, y) || MAP.roads[idx(x + k, y)]) { ok = false; break; } if (ok) { CAM.rot = 0; CAM.x = (x + 3) * TILE; CAM.y = (y + 0.5) * TILE; CAM.zoom = 1; clampCamera(); const a = worldToScreen((x + 0.5) * TILE, (y + 0.5) * TILE), b = worldToScreen((x + 5.5) * TILE, (y + 0.5) * TILE); return [a.x, a.y, b.x, b.y]; } }
      return null;
    });
    if (!run) return { ok: false, detail: 'no free land' };
    const r0 = await ev(function () { return MAP.roads.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0); });
    await drag(run[0], run[1], run[2], run[3], 12);
    const step = await ev(function () { return MOB.road.step; });
    await tapSel('#mRoad [data-mra="confirm"]'); await sleep(100);
    const r1 = await ev(function () { return MAP.roads.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0); });
    await tapSel('#mRoad [data-mra="close"]'); await sleep(100);
    return { ok: types === 6 && step === 3 && r1 >= r0 + 5, detail: types + ' road types · START→DRAG→END step ' + step + ' · CONFIRM built ' + (r1 - r0) + ' tiles' };
  });
  await check('Transport', async function () { await tapSel('[data-mbar="transport"]'); await sleep(200); const n = await ev(function () { return document.querySelectorAll('#mSheet [data-mtr]').length; }); return { ok: n >= 3, detail: n + ' transport actions + station cards' }; });
  await check('Close sheet (swipe down / X)', async function () {
    const tablet = await ev(function () { return RESP.tablet; });
    if (tablet) { await tapSel('#mSheet [data-msx]'); await sleep(150); return { ok: await ev(function () { return !MSHEET.open; }), detail: 'tablet side panel closed with X' }; }
    const r = await ev(function () { const q = document.querySelector('#mSheet .mSheetHead').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await drag(r[0], r[1], r[0], r[1] + 160, 10); await sleep(150);
    return { ok: await ev(function () { return !MSHEET.open; }), detail: 'bottom sheet closed by swipe down' };
  });
  await check('Inspector', async function () {
    const p = await ev(function () { const b = S.buildings.list.find(function (x) { return x.built && BUILDINGS[x.type].workers && BUILDINGS[x.type].w <= 2; }); CAM.rot = 0; CAM.zoom = 1.2; CAM.x = (b.x + 0.5) * TILE; CAM.y = (b.y + 0.5) * TILE; clampCamera(); const s = worldToScreen((b.x + 0.5) * TILE, (b.y + 0.7) * TILE); return [s.x, s.y]; });
    await tap(p[0], p[1]); await sleep(250);
    await ev(function () { if (MOBX.chooser) { const b = Array.from(MOBX.chooser.el.querySelectorAll('[data-mch]')).find(function (x) { return MOBX.chooser.c[+x.dataset.mch] && MOBX.chooser.c[+x.dataset.mch].kind === 'building'; }); if (b) b.click(); } }); await sleep(200);   // SMART SELECTION: pick the building
    const r = await ev(function () { return { kind: MINS.kind, rows: document.querySelectorAll('#mInspect .miRow').length }; });
    await tapSel('#mInspect [data-mi="close"]'); await sleep(100);
    return { ok: r.kind === 'building' && r.rows >= 5, detail: 'tap → BUILDING INFO (' + r.rows + ' rows: level, condition, workers, income, power, water)' };
  });
  await check('City Panel', async function () { await tapSel('[data-mbar="city"]'); await sleep(250); const n = await ev(function () { return document.querySelectorAll('#mPage .mStatCard').length; }); return { ok: n >= 7, detail: n + ' cards' }; });
  await check('Economy', async function () {
    await ev(function () { closeMobilePage(); }); await tapSel('[data-mbar="economy"]'); await sleep(300);
    const r = await ev(function () { const cv = $('mGraph'); const w = cv.parentNode.getBoundingClientRect(), c = cv.getBoundingClientRect(); return { n: document.querySelectorAll('#mPage .mStatCard').length, tabs: document.querySelectorAll('#mPage [data-metab]').length, fit: c.width <= w.width + 1 && c.right <= window.innerWidth }; });
    await tapSel('#mPage [data-mpx]'); await sleep(100);
    return { ok: r.n >= 6 && r.tabs >= 3 && r.fit, detail: r.n + ' cards · ' + r.tabs + ' economy tabs · graph fits the screen ' + r.fit };
  });
  await check('Economy center (Part 17)', async function () {
    await ev(function () { closeMobilePage(); }); await tapSel('[data-mbar="economy"]'); await until(function () { return !!document.querySelector('#mPage [data-mpg="econ2"]'); });
    await ev(function () { document.querySelector('#mPage [data-mpg="econ2"]').scrollIntoView({ block: 'center' }); }); await sleep(80);
    await tapSel('#mPage [data-mpg="econ2"]'); await until(function () { return !!document.getElementById('e2Root'); });
    const seen = [];
    for (const t of ['overview', 'market', 'companies', 'housing', 'taxes']) {
      await ev(function (k) { const b = document.querySelector('#e2Root [data-e2t="' + k + '"]'); if (b) b.scrollIntoView({ inline: 'center', block: 'nearest' }); }, t);
      await tapSel('#e2Root [data-e2t="' + t + '"]'); await until(function (k) { const b = document.querySelector('#e2Root [data-e2t="' + k + '"]'); return !!b && b.classList.contains('gold'); }, t);
      seen.push(await ev(function () { const r = document.getElementById('e2Root'); return r ? r.innerText.length : 0; }));
    }
    const fit = await ev(function () { return Array.from(document.querySelectorAll('#e2Root .e2Tile,#e2Root .e2Card')).every(function (e) { const q = e.getBoundingClientRect(); return q.left >= -1 && q.right <= innerWidth + 1; }); });
    const a = await audit(); await ev(function () { closeModal(); });
    return { ok: seen.length === 5 && seen.every(function (n) { return n > 80; }) && fit && !a.ui.length, detail: 'ECONOMY CENTER from the economy page · 5 tabs by touch (' + seen.join('/') + ' chars) · cards fit the screen ' + fit };
  });
  await check('Map', async function () { await tapSel('[data-mbar="map"]'); await sleep(300); const r = await ev(function () { return MMAP.open && document.querySelectorAll('#mMapLayers [data-mml]').length; }); const back = await ev(function () { return window.bctOnBack(); }); await sleep(100); const closed = await ev(function () { return !MMAP.open; }); return { ok: r === 6 && back === 'handled' && closed, detail: r + ' layers · back closes the map ' + closed }; });
  await check('HUD modes', async function () {
    const r = [];
    for (let i = 0; i < 3; i++) { await tapSel('#mHudMode'); await sleep(250); r.push(await ev(function () { return { m: GSET.hudMode, bar: shown($('mBar')), handle: shown($('mBarHandle')), pause: shown($('mPause')) }; })); }
    const min = r.find(function (x) { return x.m === 'minimal'; }) || {};
    let peek = false;
    if (min.handle) { await ev(function () { GSET.hudMode = 'minimal'; applyHudMode(); }); await tapSel('#mBarHandle'); await sleep(200); peek = await ev(function () { return shown($('mBar')); }); }
    await ev(function () { GSET.hudMode = 'full'; saveGSET(); applyHudMode(); }); await sleep(250);
    return { ok: r.length === 3 && min.m === 'minimal' && !min.bar && min.handle && min.pause && peek, detail: r.map(function (x) { return x.m.toUpperCase(); }).join(' → ') + ' · MINIMAL: toolbar folded into TOOLS ' + min.handle + ', pause kept ' + min.pause + ' · TOOLS ▲ shows it ' + peek };
  });
  await check('Speed sheet', async function () {
    await tapSel('#mSpeed'); await sleep(250);
    const n = await ev(function () { return MSHEET.kind === 'speed' ? document.querySelectorAll('#mSheet [data-mspd]').length : 0; });
    await tapSel('#mSheet [data-mspd="5"]'); await sleep(150);
    const sp = await ev(function () { const v = S.settings.speed; setSpeed(0); return { v: v, closed: !MSHEET.open }; });
    return { ok: n === 9 && sp.v === 5 && sp.closed, detail: n + ' speeds (⏸ 0.5× … 100×) · tap 5× → ' + sp.v + '× · sheet closed ' + sp.closed };
  });
  await check('Search', async function () {
    await tapSel('#mSearchBtn'); await until(function () { return !!document.getElementById('mSearchQ'); });
    await ev(function () { const i = $('mSearchQ'); i.value = 'house'; i.dispatchEvent(new Event('input')); }); await sleep(120);
    const n = await ev(function () { return document.querySelectorAll('#mSearchRes [data-msr]').length; });
    await ev(function () { document.querySelector('[data-msc="district"]').click(); const i = $('mSearchQ'); i.value = ''; i.dispatchEvent(new Event('input')); }); await sleep(100);
    const d = await ev(function () { return document.querySelectorAll('#mSearchRes [data-msr]').length; });
    const cam0 = await ev(function () { return CAM.x + ',' + CAM.y; });
    await tapSel('#mSearchRes [data-msr="0"]'); await sleep(900);
    const r = await ev(function () { const c = CAM.x + ',' + CAM.y; MSEARCH.cat = 'all'; MSEARCH.q = ''; return { c: c, closed: !$('modalWrap').classList.contains('show') }; });
    return { ok: n > 0 && d > 0 && r.closed && r.c !== cam0, detail: '"house" → ' + n + ' results · districts ' + d + ' · GO → camera moved ' + (r.c !== cam0) };
  });
  await check('Long press & smart selection', async function () {
    const p = await ev(function () { const b = S.buildings.list.find(function (x) { return x.built && BUILDINGS[x.type].w <= 2; }); CAM.rot = 0; CAM.zoom = 1.2; CAM.x = (b.x + 0.5) * TILE; CAM.y = (b.y + 0.5) * TILE; clampCamera(); const s = worldToScreen((b.x + 0.5) * TILE, (b.y + 0.7) * TILE); return [s.x, s.y]; });
    await touch('touchStart', [[p[0], p[1]]]); await sleep(750); await touch('touchEnd', []); await sleep(200);
    const r = await ev(function () { return MOBX.chooser ? { n: MOBX.chooser.c.length, kinds: MOBX.chooser.c.map(function (c) { return c.kind; }).join('/') } : null; });
    if (r) await tapSel('#mChooser [data-mch="' + (r.n - 1) + '"]'); await sleep(200);
    const tile = await ev(function () { const ok = $('modalWrap').classList.contains('show') && /LOCATION/.test($('modalTitle') ? $('modalTitle').textContent : document.querySelector('#modal').textContent); closeModal(); return ok; });
    const z0 = await ev(function () { return CAM.zoom; });
    const q = await ev(function () { for (let k = 0; k < 40; k++) { const x = innerWidth * (0.35 + (k % 5) * 0.08), y = innerHeight * (0.45 + Math.floor(k / 5) * 0.03); if (document.elementFromPoint(x, y) === canvas) return [x, y]; } return [innerWidth / 2, innerHeight / 2]; });
    await touch('touchStart', [[q[0], q[1]]]); await sleep(30); await touch('touchEnd', []); await sleep(50); await touch('touchStart', [[q[0], q[1]]]); await sleep(30); await touch('touchEnd', []); await sleep(1300);
    const z1 = await ev(function () { closeInspector(); closeSelectChooser(); return CAM.zoom; });
    return { ok: !!r && r.n >= 2 && /tile/.test(r.kinds) && tile && z1 > z0 * 1.2, detail: 'long press → chooser ' + (r ? r.kinds : 'none') + ' · tile info ' + tile + ' · double tap zoom ' + z0.toFixed(2) + '→' + z1.toFixed(2) };
  });
  await check('Undo', async function () {
    const r = await ev(function () {
      UNDO.lastInput = performance.now();
      let spot = null; for (let y = 3; y < MAP.H - 3 && !spot; y++) for (let x = 3; x < MAP.W - 3 && !spot; x++) if (canPlace(BUILDINGS.house, x, y).ok) spot = [x, y];
      if (!spot) return null;
      const m0 = S.money, n0 = S.buildings.list.length; const b = placeBuilding(BUILDINGS.house, spot[0], spot[1], 0);
      const bar = shown($('undoBar')), n1 = S.buildings.list.length;
      return { bar: bar, n0: n0, n1: n1, m0: m0, ok: !!b };
    });
    if (!r) return { ok: false, detail: 'no free spot' };
    if (r.bar) await tapSel('#undoBar [data-undo]'); await sleep(150);
    const a = await ev(function () { return { n: S.buildings.list.length, m: S.money }; });
    return { ok: r.ok && r.bar && r.n1 === r.n0 + 1 && a.n === r.n0 && Math.abs(a.m - r.m0) < 1, detail: 'build → toast with ↶ UNDO ' + r.bar + ' · UNDO → ' + a.n + '/' + r.n0 + ' buildings, money restored ' + (Math.abs(a.m - r.m0) < 1) };
  });
  await check('Critical alert', async function () {
    const r = await ev(function () { const d = (typeof DISASTERS !== 'undefined' ? DISASTERS : []).find(function (x) { return x.id === 'storm'; }) || { id: 'storm', icon: '⛈️', name: 'Storm', desc: 'test', dur: 30 }; GSET.critAlerts = true; const sp = S.settings.speed; showCriticalAlert('disaster', d); return { shown: shown($('mCrit')), btns: document.querySelectorAll('#mCrit [data-mcr]').length, paused: S.settings.speed !== sp }; });
    if (r.shown) await tapSel('#mCrit [data-mcr="ignore"]'); await sleep(150);
    const hid = await ev(function () { return !shown($('mCrit')); });
    return { ok: r.shown && r.btns >= 2 && !r.paused && hid, detail: 'CRITICAL ALERT with VIEW / DISPATCH / IGNORE (' + r.btns + ') · game not paused ' + !r.paused + ' · IGNORE closes ' + hid };
  });
  await check('Quests & daily report', async function () {
    await ev(function () { openQuestPage(); }); await sleep(200);
    const q = await ev(function () { return document.querySelectorAll('#modalBody [data-mq="go"]').length; });
    if (q) await tapSel('#modalBody [data-mq="go"]'); await sleep(500);
    const went = await ev(function () { return !$('modalWrap').classList.contains('show'); });
    await ev(function () { openDailyReport(); }); await sleep(200);
    const rep = await ev(function () { const n = document.querySelectorAll('#modalBody .mRep').length; return n; });
    const a = await audit(); await ev(function () { closeModal(); });
    return { ok: (q >= 1 ? went : true) && rep >= 8 && !a.ui.length, detail: q + ' quests with GO TO LOCATION · GO closes and moves ' + went + ' · daily report ' + rep + ' cards' };
  });
  await check('Minimap 2.0', async function () {
    await ev(function () { S.settings.minimap = true; $('minimap').classList.remove('hidden'); syncMiniCtl(); }); await sleep(600);
    const r = await ev(function () { return { ctl: shown($('mMiniCtl')), n: document.querySelectorAll('#mMiniCtl [data-mmc]').length, w0: $('minimap').getBoundingClientRect().width }; });
    if (r.ctl) { await tapSel('#mMiniCtl [data-mmc="size"]'); await sleep(250); }
    const w1 = await ev(function () { return $('minimap').getBoundingClientRect().width; });
    if (r.ctl) { await tapSel('#mMiniCtl [data-mmc="map"]'); await sleep(300); }
    const map = await ev(function () { const o = MMAP.open; closeCityMap(); GSET.miniSize = 'm'; applyMiniSize(); return o; }); await sleep(200);
    return { ok: (r.ctl && r.n === 3 && w1 !== r.w0 && map) || (!r.ctl && RESP.portrait), detail: 'controls ' + r.n + ' · resize ' + Math.round(r.w0) + '→' + Math.round(w1) + ' px · 🗺 opens the full map ' + map };
  });
  await check('Readable text & no overlap', async function () {
    const r = await ev(function () {
      const tiny = [], sel = '#mHud *,#mSide *,#mBar *,#mSheet *,#mInspect *,#mMiniCtl *,#undoBar *';
      document.querySelectorAll(sel).forEach(function (e) { if (!e.childNodes.length || !Array.from(e.childNodes).some(function (n) { return n.nodeType === 3 && n.textContent.trim(); })) return; if (!visibleEl(e) || e.closest('.hidden')) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 10) tiny.push((e.id || e.className || e.tagName) + ' ' + fs + 'px'); });
      const R = function (id) { const e = $(id); return e && shown(e) ? e.getBoundingClientRect() : null; }, hit = function (a, b) { return a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1; };
      const hud = R('mHud'), side = R('mSide'), mini = R('minimap'), bar = R('mBar'), over = [];
      if (hit(hud, side)) over.push('HUD/side'); if (hit(side, mini)) over.push('side/minimap'); if (hit(mini, bar)) over.push('minimap/toolbar'); if (hit(side, bar)) over.push('side/toolbar');
      return { tiny: tiny.slice(0, 5), over: over };
    });
    return { ok: !r.tiny.length && !r.over.length, detail: 'text ≥ 10 px ' + (r.tiny.length ? r.tiny.join(', ') : 'ok') + ' · HUD / side buttons / minimap / toolbar overlap ' + (r.over.length ? r.over.join(', ') : 'none') };
  });
  await check('Memory (panel loop)', async function () {
    const r = await ev(async function () {
      const w = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
      const heap = function () { return performance.memory ? performance.memory.usedJSHeapSize : 0; };
      if (window.gc) window.gc(); const h0 = heap(), d0 = document.getElementsByTagName('*').length;
      for (let i = 0; i < 12; i++) { openBuildSheet(); await w(20); closeSheet(); openMobilePage('city'); await w(20); closeMobilePage(); openCityMap(); await w(20); closeCityMap(); openNotificationCenter(); await w(10); closeNotificationCenter(); openSpeedSheet(); closeSheet(); openSearch(); closeModal(); }
      await w(300); if (window.gc) window.gc();
      return { dMB: Math.round((heap() - h0) / 1048576), dDom: document.getElementsByTagName('*').length - d0 };
    });
    return { ok: r.dMB < 40 && r.dDom < 400, detail: '12× open/close of every panel → heap ' + (r.dMB >= 0 ? '+' : '') + r.dMB + ' MB · DOM ' + (r.dDom >= 0 ? '+' : '') + r.dDom + ' nodes' };
  });
  await check('Visual Engine (night · rain)', async function () {
    const r = await ev(function () { setHour(22); setWeather('rain', 2); VE.wx.wet = 1; VE.wx.k = 1; VE.at = 0; veFrame(0.016); render(); const o = { lamps: VE.stats.lamps, wins: VE.stats.windows, tier: VE.tier, phase: dayPhase().name }; setHour(12); setWeather('clear', 1); FX.lock = null; return o; });
    return { ok: r.lamps > 0 && r.wins > 0, detail: 'tier ' + r.tier + ' · ' + r.phase + ': ' + r.lamps + ' street lights, ' + r.wins + ' lit windows, rain + wet roads' };
  });
  await check('Photo mode 2.0', async function () {
    await ev(function () { enterPhoto(); }); await until(function () { const e = document.getElementById('phTour'); return !!e && e.getBoundingClientRect().width > 0; });
    const r = await ev(function () { return ['phHide', 'phDepth', 'phPause', 'phA', 'phB', 'phPlay', 'phTour'].filter(function (id) { const e = document.getElementById(id); return e && visibleEl(e); }).length; });
    await ev(function () { $('phHide').scrollIntoView({ block: 'nearest' }); }); await sleep(80);
    await tapSel('#phHide'); await until(function () { return document.body.classList.contains('photoHide'); });
    const hid = await ev(function () { return document.body.classList.contains('photoHide') && !shown($('photoBar')); });
    await tap(dev.w / 2, dev.h / 2); await until(function () { return !document.body.classList.contains('photoHide'); });
    await until(function () { try { return mobileUiAudit(false).every(function (a) { return a.ok; }); } catch (e) { return true; } }, null, 1500);
    const back = await ev(function () { return !document.body.classList.contains('photoHide') && shown($('photoBar')); });
    const a = await audit(); await ev(function () { exitPhoto(); }); await sleep(150);
    return { ok: r >= 7 && hid && back && !a.ui.length, detail: r + ' photo controls · HIDE UI ' + hid + ' · tap brings them back ' + back + (a.ui.length ? ' · OUT OF BOUNDS in photo mode: ' + a.ui.map(function (x) { return x.id + ' (' + x.x + ',' + x.y + ' ' + x.w + '×' + x.h + ')'; }).join(', ') : '') };
  });
  await check('Rotation regression (landscape → portrait → landscape)', async function () {
    if (dev.portrait) return { ok: true, detail: 'portrait device' };
    await ev(function () { S.settings.minimap = true; $('minimap').classList.remove('hidden'); UI.advice = UI.advice || { id: 'rt', msg: 'Rotation test advice' }; MOBX.commentAt = 0; const c = AG.citizens.find(function (x) { return !x.inside; }); if (c) c.bubble = { text: 'Rotation test', until: FX.time + 30 }; setSpeed(1); }); await sleep(1300);
    const pos = async function () { return ev(function () { const m = $('minimap').getBoundingClientRect(), k = $('mMiniCtl').getBoundingClientRect(), s = MOB.side.getBoundingClientRect(), cm = document.getElementById('mComment'), cr = cm && shown(cm) ? cm.getBoundingClientRect() : null; return { ctl: shown($('mMiniCtl')) ? Math.abs(k.top - (m.bottom + 4)) < 3 && Math.abs(k.right - m.right) < 3 : true, cm: !cr || cr.left >= s.right - 1, adv: !!document.getElementById('mAdvBtn') }; }); };
    const p0 = await pos();
    await page.setViewportSize({ width: dev.h, height: dev.w }); await sleep(500);
    await page.setViewportSize({ width: dev.w, height: dev.h }); await sleep(600);
    const p1 = await pos(); const a = await audit(); await ev(function () { setSpeed(0); });
    return { ok: p0.ctl && p1.ctl && p0.cm && p1.cm && !a.ui.length && !a.touch.length, detail: 'minimap controls under the minimap ' + p0.ctl + '→' + p1.ctl + ' · comment bubble right of the side buttons ' + p0.cm + '→' + p1.cm + ' · advisor button ' + p1.adv };
  });
  await check('Settings', async function () {
    await ev(function () { openSettings('graphics'); }); await sleep(200);
    const tabs = await ev(function () { return Array.from(document.querySelectorAll('[data-s2tab]')).map(function (b) { return b.dataset.s2tab; }); });
    let bad = [];
    for (const t of tabs) { await ev(function (x) { openSettings(x); }, t); await sleep(80); const a = await audit(); if (a.ui.length || a.touch.length) bad.push(t + '[' + a.ui.map(function (x) { return x.id; }).concat(a.touch.map(function (x) { return x.text + (x.covered ? ' covered' : ' small'); })).slice(0, 3).join(';') + ']'); }
    await ev(function () { openSettings('camera'); }); await sleep(100);
    const sens = await ev(function () { const r = document.querySelector('[data-mrange="camSens"]'); r.value = 2; r.dispatchEvent(new Event('change', { bubbles: true })); return GSET.camSens; });
    await ev(function () { openSettings('uiscale'); }); await sleep(80);
    await ev(function () { document.querySelector('[data-gs2="uiScale"][data-v="120"]').click(); }); await sleep(250);
    const sc = await ev(function () { return RESP.scale; });
    const a120 = await audit();
    await ev(function () { document.querySelector('[data-gs2="uiScale"][data-v="100"]').click(); GSET.camSens = 'MEDIUM'; saveGSET(); }); await sleep(150);
    const back = await ev(function () { return window.bctOnBack(); }); await sleep(100);
    const closed = await ev(function () { return !$('modalWrap').classList.contains('show'); });
    return { ok: tabs.length >= 11 && !bad.length && sens === 'HIGH' && !a120.ui.length && closed, detail: tabs.join('/') + (bad.length ? ' · layout problems in ' + bad.join(',') : '') + ' · Camera Sensitivity slider → ' + sens + ' · UI SCALE 120% → scale ' + sc + ' ok ' + !a120.ui.length + ' · back closes ' + closed };
  });
  await check('Pause & Save', async function () {
    const p = await ev(function () { return window.bctOnBack(); }); await sleep(150);
    const open = await ev(function () { return !!document.querySelector('#modal.mPauseModal [data-mp="save"]'); });
    await tapSel('[data-mp="save"]'); await sleep(250);
    const saved = await ev(function () { return ($('mSaveChip') || {}).textContent; });
    const back = await ev(function () { return window.bctOnBack(); }); await sleep(100);
    const closed = await ev(function () { return !$('modalWrap').classList.contains('show'); });
    return { ok: p === 'handled' && open && /CITY SAVED/.test(saved || '') && closed, detail: 'back → PAUSE MENU · SAVE → "' + saved + '" · back → resume ' + closed };
  });
  await check('Back Button (game)', async function () {
    await ev(function () { startPlacing(BUILDINGS.house); }); await sleep(100);
    await ev(function () { window.bctOnBack(); }); const c1 = await ev(function () { return !UI.placing && $('mBuildBar').classList.contains('hidden'); });
    await ev(function () { openBuildSheet(); }); await ev(function () { window.bctOnBack(); }); const c2 = await ev(function () { return !MSHEET.open; });
    await ev(function () { openMobilePage('city'); }); await ev(function () { window.bctOnBack(); }); const c3 = await ev(function () { return !MPAGE.kind; });
    return { ok: c1 && c2 && c3, detail: 'cancel build ' + c1 + ' · close panel ' + c2 + ' · close page ' + c3 };
  });
  await check('Continue', async function () {
    await ev(function () { returnToMenu(); }); await sleep(700);
    await tapSel('#playBtn'); await sleep(900);
    const r = await ev(function () { closeModal(); clearDialogues(); return STARTED && S.city.name === 'MOBILE TEST' && document.body.classList.contains('inGame'); });
    return { ok: r, detail: 'EXIT TO MENU → CONTINUE → "MOBILE TEST"' };
  });
  await check('Rotation / resize', async function () {
    await page.setViewportSize({ width: dev.h, height: dev.w }); await sleep(450);
    const p = await ev(function () { return { portrait: RESP.portrait, msg: !!document.getElementById('mRotateMsg') && !document.getElementById('mRotateMsg').classList.contains('hidden'), pref: GSET.orientation }; });
    await page.setViewportSize({ width: dev.w, height: dev.h }); await sleep(450);
    const l = await ev(function () { return { portrait: RESP.portrait, msg: !!document.getElementById('mRotateMsg') && !document.getElementById('mRotateMsg').classList.contains('hidden') }; });
    const okRot = dev.portrait ? true : (p.portrait && (p.msg || dev.w >= 900) && !l.msg);
    return { ok: okRot, detail: 'turned → ' + (p.msg ? 'PLEASE ROTATE YOUR DEVICE' : 'responsive layout') + ' · turned back → layout restored' };
  });
  await ctx.close();
  return { device: dev, results: results, errors: errors.slice(0, 20) };
}

(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const exe = fs.existsSync('/opt/pw-browsers/chromium') && !process.env.CI ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const report = { started: new Date().toISOString(), devices: [] };
  let fail = 0, total = 0;
  for (const dev of DEVICES) {
    if (ONLY && ONLY.indexOf(dev.id) < 0) continue;
    console.log('▶ ' + dev.name + ' — ' + dev.w + '×' + dev.h + ' CSS px');
    let r;
    try { r = await runDevice(browser, base, dev); } catch (e) { r = { device: dev, results: [{ name: 'crash', ok: false, detail: e.message }], errors: [] }; }
    r.results.forEach(function (x) { total++; if (!x.ok) fail++; });
    if (r.errors.length) { console.log('  page errors: ' + r.errors.slice(0, 5).join(' | ')); }
    report.devices.push(r);
  }
  await browser.close(); srv.close();
  report.ok = fail === 0; report.passed = total - fail; report.total = total;
  /* Part 16: every failure as Test / Expected / Actual / Device / Resolution / Build / Commit */
  const build = require('../package.json').version, commit = String(process.env.GITHUB_SHA || (function () { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') }).toString().trim(); } catch (e) { return 'local'; } })()).slice(0, 10);
  report.build = build; report.commit = commit;
  report.failures = [];
  report.devices.forEach(function (r) { r.results.forEach(function (x) { if (x.ok) return; report.failures.push({ test: x.name, expected: 'the screen works and every element stays inside the safe area, touch targets ≥ 36 px and not covered', actual: x.detail, device: r.device.name, resolution: r.device.w + '×' + r.device.h + ' @' + r.device.dpr + (r.device.insets ? ' insets ' + r.device.insets.join('/') : ''), build: build, commit: commit }); }); });
  report.failures.forEach(function (f) { console.log('FAILURE\n  Test: ' + f.test + '\n  Expected: ' + f.expected + '\n  Actual: ' + f.actual + '\n  Device: ' + f.device + '\n  Resolution: ' + f.resolution + '\n  Build: ' + f.build + '\n  Commit: ' + f.commit); });
  fs.writeFileSync(path.join(OUT, 'mobile-ui-report.json'), JSON.stringify(report, null, 2));
  console.log('Mobile UI test: ' + (total - fail) + '/' + total + ' checks passed on ' + report.devices.length + ' screen sizes → ' + path.relative(process.cwd(), path.join(OUT, 'mobile-ui-report.json')));
  process.exit(fail ? 1 : 0);
})();
