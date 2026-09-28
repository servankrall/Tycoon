'use strict';
/* BLOCK CITY TYCOON — ECONOMY SIM — supply/demand, labor, power, water, research, technology */
/* ============================ 5. ECONOMY SIM ============================ */
function gameHour() { return (S.clock.gameSec / 3600) % 24; }
function gameDay() { return Math.floor(S.clock.gameSec / 86400) + 1; }
function seasonIndex() { return Math.floor((gameDay() - 1) / SEASON_DAYS) % 4; }
function currentSeason() { return SEASONS[seasonIndex()]; }
function cityTier() { let t = CITY_TIERS[0]; CITY_TIERS.forEach(function (c) { if (S.city.population >= c.pop) t = c; }); return t; }
function companyDef(id) { for (let i = 0; i < COMPANY_DEFS.length; i++) if (COMPANY_DEFS[i].id === id) return COMPANY_DEFS[i]; return null; }
function foundedCompanies() { return Object.keys(S.companies.list).length; }
function maxCompanyLevel() { let m = 0; for (const k in S.companies.list) m = Math.max(m, S.companies.list[k].level); return m; }
function companyForSector(sec) { for (let i = 0; i < COMPANY_DEFS.length; i++) if (COMPANY_DEFS[i].sectors.indexOf(sec) >= 0 && S.companies.list[COMPANY_DEFS[i].id]) return COMPANY_DEFS[i].id; return null; }
function difficulty() { return DIFFICULTIES[S.city.difficulty] || DIFFICULTIES.NORMAL; }
function cityLevel() { let l = 1; for (let i = 0; i < CITY_LEVEL_POP.length; i++) if (S.city.peakPop >= CITY_LEVEL_POP[i]) l = i + 1; return Math.min(20, l); }
function cityLevelName(l) { return CITY_LEVEL_NAMES[clamp((l || cityLevel()) - 1, 0, 19)]; }
function isGlobalMetropolis() { return cityLevel() >= 20; }
function companyRevMult(cid) {
  const c = S.companies.list[cid]; if (!c) return 1;
  let m = 1 + 0.04 * (c.level - 1) + 0.10 * Math.min(c.products, 3) + (c.products >= 4 ? 0.2 : 0);
  if (c.level >= 5) m += 0.10;
  if (c.level >= 10) m += 0.25;
  if (S.p6 && S.p6.mega.global[cid]) m *= 1.2;
  if (S.p6 && megaDone('exchange')) m *= 1.15;
  return m;
}
function activeEvent(id) { const a = S.events.active; for (let i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function landmarkBuilt(id) { const l = S.buildings.list; for (let i = 0; i < l.length; i++) if (l[i].type === id && l[i].built && l[i]._op) return true; return false; }
function salaryPolicy() {
  return ({ low: { sal: 0.8, eff: 0.9, hap: -5 }, normal: { sal: 1, eff: 1, hap: 0 }, high: { sal: 1.25, eff: 1.1, hap: 5 } })[S.workers.salaryPolicy];
}
/* Staff efficiency curve: fewer workers → efficiency drops; extra workers → up to +50% */
function workerEff(d, actual) {
  if (!d.workers) return 1;
  const r = actual / d.workers;
  if (r <= 1) return Math.pow(Math.max(0, r), 0.8);
  const extraMax = d.maxW / d.workers - 1;
  return 1 + 0.5 * (extraMax > 0 ? Math.min(1, (r - 1) / extraMax) : 0);
}
/* Supply/demand → sales multiplier. Oversupply sells less, undersupply sells at a premium. */
function saleMultFromRatio(r) { return r < 1 ? Math.max(0.2, r) : Math.min(1.5, 1 + (r - 1) * 0.5); }
function todCurve(hour, peaks, width) {
  let m = 0.78;
  peaks.forEach(function (p) { const dd = Math.min(Math.abs(hour - p), 24 - Math.abs(hour - p)); m = Math.max(m, 0.78 + 0.47 * Math.exp(-(dd * dd) / (2 * width * width))); });
  return m;
}
/* Aggregated global modifiers from techs, prestige, landmarks, crises & events */
function globalMods() {
  const m = { rev: 1, tour: 1, hap: 0, growth: 1, rp: 1, tax: 1, electricity: 1, production: 1, eventCost: 1 };
  const warn = hasTech('d_warning') ? 0.5 : 1;
  m.rev *= 1 + 0.10 * ppLevel('income');
  if (S.meta.crown) m.rev *= 1.10;
  if (hasTech('b_global')) m.rev *= 1.15;
  m.growth *= 1 + 0.05 * ppLevel('growth');
  m.rp *= 1 + 0.05 * ppLevel('research');
  m.tax *= 1 + 0.05 * ppLevel('tax');
  S.buildings.list.forEach(function (b) {
    const d = bdef(b);
    if (!d.bonus || !b._op) return;
    if (d.bonus.rev) m.rev *= 1 + d.bonus.rev;
    if (d.bonus.tour) m.tour *= 1 + d.bonus.tour;
    if (d.bonus.hap) m.hap += d.bonus.hap;
    if (d.bonus.tax) m.tax *= 1 + d.bonus.tax;
    if (d.bonus.rp) m.rp *= 1 + d.bonus.rp;
    if (d.bonus.growth) m.growth *= 1 + d.bonus.growth;
    if (d.bonus.event) m.eventCost *= 1 - d.bonus.event;
  });
  if (landmarkBuilt('airport')) { m.rev *= 1.10; m.tour *= 1.8; m.growth *= 1.25; }
  // Part 4: difficulty, space program, reputation, dynamic events
  m.rev *= difficulty().income;
  m.importMult = 1; m.powerProd = 1; m.powerDemand = 1; m.taxHoliday = 1; m.jobs = 1; m.mitigation = 0; m.repBonus = 0;
  const sb = 1 + 0.1 * ppLevel('spacebonus');
  if (S.space.stage >= 1) { m.rp *= 1 + 0.1 * sb; m.mitigation += 0.1 * sb; }
  if (S.space.stage >= 2) { m.rev *= 1 + 0.15 * sb; m.repBonus += 5; }
  if (S.space.stage >= 4) { m.rev *= 1 + 0.25 * sb; m.tour *= 1.2; m.repBonus += 10; }
  if (isGlobalMetropolis()) m.rev *= 1.1;
  S.events.active.forEach(function (a) {
    if (a.kind !== 'dyn') return;
    if (a.id === 'boom') { m.rev *= 1.15; m.growth *= 1.2; }
    if (a.id === 'recession') { m.rev *= a.choice === 'stimulus' || a.choice === 'taxcut' ? 0.93 : 0.85; m.jobs *= a.choice === 'stimulus' ? 1 : 0.9; if (a.choice === 'taxcut') { m.taxHoliday = 0.5; m.hap += 5; } }
    if (a.id === 'supplycrisis') { m.importMult *= a.choice === 'premium' ? 2.2 : 1.8; m.production *= a.choice === 'premium' ? 1 : (a.choice === 'ration' ? 0.9 : 0.8); }
    if (a.id === 'energyshortage') { m.powerProd *= a.choice === 'import' ? 1 : 0.75; if (a.choice === 'reduce') { m.powerDemand *= 0.75; m.hap -= 10; } }
    if (a.id === 'expo' && a.choice === 'host') { m.tour *= 1.6; m.rev *= 1.1; m.hap += 4; }
    if (a.id === 'megafest') { m.tour *= 1.4; m.hap += 10; }
  });
  S.events.active.forEach(function (a) {
    if (a.id === 'crash') m.rev *= 1 - 0.2 * warn;
    if (a.id === 'energy') m.electricity *= 1 + 0.5 * warn;
    if (a.id === 'shortage') m.production *= 1 - 0.3 * warn;
    if (a.kind === 'global') {
      const g = GLOBAL_EVENTS.find(function (x) { return x.id === a.id; });
      m.rev *= 1 + g.rev; m.tour *= 1 + g.tour; m.hap += g.hap; m.growth *= 1.1;
    }
  });
  if (hasTech('c_tourism')) m.tour *= 1.25;
  part5Mods(m);
  part6Mods(m);
  return m;
}

/* Clear derived values when a new city starts (prestige, NG+, reset, import) */
function resetSim() {
  SIM.traffic = 0; SIM.unpaid = 0; SIM.dDisp = {}; SIM.sDisp = {}; SIM.flood = false; SIM.visualStopRatio = 0; SIM.goodsRatioSmooth = 1;
  UI.advice = null; UI.idleTimer = 0;
}
/* econTick() lives in the Part 4 Economy system (see 5b. ECONOMY SYSTEM) */
function companyXpFor(L) { return 1500 * (Math.pow(3, L - 1) - 1) / 2; }
function companyTitle(L) { let t = COMPANY_TITLES[0][1]; COMPANY_TITLES.forEach(function (x) { if (L >= x[0]) t = x[1]; }); return t; }

/* Loan repayment (installments). Missed payments hurt credit score. */
function bankTick(dt) {
  const loans = S.bank.loans;
  for (let i = loans.length - 1; i >= 0; i--) {
    const l = loans[i];
    const pay = Math.min(l.perSec * dt, l.remaining);
    if (S.money >= pay) { S.money -= pay; l.remaining -= pay; }
    else { l.remaining *= 1.0005; S.bank.credit = Math.max(0, S.bank.credit - 0.15); }
    if (l.remaining <= 0.01) {
      loans.splice(i, 1); S.bank.repaid++; S.bank.credit = Math.min(100, S.bank.credit + 6);
      notify('🏦 Loan of ' + money(l.principal) + ' fully repaid! Credit score improved.', 'good');
      sfx('achievement');
    }
  }
}
function creditLimit() {
  let assets = 0; S.buildings.list.forEach(function (b) { if (b.built) assets += bdef(b).cost * lvlMult(b.level); });
  const debt = S.bank.loans.reduce(function (a, l) { return a + l.remaining; }, 0);
  return Math.max(0, (2000 + assets * 0.6 + Math.max(0, SIM.net) * 600) * (0.5 + S.bank.credit / 100) - debt);
}
/* Loan rates follow the central bank interest rate (Part 5) */
function loanRate(o) { return Math.max(0.01, o.rate + (interestRate() - 0.05) - (hasTech('b_finance') ? 0.01 : 0) + (S.bank.credit < 40 ? 0.03 : 0)); }
function takeLoan(k) {
  const o = LOAN_OFFERS[k];
  if (!o) return;
  if (activeChallenge() && activeChallenge().noLoans) { toast('🚫 No loans in the POOR CITY challenge', 'bad'); sfx('error'); return; }
  if (S.bank.loans.length >= 5) { toast('❌ Too many active loans (max 5)', 'bad'); sfx('error'); return; }
  if (o.amt > creditLimit()) { toast('❌ Credit limit too low', 'bad'); sfx('error'); return; }
  const rate = loanRate(o);
  const total = o.amt * (1 + rate);
  S.bank.loans.push({ id: S.bank.nextId++, principal: o.amt, total: total, remaining: total, perSec: total / o.term, rate: rate });
  S.money += o.amt;
  toast('🏦 Loan approved: +' + money(o.amt) + ' (repay ' + money(total) + ')', 'gold');
  sfx('money');
}
function repayLoan(id) {
  const l = S.bank.loans.find(function (x) { return x.id === id; });
  if (!l) return;
  if (S.money < l.remaining) { toast('❌ Not enough money to repay', 'bad'); sfx('error'); return; }
  S.money -= l.remaining; l.remaining = 0; bankTick(0);
}

/* --- Stock market simulation (virtual, in-game only) ------------------------- */
function stockTick(dt) {
  const crash = !!activeEvent('crash');
  for (const cid in S.companies.list) {
    const c = S.companies.list[cid], cs = SIM.companies[cid] || { profit: 0, assets: 0 };
    const fundamental = Math.max(0.05, (Math.max(0, cs.profit) * 3600 + cs.assets * 0.5 + c.level * 50000) / SHARES_TOTAL * (crash ? 0.7 : 1));
    c.price = Math.max(0.1, c.price + (fundamental - c.price) * 0.03 * dt + c.price * gauss() * 0.012 * Math.sqrt(dt));
  }
  NPC_STOCKS.forEach(function (s) {
    const st = S.companies.stocks[s.id];
    const sec = s.link;
    const trend = SIM.saleMult[sec] !== undefined ? (SIM.saleMult[sec] - 1) * 0.0003 : 0;
    const target = s.base * (1 + Math.log10(1 + S.city.population) / 6);
    st.price = Math.max(0.5, st.price * (1 + gauss() * s.vol * 0.5 * Math.sqrt(dt) + trend * dt + (crash ? -0.003 * dt : 0)) + (target - st.price) * 0.006 * dt);
  });
}
function recordStockHistory() {
  for (const cid in S.companies.list) { const c = S.companies.list[cid]; c.hist.push(+c.price.toFixed(3)); if (c.hist.length > 120) c.hist.shift(); }
  NPC_STOCKS.forEach(function (s) { const st = S.companies.stocks[s.id]; st.hist.push(+st.price.toFixed(3)); if (st.hist.length > 120) st.hist.shift(); });
}
function foundCompany(id) {
  const cd = companyDef(id); if (!cd || S.companies.list[id]) return;
  const cost = Math.round(cd.cost * costMult());
  if (S.money < cost) { toast('❌ Not enough money', 'bad'); sfx('error'); return; }
  S.money -= cost;
  S.companies.list[id] = { level: 1, xp: 0, own: 1, price: 1, hist: [1], products: 0, founded: Date.now() };
  notify('🏢 ' + cd.name + ' founded! All ' + cd.sectors.join('/') + ' buildings now belong to it.', 'gold');
  flashBig(cd.icon + ' ' + cd.name);
  sfx('levelup');
}
function productCost(cd, k) { return Math.round(cd.cost * [2, 8, 30, 120][k] * costMult()); }
function launchProduct(id) {
  const cd = companyDef(id), c = S.companies.list[id]; if (!c) return;
  const k = c.products; if (k >= 4) return;
  if (c.level < PRODUCT_LEVELS[k]) { toast('Requires company Level ' + PRODUCT_LEVELS[k], 'bad'); sfx('error'); return; }
  const cost = productCost(cd, k);
  if (S.money < cost) { toast('❌ Not enough money', 'bad'); sfx('error'); return; }
  S.money -= cost; c.products++;
  notify('🚀 ' + cd.name + ' launched "' + cd.products[k] + '"! Revenue boosted.', 'gold');
  sfx('achievement');
}
function tradeOwnShares(id, sell) {
  const c = S.companies.list[id]; if (!c) return;
  const chunk = 0.05, val = c.price * SHARES_TOTAL * chunk;
  if (sell) {
    if (c.own - chunk < 0.5 - 1e-9) { toast('You must keep at least 51% control', 'bad'); sfx('error'); return; }
    c.own = +(c.own - chunk).toFixed(2); S.money += val * 0.98; c.price *= 0.985;
    toast('📉 Sold 5% of ' + companyDef(id).name + ' for ' + money(val * 0.98), 'gold'); sfx('money');
  } else {
    if (c.own >= 1) return;
    const cost = val * 1.02;
    if (S.money < cost) { toast('❌ Not enough money', 'bad'); sfx('error'); return; }
    S.money -= cost; c.own = Math.min(1, +(c.own + chunk).toFixed(2)); c.price *= 1.015;
    toast('📈 Bought back 5% of ' + companyDef(id).name, 'good'); sfx('money');
  }
}
function tradeStock(id, qty) {
  const st = S.companies.stocks[id]; if (!st) return;
  const pf = S.companies.portfolio[id] || { qty: 0, cost: 0 };
  if (qty > 0) {
    const cost = st.price * qty * 1.005;
    if (S.money < cost) { toast('❌ Not enough money', 'bad'); sfx('error'); return; }
    S.money -= cost; pf.qty += qty; pf.cost += cost;
    st.price *= 1 + 0.00002 * qty;
    sfx('money');
  } else {
    const q = Math.min(pf.qty, -qty); if (q <= 0) return;
    const val = st.price * q * 0.995;
    const basis = pf.qty > 0 ? pf.cost * q / pf.qty : 0;
    S.money += val; pf.qty -= q; pf.cost -= basis;
    S.companies.tradeProfit += val - basis;
    st.price *= 1 - 0.00002 * q;
    sfx('money');
  }
  if (pf.qty > 0) S.companies.portfolio[id] = pf; else delete S.companies.portfolio[id];
}
function portfolioValue() { let v = 0; for (const id in S.companies.portfolio) v += S.companies.portfolio[id].qty * S.companies.stocks[id].price; return v; }

/* --- Research ------------------------------------------------------------------ */
function techState(t) {
  if (hasTech(t.id)) return 'done';
  if (t.ng && S.meta.ngLevel < t.ng) return 'locked';
  return t.req.every(hasTech) ? 'avail' : 'locked';
}
function techCost(t) { return Math.round(t.cost * (1 - 0.05 * ppLevel('techcost'))); }
/* Tech Tree 2.0: every technology also costs money and needs a city level */
function techMoney(t) { return Math.round((t.money !== undefined ? t.money : t.cost * 30) * costMult() * (1 - 0.05 * ppLevel('techcost'))); }
function techLevelReq(t) { if (t.level) return t.level; const c = t.cost; return c < 60 ? 1 : c < 150 ? 2 : c < 300 ? 3 : c < 700 ? 5 : c < 1500 ? 8 : c < 3000 ? 11 : 14; }
function researchTech(id) {
  const t = TECHS[id]; if (!t) return;
  if (techState(t) !== 'avail') { toast('🔒 Prerequisites missing', 'bad'); sfx('error'); return; }
  if (S.research.rp < techCost(t)) { toast('❌ Not enough Research Points', 'bad'); sfx('error'); return; }
  if (cityLevel() < techLevelReq(t) && !S.city.sandbox) { toast('🔒 Requires City Level ' + techLevelReq(t), 'bad'); sfx('error'); return; }
  if (S.money < techMoney(t) && !S.city.sandbox) { toast('❌ Research also costs ' + money(techMoney(t)), 'bad'); sfx('error'); return; }
  if (!S.city.sandbox) S.money -= techMoney(t);
  S.research.rp -= techCost(t);
  S.technology.unlocked.push(id);
  notify('🔬 Researched: ' + t.name + ' — ' + t.desc, 'good');
  sfx('levelup');
  onMapChanged();
}

/* --- Land expansion ---------------------------------------------------------------- */
function expansionCost() { return Math.round((EXPANSION_COSTS[S.city.expansion + 1] || Infinity) * costMult()); }
function expandLand() {
  if (S.city.expansion >= maxExpansionFor(MAP.W)) return;
  const c = expansionCost();
  if (S.budget < c) { toast('❌ Not enough city budget', 'bad'); sfx('error'); return; }
  spend('budget', c); S.city.expansion++;
  MAP.groundDirty = true;
  notify('🗺️ New land unlocked! The city can grow further.', 'gold');
  sfx('levelup'); shake(4);
}

/* --- Prestige 3: CITY LEGACY & New Game+ --------------------------------------------------------- */
function canPrestige() { return S.city.peakPop >= 10000 || S.statistics.run.revenue >= 25e6; }
function prestigeGain(ng) {
  const g = Math.floor(2 * Math.sqrt(S.statistics.run.revenue / 5e6) + S.city.peakPop / 5000);
  return ng ? Math.floor(g * 1.5) + 3 : g;
}
function canNewGamePlus() { return S.quests.mission >= MISSIONS.length; }
function doPrestige(ng) {
  if (ng ? !canNewGamePlus() : !canPrestige()) return;
  const gain = prestigeGain(ng);
  const meta = S.meta;
  meta.pp += gain; meta.prestigeCount++;
  if (ng) {
    meta.ngLevel++;
    if (meta.skins.indexOf('neon') < 0) meta.skins.push('neon');
  }
  const settings = S.settings, ach = S.achievements, totals = S.statistics.totals, slot = S.slot;
  const opts = { name: S.city.name, difficulty: S.city.difficulty, size: [40, 52, 64].indexOf(S.city.size) >= 0 ? S.city.size : (S.city.size === 48 ? 40 : 64), sandbox: S.city.sandbox };
  S = defaultState(meta, settings, ach, totals, opts);
  S.slot = slot;
  resetSim();
  S.tutorial.done = true;
  initMap(true); generateCity(); onMapChanged(); resetAgents();
  CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2;
  selectBuilding(null); closeModal(); closeLeft();
  saveGame(true);
  flashBig(ng ? '♾️ NEW GAME+ ' + meta.ngLevel : '🏛️ CITY LEGACY!<br>+' + gain + ' LP');
  notify(ng ? '♾️ New Game+ started: bigger map, new tech, new landmark, harder economy.' : '🏛️ City Legacy complete! Spend Legacy Points in the Legacy Tree.', 'gold');
  sfx('levelup');
}
function legacyCost(u) { const tier = u.req ? (PRESTIGE_UPGRADES.find(function (x) { return x.id === u.req; }).req ? 3 : 2) : 1; return (ppLevel(u.id) + 1) * tier; }
function buyPPUpgrade(id) {
  const u = PRESTIGE_UPGRADES.find(function (x) { return x.id === id; });
  const lvl = ppLevel(id);
  if (lvl >= u.max) return;
  if (u.req && ppLevel(u.req) < 1) { toast('🔒 Requires ' + PRESTIGE_UPGRADES.find(function (x) { return x.id === u.req; }).name, 'bad'); sfx('error'); return; }
  const cost = legacyCost(u);
  if (S.meta.pp < cost) { toast('❌ Not enough Legacy Points', 'bad'); sfx('error'); return; }
  S.meta.pp -= cost; S.meta.ppUpgrades[id] = lvl + 1;
  sfx('achievement');
}
