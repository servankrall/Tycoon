'use strict';
/* BLOCK CITY TYCOON — Part 20: CitizenAIEngine (Living City 3.0)
   Builds on the existing CitizenEngine (citizens.js agents, citylife.js households, living-world.js population) instead of
   replacing it. The city has a statistical population (S.city.population) and a capped sample of simulated agents
   (AG.citizens, quality preset). Every agent gets a stable identity and a profile; the far / statistical part of the city
   is described by district statistics (no per-citizen work for 500K people).
     Decision · Routine · Need · Household · Job · Education · Housing · Shopping · Entertainment · Social · Mobility ·
     Health · Memory · Opinion · Migration
   Decisions are utility scores (needs × personality × routine × time × weather × money × social × events); the only
   "noise" is a small deterministic jitter from the city seed, so the same state gives the same choice.
   LOD: near the camera full AI at 5–10 Hz, mid 1–2 Hz, far no per-agent work (district statistics every game hour). */

const CAI = { errors: 0, lastErr: '', live: new Map(), dirty: new Set(), cursor: 0, hourKey: -1, dayKey: -1, cache: {}, follow: null, route: null,
  prof: { near: 0, mid: 0, far: 0, ms: 0, hourMs: 0, dayMs: 0, decisions: 0, decMs: 0 }, rate: { near: 0, mid: 0, t0: 0, n0: 0, m0: 0 }, comments: [] };
function caiSafe(name, fn) { try { return fn(); } catch (e) { CAI.errors++; CAI.lastErr = name + ': ' + (e && e.message || e); if (typeof Log !== 'undefined' && Log.warn) Log.warn('CitizenAI ' + CAI.lastErr); return null; } }
function caiOn() { return !!(S && S.citizenAI && S.citizenAI.on !== false && !(typeof BCT_SANDBOX !== 'undefined' && BCT_SANDBOX.on && BCT_SANDBOX.freezeAI)); }

/* ---------- deterministic randomness (city seed + citizen id + salt) ---------- */
function caiHash() {
  let h = (2166136261 ^ ((S && S.city ? S.city.seed : 0) | 0)) >>> 0;
  for (let i = 0; i < arguments.length; i++) { h ^= (arguments[i] * 2654435761) | 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}
function caiPick(arr, r) { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }

/* ---------- identity ---------- */
const CAI_FIRST_F = ['Ada', 'Aylin', 'Beatriz', 'Chloe', 'Defne', 'Elena', 'Elif', 'Fatma', 'Grace', 'Hana', 'Ines', 'Julia', 'Kira', 'Leyla', 'Maya', 'Mei', 'Nadia', 'Nora', 'Olivia', 'Priya', 'Rosa', 'Sara', 'Selin', 'Sofia', 'Tara', 'Yuki', 'Zeynep', 'Amara', 'Lina', 'Ivy'];
const CAI_FIRST_M = ['Adam', 'Ahmet', 'Arjun', 'Ben', 'Can', 'Daniel', 'Emre', 'Felix', 'Hiro', 'Ivan', 'Jonas', 'Kaan', 'Leo', 'Lucas', 'Mateo', 'Mehmet', 'Noah', 'Omar', 'Pablo', 'Rafael', 'Sami', 'Tariq', 'Theo', 'Umut', 'Victor', 'Wei', 'Yusuf', 'Kofi', 'Elias', 'Marco'];
const CAI_LAST = ['Acar', 'Andersen', 'Bauer', 'Berg', 'Costa', 'Demir', 'Dubois', 'Eriksen', 'Fischer', 'García', 'Haddad', 'Hansen', 'Ito', 'Kaya', 'Kim', 'Kowalski', 'Lambert', 'Lee', 'Mendes', 'Moreau', 'Nakamura', 'Novak', 'Okafor', 'Özdemir', 'Park', 'Rossi', 'Santos', 'Schmidt', 'Silva', 'Şahin', 'Tanaka', 'Vargas', 'Wagner', 'Yılmaz', 'Zhang', 'Mensah', 'Patel', 'Romano', 'Aydın', 'Lindqvist'];
const CAI_STAGES = [['child', 'Child', 0, 12], ['teen', 'Teen', 13, 17], ['young', 'Young Adult', 18, 29], ['adult', 'Adult', 30, 44], ['middle', 'Middle Age', 45, 64], ['senior', 'Senior', 65, 200]];
function caiStageOf(age) { for (let i = 0; i < CAI_STAGES.length; i++) if (age <= CAI_STAGES[i][3]) return CAI_STAGES[i][0]; return 'senior'; }
function caiStageName(id) { const s = CAI_STAGES.find(function (x) { return x[0] === id; }); return s ? s[1] : id; }
const CAI_YEAR_DAYS = 8;                                            // 1 game year = 8 game days (seasons of 2 days)
const CAI_CAREER = ['Intern', 'Junior', 'Associate', 'Senior', 'Lead', 'Manager', 'Executive'];
const CAI_ROUTINES = { early: ['Early bird', 6.5, 15.5], standard: ['Standard', 8, 17], late: ['Late starter', 10, 19], night: ['Night shift', 21, 5], student: ['Student', 8, 14], retired: ['Retired', 0, 0], parttime: ['Part-time', 9, 13] };
const CAI_NEEDS = [['food', '🍔', 'Food', 0.55], ['rest', '😴', 'Rest', 0.35], ['hygiene', '🚿', 'Hygiene', 0.4], ['health', '❤️', 'Health', 0.02], ['safety', '🛡', 'Safety', 0], ['social', '💬', 'Social', 0.3], ['fun', '🎉', 'Fun', 0.45], ['shopping', '🛍', 'Shopping', 0.3], ['comfort', '🛋', 'Comfort', 0], ['purpose', '💼', 'Purpose', 0.25], ['education', '🎓', 'Education', 0]];
const CAI_FACTORS = [['housing', '🏠', 'Housing'], ['job', '💼', 'Job'], ['income', '💰', 'Income'], ['commute', '🚦', 'Commute'], ['health', '❤️', 'Health'], ['education', '🎓', 'Education'], ['safety', '🛡', 'Safety'], ['environment', '🌿', 'Environment'], ['entertainment', '🎭', 'Entertainment'], ['social', '💬', 'Social life'], ['services', '🏛', 'Public services'], ['taxes', '🧾', 'Taxes'], ['weather', '🌦', 'Weather']];
const CAI_TOPICS = [['taxes', 'Taxes'], ['traffic', 'Traffic'], ['transit', 'Public transport'], ['housing', 'Housing'], ['jobs', 'Jobs'], ['health', 'Healthcare'], ['education', 'Education'], ['safety', 'Safety'], ['environment', 'Environment'], ['fun', 'Entertainment']];

function newCitizenAI() {
  return { v: 1, on: true, nextCid: 1, nextHh: 1, people: {}, households: {}, opinions: {}, life: { score: 60, label: 'Good', hist: [], districts: [] }, stats: null, hist: [], events: { attended: 0, crowd: 0, last: '' }, comments: [], migration: { moved: 0, left: 0, arrived: 0 } };
}
function cai() { if (!S.citizenAI) S.citizenAI = newCitizenAI(); return S.citizenAI; }

/* compact profile (save form) ⇄ live profile */
function caiPack(P) {
  return { id: P.id, fn: P.fn, ln: P.ln, sx: P.sx, by: Math.round(P.by * 100) / 100, hh: P.hh, edu: P.edu, pers: P.pers, rt: P.rt, car: P.car ? 1 : 0,
    cr: [P.career.lvl, Math.round(P.career.xp), P.career.since], job: P.job, home: P.home, wage: Math.round(P.wage), sav: Math.round(P.sav),
    nd: CAI_NEEDS.map(function (n) { return Math.round(P.needs[n[0]]); }), hap: Math.round(P.hap), hl: Math.round(P.health), sk: P.sick ? 1 : 0,
    cm: [P.commute.mode, Math.round(P.commute.min * 10) / 10], mem: P.mem.slice(0, 8), op: CAI_TOPICS.map(function (t) { return Math.round(P.op[t[0]] || 0); }), fr: P.friends.slice(0, 6), sh: [P.fav.shop || 0, P.fav.food || 0, P.fav.fun || 0] };
}
function caiUnpack(o) {
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }, str = function (v, m) { return typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, m || 24) : ''; };
  const P = { id: n(o.id, 0, 0, 1e9) | 0, fn: str(o.fn) || 'Alex', ln: str(o.ln) || 'Doe', sx: o.sx === 'F' ? 'F' : 'M', by: n(o.by, 0, -1e6, 1e6), hh: n(o.hh, 0, 0, 1e9) | 0, edu: n(o.edu, 1, 0, 4) | 0,
    pers: typeof PERSONALITIES !== 'undefined' && PERSONALITIES[o.pers] ? o.pers : 'FAMILY', rt: CAI_ROUTINES[o.rt] ? o.rt : 'standard', car: !!o.car,
    career: { lvl: n(o.cr && o.cr[0], 0, 0, 6) | 0, xp: n(o.cr && o.cr[1], 0, 0, 1e7), since: n(o.cr && o.cr[2], 0, -1e6, 1e6) }, job: n(o.job, 0, 0, 1e9) | 0, home: n(o.home, 0, 0, 1e9) | 0,
    wage: n(o.wage, 0, 0, 1e7), sav: n(o.sav, 0, -1e7, 1e9), needs: {}, hap: n(o.hap, 60, 0, 100), health: n(o.hl, 90, 0, 100), sick: !!o.sk,
    commute: { mode: typeof o.cm === 'object' && o.cm && /^(walk|bike|car|transit|transfer|parkride|none)$/.test(o.cm[0]) ? o.cm[0] : 'none', min: n(o.cm && o.cm[1], 0, 0, 600) },
    mem: Array.isArray(o.mem) ? o.mem.slice(0, 8).filter(Array.isArray).map(function (m) { return [n(m[0], 0, -1e6, 1e6) | 0, str(m[1], 4), str(m[2], 90)]; }) : [],
    op: {}, friends: Array.isArray(o.fr) ? o.fr.slice(0, 6).map(function (x) { return n(x, 0, 0, 1e9) | 0; }).filter(Boolean) : [], fav: { shop: n(o.sh && o.sh[0], 0, 0, 1e9) | 0, food: n(o.sh && o.sh[1], 0, 0, 1e9) | 0, fun: n(o.sh && o.sh[2], 0, 0, 1e9) | 0 },
    f: {}, dec: [], t: 0, agent: null };
  CAI_NEEDS.forEach(function (d, i) { P.needs[d[0]] = n(o.nd && o.nd[i], 70, 0, 100); });
  CAI_TOPICS.forEach(function (t, i) { P.op[t[0]] = n(o.op && o.op[i], 0, -100, 100); });
  return P;
}
function sanitizeCitizenAI(src) {
  const base = newCitizenAI(); if (!src || typeof src !== 'object') return base;
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  base.on = src.on !== false; base.nextCid = n(src.nextCid, 1, 1, 1e9) | 0; base.nextHh = n(src.nextHh, 1, 1, 1e9) | 0;
  if (src.people && typeof src.people === 'object') Object.keys(src.people).slice(0, 1200).forEach(function (k) { const o = src.people[k]; if (o && typeof o === 'object' && /^\d+$/.test(k)) { const P = caiUnpack(o); P.id = +k; base.people[k] = caiPack(P); base.nextCid = Math.max(base.nextCid, P.id + 1); } });
  if (src.households && typeof src.households === 'object') Object.keys(src.households).slice(0, 800).forEach(function (k) { const h = src.households[k]; if (!h || typeof h !== 'object' || !/^\d+$/.test(k)) return;
    base.households[k] = { id: +k, ln: typeof h.ln === 'string' ? h.ln.replace(/[<>]/g, '').slice(0, 24) : 'Doe', home: n(h.home, 0, 0, 1e9) | 0, adults: Array.isArray(h.adults) ? h.adults.slice(0, 6).map(function (x) { return n(x, 0, 0, 1e9) | 0; }).filter(Boolean) : [],
      kids: Array.isArray(h.kids) ? h.kids.slice(0, 5).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { fn: typeof x.fn === 'string' ? x.fn.replace(/[<>]/g, '').slice(0, 24) : 'Kid', by: n(x.by, 0, -1e6, 1e6), sx: x.sx === 'F' ? 'F' : 'M' }; }) : [],
      income: n(h.income, 0, 0, 1e8), rent: n(h.rent, 0, 0, 1e8), spend: n(h.spend, 0, 0, 1e8), sav: n(h.sav, 0, -1e8, 1e10), sat: n(h.sat, 60, 0, 100), car: n(h.car, 0, 0, 6) | 0, unhappy: n(h.unhappy, 0, 0, 1000) | 0 };
    base.nextHh = Math.max(base.nextHh, +k + 1); });
  if (src.opinions && typeof src.opinions === 'object') CAI_TOPICS.forEach(function (t) { base.opinions[t[0]] = n(src.opinions[t[0]], 0, -100, 100); });
  if (src.life && typeof src.life === 'object') { base.life.score = n(src.life.score, 60, 0, 100); base.life.label = caiLifeLabel(base.life.score); base.life.hist = Array.isArray(src.life.hist) ? src.life.hist.slice(-60).map(function (v) { return n(v, 60, 0, 100); }) : []; }
  if (Array.isArray(src.hist)) base.hist = src.hist.slice(-60).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { const o = {}; ['d', 'life', 'hap', 'emp', 'commute', 'pop', 'approval'].forEach(function (k) { o[k] = n(x[k], 0, -1e9, 1e9); }); return o; });
  if (src.events && typeof src.events === 'object') { base.events.attended = n(src.events.attended, 0, 0, 1e9) | 0; base.events.crowd = n(src.events.crowd, 0, 0, 1e6) | 0; base.events.last = typeof src.events.last === 'string' ? src.events.last.slice(0, 24) : ''; }
  if (src.migration && typeof src.migration === 'object') ['moved', 'left', 'arrived'].forEach(function (k) { base.migration[k] = n(src.migration[k], 0, 0, 1e9) | 0; });
  if (Array.isArray(src.comments)) base.comments = src.comments.slice(0, 30).filter(Array.isArray).map(function (c) { return [n(c[0], 0, -1e6, 1e6) | 0, typeof c[1] === 'string' ? c[1].replace(/[<>]/g, '').slice(0, 40) : '', typeof c[2] === 'string' ? c[2].replace(/[<>]/g, '').slice(0, 140) : '', c[3] ? 1 : 0]; });
  return base;
}
function caiLifeLabel(v) { return v >= 85 ? 'Thriving' : v >= 70 ? 'Very Good' : v >= 55 ? 'Good' : v >= 40 ? 'Struggling' : 'Critical'; }

/* ---------- profile of one agent (created on first use, stable id `c.cid`) ---------- */
function caiAge(P) { return Math.max(0, Math.floor((gameDay() - P.by) / CAI_YEAR_DAYS)); }
function caiProfile(c) {
  if (!c || c.tourist) return null;
  const A = cai();
  if (!c.cid) c.cid = A.nextCid++;
  let P = CAI.live.get(c.cid);
  if (!P) {
    const saved = A.people[c.cid];
    P = saved ? caiUnpack(saved) : caiCreate(c);
    CAI.live.set(c.cid, P); CAI.dirty.add(c.cid);
  }
  P.agent = c;
  return P;
}
function caiCreate(c) {
  if (typeof citizenProfile === 'function') citizenProfile(c);
  const id = c.cid, r = function (s) { return caiHash(id, s); }, sx = r(1) < 0.5 ? 'F' : 'M';
  const age = c.age || 18 + Math.floor(r(2) * 60), edu = c.edu !== undefined ? c.edu : 1;
  const P = { id: id, fn: caiPick(sx === 'F' ? CAI_FIRST_F : CAI_FIRST_M, r(3)), ln: caiPick(CAI_LAST, r(4)), sx: sx, by: gameDay() - age * CAI_YEAR_DAYS - r(5) * CAI_YEAR_DAYS, hh: 0, edu: edu, pers: c.pers || 'FAMILY', car: !!c.car,
    rt: age >= 67 ? 'retired' : age <= 24 && r(6) < 0.6 ? 'student' : c.pers === 'WORKAHOLIC' ? 'early' : r(7) < 0.12 ? 'night' : r(7) < 0.3 ? 'early' : r(7) < 0.45 ? 'late' : r(7) < 0.52 ? 'parttime' : 'standard',
    career: { lvl: clamp(Math.floor((age - 20) / 7 * (0.5 + edu * 0.18) + r(8)), 0, 6), xp: 0, since: gameDay() }, job: c.work || 0, home: c.home || 0, wage: 0, sav: Math.round((c.money || 100) * 20 + r(9) * 3000),
    needs: {}, hap: 65, health: clamp(100 - Math.max(0, age - 45) * 0.8 - r(10) * 10, 35, 100), sick: false, commute: { mode: 'none', min: 0 }, mem: [], op: {}, friends: [], fav: { shop: 0, food: 0, fun: 0 }, f: {}, dec: [], t: 0, agent: c };
  CAI_NEEDS.forEach(function (n, i) { P.needs[n[0]] = 55 + caiHash(id, 20 + i) * 40; });
  CAI_TOPICS.forEach(function (t) { P.op[t[0]] = 0; });
  if (P.rt === 'night' && typeof p10NightShift === 'function' && S.p10 && !p10NightShift(c)) P.rt = 'standard';
  caiMemory(P, '👋', 'Arrived in ' + (S.city.name || 'the city'));
  caiJoinHousehold(P, c);
  return P;
}
function caiMemory(P, icon, text) { P.mem.unshift([gameDay(), icon, String(text).slice(0, 90)]); if (P.mem.length > 8) P.mem.length = 8; CAI.dirty.add(P.id); }

/* ---------- Household 2.0: adults (agents) + children / teens (statistical members) sharing one home and budget ---------- */
function caiJoinHousehold(P, c) {
  const A = cai(), home = c.home;
  let H = null;
  for (const k in A.households) { const h = A.households[k]; if (h.home === home && h.adults.length < 2 && h.adults.indexOf(P.id) < 0) { H = h; break; } }
  if (!H) {
    const id = A.nextHh++, r = function (s) { return caiHash(id, 7000 + s); };
    H = { id: id, ln: P.ln, home: home, adults: [], kids: [], income: 0, rent: 0, spend: 0, sav: 0, sat: 60, car: P.car ? 1 : 0, unhappy: 0 };
    const age = caiAge(P), kidsWanted = (P.pers === 'FAMILY' ? 1.6 : 0.7) * (age >= 26 && age <= 55 ? 1 : 0.15);
    const nk = Math.min(3, Math.floor(r(1) * (kidsWanted + 1)));
    for (let k = 0; k < nk; k++) { const sx = r(10 + k) < 0.5 ? 'F' : 'M', kage = Math.max(0, Math.min(17, age - 22 - Math.floor(r(20 + k) * 14))); H.kids.push({ fn: caiPick(sx === 'F' ? CAI_FIRST_F : CAI_FIRST_M, r(30 + k)), by: gameDay() - kage * CAI_YEAR_DAYS - r(40 + k) * CAI_YEAR_DAYS, sx: sx }); }
    A.households[id] = H;
  } else P.ln = H.ln;                                                 // a partner takes the household name
  H.adults.push(P.id); P.hh = H.id; if (P.car) H.car = Math.max(H.car, 1);
  return H;
}
function caiHousehold(P) { const A = cai(); return P && A.households[P.hh] || null; }

/* ---------- cached per-tile context (game hour × map version) ---------- */
function caiCtxKey() { return (MAP.version || 0) + ':' + Math.floor(S.clock.gameSec / 3600); }
function caiHomeInfo(b) {
  if (!b) return null;
  const key = caiCtxKey();
  if (CAI.cache.key !== key) CAI.cache = { key: key, home: new Map(), cand: new Map() };
  let o = CAI.cache.home.get(b.id); if (o) return o;
  const d = bdef(b), i = idx(b.x, b.y), dist = typeof govDistrictAt === 'function' && S.government ? govDistrictAt(b.x, b.y) : null;
  const air = typeof ENV !== 'undefined' && ENV.air && ENV.air.length === MAP.W * MAP.H ? ENV.air[i] : (S.city.pollution || 0) / 100, noise = typeof ENV !== 'undefined' && ENV.noise && ENV.noise.length === MAP.W * MAP.H ? ENV.noise[i] : 0.2;
  const avgWage = (typeof jobStats === 'function' ? jobStats().avgSalary : 0) || 1800;      // rent on the same scale as wages: ≈ 28 % of an average wage
  const rent = (typeof rentMult === 'function' ? rentMult(b) : 1) * clamp(S.city.housingPrice || 1, 0.3, 4) * avgWage * 0.28 * (d.housing ? 1 + (b.level - 1) * 0.2 : 1);
  o = { dist: dist, distName: districtName(b.x, b.y) || 'District', char: typeof districtCharacterAt === 'function' ? districtCharacterAt(b.x, b.y) : '', air: air, noise: noise, rent: rent,
    health: dist ? dist.health : 60, edu: dist ? dist.education : 60, safety: dist ? dist.safety : clamp(100 - (S.city.crime || 0) * 3, 0, 100), transport: dist ? dist.transport : 50, services: dist ? (dist.health + dist.education + dist.safety + dist.fire + dist.transport + dist.maint) / 6 : 60,
    level: b.level || 1, crowd: b._hcap ? clamp((b._cust || 0) / b._hcap, 0, 2) : 0.8 };
  CAI.cache.home.set(b.id, o);
  return o;
}

/* ---------- needs & Happiness 3.0 (13 factors) ---------- */
function caiWage(P, c) { const j = typeof citizenJob === 'function' ? citizenJob(c) : { income: 0 }; const lvl = c.work ? 1 + P.career.lvl * 0.14 : 0; return Math.round((j.income || 0) * lvl); }
function caiFactors(P, c) {
  const home = citizenBuilding(c.home), H = caiHomeInfo(home) || { air: 0.3, noise: 0.2, rent: 400, health: 50, edu: 50, safety: 50, transport: 50, services: 50, level: 1, crowd: 1 };
  const hh = caiHousehold(P), age = caiAge(P), stage = caiStageOf(age), wage = P.wage, inc = hh ? hh.income : wage, rentShare = inc > 0 ? H.rent / inc : 1.2;
  const pressure = typeof govTaxPressure === 'function' && S.government ? govTaxPressure() : clamp(((S.city.tax || 10) - 10) * 4, 0, 100);
  const weather = (({ storm: 25, heavyrain: 35, rain: 50, snow: 55, coldwave: 35, heatwave: 40, fog: 60, cloudy: 70 })[FX.weather] || 82) + (({ summer: 6, spring: 4, autumn: -2, winter: -8 })[currentSeason().id] || 0) * (P.pers === 'ECO_FRIENDLY' ? 1.4 : 1);
  const jobs = stage === 'senior' ? 70 : !c.work ? (stage === 'teen' || P.rt === 'student' ? 65 : 20) : clamp(55 + P.career.lvl * 6 + (P.edu >= 3 && P.career.lvl < 2 ? -12 : 0), 0, 100);
  const avgWage = Math.max(1, (typeof jobStats === 'function' ? jobStats().avgSalary : 0) || 1800);
  const f = {
    housing: clamp(55 + (H.level - 1) * 10 - Math.max(0, H.crowd - 1) * 25 - Math.max(0, rentShare - 0.35) * 90 + (home ? 0 : -50), 0, 100),
    job: jobs,
    income: clamp(stage === 'senior' ? 55 + P.sav / 2000 : (inc / avgWage) * 55 + clamp(P.sav / 4000, -20, 20), 0, 100),
    commute: P.commute.mode === 'none' ? 70 : clamp(100 - Math.max(0, P.commute.min - 12) * 2.2 - (P.commute.mode === 'car' ? (SIM.traffic || 0) * 0.2 : 0), 0, 100),
    health: clamp(P.health * 0.7 + H.health * 0.3 - (P.sick ? 30 : 0), 0, 100),
    education: clamp(age <= 24 ? H.edu : 40 + P.edu * 14, 0, 100),
    safety: clamp(H.safety, 0, 100),
    environment: clamp(100 - H.air * 90 - H.noise * 40, 0, 100),
    entertainment: clamp(P.needs.fun * 0.7 + (H.char === 'Leisure' || H.char === 'Tourism District' || H.char === 'Downtown' ? 18 : 6), 0, 100),
    social: clamp(P.needs.social * 0.65 + Math.min(4, P.friends.length) * 7 + (hh && (hh.adults.length > 1 || hh.kids.length) ? 8 : 0), 0, 100),
    services: clamp(H.services, 0, 100),
    taxes: clamp(100 - pressure, 0, 100),
    weather: clamp(weather, 0, 100)
  };
  return f;
}
const CAI_FW = { housing: 1.3, job: 1.1, income: 1.2, commute: 0.9, health: 1.1, education: 0.6, safety: 0.9, environment: 0.8, entertainment: 0.7, social: 0.9, services: 0.7, taxes: 0.6, weather: 0.3 };
function caiHappiness(P, f) {
  const age = caiAge(P), w = Object.assign({}, CAI_FW);
  if (age >= 65) { w.job = 0.2; w.health = 1.6; w.social = 1.2; }
  if (age <= 24) { w.education = 1.2; w.entertainment = 1.0; }
  if (P.pers === 'ECO_FRIENDLY') w.environment = 1.5; if (P.pers === 'WORKAHOLIC') w.job = 1.6; if (P.pers === 'FAMILY') { w.safety = 1.3; w.education = 1.0; } if (P.pers === 'LUXURY') { w.housing = 1.6; w.income = 1.5; }
  let s = 0, n = 0; for (const k in f) { s += f[k] * w[k]; n += w[k]; }
  const needMin = Math.min(P.needs.food, P.needs.rest, P.needs.health);
  return clamp(s / n - Math.max(0, 25 - needMin) * 0.8, 0, 100);
}
/* one AI step for one agent: decay the needs that the old engine does not track, refresh factors + happiness */
function caiUpdate(c, P, dt) {
  const n = P.needs, hrs = dt / 3600 * TIME_SCALE;                    // game hours since the last update
  const home = c.inside && c.inside === c.home, H = caiHomeInfo(citizenBuilding(c.home));
  if (c.needs) { n.food = c.needs.food; n.fun = c.needs.fun; n.shopping = c.needs.shopping; n.purpose = c.needs.work; n.rest = clamp((c.energy || 50) * 0.5 + (c.needs.rest || 50) * 0.5, 0, 100); }
  n.hygiene = clamp(n.hygiene + (home ? 25 : -2.5) * hrs, 0, 100);
  n.social = clamp(n.social + (c.inside && !c.atWork && !home ? 10 : home && caiHousehold(P) && caiHousehold(P).adults.length + caiHousehold(P).kids.length > 1 ? 4 : -2.2) * hrs, 0, 100);
  if (P.sick) P.health = clamp(P.health - 1.2 * hrs, 5, 100); else P.health = clamp(P.health + ((H ? (1 - H.air) * 0.6 : 0.3) - (caiAge(P) > 70 ? 0.35 : 0.1)) * hrs, 20, 100);
  n.health = P.health; n.safety = H ? H.safety : 60; n.comfort = H ? clamp(50 + (H.level - 1) * 12 - Math.max(0, H.crowd - 1) * 30, 0, 100) : 30;
  n.education = clamp(P.edu * 22 + (caiAge(P) <= 24 && c.lastSchoolDay === gameDay() ? 10 : 0), 0, 100);
  P.f = caiFactors(P, c); P.hap = caiHappiness(P, P.f);
  P.t = S.clock.runSec;
  CAI.dirty.add(P.id);
}

/* ---------- LOD scheduler: near 5–10 Hz full AI, mid 1–2 Hz, far nothing per agent ---------- */
const CAI_LOD_IV = [0.14, 0.6];                                    // sim seconds between updates; with a 0.05 s scheduler: near ≈ 6.7 Hz, mid ≈ 1.6 Hz
function caiTick(dt) {
  if (!caiOn() || !STARTED) return;
  if (!CAI.installed && typeof caiInstallInspector === 'function') { CAI.installed = true; caiInstallInspector(); }
  const t0 = performance.now(), L = AG.citizens, now = S.clock.runSec;
  let budget = PERF.scale < 0.6 ? 25 : 50;
  for (let k = 0; k < L.length && budget > 0; k++) {
    const i = (CAI.cursor + k) % L.length, c = L[i]; if (c.tourist) continue;
    const lod = typeof lodOf === 'function' ? lodOf(c.x, c.y) : 0; if (lod >= 2) { CAI.prof.far++; continue; }
    const P = caiProfile(c); if (!P) continue;
    if (now - P.t < CAI_LOD_IV[lod] && P.t <= now) continue;
    const step = P.t > 0 && P.t <= now ? now - P.t : CAI_LOD_IV[lod];
    caiUpdate(c, P, Math.min(step, 30)); budget--;
    if (lod === 0) CAI.rate.near++; else CAI.rate.mid++;
  }
  CAI.cursor = L.length ? (CAI.cursor + 37) % L.length : 0;
  const ms = performance.now() - t0; CAI.prof.ms = CAI.prof.ms * 0.95 + ms * 0.05;
  const gh = Math.floor(S.clock.gameSec / 3600);
  if (gh !== CAI.hourKey) { CAI.hourKey = gh; caiSafe('hour', caiHour); }
  const gd = gameDay(); if (gd !== CAI.dayKey) { const first = CAI.dayKey < 0; CAI.dayKey = gd; if (!first) caiSafe('day', caiDay); }
}
/* measured update rate (per agent per sim second) for the near / mid bands — shown in the debug panel and tested */
function caiRates() {
  const R = CAI.rate, now = S.clock.runSec, dt = now - R.t0; if (dt < 2) return R.last || { near: 0, mid: 0 };
  const L = AG.citizens.filter(function (c) { return !c.tourist; }), lods = [0, 0, 0]; L.forEach(function (c) { lods[typeof lodOf === 'function' ? lodOf(c.x, c.y) : 0]++; });
  R.last = { near: lods[0] ? R.near / dt / lods[0] : 0, mid: lods[1] ? R.mid / dt / lods[1] : 0, counts: lods };
  R.t0 = now; R.near = 0; R.mid = 0; return R.last;
}

/* ---------- Decision AI (utility scores) ---------- */
function caiJitter(P, salt) { return caiHash(P.id, Math.floor(S.clock.gameSec / 900), salt) * 3; }    // deterministic tie-break, < 3 points
function caiDecide(c) {
  const t0 = performance.now(), P = caiProfile(c); if (!P) return false;
  const h = gameHour(), today = gameDay(), weekend = isWeekend(), age = caiAge(P), stage = caiStageOf(age), Pe = PERSONALITIES[c.pers] || PERSONALITIES.FAMILY;
  const R = CAI_ROUTINES[P.rt] || CAI_ROUTINES.standard, night = h >= 22 || h < 6, out = (S.p9 ? weatherOutdoor() : 1) * (({ winter: 0.5, summer: 1.2 })[currentSeason().id] || 1);
  const ev = S.events && S.events.active ? S.events.active.find(function (a) { return a.kind === 'global' || a.kind === 'dyn'; }) : null;
  const opts = [], add = function (state, parts, list, filter, pick) { let u = 0; for (const k in parts) u += parts[k]; if (u <= 0) return; parts.jitter = caiJitter(P, opts.length); u += parts.jitter; opts.push({ state: state, u: u, parts: parts, list: list, filter: filter, pick: pick }); };
  const isNight = P.rt === 'night', ws = R[1], we = R[2], earlier = c.car && (SIM.traffic || 0) > 60 && !isNight ? 0.5 : 0;   // Smart Commute: car drivers leave earlier on congested days
  const inShift = isNight ? (h >= ws || h < we) : h >= ws - 1.5 - earlier && h < we - 1;
  // sleep / rest
  add('GO_HOME_SLEEP', { need: isNight ? (h >= 8 && h < 16 ? 95 : 0) : night ? 95 + (100 - (c.energy || 50)) * 0.3 : (c.energy || 50) < 20 ? 92 : 0, age: stage === 'senior' && h >= 21 ? 10 : 0 }, null);
  // health: a sick citizen goes to the hospital with the best mix of distance, waiting time and quality
  if (P.sick || P.health < 35) add('GO_HOSPITAL', { need: 70 + (100 - P.health) * 0.4, time: h >= 7 && h < 21 ? 5 : -10 }, null, null, caiPickHospital);
  // work / study / job search
  if (stage !== 'senior' && P.rt !== 'retired') {
    if (c.work && P.rt !== 'student') add('GO_WORK', { need: (!weekend || P.pers === 'WORKAHOLIC' && (P.id % 2 === 0)) && inShift && c.lastWorkDay !== today ? 80 : 0, money: c.money < 100 ? 18 : 0, pers: (Pe.work - 1) * 30, career: P.career.lvl >= 4 ? 4 : 0 }, null);
    else if (!c.work && P.rt !== 'student') add('FIND_WORK', { need: h >= 8 && h < 16 && !weekend ? 30 + (c.money < 100 ? 45 : 0) : 0, money: P.sav < 500 ? 15 : 0 }, null, null, caiPickJob);
    if ((P.rt === 'student' || age <= 24 || (!c.work && P.edu < 2 && age < 45)) && !weekend && h >= 7.5 && h < 14 && c.lastSchoolDay !== today) add('GO_SCHOOL', { need: P.rt === 'student' ? 85 : 40, edu: (4 - P.edu) * 4 }, null, null, caiPickSchool);
  }
  // meals, shopping, fun, social, outdoors
  if (c.money >= 12) add('GO_RESTAURANT', { need: (100 - c.needs.food) * 1.1 + (c.needs.food < 30 ? 40 : 0), time: h >= 12 && h < 13.5 ? 35 : h >= 19 && h < 21 ? 20 : 0, social: P.needs.social < 40 ? 8 : 0 }, MAP.lists.FOOD, null, caiPickShop);
  if (c.money >= 20 / (Pe.spend || 1)) add('GO_SHOPPING', { need: (100 - c.needs.shopping) * 0.7 * Pe.shop, time: h >= 17 && h < 19 ? 30 : h >= 11 && h < 17 ? 10 : 0, weekend: weekend ? 12 : 0, money: P.sav < 200 ? -25 : 0 }, MAP.lists.SHOPPING, null, caiPickShop);
  if (c.money >= 15) add('GO_ENTERTAINMENT', { need: ((100 - c.needs.fun) * 0.9 + (c.needs.fun < 30 ? 30 : 0)) * Pe.fun, time: h >= 19 && h < 22 ? 30 : 0, weekend: weekend ? 15 : 0, stage: stage === 'young' ? 10 : stage === 'senior' ? -10 : 0, social: (100 - P.needs.social) * 0.15 }, MAP.lists.ENTERTAINMENT.concat(weekend && S.p10 ? MAP.lists.tourism : []), null, caiPickFun);
  add('GO_PARK', { need: (100 - c.needs.fun) * 0.6 * (Pe.park || 1), time: h >= 9 && h < 20 ? 10 : -30, weekend: weekend ? 15 : 0, weather: (out - 1) * 40, stage: stage === 'senior' ? 12 : 0, health: P.health < 60 ? 6 : 0 }, MAP.lists.parks);
  // Event Crowd AI: a festival / concert pulls citizens with fun + social needs to the event venue
  if (ev && h >= 10 && h < 23) add('GO_EVENT', { need: 35 + (100 - c.needs.fun) * 0.4 + (100 - P.needs.social) * 0.3, pers: (Pe.fun - 1) * 25, weather: (out - 1) * 30 }, null, null, caiPickEvent);
  add('GO_HOME', { base: (18 + (h >= 22 || (h >= 20 && Pe.home) ? 40 : 0)) * (Pe.home || 1), hygiene: P.needs.hygiene < 30 ? 25 : 0, family: caiHousehold(P) && caiHousehold(P).kids.length && h >= 17 ? 12 : 0 }, null);
  add('IDLE', { base: 10 }, null);
  opts.sort(function (a, b) { return b.u - a.u; });
  P.dec = opts.slice(0, 6).map(function (o) { const p = {}; for (const k in o.parts) if (o.parts[k]) p[k] = Math.round(o.parts[k] * 10) / 10; return { s: o.state, u: Math.round(o.u * 10) / 10, p: p }; });
  c.util = opts.slice(0, 5).map(function (o) { return [o.state, Math.round(o.u)]; });
  CAI.prof.decisions++;
  for (let k = 0; k < opts.length; k++) {
    const o = opts[k]; let target = null;
    if (o.state === 'GO_HOME' || o.state === 'GO_HOME_SLEEP') target = citizenBuilding(c.home);
    else if (o.state === 'GO_WORK') target = citizenBuilding(c.work);
    else if (o.state === 'IDLE') target = null;
    else if (o.pick) target = o.pick(c, P, o.state, o.list);
    else target = favoriteOr(c, o.state, nearestOf(o.list || [], c.x, c.y, function (b) { return !b.closed; }));
    if (o.state !== 'IDLE' && (!target || !target._op && o.state !== 'GO_HOME' && o.state !== 'GO_HOME_SLEEP')) continue;
    if (o.state === 'FIND_WORK') { c.work = target.id; c.mem.work = target.id; c.state = 'GO_WORK'; P.job = target.id; caiMemory(P, '💼', 'Found a job: ' + bdef(target).name); }
    else c.state = o.state;
    P.goal = o.state;
    if (o.state === 'IDLE') { wander(c); break; }
    goTo(c, target);
    break;
  }
  if (!c.state) wander(c);
  CAI.prof.decMs = CAI.prof.decMs * 0.98 + (performance.now() - t0) * 0.02;
  return true;
}
/* candidate lists are cached per game hour and 8×8 cell (no full scans per decision) */
function caiCandidates(key, list, x, y, filter, max) {
  if (CAI.cache.key !== caiCtxKey()) CAI.cache = { key: caiCtxKey(), home: new Map(), cand: new Map() };
  const C = CAI.cache;
  const cell = Math.floor(y / TILE / 8) * 64 + Math.floor(x / TILE / 8), k = key + ':' + cell;
  let out = C.cand.get(k); if (out) return out;
  out = (list || []).filter(function (b) { return b.built && b._op && !b.closed && (!filter || filter(b)); }).map(function (b) { const bc = buildingCenter(b); return { b: b, d: (Math.abs(bc.x - x) + Math.abs(bc.y - y)) / TILE }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, max || 12);
  C.cand.set(k, out); return out;
}
/* Shopping AI: price, distance, quality, brand and income */
function caiPickShop(c, P, state, list) {
  const cand = caiCandidates(state, list, c.x, c.y, null, 12); if (!cand.length) return null;
  const rich = clamp(P.wage / 2500, 0.3, 3), lux = P.pers === 'LUXURY', fav = state === 'GO_SHOPPING' ? P.fav.shop : P.fav.food;
  let best = null, bs = -1e9;
  cand.forEach(function (x, i) {
    const b = x.b, quality = b.nrev ? b.rating : 3 + (b.level - 1) * 0.4 + (b._eff || 0.5) * 0.5, price = 1 + (b.level - 1) * 0.35 + (isAI(b) ? 0.1 : 0);
    const brand = (fav === b.id ? 6 : 0) + Math.min(5, (c.mem && c.mem.visits[b.id]) || 0) * 0.8 + (isAI(b) && S.ai && S.ai[b.owner] ? (S.ai[b.owner].rep || 50) / 25 : 0);
    const s = quality * (lux ? 6 : 3.5) - price * (lux ? 1 : 6 / rich) - x.d * (P.car ? 0.35 : 0.8) + brand + caiHash(P.id, b.id, gameDay()) * 1.5;
    if (s > bs) { bs = s; best = b; }
  });
  return best;
}
/* Entertainment AI: district character matches the personality */
const CAI_FUN_CHAR = { TECH_LOVER: ['Tech Valley', 'Science'], SHOPPER: ['Commercial', 'Downtown', 'Leisure'], LUXURY: ['Luxury Coast', 'Financial District', 'Downtown'], ECO_FRIENDLY: ['Green Belt', 'Old Town'], FAMILY: ['Suburbs', 'Leisure', 'Green Belt'], WORKAHOLIC: ['Downtown', 'Financial District'] };
function caiPickFun(c, P, state, list) {
  const cand = caiCandidates(state, list, c.x, c.y, null, 14); if (!cand.length) return null;
  const like = CAI_FUN_CHAR[P.pers] || [], age = caiAge(P);
  let best = null, bs = -1e9;
  cand.forEach(function (x) {
    const b = x.b, ch = typeof districtCharacterAt === 'function' ? districtCharacterAt(b.x, b.y) : '', d = bdef(b);
    const s = (like.indexOf(ch) >= 0 ? 8 : 0) + (ch === 'Leisure' || ch === 'Tourism District' ? 3 : 0) + (b.nrev ? b.rating : 3.2) * 2 - x.d * 0.45 + (age < 30 && /club|bar|arena|stadium/.test(d.id) ? 4 : 0) + (age >= 60 && /museum|theater|theatre|opera|gallery/.test(d.id) ? 4 : 0) + (P.fav.fun === b.id ? 4 : 0) + caiHash(P.id, b.id, gameDay()) * 1.5;
    if (s > bs) { bs = s; best = b; }
  });
  return best;
}
/* Health AI: hospital choice by distance, waiting time and quality */
function caiPickHospital(c, P) {
  const list = S.buildings.list.filter(function (b) { return b.built && b._op && bdef(b).service === 'health'; }); if (!list.length) return null;
  const wait = (typeof SV !== 'undefined' && SV.health && SV.health.wait) || 10;
  let best = null, bs = -1e9;
  list.forEach(function (b) { const bc = buildingCenter(b), d = (Math.abs(bc.x - c.x) + Math.abs(bc.y - c.y)) / TILE, big = /large|research|center|centre/i.test(bdef(b).id + bdef(b).name) ? 1 : 0, s = big * 8 + b.level * 2 - d * 0.6 - wait * 0.3 * (big ? 1.2 : 0.8); if (s > bs) { bs = s; best = b; } });
  return best;
}
/* Job search: wage × education match − distance (open positions only) */
function caiPickJob(c, P) {
  const cand = caiCandidates('job', MAP.lists.jobs, c.x, c.y, function (b) { return b.workers > 0 && bdef(b).sector !== 'HOUSING' && (b._actW || 0) < b.workers; }, 16); if (!cand.length) return null;
  let best = null, bs = -1e9;
  cand.forEach(function (x) { const d = bdef(x.b), need = typeof jobEduNeed === 'function' ? jobEduNeed(d) : 1, match = P.edu >= need ? 6 - (P.edu - need) * 1.5 : -12, s = (d.sal || 0.2) * 40 + match - x.d * 0.3 + caiHash(P.id, x.b.id) * 1.5; if (s > bs) { bs = s; best = x.b; } });
  return best;
}
/* Education AI: university for higher education, schools / colleges otherwise */
function caiPickSchool(c, P) {
  const age = caiAge(P), list = MAP.lists.schools.concat(S.buildings.list.filter(function (b) { return bdef(b).eduHigh; }));
  const cand = caiCandidates('school' + (age > 18 ? 'U' : ''), list, c.x, c.y, function (b) { return age > 18 ? !!bdef(b).eduHigh || (bdef(b).eduLvl || 1) >= 2 : true; }, 8);
  return cand.length ? cand[0].b : null;
}
/* Event Crowd AI: the venue of the running event (stadium / arena / central plaza / park) */
function caiPickEvent(c, P) {
  const L = S.buildings.list.filter(function (b) { return b.built && b._op && /stadium|arena|plaza|centralpark|park|concert|amphi/.test(b.type); }); if (!L.length) return null;
  const cc = typeof cityCentre === 'function' ? cityCentre() : { x: c.x, y: c.y };
  return L.sort(function (a, b) { return (/stadium|arena|concert|amphi/.test(b.type) ? 1 : 0) - (/stadium|arena|concert|amphi/.test(a.type) ? 1 : 0) || Math.hypot(a.x * TILE - cc.x, a.y * TILE - cc.y) - Math.hypot(b.x * TILE - cc.x, b.y * TILE - cc.y); })[0];
}

/* arrival effects of the new states + business effect (reviews feed the company / building rating) */
function caiAfterArrive(c, state, b) {
  const P = caiProfile(c); if (!P || !b) return;
  if (state === 'GO_HOSPITAL') { P.sick = false; P.health = clamp(P.health + 35, 0, 100); caiMemory(P, '🏥', 'Treated at ' + bdef(b).name); P.op.health = clamp(P.op.health + 8, -100, 100); c.inside = b.id; c.insideUntil = S.clock.gameSec + 120 * 60; }
  if (state === 'GO_EVENT') { c.needs.fun = 100; P.needs.social = clamp(P.needs.social + 40, 0, 100); P.op.fun = clamp(P.op.fun + 6, -100, 100); cai().events.attended++; caiMemory(P, '🎉', 'Went to the event at ' + bdef(b).name); c.inside = b.id; c.insideUntil = S.clock.gameSec + 150 * 60; }
  if (state === 'GO_RESTAURANT' || state === 'GO_ENTERTAINMENT' || state === 'GO_PARK') P.needs.social = clamp(P.needs.social + (P.friends.length ? 30 : 15), 0, 100);
  if (state === 'GO_SHOPPING' || state === 'GO_RESTAURANT' || state === 'GO_ENTERTAINMENT') {
    const key = state === 'GO_SHOPPING' ? 'shop' : state === 'GO_RESTAURANT' ? 'food' : 'fun', hh = caiHousehold(P), price = state === 'GO_SHOPPING' ? 20 : state === 'GO_RESTAURANT' ? 12 : 15;
    if (hh) hh.spend += price * 25;
    const quality = (b._eff || 0.6) * 3 + (b.level - 1) * 0.5 + 1.2, crowd = b.visitors > 40 ? -0.4 : 0, stars = clamp(Math.round(quality + crowd + (caiHash(P.id, b.id, gameDay()) - 0.5)), 1, 5);
    b.nrev = Math.min(9999, (b.nrev || 0) + 1); b.rating = ((b.rating || 3.5) * Math.min(b.nrev - 1, 200) + stars) / (Math.min(b.nrev - 1, 200) + 1);
    if (stars >= 4) P.fav[key] = b.id; else if (stars <= 2 && P.fav[key] === b.id) P.fav[key] = 0;
  }
  if (state === 'GO_WORK') { P.career.xp += 8; if (P.commute.min > 40) P.op.traffic = clamp(P.op.traffic - 4, -100, 100); }
  CAI.dirty.add(P.id);
}

/* Smart Commute: personal mode choice on top of the multi-modal router (value of time, eco preference, age, health, habit, weather) */
function caiCommuteAdjust(c, target, opts) {
  const P = caiProfile(c); if (!P || !opts.length) return opts;
  const rich = clamp(P.wage / 2500, 0.4, 3), age = caiAge(P), winter = currentSeason().id === 'winter', ev = S.events && S.events.active && S.events.active.some(function (a) { return a.kind === 'global' || a.kind === 'dyn'; });
  opts.forEach(function (o) {
    let adj = (o.min * (rich - 1) * 0.15) - (o.cost * 2.5 * (1 - 1 / rich));                // richer → time matters more than money
    if (P.pers === 'ECO_FRIENDLY') adj += o.mode === 'car' ? 8 : o.mode === 'bike' || o.mode === 'walk' ? -4 : o.mode === 'transit' ? -2 : 0;
    if (P.pers === 'LUXURY' && o.mode === 'car') adj -= 3;
    if (age >= 65 && (o.mode === 'bike' || o.mode === 'walk')) adj += 6; if (P.health < 50 && o.mode === 'bike') adj += 5;
    if (winter && o.mode === 'bike') adj += 5; if (P.commute.mode === o.mode) adj -= 2;            // habit
    if (ev && o.mode === 'car') adj += 6; if (ev && (o.mode === 'transit' || o.mode === 'transfer')) adj -= 3;   // event: parking is full, transit runs extra
    o.pscore = o.score + adj;
  });
  opts.sort(function (a, b) { return a.pscore - b.pscore; });
  if (c.work && target && target.id === c.work) { P.commute = { mode: opts[0].mode, min: opts[0].min }; P.commuteOpts = opts.slice(0, 5).map(function (o) { return { m: o.mode, min: Math.round(o.min * 10) / 10, s: Math.round(o.pscore * 10) / 10 }; }); CAI.dirty.add(P.id); }
  return opts;
}
function caiCommuteMin(P, c) {
  if (P.commute.mode !== 'none' && P.commute.min > 0) return P.commute.min;
  const w = citizenBuilding(c.work), h = citizenBuilding(c.home); if (!w || !h) return 0;
  const km = kmOf(buildingCenter(h), buildingCenter(w)); return km / (c.car ? 28 : 12) * 60 + 4;
}

/* ---------- hourly: households, jobs, careers, education, health; city statistics ---------- */
function caiHour() {
  const t0 = performance.now(), A = cai();
  const people = []; AG.citizens.forEach(function (c) { if (!c.tourist) { const P = caiProfile(c); if (P) people.push(P); } });
  people.forEach(function (P) {
    const c = P.agent; P.wage = caiWage(P, c); P.home = c.home; P.job = c.work || 0;
    if (c.atWork || c.lastWorkDay === gameDay()) P.career.xp += 1;
    const need = 120 * (P.career.lvl + 1) * (1.15 - P.edu * 0.08);
    if (c.work && P.career.lvl < 6 && P.career.xp >= need && gameDay() - P.career.since >= 2) { P.career.lvl++; P.career.xp = 0; P.career.since = gameDay(); caiMemory(P, '📈', 'Promoted to ' + CAI_CAREER[P.career.lvl]); P.op.jobs = clamp(P.op.jobs + 10, -100, 100); }
    if (!P.sick && caiHash(P.id, Math.floor(S.clock.gameSec / 3600), 77) < 0.004 * (1 + (S.city.pollution || 0) / 60) * (caiAge(P) > 60 ? 2 : 1)) { P.sick = true; caiMemory(P, '🤒', 'Fell ill'); P.op.health = clamp(P.op.health - 4, -100, 100); }
    if (P.commute.mode === 'none' && c.work) P.commute.min = caiCommuteMin(P, c);
    CAI.dirty.add(P.id);
  });
  // households 2.0: one budget for adults + children (feeds EconomyEngine household spending via HH)
  Object.keys(A.households).forEach(function (k) {
    const H = A.households[k], adults = H.adults.map(function (id) { return CAI.live.get(id); }).filter(Boolean);
    if (!adults.length) return;
    const home = citizenBuilding(H.home), info = caiHomeInfo(home);
    H.income = adults.reduce(function (a, P) { return a + P.wage; }, 0); H.rent = info ? info.rent * (1 + H.kids.length * 0.1) : 400;
    const basics = 260 * (adults.length + H.kids.length * 0.6);
    H.sav = clamp(H.sav + (H.income - H.rent - basics - H.spend) / (30 * 24), -1e8, 1e10); H.spend *= 0.9;
    H.sat = Math.round(adults.reduce(function (a, P) { return a + P.hap; }, 0) / adults.length);
  });
  caiPrune();
  // self-healing: citizens whose home / workplace was demolished or replaced are rehoused / look for work again
  const fx = caiAutoFix(); A.fixed = (A.fixed || 0) + fx.actions.length;
  CAI.prof.hourMs = performance.now() - t0;
  caiCityStats(people);
}
/* profiles of agents that left the simulated sample are dropped (the save stays small); a household without
   members left goes too. Saved profiles that are not bound to an agent yet (right after loading) are kept. */
function caiPrune() {
  const A = cai(), alive = new Set(); AG.citizens.forEach(function (c) { if (c.cid) alive.add(c.cid); });
  CAI.live.forEach(function (P, id) { if (!alive.has(id)) { CAI.live.delete(id); delete A.people[id]; CAI.dirty.delete(id); } });
  Object.keys(A.households).forEach(function (k) { const H = A.households[k]; H.adults = H.adults.filter(function (id) { return alive.has(id) || (A.people[id] && !CAI.live.has(id)); }); if (!H.adults.length) delete A.households[k]; });
}
/* daily: aging, social ties, opinions, housing AI + migration, comments, history */
function caiDay() {
  const t0 = performance.now(), A = cai(), people = []; CAI.live.forEach(function (P) { if (P.agent && AG.citizens.indexOf(P.agent) >= 0) people.push(P); });
  people.forEach(function (P) {
    const c = P.agent, age = caiAge(P); c.age = Math.min(99, age);
    if (age === 67 && P.rt !== 'retired' && caiHash(P.id, gameDay()) < 0.5) { P.rt = 'retired'; caiMemory(P, '🎈', 'Retired after a long career'); }
    if (P.rt === 'student' && age > 24) { P.rt = 'standard'; caiMemory(P, '🎓', 'Finished studying'); }
    if (P.rt === 'student' && c.lastSchoolDay >= gameDay() - 1 && P.edu < 4 && caiHash(P.id, gameDay(), 5) < 0.25) { P.edu++; c.edu = P.edu; caiMemory(P, '🎓', 'Graduated: ' + (typeof EDU_LEVELS !== 'undefined' ? EDU_LEVELS[P.edu] : 'level ' + P.edu)); P.op.education = clamp(P.op.education + 10, -100, 100); }
  });
  caiSocialTies(people);
  caiOpinions(people);
  caiHousingAndMigration(people);
  caiComments(people);
  caiPrune();
  const L = A.life; A.hist.push({ d: gameDay(), life: Math.round(L.score), hap: Math.round(A.stats ? A.stats.hap : 0), emp: Math.round(A.stats ? A.stats.employment : 0), commute: Math.round(A.stats ? A.stats.commute : 0), pop: Math.round(S.city.population), approval: S.government ? Math.round(S.government.approval.value) : 0 });
  if (A.hist.length > 60) A.hist.shift();
  L.hist.push(Math.round(L.score)); if (L.hist.length > 60) L.hist.shift();
  CAI.prof.dayMs = performance.now() - t0;
}
function caiSocialTies(people) {
  const byWork = {}, byHome = {};
  people.forEach(function (P) { const c = P.agent; if (c.work) (byWork[c.work] = byWork[c.work] || []).push(P); (byHome[c.home] = byHome[c.home] || []).push(P); });
  const link = function (a, b) { if (a === b) return; if (a.friends.indexOf(b.id) < 0 && a.friends.length < 6) { a.friends.push(b.id); if (a.friends.length === 1) caiMemory(a, '🤝', 'Made a friend: ' + b.fn + ' ' + b.ln); } if (b.friends.indexOf(a.id) < 0 && b.friends.length < 6) b.friends.push(a.id); };
  [byWork, byHome].forEach(function (G) { Object.keys(G).forEach(function (k) { const L = G[k]; for (let i = 0; i + 1 < L.length; i++) if (caiHash(L[i].id, L[i + 1].id, gameDay()) < 0.35) link(L[i], L[i + 1]); }); });
  people.forEach(function (P) { P.friends = P.friends.filter(function (id) { return CAI.live.has(id); }); });
}
/* opinions per topic, from each citizen's own experience; the city average feeds City Approval */
function caiOpinions(people) {
  const A = cai(), sum = {}; CAI_TOPICS.forEach(function (t) { sum[t[0]] = 0; });
  people.forEach(function (P) {
    const f = P.f || {}, toward = function (k, target) { P.op[k] = clamp(P.op[k] * 0.8 + target * 0.2, -100, 100); };
    toward('taxes', (f.taxes || 50) * 2 - 100); toward('traffic', (f.commute || 60) * 2 - 100); toward('transit', P.commute.mode === 'transit' || P.commute.mode === 'transfer' ? (f.commute || 60) * 2 - 100 : P.op.transit);
    toward('housing', (f.housing || 50) * 2 - 100); toward('jobs', (f.job || 50) * 2 - 100); toward('health', (f.health || 50) * 2 - 100); toward('education', (f.education || 50) * 2 - 100);
    toward('safety', (f.safety || 50) * 2 - 100); toward('environment', (f.environment || 50) * 2 - 100); toward('fun', (f.entertainment || 50) * 2 - 100);
    CAI_TOPICS.forEach(function (t) { sum[t[0]] += P.op[t[0]]; });
  });
  CAI_TOPICS.forEach(function (t) { A.opinions[t[0]] = people.length ? Math.round(sum[t[0]] / people.length) : (A.opinions[t[0]] || 0); });
}
function caiOpinionMood() { const A = cai(), ks = Object.keys(A.opinions); return ks.length ? ks.reduce(function (a, k) { return a + A.opinions[k]; }, 0) / ks.length : 0; }
/* Housing AI: unhappy households look for a better, affordable home; very unhappy ones may leave the city */
function caiHousingAndMigration(people) {
  const A = cai(), M = A.migration;
  Object.keys(A.households).forEach(function (k) {
    const H = A.households[k]; H.unhappy = H.sat < 38 ? H.unhappy + 1 : Math.max(0, H.unhappy - 1);
    if (H.unhappy < 3) return;
    const adults = H.adults.map(function (id) { return CAI.live.get(id); }).filter(Boolean); if (!adults.length) return;
    const homes = (MAP.lists.homes || []).filter(function (b) { return b.built && b._op && b.id !== H.home && (b._cust || 0) < (b._hcap || 0); });
    let best = null, bs = -1e9; const cur = caiHomeInfo(citizenBuilding(H.home));
    homes.slice(0, 200).forEach(function (b) { const I = caiHomeInfo(b); if (!I) return; const afford = H.income > 0 ? I.rent / H.income : 2; const s = I.services * 0.4 + I.safety * 0.3 + (1 - I.air) * 30 + I.level * 5 - Math.max(0, afford - 0.4) * 120 + caiHash(H.id, b.id) * 2; if (s > bs) { bs = s; best = b; } });
    const curS = cur ? cur.services * 0.4 + cur.safety * 0.3 + (1 - cur.air) * 30 + cur.level * 5 : 0;
    if (best && bs > curS + 6) {
      H.home = best.id; adults.forEach(function (P) { P.agent.home = best.id; P.agent.mem.home = best.id; P.home = best.id; caiMemory(P, '🚚', 'Moved to ' + (districtName(best.x, best.y) || 'a new home')); });
      H.unhappy = 0; M.moved++;
    } else if (H.unhappy >= 8 || (H.unhappy >= 6 && caiHash(H.id, gameDay(), 9) < 0.5)) {   // a week of unhappiness with no better home: the household leaves
      adults.forEach(function (P) { caiMemory(P, '🧳', 'Left the city'); const i = AG.citizens.indexOf(P.agent); if (i >= 0) AG.citizens.splice(i, 1); });
      M.left++; H.unhappy = 0;
    }
  });
}
/* Comments 2.0: built from each citizen's real numbers (commute minutes, rent share, promotion, air, district) */
function caiComments(people) {
  const A = cai(), out = [];
  people.slice(0, 120).forEach(function (P) {
    const c = P.agent, f = P.f || {}, H = caiHousehold(P), info = caiHomeInfo(citizenBuilding(c.home)), who = P.fn + ' ' + P.ln.charAt(0) + '.', dn = info ? info.distName : 'my district';
    const cand = [];
    if (P.commute.mode !== 'none' && P.commute.min > 30) cand.push([true, 'My ' + (P.commute.mode === 'car' ? 'drive' : P.commute.mode === 'transit' || P.commute.mode === 'transfer' ? 'ride' : 'trip') + ' to work takes ' + Math.round(P.commute.min) + ' minutes. ' + (P.commute.mode === 'car' ? 'We need a metro.' : 'Too long.')]);
    if (P.commute.mode !== 'none' && P.commute.min > 0 && P.commute.min <= 15) cand.push([false, 'Only ' + Math.round(P.commute.min) + ' minutes to work by ' + P.commute.mode + '. Love it.']);
    if (H && H.income > 200 && info && info.rent / H.income > 0.45 && info.rent / H.income < 3) cand.push([true, 'Rent takes ' + Math.round(info.rent / H.income * 100) + '% of our income in ' + dn + '.']);
    if (info && info.air > 0.45) cand.push([true, 'The air in ' + dn + ' is getting worse.']);
    if (info && info.safety >= 85) cand.push([false, dn + ' feels very safe.']);
    if (P.mem[0] && P.mem[0][0] >= gameDay() - 1 && /Promoted|Graduated|Found a job|Moved/.test(P.mem[0][2])) cand.push([false, P.mem[0][2] + '!']);
    if (!c.work && caiAge(P) > 22 && caiAge(P) < 65 && P.rt !== 'student') cand.push([true, 'Still looking for work — ' + Math.round((SIM.unemployment || 0) * 100) + '% unemployment.']);
    if ((f.taxes || 100) < 40) cand.push([true, 'Taxes are getting too high.']);
    if (P.sick) cand.push([true, 'Waiting at the hospital again.']);
    if (cand.length) { const x = cand[Math.floor(caiHash(P.id, gameDay(), 3) * cand.length)]; out.push([gameDay(), who, x[1], x[0] ? 1 : 0]); }
  });
  A.comments = out.slice(0, 24).concat(A.comments).slice(0, 30);
}
/* city-wide statistics from the agent sample + the statistical population (no per-citizen work for the far 99 %) */
function caiCityStats(people) {
  const A = cai(), n = people.length || 1, pop = S.city.population || 0;
  const mean = function (fn) { return people.reduce(function (a, P) { return a + fn(P); }, 0) / n; };
  const stages = {}; CAI_STAGES.forEach(function (s) { stages[s[0]] = 0; });
  let agents = 0; people.forEach(function (P) { stages[caiStageOf(caiAge(P))]++; agents++; const H = caiHousehold(P); if (H && H.adults[0] === P.id) H.kids.forEach(function (k) { stages[caiStageOf(Math.floor((gameDay() - k.by) / CAI_YEAR_DAYS))]++; agents++; }); });
  const share = {}; Object.keys(stages).forEach(function (k) { share[k] = agents ? stages[k] / agents : 0; });
  const children = clamp(S.p10 && SIM.children ? SIM.children : pop * 0.18, 0, pop * 0.4), adults = Math.max(0, pop - children);
  // statistical life stages: children / teens from the population model, adults split like the agent sample
  const adultShare = (share.young + share.adult + share.middle + share.senior) || 1;
  const st = { child: Math.round(children * 0.72), teen: Math.round(children * 0.28) };
  const adultKeys = ['young', 'adult', 'middle', 'senior'], sampled = share.young + share.adult + share.middle + share.senior > 0;
  adultKeys.forEach(function (k) { st[k] = Math.round(adults * (sampled ? share[k] / adultShare : 0.25)); });
  const edu = [0, 0, 0, 0, 0]; people.forEach(function (P) { edu[P.edu]++; });
  const modes = {}; people.forEach(function (P) { if (P.commute.mode !== 'none') modes[P.commute.mode] = (modes[P.commute.mode] || 0) + 1; });
  const commuters = people.filter(function (P) { return P.commute.mode !== 'none' && P.agent.work; });
  const hhCount = Object.keys(A.households).length, hhSize = hhCount ? Object.keys(A.households).reduce(function (a, k) { const H = A.households[k]; return a + H.adults.length + H.kids.length; }, 0) / hhCount : 2.4;
  A.stats = { agents: people.length, pop: Math.round(pop), stages: st, edu: edu, modes: modes, hap: people.length ? mean(function (P) { return P.hap; }) : S.city.happiness,
    employment: SIM.labor > 0 ? SIM.employed / SIM.labor * 100 : 100, commute: commuters.length ? commuters.reduce(function (a, P) { return a + P.commute.min; }, 0) / commuters.length : (S.p11 ? S.p11.modal.avgMin : 20),
    income: people.length ? mean(function (P) { return P.wage; }) : 0, households: Math.round(pop / Math.max(1.2, hhSize)), hhSize: Math.round(hhSize * 10) / 10, sick: people.filter(function (P) { return P.sick; }).length,
    friends: people.length ? mean(function (P) { return P.friends.length; }) : 0, factors: {} };
  CAI_FACTORS.forEach(function (fd) { A.stats.factors[fd[0]] = people.length ? Math.round(mean(function (P) { return (P.f && P.f[fd[0]]) || 0; })) : 0; });
  caiLifeScores();
}
/* CITY LIFE SCORE (0–100) and District Life Score: services, environment, safety, housing, jobs, commute, happiness, social */
function caiLifeScores() {
  const A = cai(), s = A.stats || {}, G = S.government, dists = G && G.districts ? G.districts : [];
  const fac = s.factors || {}, com = clamp(100 - Math.max(0, (s.commute || 20) - 12) * 2.2, 0, 100), emp = clamp(s.employment || 90, 0, 100);
  const hap = s.agents ? s.hap : S.city.happiness, approval = G ? G.approval.value : 60;
  const svc = dists.length ? dists.reduce(function (a, d) { return a + d.govSat; }, 0) / dists.length : 60;
  const env = clamp(100 - (S.city.pollution || 0) * 1.4, 0, 100), safe = clamp(100 - (S.city.crime || 0) * 3, 0, 100), hous = clamp(100 - Math.max(0, (S.city.housingPrice || 1) - 1) * 60, 0, 100);
  const score = clamp(hap * 0.22 + svc * 0.16 + env * 0.12 + safe * 0.1 + hous * 0.1 + emp * 0.12 + com * 0.08 + (fac.social || 60) * 0.05 + approval * 0.05, 0, 100);
  A.life.score = Math.round(score * 10) / 10; A.life.label = caiLifeLabel(score);
  A.life.parts = { happiness: Math.round(hap), services: Math.round(svc), environment: Math.round(env), safety: Math.round(safe), housing: Math.round(hous), jobs: Math.round(emp), commute: Math.round(com), social: Math.round(fac.social || 60), approval: Math.round(approval) };
  A.life.districts = dists.slice(0, 32).map(function (d) {
    const ag = AG.citizens.filter(function (c) { return !c.tourist && c.cid && CAI.live.has(c.cid) && govDistrictIndex(Math.floor(c.x / TILE), Math.floor(c.y / TILE)) === d.k; }).map(function (c) { return CAI.live.get(c.cid); });
    const dh = ag.length ? ag.reduce(function (a, P) { return a + P.hap; }, 0) / ag.length : d.hap;
    const v = clamp(dh * 0.3 + d.govSat * 0.3 + (100 - d.pollution) * 0.15 + d.safety * 0.15 + d.transport * 0.1, 0, 100);
    return { k: d.k, name: d.name, x: d.x, y: d.y, pop: d.pop, score: Math.round(v), label: caiLifeLabel(v), agents: ag.length, hap: Math.round(dh) };
  });
}

/* ---------- Population Forecast (1 · 5 · 10 · 25 · 50 years) — from the real birth / death / migration rates ---------- */
function caiForecast() {
  const P10 = S.p10 && S.p10.pop, R = SIM.p10Rates || { births: 0, deaths: 0, migIn: 0, migOut: 0 }, pop = S.city.population || 0, cap = Math.max(pop, SIM.housingCap || pop * 1.1);
  const secYear = CAI_YEAR_DAYS * 24 * 3600 / TIME_SCALE, L = P10 && P10.last, lastNet = L ? L.births - L.deaths + L.migIn - L.migOut : null;
  const net = lastNet !== null && isFinite(lastNet) ? lastNet * 0.6 + (R.births - R.deaths + R.migIn - R.migOut) * secYear * 0.4 : (R.births - R.deaths + R.migIn - R.migOut) * secYear;   // last full year + today's rates
  const life = cai().life.score, attract = (life - 55) / 100;
  let rate = pop > 0 ? net / pop : 0; rate = clamp(rate + attract * 0.03, -0.06, 0.2);
  const growthCap = cap * (1.25 + Math.max(0, attract) * 0.6);      // the city keeps building: capacity grows with attractiveness
  return [1, 5, 10, 25, 50].map(function (y) {
    let p = pop; for (let k = 0; k < y; k++) p = p + p * rate * (1 - p / Math.max(1, growthCap * (1 + k * 0.02)));
    const unc = 0.04 * Math.sqrt(y);
    return { years: y, pop: Math.round(Math.max(0, p)), low: Math.round(Math.max(0, p * (1 - unc))), high: Math.round(p * (1 + unc)), seniors: Math.round(clamp(0.14 + y * 0.002, 0, 0.3) * p) };
  });
}
/* AI City Planner: suggestions only (it never builds) — each one names the data it comes from */
function caiPlanner() {
  const A = cai(), s = A.stats || {}, out = [], add = function (prio, icon, text, why, at) { out.push({ prio: prio, icon: icon, text: text, why: why, at: at || null }); };
  (A.life.districts || []).filter(function (d) { return d.score < 50 && d.pop > 50; }).slice(0, 3).forEach(function (d) {
    const G = typeof govDistrictAt === 'function' ? GOV.cache.distByK && GOV.cache.distByK[d.k] : null; if (!G) return;
    const low = [['health', '🏥 Build a clinic or hospital', G.health], ['education', '🏫 Build a school', G.education], ['safety', '🚓 Build a police station', G.safety], ['transport', '🚌 Add a bus or metro stop', G.transport]].sort(function (a, b) { return a[2] - b[2]; })[0];
    add(3, '📍', low[1] + ' in ' + d.name, 'District life score ' + d.score + ' · ' + low[0] + ' coverage ' + low[2] + '%', { x: d.x, y: d.y });
  });
  if ((s.commute || 0) > 30) add(3, '🚇', 'Add a metro or bus line between the biggest residential and job districts', 'Average commute ' + Math.round(s.commute) + ' min');
  if ((SIM.unemployment || 0) > 0.1) add(3, '🏭', 'Zone more commercial / industrial jobs', 'Unemployment ' + Math.round(SIM.unemployment * 100) + '%');
  if ((S.city.housingPrice || 1) > 1.5) add(2, '🏘', 'Build more housing (or affordable housing policy)', 'Housing price index ' + (S.city.housingPrice || 1).toFixed(2));
  if ((s.factors || {}).environment < 50) add(2, '🌳', 'Plant parks and move polluters away from homes', 'Environment satisfaction ' + s.factors.environment);
  if ((s.factors || {}).entertainment < 45) add(1, '🎭', 'Add entertainment in the residential districts', 'Entertainment satisfaction ' + s.factors.entertainment);
  if ((s.sick || 0) > Math.max(2, (s.agents || 0) * 0.08)) add(2, '🏥', 'Hospital capacity: more beds or a large hospital', s.sick + ' sick citizens in the sample');
  if (A.opinions.taxes < -40) add(2, '🧾', 'Lower taxes or explain the spending', 'Opinion on taxes ' + A.opinions.taxes);
  if (!out.length) add(1, '✅', 'The city is doing well — keep growing evenly', 'City life score ' + Math.round(A.life.score));
  return out.sort(function (a, b) { return b.prio - a.prio; });
}

/* ---------- validator + auto fix (Citizen Life Health) ---------- */
function caiValidate() {
  const A = cai(), issues = [], add = function (id, what, ref) { issues.push({ id: id, what: what, ref: ref }); };
  const seen = new Set();
  AG.citizens.forEach(function (c) { if (c.tourist) return;
    if (!MAP.byId.has(c.home)) add('homeless', 'Citizen #' + c.id + ' has no home', c);
    if (c.work && !MAP.byId.has(c.work)) add('job', 'Citizen #' + c.id + ' works at a building that no longer exists', c);
    if (c.cid) { if (seen.has(c.cid)) add('dupe', 'Duplicate citizen id ' + c.cid, c); seen.add(c.cid); }
    const P = c.cid ? CAI.live.get(c.cid) : null;
    if (P) { if (!isFinite(P.hap) || CAI_NEEDS.some(function (n) { return !isFinite(P.needs[n[0]]); })) add('nan', P.fn + ' ' + P.ln + ' has invalid needs', c); if (P.hh && !A.households[P.hh]) add('household', P.fn + ' ' + P.ln + ' belongs to a missing household', c); }
  });
  Object.keys(A.households).forEach(function (k) { const H = A.households[k]; if (!MAP.byId.has(H.home)) add('hhhome', 'Household ' + H.ln + ' lives in a building that no longer exists', H); });
  const open = Math.max(0, (SIM.jobs || 0) - (SIM.employed || 0)), idle = AG.citizens.filter(function (c) { return !c.tourist && !c.work && (c.age || 30) < 65 && (c.age || 30) > 24; }).length;
  if (open > 50 && idle > Math.max(3, AG.citizens.length * 0.2)) add('jobsearch', idle + ' citizens without work while ' + Math.round(open) + ' jobs are open', null);
  const n = Math.max(20, AG.citizens.length + Object.keys(A.households).length), health = Math.round(clamp(100 - issues.length / n * 250, 0, 100));   // share of broken records, not a flat penalty
  return { ok: issues.length === 0, issues: issues, health: health, label: health >= 90 ? 'Healthy' : health >= 70 ? 'Minor issues' : 'Needs repair' };
}
function caiAutoFix() {
  const v = caiValidate(), A = cai(), done = [];
  v.issues.forEach(function (i) {
    const c = i.ref && i.ref.home !== undefined && i.ref.x !== undefined ? i.ref : null;
    if (i.id === 'homeless' && c) { const h = nearestOf(MAP.lists.homes || [], c.x, c.y, function (b) { return b.built && (b._cust || 0) < (b._hcap || 1); }); if (h) { c.home = h.id; c.mem.home = h.id; const P = caiProfile(c); if (P) { P.home = h.id; const H = caiHousehold(P); if (H) H.home = h.id; } done.push('Rehoused citizen #' + c.id); } else { const k = AG.citizens.indexOf(c); if (k >= 0) AG.citizens.splice(k, 1); done.push('Removed homeless citizen #' + c.id + ' (no free home)'); } }
    else if (i.id === 'job' && c) { c.work = 0; c.mem.work = 0; const P = caiProfile(c); if (P) P.job = 0; done.push('Cleared a lost job (citizen #' + c.id + ' looks for work)'); }
    else if (i.id === 'dupe' && c) { c.cid = cai().nextCid++; done.push('New id for a duplicate citizen'); }
    else if (i.id === 'nan' && c) { const P = caiProfile(c); CAI_NEEDS.forEach(function (n) { if (!isFinite(P.needs[n[0]])) P.needs[n[0]] = 60; }); if (!isFinite(P.hap)) P.hap = 60; done.push('Reset invalid needs'); }
    else if (i.id === 'household' && c) { const P = caiProfile(c); P.hh = 0; caiJoinHousehold(P, c); done.push('Rebuilt a household'); }
    else if (i.id === 'hhhome') { const H = i.ref, first = CAI.live.get(H.adults[0]); if (first && first.agent && MAP.byId.has(first.agent.home)) { H.home = first.agent.home; done.push('Household ' + H.ln + ' follows its members'); } else { delete A.households[H.id]; done.push('Removed empty household ' + H.ln); } }
    else if (i.id === 'jobsearch') { let n = 0; AG.citizens.forEach(function (x) { if (n >= 20 || x.tourist || x.work) return; const P = caiProfile(x); if (!P || caiAge(P) >= 65) return; const j = caiPickJob(x, P); if (j) { x.work = j.id; x.mem.work = j.id; P.job = j.id; n++; } }); done.push('Job search: ' + n + ' citizens found work'); }
  });
  return { actions: done, before: v, after: caiValidate() };
}

/* ---------- save: dirty profiles are packed into S.citizenAI.people right before saving ---------- */
function caiFlush() {
  const A = S && S.citizenAI; if (!A) return 0;
  let n = 0;
  CAI.dirty.forEach(function (id) { const P = CAI.live.get(id); if (P) { A.people[id] = caiPack(P); n++; } });
  CAI.dirty.clear();
  // only profiles of citizens that are actually saved (the 400-agent sample) stay in the file
  const keep = new Set(); AG.citizens.filter(function (c) { return !c.tourist && isFinite(c.x); }).slice(0, 400).forEach(function (c) { if (c.cid) keep.add(String(c.cid)); });
  if (STARTED && AG.citizens.length) Object.keys(A.people).forEach(function (k) { if (!keep.has(k)) delete A.people[k]; });
  return n;
}
function caiResetRuntime() { CAI.live.clear(); CAI.dirty.clear(); CAI.cache = {}; CAI.hourKey = -1; CAI.dayKey = -1; CAI.cursor = 0; CAI.follow = null; CAI.route = null; CAI.rate = { near: 0, mid: 0, t0: S && S.clock ? S.clock.runSec : 0 }; }

/* ---------- hooks into the existing engine ---------- */
(function () {
  if (window.__p20cai) return; window.__p20cai = true;
  const dec = window.decide;
  if (typeof dec === 'function') window.decide = function (c) { if (caiOn() && !c.tourist && !(S.p9 && S.p9.freeze.citizens)) { const r = caiSafe('decide', function () { return caiDecide(c); }); if (r) return; } return dec.apply(this, arguments); };
  const arr = window.arrive;
  if (typeof arr === 'function') window.arrive = function (c) { const st = c.state, b = citizenBuilding(c.target); const r = arr.apply(this, arguments); if (caiOn() && !c.tourist && b) caiSafe('arrive', function () { caiAfterArrive(c, st, b); }); return r; };
  const mo = window.mmOptions;
  if (typeof mo === 'function') window.mmOptions = function (c, target) { const o = mo.apply(this, arguments); if (!caiOn() || c.tourist) return o; return caiSafe('commute', function () { return caiCommuteAdjust(c, target, o); }) || o; };
  const ser = window.serializeCitizens;
  if (typeof ser === 'function') window.serializeCitizens = function () {
    const out = ser.apply(this, arguments), src = AG.citizens.filter(function (c) { return !c.tourist && isFinite(c.x); }).slice(0, 400);
    out.forEach(function (o, i) { if (src[i] && src[i].cid) o.cid = src[i].cid; });
    return out;
  };
  const rc = window.restoreCitizens;
  if (typeof rc === 'function') window.restoreCitizens = function (raw) {
    const before = AG.citizens.length, n = rc.apply(this, arguments);
    if (Array.isArray(raw)) { const ok = raw.slice(0, 400).filter(function (r) { return r && MAP.byId.has(r.home) && isFinite(r.x) && isFinite(r.y); }); for (let i = 0; i < n; i++) { const c = AG.citizens[before + i], r = ok[i]; if (c && r && +r.cid > 0) c.cid = +r.cid | 0; } }
    return n;
  };
  const bso = window.buildSaveObject;
  if (typeof bso === 'function') window.buildSaveObject = function () { caiSafe('flush', caiFlush); return bso.apply(this, arguments); };
  const ra = window.resetAgents;
  if (typeof ra === 'function') window.resetAgents = function () { const r = ra.apply(this, arguments); caiResetRuntime(); return r; };
  // migration: the City Life Score makes the city more / less attractive (statistical population)
  const ps = window.p10PopulationStep;
  if (typeof ps === 'function') window.p10PopulationStep = function (p, dt, cap, A, g) { if (caiOn() && S.citizenAI.stats) A = A + clamp((S.citizenAI.life.score - 60) / 800, -0.04, 0.04); return ps.call(this, p, dt, cap, A, g); };
  // opinions feed City Approval (a small, bounded term on top of the 12 satisfaction factors)
  const gsh = window.govSatisfactionHour;
  if (typeof gsh === 'function') window.govSatisfactionHour = function () { const r = gsh.apply(this, arguments); if (caiOn() && S.government && S.citizenAI.stats && S.citizenAI.stats.agents) { const G = S.government.approval; G.value = clamp(G.value + clamp(caiOpinionMood() / 100 * 4, -4, 4) * 0.08, 0, 100);   /* same easing as the approval itself: settles ≤ 4 points off the target */ if (typeof govApprovalLabel === 'function') G.label = govApprovalLabel(G.value); } return r; };
  if (typeof Game !== 'undefined' && Game.simSystems && !Game.simSystems.some(function (s) { return s.name === 'CitizenAI'; })) Game.simSystems.push({ name: 'CitizenAI', every: 0.05, acc: 0, tick: function (dt) { caiSafe('tick', function () { caiTick(dt); }); } });
  if (typeof Game !== 'undefined') Game.CitizenAIEngine = { profile: caiProfile, decide: caiDecide, hour: caiHour, day: caiDay, validate: caiValidate, autoFix: caiAutoFix, forecast: caiForecast, planner: caiPlanner };
})();
