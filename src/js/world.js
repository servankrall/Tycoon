'use strict';
/* BLOCK CITY TYCOON — WORLD / MAP — tile grid, terrain generation, roads, placement, pathfinding */
/* ============================ 4. WORLD / MAP ============================ */
/* Layered grid map: TERRAIN (terrain), ZONING (zone), INFRASTRUCTURE (roads + derived rail/metro/power/water),
   BUILDINGS (occ), plus natural resources (res → deposit index) and trees/water (nature). */
const MAP = {
  W: 40, H: 40, roads: null, nature: null, occ: null, inter: null, comp: null, terrain: null, zone: null, res: null, sea: null,
  roadCount: 0, byId: new Map(), pathCache: new Map(), version: 0, groundDirty: true, districts: [],
  lists: { FOOD: [], SHOPPING: [], ENTERTAINMENT: [], parks: [], homes: [], jobs: [], commercial: [], factories: [], busstops: [], metros: [], trains: [], fire: [], police: [], health: [], tourism: [],
    warehouses: [], extractors: [], waste: [], gas: [], chargers: [], schools: [], ports: [], shops: [] }
};

/* Rotation: odd rotations swap the footprint of non-square buildings. fpDef returns a (cached) rotated view of a definition. */
function fpDef(d, rot) {
  if (!d || !(rot & 1) || d.w === d.h) return d;
  if (!Object.prototype.hasOwnProperty.call(d, '_rotDef') || !d._rotDef) d._rotDef = Object.assign(Object.create(d), { w: d.h, h: d.w, _rotDef: null });
  return d._rotDef;
}
function bdef(b) { return fpDef(BUILDINGS[b.type], b.rot | 0); }
function expSizes() { return EXPANSION_TABLE[MAP.W] || EXPANSION_TABLE[40]; }
function maxExpansionFor(size) { return (EXPANSION_TABLE[size] || EXPANSION_TABLE[40]).length - 1; }
function unlockedRect() {
  const sizes = expSizes();
  const size = Math.min(MAP.W, sizes[Math.min(S.city.expansion, sizes.length - 1)] || MAP.W);
  const x0 = Math.floor((MAP.W - size) / 2), y0 = Math.floor((MAP.H - size) / 2);
  return { x0: x0, y0: y0, x1: x0 + size - 1, y1: y0 + size - 1 };
}
function inUnlocked(x, y) { const r = unlockedRect(); return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; }
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP.W && y < MAP.H; }
function idx(x, y) { return y * MAP.W + x; }
function isRoad(x, y) { return inMap(x, y) && MAP.roads[idx(x, y)] > 0; }
function isWater(x, y) { return inMap(x, y) && MAP.nature[idx(x, y)] === 2; }

function encodeGrid(arr) { let s = ''; for (let i = 0; i < arr.length; i++) s += String.fromCharCode(48 + arr[i]); return s; }
function decodeGrid(str, arr, maxVal) {
  if (typeof str !== 'string' || str.length !== arr.length) return false;
  for (let i = 0; i < arr.length; i++) { const v = str.charCodeAt(i) - 48; if (v < 0 || v > maxVal) return false; arr[i] = v; }
  return true;
}

function initMap(isNew) {
  MAP.W = MAP.H = S.city.size;
  const N = MAP.W * MAP.H;
  MAP.roads = new Uint8Array(N); MAP.nature = new Uint8Array(N); MAP.occ = new Int32Array(N);
  MAP.inter = new Uint8Array(N); MAP.comp = new Int32Array(N);
  MAP.terrain = new Uint8Array(N); MAP.zone = new Uint8Array(N); MAP.res = new Uint8Array(N); MAP.sea = new Uint8Array(N);
  MAP.parent = new Int32Array(N); MAP.queue = new Int32Array(N);
  MAP.blocked = new Uint8Array(N); MAP.shape = new Uint8Array(N); MAP.gScore = new Float32Array(N); MAP.heap = new Int32Array(N * 4 + 8); MAP.heapF = new Float32Array(N * 4 + 8); MAP.deco = null;
  MAP.byId.clear();
  S.buildings.list = [];
  if (isNew) return;                       // generateCity() fills everything procedurally
  if (!decodeGrid(S.city.nature, MAP.nature, 2)) generateCity(true);
  decodeGrid(S.city.roads, MAP.roads, 4);
  const okTerrain = decodeGrid(S.city.terrain, MAP.terrain, 4);
  decodeGrid(S.city.zones, MAP.zone, 9);
  decodeGrid(S.city.res, MAP.res, 90);
  if (!okTerrain) { for (let i = 0; i < N; i++) MAP.terrain[i] = MAP.nature[i] === 2 ? TERRAIN.WATER : TERRAIN.GRASS; S._part4Gen = true; }
  computeSea();
}

/* --- Procedural generation (deterministic for a given seed + map size) ------------- */
function makeNoise(rnd, cell) {
  const gw = Math.ceil(MAP.W / cell) + 2, g = [];
  for (let i = 0; i < gw * gw; i++) g.push(rnd());
  const sm = function (t) { return t * t * (3 - 2 * t); };
  return function (x, y) {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
}
function generateTerrain(rnd, keepOccupied) {
  const W = MAP.W, H = MAP.H, c = Math.floor(W / 2);
  const free = function (x, y) { const i = idx(x, y); return !keepOccupied || (!MAP.occ[i] && !MAP.roads[i]); };
  const safe = function (x, y, r) { return Math.abs(x - c) < r && Math.abs(y - c) < r; };
  const MT = MAP_TYPES[S.city.mapType] || MAP_TYPES.standard;
  if (!keepOccupied) {
    MAP.nature.fill(0);
    // Rivers (count depends on the map type)
    const rivers = MT === MAP_TYPES.standard ? 1 + (rnd() < 0.35 ? 1 : 0) : MT.rivers[0] + Math.floor(rnd() * (MT.rivers[1] - MT.rivers[0] + 1));
    for (let k = 0; k < rivers; k++) {
      const vertical = k === 0 ? rnd() < 0.6 : rnd() < 0.5;
      let p = rnd() < 0.5 ? 2 + rnd() * W * 0.14 : W - 4 - rnd() * W * 0.14;
      const wdt = 2 + (rnd() < 0.4 ? 1 : 0);
      for (let t = 0; t < W; t++) {
        p += (rnd() - 0.5) * 1.1; p = clamp(p, 1, W - 4);
        for (let q = Math.floor(p); q < Math.floor(p) + wdt; q++) {
          const x = vertical ? q : t, y = vertical ? t : q;
          if (inMap(x, y) && !safe(x, y, 8)) MAP.nature[idx(x, y)] = 2;
        }
      }
    }
    // Lakes
    const lakes = MT === MAP_TYPES.standard ? 1 + Math.floor(rnd() * 2) : MT.lakes[0] + Math.floor(rnd() * (MT.lakes[1] - MT.lakes[0] + 1));
    for (let k = 0; k < lakes; k++) {
      let lx, ly, tries = 0;
      do { lx = 4 + rnd() * (W - 8); ly = 4 + rnd() * (H - 8); tries++; } while (Math.hypot(lx - c, ly - c) < W * 0.3 && tries < 30);
      const rx = 2.5 + rnd() * 2.5, ry = 2 + rnd() * 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot((x - lx) / rx, (y - ly) / ry) < 1 + rnd() * 0.2 && !safe(x, y, 8)) MAP.nature[idx(x, y)] = 2;
    }
    // Islands: the sea surrounds the land
    if (MT.coast) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, y, W - 1 - x, H - 1 - y); if (e < 3 + rnd() * 2.5 && !safe(x, y, 12)) MAP.nature[idx(x, y)] = 2; }
  }
  // Terrain: water / sand / hills / rock
  const n1 = makeNoise(rnd, 7), n2 = makeNoise(rnd, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (MAP.nature[i] === 2) { MAP.terrain[i] = TERRAIN.WATER; continue; }
    MAP.terrain[i] = TERRAIN.GRASS;
    if (isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1)) { MAP.terrain[i] = TERRAIN.SAND; continue; }
    if (safe(x, y, 7) || !free(x, y)) continue;
    const h = n1(x, y) * 0.75 + n2(x, y) * 0.25;
    if (h > MT.rock) MAP.terrain[i] = TERRAIN.ROCK;
    else if (h > MT.hill) MAP.terrain[i] = TERRAIN.HILL;
  }
  // Forests
  if (!keepOccupied) {
    const f = makeNoise(rnd, 5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (MAP.nature[i] || safe(x, y, 5) || MAP.terrain[i] === TERRAIN.ROCK) continue;
      if (f(x, y) > 0.6 && rnd() < 0.7) MAP.nature[i] = 1;
    }
  }
  // Resource deposits
  MAP.res.fill(0); S.economy.deposits = [];
  const plan = [['iron', 2 + (rnd() < 0.5 ? 1 : 0), [TERRAIN.ROCK, TERRAIN.HILL]], ['coal', 2 + (rnd() < 0.5 ? 1 : 0), [TERRAIN.HILL, TERRAIN.GRASS]],
    ['oil', 2, [TERRAIN.GRASS, TERRAIN.SAND]], ['rare', 1 + (rnd() < 0.5 ? 1 : 0), [TERRAIN.ROCK, TERRAIN.HILL]], ['wood', 3, [TERRAIN.GRASS, TERRAIN.HILL]]];
  plan.forEach(function (pl) {
    const type = pl[0], R = RESOURCE_TYPES[type];
    for (let k = 0; k < pl[1]; k++) {
      let cx, cy, ok = false;
      for (let tries = 0; tries < 60 && !ok; tries++) {
        cx = 2 + Math.floor(rnd() * (W - 4)); cy = 2 + Math.floor(rnd() * (H - 4));
        const t = MAP.terrain[idx(cx, cy)];
        ok = !safe(cx, cy, 5) && t !== TERRAIN.WATER && !MAP.res[idx(cx, cy)] && free(cx, cy) && (pl[2].indexOf(t) >= 0 || tries > 40) && (type !== 'wood' || MAP.nature[idx(cx, cy)] === 1 || tries > 30);
      }
      if (!ok) continue;
      const di = S.economy.deposits.length;
      const amt = Math.round(R.min + rnd() * (R.max - R.min));
      S.economy.deposits.push({ type: type, amount: amt, max: amt, cx: cx, cy: cy });
      const rad = 1.4 + rnd() * 1.2;
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
        if (!inMap(x, y) || Math.hypot(x - cx, y - cy) > rad || MAP.terrain[idx(x, y)] === TERRAIN.WATER || !free(x, y)) continue;
        MAP.res[idx(x, y)] = di + 1;
        if (type === 'wood' && !keepOccupied) MAP.nature[idx(x, y)] = 1;
      }
    }
  });
  computeSea();
}
/* Water tiles connected to the map edge (needed for the Port & ships) */
function computeSea() {
  const W = MAP.W, H = MAP.H; MAP.sea.fill(0);
  const q = []; for (let x = 0; x < W; x++) { q.push(idx(x, 0)); q.push(idx(x, H - 1)); } for (let y = 0; y < H; y++) { q.push(idx(0, y)); q.push(idx(W - 1, y)); }
  const st = [];
  q.forEach(function (i) { if (MAP.nature[i] === 2 && !MAP.sea[i]) { MAP.sea[i] = 1; st.push(i); } });
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      const nx = x + d[0], ny = y + d[1]; if (!inMap(nx, ny)) return;
      const ni = idx(nx, ny); if (MAP.nature[ni] === 2 && !MAP.sea[ni]) { MAP.sea[ni] = 1; st.push(ni); }
    });
  }
}
/* Build a complete new city from S.city.seed: terrain, rivers, hills, resources, roads, zones, parks, Town Hall. */
function generateCity(terrainOnly) {
  const rnd = mulberry32((S.city.seed | 0) * 7919 + MAP.W * 31 + 13);
  const W = MAP.W, c = Math.floor(W / 2);
  MAP.roads.fill(0); MAP.zone.fill(0);
  generateTerrain(rnd, false);
  if (terrainOnly) return;
  const r = unlockedRect();
  const setRoad = function (x, y, t) { if (inMap(x, y)) { const i = idx(x, y); MAP.roads[i] = Math.max(MAP.roads[i], t || 1); if (MAP.nature[i] === 1) MAP.nature[i] = 0; MAP.res[i] = 0; } };
  // Main avenues (large roads) through the centre + a highway that leaves the map (bridges allowed)
  for (let x = r.x0; x <= r.x1; x++) setRoad(x, c, 3);
  for (let y = r.y0; y <= r.y1; y++) setRoad(c, y, 3);
  const dir = Math.floor(rnd() * 4);
  if (dir === 0) for (let x = r.x1; x < W; x++) setRoad(x, c, 4);
  else if (dir === 1) for (let x = 0; x <= r.x0; x++) setRoad(x, c, 4);
  else if (dir === 2) for (let y = r.y1; y < W; y++) setRoad(c, y, 4);
  else for (let y = 0; y <= r.y0; y++) setRoad(c, y, 4);
  // Secondary streets with random gaps
  const step = 4 + Math.floor(rnd() * 2);
  for (let k = -3; k <= 3; k++) {
    if (!k) continue;
    const yy = c + k * step, xx = c + k * step;
    if (yy > r.y0 && yy < r.y1) { let on = rnd() < 0.8; for (let x = r.x0 + 1; x < r.x1; x++) { if (rnd() < 0.08) on = !on; if (on && !isWater(x, yy) && MAP.terrain[idx(x, yy)] !== TERRAIN.ROCK) setRoad(x, yy, Math.abs(k) === 1 ? 2 : 1); } }
    if (xx > r.x0 && xx < r.x1) { let on = rnd() < 0.75; for (let y = r.y0 + 1; y < r.y1; y++) { if (rnd() < 0.08) on = !on; if (on && !isWater(xx, y) && MAP.terrain[idx(xx, y)] !== TERRAIN.ROCK) setRoad(xx, y, Math.abs(k) === 1 ? 2 : 1); } }
  }
  // Zones around roads inside the starting land
  const indQuad = Math.floor(rnd() * 4);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = idx(x, y);
    if (MAP.roads[i] || MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.ROCK) continue;
    if (Math.abs(x - c) <= 3 && Math.abs(y - c) <= 3) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (isRoad(x + dx, y + dy)) near = true;
    if (!near || rnd() < 0.18) continue;
    const q = (x >= c ? 1 : 0) + (y >= c ? 2 : 0);
    let z = 1;
    if (q === indQuad && Math.hypot(x - c, y - c) > 4) z = 3;
    else if ((Math.abs(y - c) <= 1 || Math.abs(x - c) <= 1) && rnd() < 0.8) z = 2;
    else if (rnd() < 0.12) z = 2;
    MAP.zone[i] = z;
  }
  computeSea();
  // Starter buildings: Town Hall, 1 house (5 citizens), 1 production machine, a park
  const place = function (type, x, y, owner) {
    const d = BUILDINGS[type];
    for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) { const i = idx(xx, yy); MAP.zone[i] = 0; MAP.nature[i] = 0; MAP.terrain[i] = TERRAIN.GRASS; MAP.res[i] = 0; }
    const b = makeBuilding(type, x, y); if (owner) b.owner = owner; addBuildingToMap(b); return b;
  };
  place('townhall', c + 1, c - 2);
  place('house', c - 2, c - 1);
  place('workshop', c + 1, c + 1);
  place('park', c - 3, c + 1);
  // A couple of procedural parks
  let parks = 0;
  for (let t = 0; t < 200 && parks < 2; t++) {
    const x = r.x0 + Math.floor(rnd() * (r.x1 - r.x0)), y = r.y0 + Math.floor(rnd() * (r.y1 - r.y0));
    const i = idx(x, y);
    if (MAP.zone[i] === 1 && !MAP.occ[i] && !MAP.roads[i]) { place('park', x, y); parks++; }
  }
}
/* Existing Part 3 cities get terrain, resources & a Town Hall without touching their buildings */
function upgradeCityToPart4() {
  const rnd = mulberry32((S.city.seed | 0) * 7919 + MAP.W * 31 + 13);
  rebuildOcc();
  generateTerrain(rnd, true);
  if (!countAny('townhall')) {
    const c = Math.floor(MAP.W / 2);
    const d = BUILDINGS.townhall;
    for (let rr = 0; rr < MAP.W / 2; rr++) {
      let done = false;
      for (let y = c - rr; y <= c + rr && !done; y++) for (let x = c - rr; x <= c + rr && !done; x++) {
        const chk = canPlaceTerrain(d, x, y);
        if (chk && hasRoadNext(d, x, y)) { const b = makeBuilding('townhall', x, y); addBuildingToMap(b); done = true; }
      }
      if (done) break;
    }
  }
}
function canPlaceTerrain(d, x, y) {
  if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) return false;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (!inUnlocked(xx, yy) || MAP.nature[i] === 2 || MAP.roads[i] || MAP.occ[i] || (MAP.terrain[i] === TERRAIN.ROCK && !d.extract)) return false;
  }
  return true;
}
function hasRoadNext(d, x, y) {
  for (let xx = x; xx < x + d.w; xx++) if (isRoad(xx, y - 1) || isRoad(xx, y + d.h)) return true;
  for (let yy = y; yy < y + d.h; yy++) if (isRoad(x - 1, yy) || isRoad(x + d.w, yy)) return true;
  return false;
}
function adjacentWater(d, x, y, seaOnly) {
  for (let yy = y - 1; yy <= y + d.h; yy++) for (let xx = x - 1; xx <= x + d.w; xx++) {
    if (!inMap(xx, yy) || (xx >= x && xx < x + d.w && yy >= y && yy < y + d.h)) continue;
    const i = idx(xx, yy);
    if (MAP.nature[i] === 2 && (!seaOnly || MAP.sea[i])) return true;
  }
  return false;
}
/* Deposit under a building footprint (for extraction facilities) */
function depositFor(b) {
  const d = bdef(b); if (!d.extract) return null;
  for (let yy = b.y; yy < b.y + d.h; yy++) for (let xx = b.x; xx < b.x + d.w; xx++) {
    const v = MAP.res[idx(xx, yy)];
    if (v && S.economy.deposits[v - 1] && S.economy.deposits[v - 1].type === d.extract.type) return S.economy.deposits[v - 1];
  }
  return null;
}

/* --- Zoning -------------------------------------------------------------------- */
function zonedTiles() { let n = 0; for (let i = 0; i < MAP.zone.length; i++) if (MAP.zone[i]) n++; return n; }
function zoneCost() { return Math.max(1, Math.round(1 * costMult())); }
function paintZone(tiles, z) {
  let n = 0; const c = zoneCost();
  for (let k = 0; k < tiles.length; k++) {
    const x = tiles[k][0], y = tiles[k][1];
    if (!inMap(x, y) || !inUnlocked(x, y)) continue;
    const i = idx(x, y);
    if (MAP.roads[i] || MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.ROCK || MAP.zone[i] === z) continue;
    if (z && S.budget < c) { toast('❌ City budget too low for zoning', 'bad'); break; }
    if (z) S.budget -= c;
    MAP.zone[i] = z; n++;
  }
  if (n) { MAP.groundDirty = true; sfx('road'); UI.idleTimer = 0; if (z) S.city.zonedByPlayer = (S.city.zonedByPlayer || 0) + n; }
  return n;
}
function rectTiles(x0, y0, x1, y1) {
  const out = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]);
  return out;
}

/* --- Buildings on the map ---------------------------------------------- */
function isAI(b) { return b.owner !== 'player' && b.owner !== 'city'; }
function ownerName(b) { if (b.owner === 'player') return '👤 You'; if (b.owner === 'city') return '🏛️ City'; const a = AI_DEFS.find(function (x) { return x.id === b.owner; }); return a ? a.icon + ' ' + a.name : '?'; }
function payerFor(d) { return d.public ? 'budget' : 'player'; }
function ownerPayer(b) { return b.owner === 'city' ? 'budget' : 'player'; }
function funds(p) { return p === 'budget' ? S.budget : S.money; }
function spend(p, amt) { if (p === 'budget') S.budget -= amt; else S.money -= amt; S.statistics.totals.spent += amt; }
function earn(p, amt) { if (p === 'budget') S.budget = Math.min(MONEY_CAP, S.budget + amt); else S.money = Math.min(MONEY_CAP, S.money + amt); }
function payerLabel(p) { return p === 'budget' ? 'city budget' : 'money'; }
function makeBuilding(type, x, y, id) {
  const d = BUILDINGS[type];
  const b = {
    id: (id === undefined || id === null) ? S.buildings.nextId++ : id,
    type: type, x: x, y: y, level: 1, workers: d.workers, built: true, progress: 1, buildTime: 1,
    upg: 0, upgTime: 1, damaged: 0, repair: 0, fire: 0, vault: 0, visitors: 0,
    owner: d.public ? 'city' : 'player', skin: 0, recipe: d.recipes ? d.recipes[0] : null, rot: 0,
    // runtime (not saved)
    _eff: 0, _rev: 0, _cost: 0, _actW: 0, _powered: true, _road: false, _entry: -1, _op: false, _tip: 0, _cust: 0, _cov: null, _anim: Math.random() * 10
  };
  return b;
}
function addBuildingToMap(b) {
  const d = bdef(b);
  S.buildings.list.push(b);
  for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) {
    const i = idx(x, y); MAP.occ[i] = b.id; if (MAP.nature[i] === 1) MAP.nature[i] = 0;
  }
  MAP.byId.set(b.id, b);
}
function rebuildOcc() {
  MAP.occ.fill(0); MAP.byId.clear();
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) MAP.occ[idx(x, y)] = b.id;
    MAP.byId.set(b.id, b);
  });
}
function removeBuilding(b) {
  const i = S.buildings.list.indexOf(b);
  if (i >= 0) S.buildings.list.splice(i, 1);
  const d = bdef(b);
  for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) if (MAP.occ[idx(x, y)] === b.id) MAP.occ[idx(x, y)] = 0;
  MAP.byId.delete(b.id);
  if (UI.selected === b) selectBuilding(null);
}
function buildingAtTile(x, y) { if (!inMap(x, y)) return null; const id = MAP.occ[idx(x, y)]; return id ? MAP.byId.get(id) || null : null; }
function lvlMult(l) { return 1 + 0.6 * (l - 1); }
function buildCost(d) { return Math.round(d.cost * costMult()); }
function buildingValue(b) { return bdef(b).cost * lvlMult(b.level) * costMult(); }
function upgradeCost(b) { const d = bdef(b); return Math.round(d.cost * 0.9 * Math.pow(1.85, b.level - 1) * costMult()); }
function buildTimeFor(cost) { return clamp(3 + Math.sqrt(cost) * 0.08, 3, 90) / (1 + 0.1 * ppLevel('build')); }
/* Counts for quests & achievements only include player/city buildings (not AI companies) */
function countBuilt(type) { let n = 0; const l = S.buildings.list; for (let i = 0; i < l.length; i++) if (l[i].type === type && l[i].built && !isAI(l[i])) n++; return n; }
function countAny(type) { let n = 0; const l = S.buildings.list; for (let i = 0; i < l.length; i++) if (l[i].type === type) n++; return n; }
function builtCount() { let n = 0; S.buildings.list.forEach(function (b) { if (b.built && b.type !== 'tree' && !isAI(b)) n++; }); return n; }
function countLandmarks() { let n = 0; S.buildings.list.forEach(function (b) { if (b.built && bdef(b).landmark) n++; }); return n; }
function totalAssignedWorkers() { let n = 0; S.buildings.list.forEach(function (b) { if (b.built && !isAI(b)) n += b.workers; }); return n; }
function hasTech(id) { return S.technology.unlocked.indexOf(id) >= 0; }

/* Unlock requirements → {ok, reason} */
function unlockStatus(d) {
  if (d.hidden) return { ok: false, reason: 'Cannot be built' };
  if (S.debugUnlockAll || (S.city.sandbox && sandboxCreative())) return (d.unique && countAny(d.id) > 0) ? { ok: false, reason: 'Already built' } : { ok: true };
  const u = d.unlock;
  if (u.ng && S.meta.ngLevel < u.ng) return { ok: false, reason: 'New Game+ ' + u.ng };
  if (u.tech && !hasTech(u.tech)) return { ok: false, reason: '🔬 ' + TECHS[u.tech].name };
  if (u.company) {
    const c = S.companies.list[u.company];
    if (!c || c.level < u.lvl) return { ok: false, reason: companyDef(u.company).name + ' Lv' + u.lvl };
  }
  if (u.cityLevel && cityLevel() < u.cityLevel) return { ok: false, reason: '🏙️ City Lv ' + u.cityLevel };
  if (u.pop && S.city.peakPop < u.pop) return { ok: false, reason: '👥 ' + fmt(u.pop) + ' pop' };
  if (u.tourism && !S.city.tourismUnlocked) return { ok: false, reason: 'Tourism (1.5K pop)' };
  if (u.exp && S.city.expansion < u.exp) return { ok: false, reason: 'Land expansion ' + u.exp };
  if (d.unique && countAny(d.id) > 0) return { ok: false, reason: 'Already built' };
  return { ok: true };
}

/* Can building type d be placed with its top-left at (x,y)?  (grid, overlap, road, water, terrain & zone rules) */
function canPlace(d, x, y, forAI) {
  if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) return { ok: false, reason: 'OUT OF MAP', code: 'map' };
  let resOk = !d.extract;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    if (!inUnlocked(xx, yy)) return { ok: false, reason: 'LOCKED LAND — expand the city', code: 'land' };
    if (MAP.nature[i] === 2) return { ok: false, reason: 'TERRAIN NOT SUITABLE — water', code: 'terrain' };
    if (MAP.roads[i]) return { ok: false, reason: 'ROAD IN THE WAY', code: 'occupied' };
    if (MAP.occ[i]) return { ok: false, reason: 'SPACE OCCUPIED', code: 'occupied' };
    if (MAP.terrain[i] === TERRAIN.ROCK && !d.extract) return { ok: false, reason: 'TERRAIN NOT SUITABLE — rock (mines only)', code: 'terrain' };
    const z = MAP.zone[i];
    if (z && !zoneAllows(z, d)) return { ok: false, reason: 'WRONG ZONE — ' + ZONES[z].name + ' allows ' + (ZONES[z].cats.length ? ZONES[z].cats.join('/') : '') + (ZONES[z].ids ? (ZONES[z].cats.length ? ' + ' : '') + ZONES[z].ids.slice(0, 4).map(function (i) { return BUILDINGS[i] ? BUILDINGS[i].name : i; }).join(', ') + '…' : ''), code: 'zone' };
    if (d.extract && MAP.res[i]) { const dep = S.economy.deposits[MAP.res[i] - 1]; if (dep && dep.type === d.extract.type && dep.amount > 0) resOk = true; }
  }
  if (!resOk) return { ok: false, reason: 'TERRAIN NOT SUITABLE — needs a ' + RESOURCE_TYPES[d.extract.type].name + ' deposit (Resources layer)', code: 'terrain' };
  if (d.needsWater && !adjacentWater(d, x, y, false)) return { ok: false, reason: 'TERRAIN NOT SUITABLE — must touch a river or lake', code: 'terrain' };
  if (d.needsSea && !adjacentWater(d, x, y, true)) return { ok: false, reason: 'TERRAIN NOT SUITABLE — must touch sea-connected water', code: 'terrain' };
  const road = hasRoadNext(d, x, y);
  if (forAI) return { ok: road || d.noRoad };
  const st = unlockStatus(d);
  if (!st.ok) return { ok: false, reason: 'LOCKED — ' + st.reason, code: 'locked' };
  const ban = S.p5 ? challengeBans(d) : null;
  if (ban) return { ok: false, reason: 'BANNED BY CHALLENGE — ' + ban.name, code: 'challenge' };
  if (d.techDistrict) {
    if (!p5Unlocked('startups')) return { ok: false, reason: 'LOCKED — Story Chapter 5 (The Big Investment)', code: 'locked' };
    if (!inTechDistrict(x, y, d.w, d.h, -1)) return { ok: false, reason: 'NEEDS TECH DISTRICT — build near offices, labs or campuses', code: 'district' };
  }
  if (!road && !d.noRoad && !S.city.sandbox) return { ok: false, reason: 'NEEDS ROAD CONNECTION', code: 'road' };
  // Utilities: buildings that consume power/water need at least some generation in the city
  if (!S.city.sandbox && d.power < 0 && SIM.powerGen <= 0) return { ok: false, reason: 'NOT ENOUGH POWER — build a generator first', code: 'power' };
  if (!S.city.sandbox && d.water < 0 && SIM.waterGen <= 0) return { ok: false, reason: 'NOT ENOUGH WATER — build a water tower first', code: 'water' };
  const payer = payerFor(d);
  if (funds(payer) < buildCost(d)) return { ok: false, reason: 'NOT ENOUGH ' + (payer === 'budget' ? 'CITY BUDGET' : 'MONEY') + ' (' + money(buildCost(d)) + ')', money: true, code: 'money' };
  const warn = [];
  if (d.power < 0 && SIM.powerGen - SIM.powerUse < -d.power) warn.push('⚡ Low power reserve — it may run unpowered');
  if (d.water < 0 && SIM.waterGen - SIM.waterUse < -d.water) warn.push('💧 Low water reserve');
  return { ok: true, warn: warn.join(' · '), land: landValueAt(x, y, d) };
}

function placeBuilding(d0, x, y, rot) {
  rot = (rot | 0) & 3;
  const d = fpDef(d0, rot);
  const chk = canPlace(d, x, y);
  if (!chk.ok) { toast('❌ ' + chk.reason, 'bad'); sfx('error'); return null; }
  const cost = S.p5 && S.p5.admin.god ? 0 : buildCost(d);
  spend(payerFor(d), cost);
  const b = makeBuilding(d.id, x, y);
  b.rot = rot;
  if (S.p5 && S.p5.admin.instant) b.buildTime = 0.2;
  b.built = false; b.progress = 0; if (!(S.p5 && S.p5.admin.instant)) b.buildTime = buildTimeFor(d.cost);
  addBuildingToMap(b);
  if (d.cat === 'Industry' && S.p5 && S.p5.weekly && !S.p5.weekly.done) { const wt = WEEKLY_TEMPLATES.find(function (t) { return t.id === S.p5.weekly.id; }); if (wt && wt.noFactories) S.p5.weekly.tainted = true; }
  onMapChanged();
  sfx('build');
  const c = buildingCenter(b);
  spawnParticles(c.x, c.y, 'dust', 14);
  floatText(c.x, c.y - 20, '-' + money(cost) + (d.public ? ' 🏛️' : ''), '#ff8fa3');
  UI.idleTimer = 0;
  return b;
}
function upgradeBuilding(b) {
  const d = bdef(b);
  if (isAI(b)) { toast('Owned by ' + ownerName(b) + ' — buy it first', 'bad'); sfx('error'); return; }
  if (!b.built || b.upg > 0) { toast('⏳ Building is busy', 'bad'); sfx('error'); return; }
  if (b.level >= MAX_LEVEL) { toast('Max level reached', 'bad'); sfx('error'); return; }
  const cost = upgradeCost(b), p = ownerPayer(b);
  if (funds(p) < cost) { toast('❌ Not enough ' + payerLabel(p), 'bad'); sfx('error'); return; }
  spend(p, cost);
  if (b.health !== undefined) b.health = Math.min(100, b.health + 20);
  S.p5.tut.upgraded = (S.p5.tut.upgraded || 0) + 1;
  b.upg = 0.0001; b.upgTime = buildTimeFor(d.cost) * 0.6;
  sfx('build');
  const c = buildingCenter(b); spawnParticles(c.x, c.y, 'spark', 16);
  UI.idleTimer = 0;
}
function demolish(b) {
  const d = bdef(b);
  if (d.noDemolish) { toast('🏛️ The Town Hall cannot be demolished', 'bad'); sfx('error'); return; }
  const c = buildingCenter(b);
  if (isAI(b)) {
    const comp = Math.round(buildingValue(b) * 0.5);
    if (S.budget < comp) { toast('❌ Compensation of ' + money(comp) + ' needed from the city budget', 'bad'); sfx('error'); return; }
    S.budget -= comp; if (S.ai[b.owner]) S.ai[b.owner].cash += comp;
    floatText(c.x, c.y - 20, '-' + money(comp) + ' 🏛️', '#ff8fa3');
  } else {
    const refund = Math.round(buildCost(d) * (b.built ? 0.5 : 0.9));
    earn(ownerPayer(b), refund);
    floatText(c.x, c.y - 20, '+' + money(refund), '#8cffc1');
  }
  spawnParticles(c.x, c.y, 'dust', 22);
  removeBuilding(b);
  onMapChanged();
  sfx('demolish');
}
function setWorkers(b, n) {
  const d = bdef(b);
  if (isAI(b)) { toast('Owned by ' + ownerName(b), 'bad'); return; }
  const before = b.workers;
  b.workers = clamp(Math.round(n), 0, d.maxW);
  if (b.workers > before && S.p5) S.p5.tut.hired = (S.p5.tut.hired || 0) + 1;
  UI.idleTimer = 0;
}
function repairBuilding(b) {
  const cost = Math.round(buildCost(bdef(b)) * 0.1), p = isAI(b) ? 'budget' : ownerPayer(b);
  if (funds(p) < cost) { toast('❌ Not enough ' + payerLabel(p) + ' to repair', 'bad'); sfx('error'); return; }
  spend(p, cost); b.damaged = 0; b.repair = 0; b.fire = 0;
  sfx('build'); toast('🔧 Repaired for ' + money(cost), 'good');
}
function buyBuildingFromAI(b) {
  if (!isAI(b)) return;
  const price = Math.round(buildingValue(b) * 1.3);
  if (S.money < price) { toast('❌ Not enough money (' + money(price) + ')', 'bad'); sfx('error'); return; }
  S.money -= price; if (S.ai[b.owner]) S.ai[b.owner].cash += price;
  toast('🤝 Bought ' + bdef(b).name + ' from ' + ownerName(b), 'gold');
  b.owner = 'player'; sfx('money');
}
function cycleSkin(b) { b.skin = ((b.skin | 0) + 1) % BUILDING_SKINS.length; sfx('click'); }
function setRecipe(b, r) { const d = bdef(b); if (d.recipes && d.recipes.indexOf(r) >= 0 && !isAI(b)) { b.recipe = r; sfx('click'); } }

/* --- Roads ---------------------------------------------------------------- */
function roadCost(t) { return Math.round(ROAD_TYPES[t || 1].cost * costMult()); }
function bridgeCost(t) { return roadCost(t) * 4; }
/* Cost of one tile of road type t (bridge ×4 over water, tunnel ×6 through rock; upgrades pay the difference) */
function tileRoadCost(x, y, t) {
  t = t || (UI.roadType || 1);
  if (!inMap(x, y)) return 0;
  const i = idx(x, y), cur = MAP.roads[i];
  const k = MAP.nature[i] === 2 ? 4 : MAP.terrain[i] === TERRAIN.ROCK ? 6 : 1;
  return Math.max(0, roadCost(t) - (cur ? roadCost(cur) : 0)) * k;
}
function isTunnel(i) { return MAP.roads[i] > 0 && MAP.terrain[i] === TERRAIN.ROCK; }
/* Roads can cross water as bridges and rock as tunnels; existing roads can be upgraded to a bigger type */
function canRoad(x, y) {
  if (!inMap(x, y)) return false;
  const i = idx(x, y), t = UI.roadType || 1;
  if (!inUnlocked(x, y) || MAP.occ[i]) return false;
  if (MAP.roads[i]) return MAP.roads[i] < t;
  return true;
}
function lineTiles(x0, y0, x1, y1) {
  // L-shaped line: horizontal first, then vertical
  const out = [];
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  for (let x = x0; x !== x1 + sx; x += sx) out.push([x, y0]);
  for (let y = y0 + sy; y !== y1 + sy; y += sy) out.push([x1, y]);
  if (y0 === y1 && out.length === 0) out.push([x0, y0]);
  return out;
}
function placeRoads(tiles) {
  let placed = 0; let noMoney = false, bridges = 0, tunnels = 0;
  for (let k = 0; k < tiles.length; k++) {
    const x = tiles[k][0], y = tiles[k][1];
    if (!canRoad(x, y)) continue;
    const c = S.p5 && S.p5.admin.god ? 0 : tileRoadCost(x, y);
    const upgrading = MAP.roads[idx(x, y)] > 0;
    if (S.budget < c) { noMoney = true; break; }
    spend('budget', c);
    const i = idx(x, y);
    if (MAP.nature[i] === 2 && !upgrading) bridges++; else if (MAP.nature[i] !== 2) MAP.nature[i] = 0;
    if (MAP.terrain[i] === TERRAIN.ROCK && !upgrading) tunnels++;
    MAP.roads[i] = UI.roadType || 1; MAP.zone[i] = 0; placed++;
    if (placed % 3 === 1) spawnParticles(x * TILE + TILE / 2, y * TILE + TILE / 2, 'dust', 3);
  }
  if (placed) { onMapChanged(); sfx('road'); UI.idleTimer = 0; if (S.p5) S.p5.tut.roads = (S.p5.tut.roads || 0) + placed; if (bridges) toast('🌉 ' + bridges + ' bridge tile' + (bridges > 1 ? 's' : '') + ' built', 'good'); if (tunnels) toast('🚇 ' + tunnels + ' tunnel tile' + (tunnels > 1 ? 's' : '') + ' dug', 'good'); }
  if (noMoney) toast('❌ City budget too low for more road', 'bad');
  return placed;
}
function bulldozeTile(x, y) {
  if (!inMap(x, y)) return;
  const b = buildingAtTile(x, y);
  if (b) { demolish(b); return; }
  const i = idx(x, y);
  if (MAP.roads[i]) {
    const rt = MAP.roads[i]; MAP.roads[i] = 0; MAP.blocked[i] = 0; earn('budget', Math.round(roadCost(rt) * 0.4));
    spawnParticles(x * TILE + 16, y * TILE + 16, 'dust', 6); onMapChanged(); sfx('demolish');
  } else if (MAP.nature[i] === 1 && inUnlocked(x, y)) {
    MAP.nature[i] = 0; spawnParticles(x * TILE + 16, y * TILE + 16, 'leaf', 6); MAP.groundDirty = true; sfx('demolish');
  }
}

/* Recompute everything that depends on the map layout. */
function onMapChanged() {
  const W = MAP.W, N = W * MAP.H;
  let rc = 0;
  for (let i = 0; i < N; i++) {
    MAP.inter[i] = 0;
    if (!MAP.roads[i]) continue;
    rc++;
    const x = i % W, y = (i / W) | 0;
    const n = (isRoad(x + 1, y) ? 1 : 0) + (isRoad(x - 1, y) ? 1 : 0) + (isRoad(x, y + 1) ? 1 : 0) + (isRoad(x, y - 1) ? 1 : 0);
    if (n >= 3) MAP.inter[i] = 1;
    MAP.shape[i] = roadShapeCode(x, y);
  }
  MAP.roadCount = rc;
  let capSum = 0; for (let i = 0; i < N; i++) if (MAP.roads[i]) capSum += ROAD_TYPES[MAP.roads[i]].cap;
  MAP.roadCapSum = capSum;
  for (let i = 0; i < N; i++) if (!MAP.roads[i]) { MAP.shape[i] = 0; MAP.blocked[i] = 0; }
  MAP.edgeRoad = false;
  for (let k = 0; k < W && !MAP.edgeRoad; k++) if (isRoad(k, 0) || isRoad(k, MAP.H - 1) || isRoad(0, k) || isRoad(W - 1, k)) MAP.edgeRoad = true;
  // Road connected components (fast reachability check)
  MAP.comp.fill(0);
  let label = 0; const q = MAP.queue;
  for (let i = 0; i < N; i++) {
    if (!MAP.roads[i] || MAP.comp[i]) continue;
    label++; let h = 0, t = 0; q[t++] = i; MAP.comp[i] = label;
    while (h < t) {
      const c = q[h++]; const x = c % W, y = (c / W) | 0;
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (let k = 0; k < 4; k++) {
        const nx = nb[k][0], ny = nb[k][1];
        if (!isRoad(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (!MAP.comp[ni]) { MAP.comp[ni] = label; q[t++] = ni; }
      }
    }
  }
  S.buildings.list.forEach(function (b) { b._entry = findEntry(b); b._road = b._entry >= 0; });
  MAP.pathCache.clear(); MAP.version++;
  MAP.groundDirty = true;
  rebuildLists();
  computeCoverage();
  computeRoadNames();
  if (typeof validateVehicles === 'function') validateVehicles();
}
function findEntry(b) {
  const d = bdef(b);
  // The entrance faces the building's rotation (0 south, 1 east, 2 north, 3 west); other sides are fallbacks
  const side = [[], [], [], []];
  for (let x = b.x; x < b.x + d.w; x++) { side[0].push([x, b.y + d.h]); side[2].push([x, b.y - 1]); }
  for (let y = b.y; y < b.y + d.h; y++) { side[1].push([b.x + d.w, y]); side[3].push([b.x - 1, y]); }
  const r = (b.rot | 0) & 3;
  const cand = side[r].concat(side[(r + 1) & 3], side[(r + 3) & 3], side[(r + 2) & 3]);
  for (let k = 0; k < cand.length; k++) if (isRoad(cand[k][0], cand[k][1])) return idx(cand[k][0], cand[k][1]);
  return -1;
}
function tileCenter(i) { return { x: (i % MAP.W) * TILE + TILE / 2, y: ((i / MAP.W) | 0) * TILE + TILE / 2 }; }
function buildingCenter(b) { const d = bdef(b); return { x: (b.x + d.w / 2) * TILE, y: (b.y + d.h / 2) * TILE }; }
/* Point on the building's edge facing its entry road tile */
function doorPoint(b) {
  const d = bdef(b);
  if (b._entry < 0) return buildingCenter(b);
  const ex = b._entry % MAP.W, ey = (b._entry / MAP.W) | 0;
  const px = clamp(ex, b.x, b.x + d.w - 1) * TILE + TILE / 2;
  const py = clamp(ey, b.y, b.y + d.h - 1) * TILE + TILE / 2;
  const cx = ex * TILE + TILE / 2, cy = ey * TILE + TILE / 2;
  return { x: (px + cx) / 2, y: (py + cy) / 2 };
}

/* A* shortest path on the road grid (binary heap, Manhattan heuristic, cached).
   Blocked tiles (traffic accidents) are very expensive, so traffic routes around them;
   emergency vehicles (allowBlocked) may drive into them. Returns tile index array or null. */
function roadPath(a, b, allowBlocked) {
  if (a < 0 || b < 0 || !MAP.roads[a] || !MAP.roads[b]) return null;
  if (MAP.comp[a] !== MAP.comp[b]) return null;
  if (a === b) return [a];
  const key = a * 100000 + b + (allowBlocked ? 0.5 : 0);
  const cached = MAP.pathCache.get(key);
  if (cached) return cached;
  if (typeof pathRequests !== 'undefined') pathRequests++;
  const W = MAP.W, par = MAP.parent, g = MAP.gScore, heap = MAP.heap, bl = MAP.blocked;
  par.fill(-1); g.fill(1e9);
  const bx = b % W, by = (b / W) | 0;
  let hn = 0;
  const hf = MAP.heapF;
  const push = function (node, f) {
    let i = hn++; heap[i] = node; hf[i] = f;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; const tn = heap[p], tf = hf[p]; heap[p] = heap[i]; hf[p] = hf[i]; heap[i] = tn; hf[i] = tf; i = p; }
  };
  const pop = function () {
    const top = heap[0]; hn--;
    if (hn > 0) {
      heap[0] = heap[hn]; hf[0] = hf[hn]; let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hn && hf[l] < hf[m]) m = l; if (r < hn && hf[r] < hf[m]) m = r; if (m === i) break; const tn = heap[m], tf = hf[m]; heap[m] = heap[i]; hf[m] = hf[i]; heap[i] = tn; hf[i] = tf; i = m; }
    }
    return top;
  };
  g[a] = 0; par[a] = a; push(a, 0);
  let guard = 0;
  while (hn > 0 && guard++ < W * MAP.H * 4) {
    const c = pop();
    if (c === b) break;
    const x = c % W, y = (c / W) | 0, gc = g[c];
    for (let k = 0; k < 4; k++) {
      let n;
      if (k === 0) { if (x + 1 >= W) continue; n = c + 1; } else if (k === 1) { if (x <= 0) continue; n = c - 1; }
      else if (k === 2) { if (y + 1 >= MAP.H) continue; n = c + W; } else { if (y <= 0) continue; n = c - W; }
      if (!MAP.roads[n]) continue;
      const cost = 1 / ROAD_TYPES[MAP.roads[n]].speed + (bl[n] && !(allowBlocked && n === b) ? 40 : 0) + (MAP.inter[n] ? 0.15 : 0) + (MAP.cong && !allowBlocked ? MAP.cong[n] * 1.5 : 0);
      const ng = gc + cost;
      if (ng < g[n]) { g[n] = ng; par[n] = c; push(n, ng + (Math.abs(n % W - bx) + Math.abs(((n / W) | 0) - by)) * 0.64); }
    }
    if (hn >= heap.length - 4) break;
  }
  if (par[b] < 0) return null;
  const path = []; let c = b, lim = 0;
  while (c !== a && lim++ < W * MAP.H) { path.push(c); c = par[c]; }
  path.push(a); path.reverse();
  if (MAP.pathCache.size > 1200) MAP.pathCache.clear();
  MAP.pathCache.set(key, path);
  return path;
}
/* Road auto-connection: 0 none, 1 isolated, 2 dead-end, 3 straight, 4 corner, 5 T-junction, 6 crossroad, +10 = bridge */
function roadShapeCode(x, y) {
  const n = isRoad(x, y - 1), s = isRoad(x, y + 1), w = isRoad(x - 1, y), e = isRoad(x + 1, y);
  const k = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
  let c = k === 0 ? 1 : k === 1 ? 2 : k === 2 ? ((n && s) || (w && e) ? 3 : 4) : k === 3 ? 5 : 6;
  if (MAP.nature[idx(x, y)] === 2) c += 10;
  return c;
}
const ROAD_SHAPE_NAMES = { 1: 'Isolated', 2: 'Dead-end', 3: 'Straight', 4: 'Corner', 5: 'T-junction', 6: 'Crossroad' };
function landValueAt(x, y, d) {
  const dist = districtOf(x, y);
  let cov = 0; const cx = (x + d.w / 2) * TILE, cy = (y + d.h / 2) * TILE;
  ['fire', 'police', 'health'].forEach(function (t) { if (MAP.lists[t].some(function (s) { const sc = buildingCenter(s); return s.built && Math.hypot(sc.x - cx, sc.y - cy) / TILE <= coverRadius(s); })) cov++; });
  return 0.88 + cov * 0.04 + (dist ? dist.level * 0.04 + dist.green * 0.02 : 0) - SIM.traffic * 0.0008;
}

/* Cached per-type building lists used by the agents & economy */
function rebuildLists() {
  const L = MAP.lists;
  for (const k in L) L[k] = [];
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    if (d.housing) L.homes.push(b);
    if (d.workers) L.jobs.push(b);
    if (d.sector === 'FOOD') L.FOOD.push(b);
    if (d.sector === 'SHOPPING') L.SHOPPING.push(b);
    if (d.sector === 'ENTERTAINMENT' && d.id !== 'park' && d.id !== 'plaza') L.ENTERTAINMENT.push(b);
    if (d.id === 'park' || d.id === 'plaza') L.parks.push(b);
    if (d.rev) L.commercial.push(b);
    if (d.goods) L.factories.push(b);
    if (d.id === 'busstop') L.busstops.push(b);
    if (d.id === 'metro') L.metros.push(b);
    if (d.id === 'trainstation') L.trains.push(b);
    if (d.service) L[d.service].push(b);
    if (d.tour) L.tourism.push(b);
    if (d.storage && d.id === 'warehouse') L.warehouses.push(b);
    if (d.extract) L.extractors.push(b);
    if (d.wasteCap) L.waste.push(b);
    if (d.fuelServe) L.gas.push(b);
    if (d.evCharge) L.chargers.push(b);
    if (d.edu && !d.eduHigh) L.schools.push(b);
    if (d.id === 'port') L.ports.push(b);
    if (d.sector === 'SHOPPING' || d.sector === 'FOOD') L.shops.push(b);
  });
}

/* Service coverage (fire / police / health) — fraction of buildings covered */
function coverRadius(b) {
  const d = bdef(b);
  return d.cover * (hasTech('d_emergency') ? 1.3 : 1) * (d.service === 'health' ? (hasTech('h_clinics') ? 1.2 : 1) * (hasTech('h_telemed') ? 1.3 : 1) : 1) * (0.55 + 0.45 * clamp(b._eff || (b.built ? 1 : 0), 0, 1.3)) * (1 + 0.1 * (b.level - 1));
}
function computeCoverage() {
  const types = ['fire', 'police', 'health'];
  const tot = { fire: 0, police: 0, health: 0 }; let count = 0;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    b._cov = { fire: 0, police: 0, health: 0 };
    if (d.id === 'tree' || d.id === 'park') return;
    const c = buildingCenter(b);
    const w = d.w * d.h;
    count += w;
    types.forEach(function (t) {
      const st = MAP.lists[t];
      for (let k = 0; k < st.length; k++) {
        const s = st[k]; if (!s.built || !s._road) continue;
        const sc = buildingCenter(s);
        if (Math.hypot(sc.x - c.x, sc.y - c.y) / TILE <= coverRadius(s)) { b._cov[t] = 1; tot[t] += w; break; }
      }
    });
  });
  types.forEach(function (t) { SIM.cov[t] = count ? tot[t] / count : 0; });
}
