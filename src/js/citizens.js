'use strict';
/* BLOCK CITY TYCOON — AGENTS — citizen AI, vehicles, traffic AI, emergency services */
/* =============================== 7. AGENTS ================================ */
const AG = { citizens: [], vehicles: [], planes: [], nextId: 1, lightClock: 0, spawnTimer: 0, hash: new Map(), trafficAcc: 0, planeTimer: 5 };
const CITIZEN_COLORS = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#f1c0e8', '#90dbf4'];
const VEHICLE_SPECS = {
  car: { len: 13, wid: 7, speed: 46, colors: ['#e63946', '#457b9d', '#f1faee', '#2a9d8f', '#e9c46a', '#8d99ae', '#1d3557', '#ff7b00'] },
  taxi: { len: 13, wid: 7, speed: 50, colors: ['#ffd60a'] },
  bus: { len: 22, wid: 8, speed: 36, colors: ['#ffb703'] },
  truck: { len: 18, wid: 8, speed: 34, colors: ['#6c757d', '#adb5bd', '#577590'] },
  ambulance: { len: 15, wid: 8, speed: 64, colors: ['#ffffff'], siren: true },
  firetruck: { len: 19, wid: 8, speed: 60, colors: ['#d00000'], siren: true },
  police: { len: 14, wid: 7, speed: 66, colors: ['#1d4ed8'], siren: true },
  maint: { len: 15, wid: 8, speed: 48, colors: ['#f8961e'] },
  garbage: { len: 16, wid: 8, speed: 32, colors: ['#2a9d8f'] },
  tanker: { len: 18, wid: 8, speed: 33, colors: ['#e9c46a'] },
  race: { len: 13, wid: 6, speed: 95, colors: ['#ff006e', '#8338ec', '#3a86ff', '#fb5607', '#06d6a0'] }
};
function resetAgents() { AG.citizens = []; AG.vehicles = []; AG.planes = []; AG.ships = []; AG.accidents = []; if (MAP.blocked) MAP.blocked.fill(0); }
function perf() { return perfPreset(QUALITY_PRESETS[S.settings.quality] || QUALITY_PRESETS.MEDIUM); }   // quality preset × NPC / traffic density, shadows & particles settings

/* --- Citizens: utility-AI state machine ----------------------------------- */
function weightedPick(arr, wfn) {
  let tot = 0; for (let i = 0; i < arr.length; i++) tot += wfn(arr[i]);
  if (tot <= 0) return null;
  let r = Math.random() * tot;
  for (let i = 0; i < arr.length; i++) { r -= wfn(arr[i]); if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
function spawnCitizen(tourist) {
  let home = null, p;
  if (tourist) {
    const hubs = MAP.lists.tourism.filter(function (b) { return b._op; });
    home = hubs.length ? pick(hubs) : null;
    if (!home) return;
  } else {
    home = weightedPick(MAP.lists.homes.filter(function (b) { return b._op; }), function (b) { return b._hcap || 1; });
    if (!home) return;
  }
  p = doorPoint(home);
  const work = tourist ? null : (Math.random() > SIM.unemployment ? weightedPick(MAP.lists.jobs.filter(function (b) { return b._op && b.workers > 0 && bdef(b).sector !== 'HOUSING'; }), function (b) { return b.workers; }) : null);
  const c = {
    id: AG.nextId++, x: p.x, y: p.y, state: 'IDLE', target: null, path: null, pi: 0, speed: rand(18, 26),
    home: home.id, work: work ? work.id : 0, money: rand(60, 300), energy: rand(50, 100),
    needs: { food: rand(30, 100), housing: 100, fun: rand(30, 100), work: 100, shopping: rand(30, 100), rest: rand(50, 100) },
    inside: home.id, insideUntil: S.clock.gameSec + rand(60, 1800), color: pick(CITIZEN_COLORS), skin: pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    tourist: !!tourist, ox: rand(-9, 9), oy: rand(-9, 9), driving: false, lastWorkDay: -1, life: tourist ? rand(600, 1400) : 0, happiness: 70,
    pers: tourist ? 'TOURIST' : weightedPick(Object.keys(PERSONALITIES), function (k) { return PERSONALITIES[k].w; }),
    mem: { home: home.id, work: work ? work.id : 0, favShop: 0, favFood: 0, favFun: 0, lastEvent: '', visits: {} }
  };
  citizenProfile(c);
  AG.citizens.push(c);
}
function syncCitizens() {
  if (S._rawCitizens) { const n = restoreCitizens(S._rawCitizens); delete S._rawCitizens; if (n) AG.citizens.forEach(citizenProfile); }
  const q = perf();
  const maxN = Math.floor(q.npc * PERF.scale);
  const touristTarget = S.city.tourismUnlocked ? Math.min(Math.floor(maxN * 0.25), Math.floor(S.city.tourists * 0.2)) : 0;
  const target = Math.min(maxN - touristTarget, Math.floor(S.city.population));
  let nc = 0, nt = 0;
  AG.citizens.forEach(function (c) { if (c.tourist) nt++; else nc++; });
  if (nc < target) spawnCitizen(false);
  else if (nc > target + 2) removeOneCitizen(false);
  if (nt < touristTarget) spawnCitizen(true);
  else if (nt > touristTarget + 1) removeOneCitizen(true);
}
function removeOneCitizen(tourist) {
  for (let i = AG.citizens.length - 1; i >= 0; i--) {
    const c = AG.citizens[i];
    if (c.tourist === tourist && !c.driving) { AG.citizens.splice(i, 1); return; }
  }
}
function citizenBuilding(id) { return id ? MAP.byId.get(id) || null : null; }
function nearestOf(list, x, y, filter) {
  let best = null, bd = 1e12;
  for (let i = 0; i < list.length; i++) {
    const b = list[i]; if (!b._op || (filter && !filter(b))) continue;
    const c = buildingCenter(b); const dd = Math.hypot(c.x - x, c.y - y) * rand(0.7, 1.3);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}
/* Utility-based decision making with a daily schedule:
   06 wake · 08 work · 12 lunch · 17 shopping · 19 entertainment · 22 home · 00 sleep.
   Personality scales each need; memory makes citizens return to their favourite places. */
function decide(c) {
  const h = gameHour();
  const night = h >= 22 || h < 6;
  const today = gameDay();
  const P = PERSONALITIES[c.pers] || PERSONALITIES.FAMILY;
  const weekend = isWeekend();
  const opts = [];
  const push = function (state, u, list, filter) { if (u > 0) opts.push({ state: state, u: u + Math.random() * 8, list: list, filter: filter }); };
  if (c.tourist) {
    push('GO_RESTAURANT', (100 - c.needs.food) * 1.1 + (h >= 12 && h < 14 ? 20 : 0), MAP.lists.FOOD);
    push('GO_ENTERTAINMENT', (100 - c.needs.fun) * 1.0 + 20 + (h >= 19 && h < 23 ? 25 : 0), MAP.lists.ENTERTAINMENT.concat(MAP.lists.tourism));
    push('GO_SHOPPING', (100 - c.needs.shopping) * 0.9, MAP.lists.SHOPPING);
    push('GO_PARK', 35 + (weekend ? 10 : 0), MAP.lists.parks);
    push('GO_HOME_SLEEP', night ? 100 : 0, null);
  } else {
    const workStart = c.pers === 'WORKAHOLIC' ? 7 : 8, workEnd = c.pers === 'WORKAHOLIC' ? 19 : 17;
    const worksToday = !weekend || (c.pers === 'WORKAHOLIC' && (c.id % 2 === 0));
    const ns = S.p10 && p10NightShift(c);                        // Part 10: night shift at 24-hour workplaces (sleeps by day)
    push('GO_HOME_SLEEP', ns ? (h >= 8 && h < 16 ? 95 : (c.energy < 20 ? 92 : 0)) : night ? 95 + (100 - c.energy) * 0.3 : (c.energy < 20 ? 92 : 0), null);
    if (c.work) push('GO_WORK', ns ? ((h >= 21 || h < 3) && c.lastWorkDay !== today ? 88 : 0) : (worksToday && h >= workStart - 1.5 && h < workEnd - 1 && c.lastWorkDay !== today) ? (82 + (c.money < 100 ? 20 : 0)) * P.work : 0, null);
    else push('FIND_WORK', (c.money < 100 && h >= 7 && h < 16) ? 78 : (h >= 8 && h < 15 && !weekend ? 25 : 0), MAP.lists.jobs, function (b) { return b.workers > 0 && bdef(b).sector !== 'HOUSING' && !b.closed; });
    const spend = P.spend || 1;
    if (c.money >= 12) push('GO_RESTAURANT', (100 - c.needs.food) * 1.1 + (c.needs.food < 30 ? 40 : 0) + ((h >= 12 && h < 13.5) ? 35 : (h >= 19 && h < 21) ? 20 : 0), MAP.lists.FOOD);
    if (c.money >= 15) push('GO_ENTERTAINMENT', ((100 - c.needs.fun) * 0.9 + (c.needs.fun < 30 ? 30 : 0) + (h >= 19 && h < 22 ? 30 : 0) + (weekend ? 15 : 0)) * P.fun, MAP.lists.ENTERTAINMENT.concat(P.tech ? MAP.lists.commercial.filter(function (b) { return bdef(b).sector === 'TECHNOLOGY'; }) : [], weekend && S.p10 ? MAP.lists.tourism : []));
    if (c.money >= 20 / spend) push('GO_SHOPPING', ((100 - c.needs.shopping) * 0.7 + (h >= 17 && h < 19 ? 30 : h >= 11 && h < 17 ? 10 : 0) + (weekend ? 12 : 0)) * P.shop, MAP.lists.SHOPPING);
    push('GO_PARK', ((100 - c.needs.fun) * 0.6 + (h >= 9 && h < 20 ? 10 : 0) + (weekend ? 15 : 0)) * (P.park || 1) * (({ winter: 0.45, summer: 1.25 })[currentSeason().id] || 1) * (S.p9 ? weatherOutdoor() : 1), MAP.lists.parks);
    // Part 9 households: young citizens study on weekdays (schools, colleges, universities)
    if (S.p9 && c.age && c.age <= 24 && !weekend && h >= 7.5 && h < 14 && c.lastSchoolDay !== today) push('GO_SCHOOL', 80, MAP.lists.schools.concat(S.buildings.list.filter(function (b) { return bdef(b).eduHigh; })));
    push('GO_HOME', (18 + (h >= 22 || (h >= 20 && P.home) ? 40 : 0)) * (P.home || 1), null);
  }
  push('IDLE', 10, null);
  opts.sort(function (a, b) { return b.u - a.u; });
  c.util = opts.slice(0, 5).map(function (o) { return [o.state, Math.round(o.u)]; });
  for (let k = 0; k < opts.length; k++) {
    const o = opts[k];
    let target = null;
    if (o.state === 'GO_HOME' || o.state === 'GO_HOME_SLEEP') target = citizenBuilding(c.home);
    else if (o.state === 'GO_WORK') target = citizenBuilding(c.work);
    else if (o.state === 'IDLE') target = null;
    else target = favoriteOr(c, o.state, nearestOf(o.list || [], c.x, c.y, function (b) { return !b.closed && (!o.filter || o.filter(b)); }));
    if (o.state !== 'IDLE' && (!target || !target._op && o.state !== 'GO_HOME' && o.state !== 'GO_HOME_SLEEP')) continue;
    if (o.state === 'FIND_WORK') { c.work = target.id; c.mem.work = target.id; c.state = 'GO_WORK'; }
    else c.state = o.state;
    if (o.state === 'IDLE') { wander(c); return; }
    goTo(c, target);
    return;
  }
  wander(c);
}
/* Memory: prefer a favourite place (if it still operates) most of the time */
function favoriteOr(c, state, fallback) {
  const m = c.mem; if (!m) return fallback;
  const key = state === 'GO_SHOPPING' ? 'favShop' : state === 'GO_RESTAURANT' ? 'favFood' : state === 'GO_ENTERTAINMENT' ? 'favFun' : null;
  if (!key || !m[key]) return fallback;
  const f = citizenBuilding(m[key]);
  if (f && f._op && !f.closed && Math.random() < 0.7) return f;
  return fallback;
}
function rememberVisit(c, b) {
  const m = c.mem; if (!m || !b) return;
  m.visits[b.id] = (m.visits[b.id] || 0) + 1;
  const key = c.state === 'GO_SHOPPING' ? 'favShop' : c.state === 'GO_RESTAURANT' ? 'favFood' : c.state === 'GO_ENTERTAINMENT' ? 'favFun' : null;
  if (!key) return;
  const good = (b.nrev ? b.rating >= 3.5 : b._eff > 0.7) && (c.pers !== 'LUXURY' || b.level >= 2 || (b.nrev && b.rating >= 4));
  if (good && (!m[key] || m.visits[b.id] > (m.visits[m[key]] || 0))) m[key] = b.id;
  else if (!good && m[key] === b.id) m[key] = 0;
  const ev = S.events.active.find(function (a) { return a.kind === 'global' || a.kind === 'dyn'; });
  if (ev) m.lastEvent = ev.id;
}
function wander(c) {
  c.state = 'IDLE'; c.target = null;
  const ang = Math.random() * Math.PI * 2, d = rand(20, 60);
  const tx = clamp(c.x + Math.cos(ang) * d, 4, MAP.W * TILE - 4), ty = clamp(c.y + Math.sin(ang) * d, 4, MAP.H * TILE - 4);
  c.path = [{ x: tx, y: ty }]; c.pi = 0;
}
function currentRoadTile(c) {
  const b = citizenBuilding(c.inside || c.lastB);
  if (b && b._entry >= 0) return b._entry;
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
  for (let r = 0; r < 3; r++) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (isRoad(x, y)) return idx(x, y);
  return -1;
}
function goTo(c, target, noTransit) {
  if (!noTransit && !c.driving && S.p11 && p11Route(c, target)) return;   // Part 11: multi-modal routing (walk · bike · car · transit · transfer · park & ride)
  if (!noTransit && !c.driving && transitPlan(c, target)) return;     // Part 9: walk → stop → ride → stop → walk
  c.target = target.id;
  const from = currentRoadTile(c);
  const to = target._entry;
  const door = target.type === 'park' || target.type === 'plaza' ? (function () { const bc = buildingCenter(target); return { x: bc.x + rand(-8, 8), y: bc.y + rand(-8, 8) }; })() : doorPoint(target);
  const path = roadPath(from, to);
  c.inside = 0;
  if (path && path.length > 14 && !c.tourist && Math.random() < 0.6 * ((PERSONALITIES[c.pers] || {}).drive === undefined ? 1 : PERSONALITIES[c.pers].drive / 0.6) && AG.vehicles.length < perf().veh * PERF.scale) {
    const v = makeVehicle('car', path, { passenger: c, dest: target });
    if (v) { c.driving = true; c.path = null; return; }
  }
  const pts = [];
  if (path) path.forEach(function (i) { const p = tileCenter(i); pts.push({ x: p.x + c.ox, y: p.y + c.oy }); });
  pts.push(door);
  c.path = pts; c.pi = 0;
}
function arrive(c) {
  const b = citizenBuilding(c.target);
  const gs = S.clock.gameSec, h = gameHour();
  c.path = null; c.driving = false;
  if (c.biking && c.baseSpeed) { c.speed = c.baseSpeed; c.biking = false; }
  if (c.mmNext && S.p11 && p11ContinueTrip(c)) return;                 // Part 11: park & ride — continue by transit
  if (!b) { c.state = 'IDLE'; c.thinkAt = gs + 600; return; }
  c.lastB = b.id;
  rememberVisit(c, b);
  const stay = function (min) { c.inside = b.id; c.insideUntil = gs + min * 60; };
  switch (c.state) {
    case 'GO_WORK': stay(Math.max(120, ((h < 12 ? 12 : 17) - h) * 60)); c.needs.work = 100; c.lastWorkDay = gameDay(); c.atWork = true; b.visitors++; break;
    case 'GO_SCHOOL': stay(Math.max(90, (15 - h) * 60)); c.lastSchoolDay = gameDay(); c.needs.work = 100; b.visitors++; break;
    case 'GO_RESTAURANT': stay(45); c.needs.food = 100; c.money -= 12; b.visitors++; break;
    case 'GO_SHOPPING': stay(40); c.needs.shopping = 100; c.money -= 20; b.visitors++; break;
    case 'GO_ENTERTAINMENT': stay(120); c.needs.fun = 100; c.money -= 15; b.visitors++; break;
    case 'GO_PARK': c.inside = 0; c.insideUntil = gs + 60 * 60; c.parkUntil = gs + 3600; c.needs.fun = Math.min(100, c.needs.fun + 50); b.visitors++; break;
    case 'GO_HOME_SLEEP': {
      const wake = 6 + Math.random() * 1.5;
      const hrs = h >= 22 ? (24 - h) + wake : Math.max(1, wake - h);
      stay(hrs * 60); c.sleeping = true; break;
    }
    case 'GO_HOME': stay(rand(60, 150)); break;
    default: stay(30);
  }
}
function exitBuilding(c) {
  const b = citizenBuilding(c.inside);
  if (c.sleeping) { c.energy = 100; c.needs.rest = 100; c.sleeping = false; }
  if (c.atWork) { c.money += 8 * 5; c.atWork = false; }
  if (b) { const p = doorPoint(b); c.x = p.x; c.y = p.y; c.lastB = b.id; }
  c.inside = 0;
  c.pending = true;
}
/* NPC AI tick (every 0.25 s): citizens that need a new plan decide here, with a per-tick budget */
function npcAiTick() {
  let budget = PERF.scale < 0.6 ? 25 : 60;
  for (let i = 0; i < AG.citizens.length && budget > 0; i++) {
    const c = AG.citizens[i];
    if (!c.pending || c.driving) continue;
    c.pending = false; budget--;
    decide(c);
  }
}
/* Citizens use distance-based simulation (LOD): near the camera every tick (full), in the margin every
   0.15 s (reduced), far away every 0.6 s with accumulated time (statistical) — so huge cities stay smooth. */
const CIT_LOD_INTERVAL = [0, 0.15, 0.6];
function updateCitizens(simDt) {
  if (simDt <= 0) return;
  lodViewRect();
  const gs = S.clock.gameSec;
  for (let i = AG.citizens.length - 1; i >= 0; i--) {
    const c = AG.citizens[i];
    c._la = (c._la || 0) + simDt;
    const lod = c.inside ? 2 : lodOf(c.x, c.y);
    if (c._la < CIT_LOD_INTERVAL[lod]) continue;
    const dt = Math.min(c._la, 3); c._la = 0;
    let remove;
    try { remove = updateCitizen(c, dt, gs); } catch (e) { remove = recoverCitizen(c, e); }   // one broken citizen never stops the city
    if (remove) AG.citizens.splice(i, 1);
  }
}
/* Returns true when the citizen should be removed */
function updateCitizen(c, dt, gs) {
  const gh = dt * TIME_SCALE / 3600;
  c.needs.food = Math.max(0, c.needs.food - 5 * gh);
  c.needs.fun = Math.max(0, c.needs.fun - 3.5 * gh);
  c.needs.shopping = Math.max(0, c.needs.shopping - 2.5 * gh);
  if (!c.sleeping) c.energy = Math.max(0, c.energy - 3.5 * gh);
  if (!c.work && !c.tourist) c.needs.work = Math.max(0, c.needs.work - 4 * gh);
  c.happiness = (c.needs.food + c.needs.fun + c.needs.shopping + c.energy + c.needs.work + c.needs.housing) / 6;
  if (c.tourist) { c.life -= dt; if (c.life <= 0 && !c.driving) return true; }
  if (c.driving) return false;
  if (c.transit && c.transit.phase === 'wait') { transitWaitTick(c, gs); return false; }
  if (c.inside) {
    if (!MAP.byId.has(c.inside)) { c.inside = 0; c.pending = true; return false; }
    if (gs >= c.insideUntil) exitBuilding(c);
    return false;
  }
  if (c.parkUntil) {
    if (gs >= c.parkUntil) { c.parkUntil = 0; c.pending = true; return false; }
    if (!c.path || c.pi >= c.path.length) { const b = citizenBuilding(c.target); if (!b) { c.parkUntil = 0; c.pending = true; return false; } const bc = buildingCenter(b), d = bdef(b); c.path = [{ x: bc.x + rand(-d.w * 12, d.w * 12), y: bc.y + rand(-d.h * 12, d.h * 12) }]; c.pi = 0; }
  }
  if (c.pending) return false;
  if (!c.path) { if (!c.thinkAt || gs >= c.thinkAt) { c.thinkAt = 0; c.pending = true; } return false; }
  let step = c.speed * dt * (c.parkUntil ? 0.4 : 1), guard = 0;
  while (step > 0 && c.path && c.pi < c.path.length && guard++ < 64) {
    const p = c.path[c.pi];
    const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
    if (dist <= step) {
      c.x = p.x; c.y = p.y; c.pi++; step -= dist;
      if (c.pi >= c.path.length) {
        if (c.parkUntil) { c.path = null; break; }
        if (c.state === 'IDLE') { c.path = null; c.thinkAt = gs + rand(300, 1200); }
        else if (!transitReachedStop(c)) arrive(c);
        break;
      }
    } else { c.x += dx / dist * step; c.y += dy / dist * step; c.dir = dx; step = 0; }
  }
  return false;
}

/* --- Traffic AI ------------------------------------------------------------- */
function laneWaypoints(path) {
  const L = TILE * 0.2, wp = [];
  for (let k = 0; k < path.length; k++) {
    const c = tileCenter(path[k]);
    let ox = 0, oy = 0, n = 0;
    if (k > 0) { const p = tileCenter(path[k - 1]); const dx = Math.sign(c.x - p.x), dy = Math.sign(c.y - p.y); ox += -dy * L; oy += dx * L; n++; }
    if (k < path.length - 1) { const q = tileCenter(path[k + 1]); const dx = Math.sign(q.x - c.x), dy = Math.sign(q.y - c.y); ox += -dy * L; oy += dx * L; n++; }
    if (n) { ox /= n; oy /= n; }
    wp.push({ x: c.x + ox, y: c.y + oy });
  }
  return wp;
}
function makeVehicle(type, path, opts) {
  if (!path || path.length < 2) return null;
  let routeInfo = null;
  if (routeAIEligible(type, opts)) { const ch = trafficAIChoose(path, type); if (ch.path && ch.path.length >= 2) path = ch.path; routeInfo = ch.info; }   // Traffic AI 2.0
  const spec = VEHICLE_SPECS[type];
  const wp = laneWaypoints(path);
  const v = {
    id: AG.nextId++, type: type, path: path, wp: wp, seg: 0, t: 0, x: wp[0].x, y: wp[0].y, hx: 1, hy: 0,
    speed: 0, maxSpeed: spec.speed * rand(0.9, 1.1), stopped: 0, ghost: 0, color: pick(spec.colors), len: spec.len, wid: spec.wid,
    siren: !!spec.siren, passenger: opts && opts.passenger || null, dest: opts && opts.dest || null, route: opts && opts.route, dwell: 0,
    ambient: !!(opts && opts.ambient), cleared: -1, life: 0,
    ev: type !== 'bus' && type !== 'race' && type !== 'firetruck' && Math.random() < (SIM.evShare || 0),
    cargo: opts && opts.cargo || null, capacity: (type === 'truck' || type === 'tanker') ? 25 : (type === 'garbage' ? 12 : 0), fuel: rand(0.5, 1),
    lane: 0, lat: 0, laneT: 0, mode: routeInfo ? routeInfo.mode : 'fastest', routeInfo: routeInfo
  };
  const n0 = lanesPerDir(path[0]); if (n0 > 1 && !spec.siren) v.lane = Math.floor(Math.random() * n0);
  if (v.ev) { v.maxSpeed *= 1.05; v.color = type === 'car' ? pick(['#90e0ef', '#b9fbc0', '#f1faee']) : v.color; if (v.capacity) v.capacity = 20; }
  const dx = wp[1].x - wp[0].x, dy = wp[1].y - wp[0].y, l = Math.hypot(dx, dy) || 1;
  v.hx = dx / l; v.hy = dy / l;
  AG.vehicles.push(v);
  return v;
}
/* Logistics trucks: Factory/Mine → Warehouse and Warehouse → Shop, carrying real cargo types */
function spawnLogisticsTruck() {
  const whs = MAP.lists.warehouses.filter(function (b) { return b._op; });
  const prods = MAP.lists.factories.concat(MAP.lists.extractors).filter(function (b) { return b._op && b._prod > 0; });
  const shops = MAP.lists.shops.filter(function (b) { return b._op; });
  let from, to, item;
  if (whs.length && (Math.random() < 0.5 || !shops.length) && prods.length) { from = pick(prods); to = pick(whs); item = from._prodItem || 'materials'; }
  else if (shops.length) { from = whs.length ? pick(whs) : pick(prods); to = pick(shops); item = bdef(to).sector === 'FOOD' ? 'food' : pick(['materials', 'electronics']); }
  if (!from || !to || from === to || from._entry < 0 || to._entry < 0) return null;
  const tank = item === 'fuel';
  const v = makeVehicle(tank ? 'tanker' : 'truck', roadPath(from._entry, to._entry), { ambient: true, dest: to, cargo: { item: item, qty: Math.round(rand(10, 25)), from: bdef(from).name } });
  return v;
}
function spawnGarbageTruck() {
  const st = pick(MAP.lists.waste.filter(function (b) { return b._op; }));
  const home = pick(MAP.lists.homes.filter(function (b) { return b._op; }));
  if (!st || !home) return null;
  return makeVehicle('garbage', roadPath(st._entry, home._entry), { ambient: true, dest: home, cargo: { item: 'waste', qty: Math.round(rand(3, 12)), from: bdef(st).name } });
}
function spawnAmbientVehicle(type) {
  let from = null, to = null;
  if (type === 'truck') return spawnLogisticsTruck();
  if (type === 'garbage') return spawnGarbageTruck();
  else if (type === 'taxi') { from = pick(S.buildings.list.filter(function (b) { return b.type === 'taxi' && b._op; })); to = pickNearCamera(S.buildings.list.filter(function (b) { return b._road && b.built; })); }
  else { const cand = S.buildings.list.filter(function (b) { return b._road && b.built; }); from = pickNearCamera(cand); to = pick(cand); }   // ambient traffic near the camera; far away it is statistical
  if (!from || !to || from === to) {
    if (type === 'race' && MAP.roadCount > 4) {
      const roads = []; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i]) roads.push(i);
      const a = pick(roads), b = pick(roads); const p = roadPath(a, b);
      return makeVehicle('race', p, { ambient: true });
    }
    return null;
  }
  return makeVehicle(type, roadPath(from._entry, to._entry), { ambient: type !== 'race' ? true : true, dest: to });
}
function dispatchVehicle(type, from, to) {
  if (!from || !to || from._entry < 0 || to._entry < 0) return null;
  let p = roadPath(from._entry, to._entry, VEHICLE_SPECS[type].siren);
  if (p && p.length === 1) p = [p[0], p[0]];
  return makeVehicle(type, p, { dest: to });
}
function busRouteStops() { return MAP.lists.busstops.filter(function (b) { return b._op && b._entry >= 0; }).sort(function (a, b) { return a.id - b.id; }); }
function spawnBus(k) {
  const stops = busRouteStops(); if (stops.length < 2) return null;
  const a = stops[k % stops.length], b = stops[(k + 1) % stops.length];
  return makeVehicle('bus', roadPath(a._entry, b._entry), { route: (k + 1) % stops.length });
}
function lightGreen(tile, axis, turn) {
  if (S.p9) return signalGreen(tile, axis, turn || 'S');
  const cyc = hasTech('t_lights') ? 7.2 : 8.4;
  const ph = (AG.lightClock + (tile * 1.618) % cyc) % cyc;
  const g = cyc * 0.43, y = cyc * 0.07;
  if (axis === 'NS') return ph < g;
  return ph >= g + y && ph < g * 2 + y;
}
function lightState(tile, axis) {
  if (S.p9) return signalLight(tile, axis);
  const cyc = hasTech('t_lights') ? 7.2 : 8.4;
  const ph = (AG.lightClock + (tile * 1.618) % cyc) % cyc;
  const g = cyc * 0.43, y = cyc * 0.07;
  if (axis === 'NS') return ph < g ? 'g' : (ph < g + y ? 'y' : 'r');
  return (ph >= g + y && ph < g * 2 + y) ? 'g' : (ph >= g * 2 + y ? 'y' : 'r');
}
function validateVehicles() {
  for (let i = AG.vehicles.length - 1; i >= 0; i--) {
    const v = AG.vehicles[i];
    let ok = true;
    for (let k = v.seg; k < v.path.length; k++) if (!MAP.roads[v.path[k]]) { ok = false; break; }
    if (!ok) removeVehicle(i, false);
  }
}
function removeVehicle(i, arrived) {
  const v = AG.vehicles[i];
  AG.vehicles.splice(i, 1);
  if (v.pax && v.pax.length) dropPassengers(v.pax, v.x, v.y);
  if (v.passenger) {
    const c = v.passenger;
    c.driving = false;
    if (arrived && v.dest && MAP.byId.has(v.dest.id)) { const p = doorPoint(v.dest); c.x = p.x; c.y = p.y; arrive(c); }
    else { c.x = v.x; c.y = v.y; c.path = null; c.state = 'IDLE'; c.thinkAt = 0; }
  }
}
function trafficStep(dtStep) {
  AG.lightClock += dtStep;
  const H = AG.hash; H.clear();
  const vs = AG.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i]; const t = v.path[Math.min(v.seg + 1, v.path.length - 1)], t0 = v.path[v.seg];
    let a = H.get(t0); if (!a) { a = []; H.set(t0, a); } a.push(v);
    if (t !== t0) { let b = H.get(t); if (!b) { b = []; H.set(t, b); } b.push(v); }
  }
  let stoppedCount = 0;
  const cong = 1 / (1 + SIM.traffic / 140);
  AG.sirens = vs.filter(function (v) { return v.siren; });
  for (let i = vs.length - 1; i >= 0; i--) {
    const v = vs[i];
    let dt = dtStep;
    // Part 9 simulation tiers: vehicles in FAR chunks move in bigger, rarer steps
    if (!v.siren && WE.tier) { v._tier = WE.tier[chunkOfWorld(v.x, v.y)]; if (v._tier === 2) { v._acc = (v._acc || 0) + dt; if (v._acc < dtStep * 3 - 1e-6) continue; dt = v._acc; v._acc = 0; } }
    v.life += dt;
    if (v.laneT > 0) v.laneT -= dt;
    if (v.dwell > 0) { v.dwell -= dt; continue; }
    const A = v.wp[v.seg], B = v.wp[v.seg + 1];
    if (!B) { arriveVehicle(i); continue; }
    const segLen = Math.hypot(B.x - A.x, B.y - A.y) || 0.01;
    const remaining = segLen - v.t;
    let blocked = false;
    const node = v.path[v.seg + 1];
    // Accident scene: the road is blocked for normal traffic
    if (!v.siren && MAP.blocked[node] && remaining < TILE * 0.9) blocked = true;
    // Junctions: traffic lights (protected lefts, pedestrian phase, AI timing), roundabouts, priority roads, all-way stops
    let atJunction = false;
    if (!blocked) {
      if (S.p9) { const jr = junctionRule(v, node, remaining, H, dt); if (jr === 1) { blocked = true; atJunction = true; } else if (jr === 2) v.cleared = v.seg + 1; }
      else if (!v.siren && MAP.inter[node] && v.cleared !== v.seg + 1 && remaining < TILE * 0.8) {
        const axis = Math.abs(B.x - A.x) > Math.abs(B.y - A.y) ? 'EW' : 'NS';
        if (remaining > TILE * 0.32 && !lightGreen(node, axis)) { blocked = true; atJunction = true; }
        else v.cleared = v.seg + 1;
      }
    }
    // Car following per lane, lane changes when the lane ahead is blocked or a turn is coming
    const nL = lanesPerDir(v.path[v.seg]), laneTol = laneWidth(nL) * 0.6;
    if (v.lane >= nL) v.lane = nL - 1;
    const cand = (H.get(v.path[v.seg]) || []).concat(H.get(node) || []);
    if (!blocked && v.ghost <= 0) {
      for (let k = 0; k < cand.length; k++) {
        const o = cand[k]; if (o === v) continue;
        const dx = o.x - v.x, dy = o.y - v.y;
        const along = dx * v.hx + dy * v.hy;
        if (along <= 0 || along > (v.len + o.len) * 0.5 + 5) continue;
        const lat = Math.abs(dx * v.hy - dy * v.hx);
        if (v.siren && !o.siren) continue;          // emergency priority: other cars pull over
        if (lat < laneTol && (o.hx * v.hx + o.hy * v.hy) > -0.3) {
          if (!(nL > 1 && tryLaneChange(v, cand, nL))) { blocked = true; break; }
        }
      }
    }
    if (!blocked && !atJunction && nL > 1 && !v.siren && (v.laneT || 0) <= 0) { const want = laneIntent(v, nL); if (want !== v.lane) tryLaneChange(v, cand, nL, want); }
    if (v.ghost > 0) v.ghost -= dt;
    v.state = blocked ? (atJunction ? (S.p9 && junctionType(node) !== 'signal' ? 'yielding' : 'red light') : 'queued') : 'moving';
    if (blocked) {
      v.speed = 0; v.stopped += dt; stoppedCount++;
      if (v.stopped > 3 && !v.rerouted && v.dest) tryReroute(v);       // look for an alternative route around the jam
      if (v.stopped > 4.5) { v.ghost = 1.2; v.stopped = 0; }   // deadlock breaker
      continue;
    }
    v.stopped = 0;
    // Pull over when a siren approaches from behind
    let pull = 0;
    if (!v.siren && AG.sirens) for (let k = 0; k < AG.sirens.length; k++) { const e = AG.sirens[k], ex = v.x - e.x, ey = v.y - e.y; if (ex * ex + ey * ey < 4900 && ex * e.hx + ey * e.hy > 0) { pull = 1; break; } }
    v.pull = lerp(v.pull || 0, pull, 0.2);
    const rt = ROAD_TYPES[MAP.roads[v.path[v.seg]]] || ROAD_TYPES[1];
    const target = v.maxSpeed * rt.speed * (v.siren || v.type === 'race' ? 1.15 : cong) * (v.pull > 0.5 ? 0.35 : 1) * (1 + 0.04 * (v.lane || 0)) * (MAP.blocked[v.path[v.seg]] === 4 ? 0.45 : 1);
    v.speed = Math.min(target, v.speed + 80 * dt);
    v.t += v.speed * dt;
    let A2 = A, B2 = B, L2 = segLen;
    while (v.t >= L2) {
      v.t -= L2; v.seg++;
      if (v.seg >= v.wp.length - 1) break;
      A2 = v.wp[v.seg]; B2 = v.wp[v.seg + 1]; L2 = Math.hypot(B2.x - A2.x, B2.y - A2.y) || 0.01;
    }
    if (v.seg >= v.wp.length - 1) { arriveVehicle(i); continue; }
    const f = v.t / L2;
    v.x = A2.x + (B2.x - A2.x) * f; v.y = A2.y + (B2.y - A2.y) * f;
    const hx = (B2.x - A2.x) / L2, hy = (B2.y - A2.y) / L2;
    const nl2 = lanesPerDir(v.path[Math.min(v.seg, v.path.length - 1)]);
    v.lat = lerp(v.lat || 0, nl2 > 1 || v.lat ? laneExtra(Math.min(v.lane || 0, nl2 - 1), nl2) : 0, Math.min(1, dt * 4));
    if (v.lat) { v.x += -hy * v.lat; v.y += hx * v.lat; }
    v.hx = lerp(v.hx, hx, 0.35); v.hy = lerp(v.hy, hy, 0.35);
    const hl = Math.hypot(v.hx, v.hy) || 1; v.hx /= hl; v.hy /= hl;
  }
  SIM.visualStopRatio = vs.length ? stoppedCount / vs.length : 0;
}
function arriveVehicle(i) {
  const v = AG.vehicles[i];
  if (v.line && transitVehicleArrive(v)) return;
  if (v.incident) onIncidentCrew(v);
  if (v.patient && p10PatientArrive(v)) return;         // Part 10: ambulance picked the patient up → drives on to the hospital
  if (v.p10inc) p10IncidentArrive(v);                   // Part 10: incident center unit on site
  if (v.type === 'bus') {
    const stops = busRouteStops();
    if (stops.length >= 2) {
      const k = v.route % stops.length;
      const a = stops[k], b = stops[(k + 1) % stops.length];
      const p = roadPath(a._entry, b._entry);
      if (p && p.length >= 2) {
        v.path = p; v.wp = laneWaypoints(p); v.seg = 0; v.t = 0; v.route = (k + 1) % stops.length; v.dwell = 1.5; v.cleared = -1;
        return;
      }
    }
  }
  if (v.type === 'race' && v.life < 120 && activeEvent('racing')) {
    const roads = []; for (let k = 0; k < MAP.roads.length; k++) if (MAP.roads[k]) roads.push(k);
    const p = roadPath(v.path[v.path.length - 1], pick(roads));
    if (p && p.length >= 2) { v.path = p; v.wp = laneWaypoints(p); v.seg = 0; v.t = 0; v.cleared = -1; return; }
  }
  if (v.type === 'firetruck' && v.dest) { v.dest.fire = Math.min(v.dest.fire, 2); }
  if (v.accident) onEmergencyArrive(v);
  if (v.type === 'maint') onMaintenanceArrive(v);
  removeVehicle(i, true);
}
function updateTraffic(simDt) {
  if (simDt <= 0) return;
  if (S._rawVehicles && MAP.roadCount) { restoreVehicles(S._rawVehicles); S._rawVehicles = null; }   // trucks & buses from the save resume their trips
  const hz = perf().trafficHz * (PERF.scale < 0.7 ? 0.5 : 1);
  const step = 1 / hz;
  AG.trafficAcc += simDt;
  let n = 0;
  while (AG.trafficAcc >= step && n < 6) { trafficStep(step); if (S.p9) transitPods(step); AG.trafficAcc -= step; n++; }
  if (n >= 6) AG.trafficAcc = 0;
  // Spawning
  AG.spawnTimer -= simDt;
  if (AG.spawnTimer <= 0) {
    AG.spawnTimer = 0.5;
    const maxV = Math.floor(perf().veh * PERF.scale);
    const ambient = AG.vehicles.filter(function (v) { return v.ambient; }).length;
    const want = MAP.roadCount < 4 ? 0 : Math.floor(maxV * clamp(0.1 + SIM.traffic / 80, 0.08, 1) * Math.min(1, S.city.population / 60 + 0.1));
    if (ambient < want && AG.vehicles.length < maxV) {
      const r = Math.random();
      const type = (r < 0.22 && (MAP.lists.factories.length || MAP.lists.extractors.length)) ? 'truck' : (r < 0.3 && MAP.lists.waste.length) ? 'garbage' : (r < 0.38 && countAny('taxi')) ? 'taxi' : 'car';
      spawnAmbientVehicle(type);
    } else if (ambient > want + 3) {
      for (let i = AG.vehicles.length - 1; i >= 0; i--) if (AG.vehicles[i].ambient && AG.vehicles[i].type !== 'race') { AG.vehicles.splice(i, 1); break; }
    }
    if (S.p9) transitTick(0);            // Part 9 transit network: lines decide how many buses / trams / shuttles run
    else {
      const stops = busRouteStops();
      const buses = AG.vehicles.filter(function (v) { return v.type === 'bus'; }).length;
      const wantBus = stops.length >= 2 ? Math.min(8, Math.ceil(stops.length / 2)) : 0;
      if (buses < wantBus) spawnBus(randInt(0, stops.length - 1));
      else if (buses > wantBus) { for (let i = AG.vehicles.length - 1; i >= 0; i--) if (AG.vehicles[i].type === 'bus') { AG.vehicles.splice(i, 1); break; } }
    }
  }
  // Airplanes
  const ap = S.buildings.list.find(function (b) { return b.type === 'airport' && b._op; });
  AG.planeTimer -= simDt;
  if (ap && AG.planeTimer <= 0) {
    AG.planeTimer = rand(9, 16);
    const c = buildingCenter(ap);
    const takeoff = Math.random() < 0.5;
    AG.planes.push({ x: c.x - 70, y: c.y + 10, vx: takeoff ? 20 : -20, alt: takeoff ? 0 : 60, climb: takeoff ? 1 : -1, t: 0, takeoff: takeoff, ap: c });
    if (!takeoff) { const p = AG.planes[AG.planes.length - 1]; p.x = c.x + 700; p.vx = -90; }
  }
  for (let i = AG.planes.length - 1; i >= 0; i--) {
    const p = AG.planes[i]; p.t += simDt;
    if (p.takeoff) { p.vx = Math.min(140, p.vx + 30 * simDt); if (p.t > 2.5) p.alt += 18 * simDt; }
    else { if (p.alt > 0) p.alt = Math.max(0, p.alt - 9 * simDt); else p.vx = Math.min(-10, p.vx + 25 * simDt); }
    p.x += p.vx * simDt;
    if (p.t > 16 || (!p.takeoff && p.alt <= 0 && p.vx > -12)) AG.planes.splice(i, 1);
  }
}

/* --- Ships: Port ↔ world along sea-connected water ------------------------------ */
AG.ships = []; AG.shipTimer = 4;
function waterPathToEdge(b) {
  const d = bdef(b), W = MAP.W, H = MAP.H;
  let start = -1;
  for (let yy = b.y - 1; yy <= b.y + d.h && start < 0; yy++) for (let xx = b.x - 1; xx <= b.x + d.w && start < 0; xx++) if (inMap(xx, yy) && MAP.sea[idx(xx, yy)]) start = idx(xx, yy);
  if (start < 0) return null;
  const par = new Int32Array(W * H).fill(-1); const q = [start]; par[start] = start; let end = -1;
  while (q.length) {
    const c = q.shift(), x = c % W, y = (c / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { end = c; break; }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { const nx = x + o[0], ny = y + o[1]; if (!inMap(nx, ny)) return; const ni = idx(nx, ny); if (MAP.sea[ni] && par[ni] < 0) { par[ni] = c; q.push(ni); } });
  }
  if (end < 0) return null;
  const path = []; let c = end; while (c !== start) { path.push(tileCenter(c)); c = par[c]; } path.push(tileCenter(start));
  path.reverse();
  // continue past the map border so ships sail off into the world
  const ex = end % W, ey = (end / W) | 0, last = path[path.length - 1];
  const off = TILE * 4;
  path.push(ex === 0 ? { x: last.x - off, y: last.y } : ex === W - 1 ? { x: last.x + off, y: last.y } : ey === 0 ? { x: last.x, y: last.y - off } : { x: last.x, y: last.y + off });
  return path;
}
function updateShips(simDt) {
  if (simDt <= 0) return;
  const port = MAP.lists.ports.find(function (b) { return b._op; });
  AG.shipTimer -= simDt;
  if (port && AG.shipTimer <= 0 && AG.ships.length < 4) {
    AG.shipTimer = rand(10, 18);
    if (!port._waterPath || port._wpv !== MAP.version) { port._waterPath = waterPathToEdge(port); port._wpv = MAP.version; }
    const p = port._waterPath;
    if (p && p.length > 1) {
      const outbound = Math.random() < 0.5;
      AG.ships.push({ path: outbound ? p : p.slice().reverse(), i: 0, x: 0, y: 0, t: 0, out: outbound, color: pick(['#e63946', '#457b9d', '#2a9d8f', '#f4a261']), cargo: pick(PRODUCT_IDS) });
    }
  }
  for (let k = AG.ships.length - 1; k >= 0; k--) {
    const sh = AG.ships[k];
    sh.t += simDt * 0.9;
    const seg = Math.floor(sh.t), f = sh.t - seg;
    if (seg >= sh.path.length - 1) { AG.ships.splice(k, 1); continue; }
    const a = sh.path[seg], b = sh.path[seg + 1];
    sh.x = a.x + (b.x - a.x) * f; sh.y = a.y + (b.y - a.y) * f; sh.ang = Math.atan2(b.y - a.y, b.x - a.x);
  }
}
