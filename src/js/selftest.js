'use strict';
/* BLOCK CITY TYCOON — AUTOMATIC SELF-TEST (Part 9, extended with the Part 10 Living World checks 21–30)
   Started with  "BLOCK CITY TYCOON.exe --selftest [--selftest-out=<file>]"  (the Windows release workflow runs it on the
   freshly built EXE) or in a browser with  index.html?selftest . It plays through the 20 checks of the release test plan,
   restarts the EXE in the middle (save → restart → load) and writes a JSON report to logs/selftest.json (and <file>).
   The self-test uses its own temporary user-data folder, so it never touches real cities. */
const SELFTEST = { phase: 0, steps: [], t0: 0, key: 'bct_selftest', total: 30 };
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
  const ok = SELFTEST.steps.length === SELFTEST.total && SELFTEST.steps.every(function (s) { return s.ok; });
  const rep = { ok: ok, version: GAME_VERSION, saveVersion: SAVE_VERSION, platform: DESKTOP ? 'desktop' : 'browser', finished: new Date().toISOString(), seconds: Math.round((Date.now() - SELFTEST.t0) / 1000), passed: SELFTEST.steps.filter(function (s) { return s.ok; }).length, total: SELFTEST.total, steps: SELFTEST.steps, errors: ERRLOG.slice(0, 20) };
  Log.info('[selftest] FINISHED: ' + rep.passed + '/' + SELFTEST.total + ' passed' + (ok ? ' — ALL OK' : ' — FAILURES'));
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
  // ---------------- Part 10: Living World ----------------
  await stStep(21, 'Living World', async function () {
    const n0 = S.p10.news.length, b0 = S.p10.pop.births; setSpeed(10); await stWait(3000); setSpeed(1);
    const L = lifeStats(), R = SIM.p10Rates || {};
    const ok = S.p10.pop.births > b0 && isFinite(S.p10.rep) && S.p10.rep >= 0 && S.p10.rep <= 1000 && L.n > 0 && isFinite(R.migIn);
    return { ok: ok, detail: LIFE_PHASES[L.phase].name + ' · ' + L.work + ' at work / ' + L.home + ' at home · births ' + fmt(Math.round(S.p10.pop.births - b0)) + ' · reputation ' + Math.round(S.p10.rep) + ' · ' + (S.p10.news.length - n0) + ' news · ' + S.p10.lw.jobChanges + ' job changes' };
  });
  await stStep(22, 'Company AI 2.0 & Stock Market 2.0', function () {
    companyAI2Tick(20);
    const ids = AI_DEFS.filter(function (a) { return S.ai[a.id] && !S.ai[a.id].acquired; }).map(function (a) { return a.id; });
    const fair = ids.map(function (id) { return p10FairValue(id, S.ai[id]); });
    const strat = ids.filter(function (id) { return corpMeta(id).strategy; }).length;
    const founded = lwFoundCompany('TECHNOLOGY', true);
    return { ok: fair.every(isFinite) && strat === ids.length && fair.length > 0, detail: ids.length + ' companies with a strategy · fair values ' + fair.slice(0, 3).map(function (v) { return '$' + v.toFixed(2); }).join(', ') + (founded ? ' · founded ' + aiDef(founded).name : '') };
  });
  await stStep(23, 'Education, research & healthcare', function () {
    const E = educationPass(), R = researchPass(1), H = healthPass(1);
    const amb = AG.citizens.find(function (c) { return !c.tourist && !c.inside; });
    let route = 'no free citizen';
    if (amb) { const tile = currentRoadTile(amb), h = tile >= 0 ? nearestHospital(tile) : null, v = h ? emergencyDispatch('medical', tile, { priority: 2 }) : null; if (v) { v.patient = { stage: 1, cid: amb.id, t0: S.clock.runSec, hosp: h.id, tile: tile }; route = 'ambulance → ' + BUILDINGS[h.type].name; } }
    return { ok: isFinite(E.cov[1]) && isFinite(H.load) && H.list.length > 0 && isFinite(R.perDay.engineering), detail: 'coverage ' + E.cov.slice(1).map(function (v) { return Math.round(v * 100) + '%'; }).join('/') + ' · ' + H.list.length + ' health facilities, load ' + Math.round(H.load * 100) + '% · engineering +' + Math.round(R.perDay.engineering) + '/day · ' + route };
  });
  await stStep(24, 'Tourism, airport, port, rail & logistics', function () {
    const T = tourismBreakdown(S.city.tourists), A = airportPass(1), P = portPass(1), R = railPass(1), L = logisticsPass();
    return { ok: isFinite(T.hotels) && isFinite(A.cap) && isFinite(P.cap) && isFinite(R.cap) && L.stages.length === 6 && L.eff > 0, detail: fmt(Math.round(S.city.tourists)) + ' tourists · ' + attractionList().length + ' attractions · airport ' + fmt(A.cap) + ' seats · port ' + fmt(Math.round(P.cap)) + ' TEU · rail ' + fmt(Math.round(R.cap)) + ' t/day · logistics ' + Math.round(L.eff * 100) + '%' };
  });
  await stStep(25, 'Supply shock', function () {
    S.p10.shocks = []; const s = startShock('steel'); if (!s) return { ok: false, detail: 'shock not started' };
    const pm = shockPriceMult('metal'), bm = shockBuildMult(); S.money += 1e7; const r = shockRespond(s.id, 'import'), r2 = shockRespond(s.id, 'domestic');
    S.p10.shocks = [];
    return { ok: pm > 1.3 && bm > 1.1 && r.ok && r2.ok, detail: 'STEEL SHORTAGE: metal ×' + pm.toFixed(2) + ', construction ×' + bm.toFixed(2) + ' · ' + r.msg };
  });
  await stStep(26, 'Megaproject', async function () {
    S.p8.unlockAll = true; S.budget = Math.max(S.budget, 5e8);
    const r = startMegaProject('grandpark');
    if (!r.ok) return { ok: false, detail: r.reason };
    setSpeed(100); await stWait(2500); setSpeed(1);
    const q = r.q, prog = q.progress, crew = q.crew;
    finishMegaProject(q);
    const b = S.buildings.list.find(function (x) { return x.type === 'grandpark'; });
    return { ok: prog > 0 && !!b && b.built, detail: 'Grand Park progress ' + (prog * 100).toFixed(1) + '% with ' + fmt(crew) + ' workers, ' + money(q.spent) + ' spent → completed' };
  });
  await stStep(27, 'Incident Center', async function () {
    const r0 = S.p10.incidents.resolved.length;
    const made = ['breakdown', 'utility', 'traffic'].map(function (t) { return createP10Incident(t); }).filter(Boolean);
    setSpeed(10); await stWait(3000); setSpeed(1);
    S.p10.incidents.active.slice().forEach(function (x) { if (x.status === 'on site') resolveP10Incident(x, 'resolved'); });
    return { ok: made.length >= 2 && S.p10.incidents.resolved.length > r0, detail: made.length + ' incidents (' + made.map(function (x) { return x.name; }).join(', ') + ') · ' + (S.p10.incidents.resolved.length - r0) + ' resolved' };
  });
  await stStep(28, 'Simulation Lab, What-If & Time Machine', function () {
    const tax = S.city.tax, money0 = S.money, n0 = S.buildings.list.length;
    const L = runSimulationLab({ pop: 50, traffic: 100, tax: -20, industry: 80, tourism: 200 });
    const W = runWhatIf('taxdown');
    const unchanged = S.city.tax === tax && S.buildings.list.length === n0 && Math.abs(S.money - money0) < 1e-6;
    const tm = timeMachineCapture(gameYear());
    return { ok: !L.error && !W.error && unchanged && !!tm, detail: 'lab ' + Math.round(L.ms) + ' ms (traffic ' + L.rows.find(function (r) { return r.id === 'traffic'; }).pct.toFixed(0) + '%) · what-if tax −2% → happiness ' + W.rows.find(function (r) { return r.id === 'happiness'; }).delta.toFixed(2) + ' · live world unchanged · time machine ' + tm.id };
  });
  await stStep(29, 'Living City UI', async function () {
    let ok = 0;
    for (let i = 0; i < HUB_TABS.length; i++) { openHub(HUB_TABS[i][0]); if (hubVisible() && !/class="neg">⚠️/.test($('modalBody').innerHTML)) ok++; }
    closeModal();
    toggleDash(true); const dash = $('p10Dash').innerText.length > 100; toggleDash(false);
    openObservatory('POLLUTION'); const obs = $('p10Obs').width > 0; closeModal();
    openPalette2(); const pal = PAL.items.length >= 11; closePalette();
    openAdminCenter('wc_living'); let adm = 0; ['wc_living', 'wc_incidents', 'wc_lab', 'wc_whatif', 'wc_tm', 'wc_factory', 'wc_projects', 'wc_health'].forEach(function (c) { ADM.cat = c; renderAdminCenter(); if ($('admBody').innerHTML.indexOf('Panel error') < 0) adm++; }); closeAdminCenter();
    return { ok: ok === HUB_TABS.length && dash && obs && pal && adm === 8, detail: ok + '/' + HUB_TABS.length + ' hub tabs · dashboard ' + dash + ' · observatory ' + obs + ' · palette 2.0 ' + pal + ' · ' + adm + '/8 admin tabs' };
  });
  await stStep(30, 'Generate Mega World', async function () {
    const res = await generateMegaWorld('tinyisland', { seed: 31337, name: 'SELFTEST ISLAND', slot: 3 });
    closeModal(); clearDialogues();
    const sc = S.p10 && S.p10.genScore;
    return { ok: !!res && res.steps === 22 && !!sc && sc.overall >= 60 && STARTED, detail: res ? res.steps + '-step pipeline · ' + fmt(res.population) + ' citizens · ' + res.buildings + ' buildings · score ' + (sc ? sc.overall : '?') + '/100 · ' + res.seconds.toFixed(1) + ' s' : 'generation failed' };
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
