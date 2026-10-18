'use strict';
/* BLOCK CITY TYCOON — GOVERNMENT ENGINE 2.0 · CORE (Part 18 · v2.6.0)
   GovernmentEngine
   ├── BudgetSystem          income / expenses by category (from the real econTick ledger), balance, city debt (loans),
   │                          interest payments, emergency reserve, monthly / yearly change, deficit warnings
   ├── TaxSystem             residential · commercial · industrial · corporate · property tax (EconomyEngine 2.0 uses them)
   ├── PublicServiceSystem   gov-services.js: healthcare, education, police, fire, transport, waste, water, electricity,
   │   Healthcare/Education/  road maintenance, parks — capacity, coverage, quality, budget, workers, maintenance,
   │   Police/Fire/…          satisfaction, response times; district statistics; maintenance levels
   ├── CitizenSatisfaction + CityApproval   gov-services.js
   ├── PolicySystem + ProjectSystem + government events   gov-policy.js
   └── GovernmentReportSystem + dashboard, heatmaps, advisor, admin   gov-ui.js
   Frequencies: public services, satisfaction, maintenance, projects — every game hour; budget, reports, events,
   approval history — every game day. Nothing runs per frame; caches are keyed by MAP.version and the game hour.
   Random choices use the city's saved, seeded RNG stream (no new random system). Every subsystem runs inside a
   guard: an error is logged and the rest of the government (and the game) keeps running. */

const GOV = { hourKey: -1, prof: { hour: 0, day: 0 }, errors: 0, lastErr: '', cache: {}, dirtyUi: 0 };
/* public services: id, name, icon, which city buildings belong to it, Part 10 maintenance network it drives */
const GOV_SERVICES = [
  ['health', 'Healthcare', '🏥', function (d) { return d.service === 'health'; }],
  ['education', 'Education', '🎓', function (d) { return !!(d.edu || d.eduLvl || d.sector === 'EDUCATION' || d.cat === 'Science'); }],
  ['police', 'Police', '🚓', function (d) { return d.service === 'police'; }],
  ['fire', 'Fire', '🚒', function (d) { return d.service === 'fire'; }],
  ['transport', 'Public Transport', '🚌', function (d) { return !!d.transit || d.cat === 'Transport'; }],
  ['waste', 'Waste Management', '🗑️', function (d) { return d.cat === 'Waste'; }],
  ['water', 'Water', '💧', function (d) { return d.water > 0; }],
  ['electricity', 'Electricity', '⚡', function (d) { return d.power > 0; }],
  ['roads', 'Road Maintenance', '🛣️', function (d) { return d.id === 'maintdepot'; }],
  ['parks', 'Parks', '🌳', function (d) { return !!d.hap || d.cat === 'Leisure'; }]
];
const GOV_MAINT_LINK = { roads: 'roads', water: 'water', electricity: 'power', transport: 'rail', parks: 'buildings' };   // funding → S.p10.maint network
const GOV_TAXES = [['residential', 'Residential Tax', 0, 30], ['commercial', 'Commercial Tax', 0, 30], ['industrial', 'Industrial Tax', 0, 30], ['corporate', 'Corporate Tax', 0, 30], ['property', 'Property Tax', 0, 20]];
const GOV_INCOME = [['residential', 'Residential Tax'], ['commercial', 'Commercial Tax'], ['industrial', 'Industrial Tax'], ['corporate', 'Corporate Tax'], ['tourism', 'Tourism Tax'], ['property', 'Property Tax'], ['fees', 'Service Fees'], ['transport', 'Transport Revenue'], ['utility', 'Utility Revenue'], ['grants', 'Government Grants'], ['special', 'Special Revenue']];
const GOV_EXPENSE = [['education', 'Education'], ['health', 'Healthcare'], ['police', 'Police'], ['fire', 'Fire'], ['roads', 'Road Maintenance'], ['transport', 'Public Transport'], ['water', 'Water'], ['electricity', 'Electricity'], ['waste', 'Waste Management'], ['parks', 'Parks'], ['emergency', 'Emergency Services'], ['projects', 'Construction Projects'], ['debt', 'Debt Payments'], ['other', 'Administration']];

/* ---------------------------------------- state · save 3.1 ---------------------------------------- */
function newGov() {
  const funding = {}; GOV_SERVICES.forEach(function (s) { funding[s[0]] = 1; });
  return {
    v: 1, day: 0,
    budget: { funding: funding, loans: [], nextLoan: 1, reserve: 0, reserveRate: 0.05, deficitDays: 0, today: { inc: {}, exp: {} }, last: { inc: {}, exp: {}, balance: 0 }, hist: [], hourly: [], interestPaid: 0 },
    taxes: null,                         // created on the first tick from the city's current tax rates (old saves keep their numbers)
    services: {}, maint: {}, districts: [], sat: {}, approval: { value: 60, label: 'Stable', hist: [] },
    policies: { active: {}, log: [] }, projects: [], nextProject: 1,
    events: { active: [], log: [] }, reports: [], alerts: {}
  };
}
function gov() { if (!S.government) S.government = newGov(); return S.government; }
function sanitizeGov(src) {
  const o = newGov();
  if (!src || typeof src !== 'object') return o;
  const n = function (v, d, lo, hi) { v = +v; return isFinite(v) ? Math.min(hi === undefined ? 1e15 : hi, Math.max(lo === undefined ? -1e15 : lo, v)) : d; };
  const str = function (v, max) { return typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, max || 40) : ''; };
  o.day = n(src.day, 0, 0);
  const b = src.budget && typeof src.budget === 'object' ? src.budget : {};
  if (b.funding && typeof b.funding === 'object') GOV_SERVICES.forEach(function (s) { o.budget.funding[s[0]] = n(b.funding[s[0]], 1, 0, 1.5); });
  o.budget.loans = Array.isArray(b.loans) ? b.loans.slice(0, 8).filter(function (l) { return l && typeof l === 'object'; }).map(function (l) { return { id: n(l.id, 1, 1) | 0, principal: n(l.principal, 0, 0), remaining: n(l.remaining, 0, 0), rate: n(l.rate, 0.05, 0.01, 0.5), perDay: n(l.perDay, 0, 0), day: n(l.day, 0, 0) }; }).filter(function (l) { return l.remaining > 0; }) : [];
  o.budget.nextLoan = n(b.nextLoan, 1, 1) | 0; o.budget.reserve = n(b.reserve, 0, 0); o.budget.reserveRate = n(b.reserveRate, 0.05, 0, 0.3); o.budget.deficitDays = n(b.deficitDays, 0, 0) | 0; o.budget.interestPaid = n(b.interestPaid, 0, 0);
  ['today', 'last'].forEach(function (k) { const x = b[k]; if (!x || typeof x !== 'object') return; ['inc', 'exp'].forEach(function (q) { if (x[q] && typeof x[q] === 'object') Object.keys(x[q]).slice(0, 20).forEach(function (c) { if (/^\w{1,16}$/.test(c)) o.budget[k][q][c] = n(x[q][c], 0); }); }); if (k === 'last') o.budget.last.balance = n(x.balance, 0); });
  o.budget.hist = Array.isArray(b.hist) ? b.hist.slice(-240).map(function (h) { return { d: n(h && h.d, 0, 0) | 0, inc: n(h && h.inc, 0), exp: n(h && h.exp, 0), budget: n(h && h.budget, 0) }; }) : [];
  o.budget.hourly = Array.isArray(b.hourly) ? b.hourly.slice(-48).map(function (v) { return n(v, 0); }) : [];
  if (src.taxes && typeof src.taxes === 'object') { o.taxes = {}; GOV_TAXES.forEach(function (t) { o.taxes[t[0]] = n(src.taxes[t[0]], t[0] === 'property' ? 1 : t[0] === 'corporate' ? 0 : 10, t[2], t[3]); }); }
  const ap = src.approval || {}; o.approval.value = n(ap.value, 60, 0, 100); o.approval.label = govApprovalLabel(o.approval.value); o.approval.hist = Array.isArray(ap.hist) ? ap.hist.slice(-240).map(function (v) { return n(v, 60, 0, 100); }) : [];
  if (src.sat && typeof src.sat === 'object') Object.keys(src.sat).slice(0, 16).forEach(function (k) { if (/^\w{1,16}$/.test(k)) o.sat[k] = n(src.sat[k], 50, 0, 100); });
  if (src.policies && src.policies.active && typeof src.policies.active === 'object') Object.keys(src.policies.active).forEach(function (k) { if (typeof GOV_POLICIES === 'undefined' || !GOV_POLICIES[k]) return; const a = src.policies.active[k] || {}; o.policies.active[k] = { since: n(a.since, 0, 0), until: n(a.until, 0, 0) }; });
  if (src.policies && Array.isArray(src.policies.log)) o.policies.log = src.policies.log.slice(0, 30).map(function (l) { return { d: n(l && l.d, 0, 0) | 0, id: str(l && l.id, 24), on: !!(l && l.on) }; });
  if (Array.isArray(src.projects)) o.projects = src.projects.slice(0, 24).filter(function (p) { return p && typeof p === 'object' && typeof GOV_PROJECTS !== 'undefined' && GOV_PROJECTS[p.type]; }).map(function (p) {
    return { id: n(p.id, 1, 1) | 0, type: p.type, prio: ['low', 'normal', 'high', 'emergency'].indexOf(p.prio) >= 0 ? p.prio : 'normal', status: ['planned', 'building', 'done', 'cancelled', 'failed'].indexOf(p.status) >= 0 ? p.status : 'planned', b: n(p.b, 0, 0) | 0, progress: n(p.progress, 0, 0, 1), cost: n(p.cost, 0, 0), paid: n(p.paid, 0, 0), start: n(p.start, 0, 0), done: n(p.done, 0, 0), note: str(p.note, 80), x: n(p.x, -1, -1) | 0, y: n(p.y, -1, -1) | 0 };
  });
  o.nextProject = Math.max(n(src.nextProject, 1, 1) | 0, o.projects.reduce(function (a, p) { return Math.max(a, p.id + 1); }, 1));
  if (src.events) { if (Array.isArray(src.events.active)) o.events.active = src.events.active.slice(0, 12).filter(function (e) { return e && typeof GOV_EVENTS !== 'undefined' && GOV_EVENTS[e.id]; }).map(function (e) { return { id: e.id, start: n(e.start, 0, 0), until: n(e.until, 0, 0) }; }); if (Array.isArray(src.events.log)) o.events.log = src.events.log.slice(0, 40).map(function (e) { return { d: n(e && e.d, 0, 0) | 0, id: str(e && e.id, 24) }; }); }
  if (Array.isArray(src.reports)) o.reports = src.reports.slice(-10).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) { const x = {}; Object.keys(r).slice(0, 30).forEach(function (k) { const v = r[k]; if (typeof v === 'number' && isFinite(v)) x[k] = v; else if (typeof v === 'string') x[k] = str(v, 160); else if (Array.isArray(v)) x[k] = v.slice(0, 6).map(function (t) { return str(String(t), 160); }); }); return x; });
  if (src.alerts && typeof src.alerts === 'object') Object.keys(src.alerts).slice(0, 30).forEach(function (k) { o.alerts[k] = n(src.alerts[k], 0, 0) | 0; });
  return o;
}
function govApprovalLabel(v) { return v >= 90 ? 'Excellent' : v >= 75 ? 'Very Good' : v >= 60 ? 'Stable' : v >= 40 ? 'Warning' : v >= 20 ? 'Critical' : 'Collapse'; }
function govMaintLabel(v) { return v >= 87.5 ? 'Excellent' : v >= 62.5 ? 'Good' : v >= 37.5 ? 'Warning' : v >= 12.5 ? 'Critical' : 'Failed'; }
function govSafe(name, fn) { try { return fn(); } catch (e) { GOV.errors++; GOV.lastErr = name + ': ' + (e && e.message); if (typeof logError === 'function') logError('Government ' + name, e && e.message); return null; } }
function govServiceOf(d) { for (let i = 0; i < GOV_SERVICES.length; i++) if (GOV_SERVICES[i][3](d)) return GOV_SERVICES[i][0]; return null; }

/* ---------------------------------------- tax system ---------------------------------------- */
function govTaxes() {
  const G = gov(), p17t = typeof e2Tax === 'function' && S.p17 ? e2Tax() : null;
  if (!G.taxes) G.taxes = { residential: S.city.tax, commercial: p17t ? p17t.business : S.city.tax, industrial: p17t ? p17t.business : S.city.tax, corporate: 0, property: p17t ? p17t.property : 1 };
  const T = G.taxes;
  T.residential = S.city.tax;                                 // the classic tax slider stays the residential (income) tax
  if (p17t) { T.property = p17t.property = clamp(T.property, 0, 20); p17t.business = Math.round((T.commercial + T.industrial) / 2); }
  return T;
}
function govSetTax(kind, v) {
  const t = GOV_TAXES.find(function (x) { return x[0] === kind; }); if (!t) return false;
  const T = govTaxes(); T[kind] = clamp(Math.round(+v * (kind === 'property' ? 10 : 1)) / (kind === 'property' ? 10 : 1), t[2], t[3]);
  if (kind === 'residential') S.city.tax = T.residential;
  if (kind === 'property' && S.p17 && typeof e2Tax === 'function') e2Tax().property = T.property;
  govTaxes(); GOV.dirtyUi++;
  return true;
}
/* tax pressure 0–100: how far the rates are above the comfortable level (non-linear) */
function govTaxPressure(T) {
  T = T || govTaxes();
  const over = Math.max(0, T.residential - 12) * 1.2 + Math.max(0, T.commercial - 14) + Math.max(0, T.industrial - 14) * 0.8 + Math.max(0, T.corporate - 10) * 0.8 + Math.max(0, T.property - 2) * 2.5;
  return clamp(over * 2.2, 0, 100);
}
/* the Part 17 business slider moves both commercial and industrial tax */
(function () {
  const ap = window.e2ApplyTaxes;
  if (typeof ap === 'function' && !ap.__p18) { window.e2ApplyTaxes = function () { const r = ap.apply(this, arguments); if (S.p17 && S.p17.tax && S.government) { const biz = S.p17.tax.business, pr = S.p17.tax.property, T = gov().taxes || govTaxes(); T.commercial = T.industrial = biz; T.property = pr; govTaxes(); } return r; }; window.e2ApplyTaxes.__p18 = true; }
  if (typeof E2_TAXES !== 'undefined') E2_TAXES.forEach(function (t) { if (t[0] === 'property') t[3] = 20; });   // property tax range 0–20 %
})();

/* ---------------------------------------- budget system ---------------------------------------- */
function govIncomeNow() {
  const B = SIM.B || {}, ts = SIM.taxSplit || {}, biz = B.businessTax || 0, com = Math.min(biz, ts.commercial || 0), ind = Math.min(biz - com, ts.industrial || 0);
  return { residential: B.incomeTax || 0, commercial: com, industrial: ind, corporate: B.corporateTax || 0, tourism: B.tourism || 0, property: B.propertyTax || 0, fees: (B.utilities || 0) + (B.salesTax || 0), transport: B.fares || 0, utility: B.energy || 0, grants: B.grant || 0, special: (B.space || 0) + (B.rent || 0) + Math.max(0, biz - com - ind) };
}
function govExpenseNow() {
  const out = {}, BE = SIM.BE || {}; GOV_EXPENSE.forEach(function (e) { out[e[0]] = 0; });
  for (let i = 0; i < S.buildings.list.length; i++) {
    const b = S.buildings.list[i]; if (b.owner !== 'city' || !b._cost) continue;
    const d = bdef(b), s = govServiceOf(d);
    if (s && out[s] !== undefined) out[s] += b._cost; else if (d.service || d.cat === 'Emergency') out.emergency += b._cost; else out.other += b._cost;
  }
  out.roads += BE.roads || 0; out.electricity += BE.fuel || 0;
  return out;
}
function govBudgetHour() {
  const G = gov(), Bt = G.budget.today, H = 3600 / TIME_SCALE, inc = govIncomeNow(), exp = govExpenseNow();
  Object.keys(inc).forEach(function (k) { Bt.inc[k] = (Bt.inc[k] || 0) + inc[k] * H; });
  Object.keys(exp).forEach(function (k) { Bt.exp[k] = (Bt.exp[k] || 0) + exp[k] * H; });
  G.budget.hourly.push(Math.round(S.budget)); if (G.budget.hourly.length > 48) G.budget.hourly.shift();
  // emergency reserve: the reserve steps in before services go unpaid
  if (S.budget < Math.max(200, (SIM.bExp || 0) * H) && G.budget.reserve > 0) { const need = Math.min(G.budget.reserve, Math.max(200, (SIM.bExp || 0) * H * 3) - S.budget); if (need > 0) { G.budget.reserve -= need; S.budget += need; govAlert('reserveUse', '🏦 Emergency reserve used: ' + money(need) + ' moved into the city budget to keep services paid.', ''); } }
}
function govBudgetDay() {
  const G = gov(), Bb = G.budget, day = gameDay();
  // debt payments (principal + interest), paid from the city budget; arrears stay on the loan
  let paid = 0, interest = 0;
  Bb.loans.forEach(function (l) {
    const due = Math.min(l.remaining, l.perDay), cash = Math.max(0, S.budget), pay = Math.min(due, cash);
    const int = l.remaining * l.rate / 8;                          // annual rate, 1 game year = 8 days
    S.budget -= pay; l.remaining = Math.max(0, l.remaining - pay + Math.max(0, int - pay * 0.25)); paid += pay; interest += int;
  });
  Bb.loans = Bb.loans.filter(function (l) { return l.remaining > 1; });
  Bb.interestPaid += interest; Bb.today.exp.debt = (Bb.today.exp.debt || 0) + paid;
  const inc = Object.keys(Bb.today.inc).reduce(function (a, k) { return a + Bb.today.inc[k]; }, 0), exp = Object.keys(Bb.today.exp).reduce(function (a, k) { return a + Bb.today.exp[k]; }, 0), bal = inc - exp;
  // emergency reserve: a share of every surplus is put aside
  if (bal > 0 && Bb.reserveRate > 0 && S.budget > bal * Bb.reserveRate) { const put = bal * Bb.reserveRate; S.budget -= put; Bb.reserve += put; }
  Bb.last = { inc: Bb.today.inc, exp: Bb.today.exp, balance: bal }; Bb.today = { inc: {}, exp: {} };
  Bb.hist.push({ d: day, inc: Math.round(inc), exp: Math.round(exp), budget: Math.round(S.budget) }); if (Bb.hist.length > 240) Bb.hist.shift();
  Bb.deficitDays = bal < 0 ? Bb.deficitDays + 1 : 0;
  if (bal < 0) govAlert('deficit', '📉 BUDGET DEFICIT: ' + signMoney(bal) + ' yesterday (' + Bb.deficitDays + ' day' + (Bb.deficitDays > 1 ? 's' : '') + ' in a row). Raise taxes, cut service funding or take a city loan.', 'bad');
}
function govBudgetSummary() {
  const G = gov(), Bb = G.budget, L = Bb.last, inc = Object.keys(L.inc).reduce(function (a, k) { return a + L.inc[k]; }, 0), exp = Object.keys(L.exp).reduce(function (a, k) { return a + L.exp[k]; }, 0);
  const debt = Bb.loans.reduce(function (a, l) { return a + l.remaining; }, 0), h = Bb.hist, hh = Bb.hourly;
  const month = hh.length > 16 ? S.budget - hh[hh.length - 17] : 0, year = h.length > 8 ? S.budget - h[h.length - 9].budget : 0;     // 1 game month ≈ 16 game hours, 1 year = 8 days
  return { income: inc, expenses: exp, balance: inc - exp, debt: debt, interest: debt * (Bb.loans.length ? Bb.loans[0].rate : 0) / 8, reserve: Bb.reserve, month: month, year: year, budget: S.budget, deficit: inc - exp < 0, deficitDays: Bb.deficitDays };
}
function govBorrow(amount) {
  const G = gov(), Bb = G.budget, inc = Math.max(1, govBudgetSummary().income || (SIM.bInc || 0) * 1200), cap = inc * 4, debt = Bb.loans.reduce(function (a, l) { return a + l.remaining; }, 0);
  amount = Math.round(+amount || 0);
  if (amount <= 0) return { ok: false, reason: 'Amount must be positive' };
  if (debt + amount > cap) return { ok: false, reason: 'Credit limit ' + money(cap) + ' (4 days of income) — current debt ' + money(debt) };
  if (Bb.loans.length >= 8) return { ok: false, reason: 'At most 8 city loans' };
  const rate = (typeof interestRate === 'function' ? interestRate() : 0.05) + 0.015 + debt / cap * 0.03, days = 16;
  Bb.loans.push({ id: Bb.nextLoan++, principal: amount, remaining: amount * (1 + rate * days / 8 * 0.5), rate: rate, perDay: amount * (1 + rate * days / 8 * 0.5) / days, day: gameDay() });
  S.budget = Math.min(MONEY_CAP, S.budget + amount); GOV.dirtyUi++;
  return { ok: true, msg: 'City loan ' + money(amount) + ' at ' + (rate * 100).toFixed(2) + '% · repaid over ' + days + ' days' };
}
function govRepay(id) {
  const Bb = gov().budget, l = Bb.loans.find(function (x) { return x.id === id; }); if (!l) return { ok: false, reason: 'No such loan' };
  if (S.budget < l.remaining) return { ok: false, reason: 'Needs ' + money(l.remaining) };
  S.budget -= l.remaining; Bb.loans = Bb.loans.filter(function (x) { return x !== l; }); GOV.dirtyUi++;
  return { ok: true, msg: 'Loan repaid' };
}
function govAlert(key, msg, cls) { const G = gov(), d = gameDay(); if (G.alerts[key] === d) return false; G.alerts[key] = d; notify(msg, cls || ''); return true; }

/* ---------------------------------------- modifiers into the economy ---------------------------------------- */
function govFund(d) { const s = govServiceOf(d); return s ? clamp(gov().budget.funding[s], 0, 1.5) : 1; }
function partGovMods(m) {
  if (!S || !S.government) return;
  const G = S.government, T = govTaxes(), F = G.budget.funding, sv = G.services;
  m.govFund = govFund;
  // taxes (EconomyEngine 2.0 collects them; the effects are non-linear)
  m.bizTaxCom = T.commercial / 100; m.bizTaxInd = T.industrial / 100; m.corpTax = T.corporate / 100; m.propTax = T.property;
  const tp = govTaxPressure(T);
  m.hap -= Math.pow(tp / 100, 1.4) * 9;
  m.growth *= 1 - Math.pow(tp / 100, 1.6) * 0.25;
  m.commRev *= 1 - Math.max(0, T.commercial - 18) * 0.01; m.production *= 1 - Math.max(0, T.industrial - 18) * 0.008; m.rev *= 1 - Math.max(0, T.corporate - 15) * 0.004;
  if (T.residential < 6) m.growth *= 1.04;                       // low taxes attract residents
  // public services → economy
  const q = function (id) { return sv[id] ? sv[id].quality : 60; };
  m.labor = (m.labor || 1) * (0.94 + 0.08 * q('health') / 100);  // healthcare → workforce availability
  m.rev *= 0.97 + 0.06 * q('education') / 100;                    // education → productivity
  m.logistics = (m.logistics || 1) * (0.92 + 0.12 * q('roads') / 100); m.logiCost = (m.logiCost || 1) * (1.08 - 0.12 * q('transport') / 100);   // transport → logistics
  m.transit *= 0.85 + 0.3 * Math.min(1, F.transport);
  m.crimeAdj = (m.crimeAdj || 0) + (sv.police ? clamp((sv.police.resp - 8) * 0.6, -6, 10) - (q('police') - 60) * 0.08 : 0);
  m.hap += (q('health') - 60) * 0.03 + (q('parks') - 60) * 0.02;
  const mt = G.maint, mavg = mt.avg === undefined ? 70 : mt.avg;
  m.growth *= 0.92 + 0.12 * mavg / 100;                           // infrastructure → company / city growth
  if (mt.roads && mt.roads.level === 'Failed') m.roadCap *= 0.85;
  if (mt.water && mt.water.level === 'Failed') m.waterProd *= 0.85;
  if (G.approval) m.growth *= 0.96 + G.approval.value / 1250;     // approval → migration
  if (typeof govPolicyMods === 'function') govPolicyMods(m);
  if (typeof govEventMods === 'function') govEventMods(m);
}
(function () {
  const gm = window.globalMods;
  if (typeof gm === 'function' && !gm.__p18) { window.globalMods = function () { const m = gm.apply(this, arguments); govSafe('mods', function () { partGovMods(m); }); return m; }; window.globalMods.__p18 = true; }
  // government spending is part of GDP (C + I + G)
  const gd = window.cityGDP;
  if (typeof gd === 'function' && !gd.__p18) { window.cityGDP = function () { const g = gd.apply(this, arguments); return S && S.government ? g + Math.max(0, SIM.bExp || 0) * 0.5 * YEAR_GAME_SEC / TIME_SCALE : g; }; window.cityGDP.__p18 = true; }
  // education funding → the education pipeline (seats, teachers)
  const et = window.p10EduTarget;
  if (typeof et === 'function' && !et.__p18) { window.p10EduTarget = function () { const v = et.apply(this, arguments); if (!S || !S.government) return v; const f = S.government.budget.funding.education; return clamp(v * (0.8 + 0.2 * Math.min(1.5, f)) + (typeof govPolicyActive === 'function' && govPolicyActive('freeEdu') ? 6 : 0), 0, 100); }; window.p10EduTarget.__p18 = true; }
})();
/* service funding drives the Part 10 maintenance networks (roads, water, power, rail, buildings) both ways */
function govMaintSync() {
  if (!S.p10 || !S.p10.maint) return;
  const F = gov().budget.funding, M = S.p10.maint, last = GOV.cache.maintSet || {};
  Object.keys(GOV_MAINT_LINK).forEach(function (svc) {
    const k = GOV_MAINT_LINK[svc]; if (M[k] === undefined) return;
    if (last[k] !== undefined && Math.abs(M[k] - last[k]) > 0.001) F[svc] = clamp(M[k], 0, 1.5);   // changed in the Living City hub → follow it
    const boost = svc === 'roads' && typeof govPolicyActive === 'function' && govPolicyActive('roadMaint') ? 0.4 : 0;
    M[k] = clamp(F[svc] + boost, 0, 2); last[k] = M[k];
  });
  GOV.cache.maintSet = last;
}

/* ---------------------------------------- scheduler ---------------------------------------- */
function govTick() {
  if (!S || !STARTED || (S.p5 && S.p5.admin.freeze) || (typeof BCT_SANDBOX !== 'undefined' && BCT_SANDBOX.on)) return;
  const G = gov(), hour = Math.floor(S.clock.gameSec / 3600), day = gameDay();
  if (GOV.ref !== G) { GOV.ref = G; GOV.hourKey = -1; GOV.cache = {}; }       // another city was loaded: drop the runtime caches
  if (GOV.hourKey !== hour) {
    const t0 = performance.now(); GOV.hourKey = hour;
    govSafe('taxes', govTaxes); govSafe('maintenance sync', govMaintSync); govSafe('budget', govBudgetHour);
    if (typeof govServicesHour === 'function') govSafe('services', govServicesHour);
    if (typeof govMaintenanceHour === 'function') govSafe('maintenance', govMaintenanceHour);
    if (typeof govDistrictsHour === 'function') govSafe('districts', govDistrictsHour);
    if (typeof govSatisfactionHour === 'function') govSafe('satisfaction', govSatisfactionHour);
    if (typeof govPoliciesHour === 'function') govSafe('policies', govPoliciesHour);
    if (typeof govProjectsHour === 'function') govSafe('projects', govProjectsHour);
    GOV.prof.hour = performance.now() - t0; GOV.dirtyUi++;
  }
  if (G.day !== day) {
    const t0 = performance.now(), first = !G.day; G.day = day;
    if (!first) {
      govSafe('budget day', govBudgetDay);
      if (typeof govEventsDay === 'function') govSafe('events', govEventsDay);
      if (typeof govReportDay === 'function') govSafe('report', govReportDay);
    }
    G.approval.hist.push(Math.round(G.approval.value)); if (G.approval.hist.length > 240) G.approval.hist.shift();
    GOV.prof.day = performance.now() - t0; GOV.dirtyUi++;
  }
}
if (typeof Game !== 'undefined' && Game.simSystems && !Game.simSystems.some(function (s) { return s.name === 'Government'; })) Game.simSystems.push({ name: 'Government', every: 1, acc: 0, tick: function () { govTick(); } });
