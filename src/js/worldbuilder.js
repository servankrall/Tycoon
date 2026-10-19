'use strict';
/* BLOCK CITY TYCOON — ADMIN WORLD BUILDER 2.0 · GENERATION PIPELINE (Part 19 · v2.7.0)
   The existing World Engine (worldgen.js 18 steps · projects-lab.js 22-step MEGA pipeline) gets new stages so that a world
   is never handed over broken:
     World Request → Seed Validation → Terrain → Water → Districts → Roads → Utilities → Buildings → Population → Economy →
     Transportation → Environment Balance → Traffic Balance → Service Coverage → World Validator → Auto Fix (≤ 5 passes) →
     Balance Pass → Performance Pass → Final Validator → PLAYABLE WORLD
   · Clean World Balancer: pollution, air / water quality, waste, noise, industrial density, traffic pollution in safe
     ranges for the chosen quality profile (sandbox / challenge presets may use their own rules)
   · Industrial Pollution Balancer: industry → green buffer → road → homes; polluters are relocated, homes moved away or
     trees planted — wind still carries pollution, but the starting city is never made unliveable
   · Water Quality Protection: heavy industry, waste, oil and sewage facilities are kept away from rivers, lakes and sea
   · World Validator (16 tests) + golden rule; World Quality Score 0–100 (10 categories); WORLD HEALTH REPORT
   A world whose final validation still fails after 5 repair passes is NOT handed over: generation stops, the previous city
   is restored and "WORLD GENERATION FAILED" is shown. Every stage's result is recorded (S.worldbuilder). */

const WBLD = { profile: 'balanced', custom: null, last: null, running: false, enforce: false };
/* quality profiles: safe starting ranges (validator clamps custom values to these hard limits) */
const WB_PROFILES = {
  balanced: { name: 'Balanced', pol: 25, air: 70, water: 80, noise: 30, waste: 25, ind: 0.18 },
  eco: { name: 'Eco', pol: 15, air: 80, water: 88, noise: 25, waste: 15, ind: 0.1, cfg: { forest: 1.6, industry: 0.45, infrastructure: 'green' } },
  dense: { name: 'Dense', pol: 30, air: 65, water: 80, noise: 40, waste: 25, ind: 0.18, cfg: { popDensity: 1.7, buildingDensity: 1.5, roadDensity: 1.25 } },
  industrial: { name: 'Industrial', pol: 40, air: 55, water: 72, noise: 40, waste: 30, ind: 0.32, cfg: { industry: 2 } },
  tourism: { name: 'Tourism', pol: 18, air: 78, water: 88, noise: 30, waste: 20, ind: 0.1, cfg: { tourism: 2, industry: 0.55 } },
  technology: { name: 'Technology', pol: 20, air: 75, water: 85, noise: 30, waste: 20, ind: 0.14, cfg: { tech: 2.1, infrastructure: 'advanced' } },
  mega: { name: 'Mega City', pol: 30, air: 65, water: 80, noise: 38, waste: 25, ind: 0.2, cfg: { size: 'HUGE', popDensity: 1.5, buildingDensity: 1.3, infrastructure: 'advanced' } },
  custom: { name: 'Custom', pol: 25, air: 70, water: 80, noise: 30, waste: 25, ind: 0.18 }
};
const WB_HARD = { pol: [5, 45], air: [50, 100], water: [65, 100], noise: [10, 45], waste: [5, 35], ind: [0.04, 0.35] };
const WB_CUSTOM_KEYS = [['pollution', 'Pollution', 0, 100], ['density', 'Density', 0, 100], ['population', 'Population', 0, 100], ['industry', 'Industry', 0, 100], ['water', 'Water', 0, 100], ['mountains', 'Mountains', 0, 100], ['traffic', 'Traffic', 0, 100], ['economy', 'Economy', 0, 100], ['transport', 'Transport', 0, 100], ['green', 'Green Space', 0, 100]];
/* 20 admin presets (existing WORLD_PRESETS + new ones), each still goes through the validator */
Object.assign(WORLD_PRESETS, {
  river: { name: '🏞 River City', desc: 'Wide rivers, bridges and waterfront districts.', cfg: { mapType: 'river', rivers: 2.2, water: 1.3, tourism: 1.2 } },
  desert: { name: '🏜 Desert City', desc: 'Arid climate, little water, solar power and oases.', cfg: { climate: 'arid', mapType: 'plains', water: 0.4, rivers: 0.5, forest: 0.25, infrastructure: 'green' } },
  european: { name: '🏰 European Style', desc: 'Dense historic centre, many small streets, trams and walkable districts.', cfg: { roadDensity: 1.3, buildingDensity: 1.15, popDensity: 1.15, tourism: 1.35, rivers: 1.2 } },
  asian: { name: '🏯 Asian Style', desc: 'Very dense towers, metro everywhere, technology.', cfg: { popDensity: 1.9, buildingDensity: 1.7, roadDensity: 1.2, tech: 1.5, infrastructure: 'advanced' } },
  american: { name: '🇺🇸 American Style', desc: 'Wide grid, highways, suburbs and a downtown core.', cfg: { roadDensity: 0.85, popDensity: 0.95, buildingDensity: 0.95, finance: 1.4, traffic: 1.3 } },
  lowdensity: { name: '🏡 Low Density City', desc: 'Garden suburbs, parks and quiet streets.', cfg: { popDensity: 0.6, buildingDensity: 0.7, forest: 1.4, industry: 0.6 } },
  eco: { name: '♻ Eco City', desc: 'Clean energy, recycling, parks and very low pollution.', cfg: { forest: 1.9, industry: 0.3, infrastructure: 'green', tourism: 1.2, popDensity: 0.9 } },
  future: { name: '🚀 Future City', desc: 'Technology capital with metro, clean energy and smart services.', cfg: { tech: 2.4, finance: 1.5, infrastructure: 'advanced', industry: 0.6, popDensity: 1.3 } }
});
const WB_PRESETS = [['Balanced City', 'balanced'], ['Green City', 'green'], ['Industrial City', 'industrial'], ['Financial City', 'financial'], ['Tourism City', 'tourist'], ['Technology City', 'smart'], ['Mega City', 'megacity'], ['Coastal City', 'coastal'], ['Mountain City', 'mountain'], ['River City', 'river'],
  ['Island City', 'island'], ['Desert City', 'desert'], ['Snow City', 'winter'], ['European Style', 'european'], ['Asian Style', 'asian'], ['American Style', 'american'], ['Dense City', 'dense'], ['Low Density City', 'lowdensity'], ['Eco City', 'eco'], ['Future City', 'future']];
/* preset → default quality profile */
const WB_PRESET_PROFILE = { industrial: 'industrial', green: 'eco', eco: 'eco', tourist: 'tourism', smart: 'technology', future: 'technology', megacity: 'mega', dense: 'dense', asian: 'dense' };
function wbProfileFor(cfg) {
  const id = (cfg && cfg.wbProfile) || WB_PRESET_PROFILE[cfg && cfg.preset] || 'balanced', P = Object.assign({}, WB_PROFILES[id] || WB_PROFILES.balanced, { id: WB_PROFILES[id] ? id : 'balanced' });
  if (id === 'custom' && cfg && cfg.wbCustom) { const c = cfg.wbCustom; P.pol = 5 + (c.pollution || 25) * 0.4; P.ind = 0.04 + (c.industry || 40) / 100 * 0.31; P.noise = 15 + (c.density || 50) * 0.3; }
  Object.keys(WB_HARD).forEach(function (k) { P[k] = clamp(P[k], WB_HARD[k][0], WB_HARD[k][1]); });
  return P;
}
/* custom sliders → generator config (validator still applies the safe limits) */
function wbCustomCfg(c) {
  const f = function (k, lo, hi) { return lo + (clamp(+c[k] || 0, 0, 100) / 100) * (hi - lo); };
  return { popDensity: f('population', 0.5, 1.9), buildingDensity: f('density', 0.6, 1.7), roadDensity: f('density', 0.8, 1.35), industry: f('industry', 0.25, 2.1), water: f('water', 0.3, 1.8), rivers: f('water', 0.4, 2), mountains: f('mountains', 0.2, 1.9), traffic: f('traffic', 0.5, 1.6), economy: f('economy', 0.6, 1.8), forest: f('green', 0.3, 1.9), infrastructure: +c.transport >= 66 ? 'advanced' : +c.transport <= 20 ? 'basic' : 'standard' };
}

/* ---------- classification ---------- */
function wbHeavy(d) { return d.pol >= 8 || d.cat === 'Waste' && d.id !== 'recycling' || /oil|refinery|sewage|landfill|smelter/.test(d.id) || (d.smoke && d.pol > 0); }
function wbPolluter(d) { return d.pol >= 4 && (d.cat === 'Industry' || d.cat === 'Resources' || d.cat === 'Waste' || d.cat === 'Utilities' || d.smoke); }
function wbGap(a, da, b, db) { return Math.max(0, Math.max(a.x - (b.x + db.w - 1), b.x - (a.x + da.w - 1)), Math.max(a.y - (b.y + db.h - 1), b.y - (a.y + da.h - 1))); }   // tiles between footprints
function wbWaterDist(b, d, R) { for (let r = 1; r <= R; r++) for (let y = b.y - r; y < b.y + d.h + r; y++) for (let x = b.x - r; x < b.x + d.w + r; x++) { if (!inMap(x, y)) continue; if ((x < b.x - r + 1 || x > b.x + d.w + r - 2 || y < b.y - r + 1 || y > b.y + d.h + r - 2) && MAP.nature[idx(x, y)] === 2) return r; } return R + 1; }
function wbHomesNear(b, d, R) { return S.buildings.list.filter(function (o) { const od = bdef(o); return od.housing && o !== b && wbGap(b, d, o, od) <= R; }); }
const WB_BUFFER = 1, WB_WATER = 2;          // Industrial → green / road → Residential: ≥ 2 free tiles · heavy industry ≥ 2 tiles from water
function wbPlaceOk(d, x, y) { return typeof wgCanPlace === 'function' ? wgCanPlace(d, x, y) && (d.noRoad || hasRoadNext(d, x, y)) && inUnlocked(x, y) && inUnlocked(x + d.w - 1, y + d.h - 1) : canPlace(d, x, y, true).ok; }
function wbSiteOk(d, x, y, heavy) {
  if (!wbPlaceOk(d, x, y)) return false;
  const fake = { x: x, y: y };
  if (S.buildings.list.some(function (o) { const od = bdef(o); return od.housing && wbGap(fake, d, o, od) <= WB_BUFFER; })) return false;
  if (heavy && !d.needsWater && wbWaterDist(fake, d, WB_WATER) <= WB_WATER) return false;
  return true;
}
function wbFindSite(d, heavy, ctx) {
  const lots = ctx && ctx.lots && ctx.lots.INDUSTRIAL ? ctx.lots.INDUSTRIAL.list : null;
  if (lots) for (let n = 0; n < lots.length; n++) { const i = lots[n]; const x = i % MAP.W, y = (i / MAP.W) | 0; if (wbSiteOk(d, x, y, heavy)) return { x: x, y: y }; }
  const step = MAP.W > 80 ? 2 : 1;
  for (let y = 0; y < MAP.H; y += step) for (let x = 0; x < MAP.W; x += step) if (wbSiteOk(d, x, y, heavy)) return { x: x, y: y };
  return null;
}
function wbMove(b, site) {
  const keep = { type: b.type, level: b.level, owner: b.owner, recipe: b.recipe, rot: b.rot | 0 };
  removeBuilding(b);
  const n = typeof wgCommit === 'function' ? wgCommit(keep.type, site.x, site.y, {}) : (function () { const q = makeBuilding(keep.type, site.x, site.y); addBuildingToMap(q); return q; })();
  n.level = keep.level; n.owner = keep.owner; n.recipe = keep.recipe; n.rot = keep.rot; n.built = true; n.progress = 1; n.cond = 100;
  return n;
}
function wbPlantBuffer(b, d) {
  let n = 0;
  for (let y = b.y - 2; y < b.y + d.h + 2; y++) for (let x = b.x - 2; x < b.x + d.w + 2; x++) { if (!inMap(x, y)) continue; const i = idx(x, y); if (MAP.occ[i] || MAP.roads[i] || MAP.nature[i] || MAP.terrain[i] === TERRAIN.ROCK) continue; if (MAP.zone[i] && MAP.zone[i] !== 3) continue; MAP.nature[i] = 1; n++; }
  return n;
}
/* violations of the industrial buffer / water protection (mines on their deposits and shore-bound buildings exempt) */
function wbViolations() {
  let buffer = 0, water = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!b.built || !wbPolluter(d) || d.extract) return; if (wbHomesNear(b, d, WB_BUFFER).length) buffer++; if (wbHeavy(d) && !d.needsWater && wbWaterDist(b, d, WB_WATER) <= WB_WATER) water++; });
  return { buffer: buffer, water: water };
}
/* while the World Builder runs, the generator's own placement keeps the buffer (fixWorld cannot undo the balance) */
(function () {
  const cp = window.wgCanPlace;
  if (typeof cp !== 'function' || cp.__p19) return;
  window.wgCanPlace = function (d, x, y) {
    const ok = cp.apply(this, arguments); if (!ok || !WBLD.enforce || !d) return ok;
    const fake = { x: x, y: y };
    if (wbPolluter(d) && !d.extract) { if (S.buildings.list.some(function (o) { const od = bdef(o); return od.housing && wbGap(fake, d, o, od) <= WB_BUFFER; })) return false; if (wbHeavy(d) && !d.needsWater && wbWaterDist(fake, d, WB_WATER) <= WB_WATER) return false; }
    if (d.housing && S.buildings.list.some(function (o) { const od = bdef(o); return wbPolluter(od) && !od.extract && wbGap(fake, d, o, od) <= WB_BUFFER; })) return false;
    return true;
  };
  window.wgCanPlace.__p19 = true;
})();
/* ---------- environment measurement ---------- */
function wbEnvMetrics() {
  onMapChanged(); econTick(1);
  if (S.p9 && typeof envTick === 'function') { envReset(); for (let k = 0; k < 4; k++) envTick(true); }
  const E = typeof envSummary === 'function' && S.p9 ? envSummary() : { air: 0, noise: 0, water: 1 };
  const L = S.buildings.list, built = L.filter(function (b) { return b.built && b.type !== 'tree'; }), ind = built.filter(function (b) { return bdef(b).cat === 'Industry' || bdef(b).cat === 'Resources'; });
  const indT = ind.reduce(function (a, b) { const d = bdef(b); return a + d.w * d.h; }, 0), allT = built.reduce(function (a, b) { const d = bdef(b); return a + d.w * d.h; }, 0) || 1;
  const pop = S.city.population;
  return {
    pollution: Math.round(SIM.polTarget !== undefined ? SIM.polTarget : S.city.pollution), air: Math.round((1 - E.air) * 100), water: Math.round(E.water * 100), noise: Math.round(E.noise * 100),
    waste: Math.round((SIM.wastePenalty || 0) * 100), industrial: Math.round(indT / allT * 100) / 100, trafficPol: Math.round(pop * 0.004 * ((SIM.traffic || 0) / 50) * 10) / 10
  };
}
/* ---------- Clean World + Industrial + Water balancer ---------- */
function wbBalanceEnvironment(ctx, P) {
  P = P || wbProfileFor(WG.cfg || {});
  const log = { moved: 0, homesMoved: 0, trees: 0, parks: 0, removed: 0, waste: 0, waterMoved: 0 };
  const L = S.buildings.list;
  // 1. industrial buffer + 2. water protection
  L.filter(function (b) { return b.built && wbPolluter(bdef(b)); }).forEach(function (b) {
    const d = bdef(b), heavy = wbHeavy(d), homes = wbHomesNear(b, d, WB_BUFFER), wet = heavy && !d.needsWater && !d.extract && wbWaterDist(b, d, WB_WATER) <= WB_WATER;
    if (!homes.length && !wet) return;
    if (!d.extract) {
      const s = wbFindSite(d, heavy, ctx); if (s) { const n = wbMove(b, s); log.moved++; if (wet) log.waterMoved++; log.trees += wbPlantBuffer(n, bdef(n)); return; }
      // the generator's own placement may clear small buildings (buffer still enforced by wgCanPlace)
      if (typeof wgPlaceAnywhere === 'function') { const keep = { type: b.type, level: b.level, owner: b.owner, recipe: b.recipe }; const was = WBLD.enforce; WBLD.enforce = true; removeBuilding(b); const n = wgPlaceAnywhere(ctx, keep.type, { districts: ctx && ctx.lots ? ['INDUSTRIAL', 'SUBURBS'] : null, clearSmall: true }) || wgPlaceAnywhere(null, keep.type, { clearSmall: true }); WBLD.enforce = was; if (n) { n.level = keep.level; n.owner = keep.owner; n.recipe = keep.recipe; log.moved++; if (wet) log.waterMoved++; log.trees += wbPlantBuffer(n, bdef(n)); return; } addBuildingToMap(b); }
      // a coal plant becomes a wind farm on the same lot (no smoke, no buffer needed)
      if (b.type === 'powerplant' && BUILDINGS.wind) { const x = b.x, y = b.y; removeBuilding(b); if (typeof wgUnlockTech === 'function') wgUnlockTech('wind'); const n = makeBuilding('wind', x, y); n.owner = 'city'; n.built = true; n.progress = 1; addBuildingToMap(n); log.swapped = (log.swapped || 0) + 1; return; }
      // a waste / sewage facility on the shore that cannot move is closed; capacity is rebuilt below (wgAddWaste honours the protection)
      if (wet && d.cat === 'Waste') { removeBuilding(b); log.removed++; log.wasteRebuild = true; return; }
      // heavy industry with nowhere to go is downgraded to a light workshop on the same lot (keeps some jobs)
      if (d.cat === 'Industry' && BUILDINGS.workshop) { const x = b.x, y = b.y, owner = b.owner; removeBuilding(b); const n = makeBuilding('workshop', x, y); n.owner = owner; n.built = true; n.progress = 1; addBuildingToMap(n); log.downgraded = (log.downgraded || 0) + 1; return; }
    }
    // could not move the polluter (mine on its deposit, no free land): move the nearest homes instead, plant a buffer
    let moved = 0;
    homes.filter(function (h) { return wbGap(b, d, h, bdef(h)) <= WB_BUFFER; }).forEach(function (h) { const hd = bdef(h);
      for (let k = 0; k < 600; k++) { const x = Math.floor(wgR() * MAP.W), y = Math.floor(wgR() * MAP.H); if (wbPlaceOk(hd, x, y) && !L.some(function (o) { return wbPolluter(bdef(o)) && wbGap({ x: x, y: y }, hd, o, bdef(o)) <= WB_BUFFER + 1; })) { wbMove(h, { x: x, y: y }); log.homesMoved++; moved++; return; } }
      // nowhere to move it: the home gives way (a small loss of housing; the population is re-balanced by the generator)
      if (!d.extract && hd.housing && (h._hcap || hd.housing) <= 400) { removeBuilding(h); log.homesRemoved = (log.homesRemoved || 0) + 1; } });
    if (wet && !d.extract && SIM.jobs > SIM.labor * 1.02) { removeBuilding(b); log.removed++; return; }      // heavy industry stuck on the shore: closed
    if (MAP.byId.has(b.id)) log.trees += wbPlantBuffer(b, d);
  });
  // 3. waste capacity
  let m = wbEnvMetrics();
  if ((m.waste > P.waste || log.wasteRebuild) && typeof wgAddWaste === 'function') { const was = WBLD.enforce; WBLD.enforce = true; wgAddWaste(ctx); WBLD.enforce = was; log.waste++; m = wbEnvMetrics(); }
  // 4. pollution / air: parks in the most polluted homes' surroundings, then surplus heavy industry is removed
  for (let pass = 0; pass < 10 && (m.pollution > P.pol || m.air < P.air); pass++) {
    // coal power next to homes → wind (same 2×2 footprint, same grid)
    if (BUILDINGS.wind) L.filter(function (b) { return b.type === 'powerplant' && b.built && wbHomesNear(b, bdef(b), 6).length; }).slice(0, 3).forEach(function (b) { const x = b.x, y = b.y; removeBuilding(b); if (typeof wgUnlockTech === 'function') wgUnlockTech('wind'); const n = makeBuilding('wind', x, y); n.owner = 'city'; n.built = true; n.progress = 1; addBuildingToMap(n); log.swapped = (log.swapped || 0) + 1; });
    const homes = L.filter(function (b) { return bdef(b).housing && b.built; });
    let placed = 0;
    for (let k = 0; k < homes.length && placed < 10; k++) { const h = homes[(k * 7 + pass * 13) % homes.length]; if (typeof tpPlaceNear === 'function' && (tpPlaceNear(pass % 3 === 2 && BUILDINGS.centralpark ? 'centralpark' : pass % 2 ? 'plaza' : 'park', h.x + 2, h.y, 4, { replaceSmall: false }) || tpPlaceNear('park', h.x, h.y + 2, 3, { replaceSmall: false }))) { placed++; log.parks++; } }
    if (m.pollution > P.pol + 3 && SIM.jobs > SIM.labor * 1.03) {
      const worst = L.filter(function (b) { const d = bdef(b); return b.built && wbPolluter(d) && (d.cat === 'Industry') && !d.extract; }).sort(function (a, b) { return bdef(b).pol - bdef(a).pol; })[0];
      if (worst) { removeBuilding(worst); log.removed++; }
    }
    m = wbEnvMetrics();
  }
  // 5. industrial density
  let guard = 0;
  while (m.industrial > P.ind && SIM.jobs > SIM.labor * 1.12 && guard++ < 12) {
    const f = L.filter(function (b) { const d = bdef(b); return b.built && d.cat === 'Industry' && !d.extract; }).sort(function (a, b) { return bdef(b).pol - bdef(a).pol; })[0];
    if (!f) break; removeBuilding(f); log.removed++; m = wbEnvMetrics();
  }
  // the new city starts at its balanced values (no leftover pollution from construction)
  S.city.pollution = clamp(m.pollution, 0, 100); S.city.waste = 0;
  onMapChanged();
  onMapChanged();
  return { log: log, metrics: m, profile: P.id || 'balanced', ok: m.pollution <= P.pol + 2 && m.air >= P.air - 3 && m.water >= P.water - 3 && m.noise <= P.noise + 5 && m.waste <= P.waste + 5 };
}

/* ---------- World Validator: 16 tests + golden rule ---------- */
const WB_TESTS = [['terrain', 'Terrain'], ['water', 'Water'], ['roads', 'Roads'], ['districts', 'Districts'], ['buildings', 'Buildings'], ['power', 'Power'], ['waternet', 'Water Network'], ['sewage', 'Sewage'], ['population', 'Population'], ['economy', 'Economy'], ['pollution', 'Pollution'], ['traffic', 'Traffic'], ['transport', 'Transportation'], ['emergency', 'Emergency'], ['performance', 'Performance'], ['save', 'Save']];
function wbValidate(P) {
  P = P || wbProfileFor(WG.cfg || (S.worldbuilder && S.worldbuilder.cfg) || {});
  const r = {}, t = function (id, ok, detail, crit, score) { r[id] = { ok: !!ok, detail: detail, crit: crit !== false, score: clamp(Math.round(score === undefined ? (ok ? 100 : 40) : score), 0, 100) }; };
  onMapChanged(); econTick(1); if (typeof computeCoverage === 'function') computeCoverage();
  const L = S.buildings.list, N = MAP.W * MAP.H;
  let water = 0, rock = 0; for (let i = 0; i < N; i++) { if (MAP.nature[i] === 2) water++; if (MAP.terrain[i] === TERRAIN.ROCK) rock++; }
  const badPos = L.filter(function (b) { const d = bdef(b); if (!BUILDINGS[b.type] || !isFinite(b.x) || !isFinite(b.y) || b.x < 0 || b.y < 0 || b.x + d.w > MAP.W || b.y + d.h > MAP.H) return true; for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) { const i = idx(x, y); if (MAP.occ[i] !== b.id || (MAP.nature[i] === 2 && !d.needsWater && !d.water)) return true; } return false; });
  const land = (N - water) / N;
  t('terrain', land >= 0.3 && rock / N < 0.5, Math.round(land * 100) + '% land · ' + Math.round(rock / N * 100) + '% rock', true, 100 - Math.max(0, 30 - land * 100) * 3 - Math.max(0, rock / N * 100 - 35) * 2);
  const env = wbEnvMetrics();
  const viol = wbViolations();
  t('water', env.water >= P.water - 3 && viol.water === 0, 'water quality ' + env.water + '% (min ' + P.water + ') · heavy industry by water ' + viol.water, true, env.water - viol.water * 5);
  const rc = mainRoadComp(), roadB = L.filter(function (b) { return !bdef(b).noRoad; }), reach = roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; }).length, share = roadB.length ? reach / roadB.length : 1;
  t('roads', rc.comps <= 1 && share >= 0.98, rc.comps + ' network(s) · ' + reach + '/' + roadB.length + ' buildings reachable', true, share * 100 - (rc.comps - 1) * 10);
  const dn = MAP.districts ? MAP.districts.filter(function (d) { return d.built > 0; }) : [], isolated = typeof computeDistricts === 'function' ? 0 : 0;
  t('districts', dn.length >= 1 && isolated === 0, dn.length + ' populated district cells', true, dn.length ? 100 : 0);
  t('buildings', !badPos.length && L.length > 10, L.length + ' buildings · ' + badPos.length + ' corrupt', true, 100 - badPos.length * 10);
  t('power', SIM.powerRatio >= 0.99, Math.round(SIM.powerGen) + ' / ' + Math.round(SIM.powerUse) + ' MW', true, Math.min(1, SIM.powerRatio || 0) * 100);
  const wlow = typeof WNET !== 'undefined' ? WNET.low || 0 : 0;
  t('waternet', SIM.waterRatio >= 0.99 && wlow < 0.1, Math.round(SIM.waterGen) + ' / ' + Math.round(SIM.waterUse) + ' · low pressure ' + Math.round(wlow * 100) + '%', true, Math.min(1, SIM.waterRatio || 0) * 100 - wlow * 100);
  const sov = typeof SEWER !== 'undefined' ? SEWER.overload || 0 : 0;
  t('sewage', !S.p9 || sov < 0.05, 'overload ' + Math.round(sov * 100) + '%', true, 100 - sov * 200);
  const homes = L.filter(function (b) { return bdef(b).housing && b._entry >= 0; }).length;
  t('population', S.city.population > 0 && (SIM.housingCap || 0) >= S.city.population * 0.99 && homes > 0, fmt(Math.round(S.city.population)) + ' citizens · ' + fmt(Math.round(SIM.housingCap || 0)) + ' homes · ' + homes + ' spawn buildings', true, clamp((SIM.housingCap || 0) / Math.max(1, S.city.population), 0, 1) * 100 - (SIM.unemployment || 0) * 150);
  const fin = isFinite(S.money) && isFinite(S.budget) && isFinite(SIM.bNet || 0);
  t('economy', fin && ((SIM.bNet || 0) >= 0 || S.budget > Math.abs(SIM.bNet || 0) * 7200), 'budget ' + signMoney(SIM.bNet || 0) + '/s · ' + money(S.budget), true, fin ? clamp(55 + ((SIM.bNet || 0) >= 0 ? 30 : -20) + ((SIM.pNet || 0) >= 0 ? 15 : 0), 0, 100) : 0);
  const polOk = env.pollution <= P.pol + 2 && env.air >= P.air - 3 && env.noise <= P.noise + 5 && env.waste <= P.waste + 5 && viol.buffer === 0;
  t('pollution', polOk, 'buffer violations ' + viol.buffer + ' · pollution ' + env.pollution + ' (max ' + Math.round(P.pol) + ') · air ' + env.air + '% · noise ' + env.noise + ' · waste ' + env.waste + ' · industry ' + Math.round(env.industrial * 100) + '%', true, 100 - Math.max(0, env.pollution - P.pol) * 3 - Math.max(0, P.air - env.air) * 2 - viol.buffer * 4);
  let okR = 0, nR = 0; const sample = roadB.filter(function (b) { return b._entry >= 0 && MAP.comp[b._entry] === rc.main; });
  for (let k = 0; k < 12 && sample.length > 1; k++) { const a = sample[(k * 7919) % sample.length], b = sample[(k * 104729 + 3) % sample.length]; if (a === b) continue; nR++; if (roadPath(a._entry, b._entry)) okR++; }
  const stuck = AG.vehicles.filter(function (v) { return v.stopped > 8; }).length;
  t('traffic', okR >= nR && stuck <= Math.max(3, AG.vehicles.length * 0.3) && (SIM.traffic || 0) < 85, okR + '/' + nR + ' routes · ' + stuck + ' stuck · traffic ' + Math.round(SIM.traffic || 0) + '%', true, 100 - (SIM.traffic || 0) * 0.6 - stuck * 3 - (nR - okR) * 10);
  const tv = typeof tp3Validate === 'function' ? tp3Validate() : { ok: true, issues: [] };
  t('transport', tv.ok, tv.issues.length ? tv.issues.length + ' issue(s): ' + tv.issues.slice(0, 2).map(function (i) { return i.what; }).join('; ') : 'all lines valid', true, 100 - tv.issues.filter(function (i) { return TP_WARN.indexOf(i.id) < 0; }).length * 12 - tv.issues.length * 2);
  const em = ((SIM.cov.fire || 0) + (SIM.cov.police || 0) + (SIM.cov.health || 0)) / 3;
  t('emergency', SIM.cov.fire >= 0.8 && SIM.cov.police >= 0.8 && SIM.cov.health >= 0.75, 'fire ' + Math.round(SIM.cov.fire * 100) + '% · police ' + Math.round(SIM.cov.police * 100) + '% · health ' + Math.round(SIM.cov.health * 100) + '%', true, em * 100);
  const t0 = performance.now(); for (let k = 0; k < 4; k++) econTick(1); const tickMs = (performance.now() - t0) / 4;
  const pq = typeof perf === 'function' ? perf() : { veh: 100, npc: 200 };
  const agentsOk = AG.vehicles.length <= (pq.veh || 100) * 3 + 60 && AG.citizens.length <= (pq.npc || 200) * 3 + 60;
  t('performance', tickMs < 60 && agentsOk, 'economy tick ' + tickMs.toFixed(1) + ' ms · ' + AG.vehicles.length + ' vehicles · ' + AG.citizens.length + ' citizen agents', true, 100 - Math.max(0, tickMs - 10) * 1.5);
  let saveOk = false, kb = 0; try { const o = buildSaveObject(), txt = JSON.stringify(o); kb = Math.round(txt.length / 1024); saveOk = validateImport(JSON.parse(txt)).length === 0 && kb < 16000; } catch (e) { saveOk = false; }
  t('save', saveOk, kb + ' KB · round trip ' + (saveOk ? 'OK' : 'FAILED'), true, saveOk ? 100 : 0);
  const failed = WB_TESTS.filter(function (x) { return !r[x[0]].ok; }).map(function (x) { return x[0]; });
  return { tests: r, failed: failed, env: env, transport: tv, at: Date.now() };
}
/* Golden rule: none of these may be broken in a delivered world */
const WB_GOLDEN = [['spawn', 'No playable spawn', ['population']], ['roads', 'Disconnected roads', ['roads']], ['utility', 'Broken utility network', ['power', 'waternet', 'sewage']], ['terrain', 'Impossible terrain', ['terrain']], ['water', 'Invalid water', ['water']], ['pollution', 'Extreme unintended pollution', ['pollution']], ['services', 'Unreachable essential services', ['emergency']], ['transport', 'Broken transportation', ['transport']], ['traffic', 'Deadlocked traffic', ['traffic']], ['buildings', 'Corrupt buildings', ['buildings']], ['economy', 'Invalid economy', ['economy']], ['save', 'Invalid save', ['save']], ['performance', 'Critical performance failure', ['performance']]];
/* World Quality Score: 10 categories */
function wbQuality(v) {
  v = v || wbValidate(); const s = function (id) { return v.tests[id].score; };
  const cats = { Terrain: s('terrain'), Roads: s('roads'), Water: Math.round((s('water') + s('waternet')) / 2), Traffic: s('traffic'), Pollution: s('pollution'), Utilities: Math.round((s('power') + s('waternet') + s('sewage')) / 3), Services: s('emergency'), Economy: s('economy'), Transportation: s('transport'), Performance: s('performance') };
  const overall = Math.round(Object.keys(cats).reduce(function (a, k) { return a + cats[k]; }, 0) / 10);
  const broken = WB_GOLDEN.filter(function (g) { return g[2].some(function (id) { return !v.tests[id].ok; }); }).map(function (g) { return g[1]; });
  return { cats: cats, overall: overall, label: wbQualityLabel(overall), broken: broken, ready: overall >= 60 && !broken.length };
}
function wbQualityLabel(v) { return v >= 95 ? 'Excellent' : v >= 85 ? 'Very Good' : v >= 75 ? 'Good' : v >= 60 ? 'Needs Optimization' : 'Invalid'; }
/* ---------- Auto Fix: one repair pass for every failing test ---------- */
function wbRepairPass(v, ctx, P) {
  const done = [], f = v.failed, did = function (s) { if (s) done.push(s); };
  if (f.indexOf('buildings') >= 0) { const bad = S.buildings.list.filter(function (b) { return !BUILDINGS[b.type] || !isFinite(b.x) || !isFinite(b.y); }); bad.forEach(function (b) { removeBuilding(b); }); if (typeof rebuildOcc === 'function') rebuildOcc(); did('Broken building → ' + bad.length + ' removed, occupancy rebuilt'); }
  if (f.indexOf('roads') >= 0 || f.indexOf('traffic') >= 0) { const j = wgConnectRoads(); let sp = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.noRoad && b._entry < 0 && wgSpurRoad(b.x, b.y, d)) sp++; }); did('No road connection → ' + (j || 0) + ' connector(s), ' + sp + ' access road(s)'); }
  if (f.indexOf('power') >= 0 || f.indexOf('waternet') >= 0 || f.indexOf('sewage') >= 0) { if (S.p9) { const u = buildAllUtilities(); p9AutoFixUtilities(); did('Utility network → ' + (u.length ? u.join(', ') : 'grids reconnected')); } else { wgAddPower(ctx, SIM.powerUse - SIM.powerGen); wgAddWater(ctx, SIM.waterUse - SIM.waterGen); did('Utilities → generators added'); } }
  if (f.indexOf('population') >= 0 || f.indexOf('economy') >= 0 || f.indexOf('districts') >= 0) { const r = fixWorld(true); did('World fix → ' + r.actions.slice(0, 3).join('; ')); if (f.indexOf('economy') >= 0) did('Economy → ' + fixEconomy()); }
  if (f.indexOf('economy') >= 0) { econTick(1);
    // still a deficit: a modest tax rise, then a starting reserve that covers the first two game hours
    if ((SIM.bNet || 0) < 0 && S.city.tax < 16) { S.city.tax = Math.min(16, S.city.tax + 2); if (S.government && typeof govTaxes === 'function') govTaxes(); econTick(1); did('Economy → residential tax ' + S.city.tax + '%'); }
  }
  if (f.indexOf('emergency') >= 0) { ['fire', 'police', 'health'].forEach(function (t) { wgFixCoverage(t); }); did('Hospital / fire / police unreachable → coverage completed'); }
  if (f.indexOf('pollution') >= 0 || f.indexOf('water') >= 0) { const b = wbBalanceEnvironment(ctx, P); did('Industrial pollution too high → ' + b.log.moved + ' relocated, ' + b.log.trees + ' buffer trees, ' + b.log.parks + ' parks, ' + b.log.removed + ' reduced'); }
  if (f.indexOf('transport') >= 0 && typeof tp3AutoFix === 'function') { const r = tp3AutoFix(); did('Transportation → ' + (r.actions.length ? r.actions.slice(0, 3).join('; ') : 'checked')); }
  if (f.indexOf('traffic') >= 0 && S.p9) did('Traffic deadlock → ' + fixTraffic());
  if (f.indexOf('performance') >= 0) { const pq = perf(); while (AG.vehicles.length > pq.veh * 2) AG.vehicles.pop(); while (AG.citizens.length > pq.npc * 2) AG.citizens.pop(); did('Performance → agent counts trimmed to the quality tier'); }
  onMapChanged(); econTick(1);
  // the reserve is sized after every other repair, since new buildings change the running cost
  if (f.indexOf('economy') >= 0 && (SIM.bNet || 0) < 0 && S.budget <= Math.abs(SIM.bNet) * 7200) { S.budget = Math.min(MONEY_CAP, Math.abs(SIM.bNet) * 7200 * 1.25); did('Economy → starting reserve ' + money(S.budget)); }
  return done;
}

/* ---------- pipeline stages (inserted into the World Engine) ---------- */
function wbRec(ctx, id, label, t0, result, ok) { (ctx.pipeline = ctx.pipeline || []).push({ id: id, label: label, ms: Math.round(performance.now() - t0), ok: ok !== false, result: String(result).slice(0, 200) }); }
const WB_RUN = {
  wb_seed: async function (ctx, cfg) {
    const t0 = performance.now(), okSeed = Number.isInteger(cfg.seed) && cfg.seed >= 0 && cfg.seed < 1000000, okSize = !!WORLD_SIZES[cfg.size];
    if (!okSeed || !okSize) throw new Error('Invalid world request (seed ' + cfg.seed + ', size ' + cfg.size + ')');
    ctx.wbProfile = wbProfileFor(cfg);
    // a new world must not inherit caches keyed by MAP.version from the previous one
    if (typeof TRANSIT !== 'undefined') { TRANSIT.legs.clear(); TRANSIT.pods = []; } if (typeof GOV !== 'undefined') { GOV.cache = {}; GOV.hourKey = -1; } TPE.cache = null; TPE.heat = null; TPE.heatKey = ''; TPAI.pred = null; TPAI.rr.clear(); TPAI.window = []; if (typeof JX !== 'undefined') { JX.types.clear(); JX.sig.clear(); }
    wbRec(ctx, 'seed', 'Seed validation', t0, seedLabel(cfg.seed) + ' · ' + cfg.size + ' · profile ' + ctx.wbProfile.name);
    await ctx.tick('wbseed', 1);
  },
  wb_transport: async function (ctx) {
    const t0 = performance.now(), r = typeof tpGenerateTransport === 'function' ? tpGenerateTransport() : { ok: false, reason: 'no transport engine' };
    if (r.ok && r.built.length) ctx.fixLog = (ctx.fixLog || []).concat(['🚇 Transportation (' + r.tier + '): ' + r.built.slice(0, 6).join(', ')]);
    wbRec(ctx, 'transport', 'Transportation', t0, r.ok ? r.tier + ' city · ' + r.built.length + ' element(s) · ' + r.steps + ' steps' : r.reason, r.ok);
    await ctx.tick('wbtransport', 1);
  },
  wb_env: async function (ctx) {
    WBLD.enforce = true;
    const t0 = performance.now(), r = wbBalanceEnvironment(ctx, ctx.wbProfile);
    ctx.wbEnv = r; if (r.log.moved || r.log.trees || r.log.parks || r.log.removed) ctx.fixLog = (ctx.fixLog || []).concat(['🌿 Environment: ' + r.log.moved + ' polluter(s) relocated (' + r.log.waterMoved + ' from water), ' + r.log.homesMoved + ' home(s) moved, ' + r.log.trees + ' buffer trees, ' + r.log.parks + ' park(s)']);
    wbRec(ctx, 'env', 'Environment balance', t0, 'pollution ' + r.metrics.pollution + ' · air ' + r.metrics.air + '% · water ' + r.metrics.water + '% · noise ' + r.metrics.noise + ' · waste ' + r.metrics.waste, r.ok);
    await ctx.tick('wbenv', 1);
  },
  wb_traffic: async function (ctx) {
    const t0 = performance.now(); onMapChanged(); econTick(1); let r = 'traffic ' + Math.round(SIM.traffic || 0) + '%';
    if ((SIM.traffic || 0) > 60 && S.p9) r += ' → ' + fixTraffic();
    wbRec(ctx, 'traffic', 'Traffic balance', t0, r); await ctx.tick('wbtraffic', 1);
  },
  wb_coverage: async function (ctx) {
    const t0 = performance.now(); onMapChanged(); econTick(1); if (typeof computeCoverage === 'function') computeCoverage();
    const low = ['fire', 'police', 'health'].filter(function (t) { return (SIM.cov[t] || 0) < 0.85; });
    low.forEach(function (t) { wgFixCoverage(t); }); if (typeof wgFixSchools === 'function') wgFixSchools();
    wbRec(ctx, 'coverage', 'Service coverage', t0, low.length ? 'topped up: ' + low.join(', ') : 'fire / police / health covered'); await ctx.tick('wbcoverage', 1);
  },
  wb_validate: async function (ctx) {
    const t0 = performance.now(); ctx.wbVal = wbValidate(ctx.wbProfile);
    wbRec(ctx, 'validate', 'World validator', t0, (16 - ctx.wbVal.failed.length) + '/16 tests · failed: ' + (ctx.wbVal.failed.join(', ') || 'none'), !ctx.wbVal.failed.length); await ctx.tick('wbvalidate', 1);
  },
  wb_fix: async function (ctx) {
    const t0 = performance.now(); ctx.wbFixes = ctx.wbFixes || []; let pass = 0;
    while (ctx.wbVal.failed.length && pass < 5) { pass++; const done = wbRepairPass(ctx.wbVal, ctx, ctx.wbProfile); ctx.wbFixes = ctx.wbFixes.concat(done); ctx.wbVal = wbValidate(ctx.wbProfile); await ctx.tick('wbfix', pass / 5); }
    ctx.wbPasses = pass;
    wbRec(ctx, 'fix', 'Auto fix', t0, pass + ' repair pass(es) · ' + ctx.wbFixes.length + ' fix(es) · still failing: ' + (ctx.wbVal.failed.join(', ') || 'none'), !ctx.wbVal.failed.length); await ctx.tick('wbfix', 1);
  },
  wb_balance: async function (ctx) {
    const t0 = performance.now(); onMapChanged(); econTick(1); let r = '';
    if ((SIM.bNet || 0) < 0 && typeof fixEconomy === 'function') r += fixEconomy() + ' · ';
    if (S.government && typeof govTaxes === 'function') govTaxes();
    r += 'budget ' + signMoney(SIM.bNet || 0) + '/s · unemployment ' + Math.round((SIM.unemployment || 0) * 100) + '%';
    // transport tiers: a large / mega city must end with metro + rail (sites freed by the environment balance)
    if (typeof tpGenerateTransport === 'function' && S.p9) { const tier = tpTier(), want = []; if ((tier === 'large' || tier === 'mega') && !tpLines('metro').length) want.push('metro'); if ((tier === 'large' || tier === 'mega') && !tpLines('train').length) want.push('rail');
      if (want.length) { const g = tpGenerateTransport({ only: want }); if (g.ok && g.built.length) { r += ' · transport tier completed: ' + g.built.join(', '); ctx.fixLog = (ctx.fixLog || []).concat(['🚆 ' + g.built.join(', ')]); } } }
    wbRec(ctx, 'balance', 'Balance pass', t0, r); await ctx.tick('wbbalance', 1);
  },
  wb_perf: async function (ctx) {
    const t0 = performance.now(); MAP.pathCache.clear(); onMapChanged();
    const pq = perf(); let trimmed = 0; while (AG.vehicles.length > pq.veh * 2) { AG.vehicles.pop(); trimmed++; }
    wbRec(ctx, 'perf', 'Performance pass', t0, 'path cache reset · ' + trimmed + ' surplus vehicle(s) · ' + MAP.W + '×' + MAP.H + ' map'); await ctx.tick('wbperf', 1);
  },
  wb_final: async function (ctx, cfg) {
    const t0 = performance.now(); let v = wbValidate(ctx.wbProfile), q = wbQuality(v), extra = 0;
    while (!q.ready && extra < 5 - (ctx.wbPasses || 0)) { extra++; ctx.wbFixes = (ctx.wbFixes || []).concat(wbRepairPass(v, ctx, ctx.wbProfile)); v = wbValidate(ctx.wbProfile); q = wbQuality(v); }
    const warnings = Object.keys(v.tests).filter(function (k) { return v.tests[k].ok && v.tests[k].score < 75; }).length + (v.transport ? v.transport.issues.filter(function (i) { return TP_WARN.indexOf(i.id) >= 0; }).length : 0);
    S.worldbuilder = { v: 1, at: new Date().toISOString(), preset: cfg.preset, profile: ctx.wbProfile.id || 'balanced', cfg: { preset: cfg.preset, wbProfile: ctx.wbProfile.id || 'balanced', size: cfg.size, seed: cfg.seed }, quality: q.overall, label: q.label, cats: q.cats, ready: q.ready, broken: q.broken,
      tests: WB_TESTS.map(function (x) { return [x[0], v.tests[x[0]].ok ? 1 : 0, v.tests[x[0]].score, v.tests[x[0]].detail]; }), fixes: (ctx.wbFixes || []).length, passes: (ctx.wbPasses || 0) + extra, warnings: warnings, critical: q.broken.length, env: v.env, pipeline: (ctx.pipeline || []).concat([{ id: 'final', label: 'Final validator', ms: Math.round(performance.now() - t0), ok: q.ready, result: q.overall + '% ' + q.label }]) };
    WBLD.enforce = false;
    if (!q.ready) throw new Error('WORLD GENERATION FAILED — after 5 repair passes the world is still not ready (' + (q.broken.join(', ') || 'quality ' + q.overall + '%') + '). The world was not opened.');
    await ctx.tick('wbfinal', 1);
  }
};
Object.assign(typeof MEGA_RUN !== 'undefined' ? MEGA_RUN : WG_RUN, WB_RUN); Object.assign(WG_RUN, WB_RUN);
(function () {
  const NEW = [['wbtransport', 'Transportation', ['wb_transport']], ['wbenv', 'Environment balance', ['wb_env']], ['wbtraffic', 'Traffic balance', ['wb_traffic']], ['wbcoverage', 'Service coverage', ['wb_coverage']], ['wbvalidate', 'World validator', ['wb_validate']], ['wbfix', 'Auto fix (≤ 5 passes)', ['wb_fix']], ['wbbalance', 'Balance pass', ['wb_balance']], ['wbperf', 'Performance pass', ['wb_perf']], ['wbfinal', 'Final validator', ['wb_final']]];
  if (!WG_STAGES.some(function (s) { return s[0] === 'wbseed'; })) {
    WG_STAGES.unshift(['wbseed', 'Seed validation']);
    const at = WG_STAGES.findIndex(function (s) { return s[0] === 'start'; });
    WG_STAGES.splice(at, 0, ...NEW.map(function (s) { return [s[0], s[1]]; }));
    // classic stages run by id: map the new ids onto their functions
    NEW.concat([['wbseed', '', ['wb_seed']]]).forEach(function (s) { WG_RUN[s[0]] = WB_RUN[s[2][0]]; });
  }
  if (typeof MEGA_STAGES !== 'undefined' && !MEGA_STAGES.some(function (s) { return s[0] === 'wbseed'; })) {
    MEGA_STAGES.unshift(['wbseed', 'Seed validation', ['wb_seed']]);
    const at = MEGA_STAGES.findIndex(function (s) { return s[0] === 'start'; });
    MEGA_STAGES.splice(at, 0, ...NEW);
  }
})();

/* ---------- World Health Report (shown after generation, and on demand) ---------- */
function wbReportHtml(W) {
  if (!W) return '<p class="small">No World Builder report yet — generate a world.</p>';
  const bar = function (p) { const n = Math.round(p / 5); return '█'.repeat(n) + '░'.repeat(20 - n); };
  return '<div class="wbRep"><div class="wbQ"><b>WORLD QUALITY</b><div class="wbBar">' + bar(W.quality) + ' ' + W.quality + '%</div><span class="' + (W.quality >= 85 ? 'pos' : W.quality >= 60 ? '' : 'neg') + '">' + W.label + '</span></div>' +
    '<div class="grid2">' + Object.keys(W.cats || {}).map(function (k) { return '<div class="between small"><span>' + k + '</span><b>' + W.cats[k] + '</b></div>'; }).join('') + '</div>' +
    '<h4 style="margin:8px 0 4px">WORLD HEALTH REPORT</h4>' + (W.tests || []).map(function (t) { const name = (WB_TESTS.find(function (x) { return x[0] === t[0]; }) || [0, t[0]])[1]; return '<div class="between small"><span>' + name + '</span><span class="' + (t[1] ? 'pos' : 'neg') + '">' + (t[1] ? '✓' : '✗') + ' <i style="font-style:normal;color:var(--dim)">' + esc(t[3]) + '</i></span></div>'; }).join('') +
    '<div class="between" style="margin-top:6px"><span>Auto Fixes</span><b>' + W.fixes + '</b></div><div class="between"><span>Warnings</span><b>' + W.warnings + '</b></div><div class="between"><span>Critical Errors</span><b class="' + (W.critical ? 'neg' : 'pos') + '">' + W.critical + '</b></div>' +
    '<div class="wbReady ' + (W.ready ? 'pos' : 'neg') + '">' + (W.ready ? 'WORLD READY' : 'NOT READY — ' + esc((W.broken || []).join(', '))) + '</div>' +
    (W.pipeline ? '<details><summary class="small">Pipeline (' + W.pipeline.length + ' recorded stages)</summary>' + W.pipeline.map(function (p) { return '<div class="between small"><span>' + (p.ok ? '✓' : '⚠') + ' ' + p.label + '</span><span>' + esc(p.result) + ' · ' + p.ms + ' ms</span></div>'; }).join('') + '</details>' : '') + '</div>';
}
(function () {
  const sw = window.showWorldResult;
  if (typeof sw === 'function' && !sw.__p19) {
    window.showWorldResult = function (res) {
      const r = sw.apply(this, arguments);
      if (S && S.worldbuilder) { const b = $('modalBody'); if (b) b.insertAdjacentHTML('afterbegin', '<div class="card"><h3>🧬 WORLD BUILDER 2.0</h3>' + wbReportHtml(S.worldbuilder) + (WBLD.optimized ? '<button class="btn gold" data-wbplay="1" style="width:100%;margin-top:8px"' + (S.worldbuilder.ready ? '' : ' disabled') + '>▶ PLAY</button>' : '') + '</div>'); }
      return r;
    };
    window.showWorldResult.__p19 = true;
  }
})();
document.addEventListener('click', function (e) { const b = e.target.closest && e.target.closest('[data-wbplay]'); if (!b || b.disabled) return; WBLD.optimized = false; if (S.worldbuilder && S.worldbuilder.ready) { setSpeed(1); closeModal(); toast('▶ WORLD READY — have fun!', 'good'); } });
/* current-world analysis (admin "World Quality Score" / "World Validator") */
function wbAnalyzeCurrent() {
  const v = wbValidate(), q = wbQuality(v);
  S.worldbuilder = Object.assign(S.worldbuilder || {}, { at: new Date().toISOString(), quality: q.overall, label: q.label, cats: q.cats, ready: q.ready, broken: q.broken, critical: q.broken.length,
    tests: WB_TESTS.map(function (x) { return [x[0], v.tests[x[0]].ok ? 1 : 0, v.tests[x[0]].score, v.tests[x[0]].detail]; }), env: v.env, warnings: Object.keys(v.tests).filter(function (k) { return v.tests[k].ok && v.tests[k].score < 75; }).length, fixes: (S.worldbuilder && S.worldbuilder.fixes) || 0 });
  return { v: v, q: q };
}
function wbAutoFixCurrent() {
  let v = wbValidate(), pass = 0, fixes = []; WBLD.enforce = true;
  try { while (v.failed.length && pass < 5) { pass++; fixes = fixes.concat(wbRepairPass(v, null, wbProfileFor((S.worldbuilder && S.worldbuilder.cfg) || {}))); v = wbValidate(); } } finally { WBLD.enforce = false; }
  const a = wbAnalyzeCurrent(); S.worldbuilder.fixes = (S.worldbuilder.fixes || 0) + fixes.length; S.worldbuilder.passes = pass;
  return { passes: pass, fixes: fixes, q: a.q };
}
/* ONE-CLICK PERFECT WORLD: CREATE OPTIMIZED WORLD (the full pipeline + profile; PLAY stays disabled until WORLD READY) */
async function wbCreateOptimizedWorld(presetId, profile, opts) {
  opts = opts || {};
  const prof = WB_PROFILES[profile] ? profile : (WB_PRESET_PROFILE[presetId] || 'balanced');
  const cfgOv = Object.assign({}, WB_PROFILES[prof].cfg || {}, prof === 'custom' && opts.custom ? wbCustomCfg(opts.custom) : {}, opts.overrides || {}, { wbProfile: prof, wbCustom: opts.custom || null });
  ['name', 'seed', 'slot', 'size'].forEach(function (k) { if (opts[k] !== undefined && opts[k] !== '') cfgOv[k] = opts[k]; });
  WBLD.optimized = true; WBLD.running = true;
  try {
    const res = await generateWorld(presetId || 'balanced', cfgOv);
    if (res) setSpeed(0);                                                     // the city waits for PLAY in the report
    return res;
  } finally { WBLD.running = false; }
}
/* save 3.2: the last World Builder report is kept with the city (sanitized on load) */
function sanitizeWorldbuilder(src) {
  if (!src || typeof src !== 'object') return null;
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }, str = function (v, m) { return typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, m || 60) : ''; };
  const o = { v: 1, at: str(src.at, 30), preset: str(src.preset, 20), profile: WB_PROFILES[src.profile] ? src.profile : 'balanced', quality: n(src.quality, 0, 0, 100), label: wbQualityLabel(n(src.quality, 0, 0, 100)), ready: !!src.ready, fixes: n(src.fixes, 0, 0, 1e5) | 0, passes: n(src.passes, 0, 0, 10) | 0, warnings: n(src.warnings, 0, 0, 1e4) | 0, critical: n(src.critical, 0, 0, 100) | 0 };
  o.cfg = src.cfg && typeof src.cfg === 'object' ? { preset: str(src.cfg.preset, 20), wbProfile: WB_PROFILES[src.cfg.wbProfile] ? src.cfg.wbProfile : o.profile, size: WORLD_SIZES[src.cfg.size] ? src.cfg.size : 'LARGE', seed: n(src.cfg.seed, 0, 0, 999999) | 0 } : { wbProfile: o.profile };
  o.cats = {}; if (src.cats && typeof src.cats === 'object') Object.keys(src.cats).slice(0, 12).forEach(function (k) { if (/^\w{1,16}$/.test(k)) o.cats[k] = n(src.cats[k], 0, 0, 100); });
  o.broken = Array.isArray(src.broken) ? src.broken.slice(0, 13).map(function (s) { return str(s, 40); }) : [];
  o.tests = Array.isArray(src.tests) ? src.tests.slice(0, 16).filter(Array.isArray).map(function (t) { return [str(t[0], 16), t[1] ? 1 : 0, n(t[2], 0, 0, 100), str(t[3], 160)]; }) : [];
  o.env = src.env && typeof src.env === 'object' ? Object.keys(src.env).slice(0, 10).reduce(function (a, k) { a[str(k, 16)] = n(src.env[k], 0, -1e6, 1e6); return a; }, {}) : null;
  o.pipeline = Array.isArray(src.pipeline) ? src.pipeline.slice(0, 40).filter(function (p) { return p && typeof p === 'object'; }).map(function (p) { return { id: str(p.id, 16), label: str(p.label, 40), ms: n(p.ms, 0, 0, 1e7) | 0, ok: !!p.ok, result: str(p.result, 200) }; }) : [];
  return o;
}
