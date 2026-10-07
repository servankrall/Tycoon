'use strict';
/* BLOCK CITY TYCOON — CITY SYSTEMS 3.0 (Part 11)
   Building interiors (floors, workers, capacity, beds, shops, visitors), activity schedules by hour that drive
   electricity and water use, Smart Building energy AI, Building Upgrades 2.0 (energy, capacity, automation, safety,
   appearance, productivity, parking, logistics), smart city sensors + data center, predictive system & predictive
   maintenance, CITY RISK MAP, fire spread (weather, wind, neighbours, response), flood simulation (rain, rivers,
   drainage, terrain), climate adaptation, green energy (hydro, battery storage), smart grid with demand forecast,
   waste management (household / commercial / industrial → trucks → recycling → landfill / processing) and the
   recycling economy (recycled metal & materials feed the supply chain). */

/* ===================================== BUILDINGS ===================================== */
[
  { id: 'sensorhub', name: 'Sensor Hub', icon: '📡', cat: 'Services', sector: 'SERVICE', w: 1, h: 1, cost: 6000, color: '#caf0f8', roof: '#0077b6', height: 18, workers: 2, maxW: 4, power: -2, maint: 0.8, public: true, sensorR: 10, noRoad: true, unlock: { pop: 1000 }, desc: 'Smart city sensors (traffic, air, water, electricity, noise, parking, weather) within 10 tiles.' },
  { id: 'smartdc', name: 'Smart City Data Center', icon: '🖥️', cat: 'Services', sector: 'SERVICE', w: 2, h: 2, cost: 60000, color: '#adb5bd', roof: '#3a0ca3', height: 30, workers: 25, maxW: 50, power: -30, water: -6, maint: 12, public: true, dcHubs: 40, unlock: { pop: 3000 }, desc: 'Processes the data of up to 40 sensor hubs (without it only 30% is analysed).' },
  { id: 'hydro', name: 'Hydro Power Plant', icon: '💧', cat: 'Utilities', sector: 'ENERGY', w: 2, h: 2, cost: 160000, color: '#48cae4', roof: '#023e8a', height: 26, power: 250, workers: 20, maxW: 40, maint: 30, needsWater: true, public: true, unlock: { pop: 2000 }, desc: '250 MW of clean power from a river or lake (must touch water).' },
  { id: 'battery', name: 'Battery Storage', icon: '🔋', cat: 'Utilities', sector: 'ENERGY', w: 1, h: 1, cost: 45000, color: '#90be6d', roof: '#2b9348', height: 14, workers: 2, maxW: 4, maint: 4, public: true, noRoad: true, store: 200, rate: 50, unlock: { pop: 1500 }, desc: 'Stores 200 MWh (charges at 50 MW from surplus power, 90% round-trip efficiency).' },
  { id: 'landfill', name: 'Landfill', icon: '🏔️', cat: 'Waste', sector: 'WASTE', w: 3, h: 3, cost: 12000, color: '#7f5539', roof: '#582f0e', height: 8, wasteCap: 10, workers: 6, maxW: 12, pol: 6, maint: 2, public: true, fillCap: 400000, unlock: { pop: 300 }, desc: 'Cheap disposal: 400,000 t until it is full. Pollutes its surroundings.' },
  { id: 'floodbarrier', name: 'Flood Barrier', icon: '🧱', cat: 'Utilities', sector: 'WATER', w: 1, h: 1, cost: 9000, color: '#6c757d', roof: '#495057', height: 10, maint: 1, needsWater: true, public: true, noRoad: true, unlock: { pop: 500 }, desc: 'Protects low land within 6 tiles from river / sea flooding (must touch water).' },
  { id: 'drainage', name: 'Drainage Pump Station', icon: '🌧️', cat: 'Utilities', sector: 'WATER', w: 1, h: 1, cost: 7000, color: '#8ecae6', roof: '#219ebc', height: 12, workers: 2, maxW: 4, power: -4, maint: 1.2, public: true, unlock: { pop: 400 }, desc: 'Drains rainwater from its 8×8 district (flood risk ↓).' },
  { id: 'coolingcenter', name: 'Cooling Center', icon: '❄️', cat: 'Services', sector: 'SERVICE', w: 2, h: 2, cost: 25000, color: '#e0fbfc', roof: '#3d5a80', height: 18, workers: 10, maxW: 20, power: -10, water: -4, maint: 3, public: true, unlock: { pop: 2000 }, desc: 'Shelter during heat waves: less heat-related sickness and unhappiness nearby.' }
].forEach(registerBuilding);
TECH_LIST.push({ id: 'ar_smartbld', cat: 'CITY', name: 'Smart Buildings', cost: 900, req: ['ai_grid'], desc: 'Building energy AI: all buildings −6% power; automated buildings −18% and +4% comfort.' });
TECHS.ar_smartbld = TECH_LIST[TECH_LIST.length - 1];

/* ===================================== STATE ===================================== */
function ctNew() {
  return {
    ver: 1, storage: 0, gridAI: true, landfill: {}, waste: { recycledMetal: 0, recycledMat: 0 },
    sensors: { alerts: [], counts: { traffic: 0, utility: 0, environment: 0 } },
    fire: { spread: 0, log: [] }, flood: { level: {}, events: 0, log: [] },
    upgradesDone: 0, predLog: []
  };
}
function ctValidate(p) {
  p.storage = clamp(+p.storage || 0, 0, 1e12);
  for (const id in p.landfill) { if (!/^\d{1,9}$/.test(id)) { delete p.landfill[id]; continue; } p.landfill[id] = clamp(+p.landfill[id] || 0, 0, 1e9); }
  p.sensors.alerts = p10Items(p.sensors.alerts, 40, { cat: '', t: '', d: 1, h: 0 });
  p.fire.log = p10Items(p.fire.log, 12, { t: '', d: 1 });
  p.flood.log = p10Items(p.flood.log, 12, { t: '', d: 1 });
  for (const k in p.flood.level) { if (!/^\d{1,6}$/.test(k)) { delete p.flood.level[k]; continue; } p.flood.level[k] = clamp(+p.flood.level[k] || 0, 0, 5); }
  p.predLog = p10Items(p.predLog, 20, { t: '', d: 1, kind: '' });
}

/* ===================================== BUILDING INTERIORS & ACTIVITY ===================================== */
function buildingInterior(b) {
  const d = bdef(b), k = lvlMult(b.level), out = { floors: Math.max(1, Math.round(d.height / 12)) };
  if (d.workers) { out.workers = Math.round(b._actW || 0); out.capacity = Math.round(d.maxW * k); }
  if (d.housing) { out.residents = Math.round(b._cust || 0); out.units = Math.round((b._hcap || d.housing * k) / (d.unitSize || 3)); }
  if (d.beds) { out.beds = Math.round(d.beds * k); out.staff = Math.round(b._actW || 0); out.er = Math.round((d.er || 0) * k); }
  if (d.sector === 'SHOPPING' && d.cap) { out.shops = Math.max(1, Math.round(d.cap * k / 150)); out.visitors = Math.round((b._cust || 0) * activityHours(b) * 0.8); }
  else if ((d.rev || d.tour) && !d.housing) out.visitors = Math.round((b._cust || 0) * activityHours(b) * 0.5 + (d.tour ? attractionValue(b) * 2 : 0));
  if (d.edu) out.students = Math.round(d.edu * k);
  if (d.id === 'hotel' || d.id === 'beachresort') out.rooms = Math.round(d.tour * k / 4);
  if (d.storage) out.storage = Math.round(d.storage * k * logisticsUp(b));
  out.parking = Math.round(parkingOf(b));
  out.activity = Math.round(activityNow(b) * 100);
  return out;
}
/* Opening hours per building class (activity 0–1 by hour) */
const ACT_CLASSES = {
  office: { label: 'Office 08:00–18:00', on: [8, 18], off: 0.2 }, retail: { label: 'Shops 10:00–22:00', on: [10, 22], off: 0.15 }, school: { label: 'School 08:00–16:00', on: [8, 16], off: 0.1 },
  industry: { label: 'Factory 24/7', on: [0, 24], off: 1 }, nightlife: { label: 'Nightlife 18:00–03:00', on: [18, 27], off: 0.2 }, home: { label: 'Homes: busy mornings & evenings', home: true },
  service: { label: '24/7 service', on: [0, 24], off: 1 }, leisure: { label: 'Leisure 09:00–21:00', on: [9, 21], off: 0.3 }
};
function actClass(d) {
  if (d.housing) return 'home';
  if (d.service || d.power > 0 || d.water > 0 || d.cat === 'Utilities' || d.cat === 'Transport' || d.beds) return 'service';
  if (d.edu) return 'school';
  if (d.cat === 'Industry' || d.cat === 'Resources' || d.cat === 'Logistics' || d.cat === 'Waste') return 'industry';
  if (d.sector === 'ENTERTAINMENT' && (d.id === 'nightclub' || d.id === 'cinema')) return 'nightlife';
  if (d.sector === 'SHOPPING' || d.sector === 'FOOD') return 'retail';
  if (d.cat === 'Leisure' || d.tour) return 'leisure';
  return 'office';
}
function actAt(cls, h) {
  const A = ACT_CLASSES[cls];
  if (A.home) return h >= 6 && h < 9 ? 0.9 : h >= 9 && h < 17 ? 0.45 : h >= 17 && h < 23 ? 1 : 0.6;
  const hh = h < A.on[0] && A.on[1] > 24 ? h + 24 : h;
  return hh >= A.on[0] && hh < A.on[1] ? 1 : A.off;
}
const ACT_NORM = {}; Object.keys(ACT_CLASSES).forEach(function (k) { let s = 0; for (let h = 0; h < 24; h++) s += actAt(k, h + 0.5); ACT_NORM[k] = 24 / s; });
function activityNow(b) { return actAt(actClass(bdef(b)), gameHour()); }
function activityHours(b) { const c = actClass(bdef(b)); let s = 0; for (let h = 0; h < 24; h++) s += actAt(c, h + 0.5); return s; }
/* Hook for power & water demand: hour activity (normalised to a daily average of 1), energy upgrades, Smart Buildings */
function p11UseMult(b, kind) {
  const d = bdef(b), c = actClass(d), u = b.u || {};
  let k = actAt(c, gameHour()) * ACT_NORM[c];
  k *= 1 - 0.1 * (u.energy || 0);
  if (kind === 'power') { k *= 1 - 0.06 * (u.automation || 0); if (hasTech('ar_smartbld')) k *= (u.automation ? 0.82 / (1 - 0.06 * u.automation) : 0.94); if (u.green) k *= 0.9; }
  return k;
}
function p11EffMult(b) { const u = b.u; if (!u) return 1; return (1 + 0.06 * (u.productivity || 0)) * (1 + 0.03 * (u.automation || 0)); }
function p11CapMult(b) { const u = b.u; return u && u.capacity ? 1 + 0.1 * u.capacity : 1; }
function logisticsUp(b) { const u = b.u; return u && u.logistics ? 1 + 0.15 * u.logistics : 1; }
function smartComfort() {
  if (!hasTech('ar_smartbld')) return 0;
  let h = 0, a = 0; S.buildings.list.forEach(function (b) { if (bdef(b).housing && b._hcap) { h += b._hcap; if (b.u && b.u.automation) a += b._hcap; } });
  return h ? 4 * a / h : 0;
}

/* ===================================== BUILDING UPGRADES 2.0 ===================================== */
const UPG_TRACKS = {
  energy: ['⚡', 'Energy efficiency', 'Power & water −10% per level'], capacity: ['📦', 'Capacity', 'Residents / customers +10% per level'], automation: ['🤖', 'Automation', 'Power −6%, efficiency +3% per level (Smart Buildings: −18%)'],
  safety: ['🧯', 'Safety', 'Fire risk −30%, aging −10% per level'], appearance: ['🎨', 'Appearance', 'Rent & property value +4%, happiness per level'], productivity: ['📈', 'Productivity', 'Efficiency +6% per level'],
  parking: ['🅿️', 'Parking', 'Parking spaces +50% per level'], logistics: ['🚚', 'Logistics', 'Storage & trucks +15% per level'], green: ['🌱', 'Green roof', 'Cooling −10% power, rain absorbed, air cleaner (1 level)']
};
function upgradeTrackCost(b, track) { const lv = (b.u && b.u[track]) || 0; return Math.round(buildCost(bdef(b)) * 0.12 * (lv + 1) + 500 * costMult()); }
function upgradeTrackMax(track) { return track === 'green' ? 1 : 3; }
function applyTrackUpgrade(b, track, free) {
  if (!UPG_TRACKS[track] || !b || !b.built) return { ok: false, reason: 'Not possible' };
  const lv = (b.u && b.u[track]) || 0; if (lv >= upgradeTrackMax(track)) return { ok: false, reason: 'Maximum level' };
  const cost = upgradeTrackCost(b, track), payer = ownerPayer(b);
  if (!free) { if (isAI(b)) return { ok: false, reason: 'Owned by ' + aiDef(b.owner).name }; if (funds(payer) < cost) return { ok: false, reason: 'Needs ' + money(cost) }; spend(payer, cost); }
  b.u = b.u || {}; b.u[track] = lv + 1; S.p11.upgradesDone++;
  return { ok: true, msg: UPG_TRACKS[track][1] + ' level ' + (lv + 1) + ' (' + money(free ? 0 : cost) + ')' };
}

/* ===================================== SMART CITY SENSORS & DATA CENTER ===================================== */
const SENSOR_TYPES = [['traffic', '🚦'], ['air', '🌬️'], ['water', '💧'], ['electricity', '⚡'], ['noise', '🔊'], ['parking', '🅿️'], ['weather', '🌦️']];
function sensorNet() {
  const hubs = S.buildings.list.filter(function (b) { return b.type === 'sensorhub' && b._op; }), dcs = S.buildings.list.filter(function (b) { return b.type === 'smartdc' && b._op; });
  const dcCap = dcs.reduce(function (a, b) { return a + bdef(b).dcHubs * lvlMult(b.level); }, 0);
  const proc = hubs.length ? Math.min(1, (dcCap || hubs.length * 0.3) / hubs.length) : 0;
  let cov = 0, n = 0;
  S.buildings.list.forEach(function (b) { if (!b.built) return; n++; if (hubs.some(function (h) { return Math.abs(h.x - b.x) <= 10 && Math.abs(h.y - b.y) <= 10; })) cov++; });
  return { hubs: hubs, dcs: dcs.length, sensors: hubs.length * SENSOR_TYPES.length, rate: Math.round(hubs.length * SENSOR_TYPES.length * 60 * proc), processing: proc, coverage: n ? cov / n : 0 };
}
function covered(x, y, hubs) { for (let k = 0; k < hubs.length; k++) if (Math.abs(hubs[k].x - x) <= 10 && Math.abs(hubs[k].y - y) <= 10) return true; return false; }
function sensorTick() {
  const N = sensorNet(), P = S.p11.sensors; if (!N.hubs.length) { SIM.p11Sensor = 0; return; }
  SIM.p11Sensor = N.coverage * N.processing;
  const add = function (cat, t) { if (Math.random() > N.processing) return; if (P.alerts.length && P.alerts[0].t === t) return; P.alerts.unshift({ cat: cat, t: t, d: gameDay(), h: Math.floor(gameHour()) }); if (P.alerts.length > 40) P.alerts.length = 40; P.counts[cat]++; };
  const H = N.hubs;
  let jam = 0; if (MAP.cong) for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && MAP.cong[i] > 0.75 && covered(i % MAP.W, (i / MAP.W) | 0, H)) jam++;
  if (jam >= 3) add('traffic', '🚦 ' + jam + ' congested road segments detected');
  if (envReady()) { let bad = 0, loud = 0; S.buildings.list.forEach(function (b) { if (!covered(b.x, b.y, H)) return; const i = idx(b.x, b.y); if (ENV.air[i] > 0.5) bad++; if (ENV.noise[i] > 0.65) loud++; }); if (bad) add('environment', '🌬️ Poor air quality at ' + bad + ' monitored buildings'); if (loud > 3) add('environment', '🔊 Noise above limits at ' + loud + ' buildings'); }
  let lowP = 0, brown = 0; S.buildings.list.forEach(function (b) { if (!covered(b.x, b.y, H) || !b.built) return; if (b._wp !== undefined && b._wp < 0.3 && bdef(b).water < 0) lowP++; if (b._gridOver || (bdef(b).power < 0 && !b._powered)) brown++; });
  if (lowP) add('utility', '💧 Low water pressure at ' + lowP + ' buildings'); if (brown) add('utility', '⚡ Grid overload / outage at ' + brown + ' buildings');
  const pk = parkingPass(); if (pk.dem > 0 && pk.illegal > pk.dem * 0.1) add('traffic', '🅿️ Illegal parking: ' + fmt(Math.round(pk.illegal)) + ' cars');
  if (['storm', 'heavyrain', 'heatwave', 'coldwave', 'snow'].indexOf(FX.weather) >= 0) add('environment', '🌦️ Severe weather: ' + FX.weather);
}

/* ===================================== PREDICTIVE SYSTEM & PREDICTIVE MAINTENANCE ===================================== */
const PRED = { hist: [], at: -99, cond: new Map() };
function predSample() {
  const regs = weRegionStats(false).map(function (r) { return { id: r.id, name: r.name, water: r.water, energy: r.energy, traffic: r.traffic, pop: r.pop }; });
  PRED.hist.push({ t: S.clock.runSec, regs: regs, wGen: SIM.waterGen || 0, wUse: SIM.waterUse || 0, pGen: SIM.powerGen || 0, pUse: SIM.powerUse || 0, hosp: SV.health ? SV.health.load : 0, housing: SIM.housingDemandRatio || 0, budget: S.budget });
  if (PRED.hist.length > 60) PRED.hist.shift();
  // condition history for predictive maintenance
  if (S.p10) for (const k in S.p10.infra) { const a = S.p10.infra[k], q = PRED.cond.get(k); if (!q) PRED.cond.set(k, { t0: S.clock.runSec, c0: a.cond }); else if (a.cond > q.c0 + 1) PRED.cond.set(k, { t0: S.clock.runSec, c0: a.cond }); }
  S.buildings.list.forEach(function (b) { if (b.owner !== 'city' || b.cond === undefined) return; const k = 'b' + b.id, q = PRED.cond.get(k); if (!q || b.cond > q.c0 + 1) PRED.cond.set(k, { t0: S.clock.runSec, c0: b.cond }); });
}
function trendMonths(vals, ts, limit, rising) {
  const n = vals.length; if (n < 5) return null;
  const mt = ts.reduce(function (a, v) { return a + v; }, 0) / n, mv = vals.reduce(function (a, v) { return a + v; }, 0) / n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (vals[i] - mv); den += (ts[i] - mt) * (ts[i] - mt); }
  const slope = den ? num / den : 0, now = vals[n - 1];
  if (rising ? slope <= 1e-9 || now >= limit : slope >= -1e-9 || now <= limit) return rising && now >= limit ? 0 : null;
  const sec = (limit - now) / slope; return sec / GAME_MONTH;
}
/* Forecasts: which capacity will be exceeded, where and in how many months (linear trend, confidence from sensors & samples) */
function predictions() {
  const H = PRED.hist, out = []; if (H.length < 5) return out;
  const ts = H.map(function (h) { return h.t; });
  const conf = clamp(0.4 + H.length / 100 + (SIM.p11Sensor || 0) * 0.4, 0, 0.98);
  const fastReg = function (key) { const a = H[0].regs, b = H[H.length - 1].regs; let best = null, bg = -Infinity; b.forEach(function (r, i) { const g = r[key] - (a[i] ? a[i][key] : 0); if (g > bg && r.pop > 0) { bg = g; best = r; } }); return best; };
  const add = function (icon, kind, text, months) { if (months === null || months > 120) return; out.push({ icon: icon, kind: kind, text: text, months: months, conf: conf }); };
  const wm = trendMonths(H.map(function (h) { return h.wUse - h.wGen; }), ts, 0, true); if (wm !== null) { const r = fastReg('water'); add('💧', 'water', (r ? r.name : 'City') + ' water demand is expected to exceed capacity in ' + fmtMonths(wm) + '.', wm); }
  const pm = trendMonths(H.map(function (h) { return h.pUse - h.pGen; }), ts, 0, true); if (pm !== null) { const r = fastReg('energy'); add('⚡', 'power', (r ? r.name : 'City') + ' electricity demand is expected to exceed generation in ' + fmtMonths(pm) + '.', pm); }
  if (H[0].regs.length) H[H.length - 1].regs.forEach(function (r, i) { const m = trendMonths(H.map(function (h) { return h.regs[i] ? h.regs[i].traffic : 0; }), ts, 70, true); if (m !== null) add('🚦', 'traffic', r.name + ' roads likely to reach critical congestion (70%) in ' + fmtMonths(m) + '.', m); });
  const hm = trendMonths(H.map(function (h) { return h.hosp; }), ts, 1, true); if (hm !== null) add('🏥', 'health', 'Hospitals are expected to reach full capacity in ' + fmtMonths(hm) + '.', hm);
  const bm = trendMonths(H.map(function (h) { return h.budget; }), ts, 0, false); if (bm !== null) add('🏛️', 'budget', 'The city budget is expected to run out in ' + fmtMonths(bm) + '.', bm);
  return out.sort(function (a, b) { return a.months - b.months; });
}
function fmtMonths(m) { return m < 1 ? 'less than a month' : m < 24 ? Math.round(m) + ' month' + (Math.round(m) === 1 ? '' : 's') : (m / 12).toFixed(1) + ' years'; }
/* Assets whose condition trend reaches the critical level (30 %) — warning before they fail */
function maintenancePredictions() {
  const out = [], now = S.clock.runSec;
  PRED.cond.forEach(function (q, k) {
    let cond, name, icon, key;
    if (k[0] === 'b' && /^b\d+$/.test(k) && !S.p10.infra[k]) { const b = MAP.byId.get(+k.slice(1)); if (!b) { PRED.cond.delete(k); return; } cond = b.cond; name = bdef(b).name + ' #' + b.id; icon = bdef(b).icon; key = String(b.id); }
    else { const a = S.p10.infra[k]; if (!a) { PRED.cond.delete(k); return; } cond = a.cond; name = infraName(k, a); icon = a.k === 'bridge' ? '🌉' : '🛣️'; key = k; }
    const dt = now - q.t0; if (dt < 30 || cond >= q.c0) return;
    const rate = (q.c0 - cond) / dt, months = (cond - 30) / rate / GAME_MONTH;
    if (months < 36) out.push({ key: key, icon: icon, name: name, cond: cond, months: Math.max(0, months), text: name + ' condition ' + Math.round(cond) + '% — critical maintenance likely within ' + fmtMonths(Math.max(0, months)) + '.' });
  });
  return out.sort(function (a, b) { return a.months - b.months; }).slice(0, 30);
}
function predictTick() {
  predSample();
  const P = S.p11, pr = predictions().filter(function (p) { return p.months < 6; }).concat(maintenancePredictions().filter(function (m) { return m.months < 3; }).slice(0, 2));
  pr.forEach(function (p) { if (P.predLog.some(function (l) { return l.t === p.text; })) return; P.predLog.unshift({ t: p.text, d: gameDay(), kind: p.kind || 'maint' }); if (P.predLog.length > 20) P.predLog.length = 20; });
}

/* ===================================== CITY RISK MAP ===================================== */
const RISK_TYPES = [['all', '⚠️', 'All risks'], ['traffic', '🚦', 'Traffic'], ['fire', '🔥', 'Fire'], ['flood', '🌊', 'Flood'], ['infrastructure', '🌉', 'Infrastructure'], ['pollution', '🏭', 'Pollution'], ['utility', '⚡', 'Utility'], ['congestion', '🚗', 'Congestion']];
HEATMAPS.push({ id: 'RISK', icon: '⚠️', name: 'City Risk Map', low: 'Low risk', high: 'High risk', ramp: 'bad' }, { id: 'WALKABILITY', icon: '🚶', name: 'Walkability', low: 'Car-dependent', high: 'Walkable', ramp: 'good' });
function lowLand(i) { const x = i % MAP.W, y = (i / MAP.W) | 0; if (MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.HILL || MAP.terrain[i] === TERRAIN.ROCK) return 0; let w = 0; for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inMap(xx, yy) && MAP.nature[idx(xx, yy)] === 2) w++; return Math.min(1, w / 6); }
function protectedFromFlood(x, y) { return S.buildings.list.some(function (b) { return b.type === 'floodbarrier' && b.built && Math.abs(b.x - x) <= 6 && Math.abs(b.y - y) <= 6; }); }
function p11RiskGrid(type) {
  type = type || P11.ui.risk || 'all';
  const N = MAP.W * MAP.H, g = new Float32Array(N), put = function (i, v) { if (v > g[i]) g[i] = v; };
  const want = function (k) { return type === 'all' || type === k; };
  if (want('traffic') || want('congestion')) for (let i = 0; i < N; i++) if (MAP.roads[i] && MAP.cong) put(i, clamp(MAP.cong[i] * (type === 'congestion' ? 1 : 0.8) + (MAP.blocked[i] ? 0.3 : 0), 0, 1));
  if (want('congestion') && MAP.districts) for (let i = 0; i < N; i++) { const dd = districtOf(i % MAP.W, (i / MAP.W) | 0); if (dd && MAP.roads[i]) put(i, clamp(SIM.traffic / 100, 0, 1) * 0.6); }
  const rain = FX.weather === 'heavyrain' ? 0.4 : FX.weather === 'storm' ? 0.3 : FX.weather === 'rain' ? 0.15 : 0;
  if (want('flood')) for (let i = 0; i < N; i++) { const l = lowLand(i); if (l > 0) { const x = i % MAP.W, y = (i / MAP.W) | 0, k = Math.floor(y / 8) * (MAP.dN || 1) + Math.floor(x / 8); put(i, clamp(l * 0.6 + rain + (S.p11.flood.level[k] || 0) * 0.3 - (protectedFromFlood(x, y) ? 0.5 : 0), 0, 1)); } }
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b.built || d.id === 'tree') return;
    let v = 0;
    if (want('fire')) v = Math.max(v, (b._cov && b._cov.fire ? 0.15 : 0.6) + (d.cat === 'Industry' || d.cat === 'Resources' ? 0.2 : 0) + (FX.weather === 'heatwave' ? 0.15 : 0) - 0.1 * ((b.u && b.u.safety) || 0) + (b.fire > 0 ? 0.5 : 0));
    if (want('infrastructure')) v = Math.max(v, b.cond === undefined ? 0 : 1 - b.cond / 100);
    if (want('utility')) v = Math.max(v, (!b._powered && d.power < 0 ? 0.9 : 0) + (b._gridOver ? 0.5 : 0) + (b._wp !== undefined && b._wp < 0.3 && d.water < 0 ? 0.6 : 0));
    if (want('pollution') && envReady()) v = Math.max(v, ENV.air[idx(b.x, b.y)]);
    if (v <= 0) return;
    for (let y = b.y; y < b.y + d.h; y++) for (let x = b.x; x < b.x + d.w; x++) put(idx(x, y), clamp(v, 0, 1));
  });
  if (want('infrastructure') && S.p10) for (const k in S.p10.infra) { const a = S.p10.infra[k]; if (a.k === 'bridge') put(a.tile, 1 - a.cond / 100); }
  if (want('pollution') && envReady()) for (let i = 0; i < N; i++) if (!MAP.occ[i]) put(i, ENV.air[i] * 0.8);
  return g;
}
function walkGrid() { const W = walkPass(), N = MAP.W * MAP.H, g = new Float32Array(N); for (let i = 0; i < N; i++) { const c = W.cells[Math.floor(((i / MAP.W) | 0) / 8) * W.n + Math.floor((i % MAP.W) / 8)]; g[i] = c && (c.road || c.shops) ? c.score / 100 : 0; } return g; }

/* ===================================== FIRE SPREAD ===================================== */
function fireSpreadTick(dt) {
  if (S.p9 && S.p9.freeze.buildings) return;
  const burning = S.buildings.list.filter(function (b) { return b.fire > 0; }); if (!burning.length) return;
  const w = FX.weather, wx = S.p9 ? Math.cos(S.p9.env.wind.dir) : 0, wy = S.p9 ? Math.sin(S.p9.env.wind.dir) : 0, ws = S.p9 ? S.p9.env.wind.speed : 0.1;
  const wf = w === 'heatwave' ? 2 : w === 'rain' || w === 'heavyrain' ? 0.3 : w === 'snow' ? 0.2 : w === 'storm' ? 1.4 : 1;
  let spread = 0; const total = burning.length;
  burning.forEach(function (b) {
    if (total + spread >= 14) return;
    const d = bdef(b), resp = b._truck ? 0.35 : 1;
    for (let y = b.y - 2; y <= b.y + d.h + 1; y++) for (let x = b.x - 2; x <= b.x + d.w + 1; x++) {
      const n = buildingAtTile(x, y); if (!n || n === b || n.fire > 0 || !n.built || n._fsTried === S.clock.runSec) continue;
      n._fsTried = S.clock.runSec;
      const nd = bdef(n), dx = n.x - b.x, dy = n.y - b.y, dist = Math.max(1, Math.hypot(dx, dy));
      const down = 1 + ws * 4 * Math.max(0, (dx * wx + dy * wy) / dist);
      const flam = nd.cat === 'Industry' || nd.cat === 'Resources' ? 1.5 : nd.housing ? 1 : nd.hap > 0 ? 0.3 : 0.8;
      const p = 0.012 * dt * wf * down * flam * resp * (dist <= 1.5 ? 1 : 0.4) * (1 - 0.3 * ((n.u && n.u.safety) || 0)) * (n._cov && n._cov.fire ? 0.6 : 1);
      if (Math.random() < p) { igniteBuilding(n); spread++; }
    }
  });
  if (spread) { S.p11.fire.spread += spread; const L = S.p11.fire.log; L.unshift({ t: '🔥 Fire spread to ' + spread + ' building(s) (' + (w === 'heatwave' ? 'heat wave, ' : '') + 'wind ' + windName(S.p9 ? S.p9.env.wind.dir : 0) + ')', d: gameDay() }); if (L.length > 12) L.length = 12; }
}

/* ===================================== FLOOD SIMULATION ===================================== */
const FLOOD = { tiles: new Set(), marked: new Set() };
function floodTick(dt) {
  const P = S.p11.flood, n = MAP.dN || Math.ceil(MAP.W / 8), w = FX.weather;
  const rain = w === 'heavyrain' ? 1 : w === 'storm' ? 0.8 : w === 'rain' ? 0.35 : (w === 'clear' && currentSeason().id === 'spring' ? 0.05 : 0);
  const cells = {};
  for (let i = 0; i < MAP.roads.length; i++) { const x = i % MAP.W, y = (i / MAP.W) | 0, k = Math.floor(y / 8) * n + Math.floor(x / 8); const c = cells[k] || (cells[k] = { water: 0, low: 0, n: 0 }); c.n++; if (MAP.nature[i] === 2) c.water++; else if (lowLand(i) > 0) c.low++; }
  const drains = {}; S.buildings.list.forEach(function (b) { if (!b._op && b.type !== 'floodbarrier') return; const k = Math.floor(b.y / 8) * n + Math.floor(b.x / 8); if (b.type === 'drainage') drains[k] = (drains[k] || 0) + 0.6; if (b.type === 'reservoir') drains[k] = (drains[k] || 0) + 0.3; if (b.u && b.u.green) drains[k] = (drains[k] || 0) + 0.04; });
  const sewer = S.p9 ? 0.25 * (1 - (SIM.sewageOverload || 0)) : 0.2;
  let flooded = 0;
  for (const k in cells) {
    const c = cells[k]; if (!c.low) { delete P.level[k]; continue; }
    const river = c.water / c.n * 3;
    const inflow = rain * (1 + river) * 0.02, out = (0.004 + (drains[k] || 0) * 0.01 + sewer * 0.006);
    P.level[k] = clamp((P.level[k] || 0) + (inflow - out) * dt, 0, 3);
    if (P.level[k] < 0.001) delete P.level[k];
    if (P.level[k] > 1) flooded++;
  }
  // flooding: low road tiles become impassable, buildings on low land lose efficiency; barriers protect
  const nowFlood = new Set();
  for (const k in P.level) {
    if (P.level[k] <= 1) continue;
    const cx = (+k % n) * 8, cy = Math.floor(+k / n) * 8;
    for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) { if (!inMap(x, y)) continue; const i = idx(x, y); if (lowLand(i) > 0.3 && !protectedFromFlood(x, y)) nowFlood.add(i); }
  }
  FLOOD.tiles.forEach(function (i) { if (!nowFlood.has(i) && MAP.blocked[i] === 3) MAP.blocked[i] = 0; });
  let roadsHit = 0;
  nowFlood.forEach(function (i) { if (MAP.roads[i] && !MAP.blocked[i]) { MAP.blocked[i] = 3; roadsHit++; } });
  if (roadsHit) { MAP.pathCache.clear(); rerouteAround(Array.from(nowFlood).filter(function (i) { return MAP.roads[i]; })); }
  const disasterFlood = S.p9 && S.p9.disasters.some(function (d) { return d.type === 'flood'; });
  S.buildings.list.forEach(function (b) { const i = idx(b.x, b.y); if (nowFlood.has(i)) { b._nearWater = true; FLOOD.marked.add(b.id); } else if (FLOOD.marked.has(b.id)) { FLOOD.marked.delete(b.id); if (!disasterFlood) b._nearWater = false; } });
  SIM.p11Flood = nowFlood.size > 0;
  if (SIM.p11Flood) SIM.flood = true; else if (FLOOD.tiles.size && !disasterFlood) SIM.flood = false;          // flooded buildings work at 60 % (economy)
  if (nowFlood.size && !FLOOD.tiles.size) { P.events++; const L = P.log; L.unshift({ t: '🌊 Flooding in ' + flooded + ' district(s): ' + nowFlood.size + ' low tiles under water (' + w + ')', d: gameDay() }); if (L.length > 12) L.length = 12; newsAdd('🌊', 'Flooding after ' + (w === 'heavyrain' ? 'heavy rain' : w), nowFlood.size + ' low-lying tiles are under water; roads closed and traffic re-routed. Drainage and flood barriers reduce the risk.', { cat: 'disaster', cls: 'bad' }); }
  FLOOD.tiles = nowFlood;
}

/* ===================================== GREEN ENERGY, STORAGE & SMART GRID ===================================== */
const GRID3 = { profile: new Array(24).fill(0), seen: new Array(24).fill(0), lastIn: 0, lastOut: 0 };
function batteryCap() { let c = 0, r = 0; S.buildings.list.forEach(function (b) { if (b.type === 'battery' && b._op) { const d = bdef(b), k = lvlMult(b.level); c += d.store * k * 3600 / TIME_SCALE; r += d.rate * k; } }); return { cap: c, rate: r }; }
/* Hook (econTick power, before demand): discharge into the grid when last tick's demand exceeded generation */
function p11GridDischarge(gen, dt) {
  const P = S.p11, B = batteryCap(); if (!B.cap || P.storage <= 0) { GRID3.lastOut = 0; return 0; }
  const h = gameHour(), peak = gridPeakHours().indexOf(Math.floor(h)) >= 0;
  const need = Math.max(0, (SIM.powerUse || 0) * (P.gridAI && peak ? 1.02 : 1) - gen);
  const out = Math.min(B.rate, need, P.storage * 0.9 / dt);
  P.storage = Math.max(0, P.storage - out / 0.95 * dt); GRID3.lastOut = out;
  return out;
}
/* Hook (after the power balance): surplus charges the batteries — the AI keeps charging before the forecast peak */
function p11GridCharge(surplus, dt) {
  const P = S.p11, B = batteryCap(); P.storage = Math.min(P.storage, B.cap);
  const h = Math.floor(gameHour()); GRID3.profile[h] = GRID3.seen[h] ? lerp(GRID3.profile[h], SIM.powerUse || 0, 0.05) : (SIM.powerUse || 0); GRID3.seen[h] = 1;
  if (!B.cap || surplus <= 0) { GRID3.lastIn = 0; return; }
  const inn = Math.min(B.rate, surplus, (B.cap - P.storage) / dt); P.storage += inn * 0.95 * dt; GRID3.lastIn = inn;
}
function gridPeakHours() { const p = GRID3.profile.map(function (v, h) { return [v, h]; }).filter(function (x) { return GRID3.seen[x[1]]; }).sort(function (a, b) { return b[0] - a[0]; }); return p.slice(0, 4).map(function (x) { return x[1]; }); }
function smartGrid() {
  const B = batteryCap(), h = Math.floor(gameHour()), next = (h + 1) % 24;
  return { gen: SIM.powerGen || 0, use: SIM.powerUse || 0, stored: S.p11.storage * TIME_SCALE / 3600, cap: B.cap * TIME_SCALE / 3600, rate: B.rate, soc: B.cap ? S.p11.storage / B.cap : 0, charging: GRID3.lastIn, discharging: GRID3.lastOut, forecastNext: GRID3.seen[next] ? GRID3.profile[next] : SIM.powerUse || 0, peak: gridPeakHours(), profile: GRID3.profile.slice(), green: greenShare() };
}
function greenShare() { let g = 0, t = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.power > 0 && b._op) { t += b._gen || 0; if (['solar', 'wind', 'hydro', 'fusion'].indexOf(d.id) >= 0) g += b._gen || 0; } }); return t ? g / t : 0; }

/* ===================================== WASTE MANAGEMENT & RECYCLING ECONOMY ===================================== */
function wasteFlows() {
  const pop = S.city.population; let ind = 0, comm = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!b._op) return; if (d.goods || d.extract) ind += b._prod || 0; if (d.rev) comm++; });
  const hh = pop * 0.015, cm = comm * 0.02, id = ind * 0.015, day = 86400 / TIME_SCALE, t = 0.05;
  const trucks = AG.vehicles.filter(function (v) { return v.type === 'garbage'; }).length;
  const recCap = S.buildings.list.filter(function (b) { return bdef(b).recycle && b._op; }).reduce(function (a, b) { return a + bdef(b).wasteCap * lvlMult(b.level) * b._eff; }, 0);
  const fills = S.buildings.list.filter(function (b) { return b.type === 'landfill' && b.built; }).map(function (b) { return { b: b, fill: S.p11.landfill[b.id] || 0, cap: bdef(b).fillCap }; });
  return { household: hh * day * t, commercial: cm * day * t, industrial: id * day * t, total: (hh + cm + id) * day * t, capacity: (SIM.wasteCap || 0) * day * t, recycledT: (SIM.recycled || 0) * day * t, recCap: recCap * day * t, backlog: S.city.waste * t, trucks: trucks, landfills: fills, metal: S.p11.waste.recycledMetal, mat: S.p11.waste.recycledMat };
}
function wasteTick(dt) {
  const P = S.p11;
  // landfills fill with what they take in; a full landfill closes
  const lf = S.buildings.list.filter(function (b) { return b.type === 'landfill' && b.built; });
  const share = (SIM.wasteCap || 0) > 0 ? (SIM.wasteGen || 0) / SIM.wasteCap : 0;
  lf.forEach(function (b) {
    const d = bdef(b), f = (P.landfill[b.id] || 0) + (b._op ? d.wasteCap * lvlMult(b.level) * b._eff * Math.min(1, share) * dt * 0.05 : 0);
    P.landfill[b.id] = f;
    if (f >= d.fillCap && !b.closed) { b.closed = true; b.p11Full = true; newsAdd('🏔️', 'Landfill full', 'The landfill #' + b.id + ' reached ' + fmt(d.fillCap) + ' t and closed. Recycling and waste processing reduce what goes to landfill.', { cat: 'utility', cls: 'bad' }); }
  });
  for (const id in P.landfill) if (!MAP.byId.has(+id)) delete P.landfill[id];
  // recycling economy: recycled waste becomes metal and construction materials for the supply chain
  const rec = (SIM.recycled || 0) * dt, inv = S.economy.inventory;
  if (rec > 0) { const m = rec * 0.02, c = rec * 0.03; if (PRODUCTS.metal) inv.metal = (inv.metal || 0) + m; inv.materials = (inv.materials || 0) + c; P.waste.recycledMetal += m; P.waste.recycledMat += c; }
}

/* ===================================== CLIMATE ADAPTATION ===================================== */
function climateStatus() {
  const bar = S.buildings.list.filter(function (b) { return b.type === 'floodbarrier' && b.built; }).length, dr = S.buildings.list.filter(function (b) { return b.type === 'drainage' && b._op; }).length;
  const cool = S.buildings.list.filter(function (b) { return b.type === 'coolingcenter' && b._op; }).length, res = S.buildings.list.filter(function (b) { return b.type === 'reservoir' && b._op; }).length;
  let roofs = 0, trees = 0; S.buildings.list.forEach(function (b) { if (b.u && b.u.green) roofs++; }); for (let i = 0; i < MAP.nature.length; i++) if (MAP.nature[i] === 1) trees++;
  let low = 0, prot = 0; for (let i = 0; i < MAP.roads.length; i++) if ((MAP.occ[i] || MAP.roads[i]) && lowLand(i) > 0.3) { low++; if (protectedFromFlood(i % MAP.W, (i / MAP.W) | 0)) prot++; }
  return { barriers: bar, drainage: dr, cooling: cool, reservoirs: res, greenRoofs: roofs, trees: trees, lowTiles: low, protectedShare: low ? prot / low : 1, heatCover: cool ? Math.min(1, cool * 2500 / Math.max(1, S.city.population)) : 0 };
}
/* Hook from globalMods: cooling centers during heat waves, smart comfort, green roofs */
function cityMods(m) {
  if (FX.weather === 'heatwave') { const c = climateStatus(); m.hap += c.heatCover * 4; }
  m.hap += smartComfort();
  if (SIM.p11Sensor) m.traffic = (m.traffic || 1) * (1 - 0.05 * SIM.p11Sensor);
  return m;
}
function city3Tick(dt) {
  p11T('fire', function () { fireSpreadTick(dt); });
  if (p11Every('flood', 5, dt)) p11T('flood', function () { floodTick(5); });
  if (p11Every('waste', 5, dt)) wasteTick(5);
  if (p11Every('sensors', 10, dt)) p11T('sensors', sensorTick);
  if (p11Every('predict', 60, dt) || PRED.hist.length < 5 && p11Every('predictFast', 12, dt)) p11T('predict', predictTick);
}
