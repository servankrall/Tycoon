'use strict';
/* BLOCK CITY TYCOON — STATE & SAVE — versioned JSON state, save slots, migration, validation, import/export */
/* ============================ 3. STATE & SAVE ============================ */
let S = null;          // persistent game state (saved as JSON)
const SIM = {          // derived simulation values (recomputed every tick, never saved)
  income: 0, expenses: 0, net: 0, rev: {}, exp: {}, powerGen: 0, powerUse: 0, powerRatio: 1,
  waterGen: 0, waterUse: 0, waterRatio: 1, labor: 0, jobs: 0, employed: 0, unemployment: 0,
  housingCap: 0, demand: {}, supply: {}, dDisp: {}, sDisp: {}, saleMult: {}, goodsProd: 0, goodsUse: 0,
  goodsRatio: 1, goodsCap: 0, exported: 0, traffic: 0, tourists: 0, rpRate: 0, transitCap: 0, riders: 0,
  cov: { fire: 0, police: 0, health: 0 }, hapFactors: [], unpaid: 0, builtTiles: 0, taxIncome: 0,
  companies: {}, visualStopRatio: 0, flood: false
};

/* --- Small utilities --------------------------------------------------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function num(v, def, min, max) {
  v = Number(v);
  if (!isFinite(v)) v = def;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fmt(n, dec) {
  if (!isFinite(n)) n = 0;
  const neg = n < 0; n = Math.abs(n);
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  let s;
  if (i === 0) s = (dec !== undefined ? n.toFixed(dec) : (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString()));
  else s = (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + u[i];
  return (neg ? '-' : '') + s;
}
function money(n, dec) { return (n < 0 ? '-$' : '$') + fmt(Math.abs(n), dec); }
function signMoney(n) { return (n >= 0 ? '+$' : '-$') + fmt(Math.abs(n), Math.abs(n) < 10 ? 2 : undefined); }
function pct(v) { return Math.round(v) + '%'; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

/* --- Prestige helpers (meta survives resets) ---------------------------- */
function ppLevel(id) { return (S && S.meta.ppUpgrades[id]) | 0; }
function costMult() { return (1 + 0.15 * (S ? S.meta.ngLevel : 0)) * (S && S.city && DIFFICULTIES[S.city.difficulty] ? DIFFICULTIES[S.city.difficulty].cost : 1) * ddCostFactor(); }
function newMeta() {
  return { created: Date.now(), ngLevel: 0, prestigeCount: 0, pp: 0, ppUpgrades: {}, skins: ['classic'], crown: false, bestPop: 0, lifetimeRevenue: 0 };
}
function defaultSettings() {
  return {
    sound: true, music: false, quality: IS_MOBILE ? 'LOW' : 'HIGH', autoQuality: true, showFps: false,
    confirm: IS_TOUCH ? 'always' : 'expensive', skin: 'classic', speed: 1,
    layers: defaultLayers(), dashboard: false,
    theme: 'classic', reducedMotion: false, largeText: false, highContrast: false, colorFriendly: false, screenShake: true,
    particleReduce: false, dynDiff: true, bubbles: true, deco: true, gamepad: true,
    minimap: true, dailyReport: true, autoEvolve: false
  };
}
function defaultLayers() { return { terrain: true, zoning: true, road: true, rail: true, power: false, water: false, buildings: true, resources: true }; }
function newAIState(diffId) {
  const out = {};
  const f = 1 / DIFFICULTIES[diffId].cost;
  AI_DEFS.forEach(function (a) { out[a.id] = { cash: (a.kind === 'dev' ? 6000 : 4000) * f, rep: 45 + Math.random() * 15, quality: 0.9 + Math.random() * 0.2, price: 0.95 + Math.random() * 0.15, level: 1, acquired: false, profit: 0, rev: 0 }; });
  return out;
}
function newDiplomacy() { const o = {}; WORLD_CITIES.forEach(function (c) { o[c.id] = { rel: c.rel, agreement: false, tourism: false, giftAt: 0 }; }); return o; }

/* Build a brand-new game state (optionally keeping meta/settings/achievements). */
function defaultState(meta, settings, achievements, lifetime, opts) {
  meta = meta || newMeta();
  opts = opts || {};
  const diffId = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'NORMAL';
  let size = [40, 52, 64].indexOf(opts.size) >= 0 ? opts.size : 40;
  if (meta.ngLevel >= 1) size = size === 40 ? 48 : 64;     // New Game+ brings a bigger map
  const st = {
    version: SAVE_VERSION,
    meta: meta,
    money: DIFFICULTIES[diffId].money + ((meta.ppUpgrades.start | 0) * 2500),
    budget: DIFFICULTIES[diffId].budget + ((meta.ppUpgrades.start | 0) * 2500),
    city: {
      name: (opts.name || 'Block City').slice(0, 32), population: 5, peakPop: 5, happiness: 62, crime: 4, pollution: 0, tax: 10,
      expansion: 0, size: size, seed: opts.seed !== undefined ? (opts.seed >>> 0) % 1000000 : Math.floor(Math.random() * 1000000), roads: '', nature: '',
      zones: '', terrain: '', res: '', difficulty: diffId, sandbox: !!opts.sandbox, mapType: MAP_TYPES[opts.mapType] ? opts.mapType : 'standard',
      tourismUnlocked: false, tourists: 0, traffic: 0, reputation: 50, education: 0, skill: 30, housingPrice: 1, waste: 0, level: 1, emergencyPower: 0
    },
    buildings: { nextId: 1, list: [] },
    workers: { salaryPolicy: 'normal' },
    research: { rp: 0, total: 0 },
    technology: { unlocked: [] },
    companies: { list: {}, stocks: {}, portfolio: {}, tradeProfit: 0 },
    bank: { loans: [], credit: 70, repaid: 0, nextId: 1 },
    transport: { riders: 0 },
    economy: { noise: {}, goodsStock: 0, inventory: {}, prices: {}, deposits: [] },
    market: { price: {}, ads: {}, rep: 50 },
    ai: newAIState(diffId),
    trade: { mode: {}, exportTotal: 0, importTotal: 0 },
    diplomacy: newDiplomacy(),
    contracts: { offers: [], active: [], completed: 0, failed: 0, nextAt: 120, nextId: 1 },
    investors: { nextAt: 300, accepted: 0 },
    space: { stage: 0 },
    events: { active: [], nextCrisisAt: 600, nextDisasterAt: 1800, nextGlobalAt: 900, nextTipAt: 20, nextFireCheck: 60, nextDynAt: 420, hosted: 0, cooldowns: {}, decisions: [], nextUid: 1 },
    statistics: {
      history: { pop: [], rev: [], crime: [], pol: [], emp: [], money: [], inc: [], exp: [], traffic: [], hap: [], prod: [], cons: [], tour: [], edu: [], health: [], cpi: [] },
      totals: lifetime || { revenue: 0, built: 0, spent: 0, disasters: 0, crises: 0, playSec: 0 },
      run: { revenue: 0 }
    },
    achievements: achievements || {},
    quests: { mission: 0, side: {} },
    tutorial: { done: false, dismissed: {} },
    settings: settings || defaultSettings(),
    clock: { gameSec: 6 * 3600, runSec: 0 },
    p5: newP5(),
    lastNet: 0,
    lastSaveTime: Date.now()
  };
  st.p6 = newP6(st.city.seed);
  NPC_STOCKS.forEach(function (s) { st.companies.stocks[s.id] = { price: s.base, hist: [s.base] }; });
  PRODUCT_IDS.forEach(function (p) { st.economy.inventory[p] = 0; st.economy.prices[p] = PRODUCTS[p].base; st.trade.mode[p] = 'auto'; });
  MARKET_SECTORS.forEach(function (m) { st.market.price[m] = 1; });
  return st;
}

/* --- Save slots (SaveManager) ------------------------------------------ */
const SLOT_COUNT = 4;
const ACTIVE_SLOT_KEY = 'bct_active_slot';
function slotKey(n) { return n === 1 ? SAVE_KEY : SAVE_KEY + '_' + n; }
function backupKey(n) { return slotKey(n) + '_backup'; }
function activeSlot() { try { const v = parseInt(Store.getItem(ACTIVE_SLOT_KEY), 10); return v >= 1 && v <= SLOT_COUNT ? v : 1; } catch (e) { return 1; } }
function setActiveSlot(n) { try { Store.setItem(ACTIVE_SLOT_KEY, String(n)); } catch (e) { } }
function slotInfo(n) {
  const d = loadRaw(slotKey(n));
  if (!d || typeof d !== 'object') return { n: n, exists: false, corrupt: d === undefined };
  const c = d.city || {};
  return { n: n, exists: true, name: String(c.name || 'Block City').slice(0, 32), pop: num(c.population, 0), difficulty: c.difficulty || 'NORMAL',
    level: num(c.level, 1) | 0, size: c.size || 40, sandbox: !!c.sandbox, saved: num(d.lastSaveTime, 0), version: d.version | 0,
    playSec: num(d.statistics && d.statistics.totals && d.statistics.totals.playSec, 0, 0, 1e12), seed: num(c.seed, 0) | 0 };
}
function deleteSlot(n) { try { Store.removeItem(slotKey(n)); Store.removeItem(backupKey(n)); } catch (e) { } }

/* Collect the persistent part of a building (runtime fields start with "_"). */
function serializeBuilding(b) {
  return { id: b.id, type: b.type, x: b.x, y: b.y, level: b.level, workers: b.workers, built: b.built,
    progress: +b.progress.toFixed(4), buildTime: b.buildTime, upg: +(b.upg || 0).toFixed(4), upgTime: b.upgTime, damaged: b.damaged,
    repair: b.repair, fire: b.fire, vault: Math.floor(b.vault || 0), visitors: b.visitors | 0, owner: b.owner, skin: b.skin | 0, recipe: b.recipe, rot: b.rot | 0,
    rating: b.nrev ? +b.rating.toFixed(3) : 0, nrev: b.nrev | 0, health: b.health === undefined ? undefined : +b.health.toFixed(2), closed: b.closed || 0,
    discount: b.discount ? 1 : 0, su: b.su ? { name: b.su.name, stage: b.su.stage, prog: +b.su.prog.toFixed(4), age: Math.floor(b.su.age), value: Math.round(b.su.value) } : undefined };
}

function buildSaveObject() {
  if (typeof RNG !== 'undefined') RNG.sync();
  const o = {};
  for (const k in S) { if (k !== 'buildings' && k !== 'debugUnlockAll' && k.charAt(0) !== '_') o[k] = S[k]; }
  o.buildings = { nextId: S.buildings.nextId, list: S.buildings.list.map(serializeBuilding) };
  o.city = Object.assign({}, S.city, { roads: encodeGrid(MAP.roads), nature: encodeGrid(MAP.nature), zones: encodeGrid(MAP.zone), terrain: encodeGrid(MAP.terrain), res: encodeGrid(MAP.res) });
  o.version = SAVE_VERSION;
  o.lastSaveTime = Date.now();
  // Save 2.0 header + citizens (world, economy, buildings, quests and achievements are the other sections)
  o.citizens = serializeCitizens();
  o.vehicles = serializeVehicles();
  o.header = saveHeader();
  o.lastNet = Math.max(0, SIM.pNet || 0);
  o.lastBudgetNet = Math.max(0, SIM.bNet || 0);
  return o;
}

/* Save 2.0 header (v7): what the file contains and where each section lives in the JSON. */
function saveHeader() {
  return {
    version: SAVE_VERSION, saveVersion: SAVE_VERSION, gameVersion: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '1.0.0',
    timestamp: new Date().toISOString(), seed: seedLabel(), citySeed: seedLabel(), city: S.city.name, cityName: S.city.name,
    slot: S.slot || 1, playSec: Math.floor(S.statistics.totals.playSec), population: Math.floor(S.city.population),
    sections: {
      player: ['money', 'meta', 'p5.score'], economy: ['budget', 'economy', 'market', 'trade', 'bank', 'p6.econ'], citizens: ['citizens'], buildings: ['buildings'],
      roads: ['city.roads'], vehicles: ['vehicles'], companies: ['companies', 'ai'], stocks: ['companies.stocks', 'p6.stocks'], research: ['research', 'technology', 'p6.future'],
      quests: ['quests', 'p6.dq', 'p5.challenges'], achievements: ['achievements'], statistics: ['statistics', 'p6.reports'], settings: ['settings']
    }
  };
}
/* Vehicles in transit (logistics trucks, tankers, garbage trucks, buses) keep their cargo and destination across saves.
   Private cars and emergency vehicles are not stored: citizens and incidents re-create them. */
const SAVED_VEHICLE_TYPES = ['truck', 'tanker', 'garbage', 'bus'];
function serializeVehicles() {
  if (typeof AG === 'undefined' || !AG.vehicles) return [];
  return AG.vehicles.filter(function (v) { return SAVED_VEHICLE_TYPES.indexOf(v.type) >= 0 && v.path && v.dest && v.dest.id; }).slice(0, 300).map(function (v) {
    return { type: v.type, at: v.path[Math.min(v.seg, v.path.length - 1)] | 0, dest: v.dest.id, route: v.route === undefined ? undefined : v.route,
      cargo: v.cargo ? { item: String(v.cargo.item).slice(0, 16), qty: Math.round(num(v.cargo.qty, 0, 0, 1e6)), from: String(v.cargo.from || '').slice(0, 30) } : null };
  });
}
function restoreVehicles(raw) {
  if (!Array.isArray(raw)) return 0;
  let n = 0;
  raw.slice(0, 300).forEach(function (r) {
    try {
      if (!r || SAVED_VEHICLE_TYPES.indexOf(r.type) < 0 || !MAP.byId.has(r.dest)) return;
      const dest = MAP.byId.get(r.dest), at = num(r.at, -1) | 0;
      if (at < 0 || at >= MAP.W * MAP.H || !MAP.roads[at] || dest._entry < 0) return;
      const opts = { ambient: r.type !== 'bus', dest: dest };
      if (r.route !== undefined) opts.route = num(r.route, 0, 0, 1e6) | 0;
      if (r.cargo && typeof r.cargo === 'object') opts.cargo = { item: String(r.cargo.item || 'goods').slice(0, 16), qty: num(r.cargo.qty, 0, 0, 1e6), from: String(r.cargo.from || '').slice(0, 30) };
      if (makeVehicle(r.type, roadPath(at, dest._entry), opts)) n++;
    } catch (e) { /* one broken vehicle never blocks loading */ }
  });
  return n;
}

/* SAFE SAVE: 1. build state → 2. validate → 3. serialize (+ round-trip check) → 4. backup previous → 5. write main */
function validateSaveObject(o) {
  const errs = [];
  if (!o || typeof o !== 'object') return ['not an object'];
  if (o.version !== SAVE_VERSION) errs.push('version');
  ['money', 'budget'].forEach(function (k) { if (typeof o[k] !== 'number' || !isFinite(o[k]) || o[k] < 0 || o[k] > MONEY_CAP) errs.push(k); });
  if (!o.city || typeof o.city !== 'object' || !isFinite(o.city.population) || o.city.population < 0) errs.push('city');
  if (!o.buildings || !Array.isArray(o.buildings.list)) errs.push('buildings');
  else o.buildings.list.forEach(function (b, i) { if (!BUILDINGS[b.type] || !isFinite(b.x) || !isFinite(b.y)) errs.push('building#' + i); });
  if (!o.p5 || typeof o.p5 !== 'object') errs.push('p5');
  if (!o.p6 || typeof o.p6 !== 'object') errs.push('p6');
  if (!Array.isArray(o.citizens)) errs.push('citizens');
  if (!Array.isArray(o.vehicles)) errs.push('vehicles');
  if (!o.header || o.header.saveVersion !== SAVE_VERSION) errs.push('header');
  return errs;
}
function saveGame(silent) {
  try {
    const obj = buildSaveObject();                          // 1. state
    const errs = validateSaveObject(obj);                   // 2. validate
    if (errs.length) { logSaveError('Save validation failed: ' + errs.slice(0, 5).join(', ')); if (!silent) toast('⚠️ Save blocked: invalid data (' + errs[0] + ')', 'bad'); return false; }
    const json = JSON.stringify(obj);                       // 3. serialize
    const back = JSON.parse(json);
    if (!back || back.version !== SAVE_VERSION || back.buildings.list.length !== obj.buildings.list.length) throw new Error('round-trip check failed');
    const slot = S.slot || 1;
    const prev = Store.getItem(slotKey(slot));
    if (prev) Store.setItem(backupKey(slot), prev);  // 4. backup
    Store.setItem(slotKey(slot), json);              // 5. main save
    setActiveSlot(slot);
    S.lastSaveTime = Date.now(); S._saveBytes = json.length;
    if (!silent) toast('💾 Game saved', 'good');
    return true;
  } catch (e) {
    logSaveError(e && e.message);
    if (!silent) toast('⚠️ Could not save (storage full or blocked)', 'bad');
    return false;
  }
}
function logSaveError(m) { if (typeof logError === 'function') logError('Save', m); }
function restoreBackup() {
  const slot = S.slot || 1;
  const bk = loadRaw(backupKey(slot));
  if (!bk) return false;
  try { sanitizeState(migrateSave(JSON.parse(JSON.stringify(bk)))); } catch (e) { return false; }
  try { Store.setItem(slotKey(slot), JSON.stringify(bk)); } catch (e) { return false; }
  return true;
}

/* --- Save migration: a table of steps (v1 → v2 → v3 → v4 → v5 → …). Future versions add one entry. --- */
const MIGRATIONS = [
  { from: 1, to: 2, run: function (d) { return migrateV1toV2(d); } },
  { from: 2, to: 3, run: function (d) { return migrateV2toV3(d); } },
  { from: 3, to: 4, run: function (d) { return migrateV3toV4(d); } },
  { from: 4, to: 5, run: function (d) { return migrateV4toV5(d); } },
  { from: 5, to: 6, run: function (d) { return migrateV5toV6(d); } },
  { from: 6, to: 7, run: function (d) { return migrateV6toV7(d); } }
];
function migrateSave(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Invalid save');
  let v = d.version | 0;
  if (!v) v = 1;
  if (v > SAVE_VERSION) throw new Error('Save is from a newer version (v' + v + ')');
  let guard = 0;
  while (v < SAVE_VERSION && guard++ < 20) {
    const step = MIGRATIONS.find(function (m) { return m.from === v; });
    if (!step) throw new Error('No migration from v' + v);
    d = step.run(d); v = step.to; d.version = v;
  }
  d.version = SAVE_VERSION;
  return d;
}
/* v4 = ULTRA CITY SIMULATION (Part 4). v5 adds Part 5 systems (story, score, challenges…) */
/* v6 = MASTER SIMULATION ENGINE: inflation, road types, stock market, dynamic quests, citizens in the save */
/* v7 = DESKTOP EDITION 1.0.0: Save 2.0 header gains saveVersion / gameVersion / citySeed / cityName, vehicles in transit are stored */
function migrateV6toV7(o) {
  o.version = 7;
  o.vehicles = Array.isArray(o.vehicles) ? o.vehicles : [];
  const h = (o.header && typeof o.header === 'object') ? o.header : {};
  o.header = { version: 7, saveVersion: 7, gameVersion: '1.0.0', timestamp: h.timestamp || new Date(num(o.lastSaveTime, Date.now())).toISOString(),
    seed: h.seed, citySeed: h.seed, city: h.city || (o.city && o.city.name), cityName: h.city || (o.city && o.city.name), migratedFrom: 6 };
  return o;
}
function migrateV5toV6(o) {
  o.version = 6;
  o.p6 = newP6(num(o.city && o.city.seed, 1));
  o.citizens = [];
  return o;
}
function migrateV4toV5(o) {
  o.version = 5;
  o.p5 = newP5();
  o.p5._ffPending = true;      // story chapters already achieved are fast-forwarded after load
  return o;
}
/* v1 = original single-screen tycoon (money/totalEarned/prestigeCount/buildings map) */
function migrateV1toV2(o) {
  const legacyMoney = num(o.money, 0, 0, 1e9);
  return {
    version: 2,
    money: Math.min(legacyMoney, 5000) + 100,
    population: 5,
    prestigePoints: num(o.prestigeCount, 0, 0, 100),
    achievementsLegacy: o.achievements ? Object.keys(o.achievements).length : 0,
    settings: { sound: o.settings ? o.settings.sound !== false : true, music: o.settings ? !!o.settings.music : false },
    legacy: true
  };
}
/* v2 = flat format (money, population, tax, buildings[], tech[], research) */
function migrateV2toV3(o) {
  const meta = newMeta();
  meta.pp = num(o.prestigePoints, 0, 0, 1e6);
  const st = defaultState(meta, Object.assign(defaultSettings(), o.settings || {}));
  st.money = num(o.money, 100, 0, MONEY_CAP);
  st.city.population = num(o.population, 5, 0, 1e7);
  st.city.tax = num(o.tax, 10, 0, MAX_TAX);
  if (Array.isArray(o.buildings)) st.buildings.list = o.buildings;
  if (Array.isArray(o.tech)) st.technology.unlocked = o.tech;
  st.research.rp = num(o.research, 0, 0, 1e9);
  st.migratedFrom = o.legacy ? 1 : 2;
  return st;
}

/* v3 = PRO Edition (Part 3). v4 adds budget, layers, resources, AI companies, trade... */
function migrateV3toV4(o) {
  o.version = 4;
  o.budget = 5000 + num(o.city && o.city.population, 0, 0, 1e7) * 2;
  o.city = o.city || {};
  o.city.difficulty = 'NORMAL';
  o._part4Gen = true;       // terrain, resources & town hall are generated for the existing map on load
  return o;
}

/* --- Validation: repair anything that could break the game -------------- */
function sanitizeState(d) {
  const meta = Object.assign(newMeta(), d.meta || {});
  meta.ngLevel = num(meta.ngLevel, 0, 0, 20) | 0;
  meta.prestigeCount = num(meta.prestigeCount, 0, 0, 1e4) | 0;
  meta.pp = num(meta.pp, 0, 0, 1e7);
  meta.ppUpgrades = (meta.ppUpgrades && typeof meta.ppUpgrades === 'object') ? meta.ppUpgrades : {};
  PRESTIGE_UPGRADES.forEach(function (u) { meta.ppUpgrades[u.id] = num(meta.ppUpgrades[u.id], 0, 0, u.max) | 0; });
  for (const k in meta.ppUpgrades) if (!PRESTIGE_UPGRADES.some(function (u) { return u.id === k; })) delete meta.ppUpgrades[k];
  meta.skins = Array.isArray(meta.skins) ? meta.skins.filter(function (s) { return ['classic', 'neon', 'gold'].indexOf(s) >= 0; }) : ['classic'];
  if (meta.skins.indexOf('classic') < 0) meta.skins.unshift('classic');

  const base = defaultState(meta, Object.assign(defaultSettings(), d.settings || {}), null, null);
  const st = base;
  st.meta = meta;
  st.money = num(d.money, 100, 0, MONEY_CAP);

  // City
  const c = d.city || {};
  st.city.size = [40, 48, 52, 64].indexOf(c.size) >= 0 ? c.size : (meta.ngLevel >= 1 ? 48 : 40);
  st.city.seed = num(c.seed, st.city.seed) | 0;
  st.city.population = num(c.population, 5, 0, 1e7);
  st.city.peakPop = num(c.peakPop, st.city.population, 0, 1e7);
  st.city.happiness = num(c.happiness, 60, 0, 100);
  st.city.crime = num(c.crime, 5, 0, 100);
  st.city.pollution = num(c.pollution, 0, 0, 100);
  st.city.tax = Math.round(num(c.tax, 10, 0, MAX_TAX));
  st.city.expansion = num(c.expansion, 0, 0, maxExpansionFor(st.city.size)) | 0;
  st.city.tourismUnlocked = !!c.tourismUnlocked;
  st.city.tourists = num(c.tourists, 0, 0, 1e7);
  st.city.traffic = num(c.traffic, 0, 0, 100);
  st.city.roads = typeof c.roads === 'string' ? c.roads : '';
  st.city.nature = typeof c.nature === 'string' ? c.nature : '';

  // Simple sub-objects
  st.workers.salaryPolicy = (d.workers && ['low', 'normal', 'high'].indexOf(d.workers.salaryPolicy) >= 0) ? d.workers.salaryPolicy : 'normal';
  st.research.rp = num(d.research && d.research.rp, 0, 0, 1e12);
  st.research.total = num(d.research && d.research.total, 0, 0, 1e13);
  const techs = (d.technology && Array.isArray(d.technology.unlocked)) ? d.technology.unlocked : [];
  st.technology.unlocked = techs.filter(function (t, i) { return TECHS[t] && techs.indexOf(t) === i; });

  // Companies & stocks
  const cp = d.companies || {};
  COMPANY_DEFS.forEach(function (cd) {
    const src = cp.list && cp.list[cd.id];
    if (src && typeof src === 'object') {
      st.companies.list[cd.id] = {
        level: num(src.level, 1, 1, 10) | 0, xp: num(src.xp, 0, 0, 1e15), own: num(src.own, 1, 0.5, 1),
        price: num(src.price, 1, 0.01, 1e9), hist: Array.isArray(src.hist) ? src.hist.filter(isFinite).slice(-120) : [],
        products: num(src.products, 0, 0, 4) | 0, founded: num(src.founded, Date.now())
      };
    }
  });
  NPC_STOCKS.forEach(function (s) {
    const src = cp.stocks && cp.stocks[s.id];
    st.companies.stocks[s.id] = { price: num(src && src.price, s.base, 0.5, 1e6), hist: (src && Array.isArray(src.hist)) ? src.hist.filter(isFinite).slice(-120) : [s.base] };
  });
  if (cp.portfolio) for (const id in cp.portfolio) {
    if (!NPC_STOCKS.some(function (s) { return s.id === id; })) continue;
    const p = cp.portfolio[id];
    const q = num(p && p.qty, 0, 0, 1e9) | 0;
    if (q > 0) st.companies.portfolio[id] = { qty: q, cost: num(p.cost, 0, 0, 1e15) };
  }
  st.companies.tradeProfit = num(cp.tradeProfit, 0, -1e15, 1e15);

  // Bank
  const bk = d.bank || {};
  st.bank.credit = num(bk.credit, 70, 0, 100);
  st.bank.repaid = num(bk.repaid, 0, 0, 1e6) | 0;
  st.bank.nextId = num(bk.nextId, 1, 1, 1e9) | 0;
  st.bank.loans = (Array.isArray(bk.loans) ? bk.loans : []).map(function (l) {
    return { id: num(l.id, st.bank.nextId++, 0) | 0, principal: num(l.principal, 0, 0, 1e12), total: num(l.total, 0, 0, 1e12),
      remaining: num(l.remaining, 0, 0, 1e12), perSec: num(l.perSec, 1, 0.0001, 1e10), rate: num(l.rate, 0.05, 0, 1) };
  }).filter(function (l) { return l.remaining > 0.01; }).slice(0, 5);

  st.economy.goodsStock = num(d.economy && d.economy.goodsStock, 0, 0, 1e12);
  if (d.economy && d.economy.noise) SECTORS.forEach(function (s) { st.economy.noise[s] = num(d.economy.noise[s], 1, 0.8, 1.2); });

  // Events (only known ids survive)
  const ev = d.events || {};
  ['nextCrisisAt', 'nextDisasterAt', 'nextGlobalAt', 'nextTipAt', 'nextFireCheck'].forEach(function (k) { st.events[k] = num(ev[k], st.events[k], 0, 1e12); });
  st.events.hosted = num(ev.hosted, 0, 0, 1e6) | 0;
  st.events.cooldowns = {};
  if (ev.cooldowns) GLOBAL_EVENTS.forEach(function (g) { if (ev.cooldowns[g.id]) st.events.cooldowns[g.id] = num(ev.cooldowns[g.id], 0, 0, 1e12); });
  st.events.active = (Array.isArray(ev.active) ? ev.active : []).filter(function (a) {
    return a && ((a.kind === 'crisis' && CRISES.some(function (x) { return x.id === a.id; })) ||
      (a.kind === 'disaster' && DISASTERS.some(function (x) { return x.id === a.id; })) ||
      (a.kind === 'global' && GLOBAL_EVENTS.some(function (x) { return x.id === a.id; })));
  }).map(function (a) { return { kind: a.kind, id: a.id, ends: num(a.ends, 0, 0, 1e12), start: num(a.start, 0, 0, 1e12) }; });

  // Statistics
  const sd = d.statistics || {};
  const tot = sd.totals || {};
  ['revenue', 'built', 'spent', 'disasters', 'crises', 'playSec'].forEach(function (k) { st.statistics.totals[k] = num(tot[k], 0, 0, 1e18); });
  st.statistics.run.revenue = num(sd.run && sd.run.revenue, 0, 0, 1e18);
  Object.keys(st.statistics.history).forEach(function (k) {
    const h = sd.history && Array.isArray(sd.history[k]) ? sd.history[k] : [];
    st.statistics.history[k] = h.map(Number).filter(isFinite).slice(-150);
  });

  // Achievements / quests / tutorial
  st.achievements = {};
  if (d.achievements) ACHIEVEMENTS.forEach(function (a) { if (d.achievements[a.id]) st.achievements[a.id] = 1; });
  const q = d.quests || {};
  st.quests.mission = num(q.mission, 0, 0, MISSIONS.length) | 0;
  st.quests.side = {};
  if (q.side) SIDE_QUESTS.forEach(function (sq) { if (q.side[sq.id]) st.quests.side[sq.id] = 1; });
  st.tutorial.done = !!(d.tutorial && d.tutorial.done);

  // Settings
  const se = st.settings;
  if (!QUALITY_PRESETS[se.quality]) se.quality = 'MEDIUM';
  if (['always', 'expensive', 'never'].indexOf(se.confirm) < 0) se.confirm = 'expensive';
  if (meta.skins.indexOf(se.skin) < 0) se.skin = 'classic';
    se.sound = se.sound !== false; se.music = !!se.music; se.autoQuality = se.autoQuality !== false; se.showFps = !!se.showFps;

  st.clock.gameSec = num(d.clock && d.clock.gameSec, 6 * 3600, 0, 1e12);
  st.clock.runSec = num(d.clock && d.clock.runSec, 0, 0, 1e12);
  st.lastNet = num(d.lastNet, 0, 0, 1e12);
  st.lastSaveTime = num(d.lastSaveTime, Date.now(), 0);
  st.migratedFrom = d.migratedFrom;

  // --- Part 4 systems ---
  st.budget = num(d.budget, st.budget, 0, MONEY_CAP);
  st.city.name = (typeof c.name === 'string' && c.name.trim()) ? c.name.trim().slice(0, 32) : 'Block City';
  st.city.difficulty = DIFFICULTIES[c.difficulty] ? c.difficulty : 'NORMAL';
  st.city.sandbox = !!c.sandbox;
  st.city.reputation = num(c.reputation, 50, 0, 100);
  st.city.education = num(c.education, 0, 0, 100);
  st.city.skill = num(c.skill, 30, 0, 100);
  st.city.housingPrice = num(c.housingPrice, 1, 0.3, 4);
  st.city.waste = num(c.waste, 0, 0, 1e9);
  st.city.level = num(c.level, 1, 1, 20) | 0;
  st.city.emergencyPower = num(c.emergencyPower, 0, 0, 1e6);
  st.city.zonedByPlayer = num(c.zonedByPlayer, 0, 0, 1e7) | 0;
  st.city.zones = typeof c.zones === 'string' ? c.zones : '';
  st.city.terrain = typeof c.terrain === 'string' ? c.terrain : '';
  st.city.res = typeof c.res === 'string' ? c.res : '';
  const eco = d.economy || {};
  PRODUCT_IDS.forEach(function (p) {
    st.economy.inventory[p] = num(eco.inventory && eco.inventory[p], 0, 0, 1e9);
    st.economy.prices[p] = num(eco.prices && eco.prices[p], PRODUCTS[p].base, PRODUCTS[p].base * 0.2, PRODUCTS[p].base * 5);
  });
  st.economy.deposits = (Array.isArray(eco.deposits) ? eco.deposits : []).filter(function (x) { return x && RESOURCE_TYPES[x.type]; }).slice(0, 90).map(function (x) {
    return { type: x.type, amount: num(x.amount, 0, 0, 1e7), max: num(x.max, 1, 1, 1e7), cx: num(x.cx, 0) | 0, cy: num(x.cy, 0) | 0 };
  });
  const mk = d.market || {};
  MARKET_SECTORS.forEach(function (m) { const v = mk.price && mk.price[m]; st.market.price[m] = [0.8, 1, 1.2, 1.4].indexOf(v) >= 0 ? v : 1; });
  if (mk.ads) MARKET_SECTORS.forEach(function (m) { if (mk.ads[m]) st.market.ads[m] = num(mk.ads[m], 0, 0, 1e12); });
  st.market.rep = num(mk.rep, 50, 0, 100);
  AI_DEFS.forEach(function (a) {
    const src = d.ai && d.ai[a.id]; if (!src) return;
    const t = st.ai[a.id];
    t.cash = num(src.cash, t.cash, 0, 1e15); t.rep = num(src.rep, 50, 0, 100); t.quality = num(src.quality, 1, 0.6, 1.6);
    t.price = num(src.price, 1, 0.7, 1.5); t.level = num(src.level, 1, 1, 10) | 0; t.acquired = !!src.acquired;
  });
  const tr = d.trade || {};
  PRODUCT_IDS.forEach(function (p) { const m = tr.mode && tr.mode[p]; st.trade.mode[p] = ['auto', 'export', 'import', 'off'].indexOf(m) >= 0 ? m : 'auto'; });
  st.trade.exportTotal = num(tr.exportTotal, 0, 0, 1e18); st.trade.importTotal = num(tr.importTotal, 0, 0, 1e18);
  WORLD_CITIES.forEach(function (wc) {
    const src = d.diplomacy && d.diplomacy[wc.id]; if (!src) return;
    st.diplomacy[wc.id] = { rel: num(src.rel, wc.rel, -100, 100), agreement: !!src.agreement, tourism: !!src.tourism, giftAt: num(src.giftAt, 0, 0, 1e12) };
  });
  const ct = d.contracts || {};
  const vContract = function (x) {
    if (!x || !PRODUCTS[x.item]) return null;
    return { id: num(x.id, 0) | 0, item: x.item, qty: num(x.qty, 100, 1, 1e8), delivered: num(x.delivered, 0, 0, 1e8), reward: num(x.reward, 0, 0, 1e13),
      deadline: num(x.deadline, 0, 0, 1e12), expires: num(x.expires, 0, 0, 1e12), dur: num(x.dur, 300, 30, 3600), from: String(x.from || 'Client').slice(0, 40), city: WORLD_CITIES.some(function (w) { return w.id === x.city; }) ? x.city : null };
  };
  st.contracts.offers = (Array.isArray(ct.offers) ? ct.offers : []).map(vContract).filter(Boolean).slice(0, 3);
  st.contracts.active = (Array.isArray(ct.active) ? ct.active : []).map(vContract).filter(Boolean).slice(0, 3);
  st.contracts.completed = num(ct.completed, 0, 0, 1e6) | 0; st.contracts.failed = num(ct.failed, 0, 0, 1e6) | 0;
  st.contracts.nextAt = num(ct.nextAt, 120, 0, 1e12); st.contracts.nextId = num(ct.nextId, 1, 1, 1e9) | 0;
  st.investors.nextAt = num(d.investors && d.investors.nextAt, 300, 0, 1e12); st.investors.accepted = num(d.investors && d.investors.accepted, 0, 0, 1e6) | 0;
  st.space.stage = num(d.space && d.space.stage, 0, 0, SPACE_STAGES.length) | 0;
  st.events.nextDynAt = num(ev.nextDynAt, 420, 0, 1e12);
  st.events.nextUid = num(ev.nextUid, 1, 1, 1e9) | 0;
  st.events.decisions = (Array.isArray(ev.decisions) ? ev.decisions : []).filter(function (x) { return x && DECISION_TYPES[x.type]; }).slice(0, 5).map(function (x) {
    return { uid: num(x.uid, st.events.nextUid++) | 0, type: x.type, data: (x.data && typeof x.data === 'object') ? x.data : {}, expires: num(x.expires, 0, 0, 1e12) };
  });
  (Array.isArray(ev.active) ? ev.active : []).forEach(function (a) {
    if (a && a.kind === 'dyn' && DYN_EVENTS.some(function (x) { return x.id === a.id; })) st.events.active.push({ kind: 'dyn', id: a.id, ends: num(a.ends, 0, 0, 1e12), start: num(a.start, 0, 0, 1e12), choice: typeof a.choice === 'string' ? a.choice.slice(0, 20) : '' });
  });
  se.layers = Object.assign(defaultLayers(), (d.settings && d.settings.layers) || {});
  for (const k in se.layers) se.layers[k] = !!se.layers[k];
  se.dashboard = !!(d.settings && d.settings.dashboard);
  st.lastBudgetNet = num(d.lastBudgetNet, 0, 0, 1e12);
  st._part4Gen = !!d._part4Gen;

  // --- Part 5 systems ---
  st.p5 = sanitizeP5(d.p5);
  st.p6 = sanitizeP6(d.p6, st.city.seed);
  st.city.mapType = MAP_TYPES[c.mapType] ? c.mapType : 'standard';
  st._rawCitizens = Array.isArray(d.citizens) ? d.citizens.slice(0, 400) : null;
  st._rawVehicles = Array.isArray(d.vehicles) && d.vehicles.length ? d.vehicles.slice(0, 300) : null;
  ['minimap', 'dailyReport'].forEach(function (k) { se[k] = se[k] !== false; }); se.autoEvolve = !!se.autoEvolve;
  if (d.p5 && d.p5._ffPending) st.p5._ff = true;
  se.theme = ['classic', 'neon', 'dark', 'future', 'golden', 'aurora', 'sunset'].indexOf(se.theme) >= 0 ? se.theme : 'classic';
  ['reducedMotion', 'largeText', 'highContrast', 'colorFriendly', 'particleReduce'].forEach(function (k) { se[k] = !!se[k]; });
  ['screenShake', 'dynDiff', 'bubbles', 'deco', 'gamepad'].forEach(function (k) { se[k] = se[k] !== false; });
  se.speed = SIM_SPEEDS.indexOf(se.speed) >= 0 ? se.speed : 1;

  // Buildings are validated later against the map (bounds, overlaps, uniques)
  st.buildings.nextId = num(d.buildings && d.buildings.nextId, 1, 1, 1e9) | 0;
  st._rawBuildings = (d.buildings && Array.isArray(d.buildings.list)) ? d.buildings.list : [];
  return st;
}

/* Validate buildings against the map: unknown types, invalid levels,
   out-of-bounds, overlapping / duplicate buildings are repaired or dropped. */
function validateBuildings(raw) {
  const seenIds = {}; const uniques = {}; let maxId = 0; let dropped = 0; let tmp = 0;
  S.buildings.list = [];
  raw.forEach(function (r) {
    if (!r || typeof r !== 'object') { dropped++; return; }
    const d0 = BUILDINGS[r.type];
    if (!d0) { dropped++; return; }
    const rot = clamp(num(r.rot, 0) | 0, 0, 3);
    const d = fpDef(d0, rot);
    const x = num(r.x, -1) | 0, y = num(r.y, -1) | 0;
    if (x < 0 || y < 0 || x + d.w > MAP.W || y + d.h > MAP.H) { dropped++; return; }
    if (d.unique && uniques[d.id]) { dropped++; return; }
    if (!inUnlocked(x, y) || !inUnlocked(x + d.w - 1, y + d.h - 1)) { dropped++; return; }
    // Overlap check (duplicate buildings on same tiles)
    for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
      const i = yy * MAP.W + xx;
      if (MAP.occ[i] || MAP.nature[i] === 2) { dropped++; return; }
    }
    let id = num(r.id, 0) | 0;
    if (id <= 0 || seenIds[id]) id = -(++tmp);   // temporary id, fixed below
    const b = makeBuilding(d.id, x, y, id);
    b.rot = rot;
    b.level = clamp(num(r.level, 1) | 0, 1, MAX_LEVEL);
    b.workers = clamp(num(r.workers, d.workers) | 0, 0, d.maxW);
    b.built = r.built !== false;
    b.progress = num(r.progress, 1, 0, 1);
    b.buildTime = num(r.buildTime, 5, 1, 600);
    b.upg = b.level < MAX_LEVEL ? num(r.upg, 0, 0, 1) : 0;
    b.upgTime = num(r.upgTime, 5, 1, 600);
    b.damaged = r.damaged ? 1 : 0;
    b.repair = num(r.repair, 0, 0, 1000);
    b.fire = num(r.fire, 0, 0, 120);
    b.vault = num(r.vault, 0, 0, 1e15);
    b.visitors = num(r.visitors, 0, 0, 1e9) | 0;
    b.owner = (r.owner === 'player' || r.owner === 'city' || (typeof r.owner === 'string' && S.ai[r.owner])) ? r.owner : (d.public ? 'city' : 'player');
    b.skin = clamp(num(r.skin, 0) | 0, 0, BUILDING_SKINS.length - 1);
    b.recipe = d.recipes ? (d.recipes.indexOf(r.recipe) >= 0 ? r.recipe : d.recipes[0]) : null;
    b.rot = rot;
    if (r.nrev > 0) { b.nrev = clamp(num(r.nrev, 0) | 0, 0, 200); b.rating = num(r.rating, 3, 1, 5); }
    if (r.health !== undefined && r.health !== null) b.health = num(r.health, 60, 0, 100);
    b.closed = num(r.closed, 0, 0, 9e15);
    b.discount = !!r.discount;
    if (r.su && d.id === 'startup') b.su = { name: String(r.su.name || 'Startup').replace(/[<>]/g, '').slice(0, 24), stage: clamp(num(r.su.stage, 0) | 0, 0, 3), prog: num(r.su.prog, 0, 0, 1), age: num(r.su.age, 0, 0, 1e12), value: num(r.su.value, 20000, 0, 1e13) };
    if (b.built) b.progress = 1;
    seenIds[b.id] = 1; maxId = Math.max(maxId, b.id);
    if (d.unique) uniques[d.id] = 1;
    addBuildingToMap(b);
  });
  // Assign ids to buildings that had invalid/duplicate ids
  S.buildings.list.forEach(function (b) { if (b.id < 0) { b.id = ++maxId; } });
  S.buildings.nextId = Math.max(S.buildings.nextId, maxId + 1);
  rebuildOcc();
  return dropped;
}

function loadRaw(key) {
  try {
    const raw = Store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return undefined; }   // undefined = corrupted
}

/* Load (with fallbacks): main save → backup → legacy saves → new game */
function loadGame(slot) {
  slot = slot || activeSlot();
  const notes = [];
  let data = loadRaw(slotKey(slot));
  let st = null;
  const tryUse = function (d, label) {
    if (!d) return false;
    try { st = sanitizeState(migrateSave(d)); return true; }
    catch (e) { notes.push(label + ' save was corrupted.'); return false; }
  };
  if (data === undefined) notes.push('Main save was corrupted.');
  if (!tryUse(data, 'Main')) {
    const bk = loadRaw(backupKey(slot));
    if (tryUse(bk, 'Backup')) notes.push('Restored from backup save.');
    else if (slot === 1) {
      for (let i = 0; i < LEGACY_SAVE_KEYS.length && !st; i++) {
        const lg = loadRaw(LEGACY_SAVE_KEYS[i]);
        if (lg && tryUse(lg, 'Legacy')) notes.push('Legacy save converted to PRO Edition (v' + SAVE_VERSION + ').');
      }
    }
  }
  const isNew = !st;
  if (!st) st = defaultState();
  S = st;
  S.slot = slot;
  initMap(isNew);
  const dropped = validateBuildings(S._rawBuildings || []);
  delete S._rawBuildings;
  if (dropped > 0) notes.push(dropped + ' invalid building(s) were removed from the save.');
  if (isNew) generateCity();
  else if (S._part4Gen) { upgradeCityToPart4(); notes.push('City upgraded to ULTRA CITY SIMULATION (save v' + SAVE_VERSION + '): terrain, resources and Town Hall added.'); }
  delete S._part4Gen;
  onMapChanged();
  applyCompanyNames(); RNG.seed(S.p6.rng);
  return { isNew: isNew, notes: notes };
}

function exportSave() {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(buildSaveObject())))); } catch (e) { return ''; }
}
function exportSaveJSON() { try { return JSON.stringify(buildSaveObject(), null, 1); } catch (e) { return ''; } }
/* IMPORT VALIDATION: version, data types, negative values, unknown properties and maximum values */
const SAVE_TOP_KEYS = ['version', 'meta', 'money', 'budget', 'city', 'buildings', 'workers', 'research', 'technology', 'companies', 'bank', 'transport', 'economy', 'market', 'ai', 'trade',
  'diplomacy', 'contracts', 'investors', 'space', 'events', 'statistics', 'achievements', 'quests', 'tutorial', 'settings', 'clock', 'p5', 'lastNet', 'lastBudgetNet', 'lastSaveTime', 'slot',
  'migratedFrom', '_part4Gen', 'header', 'citizens', 'vehicles', 'p6', 'population', 'prestigePoints', 'achievementsLegacy', 'legacy', 'tax', 'tech', 'totalEarned', 'prestigeCount', '_saveBytes'];
function validateImport(d) {
  const errs = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['The save is not a JSON object.'];
  const v = d.version === undefined ? 1 : d.version;
  if (typeof v !== 'number' || v % 1 || v < 1) errs.push('Invalid version field.');
  else if (v > SAVE_VERSION) errs.push('Save version v' + v + ' is newer than this game (v' + SAVE_VERSION + ').');
  const unknown = Object.keys(d).filter(function (k) { return SAVE_TOP_KEYS.indexOf(k) < 0; });
  if (unknown.length) errs.push('Unknown properties: ' + unknown.slice(0, 5).join(', ') + '.');
  const numChk = function (label, val, max) {
    if (val === undefined) return;
    if (typeof val !== 'number' || !isFinite(val)) errs.push(label + ' must be a number.');
    else if (val < 0) errs.push(label + ' cannot be negative.');
    else if (val > max) errs.push(label + ' exceeds the maximum (' + fmt(max) + ').');
  };
  numChk('Money', d.money, MONEY_CAP); numChk('Budget', d.budget, MONEY_CAP);
  if (v >= 3) {
    if (!d.city || typeof d.city !== 'object') errs.push('Missing city data.');
    else { numChk('Population', d.city.population, 1e7); numChk('Tax', d.city.tax, MAX_TAX); if (d.city.name !== undefined && typeof d.city.name !== 'string') errs.push('City name must be text.'); }
    if (!d.buildings || !Array.isArray(d.buildings.list)) errs.push('Missing building list.');
    else {
      if (d.buildings.list.length > 5000) errs.push('Too many buildings.');
      d.buildings.list.slice(0, 5000).forEach(function (b, i) {
        if (!b || typeof b !== 'object' || typeof b.type !== 'string') { errs.push('Building #' + i + ' is malformed.'); return; }
        if (typeof b.x !== 'number' || typeof b.y !== 'number' || b.x < 0 || b.y < 0) errs.push('Building #' + i + ' has invalid coordinates.');
        if (b.level !== undefined && (typeof b.level !== 'number' || b.level < 1 || b.level > MAX_LEVEL)) errs.push('Building #' + i + ' has an invalid level.');
      });
    }
    if (d.research) numChk('Research points', d.research.rp, 1e13);
  } else numChk('Population', d.population, 1e7);
  return errs.slice(0, 8);
}
function parseSaveText(text) {
  text = String(text || '').trim();
  if (!text) throw new Error('Empty input.');
  let json = text;
  if (text[0] !== '{') { try { json = decodeURIComponent(escape(atob(text))); } catch (e) { throw new Error('Not a valid save code or JSON file.'); } }
  try { return JSON.parse(json); } catch (e) { throw new Error('The JSON could not be parsed.'); }
}
/* Returns {ok:true} or {ok:false, errors:[…]}. The current city is only replaced when the save is valid. */
function importSave(text) {
  let d;
  try { d = parseSaveText(text); } catch (e) { return { ok: false, errors: [e.message] }; }
  const errs = validateImport(d);
  if (errs.length) return { ok: false, errors: errs };
  try {
    const st = sanitizeState(migrateSave(d));
    const raw = st._rawBuildings || [];
    const slot = S.slot || 1;
    const prevS = S;
    S = st; S.slot = slot;
    try {
      initMap(false); validateBuildings(raw); delete S._rawBuildings;
      if (S._part4Gen) upgradeCityToPart4();
      delete S._part4Gen;
      applyCompanyNames(); RNG.seed(S.p6.rng);
      resetSim(); onMapChanged(); resetAgents(); econTick(1); saveGame(true);
    } catch (inner) { S = prevS; initMap(false); validateBuildings(S.buildings.list.map(serializeBuilding)); onMapChanged(); resetAgents(); throw inner; }
    return { ok: true, errors: [] };
  } catch (e) { return { ok: false, errors: ['The save data is corrupted: ' + (e && e.message)] }; }
}
