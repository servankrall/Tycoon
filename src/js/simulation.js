'use strict';
/* BLOCK CITY TYCOON — SIMULATION — inflation, stock market, crises, disasters, traffic, quests, megacity */
/* ============================ 17. P6 SYSTEMS ============================ */
/* --- GAME STATE (Part 6 section of the save) ------------------------------ */
function newP6(seed) {
  return {
    rng: ((seed | 0) * 2654435761 + 12345) >>> 0 || 1,
    econ: { cpi: 100, wage: 100, infl: 0.02, hist: [] },
    stocks: {}, names: {},
    effects: [], crisisCd: {},
    dq: { active: [], done: 0, failed: 0, nextAt: 90 },
    xp: 0, mayorLv: 1,
    mega: { era: false, projects: {}, global: {} },
    future: 0,
    scenario: null, sandbox: null, gen: null, cfg: null,
    day: { n: 0, snap: null }, reports: [], acc: { inc: 0, exp: 0 },
    disasterLog: [],
    stats: { reroutes: 0, evolved: 0, bankrupt: 0, dispatch: 0 }
  };
}
function sanitizeP6(src, seed) {
  const p = newP6(seed);
  if (!src || typeof src !== 'object') return p;
  p.rng = num(src.rng, p.rng, 1, 4294967295) >>> 0 || 1;
  const e = src.econ || {};
  p.econ.cpi = num(e.cpi, 100, 20, 1e6); p.econ.wage = num(e.wage, 100, 20, 1e6); p.econ.infl = num(e.infl, 0.02, -0.05, 0.2);
  p.econ.hist = Array.isArray(e.hist) ? e.hist.map(Number).filter(isFinite).slice(-60) : [];
  if (src.stocks && typeof src.stocks === 'object') AI_DEFS.forEach(function (a) {
    const s = src.stocks[a.id]; if (!s) return;
    p.stocks[a.id] = { price: num(s.price, 20, 0.05, 1e6), hist: Array.isArray(s.hist) ? s.hist.map(Number).filter(isFinite).slice(-120) : [], qty: num(s.qty, 0, 0, SHARES_TOTAL) | 0, cost: num(s.cost, 0, 0, 1e15), bad: num(s.bad, 0, 0, 1e6), neg: num(s.neg, 0, 0, 1e6) };
  });
  if (src.names && typeof src.names === 'object') AI_DEFS.forEach(function (a) { const n = src.names[a.id]; if (typeof n === 'string' && n.trim()) p.names[a.id] = n.replace(/[<>]/g, '').slice(0, 28); });
  p.effects = (Array.isArray(src.effects) ? src.effects : []).filter(function (x) { return x && typeof x.id === 'string' && x.eff && typeof x.eff === 'object'; }).slice(0, 12).map(function (x) {
    const eff = {}; for (const k in x.eff) if (/^[a-zA-Z]{1,16}$/.test(k)) eff[k] = num(x.eff[k], 1, -100, 100);
    return { id: x.id.slice(0, 24), until: num(x.until, 0, 0, 1e12), eff: eff, label: String(x.label || '').slice(0, 60) };
  });
  if (src.crisisCd && typeof src.crisisCd === 'object') for (const k in CRISIS6) if (src.crisisCd[k]) p.crisisCd[k] = num(src.crisisCd[k], 0, 0, 1e12);
  const dq = src.dq || {};
  p.dq.done = num(dq.done, 0, 0, 1e7) | 0; p.dq.failed = num(dq.failed, 0, 0, 1e7) | 0; p.dq.nextAt = num(dq.nextAt, 90, 0, 1e12);
  p.dq.active = (Array.isArray(dq.active) ? dq.active : []).filter(function (q) { return q && DQ_TEMPLATES.some(function (t) { return t.id === q.tpl; }); }).slice(0, 3).map(function (q) {
    return { tpl: q.tpl, target: num(q.target, 0, 0, 1e15), start: num(q.start, 0, 0, 1e12), deadline: num(q.deadline, 0, 0, 1e12) };
  });
  p.xp = num(src.xp, 0, 0, 1e12); p.mayorLv = num(src.mayorLv, 1, 1, 1000) | 0;
  const m = src.mega || {};
  p.mega.era = !!m.era;
  if (m.projects && typeof m.projects === 'object') MEGA_PROJECTS.forEach(function (mp) { const x = m.projects[mp.id]; if (x) p.mega.projects[mp.id] = { stage: num(x.stage, 0, 0, mp.stages) | 0, building: !!x.building, ends: num(x.ends, 0, 0, 1e12) }; });
  if (m.global && typeof m.global === 'object') COMPANY_DEFS.forEach(function (cd) { if (m.global[cd.id]) p.mega.global[cd.id] = 1; });
  p.future = num(src.future, 0, 0, 10000) | 0;
  const sc = src.scenario;
  if (sc && typeof sc === 'object' && SCENARIO_WIN[sc.win]) p.scenario = { name: String(sc.name || 'Scenario').replace(/[<>]/g, '').slice(0, 32), win: sc.win, v: num(sc.v, 1, 0, 1e15), limit: num(sc.limit, 0, 0, 1e6), start: num(sc.start, 0, 0, 1e12), taxLimit: num(sc.taxLimit, 30, 0, 30) | 0, disasters: num(sc.disasters, 1, 0, 3), done: !!sc.done, failed: !!sc.failed };
  const sb = src.sandbox;
  if (sb && typeof sb === 'object') p.sandbox = { money: !!sb.money, land: !!sb.land, disasters: !!sb.disasters, economy: sb.economy === 'hard' ? 'hard' : 'normal', creative: !!sb.creative };
  const cf = src.cfg;
  if (cf && typeof cf === 'object') p.cfg = { disasters: num(cf.disasters, 1, 0, 3), economy: ECON_PHASES[cf.economy] ? cf.economy : 'NORMAL', money: num(cf.money, 1, 0.1, 20) };
  const g = src.gen;
  if (g && typeof g === 'object' && typeof g.text === 'string') p.gen = { id: String(g.id).slice(0, 16), text: g.text.slice(0, 140), metric: String(g.metric).slice(0, 16), base: num(g.base, 0, -1e15, 1e15), target: num(g.target, 1, -1e15, 1e15), limit: num(g.limit, 0, 0, 1e6), start: num(g.start, 0, 0, 1e12), con: String(g.con || '').slice(0, 16), done: !!g.done, failed: !!g.failed };
  const d = src.day || {};
  p.day.n = num(d.n, 0, 0, 1e7) | 0;
  if (d.snap && typeof d.snap === 'object') { p.day.snap = {}; for (const k in d.snap) if (/^[a-zA-Z]{1,16}$/.test(k)) p.day.snap[k] = num(d.snap[k], 0, -1e15, 1e15); }
  p.reports = (Array.isArray(src.reports) ? src.reports : []).slice(-10).map(function (r) { const o = {}; for (const k in r) if (/^[a-zA-Z]{1,16}$/.test(k)) o[k] = num(r[k], 0, -1e15, 1e15); return o; });
  const ac = src.acc || {}; p.acc.inc = num(ac.inc, 0, 0, 1e18); p.acc.exp = num(ac.exp, 0, 0, 1e18);
  p.disasterLog = (Array.isArray(src.disasterLog) ? src.disasterLog : []).slice(-8).map(function (x) { return { name: String(x.name || '').slice(0, 30), icon: String(x.icon || '⚠️').slice(0, 6), day: num(x.day, 1, 0, 1e7) | 0, hit: num(x.hit, 0, 0, 1e5) | 0, cost: num(x.cost, 0, 0, 1e14), rec: num(x.rec, 0, 0, 1e6) }; });
  const st = src.stats || {}; for (const k in p.stats) p.stats[k] = num(st[k], 0, 0, 1e9) | 0;
  return p;
}
/* Apply saved AI company names (companies can be re-founded under a new name) */
function applyCompanyNames() { AI_DEFS.forEach(function (a) { a.name = (S.p6 && S.p6.names[a.id]) || AI_DEFAULT_NAMES[a.id]; }); }

/* --- SIMULATION SYSTEM: speed control ------------------------------------------ */
function speedIndex() { const i = SIM_SPEEDS.indexOf(S.settings.speed); return i < 0 ? 3 : i; }
function stepSpeed(dir) { const i = clamp(speedIndex() + dir, 1, SIM_SPEEDS.length - 1); setSpeed(SIM_SPEEDS[i]); toast('⏱️ Simulation ' + speedLabel(SIM_SPEEDS[i]), ''); }
function speedLabel(s) { return s === 0 ? '⏸ Paused' : (s < 1 ? '🐢 ' + s + '×' : s + '×'); }

/* --- WORLD SYSTEM: named districts & streets ----------------------------------------------- */
function computeDistrictNames() { computeDistrictNames0(); if (typeof p11ApplyDistrictNames === 'function') p11ApplyDistrictNames(); }   // Part 11: districts renamed in the editor keep their names
function computeDistrictNames0() {
  if (!MAP.districts.length) return;
  const gen = S.p8 && S.p8.world && S.p8.world.cellNames;            // generated worlds keep their district names
  if (Array.isArray(gen) && gen.length === MAP.districts.length) { MAP.dnames = gen.slice(); return; }
  const n = MAP.dN, c = MAP.W / 2, rnd = mulberry32((S.city.seed | 0) + 4242);
  const used = {}, names = new Array(MAP.districts.length);
  const shared = ['Downtown', 'Airport District', 'Harbor District', 'Industrial Park', 'Business Park'];
  const uniq = function (base) { if (shared.indexOf(base) >= 0) return base; if (!used[base]) { used[base] = 1; return base; } for (let k = 2; k < 9; k++) if (!used[base + ' ' + k]) { used[base + ' ' + k] = 1; return base + ' ' + k; } return base; };
  const pre = DISTRICT_PREFIX.slice(); for (let i = pre.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pre[i]; pre[i] = pre[j]; pre[j] = t; }
  let pi = 0;
  MAP.districts.forEach(function (t, k) {
    const cx = (k % n) * 8 + 4, cy = Math.floor(k / n) * 8 + 4;
    let water = 0, sea = 0, hill = 0, ind = 0, com = 0, res = 0, off = 0, airport = false, port = false, locked = 0;
    for (let y = cy - 4; y < cy + 4; y++) for (let x = cx - 4; x < cx + 4; x++) {
      if (!inMap(x, y)) continue; const i = idx(x, y);
      if (MAP.nature[i] === 2) { water++; if (MAP.sea[i]) sea++; }
      if (MAP.terrain[i] === TERRAIN.HILL || MAP.terrain[i] === TERRAIN.ROCK) hill++;
      const z = MAP.zone[i]; if (z === 3) ind++; else if (z === 2) com++; else if (z === 1 || z === 9) res++; else if (z === 5 || z === 8) off++;
      if (!inUnlocked(x, y)) locked++;
      const b = MAP.occ[i] ? MAP.byId.get(MAP.occ[i]) : null;
      if (b) { const d = BUILDINGS[b.type]; if (d.id === 'airport') airport = true; if (d.id === 'port') port = true; if (d.cat === 'Industry' || d.cat === 'Resources') ind += 2; if (d.cat === 'Commercial') com += 2; if (d.housing) res += 2; }
    }
    let nm;
    if (Math.abs(cx - c) <= 5 && Math.abs(cy - c) <= 5) nm = 'Downtown';
    else if (airport) nm = 'Airport District';
    else if (port || sea > 14) nm = 'Harbor District';
    else if (locked > 40) nm = pre[pi++ % pre.length] + ' Outskirts';
    else if (ind > 14 && ind >= com && ind >= res) nm = 'Industrial Park';
    else if (off > 12) nm = 'Business Park';
    else if (com > 14 && com >= res) nm = pre[pi++ % pre.length] + ' Market';
    else if (water > 10) nm = pre[pi++ % pre.length] + ' Riverside';
    else if (hill > 20) nm = pre[pi++ % pre.length] + ' Hills';
    else if (Math.hypot(cx - c, cy - c) > MAP.W * 0.33) nm = pre[pi++ % pre.length] + ' Suburbs';
    else nm = pre[pi++ % pre.length] + (res > 10 ? ' Heights' : ' Gardens');
    names[k] = uniq(nm);
  });
  MAP.dnames = names;
}
function districtName(x, y) {
  if (!MAP.dnames || !MAP.dN) return '';
  const k = Math.floor(clamp(y, 0, MAP.H - 1) / 8) * MAP.dN + Math.floor(clamp(x, 0, MAP.W - 1) / 8);
  return MAP.dnames[k] || '';
}
function districtCenters() {
  const out = {}; if (!MAP.dnames) return [];
  MAP.dnames.forEach(function (nm, k) { const cx = (k % MAP.dN) * 8 + 4, cy = Math.floor(k / MAP.dN) * 8 + 4; if (!out[nm]) out[nm] = { name: nm, x: 0, y: 0, n: 0 }; out[nm].x += cx; out[nm].y += cy; out[nm].n++; });
  return Object.keys(out).map(function (k) { const o = out[k]; return { name: o.name, x: o.x / o.n, y: o.y / o.n }; });
}
/* Street names: every long straight road gets a seeded name (for search & info) */
function computeRoadNames() {
  const rnd = mulberry32((S.city.seed | 0) + 777), out = [];
  const nameFor = function (t) { return DISTRICT_PREFIX[Math.floor(rnd() * DISTRICT_PREFIX.length)] + ' ' + STREET_SUFFIX[t]; };
  for (let y = 0; y < MAP.H; y++) { let run = 0, s = 0; for (let x = 0; x <= MAP.W; x++) { if (x < MAP.W && isRoad(x, y)) { if (!run) s = x; run++; } else { if (run >= 6) out.push({ name: nameFor(Math.floor(rnd() * 3)), x: (s + x - 1) / 2, y: y, len: run }); run = 0; } } }
  for (let x = 0; x < MAP.W; x++) { let run = 0, s = 0; for (let y = 0; y <= MAP.H; y++) { if (y < MAP.H && isRoad(x, y)) { if (!run) s = y; run++; } else { if (run >= 6) out.push({ name: nameFor(3 + Math.floor(rnd() * 4)), x: x, y: (s + y - 1) / 2, len: run }); run = 0; } } }
  MAP.roadNames = out;
}

/* --- ECONOMY ENGINE: inflation, prices & wages (runs after econTick) --------------------------------- */
const YEAR_SEC = SECONDS_PER_MONTH * 12;
function priceLevel() { return S && S.p6 ? S.p6.econ.cpi / 100 : 1; }
function wageLevel() { return S && S.p6 ? S.p6.econ.wage / 100 : 1; }
function realIncomeFactor() { return clamp(1 + (wageLevel() - priceLevel()) / priceLevel() * 1.5, 0.8, 1.15); }
function inflationTick(dt) {
  const e = S.p6.econ, D = SIM.demand || {}, Sp = SIM.supply || {};
  let pr = 0, n = 0;
  ['FOOD', 'SHOPPING', 'ENTERTAINMENT'].forEach(function (s) { if (D[s] > 0) { pr += clamp(D[s] / Math.max(1, Sp[s]), 0.3, 2.5); n++; } });
  const pressure = n ? pr / n : 1;
  const fuelShock = (S.p5.world.active === 'energy' ? 0.02 : 0) + (S.p5.world.active === 'food' ? 0.015 : 0);
  let target = 0.02 + 0.03 * (pressure - 1) + (0.05 - SIM.unemployment) * 0.25 + (0.05 - interestRate()) * 0.8 + fuelShock + (econPhase().id === 'BOOM' ? 0.012 : econPhase().id === 'RECESSION' ? -0.02 : 0);
  if (S.city.population < 60) target = 0.01;
  e.infl = clamp(lerp(e.infl, clamp(target, -0.03, 0.14), 0.01 * dt), -0.03, 0.14);
  e.cpi *= 1 + e.infl * dt / YEAR_SEC;
  e.wage += (e.cpi * (1 + S.city.skill / 1000) - e.wage) * 0.003 * dt;
  e._h = (e._h || 0) + dt;
  if (e._h >= 10) { e._h = 0; e.hist.push(+(e.infl * 100).toFixed(2)); if (e.hist.length > 60) e.hist.shift(); }
}

/* --- Part 6 modifiers (applied after Part 5 inside globalMods) --------------------------------------- */
function part6Mods(m) {
  m.wage = 1; m.waterProd = 1; m.waterUse = 1; m.roadCap = 1; m.fares = 1; m.finRev = 1; m.housingMult = 1; m.eduBonus = 0; m.logistics = 1; m.logiCost = 1;
  if (!S.p6) return m;
  const t = S.clock.runSec, p6 = S.p6;
  // Inflation: nominal revenue follows prices, wages follow with a lag, real income shapes demand
  m.rev *= priceLevel(); m.wage = wageLevel(); m.demand *= realIncomeFactor();
  // Crisis responses & temporary effects
  p6.effects.forEach(function (x) {
    if (x.until < t) return; const e = x.eff;
    ['powerProd', 'powerDemand', 'waterProd', 'waterUse', 'traffic', 'roadCap', 'production', 'pollution', 'demand', 'tax', 'growth', 'finRev', 'fares'].forEach(function (k) { if (e[k] !== undefined) m[k] *= e[k]; });
    if (e.hap) m.hap += e.hap;
    if (e.fin !== undefined) m.finRev *= e.fin;
  });
  // Technology 2.0
  if (hasTech('i_lean')) m.production *= 1.1;
  if (hasTech('i_robotics')) { m.production *= 1.15; m.indPol *= 0.9; }
  if (hasTech('i_chain')) { m.logistics *= 1.3; m.logiCost *= 0.75; }
  if (hasTech('tr_marketing')) m.tour *= 1.15;
  if (hasTech('tr_culture')) { m.tour *= 1.2; m.hap += 2; }
  if (hasTech('tr_global')) { m.tour *= 1.3; m.trade *= 1.15; }
  if (hasTech('h_telemed')) m.hap += 2;
  if (hasTech('ed_stem')) m.rp *= 1.1;
  if (hasTech('ed_online')) m.eduBonus += 10;
  if (hasTech('ai_traffic')) m.traffic *= 0.88;
  if (hasTech('ai_grid')) m.powerDemand *= 0.92;
  if (hasTech('ai_auto')) { m.traffic *= 0.8; m.logistics *= 1.3; }
  if (hasTech('ar_green')) { m.pollution *= 0.92; m.hap += 1; }
  if (hasTech('ar_arcology')) m.housingMult *= 1.1;
  if (hasTech('ec_fintech')) m.finRev *= 1.15;
  if (hasTech('ec_trade')) m.trade *= 1.25;
  // City culture (new identities)
  if (S.p5.identity.id === 'FINANCIAL') m.finRev *= 1.1;
  if (S.p5.identity.id === 'ENTERTAINMENT') { m.hap += 3; m.tour *= 1.05; }
  // Mayor level, future tech & mega projects
  m.rev *= 1 + 0.01 * Math.min(100, p6.mayorLv - 1);
  m.rev *= 1 + 0.02 * p6.future; m.rp *= 1 + 0.02 * p6.future;
  const done = function (id) { const x = p6.mega.projects[id], mp = MEGA_PROJECTS.find(function (q) { return q.id === id; }); return x && x.stage >= mp.stages; };
  if (done('elevator')) { m.rp *= 1.15; m.tour *= 1.2; }
  if (done('arcodist')) { m.housingMult *= 1.15; m.pollution *= 0.9; }
  if (done('hyperloop')) { m.traffic *= 0.8; m.trade *= 1.3; }
  if (done('fusiongrid')) m.electricity *= 0.7;
  if (done('exchange')) m.finRev *= 1.25;
  if (done('smartcore')) m.hap += 6;
  // Seasons: citizens behave differently (fewer park visits in winter), agriculture handled in the supply chain
  return m;
}
function megaDone(id) { const x = S.p6 && S.p6.mega.projects[id], mp = MEGA_PROJECTS.find(function (q) { return q.id === id; }); return !!(x && mp && x.stage >= mp.stages); }
function seasonFarmMult() { return (({ spring: 1.1, summer: 1.2, autumn: 1.35, winter: 0.45 })[currentSeason().id] || 1) * (S.p9 ? weatherFarmMult() : 1); }
function disasterFreq() {
  if (!S.p6) return 1;
  if (S.p6.sandbox && !S.p6.sandbox.disasters) return 0;
  if (S.p6.scenario) return S.p6.scenario.disasters;
  if (S.p6.cfg) return S.p6.cfg.disasters;          // chosen on the NEW CITY screen
  return 1;
}
function sandboxCreative() { return !S.p6 || !S.p6.sandbox || S.p6.sandbox.creative; }

/* --- STOCK MARKET: every AI company is listed; the player can invest, companies can go bankrupt ---------- */
function stockOf(id) {
  let s = S.p6.stocks[id];
  if (!s) { const a = S.ai[id]; s = S.p6.stocks[id] = { price: Math.max(1, +(5 + (a ? a.cash : 4000) / 400).toFixed(2)), hist: [], qty: 0, cost: 0, bad: 0, neg: 0 }; }
  return s;
}
function aiEmployees(id) { let n = 0; S.buildings.list.forEach(function (b) { if (b.owner === id) n += b._actW || 0; }); return n; }
function stockMarketTick(dt) {
  const ph = econPhase();
  AI_DEFS.forEach(function (a) {
    try { companyMarketStep(a, dt, ph); } catch (e) { repairCompany(a.id, e); }   // corrupted company data is rebuilt safely
  });
}
function companyMarketStep(a, dt, ph) {
    let st = S.ai[a.id]; if (!st) return;
    let s = stockOf(a.id);
    if (!isFinite(st.cash) || !isFinite(s.price) || !Array.isArray(s.hist)) { repairCompany(a.id, new Error('invalid numbers')); st = S.ai[a.id]; s = stockOf(a.id); }
    if (st.acquired) { s.price = Math.max(0.05, s.price); return; }
    const fund = S.p10 ? p10FairValue(a.id, st) : Math.max(0.5, ((st.assets || 0) * 0.6 + st.cash * 0.4 + Math.max(-(st.assets || 0) * 0.3, (st.profit || 0) * 900)) / 2000);   // Part 10: Stock Market 2.0
    const noise = 1 + gauss() * 0.02 * difficulty().vol * (ph.id === 'RECESSION' ? 1.5 : 1);
    s.price = +clamp(lerp(s.price, fund * ph.rev, 0.06) * noise, 0.05, 1e6).toFixed(3);
    s.hist.push(s.price); if (s.hist.length > 120) s.hist.shift();
    // Dividends: 25% of profit shared with shareholders
    if (s.qty > 0 && (st.profit || 0) > 0) { const div = st.profit * dt * 0.25 * s.qty / SHARES_TOTAL; S.money = Math.min(MONEY_CAP, S.money + div); s.divTotal = (s.divTotal || 0) + div; }
    // Shrinking & bankruptcy
    if ((st.profit || 0) < 0) s.neg += dt; else s.neg = Math.max(0, s.neg - dt * 2);
    if (s.neg > 180 && (st.count || 0) > 3 && RNG.chance(0.2)) closeWorstStore(a.id);
    if (st.cash < 60 && (st.profit || 0) <= 0 && (st.count || 0) > 0) s.bad += dt; else s.bad = Math.max(0, s.bad - dt);
    if (s.bad > 150) bankruptCompany(a.id);
}
/* Rebuild a rival company whose state became invalid: buildings stay, cash/reputation/stock are reset to safe values */
function repairCompany(id, err) {
  if (typeof logError === 'function') logError('Company ' + id, err);
  const fresh = newAIState(S.city.difficulty)[id]; if (!fresh) return;
  const old = S.ai[id] || {};
  fresh.acquired = !!old.acquired;
  if (isFinite(old.level)) fresh.level = clamp(old.level | 0, 1, 10);
  S.ai[id] = fresh;
  const s = S.p6.stocks[id], qty = s && isFinite(s.qty) ? s.qty : 0, cost = s && isFinite(s.cost) ? s.cost : 0;
  delete S.p6.stocks[id];
  const ns = stockOf(id); ns.qty = qty; ns.cost = cost;
}
function closeWorstStore(id) {
  const own = S.buildings.list.filter(function (b) { return b.owner === id && b.built && BUILDINGS[b.type].rev; });
  if (own.length < 3) return;
  own.sort(function (x, y) { return ((x._rev || 0) - (x._cost || 0)) - ((y._rev || 0) - (y._cost || 0)); });
  const b = own[0], d = BUILDINGS[b.type];
  S.ai[id].cash += buildingValue(b) * 0.4;
  removeBuilding(b); onMapChanged();
  stockOf(id).neg = 0;
  notify(aiDef(id).icon + ' ' + aiDef(id).name + ' closed an unprofitable ' + d.name + ' (' + districtName(b.x, b.y) + ').', '');
}
function bankruptCompany(id) {
  const a = aiDef(id), st = S.ai[id], s = stockOf(id), sec = a.sectors[0];
  const pool = (COMPANY_REFOUND_NAMES[sec] || ['NEW VENTURES']).filter(function (n) { return !AI_DEFS.some(function (x) { return x.name === n; }); });
  const old = a.name, nn = pool.length ? RNG.pick(pool) : old + ' II';
  S.p6.names[id] = nn; applyCompanyNames();
  st.cash = 4000 * costMult(); st.rep = 40; st.quality = 0.95; st.price = 1; st.level = 1;
  s.price = +(s.price * 0.08).toFixed(3); s.bad = 0; s.neg = 0;
  S.p6.stats.bankrupt++;
  notify('📉 ' + old + ' went BANKRUPT! Its stores were taken over by the new company ' + a.icon + ' ' + nn + '. Shareholders lost 92%.', 'bad');
  logHistory('📉', old + ' went bankrupt → ' + nn, 'company');
}
function tradeAIShares(id, qty) {
  const s = stockOf(id), st = S.ai[id];
  if (!st || st.acquired) { toast('This company is no longer listed', 'bad'); return; }
  if (qty > 0) {
    const cost = s.price * qty * 1.01;
    if (S.money < cost) { toast('❌ Need ' + money(cost), 'bad'); sfx('error'); return; }
    if (s.qty + qty > SHARES_TOTAL * 0.49) { toast('❌ Max 49% stake — acquire the company instead', 'bad'); return; }
    S.money -= cost; s.qty += qty; s.cost += cost; st.cash += cost * 0.5;
    toast('📈 Bought ' + fmt(qty) + ' ' + aiDef(id).name + ' shares', 'good');
  } else {
    const q = Math.min(s.qty, -qty); if (q <= 0) return;
    const val = s.price * q * 0.99, avg = s.cost / s.qty;
    S.money = Math.min(MONEY_CAP, S.money + val); S.companies.tradeProfit += val - avg * q;
    s.cost -= avg * q; s.qty -= q;
    toast('📉 Sold ' + fmt(q) + ' shares for ' + money(val), 'good');
  }
  sfx('money');
}
function companyRows() {
  const rows = [];
  COMPANY_DEFS.forEach(function (cd) {
    const c = S.companies.list[cd.id]; if (!c) return;
    const cs = (SIM.companies && SIM.companies[cd.id]) || { rev: 0, cost: 0, profit: 0, emp: 0 };
    const sh = cd.sectors[0] === 'INDUSTRY' ? marketShares('INDUSTRY') : (SIM.share && SIM.share[cd.sectors[0]]) || {};
    rows.push({ id: cd.id, mine: true, name: cd.name + (S.p6.mega.global[cd.id] ? ' 🌐' : ''), icon: cd.icon, sector: cd.sectors[0], emp: cs.emp, rev: cs.rev, exp: cs.cost, profit: cs.profit, share: sh.player || 0, rep: companyBrand(cd.id), price: c.price, color: cd.color });
  });
  AI_DEFS.forEach(function (a) {
    const st = S.ai[a.id]; if (!st || st.acquired) return;
    const sec = a.sectors[0], sh = sec === 'HOUSING' || sec === 'INDUSTRY' ? marketShares(sec) : (SIM.share && SIM.share[sec]) || {};
    rows.push({ id: a.id, mine: false, name: a.name, icon: a.icon, sector: sec, emp: aiEmployees(a.id), rev: st.rev || 0, exp: (st.rev || 0) - (st.profit || 0), profit: st.profit || 0, share: sh[a.id] || 0, rep: st.rep, price: stockOf(a.id).price, color: a.color });
  });
  return rows;
}
function aiPortfolioValue() { let v = 0; for (const id in S.p6.stocks) v += S.p6.stocks[id].qty * S.p6.stocks[id].price; return v; }

/* --- EVENT ENGINE: city crises with solutions ---------------------------------------------------------------- */
Object.keys(CRISIS6).forEach(function (id) {
  const C = CRISIS6[id];
  DECISION_TYPES['c6_' + id] = {
    title: C.title, text: function () { return C.text(); },
    options: function (d) { return C.options.map(function (o, k) { return { label: o.label, desc: o.desc, cost: o.cost ? Math.round(o.cost * (d.base || 10000)) : 0, payer: o.payer || 'budget', choice: String(k) }; }); }
  };
});
function crisisTick() {
  if (S.p5.admin.noEvents || S.city.sandbox) return;
  const t = S.clock.runSec, p6 = S.p6;
  if (S.events.decisions.some(function (d) { return d.type.indexOf('c6_') === 0; })) return;
  for (const id in CRISIS6) {
    if ((p6.crisisCd[id] || 0) > t) continue;
    const C = CRISIS6[id];
    let ok = false; try { ok = C.cond(); } catch (e) { ok = false; }
    if (!ok) { p6['_c' + id] = 0; continue; }
    p6['_c' + id] = (p6['_c' + id] || 0) + 5;
    if (p6['_c' + id] < 30 && id !== 'bankingcrisis' && id !== 'recession6') continue;
    p6.crisisCd[id] = t + 900;
    eventAutosave('before crisis: ' + id);
    createDecision('c6_' + id, { base: Math.round(8000 * costMult() + S.budget * 0.5) });
    logHistory(C.icon, C.title.replace(/^\S+\s/, ''), 'crisis');
    break;
  }
}
function applyCrisisChoice(id, k) {
  const C = CRISIS6[id]; if (!C) return;
  const o = C.options[+k]; if (!o) return;
  const t = S.clock.runSec;
  if (o.eff) S.p6.effects.push({ id: id, until: t + (o.dur || 300), eff: Object.assign({}, o.eff), label: C.icon + ' ' + o.label });
  if (o.eff && o.eff.rateUp) S.p5.econ.rate = clamp(S.p5.econ.rate + o.eff.rateUp, 0.005, 0.15);
  if (o.special === 'generator') placeEmergencyGenerator();
  if (o.special === 'crash') { for (const sid in S.companies.stocks) S.companies.stocks[sid].price *= 0.8; AI_DEFS.forEach(function (a) { if (a.sectors[0] === 'FINANCE') stockOf(a.id).price *= 0.6; }); }
  if (S.p6.effects.length > 12) S.p6.effects.shift();
}
function activeEffects() { const t = S.clock.runSec; return S.p6.effects.filter(function (x) { return x.until > t; }); }
function effectsTick() { const t = S.clock.runSec; S.p6.effects = S.p6.effects.filter(function (x) { return x.until > t; }); S.p6.effects.forEach(function (x) { if (x.eff.charge) S.budget += Math.max(0, SIM.carTrips || 0) * 0.01; }); }

/* --- DISASTERS 2.0 & damage reports ------------------------------------------------------------------------------ */
function disaster6(d, mit) {
  const t = S.clock.runSec;
  if (d.id === 'earthquake') {
    shake(4);
    const cand = damageableBuildings(), n = Math.max(1, Math.round(RNG.range(3, 8) * (1 - mit)));
    for (let i = 0; i < n && cand.length; i++) damageBuilding(cand.splice(RNG.int(0, cand.length - 1), 1)[0]);
  } else if (d.id === 'blackout') {
    const fast = countAny('maintdepot') > 0;
    S.p6.effects.push({ id: 'blackout', until: t + (fast ? 30 : d.dur), eff: { powerProd: 0.6 }, label: '🔌 Grid blackout' });
  } else if (d.id === 'infrastructure') {
    const roads = []; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && !MAP.blocked[i]) roads.push(i);
    if (roads.length) { const tile = RNG.pick(roads); MAP.blocked[tile] = 2; MAP.pathCache.clear(); S.p6.broken = tile; dispatchMaintenance(tile); }
    S.p6.effects.push({ id: 'watermain', until: t + d.dur, eff: { waterProd: 0.7 }, label: '🚧 Water main burst' });
  }
  S.p6._report = { name: d.name, icon: d.icon, at: t + 6, before: S.buildings.list.filter(function (b) { return b.damaged; }).map(function (b) { return b.id; }) };
}
function disasterReportTick() {
  const r = S.p6._report; if (!r || S.clock.runSec < r.at) return;
  delete S.p6._report;
  const hit = S.buildings.list.filter(function (b) { return (b.damaged || b.fire > 0) && r.before.indexOf(b.id) < 0; });
  const cost = hit.reduce(function (a, b) { return a + Math.round(buildCost(BUILDINGS[b.type]) * 0.1); }, 0);
  const rec = hit.reduce(function (a, b) { return Math.max(a, b.repair || 0); }, r.name === 'Grid Blackout' ? 60 : r.name === 'Infrastructure Failure' ? 90 : 0);
  const rep = { name: r.name, icon: r.icon, day: gameDay(), hit: hit.length, cost: cost, rec: Math.round(rec) };
  S.p6.disasterLog.push(rep); if (S.p6.disasterLog.length > 8) S.p6.disasterLog.shift();
  hit.slice(0, 4).forEach(function (b) { dispatchMaintenance(b); });
  notify('🧾 ' + r.icon + ' ' + r.name + ' report: ' + hit.length + ' building(s) affected · repair cost ' + money(cost) + ' · recovery ~' + Math.ceil(rep.rec / 60) + ' min. Maintenance crews dispatched.', 'gold');
  eventAutosave('after disaster: ' + r.name);
}
/* --- EMERGENCY AI: the best vehicle is chosen by estimated response time (path length + congestion) --- */
function responseEta(from, tile) {
  if (!from || from._entry < 0 || tile < 0) return Infinity;
  const p = roadPath(from._entry, tile, true); if (!p) return Infinity;
  let c = 0; for (let i = 0; i < p.length; i++) c += 1 + (MAP.cong ? MAP.cong[p[i]] * 2 : 0);
  return c * TILE / 60;
}
function bestResponder(types, tile) {
  let best = null, be = Infinity;
  S.buildings.list.forEach(function (b) { if (types.indexOf(b.type) < 0 || !b._op) return; const e = responseEta(b, tile); if (e < be) { be = e; best = b; } });
  return best ? { b: best, eta: be } : null;
}
function dispatchMaintenance(target) {
  const tile = typeof target === 'number' ? target : target._entry;
  if (tile === undefined || tile < 0) return null;
  const r = S.p9 ? emergencyPick('maintenance', tile, 1) : bestResponder(['maintdepot', 'townhall', 'fire'], tile); if (!r) return null;
  const p = roadPath(r.b._entry, tile, true); if (!p) return null;
  const v = makeVehicle('maint', p.length === 1 ? [p[0], p[0]] : p, { dest: typeof target === 'number' ? null : target });
  if (v) { v.repairTile = typeof target === 'number' ? target : -1; S.p6.stats.dispatch++; v.station = r.b.id; v.emKind = 'maintenance'; }
  return v;
}
function onMaintenanceArrive(v) {
  if (v.pipeFix !== undefined) { repairPipe(v.pipeFix); toast('🛠️ Water main repaired — pressure restored', 'good'); }
  if (v.maintFix) maintenanceArrive(v);
  if (v.repairTile >= 0 && MAP.blocked[v.repairTile] === 2) { MAP.blocked[v.repairTile] = 0; MAP.pathCache.clear(); S.p6.effects = S.p6.effects.filter(function (x) { return x.id !== 'watermain'; }); toast('🛠️ Road and water main repaired', 'good'); }
  if (v.dest && v.dest.damaged) { v.dest.repair = Math.min(v.dest.repair || 0, 4); }
}

/* --- TRAFFIC ENGINE: congestion map & rerouting ------------------------------------------------------------------ */
let pathRequests = 0, pathReqRate = 0, pathReqT = 0;
function congestionTick() {
  const N = MAP.W * MAP.H;
  if (!MAP.cong || MAP.cong.length !== N) MAP.cong = new Float32Array(N);
  const c = MAP.cong, base = SIM.traffic / 100;
  for (let i = 0; i < N; i++) c[i] = MAP.roads[i] ? c[i] * 0.7 + base * 0.3 * (1.6 - ROAD_TYPES[MAP.roads[i]].cap / 16) * 0.5 : 0;
  AG.vehicles.forEach(function (v) { if (!v.path) return; const t = v.path[Math.min(v.seg, v.path.length - 1)]; if (t >= 0 && t < N) c[t] = Math.min(1.5, c[t] + (v.speed < 5 ? 0.25 : 0.08) / (ROAD_TYPES[MAP.roads[t]] ? ROAD_TYPES[MAP.roads[t]].lanes : 1)); });
  AG.accidents.forEach(function (a) { c[a.tile] = 1.5; });
  MAP._congT = (MAP._congT || 0) + 1;
  if (MAP._congT % 6 === 0) MAP.pathCache.clear();         // routes adapt to new congestion
  pathReqT += 1; if (pathReqT >= 5) { pathReqRate = pathRequests / pathReqT; pathRequests = 0; pathReqT = 0; }
}
function tryReroute(v) {
  if (v.rerouted || !v.path || v.siren) return;
  const from = v.path[Math.min(v.seg + 1, v.path.length - 1)], to = v.path[v.path.length - 1];
  const np = roadPath(from, to);
  v.rerouted = true;
  if (!np || np.length < 2 || np[1] === v.path[Math.min(v.seg + 2, v.path.length - 1)]) return;
  v.path = np; v.wp = laneWaypoints(np); v.seg = 0; v.t = 0; v.cleared = -1; v.stopped = 0;
  S.p6.stats.reroutes++;
}

/* --- BUILDING ENGINE: evolution (shop → supermarket → mall → mega mall …) ------------------------------------------ */
function evolveTarget(b) { const id = EVOLVE[b.type]; return id ? BUILDINGS[id] : null; }
function evolveCheck(b, forAI) {
  const T = evolveTarget(b); if (!T) return { ok: false, reason: 'Final form' };
  const minLv = BUILDINGS[b.type].w === 1 ? 3 : 5;
  if (b.level < minLv) return { ok: false, reason: 'Needs level ' + minLv, T: T };
  if (!(forAI ? unlockStatusAI(T) : unlockStatus(T).ok)) return { ok: false, reason: 'Locked: ' + (forAI ? '' : unlockStatus(T).reason), T: T };
  const d = bdef(b);
  // temporarily free the old footprint and find a spot for the bigger building that covers it
  for (let yy = b.y; yy < b.y + d.h; yy++) for (let xx = b.x; xx < b.x + d.w; xx++) MAP.occ[idx(xx, yy)] = 0;
  let pos = null;
  for (let y = b.y - T.h + d.h; y <= b.y && !pos; y++) for (let x = b.x - T.w + d.w; x <= b.x && !pos; x++) if (canPlace(T, x, y, true).ok) pos = { x: x, y: y };
  for (let yy = b.y; yy < b.y + d.h; yy++) for (let xx = b.x; xx < b.x + d.w; xx++) MAP.occ[idx(xx, yy)] = b.id;
  if (!pos) return { ok: false, reason: 'Not enough space around it', T: T };
  return { ok: true, T: T, pos: pos, cost: Math.max(0, Math.round(buildCost(T) - buildingValue(b) * 0.6)) };
}
function evolveBuilding(b, auto) {
  const c = evolveCheck(b, auto || isAI(b));
  if (!c.ok) { if (!auto) { toast('✨ Cannot evolve: ' + c.reason, 'bad'); sfx('error'); } return false; }
  if (!auto) { const p = ownerPayer(b); if (funds(p) < c.cost) { toast('❌ Need ' + money(c.cost), 'bad'); sfx('error'); return false; } spend(p, c.cost); }
  else if (isAI(b)) { if (S.ai[b.owner].cash < c.cost * 0.5) return false; S.ai[b.owner].cash -= c.cost * 0.5; }
  const old = BUILDINGS[b.type].name, owner = b.owner, skin = b.skin, id = b.id, wasSel = UI.selected === b;
  removeBuilding(b);
  const nb = makeBuilding(c.T.id, c.pos.x, c.pos.y, id);
  nb.owner = owner; nb.skin = skin; nb.built = false; nb.progress = 0.35; nb.buildTime = Math.max(4, buildTimeFor(c.T.cost) * 0.5);
  addBuildingToMap(nb); onMapChanged();
  const cc = buildingCenter(nb); spawnParticles(cc.x, cc.y - 10, 'spark', 20);
  S.p6.stats.evolved++;
  if (!auto || owner === 'player') notify('✨ ' + old + ' evolved into a ' + c.T.name + (auto ? ' (' + districtName(nb.x, nb.y) + ')' : '') + '!', 'gold');
  if (wasSel) selectBuilding(nb);
  return true;
}
function evolutionTick() {
  if (S.p10 && !S.p10.auto.development) return;          // Part 10: AUTO DEVELOPMENT switched off
  const cand = S.buildings.list.filter(function (b) { return b.built && !b.upg && EVOLVE[b.type] && (isAI(b) || (b.owner === 'player' && S.settings.autoEvolve)); });
  if (!cand.length) return;
  const b = RNG.pick(cand), sec = BUILDINGS[b.type].sector;
  const ratio = sec === 'HOUSING' ? (SIM.housingDemandRatio || 0) : (SIM.demand[sec] || 0) / Math.max(1, SIM.supply[sec] || 0);
  const dist = districtOf(b.x, b.y);
  if (isAI(b) && b.level < 5 && S.ai[b.owner].cash > upgradeCost(b) * 2) { S.ai[b.owner].cash -= upgradeCost(b); b.level++; return; }
  if (ratio > 1.1 && (!dist || dist.level >= 1)) evolveBuilding(b, true);
}

/* --- CITY PLANNING: developers build in the specialised zones -------------------------------------------------------- */
function zoneAllows(z, d) {
  const Z = ZONES[z]; if (!Z) return true;
  if (d.id === 'tree' || d.id === 'park') return true;
  return (Z.cats && Z.cats.indexOf(d.cat) >= 0) || (Z.ids && Z.ids.indexOf(d.id) >= 0);
}
function zoneDevelopTick() {
  if (S.p10 && !S.p10.auto.development) return;
  for (let z = 5; z <= 9; z++) {
    const cands = freeZoneTiles(z);
    if (!cands.length) continue;
    const opts = ZONE_DEVELOP[z].filter(function (o) {
      const d = BUILDINGS[o[0]]; if (!d || !unlockStatusAI(d)) return false;
      if (o[1] === 'TOUR') return S.city.tourismUnlocked;
      if (o[1] === 'HOUSING') return (SIM.housingDemandRatio || 0) > 1.02 && S.city.happiness > 55;
      return (SIM.demand[o[1]] || 0) > (SIM.supply[o[1]] || 0) * 0.95;
    });
    if (!opts.length) continue;
    const o = opts[opts.length - 1], d = BUILDINGS[o[0]];
    const owner = o[1] === 'HOUSING' ? pickAI('dev') : (rivalFor(o[1]) || pickAI('dev'));
    if (!owner || !S.ai[owner]) continue;
    const cost = buildCost(d);
    if (S.ai[owner].cash < cost) continue;
    const sample = []; for (let k = 0; k < Math.min(30, cands.length); k++) sample.push(cands[RNG.int(0, cands.length - 1)]);
    if (S.p9 && propReady()) sample.sort(function (a, b) { return landValueTile(b[0], b[1]) - landValueTile(a[0], a[1]); });   // investors pick the most valuable land of the sample
    for (let k = 0; k < sample.length; k++) {
      const c = sample[k];
      if (!canPlace(d, c[0], c[1], true).ok) continue;
      S.ai[owner].cash -= cost; S.budget += S.p9 ? landPriceFor(c[0], c[1], d) : d.w * d.h * 20 * costMult();
      const b = makeBuilding(d.id, c[0], c[1]); b.owner = owner; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost);
      addBuildingToMap(b); requestMapChanged();
      break;
    }
  }
}

/* --- QUEST ENGINE: dynamic quests & mayor XP ------------------------------------------------------------------------ */
function xpForLevel(L) { return Math.round(120 * Math.pow(L, 1.5)); }
function grantXP(n) {
  const p = S.p6; p.xp += n;
  while (p.xp >= xpForLevel(p.mayorLv)) { p.xp -= xpForLevel(p.mayorLv); p.mayorLv++; notify('🎖️ Mayor level ' + p.mayorLv + '! Permanent income +1% (now +' + Math.min(100, p.mayorLv - 1) + '%).', 'gold'); sfx('levelup'); }
}
function dqTick() {
  const q = S.p6.dq, t = S.clock.runSec;
  for (let i = q.active.length - 1; i >= 0; i--) {
    const a = q.active[i], T = DQ_TEMPLATES.find(function (x) { return x.id === a.tpl; });
    let ok = false; try { ok = T.check(a); } catch (e) { ok = false; }
    if (ok) {
      q.active.splice(i, 1); q.done++;
      const r = T.reward, L = cityLevel(), out = [];
      if (r.money) { const m = Math.round(r.money * 400 * L * costMult()); S.money = Math.min(MONEY_CAP, S.money + m); out.push(money(m)); }
      if (r.rp) { const v = Math.round(r.rp * (1 + L / 5)); S.research.rp += v; out.push(v + ' RP'); }
      if (r.pp) { S.meta.pp += r.pp; out.push(r.pp + ' LP'); }
      if (r.xp) { grantXP(r.xp); out.push(r.xp + ' XP'); }
      notify('✅ ' + T.icon + ' ' + T.title + ' complete! ' + out.join(' · '), 'gold'); sfx('achievement');
    } else if (t > a.deadline) { q.active.splice(i, 1); q.failed++; notify('⌛ Quest expired: ' + T.title, 'bad'); }
  }
  if (q.active.length >= 3 || t < q.nextAt || S.city.population < 15) return;
  q.nextAt = t + RNG.range(60, 130);
  const pool = DQ_TEMPLATES.filter(function (T) { if (q.active.some(function (a) { return a.tpl === T.id; })) return false; try { return T.when() && !T.check({ target: T.target ? T.target() : 0 }); } catch (e) { return false; } });
  if (!pool.length) return;
  const urgent = pool.filter(function (T) { return ['grow', 'earn', 'tech', 'megacity'].indexOf(T.id) < 0; });
  const T = RNG.pick(urgent.length ? urgent : pool);
  q.active.push({ tpl: T.id, target: T.target ? T.target() : 0, start: t, deadline: t + T.dur });
  toast('📋 New quest: ' + T.icon + ' ' + T.title, 'gold');
}

/* --- SCENARIOS, SANDBOX & GENERATED CHALLENGES ------------------------------------------------------------------------ */
function scenarioTick() {
  const sc = S.p6.scenario; if (!sc || sc.done || sc.failed) return;
  if (S.city.tax > sc.taxLimit) S.city.tax = sc.taxLimit;
  const W = SCENARIO_WIN[sc.win];
  if (W.check(sc.v)) {
    sc.done = true;
    celebrate('🏆 SCENARIO COMPLETE<br>' + esc(sc.name), 18);
    grantP5Reward({ pp: 4, money: Math.round(sc.v > 1000 ? 5000 * cityLevel() : 20000) }, 'Scenario "' + sc.name + '" won');
    logHistory('🏆', 'Scenario won: ' + sc.name, 'scenario');
    showModal('🏆 Scenario complete!', '<p style="font-size:14px">You reached the goal: <b>' + W.fmt(sc.v) + '</b> in ' + Math.round((S.clock.runSec - sc.start) / 60) + ' minutes.</p><p class="small">Your city keeps running — the simulation never ends.</p>');
  } else if (sc.limit && S.clock.runSec - sc.start > sc.limit * 60) {
    sc.failed = true;
    notify('⌛ Scenario "' + sc.name + '" failed — time limit reached. Keep playing in free mode!', 'bad');
  }
}
const GEN_TEMPLATES = [
  { id: 'popin', make: function () { const tg = Math.max(500, Math.round((S.city.population * 2 + 400) / 100) * 100); return { text: 'Reach ' + fmt(tg) + ' population in 20 minutes.', metric: 'pop', target: tg, limit: 1200 }; } },
  { id: 'lowtax', make: function () { const tg = Math.round(S.city.population * 1.5 + 100); return { text: 'Grow to ' + fmt(tg) + ' population while keeping tax at 5% or lower.', metric: 'pop', target: tg, limit: 1800, con: 'tax5' }; } },
  { id: 'clean', make: function () { const tg = Math.round(S.city.population * 1.4 + 100); return { text: 'Grow to ' + fmt(tg) + ' population with pollution always below 20.', metric: 'pop', target: tg, limit: 1800, con: 'pol20' }; } },
  { id: 'noloan', make: function () { const tg = Math.round(S.statistics.run.revenue + Math.max(5000, (SIM.income || 1) * 900)); return { text: 'Earn ' + money(tg) + ' total revenue without taking any loan.', metric: 'revenue', target: tg, limit: 1500, con: 'noloan' }; } },
  { id: 'happy', make: function () { return { text: 'Reach 80% happiness in 15 minutes.', metric: 'happy', target: 80, limit: 900 }; } },
  { id: 'score', make: function () { const tg = Math.min(1000, S.p5.score.cur + 60); return { text: 'Raise your City Score to ' + tg + ' in 30 minutes.', metric: 'score', target: tg, limit: 1800 }; } }
];
function generateChallenge() {
  if (S.city.sandbox) { toast('Generated challenges are not available in sandbox', 'bad'); return; }
  const T = RNG.pick(GEN_TEMPLATES), g = T.make();
  S.p6.gen = { id: T.id, text: g.text, metric: g.metric, base: 0, target: g.target, limit: g.limit, start: S.clock.runSec, con: g.con || '', done: false, failed: false, loans: S.bank.loans.length };
  toast('🎲 New challenge: ' + g.text, 'gold'); sfx('notify');
}
function genProgress() { const g = S.p6.gen; if (!g) return 0; return clamp(challengeMetric(g.metric) / Math.max(1e-9, g.target), 0, 1); }
function genChallengeTick() {
  const g = S.p6.gen; if (!g || g.done || g.failed) return;
  if ((g.con === 'tax5' && S.city.tax > 5) || (g.con === 'pol20' && S.city.pollution >= 20 && S.clock.runSec - g.start > 30) || (g.con === 'noloan' && S.bank.loans.length > g.loans)) { g.failed = true; notify('❌ Challenge failed: rule broken (' + g.text + ')', 'bad'); return; }
  if (S.clock.runSec - g.start > g.limit) { g.failed = true; notify('⌛ Generated challenge failed — out of time.', 'bad'); return; }
  if (genProgress() >= 1) {
    g.done = true;
    celebrate('🎲 CHALLENGE COMPLETE', 12);
    const pool = Object.keys(COSMETICS).filter(function (k) { return !hasCosmetic(k); });
    grantP5Reward({ pp: 2, money: Math.round(3000 * cityLevel() * costMult()), badge: 'Challenger', cosmetic: pool[0] }, 'Generated challenge');
    grantXP(150);
  }
}

/* --- DAILY CITY REPORT ------------------------------------------------------------------------------------------------ */
function daySnapshot() {
  return { pop: S.city.population, inc: S.p6.acc.inc, exp: S.p6.acc.exp, hap: S.city.happiness, traffic: SIM.traffic, pol: S.city.pollution, built: S.statistics.totals.built,
    biz: S.buildings.list.filter(function (b) { return b.built && BUILDINGS[b.type].rev; }).length, money: S.money, budget: S.budget, parks: MAP.lists.parks.length };
}
function dailyReportTick(dt) {
  const p = S.p6;
  p.acc.inc += (SIM.income || 0) * dt; p.acc.exp += (SIM.expenses || 0) * dt;
  const d = gameDay();
  if (!p.day.snap) { p.day.n = d; p.day.snap = daySnapshot(); return; }
  if (d === p.day.n) return;
  const a = p.day.snap, b = daySnapshot();
  const rep = { day: p.day.n, pop: b.pop - a.pop, inc: b.inc - a.inc, exp: b.exp - a.exp, hap: b.hap - a.hap, traffic: b.traffic - a.traffic, pol: b.pol - a.pol, built: b.built - a.built, biz: b.biz - a.biz, popNow: b.pop };
  p.reports.push(rep); if (p.reports.length > 10) p.reports.shift();
  p.day.n = d; p.day.snap = b;
  if (S.settings.dailyReport !== false && STARTED) showDailyCard(rep);
}

/* --- ENDGAME: Megacity era, mega projects, global companies & infinite research ---------------------------------------------- */
function megaTick() {
  const m = S.p6.mega, t = S.clock.runSec;
  if (!m.era && (S.city.population >= 20000 || cityLevel() >= 18 || S.p5.story.ch >= STORY.length)) {
    m.era = true;
    celebrate('🌆 MEGACITY ERA', 24);
    notify('🌆 MEGACITY ERA unlocked! Mega projects, global companies, autonomous vehicles and endless growth await (City → Megacity).', 'gold');
    logHistory('🌆', 'The Megacity era began', 'era');
    const tall = S.buildings.list.filter(function (b) { return b.built; }).sort(function (x, y) { return buildingHeight(y) - buildingHeight(x); })[0];
    if (tall) cinematic(tall, 'MEGACITY ERA!');
  }
  for (const id in m.projects) {
    const x = m.projects[id], mp = MEGA_PROJECTS.find(function (q) { return q.id === id; });
    if (x.building && t >= x.ends) {
      x.building = false; x.stage++;
      if (x.stage >= mp.stages) { celebrate(mp.icon + ' ' + mp.name.toUpperCase() + '<br>COMPLETE', 20); notify(mp.icon + ' Mega project complete: ' + mp.name + ' — ' + mp.desc, 'gold'); logHistory(mp.icon, 'Mega project complete: ' + mp.name, 'mega'); if (id === 'fusiongrid') S.city.emergencyPower += 20000; grantXP(500); }
      else notify(mp.icon + ' ' + mp.name + ': stage ' + x.stage + '/' + mp.stages + ' finished.', 'good');
    }
  }
}
function megaStageCost(mp) { return Math.round(mp.cost * costMult()); }
function startMegaStage(id) {
  if (!S.p6.mega.era && !S.city.sandbox) { toast('🔒 Mega projects unlock in the Megacity era', 'bad'); return; }
  const mp = MEGA_PROJECTS.find(function (q) { return q.id === id; }); if (!mp) return;
  const x = S.p6.mega.projects[id] || (S.p6.mega.projects[id] = { stage: 0, building: false, ends: 0 });
  if (x.building || x.stage >= mp.stages) return;
  const c = megaStageCost(mp);
  if (S.budget < c) { toast('❌ Need ' + money(c) + ' city budget', 'bad'); sfx('error'); return; }
  S.budget -= c; x.building = true; x.ends = S.clock.runSec + mp.dur;
  toast(mp.icon + ' ' + mp.name + ' stage ' + (x.stage + 1) + ' under construction', 'good'); sfx('build');
}
function goGlobal(cid) {
  const c = S.companies.list[cid]; if (!c) return;
  if (!S.p6.mega.era) { toast('🔒 Global companies unlock in the Megacity era', 'bad'); return; }
  if (c.level < 7) { toast('Company must reach level 7', 'bad'); return; }
  const cost = Math.round(5e6 * costMult());
  if (S.money < cost) { toast('❌ Need ' + money(cost), 'bad'); return; }
  S.money -= cost; S.p6.mega.global[cid] = 1;
  notify('🌐 ' + companyDef(cid).name + ' is now a GLOBAL company: revenue +20% and listed on world exchanges.', 'gold'); sfx('levelup');
}
function futureTechCost() { const n = S.p6.future; return { rp: Math.round(5000 * Math.pow(1.35, n)), money: Math.round(1e6 * Math.pow(1.3, n) * costMult()) }; }
function futureTechAvailable() { return TECH_LIST.filter(function (t) { return !t.ng; }).every(function (t) { return hasTech(t.id); }); }
function researchFuture() {
  if (!futureTechAvailable()) { toast('Research every base technology first', 'bad'); return; }
  const c = futureTechCost();
  if (S.research.rp < c.rp || S.money < c.money) { toast('❌ Need ' + fmt(c.rp) + ' RP and ' + money(c.money), 'bad'); sfx('error'); return; }
  S.research.rp -= c.rp; S.money -= c.money; S.p6.future++;
  notify('🧬 Future Technology ' + S.p6.future + ' researched: revenue & research +2% (total +' + (2 * S.p6.future) + '%).', 'gold'); sfx('levelup');
}

/* --- CITY RANK per area (no single good/bad grade) ------------------------------------------------------------------------ */
function areaStats() {
  const c = S.city, pop = c.population, comp = S.p5.score.comp || {};
  const infra = clamp(35 * Math.min(SIM.powerRatio, 1) + 35 * Math.min(SIM.waterRatio, 1) + 30 * (1 - SIM.traffic / 100), 0, 100);
  return {
    Economy: clamp(comp.economy || 50, 0, 100), Population: clamp(Math.log10(pop + 1) / 5 * 100, 0, 100), Technology: techIndex(), Infrastructure: infra,
    Tourism: comp.tourism || 0, Environment: comp.environment || 0, Education: c.education, Healthcare: pop < 60 ? 50 : SIM.cov.health * 100
  };
}
function gradeOf(v) { return v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : v >= 20 ? 'D' : 'E'; }
function areaWorldRank(area, v) {
  let better = 0;
  WORLD_CITIES.forEach(function (w) {
    const r = S.p5.rivals[w.id]; if (!r) return;
    const rv = ({ Economy: r.wealth * 100, Population: clamp(Math.log10(r.pop + 1) / 5 * 100, 0, 100), Technology: r.tech, Infrastructure: (r.hap + r.env) / 2, Tourism: r.tour, Environment: r.env, Education: r.tech * 0.8 + 20, Healthcare: r.hap })[area];
    if (rv > v) better++;
  });
  return better + 1;
}

/* --- PERFORMANCE: spatial grid for agents (picking & thoughts) ------------------------------------------------------------- */
const AGRID = { cell: 4, map: new Map(), at: -1 };
function buildAgentGrid() {
  AGRID.map.clear(); const cs = AGRID.cell * TILE;
  AG.citizens.forEach(function (c) { if (c.inside || c.driving) return; const k = Math.floor(c.x / cs) + ',' + Math.floor(c.y / cs); let a = AGRID.map.get(k); if (!a) { a = []; AGRID.map.set(k, a); } a.push(c); });
  AGRID.at = FX.time;
}
function agentsNear(wx, wy) {
  if (FX.time - AGRID.at > 0.5) buildAgentGrid();
  const cs = AGRID.cell * TILE, gx = Math.floor(wx / cs), gy = Math.floor(wy / cs), out = [];
  for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) { const a = AGRID.map.get(x + ',' + y); if (a) for (let i = 0; i < a.length; i++) out.push(a[i]); }
  return out;
}
/* Level-of-detail class for an agent: 0 near (full), 1 medium (reduced), 2 far (statistical) */
let LODV = null;
function lodViewRect() {
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH), mx = (br.x - tl.x) * 0.5, my = (br.y - tl.y) * 0.5;
  LODV = { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y, mx0: tl.x - mx, my0: tl.y - my, mx1: br.x + mx, my1: br.y + my };
}
function lodOf(x, y) {
  if (WE.tier && S.p9) return weTierAt(x, y);            // Part 9: chunk simulation tiers NEAR / MID / FAR
  const v = LODV; if (!v || PHOTO.on) return 0;
  if (x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1) return 0;
  if (x >= v.mx0 && x <= v.mx1 && y >= v.my0 && y <= v.my1) return 1;
  return 2;
}

/* --- CITIZEN ENGINE: extra per-citizen data (age, education, job, income, vehicle, routine) ------------------------------------ */
function citizenProfile(c) {
  if (c.age) return;
  const r = Math.random;
  c.age = c.tourist ? 20 + Math.floor(r() * 50) : 18 + Math.floor(r() * 60);
  const e = S.city.education / 100;
  c.edu = clamp(Math.floor(e * 3.2 + r() * 1.8 - (c.age > 65 ? 1 : 0)), 0, 4);
  c.car = !c.tourist && r() < 0.35 + e * 0.3;
}
function citizenJob(c) {
  const w = citizenBuilding(c.work); if (!w) return { title: c.tourist ? 'Tourist' : (c.age >= 67 ? 'Retired' : 'Unemployed'), income: c.incomeOverride || 0 };
  if (c.incomeOverride !== undefined) return { title: (JOB_TITLES[BUILDINGS[w.type].sector] || 'Worker') + ' @ ' + BUILDINGS[w.type].name, income: c.incomeOverride };
  const d = BUILDINGS[w.type];
  const inc = Math.round((d.sal || 0.2) * (1 + 0.15 * c.edu) * wageLevel() * SECONDS_PER_MONTH / 30);
  return { title: (JOB_TITLES[d.sector] || 'Worker') + ' @ ' + d.name, income: inc };
}
function citizenRoutine(c) {
  if (c.tourist) return 'Hotel → sights → restaurant → shopping → hotel';
  const P = c.pers;
  if (isWeekend()) return P === 'FAMILY' ? 'Home → park → restaurant → home' : P === 'SHOPPER' ? 'Home → mall → cinema → home' : P === 'WORKAHOLIC' ? 'Home → work → gym → home' : 'Home → gym/cinema → restaurant → home';
  return (P === 'WORKAHOLIC' ? 'Wake 06 → work 07-19' : 'Wake 06 → work 08-17') + ' → ' + (P === 'SHOPPER' ? 'shopping' : P === 'ECO_FRIENDLY' ? 'park' : 'market') + ' → home 22';
}

/* --- JOBS & EMPLOYMENT statistics ---------------------------------------------------------------------------------------------- */
function jobStats() {
  const pol = salaryPolicy(); let wages = 0, under = [];
  S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if (!b._op || !d.workers) return; wages += (b._actW || 0) * d.sal * pol.sal * wageLevel(); if (b.workers > 0 && b._actW < b.workers * 0.9) under.push(b); });
  const avg = SIM.employed > 0 ? wages / SIM.employed * SECONDS_PER_MONTH / 30 : 0;
  return { labor: SIM.labor, jobs: SIM.jobs, employed: SIM.employed, unemployment: SIM.unemployment, employment: SIM.labor > 0 ? SIM.employed / SIM.labor : 1,
    avgSalary: avg, open: Math.max(0, Math.round(SIM.jobs - SIM.employed)), shortage: SIM.jobs > SIM.labor ? (SIM.jobs - SIM.labor) / SIM.jobs : 0, under: under.length };
}

/* --- TRANSIT lines ----------------------------------------------------------------------------------------------------------- */
function transitLineStats() {
  if (S.p9) return p9TransitLineStats();                 // Part 9 transit network (stop → line → route → vehicle → passenger)
  const out = [], riders = SIM.riders || 0, cap = Math.max(1, SIM.transitCap || 1), fare = FARE_PER_RIDER * priceLevel();
  const line = function (name, icon, types, vehicles, stationsLabel) {
    let c = 0, maint = 0, st = 0;
    S.buildings.list.forEach(function (b) { if (types.indexOf(b.type) < 0 || !b.built) return; st++; const d = BUILDINGS[b.type]; if (b._op) c += d.transit * lvlMult(b.level) * b._eff; maint += d.maint * lvlMult(b.level); });
    if (!st) return;
    const pass = riders * c / cap;
    out.push({ name: name, icon: icon, stations: st, stationsLabel: stationsLabel, vehicles: vehicles, capacity: c, passengers: pass, income: pass * fare, maint: maint, route: st >= 2 ? 'Loop through ' + st + ' ' + stationsLabel : 'Needs a 2nd ' + stationsLabel.replace(/s$/, '') });
  };
  line('Bus Line 1', '🚌', ['busstop'], AG.vehicles.filter(function (v) { return v.type === 'bus'; }).length, 'stops');
  line('Metro Line M1', '🚇', ['metro'], Math.max(1, Math.ceil(countAny('metro') / 2)), 'stations');
  line('Regional Rail', '🚆', ['trainstation'], countAny('trainstation') * 2, 'stations');
  line('Taxi Fleet', '🚕', ['taxi'], AG.vehicles.filter(function (v) { return v.type === 'taxi'; }).length, 'depots');
  line('Ferry & Cargo', '🚢', ['port'], (AG.ships || []).length, 'ports');
  line('Air Routes', '✈️', ['airport'], AG.planes.length, 'airports');
  return out;
}

/* --- SAVE SYSTEM 2.0: citizens are saved too ------------------------------------------------------------------------------------ */
function serializeCitizens() {
  return AG.citizens.filter(function (c) { return !c.tourist && isFinite(c.x); }).slice(0, 400).map(function (c) {
    return { id: c.id, x: Math.round(c.x), y: Math.round(c.y), home: c.home, work: c.work, age: c.age | 0, edu: c.edu | 0, money: Math.round(c.money), pers: c.pers, car: c.car ? 1 : 0, hap: Math.round(c.happiness || 60),
      fav: c.mem ? [c.mem.favShop || 0, c.mem.favFood || 0, c.mem.favFun || 0] : [0, 0, 0] };
  });
}
function restoreCitizens(raw) {
  if (!Array.isArray(raw)) return 0;
  let n = 0;
  raw.slice(0, 400).forEach(function (r) {
    if (!r || !MAP.byId.has(r.home) || !isFinite(r.x) || !isFinite(r.y)) return;
    const home = MAP.byId.get(r.home), p = doorPoint(home);
    const c = { id: AG.nextId++, x: p.x, y: p.y, state: 'IDLE', target: null, path: null, pi: 0, speed: rand(18, 26), home: r.home, work: MAP.byId.has(r.work) ? r.work : 0,
      money: num(r.money, 100, 0, 1e7), energy: rand(50, 100), needs: { food: rand(40, 100), housing: 100, fun: rand(40, 100), work: 100, shopping: rand(40, 100), rest: 80 },
      inside: home.id, insideUntil: S.clock.gameSec + rand(60, 900), color: pick(CITIZEN_COLORS), skin: pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
      tourist: false, ox: rand(-9, 9), oy: rand(-9, 9), driving: false, lastWorkDay: -1, life: 0, happiness: num(r.hap, 60, 0, 100),
      pers: PERSONALITIES[r.pers] && r.pers !== 'TOURIST' ? r.pers : 'FAMILY', age: clamp(num(r.age, 30) | 0, 18, 99), edu: clamp(num(r.edu, 1) | 0, 0, 4), car: !!r.car,
      mem: { home: r.home, work: r.work, favShop: 0, favFood: 0, favFun: 0, lastEvent: '', visits: {} } };
    if (Array.isArray(r.fav)) { if (MAP.byId.has(r.fav[0])) c.mem.favShop = r.fav[0]; if (MAP.byId.has(r.fav[1])) c.mem.favFood = r.fav[1]; if (MAP.byId.has(r.fav[2])) c.mem.favFun = r.fav[2]; }
    AG.citizens.push(c); n++;
  });
  return n;
}

/* --- Part 6 per-second tick ------------------------------------------------------------------------------------------------------ */
function part6Tick(dt) {
  RNG.sync();
  inflationTick(dt);
  effectsTick();
  crisisTick();
  disasterReportTick();
  dqTick();
  scenarioTick();
  genChallengeTick();
  dailyReportTick(dt);
  megaTick();
  if (S.p6.sandbox && S.p6.sandbox.creative) S.p5.admin.instant = true;
}
