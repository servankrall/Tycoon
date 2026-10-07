'use strict';
/* BLOCK CITY TYCOON — WORLD GENERATOR (Part 8)
   One-click liveable world: Terrain → Water → Roads → Districts → Zoning → Utilities → Buildings → Businesses → Citizens →
   Jobs → Transport → Emergency services → Economy → Traffic → AI → Validation → Auto-fix → Start simulation.
   Everything is seeded (CITY-xxxxxx): the same seed + settings + generator version produce the same starting world.
   Also: World Validator, Auto-Repair (FIX WORLD), World Health score and the World Debugger overlay. */

const WORLDGEN_VERSION = 1;
const WORLD_SIZES = { SMALL: 40, MEDIUM: 52, LARGE: 64, HUGE: 80, MEGA: 96, GIGA: 128 };
const WORLD_POP_BASE = { 40: 6000, 52: 9500, 64: 15000, 80: 22000, 96: 30000, 128: 45000 };
const WG_DEFAULT = {
  name: 'New Metropolis', seed: null, size: 'LARGE', mapType: 'standard', coast: 'none',
  water: 1, mountains: 1, rivers: 1, forest: 1, roadDensity: 1, buildingDensity: 1, popDensity: 1,
  industry: 1, tourism: 1, finance: 1, tech: 1, traffic: 1, infrastructure: 'standard', economy: 1, disasters: 1,
  weather: 'auto', climate: 'temperate', slot: 0
};
const WORLD_PRESETS = {
  balanced:   { name: '🌍 Balanced World', desc: 'A bit of everything: homes, jobs, shops, industry, parks and services.', cfg: {} },
  megacity:   { name: '🏙 Mega City', desc: 'Huge map, dense towers, metro, rail and an airport.', cfg: { size: 'HUGE', popDensity: 1.5, buildingDensity: 1.35, roadDensity: 1.15, infrastructure: 'advanced', finance: 1.4, tech: 1.4 } },
  green:      { name: '🌲 Green World', desc: 'Forests, parks, wind & solar, little industry.', cfg: { forest: 1.8, industry: 0.45, tourism: 1.2, mapType: 'lakes', infrastructure: 'green', popDensity: 0.85 } },
  industrial: { name: '🏭 Industrial World', desc: 'Mines, factories, warehouses and full supply chains.', cfg: { industry: 2.1, tourism: 0.4, finance: 0.7, mountains: 1.3 } },
  tourist:    { name: '🏖 Tourist World', desc: 'Lakes, hotels, museums, stadiums and theme parks.', cfg: { tourism: 2.2, water: 1.4, mapType: 'lakes', industry: 0.55 } },
  financial:  { name: '💰 Financial World', desc: 'Offices, banks and a stock exchange downtown.', cfg: { finance: 2.3, tech: 1.3, industry: 0.6, buildingDensity: 1.2 } },
  smart:      { name: '🤖 Smart City', desc: 'Advanced tech: data centers, metro, EV chargers, clean energy.', cfg: { tech: 2.2, infrastructure: 'advanced', industry: 0.7 } },
  dense:      { name: '🌆 Dense Metropolis', desc: 'Tight streets and skyscrapers everywhere.', cfg: { popDensity: 1.8, buildingDensity: 1.6, roadDensity: 1.3, forest: 0.4, infrastructure: 'advanced' } },
  mountain:   { name: '🌄 Mountain World', desc: 'Valleys between peaks, tunnels and mines.', cfg: { mapType: 'mountains', mountains: 1.8, industry: 1.3, popDensity: 0.85 } },
  island:     { name: '🏝 Island World', desc: 'The sea surrounds the city; a harbor and beaches.', cfg: { mapType: 'islands', coast: 'islands', water: 1.5, tourism: 1.5 } },
  coastal:    { name: '🌊 Coastal World', desc: 'A long coastline with a port and waterfront districts.', cfg: { coast: 'side', water: 1.2, tourism: 1.3 } },
  winter:     { name: '❄ Winter World', desc: 'Snowy climate, heating demand and cozy towns.', cfg: { climate: 'cold', weather: 'snow', forest: 1.3 } }
};
const DTYPES = ['DOWNTOWN', 'RESIDENTIAL', 'INDUSTRIAL', 'COMMERCIAL', 'SUBURBS', 'TOURISM', 'TECHNOLOGY', 'ENTERTAINMENT', 'LUXURY'];
const DTYPE_INFO = {
  DOWNTOWN: { zone: 2, color: '#ffd166', names: ['Downtown', 'Central Heights', 'City Center'] },
  RESIDENTIAL: { zone: 1, color: '#06d6a0', names: [' Heights', ' Gardens', ' Park', ' Village'] },
  INDUSTRIAL: { zone: 3, color: '#adb5bd', names: [' Works', ' Industrial', ' Forge', ' Yards'] },
  COMMERCIAL: { zone: 2, color: '#4cc9f0', names: [' Market', ' Square', ' Plaza', ' Exchange'] },
  SUBURBS: { zone: 1, color: '#90be6d', names: [' Suburbs', ' Meadows', ' Fields', ' Grove'] },
  TOURISM: { zone: 6, color: '#f8961e', names: [' Point', ' Bay', ' Promenade', ' Shore'] },
  TECHNOLOGY: { zone: 8, color: '#9b5de5', names: [' Tech Valley', ' Innovation Park', ' Labs', ' Silicon Hill'] },
  ENTERTAINMENT: { zone: 7, color: '#ef476f', names: [' Lights', ' Quarter', ' Arena', ' Boulevard'] },
  LUXURY: { zone: 9, color: '#e9c46a', names: [' Estates', ' Hills', ' Terrace', ' Crown'] }
};
const WG_NAME_PARTS = ['North', 'South', 'East', 'West', 'Oak', 'Maple', 'Cedar', 'Pine', 'Willow', 'Elm', 'River', 'Harbor', 'Lake', 'Stone', 'Iron', 'Silver', 'Golden', 'Crystal', 'Sun', 'Moon',
  'King\'s', 'Queen\'s', 'Grand', 'Old', 'New', 'High', 'Bay', 'Hill', 'Ash', 'Birch', 'Fox', 'Eagle', 'Copper', 'Amber', 'Rose', 'Ivy', 'Bridge', 'Mill', 'Brook', 'Glen'];
const WG = { busy: false, last: null, cfg: null, stages: [], t0: 0, rnd: null };
/* Seeded randomness while a world is generated (same seed → same world); FIX WORLD on a normal city uses Math.random */
function wgR() { return WG.rnd ? WG.rnd() : Math.random(); }
function wgPick(a) { return a[Math.floor(wgR() * a.length)]; }
const WDBG = { on: false, layers: { roads: true, power: true, water: true, jobs: true, homes: true, services: true, traffic: true, broken: true, citizens: true } };

function wgConfig(presetId, overrides) {
  const p = WORLD_PRESETS[presetId] || WORLD_PRESETS.balanced;
  const cfg = Object.assign({}, WG_DEFAULT, p.cfg, overrides || {});
  cfg.preset = WORLD_PRESETS[presetId] ? presetId : (presetId === 'custom' ? 'custom' : 'balanced');
  if (!WORLD_SIZES[cfg.size]) cfg.size = 'LARGE';
  if (!MAP_TYPES[cfg.mapType]) cfg.mapType = 'standard';
  ['water', 'mountains', 'rivers', 'forest', 'roadDensity', 'buildingDensity', 'popDensity', 'industry', 'tourism', 'finance', 'tech', 'traffic', 'economy', 'disasters'].forEach(function (k) { cfg[k] = clamp(Number(cfg[k]) || 0, 0, 3); });
  if (['basic', 'standard', 'advanced', 'green'].indexOf(cfg.infrastructure) < 0) cfg.infrastructure = 'standard';
  if (['temperate', 'cold', 'tropical', 'arid'].indexOf(cfg.climate) < 0) cfg.climate = 'temperate';
  if (['auto', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'heatwave'].indexOf(cfg.weather) < 0) cfg.weather = 'auto';
  if (['none', 'side', 'islands'].indexOf(cfg.coast) < 0) cfg.coast = 'none';
  let seed = cfg.seed;
  if (typeof seed === 'string') seed = parseSeed(seed);
  if (!isFinite(seed) || seed === null || seed < 0) seed = Math.floor(Math.random() * 1000000);
  cfg.seed = (seed | 0) % 1000000;
  cfg.name = String(cfg.name || 'New Metropolis').replace(/[<>]/g, '').trim().slice(0, 32) || 'New Metropolis';
  return cfg;
}

/* ===================================== GENERATION PIPELINE ===================================== */
const WG_STAGES = [
  ['terrain', 'Terrain'], ['water', 'Water'], ['roads', 'Roads'], ['districts', 'Districts'], ['zoning', 'Zoning'], ['utilities', 'Utilities'],
  ['buildings', 'Buildings'], ['businesses', 'Businesses'], ['citizens', 'Citizens'], ['jobs', 'Jobs'], ['transport', 'Transport'],
  ['services', 'Emergency services'], ['economy', 'Economy'], ['traffic', 'Traffic'], ['ai', 'AI'], ['validate', 'World validation'], ['fix', 'Auto fix'], ['start', 'Start simulation']
];
function wgFrame() { return new Promise(function (r) { let d = false; const f = function () { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 30); }); }

async function generateWorld(presetId, overrides) {
  if (WG.busy) { toast('🌍 A world is already being generated', 'bad'); return null; }
  const cfg = wgConfig(presetId, overrides);
  WG.busy = true; WG.cfg = cfg; WG.t0 = performance.now();
  const wasStarted = STARTED;
  let backup = null;
  try { if (S && MAP.roads) backup = JSON.stringify(buildSaveObject()); } catch (e) { backup = null; }
  const prevSlot = S ? (S.slot || 1) : 1;
  showWgProgress(cfg);
  const ctx = { cfg: cfg, rnd: mulberry32((cfg.seed | 0) * 2654435761 + 977 + WORLDGEN_VERSION * 131), t: performance.now(), plan: {}, log: [] };
  WG.rnd = ctx.rnd;
  ctx.tick = async function (stage, p) { wgSetProgress(stage, p); if (performance.now() - ctx.t > 14) { await wgFrame(); ctx.t = performance.now(); } };
  try {
    STARTED = false;
    clearDialogues(); resetAgents();
    const stages = wgStageList(cfg);              // classic 18 steps, or the 22-step GENERATE MEGA WORLD pipeline (Part 10)
    for (let i = 0; i < stages.length; i++) {
      const id = stages[i][0];
      wgSetProgress(id, 0);
      await wgFrame(); ctx.t = performance.now();
      for (let j = 0; j < stages[i][2].length; j++) { const f = stages[i][2][j]; await (WG_RUN[f] || MEGA_RUN[f])(ctx, cfg, prevSlot); }
      wgSetProgress(id, 1);
    }
    const res = ctx.result;
    WG.last = res;
    adminLog('Generated world "' + cfg.name + '" (' + (WORLD_PRESETS[cfg.preset] ? cfg.preset : 'custom') + ', ' + seedLabel() + ', ' + MAP.W + '×' + MAP.H + ', pop ' + fmt(res.population) + ')');
    Log.info('World generated: ' + JSON.stringify(S.p8.world));
    hideWgProgress();
    $('toasts').innerHTML = ''; UI.notifs = UI.notifs.filter(function (n) { return /World "/.test(n.text || n.msg || ''); });
    showWorldResult(res);
    return res;
  } catch (e) {
    Log.error('World generation failed: ' + (e && e.stack || e));
    hideWgProgress();
    if (backup) { S.slot = prevSlot; const r = importSave(backup); if (r.ok && wasStarted) startGame({ isNew: false, notes: ['World generation failed — your previous city was restored.'] }); }
    STARTED = wasStarted && !!backup;
    sysDialog('❌ WORLD GENERATION FAILED', '<p class="small">' + esc(e && e.message || String(e)) + '</p><p class="small">The previous city was restored. Details are in logs/latest.log.</p>', [['OK', '', null]]);
    return null;
  } finally { WG.busy = false; WG.rnd = null; }
}

const WG_RUN = {
  /* --- 1. Terrain: height noise → plains, hills, mountains (rock = too steep for buildings), forests, resource deposits --- */
  terrain: async function (ctx, cfg, prevSlot) {
    const size = WORLD_SIZES[cfg.size];
    const settings = S ? S.settings : defaultSettings();
    S = defaultState(newMeta(), settings, null, null, { name: cfg.name, seed: cfg.seed, difficulty: 'NORMAL', size: size, mapType: cfg.mapType });
    S.slot = cfg.slot >= 1 && cfg.slot <= SLOT_COUNT ? cfg.slot : prevSlot;
    S.city.expansion = maxExpansionFor(size);
    S.settings.speed = 0;
    if (size >= 80) { S.settings.autoQuality = true; if (S.settings.quality === 'ULTRA') S.settings.quality = 'HIGH'; }
    S.tutorial.done = true; S.p5.tut.done = true;
    STORY.forEach(function (c) { S.p5.story.unlocked[c.unlock] = 1; }); S.p5.story.ch = STORY.length;
    S.p6.cfg = { disasters: clamp(cfg.disasters, 0, 3), economy: 'NORMAL', money: cfg.economy };
    resetSim(); initMap(true);
    const W = MAP.W, H = MAP.H, rnd = ctx.rnd, c = W / 2;
    const n1 = makeNoise(rnd, Math.max(8, W / 5)), n2 = makeNoise(rnd, 6), n3 = makeNoise(rnd, 3);
    const elev = new Float32Array(W * H);
    const MT = MAP_TYPES[cfg.mapType];
    const mountainBoost = (cfg.mountains - 1) * 0.12 + (cfg.mapType === 'mountains' ? 0.1 : 0) - (cfg.mapType === 'plains' ? 0.5 : 0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dc = Math.hypot(x - c, y - c) / (W * 0.5);
        let e = n1(x, y) * 0.55 + n2(x, y) * 0.3 + n3(x, y) * 0.15;
        e = e * (0.45 + 0.55 * clamp(dc * 1.4, 0, 1)) + mountainBoost * clamp(dc, 0.2, 1);   // the core stays flat, mountains rise at the edges
        elev[idx(x, y)] = e;
      }
      if (y % 8 === 0) await ctx.tick('terrain', y / H * 0.7);
    }
    ctx.elev = elev;
    const hillT = cfg.mapType === 'plains' ? 9 : Math.min(MT.hill, 0.6), rockT = cfg.mapType === 'plains' ? 9 : Math.min(MT.rock, 0.74);
    let steep = 0;
    for (let i = 0; i < W * H; i++) {
      const e = elev[i];
      MAP.terrain[i] = e > rockT ? TERRAIN.ROCK : e > hillT ? TERRAIN.HILL : TERRAIN.GRASS;
      if (MAP.terrain[i] === TERRAIN.ROCK) steep++;
    }
    ctx.plan.steep = steep;
    // Forests (cleared later where roads and buildings go)
    const fN = makeNoise(rnd, 5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (MAP.terrain[i] === TERRAIN.ROCK) continue;
      const dc = Math.hypot(x - c, y - c) / (W * 0.5);
      if (fN(x, y) > 0.72 - 0.12 * (cfg.forest - 1) - dc * 0.15 && rnd() < 0.8) MAP.nature[i] = 1;
    }
    await ctx.tick('terrain', 1);
  },
  /* --- 2. Water: coasts, rivers, lakes (the city core stays dry) --- */
  water: async function (ctx, cfg) {
    const W = MAP.W, H = MAP.H, rnd = ctx.rnd, c = W / 2, safeR = W * 0.13;
    const safe = function (x, y) { return Math.hypot(x - c, y - c) < safeR; };
    const wet = function (x, y) { if (inMap(x, y) && !safe(x, y)) { const i = idx(x, y); MAP.nature[i] = 2; MAP.terrain[i] = TERRAIN.WATER; } };
    const coast = cfg.coast !== 'none' ? cfg.coast : (cfg.mapType === 'islands' ? 'islands' : 'none');
    const wNoise = makeNoise(rnd, 4);
    if (coast === 'islands') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, y, W - 1 - x, H - 1 - y); if (e < (2.5 + wNoise(x, y) * 3) * (0.7 + 0.3 * cfg.water) * (W / 48)) wet(x, y); }
    } else if (coast === 'side') {
      const side = Math.floor(rnd() * 4), depth = W * (0.08 + 0.05 * cfg.water);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = [y, W - 1 - x, H - 1 - y, x][side];
        if (e < depth + wNoise(x, y) * W * 0.06) wet(x, y);
      }
    }
    await ctx.tick('water', 0.3);
    const MT = MAP_TYPES[cfg.mapType];
    const scale = W / 48;
    const rivers = Math.round(((MT.rivers[0] + MT.rivers[1]) / 2) * cfg.rivers * Math.max(1, scale * 0.8) + (rnd() < 0.3 ? 1 : 0) * (cfg.rivers > 0 ? 1 : 0));
    for (let k = 0; k < rivers; k++) {
      const vertical = rnd() < 0.5;
      let p = rnd() < 0.5 ? 2 + rnd() * W * 0.2 : W - 4 - rnd() * W * 0.2;
      if (k === 0 && rivers > 1) p = c + (rnd() < 0.5 ? -1 : 1) * W * (0.2 + rnd() * 0.1);
      const wdt = W >= 80 ? 3 : 2;
      for (let t = 0; t < W; t++) {
        p += (rnd() - 0.5) * 1.2; p = clamp(p, 1, W - 4);
        for (let q = Math.floor(p); q < Math.floor(p) + wdt; q++) wet(vertical ? q : t, vertical ? t : q);
      }
    }
    await ctx.tick('water', 0.6);
    const lakes = Math.round(((MT.lakes[0] + MT.lakes[1]) / 2) * cfg.water * scale + (cfg.water > 0.6 && rnd() < 0.5 ? 1 : 0));
    for (let k = 0; k < lakes; k++) {
      let lx, ly, tries = 0;
      do { lx = 4 + rnd() * (W - 8); ly = 4 + rnd() * (H - 8); tries++; } while (Math.hypot(lx - c, ly - c) < W * 0.25 && tries < 40);
      const rx = 2.5 + rnd() * 3 * scale, ry = 2 + rnd() * 2.5 * scale;
      for (let y = Math.floor(ly - ry - 2); y <= ly + ry + 2; y++) for (let x = Math.floor(lx - rx - 2); x <= lx + rx + 2; x++) if (Math.hypot((x - lx) / rx, (y - ly) / ry) < 1 + rnd() * 0.15) wet(x, y);
    }
    // Shores become sand; rock next to water becomes hills (no unreachable cliffs at the coast)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y); if (MAP.nature[i] === 2) continue;
      if (isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1)) { MAP.terrain[i] = TERRAIN.SAND; if (MAP.nature[i] === 1) MAP.nature[i] = 0; }
    }
    computeSea();
    wgDeposits(ctx, cfg);
    await ctx.tick('water', 1);
  },
  /* --- 3. Roads: Highway → Major → Medium → Local streets; bridges/tunnels only on the main network --- */
  roads: async function (ctx, cfg) {
    const W = MAP.W, H = MAP.H, c = Math.floor(W / 2);
    const rowStep = cfg.roadDensity >= 1.25 ? 4 : cfg.roadDensity <= 0.7 ? 6 : 5;
    const colStep = cfg.roadDensity >= 1.25 ? 8 : cfg.roadDensity <= 0.7 ? 13 : 10;
    const margin = 2;
    const set = function (x, y, t, crossWater) {
      if (!inMap(x, y)) return;
      const i = idx(x, y);
      if (MAP.nature[i] === 2 && !crossWater) return;
      if (MAP.terrain[i] === TERRAIN.ROCK && t < 3) return;
      MAP.roads[i] = Math.max(MAP.roads[i], t);
      if (MAP.nature[i] === 1) MAP.nature[i] = 0;
    };
    // Highways cross the whole map (to the edges → regional connection; bridges & tunnels allowed)
    for (let x = 0; x < W; x++) set(x, c, 4, true);
    for (let y = 0; y < H; y++) set(c, y, 4, true);
    await ctx.tick('roads', 0.2);
    // Grid rows
    for (let y = margin; y < H - margin; y++) {
      if ((y - c) % rowStep !== 0 || y === c) continue;
      const k = Math.abs((y - c) / rowStep);
      const t = k % 4 === 0 ? 3 : k % 2 === 0 ? 2 : 1;
      for (let x = margin; x < W - margin; x++) set(x, y, t, t >= 3);
    }
    await ctx.tick('roads', 0.45);
    // Grid columns
    for (let x = margin; x < W - margin; x++) {
      if ((x - c) % colStep !== 0 || x === c) continue;
      const k = Math.abs((x - c) / colStep);
      const t = k % 2 === 0 ? 3 : 2;
      for (let y = margin; y < H - margin; y++) set(x, y, t, t >= 3);
    }
    // Ring road (major) at ~60 % of the radius on bigger maps
    if (W >= 64) {
      const R = Math.round(W * 0.3);
      for (let k = -R; k <= R; k++) { set(c + k, c - R, 3, true); set(c + k, c + R, 3, true); set(c - R, c + k, 3, true); set(c + R, c + k, 3, true); }
    }
    await ctx.tick('roads', 0.7);
    // Remove local stubs that lead nowhere (dead ends shorter than 2 tiles next to water/rock)
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < W * H; i++) {
      if (MAP.roads[i] !== 1) continue;
      const x = i % W, y = (i / W) | 0;
      const n = (isRoad(x + 1, y) ? 1 : 0) + (isRoad(x - 1, y) ? 1 : 0) + (isRoad(x, y + 1) ? 1 : 0) + (isRoad(x, y - 1) ? 1 : 0);
      if (n <= 1) MAP.roads[i] = 0;
    }
    onMapChanged();
    wgConnectRoads();
    ctx.plan.rowStep = rowStep; ctx.plan.colStep = colStep;
    await ctx.tick('roads', 1);
  },
  /* --- 4. Districts: seeded regions typed by location (center, water, resources, edges) and preset weights, with generated names --- */
  districts: async function (ctx, cfg) {
    const W = MAP.W, H = MAP.H, rnd = ctx.rnd, c = W / 2;
    const n = Math.max(6, Math.round(W * W / 200));
    const seeds = [];
    for (let k = 0; k < n * 4 && seeds.length < n; k++) {
      const x = 2 + rnd() * (W - 4), y = 2 + rnd() * (H - 4), i = idx(Math.floor(x), Math.floor(y));
      if (MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.ROCK) continue;
      if (seeds.some(function (s) { return Math.hypot(s.x - x, s.y - y) < W / Math.sqrt(n) * 0.7; })) continue;
      seeds.push({ x: x, y: y });
    }
    seeds.push({ x: c + 0.5, y: c + 0.5 });
    // Score each seed for each district type
    const w = { DOWNTOWN: 1, RESIDENTIAL: 1.6, INDUSTRIAL: 0.8 * cfg.industry, COMMERCIAL: 0.7 + 0.2 * cfg.finance, SUBURBS: 1.1, TOURISM: 0.4 * cfg.tourism, TECHNOLOGY: 0.35 * cfg.tech, ENTERTAINMENT: 0.35 + 0.1 * cfg.tourism, LUXURY: 0.3 + 0.1 * cfg.finance };
    const waterNear = function (x, y, r) { let k = 0; for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) if (isWater(xx, yy)) k++; return k; };
    const depNear = function (x, y) { return S.economy.deposits.some(function (d) { return Math.hypot(d.cx - x, d.cy - y) < 7; }); };
    const indDir = rnd() * Math.PI * 2;
    const counts = {};
    seeds.forEach(function (s, k) {
      const dc = Math.hypot(s.x - c, s.y - c) / (W * 0.5);
      const ang = Math.atan2(s.y - c, s.x - c), indSide = Math.cos(ang - indDir) > 0.5;
      const water = waterNear(s.x, s.y, 4), dep = depNear(s.x, s.y);
      let best = 'RESIDENTIAL', bs = -1e9;
      DTYPES.forEach(function (t) {
        let sc = Math.log(1 + w[t]) * 2 + rnd() * 0.9 - (counts[t] || 0) * 0.35;
        if (t === 'DOWNTOWN') sc += dc < 0.18 ? 9 : -9;
        if (t === 'COMMERCIAL') sc += dc < 0.45 ? 1.2 : -0.5;
        if (t === 'LUXURY') sc += (water > 3 ? 1.5 : 0) + (dc > 0.25 && dc < 0.65 ? 0.6 : -0.8);
        if (t === 'TOURISM') sc += water > 4 ? 2 : -0.8;
        if (t === 'INDUSTRIAL') sc += (indSide ? 1.6 : -1) + (dep ? 1.2 : 0) + (dc > 0.45 ? 0.8 : -1.5);
        if (t === 'SUBURBS') sc += dc > 0.6 ? 1.8 : -1.5;
        if (t === 'RESIDENTIAL') sc += dc > 0.2 && dc < 0.75 ? 1 : 0;
        if (t === 'TECHNOLOGY' || t === 'ENTERTAINMENT') sc += dc < 0.6 ? 0.4 : -0.6;
        if (sc > bs) { bs = sc; best = t; }
      });
      if (k === seeds.length - 1) best = 'DOWNTOWN';
      counts[best] = (counts[best] || 0) + 1;
      s.type = best;
    });
    // Assign every land tile to its nearest seed (Voronoi) → district map
    const dmap = new Uint8Array(W * H).fill(255);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let bi = 0, bd = 1e9;
        for (let k = 0; k < seeds.length; k++) { const d = Math.hypot(seeds[k].x - x, seeds[k].y - y) * (seeds[k].type === 'DOWNTOWN' ? 0.85 : 1); if (d < bd) { bd = d; bi = k; } }
        dmap[idx(x, y)] = bi;
      }
      if (y % 12 === 0) await ctx.tick('districts', y / H * 0.8);
    }
    // Names
    const used = {};
    const parts = WG_NAME_PARTS.slice(); for (let i = parts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = parts[i]; parts[i] = parts[j]; parts[j] = t; }
    let pi = 0;
    seeds.forEach(function (s) {
      const info = DTYPE_INFO[s.type];
      let nm;
      if (s.type === 'DOWNTOWN') nm = used.Downtown ? 'Central Heights' : 'Downtown';
      else {
        const water = waterNear(s.x, s.y, 4);
        const base = water > 6 && s.type !== 'INDUSTRIAL' ? (rnd() < 0.5 ? 'Riverside' : 'Harbor') : parts[pi++ % parts.length];
        nm = base + info.names[Math.floor(rnd() * info.names.length)];
        if (base === 'Harbor' && s.type === 'TOURISM') nm = 'Harbor Point';
      }
      let k = 2; const b0 = nm; while (used[nm]) nm = b0 + ' ' + (k++);
      used[nm] = 1; s.name = nm;
    });
    ctx.seeds = seeds; ctx.dmap = dmap;
    await ctx.tick('districts', 1);
  },
  /* --- 5. Zoning: road-side land gets the zone of its district --- */
  zoning: async function (ctx) {
    const W = MAP.W, H = MAP.H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (MAP.roads[i] || MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.ROCK) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (isRoad(x + dx, y + dy)) near = true;
      if (!near) continue;
      const t = ctx.seeds[ctx.dmap[i]].type;
      let z = DTYPE_INFO[t].zone;
      if (t === 'DOWNTOWN') z = (x + y) % 5 === 0 ? 9 : ((x * 7 + y * 3) % 4 === 0 ? 5 : 2);
      if (t === 'COMMERCIAL' && (x * 3 + y) % 6 === 0) z = 5;
      MAP.zone[i] = z;
    }
    ctx.lots = wgBuildLots(ctx);
    await ctx.tick('zoning', 1);
  },
  /* --- 6. Utilities: core power & water plants (topped up after the buildings exist) --- */
  utilities: async function (ctx, cfg) {
    const P = wgTargetPop(cfg);
    ctx.plan.pop = P;
    wgUnlockForInfra(cfg);
    const powerNeed = P * 0.25, waterNeed = P * 0.16;
    if (powerNeed > 2400 || cfg.infrastructure === 'advanced') wgUnlockTech('nuclear');
    if (waterNeed > 1800 || cfg.infrastructure === 'advanced') wgUnlockTech('c_water');
    wgAddPower(ctx, powerNeed);
    await ctx.tick('utilities', 0.5);
    wgAddWater(ctx, waterNeed);
    await ctx.tick('utilities', 1);
  },
  /* --- 7. Buildings: services first (coverage lattice), then housing until it fits the target population --- */
  buildings: async function (ctx, cfg) {
    const P = ctx.plan.pop;
    wgServiceLattice(ctx, 'fire', 'fire', 6);
    wgServiceLattice(ctx, 'police', 'police', 6);
    await ctx.tick('buildings', 0.1);
    wgServiceLattice(ctx, 'hospital', 'health', 9);
    wgServiceLattice(ctx, 'school', 'school', 11);
    await ctx.tick('buildings', 0.2);
    // Housing until capacity ≈ 110 % of the target population
    const want = P * 1.1;
    let cap = 0, guard = 0;
    const order = ['RESIDENTIAL', 'DOWNTOWN', 'SUBURBS', 'RESIDENTIAL', 'LUXURY', 'SUBURBS', 'RESIDENTIAL', 'COMMERCIAL', 'TOURISM', 'ENTERTAINMENT', 'TECHNOLOGY'];
    const full = {};
    while (cap < want && guard++ < 20000) {
      let placed = null;
      for (let k = 0; k < order.length && !placed; k++) {
        const t = order[(guard + k) % order.length];
        if (full[t]) continue;
        const opts = wgHousingOptions(t, cfg);
        for (let j = 0; j < opts.length && !placed; j++) placed = wgPlaceInDistrict(ctx, t, opts[j][0], { level: opts[j][1] + Math.floor(ctx.rnd() * (opts[j][2] || 1)), owner: ctx.rnd() < 0.55 ? pickDevOwner(ctx) : 'player' });
        if (!placed) full[t] = 1;
      }
      if (!placed) break;
      cap += BUILDINGS[placed.type].housing * lvlMult(placed.level);
      if (guard % 25 === 0) await ctx.tick('buildings', 0.2 + 0.8 * Math.min(1, cap / want));
    }
    ctx.plan.housingCap = cap;
    await ctx.tick('buildings', 1);
  },
  /* --- 8. Businesses: jobs by sector (demand-driven), supply chains, warehouses, rival companies own part of the market --- */
  businesses: async function (ctx, cfg) {
    wgSupplyChain(ctx, cfg);
    await ctx.tick('businesses', 0.15);
    // Demand of the planned population decides how much FOOD / SHOPPING / ENTERTAINMENT / FINANCE / TECHNOLOGY the city needs
    const Pplan = Math.round(Math.min(ctx.plan.pop * 1.05, (ctx.plan.housingCap || ctx.plan.pop) * 0.95));
    const keepPop = S.city.population;
    S.city.population = Pplan; onMapChanged(); econTick(1);
    const dem = Object.assign({}, SIM.demand);
    S.city.population = keepPop;
    const SECTOR_OPTS = {
      FOOD: [['COMMERCIAL', ['foodcourt', 'restaurant', 'foodstand']], ['DOWNTOWN', ['foodcourt', 'restaurant']], ['ENTERTAINMENT', ['restaurant', 'foodstand']], ['TOURISM', ['restaurant']], ['RESIDENTIAL', ['restaurant', 'foodstand']], ['SUBURBS', ['foodstand']]],
      SHOPPING: [['COMMERCIAL', ['mall', 'supermarket', 'shop']], ['DOWNTOWN', ['mall', 'supermarket']], ['RESIDENTIAL', ['supermarket', 'shop']], ['SUBURBS', ['shop']], ['LUXURY', ['mall']]],
      ENTERTAINMENT: [['ENTERTAINMENT', ['cinema', 'nightclub', 'gym']], ['DOWNTOWN', ['cinema', 'nightclub']], ['COMMERCIAL', ['gym', 'cinema']], ['RESIDENTIAL', ['gym']]],
      TECHNOLOGY: [['TECHNOLOGY', ['techcampus', 'office', 'startup', 'datacenter']], ['DOWNTOWN', ['office', 'techcampus']], ['COMMERCIAL', ['office']]],
      FINANCE: [['DOWNTOWN', ['stockexchange', 'bank']], ['COMMERCIAL', ['bank']], ['LUXURY', ['bank']]]
    };
    const capOf = function (b) { const d = BUILDINGS[b.type]; return (d.cap || 0) * lvlMult(b.level); };
    const sectors = Object.keys(SECTOR_OPTS);
    let stepN = 0;
    for (let si = 0; si < sectors.length; si++) {
      const sec = sectors[si], opts = SECTOR_OPTS[sec], dead = {};
      const want = (dem[sec] || 0) * 1.12;
      let cap = 0; S.buildings.list.forEach(function (b) { if (BUILDINGS[b.type].sector === sec) cap += capOf(b); });
      let guard = 0;
      while (cap < want && guard++ < 3000) {
        let placed = null;
        for (let k = 0; k < opts.length && !placed; k++) {
          const o = opts[(guard + k) % opts.length]; if (dead[o[0]]) continue;
          const types = o[1].filter(function (t) { return wgAllowed(t, cfg); });
          const staff = { DOWNTOWN: 1, COMMERCIAL: 0.8, TECHNOLOGY: 0.8, ENTERTAINMENT: 0.6, TOURISM: 0.6, LUXURY: 0.6 }[o[0]] || 0.4;
          // big formats only while a lot of demand is left, so the last gap is closed with small shops
          const left = want - cap;
          for (let j = 0; j < types.length && !placed; j++) {
            if (BUILDINGS[types[j]].cap > left * 1.6 && j < types.length - 1) continue;
            placed = wgPlaceInDistrict(ctx, o[0], types[j], { level: 1 + Math.floor(ctx.rnd() * (o[0] === 'DOWNTOWN' ? 2 : 1.5)), owner: wgBusinessOwner(ctx, sec), staff: staff * (0.75 + 0.5 * ctx.rnd()) });
          }
          if (!placed) dead[o[0]] = 1;
        }
        if (!placed) break;
        cap += capOf(placed);
        if (++stepN % 20 === 0) await ctx.tick('businesses', 0.15 + 0.5 * (si + Math.min(1, cap / Math.max(1, want))) / sectors.length);
      }
    }
    // Tourism: hotels, museums and attractions scale with the preset
    const tour = Math.round(Pplan / 2600 * cfg.tourism);
    const TOUR = ['hotel', 'museum', 'hotel', 'stadium', 'hotel', 'themepark'];
    for (let k = 0; k < tour; k++) { const t = TOUR[k % TOUR.length]; if (wgAllowed(t, cfg)) wgPlaceAnywhere(ctx, t, { districts: ['TOURISM', 'ENTERTAINMENT', 'DOWNTOWN', 'LUXURY'], owner: wgBusinessOwner(ctx, 'TOURISM'), clearLocal: d3(t) }); }
    await ctx.tick('businesses', 0.7);
    // Industry employs the rest of the labour force (factories export goods; warehouses keep the chains moving)
    const laborPlan = Pplan * 0.55;
    let jobs = wgJobsTheo(), guard = 0, ind = 0;
    const IND = ['factory', 'factory', 'megafactory', 'warehouse', 'factory', 'smelter'];
    while (jobs < laborPlan * 0.95 && guard++ < 2000) {
      const t = IND[ind++ % IND.length]; if (!wgAllowed(t, cfg)) continue;
      const b = wgPlaceInDistrict(ctx, 'INDUSTRIAL', t, { owner: wgBusinessOwner(ctx, 'INDUSTRY'), staff: 0.7 + 0.3 * ctx.rnd() }) || wgPlaceInDistrict(ctx, 'SUBURBS', t === 'smelter' ? 'factory' : t, { owner: wgBusinessOwner(ctx, 'INDUSTRY'), staff: 0.6 });
      if (!b) break;
      jobs += b.workers;
      if (guard % 20 === 0) await ctx.tick('businesses', 0.7 + 0.25 * Math.min(1, jobs / laborPlan));
    }
    wgAssignRecipes(ctx);
    // Parks & plazas in leftover inner lots (noRoad buildings)
    const parks = Math.round(Pplan / 450 * (0.6 + 0.4 * cfg.forest));
    for (let k = 0; k < parks; k++) wgPlaceAnywhere(ctx, ctx.rnd() < 0.25 && wgAllowed('plaza', cfg) ? 'plaza' : 'park', { districts: ['RESIDENTIAL', 'SUBURBS', 'DOWNTOWN', 'LUXURY', 'COMMERCIAL', 'TOURISM'] });
    await ctx.tick('businesses', 1);
  },
  /* --- 9. Citizens: the population moves into the homes; agents get home, job, income, needs and routines --- */
  citizens: async function (ctx) {
    onMapChanged();
    wgTopUpUtilities(ctx);                    // homes only count fully with power & water
    await ctx.tick('citizens', 0.5);
    econTick(1);
    const cap = Math.max(SIM.housingCap || 0, wgHousingTheo());
    let jobs = 0; S.buildings.list.forEach(function (b) { if (BUILDINGS[b.type].workers) jobs += b.workers; });
    ctx.plan.jobsCap = jobs;
    const P = Math.min(ctx.plan.pop, Math.floor(cap * 0.94));
    S.city.population = P; S.city.peakPop = P; S.meta.bestPop = Math.max(S.meta.bestPop, P); S.city.level = cityLevel();   // no level-up rewards for generated growth
    S.city.happiness = 72; S.city.reputation = 62; S.city.education = 45; S.city.skill = 48;
    S.city.tourismUnlocked = P >= 1500;
    ctx.plan.pop = P;
    await ctx.tick('citizens', 1);
  },
  /* --- 10. Jobs: balance workplaces against the labour force (55 % of the population) --- */
  jobs: async function (ctx, cfg) {
    onMapChanged(); econTick(1);
    const labor = S.city.population * 0.55;
    let guard = 0;
    if (SIM.jobs < labor * 0.92) {
      S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if (d.maxW > b.workers && !d.public && d.workers) b.workers = d.maxW; });
      onMapChanged(); econTick(1);
    }
    while (SIM.jobs < labor * 0.92 && guard++ < 400) {
      const b = wgPlaceInDistrict(ctx, wgPick(['COMMERCIAL', 'INDUSTRIAL', 'TECHNOLOGY', 'DOWNTOWN']), wgPick(['office', 'factory', 'supermarket', 'restaurant']), { owner: 'player' }) ||
        wgPlaceAnywhere(ctx, wgPick(['office', 'restaurant', 'shop']), {});
      if (!b) break;
      SIM.jobs += b.workers;
      if (guard % 15 === 0) await ctx.tick('jobs', Math.min(0.9, SIM.jobs / labor));
    }
    wgAssignRecipes(ctx);
    wgBalanceHousingJobs(ctx);
    await ctx.tick('jobs', 1);
  },
  /* --- 11. Transport: bus stops along the big roads, metro, rail, airport, harbor --- */
  transport: async function (ctx, cfg) {
    const W = MAP.W, big = W >= 64, adv = cfg.infrastructure === 'advanced' || cfg.preset === 'megacity' || W >= 80;
    const stops = Math.max(4, Math.round(W * W / 110));
    let placed = 0;
    for (let k = 0; k < stops * 6 && placed < stops; k++) { if (wgPlaceAnywhere(ctx, 'busstop', { nearRoadType: 2 })) placed++; }
    await ctx.tick('transport', 0.3);
    if (big || adv) {
      wgUnlockTech('metro');
      const metros = Math.max(3, Math.round(W / 9));
      for (let k = 0; k < metros; k++) wgPlaceAnywhere(ctx, 'metro', { nearRoadType: 3, spread: 9 });
      wgUnlockTech('rail');
      wgPlaceAnywhere(ctx, 'trainstation', { districts: ['DOWNTOWN', 'COMMERCIAL', 'INDUSTRIAL'], nearRoadType: 3 });
      if (W >= 80) wgPlaceAnywhere(ctx, 'trainstation', { districts: ['RESIDENTIAL', 'SUBURBS', 'INDUSTRIAL'], nearRoadType: 3 });
    }
    wgPlaceAnywhere(ctx, 'taxi', { districts: ['DOWNTOWN', 'COMMERCIAL'] });
    await ctx.tick('transport', 0.6);
    if (W >= 80 || (big && (cfg.tourism >= 1.4 || cfg.finance >= 1.4 || adv))) { wgUnlockTech('aviation'); wgPlaceAnywhere(ctx, 'airport', { clearLocal: true, districts: ['SUBURBS', 'INDUSTRIAL', 'RESIDENTIAL'] }); }
    if (big && MAP.sea.some(function (v) { return v; })) wgPlaceAnywhere(ctx, 'port', { clearLocal: true });
    if (cfg.infrastructure === 'advanced' || cfg.tech >= 1.5) { wgUnlockTech('t_ev'); for (let k = 0; k < Math.round(W / 16); k++) wgPlaceAnywhere(ctx, 'evcharger', {}); }
    for (let k = 0; k < Math.round(W / 14); k++) wgPlaceAnywhere(ctx, 'gasstation', {});
    await ctx.tick('transport', 1);
  },
  /* --- 12. Emergency services: coverage check & top-up (fire, police, hospital, maintenance) --- */
  services: async function (ctx) {
    onMapChanged();
    wgFixCoverage('fire'); wgFixCoverage('police');
    await ctx.tick('services', 0.5);
    wgFixCoverage('health'); wgFixSchools();
    const depots = Math.max(1, Math.round(MAP.W / 24));
    for (let k = 0; k < depots; k++) wgPlaceAnywhere(ctx, 'maintdepot', { spread: 12 });
    if (!countAny('university') && ctx.plan.pop > 3000) wgPlaceAnywhere(ctx, 'university', { districts: ['TECHNOLOGY', 'DOWNTOWN', 'RESIDENTIAL'] });
    if (ctx.plan.pop >= 5000 && !countAny('cityhall')) wgPlaceAnywhere(ctx, 'cityhall', { districts: ['DOWNTOWN'], clearLocal: true });
    wgAddWaste(ctx);
    if (S.p10) { const r = p10WorldgenServices(); if (r) ctx.log.push('🎓 ' + r); }       // Part 10: high schools, colleges, clinics
    await ctx.tick('services', 1);
  },
  /* --- 13. Economy: utilities sized to the real demand, starting money, stocks, taxes; settle the simulation --- */
  economy: async function (ctx, cfg) {
    onMapChanged(); econTick(1);
    wgTopUpUtilities(ctx);
    await ctx.tick('economy', 0.3);
    const W = MAP.W, e = cfg.economy;
    S.money = Math.min(MONEY_CAP, Math.round((60000 + ctx.plan.pop * 12) * e));
    S.budget = Math.min(MONEY_CAP, Math.round((120000 + ctx.plan.pop * 25) * e));
    S.city.tax = 11;
    PRODUCT_IDS.forEach(function (p) { S.economy.inventory[p] = Math.round(80 + ctx.plan.pop / 60); });
    S.economy.goodsStock = Math.round(ctx.plan.pop / 10);
    AI_DEFS.forEach(function (a) { if (S.ai[a.id]) S.ai[a.id].cash = Math.round((25000 + ctx.plan.pop * 3) * e); });
    S.p5.econ.phase = e >= 1.3 ? 'BOOM' : e <= 0.6 ? 'SLOWDOWN' : 'NORMAL'; S.p5.econ.until = 480;
    if (cfg.preset === 'smart' || cfg.infrastructure === 'advanced') wgUnlockForInfra(cfg);
    // Settle: run the economy for a simulated minute and correct an unsustainable budget
    for (let k = 0; k < 6; k++) { econTick(1); }
    let guard = 0;
    while (SIM.bNet < 0 && S.city.tax < 16 && guard++ < 6) { S.city.tax++; econTick(1); }
    if (SIM.bNet < 0) S.budget = Math.min(MONEY_CAP, S.budget + Math.abs(SIM.bNet) * 3600);
    let jobsNow = 0; S.buildings.list.forEach(function (b) { if (BUILDINGS[b.type].workers) jobsNow += b.workers; });
    const P = Math.min(Math.floor(wgHousingTheo() * 0.94), Math.floor(jobsNow / 0.55));   // installed capacity (staffing catches up once people move in)   // nobody is left without a home, and most people have a job
    if (P < S.city.population) { S.city.population = P; ctx.plan.pop = P; econTick(1); }
    if (P > S.city.population) { S.city.population = P; S.city.peakPop = Math.max(S.city.peakPop, P); S.city.level = cityLevel(); S.city.tourismUnlocked = S.city.tourismUnlocked || P >= 1500; ctx.plan.pop = P; econTick(1); }
    await ctx.tick('economy', 1);
  },
  /* --- 14. Traffic: citizens and vehicles start their routines (home → work → shop → home), buses on routes --- */
  traffic: async function (ctx) {
    resetAgents();
    const q = perf(), n = Math.min(Math.floor(q.npc * PERF.scale), Math.floor(S.city.population));
    for (let k = 0; k < n; k++) spawnCitizen(false);
    AG.citizens.forEach(function (c) { if (c.inside && Math.random() < 0.35) c.insideUntil = S.clock.gameSec + rand(30, 600); });
    await ctx.tick('traffic', 0.5);
    const veh = Math.floor(q.veh * PERF.scale * 0.5);
    for (let k = 0; k < veh; k++) spawnAmbientVehicle(k % 5 === 0 ? 'truck' : (k % 9 === 0 ? 'garbage' : 'car'));
    const stops = busRouteStops();
    for (let k = 0; k < Math.min(8, Math.ceil(stops.length / 2)); k++) spawnBus(k);
    await ctx.tick('traffic', 1);
  },
  /* --- 15. AI: rival companies get their state; districts & names for the city --- */
  ai: async function (ctx) {
    AI_DEFS.forEach(function (a) { const st = S.ai[a.id]; if (!st) return; st.rep = 55 + ctx.rnd() * 15; st.quality = 0.95 + ctx.rnd() * 0.2; let n = 0; S.buildings.list.forEach(function (b) { if (b.owner === a.id) n++; }); st.count = n; });
    computeDistricts();
    wgStoreDistrictNames(ctx);
    computeDistrictNames();
    await ctx.tick('ai', 1);
  },
  /* --- 16-17. Validation and automatic repair (up to 3 rounds) --- */
  validate: async function (ctx) {
    ctx.report = validateWorld();
    await ctx.tick('validate', 1);
  },
  fix: async function (ctx) {
    let rounds = 0;
    while (!ctx.report.liveable && rounds++ < 3) {
      ctx.fixLog = (ctx.fixLog || []).concat(fixWorld(true).actions);
      await ctx.tick('fix', rounds / 3);
      ctx.report = validateWorld();
    }
    if (S.p9) { const u = p9AutoFixUtilities(); if (u) ctx.fixLog = (ctx.fixLog || []).concat(['🔌 Part 9 networks: ' + u]); ctx.report = validateWorld(); }   // substations, sewage plants, pumps
    await ctx.tick('fix', 1);
  },
  /* --- 18. Start: world profile, save, simulation running --- */
  start: async function (ctx, cfg) {
    const r = ctx.report, h = worldHealth();
    applyClimate(cfg);
    let companies = 0; S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if (d.rev || d.goods || d.extract || d.storage) companies++; });
    S.p8.world = {
      seed: cfg.seed, seedLabel: seedLabel(), preset: cfg.preset, mapType: cfg.mapType, size: MAP.W, sizeName: cfg.size, climate: cfg.climate,
      population: Math.floor(S.city.population), buildings: S.buildings.list.length, roads: MAP.roadCount, companies: companies, vehicles: AG.vehicles.length,
      districts: ctx.seeds.map(function (s) { return { name: s.name, type: s.type, x: Math.round(s.x), y: Math.round(s.y) }; }),
      cellNames: S.p8.world ? S.p8.world.cellNames : [],
      economy: { money: Math.round(S.money), budget: Math.round(S.budget), tax: S.city.tax, phase: S.p5.econ.phase },
      health: h.overall, status: r.liveable ? 'LIVEABLE' : 'NEEDS ATTENTION', generationVersion: WORLDGEN_VERSION, generatedAt: new Date().toISOString(),
      settings: Object.assign({}, cfg)
    };
    S.p8.world.cellNames = ctx.cellNames || [];
    // A generated city starts mature: level rewards, tutorial missions and starter quests are already behind it
    S.city.level = cityLevel();
    S.quests.mission = MISSIONS.length;
    SIDE_QUESTS.forEach(function (q) { S.quests.side[q.id] = 1; });
    S.clock.runSec = 0; milestoneTick();
    if (S.p9) { S.p9.timeline = []; S.p9.history = []; S.p9.stats.worldsBuilt++; timelineAdd('🌍', 'World generated: ' + (WORLD_PRESETS[cfg.preset] ? WORLD_PRESETS[cfg.preset].name : 'custom world') + ' (' + seedLabel() + ')', 'founded', 'Your city was founded in ' + S.p9.foundedYear + ' as a planned ' + (WORLD_PRESETS[cfg.preset] ? WORLD_PRESETS[cfg.preset].name.toLowerCase() : 'world') + '.'); }
    setActiveSlot(S.slot);
    CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; CAM.zoom = MAP.W >= 80 ? 0.6 : MAP.W >= 64 ? 0.75 : 0.9;
    S.settings.speed = 1;
    saveGame(true);
    startGame({ isNew: true, notes: ['🌍 World "' + S.city.name + '" generated (' + (WORLD_PRESETS[cfg.preset] ? WORLD_PRESETS[cfg.preset].name : 'Custom world') + ', ' + seedLabel() + ').'] });
    ctx.result = {
      name: S.city.name, seed: seedLabel(), preset: cfg.preset, size: MAP.W, population: Math.floor(S.city.population), buildings: S.buildings.list.length, roads: MAP.roadCount,
      companies: companies, vehicles: AG.vehicles.length, districts: ctx.seeds.length, report: r, health: h, fixes: ctx.fixLog || [], seconds: (performance.now() - WG.t0) / 1000,
      p10score: ctx.p10score || null, mega: !!cfg.mega, steps: wgStageList(cfg).length
    };
    if (S.p10 && ctx.p10score) S.p10.genScore = ctx.p10score;
  }
};

/* ===================================== GENERATION HELPERS ===================================== */
function wgTargetPop(cfg) {
  const base = WORLD_POP_BASE[WORLD_SIZES[cfg.size]] || 15000;
  const landShare = MAP.terrain.reduce(function (a, t) { return a + (t === TERRAIN.WATER || t === TERRAIN.ROCK ? 0 : 1); }, 0) / (MAP.W * MAP.H);
  return Math.max(1500, Math.round(base * cfg.popDensity * (0.55 + 0.45 * cfg.buildingDensity) * clamp(landShare / 0.7, 0.45, 1.15)));
}
function wgDeposits(ctx, cfg) {
  const W = MAP.W, H = MAP.H, rnd = ctx.rnd, c = W / 2;
  MAP.res.fill(0); S.economy.deposits = [];
  const sc = W / 40, ind = 0.6 + 0.4 * cfg.industry;
  const plan = [['iron', 2, [TERRAIN.ROCK, TERRAIN.HILL]], ['coal', 2, [TERRAIN.HILL, TERRAIN.GRASS]], ['oil', 1.5, [TERRAIN.GRASS, TERRAIN.SAND]], ['rare', 1.2, [TERRAIN.ROCK, TERRAIN.HILL]], ['wood', 2.5, [TERRAIN.GRASS, TERRAIN.HILL]]];
  plan.forEach(function (pl) {
    const type = pl[0], R = RESOURCE_TYPES[type], count = Math.max(1, Math.round(pl[1] * sc * ind));
    for (let k = 0; k < count && S.economy.deposits.length < 88; k++) {
      let cx, cy, ok = false;
      for (let tries = 0; tries < 80 && !ok; tries++) {
        cx = 3 + Math.floor(rnd() * (W - 6)); cy = 3 + Math.floor(rnd() * (H - 6));
        const t = MAP.terrain[idx(cx, cy)];
        ok = Math.hypot(cx - c, cy - c) > W * 0.18 && t !== TERRAIN.WATER && !MAP.res[idx(cx, cy)] && (pl[2].indexOf(t) >= 0 || tries > 50);
      }
      if (!ok) continue;
      const di = S.economy.deposits.length, amt = Math.round(R.min + rnd() * (R.max - R.min));
      S.economy.deposits.push({ type: type, amount: amt, max: amt, cx: cx, cy: cy });
      const rad = 1.5 + rnd() * 1.3;
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
        if (!inMap(x, y) || Math.hypot(x - cx, y - cy) > rad || MAP.terrain[idx(x, y)] === TERRAIN.WATER) continue;
        MAP.res[idx(x, y)] = di + 1;
        if (type === 'wood') MAP.nature[idx(x, y)] = 1;
      }
    }
  });
}
/* Every land tile next to a road, shuffled once per district (seeded) */
function wgBuildLots(ctx) {
  const lots = {}; DTYPES.forEach(function (t) { lots[t] = { list: [], ptr: 0 }; });
  lots.ANY = { list: [], ptr: 0 };
  const W = MAP.W, H = MAP.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (MAP.roads[i] || MAP.nature[i] === 2) continue;
    const t = ctx.seeds[ctx.dmap[i]].type;
    lots[t].list.push(i); lots.ANY.list.push(i);
  }
  const rnd = ctx.rnd;
  for (const k in lots) { const a = lots[k].list; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } }
  return lots;
}
/* Generator placement rules (free of money/unlock checks, but terrain, roads, water and deposits are respected) */
function wgCanPlace(d, x, y) {
  if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) return false;
  let resOk = !d.extract;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (MAP.nature[i] === 2 || MAP.roads[i] || MAP.occ[i]) return false;
    if (MAP.terrain[i] === TERRAIN.ROCK && !d.extract) return false;
    if (d.extract && MAP.res[i]) { const dep = S.economy.deposits[MAP.res[i] - 1]; if (dep && dep.type === d.extract.type && dep.amount > 0) resOk = true; }
  }
  if (!resOk) return false;
  if (d.needsWater && !adjacentWater(d, x, y, false)) return false;
  if (d.needsSea && !adjacentWater(d, x, y, true)) return false;
  if (!d.noRoad && !hasRoadNext(d, x, y)) return false;
  if (d.unique && countAny(d.id)) return false;
  return true;
}
function wgZoneFor(d) { const pref = [4, 1, 2, 3, 5, 6, 7, 8, 9]; for (let k = 0; k < pref.length; k++) if (zoneAllows(pref[k], d)) return pref[k]; return 0; }
function wgCommit(type, x, y, opts) {
  const d = BUILDINGS[type];
  opts = opts || {};
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (MAP.nature[i] === 1) MAP.nature[i] = 0;
    if (MAP.zone[i] && !zoneAllows(MAP.zone[i], d)) MAP.zone[i] = wgZoneFor(d);
    if (!d.extract && MAP.terrain[i] === TERRAIN.HILL && d.w * d.h >= 9) MAP.terrain[i] = TERRAIN.GRASS;
  }
  const b = makeBuilding(type, x, y);
  b.built = true; b.progress = 1;
  b.level = clamp(opts.level | 0 || 1, 1, MAX_LEVEL);
  if (opts.owner && !d.public) b.owner = opts.owner;
  if (opts.recipe && d.recipes && d.recipes.indexOf(opts.recipe) >= 0) b.recipe = opts.recipe;
  if (opts.staff && d.maxW > d.workers) b.workers = Math.round(d.workers + (d.maxW - d.workers) * clamp(opts.staff, 0, 1));
  if (d.unlock && d.unlock.tech) wgUnlockTech(d.unlock.tech);
  b._eff = 1;
  addBuildingToMap(b);
  return b;
}
function wgPlaceInDistrict(ctx, dtype, type, opts) {
  const d = BUILDINGS[type]; if (!d) return null;
  const L = ctx.lots[dtype]; if (!L) return null;
  const a = L.list, W = MAP.W;
  for (let n = 0; n < a.length; n++) {
    const k = (L.ptr + n) % a.length, i = a[k];
    const x = i % W, y = (i / W) | 0;
    if (MAP.occ[i] || MAP.roads[i]) continue;
    if (wgCanPlace(d, x, y)) { L.ptr = (k + 1) % a.length; return wgCommit(type, x, y, opts); }
  }
  return null;
}
/* Place anywhere (optionally limited to districts, near a road class, spread from same type, clearing local streets for big footprints) */
function wgPlaceAnywhere(ctx, type, o) {
  const d = BUILDINGS[type]; if (!d) return null;
  o = o || {};
  const W = MAP.W, lists = o.districts ? o.districts.map(function (t) { return ctx && ctx.lots ? ctx.lots[t] : null; }).filter(Boolean) : [ctx && ctx.lots ? ctx.lots.ANY : null];
  const same = o.spread ? S.buildings.list.filter(function (b) { return b.type === type; }) : [];
  const roadOk = function (x, y) {
    if (!o.nearRoadType) return true;
    for (let yy = y - 1; yy <= y + d.h; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) if (inMap(xx, yy) && MAP.roads[idx(xx, yy)] >= o.nearRoadType) return true;
    return false;
  };
  const tryAt = function (x, y) {
    if (o.spread && same.some(function (b) { return Math.hypot(b.x - x, b.y - y) < o.spread; })) return null;
    if (!roadOk(x, y)) return null;
    if (wgCanPlace(d, x, y)) return wgCommit(type, x, y, o);
    if (o.clearSmall && wgClearForService(d, x, y) && wgCanPlace(d, x, y)) return wgCommit(type, x, y, o);
    if (o.clearLocal && wgClearLocalRoads(d, x, y)) { const b = wgCommit(type, x, y, o); onMapChanged(); wgConnectRoads(); return b; }
    return null;
  };
  if (lists[0]) {
    for (let li = 0; li < lists.length; li++) {
      const a = lists[li].list;
      for (let n = 0; n < a.length; n++) { const i = a[n]; if (MAP.occ[i] || MAP.roads[i]) continue; const b = tryAt(i % W, (i / W) | 0); if (b) return b; }
    }
    return null;
  }
  // No district plan (FIX WORLD on any city): scan the unlocked land from the center outwards
  const r = unlockedRect(), cx = (r.x0 + r.x1) >> 1, cy = (r.y0 + r.y1) >> 1, R = Math.max(r.x1 - r.x0, r.y1 - r.y0);
  for (let rr = 0; rr <= R; rr++) for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rr || !inUnlocked(x, y) || !inUnlocked(x + d.w - 1, y + d.h - 1)) continue;
    const b = tryAt(x, y); if (b) return b;
  }
  return null;
}
/* Big footprints (airport, port, stadium…) may replace local streets inside their area if the area stays connected */
function wgClearLocalRoads(d, x, y) {
  if (x < 1 || y < 1 || x + d.w >= MAP.W || y + d.h >= MAP.H) return false;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (MAP.nature[i] === 2 || MAP.occ[i] || MAP.roads[i] > 1 || (MAP.terrain[i] === TERRAIN.ROCK && !d.extract)) return false;
  }
  let edge = false;
  for (let yy = y - 1; yy <= y + d.h && !edge; yy++) for (let xx = x - 1; xx <= x + d.w && !edge; xx++) {
    if (xx >= x && xx < x + d.w && yy >= y && yy < y + d.h) continue;
    if (isRoad(xx, yy)) edge = true;
  }
  if (!edge) return false;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) MAP.roads[idx(xx, yy)] = 0;
  if (d.needsSea && !adjacentWater(d, x, y, true)) return false;
  return true;
}
function wgUnlockTech(id) {
  const t = TECHS[id]; if (!t || hasTech(id) || t.ng) return;
  (t.req || []).forEach(wgUnlockTech);
  S.technology.unlocked.push(id);
}
function wgUnlockForInfra(cfg) {
  const lvl = { basic: 6, standard: 18, green: 18, advanced: 40 }[cfg.infrastructure] || 18;
  TECH_LIST.filter(function (t) { return !t.ng; }).sort(function (a, b) { return a.cost - b.cost; }).slice(0, lvl).forEach(function (t) { wgUnlockTech(t.id); });
  if (cfg.infrastructure === 'green') ['solar', 'wind', 'env_recycle'].forEach(wgUnlockTech);
  if (cfg.infrastructure === 'advanced') ['c_highrise', 'nuclear', 'c_water', 'metro', 'rail', 'automation', 'b_tech', 'b_finance'].forEach(wgUnlockTech);
}
function wgAllowed(type, cfg) {
  const d = BUILDINGS[type]; if (!d || d.hidden) return false;
  const u = d.unlock || {};
  if (u.ng || u.company) return false;
  if (u.tech && !hasTech(u.tech)) {
    const adv = cfg && (cfg.infrastructure === 'advanced' || cfg.tech >= 1.4 || cfg.finance >= 1.6);
    if (!adv) return false;
    wgUnlockTech(u.tech);
  }
  return true;
}
function wgHousingOptions(t, cfg) {
  const hi = wgAllowed('skyscraper', cfg), lux = wgAllowed('luxurytower', cfg), condo = wgAllowed('condo', cfg) || true;
  if (condo) wgUnlockTech('c_zoning');
  const r = wgR;
  if (t === 'DOWNTOWN') return [hi && r() < 0.4 ? ['skyscraper', 1, 2] : null, lux && r() < 0.4 ? ['luxurytower', 1, 2] : null, ['condo', 2, 3], ['apartment', 3, 4]].filter(Boolean);
  if (t === 'LUXURY') return [lux && r() < 0.5 ? ['luxurytower', 1, 2] : null, ['condo', 1, 3], ['apartment', 2, 3]].filter(Boolean);
  if (t === 'RESIDENTIAL') return r() < 0.15 ? [['condo', 1, 2], ['apartment', 2, 4]] : r() < 0.1 ? [['socialhousing', 1, 2], ['apartment', 2, 4]] : [['apartment', 2, 4], ['house', 2, 3]];
  if (t === 'SUBURBS') return r() < 0.7 ? [['house', 1, 4], ['apartment', 1, 2]] : [['apartment', 1, 3], ['house', 1, 3]];
  return [['apartment', 2, 3], ['condo', 1, 2]];
}
function pickDevOwner(ctx) { const devs = AI_DEFS.filter(function (a) { return a.kind === 'dev'; }); return devs.length ? devs[Math.floor(ctx.rnd() * devs.length)].id : 'player'; }
function wgBusinessOwner(ctx, sec) {
  const rivals = AI_DEFS.filter(function (a) { return a.kind === 'rival' && a.sectors.indexOf(sec) >= 0 && S.ai[a.id] && !S.ai[a.id].acquired; });
  if (!rivals.length || ctx.rnd() < 0.45) return 'player';
  return rivals[Math.floor(ctx.rnd() * rivals.length)].id;
}
function wgSectorJobs(sec) {
  let j = 0;
  S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if ((d.sector === sec) || (sec === 'INDUSTRY' && (d.cat === 'Industry' || d.cat === 'Resources' || d.cat === 'Logistics')) || (sec === 'TOURISM' && d.tour && !d.landmark)) j += b.workers; });
  return j;
}
/* Housing ⇄ jobs balance: when the city is full, labour (55 % of residents) ≈ jobs, so unemployment settles around 5 % */
function wgHousingTheo() { let h = 0; S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type]; if (d.housing) h += d.housing * lvlMult(b.level); }); return h; }
function wgJobsTheo() { let j = 0; S.buildings.list.forEach(function (b) { if (BUILDINGS[b.type].workers) j += b.workers; }); return j; }
function wgBalanceHousingJobs(ctx) {
  for (let guard = 0; guard < 800; guard++) {
    const H = wgHousingTheo(), want = wgJobsTheo() / 0.55 / 0.95;
    const homes = S.buildings.list.filter(function (b) { return BUILDINGS[b.type].housing; });
    if (H > want * 1.04) {
      const hi = homes.filter(function (b) { return b.level > 1; }).sort(function (a, b) { return b.level * BUILDINGS[b.type].housing - a.level * BUILDINGS[a.type].housing; })[0];
      if (hi) { hi.level--; continue; }
      const small = homes.filter(function (b) { return b.type === 'house' || b.type === 'apartment'; })[0];
      if (!small) break;
      const x = small.x, y = small.y; removeBuilding(small); if (wgCanPlace(BUILDINGS.park, x, y)) wgCommit('park', x, y, {});
    } else if (H < want * 0.97) {
      const lo = homes.filter(function (b) { return b.level < 6; }).sort(function (a, b) { return a.level - b.level; })[0];
      if (lo && guard % 4) { lo.level++; continue; }
      if (!wgPlaceAnywhere(ctx, hasTech('c_zoning') ? 'condo' : 'apartment', { districts: ctx && ctx.lots ? ['RESIDENTIAL', 'SUBURBS', 'DOWNTOWN', 'LUXURY'] : null, level: 2 }) && !lo) break;
      if (lo) lo.level++;
    } else break;
  }
  onMapChanged();
}
/* Supply chains: farm → wheat → flour mill → bakery; mines → smelter → metal → electronics; wood/coal/oil; warehouses */
function wgSupplyChain(ctx, cfg) {
  const ind = Math.max(0.4, cfg.industry), P = ctx.plan.pop;
  const n = function (base) { return Math.max(1, Math.round(base * ind * P / 10000)); };
  for (let k = 0; k < n(3); k++) wgPlaceAnywhere(ctx, 'farm', { districts: ['SUBURBS', 'INDUSTRIAL'], recipe: k % 2 ? 'wheat' : 'food', owner: wgBusinessOwner(ctx, 'INDUSTRY') });
  for (let k = 0; k < n(1); k++) wgPlaceAnywhere(ctx, 'flourmill', { districts: ['INDUSTRIAL', 'SUBURBS'], recipe: 'flour' });
  for (let k = 0; k < n(2); k++) wgPlaceAnywhere(ctx, 'bakery', { districts: ['COMMERCIAL', 'RESIDENTIAL', 'INDUSTRIAL'], recipe: 'bread' });
  // Extractors on their deposits (a spur road is built if needed)
  const ext = { iron: 'ironmine', coal: 'coalmine', rare: 'raremine', wood: 'lumbermill', oil: 'oilwell' };
  S.economy.deposits.forEach(function (dep) {
    const type = ext[dep.type]; if (!type || ctx.rnd() > 0.55 + 0.25 * ind) return;
    const d = BUILDINGS[type];
    for (let y = dep.cy - 3; y <= dep.cy + 2; y++) for (let x = dep.cx - 3; x <= dep.cx + 2; x++) {
      if (!wgCanPlaceIgnoringRoad(d, x, y)) continue;
      if (!hasRoadNext(d, x, y)) { if (!wgSpurRoad(x, y, d)) continue; }
      if (wgCanPlace(d, x, y)) { wgCommit(type, x, y, { owner: wgBusinessOwner(ctx, 'INDUSTRY') }); return; }
    }
  });
  onMapChanged();
  if (countAny('ironmine') || countAny('coalmine')) for (let k = 0; k < n(1); k++) wgPlaceAnywhere(ctx, 'smelter', { districts: ['INDUSTRIAL'], recipe: 'metal' });
  if (countAny('oilwell')) wgPlaceAnywhere(ctx, 'refinery', { districts: ['INDUSTRIAL'], recipe: 'fuel' });
  for (let k = 0; k < n(2); k++) wgPlaceAnywhere(ctx, 'warehouse', { districts: ['INDUSTRIAL', 'COMMERCIAL'] });
  if (countAny('refinery')) wgPlaceAnywhere(ctx, 'fueldepot', { districts: ['INDUSTRIAL'] });
}
function wgCanPlaceIgnoringRoad(d, x, y) { const nr = d.noRoad; d.noRoad = true; const ok = wgCanPlace(d, x, y); d.noRoad = nr; return ok; }
/* Factory recipes follow what the city can supply: electronics need metal + rare earth, bread needs flour… */
function wgAssignRecipes(ctx) {
  const has = function (t) { return countAny(t) > 0; };
  const materials = (has('ironmine') && has('coalmine')) || has('lumbermill');
  const electronics = has('raremine') && (has('smelter') || materials);
  const pool = ['food', 'food', 'food', 'food'];
  if (materials) pool.push('materials', 'materials', 'materials');
  if (electronics) pool.push('electronics', 'electronics');
  if (electronics && materials) pool.push('vehicles');
  let k = 0;
  S.buildings.list.forEach(function (b) {
    if (b.type !== 'factory' && b.type !== 'megafactory') return;
    const d = BUILDINGS[b.type], r = pool[k++ % pool.length];
    if (d.recipes.indexOf(r) >= 0) b.recipe = r;
  });
}
function d3(t) { const d = BUILDINGS[t]; return !!d && d.w * d.h >= 9; }
/* Roads: connect every isolated building and every road island to the main network */
function wgSpurRoad(x, y, d) {
  const W = MAP.W, H = MAP.H, start = [];
  for (let yy = y - 1; yy <= y + d.h; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) {
    if (!inMap(xx, yy) || (xx >= x && xx < x + d.w && yy >= y && yy < y + d.h)) continue;
    const i = idx(xx, yy); if (!MAP.occ[i] && MAP.nature[i] !== 2) start.push(i);
  }
  const path = wgBfsToRoad(start, function (i) { const xx = i % W, yy = (i / W) | 0; return !(xx >= x && xx < x + d.w && yy >= y && yy < y + d.h); }, null);
  if (!path) return false;
  path.forEach(function (i) { if (!MAP.roads[i]) MAP.roads[i] = 1; if (MAP.nature[i] === 1) MAP.nature[i] = 0; });
  return true;
}
function wgBfsToRoad(starts, allow, targetComp) {
  const W = MAP.W, N = W * MAP.H, prev = new Int32Array(N).fill(-2), q = new Int32Array(N);
  let h = 0, t = 0;
  for (let k = 0; k < starts.length; k++) { const s = starts[k]; if (prev[s] !== -2) continue; prev[s] = -1; q[t++] = s; }
  while (h < t) {
    const cIdx = q[h++];
    const isTarget = MAP.roads[cIdx] && (targetComp === null ? true : MAP.comp[cIdx] === targetComp) && prev[cIdx] !== -1;
    if (isTarget || (MAP.roads[cIdx] && targetComp === null && prev[cIdx] === -1)) {
      const out = []; let p = cIdx; while (p >= 0) { out.push(p); p = prev[p]; }
      return out;
    }
    const x = cIdx % W, y = (cIdx / W) | 0;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (let k = 0; k < 4; k++) {
      const nx = nb[k][0], ny = nb[k][1]; if (!inMap(nx, ny)) continue;
      const ni = idx(nx, ny); if (prev[ni] !== -2) continue;
      if (MAP.occ[ni] || (allow && !allow(ni))) continue;
      prev[ni] = cIdx; q[t++] = ni;
    }
  }
  return null;
}
function wgConnectRoads() {
  let joined = 0;
  for (let guard = 0; guard < 60; guard++) {
    onMapChanged();
    const size = {}; let main = 0, ms = 0;
    for (let i = 0; i < MAP.comp.length; i++) { const cc = MAP.comp[i]; if (!cc) continue; size[cc] = (size[cc] || 0) + 1; if (size[cc] > ms) { ms = size[cc]; main = cc; } }
    const comps = Object.keys(size).map(Number).filter(function (cc) { return cc !== main; });
    if (!comps.length) break;
    const cc = comps.sort(function (a, b) { return size[b] - size[a]; })[0];
    const starts = []; for (let i = 0; i < MAP.comp.length; i++) if (MAP.comp[i] === cc) starts.push(i);
    if (size[cc] <= 2 && starts.every(function (i) { return MAP.roads[i] === 1; })) {           // tiny stub: remove instead of bridging
      starts.forEach(function (i) { MAP.roads[i] = 0; }); continue;
    }
    const path = wgBfsToRoad(starts, null, main);
    if (!path) { starts.forEach(function (i) { if (MAP.roads[i] === 1) MAP.roads[i] = 0; }); continue; }
    path.forEach(function (i) { if (!MAP.roads[i]) MAP.roads[i] = MAP.nature[i] === 2 ? 2 : 1; if (MAP.nature[i] === 1) MAP.nature[i] = 0; });
    joined++;
  }
  onMapChanged();
  return joined;
}
/* Services on a lattice so the whole city is covered */
function wgServiceLattice(ctx, type, svc, radius) {
  const W = MAP.W, step = Math.max(5, Math.round(radius * 1.2)), off = Math.floor(step / 2);
  for (let gy = off; gy < W; gy += step) for (let gx = off; gx < W; gx += step) {
    const i = idx(Math.min(W - 1, gx), Math.min(W - 1, gy));
    const dt = ctx.dmap ? ctx.seeds[ctx.dmap[i]] : null;
    if (MAP.nature[i] === 2 && !wgLandNear(gx, gy, 3)) continue;
    if (dt === null) continue;
    wgPlaceNear(type, gx, gy, Math.ceil(step / 2), {});
  }
}
function wgLandNear(x, y, r) { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (inMap(xx, yy) && MAP.nature[idx(xx, yy)] !== 2) return true; return false; }
function wgPlaceNear(type, cx, cy, maxR, opts) {
  const d = BUILDINGS[type];
  for (let r = 0; r <= maxR; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
    if (!inUnlocked(x, y) || !inUnlocked(x + d.w - 1, y + d.h - 1)) continue;
    if (wgCanPlace(d, x, y)) return wgCommit(type, x, y, opts);
  }
  return null;
}
/* Small residential/park lots can be cleared so a service building fits where it is needed */
function wgClearForService(d, x, y) {
  if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) return false;
  const rm = [];
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (MAP.nature[i] === 2 || MAP.roads[i] || MAP.terrain[i] === TERRAIN.ROCK) return false;
    if (MAP.occ[i]) {
      const b = MAP.byId.get(MAP.occ[i]);
      if (!b || ['house', 'park', 'tree', 'foodstand', 'shop', 'apartment', 'restaurant', 'socialhousing', 'gasstation'].indexOf(b.type) < 0) return false;
      if (b.x < x || b.y < y || b.x + bdef(b).w > x + d.w || b.y + bdef(b).h > y + d.h) return false;
      if (rm.indexOf(b) < 0) rm.push(b);
    }
  }
  if (!hasRoadNext(d, x, y)) return false;
  rm.forEach(function (b) { removeBuilding(b); });
  return true;
}
function wgUncovered(svc) {
  return S.buildings.list.filter(function (b) {
    const d = bdef(b); if (d.id === 'tree' || d.id === 'park' || !b._cov) return false;
    return !b._cov[svc];
  });
}
function wgFixCoverage(svc) {
  const type = { fire: 'fire', police: 'police', health: 'hospital' }[svc];
  const d = BUILDINGS[type]; let added = 0;
  for (let guard = 0; guard < 40; guard++) {
    computeCoverage();
    const un = wgUncovered(svc);
    if (!un.length || SIM.cov[svc] >= 0.97) break;
    const t = un[Math.floor(un.length / 2)], R = Math.max(2, Math.floor(d.cover * 0.6));
    let b = wgPlaceNear(type, t.x, t.y, R, {});
    if (!b) {
      for (let r = 0; r <= R && !b; r++) for (let y = t.y - r; y <= t.y + r && !b; y++) for (let x = t.x - r; x <= t.x + r && !b; x++) if (wgClearForService(d, x, y)) b = wgCommit(type, x, y, {});
    }
    if (!b) { t._cov[svc] = 1; continue; }
    b._eff = 1; onMapChanged(); added++;
  }
  return added;
}
/* Schools: every home within ~11 tiles of a school */
function wgHomesWithoutSchool() {
  const schools = S.buildings.list.filter(function (b) { const d = BUILDINGS[b.type]; return d.edu && b.built; });
  return S.buildings.list.filter(function (b) {
    if (!BUILDINGS[b.type].housing) return false;
    return !schools.some(function (s) { return Math.hypot(s.x - b.x, s.y - b.y) <= 11; });
  });
}
function wgFixSchools() {
  const d = BUILDINGS.school; let added = 0;
  for (let guard = 0; guard < 40; guard++) {
    const un = wgHomesWithoutSchool(); if (!un.length) break;
    const t = un[0];
    let b = wgPlaceNear('school', t.x, t.y, 9, {});
    for (let r = 0; r <= 9 && !b; r++) for (let y = t.y - r; y <= t.y + r && !b; y++) for (let x = t.x - r; x <= t.x + r && !b; x++) if (wgClearForService(d, x, y)) b = wgCommit('school', x, y, {});
    if (!b) break;
    added++;
  }
  if (added) onMapChanged();
  return added;
}
function wgPowerType(gap) {
  if (gap > 6000 && hasTech('fusion')) return 'fusion';
  if (gap > 1200 && hasTech('nuclear')) return 'nuclear';
  const green = WG.cfg && WG.cfg.infrastructure === 'green';
  if (green && hasTech('wind')) return 'wind';
  if (green && hasTech('solar')) return 'solar';
  if (gap < 14) return 'smallgen';
  return 'powerplant';
}
function wgExistingGen(key) { let g = 0; S.buildings.list.forEach(function (b) { const v = BUILDINGS[b.type][key]; if (v > 0) g += v * lvlMult(b.level); }); return g; }
function wgUtilDistricts(ctx) { return ctx && ctx.lots ? ['INDUSTRIAL', 'SUBURBS'] : null; }
function wgAddPower(ctx, need) {
  let gen = ctx ? wgExistingGen('power') : 0, guard = 0;
  while (gen < need && guard++ < 80) {
    const type = wgPowerType(need - gen);
    const b = wgPlaceAnywhere(ctx, type, { districts: wgUtilDistricts(ctx), spread: 3 }) || wgPlaceAnywhere(ctx, type, { clearSmall: true }) ||
      (type !== 'powerplant' ? wgPlaceAnywhere(ctx, 'powerplant', { clearSmall: true }) : null);
    if (!b) break;
    gen += BUILDINGS[b.type].power * lvlMult(b.level);
  }
  return gen;
}
function wgAddWater(ctx, need) {
  let gen = ctx ? wgExistingGen('water') : 0, guard = 0;
  while (gen < need && guard++ < 80) {
    const gap = need - gen;
    const type = gap > 1500 && hasTech('c_water') ? 'megawater' : gap < 25 ? 'watertower' : gap < 90 ? 'waterpump' : 'waterplant';
    const b = wgPlaceAnywhere(ctx, type, { districts: wgUtilDistricts(ctx), spread: 2 }) || wgPlaceAnywhere(ctx, type, { clearSmall: true }) ||
      (type !== 'waterplant' ? wgPlaceAnywhere(ctx, 'waterplant', { clearSmall: true }) : null);
    if (!b) break;
    gen += BUILDINGS[b.type].water * lvlMult(b.level);
  }
  return gen;
}
function wgAddWaste(ctx) {
  onMapChanged(); econTick(1);
  let guard = 0;
  while ((SIM.wasteGen || 0) > (SIM.wasteCap || 0) * 0.9 && guard++ < 30) {
    const big = (SIM.wasteGen - SIM.wasteCap) > 35;
    const b = (big ? wgPlaceAnywhere(ctx, 'wastecenter', { districts: ctx && ctx.lots ? ['INDUSTRIAL'] : null }) || wgPlaceAnywhere(ctx, 'wastecenter', { clearSmall: true }) : null) ||
      (hasTech('env_recycle') ? wgPlaceAnywhere(ctx, 'recycling', { districts: ctx && ctx.lots ? ['INDUSTRIAL', 'SUBURBS'] : null }) : null) || wgPlaceAnywhere(ctx, 'garbage', {});
    if (!b) break;
    onMapChanged(); econTick(1);
  }
}
/* Sized by installed capacity (not by the current output, which depends on staffing) */
function wgTopUpUtilities(ctx) {
  for (let k = 0; k < 4; k++) {
    onMapChanged(); econTick(1);
    const pNeed = SIM.powerUse * 1.2, wNeed = SIM.waterUse * 1.2, pCap = wgExistingGen('power'), wCap = wgExistingGen('water');
    if (pCap >= pNeed && wCap >= wNeed) break;
    if (pCap < pNeed) wgAddPower(null, pNeed - pCap + 0.0001);
    if (wCap < wNeed) wgAddWater(null, wNeed - wCap + 0.0001);
  }
}
function wgStoreDistrictNames(ctx) {
  const n = MAP.dN, names = [];
  for (let k = 0; k < n * n; k++) {
    const cx = (k % n) * 8, cy = Math.floor(k / n) * 8, votes = {};
    for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) { if (!inMap(x, y)) continue; const s = ctx.seeds[ctx.dmap[idx(x, y)]]; votes[s.name] = (votes[s.name] || 0) + (MAP.nature[idx(x, y)] === 2 ? 0.2 : 1); }
    let best = '', bv = -1; for (const nm in votes) if (votes[nm] > bv) { bv = votes[nm]; best = nm; }
    names.push(best);
  }
  ctx.cellNames = names;
  S.p8.world = S.p8.world || {}; S.p8.world.cellNames = names;
}
function applyClimate(cfg) {
  const seasonFor = { temperate: 0, tropical: 1, arid: 1, cold: 3 }[cfg.climate] || 0;
  S.clock.gameSec = (seasonFor * SEASON_DAYS) * 86400 + 8 * 3600;
  const w = cfg.weather !== 'auto' ? cfg.weather : cfg.climate === 'cold' ? 'snow' : cfg.climate === 'tropical' ? 'rain' : cfg.climate === 'arid' ? 'heatwave' : 'clear';
  setWeather(w, 6);
}

/* ===================================== WEATHER / TIME (shared with the admin panel) ===================================== */
const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'heatwave'];
function setWeather(w, hours) {
  if (WEATHER_TYPES.indexOf(w) < 0) return false;
  FX.weather = w; FX.lock = w; FX.drops = [];
  FX.weatherUntil = S.clock.gameSec + (hours || 6) * 3600;
  SND.setRain(w === 'rain' || w === 'storm' || w === 'heavyrain');
  return true;
}
function setHour(h) { S.clock.gameSec = Math.floor(S.clock.gameSec / 86400) * 86400 + clamp(h, 0, 23.99) * 3600; }
function setDay(d) { const h = gameHour(); S.clock.gameSec = (Math.max(1, d | 0) - 1) * 86400 + h * 3600; }
function setSeason(i) { const year = Math.floor((gameDay() - 1) / (SEASON_DAYS * 4)); setDay(year * SEASON_DAYS * 4 + clamp(i | 0, 0, 3) * SEASON_DAYS + 1); }
function gameYear() { return Math.floor((gameDay() - 1) / (SEASON_DAYS * 4)) + 1; }
function setYear(y) { const into = (gameDay() - 1) % (SEASON_DAYS * 4); setDay((Math.max(1, y | 0) - 1) * SEASON_DAYS * 4 + into + 1); }

/* ===================================== WORLD VALIDATOR ===================================== */
function mainRoadComp() {
  const size = {}; let main = 0, ms = 0;
  for (let i = 0; i < MAP.comp.length; i++) { const c = MAP.comp[i]; if (!c) continue; size[c] = (size[c] || 0) + 1; if (size[c] > ms) { ms = size[c]; main = c; } }
  return { main: main, comps: Object.keys(size).length, size: size };
}
function validateWorld() {
  onMapChanged(); econTick(1); computeCoverage();
  const rc = mainRoadComp(), L = S.buildings.list, checks = [];
  const add = function (id, label, ok, detail, warn) { checks.push({ id: id, label: label, ok: !!ok, detail: detail || '', warn: !!warn }); };
  const roadB = L.filter(function (b) { return !bdef(b).noRoad; });
  const connected = roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length;
  add('roads', 'Roads connected', rc.comps <= 1, rc.comps + ' road network(s)');
  const homes = L.filter(function (b) { return BUILDINGS[b.type].housing; });
  const homesOk = homes.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length;
  add('residential', 'Residential areas connected', homesOk >= homes.length, homesOk + '/' + homes.length + ' homes');
  add('power', 'Electricity connected', SIM.powerGen >= SIM.powerUse && SIM.powerGen > 0, Math.round(SIM.powerGen) + ' / ' + Math.round(SIM.powerUse) + ' MW');
  add('water', 'Water connected', SIM.waterGen >= SIM.waterUse && SIM.waterGen > 0, Math.round(SIM.waterGen) + ' / ' + Math.round(SIM.waterUse) + ' units');
  add('sewage', 'Sewage & waste handled', (SIM.wasteCap || 0) >= (SIM.wasteGen || 0) * 0.8, Math.round(SIM.wasteCap || 0) + ' / ' + Math.round(SIM.wasteGen || 0));
  add('health', 'Hospitals reachable', SIM.cov.health >= 0.85, Math.round(SIM.cov.health * 100) + '% covered');
  const noSchool = wgHomesWithoutSchool().length;
  add('schools', 'Schools reachable', noSchool <= Math.floor(homes.length * 0.01), noSchool ? noSchool + ' of ' + homes.length + ' homes too far from a school' : 'all homes');
  add('jobs', 'Jobs available', SIM.jobs >= SIM.labor * 0.88, fmt(SIM.jobs) + ' jobs / ' + fmt(SIM.labor) + ' workers');
  const food = (SIM.supply.FOOD || 0) >= (SIM.demand.FOOD || 0) * 0.85 || countAny('farm') > 0;
  add('food', 'Food supply available', food, 'supply ' + fmt(SIM.supply.FOOD || 0) + ' / demand ' + fmt(SIM.demand.FOOD || 0));
  add('commercial', 'Commercial demand covered', (SIM.supply.SHOPPING || 0) >= (SIM.demand.SHOPPING || 0) * 0.8, 'supply ' + fmt(SIM.supply.SHOPPING || 0) + ' / demand ' + fmt(SIM.demand.SHOPPING || 0));
  add('emergency', 'Emergency services reachable', SIM.cov.fire >= 0.85 && SIM.cov.police >= 0.85, 'fire ' + Math.round(SIM.cov.fire * 100) + '% · police ' + Math.round(SIM.cov.police * 100) + '%');
  add('traffic', 'Traffic network connected', connected >= roadB.length * 0.98, connected + '/' + roadB.length + ' buildings on the main network');
  const badCit = AG.citizens.filter(function (c) { return !c.tourist && !MAP.byId.has(c.home); }).length;
  add('homes', 'Citizens have homes', S.city.population <= (SIM.housingCap || 0) * 1.01 && badCit === 0, fmt(S.city.population) + ' citizens / ' + fmt(SIM.housingCap || 0) + ' homes');
  add('employment', 'Citizens have jobs', SIM.unemployment <= 0.12, Math.round((1 - SIM.unemployment) * 100) + '% employed');
  add('economy', 'Economy operational', SIM.bNet >= 0 || S.budget > Math.abs(SIM.bNet) * 7200, 'budget ' + signMoney(SIM.bNet || 0) + '/s · companies ' + signMoney(SIM.pNet || 0) + '/s');
  const failed = checks.filter(function (c) { return !c.ok; });
  return { checks: checks, liveable: failed.length === 0, failed: failed.map(function (c) { return c.id; }), at: Date.now() };
}

/* ===================================== AUTO-REPAIR (FIX WORLD) ===================================== */
function fixWorld(silent) {
  const actions = [];
  const did = function (m) { actions.push(m); };
  const n0 = S.buildings.list.length;
  onMapChanged(); econTick(1);
  // Roads: isolated buildings → spur roads; road islands → connectors
  let spurs = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.noRoad || b._entry >= 0) return; if (wgSpurRoad(b.x, b.y, d)) spurs++; });
  if (spurs) did('🛣 Built ' + spurs + ' access road(s) for disconnected buildings');
  onMapChanged();
  let moved = 0;                                  // still unreachable (enclosed): move the building to a connected lot
  S.buildings.list.slice().forEach(function (b) {
    const d = bdef(b); if (d.noRoad || b._entry >= 0 || d.unique) return;
    const type = b.type, lvl = b.level, owner = b.owner; removeBuilding(b);
    if (wgPlaceAnywhere(null, type, { level: lvl, owner: owner })) moved++;
  });
  if (moved) did('🏠 Relocated ' + moved + ' enclosed building(s) to connected lots');
  const joined = wgConnectRoads();
  if (joined) did('🛣 Connected ' + joined + ' disconnected district road network(s)');
  econTick(1);
  // Power / water / waste
  if (SIM.powerGen < SIM.powerUse * 1.05) { wgAddPower(null, SIM.powerUse * 1.15 - SIM.powerGen); onMapChanged(); econTick(1); did('⚡ Auto-connected power network: generation ' + Math.round(SIM.powerGen) + ' MW'); }
  if (SIM.waterGen < SIM.waterUse * 1.05) { wgAddWater(null, SIM.waterUse * 1.15 - SIM.waterGen); onMapChanged(); econTick(1); did('💧 Auto-connected water network: ' + Math.round(SIM.waterGen) + ' units'); }
  if ((SIM.wasteGen || 0) > (SIM.wasteCap || 0) * 0.8) { wgAddWaste(null); did('🗑 Added sewage & waste capacity'); }
  // Services
  const f = wgFixCoverage('fire'), p = wgFixCoverage('police'), h = wgFixCoverage('health'), s = wgFixSchools();
  if (f + p + h + s) did('🚨 Added ' + f + ' fire, ' + p + ' police, ' + h + ' hospital and ' + s + ' school building(s)');
  onMapChanged(); econTick(1);
  // Housing: homeless citizens → more homes (upgrade existing first, then new buildings)
  let homesAdded = 0, upgraded = 0;
  for (let guard = 0; guard < 300 && S.city.population > (SIM.housingCap || 0) * 0.98; guard++) {
    const homes = S.buildings.list.filter(function (b) { return BUILDINGS[b.type].housing && b.level < 6 && b.built; });
    if (homes.length && guard % 2 === 0) { const b = homes[guard % homes.length]; b.level++; upgraded++; }
    else { const b = wgPlaceAnywhere(null, hasTech('c_zoning') ? 'condo' : 'apartment', {}) || wgPlaceAnywhere(null, 'house', {}); if (!b) break; homesAdded++; }
    if (guard % 10 === 0) { onMapChanged(); econTick(1); }
  }
  if (homesAdded || upgraded) did('🏠 Housing: ' + homesAdded + ' new home building(s), ' + upgraded + ' upgraded');
  // Jobs: unemployment → workplaces
  let jobsAdded = 0;
  for (let guard = 0; guard < 300 && SIM.jobs < SIM.labor * 0.9; guard++) {
    const b = wgPlaceAnywhere(null, wgPick(['office', 'supermarket', 'restaurant', 'factory', 'shop']), {}); if (!b) break;
    jobsAdded++; SIM.jobs += b.workers;
  }
  if (jobsAdded) { onMapChanged(); econTick(1); did('💼 Created ' + jobsAdded + ' workplace(s) to reduce unemployment'); }
  // Food / commerce
  if ((SIM.supply.FOOD || 0) < (SIM.demand.FOOD || 0) * 0.85) { let n = 0; for (let k = 0; k < 20 && (SIM.supply.FOOD || 0) < (SIM.demand.FOOD || 0); k++) { if (!wgPlaceAnywhere(null, wgPick(['restaurant', 'foodstand', 'restaurant']), {})) break; n++; if (k % 4 === 3) { onMapChanged(); econTick(1); } } if (n) did('🍔 Added ' + n + ' food business(es)'); }
  if ((SIM.supply.SHOPPING || 0) < (SIM.demand.SHOPPING || 0) * 0.8) { let n = 0; for (let k = 0; k < 20 && (SIM.supply.SHOPPING || 0) < (SIM.demand.SHOPPING || 0); k++) { if (!wgPlaceAnywhere(null, wgPick(['shop', 'supermarket']), {})) break; n++; if (k % 4 === 3) { onMapChanged(); econTick(1); } } if (n) did('🛒 Added ' + n + ' shop(s)'); }
  // Supply chain gaps
  if (!countAny('farm')) { if (wgPlaceAnywhere(null, 'farm', { recipe: 'wheat' })) did('🌾 Added a farm (food & wheat)'); }
  if (countAny('bakery') && !countAny('flourmill')) { if (wgPlaceAnywhere(null, 'flourmill', { recipe: 'flour' })) did('🏭 Added a flour mill for the bakeries'); }
  let recipeFix = 0;
  S.buildings.list.forEach(function (b) { if ((b.type === 'factory' || b.type === 'megafactory') && b.recipe === 'electronics' && !countAny('smelter')) { b.recipe = 'materials'; recipeFix++; } });
  if (recipeFix) did('⚙ ' + recipeFix + ' factory recipe(s) switched to available inputs');
  // Companies, routes, citizens
  let comp = 0;
  AI_DEFS.forEach(function (a) { const st = S.ai[a.id]; if (!st || !isFinite(st.cash) || st.cash < 0) { repairCompany(a.id, new Error('fixWorld')); comp++; } });
  if (comp) did('🏢 Repaired ' + comp + ' company record(s)');
  const v0 = AG.vehicles.length; sanitizeVehicles(); MAP.pathCache.clear();
  for (let i = AG.vehicles.length - 1; i >= 0; i--) { const v = AG.vehicles[i]; if (!v.path || v.path.some(function (t) { return !MAP.roads[t]; })) removeVehicle(i, false); }
  if (v0 !== AG.vehicles.length) did('🚗 Removed ' + (v0 - AG.vehicles.length) + ' vehicle(s) with broken routes');
  const c0 = AG.citizens.length; sanitizeCitizens();
  let gaveJob = 0; const jobs = MAP.lists.jobs.filter(function (b) { return b._op; });
  AG.citizens.forEach(function (c) { if (!c.tourist && !c.work && jobs.length && wgR() > SIM.unemployment) { const b = jobs[Math.floor(wgR() * jobs.length)]; c.work = b.id; if (c.mem) c.mem.work = b.id; gaveJob++; } });
  if (c0 !== AG.citizens.length || gaveJob) did('👥 Citizens: ' + (c0 - AG.citizens.length) + ' invalid removed, ' + gaveJob + ' assigned to jobs');
  onMapChanged(); econTick(1);
  if (!actions.length) did('✓ Nothing to fix — the world is healthy');
  if (!silent) adminLog('FIX WORLD: ' + actions.length + ' action(s), ' + (S.buildings.list.length - n0) + ' building(s) added');
  return { actions: actions, added: S.buildings.list.length - n0 };
}

/* ===================================== WORLD HEALTH ===================================== */
function worldHealth() {
  onMapChanged(); econTick(1); computeCoverage();
  const rc = mainRoadComp(), L = S.buildings.list;
  const roadB = L.filter(function (b) { return !bdef(b).noRoad; });
  const conn = roadB.length ? roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length / roadB.length : 1;
  const pc = (s) => Math.round(clamp(s, 0, 1) * 100);
  const homes = L.filter(function (b) { return BUILDINGS[b.type].housing; });
  const school = homes.length ? 1 - wgHomesWithoutSchool().length / homes.length : 1;
  const econ = clamp(0.5 + (SIM.bNet >= 0 ? 0.3 : -0.3) + (SIM.pNet >= 0 ? 0.2 : -0.2) + Math.min(0.2, S.budget / 1e7), 0, 1);
  const rows = [
    ['Road Connectivity', pc(conn)], ['Power Coverage', pc(SIM.powerUse > 0 ? SIM.powerGen / SIM.powerUse : 1)], ['Water Coverage', pc(SIM.waterUse > 0 ? SIM.waterGen / SIM.waterUse : 1)],
    ['Employment', pc(1 - SIM.unemployment)], ['Housing', pc(S.city.population > 0 ? (SIM.housingCap || 0) / S.city.population : 1)], ['Healthcare', pc(SIM.cov.health)],
    ['Education', pc(school)], ['Safety', pc((SIM.cov.fire + SIM.cov.police) / 2)], ['Traffic', pc(1 - (SIM.traffic || 0) / 100)], ['Economy', pc(econ)], ['Citizen Happiness', Math.round(S.city.happiness)]
  ];
  const overall = Math.round(rows.reduce(function (a, r) { return a + r[1]; }, 0) / rows.length);
  return { rows: rows, overall: overall, label: overall >= 85 ? 'HEALTHY' : overall >= 65 ? 'STABLE' : overall >= 45 ? 'STRUGGLING' : 'CRITICAL' };
}

/* ===================================== WORLD DEBUGGER (map overlay) ===================================== */
function toggleWorldDebug(on) {
  WDBG.on = on === undefined ? !WDBG.on : !!on;
  if (WDBG.on) { onMapChanged(); econTick(1); computeCoverage(); WDBG.rc = mainRoadComp(); WDBG.noSchool = wgHomesWithoutSchool().map(function (b) { return b.id; }); }
  toast('🧪 World debugger ' + (WDBG.on ? 'ON — red: disconnected roads/broken · yellow: no power · blue: no water · purple: no services · orange: traffic' : 'OFF'), '');
  if (STARTED) adminLog('World debugger ' + (WDBG.on ? 'ON' : 'OFF'));
}
function drawWorldDebug() {
  if (!WDBG.on || !MAP.roads) return;
  if (!WDBG.rc || WDBG.ver !== MAP.version) { WDBG.rc = mainRoadComp(); WDBG.ver = MAP.version; WDBG.noSchool = wgHomesWithoutSchool().map(function (b) { return b.id; }); }
  const Ly = WDBG.layers, T = TILE, W = MAP.W;
  ctx.save();
  if (Ly.roads) {
    ctx.fillStyle = 'rgba(255,40,60,.55)';
    for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && MAP.comp[i] !== WDBG.rc.main) ctx.fillRect((i % W) * T, ((i / W) | 0) * T, T, T);
  }
  if (Ly.traffic && MAP.cong) {
    for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && MAP.cong[i] > 0.6) { ctx.fillStyle = 'rgba(255,140,0,' + clamp(MAP.cong[i] - 0.3, 0.2, 0.7) + ')'; ctx.fillRect((i % W) * T + 4, ((i / W) | 0) * T + 4, T - 8, T - 8); }
  }
  const unemployed = SIM.unemployment > 0.12, waterShort = SIM.waterRatio < 0.99;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (d.id === 'tree') return;
    const x = b.x * T, y = b.y * T, w = d.w * T, h = d.h * T;
    let col = null;
    if (Ly.broken && (b.damaged || b.fire > 0 || (!d.noRoad && b._entry < 0))) col = 'rgba(255,30,50,.65)';
    else if (Ly.power && d.power < 0 && !b._powered) col = 'rgba(255,220,0,.6)';
    else if (Ly.water && d.water < 0 && waterShort) col = 'rgba(60,140,255,.55)';
    else if (Ly.services && b._cov && !(b._cov.fire && b._cov.police && b._cov.health) && d.id !== 'park') col = 'rgba(170,80,255,.45)';
    else if (Ly.jobs && d.housing && unemployed) col = 'rgba(255,120,200,.4)';
    else if (Ly.homes && d.workers && SIM.labor < SIM.jobs * 0.8) col = 'rgba(0,220,200,.35)';
    if (Ly.services && d.housing && WDBG.noSchool.indexOf(b.id) >= 0) { ctx.strokeStyle = 'rgba(170,80,255,.9)'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
    if (col) { ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, w - 2, h - 2); }
  });
  if (Ly.citizens) {
    ctx.fillStyle = '#ff0040';
    AG.citizens.forEach(function (c) { if (!c.tourist && (!MAP.byId.has(c.home) || !isFinite(c.x))) { ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, 6.283); ctx.fill(); } });
  }
  ctx.restore();
}

/* ===================================== PROGRESS & RESULT UI ===================================== */
function wgStageList(cfg) { return cfg && cfg.mega && typeof MEGA_STAGES !== 'undefined' ? MEGA_STAGES : WG_STAGES.map(function (s) { return [s[0], s[1], [s[0]]]; }); }
function showWgProgress(cfg) {
  const el = $('wgProgress');
  WG.stages = wgStageList(cfg).map(function (s) { return { id: s[0], name: s[1], p: 0 }; });
  $('wgTitle').textContent = (cfg.mega ? '🌐 GENERATE MEGA WORLD — ' : '🌍 GENERATING WORLD — ') + (WORLD_PRESETS[cfg.preset] ? WORLD_PRESETS[cfg.preset].name : '🛠 Custom world') + ' · ' + seedLabel(cfg.seed) + ' · ' + cfg.size;
  el.classList.remove('hidden');
  wgRenderProgress();
}
function wgSetProgress(id, p) {
  const s = WG.stages.find(function (x) { return x.id === id; }); if (!s) return;
  s.p = clamp(p, 0, 1);
  const now = performance.now(); if (!WG.lastPaint || now - WG.lastPaint > 60 || p >= 1) { WG.lastPaint = now; wgRenderProgress(); }
}
function wgRenderProgress() {
  const bar = function (p) { const n = Math.round(p * 10); return '█'.repeat(n) + '░'.repeat(10 - n); };
  const done = WG.stages.reduce(function (a, s) { return a + s.p; }, 0) / Math.max(1, WG.stages.length);
  const el = performance.now() - WG.t0, eta = done > 0.05 ? el / done - el : 0;
  $('wgRows').innerHTML = WG.stages.map(function (s) { return '<div class="wgRow ' + (s.p >= 1 ? 'done' : s.p > 0 ? 'act' : '') + '"><span>' + s.name + '</span><b>' + bar(s.p) + '</b><i>' + Math.round(s.p * 100) + '%</i></div>'; }).join('');
  $('wgEta').textContent = done >= 1 ? 'Done' : 'Overall ' + Math.round(done * 100) + '% · estimated remaining ' + (eta > 0 ? (eta / 1000).toFixed(1) + ' s' : '…');
}
function hideWgProgress() { $('wgProgress').classList.add('hidden'); }
function healthHtml(h) {
  return '<div class="wgHealth">' + h.rows.map(function (r) { return '<div class="between small"><span>' + r[0] + '</span><b class="' + (r[1] >= 85 ? 'pos' : r[1] >= 60 ? '' : 'neg') + '">' + r[1] + '%</b></div>'; }).join('') +
    '<div class="between" style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><b>OVERALL</b><b class="' + (h.overall >= 85 ? 'pos' : h.overall >= 60 ? '' : 'neg') + '">' + h.overall + '% ' + h.label + '</b></div></div>';
}
function validationHtml(r) {
  return '<div class="wgVal">' + r.checks.map(function (c) { return '<div class="between small"><span>' + (c.ok ? '✓' : '⚠') + ' ' + c.label + '</span><span class="' + (c.ok ? 'pos' : 'neg') + '">' + esc(c.detail) + '</span></div>'; }).join('') +
    '<div style="margin-top:8px;font-weight:900">WORLD STATUS: <span class="' + (r.liveable ? 'pos' : 'neg') + '">' + (r.liveable ? '✓ LIVEABLE' : '⚠ NEEDS ATTENTION (' + r.failed.length + ')') + '</span></div></div>';
}
function showWorldResult(res) {
  const h = res.health, r = res.report;
  const row = function (k, v) { return '<div class="between"><span>' + k + '</span><b>' + v + '</b></div>'; };
  const html = '<div class="grid2"><div class="card"><h3>🌍 WORLD GENERATED</h3>' + row('City', esc(res.name)) + row('Seed', res.seed) + row('Map', res.size + '×' + res.size) +
    row('Population', fmt(res.population)) + row('Buildings', fmt(res.buildings)) + row('Roads', fmt(res.roads) + ' tiles') + row('Companies', fmt(res.companies)) + row('Vehicles', fmt(res.vehicles)) + row('Districts', res.districts) +
    row('Generated in', res.seconds.toFixed(1) + ' s') + '</div><div class="card"><h3>❤️ WORLD HEALTH</h3>' + healthHtml(h) + '</div></div>' +
    '<div class="card"><h3>✅ WORLD VALIDATION</h3>' + validationHtml(r) + (res.fixes.length ? '<p class="small" style="margin-top:6px"><b>Auto-fix:</b> ' + res.fixes.map(esc).join(' · ') + '</p>' : '') + '</div>' +
    (res.p10score && typeof scoreHtml === 'function' ? '<div class="card"><h3>🏆 WORLD GENERATION SCORE (' + res.steps + '-step pipeline)</h3>' + scoreHtml(res.p10score) + '</div>' : '');
  showModal(res.mega ? '🌐 Mega world generated' : '🌍 World generated', html);
}
