'use strict';
/* BLOCK CITY TYCOON — TRANSPORTATION ENGINE 3.0 · TRAFFIC AI, GENERATORS, VALIDATOR (Part 19)
   TrafficAI 3.0 / IntersectionAI   per-junction light modes Fixed · Adaptive · Smart · Emergency Priority (wraps the Part 9
                                    signal controller and the Part 11 Light AI), public-transport priority with its cost to cars
   RoutingSystem                    congestion PREDICTION (trend + planned load of every vehicle's next tiles) and dynamic
                                    rerouting on the way — with a diversion budget and a penalty for corridors that already took
                                    diverted cars, so not everyone jumps to the same alternative
   EmergencyPrioritySystem          longer look-ahead green corridors for sirens at Emergency-Priority junctions
   City Transport Generator         14-step analysis → Smart Metro · Smart Bus · rail · airport / port links · bike · walking ·
                                    parking · emergency routes; tiers Small / Medium / Large / Mega
   Transport Validator + Auto Fix   disconnected station, dead-end route, impossible track, missing depot, no road access,
                                    no power, no passenger demand, overloaded station, broken line, invalid vehicle
   No vehicle is re-pathed every frame: prediction runs once a second, rerouting checks a small budget every 2 s. */

const TPAI = { pred: null, prev: null, slope: null, ver: -1, rr: new Map(), window: [], at: 0, rrAt: 0, prof: { pred: 0, route: 0 } };

/* ---------- Traffic Light AI 3.0 ---------- */
function tpLightMode(tile) {
  const T = S.transportation && S.transportation.traffic; if (!T) return S.p9 && S.p9.traffic.lightAI ? 'adaptive' : 'fixed';
  return T.modes[tile] || T.defaultMode || (S.p9 && S.p9.traffic.lightAI ? 'adaptive' : 'fixed');
}
function tpSetLightMode(tile, mode) {
  const T = tp().traffic;
  if (tile === 'all') { if (mode !== 'auto' && !TL_MODES[mode]) return { ok: false, reason: 'Unknown mode' }; T.defaultMode = mode === 'auto' ? null : mode; JX.sig.clear(); return { ok: true, msg: 'All junctions → ' + (mode === 'auto' ? 'automatic' : TL_MODES[mode]) }; }
  tile = +tile; if (!MAP.inter[tile]) return { ok: false, reason: 'Not a junction' };
  if (mode === 'auto') delete T.modes[tile]; else if (TL_MODES[mode]) T.modes[tile] = mode; else return { ok: false, reason: 'Unknown mode' };
  JX.sig.delete(tile);
  return { ok: true, msg: 'Junction → ' + (mode === 'auto' ? 'automatic' : TL_MODES[mode]) };
}
function tpSetPtPriority(tile, on) { const P = tp().traffic.ptPriority; tile = +tile; if (!MAP.inter[tile]) return { ok: false, reason: 'Not a junction' }; if (on) P[tile] = 1; else delete P[tile]; return { ok: true, msg: 'Public transport priority ' + (on ? 'ON' : 'OFF') }; }
(function () {
  const sr = window.sigRetime;
  if (typeof sr !== 'function' || sr.__p19) return;
  window.sigRetime = function (tile, st) {
    if (!S || !S.transportation || !S.p9) return sr.apply(this, arguments);
    const mode = tpLightMode(tile), T = S.transportation.traffic, ai = S.p9.traffic.lightAI;
    S.p9.traffic.lightAI = mode !== 'fixed';                // fixed → base timings · adaptive / smart / emergency → queue-adaptive
    try { sr.call(this, tile, st); } finally { S.p9.traffic.lightAI = ai; }
    if (mode === 'smart' && TPAI.pred) {
      // SMART: green follows queues AND the traffic predicted to arrive in the next seconds (3 tiles up each approach)
      const W = MAP.W, P = TPAI.pred, up = function (o) { let s = 0; for (let k = 1; k <= 3; k++) { const t = tile + o * k; if (t >= 0 && t < P.length && MAP.roads[t]) s += P[t]; } return s; };
      const ns = up(-W) + up(W), ew = up(-1) + up(1), tot = ns + ew + 0.4, q = st.q || { NS: 0, EW: 0 };
      const budget = st.dur[0] + st.dur[3], wNS = (q.NS + 0.3) + ns * 2, wEW = (q.EW + 0.3) + ew * 2;
      st.dur[0] = clamp(budget * wNS / (wNS + wEW), 1.2, 5.5); st.dur[3] = clamp(budget * wEW / (wNS + wEW), 1.2, 5.5);
      st.smart = { ns: ns / tot, ew: ew / tot };
    }
    if (T.ptPriority[tile] && st.ai && st.ai.bus) {
      // PUBLIC TRANSPORT PRIORITY: the axis with a bus / tram gets an extra green; cars on the other axis wait for it
      const busNS = st.q && st.ai.gNS >= st.ai.gEW, add = 1.2;
      if (busNS) st.dur[0] = Math.min(6.5, st.dur[0] + add); else st.dur[3] = Math.min(6.5, st.dur[3] + add);
      T.stats.ptGreen++; T.stats.privDelay += add * ((st.q ? (busNS ? st.q.EW : st.q.NS) : 0) || 0);
    }
    st.mode = mode;
  };
  window.sigRetime.__p19 = true;
  // EMERGENCY PRIORITY: at Emergency-mode junctions the corridor opens up to 16 tiles ahead (normal: 10)
  const ec = window.emergencyCorridorTick;
  if (typeof ec === 'function' && !ec.__p19) {
    window.emergencyCorridorTick = function () {
      const r = ec.apply(this, arguments);
      if (!S || !S.transportation) return r;
      for (let i = 0; i < AG.vehicles.length; i++) {
        const v = AG.vehicles[i]; if (!v.siren || !v.path) continue;
        for (let k = v.seg + 10; k < Math.min(v.path.length - 1, v.seg + 16); k++) {
          const node = v.path[k]; if (!MAP.inter[node] || junctionType(node) !== 'signal' || tpLightMode(node) !== 'emergency') continue;
          const st = sigState(node); if (st.preUntil <= AG.lightClock) S.transportation.traffic.stats.emPreempt++; st.pre = Math.abs(node - v.path[k - 1]) === 1 ? 'EW' : 'NS'; st.preUntil = AG.lightClock + 2.5;
        }
      }
      return r;
    };
    window.emergencyCorridorTick.__p19 = true;
  }
})();

/* ---------- congestion prediction (1 Hz) ---------- */
function tpPredictTick() {
  if (!S || !S.transportation || !MAP.cong || !MAP.roads) return;
  const t0 = performance.now(), N = MAP.roads.length;
  if (!TPAI.pred || TPAI.pred.length !== N || TPAI.ver !== MAP.W) { TPAI.pred = new Float32Array(N); TPAI.prev = new Float32Array(MAP.cong); TPAI.slope = new Float32Array(N); TPAI.ver = MAP.W; }
  const P = TPAI.pred, C = MAP.cong, prev = TPAI.prev, sl = TPAI.slope;
  for (let i = 0; i < N; i++) { if (!MAP.roads[i]) { P[i] = 0; continue; } sl[i] = sl[i] * 0.8 + (C[i] - prev[i]) * 0.2; prev[i] = C[i]; P[i] = C[i] + sl[i] * 6; }
  // planned load: every vehicle adds a little to the next 10 tiles of its route (where it will be soon)
  for (let k = 0; k < AG.vehicles.length; k++) { const v = AG.vehicles[k]; if (!v.path || v.ghost) continue; for (let j = v.seg + 1; j < Math.min(v.path.length, v.seg + 11); j++) P[v.path[j]] += 0.05 / (1 + (j - v.seg) * 0.15) / Math.max(1, (ROAD_TYPES[MAP.roads[v.path[j]]] || ROAD_TYPES[1]).cap / 6); }
  for (let i = 0; i < N; i++) if (P[i] > 1.6) P[i] = 1.6; else if (P[i] < 0) P[i] = 0;
  S.transportation.traffic.stats.predicted++;
  TPAI.prof.pred = performance.now() - t0;
}
function tpPredAt(i) { return TPAI.pred ? TPAI.pred[i] : (MAP.cong ? MAP.cong[i] : 0); }
function tpRouteCost(path, from) {
  let t = 0; for (let k = from || 0; k < path.length; k++) { const i = path[k], rt = ROAD_TYPES[MAP.roads[i]] || ROAD_TYPES[1]; t += TILE / (46 * rt.speed) * (1 + 2.5 * tpPredAt(i) + 0.12 * (TPAI.rr.get(i) || 0)) + (MAP.inter[i] ? 0.5 : 0) + (MAP.blocked[i] === 4 ? 2 : MAP.blocked[i] ? 25 : 0); }
  return t;
}
/* ---------- dynamic routing on the way (every 2 s, small budget, diversion cap) ---------- */
function tpRerouteTick() {
  if (!S || !S.transportation || !S.p9 || !TPAI.pred || typeof laneWaypoints !== 'function') return;
  const t0 = performance.now(), now = S.clock.runSec, T = S.transportation.traffic.stats, V = AG.vehicles;
  TPAI.rr.forEach(function (v, k) { const n = v * 0.85; if (n < 0.2) TPAI.rr.delete(k); else TPAI.rr.set(k, n); });         // diverted-traffic memory fades
  TPAI.window = TPAI.window.filter(function (t) { return now - t < 10; });
  const cap = Math.max(2, Math.ceil(V.length * 0.15)) - TPAI.window.length;    // at most 15 % of the cars change route per 10 s
  let checked = 0, switched = 0;
  for (let n = 0; n < V.length && checked < 12 && switched < cap; n++) {
    const v = V[(TPAI.rrAt + n) % V.length];
    if (!v.path || v.siren || v.line || v.ghost || v.fixed || (v._rrUntil || 0) > now || v.path.length - v.seg < 12 || !routeAIEligible(v.type)) continue;
    let ahead = 0, cnt = 0; for (let j = v.seg + 1; j < Math.min(v.path.length, v.seg + 13); j++) { ahead += tpPredAt(v.path[j]); cnt++; }
    if (!cnt || ahead / cnt < 0.75) continue;
    checked++; v._rrUntil = now + 15;
    const from = v.path[Math.min(v.seg + 1, v.path.length - 1)], to = v.path[v.path.length - 1], alt = roadPath(from, to, false, 'leastTraffic');
    if (!alt || alt.length < 2 || alt[1] === v.path[Math.min(v.seg + 2, v.path.length - 1)]) continue;
    const cur = tpRouteCost(v.path, v.seg + 1), nxt = tpRouteCost(alt, 0);
    if (nxt < cur * 0.85) {
      v.path = alt; v.wp = laneWaypoints(alt); v.seg = 0; v.t = 0; v.cleared = -1; v.stopped = 0; v.rerouted = true;
      for (let j = 0; j < alt.length; j++) TPAI.rr.set(alt[j], (TPAI.rr.get(alt[j]) || 0) + 1);   // the next car sees this corridor as busier
      TPAI.window.push(now); switched++; T.reroutes++; T.avoided += cur - nxt;
    }
  }
  TPAI.rrAt = (TPAI.rrAt + 12) % Math.max(1, V.length);
  TPAI.prof.route = performance.now() - t0;
}
if (typeof Game !== 'undefined' && Game.simSystems && !Game.simSystems.some(function (s) { return s.name === 'TrafficAI3'; })) {
  Game.simSystems.push({ name: 'TrafficAI3', every: 1, acc: 0, tick: function () { if (!STARTED) return; tpSafe('predict', tpPredictTick); TPAI.at++; if (TPAI.at % 2 === 0) tpSafe('reroute', tpRerouteTick); } });
}

/* ---------- placement helper (instant city buildings for generators / auto-fix) ---------- */
function tpPlaceNear(type, x, y, r, o) {
  const d = BUILDINGS[type]; if (!d) return null; o = o || {};
  for (let rr = 0; rr <= (r || 6); rr++) for (let yy = y - rr; yy <= y + rr; yy++) for (let xx = x - rr; xx <= x + rr; xx++) {
    if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== rr) continue;
    if (!(typeof wgCanPlace === 'function' ? wgCanPlace(d, xx, yy) && (d.noRoad || hasRoadNext(d, xx, yy)) && inUnlocked(xx, yy) && inUnlocked(xx + d.w - 1, yy + d.h - 1) : canPlace(d, xx, yy, true).ok)) continue;
    if (o.nearRoadType) { let ok = false; for (let a = yy - 1; a <= yy + d.h && !ok; a++) for (let c = xx - 1; c <= xx + d.w && !ok; c++) if (inMap(c, a) && MAP.roads[idx(c, a)] >= o.nearRoadType) ok = true; if (!ok) continue; }
    let b;
    if (typeof wgCommit === 'function') b = wgCommit(type, xx, yy, {});                  // re-zones the footprint like the world generator
    else { b = makeBuilding(type, xx, yy); addBuildingToMap(b); }
    b.owner = d.public || d.transit || d.depot || d.service ? 'city' : b.owner; b.built = true; b.progress = 1; b.cond = 100;
    return b;
  }
  // dense city: a 1×1 stop may replace a small park / plaza / tree next to a road
  if (o.replaceSmall !== false && d.w === 1 && d.h === 1) {
    for (let rr = 0; rr <= (r || 6); rr++) for (let yy = y - rr; yy <= y + rr; yy++) for (let xx = x - rr; xx <= x + rr; xx++) {
      if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== rr || !inMap(xx, yy)) continue;
      const old = buildingAtTile(xx, yy); if (!old) continue; const od = bdef(old);
      const pass2 = rr > (r || 6) / 2 && (d.transit || d.depot);
      if (od.w !== 1 || od.h !== 1 || !(od.id === 'tree' || (pass2 && (od.cat === 'Residential' || od.cat === 'Commercial') && old.level <= 1 && !isAI(old)))) continue;   // a tree; for a transit stop also one small level-1 home / shop
      removeBuilding(old);
      if ((typeof wgCanPlace === 'function' ? wgCanPlace(d, xx, yy) : canPlace(d, xx, yy, true).ok) && hasRoadNext(d, xx, yy)) { const b = makeBuilding(type, xx, yy); b.owner = 'city'; b.built = true; b.progress = 1; b.cond = 100; addBuildingToMap(b); return b; }
      addBuildingToMap(old);
    }
  }
  // dense city, larger transit / depot lot (≤ 3×3): the footprint may take over trees and small level-1 homes / shops
  // in the outer half of the search radius; the cleared buildings come back if the lot still does not work
  if (o.replaceSmall !== false && (d.transit || d.depot) && d.w * d.h > 1 && d.w * d.h <= 9) {
    for (let rr = Math.ceil((r || 6) / 2); rr <= (r || 6); rr++) for (let yy = y - rr; yy <= y + rr; yy++) for (let xx = x - rr; xx <= x + rr; xx++) {
      if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== rr || !inMap(xx, yy) || !inMap(xx + d.w - 1, yy + d.h - 1) || !inUnlocked(xx, yy) || !inUnlocked(xx + d.w - 1, yy + d.h - 1)) continue;
      const olds = []; let ok = true;
      for (let a = yy; a < yy + d.h && ok; a++) for (let c = xx; c < xx + d.w && ok; c++) { const i = idx(c, a); if (MAP.roads[i] || MAP.nature[i] === 2) { ok = false; break; } const ob = buildingAtTile(c, a); if (!ob) continue; const od = bdef(ob);
        if (olds.indexOf(ob) >= 0) continue;
        if (od.w !== 1 || od.h !== 1 || !(od.id === 'tree' || ((od.cat === 'Residential' || od.cat === 'Commercial') && ob.level <= 1 && !isAI(ob)))) ok = false; else olds.push(ob); }
      if (!ok || olds.filter(function (ob) { return bdef(ob).id !== 'tree'; }).length > 4) continue;
      olds.forEach(function (ob) { removeBuilding(ob); });
      let near = !o.nearRoadType; for (let a = yy - 1; a <= yy + d.h && !near; a++) for (let c = xx - 1; c <= xx + d.w && !near; c++) if (inMap(c, a) && MAP.roads[idx(c, a)] >= o.nearRoadType) near = true;
      if (near && wgCanPlace(d, xx, yy) && hasRoadNext(d, xx, yy)) { const b = wgCommit(type, xx, yy, {}); b.owner = 'city'; b.built = true; b.progress = 1; b.cond = 100; return b; }
      olds.forEach(function (ob) { addBuildingToMap(ob); });
    }
  }
  return null;
}
function tpNearestOf(types, x, y, maxD) { let best = null, bd = 1e9; S.buildings.list.forEach(function (b) { if (types.indexOf(b.type) < 0 || !b.built) return; const dd = Math.abs(b.x - x) + Math.abs(b.y - y); if (dd < bd && dd <= (maxD || 1e9)) { bd = dd; best = b; } }); return best; }

/* ---------- City Transport Generator ---------- */
function tpTier() { const W = MAP.W, pop = S.city.population; if (W >= 96 || pop >= 150000 || (WG.cfg && WG.busy && WG.cfg.mega)) return 'mega'; if (W >= 64 || pop >= 40000) return 'large'; if (W >= 52 || pop >= 12000) return 'medium'; return 'small'; }
function tpCells() {
  const n = MAP.dN || Math.ceil(MAP.W / 8), cells = [];
  for (let i = 0; i < n * n; i++) cells.push({ k: i, x: (i % n) * 8 + 4, y: Math.floor(i / n) * 8 + 4, homes: 0, jobs: 0, com: 0, uni: 0, hosp: 0, air: 0, rail: 0, tour: 0, cong: 0, roads: 0, ind: 0, school: 0 });
  S.buildings.list.forEach(function (b) {
    if (!b.built) return; const c = cells[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)]; if (!c) return; const d = bdef(b);
    c.homes += b._hcap || (d.housing ? d.housing : 0); c.jobs += b._actW || d.workers || 0;
    if (d.cat === 'Commercial') c.com++; if (d.eduHigh) c.uni++; if (d.service === 'health') c.hosp++; if (d.eduLvl && d.eduLvl <= 2 || d.id === 'school') c.school++;
    if (d.airport || b.type === 'airport' || b.type === 'megaairport') c.air++; if (b.type === 'trainstation' || b.type === 'railhub' || b.type === 'centralrail') c.rail++; if (d.tour) c.tour += d.tour; if (d.cat === 'Industry') c.ind++;
  });
  for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i]) { const c = cells[Math.floor(((i / MAP.W) | 0) / 8) * n + Math.floor((i % MAP.W) / 8)]; if (c) { c.roads++; c.cong += MAP.cong ? MAP.cong[i] : 0; } }
  cells.forEach(function (c) { c.cong = c.roads ? c.cong / c.roads : 0; c.demand = c.homes * 0.5 + c.jobs * 0.8 + c.com * 25 + c.uni * 120 + c.hosp * 60 + c.air * 300 + c.rail * 150 + c.tour * 0.1 + c.cong * 200; });
  return cells;
}
/* SMART METRO: stations at the cells with the highest transport need, joined in a chain (no random lines) */
function tpSmartMetro(cells, maxSt) {
  const out = { candidates: [], built: [] };
  const cand = cells.filter(function (c) { return c.roads >= 4 && c.demand > 0; }).sort(function (a, b) { return b.demand - a.demand; }).slice(0, Math.max(2, maxSt));
  if (cand.length < 2) return out;
  // order: start at the strongest cell, then always the nearest remaining strong cell (≥ 6 tiles apart)
  const chain = [cand[0]], rest = cand.slice(1);
  while (rest.length && chain.length < maxSt) { const last = chain[chain.length - 1]; rest.sort(function (a, b) { return (Math.hypot(a.x - last.x, a.y - last.y) - a.demand / 400) - (Math.hypot(b.x - last.x, b.y - last.y) - b.demand / 400); }); const nx = rest.shift(); if (Math.hypot(nx.x - last.x, nx.y - last.y) >= 6) chain.push(nx); }
  out.candidates = chain.map(function (c) { return { x: c.x, y: c.y, demand: Math.round(c.demand), name: districtName(c.x, c.y) || 'District' }; });
  return out;
}
function tpBuildLine(mode, sites, name) {
  const M = TRANSIT_MODES[mode], type = M.stops[0], ids = [], reuse = M.road ? 3 : mode === 'train' ? 14 : 5;      // an existing station nearby is used before a new one is built
  sites.forEach(function (s) { let b = null; S.buildings.list.forEach(function (o) { if (M.stops.indexOf(o.type) >= 0 && o.built && ids.indexOf(o.id) < 0 && Math.abs(o.x - s.x) + Math.abs(o.y - s.y) <= reuse && (!b || Math.abs(o.x - s.x) + Math.abs(o.y - s.y) < Math.abs(b.x - s.x) + Math.abs(b.y - s.y))) b = o; }); if (!b) b = tpPlaceNear(type, s.x, s.y, M.road ? 6 : Math.max(9, Math.round(MAP.W / 4)), { nearRoadType: M.road ? 1 : 2 }); if (b && ids.indexOf(b.id) < 0) ids.push(b.id); });
  if (ids.length < 2 || !S.p9) return null;
  if (S.p9.transit.lines.some(function (L) { return L.mode === mode && L.stops.length === ids.length && L.stops.every(function (id, i) { return id === ids[i]; }); })) return null;
  onMapChanged();
  const r = tpLineCreate(mode, ids.slice(0, M.maxStops), name); return r.ok ? r.L : null;
}
// the 16-line limit: a large / mega city keeps room for metro and rail by dropping its weakest bus lines (auto lines first)
function tpMakeRoom(free) {
  const T = S.p9.transit; let drop = T.lines.length - (16 - free); if (drop <= 0) return 0;
  const cand = T.lines.filter(function (L) { return L.mode === 'bus'; }).sort(function (a, b) { return (b.auto ? 1 : 0) - (a.auto ? 1 : 0) || a.stops.length - b.stops.length || (a.boardings || 0) - (b.boardings || 0); }).slice(0, drop);
  T.lines = T.lines.filter(function (L) { return cand.indexOf(L) < 0; });
  const ids = new Set(T.lines.map(function (L) { return L.id; })); TRANSIT.pods = TRANSIT.pods.filter(function (p) { return ids.has(p.line); }); AG.vehicles = AG.vehicles.filter(function (v) { return !v.line || ids.has(v.line); });
  return cand.length;
}
function tpGenerateTransport(opts) {
  opts = opts || {};
  const t0 = performance.now(), tier = opts.tier || tpTier(), steps = [], built = [], add = function (n, r) { steps.push([n, r]); }, want = function (k) { return !opts.only || opts.only.indexOf(k) >= 0; };
  if (!S.p9 || !S.p11) return { ok: false, reason: 'Needs the Part 9 / 11 transport systems' };
  const rc = mainRoadComp(); add('Road analysis', MAP.roadCount + ' road tiles · ' + rc.comps + ' network(s)');
  if (rc.comps > 1) { const j = wgConnectRoads(); if (j) built.push('🛣 ' + j + ' road connector(s)'); }
  const cells = tpCells(), pop = cells.reduce(function (a, c) { return a + c.homes; }, 0), jobs = cells.reduce(function (a, c) { return a + c.jobs; }, 0);
  add('Population analysis', fmt(Math.round(S.city.population)) + ' citizens · ' + fmt(pop) + ' homes in ' + cells.filter(function (c) { return c.homes > 0; }).length + ' cells');
  add('Job analysis', fmt(jobs) + ' jobs in ' + cells.filter(function (c) { return c.jobs > 0; }).length + ' cells');
  add('District analysis', (MAP.districts || []).length + ' districts · strongest: ' + cells.slice().sort(function (a, b) { return b.demand - a.demand; }).slice(0, 3).map(function (c) { return districtName(c.x, c.y) || '?'; }).join(', '));
  const congCells = cells.filter(function (c) { return c.cong > 0.5; }).length; add('Traffic analysis', congCells + ' congested cell(s) · city traffic ' + Math.round(SIM.traffic || 0) + '%');
  if ((tier === 'large' || tier === 'mega') && (want('metro') || want('rail'))) { const freed = tpMakeRoom((want('metro') && !tpLines('metro').length ? 1 : 0) + (want('rail') && !tpLines('train').length ? 1 : 0) + 2); if (freed) add('Line limit', freed + ' weak bus line(s) merged away to make room for metro / rail'); }
  // metro
  const wantMetro = want('metro') && (tier === 'large' || tier === 'mega'), maxSt = tier === 'mega' ? 10 : tier === 'large' ? 7 : 5;
  const sm = tpSmartMetro(cells, maxSt);
  if (wantMetro && sm.candidates.length >= 2) {
    if (typeof wgUnlockTech === 'function') wgUnlockTech('metro');
    const L = tpBuildLine('metro', sm.candidates, 'Metro ' + (tpLines('metro').length + 1));
    add('Metro routes', L ? L.name + ': ' + sm.candidates.map(function (c) { return c.name; }).join(' → ') : 'existing metro kept');
    if (L) built.push('🚇 ' + L.name + ' (' + L.stops.length + ' stations)');
    if (L && !tpDepots('metro')) { const s = MAP.byId.get(L.stops[0]); if (s && tpPlaceNear('metrodepot', s.x, s.y, 8)) built.push('🚇 Metro depot'); }
  } else if (want('metro')) add('Metro routes', sm.candidates.length >= 2 ? 'candidate line (not built for a ' + tier + ' city): ' + sm.candidates.map(function (c) { return c.name; }).join(' → ') : 'no metro demand');
  TPE.metroCandidates = sm.candidates;
  // rail
  if (want('rail') && (tier === 'large' || tier === 'mega')) {
    if (typeof wgUnlockTech === 'function') wgUnlockTech('rail');
    const a = cells.slice().sort(function (p, q) { return q.jobs + q.com * 20 - p.jobs - p.com * 20; })[0], fars = cells.filter(function (c) { return c.homes + c.jobs > 0 && a && Math.hypot(c.x - a.x, c.y - a.y) >= MAP.W * 0.35; }).sort(function (p, q) { return q.homes + q.ind * 30 - p.homes - p.ind * 30; });
    // a dense district may have no lot for a station: the next-best far district is tried (up to 6)
    let L = null, far = null;
    for (let k = 0; k < Math.min(6, fars.length) && !L && !tpLines('train').some(function (x) { return !x.auto; }); k++) { far = fars[k]; L = tpBuildLine('train', [a, far], 'Rail ' + (tpLines('train').length + 1)); }
    if (L) { built.push('🚆 ' + L.name); if (far.ind > 2 && typeof setTrainType === 'function') setTrainType(L.id, 'cargo'); if (!tpDepots('train')) { const s = MAP.byId.get(L.stops[1]); if (s && tpPlaceNear('traindepot', s.x, s.y, 8)) built.push('🚆 Train depot'); } }
    const reg = typeof regionalRail === 'function' ? regionalRail() : []; if (reg.length && reg[0].possible && !reg.some(function (r) { return r.on; })) { regionalToggle(reg[0].id, true, 2); built.push('🚄 Regional trains to ' + reg[0].name); }
    add('Train connections', L ? L.name + ' + regional service' : 'rail kept as it is');
  } else if (want('rail')) add('Train connections', 'not needed for a ' + tier + ' city');
  // airport + port connections
  const ap = S.buildings.list.find(function (b) { return b.built && (b.type === 'megaairport' || b.type === 'airport' || b.type === 'regionalairport' || b.type === 'airstrip'); });
  const centre = cells.slice().sort(function (p, q) { return q.com + q.jobs / 50 - p.com - p.jobs / 50; })[0];
  if (!want('airport')) { /* skipped */ } else if (ap && centre) { const L = tpBuildLine('bus', [{ x: ap.x, y: ap.y }, centre], 'Airport Express'); if (L) built.push('✈️ Airport Express bus'); add('Airport connection', (L ? 'Airport Express to ' : 'airport already linked to ') + (districtName(centre.x, centre.y) || 'the centre')); }
  else add('Airport connection', tier === 'mega' ? 'no airport site' : 'no airport');
  const port = S.buildings.list.find(function (b) { return b.built && (b.type === 'megaport' || b.type === 'port' || b.type === 'smallport'); }), ind = cells.filter(function (c) { return c.ind > 0; }).sort(function (p, q) { return q.ind - p.ind; })[0];
  if (!want('port')) { /* skipped */ } else if (port && ind) { const L = tpBuildLine('bus', [{ x: port.x, y: port.y }, ind], 'Port Link'); if (L) built.push('⚓ Port Link bus'); add('Port connection', 'port ↔ ' + (districtName(ind.x, ind.y) || 'industry')); } else add('Port connection', port ? 'no industrial district' : 'no port');
  // buses: residential → jobs / school / hospital / metro / commercial; airport → centre; port → industry
  const res = cells.filter(function (c) { return c.homes > 0; }).sort(function (a, b) { return b.homes - a.homes; }).slice(0, tier === 'small' ? 2 : tier === 'medium' ? 3 : 5);
  const best = function (key, from) { return cells.filter(function (c) { return c[key] > 0 && c !== from; }).sort(function (a, b) { return (b[key] - Math.hypot(b.x - from.x, b.y - from.y) * 0.5) - (a[key] - Math.hypot(a.x - from.x, a.y - from.y) * 0.5); })[0]; };
  let busLines = 0;
  if (want('bus')) res.forEach(function (rcl, i) {
    if (S.p9.transit.lines.length >= 15) return;                                   // keep room under the 16-line limit
    const route = [rcl, best('jobs', rcl), best('school', rcl), best('hosp', rcl), best('rail', rcl) || null, best('com', rcl)].filter(Boolean).filter(function (c, k, a) { return a.indexOf(c) === k; });
    const metro = tpNearestOf(['metro'], rcl.x, rcl.y, 14); if (metro) route.splice(Math.min(route.length, 2), 0, { x: metro.x, y: metro.y });
    if (route.length >= 2) { const L = tpBuildLine('bus', route.slice(0, 8), 'Bus ' + (tpLines('bus').length + 1)); if (L) { busLines++; built.push('🚌 ' + L.name + ' (' + L.stops.length + ' stops)'); } }
  });
  if (busLines && !tpDepots('bus')) { const c = res[0]; if (c && tpPlaceNear('busdepot', c.x, c.y, Math.max(MAP.W, MAP.H))) built.push('🚌 Bus depot'); }
  if (want('bus')) add('Bus routes', busLines + ' new line(s) · residential → jobs, schools, hospitals, metro, shops');
  // bike + walking
  let bikes = 0, side = 0; const P = S.p11;
  if (want('bike') || want('ped')) cells.filter(function (c) { return c.homes > 0 || c.com > 0; }).sort(function (p, q) { return q.homes + q.com * 30 - p.homes - p.com * 30; }).slice(0, tier === 'small' ? 3 : 6).forEach(function (c) {
    for (let y = c.y - 4; y < c.y + 4; y++) for (let x = c.x - 4; x < c.x + 4; x++) { if (!inMap(x, y)) continue; const i = idx(x, y); if (want('bike') && MAP.roads[i] >= 2 && MAP.roads[i] <= 3 && !MAP.inter[i] && !P.bike[i]) { P.bike[i] = 1; bikes++; } if (want('ped') && MAP.roads[i] && MAP.roads[i] <= 3 && !P.ped[i]) { P.ped[i] = 1; side++; } }
    if (want('bike') && !tpNearestOf(['bikestation'], c.x, c.y, 6) && BUILDINGS.bikestation) { if (tpPlaceNear('bikestation', c.x, c.y, 4)) built.push('🚲 Bike station'); }
    if (want('bike') && !tpNearestOf(['bikeparking'], c.x, c.y, 5)) tpPlaceNear('bikeparking', c.x, c.y, 4);
  });
  if (want('bike')) add('Bike routes', bikes + ' bike-lane tiles'); if (want('ped')) add('Pedestrian routes', side + ' sidewalk tiles');
  // parking where the demand exceeds the supply
  const PP = parkingPass(); let lots = 0;
  if (want('parking')) PP.cells.forEach(function (c, k) { if (lots >= 8 || c.def < 60) return; const x = (k % PP.n) * 8 + 4, y = Math.floor(k / PP.n) * 8 + 4; if (tpPlaceNear('parkinglot', x, y, 4)) lots++; });
  if (lots) built.push('🅿️ ' + lots + ' parking lot(s)'); if (want('parking')) add('Parking', lots + ' lot(s) · availability ' + Math.round(clamp(parkingPass().ratio, 0, 2) * 100) + '%');
  // emergency routes: every station reachable; big junctions near stations get Emergency Priority lights
  let emOk = 0, emN = 0, emJ = 0; const main = mainRoadComp().main;
  if (want('emergency')) S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.service || !b.built) return; emN++; if (b._entry >= 0 && MAP.comp[b._entry] === main) emOk++; else if (typeof wgSpurRoad === 'function' && wgSpurRoad(b.x, b.y, d)) emOk++;
    for (let y = b.y - 5; y <= b.y + 5; y++) for (let x = b.x - 5; x <= b.x + 5; x++) { if (!inMap(x, y)) continue; const i = idx(x, y); if (emJ < 40 && MAP.inter[i] && MAP.roads[i] >= 3 && !tp().traffic.modes[i]) { tp().traffic.modes[i] = 'emergency'; emJ++; } } });
  if (want('emergency')) add('Emergency routes', emOk + '/' + emN + ' stations reachable · ' + emJ + ' Emergency-Priority junctions');
  onMapChanged(); if (typeof transitRebuild === 'function') transitRebuild(true); TRANSIT.legs.clear();
  const rep = { ok: true, tier: tier, steps: steps.length, built: built, at: gameDay(), ms: Math.round(performance.now() - t0), list: steps };
  tp().gen = { tier: tier, steps: steps.length, at: rep.at, built: built.slice(0, 30) };
  return rep;
}

/* ---------- Transport Validator + Auto Fix ---------- */
const TP_CHECKS = [['station', 'Disconnected station'], ['deadend', 'Dead-end route'], ['track', 'Impossible track'], ['depot', 'Missing depot'], ['road', 'No road access'], ['power', 'No power'], ['demand', 'No passenger demand'], ['overload', 'Overloaded station'], ['broken', 'Broken line'], ['vehicle', 'Invalid vehicle']];
const TP_WARN = ['demand', 'overload', 'depot'];       // warnings: the network still works (no broken line, station or vehicle)
function tp3Validate() {
  const issues = [], add = function (id, what, ref) { issues.push({ id: id, what: what, ref: ref }); };
  if (!S.p9) return { ok: true, issues: [], counts: {} };
  const main = mainRoadComp().main, lines = S.p9.transit.lines;
  const tb = S.buildings.list.filter(function (b) { const d = bdef(b); return b.built && (d.transit || d.depot || d.airport || d.port) && !d.noRoad; });
  tb.forEach(function (b) { const nm = bdef(b).name + ' #' + b.id;
    if (b._entry < 0) add('road', nm + ' has no road access', b.id); else if (MAP.comp[b._entry] !== main) add('station', nm + ' is not on the main road network', b.id);
    if (b._powered === false && bdef(b).power < 0) add('power', nm + ' has no power', b.id); });
  lines.forEach(function (L) {
    const missing = L.stops.filter(function (id) { return !MAP.byId.has(id); });
    if (missing.length) add('broken', L.name + ': ' + missing.length + ' station(s) no longer exist', L.id);
    if (L.stops.length - missing.length < 2) add('deadend', L.name + ' has fewer than 2 stations', L.id);
    const M = TRANSIT_MODES[L.mode];
    if (!M.road) for (let i = 0; i < L.stops.length; i++) { const lg = MAP.byId.has(L.stops[i]) && MAP.byId.has(L.stops[(i + 1) % L.stops.length]) ? transitLeg(L, i) : null; if (!lg && MAP.byId.has(L.stops[i])) { add('track', L.name + ': no track between stations ' + (i + 1) + ' and ' + (i + 2), L.id); break; } }
    L.stops.forEach(function (id) { const b = MAP.byId.get(id); if (!b) return; const c = tpCatch(b, M.road ? 5 : 8); if (c.homes + c.jobs < 5) add('demand', L.name + ': ' + (districtName(b.x, b.y) || 'station') + ' has no passengers nearby', L.id + ':' + id); });
  });
  ['metro', 'bus', 'train'].forEach(function (k) { const n = lines.filter(function (L) { return k === 'bus' ? L.mode === 'bus' || L.mode === 'tram' : L.mode === k; }).length; if (n >= 2 && !tpDepots(k)) add('depot', n + ' ' + k + ' lines without a ' + k + ' depot', k); });
  if (typeof metroEngine === 'function') metroEngine().stations.forEach(function (s) { if (s.load > 1.1) add('overload', s.name + ' metro station at ' + Math.round(s.load * 100) + '%', s.b.id); });
  const ids = new Set(lines.map(function (L) { return L.id; }));
  const badV = AG.vehicles.filter(function (v) { return v.line && !ids.has(v.line); }).length + TRANSIT.pods.filter(function (p) { return !ids.has(p.line); }).length;
  if (badV) add('vehicle', badV + ' vehicle(s) run on a line that no longer exists', null);
  const counts = {}; TP_CHECKS.forEach(function (c) { counts[c[0]] = issues.filter(function (i) { return i.id === c[0]; }).length; });
  const r = { ok: !issues.some(function (i) { return TP_WARN.indexOf(i.id) < 0; }), issues: issues, counts: counts, at: gameDay() };
  tp().validation = { ok: r.ok, issues: issues.length, fixed: tp().validation ? tp().validation.fixed : 0, at: r.at };
  return r;
}
function tp3AutoFix() {
  const v = tp3Validate(), done = []; if (!S.p9) return { actions: done, validation: v };
  const L = S.p9.transit.lines;
  v.issues.forEach(function (i) {
    if (i.id === 'road' || i.id === 'station') { const b = MAP.byId.get(i.ref); if (!b) return; const d = bdef(b);
      if (typeof wgSpurRoad === 'function' && wgSpurRoad(b.x, b.y, d) && (b._entry = findEntry(b)) >= 0) { done.push('Reconnect: access road for ' + d.name); return; }
      // no access road possible: rebuild it on a reachable site (or remove it)
      const type = b.type; removeBuilding(b); onMapChanged(); const n = tpPlaceNear(type, b.x, b.y, Math.max(MAP.W, MAP.H), { nearRoadType: 1, replaceSmall: false });
      done.push(n ? 'Rebuild: ' + d.name + ' moved to a reachable site' : 'Repair: unreachable ' + d.name + ' removed'); }
    else if (i.id === 'broken') { const ln = L.find(function (x) { return x.id === i.ref; }); if (ln) { ln.stops = ln.stops.filter(function (id) { return MAP.byId.has(id); }); done.push('Reroute: ' + ln.name + ' skips removed stations'); } }
    else if (i.id === 'demand') { const p = String(i.ref).split(':'), ln = L.find(function (x) { return x.id === p[0]; }); if (ln && ln.stops.length > 2) { ln.stops = ln.stops.filter(function (id) { return id !== +p[1]; }); done.push('Reroute: ' + ln.name + ' skips an empty station'); } }
    else if (i.id === 'depot') { const ln = L.find(function (x) { return i.ref === 'bus' ? x.mode === 'bus' || x.mode === 'tram' : x.mode === i.ref; }), s = ln ? MAP.byId.get(ln.stops[0]) : null; if (s && tpPlaceNear(i.ref + 'depot', s.x, s.y, Math.max(MAP.W, MAP.H))) done.push('Rebuild: ' + i.ref + ' depot placed'); }
    else if (i.id === 'overload') { const st = MAP.byId.get(i.ref), ln = st ? L.find(function (x) { return x.mode === 'metro' && x.stops.indexOf(st.id) >= 0; }) : null; if (ln) { const max = TRANSIT_MODES.metro.perLine[1] + (tpDepots('metro') ? 4 : 0); if (ln.vehicles < max) { ln.vehicles++; done.push('Replace: ' + ln.name + ' +1 train'); } else if (tpPlaceNear('metro', st.x + 3, st.y, 4, { nearRoadType: 2 })) done.push('Replace: relief station next to ' + bdef(st).name); } }
    else if (i.id === 'track') { const ln = L.find(function (x) { return x.id === i.ref; }); if (ln) { ln.auto = true; done.push('Rebuild: ' + ln.name + ' re-ordered along buildable track'); } }
    else if (i.id === 'power' && S.p9 && typeof p9AutoFixUtilities === 'function') { if (!done.some(function (d) { return /Repair: utilities/.test(d); })) { p9AutoFixUtilities(); done.push('Repair: utilities reconnected'); } }
  });
  S.p9.transit.lines = L.filter(function (x) { const ok = x.stops.filter(function (id) { return MAP.byId.has(id); }).length >= 2; if (!ok) done.push('Rebuild: dead-end line ' + x.name + ' removed'); return ok; });
  const ids = new Set(S.p9.transit.lines.map(function (x) { return x.id; }));
  const before = AG.vehicles.length; AG.vehicles = AG.vehicles.filter(function (x) { return !x.line || ids.has(x.line); }); TRANSIT.pods = TRANSIT.pods.filter(function (p) { return ids.has(p.line); });
  if (AG.vehicles.length < before) done.push('Repair: ' + (before - AG.vehicles.length) + ' invalid vehicle(s) removed');
  onMapChanged(); if (typeof transitRebuild === 'function') transitRebuild(true); TRANSIT.legs.clear();
  const after = tp3Validate(); tp().validation.fixed = (tp().validation.fixed || 0) + done.length;
  return { actions: done, validation: after, before: v };
}
