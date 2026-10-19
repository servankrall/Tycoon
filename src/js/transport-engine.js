'use strict';
/* BLOCK CITY TYCOON — TRANSPORTATION ENGINE 3.0 · CORE (Part 19 · v2.7.0)
   TransportationEngine 3.0 extends the existing transport stack instead of replacing it: the Part 9 transit network
   (S.p9.transit lines, TRANSIT pods / road vehicles), the Part 11 transport engine (modal split, metro engine, trains,
   regional rail, parking, walk / bike networks, Traffic Light AI 2.0) and Emergency AI.
   ├── MetroSystem          stations (capacity · passengers · waiting · coverage · revenue · maintenance), tunnels / track,
   │                         lines, trains, depots
   ├── BusSystem            stops, depots, lines, vehicles (real road traffic), schedules (service hours, headway)
   ├── TrainSystem          stations, track, depots, passenger / cargo / high-speed trains — cargo feeds EconomyEngine
   ├── AirportSystem        Small · Regional · International · Mega: runways, terminals, gates, baggage, passengers, cargo,
   │                         aircraft, parking, public-transport access
   ├── PortSystem           Small · Cargo · Passenger · Industrial · Mega: imports, exports, containers, ships, warehouses
   ├── BikeSystem           bike lanes, bike roads, bike parking, bike stations
   ├── PedestrianSystem     sidewalks, pedestrian streets / bridges / tunnels, crosswalks, walkability
   ├── ParkingSystem        street parking, lots, garages, park & ride, airport parking — search time / traffic / happiness
   ├── TransitLineSystem    line editor (create, add / remove / move station, order, colour, frequency, train count)
   └── transport-ai.js      TrafficAI 3.0, IntersectionAI, RoutingSystem, LogisticsTransport, EmergencyPriority, generators,
                            validator & auto-fix · transport-ui.js: TRANSPORTATION dashboard, line editor UI, heatmaps.
   Statistics are cached (every 2 s real time or per game hour); nothing here runs per vehicle per frame. */

const TPE = { at: -9, hourKey: -1, cache: null, prof: { stats: 0, hour: 0 }, errors: 0, lastErr: '' };

/* ---------- new transport buildings (depots, airport / port tiers, bike parking, parking lot) ---------- */
[
  { id: 'metrodepot', name: 'Metro Depot', icon: '🚇', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 60000, color: '#6c757d', roof: '#a4161a', height: 10, workers: 30, maxW: 60, power: -12, maint: 8, public: true, depot: 'metro', unlock: { tech: 'metro' }, desc: 'Stores and services metro trains: +4 trains per metro line, lower maintenance.' },
  { id: 'busdepot', name: 'Bus Depot', icon: '🚌', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 18000, color: '#adb5bd', roof: '#f77f00', height: 9, workers: 20, maxW: 40, power: -5, maint: 3, public: true, depot: 'bus', unlock: { pop: 300 }, desc: 'Garages and services buses and trams: +4 vehicles per line, schedules run on time.' },
  { id: 'traindepot', name: 'Train Depot', icon: '🚆', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 80000, color: '#8d99ae', roof: '#606c38', height: 11, workers: 35, maxW: 70, power: -10, maint: 9, public: true, depot: 'train', unlock: { tech: 'rail' }, desc: 'Maintains passenger and cargo trains: +4 trains per rail line.' },
  { id: 'airstrip', name: 'Small Airport', icon: '🛩️', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 120000, color: '#dee2e6', roof: '#8d99ae', height: 8, transit: 250, tour: 250, workers: 25, maxW: 50, power: -10, pol: 3, maint: 12, public: true, airport: 1, unlock: { pop: 3000 }, desc: 'Small Airport: one short runway for regional flights.' },
  { id: 'regionalairport', name: 'Regional Airport', icon: '🛫', cat: 'Transport', sector: 'TRANSPORT', w: 4, h: 3, cost: 650000, color: '#ced4da', roof: '#6c757d', height: 14, transit: 900, tour: 900, workers: 120, maxW: 240, power: -45, water: -20, pol: 6, maint: 120, public: true, airport: 2, unlock: { pop: 8000 }, desc: 'Regional Airport: runway, terminal and gates for national routes.' },
  { id: 'smallport', name: 'Small Port', icon: '⚓', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 40000, color: '#90e0ef', roof: '#0077b6', height: 10, transit: 120, trade: 25, workers: 20, maxW: 40, power: -6, maint: 6, needsWater: true, public: true, port: 1, unlock: { pop: 800 }, desc: 'Small Port: ferries, fishing boats and small cargo ships.' },
  { id: 'bikeparking', name: 'Bike Parking', icon: '🅿️', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 600, color: '#95d5b2', roof: '#2d6a4f', height: 3, maint: 0.05, noRoad: true, public: true, bikePark: 60, unlock: { pop: 50 }, desc: '60 bike spaces: more citizens bike to nearby shops and jobs.' },
  { id: 'parkinglot', name: 'Parking Lot', icon: '🅿️', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 1500, color: '#adb5bd', roof: '#6c757d', height: 1, parking: 150, maint: 0.2, public: true, unlock: { pop: 100 }, desc: '150 parking spaces on the surface.' }
].forEach(function (d) { if (!BUILDINGS[d.id]) registerBuilding(d); });
const AIRPORT_LEVELS = [['none', 'No airport'], ['small', 'Small Airport'], ['regional', 'Regional Airport'], ['international', 'International Airport'], ['mega', 'Mega Airport']];
const PORT_LEVELS = [['none', 'No port'], ['small', 'Small Port'], ['cargo', 'Cargo Port'], ['passenger', 'Passenger Port'], ['industrial', 'Industrial Port'], ['mega', 'Mega Port']];

/* ---------- state · Save 3.2 ---------- */
function newTransportation() {
  return {
    v: 1,
    metro: { lines: {}, depots: 0, stationHist: {} },          // per-line editor settings {color, headway, trains, order:true}
    bus: { schedules: {} },                                     // per-line {start, end, headway}
    rail: { cargoTons: 0, cargoValue: 0, hist: [] },
    airport: { level: 'none', paxDay: 0, cargoDay: 0 },
    ports: { level: 'none', teuDay: 0, imports: 0, exports: 0 },
    bike: { roads: {} },                                        // bike roads (separated); lanes live in S.p11.bike
    pedestrian: { crosswalks: {} },
    parking: { street: true, searchMin: 0 },
    traffic: { defaultMode: null, modes: {}, ptPriority: {}, oneway: {}, speedMult: 1, stats: { reroutes: 0, predicted: 0, avoided: 0, ptGreen: 0, privDelay: 0, emPreempt: 0 } },
    gen: null, validation: null, hist: []
  };
}
function tp() { if (!S.transportation) S.transportation = newTransportation(); return S.transportation; }
function sanitizeTransportation(src) {
  const o = newTransportation();
  if (!src || typeof src !== 'object') return o;
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi === undefined ? 1e15 : hi, Math.max(lo === undefined ? -1e15 : lo, v)) : d; };
  const tileMap = function (m, ok) { const r = {}; if (m && typeof m === 'object') Object.keys(m).slice(0, 20000).forEach(function (k) { if (/^\d{1,7}$/.test(k) && ok(m[k])) r[k] = m[k]; }); return r; };
  const col = function (c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; };
  if (src.metro && src.metro.lines && typeof src.metro.lines === 'object') Object.keys(src.metro.lines).slice(0, 40).forEach(function (id) { if (!/^L\d{1,5}$/.test(id)) return; const L = src.metro.lines[id] || {}; o.metro.lines[id] = { color: col(L.color), headway: n(L.headway, 0, 0, 120), trains: n(L.trains, 0, 0, 12) | 0, order: !!L.order }; });
  if (src.bus && src.bus.schedules && typeof src.bus.schedules === 'object') Object.keys(src.bus.schedules).slice(0, 40).forEach(function (id) { if (!/^L\d{1,5}$/.test(id)) return; const s = src.bus.schedules[id] || {}; o.bus.schedules[id] = { start: n(s.start, 5, 0, 23) | 0, end: n(s.end, 24, 1, 24) | 0, headway: n(s.headway, 10, 2, 120) }; });
  if (src.rail) { o.rail.cargoTons = n(src.rail.cargoTons, 0, 0); o.rail.cargoValue = n(src.rail.cargoValue, 0, 0); o.rail.hist = Array.isArray(src.rail.hist) ? src.rail.hist.slice(-60).map(function (v) { return n(v, 0, 0); }) : []; }
  if (src.airport) { o.airport.level = AIRPORT_LEVELS.some(function (l) { return l[0] === src.airport.level; }) ? src.airport.level : 'none'; o.airport.paxDay = n(src.airport.paxDay, 0, 0); o.airport.cargoDay = n(src.airport.cargoDay, 0, 0); }
  if (src.ports) { o.ports.level = PORT_LEVELS.some(function (l) { return l[0] === src.ports.level; }) ? src.ports.level : 'none'; ['teuDay', 'imports', 'exports'].forEach(function (k) { o.ports[k] = n(src.ports[k], 0, 0); }); }
  if (src.bike) o.bike.roads = tileMap(src.bike.roads, function (v) { return v === 1; });
  if (src.pedestrian) o.pedestrian.crosswalks = tileMap(src.pedestrian.crosswalks, function (v) { return v === 1; });
  if (src.parking) { o.parking.street = src.parking.street !== false; o.parking.searchMin = n(src.parking.searchMin, 0, 0, 60); }
  const T = src.traffic || {};
  o.traffic.defaultMode = TL_MODES[T.defaultMode] ? T.defaultMode : null;
  o.traffic.modes = tileMap(T.modes, function (v) { return !!TL_MODES[v]; });
  o.traffic.ptPriority = tileMap(T.ptPriority, function (v) { return v === 1; });
  o.traffic.speedMult = n(T.speedMult, 1, 0.5, 1.5);
  o.traffic.oneway = tileMap(T.oneway, function (v) { return v === 1 || v === 2 || v === 3 || v === 4; });
  if (T.stats && typeof T.stats === 'object') Object.keys(o.traffic.stats).forEach(function (k) { o.traffic.stats[k] = n(T.stats[k], 0, 0); });
  if (src.validation && typeof src.validation === 'object') o.validation = { ok: !!src.validation.ok, issues: n(src.validation.issues, 0, 0) | 0, fixed: n(src.validation.fixed, 0, 0) | 0, at: n(src.validation.at, 0, 0) };
  if (src.gen && typeof src.gen === 'object') o.gen = { tier: String(src.gen.tier || '').slice(0, 16), steps: n(src.gen.steps, 0, 0) | 0, at: n(src.gen.at, 0, 0), built: Array.isArray(src.gen.built) ? src.gen.built.slice(0, 30).map(function (s) { return String(s).replace(/[<>]/g, '').slice(0, 80); }) : [] };
  o.hist = Array.isArray(src.hist) ? src.hist.slice(-60).filter(function (h) { return h && typeof h === 'object'; }).map(function (h) { return { d: n(h.d, 0, 0) | 0, commute: n(h.commute, 0, 0), cong: n(h.cong, 0, 0, 100), riders: n(h.riders, 0, 0), rev: n(h.rev, 0) }; }) : [];
  return o;
}
const TL_MODES = { fixed: '⏱ Fixed', adaptive: '📈 Adaptive', smart: '🧠 Smart', emergency: '🚨 Emergency Priority' };
function tpSafe(name, fn) { try { return fn(); } catch (e) { TPE.errors++; TPE.lastErr = name + ': ' + (e && e.message); if (typeof logError === 'function') logError('Transportation ' + name, e && e.message); return null; } }

/* ---------- shared helpers ---------- */
function tpBuilt(test) { return S.buildings.list.filter(function (b) { return b.built && test(bdef(b), b); }); }
function tpScalePop() { const n = AG.citizens.filter(function (c) { return !c.tourist; }).length; return n ? S.city.population / n : 1; }
function tpCatch(b, r) { let homes = 0, jobs = 0; S.buildings.list.forEach(function (o) { if (Math.abs(o.x - b.x) <= r && Math.abs(o.y - b.y) <= r) { homes += o._hcap || 0; jobs += o._actW || 0; } }); return { homes: homes, jobs: jobs }; }
function tpLines(mode) { return S.p9 ? S.p9.transit.lines.filter(function (L) { return !mode || L.mode === mode; }) : []; }
function tpDepots(kind) { return tpBuilt(function (d) { return d.depot === kind; }).length; }
function tpLineLen(L) { let len = 0; for (let k = 0; k < L.stops.length; k++) { const a = MAP.byId.get(L.stops[k]), b = MAP.byId.get(L.stops[(k + 1) % L.stops.length]); if (a && b) len += Math.hypot(a.x - b.x, a.y - b.y); } return len * TILE_METERS / 1000; }   // km

/* ---------- Metro System ---------- */
function tpMetro() {
  const E = typeof metroEngine === 'function' ? metroEngine() : { stations: [], lines: [], riders: 0 }, scale = tpScalePop(), fare = FARE_PER_RIDER * priceLevel(), homesAll = Math.max(1, S.buildings.list.reduce(function (a, b) { return a + (b._hcap || 0); }, 0));
  const waiting = {}; AG.citizens.forEach(function (c) { if (c.transit && c.transit.phase === 'wait') waiting[c.transit.a] = (waiting[c.transit.a] || 0) + 1; });
  const stations = E.stations.map(function (s) {
    const c = tpCatch(s.b, 8), d = bdef(s.b);
    return { id: s.b.id, name: s.name, x: s.b.x, y: s.b.y, capacity: Math.round(s.cap), passengers: Math.round(s.pax), load: s.load, waiting: Math.round((waiting[s.b.id] || 0) * scale), coverage: c.homes / homesAll, revenue: s.pax * fare, maintenance: d.maint * lvlMult(s.b.level), lines: s.lines };
  });
  const lines = tpLines('metro').map(function (L) {
    const st = E.lines.find(function (x) { return x.L === L; }) || {}, len = tpLineLen(L);
    return { id: L.id, name: L.name, color: L.color, stations: L.stops.length, trains: L.vehicles, headway: lineHeadwayMin(L), track: len, tunnel: len, pax: Math.round(st.pax || 0), cap: Math.round(st.cap || 0) };
  });
  return { stations: stations, lines: lines, riders: Math.round(E.riders || 0), depots: tpDepots('metro'), track: lines.reduce(function (a, l) { return a + l.track; }, 0), coverage: stations.reduce(function (a, s) { return a + s.coverage; }, 0) };
}
/* ---------- Bus System ---------- */
function tpBus() {
  const T = tp(), lines = tpLines().filter(function (L) { return L.mode === 'bus' || L.mode === 'tram'; }), h = gameHour();
  const stops = tpBuilt(function (d) { return d.id === 'busstop' || d.id === 'tramstop'; });
  const ls = lines.map(function (L) {
    const sc = T.bus.schedules[L.id] || { start: 5, end: 24, headway: Math.round(lineHeadwayMin(L)) }, inService = h >= sc.start && h < sc.end;
    return { id: L.id, name: L.name, mode: L.mode, color: L.color, stops: L.stops.length, vehicles: L.vehicles, running: AG.vehicles.filter(function (v) { return v.line === L.id; }).length, headway: lineHeadwayMin(L), schedule: sc, inService: inService };
  });
  return { stops: stops.length, depots: tpDepots('bus'), lines: ls, vehicles: AG.vehicles.filter(function (v) { return v.line && (v.type === 'bus' || v.type === 'tram'); }).length };
}
/* ---------- Train System (passenger + cargo → EconomyEngine) ---------- */
function tpRail() {
  const lines = tpLines('train').map(function (L) { return { id: L.id, name: L.name, type: typeof trainType === 'function' ? trainType(L) : 'passenger', trains: L.vehicles, stations: L.stops.length, track: tpLineLen(L) }; });
  const cargo = lines.filter(function (l) { return l.type === 'cargo'; }).reduce(function (a, l) { return a + 2500 * l.trains; }, 0);
  const reg = S.p11 && S.p11.regional ? Object.keys(S.p11.regional).filter(function (k) { return S.p11.regional[k].on; }).length : 0;
  return { stations: tpBuilt(function (d) { return d.id === 'trainstation' || d.id === 'railhub' || d.id === 'centralrail'; }).length, depots: tpDepots('train'), lines: lines, cargoCap: cargo, regional: reg, track: lines.reduce(function (a, l) { return a + l.track; }, 0) };
}
/* ---------- Airport System ---------- */
function tpAirport() {
  const L = S.buildings.list, has = function (id) { return L.some(function (b) { return b.type === id && b.built; }); };
  const lvl = has('megaairport') ? 'mega' : has('airport') ? 'international' : has('regionalairport') ? 'regional' : has('airstrip') ? 'small' : 'none';
  const A = (typeof SV !== 'undefined' && SV.air) || {}, terminals = L.filter(function (b) { return b.type === 'airportterminal' && b.built; }).length;
  const runways = { none: 0, small: 1, regional: 1, international: 2, mega: 4 }[lvl] + Math.floor(terminals / 3);
  const small = L.filter(function (b) { return (b.type === 'airstrip' || b.type === 'regionalairport') && b.built; });
  const smallPax = small.reduce(function (a, b) { return a + (b._op ? bdef(b).transit * 12 * Math.max(0.3, b._eff || 0) : 0); }, 0);
  const pax = (A.served || 0) + smallPax, ap = L.find(function (b) { return (b.type === 'megaairport' || b.type === 'airport' || b.type === 'regionalairport' || b.type === 'airstrip') && b.built; });
  let parking = 0, transit = 0;
  if (ap) L.forEach(function (b) { if (Math.abs(b.x - ap.x) <= 8 && Math.abs(b.y - ap.y) <= 8) { parking += bdef(b).parking || 0; if (bdef(b).transit && b !== ap && !bdef(b).airport) transit++; } });
  return { level: lvl, levelName: AIRPORT_LEVELS.find(function (l) { return l[0] === lvl; })[1], runways: runways, terminals: terminals + (lvl === 'none' ? 0 : 1), gates: (terminals + (lvl === 'none' ? 0 : 1)) * ({ small: 2, regional: 6, international: 12, mega: 20 }[lvl] || 0), passengers: Math.round(pax), baggage: Math.round(pax * 1.3), cargo: Math.round(A.cargo || 0), aircraft: Math.round(A.flights || small.length * 6), load: A.load || 0, parking: Math.round(parking), transitLinks: transit, delay: A.delay || 0 };
}
/* ---------- Port System (imports / exports → EconomyEngine 2.0 trade) ---------- */
function tpPort() {
  const L = S.buildings.list, has = function (id) { return L.some(function (b) { return b.type === id && b.built; }); };
  const lvl = has('megaport') ? 'mega' : has('containerterminal') ? 'industrial' : has('cruiseterminal') ? 'passenger' : has('port') ? 'cargo' : has('smallport') ? 'small' : 'none';
  const P = (typeof SV !== 'undefined' && SV.port) || {}, imp = P.imp || 0, exp = P.exp || 0;     // TEU per day from the supply-chain imports / exports (EconomyEngine)
  const wh = L.filter(function (b) { return b.built && (bdef(b).storage || b.type === 'distcenter'); }).length;
  return { level: lvl, levelName: PORT_LEVELS.find(function (l) { return l[0] === lvl; })[1], containers: Math.round(P.handled || 0), capacity: Math.round(P.cap || 0), ships: Math.round(P.ships || 0), load: P.load || 0, imports: imp, exports: exp, warehouses: wh, logistics: SIM.logiCost || 0 };
}
/* ---------- Bike, Pedestrian, Parking ---------- */
function tpBike() {
  const lanes = S.p11 ? Object.keys(S.p11.bike).length : 0, roads = Object.keys(tp().bike.roads).length;
  const stations = tpBuilt(function (d) { return d.id === 'bikestation'; }).length, parking = tpBuilt(function (d) { return !!d.bikePark; }).reduce(function (a, b) { return a + bdef(b).bikePark; }, 0);
  const M = S.p11 ? S.p11.modal : {};
  return { lanes: lanes, roads: roads, stations: stations, parking: parking, share: M.bike || 0, trips: Math.round((M.bike || 0) * (M.trips || 0)) };
}
function tpPed() {
  const P = S.p11 ? S.p11.ped : {}, cnt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  Object.keys(P).forEach(function (k) { cnt[P[k]] = (cnt[P[k]] || 0) + 1; });
  const W = typeof walkPass === 'function' ? walkPass() : { cells: [] }, sc = W.cells.filter(function (c) { return c.road > 0; });
  const M = S.p11 ? S.p11.modal : {};
  return { sidewalks: cnt[1], streets: cnt[2], plazas: cnt[3], paths: cnt[4], bridges: cnt[5], tunnels: cnt[6], crosswalks: Object.keys(tp().pedestrian.crosswalks).length, walkScore: sc.length ? Math.round(sc.reduce(function (a, c) { return a + c.score; }, 0) / sc.length) : 0, share: M.walk || 0, trips: Math.round((M.walk || 0) * (M.trips || 0)) };
}
function tpParking() {
  const P = typeof parkingPass === 'function' ? parkingPass() : { sup: 0, dem: 0, deficit: 0, ratio: 1 }, L = S.buildings.list;
  const kind = function (t) { return L.filter(function (b) { return b.type === t && b.built; }).reduce(function (a, b) { return a + parkingOf(b); }, 0); };
  const ap = tpAirport();
  const searchMin = P.dem > 0 && P.ratio < 1 ? clamp((1 - P.ratio) * 18, 0, 25) : 1;
  return { supply: Math.round(P.sup), demand: Math.round(P.dem), deficit: Math.round(P.deficit), availability: clamp(P.ratio, 0, 2), street: Math.round(P.street || 0), lots: Math.round(kind('parkinglot')), garages: Math.round(kind('parkinggarage')), parkRide: Math.round(kind('parkride')), airport: ap.parking, searchMin: searchMin };
}
/* street parking: medium and small road tiles each hold a few curb spaces (not on highways or bus / bike lanes) */
(function () {
  const pp = window.parkingPass;
  if (typeof pp !== 'function' || pp.__p19) return;
  window.parkingPass = function () {
    const r = pp.apply(this, arguments);
    if (r._p19 || !S || !S.transportation || !S.transportation.parking.street) return r;
    let street = 0; const n = r.n, bike = S.p11 ? S.p11.bike : {};
    for (let i = 0; i < MAP.roads.length; i++) { const t = MAP.roads[i]; if (!t || t >= 3 || MAP.inter[i] || bike[i]) continue; const x = i % MAP.W, y = (i / MAP.W) | 0, c = r.cells[Math.floor(y / 8) * n + Math.floor(x / 8)]; if (c) { const s = t === 1 ? 2 : 3; c.sup += s; street += s; } }
    let def = 0; r.cells.forEach(function (c) { c.def = Math.max(0, c.dem - c.sup); def += c.def; });
    r.sup += street; r.street = street; r.deficit = def; r.illegal = def * 0.3; r.ratio = r.dem > 0 ? r.sup / r.dem : 1; r._p19 = true;
    if (S.p11) S.p11.parking.illegal = Math.round(r.illegal);
    return r;
  };
  window.parkingPass.__p19 = true;
})();

/* ---------- Transit Line System: line editor ---------- */
function tpLine(id) { return typeof lineById === 'function' ? lineById(id) : tpLines().find(function (L) { return L.id === id; }); }
function tpStopOk(mode, b) { const M = TRANSIT_MODES[mode]; return !!(M && b && b.built && M.stops.indexOf(b.type) >= 0); }
function tpLineCfg(L) { const T = tp(); return T.metro.lines[L.id] || (T.metro.lines[L.id] = { color: null, headway: 0, trains: 0, order: false }); }
function tpLineCreate(mode, stopIds, name) {
  const M = TRANSIT_MODES[mode]; if (!M || !S.p9) return { ok: false, reason: 'Unknown transit mode' };
  const ids = (stopIds || []).map(Number).filter(function (id, i, a) { return a.indexOf(id) === i && tpStopOk(mode, MAP.byId.get(id)); });
  if (ids.length < 2) return { ok: false, reason: 'A ' + M.name + ' line needs at least 2 ' + (M.road ? 'stops' : 'stations') };
  if (ids.length > M.maxStops) return { ok: false, reason: 'At most ' + M.maxStops + ' stations on a ' + M.name + ' line' };
  if (S.p9.transit.lines.length >= 16) return { ok: false, reason: 'At most 16 transit lines' };
  const L = createTransitLine(mode, ids, name); if (!L) return { ok: false, reason: 'The line could not be created' };
  L.stops = ids.slice(); L.auto = false; tpLineCfg(L).order = true;                  // the player's order, not nearest-neighbour
  if (typeof transitRebuild === 'function') transitRebuild(true);
  return { ok: true, L: L, msg: L.name + ' created · ' + ids.length + ' stations' };
}
function tpLineEdit(id, op, a, b) {
  const L = tpLine(id); if (!L) return { ok: false, reason: 'No such line' };
  const M = TRANSIT_MODES[L.mode], cfg = tpLineCfg(L);
  L.auto = false; cfg.order = true;
  if (op === 'add') { const bb = MAP.byId.get(+a); if (!tpStopOk(L.mode, bb)) return { ok: false, reason: 'Not a ' + M.name + ' ' + (M.road ? 'stop' : 'station') }; if (L.stops.indexOf(bb.id) >= 0) return { ok: false, reason: 'Already on the line' }; if (L.stops.length >= M.maxStops) return { ok: false, reason: 'Line is full (' + M.maxStops + ')' }; const at = b === undefined ? L.stops.length : clamp(+b | 0, 0, L.stops.length); L.stops.splice(at, 0, bb.id); }
  else if (op === 'remove') { if (L.stops.length <= 2) return { ok: false, reason: 'A line keeps at least 2 stations' }; const k = L.stops.indexOf(+a); if (k < 0) return { ok: false, reason: 'Not on the line' }; L.stops.splice(k, 1); }
  else if (op === 'move') { const k = L.stops.indexOf(+a), bb = MAP.byId.get(+b); if (k < 0) return { ok: false, reason: 'Not on the line' }; if (!tpStopOk(L.mode, bb) || L.stops.indexOf(bb.id) >= 0) return { ok: false, reason: 'Pick another free ' + (M.road ? 'stop' : 'station') }; L.stops[k] = bb.id; }
  else if (op === 'order') { const k = L.stops.indexOf(+a), to = clamp(k + (+b | 0), 0, L.stops.length - 1); if (k < 0) return { ok: false, reason: 'Not on the line' }; L.stops.splice(to, 0, L.stops.splice(k, 1)[0]); }
  else if (op === 'color') { if (!/^#[0-9a-fA-F]{6}$/.test(a)) return { ok: false, reason: 'Colour must be #rrggbb' }; L.color = a; cfg.color = a; }
  else if (op === 'trains') { const max = M.perLine[1] + (tpDepots(L.mode === 'tram' ? 'bus' : L.mode) ? 4 : 0); L.vehicles = clamp(+a | 0, 1, max); cfg.trains = L.vehicles; }
  else if (op === 'frequency') { const want = clamp(+a, 2, 60); cfg.headway = want; const max = M.perLine[1] + (tpDepots(L.mode === 'tram' ? 'bus' : L.mode) ? 4 : 0); let v = 1; L.vehicles = 1; while (v < max && lineHeadwayMin(L) > want) { v++; L.vehicles = v; } cfg.trains = L.vehicles; }
  else if (op === 'schedule') { const T = tp(), sc = T.bus.schedules[L.id] || { start: 5, end: 24, headway: 10 }; sc.start = clamp(+a | 0, 0, 23); sc.end = clamp(+b | 0, sc.start + 1, 24); T.bus.schedules[L.id] = sc; }
  else if (op === 'rename') { const nm = String(a || '').replace(/[<>]/g, '').trim().slice(0, 28); if (!nm) return { ok: false, reason: 'Empty name' }; L.name = nm; }
  else return { ok: false, reason: 'Unknown edit' };
  L.boardings = L.boardings || 0;
  if (typeof transitRebuild === 'function') transitRebuild(true);
  TRANSIT.legs.clear && TRANSIT.legs.clear();
  return { ok: true, msg: L.name + ' updated' };
}
/* the player's station order survives transitRebuild (which re-orders auto lines only) */
(function () {
  const tr = window.transitRebuild;
  if (typeof tr !== 'function' || tr.__p19) return;
  window.transitRebuild = function () {
    const keep = S && S.p9 && S.transportation ? S.p9.transit.lines.filter(function (L) { const c = S.transportation.metro.lines[L.id]; return c && c.order; }).map(function (L) { return [L, L.stops.slice()]; }) : [];
    const r = tr.apply(this, arguments);
    keep.forEach(function (k) { const L = k[0]; if (S.p9.transit.lines.indexOf(L) < 0) return; const ids = k[1].filter(function (id) { return MAP.byId.has(id); }); if (ids.length >= 2) L.stops = ids; });
    return r;
  };
  window.transitRebuild.__p19 = true;
})();
/* bus schedules: outside service hours the line's road vehicles return to the depot (none spawned) */
(function () {
  const tt = window.transitTick;
  if (typeof tt !== 'function' || tt.__p19) return;
  window.transitTick = function () {
    if (!S || !S.transportation || !S.p9) return tt.apply(this, arguments);
    const h = gameHour(), off = [];
    S.p9.transit.lines.forEach(function (L) { const sc = S.transportation.bus.schedules[L.id]; if (sc && (L.mode === 'bus' || L.mode === 'tram') && !(h >= sc.start && h < sc.end)) { off.push([L, L.vehicles]); L.vehicles = 0; } });
    try { return tt.apply(this, arguments); } finally { off.forEach(function (o) { o[0].vehicles = o[1]; }); }
  };
  window.transitTick.__p19 = true;
})();

/* door-to-door estimate from the agents' home → work distance and congestion (until the modal split has recorded trips) */
function tpCommuteEstimate() { let s = 0, n = 0; AG.citizens.forEach(function (c) { if (c.tourist || !c.work) return; const h = MAP.byId.get(c.home), w = MAP.byId.get(c.work); if (!h || !w) return; const km = (Math.abs(h.x - w.x) + Math.abs(h.y - w.y)) * TILE_METERS / 1000; s += 4 + km / 0.45 * (1 + (SIM.traffic || 0) / 80); n++; }); return n ? s / n : 0; }
/* ---------- dashboard numbers (cached 2 s) ---------- */
function tpStats(force) {
  const now = performance.now();
  if (!force && TPE.cache && now - TPE.at < 2000) return TPE.cache;
  const t0 = now, M = S.p11 ? S.p11.modal : { car: 0.5, walk: 0.2, bike: 0.05, transit: 0.2, trips: 0, avgMin: 20 };
  const metro = tpMetro(), bus = tpBus(), rail = tpRail(), air = tpAirport(), port = tpPort(), bike = tpBike(), ped = tpPed(), park = tpParking();
  const lineStats = typeof p9TransitLineStats === 'function' && S.p9 ? p9TransitLineStats() : [];
  const trainPax = lineStats.filter(function (l) { return l.mode === 'train'; }).reduce(function (a, l) { return a + l.passengers; }, 0) * 86400 / TIME_SCALE * 0.2;
  const pop = S.city.population, trips = pop * 2.2;                          // statistical trips per day (two commutes + errands)
  const cars = Math.round(trips * (M.car + (M.parkride || 0) * 0.5) / 2.4);
  const sv = S.government && S.government.services && S.government.services.transport;
  const rev = lineStats.reduce(function (a, l) { return a + l.income; }, 0) * 86400 / TIME_SCALE, cost = lineStats.reduce(function (a, l) { return a + l.maint; }, 0) * 86400 / TIME_SCALE;
  TPE.cache = {
    cars: cars, carAgents: AG.vehicles.filter(function (v) { return v.type === 'car'; }).length, buses: bus.vehicles, metroPax: metro.riders, trainPax: Math.round(trainPax), airPax: air.passengers, portCargo: port.containers,
    bikeTrips: Math.round(trips * (M.bike || 0)), walkTrips: Math.round(trips * (M.walk || 0)), commute: M.avgMin || tpCommuteEstimate(), congestion: SIM.traffic || 0, parking: park.availability, ptSat: sv ? sv.sat : clamp(100 - (SIM.traffic || 0) * 0.5, 0, 100),
    revenue: rev, cost: cost, modal: M, metro: metro, bus: bus, rail: rail, air: air, port: port, bike: bike, ped: ped, park: park, lines: lineStats, tl: tp().traffic.stats
  };
  TPE.at = now; TPE.prof.stats = performance.now() - t0;
  return TPE.cache;
}

/* ---------- economy integration: good transport → commute ↓, logistics cost ↓, GDP / growth / land value ↑ ---------- */
function partTpMods(m) {
  if (!S || !S.transportation || !S.p11) return;
  const M = S.p11.modal, commute = M.avgMin || 20, R = tpRail(), air = tpAirport(), port = tpPort();
  const freight = clamp(R.cargoCap / 20000, 0, 1) * 0.08 + ({ none: 0, small: 0.01, cargo: 0.04, passenger: 0.02, industrial: 0.06, mega: 0.09 }[port.level]);
  m.logiCost = (m.logiCost || 1) * (1 - freight);                             // cargo rail + port → cheaper logistics
  m.logistics = (m.logistics || 1) * (1 + freight * 0.5);
  m.tour *= 1 + ({ none: 0, small: 0.03, regional: 0.07, international: 0, mega: 0.05 }[air.level]);   // international / mega already add tourists
  m.growth *= clamp(1.04 - Math.max(0, commute - 18) * 0.004, 0.9, 1.05);     // commute time → companies & migration
  m.rev *= 1 + clamp((30 - commute) / 30, -0.5, 0.5) * 0.02;                  // commute → productivity / GDP
}
(function () {
  const gm = window.globalMods;
  if (typeof gm === 'function' && !gm.__p19) { window.globalMods = function () { const m = gm.apply(this, arguments); tpSafe('mods', function () { partTpMods(m); }); return m; }; window.globalMods.__p19 = true; }
  // land value: a station within walking distance raises rents a little (capped)
  const rm = window.rentMult;
  if (typeof rm === 'function' && !rm.__p19) { window.rentMult = function (b) { const v = rm.apply(this, arguments); if (!S || !S.transportation || !b) return v; const g = typeof govGrids === 'function' && S.government ? govGrids().transport : null; return g ? v * (1 + 0.05 * clamp(g[idx(b.x, b.y)] || 0, 0, 1)) : v; }; window.rentMult.__p19 = true; }
})();

/* ---------- hourly tick: cargo trains → economy, levels, history ---------- */
function tpHour() {
  const T = tp(), t0 = performance.now(), R = tpRail(), air = tpAirport(), port = tpPort();
  T.airport.level = air.level; T.airport.paxDay = air.passengers; T.airport.cargoDay = air.cargo;
  T.ports.level = port.level; T.ports.teuDay = port.containers; T.ports.imports = port.imports; T.ports.exports = port.exports;
  // cargo trains move goods from industry: freight revenue for the city (or the player's rail company) and logistics relief
  if (R.cargoCap > 0) {
    const goods = Math.max(0, SIM.goodsProd || 0) * 3600 / TIME_SCALE, tons = Math.min(R.cargoCap / 24, goods * 0.4), val = tons * 0.8 * priceLevel();
    T.rail.cargoTons += tons; T.rail.cargoValue += val; S.budget = Math.min(MONEY_CAP, S.budget + val * 0.15);
  }
  // crosswalks follow the pedestrian network: every signal / stop junction with a sidewalk gets one
  if (S.p11) { const cw = T.pedestrian.crosswalks, ped = S.p11.ped; for (let i = 0; i < MAP.roads.length; i++) if (MAP.inter[i] && ped[i] && (junctionType(i) === 'signal' || junctionType(i) === 'stop')) cw[i] = 1; Object.keys(cw).forEach(function (k) { if (!MAP.inter[k]) delete cw[k]; }); }
  TPE.prof.hour = performance.now() - t0;
}
function tpDay() {
  const T = tp(), s = tpStats(true);
  T.hist.push({ d: gameDay(), commute: Math.round(s.commute * 10) / 10, cong: Math.round(s.congestion), riders: Math.round(s.metroPax + s.trainPax), rev: Math.round(s.revenue - s.cost) }); if (T.hist.length > 60) T.hist.shift();
  T.rail.hist.push(Math.round(T.rail.cargoTons)); if (T.rail.hist.length > 60) T.rail.hist.shift(); T.rail.cargoTons = 0;
}
function tpTick() {
  if (!S || !STARTED || (S.p5 && S.p5.admin.freeze) || (typeof BCT_SANDBOX !== 'undefined' && BCT_SANDBOX.on)) return;
  const T = tp(), hour = Math.floor(S.clock.gameSec / 3600), day = gameDay();
  if (TPE.ref !== T) { TPE.ref = T; TPE.hourKey = -1; TPE.cache = null; TPE.day = day; }
  if (TPE.hourKey !== hour) { TPE.hourKey = hour; tpSafe('hour', tpHour); }
  if (TPE.day !== day) { TPE.day = day; tpSafe('day', tpDay); }
}
if (typeof Game !== 'undefined' && Game.simSystems && !Game.simSystems.some(function (s) { return s.name === 'Transportation3'; })) Game.simSystems.push({ name: 'Transportation3', every: 1, acc: 0, tick: function () { tpTick(); } });
