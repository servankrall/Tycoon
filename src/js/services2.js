'use strict';
/* BLOCK CITY TYCOON — CITY SERVICES 2.0 (Part 10)
   Education pipeline (elementary → high school → college → university → research; education → skill → job quality →
   income → economy), university research fields feeding the tech tree, hospital system (capacity, staff, emergency beds,
   treatment efficiency, healthcare overload, ambulance route citizen → ambulance → hospital), Tourism 2.0 (tourists by
   road, rail, air, sea and from neighbouring cities; spending by category; attractions with a tourism value), airport as a
   logistics hub (passengers, cargo, flights, congestion, terminals), port (TEU, ships, imports / exports), railway
   freight & the Rail Hub, logistics network (factory → warehouse → truck/train/ship → distribution center → store →
   customer) and supply shocks with player responses. */

/* ===================================== BUILDINGS ===================================== */
BUILDINGS.school.name = 'Elementary School'; BUILDINGS.school.eduLvl = 1;
[
  { id: 'highschool', name: 'High School', icon: '🏫', cat: 'Science', sector: 'EDUCATION', w: 2, h: 2, cost: 14000, color: '#ffcdb2', roof: '#b5838d', height: 28, edu: 600, eduLvl: 2, workers: 25, maxW: 50, power: -6, water: -3, maint: 3, hap: 1, unlock: { pop: 500 }, desc: 'Second step of the education pipeline: 600 teenagers. Needs elementary graduates.' },
  { id: 'college', name: 'College', icon: '🏛️', cat: 'Science', sector: 'EDUCATION', w: 2, h: 2, cost: 26000, color: '#e5989b', roof: '#6d6875', height: 34, edu: 800, eduHigh: true, eduLvl: 3, rp: 0.3, workers: 30, maxW: 60, power: -9, water: -4, maint: 5, hap: 2, unlock: { pop: 1200 }, desc: 'Vocational & applied degrees: skilled workers for industry, logistics and services.' },
  { id: 'clinic', name: 'Clinic', icon: '⚕️', cat: 'Services', sector: 'SERVICE', service: 'health', w: 1, h: 1, cost: 4500, color: '#f8f9fa', roof: '#2a9d8f', height: 16, cover: 6, beds: 20, er: 4, workers: 8, maxW: 14, power: -3, water: -2, maint: 1.2, unlock: { pop: 80 }, desc: 'Neighbourhood healthcare: 20 beds, 4 emergency beds, small coverage radius.' },
  { id: 'medicalcenter', name: 'Medical Center', icon: '🏥', cat: 'Services', sector: 'SERVICE', service: 'health', w: 3, h: 2, cost: 90000, color: '#edf6f9', roof: '#e63946', height: 46, cover: 12, beds: 320, er: 50, workers: 80, maxW: 160, power: -25, water: -15, maint: 14, unlock: { pop: 3000 }, desc: '320 beds, 50 emergency beds and a large ambulance fleet.' },
  { id: 'unihospital', name: 'University Hospital', icon: '🏨', cat: 'Services', sector: 'SERVICE', service: 'health', w: 3, h: 3, cost: 260000, color: '#f1faee', roof: '#457b9d', height: 58, cover: 14, beds: 450, er: 70, edu: 300, eduHigh: true, eduLvl: 4, rp: 1.2, workers: 160, maxW: 320, power: -45, water: -25, maint: 30, unlock: { pop: 8000 }, desc: 'Teaching hospital: 450 beds, medical research and 300 university seats.' },
  { id: 'aquarium', name: 'Aquarium', icon: '🐠', cat: 'Leisure', sector: 'TOURISM', w: 2, h: 2, cost: 160000, color: '#48cae4', roof: '#0077b6', height: 26, tour: 1200, workers: 30, maxW: 60, power: -14, water: -20, maint: 14, hap: 3, unlock: { tourism: true }, desc: 'Tourist attraction (tourism value 1,200).' },
  { id: 'obstower', name: 'Observation Tower', icon: '🗼', cat: 'Leisure', sector: 'TOURISM', w: 1, h: 1, cost: 220000, color: '#adb5bd', roof: '#4cc9f0', height: 150, tour: 1100, workers: 12, maxW: 24, power: -10, maint: 12, unlock: { tourism: true, pop: 3000 }, desc: 'City panorama. Tourist attraction (tourism value 1,100).' },
  { id: 'convention', name: 'Convention Center', icon: '🏢', cat: 'Leisure', sector: 'TOURISM', w: 3, h: 2, cost: 380000, color: '#ced4da', roof: '#5f0f40', height: 30, tour: 1600, workers: 70, maxW: 140, power: -30, water: -10, maint: 30, unlock: { tourism: true, pop: 5000 }, desc: 'Business tourism, trade fairs & congresses (tourism value 1,600).' },
  { id: 'beachresort', name: 'Beach Resort', icon: '🏖️', cat: 'Leisure', sector: 'TOURISM', w: 3, h: 2, cost: 300000, color: '#ffe8d6', roof: '#f4a261', height: 34, tour: 1800, housing: 0, workers: 60, maxW: 120, power: -20, water: -30, maint: 24, hap: 2, needsWater: true, unlock: { tourism: true }, desc: 'Waterfront resort — must touch a river, lake or the sea (tourism value 1,800).' },
  { id: 'historic', name: 'Historic District', icon: '🏰', cat: 'Leisure', sector: 'TOURISM', w: 3, h: 3, cost: 150000, color: '#ddb892', roof: '#7f5539', height: 22, tour: 1400, workers: 20, maxW: 40, power: -6, maint: 10, hap: 5, unlock: { tourism: true }, desc: 'Preserved old town quarter (tourism value 1,400, happiness +).' },
  { id: 'monument', name: 'Landmark Monument', icon: '🗽', cat: 'Leisure', sector: 'TOURISM', w: 2, h: 2, cost: 500000, color: '#90be6d', roof: '#43aa8b', height: 90, tour: 2200, workers: 10, maxW: 20, power: -4, maint: 18, hap: 4, unlock: { tourism: true, pop: 6000 }, desc: 'The city\'s iconic landmark (tourism value 2,200).' },
  { id: 'airportterminal', name: 'Airport Terminal', icon: '🛫', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 900000, color: '#dee2e6', roof: '#8d99ae', height: 24, transit: 1000, tour: 400, workers: 120, maxW: 240, power: -50, water: -20, pol: 3, maint: 150, needsAirport: true, unlock: { tech: 'aviation' }, desc: 'Extra airport terminal: +15,000 passengers/day and more cargo. Must be within 10 tiles of the International Airport.' },
  { id: 'containerterminal', name: 'Container Terminal', icon: '🏗️', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 1200000, color: '#adb5bd', roof: '#e76f51', height: 30, trade: 150, workers: 150, maxW: 300, power: -40, pol: 4, maint: 160, needsSea: true, unlock: { cityLevel: 15 }, desc: 'Port expansion: +3,000 TEU/day. Must touch sea-connected water.' },
  { id: 'cruiseterminal', name: 'Cruise Terminal', icon: '🛳️', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 700000, color: '#f8f9fa', roof: '#0096c7', height: 26, tour: 1500, transit: 400, workers: 60, maxW: 120, power: -20, water: -10, maint: 70, needsSea: true, unlock: { tourism: true, pop: 4000 }, desc: 'Cruise ships bring up to 2,500 tourists. Must touch sea-connected water.' },
  { id: 'railhub', name: 'Rail Hub', icon: '🚉', cat: 'Transport', sector: 'TRANSPORT', w: 3, h: 2, cost: 420000, color: '#bc6c25', roof: '#606c38', height: 26, transit: 1500, workers: 80, maxW: 160, power: -30, maint: 50, freight: 3000, unlock: { tech: 'rail' }, desc: 'Freight hub: 3,000 t/day of steel, grain, electronics and industrial goods by train.' },
  { id: 'distcenter', name: 'Distribution Center', icon: '🚛', cat: 'Logistics', sector: 'LOGISTICS', w: 2, h: 2, cost: 30000, color: '#ccd5ae', roof: '#606c38', height: 20, storage: 6000, trucks: 8, workers: 25, maxW: 50, power: -8, maint: 5, unlock: { pop: 1000 }, desc: 'Last-mile hub between warehouses and stores: 6,000 units and 8 delivery vans.' }
].forEach(registerBuilding);
BUILDINGS.trainstation.freight = 400;
BUILDINGS.hospital.beds = 120; BUILDINGS.hospital.er = 20;
BUILDINGS.highschool.eduLvl = 2; BUILDINGS.university.eduLvl = 4; BUILDINGS.research.eduLvl = 5;
EMERGENCY_UNITS.medical.types.push('clinic', 'medicalcenter', 'unihospital');
const ATTRACTIONS = { monument: 'Landmark', museum: 'Museum', stadium: 'Stadium', themepark: 'Theme Park', aquarium: 'Aquarium', obstower: 'Tower', convention: 'Convention Center', beachresort: 'Beach Resort', historic: 'Historic District', megatower: 'Landmark', megastadium: 'Stadium', wheel: 'Landmark', quantumspire: 'Tower', spacecenter: 'Landmark' };

/* ===================================== STATE ===================================== */
function svNew() {
  return {
    edu: { dist: [0.3, 0.3, 0.2, 0.1, 0.1], graduates: 0, migratedEdu: false },
    research: { ai: 0, medicine: 0, engineering: 0, energy: 0, environment: 0, economics: 0, total: 0, rpGiven: 0 },
    health: { treated: 0, ambulance: 0, respSum: 0, respN: 0, overloadSec: 0, maxCare: false, healUntil: 0, log: [] },
    tour: { record: 0, arrivals: 0 },
    air: { paxTot: 0, cargoTot: 0, flightsTot: 0, congSec: 0 },
    port: { teuTot: 0, shipsTot: 0, congSec: 0 },
    rail: { freightTot: 0 },
    shocks: [], nextShock: 1, shockLog: []
  };
}
function svValidate(p) {
  p.edu.dist = (Array.isArray(p.edu.dist) && p.edu.dist.length === 5 ? p.edu.dist : [0.3, 0.3, 0.2, 0.1, 0.1]).map(function (v) { return clamp(+v || 0, 0, 1); });
  p.health.log = p10Items(p.health.log, 20, { d: 1, h: 0, from: '', to: '', resp: 0 });
  p.shocks = p10Items(p.shocks, 4, { id: 0, type: '', sev: 1, start: 0, resp: { import: false, domestic: false, factory: 0, alt: false }, prodStart: 0 }, function (s) { return !!SHOCK_DEFS[s.type]; });
  p.shocks.forEach(function (s) { s.sev = clamp(s.sev, 0, 1); });
  p.shockLog = p10Items(p.shockLog, 20, { d: 1, y: 1, name: '', icon: '', days: 0, resp: '' });
}

/* ===================================== MASTER (called from part10Tick) ===================================== */
const SV = { at: -99, real: 0, edu: null, health: null, tour: null, air: null, port: null, rail: null, logi: null, research: null };
function servicesTick(dt) {
  const now = performance.now();
  if (S.clock.runSec - SV.at >= 2 || now - SV.real > 4000 || SV.at > S.clock.runSec) { const d = Math.max(0, Math.min(10, S.clock.runSec - SV.at)); SV.at = S.clock.runSec; SV.real = now; servicesPass(d || dt); }
  shockTick(dt);
  if (p10Every('amb', 20, dt)) ambulanceTick();
  if (p10Every('study', 30, dt)) studyTick();
  if (S.p10.edu.migratedEdu && S.clock.runSec > 2) { S.p10.edu.migratedEdu = false; const r = p10UpgradeServices(true); if (r) { notify('🎓 City services upgraded for Part 10: ' + r, 'good'); timelineAdd('🎓', 'Education pipeline & healthcare network established', 'services'); } }
}
function servicesPass(dt) {
  SV.edu = educationPass(); SV.research = researchPass(dt); SV.health = healthPass(dt); SV.air = airportPass(dt); SV.port = portPass(dt); SV.rail = railPass(dt); SV.logi = logisticsPass(); SV.tour = tourismBreakdown(S.city.tourists);
}

/* ===================================== EDUCATION PIPELINE ===================================== */
const EDU_STAGES = ['No school', 'Elementary', 'High school', 'College', 'University'];
const EDU_DEMAND = [0, 0.10, 0.06, 0.035, 0.03];        // share of the population of each school age
function educationSeats() {
  const seats = [0, 0, 0, 0, 0, 0];
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.edu || !b._op) return; const lv = d.eduLvl || (d.eduHigh ? 4 : 1); seats[lv] += d.edu * lvlMult(b.level) * Math.max(0.3, b._eff); });
  return seats;
}
/* Chained coverage: high school needs elementary graduates, college & university need high-school graduates */
function educationPass() {
  const pop = S.city.population, s = educationSeats();
  const dem = EDU_DEMAND.map(function (k) { return pop * k; });
  const cov = function (lv, extra) { const seats = s[lv] + (extra || 0); return dem[lv] > 1 ? Math.min(1, seats / dem[lv]) : (seats > 0 ? 1 : 0); };
  const e1 = cov(1);
  const overflow = Math.max(0, s[1] - dem[1]) * 0.5;              // combined schools teach some teenagers
  const e2 = Math.min(cov(2, overflow), e1);
  const e3 = Math.min(cov(3), e2);
  const e4 = Math.min(cov(4, s[5]), e2);
  const target = [Math.max(0, 1 - e1), e1 - e2 * 0.95, e2 * 0.95 - Math.max(e3 * 0.5, e4 * 0.45), e3 * 0.5, e4 * 0.45].map(function (v) { return clamp(v, 0, 1); });
  const tot = target.reduce(function (a, v) { return a + v; }, 0) || 1;
  const D = S.p10.edu.dist;
  for (let k = 0; k < 5; k++) D[k] = lerp(D[k], target[k] / tot, BCT_SANDBOX.on ? 0 : 0.01);
  const avg = D.reduce(function (a, v, k) { return a + v * k; }, 0);
  // skilled-worker supply vs. high-skill job demand → job quality
  let skillJobs = 0, allJobs = 0;
  S.buildings.list.forEach(function (b) { if (!b._op || !b.workers) return; const n = jobEduNeed(bdef(b)); allJobs += b.workers; if (n >= 2) skillJobs += b.workers; });
  const skilledSupply = (D[3] + D[4] + D[2] * 0.3) * pop * 0.55, fit = skillJobs > 0 ? clamp(skilledSupply / skillJobs, 0, 1) : 1;
  return { seats: s, dem: dem, cov: [1, e1, e2, e3, e4], avg: avg, skillJobs: skillJobs, allJobs: allJobs, skilledSupply: skilledSupply, fit: fit };
}
/* Hook from econTick (section 15): the education target follows the pipeline */
function p10EduTarget(mods) {
  const E = SV.edu || educationPass();
  const c = E.cov;
  return clamp(100 * (0.3 * c[1] + 0.3 * c[2] + 0.15 * c[3] + 0.25 * c[4]) + (hasTech('s_edu') ? 15 : 0) + (mods.eduBonus || 0) + researchLevel('ai') * 0.5, 0, 100);
}
/* Hook from econTick (section 4): skilled jobs need skilled workers */
function skillFit(d) { if (!SV.edu || jobEduNeed(d) < 2) return 1; return 0.7 + 0.3 * SV.edu.fit; }
/* Young citizens move up the pipeline when there is a seat at the next level */
function studyTick() {
  const E = SV.edu; if (!E) return;
  let g = 0;
  AG.citizens.forEach(function (c) {
    if (c.tourist || !c.age || c.age > 26) return;
    citizenProfile(c);
    const next = (c.edu | 0) + 1; if (next > 4) return;
    if (Math.random() < E.cov[next] * 0.15) { c.edu = next; g++; }
  });
  if (g) S.p10.edu.graduates += g;
}

/* ===================================== RESEARCH FIELDS ===================================== */
const RESEARCH_FIELDS = [['ai', '🤖', 'AI', 'Tech company revenue +2%/level, education +0.5/level'], ['medicine', '💊', 'Medicine', 'Treatment efficiency +5%/level, fewer sick citizens'], ['engineering', '⚙️', 'Engineering', 'Construction & megaprojects +4%/level, infrastructure ages slower'], ['energy', '🔋', 'Energy', 'Power production +2%/level'], ['environment', '🌿', 'Environment', 'Pollution −3%/level'], ['economics', '📊', 'Economics', 'All revenue +1%/level']];
const RESEARCH_OUT = { university: { ai: 12, medicine: 8, engineering: 20, energy: 6, environment: 6, economics: 8 }, college: { engineering: 8, economics: 5, ai: 3 }, research: { ai: 30, medicine: 15, engineering: 25, energy: 25, environment: 15, economics: 5 }, unihospital: { medicine: 35, ai: 5 }, lab: { engineering: 1, ai: 1 }, techcampus: { ai: 10 }, datacenter: { ai: 8 } };
function researchLevel(f) { const v = S.p10 ? S.p10.research[f] || 0 : 0; return Math.floor(Math.log2(1 + v / 200)); }
function researchPass(dt) {
  const R = S.p10.research, out = {}; let tot = 0;
  RESEARCH_FIELDS.forEach(function (f) { out[f[0]] = 0; });
  S.buildings.list.forEach(function (b) {
    const o = RESEARCH_OUT[b.type]; if (!o || !b._op) return;
    const k = lvlMult(b.level) * Math.max(0.2, b._eff) * (0.6 + S.city.education / 250);
    for (const f in o) out[f] += o[f] * k;
  });
  const perSec = 1 / (86400 / TIME_SCALE);            // outputs are per game day
  if (!BCT_SANDBOX.on) for (const f in out) { const v = out[f] * perSec * dt; R[f] += v; tot += v; }
  R.total += tot;
  // Research Centers feed the tech tree: their field output becomes research points
  let rc = 0; S.buildings.list.forEach(function (b) { if (b.type === 'research' && b._op) rc += 30 * lvlMult(b.level) * b._eff * perSec * dt; });
  if (rc && !BCT_SANDBOX.on) { S.research.rp += rc; S.research.total += rc; R.rpGiven += rc; }
  return { perDay: out, rcRp: rc / Math.max(dt, 0.001) };
}

/* ===================================== HOSPITAL SYSTEM ===================================== */
function svHealthAccess() { const H = SV.health; if (!H) return 0.7; return H.access * (H.load > 1 ? 1 / H.load : 1); }
function svHealthIndex() { const H = SV.health; if (!H) return 0.6; return clamp(0.5 * H.access + 0.3 * Math.min(1, 1 / Math.max(0.01, H.load)) + 0.2 * Math.min(1, H.treat), 0, 1); }
function healthPass(dt, planning) {
  const P = S.p10.health, pop = S.city.population, list = [];
  let beds = 0, er = 0, need = 0, have = 0, effSum = 0;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!d.beds || !b.built) return;
    const k = lvlMult(b.level), eff = b._op ? b._eff : 0, cap = d.beds * k * Math.max(0, eff);
    list.push({ b: b, name: d.name, icon: d.icon, beds: Math.round(d.beds * k), er: Math.round(d.er * k), staff: Math.round(b._actW || 0), staffNeed: b.workers, eff: eff, cap: cap });
    beds += cap; er += d.er * k * Math.max(0, eff); need += b.workers; have += b._actW || 0; effSum += eff;
  });
  const med = researchLevel('medicine');
  const treat = list.length ? clamp(effSum / list.length * (1 + 0.05 * med), 0, 1.5) : 0;
  const w = planning ? 'clear' : FX.weather, dis = !planning && S.p9 && S.p9.disasters.length ? 1.3 : 1;     // planning (world generator): no weather / disaster spikes
  let patients = pop * 0.012 * (1 + S.city.pollution / 100) * (w === 'heatwave' || w === 'coldwave' ? 1.15 : 1) * dis * (1 - 0.03 * Math.min(5, med));
  if (P.healUntil > S.clock.runSec) patients *= 0.1;
  let load = beds * Math.max(0.2, treat) > 0 ? patients / (beds * Math.max(0.2, treat)) : (patients > 1 ? 9 : 0);
  let homes = 0, cov = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.housing || !b._hcap) return; homes += b._hcap; if (b._cov && b._cov.health) cov += b._hcap; });
  let access = homes > 0 ? cov / homes : (beds > 0 ? 1 : 0);
  if (P.maxCare) { load = Math.min(load, 0.5); access = 1; }
  const over = Math.max(0, load - 1);
  if (!BCT_SANDBOX.on && !planning) { if (over > 0) P.overloadSec += dt; if (over > 0.1 && !P.overNews) { P.overNews = true; newsAdd('🏥', 'HEALTHCARE OVERLOAD: hospitals at ' + Math.round(load * 100) + '%', Math.round(patients) + ' patients for ' + Math.round(beds) + ' effective beds — waiting times ' + Math.round(waitMinutes(load)) + ' min. Build clinics or a medical center.', { cat: 'health', cls: 'bad' }); } if (load < 0.9) P.overNews = false; }
  SIM.healthOverload = over; SIM.healthLoad = load;
  return { list: list, beds: beds, er: er, staff: have, staffNeed: need, treat: treat, patients: patients, load: load, access: access, wait: waitMinutes(load) };
}
function waitMinutes(load) { return 15 * Math.pow(1 + Math.max(0, load - 0.7) * 3, 1.6); }
/* Happiness hook from econTick */
function p10HealthHap() { const H = SV.health; if (!H || S.city.population < 50) return 0; return (svHealthIndex() - 0.6) * 15 - Math.min(10, (H.load > 1 ? (H.load - 1) * 12 : 0)); }
/* Emergency route: citizen → ambulance → hospital (real vehicles on the road network) */
function ambulanceTick() {
  if (!S.p9 || S.city.population < 100 || S.p9.freeze.citizens) return;
  const active = AG.vehicles.filter(function (v) { return v.patient; }).length;
  if (active >= 2) return;
  const H = SV.health || healthPass(0), expected = S.city.population * 0.00004 * 20 * (1 + (H.load > 1 ? H.load - 1 : 0));
  if (Math.random() > Math.min(0.9, expected)) return;
  const cand = AG.citizens.filter(function (c) { return !c.tourist && !c.inside && !c.sick; });
  if (!cand.length) return;
  const c = cand[Math.floor(Math.random() * cand.length)], tile = currentRoadTile(c);
  if (tile === undefined || tile < 0) return;
  const hosp = nearestHospital(tile); if (!hosp) return;
  const v = emergencyDispatch('medical', tile, { priority: 2 });
  if (!v) return;
  c.sick = true;
  v.patient = { stage: 1, cid: c.id, t0: S.clock.runSec, hosp: hosp.id, tile: tile };
  S.p10.health.ambulance++;
}
function nearestHospital(tile) {
  const x = tile % MAP.W, y = (tile / MAP.W) | 0; let best = null, bd = 1e9;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.beds || !b._op || b._entry < 0 || MAP.comp[b._entry] !== MAP.comp[tile]) return; const dist = Math.abs(b.x - x) + Math.abs(b.y - y) - d.beds / 200; if (dist < bd) { bd = dist; best = b; } });
  return best;
}
/* Called by arriveVehicle: stage 1 = ambulance reached the patient → drive to the hospital; stage 2 = admitted */
function p10PatientArrive(v) {
  const P = v.patient, c = AG.citizens.find(function (x) { return x.id === P.cid; });
  const hosp = MAP.byId.get(P.hosp);
  if (P.stage === 1) {
    const H = S.p10.health, resp = (S.clock.runSec - P.t0) * TIME_SCALE / 60;
    H.respSum += resp; H.respN++;
    if (hosp && hosp._entry >= 0) {
      const p = roadPath(v.path[v.path.length - 1], hosp._entry, true);
      if (p && p.length >= 2) {
        P.stage = 2; P.resp = resp;
        v.path = p; v.wp = laneWaypoints(p); v.seg = 0; v.t = 0; v.cleared = -1; v.dwell = 2;
        if (c) { c.inside = hosp.id; c.path = null; c.insideUntil = S.clock.gameSec + 6 * 3600; }
        return true;
      }
    }
    if (c) c.sick = false;
    return false;
  }
  const H = S.p10.health;
  H.treated++;
  H.log.unshift({ d: gameDay(), h: Math.floor(gameHour()), from: districtName(P.tile % MAP.W, (P.tile / MAP.W) | 0) || 'street', to: hosp ? bdef(hosp).name : 'hospital', resp: Math.round(P.resp || 0) });
  if (H.log.length > 20) H.log.length = 20;
  if (c) { c.sick = false; c.happiness = Math.min(100, (c.happiness || 70) + 5); }
  return false;
}
function healAllCitizens() {
  S.p10.health.healUntil = S.clock.runSec + 600;
  AG.citizens.forEach(function (c) { c.sick = false; c.happiness = Math.max(c.happiness || 0, 90); if (c.needs) c.needs.rest = 100; c.energy = 100; });
  SV.health = healthPass(0);
  return 'All citizens healed — sickness ×0.1 for 10 minutes';
}

/* ===================================== TOURISM 2.0 ===================================== */
function attractionValue(b) { const d = bdef(b); return Math.round(d.tour * lvlMult(b.level) * Math.max(0.2, b._eff || (b.built ? 1 : 0)) * (0.7 + (S.p10 ? S.p10.rep : 500) / 1666)); }
function attractionList() {
  return S.buildings.list.filter(function (b) { return ATTRACTIONS[b.type] && b.built; }).map(function (b) { return { b: b, kind: ATTRACTIONS[b.type], name: bdef(b).name, icon: bdef(b).icon, value: attractionValue(b), op: !!b._op }; }).sort(function (a, b) { return b.value - a.value; });
}
function tourismCapacities() {
  let rail = 0, sea = 0, cruise = 0;
  S.buildings.list.forEach(function (b) {
    if (!b._op) return;
    if (b.type === 'trainstation') rail += 1500 * lvlMult(b.level) * b._eff;
    if (b.type === 'railhub') rail += 2500 * b._eff;
    if (b.type === 'port') sea += 800 * b._eff;
    if (b.type === 'cruiseterminal') { cruise += 2500 * lvlMult(b.level) * b._eff; }
  });
  const edges = S.p9 ? ['N', 'S', 'E', 'W'].reduce(function (a, d) { return a + Math.min(3, edgeRoadTiles(d).length); }, 0) : 2;
  const road = 500 + edges * 300 + Math.min(4000, highwayTiles() * 6);
  const air = airportCapacity() * 0.5;                // half of the seats are tourists (1-day average stay)
  return { road: road, rail: rail, air: air, sea: sea + cruise, cruise: cruise };
}
/* Hook from econTick (section 19): tourism demand is split by how visitors arrive; each mode has a real capacity */
function p10TourismArrivals(D) {
  const cap = tourismCapacities(), W = { road: 0.45, rail: 0.2, air: 0.25, sea: 0.1 };
  const got = {}; let lost = 0, spare = 0;
  for (const k in W) { const want = D * W[k]; got[k] = Math.min(want, cap[k]); lost += want - got[k]; }
  for (const k in W) spare += Math.max(0, cap[k] - got[k]);
  const moved = Math.min(lost * 0.75, spare);
  if (moved > 0 && spare > 0) for (const k in W) got[k] += moved * Math.max(0, cap[k] - got[k]) / spare;
  const total = got.road + got.rail + got.air + got.sea;
  SIM.p10Tour = { road: got.road, rail: got.rail, air: got.air, sea: got.sea, cruise: Math.min(got.sea, cap.cruise), neighbors: SIM.p9Tourists || 0, demand: D, lost: Math.max(0, D - total), cap: cap };
  return total;
}
function tourismBreakdown(tourists) {
  const pop = S.city.population, t = tourists, T = SIM.p10Tour || {};
  const share = function (s, w) { const d = SIM.demand && SIM.demand[s] || 0; return d > 0 ? (t * w) / d * Math.min(d, SIM.supply ? SIM.supply[s] || 0 : 0) : 0; };
  let hotelW = 0, attrW = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.tour || !b._op) return; if (d.id === 'hotel' || d.id === 'beachresort') hotelW += d.tour * lvlMult(b.level) * b._eff; else attrW += d.tour * lvlMult(b.level) * b._eff; });
  const tourTotal = t * TOURIST_SPEND * 0.5, tw = hotelW + attrW || 1;
  const rev = function (s) { let r = 0; S.buildings.list.forEach(function (b) { if (bdef(b).sector === s) r += b._rev || 0; }); return r; };
  const fr = function (s, w) { const d = SIM.demand && SIM.demand[s] || 0; return d > 0 ? rev(s) * (t * w) / d : 0; };
  return { hotels: tourTotal * hotelW / tw, attractions: tourTotal * attrW / tw, restaurants: fr('FOOD', 1.2), shopping: fr('SHOPPING', 1.0), entertainment: fr('ENTERTAINMENT', 1.3), tax: t * TOURIST_SPEND * 0.1, src: T, served: share('FOOD', 1.2) };
}

/* ===================================== AIRPORT ===================================== */
function airportOperating() { return S.buildings.list.find(function (b) { return b.type === 'airport' && b._op; }) || null; }
function airportTerminals() { const ap = airportOperating(); if (!ap) return 0; return 1 + S.buildings.list.filter(function (b) { return b.type === 'airportterminal' && b._op; }).length; }
function airportCapacity() { const ap = airportOperating(); if (!ap) return 0; let c = 20000 * ap._eff; S.buildings.list.forEach(function (b) { if (b.type === 'airportterminal' && b._op) c += 15000 * lvlMult(b.level) * b._eff; }); return Math.round(c); }
function airportPass(dt) {
  const ap = airportOperating(), P = S.p10.air;
  const cap = airportCapacity(), terms = airportTerminals();
  let biz = 0; S.buildings.list.forEach(function (b) { const s = bdef(b).sector; if ((s === 'FINANCE' || s === 'TECHNOLOGY') && b._op) biz += b._actW || 0; });
  const touristWish = (SIM.p10Tour ? SIM.p10Tour.demand * 0.25 : 0) * 2;
  const demand = S.city.population * 0.012 + biz * 0.04 + touristWish;
  const served = Math.min(demand, cap), load = cap > 0 ? demand / cap : 0;
  const sc = SIM.sc || { imp: {}, exp: {} }; let hv = 0; ['electronics', 'vehicles', 'rare'].forEach(function (p) { hv += ((sc.imp && sc.imp[p]) || 0) + ((sc.exp && sc.exp[p]) || 0); });
  const cargoDemand = hv * (86400 / TIME_SCALE) * 0.2, cargoCap = ap ? 1200 * (1 + 0.5 * (terms - 1)) : 0;
  const perSec = dt / (86400 / TIME_SCALE);
  if (ap && !BCT_SANDBOX.on) { P.paxTot += served * perSec; P.cargoTot += Math.min(cargoDemand, cargoCap) * perSec; P.flightsTot += served / 160 * perSec; if (load > 1) P.congSec += dt; }
  if (ap && load > 1.05 && !P.congNews && !BCT_SANDBOX.on) { P.congNews = true; newsAdd('✈️', 'AIRPORT CONGESTION: ' + Math.round(load * 100) + '% of capacity', fmt(Math.round(demand)) + ' passengers/day want to fly, ' + fmt(cap) + ' seats — delays ' + Math.round((load - 1) * 60) + ' min. A new terminal adds 15,000 seats.', { cat: 'transport', cls: 'bad' }); }
  if (load < 0.95) P.congNews = false;
  let jobs = 0; S.buildings.list.forEach(function (b) { if ((b.type === 'airport' || b.type === 'airportterminal') && b._op) jobs += b._actW || 0; });
  return { op: !!ap, cap: cap, terminals: terms, demand: demand, served: served, load: load, flights: served / 160, cargo: Math.min(cargoDemand, cargoCap), cargoDemand: cargoDemand, cargoCap: cargoCap, delay: Math.max(0, (load - 1) * 60), jobs: jobs, tourists: SIM.p10Tour ? SIM.p10Tour.air : 0 };
}
/* Build a terminal next to the airport (player pays, normal construction) */
function buildAirportTerminal(payer) {
  const ap = S.buildings.list.find(function (b) { return b.type === 'airport'; });
  if (!ap) return { ok: false, reason: 'No International Airport yet' };
  const d = BUILDINGS.airportterminal, cost = buildCost(d);
  if (payer === 'player' && S.money < cost) return { ok: false, reason: 'Needs ' + money(cost) };
  for (let r = 1; r <= 10; r++) for (let y = ap.y - r; y <= ap.y + 4 + r; y++) for (let x = ap.x - r; x <= ap.x + 6 + r; x++) {
    if (!inMap(x, y) || !inUnlocked(x, y) || !canPlace(d, x, y, true).ok) continue;
    if (payer === 'player') S.money -= cost;
    const b = makeBuilding('airportterminal', x, y); b.owner = 'city'; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost);
    addBuildingToMap(b); onMapChanged();
    return { ok: true, b: b, cost: cost };
  }
  return { ok: false, reason: 'No free, road-connected space within 10 tiles of the airport' };
}

/* ===================================== PORT ===================================== */
function portPass(dt) {
  const ports = S.buildings.list.filter(function (b) { return b.type === 'port' && b._op; }), P = S.p10.port;
  const coastal = MAP.sea && MAP.sea.some(function (v) { return v; });
  let cap = 0; ports.forEach(function (b) { cap += 2000 * lvlMult(b.level) * b._eff; });
  const cts = S.buildings.list.filter(function (b) { return b.type === 'containerterminal' && b._op; });
  if (ports.length) cts.forEach(function (b) { cap += 3000 * lvlMult(b.level) * b._eff; });
  const sc = SIM.sc || { imp: {}, exp: {} }; let imp = 0, exp = 0;
  PRODUCT_IDS.forEach(function (p) { imp += (sc.imp && sc.imp[p]) || 0; exp += (sc.exp && sc.exp[p]) || 0; });
  const day = 86400 / TIME_SCALE, teuImp = imp * day / 20, teuExp = exp * day / 20, demand = ports.length ? teuImp + teuExp : 0;
  const load = cap > 0 ? demand / cap : 0, handled = Math.min(demand, cap);
  if (ports.length && !BCT_SANDBOX.on) { const k = dt / day; P.teuTot += handled * k; P.shipsTot += handled / 1500 * k; if (load > 1) P.congSec += dt; }
  return { coastal: coastal, ports: ports.length, terminals: cts.length, cap: cap, demand: demand, imp: teuImp, exp: teuExp, handled: handled, load: load, ships: handled / 1500, cruise: SIM.p10Tour ? SIM.p10Tour.cruise : 0 };
}

/* ===================================== RAILWAY FREIGHT ===================================== */
const RAIL_GOODS = [['metal', '🔩', 'Steel'], ['wheat', '🌾', 'Grain'], ['electronics', '💾', 'Electronics'], ['materials', '🧱', 'Industrial goods'], ['vehicles', '🚗', 'Vehicles'], ['food', '🥫', 'Food']];
function railPass(dt) {
  const P = S.p10.rail, sc = SIM.sc || { prod: {}, exp: {}, imp: {} }, day = 86400 / TIME_SCALE;
  let cap = 0, stations = 0, hubs = 0;
  S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.freight || !b._op) return; cap += d.freight * lvlMult(b.level) * b._eff; if (b.type === 'railhub') hubs++; else stations++; });
  const rows = []; let dem = 0;
  RAIL_GOODS.forEach(function (g) { if (!PRODUCTS[g[0]]) return; const p = g[0], t = (((sc.prod && sc.prod[p]) || 0) * 0.3 + ((sc.exp && sc.exp[p]) || 0) + ((sc.imp && sc.imp[p]) || 0)) * day * 0.05; rows.push({ id: p, icon: g[1], name: g[2], demand: t, carried: 0 }); dem += t; });
  const k = dem > 0 ? Math.min(1, cap / dem) : 0;
  rows.forEach(function (r) { r.carried = r.demand * k; });
  const carried = dem * k;
  if (!BCT_SANDBOX.on) P.freightTot += carried * dt / day;
  let pax = 0; S.buildings.list.forEach(function (b) { if ((b.type === 'trainstation' || b.type === 'railhub') && b._op) pax += b._cust || 0; });
  return { cap: cap, stations: stations, hubs: hubs, demand: dem, carried: carried, share: dem > 0 ? carried / dem : 0, rows: rows, pax: pax * day / 20 };
}

/* ===================================== LOGISTICS NETWORK ===================================== */
function avgDistance(A, B) {
  if (!A.length || !B.length) return 0;
  let s = 0, n = 0;
  for (let k = 0; k < Math.min(30, A.length); k++) { const a = A[Math.floor(k * A.length / Math.min(30, A.length))]; let best = 1e9; for (let j = 0; j < B.length; j++) best = Math.min(best, Math.abs(B[j].x - a.x) + Math.abs(B[j].y - a.y)); s += best; n++; }
  return n ? s / n : 0;
}
function logisticsPass() {
  const L = S.buildings.list, op = function (f) { return L.filter(function (b) { return b._op && f(bdef(b), b); }); };
  const factories = op(function (d) { return d.goods || d.extract; }), whs = op(function (d) { return d.id === 'warehouse'; }), dcs = op(function (d) { return d.id === 'distcenter'; }), stores = op(function (d) { return d.goodsUse; });
  const sc = SIM.sc || { prod: {}, del: {} }; let prod = 0, del = 0; PRODUCT_IDS.forEach(function (p) { prod += (sc.prod && sc.prod[p]) || 0; del += (sc.del && sc.del[p]) || 0; });
  const day = 86400 / TIME_SCALE, traffic = SIM.traffic || 0, fuel = SIM.fuelRatio === undefined ? 1 : SIM.fuelRatio;
  const speed = 30 * (1 - traffic / 160) * (0.5 + 0.5 * fuel);                 // tiles per game hour
  const delay = function (dist) { return dist / Math.max(3, speed); };
  const R = SV.rail || { cap: 0 }, Pt = SV.port || { cap: 0 };
  const dcCap = dcs.reduce(function (a, b) { return a + 40 * Math.min(1.3, b._eff); }, 0), lastMile = dcCap;          // one distribution center serves ~40 stores
  const dWh = avgDistance(factories, whs.length ? whs : dcs), dDc = avgDistance(whs, dcs.length ? dcs : stores), dSt = avgDistance(dcs.length ? dcs : whs, stores);
  const stages = [
    { id: 'factory', icon: '🏭', name: 'Factory', n: factories.length, cap: prod * day, flow: prod * day, dist: 0, util: prod > 0 ? 1 : 0 },
    { id: 'warehouse', icon: '📦', name: 'Warehouse', n: whs.length, cap: SIM.storageCap || 0, flow: SIM.storageUsed || 0, dist: dWh, util: SIM.storageCap ? SIM.storageUsed / SIM.storageCap : 0 },
    { id: 'transport', icon: '🚚', name: 'Truck / train / ship', n: Math.round(SIM.trucks || 0), cap: (SIM.logisticsCap || 0) * day + R.cap + Pt.cap * 20, flow: del * day, dist: dWh + dDc, util: SIM.logisticsRatio === undefined ? 1 : 1 / Math.max(0.01, SIM.logisticsRatio) },
    { id: 'dc', icon: '🚛', name: 'Distribution center', n: dcs.length, cap: Math.round(lastMile), flow: stores.length, dist: dDc, util: lastMile > 0 ? stores.length / lastMile : (stores.length ? 2 : 0) },
    { id: 'store', icon: '🏪', name: 'Store', n: stores.length, cap: (SIM.goodsUse || 0) * day, flow: (SIM.goodsUse || 0) * day * Math.min(1, SIM.goodsRatio === undefined ? 1 : SIM.goodsRatio), dist: dSt, util: SIM.goodsRatio === undefined ? 1 : Math.min(2, SIM.goodsRatio) },
    { id: 'customer', icon: '🧑', name: 'Customer', n: Math.round(S.city.population + S.city.tourists), cap: SIM.supply ? (SIM.supply.SHOPPING || 0) : 0, flow: SIM.demand ? (SIM.demand.SHOPPING || 0) : 0, dist: 0, util: SIM.supply && SIM.supply.SHOPPING ? (SIM.demand.SHOPPING || 0) / SIM.supply.SHOPPING : 0 }
  ];
  stages.forEach(function (s) { s.delay = delay(s.dist); s.traffic = traffic; s.fuel = fuel; s.over = s.util > 1.02 && s.id !== 'factory' && s.id !== 'customer' && s.id !== 'store'; });
  // the stage with the worst capacity/demand ratio limits the chain
  const dcEff = clamp(0.75 + 0.25 * (stores.length ? Math.min(1, lastMile / stores.length) : 1), 0.75, 1);   // without DCs warehouses deliver the last mile at 75 %
  const trEff = SIM.logisticsRatio === undefined ? 1 : clamp(SIM.logisticsRatio, 0.5, 1);
  const delayH = stages.reduce(function (a, s) { return a + s.delay; }, 0);
  const eff = clamp(Math.min(dcEff, trEff) * (1 - Math.max(0, delayH - 4) * 0.01) * (0.8 + 0.2 * fuel), 0.4, 1);
  const worst = stages.filter(function (s) { return s.over; }).sort(function (a, b) { return b.util - a.util; })[0];
  return { stages: stages, eff: eff, delayH: delayH, bottleneck: worst ? worst.name : (dcEff < 0.9 ? 'Distribution center' : ''), dcs: dcs.length };
}

/* ===================================== SUPPLY SHOCKS ===================================== */
const SHOCK_DEFS = {
  steel: { name: 'STEEL SHORTAGE', icon: '🔩', product: 'metal', price: 0.35, down: { electronics: 0.12, vehicles: 0.10 }, build: 0.18, producer: 'smelter', alt: 'materials' },
  grain: { name: 'GRAIN SHORTAGE', icon: '🌾', product: 'wheat', price: 0.35, down: { flour: 0.15, bread: 0.12, food: 0.08 }, build: 0, producer: 'farm', alt: 'food' },
  chip: { name: 'CHIP SHORTAGE', icon: '💾', product: 'electronics', price: 0.4, down: { vehicles: 0.15 }, build: 0.04, producer: 'factory', alt: 'rare' },
  fuel: { name: 'FUEL CRISIS', icon: '⛽', product: 'fuel', price: 0.45, down: { materials: 0.06 }, build: 0.05, logistics: 0.25, producer: 'refinery', alt: 'oil' },
  concrete: { name: 'CONCRETE SHORTAGE', icon: '🧱', product: 'materials', price: 0.3, down: {}, build: 0.2, producer: 'factory', alt: 'wood' }
};
function activeShocks() { return S.p10 ? S.p10.shocks : []; }
function shockPriceMult(p) {
  let k = 1;
  activeShocks().forEach(function (s) { const D = SHOCK_DEFS[s.type]; if (D.product === p) k *= 1 + D.price * s.sev * (s.resp.import ? 0.5 : 1); if (D.down[p]) k *= 1 + D.down[p] * s.sev * (s.resp.alt ? 0.3 : 1); });
  return k;
}
function shockBuildMult() { let k = 1; activeShocks().forEach(function (s) { k *= 1 + SHOCK_DEFS[s.type].build * s.sev * (s.resp.import ? 0.5 : 1); }); return k; }
/* Producers of a shocked product run an emergency programme when the player chose DOMESTIC PRODUCTION */
function shockBoost(b) { if (!b.recipe) return 1; let k = 1; activeShocks().forEach(function (s) { if (s.resp.domestic && SHOCK_DEFS[s.type].product === b.recipe) k *= 1.3; }); return k; }
function domesticRatio(p) { const sc = SIM.sc; if (!sc || !sc.prod) return 0; return clamp(((sc.prod[p] || 0) + 0.001) / ((sc.dem[p] || 0) + (sc.exp[p] || 0) * 0.5 + 0.01), 0, 2); }
function shockTick(dt) {
  const P = S.p10, now = S.clock.runSec;
  if (BCT_SANDBOX.on) return;
  P.shocks.forEach(function (s) {
    const D = SHOCK_DEFS[s.type];
    const producers = S.buildings.list.filter(function (b) { return b.built && b.recipe === D.product; }).length;
    const decay = 1 / 2400 + domesticRatio(D.product) / 1500 + (s.resp.import ? 1 / 600 : 0) + (s.resp.domestic ? 1 / 900 : 0) + Math.max(0, producers - s.prodStart) / 1200 + (s.resp.alt ? 1 / 1200 : 0);
    s.sev = Math.max(0, s.sev - decay * dt);
    if (s.resp.domestic) { let n = 0; S.buildings.list.forEach(function (b) { if (b.recipe === D.product && b._op) n++; }); const c = n * 0.8 * priceLevel() * dt; S.money = Math.max(0, S.money - c); }
  });
  const ended = P.shocks.filter(function (s) { return s.sev <= 0.02; });
  ended.forEach(function (s) {
    const D = SHOCK_DEFS[s.type], days = Math.max(1, Math.round((now - s.start) * TIME_SCALE / 86400 * 10) / 10);
    const resp = Object.keys(s.resp).filter(function (k) { return s.resp[k]; }).join(', ') || 'none';
    P.shockLog.unshift({ d: gameDay(), y: gameYear(), name: D.name, icon: D.icon, days: days, resp: resp }); if (P.shockLog.length > 20) P.shockLog.length = 20;
    newsAdd(D.icon, D.name + ' is over', 'Prices of ' + PRODUCTS[D.product].name.toLowerCase() + ' are back to normal after ' + days + ' day(s). Responses: ' + resp + '.', { cat: 'economy', cls: 'good' });
  });
  P.shocks = P.shocks.filter(function (s) { return s.sev > 0.02; });
  if (p10Every('shockCheck', 60, dt)) shockMaybeStart();
}
function shockMaybeStart() {
  const P = S.p10; if (S.city.population < 600 || P.shocks.length >= (S.city.population > 20000 ? 2 : 1)) return;
  const f = typeof disasterFreq === 'function' ? disasterFreq() : 1; if (f <= 0) return;
  const ids = Object.keys(SHOCK_DEFS).filter(function (k) { const D = SHOCK_DEFS[k]; return PRODUCTS[D.product] && !P.shocks.some(function (s) { return s.type === k; }); });
  for (let i = 0; i < ids.length; i++) {
    const D = SHOCK_DEFS[ids[i]], sc = SIM.sc; if (!sc || !sc.dem) continue;
    const need = (sc.dem[D.product] || 0) > 0.05, dr = domesticRatio(D.product);
    const chance = 0.0008 * f * (need ? 1 : 0.2) * (dr < 0.5 ? 3 : 1);          // ≈ 1–5 % per product and game day
    if (Math.random() < chance) { startShock(ids[i]); return; }
  }
}
function startShock(type) {
  const D = SHOCK_DEFS[type]; if (!D || !PRODUCTS[D.product]) return null;
  const P = S.p10;
  if (P.shocks.some(function (s) { return s.type === type; })) return null;
  const s = { id: P.nextShock++, type: type, sev: 1, start: S.clock.runSec, resp: { import: false, domestic: false, factory: 0, alt: false }, prodStart: S.buildings.list.filter(function (b) { return b.built && b.recipe === D.product; }).length };
  P.shocks.push(s);
  const downs = Object.keys(D.down).filter(function (p) { return PRODUCTS[p]; }).map(function (p) { return PRODUCTS[p].name.toLowerCase() + ' +' + Math.round(D.down[p] * 100) + '%'; });
  newsAdd(D.icon, D.name + ': ' + PRODUCTS[D.product].name.toLowerCase() + ' price +' + Math.round(D.price * 100) + '%', (downs.length ? downs.join(', ') + (D.build ? ', ' : '') : '') + (D.build ? 'construction cost +' + Math.round(D.build * 100) + '%' : '') + '. Respond with domestic production, imports, a new factory or an alternative source.', { cat: 'economy', cls: 'bad' });
  return s;
}
/* Player responses (each costs money and changes how fast the shortage ends) */
function shockRespond(id, kind) {
  const s = S.p10.shocks.find(function (x) { return x.id === +id; }); if (!s) return { ok: false, reason: 'This shortage is already over' };
  const D = SHOCK_DEFS[s.type], p = D.product, sc = SIM.sc || { dem: {} };
  if (kind === 'domestic') { if (s.resp.domestic) return { ok: false, reason: 'Already running' }; s.resp.domestic = true; return { ok: true, msg: 'Domestic production programme: ' + PRODUCTS[p].name + ' producers +30% output (subsidy paid every second)' }; }
  if (kind === 'import') {
    if (s.resp.import) return { ok: false, reason: 'Import contract already signed' };
    const cost = Math.round(Math.max(5000, ((sc.dem[p] || 0) * 2400) * S.economy.prices[p] * 0.5));
    if (S.money < cost) return { ok: false, reason: 'Import contract costs ' + money(cost) };
    S.money -= cost; s.resp.import = true; S.trade.mode[p] = 'import';
    return { ok: true, msg: 'Import contract signed for ' + money(cost) + ': price effect halved, ' + PRODUCTS[p].name + ' imports enabled' };
  }
  if (kind === 'factory') {
    const type = D.producer, d = BUILDINGS[type]; if (!d) return { ok: false, reason: 'No producer available' };
    const cost = buildCost(d) * 1.2;
    if (S.money < cost) return { ok: false, reason: 'A new ' + d.name + ' costs ' + money(cost) };
    const b = wgPlaceAnywhere(null, type, { owner: 'player' });
    if (!b) return { ok: false, reason: 'No free industrial land — zone more industry' };
    S.money -= cost; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost); if (d.recipes && d.recipes.indexOf(p) >= 0) b.recipe = p;
    s.resp.factory++; onMapChanged();
    return { ok: true, msg: 'New ' + d.name + ' under construction (' + money(cost) + ')' + (b.recipe === p ? ' producing ' + PRODUCTS[p].name : '') };
  }
  if (kind === 'alt') {
    if (s.resp.alt) return { ok: false, reason: 'Alternative source already found' };
    const nb = S.p9 ? S.p9.neighbors.find(function (n) { const d = neighborDef(n.id); return d && (d.exports.indexOf(p) >= 0 || d.res === D.alt); }) : null;
    if (!nb) return { ok: false, reason: 'No neighbouring city exports ' + PRODUCTS[p].name.toLowerCase() + ' — try imports' };
    const cost = Math.round(20000 * priceLevel() * (1 + S.city.population / 20000));
    if (S.money < cost) return { ok: false, reason: 'Supply contract with ' + neighborDef(nb.id).name + ' costs ' + money(cost) };
    S.money -= cost; s.resp.alt = true; nb.rel = Math.min(100, nb.rel + 5);
    return { ok: true, msg: 'Alternative supplier: ' + neighborDef(nb.id).name + ' (' + money(cost) + '), downstream price effects −70%' };
  }
  return { ok: false, reason: 'Unknown response' };
}

/* ===================================== MODIFIERS ===================================== */
function servicesMods(m) {
  if (!S.p10) return m;
  const lv = researchLevel;
  m.techRev = (m.techRev || 1) * (1 + 0.02 * lv('ai'));
  m.powerProd = (m.powerProd || 1) * (1 + 0.02 * lv('energy'));
  m.pollution = (m.pollution || 1) * Math.max(0.6, 1 - 0.03 * lv('environment'));
  m.rev *= 1 + 0.01 * lv('economics');
  if (SV.edu) m.tax *= 0.92 + 0.04 * SV.edu.avg;                    // educated workers earn (and pay) more
  if (SV.rail && SV.rail.demand > 0) { m.traffic = (m.traffic || 1) * (1 - 0.08 * SV.rail.share); m.logiCost = (m.logiCost || 1) * (1 - 0.25 * SV.rail.share); }
  if (SV.logi) { m.production *= 0.95 + 0.05 * SV.logi.eff; m.importMult = (m.importMult || 1) * (1 + (1 - SV.logi.eff) * 0.1); }   // trucks are already limited by the supply chain; this adds last-mile & delay costs
  if (SV.port && SV.port.load > 1) m.importMult = (m.importMult || 1) * (1 + 0.3 * Math.min(2, SV.port.load - 1));
  if (SV.air && SV.air.load > 1) m.repBonus = (m.repBonus || 0) - Math.min(8, (SV.air.load - 1) * 10);
  activeShocks().forEach(function (s) { const D = SHOCK_DEFS[s.type]; if (D.logistics) m.logiCost = (m.logiCost || 1) * (1 + D.logistics * s.sev); });
  return m;
}

/* ===================================== PART 10 SERVICE UPGRADE (migration & generated worlds) ===================================== */
/* High schools, colleges and clinics where the pipeline / health network has gaps (free for migrated saves & generated worlds) */
function p10UpgradeServices(free) {
  econTick(1);
  const E = educationPass(), out = [];
  const pop = S.city.population;
  let hs = 0, col = 0, cl = 0;
  const place = function (type) { const b = wgPlaceAnywhere(null, type, { owner: 'city', clearSmall: true }); if (b && !free) { S.budget = Math.max(0, S.budget - buildCost(bdef(b))); } return b; };
  for (let k = 0; k < 12 && pop > 400 && E.seats[2] + Math.max(0, E.seats[1] - E.dem[1]) * 0.5 < E.dem[2] * 0.9; k++) { if (!place('highschool')) break; hs++; onMapChanged(); econTick(1); E.seats = educationSeats(); }
  for (let k = 0; k < 6 && pop > 1500 && E.seats[3] < E.dem[3] * 0.6; k++) { if (!place('college')) break; col++; onMapChanged(); econTick(1); E.seats = educationSeats(); }
  const H = healthPass(0, true);
  for (let k = 0; k < 10 && pop > 150 && (H.load > 0.95 || H.access < 0.8); k++) { const t = pop > 6000 && H.load > 1.2 ? 'medicalcenter' : 'clinic'; if (!place(t)) break; cl++; onMapChanged(); econTick(1); const h2 = healthPass(0, true); H.load = h2.load; H.access = h2.access; }
  if (hs) out.push(hs + ' high school(s)'); if (col) out.push(col + ' college(s)'); if (cl) out.push(cl + ' clinic(s)/medical center(s)');
  SV.edu = educationPass(); SV.health = healthPass(0);
  return out.join(', ');
}
