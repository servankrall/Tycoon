'use strict';
/* BLOCK CITY TYCOON — EVENTS — crises, disasters, global events, advisor */
/* =============================== 6. EVENTS =============================== */
function constructionTick(dt) {
  const speed = 1;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    if (!b.built) {
      b.progress = Math.min(1, b.progress + dt * speed * (0.5 + 0.5 * (SIM.fulfill && SIM.fulfill.materials !== undefined ? SIM.fulfill.materials : 1)) / b.buildTime);   // construction materials speed up building
      if (Math.random() < 0.5) { const c = buildingCenter(b); spawnParticles(c.x + rand(-10, 10), c.y + rand(-6, 6), Math.random() < 0.5 ? 'dust' : 'spark', 1); }
      if (b.progress >= 1) {
        b.built = true; b.progress = 1;
        S.statistics.totals.built++;
        const c = buildingCenter(b);
        spawnParticles(c.x, c.y - 10, 'confetti', 26);
        sfx('complete');
        if (d.landmark || d.id === 'airport') { shake(6); flashBig(d.icon + ' ' + d.name + '<br>COMPLETE!'); notify('🏆 ' + d.name + ' is complete!', 'gold'); }
        else if (d.cost >= 5000) notify('🏗️ ' + d.name + ' construction finished.', 'good');
        onMapChanged();
        p5OnBuilt(b);
      }
    } else if (b.upg > 0) {
      b.upg = Math.min(1, b.upg + dt / b.upgTime);
      if (Math.random() < 0.4) { const c = buildingCenter(b); spawnParticles(c.x + rand(-8, 8), c.y - 12, 'spark', 1); }
      if (b.upg >= 1) {
        b.upg = 0; b.level = Math.min(MAX_LEVEL, b.level + 1);
        const c = buildingCenter(b); spawnParticles(c.x, c.y - 14, 'confetti', 18);
        sfx('complete'); toast('⬆️ ' + d.name + ' upgraded to Lv' + b.level, 'good');
        computeCoverage();
      }
    }
  });
}

function disasterMitigation() {
  return clamp((SIM.cov.fire * 0.4 + SIM.cov.health * 0.2 + (hasTech('d_fire') ? 0.2 : 0) + (hasTech('d_warning') ? 0.3 : 0) + ((SIM.mods && SIM.mods.mitigation) || 0)) / Math.sqrt(difficulty().events), 0, 0.85);
}
function damageableBuildings() { return S.buildings.list.filter(function (b) { const d = bdef(b); return b.built && !d.landmark && d.id !== 'tree' && d.id !== 'park' && !b.damaged; }); }
function damageBuilding(b) { b.damaged = 1; b.repair = b._cov && b._cov.fire ? 60 : 150; const c = buildingCenter(b); spawnParticles(c.x, c.y, 'smoke', 10); }
function igniteBuilding(b) {
  if (!b || b.fire > 0) return;
  b.fire = 30; b._truck = false;
  notify('🔥 Fire at ' + bdef(b).name + '!' + (b._cov && b._cov.fire ? ' Firefighters dispatched.' : ' No fire coverage!'), 'bad');
}
function startCrisis(c) {
  eventAutosave('before crisis: ' + c.name);
  S.events.active.push({ kind: 'crisis', id: c.id, start: S.clock.runSec, ends: S.clock.runSec + c.dur });
  notify(c.icon + ' ' + c.name + ' — ' + c.desc + ' (' + Math.round(c.dur / 60) + ' min)', 'bad');
  flashBig(c.icon + ' ' + c.name); sfx('event');
}
function startDisaster(d) {
  const m = disasterMitigation();
  S.events.active.push({ kind: 'disaster', id: d.id, start: S.clock.runSec, ends: S.clock.runSec + d.dur });
  notify(d.icon + ' ' + d.name.toUpperCase() + '! ' + d.desc + ' Emergency services reduce damage (' + Math.round(m * 100) + '% mitigation).', 'bad');
  flashBig(d.icon + ' ' + d.name.toUpperCase()); sfx('event');
  const cand = damageableBuildings();
  if (d.id === 'storm') {
    shake(8);
    const n = Math.max(0, Math.round((1 + RNG.next() * 3) * (1 - m)));
    for (let i = 0; i < n && cand.length; i++) damageBuilding(cand.splice(RNG.int(0, cand.length - 1), 1)[0]);
    S.p6._report = { name: d.name, icon: d.icon, at: S.clock.runSec + 6, before: [] };
  } else if (d.id === 'flood') {
    SIM.flood = true;
    const reach = hasTech('d_warning') ? 2 : 3;
    S.buildings.list.forEach(function (b) { b._nearWater = nearWater(b, reach); });
  } else if (d.id === 'earthquake' || d.id === 'blackout' || d.id === 'infrastructure') {
    disaster6(d, m);
  } else if (d.id === 'wildfire') {
    S.p6._report = { name: d.name, icon: d.icon, at: S.clock.runSec + 20, before: [] };
    const n = Math.max(1, Math.round((1 + RNG.next() * 2) * (1 - m * 0.5)));
    cand.sort(function (a, b) { return treesNear(b) - treesNear(a); });
    for (let i = 0; i < n && i < cand.length; i++) igniteBuilding(cand[i]);
  }
}
function nearWater(b, r) {
  const d = bdef(b);
  for (let y = b.y - r; y < b.y + d.h + r; y++) for (let x = b.x - r; x < b.x + d.w + r; x++) if (inMap(x, y) && MAP.nature[idx(x, y)] === 2) return true;
  return false;
}
function treesNear(b) { let n = 0; for (let y = b.y - 2; y <= b.y + 3; y++) for (let x = b.x - 2; x <= b.x + 3; x++) if (inMap(x, y) && MAP.nature[idx(x, y)] === 1) n++; return n; }
function endEvent(a) {
  if (a.kind === 'crisis') { S.statistics.totals.crises++; notify('✅ The ' + CRISES.find(function (c) { return c.id === a.id; }).name + ' is over.', 'good'); }
  if (a.kind === 'disaster') {
    S.statistics.totals.disasters++;
    if (a.id === 'flood') {
      SIM.flood = false;
      const m = disasterMitigation();
      S.buildings.list.forEach(function (b) { if (b._nearWater && b.built && !bdef(b).landmark && Math.random() < 0.3 * (1 - m)) damageBuilding(b); b._nearWater = false; });
    }
    notify('✅ The ' + a.id + ' has passed. Damaged buildings are being repaired.', 'good');
  }
  if (a.kind === 'dyn') { const de = DYN_EVENTS.find(function (x) { return x.id === a.id; }); notify('✅ ' + de.name + ' has ended.', de.good ? 'good' : ''); }
  if (a.kind === 'global') notify('🎉 ' + GLOBAL_EVENTS.find(function (g) { return g.id === a.id; }).name + ' has ended. What a success!', 'good');
}
function startGlobalEvent(g, hosted) {
  S.events.active.push({ kind: 'global', id: g.id, start: S.clock.runSec, ends: S.clock.runSec + g.dur });
  notify(g.icon + ' ' + g.name + (hosted ? ' hosted!' : ' is happening!') + ' Tourism, happiness and revenue up.', 'gold');
  flashBig(g.icon + ' ' + g.name.toUpperCase()); sfx('event');
  if (g.id === 'racing') for (let i = 0; i < 5; i++) spawnAmbientVehicle('race');
}
function eventCost(g) { return Math.round(g.cost * costMult() * (SIM.mods ? SIM.mods.eventCost : 1)); }
function hostEvent(id) {
  const g = GLOBAL_EVENTS.find(function (x) { return x.id === id; });
  if (S.city.peakPop < 3000) { toast('🔒 Global events unlock at 3,000 population', 'bad'); sfx('error'); return; }
  if (activeEvent(id)) { toast('Already running', 'bad'); return; }
  if ((S.events.cooldowns[id] || 0) > S.clock.runSec) { toast('⏳ On cooldown', 'bad'); sfx('error'); return; }
  const cost = eventCost(g);
  if (S.budget < cost) { toast('❌ Not enough city budget', 'bad'); sfx('error'); return; }
  S.budget -= cost; S.events.hosted++; S.events.cooldowns[id] = S.clock.runSec + 300;
  startGlobalEvent(g, true);
}

function eventsTick(dt) {
  const E = S.events, t = S.clock.runSec, pop = S.city.population;
  for (let i = E.active.length - 1; i >= 0; i--) if (t >= E.active[i].ends) { const a = E.active.splice(i, 1)[0]; endEvent(a); }
  const ngf = (1 + 0.2 * S.meta.ngLevel) * Math.max(0.5, ddEventMult());
  if (S.p5.admin.noEvents) { E.nextCrisisAt = Math.max(E.nextCrisisAt, t + 60); E.nextDisasterAt = Math.max(E.nextDisasterAt, t + 60); }
  if (pop >= 150 && t >= E.nextCrisisAt) {
    if (!E.active.some(function (a) { return a.kind === 'crisis'; })) startCrisis(RNG.pick(CRISES));
    E.nextCrisisAt = t + RNG.range(480, 960) / ngf / difficulty().events;
  } else if (pop < 150 && E.nextCrisisAt < t + 300) E.nextCrisisAt = t + 300;
  const dfq = disasterFreq();
  if (pop >= 400 && t >= E.nextDisasterAt && dfq > 0 && !S.p5.admin.noEvents) {
    if (!E.active.some(function (a) { return a.kind === 'disaster'; })) startDisaster(RNG.pick(DISASTERS));
    E.nextDisasterAt = t + RNG.range(1500, 2700) / ngf / difficulty().events / dfq;
  } else if (pop < 400 && E.nextDisasterAt < t + 600) E.nextDisasterAt = t + 600;
  if (S.city.peakPop >= 3000 && t >= E.nextGlobalAt) {
    if (!E.active.some(function (a) { return a.kind === 'global'; })) startGlobalEvent(RNG.pick(GLOBAL_EVENTS), false);
    E.nextGlobalAt = t + RNG.range(700, 1300);
  }
  // Tip bubbles on businesses (tap to collect)
  if (t >= E.nextTipAt) {
    E.nextTipAt = t + rand(16, 30);
    const c = MAP.lists.commercial.filter(function (b) { return b._op && b._rev > 0; });
    if (c.length) { const b = pick(c); b._tip = t + 15; }
  }
  // Random fires where fire coverage is missing
  if (t >= E.nextFireCheck) {
    E.nextFireCheck = t + 30;
    const cand = damageableBuildings().filter(function (b) { return !(b._cov && b._cov.fire) && b.fire <= 0; });
    const total = Math.max(1, builtCount());
    if (pop >= 150 && cand.length && RNG.next() < 0.10 * (cand.length / total) * (hasTech('d_fire') ? 0.5 : 1) * disasterFreq()) igniteBuilding(RNG.pick(cand));
  }
  S.buildings.list.forEach(function (b) {
    if (b.fire > 0) {
      const covered = b._cov && b._cov.fire;
      if (covered && !b._truck) {
        b._truck = true;
        const st = nearestService('fire', b);
        if (st) { dispatchVehicle('firetruck', st, b); const eta = responseEta(st, b._entry); if (isFinite(eta) && b.owner !== 'city') toast('🚒 Fire at ' + bdef(b).name + ' (' + districtName(b.x, b.y) + ') — ETA ' + Math.round(eta) + 's', 'bad'); }
      }
      b.fire -= dt * (covered ? 2.5 : 1);
      if (b.fire <= 0) {
        b.fire = 0; b._truck = false;
        if (Math.random() < (covered ? 0.3 : 1) * (1 - disasterMitigation() * 0.5)) damageBuilding(b);
      }
    }
    if (b.damaged && b.repair > 0) {
      b.repair -= dt * (b._cov && b._cov.fire ? 1.5 : 1);
      if (b.repair <= 0) { b.damaged = 0; b.repair = 0; }
    }
  });
  // Bank robberies when security is low and crime is high
  MAP.lists.commercial.forEach(function (b) {
    const d = bdef(b);
    if (d.interior !== 'bank' || !b._op) return;
    b.vault = Math.min((b.vault || 0) + b._rev * 3 * dt, d.cap * lvlMult(b.level) * 50);
    const sec = bankSecurity(b);
    if (Math.random() < 0.0006 * dt * (1 - sec / 100) * (S.city.crime / 40)) {
      const loss = isAI(b) ? b.vault * 0.3 : Math.min(S.money * 0.03, b.vault * 0.3);
      if (isAI(b)) S.ai[b.owner].cash = Math.max(0, S.ai[b.owner].cash - loss); else S.money -= loss;
      b.vault -= loss;
      notify('🚨 Bank robbery at ' + d.name + '! Lost ' + money(loss) + '. Improve police coverage & staff.', 'bad');
      sfx('error');
    }
  });
  // Ambulance calls
  if (MAP.lists.health.some(function (b) { return b._op; }) && Math.random() < 0.02 * dt * (1 + E.active.filter(function (a) { return a.kind === 'disaster'; }).length * 4)) {
    const hs = pick(MAP.lists.health.filter(function (b) { return b._op; }));
    const target = pick(MAP.lists.homes.filter(function (b) { return b._road; }) || []);
    if (hs && target && !AG.accidents.length) dispatchVehicle('ambulance', hs, target);
  }
}
function bankSecurity(b) {
  const d = bdef(b);
  return clamp((b._cov && b._cov.police ? 55 : 10) + 45 * Math.min(1, b._actW / Math.max(1, d.workers)) - S.city.crime * 0.2, 0, 100);
}
function nearestService(type, b) {
  if (b && b._entry >= 0) { const r = bestResponder(MAP.lists[type].map(function (x) { return x.type; }), b._entry); if (r && isFinite(r.eta)) return r.b; }
  const c = buildingCenter(b); let best = null, bd = 1e9;
  MAP.lists[type].forEach(function (s) { if (!s._op) return; const sc = buildingCenter(s); const dd = Math.hypot(sc.x - c.x, sc.y - c.y); if (dd < bd) { bd = dd; best = s; } });
  return best;
}

/* --- Quests, missions & achievements --------------------------------------- */
function grantReward(r) {
  const parts = [];
  if (r.money) { S.money = Math.min(MONEY_CAP, S.money + r.money); parts.push('+' + money(r.money)); }
  if (r.rp) { S.research.rp += r.rp; parts.push('+' + r.rp + ' RP'); }
  if (r.pp) { S.meta.pp += r.pp; parts.push('+' + r.pp + ' ⭐PP'); }
  return parts.join(' · ');
}
function questTick() {
  const m = S.quests.mission;
  if (m < MISSIONS.length && MISSIONS[m].check()) {
    const M = MISSIONS[m];
    const txt = grantReward(M.reward);
    S.quests.mission++;
    notify('🎬 ' + M.title + ' complete! ' + txt, 'gold');
    flashBig('MISSION ' + (m + 1) + '<br>COMPLETE');
    sfx('levelup');
    if (M.reward.special) {
      S.meta.crown = true;
      if (S.meta.skins.indexOf('gold') < 0) S.meta.skins.push('gold');
      notify('👑 MEGA CITY CROWN earned: +10% permanent income & Golden building skin! New Game+ unlocked.', 'gold');
    }
  }
  let active = 0;
  for (let i = 0; i < SIDE_QUESTS.length && active < 3; i++) {
    const q = SIDE_QUESTS[i];
    if (S.quests.side[q.id]) continue;
    active++;
    let ok = false; try { ok = q.check(); } catch (e) { ok = false; }
    if (ok) { S.quests.side[q.id] = 1; notify('✅ Quest complete: ' + q.desc + ' (' + grantReward(q.reward) + ')', 'good'); sfx('achievement'); }
  }
  if (S.city.sandbox) return;           // no achievements in City Builder (sandbox) mode
  ACHIEVEMENTS.forEach(function (a) {
    if (S.achievements[a.id]) return;
    let ok = false; try { ok = a.check(); } catch (e) { ok = false; }
    if (ok) { S.achievements[a.id] = 1; notify('🏅 Achievement unlocked: ' + a.icon + ' ' + a.name, 'gold'); sfx('achievement'); logHistory(a.icon, 'Achievement: ' + a.name, 'achievement'); }
  });
}

/* --- Dynamic tutorial / City Advisor ---------------------------------------- */
function bestAvailable(ids) { for (let i = ids.length - 1; i >= 0; i--) if (unlockStatus(BUILDINGS[ids[i]]).ok) return ids[i]; return ids[0]; }
function advisorTick() {
  const pop = S.city.population;
  const rules = [
    { id: 'unpaid', ok: SIM.unpaid > 0, msg: '💸 You cannot pay your bills! Reduce workers, raise taxes a little, or take a loan.', act: { type: 'panel', panel: 'companies', tab: 'bank' } },
    { id: 'power', ok: SIM.powerRatio < 0.98 && SIM.powerUse > 0, msg: '⚡ Your electricity is low. Some buildings stopped working. Build a power plant.', act: { type: 'build', cat: 'Utilities', id: bestAvailable(['smallgen', 'powerplant', 'solar', 'wind', 'nuclear', 'fusion']) } },
    { id: 'water', ok: SIM.waterRatio < 0.98 && SIM.waterUse > 0, msg: '💧 Water supply is insufficient. Citizens are unhappy. Build water infrastructure.', act: { type: 'build', cat: 'Utilities', id: bestAvailable(['watertower', 'waterplant', 'megawater']) } },
    { id: 'road', ok: S.buildings.list.some(function (b) { return b.built && !bdef(b).noRoad && !b._road; }), msg: '🛣️ Some buildings have no road access and are not operating. Connect them with roads.', act: { type: 'tool', tool: 'road' } },
    { id: 'housing', ok: pop >= SIM.housingCap * 0.95 && SIM.attract > 0, msg: '🏠 Housing is full! People want to move in. Build more homes.', act: { type: 'build', cat: 'Residential', id: bestAvailable(['house', 'apartment', 'condo', 'skyscraper']) } },
    { id: 'jobs', ok: SIM.unemployment > 0.12 && pop > 8, msg: '💼 Unemployment is high (' + pct(SIM.unemployment * 100) + '). Open businesses and factories to create jobs.', act: { type: 'build', cat: 'Commercial', id: bestAvailable(['foodstand', 'shop', 'restaurant', 'office']) } },
    { id: 'labor', ok: SIM.jobs > SIM.labor * 1.15 && SIM.jobs > 10, msg: '👷 Not enough workers to staff your buildings. Build more housing.', act: { type: 'build', cat: 'Residential', id: bestAvailable(['house', 'apartment', 'condo', 'skyscraper']) } },
    { id: 'crime', ok: S.city.crime > 45 && pop > 150, msg: '🚓 Crime is rising (' + Math.round(S.city.crime) + '). Build police stations.', act: { type: 'build', cat: 'Services', id: 'police' } },
    { id: 'fire', ok: SIM.cov.fire < 0.5 && pop > 200, msg: '🚒 Many buildings lack fire coverage. Fires and disasters will hurt more.', act: { type: 'build', cat: 'Services', id: 'fire' } },
    { id: 'pollution', ok: S.city.pollution > 45, msg: '🏭 Pollution is high. Plant trees and parks, or research environment tech.', act: { type: 'build', cat: 'Leisure', id: 'park' } },
    { id: 'traffic', ok: SIM.traffic > 60, msg: '🚗 Traffic jams are hurting business. Build more roads and public transport.', act: { type: 'build', cat: 'Transport', id: bestAvailable(['busstop', 'metro', 'trainstation']) } },
    { id: 'food', ok: pop > 40 && SIM.dDisp.FOOD > 95 && SIM.sDisp.FOOD < 70, msg: '🍔 Food demand is much higher than supply. A restaurant would be very profitable!', act: { type: 'build', cat: 'Commercial', id: bestAvailable(['foodstand', 'restaurant', 'foodcourt']) } },
    { id: 'shop', ok: pop > 60 && SIM.dDisp.SHOPPING > 95 && SIM.sDisp.SHOPPING < 70, msg: '🛍️ Citizens want to shop. Shopping demand exceeds supply.', act: { type: 'build', cat: 'Commercial', id: bestAvailable(['shop', 'supermarket', 'mall']) } },
    { id: 'goods', ok: SIM.goodsUse > 0 && SIM.goodsRatio < 0.8, msg: '📦 Shops are short on goods. Build more workshops or factories.', act: { type: 'build', cat: 'Industry', id: bestAvailable(['workshop', 'factory', 'megafactory']) } },
    { id: 'lab', ok: pop >= 30 && MAP.lists && !S.buildings.list.some(function (b) { return bdef(b).rp; }), msg: '🔬 Build a Laboratory to earn Research Points and unlock technologies.', act: { type: 'build', cat: 'Science', id: 'lab' } },
    { id: 'research', ok: TECH_LIST.some(function (t) { return techState(t) === 'avail' && S.research.rp >= t.cost; }), msg: '🧠 You have enough RP to research a new technology!', act: { type: 'panel', panel: 'research' } },
    { id: 'tax', ok: S.city.tax > 18 && S.city.happiness < 45, msg: '🧾 Taxes are high and citizens are unhappy. They may leave the city.', act: { type: 'panel', panel: 'city', tab: 'economy' } },
    { id: 'company', ok: foundedCompanies() === 0 && S.money >= 5000 * costMult(), msg: '🏢 You can afford to found BLOCK INDUSTRIES and boost industrial revenue.', act: { type: 'panel', panel: 'companies' } },
    { id: 'decision', ok: S.events.decisions.length > 0, msg: '❓ A decision is waiting: ' + (S.events.decisions[0] ? DECISION_TYPES[S.events.decisions[0].type].title : ''), act: { type: 'decision' } },
    { id: 'budget', ok: SIM.budgetUnpaid > 0, msg: '🏛️ The city budget is empty! Services are underfunded. Raise taxes or transfer money at the Town Hall.', act: { type: 'cityhall' } },
    { id: 'zones', ok: pop >= 10 && neededZone() > 0, msg: '🗺️ ' + (['', 'Housing demand is high', 'Shops & services are in demand', 'People need jobs'][neededZone()] || '') + ' but there is no empty ' + (ZONES[neededZone()] ? ZONES[neededZone()].icon + ' ' + ZONES[neededZone()].name : '') + ' zone. Paint one — AI developers will build there.', act: { type: 'zone', zone: neededZone() } },
    { id: 'waste', ok: pop > 100 && SIM.wastePenalty > 0.25, msg: '🗑️ Garbage is piling up! Build Garbage Stations or a Recycling Plant.', act: { type: 'build', cat: 'Waste', id: bestAvailable(['garbage', 'recycling', 'wastecenter']) } },
    { id: 'fuel', ok: pop > 150 && SIM.fuelRatio < 0.7, msg: '⛽ Vehicles are running out of fuel. Build Gas Stations (and a Refinery or import fuel).', act: { type: 'build', cat: 'Logistics', id: 'gasstation' } },
    { id: 'storage', ok: SIM.storageCap && SIM.storageUsed / SIM.storageCap > 0.9 && pop > 40, msg: '📦 Storage is almost full — production is slowing. Build a Warehouse or export more.', act: { type: 'build', cat: 'Logistics', id: 'warehouse' } },
    { id: 'logistics', ok: SIM.logisticsRatio < 0.8, msg: '🚚 Not enough trucks to deliver goods. Build Warehouses (each adds 6 trucks).', act: { type: 'build', cat: 'Logistics', id: 'warehouse' } },
    { id: 'school', ok: pop > 200 && S.city.education < 25, msg: '🎓 Education is low. Build a School to raise worker skill and productivity.', act: { type: 'build', cat: 'Science', id: 'school' } },
    { id: 'housingprice', ok: pop > 300 && SIM.housingSat < 45, msg: '🏘️ Housing is too expensive. Build Affordable Housing or more homes.', act: { type: 'build', cat: 'Residential', id: bestAvailable(['house', 'apartment', 'socialhousing']) } },
    { id: 'expand', ok: S.city.expansion < maxExpansionFor(MAP.W) && S.budget >= expansionCost() && freeTileRatio() < 0.3, msg: '🗺️ Your land is getting crowded. You can afford to expand the city.', act: { type: 'panel', panel: 'city', tab: 'land' } }
  ];
  let adv = null;
  const t = S.clock.runSec;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.ok && !((S.tutorial.dismissed[r.id] || 0) > t)) { adv = r; break; }
  }
  if (!adv && UI.idleTimer > 60 && S.quests.mission < MISSIONS.length) {
    const M = MISSIONS[S.quests.mission];
    adv = { id: 'idle', msg: '🎯 Not sure what to do? Next mission: ' + M.desc, act: M.hint ? { type: 'build', cat: M.hint.cat, id: M.hint.id } : { type: 'rtab', tab: 'quests' } };
  }
  showAdvice(adv);
}
/* Empty zone tiles of a type that developers can actually use (next to a road) */
function zonedEmptyOf(z) {
  let n = 0; const W = MAP.W;
  for (let i = 0; i < MAP.zone.length; i++) {
    if (MAP.zone[i] !== z || MAP.occ[i] || MAP.roads[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1)) n++;
  }
  return n;
}
/* Which zone type the city is missing right now (0 = none) */
function neededZone() {
  if ((SIM.housingDemandRatio || 0) > 1.02 && (SIM.attract || 0) > -0.2 && zonedEmptyOf(1) < 3) return 1;
  const com = ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'].some(function (s) { return (SIM.demand[s] || 0) > (SIM.supply[s] || 0) * 1.3 + 5; });
  if (com && zonedEmptyOf(2) < 3) return 2;
  if (SIM.unemployment > 0.12 && zonedEmptyOf(3) < 3) return 3;
  return 0;
}
function zonedEmptyTiles() { let n = 0; for (let i = 0; i < MAP.zone.length; i++) if (MAP.zone[i] && !MAP.occ[i] && !MAP.roads[i]) n++; return n; }
function freeTileRatio() {
  const r = unlockedRect(); let free = 0, tot = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { tot++; const i = idx(x, y); if (!MAP.roads[i] && !MAP.occ[i] && MAP.nature[i] !== 2) free++; }
  return tot ? free / tot : 0;
}
