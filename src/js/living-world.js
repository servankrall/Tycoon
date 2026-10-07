'use strict';
/* BLOCK CITY TYCOON — LIVING WORLD (Part 10)
   Part 10 state (S.p10) & master tick, Living World Engine (the city evolves without the player), city life cycle
   (morning / noon / evening / night / weekend, night shifts), dynamic population (births, deaths, migration in/out),
   Company AI 2.0 (strategies, stores, factories, regions, prices, hiring, products, debt), dynamic brands & new companies,
   Stock Market 2.0 (fundamental valuation + news), City News with real effects, City Reputation 0–1000, yearly world city
   ranking, regional competition, dynamic land development and smart automation toggles. */

/* ===================================== STATE (S.p10) ===================================== */
const P10 = { acc: {}, life: null, lifeAt: -99, ui: { tab: 'overview', obs: 'TRAFFIC', graph: 'pop' } };
function p10Every(key, sec, dt) { P10.acc[key] = (P10.acc[key] || 0) + dt; if (P10.acc[key] >= sec) { P10.acc[key] = 0; return true; } return false; }
function lwNew() {
  return {
    ver: 1,
    auto: { development: true, traffic: false, transit: false, build: false, repair: false, economy: false, zoning: false, emergency: true, utility: false },
    autoStats: { traffic: 0, transit: 0, build: 0, repair: 0, economy: 0, zoning: 0, emergency: 0, utility: 0, spent: 0 },
    lw: { founded: 0, opened: 0, closed: 0, jobChanges: 0, moves: 0, hires: 0, layoffs: 0, neighborhoods: 0, log: [] },
    pop: { births: 0, deaths: 0, migIn: 0, migOut: 0, year: { births: 0, deaths: 0, migIn: 0, migOut: 0 }, last: { births: 0, deaths: 0, migIn: 0, migOut: 0 }, wave: '', hist: [] },
    corp: {}, corpLog: [],
    news: [], nextNews: 1, fx: [],
    rep: 500, repParts: {}, repHist: [],
    rank: { year: 0, hist: [] },
    landDev: { evolved: 0, last: '' },
    firsts: {}, trend: {}
  };
}
function newP10(seed) { return Object.assign(lwNew(), svNew(seed), pjNew(seed)); }
/* Generic sanitizer: plain JSON only (finite numbers, short strings, capped arrays, safe keys) merged onto the defaults */
function p10Clean(v, depth) {
  if (depth > 7) return undefined;
  if (typeof v === 'number') return isFinite(v) ? clamp(v, -1e18, 1e18) : 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 220);
  if (Array.isArray(v)) return v.slice(-500).map(function (x) { return p10Clean(x, depth + 1); }).filter(function (x) { return x !== undefined; });
  if (v && typeof v === 'object') { const o = {}; let n = 0; for (const k in v) { if (n++ > 800) break; if (!/^[A-Za-z0-9_\-.]{1,40}$/.test(k)) continue; const c = p10Clean(v[k], depth + 1); if (c !== undefined) o[k] = c; } return o; }
  return undefined;
}
function p10Merge(def, src) {
  if (src === undefined || src === null) return def;
  if (Array.isArray(def)) return Array.isArray(src) ? src : def;
  if (def && typeof def === 'object') {
    if (typeof src !== 'object' || Array.isArray(src)) return def;
    if (!Object.keys(def).length) return src;                // open maps (ids → records)
    const o = {}; for (const k in def) o[k] = p10Merge(def[k], src[k]); return o;
  }
  return typeof src === typeof def ? src : def;
}
function p10Items(arr, max, shape, ok) { return (Array.isArray(arr) ? arr : []).filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); }).map(function (x) { return p10Merge(JSON.parse(JSON.stringify(shape)), x); }).filter(function (x) { return !ok || ok(x); }).slice(-max); }
function sanitizeP10(src, seed) {
  const d = newP10(seed);
  if (!src || typeof src !== 'object') return d;
  const p = p10Merge(d, p10Clean(src, 0));
  lwValidate(p); svValidate(p); pjValidate(p);
  return p;
}
function lwValidate(p) {
  p.rep = clamp(p.rep, 0, 1000);
  p.lw.log = p10Items(p.lw.log, 40, { d: 1, y: 1, icon: '', text: '' });
  p.pop.hist = p10Items(p.pop.hist, 60, { y: 1, pop: 0, births: 0, deaths: 0, migIn: 0, migOut: 0 });
  p.news = p10Items(p.news, 60, { id: 0, d: 1, y: 1, h: 0, icon: '📰', cat: 'city', title: '', text: '', fx: [], stock: null, measured: null, pre: null, at: 0 }, function (n) { return n.title; });
  p.news.forEach(function (n) { n.fx = p10Items(n.fx, 6, { k: '', v: 0 }, function (f) { return NEWS_FX_KINDS.indexOf(f.k) >= 0; }); });
  p.fx = p10Items(p.fx, 30, { k: '', v: 0, until: 0, id: '', src: 0 }, function (f) { return NEWS_FX_KINDS.indexOf(f.k) >= 0 || f.k === 'stock'; });
  p.corpLog = p10Items(p.corpLog, 40, { d: 1, icon: '', text: '' });
  p.repHist = (Array.isArray(p.repHist) ? p.repHist : []).filter(function (x) { return typeof x === 'number'; }).slice(-120);
  p.rank.hist = p10Items(p.rank.hist, 30, { year: 1, ranks: {} });
  for (const id in p.corp) { const m = p.corp[id]; if (!m || typeof m !== 'object') { delete p.corp[id]; continue; } p.corp[id] = p10Merge(corpShape(), m); p.corp[id].hist = (p.corp[id].hist || []).filter(function (x) { return typeof x === 'number'; }).slice(-24); }
  Object.keys(p.auto).forEach(function (k) { p.auto[k] = !!p.auto[k]; });
}

/* ===================================== MASTER TICK ===================================== */
function part10Tick(dt) {
  if (!S.p10 || !STARTED && !BCT_SANDBOX.on) return;
  const frozen = S.p9 && S.p9.freeze.buildings;
  p10T('services', function () { servicesTick(dt); });
  if (p10Every('rep', 2, dt)) p10T('reputation', function () { reputationTick(2); });
  if (p10Every('news', 5, dt)) p10T('news', newsTick);
  if (p10Every('lw', 10, dt)) p10T('living', function () { livingWorldTick(10); });
  if (p10Every('corp', 20, dt)) p10T('companies', function () { companyAI2Tick(20); });
  if (!frozen && p10Every('land', 15, dt)) p10T('land', landDevTick);
  if (p10Every('auto', 30, dt)) p10T('automation', automationTick);
  rankingTick();
  p10T('projects', function () { projectsTick(dt, frozen); }); p10T('aging', function () { agingTick(dt); }); p10T('incidents', function () { incidentsTick10(dt); });
  p10T('civic', function () { civicTick(dt); }); graphsTick(dt); timeMachineTick();
  S.p10.fx = S.p10.fx.filter(function (f) { return f.until > S.clock.runSec; });
}
/* Per-subsystem timing (average / max ms) — shown in the F3 debug panel */
function p10T(name, f) { const t = performance.now(); f(); const ms = performance.now() - t, q = P10.prof[name] || (P10.prof[name] = { ms: 0, n: 0, max: 0 }); q.ms += ms; q.n++; if (ms > q.max) q.max = ms; }
P10.prof = {};
function p10DebugLines() { return '— PART 10 — ' + Object.keys(P10.prof).map(function (k) { const q = P10.prof[k]; return k + ' ' + (q.ms / Math.max(1, q.n)).toFixed(2) + '/' + q.max.toFixed(0) + 'ms'; }).join('  '); }
/* Sandbox runs of the engine (Simulation Lab / What-If) set this flag so nothing leaks into the real world */
const BCT_SANDBOX = { on: false };
/* Part 10 multipliers feed the existing economy (called from globalMods) */
function part10Mods(m) {
  if (!S.p10) return m;
  const P = S.p10;
  m.tour *= 0.85 + P.rep / 3333;                         // reputation attracts tourists
  m.growth *= 0.9 + P.rep / 5000;                         // …and citizens
  P.fx.forEach(function (f) {
    if (f.until <= S.clock.runSec) return;
    if (f.k === 'tour') m.tour *= 1 + f.v;
    else if (f.k === 'growth') m.growth *= 1 + f.v;
    else if (f.k === 'demand') m.demand = (m.demand || 1) * (1 + f.v);
    else if (f.k === 'traffic') m.traffic = (m.traffic || 1) * (1 + f.v);
    else if (f.k === 'pollution') m.pollution = (m.pollution || 1) * (1 + f.v);
    else if (f.k === 'production') m.production *= 1 + f.v;
    else if (f.k === 'jobs') m.jobs *= 1 + f.v;
    else if (f.k === 'rev') m.rev *= 1 + f.v;
  });
  servicesMods(m);
  if (LAB.mods) labApplyMods(m);
  return m;
}

/* ===================================== CITY LIFE CYCLE ===================================== */
const LIFE_PHASES = {
  morning: { name: 'Morning', icon: '🌅', plan: 'Work · school', expect: { work: 0.45, school: 0.12, shop: 0.05, home: 0.25, leisure: 0.03 } },
  noon: { name: 'Noon', icon: '☀️', plan: 'Work · shopping · lunch', expect: { work: 0.42, school: 0.1, shop: 0.18, home: 0.15, leisure: 0.05 } },
  evening: { name: 'Evening', icon: '🌆', plan: 'Home · entertainment · shopping', expect: { work: 0.08, school: 0, shop: 0.16, home: 0.45, leisure: 0.2 } },
  night: { name: 'Night', icon: '🌙', plan: 'Home · night shift · nightlife', expect: { work: 0.06, school: 0, shop: 0.02, home: 0.82, leisure: 0.06 } },
  weekend: { name: 'Weekend', icon: '🎉', plan: 'Park · mall · tourism · entertainment · shopping', expect: { work: 0.06, school: 0, shop: 0.26, home: 0.32, leisure: 0.3 } }
};
function lifePhase() {
  const h = gameHour();
  if (isWeekend() && h >= 8 && h < 23) return 'weekend';
  return h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'noon' : h >= 17 && h < 22 ? 'evening' : 'night';
}
const NIGHT_SECTORS = ['SERVICE', 'ENERGY', 'INDUSTRY', 'TRANSPORT', 'WATER', 'LOGISTICS'];
/* Citizens working at 24-hour workplaces (hospitals, police, power, factories, airport, port …) can be on the night shift */
function p10NightShift(c) {
  if (!c.work || c.id % 4 !== 0) return false;
  const b = citizenBuilding(c.work); if (!b) return false;
  const d = bdef(b);
  return NIGHT_SECTORS.indexOf(d.sector) >= 0 || d.service || d.id === 'datacenter' || d.id === 'airport' || d.id === 'port';
}
function citizenActivity(c) {
  const s = c.state || '';
  if (c.inside) {
    const b = citizenBuilding(c.inside);
    if (b) {
      if (b.id === c.home) return 'home';
      if (b.id === c.work) return 'work';
      const d = bdef(b);
      if (d.edu) return 'school';
      if (d.sector === 'FOOD' || d.sector === 'SHOPPING') return 'shop';
      if (d.sector === 'ENTERTAINMENT' || d.tour || d.hap) return 'leisure';
    }
  }
  if (/WORK/.test(s)) return 'work';
  if (/SCHOOL/.test(s)) return 'school';
  if (/RESTAURANT|SHOPPING/.test(s)) return 'shop';
  if (/ENTERTAINMENT|PARK/.test(s)) return 'leisure';
  if (/HOME/.test(s)) return 'home';
  return 'other';
}
function lifeStats() {
  if (P10.life && performance.now() - P10.lifeAt < 1500) return P10.life;
  const out = { work: 0, school: 0, shop: 0, home: 0, leisure: 0, other: 0, moving: 0, night: 0, n: 0, tourists: 0 };
  AG.citizens.forEach(function (c) {
    if (c.tourist) { out.tourists++; return; }
    out.n++; out[citizenActivity(c)]++;
    if (!c.inside && c.path) out.moving++;
    if (p10NightShift(c)) out.night++;
  });
  out.phase = lifePhase(); P10.life = out; P10.lifeAt = performance.now();
  return out;
}

/* ===================================== DYNAMIC POPULATION ===================================== */
/* Replaces the single "growth" step of the economy: natural change + migration driven by jobs, housing prices,
   education, quality of life, unemployment and reputation (called from econTick section 20). */
function p10PopulationStep(p, dt, housingCap, A, gmult) {
  const city = S.city, P = S.p10.pop, H = svHealthAccess();
  const births = p * 0.00035 * (0.75 + city.happiness / 200) * (0.7 + 0.3 * H) * (p < housingCap ? 1 : 0.35) * dt;
  const deaths = p * 0.00022 * (1.35 - 0.6 * H) * (1 + city.pollution / 150) * (1 + (SIM.healthOverload || 0) * 0.5) * dt;
  const M = A + (city.education - 50) / 500 + (S.p10.rep - 500) / 2500 - Math.max(0, city.housingPrice - 1.4) * 0.25;
  let migIn = 0, migOut = 0;
  if (M > 0 && p < housingCap) migIn = Math.min(housingCap - p, (p * 0.0055 + 0.3) * M * gmult * dt);
  if (M < 0) migOut = p * 0.003 * (-M) * dt;
  if (city.tax > 22 && city.happiness < 45) migOut += p * 0.002 * dt;
  let np = p + births - deaths + migIn - migOut;
  if (np > housingCap) { const o = Math.min(np - housingCap, (np - housingCap) * 0.04 * dt + 0.05); np -= o; migOut += o; }
  np = Math.max(0, np);
  if (!BCT_SANDBOX.on) {
    P.births += births; P.deaths += deaths; P.migIn += migIn; P.migOut += migOut;
    P.year.births += births; P.year.deaths += deaths; P.year.migIn += migIn; P.year.migOut += migOut;
  }
  SIM.p10Mig = M; SIM.p10Rates = { births: births / dt, deaths: deaths / dt, migIn: migIn / dt, migOut: migOut / dt };
  return np;
}
function populationYearRoll() {
  const P = S.p10.pop;
  P.hist.push({ y: gameYear() - 1, pop: Math.round(S.city.population), births: Math.round(P.year.births), deaths: Math.round(P.year.deaths), migIn: Math.round(P.year.migIn), migOut: Math.round(P.year.migOut) });
  if (P.hist.length > 60) P.hist.shift();
  P.last = { births: P.year.births, deaths: P.year.deaths, migIn: P.year.migIn, migOut: P.year.migOut };
  P.year = { births: 0, deaths: 0, migIn: 0, migOut: 0 };
}

/* ===================================== LIVING WORLD ENGINE ===================================== */
function lwLog(icon, text) { const L = S.p10.lw.log; L.unshift({ d: gameDay(), y: gameYear(), icon: icon, text: String(text).slice(0, 160) }); if (L.length > 40) L.length = 40; }
function livingWorldTick(dt) {
  const P = S.p10, pop = S.city.population;
  // migration waves become news (MIGRATION IN when the city thrives, MIGRATION OUT when it declines)
  const M = SIM.p10Mig || 0, dIn = P.pop.migIn - (P.pop.snapIn || P.pop.migIn), dOut = P.pop.migOut - (P.pop.snapOut || P.pop.migOut);
  P.pop.snapIn = P.pop.migIn; P.pop.snapOut = P.pop.migOut;
  const held = P.pop.wave === 'in' ? M > 0.15 : P.pop.wave === 'out' ? M < -0.05 : false;            // hysteresis: a wave lasts until the trend turns
  const wave = held ? P.pop.wave : pop > 300 && M > 0.35 && dIn > pop * 0.004 ? 'in' : pop > 300 && M < -0.12 && dOut > pop * 0.003 ? 'out' : '';
  if (wave && wave !== P.pop.wave && P.pop.waveDay !== gameDay() + ':' + wave) {
    P.pop.waveDay = gameDay() + ':' + wave;
    const perDay = Math.round(wave === 'in' ? dIn : dOut);
    if (wave === 'in') newsAdd('🧳', 'MIGRATION IN: ' + fmt(perDay) + ' newcomers in the last hours', 'Jobs (' + Math.round((1 - SIM.unemployment) * 100) + '% employed), quality of life and a reputation of ' + Math.round(P.rep) + ' attract new residents.', { cat: 'population', fx: [{ k: 'demand', v: 0.03 }] });
    else newsAdd('🚚', 'MIGRATION OUT: ' + fmt(perDay) + ' residents left in the last hours', 'Unemployment ' + Math.round(SIM.unemployment * 100) + '%, happiness ' + Math.round(S.city.happiness) + '% and housing prices ×' + S.city.housingPrice.toFixed(2) + ' push people away.', { cat: 'population', fx: [{ k: 'demand', v: -0.03 }] });
    lwLog(wave === 'in' ? '🧳' : '🚚', 'Migration ' + (wave === 'in' ? 'in' : 'out') + ': ' + fmt(perDay) + ' people');
  }
  P.pop.wave = wave;
  if (S.p9 && S.p9.freeze.citizens) return;
  lwJobChanges(); lwMoves(); lwNeighborhoods(); lwClosures(); lwMaybeFound(); lwInvestment(dt); lwTrends();
}
/* Citizens change jobs: a better-paid job that matches their education wins them over */
function lwJobChanges() {
  const C = AG.citizens; if (C.length < 10) return;
  const jobs = MAP.lists.jobs.filter(function (b) { return b._op && b.workers > 0 && bdef(b).sector !== 'HOUSING'; }); if (jobs.length < 2) return;
  let n = 0;
  for (let k = 0; k < Math.min(30, C.length); k++) {
    const c = C[Math.floor(Math.random() * C.length)]; if (c.tourist || !c.work || c.inside === c.work) continue;
    citizenProfile(c);
    const cur = citizenBuilding(c.work); if (!cur) continue;
    const cand = jobs[Math.floor(Math.random() * jobs.length)], d = bdef(cand);
    if (cand === cur || jobEduNeed(d) > c.edu) continue;
    const payNow = bdef(cur).sal * (cur._eff || 0.5), payNew = d.sal * (cand._eff || 0.5) * wageBoostOf(cand);
    if (payNew > payNow * 1.2 && Math.random() < 0.5) { c.work = cand.id; c.mem.work = cand.id; n++; }
  }
  if (n) { S.p10.lw.jobChanges += n; if (n >= 3) lwLog('💼', n + ' citizens switched to better-paid jobs'); }
}
function jobEduNeed(d) { return d.sector === 'SCIENCE' || d.sector === 'TECHNOLOGY' || d.service === 'health' ? 3 : d.sector === 'FINANCE' || d.eduHigh ? 2 : d.cat === 'Industry' || d.sector === 'EDUCATION' ? 1 : 0; }
function wageBoostOf(b) { const o = b.owner; const st = S.ai[o]; return st && st.level ? 1 + 0.03 * st.level : 1; }
/* Households move when rent becomes too expensive for them or the home lost power/water */
function lwMoves() {
  const C = AG.citizens; if (C.length < 10 || !S.p9) return;
  const homes = MAP.lists.homes.filter(function (b) { return b._op && b._hcap > 0; }); if (homes.length < 2) return;
  let n = 0; const flow = {};
  for (let k = 0; k < Math.min(20, C.length); k++) {
    const c = C[Math.floor(Math.random() * C.length)]; if (c.tourist) continue;
    const h = citizenBuilding(c.home); if (!h) continue;
    const rent = rentMult(h) * S.city.housingPrice, bad = !h._powered || (h._wp !== undefined && h._wp < 0.3);
    if (!(rent > 1.5 && c.money < 150) && !bad && !(c.happiness < 35)) continue;
    const alt = homes[Math.floor(Math.random() * homes.length)];
    if (alt === h || rentMult(alt) * S.city.housingPrice >= rent * 0.9 && !bad) continue;
    c.home = alt.id; c.mem.home = alt.id; n++;
    const a = regionName(h.x, h.y), b = regionName(alt.x, alt.y); if (a !== b) flow[a + ' → ' + b] = (flow[a + ' → ' + b] || 0) + 1;
  }
  if (n) { S.p10.lw.moves += n; const f = Object.keys(flow); if (f.length) lwLog('🏠', n + ' households moved (' + f.slice(0, 2).join(', ') + ')'); }
}
function regionName(x, y) { try { weEnsure(); return REGION_DEFS[WE.region[chunkOfTile(x, y)]].name; } catch (e) { return 'City'; } }
/* New neighbourhoods form when an 8×8 district reaches medium density for the first time */
function lwNeighborhoods() {
  const D = MAP.districts; if (!D || !D.length) return;
  D.forEach(function (t, k) {
    if (t.level < 1 || S.p10.firsts['nb' + k]) return;
    S.p10.firsts['nb' + k] = 1;
    if (S.clock.runSec < 30) return;           // existing districts of a loaded / generated city are not "new"
    const x = (k % MAP.dN) * 8 + 4, y = Math.floor(k / MAP.dN) * 8 + 4, nm = districtName(x, y) || regionName(x, y);
    S.p10.lw.neighborhoods++;
    newsAdd('🏘️', 'New neighbourhood forming: ' + nm, Math.round(t.res) + ' residents and ' + fmt(t.jobs) + ' jobs — density reached ' + DENSITY_NAMES[Math.min(3, t.level)] + '.', { cat: 'city' });
    lwLog('🏘️', 'New neighbourhood: ' + nm);
  });
}
/* Run-down private buildings close (very poor condition and losing money) */
function lwClosures() {
  const L = S.buildings.list;
  for (let k = 0; k < Math.min(40, L.length); k++) {
    const b = L[Math.floor(Math.random() * L.length)], d = bdef(b);
    if (!b.built || b.closed || !isAI(b) || !d.rev || (b.cond === undefined ? 100 : b.cond) > 15 || (b._rev || 0) >= (b._cost || 0)) continue;
    b.closed = true; S.p10.lw.closed++;
    lwLog('🚪', d.name + ' closed in ' + (districtName(b.x, b.y) || 'the city') + ' (run-down, unprofitable)');
    return;
  }
}
/* New companies are founded where demand is not covered (reputation and population attract founders) */
const LW_FOUNDER_NAMES = {
  SHOPPING: ['CITY MART', 'NOVA MARKET', 'CORNER PLUS', 'DAILY BASKET'], FOOD: ['URBAN GRILL', 'BLOCK BITES', 'GREEN BOWL'], TECHNOLOGY: ['TECH CORE', 'PIXEL SYSTEMS', 'CLOUDLINE'],
  FINANCE: ['CITY CAPITAL', 'SUMMIT TRUST'], ENTERTAINMENT: ['STARLIGHT', 'NIGHT PULSE'], INDUSTRY: ['STEELWORKS UNITED', 'PRIME FABRICATION'], HOUSING: ['NEST HOMES', 'HORIZON LIVING']
};
const LW_FOUNDER_ICONS = { SHOPPING: '🛍️', FOOD: '🍔', TECHNOLOGY: '💡', FINANCE: '🏦', ENTERTAINMENT: '🎭', INDUSTRY: '🏗️', HOUSING: '🏡' };
function lwMaybeFound() {
  const P = S.p10, pop = S.city.population, t = S.clock.runSec;
  if (pop < 1200 || !S.p8 || S.p8.companies.length >= 12 || t - (P.lw.lastFound || -1e9) < 600) return;
  let best = null, br = 1.25;
  ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'].forEach(function (s) { const r = (SIM.demand[s] || 0) / Math.max(1, SIM.supply[s] || 0); if (r > br) { br = r; best = s; } });
  if (!best && (SIM.housingDemandRatio || 0) > 1.2) best = 'HOUSING';
  if (!best && SIM.unemployment > 0.12) best = 'INDUSTRY';
  if (!best || Math.random() > 0.25 + P.rep / 2000) return;
  lwFoundCompany(best);
}
function lwFoundCompany(sector, silent) {
  if (!S.p8 || S.p8.companies.length >= 12) return null;
  const used = AI_DEFS.map(function (a) { return a.name.replace(/ (GROUP|HOLDINGS|GLOBAL)$/, ''); });
  const pool = (LW_FOUNDER_NAMES[sector] || ['NEW VENTURES']).filter(function (n) { return used.indexOf(n) < 0; });
  if (!pool.length) return null;
  const name = pool[Math.floor(Math.random() * pool.length)];
  const id = 'cx_' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-10);
  const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#8338ec', '#3a86ff', '#ff006e', '#06d6a0'];
  S.p8.companies.push({ id: id, name: name, icon: LW_FOUNDER_ICONS[sector] || '🏢', sector: sector, color: colors[S.p8.companies.length % colors.length] });
  registerCustomCompanies(S.p8);
  S.ai[id] = { cash: Math.round((40000 + S.city.population * 4) * costMult()), rep: 50, quality: 1, price: 0.95, level: 1, acquired: false, profit: 0, rev: 0 };
  stockOf(id);
  const m = corpMeta(id); m.lw = true; m.founded = gameDay(); m.base = name; m.strategy = 'startup';
  const a = aiDef(id); let n = 0;
  for (let k = 0; k < 2; k++) if (aiBuild(id, sector, a.zone, null)) n++;
  S.p10.lw.founded++; S.p10.lw.lastFound = S.clock.runSec;
  if (!silent) newsAdd(a.icon, 'New company founded: ' + name, 'A new ' + sector.toLowerCase() + ' company entered the market with ' + money(S.ai[id].cash) + ' of investor capital' + (n ? ' and ' + n + ' store(s) under construction.' : '.'), { cat: 'business', stock: { id: id, pct: 0 } });
  lwLog(a.icon, 'Founded: ' + name + ' (' + sector + ')');
  return id;
}
/* Living-world companies without stores or money dissolve; shareholders are paid out at the market price */
function lwDissolve(id) {
  const a = aiDef(id), st = S.ai[id]; if (!a || !a.custom) return;
  const s = S.p6.stocks[id]; if (s && s.qty > 0) S.money = Math.min(MONEY_CAP, S.money + s.qty * s.price);
  S.p8.companies = S.p8.companies.filter(function (c) { return c.id !== id; });
  delete S.ai[id]; delete S.p6.stocks[id]; delete S.p10.corp[id];
  registerCustomCompanies(S.p8);
  newsAdd('📉', a.name + ' shuts down', 'The company ran out of money (' + money(st ? st.cash : 0) + ') without a single operating store.', { cat: 'business' });
  lwLog('📉', a.name + ' dissolved');
}
/* Reputation and growth attract outside investment into the companies */
function lwInvestment(dt) {
  const rep = S.p10.rep; if (rep <= 500 || S.city.population < 100) return;
  const inv = S.city.population * 0.01 * (rep - 500) / 500 * dt;
  AI_DEFS.forEach(function (a) { const st = S.ai[a.id]; if (st && !st.acquired && (st.profit || 0) >= 0) st.cash += inv * (0.5 + (st.rep || 50) / 100); });
}
/* Trends (land prices, traffic, tourism, trade) are sampled once per game day for news and the dashboard */
function lwTrends() {
  const T = S.p10.trend, day = gameDay();
  if (T.day === day) return;
  const regs = weRegionStats(false), land = regs.reduce(function (a, r) { return a + r.landValue * r.tiles; }, 0) / Math.max(1, regs.reduce(function (a, r) { return a + r.tiles; }, 0));
  const now = { land: land, traffic: SIM.traffic, tourists: S.city.tourists, trade: S.p9 ? S.p9.neighbors.reduce(function (a, n) { return a + (n.exp || 0) + (n.imp || 0); }, 0) : 0, water: SIM.waterUse || 0 };
  if (T.prev && T.prev.land > 0) {
    const dl = (now.land / T.prev.land - 1) * 100;
    if (Math.abs(dl) >= 8 && S.city.population > 500) newsAdd(dl > 0 ? '🏷️' : '📉', 'Land prices ' + (dl > 0 ? 'up ' : 'down ') + Math.abs(dl).toFixed(0) + '% in a day', 'Average land value ' + fmt(Math.round(now.land * 100)) + ' points (traffic ' + Math.round(SIM.traffic) + '%, services, parks and pollution decide the price).', { cat: 'economy' });
    if (T.prev.water > 0 && now.water > T.prev.water * 1.15 && SIM.waterRatio < 1.1 && now.water > 20) newsAdd('💧', 'Water demand is rising: +' + Math.round((now.water / T.prev.water - 1) * 100) + '%', 'Consumption ' + fmt(Math.round(now.water)) + ' vs production ' + fmt(Math.round(SIM.waterGen || 0)) + ' — new pumps or a water plant will be needed.', { cat: 'utility' });
  }
  T.prev = now; T.day = day;
}

/* ===================================== COMPANY AI 2.0 ===================================== */
function corpShape() { return { base: '', stage: 0, founded: 1, debt: 0, strategy: 'steady', last: '', products: 0, rd: 0, priceBias: 0, hist: [], growth: 0, lw: false, opened: 0, openedDay: 0, broke: 0 }; }
function corpMeta(id) { const C = S.p10.corp; if (!C[id]) C[id] = corpShape(); return C[id]; }
const BRAND_SUFFIX = ['', ' GROUP', ' HOLDINGS', ' GLOBAL'];
function landRel(x, y) { return propReady() && PROP.avg > 0 ? landValueTile(x, y) / PROP.avg : 1; }   // 1 = average land value of the city
function corpPriceBias(id) { const m = S.p10 && S.p10.corp[id]; return m ? m.priceBias : 0; }
function companyShare(id) { const a = aiDef(id); if (!a) return 0; const sec = a.sectors[0]; const sh = sec === 'HOUSING' || sec === 'INDUSTRY' ? marketShares(sec) : (SIM.share && SIM.share[sec]) || {}; return sh[id] || 0; }
function corpLog(icon, text) { const L = S.p10.corpLog; L.unshift({ d: gameDay(), icon: icon, text: String(text).slice(0, 160) }); if (L.length > 40) L.length = 40; }
function companyAI2Tick(dt) {
  const day = gameDay();
  AI_DEFS.slice().forEach(function (a) {
    const st = S.ai[a.id]; if (!st || st.acquired) return;
    const m = corpMeta(a.id);
    m.hist.push(st.assets || 0); if (m.hist.length > 24) m.hist.shift();
    m.growth = m.hist.length >= 6 && m.hist[m.hist.length - 6] > 0 ? (st.assets || 0) / m.hist[m.hist.length - 6] - 1 : 0;
    brandTick(a, st, m);
    if (m.debt > 0) { const interest = m.debt * 0.0006 * dt; st.cash = Math.max(0, st.cash - interest); if (st.cash > m.debt * 1.5) { st.cash -= m.debt * 0.25; m.debt *= 0.75; if (m.debt < 100) m.debt = 0; } }
    if (m.lw && (st.count || 0) === 0 && st.cash < 3000 && day - m.founded >= 2) { lwDissolve(a.id); return; }
    corpDecide(a, st, m);
    if (m.openedDay !== day) { if (m.opened >= 3) storesNews(a, m.opened); m.opened = 0; m.openedDay = day; }
  });
}
function corpDecide(a, st, m) {
  const sec = a.sectors[0], share = companyShare(a.id), profit = st.profit || 0;
  const rivals = AI_DEFS.filter(function (x) { return x.id !== a.id && !S.ai[x.id].acquired && x.sectors[0] === sec; });
  const rivalShare = rivals.reduce(function (mx, x) { return Math.max(mx, companyShare(x.id)); }, SIM.share && SIM.share[sec] ? SIM.share[sec].player || 0 : 0);
  const ratio = sec === 'HOUSING' ? (SIM.housingDemandRatio || 0) : sec === 'INDUSTRY' ? (SIM.unemployment > 0.08 ? 1.3 : 1) : (SIM.demand[sec] || 0) / Math.max(1, SIM.supply[sec] || 0);
  const expandCost = 20000 * costMult();
  const neg = S.p6.stocks[a.id] ? S.p6.stocks[a.id].neg || 0 : 0;
  m.strategy = profit < 0 && neg > 90 ? 'cost cutting' : share < 0.15 && rivalShare > 0.35 && st.cash > expandCost * 0.5 && sec !== 'HOUSING' && sec !== 'INDUSTRY' ? 'compete' : ratio > 1.05 && st.cash > expandCost ? 'expand' : (st.rep || 50) > 70 && share > 0.3 ? 'premium' : 'steady';
  if (m.strategy !== 'compete' && m.strategy !== 'premium') m.priceBias *= 0.8;
  const act = function (icon, text) { m.last = text; corpLog(icon, a.name + ' — ' + text); };
  switch (m.strategy) {
    case 'expand': {
      // enter the region where the company is weakest, otherwise open where land is best
      const reg = corpWeakRegion(a.id);
      const ok = reg >= 0 && Math.random() < 0.5 ? lwPlaceStore(a.id, sec, a.zone, reg) : aiBuild(a.id, sec, a.zone, null);
      if (ok) { m.opened++; S.p10.lw.opened++; act('🏪', reg >= 0 ? 'opened a store in the ' + REGION_DEFS[reg].name + ' region' : 'opened a new ' + (sec === 'INDUSTRY' ? 'plant' : 'store')); }
      else if (profit > 0 && m.debt < (st.assets || 0) * 0.4) { const loan = expandCost * 2; m.debt += loan; st.cash += loan; act('🏦', 'borrowed ' + money(loan) + ' to finance expansion'); }
      // vertical integration: shops that run short of goods build their own factory
      if (d0GoodsShort(sec) && st.cash > expandCost * 2 && aiBuild(a.id, 'INDUSTRY', 3, null)) act('🏭', 'built its own factory (goods supply ' + Math.round((SIM.goodsRatio || 0) * 100) + '%)');
      corpHire(a, m, 0.1);
      break;
    }
    case 'compete': {
      m.priceBias = clamp(m.priceBias - 0.05, -0.2, 0.2);
      const c = 5000 * costMult();
      if (st.cash > c * 2 && !(st.adUntil > S.clock.runSec)) { st.cash -= c; st.adUntil = S.clock.runSec + 150; }
      if (st.cash > c * 3) { st.cash -= c; m.rd += c * 0.3; st.quality = clamp(st.quality + 0.02, 0.6, 1.6); }
      act('⚔️', 'price war (prices ' + Math.round(m.priceBias * 100) + '%), marketing and quality push vs a ' + Math.round(rivalShare * 100) + '% rival');
      break;
    }
    case 'premium': {
      m.priceBias = clamp(m.priceBias + 0.03, -0.2, 0.2);
      const c = 8000 * costMult();
      if (st.cash > c * 2) { st.cash -= c; m.rd += c * 0.3; st.quality = clamp(st.quality + 0.03, 0.6, 1.6); }
      act('💎', 'premium positioning: prices +' + Math.round(m.priceBias * 100) + '%, quality ' + st.quality.toFixed(2));
      break;
    }
    case 'cost cutting': {
      m.priceBias = clamp(m.priceBias * 0.5, -0.2, 0.2);
      const fired = corpHire(a, m, -0.08);
      act('✂️', fired ? 'cost cutting: ' + fired + ' job(s) cut at loss-making sites' : 'cost cutting: spending frozen');
      if (fired >= 40 && m.layoffDay !== gameDay()) m.layoffDay = gameDay(), newsAdd('✂️', a.name + ' cuts ' + fmt(fired) + ' jobs', 'Losses of ' + money(-profit) + '/s forced layoffs across its ' + (st.count || 0) + ' sites.', { cat: 'business', stock: { id: a.id, pct: -0.05 } });
      break;
    }
    default: {
      const own = S.buildings.list.filter(function (b) { return b.owner === a.id && b.built && !b.upg && b.level < MAX_LEVEL; });
      if (own.length && profit > 0) { const b = own.sort(function (x, y) { return (y._rev || 0) - (x._rev || 0); })[0], c = upgradeCost(b); if (st.cash > c * 1.5) { st.cash -= c; b.upg = 0.0001; b.upgTime = buildTimeFor(bdef(b).cost) * 0.6; act('⬆️', 'invested ' + money(c) + ' to upgrade its best ' + bdef(b).name); } }
      corpHire(a, m, 0.05);
    }
  }
  // product development: research spending turns into new products (quality ↑, stock ↑)
  const rdNeed = 60000 * costMult() * Math.pow(1 + m.products, 1.5);
  if (m.rd >= rdNeed) {
    m.rd = 0; m.products++; st.quality = clamp(st.quality + 0.05, 0.6, 1.6);
    newsAdd(a.icon, a.name + ' launches product line #' + m.products, 'Quality rises to ' + st.quality.toFixed(2) + ' after ' + money(rdNeed) + ' of development.', { cat: 'business', stock: { id: a.id, pct: 0.04 } });
  }
}
function d0GoodsShort(sec) { return (sec === 'SHOPPING' || sec === 'FOOD') && (SIM.goodsRatio !== undefined ? SIM.goodsRatio < 0.75 : false); }
/* Hiring / layoffs change the staffed positions of the company's buildings */
function corpHire(a, m, rate) {
  let delta = 0;
  S.buildings.list.forEach(function (b) {
    if (b.owner !== a.id || !b.built) return;
    const d = bdef(b); if (!d.workers) return;
    const profitable = (b._rev || 0) > (b._cost || 0), losing = (b._rev || 0) < (b._cost || 0) * 0.8;
    if (rate > 0 && profitable && b.workers < d.maxW * lvlMult(b.level)) { const n = Math.max(1, Math.round(b.workers * rate)); const nw = Math.min(Math.round(d.maxW * lvlMult(b.level)), b.workers + n); delta += nw - b.workers; b.workers = nw; }
    else if (rate < 0 && losing && b.workers > Math.ceil(d.workers * 0.5)) { const n = Math.max(1, Math.round(b.workers * -rate)); const nw = Math.max(Math.ceil(d.workers * 0.5), b.workers - n); delta -= b.workers - nw; b.workers = nw; }
  });
  if (delta > 0) S.p10.lw.hires += delta; else S.p10.lw.layoffs += -delta;
  return Math.abs(delta);
}
function corpWeakRegion(id) {
  weEnsure();
  const cnt = REGION_DEFS.map(function () { return 0; }), dem = REGION_DEFS.map(function () { return 0; });
  S.buildings.list.forEach(function (b) { const r = WE.region[chunkOfTile(b.x, b.y)]; if (b.owner === id) cnt[r]++; if (bdef(b).housing) dem[r] += b._hcap || 0; });
  let best = -1, bs = 0;
  cnt.forEach(function (c, r) { const s = dem[r] / (1 + c * 3); if (dem[r] > 200 && s > bs) { bs = s; best = r; } });
  return cnt[best] === 0 || best < 0 ? best : (Math.random() < 0.5 ? best : -1);
}
/* Like aiBuild, restricted to one region of the world */
function lwPlaceStore(aiId, sector, zone, reg) {
  const ai = S.ai[aiId]; if (!ai) return false;
  weEnsure();
  const cands = freeZoneTiles(zone).filter(function (c) { return WE.region[chunkOfTile(c[0], c[1])] === reg; });
  if (!cands.length) return false;
  const opts = (AI_BUILD_OPTIONS[sector] || []).filter(function (o) { return unlockStatusAI(BUILDINGS[o[0]]) && o[0] !== 'warehouse'; });
  for (let k = 0; k < Math.min(25, cands.length); k++) {
    const c = cands[Math.floor(Math.random() * cands.length)], dist = districtOf(c[0], c[1]), tier = dist ? dist.level : 0;
    const ch = opts.filter(function (o) { return o[1] <= tier; }).sort(function (x, y) { return y[1] - x[1]; });
    for (let j = 0; j < ch.length; j++) {
      const d = BUILDINGS[ch[j][0]], land = S.p9 ? landPriceFor(c[0], c[1], d) : d.w * d.h * 20 * costMult(), cost = buildCost(d) + land;
      if (ai.cash < cost * 1.05 || !canPlace(d, c[0], c[1], true).ok) continue;
      const b = makeBuilding(d.id, c[0], c[1]); b.owner = aiId; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost) * 1.2;
      if (d.recipes) b.recipe = d.recipes[0];
      ai.cash -= cost; S.budget = Math.min(MONEY_CAP, S.budget + land);
      addBuildingToMap(b); requestMapChanged();
      return true;
    }
  }
  return false;
}
function storesNews(a, n) {
  const st = S.ai[a.id], pct = clamp(n / Math.max(1, st.count || n) * 0.25, 0.02, 0.12);
  newsAdd(a.icon, a.name + ' opens ' + n + ' new ' + (a.sectors[0] === 'INDUSTRY' ? 'plants' : a.sectors[0] === 'HOUSING' ? 'housing projects' : 'stores'), 'The company now runs ' + (st.count || 0) + ' sites (' + Math.round(companyShare(a.id) * 100) + '% market share, ' + money(st.cash) + ' cash).', { cat: 'business', stock: { id: a.id, pct: pct } });
}
/* Dynamic brands: CITY MART → CITY MART GROUP → … HOLDINGS → … INTERNATIONAL; a bankruptcy gives birth to a new brand */
function brandTick(a, st, m) {
  const name = a.name, strip = name.replace(/ (GROUP|HOLDINGS|GLOBAL)$/, '');
  const regions = new Set(); S.buildings.list.forEach(function (b) { if (b.owner === a.id) regions.add(WE.region[chunkOfTile(b.x, b.y)]); });
  const n = st.count || 0, stage = n >= 40 && regions.size >= 4 ? 3 : n >= 20 ? 2 : n >= 8 || (st.level || 1) >= 5 ? 1 : 0;
  // first sight (new game, loaded or generated world): the current size is the starting point, the name is kept
  if (!m.base) { m.base = strip; m.stage = Math.max(stage, BRAND_SUFFIX.indexOf(name.slice(strip.length))); return; }
  if (strip !== m.base) {                       // re-founded after a bankruptcy under a new name
    const old = m.base + BRAND_SUFFIX[m.stage];
    m.base = strip; m.stage = Math.max(0, BRAND_SUFFIX.indexOf(name.slice(strip.length))); m.founded = gameDay(); m.debt = 0; m.products = 0; m.rd = 0;
    newsAdd(a.icon, 'New company born: ' + name, 'After the collapse of ' + old + ', ' + name + ' took over its ' + (st.count || 0) + ' site(s).', { cat: 'business', stock: { id: a.id, pct: 0 } });
    return;
  }
  if (stage > m.stage) {
    const old = name; m.stage = stage;
    S.p6.names[a.id] = (m.base + BRAND_SUFFIX[stage]).slice(0, 28); applyCompanyNames();
    newsAdd(a.icon, old + ' becomes ' + a.name, 'Growth to ' + n + ' sites in ' + regions.size + ' region(s) turns the company into a ' + BRAND_SUFFIX[stage].trim().toLowerCase() + '.', { cat: 'business', stock: { id: a.id, pct: 0.05 } });
  }
}

/* ===================================== STOCK MARKET 2.0 ===================================== */
/* Fundamental value from revenue, profit, growth, debt, reputation and market share (+ news sentiment) */
function p10FairValue(id, st) {
  const m = corpMeta(id), share = companyShare(id), g = clamp(m.growth || 0, -0.5, 1);
  const base = ((st.assets || 0) * 0.55 + st.cash * 0.35 - (m.debt || 0) * 0.8 + Math.max(-(st.assets || 0) * 0.3, (st.profit || 0) * 700) + (st.rev || 0) * 120) / 2000;
  return Math.max(0.5, base * (0.75 + (st.rep || 50) / 200) * (1 + share * 0.6) * (1 + g * 0.8) * newsStockMult(id));
}
function newsStockMult(id) { let k = 1; S.p10.fx.forEach(function (f) { if (f.k === 'stock' && f.id === id && f.until > S.clock.runSec) k *= 1 + f.v * (f.until - S.clock.runSec) / 600; }); return k; }
function stockFactors(id) {
  const st = S.ai[id] || {}, m = corpMeta(id);
  return { rev: st.rev || 0, profit: st.profit || 0, growth: m.growth || 0, debt: m.debt || 0, rep: st.rep || 0, share: companyShare(id), fair: p10FairValue(id, st), price: stockOf(id).price };
}

/* ===================================== CITY NEWS ===================================== */
const NEWS_FX_KINDS = ['tour', 'growth', 'demand', 'traffic', 'pollution', 'production', 'jobs', 'rev'];
const NEWS_FX_NAMES = { tour: 'Tourism', growth: 'Population growth', demand: 'Consumer demand', traffic: 'Traffic', pollution: 'Pollution', production: 'Production', jobs: 'Jobs', rev: 'Revenue' };
/* A headline built from game data; fx = real temporary modifiers, stock = share price move, measure = record the
   city's jobs / traffic / pollution / production and report the actual change 60 s later */
function newsAdd(icon, title, text, o) {
  if (!S.p10 || BCT_SANDBOX.on) return null;
  o = o || {};
  const P = S.p10, last = P.news[0];
  if (last && last.title === title && last.d === gameDay()) return null;
  const n = { id: P.nextNews++, d: gameDay(), y: gameYear(), h: Math.floor(gameHour()), icon: String(icon).slice(0, 8), cat: o.cat || 'city', title: String(title).slice(0, 120), text: String(text || '').slice(0, 220), fx: (o.fx || []).filter(function (f) { return NEWS_FX_KINDS.indexOf(f.k) >= 0 && isFinite(f.v); }), stock: o.stock || null, measured: null, pre: o.measure ? cityMeasure() : null, at: S.clock.runSec };
  P.news.unshift(n); if (P.news.length > 60) P.news.length = 60;
  const dur = o.dur || 600;
  n.fx.forEach(function (f) { P.fx.push({ k: f.k, v: f.v, until: S.clock.runSec + dur, id: '', src: n.id }); });
  if (n.stock && S.ai[n.stock.id] && n.stock.pct) {
    const s = stockOf(n.stock.id); s.price = +clamp(s.price * (1 + n.stock.pct), 0.05, 1e6).toFixed(3);
    P.fx.push({ k: 'stock', v: n.stock.pct, until: S.clock.runSec + 600, id: n.stock.id, src: n.id });
  }
  if (P.fx.length > 30) P.fx.splice(0, P.fx.length - 30);
  if (o.notify !== false) notify('📰 ' + n.title, o.cls || '');
  return n;
}
function cityMeasure() { return { jobs: SIM.jobs || 0, traffic: SIM.traffic || 0, pollution: S.city.pollution, prod: SIM.goodsProd || 0, pop: S.city.population }; }
function newsTick() {
  const P = S.p10, pop = S.city.population, F = P.firsts;
  P.news.forEach(function (n) {
    if (!n.pre || n.measured || S.clock.runSec - n.at < 60) return;
    const now = cityMeasure(), pre = n.pre;
    n.measured = { jobs: Math.round(now.jobs - pre.jobs), traffic: +(now.traffic - pre.traffic).toFixed(1), pollution: +(now.pollution - pre.pollution).toFixed(1), prod: pre.prod > 0 ? +((now.prod / pre.prod - 1) * 100).toFixed(1) : 0 };
  });
  POP_MILESTONES.forEach(function (m) { if (pop >= m && !F['np' + m]) { F['np' + m] = 1; if (S.clock.runSec > 20) newsAdd('👥', 'City population reaches ' + fmt(m), 'Births ' + fmt(Math.round(P.pop.births)) + ', newcomers ' + fmt(Math.round(P.pop.migIn)) + ' since founding. The city is growing.', { cat: 'population', fx: [{ k: 'tour', v: 0.03 }], cls: 'gold' }); } });
  if (SIM.traffic > 55 && pop > 500 && gameDay() - (F.congDay || -9) >= 1) {
    F.congDay = gameDay();
    const regs = weRegionStats(false).slice().sort(function (a, b) { return b.traffic - a.traffic; });
    newsAdd('🚦', 'Traffic congestion reaches ' + Math.round(SIM.traffic) + '%', 'Worst in the ' + (regs[0] ? regs[0].name : 'central') + ' region (' + Math.round(regs[0] ? regs[0].traffic : 0) + '%). Commuters lose time; transit and wider roads would help.', { cat: 'traffic' });
  }
  const t = S.city.tourists;
  if (t > 300 && t > (F.tourRec || 0) * 1.25) { if (F.tourRec) newsAdd('🧳', 'Tourism record: ' + fmt(Math.round(t)) + ' visitors in the city', 'Tourist spending reaches ' + money(t * TOURIST_SPEND * 0.6) + '/s across hotels, restaurants and attractions.', { cat: 'tourism', fx: [{ k: 'tour', v: 0.05 }] }); F.tourRec = t; }
}
/* Buildings finishing construction can make headlines (called from p9OnBuilt via the hook) */
function p10OnBuilt(b) {
  if (!S.p10 || BCT_SANDBOX.on) return;
  const d = bdef(b), own = isAI(b) ? aiDef(b.owner) : null;
  if (!b.born) b.born = gameDay();
  if ((d.goods || d.extract) && (b.workers >= 40 || d.cost >= 50000)) {
    const share = clamp((d.goods || 1) / Math.max(1, SIM.goodsProd || 1), 0.02, 0.15);
    newsAdd('🏭', 'Major factory opens: ' + d.name + (own ? ' (' + own.name + ')' : ''), fmt(b.workers) + ' jobs in ' + (districtName(b.x, b.y) || 'the industrial zone') + '. Suppliers ramp up production; the real effect is measured after one minute.', { cat: 'industry', fx: [{ k: 'production', v: +share.toFixed(3) }], measure: true, dur: 300, stock: own ? { id: b.owner, pct: 0.03 } : null });
  } else if (d.sector === 'TECHNOLOGY' && (d.cost >= 30000) && own) {
    newsAdd('💻', own.name + ' expands: new ' + d.name, 'Tech jobs +' + b.workers + '. Research and high-skill employment grow in ' + (districtName(b.x, b.y) || 'the city') + '.', { cat: 'tech', stock: { id: b.owner, pct: 0.04 }, measure: true });
  } else if (d.landmark || ATTRACTIONS[d.id]) {
    newsAdd(d.icon, d.name + ' opens to the public', 'Tourism value ' + fmt(attractionValue(b)) + ' — visitors from the region are expected.', { cat: 'tourism', fx: [{ k: 'tour', v: 0.04 }] });
  }
  if (d.id === 'airportterminal') newsAdd('✈️', 'New airport terminal opens', 'Airport capacity rises to ' + fmt(airportCapacity()) + ' passengers/day (' + S.p10.air.terminals + ' terminal(s)).', { cat: 'transport', fx: [{ k: 'tour', v: 0.04 }] });
}

/* ===================================== CITY REPUTATION 0–1000 ===================================== */
const REP_WEIGHTS = { happiness: 0.18, safety: 0.12, economy: 0.16, tourism: 0.1, environment: 0.1, education: 0.1, healthcare: 0.12, infrastructure: 0.12 };
function reputationParts() {
  const c = S.city, pop = c.population;
  return {
    happiness: c.happiness, safety: 100 - c.crime,
    economy: clamp(50 + 40 * Math.tanh((SIM.net || 0) / (pop * 0.05 + 10)) + 10 * (1 - (SIM.unemployment || 0) * 4), 0, 100),
    tourism: Math.min(100, c.tourists / (pop + 50) * 400), environment: 100 - c.pollution, education: c.education,
    healthcare: svHealthIndex() * 100,
    infrastructure: clamp(40 * ((SIM.powerRatio || 0) + (SIM.waterRatio || 0)) / 2 + 30 * ((SIM.cov.fire || 0) + (SIM.cov.police || 0) + (SIM.cov.health || 0)) / 3 + 30 * (1 - (SIM.traffic || 0) / 100) - infraPenalty(), 0, 100)
  };
}
function reputationTick(dt) {
  const P = S.p10, parts = reputationParts();
  let t = 0; for (const k in REP_WEIGHTS) t += REP_WEIGHTS[k] * parts[k];
  const target = clamp(t * 10, 0, 1000);
  P.rep = clamp(lerp(P.rep, target, Math.min(1, 0.02 * dt)), 0, 1000); P.repParts = parts; P.repTarget = target;
  if (p10Every('repHist', 30, dt)) { P.repHist.push(Math.round(P.rep)); if (P.repHist.length > 120) P.repHist.shift(); }
}
function repLabel(r) { return r >= 850 ? 'World-class' : r >= 700 ? 'Excellent' : r >= 550 ? 'Good' : r >= 400 ? 'Average' : r >= 250 ? 'Poor' : 'Terrible'; }

/* ===================================== WORLD CITY RANKING & REGIONAL COMPETITION ===================================== */
const WRANK_CATS = [['economy', '💰', 'Best Economy'], ['tourism', '🧳', 'Tourism'], ['education', '🎓', 'Education'], ['healthcare', '🏥', 'Healthcare'], ['green', '🌿', 'Green City'], ['transport', '🚇', 'Transport'], ['life', '😊', 'Quality of Life']];
const NB_PROFILE = { metro: { education: 72, healthcare: 74, green: 38, transport: 82, life: 62 }, river: { education: 55, healthcare: 58, green: 70, transport: 55, life: 66 }, industrial: { education: 50, healthcare: 55, green: 25, transport: 60, life: 48 }, coastal: { education: 58, healthcare: 62, green: 62, transport: 58, life: 72 }, tech: { education: 86, healthcare: 70, green: 55, transport: 70, life: 68 }, oldtown: { education: 60, healthcare: 57, green: 66, transport: 48, life: 70 } };
function cityGDP() {           // annualised output: all business revenue + wages
  let rev = 0; const O = SIM.owners || {}; for (const k in O) rev += O[k].rev || 0;
  return (rev + (SIM.employed || 0) * WAGE_PER_WORKER) * YEAR_GAME_SEC / TIME_SCALE;
}
function myRankScores() {
  const c = S.city, pop = Math.max(1, c.population);
  return {
    economy: clamp(Math.log10(1 + cityGDP() / pop) * 18, 0, 100), tourism: clamp(c.tourists / (pop + 50) * 150 + Math.log10(1 + c.tourists) * 4, 0, 100), education: c.education,
    healthcare: svHealthIndex() * 100, green: clamp(100 - c.pollution * 1.2 + Math.min(15, greenCount() / pop * 3000), 0, 100),
    transport: clamp((SIM.riders || 0) / Math.max(1, SIM.trips || 1) * 60 + (100 - (SIM.traffic || 0)) * 0.4, 0, 100), life: clamp(c.happiness * 0.7 + (100 - c.crime) * 0.3, 0, 100)
  };
}
function greenCount() { let n = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.hap > 0 || d.pol < 0) n++; }); return n; }
function rankTable() {
  const rows = [{ id: 'me', name: S.city.name, icon: '🏙️', me: true, s: myRankScores() }];
  if (S.p9) S.p9.neighbors.forEach(function (n) {
    const d = neighborDef(n.id); if (!d) return;
    const pr = NB_PROFILE[n.id] || { education: 55, healthcare: 55, green: 50, transport: 55, life: 60 }, gpc = n.gdp / Math.max(1, n.pop);
    const growth = n.pop / d.pop;
    rows.push({ id: n.id, name: d.name, icon: d.icon, s: { economy: clamp(Math.log10(1 + gpc * 120) * 18, 0, 100), tourism: clamp(d.tour * 45 + (n.tourists || 0) / 200, 0, 100), education: clamp(pr.education * (0.9 + growth * 0.1), 0, 100), healthcare: clamp(pr.healthcare * (0.9 + growth * 0.1), 0, 100), green: pr.green, transport: pr.transport, life: clamp(pr.life * (0.8 + n.rel / 250), 0, 100) } });
  });
  return rows;
}
function rankingsNow() {
  const rows = rankTable(), out = {};
  WRANK_CATS.forEach(function (c) { const sorted = rows.slice().sort(function (a, b) { return b.s[c[0]] - a.s[c[0]]; }); out[c[0]] = { rank: sorted.findIndex(function (r) { return r.me; }) + 1, of: rows.length, score: Math.round(rows[0].s[c[0]]), leader: sorted[0].name }; });
  return out;
}
function rankingTick() {
  const P = S.p10, y = gameYear();
  if (!P.rank.year) { P.rank.year = y; return; }
  if (y === P.rank.year) return;
  P.rank.year = y;
  populationYearRoll();
  const r = rankingsNow();
  P.rank.hist.push({ year: y - 1, ranks: r }); if (P.rank.hist.length > 30) P.rank.hist.shift();
  const best = WRANK_CATS.filter(function (c) { return r[c[0]].rank === 1; }).map(function (c) { return c[2]; });
  newsAdd('🏆', 'World City Ranking ' + (calendarYear() - 1) + ': ' + (best.length ? '#1 in ' + best.join(', ') : 'best place #' + Math.min.apply(null, WRANK_CATS.map(function (c) { return r[c[0]].rank; }))), WRANK_CATS.map(function (c) { return c[2] + ' #' + r[c[0]].rank; }).join(' · '), { cat: 'ranking', fx: best.length ? [{ k: 'tour', v: 0.02 * best.length }] : [], dur: 1200, cls: 'gold' });
  timelineAdd('🏆', 'World City Ranking: ' + WRANK_CATS.map(function (c) { return c[1] + '#' + r[c[0]].rank; }).join(' '), 'ranking');
}
const REGION_METRICS = [['gdp', '💰', 'GDP'], ['pop', '👥', 'Population'], ['happiness', '😊', 'Happiness'], ['tourism', '🧳', 'Tourism'], ['education', '🎓', 'Education'], ['safety', '🛡️', 'Safety'], ['environment', '🌿', 'Environment']];
function regionCompetition() {
  const regs = weRegionStats(false).map(function (r) { return { id: r.id, name: r.name, icon: r.icon, pop: r.pop, gdp: (r.trade + r.prod * GOODS_PRICE) * YEAR_GAME_SEC / TIME_SCALE + r.jobs * WAGE_PER_WORKER * YEAR_GAME_SEC / TIME_SCALE, happiness: r.happiness, tourism: r.tour, education: r.education, safety: 0, environment: r.polN ? 100 - r.pol / r.polN * 100 : 100 - S.city.pollution, polB: 0, nB: 0 }; });
  S.buildings.list.forEach(function (b) { if (!b._cov) return; const r = regs[WE.region[chunkOfTile(b.x, b.y)]]; if (!r) return; r.nB++; if (b._cov.police) r.polB++; });
  regs.forEach(function (r) { r.safety = r.nB ? clamp(r.polB / r.nB * 100 - S.city.crime * 0.3, 0, 100) : 0; });
  const leaders = {};
  REGION_METRICS.forEach(function (m) { const s = regs.filter(function (r) { return r.pop > 0 || m[0] === 'tourism'; }).sort(function (a, b) { return b[m[0]] - a[m[0]]; }); leaders[m[0]] = s[0] ? s[0].name : '—'; });
  return { regions: regs, leaders: leaders };
}

/* ===================================== DYNAMIC LAND DEVELOPMENT ===================================== */
const DEV_STAGES = ['Empty land', 'Small', 'Medium', 'High-rise', 'Megaproject'];
const DEV_STAGE_OF = { house: 1, shop: 1, foodstand: 1, nightclub: 1, office: 2, apartment: 2, supermarket: 2, restaurant: 2, cinema: 2, condo: 3, mall: 3, foodcourt: 3, skyscraper: 3, luxurytower: 3, techcampus: 3, megamall: 4, arcology: 4 };
function devStage(b) { return DEV_STAGE_OF[b.type] || (bdef(b).megaproject ? 4 : 0); }
function landDevStats() {
  const out = [0, 0, 0, 0, 0];
  for (let z = 1; z <= 3; z++) out[0] += freeZoneTiles(z).length;
  S.buildings.list.forEach(function (b) { const s = devStage(b); if (s) out[s]++; });
  return out;
}
/* Empty land → small → medium → high-rise → megaproject: valuable, in-demand plots are redeveloped by their owners */
function landDevTick() {
  if (!S.p10.auto.development || !S.p9 || !propReady()) return;
  const L = S.buildings.list.filter(function (b) { return b.built && !b.upg && EVOLVE[b.type] && (isAI(b) || b.owner === 'city' || (b.owner === 'player' && S.settings.autoEvolve)); });
  if (!L.length) return;
  const sample = []; for (let k = 0; k < Math.min(12, L.length); k++) sample.push(L[Math.floor(Math.random() * L.length)]);
  sample.sort(function (a, b) { return landValueTile(b.x, b.y) - landValueTile(a.x, a.y); });
  const b = sample[0], sec = bdef(b).sector, lv = landRel(b.x, b.y);
  const ratio = sec === 'HOUSING' ? (SIM.housingDemandRatio || 0) : (SIM.demand[sec] || 0) / Math.max(1, SIM.supply[sec] || 0);
  if (lv < 1.1 || ratio < 1.05) return;                     // only above-average land is worth redeveloping
  const from = bdef(b).name;
  if (evolveBuilding(b, true)) { S.p10.landDev.evolved++; S.p10.landDev.last = from + ' → ' + (EVOLVE[b.type] ? BUILDINGS[EVOLVE[b.type]].name : ''); lwLog('🏗️', 'Redevelopment: ' + S.p10.landDev.last + ' (land value ' + Math.round(lv * 100) + '% of city average)'); }
}

/* ===================================== SMART AUTOMATION ===================================== */
const AUTO_DEFS = [
  ['traffic', '🚦', 'AUTO TRAFFIC', 'Traffic Light AI, clears stuck vehicles and widens the most congested roads (paid from the city budget).'],
  ['transit', '🚌', 'AUTO PUBLIC TRANSPORT', 'Creates transit lines between unused stops and adds vehicles to crowded lines.'],
  ['build', '🏗️', 'AUTO BUILD', 'Builds missing fire, police, health and school coverage.'],
  ['repair', '🛠️', 'AUTO REPAIR', 'Repairs buildings and aging infrastructure in poor condition.'],
  ['economy', '💹', 'AUTO ECONOMY', 'Keeps the city budget positive by adjusting the tax rate within 6–16%.'],
  ['zoning', '🟩', 'AUTO ZONING', 'Zones residential, commercial or industrial land next to roads when demand is high.'],
  ['emergency', '🚑', 'AUTO EMERGENCY', 'Dispatches emergency vehicles to incidents automatically.'],
  ['utility', '⚡', 'AUTO UTILITY BALANCE', 'Adds power, water, substations, pumps and sewage capacity before shortages.'],
  ['development', '🏙️', 'AUTO DEVELOPMENT', 'Owners redevelop valuable land (small → medium → high-rise); developers build in zones.']
];
function autoPay(cost, what) {
  if (cost <= 0) return true;
  if (S.budget < cost) { if (!S.p10.autoStats['warn_' + what] || S.clock.runSec - S.p10.autoStats['warn_' + what] > 300) { S.p10.autoStats['warn_' + what] = S.clock.runSec; notify('🤖 ' + what + ' paused: city budget ' + money(S.budget) + ' < ' + money(cost), 'bad'); } return false; }
  S.budget -= cost; S.p10.autoStats.spent += cost; return true;
}
function automationTick() {
  const A = S.p10.auto, st = S.p10.autoStats;
  try {
    if (A.traffic && S.p9 && SIM.traffic > 40) { const r = autoTraffic(); if (r) { st.traffic++; lwLog('🚦', 'AUTO TRAFFIC: ' + r); } }
    if (A.transit && S.p9) { const r = autoTransit(); if (r) { st.transit++; lwLog('🚌', 'AUTO TRANSIT: ' + r); } }
    if (A.build) { const r = autoBuild(); if (r) { st.build++; lwLog('🏗️', 'AUTO BUILD: ' + r); } }
    if (A.repair) { const r = autoRepair(); if (r) { st.repair++; lwLog('🛠️', 'AUTO REPAIR: ' + r); } }
    if (A.economy) { const r = autoEconomy(); if (r) { st.economy++; lwLog('💹', 'AUTO ECONOMY: ' + r); } }
    if (A.zoning) { const r = autoZoning(); if (r) { st.zoning++; lwLog('🟩', 'AUTO ZONING: ' + r); } }
    if (A.utility && S.p9) { const r = autoUtility(); if (r) { st.utility++; lwLog('⚡', 'AUTO UTILITY: ' + r); } }
  } catch (e) { if (typeof logError === 'function') logError('Automation', e); }
}
function autoTraffic() {
  S.p9.traffic.lightAI = true;
  let stuck = 0; for (let i = AG.vehicles.length - 1; i >= 0; i--) if (AG.vehicles[i].stopped > 8 && !AG.vehicles[i].line) { removeVehicle(i, false); stuck++; }
  const cells = districtCells().filter(function (c) { return c.roads.length >= 4 && c.avgCong > 0.45; }).sort(function (a, b) { return b.avgCong - a.avgCong; }).slice(0, 1);
  let up = 0; const per = 400 * costMult();
  cells.forEach(function (c) { c.roads.forEach(function (t) { if (MAP.cong && MAP.cong[t] > 0.55 && MAP.roads[t] < 3 && MAP.nature[t] !== 2 && autoPay(per, 'AUTO TRAFFIC')) { MAP.roads[t]++; up++; } }); });
  if (up) { onMapChanged(); MAP.pathCache.clear(); }
  return up || stuck ? up + ' road tile(s) widened, ' + stuck + ' stuck vehicle(s) cleared' : '';
}
function autoTransit() {
  const lines = S.p9.transit.lines;
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k], M = TRANSIT_MODES[L.mode], st = p9TransitLineStats().find(function (x) { return x.id === L.id; });
    const load = st && st.vehicles ? st.aboard / (st.vehicles * M.cap) : 0;
    if (load > 0.8 && L.vehicles < 8 && autoPay(20000 * costMult(), 'AUTO TRANSIT')) { L.vehicles++; return 'added a ' + M.name.toLowerCase() + ' to ' + L.name + ' (load ' + Math.round(load * 100) + '%)'; }
  }
  const modes = ['bus', 'tram', 'metro', 'train', 'ferry'];
  for (let k = 0; k < modes.length; k++) {
    const m = modes[k], used = new Set(); lines.forEach(function (L) { if (L.mode === m) L.stops.forEach(function (s) { used.add(s); }); });
    const free = transitStops(m).filter(function (b) { return !used.has(b.id) && b._op; });
    if (free.length >= 2 && lines.length < 16 && autoPay(15000 * costMult(), 'AUTO TRANSIT')) { const L = createTransitLine(m, free.slice(0, TRANSIT_MODES[m].maxStops).map(function (b) { return b.id; })); if (L) return 'opened ' + L.name + ' (' + L.stops.length + ' stops)'; }
  }
  return '';
}
function autoBuild() {
  const before = S.buildings.list.length, money0 = S.budget; let est = 0;
  ['fire', 'police', 'health'].forEach(function (s) { if ((SIM.cov[s] || 0) < 0.85) est += 20000; });
  if (S.city.population > 200 && wgHomesWithoutSchool().length > 3) est += 8000;
  if (!est || S.budget < est * costMult() * 1.5) return '';
  ['fire', 'police', 'health'].forEach(function (s) { if ((SIM.cov[s] || 0) < 0.85) wgFixCoverage(s); });
  if (S.city.population > 200) wgFixSchools();
  const added = S.buildings.list.slice(before);
  if (!added.length) return '';
  let cost = 0; added.forEach(function (b) { cost += buildCost(bdef(b)); b.built = false; b.progress = 0; b.buildTime = buildTimeFor(bdef(b).cost); });
  S.budget = Math.max(0, money0 - cost); S.p10.autoStats.spent += cost; onMapChanged();
  return added.map(function (b) { return bdef(b).name; }).join(', ') + ' (' + money(cost) + ')';
}
function autoRepair() {
  let n = 0, cost = 0;
  S.buildings.list.forEach(function (b) {
    if (n >= 12 || !b.built || b.cond === undefined || b.cond >= 50) return;
    const c = buildCost(bdef(b)) * 0.05 * (100 - b.cond) / 100;
    if (!autoPay(c, 'AUTO REPAIR')) return;
    b.cond = 100; n++; cost += c;
  });
  const fixed = infraRepairAuto();
  return n || fixed ? n + ' building(s) and ' + fixed + ' infrastructure asset(s) repaired (' + money(cost) + ')' : '';
}
function autoEconomy() {
  const c = S.city, before = c.tax;
  if ((SIM.bNet || 0) < 0 && c.tax < 16) c.tax++;
  else if ((SIM.bNet || 0) > (SIM.bExp || 0) * 0.5 && c.happiness < 65 && c.tax > 6) c.tax--;
  return c.tax !== before ? 'tax ' + before + '% → ' + c.tax + '% (budget ' + money(SIM.bNet || 0) + '/s)' : '';
}
function autoZoning() {
  let z = 0;
  if ((SIM.housingDemandRatio || 0) > 1.1) z = 1;
  else if (['FOOD', 'SHOPPING'].some(function (s) { return (SIM.demand[s] || 0) > (SIM.supply[s] || 0) * 1.15; })) z = 2;
  else if (SIM.unemployment > 0.1) z = 3;
  if (!z) return '';
  const tiles = [];
  for (let i = 0; i < MAP.roads.length && tiles.length < 12; i++) {
    const x = i % MAP.W, y = (i / MAP.W) | 0;
    if (MAP.roads[i] || MAP.occ[i] || MAP.zone[i] || MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.ROCK || !inUnlocked(x, y)) continue;
    if (!(isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1))) continue;
    tiles.push([x, y]);
  }
  if (!tiles.length || !autoPay(tiles.length * 20 * costMult(), 'AUTO ZONING')) return '';
  tiles.forEach(function (t) { const i = idx(t[0], t[1]); if (MAP.nature[i] === 1) MAP.nature[i] = 0; MAP.zone[i] = z; });
  MAP.groundDirty = true; requestMapChanged();
  return tiles.length + ' tile(s) zoned ' + ['', 'residential', 'commercial', 'industrial'][z];
}
function autoUtility() {
  const out = []; let cost = 0;
  const before = S.buildings.list.length;
  if (SIM.powerGen < SIM.powerUse * 1.1) { wgAddPower(null, SIM.powerUse * 1.2 - SIM.powerGen); out.push('power'); }
  if (SIM.waterGen < SIM.waterUse * 1.1) { wgAddWater(null, SIM.waterUse * 1.2 - SIM.waterGen); out.push('water'); }
  // substations / sewage / pumps — at most a few per cycle; pumps pause for 10 min when they stop helping
  const st = S.p10.autoStats, subs = gridAutoSubstations(true); if (subs) out.push(subs + ' substation(s)');
  sewagePass(); if (SEWER.overload > 0.04 && (placeUtilityNear('sewageplant', MAP.W / 2, MAP.H / 2, true) || wgPlaceAnywhere(null, 'sewageplant', { owner: 'city' }))) { out.push('sewage plant'); onMapChanged(); }
  if ((st.pumpPause || 0) < S.clock.runSec) {
    waterNetPass(true); const low0 = WNET.low || 0;
    if (low0 > 0.08) { const n = placePumpsForPressure(true, 2); if (n) { out.push(n + ' pump(s)'); waterNetPass(true); if ((WNET.low || 0) > low0 - 0.01) st.pumpPause = S.clock.runSec + 600; } else st.pumpPause = S.clock.runSec + 600; }
  }
  const added = S.buildings.list.slice(before);
  added.forEach(function (b) { cost += buildCost(bdef(b)); });
  if (added.length) { onMapChanged(); const short = cost - S.budget; S.budget = Math.max(0, S.budget - cost); S.p10.autoStats.spent += cost; if (short > 0) notify('🤖 AUTO UTILITY overspent the city budget by ' + money(short), 'bad'); }
  return added.length ? out.join(', ') + ' — ' + added.length + ' building(s), ' + money(cost) : '';
}

/* A new, loaded or generated world: Part 10 caches start fresh (called from p9MapReset) */
function p10MapReset() {
  P10.acc = {}; P10.life = null; P10.pickMega = null; P10.factory = null;
  SV.at = -99; SV.edu = SV.health = SV.tour = SV.air = SV.port = SV.rail = SV.logi = SV.research = null;
  LAB.whatif = null; LAB.last = null; LAB.mods = null;
}
/* After a bankruptcy the stores are taken over by a newly born company (NOVA MARKET joins the founder names) */
if (COMPANY_REFOUND_NAMES.SHOPPING.indexOf('NOVA MARKET') < 0) COMPANY_REFOUND_NAMES.SHOPPING.push('NOVA MARKET');
