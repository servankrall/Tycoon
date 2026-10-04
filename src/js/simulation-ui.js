'use strict';
/* BLOCK CITY TYCOON — SIMULATION UI — heatmaps, minimap, F3 debug, statistics center, scenario, sandbox */
/* ============================== 18. P6 UI ============================== */
/* --- Engine aliases: every system is reachable through Game.<Engine> ---- */
Game.GameEngine = { step: function (dt) { Game.step(dt); }, advance: function (dt) { return Game.advance(dt); }, speeds: SIM_SPEEDS };
Game.Renderer6 = { render: render, minimap: function () { drawMinimap(true); }, heatmaps: HEATMAPS };
Game.EconomyEngine = { tick: econTick, inflation: inflationTick, priceLevel: priceLevel, stocks: stockMarketTick };
Game.CitizenEngine = { update: updateCitizens, think: npcAiTick, profile: citizenProfile, save: serializeCitizens, load: restoreCitizens };
Game.TrafficEngine = { update: updateTraffic, congestion: congestionTick, path: roadPath, reroute: tryReroute };
Game.BuildingEngine = { place: placeBuilding, upgrade: upgradeBuilding, evolve: evolveBuilding, demolish: demolish };
Game.EventEngine = { tick: eventsTick, crises: crisisTick, disasters: disasterReportTick };
Game.QuestEngine = { dynamic: dqTick, story: storyTick, scenario: scenarioTick, challenge: genChallengeTick };
Game.SaveSystem = { save: saveGame, load: loadGame, exportJSON: exportSaveJSON, importText: importSave };
Game.UISystem = { refresh: refreshTopbar, palette: openPalette, stats: function () { openStatsCenter(); } };
Object.defineProperty(Game, 'AudioSystem', { get: function () { return SND; } });
Game.AchievementSystem = { list: ACHIEVEMENTS, milestones: milestoneTick };
Game.SimulationSystem = { speed: function () { return S.settings.speed; }, set: function (s) { setSpeed(s); }, step: stepSpeed };

/* --- Speed control (topbar) --------------------------------------------- */
function renderSpeedUI() {
  const el = $('speedLabel'); if (!el) return;
  el.textContent = S.settings.speed === 0 ? '⏸' : speedLabel(S.settings.speed).replace('🐢 ', '');
  $('speedPause').classList.toggle('on', S.settings.speed === 0);
  el.classList.toggle('fast', S.settings.speed >= 10);
}

/* --- Heatmaps ------------------------------------------------------------ */
const HEAT6 = { grid: null, mode: '', at: -9 };
function covGrid(types, radiusFn, weightFn) {
  const N = MAP.W * MAP.H, g = new Float32Array(N);
  S.buildings.list.forEach(function (s) {
    if (typeof types === 'function' ? !types(s) : types.indexOf(s.type) < 0) return;
    if (!s.built) return;
    const c = buildingCenter(s), R = radiusFn(s), cx = c.x / TILE, cy = c.y / TILE, w = weightFn ? weightFn(s) : 1;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (!inMap(x, y)) continue;
      const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (dd > R) continue;
      const i = idx(x, y); g[i] = Math.max(g[i], w * (1 - dd / R * 0.6));
    }
  });
  return g;
}
function computeHeat6(mode) {
  const N = MAP.W * MAP.H;
  const p9 = p9HeatGrid(mode);            // Part 9: wind-blown pollution, noise, air / water / soil quality, grid, pressure, sewage …
  if (p9) { HEAT6.grid = p9; HEAT6.mode = mode; HEAT6.at = FX.time; return; }
  let g = new Float32Array(N);
  const L = S.buildings.list;
  const svc = function (t) { return covGrid(function (b) { return BUILDINGS[b.type].service === t && b._road; }, function (b) { return coverRadius(b); }); };
  switch (mode) {
    case 'TRAFFIC': {
      if (!MAP.cong) congestionTick();
      for (let i = 0; i < N; i++) if (MAP.roads[i]) g[i] = clamp(MAP.cong[i] / 1.1 + SIM.traffic / 300, 0, 1);
      const g2 = g.slice();
      for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) { const i = idx(x, y); if (MAP.roads[i]) continue; let m = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { if (inMap(x + o[0], y + o[1])) m = Math.max(m, g2[idx(x + o[0], y + o[1])]); }); g[i] = m * 0.35; }
    } break;
    case 'ELECTRICITY': g = covGrid(function (b) { return BUILDINGS[b.type].power > 0 && b._op; }, function (b) { return 5 + Math.sqrt(BUILDINGS[b.type].power) * 0.6; });
      L.forEach(function (b) { const d = bdef(b); if (d.power < 0 && b.built) for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = b._powered ? Math.max(0.7, g[idx(x, y)]) : 0.05; }); break;
    case 'WATER': g = covGrid(function (b) { return BUILDINGS[b.type].water > 0 && b._op; }, function (b) { return 5 + Math.sqrt(BUILDINGS[b.type].water) * 0.6; });
      L.forEach(function (b) { const d = bdef(b); if (d.water < 0 && b.built) for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) g[idx(x, y)] = Math.max(g[idx(x, y)] * SIM.waterRatio, 0.08); }); break;
    case 'LAND VALUE': case 'WEALTH': case 'HAPPINESS': {
      const f = svc('fire'), p = svc('police'), h = svc('health'); computeHeat('POLLUTION'); const pol = heat.grid.slice();
      const park = covGrid(function (b) { return BUILDINGS[b.type].hap > 0; }, function () { return 4; });
      for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
        const i = idx(x, y), dist = districtOf(x, y);
        let v = 0.25 + (f[i] + p[i] + h[i]) * 0.12 + park[i] * 0.15 + (dist ? dist.level * 0.08 : 0) - pol[i] * 0.3 - (MAP.cong ? MAP.cong[i] * 0.1 : 0);
        if (mode === 'HAPPINESS') v = S.city.happiness / 100 * 0.6 + park[i] * 0.2 + (f[i] + p[i] + h[i]) * 0.07 - pol[i] * 0.35 - (MAP.cong ? MAP.cong[i] * 0.15 : 0);
        g[i] = clamp(v, 0, 1);
      }
      if (mode === 'WEALTH') { L.forEach(function (b) { const d = bdef(b); const w = clamp(Math.log10(1 + (b._rev || 0) + (d.housing ? (d.quality || 40) / 20 * lvlMult(b.level) : 0)) / 3, 0, 1); for (let y = b.y - 1; y <= b.y + d.h; y++) for (let x = b.x - 1; x <= b.x + d.w; x++) if (inMap(x, y)) g[idx(x, y)] = Math.max(g[idx(x, y)] * 0.6, w); }); }
      if (mode === 'HAPPINESS') for (let i = 0; i < N; i++) if (!MAP.occ[i] && !MAP.roads[i] && !MAP.zone[i]) g[i] *= 0.4;
    } break;
    case 'POLLUTION': computeHeat('POLLUTION'); g = heat.grid.slice(); break;
    case 'SAFETY': { const p = svc('police'); for (let i = 0; i < N; i++) g[i] = clamp(p[i] * 0.85 + 0.15 - S.city.crime / 200, 0, 1); } break;
    case 'HEALTH': g = svc('health'); break;
    case 'FIRE': g = svc('fire'); break;
    case 'EDUCATION': g = covGrid(function (b) { return BUILDINGS[b.type].edu > 0 && b._op; }, function (b) { return BUILDINGS[b.type].eduHigh ? 10 : 6; }); break;
    case 'DEMAND': {
      const dem = { 1: SIM.housingDemandRatio || 1, 2: ((SIM.demand.FOOD || 0) + (SIM.demand.SHOPPING || 0)) / Math.max(1, (SIM.supply.FOOD || 0) + (SIM.supply.SHOPPING || 0)), 3: SIM.goodsRatio < 1 ? 1.5 - SIM.goodsRatio * 0.5 : 0.8, 5: (SIM.demand.TECHNOLOGY || 0) / Math.max(1, SIM.supply.TECHNOLOGY || 1), 7: (SIM.demand.ENTERTAINMENT || 0) / Math.max(1, SIM.supply.ENTERTAINMENT || 1) };
      dem[8] = dem[5]; dem[9] = dem[1]; dem[6] = S.city.tourismUnlocked ? 1.2 : 0.5; dem[4] = 0.6;
      for (let i = 0; i < N; i++) { const z = MAP.zone[i]; if (z && !MAP.occ[i]) g[i] = clamp((dem[z] || 1) - 0.4, 0, 1.2) / 1.2; else if (MAP.occ[i]) g[i] = 0.15; }
    } break;
    case 'DENSITY': if (!MAP.districts.length) computeDistricts(); for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) { const d = districtOf(x, y); g[idx(x, y)] = d && d.built ? (d.level + 1) / 4 : 0; } break;
  }
  HEAT6.grid = g; HEAT6.mode = mode; HEAT6.at = FX.time;
}
function rampColor(ramp, v, a) {
  v = clamp(v, 0, 1);
  let r, g, b;
  if (ramp === 'good') v = 1 - v;
  if (ramp === 'value') { r = Math.round(40 + 215 * Math.min(1, v * 1.6)); g = Math.round(120 + 100 * Math.sin(v * Math.PI)); b = Math.round(230 - 200 * v); }
  else { r = Math.round(v < 0.5 ? 40 + 400 * v : 240); g = Math.round(v < 0.5 ? 200 : 200 - 320 * (v - 0.5)); b = 60; }
  return 'rgba(' + r + ',' + clamp(g, 0, 255) + ',' + b + ',' + a + ')';
}
function heatDef(mode) { return HEATMAPS.find(function (h) { return h.id === mode; }); }
function drawHeat6(v, mode) {
  const H = heatDef(mode); if (!H) return;
  if (HEAT6.mode !== mode || FX.time - HEAT6.at > (mode === 'TRAFFIC' ? 0.5 : 1.5)) computeHeat6(mode);
  const g = HEAT6.grid;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const i = idx(x, y), val = g[i];
    if (val <= 0.01 && H.ramp !== 'good') continue;
    if (mode === 'TRAFFIC' && !MAP.roads[i] && val < 0.05) continue;
    ctx.fillStyle = rampColor(H.ramp, val, H.ramp === 'good' && val <= 0.01 ? (MAP.occ[i] ? 0.4 : 0.1) : 0.42);
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
}
function setHeatmap(id) {
  const i = OVERLAYS.indexOf(id);
  UI.overlay = i < 0 ? 0 : i; heat.mode = ''; HEAT6.mode = '';
  $('overlayLabel').textContent = OVERLAYS[UI.overlay];
  renderHeatLegend();
}
function renderHeatLegend() {
  const el = $('heatLegend'); if (!el) return;
  const H = heatDef(OVERLAYS[UI.overlay]);
  if (!H) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const stops = [0, 0.25, 0.5, 0.75, 1].map(function (v) { return rampColor(H.ramp, v, 0.95); }).join(',');
  el.innerHTML = '<b>' + H.icon + ' ' + H.name + '</b><div class="hlBar" style="background:linear-gradient(90deg,' + stops + ')"></div><div class="between"><span>' + H.low + '</span><span>' + H.high + '</span></div>';
}
function showHeatPicker() {
  const p = $('heatPop');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  p.innerHTML = '<div class="ph">HEATMAPS</div>' + ['NONE'].concat(HEATMAPS.map(function (h) { return h.id; })).map(function (id) { const H = heatDef(id); return '<button class="' + (OVERLAYS[UI.overlay] === id ? 'on' : '') + '" data-heat="' + id + '">' + (H ? H.icon + ' ' + H.name : '⬜ None') + '</button>'; }).join('');
  const r = $('overlayBtn').getBoundingClientRect();
  p.style.left = (r.right + 8) + 'px'; p.style.top = Math.max(60, Math.min(innerHeight - 480, r.top - 60)) + 'px';
  p.classList.remove('hidden');
  p.querySelectorAll('[data-heat]').forEach(function (b) { b.onclick = function () { setHeatmap(b.dataset.heat); p.classList.add('hidden'); sfx('click'); }; });
}

/* --- Minimap ---------------------------------------------------------------------------------------------- */
const MINI = { base: null, ver: -1, at: -9, size: 170 };
function drawMinimap(force) {
  const cv = $('minimap'); if (!cv || cv.classList.contains('hidden') || !STARTED) return;
  const sz = cv.clientWidth || MINI.size, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(sz * dpr)) { cv.width = cv.height = Math.round(sz * dpr); MINI.ver = -1; }
  const k = cv.width / MAP.W, c = cv.getContext('2d');
  if (force || MINI.ver !== MAP.version || FX.time - MINI.at > 3) {
    if (!MINI.base) MINI.base = document.createElement('canvas');
    const b = MINI.base; b.width = cv.width; b.height = cv.height; const g = b.getContext('2d');
    for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
      const i = idx(x, y);
      g.fillStyle = MAP.nature[i] === 2 ? '#2f7fbf' : MAP.roads[i] ? (MAP.roads[i] >= 3 ? '#e9ecef' : '#adb5bd') : MAP.terrain[i] === TERRAIN.ROCK ? '#8b8680' : MAP.zone[i] ? ZONES[MAP.zone[i]].color : (MAP.nature[i] === 1 ? '#2d6a4f' : '#5fae4e');
      if (MAP.zone[i] && !MAP.roads[i] && MAP.nature[i] !== 2) g.globalAlpha = 0.55;
      g.fillRect(x * k, y * k, Math.ceil(k), Math.ceil(k)); g.globalAlpha = 1;
      if (!inUnlocked(x, y)) { g.fillStyle = 'rgba(8,10,25,.55)'; g.fillRect(x * k, y * k, Math.ceil(k), Math.ceil(k)); }
    }
    S.buildings.list.forEach(function (bb) { const d = bdef(bb); g.fillStyle = BUILDINGS[bb.type].landmark || bb.type === 'townhall' || bb.type === 'airport' || bb.type === 'port' ? '#ffd166' : bb.owner === 'player' ? '#f4a261' : bb.owner === 'city' ? '#4cc9f0' : '#e5e5e5'; g.fillRect(bb.x * k + 0.5, bb.y * k + 0.5, d.w * k - 1, d.h * k - 1); });
    MINI.ver = MAP.version; MINI.at = FX.time;
  }
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(MINI.base, 0, 0);
  const hm = heatDef(OVERLAYS[UI.overlay]);
  if (hm && HEAT6.grid && HEAT6.mode === hm.id) for (let i = 0; i < HEAT6.grid.length; i += 1) { const val = HEAT6.grid[i]; if (val > 0.05) { c.fillStyle = rampColor(hm.ramp, val, 0.5); c.fillRect((i % MAP.W) * k, ((i / MAP.W) | 0) * k, Math.ceil(k), Math.ceil(k)); } }
  c.fillStyle = '#ffdd00'; AG.vehicles.forEach(function (v) { c.fillRect(v.x / TILE * k - 1, v.y / TILE * k - 1, 2, 2); });
  c.fillStyle = '#ff4d6d'; AG.accidents.forEach(function (a) { c.beginPath(); c.arc(a.x / TILE * k, a.y / TILE * k, 3 * dpr, 0, 6.283); c.fill(); });
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
  c.strokeStyle = '#fff'; c.lineWidth = 1.5 * dpr; c.strokeRect(tl.x / TILE * k, tl.y / TILE * k, (br.x - tl.x) / TILE * k, (br.y - tl.y) / TILE * k);
  if (cv.width > 200 && MAP.dnames) { c.font = 'bold ' + Math.round(8 * dpr) + 'px sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.85)'; districtCenters().forEach(function (d) { if (d.name.indexOf('Outskirts') < 0) c.fillText(d.name.split(' ')[0], d.x * k, d.y * k); }); }
}
function bindMinimap() {
  const cv = $('minimap');
  const go = function (e) { const r = cv.getBoundingClientRect(); CAM.x = (e.clientX - r.left) / r.width * MAP.W * TILE; CAM.y = (e.clientY - r.top) / r.height * MAP.H * TILE; clampCamera(); };
  cv.addEventListener('pointerdown', function (e) { e.stopPropagation(); go(e); cv._drag = true; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', function (e) { if (cv._drag) go(e); });
  cv.addEventListener('pointerup', function () { cv._drag = false; });
  $('miniBtn').onclick = function () { S.settings.minimap = !S.settings.minimap; cv.classList.toggle('hidden', !S.settings.minimap); sfx('click'); drawMinimap(true); };
}

/* --- District labels on the map (zoomed out) --------------------------------------------------------------- */
function drawDistrictLabels() {
  if (CAM.zoom > 0.75 || !MAP.dnames || PHOTO.on) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.round(13 / CAM.zoom) + 'px sans-serif';
  districtCenters().forEach(function (d) {
    if (d.name.indexOf('Outskirts') >= 0) return;
    const x = d.x * TILE, y = d.y * TILE;
    ctx.fillStyle = 'rgba(8,10,25,.55)'; const w = ctx.measureText(d.name).width + 14 / CAM.zoom; ctx.fillRect(x - w / 2, y - 10 / CAM.zoom, w, 20 / CAM.zoom);
    ctx.fillStyle = '#ffd166'; ctx.fillText(d.name, x, y);
  });
}

/* --- F3 debug panel ------------------------------------------------------------------------------------------- */
const DBG = { on: false, econMs: 0 };
function toggleDebug6() { DBG.on = !DBG.on; $('debug6').classList.toggle('hidden', !DBG.on); sfx('click'); }
function renderDebug6() {
  if (!DBG.on) return;
  const mem = (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB (heap)' : '~' + ((AG.citizens.length * 0.6 + AG.vehicles.length * 0.9 + FX.particles.length * 0.15 + S.buildings.list.length * 0.4 + (S._saveBytes || 0) / 1024) / 1024).toFixed(2) + ' MB (est.)');
  let lod = [0, 0, 0]; AG.citizens.forEach(function (c) { if (!c.inside) lod[lodOf(c.x, c.y)]++; });
  const ev = S.events.active.map(function (a) { return a.id; }).concat(S.p5.world.active ? ['world:' + S.p5.world.active] : [], activeEffects().map(function (x) { return x.id; }));
  $('debug6').textContent = 'DEBUG (F3)\n' +
    'FPS ' + Math.round(PERF.fps) + '  Frame time ' + (PERF.fps ? (1000 / PERF.fps).toFixed(1) : '0') + ' ms (work ' + (PERF.frameMs || 0).toFixed(2) + ' ms)\n' +
    'Simulation tick #' + Game.ticks + '  TPS ' + Game.tpsMeasured.toFixed(1) + '  speed ' + S.settings.speed + '×  errors ' + Game.errors + '\n' +
    'Entities ' + (AG.citizens.length + AG.vehicles.length + FX.particles.length + S.buildings.list.length) + '\n' +
    'Citizens ' + AG.citizens.length + ' (LOD near/med/far ' + lod.join('/') + ')\n' +
    'Vehicles ' + AG.vehicles.length + '  Accidents ' + AG.accidents.length + '\n' +
    'Buildings ' + S.buildings.list.length + '  Particles ' + FX.particles.length + ' (pool ' + FX.pool.length + ')\n' +
    'Sim time: Day ' + gameDay() + ' ' + pad2(Math.floor(gameHour())) + ':' + pad2(Math.floor((S.clock.gameSec / 60) % 60)) + '  run ' + Math.floor(S.clock.runSec) + 's\n' +
    'Economy tick ' + DBG.econMs.toFixed(2) + ' ms  CPI ' + S.p6.econ.cpi.toFixed(1) + '  infl ' + (S.p6.econ.infl * 100).toFixed(1) + '%\n' +
    'Memory ' + mem + '\n' +
    'Active events: ' + (ev.join(', ') || 'none') + '\n' +
    'Pathfinding ' + pathReqRate.toFixed(1) + ' req/s  cache ' + MAP.pathCache.size + '  reroutes ' + S.p6.stats.reroutes + '\n' +
    'RNG state ' + RNG.gen.s + p9DebugLines();
}

/* --- Daily city report --------------------------------------------------------------------------------------- */
function reportLines(r) {
  const sg = function (v, f, inv) { const good = inv ? v <= 0 : v >= 0; return '<b class="' + (Math.abs(v) < 0.05 ? '' : good ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + f(v) + '</b>'; };
  return '<div class="rep"><span>Population</span>' + sg(r.pop, function (v) { return fmt(Math.round(v)); }) + '</div>' +
    '<div class="rep"><span>Income</span><b class="pos">+' + money(r.inc) + '</b></div><div class="rep"><span>Expenses</span><b class="neg">-' + money(r.exp) + '</b></div>' +
    '<div class="rep"><span>Happiness</span>' + sg(r.hap, function (v) { return v.toFixed(1) + '%'; }) + '</div><div class="rep"><span>Traffic</span>' + sg(r.traffic, function (v) { return v.toFixed(1) + '%'; }, true) + '</div>' +
    '<div class="rep"><span>Pollution</span>' + sg(r.pol, function (v) { return v.toFixed(1) + '%'; }, true) + '</div><div class="rep"><span>New buildings</span><b>' + r.built + '</b></div><div class="rep"><span>Businesses opened</span>' + sg(r.biz, function (v) { return String(v); }) + '</div>';
}
function showDailyCard(r) {
  const el = $('dailyCard');
  el.innerHTML = '<div class="between"><b>📰 DAILY CITY REPORT — Day ' + r.day + '</b><button class="closeX" id="dcClose" style="width:24px;height:24px;font-size:12px">✕</button></div>' + reportLines(r) + '<button class="btn small blue" id="dcMore" style="margin-top:6px">📈 Statistics Center</button>';
  el.classList.remove('hidden');
  $('dcClose').onclick = function () { el.classList.add('hidden'); };
  $('dcMore').onclick = function () { el.classList.add('hidden'); openStatsCenter('reports'); };
  clearTimeout(el._t); el._t = setTimeout(function () { el.classList.add('hidden'); }, 14000);
}

/* --- Statistics center ------------------------------------------------------------------------------------------- */
const STAT_SERIES = [['pop', 'Population', '#4cc9f0'], ['money', 'Money', '#ffd166'], ['inc', 'Income /s', '#06d6a0'], ['exp', 'Expenses /s', '#ef476f'], ['emp', 'Employment %', '#90be6d'], ['traffic', 'Traffic %', '#f8961e'],
  ['pol', 'Pollution', '#bc6c25'], ['hap', 'Happiness %', '#f15bb5'], ['prod', 'Production /s', '#9b5de5'], ['cons', 'Consumption /s', '#00bbf9'], ['tour', 'Tourists', '#fee440'], ['crime', 'Crime', '#e63946'], ['edu', 'Education', '#43aa8b'], ['health', 'Healthcare %', '#ff99c8'], ['cpi', 'Price level (CPI)', '#adb5bd']];
function openStatsCenter(tab) {
  UI.statsTab = tab || UI.statsTab || 'charts';
  const t = UI.statsTab;
  let h = '<div class="tabs" style="padding:0 0 8px">' + [['charts', '📈 Charts'], ['jobs', '💼 Jobs'], ['reports', '📰 Daily reports'], ['disasters', '🧾 Disasters']].map(function (x) { return '<button class="tab ' + (t === x[0] ? 'on' : '') + '" data-sctab="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (t === 'charts') {
    h += '<p class="small">Recorded every 5 simulated seconds (last ~12 minutes).</p><div class="statGrid">' + STAT_SERIES.map(function (s) { const d = S.statistics.history[s[0]] || []; const last = d.length ? d[d.length - 1] : 0; return '<div class="card"><div class="between small"><b>' + s[1] + '</b><span>' + (s[0] === 'money' ? money(last) : fmt(last, last < 10 ? 1 : undefined)) + '</span></div><canvas class="chart" data-schart="' + s[0] + '" data-color="' + s[2] + '" style="height:70px"></canvas></div>'; }).join('') + '</div>';
  } else if (t === 'jobs') {
    const j = jobStats();
    h += '<div class="grid3">' + kpi('EMPLOYMENT', pct(j.employment * 100), 'pos') + kpi('UNEMPLOYMENT', pct(j.unemployment * 100), j.unemployment < 0.08 ? 'pos' : 'neg') + kpi('AVG SALARY', money(j.avgSalary) + '/mo') +
      kpi('LABOR FORCE', fmt(Math.round(j.labor))) + kpi('JOBS', fmt(Math.round(j.jobs))) + kpi('OPEN POSITIONS', fmt(j.open), j.open ? 'neg' : 'pos') + '</div>' +
      '<div class="card"><h3>🧑‍🏭 Worker shortage: ' + pct(j.shortage * 100) + '</h3><p>' + (j.shortage > 0.05 ? j.under + ' businesses are understaffed and produce less. More housing brings more workers.' : 'Businesses find enough workers.') + ' Wages follow the price level (×' + wageLevel().toFixed(2) + ').</p></div>' +
      '<div class="card"><h3>🎓 Workforce education</h3>' + EDU_LEVELS.map(function (n, k) { const c = AG.citizens.filter(function (x) { return !x.tourist && x.edu === k; }).length; return barRow(n, c, Math.max(1, AG.citizens.length), '#4cc9f0', String(c)); }).join('') + '</div>';
  } else if (t === 'reports') {
    const R = S.p6.reports;
    h += R.length ? R.slice().reverse().map(function (r) { return '<div class="card"><h3>📰 Day ' + r.day + ' · Pop ' + fmt(Math.round(r.popNow)) + '</h3>' + reportLines(r) + '</div>'; }).join('') : '<p class="small">The first report arrives at the end of the current game day.</p>';
  } else {
    const D = S.p6.disasterLog;
    h += D.length ? D.slice().reverse().map(function (d) { return '<div class="card"><h3>' + d.icon + ' ' + esc(d.name) + ' · Day ' + d.day + '</h3><div class="rep"><span>Affected buildings</span><b>' + d.hit + '</b></div><div class="rep"><span>Repair cost</span><b>' + money(d.cost) + '</b></div><div class="rep"><span>Recovery time</span><b>~' + Math.ceil(d.rec / 60) + ' min</b></div></div>'; }).join('') : '<p class="small">No disasters yet. Fire stations, a maintenance depot and early-warning tech reduce damage.</p>';
  }
  showModal('📈 Statistics Center', h);
  document.querySelectorAll('[data-sctab]').forEach(function (b) { b.onclick = function () { openStatsCenter(b.dataset.sctab); }; });
  document.querySelectorAll('canvas[data-schart]').forEach(function (cv) { drawChart(cv, S.statistics.history[cv.dataset.schart] || [], cv.dataset.color); });
}

/* --- City panel tabs: jobs, transit, megacity, area ranks ---------------------------------------------------------- */
function renderJobsTab() {
  const j = jobStats();
  let h = '<div class="grid3">' + kpi('EMPLOYMENT', pct(j.employment * 100), 'pos') + kpi('UNEMPLOYMENT', pct(j.unemployment * 100), j.unemployment < 0.08 ? 'pos' : 'neg') + kpi('AVG SALARY', money(j.avgSalary) + '/mo') + kpi('JOB DEMAND', fmt(j.open) + ' open') + kpi('WORKER SHORTAGE', pct(j.shortage * 100), j.shortage > 0.05 ? 'neg' : 'pos') + kpi('UNDERSTAFFED', j.under) + '</div>';
  const emp = S.buildings.list.filter(function (b) { return b._op && BUILDINGS[b.type].workers; }).sort(function (a, b) { return (b._actW || 0) - (a._actW || 0); }).slice(0, 8);
  h += '<div class="secTitle">Top employers</div>' + emp.map(function (b) { const d = BUILDINGS[b.type]; return '<div class="between small" style="padding:3px 0"><span>' + d.icon + ' ' + d.name + ' · ' + esc(districtName(b.x, b.y)) + '</span><b>' + Math.round(b._actW) + '/' + b.workers + ' · ' + money(d.sal * wageLevel() * SECONDS_PER_MONTH / 30, 0) + '/mo</b></div>'; }).join('');
  h += '<p class="small" style="margin-top:6px">Citizens without a job look for work every weekday morning. Businesses without workers produce less.</p>';
  return h;
}
function renderTransitTab() {
  const L = transitLineStats();
  let h = '<div class="grid3">' + kpi('PASSENGERS', fmt(Math.round(SIM.riders || 0))) + kpi('CAPACITY', fmt(Math.round(SIM.transitCap || 0))) + kpi('CAR TRIPS', fmt(Math.round(SIM.carTrips || 0))) + '</div>';
  if (!L.length) h += '<p class="small" style="margin-top:8px">No public transport yet. Build bus stops (60 pop), then metro, rail, a port and an airport later.</p>';
  L.forEach(function (l) {
    h += '<div class="card"><div class="between"><h3>' + l.icon + ' ' + l.name + '</h3><span class="tag">' + l.stations + ' ' + l.stationsLabel + '</span></div><p>' + l.route + '</p>' +
      '<div class="grid3" style="margin-top:6px">' + kpi('VEHICLES', l.vehicles) + kpi('PASSENGERS', fmt(Math.round(l.passengers))) + kpi('CAPACITY', fmt(Math.round(l.capacity))) + kpi('INCOME', money(l.income, 1) + '/s', 'pos') + kpi('MAINTENANCE', money(l.maint, 1) + '/s', 'neg') + kpi('LOAD', pct(l.capacity ? l.passengers / l.capacity * 100 : 0)) + '</div></div>';
  });
  return h;
}
function renderAreaRanks() {
  const A = areaStats();
  return '<div class="secTitle">📊 City rank by area (world rank among ' + (WORLD_CITIES.length + 1) + ' cities)</div><div class="areaGrid">' + Object.keys(A).map(function (k) {
    const v = A[k], g = gradeOf(v);
    return '<div class="area g' + g + '"><div class="small">' + k + '</div><div class="ag">' + g + '</div><div class="small">' + Math.round(v) + '/100 · #' + areaWorldRank(k, v) + '</div></div>';
  }).join('') + '</div>';
}
function renderMegaTab() {
  const m = S.p6.mega;
  let h = '<div class="card" style="border-left:4px solid var(--gold)"><h3>🌆 MEGACITY ERA ' + (m.era ? '<span class="tag g">ACTIVE</span>' : '<span class="tag">🔒</span>') + '</h3><p>' + (m.era ? 'Your city has become a megacity. Build mega projects, take companies global and research future technologies — the city can grow forever.' : 'Unlocks at 20,000 population, City Level 18 or after the story campaign. Current: ' + fmt(Math.floor(S.city.population)) + ' pop · Lv ' + cityLevel() + '.') + '</p></div>';
  h += '<div class="secTitle">🏗️ Mega projects (paid from the city budget)</div>';
  MEGA_PROJECTS.forEach(function (mp) {
    const x = m.projects[mp.id] || { stage: 0, building: false }, c = megaStageCost(mp), doneAll = x.stage >= mp.stages;
    const f = x.building ? clamp(1 - (x.ends - S.clock.runSec) / mp.dur, 0, 1) : 0;
    h += '<div class="card"><div class="between"><h3>' + mp.icon + ' ' + mp.name + '</h3><span class="tag ' + (doneAll ? 'g' : '') + '">' + x.stage + '/' + mp.stages + '</span></div><p>' + mp.desc + '</p>' + barRow('Progress', x.stage + f, mp.stages, '#ffd166', doneAll ? 'COMPLETE' : x.building ? 'Stage ' + (x.stage + 1) + ' ' + pct(f * 100) : '') +
      (doneAll || x.building ? '' : '<button class="btn small gold ' + (!m.era && !S.city.sandbox || S.budget < c ? 'dis' : '') + '" data-act="mega" data-id="' + mp.id + '">Build stage ' + (x.stage + 1) + ' — ' + money(c) + ' 🏛️</button>') + '</div>';
  });
  h += '<div class="secTitle">🌐 Global companies</div>';
  COMPANY_DEFS.forEach(function (cd) { const c = S.companies.list[cd.id]; if (!c) return; h += '<div class="between small card"><span>' + cd.icon + ' ' + cd.name + ' Lv ' + c.level + '</span>' + (m.global[cd.id] ? '<span class="tag g">GLOBAL +20%</span>' : '<button class="btn small ' + (!m.era || c.level < 7 ? 'dis' : 'gold') + '" data-act="global" data-id="' + cd.id + '">Go global ' + money(5e6 * costMult()) + '</button>') + '</div>'; });
  if (!Object.keys(S.companies.list).length) h += '<p class="small">Found companies first (COMPANY panel).</p>';
  return h;
}

/* --- Companies: directory, stock market for AI companies, product markets --------------------------------------------- */
function renderDirectoryTab() {
  const rows = companyRows().sort(function (a, b) { return b.rev - a.rev; });
  let h = '<p class="small">Every company in ' + esc(S.city.name) + '. AI companies grow, open and close stores, advertise, launch products and can go bankrupt. Buy shares to earn dividends (25% of profit).</p>';
  h += '<div class="dirTable"><div class="dt head"><span>Company</span><span>Emp.</span><span>Revenue</span><span>Profit</span><span>Share</span><span>Rep.</span><span>Stock</span></div>';
  rows.forEach(function (r) {
    const s = r.mine ? null : S.p6.stocks[r.id];
    h += '<div class="dt"><span style="color:' + r.color + '">' + r.icon + ' ' + esc(r.name) + (r.mine ? ' <span class="tag y">YOU</span>' : '') + '<br><span class="small">' + r.sector + '</span></span><span>' + fmt(Math.round(r.emp)) + '</span><span>' + money(r.rev, 1) + '/s</span><span class="' + (r.profit >= 0 ? 'pos' : 'neg') + '">' + signMoney(r.profit) + '</span><span>' + pct(r.share * 100) + '</span><span>' + Math.round(r.rep) + '</span><span>$' + r.price.toFixed(2) +
      (r.mine ? '' : '<br><button class="btn small green" data-act="aibuy" data-id="' + r.id + '" data-v="1000">+1K</button><button class="btn small red ' + (s && s.qty ? '' : 'dis') + '" data-act="aibuy" data-id="' + r.id + '" data-v="-1000">−1K</button>') + '</span></div>';
  });
  h += '</div>';
  const held = AI_DEFS.filter(function (a) { const s = S.p6.stocks[a.id]; return s && s.qty > 0; });
  h += '<div class="secTitle">💼 Your AI shareholdings — ' + money(aiPortfolioValue()) + '</div>' + (held.length ? held.map(function (a) { const s = S.p6.stocks[a.id]; return '<div class="between small card"><span>' + a.icon + ' ' + a.name + ' · ' + fmt(s.qty) + ' shares (' + (s.qty / SHARES_TOTAL * 100).toFixed(2) + '%)</span><b>' + money(s.qty * s.price) + ' <span class="' + (s.qty * s.price >= s.cost ? 'pos' : 'neg') + '">' + signMoney(s.qty * s.price - s.cost) + '</span></b></div>'; }).join('') : '<p class="small">No shares yet.</p>');
  h += '<canvas class="chart" data-chart="aistock" data-color="#ffd166" style="height:110px"></canvas><p class="small">Chart: ' + esc((aiDef(UI.aiStockSel) || AI_DEFS[0]).name) + ' — <span class="small">tap a company row button to trade</span></p>';
  return h;
}
function renderProductsTable() {
  const R = SIM.sc || { prod: {}, dem: {}, fr: {} }, pl = priceLevel();
  let h = '<div class="secTitle">🛒 Product markets</div><div class="dirTable"><div class="dt prod head"><span>Product</span><span>Base</span><span>Demand</span><span>Supply</span><span>Quality</span><span>Popularity</span><span>Cost</span><span>Retail</span></div>';
  PRODUCT_IDS.forEach(function (p) {
    const P = PRODUCTS[p], price = S.economy.prices[p] || P.base;
    let cost = 0; for (const k in (P.inputs || {})) cost += P.inputs[k] * (S.economy.prices[k] || PRODUCTS[k].base);
    const dem = R.dem[p] || 0, sup = (R.prod[p] || 0) + (R.imp ? R.imp[p] || 0 : 0);
    const q = clamp(0.8 + S.city.skill / 250 + (hasTech('i_robotics') ? 0.1 : 0), 0.5, 1.5), pop = clamp(dem / Math.max(0.1, sup) * 50, 0, 100);
    h += '<div class="dt prod"><span>' + P.icon + ' ' + P.name + '</span><span>$' + (P.base * pl).toFixed(2) + '</span><span>' + dem.toFixed(1) + '</span><span>' + sup.toFixed(1) + '</span><span>' + q.toFixed(2) + '</span><span>' + Math.round(pop) + '</span><span>$' + (cost || P.base * 0.4).toFixed(2) + '</span><span class="' + (price > P.base * pl ? 'neg' : 'pos') + '">$' + (price * 1.35).toFixed(2) + '</span></div>';
  });
  return h + '</div><p class="small">Prices rise when demand exceeds supply and fall when supply is plentiful; inflation raises every base price (price level ×' + pl.toFixed(3) + ').</p>';
}
function renderInflationCard() {
  const e = S.p6.econ;
  return '<div class="card"><div class="between"><h3>📈 Inflation & prices</h3><b class="' + (e.infl > 0.05 ? 'neg' : 'pos') + '">' + (e.infl * 100).toFixed(1) + '%/yr</b></div><p>Price level (CPI) <b>' + e.cpi.toFixed(1) + '</b> · Wage index <b>' + e.wage.toFixed(1) + '</b> · Real income ×' + realIncomeFactor().toFixed(2) + '. Inflation rises with strong demand, low unemployment and cheap money; the central bank raises rates to fight it.</p><canvas class="chart" data-chart="infl" data-color="#ef476f" style="height:80px"></canvas></div>';
}
function renderSupplyCard() {
  const whs = S.buildings.list.filter(function (b) { return b.type === 'warehouse' && b._op; });
  const cap = SIM.storageCap || 0, used = SIM.storageUsed || 0;
  return '<div class="card"><h3>📦 Storage & logistics</h3><div class="grid2">' + kpi('CAPACITY', fmt(Math.round(cap))) + kpi('CURRENT STOCK', fmt(Math.round(used)) + ' (' + pct(cap ? used / cap * 100 : 0) + ')', used / Math.max(1, cap) > 0.9 ? 'neg' : '') + kpi('INCOMING', fmt(SIM.whIn || 0, 1) + '/s') + kpi('OUTGOING', fmt(SIM.whOut || 0, 1) + '/s') + '</div>' +
    '<p class="small">' + whs.length + ' warehouse(s) · ' + Math.round(SIM.trucks || 0) + ' trucks · logistics ' + pct((SIM.logisticsRatio === undefined ? 1 : SIM.logisticsRatio) * 100) + ' · transport cost ' + money(SIM.logiCost || 0, 2) + '/s (traffic ' + Math.round(SIM.traffic) + '%). Full storage slows production; empty stock stops shops.</p>' +
    '<p class="small">Chains: 🌾 Farm → Wheat → 🥣 Flour Mill → 🍞 Bakery → Restaurants/Markets · ⛏️ Mine → 🔩 Smelter → Metal → 📱 Electronics → Shops.</p></div>';
}

/* --- Right panel: dynamic quests & generated challenge ------------------------------------------------------------------ */
function renderDQHtml() {
  const q = S.p6.dq, t = S.clock.runSec;
  let h = '<div class="secTitle">📋 City Quests · 🎖️ Mayor Lv ' + S.p6.mayorLv + '</div>' + barRow('XP', S.p6.xp, xpForLevel(S.p6.mayorLv), '#ffd166', fmt(Math.round(S.p6.xp)) + '/' + fmt(xpForLevel(S.p6.mayorLv)));
  if (!q.active.length) h += '<p class="small">New quests appear based on your city\'s situation.</p>';
  q.active.forEach(function (a) {
    const T = DQ_TEMPLATES.find(function (x) { return x.id === a.tpl; }); if (!T) return;
    let p = 0; try { p = clamp(T.prog(a), 0, 1); } catch (e) { p = 0; }
    h += '<div class="qitem"><div class="between"><div class="qt">' + T.icon + ' ' + T.title + '</div><span class="tag">⏱ ' + Math.max(0, Math.ceil((a.deadline - t) / 60)) + 'm</span></div><div class="qd">' + esc(T.goal(a)) + '</div>' + barRow('', p * 100, 100, '#06d6a0', pct(p * 100)) + '</div>';
  });
  const g = S.p6.gen;
  if (g && !g.done && !g.failed) h += '<div class="qitem story"><div class="qt">🎲 ' + esc(g.text) + '</div>' + barRow('', genProgress() * 100, 100, '#ffd166', pct(genProgress() * 100)) + '<div class="qd">⏱ ' + Math.max(0, Math.ceil((g.limit - (t - g.start)) / 60)) + ' min left</div></div>';
  const sc = S.p6.scenario;
  if (sc) { const W = SCENARIO_WIN[sc.win]; h += '<div class="qitem story"><div class="qt">🗺️ SCENARIO — ' + esc(sc.name) + (sc.done ? ' ✅' : sc.failed ? ' ❌' : '') + '</div><div class="qd">Goal: ' + W.fmt(sc.v) + (sc.limit ? ' · ' + Math.max(0, Math.ceil(sc.limit - (t - sc.start) / 60)) + ' min left' : '') + ' · Tax ≤ ' + sc.taxLimit + '%</div>' + barRow('', clamp(W.prog(sc.v), 0, 1) * 100, 100, '#4cc9f0', pct(clamp(W.prog(sc.v), 0, 1) * 100)) + '</div>'; }
  return h;
}

/* --- Road type picker ---------------------------------------------------------------------------------------------------- */
function showRoadPicker() {
  const p = $('roadPop');
  p.innerHTML = '<div class="ph">ROAD TYPE</div>' + ROAD_TYPES.slice(1).map(function (r) { const lock = r.unlock && S.city.peakPop < r.unlock.pop && !S.city.sandbox; return '<button class="' + ((UI.roadType || 1) === r.id ? 'on' : '') + (lock ? ' dis' : '') + '" data-rtype="' + r.id + '">' + r.icon + ' ' + r.name + ' · ' + money(roadTypeCost(r.id)) + (lock ? ' 🔒' + fmt(r.unlock.pop) + ' pop' : '') + '<br><span class="small">Capacity ' + r.cap + ' · speed ×' + r.speed + '</span></button>'; }).join('') +
    '<div class="ph" style="margin-top:4px">Drag over existing roads to upgrade them. Water → bridge (×4), rock → tunnel (×6).</div>';
  const r = $('roadToolBtn').getBoundingClientRect();
  p.style.left = (r.right + 8) + 'px'; p.style.top = Math.max(60, r.top - 20) + 'px';
  p.classList.remove('hidden');
  p.querySelectorAll('[data-rtype]').forEach(function (b) { b.onclick = function () { if (b.classList.contains('dis')) return; UI.roadType = +b.dataset.rtype; showRoadPicker(); sfx('click'); }; });
}
function roadTypeCost(t) { return Math.round(ROAD_TYPES[t].cost * costMult()); }

/* --- Scenario & sandbox screens (main menu) --------------------------------------------------------------------------------- */
const SCN = { money: 1, pop: 0, mapType: 'standard', diff: 'NORMAL', disasters: 1, tax: 30, tech: 'none', win: 'pop', winIdx: 0, limit: 0, name: 'My Scenario' };
function renderScenarioScreen() {
  const seg = function (id, items, cur, cb) { segButtons(id, items, String(cur), function (v) { cb(v); renderScenarioScreen(); }); };
  seg('scMoney', [['0.3', 'Poor'], ['1', 'Normal'], ['3', 'Rich'], ['10', 'Tycoon']], SCN.money, function (v) { SCN.money = +v; });
  seg('scPop', [['0', '5'], ['1', '100'], ['2', '500']], SCN.pop, function (v) { SCN.pop = +v; });
  seg('scMap', Object.keys(MAP_TYPES).map(function (k) { return [k, MAP_TYPES[k].icon + ' ' + MAP_TYPES[k].name]; }), SCN.mapType, function (v) { SCN.mapType = v; });
  $('scMapDesc').textContent = MAP_TYPES[SCN.mapType].desc;
  seg('scDiff', Object.keys(DIFFICULTIES).map(function (k) { return [k, DIFFICULTIES[k].name]; }), SCN.diff, function (v) { SCN.diff = v; });
  seg('scDis', [['0', 'None'], ['0.5', 'Low'], ['1', 'Normal'], ['2', 'High']], SCN.disasters, function (v) { SCN.disasters = +v; });
  seg('scTax', [['5', '5%'], ['10', '10%'], ['15', '15%'], ['30', 'No limit']], SCN.tax, function (v) { SCN.tax = +v; });
  seg('scTech', [['none', 'None'], ['basic', 'Basic'], ['advanced', 'Advanced']], SCN.tech, function (v) { SCN.tech = v; });
  seg('scWin', Object.keys(SCENARIO_WIN).map(function (k) { return [k, SCENARIO_WIN[k].name]; }), SCN.win, function (v) { SCN.win = v; });
  seg('scWinV', SCENARIO_WIN[SCN.win].vals.map(function (v, i) { return [String(i), SCENARIO_WIN[SCN.win].fmt(v)]; }), SCN.winIdx, function (v) { SCN.winIdx = +v; });
  seg('scLimit', [['0', 'None'], ['30', '30 min'], ['60', '60 min'], ['120', '2 h']], SCN.limit, function (v) { SCN.limit = +v; });
}
function createScenario() {
  const W = SCENARIO_WIN[SCN.win], v = W.vals[SCN.winIdx];
  const name = ($('scName').value || 'My Scenario').replace(/[<>]/g, '').trim().slice(0, 32) || 'My Scenario';
  const slot = MENU.opts.slot || 1;
  const go = function () {
    clearDialogues();
    const settings = S ? S.settings : defaultSettings();
    S = defaultState(newMeta(), settings, null, null, { name: name, seed: Math.floor(Math.random() * 1000000), difficulty: SCN.diff, size: 52, mapType: SCN.mapType });
    S.slot = slot; setActiveSlot(slot);
    S.money = Math.round(S.money * SCN.money); S.budget = Math.round(S.budget * Math.max(0.3, Math.sqrt(SCN.money)));
    S.p6.scenario = { name: name, win: SCN.win, v: v, limit: SCN.limit, start: 0, taxLimit: SCN.tax, disasters: SCN.disasters, done: false, failed: false };
    S.tutorial.done = true; S.p5.tut.done = true;
    STORY.forEach(function (c) { S.p5.story.unlocked[c.unlock] = 1; }); S.p5.story.ch = STORY.length;
    const techN = SCN.tech === 'basic' ? 6 : SCN.tech === 'advanced' ? 16 : 0;
    TECH_LIST.filter(function (t) { return !t.ng; }).sort(function (a, b) { return a.cost - b.cost; }).forEach(function (t) { if (S.technology.unlocked.length < techN && t.req.every(hasTech)) S.technology.unlocked.push(t.id); });
    resetSim(); initMap(true); generateCity(); onMapChanged(); resetAgents(); econTick(1); computeDistricts();
    if (SCN.pop) spawnStarterHousing(SCN.pop === 1 ? 100 : 500);
    CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20; CAM.zoom = window.innerWidth < 820 ? 1.1 : 1.3;
    PROFILE.citiesCreated++; saveProfile(); saveGame(true);
    startGame({ isNew: true, notes: ['🗺️ Scenario "' + name + '": reach ' + W.fmt(v) + (SCN.limit ? ' within ' + SCN.limit + ' min' : '') + '. Map: ' + MAP_TYPES[SCN.mapType].name + '.'] });
  };
  if (slotInfo(slot).exists) confirmDialog('Overwrite slot ' + slot + '?', 'The city "' + esc(slotInfo(slot).name) + '" will be replaced by the scenario.', 'Create scenario', go); else go();
}
/* Starter population for scenarios: homes are built around the center */
function spawnStarterHousing(pop) {
  const c = Math.floor(MAP.W / 2), want = pop, types = pop >= 500 ? ['apartment', 'house'] : ['house'];
  let cap = SIM.housingCap || 0, guard = 0;
  for (let r = 3; r < MAP.W / 2 && cap < want * 1.1 && guard < 4000; r++) for (let y = c - r; y <= c + r && cap < want * 1.1; y++) for (let x = c - r; x <= c + r && cap < want * 1.1; x++) {
    guard++;
    const d = BUILDINGS[types[0]];
    if (!canPlace(d, x, y, true).ok) continue;
    const b = makeBuilding(d.id, x, y); addBuildingToMap(b); cap += d.housing;
  }
  S.city.emergencyPower += Math.ceil(pop / 10) * 3;
  onMapChanged(); econTick(1);
  S.city.population = Math.min(pop, SIM.housingCap); S.city.peakPop = S.city.population;
}
const SBX = { money: true, land: true, disasters: false, economy: 'normal', creative: true };
function renderSandboxScreen() {
  const tg = function (k, label) { return '<div class="between" style="padding:6px 0"><span>' + label + '</span><button type="button" class="btn small ' + (SBX[k] ? 'green' : '') + '" data-sbx="' + k + '">' + (SBX[k] ? 'ON' : 'OFF') + '</button></div>'; };
  $('sbxOpts').innerHTML = tg('money', '💰 Unlimited money') + tg('land', '🗺️ Unlimited land (whole map)') + tg('disasters', '🌪️ Disasters') + tg('creative', '🎨 Creative mode (everything unlocked, instant build)') +
    '<div class="between" style="padding:6px 0"><span>📈 Economy</span><div class="seg"><button type="button" class="' + (SBX.economy === 'normal' ? 'on' : '') + '" data-sbxe="normal">Normal</button><button type="button" class="' + (SBX.economy === 'hard' ? 'on' : '') + '" data-sbxe="hard">Hard</button></div></div>';
  $('sbxOpts').querySelectorAll('[data-sbx]').forEach(function (b) { b.onclick = function () { SBX[b.dataset.sbx] = !SBX[b.dataset.sbx]; renderSandboxScreen(); sfx('click'); }; });
  $('sbxOpts').querySelectorAll('[data-sbxe]').forEach(function (b) { b.onclick = function () { SBX.economy = b.dataset.sbxe; renderSandboxScreen(); sfx('click'); }; });
}
function createSandbox() {
  const slot = MENU.opts.slot || 1;
  const go = function () {
    clearDialogues();
    const settings = S ? S.settings : defaultSettings();
    S = defaultState(newMeta(), settings, null, null, { name: ($('sbxName').value || 'Sandbox City').replace(/[<>]/g, '').trim().slice(0, 32) || 'Sandbox City', seed: Math.floor(Math.random() * 1000000), difficulty: SBX.economy === 'hard' ? 'HARD' : 'NORMAL', size: 64, sandbox: true, mapType: SCN.mapType });
    S.slot = slot; setActiveSlot(slot);
    S.p6.sandbox = Object.assign({}, SBX);
    if (!SBX.money) { S.money = 50000; S.budget = 50000; }
    S.tutorial.done = true; S.p5.tut.done = true;
    resetSim(); initMap(true);
    if (SBX.land) S.city.expansion = maxExpansionFor(S.city.size);
    generateCity(); onMapChanged(); resetAgents(); econTick(1); computeDistricts();
    CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20; CAM.zoom = 1;
    saveGame(true);
    startGame({ isNew: true, notes: ['🧱 Sandbox: ' + Object.keys(SBX).filter(function (k) { return SBX[k] === true; }).join(', ') + ' · economy ' + SBX.economy + '.'] });
  };
  if (slotInfo(slot).exists) confirmDialog('Overwrite slot ' + slot + '?', 'The city "' + esc(slotInfo(slot).name) + '" will be replaced.', 'Create sandbox', go); else go();
}

/* --- Search: buildings, citizens, companies, districts, roads, landmarks (camera flies there) ---------------------------------- */
function searchCommands(q) {
  const out = [], add = function (label, icon, x, y, extra) { out.push({ label: label, icon: icon, kw: (extra || '').toLowerCase(), run: function () { camFlyTo(x * TILE, y * TILE, Math.max(CAM.zoom, 1)); if (extra === 'citizen') { const c = AG.citizens.find(function (cc) { return 'go to citizen #' + cc.id === label.toLowerCase(); }); if (c) setTimeout(function () { showAgentInfo({ c: c }); }, 300); } } }); };
  districtCenters().forEach(function (d) { add('Go to ' + d.name, '📍', d.x, d.y, 'district'); });
  (MAP.roadNames || []).forEach(function (r) { add('Road: ' + r.name, '🛣️', r.x + 0.5, r.y + 0.5, 'road street'); });
  S.buildings.list.forEach(function (b) { const d = BUILDINGS[b.type], c = buildingCenter(b); if (d.id === 'tree') return; add((d.landmark ? 'Landmark: ' : '') + d.name + ' #' + b.id + ' — ' + districtName(b.x, b.y), d.icon, c.x / TILE, c.y / TILE, (d.landmark ? 'landmark ' : '') + ownerLabel(b.owner) + ' ' + d.cat); });
  AI_DEFS.forEach(function (a) { const b = S.buildings.list.find(function (x) { return x.owner === a.id; }); if (b) add('Company: ' + a.name, a.icon, b.x + 0.5, b.y + 0.5, 'company'); });
  const m = String(q || '').match(/^(?:citizen\s*)?#?(\d+)$/i);
  if (m) { const c = AG.citizens.find(function (cc) { return cc.id === +m[1]; }); if (c) add('Go to citizen #' + c.id, '🧑', c.x / TILE, c.y / TILE, 'citizen'); }
  return out;
}

/* --- Evolution & jobs in the bottom info ------------------------------------------------------------------------------------ */
function bottomInfoExtras6(b) {
  const s = [], a = [];
  const dn = districtName(b.x, b.y); if (dn) s.push('📍 <b>' + esc(dn) + '</b>');
  const T = evolveTarget(b);
  if (T && !isAI(b) && b.built) { const c = evolveCheck(b, false); a.push('<button class="btn small ' + (c.ok ? 'gold' : 'dis') + '" data-act="evolve" title="' + esc(c.ok ? 'Evolve into ' + T.name : c.reason) + '">✨ ' + T.name + (c.ok ? ' ' + money(c.cost) : '') + '</button>'); }
  if (b.type === 'warehouse' && b._op) s.push('Stock <b>' + fmt(Math.round((SIM.storageUsed || 0) * (BUILDINGS.warehouse.storage * lvlMult(b.level)) / Math.max(1, SIM.storageCap || 1))) + '/' + fmt(BUILDINGS.warehouse.storage * lvlMult(b.level)) + '</b> · in ' + fmt(SIM.whIn || 0, 1) + '/s · out ' + fmt(SIM.whOut || 0, 1) + '/s');
  return { stats: s, actions: a };
}

/* --- City advisor: district-aware analysis and positive feedback -------------------------------------------------- */
function advisorLines6(out) {
  if (!MAP.dnames || !MAP.cong) return;
  const agg = {};
  for (let i = 0; i < MAP.cong.length; i++) if (MAP.roads[i]) { const n = districtName(i % MAP.W, (i / MAP.W) | 0); if (!agg[n]) agg[n] = { s: 0, c: 0 }; agg[n].s += MAP.cong[i]; agg[n].c++; }
  let worst = null, wv = 0; for (const k in agg) { const v = agg[k].s / agg[k].c; if (v > wv) { wv = v; worst = k; } }
  if (worst && wv > 0.35) out.push({ sev: Math.min(0.9, wv), icon: '🚗', text: 'Traffic is increasing in ' + worst + '.', tip: 'Upgrade roads there to Large Road / Highway or add transit.', act: { type: 'tool', tool: 'road' } });
  if (S.p6.econ.infl > 0.05) out.push({ sev: 0.4, icon: '📈', text: 'Inflation is high (' + (S.p6.econ.infl * 100).toFixed(1) + '%). Market prices are rising.', tip: 'The central bank will raise rates; more shops and factories add supply.' });
  if (S.city.education >= 70) out.push({ sev: 0.01, icon: '✓', text: 'Education coverage is excellent.', tip: 'Skilled workers boost every business.' });
  if (SIM.cov.health >= 0.85 && S.city.population > 300) out.push({ sev: 0.01, icon: '✓', text: 'Healthcare coverage is excellent.', tip: 'Citizens are healthy and happy.' });
  if (SIM.powerRatio >= 1 && SIM.powerGen > SIM.powerUse * 1.3 && SIM.powerUse > 20) out.push({ sev: 0.01, icon: '✓', text: 'Power grid has a healthy reserve.', tip: 'Surplus electricity is sold for profit.' });
  const j = jobStats(); if (j.shortage > 0.08) out.push({ sev: 0.35, icon: '👷', text: 'Worker shortage: ' + pct(j.shortage * 100) + ' of jobs are unfilled.', tip: 'Residential demand is high — zone more housing.', act: { type: 'zone', zone: 1 } });
  if (S.p6.dq.active.length) out.push({ sev: 0.05, icon: '📋', text: S.p6.dq.active.length + ' city quest(s) are active.', tip: 'See the Quests tab.', act: { type: 'rtab', tab: 'quests' } });
}
function citizenDetailsHtml(c) {
  citizenProfile(c);
  const job = citizenJob(c), row = function (k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; };
  const dest = c.target ? citizenBuilding(c.target) : null;
  return '<div class="card">' + row('ID', '#' + c.id) + row('Age', c.age) + row('Education', EDU_LEVELS[c.edu]) + row('Job', esc(job.title)) + row('Income', money(job.income) + '/mo') + row('Money', money(c.money)) +
    row('Happiness', pct(c.happiness)) + row('Vehicle', c.car ? '🚗 Own car' : '🚶 Walks / transit') + row('Destination', dest ? BUILDINGS[dest.type].name + ' (' + esc(districtName(dest.x, dest.y)) + ')' : '—') + row('Routine', citizenRoutine(c)) + '</div>' +
    (c.util ? '<div class="card"><h3>🧠 Decision scores (utility AI)</h3>' + c.util.map(function (u) { return barRow(u[0].replace('GO_', '').replace(/_/g, ' '), u[1], Math.max(1, c.util[0][1]), '#9b5de5', String(u[1])); }).join('') + '</div>' : '');
}
