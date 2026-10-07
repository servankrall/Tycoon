'use strict';
/* BLOCK CITY TYCOON — PART 11 CORE & UI
   S.p11 state + master tick, the new Living City hub tabs (Transport Engine, Finance & Markets, Budget 2.0, Smart City,
   Buildings, Green & Climate), the 13 new World Control Center sections (Transport / Economy / Building / Utility /
   Citizen / Company / Tourism / Smart City / Disaster / Climate / Trade / Finance / World Control), world painter
   brushes, the multi-select editor (Ctrl+click), live entity search, the automatic CITY BOOK, building interior
   information, map overlays and the risk / walkability heatmaps. */

/* ===================================== STATE, TICK, MODIFIERS ===================================== */
function newP11(seed) { return Object.assign(tpNew(seed), fnNew(seed), ctNew(seed), { dnames: {} }); }
function sanitizeP11(src, seed) {
  const d = newP11(seed);
  if (!src || typeof src !== 'object') return d;
  const p = p10Merge(d, p10Clean(src, 0));
  tpValidate(p); fnValidate(p); ctValidate(p);
  const dn = {}; for (const k in p.dnames) if (/^\d{1,5}$/.test(k)) dn[k] = String(p.dnames[k]).replace(/[<>]/g, '').slice(0, 32); p.dnames = dn;
  return p;
}
function part11Tick(dt) {
  if (!S.p11 || !STARTED && !BCT_SANDBOX.on || BCT_SANDBOX.on) return;
  p11T('roadworks', roadWorksTick);
  p11T('contracts', function () { tradeContractsTick(dt); });
  if (p11Every('loans', 5, dt)) p11T('loans', function () { loansTick(5); });
  if (p11Every('finance', 3, dt)) p11T('finance', function () { financeTick(3); });
  if (p11Every('trade', 5, dt)) p11T('trade', function () { tradeRoutesTick(5); });
  if (p11Every('regional', 5, dt)) regionalTick(5);
  if (p11Every('rb', 10, dt)) roundaboutTick();
  if (p11Every('metro', 10, dt)) p11T('metro', metroOverloadTick);
  if (p11Every('commercial', 60, dt)) commercialTick();
  if (p11Every('roadMaint', 60, dt)) roadMaintenanceTick();
  city3Tick(dt);
}
function part11Mods(m) { if (!S.p11) return m; transportMods(m); financeMods(m); cityMods(m); return m; }
function p11MapReset() { P11.park = null; P11.walk = null; P11.rb.clear(); P11.multi.clear(); PRED.hist = []; PRED.cond.clear(); FLOOD.tiles = new Set(); FLOOD.marked = new Set(); GRID3.profile = new Array(24).fill(0); GRID3.seen = new Array(24).fill(0); }
function p11DebugLines() { return '— PART 11 — ' + Object.keys(P11.prof).map(function (k) { const q = P11.prof[k]; return k + ' ' + (q.ms / Math.max(1, q.n)).toFixed(2) + '/' + q.max.toFixed(0) + 'ms'; }).join('  '); }
function p11ApplyDistrictNames() { if (!S || !S.p11 || !MAP.dnames) return; for (const k in S.p11.dnames) if (+k < MAP.dnames.length) MAP.dnames[+k] = S.p11.dnames[k]; }

/* ===================================== HELPERS ===================================== */
function qb(act, label, cls, v) { return '<button class="btn small ' + (cls || '') + '" data-p11="' + act + '"' + (v !== undefined ? ' data-v="' + esc(String(v)) + '"' : '') + '>' + label + '</button>'; }
function p11Say(r) { if (!r) return; if (r.ok === false) toast('❌ ' + r.reason, 'bad'); else toast('✅ ' + (r.msg || r), 'good'); }
function p11Rerender() { if (typeof rerender === 'function') rerender(); }

/* ===================================== LIVING CITY HUB: NEW TABS ===================================== */
HUB_TABS.push(['transport3', '🚇', 'Transport Engine'], ['finance', '🏦', 'Finance & Markets'], ['budget2', '📊', 'Budget 2.0'], ['smart', '📡', 'Smart City'], ['buildings3', '🏢', 'Buildings'], ['green', '🌿', 'Green & Climate']);
Object.assign(HUB_VIEWS, {
  transport3: function () {
    const N = transportNetwork(), md = S.p11.modal, M = metroEngine(), R = regionalRail(), T = tradeRoutes(), pk = parkingPass(), wk = walkPass();
    const net = cd('🌐 Transport Engine — one network', tbl(['Mode', 'Size', 'Capacity', 'Lines'], TP_MODES.map(function (m) { const o = N[m[0]]; return [m[1] + ' ' + m[2], fmt(o.n) + ' ' + o.unit, fmt(Math.round(o.cap)), o.lines || '—']; })));
    const mm = cd('🔀 Multi-modal routing (' + fmt(md.trips) + ' trips planned · ⌀ ' + Math.round(md.avgMin) + ' min)', tbl(['Mode', 'Share'], Object.keys(MM_MODES).map(function (k) { return [MM_MODES[k][0] + ' ' + MM_MODES[k][1], bar((md[k] || 0) * 100) + ' ' + pc((md[k] || 0) * 100)]; })) + '<p class="small">Citizens compare walking, biking, car, transit with transfers and park & ride by time, cost, traffic, transfers and comfort (crowding, rain, walkability, bike lanes, parking).</p>');
    const L = S.p11.lights;
    const lights = cd('🚦 Traffic Light AI 2.0', '<div class="grid4">' + kv('Retimes', fmt(L.retimes)) + kv('Transit priority', fmt(L.transitPrio)) + kv('Emergency corridors', fmt(L.corridors)) + kv('Roundabout alerts', S.p11.rbStats.alerts) + '</div><div class="p10Log">' + L.log.concat(S.p11.rbStats.log).slice(0, 12).map(function (e) { return '<div><span class="small">D' + e.d + '</span> ' + esc(e.t) + '</div>'; }).join('') + '</div><p class="small">Traffic Light AI ' + (S.p9.traffic.lightAI ? '<b class="pos">ON</b>' : '<b class="neg">OFF</b>') + ' ' + pb('heat', '🌡️ Traffic heatmap', '', 'TRAFFIC') + '</p>');
    const works = cd('🚧 Road works', tbl(['Works', 'Tiles', 'Ends in', 'Cost'], S.p11.works.map(function (w) { return [esc(w.name), w.tiles.length, fmtGameDuration(Math.max(0, w.until - S.clock.runSec) * TIME_SCALE), money(w.cost)]; })) + '<div class="row admRowWrap">' + qb('worksCorridor', '🛣️ UPGRADE HIGHWAY (most congested corridor)', 'gold') + qb('worksPick', '🎯 Pick a district to upgrade') + qb('worksRepave', '🦺 Repave worn roads') + '</div><p class="small">During road works one lane is closed (slower traffic, re-routing); when finished the capacity rises. ' + S.p11.worksDone + ' works completed.</p>');
    const met = cd('🚇 Metro engine', tbl(['Line', 'Stations', 'Trains', 'Headway', 'Capacity/day', 'Passengers/day'], M.lines.map(function (l) { return [esc(l.name), l.stations, l.trains, l.headway.toFixed(1) + ' min', fmt(Math.round(l.cap)), fmt(Math.round(l.pax))]; })) +
      tbl(['Station', 'Lines', 'Passengers/day', 'Capacity/day', 'Load'], M.stations.slice().sort(function (a, b) { return b.load - a.load; }).slice(0, 12).map(function (s) { return [esc(s.name), esc(s.lines.join(', ') || '—'), fmt(Math.round(s.pax)), fmt(Math.round(s.cap)), '<b class="' + (s.load > 1 ? 'neg' : '') + '">' + pc(s.load * 100) + (s.load > 1 ? ' STATION OVERLOAD' : '') + '</b>']; })) + metroBuilderHtml());
    const trains = cd('🚆 Train network & regional trains', tbl(['Line', 'Type', 'Trains', ''], (S.p9 ? S.p9.transit.lines.filter(function (x) { return x.mode === 'train'; }) : []).map(function (x) { return [esc(x.name), trainType(x), x.vehicles, TRAIN_TYPES.map(function (t) { return qb('trainType', t, trainType(x) === t ? 'gold' : '', x.id + ':' + t); }).join('')]; })) +
      tbl(['Neighbour', 'Service', 'Trains', 'Passengers/day', 'Cargo t/day', ''], R.map(function (r) { return [r.icon + ' ' + r.name + ' (' + r.dir + ')', r.on ? '<b class="pos">ON</b>' : 'off', r.trains, fmt(Math.round(r.pax)), fmt(Math.round(r.cargo)), r.possible ? qb('regional', r.on ? 'Stop' : 'Start', r.on ? 'red' : 'green', r.id) + qb('regionalT', '+1 train', '', r.id) : '<span class="small">needs a train station</span>']; })));
    const trade = cd('🚢 Dynamic trade routes', tbl(['Partner', 'Distance', 'Best route', 'Cost/unit', 'Alternatives'], T.map(function (r) { return [r.icon + ' ' + esc(r.name), r.dist + ' km', r.best ? ROUTE_MODES3[r.best.mode][0] + ' ' + ROUTE_MODES3[r.best.mode][1] : '—', r.best ? '$' + r.best.cost.toFixed(2) : '—', r.opts.slice(1).map(function (o) { return ROUTE_MODES3[o.mode][0] + ' $' + o.cost.toFixed(2); }).join(' · ')]; })) + '<p class="small">Cost = distance + traffic + fuel + delay + infrastructure fee. Fees collected: ' + money(S.p11.trade.fees) + ' · truck share ' + pc((SIM.p11TruckShare || 0) * 100) + '</p>');
    const park = cd('🅿️ Parking', '<div class="grid4">' + kv('Spaces', fmt(Math.round(pk.sup))) + kv('Demand', fmt(Math.round(pk.dem))) + kv('Deficit', fmt(Math.round(pk.deficit)), pk.deficit > 0 ? 'neg' : 'pos') + kv('Illegal parking', fmt(Math.round(pk.illegal))) + '</div>' + pb('build', '🅿️ Parking Garage', '', 'parkinggarage') + pb('build', '🅿️ Park & Ride', '', 'parkride'));
    const walk = cd('🚶 Pedestrians, bikes & walkability (city ⌀ ' + Math.round(wk.avg) + '/100)', '<p class="small">Paint sidewalks, pedestrian streets, plazas, park paths, pedestrian bridges/tunnels and bike lanes with the brushes; bike-sharing stations let citizens bike between them.</p><div class="row admRowWrap">' + qb('paint', '🚶 Paint sidewalks / paths', '', 'sidewalk') + qb('paint', '🏛️ Plaza', '', 'plaza') + qb('paint', '🚲 Bike lanes', '', 'bikelane') + qb('paint', '🧽 Erase', '', 'erasepath') + pb('build', '🚲 Bike Sharing Station', '', 'bikestation') + pb('heat', '🌡️ Walkability map', '', 'WALKABILITY') + '</div>' +
      tbl(['District', 'Walkability', 'Bike lanes'], wk.cells.map(function (c, k) { return [c, k]; }).filter(function (x) { return x[0].road || x[0].shops; }).sort(function (a, b) { return b[0].score - a[0].score; }).slice(0, 10).map(function (x) { const n = wk.n; return [esc(districtName((x[1] % n) * 8 + 4, Math.floor(x[1] / n) * 8 + 4) || 'District ' + x[1]), bar(x[0].score) + ' ' + x[0].score, pc(x[0].bike * 100)]; })));
    return '<div class="grid2">' + net + mm + '</div><div class="grid2">' + lights + works + '</div>' + met + '<div class="grid2">' + trains + trade + '</div><div class="grid2">' + park + walk + '</div>';
  },
  finance: function () {
    const B = bankPass(), M = S.p11.mort, hm = housingMarket(), rr = rentalByRegion(), cm = commercialMarket();
    const banks = cd('🏦 Bank system' + (B.central ? ' <span class="small">(no bank in the city — outside lenders charge +2%)</span>' : ''), '<div class="grid4">' + kv('Deposits', money(B.deposits)) + kv('Business loans', money(B.loans)) + kv('Mortgages', money(B.mortgages)) + kv('Liquidity', pc(B.liquidity * 100), B.liquidity < 0.15 ? 'neg' : 'pos') + kv('Interest rate', (interestRate() * 100).toFixed(2) + '%') + kv('Mortgage rate', ((M.rate || interestRate() + 0.015) * 100).toFixed(2) + '%') + kv('Bank profit', money(S.p11.bankStats.profit)) + kv('Written off', money(S.p11.bankStats.losses)) + '</div>' +
      tbl(['Bank', 'Owner', 'Deposits', 'Loans', 'Mortgages', 'Liquidity'], B.banks.map(function (x) { return [esc(x.name), ownerLabel(x.owner), money(x.B.deposits), money(x.B.loans), money(x.B.mortgages), pc(x.B.liquidity * 100)]; })) + pb('build', '🏦 Bank', '', 'bank') +
      '<p class="small">The interest rate follows inflation, growth, the economic cycle and bank liquidity (never below 1%).</p>');
    const fin = cd('📑 Company Finance 2.0', tbl(['Company', 'Revenue/yr', 'Expenses/yr', 'Profit/yr', 'Debt', 'Assets', 'Employees', 'Share', 'Stock value', 'Inventory', 'Cash', 'Growth', 'Bankruptcy risk'], AI_DEFS.filter(function (a) { return S.ai[a.id] && !S.ai[a.id].acquired; }).map(function (a) { const f = companyFinance(a.id); return [a.icon + ' ' + esc(a.name), money(f.revenue), money(f.expenses), '<span class="' + moodCls(f.profit >= 0) + '">' + money(f.profit) + '</span>', money(f.debt), money(f.assets), fmt(Math.round(f.employees)), pc(f.share * 100), money(f.stockValue), money(f.inventory), money(f.cash), sgn(f.growth * 100, function (v) { return v.toFixed(0) + '%'; }), '<b class="' + (f.risk > 0.6 ? 'neg' : '') + '">' + pc(f.risk * 100) + (f.risk > 0.6 ? ' BANKRUPTCY RISK' : '') + '</b>']; })) +
      tbl(['Loan', 'Company', 'Principal', 'Rate', 'Term', 'Remaining'], S.p11.loans.slice(-10).reverse().map(function (l) { return ['#' + l.id, companyLabel(l.co), money(l.principal), (l.rate * 100).toFixed(1) + '%', l.years + ' y', money(l.remaining)]; })));
    const con = cd('🤝 Trade contracts', tbl(['#', 'Company', 'Partner', 'Product', 'Qty/month', 'Value', 'Duration', 'Delivered', 'Status'], S.p11.contracts.slice().reverse().map(function (c) { return ['#' + c.id, companyLabel(c.co), esc(c.partnerName), PRODUCTS[c.product].icon + ' ' + (c.dir === 'sell' ? 'sell ' : 'buy ') + PRODUCTS[c.product].name, fmt(c.qtyMonth), money(c.priceTotal), (c.months / 12).toFixed(1) + ' y', fmt(Math.round(c.delivered)), esc(c.status) + (c.owner === 'player' && c.status === 'active' ? ' ' + qb('conCancel', 'Cancel', 'red', c.id) : '')]; })) + contractFormHtml() + '<p class="small">Signed ' + S.p11.conStats.signed + ' · renewed ' + S.p11.conStats.renewed + ' · cancelled ' + S.p11.conStats.cancelled + ' · shortfalls ' + S.p11.conStats.shortfalls + '</p>');
    const mort = cd('🏠 Mortgages & housing market', '<div class="grid4">' + kv('Owners', fmt(M.owners) + ' (' + pc(M.ownerShare * 100) + ')') + kv('Renters', fmt(M.renters)) + kv('Avg home price', money(M.avgPrice)) + kv('Avg payment/month', money(M.avgPayment)) + kv('Outstanding', money(M.outstanding)) + kv('Defaults', fmt(M.defaults)) + kv('Price index', '×' + S.city.housingPrice.toFixed(2)) + kv('Housing demand', pc((SIM.housingDemandRatio || 0) * 100)) + '</div><p class="small">Example: home ' + money(M.avgPrice) + ' → down payment ' + money(M.avgPrice * 0.2) + ', loan ' + money(M.avgPrice * 0.8) + ' at ' + ((M.rate || 0.05) * 100).toFixed(1) + '% over 25 years; households buy when the payment is ≤ 35% of their income.</p>' +
      tbl(['District', 'Price index', 'Home price', 'Rent/month', 'Occupancy', 'Land', 'Transit', 'Services'], hm.slice(0, 12).map(function (h) { return [esc(h.name), '×' + h.index.toFixed(2), money(h.price), money(h.rent), pc(h.occ * 100), '×' + h.land.toFixed(2), h.transit, pc(h.services * 100)]; })));
    const rent = cd('🔑 Rental market', tbl(['Region', 'Rent/month', 'Income/month', 'Rent share'], rr.map(function (r) { return [esc(r.region), money(r.rent), money(r.income), pc(r.share * 100)]; })));
    const com = cd('🏪 Commercial market', tbl(['District', 'Stores', 'Footfall', 'Rent/s', 'Profit/s', 'Competition', 'Demand'], cm.slice(0, 12).map(function (c) { return [esc(c.name), c.stores, fmt(Math.round(c.foot)), money(c.rent), '<span class="' + moodCls(c.profit >= 0) + '">' + money(c.profit) + '</span>', c.competition + ' ' + (c.top || ''), pc(c.demand * 100)]; })) + '<div class="p10Log">' + S.p11.commercial.log.slice(0, 8).map(function (e) { return '<div><span class="small">D' + e.d + '</span> ' + esc(e.t) + '</div>'; }).join('') + '</div>');
    return '<div class="grid2">' + banks + mort + '</div>' + fin + con + '<div class="grid2">' + rent + com + '</div>';
  },
  budget2: function () {
    const b = budget2(), f = budgetForecast(), h = financialHealth(), c = cityConsumption(), fd = foodNetwork(), pr = marketPrices(), ph = econPhase();
    const bud = cd('🏛️ City Budget 2.0 (per second)', '<div class="grid2"><div>' + tbl(['Income', ''], BUDGET_IN.map(function (k) { return [k[1] + ' ' + k[2], money(b.inc[k[0]], 2)]; }).concat([['<b>Total</b>', '<b>' + money(b.totalIn, 2) + '</b>']])) + '</div><div>' + tbl(['Expenses', ''], BUDGET_OUT.map(function (k) { return [k[1] + ' ' + k[2], money(b.out[k[0]], 2)]; }).concat([['<b>Total</b>', '<b>' + money(b.totalOut, 2) + '</b>']])) + '</div></div><p>Balance <b class="' + moodCls(b.net >= 0) + '">' + money(b.net, 2) + '/s</b> · per month ' + money(b.net * GAME_MONTH) + '</p>');
    const fc = cd('🔮 Budget forecast', '<div class="grid4">' + kv('Current balance', money(f.now)) + kv('Projected in 5 years', money(f.in5), f.in5 >= f.now ? 'pos' : 'neg') + kv('Lowest point', money(f.min)) + kv('Risk', f.risk, f.risk === 'High' ? 'neg' : f.risk === 'Low' ? 'pos' : '') + '</div>' + svgChart(f.yearly, 400, 60, '#ffd166') + '<p class="small">Today\'s balance + the income / expense trend of the live graphs + the current economic cycle (' + ph.icon + ' ' + ph.id + ').</p>');
    const fh = cd('💚 FINANCIAL HEALTH ' + h.score + ' / 100', bar(h.score, h.score < 40 ? 'red' : '') + tbl(['Factor', 'Points'], [['Reserves (' + h.reserves.toFixed(1) + ' months of expenses)', h.parts.reserves.toFixed(0) + ' / 30'], ['Income vs expenses', h.parts.balance.toFixed(0) + ' / 25'], ['Debt (' + money(h.debt) + ')', h.parts.debt.toFixed(0) + ' / 20'], ['Economic growth (' + sgn(h.growth * 100, function (v) { return v.toFixed(1) + '%'; }) + ')', h.parts.growth.toFixed(0) + ' / 15'], ['Income diversity', h.parts.diversity.toFixed(0) + ' / 10']]) + svgChart(S.p11.finHist, 400, 40, '#80ed99'));
    const cyc = cd('🔁 Economic cycle: ' + ph.icon + ' ' + (ph.id === 'NORMAL' ? 'GROWTH' : ph.id), '<p class="small">' + esc(ph.desc) + ' Your decisions (unemployment, budget balance, interest rate, reputation and megaprojects) weigh the next phase.</p><div class="p10Log">' + S.p11.cycle.log.slice(0, 8).map(function (e) { return '<div><span class="small">D' + e.d + '</span> ' + esc(e.t) + '</div>'; }).join('') + '</div>');
    const cons = cd('🍽️ City consumption per day', '<div class="grid4">' + kv('Food', fmt(Math.round(c.foodT)) + ' t') + kv('Water', fmt(Math.round(c.waterL)) + ' L') + kv('Electricity', c.powerGWh.toFixed(2) + ' GWh') + kv('Fuel', fmt(Math.round(c.fuelL)) + ' L') + '</div>');
    const food = cd('🌾 Food network: farm → warehouse → distribution → store → household', tbl(['Stage', 'Value'], [['🚜 Farms', fd.farms + ' · ' + fmt(Math.round(fd.prodT)) + ' t/day'], ['📦 Warehouse stock', fmt(Math.round(fd.stockT)) + ' t'], ['🚚 Distribution', fmt(Math.round(fd.delT)) + ' t/day (logistics ' + pc(fd.logistics * 100) + ')'], ['🏪 Stores', pc(fd.storeRatio * 100) + ' of demand'], ['🏠 Households need', fmt(Math.round(fd.needT)) + ' t/day']]) + '<p>Food security <b class="' + (fd.security < 0.9 ? 'neg' : 'pos') + '">' + pc(fd.security * 100) + '</b> · food price $' + fmt(Math.round(fd.foodPrice)) + '/t</p>');
    const prices = cd('💲 Market prices', tbl(['Product', 'Price', 'Base', 'Supply/demand', 'Inflation', 'Shock', 'Transport'], pr.map(function (p) { return [p.icon + ' ' + p.name, '<b>$' + fmt(Math.round(p.perTon)) + '/t</b>', '$' + fmt(Math.round(p.base)), pc(p.sd * 100), '×' + p.infl.toFixed(2), '×' + p.shock.toFixed(2), '×' + p.transport.toFixed(2)]; })));
    return '<div class="grid2">' + bud + '<div>' + fc + fh + '</div></div><div class="grid2">' + cyc + cons + '</div><div class="grid2">' + food + prices + '</div>';
  },
  smart: function () {
    const N = sensorNet(), P = S.p11.sensors, pr = predictions(), mp = maintenancePredictions();
    const net = cd('📡 SMART CITY SENSOR NETWORK', '<div class="grid4">' + kv('Sensor hubs', N.hubs.length) + kv('Active sensors', fmt(N.sensors)) + kv('Data rate', fmt(N.rate) + ' samples/min') + kv('Coverage', pc(N.coverage * 100)) + kv('Data centers', N.dcs) + kv('Data processed', pc(N.processing * 100)) + kv('Traffic events', P.counts.traffic) + kv('Utility / environment', P.counts.utility + ' / ' + P.counts.environment) + '</div><p class="small">Sensor types: ' + SENSOR_TYPES.map(function (s) { return s[1] + ' ' + s[0]; }).join(' · ') + '</p>' + pb('build', '📡 Sensor Hub', '', 'sensorhub') + pb('build', '🖥️ Smart City Data Center', '', 'smartdc') +
      '<div class="p10Log">' + P.alerts.slice(0, 14).map(function (a) { return '<div><span class="small">D' + a.d + ' ' + pad2(a.h) + ':00 · ' + a.cat + '</span> ' + esc(a.t) + '</div>'; }).join('') + '</div>');
    const pred = cd('🔮 Predictive system', pr.length ? pr.map(function (p) { return '<div class="p10Op">' + p.icon + ' ' + esc(p.text) + ' <span class="small">(confidence ' + pc(p.conf * 100) + ')</span></div>'; }).join('') : '<p class="small">Collecting trends… (' + PRED.hist.length + '/5 samples). No capacity problem expected.</p>');
    const pm = cd('🛠️ Predictive maintenance', tbl(['Asset', 'Condition', 'Critical in', ''], mp.slice(0, 15).map(function (m) { return [m.icon + ' ' + esc(m.name), pc(m.cond), fmtMonths(m.months), pb('infra', '🛠️ Maintain now', 'green', m.key + ':repair')]; })) + '<p class="small">Condition trends are tracked per asset; repairs before they fail avoid closures and outages.</p>');
    const risk = cd('⚠️ CITY RISK MAP', '<div class="row admRowWrap">' + RISK_TYPES.map(function (r) { return qb('risk', r[1] + ' ' + r[2], P11.ui.risk === r[0] ? 'gold' : '', r[0]); }).join('') + '</div><p class="small">Opens the risk heatmap on the city view.</p>');
    return '<div class="grid2">' + net + '<div>' + pred + risk + '</div></div>' + pm;
  },
  buildings3: function () {
    const b = UI.selected && MAP.byId.has(UI.selected.id) ? UI.selected : null;
    const sel = b ? cd(bdef(b).icon + ' ' + bdef(b).name + ' #' + b.id + ' — interior', interiorHtml(b) + upgradesHtml(b)) : cd('🏢 Building interiors', '<p class="small">Select a building on the map to see its interior, activity schedule, parking and the Upgrades 2.0 tracks.</p>');
    const types = {}; S.buildings.list.forEach(function (x) { if (!x.built) return; const c = actClass(bdef(x)); types[c] = (types[c] || 0) + 1; });
    const act = cd('🕒 Building activity (' + pad2(Math.floor(gameHour())) + ':00)', tbl(['Class', 'Buildings', 'Schedule', 'Active now'], Object.keys(ACT_CLASSES).filter(function (k) { return types[k]; }).map(function (k) { return [k, types[k], ACT_CLASSES[k].label, pc(actAt(k, gameHour()) * 100)]; })) + '<p class="small">Electricity and water demand follow the opening hours (daily average unchanged). Smart Buildings research: ' + (hasTech('ar_smartbld') ? '<b class="pos">researched</b> — comfort +' + smartComfort().toFixed(1) : 'not researched') + '. Upgrades installed: ' + S.p11.upgradesDone + '</p>');
    const big = S.buildings.list.filter(function (x) { return x.built && (bdef(x).workers >= 40 || bdef(x).beds || bdef(x).housing >= 400); }).sort(function (x, y) { return (bdef(y).cost || 0) - (bdef(x).cost || 0); }).slice(0, 12);
    const list = cd('🏙️ Major buildings', tbl(['Building', 'Floors', 'People', 'Capacity', 'Visitors/day', 'Activity'], big.map(function (x) { const I = buildingInterior(x); return [bdef(x).icon + ' ' + bdef(x).name + ' #' + x.id, I.floors, fmt(I.workers || I.residents || 0), fmt(I.capacity || I.units || I.beds || 0), I.visitors ? fmt(I.visitors) : '—', pc(I.activity)]; })));
    return '<div class="grid2">' + sel + act + '</div>' + list;
  },
  green: function () {
    const G = smartGrid(), Wf = wasteFlows(), C = climateStatus(), fl = S.p11.flood, fr = S.p11.fire;
    const grid = cd('🔋 Smart grid & storage', '<div class="grid4">' + kv('Generation', fmt(Math.round(G.gen)) + ' MW') + kv('Demand', fmt(Math.round(G.use)) + ' MW') + kv('Forecast next hour', fmt(Math.round(G.forecastNext)) + ' MW') + kv('Green share', pc(G.green * 100)) + kv('Stored', fmt(Math.round(G.stored)) + ' / ' + fmt(Math.round(G.cap)) + ' MWh') + kv('Charge', fmt(Math.round(G.charging)) + ' MW') + kv('Discharge', fmt(Math.round(G.discharging)) + ' MW') + kv('Peak hours', G.peak.map(function (h) { return pad2(h) + 'h'; }).join(' ') || '—') + '</div>' + bar(G.soc * 100, 'gold') + svgChart(G.profile.filter(function (v, h) { return true; }), 400, 50, '#ffd166') + '<p class="small">Grid AI ' + (S.p11.gridAI ? 'ON' : 'OFF') + ' ' + qb('gridAI', 'Toggle') + ' — charges from surplus, discharges in deficits and keeps a reserve for the forecast peak.</p>' + pb('build', '🔋 Battery', '', 'battery') + pb('build', '💧 Hydro', '', 'hydro') + pb('build', '☀️ Solar', '', 'solar') + pb('build', '🌬️ Wind', '', 'wind'));
    const waste = cd('♻️ Waste management', tbl(['Flow', 't/day'], [['🏠 Household waste', fmt(Math.round(Wf.household))], ['🏪 Commercial waste', fmt(Math.round(Wf.commercial))], ['🏭 Industrial waste', fmt(Math.round(Wf.industrial))], ['🚛 Collection capacity (' + Wf.trucks + ' trucks on the road)', fmt(Math.round(Wf.capacity))], ['♻️ Recycled', fmt(Math.round(Wf.recycledT))], ['🗑️ Uncollected backlog', fmt(Math.round(Wf.backlog)) + ' t']]) +
      tbl(['Landfill', 'Fill', ''], Wf.landfills.map(function (l) { return ['#' + l.b.id, bar(l.fill / l.cap * 100, l.fill >= l.cap ? 'red' : '') + ' ' + fmt(Math.round(l.fill)) + ' / ' + fmt(l.cap) + ' t', l.b.p11Full ? 'FULL' : '']; })) + '<p class="small">Recycling economy: waste → ' + fmt(Math.round(Wf.metal)) + ' recycled metal + ' + fmt(Math.round(Wf.mat)) + ' materials → factories → electronics.</p>' + pb('build', '♻️ Recycling Plant', '', 'recycling') + pb('build', '🏔️ Landfill', '', 'landfill') + pb('build', '🔥 Waste Processing', '', 'wastecenter'));
    const clim = cd('🌡️ Climate adaptation', '<div class="grid4">' + kv('Flood barriers', C.barriers) + kv('Drainage stations', C.drainage) + kv('Cooling centers', C.cooling) + kv('Reservoirs', C.reservoirs) + kv('Green roofs', C.greenRoofs) + kv('Trees', fmt(C.trees)) + kv('Low land protected', pc(C.protectedShare * 100)) + kv('Heat-wave cover', pc(C.heatCover * 100)) + '</div>' + ['floodbarrier', 'drainage', 'coolingcenter', 'reservoir'].map(function (id) { return pb('build', BUILDINGS[id].icon + ' ' + BUILDINGS[id].name, '', id); }).join(' ') + qb('treePlant', '🌳 Plant 50 trees (' + money(50 * 60 * costMult()) + ')'));
    const fireflood = cd('🔥 Fire & 🌊 flood simulation', '<p class="small">Fires spread with wind, heat and nearby structures (' + fr.spread + ' spread events); floods build up from rain, rivers and poor drainage on low land (' + fl.events + ' flood events).</p><div class="p10Log">' + fr.log.concat(fl.log).slice(0, 10).map(function (e) { return '<div><span class="small">D' + e.d + '</span> ' + esc(e.t) + '</div>'; }).join('') + '</div>' +
      tbl(['District', 'Water level'], Object.keys(fl.level).sort(function (a, b) { return fl.level[b] - fl.level[a]; }).slice(0, 8).map(function (k) { const n = MAP.dN || 1; return [esc(districtName((+k % n) * 8 + 4, Math.floor(+k / n) * 8 + 4) || 'District ' + k), bar(fl.level[k] * 50, fl.level[k] > 1 ? 'red' : '') + ' ' + fl.level[k].toFixed(2) + (fl.level[k] > 1 ? ' FLOODING' : '')]; })));
    return '<div class="grid2">' + grid + waste + '</div><div class="grid2">' + clim + fireflood + '</div>';
  }
});
function interiorHtml(b) {
  const I = buildingInterior(b), rows = [['Floors', I.floors]];
  if (I.workers !== undefined) rows.push(['Workers', fmt(I.workers) + ' / ' + fmt(I.capacity)]);
  if (I.residents !== undefined) rows.push(['Residents', fmt(I.residents) + ' in ' + fmt(I.units) + ' units']);
  if (I.beds !== undefined) rows.push(['Beds', fmt(I.beds) + ' (ER ' + I.er + ') · staff ' + fmt(I.staff)]);
  if (I.shops !== undefined) rows.push(['Shops', fmt(I.shops)]);
  if (I.visitors !== undefined) rows.push(['Visitors/day', fmt(I.visitors)]);
  if (I.students !== undefined) rows.push(['Students', fmt(I.students)]);
  if (I.rooms !== undefined) rows.push(['Rooms', fmt(I.rooms)]);
  if (I.storage !== undefined) rows.push(['Storage', fmt(I.storage)]);
  rows.push(['Parking', fmt(I.parking) + ' spaces'], ['Activity now', I.activity + '% · ' + ACT_CLASSES[actClass(bdef(b))].label], ['Power / water factor', '×' + p11UseMult(b, 'power').toFixed(2) + ' / ×' + p11UseMult(b, 'water').toFixed(2)]);
  return tbl(['', ''], rows);
}
function upgradesHtml(b) {
  return '<h4>Upgrades 2.0</h4>' + tbl(['Track', 'Level', 'Effect', ''], Object.keys(UPG_TRACKS).map(function (t) { const lv = (b.u && b.u[t]) || 0, mx = upgradeTrackMax(t); return [UPG_TRACKS[t][0] + ' ' + UPG_TRACKS[t][1], lv + ' / ' + mx, '<span class="small">' + UPG_TRACKS[t][2] + '</span>', lv < mx && !isAI(b) ? qb('upg', '⬆ ' + money(upgradeTrackCost(b, t)), '', b.id + ':' + t) : '']; }));
}
const MB = { a: '', b: '', prop: null };
function metroBuilderHtml() {
  const st = S.buildings.list.filter(function (b) { return b.type === 'metro' && b.built; });
  if (st.length < 2) return '<h4>🛠️ Metro Line Builder</h4><p class="small">Build at least two Metro Stations (Metro research), then pick station A and B here. ' + pb('build', '🚇 Metro Station', '', 'metro') + '</p>';
  const opt = function (cur) { return st.map(function (b) { return '<option value="' + b.id + '"' + (String(b.id) === String(cur) ? ' selected' : '') + '>' + esc(districtName(b.x, b.y) || 'Station') + ' #' + b.id + '</option>'; }).join(''); };
  let h = '<h4>🛠️ Metro Line Builder</h4><div class="row admRowWrap"><span>STATION A</span><select class="admInput" id="mbA">' + opt(MB.a || st[0].id) + '</select><span>↓ STATION B</span><select class="admInput" id="mbB">' + opt(MB.b || st[st.length - 1].id) + '</select>' + qb('mbSuggest', '🧭 Suggest line', 'blue') + '</div>';
  const P = MB.prop;
  if (P && !P.error) h += '<p>' + esc(P.aName) + ' → ' + esc(P.bName) + ' · ' + P.length + ' km · cost ' + money(P.cost) + '</p>' + tbl(['Stop', 'Type', 'Include'], [[esc(P.aName), 'start', '✓']].concat(P.along.map(function (s) { return [esc(s.name), 'existing station', qb('mbSkip', P.skip.indexOf('a' + s.id) >= 0 ? '✗ skipped' : '✓ included', P.skip.indexOf('a' + s.id) >= 0 ? 'red' : 'green', 'a' + s.id)]; }), P.sites.map(function (s, i) { return [esc(s.name) + ' (' + s.x + ',' + s.y + ')', 'new station', qb('mbSkip', P.skip.indexOf('s' + i) >= 0 ? '✗ skipped' : '✓ included', P.skip.indexOf('s' + i) >= 0 ? 'red' : 'green', 's' + i)]; }), [[esc(P.bName), 'end', '✓']])) + qb('mbBuild', '🚇 BUILD LINE', 'gold');
  else if (P && P.error) h += '<p class="neg">' + esc(P.error) + '</p>';
  return h;
}
function contractFormHtml() {
  const parts = contractPartners();
  return '<div class="row admRowWrap"><span>New contract (your companies):</span><select class="admInput" id="cfP">' + parts.map(function (p) { return '<option value="' + p.id + '">' + esc(p.icon + ' ' + p.name) + '</option>'; }).join('') + '</select><select class="admInput" id="cfG">' + PRODUCT_IDS.map(function (p) { return '<option value="' + p + '">' + esc(PRODUCTS[p].name) + '</option>'; }).join('') + '</select><select class="admInput" id="cfD"><option value="sell">sell</option><option value="buy">buy</option></select><input class="admInput" id="cfQ" type="number" value="1000" style="width:90px"><span>units/month</span><input class="admInput" id="cfY" type="number" value="2" style="width:60px"><span>years</span>' + qb('conSign', '🤝 Sign', 'gold') + '</div>';
}
function companyFinance(id) {
  const st = S.ai[id] || {}, m = S.p10 ? corpMeta(id) : { growth: 0 }, yr = YEAR_GAME_SEC / TIME_SCALE, s = stockOf(id);
  let prod = 0, all = 0; S.buildings.list.forEach(function (b) { if (b._prod) { all += b._prod; if (b.owner === id) prod += b._prod; } });
  return { revenue: (st.rev || 0) * yr, expenses: ((st.rev || 0) - (st.profit || 0)) * yr, profit: (st.profit || 0) * yr, debt: companyDebt(id), assets: st.assets || 0, employees: aiEmployees(id), share: companyShare(id), stockValue: s.price * SHARES_TOTAL, inventory: all > 0 ? (SIM.storageUsed || 0) * prod / all * 2.5 : 0, cash: st.cash || 0, growth: m.growth || 0, risk: bankruptcyRisk(id) };
}

/* ===================================== ACTIONS ===================================== */
function p11Do(a, v, el) {
  if (!S || !S.p11) return;
  const n = Number(v), adminOnly = function () { if (!adminModeEnabled()) { promptEnableAdmin('wc_tr'); return true; } return false; };
  const sel = function () { const L = P11.multi.size ? Array.from(P11.multi).map(function (id) { return MAP.byId.get(id); }).filter(Boolean) : (UI.selected && MAP.byId.has(UI.selected.id) ? [UI.selected] : []); return L; };
  switch (a) {
    case 'worksCorridor': p11Say(startRoadWorks(corridorTiles(), 'highway')); break;
    case 'worksRepave': { const t = []; if (S.p10) for (const k in S.p10.infra) { const x = S.p10.infra[k]; if (x.k === 'road' && x.cond < 60) t.push.apply(t, districtRoadTiles(x.tile % MAP.W, (x.tile / MAP.W) | 0)); } p11Say(t.length ? startRoadWorks(t.slice(0, 120), 'repave') : { ok: false, reason: 'No worn road network (condition < 60%)' }); break; }
    case 'worksPick': P11.pickWorks = true; closeModal(); if (ADM.open) closeAdminCenter(); toast('🎯 Click a district: its roads get an upgrade (Esc cancels)', ''); return;
    case 'mbSuggest': MB.a = $('mbA').value; MB.b = $('mbB').value; MB.prop = metroSuggest(MB.a, MB.b); break;
    case 'mbSkip': if (MB.prop) { const i = MB.prop.skip.indexOf(v); if (i >= 0) MB.prop.skip.splice(i, 1); else MB.prop.skip.push(v); } break;
    case 'mbBuild': { const r = metroBuild(MB.prop, ADM.open && adminModeEnabled() && S.p8.unlockAll); p11Say(r); if (r.ok) MB.prop = null; break; }
    case 'trainType': { const p = String(v).split(':'); p11Say(setTrainType(p[0], p[1])); break; }
    case 'regional': { const r = regionalToggle(v); r.on = !r.on; toast('🚆 Regional train ' + (r.on ? 'started' : 'stopped'), 'good'); break; }
    case 'regionalT': { const r = regionalToggle(v); r.trains = Math.min(12, r.trains + 1); break; }
    case 'paint': WB.mode = v; WB.on = true; closeModal(); if (ADM.open) closeAdminCenter(); toast('🖌️ ' + (BRUSH_MODES[v] || v) + ' — drag on the map (Esc stops)', ''); return;
    case 'conSign': { const r = signContract('player', $('cfP').value, $('cfG').value, $('cfD').value, admNum($('cfQ').value, 1000), admNum($('cfY').value, 2)); p11Say(r); break; }
    case 'conCancel': { const c = S.p11.contracts.find(function (x) { return x.id === n; }); if (c && c.owner === 'player') { c.status = 'cancelled'; S.p11.conStats.cancelled++; const pen = c.priceTotal * 0.05; S.money = Math.max(0, S.money - pen); toast('Contract cancelled (penalty ' + money(pen) + ')', ''); } break; }
    case 'risk': P11.ui.risk = v; HEAT6.at = -9; closeModal(); if (ADM.open) closeAdminCenter(); setHeatmap('RISK'); return;
    case 'upg': { const p = String(v).split(':'), b = MAP.byId.get(+p[0]); p11Say(applyTrackUpgrade(b, p[1], ADM.open && adminModeEnabled())); if (typeof renderBottomInfo === 'function' && UI.selected) renderBottomInfo(); break; }
    case 'gridAI': S.p11.gridAI = !S.p11.gridAI; break;
    case 'treePlant': { const c = 50 * 60 * costMult(); if (S.budget < c) { toast('❌ Needs ' + money(c), 'bad'); break; } const r = petitionDo('trees'); if (r) { S.budget -= c; toast('🌳 ' + r, 'good'); } break; }
    case 'fly': { const p = String(v).split(','); closeModal(); if (ADM.open) closeAdminCenter(); flyToTile(+p[0], +p[1], 0.9); const b = p[2] ? MAP.byId.get(+p[2]) : null; if (b) selectBuilding(b); return; }
    case 'book': openCityBook(v); return;
    case 'bookSave': saveCityBook(); return;
    /* ---- admin sections ---- */
    default: if (adminOnly()) return; adminCmd11(a, v, sel); break;
  }
  p11Rerender();
}
document.addEventListener('click', function (e) {
  const el = e.target.closest && e.target.closest('[data-p11]'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  try { p11Do(el.dataset.p11, el.dataset.v, el); } catch (err) { if (typeof logError === 'function') logError('Part 11 action ' + el.dataset.p11, err); toast('⚠️ ' + err.message, 'bad'); }
});
function farStations(type) { const L = S.buildings.list.filter(function (b) { return b.type === type && b.built; }); let best = null, bd = -1; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const d = Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y); if (d > bd) { bd = d; best = [L[i], L[j]]; } } return best; }
function adminCmd11(a, v, sel) {
  const done = function (m) { admRe(m); };
  switch (a) {
    /* TRANSPORT */
    case 'aBuildMetro': {
      wgUnlockTech('metro');
      let pair = farStations('metro');
      if (!pair) { const c = districtCenters().sort(function (x, y) { return (y.x + y.y) - (x.x + x.y); }); for (let k = 0; k < 2 && c.length; k++) { const t = k === 0 ? c[0] : c[c.length - 1]; placeUtilityNear('metro', Math.round(t.x), Math.round(t.y), true); } for (let k = 0; k < 2 && S.buildings.list.filter(function (b) { return b.type === 'metro'; }).length < 2; k++) wgPlaceAnywhere(null, 'metro', { owner: 'city', clearSmall: true }); S.buildings.list.forEach(function (b) { if (b.type === 'metro' && !b.built) { b.built = true; b.progress = 1; } }); onMapChanged(); pair = farStations('metro'); }
      if (!pair) return done('No space for metro stations');
      const r = metroBuild(metroSuggest(pair[0].id, pair[1].id), true); return done(r.ok ? 'BUILD METRO: ' + r.msg : r.reason);
    }
    case 'aRailway': {
      wgUnlockTech('metro'); wgUnlockTech('rail'); let k = 0;
      for (let i = 0; i < 3 && S.buildings.list.filter(function (b) { return b.type === 'trainstation'; }).length < 3; i++) if (wgPlaceAnywhere(null, 'trainstation', { owner: 'city', clearSmall: true })) k++;
      if (!S.buildings.list.some(function (b) { return b.type === 'railhub'; }) && wgPlaceAnywhere(null, 'railhub', { owner: 'city', clearSmall: true })) k++;
      onMapChanged(); S.buildings.list.forEach(function (b) { if ((b.type === 'trainstation' || b.type === 'railhub') && !b.built) { b.built = true; b.progress = 1; } });
      const L = S.p9.transit.lines.find(function (x) { return x.mode === 'train'; }) || createTransitLine('train');
      if (S.p9) S.p9.neighbors.forEach(function (nb) { regionalToggle(nb.id, true); });
      return done('GENERATE RAILWAY: ' + k + ' station(s)/hub built' + (L ? ' · line ' + L.name : '') + ' · regional trains to all neighbours');
    }
    case 'aClearTraffic': adminDo('clearTraffic'); return;
    case 'aOptimize': { S.p9.traffic.lightAI = true; JX.sig.clear(); const r = fixTraffic(); return done('OPTIMIZE TRAFFIC: ' + r); }
    case 'aRecalc': { MAP.pathCache.clear(); let n = 0; AG.vehicles.forEach(function (x) { if (x.siren || x.line || !x.path) return; const to = x.path[x.path.length - 1], from = x.path[Math.min(x.seg + 1, x.path.length - 1)], np = roadPath(from, to, false, x.mode || 'fastest'); if (np && np.length >= 2) { x.path = [x.path[x.seg]].concat(np); x.wp = laneWaypoints(x.path); x.seg = 0; x.t = 0; x.cleared = -1; n++; } }); return done('RECALCULATE ROUTES: ' + n + ' vehicle routes recomputed'); }
    case 'aMaxTransit': { transitRebuild(true); let n = 0; S.p9.transit.lines.forEach(function (L) { const M = TRANSIT_MODES[L.mode]; if (L.vehicles < M.perLine[1]) { n += M.perLine[1] - L.vehicles; L.vehicles = M.perLine[1]; } }); return done('MAX PUBLIC TRANSPORT: ' + S.p9.transit.lines.length + ' lines, +' + n + ' vehicles'); }
    case 'aSpawnTrain': { let L = S.p9.transit.lines.find(function (x) { return x.mode === 'train'; }); if (!L) L = createTransitLine('train'); if (!L) return done('Build two train stations first (GENERATE RAILWAY)'); L.vehicles = Math.min(8, L.vehicles + 1); return done('SPAWN TRAIN: ' + L.name + ' now runs ' + L.vehicles + ' train(s)'); }
    case 'aSpawnBus': { const stops = busRouteStops(); if (stops.length < 2) return done('Need two bus stops'); spawnBus(Math.floor(Math.random() * stops.length)); return done('SPAWN BUS: bus on the route'); }
    case 'aSpawnEm': { const kinds = ['medical', 'fire', 'police'], k = kinds[Math.floor(Math.random() * 3)], t = randomRoadTile(); const x = emergencyDispatch(k, t, { priority: 3 }); return done(x ? 'SPAWN EMERGENCY VEHICLE: ' + EMERGENCY_UNITS[k].name + ' en route (corridor lights prepared)' : 'No station can reach that road'); }
    /* ECONOMY */
    case 'aBoom': forceEconPhase('BOOM'); return done('ECONOMIC BOOM');
    case 'aRecession': forceEconPhase('RECESSION'); return done('RECESSION');
    case 'aResetPrices': PRODUCT_IDS.forEach(function (p) { S.economy.prices[p] = PRODUCTS[p].base * priceLevel(); }); return done('RESET PRICES to base × price level');
    case 'aMaxFunds': S.budget = MONEY_CAP; return done('MAX CITY FUNDS');
    case 'aDemandUp': S.p8.mods.demand = clamp(S.p8.mods.demand * 1.2, 0.2, 5); return done('INCREASE DEMAND ×' + S.p8.mods.demand.toFixed(2));
    case 'aDemandDown': S.p8.mods.demand = clamp(S.p8.mods.demand * 0.8, 0.2, 5); return done('DECREASE DEMAND ×' + S.p8.mods.demand.toFixed(2));
    case 'aSpawnCo': { const id = lwFoundCompany(v || pick(['SHOPPING', 'FOOD', 'TECHNOLOGY', 'INDUSTRY'])); return done(id ? 'SPAWN COMPANY: ' + aiDef(id).name : 'Maximum 12 custom companies'); }
    case 'aBankrupt': { const c = AI_DEFS.filter(function (x) { return S.ai[x.id] && !S.ai[x.id].acquired && x.kind === 'rival'; }).sort(function (x, y) { return (S.ai[x.id].cash || 0) - (S.ai[y.id].cash || 0); })[0]; if (!c) return done('No company'); const nm = c.name; if (c.custom) lwDissolve(c.id); else bankruptCompany(c.id); return done('BANKRUPT COMPANY: ' + nm); }
    case 'aContract': { const co = AI_DEFS.filter(function (x) { return S.ai[x.id] && !S.ai[x.id].acquired; }); const pt = contractPartners(); const p = PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)]; const r = signContract(co[Math.floor(Math.random() * co.length)].id, pt[Math.floor(Math.random() * pt.length)].id, p, Math.random() < 0.5 ? 'sell' : 'buy', 500 + Math.random() * 2000, 2); return done(r.ok ? 'CREATE TRADE CONTRACT: ' + r.msg : r.reason); }
    case 'aLoan': { const co = AI_DEFS.filter(function (x) { return S.ai[x.id] && !S.ai[x.id].acquired; })[0]; const r = companyBorrow(v || co.id, 20e6 * costMult() / 10, 10); return done(r.ok ? r.msg : r.reason); }
    case 'aBank': { const b = wgPlaceAnywhere(null, 'bank', { owner: 'city', clearSmall: true }); if (b) { b.built = true; b.progress = 1; onMapChanged(); } return done(b ? 'CREATE BANK: Bank #' + b.id + ' (' + (districtName(b.x, b.y) || 'city') + ')' : 'No space for a bank'); }
    case 'aRate': admPromptAsk('🏦 Interest rate', 'Percent (minimum 1)', (interestRate() * 100).toFixed(2), function (val) { S.p5.econ.rate = clamp(admNum(val, 5) / 100, 0.01, 0.15); admRe('Interest → ' + (S.p5.econ.rate * 100).toFixed(2) + '%'); }); return;
    /* BUILDINGS (selected / multi-selected) */
    case 'bBuild': { const L = sel(); L.forEach(function (b) { b.built = true; b.progress = 1; delete b.mega; }); onMapChanged(); return done('BUILD SELECTED: ' + L.length + ' building(s) completed'); }
    case 'bUpgrade': { const L = sel(); L.forEach(function (b) { if (b.level < MAX_LEVEL) b.level++; }); return done('UPGRADE SELECTED: ' + L.length); }
    case 'bRepair': { const L = sel(); L.forEach(function (b) { b.cond = 100; b.damaged = 0; b.repair = 0; b.fire = 0; }); return done('REPAIR SELECTED: ' + L.length); }
    case 'bMax': { const L = sel(); L.forEach(function (b) { b.level = MAX_LEVEL; b.u = b.u || {}; Object.keys(UPG_TRACKS).forEach(function (t) { b.u[t] = upgradeTrackMax(t); }); }); return done('MAX LEVEL: ' + L.length + ' building(s), all upgrade tracks'); }
    case 'bInstant': S.p5.admin.instant = !S.p5.admin.instant; return done('INSTANT CONSTRUCTION ' + (S.p5.admin.instant ? 'ON' : 'OFF'));
    case 'bType': { const t = aVal('p11Type') || v; const d2 = BUILDINGS[t]; if (!d2) return done('Pick a type'); let k = 0; sel().forEach(function (b) { const d = bdef(b); if (d2.w > d.w || d2.h > d.h) return; const owner = b.owner, x = b.x, y = b.y, id = b.id; removeBuilding(b); const nb = makeBuilding(t, x, y, id); nb.owner = d2.public ? 'city' : owner; addBuildingToMap(nb); k++; }); onMapChanged(); P11.multi.clear(); return done('CHANGE BUILDING TYPE → ' + d2.name + ': ' + k + ' (same or smaller footprint)'); }
    case 'bDup': { let k = 0; sel().forEach(function (b) { const nb = wgPlaceNear(b.type, b.x, b.y, 12, { owner: b.owner }); if (nb) { nb.built = true; nb.progress = 1; k++; } }); onMapChanged(); return done('DUPLICATE BUILDING: ' + k + ' copies placed nearby'); }
    case 'bDelete': { const L = sel(); L.forEach(function (b) { removeBuilding(b); }); P11.multi.clear(); selectBuilding(null); onMapChanged(); return done('DELETE SELECTED: ' + L.length); }
    case 'bMove': { const p = String(v).split(','), dx = +p[0], dy = +p[1]; let k = 0; sel().forEach(function (b) { const d = bdef(b); removeBuilding(b); const ok = wgCanPlace(d, b.x + dx, b.y + dy) || canPlace(d, b.x + dx, b.y + dy, true).ok; if (ok) { b.x += dx; b.y += dy; k++; } addBuildingToMap(b); }); onMapChanged(); return done('MOVE ALL: ' + k + ' moved'); }
    case 'bDistrict': admPromptAsk('🏷️ Assign district', 'District name for the selected buildings', '', function (nm) { nm = String(nm || '').replace(/[<>]/g, '').trim().slice(0, 32); if (!nm) return; const n = MAP.dN || Math.ceil(MAP.W / 8); sel().forEach(function (b) { S.p11.dnames[Math.floor(b.y / 8) * n + Math.floor(b.x / 8)] = nm; }); p11ApplyDistrictNames(); admRe('ASSIGN DISTRICT: "' + nm + '"'); }); return;
    case 'bClearSel': P11.multi.clear(); return done('Selection cleared');
    /* CITIZENS */
    case 'cAdd': admSetPop(S.city.population * 1.1 + 100); return done('ADD POPULATION +10%');
    case 'cRemove': admSetPop(S.city.population * 0.9); return done('REMOVE POPULATION −10%');
    case 'cJobs': { let k = 0; for (let i = 0; i < 20 && k < 500; i++) { const b = wgPlaceAnywhere(null, wgPick(['office', 'factory', 'supermarket']), {}); if (!b) break; k += b.workers; } onMapChanged(); return done('CREATE JOBS: +' + k); }
    case 'cMove': { const homes = MAP.lists.homes.filter(function (b) { return b._op; }); let k = 0; AG.citizens.forEach(function (c) { if (c.tourist || k >= 40 || Math.random() > 0.3 || !homes.length) return; const h = homes[Math.floor(Math.random() * homes.length)]; c.home = h.id; c.mem.home = h.id; k++; }); return done('MOVE CITIZENS: ' + k + ' households moved'); }
    case 'cNeeds': AG.citizens.forEach(function (c) { c.needs.food = c.needs.fun = c.needs.shopping = c.needs.work = 100; c.energy = 100; }); return done('RESET NEEDS');
    case 'cHappy': quickAction('q_maxHappy'); return;
    case 'cMigration': S.p10.fx.push({ k: 'growth', v: 0.5, until: S.clock.runSec + 300, id: '', src: 0 }); return done('GENERATE MIGRATION: growth +50% for 5 min');
    case 'cCommuters': S.p9.neighbors.forEach(function (nb) { nb.rel = Math.min(100, nb.rel + 10); }); S.p10.fx.push({ k: 'jobs', v: 0.1, until: S.clock.runSec + 300, id: '', src: 0 }); for (let i = 0; i < 6; i++) spawnAmbientVehicle('car'); return done('GENERATE COMMUTERS: neighbour relations +10, commuter flows up');
    /* UTILITY */
    case 'uBattery': { const b = wgPlaceAnywhere(null, 'battery', { owner: 'city', clearSmall: true }); if (b) { b.built = true; b.progress = 1; onMapChanged(); econTick(0.01); } return done(b ? 'Battery storage #' + b.id + ' built' : 'No space'); }
    case 'uFill': { const B = batteryCap(); S.p11.storage = B.cap; return done('Storage filled: ' + fmt(Math.round(B.cap * TIME_SCALE / 3600)) + ' MWh'); }
    case 'uAll': return done('BUILD ALL UTILITIES: ' + (buildAllUtilities().join(', ') || 'nothing missing'));
    case 'uSensors': { let k = 0; for (let y = 6; y < MAP.H; y += 18) for (let x = 6; x < MAP.W; x += 18) { if (!inUnlocked(x, y) || S.buildings.list.some(function (b) { return b.type === 'sensorhub' && Math.abs(b.x - x) <= 9 && Math.abs(b.y - y) <= 9; })) continue; const b = placeUtilityNear('sensorhub', x, y, true); if (b) { k++; } } if (!S.buildings.list.some(function (b) { return b.type === 'smartdc'; })) wgPlaceAnywhere(null, 'smartdc', { owner: 'city', clearSmall: true }); S.buildings.list.forEach(function (b) { if ((b.type === 'sensorhub' || b.type === 'smartdc') && !b.built) { b.built = true; b.progress = 1; } }); onMapChanged(); econTick(0.01); return done('SENSOR GRID: ' + k + ' hub(s) + data center'); }
    /* TOURISM */
    case 'tBoom': S.p10.fx.push({ k: 'tour', v: 0.5, until: S.clock.runSec + 600, id: '', src: 0 }); return done('Tourism boom: +50% for 10 min');
    case 'tAttraction': { const t = pick(['aquarium', 'obstower', 'historic', 'monument', 'convention']); S.city.tourismUnlocked = true; const b = wgPlaceAnywhere(null, t, { owner: 'city', clearSmall: true }); if (b) { b.built = true; b.progress = 1; onMapChanged(); } return done(b ? BUILDINGS[t].name + ' built' : 'No space'); }
    /* DISASTER & CLIMATE */
    case 'dFire': { const c = S.buildings.list.filter(function (b) { return b.built && bdef(b).housing; }); if (!c.length) return done('No building'); igniteBuilding(c[Math.floor(Math.random() * c.length)]); return done('Fire started — spread simulation active'); }
    case 'dFlood': { setWeather('heavyrain', 6); const k = Object.keys(S.p11.flood.level)[0]; let n = 0; for (let i = 0; i < MAP.roads.length; i += 7) { if (lowLand(i) > 0.3) { const kk = Math.floor(((i / MAP.W) | 0) / 8) * (MAP.dN || 1) + Math.floor((i % MAP.W) / 8); S.p11.flood.level[kk] = 1.4; n++; } } floodTick(1); return done('FLOOD: heavy rain + water level raised in ' + n + ' low areas' + (k ? '' : '')); }
    case 'dRisk': P11.ui.risk = v || 'all'; closeAdminCenter(); setHeatmap('RISK'); return;
    case 'clWeather': setWeather(v, 6); return done('Weather → ' + v);
    case 'clBarriers': { let k = 0; for (let i = 0; i < MAP.roads.length && k < 12; i += 3) { const x = i % MAP.W, y = (i / MAP.W) | 0; if (MAP.nature[i] === 2 || MAP.occ[i] || MAP.roads[i] || lowLand(i) <= 0.4 || protectedFromFlood(x, y) || !inUnlocked(x, y)) continue; if (wgCanPlace(BUILDINGS.floodbarrier, x, y) && canPlace(BUILDINGS.floodbarrier, x, y, true).ok !== false) { const b = wgCommit('floodbarrier', x, y, {}); b.owner = 'city'; k++; } } onMapChanged(); return done('Flood barriers: ' + k + ' built along the water'); }
    case 'clDrain': { let k = 0; const n = MAP.dN || 1; Object.keys(S.p11.flood.level).forEach(function (kk) { if (k >= 6) return; if (placeUtilityNear('drainage', (+kk % n) * 8 + 4, Math.floor(+kk / n) * 8 + 4, true)) k++; }); if (!k) { for (let i = 0; i < 3; i++) if (wgPlaceAnywhere(null, 'drainage', { owner: 'city' })) k++; } onMapChanged(); return done('Drainage stations: ' + k); }
    /* WORLD */
    case 'wBrush': WB.mode = v; WB.on = true; closeAdminCenter(); toast('🖌️ WORLD PAINTER: ' + (BRUSH_MODES[v] || v) + ' (size ' + WB.size + ') — drag on the map, Esc stops', ''); return;
    case 'wSize': WB.size = +v; return done('Brush size ' + WB.size);
    default: return;
  }
}

/* ===================================== WORLD CONTROL CENTER: 13 NEW SECTIONS ===================================== */
WC_CATS.push(['wc_tr', '🚇', 'TRANSPORT CONTROL'], ['wc_ec', '📈', 'ECONOMY CONTROL'], ['wc_bc', '🏢', 'BUILDING CONTROL'], ['wc_uc', '🔌', 'UTILITY CONTROL'], ['wc_cc', '👪', 'CITIZEN CONTROL'], ['wc_co', '🏦', 'COMPANY CONTROL'], ['wc_tu', '🧳', 'TOURISM CONTROL'], ['wc_sc', '📡', 'SMART CITY'], ['wc_dc', '🔥', 'DISASTER CONTROL'], ['wc_cl', '🌡️', 'CLIMATE CONTROL'], ['wc_td', '🚢', 'TRADE CONTROL'], ['wc_fi', '💹', 'FINANCE CONTROL'], ['wc_wd', '🗺️', 'WORLD CONTROL']);
function cmdRow(list) { return '<div class="row admRowWrap">' + list.map(function (x) { return qb(x[0], x[1], x[2] || '', x[3]); }).join('') + '</div>'; }
Object.assign(ADM_VIEWS, {
  wc_tr: function () { return aCard('🚇 TRANSPORT CONTROL', cmdRow([['aBuildMetro', '🚇 BUILD METRO', 'gold'], ['aRailway', '🚆 GENERATE RAILWAY', 'gold'], ['aClearTraffic', '🧹 CLEAR TRAFFIC'], ['aOptimize', '🚦 OPTIMIZE TRAFFIC', 'green'], ['aRecalc', '🔁 RECALCULATE ROUTES'], ['aMaxTransit', '🚌 MAX PUBLIC TRANSPORT'], ['aSpawnTrain', '🚆 SPAWN TRAIN'], ['aSpawnBus', '🚌 SPAWN BUS'], ['aSpawnEm', '🚑 SPAWN EMERGENCY VEHICLE', 'red']])) + HUB_VIEWS.transport3(); },
  wc_ec: function () { return aCard('📈 ECONOMY CONTROL', cmdRow([['aBoom', '🚀 ECONOMIC BOOM', 'green'], ['aRecession', '📉 RECESSION', 'red'], ['aResetPrices', '💲 RESET PRICES'], ['aMaxFunds', '💰 MAX CITY FUNDS', 'gold'], ['aDemandUp', '📈 INCREASE DEMAND'], ['aDemandDown', '📉 DECREASE DEMAND'], ['aSpawnCo', '🏢 SPAWN COMPANY'], ['aBankrupt', '💥 BANKRUPT COMPANY', 'red'], ['aContract', '🤝 CREATE TRADE CONTRACT']])) + HUB_VIEWS.budget2(); },
  wc_bc: function () {
    const L = P11.multi.size ? Array.from(P11.multi).map(function (id) { return MAP.byId.get(id); }).filter(Boolean) : (UI.selected ? [UI.selected] : []);
    const types = Object.keys(BUILDINGS).filter(function (k) { return !BUILDINGS[k].hidden; }).map(function (k) { return [k, BUILDINGS[k].name]; });
    return aCard('🏢 BUILDING CONTROL — ' + L.length + ' selected', '<p class="small">Select a building on the map, or hold <b>Ctrl</b> and click several (multi-select editor).</p>' + cmdRow([['bBuild', '🏗️ BUILD SELECTED'], ['bUpgrade', '⬆️ UPGRADE SELECTED'], ['bRepair', '🔧 REPAIR SELECTED'], ['bMax', '🏆 MAX LEVEL', 'gold'], ['bInstant', (S.p5.admin.instant ? '⚡ INSTANT CONSTRUCTION: ON' : '⚡ INSTANT CONSTRUCTION: OFF')], ['bDup', '📑 DUPLICATE BUILDING'], ['bDelete', '🗑️ DELETE SELECTED', 'red'], ['bDistrict', '🏷️ ASSIGN DISTRICT'], ['bClearSel', 'Clear selection']]) +
      '<div class="admRow"><span>CHANGE BUILDING TYPE</span>' + wcSel('p11Type', types, L[0] ? L[0].type : 'house') + qb('bType', 'Apply', 'blue') + '</div><div class="row admRowWrap"><span>MOVE ALL</span>' + qb('bMove', '⬅', '', '-1,0') + qb('bMove', '⬆', '', '0,-1') + qb('bMove', '⬇', '', '0,1') + qb('bMove', '➡', '', '1,0') + '</div>' +
      tbl(['Building', 'Type', 'Level', 'Condition'], L.slice(0, 20).map(function (b) { return [bdef(b).icon + ' #' + b.id, esc(bdef(b).name), b.level, pc(b.cond === undefined ? 100 : b.cond)]; }))) + (L[0] ? aCard('🏢 Interior & upgrades — ' + esc(bdef(L[0]).name), interiorHtml(L[0]) + upgradesHtml(L[0])) : '');
  },
  wc_uc: function () { return aCard('🔌 UTILITY CONTROL', cmdRow([['uAll', '⚡ BUILD ALL UTILITIES', 'gold'], ['uBattery', '🔋 BUILD BATTERY'], ['uFill', '🔋 FILL STORAGE'], ['uSensors', '📡 SENSOR GRID']])) + HUB_VIEWS.green(); },
  wc_cc: function () { return aCard('👪 CITIZEN CONTROL', cmdRow([['cAdd', '➕ ADD POPULATION', 'green'], ['cRemove', '➖ REMOVE POPULATION', 'red'], ['cJobs', '💼 CREATE JOBS'], ['cMove', '🏠 MOVE CITIZENS'], ['cNeeds', '🔄 RESET NEEDS'], ['cHappy', '😊 MAX HAPPINESS', 'gold'], ['cMigration', '🧳 GENERATE MIGRATION'], ['cCommuters', '🚗 GENERATE COMMUTERS']]) + '<p class="small">' + fmt(Math.round(S.city.population)) + ' citizens · ' + AG.citizens.length + ' agents · modal split ' + Object.keys(MM_MODES).map(function (k) { return MM_MODES[k][0] + pc((S.p11.modal[k] || 0) * 100); }).join(' ') + '</p>') + HUB_VIEWS.citizens(); },
  wc_co: function () { return aCard('🏦 COMPANY CONTROL', cmdRow([['aSpawnCo', '🏢 SPAWN COMPANY'], ['aBankrupt', '💥 BANKRUPT COMPANY', 'red'], ['aLoan', '🏦 GIVE A COMPANY A LOAN'], ['aContract', '🤝 CREATE TRADE CONTRACT']])) + HUB_VIEWS.finance(); },
  wc_tu: function () { return aCard('🧳 TOURISM CONTROL', cmdRow([['tBoom', '🚀 TOURISM BOOM', 'gold'], ['tAttraction', '🗽 BUILD ATTRACTION']])) + HUB_VIEWS.tourism(); },
  wc_sc: function () { return aCard('📡 SMART CITY', cmdRow([['uSensors', '📡 SENSOR GRID', 'gold']])) + HUB_VIEWS.smart(); },
  wc_dc: function () { return aCard('🔥 DISASTER CONTROL', cmdRow([['dFire', '🔥 START FIRE', 'red'], ['dFlood', '🌊 FLOOD', 'red'], ['dRisk', '⚠️ RISK MAP', '', 'all'], ['p9_tab', '🚨 Disaster Command Center', '', 'wc_disaster']]).replace('data-p11="p9_tab"', 'data-ac="p9_tab"')) + HUB_VIEWS.green(); },
  wc_cl: function () { return aCard('🌡️ CLIMATE CONTROL', cmdRow([['clWeather', '🌧️ Heavy rain', '', 'heavyrain'], ['clWeather', '🔥 Heat wave', '', 'heatwave'], ['clWeather', '❄️ Cold wave', '', 'coldwave'], ['clWeather', '☀️ Clear', '', 'clear'], ['clBarriers', '🧱 Flood barriers along the water', 'green'], ['clDrain', '🌧️ Drainage where water collects']])) + HUB_VIEWS.green(); },
  wc_td: function () { return aCard('🚢 TRADE CONTROL', cmdRow([['aContract', '🤝 CREATE TRADE CONTRACT', 'gold'], ['aRailway', '🚆 GENERATE RAILWAY']])) + HUB_VIEWS.transport3().split('<div class="grid2"><div class="card p10Card"><h3>🅿️')[0]; },
  wc_fi: function () { return aCard('💹 FINANCE CONTROL', cmdRow([['aBank', '🏦 CREATE BANK', 'gold'], ['aLoan', '💳 COMPANY LOAN'], ['aRate', '📊 SET INTEREST RATE (≥ 1%)'], ['aMaxFunds', '💰 MAX CITY FUNDS']])) + HUB_VIEWS.finance() + HUB_VIEWS.budget2(); },
  wc_wd: function () {
    const modes = Object.keys(BRUSH_MODES);
    return aCard('🗺️ WORLD CONTROL — WORLD PAINTER', '<div class="row admRowWrap">' + modes.map(function (m) { return qb('wBrush', BRUSH_MODES[m], WB.on && WB.mode === m ? 'gold' : '', m); }).join('') + '</div><div class="row admRowWrap"><span>Size</span>' + BRUSH_SIZES.map(function (s) { return qb('wSize', s, WB.size === s ? 'gold' : '', s); }).join('') + '</div><p class="small">ROAD / BUILDING / TERRAIN / WATER / TREE / ZONE / UTILITY / DEMOLISH brushes plus sidewalks, plazas and bike lanes. Building brush type: ' + esc(BUILDINGS[WB.building] ? BUILDINGS[WB.building].name : WB.building) + ' (World Brush tab).</p>') +
      aCard('🖱️ MULTI-SELECT EDITOR', '<p>' + P11.multi.size + ' building(s) selected (Ctrl+click on the map). Actions in BUILDING CONTROL: Upgrade All · Repair All · Move All · Delete All · Change Type · Assign District.</p>' + qb('p9_tab', 'Open BUILDING CONTROL', 'blue', 'wc_bc').replace('data-p11', 'data-ac')) +
      aCard('🔎 LIVE ENTITY SEARCH', '<p class="small">Type in the search box at the top (e.g. "Hospital") — every matching building, citizen, vehicle, company and district is listed; click to fly the camera there.</p>') +
      aCard('📖 CITY BOOK', '<p class="small">An automatic book about your city: history, districts, companies, population, economy, transport, technology, disasters, achievements and major projects.</p>' + qb('book', '📖 Open CITY BOOK', 'gold', 'history'));
  }
});

/* ===================================== LIVE ENTITY SEARCH ===================================== */
function p11EntitySearch(q) {
  q = q.toLowerCase().trim(); if (q.length < 2) return [];
  const out = [];
  S.buildings.list.forEach(function (b) { if (out.length >= 30) return; const d = bdef(b), nm = d.name + ' #' + b.id; if (nm.toLowerCase().indexOf(q) >= 0 || d.id.indexOf(q) >= 0 || ('#' + b.id) === q) out.push('<button class="admLi" data-p11="fly" data-v="' + b.x + ',' + b.y + ',' + b.id + '">' + d.icon + ' ' + esc(nm) + ' <span class="small">' + esc(districtName(b.x, b.y) || '') + '</span></button>'); });
  AG.vehicles.forEach(function (v) { if (out.length >= 40) return; if ((v.type + ' #' + (v.id || '')).toLowerCase().indexOf(q) >= 0) out.push('<button class="admLi" data-p11="fly" data-v="' + Math.floor(v.x / TILE) + ',' + Math.floor(v.y / TILE) + '">🚗 ' + esc(v.type) + ' #' + (v.id || '') + '</button>'); });
  return out;
}

/* ===================================== CITY BOOK ===================================== */
const BOOK_CH = [['history', '📜 History'], ['districts', '🏘️ Districts'], ['companies', '🏢 Companies'], ['population', '👥 Population'], ['economy', '💰 Economy'], ['transport', '🚇 Transport'], ['technology', '🔬 Technology'], ['disasters', '🌪️ Disasters'], ['achievements', '🏆 Achievements'], ['projects', '🏗️ Major Projects']];
function bookChapter(ch) {
  const c = S.city;
  switch (ch) {
    case 'history': return '<p>' + esc(c.name) + ' was founded in ' + (S.p9 ? S.p9.foundedYear : 2026) + '. Today is year ' + gameYear() + ' (' + calendarYear() + '), day ' + gameDay() + '.</p>' + (S.p9 ? cityHistoryHtml() + timelineHtml() : '');
    case 'districts': { const n = MAP.dN || 1; return tbl(['District', 'Density', 'Residents', 'Jobs', 'Walkability'], MAP.districts.map(function (t, k) { return [t, k]; }).filter(function (x) { return x[0].built > 0; }).sort(function (a, b) { return b[0].res - a[0].res; }).slice(0, 30).map(function (x) { const w = walkPass().cells[x[1]]; return [esc(MAP.dnames ? MAP.dnames[x[1]] || 'District ' + x[1] : 'District ' + x[1]), DENSITY_NAMES[Math.min(3, x[0].level)], fmt(Math.round(x[0].res)), fmt(x[0].jobs), w ? w.score : '—']; })) + '<p class="small">' + n * n + ' district cells, ' + weRegionStats(false).length + ' regions.</p>'; }
    case 'companies': return tbl(['Company', 'Sector', 'Sites', 'Cash', 'Stock', 'Origin'], AI_DEFS.filter(function (a) { return S.ai[a.id]; }).map(function (a) { const st = S.ai[a.id], m = S.p10 ? corpMeta(a.id) : {}; return [a.icon + ' ' + esc(a.name), a.sectors[0], st.count || 0, money(st.cash || 0), '$' + stockOf(a.id).price.toFixed(2), m.lw ? 'founded day ' + m.founded : 'established']; })) + (S.p10 ? '<div class="p10Log">' + S.p10.corpLog.slice(0, 15).map(function (e) { return '<div>' + e.icon + ' D' + e.d + ' ' + esc(e.text) + '</div>'; }).join('') + '</div>' : '');
    case 'population': { const P = S.p10 ? S.p10.pop : null; return '<p>Population ' + fmt(Math.round(c.population)) + ' (peak ' + fmt(Math.round(c.peakPop)) + '), happiness ' + Math.round(c.happiness) + '%, education ' + Math.round(c.education) + '%.</p>' + (P ? tbl(['Year', 'Population', 'Births', 'Deaths', 'In', 'Out'], P.hist.slice().reverse().map(function (h) { return [h.y, fmt(h.pop), fmt(h.births), fmt(h.deaths), fmt(h.migIn), fmt(h.migOut)]; })) + svgChart(S.p10.graphs.pop, 600, 80, '#80ed99') : ''); }
    case 'economy': { const f = financialHealth(); return '<p>GDP ' + money(cityGDP()) + ' per year · city budget ' + money(S.budget) + ' · your money ' + money(S.money) + ' · financial health ' + f.score + '/100 · reputation ' + Math.round(S.p10 ? S.p10.rep : 0) + '/1000 · economic phase ' + econPhase().id + '.</p>' + svgChart(S.p10 ? S.p10.graphs.gdp : [], 600, 80, '#ffd166'); }
    case 'transport': { const N = transportNetwork(); return tbl(['Mode', 'Size', 'Lines'], TP_MODES.map(function (m) { return [m[1] + ' ' + m[2], fmt(N[m[0]].n) + ' ' + N[m[0]].unit, N[m[0]].lines || '—']; })) + '<p>Average trip ' + Math.round(S.p11.modal.avgMin) + ' min · traffic ' + Math.round(SIM.traffic) + '%.</p>'; }
    case 'technology': return '<p>' + TECH_LIST.filter(function (t) { return hasTech(t.id); }).length + ' / ' + TECH_LIST.length + ' technologies researched.</p><p class="small">' + TECH_LIST.filter(function (t) { return hasTech(t.id); }).map(function (t) { return esc(t.name); }).join(' · ') + '</p>';
    case 'disasters': return tbl(['When', 'Disaster', 'Buildings hit', 'Cost'], (S.p9 ? S.p9.disasterLog : []).slice().reverse().map(function (d) { return ['Y' + d.year + ' D' + d.day, d.icon + ' ' + esc(d.name), d.hits, money(d.cost)]; })) + '<p class="small">Fire spread events ' + S.p11.fire.spread + ' · floods ' + S.p11.flood.events + '.</p>';
    case 'achievements': return '<p class="small">' + ACHIEVEMENTS.filter(function (a) { return S.achievements && S.achievements[a.id]; }).map(function (a) { return a.icon + ' ' + esc(a.name); }).join(' · ') + '</p>' + (S.p10 ? '<p>City goals: ' + LONG_GOALS.filter(function (g) { return S.p10.goalsDone[g.id]; }).map(function (g) { return g.icon + ' ' + g.name; }).join(' · ') + '</p>' : '');
    case 'projects': return tbl(['Project', 'Status'], S.buildings.list.filter(function (b) { const d = bdef(b); return d.megaproject || d.landmark; }).map(function (b) { return [bdef(b).icon + ' ' + esc(bdef(b).name), b.built ? 'complete' : 'under construction ' + Math.round(b.progress * 100) + '%']; }));
  }
  return '';
}
function openCityBook(ch) {
  P11.ui.bookCh = ch || P11.ui.bookCh;
  const tabs = BOOK_CH.map(function (c) { return '<button class="p10Tab' + (c[0] === P11.ui.bookCh ? ' on' : '') + '" data-p11="book" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('');
  showModal('📖 CITY BOOK — ' + esc(S.city.name), '<div class="p10Tabs">' + tabs + '<span class="p10TabsR">' + qb('bookSave', '💾 Save as HTML') + '</span></div><div class="p10Body">' + bookChapter(P11.ui.bookCh) + '</div>');
  $('modal').classList.add('p10Wide');
}
function saveCityBook() {
  const html = '<!doctype html><meta charset="utf-8"><title>' + esc(S.city.name) + ' — City Book</title><style>body{font-family:sans-serif;max-width:900px;margin:auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:3px 6px;text-align:left}</style><h1>📖 ' + esc(S.city.name) + '</h1>' + BOOK_CH.map(function (c) { return '<h2>' + c[1] + '</h2>' + bookChapter(c[0]); }).join('');
  const name = S.city.name.replace(/[^\w\- ]/g, '') + ' - City Book.html';
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('📖 City Book saved: ' + name, 'good'); } catch (e) { toast('❌ ' + e.message, 'bad'); }
}

/* ===================================== BRUSHES, MULTI-SELECT, TAP & KEYS ===================================== */
Object.assign(BRUSH_MODES, { utility: '🔌 Utility', demolish: '💣 Demolish', sidewalk: '🚶 Sidewalk / path', plaza: '🏛️ Plaza', bikelane: '🚲 Bike lane', erasepath: '🧽 Erase paths' });
function p11BrushTile(mode, x, y, i, seen) {
  switch (mode) {
    case 'demolish': { const b = buildingAtTile(x, y); if (b && !bdef(b).noDemolish && !seen.has(b.id)) { seen.add(b.id); removeBuilding(b); return 1; } if (MAP.nature[i] === 1) { MAP.nature[i] = 0; return 1; } return 0; }
    case 'utility': {
      let n = 0;
      if (S.p9 && S.p9.water.breaks.some(function (q) { return q.tile === i; })) { repairPipe(i); n++; }
      if (S.p9) { const f = S.p9.util.failures.filter(function (q) { return Math.abs(q.x - x) <= 1 && Math.abs(q.y - y) <= 1; }); if (f.length) { S.p9.util.failures = S.p9.util.failures.filter(function (q) { return f.indexOf(q) < 0; }); n++; } }
      const key = 'u' + Math.floor(x / 8) + ',' + Math.floor(y / 8);
      if (!seen.has(key)) { seen.add(key); const b = buildingAtTile(x, y); if (b && b._gridOver && placeUtilityNear('substation', x, y, !!S.p5.admin.god)) n++; }
      return n;
    }
    case 'sidewalk': case 'plaza': case 'bikelane': case 'erasepath': {
      const kind = mode === 'bikelane' ? 'bike' : mode === 'erasepath' ? 'erase' : mode;
      if (mode !== 'erasepath' && !S.p5.admin.god) { const c = pedCost(i); if (S.budget < c) return 0; if (paintPed(i, kind)) { S.budget -= c; return 1; } return 0; }
      return paintPed(i, kind) ? 1 : 0;
    }
  }
  return 0;
}
function p11TapHook(sx, sy) {
  if (!S || !S.p11) return false;
  const t = tileAtScreen(sx, sy);
  if (P11.pickWorks) { P11.pickWorks = false; const tiles = districtRoadTiles(t.x, t.y); p11Say(startRoadWorks(tiles, 'upgrade')); return true; }
  if (P11.ctrl && adminModeEnabled()) { const b = buildingAtTile(t.x, t.y); if (b) { if (P11.multi.has(b.id)) P11.multi.delete(b.id); else P11.multi.add(b.id); renderMultiPanel(); } return true; }
  return false;
}
window.addEventListener('keydown', function (e) { if (e.key === 'Control') P11.ctrl = true; if (e.key === 'Escape' && (P11.pickWorks || P11.multi.size)) { P11.pickWorks = false; P11.multi.clear(); renderMultiPanel(); } }, true);
window.addEventListener('keyup', function (e) { if (e.key === 'Control') P11.ctrl = false; }, true);
window.addEventListener('blur', function () { P11.ctrl = false; });
function renderMultiPanel() {
  let el = $('p11Multi');
  if (!el) { el = document.createElement('div'); el.id = 'p11Multi'; document.body.appendChild(el); }
  if (!P11.multi.size) { el.classList.remove('show'); return; }
  el.classList.add('show');
  el.innerHTML = '<b>🖱️ ' + P11.multi.size + ' selected</b> ' + qb('bUpgrade', '⬆ Upgrade All') + qb('bRepair', '🔧 Repair All') + qb('bMove', '⬅', '', '-1,0') + qb('bMove', '⬆', '', '0,-1') + qb('bMove', '⬇', '', '0,1') + qb('bMove', '➡', '', '1,0') + qb('bDelete', '🗑 Delete All', 'red') + '<button class="btn small" data-ac="p9_tab" data-v="wc_bc" onclick="openAdminCenter(\'wc_bc\')">Change Type / Assign District</button>' + qb('bClearSel', '✕');
}
/* Selected building panel: interior, activity, parking and upgrade buttons */
function bottomInfoExtras11(b) {
  if (!S.p11 || !b.built) return { stats: [], actions: [] };
  const I = buildingInterior(b), st = [];
  st.push('🏢 Floors <b>' + I.floors + '</b>');
  if (I.visitors) st.push('Visitors/day <b>' + fmt(I.visitors) + '</b>');
  if (I.shops) st.push('Shops <b>' + I.shops + '</b>');
  if (I.beds) st.push('Beds <b>' + I.beds + '</b>');
  st.push('🕒 Active <b>' + I.activity + '%</b>');
  if (I.parking) st.push('🅿️ <b>' + fmt(I.parking) + '</b>');
  if (b.u) { const ups = Object.keys(b.u).filter(function (k) { return b.u[k]; }).map(function (k) { return UPG_TRACKS[k][0] + b.u[k]; }); if (ups.length) st.push('Upgrades <b>' + ups.join(' ') + '</b>'); }
  return { stats: st, actions: isAI(b) ? [] : ['<button class="btn small blue" data-p11="openBld">🏢 Interior & Upgrades 2.0</button>'] };
}
document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-p11="openBld"]'); if (el) { e.stopPropagation(); e.preventDefault(); openHub('buildings3'); } }, true);

/* ===================================== MAP OVERLAYS ===================================== */
function drawP11Overlays() {
  if (!S || !S.p11) return;
  const T = TILE, P = S.p11;
  if (CAM.zoom > 0.5) {
    for (const k in P.ped) { const i = +k, x = (i % MAP.W) * T, y = ((i / MAP.W) | 0) * T, t = P.ped[k]; ctx.fillStyle = PED_TYPES[t][1]; if (t === 1) { ctx.fillRect(x, y, T, 3); ctx.fillRect(x, y + T - 3, T, 3); } else { ctx.globalAlpha = 0.85; ctx.fillRect(x + 2, y + 2, T - 4, T - 4); ctx.globalAlpha = 1; } }
    ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 2; for (const k in P.bike) { const i = +k, x = (i % MAP.W) * T, y = ((i / MAP.W) | 0) * T; ctx.beginPath(); ctx.moveTo(x + 4, y + T - 6); ctx.lineTo(x + T - 4, y + T - 6); ctx.stroke(); }
  }
  P.works.forEach(function (w) { w.tiles.forEach(function (t, i) { const x = (t % MAP.W) * T, y = ((t / MAP.W) | 0) * T; ctx.fillStyle = i % 2 ? 'rgba(255,209,102,.25)' : 'rgba(247,127,0,.45)'; ctx.fillRect(x, y, T, T); }); const t = w.tiles[0]; drawEmoji('🚧', (t % MAP.W) * T + T / 2, ((t / MAP.W) | 0) * T + T / 2, 14); });
  if (FLOOD.tiles.size) { ctx.fillStyle = 'rgba(47,127,191,.45)'; FLOOD.tiles.forEach(function (i) { ctx.fillRect((i % MAP.W) * T, ((i / MAP.W) | 0) * T, T, T); }); }
  if (P11.multi.size) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; P11.multi.forEach(function (id) { const b = MAP.byId.get(id); if (!b) return; const d = bdef(b); ctx.strokeRect(b.x * T + 1, b.y * T + 1, d.w * T - 2, d.h * T - 2); }); }
  if (UI.selected && UI.selected.type === 'sensorhub') { const b = UI.selected; ctx.strokeStyle = 'rgba(76,201,240,.8)'; ctx.setLineDash([6, 4]); ctx.strokeRect((b.x - 10) * T, (b.y - 10) * T, 21 * T, 21 * T); ctx.setLineDash([]); }
}
