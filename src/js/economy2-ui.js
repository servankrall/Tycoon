'use strict';
/* BLOCK CITY TYCOON — ECONOMY 2.0 UI (Part 17)
   One ECONOMY center for Windows and Android (responsive modal, scrollable, touch-sized controls): Overview (city
   economic dashboard), Market (categories, search, price history), Companies (sector market share, a paginated company
   list — never 10,000 DOM cards — and a company dashboard), Housing (districts, affordability, mortgage calculator),
   Banking (central bank, banks, loan stages, credit), Trade, Taxes (5 taxes with a revenue forecast before applying),
   Shocks (alerts with policy responses) and Graphs (7 days … 25 years). Plus economy heatmaps, search, palette,
   advisor, daily report lines and the guarded admin view. */
const E2UI = { tab: 'overview', cat: 'All', q: '', page: 0, sector: 'All', coq: '', co: null, good: null, series: 'gdp', range: 30, draft: null, mort: { price: 0, down: 20, years: 25 } };
const E2_TABS = [['overview', '📊 Overview'], ['market', '📈 Market'], ['companies', '🏢 Companies'], ['housing', '🏠 Housing'], ['banking', '🏦 Banking'], ['trade', '🚢 Trade'], ['taxes', '🧾 Taxes'], ['shocks', '⚠️ Shocks'], ['graphs', '📉 Graphs']];
const E2_SERIES = [['gdp', 'GDP', money], ['infl', 'Inflation %', function (v) { return v.toFixed(1) + '%'; }], ['unemp', 'Unemployment %', function (v) { return v.toFixed(1) + '%'; }], ['house', 'House price', money], ['rent', 'Rent / month', money], ['stock', 'Stock market', function (v) { return '$' + v.toFixed(2); }], ['trade', 'Trade balance / day', signMoney], ['pop', 'Population', function (v) { return fmt(Math.round(v)); }]];
const E2_RANGES = [[7, '7 Days'], [30, '30 Days'], [8, '1 Year'], [40, '5 Years'], [200, '25 Years']];      // 1 game year = 8 game days
const E2_PAGE = 25;

function e2Tile(icon, label, value, sub, cls) { return '<div class="e2Tile ' + (cls || '') + '"><span>' + icon + ' ' + label + '</span><b>' + value + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>'; }
function e2Pct(v, d) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
function e2Bar(label, v, max, txt) { return '<div class="e2BarRow"><span>' + label + '</span><i><em style="width:' + clamp(max > 0 ? v / max * 100 : 0, 0, 100) + '%"></em></i><b>' + txt + '</b></div>'; }
function openEconomy2(tab) {
  if (!STARTED || !S.p17) return;
  if (tab) { E2UI.tab = tab; E2UI.co = null; E2UI.good = null; }
  if (typeof closeMobilePage === 'function' && typeof MPAGE !== 'undefined' && MPAGE.el && !MPAGE.el.classList.contains('hidden')) closeMobilePage();
  showModal('📊 ECONOMY · ' + esc(S.city.name), '<div id="e2Root"></div>');
  $('modal').classList.add('p10Wide');
  e2Render();
}
function e2Render() {
  const root = document.getElementById('e2Root'); if (!root) return;
  const sc = root.querySelector('.e2Body') ? root.querySelector('.e2Body').scrollTop : 0;
  let body = '';
  try { body = (E2_VIEWS[E2UI.tab] || E2_VIEWS.overview)(); } catch (e) { body = '<p class="small">⚠️ ' + esc(e.message) + '</p>'; if (typeof logError === 'function') logError('Economy 2.0 UI', e.message); }
  root.innerHTML = '<div class="e2Tabs mScroll">' + E2_TABS.map(function (t) { return '<button class="btn small ' + (E2UI.tab === t[0] ? 'gold' : '') + '" data-e2t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="e2Phase">' + e2Phase().toUpperCase() + ' · sentiment ' + S.p17.sentiment + ' · interest ' + (interestRate() * 100).toFixed(2) + '% · inflation ' + ((S.p6 ? S.p6.econ.infl : 0) * 100).toFixed(1) + '%</div>' +
    '<div class="e2Body">' + body + '</div>';
  const b = root.querySelector('.e2Body'); if (b) b.scrollTop = sc;
  root.querySelectorAll('canvas[data-e2c]').forEach(function (cv) { e2DrawCanvas(cv); });
}
/* ---------- line chart ---------- */
function e2DrawCanvas(cv) {
  const k = cv.dataset.e2c, n = +cv.dataset.n || 30;
  let data = [], f = money, col = '#4cc9f0';
  if (k.indexOf('good:') === 0) { const g = S.p17.goods[k.slice(5)]; data = g ? g.h.slice(-n) : []; f = function (v) { return money(v, 2); }; col = '#ffd166'; }
  else if (k.indexOf('co:') === 0) { const c = S.p17.co[k.slice(3)]; data = c ? c.hist.map(function (h) { return h.rev * 60; }) : []; col = '#06d6a0'; f = function (v) { return money(v) + '/min'; }; }
  else { const s = E2_SERIES.find(function (x) { return x[0] === k; }); data = (S.p17.hist[k] || []).slice(-n); if (s) f = s[2]; }
  const W = cv.width = Math.max(260, Math.min(900, (cv.parentNode.clientWidth || 320) - 4)), H = cv.height, g = cv.getContext('2d');
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, H);
  if (data.length < 2) { g.fillStyle = '#8d99ae'; g.font = '12px sans-serif'; g.fillText('Collecting data — one point per game day', 10, H / 2); return; }
  let lo = Infinity, hi = -Infinity; data.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); if (hi === lo) { hi += Math.abs(hi) * 0.05 + 1; lo -= Math.abs(lo) * 0.05 + 1; }
  g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
  data.forEach(function (v, i) { const x = 6 + i / (data.length - 1) * (W - 12), y = H - 16 - (v - lo) / (hi - lo) * (H - 32); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#cfd8e3'; g.font = '11px sans-serif'; g.fillText(f(data[data.length - 1]), 8, 13); g.fillStyle = '#8d99ae'; g.fillText('high ' + f(hi) + ' · low ' + f(lo) + ' · ' + data.length + ' days', 8, H - 3);
}
/* ---------- views ---------- */
const E2_VIEWS = {
  overview: function () {
    const P = S.p17, G = P.gdp, J = P.jobs, H = P.housing, spend = Object.keys(P.spend).reduce(function (a, k) { return a + P.spend[k]; }, 0);
    let prof = 0; for (const id in P.co) prof += P.co[id].profit || 0;
    const debt = (S.bank.loans || []).reduce(function (a, l) { return a + l.remaining; }, 0) + (S.p11 ? S.p11.loans.reduce(function (a, l) { return a + (l.co === 'player' ? l.remaining : 0); }, 0) : 0);
    const B = SIM.B || {}, taxRev = (B.incomeTax || 0) + (B.businessTax || 0) + (B.propertyTax || 0) + (B.salesTax || 0) + (B.tourism || 0);
    const secMax = Math.max.apply(null, Object.keys(G.sectors).map(function (k) { return G.sectors[k]; }).concat([1]));
    const bud = P.budget, bmax = Math.max(1, bud.income);
    return '<div class="e2Grid">' +
      e2Tile('🌍', 'GDP', money(G.total), 'per year · ' + e2Pct(G.growth) + ' growth') + e2Tile('👤', 'GDP per capita', money(G.perCap), fmt(Math.round(S.city.population)) + ' residents') +
      e2Tile('💹', 'Inflation', ((S.p6 ? S.p6.econ.infl : 0) * 100).toFixed(1) + '%', 'expected ' + (P.infl.exp * 100).toFixed(1) + '%', Math.abs(S.p6 ? S.p6.econ.infl : 0) > 0.06 ? 'warn' : '') +
      e2Tile('💼', 'Unemployment', ((SIM.unemployment || 0) * 100).toFixed(1) + '%', J.level + ' · ' + fmt(J.vac) + ' vacancies', J.level === 'High' || J.level === 'Crisis' ? 'warn' : '') +
      e2Tile('💵', 'Average salary', money(J.salary) + '/mo', 'income ' + money(J.income) + '/mo') + e2Tile('🏠', 'Housing price', money(H.price), H.affordClass + (H.crisis ? ' · HOUSING CRISIS' : ''), H.crisis ? 'warn' : '') +
      e2Tile('🔑', 'Rent', money(H.rent) + '/mo', 'vacancy ' + Math.round(H.vacancy * 100) + '%') + e2Tile('🛒', 'Consumer spending', money(spend) + '/day', 'food · housing · transport · fun · health · shopping') +
      e2Tile('🏢', 'Company profits', money(prof * 60) + '/min', Object.keys(P.co).length + ' companies') + e2Tile('🚢', 'Trade balance', signMoney(G.trade) + '/day', 'exports − imports', G.trade < 0 ? 'warn' : '') +
      e2Tile('🏦', 'Interest rate', (interestRate() * 100).toFixed(2) + '%', 'central bank · floor 1 %') + e2Tile('🧾', 'Tax revenue', money(taxRev * 60) + '/min', '5 taxes') +
      e2Tile('📄', 'Debt', money(debt), 'your loans') + e2Tile('📊', 'Stock market', '$' + e2StockIndex().toFixed(2), P.sentiment) + '</div>' +
      '<div class="e2Cols"><div class="e2Card"><h4>GDP by sector</h4>' + Object.keys(G.sectors).map(function (k) { return e2Bar(k, G.sectors[k], secMax, money(G.sectors[k])); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Household budget (per household / month)</h4>' + [['Income', bud.income], ['Rent / Mortgage', bud.rent], ['Food', bud.food], ['Transport', bud.transport], ['Utilities', bud.utilities], ['Shopping', bud.shopping], ['Savings', bud.savings]].map(function (r) { return e2Bar(r[0], r[1], bmax, money(r[1])); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Inflation by category (1 year)</h4>' + [['Food prices', 'food'], ['Rent', 'rent'], ['Construction', 'construction'], ['Salary', 'salary'], ['Services', 'services']].map(function (r) { const v = P.infl.cat[r[1]]; return '<div class="e2Row"><span>' + r[0] + '</span><b class="' + (v > 0.05 ? 'neg' : v < -0.02 ? 'pos' : '') + '">' + e2Pct(v) + '</b></div>'; }).join('') + '<div class="e2Row"><span>Interest</span><b>' + (P.infl.cat.interest * 100).toFixed(2) + '%</b></div></div>' +
      '<div class="e2Card"><h4>Employment market</h4><div class="e2Row"><span>Workers</span><b>' + fmt(J.workers) + '</b></div><div class="e2Row"><span>Jobs</span><b>' + fmt(Math.round(SIM.jobs || 0)) + '</b></div><div class="e2Row"><span>Job vacancies</span><b>' + fmt(J.vac) + '</b></div><div class="e2Row"><span>Salary trend</span><b>' + e2Pct(J.pressure, 2) + '/day</b></div><div class="e2Row"><span>Citizens\' credit score</span><b>' + P.bank.citizenScore + '</b></div></div></div>';
  },
  market: function () {
    if (E2UI.good) return e2GoodView(E2UI.good);
    const rows = e2MarketRows(E2UI.cat, E2UI.q);
    return '<div class="e2Filter"><input class="admInput" id="e2Q" placeholder="Search products… (bread, fuel, metal)" value="' + esc(E2UI.q) + '"><div class="e2Chips">' + ['All'].concat(E2_CATS).map(function (c) { return '<button class="btn small ' + (E2UI.cat === c ? 'gold' : '') + '" data-e2cat="' + c + '">' + c + '</button>'; }).join('') + '</div></div>' +
      '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Product</th><th>Category</th><th>Price</th><th>Yesterday</th><th>Change</th><th>Supply</th><th>Demand</th><th>Import</th><th>Export</th></tr>' +
      rows.map(function (r) { return '<tr data-e2good="' + r.id + '"><td><b>' + r.name + '</b></td><td>' + r.cat + '</td><td>' + money(r.price, 2) + '</td><td>' + money(r.y, 2) + '</td><td class="' + (r.ch > 0.005 ? 'neg' : r.ch < -0.005 ? 'pos' : '') + '">' + e2Pct(r.ch) + '</td><td>' + fmt(Math.round(r.supply)) + '</td><td>' + fmt(Math.round(r.demand)) + '</td><td>' + fmt(Math.round(r.imp)) + '</td><td>' + fmt(Math.round(r.exp)) + '</td></tr>'; }).join('') +
      '</table></div>' + (rows.length ? '' : '<p class="small">No product matches "' + esc(E2UI.q) + '".</p>') + '<p class="small">Prices follow supply and demand (high demand + low supply → price ↑), at most a few % per game hour. Tap a product for its price history.</p>';
  },
  companies: function () {
    if (E2UI.co) return e2CompanyView(E2UI.co);
    const P = S.p17, sh = e2SectorShares(), secs = Object.keys(sh).sort();
    const all = Object.keys(P.co).map(function (id) { const c = P.co[id]; return { id: id, c: c }; }).filter(function (x) { return (E2UI.sector === 'All' || x.c.sector === E2UI.sector) && (!E2UI.coq || x.c.name.toLowerCase().indexOf(E2UI.coq.toLowerCase()) >= 0); }).sort(function (a, b) { return b.c.rev - a.c.rev; });
    const pages = Math.max(1, Math.ceil(all.length / E2_PAGE)); E2UI.page = clamp(E2UI.page, 0, pages - 1);
    const view = all.slice(E2UI.page * E2_PAGE, E2UI.page * E2_PAGE + E2_PAGE);       // only one page of rows in the DOM
    return '<div class="e2Card"><h4>Market share by sector</h4><div class="e2TblWrap"><table class="e2Tbl"><tr><th>Sector</th><th>Top company</th><th>Market share</th><th>Revenue</th><th>Growth</th><th>Companies</th></tr>' + secs.map(function (k) { const s = sh[k]; return '<tr><td>' + k + '</td><td><b>' + esc(s.top) + '</b></td><td>' + Math.round(s.topShare * 100) + '%</td><td>' + money(s.rev * 60) + '/min</td><td>' + e2Pct(s.growth) + '</td><td>' + s.n + '</td></tr>'; }).join('') + '</table></div></div>' +
      '<div class="e2Filter"><input class="admInput" id="e2CoQ" placeholder="Find company…" value="' + esc(E2UI.coq) + '"><div class="e2Chips">' + ['All'].concat(secs).map(function (s) { return '<button class="btn small ' + (E2UI.sector === s ? 'gold' : '') + '" data-e2sec="' + s + '">' + s + '</button>'; }).join('') + '</div></div>' +
      '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Company</th><th>Type</th><th>Stage</th><th>HQ</th><th>Revenue</th><th>Profit</th><th>Share</th><th>Credit</th></tr>' + view.map(function (x) { const c = x.c; return '<tr data-e2co="' + x.id + '"><td><b>' + esc(c.name) + '</b></td><td>' + e2CoType(c) + '</td><td class="' + (c.stage === 'Restructuring' || c.stage === 'Decline' ? 'neg' : c.stage === 'Expansion' || c.stage === 'Growth' ? 'pos' : '') + '">' + c.stage + '</td><td>' + c.hq + '</td><td>' + money(c.rev * 60) + '/min</td><td class="' + (c.profit < 0 ? 'neg' : 'pos') + '">' + money(c.profit * 60) + '</td><td>' + Math.round(c.share * 100) + '%</td><td>' + Math.round(c.cr) + '</td></tr>'; }).join('') + '</table></div>' +
      '<div class="e2Pager"><button class="btn small" data-e2pg="-1"' + (E2UI.page ? '' : ' disabled') + '>‹ Prev</button><span>Page ' + (E2UI.page + 1) + ' / ' + pages + ' · ' + fmt(all.length) + ' companies</span><button class="btn small" data-e2pg="1"' + (E2UI.page < pages - 1 ? '' : ' disabled') + '>Next ›</button></div>' +
      (P.names.retired.length ? '<p class="small">Retired brand names (never reused): ' + P.names.retired.slice(-6).map(esc).join(', ') + '</p>' : '');
  },
  housing: function () {
    const H = S.p17.housing, M = E2UI.mort; if (!M.price) M.price = Math.round(H.price || 250000);
    const q = mortgageQuote(M.price, M.down / 100, interestRate() + 0.015, M.years), mo = S.p11 && S.p11.mort;
    return '<div class="e2Grid">' + e2Tile('🏠', 'House price', money(H.price), 'average home') + e2Tile('🔑', 'Rent', money(H.rent) + '/mo', 'average') + e2Tile('🚪', 'Vacancy', Math.round(H.vacancy * 100) + '%', H.vacancy > 0.25 ? 'oversupply: rents ↓' : H.vacancy < 0.03 ? 'very tight' : 'healthy', H.vacancy > 0.25 || H.vacancy < 0.03 ? 'warn' : '') +
      e2Tile('⚖️', 'Housing affordability', H.affordClass, Math.round(H.afford * 100) + '% of income for rent', H.afford > 0.4 ? 'warn' : '') + e2Tile('📈', 'Housing demand', '×' + (SIM.housingDemandRatio || 1).toFixed(2), H.crisis ? 'HOUSING CRISIS: rent ↑ happiness ↓ migration pressure ↑' : 'demand vs supply', H.crisis ? 'warn' : '') +
      (mo ? e2Tile('🏦', 'Mortgages', fmt(mo.owners || 0) + ' owners', 'outstanding ' + money(mo.outstanding || 0) + ' · defaults ' + (mo.defaults || 0)) : '') + '</div>' +
      '<div class="e2Card"><h4>Mortgage calculator</h4><div class="e2Form"><label>House price<input class="admInput" type="number" min="1000" step="1000" id="e2MP" value="' + M.price + '"></label><label>Down payment %<input class="admInput" type="number" min="0" max="90" id="e2MD" value="' + M.down + '"></label><label>Years<input class="admInput" type="number" min="1" max="40" id="e2MY" value="' + M.years + '"></label></div>' +
      '<div class="e2Row"><span>Down payment</span><b>' + money(q.down) + '</b></div><div class="e2Row"><span>Loan</span><b>' + money(q.loan) + '</b></div><div class="e2Row"><span>Interest</span><b>' + (q.rate * 100).toFixed(2) + '%</b></div><div class="e2Row"><span>Monthly payment</span><b>' + money(q.monthly) + '</b></div><div class="e2Row"><span>Total paid</span><b>' + money(q.total) + '</b></div></div>' +
      '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>District</th><th>House price</th><th>Rent</th><th>Vacancy</th><th>Affordability</th></tr>' + H.districts.map(function (d) { return '<tr data-e2fly="' + d.x + ',' + d.y + '"><td><b>' + esc(d.name) + '</b></td><td>' + money(d.price) + '</td><td>' + money(d.rent) + '/mo</td><td>' + Math.round(d.vacancy * 100) + '%</td><td class="' + (d.cls === 'Critical' || d.cls === 'Expensive' ? 'neg' : 'pos') + '">' + d.cls + '</td></tr>'; }).join('') + '</table></div>';
  },
  banking: function () {
    const B = S.p17.bank, cb = B.cb, banks = e2Banks(), st = B.loanStages, p = S.bank ? 300 + Math.round((S.bank.credit || 70) * 5.5) : 0;
    return '<div class="e2Grid">' + e2Tile('🏛', 'Central bank rate', (interestRate() * 100).toFixed(2) + '%', 'Taylor rule · never below 1 %') + e2Tile('💵', 'Money supply', 'index ' + cb.ms.toFixed(1), 'follows GDP and the rate') +
      e2Tile('💧', 'Emergency liquidity', cb.liqUntil > S.clock.runSec ? 'ACTIVE' : 'standby', money(cb.liqTotal) + ' injected so far', cb.liqUntil > S.clock.runSec ? 'warn' : '') + e2Tile('⭐', 'Your credit score', p, 'pay on time → ↑ · late → ↓') +
      e2Tile('👥', 'Citizens\' credit', B.citizenScore, 'average score') + e2Tile('📄', 'Company loans', fmt(st.current + st.late + st.restructuring + st.default), 'current ' + st.current + ' · late ' + st.late + ' · restructuring ' + st.restructuring + ' · default ' + st.default, st.late + st.restructuring ? 'warn' : '') + '</div>' +
      '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Bank</th><th>Deposits</th><th>Loans</th><th>Capital</th><th>Interest</th><th>Risk</th><th>Profit</th><th>Branches</th></tr>' + (banks.length ? banks.map(function (b) { return '<tr' + (b.b ? ' data-e2fly="' + b.b.x + ',' + b.b.y + '"' : '') + '><td><b>' + esc(b.name) + '</b></td><td>' + money(b.deposits) + '</td><td>' + money(b.loans) + '</td><td>' + money(b.capital) + '</td><td>' + (b.rate * 100).toFixed(2) + '%</td><td class="' + (b.risk > 0.5 ? 'neg' : '') + '">' + Math.round(b.risk * 100) + '%</td><td>' + money(b.profit) + '</td><td>' + b.branches + '</td></tr>'; }).join('') : '<tr><td colspan="8">No bank in the city yet — the central bank lends directly (+2 %). Build a Bank to compete for deposits.</td></tr>') + '</table></div>' +
      '<p class="small">Loans: Late → Restructuring (longer term, lower payment) → Default. A default never removes your city: companies restructure first, citizens\' defaults lower the average score.</p>' +
      '<div class="mActs"><button class="btn" data-e2open="companies:bank">🏦 Your loans</button></div>';
  },
  trade: function () {
    const rows = e2MarketRows('All', '').filter(function (r) { return r.imp > 0 || r.exp > 0; }).sort(function (a, b) { return (b.exp + b.imp) - (a.exp + a.imp); });
    const N = S.p9 ? S.p9.neighbors : [], dis = e2Active('trade');
    return '<div class="e2Grid">' + e2Tile('🚢', 'Trade balance', signMoney(S.p17.gdp.trade) + '/day', 'exports − imports', S.p17.gdp.trade < 0 ? 'warn' : '') + e2Tile('📤', 'Exports', money((SIM.exportValue || 0) * 60) + '/min', '') + e2Tile('📥', 'Imports', money((SIM.importValue || 0) * 60) + '/min', '') +
      e2Tile('🚚', 'Logistics cost', money((SIM.logiCost || 0) * 60) + '/min', 'distance · traffic ' + Math.round(SIM.traffic || 0) + '% · fuel ' + money(e2GoodPrice('fuel'), 2)) +
      e2Tile('🏬', 'Warehouses', fmt(Math.round(SIM.storageUsed || 0)) + ' / ' + fmt(Math.round(SIM.storageCap || 0)), 'inventory / capacity', SIM.storageCap && SIM.storageUsed / SIM.storageCap > 0.9 ? 'warn' : '') +
      e2Tile('🚧', 'Disruption', dis ? E2_SEV[dis.sev] : 'none', dis ? 'delays · prices ↑ · inventory ↓' : 'routes clear', dis ? 'warn' : '') + '</div>' +
      '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Product</th><th>Exports / day</th><th>Imports / day</th><th>Balance</th><th>Price</th></tr>' + rows.map(function (r) { const bal = (r.exp - r.imp) * r.price; return '<tr data-e2good="' + r.id + '"><td>' + r.name + '</td><td>' + fmt(Math.round(r.exp)) + '</td><td>' + fmt(Math.round(r.imp)) + '</td><td class="' + (bal < 0 ? 'neg' : 'pos') + '">' + signMoney(bal) + '</td><td>' + money(r.price, 2) + '</td></tr>'; }).join('') + '</table></div>' +
      (N.length ? '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Region</th><th>Relation</th><th>Exports</th><th>Imports</th></tr>' + N.map(function (n) { return '<tr><td>' + esc(String(n.name || n.id)) + '</td><td>' + Math.round(n.rel || 0) + '</td><td>' + money(n.exp || 0) + '</td><td>' + money(n.imp || 0) + '</td></tr>'; }).join('') + '</table></div>' : '') +
      '<div class="mActs"><button class="btn" data-e2open="world:trade">🌍 Trade routes & contracts</button></div>';
  },
  taxes: function () {
    const T = e2Tax(), D = E2UI.draft || (E2UI.draft = Object.assign({}, T));
    return '<div class="e2Card"><h4>Tax policy</h4>' + E2_TAXES.map(function (t) { return '<div class="e2Slider"><span>' + t[1] + '</span><input type="range" min="' + t[2] + '" max="' + t[3] + '" step="' + (t[0] === 'property' ? 0.1 : 1) + '" value="' + D[t[0]] + '" data-e2tax="' + t[0] + '"><b>' + (+D[t[0]]).toFixed(t[0] === 'property' ? 1 : 0) + '%</b></div>'; }).join('') + '</div>' +
      '<div class="e2Card"><h4>Forecast before you change it</h4>' + E2_TAXES.map(function (t) { const f = taxForecast(t[0], D[t[0]]); return '<div class="e2Row"><span>' + t[1] + '</span><b>' + money(f.current * 60) + ' → ' + money(f.expected * 60) + '/min</b><i class="' + (f.hap < 0 ? 'neg' : '') + '">happiness ' + (f.hap >= 0 ? '+' : '') + f.hap.toFixed(1) + ' · business ' + e2Pct(f.biz) + '</i></div>'; }).join('') +
      '<div class="mActs"><button class="btn green" data-e2apply="1">✓ Apply tax policy</button><button class="btn" data-e2reset="1">Reset</button></div><p class="small">Too high a tax: fewer businesses, less migration, less consumption. Income tax is the classic tax slider.</p></div>';
  },
  shocks: function () {
    const P = S.p17, act = P.shocks.filter(function (s) { return s.until > S.clock.runSec; });
    return (act.length ? act.map(function (s) {
      const D = E2_SHOCKS[s.id];
      return '<div class="e2Card ' + (D.good ? '' : 'e2Warn') + '"><h4>' + D.icon + ' ' + D.name + ' · ' + E2_SEV[s.sev] + '</h4><p class="small">' + Object.keys(D.goods).map(function (g) { return e2GoodName(g) + ' +' + Math.round(D.goods[g] * E2_SEV_K[s.sev] * 100) + '%'; }).join(' · ') + ' · ends in ' + Math.max(1, Math.round((s.until - S.clock.runSec) / 50)) + ' game hours</p>' +
        '<div class="mActs">' + D.resp.map(function (r) { return '<button class="btn small ' + (s.resp === r[0] ? 'gold' : '') + '" data-e2resp="' + s.id + ':' + r[0] + '" title="' + esc(r[2]) + '">' + r[1] + '</button>'; }).join('') + '</div><p class="small">' + D.resp.map(function (r) { return r[1] + ': ' + r[2]; }).join(' · ') + '</p></div>';
    }).join('') : '<p class="small">✅ No economic shock right now. Shocks: Energy Price Shock · Food Shortage · Banking Crisis · Housing Bubble · Technology Boom · Market Crash · Trade Disruption · Construction Boom — each Minor, Moderate, Major or Severe.</p>') +
      (P.shockLog.length ? '<div class="e2TblWrap"><table class="e2Tbl"><tr><th>Day</th><th>Shock</th><th>Severity</th><th>Response</th></tr>' + P.shockLog.map(function (l) { return '<tr><td>' + l.d + '</td><td>' + E2_SHOCKS[l.id].icon + ' ' + E2_SHOCKS[l.id].name + '</td><td>' + E2_SEV[l.sev] + '</td><td>' + (l.resp || '—') + '</td></tr>'; }).join('') + '</table></div>' : '');
  },
  graphs: function () {
    return '<div class="e2Chips">' + E2_SERIES.map(function (s) { return '<button class="btn small ' + (E2UI.series === s[0] ? 'gold' : '') + '" data-e2ser="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
      '<div class="e2Chips">' + E2_RANGES.map(function (r) { return '<button class="btn small ' + (E2UI.range === r[0] ? 'gold' : '') + '" data-e2rng="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="e2Chart"><canvas data-e2c="' + E2UI.series + '" data-n="' + E2UI.range + '" height="200"></canvas></div><p class="small">One sample per game day · 1 game year = 8 days.</p>';
  }
};
function e2GoodView(id) {
  const r = e2MarketRows('All', '').find(function (x) { return x.id === id; }); if (!r) { E2UI.good = null; return E2_VIEWS.market(); }
  return '<button class="btn small" data-e2back="good">‹ Market</button><h3 class="veH3">' + r.name.toUpperCase() + ' · ' + r.cat + '</h3>' +
    '<div class="e2Grid">' + e2Tile('📅', 'Yesterday', money(r.y, 2), '') + e2Tile('💲', 'Today', money(r.price, 2), '') + e2Tile('↕️', 'Change', e2Pct(r.ch), '', r.ch > 0.05 ? 'warn' : '') + e2Tile('🏭', 'Production', fmt(Math.round(r.prod)) + '/day', 'consumption ' + fmt(Math.round(r.cons))) + e2Tile('🚢', 'Import / Export', fmt(Math.round(r.imp)) + ' / ' + fmt(Math.round(r.exp)), 'per day') + e2Tile('⚖️', 'Supply / Demand', fmt(Math.round(r.supply)) + ' / ' + fmt(Math.round(r.demand)), r.supply < r.demand ? 'shortage → price ↑' : 'surplus → price ↓') + '</div>' +
    '<div class="e2Chips">' + E2_RANGES.map(function (q) { return '<button class="btn small ' + (E2UI.range === q[0] ? 'gold' : '') + '" data-e2rng="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div><div class="e2Chart"><canvas data-e2c="good:' + id + '" data-n="' + E2UI.range + '" height="180"></canvas></div>';
}
function e2CompanyView(id) {
  const c = S.p17.co[id]; if (!c) { E2UI.co = null; return E2_VIEWS.companies(); }
  const st = S.ai[id] || {}, sk = S.p6 && S.p6.stocks[id];
  let inv = 0, n = 0; S.buildings.list.forEach(function (b) { if (b.owner === id && b.built && b._fr !== undefined) { inv += b._fr; n++; } });
  return '<button class="btn small" data-e2back="co">‹ Companies</button><h3 class="veH3">' + (aiDef(id) ? aiDef(id).icon + ' ' : '') + esc(c.name) + ' · ' + e2CoType(c) + ' · ' + c.stage + '</h3>' +
    '<div class="e2Grid">' + e2Tile('💰', 'Revenue', money(c.rev * 60) + '/min', '') + e2Tile('📈', 'Profit', money(c.profit * 60) + '/min', '', c.profit < 0 ? 'warn' : '') + e2Tile('👷', 'Employees', fmt(c.emp), '') + e2Tile('📄', 'Debt', money(c.debt), 'credit score ' + Math.round(c.cr), c.cr < 500 ? 'warn' : '') +
    e2Tile('🥧', 'Market share', Math.round(c.share * 100) + '%', c.sector) + e2Tile('📊', 'Stock', sk ? '$' + sk.price.toFixed(2) : '—', sk && sk.qty ? 'you own ' + fmt(sk.qty) : '') + e2Tile('🏬', 'Stores', fmt(c.stores), '') + e2Tile('🏭', 'Factories', fmt(c.factories), '') +
    e2Tile('📦', 'Inventory', n ? Math.round(inv / n * 100) + '%' : '—', 'goods supply of its stores', n && inv / n < 0.6 ? 'warn' : '') + e2Tile('⭐', 'Reputation', Math.round(st.rep || 0), '') + e2Tile('🏢', 'Headquarters', 'Level ' + c.hq, 'manages up to ' + (c.hq * 6) + ' locations') + e2Tile('💵', 'Cash', money(c.cash), c.short ? 'cash shortage ' + c.short + ' day(s)' : '', c.short ? 'warn' : '') + '</div>' +
    '<div class="e2Chart"><canvas data-e2c="co:' + id + '" height="160"></canvas></div><div class="mActs">' + (sk ? '<button class="btn" data-e2open="companies:stocks">📊 Trade shares</button>' : '') + (st.rev !== undefined ? '<button class="btn" data-e2flyco="' + id + '">📍 Show on map</button>' : '') + '</div>';
}
/* tax revenue forecast: elasticity model (each point above the comfort level loses a little of the base) */
function taxForecast(kind, rate) {
  const T = e2Tax(), B = SIM.B || {}, cur = T[kind], key = { income: 'incomeTax', business: 'businessTax', property: 'propertyTax', sales: 'salesTax', tourism: 'tourism' }[kind];
  let base = B[key] || 0; if (kind === 'tourism') base = (B.tourism || 0) * 0.5;
  const comfort = { income: 14, business: 12, property: 1.5, sales: 6, tourism: 12 }[kind], el = { income: 0.012, business: 0.018, property: 0.08, sales: 0.02, tourism: 0.015 }[kind];
  const per = cur > 0 ? base / cur : (kind === 'sales' ? (SIM.P ? 0 : 0) + Object.keys(SIM.owners || {}).reduce(function (a, k) { return a + ((SIM.owners[k].rev || 0) * 0.005); }, 0) : 0);
  const expected = Math.max(0, per * rate * (1 - Math.max(0, rate - comfort) * el));
  const d = rate - cur, hap = -(d * (kind === 'income' ? 0.35 : kind === 'sales' ? 0.25 : kind === 'property' ? 2 : 0.1)), biz = -(Math.max(0, rate - comfort) - Math.max(0, cur - comfort)) * (kind === 'business' ? 0.012 : 0.004);
  return { current: base, expected: expected, hap: hap, biz: biz };
}
function e2ApplyTaxes() {
  const D = E2UI.draft; if (!D) return;
  const T = e2Tax();
  E2_TAXES.forEach(function (t) { T[t[0]] = clamp(+D[t[0]], t[2], t[3]); });
  S.city.tax = Math.round(T.income); if (typeof refreshTopbar === 'function') refreshTopbar();
  toast('🧾 Tax policy applied: income ' + T.income + '% · business ' + T.business + '% · property ' + T.property.toFixed(1) + '% · sales ' + T.sales + '% · tourism ' + T.tourism + '%', 'good');
  logHistory('🧾', 'New tax policy (income ' + T.income + '%, business ' + T.business + '%)', 'policy');
}
/* ---------- events (one delegated handler) ---------- */
document.addEventListener('click', function (e) {
  if (!e.target.closest || !e.target.closest('#e2Root')) return;
  const q = function (sel) { return e.target.closest(sel); };
  let el;
  if ((el = q('[data-e2t]'))) { E2UI.tab = el.dataset.e2t; E2UI.co = null; E2UI.good = null; }
  else if ((el = q('[data-e2cat]'))) E2UI.cat = el.dataset.e2cat;
  else if ((el = q('[data-e2sec]'))) { E2UI.sector = el.dataset.e2sec; E2UI.page = 0; }
  else if ((el = q('[data-e2pg]'))) E2UI.page += +el.dataset.e2pg;
  else if ((el = q('[data-e2good]'))) { E2UI.good = el.dataset.e2good; E2UI.tab = 'market'; }
  else if ((el = q('[data-e2co]'))) E2UI.co = el.dataset.e2co;
  else if ((el = q('[data-e2back]'))) { if (el.dataset.e2back === 'co') E2UI.co = null; else E2UI.good = null; }
  else if ((el = q('[data-e2ser]'))) E2UI.series = el.dataset.e2ser;
  else if ((el = q('[data-e2rng]'))) E2UI.range = +el.dataset.e2rng;
  else if ((el = q('[data-e2resp]'))) { const p = el.dataset.e2resp.split(':'), r = e2ShockRespond(p[0], p[1]); toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); }
  else if ((el = q('[data-e2apply]'))) e2ApplyTaxes();
  else if ((el = q('[data-e2reset]'))) E2UI.draft = null;
  else if ((el = q('[data-e2fly]'))) { const p = el.dataset.e2fly.split(','); closeModal(); flyToTile(+p[0], +p[1], 0.9); return; }
  else if ((el = q('[data-e2flyco]'))) { const b = S.buildings.list.find(function (x) { return x.owner === el.dataset.e2flyco && x.built; }); closeModal(); if (b) { flyToTile(b.x, b.y, 1); selectBuilding(b); } return; }
  else if ((el = q('[data-e2open]'))) { const p = el.dataset.e2open.split(':'); closeModal(); openPanel(p[0], p[1]); return; }
  else return;
  sfx('click'); e2Render();
});
document.addEventListener('input', function (e) {
  const t = e.target; if (!t.closest || !t.closest('#e2Root')) return;
  if (t.id === 'e2Q' || t.id === 'e2CoQ') {
    if (t.id === 'e2Q') E2UI.q = t.value; else { E2UI.coq = t.value; E2UI.page = 0; }
    const pos = t.selectionStart; e2Render(); const n = document.getElementById(t.id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* number input */ } }
  } else if (t.dataset.e2tax) { E2UI.draft = E2UI.draft || Object.assign({}, e2Tax()); E2UI.draft[t.dataset.e2tax] = +t.value; e2Render(); }
  else if (t.id === 'e2MP' || t.id === 'e2MD' || t.id === 'e2MY') {
    const M = E2UI.mort; M.price = Math.max(1000, +$('e2MP').value || M.price); M.down = clamp(+$('e2MD').value || 0, 0, 90); M.years = clamp(+$('e2MY').value || 25, 1, 40);
    const id = t.id, pos = t.selectionStart; e2Render(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* number input */ } }
  }
});
/* live refresh while the panel is open (once per game hour of new data, never per frame) */
setInterval(function () { if (E2.dirtyUi && document.getElementById('e2Root') && !document.activeElement.closest('#e2Root input')) { E2.dirtyUi = 0; e2Render(); } }, 2000);

/* ---------- advisor · daily report ---------- */
function e2AdviceRules() {
  if (!S.p17 || S.city.population < 300) return [];
  return e2Advice().slice(0, 3).map(function (msg, i) { return { id: 'e2_' + i + '_' + msg.length, ok: true, msg: msg, act: { type: 'econ2' } }; });
}
(function () {
  const da = window.doAdviceAction;
  if (typeof da === 'function') window.doAdviceAction = function (act) { if (act && act.type === 'econ2') { openEconomy2('overview'); return; } return da.apply(this, arguments); };
  const rl = window.reportLines;
  if (typeof rl === 'function') window.reportLines = function (r) { const h = rl.apply(this, arguments), L = typeof e2ReportLines === 'function' ? e2ReportLines() : []; return h + (L.length ? L.map(function (x) { return '<div class="rep"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') : ''); };
})();

/* ---------- heatmaps: business demand, rent, house prices, employment, income, commercial / industrial demand, investment, company density, housing ---------- */
HEATMAPS.push(
  { id: 'BUSINESS DEMAND', icon: '🏪', name: 'Business Demand', low: 'Weak', high: 'Strong', ramp: 'good' },
  { id: 'RENT', icon: '🔑', name: 'Rent', low: 'Cheap', high: 'Expensive', ramp: 'bad' },
  { id: 'HOUSE PRICES', icon: '🏠', name: 'House Prices', low: 'Cheap', high: 'Expensive', ramp: 'value' },
  { id: 'EMPLOYMENT', icon: '💼', name: 'Employment', low: 'Few jobs', high: 'Many jobs', ramp: 'good' },
  { id: 'INCOME', icon: '💵', name: 'Income', low: 'Low', high: 'High', ramp: 'good' },
  { id: 'COMMERCIAL DEMAND', icon: '🛍️', name: 'Commercial Demand', low: 'Saturated', high: 'Wanted', ramp: 'good' },
  { id: 'INDUSTRIAL DEMAND', icon: '🏭', name: 'Industrial Demand', low: 'Saturated', high: 'Wanted', ramp: 'good' },
  { id: 'INVESTMENT', icon: '📈', name: 'Investment', low: 'Low', high: 'High', ramp: 'good' },
  { id: 'COMPANY DENSITY', icon: '🏢', name: 'Company Density', low: 'None', high: 'Dense', ramp: 'value' },
  { id: 'HOUSING AFFORDABILITY', icon: '⚖️', name: 'Housing Affordability', low: 'Critical', high: 'Affordable', ramp: 'good' }
);
['BUSINESS DEMAND', 'RENT', 'HOUSE PRICES', 'EMPLOYMENT', 'INCOME', 'COMMERCIAL DEMAND', 'INDUSTRIAL DEMAND', 'INVESTMENT', 'COMPANY DENSITY', 'HOUSING AFFORDABILITY'].forEach(function (id) { if (OVERLAYS.indexOf(id) < 0) OVERLAYS.push(id); if (typeof MMAP_HEATS !== 'undefined' && MMAP_HEATS.indexOf(id) < 0 && ['RENT', 'HOUSE PRICES', 'EMPLOYMENT', 'INVESTMENT', 'COMPANY DENSITY'].indexOf(id) >= 0) MMAP_HEATS.push(id); });
function e2DistrictGrid(val) {                              // 8×8 district values spread to tiles (smoothly), 0–1
  const N = MAP.W * MAP.H, g = new Float32Array(N), D = typeof housingMarket === 'function' ? housingMarket() : [];
  if (!D.length) return g;
  let lo = Infinity, hi = -Infinity; D.forEach(function (d) { const v = val(d); d._v = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }); if (hi <= lo) hi = lo + 1;
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    let s = 0, w = 0; D.forEach(function (d) { const dx = x - (Math.floor(d.x / 8) * 8 + 4), dy = y - (Math.floor(d.y / 8) * 8 + 4), k = 1 / (1 + (dx * dx + dy * dy) / 30); s += (d._v - lo) / (hi - lo) * k; w += k; });
    g[idx(x, y)] = w ? s / w : 0;
  }
  return g;
}
function e2BuildingGrid(test, weight, radius) {
  const N = MAP.W * MAP.H, g = new Float32Array(N); let mx = 0;
  S.buildings.list.forEach(function (b) { if (!b.built || !test(b)) return; const d = bdef(b), r = radius || 4, w = weight(b); const cx = b.x + d.w / 2, cy = b.y + d.h / 2;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(MAP.H, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(MAP.W, Math.ceil(cx + r)); x++) { const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (dd < r) { const i = idx(x, y); g[i] += w * (1 - dd / r); if (g[i] > mx) mx = g[i]; } } });
  if (mx > 0) for (let i = 0; i < N; i++) g[i] = Math.min(1, g[i] / mx);
  return g;
}
function e2HeatGrid(mode) {
  const dem = function (s) { return (SIM.demand && SIM.demand[s] || 0) / Math.max(1, SIM.supply && SIM.supply[s] || 0); };
  switch (mode) {
    case 'RENT': return e2DistrictGrid(function (d) { return d.rent; });
    case 'HOUSE PRICES': return e2DistrictGrid(function (d) { return d.price; });
    case 'HOUSING AFFORDABILITY': { const inc = HH.stats && HH.stats.income > 0 ? HH.stats.income * 30 * 2.6 : 1; return e2DistrictGrid(function (d) { return -d.rent / inc; }); }
    case 'EMPLOYMENT': return e2BuildingGrid(function (b) { return (b._actW || 0) > 0; }, function (b) { return b._actW || 0; }, 6);
    case 'INCOME': return e2BuildingGrid(function (b) { return !!bdef(b).housing; }, function (b) { return (bdef(b).quality || 40) * landRel(b.x, b.y); }, 5);
    case 'COMPANY DENSITY': return e2BuildingGrid(function (b) { return !!b.owner && b.owner !== 'city' && !!bdef(b).rev; }, function () { return 1; }, 5);
    case 'BUSINESS DEMAND': case 'COMMERCIAL DEMAND': { const k = clamp((dem('SHOPPING') + dem('FOOD') + dem('ENTERTAINMENT')) / 3, 0, 2) / 2; const g = e2BuildingGrid(function (b) { return !!bdef(b).housing; }, function (b) { return b._hcap || 1; }, 7); const c = e2BuildingGrid(function (b) { return bdef(b).cat === 'Commercial'; }, function () { return 1; }, 5); for (let i = 0; i < g.length; i++) g[i] = clamp(g[i] * (0.4 + k) - c[i] * 0.5 + (mode === 'BUSINESS DEMAND' ? 0.1 : 0), 0, 1); return g; }
    case 'INDUSTRIAL DEMAND': { const k = clamp(1 - (SIM.goodsRatio === undefined ? 1 : SIM.goodsRatio) + (SIM.unemployment || 0) * 3, 0, 1); const g = e2BuildingGrid(function (b) { return !!bdef(b).housing; }, function () { return 1; }, 9); for (let i = 0; i < g.length; i++) g[i] = clamp((1 - g[i]) * (0.3 + k) * (MAP.roads[i] ? 0.6 : 1), 0, 1); return g; }
    case 'INVESTMENT': return e2DistrictGrid(function (d) { return d.price * (1 - d.vacancy || 1) * (1 + d.transit * 0.1); });
  }
  return null;
}
(function () {
  const ph = window.p9HeatGrid;
  window.p9HeatGrid = function (mode) { if (S && S.p17) { const g = e2HeatGrid(mode); if (g) return g; } return typeof ph === 'function' ? ph.apply(this, arguments) : null; };
})();

/* ---------- search (desktop + mobile) and command palette ---------- */
(function () {
  const sc = window.searchCommands;
  if (typeof sc === 'function') window.searchCommands = function (q) {
    const out = sc.apply(this, arguments); if (!S.p17) return out;
    const add = function (label, icon, kw, run) { out.push({ label: label, icon: icon, kw: kw, run: run }); };
    Object.keys(E2_GOODS).forEach(function (id) { add('Product: ' + E2_GOODS[id][0] + ' ' + money(e2GoodPrice(id), 2), '📦', 'product market ' + E2_GOODS[id][1].toLowerCase(), function () { E2UI.good = id; openEconomy2('market'); E2UI.good = id; e2Render(); }); });
    E2_CATS.forEach(function (c) { add('Market: ' + c, '📈', 'market category', function () { E2UI.cat = c; openEconomy2('market'); }); });
    e2Banks().forEach(function (b) { add('Bank: ' + b.name, '🏦', 'bank finance', function () { openEconomy2('banking'); }); });
    return out;
  };
  if (typeof MSEARCH_CATS !== 'undefined') MSEARCH_CATS.push(['product', '📦', 'Product'], ['bank', '🏦', 'Bank'], ['market', '📈', 'Market']);
  const si = window.searchItems;
  if (typeof si === 'function') window.searchItems = function (q, cat) {
    const out = si.apply(this, arguments); if (!S.p17) return out;
    const s = String(q || '').toLowerCase().trim(), hit = function (t) { return !s || String(t).toLowerCase().indexOf(s) >= 0; }, want = function (c) { return cat === 'all' || cat === c; };
    if (want('product') && (s || cat === 'product')) Object.keys(E2_GOODS).forEach(function (id) { if (out.length < 80 && (hit(E2_GOODS[id][0]) || hit(id))) out.push({ cat: 'product', icon: '📦', label: E2_GOODS[id][0], sub: money(e2GoodPrice(id), 2) + ' · ' + e2Pct(e2Change(id)), econ: { tab: 'market', good: id } }); });
    if (want('market') && (s || cat === 'market')) E2_CATS.forEach(function (c) { if (hit(c) || hit('market')) out.push({ cat: 'market', icon: '📈', label: 'Market · ' + c, sub: e2MarketRows(c, '').length + ' products', econ: { tab: 'market', cat: c } }); });
    if (want('bank') && (s || cat === 'bank')) e2Banks().forEach(function (b) { if (hit(b.name) || hit('bank')) out.push({ cat: 'bank', icon: '🏦', label: b.name, sub: 'deposits ' + money(b.deposits) + ' · ' + (b.rate * 100).toFixed(1) + '%', econ: { tab: 'banking' }, loc: b.b ? { x: (b.b.x + 0.5) * TILE, y: (b.b.y + 0.5) * TILE } : null }); });
    if (want('company') && s) Object.keys(S.p17.co).forEach(function (id) { const c = S.p17.co[id]; if (out.length < 80 && !S.ai[id] && hit(c.name)) out.push({ cat: 'company', icon: '🏢', label: c.name, sub: e2CoType(c) + ' · ' + c.stage, econ: { tab: 'companies', co: id } }); });
    return out;
  };
  // a search result that belongs to the economy opens the ECONOMY center instead of flying the camera
  document.addEventListener('click', function (e) {
    const r = e.target.closest && e.target.closest('[data-msr]'); if (!r || typeof MSEARCH === 'undefined') return;
    const it = MSEARCH.res[+r.dataset.msr]; if (!it || !it.econ) return;
    e.stopImmediatePropagation(); e.preventDefault(); sfx('click'); closeModal();
    E2UI.tab = it.econ.tab; E2UI.good = it.econ.good || null; E2UI.co = it.econ.co || null; if (it.econ.cat) E2UI.cat = it.econ.cat;
    openEconomy2();
  }, true);
  const pc = window.paletteCommands;
  if (typeof pc === 'function') window.paletteCommands = function () {
    const C = pc.apply(this, arguments); if (!S || !S.p17) return C;
    const add = function (label, icon, run, kw) { C.push({ label: label, icon: icon, run: run, kw: (kw || '').toLowerCase() }); };
    add('Open Economy', '📊', function () { openEconomy2('overview'); }, 'economy gdp inflation dashboard');
    add('Find Company', '🏢', function () { openEconomy2('companies'); setTimeout(function () { const i = $('e2CoQ'); if (i) i.focus(); }, 60); }, 'company find search');
    add('Find Product', '📦', function () { openEconomy2('market'); setTimeout(function () { const i = $('e2Q'); if (i) i.focus(); }, 60); }, 'product price market search');
    add('Find Bank', '🏦', function () { openEconomy2('banking'); }, 'bank loan credit');
    add('Open Housing', '🏠', function () { openEconomy2('housing'); }, 'housing rent house price mortgage');
    add('Open Trade', '🚢', function () { openEconomy2('trade'); }, 'trade import export');
    add('Open Stock Market', '📊', function () { closePalette(); openPanel('companies', 'stocks'); }, 'stocks shares market');
    add('Open Economic Graphs', '📉', function () { openEconomy2('graphs'); }, 'graph chart gdp history');
    return C;
  };
})();

/* ---------- admin view (OWNER / ADMIN; every action passes AdminAuth.guard) ---------- */
if (typeof ADM_VIEWS !== 'undefined') {
  WC_CATS.push(['wc_e2', '📊', 'ECONOMY 2.0']);
  if (typeof ADMIN_GROUPS !== 'undefined') { const g = ADMIN_GROUPS.find(function (x) { return x[0] === 'ECONOMY'; }); if (g && g[2].indexOf('wc_e2') < 0) g[2].push('wc_e2'); }
  ADM_VIEWS.wc_e2 = function () {
    const P = S.p17; if (!P) return '';
    return aCard('📊 ECONOMY 2.0 — INSPECT', '<pre class="small">' + esc(p17DebugLines()) + '</pre>' + '<div class="grid3">' + aKv('PHASE', e2Phase()) + aKv('SENTIMENT', P.sentiment) + aKv('COMPANIES', Object.keys(P.co).length) + aKv('GDP', money(P.gdp.total)) + aKv('HOUSING', money(P.housing.price)) + aKv('LOANS', JSON.stringify(P.bank.loanStages)) + '</div>') +
      aCard('⚠️ ECONOMIC SHOCKS', '<div class="row admRowWrap">' + Object.keys(E2_SHOCKS).map(function (k) { return '<button class="btn small" data-e2a="shock:' + k + ':1">' + E2_SHOCKS[k].icon + ' ' + E2_SHOCKS[k].name + '</button>'; }).join('') + '<button class="btn small red" data-e2a="endShocks">END ALL</button></div>') +
      aCard('🔁 CYCLE & TICK', '<div class="row admRowWrap">' + ['BOOM', 'NORMAL', 'SLOWDOWN', 'RECESSION', 'RECOVERY'].map(function (p) { return '<button class="btn small" data-e2a="phase" data-v="' + p + '">' + p + '</button>'; }).join('') + '<button class="btn small gold" data-e2a="tick">RUN ECONOMIC TICK</button></div>');
  };
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-e2a]'); if (!b) return;
    const r = adminEcon2(b.dataset.e2a, b.dataset.v); if (r) toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad');
    if (typeof renderAdminCenter === 'function' && ADM.open) renderAdminCenter();
  });
}
