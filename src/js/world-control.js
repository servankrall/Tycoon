'use strict';
/* BLOCK CITY TYCOON — WORLD CONTROL CENTER (Part 9)
   Part 9 state & master tick, timeline / city history, world achievements 2.0, world challenge generator,
   disaster command center, world validator 2.0 (continuous) + auto fix, world health 2.0, smart advisor 2.0
   (analysis → cause → solution → cost → expected result → APPLY), world snapshots 2.0 with branching timelines,
   city cloning, entity inspector, world brush, region selector, quick actions and the World Control Center tabs
   inside the F10 admin panel (admin mode must be enabled in Settings or with Ctrl+Alt+F10). */

/* ===================================== STATE (S.p9) ===================================== */
function newP9(seed) {
  return {
    ver: 1, foundedYear: 2026,
    neighbors: newNeighbors(seed), flows: null,
    traffic: { lightAI: true, routeMode: 'smart', mult: 1, junctions: {}, incidents: [], nextId: 1, stats: { trips: 0, alt: 0, laneChanges: 0, reroutes: 0, incidents: 0, preempt: 0 }, lastChoice: null },
    transit: { lines: [], nextId: 1, sig: {}, boardings: 0 },
    emergency: { dispatched: 0, log: [], etaSum: 0, etaN: 0 },
    households: [],
    prop: { brush: {} },
    maint: { budget: 1, threshold: 60, jobs: 0, spent: 0, dispatched: 0, failures: 0 },
    util: { infinitePower: false, infiniteWater: false, overloadUntil: 0, failures: [], fixSewageUntil: 0 },
    water: { stored: 0, capacity: 0, breaks: [], breakCount: 0 },
    env: { wind: { dir: 0.6, speed: 0.12 }, polBrush: {}, soilChunks: [] },
    weather: { type: 'clear', until: 0 },
    disasters: [], disasterLog: [], nextDis: 1,
    timeline: [], history: [], firsts: {},
    challenges: [], nextCh: 1,
    branch: { id: 'original', name: 'Original Timeline', parent: '', from: '' },
    freeze: { traffic: false, citizens: false, weather: false, buildings: false },
    validator: { auto: true, last: null, lastFailed: [] },
    stats: { worldsBuilt: 0, noBlackout: 0, noWaterShort: 0, disastersSurvived: 0, bestTourists: 0, regionsAdded: 0, seenDis: {} },
    chunks: [], regions: [], autoSnap: true, econ: { priceMult: 1, growthMult: 1, wageMult: 1 }
  };
}
function sanitizeP9(src, seed) {
  const p = newP9(seed);
  if (!src || typeof src !== 'object') return p;
  const str = function (v, n) { return String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').slice(0, n || 60); };
  p.foundedYear = num(src.foundedYear, 2026, 1800, 3000) | 0;
  if (Array.isArray(src.neighbors)) src.neighbors.forEach(function (n) { const q = p.neighbors.find(function (x) { return n && x.id === n.id; }); if (!q) return; q.pop = num(n.pop, q.pop, 1000, 1e9); q.gdp = num(n.gdp, q.gdp, 0, 1e15); q.rel = num(n.rel, q.rel, 0, 100); q.phase = num(n.phase, 0, 0, 1e6); q.totalTrade = num(n.totalTrade, 0, 0, 1e18); });
  const t = src.traffic || {};
  p.traffic.lightAI = t.lightAI !== false; p.traffic.routeMode = ROUTE_MODES[t.routeMode] ? t.routeMode : 'smart'; p.traffic.mult = num(t.mult, 1, 0.1, 5);
  if (t.junctions && typeof t.junctions === 'object') for (const k in t.junctions) if (/^\d{1,6}$/.test(k) && JUNCTION_TYPES[t.junctions[k]]) p.traffic.junctions[k] = t.junctions[k];
  p.traffic.nextId = num(t.nextId, 1, 1, 1e9) | 0;
  if (Array.isArray(t.incidents)) p.traffic.incidents = t.incidents.slice(0, 20).filter(function (i) { return i && INCIDENT_TYPES[i.type] && i.type !== 'accident' && Array.isArray(i.tiles); }).map(function (i) { return { id: str(i.id, 12), type: i.type, tile: num(i.tile, -1) | 0, tiles: i.tiles.slice(0, 80).map(function (x) { return num(x, -1) | 0; }), start: num(i.start, 0), until: num(i.until, 0), sev: num(i.sev, 1, 1, 10), crew: !!i.crew }; });
  if (t.stats && typeof t.stats === 'object') Object.keys(p.traffic.stats).forEach(function (k) { p.traffic.stats[k] = num(t.stats[k], 0, 0, 1e12); });
  const tr = src.transit || {};
  p.transit.nextId = num(tr.nextId, 1, 1, 1e9) | 0; p.transit.boardings = num(tr.boardings, 0, 0, 1e12);
  if (Array.isArray(tr.lines)) p.transit.lines = tr.lines.slice(0, 16).filter(function (L) { return L && TRANSIT_MODES[L.mode] && Array.isArray(L.stops); }).map(function (L) { return { id: str(L.id, 12), mode: L.mode, name: str(L.name, 40), color: /^#[0-9a-f]{6}$/i.test(L.color) ? L.color : TRANSIT_MODES[L.mode].color, stops: L.stops.slice(0, 16).map(function (x) { return num(x, 0) | 0; }), vehicles: clamp(num(L.vehicles, 1) | 0, 1, 8), auto: L.auto !== false, boardings: num(L.boardings, 0, 0, 1e12), pax: 0 }; });
  if (tr.sig && typeof tr.sig === 'object') for (const k in tr.sig) if (TRANSIT_MODES[k]) p.transit.sig[k] = str(tr.sig[k], 2000);
  const em = src.emergency || {};
  p.emergency.dispatched = num(em.dispatched, 0, 0, 1e12); p.emergency.etaSum = num(em.etaSum, 0, 0, 1e15); p.emergency.etaN = num(em.etaN, 0, 0, 1e12);
  if (Array.isArray(em.log)) p.emergency.log = em.log.slice(0, 25).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { kind: str(x.kind, 16), unit: str(x.unit, 30), from: str(x.from, 40), eta: num(x.eta, 0, 0, 1e6), busy: !!x.busy, prio: num(x.prio, 1, 0, 9), day: num(x.day, 1) | 0, hour: num(x.hour, 0) | 0, where: str(x.where, 40) }; });
  if (Array.isArray(src.households)) p.households = src.households.slice(0, 400).filter(function (h) { return h && typeof h === 'object'; }).map(function (h) { return { home: num(h.home, 0) | 0, size: num(h.size, 1, 1, 9) | 0, inc: num(h.inc, 0, 0, 1e9), exp: num(h.exp, 0, 0, 1e9), t: ['car', 'transit', 'walk'].indexOf(h.t) >= 0 ? h.t : 'walk', sat: num(h.sat, 50, 0, 100) }; });
  if (src.prop && src.prop.brush && typeof src.prop.brush === 'object') { let n = 0; for (const k in src.prop.brush) { if (n++ > 6000) break; if (/^\d{1,6}$/.test(k)) p.prop.brush[k] = num(src.prop.brush[k], 0, -0.8, 3); } }
  const m = src.maint || {};
  p.maint.budget = num(m.budget, 1, 0, 2); p.maint.threshold = num(m.threshold, 60, 10, 95); ['jobs', 'spent', 'dispatched', 'failures'].forEach(function (k) { p.maint[k] = num(m[k], 0, 0, 1e15); });
  const u = src.util || {};
  p.util.infinitePower = !!u.infinitePower; p.util.infiniteWater = !!u.infiniteWater; p.util.overloadUntil = num(u.overloadUntil, 0, 0, 1e12); p.util.fixSewageUntil = num(u.fixSewageUntil, 0, 0, 1e12);
  if (Array.isArray(u.failures)) p.util.failures = u.failures.slice(0, 20).filter(function (f) { return f && isFinite(f.x); }).map(function (f) { return { x: num(f.x, 0), y: num(f.y, 0), r: num(f.r, 2, 0, 80), until: num(f.until, 0), cause: str(f.cause, 20) }; });
  const w = src.water || {};
  p.water.stored = num(w.stored, 0, 0, 1e9); p.water.capacity = num(w.capacity, 0, 0, 1e9); p.water.breakCount = num(w.breakCount, 0, 0, 1e9);
  if (Array.isArray(w.breaks)) p.water.breaks = w.breaks.slice(0, 30).filter(function (b) { return b && isFinite(b.tile); }).map(function (b) { return { tile: num(b.tile, -1) | 0, at: num(b.at, 0) }; });
  const e = src.env || {};
  if (e.wind) { p.env.wind.dir = num(e.wind.dir, 0.6, -1e6, 1e6); p.env.wind.speed = num(e.wind.speed, 0.12, 0.02, 0.4); }
  if (e.polBrush && typeof e.polBrush === 'object') { let n = 0; for (const k in e.polBrush) { if (n++ > 6000) break; if (/^\d{1,6}$/.test(k)) p.env.polBrush[k] = num(e.polBrush[k], 0, -5, 20); } }
  if (Array.isArray(e.soilChunks)) p.env.soilChunks = e.soilChunks.slice(0, 200).map(function (v) { return num(v, 0, 0, 1); });
  if (src.weather) { p.weather.type = WEATHER_TYPES.indexOf(src.weather.type) >= 0 ? src.weather.type : 'clear'; p.weather.until = num(src.weather.until, 0, 0, 1e15); }
  if (Array.isArray(src.disasters)) p.disasters = src.disasters.slice(0, 6).filter(function (d) { return d && COMMAND_DISASTERS[d.type]; }).map(function (d) { return { id: str(d.id, 12), type: d.type, x: num(d.x, 0) | 0, y: num(d.y, 0) | 0, r0: num(d.r0, 4, 1, 60), r: num(d.r, 4, 1, 80), sev: num(d.sev, 5, 1, 10), dur: num(d.dur, 60, 5, 3600), start: num(d.start, 0), until: num(d.until, 0), spread: num(d.spread, 0, 0, 10), hits: num(d.hits, 0, 0, 1e6) | 0, hitIds: Array.isArray(d.hitIds) ? d.hitIds.slice(0, 400).map(function (x) { return num(x, 0) | 0; }) : [], tiles: Array.isArray(d.tiles) ? d.tiles.slice(0, 2000).map(function (x) { return num(x, -1) | 0; }) : [], cost: num(d.cost, 0, 0, 1e15) }; });
  if (Array.isArray(src.disasterLog)) p.disasterLog = src.disasterLog.slice(-15).filter(function (d) { return d && typeof d === 'object'; }).map(function (d) { return { name: str(d.name, 40), icon: str(d.icon, 6), day: num(d.day, 1) | 0, year: num(d.year, 1) | 0, hits: num(d.hits, 0) | 0, cost: num(d.cost, 0), sev: num(d.sev, 1) }; });
  p.nextDis = num(src.nextDis, 1, 1, 1e9) | 0; p.nextCh = num(src.nextCh, 1, 1, 1e9) | 0;
  if (Array.isArray(src.timeline)) p.timeline = src.timeline.slice(-200).filter(function (x) { return x && typeof x.text === 'string'; }).map(function (x) { return { y: num(x.y, 1, 1, 1e6) | 0, cy: num(x.cy, 2026, 1, 1e7) | 0, d: num(x.d, 1, 1, 1e9) | 0, icon: str(x.icon, 8), text: str(x.text, 140), kind: str(x.kind, 16) }; });
  if (Array.isArray(src.history)) p.history = src.history.slice(-200).map(function (x) { return str(x, 160); });
  if (src.firsts && typeof src.firsts === 'object') for (const k in src.firsts) if (/^[a-zA-Z0-9_]{1,30}$/.test(k)) p.firsts[k] = 1;
  if (Array.isArray(src.challenges)) p.challenges = src.challenges.slice(-12).filter(function (c) { return c && WCH_TEMPLATES[c.tpl]; }).map(function (c) { return { id: str(c.id, 12), tpl: c.tpl, objective: str(c.objective, 120), condition: str(c.condition, 120), target: num(c.target, 1, 0, 1e15), deadline: num(c.deadline, 0, 0, 1e15), limitYears: num(c.limitYears, 1, 0, 100), reward: { money: num(c.reward && c.reward.money, 0, 0, 1e12), rp: num(c.reward && c.reward.rp, 0, 0, 1e9) }, status: ['active', 'completed', 'failed'].indexOf(c.status) >= 0 ? c.status : 'active', base: num(c.base, 0, -1e15, 1e15), hold: num(c.hold, 0, 0, 1e12), count: num(c.count, 0, 0, 1e6), need: num(c.need, 1, 0, 1e15), extra: num(c.extra, 0, 0, 1e15), started: num(c.started, 0) }; });
  if (src.branch && typeof src.branch === 'object') p.branch = { id: str(src.branch.id, 24) || 'original', name: str(src.branch.name, 48) || 'Original Timeline', parent: str(src.branch.parent, 24), from: str(src.branch.from, 24) };
  if (src.freeze) Object.keys(p.freeze).forEach(function (k) { p.freeze[k] = !!src.freeze[k]; });
  if (src.validator) { p.validator.auto = src.validator.auto !== false; }
  const st = src.stats || {};
  ['worldsBuilt', 'noBlackout', 'noWaterShort', 'disastersSurvived', 'bestTourists', 'regionsAdded'].forEach(function (k) { p.stats[k] = num(st[k], 0, 0, 1e15); });
  p.autoSnap = src.autoSnap !== false;
  p.migratedGrid = !!src.migratedGrid;
  if (src.econ) { p.econ.priceMult = num(src.econ.priceMult, 1, 0.2, 5); p.econ.growthMult = num(src.econ.growthMult, 1, 0.1, 10); p.econ.wageMult = num(src.econ.wageMult, 1, 0.2, 5); }
  return p;
}

/* ===================================== MASTER TICK ===================================== */
function part9Tick(dt) {
  if (!S.p9) return;
  const P = S.p9, now = S.clock.runSec;
  P.util.failures = P.util.failures.filter(function (f) { return f.until > now; });
  if (P.migratedGrid && now > 1) {          // saves from 1.1.0 and earlier: the city gets the Part 9 networks it needs
    P.migratedGrid = false;
    const r = p9AutoFixUtilities();
    if (r) notify('🔌 Infrastructure upgraded to the Part 9 networks: ' + r + ' added by the city.', 'good');
    timelineAdd('🔌', 'Utility networks upgraded (power grid, water mains, sewers)', 'utility');
  }
  P._acc5 = (P._acc5 || 0) + dt;
  if (P._acc5 >= 5) { const d5 = P._acc5; P._acc5 = 0; neighborTick(d5); timelineTick(); weRegionStats(true); trackClassicDisasters(); }
  constructionLabourTick();
  propTick(false); householdsTick(false); envTick(false); waterNetPass(false); sewagePass(); reservoirTick(dt);
  maintenanceTick(dt); incidentTick(dt); weatherRiskTick(dt); disasterTick(dt); challengeTick2(dt); p9StatsTick(dt);
  P._accV = (P._accV || 0) + dt;
  if (P.validator.auto && P._accV >= 30) { P._accV = 0; validatorTick(); }
  P.weather.type = FX.weather; P.weather.until = FX.weatherUntil;
}
function p9StatsTick(dt) {
  const st = S.p9.stats;
  st.noBlackout = SIM.powerRatio >= 0.999 && !SIM.gridBrown && !SIM.gridNoConn ? st.noBlackout + dt : 0;
  st.noWaterShort = SIM.waterRatio >= 0.999 && (SIM.lowPressure || 0) < 0.05 ? st.noWaterShort + dt : 0;
  const t = S.city.tourists;
  if (t > 500 && t > st.bestTourists * 1.5) { if (st.bestTourists > 0) timelineAdd('🧳', 'Tourism reached record levels: ' + fmt(t) + ' visitors', 'tourism', 'Tourism reached record levels.'); st.bestTourists = t; }
  else if (t > st.bestTourists) st.bestTourists = t;
}
/* Called every animation frame (inspector refresh, brush hover) */
const P9F = { acc: 0 };
function p9FrameTick(dt) {
  P9F.acc += dt;
  if (P9F.acc >= 0.5) { P9F.acc = 0; if (EI.open) renderEntityInspector(); if (ADM.open) renderWorldStatusBar(); }
}
function p9OnBuilt(b) {
  const d = BUILDINGS[b.type]; if (!S.p9 || isAI(b) && !d.landmark) return;
  if (d.landmark || ['megamall', 'arcology', 'stadium', 'megastadium', 'airport', 'port', 'spacecenter', 'themepark'].indexOf(d.id) >= 0) timelineAdd(d.icon, d.name + ' built', 'landmark', 'The ' + d.name + ' was built.');
  if (d.id === 'metro' && countAny('metro') >= 2 && markP9First('metro')) timelineAdd('🚇', 'First metro line opened', 'transit', 'The first metro line opened.');
  if (d.id === 'tramstop' && countAny('tramstop') >= 2 && markP9First('tram')) timelineAdd('🚋', 'First tram line opened', 'transit', 'The first tram line opened.');
  if (d.id === 'substation' && markP9First('substation')) timelineAdd('🔌', 'First substation connected to the grid', 'utility');
}
/* A new, loaded, generated or expanded world: every Part 9 cache is rebuilt for the new map */
function p9MapReset() {
  envReset(); propReset(); HH.list = []; HH.stats = null; HH.at = -99;
  GRID.districts = []; GRID.subs = []; WNET.pres = null; WNET.key = ''; SEWER.districts = [];
  TRANSIT.pods = []; TRANSIT.legs.clear(); TRANSIT.ver = -1; JX.types.clear(); JX.sig.clear(); JX.ver = -1;
  WE.w = 0; WE.regions = []; ADV2.list = [];
  EI.ref = null; if (EI.open) closeInspector(); RS.rect = null; RS.drag = null; WB.on = false;
  if (typeof p10MapReset === 'function') p10MapReset();
  if (typeof p11MapReset === 'function') p11MapReset();
}
function markP9First(k) { if (S.p9.firsts[k]) return false; S.p9.firsts[k] = 1; return true; }

/* ===================================== TIMELINE & CITY HISTORY ===================================== */
function calendarYear() { return (S.p9 ? S.p9.foundedYear : 2026) + gameYear() - 1; }
function timelineAdd(icon, text, kind, story) {
  if (!S || !S.p9) return;
  const T = S.p9.timeline, last = T[T.length - 1];
  if (last && last.text === text && last.d === gameDay()) return;
  T.push({ y: gameYear(), cy: calendarYear(), d: gameDay(), icon: String(icon).slice(0, 8), text: String(text).slice(0, 140), kind: kind || 'event' });
  if (T.length > 200) T.shift();
  S.p9.history.push(String(story || (text.replace(/\.$/, '') + '.')).slice(0, 160));
  if (S.p9.history.length > 200) S.p9.history.shift();
}
const POP_MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1e6, 1e7, 1e8];
function timelineTick() {
  const P = S.p9, pop = S.city.population;
  if (!P.timeline.length) timelineAdd('🏛️', 'City founded', 'founded', 'Your city was founded in ' + P.foundedYear + '.');
  POP_MILESTONES.forEach(function (m) { if (pop >= m && markP9First('pop' + m)) timelineAdd('👥', 'Population ' + fmt(m), 'population', 'Population reached ' + fmt(m) + '.'); });
  let hw = false; for (let i = 0; i < MAP.roads.length && !hw; i++) if (MAP.roads[i] === 4) hw = true;
  if (hw && markP9First('highway')) timelineAdd('🛣️', 'First highway', 'roads', 'The first highway opened.');
  if (pop >= 25000 && markP9First('megacity')) timelineAdd('🌆', 'Megacity Era', 'era', 'The city entered the Megacity Era.');
  const ind = S.buildings.list.filter(function (b) { const c = BUILDINGS[b.type].cat; return (c === 'Industry' || c === 'Resources') && b.built; }).length;
  [10, 25, 50, 100].forEach(function (n) { if (ind >= n && markP9First('ind' + n)) timelineAdd('🏭', 'Industry expanded to ' + n + ' plants', 'industry', 'Industry expanded.'); });
  if (S.p9.transit.lines.some(function (L) { return L.mode === 'metro'; }) && markP9First('metro')) timelineAdd('🚇', 'First metro line opened', 'transit', 'The first metro line opened.');
}
function trackClassicDisasters() {
  const seen = S.p9.stats.seenDis || (S.p9.stats.seenDis = {});
  const act = {};
  S.events.active.forEach(function (a) { if (a.kind === 'disaster') { const k = a.id + '@' + Math.round(a.start); act[k] = 1; if (!seen[k]) { seen[k] = 1; const D = DISASTERS.find(function (x) { return x.id === a.id; }); timelineAdd(D ? D.icon : '⚠️', 'Major ' + (D ? D.name.toLowerCase() : a.id), 'disaster', 'A ' + (D ? D.name.toLowerCase() : 'disaster') + ' struck the city.'); } } });
  Object.keys(seen).forEach(function (k) { if (!act[k]) { delete seen[k]; S.p9.stats.disastersSurvived++; challengeEvent('disaster'); } });
}
function cityHistoryHtml() {
  const H = S.p9.history;
  return H.length ? '<ol class="p9Hist">' + H.slice(-40).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '<p class="small">No history yet — it is written automatically as the city grows.</p>';
}
function timelineHtml() {
  const by = {};
  S.p9.timeline.forEach(function (e) { (by[e.y] = by[e.y] || []).push(e); });
  const ys = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
  return ys.length ? '<div class="p9Time">' + ys.map(function (y) { return '<div class="p9Year"><b>YEAR ' + y + '</b> <span class="small">(' + by[y][0].cy + ')</span>' + by[y].map(function (e) { return '<div class="p9Ev">' + e.icon + ' ' + esc(e.text) + ' <span class="small">· day ' + e.d + '</span></div>'; }).join('') + '</div>'; }).join('') + '</div>' : '<p class="small">The timeline starts when the city is founded.</p>';
}

/* ===================================== WORLD ACHIEVEMENTS 2.0 ===================================== */
function mainCompShare() { const rc = mainRoadComp(); const L = S.buildings.list.filter(function (b) { return !bdef(b).noRoad; }); return L.length ? L.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length / L.length : 1; }
ACHIEVEMENTS.push(
  { id: 'w_builder', name: 'World Builder', icon: '🌍', desc: 'Generate a world or open a new region.', check: function () { return !!(S.p9 && (S.p9.stats.worldsBuilt > 0 || S.p9.stats.regionsAdded > 0 || (S.p8 && S.p8.world))); } },
  { id: 'w_master', name: 'City Master', icon: '🎖️', desc: 'Reach city level 15.', check: function () { return cityLevel() >= 15; } },
  { id: 'w_mega', name: 'Megacity', icon: '🌆', desc: 'Reach 100,000 citizens.', check: function () { return S.city.population >= 100000; } },
  { id: 'w_traffic', name: 'Traffic Master', icon: '🚦', desc: 'Traffic under 25% with 20,000+ citizens and Traffic Light AI on.', check: function () { return !!S.p9 && S.p9.traffic.lightAI && S.city.population >= 20000 && SIM.traffic < 25; } },
  { id: 'w_econ', name: 'Economy Master', icon: '💹', desc: 'Positive company and budget balance with 10,000+ citizens and $10M in the bank.', check: function () { return S.city.population >= 10000 && (SIM.pNet || 0) > 0 && (SIM.bNet || 0) > 0 && S.money >= 1e7; } },
  { id: 'w_green', name: 'Green City', icon: '🌿', desc: 'Clean air (under 10% pollution) with 10,000+ citizens.', check: function () { return S.city.population >= 10000 && S.city.pollution < 10 && (!envReady() || envSummary().air < 0.12); } },
  { id: 'w_industry', name: 'Industrial Power', icon: '🏭', desc: 'Run 40 industrial plants.', check: function () { return S.buildings.list.filter(function (b) { return BUILDINGS[b.type].cat === 'Industry' && b._op; }).length >= 40; } },
  { id: 'w_tour', name: 'Tourism Capital', icon: '🧳', desc: 'Welcome 5,000 tourists at once.', check: function () { return S.city.tourists >= 5000; } },
  { id: 'w_tech', name: 'Tech Capital', icon: '💻', desc: 'Run 10 tech campuses / data centers.', check: function () { return S.buildings.list.filter(function (b) { return (b.type === 'techcampus' || b.type === 'datacenter') && b._op; }).length >= 10; } },
  { id: 'w_noblack', name: 'Zero Blackout', icon: '⚡', desc: 'One hour of simulated time without any blackout (5,000+ citizens).', check: function () { return !!S.p9 && S.city.population >= 5000 && S.p9.stats.noBlackout >= 3600; } },
  { id: 'w_nowater', name: 'Zero Water Shortage', icon: '💧', desc: 'One hour without water shortage or low pressure (5,000+ citizens).', check: function () { return !!S.p9 && S.city.population >= 5000 && S.p9.stats.noWaterShort >= 3600; } },
  { id: 'w_roads', name: '100% Road Connectivity', icon: '🛣️', desc: 'Every one of 100+ buildings on one road network.', check: function () { return S.buildings.list.length >= 100 && mainCompShare() >= 1; } },
  { id: 'w_1m', name: '1 Million Citizens', icon: '🏙️', desc: 'Reach 1,000,000 citizens.', check: function () { return S.city.population >= 1e6; } },
  { id: 'w_10m', name: '10 Million Citizens', icon: '🌐', desc: 'Reach 10,000,000 citizens.', check: function () { return S.city.population >= 1e7; } },
  { id: 'w_100m', name: '100 Million Citizens', icon: '🪐', desc: 'Reach 100,000,000 citizens.', check: function () { return S.city.population >= 1e8; } }
);

/* ===================================== WORLD CHALLENGE GENERATOR ===================================== */
const YEAR_GAME_SEC = SEASON_DAYS * 4 * 86400;
function niceRound(v) { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1)); return Math.round(v / p) * p; }
function highwayTiles() { let n = 0; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] === 4) n++; return n; }
function cityGdpPerCapita() { return S.city.population > 0 ? (SIM.income || 0) * YEAR_SEC * 10 / S.city.population / 1000 : 0; }
const WCH_TEMPLATES = {
  popNoHighway: { icon: '🚫🛣️', make: function (pop) { const t = niceRound(Math.max(pop * 3, 2000)); return { objective: 'Reach ' + fmt(t) + ' citizens', condition: 'without building a new highway', target: t, limitYears: 4, money: t * 4 }; }, start: function (c) { c.base = highwayTiles(); }, progress: function (c) { return S.city.population / c.target; }, fail: function (c) { return highwayTiles() > c.base; } },
  happyYears: { icon: '😊', make: function () { const y = 2 + Math.floor(Math.random() * 3) * 4; return { objective: 'Maintain 90% happiness for ' + y + ' years', condition: 'happiness must stay at or above 90%', target: y, limitYears: y * 2 + 2, money: 250000 * y }; }, tick: function (c, dt) { c.hold = S.city.happiness >= 90 ? c.hold + dt * TIME_SCALE : 0; }, progress: function (c) { return c.hold / (c.target * YEAR_GAME_SEC); } },
  surviveDisasters: { icon: '🛟', make: function () { return { objective: 'Survive three disasters', condition: 'keep at least half of the population', target: 3, limitYears: 6, money: 400000 }; }, start: function (c) { c.base = S.city.population; c.count = 0; }, progress: function (c) { return c.count / c.target; }, fail: function (c) { return S.city.population < c.base * 0.5; } },
  richestRegion: { icon: '💰', make: function () { return { objective: 'Become the richest region', condition: 'GDP per citizen above every neighbouring city', target: 1, limitYears: 6, money: 1000000 }; }, progress: function () { const best = S.p9.neighbors.reduce(function (a, n) { return Math.max(a, n.gdp / Math.max(1, n.pop) / 1000); }, 1); return cityGdpPerCapita() / best; } },
  zeroPollution: { icon: '🌿', make: function (pop) { const p = niceRound(Math.max(pop, 3000)); return { objective: 'Build a zero-pollution city of ' + fmt(p), condition: 'pollution under 3% for 2 years', target: p, limitYears: 6, money: 600000, extra: 2 }; }, tick: function (c, dt) { c.hold = S.city.pollution < 3 && S.city.population >= c.target ? c.hold + dt * TIME_SCALE : 0; }, progress: function (c) { return c.hold / ((c.extra || 2) * YEAR_GAME_SEC); } },
  trafficFlow: { icon: '🚦', make: function (pop) { const p = niceRound(Math.max(pop * 1.5, 5000)); return { objective: 'Free-flowing traffic at ' + fmt(p) + ' citizens', condition: 'traffic under 20% for 1 year', target: p, limitYears: 5, money: 500000, extra: 1 }; }, tick: function (c, dt) { c.hold = SIM.traffic < 20 && S.city.population >= c.target ? c.hold + dt * TIME_SCALE : 0; }, progress: function (c) { return c.hold / ((c.extra || 1) * YEAR_GAME_SEC); } },
  treasury: { icon: '🏦', make: function () { const t = niceRound(Math.max(S.budget * 4, 2e6)); return { objective: 'Grow the city budget to ' + money(t), condition: 'no loans may be taken', target: t, limitYears: 4, money: t * 0.1 }; }, start: function (c) { c.base = S.bank.loans.length; }, progress: function (c) { return S.budget / c.target; }, fail: function (c) { return S.bank.loans.length > c.base; } }
};
function generateWorldChallenge(tplId) {
  const ids = Object.keys(WCH_TEMPLATES), id = WCH_TEMPLATES[tplId] ? tplId : ids[Math.floor(Math.random() * ids.length)];
  const T = WCH_TEMPLATES[id], m = T.make(S.city.population);
  const c = { id: 'C' + (S.p9.nextCh++), tpl: id, objective: m.objective, condition: m.condition, target: m.target, limitYears: m.limitYears, deadline: S.clock.gameSec + m.limitYears * YEAR_GAME_SEC, reward: { money: Math.round(m.money * costMult()), rp: Math.round(200 + m.limitYears * 120) }, status: 'active', base: 0, hold: 0, count: 0, need: m.target, extra: m.extra || 0, started: S.clock.gameSec };
  if (T.start) T.start(c);
  S.p9.challenges.push(c);
  if (S.p9.challenges.filter(function (x) { return x.status === 'active'; }).length > 5) { const old = S.p9.challenges.find(function (x) { return x.status === 'active'; }); old.status = 'failed'; }
  if (S.p9.challenges.length > 12) S.p9.challenges.shift();
  return c;
}
function challengeTick2(dt) {
  S.p9.challenges.forEach(function (c) {
    if (c.status !== 'active') return;
    const T = WCH_TEMPLATES[c.tpl]; if (!T) return;
    if (T.tick) T.tick(c, dt);
    if (T.fail && T.fail(c)) { c.status = 'failed'; notify('❌ World challenge failed: ' + c.objective + ' (' + c.condition + ')', 'bad'); return; }
    if (T.progress(c) >= 1) {
      c.status = 'completed'; earn('player', c.reward.money); S.research.rp += c.reward.rp;
      celebrate('🏆 WORLD CHALLENGE<br>' + esc(c.objective).toUpperCase(), 10);
      notify('🏆 World challenge complete: ' + c.objective + ' — +' + money(c.reward.money) + ', +' + c.reward.rp + ' RP', 'gold');
      timelineAdd('🏆', 'Challenge completed: ' + c.objective, 'challenge');
      return;
    }
    if (S.clock.gameSec > c.deadline) { c.status = 'failed'; notify('⌛ World challenge expired: ' + c.objective, 'bad'); }
  });
}
function challengeEvent(kind) { if (!S.p9) return; S.p9.challenges.forEach(function (c) { if (c.status === 'active' && c.tpl === 'surviveDisasters' && kind === 'disaster') c.count++; }); }

/* ===================================== DISASTER COMMAND CENTER ===================================== */
const COMMAND_DISASTERS = {
  earthquake: { icon: '🌋', name: 'Earthquake' }, flood: { icon: '🌊', name: 'Flood' }, storm: { icon: '⛈️', name: 'Storm' }, fire: { icon: '🔥', name: 'Fire' },
  power: { icon: '🔌', name: 'Power Failure' }, water: { icon: '💧', name: 'Water Failure' }, collapse: { icon: '🏚️', name: 'Infrastructure Collapse' }
};
function startCommandDisaster(cfg) {
  const T = COMMAND_DISASTERS[cfg.type]; if (!T || !S.p9) return null;
  let x = cfg.x, y = cfg.y;
  if (!isFinite(x) || !isFinite(y) || !inMap(x, y)) { const L = S.buildings.list.filter(function (b) { return b.built && b.type !== 'tree'; }); const b = L.length ? L[Math.floor(Math.random() * L.length)] : null; x = b ? b.x : MAP.W >> 1; y = b ? b.y : MAP.H >> 1; }
  const sev = clamp(num(cfg.sev, 5), 1, 10), dur = clamp(num(cfg.dur, 90), 10, 1200), r = clamp(num(cfg.radius, 6), 1, 60), spread = clamp(num(cfg.spread, 0), 0, 10);
  if (S.p9.autoSnap) createSnapshot('Before Disaster: ' + T.name, true);
  const D = { id: 'D' + (S.p9.nextDis++), type: cfg.type, x: x | 0, y: y | 0, r0: r, r: r, sev: sev, dur: dur, start: S.clock.runSec, until: S.clock.runSec + dur, spread: spread, hits: 0, hitIds: [], tiles: [], cost: 0 };
  S.p9.disasters.push(D);
  eventAutosave('before disaster: ' + T.name);
  notify(T.icon + ' ' + T.name.toUpperCase() + ' at ' + districtName(D.x, D.y) + ' — severity ' + sev + '/10, radius ' + r + ' tiles, ' + Math.round(dur) + ' s', 'bad');
  flashBig(T.icon + ' ' + T.name.toUpperCase()); sfx('event'); shake(Math.min(10, 2 + sev));
  disasterApply(D, true);
  emergencyDispatch('police', nearestRoadTile(D.x, D.y), { priority: 2 });
  timelineAdd(T.icon, 'Major ' + T.name.toLowerCase() + ' (severity ' + sev + ')', 'disaster', 'A severity ' + sev + ' ' + T.name.toLowerCase() + ' struck ' + districtName(D.x, D.y) + '.');
  return D;
}
function nearestRoadTile(x, y) {
  for (let r = 0; r < 12; r++) for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (isRoad(xx, yy)) return idx(xx, yy);
  return -1;
}
function disasterBuildings(D) { const out = []; S.buildings.list.forEach(function (b) { const d = bdef(b); const dd = Math.hypot(b.x + d.w / 2 - D.x, b.y + d.h / 2 - D.y); if (dd <= D.r && b.built && d.id !== 'tree') out.push([b, dd]); }); return out; }
function disasterRoads(D) { const out = []; for (let y = Math.floor(D.y - D.r); y <= D.y + D.r; y++) for (let x = Math.floor(D.x - D.r); x <= D.x + D.r; x++) if (isRoad(x, y) && Math.hypot(x - D.x, y - D.y) <= D.r) out.push(idx(x, y)); return out; }
function disasterHitBuilding(D, b, kind) {
  if (D.hitIds.indexOf(b.id) >= 0 && kind !== 'fire') return;
  if (D.hitIds.length < 400) D.hitIds.push(b.id);
  D.hits++;
  if (kind === 'fire') igniteBuilding(b); else if (!BUILDINGS[b.type].landmark) damageBuilding(b);
  b.cond = Math.max(0, (b.cond === undefined ? 100 : b.cond) - 8 * D.sev);
  D.cost += Math.round(buildCost(BUILDINGS[b.type]) * 0.1);
  if (b._entry >= 0 && D.hits <= 12) emergencyDispatch(kind === 'fire' ? 'fire' : 'medical', b._entry, { dest: b, priority: Math.ceil(D.sev / 3) });
}
function disasterApply(D, first) {
  const mit = disasterMitigation(), sev = D.sev / 10;
  if (D.type === 'earthquake') {
    if (!first) return;
    disasterBuildings(D).forEach(function (q) { if (RNG.next() < sev * (1 - q[1] / (D.r + 1)) * (1 - mit * 0.5)) disasterHitBuilding(D, q[0]); });
    disasterRoads(D).forEach(function (t) { if (RNG.next() < sev * 0.25) { const inc = createIncident('closure', t, { dur: 90 + D.sev * 25, silent: true }); if (inc) { D.tiles.push(t); dispatchMaintenance(t); } } });
    for (let k = 0; k < Math.ceil(D.sev / 3); k++) breakPipe(pick(disasterRoads(D)), true);
  } else if (D.type === 'flood') {
    disasterRoads(D).forEach(function (t) { if (MAP.blocked[t] === 0) { MAP.blocked[t] = 3; D.tiles.push(t); } });
    disasterBuildings(D).forEach(function (q) { q[0]._nearWater = true; if (first && RNG.next() < sev * 0.3) disasterHitBuilding(D, q[0]); });
    SIM.flood = true; MAP.pathCache.clear(); rerouteAround(D.tiles);
  } else if (D.type === 'storm') {
    disasterBuildings(D).forEach(function (q) { if (RNG.next() < sev * 0.04) disasterHitBuilding(D, q[0]); });
    S.buildings.list.forEach(function (b) { if (b.type === 'substation' && Math.hypot(b.x - D.x, b.y - D.y) <= D.r && !S.p9.util.failures.some(function (f) { return f.cause === D.id; })) S.p9.util.failures.push({ x: b.x, y: b.y, r: 3, until: D.until, cause: D.id }); });
    if (first) for (let y = Math.floor(D.y - D.r); y <= D.y + D.r; y++) for (let x = Math.floor(D.x - D.r); x <= D.x + D.r; x++) if (inMap(x, y) && MAP.nature[idx(x, y)] === 1 && RNG.next() < sev * 0.3) { MAP.nature[idx(x, y)] = 0; MAP.groundDirty = true; }
  } else if (D.type === 'fire') {
    if (first) disasterBuildings(D).sort(function (a, b) { return a[1] - b[1]; }).slice(0, Math.ceil(D.sev * 0.8)).forEach(function (q) { disasterHitBuilding(D, q[0], 'fire'); });
    else S.buildings.list.forEach(function (b) {                 // spreads to neighbours of burning buildings
      if (b.fire <= 0) return; const d = bdef(b);
      for (let y = b.y - 1; y <= b.y + d.h; y++) for (let x = b.x - 1; x <= b.x + d.w; x++) { const n = buildingAtTile(x, y); if (n && n !== b && n.fire <= 0 && n.built && Math.hypot(n.x - D.x, n.y - D.y) <= D.r && RNG.next() < 0.012 * D.sev) disasterHitBuilding(D, n, 'fire'); }
    });
  } else if (D.type === 'power') {
    const f = S.p9.util.failures.find(function (x) { return x.cause === D.id; });
    if (f) f.r = D.r; else S.p9.util.failures.push({ x: D.x, y: D.y, r: D.r, until: D.until, cause: D.id });
  } else if (D.type === 'water') {
    if (first) { const rd = disasterRoads(D); for (let k = 0; k < Math.max(1, Math.round(D.sev / 2)) && rd.length; k++) breakPipe(rd.splice(Math.floor(RNG.next() * rd.length), 1)[0], true); S.p6.effects.push({ id: 'watermain', until: D.until, eff: { waterProd: 1 - 0.05 * D.sev }, label: '💧 Water failure' }); }
  } else if (D.type === 'collapse') {
    if (!first) return;
    const rd = disasterRoads(D).sort(function (a, b) { return (MAP.nature[b] === 2 ? 1 : 0) - (MAP.nature[a] === 2 ? 1 : 0); });
    rd.slice(0, Math.ceil(rd.length * sev * 0.6)).forEach(function (t) { if (createIncident('closure', t, { dur: D.dur + 150, silent: true })) { D.tiles.push(t); if (D.tiles.length % 3 === 1) dispatchMaintenance(t); } });
    disasterBuildings(D).forEach(function (q) { if (RNG.next() < sev * 0.35 * (1 - q[1] / (D.r + 1))) disasterHitBuilding(D, q[0]); });
  }
}
function disasterTick(dt) {
  if (!S.p9.disasters.length) return;
  const now = S.clock.runSec;
  S.p9.disasters.slice().forEach(function (D) {
    if (D.spread > 0) D.r = Math.min(80, D.r0 + D.spread * (now - D.start) / 10);
    const el = now - D.start;
    if (D.type === 'earthquake' && !D.after && el > D.dur * 0.4) { D.after = 1; const r0 = D.r; D.r = r0 * 0.6; const s0 = D.sev; D.sev = Math.max(1, s0 - 3); disasterApply(D, true); D.r = r0; D.sev = s0; shake(3); toast('🌋 Aftershock!', 'bad'); }
    if (D.type !== 'earthquake' && D.type !== 'collapse' && D.type !== 'water') disasterApply(D, false);
    if (now >= D.until) endCommandDisaster(D);
  });

}
function endCommandDisaster(D) {
  const T = COMMAND_DISASTERS[D.type];
  if (D.type === 'flood') {
    D.tiles.forEach(function (t) { if (MAP.blocked[t] === 3) MAP.blocked[t] = 0; });
    S.buildings.list.forEach(function (b) { b._nearWater = false; });
    if (!activeEvent('flood') && !S.p9.disasters.some(function (x) { return x !== D && x.type === 'flood'; })) SIM.flood = false;
    MAP.pathCache.clear();
  }
  S.p9.util.failures = S.p9.util.failures.filter(function (f) { return f.cause !== D.id; });
  S.p9.disasters = S.p9.disasters.filter(function (x) { return x !== D; });
  S.p9.disasterLog.push({ name: T.name, icon: T.icon, day: gameDay(), year: gameYear(), hits: D.hits, cost: D.cost, sev: D.sev });
  if (S.p9.disasterLog.length > 15) S.p9.disasterLog.shift();
  S.p9.stats.disastersSurvived++; S.statistics.totals.disasters++;
  challengeEvent('disaster');
  notify('🧾 ' + T.icon + ' ' + T.name + ' is over: ' + D.hits + ' building(s) hit · damage ' + money(D.cost) + '. Crews keep repairing roads and pipes.', 'gold');
  if (S.p9.autoSnap) createSnapshot('After Disaster: ' + T.name, true);
}
function clearAllDisasters() {
  if (!S.p9) return 0;
  const n = S.p9.disasters.length;
  S.p9.disasters.slice().forEach(endCommandDisaster);
  S.events.active = S.events.active.filter(function (a) { return a.kind !== 'disaster' && a.kind !== 'crisis'; });
  SIM.flood = false; S.buildings.list.forEach(function (b) { b._nearWater = false; b.fire = 0; });
  S.p9.util.failures = []; S.p6.effects = S.p6.effects.filter(function (e) { return e.id !== 'blackout' && e.id !== 'watermain'; });
  return n;
}
function drawP9Overlays() {
  if (!S.p9) return;
  S.p9.disasters.forEach(function (D) {
    const T = COMMAND_DISASTERS[D.type], cx = (D.x + 0.5) * TILE, cy = (D.y + 0.5) * TILE, r = D.r * TILE;
    ctx.fillStyle = D.type === 'flood' ? 'rgba(47,127,191,.28)' : D.type === 'fire' ? 'rgba(255,90,30,.16)' : D.type === 'power' ? 'rgba(20,20,40,.35)' : 'rgba(239,71,111,.14)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,80,.8)'; ctx.lineWidth = 2 / CAM.zoom; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]);
    drawEmoji(T.icon, cx, cy, 26 / Math.max(0.5, CAM.zoom));
  });
  S.p9.util.failures.forEach(function (f) { if (f.cause && f.cause.charAt(0) === 'D') return; ctx.fillStyle = 'rgba(10,10,30,.35)'; ctx.beginPath(); ctx.arc((f.x + 0.5) * TILE, (f.y + 0.5) * TILE, f.r * TILE, 0, 6.283); ctx.fill(); drawEmoji('🔌', (f.x + 0.5) * TILE, (f.y + 0.5) * TILE, 16); });
  S.p9.water.breaks.forEach(function (b) { const c = tileCenter(b.tile); drawEmoji('💦', c.x, c.y - 4, 14); });
  if (CAM.zoom > 0.7) weBuildingsInView(lastView(), []).forEach(function (b) { if (b.built && b.cond !== undefined && b.cond < 40) { const c = buildingCenter(b); drawEmoji('🔧', c.x + 10, c.y - 18, 11); } });
  drawBrushOverlay();
  if (RS.rect || RS.drag) { const r = RS.drag || RS.rect, x0 = Math.min(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), x1 = Math.max(r.x0, r.x1), y1 = Math.max(r.y0, r.y1); ctx.fillStyle = 'rgba(76,201,240,.15)'; ctx.fillRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE); ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 2 / CAM.zoom; ctx.strokeRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE); }
  if (EI.open && EI.ref && EI.ref.kind === 'road') { const t = EI.ref.id; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3 / CAM.zoom; ctx.strokeRect((t % MAP.W) * TILE, ((t / MAP.W) | 0) * TILE, TILE, TILE); }
}
function lastView() { const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH); return { x0: tl.x - 40, y0: tl.y - 40, x1: br.x + 40, y1: br.y + 320 }; }

/* ===================================== VALIDATOR 2.0 / HEALTH 2.0 / AUTO FIX ===================================== */
function validateWorld2() {
  const checks = [], add = function (id, label, ok, detail, warn) { checks.push({ id: id, label: label, ok: !!ok, detail: detail || '', warn: !!warn }); };
  const rc = mainRoadComp(), L = S.buildings.list, roadB = L.filter(function (b) { return !bdef(b).noRoad; });
  const reach = roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length;
  add('roads', 'Roads connected', rc.comps <= 1, rc.comps + ' road network(s)');
  add('reach', 'Buildings reachable', reach >= roadB.length * 0.98, reach + '/' + roadB.length);
  const gs = gridStats();
  add('power', 'Electricity connected', SIM.powerRatio >= 0.99 && !gs.noGrid && !gs.brown, Math.round(gs.production) + ' / ' + Math.round(gs.consumption) + ' MW · reserve ' + Math.round(gs.reserve) + ' MW' + (gs.brown ? ' · ' + gs.brown + ' browned out' : '') + (gs.noGrid ? ' · ' + gs.noGrid + ' unconnected' : ''));
  add('water', 'Water connected', SIM.waterRatio >= 0.99 && WNET.low < 0.1, Math.round(SIM.waterGen) + ' / ' + Math.round(SIM.waterUse) + ' · low pressure ' + Math.round(WNET.low * 100) + '%');
  add('sewage', 'Sewage connected', SEWER.overload < 0.05, Math.round(SEWER.gen) + ' produced / ' + Math.round(SEWER.cap) + ' capacity');
  add('jobs', 'Jobs available', SIM.jobs >= SIM.labor * 0.88, fmt(SIM.jobs) + ' jobs / ' + fmt(SIM.labor) + ' workers');
  add('housing', 'Housing available', (SIM.housingCap || 0) >= S.city.population * 0.99, fmt(SIM.housingCap || 0) + ' homes / ' + fmt(S.city.population) + ' citizens');
  add('food', 'Food available', (SIM.supply.FOOD || 0) >= (SIM.demand.FOOD || 0) * 0.85 || countAny('farm') > 0, 'supply ' + fmt(SIM.supply.FOOD || 0) + ' / demand ' + fmt(SIM.demand.FOOD || 0));
  add('emergency', 'Emergency coverage', SIM.cov.fire >= 0.85 && SIM.cov.police >= 0.85 && SIM.cov.health >= 0.8, 'fire ' + Math.round(SIM.cov.fire * 100) + '% · police ' + Math.round(SIM.cov.police * 100) + '% · health ' + Math.round(SIM.cov.health * 100) + '%');
  const sample = roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; });
  let routesOk = 0, routesN = 0;
  for (let k = 0; k < 12 && sample.length > 1; k++) { const a = sample[(k * 7919) % sample.length], b = sample[(k * 104729 + 3) % sample.length]; if (a === b) continue; routesN++; if (roadPath(a._entry, b._entry)) routesOk++; }
  const stuck = AG.vehicles.filter(function (v) { return v.stopped > 8; }).length;
  add('routes', 'Traffic routes', routesOk >= routesN && stuck <= Math.max(3, AG.vehicles.length * 0.3), routesOk + '/' + routesN + ' sample routes · ' + stuck + ' stuck vehicle(s)');
  const sc = supplyChainHealth();
  add('supply', 'Supply chains', sc.ok, 'logistics ' + Math.round(sc.logistics * 100) + '% · food ' + Math.round(sc.food * 100) + '% · producers running ' + Math.round(sc.running * 100) + '% · goods ' + Math.round(sc.goods * 100) + '% delivered');
  add('economy', 'Economy balance', (SIM.bNet || 0) >= 0 || S.budget > Math.abs(SIM.bNet || 0) * 7200, 'budget ' + signMoney(SIM.bNet || 0) + '/s · companies ' + signMoney(SIM.pNet || 0) + '/s');
  let cpOk = 0, cpN = 0;
  AG.citizens.slice(0, 40).forEach(function (c) { if (c.tourist || !c.work) return; const h = MAP.byId.get(c.home), w = MAP.byId.get(c.work); if (!h || !w || h._entry < 0 || w._entry < 0) { cpN++; return; } cpN++; if (roadPath(h._entry, w._entry)) cpOk++; });
  add('citizens', 'Citizen pathfinding', cpOk >= cpN * 0.9, cpOk + '/' + cpN + ' home → work routes');
  weEnsure(); let badChunks = 0, roadChunks = 0;
  for (let k = 0; k < WE.n; k++) { const r = chunkRect(k); let has = false, off = false; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = idx(x, y); if (MAP.roads[i]) { has = true; if (MAP.comp[i] !== rc.main) off = true; } } if (has) roadChunks++; if (off) badChunks++; }
  add('chunks', 'Chunk connections', badChunks === 0, (roadChunks - badChunks) + '/' + roadChunks + ' chunks on the main network');
  const passed = checks.filter(function (c) { return c.ok; }).length;
  return { checks: checks, score: Math.round(passed / checks.length * 100), liveable: passed === checks.length, failed: checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.id; }), at: Date.now() };
}
/* Chain integrity: logistics capacity, food supply and producers that actually run (have their inputs) */
function supplyChainHealth() {
  const fr = SIM.fulfill || {}, dem = SIM.sc ? SIM.sc.dem : {};
  const prods = S.buildings.list.filter(function (b) { return b._op && BUILDINGS[b.type].goods; });
  const running = prods.length ? prods.filter(function (b) { return (b._prod || 0) > 0; }).length / prods.length : 1;
  const logistics = SIM.logisticsRatio === undefined ? 1 : SIM.logisticsRatio;
  const food = dem.food > 0.1 ? (fr.food === undefined ? 1 : fr.food) : 1;
  return { logistics: logistics, food: food, running: running, goods: SIM.goodsRatio === undefined ? 1 : SIM.goodsRatio, ok: logistics >= 0.8 && food >= 0.6 && running >= 0.5 };
}
function validatorTick() {
  const r = validateWorld2(), V = S.p9.validator;
  const fresh = r.failed.filter(function (id) { return V.lastFailed.indexOf(id) < 0; });
  V.last = r; V.lastFailed = r.failed;
  if (fresh.length && ADM.mode) toast('🧪 World validator: ' + fresh.map(function (id) { return r.checks.find(function (c) { return c.id === id; }).label; }).join(', ') + ' — AUTO FIX available (F10)', 'bad');
}
/* AUTO FIX: Part 8 repair + grid, sewage, water pressure, pipes, chunk connections, transit and route caches */
function p9AutoFix(free) {
  const out = [];
  const r = fixWorld(true); r.actions.forEach(function (a) { if (a.indexOf('Nothing to fix') < 0) out.push(a); });
  const subs = gridAutoSubstations(free !== false); if (subs) out.push('🔌 Built ' + subs + ' substation(s) for overloaded districts');
  let sew = 0; sewagePass();
  for (let g = 0; g < 10 && SEWER.overload > 0.04; g++) { const k = SEWER.districts.indexOf(Math.max.apply(null, SEWER.districts)), n = SEWER.n; if (!placeUtilityNear('sewageplant', (k % n) * 8 + 4, Math.floor(k / n) * 8 + 4, free !== false)) break; sew++; onMapChanged(); econTick(1); sewagePass(); }
  if (sew) out.push('🚽 Built ' + sew + ' sewage treatment plant(s)');
  const pipes = S.p9.water.breaks.length; if (pipes) { S.p9.water.breaks = []; out.push('💦 Repaired ' + pipes + ' burst water main(s)'); }
  waterNetPass(true);
  const pumps = placePumpsForPressure(free !== false, 10);
  if (pumps) out.push('⛽ Built ' + pumps + ' pump station(s) to restore water pressure');
  if (S.p9.util.failures.length) { S.p9.util.failures = []; out.push('⚡ Restored failed grid sections'); }
  // supply chains: trucks & storage when logistics are short, food production when shops lack food, recipes that match the inputs
  let wh = 0, food = 0;
  for (let g = 0; g < 6 && supplyChainHealth().logistics < 0.9; g++) { if (!wgPlaceAnywhere(null, 'warehouse', {})) break; wh++; onMapChanged(); econTick(1); }
  for (let g = 0; g < 6 && supplyChainHealth().food < 0.6; g++) { if (!wgPlaceAnywhere(null, g % 2 ? 'factory' : 'farm', { recipe: 'food' })) break; food++; onMapChanged(); econTick(1); }
  // raw materials the idle producers wait for: extractors on the deposits (mines, wells, lumber mills)
  let ext = 0;
  if (supplyChainHealth().running < 0.8) {
    const want = {};
    S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if (!b._op || !d.goods || (b._prod || 0) > 0 || d.noInputs) return; const P = PRODUCTS[b.recipe]; if (P) for (const k in P.inputs) if (RESOURCE_TYPES[k]) want[k] = (want[k] || 0) + 1; });
    Object.keys(want).sort(function (a, b) { return want[b] - want[a]; }).forEach(function (k) {
      const X = Object.values(BUILDINGS).find(function (d) { return d.extract && d.extract.type === k; }); if (!X) return;
      for (let g = 0; g < Math.min(3, Math.ceil(want[k] / 6)); g++) { if (!wgPlaceAnywhere(null, X.id, {})) break; ext++; }
    });
    if (ext) { onMapChanged(); econTick(1); out.push('⛏ Built ' + ext + ' extractor(s) for missing raw materials'); }
    wgAssignRecipes(null); econTick(1); out.push('⚙ Factory recipes matched to the available inputs');
  }
  if (wh || food) out.push('🏭 Supply chains: ' + wh + ' warehouse(s), ' + food + ' food producer(s) added');
  MAP.pathCache.clear(); transitRebuild(true); out.push('🧭 Route caches and transit lines rebuilt');
  onMapChanged(); econTick(1);
  const v = validateWorld2(); S.p9.validator.last = v; S.p9.validator.lastFailed = v.failed;
  adminLog('AUTO FIX (Part 9): ' + out.length + ' action(s), validator ' + v.score + '%');
  return { actions: out, validation: v };
}
function worldStatus() {
  const pc = function (s) { return Math.round(clamp(s, 0, 1) * 100); };
  const conn = mainCompShare();
  const consumers = S.buildings.list.filter(function (b) { return bdef(b).power < 0 && b._op; }).length || 1;
  const util = (Math.min(1, SIM.powerRatio || 0) + Math.min(1, SIM.waterRatio || 0) + (1 - (SIM.sewageOverload || 0)) + (1 - Math.min(1, (SIM.gridBrown || 0) / consumers * 4)) + (1 - (SIM.lowPressure || 0))) / 5;
  const econ = clamp(0.5 + ((SIM.bNet || 0) >= 0 ? 0.3 : -0.3) + ((SIM.pNet || 0) >= 0 ? 0.2 : -0.2) + Math.min(0.2, S.budget / 1e7), 0, 1);
  const hh = HH.stats ? HH.stats.satisfaction / 100 : S.city.happiness / 100;
  const cit = (S.city.happiness / 100 + (1 - SIM.unemployment) + Math.min(1, (SIM.housingCap || 0) / Math.max(1, S.city.population)) + hh) / 4;
  const traffic = clamp(1 - (SIM.traffic || 0) / 100 - (S.p9 ? S.p9.traffic.incidents.length * 0.02 : 0), 0, 1);
  const es = envSummary(), env = ((1 - es.air) + es.water + (1 - es.soil) + (1 - es.noise * 0.5)) / 4;
  const eta = S.p9 && S.p9.emergency.etaN ? S.p9.emergency.etaSum / S.p9.emergency.etaN : 30;
  const emer = (SIM.cov.fire + SIM.cov.police + SIM.cov.health + clamp(1 - eta / 120, 0, 1)) / 4;
  const rows = [['Roads', pc(conn)], ['Utilities', pc(util)], ['Economy', pc(econ)], ['Citizens', pc(cit)], ['Traffic', pc(traffic)], ['Environment', pc(env)], ['Emergency', pc(emer)]];
  return { rows: rows, overall: Math.round(rows.reduce(function (a, r) { return a + r[1]; }, 0) / rows.length) };
}
function statusCls(v) { return v >= 85 ? 'ok' : v >= 60 ? 'warn' : 'bad'; }
function renderWorldStatusBar() {
  const el = $('admWorldStatus'); if (!el || !S || !S.p9) return;
  const w = worldStatus(), v = S.p9.validator.last;
  el.innerHTML = '<span class="wsMain ' + statusCls(w.overall) + '">WORLD HEALTH: ' + w.overall + '%</span>' + w.rows.map(function (r) { return '<span class="ws ' + statusCls(r[1]) + '">' + r[0] + ': ' + r[1] + '%</span>'; }).join('') +
    (v ? '<span class="ws ' + (v.liveable ? 'ok' : 'bad') + '" title="' + esc(v.failed.join(', ')) + '">Validator: ' + v.score + '%</span>' : '') + '<span class="ws">Chunks ' + WE.tierCount[0] + '/' + WE.n + ' near · ' + WE.ground.size + ' loaded</span>';
}

/* ===================================== SMART ADVISOR 2.0 ===================================== */
function districtCells() {
  const n = Math.ceil(MAP.W / 8), out = [];
  for (let k = 0; k < n * n; k++) out.push({ k: k, x0: (k % n) * 8, y0: Math.floor(k / n) * 8, roads: [], cong: 0, buildings: [], uncovered: { fire: 0, police: 0, health: 0 } });
  for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i]) { const x = i % MAP.W, y = (i / MAP.W) | 0, c = out[Math.floor(y / 8) * n + Math.floor(x / 8)]; c.roads.push(i); c.cong += MAP.cong ? MAP.cong[i] : 0; }
  S.buildings.list.forEach(function (b) { const c = out[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)]; if (!c) return; c.buildings.push(b); if (b._cov) { if (!b._cov.fire) c.uncovered.fire++; if (!b._cov.police) c.uncovered.police++; if (!b._cov.health) c.uncovered.health++; } });
  out.forEach(function (c) { c.avgCong = c.roads.length ? c.cong / c.roads.length : 0; c.name = districtName(c.x0 + 4, c.y0 + 4) || 'District ' + c.k; });
  return out;
}
function bestPowerPlant() { return ['fusion', 'nuclear', 'wind', 'solar', 'powerplant', 'smallgen'].find(function (id) { return BUILDINGS[id] && unlockStatus(BUILDINGS[id]).ok; }) || 'powerplant'; }
function advisorAnalyze() {
  if (!S.p9) return [];
  const out = [], cells = districtCells();
  const push = function (o) { out.push(o); };
  // 1. traffic congestion hotspot
  const hot = cells.filter(function (c) { return c.roads.length >= 4; }).sort(function (a, b) { return b.avgCong - a.avgCong; })[0];
  if (hot && (hot.avgCong > 0.4 || SIM.traffic > 45)) {
    const tiles = hot.roads.slice().sort(function (a, b) { return (MAP.cong ? MAP.cong[b] - MAP.cong[a] : 0); }).filter(function (t) { return MAP.roads[t] < 4; }).slice(0, 14);
    let cost = 0, capOld = 0, capNew = 0;
    tiles.forEach(function (t) { const cur = MAP.roads[t], nx = Math.min(cur < 3 ? cur + 1 : 4, unlockStatus(ROAD_TYPES[4].unlock ? { unlock: ROAD_TYPES[4].unlock } : {}).ok ? 4 : 3); cost += Math.max(0, roadCost(nx) - roadCost(cur)) * (MAP.nature[t] === 2 ? 4 : MAP.terrain[t] === TERRAIN.ROCK ? 6 : 1); capOld += ROAD_TYPES[cur].cap; capNew += ROAD_TYPES[nx].cap; });
    const transitShare = (SIM.riders || 0) / Math.max(1, SIM.trips || 1);
    const cause = hot.roads.some(function (t) { return MAP.blocked[t]; }) ? 'Traffic incident blocking lanes.' : transitShare < 0.25 ? 'High commuter volume — only ' + Math.round(transitShare * 100) + '% of trips use public transport.' : 'Road capacity too low for the demand.';
    const red = clamp((capNew - capOld) / Math.max(1, capOld) * 0.55, 0.05, 0.45);
    push({ id: 'traffic', sev: hot.avgCong > 0.7 ? 3 : 2, icon: '🚗', title: 'Traffic congestion detected in ' + hot.name, cause: cause, solution: 'Upgrade the ' + tiles.length + ' busiest road segments' + (hasTech('metro') ? ' (or build an alternate metro line)' : '') + '.', cost: cost, expected: 'Traffic −' + Math.round(red * 100) + '% in ' + hot.name,
      apply: function () { if (!payAdvisor(cost)) return false; tiles.forEach(function (t) { const cur = MAP.roads[t]; MAP.roads[t] = Math.min(cur < 3 ? cur + 1 : 4, 4); }); onMapChanged(); return true; }, at: hot });
  }
  // 2. power reserve / overload
  const gs = gridStats();
  if (gs.reserve < (SIM.powerUse || 0) * 0.05 || gs.brown > 0) {
    if (gs.reserve < (SIM.powerUse || 0) * 0.05) {
      const id = bestPowerPlant(), d = BUILDINGS[id], need = Math.max(0, (SIM.powerUse || 0) * 1.15 - (SIM.powerGen || 0)), n = clamp(Math.ceil(need / Math.max(1, d.power)), 1, 6);
      push({ id: 'power', sev: SIM.powerRatio < 0.95 ? 3 : 2, icon: '⚡', title: 'Power reserve too low (' + Math.round(gs.reserve) + ' MW)', cause: 'Consumption ' + Math.round(gs.consumption) + ' MW is close to production ' + Math.round(gs.production) + ' MW.', solution: 'Build ' + n + '× ' + d.name + '.', cost: buildCost(d) * n, expected: 'Reserve +' + fmt(d.power * n) + ' MW',
        apply: function () { if (!payAdvisor(buildCost(d) * n)) return false; for (let k = 0; k < n; k++) wgPlaceAnywhere(null, id, { owner: 'city' }); onMapChanged(); return true; } });
    }
    if (gs.brown > 0) push({ id: 'grid', sev: 2, icon: '🔌', title: gs.transformersOver + ' district transformer(s) overloaded', cause: gs.brown + ' buildings browned out — dense districts have no substation nearby.', solution: 'Build substations next to the overloaded districts.', cost: buildCost(BUILDINGS.substation) * Math.max(1, gs.transformersOver), expected: 'Brownouts −100%',
      apply: function () { if (!payAdvisor(buildCost(BUILDINGS.substation) * Math.max(1, gs.transformersOver))) return false; gridAutoSubstations(true); return true; } });
  }
  // 3. water
  if (SIM.waterRatio < 0.98 || WNET.low > 0.12) {
    if (SIM.waterRatio < 0.98) { const id = unlockStatus(BUILDINGS.megawater).ok ? 'megawater' : 'waterplant', d = BUILDINGS[id], n = clamp(Math.ceil(((SIM.waterUse || 0) * 1.15 - (SIM.waterGen || 0)) / d.water), 1, 5);
      push({ id: 'water', sev: 3, icon: '💧', title: 'Water shortage (' + Math.round(SIM.waterRatio * 100) + '% supplied)', cause: 'Demand ' + fmt(SIM.waterUse) + ' exceeds production ' + fmt(SIM.waterGen) + '.', solution: 'Build ' + n + '× ' + d.name + '.', cost: buildCost(d) * n, expected: 'Water supply 100%', apply: function () { if (!payAdvisor(buildCost(d) * n)) return false; for (let k = 0; k < n; k++) wgPlaceAnywhere(null, id, { owner: 'city' }); onMapChanged(); return true; } }); }
    if (WNET.low > 0.12) push({ id: 'pressure', sev: 2, icon: '⛽', title: 'Low water pressure in ' + Math.round(WNET.low * 100) + '% of buildings', cause: S.p9.water.breaks.length ? S.p9.water.breaks.length + ' burst water main(s).' : 'Buildings are too far from the water sources.', solution: 'Repair the mains and add pump stations.', cost: buildCost(BUILDINGS.pumpstation) * 3, expected: 'Low pressure −' + Math.round(WNET.low * 80) + '%',
      apply: function () { if (!payAdvisor(buildCost(BUILDINGS.pumpstation) * 3)) return false; S.p9.water.breaks = []; for (let k = 0; k < 3; k++) { const low = S.buildings.list.filter(function (b) { return bdef(b).water < 0 && (b._wp || 0) < 0.3; }); if (!low.length) break; placeUtilityNear('pumpstation', low[0].x, low[0].y, true); onMapChanged(); waterNetPass(true); } return true; } });
  }
  // 4. sewage
  if ((SIM.sewageOverload || 0) > 0.05) { const n = clamp(Math.ceil((SEWER.gen - SEWER.cap) / 500), 1, 6), d = BUILDINGS.sewageplant;
    push({ id: 'sewage', sev: 3, icon: '🚽', title: 'Sewage overload (' + Math.round(SIM.sewageOverload * 100) + '% untreated)', cause: 'Sewage ' + fmt(SEWER.gen) + ' vs treatment capacity ' + fmt(SEWER.cap) + '.', solution: 'Build ' + n + '× Sewage Treatment Plant.', cost: buildCost(d) * n, expected: 'Sewage overload 0% · water quality up', apply: function () { if (!payAdvisor(buildCost(d) * n)) return false; for (let k = 0; k < n; k++) wgPlaceAnywhere(null, 'sewageplant', { owner: 'city' }); onMapChanged(); return true; } }); }
  // 5. unemployment
  if (SIM.unemployment > 0.12) { const need = Math.round(SIM.labor * (SIM.unemployment - 0.06)), types = ['office', 'factory', 'supermarket'], per = 30, n = clamp(Math.ceil(need / per), 1, 12);
    push({ id: 'jobs', sev: SIM.unemployment > 0.2 ? 3 : 2, icon: '💼', title: 'Unemployment at ' + Math.round(SIM.unemployment * 100) + '%', cause: fmt(SIM.labor) + ' workers for ' + fmt(SIM.jobs) + ' jobs.', solution: 'Open ' + n + ' new workplaces (offices, factories, stores).', cost: n * 9000 * costMult(), expected: 'Unemployment −' + Math.round(Math.min(SIM.unemployment - 0.05, n * per / Math.max(1, SIM.labor)) * 100) + '%',
      apply: function () { if (!payAdvisor(n * 9000 * costMult())) return false; for (let k = 0; k < n; k++) wgPlaceAnywhere(null, types[k % 3], {}); onMapChanged(); return true; } }); }
  // 6. housing
  if (S.city.population > (SIM.housingCap || 0) * 0.98 && (SIM.housingDemandRatio || 1) > 1.05) { const id = unlockStatus(BUILDINGS.condo).ok ? 'condo' : 'apartment', d = BUILDINGS[id], n = clamp(Math.ceil(S.city.population * 0.1 / d.housing), 1, 12);
    push({ id: 'housing', sev: 2, icon: '🏠', title: 'Housing shortage', cause: 'Housing demand is ' + Math.round(((SIM.housingDemandRatio || 1) - 1) * 100) + '% above capacity.', solution: 'Build ' + n + '× ' + d.name + ' near jobs.', cost: buildCost(d) * n, expected: 'Housing +' + fmt(d.housing * n), apply: function () { if (!payAdvisor(buildCost(d) * n)) return false; for (let k = 0; k < n; k++) wgPlaceAnywhere(null, id, {}); onMapChanged(); return true; } }); }
  // 7. emergency coverage gaps
  [['fire', 'fire', '🚒', 'Fire coverage gap'], ['police', 'police', '🚓', 'Police coverage gap'], ['health', 'hospital', '🏥', 'Healthcare gap']].forEach(function (q) {
    if (SIM.cov[q[0]] >= 0.85) return;
    const c = cells.slice().sort(function (a, b) { return b.uncovered[q[0]] - a.uncovered[q[0]]; })[0]; if (!c || !c.uncovered[q[0]]) return;
    const d = BUILDINGS[q[1]];
    push({ id: 'cov_' + q[0], sev: SIM.cov[q[0]] < 0.6 ? 3 : 2, icon: q[2], title: q[3] + ' in ' + c.name, cause: c.uncovered[q[0]] + ' buildings outside coverage (' + Math.round(SIM.cov[q[0]] * 100) + '% city-wide).', solution: 'Build a ' + d.name + ' in ' + c.name + '.', cost: buildCost(d), expected: 'Coverage +' + Math.round(Math.min(1 - SIM.cov[q[0]], c.uncovered[q[0]] / Math.max(1, S.buildings.list.length)) * 100) + '%',
      apply: function () { if (!payAdvisor(buildCost(d))) return false; placeUtilityNear(q[1], c.x0 + 4, c.y0 + 4, true); onMapChanged(); return true; } });
  });
  // 8. pollution hotspot
  if (envReady()) { let best = -1, bv = 0; cells.forEach(function (c) { let s = 0, k = 0; for (let y = c.y0; y < c.y0 + 8 && y < MAP.H; y++) for (let x = c.x0; x < c.x0 + 8 && x < MAP.W; x++) { s += ENV.air[idx(x, y)]; k++; } const v = k ? s / k : 0; if (v > bv) { bv = v; best = c.k; } });
    if (bv > 0.45) { const c = cells[best]; push({ id: 'pollution', sev: bv > 0.65 ? 3 : 2, icon: '🏭', title: 'Air pollution hotspot in ' + c.name, cause: 'Industry and traffic emissions drift ' + windName(S.p9.env.wind.dir) + ' with the wind.', solution: 'Plant a green belt and parks around ' + c.name + (hasTech('env_filters') ? '' : ' (research Industrial Filters)') + '.', cost: 6 * buildCost(BUILDINGS.park), expected: 'Local pollution −' + Math.round(Math.min(40, bv * 45)) + '%',
      apply: function () { if (!payAdvisor(6 * buildCost(BUILDINGS.park))) return false; let p = 0; for (let y = c.y0 - 2; y < c.y0 + 10; y++) for (let x = c.x0 - 2; x < c.x0 + 10; x++) { if (!inMap(x, y)) continue; const i = idx(x, y); if (!MAP.occ[i] && !MAP.roads[i] && MAP.nature[i] === 0 && inUnlocked(x, y)) { if (p < 6 && canPlace(BUILDINGS.park, x, y, true).ok) { const b = makeBuilding('park', x, y); b.owner = 'city'; addBuildingToMap(b); p++; } else MAP.nature[i] = 1; } } onMapChanged(); return true; } }); } }
  // 9. low happiness driver
  if (S.city.happiness < 55 && SIM.hapFactors) { const worst = SIM.hapFactors.slice().sort(function (a, b) { return a[1] - b[1]; })[0];
    if (worst && worst[1] < -3) push({ id: 'happy', sev: 2, icon: '😟', title: 'Citizens are unhappy (' + Math.round(S.city.happiness) + '%)', cause: 'Biggest factor: ' + worst[0] + ' (' + worst[1].toFixed(1) + ').', solution: 'Add parks and plazas and fix ' + worst[0].toLowerCase() + '.', cost: 8 * buildCost(BUILDINGS.park), expected: 'Happiness +' + Math.round(Math.min(10, -worst[1] * 0.4)) + '%',
      apply: function () { if (!payAdvisor(8 * buildCost(BUILDINGS.park))) return false; for (let k = 0; k < 8; k++) wgPlaceAnywhere(null, 'park', { owner: 'city' }); onMapChanged(); return true; } }); }
  out.sort(function (a, b) { return b.sev - a.sev; });
  ADV2.list = out; ADV2.at = Date.now();
  return out;
}
const ADV2 = { list: [], at: 0 };
function payAdvisor(cost) {
  if (S.p5.admin.god) return true;
  if (S.budget < cost) { toast('❌ City budget too low (' + money(cost) + ' needed)', 'bad'); sfx('error'); return false; }
  S.budget -= cost; return true;
}
function applyAdvisorSolution(id) {
  const a = ADV2.list.find(function (x) { return x.id === id; }); if (!a) return false;
  const ok = a.apply();
  if (ok) { toast('🧠 Applied: ' + a.solution + ' (' + money(a.cost) + ')', 'good'); sfx('build'); timelineAdd(a.icon, 'Advisor solution applied: ' + a.solution, 'advisor'); if (ADM.mode) adminLog('Advisor: ' + a.title + ' → ' + a.solution); advisorAnalyze(); }
  return ok;
}
function advisorHtml() {
  const L = ADV2.list.length && Date.now() - ADV2.at < 15000 ? ADV2.list : advisorAnalyze();
  if (!L.length) return '<p class="small">✅ No problems detected — the city is running well.</p>';
  return L.map(function (a) {
    return '<div class="card p9Adv sev' + a.sev + '"><b>' + a.icon + ' ' + esc(a.title) + '</b>' +
      '<div class="small"><b>CAUSE:</b> ' + esc(a.cause) + '</div><div class="small"><b>SOLUTION:</b> ' + esc(a.solution) + '</div>' +
      '<div class="small"><b>ESTIMATED COST:</b> ' + money(a.cost) + ' · <b>EXPECTED RESULT:</b> ' + esc(a.expected) + '</div>' +
      '<div class="row" style="margin-top:6px"><button class="btn small gold" data-advapply="' + a.id + '">✅ APPLY SOLUTION</button>' + (a.at ? '<button class="btn small" data-advfly="' + (a.at.x0 + 4) + ',' + (a.at.y0 + 4) + '">📍 Show</button>' : '') + '</div></div>';
  }).join('');
}
function openAdvisor2() {
  showModal('🧠 Smart Advisor 2.0', '<p class="small">The advisor analyses the city, finds the cause and proposes a costed solution you can apply with one click.</p><div id="adv2Body">' + advisorHtml() + '</div>');
  bindAdvisorButtons($('adv2Body'));
}
function bindAdvisorButtons(root) {
  if (!root) return;
  root.querySelectorAll('[data-advapply]').forEach(function (b) { b.onclick = function () { if (applyAdvisorSolution(b.dataset.advapply)) { if ($('adv2Body')) { $('adv2Body').innerHTML = advisorHtml(); bindAdvisorButtons($('adv2Body')); } if (ADM.open) renderAdminCenter(); } }; });
  root.querySelectorAll('[data-advfly]').forEach(function (b) { b.onclick = function () { const p = b.dataset.advfly.split(','); closeModal(); if (ADM.open) closeAdminCenter(); flyToTile(+p[0], +p[1], 0.9); }; });
}

/* ===================================== SNAPSHOTS 2.0 · BRANCHING · CLONING ===================================== */
const BRANCH_KEY = 'bct_branches';
function branchRegistry() { try { const a = JSON.parse(Store.getItem(BRANCH_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (b) { return b && typeof b.id === 'string'; }) : []; } catch (e) { return []; } }
function saveBranchRegistry(a) { try { Store.setItem(BRANCH_KEY, JSON.stringify(a.slice(-60))); } catch (e) { /* storage full */ } }
function newBranchId() { return 'B' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 100); }
/* Alternative world from a snapshot: written into a city slot as an independent save with its own timeline */
function createBranch(snapId, name, slot) {
  const raw = Store.getItem(snapKey(snapId)); if (!raw) return { ok: false, reason: 'Snapshot missing' };
  let obj; try { obj = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'Snapshot unreadable' }; }
  slot = slot | 0; if (slot < 1 || slot > SLOT_COUNT) return { ok: false, reason: 'Pick a city slot' };
  if (slot === (S.slot || 1)) return { ok: false, reason: 'Choose another slot than the current city' };
  const parent = obj.p9 && obj.p9.branch ? obj.p9.branch : { id: 'original', name: 'Original Timeline' };
  const id = newBranchId(), nm = String(name || 'Branch').replace(/[<>]/g, '').slice(0, 40);
  obj.p9 = obj.p9 || {}; obj.p9.branch = { id: id, name: nm, parent: parent.id, from: snapId };
  obj.p9.timeline = (obj.p9.timeline || []).concat([{ y: 1, cy: 2026, d: obj.clock ? Math.floor((obj.clock.gameSec || 0) / 86400) + 1 : 1, icon: '🌿', text: 'Timeline branched: ' + nm + ' (from ' + snapId + ')', kind: 'branch' }]);
  obj.header = Object.assign({}, obj.header, { slot: slot, branch: nm });
  try { Store.setItem(slotKey(slot), JSON.stringify(obj)); } catch (e) { return { ok: false, reason: e.message }; }
  const reg = branchRegistry(); reg.push({ id: id, name: nm, parent: parent.id, parentName: parent.name, snapshot: snapId, slot: slot, city: obj.city ? obj.city.name : '', created: Date.now() }); saveBranchRegistry(reg);
  adminLog('Branch created: ' + nm + ' from ' + snapId + ' → CITY 0' + slot);
  return { ok: true, id: id, slot: slot, name: nm };
}
function branchTreeHtml() {
  const reg = branchRegistry(), cur = S.p9 ? S.p9.branch : { id: 'original' };
  const kids = function (pid) { return reg.filter(function (b) { return b.parent === pid; }); };
  const node = function (b, depth) { return '<div class="p9Br" style="margin-left:' + depth * 16 + 'px">' + (depth ? '├── ' : '') + (b.id === cur.id ? '<b>▶ ' : '') + esc(b.name) + (b.id === cur.id ? '</b>' : '') + (b.slot ? ' <span class="small">CITY 0' + b.slot + (b.snapshot ? ' · from ' + esc(b.snapshot) : '') + '</span>' : '') + (b.slot && b.id !== cur.id ? ' <button class="btn small" data-ac="p9_loadSlot" data-v="' + b.slot + '">Open</button>' : '') + '</div>' + kids(b.id).map(function (k) { return node(k, depth + 1); }).join(''); };
  const roots = [{ id: 'original', name: 'Original Timeline' }].concat(reg.filter(function (b) { return b.parent && b.parent !== 'original' && !reg.some(function (x) { return x.id === b.parent; }); }));
  return roots.map(function (r) { return node(r, 0); }).join('');
}
function cloneWorld(name, slot) {
  slot = slot | 0;
  if (!slot) for (let n = 1; n <= SLOT_COUNT; n++) if (!slotInfo(n).exists && n !== (S.slot || 1)) { slot = n; break; }
  if (!slot || slot === (S.slot || 1)) return { ok: false, reason: 'No free city slot (the clone must use another slot)' };
  const obj = buildSaveObject(), nm = String(name || (S.city.name + ' B')).replace(/[<>]/g, '').slice(0, 32);
  obj.city.name = nm;
  obj.p8 = Object.assign({}, obj.p8, { copyOf: S.city.name });
  obj.p9 = Object.assign({}, obj.p9, { branch: { id: newBranchId(), name: 'Clone of ' + S.city.name, parent: S.p9.branch.id, from: 'clone' } });
  obj.header = Object.assign({}, obj.header, { cityName: nm, city: nm, slot: slot });
  try { Store.setItem(slotKey(slot), JSON.stringify(obj)); } catch (e) { return { ok: false, reason: e.message }; }
  const reg = branchRegistry(); reg.push({ id: obj.p9.branch.id, name: nm + ' (clone)', parent: S.p9.branch.id, parentName: S.p9.branch.name, snapshot: '', slot: slot, city: nm, created: Date.now() }); saveBranchRegistry(reg);
  adminLog('CLONE WORLD: ' + S.city.name + ' → ' + nm + ' (CITY 0' + slot + ')');
  return { ok: true, slot: slot, name: nm };
}

/* ===================================== ENTITY INSPECTOR ===================================== */
const EI = { open: false, ref: null, pick: false };
function inspectEntity(kind, id) { EI.ref = { kind: kind, id: id }; EI.open = true; ensureInspectorDom(); $('entityInspector').classList.remove('hidden'); renderEntityInspector(); }
function closeInspector() { EI.open = false; EI.ref = null; const el = $('entityInspector'); if (el) el.classList.add('hidden'); }
function ensureInspectorDom() {
  if ($('entityInspector')) return;
  const d = document.createElement('div'); d.id = 'entityInspector'; d.className = 'hidden';
  d.innerHTML = '<div class="eiHead"><b>🔎 ENTITY INSPECTOR</b><span><button class="btn small" id="eiPick" title="Pick another entity on the map">🎯</button><button class="closeX" id="eiClose">✕</button></span></div><div id="eiBody"></div>';
  document.body.appendChild(d);
  $('eiClose').onclick = closeInspector;
  $('eiPick').onclick = function () { EI.pick = true; toast('🎯 Click a citizen, vehicle, building, road or empty land', ''); };
  d.addEventListener('click', function (e) { const el = e.target.closest('[data-ei]'); if (!el) return; eiAction(el.dataset.ei, el.dataset.v); });
}
function eiRow(k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; }
function renderEntityInspector() {
  const el = $('eiBody'); if (!el || !EI.ref) return;
  const r = EI.ref; let h = '';
  try {
    if (r.kind === 'citizen') {
      const c = AG.citizens.find(function (x) { return x.id === r.id; }); if (!c) { el.innerHTML = '<p class="small">This citizen left the city.</p>'; return; }
      citizenProfile(c); const j = citizenJob(c), home = citizenBuilding(c.home), work = citizenBuilding(c.work), hh = householdOf(c);
      const act = c.transit ? ({ walk: 'Walking to the stop', wait: 'Waiting at a stop', ride: 'Riding ' + (lineById(c.transit.line) || {}).name }[c.transit.phase]) : c.driving ? 'Driving' : c.inside ? 'Inside ' + (citizenBuilding(c.inside) ? BUILDINGS[citizenBuilding(c.inside).type].name : 'a building') : c.parkUntil ? 'In the park' : c.path ? 'Walking' : 'Idle';
      h = '<h4>' + (c.tourist ? '🧳 Tourist' : '🧑 Citizen') + ' #' + c.id + '</h4>' + eiRow('ID', '#' + c.id) + eiRow('Age', c.age) + eiRow('Job', esc(j.title)) + eiRow('Income', money(j.income) + '/day') + eiRow('Home', home ? esc(BUILDINGS[home.type].name) + ' · ' + esc(districtName(home.x, home.y)) : '—') + eiRow('Workplace', work ? esc(BUILDINGS[work.type].name) : '—') +
        eiRow('Household', hh ? hh.size + ' members · ' + money(hh.income) + ' in / ' + money(hh.expenses) + ' out · ' + hh.transport : '—') + eiRow('Happiness', Math.round(c.happiness || 0) + '%') + eiRow('Current location', esc(districtName(Math.floor(c.x / TILE), Math.floor(c.y / TILE))) + ' (' + Math.floor(c.x / TILE) + ',' + Math.floor(c.y / TILE) + ')') + eiRow('Current activity', esc(act) + ' · ' + c.state) +
        '<div class="small" style="margin-top:4px">Needs</div>' + ['food', 'fun', 'shopping', 'work'].map(function (k) { return eiBar(k, c.needs[k]); }).join('') + eiBar('energy', c.energy) +
        '<div class="row"><button class="btn small" data-ei="fly" data-v="' + Math.floor(c.x / TILE) + ',' + Math.floor(c.y / TILE) + '">📍 Focus</button><button class="btn small" data-ei="needs">🍔 Fill needs</button></div>';
    } else if (r.kind === 'vehicle') {
      const v = AG.vehicles.find(function (x) { return x.id === r.id; }); if (!v) { el.innerHTML = '<p class="small">The vehicle reached its destination.</p>'; return; }
      const L = v.line ? lineById(v.line) : null;
      h = '<h4>🚗 Vehicle #' + v.id + ' · ' + v.type + '</h4>' + eiRow('Speed', Math.round(v.speed) + ' / ' + Math.round(v.maxSpeed)) + eiRow('Lane', ((v.lane || 0) + 1) + ' of ' + lanesPerDir(v.path[Math.min(v.seg, v.path.length - 1)])) + eiRow('State', v.state || 'moving') + eiRow('Destination', v.dest ? esc(BUILDINGS[v.dest.type].name) : v.toEdge ? 'Neighbouring city' : '—') +
        eiRow('Route', (v.path.length - v.seg) + ' tiles left · mode ' + (v.mode || 'fixed')) + (L ? eiRow('Line', esc(L.name) + ' · ' + (v.pax || []).length + ' aboard') : '') + (v.cargo ? eiRow('Cargo', v.cargo.qty + ' ' + esc(v.cargo.item) + ' from ' + esc(v.cargo.from)) : '') + (v.station ? eiRow('Station', esc(BUILDINGS[MAP.byId.get(v.station) ? MAP.byId.get(v.station).type : 'townhall'].name)) : '') +
        (v.routeInfo ? '<p class="small">🧭 ' + esc(routeInfoText(v.routeInfo)) + '</p>' : '') + '<div class="row"><button class="btn small" data-ei="fly" data-v="' + Math.floor(v.x / TILE) + ',' + Math.floor(v.y / TILE) + '">📍 Focus</button><button class="btn small" data-ei="reroute">🧭 Re-route</button></div>';
    } else if (r.kind === 'building') {
      const b = MAP.byId.get(r.id); if (!b) { el.innerHTML = '<p class="small">Demolished.</p>'; return; }
      const d = bdef(b), c = b.cond === undefined ? 100 : b.cond, ph = !b.built ? constructionPhase(b) : null;
      h = '<h4>' + d.icon + ' ' + esc(d.name) + ' Lv' + b.level + '</h4>' + eiRow('Owner', ownerName(b)) + eiRow('District', esc(districtName(b.x, b.y)) + ' · ' + regionOfTile(b.x, b.y).name) + eiRow('Condition', '<span style="color:' + condColor(c) + '">' + Math.round(c) + '% ' + condLabel(c) + '</span>') +
        (ph ? eiRow('Construction', ph[1] + ' · ' + Math.round(b.progress * 100) + '%' + (b.cp && b.cp.wait ? ' · ' + b.cp.wait : '')) : '') + (d.workers ? eiRow('Workers', Math.round(b._actW || 0) + ' / ' + b.workers) : '') + eiRow('Efficiency', Math.round((b._eff || 0) * 100) + '%') +
        (d.power < 0 ? eiRow('Electricity', b._powered ? '✓ powered' + (b._gridOver ? '' : '') : b._gridNo ? '✕ no grid connection' : b._gridOver ? '✕ brownout (transformer overload)' : '✕ unpowered') : '') + (d.power > 0 ? eiRow('Output', Math.round(b._gen || 0) + ' MW') : '') +
        (d.water < 0 ? eiRow('Water pressure', Math.round((b._wp || 0) * 100) + '%') : '') + eiRow('Land value', money(landValueTile(b.x, b.y)) + '/tile · ×' + (b._lvF || 1).toFixed(2)) + eiRow('Value', money(buildingValue(b))) + (b._rev ? eiRow('Revenue', signMoney(b._rev) + '/s') : '') +
        (b.type === 'maintdepot' ? eiRow('Contractor', contractorOf(b)) : '') + utilityRowsHtml(b) +
        '<div class="row admRowWrap"><button class="btn small" data-ei="fly" data-v="' + b.x + ',' + b.y + '">📍 Focus</button><button class="btn small" data-ei="repair">🔧 Repair</button>' + (b.built && b.level < MAX_LEVEL ? '<button class="btn small" data-ei="upgrade">⬆ +1 level</button>' : '') + (isAI(b) ? '<button class="btn small" data-ei="company" data-v="' + b.owner + '">🏢 Company</button>' : '') + '</div>';
    } else if (r.kind === 'company') {
      const a = aiDef(r.id), st = S.ai[r.id] || {}; if (!a) { el.innerHTML = '<p class="small">Unknown company.</p>'; return; }
      const sec = a.sectors[0], sh = SIM.share && SIM.share[sec] ? (SIM.share[sec][a.id] || 0) : 0, n = S.buildings.list.filter(function (b) { return b.owner === a.id; }).length;
      h = '<h4>' + a.icon + ' ' + esc(a.name) + '</h4>' + eiRow('Sector', sec) + eiRow('Cash', money(st.cash || 0)) + eiRow('Revenue', signMoney(st.rev || 0) + '/s') + eiRow('Profit', signMoney(st.profit || 0) + '/s') + eiRow('Market share', Math.round(sh * 100) + '%') + eiRow('Buildings', n) + eiRow('Reputation', Math.round(st.rep || 0)) + eiRow('Stock', '$' + stockOf(a.id).price.toFixed(2));
    } else if (r.kind === 'road') {
      const t = r.id; if (!MAP.roads[t]) { el.innerHTML = '<p class="small">The road was removed.</p>'; return; }
      const rt = ROAD_TYPES[MAP.roads[t]], x = t % MAP.W, y = (t / MAP.W) | 0, inc = S.p9.traffic.incidents.filter(function (i) { return i.tiles.indexOf(t) >= 0; });
      h = '<h4>🛣 ' + rt.name + '</h4>' + eiRow('Tile', x + ',' + y + ' · chunk ' + chunkOfTile(x, y)) + eiRow('Lanes', rt.lanes + ' (' + rt.lanes / 2 + ' per direction)') + eiRow('Speed', '×' + rt.speed) + eiRow('Congestion', Math.round((MAP.cong ? MAP.cong[t] : 0) * 100) + '%') + eiRow('Shape', ROAD_SHAPE_NAMES[(MAP.shape[t] || roadShapeCode(x, y)) % 10] || '') + eiRow('District', esc(districtName(x, y))) +
        eiRow('Status', MAP.blocked[t] ? ['', 'Accident', 'Broken water main', 'Closed', 'Breakdown (one lane)'][MAP.blocked[t]] : 'Open') + (inc.length ? eiRow('Incident', inc.map(function (i) { return INCIDENT_TYPES[i.type].icon + ' ' + INCIDENT_TYPES[i.type].name; }).join(', ')) : '') +
        (MAP.inter[t] ? '<div class="small" style="margin-top:4px">Junction: <b>' + JUNCTION_TYPES[junctionType(t)] + '</b>' + (junctionType(t) === 'signal' ? ' · phase ' + SIG_PHASES[sigState(t).ph] + (S.p9.traffic.lightAI ? ' (AI)' : ' (fixed)') : '') + '</div><div class="row admRowWrap">' + ['auto', 'signal', 'roundabout', 'priority', 'stop'].map(function (k) { return '<button class="btn small" data-ei="junction" data-v="' + k + '">' + (k === 'auto' ? 'Auto' : JUNCTION_TYPES[k]) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="row admRowWrap">' + (MAP.blocked[t] === 3 ? '<button class="btn small green" data-ei="reopen">✅ Reopen road</button>' : '<button class="btn small red" data-ei="close">⛔ Close road</button>') + '<button class="btn small" data-ei="roadwork">🚧 Road works</button><button class="btn small" data-ei="accident">💥 Accident</button></div>';
    } else if (r.kind === 'district') {
      const x = r.id % MAP.W, y = (r.id / MAP.W) | 0, n = Math.ceil(MAP.W / 8), k = Math.floor(y / 8) * n + Math.floor(x / 8), dd = MAP.districts[k] || {};
      let val = 0, air = 0, nz = 0, cnt = 0; for (let yy = Math.floor(y / 8) * 8; yy < Math.floor(y / 8) * 8 + 8 && yy < MAP.H; yy++) for (let xx = Math.floor(x / 8) * 8; xx < Math.floor(x / 8) * 8 + 8 && xx < MAP.W; xx++) { const i = idx(xx, yy); val += landValueTile(xx, yy); if (envReady()) { air += ENV.air[i]; nz += ENV.noise[i]; } cnt++; }
      const g = GRID.districts[k];
      h = '<h4>🏘 ' + esc(districtName(x, y) || 'District') + '</h4>' + eiRow('Region', regionOfTile(x, y).name) + eiRow('Chunk', chunkLabel(chunkOfTile(x, y))) + eiRow('Density', DENSITY_NAMES[dd.level || 0]) + eiRow('Residents', fmt(Math.round(dd.res || 0))) + eiRow('Jobs', fmt(dd.jobs || 0)) + eiRow('Avg land value', money(val / Math.max(1, cnt)) + '/tile') +
        eiRow('Pollution', Math.round(air / Math.max(1, cnt) * 100) + '%') + eiRow('Noise', Math.round(nz / Math.max(1, cnt) * 100) + '%') + (g ? eiRow('Transformer', Math.round(g.load) + ' / ' + Math.round(g.cap) + ' MW' + (g.over ? ' ⚠ OVERLOAD' : '')) : '') + (SEWER.districts && SEWER.districts[k] ? eiRow('Sewage', fmt(SEWER.districts[k]) + ' units') : '') +
        '<div class="row"><button class="btn small" data-ei="fly" data-v="' + x + ',' + y + '">📍 Focus</button></div>';
    }
  } catch (e) { h = '<p class="neg">Inspector error: ' + esc(e.message) + '</p>'; }
  el.innerHTML = h;
}
function eiBar(k, v) { v = clamp(v || 0, 0, 100); return '<div class="eiBar"><span>' + k + '</span><i><em style="width:' + v + '%;background:' + (v > 50 ? '#06d6a0' : v > 25 ? '#ffd166' : '#ef476f') + '"></em></i><b>' + Math.round(v) + '</b></div>'; }
function utilityRowsHtml(b) {
  let h = '';
  const s = GRID.subs.find(function (x) { return x.b === b; });
  if (s) h += eiRow('Grid feeder', Math.round(s.load) + ' / ' + Math.round(s.cap) + ' MW' + (s.over ? ' ⚠ OVERLOAD' : '') + (s.failed ? ' · FAILED' : ''));
  if (b.type === 'reservoir') h += eiRow('Stored water', fmt(S.p9.water.stored) + ' / ' + fmt(S.p9.water.capacity));
  if (b.type === 'pumpstation') h += eiRow('Pressure at pump', Math.round((WNET.pres && b._entry >= 0 ? WNET.pres[b._entry] : 0) * 100) + '%');
  if (b.type === 'sewageplant') h += eiRow('Treatment', fmt(500 * lvlMult(b.level)) + ' units · city ' + Math.round((1 - SEWER.overload) * 100) + '% treated');
  return h;
}
function eiAction(a, v) {
  const r = EI.ref; if (!r) return;
  if (a === 'fly') { const p = String(v).split(','); flyToTile(+p[0], +p[1], Math.max(CAM.zoom, 0.9)); return; }
  if (a === 'company') { inspectEntity('company', v); return; }
  if (!ADM.mode) { toast('🛡️ Inspector actions need admin mode (F10)', ''); return; }
  if (a === 'needs') { const c = AG.citizens.find(function (x) { return x.id === r.id; }); if (c) { c.needs.food = c.needs.fun = c.needs.shopping = c.needs.work = 100; c.energy = 100; } }
  if (a === 'reroute') { const vv = AG.vehicles.find(function (x) { return x.id === r.id; }); if (vv) resetVehicleRoute(vv); }
  if (a === 'repair') { const b = MAP.byId.get(r.id); if (b) { b.cond = 100; b.damaged = 0; b.repair = 0; b.fire = 0; } }
  if (a === 'upgrade') { const b = MAP.byId.get(r.id); if (b && b.level < MAX_LEVEL) b.level++; computeCoverage(); }
  if (a === 'junction') { setJunctionType(r.id, v); }
  if (a === 'close') createIncident('closure', r.id, { dur: 600 });
  if (a === 'reopen') { S.p9.traffic.incidents.filter(function (i) { return i.tiles.indexOf(r.id) >= 0; }).forEach(endIncident); if (MAP.blocked[r.id] === 3) MAP.blocked[r.id] = 0; MAP.pathCache.clear(); }
  if (a === 'roadwork') createIncident('roadwork', r.id);
  if (a === 'accident') createIncident('accident', r.id);
  if (ADM.mode) adminLog('Inspector: ' + a + ' on ' + r.kind + ' ' + r.id);
  renderEntityInspector();
}
/* Picks whatever is under the pointer: agent → building → road → district */
function inspectorPickAt(sx, sy) {
  const w = screenToWorld(sx, sy), hit = pickAgent(w.x, w.y);
  if (hit && hit.c) return inspectEntity('citizen', hit.c.id);
  if (hit && hit.v) return inspectEntity('vehicle', hit.v.id);
  const b = pickBuilding(w.x, w.y);
  if (b) return inspectEntity('building', b.id);
  const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
  if (!inMap(tx, ty)) return;
  if (MAP.roads[idx(tx, ty)]) return inspectEntity('road', idx(tx, ty));
  return inspectEntity('district', idx(tx, ty));
}

/* ===================================== WORLD BRUSH & REGION SELECTOR ===================================== */
const BRUSH_MODES = { build: '🏗 Build', destroy: '💥 Destroy', upgrade: '⬆ Upgrade', repair: '🔧 Repair', road: '🛣 Road', zone: '🟩 Zone', park: '🌳 Park', water: '🌊 Water', forest: '🌲 Forest', terrain: '⛰ Terrain', pollution: '🏭 Pollution', landvalue: '💎 Land Value' };
const BRUSH_SIZES = [1, 5, 10, 25, 50, 100];
const WB = { on: false, mode: 'forest', size: 5, building: 'house', zone: 1, roadType: 1, terrainOp: 'raise', sign: 1, last: '', dirty: false, applied: 0 };
const RS = { on: false, drag: null, rect: null };
function brushTiles(cx, cy) {
  const r = WB.size <= 1 ? 0 : WB.size / 2, out = [];
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (inMap(x, y) && (r === 0 ? x === cx && y === cy : Math.hypot(x - cx, y - cy) <= r)) out.push([x, y]);
  return out;
}
function applyBrush(tx, ty) {
  const key = tx + ',' + ty + ',' + WB.mode; if (key === WB.last) return 0; WB.last = key;
  const tiles = brushTiles(tx, ty); let n = 0;
  const free = function (x, y) { const i = idx(x, y); return !MAP.occ[i] && !MAP.roads[i] && MAP.nature[i] !== 2; };
  const seen = new Set();
  tiles.forEach(function (p) {
    const x = p[0], y = p[1], i = idx(x, y);
    switch (WB.mode) {
      case 'build': case 'park': {
        if (n >= 60) return;
        const d = BUILDINGS[WB.mode === 'park' ? 'park' : WB.building] || BUILDINGS.house;
        if (!inUnlocked(x, y) || !inUnlocked(x + d.w - 1, y + d.h - 1) || !wgCanPlace(d, x, y)) return;          // admin brush ignores zoning
        const cost = S.p5.admin.god ? 0 : buildCost(d), payer = payerFor(d);
        if (funds(payer) < cost) return;
        spend(payer, cost);
        const b = wgCommit(d.id, x, y, {}); if (d.public) b.owner = 'city'; b.cond = 100; n++;
      } break;
      case 'destroy': { const b = buildingAtTile(x, y); if (b && !bdef(b).noDemolish && !seen.has(b.id)) { seen.add(b.id); removeBuilding(b); n++; } else if (!b && MAP.nature[i] === 1) { MAP.nature[i] = 0; n++; } } break;
      case 'upgrade': { const b = buildingAtTile(x, y); if (b && !seen.has(b.id) && b.level < MAX_LEVEL) { seen.add(b.id); b.level++; n++; } } break;
      case 'repair': { const b = buildingAtTile(x, y); if (b && !seen.has(b.id)) { seen.add(b.id); b.cond = 100; b.damaged = 0; b.repair = 0; b.fire = 0; n++; } } break;
      case 'road': if (!MAP.occ[i] && MAP.roads[i] < WB.roadType) { MAP.roads[i] = WB.roadType; MAP.zone[i] = 0; if (MAP.nature[i] === 1) MAP.nature[i] = 0; n++; } break;
      case 'zone': if (!MAP.occ[i] && !MAP.roads[i] && MAP.nature[i] !== 2) { MAP.zone[i] = WB.zone; n++; } break;
      case 'water': if (!MAP.occ[i] && !MAP.roads[i]) { MAP.nature[i] = WB.sign > 0 ? 2 : 0; MAP.terrain[i] = WB.sign > 0 ? TERRAIN.WATER : TERRAIN.GRASS; MAP.zone[i] = 0; MAP.res[i] = 0; n++; } break;
      case 'forest': if (free(x, y) && MAP.terrain[i] !== TERRAIN.ROCK) { MAP.nature[i] = WB.sign > 0 ? 1 : 0; n++; } else if (WB.sign < 0 && MAP.nature[i] === 1) { MAP.nature[i] = 0; n++; } break;
      case 'terrain': if (!MAP.occ[i] && MAP.nature[i] !== 2) { const t = MAP.terrain[i]; MAP.terrain[i] = WB.terrainOp === 'flatten' ? TERRAIN.GRASS : WB.terrainOp === 'lower' ? (t === TERRAIN.ROCK ? TERRAIN.HILL : TERRAIN.GRASS) : (t === TERRAIN.GRASS || t === TERRAIN.SAND ? TERRAIN.HILL : TERRAIN.ROCK); n++; } break;
      case 'pollution': { const pb = S.p9.env.polBrush; pb[i] = clamp((pb[i] || 0) + 0.6 * WB.sign, -5, 20); if (Math.abs(pb[i]) < 0.01) delete pb[i]; if (WB.sign < 0 && envReady()) ENV.c[i] *= 0.3; n++; } break;
      case 'landvalue': propBrush(i, 0.15 * WB.sign); n++; break;
      default: if (typeof p11BrushTile === 'function') n += p11BrushTile(WB.mode, x, y, i, seen);          // Part 11 brushes (utility, demolish, sidewalks, plazas, bike lanes)
    }
  });
  if (n) { WB.dirty = true; WB.applied += n; if (['build', 'park', 'destroy', 'road', 'water', 'upgrade', 'demolish'].indexOf(WB.mode) >= 0) onMapChanged(); else MAP.groundDirty = true; if (WB.mode === 'water') computeSea(); if (WB.mode === 'landvalue') propTick(true); if (WB.mode === 'pollution') envTick(true); }
  return n;
}
function brushStrokeEnd() { if (!WB.dirty) return; WB.dirty = false; onMapChanged(); if (ADM.mode) adminLog('World brush ' + WB.mode + ' size ' + WB.size + ': ' + WB.applied + ' tile(s)'); WB.applied = 0; WB.last = ''; }
function drawBrushOverlay() {
  if (!WB.on || !UI.hover) return;
  const r = WB.size <= 1 ? 0.5 : WB.size / 2, cx = (UI.hover.x + 0.5) * TILE, cy = (UI.hover.y + 0.5) * TILE;
  ctx.strokeStyle = WB.sign < 0 ? '#ef476f' : '#ffd166'; ctx.lineWidth = 2 / CAM.zoom; ctx.beginPath(); ctx.arc(cx, cy, r * TILE, 0, 6.283); ctx.stroke();
  ctx.fillStyle = 'rgba(255,209,102,.12)'; ctx.fill();
}
function setBrush(on) { WB.on = !!on; if (WB.on) { RS.on = false; EI.pick = false; toast('🖌 WORLD BRUSH: ' + BRUSH_MODES[WB.mode] + ' · size ' + WB.size + ' — drag on the map (Esc or F10 to stop)', ''); } }
function setRegionSelect(on) { RS.on = !!on; RS.drag = null; if (RS.on) { WB.on = false; toast('▭ SELECT REGION — drag a rectangle on the map', ''); } }
function regionRectTiles(r) { const out = [], x0 = Math.min(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), x1 = Math.max(r.x0, r.x1), y1 = Math.max(r.y0, r.y1); for (let y = Math.max(0, y0); y <= Math.min(MAP.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(MAP.W - 1, x1); x++) out.push([x, y]); return out; }
function regionSelectionStats() {
  const r = RS.rect; if (!r) return null;
  const tiles = regionRectTiles(r); let roads = 0, val = 0, air = 0, n = 0; const bs = new Set();
  tiles.forEach(function (p) { const i = idx(p[0], p[1]); if (MAP.roads[i]) roads++; if (MAP.occ[i]) bs.add(MAP.occ[i]); val += landValueTile(p[0], p[1]); if (envReady()) air += ENV.air[i]; n++; });
  let homes = 0; bs.forEach(function (id) { const b = MAP.byId.get(id); if (b && bdef(b).housing) homes += b._hcap || 0; });
  return { tiles: n, roads: roads, buildings: bs.size, homes: homes, value: val / Math.max(1, n), pollution: air / Math.max(1, n), x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}
function regionAction(a) {
  const r = RS.rect; if (!r) return 'Select a region first';
  const tiles = regionRectTiles(r); let n = 0;
  const seen = new Set();
  if (a === 'roads') { let cost = 0; tiles.forEach(function (p) { const i = idx(p[0], p[1]); if (MAP.roads[i] && MAP.roads[i] < 3) { cost += roadCost(MAP.roads[i] + 1) - roadCost(MAP.roads[i]); } }); if (!payAdvisor(cost)) return 'Not enough budget (' + money(cost) + ')'; tiles.forEach(function (p) { const i = idx(p[0], p[1]); if (MAP.roads[i] && MAP.roads[i] < 3) { MAP.roads[i]++; n++; } }); onMapChanged(); return 'Upgraded ' + n + ' road tile(s) for ' + money(cost); }
  if (a === 'repair') { tiles.forEach(function (p) { const b = buildingAtTile(p[0], p[1]); if (b && !seen.has(b.id)) { seen.add(b.id); b.cond = 100; b.damaged = 0; b.repair = 0; b.fire = 0; n++; } }); return 'Repaired ' + n + ' building(s)'; }
  if (a === 'utilities') { const st = regionSelectionStats(), cx = Math.round((st.x0 + st.x1) / 2), cy = Math.round((st.y0 + st.y1) / 2), built = []; ['substation', 'watertower', 'pumpstation', 'sewageplant'].forEach(function (t) { if (placeUtilityNear(t, cx, cy, S.p5.admin.god)) built.push(BUILDINGS[t].name); }); onMapChanged(); return built.length ? 'Built ' + built.join(', ') : 'No free lots in the region'; }
  if (a === 'value') { tiles.forEach(function (p) { propBrush(idx(p[0], p[1]), 0.25); n++; }); propTick(true); return 'Land value raised on ' + n + ' tile(s)'; }
  if (a === 'trees') { tiles.forEach(function (p) { const i = idx(p[0], p[1]); if (!MAP.occ[i] && !MAP.roads[i] && MAP.nature[i] === 0 && MAP.terrain[i] !== TERRAIN.ROCK && decoRand(p[0], p[1], 77) < 0.55) { MAP.nature[i] = 1; n++; } }); MAP.groundDirty = true; return 'Planted ' + n + ' tree(s)'; }
  if (a === 'pollution') { const pb = S.p9.env.polBrush; tiles.forEach(function (p) { const i = idx(p[0], p[1]); delete pb[i]; if (envReady()) { ENV.c[i] = 0; ENV.air[i] = 0; ENV.soil[i] *= 0.3; } n++; }); return 'Pollution removed from ' + n + ' tile(s)'; }
  return '';
}

/* ===================================== QUICK ACTIONS ===================================== */
const QUICK_ACTIONS = [
  ['GENERATE WORLD', '🌍', 'q_generate', 'gold'], ['REPAIR WORLD', '🔧', 'q_repairWorld', 'green'], ['MAX CITY', '🏙️', 'q_maxCity', ''], ['UNLOCK EVERYTHING', '🔓', 'q_unlock', 'blue'],
  ['BUILD ALL UTILITIES', '⚡', 'q_utilities', ''], ['FIX TRAFFIC', '🚦', 'q_fixTraffic', ''], ['FIX ECONOMY', '💹', 'q_fixEconomy', ''], ['REPAIR ALL', '🛠️', 'q_repairAll', ''],
  ['CLEAR DISASTERS', '🧯', 'q_clearDisasters', ''], ['MAX HAPPINESS', '😊', 'q_maxHappy', ''], ['CLEAR POLLUTION', '🌿', 'q_clearPollution', ''], ['FILL TREASURY', '💰', 'q_treasury', 'gold'],
  ['SPAWN MEGACITY', '🌆', 'q_megacity', 'red'], ['CREATE NEW REGION', '🗺️', 'q_newRegion', ''], ['CLONE WORLD', '🧬', 'q_clone', ''], ['CREATE SNAPSHOT', '📸', 'q_snapshot', '']
];
function buildAllUtilities() {
  const out = [];
  econTick(1);
  if (SIM.powerGen < SIM.powerUse * 1.15) { wgAddPower(null, SIM.powerUse * 1.25 - SIM.powerGen); out.push('power'); onMapChanged(); econTick(1); }
  if (SIM.waterGen < SIM.waterUse * 1.15) { wgAddWater(null, SIM.waterUse * 1.25 - SIM.waterGen); out.push('water'); onMapChanged(); econTick(1); }
  if ((SIM.wasteGen || 0) > (SIM.wasteCap || 0) * 0.8) { wgAddWaste(null); out.push('waste'); }
  const f = p9AutoFixUtilities(); if (f) out.push(f);
  return out;
}
function p9AutoFixUtilities() {
  const subs = gridAutoSubstations(true); let sew = 0; sewagePass();
  for (let g = 0; g < 10 && SEWER.overload > 0.04; g++) {
    const k = SEWER.districts.indexOf(Math.max.apply(null, SEWER.districts)), n = SEWER.n;
    if (!placeUtilityNear('sewageplant', (k % n) * 8 + 4, Math.floor(k / n) * 8 + 4, true) && !wgPlaceAnywhere(null, 'sewageplant', { owner: 'city', clearSmall: true })) break;
    sew++; onMapChanged(); econTick(1); sewagePass();
  }
  const pumps = placePumpsForPressure(true, 10);
  return subs + sew + pumps ? subs + ' substation(s), ' + sew + ' sewage plant(s), ' + pumps + ' pump(s)' : '';
}
/* Pumps go to the low-pressure cluster farthest from every existing source and pump */
function placePumpsForPressure(free, max) {
  waterNetPass(true); let n = 0;
  for (let g = 0; g < max && WNET.low > 0.08; g++) {
    const low = S.buildings.list.filter(function (b) { return bdef(b).water < 0 && b.built && b._entry >= 0 && (b._wp || 0) < 0.3; }); if (!low.length) break;
    const src = S.buildings.list.filter(function (b) { return (bdef(b).water > 0 || b.type === 'pumpstation' || b.type === 'reservoir') && b.built; });
    let best = null, bd = -1;
    low.forEach(function (b) { let d = 1e9; src.forEach(function (s) { d = Math.min(d, Math.abs(s.x - b.x) + Math.abs(s.y - b.y)); }); const near = low.filter(function (o) { return Math.abs(o.x - b.x) + Math.abs(o.y - b.y) < 8; }).length; const sc = d + near * 2; if (sc > bd) { bd = sc; best = b; } });
    if (!best || !placeUtilityNear('pumpstation', best.x, best.y, free)) break;
    n++; onMapChanged(); waterNetPass(true);
  }
  return n;
}
function fixTraffic() {
  const inc = S.p9.traffic.incidents.length + AG.accidents.length;
  clearIncidents(); S.p9.traffic.lightAI = true;
  let stuck = 0; for (let i = AG.vehicles.length - 1; i >= 0; i--) if (AG.vehicles[i].stopped > 2) { removeVehicle(i, false); stuck++; }
  MAP.pathCache.clear();
  const cells = districtCells().filter(function (c) { return c.roads.length >= 4; }).sort(function (a, b) { return b.avgCong - a.avgCong; }).slice(0, 3);
  let up = 0; cells.forEach(function (c) { c.roads.forEach(function (t) { if (MAP.cong && MAP.cong[t] > 0.5 && MAP.roads[t] < 3) { MAP.roads[t]++; up++; } }); });
  if (up) onMapChanged();
  if (MAP.cong) MAP.cong.fill(0);
  return inc + ' incident(s) cleared, ' + stuck + ' stuck vehicle(s) removed, ' + up + ' road tile(s) widened, Traffic Light AI on';
}
function fixEconomy() {
  let n = 0;
  AI_DEFS.forEach(function (a) { const st = S.ai[a.id]; if (!st || !isFinite(st.cash) || st.cash < 0) { repairCompany(a.id, new Error('fixEconomy')); n++; } });
  if (S.city.tax > 18 || S.city.tax < 5) S.city.tax = 10;
  SIM.unpaid = 0; SIM.budgetUnpaid = 0;
  if (S.budget < 0 || (SIM.bNet || 0) < 0) S.budget = Math.max(S.budget, Math.abs(SIM.bNet || 0) * 3600 + 1e5);
  if (S.money < 0) S.money = 0;
  S.p6.econ.infl = clamp(S.p6.econ.infl, 0, 0.04);
  return n + ' company record(s) repaired, tax ' + S.city.tax + '%, budget ' + money(S.budget) + ', inflation ' + (S.p6.econ.infl * 100).toFixed(1) + '%';
}
function quickAction(id) {
  switch (id) {
    case 'q_generate': ADM.cat = 'world'; renderAdminCenter(); return adminGenerate();
    case 'q_repairWorld': { const r = p9AutoFix(true); ADM.lastFix = r.actions; return admRe('REPAIR WORLD: ' + r.actions.length + ' action(s) · validator ' + r.validation.score + '%'); }
    case 'q_maxCity': return maxCity();
    case 'q_unlock': return confirmDialog('🔓 Unlock everything?', 'All regions, buildings, technologies and quests are unlocked for this city.', 'Unlock', unlockEverything);
    case 'q_utilities': { const r = buildAllUtilities(); return admRe('BUILD ALL UTILITIES: ' + (r.length ? r.join(' · ') : 'already sufficient')); }
    case 'q_fixTraffic': return admRe('FIX TRAFFIC: ' + fixTraffic());
    case 'q_fixEconomy': return admRe('FIX ECONOMY: ' + fixEconomy());
    case 'q_repairAll': { const n = repairAllConditions(); const p = S.p9.water.breaks.length; S.p9.water.breaks = []; for (let i = 0; i < MAP.blocked.length; i++) if (MAP.blocked[i] === 2) MAP.blocked[i] = 0; MAP.pathCache.clear(); return admRe('REPAIR ALL: ' + n + ' building(s) restored to 100%, ' + p + ' water main(s) fixed'); }
    case 'q_clearDisasters': return admRe('CLEAR DISASTERS: ' + clearAllDisasters() + ' command disaster(s) ended, fires out, grid restored');
    case 'q_maxHappy': S.city.happiness = 100; AG.citizens.forEach(function (c) { c.needs.food = c.needs.fun = c.needs.shopping = c.needs.work = 100; c.energy = 100; c.happiness = 100; }); return admRe('MAX HAPPINESS: 100% · every citizen need filled');
    case 'q_clearPollution': S.city.pollution = 0; S.p9.env.polBrush = {}; if (envReady()) { ENV.c.fill(0); ENV.air.fill(0); ENV.soil.fill(0); ENV.water.fill(1); } S.city.waste = 0; return admRe('CLEAR POLLUTION: air, water and soil cleaned');
    case 'q_treasury': S.money = Math.max(S.money, 1e9); S.budget = Math.max(S.budget, 1e9); return admRe('FILL TREASURY: money and budget ≥ ' + money(1e9));
    case 'q_megacity': return confirmDialog('🌆 Spawn a megacity?', 'Generates a complete MEGA world (preset Mega City) in the current slot. Take a snapshot first if you want to keep this city.', 'Spawn', function () { closeAdminCenter(); S.p9.stats.worldsBuilt++; generateWorld('megacity', { name: 'Mega City ' + Math.floor(Math.random() * 90 + 10), slot: S.slot || 1 }); });
    case 'q_newRegion': return confirmDialog('🗺️ Create a new region?', 'A ring of 16 tiles is added around the world (' + MAP.W + '×' + MAP.H + ' → ' + (MAP.W + 32) + '×' + (MAP.H + 32) + '). Rivers, roads and terrain continue into the new land.', 'Create', function () { const r = expandWorld(1); if (r.ok) { S.p9.stats.regionsAdded++; saveGame(true); } admRe(r.ok ? 'CREATE NEW REGION: ' + r.msg : r.reason, r.ok ? 'good' : 'bad'); });
    case 'q_clone': return admPromptAsk('🧬 CLONE WORLD', 'Name of the cloned city (saved as an independent city in a free slot):', S.city.name + ' B', function (nm) { const r = cloneWorld(nm, 0); admRe(r.ok ? 'CLONE WORLD → CITY 0' + r.slot + ' "' + r.name + '"' : r.reason, r.ok ? 'good' : 'bad'); });
    case 'q_snapshot': { const s = createSnapshot('Snapshot ' + new Date().toLocaleString()); return admRe(s ? 'Snapshot created: ' + s.id : 'Snapshot failed', s ? 'good' : 'bad'); }
  }
}

/* ===================================== CONTROL CENTER VIEWS ===================================== */
const WC_CATS = [
  ['wc_world', '🌍', 'WORLD'], ['wc_sim', '🎮', 'SIMULATION'], ['wc_econ', '💰', 'ECONOMY'], ['wc_cit', '👥', 'CITIZENS'], ['wc_traffic', '🚦', 'TRAFFIC'], ['wc_events', '🌪', 'WORLD EVENTS'],
  ['wc_build', '🏗', 'BUILDINGS'], ['wc_util', '⚡', 'UTILITIES'], ['wc_debug', '🐞', 'DEBUG'], ['wc_inspect', '🔎', 'INSPECTOR'], ['wc_brush', '🖌', 'WORLD BRUSH'], ['wc_region', '▭', 'REGIONS'],
  ['wc_disaster', '🚨', 'DISASTER CMD'], ['wc_snap', '📸', 'SNAPSHOTS 2.0'], ['wc_time', '📜', 'TIMELINE'], ['wc_chal', '🏆', 'CHALLENGES'], ['wc_advisor', '🧠', 'ADVISOR 2.0']
];
function wcSel(id, opts, cur) { return '<select class="admInput" id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function pctBar(v, cls) { return '<span class="p9Bar ' + (cls || '') + '"><i style="width:' + clamp(v, 0, 100) + '%"></i></span>'; }
const WC_VIEWS = {
  wc_world: function () {
    const ch = weChunkSummary(), regs = weRegionStats(false);
    const N = MAP.W * MAP.H; let water = 0, hill = 0, rock = 0, forest = 0; for (let i = 0; i < N; i++) { const t = MAP.terrain[i]; if (t === TERRAIN.WATER) water++; else if (t === TERRAIN.HILL) hill++; else if (t === TERRAIN.ROCK) rock++; if (MAP.nature[i] === 1) forest++; }
    const map = '<div class="p9Chunks" style="grid-template-columns:repeat(' + WE.cw + ',1fr)">' + Array.from({ length: WE.n }, function (_, k) { return '<button class="p9Chunk t' + WE.tier[k] + '" style="border-color:' + REGION_DEFS[WE.region[k]].color + '" data-ac="p9_flyChunk" data-v="' + k + '" title="' + esc(chunkLabel(k)) + ' · ' + TIER_NAMES[WE.tier[k]] + '">' + k + '</button>'; }).join('') + '</div>';
    return aCard('🌍 World', '<div class="grid3">' + aKv('WORLD SEED', seedLabel()) + aKv('WORLD SIZE', ch.size) + aKv('CHUNKS', ch.chunks + ' (' + ch.grid + ')') + aKv('CLIMATE', esc((S.p8.world && S.p8.world.climate) || currentSeason().name)) + aKv('TERRAIN', Math.round(hill / N * 100) + '% hills') + aKv('WATER', Math.round(water / N * 100) + '%') + aKv('MOUNTAINS', Math.round(rock / N * 100) + '% rock') + aKv('FOREST', Math.round(forest / N * 100) + '%') + aKv('RESOURCES', S.economy.deposits.length + ' deposits') + '</div>' +
        aInput('wcSeed', 'World seed', seedLabel(), 'p9_seed') +
        '<div class="admRow"><span>Climate</span>' + wcSel('wcClimate', [['temperate', 'Temperate'], ['tropical', 'Tropical'], ['arid', 'Arid'], ['cold', 'Cold']], (S.p8.world && S.p8.world.climate) || 'temperate') + ab('p9_climate', 'Apply', 'blue') + '</div>' +
        aRow(ab('q_newRegion', '🗺️ CREATE NEW REGION (+1 chunk ring)', 'gold') + ab('p9_forest', '🌲 Grow forests +10%') + ab('p9_mountain', '⛰ Raise a mountain range') + ab('p9_lake', '🌊 Add a lake') + ab('p9_deposit', '⛏ Add resource deposit'))) +
      aCard('🧩 Chunks · streaming · simulation tiers', '<p class="small">Each square is a 16×16-tile chunk (border = region colour). Green = NEAR (full simulation), yellow = MID (reduced), grey = FAR (statistical). Ground bitmaps are streamed: <b>' + ch.loaded + '</b> loaded · ' + ch.loads + ' loads / ' + ch.unloads + ' unloads · ' + (ch.pixels / 1e6).toFixed(1) + ' MP cached.</p>' + map) +
      aCard('🗺 Regions', '<div class="p9Tbl"><div class="p9Th"><span>Region</span><span>Pop</span><span>Jobs</span><span>Homes</span><span>Traffic</span><span>Land $</span><span>Happy</span><span>Edu</span><span>Health</span><span>Energy</span><span>Water</span><span>Prod</span><span>Trade</span><span>Tourism</span></div>' + regs.map(function (r) { return '<div class="p9Tr"><span>' + r.icon + ' ' + r.name + '</span><span>' + fmt(Math.round(r.pop)) + '</span><span>' + fmt(r.jobs) + '</span><span>' + r.homes + '</span><span>' + Math.round(r.traffic) + '%</span><span>' + fmt(Math.round(r.landValue)) + '</span><span>' + Math.round(r.happiness) + '%</span><span>' + Math.round(r.education) + '%</span><span>' + Math.round(r.health) + '%</span><span>' + fmt(Math.round(r.energy)) + '</span><span>' + fmt(Math.round(r.water)) + '</span><span>' + r.prod.toFixed(1) + '</span><span>' + money(r.trade) + '</span><span>' + Math.round(r.tour) + '</span></div>'; }).join('') + '</div>') +
      aCard('🏙 Neighbouring cities', neighborsHtml());
  },
  wc_sim: function () {
    const F = S.p9.freeze;
    return aCard('🎮 Simulation', aRow(SIM_SPEEDS.map(function (sp) { return ab('speed', sp ? sp + '×' : '⏸ Pause', S.settings.speed === sp ? 'gold' : '', sp); }).join('')) +
      aToggle('freeze', '🧊 Freeze economy', S.p5.admin.freeze) + aToggle('p9_freeze" data-v="traffic', '🚗 Freeze traffic', F.traffic) + aToggle('p9_freeze" data-v="citizens', '👥 Freeze citizens', F.citizens) + aToggle('p9_freeze" data-v="weather', '🌦 Freeze weather', F.weather) + aToggle('p9_freeze" data-v="buildings', '🏗 Freeze buildings (construction, decay, growth)', F.buildings) +
      '<p class="small">Tick ' + Game.ticks + ' · TPS ' + Game.tpsMeasured.toFixed(1) + ' · ' + speedLabel(S.settings.speed) + ' · Day ' + gameDay() + ' · Year ' + gameYear() + ' (' + calendarYear() + ')</p>');
  },
  wc_econ: function () {
    return aCard('💰 Economy', aRow(ab('money', '+ $1M', 'gold', 1e6) + ab('money', '+ $100M', 'gold', 1e8) + ab('maxMoney', 'MAX MONEY', 'gold')) + aInput('aeMoney', 'Money', Math.floor(S.money), 'setMoney') + aInput('aeBudget', 'City budget', Math.floor(S.budget), 'setBudget') +
      aInput('aeInfl', 'Inflation % (yearly)', (S.p6.econ.infl * 100).toFixed(1), 'setInfl') + aInput('aeRate', 'Interest rate % (min 1)', (S.p5.econ.rate * 100).toFixed(2), 'setRate') + aInput('aeDem', 'Demand multiplier', S.p8.mods.demand, 'setDemand') +
      aInput('wcPrices', 'Price level multiplier (CPI)', (S.p6.econ.cpi / 100).toFixed(2), 'p9_prices') + aInput('wcGrowth', 'Company growth multiplier', S.p9.econ.growthMult, 'p9_growth') +
      '<p class="small">CPI ' + S.p6.econ.cpi.toFixed(1) + ' · company net ' + signMoney(SIM.pNet || 0) + '/s · budget net ' + signMoney(SIM.bNet || 0) + '/s · exports to neighbours ' + signMoney((SIM.p9Trade || {}).exp || 0) + '/s · property index ' + PROP.index + '</p>') +
      aCard('🏠 Property market', '<div class="grid3">' + aKv('AVG LAND VALUE', money(PROP.avg) + '/tile') + aKv('INDEX', PROP.index) + aKv('HOUSING PRICE', '×' + S.city.housingPrice.toFixed(2)) + aKv('DEMAND FACTOR', PROP.factors ? '×' + PROP.factors.demand.toFixed(2) : '—') + aKv('CRIME DISCOUNT', PROP.factors ? '−' + Math.round(PROP.factors.crime * 35) + '%' : '—') + aKv('TREND', PROP.history.length > 1 ? (PROP.history[PROP.history.length - 1] >= PROP.history[0] ? '▲ ' : '▼ ') + money(PROP.history[PROP.history.length - 1] - PROP.history[0]) : '—') + '</div>');
  },
  wc_cit: function () {
    const hs = HH.stats || {};
    const act = hs.activity || {};
    return aCard('👥 Citizens', '<div class="grid3">' + aKv('POPULATION', fmt(Math.floor(S.city.population))) + aKv('HAPPINESS', Math.round(S.city.happiness) + '%') + aKv('EMPLOYED', Math.round((1 - SIM.unemployment) * 100) + '%') + aKv('IN-COMMUTERS', fmt(Math.round(SIM.p9InCommuters || 0))) + aKv('OUT-COMMUTERS', fmt(Math.round(SIM.p9OutCommuters || 0))) + aKv('WAGE LEVEL', '×' + wageLevel().toFixed(2)) + '</div>' +
      aInput('acPop', 'Population', Math.floor(S.city.population), 'setPop') + aRow([1000, 100000, 1e6].map(function (n) { return ab('addPop', '+' + fmt(n), '', n); }).join('')) + aInput('acHap', 'Happiness (0-100)', Math.round(S.city.happiness), 'setHap') +
      aRow(ab('p9_jobs', '💼 +500 jobs') + ab('p9_income', '💵 Income +20%') + ab('p9_income', '💸 Income −20%', '', -1) + ab('p9_needs', '🍔 Fill all needs') + ab('p9_migrate', '🧳 Immigration wave (+10%)') + ab('p9_migrate', '🚪 Emigration (−10%)', '', -1))) +
      aCard('🏡 Households', '<div class="grid3">' + aKv('HOUSEHOLDS', fmt(hs.total || 0)) + aKv('AVG SIZE', (hs.avgSize || 2.6).toFixed(1)) + aKv('AVG INCOME', money(hs.income || 0) + '/day') + aKv('AVG EXPENSES', money(hs.expenses || 0) + '/day') + aKv('RENT SHARE', Math.round((hs.rentShare || 0) * 100) + '%') + aKv('SATISFACTION', Math.round(hs.satisfaction || 0) + '%') + aKv('CAR', Math.round((hs.car || 0) * 100) + '%') + aKv('TRANSIT', Math.round((hs.transit || 0) * 100) + '%') + aKv('STRUGGLING', Math.round((hs.struggling || 0) * 100) + '%') + '</div>' +
        '<p class="small">Right now: 💼 work ' + (act.work || 0) + ' · 🛍 shopping ' + (act.shopping || 0) + ' · 🎓 school ' + (act.school || 0) + ' · 🌳 park ' + (act.park || 0) + ' · 🎉 fun ' + (act.fun || 0) + ' · 🏠 home ' + (act.home || 0) + ' · 🚶 commuting ' + (act.commuting || 0) + ' · 🚇 transit ' + (act.transit || 0) + ' (agent sample)</p>' +
        '<div class="admList">' + HH.list.slice(0, 30).map(function (h) { return '<button class="admLi" data-ac="p9_inspect" data-v="citizen:' + h.members[0] + '">🏠 ' + esc(h.district) + ' · ' + h.size + ' members · ' + money(h.income) + ' / ' + money(h.expenses) + ' · ' + h.transport + ' · ' + Math.round(h.satisfaction) + '%</button>'; }).join('') + '</div>');
  },
  wc_traffic: function () {
    const t = S.p9.traffic, ts = trafficStats2();
    return aCard('🚦 Traffic 2.0', '<div class="grid3">' + aKv('VEHICLES', AG.vehicles.length) + aKv('TRAFFIC', Math.round(SIM.traffic || 0) + '%') + aKv('INCIDENTS', ts.incidents) + aKv('ALT. ROUTES', t.stats.alt + ' / ' + t.stats.trips) + aKv('LANE CHANGES', fmt(t.stats.laneChanges)) + aKv('RE-ROUTES', fmt(t.stats.reroutes)) + aKv('JUNCTIONS', ts.junctions.signal + '🚦 ' + ts.junctions.roundabout + '⭕ ' + ts.junctions.priority + '🔶 ' + ts.junctions.stop + '🛑') + aKv('PRE-EMPTIONS', t.stats.preempt) + aKv('MULTIPLIER', '×' + t.mult) + '</div>' +
      aToggle('p9_lightAI', '🚦 TRAFFIC LIGHT AI (adaptive green times)', t.lightAI) +
      '<div class="admRow"><span>Route choice</span>' + wcSel('wcRoute', Object.keys(ROUTE_MODES).map(function (k) { return [k, ROUTE_MODES[k]]; }), t.routeMode) + ab('p9_route', 'Set', 'blue') + '</div>' +
      aRow(ab('spawnTraffic', '🚙 SPAWN TRAFFIC (+40)', 'gold', 40) + ab('clearTraffic', '🧹 CLEAR TRAFFIC', 'red') + ab('p9_mult', 'Traffic ×2', '', 2) + ab('p9_mult', 'Traffic ×1', '', 1) + ab('p9_mult', 'Traffic ×0.5', '', 0.5) + ab('p9_congClear', '🧽 Clear congestion')) +
      aRow(Object.keys(INCIDENT_TYPES).map(function (k) { return ab('p9_incident', INCIDENT_TYPES[k].icon + ' ' + INCIDENT_TYPES[k].name, k === 'accident' ? 'red' : '', k); }).join('') + ab('p9_clearInc', '✅ Clear incidents', 'green')) +
      (t.lastChoice ? '<p class="small">🧠 Last AI decision: ' + esc(routeInfoText(t.lastChoice)) + '</p>' : '') +
      (t.incidents.length ? '<div class="admList">' + t.incidents.map(function (i) { return '<div class="admCo"><div>' + INCIDENT_TYPES[i.type].icon + ' ' + INCIDENT_TYPES[i.type].name + ' · ' + esc(districtName(i.tile % MAP.W, (i.tile / MAP.W) | 0)) + ' · ' + i.tiles.length + ' tile(s) · ' + Math.max(0, Math.round(i.until - S.clock.runSec)) + ' s left' + (i.crew ? ' · crew on site' : '') + '</div><button class="btn small" data-ac="p9_endInc" data-v="' + i.id + '">End</button></div>'; }).join('') + '</div>' : '')) +
      aCard('🚇 Transit network (STOP → LINE → ROUTE → VEHICLE → PASSENGER)', transitHtml()) +
      aCard('🚑 Emergency AI 2.0', '<p class="small">Dispatched ' + S.p9.emergency.dispatched + ' · average ETA ' + (S.p9.emergency.etaN ? Math.round(S.p9.emergency.etaSum / S.p9.emergency.etaN) + ' s' : '—') + '</p>' + (S.p9.emergency.log.length ? '<div class="admList">' + S.p9.emergency.log.slice(0, 10).map(function (l) { return '<div class="small">Day ' + l.day + ' ' + pad2(l.hour) + ':00 · ' + esc(l.unit) + ' from ' + esc(l.from) + ' → ' + esc(l.where) + ' · ETA ' + l.eta + ' s · priority ' + l.prio + (l.busy ? ' · queued (station busy)' : '') + '</div>'; }).join('') + '</div>' : ''));
  },
  wc_events: function () {
    return aCard('🌪 World events', aRow(ab('p9_tab', '🚨 Disaster Command Center', 'red', 'wc_disaster') + ab('p9_event', '🎉 Festival', '', 'megafest') + ab('p9_event', '🚀 Economic Boom', 'green', 'boom') + ab('p9_event', '📉 Recession', 'red', 'recession') + ab('p9_event', '🧳 Tourism Boom', '', 'tourism') + ab('p9_event', '📦 Supply Crisis', 'red', 'supplycrisis')) +
      aToggle('noEvents', 'Disable random events', S.p5.admin.noEvents) + aRow(ab('endEvents', 'End all active events', 'red')) + '<p class="small">Active: ' + (S.events.active.map(function (a) { return a.id; }).concat(S.p9.disasters.map(function (d) { return d.type; })).join(', ') || 'none') + '</p>') +
      aCard('🌦 Weather 2.0', aRow(WEATHER_TYPES.map(function (w) { return ab('weather', WEATHER_INFO[w].icon + ' ' + WEATHER_INFO[w].name, FX.weather === w ? 'gold' : '', w); }).join('')) + '<p class="small">Wind ' + windName(S.p9.env.wind.dir) + ' ' + (S.p9.env.wind.speed * 100).toFixed(0) + '% · outdoor activity ×' + weatherOutdoor().toFixed(2) + ' · tourism ×' + weatherTourMult().toFixed(2) + ' · farming ×' + weatherFarmMult().toFixed(2) + ' · traffic ×' + weatherEffects().traffic.toFixed(2) + ' · energy demand ×' + weatherEffects().powerDemand.toFixed(2) + '</p>');
  },
  wc_build: function () {
    const cs = conditionStats(), proj = constructionProjects();
    return aCard('🏗 Buildings', aRow(ab('q_unlock', '🔓 UNLOCK ALL', 'blue') + ab('instantBuild', S.p5.admin.instant ? '⚡ INSTANT BUILD: ON' : '⚡ INSTANT BUILD: OFF', S.p5.admin.instant ? 'green' : '') + ab('maxUpgrade', '⬆ MAX UPGRADE selected', 'gold') + ab('q_repairAll', '🔧 REPAIR ALL') + ab('p9_destroySel', '💥 DESTROY SELECTED', 'red') + ab('finishAll', '🏁 Finish all construction')) +
      '<p class="small">Selected: ' + (UI.selected ? esc(BUILDINGS[UI.selected.type].name) + ' Lv' + UI.selected.level : 'none — click a building on the map') + '</p>') +
      aCard('🔧 Condition & maintenance', '<div class="grid3">' + Object.keys(cs.tiers).map(function (k) { return aKv(k.toUpperCase(), cs.tiers[k]); }).join('') + aKv('AVERAGE', Math.round(cs.avg) + '%') + '</div>' +
        aInput('wcMaint', 'Maintenance budget (0-2 ×)', S.p9.maint.budget, 'p9_maint') + aInput('wcThr', 'Send crews below condition %', S.p9.maint.threshold, 'p9_thr') +
        '<p class="small">Crews dispatched ' + S.p9.maint.dispatched + ' · jobs done ' + S.p9.maint.jobs + ' · spent ' + money(S.p9.maint.spent) + ' · breakdowns ' + S.p9.maint.failures + ' · contractors: ' + S.buildings.list.filter(function (b) { return b.type === 'maintdepot'; }).map(contractorOf).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '</p>' + aRow(ab('p9_decay', '⏳ Age all buildings −30%'))) +
      aCard('🚧 Construction projects (' + proj.length + ')', proj.length ? '<div class="admList">' + proj.slice(0, 30).map(function (p) { return '<div class="admCo"><div><b>' + p.icon + ' ' + esc(p.name) + '</b> · ' + p.phase + ' ' + Math.round(p.progress * 100) + '% ' + pctBar(p.progress * 100) + '<div class="small">Cost ' + money(p.cost) + ' · workers ' + p.workers + (p.materials ? ' · steel ' + Math.round(p.used.steel) + '/' + p.materials.steel + ' · concrete ' + Math.round(p.used.concrete) + '/' + p.materials.concrete + ' · glass ' + Math.round(p.used.glass) + '/' + p.materials.glass : '') + ' · ETA ' + fmtGameDuration(p.etaGame) + (p.wait ? ' · ⏳ ' + p.wait : '') + ' · ' + p.owner + '</div></div><button class="btn small" data-ac="p9_inspect" data-v="building:' + p.b.id + '">🔎</button></div>'; }).join('') + '</div>' : '<p class="small">No construction in progress.</p>');
  },
  wc_util: function () {
    const g = gridStats(), w = waterStats();
    return aCard('⚡ Power grid (Plant → Substation → Transformer → District → Building)', '<div class="grid3">' + aKv('PRODUCTION', fmt(Math.round(g.production)) + ' MW') + aKv('CONSUMPTION', fmt(Math.round(g.consumption)) + ' MW') + aKv('RESERVE', '<span class="' + (g.reserve >= 0 ? 'pos' : 'neg') + '">' + fmt(Math.round(g.reserve)) + ' MW</span>') + aKv('SUBSTATIONS', g.substations + ' (' + g.feeders + ' feeders)') + aKv('TRANSFORMERS', g.transformers + (g.transformersOver ? ' · ' + g.transformersOver + ' OVER' : '')) + aKv('STATUS', g.overload ? '<span class="neg">OVERLOAD</span>' : '<span class="pos">OK</span>') + aKv('BROWNOUTS', g.brown) + aKv('UNCONNECTED', g.noGrid) + aKv('IMPORTED', fmt(Math.round(g.imported)) + ' MW') + '</div>' +
      aToggle('p9_infPower', '♾ INFINITE POWER', S.p9.util.infinitePower) + aRow(ab('p9_repairGrid', '🔌 REPAIR GRID', 'green') + ab('p9_overload', '⚠ OVERLOAD GRID (60 s test)', 'red') + ab('p9_subs', '🔌 Auto-place substations'))) +
      aCard('💧 Water network', '<div class="grid3">' + aKv('PRODUCTION', fmt(Math.round(w.production))) + aKv('DEMAND', fmt(Math.round(w.consumption))) + aKv('RESERVOIRS', fmt(Math.round(w.stored)) + ' / ' + fmt(w.capacity)) + aKv('LOW PRESSURE', Math.round(w.lowPressure * 100) + '% of buildings') + aKv('BURST PIPES', w.breaks) + aKv('SOURCES / PUMPS', w.sources + ' / ' + w.pumps) + '</div>' +
        aToggle('p9_infWater', '♾ INFINITE WATER', S.p9.util.infiniteWater) + aRow(ab('p9_breakPipe', '💦 Burst a water main', 'red') + ab('p9_fixPipes', '🛠 Repair all mains', 'green'))) +
      aCard('🚽 Sewage (Building → Sewer → District pipe → Treatment plant)', '<div class="grid3">' + aKv('SEWAGE', fmt(Math.round(SEWER.gen))) + aKv('CAPACITY', fmt(Math.round(SEWER.cap))) + aKv('OVERLOAD', '<span class="' + (SEWER.overload > 0.05 ? 'neg' : 'pos') + '">' + Math.round(SEWER.overload * 100) + '%</span>') + aKv('ON SEPTIC', fmt(Math.round(SEWER.unconnected))) + '</div>' + aRow(ab('p9_fixSewage', '🚽 FIX SEWAGE', 'green')));
  },
  wc_debug: function () {
    const ch = weChunkSummary(), prof = Game.prof || {}, mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : memEstimate();
    const v = S.p9.validator.last;
    return aCard('🐞 Performance', '<div class="grid3">' + aKv('FPS', Math.round(PERF.fps)) + aKv('FRAME TIME', (PERF.fps ? 1000 / PERF.fps : 0).toFixed(1) + ' ms') + aKv('RENDER', (PERF.renderMs || 0).toFixed(2) + ' ms') + aKv('SIMULATION', simMsTotal().toFixed(2) + ' ms') + aKv('MEMORY', mem) + aKv('SIM TIME', 'Day ' + gameDay() + ' ' + pad2(Math.floor(gameHour())) + ':00') + aKv('ACTIVE CHUNKS', ch.near + ch.mid + ' (' + ch.near + ' near)') + aKv('LOADED CHUNKS', ch.loaded + ' / ' + ch.chunks) + aKv('AI COUNT', aiTaskCount()) + aKv('CITIZENS', fmt(Math.floor(S.city.population)) + ' (' + AG.citizens.length + ' agents)') + aKv('VEHICLES', AG.vehicles.length + ' + ' + TRANSIT.pods.length + ' pods') + aKv('PATHFINDING', (typeof pathReqRate !== 'undefined' ? pathReqRate : 0).toFixed(1) + ' req/s') + '</div>' +
      aRow(ab('p9_inspectPick', '🔎 ENTITY INSPECTOR (pick)', 'blue') + ab('benchmark', '▶ Benchmark (6 s)', 'gold') + ab('stressTest', '⚡ Stress test', 'red') + ab('debugWorld', WDBG.on ? '🧪 World debugger: ON' : '🧪 World debugger', WDBG.on ? 'green' : ''))) +
      aCard('✅ World Validator 2.0 (continuous)', aToggle('p9_autoVal', 'Run continuously (every 30 s)', S.p9.validator.auto) + aRow(ab('p9_validate', '✅ Validate now', 'gold') + '<button class="btn gold" data-ac="q_repairWorld">🔧 AUTO FIX</button>') + (v ? validationHtml(v) : '') + (ADM.lastFix ? '<p class="small">' + ADM.lastFix.map(esc).join('<br>') + '</p>' : '')) +
      aCard('⏱ System timings', '<div class="grid3">' + Object.keys(prof).map(function (k) { return aKv(esc(k), prof[k].ms.toFixed(2) + ' ms'); }).join('') + '</div>');
  },
  wc_inspect: function () {
    return aCard('🔎 Entity inspector', '<p class="small">Pick any citizen, vehicle, building, road, utility or district on the map — the ENTITY INSPECTOR opens on the right and updates live.</p>' + aRow(ab('p9_inspectPick', '🎯 PICK ON MAP', 'gold')) +
      '<div class="admRow"><span>Company</span>' + wcSel('wcCo', AI_DEFS.map(function (a) { return [a.id, a.icon + ' ' + a.name]; }), AI_DEFS[0] ? AI_DEFS[0].id : '') + ab('p9_inspectCo', 'Inspect', 'blue') + '</div>' +
      '<div class="admList">' + S.buildings.list.filter(function (b) { const d = BUILDINGS[b.type]; return d.cat === 'Utilities' || d.cat === 'Waste'; }).slice(0, 30).map(function (b) { return '<button class="admLi" data-ac="p9_inspect" data-v="building:' + b.id + '">' + BUILDINGS[b.type].icon + ' ' + esc(BUILDINGS[b.type].name) + ' · ' + esc(districtName(b.x, b.y)) + '</button>'; }).join('') + '</div>');
  },
  wc_brush: function () {
    return aCard('🖌 World brush', '<div class="admPresets">' + Object.keys(BRUSH_MODES).map(function (k) { return '<button class="admPreset ' + (WB.mode === k ? 'on' : '') + '" data-ac="p9_brushMode" data-v="' + k + '"><b>' + BRUSH_MODES[k] + '</b></button>'; }).join('') + '</div>' +
      '<div class="admRow"><span>Brush size</span><div class="seg">' + BRUSH_SIZES.map(function (s) { return '<button type="button" class="' + (WB.size === s ? 'on' : '') + '" data-ac="p9_brushSize" data-v="' + s + '">' + s + '</button>'; }).join('') + '</div></div>' +
      '<div class="admRow"><span>Direction</span><div class="seg"><button type="button" class="' + (WB.sign > 0 ? 'on' : '') + '" data-ac="p9_brushSign" data-v="1">＋ Add / raise</button><button type="button" class="' + (WB.sign < 0 ? 'on' : '') + '" data-ac="p9_brushSign" data-v="-1">－ Remove / lower</button></div></div>' +
      '<div class="admRow"><span>Building (Build)</span>' + wcSel('wcBrushB', Object.values(BUILDINGS).filter(function (d) { return !d.hidden && d.w * d.h <= 4; }).map(function (d) { return [d.id, d.icon + ' ' + d.name]; }), WB.building) + '</div>' +
      '<div class="admRow"><span>Zone</span>' + wcSel('wcBrushZ', ZONES.map(function (z, i) { return [i, z ? z.icon + ' ' + z.name : '—']; }).filter(function (o) { return +o[0] > 0; }), WB.zone) + '</div>' +
      '<div class="admRow"><span>Road type</span>' + wcSel('wcBrushR', [1, 2, 3, 4].map(function (t) { return [t, ROAD_TYPES[t].name]; }), WB.roadType) + '</div>' +
      '<div class="admRow"><span>Terrain</span>' + wcSel('wcBrushT', [['raise', 'Raise'], ['lower', 'Lower'], ['flatten', 'Flatten']], WB.terrainOp) + '</div>' +
      aRow('<button class="btn gold big" data-ac="p9_brushOn">' + (WB.on ? '🖌 BRUSH ACTIVE — stop' : '🖌 START PAINTING ON THE MAP') + '</button>') + '<p class="small">Free build applies when FREE BUILD is on; otherwise buildings cost money. Esc or F10 stops painting.</p>');
  },
  wc_region: function () {
    const st = regionSelectionStats();
    return aCard('▭ Region selector', aRow(ab('p9_regionSel', RS.on ? '▭ Selecting… (drag on the map)' : '▭ SELECT REGION', 'gold')) +
      (st ? '<div class="grid3">' + aKv('AREA', (st.x1 - st.x0 + 1) + '×' + (st.y1 - st.y0 + 1)) + aKv('BUILDINGS', st.buildings) + aKv('HOMES', fmt(Math.round(st.homes))) + aKv('ROAD TILES', st.roads) + aKv('LAND VALUE', money(st.value) + '/tile') + aKv('POLLUTION', Math.round(st.pollution * 100) + '%') + '</div>' +
        aRow(ab('p9_regionDo', '⬆ Upgrade All Roads', '', 'roads') + ab('p9_regionDo', '🔧 Repair All Buildings', '', 'repair') + ab('p9_regionDo', '⚡ Build Utilities', '', 'utilities') + ab('p9_regionDo', '💎 Increase Land Value', '', 'value') + ab('p9_regionDo', '🌳 Add Trees', '', 'trees') + ab('p9_regionDo', '🌿 Remove Pollution', '', 'pollution') + ab('p9_regionClear', '✕ Clear selection')) : '<p class="small">No region selected.</p>'));
  },
  wc_disaster: function () {
    const c = ADM.dis || (ADM.dis = { type: 'earthquake', sev: 5, dur: 90, radius: 8, spread: 0, x: '', y: '' });
    return aCard('🚨 DISASTER COMMAND CENTER', '<div class="admPresets">' + Object.keys(COMMAND_DISASTERS).map(function (k) { return '<button class="admPreset ' + (c.type === k ? 'on' : '') + '" data-ac="p9_disType" data-v="' + k + '"><b>' + COMMAND_DISASTERS[k].icon + ' ' + COMMAND_DISASTERS[k].name + '</b></button>'; }).join('') + '</div>' +
      '<div class="admRow"><span>Location (tile x, y)</span><input class="admInput" id="disX" style="width:70px" value="' + esc(String(c.x)) + '" placeholder="random"><input class="admInput" id="disY" style="width:70px" value="' + esc(String(c.y)) + '" placeholder="random">' + ab('p9_disPick', '🎯 Pick on map') + '</div>' +
      '<div class="admRow"><span>Severity (1-10)</span><input class="admInput" id="disSev" type="number" min="1" max="10" value="' + c.sev + '"></div><div class="admRow"><span>Duration (s)</span><input class="admInput" id="disDur" type="number" min="10" max="1200" value="' + c.dur + '"></div>' +
      '<div class="admRow"><span>Radius (tiles)</span><input class="admInput" id="disRad" type="number" min="1" max="60" value="' + c.radius + '"></div><div class="admRow"><span>Spread (tiles / 10 s)</span><input class="admInput" id="disSpr" type="number" min="0" max="10" value="' + c.spread + '"></div>' +
      aToggle('p9_autoSnap', '📸 Auto snapshots "Before / After Disaster"', S.p9.autoSnap) + aRow('<button class="btn red big" data-ac="p9_disStart">🚨 START ' + COMMAND_DISASTERS[c.type].name.toUpperCase() + '</button>' + ab('q_clearDisasters', '🧯 CLEAR DISASTERS', 'green'))) +
      aCard('🔥 Active', S.p9.disasters.length ? S.p9.disasters.map(function (d) { return '<div class="admCo"><div>' + COMMAND_DISASTERS[d.type].icon + ' ' + COMMAND_DISASTERS[d.type].name + ' · ' + esc(districtName(d.x, d.y)) + ' · severity ' + d.sev + ' · radius ' + d.r.toFixed(1) + ' · ' + d.hits + ' hit · ' + Math.max(0, Math.round(d.until - S.clock.runSec)) + ' s left</div><div class="row">' + ab('p9_flyTile', '📍', '', d.x + ',' + d.y) + ab('p9_disEnd', 'End', 'red', d.id) + '</div></div>'; }).join('') : '<p class="small">No active disaster.</p>') +
      aCard('🧾 Reports', S.p9.disasterLog.length ? S.p9.disasterLog.slice().reverse().map(function (r) { return '<div class="small">' + r.icon + ' ' + esc(r.name) + ' · year ' + r.year + ' day ' + r.day + ' · severity ' + r.sev + ' · ' + r.hits + ' building(s) · ' + money(r.cost) + '</div>'; }).join('') : '<p class="small">No reports yet.</p>');
  },
  wc_snap: function () {
    const snaps = snapshotIndex();
    return aCard('📸 World Snapshot 2.0', aRow(ab('p9_snap', '📸 Snapshot', 'gold', '') + ab('p9_snap', '⏮ Before Disaster', '', 'Before Disaster') + ab('p9_snap', '⏭ After Disaster', '', 'After Disaster') + ab('p9_snap', '🌆 Mega City Stage', '', 'Mega City Stage') + ab('p9_snapNamed', '✏️ Named snapshot…')) +
      (snaps.length ? '<div class="admList">' + snaps.slice().reverse().map(function (s) { return '<div class="admCo"><div><b>' + esc(s.id.replace('snapshot_', 'Snapshot ')) + '</b> · ' + esc(s.name) + '<div class="small">' + esc(s.city) + ' · pop ' + fmt(s.pop) + ' · ' + esc(s.timeline || 'Original Timeline') + ' · ' + new Date(s.created).toLocaleString() + '</div></div><div class="row">' + ab('snapRollback', '⏪ Restore', 'blue', s.id) + ab('p9_branch', '🌿 Branch…', '', s.id) + ab('snapDelete', '🗑', 'red', s.id) + '</div></div>'; }).join('') + '</div>' : '<p class="small">No snapshots yet.</p>')) +
      aCard('🌿 World branching (timelines)', '<p class="small">Current timeline: <b>' + esc(S.p9.branch.name) + '</b>. Create alternative worlds from any snapshot (e.g. "Flood Avoided", "Flood Happened", "Industrial Expansion").</p>' + branchTreeHtml()) +
      aCard('🧬 City cloning', '<p class="small">CLONE WORLD copies the current city into another slot as an independent save.</p>' + aRow(ab('q_clone', '🧬 CLONE WORLD', 'gold')));
  },
  wc_time: function () { return aCard('📜 Timeline', timelineHtml()) + aCard('📖 City history', cityHistoryHtml()); },
  wc_chal: function () {
    const L = S.p9.challenges.slice().reverse();
    return aCard('🏆 World challenge generator', aRow(ab('p9_chalGen', '🎲 GENERATE CHALLENGE', 'gold') + Object.keys(WCH_TEMPLATES).map(function (k) { return ab('p9_chalGen', WCH_TEMPLATES[k].icon, '', k); }).join(''))) +
      (L.length ? L.map(function (c) { const T = WCH_TEMPLATES[c.tpl], p = c.status === 'active' ? clamp(T.progress(c), 0, 1) : c.status === 'completed' ? 1 : 0; return '<div class="card p9Ch ' + c.status + '"><b>' + T.icon + ' ' + esc(c.objective) + '</b> <span class="tag">' + c.status.toUpperCase() + '</span><div class="small"><b>OBJECTIVE:</b> ' + esc(c.objective) + '</div><div class="small"><b>CONDITION:</b> ' + esc(c.condition) + '</div><div class="small"><b>TIME LIMIT:</b> ' + c.limitYears + ' year(s)' + (c.status === 'active' ? ' · ' + Math.max(0, ((c.deadline - S.clock.gameSec) / YEAR_GAME_SEC)).toFixed(1) + ' left' : '') + '</div><div class="small"><b>REWARD:</b> ' + money(c.reward.money) + ' + ' + c.reward.rp + ' RP</div>' + pctBar(p * 100) + ' ' + Math.round(p * 100) + '%</div>'; }).join('') : '<p class="small">No challenges yet.</p>');
  },
  wc_advisor: function () { return aCard('🧠 Smart Advisor 2.0', '<div id="admAdv">' + advisorHtml() + '</div>' + aRow(ab('p9_advRefresh', '🔄 Re-analyse'))); }
};
function neighborsHtml() {
  const f = S.p9.flows || {};
  return '<p class="small">Flows: ' + fmt(f.comIn || 0) + ' in-commuters · ' + fmt(f.comOut || 0) + ' out-commuters · ' + fmt(f.tourists || 0) + ' tourists · exports ' + signMoney(f.exp || 0) + '/s · imports ' + money(f.imp || 0) + '/s · cargo ' + (f.cargo || 0).toFixed(1) + '/s · energy in ' + Math.round(f.energyIn || 0) + ' MW / out ' + Math.round(f.energyOut || 0) + ' MW</p>' +
    '<div class="admList">' + S.p9.neighbors.map(function (n) { const d = neighborDef(n.id), L = n.links || {}; return '<div class="admCo"><div><b>' + d.icon + ' ' + d.name + '</b> <span class="tag">' + d.dir + '</span> · pop ' + fmt(Math.round(n.pop)) + ' · GDP ' + money(n.gdp) + ' · relation ' + Math.round(n.rel) + '<div class="small">' + esc(d.desc) + ' · links: ' + (L.road ? '🛣 ' : '') + (L.rail ? '🚆 ' : '') + (L.sea ? '🚢 ' : '') + (L.air ? '✈️ ' : '') + (L.k ? '' : 'none — build a road to the ' + d.dir + ' map edge') + ' · trade ' + money((n.exp || 0) + (n.imp || 0)) + '/s · commuters ' + Math.round((n.comIn || 0) + (n.comOut || 0)) + ' · tourists ' + Math.round(n.tourists || 0) + '</div></div></div>'; }).join('') + '</div>';
}
function transitHtml() {
  const st = p9TransitLineStats();
  return '<p class="small">Boardings so far: ' + fmt(S.p9.transit.boardings) + ' · waiting at stops: ' + AG.citizens.filter(function (c) { return c.transit && c.transit.phase === 'wait'; }).length + ' · riding: ' + AG.citizens.filter(function (c) { return c.transit && c.transit.phase === 'ride'; }).length + '</p>' +
    (st.length ? '<div class="admList">' + st.map(function (L) { return '<div class="admCo"><div><b style="color:' + L.color + '">' + L.icon + ' ' + esc(L.name) + '</b>' + (L.auto ? ' <span class="tag">AUTO</span>' : ' <span class="tag b">MANUAL</span>') + '<div class="small">' + L.stations + ' ' + L.stationsLabel + ' · ' + L.vehicles + ' vehicle(s) · ' + L.aboard + ' aboard · ' + fmt(L.boardings) + ' boardings · capacity ' + fmt(Math.round(L.capacity)) + ' · ' + esc(L.route) + '</div></div><div class="row">' + ab('p9_lineVeh', '+🚌', '', L.id + ':1') + ab('p9_lineVeh', '−', '', L.id + ':-1') + ab('p9_lineDel', '🗑', 'red', L.id) + '</div></div>'; }).join('') + '</div>' : '<p class="small">No lines yet — build at least two stops of a mode (bus stops, tram stops, metro / train stations, ferry piers or an airport).</p>') +
    aRow(Object.keys(TRANSIT_MODES).map(function (k) { return ab('p9_lineNew', '+ ' + TRANSIT_MODES[k].icon + ' ' + TRANSIT_MODES[k].name + ' line', '', k); }).join('') + ab('p9_lineRebuild', '🔄 Rebuild auto lines'));
}
function simMsTotal() { let t = 0; const p = Game.prof || {}; for (const k in p) t += p[k].ms; return t; }
function aiTaskCount() { return AG.citizens.filter(function (c) { return c.pending; }).length + AI_DEFS.length + S.p9.challenges.filter(function (c) { return c.status === 'active'; }).length; }

/* ===================================== ACTIONS ===================================== */
function p9AdminDo(a, v, el) {
  if (!S.p9) return;
  if (a.indexOf('q_') === 0) return quickAction(a);
  const n = Number(v);
  switch (a) {
    case 'p9_tab': ADM.cat = v; return renderAdminCenter();
    case 'p9_flyChunk': { const r = chunkRect(n); closeAdminCenter(); flyToTile((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0.7); return; }
    case 'p9_flyTile': { const p = String(v).split(','); closeAdminCenter(); flyToTile(+p[0], +p[1], 0.8); return; }
    case 'p9_seed': { const s = parseSeed(aVal('wcSeed')); if (isNaN(s)) return admRe('Seed must look like CITY-123456', 'bad'); ADM.wgSeed = seedLabel(s); ADM.cat = 'world'; return admRe('Seed ' + seedLabel(s) + ' set in the world generator — press GENERATE to build it'); }
    case 'p9_climate': { const c = aVal('wcClimate'); if (S.p8.world) S.p8.world.climate = c; applyClimate({ climate: c, weather: 'auto' }); return admRe('Climate: ' + c); }
    case 'p9_forest': { let k = 0; for (let i = 0; i < MAP.nature.length; i++) if (!MAP.nature[i] && !MAP.occ[i] && !MAP.roads[i] && MAP.terrain[i] !== TERRAIN.ROCK && decoRand(i % MAP.W, (i / MAP.W) | 0, 91) < 0.1) { MAP.nature[i] = 1; k++; } MAP.groundDirty = true; return admRe('Forests grew on ' + k + ' tiles'); }
    case 'p9_mountain': { const x0 = Math.floor(Math.random() * MAP.W), y0 = Math.floor(Math.random() * MAP.H); let k = 0; for (let t = 0; t < MAP.W; t++) { const x = Math.round(x0 + Math.cos(t / 6) * 3 + t * 0.6) % MAP.W, y = Math.round(y0 + t * 0.5) % MAP.H; for (let d = -2; d <= 2; d++) { const xx = x + d; if (!inMap(xx, y)) continue; const i = idx(xx, y); if (MAP.occ[i] || MAP.roads[i] || MAP.nature[i] === 2) continue; MAP.terrain[i] = Math.abs(d) <= 1 ? TERRAIN.ROCK : TERRAIN.HILL; if (MAP.nature[i] === 1 && MAP.terrain[i] === TERRAIN.ROCK) MAP.nature[i] = 0; k++; } } MAP.groundDirty = true; return admRe('Mountain range raised (' + k + ' tiles)'); }
    case 'p9_lake': { const cx = Math.floor(Math.random() * MAP.W), cy = Math.floor(Math.random() * MAP.H); let k = 0; for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 5; x <= cx + 5; x++) { if (!inMap(x, y) || Math.hypot((x - cx) / 5, (y - cy) / 4) > 1) continue; const i = idx(x, y); if (MAP.occ[i] || MAP.roads[i]) continue; MAP.nature[i] = 2; MAP.terrain[i] = TERRAIN.WATER; MAP.zone[i] = 0; MAP.res[i] = 0; k++; } computeSea(); onMapChanged(); return admRe('Lake created (' + k + ' tiles)'); }
    case 'p9_deposit': { const types = Object.keys(RESOURCE_TYPES); for (let t = 0; t < 80; t++) { const x = Math.floor(Math.random() * MAP.W), y = Math.floor(Math.random() * MAP.H); if (!inMap(x, y) || MAP.terrain[idx(x, y)] === TERRAIN.WATER || MAP.occ[idx(x, y)] || MAP.roads[idx(x, y)] || S.economy.deposits.length >= 88) continue; const type = types[Math.floor(Math.random() * types.length)], R = RESOURCE_TYPES[type], amt = Math.round((R.min + R.max) / 2), di = S.economy.deposits.length; S.economy.deposits.push({ type: type, amount: amt, max: amt, cx: x, cy: y }); for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inMap(xx, yy) && !MAP.occ[idx(xx, yy)] && !MAP.roads[idx(xx, yy)] && MAP.terrain[idx(xx, yy)] !== TERRAIN.WATER) MAP.res[idx(xx, yy)] = di + 1; MAP.groundDirty = true; return admRe('New ' + R.name + ' deposit at ' + x + ',' + y); } return admRe('No free spot for a deposit', 'bad'); }
    case 'p9_freeze': S.p9.freeze[v] = !S.p9.freeze[v]; if (v === 'weather' && S.p9.freeze.weather) { FX.lock = FX.weather; FX.weatherUntil = S.clock.gameSec + 3600 * 1e4; } else if (v === 'weather') { FX.lock = null; FX.weatherUntil = S.clock.gameSec; } return admRe('Freeze ' + v + ': ' + (S.p9.freeze[v] ? 'ON' : 'OFF'));
    case 'p9_prices': { const m = admNum(aVal('wcPrices'), 1); S.p6.econ.cpi = clamp(m, 0.2, 5) * 100; return admRe('Price level ×' + clamp(m, 0.2, 5).toFixed(2)); }
    case 'p9_growth': { S.p9.econ.growthMult = clamp(admNum(aVal('wcGrowth'), 1), 0.1, 10); return admRe('Company growth ×' + S.p9.econ.growthMult); }
    case 'p9_jobs': { let k = 0; for (let i = 0; i < 20 && k < 500; i++) { const b = wgPlaceAnywhere(null, wgPick(['office', 'factory', 'supermarket']), {}); if (!b) break; k += b.workers; } onMapChanged(); return admRe('+' + k + ' jobs created'); }
    case 'p9_income': { S.p6.econ.wage = clamp(S.p6.econ.wage * (n < 0 ? 0.8 : 1.2), 20, 1000); return admRe('Wage level ×' + wageLevel().toFixed(2)); }
    case 'p9_needs': AG.citizens.forEach(function (c) { c.needs.food = c.needs.fun = c.needs.shopping = c.needs.work = 100; c.energy = 100; }); return admRe('All citizen needs filled');
    case 'p9_migrate': admSetPop(S.city.population * (n < 0 ? 0.9 : 1.1)); return admRe(n < 0 ? 'Emigration: −10% citizens' : 'Immigration wave: +10% citizens');
    case 'p9_lightAI': S.p9.traffic.lightAI = !S.p9.traffic.lightAI; JX.sig.clear(); return admRe('TRAFFIC LIGHT AI ' + (S.p9.traffic.lightAI ? 'ON' : 'OFF'));
    case 'p9_route': S.p9.traffic.routeMode = ROUTE_MODES[aVal('wcRoute')] ? aVal('wcRoute') : 'smart'; MAP.pathCache.clear(); return admRe('Route choice: ' + ROUTE_MODES[S.p9.traffic.routeMode]);
    case 'p9_mult': S.p9.traffic.mult = clamp(n, 0.1, 5); return admRe('Traffic multiplier ×' + S.p9.traffic.mult);
    case 'p9_congClear': if (MAP.cong) MAP.cong.fill(0); SIM.traffic = 0; S.city.traffic = 0; MAP.pathCache.clear(); return admRe('Congestion cleared');
    case 'p9_incident': { const inc = createIncident(v, -1); return admRe(inc ? INCIDENT_TYPES[v].icon + ' ' + INCIDENT_TYPES[v].name + ' created' : 'No road for an incident', inc ? 'good' : 'bad'); }
    case 'p9_clearInc': clearIncidents(); return admRe('All traffic incidents cleared');
    case 'p9_endInc': { const inc = S.p9.traffic.incidents.find(function (i) { return i.id === v; }); if (inc) endIncident(inc); return admRe('Incident ended'); }
    case 'p9_lineNew': { const L = createTransitLine(v); return admRe(L ? 'Line created: ' + L.name + ' (' + L.stops.length + ' stops)' : 'Need at least two ' + TRANSIT_MODES[v].name + ' stops', L ? 'good' : 'bad'); }
    case 'p9_lineDel': removeTransitLine(v); return admRe('Line removed');
    case 'p9_lineVeh': { const p = String(v).split(':'), L = lineById(p[0]); if (L) L.vehicles = clamp(L.vehicles + (+p[1]), 1, 8); return admRe(L ? L.name + ': ' + L.vehicles + ' vehicle(s)' : ''); }
    case 'p9_lineRebuild': transitRebuild(true); return admRe('Auto transit lines rebuilt');
    case 'p9_event': {
      if (v === 'tourism') { const g = GLOBAL_EVENTS.find(function (x) { return x.tour > 0; }); if (g) startGlobalEvent(g, false); return admRe('Tourism boom started'); }
      const ev = DYN_EVENTS.find(function (x) { return x.id === v; }); if (ev) startDynEvent(ev); return admRe((ev ? ev.name : v) + ' started');
    }
    case 'p9_destroySel': { const b = UI.selected; if (!b) return admRe('Select a building first', 'bad'); if (bdef(b).noDemolish) return admRe('The Town Hall cannot be destroyed', 'bad'); removeBuilding(b); onMapChanged(); return admRe('Destroyed: ' + BUILDINGS[b.type].name); }
    case 'p9_maint': S.p9.maint.budget = clamp(admNum(aVal('wcMaint'), 1), 0, 2); return admRe('Maintenance budget ×' + S.p9.maint.budget);
    case 'p9_thr': S.p9.maint.threshold = clamp(admNum(aVal('wcThr'), 60), 10, 95); return admRe('Crews repair below ' + S.p9.maint.threshold + '%');
    case 'p9_decay': S.buildings.list.forEach(function (b) { if (b.built) b.cond = Math.max(0, (b.cond === undefined ? 100 : b.cond) - 30); }); return admRe('All buildings aged by 30 condition points');
    case 'p9_infPower': S.p9.util.infinitePower = !S.p9.util.infinitePower; return admRe('INFINITE POWER ' + (S.p9.util.infinitePower ? 'ON' : 'OFF'));
    case 'p9_infWater': S.p9.util.infiniteWater = !S.p9.util.infiniteWater; waterNetPass(true); return admRe('INFINITE WATER ' + (S.p9.util.infiniteWater ? 'ON' : 'OFF'));
    case 'p9_repairGrid': S.p9.util.failures = []; S.p9.util.overloadUntil = 0; S.p6.effects = S.p6.effects.filter(function (e) { return e.id !== 'blackout'; }); { const k = gridAutoSubstations(true); return admRe('REPAIR GRID: failures cleared' + (k ? ', ' + k + ' substation(s) added' : '')); }
    case 'p9_overload': S.p9.util.overloadUntil = S.clock.runSec + 60; return admRe('OVERLOAD GRID: transformer and substation capacity −60% for 60 s', 'bad');
    case 'p9_subs': return admRe('Substations placed: ' + gridAutoSubstations(true));
    case 'p9_breakPipe': { const t = breakPipe(-1); return admRe(t !== null && t >= 0 ? 'Water main burst at tile ' + t : 'No road for a pipe burst', t !== null ? 'bad' : 'bad'); }
    case 'p9_fixPipes': { const k = S.p9.water.breaks.length; S.p9.water.breaks = []; waterNetPass(true); return admRe(k + ' water main(s) repaired'); }
    case 'p9_fixSewage': { S.p9.util.fixSewageUntil = 0; const r = p9AutoFixUtilities(); sewagePass(); return admRe('FIX SEWAGE: ' + (r || 'capacity already sufficient') + ' · overload ' + Math.round(SEWER.overload * 100) + '%'); }
    case 'p9_inspectPick': EI.pick = true; closeAdminCenter(); toast('🎯 Click any citizen, vehicle, building, road or empty land', ''); return;
    case 'p9_inspect': { const p = String(v).split(':'); inspectEntity(p[0], p[0] === 'company' ? p[1] : +p[1]); return; }
    case 'p9_inspectCo': inspectEntity('company', aVal('wcCo')); return;
    case 'p9_brushMode': WB.mode = v; return renderAdminCenter();
    case 'p9_brushSize': WB.size = n; return renderAdminCenter();
    case 'p9_brushSign': WB.sign = n < 0 ? -1 : 1; return renderAdminCenter();
    case 'p9_brushOn': WB.building = aVal('wcBrushB') || WB.building; WB.zone = +aVal('wcBrushZ') || WB.zone; WB.roadType = +aVal('wcBrushR') || WB.roadType; WB.terrainOp = aVal('wcBrushT') || WB.terrainOp; setBrush(!WB.on); if (WB.on) closeAdminCenter(); else renderAdminCenter(); return;
    case 'p9_regionSel': setRegionSelect(true); closeAdminCenter(); return;
    case 'p9_regionDo': { const msg = regionAction(v); adminLog('Region action ' + v + ': ' + msg); return admRe(msg); }
    case 'p9_regionClear': RS.rect = null; return renderAdminCenter();
    case 'p9_disType': ADM.dis.type = v; return renderAdminCenter();
    case 'p9_disPick': ADM.disPick = true; EI.pick = false; closeAdminCenter(); toast('🎯 Click the disaster location on the map', ''); return;
    case 'p9_disStart': { const c = ADM.dis; c.x = aVal('disX'); c.y = aVal('disY'); c.sev = admNum(aVal('disSev'), 5); c.dur = admNum(aVal('disDur'), 90); c.radius = admNum(aVal('disRad'), 8); c.spread = admNum(aVal('disSpr'), 0);
      const D = startCommandDisaster({ type: c.type, x: c.x === '' ? NaN : +c.x, y: c.y === '' ? NaN : +c.y, sev: c.sev, dur: c.dur, radius: c.radius, spread: c.spread });
      if (D) { adminLog('Disaster Command: ' + c.type + ' at ' + D.x + ',' + D.y + ' sev ' + D.sev + ' r ' + D.r + ' ' + D.dur + 's'); closeAdminCenter(); flyToTile(D.x, D.y, 0.75); } return; }
    case 'p9_disEnd': { const D = S.p9.disasters.find(function (d) { return d.id === v; }); if (D) endCommandDisaster(D); return admRe('Disaster ended'); }
    case 'p9_autoSnap': S.p9.autoSnap = !S.p9.autoSnap; return renderAdminCenter();
    case 'p9_snap': { const s = createSnapshot(v || ('Snapshot ' + new Date().toLocaleString())); return admRe(s ? 'Snapshot ' + s.id + ' "' + s.name + '"' : 'Snapshot failed', s ? 'good' : 'bad'); }
    case 'p9_snapNamed': return admPromptAsk('📸 Named snapshot', 'Snapshot name:', 'Snapshot ' + (snapshotIndex().length + 1), function (nm) { const s = createSnapshot(nm); admRe(s ? 'Snapshot ' + s.id + ' "' + s.name + '"' : 'Snapshot failed', s ? 'good' : 'bad'); });
    case 'p9_branch': return admPromptAsk('🌿 Create alternative world', 'Name of the new timeline (it is written into the first free city slot):', 'Flood Avoided', function (nm) { let slot = 0; for (let k = 1; k <= SLOT_COUNT; k++) if (!slotInfo(k).exists && k !== (S.slot || 1)) { slot = k; break; } if (!slot) for (let k = SLOT_COUNT; k >= 1; k--) if (k !== (S.slot || 1)) { slot = k; break; } const r = createBranch(v, nm, slot); admRe(r.ok ? 'Branch "' + r.name + '" created in CITY 0' + r.slot : r.reason, r.ok ? 'good' : 'bad'); });
    case 'p9_loadSlot': closeAdminCenter(); loadSlot(n); return;
    case 'p9_chalGen': { const c = generateWorldChallenge(v); return admRe('Challenge: ' + c.objective + ' (' + c.condition + ', ' + c.limitYears + ' years, ' + money(c.reward.money) + ')'); }
    case 'p9_advRefresh': advisorAnalyze(); return renderAdminCenter();
    case 'p9_validate': { const r = validateWorld2(); S.p9.validator.last = r; S.p9.validator.lastFailed = r.failed; return admRe('Validator 2.0: ' + r.score + '%' + (r.failed.length ? ' · ' + r.failed.join(', ') : ' · all checks passed'), r.liveable ? 'good' : 'bad'); }
    case 'p9_autoVal': S.p9.validator.auto = !S.p9.validator.auto; return renderAdminCenter();
    default: if (P9_ADMIN_EXTRA[a]) return P9_ADMIN_EXTRA[a](v);
  }

}

/* ===================================== POINTER HOOKS (brush, region, pickers) ===================================== */
function p9PointerDown(e) {
  if (!S || !S.p9 || e.button === 2) return false;
  const t = tileAtScreen(e.clientX, e.clientY);
  if (WB.on) { WB.down = true; WB.last = ''; applyBrush(t.x, t.y); return true; }
  if (RS.on) { RS.drag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; return true; }
  return false;
}
function p9PointerMove(e) {
  if (!S || !S.p9) return false;
  const t = tileAtScreen(e.clientX, e.clientY);
  if (WB.on && WB.down) { applyBrush(t.x, t.y); return true; }
  if (RS.on && RS.drag) { RS.drag.x1 = t.x; RS.drag.y1 = t.y; return true; }
  return false;
}
function p9PointerUp() {
  if (!S || !S.p9) return false;
  if (WB.on && WB.down) { WB.down = false; brushStrokeEnd(); return true; }
  if (RS.on && RS.drag) { RS.rect = RS.drag; RS.drag = null; RS.on = false; adminLog('Region selected ' + JSON.stringify(RS.rect)); openAdminCenter('wc_region'); return true; }
  return false;
}
/* Clicks: entity inspector picker and disaster location picker */
function p9TapHook(sx, sy) {
  if (!S || !S.p9) return false;
  if (typeof p10TapHook === 'function' && p10TapHook(sx, sy)) return true;
  if (typeof p11TapHook === 'function' && p11TapHook(sx, sy)) return true;
  if (ADM.disPick) { ADM.disPick = false; const t = tileAtScreen(sx, sy); if (inMap(t.x, t.y)) { ADM.dis.x = t.x; ADM.dis.y = t.y; } openAdminCenter('wc_disaster'); return true; }
  if (EI.pick) { EI.pick = false; inspectorPickAt(sx, sy); return true; }
  return false;
}
function p9CancelTools() { let any = false; if (WB.on) { WB.on = false; any = true; } if (RS.on) { RS.on = false; RS.drag = null; any = true; } if (EI.pick || ADM.disPick) { EI.pick = false; ADM.disPick = false; any = true; } if (typeof P10 !== 'undefined' && P10.pickMega) { P10.pickMega = null; any = true; } if (any) toast('Tool stopped', ''); return any; }

/* ===================================== ADMIN SECURITY ===================================== */
/* Part 12: admin access = an authenticated ADMIN SESSION (admin-auth.js). Settings, saves or local storage can't enable it. */
function adminModeEnabled() { return typeof AdminAuth !== 'undefined' && AdminAuth.active(); }
function enableAdminMode(on) { if (!on && typeof AdminAuth !== 'undefined') AdminAuth.logout('admin mode disabled'); }
function requestAdmin(cat) { if (adminModeEnabled()) { openAdminCenter(cat); return true; } return false; }
function promptEnableAdmin(cat) { if (adminModeEnabled()) openAdminCenter(cat); }

/* ===================================== F3 PERFORMANCE MONITOR ===================================== */
function p9DebugLines() {
  if (!S || !S.p9) return '';
  const ch = weChunkSummary();
  return '\n— PART 9 —\nSimulation time ' + simMsTotal().toFixed(2) + ' ms  Render time ' + (PERF.renderMs || 0).toFixed(2) + ' ms\n' +
    'Citizen count ' + fmt(Math.floor(S.city.population)) + ' (' + AG.citizens.length + ' agents)  Vehicle count ' + AG.vehicles.length + ' (+' + TRANSIT.pods.length + ' rail/ferry)\n' +
    'Building count ' + S.buildings.list.length + '  Active chunks ' + (ch.near + ch.mid) + ' (near ' + ch.near + ' / mid ' + ch.mid + ' / far ' + ch.far + ')  Loaded chunks ' + ch.loaded + '/' + ch.chunks + '\n' +
    'AI tasks ' + aiTaskCount() + '  Pathfinding tasks ' + (typeof pathReqRate !== 'undefined' ? pathReqRate.toFixed(1) : '0') + ' req/s, cache ' + MAP.pathCache.size + '\n' +
    'Grid ' + Math.round(SIM.powerGen || 0) + '/' + Math.round(SIM.powerUse || 0) + ' MW  Sewage ' + Math.round((SIM.sewageOverload || 0) * 100) + '% untreated  Incidents ' + S.p9.traffic.incidents.length;
}
Object.assign(ADM_VIEWS, WC_VIEWS);
/* The World Control Center tabs live in the admin panel next to the Part 8 tools */
const P9_ADMIN_EXTRA = { p9_adminMode: function () { if (adminModeEnabled()) AdminAuth.logout('admin mode switched off'); } };
function openTimeline2() { showModal('📜 City timeline & history', '<div class="grid2"><div class="card"><h3>📜 Timeline</h3>' + timelineHtml() + '</div><div class="card"><h3>📖 City history</h3>' + cityHistoryHtml() + '</div></div>'); }
function openWorldOverview() {
  const regs = weRegionStats(false), w = worldStatus();
  showModal('🌐 World & regions', '<div class="card"><h3>❤️ World health ' + w.overall + '%</h3>' + w.rows.map(function (r) { return '<div class="between small"><span>' + r[0] + '</span><b class="' + (r[1] >= 85 ? 'pos' : r[1] >= 60 ? '' : 'neg') + '">' + r[1] + '%</b></div>'; }).join('') + '</div>' +
    '<div class="card"><h3>🗺 Regions</h3>' + regs.map(function (r) { return '<div class="between small"><span>' + r.icon + ' ' + r.name + '</span><b>' + fmt(Math.round(r.pop)) + ' people · ' + fmt(r.jobs) + ' jobs · traffic ' + Math.round(r.traffic) + '% · ' + Math.round(r.happiness) + '% happy</b></div>'; }).join('') + '</div><div class="card"><h3>🏙 Neighbouring cities</h3>' + neighborsHtml() + '</div>');
}
