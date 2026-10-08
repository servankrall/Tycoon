'use strict';
/* BLOCK CITY TYCOON — LIVING CITY UI (Part 10)
   Living City hub (J), fullscreen CITY DASHBOARD (U), WORLD OBSERVATORY (O), live graphs, Project Manager, Incident
   Center, petitions, City AI Assistant, What-If mode, Command Palette 2.0 (Ctrl+Shift+P), the Part 10 tabs of the World
   Control Center (Living World, Incident Center, Simulation Lab, What-If, Time Machine, World Factory, Megaprojects,
   Health & Education) and the extended admin search. Every button calls a real backend function. */

/* ===================================== HELPERS ===================================== */
function pb(act, label, cls, v, extra) { return '<button class="btn small ' + (cls || '') + '" data-p10="' + act + '"' + (v !== undefined ? ' data-v="' + esc(String(v)) + '"' : '') + (extra || '') + '>' + label + '</button>'; }
function cd(title, html) { return '<div class="card p10Card"><h3>' + title + '</h3>' + html + '</div>'; }
function kv(k, v, cls) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '" style="font-size:14px">' + v + '</div></div>'; }
function tbl(head, rows) { return '<div class="p10Wrap"><table class="p10T"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + head.length + '" class="small">—</td></tr>') + '</tbody></table></div>'; }
function bar(v, cls) { return pctBar(clamp(v, 0, 100), cls); }
function pc(v) { return Math.round(v) + '%'; }
function sgn(v, f) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + (f ? f(Math.abs(v)) : Math.abs(v).toFixed(1)); }
function moodCls(good) { return good ? 'pos' : 'neg'; }
function svgChart(a, w, h, color, label) {
  if (!a || a.length < 2) return '<div class="small">Collecting data… (one point every 10 s)</div>';
  let mn = Infinity, mx = -Infinity; a.forEach(function (v) { mn = Math.min(mn, v); mx = Math.max(mx, v); });
  if (mx - mn < 1e-9) { mx += 1; mn -= 1; }
  const pts = a.map(function (v, i) { return (i / (a.length - 1) * w).toFixed(1) + ',' + (h - 4 - (v - mn) / (mx - mn) * (h - 8)).toFixed(1); }).join(' ');
  return '<svg class="p10Svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="' + h + '"><polyline fill="none" stroke="' + (color || '#4cc9f0') + '" stroke-width="2" points="' + pts + '"/></svg>' + (label ? '<div class="between small"><span>min ' + label(mn) + '</span><span>max ' + label(mx) + '</span></div>' : '');
}
function p10Ready() { return !!(S && S.p10 && MAP.roads); }
function hubVisible() { return $('modalWrap').classList.contains('show') && /^🌍 LIVING CITY/.test($('modalTitle').textContent); }

/* ===================================== LIVING CITY HUB ===================================== */
const HUB_TABS = [['overview', '🌱', 'Living City'], ['news', '📰', 'News'], ['companies', '🏢', 'Companies'], ['services', '🎓', 'Education & Health'], ['tourism', '🧳', 'Tourism'], ['transport', '✈️', 'Transport & Logistics'], ['economy', '⚠️', 'Supply Shocks'], ['projects', '🏗️', 'Project Manager'], ['infra', '🛠️', 'Infrastructure'], ['incidents', '🚨', 'Incidents'], ['citizens', '🗣️', 'Opinions & Petitions'], ['goals', '🎯', 'Goals'], ['assistant', '🧠', 'AI Assistant'], ['whatif', '🔮', 'What-If'], ['auto', '🤖', 'Automation'], ['graphs', '📈', 'Live Graphs']];
function openHub(tab) {
  if (!p10Ready()) return;
  if (tab) P10.ui.tab = tab;
  showModal('🌍 LIVING CITY — ' + esc(S.city.name), hubHtml());
  $('modal').classList.add('p10Wide');
}
function hubHtml() {
  const t = P10.ui.tab, f = HUB_VIEWS[t] || HUB_VIEWS.overview;
  let body; try { body = f(); } catch (e) { body = '<p class="neg">⚠️ ' + esc(e.message) + '</p>'; if (typeof logError === 'function') logError('Hub ' + t, e); }
  return '<div class="p10Tabs">' + HUB_TABS.map(function (x) { return '<button class="p10Tab' + (x[0] === t ? ' on' : '') + '" data-p10="tab" data-v="' + x[0] + '">' + x[1] + ' ' + x[2] + '</button>'; }).join('') +
    '<span class="p10TabsR">' + pb('obs', '🛰️ Observatory') + pb('dash', '📺 Dashboard') + pb('refresh', '↻') + '</span></div><div class="p10Body">' + body + '</div>';
}
function rerender() {
  if (hubVisible()) { const b = $('modalBody'), y = b.scrollTop; b.innerHTML = hubHtml(); b.scrollTop = y; }
  if (typeof ADM !== 'undefined' && ADM.open) { const b = $('admBody'), y = b ? b.scrollTop : 0; renderAdminCenter(); if (b) $('admBody').scrollTop = y; }
  if (CDASH.open) renderDash();
}
const HUB_VIEWS = {
  overview: function () {
    const L = lifeStats(), ph = LIFE_PHASES[L.phase], P = S.p10, R = SIM.p10Rates || { births: 0, deaths: 0, migIn: 0, migOut: 0 }, day = 86400 / TIME_SCALE;
    const acts = [['work', '💼 Work'], ['school', '🎓 School'], ['shop', '🛍️ Shopping & food'], ['home', '🏠 Home'], ['leisure', '🎭 Leisure & parks']];
    const life = '<p><b>' + ph.icon + ' ' + ph.name + '</b> · ' + ph.plan + ' · ' + weekdayName() + ' ' + pad2(Math.floor(gameHour())) + ':00 · ' + fmt(L.n) + ' simulated citizens · ' + fmt(L.night) + ' on night shifts · ' + fmt(L.moving) + ' travelling</p>' +
      tbl(['Activity', 'Now', 'Typical for ' + ph.name.toLowerCase()], acts.map(function (a) { const s = L.n ? L[a[0]] / L.n * 100 : 0; return [a[1], bar(s) + ' ' + pc(s), pc(ph.expect[a[0]] * 100)]; }));
    const pop = cd('👥 Dynamic population', '<div class="grid4">' + kv('Births / day', fmt(Math.round(R.births * day)), 'pos') + kv('Deaths / day', fmt(Math.round(R.deaths * day))) + kv('Migration in / day', fmt(Math.round(R.migIn * day)), 'pos') + kv('Migration out / day', fmt(Math.round(R.migOut * day)), 'neg') + '</div>' +
      '<p class="small">Attractiveness ' + (SIM.p10Mig || 0).toFixed(2) + ' (jobs ' + pc((1 - SIM.unemployment) * 100) + ', housing price ×' + S.city.housingPrice.toFixed(2) + ', education ' + pc(S.city.education) + ', happiness ' + pc(S.city.happiness) + ', reputation ' + Math.round(P.rep) + '). ' + (P.pop.wave === 'in' ? '<b class="pos">MIGRATION IN</b>' : P.pop.wave === 'out' ? '<b class="neg">MIGRATION OUT</b>' : 'Stable migration') + '</p>' +
      tbl(['Year', 'Population', 'Births', 'Deaths', 'In', 'Out'], P.pop.hist.slice(-6).reverse().map(function (h) { return [h.y, fmt(h.pop), fmt(h.births), fmt(h.deaths), fmt(h.migIn), fmt(h.migOut)]; })));
    const rp = P.repParts || {};
    const rep = cd('⭐ City reputation ' + Math.round(P.rep) + ' / 1000 — ' + repLabel(P.rep), bar(P.rep / 10, 'gold') + tbl(['Factor', 'Score', 'Weight'], Object.keys(REP_WEIGHTS).map(function (k) { return [k[0].toUpperCase() + k.slice(1), bar(rp[k] || 0) + ' ' + Math.round(rp[k] || 0), pc(REP_WEIGHTS[k] * 100)]; })) +
      '<p class="small">High reputation brings tourists (×' + (0.85 + P.rep / 3333).toFixed(2) + '), citizens (growth ×' + (0.9 + P.rep / 5000).toFixed(2) + ') and company investment.</p>' + svgChart(P.repHist, 400, 50, '#ffd166'));
    const rk = rankingsNow();
    const rank = cd('🏆 World city ranking (live · ' + calendarYear() + ')', tbl(['Category', 'Rank', 'Score', 'Leader'], WRANK_CATS.map(function (c) { const r = rk[c[0]]; return [c[1] + ' ' + c[2], '<b class="' + (r.rank === 1 ? 'pos' : '') + '">#' + r.rank + '</b> / ' + r.of, r.score, esc(r.leader)]; })) +
      (P.rank.hist.length ? '<p class="small">Past years: ' + P.rank.hist.slice(-5).map(function (h) { return 'Y' + h.year + ' ' + WRANK_CATS.map(function (c) { return c[1] + '#' + (h.ranks[c[0]] ? h.ranks[c[0]].rank : '?'); }).join(''); }).join(' · ') + '</p>' : ''));
    const rc = regionCompetition();
    const reg = cd('🗺️ Regional competition', tbl(['Region'].concat(REGION_METRICS.map(function (m) { return m[1] + ' ' + m[2]; })), rc.regions.map(function (r) { return [r.icon + ' ' + r.name, money(r.gdp), fmt(Math.round(r.pop)), pc(r.happiness), fmt(Math.round(r.tourism)), pc(r.education), pc(r.safety), pc(r.environment)]; })) + '<p class="small">Leaders: ' + REGION_METRICS.map(function (m) { return m[1] + ' ' + esc(rc.leaders[m[0]]); }).join(' · ') + '</p>');
    const ld = landDevStats();
    const dev = cd('🏗️ Land development', '<div class="grid5">' + DEV_STAGES.map(function (s, k) { return kv(s, fmt(ld[k]) + (k === 0 ? ' tiles' : '')); }).join('') + '</div><p class="small">AUTO DEVELOPMENT ' + (P.auto.development ? '<b class="pos">ON</b>' : '<b class="neg">OFF</b>') + ' · ' + P.landDev.evolved + ' redevelopments' + (P.landDev.last ? ' · last: ' + esc(P.landDev.last) : '') + '</p>' + pb('auto', P.auto.development ? 'Turn AUTO DEVELOPMENT off' : 'Turn AUTO DEVELOPMENT on', P.auto.development ? '' : 'green', 'development'));
    const lw = P.lw;
    const log = cd('🌱 Living World — the city evolves by itself', '<div class="grid4">' + kv('Companies founded', lw.founded) + kv('Stores opened', lw.opened) + kv('Buildings closed', lw.closed) + kv('Job changes', fmt(lw.jobChanges)) + kv('Household moves', fmt(lw.moves)) + kv('New neighbourhoods', lw.neighborhoods) + kv('Hires', fmt(lw.hires)) + kv('Layoffs', fmt(lw.layoffs)) + '</div>' +
      '<div class="p10Log">' + (lw.log.length ? lw.log.slice(0, 14).map(function (e) { return '<div>' + e.icon + ' <span class="small">Y' + e.y + ' D' + e.d + '</span> ' + esc(e.text) + '</div>'; }).join('') : '<p class="small">Events appear here as the city lives.</p>') + '</div>');
    return cd('🕒 City life cycle', life) + '<div class="grid2">' + pop + rep + '</div><div class="grid2">' + rank + log + '</div>' + reg + dev;
  },
  news: function () {
    const P = S.p10;
    const fx = P.fx.filter(function (f) { return f.until > S.clock.runSec; });
    return cd('📰 City News — headlines from real city data', (fx.length ? '<p class="small"><b>Active effects:</b> ' + fx.map(function (f) { return f.k === 'stock' ? '📈 ' + esc((aiDef(f.id) || { name: f.id }).name) + ' ' + sgn(f.v * 100, function (v) { return v.toFixed(0) + '%'; }) : (NEWS_FX_NAMES[f.k] || f.k) + ' ' + sgn(f.v * 100, function (v) { return v.toFixed(1) + '%'; }); }).join(' · ') + '</p>' : '') +
      (P.news.length ? P.news.map(function (n) {
        const eff = (n.fx || []).map(function (f) { return (NEWS_FX_NAMES[f.k] || f.k) + ' ' + sgn(f.v * 100, function (v) { return v.toFixed(1) + '%'; }); });
        if (n.stock && n.stock.pct) eff.push('📈 stock ' + sgn(n.stock.pct * 100, function (v) { return v.toFixed(0) + '%'; }));
        const m = n.measured ? 'Measured effect: jobs ' + sgn(n.measured.jobs, fmt) + ', traffic ' + sgn(n.measured.traffic) + '%, pollution ' + sgn(n.measured.pollution) + '%, production ' + sgn(n.measured.prod) + '%' : n.pre ? 'Measuring the real effect…' : '';
        return '<div class="p10News"><div class="between"><b>' + n.icon + ' ' + esc(n.title) + '</b><span class="small">Y' + n.y + ' D' + n.d + ' ' + pad2(n.h) + ':00</span></div><div class="small">' + esc(n.text) + '</div>' + (eff.length ? '<div class="small pos">' + eff.join(' · ') + '</div>' : '') + (m ? '<div class="small">' + m + '</div>' : '') + '</div>';
      }).join('') : '<p class="small">No news yet — headlines are written as things happen.</p>'));
  },
  companies: function () {
    const secs = ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'];
    const comp = secs.map(function (s) {
      const rows = AI_DEFS.filter(function (a) { return a.sectors[0] === s && S.ai[a.id] && !S.ai[a.id].acquired; }).map(function (a) {
        const st = S.ai[a.id], t = ownerTraits(a.id, s), m = corpMeta(a.id);
        return [a.icon + ' ' + esc(a.name), 'x' + t.p.toFixed(2), st.quality.toFixed(2), (st.count || 0) + ' sites', st.adUntil > S.clock.runSec ? '📣 on' : '—', Math.round(st.rep), pc(companyShare(a.id) * 100), esc(m.strategy)];
      });
      const ps = SIM.share && SIM.share[s] ? SIM.share[s].player || 0 : 0;
      if (ps > 0) rows.push(['🧑 You', 'x' + (S.market.price[s] || 1).toFixed(2), '—', '—', S.market.ads[s] > S.clock.runSec ? '📣 on' : '—', Math.round(S.market.rep), pc(ps * 100), '—']);
      return '<h4>' + s + '</h4>' + tbl(['Company', 'Price', 'Quality', 'Location', 'Marketing', 'Reputation', 'Share', 'AI strategy'], rows);
    }).join('');
    const stocks = AI_DEFS.filter(function (a) { return S.ai[a.id] && !S.ai[a.id].acquired; }).map(function (a) {
      const f = stockFactors(a.id), s = stockOf(a.id), h = s.hist || [], ch = h.length > 12 ? (s.price / h[h.length - 12] - 1) * 100 : 0;
      return [a.icon + ' ' + esc(a.name), '$' + f.price.toFixed(2) + ' <span class="' + moodCls(ch >= 0) + '">' + sgn(ch, function (v) { return v.toFixed(1) + '%'; }) + '</span>', '$' + f.fair.toFixed(2), money(f.rev) + '/s', '<span class="' + moodCls(f.profit >= 0) + '">' + money(f.profit) + '/s</span>', sgn(f.growth * 100, function (v) { return v.toFixed(0) + '%'; }), money(f.debt), Math.round(f.rep), pc(f.share * 100), fmt(s.qty), pb('buy', 'Buy 100', 'green', a.id) + pb('sell', 'Sell 100', '', a.id)];
    });
    const brands = AI_DEFS.filter(function (a) { return S.ai[a.id]; }).map(function (a) { const m = corpMeta(a.id); return [a.icon + ' ' + esc(a.name), esc(m.base || a.name), BRAND_SUFFIX[m.stage].trim() || 'Company', m.lw ? '🌱 founded day ' + m.founded : 'established', m.products, esc(m.last || '—')]; });
    return cd('⚔️ Competition (price · quality · location · marketing · reputation)', comp) +
      cd('📈 Stock Market 2.0 — value from revenue, profit, growth, debt, reputation & market share + news', tbl(['Company', 'Price', 'Fair value', 'Revenue', 'Profit', 'Growth', 'Debt', 'Rep', 'Share', 'You own', 'Trade'], stocks)) +
      cd('🏷️ Dynamic brands & Company AI 2.0', tbl(['Brand', 'Base', 'Stage', 'Origin', 'Products', 'Last decision'], brands) + '<div class="p10Log">' + S.p10.corpLog.slice(0, 12).map(function (e) { return '<div>' + e.icon + ' <span class="small">D' + e.d + '</span> ' + esc(e.text) + '</div>'; }).join('') + '</div>');
  },
  services: function () {
    const E = SV.edu || educationPass(), R = SV.research || { perDay: {} }, H = SV.health || healthPass(0), P = S.p10;
    const edu = cd('🎓 Education pipeline: education → skill → job quality → income → economy', tbl(['Level', 'Seats', 'Students', 'Coverage', 'Workforce'], [1, 2, 3, 4].map(function (k) { return [EDU_STAGES[k], fmt(Math.round(E.seats[k] + (k === 4 ? E.seats[5] : 0))), fmt(Math.round(E.dem[k])), bar(E.cov[k] * 100) + ' ' + pc(E.cov[k] * 100), pc(P.edu.dist[k] * 100)]; })) +
      '<p class="small">No school: ' + pc(P.edu.dist[0] * 100) + ' · average level ' + E.avg.toFixed(2) + ' · skilled-job fit ' + pc(E.fit * 100) + ' (' + fmt(Math.round(E.skilledSupply)) + ' skilled workers for ' + fmt(E.skillJobs) + ' skilled jobs) · worker skill ' + Math.round(S.city.skill) + ' · education ' + pc(S.city.education) + ' · graduates ' + fmt(P.edu.graduates) + '</p>' +
      '<p class="small">Build: ' + ['school', 'highschool', 'college', 'university', 'research'].map(function (id) { return pb('build', BUILDINGS[id].icon + ' ' + BUILDINGS[id].name, '', id); }).join(' ') + '</p>');
    const res = cd('🔬 University research (per day)', tbl(['Field', 'Output / day', 'Points', 'Level', 'Effect'], RESEARCH_FIELDS.map(function (f) { return [f[1] + ' ' + f[2], '+' + Math.round(R.perDay[f[0]] || 0), fmt(Math.round(P.research[f[0]])), researchLevel(f[0]), '<span class="small">' + f[3] + '</span>']; })) + '<p class="small">Research Centers add ' + (R.rcRp * 1).toFixed(2) + ' RP/s to the tech tree (' + fmt(Math.round(P.research.rpGiven)) + ' RP so far).</p>');
    const hl = cd('🏥 Hospital system' + (H.load > 1 ? ' — <span class="neg">HEALTHCARE OVERLOAD</span>' : ''), '<div class="grid4">' + kv('Patients', fmt(Math.round(H.patients))) + kv('Effective beds', fmt(Math.round(H.beds))) + kv('Load', pc(H.load * 100), H.load > 1 ? 'neg' : 'pos') + kv('Waiting time', Math.round(H.wait) + ' min') + kv('Access', pc(H.access * 100)) + kv('Emergency beds', fmt(Math.round(H.er))) + kv('Staff', fmt(Math.round(H.staff)) + '/' + fmt(H.staffNeed)) + kv('Treatment eff.', pc(H.treat * 100)) + '</div>' +
      tbl(['Facility', 'Beds', 'ER beds', 'Staff', 'Efficiency'], H.list.slice(0, 12).map(function (h) { return [h.icon + ' ' + esc(h.name), h.beds, h.er, h.staff + '/' + h.staffNeed, pc(h.eff * 100)]; })) +
      '<p class="small">🚑 Emergency route citizen → ambulance → hospital: ' + fmt(P.health.ambulance) + ' calls, ' + fmt(P.health.treated) + ' treated, average response ' + (P.health.respN ? Math.round(P.health.respSum / P.health.respN) : 0) + ' min.</p>' +
      tbl(['Day', 'From', 'To', 'Response'], P.health.log.slice(0, 6).map(function (l) { return ['D' + l.d + ' ' + pad2(l.h) + ':00', esc(l.from), esc(l.to), l.resp + ' min']; })) +
      '<p class="small">Build: ' + ['clinic', 'hospital', 'medicalcenter', 'unihospital'].map(function (id) { return pb('build', BUILDINGS[id].icon + ' ' + BUILDINGS[id].name, '', id); }).join(' ') + '</p>');
    return edu + '<div class="grid2">' + res + hl + '</div>';
  },
  tourism: function () {
    const T = tourismBreakdown(S.city.tourists), src = T.src || {}, cap = src.cap || tourismCapacities();
    const rows = [['🚗 Road', src.road, cap.road], ['🚆 Rail', src.rail, cap.rail], ['✈️ Airport', src.air, cap.air], ['🛳️ Sea & cruise ships', src.sea, cap.sea], ['🏙️ Neighbouring cities', src.neighbors, '—']].map(function (r) { return [r[0], fmt(Math.round(r[1] || 0)), typeof r[2] === 'number' ? fmt(Math.round(r[2])) : r[2]]; });
    const att = attractionList();
    return '<div class="grid2">' + cd('🧳 Tourism 2.0 — ' + fmt(Math.round(S.city.tourists)) + ' tourists', tbl(['Arrive by', 'Tourists', 'Capacity'], rows) + '<p class="small">Demand ' + fmt(Math.round(src.demand || 0)) + ', lost for lack of transport ' + fmt(Math.round(src.lost || 0)) + ' · reputation ×' + (0.85 + S.p10.rep / 3333).toFixed(2) + '</p>') +
      cd('💳 Tourist spending /s', tbl(['Category', 'Spending'], [['🏨 Hotels', money(T.hotels)], ['🍽️ Restaurants', money(T.restaurants)], ['🛍️ Shopping', money(T.shopping)], ['🎢 Attractions', money(T.attractions)], ['🎭 Entertainment', money(T.entertainment)], ['🏛️ Tourist tax', money(T.tax)]])) + '</div>' +
      cd('🗽 Attractions — tourism value', tbl(['Attraction', 'Type', 'Tourism value', 'Status'], att.slice(0, 20).map(function (a) { return [a.icon + ' ' + esc(a.name), a.kind, fmt(a.value), a.op ? '<span class="pos">open</span>' : '<span class="neg">closed</span>']; })) + '<p class="small">Build: ' + ['monument', 'museum', 'stadium', 'themepark', 'aquarium', 'obstower', 'convention', 'beachresort', 'historic', 'hotel'].map(function (id) { return pb('build', BUILDINGS[id].icon + ' ' + BUILDINGS[id].name, '', id); }).join(' ') + '</p>');
  },
  transport: function () {
    const A = SV.air || airportPass(0), Pt = SV.port || portPass(0), R = SV.rail || railPass(0), L = SV.logi || logisticsPass();
    const air = cd('✈️ Airport — logistics hub' + (A.load > 1 ? ' <span class="neg">· AIRPORT CONGESTION</span>' : ''), A.op ? '<div class="grid4">' + kv('Passengers / day', fmt(Math.round(A.served))) + kv('Capacity', fmt(A.cap)) + kv('Load', pc(A.load * 100), A.load > 1 ? 'neg' : 'pos') + kv('Flights / day', fmt(Math.round(A.flights))) + kv('Cargo t/day', fmt(Math.round(A.cargo)) + ' / ' + fmt(Math.round(A.cargoCap))) + kv('Terminals', A.terminals) + kv('Jobs', fmt(Math.round(A.jobs))) + kv('Delays', Math.round(A.delay) + ' min') + '</div><p class="small">Tourists by air: ' + fmt(Math.round(A.tourists)) + ' · total ' + fmt(Math.round(S.p10.air.paxTot)) + ' passengers, ' + fmt(Math.round(S.p10.air.flightsTot)) + ' flights.</p>' + pb('terminal', '🛫 BUILD NEW TERMINAL (' + money(buildCost(BUILDINGS.airportterminal)) + ')', 'gold') : '<p class="small">No operating airport. The International Airport (Aviation research) turns the city into a logistics hub.</p>' + pb('build', '✈️ International Airport', '', 'airport'));
    const port = cd('⚓ Port' + (Pt.load > 1 ? ' <span class="neg">· congested</span>' : ''), Pt.ports ? '<div class="grid4">' + kv('TEU / day', fmt(Math.round(Pt.handled)) + ' / ' + fmt(Math.round(Pt.cap))) + kv('Imports TEU', fmt(Math.round(Pt.imp))) + kv('Exports TEU', fmt(Math.round(Pt.exp))) + kv('Ships / day', Pt.ships.toFixed(1)) + kv('Container terminals', Pt.terminals) + kv('Load', pc(Pt.load * 100), Pt.load > 1 ? 'neg' : 'pos') + kv('Cruise tourists', fmt(Math.round(Pt.cruise))) + kv('TEU handled', fmt(Math.round(S.p10.port.teuTot))) + '</div>' + pb('build', '🏗️ Container Terminal', '', 'containerterminal') + pb('build', '🛳️ Cruise Terminal', '', 'cruiseterminal') : '<p class="small">' + (Pt.coastal ? 'Coastal city — build a Port (city level 20) to trade by ship.' : 'Inland city — no sea access for a port.') + '</p>');
    const rail = cd('🚆 Railway logistics', '<p class="small">' + R.stations + ' station(s), ' + R.hubs + ' Rail Hub(s) · freight ' + fmt(Math.round(R.carried)) + ' / ' + fmt(Math.round(R.demand)) + ' t/day (capacity ' + fmt(Math.round(R.cap)) + ') · rail share ' + pc(R.share * 100) + ' — fewer trucks on the roads, cheaper logistics.</p>' + tbl(['Cargo', 'Demand t/day', 'By train'], R.rows.map(function (r) { return [r.icon + ' ' + r.name, fmt(Math.round(r.demand)), fmt(Math.round(r.carried))]; })) + pb('build', '🚉 Rail Hub', '', 'railhub') + pb('build', '🚆 Train Station', '', 'trainstation'));
    const logi = cd('🚚 Logistics network — efficiency ' + pc(L.eff * 100) + (L.bottleneck ? ' · bottleneck: <span class="neg">' + esc(L.bottleneck) + '</span>' : ''), tbl(['Stage', 'Count', 'Capacity', 'Flow', 'Utilisation', 'Distance', 'Delay', 'Traffic', 'Fuel'], L.stages.map(function (s) { return [s.icon + ' ' + s.name, fmt(s.n), fmt(Math.round(s.cap)), fmt(Math.round(s.flow)), '<span class="' + (s.over ? 'neg' : '') + '">' + pc(s.util * 100) + '</span>', s.dist ? s.dist.toFixed(1) + ' tiles' : '—', s.delay ? s.delay.toFixed(1) + ' h' : '—', pc(s.traffic), pc(s.fuel * 100)]; })) + '<p class="small">Total delivery time ' + L.delayH.toFixed(1) + ' h · ' + L.dcs + ' distribution center(s).</p>' + pb('build', '🚛 Distribution Center', '', 'distcenter') + pb('build', '📦 Warehouse', '', 'warehouse'));
    return '<div class="grid2">' + air + port + '</div><div class="grid2">' + rail + logi + '</div>';
  },
  economy: function () {
    const P = S.p10;
    const act = P.shocks.length ? P.shocks.map(function (s) {
      const D = SHOCK_DEFS[s.type], p = D.product;
      return cd(D.icon + ' ' + D.name + ' — severity ' + pc(s.sev * 100), '<p>' + PRODUCTS[p].name + ' price ×' + shockPriceMult(p).toFixed(2) + ' (market $' + S.economy.prices[p].toFixed(2) + ') · construction cost ×' + shockBuildMult().toFixed(2) + ' · domestic supply ' + pc(domesticRatio(p) * 100) + '</p>' +
        '<div class="row admRowWrap">' + pb('shock', '🏭 Domestic production' + (s.resp.domestic ? ' ✓' : ''), s.resp.domestic ? 'green' : '', s.id + ':domestic') + pb('shock', '🚢 Imports' + (s.resp.import ? ' ✓' : ''), s.resp.import ? 'green' : '', s.id + ':import') + pb('shock', '🏗️ New factory (' + (s.resp.factory || 0) + ')', '', s.id + ':factory') + pb('shock', '🔁 Alternative source' + (s.resp.alt ? ' ✓' : ''), s.resp.alt ? 'green' : '', s.id + ':alt') + '</div>');
    }).join('') : cd('✅ No supply shock', '<p class="small">Supply shocks start when a product the city needs runs short on the world market (more likely when you depend on imports). Prices rise for the product, the products made from it and construction.</p>');
    const prices = tbl(['Product', 'Price', 'Base', 'Domestic supply'], PRODUCT_IDS.map(function (p) { return [PRODUCTS[p].icon + ' ' + PRODUCTS[p].name, '$' + S.economy.prices[p].toFixed(2), '$' + PRODUCTS[p].base.toFixed(2), pc(domesticRatio(p) * 100)]; }));
    return act + '<div class="grid2">' + cd('🌍 Market prices', prices) + cd('📜 Past shocks', tbl(['When', 'Shock', 'Duration', 'Responses'], P.shockLog.map(function (l) { return ['Y' + l.y + ' D' + l.d, l.icon + ' ' + l.name, l.days + ' d', esc(l.resp)]; }))) + '</div>';
  },
  projects: function () {
    const P = S.p10;
    const act = P.projects.map(function (q) {
      const d = BUILDINGS[q.type], M = MEGA_DEFS[q.type];
      const mats = Object.keys(q.mats).map(function (k) { const m = q.mats[k]; return k + ' ' + fmt(Math.round(m.used)) + '/' + fmt(m.need); }).join(' · ');
      return cd(d.icon + ' ' + d.name + ' — ' + MEGA_MILESTONES[q.stage][0] + ' (' + pc(q.progress * 100) + ')', bar(q.progress * 100, 'gold') +
        '<div class="p10Miles">' + MEGA_MILESTONES.map(function (m, k) { return '<span class="' + (q.stage >= k ? 'on' : '') + '">' + m[1] + '% ' + m[0] + '</span>'; }).join('') + '</div>' +
        '<div class="grid4">' + kv('Cost', money(q.spent) + ' / ' + money(q.cost)) + kv('Workers', fmt(q.crew) + ' / ' + fmt(q.need)) + kv('Expected completion', projectEta(q)) + kv('Status', esc(q.status)) + '</div><p class="small">Materials: ' + mats + ' · paid by ' + (q.payer === 'player' ? 'your company' : 'the city budget') + ' · ' + M.days + ' days planned</p>' +
        pb('projPause', q.paused ? '▶ Resume' : '⏸ Pause', '', q.id) + pb('projFly', '🎯 Show on map', '', q.id) + pb('projCancel', '🛑 Cancel (50% refund)', 'red', q.id));
    }).join('');
    const avail = Object.keys(MEGA_DEFS).map(function (t) {
      const d = BUILDINGS[t], M = MEGA_DEFS[t], u = megaUnlocked(t), busy = P.projects.some(function (q) { return q.type === t; });
      return [d.icon + ' ' + d.name, money(megaCost(t)), M.days + ' d', fmt(M.workers), Object.keys(M.mats).map(function (k) { return fmt(M.mats[k]) + ' ' + k; }).join(', '), busy ? 'under construction' : u.ok ? pb('projStart', 'START (best site)', 'gold', t) + pb('projPick', 'PICK SITE', '', t) : '<span class="small">' + esc(u.reason) + '</span>'];
    });
    return cd('🏗️ PROJECT MANAGER', act || '<p class="small">No megaproject under construction.</p>') + cd('🌆 Megaprojects', tbl(['Project', 'Cost', 'Time', 'Workers', 'Materials', ''], avail) + '<p class="small">Steel comes from metal stock, concrete and glass from construction materials — missing material is bought on the market (supply shocks raise the price). Workers come from the unemployed and commuters. Visual stages: 0% Planning → 25% Foundation → 50% Structure → 75% Exterior → 100% Complete.</p>');
  },
  infra: function () {
    const P = S.p10, A = infraAssets();
    const budgets = MAINT_CATS.map(function (c) { const v = P.maint[c[0]]; return [c[1] + ' ' + c[2], bar(v * 50) + ' ' + pc(v * 100), pb('maint', '−10%', '', c[0] + ':-0.1') + pb('maint', '+10%', '', c[0] + ':0.1'), '<span class="small">' + (v < 0.8 ? '<span class="neg">failures more likely</span>' : v > 1.2 ? 'slower aging, higher cost' : 'recommended') + '</span>']; });
    return cd('💰 Maintenance budgets', tbl(['Network', 'Budget', '', 'Effect'], budgets) + '<p class="small">Budgets change maintenance costs and how fast assets age. Failures so far: ' + P.infraStats.failures + ' · repairs ' + P.infraStats.repairs + ' · upgrades ' + P.infraStats.upgrades + ' · replaced ' + P.infraStats.replaced + '</p>') +
      cd('🌉 Infrastructure aging — worst assets', tbl(['Asset', 'Network', 'Age', 'Condition', 'Grade', 'Actions'], A.slice(0, 25).map(function (a) { return [a.icon + ' ' + esc(a.name), a.cat, a.age + ' d', bar(a.cond, a.cond < 40 ? 'red' : '') + ' ' + pc(a.cond), '★'.repeat(a.grade) || '—', pb('infra', '🛠️ ' + money(a.value * 0.2), '', a.key + ':repair') + pb('infra', '⬆️ ' + money(a.value * 0.45), '', a.key + ':upgrade') + pb('infra', '🔄 ' + money(a.value * 0.7), '', a.key + ':replace')]; })));
  },
  incidents: function () { return incidentCenterHtml(false); },
  citizens: function () {
    const ops = citizenOpinions(), P = S.p10;
    const o = ops.length ? ops.map(function (x) { return '<div class="p10Op ' + (x.mood > 0 ? 'pos' : x.mood < 0 ? 'neg' : '') + '">' + (x.mood > 0 ? '😊' : x.mood < 0 ? '😠' : '😐') + ' “' + esc(x.text) + '” <span class="small">— ' + fmt(x.n) + ' citizens (' + pc(x.share * 100) + ')</span></div>'; }).join('') : '<p class="small">Citizens have no strong opinions right now.</p>';
    const pets = P.petitions.slice().reverse().map(function (x) { const D = PETITION_DEFS[x.type]; return [D.icon + ' ' + esc(x.title), '<span class="small">' + esc(x.why) + '</span>', fmt(x.sig), money(x.cost), x.status === 'open' ? pb('petAccept', 'ACCEPT', 'green', x.id) + pb('petIgnore', 'IGNORE', 'red', x.id) + ' <span class="small">' + fmtGameDuration((x.deadline - S.clock.runSec) * TIME_SCALE) + ' left</span>' : esc(x.status)]; });
    return cd('🗣️ Citizen opinions (from real city data)', o) + cd('✍️ Citizen petitions', tbl(['Petition', 'Why', 'Signatures', 'Cost', 'Decision'], pets) + '<p class="small">Accepted ' + P.petStats.accepted + ' · ignored ' + P.petStats.ignored + '. Accepting builds it for real (city budget) and raises reputation; ignoring lowers reputation and growth.</p>');
  },
  goals: function () {
    const P = S.p10;
    const lg = LONG_GOALS.map(function (g) { const v = g.val(), done = P.goalsDone[g.id]; const p = g.inv ? (v <= g.target ? 100 : 100 / v) : v / g.target * 100; return [g.icon + ' ' + g.name, done ? '<span class="pos">✓ day ' + done + '</span>' : bar(p) + ' ' + pc(Math.min(100, p)), money(g.reward)]; });
    const ob = P.objectives.slice().reverse().map(function (o) { const D = OBJ_DEFS[o.kind]; return [D.icon + ' ' + esc(o.title), o.status === 'active' ? bar(objectiveProgress(o) * 100) + ' ' + pc(objectiveProgress(o) * 100) : '<span class="' + (o.status === 'completed' ? 'pos' : 'neg') + '">' + o.status + '</span>', o.status === 'active' ? fmtGameDuration(Math.max(0, o.deadline - S.clock.runSec) * TIME_SCALE) : '—', money(o.reward)]; });
    return cd('🎯 Long-term city goals', tbl(['Goal', 'Progress', 'Reward'], lg)) + cd('🧭 Dynamic objectives (generated from the city\'s situation)', tbl(['Objective', 'Progress', 'Time left', 'Reward'], ob) + '<p class="small">Completed ' + P.objStats.done + ' · failed ' + P.objStats.failed + '</p>');
  },
  assistant: function () {
    const pr = assistantProblems();
    if (!pr.length) return cd('🧠 City AI Assistant', '<p class="pos">No major problem detected. The city runs well.</p>');
    return pr.slice(0, 6).map(function (p, i) {
      return cd(p.icon + ' PROBLEM: ' + esc(p.problem), '<p><b>CAUSE:</b> ' + esc(p.cause) + '</p><b>OPTIONS:</b>' + p.options.map(function (o, k) {
        const D = WHATIF_DEFS[o], W = LAB.whatif && LAB.whatif.id === o ? LAB.whatif : null;
        const cost = whatIfQuickCost(o);
        return '<div class="p10Opt"><b>' + String.fromCharCode(65 + k) + ') ' + D.icon + ' ' + D.name + '</b> — cost ' + money(cost) + ' <span class="small">' + D.desc + '</span><br>' + pb('wiRun', '🔮 Compute expected result', '', o) + (W ? whatIfResultHtml(W, true) : '') + '</div>';
      }).join(''));
    }).join('');
  },
  whatif: function () { return whatIfHtml(); },
  auto: function () {
    const P = S.p10;
    return cd('🤖 Smart automation', tbl(['System', 'State', 'What it does', 'Actions'], AUTO_DEFS.map(function (a) { return [a[1] + ' ' + a[2], pb('auto', P.auto[a[0]] ? 'ON' : 'OFF', P.auto[a[0]] ? 'green' : '', a[0]), '<span class="small">' + a[3] + '</span>', P.autoStats[a[0]] || 0]; })) + '<p class="small">Automation pays from the city budget: ' + money(P.autoStats.spent) + ' spent so far.</p>' +
      '<div class="p10Log">' + P.lw.log.filter(function (e) { return /^AUTO/.test(e.text); }).slice(0, 10).map(function (e) { return '<div>' + e.icon + ' D' + e.d + ' ' + esc(e.text) + '</div>'; }).join('') + '</div>');
  },
  graphs: function () {
    const G = S.p10.graphs, sel = P10.ui.graph;
    const tabs = GRAPH_DEFS.map(function (g) { return pb('graph', g[1] + ' ' + g[2], g[0] === sel ? 'gold' : '', g[0]); }).join('');
    const g = GRAPH_DEFS.find(function (x) { return x[0] === sel; }) || GRAPH_DEFS[0], a = G[g[0]] || [];
    const grid = GRAPH_DEFS.map(function (x) { const arr = G[x[0]] || []; return '<div class="p10Mini" data-p10="graph" data-v="' + x[0] + '"><div class="small">' + x[1] + ' ' + x[2] + ' <b>' + (arr.length ? x[4](arr[arr.length - 1]) : '—') + '</b></div>' + svgChart(arr, 200, 36, '#80ed99') + '</div>'; }).join('');
    return cd('📈 Live graphs', '<div class="row admRowWrap">' + tabs + '</div><h4>' + g[1] + ' ' + g[2] + ' — ' + (a.length ? g[4](a[a.length - 1]) : '—') + '</h4>' + svgChart(a, 760, 200, '#4cc9f0', g[4]) + '<p class="small">' + a.length + ' samples (every 10 simulated seconds' + (G.t.length ? ', day ' + Math.floor(G.t[0]) + ' → ' + Math.floor(G.t[G.t.length - 1]) : '') + ')</p>') + cd('All graphs', '<div class="p10MiniGrid">' + grid + '</div>');
  }
};
function whatIfQuickCost(id) { try { return Math.round(whatIfCost(id, whatIfSites(id), id === 'highway' ? highwayCorridor() : [])); } catch (e) { return 0; } }
function whatIfResultHtml(W, short) {
  if (W.error) return '<p class="neg">' + esc(W.error) + '</p>';
  const keyRows = W.rows.filter(function (r) { return !short || Math.abs(r.pct) >= 0.5 || Math.abs(r.delta) >= 0.5; });
  return '<div class="p10WI"><b>EXPECTED RESULT</b> <span class="small">(engine run on a copy of the world, ' + Math.round(W.ms) + ' ms; nothing has changed yet)</span>' +
    tbl(['Metric', 'Without', 'With', 'Change'], keyRows.map(function (r) { const good = r.lowerBetter ? r.delta < 0 : r.delta > 0; const f = r.id === 'gdp' || r.id === 'budget' ? money : function (v) { return Math.abs(v) >= 100 ? fmt(Math.round(v)) : v.toFixed(1); }; return [r.icon + ' ' + r.name, f(r.base), f(r.exp), Math.abs(r.delta) < 1e-6 ? '—' : '<b class="' + moodCls(good) + '">' + sgn(r.pct, function (v) { return v.toFixed(1) + '%'; }) + '</b>']; })) +
    (W.cost !== undefined ? '<p>Cost <b>' + money(W.cost) + '</b> · ' + (W.sites && W.sites.length ? W.sites.length + ' site(s)' : W.tiles && W.tiles.length ? W.tiles.length + ' road tiles' : 'policy') + '</p>' + pb('wiApply', '✅ APPLY', 'green') + pb('wiDiscard', '🗑️ DISCARD', 'red') : '') + '</div>';
}
function whatIfHtml() {
  const list = Object.keys(WHATIF_DEFS).map(function (k) { const D = WHATIF_DEFS[k]; return pb('wiRun', D.icon + ' ' + D.name, LAB.whatif && LAB.whatif.id === k ? 'gold' : '', k); }).join('');
  return cd('🔮 WHAT-IF mode — test a decision without changing the world', '<div class="row admRowWrap">' + list + '</div>' + (LAB.whatif ? '<h4>' + WHATIF_DEFS[LAB.whatif.id].icon + ' ' + WHATIF_DEFS[LAB.whatif.id].name + '</h4>' + whatIfResultHtml(LAB.whatif, false) : '<p class="small">Pick a scenario. The real economy engine simulates 2.4 game hours twice — without and with the change — on a copy of the city. APPLY builds it for real (city budget); DISCARD forgets it.</p>'));
}
function incidentCenterHtml(admin) {
  const I = S.p10.incidents, st = I.stats;
  const act = I.active.map(function (x) { const age = Math.round((S.clock.runSec - x.start) * TIME_SCALE / 60); return [x.icon + ' ' + esc(x.name), esc(x.district), '<span class="small">' + esc(x.cause) + '</span>', esc(x.status) + (x.unit ? ' · ' + esc(x.unit) : ''), age + ' min', (x.status === 'waiting' ? pb('incDispatch', '🚨 DISPATCH', 'gold', x.id) : '') + (x.tile >= 0 ? pb('incFly', '🎯', '', x.id) : '') + (admin ? pb('incResolve', '✓ Resolve', 'green', x.id) : '')]; });
  const res = I.resolved.slice(0, 12).map(function (x) { return [x.icon + ' ' + esc(x.name), esc(x.district), x.resp ? Math.round(x.resp) + ' min' : '—', esc(x.status)]; });
  const em = AG.vehicles.filter(function (v) { return v.siren || v.emKind; }).length;
  return cd('🚨 INCIDENT CENTER', '<div class="grid4">' + kv('Active', I.active.length, I.active.length ? 'neg' : 'pos') + kv('Total incidents', st.total) + kv('Avg response', st.respN ? Math.round(st.respSum / st.respN) + ' min' : '—') + kv('Emergency vehicles', em) + '</div><p class="small">AUTO EMERGENCY ' + (S.p10.auto.emergency ? '<b class="pos">ON</b> — units are dispatched automatically' : '<b class="neg">OFF</b> — press DISPATCH') + ' ' + pb('auto', 'Toggle', '', 'emergency') + '</p>' +
    tbl(['Incident', 'District', 'Cause', 'Status', 'Age', ''], act) + (admin ? '<div class="row admRowWrap">' + Object.keys(INC_DEFS).map(function (k) { return pb('incSpawn', INC_DEFS[k].icon + ' ' + INC_DEFS[k].name, '', k); }).join('') + pb('incResolveAll', '✓ Resolve all', 'green') + '</div>' : '')) +
    cd('✅ Resolved', tbl(['Incident', 'District', 'Response time', 'Outcome'], res));
}

/* ===================================== ACTIONS ===================================== */
function p10Do(a, v, el) {
  if (!p10Ready()) return;
  const n = Number(v), say = function (r) { if (!r) return; if (r.ok === false) toast('❌ ' + r.reason, 'bad'); else toast('✅ ' + (r.msg || r), 'good'); };
  const adminOnly = function () { if (!adminModeEnabled()) { promptEnableAdmin('wc_living'); return true; } return false; };
  switch (a) {
    case 'tab': P10.ui.tab = v; sfx('click'); if (CDASH.open) toggleDash(false); if (!hubVisible()) { if (ADM.open) closeAdminCenter(); openHub(v); return; } break;
    case 'refresh': break;
    case 'obs': closeModal(); if (CDASH.open) toggleDash(false); if (ADM.open) closeAdminCenter(); openObservatory(); return;
    case 'dash': closeModal(); toggleDash(true); return;
    case 'auto': S.p10.auto[v] = !S.p10.auto[v]; toast('🤖 ' + (AUTO_DEFS.find(function (x) { return x[0] === v; }) || [0, '', v])[2] + ': ' + (S.p10.auto[v] ? 'ON' : 'OFF'), S.p10.auto[v] ? 'good' : ''); break;
    case 'build': { const d = BUILDINGS[v]; if (!d) return; closeModal(); if (ADM.open) closeAdminCenter(); startPlacing(d); return; }
    case 'buy': tradeAIShares(v, 100); break;
    case 'sell': tradeAIShares(v, -100); break;
    case 'terminal': { const r = buildAirportTerminal('player'); say(r.ok ? { msg: 'Airport terminal under construction (' + money(r.cost) + ')' } : r); break; }
    case 'shock': { const p = String(v).split(':'); say(shockRespond(p[0], p[1])); break; }
    case 'projStart': say(startMegaProject(v, null, { admin: ADM.open && adminModeEnabled() })); break;
    case 'projPick': P10.pickMega = v; closeModal(); if (ADM.open) closeAdminCenter(); toast('🎯 Click the map where the ' + BUILDINGS[v].name + ' (' + BUILDINGS[v].w + '×' + BUILDINGS[v].h + ') should go — Esc cancels', ''); return;
    case 'projPause': { const q = S.p10.projects.find(function (x) { return x.id === n; }); if (q) { q.paused = !q.paused; q.status = q.paused ? 'paused' : 'active'; } break; }
    case 'projCancel': confirmDialog('🛑 Cancel megaproject?', '50% of the money spent is recovered; the site is cleared.', 'Cancel project', function () { toast(cancelMegaProject(n), ''); rerender(); }); return;
    case 'projFly': { const q = S.p10.projects.find(function (x) { return x.id === n; }); if (q) { closeModal(); if (ADM.open) closeAdminCenter(); flyToTile(q.x + 2, q.y + 2, 0.8); } return; }
    case 'maint': { const p = String(v).split(':'); S.p10.maint[p[0]] = clamp(Math.round((S.p10.maint[p[0]] + Number(p[1])) * 10) / 10, 0, 2); break; }
    case 'infra': { const p = String(v).split(':'); say(infraAction(p[0], p[1], false)); break; }
    case 'incDispatch': { const veh = dispatchP10Incident(n); toast(veh ? '🚨 Unit dispatched' : '❌ No free unit can reach it (build a police / fire station or maintenance depot nearby)', veh ? 'good' : 'bad'); break; }
    case 'incFly': { const x = S.p10.incidents.active.find(function (i) { return i.id === n; }); if (x && x.tile >= 0) { closeModal(); if (ADM.open) closeAdminCenter(); flyToTile(x.tile % MAP.W, (x.tile / MAP.W) | 0, 0.9); } return; }
    case 'petAccept': say(petitionAccept(n)); break;
    case 'petIgnore': say(petitionIgnore(n)); break;
    case 'graph': P10.ui.graph = v; break;
    case 'wiRun': { const t0 = performance.now(); const W = runWhatIf(v); if (W && !W.error) toast('🔮 ' + WHATIF_DEFS[v].name + ' simulated in ' + Math.round(performance.now() - t0) + ' ms', ''); break; }
    case 'wiApply': say(applyWhatIf()); break;
    case 'wiDiscard': LAB.whatif = null; toast('🗑️ Scenario discarded — nothing changed', ''); break;
    /* ---- admin (World Control Center) ---- */
    case 'labSet': if (adminOnly()) return; ['pop', 'traffic', 'tax', 'industry', 'tourism'].forEach(function (k) { const e = $('lab_' + k); if (e) LAB.sliders[k] = clamp(Number(e.value) || 0, -90, 400); }); break;
    case 'labRun': { if (adminOnly()) return; ['pop', 'traffic', 'tax', 'industry', 'tourism'].forEach(function (k) { const e = $('lab_' + k); if (e) LAB.sliders[k] = clamp(Number(e.value) || 0, -90, 400); }); const r = runSimulationLab(); toast(r.error ? '❌ ' + r.error : '🧪 Simulation finished in ' + Math.round(r.ms) + ' ms', r.error ? 'bad' : 'good'); break; }
    case 'tmSnap': if (adminOnly()) return; say(timeMachineCapture(gameYear()) ? { msg: 'Time Machine snapshot for year ' + gameYear() } : { ok: false, reason: 'Snapshot failed (storage)' }); break;
    case 'tmGo': if (adminOnly()) return; confirmDialog('⏳ Travel to year ' + v + '?', 'The world is restored to its year-' + v + ' state (a "Before rollback" snapshot of the current world is kept).', 'Travel', function () { const r = timeMachineTravel(+v); if (!r.ok) toast('❌ ' + r.reason, 'bad'); }); return;
    case 'heal': if (adminOnly()) return; toast('💊 ' + healAllCitizens(), 'good'); break;
    case 'maxCare': if (adminOnly()) return; S.p10.health.maxCare = !S.p10.health.maxCare; SV.health = healthPass(0); toast('🏥 MAX HEALTHCARE ' + (S.p10.health.maxCare ? 'ON' : 'OFF'), 'good'); break;
    case 'shockStart': if (adminOnly()) return; say(startShock(v) ? { msg: SHOCK_DEFS[v].name + ' started' } : { ok: false, reason: 'Already active or product missing' }); break;
    case 'shockEnd': if (adminOnly()) return; S.p10.shocks.forEach(function (s) { s.sev = 0.01; }); toast('✅ All supply shocks end next tick', 'good'); break;
    case 'incSpawn': if (adminOnly()) return; { const r = createP10Incident(v); toast(r ? r.icon + ' ' + r.name + ' created in ' + r.district : '❌ Could not create (no suitable place)', r ? '' : 'bad'); } break;
    case 'incResolve': if (adminOnly()) return; { const x = S.p10.incidents.active.find(function (i) { return i.id === n; }); if (x) resolveP10Incident(x, 'resolved by admin'); } break;
    case 'incResolveAll': if (adminOnly()) return; S.p10.incidents.active.slice().forEach(function (x) { resolveP10Incident(x, 'resolved by admin'); }); toast('✅ All incidents resolved', 'good'); break;
    case 'repSet': if (adminOnly()) return; admPromptAsk('⭐ City reputation', 'Reputation 0–1000', Math.round(S.p10.rep), function (val) { S.p10.rep = clamp(admNum(val, 500), 0, 1000); rerender(); }); return;
    case 'rankNow': if (adminOnly()) return; S.p10.rank.year = gameYear() - 1; rankingTick(); break;
    case 'found': if (adminOnly()) return; { const id = lwFoundCompany(v || 'SHOPPING'); toast(id ? '🏢 ' + aiDef(id).name + ' founded' : '❌ Maximum 12 custom companies or no name left', id ? 'good' : 'bad'); } break;
    case 'wave': if (adminOnly()) return; S.p10.fx.push({ k: 'growth', v: n > 0 ? 0.5 : -0.5, until: S.clock.runSec + 300, id: '', src: 0 }); newsAdd(n > 0 ? '🧳' : '🚚', n > 0 ? 'MIGRATION IN wave (admin)' : 'MIGRATION OUT wave (admin)', 'Population growth ' + (n > 0 ? '+50%' : '−50%') + ' for 5 minutes.', { cat: 'population' }); break;
    case 'megaFinish': if (adminOnly()) return; S.p10.projects.slice().forEach(finishMegaProject); toast('🏗️ All megaprojects completed', 'good'); break;
    case 'megaFree': if (adminOnly()) return; say(startMegaProject(v, null, { admin: true, instant: true })); break;
    case 'facSet': case 'facGen': case 'facPreset': case 'scoreNow': case 'scoreFix': case 'megaGen': if (adminOnly()) return; return factoryDo(a, v);
    case 'heat': closeModal(); if (ADM.open) closeAdminCenter(); setHeatmap(v); return;
    default: return;
  }
  rerender();
}
document.addEventListener('click', function (e) {
  const el = e.target.closest && e.target.closest('[data-p10]'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  try { p10Do(el.dataset.p10, el.dataset.v, el); } catch (err) { if (typeof logError === 'function') logError('Part 10 action ' + el.dataset.p10, err); toast('⚠️ ' + err.message, 'bad'); }
});
/* Map tap while a megaproject site is being picked */
function p10TapHook(sx, sy) {
  if (!P10.pickMega || !S || !S.p10) return false;
  const type = P10.pickMega; P10.pickMega = null;
  const t = tileAtScreen(sx, sy), d = BUILDINGS[type];
  const site = { x: clamp(t.x - Math.floor(d.w / 2), 0, MAP.W - d.w), y: clamp(t.y - Math.floor(d.h / 2), 0, MAP.H - d.h) };
  const r = startMegaProject(type, site, { admin: adminModeEnabled() && S.p8 && S.p8.unlockAll });
  if (r.ok) toast('🏗️ ' + d.name + ' started — see the Project Manager (J)', 'good'); else toast('❌ ' + r.reason, 'bad');
  return true;
}

/* ===================================== WORLD FACTORY (admin) ===================================== */
function factoryCfg() { if (!P10.factory) P10.factory = Object.assign({}, FACTORY_DEFAULT, S.p10 && S.p10.factory || {}); return P10.factory; }
function factoryDo(a, v) {
  const F = factoryCfg();
  if (a === 'facPreset') { const p = WORLD_PRESETS[v]; if (p) { Object.assign(F, FACTORY_DEFAULT, p.cfg, { preset: v, name: p.name.replace(/^\S+\s/, '') }); } rerender(); return; }
  if (a === 'facSet' || a === 'facGen' || a === 'megaGen') {
    ['name', 'seed', 'size', 'mapType', 'climate', 'infrastructure', 'coast'].forEach(function (k) { const e = $('fac_' + k); if (e) F[k] = e.value; });
    ['popDensity', 'economy', 'industry', 'tourism', 'traffic', 'resources', 'disasters', 'tech', 'water', 'mountains', 'forest'].forEach(function (k) { const e = $('fac_' + k); if (e) F[k] = clamp(Number(e.value) || 0, 0, 3); });
  }
  if (a === 'facGen' || a === 'megaGen') {
    const cfg = Object.assign({}, F); delete cfg.preset; if (!cfg.seed) delete cfg.seed;
    confirmDialog('🌐 GENERATE MEGA WORLD?', 'A new ' + esc(F.size) + ' world "' + esc(F.name) + '" is generated in the 22-step pipeline and replaces the current city in its slot (a backup snapshot is taken first).', 'Generate', function () { createSnapshot('Before GENERATE MEGA WORLD', true); closeAdminCenter(); generateMegaWorld(F.preset || 'custom', cfg); });
    return;
  }
  if (a === 'scoreNow') { S.p10.genScore = generationScore(); toast('🏆 World generation score ' + S.p10.genScore.overall + '/100', 'good'); }
  if (a === 'scoreFix') { const r = generationScoreFix(); S.p10.genScore = r; toast('🔧 AUTO FIX: score ' + r.before + ' → ' + r.overall + (r.fixed.length ? ' (' + r.fixed.length + ' fixes)' : ' (nothing needed)'), 'good'); }
  rerender();
}
function scoreHtml(sc) {
  if (!sc) return '<p class="small">Not scored yet.</p>';
  return '<p><b class="' + (sc.overall >= 85 ? 'pos' : sc.overall >= 70 ? '' : 'neg') + '">WORLD GENERATION SCORE ' + sc.overall + ' / 100</b>' + (sc.before !== undefined && sc.before !== sc.overall ? ' <span class="small">(before auto fix ' + sc.before + ')</span>' : '') + '</p>' +
    tbl(['Category', 'Score'], SCORE_CATS.map(function (c) { const v = sc.cats[c[0]]; return [c[1] + ' ' + c[2], bar(v, v < 70 ? 'red' : '') + ' ' + v]; })) + (sc.fixed && sc.fixed.length ? '<p class="small"><b>Auto fix:</b> ' + sc.fixed.map(esc).join(' · ') + '</p>' : '');
}

/* ===================================== WORLD CONTROL CENTER TABS ===================================== */
WC_CATS.push(['wc_living', '🌱', 'LIVING WORLD'], ['wc_incidents', '🚨', 'INCIDENT CENTER'], ['wc_lab', '🧪', 'SIMULATION LAB'], ['wc_whatif', '🔮', 'WHAT-IF'], ['wc_tm', '⏳', 'TIME MACHINE'], ['wc_factory', '🏭', 'WORLD FACTORY'], ['wc_projects', '🏗', 'MEGAPROJECTS'], ['wc_health', '🏥', 'HEALTH & EDUCATION']);
const P10_VIEWS = {
  wc_living: function () {
    const P = S.p10;
    return aCard('🌱 Living World', '<div class="grid4">' + kv('Reputation', Math.round(P.rep) + ' / 1000') + kv('Life phase', LIFE_PHASES[lifePhase()].icon + ' ' + LIFE_PHASES[lifePhase()].name) + kv('Migration', P.pop.wave || 'stable') + kv('News', P.news.length) + '</div>' +
      aRow(pb('repSet', '⭐ Set reputation') + pb('rankNow', '🏆 Run yearly ranking now') + pb('wave', '🧳 Migration IN wave', 'green', 1) + pb('wave', '🚚 Migration OUT wave', 'red', -1) + pb('tab', '📰 Open hub', '', 'news')) +
      aRow(['SHOPPING', 'FOOD', 'TECHNOLOGY', 'FINANCE', 'ENTERTAINMENT', 'INDUSTRY', 'HOUSING'].map(function (s) { return pb('found', '🏢 Found ' + s.toLowerCase() + ' company', '', s); }).join(''))) +
      aCard('🤖 Automation', AUTO_DEFS.map(function (x) { return '<div class="between" style="padding:4px 0"><span>' + x[1] + ' ' + x[2] + '</span>' + pb('auto', P.auto[x[0]] ? 'ON' : 'OFF', P.auto[x[0]] ? 'green' : '', x[0]) + '</div>'; }).join('')) +
      HUB_VIEWS.overview();
  },
  wc_incidents: function () { return incidentCenterHtml(true); },
  wc_lab: function () {
    const sl = LAB.sliders, L = LAB.last;
    const inp = function (k, label) { return '<div class="admRow"><span>' + label + '</span><input class="admInput" id="lab_' + k + '" type="number" step="10" value="' + sl[k] + '"> %</div>'; };
    return aCard('🧪 SIMULATION LAB', '<p class="small">Experiments run the real economy engine on a copy of the world (same random seed for the baseline and the experiment, 2.4 game hours). The live city is not touched.</p>' +
      inp('pop', 'Population') + inp('traffic', 'Traffic') + inp('tax', 'Tax rate (relative)') + inp('industry', 'Industry output') + inp('tourism', 'Tourism') + aRow(pb('labRun', '▶ RUN SIMULATION', 'gold'))) +
      (L ? aCard('📊 Result (day ' + L.at + ', ' + Math.round(L.ms) + ' ms) — pop ' + sgn(L.sliders.pop, function (v) { return v + '%'; }) + ', traffic ' + sgn(L.sliders.traffic, function (v) { return v + '%'; }) + ', tax ' + sgn(L.sliders.tax, function (v) { return v + '%'; }) + ', industry ' + sgn(L.sliders.industry, function (v) { return v + '%'; }) + ', tourism ' + sgn(L.sliders.tourism, function (v) { return v + '%'; }), whatIfResultHtml(L, false)) : '');
  },
  wc_whatif: function () { return whatIfHtml(); },
  wc_tm: function () {
    const P = S.p10;
    const rows = TM_YEARS.map(function (y) { const t = P.tm[y], ok = t && Store.getItem(snapKey(t.id)); return ['YEAR ' + y, t ? t.id + (ok ? '' : ' <span class="neg">(removed)</span>') : '<span class="small">' + (gameYear() < y ? 'captured automatically in year ' + y : 'missed') + '</span>', t ? fmt(t.pop) : '—', t ? money(t.gdp) : '—', t ? t.rep : '—', t ? t.happy + '%' : '—', t && ok ? pb('tmGo', '⏳ TRAVEL', 'gold', y) : '']; });
    return aCard('⏳ TIME MACHINE', '<p class="small">Snapshots of the world at years 1, 5, 10, 25, 50 and 100 (Save 3.0 snapshots, protected from automatic clean-up). Now: year ' + gameYear() + ' · ' + fmt(Math.round(S.city.population)) + ' citizens · GDP ' + money(cityGDP()) + '.</p>' + tbl(['Year', 'Snapshot', 'Population', 'GDP', 'Reputation', 'Happiness', ''], rows) + aRow(pb('tmSnap', '📸 Capture the current year now')));
  },
  wc_factory: function () {
    const F = factoryCfg();
    const sel = function (k, opts) { return '<div class="admRow"><span>' + k + '</span>' + wcSel('fac_' + k, opts, F[k]) + '</div>'; };
    const rng = function (k, label) { return '<div class="admRow"><span>' + label + '</span><input class="admInput" id="fac_' + k + '" type="number" min="0" max="3" step="0.1" value="' + (F[k] === undefined ? 1 : F[k]) + '"></div>'; };
    const presets = P10_PRESETS.map(function (k) { return pb('facPreset', WORLD_PRESETS[k].name, F.preset === k ? 'gold' : '', k); }).join('');
    return aCard('🏭 WORLD FACTORY', '<div class="row admRowWrap">' + presets + '</div>' +
      '<div class="admRow"><span>World name</span><input class="admInput" id="fac_name" value="' + esc(F.name) + '"></div><div class="admRow"><span>Seed (empty = random)</span><input class="admInput" id="fac_seed" value="' + esc(F.seed || '') + '"></div>' +
      sel('size', Object.keys(WORLD_SIZES).map(function (k) { return [k, k + ' ' + WORLD_SIZES[k] + '×' + WORLD_SIZES[k]]; })) + sel('mapType', Object.keys(MAP_TYPES).map(function (k) { return [k, 'Terrain: ' + MAP_TYPES[k].name]; })) + sel('coast', [['none', 'No coast'], ['side', 'Coastline'], ['islands', 'Islands']]) +
      sel('climate', [['temperate', 'Temperate'], ['tropical', 'Tropical'], ['arid', 'Arid'], ['cold', 'Cold']]) + sel('infrastructure', [['basic', 'Basic infrastructure'], ['standard', 'Standard'], ['advanced', 'Advanced'], ['green', 'Green']]) +
      rng('popDensity', 'Population') + rng('economy', 'Economy') + rng('industry', 'Industry') + rng('tourism', 'Tourism') + rng('traffic', 'Traffic') + rng('resources', 'Resources') + rng('disasters', 'Disaster frequency') + rng('tech', 'Technology level') + rng('water', 'Water') + rng('mountains', 'Mountains') + rng('forest', 'Forest') +
      aRow(pb('facSet', '💾 Keep settings') + pb('facGen', '🌐 GENERATE WORLD (22 steps)', 'gold'))) +
      aCard('🏆 WORLD GENERATION SCORE', scoreHtml(S.p10.genScore) + aRow(pb('scoreNow', '📊 Score this world') + pb('scoreFix', '🔧 Score + AUTO FIX', 'green'))) +
      aCard('🌐 GENERATE MEGA WORLD pipeline', '<p class="small">' + MEGA_STAGES.map(function (s, k) { return (k + 1) + '. ' + s[1]; }).join(' → ') + '</p>');
  },
  wc_projects: function () {
    return aCard('🏗 Megaprojects (admin)', aRow(pb('megaFinish', '✅ Complete all projects', 'green')) + tbl(['Project', 'Cost', ''], Object.keys(MEGA_DEFS).map(function (t) { const d = BUILDINGS[t]; return [d.icon + ' ' + d.name, money(megaCost(t)), S.buildings.list.some(function (b) { return b.type === t; }) ? 'built / building' : pb('projStart', 'Start (normal)', '', t) + pb('megaFree', '⚡ Build instantly', 'gold', t)]; }))) + HUB_VIEWS.projects();
  },
  wc_health: function () {
    return aCard('🏥 Health & education control', aRow(pb('heal', '💊 HEAL ALL CITIZENS', 'green') + pb('maxCare', S.p10.health.maxCare ? '🏥 MAX HEALTHCARE: ON' : '🏥 MAX HEALTHCARE: OFF', S.p10.health.maxCare ? 'gold' : '')) +
      aRow(Object.keys(SHOCK_DEFS).map(function (k) { return pb('shockStart', SHOCK_DEFS[k].icon + ' ' + SHOCK_DEFS[k].name, 'red', k); }).join('') + pb('shockEnd', '✅ End all shocks', 'green'))) + HUB_VIEWS.services() + HUB_VIEWS.economy();
  }
};
Object.assign(ADM_VIEWS, P10_VIEWS);

/* ===================================== ADMIN SEARCH 2.0 ===================================== */
const P10_SEARCH = [
  ['Traffic Multiplier', '🚦', 'acat', 'wc_traffic', 'traffic'], ['Clear Traffic', '🧹', 'ac', 'clearTraffic', 'traffic'], ['Spawn Traffic', '🚗', 'ac', 'spawnTraffic', 'traffic'], ['Traffic Heatmap', '🌡️', 'p10', 'heat:TRAFFIC', 'traffic'], ['Traffic AI (light controller)', '🤖', 'ac', 'p9_lightAI', 'traffic'], ['Traffic Debug', '🐞', 'ac', 'debugWorld', 'traffic'], ['AUTO TRAFFIC', '🚦', 'p10', 'auto:traffic', 'traffic automation'],
  ['Living World', '🌱', 'acat', 'wc_living', 'living world news reputation'], ['Incident Center', '🚨', 'acat', 'wc_incidents', 'incident emergency accident'], ['Simulation Lab', '🧪', 'acat', 'wc_lab', 'simulation lab experiment'], ['What-If mode', '🔮', 'acat', 'wc_whatif', 'what if scenario highway'], ['Time Machine', '⏳', 'acat', 'wc_tm', 'time machine snapshot year'],
  ['World Factory', '🏭', 'acat', 'wc_factory', 'world factory generate preset mega'], ['Generate Mega World', '🌐', 'acat', 'wc_factory', 'generate mega world'], ['Megaprojects', '🏗', 'acat', 'wc_projects', 'mega project build'], ['Heal All Citizens', '💊', 'p10', 'heal', 'health heal hospital'], ['Max Healthcare', '🏥', 'p10', 'maxCare', 'health hospital'],
  ['Supply shocks', '⚠️', 'acat', 'wc_health', 'supply shock steel shortage'], ['Healthcare Heatmap', '🌡️', 'p10', 'heat:HEALTH', 'health heatmap'], ['Education Heatmap', '🌡️', 'p10', 'heat:EDUCATION', 'education school heatmap'], ['Pollution Heatmap', '🌡️', 'p10', 'heat:POLLUTION', 'pollution heatmap'], ['Land Value Heatmap', '🌡️', 'p10', 'heat:LAND VALUE', 'land value heatmap'],
  ['Economy', '💰', 'acat', 'wc_econ', 'economy money'], ['Citizen Analytics', '👥', 'acat', 'wc_cit', 'citizens analytics'], ['Reputation', '⭐', 'p10', 'repSet', 'reputation'], ['Yearly ranking', '🏆', 'p10', 'rankNow', 'ranking rank'], ['Found a company', '🏢', 'p10', 'found:SHOPPING', 'company found brand'], ['Resolve all incidents', '✓', 'p10', 'incResolveAll', 'incident resolve']
];
function p10SearchHtml(q) {
  q = q.toLowerCase();
  return P10_SEARCH.filter(function (s) { return s[0].toLowerCase().indexOf(q) >= 0 || s[4].indexOf(q) >= 0; }).map(function (s) {
    if (s[2] === 'acat') return '<button class="admLi" data-acat="' + s[3] + '">' + s[1] + ' ' + s[0] + '</button>';
    if (s[2] === 'ac') return '<button class="admLi" data-ac="' + s[3] + '">' + s[1] + ' ' + s[0] + '</button>';
    const p = s[3].split(':'); return '<button class="admLi" data-p10="' + p[0] + '"' + (p[1] ? ' data-v="' + esc(p.slice(1).join(':')) + '"' : '') + '>' + s[1] + ' ' + s[0] + '</button>';
  });
}

/* ===================================== COMMAND PALETTE 2.0 ===================================== */
function adminGate(f, cat) { return function () { if (!adminModeEnabled()) { promptEnableAdmin(cat || 'wc_world'); return; } f(); }; }
function p10PaletteCommands() {
  const C = [], add = function (label, icon, run, kw) { C.push({ label: label, icon: icon, run: run, kw: (kw || '').toLowerCase() }); };
  const adm = typeof AdminAuth !== 'undefined' && AdminAuth.active();          // Part 12: admin commands only exist for an authenticated admin
  if (adm) add('Generate World', '🌍', adminGate(function () { openAdminCenter('wc_factory'); }, 'wc_factory'), 'world generator new mega');
  if (adm) add('Repair World', '🔧', adminGate(function () { openAdminCenter('wc_debug'); quickAction('q_repairWorld'); }), 'fix validate');
  if (adm) add('Open World Control Center', '🌐', function () { promptEnableAdmin('wc_world'); }, 'admin f10');
  if (adm) add('Create Snapshot', '📸', adminGate(function () { const s = createSnapshot('Snapshot ' + new Date().toLocaleString()); toast(s ? '📸 Snapshot ' + s.id : '❌ Snapshot failed', s ? 'good' : 'bad'); }), 'save backup');
  if (adm) add('Clone World', '🧬', adminGate(function () { openAdminCenter('wc_world'); quickAction('q_clone'); }), 'copy duplicate');
  if (adm) add('Spawn Disaster', '🌪️', adminGate(function () { openAdminCenter('wc_disaster'); }, 'wc_disaster'), 'earthquake flood fire storm');
  if (adm) add('Clear Traffic', '🧹', adminGate(function () { openAdminCenter('wc_traffic'); adminDo('clearTraffic'); }, 'wc_traffic'), 'jam vehicles');
  if (adm) add('Unlock Everything', '🔓', adminGate(function () { confirmDialog('🔓 Unlock everything?', 'All regions, buildings, technologies and megaprojects are unlocked for this city.', 'Unlock', unlockEverything); }), 'unlock all');
  add('Build Mega Project', '🏗️', function () { openHub('projects'); }, 'megaproject project manager');
  add('Open Economy', '💰', function () { openPanel('city', 'economy'); }, 'money budget');
  add('Open Citizen Analytics', '👥', function () { openHub('citizens'); }, 'citizens opinions petitions population');
  return C;
}
function p10PaletteExtra(add) {
  add('Living City hub (J)', '🌱', function () { openHub('overview'); }, 'living world news reputation population');
  add('City News', '📰', function () { openHub('news'); }, 'headlines');
  add('City Dashboard — fullscreen (U)', '📺', function () { toggleDash(true); }, 'dashboard fullscreen');
  add('World Observatory (O)', '🛰️', function () { openObservatory(); }, 'map overview bird');
  add('Project Manager', '🏗️', function () { openHub('projects'); }, 'megaproject');
  add('Incident Center', '🚨', function () { openHub('incidents'); }, 'incident emergency');
  add('City AI Assistant', '🧠', function () { openHub('assistant'); }, 'advisor problem options');
  add('What-If mode', '🔮', function () { openHub('whatif'); }, 'scenario simulate');
  add('Live graphs', '📈', function () { openHub('graphs'); }, 'charts statistics');
  add('Smart automation', '🤖', function () { openHub('auto'); }, 'auto traffic repair zoning');
  add('Infrastructure & maintenance budgets', '🛠️', function () { openHub('infra'); }, 'aging bridge repair');
  add('Supply shocks', '⚠️', function () { openHub('economy'); }, 'steel shortage');
  add('Command Palette 2.0 (Ctrl+Shift+P)', '⌨️', function () { setTimeout(openPalette2, 30); }, 'commands');
}
function openPalette2() { PAL.v2 = true; openPalette(); $('palInput').placeholder = 'Command Palette 2.0 — Generate World, Repair World, Snapshot, Mega Project …'; renderPalette(); }

/* ===================================== FULLSCREEN CITY DASHBOARD ===================================== */
const CDASH = { open: false, el: null, acc: 0 };
function toggleDash(on) {
  if (!p10Ready()) return;
  CDASH.open = on === undefined ? !CDASH.open : on;
  if (!CDASH.el) { CDASH.el = document.createElement('div'); CDASH.el.id = 'p10Dash'; document.body.appendChild(CDASH.el); }
  CDASH.el.classList.toggle('show', CDASH.open);
  document.body.classList.toggle('p10DashOn', CDASH.open);
  if (CDASH.open) renderDash();
}
function renderDash() {
  if (!CDASH.el || !p10Ready()) return;
  const c = S.city, P = S.p10, G = P.graphs, H = SV.health, A = assistantProblems()[0];
  const spark = function (k, col) { return svgChart((G[k] || []).slice(-60), 220, 30, col); };
  const meter = function (icon, label, v, cls, sub) { return '<div class="p10DM"><div class="between"><span>' + icon + ' ' + label + '</span><b>' + pc(v) + '</b></div>' + bar(v, cls) + (sub ? '<div class="small">' + sub + '</div>' : '') + '</div>'; };
  const alerts = UI.notifs.slice(0, 6).map(function (n) { return '<div class="p10DA ' + n.cls + '">' + esc(n.msg) + '</div>'; }).join('') + P.incidents.active.slice(0, 3).map(function (x) { return '<div class="p10DA bad">' + x.icon + ' ' + esc(x.name) + ' · ' + esc(x.district) + '</div>'; }).join('');
  CDASH.el.innerHTML =
    '<div class="p10DL"><h3>🏙️ ' + esc(c.name) + '</h3>' +
    '<div class="p10DK"><span>👥 Population</span><b>' + fmt(Math.round(c.population)) + '</b>' + spark('pop', '#80ed99') + '</div>' +
    '<div class="p10DK"><span>💵 Money</span><b>' + money(S.money) + '</b><div class="small">City budget ' + money(S.budget) + ' (' + money(SIM.bNet || 0) + '/s)</div></div>' +
    '<div class="p10DK"><span>💰 GDP</span><b>' + money(cityGDP()) + '</b>' + spark('gdp', '#ffd166') + '</div>' +
    '<div class="p10DK"><span>⭐ Reputation</span><b>' + Math.round(P.rep) + ' / 1000</b><div class="small">' + repLabel(P.rep) + ' · ' + LIFE_PHASES[lifePhase()].icon + ' ' + LIFE_PHASES[lifePhase()].name + ' · Y' + gameYear() + ' D' + gameDay() + '</div></div>' +
    '<div class="p10DK"><span>🧳 Tourists</span><b>' + fmt(Math.round(c.tourists)) + '</b></div></div>' +
    '<div class="p10DC"></div>' +
    '<div class="p10DR"><h3>🔔 Alerts</h3>' + (alerts || '<div class="small">No alerts.</div>') +
    '<h3>🧠 Advisor</h3>' + (A ? '<div class="p10DA">' + A.icon + ' <b>' + esc(A.problem) + '</b><div class="small">' + esc(A.cause) + '</div><div class="small">Options: ' + A.options.map(function (o) { return WHATIF_DEFS[o].icon + ' ' + WHATIF_DEFS[o].name; }).join(' · ') + '</div></div>' : '<div class="small pos">No major problems.</div>') +
    '<h3>🏗️ Projects</h3>' + (P.projects.length ? P.projects.map(function (q) { return '<div class="p10DA">' + BUILDINGS[q.type].icon + ' ' + BUILDINGS[q.type].name + ' ' + pc(q.progress * 100) + bar(q.progress * 100, 'gold') + '<div class="small">' + MEGA_MILESTONES[q.stage][0] + ' · ' + esc(q.status) + ' · ' + projectEta(q) + '</div></div>'; }).join('') : '<div class="small">No megaproject running.</div>') +
    '<div class="row" style="margin-top:8px">' + pb('tab', '🌱 Hub', '', 'overview') + pb('obs', '🛰️ Observatory') + '</div></div>' +
    '<div class="p10DB">' + meter('🚦', 'Traffic', SIM.traffic || 0, (SIM.traffic || 0) > 50 ? 'red' : '', 'congestion') + meter('⚡', 'Power', (SIM.powerRatio || 0) * 100, (SIM.powerRatio || 0) < 1 ? 'red' : 'green', fmt(Math.round(SIM.powerGen || 0)) + ' / ' + fmt(Math.round(SIM.powerUse || 0)) + ' MW') + meter('💧', 'Water', (SIM.waterRatio || 0) * 100, (SIM.waterRatio || 0) < 1 ? 'red' : 'green', fmt(Math.round(SIM.waterGen || 0)) + ' / ' + fmt(Math.round(SIM.waterUse || 0))) + meter('😊', 'Happiness', c.happiness, c.happiness < 50 ? 'red' : 'green', H ? 'hospitals ' + pc(H.load * 100) : '') + '</div>' +
    '<button class="closeX p10DX" data-p10="dashClose">✕</button>';
}
document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-p10="dashClose"]'); if (el) { e.stopPropagation(); toggleDash(false); } }, true);

/* ===================================== WORLD OBSERVATORY ===================================== */
const OBS_VIEWS = [['NORMAL', '🗺️', 'Normal'], ['TRAFFIC', '🚦', 'Traffic'], ['WEALTH', '💰', 'Economy'], ['DENSITY', '👥', 'Population'], ['POLLUTION', '🏭', 'Pollution'], ['ELECTRICITY', '⚡', 'Electricity'], ['WATER', '💧', 'Water'], ['TOURISM', '🧳', 'Tourism'], ['LAND VALUE', '🏷️', 'Land Value'], ['HAPPINESS', '😊', 'Happiness'], ['EDUCATION', '🎓', 'Education'], ['HEALTH', '🏥', 'Healthcare'], ['SAFETY', '🛡️', 'Safety']];
function openObservatory(view) {
  if (!p10Ready()) return;
  if (view) P10.ui.obs = view;
  const btns = OBS_VIEWS.map(function (v) { return '<button class="btn small ' + (P10.ui.obs === v[0] ? 'gold' : '') + '" data-obs="' + v[0] + '">' + v[1] + ' ' + v[2] + '</button>'; }).join('');
  showModal('🛰️ WORLD OBSERVATORY — ' + MAP.W + '×' + MAP.H, '<div class="row admRowWrap">' + btns + '</div><div class="p10ObsWrap"><canvas id="p10Obs"></canvas></div><div id="p10ObsLegend" class="small"></div>');
  $('modal').classList.add('p10Wide');
  $('modalBody').querySelectorAll('[data-obs]').forEach(function (b) { b.onclick = function () { openObservatory(b.dataset.obs); }; });
  drawObservatory();
}
function drawObservatory() {
  const cv = $('p10Obs'); if (!cv) return;
  const W = MAP.W, H = MAP.H, px = Math.max(2, Math.floor(Math.min(720, window.innerWidth - 80) / W));
  cv.width = W * px; cv.height = H * px;
  const g = cv.getContext('2d'), mode = P10.ui.obs;
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    let col = MAP.nature[i] === 2 || MAP.terrain[i] === TERRAIN.WATER ? '#2f6f9f' : MAP.terrain[i] === TERRAIN.ROCK ? '#7d7d7d' : MAP.terrain[i] === TERRAIN.HILL ? '#86a85c' : MAP.nature[i] === 1 ? '#3e7d3a' : '#6aa84f';
    if (!inUnlocked(x, y)) col = '#2b2f3a';
    if (MAP.roads[i]) col = ['', '#666', '#5a5a5a', '#4a4a4a', '#333'][MAP.roads[i]] || '#555';
    g.fillStyle = col; g.fillRect(x * px, y * px, px, px);
  }
  S.buildings.list.forEach(function (b) { const d = bdef(b); g.fillStyle = b.built ? d.color : '#f4a261'; g.globalAlpha = b.built ? 1 : 0.6; g.fillRect(b.x * px, b.y * px, d.w * px, d.h * px); g.globalAlpha = 1; });
  const leg = $('p10ObsLegend');
  if (mode !== 'NORMAL') {
    computeHeat6(mode);
    const grid = HEAT6.grid, def = HEATMAPS.find(function (h) { return h.id === mode; }) || { ramp: 'good', low: 'low', high: 'high' };
    for (let i = 0; i < W * H; i++) {
      const v = grid ? clamp(grid[i] || 0, 0, 1) : 0, t = def.ramp === 'bad' ? v : 1 - v;
      const r = Math.round(40 + 215 * t), gg = Math.round(200 - 150 * t), bb = 60;
      g.fillStyle = 'rgba(' + r + ',' + gg + ',' + bb + ',' + (0.25 + 0.5 * v) + ')'; g.fillRect((i % W) * px, ((i / W) | 0) * px, px, px);
    }
    if (leg) leg.innerHTML = (def.icon || '') + ' <b>' + esc(def.name || mode) + '</b> · low: ' + esc(def.low) + ' → high: ' + esc(def.high) + ' · click the map to fly there';
  } else if (leg) leg.textContent = fmt(S.buildings.list.length) + ' buildings · ' + fmt(MAP.roadCount) + ' road tiles · click the map to fly there';
  S.p10.projects.forEach(function (q) { g.strokeStyle = '#ffd166'; g.lineWidth = 2; const d = BUILDINGS[q.type]; g.strokeRect(q.x * px, q.y * px, d.w * px, d.h * px); });
  S.p10.incidents.active.forEach(function (x) { if (x.tile < 0) return; g.fillStyle = '#ff006e'; g.beginPath(); g.arc((x.tile % W + 0.5) * px, (((x.tile / W) | 0) + 0.5) * px, Math.max(3, px), 0, 6.3); g.fill(); });
  const vw = CAM.zoom > 0 ? cv.width / (W * TILE) : 0; g.strokeStyle = '#fff'; g.lineWidth = 1;
  const vwW = window.innerWidth / CAM.zoom, vwH = window.innerHeight / CAM.zoom; g.strokeRect((CAM.x - vwW / 2) * vw, (CAM.y - vwH / 2) * vw, vwW * vw, vwH * vw);
  cv.onclick = function (e) { const r = cv.getBoundingClientRect(); const tx = Math.floor((e.clientX - r.left) / r.width * W), ty = Math.floor((e.clientY - r.top) / r.height * H); closeModal(); flyToTile(tx, ty, Math.max(CAM.zoom, 0.8)); };
}

/* ===================================== MAP OVERLAYS (megaproject milestones, incidents) ===================================== */
function drawP10Overlays() {
  if (!S || !S.p10) return;
  S.p10.projects.forEach(function (q) {
    const d = BUILDINGS[q.type], x = q.x * TILE, y = q.y * TILE, w = d.w * TILE, h = d.h * TILE;
    const cols = ['rgba(255,209,102,.18)', 'rgba(141,153,174,.35)', 'rgba(108,117,125,.45)', 'rgba(76,201,240,.35)', 'rgba(128,237,153,.3)'];
    ctx.fillStyle = cols[q.stage]; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
    if (q.stage >= 2) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * w / 4, y); ctx.lineTo(x + k * w / 4, y + h); ctx.stroke(); } }
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + w / 2 - 70, y - 26, 140, 20);
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.icon + ' ' + MEGA_MILESTONES[q.stage][0] + ' ' + Math.round(q.progress * 100) + '%', x + w / 2, y - 12);
    ctx.textAlign = 'start';
  });
  S.p10.incidents.active.forEach(function (x) {
    if (x.type === 'breakdown' || x.type === 'traffic' || x.type === 'accident') return;
    const b = MAP.byId.get(x.bid); if (!b) return;
    const c = buildingCenter(b); drawEmoji(x.icon, c.x, c.y - 30 - Math.sin(FX.time * 4) * 3, 18);
  });
}

/* ===================================== KEYS & INIT ===================================== */
window.addEventListener('keydown', function (e) {
  if (!S || !S.p10 || typeof STARTED === 'undefined' || !STARTED) return;
  const k = e.key.toLowerCase(), tag = e.target && e.target.tagName;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'p') { e.preventDefault(); e.stopPropagation(); if ($('paletteWrap').classList.contains('hidden')) openPalette2(); else closePalette(); return; }
  if (k === 'escape' && CDASH.open) { e.preventDefault(); e.stopImmediatePropagation(); toggleDash(false); return; }
  if (k === 'escape' && P10.pickMega) { P10.pickMega = null; toast('Site selection cancelled', ''); return; }
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((typeof ADM !== 'undefined' && ADM.open) || $('modalWrap').classList.contains('show') && !hubVisible()) return;
  if (k === 'j') { e.preventDefault(); if (hubVisible()) closeModal(); else openHub(); }
  else if (k === 'u') { e.preventDefault(); toggleDash(); }
  else if (k === 'o') { e.preventDefault(); openObservatory(); }
}, true);
setInterval(function () {
  if (!p10Ready()) return;
  if (CDASH.open) renderDash();
  if (P10.ui.tab === 'graphs' && hubVisible()) rerender();
}, 1000);
function bindP10UI() {
  const add = function (id, icon, tip, fn) { if ($(id)) return; const b = document.createElement('button'); b.className = 'toolBtn'; b.id = id; b.innerHTML = icon + '<span class="tip">' + tip + '</span>'; b.onclick = fn; const ref = $('paletteBtn'); if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref); };
  add('p10HubBtn', '🌱', 'Living City hub (J)', function () { openHub(); });
  add('p10DashBtn', '📺', 'City Dashboard — fullscreen (U)', function () { toggleDash(); });
  add('p10ObsBtn', '🛰️', 'World Observatory (O)', function () { openObservatory(); });
}
if (document.readyState !== 'loading') bindP10UI(); else document.addEventListener('DOMContentLoaded', bindP10UI);
