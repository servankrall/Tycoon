'use strict';
/* BLOCK CITY TYCOON — VISUAL ENGINE 2.0 (Part 15)
   Extends the existing canvas renderer (renderer.js stays the renderer) with one visual layer that every platform shares:

     VisualEngine
     ├── Quality      tiers LOW · MEDIUM · HIGH · ULTRA (+ thermal / FPS fallback) and the per-tier budgets
     ├── DayNight     Dawn · Morning · Noon · Evening · Night · Midnight · Late Night, seasonal sunrise / sunset
     ├── Lighting     sun angle, height, intensity, colour temperature, shadow direction
     ├── Shadows      simplified (LOW) · dynamic (MEDIUM) · soft (HIGH) · soft + contact (ULTRA)
     ├── Weather      smooth transitions (Clear → Cloudy → Rain → Heavy Rain → Storm), wet roads, puddles, snow cover, fog
     ├── Seasons      vegetation green → yellow → orange → brown, blossom, daylight
     ├── Environment  wind (None · Light · Medium · Strong · Storm), water ripples / shore foam / sky reflection, clouds
     ├── Particles    hard budget per tier (100 · 300 · 800 · 1500), lowered on weak / hot devices
     ├── Animation    construction crew & trucks, rooftop equipment, aircraft warning lights, signs, vehicle wheels / brake /
     │                turn signals, pedestrians' walk cycle and variety
     ├── LOD          NEAR · MID · FAR · VERY FAR for windows, lights, animation, particles and shadows
     ├── Atmosphere   distance haze, pollution haze, district identity (Downtown, Financial District, Industrial Zone …),
     │                city evolution (Village → Mega City), events & nightlife crowds
     └── Post         depth effect (photo mode), screen-space weather blending
   The simulation never waits for the visuals: everything here reads state, is skipped by tier, and costs nothing when off.
   Visual objects are not simulation entities — only what is on screen gets drawn, capped per tier. */

/* ===================================== QUALITY · BUDGETS ===================================== */
const VE_TIERS = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const VE_BUDGET = {
  LOW: { particles: 100, citizens: 120, clouds: 0, puddles: 0, wind: 0, water: 0, shadow: 'simple', windows: 'far', crowd: 10, haze: false, rooftop: false, wheels: false },
  MEDIUM: { particles: 300, citizens: 300, clouds: 4, puddles: 16, wind: 1, water: 1, shadow: 'dynamic', windows: 'mid', crowd: 24, haze: true, rooftop: true, wheels: false },
  HIGH: { particles: 800, citizens: 700, clouds: 7, puddles: 40, wind: 1, water: 2, shadow: 'soft', windows: 'near', crowd: 50, haze: true, rooftop: true, wheels: true },
  ULTRA: { particles: 1500, citizens: 1500, clouds: 10, puddles: 70, wind: 1, water: 3, shadow: 'max', windows: 'near', crowd: 90, haze: true, rooftop: true, wheels: true }
};
const VE = {
  tier: 'MEDIUM', b: VE_BUDGET.MEDIUM, at: 0,
  sun: { elev: 0.8, azi: 0, intensity: 1, kelvin: 5600, rise: 6, set: 18, phase: 'Noon' },
  wx: { k: 1, last: 'clear', plan: [], wet: 0, snow: 0, fog: 0, cloud: 0, wind: 0, windLevel: 'None' },
  clouds: [], outage: new Set(), outageCheck: 0, stats: { visible: 0, drawnCitizens: 0, lights: 0, windows: 0, lamps: 0, chunks: 0 },
  cine: null, tour: null, depth: false, simPause: false, ambient: null,
  dirty: { lighting: true, weather: true, district: true, power: true }, sunKey: '', wxAcc: 0, prof: { ve: 0, veAcc: 0 }, grad: {}
};
/* tier: GSET.veQuality (AUTO = the graphics quality), one step lower when the device struggles or gets hot */
/* Part 16 — QUALITY GOVERNOR with hysteresis (no flapping): a step down only after the frame rate stayed below
   75 % of the target for 5 s, heat (thermal ≥ 2 / ≥ 3) or low memory force a floor, and quality comes back ONE step
   at a time after 30 s above 92 % of the target, at most one change per 20 s. The player is told once per session. */
const VE_GOV = { drop: 0, lowSince: 0, highSince: 0, changedAt: 0, partStep: 0, pLowSince: 0, pHighSince: 0, pChangedAt: 0, log: [] };
const VE_PART_STEPS = [1, 0.66, 0.46, 0.27];                 // 1500 → 1000 → 700 → 400 (ULTRA), same ratios on every tier
function veFpsTarget() { return window.BCT_FPS_CAP || 60; }
function veGovern(now) {
  // with Performance = AUTO the AUTO PERFORMANCE watchdog (settings2.js) already steps S.settings.quality down / up;
  // the visual tier follows it, so the governor only steps the visual tier itself under a fixed performance mode
  const fps = PERF.fps || 60, tgt = veFpsTarget(), G = VE_GOV, auto = (!GSET.veQuality || GSET.veQuality === 'AUTO') && GSET.perfMode !== 'AUTO';
  if (!auto && G.drop) { G.drop = 0; G.log.unshift('handed over to AUTO PERFORMANCE'); }
  const low = fps < tgt * 0.75, high = fps > tgt * 0.92;
  G.lowSince = low ? (G.lowSince || now) : 0; G.highSince = high ? (G.highSince || now) : 0;
  if (auto && STARTED && now - G.changedAt > 20000) {
    if (G.lowSince && now - G.lowSince > 5000 && G.drop < 3) { G.drop++; G.changedAt = now; G.lowSince = 0; G.log.unshift('drop → ' + G.drop + ' (' + Math.round(fps) + ' FPS)'); }
    else if (G.highSince && now - G.highSince > 30000 && G.drop > 0) { G.drop--; G.changedAt = now; G.highSince = 0; G.log.unshift('restore → ' + G.drop + ' (' + Math.round(fps) + ' FPS)'); }
    if (G.log.length > 8) G.log.length = 8;
  }
  // particle budget follows the frame rate faster (3 s down / 10 s up), also in fixed quality
  G.pLowSince = low ? (G.pLowSince || now) : 0; G.pHighSince = high ? (G.pHighSince || now) : 0;
  if (now - G.pChangedAt > 3000) {
    if (G.pLowSince && now - G.pLowSince > 3000 && G.partStep < VE_PART_STEPS.length - 1) { G.partStep++; G.pChangedAt = now; G.pLowSince = 0; }
    else if (G.pHighSince && now - G.pHighSince > 10000 && G.partStep > 0) { G.partStep--; G.pChangedAt = now; G.pHighSince = 0; }
  }
}
function veComputeTier() {
  let t = GSET.veQuality && GSET.veQuality !== 'AUTO' ? GSET.veQuality : (S && S.settings && S.settings.quality) || 'MEDIUM';
  const base = Math.max(0, VE_TIERS.indexOf(t)); let i = base;
  if (!GSET.veQuality || GSET.veQuality === 'AUTO') {
    i -= VE_GOV.drop;
    const th = IS_MOBILE && typeof Platform !== 'undefined' && Platform.thermal ? Platform.thermal() : 0;
    if (th >= 3) i = Math.min(i, base - 2); else if (th >= 2) i = Math.min(i, base - 1);
    if (IS_MOBILE && typeof MOB !== 'undefined' && MOB.lowMem) i = 0;
  }
  i = clamp(i, 0, 3);
  const prev = VE.tier;
  VE.tier = VE_TIERS[i]; VE.b = VE_BUDGET[VE.tier];
  if (i < base && prev !== VE.tier && STARTED) { Log.info('Visual Engine: ' + prev + ' → ' + VE.tier); if (typeof perfReducedNotice === 'function') perfReducedNotice(); }
}
function veParticleCap() { const c = Math.round(VE.b.particles * VE_PART_STEPS[VE_GOV.partStep]); return GSET.powerMode === 'battery' ? Math.round(c * 0.5) : c; }
function veTierIndex() { return VE_TIERS.indexOf(VE.tier); }

/* ===================================== DAY / NIGHT · SUN ===================================== */
/* sunrise / sunset per season (game hours): long summer days, short winter days */
const VE_DAYLIGHT = { spring: [6, 18], summer: [5.3, 19.3], autumn: [6.5, 17.6], winter: [7.3, 16.8] };
const VE_PHASES = [[0, 'Midnight', '🌑'], [4, 'Late Night', '🌌'], [6, 'Dawn', '🌅'], [8, 'Morning', '🌤️'], [12, 'Noon', '☀️'], [17, 'Evening', '🌇'], [20, 'Night', '🌙']];
function veHour() { return PHOTO.on && PHOTO.hour !== null ? PHOTO.hour : gameHour(); }
function veDaylight() { const s = S ? currentSeason().id : 'spring'; return VE_DAYLIGHT[s] || VE_DAYLIGHT.spring; }
function dayPhase(h) { if (h === undefined) h = veHour(); let p = VE_PHASES[0]; for (let i = 0; i < VE_PHASES.length; i++) if (h >= VE_PHASES[i][0]) p = VE_PHASES[i]; return { name: p[1], icon: p[2] }; }
/* sun: elevation 0 (horizon) → 1 (noon), azimuth −1 (east, morning) → +1 (west, evening), intensity, colour temperature */
function veUpdateSun() {
  const h = veHour(), key = Math.floor(h * 60) + '|' + (S ? seasonIndex() : 0) + '|' + Math.round(VE.wx.cloud * 20) + '|' + Math.round(VE.wx.fog * 20);
  if (key === VE.sunKey) return VE.sun;                       // Part 16 dirty flag: once per game minute, not every frame
  VE.sunKey = key; VE.dirty.lighting = true;
  const dl = veDaylight(), rise = dl[0], set = dl[1], t = (h - rise) / (set - rise), s = VE.sun;
  s.rise = rise; s.set = set;
  s.elev = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  s.azi = clamp(t * 2 - 1, -1, 1);
  const overcast = clamp(VE.wx.cloud * 0.55 + VE.wx.fog * 0.35, 0, 0.8);
  s.intensity = Math.pow(s.elev, 0.6) * (1 - overcast);
  s.kelvin = Math.round(2000 + 3800 * Math.pow(s.elev, 0.5));
  s.phase = dayPhase(h).name;
  return s;
}
/* 0 = full day … 1 = full night; dusk and dawn follow the season's sunrise / sunset */
function veNightFactor(h) {
  const dl = veDaylight(), rise = dl[0], set = dl[1];
  if (h >= rise + 1 && h <= set - 0.5) return 0;
  if (h > set - 0.5 && h < set + 2) return (h - (set - 0.5)) / 2.5;
  if (h >= set + 2 || h < rise - 1) return 1;
  return 1 - (h - (rise - 1)) / 2;
}

/* ===================================== WEATHER 2.0: transitions & surface state ===================================== */
const VE_WX_CHAIN = ['clear', 'cloudy', 'rain', 'heavyrain', 'storm'];
/* the path from one weather to another never jumps: Clear → Cloudy → Rain → Heavy Rain → Storm (and back) */
function weatherPath(a, b) {
  if (a === b) return [];
  const ia = VE_WX_CHAIN.indexOf(a), ib = VE_WX_CHAIN.indexOf(b);
  if (ia >= 0 && ib >= 0) { const out = [], st = ib > ia ? 1 : -1; for (let i = ia + st; i !== ib + st; i += st) out.push(VE_WX_CHAIN[i]); return out; }
  const hub = b === 'heatwave' ? 'clear' : 'cloudy';
  if (ia >= 0) return weatherPath(a, hub).concat(b === hub ? [] : [b]);
  const back = a === 'heatwave' ? 'clear' : 'cloudy';          // leaving fog / snow / heatwave / cold wave
  if (ib >= 0) return [back].concat(weatherPath(back, b));
  return (back === b ? [] : [back]).concat(back === hub ? [b] : weatherPath(back, hub).concat([b]));
}
/* called by updateWeather when the natural weather changes: returns the next step and keeps the rest as a plan */
function veWeatherPlan(cur, target) {
  const p = weatherPath(cur, target);
  if (p.length <= 1) { VE.wx.plan = []; return target; }
  VE.wx.plan = p.slice(1); return p[0];
}
function veWeatherStepSec() { return 1500; }                // 25 game minutes per transition step
const VE_WX_LEVEL = { clear: 0, cloudy: 0.35, fog: 0.4, rain: 0.6, heavyrain: 0.85, storm: 1, snow: 0.6, coldwave: 0.3, heatwave: 0 };
const VE_WIND_NAMES = ['None', 'Light', 'Medium', 'Strong', 'Storm'];
function veUpdateWeatherState(dt) {
  const w = FX.weather, x = VE.wx;
  if (w !== x.last) { x.last = w; x.k = 0; }
  x.k = Math.min(1, x.k + dt / 4);                            // 4 s visual blend into the new weather
  const gameDt = dt * Math.max(1, S.settings.speed || 1) * (typeof TIME_SCALE !== 'undefined' ? TIME_SCALE : 60) / 3600;   // game hours
  const raining = w === 'rain' || w === 'heavyrain' || w === 'storm';
  x.wet = clamp(x.wet + (raining ? (w === 'rain' ? 0.8 : 1.6) : -0.35) * gameDt, 0, 1);
  const snowing = w === 'snow' || w === 'coldwave';
  const season = currentSeason().id;
  x.snow = clamp(x.snow + (snowing ? 0.9 : season === 'winter' ? -0.05 : -0.6) * gameDt, 0, 1);
  const lerp = function (a, b, k) { return a + (b - a) * Math.min(1, k); };
  x.fog = lerp(x.fog, w === 'fog' ? 1 : w === 'heavyrain' ? 0.25 : w === 'storm' ? 0.2 : 0, dt * 0.4);
  x.cloud = lerp(x.cloud, VE_WX_LEVEL[w] !== undefined ? Math.max(VE_WX_LEVEL[w], w === 'cloudy' ? 0.55 : 0) : 0.2, dt * 0.3);
  const ws = S.p9 && S.p9.env && S.p9.env.wind ? S.p9.env.wind.speed : 0.1;      // Part 9 wind model (0.04 … 0.35)
  const wt = clamp((ws - 0.04) / 0.31 * 0.6 + (w === 'storm' ? 0.4 : w === 'heavyrain' ? 0.15 : 0), 0, 1);
  x.wind = lerp(x.wind, wt, dt * 0.5);
  x.windLevel = VE_WIND_NAMES[Math.min(4, Math.floor(x.wind * 4.99))];
}
/* gameplay side of the weather that the visuals show (gentle, never game-breaking) */
function veWeatherMods() {
  const w = FX.weather;
  return {
    vehicleSpeed: w === 'fog' ? 0.85 : w === 'snow' || w === 'coldwave' ? 0.82 : w === 'heavyrain' ? 0.9 : w === 'storm' ? 0.88 : w === 'rain' ? 0.95 : 1,
    emergency: w === 'fog' ? 0.9 : w === 'snow' ? 0.85 : w === 'storm' ? 0.88 : w === 'heavyrain' ? 0.92 : 1,
    visibility: 1 - VE.wx.fog * 0.6 - (w === 'heavyrain' || w === 'storm' ? 0.2 : 0)
  };
}

/* fog / snow / storms slow traffic and emergency response a little (applied when a vehicle sets off) */
function veVehicleWx(type) { const m = veWeatherMods(); return type === 'ambulance' || type === 'firetruck' || type === 'police' ? m.emergency : m.vehicleSpeed; }

/* ===================================== SEASONS · VEGETATION · WIND ===================================== */
function seasonProgress() { const d = Math.max(0, gameDay() - 1); return ((d % SEASON_DAYS) + gameHour() / 24) / SEASON_DAYS; }
const VE_AUTUMN = ['#2d6a4f', '#8a9a2b', '#e9c46a', '#f4a261', '#e76f51', '#9c6644'];
/* foliage colour: autumn turns green → yellow → orange → brown over the season (each tree a little ahead / behind) */
function foliageColor(season, seed) {
  if (season.id === 'winter') return '#dfe7ec';
  if (season.id === 'spring') return seed % 6 === 0 ? '#ffafcc' : seed % 9 === 0 ? '#fff0f5' : seasonProgress() < 0.3 ? '#52b788' : '#2d6a4f';
  if (season.id === 'summer') return seed % 5 === 0 ? '#1b4332' : '#2d6a4f';
  const p = clamp(seasonProgress() + ((seed % 7) - 3) * 0.06, 0, 0.999);
  return VE_AUTUMN[Math.floor(p * VE_AUTUMN.length)];
}
/* tree sway in pixels (wind level) — 0 on LOW */
function treeSway(seed) { if (!VE.b.wind || VE.wx.wind < 0.05) return 0; return Math.sin(FX.time * (1.2 + VE.wx.wind * 2.2) + seed * 0.7) * (0.6 + VE.wx.wind * 3.2); }

/* ===================================== DISTRICT IDENTITY · CITY EVOLUTION ===================================== */
const VE_DISTRICT_LOOK = {
  'Downtown': { lamp: [255, 214, 150], window: [255, 220, 140], icon: '🏙️' },
  'Financial District': { lamp: [200, 225, 255], window: [190, 220, 255], icon: '💹' },
  'Industrial Zone': { lamp: [255, 180, 90], window: [255, 190, 110], icon: '🏭' },
  'Old Town': { lamp: [255, 196, 120], window: [255, 205, 130], icon: '🏛️' },
  'Tourism District': { lamp: [255, 170, 220], window: [255, 215, 160], icon: '🎡' },
  'Tech Valley': { lamp: [150, 240, 255], window: [170, 230, 255], icon: '💻' },
  'Suburbs': { lamp: [255, 220, 170], window: [255, 225, 160], icon: '🏡' },
  'Luxury Coast': { lamp: [255, 228, 160], window: [255, 236, 190], icon: '🌴' },
  'Green Belt': { lamp: [220, 255, 200], window: [255, 225, 160], icon: '🌳' }
};
const VE_DCHAR = { at: -1, grid: null };
/* character of every 8×8 district from what is really built there (recomputed when the map changes) */
function districtCharacters() {
  if (VE_DCHAR.at === MAP.version && VE_DCHAR.grid) return VE_DCHAR.grid;
  const n = MAP.dN || Math.ceil(MAP.W / 8), C = [];
  for (let i = 0; i < n * n; i++) C.push({ res: 0, com: 0, ind: 0, off: 0, tour: 0, tech: 0, land: 0, green: 0, tall: 0, water: 0, n: 0, lux: 0 });
  S.buildings.list.forEach(function (b) {
    const d = bdef(b), t = C[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)]; if (!t || d.id === 'tree') return;
    const a = d.w * d.h; t.n += a;
    if (d.housing) { t.res += a; if ((d.quality || 0) >= 70) t.lux += a; }
    if (d.cat === 'Commercial') t.com += a;
    if (d.cat === 'Industry' || d.cat === 'Resources' || d.cat === 'Logistics') t.ind += a;
    if (d.sector === 'FINANCE' || OFFICE_IDS.indexOf(d.id) >= 0) t.off += a;
    if (d.sector === 'TECHNOLOGY' || d.cat === 'Science') t.tech += a;
    if (d.tour || d.cat === 'Leisure') t.tour += a;
    if (d.landmark) t.land += a;
    if (d.id === 'park' || d.hap) t.green += a;
    if ((d.height || 0) * (1 + 0.15 * ((b.level || 1) - 1)) >= 60) t.tall += a;
  });
  for (let y = 0; y < MAP.H; y += 2) for (let x = 0; x < MAP.W; x += 2) if (MAP.nature[idx(x, y)] === 2) { const t = C[Math.floor(y / 8) * n + Math.floor(x / 8)]; if (t) t.water++; }
  const grid = C.map(function (t) {
    if (!t.n) return t.green ? 'Green Belt' : '';
    const f = function (k) { return t[k] / t.n; };
    if (f('ind') > 0.4) return 'Industrial Zone';
    if (f('off') > 0.28) return 'Financial District';
    if (f('tech') > 0.25) return 'Tech Valley';
    if (f('tour') + f('land') > 0.3) return 'Tourism District';
    if (f('tall') > 0.25 || (f('com') > 0.3 && t.n > 20)) return 'Downtown';
    if (t.water > 3 && f('lux') > 0.2) return 'Luxury Coast';
    if (f('res') > 0.55 && f('tall') < 0.05) return 'Suburbs';
    if (f('green') > 0.3) return 'Green Belt';
    return 'Old Town';
  });
  VE_DCHAR.grid = grid; VE_DCHAR.at = MAP.version;
  return grid;
}
function districtCharacterAt(x, y) { const g = districtCharacters(), n = MAP.dN || Math.ceil(MAP.W / 8); return g[Math.floor(clamp(y, 0, MAP.H - 1) / 8) * n + Math.floor(clamp(x, 0, MAP.W - 1) / 8)] || ''; }
function districtLook(x, y) { return VE_DISTRICT_LOOK[districtCharacterAt(x, y)] || VE_DISTRICT_LOOK.Downtown; }
/* shared lamp colour per district (one string per district, rebuilt only when the map changes) */
function districtLampStyle(x, y) {
  const g = districtCharacters(), n = MAP.dN || Math.ceil(MAP.W / 8), k = Math.floor(clamp(y, 0, MAP.H - 1) / 8) * n + Math.floor(clamp(x, 0, MAP.W - 1) / 8);
  if (VE_DCHAR.lampVer !== VE_DCHAR.at) { VE_DCHAR.lampVer = VE_DCHAR.at; VE_DCHAR.lamp = g.map(function (c) { const L = (VE_DISTRICT_LOOK[c] || VE_DISTRICT_LOOK.Downtown).lamp; return 'rgba(' + L[0] + ',' + L[1] + ',' + L[2] + ',.22)'; }); }
  return VE_DCHAR.lamp[k] || 'rgba(255,214,150,.22)';
}
function cityEvolution() { const t = cityTier(); return { name: t.name, stage: CITY_TIERS.indexOf(t), max: CITY_TIERS.length - 1 }; }

/* ===================================== POWER-BASED LIGHTING ===================================== */
function inOutage(tx, ty) {
  if (!S.p9 || !S.p9.util || !S.p9.util.failures.length) return false;
  const F = S.p9.util.failures, now = S.clock.runSec;
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (f.until > now && Math.hypot(tx - f.x, ty - f.y) <= f.r + 1) return true; }
  return false;
}
/* a new power failure: street lights, traffic lights and businesses in its district react — and the player is told so */
function veOutageTick() {
  if (!S.p9 || !S.p9.util) return;
  const F = S.p9.util.failures, now = S.clock.runSec, live = new Set();
  F.forEach(function (f) {
    if (f.until <= now) return;
    const key = f.x + ',' + f.y + ',' + f.cause; live.add(key);
    if (VE.outage.has(key)) return;
    VE.outage.add(key); VE.dirty.power = true;
    let lamps = 0, sig = 0, bld = 0;
    for (let y = Math.max(0, f.y - f.r - 1); y <= Math.min(MAP.H - 1, f.y + f.r + 1); y++) for (let x = Math.max(0, f.x - f.r - 1); x <= Math.min(MAP.W - 1, f.x + f.r + 1); x++) { const i = idx(x, y); if (MAP.roads[i]) { if (streetLampAt(x, y)) lamps++; if (MAP.inter[i]) sig++; } }
    S.buildings.list.forEach(function (b) { if (b.built && Math.hypot(b.x - f.x, b.y - f.y) <= f.r + 1) bld++; });
    const where = (typeof districtName === 'function' && districtName(f.x, f.y)) || 'the city';
    if (typeof noteAt === 'function') noteAt({ x: f.x, y: f.y });
    notify('⚡ POWER OUTAGE · ' + where + ' — Street lights: OFF (' + lamps + ') · Traffic lights: OFF (' + sig + ', 4-way stop) · Buildings: emergency power (' + bld + ')', 'bad');
  });
  VE.outage.forEach(function (k) {
    if (live.has(k)) return;
    VE.outage.delete(k); VE.dirty.power = true;
    const p = k.split(','), where = (typeof districtName === 'function' && districtName(+p[0], +p[1])) || 'the city';
    if (p[2] !== 'selftest' && p[2] !== 'qa') notify('💡 Power restored · ' + where + ' — street lights ON · traffic lights normal · buildings back on the grid', 'good');
  });
}
/* street lamp placement by road type: small every 3rd tile, medium every 2nd, large / highway every tile */
function streetLampAt(x, y) {
  const t = MAP.roads[idx(x, y)]; if (!t) return 0;
  if (MAP.nature[idx(x, y)] === 2 && t < 3) return 0;               // no lamps on small bridges
  if (t >= 3) return t >= 4 ? 2 : 1;                                // highway: lamps on both sides
  return (x + y) % (t === 1 ? 3 : 2) === 0 ? 1 : 0;
}

/* ===================================== WORLD-SPACE EFFECTS (ground) ===================================== */
function veGroundFx(v) {
  if (!S) return;
  const b = VE.b, wx = VE.wx, T = TILE;
  // wet asphalt + puddles (rain), snow cover (winter)
  if (wx.wet > 0.05 && veTierIndex() >= 0) {
    ctx.fillStyle = 'rgba(10,18,40,' + (0.16 * wx.wet) + ')';
    ctx.beginPath(); for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) if (MAP.roads[idx(x, y)] && MAP.nature[idx(x, y)] !== 2) ctx.rect(x * T, y * T, T, T); ctx.fill();   // Part 16: one fill for all wet roads
    if (b.puddles && wx.wet > 0.35) {
      const rain = FX.weather === 'rain' || FX.weather === 'heavyrain' || FX.weather === 'storm';
      let n = 0;
      for (let y = v.ty0; y <= v.ty1 && n < b.puddles; y++) for (let x = v.tx0; x <= v.tx1 && n < b.puddles; x++) {
        if (!MAP.roads[idx(x, y)] || decoRand(x, y, 77) > 0.12) continue;
        n++;
        const px = x * T + 6 + decoRand(x, y, 78) * 18, py = y * T + 8 + decoRand(x, y, 79) * 14, r = (3 + decoRand(x, y, 80) * 5) * Math.min(1, (wx.wet - 0.35) * 2);
        ctx.fillStyle = 'rgba(150,180,220,.28)'; ctx.beginPath(); ctx.ellipse(px, py, r * 1.6, r * 0.8, 0, 0, 6.283); ctx.fill();
        if (rain && b.water >= 2) { const ph = (FX.time * 1.7 + decoRand(x, y, 81) * 3) % 1; ctx.strokeStyle = 'rgba(220,235,255,' + (0.4 * (1 - ph)) + ')'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(px, py, r * 1.6 * ph, r * 0.8 * ph, 0, 0, 6.283); ctx.stroke(); }
      }
    }
  }
  if (wx.snow > 0.05) {
    const road = new Path2D(), land = new Path2D();             // Part 16: two fills (ploughed roads · snow cover) instead of one per tile
    for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
      const i = idx(x, y); if (MAP.nature[i] === 2) continue;
      (MAP.roads[i] ? road : land).rect(x * T, y * T, T, T);
    }
    ctx.fillStyle = 'rgba(235,242,250,' + (0.22 * wx.snow) + ')'; ctx.fill(road);
    ctx.fillStyle = 'rgba(245,250,255,' + (0.42 * wx.snow) + ')'; ctx.fill(land);
  }
  // water: sky reflection tint by time of day, shore foam, rain rings
  if (b.water) {
    const nf = nightFactor(), s = VE.sun;
    const refl = nf > 0.5 ? 'rgba(40,60,140,.18)' : s.elev < 0.3 && s.intensity > 0.05 ? 'rgba(255,170,90,.14)' : 'rgba(200,230,255,.10)';
    const rain = FX.weather === 'rain' || FX.weather === 'heavyrain' || FX.weather === 'storm';
    let rings = 0; const reflP = new Path2D();                   // Part 16: sky reflection = one fill (first pass), then foam / rain rings
    for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) if (MAP.nature[idx(x, y)] === 2) reflP.rect(x * T, y * T, T, T * 0.5);
    ctx.fillStyle = refl; ctx.fill(reflP);
    for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
      if (MAP.nature[idx(x, y)] !== 2) continue;
      if (b.water >= 2) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.1 * Math.sin(FX.time * 2 + x + y)) + ')';
        if (x > 0 && MAP.nature[idx(x - 1, y)] !== 2) ctx.fillRect(x * T, y * T, 2, T);
        if (x < MAP.W - 1 && MAP.nature[idx(x + 1, y)] !== 2) ctx.fillRect(x * T + T - 2, y * T, 2, T);
        if (y > 0 && MAP.nature[idx(x, y - 1)] !== 2) ctx.fillRect(x * T, y * T, T, 2);
        if (y < MAP.H - 1 && MAP.nature[idx(x, y + 1)] !== 2) ctx.fillRect(x * T, y * T + T - 2, T, 2);
      }
      if (rain && rings < 60 && decoRand(x, y, (Math.floor(FX.time * 2) % 5) + 90) < 0.35) {
        rings++; const ph = (FX.time * 2) % 1, cx = x * T + 4 + decoRand(x, y, 91) * 24, cy = y * T + 4 + decoRand(x, y, 92) * 24;
        ctx.strokeStyle = 'rgba(230,240,255,' + (0.5 * (1 - ph)) + ')'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(cx, cy, 1 + ph * 5, 0, 6.283); ctx.stroke();
      }
    }
  }
}
/* crowds: events, nightlife and tourism districts get extra (purely visual) pedestrians around their venues */
function veCrowds(v) {
  const cap = VE.b.crowd; if (!cap || CAM.zoom < 0.55) return;
  const h = veHour(), evening = h >= 18 || h < 1, ev = S.events.active.length;
  let venues = VE.venues;
  if (!venues || FX.time - VE.venuesAt > 0.5) {                    // Part 16: venue list cached (0.5 s), crowd positions still animate every frame
    venues = VE.venues = []; VE.venuesAt = FX.time;
    const L = MAP.lists, add = function (list, w) { (list || []).forEach(function (b) { if (b.built && b.x * TILE >= v.x0 - 60 && b.x * TILE <= v.x1 + 60 && b.y * TILE >= v.y0 - 60 && b.y * TILE <= v.y1) venues.push([b, w]); }); };
    if (ev) { add(L.parks, 1); add(L.ENTERTAINMENT, 1.5); }
    if (evening) { add(L.ENTERTAINMENT, 1); add(L.FOOD, 0.6); }
  }
  veParade();
  if (!venues.length) return;
  let n = 0;
  for (let k = 0; k < venues.length && n < cap; k++) {
    const b = venues[k][0], d = bdef(b), c = buildingCenter(b), per = Math.min(10, Math.round((ev ? 6 : 3) * venues[k][1]));
    for (let j = 0; j < per && n < cap; j++, n++) {
      const a = b.id * 1.7 + j * 2.4 + FX.time * 0.25 * ((j % 3) - 1), r = (d.w * TILE) * 0.55 + (j % 4) * 3;
      const px = c.x + Math.cos(a) * r, py = c.y + d.h * TILE * 0.3 + Math.sin(a) * r * 0.5;
      ctx.fillStyle = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9b5de5', '#ffd166'][(b.id + j) % 6]; ctx.fillRect(px - 1.5, py - 5, 3, 4);
      ctx.fillStyle = '#f1c9a5'; ctx.fillRect(px - 1, py - 7, 2, 2);
    }
  }
}
/* CITY PARADE: floats and a band march up and down the longest street while the event runs */
function veParade() {
  if (!activeEvent('parade') || CAM.zoom < 0.5 || !VE.b.crowd) return;
  if (VE.paradeVer !== MAP.version) { VE.paradeVer = MAP.version; VE.paradeRoad = (MAP.roadNames || []).reduce(function (a, r) { return !a || r.len > a.len ? r : a; }, null); }   // cached per map change
  const R = VE.paradeRoad; if (!R) return;
  const rx = Math.round(R.x), ry = Math.round(R.y), horiz = inMap(rx + 1, ry) && inMap(rx - 1, ry) && !!MAP.roads[idx(rx + 1, ry)] && !!MAP.roads[idx(rx - 1, ry)];
  const t = (Math.sin(FX.time * 0.08) + 1) / 2, len = R.len * TILE;
  for (let k = 0; k < 14; k++) {
    const o = (t * (len - 60)) - len / 2 + 30 - k * 7;
    const px = horiz ? (R.x + 0.5) * TILE + o : (R.x + 0.5) * TILE + (k % 2 ? 3 : -3), py = horiz ? (R.y + 0.5) * TILE + (k % 2 ? 3 : -3) : (R.y + 0.5) * TILE + o;
    if (k % 5 === 0) { ctx.fillStyle = ['#ff006e', '#ffbe0b', '#3a86ff'][(k / 5) % 3]; ctx.fillRect(px - 5, py - 7, 10, 7); ctx.fillStyle = '#fff'; ctx.fillRect(px - 5, py - 8, 10, 1.5); }
    else { ctx.fillStyle = k % 2 ? '#e63946' : '#ffffff'; ctx.fillRect(px - 1.5, py - 5, 3, 4); ctx.fillStyle = '#ffd166'; ctx.fillRect(px - 1.5, py - 7, 3, 2); }
  }
  if (Math.random() < 0.05) spawnParticles((R.x + 0.5) * TILE, (R.y + 0.5) * TILE - 10, 'confetti', 3);
}
/* construction crew: workers and a supply truck at every active site in view (Foundation → Structure → Exterior → Done) */
function veConstructionLife(vis) {
  if (CAM.zoom < 0.7 || veTierIndex() < 1) return;
  for (let i = 0; i < vis.length; i++) {
    const b = vis[i]; if (b.built) continue;
    const d = bdef(b), x0 = b.x * TILE + 3, y0 = b.y * TILE + 3, w = d.w * TILE - 6, h = d.h * TILE - 6;
    for (let k = 0; k < Math.min(4, 1 + d.w); k++) {
      const t = FX.time * 0.6 + k * 1.9 + b.id, px = x0 + 4 + ((Math.sin(t) + 1) / 2) * (w - 8), py = y0 + h - 2 - (k % 2) * 3;
      ctx.fillStyle = '#ff9f1c'; ctx.fillRect(px - 1.5, py - 4, 3, 3); ctx.fillStyle = '#ffd166'; ctx.fillRect(px - 1.5, py - 6, 3, 2);
    }
    if (d.w >= 2 || (b.id % 2 === 0)) {                       // supply truck parked at the edge, unloading
      const tx = x0 - 2, ty = y0 + h + 4;
      ctx.fillStyle = '#e9ecef'; ctx.fillRect(tx, ty - 4, 10, 5); ctx.fillStyle = '#f77f00'; ctx.fillRect(tx + 10, ty - 3, 4, 4);
      ctx.fillStyle = '#222'; ctx.fillRect(tx + 2, ty + 1, 2, 1.5); ctx.fillRect(tx + 10, ty + 1, 2, 1.5);
    }
  }
}
/* rooftop equipment, signs and aircraft warning lights — grows with the building level */
function veRooftop(b, d, x0, fy, w, h, H) {
  if (!VE.b.rooftop || CAM.zoom < 0.6 || H < 12 || d.sector === 'ENERGY') return;
  const lv = b.level || 1, top = fy - h;
  if (lv >= 2) { ctx.fillStyle = 'rgba(200,205,215,.9)'; ctx.fillRect(x0 + w - 9, top + 3, 5, 4); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x0 + w - 9, top + 6, 5, 1); }
  if (lv >= 3 && d.housing) { ctx.fillStyle = '#8d6e63'; ctx.fillRect(x0 + 3, top + 3, 5, 5); ctx.fillStyle = '#6d4c41'; ctx.fillRect(x0 + 3, top + 2, 5, 1.5); }
  if (lv >= 4 && d.cat === 'Commercial') { ctx.fillStyle = shade(d.color, 35); ctx.fillRect(x0 + w * 0.15, fy + 1, w * 0.7, 3); }
  if (lv >= 5 && h > 10) { ctx.fillStyle = 'rgba(82,183,136,.85)'; ctx.fillRect(x0 + 3, top + h - 7, w * 0.35, 4); }      // roof garden
  if (H >= 55 || lv >= 7) {                                                                                                 // antenna + aircraft warning light
    ctx.fillStyle = '#adb5bd'; ctx.fillRect(x0 + w / 2 - 0.75, top - 10, 1.5, 10);
    if (Math.floor(FX.time * 1.2 + b.id * 0.3) % 2) { ctx.fillStyle = '#ff1744'; ctx.fillRect(x0 + w / 2 - 1.5, top - 12, 3, 3); }
  }
  if (lv >= MAX_LEVEL && (d.id === 'megamall' || d.id === 'arcology' || H >= 120)) {                                        // level 10 crown
    ctx.strokeStyle = 'rgba(255,209,102,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + 3, top + 2); ctx.lineTo(x0 + w / 2, top - 8); ctx.lineTo(x0 + w - 3, top + 2); ctx.stroke();
  }
}
/* megabuildings change shape with their level: setbacks (5+), sky bridges (8+) and the crown (10) */
function veMegaShape(b, d, x0, fy, w, h, H) {
  if (d.id !== 'megamall' && d.id !== 'arcology') return;
  const lv = b.level || 1;
  if (lv >= 5) { ctx.fillStyle = shade(d.roof || d.color, 10); ctx.fillRect(x0 + w * 0.2, fy - h - H * 0.12, w * 0.6, H * 0.12); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x0 + w * 0.2, fy - h - H * 0.12, w * 0.6, 2); }
  if (lv >= 8) { ctx.fillStyle = 'rgba(160,220,255,.55)'; for (let k = 1; k <= 3; k++) ctx.fillRect(x0 - 2, fy + H * k / 4, w + 4, 2); }
  if (d.id === 'arcology' && lv >= 3) { ctx.fillStyle = 'rgba(82,183,136,.7)'; for (let k = 0; k < Math.min(6, lv); k++) ctx.fillRect(x0 + 2, fy + 6 + k * (H / 7), 4, 3); }
}

/* ===================================== CLOUDS · ATMOSPHERE (screen space) ===================================== */
let VE_CLOUD_SPR = null;
function cloudSprite() {
  if (VE_CLOUD_SPR) return VE_CLOUD_SPR;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  for (let k = 0; k < 7; k++) { const x = 40 + k * 28, y = 64 + Math.sin(k * 1.7) * 14, r = 34 + (k % 3) * 10, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
  VE_CLOUD_SPR = c; return c;
}
/* moving cloud shadows on the city (world space, so they drift with the wind and stay put when the camera moves) */
function veCloudShadows(v) {
  const want = Math.round(VE.b.clouds * clamp(VE.wx.cloud * 1.6, 0, 1.6));
  if (!want || PHOTO.cleanShot) return;
  const W = MAP.W * TILE, Hh = MAP.H * TILE, spd = 6 + VE.wx.wind * 40;
  while (VE.clouds.length < want) VE.clouds.push({ x: Math.random() * W, y: Math.random() * Hh, s: 2 + Math.random() * 3 });
  if (VE.clouds.length > want) VE.clouds.length = want;
  const spr = cloudSprite(), dir = S.p9 && S.p9.env && S.p9.env.wind ? S.p9.env.wind.dir : 0.6;
  ctx.globalAlpha = clamp(0.06 + VE.wx.cloud * 0.14, 0, 0.22) * (1 - nightFactor() * 0.8);
  VE.clouds.forEach(function (c) {
    c.x += Math.cos(dir) * spd / 60; c.y += Math.sin(dir) * spd / 60;
    if (c.x > W + 400) c.x = -400; if (c.x < -400) c.x = W + 400; if (c.y > Hh + 300) c.y = -300; if (c.y < -300) c.y = Hh + 300;
    const w = 256 * c.s, hh = 128 * c.s;
    if (c.x + w < v.x0 || c.x - w > v.x1 || c.y + hh < v.y0 || c.y - hh > v.y1) return;
    ctx.drawImage(spr, c.x - w / 2, c.y - hh / 2, w, hh);
  });
  ctx.globalAlpha = 1;
}
/* screen-space atmosphere: distance haze when zoomed out, pollution haze, fog banks (cheap gradients, no volumetrics) */
function veAtmosphere() {
  if (!VE.b.haze || PHOTO.cleanShot) return;
  const nf = nightFactor();
  if (CAM.zoom < 0.75) {
    const k = Math.round(clamp((0.75 - CAM.zoom) / 0.45, 0, 1) * 22) / 100, key = 'haze' + CH + (nf > 0.5) + k;
    let g = VE.grad[key];
    if (!g) { VE.grad = {}; g = VE.grad[key] = ctx.createLinearGradient(0, 0, 0, CH * 0.45); g.addColorStop(0, nf > 0.5 ? 'rgba(30,40,90,' + k + ')' : 'rgba(190,210,235,' + k + ')'); g.addColorStop(1, 'rgba(190,210,235,0)'); }   // Part 16: cached, not rebuilt every frame
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH * 0.45);
  }
  const pol = S.city.pollution || 0;
  if (pol > 45) { ctx.fillStyle = 'rgba(150,140,110,' + Math.min(0.1, (pol - 45) / 600) + ')'; ctx.fillRect(0, 0, CW, CH); }   // never greys the screen out
  if (VE.wx.fog > 0.05) {
    const k = Math.round(VE.wx.fog * VE.wx.k * 20) / 20, key = 'fog' + CW + 'x' + CH + k;
    let g = VE.grad[key];
    if (!g) { g = VE.grad[key] = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.15, CW / 2, CH / 2, Math.max(CW, CH) * 0.7); g.addColorStop(0, 'rgba(215,222,232,' + (0.12 * k) + ')'); g.addColorStop(1, 'rgba(215,222,232,' + (0.5 * k) + ')'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  }
}
/* photo mode depth effect: tilt-shift blur bands at the top and bottom of the frame */
function veDepthEffect() {
  if (!VE.depth || !PHOTO.on) return;
  const band = Math.round(CH * 0.22);
  try {
    if ('filter' in ctx) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'blur(' + Math.round(3 * DPR) + 'px)';
      ctx.drawImage(canvas, 0, 0, canvas.width, band * DPR, 0, 0, canvas.width, band * DPR);
      ctx.drawImage(canvas, 0, canvas.height - band * DPR, canvas.width, band * DPR, 0, canvas.height - band * DPR, canvas.width, band * DPR);
      ctx.filter = 'none'; ctx.restore();
    }
  } catch (e) { /* no canvas filters on this WebView */ }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g1 = ctx.createLinearGradient(0, 0, 0, band); g1.addColorStop(0, 'rgba(255,255,255,.10)'); g1.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g1; ctx.fillRect(0, 0, CW, band);
  const g2 = ctx.createLinearGradient(0, CH - band, 0, CH); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(255,255,255,.10)'); ctx.fillStyle = g2; ctx.fillRect(0, CH - band, CW, band);
}

/* ===================================== CINEMATIC CAMERA · CITY TOUR ===================================== */
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function camSnap() { return { x: CAM.x, y: CAM.y, z: CAM.zoom, r: PHOTO.on ? PHOTO.rot : CAM.rot }; }
function cineSetPoint(k) { VE.cinePts = VE.cinePts || {}; VE.cinePts[k] = camSnap(); toast('🎬 Point ' + k + ' set', 'good'); }
function cinePlay(dur) {
  const P = VE.cinePts || {}; if (!P.A || !P.B) { toast('🎬 Set Point A and Point B first', 'bad'); return false; }
  stopCityTour(); VE.cine = { a: P.A, b: P.B, t0: performance.now(), dur: clamp(+dur || 10, 1, 120) * 1000 };
  cancelAnimationFrame(VE.cineRaf); VE.cineRaf = requestAnimationFrame(cineFrame); return true;
}
function cineFrame(now) {
  const c = VE.cine; if (!c) return;
  if (!STARTED) { stopCinematic(); return; }
  const t = clamp((now - c.t0) / c.dur, 0, 1), e = ease(t);
  CAM.tx = null; CAM.ty = null; FX.fly = null;
  CAM.x = c.a.x + (c.b.x - c.a.x) * e; CAM.y = c.a.y + (c.b.y - c.a.y) * e; CAM.zoom = c.a.z + (c.b.z - c.a.z) * e;
  if (PHOTO.on) PHOTO.rot = c.a.r + (c.b.r - c.a.r) * e;
  clampCamera();
  if (t >= 1) { VE.cine = null; toast('🎬 Cinematic finished', ''); return; }
  VE.cineRaf = requestAnimationFrame(cineFrame);
}
function stopCinematic() { if (!VE.cine) return false; VE.cine = null; cancelAnimationFrame(VE.cineRaf); return true; }
/* CITY TOUR: downtown, landmarks, industry, homes and tourism — the camera glides between them on its own */
function cityTourStops() {
  const stops = [], used = new Set(), push = function (b, label) { if (!b || used.has(b.id) || !inMap(b.x, b.y) || (typeof inUnlocked === 'function' && !inUnlocked(b.x, b.y))) return; used.add(b.id); const c = buildingCenter(b); stops.push({ x: clamp(c.x, 0, MAP.W * TILE), y: clamp(c.y, 0, MAP.H * TILE), z: 1.15, label: label }); };
  const L = S.buildings.list.filter(function (b) { return b.built; });
  const tallest = L.slice().sort(function (a, b) { return buildingHeight(b) - buildingHeight(a); })[0]; push(tallest, '🏙️ Downtown');
  L.filter(function (b) { return bdef(b).landmark || b.type === 'townhall' || b.type === 'stadium' || b.type === 'airport'; }).slice(0, 3).forEach(function (b) { push(b, '⭐ ' + bdef(b).name); });
  push(L.find(function (b) { return bdef(b).cat === 'Industry'; }), '🏭 Industry');
  push(L.find(function (b) { return bdef(b).housing && b.level >= 2; }) || L.find(function (b) { return bdef(b).housing; }), '🏠 Residential');
  push(L.find(function (b) { return bdef(b).tour || bdef(b).cat === 'Leisure'; }), '🎡 Tourism');
  if (!stops.length) { const c = cityCentre(); stops.push({ x: c.x, y: c.y, z: 1, label: '🏙️ ' + S.city.name }); }
  return stops;
}
function startCityTour() {
  if (!STARTED) return false;
  stopCinematic();
  VE.tour = { stops: cityTourStops(), i: -1, t0: 0, from: null };
  cancelAnimationFrame(VE.tourRaf); VE.tourRaf = requestAnimationFrame(tourFrame);
  toast('🎥 CITY TOUR — tap the map or press Esc to stop', '');
  return true;
}
function tourFrame(now) {
  const T = VE.tour; if (!T) return;
  if (!STARTED) { stopCityTour(); return; }
  const seg = 5200;
  if (T.i < 0 || now - T.t0 > seg) { T.i++; if (T.i >= T.stops.length) { stopCityTour(); toast('🎥 City tour finished', 'good'); return; } T.t0 = now; T.from = camSnap(); toast(T.stops[T.i].label, ''); }
  const s = T.stops[T.i], t = clamp((now - T.t0) / 2400, 0, 1), e = ease(t);
  CAM.tx = null; CAM.ty = null; FX.fly = null;
  CAM.x = T.from.x + (s.x - T.from.x) * e + Math.sin((now - T.t0) / 3000) * 6 * e; CAM.y = T.from.y + (s.y - T.from.y) * e; CAM.zoom = T.from.z + (s.z - T.from.z) * e;   // drift starts at 0: no jump
  clampCamera();
  VE.tourRaf = requestAnimationFrame(tourFrame);
}
function stopCityTour() { if (!VE.tour) return false; VE.tour = null; cancelAnimationFrame(VE.tourRaf); return true; }
window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('photoHide')) { document.body.classList.remove('photoHide'); e.stopPropagation(); } }, true);
['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (VE.tour && (ev === 'pointerdown' ? e.target === canvas : e.key === 'Escape')) stopCityTour(); if (VE.cine && ev === 'keydown' && e.key === 'Escape') stopCinematic(); }, true); });

/* ===================================== CITY HISTORY (timeline + graphs) ===================================== */
function p15() { if (!S.p15 || typeof S.p15 !== 'object') S.p15 = { hist: [], lastMonth: -1 }; if (!Array.isArray(S.p15.hist)) S.p15.hist = []; return S.p15; }
function roadTileCount() { let n = 0; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i]) n++; return n; }
/* one sample per game month (a city's whole life fits: 600 samples = 50 years) */
function historySample(force) {
  if (!STARTED || !S) return;
  const P = p15(), m = Math.floor(S.clock.gameSec / (SECONDS_PER_MONTH || 86400));
  if (!force && m === P.lastMonth) return;
  P.lastMonth = m;
  let lv = 1; try { lv = avgLandValue(); } catch (e) { lv = 1; }
  P.hist.push({ m: m, y: typeof gameYear === 'function' ? gameYear() : 1, pop: Math.floor(S.city.population), money: Math.round(S.money), budget: Math.round(S.budget), bld: S.buildings.list.length, roads: roadTileCount(), hap: Math.round(S.city.happiness || 0), lv: +lv.toFixed(2) });
  if (P.hist.length > 600) P.hist.splice(0, P.hist.length - 600);
}
const HIST_SERIES = [['pop', '👥 Population', '#4cc9f0', fmt], ['money', '💰 Money', '#ffd166', money], ['bld', '🏢 Buildings', '#f4a261', fmt], ['roads', '🛣️ Roads', '#adb5bd', fmt], ['hap', '😊 Happiness', '#06d6a0', function (v) { return v + '%'; }], ['lv', '💎 Land Value', '#b5179e', function (v) { return '×' + (+v).toFixed(2); }]];
function openCityHistory() {
  if (!STARTED) return;
  historySample(true);
  const H = p15().hist, years = [1, 5, 10, 25], yr = function (y) { return H.find(function (s) { return s.y === y; }) || null; };
  const ev = cityEvolution();
  const cmp = '<table class="veHistTable"><tr><th></th>' + years.map(function (y) { return '<th>Year ' + y + '</th>'; }).join('') + '<th>Now</th></tr>' +
    HIST_SERIES.map(function (s) { const now = H[H.length - 1]; return '<tr><td>' + s[1] + '</td>' + years.map(function (y) { const r = yr(y); return '<td>' + (r ? s[3](r[s[0]]) : '—') + '</td>'; }).join('') + '<td><b>' + s[3](now[s[0]]) + '</b></td></tr>'; }).join('') + '</table>';
  showModal('📈 CITY HISTORY · ' + esc(S.city.name), '<div class="veEvo">' + CITY_TIERS.map(function (t, i) { return '<span class="' + (i < ev.stage ? 'done' : i === ev.stage ? 'on' : '') + '">' + esc(t.name) + '</span>'; }).join('<i>→</i>') + '</div>' +
    '<div class="veHistGrid">' + HIST_SERIES.map(function (s) { return '<div class="veHistCard"><b>' + s[1] + '</b><canvas data-vehist="' + s[0] + '" width="300" height="110"></canvas></div>'; }).join('') + '</div>' +
    '<h3 class="veH3">Year 1 · 5 · 10 · 25</h3>' + cmp + '<p class="small">' + H.length + ' monthly samples · saved with the city.</p>');
  document.querySelectorAll('[data-vehist]').forEach(function (cv) { drawHistGraph(cv, cv.dataset.vehist); });
}
function drawHistGraph(cv, key) {
  const H = p15().hist, s = HIST_SERIES.find(function (x) { return x[0] === key; }), g = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  g.clearRect(0, 0, W, Hh); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, Hh);
  if (H.length < 2) { g.fillStyle = '#8d99ae'; g.font = '12px sans-serif'; g.fillText('Collecting data — one point per game month', 8, Hh / 2); return; }
  let lo = Infinity, hi = -Infinity; H.forEach(function (p) { lo = Math.min(lo, p[key]); hi = Math.max(hi, p[key]); }); if (hi === lo) { hi += 1; lo -= 1; }
  g.strokeStyle = s[2]; g.lineWidth = 2; g.beginPath();
  H.forEach(function (p, i) { const x = 4 + i / (H.length - 1) * (W - 8), y = Hh - 14 - (p[key] - lo) / (hi - lo) * (Hh - 28); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#cfd8e3'; g.font = '11px sans-serif'; g.fillText(s[3](H[H.length - 1][key]), 6, 12); g.fillStyle = '#8d99ae'; g.fillText('Y' + H[0].y + ' → Y' + H[H.length - 1].y, W - 70, Hh - 3);
}

/* ===================================== AMBIENT AUDIO 2.0 (pooled, prioritised) ===================================== */
/* voice limiter: Emergency > UI > Important Event > Vehicle > Environment > Ambient — the lowest priority is dropped first */
const SND_PRIORITY = { emergency: 6, ui: 5, event: 4, sfx: 3, vehicle: 3, env: 2, music: 2, ambient: 1 };
const SND_POOL = { active: 0, max: IS_MOBILE ? 10 : 20 };
(function () {
  const wrapV = function (name) {
    const f0 = SND[name];
    SND[name] = function () {
      if (!this.ctx) return;
      const pr = SND_PRIORITY[this.cur] || 3;
      if (SND_POOL.active >= SND_POOL.max && pr < 5) return;               // full: only UI / emergency sounds still play
      if (SND_POOL.active >= SND_POOL.max * 0.7 && pr <= 1) return;        // ambient chirps yield early
      SND_POOL.active++;
      const dur = (name === 'tone' ? arguments[1] : arguments[0]) || 0.3, delay = (name === 'tone' ? arguments[4] : arguments[3]) || 0;
      setTimeout(function () { SND_POOL.active = Math.max(0, SND_POOL.active - 1); }, (dur + delay) * 1000 + 60);
      return f0.apply(this, arguments);
    };
  };
  wrapV('tone'); wrapV('noise');
})();
/* ambience by what the camera sees: residential = quiet, downtown = traffic + city, industrial = machines, park = nature,
   airport = aircraft; night adds crickets, rain adds the rain bed (SND.setRain). Two looping beds + short pooled events. */
function veAmbientInit() {
  if (VE.ambient || !SND.ctx) return;
  try {
    const c = SND.ctx, mk = function (type, freq, q) {
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = type === 'brown' ? last * 3.5 : w; }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(SND.bus.env || SND.master); src.start();
      return { src: src, g: g };
    };
    const hum = c.createOscillator(), hg = c.createGain(); hum.type = 'sawtooth'; hum.frequency.value = 52; hg.gain.value = 0;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220; hum.connect(hf); hf.connect(hg); hg.connect(SND.bus.env || SND.master); hum.start();
    VE.ambient = { city: mk('brown', 520), wind: mk('white', 900, 0.4), hum: { g: hg }, mix: { city: 0, ind: 0, park: 0, air: 0, res: 0 }, chirpAt: 0 };
  } catch (e) { VE.ambient = null; }
}
function veAmbientTick() {
  if (!SND.ctx || !S || !STARTED) return;
  veAmbientInit(); const A = VE.ambient; if (!A) return;
  const muted = !S.settings.sound || (typeof Lifecycle !== 'undefined' && Lifecycle.state.now === 'background');
  const low = GSET.powerMode === 'battery' ? 0.4 : 1;
  // what is on screen
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH), mix = { city: 0, ind: 0, park: 0, air: 0, res: 0 };
  let n = 0;
  const inView = typeof weBuildingsInView === 'function' ? weBuildingsInView({ x0: tl.x, y0: tl.y, x1: br.x, y1: br.y }, []) : S.buildings.list;   // Part 16: spatial index, not the whole city
  inView.forEach(function (b) {
    const x = b.x * TILE, y = b.y * TILE; if (x < tl.x || x > br.x || y < tl.y || y > br.y) return;
    const d = bdef(b); n++;
    if (d.cat === 'Industry' || d.cat === 'Resources' || d.cat === 'Logistics') mix.ind++; else if (d.cat === 'Commercial' || (d.height || 0) >= 60) mix.city++; else if (d.id === 'park' || d.cat === 'Leisure') mix.park++; else if (d.housing) mix.res++;
    if (d.id === 'airport') mix.air += 6;
  });
  const t = Math.max(1, n), nf = nightFactor(), traffic = clamp((SIM.traffic || 0) / 100, 0, 1);
  const set = function (node, v) { try { node.g.gain.setTargetAtTime(muted ? 0 : v * low, SND.ctx.currentTime, muted ? 0.02 : 0.6); } catch (e) { /* closed */ } };
  set(A.city, (0.012 + 0.03 * traffic) * (mix.city / t + 0.25) * (1 - 0.45 * nf));
  set(A.hum, 0.012 * Math.min(1, mix.ind / t * 2));
  set(A.wind, 0.004 + 0.03 * VE.wx.wind);
  // short pooled events: birds by day in parks, crickets at night, aircraft near airports
  const now = performance.now();
  if (!muted && now > A.chirpAt && SND_POOL.active < SND_POOL.max * 0.5) {
    A.chirpAt = now + (2000 + Math.random() * 4000) / low;
    SND.cur = 'ambient';
    if (nf > 0.6 && (mix.park + mix.res) / t > 0.2) { SND.tone(4200, 0.05, 'sine', 0.012); SND.tone(4200, 0.05, 'sine', 0.012, 0.09); }
    else if (nf < 0.3 && mix.park / t > 0.05 && FX.weather === 'clear') { SND.tone(2600 + Math.random() * 900, 0.08, 'sine', 0.015, 0, 3600); }
    if (mix.air && Math.random() < 0.35) SND.noise(2.4, 0.03, 700);
    SND.cur = 'sfx';
  }
}
/* ===================================== QUALITY PRESETS (developer / admin) ===================================== */
const VE_PRESETS = {
  'MOBILE LOW': { perfMode: 'LOW', veQuality: 'LOW', fpsTarget: '30', particles: 'REDUCED' },
  'MOBILE BALANCED': { perfMode: 'MEDIUM', veQuality: 'MEDIUM', fpsTarget: 'AUTO', particles: 'ON' },
  'MOBILE HIGH': { perfMode: 'HIGH', veQuality: 'HIGH', fpsTarget: '60', particles: 'ON' },
  'DESKTOP HIGH': { perfMode: 'HIGH', veQuality: 'HIGH', fpsTarget: '60', particles: 'ON' },
  'DESKTOP ULTRA': { perfMode: 'ULTRA', veQuality: 'ULTRA', fpsTarget: '60', particles: 'ON' }
};
function vePresetsAllowed() { return BUILD.dev || BUILD.test || (typeof AdminAuth !== 'undefined' && AdminAuth.active()); }
function veApplyPreset(name) {
  const p = VE_PRESETS[name]; if (!p || !vePresetsAllowed()) return false;
  Object.assign(GSET, p); GSET.autoPerfLevel = ''; GSET._rev = (GSET._rev || 0) + 1; saveGSET();
  if (typeof applySettings2 === 'function') applySettings2();
  if (typeof updateFpsCap === 'function') updateFpsCap();
  veComputeTier();
  if (typeof AdminAuth !== 'undefined' && AdminAuth.active()) AdminAuth.record('visualPreset', name, 'applied');
  Log.info('Visual preset ' + name + ' → tier ' + VE.tier); return true;
}

/* ===================================== FRAME / TICK ===================================== */
function veFrame(dt) {
  if (!S) return;
  const t0 = performance.now();
  if (t0 - VE.at > 1000) { VE.at = t0; veGovern(t0); veComputeTier(); if (STARTED) { veOutageTick(); historySample(false); veAmbientTick(); } }
  VE.wxAcc += dt;
  if (VE.wxAcc >= 0.1) { veUpdateWeatherState(VE.wxAcc); VE.wxAcc = 0; }      // weather blend / wet / snow / wind at 10 Hz
  VE.prof.veAcc += performance.now() - t0;                    // the sun is updated by the renderer (once per game minute)
}
/* ===================================== FRAME BUDGET PROFILER (Part 16) ===================================== */
/* 60 FPS = 16.67 ms · 30 FPS = 33.33 ms. Exponential averages per phase; "other" = the rest of the frame interval
   (browser compositing, garbage collection, idle). */
const VE_PROF = { input: 0, sim: 0, ui: 0, render: 0, ve: 0, audio: 0, particles: 0, frame: 0, interval: 0, last: 0, draws: 0, drawsFrame: 0, heap: [], gcGuess: 0 };
function veProfileFrame(input, sim, ui) {
  const P = VE_PROF, a = 0.1, now = performance.now();
  P.input += (input - P.input) * a; P.sim += (sim - P.sim) * a; P.ui += (ui - P.ui) * a;
  P.render = PERF.renderMs || 0; P.frame = PERF.frameMs || 0;
  P.ve += (VE.prof.veAcc - P.ve) * a; VE.prof.veAcc = 0;
  P.audio += ((VE.prof.audioAcc || 0) - P.audio) * a; VE.prof.audioAcc = 0;
  if (P.last) { const iv = now - P.last; P.interval += (iv - P.interval) * a; if (iv > Math.max(50, P.interval * 3)) P.gcGuess++; }   // long pauses with no work of ours = GC / OS
  P.last = now;
  if (VE_DRAW.on) { P.drawsFrame = VE_DRAW.n; VE_DRAW.n = 0; P.draws += (P.drawsFrame - P.draws) * a; }
  VE_DRAW.want = !!((typeof DBG !== 'undefined' && DBG.on) || GSET.veDebug);
  if (VE_DRAW.want !== VE_DRAW.on) veDrawCounter(VE_DRAW.want);
}
/* DRAW CALL counter: canvas draw operations per frame — installed only while the debug overlay is open */
const VE_DRAW = { on: false, want: false, n: 0, orig: null };
function veDrawCounter(on) {
  const names = ['fillRect', 'strokeRect', 'fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'clearRect'];
  if (on && !VE_DRAW.on) { VE_DRAW.orig = {}; names.forEach(function (n) { const f = ctx[n]; VE_DRAW.orig[n] = f; ctx[n] = function () { VE_DRAW.n++; return f.apply(this, arguments); }; }); VE_DRAW.on = true; }
  else if (!on && VE_DRAW.on) { names.forEach(function (n) { if (VE_DRAW.orig[n]) ctx[n] = VE_DRAW.orig[n]; }); VE_DRAW.on = false; VE_DRAW.n = 0; }
}
function veBudgetLine() {
  const P = VE_PROF, f = function (v) { return v.toFixed(2); }, tgt = 1000 / veFpsTarget();
  return 'FRAME BUDGET ' + tgt.toFixed(2) + ' ms (' + veFpsTarget() + ' FPS) · interval ' + f(P.interval) + ' ms · work ' + f(P.frame) + ' ms\n' +
    'input ' + f(P.input) + ' · simulation ' + f(P.sim) + ' · UI ' + f(P.ui) + ' · render ' + f(P.render) + ' (visual engine ' + f(P.ve) + ') · audio ' + f(P.audio) + ' · long pauses (GC/OS) ' + P.gcGuess + '\n' +
    'draw calls ' + (VE_DRAW.on ? Math.round(P.draws) : '—') + ' · lights ' + ((VE.stats.lamps || 0) + (VE.stats.windows || 0)) + ' · shadow casters ' + (VE.stats.shadows || 0) + ' · particles ' + FX.particles.length + '/' + veParticleCap() + ' · drops ' + (FX.dropN || 0) + '/' + FX.drops.length + ' pooled\n' +
    'quality governor: drop ' + VE_GOV.drop + ' · particle step ' + VE_GOV.partStep + (VE_GOV.log.length ? ' · ' + VE_GOV.log[0] : '') + '\n';
}
/* developer overlay (development / test builds only; F3 on desktop already shows the same numbers) */
function veDebugLines() {
  const s = VE.stats;
  return veBudgetLine() + (typeof loadProfLine === 'function' && LOAD_PROF.at ? loadProfLine() + '\n' : '') + 'VISUAL ENGINE tier ' + VE.tier + (GSET.veQuality && GSET.veQuality !== 'AUTO' ? ' (fixed)' : ' (auto)') + ' · ' + VE.sun.phase + ' · sun ' + Math.round(VE.sun.elev * 100) + '% ' + VE.sun.kelvin + 'K\n' +
    'Visible objects ' + s.visible + ' · citizens drawn ' + s.drawnCitizens + ' · lamps ' + s.lamps + ' · lit windows ' + s.windows + '\n' +
    'Loaded chunks ' + (typeof WE !== 'undefined' && WE.ground ? WE.ground.size : 0) + ' · particles ' + FX.particles.length + '/' + veParticleCap() + ' · weather ' + FX.weather + (VE.wx.plan.length ? ' → ' + VE.wx.plan.join(' → ') : '') + ' · wind ' + VE.wx.windLevel + ' · wet ' + Math.round(VE.wx.wet * 100) + '% · snow ' + Math.round(VE.wx.snow * 100) + '%\n';
}
function veMobileDebug() {
  if (!(BUILD.dev || BUILD.test) || !GSET.veDebug || !STARTED) { const el = document.getElementById('veDebug'); if (el) el.remove(); return; }
  let el = document.getElementById('veDebug');
  if (!el) { el = document.createElement('pre'); el.id = 'veDebug'; document.body.appendChild(el); }
  const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : '—';
  el.textContent = 'FPS ' + Math.round(PERF.fps) + ' · frame ' + (PERF.frameMs || 0).toFixed(1) + ' ms · sim ' + (typeof simMsTotal === 'function' ? simMsTotal().toFixed(1) : '?') + ' ms · mem ' + mem + '\n' + 'Vehicles ' + AG.vehicles.length + ' · citizens ' + AG.citizens.length + '\n' + veDebugLines();
}
setInterval(function () { try { veMobileDebug(); } catch (e) { /* debug only */ } }, 500);
window.VisualEngine = VE;
