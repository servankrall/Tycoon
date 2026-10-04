'use strict';
/* BLOCK CITY TYCOON — UTILITY GRID 2.0, WATER NETWORK 2.0, SEWAGE, ENVIRONMENT & WEATHER 2.0 (Part 9)
   • POWER GRID: Power Plant → Substation → Transformer (one per 8×8 district) → District → Building. Real-time load
     per transformer and substation; a district whose load exceeds its transformer capacity browns out (lowest
     priority first), a substation carrying more than its rating overloads. Production / consumption / reserve in MW.
   • WATER NETWORK: reservoirs, water plants, pumps and mains along the roads. Pressure falls with distance from the
     sources; pumps boost it; a burst pipe cuts the pressure downstream until a maintenance crew repairs it.
   • SEWAGE: building → sewer → district pipe → treatment plant. Over capacity = SEWAGE OVERLOAD (water quality,
     health and happiness drop).
   • ENVIRONMENT: pollution spreads with the wind to neighbouring districts; noise, air, water and soil quality maps.
   • WEATHER 2.0: Sunny, Cloudy, Rain, Heavy Rain, Storm, Fog, Snow, Heatwave, Cold Wave with effects on traffic,
     energy, water, citizens, tourism, farming and disaster risk. */

/* ---------------- New buildings ---------------- */
registerBuilding({ id: 'substation', name: 'Substation', icon: '🔌', cat: 'Utilities', sector: 'ENERGY', w: 1, h: 1, cost: 2500, color: '#adb5bd', roof: '#6c757d', height: 12, workers: 2, maxW: 4, maint: 0.6, unlock: { pop: 150 }, desc: 'Steps grid power down for nearby districts. Transformers within 10 tiles get +300 MW capacity.' });
registerBuilding({ id: 'pumpstation', name: 'Pump Station', icon: '⛽', cat: 'Utilities', sector: 'WATER', w: 1, h: 1, cost: 1800, color: '#48cae4', roof: '#0077b6', height: 14, workers: 2, maxW: 4, power: -4, maint: 0.5, unlock: { pop: 200 }, desc: 'Boosts water pressure in the mains for 16 tiles around it.' });
registerBuilding({ id: 'reservoir', name: 'Reservoir', icon: '🏞️', cat: 'Utilities', sector: 'WATER', w: 2, h: 2, cost: 15000, color: '#0096c7', roof: '#023e8a', height: 6, workers: 3, maxW: 6, maint: 1.5, unlock: { pop: 600 }, desc: 'Stores surplus water (4,000 units) and releases it during shortages.' });
registerBuilding({ id: 'sewageplant', name: 'Sewage Treatment Plant', icon: '🚽', cat: 'Waste', sector: 'WASTE', w: 2, h: 2, cost: 12000, color: '#6a994e', roof: '#386641', height: 14, workers: 8, maxW: 16, power: -8, pol: 2, maint: 3, unlock: { pop: 300 }, desc: 'Treats 500 units of sewage. Without enough capacity the city gets a SEWAGE OVERLOAD.' });

/* ===================================== POWER GRID ===================================== */
const GRID = { districts: [], subs: [], at: -1, overloadNotified: 0, noGrid: 0, brown: 0, transformersOver: 0 };
function gridComps() {
  const set = new Set();
  S.buildings.list.forEach(function (b) { if (bdef(b).power > 0 && b._op && b._entry >= 0) set.add(MAP.comp[b._entry]); });
  return set;
}
/* Runs inside econTick after the generation / demand balance: applies the grid topology on top of it */
function gridPass(consumers) {
  if (!S.p9) return;
  const U = S.p9.util, now = S.clock.runSec, overTest = U.overloadUntil > now;
  const n = Math.ceil(MAP.W / 8), D = [];
  for (let i = 0; i < n * n; i++) D.push({ load: 0, cap: 60, subs: [], over: false, b: 0 });
  const comps = gridComps();
  // feeders: substations, power plants (switchyards) and the town hall's local transformer
  const subs = [];
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b._op) return;
    let cap = 0, r = 0;
    if (b.type === 'substation') { cap = 600 * lvlMult(b.level); r = 10; }
    else if (d.power > 0) { cap = Math.max(150, (b._gen || 0) * 1.3); r = 8; }
    else if (b.type === 'townhall') { cap = 200; r = 7; }
    if (!cap) return;
    const c = buildingCenter(b);
    const failed = U.failures.some(function (f) { return f.until > now && Math.hypot(c.x / TILE - f.x, c.y / TILE - f.y) <= f.r; });
    subs.push({ b: b, cap: failed ? 0 : cap * (overTest ? 0.4 : 1), r: r, x: c.x / TILE, y: c.y / TILE, load: 0, failed: failed });
  });
  subs.forEach(function (s) {
    const sub = s.b.type === 'substation';
    for (let k = 0; k < D.length; k++) {
      const cx = (k % n) * 8 + 4, cy = Math.floor(k / n) * 8 + 4;
      if (Math.hypot(cx - s.x, cy - s.y) <= s.r + 4) { D[k].subs.push(s); D[k].cap += s.failed ? 0 : (sub ? 300 * lvlMult(s.b.level) : 150) * (overTest ? 0.4 : 1); }
    }
  });
  // district loads (only powered consumers after the generation balance)
  let noGrid = 0;
  consumers.forEach(function (b) {
    b._gridOver = false; b._gridNo = false;
    if (!b._powered) return;
    if (b._entry < 0 || !comps.has(MAP.comp[b._entry])) { if (!U.infinitePower) { b._powered = false; b._gridNo = true; noGrid++; } return; }
    const k = Math.floor(b.y / 8) * n + Math.floor(b.x / 8); if (!D[k]) return;
    D[k].load += b._pneed || 0; D[k].b++;
  });
  // substation loads: districts share their load between the substations that feed them
  D.forEach(function (d) { const live = d.subs.filter(function (s) { return !s.failed; }); live.forEach(function (s) { s.load += d.load / live.length; }); });
  subs.forEach(function (s) { s.over = s.load > s.cap * 1.0001 && s.cap > 0; s.ratio = s.cap > 0 ? s.load / s.cap : (s.load > 0 ? 9 : 0); });
  D.forEach(function (d) {
    const subOver = d.subs.filter(function (s) { return s.over; }).length;
    if (subOver) { const f = d.subs.reduce(function (a, s) { return a + (s.over ? s.cap / Math.max(1, s.load) : 1); }, 0) / d.subs.length; d.cap *= clamp(f, 0.3, 1); }
    d.over = d.load > d.cap;
  });
  // brownouts: the lowest-priority consumers of an overloaded district lose power until the load fits
  let brown = 0;
  if (!U.infinitePower) {
    const prio = { SERVICE: 0, CIVIC: 0, WATER: 1, HOUSING: 2, EDUCATION: 3, TRANSPORT: 3, WASTE: 3, SCIENCE: 4, LANDMARK: 5 };
    D.forEach(function (d, k) {
      if (!d.over) return;
      const list = consumers.filter(function (b) { return b._powered && Math.floor(b.y / 8) * n + Math.floor(b.x / 8) === k; });
      list.sort(function (a, b) { const pa = prio[bdef(a).sector] === undefined ? 6 : prio[bdef(a).sector], pb = prio[bdef(b).sector] === undefined ? 6 : prio[bdef(b).sector]; return pb - pa || b.id - a.id; });
      let excess = d.load - d.cap;
      for (let i = 0; i < list.length && excess > 0; i++) { list[i]._powered = false; list[i]._gridOver = true; excess -= list[i]._pneed || 0; brown++; }
    });
  }
  GRID.districts = D; GRID.subs = subs; GRID.n = n; GRID.noGrid = noGrid; GRID.brown = brown;
  GRID.transformersOver = D.filter(function (d) { return d.over; }).length;
  GRID.subsOver = subs.filter(function (s) { return s.over; }).length;
  SIM.gridBrown = brown; SIM.gridNoConn = noGrid;
  if ((brown || GRID.subsOver) && now - GRID.overloadNotified > 120) {
    GRID.overloadNotified = now;
    notify('⚡ GRID OVERLOAD — ' + GRID.transformersOver + ' district transformer(s)' + (GRID.subsOver ? ', ' + GRID.subsOver + ' substation(s)' : '') + ' over capacity: ' + brown + ' building(s) browned out. Build substations near dense districts.', 'bad');
    timelineAdd('⚡', 'Grid overload: ' + brown + ' buildings browned out', 'utility');
  }
}
function gridStats() {
  const reserve = (SIM.powerGen || 0) - (SIM.powerUse || 0);
  return { production: SIM.powerGen || 0, consumption: SIM.powerUse || 0, reserve: reserve, imported: SIM.p9PowerImport || 0, overload: reserve < 0 || GRID.brown > 0 || GRID.subsOver > 0,
    substations: GRID.subs.filter(function (s) { return s.b.type === 'substation'; }).length, feeders: GRID.subs.length, transformers: GRID.districts.filter(function (d) { return d.load > 0; }).length,
    transformersOver: GRID.transformersOver || 0, subsOver: GRID.subsOver || 0, brown: GRID.brown || 0, noGrid: GRID.noGrid || 0, failures: S.p9 ? S.p9.util.failures.filter(function (f) { return f.until > S.clock.runSec; }).length : 0 };
}
/* Auto-upgrade of the grid: substations for every overloaded district (used by AUTO FIX, BUILD ALL UTILITIES and old saves) */
function gridAutoSubstations(free) {
  econTick(1);
  let placed = 0;
  for (let guard = 0; guard < 30; guard++) {
    const k = GRID.districts.findIndex(function (d) { return d.over; }); if (k < 0) break;
    const n = GRID.n, cx = (k % n) * 8 + 4, cy = Math.floor(k / n) * 8 + 4;
    const b = placeUtilityNear('substation', cx, cy, free); if (!b) { GRID.districts[k].over = false; continue; }
    placed++; onMapChanged(); econTick(1);
  }
  return placed;
}
/* Place a city building on a free road-connected lot near (x,y) (pays the city budget unless free).
   Zoned land is re-zoned for the utility; when every lot is taken a small building (house, kiosk, tree…) makes room. */
function placeUtilityNear(type, x, y, free) {
  const d = BUILDINGS[type]; if (!d) return null;
  const cost = free ? 0 : buildCost(d);
  if (!free && S.budget < cost) return null;
  const commit = function (xx, yy) { S.budget -= cost; const b = wgCommit(type, xx, yy, { owner: 'city' }); b.owner = 'city'; b.cond = 100; return b; };
  const ok = function (xx, yy) { return inUnlocked(xx, yy) && inUnlocked(xx + d.w - 1, yy + d.h - 1) && wgCanPlace(d, xx, yy); };
  for (let r = 0; r <= 20; r++) for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
    if (ok(xx, yy)) return commit(xx, yy);
  }
  for (let r = 0; r <= 10; r++) for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r || !inUnlocked(xx, yy)) continue;
    if (wgClearForService(d, xx, yy) && ok(xx, yy)) { onMapChanged(); return commit(xx, yy); }
  }
  return null;
}

/* ===================================== WATER NETWORK ===================================== */
const WNET = { pres: null, key: '', at: -9, low: 0, sources: 0, pumps: 0 };
function waterNetKey() { return MAP.version + '|' + (S.p9 ? S.p9.water.breaks.map(function (b) { return b.tile; }).join(',') : '') + '|' + S.buildings.list.filter(function (b) { return (bdef(b).water > 0 || b.type === 'pumpstation' || b.type === 'reservoir') && b._op; }).length; }
function waterNetPass(force) {
  if (!S.p9 || !MAP.roads) return;
  const key = waterNetKey();
  if (!force && WNET.pres && WNET.pres.length === MAP.W * MAP.H && key === WNET.key && (S.clock.runSec - WNET.at < 3 || performance.now() - (WNET.realAt || 0) < 500)) return;
  WNET.realAt = performance.now();
  WNET.key = key; WNET.at = S.clock.runSec;
  const N = MAP.W * MAP.H, W = MAP.W, pres = new Float32Array(N), broken = new Uint8Array(N);
  S.p9.water.breaks.forEach(function (b) { if (b.tile >= 0 && b.tile < N) broken[b.tile] = 1; });
  // multi-source spread along the mains (roads); every source has a range from its output
  const spread = function (start, range, strength) {
    if (start < 0 || broken[start]) return;
    const dist = new Map(); const q = [start]; dist.set(start, 0); let h = 0;
    while (h < q.length) {
      const c = q[h++], dc = dist.get(c), p = strength * (1 - dc / range);
      if (p <= 0.02) continue;
      if (p > pres[c]) pres[c] = p;
      const x = c % W, y = (c / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= MAP.H) continue;
        const ni = ny * W + nx; if (!MAP.roads[ni] || broken[ni] || dist.has(ni)) continue;
        dist.set(ni, dc + 1); q.push(ni);
      }
    }
  };
  let sources = 0;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b._op || b._entry < 0) return;
    if (d.water > 0) { spread(b._entry, 14 + Math.sqrt(d.water * lvlMult(b.level)) * 0.9, 1); sources++; }
    else if (b.type === 'reservoir') { spread(b._entry, 30, S.p9.water.stored > 50 ? 1 : 0.4); sources++; }
  });
  // booster pumps re-pressurise the mains they sit on (the main must be connected to a water source)
  const srcComps = new Set();
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (b._op && b._entry >= 0 && (d.water > 0 || b.type === 'reservoir')) srcComps.add(MAP.comp[b._entry]); });
  let pumps = 0;
  S.buildings.list.forEach(function (b) { if (b.type === 'pumpstation' && b._op && b._entry >= 0 && srcComps.has(MAP.comp[b._entry])) { spread(b._entry, 16 + 4 * b.level, 0.95); pumps++; } });
  WNET.pres = pres; WNET.sources = sources; WNET.pumps = pumps;
  let low = 0, cons = 0;
  S.buildings.list.forEach(function (b) {
    if (bdef(b).water >= 0 || !b.built) return;
    cons++;
    b._wp = b._entry >= 0 ? pres[b._entry] : 0;
    if (S.p9.util.infiniteWater) b._wp = 1;
    if (b._wp < 0.3) low++;
  });
  WNET.low = cons ? low / cons : 0; SIM.lowPressure = WNET.low;
}
function waterPressureMult(b) { if (!S.p9 || b._wp === undefined) return 1; return b._wp >= 0.5 ? 1 : 0.6 + 0.8 * b._wp; }
/* Reservoirs buffer: store surplus, release during deficits (read by econTick next second) */
function reservoirTick(dt) {
  if (!S.p9) return;
  const cap = S.buildings.list.reduce(function (a, b) { return a + (b.type === 'reservoir' && b._op ? 4000 * lvlMult(b.level) : 0); }, 0);
  const W = S.p9.water; W.capacity = cap;
  const net = (SIM.waterGen || 0) - (SIM.p9WaterBoost || 0) - (SIM.waterUse || 0);
  if (!cap) { W.stored = 0; SIM.p9WaterBoost = 0; return; }
  if (net > 0) { W.stored = Math.min(cap, W.stored + net * dt); SIM.p9WaterBoost = 0; }
  else { const rel = Math.min(W.stored / Math.max(1, dt), -net); W.stored = Math.max(0, W.stored - rel * dt); SIM.p9WaterBoost = rel; }
}
function breakPipe(tile, silent) {
  if (!S.p9) return null;
  if (tile === undefined || tile < 0 || !MAP.roads[tile]) tile = randomRoadTile();
  if (tile < 0 || S.p9.water.breaks.some(function (b) { return b.tile === tile; })) return null;
  S.p9.water.breaks.push({ tile: tile, at: S.clock.runSec }); S.p9.water.breakCount++;
  waterNetPass(true);
  const v = dispatchMaintenance(tile); if (v) v.pipeFix = tile;
  if (!silent) toast('💦 Water main burst near ' + districtName(tile % MAP.W, (tile / MAP.W) | 0) + ' — pressure drops downstream, crew ' + (v ? 'dispatched' : 'unavailable'), 'bad');
  return tile;
}
function repairPipe(tile) { if (!S.p9) return; S.p9.water.breaks = S.p9.water.breaks.filter(function (b) { return b.tile !== tile; }); waterNetPass(true); }
function waterStats() {
  return { production: SIM.waterGen || 0, consumption: SIM.waterUse || 0, stored: S.p9 ? S.p9.water.stored : 0, capacity: S.p9 ? S.p9.water.capacity : 0, release: SIM.p9WaterBoost || 0, lowPressure: WNET.low, breaks: S.p9 ? S.p9.water.breaks.length : 0, sources: WNET.sources, pumps: WNET.pumps };
}

/* ===================================== SEWAGE ===================================== */
const SEWER = { gen: 0, cap: 0, overload: 0, districts: [], unconnected: 0 };
function sewagePass() {
  if (!S.p9) return;
  const plants = S.buildings.list.filter(function (b) { return b.type === 'sewageplant' && b._op; });
  const comps = new Set(plants.map(function (b) { return b._entry >= 0 ? MAP.comp[b._entry] : -1; }));
  let gen = 0, cap = 0, septicLoad = 0;
  plants.forEach(function (b) { cap += 500 * lvlMult(b.level) * Math.max(0.3, b._eff || 0); });
  const septic = 150 + (S.city.population < 800 ? 250 : 0);
  const n = Math.ceil(MAP.W / 8), D = new Array(n * n).fill(0);
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b._op || d.water >= 0) return;
    const s = -d.water * lvlMult(b.level) * 0.8;
    gen += s;
    const k = Math.floor(b.y / 8) * n + Math.floor(b.x / 8); D[k] += s;
    b._sewer = b._entry >= 0 && comps.has(MAP.comp[b._entry]);
    if (!b._sewer) septicLoad += s;
  });
  const septicOver = Math.max(0, septicLoad - septic);
  const treated = Math.min(gen - septicLoad, cap);
  const untreated = Math.max(0, gen - septicLoad - cap) + septicOver;
  const fixed = S.p9.util.fixSewageUntil > S.clock.runSec;
  SEWER.gen = gen; SEWER.cap = cap + septic; SEWER.treated = treated; SEWER.overload = fixed ? 0 : (gen > 0 ? clamp(untreated / gen, 0, 1) : 0);
  SEWER.districts = D; SEWER.unconnected = septicLoad; SEWER.n = n;
  SIM.sewageOverload = SEWER.overload;
  S.buildings.list.forEach(function (b) { b._sewerBack = SEWER.overload > 0.25 && !b._sewer && bdef(b).water < 0; });
  if (SEWER.overload > 0.15 && S.clock.runSec - (SEWER.warned || -999) > 180) { SEWER.warned = S.clock.runSec; notify('🚽 SEWAGE OVERLOAD — ' + Math.round(SEWER.overload * 100) + '% of the sewage is untreated. Build a Sewage Treatment Plant.', 'bad'); }
}

/* ===================================== ENVIRONMENT ===================================== */
const ENV = { air: null, noise: null, water: null, soil: null, tour: null, at: -9, n: 0 };
function envReset() { ENV.air = ENV.noise = ENV.water = ENV.soil = ENV.tour = ENV.c = ENV.c2 = null; ENV.at = -9; }
/* Environment grids are only valid for the current map size (a new / loaded / expanded world resets them) */
function envReady() { return !!(ENV.air && MAP.W && ENV.air.length === MAP.W * MAP.H); }
function envTick(force) {
  if (!S.p9 || !MAP.roads) return;
  if (!force && envReady() && ((S.clock.runSec - ENV.at < 3 && ENV.at <= S.clock.runSec) || performance.now() - (ENV.realAt || 0) < 600)) return;
  ENV.at = S.clock.runSec; ENV.realAt = performance.now();
  const W = MAP.W, H = MAP.H, N = W * H;
  if (!ENV.air || ENV.air.length !== N) { ENV.air = new Float32Array(N); ENV.noise = new Float32Array(N); ENV.water = new Float32Array(N).fill(1); ENV.soil = new Float32Array(N); ENV.c = new Float32Array(N); ENV.c2 = new Float32Array(N); ENV.tour = new Float32Array(N); restoreSoil(); }
  const em = new Float32Array(N), absorb = new Float32Array(N), nz = new Float32Array(N), soilT = new Float32Array(N);
  const indK = (hasTech('env_filters') ? 0.7 : 1) * (SIM.mods ? SIM.mods.indPol || 1 : 1);
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b.built) return;
    const area = d.w * d.h;
    for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) {
      const i = y * W + x;
      if (d.pol > 0 && b._op) { const e = d.pol * lvlMult(b.level) * Math.max(0.3, b._eff || 0) * (d.cat === 'Industry' || d.cat === 'Resources' || d.smoke ? indK : 1) / area; em[i] += e; soilT[i] += e * 0.04; }
      else if (d.pol < 0) absorb[i] += -d.pol * lvlMult(b.level) * (hasTech('env_green') ? 2 : 1) / area * 0.5;
      if (b._op && (d.cat === 'Industry' || d.id === 'airport' || d.id === 'nightclub' || d.id === 'stadium' || d.id === 'megastadium' || d.cat === 'Resources')) nz[i] += d.id === 'airport' ? 1.2 : d.cat === 'Industry' ? 0.5 : 0.35;
      if (d.wasteCap) soilT[i] += 0.3;
      if (d.id === 'farm') soilT[i] += 0.06;
    }
  });
  const trafficK = (hasTech('t_ev') ? 0.4 : 1) * (1 - (SIM.evShare || 0) * 0.8);
  for (let i = 0; i < N; i++) {
    if (MAP.roads[i]) { const rt = MAP.roads[i], cg = MAP.cong ? MAP.cong[i] : SIM.traffic / 100; em[i] += (0.08 + cg * 0.5) * rt * 0.35 * trafficK; nz[i] += 0.12 * rt + cg * 0.35; }
    if (MAP.nature[i] === 1) absorb[i] += 0.35;
  }
  const brush = S.p9.env.polBrush; for (const k in brush) { const i = +k; if (i >= 0 && i < N) em[i] += brush[k]; }
  // advection–diffusion: the cloud drifts downwind and spreads to the neighbouring districts
  const wind = S.p9.env.wind, wx = Math.cos(wind.dir) * wind.speed, wy = Math.sin(wind.dir) * wind.speed;
  let c = ENV.c, c2 = ENV.c2;
  for (let it = 0; it < 3; it++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const l = x > 0 ? c[i - 1] : c[i], r = x < W - 1 ? c[i + 1] : c[i], u = y > 0 ? c[i - W] : c[i], dn = y < H - 1 ? c[i + W] : c[i];
      const up = (wx > 0 ? l * wx : r * -wx) + (wy > 0 ? u * wy : dn * -wy);
      const keep = 1 - Math.abs(wx) - Math.abs(wy);
      const v = (c[i] * keep + up) * 0.72 + (l + r + u + dn) * 0.045 + em[i] * 0.55 - absorb[i] * 0.25;
      c2[i] = v > 0 ? Math.min(v, 60) : 0;
    }
    const t = c; c = c2; c2 = t;
  }
  ENV.c = c; ENV.c2 = c2;
  const scale = 1 + S.city.pollution / 100;
  for (let i = 0; i < N; i++) ENV.air[i] = clamp(c[i] * scale / (c[i] * scale + 3.2), 0, 1);
  // noise: short range, no wind
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let s = nz[i];
    if (x > 0) s += nz[i - 1] * 0.35; if (x < W - 1) s += nz[i + 1] * 0.35; if (y > 0) s += nz[i - W] * 0.35; if (y < H - 1) s += nz[i + W] * 0.35;
    ENV.noise[i] = clamp(s / (s + 1.4), 0, 1);
  }
  // water quality: industry near water, sewage overload and runoff; diffuses along rivers and lakes
  const sew = SIM.sewageOverload || 0;
  for (let i = 0; i < N; i++) {
    if (MAP.nature[i] !== 2) { ENV.water[i] = 1; continue; }
    const x = i % W, y = (i / W) | 0; let dirt = sew * 0.5;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) dirt += em[yy * W + xx] * 0.03 + soilT[yy * W + xx] * 0.2;
    ENV.water[i] = clamp(lerp(ENV.water[i], 1 - clamp(dirt, 0, 0.95), 0.25), 0, 1);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (MAP.nature[i] !== 2) continue; let s = ENV.water[i], k = 1; if (x > 0 && MAP.nature[i - 1] === 2) { s += ENV.water[i - 1]; k++; } if (y > 0 && MAP.nature[i - W] === 2) { s += ENV.water[i - W]; k++; } ENV.water[i] = s / k; }
  // soil: slow memory of industry, landfills, polluted air; forests and parks regenerate it
  for (let i = 0; i < N; i++) { const tgt = clamp(soilT[i] * 3 + ENV.air[i] * 0.25 - (MAP.nature[i] === 1 ? 0.2 : 0) - absorb[i] * 0.2, 0, 1); ENV.soil[i] = lerp(ENV.soil[i], tgt, 0.02); }
  ENV.n++;
  // the wind slowly turns
  wind.dir += (RNG.next() - 0.5) * 0.08; wind.speed = clamp(wind.speed + (RNG.next() - 0.5) * 0.02 + (FX.weather === 'storm' ? 0.01 : 0) - (FX.weather === 'fog' ? 0.01 : 0), 0.04, 0.35);
}
function restoreSoil() {
  if (!S.p9 || !Array.isArray(S.p9.env.soilChunks) || !ENV.soil) return;
  weEnsure();
  S.p9.env.soilChunks.forEach(function (v, k) { if (k >= WE.n) return; const r = chunkRect(k); for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) ENV.soil[idx(x, y)] = clamp(+v || 0, 0, 1); });
}
function envSummary() {
  if (!envReady()) return { air: 0, noise: 0, water: 1, soil: 0, wind: S.p9 ? S.p9.env.wind : { dir: 0, speed: 0 } };
  let a = 0, nz = 0, w = 0, wn = 0, s = 0, n = 0;
  for (let i = 0; i < ENV.air.length; i++) { if (MAP.occ[i] || MAP.roads[i] || MAP.zone[i]) { a += ENV.air[i]; nz += ENV.noise[i]; s += ENV.soil[i]; n++; } if (MAP.nature[i] === 2) { w += ENV.water[i]; wn++; } }
  return { air: n ? a / n : 0, noise: n ? nz / n : 0, water: wn ? w / wn : 1, soil: n ? s / n : 0, wind: S.p9.env.wind };
}
function windName(dir) { const a = ((dir % 6.2832) + 6.2832) % 6.2832, names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']; return names[Math.round(a / (Math.PI / 4)) % 8]; }

/* ---------------- Heatmaps 2.0 ---------------- */
HEATMAPS.push(
  { id: 'NOISE', icon: '🔊', name: 'Noise', low: 'Quiet', high: 'Loud', ramp: 'bad' },
  { id: 'AIR QUALITY', icon: '🌬️', name: 'Air Quality', low: 'Toxic', high: 'Clean', ramp: 'good' },
  { id: 'WATER QUALITY', icon: '🌊', name: 'Water Quality', low: 'Polluted', high: 'Clean', ramp: 'good' },
  { id: 'SOIL QUALITY', icon: '🪱', name: 'Soil Quality', low: 'Contaminated', high: 'Healthy', ramp: 'good' },
  { id: 'TOURISM', icon: '🧳', name: 'Tourism', low: 'None', high: 'Hotspot', ramp: 'value' },
  { id: 'SEWAGE', icon: '🚽', name: 'Sewage', low: 'Treated', high: 'Overloaded', ramp: 'bad' },
  { id: 'EMERGENCY', icon: '🚨', name: 'Emergency Coverage', low: 'Unprotected', high: 'Covered', ramp: 'good' },
  { id: 'CONDITION', icon: '🔧', name: 'Building Condition', low: 'Critical', high: 'Excellent', ramp: 'good' }
);
['NOISE', 'AIR QUALITY', 'WATER QUALITY', 'SOIL QUALITY', 'TOURISM', 'SEWAGE', 'EMERGENCY', 'CONDITION'].forEach(function (id) { if (OVERLAYS.indexOf(id) < 0) OVERLAYS.push(id); });
/* Returns a heat grid for the Part 9 maps (or null for the classic ones) */
function p9HeatGrid(mode) {
  if (!S.p9) return null;
  const N = MAP.W * MAP.H;
  if (['POLLUTION', 'NOISE', 'AIR QUALITY', 'WATER QUALITY', 'SOIL QUALITY'].indexOf(mode) >= 0) envTick(!envReady());
  if (mode === 'POLLUTION') return ENV.air.slice();
  if (mode === 'NOISE') return ENV.noise.slice();
  if (mode === 'AIR QUALITY') { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = 1 - ENV.air[i]; return g; }
  if (mode === 'WATER QUALITY') { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = MAP.nature[i] === 2 ? ENV.water[i] : 0; return g; }
  if (mode === 'SOIL QUALITY') { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = MAP.nature[i] === 2 ? 0 : 1 - ENV.soil[i]; return g; }
  if (mode === 'TOURISM') return covGrid(function (b) { return BUILDINGS[b.type].tour > 0 && b._op; }, function (b) { return 4 + Math.sqrt(BUILDINGS[b.type].tour) * 0.8; });
  if (mode === 'EMERGENCY') {
    const f = covGrid(function (b) { return BUILDINGS[b.type].service && b._road; }, function (b) { return coverRadius(b); });
    return f;
  }
  if (mode === 'SEWAGE') {
    const g = new Float32Array(N); sewagePass();
    S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.water >= 0 || !b.built) return; const v = b._sewer ? SEWER.overload * 0.6 : 0.35 + SEWER.overload * 0.65; for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = v; });
    return g;
  }
  if (mode === 'CONDITION') {
    const g = new Float32Array(N);
    S.buildings.list.forEach(function (b) { const d = bdef(b); if (!b.built || d.id === 'tree') return; const v = (b.cond === undefined ? 100 : b.cond) / 100; for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = Math.max(0.02, v); });
    return g;
  }
  if (mode === 'ELECTRICITY') {
    const g = new Float32Array(N);
    S.buildings.list.forEach(function (b) { const d = bdef(b); if (!b.built) return; const v = d.power > 0 ? 1 : d.power < 0 ? (b._powered ? (b._gridOver ? 0.35 : 0.85) : 0.04) : -1; if (v < 0) return; for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = v; });
    if (GRID.districts.length) GRID.districts.forEach(function (dd, k) { if (!dd.over) return; const n = GRID.n, x0 = (k % n) * 8, y0 = Math.floor(k / n) * 8; for (let y = y0; y < y0 + 8 && y < MAP.H; y++) for (let x = x0; x < x0 + 8 && x < MAP.W; x++) if (!g[idx(x, y)]) g[idx(x, y)] = 0.15; });
    return g;
  }
  if (mode === 'WATER') { waterNetPass(false); const g = new Float32Array(N); if (WNET.pres) for (let i = 0; i < N; i++) g[i] = WNET.pres[i]; S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.water < 0 && b.built) { const v = Math.max(0.03, (b._wp || 0) * SIM.waterRatio); for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = v; } }); return g; }
  return null;
}

/* ===================================== WEATHER 2.0 ===================================== */
WEATHER_TYPES.push('heavyrain', 'coldwave');
const WEATHER_INFO = {
  clear: { icon: '☀️', name: 'Sunny' }, cloudy: { icon: '☁️', name: 'Cloudy' }, rain: { icon: '🌧️', name: 'Rain' }, heavyrain: { icon: '🌧️🌧️', name: 'Heavy Rain' },
  storm: { icon: '⛈️', name: 'Storm' }, fog: { icon: '🌫️', name: 'Fog' }, snow: { icon: '❄️', name: 'Snow' }, heatwave: { icon: '🔥', name: 'Heatwave' }, coldwave: { icon: '🥶', name: 'Cold Wave' }
};
/* Random weather by season (used by updateWeather when no admin lock is active) */
function pickWeather2(season) {
  const r = Math.random();
  const T = {
    winter: [['snow', 0.32], ['coldwave', 0.12], ['fog', 0.1], ['cloudy', 0.16]],
    spring: [['rain', 0.2], ['heavyrain', 0.05], ['cloudy', 0.2], ['fog', 0.07], ['storm', 0.03]],
    summer: [['heatwave', 0.12], ['storm', 0.06], ['rain', 0.08], ['cloudy', 0.12]],
    autumn: [['rain', 0.24], ['heavyrain', 0.1], ['fog', 0.12], ['cloudy', 0.2], ['storm', 0.05]]
  }[season] || [];
  let acc = 0; for (let i = 0; i < T.length; i++) { acc += T[i][1]; if (r < acc) return T[i][0]; }
  return 'clear';
}
function weatherOutdoor() { return ({ rain: 0.45, heavyrain: 0.2, storm: 0.1, snow: 0.6, coldwave: 0.35, heatwave: 0.7, fog: 0.8, cloudy: 0.95 })[FX.weather] || 1; }
function weatherFarmMult() { return ({ rain: 1.1, heavyrain: 0.85, storm: 0.8, heatwave: 0.7, coldwave: 0.5, snow: 0.8 })[FX.weather] || 1; }
function weatherTourMult() { return ({ clear: 1.08, rain: 0.9, heavyrain: 0.78, storm: 0.6, coldwave: 0.75, heatwave: 0.9, fog: 0.9, snow: 0.95 })[FX.weather] || 1; }
/* Weather-driven risks: floods, pipe bursts in frost, fires in heat, storm power failures */
function weatherRiskTick(dt) {
  if (!S.p9 || S.p5.admin.noEvents || S.city.population < 300) return;
  const w = FX.weather;
  if (w === 'coldwave' && RNG.next() < 0.0025 * dt) breakPipe(-1);
  else if (RNG.next() < 0.00015 * dt) breakPipe(-1, true);
  if (w === 'heatwave' && RNG.next() < 0.0012 * dt) { const c = damageableBuildings().filter(function (b) { return !b.fire; }); if (c.length) igniteBuilding(RNG.pick(c)); }
  if (w === 'storm' && RNG.next() < 0.0008 * dt) { const sub = S.buildings.list.filter(function (b) { return b.type === 'substation' && b._op; }); const t = sub.length ? RNG.pick(sub) : null; if (t) { S.p9.util.failures.push({ x: t.x, y: t.y, r: 3, until: S.clock.runSec + 60, cause: 'storm' }); notify('⛈️ Storm knocked out a substation — power failure nearby for 60 s', 'bad'); } }
}
/* Mods from Part 9 systems (called by globalMods) */
function part9Mods(m) {
  if (!S.p9) return m;
  const w = FX.weather;
  m.tour *= weatherTourMult();
  m.traffic = (m.traffic || 1) * (S.p9.traffic.mult || 1);
  m.waterUse = (m.waterUse || 1) * (w === 'heatwave' ? 1.2 : w === 'coldwave' ? 1.05 : 1);
  const T = SIM.p9Trade; if (T && T.k) { m.trade = (m.trade || 1) * (1 + 0.5 * T.k); m.importMult = (m.importMult || 1) * (1 - 0.15 * T.k); }
  return m;
}
