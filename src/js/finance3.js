'use strict';
/* BLOCK CITY TYCOON — DEEP ECONOMY (Part 11)
   Trade contracts between companies and partner cities, Company Finance 2.0 (revenue, expenses, profit, debt, assets,
   employees, market share, stock value, inventory, cash, growth), company loans with bankruptcy risk, the bank system
   (deposits, business loans, mortgages, reserves, liquidity, interest margin), interest rate engine (inflation,
   growth, recession, bank liquidity; the 1 % floor stays), mortgages and the housing / rental / commercial markets,
   market prices in $/t, the food network, daily city consumption, economic cycles influenced by the player's decisions,
   City Budget 2.0, a 5-year budget forecast and the FINANCIAL HEALTH index. */

/* ===================================== STATE ===================================== */
function fnNew() {
  return {
    contracts: [], nextCon: 1, conStats: { signed: 0, completed: 0, cancelled: 0, renewed: 0, shortfalls: 0 },
    loans: [], nextLoan: 1, loanStats: { issued: 0, repaid: 0, defaulted: 0 },
    banks: {}, bankStats: { profit: 0, losses: 0 },
    mort: { owners: 0, renters: 0, outstanding: 0, avgPayment: 0, avgPrice: 0, defaults: 0, issued: 0, ownerShare: 0 },
    commercial: { relocations: 0, log: [] },
    cycle: { log: [], push: 0 },
    finHist: [], forecast: null
  };
}
function fnValidate(p) {
  p.contracts = p10Items(p.contracts, 30, { id: 0, co: '', partner: '', partnerName: '', product: '', dir: 'sell', qtyMonth: 0, priceTotal: 0, months: 12, start: 0, delivered: 0, paid: 0, status: 'active', owner: 'ai', renewals: 0 }, function (c) { return !!PRODUCTS[c.product] && ['sell', 'buy'].indexOf(c.dir) >= 0; });
  p.loans = p10Items(p.loans, 60, { id: 0, co: '', bank: 0, principal: 0, rate: 0.06, years: 10, remaining: 0, perSec: 0, start: 0, arrears: 0, kind: 'business' }, function (l) { return l.remaining > 0; });
  for (const id in p.banks) { const b = p.banks[id]; if (!/^\d{1,9}$/.test(id) || !b || typeof b !== 'object') { delete p.banks[id]; continue; } p.banks[id] = p10Merge({ deposits: 0, loans: 0, mortgages: 0, reserves: 0, profit: 0, liquidity: 1 }, b); }
  p.commercial.log = p10Items(p.commercial.log, 12, { t: '', d: 1 });
  p.cycle.log = p10Items(p.cycle.log, 12, { t: '', d: 1 });
  p.finHist = (Array.isArray(p.finHist) ? p.finHist : []).filter(function (x) { return typeof x === 'number'; }).slice(-120);
}
const GAME_MONTH = YEAR_GAME_SEC / 12 / TIME_SCALE;          // sim seconds per game month
const PRICE_PER_TON = 133;                                    // display scale: one product unit ≈ $133 / t at base price

/* ===================================== TRADE CONTRACTS ===================================== */
function contractPartners() {
  return (S.p9 ? S.p9.neighbors.map(function (n) { const d = neighborDef(n.id); return { id: 'n_' + n.id, name: d.name, icon: d.icon, buys: d.imports, sells: d.exports }; }) : []).concat(WORLD_CITIES.map(function (c) { return { id: 'w_' + c.id, name: c.name, icon: c.icon, buys: c.imports, sells: c.exports }; }));
}
function companyLabel(co) { if (co === 'player') return '🧑 Your companies'; const a = aiDef(co); return a ? a.icon + ' ' + a.name : co; }
/* Sign a contract. dir 'sell': the company delivers city stock to the partner; 'buy': the partner delivers to the city */
function signContract(co, partnerId, product, dir, qtyMonth, years, opts) {
  opts = opts || {};
  const P = S.p11, partner = contractPartners().find(function (p) { return p.id === partnerId; });
  if (!partner || !PRODUCTS[product]) return { ok: false, reason: 'Unknown partner or product' };
  if (P.contracts.filter(function (c) { return c.status === 'active'; }).length >= 24) return { ok: false, reason: 'Too many active contracts (24)' };
  const unit = S.economy.prices[product] * (dir === 'sell' ? (partner.buys.indexOf(product) >= 0 ? 1.15 : 0.95) : (partner.sells.indexOf(product) >= 0 ? 0.9 : 1.1));
  const months = clamp(Math.round(years * 12), 3, 120);
  const c = { id: P.nextCon++, co: co, partner: partnerId, partnerName: partner.icon + ' ' + partner.name, product: product, dir: dir, qtyMonth: Math.round(qtyMonth), priceTotal: Math.round(unit * qtyMonth * months), months: months, start: S.clock.runSec, delivered: 0, paid: 0, status: 'active', owner: co === 'player' ? 'player' : 'ai', renewals: 0 };
  P.contracts.push(c); P.conStats.signed++;
  if (!opts.silent) newsAdd('🤝', companyLabel(co).replace(/^\S+ /, '') + ' signs ' + (dir === 'sell' ? 'supply' : 'purchase') + ' contract: ' + PRODUCTS[product].name, fmt(c.qtyMonth) + ' units/month · ' + money(c.priceTotal) + ' · ' + (months / 12).toFixed(1) + ' years · partner ' + partner.name, { cat: 'business', stock: co !== 'player' && S.ai[co] ? { id: co, pct: 0.02 } : null });
  return { ok: true, c: c, msg: 'Contract #' + c.id + ': ' + fmt(c.qtyMonth) + ' ' + PRODUCTS[product].name + '/month for ' + money(c.priceTotal) };
}
function tradeContractsTick(dt) {
  const P = S.p11, now = S.clock.runSec;
  P.contracts.forEach(function (c) {
    if (c.status !== 'active') return;
    const perSec = c.qtyMonth / GAME_MONTH, due = perSec * dt, unit = c.priceTotal / Math.max(1, c.qtyMonth * c.months);
    const inv = S.economy.inventory;
    if (c.dir === 'sell') {
      const got = Math.min(due, inv[c.product] || 0);
      inv[c.product] = (inv[c.product] || 0) - got; c.delivered += got;
      const pay = got * unit; c.paid += pay;
      if (c.owner === 'player') S.money = Math.min(MONEY_CAP, S.money + pay); else if (S.ai[c.co]) S.ai[c.co].cash += pay;
      if (got < due * 0.5) { c.short = (c.short || 0) + dt; if (c.short > GAME_MONTH) { c.short = 0; P.conStats.shortfalls++; const pen = unit * c.qtyMonth * 0.1; if (c.owner === 'player') S.money = Math.max(0, S.money - pen); else if (S.ai[c.co]) S.ai[c.co].cash = Math.max(0, S.ai[c.co].cash - pen); } }
    } else {
      const cost = due * unit, payer = c.owner === 'player' ? S.money : S.ai[c.co] ? S.ai[c.co].cash : 0;
      if (payer >= cost) { if (c.owner === 'player') S.money -= cost; else S.ai[c.co].cash -= cost; inv[c.product] = (inv[c.product] || 0) + due; c.delivered += due; c.paid += cost; }
    }
    const months = (now - c.start) / GAME_MONTH;
    if (months >= c.months) contractEnd(c);
    else if (c.owner === 'ai') {                         // AI cancels when the market moved too far against it
      const mk = S.economy.prices[c.product];
      if (c.dir === 'sell' ? mk > unit * 1.45 : mk < unit * 0.6) { c.status = 'cancelled'; P.conStats.cancelled++; const pen = unit * c.qtyMonth * 0.5; if (S.ai[c.co]) S.ai[c.co].cash = Math.max(0, S.ai[c.co].cash - pen); contractLog('❌ ' + companyLabel(c.co) + ' cancelled contract #' + c.id + ' (market price moved ' + Math.round((mk / unit - 1) * 100) + '%)'); }
    }
  });
  if (P.contracts.length > 30) P.contracts = P.contracts.filter(function (c) { return c.status === 'active'; }).concat(P.contracts.filter(function (c) { return c.status !== 'active'; }).slice(-8)).slice(-30);
  if (p11Every('conAI', 90, dt)) contractAI();
}
function contractEnd(c) {
  const P = S.p11, mk = S.economy.prices[c.product], unit = c.priceTotal / Math.max(1, c.qtyMonth * c.months);
  if (c.owner === 'ai' && Math.abs(mk / unit - 1) < 0.15 && c.renewals < 3 && S.ai[c.co] && !S.ai[c.co].acquired) {
    c.start = S.clock.runSec; c.renewals++; c.delivered = 0; c.paid = 0; c.priceTotal = Math.round(mk * c.qtyMonth * c.months); P.conStats.renewed++;
    contractLog('🔁 ' + companyLabel(c.co) + ' renewed contract #' + c.id + ' (' + PRODUCTS[c.product].name + ')');
  } else { c.status = 'completed'; P.conStats.completed++; }
}
function contractLog(t) { const L = S.p11.commercial.log; L.unshift({ t: t, d: gameDay() }); if (L.length > 12) L.length = 12; }
/* Companies look for contracts: surplus products are sold forward, missing ones are bought */
function contractAI() {
  const sc = SIM.sc; if (!sc || !sc.prod || S.city.population < 800) return;
  const active = S.p11.contracts.filter(function (c) { return c.status === 'active'; });
  if (active.length >= 12) return;
  const ind = AI_DEFS.filter(function (a) { return (a.sectors[0] === 'INDUSTRY' || a.sectors[0] === 'FOOD' || a.sectors[0] === 'SHOPPING') && S.ai[a.id] && !S.ai[a.id].acquired && (S.ai[a.id].count || 0) > 0; });
  if (!ind.length) return;
  const partners = contractPartners();
  PRODUCT_IDS.forEach(function (p) {
    if (active.some(function (c) { return c.product === p; })) return;
    const prod = sc.prod[p] || 0, dem = (sc.dem[p] || 0) + (sc.del[p] || 0) * 0.5;
    const co = ind[Math.floor(Math.random() * ind.length)].id;
    if (prod > dem * 1.4 && prod > 0.2 && Math.random() < 0.3) { const pt = partners.filter(function (x) { return x.buys.indexOf(p) >= 0; }); if (pt.length) signContract(co, pt[0].id, p, 'sell', (prod - dem) * GAME_MONTH * 0.4, 1 + Math.floor(Math.random() * 2)); }
    else if (dem > prod * 1.5 && dem > 0.2 && Math.random() < 0.3) { const pt = partners.filter(function (x) { return x.sells.indexOf(p) >= 0; }); if (pt.length) signContract(co, pt[0].id, p, 'buy', (dem - prod) * GAME_MONTH * 0.4, 1 + Math.floor(Math.random() * 2)); }
  });
}

/* ===================================== BANKS, COMPANY LOANS & DEBT ===================================== */
function bankBuildings() { return S.buildings.list.filter(function (b) { return (b.type === 'bank' || b.type === 'bankhq') && b.built; }); }
function bankPass() {
  const P = S.p11, banks = bankBuildings();
  const D = S.city.population * wageLevel() * 450 * (0.5 + S.city.happiness / 200) + AI_DEFS.reduce(function (a, x) { const st = S.ai[x.id]; return a + (st && !st.acquired ? st.cash * 0.3 : 0); }, 0);
  const capOf = function (b) { const d = bdef(b); return d.cap * lvlMult(b.level) * Math.max(0.2, b._eff || 0); };
  const tot = banks.reduce(function (a, b) { return a + capOf(b); }, 0);
  const loans = P.loans.reduce(function (a, l) { return a + l.remaining; }, 0), mort = P.mort.outstanding;
  // most mortgages are refinanced on the capital market (securitised); banks keep a slice on their own books
  const mortBook = Math.min(mort * 0.05, D * 0.35);
  const out = banks.map(function (b) {
    const k = tot > 0 ? capOf(b) / tot : 0, B = P.banks[b.id] || (P.banks[b.id] = { deposits: 0, loans: 0, mortgages: 0, reserves: 0, profit: 0, liquidity: 1 });
    B.deposits = D * k; B.loans = P.loans.filter(function (l) { return l.bank === b.id; }).reduce(function (a, l) { return a + l.remaining; }, 0); B.mortgages = mortBook * k; B.reserves = B.deposits * 0.1;
    B.liquidity = B.deposits > 0 ? clamp((B.deposits - B.reserves - B.loans - B.mortgages) / B.deposits, -1, 1) : 0;
    return { b: b, name: bdef(b).name + ' #' + b.id, owner: b.owner, B: B };
  });
  for (const id in P.banks) if (!MAP.byId.has(+id)) delete P.banks[id];
  const lend = Math.max(0, D * 0.9 - loans - mortBook);
  return { banks: out, deposits: D, loans: loans, mortgages: mort, mortBook: mortBook, capacity: D * 0.9, available: lend, liquidity: D > 0 ? lend / (D * 0.9) : 0, central: !banks.length };
}
function loanRate3(co) { return Math.max(0.01, interestRate() + 0.01 + (bankBuildings().length ? 0 : 0.02) + bankruptcyRisk(co) * 0.06); }
/* A company borrows from the bank with the most free lending capacity */
function companyBorrow(co, amount, years) {
  const P = S.p11, st = S.ai[co]; if (!st) return { ok: false, reason: 'Unknown company' };
  const B = bankPass(); if (B.available < amount) return { ok: false, reason: 'Banks have only ' + money(B.available) + ' to lend' };
  const bank = B.banks.slice().sort(function (a, b) { return b.B.liquidity - a.B.liquidity; })[0];
  const rate = loanRate3(co), n = (years || 10), secs = n * YEAR_GAME_SEC / TIME_SCALE;
  const r = rate / (YEAR_GAME_SEC / TIME_SCALE), perSec = amount * r / (1 - Math.pow(1 + r, -secs));
  const l = { id: P.nextLoan++, co: co, bank: bank ? bank.b.id : 0, principal: Math.round(amount), rate: rate, years: n, remaining: amount * (1 + rate * n * 0.55), perSec: perSec, start: S.clock.runSec, arrears: 0, kind: 'business' };
  P.loans.push(l); P.loanStats.issued++; st.cash += amount;
  if (S.p10) corpMeta(co).debt = companyDebt(co);
  return { ok: true, l: l, msg: companyLabel(co) + ' borrowed ' + money(amount) + ' at ' + (rate * 100).toFixed(1) + '% for ' + n + ' years' };
}
function companyDebt(co) { return S.p11 ? S.p11.loans.filter(function (l) { return l.co === co; }).reduce(function (a, l) { return a + l.remaining; }, 0) : 0; }
function bankruptcyRisk(co) {
  const st = S.ai[co]; if (!st) return 0;
  const debt = companyDebt(co), assets = (st.assets || 0) + st.cash, arrears = S.p11 ? S.p11.loans.filter(function (l) { return l.co === co; }).reduce(function (a, l) { return a + l.arrears; }, 0) : 0;
  return clamp(debt / Math.max(1, assets) * 0.6 + ((st.profit || 0) < 0 ? 0.25 : 0) + Math.min(0.3, arrears / Math.max(1, debt) * 3), 0, 1);
}
function loansTick(dt) {
  const P = S.p11; let profit = 0;
  P.loans.forEach(function (l) {
    const st = S.ai[l.co]; if (!st) { l.remaining = 0; return; }
    const pay = Math.min(l.perSec * dt, l.remaining);
    if (st.cash >= pay) { st.cash -= pay; l.remaining -= pay; profit += pay * (l.rate - 0.015) / (1 + l.rate); l.arrears = Math.max(0, l.arrears - pay * 0.5); }
    else { l.arrears += pay - st.cash; l.remaining -= st.cash; st.cash = 0; }
    if (l.remaining <= 0.01) P.loanStats.repaid++;
  });
  // banks earn the interest margin; the owner of each bank gets its share
  const banks = bankBuildings();
  if (banks.length && profit > 0) banks.forEach(function (b) { const share = profit / banks.length; if (isAI(b) && S.ai[b.owner]) S.ai[b.owner].cash += share; else if (b.owner === 'player') S.money = Math.min(MONEY_CAP, S.money + share); else S.budget = Math.min(MONEY_CAP, S.budget + share); });
  P.bankStats.profit += profit;
  P.loans = P.loans.filter(function (l) { return l.remaining > 0.01; });
  // bankruptcy: very high risk, no cash, arrears → the existing bankruptcy (re-founding) logic runs, banks write the loans off
  AI_DEFS.slice().forEach(function (a) {
    const st = S.ai[a.id]; if (!st || st.acquired) return;
    const risk = bankruptcyRisk(a.id), m = S.p10 ? corpMeta(a.id) : null;
    if (m) m.debt = companyDebt(a.id);
    st._risk = risk;
    if (risk > 0.9 && st.cash < 1000) { st._riskT = (st._riskT || 0) + dt; if (st._riskT > 120) { st._riskT = 0; const lost = companyDebt(a.id); P.loans = P.loans.filter(function (l) { if (l.co === a.id) { P.loanStats.defaulted++; return false; } return true; }); P.bankStats.losses += lost; if (m) m.debt = 0; if (!a.custom) bankruptCompany(a.id); else if (typeof lwDissolve === 'function') lwDissolve(a.id); newsAdd('📉', a.name + ' collapses under ' + money(lost) + ' of debt', 'Banks write off the loans; bankruptcy risk had reached ' + Math.round(risk * 100) + '%.', { cat: 'business', cls: 'bad' }); } }
    else st._riskT = 0;
  });
}
/* Hook from the interest rate engine: GDP growth and bank liquidity move the target rate (the 1 % floor stays) */
function p11RateAdjust() {
  if (!S.p11 || !S.p10) return 0;
  const g = S.p10.graphs.gdp || [], n = g.length;
  const growth = n > 12 && g[n - 12] > 0 ? g[n - 1] / g[n - 12] - 1 : 0;
  const liq = SIM.p11Liquidity === undefined ? 0.5 : SIM.p11Liquidity;
  return clamp(growth * 0.15, -0.01, 0.015) + (liq < 0.15 ? 0.01 : liq > 0.6 ? -0.005 : 0);
}

/* ===================================== MORTGAGES & HOUSING / RENTAL / COMMERCIAL MARKETS ===================================== */
function mortgagePass() {
  const P = S.p11.mort, H = HH.list || []; if (!H.length) return P;
  const rate = interestRate() + 0.015, n = 25 * 12, r = rate / 12;
  let owners = 0, renters = 0, pay = 0, price = 0, k = 0;
  H.forEach(function (h) {
    const monthlyRent = h.rent * 30, monthlyInc = h.income * 30;
    const p0 = monthlyRent * 12 * 18;                 // price ≈ 18 years of rent
    const loan = p0 * 0.8, pmt = loan * r / (1 - Math.pow(1 + r, -n));
    const savings = monthlyInc * 12 * (h.satisfaction || 50) / 100;
    if (monthlyInc > 0 && pmt <= monthlyInc * 0.35 && savings >= p0 * 0.2) { owners++; pay += pmt; } else renters++;
    price += p0; k++;
  });
  const scale = (HH.stats && HH.stats.total ? HH.stats.total : S.city.population / 2.6) / Math.max(1, k);
  P.owners = Math.round(owners * scale); P.renters = Math.round(renters * scale); P.ownerShare = k ? owners / k : 0;
  P.avgPayment = owners ? pay / owners : 0; P.avgPrice = k ? price / k : 0;
  P.outstanding = P.owners * P.avgPrice * 0.8 * 0.6;
  P.defaults = Math.round(P.owners * (SIM.unemployment || 0) * 0.08);
  P.rate = rate;
  return P;
}
/* Housing price index per district: supply/demand, income, location, transport, services, land value */
function housingMarket() {
  const n = MAP.dN || Math.ceil(MAP.W / 8), cells = {}, base = S.city.housingPrice;
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); const k = Math.floor(b.y / 8) * n + Math.floor(b.x / 8);
    const c = cells[k] || (cells[k] = { cap: 0, occ: 0, lv: 0, lvN: 0, transit: 0, cov: 0, covN: 0, rent: 0, rentN: 0, name: districtName(b.x, b.y) || 'District ' + k, x: b.x, y: b.y });
    if (d.housing && b._op) { c.cap += b._hcap || 0; c.occ += b._cust || 0; c.lv += landRel(b.x, b.y); c.lvN++; c.rent += d.rent * d.unitSize * base * rentMult(b) * SECONDS_PER_MONTH; c.rentN++; if (b._cov) { c.cov += (b._cov.fire + b._cov.police + b._cov.health) / 3; c.covN++; } }
    if (d.transit && b._op) c.transit++;
  });
  const out = [];
  for (const k in cells) {
    const c = cells[k]; if (!c.cap) continue;
    const occ = c.occ / c.cap, lv = c.lvN ? c.lv / c.lvN : 1, sv = c.covN ? c.cov / c.covN : 0.5;
    const idx = base * (0.6 + 0.4 * lv) * (1 + 0.06 * Math.min(4, c.transit)) * (0.9 + 0.2 * sv) * (occ > 0.95 ? 1.12 : occ < 0.8 ? 0.9 : 1);
    out.push({ name: c.name, x: c.x, y: c.y, cap: c.cap, occ: occ, land: lv, transit: c.transit, services: sv, index: idx, price: idx * 300000 / Math.max(0.3, base) * base, rent: c.rentN ? c.rent / c.rentN : 0 });
  }
  return out.sort(function (a, b) { return b.index - a.index; });
}
function rentalByRegion() {
  const R = {}; (HH.list || []).forEach(function (h) { const b = MAP.byId.get(h.home); if (!b) return; const r = regionName(b.x, b.y); const q = R[r] || (R[r] = { rent: 0, n: 0, inc: 0 }); q.rent += h.rent * 30; q.inc += h.income * 30; q.n++; });
  return Object.keys(R).map(function (k) { const q = R[k]; return { region: k, rent: q.rent / q.n, income: q.inc / q.n, share: q.inc > 0 ? q.rent / q.inc : 1, n: q.n }; });
}
/* Commercial market: rent, footfall, competition and demand per district; loss-making stores in expensive districts relocate */
function commercialMarket() {
  const n = MAP.dN || Math.ceil(MAP.W / 8), cells = {};
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!d.rev || !b.built || d.cat !== 'Commercial') return;
    const k = Math.floor(b.y / 8) * n + Math.floor(b.x / 8), c = cells[k] || (cells[k] = { name: districtName(b.x, b.y) || 'District ' + k, stores: 0, foot: 0, rent: 0, profit: 0, sectors: {} });
    c.stores++; c.foot += b._cust || 0; c.rent += landValueTile(b.x, b.y) * d.w * d.h * 0.002; c.profit += (b._rev || 0) - (b._cost || 0); c.sectors[d.sector] = (c.sectors[d.sector] || 0) + 1;
  });
  return Object.keys(cells).map(function (k) { const c = cells[k]; const top = Object.keys(c.sectors).sort(function (a, b) { return c.sectors[b] - c.sectors[a]; })[0]; return { name: c.name, stores: c.stores, foot: c.foot, rent: c.rent / c.stores, profit: c.profit, competition: c.sectors[top] || 0, top: top, demand: top ? (SIM.demand[top] || 0) / Math.max(1, SIM.supply[top] || 0) : 0 }; }).sort(function (a, b) { return b.foot - a.foot; });
}
function commercialTick() {
  const L = S.buildings.list.filter(function (b) { const d = bdef(b); return isAI(b) && b.built && d.rev && d.cat === 'Commercial' && !d.unique; });
  for (let k = 0; k < Math.min(10, L.length); k++) {
    const b = L[Math.floor(Math.random() * L.length)], d = bdef(b), rent = landValueTile(b.x, b.y) * d.w * d.h * 0.002;
    if ((b._rev || 0) >= (b._cost || 0) + rent * 0.5 || (b._cust || 0) > d.cap * 0.25) continue;
    const owner = b.owner, sec = d.sector, a = aiDef(owner); if (!a || !S.ai[owner]) continue;
    const from = districtName(b.x, b.y);
    S.ai[owner].cash += buildingValue(b) * 0.5; removeBuilding(b); requestMapChanged();
    const ok = aiBuild(owner, sec, 2, null);
    S.p11.commercial.relocations++;
    contractLog('🏪 ' + a.name + ' ' + (ok ? 'relocated' : 'closed') + ' its ' + d.name + ' in ' + (from || 'the city') + ' (rent ' + money(rent) + '/s, footfall ' + Math.round(b._cust || 0) + ')');
    return;
  }
}

/* ===================================== MARKET PRICES, FOOD NETWORK & CITY CONSUMPTION ===================================== */
function marketPrices() {
  const sc = SIM.sc || { prod: {}, dem: {}, imp: {} };
  return PRODUCT_IDS.map(function (p) {
    const P = PRODUCTS[p], pr = S.economy.prices[p], sup = (sc.prod[p] || 0) + (sc.imp[p] || 0), dem = (sc.dem[p] || 0);
    return { id: p, icon: P.icon, name: P.name, perTon: pr * PRICE_PER_TON, base: P.base * PRICE_PER_TON, sd: dem > 0 ? sup / dem : 1, infl: priceLevel(), shock: typeof shockPriceMult === 'function' ? shockPriceMult(p) : 1, transport: SV && SV.logi ? 2 - SV.logi.eff : 1, hist: (S.economy.priceHist && S.economy.priceHist[p]) || null };
  });
}
function foodNetwork() {
  const sc = SIM.sc || { prod: {}, dem: {}, del: {} }, day = 86400 / TIME_SCALE, t = 0.05;   // 1 unit ≈ 50 kg
  const farms = S.buildings.list.filter(function (b) { return b._op && (b.type === 'farm' || (b.recipe && ['wheat', 'food'].indexOf(b.recipe) >= 0)); }).length;
  const prodT = ((sc.prod.wheat || 0) + (sc.prod.food || 0) + (sc.prod.bread || 0) + (sc.prod.flour || 0) * 0.5) * day * t;
  const stockT = ((S.economy.inventory.food || 0) + (S.economy.inventory.bread || 0) + (S.economy.inventory.wheat || 0)) * t;
  const needT = (S.city.population * 1.8 + S.city.tourists * 2.2) / 1000;
  const storeRatio = SIM.supply && SIM.demand && SIM.demand.FOOD ? Math.min(1.5, SIM.supply.FOOD / SIM.demand.FOOD) : 1;
  const delT = ((sc.del.food || 0) + (sc.del.bread || 0)) * day * t;
  const security = clamp(Math.min(storeRatio, (prodT + delT + stockT * 0.1) / Math.max(0.01, needT)), 0, 1.5);
  return { farms: farms, prodT: prodT, stockT: stockT, delT: delT, needT: needT, storeRatio: storeRatio, security: security, logistics: SV && SV.logi ? SV.logi.eff : 1, foodPrice: S.economy.prices.food * PRICE_PER_TON };
}
function cityConsumption() {
  const pop = S.city.population, sc = SIM.sc || { dem: {} }, day = 86400 / TIME_SCALE;
  return { foodT: (pop * 1.8 + S.city.tourists * 2.2) / 1000, waterL: (SIM.waterUse || 0) * 1500, powerGWh: (SIM.powerUse || 0) * 24 / 1000, fuelL: ((sc.dem.fuel || 0) * day * 60) + AG.vehicles.length * (S.city.population / Math.max(1, AG.citizens.length)) * 4 };
}

/* ===================================== ECONOMIC CYCLES (player influence) ===================================== */
/* Hook from econCycleTick: the next phase is weighted by unemployment, the budget, interest rates, reputation and investment */
function p11NextPhase(nxt) {
  if (nxt.length === 1) return nxt[0];
  const unemp = SIM.unemployment || 0, bud = (SIM.bNet || 0) >= 0 ? 1 : -1, rate = interestRate(), rep = S.p10 ? S.p10.rep : 500, invest = S.p10 ? S.p10.projects.length : 0;
  const good = (unemp < 0.05 ? 1 : unemp > 0.12 ? -1 : 0) + bud * 0.5 + (rate < 0.04 ? 0.5 : rate > 0.08 ? -0.5 : 0) + (rep > 650 ? 0.5 : rep < 350 ? -0.5 : 0) + Math.min(1, invest * 0.3);
  const w = nxt.map(function (ph) { const g = ph === 'BOOM' || ph === 'NORMAL' || ph === 'RECOVERY' ? 1 : -1; return Math.max(0.1, 1 + good * g * 0.35); });
  const tot = w.reduce(function (a, v) { return a + v; }, 0); let r = Math.random() * tot, pick = nxt[0];
  for (let i = 0; i < nxt.length; i++) { r -= w[i]; if (r <= 0) { pick = nxt[i]; break; } }
  const L = S.p11.cycle.log; L.unshift({ t: (ECON_PHASES[pick] ? ECON_PHASES[pick].icon : '') + ' ' + pick + ' (city indicators ' + (good >= 0 ? '+' : '') + good.toFixed(1) + ')', d: gameDay() }); if (L.length > 12) L.length = 12;
  return pick;
}

/* ===================================== CITY BUDGET 2.0, FORECAST & FINANCIAL HEALTH ===================================== */
const BUDGET_IN = [['taxes', '🧾', 'Taxes'], ['tourism', '🧳', 'Tourism'], ['utilities', '⚡', 'Utilities'], ['transport', '🚇', 'Transport'], ['companies', '🏢', 'Companies'], ['trade', '🚢', 'Trade'], ['property', '🏠', 'Property'], ['other', '➕', 'Other']];
const BUDGET_OUT = [['roads', '🛣️', 'Roads'], ['education', '🎓', 'Education'], ['healthcare', '🏥', 'Healthcare'], ['emergency', '🚒', 'Emergency'], ['utilities', '⚡', 'Utilities'], ['transit', '🚇', 'Transit'], ['maintenance', '🛠️', 'Maintenance'], ['parks', '🌳', 'Parks'], ['other', '➖', 'Other']];
function budget2() {
  const B = SIM.B || {}, BE = SIM.BE || {};
  const inc = { taxes: B.incomeTax || 0, tourism: B.tourism || 0, utilities: (B.utilities || 0) + (B.energy || 0), transport: (B.fares || 0) + Math.max(0, SIM.p11RegionalNet || 0), companies: B.businessTax || 0, trade: SIM.p11TradeFees || 0, property: (B.propertyTax || 0) + (B.rent || 0), other: (B.space || 0) + (B.grant || 0) };
  const out = { roads: BE.roads || 0, education: 0, healthcare: 0, emergency: 0, utilities: BE.fuel || 0, transit: Math.max(0, -(SIM.p11RegionalNet || 0)), maintenance: S.p9 ? clamp(S.p9.maint.budget, 0, 2) * 0.0015 * S.buildings.list.length : 0, parks: 0, other: 0 };
  S.buildings.list.forEach(function (b) {
    if (b.owner !== 'city' || !b.built) return; const d = bdef(b), c = (b._cost || 0) - (d.fuel ? (b._gen || 0) * d.fuel * ((SIM.mods && SIM.mods.electricity) || 1) : 0);
    if (d.edu || d.sector === 'EDUCATION' || d.sector === 'SCIENCE') out.education += c;
    else if (d.service === 'health') out.healthcare += c;
    else if (d.service === 'fire' || d.service === 'police') out.emergency += c;
    else if (d.cat === 'Utilities' || d.cat === 'Waste' || d.power > 0 || d.water > 0) out.utilities += c;
    else if (d.cat === 'Transport') out.transit += c;
    else if (d.hap > 0 || d.cat === 'Leisure') out.parks += c;
    else if (d.id === 'maintdepot') out.maintenance += c;
    else out.other += c;
  });
  let ti = 0, to = 0; for (const k in inc) ti += inc[k]; for (const k in out) to += out[k];
  return { inc: inc, out: out, totalIn: ti, totalOut: to, net: ti - to };
}
function slopeOf(a, n) { if (!a || a.length < 4) return 0; const s = a.slice(-n); const m = s.length; let sx = 0, sy = 0, sxy = 0, sxx = 0; s.forEach(function (y, x) { sx += x; sy += y; sxy += x * y; sxx += x * x; }); const d = m * sxx - sx * sx; return d ? (m * sxy - sx * sy) / d : 0; }
/* 5-year projection from today's balance, the trend of income and expenses (live graphs) and the economic cycle */
function budgetForecast() {
  const G = S.p10 ? S.p10.graphs : {}, net = SIM.bNet || 0, monthSec = GAME_MONTH;
  const sampleSec = 10, slopeIn = slopeOf(G.income, 60) / sampleSec, slopeOut = slopeOf(G.expenses, 60) / sampleSec;   // $/s per sim second
  const pSlope0 = (slopeIn - slopeOut) * 0.25;                                                                        // city budget share of the total trend
  const maxT = Math.max(Math.abs(net), 500) / (60 * monthSec), pSlope = clamp(pSlope0, -maxT, maxT);                   // a trend can at most double or erase today's net within 5 years
  const ph = typeof econPhase === 'function' ? econPhase() : { rev: 1 };
  let bal = S.budget, min = bal; const pts = [bal];
  for (let m = 1; m <= 60; m++) { const t = m * monthSec; const n = (net + pSlope * t) * (ph.rev || 1); bal += n * monthSec; min = Math.min(min, bal); if (m % 12 === 0) pts.push(bal); }
  const vol = Math.abs(pSlope) * 60 * monthSec / Math.max(1, Math.abs(net) + 1);
  const risk = min < 0 ? 'High' : (net < 0 || ph.id === 'RECESSION' || ph.id === 'SLOWDOWN' || vol > 1.5) ? 'Medium' : 'Low';
  const f = { now: S.budget, in5: bal, min: min, yearly: pts, risk: risk, net: net, trend: pSlope };
  S.p11.forecast = { now: Math.round(f.now), in5: Math.round(f.in5), risk: risk, d: gameDay() };
  return f;
}
function financialHealth() {
  const b = budget2(), monthOut = Math.max(1, b.totalOut * GAME_MONTH), reserves = S.budget / monthOut;
  const debt = (S.bank ? S.bank.loans.reduce(function (a, l) { return a + l.remaining; }, 0) : 0), yearIn = Math.max(1, (b.totalIn + (SIM.pInc || 0)) * GAME_MONTH * 12);
  const g = S.p10 && S.p10.graphs.gdp ? S.p10.graphs.gdp : [], growth = g.length > 12 && g[g.length - 12] > 0 ? g[g.length - 1] / g[g.length - 12] - 1 : 0;
  const top = Math.max.apply(null, Object.keys(b.inc).map(function (k) { return b.inc[k]; }).concat([0])) / Math.max(1e-6, b.totalIn);
  const parts = { reserves: clamp(reserves / 6, 0, 1) * 30, balance: clamp(0.5 + b.net / Math.max(1, b.totalIn), 0, 1) * 25, debt: clamp(1 - debt / yearIn, 0, 1) * 20, growth: clamp(0.5 + growth * 5, 0, 1) * 15, diversity: clamp(1.4 - top, 0, 1) * 10 };
  let s = 0; for (const k in parts) s += parts[k];
  return { score: Math.round(s), parts: parts, reserves: reserves, debt: debt, growth: growth };
}
function financeTick(dt) {
  const B = bankPass(); SIM.p11Liquidity = B.liquidity;
  mortgagePass();
  if (p11Every('finHist', 30, dt)) { const h = S.p11.finHist; h.push(financialHealth().score); if (h.length > 120) h.shift(); }
}
/* Hook from globalMods: home ownership adds stability; mortgage defaults cost confidence */
function financeMods(m) {
  const M = S.p11.mort; if (S.city.population > 500) { m.hap += M.ownerShare * 2 - Math.min(3, M.defaults / Math.max(1, M.owners) * 30); }
  return m;
}
