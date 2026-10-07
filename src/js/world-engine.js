'use strict';
/* BLOCK CITY TYCOON — WORLD ENGINE (Part 9)
   The tile grid is split into 16×16-tile CHUNKS that are grouped into REGIONS (Central / North / South / East / West).
   • Ground streaming — every chunk owns a cached ground bitmap. It is created when the camera comes near (a ring of
     chunks around the view is preloaded so borders are never visible), re-rendered lazily after map changes (a few per
     frame) and released when it has not been used for a while or the memory budget is exceeded. The bitmap resolution
     follows the zoom level (LOD), so even a 160×160 world never holds one giant canvas.
   • Simulation tiers — NEAR (visible chunks) = full agent simulation, MID (ring around the view) = reduced update rate,
     FAR = statistical (agents update rarely, ambient traffic is aggregated into the congestion field). The economy, the
     statistics and every city system keep covering the whole world.
   • Regions — per-region population, jobs, homes, traffic, land value, happiness, education, health, energy, water,
     production, trade and tourism.
   • Neighbouring cities — METRO CITY, RIVER CITY, … are simulated economically. Commuters, tourists, cargo, trade,
     resources and energy flow over the real road / rail / sea / air connections at the map edges.
   • CREATE NEW REGION — a ring of chunks is added around the world; rivers, roads and terrain continue into it. */
const CHUNK = 16;
const WORLD_MAX_SIZE = 160;
const WE = {
  w: 0, h: 0, cw: 0, chh: 0, n: 0, tier: null, region: null, tierAt: -9, tierCount: [0, 0, 0],
  ground: new Map(), groundVer: 1, groundKey: '', loads: 0, unloads: 0, renders: 0, pool: [], pixels: 0,
  buckets: null, bucketVer: -1, bucketLen: -1, regions: [], regionAt: -9, cargoAt: 0
};
const REGION_DEFS = [
  { id: 'central', name: 'Central Region', icon: '🏙️', color: '#ffd166' },
  { id: 'north', name: 'North Region', icon: '⬆️', color: '#4cc9f0' },
  { id: 'south', name: 'South Region', icon: '⬇️', color: '#f77f00' },
  { id: 'east', name: 'East Region', icon: '➡️', color: '#80ed99' },
  { id: 'west', name: 'West Region', icon: '⬅️', color: '#c77dff' }
];

/* ---------------- Chunk grid ---------------- */
function weEnsure() {
  if (WE.tier && WE.w === MAP.W && WE.h === MAP.H) return;
  WE.w = MAP.W; WE.h = MAP.H;
  WE.cw = Math.ceil(MAP.W / CHUNK); WE.chh = Math.ceil(MAP.H / CHUNK); WE.n = WE.cw * WE.chh;
  WE.tier = new Uint8Array(WE.n).fill(2); WE.region = new Uint8Array(WE.n);
  for (let k = 0; k < WE.n; k++) {
    const cx = (k % WE.cw) * CHUNK + Math.min(CHUNK, MAP.W - (k % WE.cw) * CHUNK) / 2, cy = Math.floor(k / WE.cw) * CHUNK + Math.min(CHUNK, MAP.H - Math.floor(k / WE.cw) * CHUNK) / 2;
    WE.region[k] = regionIndexAt(cx, cy);
  }
  weGroundClear(); WE.bucketVer = -1; WE.tierAt = -9; WE.regionAt = -9;
}
function regionIndexAt(x, y) {
  const dx = x / MAP.W - 0.5, dy = y / MAP.H - 0.5;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.19) return 0;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 1 : 2;
  return dx > 0 ? 3 : 4;
}
function chunkIndex(cx, cy) { return cy * WE.cw + cx; }
function chunkOfTile(x, y) { weEnsure(); return Math.floor(clamp(y, 0, MAP.H - 1) / CHUNK) * WE.cw + Math.floor(clamp(x, 0, MAP.W - 1) / CHUNK); }
function chunkOfWorld(wx, wy) { return chunkOfTile(Math.floor(wx / TILE), Math.floor(wy / TILE)); }
function chunkRect(k) { const cx = k % WE.cw, cy = Math.floor(k / WE.cw); return { x0: cx * CHUNK, y0: cy * CHUNK, x1: Math.min(MAP.W, cx * CHUNK + CHUNK) - 1, y1: Math.min(MAP.H, cy * CHUNK + CHUNK) - 1, cx: cx, cy: cy }; }
function regionOfTile(x, y) { return REGION_DEFS[WE.region ? WE.region[chunkOfTile(x, y)] : regionIndexAt(x, y)]; }
function chunkLabel(k) { const r = chunkRect(k); return 'Chunk ' + k + ' (' + r.cx + ',' + r.cy + ') · ' + REGION_DEFS[WE.region[k]].name; }

/* ---------------- Simulation tiers (NEAR / MID / FAR) ---------------- */
const TIER_NAMES = ['NEAR', 'MID', 'FAR'];
function weUpdateTiers() {
  weEnsure();
  if (FX.time - WE.tierAt < 0.2) return;
  WE.tierAt = FX.time;
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH), span = CHUNK * TILE;
  const mx = (br.x - tl.x) * 0.5 + span * 0.5, my = (br.y - tl.y) * 0.5 + span * 0.5;
  const cnt = [0, 0, 0];
  for (let k = 0; k < WE.n; k++) {
    const r = chunkRect(k), x0 = r.x0 * TILE, y0 = r.y0 * TILE, x1 = (r.x1 + 1) * TILE, y1 = (r.y1 + 1) * TILE;
    let t = 2;
    if (PHOTO.on) t = 0;
    else if (x1 >= tl.x && x0 <= br.x && y1 >= tl.y && y0 <= br.y) t = 0;
    else if (x1 >= tl.x - mx && x0 <= br.x + mx && y1 >= tl.y - my && y0 <= br.y + my) t = 1;
    WE.tier[k] = t; cnt[t]++;
  }
  WE.tierCount = cnt;
}
function weTierAt(wx, wy) { if (!WE.tier || PHOTO.on) return 0; return WE.tier[chunkOfWorld(wx, wy)]; }
function weTierOfBuilding(b) { return WE.tier ? WE.tier[chunkOfTile(b.x, b.y)] : 0; }
/* Ambient traffic is spawned near the camera; far away it is represented statistically (congestion field) */
function pickNearCamera(list) {
  if (!list.length) return null;
  if (!WE.tier || Math.random() < 0.15) return pick(list);
  for (let t = 0; t < 8; t++) { const b = pick(list); if (weTierOfBuilding(b) <= 1) return b; }
  return pick(list);
}

/* ---------------- Ground streaming ---------------- */
function weGroundClear() { WE.ground.forEach(function (g) { if (WE.pool.length < 16) WE.pool.push(g.cv); }); WE.ground.clear(); WE.pixels = 0; }
function weGroundScale(z) { const base = IS_MOBILE ? 1 : GROUND.scale; return z >= 0.85 ? base : z >= 0.48 ? 0.75 : 0.375; }
function weGroundStamp() { return seasonIndex() + '|' + S.city.expansion + '|' + layerKey() + '|' + MAP.W + '|' + (S.settings.layers.zoning ? 1 : 0); }
function drawGroundChunk(k, sc) {
  const r = chunkRect(k), T = TILE, season = currentSeason(), L = S.settings.layers;
  const wpx = (r.x1 - r.x0 + 1) * T, hpx = (r.y1 - r.y0 + 1) * T;
  let g = WE.ground.get(k);
  const cv = g ? g.cv : (WE.pool.pop() || document.createElement('canvas'));
  const W2 = Math.ceil(wpx * sc), H2 = Math.ceil(hpx * sc);
  if (g) WE.pixels -= g.cv.width * g.cv.height;
  if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
  WE.pixels += W2 * H2;
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W2, H2);
  c.setTransform(sc, 0, 0, sc, -r.x0 * T * sc, -r.y0 * T * sc);
  const ur = unlockedRect();
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = idx(x, y), px = x * T, py = y * T;
    if (!L.terrain) { c.fillStyle = MAP.nature[i] === 2 ? '#3a5a7a' : ((x + y) % 2 ? '#56606e' : '#5b6574'); c.fillRect(px, py, T, T); continue; }
    if (MAP.nature[i] === 2) {
      c.fillStyle = season.id === 'winter' ? '#a9d6e5' : '#2f7fbf'; c.fillRect(px, py, T, T);
      if (decoRand(x, y, 31) < 0.5) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(px + decoRand(x, y, 32) * 20, py + decoRand(x, y, 33) * 26, 8, 2); }
      continue;
    }
    c.fillStyle = (x + y) % 2 ? season.grass : season.grass2; c.fillRect(px, py, T, T);
    if (decoRand(x, y, 34) < 0.25) { c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(px + decoRand(x, y, 35) * 26, py + decoRand(x, y, 36) * 26, 5, 5); }
    if (season.id === 'spring' && decoRand(x, y, 37) < 0.08) { c.fillStyle = ['#ffafcc', '#fff', '#ffd166'][Math.floor(decoRand(x, y, 38) * 3)]; c.fillRect(px + decoRand(x, y, 39) * 28, py + decoRand(x, y, 40) * 28, 2, 2); }
    const tr = MAP.terrain[i];
    if (tr === TERRAIN.SAND) { c.fillStyle = season.id === 'winter' ? 'rgba(255,255,255,.45)' : 'rgba(233,214,160,.7)'; c.fillRect(px, py, T, T); }
    else if (tr === TERRAIN.HILL) {
      c.fillStyle = 'rgba(40,60,20,.22)'; c.fillRect(px, py, T, T);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.arc(px + 16, py + 20, 9, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    } else if (tr === TERRAIN.ROCK) {
      c.fillStyle = season.id === 'winter' ? '#c9ced6' : '#8b8680'; c.fillRect(px, py, T, T);
      c.fillStyle = 'rgba(0,0,0,.18)'; for (let q = 0; q < 3; q++) c.fillRect(px + decoRand(x, y, 41 + q) * 26, py + decoRand(x, y, 44 + q) * 26, 4 + decoRand(x, y, 47 + q) * 4, 3);
      c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(px + decoRand(x, y, 50) * 24, py + decoRand(x, y, 51) * 24, 5, 2);
    }
    if (L.resources && MAP.res[i]) { const dep = S.economy.deposits[MAP.res[i] - 1]; if (dep) { c.fillStyle = RESOURCE_TYPES[dep.type].color; c.globalAlpha = 0.28; c.fillRect(px + 2, py + 2, T - 4, T - 4); c.globalAlpha = 1; } }
  }
  if (L.zoning) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const z = MAP.zone[idx(x, y)]; if (!z) continue;
    c.fillStyle = ZONES[z].color; c.globalAlpha = 0.28; c.fillRect(x * T, y * T, T, T);
    c.globalAlpha = 0.7; c.strokeStyle = ZONES[z].color; c.lineWidth = 1; c.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3); c.globalAlpha = 1;
  }
  if (L.road) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (isRoad(x, y)) drawRoadTile(c, x, y, season);
  c.fillStyle = 'rgba(8,10,25,.55)';
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (x < ur.x0 || x > ur.x1 || y < ur.y0 || y > ur.y1) c.fillRect(x * T, y * T, T, T);
  if (!g) { g = { cv: cv }; WE.ground.set(k, g); WE.loads++; }
  g.cv = cv; g.scale = sc; g.ver = WE.groundVer; g.used = FX.time; g.x = r.x0 * T; g.y = r.y0 * T; g.w = wpx; g.h = hpx;
  WE.renders++;
  return g;
}
const GROUND_PIXEL_BUDGET = IS_MOBILE ? 9e6 : 26e6;
/* Draws the visible ground chunks; loads missing ones, refreshes stale ones within a per-frame budget, unloads unused ones */
function weDrawGround(v) {
  weEnsure();
  const stamp = weGroundStamp();
  if (MAP.groundDirty || stamp !== WE.groundKey) {
    WE.groundVer++; WE.groundKey = stamp; MAP.groundDirty = false;
    GROUND.season = seasonIndex(); GROUND.exp = S.city.expansion; GROUND.layerKey = layerKey();
  }
  const span = CHUNK * TILE, sc = weGroundScale(CAM.zoom);
  const cx0 = clamp(Math.floor(v.x0 / span), 0, WE.cw - 1), cx1 = clamp(Math.floor(v.x1 / span), 0, WE.cw - 1);
  const cy0 = clamp(Math.floor(v.y0 / span), 0, WE.chh - 1), cy1 = clamp(Math.floor(v.y1 / span), 0, WE.chh - 1);
  let budget = 5;
  const stale = function (g) { return !g || g.ver !== WE.groundVer || g.scale < sc * 0.99; };
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const k = chunkIndex(cx, cy);
    let g = WE.ground.get(k);
    if (!g) g = drawGroundChunk(k, sc);                 // visible and missing: always load now (no holes)
    else if (stale(g) && budget > 0) { g = drawGroundChunk(k, sc); budget--; }
    g.used = FX.time;
    ctx.drawImage(g.cv, g.x, g.y, g.w, g.h);
  }
  // Preload a ring of chunks around the view so panning never reaches an unloaded border
  for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(WE.chh - 1, cy1 + 1) && budget > 0; cy++) for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(WE.cw - 1, cx1 + 1) && budget > 0; cx++) {
    if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
    const k = chunkIndex(cx, cy), g = WE.ground.get(k);
    if (stale(g)) { drawGroundChunk(k, sc); budget--; } else g.used = FX.time;
  }
  if (budget <= 0) WE.budgetHit = (WE.budgetHit || 0) + 1;
  weGroundEvict();
}
function weGroundEvict() {
  if (WE.ground.size <= 4) return;
  const now = FX.time;
  let list = null;
  WE.ground.forEach(function (g, k) {
    if (now - g.used > 25) { WE.pixels -= g.cv.width * g.cv.height; if (WE.pool.length < 16) WE.pool.push(g.cv); WE.ground.delete(k); WE.unloads++; }
  });
  if (WE.pixels <= GROUND_PIXEL_BUDGET) return;
  list = Array.from(WE.ground.entries()).sort(function (a, b) { return a[1].used - b[1].used; });
  for (let i = 0; i < list.length && WE.pixels > GROUND_PIXEL_BUDGET; i++) {
    const g = list[i][1]; if (now - g.used < 0.05) break;          // never evict what was drawn this frame
    WE.pixels -= g.cv.width * g.cv.height; if (WE.pool.length < 16) WE.pool.push(g.cv); WE.ground.delete(list[i][0]); WE.unloads++;
  }
}
/* Locked land border (drawn per frame on top of the chunks so it is continuous across chunk borders) */
function weDrawLockedBorder() {
  const r = unlockedRect(), T = TILE;
  if (r.x0 <= 0 && r.y0 <= 0 && r.x1 >= MAP.W - 1 && r.y1 >= MAP.H - 1) return;
  ctx.strokeStyle = 'rgba(255,209,102,.8)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.strokeRect(r.x0 * T + 1, r.y0 * T + 1, (r.x1 - r.x0 + 1) * T - 2, (r.y1 - r.y0 + 1) * T - 2);
  ctx.setLineDash([]);
}

/* ---------------- Spatial partitioning: building buckets per chunk ---------------- */
function weBuckets() {
  weEnsure();
  if (WE.buckets && WE.bucketVer === MAP.version && WE.bucketLen === S.buildings.list.length) return WE.buckets;
  const B = new Array(WE.n); for (let k = 0; k < WE.n; k++) B[k] = [];
  S.buildings.list.forEach(function (b) { const k = chunkOfTile(b.x, b.y); if (B[k]) B[k].push(b); });
  WE.buckets = B; WE.bucketVer = MAP.version; WE.bucketLen = S.buildings.list.length;
  return B;
}
/* Buildings whose footprint (plus drawn height) can touch the visible rect — only the chunks around the view are scanned */
function weBuildingsInView(v, out) {
  const B = weBuckets(), span = CHUNK * TILE;
  const cx0 = clamp(Math.floor(v.x0 / span) - 1, 0, WE.cw - 1), cx1 = clamp(Math.floor(v.x1 / span), 0, WE.cw - 1);
  const cy0 = clamp(Math.floor(v.y0 / span) - 1, 0, WE.chh - 1), cy1 = clamp(Math.floor(v.y1 / span), 0, WE.chh - 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const l = B[chunkIndex(cx, cy)];
    for (let i = 0; i < l.length; i++) {
      const b = l[i], d = bdef(b), bx = b.x * TILE, by = b.y * TILE;
      if (bx + d.w * TILE < v.x0 || bx > v.x1 || by + d.h * TILE < v.y0 || by - 300 > v.y1) continue;
      out.push(b);
    }
  }
  return out;
}

/* ---------------- Region statistics ---------------- */
function weRegionStats(force) {
  weEnsure();
  if (WE.regions.length && performance.now() - (WE.regionReal || 0) < (force ? 1000 : 3000) && WE.regionW === MAP.W) return WE.regions;
  if (!force && WE.regions.length && S.clock.runSec - WE.regionAt < 5 && WE.regionAt <= S.clock.runSec) return WE.regions;
  WE.regionAt = S.clock.runSec; WE.regionReal = performance.now(); WE.regionW = MAP.W;
  const R = REGION_DEFS.map(function (d) { return { id: d.id, name: d.name, icon: d.icon, color: d.color, chunks: 0, tiles: 0, pop: 0, jobs: 0, homes: 0, housing: 0, roadT: 0, cong: 0, value: 0, valueN: 0, happy: 0, eduHomes: 0, healthB: 0, allB: 0, energy: 0, water: 0, prod: 0, trade: 0, tour: 0, pol: 0, polN: 0, buildings: 0 }; });
  for (let k = 0; k < WE.n; k++) { const r = chunkRect(k); R[WE.region[k]].chunks++; R[WE.region[k]].tiles += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); }
  const occRate = (SIM.housingCap || 0) > 0 ? Math.min(S.city.population, SIM.housingCap) / SIM.housingCap : 0;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (d.id === 'tree') return;
    const r = R[WE.region[chunkOfTile(b.x, b.y)]];
    r.buildings++;
    if (d.housing) { r.homes++; r.housing += b._hcap || 0; r.pop += (b._hcap || 0) * occRate; if (b._cov && (b._eduCov || nearSchool(b))) r.eduHomes++; }
    if (b._op) r.jobs += b.workers || 0;
    if (b._cov) { r.allB++; if (b._cov.health) r.healthB++; }
    if (d.power < 0 && b._op) r.energy += b._pneed || 0;
    if (d.water < 0 && b._op) r.water += -d.water * lvlMult(b.level);
    r.prod += b._prod || 0;
    if (d.rev) r.trade += b._rev || 0;
    if (d.tour && b._op) r.tour += d.tour * lvlMult(b.level) * (b._eff || 0);
  });
  const N = MAP.W * MAP.H;
  for (let i = 0; i < N; i++) {
    const x = i % MAP.W, y = (i / MAP.W) | 0, r = R[WE.region[chunkOfTile(x, y)]];
    if (MAP.roads[i]) { r.roadT++; r.cong += MAP.cong ? MAP.cong[i] : 0; }
    if (propReady() && (MAP.occ[i] || MAP.zone[i])) { r.value += PROP.grid[i]; r.valueN++; }
    if (envReady() && (MAP.occ[i] || MAP.zone[i])) { r.pol += ENV.air[i]; r.polN++; }
  }
  R.forEach(function (r) {
    r.traffic = r.roadT ? clamp(r.cong / r.roadT / 1.1 * 100, 0, 100) : 0;
    r.landValue = r.valueN ? r.value / r.valueN : 0;
    r.pollution = r.polN ? clamp(r.pol / r.polN * 100, 0, 100) : 0;
    r.education = r.homes ? r.eduHomes / r.homes * 100 : 0;
    r.health = r.allB ? r.healthB / r.allB * 100 : 0;
    r.happiness = clamp(S.city.happiness + (r.health - 70) * 0.1 + (r.education - 70) * 0.06 - r.pollution * 0.25 - r.traffic * 0.1 + (r.housing > r.pop * 1.05 ? 2 : -3), 0, 100);
    r.unemployment = r.pop > 0 ? clamp(1 - r.jobs / Math.max(1, r.pop * 0.55), 0, 1) : 0;
  });
  WE.regions = R;
  return R;
}
function nearSchool(b) {
  const c = buildingCenter(b);
  return MAP.lists.schools.some(function (s) { if (!s._op) return false; const sc = buildingCenter(s); return Math.hypot(sc.x - c.x, sc.y - c.y) / TILE <= 8; });
}

/* ---------------- Neighbouring cities ---------------- */
const NEIGHBOR_DEFS = [
  { id: 'metro', name: 'METRO CITY', icon: '🌆', dir: 'N', pop: 2400000, gdpPer: 62, growth: 0.012, exports: ['electronics', 'vehicles'], imports: ['food', 'bread'], res: null, energy: -0.08, tour: 1.3, desc: 'The capital megacity — huge job market and demand.' },
  { id: 'river', name: 'RIVER CITY', icon: '🏞️', dir: 'E', pop: 380000, gdpPer: 44, growth: 0.009, exports: ['food', 'wheat'], imports: ['materials'], res: 'wood', energy: 0.05, tour: 1.1, sea: true, desc: 'River port and farmland — sells food and timber.' },
  { id: 'industrial', name: 'INDUSTRIAL CITY', icon: '🏭', dir: 'W', pop: 640000, gdpPer: 48, growth: 0.007, exports: ['metal', 'materials', 'fuel'], imports: ['electronics'], res: 'iron', energy: 0.12, tour: 0.6, desc: 'Steel, coal and power plants — cheap materials and energy.' },
  { id: 'coastal', name: 'COASTAL CITY', icon: '🏖️', dir: 'S', pop: 520000, gdpPer: 51, growth: 0.011, exports: ['fuel', 'food'], imports: ['vehicles', 'electronics'], res: 'oil', energy: 0.02, tour: 1.6, sea: true, desc: 'Beaches and the regional seaport — tourists and oil.' },
  { id: 'tech', name: 'TECH CITY', icon: '💻', dir: 'NE', pop: 450000, gdpPer: 78, growth: 0.016, exports: ['electronics'], imports: ['materials', 'metal'], res: 'rare', energy: -0.05, tour: 1, desc: 'Start-up hub — buys materials, sells electronics.' },
  { id: 'oldtown', name: 'OLD TOWN', icon: '🏰', dir: 'SW', pop: 160000, gdpPer: 39, growth: 0.004, exports: ['bread', 'food'], imports: ['fuel'], res: 'coal', energy: 0, tour: 1.4, desc: 'Historic town — culture tourism and crafts.' }
];
function newNeighbors(seed) {
  const rnd = mulberry32((seed | 0) + 9090);
  return NEIGHBOR_DEFS.map(function (d) { const f = 0.75 + rnd() * 0.5; return { id: d.id, pop: Math.round(d.pop * f), gdp: Math.round(d.pop * f * d.gdpPer), rel: Math.round(45 + rnd() * 25), phase: rnd() * 6.28, exp: 0, imp: 0, comIn: 0, comOut: 0, tourists: 0, cargo: 0, energy: 0, resources: 0, totalTrade: 0 }; });
}
function neighborDef(id) { return NEIGHBOR_DEFS.find(function (d) { return d.id === id; }); }
/* Real connections: a road leaving the map on that side, a train station, a sea port, an airport */
function edgeRoadTiles(dir) {
  const out = [], W = MAP.W, H = MAP.H;
  const side = function (s) {
    if (s === 'N') for (let x = 0; x < W; x++) { if (MAP.roads[idx(x, 0)]) out.push(idx(x, 0)); }
    if (s === 'S') for (let x = 0; x < W; x++) { if (MAP.roads[idx(x, H - 1)]) out.push(idx(x, H - 1)); }
    if (s === 'W') for (let y = 0; y < H; y++) { if (MAP.roads[idx(0, y)]) out.push(idx(0, y)); }
    if (s === 'E') for (let y = 0; y < H; y++) { if (MAP.roads[idx(W - 1, y)]) out.push(idx(W - 1, y)); }
  };
  dir.split('').forEach(side);
  return out;
}
function neighborLinks(d) {
  const road = edgeRoadTiles(d.dir).length > 0;
  const rail = MAP.lists.trains.some(function (b) { return b._op; });
  const sea = !!d.sea && MAP.lists.ports.some(function (b) { return b._op; });
  const air = S.buildings.list.some(function (b) { return b.type === 'airport' && b._op; });
  const k = (road ? 0.45 : 0) + (rail ? 0.25 : 0) + (sea ? 0.18 : 0) + (air ? 0.12 : 0) + (S.p11 && rail ? p11RegionalBonus(d.id) : 0);   // Part 11: regional trains
  return { road: road, rail: rail, sea: sea, air: air, k: k };
}
/* Flows (every 5 s of simulated time). Effects reach the economy through SIM.p9* values read by econTick. */
function neighborTick(dt) {
  if (!S.p9) return;
  const P9 = S.p9, list = P9.neighbors;
  const yearFrac = dt / YEAR_SEC;
  const labor = SIM.labor || 0, jobs = SIM.jobs || 0, unemployed = Math.max(0, labor - (SIM.employed || 0));
  let totK = 0, comIn = 0, comOut = 0, tourists = 0, expV = 0, impV = 0, energy = 0, cargo = 0, res = 0;
  const deficit = Math.max(0, (SIM.powerUse || 0) - (SIM.powerGen || 0) + (SIM.p9PowerImport || 0));
  const surplus = Math.max(0, (SIM.powerGen || 0) - (SIM.p9PowerImport || 0) - (SIM.powerUse || 0));
  const goods = SIM.goodsProd || 0, attraction = (SIM.mods ? SIM.mods.tour : 1) * (S.city.tourismUnlocked ? 1 : 0.3);
  list.forEach(function (n) {
    const d = neighborDef(n.id); if (!d) return;
    const L = neighborLinks(d); n.links = L; totK += L.k;
    // the neighbour's own economy: growth with a slow business cycle
    n.phase += yearFrac * 2.1;
    const cyc = 1 + 0.25 * Math.sin(n.phase);
    n.pop = Math.max(1000, n.pop * (1 + d.growth * cyc * yearFrac));
    n.gdp = n.pop * d.gdpPer * (0.9 + 0.2 * cyc);
    if (!L.k) { n.comIn = n.comOut = n.tourists = n.exp = n.imp = n.energy = n.cargo = n.resources = 0; n.rel = clamp(n.rel - 0.02 * dt, 0, 100); return; }
    const w = L.k * Math.log10(n.pop) / 6;
    n.comIn = jobs > labor ? Math.min((jobs - labor) * 0.6, n.pop * 0.004) * w : 0;            // workers from the neighbour fill open jobs
    n.comOut = unemployed > 0 ? Math.min(unemployed * 0.45, n.pop * 0.003) * w : 0;            // unemployed citizens work there
    n.tourists = n.pop * 0.0004 * d.tour * w * attraction * (0.6 + S.city.reputation / 125);
    n.exp = (goods * 0.08 + S.city.population * 0.002) * w * (d.imports.length ? 1.2 : 1) * (0.5 + n.rel / 100);     // $/s our city sells
    n.imp = (S.city.population * 0.0015) * w * (0.5 + n.rel / 100);                                                    // $/s we buy (cheap inputs)
    n.energy = deficit > 0 && d.energy > 0 ? Math.min(deficit * 0.35, n.pop * d.energy * 0.0004) * (L.road || L.rail ? 1 : 0) : (surplus > 0 && d.energy < 0 ? -Math.min(surplus * 0.3, n.pop * -d.energy * 0.0004) : 0);
    n.cargo = (n.exp + n.imp) / 4;
    const resDem = d.res && SIM.sc && SIM.sc.dem ? (SIM.sc.dem[d.res] || 0) : 0;
    n.resources = d.res && L.k >= 0.45 ? Math.max(1.5, Math.min(resDem * 0.7, 60)) * w * 2 : 0;          // raw materials scale with the city's demand
    n.totalTrade += (n.exp + n.imp) * dt;
    n.rel = clamp(n.rel + (n.exp + n.imp > 1 ? 0.01 : -0.004) * dt, 0, 100);
    comIn += n.comIn; comOut += n.comOut; tourists += n.tourists; expV += n.exp; impV += n.imp; cargo += n.cargo; res += n.resources;
    energy += n.energy;
  });
  SIM.p9InCommuters = comIn; SIM.p9OutCommuters = comOut; SIM.p9Tourists = tourists; SIM.p9PowerImport = Math.max(0, energy); SIM.p9PowerExport = Math.max(0, -energy);
  SIM.p9Trade = { exp: expV, imp: impV, cargo: cargo, k: list.length ? totK / list.length : 0 };
  // money: exports pay the player's companies, imports cost a little but make inputs cheaper (importMult in part9Mods), energy is billed to the budget
  if (!S.p5.admin.freeze) {
    S.money = Math.min(MONEY_CAP, S.money + expV * dt);
    S.money = Math.max(0, S.money - impV * 0.35 * dt);
    S.budget = Math.max(0, S.budget - SIM.p9PowerImport * 0.03 * dt + SIM.p9PowerExport * 0.02 * dt);
  }
  // resources delivered by connected neighbours top up low stocks of raw materials
  if (res > 0) list.forEach(function (n) {
    const d = neighborDef(n.id); if (!d || !d.res || !n.resources) return;
    const inv = S.economy.inventory, dem = SIM.sc && SIM.sc.dem ? (SIM.sc.dem[d.res] || 0) : 0;
    if (inv[d.res] === undefined || inv[d.res] > Math.max(40, dem * 20)) return;
    const qty = n.resources * dt, price = (S.economy.prices[d.res] || 1) * 0.9 * qty;
    if (S.money >= price) { inv[d.res] += qty; S.money -= price; }
  });
  P9.flows = { comIn: Math.round(comIn), comOut: Math.round(comOut), tourists: Math.round(tourists), exp: expV, imp: impV, cargo: cargo, energyIn: SIM.p9PowerImport, energyOut: SIM.p9PowerExport, links: list.filter(function (n) { return n.links && n.links.k > 0; }).length };
  // visible cargo trucks to and from the map edge
  WE.cargoAt -= dt;
  if (WE.cargoAt <= 0 && AG.vehicles.length < perf().veh * PERF.scale) {
    WE.cargoAt = clamp(30 / (cargo + 0.5), 4, 30);
    const n = list.filter(function (x) { return x.links && x.links.road; })[Math.floor(Math.random() * 6) % Math.max(1, list.filter(function (x) { return x.links && x.links.road; }).length)];
    if (n) spawnCargoTruck(neighborDef(n.id));
  }
}
function spawnCargoTruck(d) {
  const edges = edgeRoadTiles(d.dir); if (!edges.length) return null;
  const e = pick(edges);
  const targets = MAP.lists.warehouses.concat(MAP.lists.factories, MAP.lists.shops).filter(function (b) { return b._op && b._entry >= 0 && MAP.comp[b._entry] === MAP.comp[e]; });
  const t = pickNearCamera(targets); if (!t) return null;
  const inbound = Math.random() < 0.5;
  const p = inbound ? roadPath(e, t._entry) : roadPath(t._entry, e);
  const v = makeVehicle('truck', p, { ambient: true, dest: inbound ? t : null, cargo: { item: pick(inbound ? d.exports : d.imports) || 'materials', qty: Math.round(rand(10, 25)), from: inbound ? d.name : bdef(t).name } });
  if (v) { v.intercity = d.id; v.toEdge = !inbound; }
  return v;
}
/* Neighbouring cities drawn beyond the map edge (not simulated in detail — silhouettes, labels and the highway links) */
function drawNeighbors() {
  if (!S.p9 || CAM.zoom > 0.9 || PHOTO.on) return;
  const W = MAP.W * TILE, H = MAP.H * TILE, off = TILE * 5;
  const pos = { N: [W / 2, -off], S: [W / 2, H + off], W: [-off, H / 2], E: [W + off, H / 2], NE: [W + off * 0.8, -off * 0.8], SW: [-off * 0.8, H + off * 0.8] };
  ctx.save();
  S.p9.neighbors.forEach(function (n) {
    const d = neighborDef(n.id); if (!d) return;
    const p = pos[d.dir]; if (!p) return;
    const rnd = mulberry32((S.city.seed | 0) + d.id.length * 77);
    const nB = clamp(Math.round(Math.log10(n.pop) * 4), 8, 28);
    for (let i = 0; i < nB; i++) {
      const bx = p[0] + (rnd() - 0.5) * TILE * 7, by = p[1] + (rnd() - 0.5) * TILE * 4, bw = TILE * (0.5 + rnd()), bh = TILE * (0.8 + rnd() * 3.5);
      ctx.fillStyle = 'rgba(30,38,70,.55)'; ctx.fillRect(bx, by - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,214,102,.25)'; ctx.fillRect(bx + 3, by - bh + 4, bw - 6, 2);
    }
    ctx.font = 'bold ' + Math.round(14 / CAM.zoom) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,10,25,.6)'; const label = d.icon + ' ' + d.name + ' · ' + fmt(n.pop); const tw = ctx.measureText(label).width + 12 / CAM.zoom;
    ctx.fillRect(p[0] - tw / 2, p[1] + TILE * 2.4 - 12 / CAM.zoom, tw, 22 / CAM.zoom);
    ctx.fillStyle = n.links && n.links.k ? '#80ed99' : '#adb5bd'; ctx.fillText(label, p[0], p[1] + TILE * 2.4 + 3 / CAM.zoom);
    // highway links from the edge road tiles
    if (n.links && n.links.road) {
      ctx.strokeStyle = 'rgba(200,205,215,.45)'; ctx.lineWidth = 6; ctx.setLineDash([]);
      edgeRoadTiles(d.dir).slice(0, 3).forEach(function (t) { const c = tileCenter(t); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
    }
  });
  ctx.restore();
}

/* ---------------- Map sizes & world expansion ---------------- */
function isValidWorldSize(s) { return typeof s === 'number' && isFinite(s) && s === Math.floor(s) && s >= 32 && s <= WORLD_MAX_SIZE; }
function ensureExpansionTable(size) { if (!EXPANSION_TABLE[size]) EXPANSION_TABLE[size] = [size]; }
/* CREATE NEW REGION: adds `chunks` rings of chunks (16 tiles each side). Everything existing is shifted, nothing is lost. */
function expandWorld(chunks) {
  const pad = CHUNK * Math.max(1, chunks | 0), oldW = MAP.W, oldH = MAP.H, newW = oldW + pad * 2, newH = oldH + pad * 2;
  if (newW > WORLD_MAX_SIZE) return { ok: false, reason: 'The world is at its maximum size (' + WORLD_MAX_SIZE + '×' + WORLD_MAX_SIZE + ')' };
  const old = { roads: MAP.roads, nature: MAP.nature, terrain: MAP.terrain, zone: MAP.zone, res: MAP.res, blocked: MAP.blocked };
  const remap = function (i) { const x = i % oldW, y = (i / oldW) | 0; return (y + pad) * newW + x + pad; };
  // incidents, tiles and agents that store tile indices
  resetAgents();
  if (S.p9) {
    S.p9.traffic.incidents = S.p9.traffic.incidents.filter(function (a) { return a.tile >= 0 && a.tile < oldW * oldH; }).map(function (a) { a.tile = remap(a.tile); return a; });
    S.p9.water.breaks = S.p9.water.breaks.filter(function (a) { return a.tile >= 0 && a.tile < oldW * oldH; }).map(function (a) { a.tile = remap(a.tile); return a; });
    const j = {}; for (const k in S.p9.traffic.junctions) { const t = +k; if (t >= 0 && t < oldW * oldH) j[remap(t)] = S.p9.traffic.junctions[k]; } S.p9.traffic.junctions = j;
    S.p9.disasters.forEach(function (d) { d.x += pad; d.y += pad; });
  }
  S.city.size = newW; ensureExpansionTable(newW); S.city.expansion = maxExpansionFor(newW);      // the new region opens the whole world
  MAP.W = newW; MAP.H = newH;
  const N = newW * newH;
  MAP.roads = new Uint8Array(N); MAP.nature = new Uint8Array(N); MAP.occ = new Int32Array(N); MAP.inter = new Uint8Array(N); MAP.comp = new Int32Array(N);
  MAP.terrain = new Uint8Array(N); MAP.zone = new Uint8Array(N); MAP.res = new Uint8Array(N); MAP.sea = new Uint8Array(N);
  MAP.parent = new Int32Array(N); MAP.queue = new Int32Array(N); MAP.blocked = new Uint8Array(N); MAP.shape = new Uint8Array(N);
  MAP.gScore = new Float32Array(N); MAP.heap = new Int32Array(N * 4 + 8); MAP.heapF = new Float32Array(N * 4 + 8); MAP.deco = null; MAP.cong = null;
  for (let y = 0; y < oldH; y++) for (let x = 0; x < oldW; x++) {
    const o = y * oldW + x, n = (y + pad) * newW + x + pad;
    MAP.roads[n] = old.roads[o]; MAP.nature[n] = old.nature[o]; MAP.terrain[n] = old.terrain[o]; MAP.zone[n] = old.zone[o]; MAP.res[n] = old.res[o]; MAP.blocked[n] = old.blocked[o];
  }
  const rnd = mulberry32((S.city.seed | 0) * 131 + newW * 17);
  const inOld = function (x, y) { return x >= pad && y >= pad && x < pad + oldW && y < pad + oldH; };
  // rivers continue: every water run on the old border flows on to the new border
  const extend = function (side) {
    const len = side === 'N' || side === 'S' ? oldW : oldH;
    let run = [];
    const flush = function () {
      if (!run.length) return;
      let p = (run[0] + run[run.length - 1]) / 2; const wdt = Math.max(2, Math.min(4, run.length));
      for (let t = 1; t <= pad; t++) {
        p += (rnd() - 0.5) * 1.1;
        for (let q = Math.floor(p - wdt / 2 + 0.5); q < Math.floor(p - wdt / 2 + 0.5) + wdt; q++) {
          let x, y;
          if (side === 'N') { x = q + pad; y = pad - t; } else if (side === 'S') { x = q + pad; y = pad + oldH - 1 + t; } else if (side === 'W') { x = pad - t; y = q + pad; } else { x = pad + oldW - 1 + t; y = q + pad; }
          if (x >= 0 && y >= 0 && x < newW && y < newH && !inOld(x, y)) MAP.nature[y * newW + x] = 2;
        }
      }
      run = [];
    };
    for (let k = 0; k < len; k++) {
      const o = side === 'N' ? k : side === 'S' ? (oldH - 1) * oldW + k : side === 'W' ? k * oldW : k * oldW + oldW - 1;
      if (old.nature[o] === 2) run.push(k); else flush();
    }
    flush();
  };
  ['N', 'S', 'W', 'E'].forEach(extend);
  // terrain + forests in the new land
  const n1 = makeNoise(rnd, 7), n2 = makeNoise(rnd, 4), f = makeNoise(rnd, 5), MT = MAP_TYPES[S.city.mapType] || MAP_TYPES.standard;
  for (let y = 0; y < newH; y++) for (let x = 0; x < newW; x++) {
    if (inOld(x, y)) continue;
    const i = y * newW + x;
    if (MAP.nature[i] === 2) { MAP.terrain[i] = TERRAIN.WATER; continue; }
    const h = n1(x, y) * 0.75 + n2(x, y) * 0.25;
    MAP.terrain[i] = h > MT.rock ? TERRAIN.ROCK : h > MT.hill ? TERRAIN.HILL : TERRAIN.GRASS;
    if (MAP.terrain[i] !== TERRAIN.ROCK && f(x, y) > 0.6 && rnd() < 0.7) MAP.nature[i] = 1;
  }
  for (let y = 0; y < newH; y++) for (let x = 0; x < newW; x++) {
    if (inOld(x, y)) continue; const i = y * newW + x;
    if (MAP.nature[i] !== 2 && (isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1))) { MAP.terrain[i] = TERRAIN.SAND; if (MAP.nature[i] === 1) MAP.nature[i] = 0; }
  }
  // roads continue straight out of the old map to the new border
  let roadsOut = 0;
  for (let k = 0; k < oldW; k++) {
    [[k, 0, 0, -1], [k, oldH - 1, 0, 1]].forEach(function (s) { const t = old.roads[s[1] * oldW + s[0]]; if (!t) return; roadsOut++; for (let q = 1; q <= pad; q++) { const x = s[0] + pad, y = s[1] + pad + s[3] * q; MAP.roads[y * newW + x] = t; if (MAP.nature[y * newW + x] === 1) MAP.nature[y * newW + x] = 0; } });
  }
  for (let k = 0; k < oldH; k++) {
    [[0, k, -1, 0], [oldW - 1, k, 1, 0]].forEach(function (s) { const t = old.roads[s[1] * oldW + s[0]]; if (!t) return; roadsOut++; for (let q = 1; q <= pad; q++) { const x = s[0] + pad + s[2] * q, y = s[1] + pad; MAP.roads[y * newW + x] = t; if (MAP.nature[y * newW + x] === 1) MAP.nature[y * newW + x] = 0; } });
  }
  // old deposits move with the land, then new deposits are placed in the new land
  S.economy.deposits.forEach(function (d) { if (isFinite(d.cx)) { d.cx += pad; d.cy += pad; } });
  const types = ['iron', 'coal', 'oil', 'rare', 'wood'];
  for (let k = 0; k < 3 + Math.floor(rnd() * 3) && S.economy.deposits.length < 88; k++) {
    for (let tries = 0; tries < 60; tries++) {
      const cx = Math.floor(rnd() * newW), cy = Math.floor(rnd() * newH);
      if (inOld(cx, cy) || MAP.terrain[cy * newW + cx] === TERRAIN.WATER || MAP.roads[cy * newW + cx]) continue;
      const type = types[Math.floor(rnd() * types.length)], R = RESOURCE_TYPES[type], amt = Math.round(R.min + rnd() * (R.max - R.min));
      const di = S.economy.deposits.length; S.economy.deposits.push({ type: type, amount: amt, max: amt, cx: cx, cy: cy });
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inMap(x, y) && !inOld(x, y) && Math.hypot(x - cx, y - cy) <= 1.8 && MAP.terrain[y * newW + x] !== TERRAIN.WATER && !MAP.roads[y * newW + x]) MAP.res[y * newW + x] = di + 1;
      break;
    }
  }
  // buildings move with the land
  S.buildings.list.forEach(function (b) { b.x += pad; b.y += pad; b._waterPath = null; });
  rebuildOcc();
  // camera, names, caches
  CAM.x += pad * TILE; CAM.y += pad * TILE; clampCamera();
  if (S.p8 && S.p8.world) { S.p8.world.cellNames = null; S.p8.world.size = newW; }
  computeSea(); onMapChanged(); computeDistricts(); computeDistrictNames();
  weEnsure(); MAP.groundDirty = true; if (typeof MINI !== 'undefined') MINI.ver = -1;
  if (typeof heat !== 'undefined') { heat.grid = null; heat.mode = ''; }
  if (typeof HEAT6 !== 'undefined') HEAT6.mode = '';
  if (typeof envReset === 'function') envReset();
  if (typeof propReset === 'function') propReset();
  const msg = 'New region opened: the world grew from ' + oldW + '×' + oldH + ' to ' + newW + '×' + newH + ' (' + roadsOut + ' road link(s) extended)';
  if (typeof timelineAdd === 'function') timelineAdd('🗺️', msg, 'region');
  return { ok: true, size: newW, roads: roadsOut, msg: msg };
}

/* ---------------- Part 9 state helpers used by every Part 9 module ---------------- */
function weChunkSummary() {
  weEnsure();
  return { size: MAP.W + '×' + MAP.H, chunks: WE.n, grid: WE.cw + '×' + WE.chh, near: WE.tierCount[0], mid: WE.tierCount[1], far: WE.tierCount[2], loaded: WE.ground.size, pixels: WE.pixels, loads: WE.loads, unloads: WE.unloads, renders: WE.renders };
}
/* Serializable per-chunk data for Save 3.0 */
function serializeChunks() {
  weEnsure();
  const out = [];
  for (let k = 0; k < WE.n; k++) {
    const r = chunkRect(k); let roads = 0, bld = 0, water = 0, val = 0, n = 0, soil = 0;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = idx(x, y); if (MAP.roads[i]) roads++; if (MAP.occ[i]) bld++; if (MAP.nature[i] === 2) water++;
      if (propReady()) val += PROP.grid[i];
      if (envReady()) soil += ENV.soil[i];
      n++;
    }
    out.push({ id: k, cx: r.cx, cy: r.cy, region: REGION_DEFS[WE.region[k]].id, roads: roads, tiles: bld, water: water, value: Math.round(val / Math.max(1, n)), soil: +(soil / Math.max(1, n)).toFixed(3) });
  }
  return out;
}
