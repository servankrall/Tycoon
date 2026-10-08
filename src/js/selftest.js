'use strict';
/* BLOCK CITY TYCOON — AUTOMATIC SELF-TEST (Part 9, extended with Part 10/11 checks and the Part 12 cross-platform test)
   Windows EXE: 53 steps (Part 12: admin security / authentication / panel / logout / auto-lock, cross-platform save,
   save + snapshot + version migration, performance modes, gamepad, settings). Android APK: 21 steps (APK launch, splash,
   new city, touch camera, zoom, building, road building, save, restart, continue, load, performance mode, admin
   authentication / panel / logout / auto lock, native back button, screen rotation, native gamepad, Windows save → Android,
   save migration). Admin rights come from an isolated one-time realm created by the platform shell for this test only.
   Started with  "BLOCK CITY TYCOON.exe --selftest [--selftest-out=<file>]"  (the Windows release workflow runs it on the
   freshly built EXE) or in a browser with  index.html?selftest . It plays through the 20 checks of the release test plan,
   restarts the EXE in the middle (save → restart → load) and writes a JSON report to logs/selftest.json (and <file>).
   The self-test uses its own temporary user-data folder, so it never touches real cities. */
const SELFTEST = { phase: 0, steps: [], t0: 0, key: 'bct_selftest', total: 53, running: false };
function stPhase() {
  if (DESKTOP && BCT.selftest && BCT.selftest.phase) return BCT.selftest.phase;
  if (IS_ANDROID_APP && ANDROID_INFO.selftest) return ANDROID_INFO.selftestPhase || 1;
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
  const rep = { ok: ok, version: GAME_VERSION, saveVersion: SAVE_VERSION, platform: PLATFORM_ID + (DESKTOP ? ' (desktop app)' : IS_ANDROID_APP ? ' (Android app)' : ' (browser)'), build: BUILD.profile, finished: new Date().toISOString(), seconds: Math.round((Date.now() - SELFTEST.t0) / 1000), passed: SELFTEST.steps.filter(function (s) { return s.ok; }).length, total: SELFTEST.total, steps: SELFTEST.steps, errors: ERRLOG.slice(0, 20) };
  Log.info('[selftest] FINISHED: ' + rep.passed + '/' + SELFTEST.total + ' passed' + (ok ? ' — ALL OK' : ' — FAILURES'));
  try { Store.removeItem(SELFTEST.key); } catch (e) { /* storage */ }
  window.__selftest = rep;
  stInputBlocker(false);
  if (DESKTOP && BCT.selftest) BCT.selftest.report(JSON.stringify(rep, null, 2));
  else if (IS_ANDROID_APP && ANDROID_INFO.selftest) { BCTA.selftestReport(JSON.stringify(rep)); console.log('SELFTEST ' + JSON.stringify({ ok: rep.ok, passed: rep.passed, total: rep.total })); }
  else console.log('SELFTEST ' + JSON.stringify(rep));
}
async function runSelfTest() {
  const phase = stPhase(); if (!phase) return;
  SELFTEST.phase = phase; SELFTEST.running = true;
  stInputBlocker(true);
  const auth = await AdminAuth.selftestLogin();           // isolated self-test realm (EXE / APK) or harness credentials (browser)
  if (!auth.ok) Log.warn('[selftest] admin login failed: ' + auth.reason);
  if (IS_ANDROID) return runAndroidSelfTest(phase);
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
      setTimeout(function () { location.href = location.pathname + stSearch(2); }, 300);
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
  // ---------------- Part 11: Advanced city simulation, transport AI & deep economy ----------------
  await stStep(30, 'Build metro', function () {
    S.p8.unlockAll = true; S.budget = Math.max(S.budget, 5e8);
    const l0 = metroEngine().lines.length; adminCmd11('aBuildMetro'); const E = metroEngine();
    return { ok: E.lines.length > l0 && E.stations.length >= 2 && E.lines.every(function (l) { return isFinite(l.cap) && l.cap > 0; }), detail: E.lines.length + ' metro line(s) · ' + E.stations.length + ' stations · ' + E.lines.map(function (l) { return l.name + ' ' + l.stations + ' st, headway ' + l.headway.toFixed(1) + ' min'; }).join(' · ') };
  });
  await stStep(31, 'Build railway & regional trains', function () {
    adminCmd11('aRailway'); const R = regionalRail(), on = R.filter(function (r) { return r.on; }).length;
    const tr = S.p9.transit.lines.filter(function (l) { return l.mode === 'train'; });
    return { ok: tr.length > 0 && on > 0, detail: tr.length + ' rail line(s) · regional trains to ' + on + '/' + R.length + ' neighbour cities · ' + fmt(Math.round(R.reduce(function (a, r) { return a + r.pax; }, 0))) + ' passengers/day' };
  });
  await stStep(32, 'Trade route & contract', function () {
    const T = tradeRoutes(), best = T.filter(function (r) { return r.best; });
    const c = signContract('player', contractPartners()[0].id, 'food', 'sell', 300, 1);
    tradeContractsTick(5);
    return { ok: best.length > 0 && c.ok && isFinite(SIM.p11TradeCost || 0), detail: best.length + ' trade routes · ' + best.slice(0, 2).map(function (r) { return r.name + ' via ' + r.best.mode; }).join(', ') + ' · ' + (c.ok ? c.msg : c.reason) };
  });
  await stStep(33, 'Company, bank & loan', function () {
    adminCmd11('aBank'); adminCmd11('aSpawnCo');
    const co = AI_DEFS.find(function (a) { return S.ai[a.id] && !S.ai[a.id].acquired; }).id;
    const r = companyBorrow(co, 50000, 10), B = bankPass(); loansTick(1);
    return { ok: r.ok && B.banks.length > 0 && interestRate() >= 0.01 && isFinite(bankruptcyRisk(co)), detail: (r.ok ? r.msg : r.reason) + ' · ' + B.banks.length + ' bank(s), liquidity ' + Math.round(B.liquidity * 100) + '% · interest ' + (interestRate() * 100).toFixed(2) + '% · bankruptcy risk ' + Math.round(bankruptcyRisk(co) * 100) + '%' };
  });
  await stStep(34, 'Housing market & mortgages', function () {
    householdsTick(true); const M = mortgagePass(), H = housingMarket(), R = rentalByRegion(), C = commercialMarket();
    return { ok: M.owners + M.renters > 0 && H.length > 0 && isFinite(M.avgPrice), detail: Math.round(M.ownerShare * 100) + '% owners · avg price ' + money(M.avgPrice) + ' · mortgage ' + money(M.avgPayment) + '/month · ' + H.length + ' housing districts · ' + R.length + ' rental regions · ' + C.length + ' commercial units' };
  });
  await stStep(35, 'Utility grid, storage & smart grid', function () {
    adminCmd11('uBattery'); adminCmd11('uFill'); adminCmd11('uSensors'); sensorTick();
    const G = smartGrid(), N = sensorNet(), W = wasteFlows();
    return { ok: G.cap > 0 && N.hubs.length > 0 && isFinite(G.gen), detail: 'storage ' + Math.round(G.stored) + '/' + Math.round(G.cap) + ' MWh · ' + N.hubs.length + ' sensor hubs (' + Math.round(N.coverage * 100) + '% coverage) · green share ' + Math.round(greenShare() * 100) + '% · waste ' + fmt(Math.round(W.total || 0)) + ' t' };
  });
  await stStep(36, 'Predictive maintenance & risk map', function () {
    predSample(); predSample(); const P = predictions(), M = maintenancePredictions(), RG = p11RiskGrid('fire');
    return { ok: Array.isArray(P) && Array.isArray(M) && RG && RG.length === MAP.W * MAP.H, detail: P.length + ' predictions · ' + M.length + ' maintenance forecasts' + (P[0] ? ' · "' + P[0].text + '"' : '') };
  });
  await stStep(37, 'Transport AI 2.0', async function () {
    const L = S.p11.lights, r0 = L.retimes; adminCmd11('aSpawnEm'); adminCmd11('aOptimize'); adminCmd11('aRecalc');
    setSpeed(10); await stWait(3000); setSpeed(1);
    const m = S.p11.modal;
    return { ok: L.retimes > r0 && m.trips >= 0 && isFinite(m.car), detail: (L.retimes - r0) + ' signal retimes · ' + L.transitPrio + ' transit priorities · ' + L.corridors + ' emergency corridors · modal split walk ' + Math.round(m.walk * 100) + '% / bike ' + Math.round(m.bike * 100) + '% / car ' + Math.round(m.car * 100) + '% / transit ' + Math.round(m.transit * 100) + '% · walkability ' + Math.round(walkPass().avg) };
  });
  await stStep(38, 'Budget 2.0, forecast & financial health', function () {
    const b = budget2(), f = budgetForecast(), h = financialHealth();
    return { ok: isFinite(b.net) && isFinite(f.in5) && h.score >= 0 && h.score <= 100, detail: 'income ' + money(b.totalIn) + '/s · expenses ' + money(b.totalOut) + '/s · 5-year forecast ' + money(f.in5) + ' (risk ' + f.risk + ') · FINANCIAL HEALTH ' + h.score + '/100' };
  });
  await stStep(39, 'Part 11 UI', async function () {
    let hub = 0; const tabs = ['transport3', 'finance', 'budget2', 'smart', 'buildings3', 'green'];
    tabs.forEach(function (t) { openHub(t); if (hubVisible() && !/class="neg">⚠️/.test($('modalBody').innerHTML)) hub++; }); closeModal();
    const cats = ['wc_tr', 'wc_ec', 'wc_bc', 'wc_uc', 'wc_cc', 'wc_co', 'wc_tu', 'wc_sc', 'wc_dc', 'wc_cl', 'wc_td', 'wc_fi', 'wc_wd'];
    openAdminCenter('wc_tr'); let adm = 0; cats.forEach(function (c) { ADM.cat = c; renderAdminCenter(); if ($('admBody').innerHTML.indexOf('Panel error') < 0) adm++; }); closeAdminCenter();
    let book = 0; BOOK_CH.forEach(function (c) { openCityBook(c[0]); if ($('modalBody').innerText.length > 30) book++; }); closeModal();
    const found = p11EntitySearch('hospital').length;
    const o = buildSaveObject(), errs = validateSaveObject(o);
    return { ok: hub === tabs.length && adm === cats.length && book === BOOK_CH.length && !errs.length && !!o.p11, detail: hub + '/' + tabs.length + ' hub tabs · ' + adm + '/' + cats.length + ' admin sections · City Book ' + book + '/' + BOOK_CH.length + ' chapters · search "hospital" → ' + found + ' · save v' + o.version + ' valid' };
  });
  await part12DesktopSteps();
  await stStep(53, 'Generate Mega World', async function () {
    const res = await generateMegaWorld('tinyisland', { seed: 31337, name: 'SELFTEST ISLAND', slot: 3 });
    closeModal(); clearDialogues();
    const sc = S.p10 && S.p10.genScore;
    return { ok: !!res && res.steps === 22 && !!sc && sc.overall >= 60 && STARTED, detail: res ? res.steps + '-step pipeline · ' + fmt(res.population) + ' citizens · ' + res.buildings + ' buildings · score ' + (sc ? sc.overall : '?') + '/100 · ' + res.seconds.toFixed(1) + ' s' : 'generation failed' };
  });
  stDone();
}
/* ===================================== Part 12 helpers ===================================== */
function stSearch(phase) { const p = (location.search.match(/[?&]platform=\w+/) || [''])[0].replace('?', '&'); return '?selftest=' + phase + p; }
/* The player can't touch the game while the automatic test runs (synthetic test events are not blocked) */
function stInputBlocker(on) {
  let el = document.getElementById('stBlock');
  if (on && !el) {
    el = document.createElement('div'); el.id = 'stBlock';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:transparent;pointer-events:all;';
    el.innerHTML = '<div style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.65);color:#7fffd4;font:11px monospace;padding:4px 8px;border-radius:6px">SELF-TEST RUNNING — input disabled</div>';
    document.body.appendChild(el);
    window.addEventListener('keydown', stKeyBlock, true); window.addEventListener('keyup', stKeyBlock, true);
  } else if (!on && el) { el.remove(); window.removeEventListener('keydown', stKeyBlock, true); window.removeEventListener('keyup', stKeyBlock, true); }
}
function stKeyBlock(e) { if (e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); } }
function stKey(key, mods) { window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))); }
/* synthetic touch pointers on the game canvas (setPointerCapture needs a real pointer, so it is stubbed meanwhile) */
function stPtr(type, id, x, y) { canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); }
async function stTouch(fn) { const spc = canvas.setPointerCapture; canvas.setPointerCapture = function () { }; try { return await fn(); } finally { canvas.setPointerCapture = spc; INPUT.pointers.clear(); INPUT.down = null; INPUT.pinch = null; MOB.rot = null; } }
async function stDrag(id, x0, y0, x1, y1, n) { stPtr('pointerdown', id, x0, y0); for (let i = 1; i <= (n || 8); i++) { stPtr('pointermove', id, x0 + (x1 - x0) * i / (n || 8), y0 + (y1 - y0) * i / (n || 8)); await stWait(16); } stPtr('pointerup', id, x1, y1); }
function stDenied() {
  const m0 = S.money, b0 = S.budget, open0 = ADM.open;
  adminDo('maxMoney'); quickAction('q_treasury'); runAdminCommand('giveMoney 999999'); adminCmd11('aMaxFunds'); p10Do('heal'); openAdminCenter('wc_econ'); renderAdmin();
  return S.money === m0 && S.budget === b0 && !ADM.open && !open0;
}
/* a save of this city as another platform wrote it (header + origin), sealed with a fresh checksum */
function stForeignSave(platform) {
  saveGame(true);
  const o = JSON.parse(Store.getItem(slotKey(S.slot || 1)));
  o.header.platform = platform; o.origin.platform = platform; o.origin.lastPlatform = platform; o.header.checksum = CHECKSUM_PLACEHOLDER;
  return sealSaveJson(JSON.stringify(o));
}
function stAsV11(o) { o.version = 11; delete o.origin; if (o.header) { o.header.saveVersion = 11; o.header.version = 11; delete o.header.format; delete o.header.checksum; } return o; }
function stFreeRoadRun(len) {
  const cx = Math.floor(MAP.W / 2), cy = Math.floor(MAP.H / 2);
  for (let r = 2; r < Math.max(MAP.W, MAP.H) / 2; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    let ok = true; for (let k = 0; k < len && ok; k++) ok = inMap(x + k, y) && canRoad(x + k, y) && !MAP.roads[idx(x + k, y)];
    if (ok) return { x: x, y: y };
  }
  return null;
}
function stFreeBuildSpot(d) {
  const cx = Math.floor(MAP.W / 2), cy = Math.floor(MAP.H / 2);
  for (let r = 1; r < Math.max(MAP.W, MAP.H) / 2; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (canPlace(fpDef(d, 0), x, y).ok) return { x: x, y: y };
  return null;
}

/* ===================================== Part 12: Windows / desktop steps 40–51 ===================================== */
async function part12DesktopSteps() {
  await stStep(40, 'Admin security — normal player', async function () {
    AdminAuth.logout('self-test: normal player check');
    stKey('F10'); await stWait(100);
    const f10 = !ADM.open && !document.getElementById('admLogin');
    const denied = stDenied();
    S.p5.admin.god = true; S.p5.admin.instant = true; enforceAdminState();
    const saveEdit = !S.p5.admin.god && !S.p5.admin.instant;
    GSET.adminEnabled = true; const setting = !adminModeEnabled(); GSET.adminEnabled = false;
    const imp = importSave(JSON.stringify(Object.assign(JSON.parse(stForeignSave(PLATFORM_ID)), { admin: true })));
    const pal = p10PaletteCommands().every(function (c) { return !/Generate World|Unlock Everything|World Control Center/.test(c.label); });
    stKey('F10', { ctrlKey: true, shiftKey: true }); await stWait(100);
    const login = !!document.getElementById('admLogin'); closeAdminLogin();
    const ok = f10 && denied && saveEdit && setting && !imp.ok && pal && login;
    return { ok: ok, detail: 'F10 → nothing ' + f10 + ' · commands DENIED ' + denied + ' · save edit (god mode) removed ' + saveEdit + ' · settings flag ignored ' + setting + ' · "admin": true save rejected ' + !imp.ok + ' · no admin in palette ' + pal + ' · Ctrl+Shift+F10 → ADMIN ACCESS ' + login };
  });
  await stStep(41, 'Admin authentication', async function () {
    const w = []; for (let i = 0; i < 3; i++) { const r = await AdminAuth.login('owner', 'wrong-password-' + i); w.push(r.wait || 0); }
    const limited = w[2] > 0 && AdminAuth.waitLeft() > 0;
    Store.removeItem('bct_admin_guard');
    const r = await AdminAuth.selftestLogin(), i = AdminAuth.info() || {};
    const failedLogged = AdminAuth.securityLog().filter(function (e) { return e.event === 'LOGIN FAILED'; }).length >= 3;
    return { ok: limited && r.ok && i.role === 'OWNER' && failedLogged, detail: '3 wrong passwords → wait ' + Math.round(w[2] / 1000) + ' s (rate limit) · failures logged ' + failedLogged + ' · login ' + (r.ok ? 'OK as ' + i.role + ' (' + i.user + ', ' + i.platform + ', session expires ' + new Date(i.expiresAt).toLocaleTimeString() + ')' : r.reason) };
  });
  await stStep(42, 'Admin panel & permission matrix', async function () {
    openAdminCenter('wc_world'); await stWait(150);
    const groups = document.querySelectorAll('#admNavList .admNavGroup').length, tabs = Array.from(document.querySelectorAll('#admNavList [data-acat]')).map(function (b) { return b.dataset.acat; });
    let bad = 0; tabs.forEach(function (c) { ADM.cat = c; renderAdminCenter(); if ($('admBody').innerHTML.indexOf('Panel error') >= 0) bad++; });
    const m = [!roleAllows('ADMIN', 'generate'), roleAllows('ADMIN', 'city'), roleAllows('DEVELOPER', 'debug'), !roleAllows('DEVELOPER', 'city'), roleAllows('DEBUG', 'perf'), !roleAllows('DEBUG', 'debug'), !adminTabAllowed('DEBUG', 'wc_econ'), adminTabAllowed('DEBUG', 'wc_perf')];
    closeAdminCenter();
    return { ok: ADM.open === false && groups === 16 && bad === 0 && m.every(Boolean), detail: 'WORLD CONTROL CENTER: ' + groups + ' sections, ' + tabs.length + ' tabs rendered (' + bad + ' errors) · matrix OWNER/ADMIN/DEVELOPER/DEBUG ' + m.filter(Boolean).length + '/' + m.length + ' checks' };
  });
  await stStep(43, 'Admin action log & logout', async function () {
    quickAction('q_repairAll');
    const last = AdminAuth.actions().slice(-1)[0] || {};
    openAdminCenter(); S.p5.admin.god = true;
    AdminAuth.logout('self-test');
    const after = !AdminAuth.active() && !ADM.open && !S.p5.admin.god && stDenied();
    return { ok: last.cmd === 'q_repairAll' && /OK/.test(last.result) && after, detail: 'logged "' + last.cmd + '" by ' + last.user + ' (' + last.role + ') → ' + last.result + ' · LOG OUT: session cleared, panel closed, free build off, commands denied ' + after };
  });
  await stStep(44, 'Admin auto-lock', async function () {
    await AdminAuth.selftestLogin(); openAdminCenter(); const min = AdminAuth.lockMinutes();
    AdminAuth._testIdle((min + 1) * 60000); await stWait(5600);
    const locked = !AdminAuth.active() && !ADM.open && !!AdminAuth.lockedUser();
    const r = await AdminAuth.selftestLogin();
    return { ok: locked && r.ok, detail: 'inactive ' + (min + 1) + ' min → ADMIN PANEL LOCKED ' + locked + ' (re-authentication required) · signed in again ' + r.ok };
  });
  await stStep(45, 'Cross-platform save (Windows ⇄ Android)', function () {
    saveGame(true);
    const raw = Store.getItem(slotKey(S.slot || 1)), o = JSON.parse(raw), name0 = S.city.name, b0 = S.buildings.list.length;
    const fmtOk = o.header.format === 'CITY_SAVE_V4' && o.header.platform === PLATFORM_ID && !!o.header.cityId && o.settings.quality === undefined && saveIntegrity(raw) === 'ok';
    const r = importSave(stForeignSave('android'));
    const ok = fmtOk && r.ok && S.city.name === name0 && S.buildings.list.length === b0 && S.settings.quality === GSET.graphics;
    return { ok: ok, detail: 'CITY_SAVE_V4 header (platform ' + o.header.platform + ', city ' + o.header.cityId + ', revision ' + o.header.revision + ', checksum ' + saveIntegrity(raw) + ') · graphics settings not in the save ' + (o.settings.quality === undefined) + ' · Android save loaded on ' + PLATFORM_NAME + ': ' + (r.ok ? b0 + ' buildings, device graphics ' + S.settings.quality : r.errors.join('; ')) };
  });
  await stStep(46, 'Save migration v11 → v12 (backup → migrate → rollback)', async function () {
    saveGame(true);
    const o = stAsV11(JSON.parse(Store.getItem(slotKey(1))));
    Store.setItem(slotKey(3), JSON.stringify(o)); premigBackups(3).forEach(function (b) { Store.removeItem(b.key); });
    loadSlot(3); await stWait(600); closeModal(); clearDialogues();
    const migrated = STARTED && S.version === SAVE_VERSION && !!S.origin && S.slot === 3, backup = premigBackups(3)[0];
    const rb = rollbackMigration(3), back = JSON.parse(Store.getItem(slotKey(3)) || '{}');
    loadSlot(1); await stWait(600); closeModal(); clearDialogues();
    return { ok: migrated && !!backup && backup.v === 11 && rb.ok && back.version === 11 && S.slot === 1, detail: 'v11 save → loaded as v' + S.version + ' (' + (migrated ? 'migrated' : 'FAILED') + ') · BACKUP SAVE ' + (backup ? backup.key : 'missing') + ' · ROLLBACK → slot 3 is v' + back.version + ' again' };
  });
  await stStep(47, 'Snapshot migration', async function () {
    const snap = createSnapshot('Self-test v11 snapshot', true); if (!snap) return { ok: false, detail: 'snapshot failed' };
    Store.setItem(snapKey(snap.id), JSON.stringify(stAsV11(JSON.parse(Store.getItem(snapKey(snap.id))))));
    const name0 = S.city.name; rollbackSnapshot(snap.id); await stWait(300); closeModal(); clearDialogues();
    return { ok: S.city.name === name0 && S.version === SAVE_VERSION && !!S.origin, detail: snap.id + ' stored as v11 → rolled back and migrated to v' + S.version + ' ("' + S.city.name + '")' };
  });
  await stStep(48, 'Version migration (v7 → v12)', function () {
    const o = buildSaveObject(); o.version = 7; ['p8', 'p9', 'p10', 'p11', 'origin'].forEach(function (k) { delete o[k]; }); o.header = { version: 7, saveVersion: 7, gameVersion: '1.0.0', timestamp: new Date().toISOString() };
    const st = sanitizeState(migrateSave(o));
    return { ok: st.version === SAVE_VERSION && !!st.p11 && !!st.p10 && !!st.origin, detail: 'a 1.0.0 (v7) save passes every migration step → v' + st.version + ' with Part 8–12 data' };
  });
  await stStep(49, 'Performance modes, low-end mode & safe speed', function () {
    const pm = GSET.perfMode; GSET.perfMode = 'AUTO'; GSET.autoPerfLevel = ''; applyPerfMode();
    const auto = AUTOP.benchmark && QUALITY_ORDER.indexOf(S.settings.quality) >= 0;
    const n0 = perfPreset(QUALITY_PRESETS.HIGH).npc; GSET.lowEnd = true; GSET._rev++; const n1 = perfPreset(QUALITY_PRESETS.HIGH).npc; GSET.lowEnd = false; GSET._rev++;
    const fm = PERF.frameMs, sp = S.settings.speed; S.settings.speed = 100; PERF.frameMs = 250; for (let i = 0; i < 4; i++) safeSpeedTick(); const cap = SAFE.cap; PERF.frameMs = fm; S.settings.speed = sp; SAFE.cap = 100; GSET.perfMode = pm; saveGSET();
    return { ok: auto && n1 < n0 && cap < 100, detail: 'AUTO PERFORMANCE: benchmark ' + AUTOP.benchmark.score + ' → ' + S.settings.quality + ' · LOW-END MODE citizens ' + n0 + ' → ' + n1 + ' · SAFE SPEED LIMIT 100× → ' + cap + '× when frames take 250 ms' };
  });
  await stStep(50, 'Gamepad', function () {
    const x0 = CAM.x; PADN.t = 0;
    window.bctPadAxes(1, 0, 0, 0, 0, 0); pollGamepad(0.2); const moved = CAM.x > x0;
    window.bctPadKey(99, true); pollGamepad(0.016); const built = UI.panel === 'build'; window.bctPadKey(99, false); pollGamepad(0.016); closeLeft();
    window.bctPadAxes(0, 0, 0, 0, 0, 0); pollGamepad(0.016); PADN.t = 0;
    return { ok: moved && built && PAD.active, detail: 'controller connected · left stick moved the camera ' + Math.round(CAM.x - x0) + ' px · X → build menu ' + built + ' · mapping ' + Object.keys(GSET.padMap).length + ' actions' };
  });
  await stStep(51, 'Settings 2.0 & accessibility', function () {
    let ok = 0; SET2_TABS.forEach(function (t) { openSettings(t[0]); if ($('modalBody').innerText.length > 80 && $('modalBody').querySelector('.s2Tabs')) ok++; }); closeModal();
    const us = GSET.uiScale; GSET.uiScale = 115; applySettings2(); const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(); GSET.uiScale = us; applySettings2();
    return { ok: ok === SET2_TABS.length && v === '1.15', detail: ok + '/' + SET2_TABS.length + ' tabs (' + SET2_TABS.map(function (t) { return t[2]; }).join(', ') + ') · UI scale 115% applied' };
  });
  await stStep(52, 'Sandbox · Scenario · Continue · Citizen AI', async function () {
    saveGame(true); const home = S.slot || 1, name1 = S.city.name;
    deleteSlot(4); MENU.opts.slot = 4; showMenu('sandbox'); createSandbox(); await stWait(1200); closeModal(); clearDialogues();
    const sbx = STARTED && S.city.sandbox && S.slot === 4;
    deleteSlot(4); MENU.opts.slot = 4; showMenu('scenario'); $('scName').value = 'SELFTEST SCENARIO'; createScenario(); await stWait(1200); closeModal(); clearDialogues();
    const scn = STARTED && S.slot === 4 && S.city.name === 'SELFTEST SCENARIO';
    setSpeed(5); await stWait(2000); setSpeed(1);
    const states = {}; AG.citizens.forEach(function (c) { states[c.state] = (states[c.state] || 0) + 1; });
    const ai = AG.citizens.length > 0 && Object.keys(states).length >= 2;
    returnToMenu(); setActiveSlot(home); refreshMenuCity(home); await stWait(300);
    $('playBtn').click(); await stWait(1200); closeModal(); clearDialogues();
    const cont = STARTED && S.slot === home && S.city.name === name1;
    deleteSlot(4);
    return { ok: sbx && scn && ai && cont, detail: 'SANDBOX ' + sbx + ' · SCENARIO ' + scn + ' · Citizen AI ' + AG.citizens.length + ' agents in ' + Object.keys(states).length + ' states (' + Object.keys(states).slice(0, 4).join(', ') + ') · CONTINUE → "' + S.city.name + '" ' + cont };
  });
}

/* ===================================== Part 12: Android APK self-test (21 steps) ===================================== */
async function runAndroidSelfTest(phase) {
  SELFTEST.total = 21;
  const native = IS_ANDROID_APP;
  if (phase === 1) {
    SELFTEST.t0 = Date.now(); SELFTEST.steps = []; SELFTEST.data = {};
    await stStep(1, 'APK Launch', function () {
      return { ok: IS_ANDROID && (!native || ANDROID_INFO.version === GAME_VERSION), detail: native ? 'BLOCK CITY TYCOON ' + ANDROID_INFO.version + ' (' + ANDROID_INFO.versionCode + ', ' + ANDROID_INFO.profile + ') on ' + ANDROID_INFO.model + ', Android ' + ANDROID_INFO.release + ' (API ' + ANDROID_INFO.sdk + '), ' + ANDROID_INFO.cores + ' cores, ' + Math.round(ANDROID_INFO.ramMB / 1024) + ' GB' : 'browser preview of the Android UI' };
    });
    await stStep(2, 'Splash', function () {
      const line = Log.lines.find(function (l) { return /Boot finished in/.test(l); }) || '';
      return { ok: $('bootSplash').style.display === 'none' || $('bootSplash').classList.contains('gone'), detail: 'BLOCK CITY TYCOON · Build. Manage. Expand. → ' + (line.split('] ')[1] || 'loaded') };
    });
    await stStep(3, 'New City', async function () {
      const g = await generateWorld('balanced', { seed: 515151, name: 'ANDROID CITY', slot: 1, size: 'SMALL' });
      closeModal(); clearDialogues(); if (typeof tutStep !== 'undefined') { tutStep = 99; showTutStep(); } const t = document.getElementById('mTut'); if (t) t.remove(); MOB.tut = null;
      S.budget = Math.max(S.budget, 2e6); S.money = Math.max(S.money, 2e6);
      return { ok: !!g && STARTED && S.city.population > 300 && !!MOB.hud, detail: fmt(Math.round(S.city.population)) + ' citizens · ' + S.buildings.list.length + ' buildings · mobile HUD ' + !!MOB.hud + ' · ' + window.innerWidth + '×' + window.innerHeight };
    });
    await stStep(4, 'Touch Camera', function () {
      return stTouch(async function () { const x0 = CAM.x, y0 = CAM.y; await stDrag(1, CW / 2, CH / 2, CW / 2 - 180, CH / 2 - 60); return { ok: Math.abs(CAM.x - x0) > 50, detail: 'one-finger drag moved the camera ' + Math.round(CAM.x - x0) + ' / ' + Math.round(CAM.y - y0) + ' world px' }; });
    });
    await stStep(5, 'Zoom (pinch) & rotate', function () {
      return stTouch(async function () {
        CAM.zoom = 1; const z0 = CAM.zoom, cx = CW / 2, cy = CH / 2;
        stPtr('pointerdown', 1, cx - 50, cy); stPtr('pointerdown', 2, cx + 50, cy); await stWait(30);
        for (let i = 1; i <= 8; i++) { stPtr('pointermove', 2, cx + 50 + i * 12, cy); stPtr('pointermove', 1, cx - 50 - i * 12, cy); await stWait(16); }
        const z1 = CAM.zoom;
        for (let i = 1; i <= 8; i++) { const a = i * 0.06, r = 146; stPtr('pointermove', 1, cx - r * Math.cos(a), cy - r * Math.sin(a)); stPtr('pointermove', 2, cx + r * Math.cos(a), cy + r * Math.sin(a)); await stWait(16); }
        stPtr('pointerup', 2, cx, cy); stPtr('pointerup', 1, cx, cy);
        const rot = CAM.rot; setCamRot(0);
        return { ok: z1 > z0 * 1.3 && Math.abs(rot) > 0.15, detail: 'pinch zoom ' + z0.toFixed(2) + ' → ' + z1.toFixed(2) + ' · two-finger rotate ' + Math.round(rot * 180 / Math.PI) + '° (↺ reset)' };
      });
    });
    await stStep(6, 'Building (BUILD · ROTATE · MOVE · CONFIRM)', async function () {
      const d = BUILDINGS.house || BUILDING_LIST.find(function (x) { return x.cat === 'Housing' && unlockStatus(x).ok; });
      const spot = stFreeBuildSpot(d); if (!spot) return { ok: false, detail: 'no free spot' };
      const n0 = S.buildings.list.length; startPlacing(d); await stWait(100);
      const bar = MOB.buildBar && !MOB.buildBar.classList.contains('hidden');
      MOB.buildBar.querySelector('[data-mb="move"]').click(); const mv = MOB.ghostMove; MOB.buildBar.querySelector('[data-mb="move"]').click();
      UI.ghost = { x: spot.x, y: spot.y }; renderBuildBar(); const checks = $('mbInfo').querySelectorAll('.mChk').length;
      MOB.buildBar.querySelector('[data-mb="confirm"]').click(); await stWait(100);
      MOB.buildBar.querySelector('[data-mb="cancel"]').click();
      return { ok: bar && mv && checks === 5 && S.buildings.list.length === n0 + 1, detail: d.name + ' placed at ' + spot.x + ',' + spot.y + ' · build bar ' + bar + ' · MOVE mode ' + mv + ' · ' + checks + ' checks (road, power, water, zone, terrain)' };
    });
    await stStep(7, 'Road Building (START → DRAG → END → CONFIRM)', function () {
      return stTouch(async function () {
        const run = stFreeRoadRun(5); if (!run) return { ok: false, detail: 'no free land for a road' };
        document.querySelector('[data-mbar="road"]').click(); await stWait(100);
        const sheet = MOB.roadSheet && !MOB.roadSheet.classList.contains('hidden');
        MOB.roadSheet.querySelector('[data-mroad="medium"]').click();
        const r0 = MAP.roads.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0);
        const a = worldToScreen((run.x + 0.5) * TILE, (run.y + 0.5) * TILE), b = worldToScreen((run.x + 4.5) * TILE, (run.y + 0.5) * TILE);
        await stDrag(1, a.x, a.y, b.x, b.y, 10); await stWait(80);
        const step = MOB.road.step, btn = MOB.roadSheet.querySelector('[data-mra="confirm"]');
        if (btn) btn.click(); await stWait(80);
        const r1 = MAP.roads.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0);
        const cl = MOB.roadSheet.querySelector('[data-mra="close"]'); if (cl) cl.click();
        return { ok: sheet && step === 3 && !!btn && r1 >= r0 + 4, detail: 'road builder ' + sheet + ' · Medium road · dragged 5 tiles → step ' + ['START', 'DRAG', 'END', 'CONFIRM'][Math.min(3, step)] + ' · ' + (r1 - r0) + ' road tiles built' };
      });
    });
    await stStep(8, 'Save', function () {
      const ok = saveGame(false);
      SELFTEST.data.saved = { name: S.city.name, buildings: S.buildings.list.length, size: MAP.W };
      let onDisk = true; if (native) { try { onDisk = !!JSON.parse(BCTA.storeLoadAll())[slotKey(1)]; } catch (e) { onDisk = false; } }
      return { ok: ok && onDisk, detail: 'saved ' + S.buildings.list.length + ' buildings · ' + (native ? 'file in the app\'s private storage (files/store)' : 'browser storage') + ' · ' + Math.round((S._saveBytes || 0) / 1024) + ' KB' };
    });
    await stStep(9, 'Restart APK', function () {
      stStore();
      if (native) { setTimeout(function () { BCTA.selftestRestart(); }, 300); return { ok: true, detail: 'restarting the app…' }; }
      setTimeout(function () { location.href = location.pathname + stSearch(2); }, 300);
      return { ok: true, detail: 'reloading…' };
    });
    return;
  }
  const prev = stLoad();
  if (!prev) { SELFTEST.steps = []; SELFTEST.t0 = Date.now(); await stStep(9, 'Restart APK', function () { return { ok: false, detail: 'no state from phase 1' }; }); stDone(); return; }
  SELFTEST.steps = prev.steps; SELFTEST.t0 = prev.t0; SELFTEST.data = prev.data || {};
  const last = SELFTEST.steps[SELFTEST.steps.length - 1]; if (last && last.n === 9) last.detail = native ? 'app restarted (new activity, WebView and storage re-read)' : 'page reloaded';
  const sv = SELFTEST.data.saved || {};
  if (PSH && PSH.dialogOpen) closeSysDialog();          // the restart leaves the session flag 'open' → recovery prompt; the test continues the saved city
  await stStep(10, 'Continue', async function () {
    $('playBtn').click(); await stWait(1500); closeModal(); clearDialogues(); const t = document.getElementById('mTut'); if (t) t.remove(); MOB.tut = null;
    return { ok: STARTED && S.city.name === sv.name && S.buildings.list.length === sv.buildings, detail: 'CONTINUE → "' + S.city.name + '" ' + S.buildings.list.length + '/' + sv.buildings + ' buildings' };
  });
  await stStep(11, 'Load', async function () {
    loadSlot(1); await stWait(800); closeModal(); clearDialogues();
    return { ok: STARTED && S.city.name === sv.name && MAP.W === sv.size, detail: 'loaded "' + S.city.name + '" · map ' + MAP.W + '×' + MAP.H + ' · save v' + S.version + ' · ' + (S.origin ? 'city ' + S.origin.id + ' rev ' + S.origin.revision : '') };
  });
  await stStep(12, 'Performance Mode', async function () {
    GSET.perfMode = 'AUTO'; GSET.autoPerfLevel = ''; applyPerfMode();
    const q = S.settings.quality, therm = Platform.thermal();
    GSET.lowEnd = true; GSET._rev++; applyPerfMode(); const low = S.settings.quality; GSET.lowEnd = false; GSET._rev++; GSET.autoPerfLevel = ''; applyPerfMode(); saveGSET();
    const g0 = S.clock.gameSec, t0 = performance.now(); setSpeed(100); await stWait(2500); const r = (S.clock.gameSec - g0) / TIME_SCALE / ((performance.now() - t0) / 1000); setSpeed(1);
    return { ok: !!AUTOP.benchmark && QUALITY_ORDER.indexOf(q) >= 0 && low === 'LOW' && r > 5, detail: 'AUTO → ' + q + ' (benchmark ' + AUTOP.benchmark.score + ', thermal ' + therm + ') · LOW-END → ' + low + ' · 100× → ' + r.toFixed(0) + '× real (safe limit ' + SAFE.cap + '×) · FPS ' + Math.round(PERF.fps) };
  });
  await stStep(13, 'Admin Authentication', async function () {
    AdminAuth.logout('self-test');
    const denied = stDenied() && !document.querySelector('[data-menu="admin"]');
    openSettings('system'); await stWait(100);
    const v = document.getElementById('setVersion'); for (let i = 0; i < 7 && v; i++) v.click();
    const login = !!document.getElementById('admLogin'); closeAdminLogin(); closeModal();
    const r = await AdminAuth.selftestLogin();
    return { ok: denied && login && r.ok && AdminAuth.role() === 'OWNER', detail: 'normal player: no admin UI, commands DENIED ' + denied + ' · 7 taps on the version → ADMIN ACCESS ' + login + ' · login ' + (r.ok ? 'OK (' + AdminAuth.role() + ')' : r.reason) };
  });
  await stStep(14, 'Admin Panel', async function () {
    openAdminCenter('wc_world'); await stWait(150);
    const groups = document.querySelectorAll('#admNavList .admNavGroup').length, tabs = Array.from(document.querySelectorAll('#admNavList [data-acat]')).map(function (b) { return b.dataset.acat; });
    let bad = 0; tabs.forEach(function (c) { ADM.cat = c; renderAdminCenter(); if ($('admBody').innerHTML.indexOf('Panel error') >= 0) bad++; });
    const pill = !!document.getElementById('admPill'); closeAdminCenter();
    return { ok: groups === 16 && bad === 0 && pill, detail: groups + ' sections · ' + tabs.length + ' tabs rendered (' + bad + ' errors) · admin pill visible only when signed in ' + pill };
  });
  await stStep(15, 'Admin Logout', function () {
    openAdminCenter(); AdminAuth.logout('self-test');
    return { ok: !AdminAuth.active() && !ADM.open && !document.getElementById('admPill') && stDenied(), detail: 'session cleared · panel closed · pill hidden · commands denied' };
  });
  await stStep(16, 'Admin Auto Lock', async function () {
    await AdminAuth.selftestLogin(); openAdminCenter(); AdminAuth._testIdle((AdminAuth.lockMinutes() + 1) * 60000); await stWait(5600);
    const locked = !AdminAuth.active() && !ADM.open;
    return { ok: locked, detail: 'idle ' + (AdminAuth.lockMinutes() + 1) + ' min → ADMIN PANEL LOCKED ' + locked };
  });
  await stStep(17, 'Back Button', async function () {
    const press = async function () { if (native) BCTA.selftestNativeBack(); else window.bctOnBack(); await stWait(700); };
    openSettings(); await stWait(100); await press(); const closed = !$('modalWrap').classList.contains('show');
    await press(); const pause = $('modalWrap').classList.contains('show') || (PSH && PSH.dialogOpen);
    await press(); const back = !$('modalWrap').classList.contains('show');
    return { ok: closed && pause && back, detail: (native ? 'Android back key (MainActivity.onBackPressed)' : 'back handler') + ': closes Settings ' + closed + ' · opens the pause menu ' + pause + ' · closes it again ' + back };
  });
  await stStep(18, 'Screen Rotation', async function () {
    if (!native) return { ok: true, detail: 'browser preview: orientation is controlled by the Android app (portrait / landscape layouts are covered by the UI tests)' };
    const wait = async function (cond) { for (let i = 0; i < 40 && !cond(); i++) await stWait(150); return cond(); };
    Platform.setOrientation('portrait'); const p = await wait(function () { return window.innerHeight > window.innerWidth; }); const pw = window.innerWidth + '×' + window.innerHeight;
    Platform.setOrientation('landscape'); const l = await wait(function () { return window.innerWidth > window.innerHeight; }); const lw = window.innerWidth + '×' + window.innerHeight;
    applyOrientation();
    return { ok: p && l, detail: 'portrait ' + pw + ' ' + p + ' → landscape ' + lw + ' ' + l + ' (canvas and HUD re-laid out)' };
  });
  await stStep(19, 'Gamepad', async function () {
    PADN.t = 0; PAD.active = false;
    if (native) BCTA.selftestNativePad(); else { window.bctPadKey(96, true); setTimeout(function () { window.bctPadKey(96, false); }, 100); }
    await stWait(500); pollGamepad(0.016);
    return { ok: PADN.t > 0 && PAD.active, detail: (native ? 'native controller event (KEYCODE_BUTTON_A via MainActivity.dispatchKeyEvent)' : 'controller event') + ' → game gamepad layer · connected ' + PAD.active };
  });
  await stStep(20, 'Windows Save → Android', function () {
    const t = stForeignSave('windows'), b0 = S.buildings.list.length, r = importSave(t);
    return { ok: r.ok && S.buildings.list.length === b0 && S.settings.quality === GSET.graphics, detail: 'save written on Windows (CITY_SAVE_V4, checksum ' + saveIntegrity(t) + ') loaded on Android: ' + (r.ok ? b0 + ' buildings, Android graphics kept (' + S.settings.quality + ')' : r.errors.join('; ')) };
  });
  await stStep(21, 'Save Migration', function () {
    saveGame(true);
    const o = stAsV11(JSON.parse(Store.getItem(slotKey(1))));
    Store.setItem(slotKey(3), JSON.stringify(o)); premigBackups(3).forEach(function (b) { Store.removeItem(b.key); });
    const res = loadGame(3), migrated = S.version === SAVE_VERSION && !!S.origin, backup = premigBackups(3)[0], rb = rollbackMigration(3);
    loadSlot(1);
    return { ok: !res.isNew && migrated && !!backup && rb.ok, detail: 'v11 save → v' + SAVE_VERSION + ' with BACKUP SAVE ' + (backup ? backup.key : 'missing') + ' · ROLLBACK ' + rb.ok };
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
