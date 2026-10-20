'use strict';
/* BLOCK CITY TYCOON — GOVERNMENT ENGINE 2.0 · PUBLIC SERVICES (Part 18)
   PublicServiceSystem (capacity · coverage · quality · budget · workers · maintenance · satisfaction for healthcare,
   education, police, fire, transport, waste, water, electricity, road maintenance and parks), HealthcareSystem
   (beds, doctors, nurses, emergency capacity, treatment quality, waiting time — from the Part 10 health pass),
   EducationSystem (seats per stage, qualification → income / employment / productivity), PoliceSystem and
   FireDepartmentSystem (response time from station distance, traffic, road condition, vehicles and weather; crime
   risk per district type), MaintenanceSystem (Excellent … Failed per network; failures go through the existing
   infrastructure systems), district statistics, CitizenSatisfaction 2.0, CityApproval and district-aware citizen
   comments. All results are cached per game hour; coverage grids are cached per MAP.version. */

/* ---------- coverage grids (cached per map version) ---------- */
function govGrids() {
  const c = GOV.cache; if (c.gridVer === MAP.version && c.grids) return c.grids;
  const svc = function (t) { return covGrid(function (b) { return BUILDINGS[b.type].service === t && b._road && b.built; }, function (b) { return coverRadius(b); }); };
  c.grids = {
    health: svc('health'), police: svc('police'), fire: svc('fire'),
    education: covGrid(function (b) { const d = BUILDINGS[b.type]; return !!(d.edu || d.eduLvl) && b.built; }, function (b) { return 7 + (BUILDINGS[b.type].eduLvl || 1) * 1.5; }),
    transport: covGrid(function (b) { const d = BUILDINGS[b.type]; return !!d.transit && b.built; }, function (b) { return 4 + Math.sqrt(BUILDINGS[b.type].transit || 1) * 0.8; }),
    parks: covGrid(function (b) { const d = BUILDINGS[b.type]; return (!!d.hap || d.cat === 'Leisure') && b.built; }, function () { return 5; })
  };
  c.gridVer = MAP.version;
  return c.grids;
}
function govDistrictIndex(x, y) { const n = MAP.dN || Math.ceil(MAP.W / 8); return Math.floor(y / 8) * n + Math.floor(x / 8); }

/* ---------- response times: distance to the nearest station · traffic · road condition · vehicles · weather ---------- */
function govStations(kind) { return (MAP.lists[kind] || []).filter(function (b) { return b.built && b._road && b._op !== false; }); }
function govResponse(kind, x, y) {
  const st = govStations(kind); if (!st.length) return 45;
  let best = 1e9, sb = null; st.forEach(function (b) { const d = Math.abs(b.x - x) + Math.abs(b.y - y); if (d < best) { best = d; sb = b; } });
  const k = govDistrictIndex(x, y), cong = GOV.cache.congD ? GOV.cache.congD[k] || 0 : 0;
  const rc = S.p10 && S.p10.infra && S.p10.infra['r' + k] ? S.p10.infra['r' + k].cond / 100 : 1;   // road condition of the district
  const wx = typeof VE !== 'undefined' ? 1 + VE.wx.snow * 0.5 + VE.wx.fog * 0.3 + VE.wx.wet * 0.15 : 1;
  const crews = sb ? Math.max(0.3, (sb._actW || 0) / Math.max(1, sb.workers || 1)) : 0.3;          // vehicles that can actually leave
  const fund = gov().budget.funding[kind === 'health' ? 'health' : kind] || 1;
  const pol = typeof govPolicyActive === 'function' && govPolicyActive('emergency') ? 0.85 : 1;
  const minutes = (1.5 + best * TILE_METERS / 1000 / 0.6) * (1 + cong * 1.4) * (1.6 - 0.6 * rc) * wx / Math.min(1.3, 0.45 + 0.55 * crews) / Math.min(1.2, 0.6 + 0.4 * fund) * pol;
  return clamp(minutes, 1, 60);
}
function govFireRate(b) {                                       // events.js: a quick fire service puts fires out faster
  if (!S || !S.government) return 1;
  const D = GOV.cache.respD, k = govDistrictIndex(b.x, b.y), r = D && D.fire ? D.fire[k] : null;
  return r === null || r === undefined ? 1 : clamp(9 / Math.max(2, r), 0.5, 1.6);
}

/* ---------- public services (hourly) ---------- */
function govServicesHour() {
  const G = gov(), sv = {}, F = G.budget.funding, pop = Math.max(1, S.city.population), exp = (G.budget.last && G.budget.last.exp) || {};
  // congestion per district (for response times)
  const n = MAP.dN || Math.ceil(MAP.W / 8), congD = new Float32Array(n * n), cnt = new Float32Array(n * n);
  if (MAP.cong) for (let i = 0; i < MAP.W * MAP.H; i++) if (MAP.roads[i]) { const k = govDistrictIndex(i % MAP.W, (i / MAP.W) | 0); congD[k] += MAP.cong[i]; cnt[k]++; }
  for (let k = 0; k < congD.length; k++) congD[k] = cnt[k] ? congD[k] / cnt[k] : 0;
  GOV.cache.congD = congD;
  const of = function (test) { const L = S.buildings.list.filter(function (b) { return b.built && test(bdef(b)); }); let w = 0, need = 0, cond = 0; L.forEach(function (b) { w += b._actW || 0; need += b.workers || 0; cond += b.cond === undefined ? 100 : b.cond; }); return { n: L.length, workers: Math.round(w), need: need, maint: L.length ? cond / L.length : 100, staff: need ? w / need : 1 }; };
  const mk = function (id, capacity, used, coverage, quality, extra) {
    const def = GOV_SERVICES.find(function (s) { return s[0] === id; }), b = of(def[3]);
    const q = clamp(quality * (0.55 + 0.45 * Math.min(1.25, F[id])) * (0.75 + 0.25 * Math.min(1, b.staff)) * (0.8 + 0.2 * b.maint / 100), 0, 100);
    sv[id] = Object.assign({ id: id, capacity: Math.round(capacity), used: Math.round(used), coverage: clamp(coverage, 0, 1), quality: q, budget: Math.round(exp[id] || 0), workers: b.workers, staff: b.staff, buildings: b.n, maint: Math.round(b.maint), funding: F[id], sat: clamp(q * 0.7 + coverage * 30, 0, 100) }, extra || {});
  };
  // healthcare: beds, doctors / nurses (a third of the staff are doctors), emergency capacity, treatment quality, waiting time
  const H = (typeof SV !== 'undefined' && SV.health) || (typeof healthPass === 'function' ? healthPass(0, true) : { beds: 0, er: 0, staff: 0, staffNeed: 0, treat: 0, patients: 0, load: 0, access: SIM.cov.health || 0, wait: 15 });
  const hPol = typeof govPolicyActive === 'function' && govPolicyActive('healthInvest') ? 12 : 0;
  mk('health', H.beds, H.patients, H.access, clamp(100 * Math.min(1.2, H.treat) - Math.max(0, H.load - 0.85) * 60 + hPol, 0, 100), { beds: Math.round(H.beds), doctors: Math.round(H.staff / 3), nurses: Math.round(H.staff - H.staff / 3), er: Math.round(H.er), treat: H.treat, load: H.load, wait: H.wait, resp: 0 });
  // education: seats per stage, qualification (average stage), fit of skilled workers
  const E = (typeof SV !== 'undefined' && SV.edu) || (typeof educationPass === 'function' ? educationPass() : null);
  const seats = E ? E.seats.reduce(function (a, v) { return a + v; }, 0) : 0, demand = E ? E.dem.reduce(function (a, v) { return a + v; }, 0) : pop * 0.2;
  const eCov = E ? (E.cov[1] * 0.4 + E.cov[2] * 0.3 + E.cov[3] * 0.1 + E.cov[4] * 0.2) : 0;
  mk('education', seats, Math.min(seats, demand), eCov, clamp(S.city.education * 0.7 + (E ? E.fit * 30 : 15), 0, 100), { qual: E ? E.avg : 0, fit: E ? E.fit : 0, stages: E ? E.cov.slice(1).map(function (v) { return Math.round(v * 100); }) : [] });
  // police / fire: coverage, response time (population-weighted over districts), staff, patrol / fire vehicles
  const resp = { police: [], fire: [], health: [] }, DD = [];
  const homes = {}; S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.housing || !b._hcap) return; const k = govDistrictIndex(b.x, b.y); homes[k] = (homes[k] || 0) + b._hcap; if (!DD[k]) DD[k] = { x: b.x, y: b.y }; });
  const wavg = function (kind) { let s = 0, w = 0; const arr = []; Object.keys(homes).forEach(function (k) { const r = govResponse(kind, DD[k].x, DD[k].y); arr[k] = r; s += r * homes[k]; w += homes[k]; }); resp[kind] = arr; return w ? s / w : 12; };
  const pR = wavg('police'), fR = wavg('fire'), aR = wavg('health');
  GOV.cache.respD = resp;
  const ps = govStations('police'), fs = govStations('fire');
  mk('police', ps.length * 400, pop * S.city.crime / 100, SIM.cov.police || 0, clamp(100 - Math.max(0, pR - 5) * 4 - S.city.crime * 0.5, 0, 100), { resp: pR, patrols: ps.reduce(function (a, b) { return a + Math.ceil((b._actW || 0) / 4); }, 0), crime: S.city.crime });
  mk('fire', fs.length * 600, S.buildings.list.filter(function (b) { return b.fire > 0; }).length, SIM.cov.fire || 0, clamp(100 - Math.max(0, fR - 4) * 5, 0, 100), { resp: fR, trucks: fs.reduce(function (a, b) { return a + Math.ceil((b._actW || 0) / 5); }, 0), burning: S.buildings.list.filter(function (b) { return b.fire > 0; }).length });
  sv.health.resp = aR;
  // public transport, waste, water, electricity, roads, parks
  const g = govGrids(), cov = function (grid) { let s = 0, w = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.housing || !b._hcap) return; s += (grid[idx(b.x, b.y)] > 0.15 ? 1 : 0) * b._hcap; w += b._hcap; }); return w ? s / w : 0; };
  mk('transport', SIM.transitCap || 0, SIM.riders || 0, cov(g.transport), clamp(100 - (SIM.traffic || 0) * 0.6 + Math.min(30, (SIM.riders || 0) / pop * 300), 0, 100), { riders: Math.round(SIM.riders || 0), traffic: SIM.traffic || 0 });
  mk('waste', pop, pop * Math.max(0, SIM.wastePenalty || 0), 1 - Math.min(1, SIM.wastePenalty || 0), clamp(100 - (SIM.wastePenalty || 0) * 140, 0, 100));
  mk('water', SIM.waterGen || 0, SIM.waterUse || 0, Math.min(1, SIM.waterRatio || 0), clamp(Math.min(1, SIM.waterRatio || 0) * 100 - (S.p9 && S.p9.water ? (S.p9.water.breaks || []).length * 6 : 0), 0, 100));
  mk('electricity', SIM.powerGen || 0, SIM.powerUse || 0, Math.min(1, SIM.powerRatio || 0), clamp(Math.min(1, SIM.powerRatio || 0) * 100 - (S.p9 ? S.p9.util.failures.filter(function (f) { return f.until > S.clock.runSec; }).length * 8 : 0), 0, 100));
  const rc = S.p10 && S.p10.infra ? Object.keys(S.p10.infra).filter(function (k) { return k[0] === 'r'; }).map(function (k) { return S.p10.infra[k].cond; }) : [];
  const roadQ = rc.length ? rc.reduce(function (a, v) { return a + v; }, 0) / rc.length : 80;
  mk('roads', MAP.roadCount || 0, MAP.roadCount || 0, 1, roadQ, { cond: roadQ });
  mk('parks', MAP.lists.parks ? MAP.lists.parks.length : 0, pop, cov(g.parks), clamp(40 + cov(g.parks) * 60 - S.city.pollution * 0.3, 0, 100));
  G.services = sv;
}

/* ---------- maintenance (hourly): Excellent 100 · Good 75 · Warning 50 · Critical 25 · Failed 0 ---------- */
function govMaintenanceHour() {
  const G = gov(), I = (S.p10 && S.p10.infra) || {}, M = {};
  const avg = function (arr, d) { return arr.length ? arr.reduce(function (a, v) { return a + v; }, 0) / arr.length : d; };
  const keys = Object.keys(I), roads = keys.filter(function (k) { return k[0] === 'r'; }).map(function (k) { return I[k].cond; }), bridges = keys.filter(function (k) { return k[0] === 'b'; }).map(function (k) { return I[k].cond; });
  const tunnels = keys.filter(function (k) { return k[0] === 'r' && I[k].tunnel; }).map(function (k) { return I[k].cond; });
  const bl = S.buildings.list.filter(function (b) { return b.built && b.cond !== undefined; });
  const mf = S.p10 && S.p10.maint ? S.p10.maint : { power: 1, water: 1, rail: 1 }, F = G.budget.funding;
  const activeFail = S.p9 ? S.p9.util.failures.filter(function (f) { return f.until > S.clock.runSec; }).length : 0, breaks = S.p9 && S.p9.water ? (S.p9.water.breaks || []).length : 0;
  const net = function (fund, pen) { return clamp(100 * Math.min(1, 0.35 + 0.65 * fund) - pen, 0, 100); };
  const prevPower = G.maint.power ? G.maint.power.v : 100, prevWater = G.maint.water ? G.maint.water.v : 100, prevSew = G.maint.sewage ? G.maint.sewage.v : 100;
  const drift = function (prev, fund) { return clamp(prev + (fund >= 1 ? 1.5 : -(1 - fund) * 4), 0, 100); };   // networks wear out when underfunded, recover when funded
  const emergency = bl.filter(function (b) { const d = bdef(b); return d.service === 'fire' || d.service === 'police' || d.service === 'health'; }).map(function (b) { return b.cond; });
  const transit = bl.filter(function (b) { return !!bdef(b).transit; }).map(function (b) { return b.cond; });
  const sewOver = S.p9 && S.p9.sewer ? clamp((S.p9.sewer.overflow || 0) * 10, 0, 60) : 0;
  const set = function (k, name, v) { M[k] = { name: name, v: Math.round(v), level: govMaintLabel(v) }; };
  set('roads', 'Roads', avg(roads, 90)); set('bridges', 'Bridges', avg(bridges, 95)); set('tunnels', 'Tunnels', avg(tunnels, avg(roads, 90)));
  set('buildings', 'Buildings', avg(bl.map(function (b) { return b.cond; }), 95));
  set('power', 'Power Grid', Math.min(net(mf.power, activeFail * 10), drift(prevPower, F.electricity)));
  set('water', 'Water Network', Math.min(net(mf.water, breaks * 8), drift(prevWater, F.water)));
  set('sewage', 'Sewage', Math.min(net(mf.water, sewOver), drift(prevSew, F.water)));
  set('transport', 'Public Transport', Math.min(net(mf.rail, 0), avg(transit, 95)));
  set('emergency', 'Emergency Buildings', avg(emergency, 95));
  M.avg = Math.round(['roads', 'bridges', 'buildings', 'power', 'water', 'sewage', 'transport', 'emergency'].reduce(function (a, k) { return a + M[k].v; }, 0) / 8);
  G.maint = M;
  // failures: a FAILED network breaks for real through the existing systems (outage, pipe break, road works, closure)
  const day = gameDay(), rnd = function () { return RNG.next(); };
  if (M.power.level === 'Failed' && rnd() < 0.25 && S.p9) { const b = S.buildings.list.find(function (x) { return x.built && bdef(x).housing; }); if (b) { S.p9.util.failures.push({ x: b.x, y: b.y, r: 4, until: S.clock.runSec + 400, cause: 'maintenance' }); govAlert('pfail', '⚡ POWER FAILURE: the unmaintained power grid failed near ' + (districtName(b.x, b.y) || 'the city') + '.', 'bad'); } }
  if (M.water.level === 'Failed' && rnd() < 0.25 && typeof breakPipe === 'function') { govSafe('pipe', function () { breakPipe(); }); govAlert('wfail', '💧 WATER LEAK: the unmaintained water network is leaking.', 'bad'); }
  if (M.buildings.level === 'Critical' || M.buildings.level === 'Failed') { const w = bl.filter(function (b) { return b.cond < 12 && !b.closed && b.owner === 'city'; })[0]; if (w) { w.closed = true; govAlert('bclose', '🚧 BUILDING CLOSURE: ' + bdef(w).name + ' closed — condition ' + Math.round(w.cond) + '%. Repair it or raise maintenance funding.', 'bad'); } }
  if (M.bridges.level === 'Failed') govAlert('collapse', '🌉 INFRASTRUCTURE COLLAPSE: bridges have failed — traffic is diverted. Repair them in Living City → Infrastructure.', 'bad');
  void day;
}

/* ---------- districts (hourly, one pass over buildings) ---------- */
function govDistrictsHour() {
  const G = gov(), n = MAP.dN || Math.ceil(MAP.W / 8), D = {}, g = govGrids(), R = GOV.cache.respD || {}, tax = S.city.tax / 100;
  const air = typeof ENV !== 'undefined' && ENV.air ? ENV.air : null;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b.built || d.id === 'tree') return;
    const k = govDistrictIndex(b.x, b.y), c = D[k] || (D[k] = { k: k, x: b.x, y: b.y, pop: 0, contrib: 0, cond: 0, condN: 0, land: 0, landN: 0, cov: { health: 0, education: 0, police: 0, fire: 0, transport: 0 }, homes: 0, pol: 0, polN: 0 });
    c.contrib += (b._rev || 0) * (b.owner === 'city' ? 0 : tax * 0.6) + (d.housing && b._cust ? b._cust * WAGE_PER_WORKER * tax * 0.55 : 0);
    if (b.cond !== undefined) { c.cond += b.cond; c.condN++; }
    if (typeof landValueTile === 'function' && typeof PROP !== 'undefined' && PROP.grid) { c.land += landValueTile(b.x, b.y); c.landN++; }
    if (air) { c.pol += air[idx(b.x, b.y)] || 0; c.polN++; }
    if (d.housing && b._hcap) { const i = idx(b.x, b.y), h = b._cust || 0; c.pop += h; c.homes += b._hcap; ['health', 'education', 'police', 'fire', 'transport'].forEach(function (s) { c.cov[s] += (g[s][i] > 0.15 ? 1 : 0) * b._hcap; }); }
  });
  const I = (S.p10 && S.p10.infra) || {}, T = govTaxes(), tp = govTaxPressure(T);
  const out = Object.keys(D).map(function (k) {
    const c = D[k], h = Math.max(1, c.homes), cv = function (s) { return Math.round(c.cov[s] / h * 100); };
    const roadC = I['r' + k] ? I['r' + k].cond : 90, maint = Math.round((c.condN ? c.cond / c.condN : 90) * 0.5 + roadC * 0.5);
    const health = cv('health'), edu = cv('education'), safety = Math.round(clamp(cv('police') * 0.6 + 40 - Math.max(0, (R.police ? R.police[k] || 12 : 12) - 6) * 3, 0, 100)), fire = cv('fire'), trans = cv('transport');
    const pol = Math.round((c.polN ? c.pol / c.polN : S.city.pollution / 100) * 100), land = c.landN ? c.land / c.landN : 1;
    const svc = (health + edu + safety + fire + trans + maint) / 6, sat = Math.round(clamp(svc * 0.7 + (100 - tp) * 0.15 + (100 - pol) * 0.15, 0, 100));
    return { k: +k, name: districtName(c.x, c.y) || 'District ' + k, x: c.x, y: c.y, pop: Math.round(c.pop), contrib: Math.round(c.contrib * 1200), health: health, education: edu, safety: safety, fire: fire, transport: trans, maint: maint, hap: Math.round(clamp(S.city.happiness + (svc - 60) * 0.3 - (pol - 30) * 0.2, 0, 100)), land: Math.round(land * 100) / 100, pollution: pol, govSat: sat, policeResp: R.police ? Math.round((R.police[k] || 0) * 10) / 10 : 0, fireResp: R.fire ? Math.round((R.fire[k] || 0) * 10) / 10 : 0, type: typeof districtCharacterAt === 'function' ? districtCharacterAt(c.x, c.y) || '' : '' };
  }).sort(function (a, b) { return b.pop - a.pop; });
  G.districts = out.slice(0, 64);
  GOV.cache.distByK = {}; out.forEach(function (d) { GOV.cache.distByK[d.k] = d; });
}
function govDistrictAt(x, y) { return GOV.cache.distByK ? GOV.cache.distByK[govDistrictIndex(x, y)] || null : null; }
/* crime risk by district type: industrial, nightlife, poor residential, high traffic */
function govCrimeRisk(d) {
  const t = d.type || '', base = 30 + (100 - d.safety) * 0.4 + (S.city.crime || 0) * 0.3;
  return clamp(base + (/Industrial/.test(t) ? 10 : 0) + (/Downtown|Tourism|Nightlife/.test(t) ? 8 : 0) + (d.land < 0.8 ? 10 : 0) + ((GOV.cache.congD && GOV.cache.congD[d.k] || 0) > 0.5 ? 6 : 0), 0, 100);
}
/* public services → property value: a well served district is worth more (rent / price), capped so it stays affordable */
(function () {
  const rm = window.rentMult;
  if (typeof rm === 'function' && !rm.__p18) { window.rentMult = function (b) { const v = rm.apply(this, arguments); if (!S || !S.government || !b) return v; const d = govDistrictAt(b.x, b.y); if (!d) return v; const svc = (d.health + d.education + d.safety + d.fire + d.transport + d.maint) / 600; return v * clamp(0.92 + svc * 0.2, 0.9, 1.12); }; window.rentMult.__p18 = true; }
})();

/* ---------- Citizen Satisfaction 2.0 + City Approval (hourly) ---------- */
function govSatisfactionHour() {
  const G = gov(), sv = G.services, q = function (id, d) { return sv[id] ? sv[id].quality : d; }, P17 = S.p17;
  const inc = HH.stats ? clamp(50 + (HH.stats.income * 30 - HH.stats.expenses * 30) / Math.max(1, HH.stats.income * 30) * 60, 0, 100) : 55;
  const tp = govTaxPressure(), B = govBudgetSummary();
  const s = {
    happiness: S.city.happiness,
    safety: clamp(100 - S.city.crime * 1.2 + (q('police', 50) - 50) * 0.3, 0, 100),
    healthcare: clamp(q('health', 50) - (sv.health ? Math.max(0, sv.health.wait - 20) * 0.6 : 0), 0, 100),
    education: clamp(q('education', 50) * 0.8 + (sv.education ? sv.education.coverage * 20 : 0), 0, 100),
    transport: clamp(q('transport', 50) * 0.7 + (100 - (SIM.traffic || 0)) * 0.3, 0, 100),
    tax: clamp(100 - tp, 0, 100),
    housing: clamp(P17 ? 100 - P17.housing.afford * 140 + (P17.housing.crisis ? -15 : 0) : (SIM.housingSat || 60), 0, 100),
    employment: clamp(100 - (SIM.unemployment || 0) * 450, 0, 100),
    environment: clamp(100 - S.city.pollution * 1.1 + (q('parks', 50) - 50) * 0.3, 0, 100),
    income: inc,
    entertainment: clamp(SIM.dDisp && SIM.dDisp.ENTERTAINMENT ? 100 - Math.max(0, SIM.dDisp.ENTERTAINMENT - (SIM.sDisp.ENTERTAINMENT || 0)) : 60, 0, 100),
    services: Math.round(['health', 'education', 'police', 'fire', 'transport', 'waste', 'water', 'electricity', 'roads', 'parks'].reduce(function (a, k) { return a + q(k, 60); }, 0) / 10)
  };
  s.government = clamp(s.services * 0.5 + s.tax * 0.2 + (B.deficit ? 35 : 70) * 0.2 + ((G.maint.avg || 70)) * 0.1, 0, 100);
  const W = { happiness: 0.14, safety: 0.1, healthcare: 0.1, education: 0.08, transport: 0.08, tax: 0.08, housing: 0.09, employment: 0.1, environment: 0.07, income: 0.07, entertainment: 0.03, government: 0.06 };
  s.city = Object.keys(W).reduce(function (a, k) { return a + s[k] * W[k]; }, 0);
  Object.keys(s).forEach(function (k) { s[k] = Math.round(s[k] * 10) / 10; });
  G.sat = s;
  // approval moves slowly towards the satisfaction (+ budget health, − active crises)
  const crises = G.events.active.filter(function (e) { return GOV_EVENTS[e.id] && !GOV_EVENTS[e.id].good; }).length;
  const target = clamp(s.city * 0.72 + s.happiness * 0.18 + (B.deficitDays ? -B.deficitDays * 2 : 3) + ((G.maint.avg || 70) - 70) * 0.08 + 6 - crises * 3, 0, 100);
  G.approval.value = clamp(G.approval.value + (target - G.approval.value) * 0.08, 0, 100);
  G.approval.label = govApprovalLabel(G.approval.value);
}

/* ---------- citizen comments: real district data near the citizen's home ---------- */
if (typeof THOUGHTS !== 'undefined') THOUGHTS.push(
  { id: 'gHospital', t: ['The hospital near my home is excellent.', 'Great doctors in our district!'] },
  { id: 'gHospitalBad', t: ['The hospital is always full…', 'I waited hours at the hospital.'], bad: true },
  { id: 'gTaxes', t: ['Taxes are getting too high.', 'Another tax rise? Really?'], bad: true },
  { id: 'gTrafficD', t: ['There is too much traffic in this district.', 'Our streets are jammed every day.'], bad: true },
  { id: 'gSchool', t: ['The new school improved the neighborhood.', 'Good schools around here!'] },
  { id: 'gRoads', t: ['The roads need maintenance.', 'Potholes everywhere…'], bad: true },
  { id: 'gSafe', t: ['I feel safe in this district.', 'The police are quick here.'] },
  { id: 'gUnsafe', t: ['The police take forever to come.', 'This area does not feel safe.'], bad: true },
  { id: 'gServices', t: ['City services are great.', 'The city is well run!'] }
);
(function () {
  const tc = window.thoughtCandidates;
  if (typeof tc !== 'function' || tc.__p18) return;
  window.thoughtCandidates = function (c) {
    const out = tc.apply(this, arguments);
    if (!S || !S.government || c.tourist) return out;
    const home = c.home ? MAP.byId.get(c.home) : null, d = home ? govDistrictAt(home.x, home.y) : null, sv = S.government.services;
    if (!d) return out;
    const pc = function (id, w) { if (w > 0) out.push([id, w]); };
    pc('gHospital', d.health > 80 && sv.health && sv.health.quality > 70 ? 1.2 : 0);
    pc('gHospitalBad', sv.health && sv.health.load > 0.95 ? 1.6 : 0);
    pc('gTaxes', govTaxPressure() > 35 ? govTaxPressure() / 25 : 0);
    pc('gTrafficD', (GOV.cache.congD && GOV.cache.congD[d.k] || 0) > 0.55 ? 1.4 : 0);
    pc('gSchool', d.education > 85 && S.government.projects.some(function (p) { return p.status === 'done' && GOV_PROJECTS[p.type].svc === 'education' && gameDay() - p.done < 4; }) ? 2 : d.education > 90 ? 0.6 : 0);
    pc('gRoads', d.maint < 50 ? 1.5 : 0);
    pc('gSafe', d.safety > 80 ? 0.7 : 0);
    pc('gUnsafe', d.policeResp > 15 || d.safety < 35 ? 1.4 : 0);
    pc('gServices', S.government.sat.services > 80 ? 0.6 : 0);
    return out;
  };
  window.thoughtCandidates.__p18 = true;
})();
