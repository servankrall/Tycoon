'use strict';
/* BLOCK CITY TYCOON — TRAFFIC 2.0 & TRANSIT NETWORK (Part 9)
   • Lane-based traffic: Small 2 lanes · Medium 4 · Large 6 · Highway 8 (both directions). Vehicles keep a lane, change
     lanes when the lane ahead is slower or blocked (gap check against the target lane) and move to the correct lane
     before a turn (right turn → outer lane, left turn → inner lane).
   • Real junctions: traffic lights with protected left-turn phases and a pedestrian (all-red) phase, roundabouts
     (yield to circulating traffic), priority roads (side streets yield) and all-way stops. TRAFFIC LIGHT AI adapts the
     green times to the measured queues; emergency vehicles pre-empt the lights on their approach.
   • Traffic AI 2.0: every trip compares the main route with an alternative (fastest / least traffic / shortest /
     lowest cost) using live congestion and picks the better one; incidents (accident, road works, road closure,
     flood, breakdown) block tiles and every affected vehicle is re-routed immediately.
   • Emergency AI 2.0: the best unit is chosen by travel time (distance, congestion, road status), station capacity
     and incident priority.
   • Transit network: STOP → LINE → ROUTE → VEHICLE → PASSENGER for Bus, Tram, Metro, Train, Ferry and Airport Shuttle.
     Citizens walk to a stop, wait, ride, get off at the stop nearest to their destination and walk on. */

/* ---------------- Lanes ---------------- */
ROAD_TYPES[1].lanes = 2; ROAD_TYPES[2].lanes = 4; ROAD_TYPES[3].lanes = 6; ROAD_TYPES[4].lanes = 8;
function lanesPerDir(tile) { const rt = ROAD_TYPES[MAP.roads[tile]]; return rt ? Math.max(1, rt.lanes / 2) : 1; }
function laneWidth(n) { return TILE * 0.42 / n; }
/* Lateral offset (relative to the base lane line the waypoints follow, 0.2 tiles right of the centre) */
function laneExtra(lane, n) { return TILE * 0.42 - (Math.min(lane, n - 1) + 0.5) * laneWidth(n) - TILE * 0.2; }
function turnOf(prev, node, next) {
  if (next === node || prev === node) return 'S';
  const W = MAP.W, dx1 = node % W - prev % W, dy1 = ((node / W) | 0) - ((prev / W) | 0), dx2 = next % W - node % W, dy2 = ((next / W) | 0) - ((node / W) | 0);
  const cross = dx1 * dy2 - dy1 * dx2, dot = dx1 * dx2 + dy1 * dy2;
  return cross > 0 ? 'R' : cross < 0 ? 'L' : dot < 0 ? 'U' : 'S';
}
/* Desired lane for the next turn within 3 tiles (right → outer lane 0, left → inner lane) */
function laneIntent(v, n) {
  if (n <= 1) return 0;
  if (v._intentSeg === v.seg) return v._intent;
  let want = Math.min(v.lane || 0, n - 1);
  for (let k = v.seg + 1; k < Math.min(v.path.length - 1, v.seg + 4); k++) {
    const t = turnOf(v.path[k - 1], v.path[k], v.path[k + 1]);
    if (t === 'R') { want = 0; break; }
    if (t === 'L') { want = n - 1; break; }
  }
  if (want === v.lane && n >= 3 && MAP.roads[v.path[v.seg]] === 4 && v.maxSpeed > 44) want = Math.min(n - 1, want + 1);   // faster cars use the inner highway lanes
  v._intentSeg = v.seg; v._intent = want;
  return want;
}
/* Gap check: is the target lane free next to and just ahead of / behind the vehicle? */
function laneFree(v, cand, newLane, n) {
  const off = laneExtra(newLane, n), lw = laneWidth(n);
  const bx = v.x + v.hy * (v.lat || 0), by = v.y - v.hx * (v.lat || 0);
  for (let k = 0; k < cand.length; k++) {
    const o = cand[k]; if (o === v) continue;
    if ((o.hx * v.hx + o.hy * v.hy) < 0.5) continue;
    const dx = o.x - bx, dy = o.y - by, along = dx * v.hx + dy * v.hy, lat = -dx * v.hy + dy * v.hx;
    if (Math.abs(lat - off) < lw * 0.75 && along > -(o.len + v.len) * 0.5 - 6 && along < (o.len + v.len) * 0.5 + 12) return false;
  }
  return true;
}
function tryLaneChange(v, cand, n, toward) {
  if (n <= 1 || (v.laneT || 0) > 0) return false;
  const cur = Math.min(v.lane || 0, n - 1);
  const opts = toward !== undefined ? [toward > cur ? 1 : -1] : (cur < n - 1 ? [1, -1] : [-1, 1]);
  for (let i = 0; i < opts.length; i++) {
    const nl = cur + opts[i]; if (nl < 0 || nl >= n) continue;
    if (laneFree(v, cand, nl, n)) { v.lane = nl; v.laneT = 0.7; if (S.p9) S.p9.traffic.stats.laneChanges++; return true; }
  }
  return false;
}

/* ---------------- Junctions ---------------- */
const JX = { types: new Map(), ver: -1, sig: new Map() };
const JUNCTION_TYPES = { signal: '🚦 Traffic lights', roundabout: '⭕ Roundabout', priority: '🔶 Priority road', stop: '🛑 All-way stop' };
function roadAt(x, y) { return inMap(x, y) ? MAP.roads[idx(x, y)] : 0; }
function autoJunctionType(tile) {
  const W = MAP.W, x = tile % W, y = (tile / W) | 0;
  const ns = Math.max(roadAt(x, y - 1), roadAt(x, y + 1)), ew = Math.max(roadAt(x - 1, y), roadAt(x + 1, y));
  if (Math.max(ns, ew, MAP.roads[tile]) <= 1) return 'stop';
  if (ns !== ew && Math.min(ns, ew) <= 1) return 'priority';
  return 'signal';
}
function junctionType(tile) {
  if (JX.ver !== MAP.version) { JX.types.clear(); JX.ver = MAP.version; }
  let t = JX.types.get(tile);
  if (!t) { t = (S.p9 && S.p9.traffic.junctions[tile]) || autoJunctionType(tile); JX.types.set(tile, t); }
  return t;
}
function setJunctionType(tile, type) {
  if (!S.p9 || !MAP.inter[tile]) return false;
  if (type === 'auto') delete S.p9.traffic.junctions[tile]; else if (JUNCTION_TYPES[type]) S.p9.traffic.junctions[tile] = type; else return false;
  JX.types.delete(tile); JX.sig.delete(tile); return true;
}
/* Signal controller: NS → NS-left → yellow → EW → EW-left → yellow → pedestrians (all red) */
const SIG_PHASES = ['NS', 'NSL', 'Y1', 'EW', 'EWL', 'Y2', 'PED'];
const SIG_BASE = [3.2, 1.0, 0.6, 3.2, 1.0, 0.6, 0.9];
function sigState(tile) {
  let st = JX.sig.get(tile);
  if (!st) { st = { ph: 0, clock: AG.lightClock - (tile * 1.618) % 10.5, dur: SIG_BASE.slice(), pre: null, preUntil: -1, cycles: 0 }; JX.sig.set(tile, st); }
  let el = AG.lightClock - st.clock, guard = 0;
  while (el >= st.dur[st.ph] && guard++ < 16) {
    el -= st.dur[st.ph]; st.clock += st.dur[st.ph]; st.ph = (st.ph + 1) % SIG_PHASES.length;
    if (st.ph === 0) { st.cycles++; sigRetime(tile, st); }
  }
  return st;
}
/* TRAFFIC LIGHT AI: green times follow the queues measured on each approach */
function sigQueues(tile) {
  const W = MAP.W, q = { NS: 0, EW: 0, NSL: 0, EWL: 0 }, H = AG.hash;
  [[-W, 'NS'], [W, 'NS'], [-1, 'EW'], [1, 'EW'], [-2 * W, 'NS'], [2 * W, 'NS'], [-2, 'EW'], [2, 'EW']].forEach(function (o) {
    const t = tile + o[0]; if (t < 0 || t >= MAP.roads.length || !MAP.roads[t]) return;
    const a = H.get(t); if (!a) return;
    a.forEach(function (v) {
      const k = v.path.indexOf(tile, v.seg); if (k < 0 || k - v.seg > 3) return;
      const turn = turnOf(v.path[Math.max(0, k - 1)], tile, v.path[Math.min(k + 1, v.path.length - 1)]);
      if (turn === 'L') q[o[1] + 'L']++; else q[o[1]]++;
    });
  });
  return q;
}
function sigRetime(tile, st) {
  if (!S.p9 || !S.p9.traffic.lightAI) { st.dur = SIG_BASE.slice(); if (hasTech('t_lights')) { st.dur[0] = st.dur[3] = 2.7; } return; }
  const q = sigQueues(tile), tot = q.NS + q.EW + 0.6, budget = hasTech('t_lights') ? 5.6 : 6.4;
  st.dur[0] = clamp(budget * (q.NS + 0.3) / tot, 1.4, 5); st.dur[3] = clamp(budget * (q.EW + 0.3) / tot, 1.4, 5);
  st.dur[1] = q.NSL ? clamp(0.6 + q.NSL * 0.5, 0.8, 2.4) : 0.35; st.dur[4] = q.EWL ? clamp(0.6 + q.EWL * 0.5, 0.8, 2.4) : 0.35;
  st.dur[6] = pedestriansNear(tile) ? 1.1 : 0.25;
  st.q = q;
}
function pedestriansNear(tile) {
  const c = tileCenter(tile); let n = 0;
  if (typeof agentsNear !== 'function') return false;
  agentsNear(c.x, c.y).forEach(function (a) { if (Math.abs(a.x - c.x) < TILE * 1.4 && Math.abs(a.y - c.y) < TILE * 1.4) n++; });
  return n > 0;
}
/* Emergency pre-emption: a siren approaching on one axis turns that axis green */
function sigPreempt(tile, axis) { const st = sigState(tile); st.pre = axis; st.preUntil = AG.lightClock + 1.5; if (S.p9) S.p9.traffic.stats.preempt++; }
function signalGreen(tile, axis, turn) {
  const st = sigState(tile);
  if (st.preUntil > AG.lightClock) return st.pre === axis;
  const ph = SIG_PHASES[st.ph];
  if (ph === axis) return turn !== 'L';
  if (ph === axis + 'L') return turn === 'L' || turn === 'R';
  return false;
}
function signalLight(tile, axis) {
  const st = sigState(tile);
  if (st.preUntil > AG.lightClock) return st.pre === axis ? 'g' : 'r';
  const ph = SIG_PHASES[st.ph];
  if (ph === axis || ph === axis + 'L') return 'g';
  if ((ph === 'Y1' && axis === 'NS') || (ph === 'Y2' && axis === 'EW')) return 'y';
  return 'r';
}
function boxOccupied(node, v, H) {
  const a = H.get(node); if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    const o = a[i]; if (o === v) continue;
    if (o.path[o.seg + 1] === node && o.t > TILE * 0.62) return true;
    if (o.path[o.seg] === node && o.t < TILE * 0.38) return true;
  }
  return false;
}
function majorTrafficNear(node, H) {
  const W = MAP.W, x = node % W, y = (node / W) | 0;
  const ns = Math.max(roadAt(x, y - 1), roadAt(x, y + 1)), ew = Math.max(roadAt(x - 1, y), roadAt(x + 1, y));
  const offs = ns > ew ? [-W, W] : [-1, 1];
  for (let k = 0; k < offs.length; k++) {
    const t = node + offs[k], a = H.get(t); if (!a) continue;
    for (let i = 0; i < a.length; i++) if (a[i].path[a[i].seg + 1] === node && a[i].t > TILE * 0.3) return true;
  }
  return false;
}
function isMajorApproach(node, prev) {
  const W = MAP.W, x = node % W, y = (node / W) | 0;
  const ns = Math.max(roadAt(x, y - 1), roadAt(x, y + 1)), ew = Math.max(roadAt(x - 1, y), roadAt(x + 1, y));
  const fromNS = Math.abs(node - prev) !== 1;
  return fromNS ? ns >= ew : ew >= ns;
}
/* 0 = not at the junction yet · 1 = wait · 2 = cleared to cross */
function junctionRule(v, node, remaining, H, dt) {
  if (!MAP.inter[node] || v.cleared === v.seg + 1 || remaining >= TILE * 0.8) return 0;
  const prev = v.path[v.seg], next = v.path[Math.min(v.seg + 2, v.path.length - 1)];
  const axis = Math.abs(node - prev) === 1 ? 'EW' : 'NS';
  const type = junctionType(node);
  if (v.siren) { if (type === 'signal') sigPreempt(node, axis); return 2; }
  if (remaining <= TILE * 0.32) return 2;
  const turn = turnOf(prev, node, next);
  if (type === 'signal') return signalGreen(node, axis, turn) ? 2 : 1;
  if (type === 'roundabout') return boxOccupied(node, v, H) ? 1 : 2;
  if (type === 'stop') {
    if (v._stopAt !== node) { v._stopAt = node; v._stopT = 0.45; }
    if (v._stopT > 0) { v._stopT -= dt; return 1; }
    return boxOccupied(node, v, H) ? 1 : 2;
  }
  if (type === 'priority') {
    if (isMajorApproach(node, prev)) return 2;
    return (boxOccupied(node, v, H) || majorTrafficNear(node, H)) ? 1 : 2;
  }
  return 2;
}

/* ---------------- Traffic AI 2.0: route alternatives ---------------- */
const ROUTE_MODES = { smart: '🧠 Smart (mixed)', fastest: '⚡ Fastest', shortest: '📏 Shortest', leastTraffic: '🟢 Least traffic', cheapest: '💲 Lowest cost' };
const ROUTE_MODE_IDX = { fastest: 0, shortest: 1, leastTraffic: 2, cheapest: 3 };
function routeModeFor() {
  const m = S.p9 ? S.p9.traffic.routeMode : 'fastest';
  if (m !== 'smart') return ROUTE_MODE_IDX[m] !== undefined ? m : 'fastest';
  const r = Math.random();
  return r < 0.5 ? 'fastest' : r < 0.72 ? 'leastTraffic' : r < 0.87 ? 'shortest' : 'cheapest';
}
/* Estimated travel time (simulated seconds) and congestion of a route */
function routeEstimate(path) {
  let t = 0, c = 0, toll = 0;
  for (let k = 0; k < path.length; k++) {
    const i = path[k], rt = ROAD_TYPES[MAP.roads[i]] || ROAD_TYPES[1], cg = MAP.cong ? MAP.cong[i] : 0;
    t += TILE / (46 * rt.speed) * (1 + 2.5 * cg) + (MAP.inter[i] ? 0.5 : 0) + (MAP.blocked[i] === 4 ? 2 : MAP.blocked[i] ? 25 : 0);
    c += cg; if (rt.id === 4) toll += 0.02;
  }
  return { t: t, cong: path.length ? c / path.length : 0, toll: toll, len: path.length };
}
function routeAIEligible(type, opts) { return !!S.p9 && (type === 'car' || type === 'taxi' || type === 'truck' || type === 'tanker' || type === 'garbage') && !(opts && opts.fixedPath); }
/* Compares the main route with the alternative of the trip's route mode and returns the better one */
function trafficAIChoose(path, type) {
  if (!path || path.length < 6) return { path: path, info: null };
  const a = path[0], b = path[path.length - 1], mode = routeModeFor();
  const main = roadPath(a, b, false, 'shortest') || path;
  const alt = mode === 'shortest' ? main : (roadPath(a, b, false, mode) || main);
  const em = routeEstimate(main), ea = alt === main ? em : routeEstimate(alt);
  let useAlt = false;
  if (alt !== main) {
    if (ea.t < em.t * 0.97) useAlt = true;
    else if (mode === 'leastTraffic' && ea.cong < em.cong * 0.6 && ea.t < em.t * 1.5) useAlt = true;
    else if (mode === 'cheapest' && ea.toll < em.toll && ea.t < em.t * 1.4) useAlt = true;
  }
  const info = { mode: mode, main: em, alt: ea, chosen: useAlt ? 'alternative' : 'main', type: type };
  if (S.p9) { S.p9.traffic.stats.trips++; if (useAlt) S.p9.traffic.stats.alt++; S.p9.traffic.lastChoice = info; }
  return { path: useAlt ? alt : main, info: info };
}
function gameMinutes(simSec) { return Math.max(1, Math.round(simSec * TIME_SCALE / 60)); }
function routeInfoText(ri) {
  if (!ri) return 'Fixed route';
  return 'Mode ' + (ROUTE_MODES[ri.mode] || ri.mode) + ' · main road ' + gameMinutes(ri.main.t) + ' min (' + Math.round(ri.main.cong * 100) + '% busy) · alternative ' + gameMinutes(ri.alt.t) + ' min (' + Math.round(ri.alt.cong * 100) + '% busy) → ' + (ri.chosen === 'alternative' ? 'ALTERNATIVE chosen' : 'main road');
}

/* ---------------- Traffic incidents ---------------- */
const INCIDENT_TYPES = {
  accident: { icon: '💥', name: 'Accident', block: 1, dur: [60, 120], prio: 3 },
  roadwork: { icon: '🚧', name: 'Road works', block: 3, dur: [120, 300], prio: 1 },
  closure: { icon: '⛔', name: 'Road closed', block: 3, dur: [180, 420], prio: 1 },
  flood: { icon: '🌊', name: 'Flooded road', block: 3, dur: [90, 240], prio: 2, radius: 2 },
  breakdown: { icon: '🚗💨', name: 'Vehicle breakdown', block: 4, dur: [40, 90], prio: 1 }
};
function randomRoadTile(filter) { const r = []; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && !MAP.blocked[i] && (!filter || filter(i))) r.push(i); return r.length ? r[Math.floor(Math.random() * r.length)] : -1; }
function createIncident(type, tile, opts) {
  const T = INCIDENT_TYPES[type]; if (!T || !S.p9) return null;
  opts = opts || {};
  if (tile === undefined || tile < 0 || !MAP.roads[tile]) tile = type === 'flood' ? randomRoadTile(function (i) { const x = i % MAP.W, y = (i / MAP.W) | 0; return isWater(x + 1, y) || isWater(x - 1, y) || isWater(x, y + 1) || isWater(x, y - 1) || MAP.nature[i] === 2; }) : randomRoadTile();
  if (tile < 0) tile = randomRoadTile();
  if (tile < 0) return null;
  if (type === 'accident') {
    const acc = triggerAccident(null, tile);
    if (acc) { S.p9.traffic.stats.incidents++; rerouteAround([tile]); }
    return acc ? { type: 'accident', tile: tile } : null;
  }
  const tiles = [tile];
  if (T.radius) { const x0 = tile % MAP.W, y0 = (tile / MAP.W) | 0, r = opts.radius || T.radius; for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (inMap(x, y) && MAP.roads[idx(x, y)] && idx(x, y) !== tile && Math.hypot(x - x0, y - y0) <= r) tiles.push(idx(x, y)); }
  const dur = opts.dur || rand(T.dur[0], T.dur[1]);
  const inc = { id: 'i' + (S.p9.traffic.nextId++), type: type, tile: tile, tiles: tiles, start: S.clock.runSec, until: S.clock.runSec + dur, sev: opts.sev || 1, crew: false };
  tiles.forEach(function (t) { MAP.blocked[t] = Math.max(MAP.blocked[t], T.block); });
  S.p9.traffic.incidents.push(inc);
  S.p9.traffic.stats.incidents++;
  MAP.pathCache.clear();
  const n = rerouteAround(tiles);
  if (type === 'roadwork' || type === 'breakdown') { const v = dispatchMaintenance(tile); if (v) v.incident = inc.id; }
  if (!opts.silent) toast(T.icon + ' ' + T.name + ' on ' + districtName(tile % MAP.W, (tile / MAP.W) | 0) + ' — ' + n + ' vehicle(s) re-routed', type === 'breakdown' ? '' : 'bad');
  return inc;
}
function endIncident(inc) {
  const T = INCIDENT_TYPES[inc.type];
  inc.tiles.forEach(function (t) { if (MAP.blocked[t] === T.block) MAP.blocked[t] = 0; });
  S.p9.traffic.incidents = S.p9.traffic.incidents.filter(function (x) { return x !== inc; });
  MAP.pathCache.clear();
}
function clearIncidents() { S.p9.traffic.incidents.slice().forEach(endIncident); AG.accidents.slice().forEach(function (a) { MAP.blocked[a.tile] = 0; }); AG.accidents.length = 0; MAP.pathCache.clear(); }
/* Every vehicle whose remaining route crosses a blocked tile gets a new route at once */
function rerouteAround(tiles) {
  const set = new Set(tiles); let n = 0;
  AG.vehicles.forEach(function (v) {
    if (v.siren || !v.path || v.line) return;
    let hit = false; for (let k = v.seg + 1; k < v.path.length; k++) if (set.has(v.path[k])) { hit = true; break; }
    if (!hit) return;
    const from = v.path[Math.min(v.seg + 1, v.path.length - 1)], to = v.path[v.path.length - 1];
    if (set.has(to)) return;
    const np = roadPath(from, to, false, v.mode || 'fastest');
    if (!np || np.length < 2 || np.some(function (t) { return set.has(t); })) return;
    v.path = [v.path[v.seg]].concat(np); v.wp = laneWaypoints(v.path); v.seg = 0; v.t = 0; v.cleared = -1; v.stopped = 0; n++;
  });
  if (S.p9) S.p9.traffic.stats.reroutes += n;
  if (S.p6) S.p6.stats.reroutes += n;
  return n;
}
function incidentTick(dt) {
  if (!S.p9) return;
  const now = S.clock.runSec;
  S.p9.traffic.incidents.slice().forEach(function (inc) { if (now >= inc.until) endIncident(inc); });
  if (S.p5.admin.noEvents || S.city.population < 200 || S.p9.freeze.traffic) return;
  const veh = AG.vehicles.length;
  if (S.p9.traffic.incidents.length >= 4) return;
  if (RNG.next() < 0.0016 * dt * veh / 40) createIncident('breakdown', -1, { silent: true });
  const h = gameHour();
  if (h > 8 && h < 18 && RNG.next() < 0.0005 * dt * Math.min(3, MAP.roadCount / 400)) createIncident('roadwork');
  if ((FX.weather === 'heavyrain' || FX.weather === 'storm') && RNG.next() < 0.003 * dt) createIncident('flood');
}
function onIncidentCrew(v) {
  if (!S.p9 || !v.incident) return;
  const inc = S.p9.traffic.incidents.find(function (x) { return x.id === v.incident; }); if (!inc) return;
  inc.crew = true;
  if (inc.type === 'breakdown') inc.until = Math.min(inc.until, S.clock.runSec + 8);          // tow truck clears the lane
  if (inc.type === 'roadwork') inc.until = Math.min(inc.until, S.clock.runSec + 60);          // the crew finishes the works
}
function drawIncidents() {
  if (!S.p9 || !S.p9.traffic.incidents.length) return;
  const T = TILE;
  S.p9.traffic.incidents.forEach(function (inc) {
    const D = INCIDENT_TYPES[inc.type];
    inc.tiles.forEach(function (t, k) {
      const x = (t % MAP.W) * T, y = ((t / MAP.W) | 0) * T;
      if (inc.type === 'flood') { ctx.fillStyle = 'rgba(47,127,191,.55)'; ctx.fillRect(x, y, T, T); }
      else { ctx.fillStyle = 'rgba(255,140,0,.35)'; ctx.fillRect(x + 2, y + 2, T - 4, T - 4); for (let s = 0; s < 4; s++) { ctx.fillStyle = s % 2 ? '#fff' : '#f77f00'; ctx.fillRect(x + 4 + s * 6, y + T - 8, 6, 3); } }
      if (k === 0) drawEmoji(D.icon, x + T / 2, y + T / 2 - 4, 16);
    });
  });
}

/* ---------------- Emergency AI 2.0 ---------------- */
const EMERGENCY_UNITS = {
  fire: { types: ['fire'], vehicle: 'firetruck', name: 'Fire brigade' },
  medical: { types: ['hospital'], vehicle: 'ambulance', name: 'Ambulance' },
  police: { types: ['police'], vehicle: 'police', name: 'Police' },
  maintenance: { types: ['maintdepot', 'townhall', 'fire'], vehicle: 'maint', name: 'Maintenance crew' }
};
function stationCapacity(b) { return 1 + Math.floor(((b.level | 0) || 1) / 2) + (b.type === 'hospital' ? 1 : 0) + (b.type === 'maintdepot' ? 1 : 0); }
function stationActive(b) { let n = 0; for (let i = 0; i < AG.vehicles.length; i++) if (AG.vehicles[i].station === b.id) n++; return n; }
/* Best unit: travel time (distance + congestion + blocked road) + queue penalty when the station has no free vehicle */
function emergencyPick(kind, tile, priority) {
  const def = EMERGENCY_UNITS[kind]; if (!def || tile < 0) return null;
  let best = null;
  S.buildings.list.forEach(function (b) {
    if (def.types.indexOf(b.type) < 0 || !b._op || b._entry < 0 || MAP.comp[b._entry] !== MAP.comp[tile]) return;
    const eta = responseEta(b, tile); if (!isFinite(eta)) return;
    const busy = stationActive(b) >= stationCapacity(b);
    const score = eta + (busy ? 40 + 10 * (priority || 1) : 0) + (b.type === 'townhall' ? 15 : 0);
    if (!best || score < best.score) best = { b: b, eta: eta, busy: busy, score: score };
  });
  return best;
}
function emergencyDispatch(kind, tile, opts) {
  opts = opts || {};
  const def = EMERGENCY_UNITS[kind], r = emergencyPick(kind, tile, opts.priority); if (!r) return null;
  let p = roadPath(r.b._entry, tile, true); if (!p) return null;
  if (p.length === 1) p = [p[0], p[0]];
  const v = makeVehicle(def.vehicle, p, { dest: opts.dest || null });
  if (!v) return null;
  v.station = r.b.id; v.priority = opts.priority || 1; v.emKind = kind;
  if (S.p9) {
    S.p9.emergency.dispatched++;
    S.p9.emergency.log.unshift({ kind: kind, unit: def.name, from: BUILDINGS[r.b.type].name, eta: Math.round(r.eta), busy: r.busy, prio: v.priority, day: gameDay(), hour: Math.floor(gameHour()), where: districtName(tile % MAP.W, (tile / MAP.W) | 0) });
    if (S.p9.emergency.log.length > 25) S.p9.emergency.log.length = 25;
    S.p9.emergency.etaSum += r.eta; S.p9.emergency.etaN++;
  }
  return v;
}

/* ---------------- Transit network: STOP → LINE → ROUTE → VEHICLE → PASSENGER ---------------- */
VEHICLE_SPECS.tram = { len: 26, wid: 8, speed: 34, colors: ['#e63946'] };
VEHICLE_SPECS.shuttle = { len: 16, wid: 8, speed: 44, colors: ['#f1faee'] };
registerBuilding({ id: 'tramstop', name: 'Tram Stop', icon: '🚋', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 6000, color: '#e63946', roof: '#a4161a', height: 9, transit: 400, workers: 3, maxW: 6, power: -2, maint: 1.2, public: true, unlock: { pop: 800 }, desc: 'Trams run on city streets between tram stops. Carries 140 per tram.' });
registerBuilding({ id: 'ferrypier', name: 'Ferry Pier', icon: '⛴️', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 9000, color: '#0096c7', roof: '#023e8a', height: 8, transit: 500, workers: 4, maxW: 8, maint: 1.6, needsWater: true, public: true, unlock: { pop: 600 }, desc: 'Ferries sail between piers across rivers, lakes and the sea.' });
const TRANSIT_MODES = {
  bus: { name: 'Bus', icon: '🚌', stops: ['busstop'], road: true, vehicle: 'bus', cap: 60, color: '#ffb703', maxStops: 8, perLine: [1, 4] },
  tram: { name: 'Tram', icon: '🚋', stops: ['tramstop'], road: true, vehicle: 'tram', cap: 140, color: '#e63946', maxStops: 10, perLine: [1, 4] },
  metro: { name: 'Metro', icon: '🚇', stops: ['metro'], cap: 600, color: '#d62828', speed: 95, maxStops: 12, perLine: [1, 3] },
  train: { name: 'Train', icon: '🚆', stops: ['trainstation'], cap: 900, color: '#bc6c25', speed: 120, maxStops: 10, perLine: [1, 3] },
  ferry: { name: 'Ferry', icon: '⛴️', stops: ['ferrypier', 'port'], water: true, cap: 250, color: '#0096c7', speed: 42, maxStops: 6, perLine: [1, 2] },
  shuttle: { name: 'Airport Shuttle', icon: '🚐', stops: ['airport'], road: true, vehicle: 'shuttle', cap: 40, color: '#f1faee', maxStops: 3, perLine: [1, 2] }
};
const TRANSIT = { pods: [], sig: {}, ver: -1, legs: new Map(), nextPod: 1 };
function transitStops(mode) {
  const M = TRANSIT_MODES[mode];
  return S.buildings.list.filter(function (b) { return M.stops.indexOf(b.type) >= 0 && b.built && (!M.road || b._entry >= 0) && (!M.water || waterTileNear(b) >= 0); });
}
function waterTileNear(b) {
  const d = bdef(b);
  for (let y = b.y - 1; y <= b.y + d.h; y++) for (let x = b.x - 1; x <= b.x + d.w; x++) if (inMap(x, y) && MAP.nature[idx(x, y)] === 2) return idx(x, y);
  return -1;
}
function nnOrder(stops) {
  if (stops.length < 3) return stops.slice();
  const left = stops.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
  const out = [left.shift()];
  while (left.length) {
    const c = out[out.length - 1]; let bi = 0, bd = Infinity;
    left.forEach(function (s, i) { const d = Math.hypot(s.x - c.x, s.y - c.y); if (d < bd) { bd = d; bi = i; } });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}
function lineName(mode, n) { return mode === 'metro' ? 'Metro M' + n : mode === 'train' ? 'Regional Rail R' + n : mode === 'shuttle' ? 'Airport Shuttle A' + n : TRANSIT_MODES[mode].name + ' Line ' + n; }
/* Auto lines follow the stops on the map; manual lines keep their stops (removed stops drop out) */
function transitRebuild(force) {
  if (!S.p9) return;
  const T = S.p9.transit;
  Object.keys(TRANSIT_MODES).forEach(function (mode) {
    const M = TRANSIT_MODES[mode];
    let stops = transitStops(mode);
    if (mode === 'shuttle') {
      const ap = stops[0];
      if (ap) { const hubs = S.buildings.list.filter(function (b) { return (b.type === 'busstop' || b.type === 'metro' || b.type === 'trainstation') && b.built && b._entry >= 0 && MAP.comp[b._entry] === MAP.comp[ap._entry]; }); const c = buildingCenter(ap); hubs.sort(function (a, b) { const ca = buildingCenter(a), cb = buildingCenter(b); return Math.hypot(cb.x - c.x, cb.y - c.y) - Math.hypot(ca.x - c.x, ca.y - c.y); }); stops = [ap].concat(hubs.slice(0, 2)); } else stops = [];
    }
    const sig = stops.map(function (b) { return b.id; }).join(',');
    if (!force && T.sig[mode] === sig) return;
    T.sig[mode] = sig;
    const ids = new Set(stops.map(function (b) { return b.id; }));
    // manual lines: drop missing stops
    T.lines.forEach(function (L) { if (L.mode === mode && !L.auto) L.stops = L.stops.filter(function (id) { return ids.has(id) || (mode === 'shuttle' && MAP.byId.has(id)); }); });
    const manualStops = new Set(); T.lines.forEach(function (L) { if (L.mode === mode && !L.auto) L.stops.forEach(function (id) { manualStops.add(id); }); });
    const keep = T.lines.filter(function (L) { return !(L.mode === mode && L.auto); });
    const free = stops.filter(function (b) { return !manualStops.has(b.id); });
    const fresh = [];
    if (free.length >= 2) {
      const ordered = mode === 'shuttle' ? free : nnOrder(free);
      for (let i = 0; i < ordered.length; i += M.maxStops) {
        let grp = ordered.slice(i, i + M.maxStops);
        if (grp.length < 2 && fresh.length) { fresh[fresh.length - 1].stops.push(grp[0].id); continue; }
        if (grp.length < 2) break;
        const n = keep.filter(function (L) { return L.mode === mode; }).length + fresh.length + 1;
        fresh.push({ id: 'L' + (T.nextId++), mode: mode, name: lineName(mode, n), color: M.color, stops: grp.map(function (b) { return b.id; }), vehicles: clamp(Math.ceil(grp.length / 2), M.perLine[0], M.perLine[1]), auto: true, boardings: 0, pax: 0 });
      }
    }
    T.lines = keep.concat(fresh).filter(function (L) { return L.stops.length >= 2 || L.mode !== mode; }).slice(0, 16);
  });
  // pods of removed lines leave; their passengers get off where they are
  TRANSIT.pods = TRANSIT.pods.filter(function (p) { const ok = T.lines.some(function (L) { return L.id === p.line; }); if (!ok) dropPassengers(p.pax, p.x, p.y); return ok; });
  AG.vehicles.slice().forEach(function (v) { if (v.line && !T.lines.some(function (L) { return L.id === v.line; })) { const i = AG.vehicles.indexOf(v); if (i >= 0) removeVehicle(i, false); } });
  TRANSIT.legs.clear();
}
function lineById(id) { return S.p9 ? S.p9.transit.lines.find(function (L) { return L.id === id; }) : null; }
function createTransitLine(mode, stopIds, name) {
  const M = TRANSIT_MODES[mode]; if (!M || !S.p9) return null;
  const stops = (stopIds || transitStops(mode).map(function (b) { return b.id; })).filter(function (id) { return MAP.byId.has(id); });
  if (stops.length < 2) return null;
  const T = S.p9.transit, n = T.lines.filter(function (L) { return L.mode === mode; }).length + 1;
  const L = { id: 'L' + (T.nextId++), mode: mode, name: name || lineName(mode, n), color: M.color, stops: nnOrder(stops.map(function (id) { return MAP.byId.get(id); })).map(function (b) { return b.id; }), vehicles: clamp(Math.ceil(stops.length / 2), M.perLine[0], M.perLine[1]), auto: false, boardings: 0, pax: 0 };
  T.lines.push(L);
  return L;
}
function removeTransitLine(id) { if (!S.p9) return; S.p9.transit.lines = S.p9.transit.lines.filter(function (L) { return L.id !== id; }); transitRebuild(true); }
/* Leg geometry for rail / water lines (polyline between two stops) */
function transitLeg(L, i) {
  const a = MAP.byId.get(L.stops[i % L.stops.length]), b = MAP.byId.get(L.stops[(i + 1) % L.stops.length]);
  if (!a || !b) return null;
  const key = L.id + ':' + a.id + '>' + b.id + ':' + MAP.version;
  let leg = TRANSIT.legs.get(key); if (leg) return leg;
  let pts;
  if (TRANSIT_MODES[L.mode].water) pts = waterPathBetween(waterTileNear(a), waterTileNear(b));
  if (!pts) pts = [buildingCenter(a), buildingCenter(b)];
  let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  leg = { pts: pts, len: Math.max(1, len) }; TRANSIT.legs.set(key, leg);
  return leg;
}
function waterPathBetween(s, e) {
  if (s < 0 || e < 0) return null;
  const W = MAP.W, N = W * MAP.H, par = new Int32Array(N).fill(-1); const q = [s]; par[s] = s; let h = 0;
  while (h < q.length) {
    const c = q[h++]; if (c === e) break;
    const x = c % W, y = (c / W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { const nx = x + o[0], ny = y + o[1]; if (!inMap(nx, ny)) return; const ni = idx(nx, ny); if (MAP.nature[ni] === 2 && par[ni] < 0) { par[ni] = c; q.push(ni); } });
  }
  if (par[e] < 0) return null;
  const pts = []; let c = e, g = 0; while (c !== s && g++ < N) { pts.push(tileCenter(c)); c = par[c]; } pts.push(tileCenter(s));
  return pts.reverse();
}
function pointOnLeg(leg, d) {
  let acc = 0;
  for (let k = 1; k < leg.pts.length; k++) {
    const a = leg.pts[k - 1], b = leg.pts[k], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + l >= d) { const f = l ? (d - acc) / l : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: Math.atan2(b.y - a.y, b.x - a.x) }; }
    acc += l;
  }
  const z = leg.pts[leg.pts.length - 1], y0 = leg.pts[Math.max(0, leg.pts.length - 2)];
  return { x: z.x, y: z.y, ang: Math.atan2(z.y - y0.y, z.x - y0.x) };
}
/* Vehicles per line: road vehicles for bus / tram / shuttle, pods for metro / train / ferry */
function transitTick(dt) {
  if (!S.p9) return;
  if (TRANSIT.ver !== MAP.version) { TRANSIT.ver = MAP.version; transitRebuild(false); }
  const lines = S.p9.transit.lines;
  lines.forEach(function (L) {
    const M = TRANSIT_MODES[L.mode]; if (!M || L.stops.length < 2) return;
    if (M.road) {
      const have = AG.vehicles.filter(function (v) { return v.line === L.id; }).length;
      if (have < L.vehicles && AG.vehicles.length < perf().veh * PERF.scale + 12) {
        const k = Math.floor(Math.random() * L.stops.length), a = MAP.byId.get(L.stops[k]), b = MAP.byId.get(L.stops[(k + 1) % L.stops.length]);
        if (a && b && a._entry >= 0 && b._entry >= 0) {
          const p = roadPath(a._entry, b._entry);
          if (p && p.length >= 2) { const v = makeVehicle(M.vehicle, p, { route: (k + 1) % L.stops.length, fixedPath: true }); if (v) { v.line = L.id; v.stopIdx = (k + 1) % L.stops.length; v.pax = []; v.capacity = M.cap; v.color = L.color; } }
        }
      } else if (have > L.vehicles) { for (let i = AG.vehicles.length - 1; i >= 0; i--) if (AG.vehicles[i].line === L.id && !(AG.vehicles[i].pax || []).length) { removeVehicle(i, false); break; } }
    } else {
      const pods = TRANSIT.pods.filter(function (p) { return p.line === L.id; });
      if (pods.length < L.vehicles) { const i = Math.floor(Math.random() * L.stops.length), leg = transitLeg(L, i); if (leg) TRANSIT.pods.push({ id: TRANSIT.nextPod++, line: L.id, i: i, d: 0, x: leg.pts[0].x, y: leg.pts[0].y, ang: 0, pax: [], cap: M.cap, dwell: 1 }); }
      else if (pods.length > L.vehicles) { const p = pods.find(function (x) { return !x.pax.length; }); if (p) TRANSIT.pods.splice(TRANSIT.pods.indexOf(p), 1); }
    }
  });
}
/* Metro / train / ferry pods move along their legs at the traffic tick rate */
function transitPods(dt) {
  if (!S.p9 || S.p9.freeze.traffic) return;
  for (let k = TRANSIT.pods.length - 1; k >= 0; k--) {
    const p = TRANSIT.pods[k], L = lineById(p.line); if (!L) { TRANSIT.pods.splice(k, 1); continue; }
    if (p.dwell > 0) { p.dwell -= dt; continue; }
    const leg = transitLeg(L, p.i); if (!leg) { p.i = (p.i + 1) % L.stops.length; continue; }
    p.d += TRANSIT_MODES[L.mode].speed * dt;
    if (p.d >= leg.len) {
      p.d = 0; p.i = (p.i + 1) % L.stops.length; p.dwell = 1.6;
      const stop = MAP.byId.get(L.stops[p.i]); if (stop) { const c = buildingCenter(stop); p.x = c.x; p.y = c.y; transitStopEvent(L, stop, p); }
      continue;
    }
    const q = pointOnLeg(leg, p.d); p.x = q.x; p.y = q.y; p.ang = q.ang;
  }
}
/* Road transit vehicle reached its next stop: passengers get off / on, then the next leg starts */
function transitVehicleArrive(v) {
  const L = lineById(v.line); if (!L || L.stops.length < 2) return false;
  const k = v.stopIdx % L.stops.length, stop = MAP.byId.get(L.stops[k]);
  if (stop) transitStopEvent(L, stop, v);
  for (let tries = 1; tries <= L.stops.length; tries++) {
    const nk = (k + tries) % L.stops.length, a = stop || MAP.byId.get(L.stops[k]), b = MAP.byId.get(L.stops[nk]);
    if (!a || !b || a._entry < 0 || b._entry < 0) continue;
    const p = roadPath(a._entry, b._entry);
    if (p && p.length >= 2) { v.path = p; v.wp = laneWaypoints(p); v.seg = 0; v.t = 0; v.stopIdx = nk; v.route = nk; v.dwell = 1.5; v.cleared = -1; return true; }
  }
  return false;
}
function dropPassengers(ids, x, y) {
  (ids || []).forEach(function (id) {
    const c = AG.citizens.find(function (z) { return z.id === id; }); if (!c) return;
    c.driving = false; c.transit = null; c.x = x; c.y = y; c.path = null; c.state = 'IDLE'; c.thinkAt = 0; c.pending = true;
  });
}
function transitStopEvent(L, stop, veh) {
  const door = doorPoint(stop), M = TRANSIT_MODES[L.mode];
  veh.pax = veh.pax || [];
  // alight
  const stay = [];
  veh.pax.forEach(function (id) {
    const c = AG.citizens.find(function (z) { return z.id === id; });
    if (!c || !c.transit) return;
    if (c.transit.b !== stop.id) { stay.push(id); return; }
    const tgt = citizenBuilding(c.transit.target);
    c.driving = false; c.transit = null; c.x = door.x; c.y = door.y;
    if (tgt) goTo(c, tgt, true); else { c.state = 'IDLE'; c.pending = true; }
  });
  veh.pax = stay;
  // board
  const cap = veh.cap || veh.capacity || M.cap;
  for (let i = 0; i < AG.citizens.length && veh.pax.length < cap; i++) {
    const c = AG.citizens[i];
    if (!c.transit || c.transit.phase !== 'wait' || c.transit.line !== L.id || c.transit.a !== stop.id) continue;
    c.transit.phase = 'ride'; c.driving = true; veh.pax.push(c.id);
    L.boardings++; S.p9.transit.boardings++;
  }
  L.pax = veh.pax.length;
}
/* Trip planning: walk → stop → ride → stop → walk when it is faster than walking and the citizen does not drive */
function transitPlan(c, target) {
  if (!S.p9 || !S.p9.transit.lines.length || !target || target._entry < 0) return false;
  const tc = buildingCenter(target), dist = Math.hypot(tc.x - c.x, tc.y - c.y) / TILE;
  if (dist < 14) return false;
  if (Math.random() > (c.car ? 0.35 : 0.85)) return false;
  let best = null;
  S.p9.transit.lines.forEach(function (L) {
    let ba = null, bb = null, da = 7, db = 7;
    L.stops.forEach(function (id) {
      const s = MAP.byId.get(id); if (!s || !s._op) return;
      const sc = buildingCenter(s), d1 = Math.hypot(sc.x - c.x, sc.y - c.y) / TILE, d2 = Math.hypot(sc.x - tc.x, sc.y - tc.y) / TILE;
      if (d1 < da) { da = d1; ba = s; }
      if (d2 < db) { db = d2; bb = s; }
    });
    if (!ba || !bb || ba === bb) return;
    const ride = Math.hypot(buildingCenter(ba).x - buildingCenter(bb).x, buildingCenter(ba).y - buildingCenter(bb).y) / TILE;
    const cost = da + db + ride / 4;
    if (cost < dist * 0.8 && (!best || cost < best.cost)) best = { L: L, a: ba, b: bb, cost: cost };
  });
  if (!best) return false;
  const from = currentRoadTile(c), path = best.a._entry >= 0 ? roadPath(from, best.a._entry) : null;
  const pts = []; if (path) path.forEach(function (i) { const p = tileCenter(i); pts.push({ x: p.x + c.ox, y: p.y + c.oy }); });
  pts.push(doorPoint(best.a));
  c.transit = { line: best.L.id, a: best.a.id, b: best.b.id, target: target.id, phase: 'walk', since: S.clock.gameSec };
  c.target = target.id; c.inside = 0; c.path = pts; c.pi = 0;
  return true;
}
/* Called when a walking leg ends; returns true when the citizen is now waiting at the stop */
function transitReachedStop(c) {
  if (!c.transit || c.transit.phase !== 'walk') return false;
  c.transit.phase = 'wait'; c.transit.since = S.clock.gameSec; c.path = null;
  return true;
}
function transitWaitTick(c, gs) {
  if (gs - c.transit.since < 40 * 60) return;
  const tgt = citizenBuilding(c.transit.target);            // nothing came: walk instead
  c.transit = null;
  if (tgt) goTo(c, tgt, true); else c.pending = true;
}
function p9TransitLineStats() {
  const riders = SIM.riders || 0, capAll = Math.max(1, SIM.transitCap || 1), fare = FARE_PER_RIDER * priceLevel();
  return S.p9.transit.lines.map(function (L) {
    const M = TRANSIT_MODES[L.mode];
    let cap = 0, maint = 0;
    L.stops.forEach(function (id) { const b = MAP.byId.get(id); if (!b) return; const d = BUILDINGS[b.type]; if (b._op) cap += d.transit * lvlMult(b.level) * (b._eff || 0); maint += d.maint * lvlMult(b.level); });
    const veh = M.road ? AG.vehicles.filter(function (v) { return v.line === L.id; }).length : TRANSIT.pods.filter(function (p) { return p.line === L.id; }).length;
    const agentPax = M.road ? AG.vehicles.filter(function (v) { return v.line === L.id; }).reduce(function (a, v) { return a + (v.pax || []).length; }, 0) : TRANSIT.pods.filter(function (p) { return p.line === L.id; }).reduce(function (a, p) { return a + p.pax.length; }, 0);
    const pass = riders * cap / capAll;
    return { id: L.id, name: L.name, icon: M.icon, mode: L.mode, stations: L.stops.length, stationsLabel: M.road ? 'stops' : 'stations', vehicles: veh, capacity: cap, passengers: pass, aboard: agentPax, boardings: L.boardings, income: pass * fare, maint: maint, auto: L.auto, color: L.color,
      route: L.stops.map(function (id) { const b = MAP.byId.get(id); return b ? districtName(b.x, b.y) || BUILDINGS[b.type].name : '?'; }).join(' → ') + ' → (loop)' };
  });
}
function drawTransitNetwork() {
  if (!S.p9) return false;
  const lines = S.p9.transit.lines;
  lines.forEach(function (L) {
    const M = TRANSIT_MODES[L.mode]; if (M.road) return;
    for (let i = 0; i < L.stops.length; i++) {
      const leg = transitLeg(L, i); if (!leg) continue;
      ctx.beginPath(); ctx.moveTo(leg.pts[0].x, leg.pts[0].y); for (let k = 1; k < leg.pts.length; k++) ctx.lineTo(leg.pts[k].x, leg.pts[k].y);
      if (L.mode === 'metro') { ctx.strokeStyle = 'rgba(214,40,40,.55)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.stroke(); ctx.setLineDash([]); }
      else if (L.mode === 'train') { ctx.strokeStyle = '#6b4f3a'; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(0,150,199,.6)'; ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]); }
    }
  });
  TRANSIT.pods.forEach(function (p) {
    const L = lineById(p.line); if (!L) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang || 0);
    if (L.mode === 'metro') { ctx.fillStyle = 'rgba(214,40,40,.95)'; ctx.fillRect(-14, -3.5, 28, 7); ctx.fillStyle = '#fff'; ctx.fillRect(-11, -1, 22, 2); }
    else if (L.mode === 'train') { for (let c = 0; c < 3; c++) { ctx.fillStyle = c === 0 ? '#bc6c25' : '#dda15e'; ctx.fillRect(-30 + c * 20, -4, 18, 8); } }
    else { ctx.fillStyle = '#f1faee'; ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(9, -5); ctx.lineTo(14, 0); ctx.lineTo(9, 5); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#0096c7'; ctx.fillRect(-8, -3, 12, 6); }
    ctx.restore();
    if (p.pax.length && CAM.zoom > 0.8) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.pax.length, p.x, p.y - 8); }
  });
  return true;
}
/* Roundabout islands and the pedestrian phase of the signals */
function drawJunctions(v) {
  if (CAM.zoom < 0.55) return;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const i = idx(x, y); if (!MAP.inter[i]) continue;
    const t = junctionType(i), px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
    if (t === 'roundabout') { ctx.fillStyle = '#52b788'; ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.283); ctx.stroke(); }
    else if (t === 'stop' && CAM.zoom > 0.9) { ctx.fillStyle = '#d00000'; ctx.fillRect(px - 2.5, py - 2.5, 5, 5); }
    else if (t === 'priority' && CAM.zoom > 0.9) { ctx.fillStyle = '#ffd60a'; ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore(); }
    else if (t === 'signal' && SIG_PHASES[sigState(i).ph] === 'PED' && CAM.zoom > 0.8) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(px - 1.5, py - 4, 3, 8); }
  }
}
function trafficStats2() {
  const t = S.p9 ? S.p9.traffic : null;
  let lanes = 0, multi = 0; AG.vehicles.forEach(function (v) { if ((v.lane || 0) > 0) multi++; lanes++; });
  const jt = { signal: 0, roundabout: 0, priority: 0, stop: 0 };
  for (let i = 0; i < MAP.inter.length; i++) if (MAP.inter[i]) jt[junctionType(i)]++;
  return { vehicles: lanes, innerLanes: multi, junctions: jt, stats: t ? t.stats : {}, incidents: t ? t.incidents.length + AG.accidents.length : AG.accidents.length };
}
