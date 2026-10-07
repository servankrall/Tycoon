'use strict';
/* BLOCK CITY TYCOON — PROJECTS, INFRASTRUCTURE & SIMULATION LAB (Part 10)
   Megaprojects (money, time, workers, materials, milestones 0/25/50/75/100 % with visual stages, Project Manager),
   maintenance budgets per network, infrastructure aging (repair / upgrade / replace), random incidents with the
   Incident Center (emergency vehicles, response times), citizen opinions & petitions, long-term city goals, dynamic
   objectives, City AI Assistant (problem → cause → options with costs → expected result from the engine), live graphs,
   Time Machine (year 1/5/10/25/50/100 snapshots), Simulation Lab & What-If mode (the real economy engine runs on a
   copy of the world — nothing changes until APPLY), World Factory, World Presets 2.0, GENERATE MEGA WORLD (22-step
   pipeline) and the World Generation Score. */

/* ===================================== STATE ===================================== */
function pjNew() {
  return {
    projects: [], nextProj: 1, projStats: { done: 0, spent: 0 },
    maint: { roads: 1, buildings: 1, power: 1, water: 1, rail: 1 },
    infra: {}, infraInit: false, infraStats: { failures: 0, repairs: 0, upgrades: 0, replaced: 0 },
    incidents: { active: [], resolved: [], next: 1, stats: { total: 0, respSum: 0, respN: 0 } },
    petitions: [], nextPet: 1, petStats: { accepted: 0, ignored: 0 },
    goalsDone: {}, objectives: [], nextObj: 1, objStats: { done: 0, failed: 0 },
    graphs: { t: [] }, gdpPeak: 0,
    tm: {}, genScore: null, factory: null
  };
}
function pjValidate(p) {
  p.projects = p10Items(p.projects, 12, { id: 0, type: '', x: 0, y: 0, bid: 0, cost: 0, spent: 0, need: 0, crew: 0, mats: {}, progress: 0, stage: 0, status: 'active', started: 0, rate: 0, paused: false, payer: 'city' }, function (q) { return !!MEGA_DEFS[q.type]; });
  p.projects.forEach(function (q) { q.progress = clamp(q.progress, 0, 1); q.stage = clamp(q.stage | 0, 0, 4); for (const k in q.mats) { const m = q.mats[k]; if (!m || typeof m !== 'object') delete q.mats[k]; else { m.need = clamp(+m.need || 0, 0, 1e9); m.used = clamp(+m.used || 0, 0, 1e9); } } });
  ['roads', 'buildings', 'power', 'water', 'rail'].forEach(function (k) { p.maint[k] = clamp(+p.maint[k], 0, 2); if (!isFinite(p.maint[k])) p.maint[k] = 1; });
  for (const k in p.infra) { const a = p.infra[k]; if (!/^[rb]\d{1,6}$/.test(k) || !a || typeof a !== 'object') { delete p.infra[k]; continue; } p.infra[k] = p10Merge({ k: 'road', born: 1, cond: 100, grade: 0, n: 0, name: '', tile: 0 }, a); p.infra[k].cond = clamp(p.infra[k].cond, 0, 100); }
  const I = p.incidents;
  I.active = p10Items(I.active, 12, incShape(), function (x) { return !!INC_DEFS[x.type]; });
  I.resolved = p10Items(I.resolved, 30, incShape(), function (x) { return !!INC_DEFS[x.type]; });
  p.petitions = p10Items(p.petitions, 12, { id: 0, type: '', title: '', why: '', sig: 0, created: 0, deadline: 0, status: 'open', cost: 0 }, function (x) { return !!PETITION_DEFS[x.type]; });
  p.objectives = p10Items(p.objectives, 8, { id: 0, kind: '', title: '', target: 0, start: 0, region: '', deadline: 0, reward: 0, status: 'active', best: 0 }, function (x) { return !!OBJ_DEFS[x.kind]; });
  const G = {}; G.t = (Array.isArray(p.graphs.t) ? p.graphs.t : []).filter(function (v) { return typeof v === 'number'; }).slice(-240);
  GRAPH_DEFS.forEach(function (g) { const a = p.graphs[g[0]]; G[g[0]] = (Array.isArray(a) ? a : []).filter(function (v) { return typeof v === 'number'; }).slice(-240); });
  p.graphs = G;
  for (const k in p.tm) { if (TM_YEARS.indexOf(+k) < 0 || !p.tm[k] || typeof p.tm[k] !== 'object') { delete p.tm[k]; continue; } p.tm[k] = p10Merge({ id: '', pop: 0, money: 0, gdp: 0, rep: 0, happy: 0, day: 1, created: 0 }, p.tm[k]); if (!/^snapshot_\d{3}$/.test(p.tm[k].id)) delete p.tm[k]; }
}
function incShape() { return { id: 0, type: '', name: '', icon: '', tile: -1, bid: 0, ref: '', start: 0, district: '', status: 'waiting', unit: '', resp: 0, work: 0, until: 0, ended: 0, cause: '' }; }

/* ===================================== MEGAPROJECTS ===================================== */
[
  { id: 'megaairport', name: 'Mega Airport', icon: '🛬', cat: 'Transport', sector: 'TRANSPORT', w: 7, h: 5, cost: 60000000, color: '#ced4da', roof: '#495057', height: 34, transit: 8000, tour: 9000, workers: 900, maxW: 1800, power: -300, water: -150, pol: 18, maint: 2500, unique: true, megaproject: true, hidden: true, bonus: { tour: 0.3, growth: 0.15 }, desc: 'Megaproject: a global aviation hub (80,000 passengers/day).' },
  { id: 'centralrail', name: 'Central Railway Hub', icon: '🚄', cat: 'Transport', sector: 'TRANSPORT', w: 4, h: 3, cost: 25000000, color: '#bc6c25', roof: '#283618', height: 42, transit: 12000, freight: 12000, workers: 400, maxW: 800, power: -120, maint: 900, unique: true, megaproject: true, hidden: true, desc: 'Megaproject: high-speed rail & 12,000 t/day freight.' },
  { id: 'arcologyprime', name: 'Arcology Prime', icon: '🏙️', cat: 'Residential', sector: 'HOUSING', w: 4, h: 4, cost: 40000000, color: '#2a9d8f', roof: '#1d3557', height: 300, housing: 25000, quality: 95, rent: 0.12, unitSize: 4, workers: 600, maxW: 1200, power: -400, water: -300, hap: 3, unique: true, megaproject: true, hidden: true, desc: 'Megaproject: a vertical city for 25,000 residents.' },
  { id: 'superstadium', name: 'Super Stadium', icon: '🏟️', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 5, h: 5, cost: 30000000, color: '#2b9348', roof: '#80b918', height: 60, tour: 12000, rev: 1200, cap: 60000, workers: 500, maxW: 1000, power: -150, water: -60, hap: 4, unique: true, megaproject: true, hidden: true, bonus: { tour: 0.25, event: 0.5 }, desc: 'Megaproject: 120,000 seats, world events.' },
  { id: 'financialtower', name: 'Financial Tower', icon: '🏦', cat: 'Commercial', sector: 'FINANCE', w: 3, h: 3, cost: 45000000, color: '#118ab2', roof: '#073b4c', height: 340, rev: 4000, cap: 90000, workers: 1500, maxW: 3000, power: -200, water: -40, unique: true, megaproject: true, hidden: true, bonus: { rev: 0.08 }, desc: 'Megaproject: the financial district\'s crown (all revenue +8%).' },
  { id: 'megaport', name: 'Mega Port', icon: '⚓', cat: 'Transport', sector: 'TRANSPORT', w: 6, h: 4, cost: 50000000, color: '#adb5bd', roof: '#023e8a', height: 30, trade: 800, transit: 2000, tour: 2000, workers: 1200, maxW: 2400, power: -200, pol: 10, maint: 2000, unique: true, megaproject: true, hidden: true, needsSea: true, desc: 'Megaproject: 8,000 TEU/day deep-water port. Must touch the sea.' },
  { id: 'megatech', name: 'Mega Tech Campus', icon: '🧬', cat: 'Commercial', sector: 'TECHNOLOGY', w: 4, h: 4, cost: 20000000, color: '#9b5de5', roof: '#3a0ca3', height: 80, rev: 3000, cap: 70000, rp: 12, edu: 1000, eduHigh: true, eduLvl: 5, workers: 2000, maxW: 4000, power: -250, water: -60, unique: true, megaproject: true, hidden: true, desc: 'Megaproject: research, startups and 1,000 PhD seats.' },
  { id: 'grandpark', name: 'Grand Park', icon: '🌳', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 5, h: 5, cost: 8000000, color: '#52b788', roof: '#2d6a4f', height: 8, tour: 3000, hap: 15, pol: -40, workers: 80, maxW: 160, water: -20, maint: 60, unique: true, megaproject: true, hidden: true, noRoad: false, desc: 'Megaproject: the city\'s central park (happiness, clean air, tourism).' }
].forEach(registerBuilding);
BUILDINGS.spacecenter.megaproject = true;
const MEGA_DEFS = {
  megaairport: { days: 6, workers: 2500, mats: { steel: 4000, concrete: 9000, glass: 2500 }, pop: 50000 },
  centralrail: { days: 4, workers: 1500, mats: { steel: 5000, concrete: 4000, glass: 800 }, pop: 25000 },
  arcologyprime: { days: 5, workers: 2000, mats: { steel: 6000, concrete: 8000, glass: 4000 }, pop: 40000 },
  superstadium: { days: 4, workers: 1800, mats: { steel: 3500, concrete: 7000, glass: 1500 }, pop: 30000 },
  financialtower: { days: 5, workers: 1600, mats: { steel: 5500, concrete: 5000, glass: 5000 }, pop: 35000 },
  spacecenter: { days: 7, workers: 3000, mats: { steel: 7000, concrete: 6000, glass: 2000 }, pop: 100000 },
  megaport: { days: 5, workers: 2200, mats: { steel: 5000, concrete: 10000, glass: 500 }, pop: 40000 },
  megatech: { days: 4, workers: 1400, mats: { steel: 2500, concrete: 3500, glass: 3500 }, pop: 30000 },
  grandpark: { days: 3, workers: 600, mats: { steel: 200, concrete: 1500, glass: 100 }, pop: 10000 }
};
const MEGA_MILESTONES = [['Planning', 0], ['Foundation', 25], ['Structure', 50], ['Exterior', 75], ['Complete', 100]];
const MAT_SOURCE = { steel: ['metal', 1], concrete: ['materials', 1], glass: ['materials', 1.6] };
function megaUnlocked(type) {
  const M = MEGA_DEFS[type], d = BUILDINGS[type];
  if (S.p8 && S.p8.unlockAll) return { ok: true };
  if (S.buildings.list.some(function (b) { return b.type === type; })) return { ok: false, reason: 'Already built (unique)' };
  if (type === 'spacecenter' && cityLevel() < 20 && S.city.peakPop < M.pop) return { ok: false, reason: 'City level 20 or ' + fmt(M.pop) + ' citizens' };
  if (type !== 'spacecenter' && S.city.peakPop < M.pop) return { ok: false, reason: 'Needs ' + fmt(M.pop) + ' citizens' };
  if (d.needsSea && !(MAP.sea && MAP.sea.some(function (v) { return v; }))) return { ok: false, reason: 'Coastal cities only' };
  return { ok: true };
}
function megaCost(type) { return buildCost(BUILDINGS[type]); }
/* A city project may rezone its site and buy out small private buildings (houses, shops, offices up to 2×2) */
function siteCheck(d, x, y, allowClear) {
  if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) return null;
  const clear = new Set();
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (!inUnlocked(xx, yy) || MAP.nature[i] === 2 || MAP.roads[i] || (MAP.terrain[i] === TERRAIN.ROCK && !d.extract)) return null;
    if (MAP.occ[i]) {
      if (!allowClear) return null;
      const b = MAP.byId.get(MAP.occ[i]); if (!b) return null;
      const bd = bdef(b); if (bd.public || b.owner === 'city' || bd.w * bd.h > 4 || bd.megaproject || bd.landmark || !b.built) return null;
      clear.add(b);
    }
  }
  if (d.needsWater && !adjacentWater(d, x, y, false)) return null;
  if (d.needsSea && !adjacentWater(d, x, y, true)) return null;
  if (!hasRoadNext(d, x, y) && !d.noRoad) return null;
  return { x: x, y: y, clear: Array.from(clear) };
}
function siteClearCost(site) { return site.clear.reduce(function (a, b) { return a + buildingValue(b) * 1.2; }, 0); }
/* Rezones the site and buys out the listed buildings (owners are compensated) */
function prepareSite(d, site, payer) {
  let comp = 0;
  site.clear.forEach(function (b) {
    const v = buildingValue(b) * 1.2; comp += v;
    if (isAI(b) && S.ai[b.owner]) S.ai[b.owner].cash += v; else if (b.owner === 'player') S.money = Math.min(MONEY_CAP, S.money + v);
    removeBuilding(b);
  });
  if (comp && payer !== 'none') { if (payer === 'player') S.money = Math.max(0, S.money - comp); else S.budget = Math.max(0, S.budget - comp); }
  for (let yy = site.y; yy < site.y + d.h; yy++) for (let xx = site.x; xx < site.x + d.w; xx++) { const i = idx(xx, yy); MAP.zone[i] = 0; if (MAP.nature[i] === 1) MAP.nature[i] = 0; }
  if (site.clear.length) onMapChanged();
  MAP.groundDirty = true;
  return comp;
}
function findMegaSite(type) {
  const d = BUILDINGS[type], r = unlockedRect(); let best = null, bs = -1e9;
  const step = MAP.W >= 96 ? 2 : 1;
  for (let pass = 0; pass < 2 && !best; pass++) {
    for (let y = r.y0; y <= r.y1 - d.h + 1; y += step) for (let x = r.x0; x <= r.x1 - d.w + 1; x += step) {
      const st = siteCheck(d, x, y, pass === 1); if (!st) continue;
      const sc = landRel(x, y) - Math.hypot(x - MAP.W / 2, y - MAP.H / 2) / MAP.W * 0.6 - st.clear.length * 0.15;
      if (sc > bs) { bs = sc; best = st; }
    }
  }
  return best;
}
function startMegaProject(type, site, opts) {
  opts = opts || {};
  const d = BUILDINGS[type], M = MEGA_DEFS[type]; if (!d || !M) return { ok: false, reason: 'Unknown project' };
  const u = megaUnlocked(type); if (!u.ok && !opts.admin) return u;
  if (S.p10.projects.some(function (q) { return q.type === type; })) return { ok: false, reason: 'Already under construction' };
  site = site ? siteCheck(d, site.x, site.y, true) : findMegaSite(type);
  if (!site) return { ok: false, reason: 'No road-connected ' + d.w + '×' + d.h + ' site (only empty land or small private buildings can be used)' + (d.needsSea ? ' touching the sea' : '') };
  const comp = prepareSite(d, site, opts.payer || 'city');
  const b = makeBuilding(type, site.x, site.y); b.owner = 'city'; b.built = false; b.progress = 0; b.buildTime = 1e9;
  const P = S.p10, id = P.nextProj++;
  b.mega = id;
  addBuildingToMap(b); onMapChanged();
  const mats = {}; for (const k in M.mats) mats[k] = { need: M.mats[k], used: 0 };
  const q = { id: id, type: type, x: site.x, y: site.y, bid: b.id, cost: megaCost(type), spent: 0, need: M.workers, crew: 0, mats: mats, progress: 0, stage: 0, status: 'active', started: S.clock.runSec, rate: 0, paused: false, payer: opts.payer || 'city' };
  P.projects.push(q);
  newsAdd(d.icon, 'Megaproject launched: ' + d.name, (comp ? site.clear.length + ' building(s) bought out for ' + money(comp) + '. ' : '') + 'Budget ' + money(q.cost) + ', ' + fmt(M.workers) + ' workers, ' + Object.keys(M.mats).map(function (k) { return fmt(M.mats[k]) + ' ' + k; }).join(' / ') + ', about ' + M.days + ' days.', { cat: 'project' });
  timelineAdd(d.icon, 'Megaproject started: ' + d.name, 'project');
  if (opts.instant) finishMegaProject(q);
  return { ok: true, q: q };
}
function p10ProjectJobs() { let n = 0; if (S.p10) S.p10.projects.forEach(function (q) { if (q.status !== 'complete') n += q.crew || 0; }); return n; }
function projectsTick(dt, frozen) {
  const P = S.p10;
  P.projects.slice().forEach(function (q) {
    const b = MAP.byId.get(q.bid);
    if (!b) { P.projects = P.projects.filter(function (x) { return x !== q; }); return; }
    if (q.status === 'complete') return;
    if (q.paused || frozen || BCT_SANDBOX.on) { q.status = q.paused ? 'paused' : q.status; q.crew = 0; q.rate = 0; return; }
    const M = MEGA_DEFS[q.type], rate0 = 1 / (M.days * 86400 / TIME_SCALE);
    const idle = Math.max(0, (SIM.labor || 0) - (SIM.employed || 0)) + (SIM.p9InCommuters || 0) * 0.2 + q.need * 0.15;
    const crewF = clamp(idle / q.need, 0.1, 1);
    q.crew = Math.round(q.need * crewF);
    let dp = rate0 * crewF * (1 + 0.04 * researchLevel('engineering')) * (S.p5 && S.p5.admin.instant ? 50 : 1) * dt;
    dp = Math.min(dp, 1 - q.progress);
    // materials: city stock first, then bought on the market (prices follow supply & shocks)
    let matCost = 0; const take = {};
    for (const k in q.mats) {
      const m = q.mats[k], want = m.need * dp, src = MAT_SOURCE[k], inv = S.economy.inventory[src[0]] || 0;
      const fromInv = Math.min(inv * 0.5, want / src[1] * 1) * 1;
      take[k] = { inv: fromInv, buy: Math.max(0, want - fromInv * src[1]) };
      matCost += take[k].buy * (S.economy.prices[src[0]] || 1) * 1.25 / src[1];
    }
    const pay = q.cost * dp + matCost;
    const fund = q.payer === 'player' ? S.money : S.budget;
    if (fund < pay) { q.status = 'waiting for funds'; q.rate = 0; return; }
    if (q.payer === 'player') S.money -= pay; else S.budget -= pay;
    for (const k in q.mats) { const src = MAT_SOURCE[k]; S.economy.inventory[src[0]] = Math.max(0, (S.economy.inventory[src[0]] || 0) - take[k].inv); q.mats[k].used += take[k].inv * src[1] + take[k].buy; }
    q.spent += pay; P.projStats.spent += pay;
    q.progress = Math.min(1, q.progress + dp); q.rate = dp / dt; q.status = crewF < 0.5 ? 'short of workers' : 'active';
    b.progress = Math.max(0.001, q.progress);
    const st = Math.min(4, Math.floor(q.progress * 4 + 1e-9));
    if (st > q.stage) { q.stage = st; milestoneReached(q, b); }
    if (q.progress >= 1) finishMegaProject(q);
  });
}
function milestoneReached(q, b) {
  const d = BUILDINGS[q.type], m = MEGA_MILESTONES[q.stage];
  if (q.stage >= 4) return;
  newsAdd(d.icon, d.name + ': ' + m[0] + ' milestone (' + m[1] + '%)', 'Spent ' + money(q.spent) + ' of ' + money(q.cost) + ' · ' + fmt(q.crew) + ' workers on site · expected completion ' + projectEta(q) + '.', { cat: 'project', notify: true });
  const c = buildingCenter(b); spawnParticles(c.x, c.y - 10, 'confetti', 14);
}
function finishMegaProject(q) {
  const b = MAP.byId.get(q.bid), d = BUILDINGS[q.type]; if (!b) return;
  q.progress = 1; q.stage = 4; q.status = 'complete'; q.crew = 0;
  b.built = true; b.progress = 1; b.cond = 100; b.born = gameDay(); delete b.mega;
  S.statistics.totals.built++; S.p10.projStats.done++;
  if (S.p9) p9OnBuilt(b);
  p10OnBuilt(b);
  requestMapChanged();
  const c = buildingCenter(b); spawnParticles(c.x, c.y - 10, 'confetti', 40); shake(6); sfx('complete');
  flashBig(d.icon + ' ' + d.name + '<br>COMPLETE!');
  newsAdd(d.icon, 'Megaproject complete: ' + d.name, 'Final cost ' + money(q.spent) + '. ' + d.desc, { cat: 'project', fx: [{ k: 'tour', v: 0.05 }, { k: 'growth', v: 0.03 }], dur: 1800, cls: 'gold' });
  timelineAdd(d.icon, 'Megaproject completed: ' + d.name, 'project', 'The ' + d.name + ' megaproject was completed.');
  S.p10.projects = S.p10.projects.filter(function (x) { return x !== q; });
}
function cancelMegaProject(id) {
  const q = S.p10.projects.find(function (x) { return x.id === +id; }); if (!q) return 'No such project';
  const b = MAP.byId.get(q.bid); if (b) { removeBuilding(b); onMapChanged(); }
  const refund = q.spent * 0.5; if (q.payer === 'player') S.money = Math.min(MONEY_CAP, S.money + refund); else S.budget = Math.min(MONEY_CAP, S.budget + refund);
  S.p10.projects = S.p10.projects.filter(function (x) { return x !== q; });
  newsAdd('🛑', BUILDINGS[q.type].name + ' cancelled', '50% of the ' + money(q.spent) + ' spent was recovered.', { cat: 'project' });
  return BUILDINGS[q.type].name + ' cancelled (refund ' + money(refund) + ')';
}
function projectEta(q) {
  if (q.status === 'complete') return 'done';
  if (!q.rate) return q.status === 'paused' ? 'paused' : '—';
  const sec = (1 - q.progress) / q.rate;
  return fmtGameDuration(sec * TIME_SCALE);
}

/* ===================================== MAINTENANCE BUDGETS & INFRASTRUCTURE AGING ===================================== */
const MAINT_CATS = [['roads', '🛣️', 'Roads & bridges'], ['buildings', '🏢', 'Public buildings'], ['power', '⚡', 'Power network'], ['water', '💧', 'Water network'], ['rail', '🚆', 'Rail & metro']];
function maintCat(d) {
  if (d.power > 0 || d.id === 'substation') return 'power';
  if (d.water > 0 || ['pumpstation', 'reservoir', 'sewageplant', 'waterpump'].indexOf(d.id) >= 0) return 'water';
  if (['trainstation', 'railhub', 'metro', 'centralrail', 'tramstop'].indexOf(d.id) >= 0) return 'rail';
  return 'buildings';
}
/* Hook from citylife maintenanceTick: decay speed follows the network's budget, age, upgrades and engineering research */
function p10DecayMult(b) {
  if (!S.p10) return 1;
  const d = bdef(b), bud = S.p10.maint[maintCat(d)], age = b.born ? Math.max(0, gameDay() - b.born) : 0;
  return (1.6 - 0.6 * bud) * (1 + age / 80) * Math.pow(0.75, b.grade || 0) * (1 - 0.03 * Math.min(8, researchLevel('engineering'))) * (b.u && b.u.safety ? 1 - 0.1 * b.u.safety : 1);
}
/* Hook from econTick: city maintenance costs scale with the budget */
function p10MaintCostMult(b) { return S.p10 ? 0.4 + 0.6 * S.p10.maint[maintCat(bdef(b))] : 1; }
function infraName(k, a) { return a.k === 'bridge' ? 'Bridge #' + k.slice(1) + ' (' + a.n + ' tiles)' : 'Roads — ' + (a.name || 'district ' + k.slice(1)); }
function agingScan() {
  const P = S.p10, I = P.infra, seen = {}, n = MAP.dN || Math.ceil(MAP.W / 8);
  const cells = {};
  for (let i = 0; i < MAP.roads.length; i++) {
    if (!MAP.roads[i]) continue;
    const x = i % MAP.W, y = (i / MAP.W) | 0;
    if (MAP.nature[i] === 2) continue;
    const k = 'r' + (Math.floor(y / 8) * n + Math.floor(x / 8));
    (cells[k] = cells[k] || []).push(i);
  }
  // bridges: connected road tiles over water
  const vis = new Uint8Array(MAP.roads.length), bridges = [];
  for (let i = 0; i < MAP.roads.length; i++) {
    if (!MAP.roads[i] || MAP.nature[i] !== 2 || vis[i]) continue;
    const st = [i], comp = []; vis[i] = 1;
    while (st.length) { const t = st.pop(); comp.push(t); const x = t % MAP.W, y = (t / MAP.W) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { const xx = x + o[0], yy = y + o[1]; if (!inMap(xx, yy)) return; const j = idx(xx, yy); if (!vis[j] && MAP.roads[j] && MAP.nature[j] === 2) { vis[j] = 1; st.push(j); } }); }
    bridges.push(comp);
  }
  const first = !P.infraInit, day = gameDay();
  const birth = function () { return first ? Math.max(1, day - Math.floor(day * 0.6)) : day; };
  for (const k in cells) { seen[k] = 1; const t = cells[k], x = t[0] % MAP.W, y = (t[0] / MAP.W) | 0; if (!I[k]) I[k] = { k: 'road', born: birth(), cond: 100, grade: 0, n: 0, name: '', tile: t[0] }; I[k].n = t.length; I[k].tile = t[0]; I[k].name = districtName(x, y) || regionName(x, y); }
  bridges.forEach(function (c) { const k = 'b' + Math.min.apply(null, c); seen[k] = 1; if (!I[k]) I[k] = { k: 'bridge', born: birth(), cond: 100, grade: 0, n: 0, name: '', tile: c[0] }; I[k].n = c.length; I[k].tile = c[Math.floor(c.length / 2)]; });
  for (const k in I) if (!seen[k]) delete I[k];
  S.buildings.list.forEach(function (b) { if (!b.born) b.born = first ? Math.max(1, day - Math.floor(day * 0.5 * Math.random())) : day; });
  P.infraInit = true;
}
function agingTick(dt) {
  if (BCT_SANDBOX.on) return;
  if (p10Every('agingScan', 60, dt) || !S.p10.infraInit) agingScan();
  if (!p10Every('aging', 10, dt) || (S.p9 && S.p9.freeze.buildings)) return;
  const P = S.p10, bud = P.maint.roads, storm = FX.weather === 'storm' || FX.weather === 'heavyrain' || FX.weather === 'coldwave';
  const base = 100 / (30 * 86400 / TIME_SCALE), day = gameDay();
  for (const k in P.infra) {
    const a = P.infra[k], age = Math.max(0, day - a.born);
    const cong = MAP.cong ? MAP.cong[a.tile] || 0 : 0;
    const r = base * (1.6 - 0.6 * bud) * (1 + cong) * (1 + age / 80) * Math.pow(0.75, a.grade) * (a.k === 'bridge' ? 1.2 : 1) * (storm ? 1.5 : 1) * (1 - 0.03 * Math.min(8, researchLevel('engineering')));
    a.cond = Math.max(0, a.cond - r * 10);
    if (a.cond < 35 && Math.random() < (35 - a.cond) / 35 * 0.02 * (1.5 - 0.5 * bud)) infraFailure(k, a);
  }
  // under-funded power / water / rail networks fail more often
  ['power', 'water', 'rail'].forEach(function (c) {
    const f = P.maint[c]; if (f >= 0.8) return;
    const L = S.buildings.list.filter(function (b) { return b.built && maintCat(bdef(b)) === c && (b.cond === undefined ? 100 : b.cond) < 50; });
    if (L.length && Math.random() < (0.8 - f) * 0.05) createP10Incident('utility', { b: L[Math.floor(Math.random() * L.length)], cause: 'low ' + c + ' maintenance budget' });
  });
}
function infraFailure(k, a) {
  const P = S.p10; P.infraStats.failures++;
  if (a.k === 'bridge') {
    const inc = S.p9 ? createIncident('closure', a.tile, { dur: 400, silent: true }) : null;
    newsAdd('🌉', 'Bridge closed after failed inspection', infraName(k, a) + ' — condition ' + Math.round(a.cond) + '%, ' + Math.max(0, gameDay() - a.born) + ' days old. Repair, upgrade or replace it.', { cat: 'infrastructure', cls: 'bad' });
    if (inc) trackP10Incident('traffic', { tile: a.tile, ref: inc.id, cause: 'bridge failure' });
  } else if (S.p9) {
    const inc = createIncident('roadwork', a.tile, { silent: true });
    if (inc) trackP10Incident('traffic', { tile: a.tile, ref: inc.id, cause: 'road failure (' + Math.round(a.cond) + '%)' });
  }
}
function infraValue(k, a) {
  if (a.k === 'bridge') return a.n * 2500 * costMult();
  let c = 0; const t = MAP.roads[a.tile] || 2; c = a.n * ROAD_TYPES[t].cost * 60 * costMult();
  return c;
}
const INFRA_ACTIONS = { repair: ['🛠️', 'REPAIR', 0.2], upgrade: ['⬆️', 'UPGRADE', 0.45], replace: ['🔄', 'REPLACE', 0.7] };
function infraAction(key, act, free) {
  const P = S.p10, A = INFRA_ACTIONS[act]; if (!A) return { ok: false, reason: 'Unknown action' };
  let a = null, b = null, value = 0, name = '';
  if (/^[rb]\d+$/.test(key)) { a = P.infra[key]; if (!a) return { ok: false, reason: 'Asset no longer exists' }; value = infraValue(key, a); name = infraName(key, a); }
  else { b = MAP.byId.get(+key); if (!b) return { ok: false, reason: 'Building no longer exists' }; value = buildCost(bdef(b)); name = bdef(b).name; }
  const cost = Math.round(value * A[2]);
  if (!free) { if (S.budget < cost) return { ok: false, reason: A[1] + ' costs ' + money(cost) + ' (city budget ' + money(S.budget) + ')' }; S.budget -= cost; }
  const o = a || b;
  o.cond = 100;
  if (act === 'upgrade') o.grade = Math.min(3, (o.grade || 0) + 1);
  if (act === 'replace') { o.born = gameDay(); o.grade = 0; }
  if (b) { b.damaged = 0; }
  P.infraStats[act === 'repair' ? 'repairs' : act === 'upgrade' ? 'upgrades' : 'replaced']++;
  return { ok: true, msg: A[1] + ': ' + name + ' (' + money(cost) + ')' };
}
function infraAssets() {
  const out = [], day = gameDay();
  for (const k in S.p10.infra) { const a = S.p10.infra[k]; out.push({ key: k, cat: 'roads', icon: a.k === 'bridge' ? '🌉' : '🛣️', name: infraName(k, a), age: day - a.born, cond: a.cond, grade: a.grade, value: infraValue(k, a) }); }
  S.buildings.list.forEach(function (b) { if (!b.built || b.type === 'tree' || b.owner !== 'city') return; const d = bdef(b), c = maintCat(d); out.push({ key: String(b.id), cat: c, icon: d.icon, name: d.name + ' #' + b.id, age: b.born ? day - b.born : 0, cond: b.cond === undefined ? 100 : b.cond, grade: b.grade || 0, value: buildCost(d) }); });
  return out.sort(function (x, y) { return x.cond - y.cond; });
}
function infraPenalty() { if (!S.p10) return 0; let s = 0, n = 0; for (const k in S.p10.infra) { s += S.p10.infra[k].cond; n++; } const avg = n ? s / n : 100; return avg < 60 ? (60 - avg) * 0.5 : 0; }
function infraRepairAuto() { let n = 0; infraAssets().filter(function (a) { return a.cat === 'roads' && a.cond < 50; }).slice(0, 3).forEach(function (a) { if (infraAction(a.key, 'repair').ok) n++; }); return n; }

/* ===================================== RANDOM INCIDENTS & INCIDENT CENTER ===================================== */
const INC_DEFS = {
  breakdown: { icon: '🚗💨', name: 'Vehicle breakdown', unit: 'police', work: 10 },
  accident: { icon: '💥', name: 'Small accident', unit: 'police', work: 15 },
  utility: { icon: '⚡', name: 'Utility failure', unit: 'maintenance', work: 40 },
  construction: { icon: '🏗️', name: 'Construction delay', unit: 'maintenance', work: 30 },
  warehouse: { icon: '📦', name: 'Warehouse issue', unit: 'maintenance', work: 30 },
  traffic: { icon: '🚧', name: 'Traffic incident', unit: 'maintenance', work: 20 }
};
function trackP10Incident(type, o) {
  const P = S.p10, D = INC_DEFS[type], I = P.incidents;
  const tile = o.tile !== undefined ? o.tile : (o.b ? o.b._entry : -1);
  const x = tile >= 0 ? tile % MAP.W : (o.b ? o.b.x : 0), y = tile >= 0 ? (tile / MAP.W) | 0 : (o.b ? o.b.y : 0);
  const inc = Object.assign(incShape(), { id: I.next++, type: type, name: D.name, icon: D.icon, tile: tile, bid: o.b ? o.b.id : 0, ref: o.ref || '', start: S.clock.runSec, district: districtName(x, y) || regionName(x, y), cause: o.cause || '' });
  I.active.push(inc); I.stats.total++;
  if (I.active.length > 12) resolveP10Incident(I.active[0], 'expired');
  if (P.auto.emergency) dispatchP10Incident(inc.id);
  return inc;
}
/* Creates the in-game problem (blocked lane, accident, outage, closed warehouse …) and tracks it */
function createP10Incident(type, o) {
  o = o || {};
  if (!S.p10 || !INC_DEFS[type]) return null;
  if (type === 'breakdown' || type === 'traffic') { const inc = S.p9 ? createIncident(type === 'breakdown' ? 'breakdown' : (Math.random() < 0.5 ? 'closure' : 'roadwork'), o.tile, { silent: true }) : null; if (!inc) return null; return trackP10Incident(type, { tile: inc.tile, ref: inc.id, cause: o.cause }); }
  if (type === 'accident') { const tile = o.tile >= 0 ? o.tile : randomRoadTile(); if (tile < 0) return null; const acc = triggerAccident(null, tile); if (!acc) return null; return trackP10Incident('accident', { tile: tile, cause: o.cause || 'collision' }); }
  if (type === 'utility') {
    const b = o.b || pickRandomBuilding(function (b) { const c = maintCat(bdef(b)); return (c === 'power' || c === 'water') && b._op; }); if (!b) return null;
    const water = maintCat(bdef(b)) === 'water';
    if (water) { const t = b._entry >= 0 ? b._entry : randomRoadTile(); breakPipe(t, true); return trackP10Incident('utility', { b: b, tile: t, ref: 'pipe:' + t, cause: o.cause || 'burst main' }); }
    S.p9.util.failures.push({ x: b.x, y: b.y, r: 4, until: S.clock.runSec + 900, cause: 'failure' });
    return trackP10Incident('utility', { b: b, ref: 'power:' + b.id, cause: o.cause || 'transformer fault' });
  }
  if (type === 'construction') { const b = o.b || pickRandomBuilding(function (b) { return !b.built && !b.mega; }); if (!b) return null; b.p10Delay = S.clock.runSec + 600; return trackP10Incident('construction', { b: b, cause: o.cause || pick(['material delivery late', 'crane failure', 'permit dispute', 'bad weather']) }); }
  if (type === 'warehouse') { const b = o.b || pickRandomBuilding(function (b) { return (b.type === 'warehouse' || b.type === 'distcenter') && b._op; }); if (!b) return null; b.closed = true; b.p10Closed = true; return trackP10Incident('warehouse', { b: b, cause: o.cause || pick(['forklift fire', 'flooded loading bay', 'IT outage', 'roof leak']) }); }
  return null;
}
function pickRandomBuilding(f) { const L = S.buildings.list.filter(f); return L.length ? L[Math.floor(Math.random() * L.length)] : null; }
function dispatchP10Incident(id) {
  const inc = S.p10.incidents.active.find(function (x) { return x.id === +id; }); if (!inc || inc.status !== 'waiting') return null;
  const D = INC_DEFS[inc.type];
  let tile = inc.tile; if (tile < 0 || !MAP.roads[tile]) { const b = MAP.byId.get(inc.bid); tile = b ? b._entry : -1; }
  if (tile < 0) return null;
  const v = emergencyDispatch(D.unit, tile, { priority: inc.type === 'accident' ? 3 : 1 });
  if (!v) { inc.status = 'waiting'; return null; }
  v.p10inc = inc.id; inc.status = 'responding'; inc.unit = EMERGENCY_UNITS[D.unit].name; inc.dispatched = S.clock.runSec;
  S.p10.autoStats.emergency++;
  return v;
}
function p10IncidentArrive(v) {
  const inc = S.p10 && S.p10.incidents.active.find(function (x) { return x.id === v.p10inc; }); if (!inc) return;
  inc.status = 'on site'; inc.resp = (S.clock.runSec - inc.start) * TIME_SCALE / 60; inc.until = S.clock.runSec + INC_DEFS[inc.type].work;
}
function resolveP10Incident(inc, how) {
  const P = S.p10, b = inc.bid ? MAP.byId.get(inc.bid) : null;
  if (inc.ref && S.p9) {
    if (/^i\d+/.test(inc.ref)) { const p9 = S.p9.traffic.incidents.find(function (x) { return x.id === inc.ref; }); if (p9) endIncident(p9); }
    if (/^pipe:/.test(inc.ref)) repairPipe(+inc.ref.slice(5));
    if (/^power:/.test(inc.ref) && b) S.p9.util.failures = S.p9.util.failures.filter(function (f) { return !(f.x === b.x && f.y === b.y && f.cause === 'failure'); });
  }
  if (inc.type === 'accident' && inc.tile >= 0) { AG.accidents.slice().forEach(function (a) { if (a.tile === inc.tile) { MAP.blocked[a.tile] = 0; AG.accidents.splice(AG.accidents.indexOf(a), 1); } }); }
  if (b && inc.type === 'construction') delete b.p10Delay;
  if (b && inc.type === 'warehouse' && b.p10Closed) { b.closed = false; delete b.p10Closed; }
  if (b && inc.type === 'utility') b.cond = Math.max(b.cond || 0, 70);
  inc.status = how || 'resolved'; inc.ended = S.clock.runSec;
  if (inc.resp) { P.incidents.stats.respSum += inc.resp; P.incidents.stats.respN++; }
  P.incidents.active = P.incidents.active.filter(function (x) { return x !== inc; });
  P.incidents.resolved.unshift(inc); if (P.incidents.resolved.length > 30) P.incidents.resolved.length = 30;
  MAP.pathCache.clear();
}
function incidentsTick10(dt) {
  if (BCT_SANDBOX.on) return;
  const P = S.p10, now = S.clock.runSec;
  P.incidents.active.slice().forEach(function (inc) {
    if (inc.status === 'on site' && now >= inc.until) return resolveP10Incident(inc, 'resolved');
    // incidents the city solved by itself (timer of the underlying traffic incident / accident cleared)
    if (inc.ref && /^i\d+/.test(inc.ref) && S.p9 && !S.p9.traffic.incidents.some(function (x) { return x.id === inc.ref; }) && inc.status !== 'on site') return resolveP10Incident(inc, 'cleared');
    if (inc.type === 'accident' && !AG.accidents.some(function (a) { return a.tile === inc.tile; }) && inc.status !== 'on site') return resolveP10Incident(inc, 'cleared');
    if (inc.status === 'responding' && !AG.vehicles.some(function (v) { return v.p10inc === inc.id; })) inc.status = 'waiting';
    if (inc.status === 'waiting' && P.auto.emergency && now - (inc.retry || 0) > 10) { inc.retry = now; dispatchP10Incident(inc.id); }
    if (now - inc.start > 900) { P.rep = Math.max(0, P.rep - 5); resolveP10Incident(inc, 'self-resolved (no response)'); }
  });
  if (!p10Every('incSpawn', 30, dt) || S.p5.admin.noEvents || S.city.population < 300 || (S.p9 && S.p9.freeze.traffic)) return;
  if (P.incidents.active.length >= 5) return;
  const pop = S.city.population, k = Math.min(3, pop / 20000 + 0.3);
  const roll = Math.random();
  if (roll < 0.10 * k) createP10Incident('breakdown');
  else if (roll < 0.10 * k + 0.06 * k * (1 + SIM.traffic / 50)) createP10Incident('accident');
  else if (roll < 0.25 * k && Math.random() < 0.3) createP10Incident(pick(['utility', 'construction', 'warehouse', 'traffic']));
}

/* ===================================== CITIZEN OPINIONS & PETITIONS ===================================== */
function citizenOpinions() {
  const c = S.city, pop = c.population, out = [];
  if (pop < 50) return out;
  const add = function (topic, mood, text, weight) { out.push({ topic: topic, mood: mood, text: text, share: clamp(weight, 0.01, 1), n: Math.round(clamp(weight, 0.01, 1) * pop) }); };
  const metro = S.p9 ? S.p9.transit.lines.filter(function (L) { return L.mode === 'metro'; }).length : 0, transitShare = (SIM.riders || 0) / Math.max(1, SIM.trips || 1);
  if (metro && transitShare > 0.25) add('transit', 1, 'The metro is very convenient.', transitShare);
  else if (pop > 3000 && transitShare < 0.15) add('transit', -1, 'We need better public transport.', 0.3 - transitShare);
  if (c.housingPrice > 1.4) add('housing', -1, 'Rent is becoming expensive.', (c.housingPrice - 1.2) / 2);
  else if (c.housingPrice < 0.95) add('housing', 1, 'Housing is affordable here.', 0.3);
  if (SIM.traffic > 50) { const r = weRegionStats(false).slice().sort(function (a, b) { return b.traffic - a.traffic; })[0]; add('traffic', -1, 'Traffic is terrible' + (r ? ' in the ' + r.name + ' region' : '') + '.', SIM.traffic / 120); }
  if (SIM.unemployment > 0.1) add('jobs', -1, 'It is hard to find a job.', SIM.unemployment * 2);
  else if (SIM.unemployment < 0.04 && pop > 200) add('jobs', 1, 'There are plenty of jobs around.', 0.35);
  if (c.pollution > 40) add('pollution', -1, 'The air is getting dirty.', c.pollution / 120);
  let parks = 0; S.buildings.list.forEach(function (b) { if (bdef(b).hap > 0 && b._op) parks++; });
  if (pop > 500 && parks < pop / 800) add('parks', -1, 'We need more parks.', 0.25);
  const H = SV.health; if (H && H.load > 1) add('health', -1, 'Hospital waiting times are too long (' + Math.round(H.wait) + ' min).', Math.min(1, (H.load - 1) + 0.2));
  else if (H && svHealthIndex() > 0.85) add('health', 1, 'Healthcare here is excellent.', 0.3);
  const E = SV.edu; if (E && pop > 800 && E.cov[2] < 0.6) add('education', -1, 'Our kids need more high schools.', (0.6 - E.cov[2]) + 0.1);
  if (c.crime > 30) add('safety', -1, 'I do not feel safe at night.', c.crime / 100);
  if ((SIM.powerRatio || 1) < 0.98) add('power', -1, 'Blackouts again!', 1 - SIM.powerRatio + 0.2);
  if ((SIM.waterRatio || 1) < 0.98) add('water', -1, 'The tap water keeps running dry.', 1 - SIM.waterRatio + 0.2);
  if (c.tourists > pop * 0.2 && pop > 1000) add('tourism', 0, 'So many tourists lately!', 0.2);
  if (c.tax > 15) add('tax', -1, 'Taxes are too high.', (c.tax - 12) / 15);
  if (c.happiness > 80) add('life', 1, 'I love living in ' + c.name + '!', c.happiness / 150);
  return out.sort(function (a, b) { return b.share - a.share; });
}
const PETITION_DEFS = {
  park: { icon: '🌳', title: 'Build a new park', topic: 'parks', cost: function () { return buildCost(BUILDINGS.park) * 4; } },
  metro: { icon: '🚇', title: 'Expand the metro', topic: 'transit', cost: function () { return buildCost(BUILDINGS.metro) * 3 + 15000; } },
  school: { icon: '🏫', title: 'Build a high school', topic: 'education', cost: function () { return buildCost(BUILDINGS.highschool); } },
  hospital: { icon: '🏥', title: 'Build a clinic', topic: 'health', cost: function () { return buildCost(BUILDINGS.clinic) * 2; } },
  taxes: { icon: '💸', title: 'Lower taxes by 1%', topic: 'tax', cost: function () { return 0; } },
  police: { icon: '🚓', title: 'Build a police station', topic: 'safety', cost: function () { return buildCost(BUILDINGS.police); } },
  bus: { icon: '🚌', title: 'Add a bus line', topic: 'traffic', cost: function () { return buildCost(BUILDINGS.busstop) * 4 + 15000; } },
  trees: { icon: '🌲', title: 'Plant trees against pollution', topic: 'pollution', cost: function () { return 25 * 60 * costMult(); } },
  housing: { icon: '🏘️', title: 'Build affordable housing', topic: 'housing', cost: function () { return buildCost(BUILDINGS.socialhousing) * 2; } }
};
function civicTick(dt) {
  if (BCT_SANDBOX.on) return;
  const P = S.p10, now = S.clock.runSec;
  if (p10Every('petition', 60, dt) && S.city.population > 300) {
    const ops = citizenOpinions().filter(function (o) { return o.mood < 0 && o.share >= 0.15; });
    ops.forEach(function (o) {
      const type = Object.keys(PETITION_DEFS).find(function (k) { return PETITION_DEFS[k].topic === o.topic; });
      if (!type || P.petitions.some(function (x) { return x.type === type && x.status === 'open'; }) || P.petitions.filter(function (x) { return x.status === 'open'; }).length >= 4) return;
      const D = PETITION_DEFS[type];
      P.petitions.push({ id: P.nextPet++, type: type, title: D.title, why: o.text, sig: o.n, created: now, deadline: now + 2 * 86400 / TIME_SCALE, status: 'open', cost: Math.round(D.cost()) });
      notify('✍️ Citizen petition: ' + D.title + ' (' + fmt(o.n) + ' signatures)', '');
    });
  }
  P.petitions.forEach(function (x) { if (x.status === 'open' && now > x.deadline) petitionIgnore(x.id, true); });
  if (P.petitions.length > 12) P.petitions = P.petitions.filter(function (x) { return x.status === 'open'; }).concat(P.petitions.filter(function (x) { return x.status !== 'open'; }).slice(-6)).slice(-12);
  if (p10Every('goals', 10, dt)) { goalsTick(); objectivesTick(); }
}
function petitionAccept(id) {
  const P = S.p10, x = P.petitions.find(function (q) { return q.id === +id; }); if (!x || x.status !== 'open') return { ok: false, reason: 'Petition closed' };
  if (S.budget < x.cost) return { ok: false, reason: 'Needs ' + money(x.cost) + ' from the city budget' };
  const r = petitionDo(x.type); if (!r) return { ok: false, reason: 'No free, road-connected land for it — zone or clear land first' };
  S.budget -= x.cost; x.status = 'accepted'; P.petStats.accepted++;
  P.rep = Math.min(1000, P.rep + 15);
  P.fx.push({ k: 'growth', v: 0.03, until: S.clock.runSec + 600, id: '', src: 0 });
  newsAdd(PETITION_DEFS[x.type].icon, 'City accepts petition: ' + x.title, fmt(x.sig) + ' citizens signed. ' + r, { cat: 'citizens', cls: 'good' });
  return { ok: true, msg: r };
}
function petitionIgnore(id, expired) {
  const P = S.p10, x = P.petitions.find(function (q) { return q.id === +id; }); if (!x || x.status !== 'open') return { ok: false, reason: 'Petition closed' };
  x.status = expired ? 'expired' : 'ignored'; P.petStats.ignored++;
  const k = clamp(x.sig / Math.max(1, S.city.population), 0.05, 1);
  P.rep = Math.max(0, P.rep - 25 * k - 5);
  P.fx.push({ k: 'growth', v: -0.04 * k, until: S.clock.runSec + 900, id: '', src: 0 });
  return { ok: true, msg: 'Petition ' + x.status + ' — reputation −' + Math.round(25 * k + 5) };
}
function worstRegionCenter(metric) { const r = weRegionStats(false).slice().sort(function (a, b) { return b[metric] - a[metric]; })[0]; return r; }
function petitionDo(type) {
  const place = function (t, n) { let k = 0; for (let i = 0; i < (n || 1); i++) { const b = wgPlaceAnywhere(null, t, { owner: 'city' }); if (b) { b.built = false; b.progress = 0; b.buildTime = buildTimeFor(bdef(b).cost); k++; } } if (k) onMapChanged(); return k; };
  switch (type) {
    case 'park': return place('park', 4) ? 'Parks are being built.' : '';
    case 'metro': { const n = place('metro', 3); if (!n) return ''; const L = createTransitLine('metro'); return n + ' metro station(s) under construction' + (L ? ' · ' + L.name : '') + '.'; }
    case 'school': return place('highschool') ? 'A high school is being built.' : '';
    case 'hospital': return place('clinic', 2) ? 'Two clinics are being built.' : '';
    case 'police': return place('police') ? 'A police station is being built.' : '';
    case 'housing': return place('socialhousing', 2) ? 'Affordable housing is being built.' : '';
    case 'taxes': S.city.tax = Math.max(0, S.city.tax - 1); return 'Tax rate lowered to ' + S.city.tax + '%.';
    case 'bus': { const n = place('busstop', 4); if (!n) return ''; const L = createTransitLine('bus'); return n + ' bus stops built' + (L ? ' · ' + L.name : '') + '.'; }
    case 'trees': { let k = 0; if (!envReady()) envTick(true); const T = []; for (let i = 0; i < MAP.roads.length; i++) if (!MAP.roads[i] && !MAP.occ[i] && MAP.nature[i] !== 2 && MAP.terrain[i] !== TERRAIN.ROCK && inUnlocked(i % MAP.W, (i / MAP.W) | 0)) T.push(i); T.sort(function (a, b) { return (ENV.air[b] || 0) - (ENV.air[a] || 0); }); T.slice(0, 60).forEach(function (i) { MAP.nature[i] = 1; MAP.zone[i] = 0; k++; }); MAP.groundDirty = true; requestMapChanged(); return k ? k + ' trees planted in the most polluted areas.' : ''; }
  }
  return '';
}

/* ===================================== LONG-TERM GOALS & DYNAMIC OBJECTIVES ===================================== */
const LONG_GOALS = [
  { id: 'pop1m', icon: '👥', name: '1 Million Population', target: 1e6, val: function () { return S.city.population; }, reward: 5e7 },
  { id: 'tour1', icon: '🧳', name: '#1 Tourism City', target: 1, inv: true, val: function () { return rankingsNow().tourism.rank; }, reward: 2e7 },
  { id: 'happy95', icon: '😊', name: '95% Happiness', target: 95, val: function () { return S.city.happiness; }, reward: 1e7 },
  { id: 'metro5', icon: '🚇', name: '5 Metro Lines', target: 5, val: function () { return S.p9 ? S.p9.transit.lines.filter(function (L) { return L.mode === 'metro'; }).length : 0; }, reward: 1.5e7 },
  { id: 'gdp1b', icon: '💰', name: '$1B GDP', target: 1e9, val: function () { return cityGDP(); }, reward: 3e7 },
  { id: 'rep900', icon: '⭐', name: 'World-class Reputation (900)', target: 900, val: function () { return S.p10.rep; }, reward: 2e7 },
  { id: 'mega3', icon: '🏗️', name: '3 Megaprojects', target: 3, val: function () { return S.buildings.list.filter(function (b) { return bdef(b).megaproject && b.built; }).length; }, reward: 4e7 },
  { id: 'edu90', icon: '🎓', name: '90% Education', target: 90, val: function () { return S.city.education; }, reward: 1e7 }
];
function goalsTick() {
  const P = S.p10;
  LONG_GOALS.forEach(function (g) {
    if (P.goalsDone[g.id]) return;
    const v = g.val(), ok = g.inv ? v > 0 && v <= g.target : v >= g.target;
    if (!ok) return;
    P.goalsDone[g.id] = gameDay();
    S.money = Math.min(MONEY_CAP, S.money + g.reward);
    newsAdd(g.icon, 'City goal achieved: ' + g.name, 'Reward ' + money(g.reward) + '.', { cat: 'goal', cls: 'gold' });
    timelineAdd(g.icon, 'Goal achieved: ' + g.name, 'goal'); flashBig(g.icon + ' ' + g.name);
  });
}
const OBJ_DEFS = {
  congestion: { icon: '🚦', make: function () { const r = worstRegionCenter('traffic'); if (!r || r.traffic < 45) return null; return { title: 'Reduce ' + r.name + ' region congestion below 30%', target: 30, start: r.traffic, region: r.id, years: 2 }; }, val: function (o) { const r = weRegionStats(false).find(function (x) { return x.id === o.region; }); return r ? r.traffic : 0; }, lower: true },
  gdp: { icon: '📉', make: function () { const P = S.p10, g = cityGDP(); if (!P.gdpPeak || g > P.gdpPeak * 0.85) return null; return { title: 'Recover GDP to ' + money(P.gdpPeak) + ' within 5 years', target: P.gdpPeak, start: g, years: 5 }; }, val: function () { return cityGDP(); } },
  unemployment: { icon: '💼', make: function () { if (SIM.unemployment < 0.09) return null; return { title: 'Bring unemployment below 6%', target: 6, start: SIM.unemployment * 100, years: 2 }; }, val: function () { return SIM.unemployment * 100; }, lower: true },
  health: { icon: '🏥', make: function () { if (!SV.health || SV.health.load < 1.05) return null; return { title: 'End the healthcare overload (hospital load under 90%)', target: 90, start: SV.health.load * 100, years: 1 }; }, val: function () { return SV.health ? SV.health.load * 100 : 0; }, lower: true },
  school: { icon: '🎓', make: function () { if (!SV.edu || S.city.population < 800 || SV.edu.cov[2] > 0.7) return null; return { title: 'Raise high-school coverage to 90%', target: 90, start: SV.edu.cov[2] * 100, years: 2 }; }, val: function () { return SV.edu ? SV.edu.cov[2] * 100 : 0; } },
  pollution: { icon: '🌿', make: function () { if (S.city.pollution < 35) return null; return { title: 'Cut pollution below 25%', target: 25, start: S.city.pollution, years: 3 }; }, val: function () { return S.city.pollution; }, lower: true },
  power: { icon: '⚡', make: function () { if ((SIM.powerRatio || 1) > 0.97) return null; return { title: 'Restore a 100% power supply', target: 100, start: SIM.powerRatio * 100, years: 1 }; }, val: function () { return (SIM.powerRatio || 0) * 100; } }
};
function objectivesTick() {
  const P = S.p10, g = cityGDP();
  P.gdpPeak = Math.max(P.gdpPeak || 0, g);
  P.objectives.forEach(function (o) {
    if (o.status !== 'active') return;
    const D = OBJ_DEFS[o.kind], v = D.val(o);
    o.best = D.lower ? Math.min(o.best || v, v) : Math.max(o.best || 0, v);
    if (D.lower ? v <= o.target : v >= o.target) {
      o.status = 'completed'; P.objStats.done++;
      S.money = Math.min(MONEY_CAP, S.money + o.reward); S.research.rp += Math.round(o.reward / 5000);
      newsAdd(D.icon, 'Objective completed: ' + o.title, 'Reward ' + money(o.reward) + ' and ' + Math.round(o.reward / 5000) + ' RP.', { cat: 'goal', cls: 'gold' });
    } else if (S.clock.runSec > o.deadline) { o.status = 'failed'; P.objStats.failed++; P.rep = Math.max(0, P.rep - 10); notify('⌛ Objective failed: ' + o.title, 'bad'); }
  });
  if (P.objectives.filter(function (o) { return o.status === 'active'; }).length >= 3 || S.city.population < 200) return;
  if (S.clock.runSec - (P.lastObj || -1e9) < 120) return;
  const kinds = Object.keys(OBJ_DEFS).filter(function (k) { return !P.objectives.some(function (o) { return o.kind === k && o.status === 'active'; }); });
  for (let i = 0; i < kinds.length; i++) {
    const m = OBJ_DEFS[kinds[i]].make(); if (!m) continue;
    P.lastObj = S.clock.runSec;
    P.objectives.push({ id: P.nextObj++, kind: kinds[i], title: m.title, target: m.target, start: m.start, region: m.region || '', deadline: S.clock.runSec + m.years * YEAR_GAME_SEC / TIME_SCALE, reward: Math.round((50000 + S.city.population * 20) * m.years), status: 'active', best: m.start });
    notify(OBJ_DEFS[kinds[i]].icon + ' New objective: ' + m.title, '');
    break;
  }
  P.objectives = P.objectives.filter(function (o) { return o.status === 'active'; }).concat(P.objectives.filter(function (o) { return o.status !== 'active'; }).slice(-5));
}
function objectiveProgress(o) { const D = OBJ_DEFS[o.kind], v = D.val(o); if (D.lower) return clamp((o.start - v) / Math.max(0.01, o.start - o.target), 0, 1); return clamp((v - o.start) / Math.max(0.01, o.target - o.start), 0, 1); }

/* ===================================== LIVE GRAPHS ===================================== */
const GRAPH_DEFS = [
  ['pop', '👥', 'Population', function () { return S.city.population; }, fmt],
  ['gdp', '💰', 'GDP (annual)', function () { return cityGDP(); }, money],
  ['income', '📈', 'Income /s', function () { return SIM.income || 0; }, money],
  ['expenses', '📉', 'Expenses /s', function () { return SIM.expenses || 0; }, money],
  ['traffic', '🚦', 'Traffic %', function () { return SIM.traffic || 0; }, function (v) { return Math.round(v) + '%'; }],
  ['pollution', '🏭', 'Pollution %', function () { return S.city.pollution; }, function (v) { return Math.round(v) + '%'; }],
  ['happiness', '😊', 'Happiness %', function () { return S.city.happiness; }, function (v) { return Math.round(v) + '%'; }],
  ['tourism', '🧳', 'Tourists', function () { return S.city.tourists; }, fmt],
  ['electricity', '⚡', 'Electricity use (MW)', function () { return SIM.powerUse || 0; }, function (v) { return fmt(Math.round(v)) + ' MW'; }],
  ['water', '💧', 'Water use', function () { return SIM.waterUse || 0; }, function (v) { return fmt(Math.round(v)); }],
  ['jobs', '💼', 'Jobs', function () { return SIM.jobs || 0; }, fmt],
  ['construction', '🏗️', 'Construction sites', function () { let n = 0; S.buildings.list.forEach(function (b) { if (!b.built) n++; }); return n; }, fmt],
  ['companies', '🏢', 'Company assets', function () { let a = 0; AI_DEFS.forEach(function (x) { const st = S.ai[x.id]; if (st && !st.acquired) a += st.assets || 0; }); return a; }, money]
];
function graphsTick(dt) {
  if (BCT_SANDBOX.on || !p10Every('graphs', 10, dt)) return;
  const G = S.p10.graphs;
  G.t.push(Math.round(S.clock.gameSec / 864) / 100); if (G.t.length > 240) G.t.shift();
  GRAPH_DEFS.forEach(function (g) { const a = G[g[0]] || (G[g[0]] = []); const v = g[3](); a.push(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100); if (a.length > 240) a.shift(); });
}

/* ===================================== TIME MACHINE ===================================== */
const TM_YEARS = [1, 5, 10, 25, 50, 100];
function timeMachineTick() {
  if (BCT_SANDBOX.on || !S.p10 || S.clock.runSec < 30 || !STARTED) return;
  const y = gameYear();
  if (TM_YEARS.indexOf(y) < 0 || S.p10.tm[y]) return;
  timeMachineCapture(y);
}
function timeMachineCapture(y) {
  const meta = createSnapshot('⏳ TIME MACHINE · YEAR ' + y, true, { tm: y });
  if (!meta) return null;
  S.p10.tm[y] = { id: meta.id, pop: Math.round(S.city.population), money: Math.round(S.money), gdp: Math.round(cityGDP()), rep: Math.round(S.p10.rep), happy: Math.round(S.city.happiness), day: gameDay(), created: Date.now() };
  timelineAdd('⏳', 'Time Machine snapshot: year ' + y, 'snapshot');
  return meta;
}
function timeMachineTravel(y) {
  const t = S.p10.tm[y]; if (!t) return { ok: false, reason: 'No snapshot for year ' + y + ' yet' };
  if (!Store.getItem(snapKey(t.id))) return { ok: false, reason: 'Snapshot ' + t.id + ' was removed from storage' };
  const keep = JSON.parse(JSON.stringify(S.p10.tm));
  rollbackSnapshot(t.id);
  if (S.p10) for (const k in keep) if (!S.p10.tm[k]) S.p10.tm[k] = keep[k];         // later years stay reachable
  return { ok: true };
}

/* ===================================== SANDBOX ENGINE (SIMULATION LAB & WHAT-IF) ===================================== */
const LAB = { mods: null, last: null, sliders: { pop: 50, traffic: 100, tax: -20, industry: 80, tourism: 200 }, whatif: null };
function labApplyMods(m) {
  const L = LAB.mods; if (!L) return;
  if (L.traffic) m.traffic = (m.traffic || 1) * (1 + L.traffic);
  if (L.industry) { m.production *= 1 + L.industry; m.indPol = (m.indPol || 1) * (1 + L.industry * 0.8); m.jobs *= 1 + L.industry * 0.25; }
  if (L.tourism) m.tour *= 1 + L.tourism;
  if (L.roadCap) m.roadCap = (m.roadCap || 1) * (1 + L.roadCap);
}
const SB_SILENCE = ['notify', 'toast', 'sfx', 'flashBig', 'logHistory', 'fireworks', 'shake', 'spawnParticles'];
function cityMetrics() {
  let lv = 0, n = 0; S.buildings.list.forEach(function (b) { if (!b.built || bdef(b).id === 'tree') return; lv += landValue(b); n++; });
  return { pop: S.city.population, gdp: cityGDP(), budget: SIM.bNet || 0, income: SIM.income || 0, unemployment: (SIM.unemployment || 0) * 100, happiness: S.city.happiness, traffic: SIM.traffic || 0, pollution: S.city.pollution, tourism: S.city.tourists, crime: S.city.crime, power: (SIM.powerRatio || 0) * 100, water: (SIM.waterRatio || 0) * 100, land: n ? lv / n * 100 : 0, health: SV.health ? SV.health.load * 100 : 0, education: S.city.education, rep: S.p10 ? S.p10.rep : 0 };
}
const METRIC_DEFS = [['pop', '👥', 'Population', 0], ['gdp', '💰', 'GDP', 0], ['budget', '🏛️', 'City budget /s', 0], ['unemployment', '💼', 'Unemployment %', 1], ['happiness', '😊', 'Happiness', 0], ['traffic', '🚦', 'Traffic %', 1], ['pollution', '🏭', 'Pollution %', 1], ['tourism', '🧳', 'Tourists', 0], ['crime', '🚔', 'Crime %', 1], ['power', '⚡', 'Power supply %', 0], ['water', '💧', 'Water supply %', 0], ['land', '🏷️', 'Land value', 0], ['health', '🏥', 'Hospital load %', 1], ['education', '🎓', 'Education', 0], ['rep', '⭐', 'Reputation', 0]];
/* Runs the real economy engine (econTick + Part 10 derived systems) on a deep copy of the world. The live world, its
   SIM values, caches and the map are restored afterwards; the same random seed is used for every run so differences
   between runs come only from the experiment. */
function sandboxRun(setup, steps, dtStep) {
  const realS = S, simKeys = Object.keys(SIM), simCopy = {}, realSV = Object.assign({}, SV), realLAB = LAB.mods;
  simKeys.forEach(function (k) { simCopy[k] = SIM[k]; });
  const nested = {}; ['saleMult', 'dDisp', 'sDisp', 'cov'].forEach(function (k) { if (SIM[k]) nested[k] = JSON.parse(JSON.stringify(SIM[k])); });
  const saved = {}; SB_SILENCE.forEach(function (f) { saved[f] = window[f]; });
  const realRandom = Math.random, mapCap = MAP.roadCapSum, mapRoadCount = MAP.roadCount;
  let out = null;
  BCT_SANDBOX.on = true;
  try {
    S = JSON.parse(JSON.stringify(realS, function (k, v) { return v instanceof Map || v instanceof Set ? undefined : v; }));
    ['saleMult', 'dDisp', 'sDisp', 'cov'].forEach(function (k) { if (nested[k]) SIM[k] = JSON.parse(JSON.stringify(nested[k])); });
    SB_SILENCE.forEach(function (f) { window[f] = function () { }; });
    Math.random = mulberry32(424242);
    LAB.mods = null;
    const info = setup ? setup() || {} : {};
    SV.edu = educationPass(); SV.health = healthPass(0);
    for (let k = 0; k < steps; k++) {
      econTick(dtStep);
      if (k % 5 === 4) { SV.edu = educationPass(); SV.health = healthPass(0); reputationTick(dtStep * 5); }
    }
    reputationTick(dtStep * 10);
    out = { m: cityMetrics(), info: info };
  } catch (e) { out = { error: e.message }; if (typeof logError === 'function') logError('Sandbox', e); }
  finally {
    S = realS;
    Object.keys(SIM).forEach(function (k) { if (!(k in simCopy)) delete SIM[k]; });
    simKeys.forEach(function (k) { SIM[k] = simCopy[k]; });
    SB_SILENCE.forEach(function (f) { window[f] = saved[f]; });
    Math.random = realRandom; MAP.roadCapSum = mapCap; MAP.roadCount = mapRoadCount;
    Object.assign(SV, realSV); LAB.mods = realLAB;
    BCT_SANDBOX.on = false;
  }
  return out;
}
const SB_STEPS = 60, SB_DT = 2;               // 120 simulated seconds per run (≈ 2.4 game hours)
function compareRuns(base, exp) {
  if (base.error || exp.error) return { error: base.error || exp.error };
  const rows = METRIC_DEFS.map(function (d) { const a = base.m[d[0]], b = exp.m[d[0]]; return { id: d[0], icon: d[1], name: d[2], lowerBetter: !!d[3], base: a, exp: b, delta: b - a, pct: Math.abs(a) > 1e-6 ? (b / a - 1) * 100 : 0 }; });
  return { rows: rows };
}
/* SIMULATION LAB: population / traffic / tax / industry / tourism experiments */
function runSimulationLab(sl) {
  sl = sl || LAB.sliders;
  const t0 = performance.now();
  const base = sandboxRun(null, SB_STEPS, SB_DT);
  const exp = sandboxRun(function () {
    if (sl.pop) S.city.population = Math.max(0, S.city.population * (1 + sl.pop / 100));
    if (sl.tax) S.city.tax = clamp(Math.round(S.city.tax * (1 + sl.tax / 100)), 0, 40);
    LAB.mods = { traffic: (sl.traffic || 0) / 100, industry: (sl.industry || 0) / 100, tourism: (sl.tourism || 0) / 100 };
    if (sl.tourism) S.city.tourists *= 1 + sl.tourism / 100;
  }, SB_STEPS, SB_DT);
  LAB.last = Object.assign(compareRuns(base, exp), { sliders: Object.assign({}, sl), ms: performance.now() - t0, at: gameDay() });
  return LAB.last;
}
/* WHAT-IF scenarios: the same change is simulated in the sandbox and — after APPLY — built for real */
const WHATIF_DEFS = {
  highway: { icon: '🛣️', name: 'Build a new highway', desc: 'Upgrades the most congested corridor to highway / large road.' },
  metro: { icon: '🚇', name: 'Open a new metro line', desc: '4 metro stations on a new line.' },
  industry: { icon: '🏭', name: 'Industrial park', desc: '4 factories in industrial land.' },
  hospital: { icon: '🏥', name: 'Build a medical center', desc: '320 beds, 50 emergency beds.' },
  schools: { icon: '🎓', name: 'Education push', desc: '2 high schools and a college.' },
  parks: { icon: '🌳', name: 'Green belt', desc: '6 parks across the city.' },
  housing: { icon: '🏘️', name: 'Affordable housing', desc: '4 affordable housing blocks.' },
  power: { icon: '☀️', name: 'Clean power', desc: '3 solar plants.' },
  tourism: { icon: '🐠', name: 'Tourism package', desc: 'An aquarium and two hotels.' },
  taxdown: { icon: '💸', name: 'Cut taxes by 2%', desc: 'Lower tax, more growth, smaller budget.' },
  taxup: { icon: '🏛️', name: 'Raise taxes by 2%', desc: 'Higher tax, more budget, lower happiness.' }
};
const WHATIF_BUILD = { metro: ['metro', 4], industry: ['factory', 4], hospital: ['medicalcenter', 1], schools: ['highschool', 2, 'college', 1], parks: ['park', 6], housing: ['socialhousing', 4], power: ['solar', 3], tourism: ['aquarium', 1, 'hotel', 2] };
function whatIfSites(id) {
  const spec = WHATIF_BUILD[id]; if (!spec) return [];
  const sites = [], used = new Set(), r = unlockedRect();
  for (let s = 0; s < spec.length; s += 2) {
    const d = BUILDINGS[spec[s]]; let need = spec[s + 1];
    const step = MAP.W >= 96 ? 3 : 2;
    const cand = [];
    for (let y = r.y0; y <= r.y1 - d.h + 1; y += step) for (let x = r.x0; x <= r.x1 - d.w + 1; x += step) cand.push([x, y]);
    cand.sort(function (a, b) { return (landRel(b[0], b[1]) - landRel(a[0], a[1])) || (a[0] * 7 + a[1] * 13) % 17 - (b[0] * 7 + b[1] * 13) % 17; });
    for (let pass = 0; pass < 2 && need > 0; pass++) for (let k = 0; k < cand.length && need > 0; k++) {
      const x = cand[k][0], y = cand[k][1];
      let clash = false; for (let yy = y - 1; yy <= y + d.h && !clash; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) if (used.has(yy * MAP.W + xx)) { clash = true; break; }
      if (clash) continue;
      const st = siteCheck(d, x, y, pass === 1); if (!st) continue;
      for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) used.add(yy * MAP.W + xx);
      sites.push({ type: d.id, x: x, y: y, clear: st.clear.map(function (b) { return b.id; }), comp: siteClearCost(st) }); need--;
    }
  }
  return sites;
}
function highwayCorridor() {
  const cells = districtCells().filter(function (c) { return c.roads.length >= 4; }).sort(function (a, b) { return b.avgCong - a.avgCong; }).slice(0, 2);
  const tiles = []; cells.forEach(function (c) { c.roads.forEach(function (t) { if (MAP.roads[t] < 4 && MAP.nature[t] !== 2 && !isTunnel(t) && (MAP.cong ? MAP.cong[t] : 0) >= 0.2) tiles.push(t); }); });
  return tiles.slice(0, 60);
}
function whatIfCost(id, sites, tiles) {
  if (id === 'highway') return tiles.reduce(function (a, t) { const nt = Math.min(4, MAP.roads[t] + 2); return a + (ROAD_TYPES[nt].cost - ROAD_TYPES[MAP.roads[t]].cost) * 40 * costMult(); }, 0);
  const c = sites.reduce(function (a, s) { return a + buildCost(BUILDINGS[s.type]) + (s.comp || 0); }, 0);
  return c + (id === 'metro' ? 15000 * costMult() : 0);
}
/* Adds simulated buildings to the sandbox copy (operating, road-connected, with service coverage) */
function sandboxAdd(sites) {
  const added = [], gone = new Set(); sites.forEach(function (s) { (s.clear || []).forEach(function (id) { gone.add(id); }); });
  if (gone.size) S.buildings.list = S.buildings.list.filter(function (b) { return !gone.has(b.id); });
  sites.forEach(function (s) {
    const b = makeBuilding(s.type, s.x, s.y); b.owner = 'city'; b.built = true; b._road = true; b._entry = 0; b.cond = 100;
    if (!BUILDINGS[s.type].public) b.owner = 'player';
    S.buildings.list.push(b); added.push(b);
  });
  added.forEach(function (nb) {
    const d = bdef(nb); if (!d.service) return;
    const r = (d.cover || 6) * TILE, c = buildingCenter(nb);
    S.buildings.list.forEach(function (b) { const bd = bdef(b); const cx = (b.x + bd.w / 2) * TILE, cy = (b.y + bd.h / 2) * TILE; if ((cx - c.x) * (cx - c.x) + (cy - c.y) * (cy - c.y) <= r * r) { b._cov = b._cov || { fire: 0, police: 0, health: 0 }; b._cov[d.service] = 1; } });
  });
  if (added.some(function (b) { return bdef(b).service; })) { const tot = { fire: 0, police: 0, health: 0 }; let n = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.id === 'tree' || d.id === 'park') return; const w = d.w * d.h; n += w; if (b._cov) ['fire', 'police', 'health'].forEach(function (t) { if (b._cov[t]) tot[t] += w; }); }); ['fire', 'police', 'health'].forEach(function (t) { SIM.cov[t] = n ? tot[t] / n : 0; }); }
  return added;
}
function runWhatIf(id) {
  const D = WHATIF_DEFS[id]; if (!D) return null;
  const sites = whatIfSites(id), tiles = id === 'highway' ? highwayCorridor() : [];
  if (WHATIF_BUILD[id] && !sites.length) return (LAB.whatif = { id: id, error: 'No free, road-connected land for this scenario — zone or clear land first.' });
  if (id === 'highway' && !tiles.length) return (LAB.whatif = { id: id, error: 'No congested road corridor to upgrade.' });
  const cost = Math.round(whatIfCost(id, sites, tiles));
  const t0 = performance.now();
  const base = sandboxRun(null, SB_STEPS, SB_DT);
  const exp = sandboxRun(function () {
    if (id === 'highway') { let add = 0; tiles.forEach(function (t) { add += ROAD_TYPES[Math.min(4, MAP.roads[t] + 2)].cap - ROAD_TYPES[MAP.roads[t]].cap; }); MAP.roadCapSum += add; }
    else if (id === 'taxdown') S.city.tax = Math.max(0, S.city.tax - 2);
    else if (id === 'taxup') S.city.tax = Math.min(40, S.city.tax + 2);
    else sandboxAdd(sites);
    if (cost) S.budget = Math.max(0, S.budget - cost);
  }, SB_STEPS, SB_DT);
  LAB.whatif = Object.assign(compareRuns(base, exp), { id: id, cost: cost, sites: sites, tiles: tiles, ms: performance.now() - t0, at: gameDay() });
  return LAB.whatif;
}
function applyWhatIf() {
  const W = LAB.whatif; if (!W || W.error) return { ok: false, reason: 'Run a scenario first' };
  if (S.budget < W.cost) return { ok: false, reason: 'Needs ' + money(W.cost) + ' from the city budget (' + money(S.budget) + ')' };
  const id = W.id; let done = '';
  if (id === 'highway') { let n = 0; W.tiles.forEach(function (t) { if (MAP.roads[t] && MAP.roads[t] < 4 && MAP.nature[t] !== 2) { MAP.roads[t] = Math.min(4, MAP.roads[t] + 2); n++; } }); onMapChanged(); MAP.pathCache.clear(); done = n + ' road tiles upgraded'; }
  else if (id === 'taxdown') { S.city.tax = Math.max(0, S.city.tax - 2); done = 'tax ' + S.city.tax + '%'; }
  else if (id === 'taxup') { S.city.tax = Math.min(40, S.city.tax + 2); done = 'tax ' + S.city.tax + '%'; }
  else {
    let n = 0; const made = [];
    W.sites.forEach(function (s) { const d = BUILDINGS[s.type], st = siteCheck(d, s.x, s.y, true); if (!st) return; prepareSite(d, st, 'none'); const b = makeBuilding(s.type, s.x, s.y); b.owner = d.public ? 'city' : 'player'; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost); addBuildingToMap(b); made.push(b); n++; });
    onMapChanged();
    if (id === 'metro' && made.length >= 2) { const L = createTransitLine('metro', made.map(function (b) { return b.id; })); if (L) done = L.name + ' · '; }
    done += n + ' building(s) under construction';
    if (!n) return { ok: false, reason: 'The sites are no longer free — run the scenario again' };
  }
  S.budget -= W.cost;
  LAB.whatif = null;
  return { ok: true, msg: WHATIF_DEFS[id].name + ': ' + done + ' (' + money(W.cost) + ')' };
}

/* ===================================== CITY AI ASSISTANT ===================================== */
/* PROBLEM → CAUSE → OPTIONS (each a What-If scenario with a cost) → EXPECTED RESULT (computed on demand by the engine) */
function assistantProblems() {
  const c = S.city, out = [], H = SV.health, E = SV.edu;
  const add = function (sev, icon, problem, cause, options) { out.push({ sev: sev, icon: icon, problem: problem, cause: cause, options: options }); };
  if (SIM.traffic > 40) { const r = worstRegionCenter('traffic'); add(SIM.traffic, '🚦', 'Traffic congestion ' + Math.round(SIM.traffic) + '%', 'Car trips ' + fmt(Math.round(SIM.carTrips || 0)) + ' vs road capacity ' + fmt(MAP.roadCapSum || 0) + '; only ' + Math.round((SIM.riders || 0) / Math.max(1, SIM.trips || 1) * 100) + '% use transit' + (r ? '; worst region: ' + r.name + ' (' + Math.round(r.traffic) + '%)' : '') + '.', ['highway', 'metro']); }
  if (H && H.load > 0.95) add(H.load * 60, '🏥', 'Hospitals at ' + Math.round(H.load * 100) + '% capacity', Math.round(H.patients) + ' patients for ' + Math.round(H.beds) + ' effective beds; staff ' + Math.round(H.staff) + '/' + H.staffNeed + '; waiting ' + Math.round(H.wait) + ' min.', ['hospital']);
  if (E && c.population > 800 && E.cov[2] < 0.7) add((0.7 - E.cov[2]) * 100, '🎓', 'High-school coverage ' + Math.round(E.cov[2] * 100) + '%', Math.round(E.seats[2]) + ' high-school seats for ' + Math.round(E.dem[2]) + ' teenagers; skilled-job fit ' + Math.round(E.fit * 100) + '%.', ['schools']);
  if (SIM.unemployment > 0.08) add(SIM.unemployment * 300, '💼', 'Unemployment ' + Math.round(SIM.unemployment * 100) + '%', fmt(Math.round(SIM.labor - SIM.employed)) + ' workers without a job; ' + fmt(SIM.jobs) + ' jobs for ' + fmt(Math.round(SIM.labor)) + ' workers.', ['industry', 'taxdown']);
  if ((SIM.housingDemandRatio || 0) > 1.15) add((SIM.housingDemandRatio - 1) * 100, '🏘️', 'Housing shortage', 'Housing wish ' + Math.round(SIM.housingDemandRatio * 100) + '% of capacity; price ×' + c.housingPrice.toFixed(2) + '.', ['housing']);
  if ((SIM.powerRatio || 1) < 1) add((1 - SIM.powerRatio) * 200, '⚡', 'Power shortage ' + Math.round((1 - SIM.powerRatio) * 100) + '%', fmt(Math.round(SIM.powerUse)) + ' MW needed, ' + fmt(Math.round(SIM.powerGen)) + ' MW produced.', ['power']);
  if (c.pollution > 35) add(c.pollution, '🏭', 'Pollution ' + Math.round(c.pollution) + '%', 'Industry, traffic (' + Math.round(SIM.traffic) + '%) and waste; few parks.', ['parks', 'power']);
  if ((SIM.bNet || 0) < 0) add(40, '🏛️', 'City budget deficit ' + money(SIM.bNet) + '/s', 'Expenses ' + money(SIM.bExp || 0) + '/s exceed income ' + money(SIM.bInc || 0) + '/s at ' + c.tax + '% tax.', ['taxup']);
  if (c.tourismUnlocked && c.tourists < c.population * 0.05 && c.population > 2000) add(20, '🧳', 'Few tourists (' + fmt(Math.round(c.tourists)) + ')', 'Tourism value ' + fmt(attractionList().reduce(function (a, x) { return a + x.value; }, 0)) + '; reputation ' + Math.round(S.p10.rep) + '.', ['tourism']);
  return out.sort(function (a, b) { return b.sev - a.sev; });
}

/* ===================================== WORLD PRESETS 2.0, WORLD FACTORY & GENERATE MEGA WORLD ===================================== */
Object.assign(WORLD_PRESETS, {
  tinyisland: { name: '🏝 Tiny Island', desc: 'A small island city surrounded by sea — beaches and ferries.', cfg: { size: 'SMALL', mapType: 'islands', coast: 'islands', water: 1.6, tourism: 1.6, industry: 0.4, popDensity: 0.8 }, p10: true },
  coastalmega: { name: '🌊 Coastal Megacity', desc: 'A dense megacity along the coast with a mega port and airport.', cfg: { size: 'MEGA', coast: 'side', water: 1.2, popDensity: 1.6, buildingDensity: 1.5, roadDensity: 1.2, infrastructure: 'advanced', tourism: 1.4, finance: 1.4 }, p10: true },
  mountainempire: { name: '⛰ Mountain Empire', desc: 'Peaks, mines and valley towns connected by tunnels.', cfg: { size: 'HUGE', mapType: 'mountains', mountains: 2.2, industry: 1.5, resources: 1.8, popDensity: 0.9 }, p10: true },
  desertmetro: { name: '🏜 Desert Metropolis', desc: 'A hot, dry metropolis — water is precious.', cfg: { size: 'HUGE', climate: 'arid', weather: 'heatwave', water: 0.4, rivers: 0.5, forest: 0.2, popDensity: 1.3, mapType: 'plains', infrastructure: 'advanced' }, p10: true },
  greenutopia: { name: '🌿 Green Utopia', desc: 'Forests, lakes, clean energy and little traffic.', cfg: { forest: 2, industry: 0.3, tourism: 1.4, infrastructure: 'green', mapType: 'lakes', popDensity: 0.9, traffic: 0.6 }, p10: true },
  industrialgiant: { name: '🏭 Industrial Giant', desc: 'Mines, smelters and factories with full supply chains.', cfg: { size: 'HUGE', industry: 2.6, resources: 2, tourism: 0.3, finance: 0.7 }, p10: true },
  techcapital: { name: '💻 Tech Capital', desc: 'Tech campuses, data centers, universities and metro.', cfg: { size: 'HUGE', tech: 2.6, finance: 1.6, infrastructure: 'advanced', industry: 0.6 }, p10: true },
  tourismparadise: { name: '🏖 Tourism Paradise', desc: 'Resorts, attractions and a waterfront for visitors.', cfg: { tourism: 2.8, water: 1.5, coast: 'side', mapType: 'lakes', industry: 0.4 }, p10: true },
  winterworld: { name: '❄ Winter World', desc: 'Snowy mountains, forests and cosy towns.', cfg: { climate: 'cold', weather: 'snow', forest: 1.4, mountains: 1.3, size: 'LARGE' }, p10: true },
  rivervalley: { name: '🏞 River Valley', desc: 'Wide rivers, bridges and fertile farmland.', cfg: { mapType: 'river', rivers: 2.5, water: 1.3, forest: 1.2 }, p10: true },
  densemega: { name: '🌆 Dense Megacity', desc: 'Skyscrapers wall to wall, dense streets and metro.', cfg: { size: 'MEGA', popDensity: 2.2, buildingDensity: 1.9, roadDensity: 1.4, forest: 0.3, infrastructure: 'advanced' }, p10: true },
  archipelago: { name: '🏝 Archipelago', desc: 'Many islands linked by bridges and ferries.', cfg: { size: 'MEGA', mapType: 'islands', coast: 'islands', water: 2.2, tourism: 1.6 }, p10: true },
  megacontinent: { name: '🌐 Mega Continent', desc: 'The largest landmass: a GIGA world with every system.', cfg: { size: 'GIGA', mapType: 'standard', popDensity: 1.2, roadDensity: 1.1, infrastructure: 'advanced' }, p10: true }
});
const P10_PRESETS = Object.keys(WORLD_PRESETS).filter(function (k) { return WORLD_PRESETS[k].p10; });
const FACTORY_DEFAULT = { name: 'Mega Metropolis', seed: '', preset: 'coastalmega', size: 'MEGA', mapType: 'standard', climate: 'temperate', popDensity: 1.3, economy: 1, industry: 1, tourism: 1, traffic: 1, resources: 1, infrastructure: 'advanced', disasters: 1, tech: 1.2, coast: 'side' };
/* The 22 steps of GENERATE MEGA WORLD. Each step runs real generator stages (existing ones + the Part 10 ones). */
const MEGA_STAGES = [
  ['terrain', 'Terrain', ['terrain']], ['water', 'Water', ['water']], ['climate', 'Climate', ['mg_climate']], ['resources', 'Resources', ['mg_resources']], ['regions', 'Regions', ['mg_regions']],
  ['roads', 'Roads', ['roads']], ['districts', 'Districts & zoning', ['districts', 'zoning']], ['utilities', 'Utilities', ['utilities']], ['railways', 'Railways', ['mg_railways']], ['buildings', 'Buildings', ['buildings']],
  ['companies', 'Companies', ['businesses', 'mg_companies']], ['citizens', 'Citizens', ['citizens']], ['jobs', 'Jobs', ['jobs']], ['economy', 'Economy', ['economy']], ['tourism', 'Tourism', ['mg_tourism']],
  ['transport', 'Public transport', ['transport', 'mg_transit']], ['services', 'Emergency services', ['services']], ['traffic', 'Traffic', ['traffic']], ['environment', 'Environment', ['ai', 'mg_environment']],
  ['validate', 'Validation', ['validate']], ['fix', 'Auto fix', ['fix', 'mg_score']], ['start', 'Start', ['start']]
];
const MEGA_RUN = {
  mg_climate: async function (ctx, cfg) { applyClimate(cfg); if (S.p9) { S.p9.weather.type = FX.weather; S.p9.env.wind.dir = ctx.rnd() * 6.28; S.p9.env.wind.speed = 0.08 + ctx.rnd() * 0.2; } await ctx.tick('climate', 1); },
  mg_resources: async function (ctx, cfg) {
    const extra = Math.round(Math.max(0, (cfg.resources || 1) - 1) * MAP.W / 8), types = Object.keys(RESOURCE_TYPES);
    for (let k = 0; k < extra && S.economy.deposits.length < 88; k++) {
      const x = 2 + Math.floor(ctx.rnd() * (MAP.W - 4)), y = 2 + Math.floor(ctx.rnd() * (MAP.H - 4)), i = idx(x, y);
      if (MAP.terrain[i] === TERRAIN.WATER || MAP.nature[i] === 2 || MAP.occ[i] || MAP.roads[i]) continue;
      const type = types[Math.floor(ctx.rnd() * types.length)], R = RESOURCE_TYPES[type], amt = Math.round(R.min + (R.max - R.min) * ctx.rnd());
      const di = S.economy.deposits.length;
      S.economy.deposits.push({ type: type, amount: amt, max: amt, cx: x, cy: y });
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inMap(xx, yy) && MAP.terrain[idx(xx, yy)] !== TERRAIN.WATER && !MAP.occ[idx(xx, yy)] && !MAP.roads[idx(xx, yy)]) MAP.res[idx(xx, yy)] = di + 1;
    }
    await ctx.tick('resources', 1);
  },
  mg_regions: async function (ctx, cfg) { if (S.p9) { S.p9.neighbors = newNeighbors(cfg.seed); } weEnsure(); await ctx.tick('regions', 1); },
  mg_railways: async function (ctx, cfg) {
    const W = MAP.W; if (W < 52 && cfg.infrastructure !== 'advanced') { await ctx.tick('railways', 1); return; }
    wgUnlockTech('metro'); wgUnlockTech('rail');
    const n = Math.max(1, Math.round(W / 40));
    for (let k = 0; k < n; k++) wgPlaceAnywhere(ctx, 'trainstation', { districts: ['DOWNTOWN', 'COMMERCIAL', 'INDUSTRIAL', 'RESIDENTIAL'], nearRoadType: 3, spread: 16 });
    if ((cfg.industry || 1) >= 1 || W >= 80) wgPlaceAnywhere(ctx, 'railhub', { districts: ['INDUSTRIAL'], nearRoadType: 2 });
    await ctx.tick('railways', 1);
  },
  mg_companies: async function (ctx, cfg) {
    if (S.p10) {
      const pop = ctx.plan.pop || 0, want = pop > 30000 ? 3 : pop > 8000 ? 2 : pop > 2500 ? 1 : 0;
      const secs = ['SHOPPING', 'TECHNOLOGY', 'FOOD'];
      const keep = Math.random; Math.random = ctx.rnd;
      try { for (let k = 0; k < want; k++) lwFoundCompany(secs[k % secs.length], true); } finally { Math.random = keep; }
    }
    await ctx.tick('companies', 1);
  },
  mg_tourism: async function (ctx, cfg) {
    const t = cfg.tourism || 1, W = MAP.W, n = Math.round(t * W / 32);
    if (S.city.population >= 1500 || t >= 1.5) S.city.tourismUnlocked = true;
    const pool = ['museum', 'historic', 'aquarium', 'obstower', 'convention', 'monument', 'stadium'];
    for (let k = 0; k < n; k++) wgPlaceAnywhere(ctx, pool[k % pool.length], { districts: ['TOURISM', 'DOWNTOWN', 'ENTERTAINMENT', 'COMMERCIAL'] });
    if (t >= 1.3) { wgPlaceAnywhere(ctx, 'beachresort', {}); if (MAP.sea.some(function (v) { return v; })) wgPlaceAnywhere(ctx, 'cruiseterminal', { clearLocal: true }); }
    for (let k = 0; k < Math.max(1, n); k++) wgPlaceAnywhere(ctx, 'hotel', { districts: ['TOURISM', 'DOWNTOWN', 'COMMERCIAL'] });
    onMapChanged(); econTick(1);
    await ctx.tick('tourism', 1);
  },
  mg_transit: async function (ctx) {
    if (S.p9) { ['metro', 'bus', 'tram'].forEach(function (m) { if (transitStops(m).length >= 2 && !S.p9.transit.lines.some(function (L) { return L.mode === m; })) createTransitLine(m); }); }
    if (airportOperating() || S.buildings.list.some(function (b) { return b.type === 'airport'; })) buildAirportTerminal('city');
    if (MAP.W >= 64) for (let k = 0; k < Math.round(MAP.W / 48); k++) wgPlaceAnywhere(ctx, 'distcenter', { districts: ['INDUSTRIAL', 'COMMERCIAL'] });
    await ctx.tick('transport', 1);
  },
  mg_environment: async function (ctx) { if (S.p9) { envReset(); envTick(true); propTick(true); } if (S.p10) { SV.edu = educationPass(); SV.health = healthPass(0); } await ctx.tick('environment', 1); },
  mg_score: async function (ctx) { const r = generationScoreFix(); ctx.p10score = r; if (r.fixed.length) ctx.fixLog = (ctx.fixLog || []).concat(r.fixed); ctx.report = validateWorld(); await ctx.tick('fix', 1); }
};
/* Extra services every generated world gets (high schools, colleges, clinics) — also used by the classic generator */
function p10WorldgenServices() { if (!S.p10) return ''; return p10UpgradeServices(true); }
async function generateMegaWorld(presetId, overrides) {
  const cfg = Object.assign({}, overrides || {}, { mega: true });
  const res = await generateWorld(presetId || 'coastalmega', cfg);
  if (res && S.p10) { S.p10.genScore = res.p10score || generationScore(); S.p10.factory = Object.assign({}, overrides || {}, { preset: presetId }); }
  return res;
}

/* ===================================== WORLD GENERATION SCORE ===================================== */
const SCORE_CATS = [['quality', '🏆', 'Quality'], ['roads', '🛣️', 'Road connectivity'], ['utilities', '⚡', 'Utility coverage'], ['housing', '🏠', 'Housing'], ['jobs', '💼', 'Jobs'], ['healthcare', '🏥', 'Healthcare'], ['education', '🎓', 'Education'], ['economy', '💰', 'Economy'], ['traffic', '🚦', 'Traffic'], ['emergency', '🚨', 'Emergency coverage']];
function generationScore() {
  const v = validateWorld(), pop = S.city.population;
  SV.edu = educationPass(); SV.health = healthPass(0);
  const s = {
    quality: Math.round(v.checks ? v.checks.filter(function (c) { return c.ok; }).length / v.checks.length * 100 : (v.liveable ? 100 : 60)),
    roads: Math.round(mainCompShare() * 100),
    utilities: Math.round(Math.min(SIM.powerRatio || 0, SIM.waterRatio || 0) * 70 + (S.p9 ? (1 - (SEWER.overload || 0)) * 15 + (1 - (WNET.low || 0)) * 15 : 30)),
    housing: Math.round(clamp((SIM.housingCap || 0) / Math.max(1, pop * 1.02), 0, 1) * 100),
    jobs: Math.round(clamp(1 - (SIM.unemployment || 0) * 3, 0, 1) * 100),
    healthcare: Math.round(svHealthIndex() * 100),
    education: Math.round(clamp((SV.edu.cov[1] * 0.4 + SV.edu.cov[2] * 0.35 + Math.max(SV.edu.cov[3], SV.edu.cov[4]) * 0.25), 0, 1) * 100),
    economy: Math.round(clamp(50 + ((SIM.bNet || 0) > 0 ? 25 : -25) + ((SIM.pNet || 0) > 0 ? 25 : 0), 0, 100)),
    traffic: Math.round(clamp(100 - (SIM.traffic || 0) * 1.2, 0, 100)),
    emergency: Math.round(((SIM.cov.fire || 0) + (SIM.cov.police || 0) + (SIM.cov.health || 0)) / 3 * 100)
  };
  let tot = 0; SCORE_CATS.forEach(function (c) { tot += s[c[0]]; });
  return { cats: s, overall: Math.round(tot / SCORE_CATS.length), at: gameDay() };
}
/* Score the world; anything under 70 triggers the matching AUTO FIX, then the world is scored again */
function generationScoreFix() {
  onMapChanged(); econTick(1);
  const before = generationScore(), fixed = [];
  const low = SCORE_CATS.filter(function (c) { return before.cats[c[0]] < 70; }).map(function (c) { return c[0]; });
  if (low.length) {
    const r = fixWorld(true); r.actions.forEach(function (a) { if (a.indexOf('Nothing to fix') < 0) fixed.push(a); });
    if (low.indexOf('utilities') >= 0 && S.p9) { const u = buildAllUtilities(); if (u.length) fixed.push('⚡ Utilities: ' + u.join(', ')); }
    if (low.indexOf('healthcare') >= 0 || low.indexOf('education') >= 0) { const s = p10UpgradeServices(true); if (s) fixed.push('🎓 Services: ' + s); }
    if (low.indexOf('emergency') >= 0) { ['fire', 'police', 'health'].forEach(function (t) { wgFixCoverage(t); }); fixed.push('🚨 Emergency coverage completed'); }
    if (low.indexOf('traffic') >= 0 && S.p9) fixed.push('🚦 ' + fixTraffic());
    if (low.indexOf('economy') >= 0) fixed.push('💹 ' + fixEconomy());
    onMapChanged(); econTick(1);
  }
  const after = generationScore();
  after.before = before.overall; after.fixed = fixed;
  return after;
}
