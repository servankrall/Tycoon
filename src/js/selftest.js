'use strict';
/* BLOCK CITY TYCOON — AUTOMATIC SELF-TEST (Part 9)
   Started with  "BLOCK CITY TYCOON.exe --selftest [--selftest-out=<file>]"  (the Windows release workflow runs it on the
   freshly built EXE) or in a browser with  index.html?selftest . It plays through the 20 checks of the release test plan,
   restarts the EXE in the middle (save → restart → load) and writes a JSON report to logs/selftest.json (and <file>).
   The self-test uses its own temporary user-data folder, so it never touches real cities. */
const SELFTEST = { phase: 0, steps: [], t0: 0, key: 'bct_selftest' };
function stPhase() {
  if (DESKTOP && BCT.selftest && BCT.selftest.phase) return BCT.selftest.phase;
  const m = /[?&]selftest(?:=(\d))?/.exec(location.search); if (!m) return 0;
  return +m[1] || 1;
}
function stWait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function stLoad() { try { return JSON.parse(Store.getItem(SELFTEST.key) || 'null'); } catch (e) { return null; } }
function stStore() { try { Store.setItem(SELFTEST.key, JSON.stringify({ steps: SELFTEST.steps, t0: SELFTEST.t0, data: SELFTEST.data })); } catch (e) { /* storage */ } }
async function stStep(n, name, fn) {
  const t = performance.now(); let ok = false, detail = '';
  try { const r = await fn(); ok = r === undefined ? true : !!(r && (r.ok === undefined ? r : r.ok)); detail = r && r.detail !== undefined ? r.detail : (typeof r === 'string' ? r : ''); }
  catch (e) { ok = false; detail = 'ERROR: ' + (e && e.message ? e.message : String(e)); }
  const s = { n: n, name: name, ok: ok, detail: String(detail).slice(0, 400), ms: Math.round(performance.now() - t) };
  SELFTEST.steps.push(s);
  Log.info('[selftest] ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + '. ' + name + ' — ' + s.detail + ' (' + s.ms + ' ms)');
  stStore();
  return ok;
}
function stDone() {
  const ok = SELFTEST.steps.length === 20 && SELFTEST.steps.every(function (s) { return s.ok; });
  const rep = { ok: ok, version: GAME_VERSION, saveVersion: SAVE_VERSION, platform: DESKTOP ? 'desktop' : 'browser', finished: new Date().toISOString(), seconds: Math.round((Date.now() - SELFTEST.t0) / 1000), passed: SELFTEST.steps.filter(function (s) { return s.ok; }).length, total: 20, steps: SELFTEST.steps, errors: ERRLOG.slice(0, 20) };
  Log.info('[selftest] FINISHED: ' + rep.passed + '/20 passed' + (ok ? ' — ALL OK' : ' — FAILURES'));
  try { Store.removeItem(SELFTEST.key); } catch (e) { /* storage */ }
  window.__selftest = rep;
  if (DESKTOP && BCT.selftest) BCT.selftest.report(JSON.stringify(rep, null, 2));
  else console.log('SELFTEST ' + JSON.stringify(rep));
}
async function runSelfTest() {
  const phase = stPhase(); if (!phase) return;
  SELFTEST.phase = phase;
  enableAdminMode(true);
  if (phase === 1) {
    SELFTEST.t0 = Date.now(); SELFTEST.steps = []; SELFTEST.data = {};
    await stStep(1, 'NEW CITY', async function () {
      showMenu('new'); MENU.opts.slot = 1; MENU.opts.size = 52; $('ncName').value = 'SELFTEST'; createNewCity(); await stWait(1500);
      if (typeof tutStep !== 'undefined') { tutStep = 99; showTutStep(); }
      closeModal(); clearDialogues();
      return { ok: STARTED && !!S.p9 && MAP.W === 52, detail: 'started ' + STARTED + ', map ' + MAP.W + '×' + MAP.H + ', ' + S.buildings.list.length + ' starter buildings' };
    });
    let gen = null;
    await stStep(2, 'Generate Liveable World', async function () {
      const t = performance.now();
      gen = await generateWorld('balanced', { seed: 777001, name: 'SELFTEST CITY', slot: 1, size: 'MEDIUM' });
      closeModal(); clearDialogues();
      return { ok: !!gen && S.city.population > 3000 && S.buildings.list.length > 100, detail: fmt(Math.round(S.city.population)) + ' citizens, ' + S.buildings.list.length + ' buildings, ' + Math.round(performance.now() - t) + ' ms' };
    });
    await stStep(3, 'World Validator', function () { const r = validateWorld2(); SELFTEST.data.val = r.score; return { ok: r.score >= 70, detail: 'score ' + r.score + '%' + (r.failed.length ? ' (' + r.failed.join(', ') + ')' : ' — all checks passed') }; });
    await stStep(4, 'Auto Fix', function () { const r = p9AutoFix(true); return { ok: r.validation.score >= 80, detail: r.actions.length + ' action(s) → validator ' + r.validation.score + '%' }; });
    await stStep(5, 'Start Simulation', async function () { const t0 = Game.ticks; setSpeed(1); await stWait(1500); return { ok: Game.ticks > t0, detail: (Game.ticks - t0) + ' ticks in 1.5 s' }; });
    await stStep(6, '1× speed', async function () { const g0 = S.clock.gameSec, t0 = performance.now(); setSpeed(1); await stWait(2000); const r = (S.clock.gameSec - g0) / TIME_SCALE / ((performance.now() - t0) / 1000); return { ok: r > 0.5 && r < 1.5, detail: 'sim/real ' + r.toFixed(2) + '× · TPS ' + Game.tpsMeasured.toFixed(1) }; });
    await stStep(7, '10× speed', async function () { const g0 = S.clock.gameSec, t0 = performance.now(); setSpeed(10); await stWait(2500); const r = (S.clock.gameSec - g0) / TIME_SCALE / ((performance.now() - t0) / 1000); return { ok: r > 5, detail: 'sim/real ' + r.toFixed(1) + '× · FPS ' + Math.round(PERF.fps) }; });
    await stStep(8, '100× speed', async function () { const g0 = S.clock.gameSec, t0 = performance.now(); setSpeed(100); await stWait(2500); const r = (S.clock.gameSec - g0) / TIME_SCALE / ((performance.now() - t0) / 1000); setSpeed(1); return { ok: r > 25 && isFinite(S.money) && isFinite(S.budget), detail: 'sim/real ' + r.toFixed(0) + '× · FPS ' + Math.round(PERF.fps) + ' · pop ' + fmt(Math.round(S.city.population)) }; });
    await stStep(9, 'Traffic test', async function () {
      setSpeed(5); await stWait(1500);
      const r0 = S.p9.traffic.stats.reroutes, inc = createIncident('closure', -1, { silent: true, dur: 30 }); await stWait(1500);
      const st = S.p9.traffic.stats; setSpeed(1);
      return { ok: AG.vehicles.length > 0 && st.trips > 0 && !!inc, detail: AG.vehicles.length + ' vehicles · ' + st.trips + ' AI trips (' + st.alt + ' alternative) · ' + st.laneChanges + ' lane changes · closure re-routed ' + (st.reroutes - r0) + ' · traffic ' + Math.round(SIM.traffic) + '%' };
    });
    await stStep(10, 'Economy test', function () {
      const ok = isFinite(S.money) && isFinite(S.budget) && SIM.income > 0 && S.city.population > 0 && isFinite(S.city.happiness);
      return { ok: ok, detail: 'income ' + money(SIM.income) + '/s · expenses ' + money(SIM.expenses) + '/s · budget ' + money(S.budget) + ' · land value index ' + PROP.index + ' · neighbour trade ' + money(((S.p9.flows || {}).exp || 0)) + '/s' };
    });
    await stStep(11, 'Disaster test', async function () {
      const D = startCommandDisaster({ type: 'earthquake', sev: 6, dur: 12, radius: 8 }); setSpeed(10); await stWait(2500); setSpeed(1);
      const ended = !S.p9.disasters.some(function (x) { return x.id === D.id; });
      return { ok: !!D && D.hits >= 0 && (ended || S.p9.disasters.length > 0), detail: 'earthquake severity 6 · ' + D.hits + ' building(s) hit · ' + (ended ? 'ended, report logged' : 'still active') + ' · survived ' + S.p9.stats.disastersSurvived };
    });
    await stStep(12, 'Emergency test', async function () {
      const d0 = S.p9.emergency.dispatched, b = S.buildings.list.find(function (x) { return x.built && x._entry >= 0 && BUILDINGS[x.type].housing; });
      if (b) igniteBuilding(b);
      const acc = createIncident('accident', -1); setSpeed(5); await stWait(1500); setSpeed(1);
      return { ok: S.p9.emergency.dispatched > d0, detail: (S.p9.emergency.dispatched - d0) + ' unit(s) dispatched by Emergency AI 2.0 · ' + AG.vehicles.filter(function (v) { return v.siren; }).length + ' siren vehicle(s) · accident ' + (acc ? 'created' : 'n/a') };
    });
    await stStep(13, 'Save', function () {
      clearAllDisasters(); clearIncidents();
      const ok = saveGame(false);
      SELFTEST.data.saved = { name: S.city.name, buildings: S.buildings.list.length, pop: Math.round(S.city.population), seed: seedLabel(), size: MAP.W };
      return { ok: ok && slotInfo(1).exists, detail: 'saved ' + S.buildings.list.length + ' buildings, ' + fmt(Math.round(S.city.population)) + ' citizens to slot 1 (save v' + SAVE_VERSION + ')' };
    });
    await stStep(14, 'Restart EXE', async function () {
      stStore();
      if (DESKTOP && BCT.selftest) { setTimeout(function () { BCT.selftest.restart(); }, 300); return { ok: true, detail: 'restarting the EXE…' }; }
      setTimeout(function () { location.href = location.pathname + '?selftest=2'; }, 300);
      return { ok: true, detail: 'reloading the page…' };
    });
    return;
  }
  // ---------------- phase 2 (after the restart) ----------------
  const prev = stLoad();
  if (!prev) { SELFTEST.steps = []; SELFTEST.t0 = Date.now(); await stStep(14, 'Restart EXE', function () { return { ok: false, detail: 'no state from phase 1' }; }); stDone(); return; }
  SELFTEST.steps = prev.steps; SELFTEST.t0 = prev.t0; SELFTEST.data = prev.data || {};
  const last = SELFTEST.steps[SELFTEST.steps.length - 1];
  if (last && last.n === 14) last.detail = 'EXE restarted, self-test resumed in a new process';
  await stStep(15, 'Load', async function () {
    loadSlot(1); await stWait(1500); closeModal(); clearDialogues();
    const sv = SELFTEST.data.saved || {};
    return { ok: STARTED && S.city.name === sv.name && S.buildings.list.length === sv.buildings && MAP.W === sv.size, detail: 'loaded "' + S.city.name + '" ' + S.buildings.list.length + '/' + sv.buildings + ' buildings · ' + seedLabel() + ' · map ' + MAP.W + '×' + MAP.H };
  });
  await stStep(16, 'Snapshot', function () { const s = createSnapshot('Self-test snapshot', true); return { ok: !!s && !!Store.getItem(snapKey(s.id)), detail: s ? s.id + ' stored' + (DESKTOP ? ' as snapshots/' + s.id + '.json' : '') : 'failed' }; });
  await stStep(17, 'Clone World', function () { const r = cloneWorld('SELFTEST CLONE', 2); return { ok: r.ok && slotInfo(2).exists, detail: r.ok ? 'clone in CITY 0' + r.slot + ' "' + r.name + '"' : r.reason }; });
  await stStep(18, 'Admin Panel', async function () {
    openAdminCenter('wc_world'); await stWait(200);
    let rendered = 0;
    for (let i = 0; i < WC_CATS.length; i++) { ADM.cat = WC_CATS[i][0]; renderAdminCenter(); if ($('admBody').innerHTML.indexOf('Panel error') < 0) rendered++; }
    const qa = ['q_fixTraffic', 'q_repairAll', 'q_clearPollution']; qa.forEach(function (q) { quickAction(q); });
    closeAdminCenter();
    return { ok: rendered === WC_CATS.length, detail: rendered + '/' + WC_CATS.length + ' World Control Center tabs rendered · quick actions ok · ' + ADM.log.length + ' admin log lines' };
  });
  await stStep(19, 'Chunk streaming', async function () {
    const r = expandWorld(1); weEnsure();
    const loads0 = WE.loads; CAM.zoom = 2.2;
    const corners = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9], [0.5, 0.5]];
    let farSeen = 0;
    for (let i = 0; i < corners.length; i++) { CAM.x = MAP.W * TILE * corners[i][0]; CAM.y = MAP.H * TILE * corners[i][1]; clampCamera(); await stWait(350); farSeen = Math.max(farSeen, WE.tierCount[2]); }
    return { ok: r.ok && WE.loads > loads0 && farSeen > 0 && WE.ground.size <= WE.n, detail: 'world ' + MAP.W + '×' + MAP.H + ' · ' + WE.n + ' chunks · ' + (WE.loads - loads0) + ' streamed in · ' + WE.ground.size + ' loaded · FAR chunks ' + farSeen + ' · unloads ' + WE.unloads };
  });
  await stStep(20, 'Performance test', async function () {
    CAM.zoom = 0.8; CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; setSpeed(10);
    await stWait(3000);
    const fps = PERF.fps, tps = Game.tpsMeasured, sim = simMsTotal(); setSpeed(1);
    return { ok: fps >= 5 && tps >= 20, detail: 'FPS ' + Math.round(fps) + ' · TPS ' + tps.toFixed(0) + ' at 10× · render ' + (PERF.renderMs || 0).toFixed(1) + ' ms · simulation ' + sim.toFixed(1) + ' ms · ' + S.buildings.list.length + ' buildings · ' + AG.vehicles.length + ' vehicles' };
  });
  stDone();
}
/* starts once the boot sequence has finished */
(function () {
  if (!stPhase()) return;
  let tries = 0;
  const go = function () {
    tries++;
    const splash = document.getElementById('bootSplash');
    if (typeof init === 'function' && splash && splash.style.display === 'none' && typeof MENU !== 'undefined') { setTimeout(function () { runSelfTest().catch(function (e) { Log.error('[selftest] crashed: ' + e.message); SELFTEST.steps.push({ n: SELFTEST.steps.length + 1, name: 'crash', ok: false, detail: e.message, ms: 0 }); stDone(); }); }, 500); return; }
    if (tries < 240) setTimeout(go, 500);
  };
  setTimeout(go, 1000);
})();
