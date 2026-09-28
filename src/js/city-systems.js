'use strict';
/* BLOCK CITY TYCOON — CITY SYSTEMS — AI companies, contracts, construction, incidents */
/* ======================= 7b. PART 4 CITY SYSTEMS ======================= */
/* --- Districts & density (8×8 tile chunks) --------------------------------- */
const DENSITY_NAMES = ['Low', 'Medium', 'High', 'Mega'];
function computeDistricts() {
  const cs = 8, n = Math.ceil(MAP.W / cs), D = [];
  for (let i = 0; i < n * n; i++) D.push({ res: 0, jobs: 0, built: 0, green: 0, score: 0, level: 0 });
  S.buildings.list.forEach(function (b) {
    if (!b.built) return;
    const d = bdef(b), t = D[Math.floor(b.y / cs) * n + Math.floor(b.x / cs)];
    if (!t) return;
    if (d.housing) t.res += b._hcap ? b._hcap * 0.9 : d.housing * lvlMult(b.level) * 0.8;
    t.jobs += b.workers; t.built += d.w * d.h;
    if (d.hap || d.pol < 0) t.green++;
  });
  D.forEach(function (t) { t.score = (t.res + t.jobs) / Math.max(8, t.built); t.level = t.score >= 40 ? 3 : t.score >= 15 ? 2 : t.score >= 5 ? 1 : 0; });
  MAP.districts = D; MAP.dN = n;
}
function districtOf(x, y) { if (!MAP.districts.length) return null; return MAP.districts[Math.floor(y / 8) * MAP.dN + Math.floor(x / 8)] || null; }

/* --- AI companies: developers & rivals ------------------------------------ */
function aiDef(id) { return AI_DEFS.find(function (a) { return a.id === id; }); }
function unlockStatusAI(d) {
  const u = d.unlock || {};
  if (u.company || u.ng || d.unique || d.hidden) return false;
  if (u.tech && !hasTech(u.tech)) return false;
  if (u.pop && S.city.peakPop < u.pop) return false;
  if (u.tourism && !S.city.tourismUnlocked) return false;
  if (u.cityLevel && cityLevel() < u.cityLevel) return false;
  return true;
}
function pickAI(kind) {
  const c = AI_DEFS.filter(function (a) { return a.kind === kind && !S.ai[a.id].acquired; });
  if (!c.length) return null;
  c.sort(function (x, y) { return S.ai[y.id].cash - S.ai[x.id].cash; });
  return Math.random() < 0.65 ? c[0].id : pick(c).id;
}
function rivalFor(sector) { const a = AI_DEFS.find(function (x) { return x.kind === 'rival' && x.sectors.indexOf(sector) >= 0 && !S.ai[x.id].acquired; }); return a ? a.id : null; }
/* An AI company buys land in a zone and builds (cost from its own cash; land price goes to the city budget) */
function aiBuild(aiId, sector, zoneType, product) {
  if (!aiId) return false;
  const ai = S.ai[aiId];
  const r = unlockedRect(), cands = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = idx(x, y); if (MAP.zone[i] === zoneType && !MAP.occ[i] && !MAP.roads[i]) cands.push([x, y]); }
  if (!cands.length) return false;
  const tries = Math.min(40, cands.length);
  for (let k = 0; k < tries; k++) { const j = k + Math.floor(Math.random() * (cands.length - k)); const tmp = cands[k]; cands[k] = cands[j]; cands[j] = tmp; }
  const opts = AI_BUILD_OPTIONS[sector], bonus = hasTech('c_density') ? 1 : 0;
  const storageFull = SIM.storageCap ? SIM.storageUsed / SIM.storageCap > 0.85 : false;
  for (let k = 0; k < tries; k++) {
    const x = cands[k][0], y = cands[k][1];
    const dist = districtOf(x, y), tier = (dist ? dist.level : 0) + bonus;
    let choices = opts.filter(function (o) { return o[1] <= tier && unlockStatusAI(BUILDINGS[o[0]]); });
    if (sector === 'INDUSTRY') {
      choices = choices.filter(function (o) { return storageFull ? o[0] === 'warehouse' : o[0] !== 'warehouse'; });
      if (product === 'food') choices = choices.filter(function (o) { return o[0] !== 'workshop'; });
      else if (product) choices = choices.filter(function (o) { return o[0] !== 'farm'; });
    }
    if (!choices.length) continue;
    choices.sort(function (a, b) { return b[1] - a[1]; });
    for (let c = 0; c < choices.length; c++) {
      const d = BUILDINGS[choices[c][0]];
      const land = d.w * d.h * 20 * costMult(), cost = buildCost(d) + land;
      if (ai.cash < cost * 1.05) continue;
      if (!canPlace(d, x, y, true).ok) continue;
      const b = makeBuilding(d.id, x, y);
      b.owner = aiId; b.built = false; b.progress = 0; b.buildTime = buildTimeFor(d.cost) * 1.2;
      if (d.recipes) b.recipe = product && d.recipes.indexOf(product) >= 0 ? product : d.recipes[0];
      ai.cash -= cost; S.budget = Math.min(MONEY_CAP, S.budget + land);
      addBuildingToMap(b); onMapChanged();
      if (choices[c][1] >= 2 || d.cost >= 20000) notify(aiDef(aiId).icon + ' ' + aiDef(aiId).name + ' is building a ' + d.name + ' (' + DENSITY_NAMES[Math.min(3, dist ? dist.level : 0)] + ' density).', '');
      return true;
    }
  }
  return false;
}
function aiTick(dt) {
  const t = S.clock.runSec, pop = S.city.population;
  AI_DEFS.forEach(function (a) {
    const st = S.ai[a.id]; if (st.acquired) return;
    st.cash += (2 + pop * 0.004) * (0.5 + S.city.reputation / 100) * (1 + 0.15 * st.level) * (0.8 + S.city.skill / 250) * businessGrowthMult() * dt;   // outside investment (cheaper with low interest rates)
    let assets = 0, n = 0;
    S.buildings.list.forEach(function (b) { if (b.owner === a.id) { assets += buildingValue(b); n++; } });
    st.assets = assets; st.count = n;
    st.level = clamp(1 + Math.floor(Math.log10(1 + assets / 2000) * 1.6), 1, 10);
    st.quality = clamp(lerp(st.quality, 0.88 + st.level * 0.035, 0.05), 0.6, 1.6);
    const sec = a.sectors[0];
    const sh = SIM.share && SIM.share[sec] ? (SIM.share[sec][a.id] || 0) : 0;
    const psh = SIM.share && SIM.share[sec] ? (SIM.share[sec].player || 0) : 0;
    st.price = clamp(lerp(st.price, psh > sh + 0.15 ? 0.85 : sh < 0.2 ? 0.9 : sh > 0.5 ? 1.15 : 1.0, 0.1), 0.75, 1.35);   // undercut a dominant player
    if (st.cash > 15000 * costMult() && Math.random() < 0.03 && !(st.adUntil > t)) { st.cash -= 5000 * costMult(); st.adUntil = t + 150; }
    st.rep = clamp(lerp(st.rep, 40 + st.quality * 20 + (st.adUntil > t ? 5 : 0), 0.02), 0, 100);
  });
  if ((SIM.housingDemandRatio || 0) > 1.02 && (SIM.attract || 0) > -0.2) aiBuild(pickAI('dev'), 'HOUSING', 1);
  let best = null, br = 1.1;
  ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'].forEach(function (s) {
    const r = (SIM.demand[s] || 0) / Math.max(1, SIM.supply[s] || 0);
    if (r > br && rivalFor(s) && pop > 8) { br = r; best = s; }
  });
  if (best) aiBuild(rivalFor(best), best, 2);
  const fr = SIM.fulfill || {}; let lowP = null, lf = 0.85;
  ['food', 'materials', 'electronics', 'vehicles'].forEach(function (p) { const f = fr[p] === undefined ? 1 : fr[p]; if (f < lf && SIM.sc && SIM.sc.dem[p] > 0.1) { lf = f; lowP = p; } });
  if (pop > 8 && (lowP || SIM.unemployment > 0.08 || (SIM.storageCap && SIM.storageUsed / SIM.storageCap > 0.85))) aiBuild(rivalFor('INDUSTRY'), 'INDUSTRY', 3, lowP);
  const own = S.buildings.list.filter(function (b) { return isAI(b) && b.built && !b.upg && b.level < MAX_LEVEL; });
  if (own.length) {
    const b = pick(own), dist = districtOf(b.x, b.y), ai = S.ai[b.owner], c = upgradeCost(b);
    if (ai && dist && dist.level >= 1 && ai.cash > c * 1.5 && b.level <= dist.level + 1) { ai.cash -= c; b.upg = 0.0001; b.upgTime = buildTimeFor(bdef(b).cost) * 0.6; }
  }
}
function aiValue(id) { const st = S.ai[id]; return Math.round((st.cash + (st.assets || 0) * 0.9) * 1.25 + 5000); }
function acquireAI(id) {
  const st = S.ai[id], a = aiDef(id); if (!st || st.acquired) return;
  const price = aiValue(id);
  if (S.money < price) { toast('❌ Acquisition needs ' + money(price), 'bad'); sfx('error'); return; }
  S.money -= price;
  let n = 0; S.buildings.list.forEach(function (b) { if (b.owner === id) { b.owner = 'player'; n++; } });
  S.money += st.cash; st.cash = 0; st.acquired = true;
  notify('🦈 You acquired ' + a.name + '! ' + n + ' buildings are now yours.', 'gold'); flashBig('🦈 ACQUIRED<br>' + a.name); sfx('levelup');
}
function adCost() { return Math.round((2000 + S.city.population * 2) * costMult()); }
function runAdCampaign(sector) {
  const c = adCost();
  if (S.money < c) { toast('❌ Not enough money', 'bad'); sfx('error'); return; }
  S.money -= c; S.market.ads[sector] = S.clock.runSec + 180;
  toast('📣 Advertising campaign running in ' + sector + ' for 3 min', 'good'); sfx('money');
}
function setMarketPrice(sector, v) { if ([0.8, 1, 1.2, 1.4].indexOf(v) >= 0) { S.market.price[sector] = v; sfx('click'); } }
function bestPlayerShare() {
  let m = 0;
  if (SIM.share) for (const s in SIM.share) m = Math.max(m, SIM.share[s].player || 0);
  const ind = marketShares('INDUSTRY'); m = Math.max(m, ind.player || 0);
  return m;
}
/* Shares for UI: sectors from the econ tick, INDUSTRY by product sales, HOUSING by residents */
function marketShares(sector) {
  if (sector !== 'INDUSTRY' && sector !== 'HOUSING') return (SIM.share && SIM.share[sector]) || {};
  const out = {}; let tot = 0;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    const v = sector === 'INDUSTRY' ? ((d.goods || d.extract) ? (b._prodRev || 0) : 0) : (d.housing ? (b._cust || 0) : 0);
    if (v > 0) { out[b.owner] = (out[b.owner] || 0) + v; tot += v; }
  });
  for (const k in out) out[k] /= tot || 1;
  return out;
}

/* --- Contracts ------------------------------------------------------------- */
const CLIENTS = ['Block Logistics Co.', 'Metro Builders', 'Global Mart', 'Harbor Supply', 'Nova Retail', 'Skyline Construction'];
function makeContract() {
  const C = S.contracts, t = S.clock.runSec;
  let pool = PRODUCT_IDS.filter(function (p) { return SIM.sc && SIM.sc.prod[p] > 0.05; });
  if (!pool.length) pool = ['materials'];
  const item = pick(pool);
  const rate = Math.max(0.5, SIM.sc ? SIM.sc.prod[item] : 1);
  const dur = pick([180, 300, 420]);
  const qty = Math.max(50, Math.round(rate * dur * rand(0.45, 0.85) / 10) * 10);
  const reward = Math.round(qty * S.economy.prices[item] * rand(2.2, 3.2) * (isGlobalMetropolis() ? 1.5 : 1));
  const tc = tradeableCities();
  const city = Math.random() < 0.6 && tc.length ? pick(tc) : null;
  return { id: C.nextId++, item: item, qty: qty, delivered: 0, reward: reward, dur: dur, expires: t + 150, deadline: 0, from: city ? city.icon + ' ' + city.name : pick(CLIENTS), city: city ? city.id : null };
}
function acceptContract(id) {
  const C = S.contracts, i = C.offers.findIndex(function (c) { return c.id === id; });
  if (i < 0) return;
  if (C.active.length >= 3) { toast('Max 3 active contracts', 'bad'); sfx('error'); return; }
  const c = C.offers.splice(i, 1)[0]; c.deadline = S.clock.runSec + c.dur; C.active.push(c);
  toast('🤝 Contract accepted: ' + fmt(c.qty) + ' ' + PRODUCTS[c.item].name, 'good'); sfx('click');
}
function declineContract(id) { S.contracts.offers = S.contracts.offers.filter(function (c) { return c.id !== id; }); sfx('click'); }
function contractsTick(dt) {
  const C = S.contracts, t = S.clock.runSec;
  C.offers = C.offers.filter(function (o) { return o.expires > t; });
  if (t >= C.nextAt && S.city.population >= 80) { C.nextAt = t + rand(150, 260); if (C.offers.length < 3) { C.offers.push(makeContract()); notify('📄 New contract offer: supply ' + fmt(C.offers[C.offers.length - 1].qty) + ' ' + PRODUCTS[C.offers[C.offers.length - 1].item].name, ''); } }
  for (let i = C.active.length - 1; i >= 0; i--) {
    const c = C.active[i];
    const take = Math.min(c.qty - c.delivered, c.qty / c.dur * 2.5 * dt, S.economy.inventory[c.item]);
    if (take > 0) { S.economy.inventory[c.item] -= take; c.delivered += take; }
    if (c.delivered >= c.qty - 0.01) {
      C.active.splice(i, 1); C.completed++;
      S.money = Math.min(MONEY_CAP, S.money + c.reward);
      S.market.rep = Math.min(100, S.market.rep + 4); S.city.reputation = Math.min(100, S.city.reputation + 1);
      if (c.city) S.diplomacy[c.city].rel = clamp(S.diplomacy[c.city].rel + 8, -100, 100);
      notify('✅ Contract complete for ' + c.from + '! +' + money(c.reward), 'gold'); sfx('achievement');
    } else if (t >= c.deadline) {
      C.active.splice(i, 1); C.failed++;
      S.market.rep = Math.max(0, S.market.rep - 6); S.city.reputation = Math.max(0, S.city.reputation - 3);
      if (c.city) S.diplomacy[c.city].rel = clamp(S.diplomacy[c.city].rel - 8, -100, 100);
      notify('❌ Contract failed: ' + c.from + ' (' + Math.floor(c.delivered / c.qty * 100) + '% delivered). Reputation down.', 'bad');
    }
  }
}

/* --- Investors & equity ------------------------------------------------------ */
const INVESTOR_NAMES = ['Golden Gate Capital', 'Orbit Ventures', 'Blue Whale Fund', 'Aurora Partners', 'Titan Equity', 'Pixel Angels'];
function investorsTick() {
  const I = S.investors, t = S.clock.runSec;
  if (t < I.nextAt) return;
  I.nextAt = t + rand(240, 480) / (0.5 + S.city.reputation / 100);
  if (S.city.reputation < 25) return;
  const comps = Object.keys(S.companies.list).filter(function (id) { return S.companies.list[id].own > 0.56; });
  if (!comps.length) return;
  const cid = pick(comps), c = S.companies.list[cid];
  const stake = Math.min(pick([0.1, 0.15, 0.2]), +(c.own - 0.51).toFixed(2));
  if (stake < 0.05) return;
  const global = isGlobalMetropolis();
  const amount = Math.round(c.price * SHARES_TOTAL * stake * (0.8 + S.city.reputation / 200) * (global ? 2.5 : 1));
  if (amount < 1000) return;
  createDecision('investor', { cid: cid, stake: stake, amount: amount, name: (global ? '🌍 ' : '') + pick(INVESTOR_NAMES) });
}

/* --- Diplomacy ------------------------------------------------------------------ */
function diploCost(kind) { const L = cityLevel(); return Math.round(({ gift: 1000 * (1 + L), agreement: 5000 * L, tourism: 3000 * L })[kind] * costMult()); }
function diplomacyTick(dt) {
  WORLD_CITIES.forEach(function (c) {
    const d = S.diplomacy[c.id];
    const target = c.rel * 0.3 + (d.agreement ? 20 : 0) + (d.tourism ? 10 : 0) + (S.city.reputation - 50) * 0.2;
    d.rel = clamp(d.rel + (target - d.rel) * 0.002 * dt, -100, 100);
  });
  if (S.city.population > 200 && Math.random() < 0.0015 * dt) {
    const c = pick(WORLD_CITIES), d = S.diplomacy[c.id];
    if (Math.random() < 0.5) { d.rel = clamp(d.rel - 12, -100, 100); notify('🏛️ ' + c.name + ' imposed tariffs on Block goods. Relations worsened.', 'bad'); }
    else { d.rel = clamp(d.rel + 10, -100, 100); notify('🕊️ ' + c.name + ' praised your city. Relations improved.', 'good'); }
  }
}
function diploAction(id, kind) {
  const c = WORLD_CITIES.find(function (x) { return x.id === id; }), d = S.diplomacy[id];
  if (!c) return;
  const t = S.clock.runSec, cost = diploCost(kind);
  if (kind === 'gift') {
    if (d.giftAt > t) { toast('⏳ Wait before sending another gift', 'bad'); return; }
    if (S.budget < cost) { toast('❌ Not enough city budget', 'bad'); sfx('error'); return; }
    S.budget -= cost; d.rel = clamp(d.rel + 10, -100, 100); d.giftAt = t + 60;
    toast('🎁 Gift sent to ' + c.name + ' (+10 relations)', 'good'); sfx('money');
  } else if (kind === 'agreement') {
    if (d.agreement) { d.agreement = false; d.rel = clamp(d.rel - 5, -100, 100); toast('Trade agreement with ' + c.name + ' cancelled', ''); return; }
    if (d.rel < 0) { toast('🔒 Relations must be Neutral (≥ 0)', 'bad'); sfx('error'); return; }
    if (S.budget < cost) { toast('❌ Not enough city budget', 'bad'); sfx('error'); return; }
    S.budget -= cost; d.agreement = true; d.rel = clamp(d.rel + 5, -100, 100);
    notify('🤝 Trade agreement signed with ' + c.name + ': better prices & +20% trade capacity.', 'gold'); sfx('achievement');
  } else if (kind === 'tourism') {
    if (d.tourism) return;
    if (d.rel <= 30) { toast('🔒 Requires Friendly relations', 'bad'); sfx('error'); return; }
    if (S.budget < cost) { toast('❌ Not enough city budget', 'bad'); sfx('error'); return; }
    S.budget -= cost; d.tourism = true;
    notify('✈️ Tourism partnership with ' + c.name + ': tourists +8%.', 'gold'); sfx('achievement');
  } else if (kind === 'exchange') {
    if (d.rel < -30) { toast('🔒 ' + c.name + ' is hostile', 'bad'); sfx('error'); return; }
    const inv = S.economy.inventory;
    const give = PRODUCT_IDS.filter(function (p) { return c.exports.indexOf(p) < 0 && inv[p] >= 100; }).sort(function (a, b) { return inv[b] * S.economy.prices[b] - inv[a] * S.economy.prices[a]; })[0];
    if (!give) { toast('You need 100+ units of a product ' + c.name + ' does not produce', 'bad'); sfx('error'); return; }
    const get = c.exports[0];
    const qty = Math.min(500, Math.floor(inv[give]));
    const val = qty * S.economy.prices[give] * (d.rel > 30 ? 1.15 : 1);
    const recv = Math.floor(val / S.economy.prices[get]);
    inv[give] -= qty; inv[get] += recv; d.rel = clamp(d.rel + 3, -100, 100);
    toast('🔄 Exchanged ' + qty + ' ' + PRODUCTS[give].name + ' for ' + recv + ' ' + PRODUCTS[get].name, 'good'); sfx('money');
  }
}

/* --- Decisions (events that ask the player to choose) ---------------------------- */
function scaledCost(base) { return Math.round(base * clamp(S.city.population / 60000, 0.02, 1) * costMult()); }
const DECISION_TYPES = {
  energyshortage: { title: '⚡ ENERGY CRISIS', text: function () { return 'Fuel supplies collapsed and power plants are running at 75%. How do we respond?'; },
    options: function (d) { return [
      { label: 'Import Energy', desc: '+30% power imported during the crisis', cost: d.c1, payer: 'budget', choice: 'import' },
      { label: 'Build Emergency Generator', desc: 'A permanent power plant is built', cost: d.c2, payer: 'budget', choice: 'generator' },
      { label: 'Reduce City Consumption', desc: 'Demand -25%, happiness -10', cost: 0, choice: 'reduce' }]; } },
  recession: { title: '📉 RECESSION', text: function () { return 'Global markets are shrinking. Revenue -15% and companies are hiring less.'; },
    options: function (d) { return [
      { label: 'Stimulus Package', desc: 'Protects jobs, impact halved', cost: d.c, payer: 'budget', choice: 'stimulus' },
      { label: 'Tax Holiday', desc: 'Tax income -50%, happiness +5, impact halved', cost: 0, choice: 'taxcut' },
      { label: 'Wait it out', desc: 'Full impact', cost: 0, choice: 'ignore' }]; } },
  supplycrisis: { title: '🚢 SUPPLY CRISIS', text: function () { return 'Shipping lanes are disrupted. Imports cost 80% more and factories lack parts.'; },
    options: function (d) { return [
      { label: 'Pay Premium Shipping', desc: 'No production loss, imports ×2.2', cost: d.c, payer: 'player', choice: 'premium' },
      { label: 'Ration Goods', desc: 'Production -10% only', cost: 0, choice: 'ration' },
      { label: 'Do Nothing', desc: 'Production -20%', cost: 0, choice: 'ignore' }]; } },
  expo: { title: '🏆 INTERNATIONAL EXPO', text: function () { return 'Your city was invited to host the International Expo!'; },
    options: function (d) { return [
      { label: 'Host the Expo', desc: 'Tourism +60%, revenue +10%, reputation +5', cost: d.c, payer: 'budget', choice: 'host' },
      { label: 'Decline', desc: 'Nothing happens', cost: 0, choice: 'decline' }]; } },
  factoryfire: { title: '🔥 FACTORY FIRE', text: function (d) { const b = MAP.byId.get(d.bid); return (b ? bdef(b).name : 'A factory') + ' is on fire!'; },
    options: function (d) { return [
      { label: 'Emergency Response', desc: 'Extinguish immediately, no damage', cost: d.c, payer: 'budget', choice: 'response' },
      { label: 'Let Firefighters Handle It', desc: 'Normal fire rules apply', cost: 0, choice: 'standard' }]; } },
  investor: { title: '💼 INVESTOR OFFER', text: function (d) { const cd = companyDef(d.cid); return d.name + ' offers ' + money(d.amount) + ' for ' + Math.round(d.stake * 100) + '% of ' + (cd ? cd.name : 'your company') + '.'; },
    options: function (d) { return [
      { label: 'Accept Investment', desc: '+' + money(d.amount) + ', ownership -' + Math.round(d.stake * 100) + '%', cost: 0, choice: 'accept' },
      { label: 'Decline', desc: 'Keep full control', cost: 0, choice: 'decline' }]; } }
};
function createDecision(type, data) {
  const dec = { uid: S.events.nextUid++, type: type, data: data, expires: S.clock.runSec + 60 };
  S.events.decisions.push(dec);
  if (S.events.decisions.length > 5) resolveDecision(S.events.decisions[0].uid, 99, true);
  sfx('event');
  if (!$('modalWrap').classList.contains('show')) showDecision(dec);
  else toast('❓ Decision needed: ' + DECISION_TYPES[type].title + ' (Events tab)', 'gold');
  renderRight();
}
function showDecision(dec) {
  const T = DECISION_TYPES[dec.type], opts = T.options(dec.data);
  let h = '<p style="font-size:14px;line-height:1.45;margin-bottom:10px">' + T.text(dec.data) + '</p>';
  opts.forEach(function (o, k) {
    h += '<button class="card" style="width:100%;text-align:left;display:block;cursor:pointer" data-act="decide" data-uid="' + dec.uid + '" data-v="' + k + '"><h3>' + String.fromCharCode(65 + k) + ') ' + o.label + '</h3><p>' + o.desc + (o.cost ? ' · <b style="color:var(--gold)">Cost: ' + money(o.cost) + (o.payer === 'budget' ? ' (city budget)' : '') + '</b>' : '') + '</p></button>';
  });
  h += '<p class="small">If you do not decide within 60 seconds, the last option is chosen automatically.</p>';
  showModal(T.title, h);
}
function resolveDecision(uid, k, auto) {
  const i = S.events.decisions.findIndex(function (d) { return d.uid === uid; });
  if (i < 0) return;
  const dec = S.events.decisions[i], opts = DECISION_TYPES[dec.type].options(dec.data);
  let o = opts[Math.min(k, opts.length - 1)];
  if (o.cost > 0 && funds(o.payer) < o.cost) {
    if (!auto) { toast('❌ Not enough ' + payerLabel(o.payer), 'bad'); sfx('error'); return; }
    o = opts[opts.length - 1];
  }
  if (o.cost > 0) spend(o.payer, o.cost);
  S.events.decisions.splice(i, 1);
  const t = S.clock.runSec;
  const ev = S.events.active.find(function (a) { return a.kind === 'dyn' && a.id === dec.type; });
  if (ev) ev.choice = o.choice;
  if (dec.type === 'energyshortage' && o.choice === 'generator') placeEmergencyGenerator();
  if (dec.type === 'expo' && o.choice === 'host') { const e = DYN_EVENTS.find(function (x) { return x.id === 'expo'; }); S.events.active.push({ kind: 'dyn', id: 'expo', start: t, ends: t + e.dur, choice: 'host' }); S.city.reputation = Math.min(100, S.city.reputation + 5); }
  if (dec.type === 'factoryfire' && o.choice === 'response') { const b = MAP.byId.get(dec.data.bid); if (b) { b.fire = 0; b._truck = false; } }
  if (dec.type === 'investor' && o.choice === 'accept') {
    const c = S.companies.list[dec.data.cid];
    if (c && c.own - dec.data.stake >= 0.5) { c.own = +(c.own - dec.data.stake).toFixed(2); S.money = Math.min(MONEY_CAP, S.money + dec.data.amount); S.investors.accepted++; notify('💼 Investment accepted: +' + money(dec.data.amount) + '. ' + companyDef(dec.data.cid).name + ' ownership now ' + Math.round(c.own * 100) + '%.', 'gold'); }
  }
  if (dec.type.indexOf('c6_') === 0) applyCrisisChoice(dec.type.slice(3), o.choice);
  notify((auto ? '⏱️ Auto-decision: ' : '✔️ Decision: ') + DECISION_TYPES[dec.type].title + ' → ' + o.label, '');
  if ($('modalWrap').classList.contains('show') && $('modalTitle').textContent === DECISION_TYPES[dec.type].title) closeModal();
  renderRight();
}
function placeEmergencyGenerator() {
  const d = BUILDINGS.powerplant, r = unlockedRect(), c = Math.floor(MAP.W / 2);
  for (let rr = 2; rr < MAP.W; rr++) for (let y = c - rr; y <= c + rr; y++) for (let x = c - rr; x <= c + rr; x++) {
    if (!inUnlocked(x, y) || x < r.x0 || y < r.y0) continue;
    if (canPlace(d, x, y, true).ok) { const b = makeBuilding('powerplant', x, y); b.owner = 'city'; addBuildingToMap(b); onMapChanged(); notify('⚡ Emergency power plant built.', 'good'); return; }
  }
  S.city.emergencyPower += 160; notify('⚡ Emergency generators installed (+160 power).', 'good');
}
function decisionsTick() {
  const t = S.clock.runSec;
  S.events.decisions.slice().forEach(function (d) { if (t >= d.expires) resolveDecision(d.uid, 99, true); });
}
function dynEventsTick() {
  const E = S.events, t = S.clock.runSec;
  if (S.city.population < 200) { if (E.nextDynAt < t + 200) E.nextDynAt = t + 200; return; }
  if (t < E.nextDynAt) return;
  E.nextDynAt = t + RNG.range(260, 560) / difficulty().events;
  const pool = DYN_EVENTS.filter(function (e) {
    if (activeEvent(e.id)) return false;
    if (e.id === 'expo') return S.city.reputation >= 45 && S.city.population >= 1500;
    if (e.id === 'factoryfire') return S.buildings.list.some(function (b) { return b.built && bdef(b).cat === 'Industry' && !b.fire; });
    return true;
  });
  if (pool.length) startDynEvent(RNG.pick(pool));
}
function startDynEvent(ev) {
  const t = S.clock.runSec;
  if (ev.id === 'flood') { startDisaster(DISASTERS.find(function (x) { return x.id === 'flood'; })); return; }
  let data = {};
  if (ev.id === 'energyshortage') data = { c1: scaledCost(500000), c2: scaledCost(750000) };
  if (ev.id === 'recession') data = { c: scaledCost(400000) };
  if (ev.id === 'supplycrisis') data = { c: scaledCost(300000) };
  if (ev.id === 'expo') data = { c: scaledCost(600000) };
  if (ev.id === 'factoryfire') {
    const b = pick(S.buildings.list.filter(function (x) { return x.built && bdef(x).cat === 'Industry' && !x.fire; }));
    if (!b) return; igniteBuilding(b); data = { bid: b.id, c: scaledCost(100000) };
  }
  if (ev.id !== 'expo' && ev.id !== 'factoryfire') S.events.active.push({ kind: 'dyn', id: ev.id, start: t, ends: t + ev.dur, choice: '' });
  notify(ev.icon + ' ' + ev.name.toUpperCase() + ' — ' + ev.desc, ev.good ? 'gold' : 'bad');
  if (!ev.decision) { flashBig(ev.icon + ' ' + ev.name.toUpperCase()); sfx('event'); }
  else createDecision(ev.id, data);
}

/* --- Space program ---------------------------------------------------------------- */
function spaceCost(st) { const f = 1 - 0.1 * ppLevel('spacecost'); return { rp: Math.round(st.rp * f), money: Math.round(st.cost * f * costMult()) }; }
function launchSpace() {
  if (!landmarkBuilt('spacecenter')) { toast('🚀 Build and operate the Space Center first', 'bad'); sfx('error'); return; }
  const stage = S.space.stage; if (stage >= SPACE_STAGES.length) return;
  const st = SPACE_STAGES[stage], c = spaceCost(st);
  if (S.research.rp < c.rp) { toast('❌ Need ' + fmt(c.rp) + ' RP', 'bad'); sfx('error'); return; }
  if (S.budget < c.money) { toast('❌ Need ' + money(c.money) + ' city budget', 'bad'); sfx('error'); return; }
  S.research.rp -= c.rp; S.budget -= c.money; S.space.stage++;
  const sc = S.buildings.list.find(function (b) { return b.type === 'spacecenter'; });
  if (sc) { const p = buildingCenter(sc); FX.rocket = { x: p.x + 20, y: p.y - 40, t: 0 }; }
  notify('🚀 ' + st.name + ' mission successful! ' + st.desc, 'gold'); flashBig(st.icon + ' ' + st.name.toUpperCase()); shake(6); sfx('levelup');
}

/* --- City Hall helpers -------------------------------------------------------------- */
function transferToBudget(frac) {
  const amt = Math.floor(S.money * frac);
  if (amt <= 0) { toast('No money to transfer', 'bad'); return; }
  S.money -= amt; S.budget = Math.min(MONEY_CAP, S.budget + amt);
  toast('🏛️ Transferred ' + money(amt) + ' to the city budget', 'good'); sfx('money');
}
function renameCity(name) {
  name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 32);
  if (!name) return;
  S.city.name = name; toast('🏙️ City renamed to ' + name, 'good'); refreshTopbar();
}
function part4Tick(dt) { contractsTick(dt); investorsTick(); diplomacyTick(dt); dynEventsTick(); decisionsTick(); }
