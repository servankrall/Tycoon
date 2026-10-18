'use strict';
/* BLOCK CITY TYCOON — ECONOMY ENGINE 2.0 (Part 17 · v2.5.0)
   Extends the existing economy (it never replaces it): the supply chain (economy-market.js) still moves goods and sets
   the base prices, Company AI 2.0 (living-world.js) still runs the companies, Part 11 (finance3.js) still runs banks,
   loans and mortgages, Part 5 / 6 still run the cycle, the central-bank rate and the CPI. This layer adds what they
   lacked and ties them together:

   EconomyEngine
   ├── Market / SupplyDemand / Production   per good: supply · demand · production · consumption · import · export ·
   │                                         price, a daily close history (7 d … 25 years) and categories
   ├── Companies                            registry over every company: lifecycle (Startup … Mature, Decline →
   │                                         Restructuring → Bankruptcy), HQ level 1–5, credit score, pricing AI,
   │                                         market-share history, unique brand names (a bankrupt name is never reused)
   ├── Employment / Salaries                vacancies, workers, average salary / income, salary pressure, levels
   ├── Housing / Rental                     per-district price, rent, vacancy, affordability, housing crisis
   ├── Banking / Credit / CentralBank       banks overview, loan stages Late → Restructuring → Default, credit scores,
   │                                         money supply, emergency liquidity, the 1 % floor
   ├── Inflation / Expectations             per category (food, rent, construction, salary, services, interest)
   ├── EconomicCycles                       Expansion · Peak · Slowdown · Recession · Recovery (mapped on the Part 5 phases)
   ├── Shocks                               8 economic shocks × Minor / Moderate / Major / Severe with policy responses
   ├── Trade / Logistics / Warehouses       per-good trade balance, disruption, warehouse economy
   ├── Taxes / Government                   income · business · property · sales · tourism tax with a revenue forecast
   ├── Stocks                               market index, investor sentiment Bullish … Panic, economic news
   └── GDP / Forecast                       GDP by sector, GDP per capita, trade balance, daily history

   Ticks follow the fixed-timestep architecture: part17Tick runs once per simulated second (Game.simSystems) and only
   does work when a game hour (hourly: market, jobs, housing, a batch of companies) or a game day (daily: closes,
   company financials, cycle, shocks, GDP, history) has passed. Nothing runs per frame. Random choices use a seeded
   stream (city seed + day), so the same city and the same state give the same economy. */

const E2 = { hourKey: -1, dayKey: -1, prof: { hour: 0, day: 0, n: 0 }, rr: 0, keys: null, keysAt: -1, dirtyUi: 0 };
const E2_HIST = 240;                                   // daily samples: 1 game year = 8 days → 240 days = 30 years
const E2_CATS = ['Food', 'Materials', 'Energy', 'Technology', 'Transport', 'Consumer Goods', 'Services'];
/* id: [display name, category, derived base price (only for goods that are not in the supply chain)] */
const E2_GOODS = {
  wheat: ['Wheat', 'Food'], flour: ['Flour', 'Food'], bread: ['Bread', 'Food'], food: ['Food', 'Food'],
  iron: ['Iron Ore', 'Materials'], coal: ['Coal', 'Materials'], wood: ['Wood', 'Materials'], metal: ['Metal', 'Materials'], materials: ['Construction Materials', 'Materials'], rare: ['Rare Earths', 'Materials'],
  oil: ['Crude Oil', 'Energy'], fuel: ['Fuel', 'Energy'], electricity: ['Electricity', 'Energy', 0.15],
  electronics: ['Electronics', 'Technology'], technology: ['Technology Services', 'Technology', 48],
  vehicles: ['Vehicles', 'Transport'], clothing: ['Clothing', 'Consumer Goods', 18], medicine: ['Medicine', 'Services', 26]
};
const E2_STAGES = ['Startup', 'Growth', 'Established', 'Expansion', 'Mature', 'Decline', 'Restructuring', 'Bankruptcy'];
const E2_SECTOR_TYPE = { FOOD: 'Restaurant', SHOPPING: 'Retail', TECHNOLOGY: 'Technology', FINANCE: 'Finance', ENTERTAINMENT: 'Entertainment', INDUSTRY: 'Factory', HOUSING: 'Construction', ENERGY: 'Energy', TRANSPORT: 'Transport', HEALTH: 'Healthcare', TOURISM: 'Tourism', LOGISTICS: 'Logistics', BAKERY: 'Bakery', BANK: 'Bank' };
const E2_BRAND = {
  pre: ['NOVA', 'BLOCK', 'URBAN', 'METRO', 'PRIME', 'GOLDEN', 'FRESH', 'SUMMIT', 'HARBOR', 'SKY', 'ORBIT', 'MAPLE', 'RIVER', 'CRYSTAL', 'IRON', 'SILVER', 'BRIGHT', 'PIXEL', 'COASTAL', 'NORTH', 'APEX', 'VERTEX', 'LUNAR', 'EMBER'],
  suf: { FOOD: ['FOODS', 'KITCHEN', 'EATS', 'BAKERY', 'GRILL'], SHOPPING: ['MART', 'MARKET', 'STORES', 'RETAIL', 'OUTLET'], TECHNOLOGY: ['TECH', 'SYSTEMS', 'LABS', 'DIGITAL', 'SOFT'], FINANCE: ['BANK', 'CAPITAL', 'TRUST', 'FINANCE', 'INVEST'], ENTERTAINMENT: ['STUDIOS', 'ARENA', 'MEDIA', 'FUN', 'PLAY'], INDUSTRY: ['WORKS', 'INDUSTRIES', 'STEEL', 'FABRICATION', 'MOTORS'], HOUSING: ['HOMES', 'LIVING', 'ESTATES', 'REALTY', 'BUILDERS'], LOGISTICS: ['LOGISTICS', 'FREIGHT', 'TRANSIT'] }
};
/* economic shocks: price effects on goods, modifiers, how a city can respond (never a reset of the player's money) */
const E2_SHOCKS = {
  energy: { name: 'Energy Price Shock', icon: '⚡', goods: { oil: 0.45, fuel: 0.4, electricity: 0.35 }, mods: { rev: -0.03 }, resp: [['subsidy', '💸 Fuel subsidy', 'halves the price rise · budget 1.5 %/day'], ['ration', '🔌 Save energy', 'demand −10 %, happiness −3']] },
  food: { name: 'Food Shortage', icon: '🌾', goods: { wheat: 0.5, flour: 0.4, bread: 0.35, food: 0.3 }, mods: { hap: -3 }, resp: [['imports', '🚢 Emergency imports', 'prices −60 % of the shock · budget 1 %/day'], ['ration', '🍞 Rationing', 'happiness −5, prices −30 %']] },
  banking: { name: 'Banking Crisis', icon: '🏦', goods: {}, mods: { rev: -0.05, growth: -0.15 }, resp: [['liquidity', '💧 Emergency liquidity', 'central bank supports the banks · budget 1 %/day'], ['guarantee', '🛡️ Deposit guarantee', 'sentiment recovers faster, happiness +2']] },
  bubble: { name: 'Housing Bubble', icon: '🏠', goods: {}, mods: { hap: -2 }, housing: 0.18, resp: [['cool', '🧊 Cool the market', 'rents −8 %, construction −5 %'], ['build', '🏗️ Build more homes', 'zoning boost, construction +10 %']] },
  techboom: { name: 'Technology Boom', icon: '💡', goods: { electronics: 0.2, technology: 0.25 }, mods: { rev: 0.06, growth: 0.1 }, good: true, resp: [['invest', '🚀 Invest in tech', 'research +15 % · budget 1 %/day'], ['tax', '🧾 Tax the gains', 'business tax +2 points while it lasts']] },
  crash: { name: 'Market Crash', icon: '📉', goods: {}, mods: { rev: -0.04, growth: -0.1 }, stock: -0.22, resp: [['calm', '📣 Calm the markets', 'sentiment recovers faster · budget 0.5 %/day'], ['wait', '⏳ Let it play out', 'no cost, slower recovery']] },
  trade: { name: 'Trade Disruption', icon: '🚧', goods: { electronics: 0.25, vehicles: 0.2, materials: 0.15, metal: 0.15 }, mods: { importMult: 0.6 }, resp: [['reroute', '🛤️ Reroute freight', 'delays −50 % · budget 1 %/day'], ['local', '🏭 Buy local', 'local production +10 %, prices +5 %']] },
  construction: { name: 'Construction Boom', icon: '🏗️', goods: { materials: 0.3, metal: 0.2, wood: 0.2 }, mods: { growth: 0.12, jobs: 0.04 }, good: true, resp: [['permits', '📋 Fast permits', 'growth +5 %'], ['cool', '🧊 Slow it down', 'material prices −40 % of the shock']] }
};
const E2_SEV = ['Minor', 'Moderate', 'Major', 'Severe'], E2_SEV_K = [0.35, 0.6, 0.85, 1.15];
const E2_SENTIMENT = [['Panic', 0.82], ['Bearish', 0.92], ['Cautious', 0.97], ['Neutral', 1], ['Optimistic', 1.03], ['Bullish', 1.08]];
const E2_TAXES = [['income', 'Income Tax', 0, 30], ['business', 'Business Tax', 0, 30], ['property', 'Property Tax', 0, 4], ['sales', 'Sales Tax', 0, 15], ['tourism', 'Tourism Tax', 0, 25]];

/* ---------------------------------------- state ---------------------------------------- */
function newP17() {
  const goods = {};
  Object.keys(E2_GOODS).forEach(function (id) { goods[id] = { p: 0, y: 0, h: [], today: { prod: 0, cons: 0, imp: 0, exp: 0 }, last: { prod: 0, cons: 0, imp: 0, exp: 0 } }; });
  return {
    v: 1, day: 0, goods: goods, co: {}, names: { retired: [] },
    jobs: { vac: 0, workers: 0, unemp: 0, salary: 0, income: 0, level: 'Healthy', pressure: 0 },
    housing: { price: 0, rent: 0, vacancy: 0, afford: 0, affordClass: 'Affordable', crisis: 0, crisisDays: 0, districts: [] },
    bank: { cb: { ms: 100, liqUntil: 0, liqTotal: 0 }, citizenScore: 700, loanStages: { current: 0, late: 0, restructuring: 0, default: 0 } },
    infl: { exp: 0.02, cat: { food: 0, rent: 0, construction: 0, salary: 0, services: 0, interest: 0 }, base: null },
    shocks: [], shockLog: [], sentiment: 'Neutral', sentScore: 0,
    tax: null,                                           // created on first tick from the city's current income tax
    gdp: { total: 0, perCap: 0, growth: 0, sectors: {}, trade: 0 },
    hist: { gdp: [], infl: [], unemp: [], house: [], rent: [], stock: [], trade: [], pop: [], salary: [] },
    spend: { food: 0, housing: 0, transport: 0, entertainment: 0, healthcare: 0, shopping: 0 },
    budget: { income: 0, rent: 0, food: 0, transport: 0, utilities: 0, shopping: 0, savings: 0 },
    news: { at: -1 }, alerts: {}
  };
}
function p17() { if (!S.p17) S.p17 = newP17(); return S.p17; }
/* save sanitiser: numbers only, bounded arrays, known keys (old v2.4.1 saves have no p17 → defaults) */
function sanitizeP17(src) {
  const out = newP17();
  if (!src || typeof src !== 'object') return out;
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi === undefined ? 1e15 : hi, Math.max(lo === undefined ? -1e15 : lo, v)) : d; };
  const arr = function (a, cap) { return Array.isArray(a) ? a.slice(-cap).map(function (x) { return n(x, 0); }) : []; };
  out.day = n(src.day, 0, 0);
  if (src.goods && typeof src.goods === 'object') Object.keys(out.goods).forEach(function (id) {
    const g = src.goods[id]; if (!g || typeof g !== 'object') return;
    const o = out.goods[id]; o.p = n(g.p, 0, 0, 1e7); o.y = n(g.y, 0, 0, 1e7); o.h = arr(g.h, E2_HIST);
    ['today', 'last'].forEach(function (k) { if (g[k] && typeof g[k] === 'object') ['prod', 'cons', 'imp', 'exp'].forEach(function (q) { o[k][q] = n(g[k][q], 0, 0); }); });
  });
  if (src.co && typeof src.co === 'object') Object.keys(src.co).slice(0, 20000).forEach(function (id) {
    const c = src.co[id]; if (!c || typeof c !== 'object' || !/^[\w-]{1,40}$/.test(id)) return;
    out.co[id] = { stage: E2_STAGES.indexOf(c.stage) >= 0 ? c.stage : 'Startup', since: n(c.since, 0, 0), cr: n(c.cr, 650, 300, 850), hq: n(c.hq, 1, 1, 5) | 0, loss: n(c.loss, 0, 0, 999) | 0, short: n(c.short, 0, 0, 999) | 0, restr: n(c.restr, -1, -1), founded: n(c.founded, 1, 0),
      rev: n(c.rev, 0), profit: n(c.profit, 0), cash: n(c.cash, 0), debt: n(c.debt, 0, 0), emp: n(c.emp, 0, 0) | 0, stores: n(c.stores, 0, 0) | 0, factories: n(c.factories, 0, 0) | 0, share: n(c.share, 0, 0, 1), sector: typeof c.sector === 'string' ? c.sector.slice(0, 16) : '', name: typeof c.name === 'string' ? c.name.replace(/[<>]/g, '').slice(0, 32) : '', synthetic: !!c.synthetic,
      hist: Array.isArray(c.hist) ? c.hist.slice(-30).map(function (h) { return { rev: n(h && h.rev, 0), profit: n(h && h.profit, 0), share: n(h && h.share, 0, 0, 1) }; }) : [] };
  });
  if (src.names && Array.isArray(src.names.retired)) out.names.retired = src.names.retired.filter(function (s) { return typeof s === 'string'; }).slice(-400).map(function (s) { return s.replace(/[<>]/g, '').slice(0, 32); });
  if (src.jobs && typeof src.jobs === 'object') { ['vac', 'workers', 'unemp', 'salary', 'income', 'pressure'].forEach(function (k) { out.jobs[k] = n(src.jobs[k], out.jobs[k]); }); if (['Low', 'Healthy', 'High', 'Crisis'].indexOf(src.jobs.level) >= 0) out.jobs.level = src.jobs.level; }
  if (src.housing && typeof src.housing === 'object') { ['price', 'rent', 'vacancy', 'afford', 'crisis', 'crisisDays'].forEach(function (k) { out.housing[k] = n(src.housing[k], out.housing[k], 0); }); if (typeof src.housing.affordClass === 'string') out.housing.affordClass = src.housing.affordClass.slice(0, 20); }
  if (src.bank && typeof src.bank === 'object') {
    const cb = src.bank.cb || {}; out.bank.cb = { ms: n(cb.ms, 100, 10, 1e4), liqUntil: n(cb.liqUntil, 0, 0), liqTotal: n(cb.liqTotal, 0, 0) };
    out.bank.citizenScore = n(src.bank.citizenScore, 700, 300, 850);
  }
  if (src.infl && typeof src.infl === 'object') { out.infl.exp = n(src.infl.exp, 0.02, -0.1, 0.5); if (src.infl.cat && typeof src.infl.cat === 'object') Object.keys(out.infl.cat).forEach(function (k) { out.infl.cat[k] = n(src.infl.cat[k], 0, -1, 5); }); if (src.infl.base && typeof src.infl.base === 'object') { out.infl.base = {}; Object.keys(src.infl.base).slice(0, 12).forEach(function (k) { out.infl.base[k] = n(src.infl.base[k], 1, 0, 1e7); }); } }
  if (Array.isArray(src.shocks)) out.shocks = src.shocks.filter(function (s) { return s && E2_SHOCKS[s.id]; }).slice(0, 8).map(function (s) { return { id: s.id, sev: n(s.sev, 0, 0, 3) | 0, start: n(s.start, 0, 0), until: n(s.until, 0, 0), resp: typeof s.resp === 'string' && E2_SHOCKS[s.id].resp.some(function (r) { return r[0] === s.resp; }) ? s.resp : '', peak: n(s.peak, 0) }; });
  if (Array.isArray(src.shockLog)) out.shockLog = src.shockLog.slice(0, 30).filter(function (s) { return s && E2_SHOCKS[s.id]; }).map(function (s) { return { id: s.id, sev: n(s.sev, 0, 0, 3) | 0, d: n(s.d, 0, 0), resp: typeof s.resp === 'string' ? s.resp.slice(0, 16) : '' }; });
  if (E2_SENTIMENT.some(function (x) { return x[0] === src.sentiment; })) out.sentiment = src.sentiment;
  out.sentScore = n(src.sentScore, 0, -1, 1);
  if (src.tax && typeof src.tax === 'object') { out.tax = {}; E2_TAXES.forEach(function (t) { out.tax[t[0]] = n(src.tax[t[0]], t[0] === 'property' ? 1 : t[0] === 'tourism' ? 10 : t[0] === 'sales' ? 0 : 10, t[2], t[3]); }); }
  if (src.gdp && typeof src.gdp === 'object') { ['total', 'perCap', 'growth', 'trade'].forEach(function (k) { out.gdp[k] = n(src.gdp[k], 0); }); if (src.gdp.sectors && typeof src.gdp.sectors === 'object') Object.keys(src.gdp.sectors).slice(0, 10).forEach(function (k) { out.gdp.sectors[k] = n(src.gdp.sectors[k], 0); }); }
  if (src.hist && typeof src.hist === 'object') Object.keys(out.hist).forEach(function (k) { out.hist[k] = arr(src.hist[k], E2_HIST); });
  ['spend', 'budget'].forEach(function (k) { if (src[k] && typeof src[k] === 'object') Object.keys(out[k]).forEach(function (q) { out[k][q] = n(src[k][q], 0); }); });
  return out;
}

/* compact copy for the save file: rounded numbers, no defaults, no history for far-simulated registry entries
   (10,000 companies ≈ 1 MB instead of ≈ 8 MB; history rebuilds within days) */
function p17SaveCopy() {
  const P = S.p17, r2 = function (v) { return Math.round(v * 100) / 100; }, o = JSON.parse(JSON.stringify(Object.assign({}, P, { co: {} })));
  for (const id in P.co) {
    const c = P.co[id], x = { stage: c.stage, cr: Math.round(c.cr), hq: c.hq, founded: c.founded, rev: r2(c.rev), profit: r2(c.profit), cash: Math.round(c.cash), sector: c.sector, name: c.name };
    if (c.since) x.since = c.since; if (c.loss) x.loss = c.loss; if (c.short) x.short = c.short; if (c.restr >= 0) x.restr = c.restr; if (c.debt) x.debt = Math.round(c.debt);
    if (c.emp) x.emp = c.emp; if (c.stores) x.stores = c.stores; if (c.factories) x.factories = c.factories; if (c.share) x.share = Math.round(c.share * 1000) / 1000;
    if (c.synthetic) x.synthetic = true; else if (c.hist.length) x.hist = c.hist.slice(-12).map(function (h) { return { rev: r2(h.rev), profit: r2(h.profit), share: Math.round(h.share * 1000) / 1000 }; });
    o.co[id] = x;
  }
  return o;
}

/* ---------------------------------------- helpers ---------------------------------------- */
function e2Rng(salt) { return mulberry32((((S.city.seed >>> 0) * 2654435761) ^ ((gameDay() * 9973 + (salt | 0) * 131) >>> 0)) >>> 0); }
function e2Push(a, v) { a.push(Math.round(v * 1000) / 1000); if (a.length > E2_HIST) a.splice(0, a.length - E2_HIST); }
function e2GoodPrice(id) {
  const g = p17().goods[id]; if (g && g.p > 0) return g.p;
  return S.economy && S.economy.prices && S.economy.prices[id] !== undefined ? S.economy.prices[id] : (E2_GOODS[id] && E2_GOODS[id][2]) || 0;
}
function e2GoodName(id) { return E2_GOODS[id] ? E2_GOODS[id][0] : id; }
function e2Change(id) { const g = p17().goods[id]; if (!g || !g.y) return 0; return g.p / g.y - 1; }
function e2Phase() {                                     // Expansion · Peak · Slowdown · Recession · Recovery on top of the Part 5 cycle
  const e = S.p5 && S.p5.econ; if (!e) return 'Expansion';
  const ph = e.phase;
  if (ph === 'BOOM') { const d = (ECON_PHASES[ph] && ECON_PHASES[ph].dur) || 600, left = Math.max(0, (e.until || 0) - S.clock.runSec); return left < d * 0.3 ? 'Peak' : 'Expansion'; }
  if (ph === 'SLOWDOWN') return 'Slowdown';
  if (ph === 'RECESSION') return 'Recession';
  if (ph === 'RECOVERY') return 'Recovery';
  return 'Expansion';
}
function e2Sentiment() { const s = p17().sentiment; return E2_SENTIMENT.find(function (x) { return x[0] === s; }) || E2_SENTIMENT[3]; }
function e2Active(id) { return p17().shocks.find(function (s) { return s.id === id && s.until > S.clock.runSec; }) || null; }
function e2ShockK(s) { return E2_SEV_K[s.sev] * (s.until - S.clock.runSec > 0 ? Math.min(1, (S.clock.runSec - s.start) / 120 + 0.25) : 0); }
function e2Unemp() { const u = SIM.unemployment || 0; return u < 0.04 ? 'Low' : u < 0.09 ? 'Healthy' : u < 0.16 ? 'High' : 'Crisis'; }
function e2AffordClass(share) { return share < 0.2 ? 'Very Affordable' : share < 0.3 ? 'Affordable' : share < 0.4 ? 'Moderate' : share < 0.5 ? 'Expensive' : 'Critical'; }
function e2Tax() {
  const P = p17();
  if (!P.tax) P.tax = { income: S.city.tax, business: S.city.tax, property: 1, sales: 0, tourism: 10 };   // defaults = the classic budget (old saves keep their numbers)
  P.tax.income = S.city.tax;                                // the classic tax slider stays the income tax
  return P.tax;
}

/* ---------------------------------------- market ---------------------------------------- */
function e2DerivedRatio(id) {
  if (id === 'electricity') return 1 / Math.max(0.3, SIM.powerRatio || 1);
  if (id === 'technology') return (SIM.demand && SIM.demand.TECHNOLOGY || 0) / Math.max(1, SIM.supply && SIM.supply.TECHNOLOGY || 0) || 1;
  if (id === 'clothing') return (SIM.demand && SIM.demand.SHOPPING || 0) / Math.max(1, SIM.supply && SIM.supply.SHOPPING || 0) || 1;
  if (id === 'medicine') return 1 / Math.max(0.35, 0.3 + ((SIM.cov && SIM.cov.health) || 0) * 0.9);
  return 1;
}
function e2ShockGoodMult(id) {
  let k = 1;
  p17().shocks.forEach(function (s) {
    const D = E2_SHOCKS[s.id], a = D.goods[id]; if (!a || s.until <= S.clock.runSec) return;
    let r = 1; if (s.resp === 'subsidy' || s.resp === 'cool') r = 0.5; if (s.resp === 'imports') r = 0.4; if (s.resp === 'ration') r = 0.7; if (s.resp === 'local') r = 1.05; if (s.resp === 'reroute') r = 0.5;
    k *= 1 + a * e2ShockK(s) * r;
  });
  return k;
}
function e2MarketHour() {
  const P = p17(), R = SIM.sc || null, H = 3600 / TIME_SCALE;     // sim seconds per game hour
  Object.keys(E2_GOODS).forEach(function (id) {
    const g = P.goods[id], D = E2_GOODS[id];
    if (D[2]) {                                               // derived market: medicine, clothing, technology services, electricity
      const tgt = D[2] * (typeof priceLevel === 'function' ? priceLevel() : 1) * clamp(Math.sqrt(e2DerivedRatio(id)), 0.6, 1.8) * e2ShockGoodMult(id);
      if (!g.p) g.p = tgt;
      g.p = clamp(tgt, g.p * 0.97, g.p * 1.03);               // at most ±3 % per game hour: prices move, never jump
      const vol = Math.max(1, S.city.population) * 0.02 * H;
      g.today.cons += vol * clamp(e2DerivedRatio(id), 0.5, 2) / 2; g.today.prod += vol / 2;
    } else {
      const base = S.economy.prices[id]; if (base === undefined) return;
      g.p = base * e2ShockGoodMult(id);
      if (R) { g.today.prod += (R.prod[id] || 0) * H; g.today.cons += ((R.dem[id] || 0)) * H; g.today.imp += (R.imp[id] || 0) * H; g.today.exp += (R.exp[id] || 0) * H; }
    }
    if (!g.y) g.y = g.p;
  });
}
/* the supply chain's own price target also sees the Part 17 shocks (energy / food / trade / construction) */
(function () {
  const sp = window.shockPriceMult;
  if (typeof sp === 'function' && !sp.__p17) { window.shockPriceMult = function (p) { const k = sp.apply(this, arguments); return S && S.p17 ? k * e2ShockGoodMult(p) : k; }; window.shockPriceMult.__p17 = true; }
})();
function e2MarketDay() {
  const P = p17();
  Object.keys(E2_GOODS).forEach(function (id) {
    const g = P.goods[id];
    if (g.p > 0) { e2Push(g.h, g.p); g.y = g.h.length > 1 ? g.h[g.h.length - 2] : g.p; }
    g.last = g.today; g.today = { prod: 0, cons: 0, imp: 0, exp: 0 };
  });
}
function e2MarketRows(cat, q) {
  q = String(q || '').toLowerCase().trim();
  return Object.keys(E2_GOODS).filter(function (id) { const D = E2_GOODS[id]; return (!cat || cat === 'All' || D[1] === cat) && (!q || D[0].toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0 || D[1].toLowerCase().indexOf(q) >= 0); }).map(function (id) {
    const g = p17().goods[id], D = E2_GOODS[id], l = g.last.prod || g.last.cons ? g.last : g.today;
    const sup = l.prod + l.imp, dem = l.cons + l.exp;
    return { id: id, name: D[0], cat: D[1], price: e2GoodPrice(id), y: g.y || e2GoodPrice(id), ch: e2Change(id), prod: l.prod, cons: l.cons, imp: l.imp, exp: l.exp, supply: sup, demand: dem, hist: g.h };
  });
}

/* ---------------------------------------- companies ---------------------------------------- */
function e2CoKeys() {
  const P = p17();
  if (E2.keys && E2.keysAt === Object.keys(P.co).length + AI_DEFS.length) return E2.keys;
  AI_DEFS.forEach(function (a) { if (!P.co[a.id]) P.co[a.id] = e2NewCo(a.sectors[0], a.name, S.p10 && S.p10.corp[a.id] ? S.p10.corp[a.id].founded || gameDay() : gameDay()); });
  E2.keys = Object.keys(P.co); E2.keysAt = E2.keys.length + AI_DEFS.length;   // registry may also hold more (big-city test / future small businesses)
  return E2.keys;
}
function e2NewCo(sector, name, founded) { return { stage: 'Startup', since: gameDay(), cr: 650, hq: 1, loss: 0, short: 0, restr: -1, founded: founded || gameDay(), rev: 0, profit: 0, cash: 0, debt: 0, emp: 0, stores: 0, factories: 0, share: 0, sector: sector || '', name: name || '', synthetic: false, hist: [] }; }
function e2CoType(c) { return E2_SECTOR_TYPE[c.sector] || 'Business'; }
/* registry entry ← the live company (AI) or its own numbers (registry-only entries run a simplified model) */
function e2CoSync(id, c, full) {
  const st = S.ai[id];
  if (st) {
    const a = aiDef(id), m = S.p10 ? corpMeta(id) : null;
    c.name = a ? a.name : c.name; c.sector = a ? a.sectors[0] : c.sector;
    c.rev = st.rev || 0; c.profit = st.profit || 0; c.cash = st.cash || 0; c.debt = m ? m.debt || 0 : 0;
    if (full) {
      let stores = 0, fac = 0, emp = 0;
      for (let i = 0; i < S.buildings.list.length; i++) { const b = S.buildings.list[i]; if (b.owner !== id || !b.built) continue; const d = bdef(b); if (d.cat === 'Industry' || d.cat === 'Resources') fac++; else stores++; emp += b._actW || 0; }
      c.stores = stores; c.factories = fac; c.emp = Math.round(emp);
      c.share = typeof companyShare === 'function' ? companyShare(id) : 0;
    }
  } else if (c.synthetic) {                                   // simplified far simulation: revenue follows demand and the cycle
    const ph = e2Phase(), k = ph === 'Recession' ? 0.97 : ph === 'Slowdown' ? 0.99 : ph === 'Recovery' ? 1.01 : 1.005;
    c.rev = Math.max(0, c.rev * k); c.profit = c.rev * (ph === 'Recession' ? -0.04 : 0.06); c.cash = Math.max(0, c.cash + c.profit); c.debt = Math.max(0, c.debt * 0.995);
  }
}
function e2CoStage(id, c) {
  const day = gameDay(), age = day - c.founded, h = c.hist, g = h.length >= 3 && h[h.length - 3].rev > 0 ? c.rev / h[h.length - 3].rev - 1 : 0;
  const prev = c.stage;
  if (c.restr >= 0) c.stage = 'Restructuring';
  else if (c.loss >= 2 && g < 0) c.stage = 'Decline';
  else if (age < 2) c.stage = 'Startup';
  else if (g > 0.15 && c.stores >= 3) c.stage = 'Expansion';
  else if (g > 0.04) c.stage = 'Growth';
  else if (age > 16 && Math.abs(g) < 0.03) c.stage = 'Mature';
  else c.stage = 'Established';
  if (c.stage !== prev) c.since = day;
  // headquarters level 1–5: assets and size → more employees, revenue (brand), management capacity
  const st = S.ai[id], assets = st ? st.assets || 0 : c.cash;
  const hq = clamp(1 + Math.floor(Math.log10(Math.max(1, assets) / 40000) * 1.4), 1, 5);
  if (hq > c.hq && st && !c.synthetic) newsAdd('🏢', c.name + ' opens a level ' + hq + ' headquarters', 'More staff, a stronger brand and room to manage ' + (hq * 6) + ' locations.', { cat: 'business', stock: { id: id, pct: 0.03 } });
  c.hq = hq;
}
/* credit score 300–850 from debt, arrears, cash and profit (companies); citizens get a city-wide average */
function e2CoCredit(id, c) {
  let arrears = 0; if (S.p11) S.p11.loans.forEach(function (l) { if (l.co === id) arrears += l.arrears || 0; });
  let d = 0;
  if (arrears > 0) d -= 15; else d += 3;
  if (c.profit < 0) d -= 4; else d += 2;
  if (c.debt > Math.max(1, c.cash) * 3) d -= 6;
  if (c.restr >= 0) d -= 10;
  c.cr = clamp(c.cr + d, 300, 850);
}
/* pricing AI: demand, competition, costs (wages + expected inflation), inventory (goods supply), brand, customer income */
function e2PriceBias(id) {
  const c = S.p17 && S.p17.co[id]; if (!c || !S.ai[id]) return 0;
  const sec = c.sector, dem = (SIM.demand && SIM.demand[sec]) || 0, sup = (SIM.supply && SIM.supply[sec]) || 0;
  const dr = sup > 0 ? clamp(dem / sup, 0.5, 2) : 1;
  const comp = clamp(c.share, 0, 1), cost = (S.p17.infl.exp - 0.02) * 1.5, inv = clamp(1 - (SIM.goodsRatio === undefined ? 1 : SIM.goodsRatio), -0.3, 0.5);
  const brand = ((S.ai[id].rep || 50) - 50) / 400, income = typeof realIncomeFactor === 'function' ? clamp(realIncomeFactor() - 1, -0.3, 0.3) : 0;
  return clamp((dr - 1) * 0.08 + (comp - 0.33) * 0.06 + cost + inv * 0.05 + brand + income * 0.1 + (c.stage === 'Restructuring' ? -0.04 : 0), -0.12, 0.12);
}
(function () {
  const cb = window.corpPriceBias;
  if (typeof cb === 'function' && !cb.__p17) { window.corpPriceBias = function (id) { return clamp(cb.apply(this, arguments) + (S && S.p17 ? e2PriceBias(id) : 0), -0.3, 0.3); }; window.corpPriceBias.__p17 = true; }
})();
function e2CoPass(dayEnd) {
  const P = p17(), keys = e2CoKeys(); if (!keys.length) return 0;
  // near companies (a store in view) every hour, the others in round-robin batches: 10,000 companies cost ≈ 500 per hour
  const view = typeof screenToWorld === 'function' && typeof CW !== 'undefined' ? [screenToWorld(0, 0), screenToWorld(CW, CH)] : null;
  const near = {}; if (view) for (let i = 0; i < S.buildings.list.length; i++) { const b = S.buildings.list[i]; if (b.owner && S.ai[b.owner] && b.x * TILE > view[0].x && b.x * TILE < view[1].x && b.y * TILE > view[0].y && b.y * TILE < view[1].y) near[b.owner] = 1; }
  const batch = dayEnd ? keys.length : Math.min(keys.length, 500); let done = 0;
  for (const id in near) { const c = P.co[id]; if (c) { e2CoSync(id, c, true); done++; } }
  for (let k = 0; k < batch; k++) { E2.rr = (E2.rr + 1) % keys.length; const id = keys[E2.rr], c = P.co[id]; if (!c || near[id]) continue; if (!S.ai[id] && !c.synthetic) { delete P.co[id]; E2.keys = null; continue; } e2CoSync(id, c, true); done++; }
  if (dayEnd) keys.forEach(function (id) {
    const c = P.co[id]; if (!c) return;
    c.hist.push({ rev: c.rev, profit: c.profit, share: c.share }); if (c.hist.length > 30) c.hist.shift();
    c.loss = c.profit < 0 ? c.loss + 1 : 0; c.short = c.cash < 1000 ? c.short + 1 : 0;
    e2CoStage(id, c); e2CoCredit(id, c);
    if (c.restr >= 0 && gameDay() - c.restr >= 3 && c.profit >= 0 && c.short === 0) { c.restr = -1; c.stage = 'Established'; c.since = gameDay(); if (S.ai[id]) newsAdd('✅', c.name + ' completes its restructuring', 'Back in profit after ' + (gameDay() - c.since + 3) + ' days.', { cat: 'business', stock: { id: id, pct: 0.06 } }); }
  });
  return done;
}
/* GRADUAL BANKRUPTCY: Loss → Cash shortage → Debt → Restructuring → Bankruptcy. The existing triggers (stock counters,
   debt risk) still decide when a company is in trouble; the first time they fire it RESTRUCTURES (closes its worst store,
   renegotiates loans, gets a restructuring loan); only a company that is still failing ≥ 2 days later goes bankrupt. */
function e2UniqueName(sector) {
  const P = p17(), used = {};
  AI_DEFS.forEach(function (a) { used[a.name.replace(/ (GROUP|HOLDINGS|GLOBAL)$/, '')] = 1; used[a.name] = 1; });
  P.names.retired.forEach(function (n) { used[n] = 1; });
  for (const id in P.co) if (P.co[id].name) used[P.co[id].name] = 1;
  const pool = []; (COMPANY_REFOUND_NAMES[sector] || []).forEach(function (n) { if (!used[n]) pool.push(n); });
  const suf = E2_BRAND.suf[sector] || E2_BRAND.suf.SHOPPING;
  E2_BRAND.pre.forEach(function (p) { suf.forEach(function (s) { const n = p + ' ' + s; if (!used[n]) pool.push(n); }); });
  if (!pool.length) return 'NEW ' + sector + ' ' + (P.names.retired.length + 1);
  return pool[Math.floor(e2Rng(P.names.retired.length + 7)() * pool.length)];
}
(function () {
  const bc = window.bankruptCompany;
  if (typeof bc !== 'function' || bc.__p17) return;
  window.bankruptCompany = function (id) {
    if (!S || !S.p17 || !S.ai[id]) return bc.apply(this, arguments);
    const c = S.p17.co[id] || (S.p17.co[id] = e2NewCo(aiDef(id).sectors[0], aiDef(id).name)), day = gameDay();
    if (c.restr < 0 || day - c.restr < 2) {
      if (c.restr < 0) {
        c.restr = day; c.stage = 'Restructuring'; c.since = day;
        const st = S.ai[id], s = stockOf(id), a = aiDef(id);
        try { closeWorstStore(id); } catch (e) { /* fewer than 3 stores */ }
        if (S.p11) S.p11.loans.forEach(function (l) { if (l.co === id) { l.perSec *= 0.7; l.arrears *= 0.5; l.stage = 'restructuring'; } });
        st.cash += 2500 * costMult(); st.price = Math.max(0.8, (st.price || 1) * 0.95);
        s.bad = Math.round((s.bad || 0) * 0.4); s.neg = 0; st._riskT = 0;
        notify('🔧 ' + a.name + ' is RESTRUCTURING: weak stores close, loans are renegotiated. Bankruptcy follows only if it keeps failing.', '');
        newsAdd('🔧', a.name + ' enters restructuring', 'Losses, a cash shortage and debt forced a restructuring plan.', { cat: 'business', stock: { id: id, pct: -0.08 } });
      } else { const s = stockOf(id); s.bad = Math.round((s.bad || 0) * 0.6); }
      return;
    }
    // still failing after the restructuring: the classic bankruptcy (stores taken over by a new company) with a new name
    const old = aiDef(id).name;
    S.p17.names.retired.push(old.replace(/ (GROUP|HOLDINGS|GLOBAL)$/, '')); if (S.p17.names.retired.length > 400) S.p17.names.retired.shift();
    const nn = e2UniqueName(aiDef(id).sectors[0]);
    const pool0 = COMPANY_REFOUND_NAMES[aiDef(id).sectors[0]];
    COMPANY_REFOUND_NAMES[aiDef(id).sectors[0]] = [nn];     // the original routine picks from this pool → our unique name
    try { bc.apply(this, arguments); } finally { COMPANY_REFOUND_NAMES[aiDef(id).sectors[0]] = pool0; }
    Object.assign(c, e2NewCo(aiDef(id).sectors[0], aiDef(id).name)); c.cr = 520;
  };
  window.bankruptCompany.__p17 = true;
})();
/* founding: never a retired or used name, a seeded choice instead of Math.random */
(function () {
  const lf = window.lwFoundCompany;
  if (typeof lf !== 'function' || lf.__p17) return;
  window.lwFoundCompany = function (sector) {
    if (!S || !S.p17) return lf.apply(this, arguments);
    const pool0 = LW_FOUNDER_NAMES[sector], nn = e2UniqueName(sector);
    LW_FOUNDER_NAMES[sector] = [nn];
    try { const id = lf.apply(this, arguments); if (id) { S.p17.co[id] = e2NewCo(sector, nn); E2.keys = null; } return id; } finally { LW_FOUNDER_NAMES[sector] = pool0; }
  };
  window.lwFoundCompany.__p17 = true;
})();
function e2SectorShares() {
  const out = {}, keys = e2CoKeys(), P = p17();
  keys.forEach(function (id) { const c = P.co[id]; if (!c || !c.sector) return; const s = out[c.sector] || (out[c.sector] = { sector: c.sector, rev: 0, list: [] }); s.rev += Math.max(0, c.rev); s.list.push(c); });
  Object.keys(out).forEach(function (k) { const s = out[k]; s.list.sort(function (a, b) { return b.rev - a.rev; }); const top = s.list[0]; s.top = top ? top.name : '—'; s.topShare = top && s.rev > 0 ? top.rev / s.rev : 0; const h = top && top.hist.length > 3 ? top.hist[top.hist.length - 4].rev : 0; s.growth = h > 0 ? top.rev / h - 1 : 0; s.n = s.list.length; s.list = null; });
  return out;
}

/* ---------------------------------------- jobs · households · housing ---------------------------------------- */
function e2JobsHour() {
  const J = p17().jobs, js = typeof jobStats === 'function' ? jobStats() : { open: 0, avgSalary: 0 };
  J.vac = js.open; J.workers = Math.round(SIM.labor || 0); J.unemp = SIM.unemployment || 0; J.salary = js.avgSalary || 0;
  J.income = HH.stats ? HH.stats.income * 30 : J.salary; J.level = e2Unemp();
  // salary dynamics: firms that cannot find workers pay more, high unemployment slows wage growth
  const shortage = SIM.jobs > 0 ? J.vac / SIM.jobs : 0;
  J.pressure = clamp(shortage * 0.8 - Math.max(0, J.unemp - 0.06) * 0.6 + (p17().infl.exp - 0.02) * 0.4, -0.004, 0.006);
}
function e2HouseholdsHour() {
  const P = p17(), L = HH.list || [], sc = HH.stats ? HH.stats.scale : 1;
  if (!L.length) return;
  let inc = 0, rent = 0, food = 0, tr = 0, ut = 0, n = 0;
  L.forEach(function (h) { inc += h.income; rent += h.rent; food += h.size * 2.2 * priceLevel(); tr += h.expenses - h.rent - h.size * 2.2 * priceLevel(); n++; });
  ut = Math.max(0, tr * 0.35); tr = Math.max(0, tr - ut);
  const disc = Math.max(0, inc - rent - food - tr - ut);
  const B = P.budget, k = 30 / Math.max(1, n);                           // per household and month
  B.income = inc * k; B.rent = rent * k; B.food = food * k; B.transport = tr * k; B.utilities = ut * k; B.shopping = disc * 0.45 * k; B.savings = disc * 0.55 * k;
  const pop = Math.max(1, S.city.population), perCap = 30 / Math.max(1, n * 2.6) * pop / 30;   // city-wide per day
  P.spend = { food: food * perCap, housing: rent * perCap, transport: tr * perCap, entertainment: disc * 0.2 * perCap, healthcare: (ut * 0.3 + disc * 0.1) * perCap, shopping: disc * 0.25 * perCap };
  // citizens' credit: struggling households, unemployment and mortgage defaults pull the city's average score down
  const strug = HH.stats ? HH.stats.struggling : 0, md = S.p11 && S.p11.mort ? S.p11.mort.defaults || 0 : 0;
  P.bank.citizenScore = Math.round(clamp(735 - strug * 260 - (SIM.unemployment || 0) * 300 - Math.min(80, md * 4), 300, 850));
  void sc;
}
function e2HousingHour() {
  const H = p17().housing, D = typeof housingMarket === 'function' ? housingMarket() : [];
  const inc = HH.stats && HH.stats.income > 0 ? HH.stats.income * 30 : 0;
  let pr = 0, rent = 0, cap = 0, occ = 0;
  H.districts = D.slice(0, 40).map(function (d) {
    pr += d.price * d.cap; rent += d.rent * d.cap; cap += d.cap; occ += d.occ * d.cap;
    const share = inc > 0 ? d.rent / Math.max(1, inc * 2.6) : 0.3;
    return { name: d.name, x: d.x, y: d.y, price: Math.round(d.price), rent: Math.round(d.rent), vacancy: Math.round((1 - d.occ) * 1000) / 1000, afford: Math.round(share * 1000) / 1000, cls: e2AffordClass(share) };
  });
  H.price = cap ? pr / cap : 0; H.rent = cap ? rent / cap : 0; H.vacancy = cap ? 1 - occ / cap : 0;
  H.afford = inc > 0 ? H.rent / Math.max(1, inc * 2.6) : 0.3; H.affordClass = e2AffordClass(H.afford);
  const ratio = SIM.housingDemandRatio || 1;
  H.crisis = ratio > 1.25 || (H.afford > 0.5 && H.vacancy < 0.03) ? 1 : 0;
}

/* ---------------------------------------- banking · credit ---------------------------------------- */
function e2BankingDay() {
  const P = p17(), B = P.bank, stg = { current: 0, late: 0, restructuring: 0, default: 0 };
  if (S.p11) S.p11.loans.forEach(function (l) {
    // Late → Restructuring → Default: a late loan first gets a longer term (lower payment), defaults only when still unpaid
    const day = gameDay(), big = l.perSec * 1200 * 0.5;
    if (!l.arrears) { if (l.stage !== 'restructuring') l.stage = 'current'; l.lateDays = 0; }
    else { l.lateDays = (l.lateDays || 0) + 1; if (l.stage !== 'restructuring' && (l.arrears > big || l.lateDays >= 2)) { l.stage = 'restructuring'; l.perSec *= 0.75; l.restrDay = day; } else if (l.stage !== 'restructuring') l.stage = 'late'; }
    if (l.stage === 'restructuring' && l.arrears > big * 3 && day - (l.restrDay || day) >= 2) l.stage = 'default';
    stg[l.stage || 'current']++;
  });
  B.loanStages = stg;
  // central bank: money supply follows GDP growth and the policy rate; emergency liquidity in a banking crisis
  const cb = B.cb, rate = typeof interestRate === 'function' ? interestRate() : 0.04, g = P.gdp.growth || 0;
  cb.ms = clamp(cb.ms * (1 + g * 0.5 + (0.04 - rate) * 0.1), 10, 1e4);
  const crisis = e2Active('banking'), weak = S.p11 && Object.keys(S.p11.banks).some(function (k) { return (S.p11.banks[k].liquidity || 1) < 0.15; });
  if ((crisis && crisis.resp === 'liquidity') || weak) {
    cb.liqUntil = S.clock.runSec + 1200;
    if (S.p11) Object.keys(S.p11.banks).forEach(function (k) { const bk = S.p11.banks[k]; const add = Math.max(0, (bk.deposits || 0) * 0.05); bk.reserves = (bk.reserves || 0) + add; bk.liquidity = Math.min(1, (bk.liquidity || 0) + 0.1); cb.liqTotal += add; });
  }
}
function e2Banks() {
  if (!S.p11) return [];
  const rate = typeof interestRate === 'function' ? interestRate() : 0.04, own = {};
  (typeof bankBuildings === 'function' ? bankBuildings() : []).forEach(function (b) { own[b.id] = b; });
  return Object.keys(S.p11.banks).map(function (k) {
    const bk = S.p11.banks[k], b = own[k] || MAP.byId.get(+k), owner = b ? (b.owner === 'player' ? 'You' : b.owner === 'city' ? 'City' : (aiDef(b.owner) || { name: b.owner }).name) : '—';
    const risk = clamp(((bk.loans || 0) + (bk.mortgages || 0)) / Math.max(1, (bk.deposits || 0) + (bk.reserves || 0)) - 0.6, 0, 1);
    const branches = b ? S.buildings.list.filter(function (x) { return x.owner === b.owner && x.built && BUILDINGS[x.type].sector === 'FINANCE'; }).length : 1;
    return { id: k, name: (b ? bdef(b).name : 'Bank') + ' · ' + owner, deposits: bk.deposits || 0, loans: (bk.loans || 0) + (bk.mortgages || 0), capital: bk.reserves || 0, rate: rate + 0.015 + risk * 0.04, risk: risk, profit: bk.profit || 0, branches: branches, b: b };
  });
}
function mortgageQuote(price, downPct, rate, years) {
  const loan = Math.max(0, price * (1 - downPct)), r = Math.max(0.01, rate) / 12, n = Math.max(1, years * 12);
  const pay = loan * r / (1 - Math.pow(1 + r, -n));
  return { price: price, down: price - loan, loan: loan, rate: Math.max(0.01, rate), months: n, monthly: pay, total: pay * n };
}

/* ---------------------------------------- inflation 2.0 ---------------------------------------- */
function e2InflDay() {
  const I = p17().infl, idx = function (ids) { let s = 0, n = 0; ids.forEach(function (id) { const p = e2GoodPrice(id), b = (PRODUCTS[id] && PRODUCTS[id].base) || (E2_GOODS[id] && E2_GOODS[id][2]) || p; if (b > 0 && p > 0) { s += p / b; n++; } }); return n ? s / n : 1; };
  const now = { food: idx(['wheat', 'flour', 'bread', 'food']), rent: S.city.housingPrice || 1, construction: idx(['materials', 'metal', 'wood']), salary: (S.p6 && S.p6.econ.wage || 100) / 100, services: idx(['medicine', 'technology', 'clothing']), interest: typeof interestRate === 'function' ? interestRate() : 0.04 };
  const ring = E2.cat || (E2.cat = []);                     // runtime ring of the last 9 daily category levels (1 game year = 8 days)
  ring.push(now); if (ring.length > 9) ring.shift();
  const old = ring[0];
  Object.keys(I.cat).forEach(function (k) { I.cat[k] = k === 'interest' ? now.interest : (old[k] > 0 ? now[k] / old[k] - 1 : 0); });
  // expectations: adaptive (75 % last expectation, 25 % today's CPI inflation) + the cycle
  const infl = S.p6 ? S.p6.econ.infl : 0.02, ph = e2Phase();
  I.exp = clamp(I.exp * 0.75 + infl * 0.25 + (ph === 'Peak' ? 0.004 : ph === 'Recession' ? -0.004 : 0), -0.05, 0.3);
}

/* ---------------------------------------- shocks ---------------------------------------- */
function e2ShockStart(id, sev, silent) {
  const P = p17(), D = E2_SHOCKS[id]; if (!D || e2Active(id)) return null;
  sev = clamp(sev | 0, 0, 3);
  const s = { id: id, sev: sev, start: S.clock.runSec, until: S.clock.runSec + 1200 * (1 + sev), resp: '', peak: 0 };
  P.shocks.push(s); P.shockLog.unshift({ id: id, sev: sev, d: gameDay(), resp: '' }); if (P.shockLog.length > 30) P.shockLog.length = 30;
  if (!silent) {
    const fx = Object.keys(D.goods).slice(0, 3).map(function (g) { return e2GoodName(g) + ' +' + Math.round(D.goods[g] * E2_SEV_K[sev] * 100) + '%'; }).join(' · ');
    notify((D.good ? '📈' : '⚠️') + ' ECONOMIC ALERT — ' + D.name.toUpperCase() + ' (' + E2_SEV[sev] + ')' + (fx ? ': ' + fx : '') + '. Open Economy → Shocks to respond.', D.good ? 'good' : 'bad');
    newsAdd(D.icon, D.name + ' (' + E2_SEV[sev] + ')', fx || 'Markets react.', { cat: 'economy' });
  }
  E2.dirtyUi++;
  return s;
}
function e2ShockRespond(id, resp) {
  const s = e2Active(id), D = E2_SHOCKS[id]; if (!s || !D) return { ok: false, reason: 'No active ' + (D ? D.name : id) };
  if (!D.resp.some(function (r) { return r[0] === resp; })) return { ok: false, reason: 'Unknown response' };
  s.resp = resp; const L = p17().shockLog.find(function (x) { return x.id === id; }); if (L) L.resp = resp;
  if (resp === 'calm' || resp === 'guarantee') s.until = Math.max(S.clock.runSec + 300, s.until - 600);
  E2.dirtyUi++;
  return { ok: true, msg: D.name + ': ' + D.resp.find(function (r) { return r[0] === resp; })[1] };
}
function e2ShocksDay() {
  const P = p17(), t = S.clock.runSec, rnd = e2Rng(31), pop = S.city.population;
  P.shocks = P.shocks.filter(function (s) { if (s.until > t) return true; notify('✅ ' + E2_SHOCKS[s.id].name + ' is over — markets are normalising.', 'good'); return false; });
  // response costs: a small share of the city budget per day, never a reset
  P.shocks.forEach(function (s) { const cost = { subsidy: 0.015, imports: 0.01, liquidity: 0.01, invest: 0.01, calm: 0.005, reroute: 0.01 }[s.resp] || 0; if (cost && S.budget > 0) S.budget -= Math.min(S.budget * cost, 250000 * costMult()); });
  if (pop < 800 || P.shocks.length >= 2) return;
  const H = P.housing, food = ['wheat', 'flour', 'bread', 'food'].reduce(function (a, g) { return a + ((S.economy.inventory[g] || 0) < 20 ? 1 : 0); }, 0);
  const banksWeak = S.p11 && (S.p11.loanStats.defaulted || 0) > 4 && rnd() < 0.3;
  const cand = [
    ['energy', 0.04 + (SIM.powerRatio < 1 ? 0.06 : 0)], ['food', food >= 2 ? 0.12 : 0.02], ['banking', banksWeak ? 0.15 : 0.015],
    ['bubble', H.price > 0 && (P.hist.house.length > 4 && H.price / Math.max(1, P.hist.house[P.hist.house.length - 4]) > 1.25) ? 0.25 : 0.01], ['techboom', (SIM.demand && SIM.demand.TECHNOLOGY || 0) > (SIM.supply && SIM.supply.TECHNOLOGY || 1) * 1.3 ? 0.08 : 0.02],
    ['crash', P.sentiment === 'Bullish' ? 0.08 : 0.01], ['trade', (SIM.traffic || 0) > 75 || S.events.active.some(function (e) { return e.id === 'storm' || e.id === 'flood'; }) ? 0.12 : 0.02], ['construction', (P.gdp.growth || 0) > 0.05 ? 0.1 : 0.02]
  ];
  for (let i = 0; i < cand.length; i++) if (rnd() < cand[i][1]) { const r = rnd(); e2ShockStart(cand[i][0], r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.93 ? 2 : 3); break; }
}

/* ---------------------------------------- GDP · trade · stocks ---------------------------------------- */
function e2GdpGroup(d) {
  if (d.tour || d.cat === 'Leisure' || d.sector === 'ENTERTAINMENT') return 'Tourism';
  if (d.transit || d.cat === 'Transport' || d.cat === 'Logistics') return 'Transport';
  if (d.sector === 'TECHNOLOGY' || d.cat === 'Science') return 'Technology';
  if (d.cat === 'Industry' || d.cat === 'Resources' || d.sector === 'INDUSTRY' || d.sector === 'ENERGY') return 'Industry';
  if (d.cat === 'Commercial' && (d.sector === 'SHOPPING' || d.sector === 'FOOD')) return 'Retail';
  return 'Services';
}
function e2GdpDay() {
  const P = p17(), G = P.gdp, sec = { Industry: 0, Services: 0, Technology: 0, Tourism: 0, Construction: 0, Retail: 0, Transport: 0 };
  let tot = 0;
  for (let i = 0; i < S.buildings.list.length; i++) {
    const b = S.buildings.list[i], d = bdef(b);
    if (!b.built) { const v = (d.cost || 0) * 0.002; sec.Construction += v; tot += v; continue; }
    const r = Math.max(0, b._rev || 0); if (!r) continue; sec[e2GdpGroup(d)] += r; tot += r;
  }
  const gdp = typeof cityGDP === 'function' ? cityGDP() : tot * 9600, prev = G.total;
  Object.keys(sec).forEach(function (k) { G.sectors[k] = tot > 0 ? gdp * sec[k] / tot : 0; });
  G.total = gdp; G.perCap = gdp / Math.max(1, S.city.population); G.growth = prev > 0 ? clamp(gdp / prev - 1, -0.5, 0.5) : 0;
  G.trade = ((SIM.exportValue || 0) - (SIM.importValue || 0)) * 1200;     // per game day
}
function e2StockIndex() {
  const ps = AI_DEFS.map(function (a) { const s = S.p6 && S.p6.stocks[a.id]; return s && s.price; }).filter(function (v) { return v > 0; });
  return ps.length ? ps.reduce(function (a, v) { return a + v; }, 0) / ps.length : 0;
}
function e2SentimentDay() {
  const P = p17(), h = P.hist.stock, now = e2StockIndex();
  const ch3 = h.length > 3 && h[h.length - 3] > 0 ? now / h[h.length - 3] - 1 : 0;
  const ph = e2Phase(), news = S.p10 ? S.p10.news.slice(0, 6).reduce(function (a, n) { return a + (/record|boom|growth|opens/i.test(n.title) ? 1 : /crash|bankrupt|crisis|delay|shortage|restructuring/i.test(n.title) ? -1 : 0); }, 0) : 0;
  const shocks = P.shocks.reduce(function (a, s) { return a + (E2_SHOCKS[s.id].good ? 0.08 : -0.06 * (1 + s.sev)); }, 0);
  const score = clamp(ch3 * 2 + (ph === 'Expansion' ? 0.06 : ph === 'Peak' ? 0.1 : ph === 'Slowdown' ? -0.05 : ph === 'Recession' ? -0.12 : 0.03) + news * 0.03 + shocks, -1, 1);
  P.sentScore = P.sentScore * 0.5 + score * 0.5;
  const s = P.sentScore, crash = e2Active('crash');
  P.sentiment = crash && crash.sev >= 2 ? 'Panic' : s < -0.2 ? 'Bearish' : s < -0.06 ? 'Cautious' : s < 0.06 ? 'Neutral' : s < 0.18 ? 'Optimistic' : 'Bullish';
}
(function () {
  const fv = window.p10FairValue;
  if (typeof fv === 'function' && !fv.__p17) {
    window.p10FairValue = function (id, st) {
      let k = fv.apply(this, arguments); if (!S || !S.p17) return k;
      k *= e2Sentiment()[1];
      const crash = e2Active('crash'); if (crash) k *= 1 + E2_SHOCKS.crash.stock * e2ShockK(crash) * (crash.resp === 'calm' ? 0.6 : 1);
      const c = S.p17.co[id]; if (c) k *= (1 + (c.hq - 1) * 0.03) * (c.stage === 'Restructuring' ? 0.85 : c.stage === 'Expansion' ? 1.05 : 1);
      return k;
    };
    window.p10FairValue.__p17 = true;
  }
})();
function e2NewsDay() {
  const P = p17(); if (!S.p10) return;
  // record profits, delivery delays, food price moves → news with a stock / consumer effect
  let best = null; for (const id in P.co) { const c = P.co[id]; if (!S.ai[id] || c.hist.length < 3) continue; const pr = c.hist.slice(0, -1).reduce(function (a, h) { return Math.max(a, h.profit); }, -Infinity); if (c.profit > 0 && c.profit > pr * 1.15 && (!best || c.profit > best.c.profit)) best = { id: id, c: c }; }
  if (best) newsAdd('📈', best.c.name + ' reports record profits', 'Profit ' + money(best.c.profit * 60) + '/min · market share ' + Math.round(best.c.share * 100) + '%.', { cat: 'business', stock: { id: best.id, pct: 0.07 } });
  const fch = ['bread', 'food', 'wheat'].map(function (g) { return e2Change(g); }), fmax = Math.max.apply(null, fch);
  if (fmax > 0.05) newsAdd('🍞', 'Food prices rise ' + Math.round(fmax * 100) + '% after supply disruption', 'Bread ' + money(e2GoodPrice('bread'), 2) + ' · food ' + money(e2GoodPrice('food'), 2) + '. Consumers cut back.', { cat: 'economy', fx: [{ k: 'demand', v: -0.02 }] });
  if (e2Active('trade') || (SIM.traffic || 0) > 80) {
    const lg = AI_DEFS.find(function (a) { return a.sectors[0] === 'INDUSTRY' || a.sectors[0] === 'SHOPPING'; });
    if (lg) newsAdd('🚚', lg.name + ' suffers major delivery delays', 'Traffic ' + Math.round(SIM.traffic || 0) + '% and disrupted routes slow deliveries.', { cat: 'business', stock: { id: lg.id, pct: -0.05 } });
  }
}

/* ---------------------------------------- modifiers into the classic economy ---------------------------------------- */
function part17Mods(m) {
  if (!S || !S.p17) return;
  const P = S.p17, T = e2Tax(), J = P.jobs;
  // unemployment: happiness, consumption (tax income follows the employed count already)
  if (J.level === 'High') { m.hap -= 3; m.demand *= 0.97; } else if (J.level === 'Crisis') { m.hap -= 8; m.demand *= 0.92; m.growth *= 0.92; }
  // housing crisis / oversupply
  if (P.housing.crisis) { m.hap -= 4; m.growth *= 0.93; }
  if (P.housing.vacancy > 0.25) m.growth *= 0.95;
  // tax policy: business tax over 12 % slows business, sales tax trims consumption, tourism tax trims tourists
  m.bizTax = T.business / 100; m.propTax = T.property; m.salesTax = T.sales / 100; m.tourTax = T.tourism / 10;
  m.growth *= 1 - Math.max(0, T.business - 12) * 0.012; m.rev *= 1 - Math.max(0, T.business - 18) * 0.006;
  m.demand *= 1 - T.sales * 0.006; m.tour *= 1 - Math.max(0, T.tourism - 10) * 0.015;
  if (T.income > 16) m.growth *= 1 - (T.income - 16) * 0.01;                       // migration / growth
  // inflation expectations: high → companies raise prices (pricing AI), investment slows
  if (P.infl.exp > 0.05) m.growth *= 1 - Math.min(0.15, (P.infl.exp - 0.05) * 1.5);
  // shocks
  P.shocks.forEach(function (s) {
    if (s.until <= S.clock.runSec) return;
    const D = E2_SHOCKS[s.id], k = e2ShockK(s), x = D.mods;
    if (x.rev) m.rev *= 1 + x.rev * k; if (x.growth) m.growth *= 1 + x.growth * k; if (x.hap) m.hap += x.hap * k; if (x.jobs) m.jobs *= 1 + x.jobs * k;
    if (x.importMult) m.importMult *= 1 + (1 / x.importMult - 1) * k * (s.resp === 'reroute' ? 0.5 : 1);
    if (s.resp === 'ration') { m.hap -= s.id === 'food' ? 5 : 3; if (s.id === 'energy') m.powerDemand *= 0.9; }
    if (s.resp === 'guarantee') m.hap += 2;
    if (s.resp === 'permits') m.growth *= 1.05;
    if (s.resp === 'build') m.growth *= 1.1;
    if (s.resp === 'tax') m.bizTax += 0.02;
    if (s.resp === 'invest') m.rp *= 1.15;
    if (s.resp === 'local') m.production *= 1.1;
  });
}
(function () {
  const gm = window.globalMods;
  if (typeof gm === 'function' && !gm.__p17) { window.globalMods = function () { const m = gm.apply(this, arguments); try { part17Mods(m); } catch (e) { if (typeof logError === 'function') logError('Economy 2.0 mods', e && e.message); } return m; }; window.globalMods.__p17 = true; }
})();

/* ---------------------------------------- ticks ---------------------------------------- */
function part17Tick() {
  if (!S || !STARTED || (S.p5 && S.p5.admin.freeze) || (typeof BCT_SANDBOX !== 'undefined' && BCT_SANDBOX.on)) return;
  const P = p17(), hour = Math.floor(S.clock.gameSec / 3600), day = gameDay();
  if (E2.hourKey !== hour) {
    const t0 = performance.now(); E2.hourKey = hour;
    e2Tax(); e2MarketHour(); e2JobsHour(); e2HouseholdsHour(); e2HousingHour(); e2CoPass(false);
    E2.prof.hour = performance.now() - t0;
  }
  if (P.day !== day) {
    const t0 = performance.now(), first = !P.day; P.day = day;
    e2MarketDay(); e2CoPass(true); e2InflDay(); e2BankingDay(); e2GdpDay(); e2SentimentDay();
    if (!first) { e2ShocksDay(); e2NewsDay(); e2AlertsDay(); }
    // salary dynamics move the wage index a little each day (inflationTick keeps doing the big moves)
    if (S.p6 && S.p6.econ && P.jobs.pressure) S.p6.econ.wage = clamp(S.p6.econ.wage * (1 + P.jobs.pressure), 50, 1e4);
    const H = P.hist;
    e2Push(H.gdp, P.gdp.total); e2Push(H.infl, S.p6 ? S.p6.econ.infl * 100 : 0); e2Push(H.unemp, (SIM.unemployment || 0) * 100); e2Push(H.house, P.housing.price);
    e2Push(H.rent, P.housing.rent); e2Push(H.stock, e2StockIndex()); e2Push(H.trade, P.gdp.trade); e2Push(H.pop, S.city.population); e2Push(H.salary, P.jobs.salary);
    E2.prof.day = performance.now() - t0; E2.dirtyUi++;
  }
  E2.prof.n++;
}
/* economic alerts (one per kind per day, through the existing notification system) */
function e2AlertsDay() {
  const P = p17(), H = P.hist, A = P.alerts, day = gameDay();
  const once = function (k, msg, cls) { if (A[k] === day) return; A[k] = day; notify(msg, cls || ''); };
  if (P.housing.crisis && H.house.length > 2) {
    P.housing.crisisDays++;
    const pr = H.house[H.house.length - 1] / Math.max(1, H.house[Math.max(0, H.house.length - 4)]) - 1, rn = H.rent[H.rent.length - 1] / Math.max(1, H.rent[Math.max(0, H.rent.length - 4)]) - 1;
    once('housing', '🏠 ECONOMIC ALERT — Housing market is overheating. Rent ' + (rn >= 0 ? '+' : '') + Math.round(rn * 100) + '% · house prices ' + (pr >= 0 ? '+' : '') + Math.round(pr * 100) + '% · construction demand +' + Math.round(Math.max(0, (SIM.housingDemandRatio || 1) - 1) * 100) + '%. Build homes or zone more residential.', 'bad');
  } else P.housing.crisisDays = 0;
  if (P.jobs.level === 'Crisis') once('jobs', '💼 ECONOMIC ALERT — Unemployment crisis (' + Math.round((SIM.unemployment || 0) * 100) + '%). Consumption and tax income fall: open businesses, cut business tax or invest.', 'bad');
  if (P.infl.exp > 0.08) once('infl', '💹 ECONOMIC ALERT — Inflation expectations at ' + (P.infl.exp * 100).toFixed(1) + '%: companies raise prices and workers ask for more.', 'bad');
}

/* ---------------------------------------- advice · report · debug ---------------------------------------- */
function e2Advice() {
  const P = S.p17; if (!P) return [];
  const out = [], imp = (SIM.importValue || 0), ex = (SIM.exportValue || 0);
  if ((SIM.housingDemandRatio || 1) > 1.15) out.push('💡 Housing demand is rising faster than supply.');
  const u = P.hist.unemp; if (u.length > 3 && u[u.length - 1] > u[u.length - 4] + 1.5) out.push('💡 Unemployment is increasing.');
  if (['bread', 'food'].some(function (g) { return e2Change(g) > 0.04 && (S.economy.inventory[g] || 0) < 40; })) out.push('💡 Food prices are rising due to low inventory.');
  if (imp > ex * 1.6 && imp > 5) out.push('💡 Your city is heavily dependent on imports.');
  if (P.housing.vacancy > 0.25) out.push('💡 Many homes are empty — rents and prices are falling.');
  if (e2Tax().business > 18) out.push('💡 Business tax above 18 % slows company growth.');
  return out;
}
function e2ReportLines() {
  const P = S.p17; if (!P || P.hist.gdp.length < 2) return [];
  const d = function (a) { return a.length > 1 ? a[a.length - 1] - a[a.length - 2] : 0; }, H = P.hist;
  return [['🌍 GDP', money(P.gdp.total) + ' (' + (P.gdp.growth >= 0 ? '+' : '') + (P.gdp.growth * 100).toFixed(1) + '%)'], ['💼 Jobs', fmt(Math.round(SIM.jobs || 0)) + ' · unemployment ' + (SIM.unemployment * 100).toFixed(1) + '% (' + (d(H.unemp) >= 0 ? '+' : '') + d(H.unemp).toFixed(1) + ')'],
    ['💹 Inflation', ((S.p6 ? S.p6.econ.infl : 0) * 100).toFixed(1) + '%'], ['🏠 Housing', money(P.housing.price) + ' · rent ' + money(P.housing.rent) + '/mo · ' + P.housing.affordClass], ['🏢 Business', e2Phase() + ' · sentiment ' + P.sentiment],
    ['🚢 Trade', signMoney(P.gdp.trade) + '/day'], ['🏛 Budget', signMoney((SIM.bNet || 0) * 1200) + '/day']];
}
function p17DebugLines() {
  const P = S && S.p17; if (!P) return '';
  return 'ECONOMY 2.0 hourly ' + E2.prof.hour.toFixed(2) + ' ms · daily ' + E2.prof.day.toFixed(2) + ' ms · companies ' + Object.keys(P.co).length + ' · ' + e2Phase() + ' · sentiment ' + P.sentiment + ' · shocks ' + P.shocks.map(function (s) { return s.id + '/' + E2_SEV[s.sev]; }).join(',') +
    '\nmarket: ' + ['bread', 'fuel', 'materials', 'electronics'].map(function (g) { return g + ' ' + e2GoodPrice(g).toFixed(2) + ' (' + (e2Change(g) * 100).toFixed(1) + '%)'; }).join(' · ') + ' · GDP ' + money(P.gdp.total) + ' · housing ' + money(P.housing.price) + ' vac ' + Math.round(P.housing.vacancy * 100) + '% · loans ' + JSON.stringify(P.bank.loanStages) + '\n';
}
(function () {
  const dl = window.veDebugLines;
  if (typeof dl === 'function' && !dl.__p17) { window.veDebugLines = function () { return dl.apply(this, arguments) + p17DebugLines(); }; window.veDebugLines.__p17 = true; }
})();

/* ---------------------------------------- admin (OWNER / ADMIN only, guarded) ---------------------------------------- */
function adminEcon2(a, v) {
  const s = String(a);
  if (s.indexOf('shock:') === 0) { const p = s.split(':'); const r = e2ShockStart(p[1], +p[2] || 1); return r ? { ok: true, msg: E2_SHOCKS[p[1]].name + ' started' } : { ok: false, reason: 'already active' }; }
  if (s === 'endShocks') { p17().shocks.forEach(function (x) { x.until = S.clock.runSec; }); return { ok: true, msg: 'Shocks ended' }; }
  if (s === 'tick') { E2.hourKey = -1; p17().day = 0; part17Tick(); return { ok: true, msg: 'Economic tick run' }; }
  if (s === 'phase' && typeof forceEconPhase === 'function') { forceEconPhase(v); return { ok: true, msg: 'Cycle → ' + v }; }
  return { ok: false, reason: 'unknown action' };
}
if (typeof adminWrap === 'function') adminWrap('adminEcon2', function (a) { return 'econ2:' + String(a).split(':')[0]; });
if (typeof ADMIN_CMD_CAT !== 'undefined') ['econ2:shock', 'econ2:endShocks', 'econ2:tick', 'econ2:phase'].forEach(function (k) { ADMIN_CMD_CAT[k] = 'city'; });

/* the economy engine joins the fixed-timestep systems (1 sim second; the work itself is hourly / daily) */
if (typeof Game !== 'undefined' && Game.simSystems && !Game.simSystems.some(function (s) { return s.name === 'Economy2'; })) Game.simSystems.push({ name: 'Economy2', every: 1, acc: 0, tick: function () { part17Tick(); } });
