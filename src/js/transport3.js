'use strict';
/* BLOCK CITY TYCOON — ADVANCED TRANSPORT ENGINE (Part 11)
   One transport network (roads, highways, bridges, tunnels, rail, metro, tram, bus, airport, port, ferry), multi-modal
   routing for citizens (walk · bike · car · bus/tram/metro/train/ferry · transfers · park & ride, chosen by time, cost,
   traffic, transfers and comfort), Traffic Light AI 2.0, emergency priority corridors, roundabout AI with congestion
   warnings, road incidents & player road works, metro engine (stations, lines, trains, schedule, capacity, passenger
   flow, line builder, STATION OVERLOAD), passenger / cargo / high-speed trains, regional trains to neighbouring cities,
   dynamic trade routes, parking, pedestrian & bike networks and walkability per district. */

/* ===================================== STATE (S.p11 transport part) ===================================== */
const P11 = { acc: {}, prof: {}, ctrl: false, multi: new Set(), ui: { tab: 'transport', risk: 'all', bookCh: 'history' }, mm: { counts: { walk: 0, bike: 0, car: 0, transit: 0, transfer: 0, parkride: 0 }, min: 0, n: 0 }, rb: new Map(), park: null, parkAt: -99, walk: null, walkAt: -99 };
function p11Every(key, sec, dt) { P11.acc[key] = (P11.acc[key] || 0) + dt; if (P11.acc[key] >= sec) { P11.acc[key] = 0; return true; } return false; }
function p11T(name, f) { const t = performance.now(); f(); const ms = performance.now() - t, q = P11.prof[name] || (P11.prof[name] = { ms: 0, n: 0, max: 0 }); q.ms += ms; q.n++; if (ms > q.max) q.max = ms; }
function tpNew() {
  return {
    ver: 1,
    modal: { walk: 0.3, bike: 0, car: 0.45, transit: 0.25, transfer: 0, parkride: 0, avgMin: 0, trips: 0 },
    lights: { retimes: 0, transitPrio: 0, corridors: 0, log: [] },
    rbStats: { waits: 0, alerts: 0, log: [] },
    works: [], nextWork: 1, worksDone: 0,
    metro: { overloads: 0 },
    trains: {}, regional: {},
    trade: { fees: 0, log: [] },
    ped: {}, bike: {},
    parking: { illegal: 0 }
  };
}
function tpValidate(p) {
  p.lights.log = p10Items(p.lights.log, 12, { t: '', d: 1 });
  p.rbStats.log = p10Items(p.rbStats.log, 12, { t: '', d: 1 });
  p.trade.log = p10Items(p.trade.log, 12, { t: '', d: 1 });
  p.works = p10Items(p.works, 8, { id: 0, name: '', tiles: [], from: [], to: 2, days: 1, start: 0, until: 0, cost: 0, kind: 'upgrade' }, function (w) { return Array.isArray(w.tiles) && w.tiles.length; });
  p.works.forEach(function (w) { w.tiles = w.tiles.slice(0, 120).map(function (t) { return t | 0; }); w.from = w.from.slice(0, 120).map(function (t) { return clamp(t | 0, 1, 4); }); w.to = clamp(w.to | 0, 1, 4); });
  ['ped', 'bike'].forEach(function (k) { const o = {}; let n = 0; for (const i in p[k]) { if (n++ > 30000) break; if (/^\d{1,6}$/.test(i)) o[i] = clamp(p[k][i] | 0, 1, 6); } p[k] = o; });
  for (const id in p.trains) if (TRAIN_TYPES.indexOf(p.trains[id]) < 0) delete p.trains[id];
  for (const id in p.regional) { const r = p.regional[id]; if (!r || typeof r !== 'object') { delete p.regional[id]; continue; } p.regional[id] = { on: !!r.on, trains: clamp(r.trains | 0, 1, 12), pax: +r.pax || 0, cargo: +r.cargo || 0 }; }
}

/* ===================================== TRANSPORT ENGINE: ONE NETWORK ===================================== */
const TP_MODES = [['road', '🛣️', 'Road'], ['highway', '🛣️', 'Highway'], ['bridge', '🌉', 'Bridge'], ['tunnel', '🚇', 'Tunnel'], ['rail', '🚆', 'Railway'], ['metro', '🚇', 'Metro'], ['tram', '🚋', 'Tram'], ['bus', '🚌', 'Bus'], ['airport', '✈️', 'Airport'], ['port', '⚓', 'Port'], ['ferry', '⛴️', 'Ferry']];
function transportNetwork() {
  const out = {}; TP_MODES.forEach(function (m) { out[m[0]] = { n: 0, cap: 0, lines: 0, unit: '' }; });
  for (let i = 0; i < MAP.roads.length; i++) {
    const r = MAP.roads[i]; if (!r) continue;
    const c = ROAD_TYPES[r].cap;
    if (MAP.nature[i] === 2) { out.bridge.n++; out.bridge.cap += c; }
    else if (isTunnel(i)) { out.tunnel.n++; out.tunnel.cap += c; }
    else if (r === 4) { out.highway.n++; out.highway.cap += c; }
    else { out.road.n++; out.road.cap += c; }
  }
  const stopType = { trainstation: 'rail', railhub: 'rail', centralrail: 'rail', metro: 'metro', tramstop: 'tram', busstop: 'bus', airport: 'airport', megaairport: 'airport', airportterminal: 'airport', port: 'port', megaport: 'port', containerterminal: 'port', cruiseterminal: 'port', ferrypier: 'ferry' };
  S.buildings.list.forEach(function (b) { const m = stopType[b.type]; if (!m || !b.built) return; const d = bdef(b); out[m].n++; out[m].cap += (d.transit || d.trade || 0) * lvlMult(b.level) * (b._op ? b._eff : 0); });
  if (S.p9) S.p9.transit.lines.forEach(function (L) { const m = L.mode === 'train' ? 'rail' : L.mode === 'shuttle' ? 'airport' : L.mode; if (out[m]) out[m].lines++; });
  out.road.unit = out.highway.unit = out.bridge.unit = out.tunnel.unit = 'tiles'; ['rail', 'metro', 'tram', 'bus', 'airport', 'port', 'ferry'].forEach(function (k) { out[k].unit = 'stations'; });
  return out;
}

/* ===================================== MULTI-MODAL ROUTING ===================================== */
const MM_MODES = { walk: ['🚶', 'Walk'], bike: ['🚲', 'Bike'], car: ['🚗', 'Car'], transit: ['🚌', 'Transit'], transfer: ['🔁', 'Transit + transfer'], parkride: ['🅿️', 'Park & Ride'] };
const MM_SPEED = { walk: 5, bike: 15, car: 32, bus: 20, tram: 22, metro: 40, train: 60, ferry: 18, shuttle: 30 };   // km/h
function kmOf(a, b) { return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / TILE * TILE_METERS / 1000; }
function nearStops(L, p, maxTiles) {
  let best = null, bd = maxTiles * TILE;
  L.stops.forEach(function (id) { const s = MAP.byId.get(id); if (!s || !s._op) return; const c = buildingCenter(s), d = Math.abs(c.x - p.x) + Math.abs(c.y - p.y); if (d < bd) { bd = d; best = s; } });
  return best;
}
function lineHeadwayMin(L) { const M = TRANSIT_MODES[L.mode]; let len = 0; for (let k = 0; k < L.stops.length; k++) { const a = MAP.byId.get(L.stops[k]), b = MAP.byId.get(L.stops[(k + 1) % L.stops.length]); if (a && b) len += Math.hypot(a.x - b.x, a.y - b.y) * TILE; } const cyc = len / ((M.speed || 30) * p11LineSpeed(L)) + L.stops.length * 1.6; return Math.max(2, cyc / Math.max(1, L.vehicles) * TIME_SCALE / 60); }
function p11LineSpeed(L) { return S.p11 && S.p11.trains[L.id] === 'highspeed' ? 2 : 1; }
function lineCrowding(L) { const cap = TRANSIT_MODES[L.mode].cap * Math.max(1, L.vehicles); return clamp((L.pax || 0) / cap, 0, 1.5); }
/* Builds every option for one trip and scores it: minutes + cost × value of time + traffic + transfers − comfort */
function mmOptions(c, target) {
  const o = { x: c.x, y: c.y }, t = buildingCenter(target), km = kmOf(o, t), out = [];
  const walkComfort = walkFactor(o, t), traffic = SIM.traffic || 0, fare = FARE_PER_RIDER * priceLevel() * 40, rain = FX.weather === 'rain' || FX.weather === 'heavyrain' || FX.weather === 'storm' || FX.weather === 'snow';
  const add = function (mode, min, cost, transfers, comfort, plan) { out.push({ mode: mode, min: min, cost: cost, transfers: transfers, comfort: comfort, plan: plan || null, score: min + cost * 2.5 + transfers * 6 - comfort * 4 }); };
  if (km <= 3) add('walk', km * 1.25 / MM_SPEED.walk * 60 / walkComfort, 0, 0, walkComfort - (km > 1.2 ? 1 : 0) - (rain ? 1.5 : 0));
  const bs = bikeStationNear(o, 4), be = bikeStationNear(t, 4), bikeLane = bikeFactor(o, t);
  if ((bs && be || c.id % 5 === 0) && km <= 8) add('bike', km * 1.25 / (MM_SPEED.bike * bikeLane) * 60, bs ? 0.5 : 0, 0, bikeLane - 0.6 - (rain ? 2 : 0));
  if (c.car) { const pk = parkingAt(t.x, t.y); add('car', km * 1.3 / (MM_SPEED.car * (1 - traffic / 150)) * 60 + pk.search, km * 0.12 * (S.economy.prices.fuel || 1) + pk.fee, 0, 1 - traffic / 80 - pk.search / 10); }
  if (S.p9 && S.p9.transit.lines.length) {
    const lines = S.p9.transit.lines.filter(function (L) { return L.mode !== 'shuttle' && !(S.p11 && S.p11.trains[L.id] === 'cargo'); });
    lines.forEach(function (L) {
      const a = nearStops(L, o, 7), b = nearStops(L, t, 7); if (!a || !b || a === b) return;
      const ac = buildingCenter(a), bc = buildingCenter(b), M = MM_SPEED[L.mode] || 20;
      const min = (kmOf(o, ac) + kmOf(bc, t)) / MM_SPEED.walk * 60 + lineHeadwayMin(L) / 2 + kmOf(ac, bc) * 1.15 / (M * p11LineSpeed(L)) * 60;
      add('transit', min, fare, 0, 1.5 - lineCrowding(L) * 1.5 - (rain ? 0.4 : 0), { line: L.id, a: a.id, b: b.id });
    });
    // one transfer: line 1 near the origin, line 2 near the destination, transfer stops within 3 tiles
    if (lines.length >= 2 && km > 2) for (let i = 0; i < lines.length; i++) {
      const L1 = lines[i], a = nearStops(L1, o, 7); if (!a) continue;
      for (let j = 0; j < lines.length; j++) {
        if (i === j) continue; const L2 = lines[j], b = nearStops(L2, t, 7); if (!b) continue;
        let best = null, bd = 3.5 * TILE;
        L1.stops.forEach(function (s1) { const x1 = MAP.byId.get(s1); if (!x1 || x1 === a) return; L2.stops.forEach(function (s2) { const x2 = MAP.byId.get(s2); if (!x2 || x2 === b) return; const d = Math.abs(x1.x - x2.x) * TILE + Math.abs(x1.y - x2.y) * TILE; if (d < bd) { bd = d; best = [x1, x2]; } }); });
        if (!best) continue;
        const ac = buildingCenter(a), t1 = buildingCenter(best[0]), t2 = buildingCenter(best[1]), bc = buildingCenter(b);
        const min = (kmOf(o, ac) + kmOf(t1, t2) + kmOf(bc, t)) / MM_SPEED.walk * 60 + lineHeadwayMin(L1) / 2 + lineHeadwayMin(L2) / 2 + kmOf(ac, t1) * 1.15 / ((MM_SPEED[L1.mode] || 20) * p11LineSpeed(L1)) * 60 + kmOf(t2, bc) * 1.15 / ((MM_SPEED[L2.mode] || 20) * p11LineSpeed(L2)) * 60;
        add('transfer', min, fare * 1.5, 1, 1.2 - (lineCrowding(L1) + lineCrowding(L2)) * 0.6, { line: L1.id, a: a.id, b: best[0].id, next: { line: L2.id, a: best[1].id, b: b.id } });
      }
    }
    // park & ride: drive to a station with parking, then ride
    if (c.car && km > 4) lines.forEach(function (L) {
      if (L.mode !== 'metro' && L.mode !== 'train' && L.mode !== 'tram') return;
      const b = nearStops(L, t, 7); if (!b) return;
      let pr = null, pd = 15 * TILE;
      L.stops.forEach(function (id) { const s = MAP.byId.get(id); if (!s || s === b || !s._op || s._entry < 0 || stationParking(s) <= 0) return; const sc = buildingCenter(s), d = Math.abs(sc.x - o.x) + Math.abs(sc.y - o.y); if (d < pd) { pd = d; pr = s; } });
      if (!pr) return;
      const pc = buildingCenter(pr), bc = buildingCenter(b);
      const min = kmOf(o, pc) * 1.3 / (MM_SPEED.car * (1 - traffic / 150)) * 60 + 4 + lineHeadwayMin(L) / 2 + kmOf(pc, bc) * 1.15 / ((MM_SPEED[L.mode] || 30) * p11LineSpeed(L)) * 60 + kmOf(bc, t) / MM_SPEED.walk * 60;
      add('parkride', min, kmOf(o, pc) * 0.12 * (S.economy.prices.fuel || 1) + fare + 0.5, 1, 1 - lineCrowding(L), { station: pr.id, line: L.id, a: pr.id, b: b.id });
    });
  }
  return out.sort(function (x, y) { return x.score - y.score; });
}
/* Hook from goTo: picks and starts the best option; returns false when the classic logic should handle the trip */
function p11Route(c, target) {
  if (!S.p11 || c.tourist || !target || target._entry < 0) return false;
  const tc = buildingCenter(target); if ((Math.abs(tc.x - c.x) + Math.abs(tc.y - c.y)) / TILE < 6) return false;
  const opts = mmOptions(c, target); if (!opts.length) return false;
  const best = opts[0];
  mmRecord(best);
  c.mmMode = best.mode; c.mmNext = null;
  switch (best.mode) {
    case 'walk': return mmWalk(c, target, 1);
    case 'bike': return mmWalk(c, target, 3);
    case 'car': return mmCar(c, target);
    case 'transit': case 'transfer': return mmTransit(c, target, best.plan);
    case 'parkride': { const st = MAP.byId.get(best.plan.station); if (!st) return false; c.mmNext = { line: best.plan.line, a: best.plan.a, b: best.plan.b, target: target.id }; return mmCar(c, st); }
  }
  return false;
}
function mmRecord(o) {
  const M = P11.mm; for (const k in M.counts) M.counts[k] *= 0.995; M.counts[o.mode] += 1; M.min = M.min * 0.995 + o.min; M.n = M.n * 0.995 + 1;
  const tot = Object.keys(M.counts).reduce(function (a, k) { return a + M.counts[k]; }, 0) || 1, md = S.p11.modal;
  for (const k in M.counts) md[k] = M.counts[k] / tot;
  md.avgMin = M.min / Math.max(1, M.n); md.trips++;
  SIM.p11ActiveShare = (md.walk || 0) + (md.bike || 0);
}
function mmWalk(c, target, speedMult) {
  c.target = target.id; c.inside = 0;
  const path = roadPath(currentRoadTile(c), target._entry), pts = [];
  if (path) path.forEach(function (i) { const p = tileCenter(i); pts.push({ x: p.x + c.ox, y: p.y + c.oy }); });
  pts.push(doorPoint(target)); c.path = pts; c.pi = 0;
  if (speedMult > 1) { c.baseSpeed = c.baseSpeed || c.speed; c.speed = c.baseSpeed * speedMult; c.biking = true; } else if (c.baseSpeed) { c.speed = c.baseSpeed; c.biking = false; }
  return true;
}
function mmCar(c, target) {
  const path = roadPath(currentRoadTile(c), target._entry);
  if (!path || path.length < 2 || AG.vehicles.length >= perf().veh * PERF.scale) { c.mmNext = null; return false; }
  c.target = target.id; c.inside = 0;
  const v = makeVehicle('car', path, { passenger: c, dest: target });
  if (!v) { c.mmNext = null; return false; }
  c.driving = true; c.path = null; return true;
}
function mmTransit(c, target, plan) {
  const a = MAP.byId.get(plan.a); if (!a) return false;
  const path = a._entry >= 0 ? roadPath(currentRoadTile(c), a._entry) : null, pts = [];
  if (path) path.forEach(function (i) { const p = tileCenter(i); pts.push({ x: p.x + c.ox, y: p.y + c.oy }); });
  pts.push(doorPoint(a));
  c.transit = { line: plan.line, a: plan.a, b: plan.b, target: target.id, phase: 'walk', since: S.clock.gameSec, next: plan.next || null };
  c.target = target.id; c.inside = 0; c.path = pts; c.pi = 0;
  return true;
}
/* Called when a rider gets off: a planned transfer walks to the next line's stop */
function p11TransferLeg(c, door) {
  const nx = c.transit.next, s = MAP.byId.get(nx.a); if (!s) return false;
  const p = doorPoint(s);
  c.transit = { line: nx.line, a: nx.a, b: nx.b, target: c.transit.target, phase: 'walk', since: S.clock.gameSec, next: null };
  c.driving = false; c.x = door.x; c.y = door.y; c.path = [p]; c.pi = 0;
  return true;
}
/* Called from arrive(): park & ride drivers continue by transit */
function p11ContinueTrip(c) {
  const nx = c.mmNext; c.mmNext = null;
  const tgt = citizenBuilding(nx.target), a = MAP.byId.get(nx.a); if (!tgt || !a) return false;
  c.state = c.state || 'IDLE';
  const p = doorPoint(a); c.x = p.x; c.y = p.y;
  c.transit = { line: nx.line, a: nx.a, b: nx.b, target: nx.target, phase: 'wait', since: S.clock.gameSec, next: null };
  c.target = nx.target; c.inside = 0; c.path = null;
  return true;
}

/* ===================================== TRAFFIC LIGHT AI 2.0 ===================================== */
/* Called after the classic queue-based retime: rush hour, direction share, transit and emergency priority */
function p11Retime(tile, st) {
  if (!S.p11 || !st.q) return;
  const q = st.q, h = gameHour(), rush = (h >= 7 && h < 9.5) || (h >= 16.5 && h < 19);
  const ns = q.NS + q.NSL, ew = q.EW + q.EWL, tot = ns + ew;
  let busNS = 0, busEW = 0;
  const H = AG.hash, W = MAP.W;
  [[-W, 'NS'], [W, 'NS'], [-1, 'EW'], [1, 'EW']].forEach(function (o) { const a = H.get(tile + o[0]); if (a) a.forEach(function (v) { if (v.line && v.path[v.seg + 1] === tile) { if (o[1] === 'NS') busNS++; else busEW++; } }); });
  if (rush) { st.dur[0] *= 1.2; st.dur[3] *= 1.2; }
  if (busNS) { st.dur[0] = Math.min(6, st.dur[0] + 0.6); S.p11.lights.transitPrio++; }
  if (busEW) { st.dur[3] = Math.min(6, st.dur[3] + 0.6); S.p11.lights.transitPrio++; }
  S.p11.lights.retimes++;
  st.ai = { ns: tot ? ns / tot : 0.5, ew: tot ? ew / tot : 0.5, rush: rush, bus: busNS + busEW, gNS: st.dur[0], gEW: st.dur[3] };
  if (tot >= 6 && Math.abs(ns - ew) / tot > 0.5) {
    const L = S.p11.lights.log, dom = ns > ew ? 'North–South' : 'East–West', pct = Math.round(Math.max(ns, ew) / tot * 100);
    const txt = (districtName(tile % W, (tile / W) | 0) || 'Junction') + ': ' + dom + ' ' + pct + '% of the queue → green ' + (ns > ew ? st.dur[0] : st.dur[3]).toFixed(1) + ' s' + (rush ? ' (rush hour)' : '');
    if (!L.length || L[0].t !== txt) { L.unshift({ t: txt, d: gameDay() }); if (L.length > 12) L.length = 12; }
  }
}
/* EMERGENCY PRIORITY: the next intersections on a siren vehicle's route are switched to green before it arrives */
function emergencyCorridorTick() {
  if (!S.p11) return;
  const W = MAP.W;
  for (let i = 0; i < AG.vehicles.length; i++) {
    const v = AG.vehicles[i]; if (!v.siren || !v.path) continue;
    let prepared = 0;
    for (let k = v.seg + 1; k < Math.min(v.path.length - 1, v.seg + 10) && prepared < 3; k++) {
      const node = v.path[k]; if (!MAP.inter[node] || junctionType(node) !== 'signal') continue;
      const prev = v.path[k - 1], axis = Math.abs(node - prev) === 1 ? 'EW' : 'NS';
      const st = sigState(node); st.pre = axis; st.preUntil = AG.lightClock + 2; prepared++;
    }
    if (prepared && !v._corr) {
      v._corr = true; S.p11.lights.corridors++;
      const L = S.p11.lights.log, nm = v.type === 'ambulance' ? '🚑 Ambulance' : v.type === 'firetruck' ? '🚒 Fire engine' : v.type === 'police' ? '🚓 Police' : '🚨 Emergency vehicle';
      L.unshift({ t: nm + ' detected → ' + prepared + ' intersection(s) prepared → route cleared', d: gameDay() }); if (L.length > 12) L.length = 12;
    }
  }
}

/* ===================================== ROUNDABOUT AI ===================================== */
/* Entry gives way to vehicles already approaching from the left (inside the roundabout), the box must be clear to enter */
function p11RoundaboutRule(v, node, prev, H) {
  const rec = P11.rb.get(node) || { w: 0, t: 0 }; P11.rb.set(node, rec);
  if (boxOccupied(node, v, H)) { rec.w++; return 1; }
  const d = node - prev, W = MAP.W;
  const left = d === -W ? node - 1 : d === W ? node + 1 : d === 1 ? node - W : node + W;   // approach heading N → circulating traffic comes from W, etc.
  const a = H.get(left);
  if (a) for (let i = 0; i < a.length; i++) { const o = a[i]; if (o !== v && o.path[o.seg + 1] === node && o.t > TILE * 0.35) { rec.w++; return 1; } }
  return 2;
}
function roundaboutTick() {
  const st = S.p11.rbStats;
  P11.rb.forEach(function (rec, tile) {
    st.waits += rec.w;
    rec.load = lerp(rec.load || 0, rec.w, 0.3);
    if (rec.load > 14 && S.clock.runSec - (rec.alertAt || -1e9) > 300) {
      rec.alertAt = S.clock.runSec; st.alerts++;
      const nm = districtName(tile % MAP.W, (tile / MAP.W) | 0) || 'a roundabout';
      st.log.unshift({ t: '⭕ ROUNDABOUT CONGESTION at ' + nm + ' (' + Math.round(rec.load) + ' waiting vehicles / 10 s)', d: gameDay() }); if (st.log.length > 12) st.log.length = 12;
      notify('⭕ ROUNDABOUT CONGESTION at ' + nm + ' — consider traffic lights or a bigger road', 'bad');
    }
    rec.w = 0;
    if (MAP.inter[tile] !== 1 || junctionType(tile) !== 'roundabout') P11.rb.delete(tile);
  });
}

/* ===================================== ROAD INCIDENTS & ROAD WORKS ===================================== */
INCIDENT_TYPES.maintenance = { icon: '🦺', name: 'Road maintenance', block: 4, dur: [120, 260], prio: 1 };
/* Worn road networks get planned maintenance (one lane closed, traffic re-routes around it) */
function roadMaintenanceTick() {
  if (!S.p9 || !S.p10 || S.p9.traffic.incidents.length >= 5) return;
  const worn = Object.keys(S.p10.infra).filter(function (k) { const a = S.p10.infra[k]; return a.k === 'road' && a.cond < 55; });
  if (!worn.length || Math.random() > 0.3) return;
  const a = S.p10.infra[worn[Math.floor(Math.random() * worn.length)]];
  const inc = createIncident('maintenance', a.tile, { silent: true });
  if (inc) { a.cond = Math.min(100, a.cond + 25); }
}
const WORK_KINDS = { upgrade: '⬆️ Upgrade road', highway: '🛣️ Upgrade to highway', repave: '🦺 Repave' };
/* Player road works: lanes close for the duration, traffic re-routes, capacity rises when finished */
function startRoadWorks(tiles, kind, name) {
  const P = S.p11; if (!tiles || !tiles.length) return { ok: false, reason: 'No road tiles selected' };
  tiles = tiles.filter(function (t) { return MAP.roads[t] && !P.works.some(function (w) { return w.tiles.indexOf(t) >= 0; }); }).slice(0, 120);
  if (!tiles.length) return { ok: false, reason: 'These roads already have works' };
  const to = kind === 'highway' ? 4 : kind === 'repave' ? 0 : 0;
  const from = tiles.map(function (t) { return MAP.roads[t]; });
  const target = function (t, i) { return kind === 'highway' ? 4 : kind === 'repave' ? from[i] : Math.min(4, from[i] + 1); };
  let cost = 0; tiles.forEach(function (t, i) { cost += (ROAD_TYPES[target(t, i)].cost * 60 + (kind === 'repave' ? 150 : 0)) * costMult(); });
  if (S.budget < cost) return { ok: false, reason: 'Road works cost ' + money(cost) + ' (city budget ' + money(S.budget) + ')' };
  S.budget -= cost;
  const days = clamp(Math.round(tiles.length / 20 * 10) / 10 + (kind === 'highway' ? 1 : 0.5), 0.5, 4);
  const w = { id: P.nextWork++, name: name || (WORK_KINDS[kind] || 'Road works') + ' — ' + (districtName(tiles[0] % MAP.W, (tiles[0] / MAP.W) | 0) || 'city'), tiles: tiles, from: from, to: to, days: days, start: S.clock.runSec, until: S.clock.runSec + days * 86400 / TIME_SCALE, cost: Math.round(cost), kind: kind };
  P.works.push(w);
  worksApplyClosures();
  rerouteAround(w.tiles.filter(function (t, i) { return i % 2 === 0; }));
  newsAdd('🚧', 'Road works started: ' + w.name, tiles.length + ' road tiles · ' + days + ' days · ' + money(cost) + '. One lane is closed; traffic is re-routed.', { cat: 'traffic' });
  return { ok: true, w: w, msg: w.name + ' — ' + days + ' days, ' + money(cost) };
}
function worksApplyClosures() { if (!S.p11) return; S.p11.works.forEach(function (w) { w.tiles.forEach(function (t, i) { if (i % 2 === 0 && MAP.roads[t] && !MAP.blocked[t]) MAP.blocked[t] = 4; }); }); }
function roadWorksTick() {
  const P = S.p11, now = S.clock.runSec;
  worksApplyClosures();
  let closedCap = 0;
  P.works.forEach(function (w) { w.tiles.forEach(function (t, i) { if (i % 2 === 0 && MAP.roads[t]) closedCap += ROAD_TYPES[MAP.roads[t]].cap * 0.5; }); });
  SIM.p11WorksCap = closedCap;
  P.works.filter(function (w) { return now >= w.until; }).forEach(function (w) {
    w.tiles.forEach(function (t, i) { if (MAP.blocked[t] === 4) MAP.blocked[t] = 0; if (!MAP.roads[t]) return; MAP.roads[t] = w.kind === 'highway' ? 4 : w.kind === 'repave' ? MAP.roads[t] : Math.min(4, Math.max(MAP.roads[t], w.from[i] + 1)); if (S.p10) { const k = 'r' + (Math.floor(((t / MAP.W) | 0) / 8) * (MAP.dN || Math.ceil(MAP.W / 8)) + Math.floor((t % MAP.W) / 8)); if (S.p10.infra[k]) { S.p10.infra[k].cond = 100; S.p10.infra[k].born = gameDay(); } } });
    P.works = P.works.filter(function (x) { return x !== w; }); P.worksDone++;
    onMapChanged(); MAP.pathCache.clear();
    newsAdd('✅', 'Road works finished: ' + w.name, 'Road capacity is up — ' + w.tiles.length + ' tiles reopened.', { cat: 'traffic', cls: 'good' });
  });
}
function corridorTiles() { return typeof highwayCorridor === 'function' ? highwayCorridor() : []; }
function districtRoadTiles(x, y) { const cx = Math.floor(x / 8), cy = Math.floor(y / 8), out = []; for (let yy = cy * 8; yy < cy * 8 + 8; yy++) for (let xx = cx * 8; xx < cx * 8 + 8; xx++) if (inMap(xx, yy) && MAP.roads[idx(xx, yy)]) out.push(idx(xx, yy)); return out; }

/* ===================================== METRO ENGINE ===================================== */
const STATION_CAP = { metro: 15000, trainstation: 20000, railhub: 25000, centralrail: 60000, tramstop: 6000, busstop: 3000 };
function metroEngine() {
  const lines = S.p9 ? S.p9.transit.lines.filter(function (L) { return L.mode === 'metro'; }) : [];
  const day = 86400 / TIME_SCALE, riders = (SIM.riders || 0) * day * 0.2;          // boardings per day (each rider ≈ 5 trips/hour of sim)
  const capAll = Math.max(1, SIM.transitCap || 1);
  const stations = S.buildings.list.filter(function (b) { return b.type === 'metro' && b.built; });
  let metroCap = 0; stations.forEach(function (b) { if (b._op) metroCap += BUILDINGS.metro.transit * lvlMult(b.level) * b._eff; });
  const metroRiders = riders * metroCap / capAll;
  // passenger flow per station ~ homes & jobs in its catchment (8 tiles)
  const w = stations.map(function (s) { let n = 0; S.buildings.list.forEach(function (b) { if (Math.abs(b.x - s.x) <= 8 && Math.abs(b.y - s.y) <= 8) n += (b._hcap || 0) * 0.5 + (b._actW || 0); }); return n + 1; });
  const wsum = w.reduce(function (a, v) { return a + v; }, 0) || 1;
  const st = stations.map(function (s, i) {
    const pax = s._op ? metroRiders * w[i] / wsum : 0, cap = STATION_CAP.metro * lvlMult(s.level) * (s._op ? Math.max(0.3, s._eff) : 0);
    const load = cap > 0 ? pax / cap : 0; s._stOver = load > 1;
    return { b: s, name: districtName(s.x, s.y) || 'Station #' + s.id, pax: pax, cap: cap, load: load, lines: lines.filter(function (L) { return L.stops.indexOf(s.id) >= 0; }).map(function (L) { return L.name; }) };
  });
  const ln = lines.map(function (L) {
    const head = lineHeadwayMin(L), trains = L.vehicles, cap = TRANSIT_MODES.metro.cap * 2 * (24 * 60 / Math.max(1, head));      // both directions, one train every headway
    return { L: L, name: L.name, stations: L.stops.length, trains: trains, headway: head, cap: cap, pax: st.filter(function (s) { return L.stops.indexOf(s.b.id) >= 0; }).reduce(function (a, s) { return a + s.pax; }, 0) };
  });
  return { stations: st, lines: ln, riders: metroRiders };
}
function metroOverloadTick() {
  const E = metroEngine();
  E.stations.forEach(function (s) {
    if (s.load > 1 && !s.b._ovNews) { s.b._ovNews = true; S.p11.metro.overloads++; newsAdd('🚇', 'STATION OVERLOAD: ' + s.name + ' at ' + Math.round(s.load * 100) + '%', fmt(Math.round(s.pax)) + ' passengers/day for ' + fmt(Math.round(s.cap)) + ' capacity. Upgrade the station or add a parallel line.', { cat: 'transport', cls: 'bad' }); }
    if (s.load < 0.9) s.b._ovNews = false;
  });
}
/* METRO LINE BUILDER: two stations → suggested line with the stations in the corridor and new station sites */
function metroSuggest(aId, bId) {
  const A = MAP.byId.get(+aId), B = MAP.byId.get(+bId);
  if (!A || !B || A === B) return { error: 'Pick two different stations' };
  const ax = A.x, ay = A.y, bx = B.x, by = B.y, len = Math.hypot(bx - ax, by - ay);
  const segDist = function (x, y) { const t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / Math.max(1, len * len), 0, 1); return { d: Math.hypot(ax + (bx - ax) * t - x, ay + (by - ay) * t - y), t: t }; };
  const along = [];
  S.buildings.list.forEach(function (b) { if (b.type !== 'metro' || b === A || b === B) return; const q = segDist(b.x, b.y); if (q.d <= 4 && q.t > 0 && q.t < 1) along.push({ id: b.id, t: q.t, name: districtName(b.x, b.y) || 'Station #' + b.id }); });
  along.sort(function (p, q) { return p.t - q.t; });
  // gaps longer than 10 tiles get a new station site near the line
  const pts = [{ t: 0 }].concat(along).concat([{ t: 1 }]), sites = [], d = BUILDINGS.metro, used = new Set();
  for (let k = 1; k < pts.length; k++) {
    const gap = (pts[k].t - pts[k - 1].t) * len, n = Math.floor(gap / 10);
    for (let j = 1; j <= n; j++) {
      const t = pts[k - 1].t + (pts[k].t - pts[k - 1].t) * j / (n + 1), cx = Math.round(ax + (bx - ax) * t), cy = Math.round(ay + (by - ay) * t);
      let found = null;
      for (let r = 0; r <= 3 && !found; r++) for (let y = cy - r; y <= cy + r && !found; y++) for (let x = cx - r; x <= cx + r && !found; x++) { const key = x + ',' + y; if (!used.has(key) && canPlace(d, x, y, true).ok) { found = { x: x, y: y, t: t, name: districtName(x, y) || 'New station' }; used.add(key); } }
      if (found) sites.push(found);
    }
  }
  const cost = sites.length * buildCost(d) + Math.round(len * 900 * costMult());
  return { a: A.id, b: B.id, aName: districtName(A.x, A.y) || 'Station #' + A.id, bName: districtName(B.x, B.y) || 'Station #' + B.id, along: along, sites: sites, length: Math.round(len * TILE_METERS / 100) / 10, cost: cost, skip: [] };
}
function metroBuild(prop, free) {
  if (!prop || prop.error) return { ok: false, reason: 'No proposal' };
  const keepSites = prop.sites.filter(function (s, i) { return prop.skip.indexOf('s' + i) < 0; }), keepAlong = prop.along.filter(function (s) { return prop.skip.indexOf('a' + s.id) < 0; });
  const cost = keepSites.length * buildCost(BUILDINGS.metro) + Math.round(prop.length * 1000 / TILE_METERS * 900 * costMult());
  if (!free && S.budget < cost) return { ok: false, reason: 'The line costs ' + money(cost) + ' (city budget ' + money(S.budget) + ')' };
  const made = [];
  keepSites.forEach(function (s) { if (!canPlace(BUILDINGS.metro, s.x, s.y, true).ok) return; const b = makeBuilding('metro', s.x, s.y); b.owner = 'city'; if (free) { b.built = true; b.progress = 1; } else { b.built = false; b.progress = 0; b.buildTime = buildTimeFor(BUILDINGS.metro.cost); } addBuildingToMap(b); made.push({ b: b, t: s.t }); });
  if (made.length) onMapChanged();
  if (!free) S.budget -= cost;
  const order = [{ id: prop.a, t: 0 }].concat(keepAlong.map(function (s) { return { id: s.id, t: s.t }; }), made.map(function (m) { return { id: m.b.id, t: m.t }; }), [{ id: prop.b, t: 1 }]).sort(function (p, q) { return p.t - q.t; });
  const L = createTransitLine('metro', order.map(function (o) { return o.id; }));
  if (!L) return { ok: false, reason: 'Line could not be created' };
  L.stops = order.map(function (o) { return o.id; });          // keep the corridor order chosen by the builder
  L.vehicles = clamp(Math.ceil(L.stops.length / 2), 1, 4);
  newsAdd('🚇', 'New metro line: ' + L.name, prop.aName + ' → ' + prop.bName + ' · ' + L.stops.length + ' stations (' + made.length + ' new) · ' + prop.length + ' km · ' + money(free ? 0 : cost), { cat: 'transport', fx: [{ k: 'traffic', v: -0.02 }] });
  return { ok: true, L: L, msg: L.name + ': ' + L.stops.length + ' stations, ' + made.length + ' new' };
}

/* ===================================== TRAIN NETWORK & REGIONAL TRAINS ===================================== */
const TRAIN_TYPES = ['passenger', 'cargo', 'highspeed'];
TECH_LIST.push({ id: 't_hsr', cat: 'TRANSPORT', name: 'High-Speed Rail', cost: 1600, req: ['rail'], desc: 'High-speed trains: twice as fast between stations.' });
TECHS.t_hsr = TECH_LIST[TECH_LIST.length - 1];
function trainType(L) { return (S.p11 && S.p11.trains[L.id]) || 'passenger'; }
function setTrainType(id, type) {
  const L = lineById(id); if (!L || L.mode !== 'train') return { ok: false, reason: 'Not a train line' };
  if (type === 'highspeed' && !hasTech('t_hsr') && !(S.p8 && S.p8.unlockAll)) return { ok: false, reason: 'Research High-Speed Rail first' };
  if (TRAIN_TYPES.indexOf(type) < 0) return { ok: false, reason: 'Unknown train type' };
  S.p11.trains[id] = type; return { ok: true, msg: L.name + ' → ' + type + ' trains' };
}
function cargoTrainFreight() { let f = 0; if (S.p9) S.p9.transit.lines.forEach(function (L) { if (L.mode === 'train' && trainType(L) === 'cargo') f += 2500 * L.vehicles; }); return f; }
function regionalRail() {
  const P = S.p11, hasStation = MAP.lists.trains.some(function (b) { return b._op; }) || S.buildings.list.some(function (b) { return (b.type === 'railhub' || b.type === 'centralrail') && b._op; });
  return (S.p9 ? S.p9.neighbors : []).map(function (n) {
    const d = neighborDef(n.id); const r = P.regional[n.id] || { on: false, trains: 2, pax: 0, cargo: 0 };
    const cap = r.trains * 900 * 12, demand = n.pop * 0.004 * (0.5 + n.rel / 100);
    const pax = hasStation && r.on ? Math.min(cap, demand) : 0, cargo = hasStation && r.on ? Math.min(r.trains * 1500, (n.exp + n.imp) * (86400 / TIME_SCALE) * 0.05 + 300) : 0;
    return { id: n.id, name: d.name, icon: d.icon, dir: d.dir, on: !!r.on, trains: r.trains, pax: pax, cargo: cargo, cap: cap, demand: demand, possible: hasStation, cost: r.trains * 8 * costMult() };
  });
}
function regionalToggle(id, on, trains) {
  const P = S.p11; const r = P.regional[id] || (P.regional[id] = { on: false, trains: 2, pax: 0, cargo: 0 });
  if (on !== undefined) r.on = !!on; if (trains) r.trains = clamp(trains, 1, 12);
  return r;
}
/* Hook from neighborLinks: a regional train service strengthens the link (more commuters, tourists and trade) */
function p11RegionalBonus(id) { const r = S.p11 && S.p11.regional[id]; return r && r.on ? 0.08 + 0.02 * r.trains : 0; }
function regionalTick(dt) {
  const R = regionalRail(); let cost = 0, fares = 0;
  R.forEach(function (r) { if (!r.on || !r.possible) return; const st = S.p11.regional[r.id]; st.pax = r.pax; st.cargo = r.cargo; cost += r.cost * dt; fares += r.pax / (86400 / TIME_SCALE) * FARE_PER_RIDER * 3 * dt; });
  S.budget = Math.max(0, S.budget - cost + fares); SIM.p11RegionalNet = (fares - cost) / Math.max(dt, 1e-6);
}

/* ===================================== DYNAMIC TRADE ROUTES ===================================== */
const ROUTE_MODES3 = { road: ['🚚', 'Highway', 0.010], rail: ['🚆', 'Train', 0.006], sea: ['🚢', 'Port', 0.004], air: ['✈️', 'Air cargo', 0.030] };
function tradeRoutes() {
  const ports = MAP.lists.ports.some(function (b) { return b._op; }) || S.buildings.list.some(function (b) { return b.type === 'megaport' && b._op; });
  const rail = MAP.lists.trains.some(function (b) { return b._op; }) || S.buildings.list.some(function (b) { return (b.type === 'railhub' || b.type === 'centralrail') && b._op; });
  const air = typeof airportOperating === 'function' && !!airportOperating();
  const fuel = (S.economy.prices.fuel || 1) / (PRODUCTS.fuel ? PRODUCTS.fuel.base : 1), traffic = SIM.traffic || 0;
  const out = [];
  const partners = (S.p9 ? S.p9.neighbors.map(function (n) { const d = neighborDef(n.id); return { id: n.id, name: d.name, icon: d.icon, dist: 30 + (d.dir.length > 1 ? 15 : 0), road: S.p9 ? edgeRoadTiles(d.dir).length > 0 : true, sea: !!d.sea, air: true, vol: (n.exp || 0) + (n.imp || 0) }; }) : []).concat(WORLD_CITIES.map(function (c) { return { id: c.id, name: c.name, icon: c.icon, dist: 120 + Math.round(Math.hypot(c.x - 0.5, c.y - 0.5) * 200), road: !!MAP.edgeRoad, sea: !!c.port, air: !!c.airport, vol: (SIM.exported || 0) / Math.max(1, WORLD_CITIES.length) }; }));
  partners.forEach(function (p) {
    const opts = [];
    const add = function (m, ok, delayH, fee) { if (!ok) return; const R = ROUTE_MODES3[m]; const cost = p.dist * R[2] * (m === 'road' || m === 'air' ? fuel : 1) + delayH * 0.02 + fee + (m === 'road' ? traffic * 0.0008 * p.dist / 30 : 0); opts.push({ mode: m, cost: cost, delay: delayH, fee: fee }); };
    add('road', p.road, p.dist / 60 * (1 + traffic / 80), 0);
    add('rail', rail, p.dist / 80 + 1, 0.04);
    add('sea', ports && p.sea, p.dist / 30 + 6, 0.05);
    add('air', air && p.air, p.dist / 700 + 2, 0.08);
    opts.sort(function (a, b) { return a.cost - b.cost; });
    out.push({ id: p.id, name: p.name, icon: p.icon, dist: p.dist, vol: p.vol, best: opts[0] || null, opts: opts });
  });
  return out;
}
/* Effects: cheaper routes lower import prices, truck routes add traffic, rail/port routes pay infrastructure fees to the city */
function tradeRoutesTick(dt) {
  const R = tradeRoutes(); let vol = 0, cost = 0, road = 0, fees = 0, base = 0;
  R.forEach(function (r) { if (!r.best || !r.vol) return; vol += r.vol; cost += r.best.cost * r.vol; base += r.dist * ROUTE_MODES3.road[2] * r.vol; if (r.best.mode === 'road') road += r.vol; fees += r.best.fee * r.vol; });
  SIM.p11TradeCost = vol ? cost / Math.max(1e-6, base) : 1;
  SIM.p11TruckShare = vol ? road / vol : 1;
  const fee = fees * 0.5 * dt; S.budget = Math.min(MONEY_CAP, S.budget + fee); S.p11.trade.fees += fee; SIM.p11TradeFees = fee / Math.max(dt, 1e-6);
  const changed = R.filter(function (r) { return r.best && r._prev !== r.best.mode; });
  const sig = R.map(function (r) { return r.id + ':' + (r.best ? r.best.mode : '-'); }).join(',');
  if (S.p11.trade.sig && S.p11.trade.sig !== sig && changed.length) { const L = S.p11.trade.log; L.unshift({ t: 'Trade routes re-optimised: ' + R.filter(function (r) { return r.best; }).map(function (r) { return r.icon + ' ' + ROUTE_MODES3[r.best.mode][0]; }).join(' '), d: gameDay() }); if (L.length > 12) L.length = 12; }
  S.p11.trade.sig = sig;
}

/* ===================================== PARKING ===================================== */
registerBuilding({ id: 'parkinggarage', name: 'Parking Garage', icon: '🅿️', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 22000, color: '#8d99ae', roof: '#495057', height: 26, workers: 4, maxW: 8, power: -3, maint: 3, parking: 600, public: true, unlock: { pop: 1500 }, desc: '600 parking spaces. Less searching for parking, less illegal parking.' });
registerBuilding({ id: 'parkride', name: 'Park & Ride', icon: '🅿️', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 15000, color: '#adb5bd', roof: '#277da1', height: 10, workers: 3, maxW: 6, power: -2, maint: 2, parking: 400, public: true, unlock: { pop: 1500 }, desc: '400 spaces next to a metro / train / tram station: drivers continue by transit.' });
registerBuilding({ id: 'bikestation', name: 'Bike Sharing Station', icon: '🚲', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 2500, color: '#90be6d', roof: '#43aa8b', height: 8, workers: 1, maxW: 2, maint: 0.4, public: true, bikes: 20, unlock: { pop: 300 }, desc: '20 shared bikes. Citizens bike between stations (faster than walking, no traffic).' });
function parkingOf(b) {
  const d = bdef(b); if (!b.built) return 0;
  let p = d.parking || (d.housing ? (b._hcap || d.housing) * 0.35 : d.cap ? d.cap / 60 : d.workers ? d.workers * 0.45 : d.tour ? d.tour / 25 : 0);
  if (b.u && b.u.parking) p *= 1 + 0.5 * b.u.parking;
  return p * (d.parking ? 1 : lvlMult(b.level) * 0.6);
}
function stationParking(s) { let p = 0; S.buildings.list.forEach(function (b) { if ((b.type === 'parkride' || b.type === 'parkinggarage') && b.built && Math.abs(b.x - s.x) <= 4 && Math.abs(b.y - s.y) <= 4) p += bdef(b).parking; }); return p + (s.u && s.u.parking ? 150 * s.u.parking : 0); }
/* Parking supply vs demand per 8×8 district (cars of residents, workers and visitors) */
function parkingPass() {
  if (P11.park && performance.now() - P11.parkAt < 3000) return P11.park;
  const n = MAP.dN || Math.ceil(MAP.W / 8), cells = [], carShare = clamp((S.p11 ? S.p11.modal.car + S.p11.modal.parkride * 0.5 : 0.45), 0.05, 0.95);
  for (let i = 0; i < n * n; i++) cells.push({ sup: 0, dem: 0 });
  S.buildings.list.forEach(function (b) {
    const c = cells[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)]; if (!c) return;
    c.sup += parkingOf(b);
    if (!b._op) return;
    const d = bdef(b); c.dem += ((d.housing ? (b._cust || 0) * 0.4 : 0) + (b._actW || 0) * 0.55 + (b._cust && !d.housing ? b._cust * 0.04 : 0)) * carShare;
  });
  let sup = 0, dem = 0, def = 0;
  cells.forEach(function (c) { sup += c.sup; dem += c.dem; c.def = Math.max(0, c.dem - c.sup); def += c.def; });
  const illegal = def * 0.3;
  if (S.p11) S.p11.parking.illegal = Math.round(illegal);
  P11.park = { cells: cells, n: n, sup: sup, dem: dem, deficit: def, illegal: illegal, ratio: dem > 0 ? sup / dem : 1 }; P11.parkAt = performance.now();
  return P11.park;
}
function parkingAt(x, y) { const P = parkingPass(), c = P.cells[Math.floor(y / TILE / 8) * P.n + Math.floor(x / TILE / 8)]; if (!c || c.dem <= 0) return { search: 1, fee: 0.2 }; const r = c.sup / c.dem; return { search: r >= 1 ? 1 : clamp(1 + (1 - r) * 12, 1, 14), fee: 0.2 + Math.max(0, 1 - r) * 1.5 }; }
function p11ParkingHap() { const P = parkingPass(); if (S.city.population < 1500 || P.dem <= 0) return 0; return -clamp(P.deficit / P.dem * 10, 0, 6); }

/* ===================================== PEDESTRIAN & BIKE NETWORKS, WALKABILITY ===================================== */
const PED_TYPES = { 1: ['Sidewalk', '#ced4da'], 2: ['Pedestrian street', '#e9ecef'], 3: ['Plaza', '#f1e3c6'], 4: ['Park path', '#b7d7a8'], 5: ['Pedestrian bridge', '#dee2e6'], 6: ['Pedestrian tunnel', '#adb5bd'] };
/* Paint a pedestrian element on tile i (sidewalks on roads; paths / plazas / bridges / tunnels elsewhere) */
function paintPed(i, kind) {
  const P = S.p11; if (!P) return false;
  if (kind === 'erase') { const had = P.ped[i] || P.bike[i]; delete P.ped[i]; delete P.bike[i]; return !!had; }
  if (kind === 'bike') { if (!MAP.roads[i]) return false; P.bike[i] = 1; return true; }
  let t;
  if (MAP.roads[i]) t = 1;
  else if (MAP.occ[i]) return false;
  else if (MAP.nature[i] === 2) t = 5;
  else if (MAP.terrain[i] === TERRAIN.ROCK) t = 6;
  else { const z = MAP.zone[i]; const near = buildingAtTile(i % MAP.W + 1, (i / MAP.W) | 0) || buildingAtTile(i % MAP.W - 1, (i / MAP.W) | 0); t = kind === 'plaza' ? 3 : near && bdef(near).hap ? 4 : z === 2 ? 2 : 4; }
  P.ped[i] = t; return true;
}
function pedCost(i) { const t = MAP.roads[i] ? 1 : MAP.nature[i] === 2 ? 5 : MAP.terrain[i] === TERRAIN.ROCK ? 6 : 2; return ({ 1: 15, 2: 25, 3: 30, 4: 12, 5: 400, 6: 600 })[t] * costMult(); }
function bikeStationNear(p, tiles) { const L = S.buildings.list; for (let k = 0; k < L.length; k++) { const b = L[k]; if (b.type === 'bikestation' && b._op && Math.abs((b.x + 0.5) * TILE - p.x) + Math.abs((b.y + 0.5) * TILE - p.y) <= tiles * TILE) return b; } return null; }
function cellScore(p, key) { const W = walkPass(), c = W.cells[Math.floor(p.y / TILE / 8) * W.n + Math.floor(p.x / TILE / 8)]; return c ? c[key] : 0; }
function walkFactor(a, b) { return 0.85 + 0.3 * (cellScore(a, 'score') + cellScore(b, 'score')) / 200; }
function bikeFactor(a, b) { return 0.8 + 0.4 * (cellScore(a, 'bike') + cellScore(b, 'bike')) / 2; }
/* WALKABILITY per district: sidewalks, shops, parks, schools, transit and crossings */
function walkPass() {
  if (P11.walk && performance.now() - P11.walkAt < 4000 && P11.walk.w === MAP.W) return P11.walk;
  const n = MAP.dN || Math.ceil(MAP.W / 8), cells = [];
  for (let i = 0; i < n * n; i++) cells.push({ road: 0, side: 0, ped: 0, bikeL: 0, shops: 0, parks: 0, schools: 0, transit: 0, cross: 0, score: 0, bike: 0 });
  const ped = S.p11 ? S.p11.ped : {}, bike = S.p11 ? S.p11.bike : {};
  for (let i = 0; i < MAP.roads.length; i++) {
    const x = i % MAP.W, y = (i / MAP.W) | 0, c = cells[Math.floor(y / 8) * n + Math.floor(x / 8)]; if (!c) continue;
    if (MAP.roads[i]) { c.road++; if (ped[i]) c.side++; if (bike[i]) c.bikeL++; if (MAP.inter[i] && (junctionType(i) === 'signal' || junctionType(i) === 'stop')) c.cross++; }
    else if (ped[i]) c.ped++;
  }
  S.buildings.list.forEach(function (b) {
    if (!b._op) return; const c = cells[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)]; if (!c) return; const d = bdef(b);
    if (d.sector === 'FOOD' || d.sector === 'SHOPPING') c.shops++; if (d.hap > 0) c.parks++; if (d.edu) c.schools++; if (d.transit && d.cat === 'Transport') c.transit++; if (b.type === 'bikestation') c.bikeL += 4;
  });
  let tot = 0, nn = 0;
  cells.forEach(function (c) {
    const sideCov = c.road ? clamp(c.side / c.road + c.ped / Math.max(4, c.road), 0, 1) : (c.ped ? 1 : 0);
    c.score = Math.round(30 * sideCov + 20 * Math.min(1, c.shops / 4) + 15 * Math.min(1, c.parks / 2) + 10 * Math.min(1, c.schools) + 15 * Math.min(1, c.transit / 2) + 10 * Math.min(1, c.cross / 3));
    c.bike = c.road ? clamp(c.bikeL / c.road, 0, 1) : 0;
    if (c.road || c.shops) { tot += c.score; nn++; }
  });
  P11.walk = { cells: cells, n: n, avg: nn ? tot / nn : 0, w: MAP.W }; P11.walkAt = performance.now();
  return P11.walk;
}

/* ===================================== MODIFIERS (from globalMods) ===================================== */
function transportMods(m) {
  if (SIM.p11WorksCap && MAP.roadCapSum) m.roadCap = (m.roadCap || 1) * Math.max(0.5, 1 - SIM.p11WorksCap / MAP.roadCapSum);
  const P = parkingPass(); if (P.dem > 0 && S.city.population > 1500) m.traffic = (m.traffic || 1) * (1 + clamp(P.illegal / P.dem, 0, 0.3) * 0.5);
  if (SIM.p11TradeCost) m.importMult = (m.importMult || 1) * clamp(0.85 + 0.15 * SIM.p11TradeCost, 0.8, 1.15);
  if (SIM.p11TruckShare !== undefined) m.traffic = (m.traffic || 1) * (0.97 + 0.03 * SIM.p11TruckShare);
  return m;
}
