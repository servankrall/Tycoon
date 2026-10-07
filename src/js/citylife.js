'use strict';
/* BLOCK CITY TYCOON — CITY LIFE (Part 9): households, property market, construction projects, building maintenance
   • HOUSEHOLDS — citizens live in households (home, members, income, expenses, workplaces, transport, needs,
     satisfaction). Agent citizens are grouped by home; city-wide statistics scale them to the whole population.
   • PROPERTY MARKET — every tile has a land value driven by transport, services, safety, environment, education,
     job access, tourism and land demand. Land value changes rents, building values (property tax = company cost),
     land prices and where developers invest.
   • CONSTRUCTION 2.0 — buildings are construction projects with a budget, a crew and materials (steel, concrete,
     glass) that move through FOUNDATION → STRUCTURE → FACADE → INTERIOR → COMPLETE. Missing workers or materials slow
     the project down (materials are bought on the import market when the city has none). INSTANT BUILD skips it.
   • MAINTENANCE — buildings have a CONDITION (Excellent → Critical). Without maintenance they lose efficiency, value
     and service quality and break down more often; maintenance companies send crews from their depots. */

/* ===================================== PROPERTY MARKET ===================================== */
const PROP = { grid: null, at: -99, avg: 0, index: 100, base: 0, history: [], factors: null };
function propReset() { PROP.grid = null; PROP.at = -99; PROP.history = []; }
function propReady() { return !!(PROP.grid && PROP.grid.length === MAP.W * MAP.H); }
function propTick(force) {
  if (!S.p9 || !MAP.roads) return;
  if (!force && propReady() && ((S.clock.runSec - PROP.at < 10 && PROP.at <= S.clock.runSec) || performance.now() - (PROP.realAt || 0) < 2000)) return;   // sim-time AND real-time throttle (fast speeds)
  PROP.at = S.clock.runSec; PROP.realAt = performance.now();
  const W = MAP.W, H = MAP.H, N = W * H, g = new Float32Array(N);
  const svc = function (t) { return covGrid(function (b) { return BUILDINGS[b.type].service === t && b._road; }, function (b) { return coverRadius(b); }); };
  const fire = svc('fire'), pol = svc('police'), hlth = svc('health');
  const edu = covGrid(function (b) { return BUILDINGS[b.type].edu > 0 && b._op; }, function (b) { return BUILDINGS[b.type].eduHigh ? 10 : 6; });
  const park = covGrid(function (b) { return BUILDINGS[b.type].hap > 0 || b.type === 'park' || b.type === 'plaza'; }, function () { return 4; });
  const transit = covGrid(function (b) { return BUILDINGS[b.type].transit > 0 && b.built; }, function (b) { return b.type === 'metro' || b.type === 'trainstation' ? 8 : 5; });
  const tour = covGrid(function (b) { return BUILDINGS[b.type].tour > 0 && b._op; }, function () { return 6; });
  const jobs = covGrid(function (b) { return (b.workers || 0) > 20 && b._op; }, function () { return 9; }, function (b) { return clamp(b.workers / 150, 0.2, 1); });
  // distance to the nearest road (bigger roads are worth more) — two-pass chamfer
  const rd = new Float32Array(N).fill(99), rq = new Float32Array(N);
  for (let i = 0; i < N; i++) if (MAP.roads[i]) { rd[i] = 0; rq[i] = MAP.roads[i]; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x > 0 && rd[i - 1] + 1 < rd[i]) { rd[i] = rd[i - 1] + 1; rq[i] = rq[i - 1]; } if (y > 0 && rd[i - W] + 1 < rd[i]) { rd[i] = rd[i - W] + 1; rq[i] = rq[i - W]; } }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1 && rd[i + 1] + 1 < rd[i]) { rd[i] = rd[i + 1] + 1; rq[i] = rq[i + 1]; } if (y < H - 1 && rd[i + W] + 1 < rd[i]) { rd[i] = rd[i + W] + 1; rq[i] = rq[i + W]; } }
  const air = envReady() ? ENV.air : null, noise = envReady() ? ENV.noise : null;
  const demand = clamp(0.75 + 0.35 * (SIM.housingDemandRatio || 1) + (S.city.reputation - 50) / 200 + (0.05 - interestRate()) * 2, 0.6, 1.6);
  const crime = S.city.crime / 100, base = 40 * costMult() * priceLevel();
  const brush = S.p9.prop.brush;
  let sum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    if (MAP.nature[i] === 2) { g[i] = 0; continue; }
    const x = i % W, y = (i / W) | 0;
    let f = 1;
    f *= rd[i] <= 1 ? 1 + 0.06 * (rq[i] - 1) : clamp(1.1 - rd[i] * 0.12, 0.45, 1);          // access & road class
    f *= 1 + transit[i] * 0.22;                                                              // transport
    f *= 1 + (fire[i] + hlth[i]) * 0.07 + pol[i] * 0.06;                                     // services
    f *= 1 - crime * (1 - pol[i] * 0.6) * 0.35;                                              // safety
    f *= 1 + park[i] * 0.15 - (air ? air[i] * 0.4 : 0) - (noise ? noise[i] * 0.18 : 0);      // environment
    if (isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1) || isWater(x + 2, y) || isWater(x, y + 2)) f *= 1.12;
    f *= 1 + edu[i] * 0.1;                                                                   // education
    f *= 1 + jobs[i] * 0.2;                                                                  // job opportunities
    f *= 1 + tour[i] * 0.1;                                                                  // tourism
    if (MAP.terrain[i] === TERRAIN.ROCK) f *= 0.6; else if (MAP.terrain[i] === TERRAIN.HILL) f *= 1.04;
    if (!inUnlocked(x, y)) f *= 0.5;
    let v = base * f * demand;
    if (brush[i]) v *= clamp(1 + brush[i], 0.2, 4);
    g[i] = Math.max(0, v);
    if (MAP.occ[i] || MAP.zone[i]) { sum += g[i]; n++; }
  }
  PROP.grid = g; PROP.avg = n ? sum / n : base; PROP.base = base;
  PROP.index = Math.round(PROP.avg / Math.max(1e-6, base) * 100);
  PROP.factors = { demand: demand, crime: crime, base: base };
  PROP.history.push(Math.round(PROP.avg)); if (PROP.history.length > 60) PROP.history.shift();
  // per-building land factor (relative to the city average)
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); let s2 = 0, k = 0;
    for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) { s2 += g[idx(x, y)]; k++; }
    b._lvF = clamp(k ? s2 / k / Math.max(1e-6, PROP.avg) : 1, 0.5, 2);
  });
}
function landValueTile(x, y) { return propReady() && inMap(x, y) ? PROP.grid[idx(x, y)] : 40 * costMult(); }
function landPriceFor(x, y, d) { if (!propReady()) return d.w * d.h * 20 * costMult(); let s = 0; for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) s += landValueTile(xx, yy); return s * 0.5; }
function rentMult(b) { return S.p9 ? (0.7 + 0.3 * (b._lvF || 1)) * (b.u && b.u.appearance ? 1 + 0.04 * b.u.appearance : 1) : 1; }
function propertyValueMult(b) { return S.p9 ? (0.6 + 0.4 * (b._lvF || 1)) * (0.5 + 0.5 * (b.cond === undefined ? 100 : b.cond) / 100) : 1; }
function propBrush(i, delta) { const b = S.p9.prop.brush; b[i] = clamp((b[i] || 0) + delta, -0.8, 3); if (Math.abs(b[i]) < 0.01) delete b[i]; const keys = Object.keys(b); if (keys.length > 6000) delete b[keys[0]]; }

/* ===================================== HOUSEHOLDS ===================================== */
const HH = { list: [], at: -99, stats: null };
function householdsTick(force) {
  if (!S.p9) return;
  if (!force && ((S.clock.runSec - HH.at < 6 && HH.at <= S.clock.runSec) || performance.now() - (HH.realAt || 0) < 1000)) return;
  HH.at = S.clock.runSec; HH.realAt = performance.now();
  const byHome = new Map();
  AG.citizens.forEach(function (c) { if (c.tourist || !c.home) return; let a = byHome.get(c.home); if (!a) { a = []; byHome.set(c.home, a); } a.push(c); });
  const list = [], scale = AG.citizens.length ? Math.max(1, S.city.population / Math.max(1, AG.citizens.filter(function (c) { return !c.tourist; }).length)) : 1;
  const act = { work: 0, shopping: 0, school: 0, park: 0, fun: 0, home: 0, commuting: 0, transit: 0 };
  let id = 1;
  byHome.forEach(function (cs, home) {
    const b = MAP.byId.get(home); if (!b) return;
    const d = BUILDINGS[b.type];
    for (let k = 0; k < cs.length; k += 4) {
      const m = cs.slice(k, k + 4);
      let inc = 0, cars = 0, transitUse = 0, needs = { food: 0, fun: 0, shopping: 0, energy: 0, work: 0 }, hap = 0;
      const work = [];
      m.forEach(function (c) {
        const j = citizenJob(c); inc += j.income || 0;
        if (c.work) work.push(c.work);
        if (c.car) cars++;
        if (c.transit) transitUse++;
        needs.food += c.needs.food; needs.fun += c.needs.fun; needs.shopping += c.needs.shopping; needs.energy += c.energy; needs.work += c.needs.work; hap += c.happiness || 50;
        const st = c.transit ? (c.transit.phase === 'ride' ? 'transit' : 'commuting') : c.driving ? 'commuting' : c.inside ? ({ GO_WORK: 'work', GO_SHOPPING: 'shopping', GO_RESTAURANT: 'shopping', GO_SCHOOL: 'school', GO_ENTERTAINMENT: 'fun', GO_PARK: 'park' }[c.state] || 'home') : c.parkUntil ? 'park' : c.path ? 'commuting' : 'home';
        act[st]++;
      });
      const sz = m.length;
      Object.keys(needs).forEach(function (q) { needs[q] /= sz; });
      const rent = (d.rent || 0.06) * S.city.housingPrice * rentMult(b) * (d.unitSize || 3) * SECONDS_PER_MONTH / 30 * 0.6;
      const food = sz * 2.2 * priceLevel(), transport = (cars ? cars * 3.1 : 0) + transitUse * 1.2 + (sz - cars) * 0.6, utilities = (b._powered ? 1.4 : 0.6) * sz + (d.water < 0 ? 0.8 : 0.3) * sz;
      const exp = rent + food + transport + utilities;
      const balance = inc > 0 ? (inc - exp) / Math.max(1, inc) : -1;
      const sat = clamp(hap / sz * 0.6 + (needs.food + needs.fun + needs.shopping) / 3 * 0.2 + clamp(50 + balance * 60, 0, 100) * 0.2, 0, 100);
      list.push({ id: id++, home: home, members: m.map(function (c) { return c.id; }), size: sz, income: inc, expenses: exp, rent: rent, workplaces: work, transport: cars ? 'car' : transitUse ? 'transit' : 'walk', needs: needs, satisfaction: sat, district: districtName(b.x, b.y) });
    }
  });
  HH.list = list;
  const tot = list.length || 1;
  const avg = function (f) { return list.reduce(function (a, h) { return a + f(h); }, 0) / tot; };
  HH.stats = {
    agents: list.length, total: Math.round(S.city.population / 2.6), avgSize: 2.6, scale: scale,
    income: avg(function (h) { return h.income; }), expenses: avg(function (h) { return h.expenses; }), rentShare: avg(function (h) { return h.income > 0 ? h.rent / h.income : 1; }),
    car: avg(function (h) { return h.transport === 'car' ? 1 : 0; }), transit: avg(function (h) { return h.transport === 'transit' ? 1 : 0; }), walk: avg(function (h) { return h.transport === 'walk' ? 1 : 0; }),
    satisfaction: avg(function (h) { return h.satisfaction; }), struggling: list.filter(function (h) { return h.expenses > h.income; }).length / tot, activity: act
  };
  S.p9.households = list.slice(0, 400).map(function (h) { return { home: h.home, size: h.size, inc: Math.round(h.income), exp: Math.round(h.expenses), t: h.transport, sat: Math.round(h.satisfaction) }; });
}
function householdOf(c) { return HH.list.find(function (h) { return h.members.indexOf(c.id) >= 0; }) || null; }

/* ===================================== CONSTRUCTION 2.0 ===================================== */
const CONSTRUCTION_PHASES = [['foundation', 'Foundation', 0.2], ['structure', 'Structure', 0.55], ['facade', 'Facade', 0.8], ['interior', 'Interior', 1]];
const MATERIAL_ITEMS = { steel: 'metal', concrete: 'materials', glass: 'materials' };
function constructionPlan(d) {
  const c = d.cost;
  return { w: Math.round(clamp(Math.sqrt(c) * 0.48, 2, 600)), m: { steel: Math.round(c * 0.00089), concrete: Math.round(c * 0.00133), glass: Math.round(c * 0.00044) }, u: { steel: 0, concrete: 0, glass: 0 }, wait: '', bought: 0 };
}
function constructionScale(d) { return clamp(1 + d.cost / 250000, 1, 6); }
function constructionPhase(b) { const p = b.progress || 0; for (let i = 0; i < CONSTRUCTION_PHASES.length; i++) if (p < CONSTRUCTION_PHASES[i][2]) return CONSTRUCTION_PHASES[i]; return ['complete', 'Complete', 1]; }
/* Called by constructionTick for every project: materials + workers decide how fast it progresses */
function constructionFactor(b, dt) {
  const cp = b.cp; if (!cp || !S.p9 || S.p9.freeze.buildings) return S.p9 && S.p9.freeze.buildings ? 0 : 1;
  const d = BUILDINGS[b.type];
  // materials needed for the progress of this tick
  const dp = dt / Math.max(0.2, b.buildTime);
  let short = '';
  Object.keys(cp.m).forEach(function (k) {
    const need = Math.min(cp.m[k] - cp.u[k], cp.m[k] * dp); if (need <= 0) return;
    const item = MATERIAL_ITEMS[k], inv = S.economy.inventory;
    if (inv[item] !== undefined && inv[item] >= need) { inv[item] -= need; cp.u[k] += need; return; }
    const payer = d.public ? 'budget' : (isAI(b) ? null : 'player');
    const price = (S.economy.prices[item] || 2) * 1.2 * need;
    if (payer && funds(payer) >= price) { spend(payer, price); cp.u[k] += need; cp.bought += price; return; }
    if (!payer && S.ai[b.owner] && S.ai[b.owner].cash >= price) { S.ai[b.owner].cash -= price; cp.u[k] += need; return; }
    short = k;
  });
  cp.wait = short ? 'Waiting for ' + short : '';
  const crew = SIM.p9Crew || 1;
  return (short ? 0.2 : 1) * crew;
}
/* Construction crews come from free labour (unemployed + 15% contractors) */
function constructionLabourTick() {
  if (!S.p9) return;
  let need = 0; S.buildings.list.forEach(function (b) { if (!b.built && b.cp) need += b.cp.w; });
  const avail = Math.max(0, (SIM.labor || 0) - (SIM.employed || 0)) + (SIM.labor || 0) * 0.15 + 30;
  SIM.p9CrewNeed = need; SIM.p9CrewAvail = avail;
  SIM.p9Crew = need > 0 ? clamp(avail / need, 0.35, 1) : 1;
}
function constructionProjects() {
  return S.buildings.list.filter(function (b) { return !b.built; }).map(function (b) {
    const d = BUILDINGS[b.type], ph = constructionPhase(b), cp = b.cp;
    const eta = (1 - b.progress) * b.buildTime / Math.max(0.05, (SIM.p9Crew || 1) * (cp && cp.wait ? 0.2 : 1));
    return { b: b, name: d.name, icon: d.icon, cost: buildCost(d), phase: ph[1], progress: b.progress, workers: cp ? cp.w : 0, materials: cp ? cp.m : null, used: cp ? cp.u : null, wait: cp ? cp.wait : '', etaGame: eta * TIME_SCALE, owner: ownerName(b) };
  });
}
function fmtGameDuration(gsec) { const d = Math.floor(gsec / 86400), h = Math.floor((gsec % 86400) / 3600), m = Math.floor((gsec % 3600) / 60); return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm'; }
/* Phase-aware construction site renderer */
function drawConstructionSite(b, d, x0, y0, w, h) {
  const p = b.progress, ph = constructionPhase(b)[0], H = buildingHeight(b) * Math.max(0.12, p);
  ctx.fillStyle = '#8d8d99'; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
  if (ph === 'foundation') {
    ctx.fillStyle = '#adb5bd'; ctx.fillRect(x0 + 3, y0 + 3, (w - 6) * Math.min(1, p / 0.2), h - 6);
    ctx.strokeStyle = '#6c757d'; ctx.lineWidth = 1; for (let k = x0 + 5; k < x0 + w - 3; k += 5) { ctx.beginPath(); ctx.moveTo(k, y0 + 4); ctx.lineTo(k, y0 + h - 4); ctx.stroke(); }
  } else {
    const top = y0 + h - H;
    if (ph === 'structure') {
      ctx.strokeStyle = '#495057'; ctx.lineWidth = 1.5;
      for (let k = 0; k <= 3; k++) { const xx = x0 + 2 + k * (w - 4) / 3; ctx.beginPath(); ctx.moveTo(xx, y0 + h); ctx.lineTo(xx, top); ctx.stroke(); }
      for (let yy = y0 + h; yy > top; yy -= 7) { ctx.beginPath(); ctx.moveTo(x0 + 2, yy); ctx.lineTo(x0 + w - 2, yy); ctx.stroke(); }
    } else {
      const wallH = ph === 'facade' ? H * clamp((p - 0.55) / 0.25, 0.15, 1) : H;
      ctx.fillStyle = shade(d.color, ph === 'interior' ? -5 : -20); ctx.fillRect(x0 + 2, y0 + h - wallH - 2, w - 4, wallH);
      ctx.strokeStyle = '#495057'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 2, top, w - 4, H);
      if (ph === 'interior') { ctx.fillStyle = 'rgba(255,230,150,.6)'; for (let yy = y0 + h - 8; yy > top + 4; yy -= 8) for (let xx = x0 + 5; xx < x0 + w - 6; xx += 7) ctx.fillRect(xx, yy, 3, 3); }
      ctx.strokeStyle = '#f4a261'; for (let yy = y0 + h; yy > top; yy -= 6) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + 3, yy); ctx.stroke(); }
    }
  }
  const topY = y0 + h - Math.max(H, 8) - 4;
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 + w - 3, y0 + h); ctx.lineTo(x0 + w - 3, topY - 14); ctx.lineTo(x0 - 6, topY - 14); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 4, topY - 14); ctx.lineTo(x0 + 4, topY - 14 + 8 + Math.sin(FX.time * 3) * 3); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0, y0 - 8 - Math.max(H, 8), w, 4);
  ctx.fillStyle = b.cp && b.cp.wait ? '#ffd166' : '#06d6a0'; ctx.fillRect(x0, y0 - 8 - Math.max(H, 8), w * p, 4);
  if (CAM.zoom > 0.9) { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(constructionPhase(b)[1].toUpperCase() + (b.cp && b.cp.wait ? ' ⏳' : ''), x0 + w / 2, y0 - 12 - Math.max(H, 8)); }
}

/* ===================================== BUILDING MAINTENANCE ===================================== */
const MAINT_COMPANIES = ['Block Maintenance Co.', 'FixIt Crew', 'Urban Care Services', 'Pro Facility Group', 'Metro Repair Works', 'Skyline Upkeep'];
function condLabel(c) { return c >= 90 ? 'Excellent' : c >= 70 ? 'Good' : c >= 50 ? 'Worn' : c >= 30 ? 'Poor' : 'Critical'; }
function condColor(c) { return c >= 70 ? '#06d6a0' : c >= 50 ? '#ffd166' : c >= 30 ? '#f8961e' : '#ef476f'; }
function condMult(b) { const c = b.cond === undefined ? 100 : b.cond; return c >= 60 ? 1 : c >= 40 ? 0.9 : c >= 20 ? 0.75 : 0.55; }
function contractorOf(b) { return MAINT_COMPANIES[b.id % MAINT_COMPANIES.length]; }
const MAINT = { acc: 0 };
function maintenanceTick(dt) {
  if (!S.p9) return;
  const M = S.p9.maint, frozen = S.p9.freeze.buildings;
  if (!frozen) {
    const storm = FX.weather === 'storm' || FX.weather === 'heavyrain' || FX.weather === 'coldwave';
    const fund = clamp(M.budget, 0, 2), base = 25 / 9600 * (1.5 - 0.5 * fund);
    S.buildings.list.forEach(function (b) {
      if (!b.built || b.type === 'tree') return;
      if (b.cond === undefined) b.cond = 100;
      const d = BUILDINGS[b.type];
      let r = base * (d.cat === 'Industry' || d.cat === 'Resources' ? 1.5 : d.cat === 'Utilities' ? 1.25 : 1) * (storm ? 2 : 1) * (1 + (envReady() ? ENV.air[idx(b.x, b.y)] * 0.5 : 0)) * (b._gridOver ? 1.5 : 1) * (S.p10 ? p10DecayMult(b) : 1);   // Part 10: maintenance budget per network, age, upgrades
      b.cond = Math.max(0, b.cond - r * dt);
      if (b.cond < 40 && !b.damaged && RNG.next() < (40 - b.cond) / 40 * 0.0004 * dt * (S.p10 ? 1.6 - 0.6 * S.p10.maint[maintCat(d)] : 1)) { damageBuilding(b); M.failures++; if (b.owner !== 'city' && !isAI(b)) toast('🔧 ' + d.name + ' broke down (condition ' + Math.round(b.cond) + '%) — maintenance needed', 'bad'); }
    });
    // maintenance budget (city): scales with the number of buildings
    S.budget = Math.max(0, S.budget - fund * 0.0015 * S.buildings.list.length * dt);
  }
  MAINT.acc += dt; if (MAINT.acc < 4) return; MAINT.acc = 0;
  const depots = S.buildings.list.filter(function (b) { return (b.type === 'maintdepot' || b.type === 'townhall') && b._op; });
  if (!depots.length) return;
  const active = AG.vehicles.filter(function (v) { return v.maintFix; }).length;
  const maxCrews = 1 + depots.filter(function (b) { return b.type === 'maintdepot'; }).length * 2;
  if (active >= maxCrews) return;
  const targeted = new Set(AG.vehicles.filter(function (v) { return v.maintFix; }).map(function (v) { return v.maintFix; }));
  const worst = S.buildings.list.filter(function (b) { return b.built && b.cond !== undefined && b.cond < M.threshold && b._entry >= 0 && !targeted.has(b.id) && b.type !== 'tree'; })
    .sort(function (a, b) { return a.cond - b.cond; }).slice(0, maxCrews - active);
  worst.forEach(function (b) { const v = dispatchMaintenance(b); if (v) { v.maintFix = b.id; M.dispatched++; } });
}
/* A crew arrived: condition restored, the owner pays the repair */
function maintenanceArrive(v) {
  if (!S.p9 || !v.maintFix) return;
  const b = MAP.byId.get(v.maintFix); if (!b) return;
  const before = b.cond === undefined ? 100 : b.cond;
  const cost = Math.round(buildCost(BUILDINGS[b.type]) * 0.02 * (100 - before) / 100 + 5);
  if (b.owner === 'city') S.budget = Math.max(0, S.budget - cost); else if (isAI(b)) { if (S.ai[b.owner]) S.ai[b.owner].cash = Math.max(0, S.ai[b.owner].cash - cost); } else S.money = Math.max(0, S.money - cost);
  b.cond = 100; if (b.damaged) b.repair = Math.min(b.repair || 0, 3);
  S.p9.maint.jobs++; S.p9.maint.spent += cost;
}
function repairAllConditions() { let n = 0; S.buildings.list.forEach(function (b) { if (b.cond !== undefined && b.cond < 100) { b.cond = 100; n++; } b.damaged = 0; b.repair = 0; b.fire = 0; }); return n; }
function conditionStats() {
  const t = { Excellent: 0, Good: 0, Worn: 0, Poor: 0, Critical: 0 }; let sum = 0, n = 0;
  S.buildings.list.forEach(function (b) { if (!b.built || b.type === 'tree') return; const c = b.cond === undefined ? 100 : b.cond; t[condLabel(c)]++; sum += c; n++; });
  return { tiers: t, avg: n ? sum / n : 100 };
}
