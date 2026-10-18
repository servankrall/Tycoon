'use strict';
/* BLOCK CITY TYCOON — GOVERNMENT ENGINE 2.0 · POLICIES, PROJECTS & GOVERNMENT EVENTS (Part 18)
   PolicySystem   12 city policies — daily cost, duration, benefits, side effects and conflicts; the effects are
                  modifiers that EconomyEngine 2.0 / the simulation already read (globalMods).
   ProjectSystem  12 government projects built through the normal construction pipeline (Construction 2.0 crews and
                  materials, owner 'city', paid from the city budget); priority Low / Normal / High / Emergency
                  (Emergency = faster and more expensive). Highway and metro projects use the Part 11 road works and
                  metro builder.
   Events         12 government events raised from real city data through the event engine (news + decisions). */

/* ---------- extra public buildings used by the healthcare system and the projects ---------- */
[
  { id: 'largehospital', name: 'Large Hospital', icon: '🏥', cat: 'Services', sector: 'SERVICE', service: 'health', w: 3, h: 2, cost: 150000, color: '#f8f9fa', roof: '#c1121f', height: 52, cover: 13, beds: 520, er: 80, workers: 120, maxW: 240, power: -32, water: -18, maint: 20, unlock: { pop: 6000 }, desc: '520 beds, 80 emergency beds — the big regional hospital.' },
  { id: 'researchhospital', name: 'Research Hospital', icon: '🧬', cat: 'Services', sector: 'SERVICE', service: 'health', w: 3, h: 3, cost: 420000, color: '#edf2fb', roof: '#3a0ca3', height: 62, cover: 15, beds: 380, er: 60, rp: 2, workers: 170, maxW: 340, power: -50, water: -25, maint: 38, unlock: { pop: 15000 }, desc: '380 beds and medical research (+2 RP/s). Raises treatment quality.' },
  { id: 'firehq', name: 'Fire Headquarters', icon: '🚒', cat: 'Services', sector: 'SERVICE', service: 'fire', w: 2, h: 2, cost: 60000, color: '#e63946', roof: '#780000', height: 30, cover: 11, workers: 40, maxW: 80, power: -8, water: -6, maint: 6, unlock: { pop: 2500 }, desc: 'Large fire station: wide coverage and many trucks.' },
  { id: 'policehq', name: 'Police Headquarters', icon: '🚔', cat: 'Services', sector: 'SERVICE', service: 'police', w: 2, h: 2, cost: 70000, color: '#3a86ff', roof: '#023e8a', height: 34, cover: 11, workers: 50, maxW: 100, power: -8, water: -4, maint: 7, unlock: { pop: 2500 }, desc: 'Police HQ: wide coverage and many patrols.' },
  { id: 'watertreatment', name: 'Water Treatment Plant', icon: '🚰', cat: 'Utilities', sector: 'WATER', w: 3, h: 2, cost: 80000, color: '#48cae4', roof: '#0096c7', height: 16, water: 700, workers: 25, maxW: 50, power: -18, maint: 9, unlock: { pop: 2000 }, desc: '+700 clean water.' },
  { id: 'centralpark', name: 'Central Park', icon: '🌳', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 3, h: 3, cost: 45000, color: '#40916c', roof: '#52b788', height: 3, cap: 120, pol: -14, hap: 12, maint: 1.5, noRoad: true, unlock: { pop: 1200 }, desc: 'Big city park: happiness ++, pollution −−.' }
].forEach(function (d) { if (!BUILDINGS[d.id]) registerBuilding(d); });

/* ---------------------------------------- policies ---------------------------------------- */
// cost: $/day at 20 000 inhabitants (scaled by population); days: duration; mods: benefits AND side effects
const GOV_POLICIES = {
  green: { name: 'Green City', icon: '🌿', cost: 1800, days: 6, conflicts: ['industrial'], good: 'Pollution −12 %, happiness +2', bad: 'Industrial output −5 %', mods: function (m) { m.pollution *= 0.88; m.indPol *= 0.85; m.hap += 2; m.production *= 0.95; } },
  transit: { name: 'Public Transport Priority', icon: '🚌', cost: 1500, days: 6, conflicts: [], good: 'Transit capacity +15 %, traffic −7 %', bad: 'Bus lanes: road capacity −3 %', mods: function (m) { m.transit *= 1.15; m.traffic *= 0.93; m.roadCap *= 0.97; } },
  freeEdu: { name: 'Free Education', icon: '🎓', cost: 2600, days: 8, conflicts: [], good: 'Education +6, happiness +1.5', bad: 'Expensive · budget pressure', mods: function (m) { m.hap += 1.5; } },
  healthInvest: { name: 'Healthcare Investment', icon: '🏥', cost: 2400, days: 6, conflicts: [], good: 'Treatment quality +12, workforce +2 %', bad: 'Expensive', mods: function (m) { m.labor = (m.labor || 1) * 1.02; } },
  industrial: { name: 'Industrial Incentive', icon: '🏭', cost: 1400, days: 6, conflicts: ['green'], good: 'Industrial production +10 %', bad: 'Pollution +6 %, happiness −1', mods: function (m) { m.production *= 1.1; m.indPol *= 1.15; m.pollution *= 1.06; m.hap -= 1; } },
  tech: { name: 'Technology Incentive', icon: '💻', cost: 2000, days: 6, conflicts: [], good: 'Research +20 %, tech revenue +8 %', bad: 'Expensive', mods: function (m) { m.rp *= 1.2; m.techRev *= 1.08; } },
  tourism: { name: 'Tourism Campaign', icon: '🧳', cost: 1600, days: 5, conflicts: ['housing'], good: 'Tourists +20 %', bad: 'Traffic +4 %, rents rise', mods: function (m) { m.tour *= 1.2; m.traffic *= 1.04; } },
  roadMaint: { name: 'Road Maintenance Priority', icon: '🛣️', cost: 1300, days: 6, conflicts: [], good: 'Road maintenance +40 %, logistics +3 %', bad: 'More road works', mods: function (m) { m.logistics = (m.logistics || 1) * 1.03; } },
  emergency: { name: 'Emergency Preparedness', icon: '🚨', cost: 1700, days: 6, conflicts: [], good: 'Response times −15 %, disaster damage −15 %', bad: 'Expensive', mods: function (m) { m.mitigation += 0.15; } },
  housing: { name: 'Affordable Housing', icon: '🏘️', cost: 1900, days: 8, conflicts: ['tourism'], good: 'Rents −8 %, housing capacity +6 %, happiness +2', bad: 'City rent revenue −1 %', mods: function (m) { m.housingMult *= 1.06; m.hap += 2; m.rev *= 0.99; } },
  energy: { name: 'Energy Efficiency', icon: '💡', cost: 1200, days: 6, conflicts: [], good: 'Power demand −10 %, water use −5 %', bad: 'Shops −1 %', mods: function (m) { m.powerDemand *= 0.9; m.waterUse *= 0.95; m.commRev *= 0.99; } },
  recycling: { name: 'Recycling Program', icon: '♻️', cost: 1100, days: 6, conflicts: [], good: 'Waste −20 %, pollution −4 %', bad: 'Collection costs', mods: function (m) { m.waste = (m.waste || 1) * 0.8; m.pollution *= 0.96; } }
};
GOV_EXPENSE.push(['policies', 'Policies']);
function govPolicyActive(id) { return !!(S && S.government && S.government.policies.active[id]); }
function govPolicyCost(id) { const P = GOV_POLICIES[id]; return P ? Math.round(P.cost * clamp(S.city.population / 20000, 0.05, 4) * costMult()) : 0; }
function govPolicyEnable(id) {
  const P = GOV_POLICIES[id], G = gov(); if (!P) return { ok: false, reason: 'Unknown policy' };
  if (G.policies.active[id]) return { ok: false, reason: P.name + ' is already active' };
  const clash = P.conflicts.filter(function (c) { return G.policies.active[c]; });
  if (clash.length) return { ok: false, reason: 'Conflicts with ' + clash.map(function (c) { return GOV_POLICIES[c].name; }).join(', ') };
  const c = govPolicyCost(id);
  if (S.budget < c) return { ok: false, reason: 'Needs ' + money(c) + ' per day (city budget ' + money(S.budget) + ')' };
  const day = gameDay();
  G.policies.active[id] = { since: day, until: day + P.days };
  G.policies.log.unshift({ d: day, id: id, on: true }); if (G.policies.log.length > 30) G.policies.log.pop();
  newsAdd(P.icon, 'Policy enacted: ' + P.name, P.good + ' · side effects: ' + P.bad + ' · ' + money(c) + '/day for ' + P.days + ' days.', { cat: 'city' });
  GOV.dirtyUi++;
  return { ok: true, msg: P.name + ' enacted for ' + P.days + ' days' };
}
function govPolicyDisable(id, why) {
  const G = gov(), P = GOV_POLICIES[id]; if (!P || !G.policies.active[id]) return { ok: false, reason: 'Not active' };
  delete G.policies.active[id];
  G.policies.log.unshift({ d: gameDay(), id: id, on: false }); if (G.policies.log.length > 30) G.policies.log.pop();
  if (why) notify(P.icon + ' ' + P.name + ' ended: ' + why, why === 'expired' ? '' : 'bad');
  GOV.dirtyUi++;
  return { ok: true, msg: P.name + ' ended' };
}
function govPolicyMods(m) { const A = S.government.policies.active; Object.keys(A).forEach(function (id) { if (GOV_POLICIES[id]) GOV_POLICIES[id].mods(m); }); }
function govPoliciesHour() {
  const G = gov(), A = G.policies.active, day = gameDay();
  Object.keys(A).forEach(function (id) {
    if (!GOV_POLICIES[id]) { delete A[id]; return; }
    if (day >= A[id].until) { govPolicyDisable(id, 'expired'); return; }
    const c = govPolicyCost(id) / 24;
    if (S.budget < c) { govPolicyDisable(id, 'the city budget cannot pay for it'); return; }
    S.budget -= c; G.budget.today.exp.policies = (G.budget.today.exp.policies || 0) + c;
  });
}
/* Affordable Housing caps rents (on top of the service premium) */
(function () {
  const rm = window.rentMult;
  if (typeof rm === 'function' && !rm.__p18p) { window.rentMult = function (b) { const v = rm.apply(this, arguments); return govPolicyActive('housing') ? v * 0.92 : v; }; window.rentMult.__p18p = true; }
})();

/* ---------------------------------------- government projects ---------------------------------------- */
const GOV_PRIORITY = { low: { name: 'Low', speed: 0.7, cost: 0.95 }, normal: { name: 'Normal', speed: 1, cost: 1 }, high: { name: 'High', speed: 1.3, cost: 1.15 }, emergency: { name: 'Emergency', speed: 1.7, cost: 1.4 } };
const GOV_PROJECTS = {
  hospital: { name: 'New Hospital', icon: '🏥', svc: 'health', kind: 'build', b: ['researchhospital', 'largehospital', 'medicalcenter', 'hospital'], benefit: 'Beds, emergency capacity and healthcare coverage where it is lowest' },
  university: { name: 'University Campus', icon: '🎓', svc: 'education', kind: 'build', b: ['university', 'college'], benefit: 'Higher-education seats → qualification, income, productivity' },
  airport: { name: 'Airport Expansion', icon: '✈️', svc: 'transport', kind: 'upgrade', b: ['airport', 'megaairport'], benefit: 'Airport level +1: tourists, trade and revenue' },
  metro: { name: 'Metro Line', icon: '🚇', svc: 'transport', kind: 'metro', b: ['metro'], benefit: 'A metro line between the two busiest districts — traffic ↓' },
  firehq: { name: 'Fire HQ', icon: '🚒', svc: 'fire', kind: 'build', b: ['firehq', 'fire'], benefit: 'Fire coverage and response time where they are worst' },
  policehq: { name: 'Police HQ', icon: '🚔', svc: 'police', kind: 'build', b: ['policehq', 'police'], benefit: 'Police coverage, patrols and response time where they are worst' },
  water: { name: 'Water Treatment', icon: '🚰', svc: 'water', kind: 'build', b: ['watertreatment', 'waterplant'], benefit: 'Clean water capacity' },
  power: { name: 'Power Plant', icon: '⚡', svc: 'electricity', kind: 'build', b: ['solar', 'powerplant'], benefit: 'Electricity capacity' },
  recycling: { name: 'Recycling Center', icon: '♻️', svc: 'waste', kind: 'build', b: ['recycling'], benefit: 'Waste processing, pollution ↓' },
  park: { name: 'Central Park', icon: '🌳', svc: 'parks', kind: 'build', b: ['centralpark', 'park'], benefit: 'Happiness ↑, pollution ↓, land value ↑' },
  highway: { name: 'Mega Highway', icon: '🛣️', svc: 'roads', kind: 'highway', b: [], benefit: 'The most congested roads become highways' },
  flood: { name: 'Flood Defense', icon: '🧱', svc: 'water', kind: 'build', b: ['floodbarrier'], benefit: 'Protects low land from river / sea floods (built on the shore)' }
};
/* the biggest unlocked variant that has a free site (a packed city falls back to the smaller building) */
function govProjectBuilding(type) {
  const P = GOV_PROJECTS[type]; if (!P) return null;
  let unl = null;
  for (let i = 0; i < P.b.length; i++) { const d = BUILDINGS[P.b[i]]; if (!d || !unlockStatus(d).ok) continue; unl = unl || d; const site = govProjectSiteCached(type, d); if (site) return { d: d, site: site }; }
  return unl ? { d: unl, site: null } : null;
}
function govProjectSiteCached(type, d) {
  const c = GOV.cache, key = type + ':' + d.id + ':' + MAP.version + ':' + GOV.hourKey;
  if (!c.sites || c.sitesVer !== MAP.version) { c.sites = {}; c.sitesVer = MAP.version; }
  if (!(key in c.sites)) c.sites[key] = govProjectSite(type, d);
  return c.sites[key];
}
/* site finder: around the district where this service is worst (population-weighted), else around the city centre */
function govProjectSite(type, d) {
  const P = GOV_PROJECTS[type], G = gov(), key = { health: 'health', education: 'education', fire: 'fire', police: 'police', transport: 'transport' }[P.svc];
  let cx = Math.floor(MAP.W / 2), cy = Math.floor(MAP.H / 2);
  const th = S.buildings.list.find(function (b) { return BUILDINGS[b.type].noDemolish; }); if (th) { cx = th.x; cy = th.y; }
  if (key && G.districts.length) { const w = G.districts.filter(function (x) { return x.pop > 0; }).sort(function (a, b) { return (a[key] - b[key]) || (b.pop - a.pop); })[0]; if (w) { cx = w.x; cy = w.y; } }
  const R = Math.max(MAP.W, MAP.H);
  for (let r = 0; r < R; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
    if (canPlace(d, x, y, true).ok) return { x: x, y: y };
  }
  return null;
}
/* quote: what the project would cost / need now (null reason = can start) */
function govProjectQuote(type, prio) {
  const P = GOV_PROJECTS[type]; if (!P) return { reason: 'Unknown project' };
  const pr = GOV_PRIORITY[prio] || GOV_PRIORITY.normal, G = gov();
  if (G.projects.some(function (p) { return p.type === type && (p.status === 'building' || p.status === 'planned'); })) return { reason: 'Already under construction' };
  if (G.projects.filter(function (p) { return p.status === 'building'; }).length >= 6) return { reason: 'At most 6 projects at once' };
  let base = 0, d = null, workers = 0, mat = null, maint = 0, days = 0, target = null;
  if (P.kind === 'build') {
    const pb = govProjectBuilding(type); if (!pb) { const d0 = BUILDINGS[P.b[P.b.length - 1]]; return { reason: d0 ? 'Locked — ' + unlockStatus(d0).reason : 'Not available' }; }
    d = pb.d; target = pb.site;
    if (!pb.site) return { reason: 'No free site with road access for ' + d.name + ' — free up land or expand the city' };
    base = buildCost(d); const cp = constructionPlan(d); workers = cp.w; mat = cp.m; maint = d.maint; days = buildTimeFor(d.cost) * (S.p9 ? constructionScale(d) : 1) * TIME_SCALE / 86400;
  } else if (P.kind === 'upgrade') {
    target = S.buildings.list.find(function (b) { return P.b.indexOf(b.type) >= 0 && b.built && !isAI(b); });
    if (!target) return { reason: 'Needs the International Airport' };
    if (target.level >= MAX_LEVEL) return { reason: 'The airport is at max level' };
    if (target.upg > 0) return { reason: 'The airport is already being upgraded' };
    d = bdef(target); base = upgradeCost(target); workers = Math.round(constructionPlan(d).w * 0.6); maint = d.maint * 0.6; days = buildTimeFor(d.cost) * 0.6 * TIME_SCALE / 86400;
  } else if (P.kind === 'metro') {
    d = BUILDINGS.metro; if (!unlockStatus(d).ok) return { reason: 'Locked — ' + unlockStatus(d).reason };
    if (!S.p9) return { reason: 'Needs the transit network' };
    base = buildCost(d) * 2 + Math.round(20 * 900 * costMult()); workers = constructionPlan(d).w * 2; mat = constructionPlan(d).m; maint = d.maint * 2; days = buildTimeFor(d.cost) * TIME_SCALE / 86400;
  } else if (P.kind === 'highway') {
    if (!S.p11) return { reason: 'Needs road works (Part 11)' };
    const tiles = corridorTiles(); if (!tiles.length) return { reason: 'No congested road corridor found' };
    base = tiles.reduce(function (a, t) { return a + ROAD_TYPES[4].cost * 60 * costMult(); }, 0); workers = tiles.length * 2; days = clamp(Math.round(tiles.length / 20 * 10) / 10 + 1, 0.5, 4);
  }
  const cost = Math.round(base * pr.cost);
  return { reason: S.budget < cost ? 'Needs ' + money(cost) + ' (city budget ' + money(S.budget) + ')' : null, cost: cost, base: base, d: d, workers: workers, mat: mat, maint: maint, days: Math.max(0.01, Math.round(days / pr.speed * 100) / 100), target: target };
}
function govProjectStart(type, prio) {
  prio = GOV_PRIORITY[prio] ? prio : 'normal';
  const P = GOV_PROJECTS[type], q = govProjectQuote(type, prio); if (!P || q.reason) return { ok: false, reason: q.reason || 'Unknown project' };
  const G = gov(), pr = GOV_PRIORITY[prio], rec = { id: G.nextProject++, type: type, prio: prio, status: 'building', b: 0, progress: 0, cost: q.cost, paid: 0, start: gameDay(), done: 0, note: '', x: -1, y: -1 };
  if (P.kind === 'build') {
    const site = q.target && canPlace(q.d, q.target.x, q.target.y, true).ok ? q.target : govProjectSite(type, q.d); if (!site) { G.nextProject--; return { ok: false, reason: 'No free site with road access for ' + q.d.name }; }
    const b = makeBuilding(q.d.id, site.x, site.y); b.owner = 'city'; b.built = false; b.progress = 0;
    b.buildTime = buildTimeFor(q.d.cost) / pr.speed; if (S.p9) { b.cp = constructionPlan(q.d); b.buildTime = Math.min(590, buildTimeFor(q.d.cost) * constructionScale(q.d)) / pr.speed; }
    b.govProject = rec.id; addBuildingToMap(b); onMapChanged();
    rec.b = b.id; rec.x = site.x; rec.y = site.y; rec.note = q.d.name + ' · ' + (districtName(site.x, site.y) || 'city');
  } else if (P.kind === 'upgrade') {
    const t = q.target; t.upg = 0.0001; t.upgTime = buildTimeFor(bdef(t).cost) * 0.6 / pr.speed;
    rec.b = t.id; rec.x = t.x; rec.y = t.y; rec.note = bdef(t).name + ' → level ' + (t.level + 1);
  } else if (P.kind === 'metro') {
    const pair = govMetroPair(); if (!pair) { G.nextProject--; return { ok: false, reason: 'Needs two populated districts at least 12 tiles apart with free sites' }; }
    rec.st = pair.map(function (s) {
      if (s.id) return s.id;
      const b = makeBuilding('metro', s.x, s.y); b.owner = 'city'; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(BUILDINGS.metro.cost) / pr.speed; if (S.p9) b.cp = constructionPlan(BUILDINGS.metro);
      b.govProject = rec.id; addBuildingToMap(b); return b.id;
    });
    onMapChanged(); rec.note = (districtName(pair[0].x, pair[0].y) || 'A') + ' ⇄ ' + (districtName(pair[1].x, pair[1].y) || 'B'); rec.x = pair[0].x; rec.y = pair[0].y;
  } else if (P.kind === 'highway') {
    const r = startRoadWorks(corridorTiles(), 'highway', '🛣️ Mega Highway'); if (!r.ok) { G.nextProject--; return { ok: false, reason: r.reason }; }
    rec.work = r.w.id; rec.paid = r.w.cost; rec.cost = r.w.cost; rec.note = r.w.tiles.length + ' road tiles';
    if (pr.speed !== 1) r.w.until = r.w.start + (r.w.until - r.w.start) / pr.speed;
  }
  if (P.kind !== 'highway') { S.budget -= q.cost; rec.paid = q.cost; }
  G.budget.today.exp.projects = (G.budget.today.exp.projects || 0) + rec.paid;
  G.projects.unshift(rec); if (G.projects.length > 24) G.projects = G.projects.filter(function (p, i) { return i < 24 || p.status === 'building'; });
  newsAdd(P.icon, 'Government project started: ' + P.name, rec.note + ' · ' + money(rec.cost) + ' · priority ' + pr.name + ' · ' + govDur(q.days) + '.', { cat: 'city' });
  GOV.dirtyUi++;
  return { ok: true, msg: P.name + ' started (' + money(rec.cost) + ')', p: rec };
}
function govDur(days) { return days < 1 ? Math.max(1, Math.round(days * 24)) + ' game hours' : (Math.round(days * 10) / 10) + ' days'; }
function govMetroPair() {
  const D = gov().districts.filter(function (d) { return d.pop > 0; }).slice(0, 12), out = [];
  for (let i = 0; i < D.length && !out.length; i++) for (let j = i + 1; j < D.length && !out.length; j++) {
    if (Math.abs(D[i].x - D[j].x) + Math.abs(D[i].y - D[j].y) < 12) continue;
    const a = govMetroSite(D[i]), b = govMetroSite(D[j]); if (a && b) out.push(a, b);
  }
  return out.length ? out : null;
}
function govMetroSite(dist) {
  const st = S.buildings.list.find(function (b) { return b.type === 'metro' && Math.abs(b.x - dist.x) <= 4 && Math.abs(b.y - dist.y) <= 4; }); if (st) return { id: st.id, x: st.x, y: st.y };
  for (let r = 0; r < 6; r++) for (let y = dist.y - r; y <= dist.y + r; y++) for (let x = dist.x - r; x <= dist.x + r; x++) if (canPlace(BUILDINGS.metro, x, y, true).ok) return { x: x, y: y };
  return null;
}
function govProjectCancel(id) {
  const G = gov(), p = G.projects.find(function (x) { return x.id === id; }); if (!p || p.status !== 'building') return { ok: false, reason: 'Not under construction' };
  const P = GOV_PROJECTS[p.type];
  if (P.kind === 'build' || P.kind === 'metro') (p.st || [p.b]).forEach(function (bid) { const b = MAP.byId.get(bid); if (b && !b.built && b.govProject === p.id) { removeBuilding(b); } });
  if (P.kind === 'build' || P.kind === 'metro') onMapChanged();
  const refund = Math.round(p.paid * (1 - p.progress) * 0.5); S.budget = Math.min(MONEY_CAP, S.budget + refund);
  p.status = 'cancelled'; p.note = (p.note ? p.note + ' · ' : '') + 'cancelled, ' + money(refund) + ' refunded'; GOV.dirtyUi++;
  return { ok: true, msg: P.name + ' cancelled — ' + money(refund) + ' refunded' };
}
function govProjectSetPrio(id, prio) {
  const p = gov().projects.find(function (x) { return x.id === id; }); if (!p || p.status !== 'building' || !GOV_PRIORITY[prio] || p.prio === prio) return { ok: false, reason: 'Cannot change' };
  const from = GOV_PRIORITY[p.prio], to = GOV_PRIORITY[prio], extra = Math.max(0, Math.round(p.cost / from.cost * (to.cost - from.cost) * (1 - p.progress)));
  if (S.budget < extra) return { ok: false, reason: 'Needs ' + money(extra) };
  S.budget -= extra; p.paid += extra; p.cost += extra; gov().budget.today.exp.projects = (gov().budget.today.exp.projects || 0) + extra;
  (p.st || [p.b]).forEach(function (bid) { const b = MAP.byId.get(bid); if (!b) return; if (!b.built) b.buildTime = b.buildTime * from.speed / to.speed; else if (b.upg > 0) b.upgTime = b.upgTime * from.speed / to.speed; });
  p.prio = prio; GOV.dirtyUi++;
  return { ok: true, msg: 'Priority ' + to.name + (extra ? ' (+' + money(extra) + ')' : '') };
}
function govProjectsHour() {
  const G = gov();
  G.projects.forEach(function (p) {
    if (p.status !== 'building') return;
    const P = GOV_PROJECTS[p.type]; if (!P) { p.status = 'failed'; return; }
    let prog = 0, finished = false, lost = false;
    if (P.kind === 'build') { const b = MAP.byId.get(p.b); if (!b) lost = true; else { prog = b.built ? 1 : b.progress; finished = b.built; } }
    else if (P.kind === 'upgrade') { const b = MAP.byId.get(p.b); if (!b) lost = true; else { prog = b.upg > 0 ? b.upg : 1; finished = !(b.upg > 0); } }
    else if (P.kind === 'highway') { const w = S.p11 ? S.p11.works.find(function (x) { return x.id === p.work; }) : null; if (!w) { prog = 1; finished = true; } else prog = clamp((S.clock.runSec - w.start) / Math.max(1, w.until - w.start), 0, 0.99); }
    else if (P.kind === 'metro') {
      const st = (p.st || []).map(function (id) { return MAP.byId.get(id); });
      if (st.some(function (b) { return !b; })) lost = true;
      else {
        prog = st.reduce(function (a, b) { return a + (b.built ? 1 : b.progress); }, 0) / st.length * 0.95;
        if (st.every(function (b) { return b.built; })) {
          const prop = metroSuggest(st[0].id, st[1].id), lc = prop && !prop.error ? Math.round(prop.length * 1000 / TILE_METERS * 900 * costMult()) + prop.sites.length * buildCost(BUILDINGS.metro) : 0;
          if (prop && !prop.error && S.budget >= lc) { const r = metroBuild(prop, false); if (r.ok) { p.paid += lc; p.cost += lc; G.budget.today.exp.projects = (G.budget.today.exp.projects || 0) + lc; finished = true; } else p.note = r.reason; }
          else p.note = prop && prop.error ? prop.error : 'Waiting for the city budget: the tunnel costs ' + money(lc);
        }
      }
    }
    if (lost) { p.status = 'failed'; p.note = 'The construction site was removed'; govAlert('projLost' + p.id, '🏗️ Government project ' + P.name + ' failed: the construction site was removed.', 'bad'); return; }
    p.progress = clamp(prog, 0, 1);
    if (finished) {
      p.status = 'done'; p.progress = 1; p.done = gameDay();
      newsAdd(P.icon, 'Government project complete: ' + P.name, (p.note || '') + ' · ' + P.benefit + '.', { cat: 'city', cls: 'good' });
      if (P.svc === 'transport' || P.svc === 'roads') govEventStart('transportUp', true);
    }
  });
}
/* the construction pipeline: a cancelled / removed site no longer counts */
function govProjectOf(b) { return b && b.govProject ? gov().projects.find(function (p) { return p.id === b.govProject; }) || null : null; }

/* ---------------------------------------- government events ---------------------------------------- */
// test(G) → true when the city data call for it · days · mods(m) while active · choices: decision options (cost = days of policy-like spending)
const GOV_EVENTS = {
  hospitalOverload: { name: 'Hospital Overload', icon: '🏥', days: 2, test: function (G) { return G.services.health && G.services.health.load > 1.02 && S.city.population > 300; }, text: function () { return 'Hospitals are at ' + Math.round(G_().services.health.load * 100) + '% of their capacity and waiting times are ' + Math.round(G_().services.health.wait) + ' minutes.'; }, mods: function (m) { m.hap -= 3; m.labor = (m.labor || 1) * 0.98; },
    choices: [{ label: 'Field hospitals', desc: 'Healthcare funding +30 % for 2 days', k: 1.2, ch: 'fund' }, { label: 'Wait it out', desc: 'Happiness −3, workforce −2 %', k: 0, ch: 'none' }] },
  schoolShortage: { name: 'School Shortage', icon: '🏫', days: 2, test: function (G) { const e = G.services.education; return e && e.used >= e.capacity * 0.98 && e.coverage < 0.6 && S.city.population > 800; }, text: function () { return 'Schools are full — only ' + Math.round(G_().services.education.coverage * 100) + '% of the pupils have a seat.'; }, mods: function (m) { m.hap -= 2; m.eduBonus = (m.eduBonus || 0) - 4; },
    choices: [{ label: 'Temporary classrooms', desc: 'Education funding +30 % for 2 days', k: 1, ch: 'fund' }, { label: 'Do nothing', desc: 'Education −4, happiness −2', k: 0, ch: 'none' }] },
  policeShortage: { name: 'Police Shortage', icon: '🚓', days: 2, test: function (G) { const p = G.services.police; return p && (p.resp > 14 || (p.staff < 0.6 && p.buildings > 0)) && S.city.crime > 35; }, text: function () { return 'Police response time is ' + Math.round(G_().services.police.resp) + ' minutes and crime is ' + Math.round(S.city.crime) + '.'; }, mods: function (m) { m.crimeAdj = (m.crimeAdj || 0) + 6; m.hap -= 2; },
    choices: [{ label: 'Overtime patrols', desc: 'Police funding +30 % for 2 days', k: 1, ch: 'fund' }, { label: 'Do nothing', desc: 'Crime +6', k: 0, ch: 'none' }] },
  fireEmergency: { name: 'Fire Emergency', icon: '🔥', days: 1, test: function (G) { return G.services.fire && G.services.fire.burning >= 3; }, text: function () { return G_().services.fire.burning + ' buildings are burning at the same time!'; }, mods: function (m) { m.hap -= 2; },
    choices: [{ label: 'All units respond', desc: 'Every fire is put out now', k: 0.8, ch: 'extinguish' }, { label: 'Normal response', desc: 'Fires burn on', k: 0, ch: 'none' }] },
  infraFailure: { name: 'Infrastructure Failure', icon: '🚧', days: 2, test: function (G) { return G.maint.avg !== undefined && G.maint.avg < 40; }, text: function () { return 'City infrastructure is at ' + G_().maint.avg + '% — pipes, roads and grids are failing.'; }, mods: function (m) { m.growth *= 0.95; m.roadCap *= 0.95; },
    choices: [{ label: 'Emergency repairs', desc: 'All roads and bridges +20 % condition', k: 1.5, ch: 'repair' }, { label: 'Postpone', desc: 'Growth −5 %, road capacity −5 %', k: 0, ch: 'none' }] },
  budgetCrisis: { name: 'Budget Crisis', icon: '📉', days: 2, test: function (G) { return G.budget.deficitDays >= 3 || (SIM.budgetUnpaid || 0) > 0; }, text: function () { return 'The city has run a deficit for ' + G_().budget.deficitDays + ' days. Services are at risk.'; }, mods: function (m) { m.growth *= 0.96; m.hap -= 2; },
    choices: [{ label: 'Emergency loan', desc: 'Borrow 1 day of income', k: 0, ch: 'loan' }, { label: 'Austerity', desc: 'All service funding −15 %', k: 0, ch: 'austerity' }, { label: 'Raise taxes', desc: 'Residential & commercial tax +2', k: 0, ch: 'tax' }] },
  taxProtest: { name: 'Tax Protest', icon: '🪧', days: 2, test: function () { return govTaxPressure() > 45; }, text: function () { return 'Citizens are protesting against the tax rates (tax pressure ' + Math.round(govTaxPressure()) + ').'; }, mods: function (m) { m.hap -= 4; m.growth *= 0.95; m.commRev *= 0.97; },
    choices: [{ label: 'Cut taxes', desc: 'Residential, commercial & industrial tax −2', k: 0, ch: 'cut' }, { label: 'Hold firm', desc: 'Happiness −4, growth −5 %', k: 0, ch: 'none' }] },
  constructionBoom: { name: 'Construction Boom', icon: '🏗️', good: true, days: 2, test: function () { return S.buildings.list.filter(function (b) { return !b.built; }).length >= 8 && (SIM.unemployment || 0) < 0.08; }, mods: function (m) { m.growth *= 1.05; m.jobs *= 1.03; } },
  healthBreak: { name: 'Healthcare Breakthrough', icon: '🧬', good: true, days: 3, test: function (G) { return G.services.health && G.services.health.quality > 80 && S.buildings.list.some(function (b) { return b.built && (b.type === 'researchhospital' || b.type === 'unihospital'); }); }, mods: function (m) { m.hap += 3; m.labor = (m.labor || 1) * 1.02; } },
  eduBoom: { name: 'Education Boom', icon: '📚', good: true, days: 3, test: function (G) { return G.services.education && G.services.education.quality > 75 && S.city.education > 70; }, mods: function (m) { m.rev *= 1.03; m.rp *= 1.08; } },
  transportUp: { name: 'Transport Upgrade', icon: '🚆', good: true, days: 2, test: function () { return false; }, mods: function (m) { m.traffic *= 0.93; m.logistics = (m.logistics || 1) * 1.03; } },
  infraRecovery: { name: 'Infrastructure Recovery', icon: '🛠️', good: true, days: 2, test: function (G) { return G.maint.avg >= 80 && (G.events.log.some(function (e) { return e.id === 'infraFailure' && gameDay() - e.d <= 8; })); }, mods: function (m) { m.growth *= 1.03; m.hap += 1; } }
};
function G_() { return gov(); }
function govEventActive(id) { return !!(S && S.government && S.government.events.active.some(function (e) { return e.id === id; })); }
function govEventStart(id, force) {
  const E = GOV_EVENTS[id], G = gov(), day = gameDay(); if (!E || govEventActive(id)) return false;
  if (!force && G.events.log.some(function (e) { return e.id === id && day - e.d < 4; })) return false;      // cooldown
  G.events.active.push({ id: id, start: day, until: day + E.days });
  G.events.log.unshift({ d: day, id: id }); if (G.events.log.length > 40) G.events.log.pop();
  newsAdd(E.icon, (E.good ? '' : 'CITY ALERT: ') + E.name, E.text ? E.text() : 'The government reports: ' + E.name.toLowerCase() + '.', { cat: 'city', cls: E.good ? 'good' : 'bad' });
  if (E.choices && typeof createDecision === 'function' && !(typeof BCT_SANDBOX !== 'undefined' && BCT_SANDBOX.on)) createDecision('gov_' + id, { c: E.choices.map(function (c) { return Math.round(c.k * govDailySpend()); }) });
  GOV.dirtyUi++;
  return true;
}
function govDailySpend() { const L = gov().budget.last.exp, s = Object.keys(L).reduce(function (a, k) { return a + L[k]; }, 0); return Math.max(500, s || (SIM.bExp || 0) * 86400 / TIME_SCALE) * 0.25; }
function govEventsDay() {
  const G = gov(), day = gameDay();
  G.events.active = G.events.active.filter(function (e) { if (day < e.until) return true; G.alerts['ev_' + e.id] = 0; return false; });
  if (S.city.population < 200) return;
  let started = 0;
  Object.keys(GOV_EVENTS).forEach(function (id) {
    if (started >= 2) return;
    const E = GOV_EVENTS[id];
    if (!govSafe('event ' + id, function () { return E.test(G); })) return;
    if (E.good && RNG.next() > 0.5) return;                                 // good news is not guaranteed
    if (govEventStart(id, false)) started++;
  });
}
function govEventMods(m) { S.government.events.active.forEach(function (e) { const E = GOV_EVENTS[e.id]; if (E) E.mods(m); }); }
function govEventChoice(id, ch) {
  const G = gov(), E = GOV_EVENTS[id], F = G.budget.funding, svc = { hospitalOverload: 'health', schoolShortage: 'education', policeShortage: 'police' }[id];
  if (ch === 'fund' && svc) { F[svc] = clamp(F[svc] + 0.3, 0, 1.5); G.alerts['ev_' + id] = gameDay(); notify(E.icon + ' ' + GOV_SERVICES.find(function (s) { return s[0] === svc; })[1] + ' funding raised to ' + Math.round(F[svc] * 100) + '%.', 'good'); }
  if (ch === 'extinguish') S.buildings.list.forEach(function (b) { if (b.fire > 0) { b.fire = 0; b._truck = false; } });
  if (ch === 'repair' && S.p10 && S.p10.infra) Object.keys(S.p10.infra).forEach(function (k) { S.p10.infra[k].cond = Math.min(100, S.p10.infra[k].cond + 20); });
  if (ch === 'loan') { const r = govBorrow(Math.max(1000, Math.round(govBudgetSummary().income || govDailySpend() * 4))); notify(r.ok ? '🏦 ' + r.msg : '🏦 Loan refused: ' + r.reason, r.ok ? 'good' : 'bad'); }
  if (ch === 'austerity') Object.keys(F).forEach(function (k) { F[k] = clamp(F[k] - 0.15, 0, 1.5); });
  if (ch === 'tax') { govSetTax('residential', govTaxes().residential + 2); govSetTax('commercial', govTaxes().commercial + 2); }
  if (ch === 'cut') { const T = govTaxes(); govSetTax('residential', T.residential - 2); govSetTax('commercial', T.commercial - 2); govSetTax('industrial', T.industrial - 2); if (S.p17 && S.p17.tax) S.p17.tax.business = Math.round((T.commercial + T.industrial) / 2); G.events.active = G.events.active.filter(function (e) { return e.id !== 'taxProtest'; }); }
  GOV.dirtyUi++;
}
Object.keys(GOV_EVENTS).forEach(function (id) {
  const E = GOV_EVENTS[id]; if (!E.choices) return;
  DECISION_TYPES['gov_' + id] = { title: E.icon + ' ' + E.name.toUpperCase(), text: function () { return E.text ? govSafe('text', E.text) || E.name : E.name; }, options: function (d) { return E.choices.map(function (c, i) { return { label: c.label, desc: c.desc, cost: (d.c && d.c[i]) || 0, payer: 'budget', choice: c.ch }; }); } };
});
/* the decision engine resolves the choice; the government applies it */
(function () {
  const rd = window.resolveDecision;
  if (typeof rd !== 'function' || rd.__p18) return;
  window.resolveDecision = function (uid, k, auto) {
    const dec = S.events.decisions.find(function (d) { return d.uid === uid; });
    if (!dec || dec.type.indexOf('gov_') !== 0) return rd.apply(this, arguments);
    const opts = DECISION_TYPES[dec.type].options(dec.data); let o = opts[Math.min(k, opts.length - 1)];
    if (o.cost > 0 && funds(o.payer) < o.cost && auto) o = opts[opts.length - 1];
    const r = rd.apply(this, arguments);
    if (!S.events.decisions.some(function (d) { return d.uid === uid; })) govSafe('decision', function () { govEventChoice(dec.type.slice(4), o.choice); });
    return r;
  };
  window.resolveDecision.__p18 = true;
})();
