'use strict';
/* BLOCK CITY TYCOON — UI — panels, modals, interiors, tutorial, tools */
/* ================================= 9. UI ================================= */
const UI = {
  panel: null, tabs: { build: 'Residential', city: 'overview', companies: 'companies', research: 'tree' }, rtab: 'quests',
  selected: null, tool: 'select', placing: null, hover: null, ghost: null, roadDrag: null, overlay: 0,
  busyUntil: 0, idleTimer: 0, advice: null, notifs: [], unread: 0, stockSel: 'CUBE', highlight: null,
  interior: null, rightCollapsed: false
};
const $ = function (id) { return document.getElementById(id); };

/* --- Toasts, notifications, flashes ------------------------------------------------ */
function toast(msg, cls) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 320); }, 2600);
}
function notify(msg, cls) {
  UI.notifs.unshift({ msg: msg, cls: cls || '', t: pad2(Math.floor(gameHour())) + ':' + pad2(Math.floor((S.clock.gameSec / 60) % 60)) + ' D' + gameDay() });
  if (UI.notifs.length > 80) UI.notifs.pop();
  if (UI.rtab !== 'notifs' || UI.rightCollapsed) UI.unread++;
  toast(msg, cls);
  if (cls !== 'bad') sfx('notify');
  if (UI.rtab === 'notifs') renderRight();
  updateBadge();
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function updateBadge() { const b = $('notifBadge'); b.textContent = UI.unread; b.classList.toggle('hidden', UI.unread === 0); }
function flashBig(html) {
  const f = $('levelFlash');
  f.innerHTML = '<div>' + html + '</div>';
  setTimeout(function () { if (f.innerHTML.indexOf(html) >= 0) f.innerHTML = ''; }, 1900);
}

/* --- Modal & confirm ---------------------------------------------------------------- */
let modalOnClose = null;
function showModal(title, html, onClose) {
  $('modalTitle').innerHTML = title; $('modalBody').innerHTML = html;
  $('modalWrap').classList.add('show');
  modalOnClose = onClose || null;
}
function closeModal() {
  if (!$('modalWrap').classList.contains('show')) return;
  $('modalWrap').classList.remove('show');
  UI.interior = null;
  const f = modalOnClose; modalOnClose = null; if (f) f();
}
function confirmDialog(title, msg, yesLabel, onYes) {
  showModal(title, '<p style="font-size:14px;line-height:1.45;margin-bottom:14px">' + msg + '</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn green" id="cfYes">' + (yesLabel || 'Confirm') + '</button></div>');
  $('cfYes').onclick = function () { closeModal(); onYes(); };
}

/* --- Top bar ----------------------------------------------------------------------- */
function refreshTopbar() {
  $('tMoney').textContent = money(S.money);
  const pn = SIM.pNet || 0, bn = SIM.bNet || 0;
  const inc = $('tIncome'); inc.textContent = signMoney(pn) + '/s'; inc.className = pn >= 0 ? 'pos' : 'neg';
  $('tBudget').textContent = money(S.budget);
  const bb = $('tBudgetNet'); bb.textContent = signMoney(bn) + '/s'; bb.className = bn >= 0 ? 'pos' : 'neg';
  $('tPop').textContent = fmt(Math.floor(S.city.population));
  const h = S.city.happiness;
  $('tHap').textContent = pct(h); $('tHapIc').textContent = h >= 75 ? '😄' : h >= 55 ? '🙂' : h >= 35 ? '😐' : '😠';
  $('tRP').textContent = fmt(S.research.rp) + (SIM.rpRate > 0 ? ' (+' + SIM.rpRate.toFixed(2) + ')' : '');
  $('tClock').textContent = pad2(Math.floor(gameHour())) + ':' + pad2(Math.floor((S.clock.gameSec / 60) % 60));
  const se = currentSeason();
  const wx = { rain: '🌧️', snow: '🌨️', storm: '⛈️', heatwave: '🥵' }[FX.weather] || '';
  $('tDate').textContent = weekdayName().slice(0, 3) + ' · Day ' + gameDay() + ' · ' + se.icon + ' ' + se.name + (wx ? ' ' + wx : '') + (specialWeekend() ? ' ' + specialWeekend().icon : '');
  $('tScore').textContent = S.p5.score.cur;
  $('tEcon').textContent = econPhase().icon;
  $('tCity').textContent = S.city.name;
  $('tLevel').textContent = 'LV ' + cityLevel() + ' · ' + cityLevelName().toUpperCase() + (S.city.sandbox ? ' · SANDBOX' : '');
}

function openPanel(name, tab) {
  if (UI.panel === name && !tab) { closeLeft(); return; }
  UI.panel = name;
  if (tab) UI.tabs[name] = tab;
  $('leftPanel').classList.add('open');
  document.body.classList.add('leftOpen');
  document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.panel === name); });
  $('lpBody').scrollTop = 0;
  renderLeft(true);
  sfx('click');
  if (PANEL_TIPS[name]) firstTime('panel_' + name, PANEL_TIPS[name][0], PANEL_TIPS[name][1]);
}
function closeLeft() {
  UI.panel = null;
  $('leftPanel').classList.remove('open');
  document.body.classList.remove('leftOpen');
  document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.remove('on'); });
}
function uiBusy() { return performance.now() < UI.busyUntil; }
function renderLeft(force) {
  if (!UI.panel) return;
  if (!force && uiBusy()) return;
  if (!force && document.activeElement && document.activeElement.id === 'buildSearch') return;
  const body = $('lpBody');
  const st = body.scrollTop;
  const tabsEl = $('lpTabs');
  let title = '', tabs = [], html = '';
  const p = UI.panel;
  if (p === 'build') { title = '🏗️ Build'; tabs = CATEGORIES.map(function (c) { return [c.id, c.icon + ' ' + (c.id === 'Science' ? 'Science & Edu' : c.id)]; }); html = renderBuildPanel(); }
  else if (p === 'city') { title = '🏙️ ' + esc(S.city.name) + ' — Lv ' + cityLevel(); tabs = [['overview', '📊 Overview'], ['score', '🏆 Score & Rank'], ['economy', '💹 Economy'], ['housing', '🏘️ Housing & Edu'], ['jobs', '💼 Jobs'], ['resources', '⛏️ Supply chain'], ['transit', '🚇 Transit'], ['services', '🚒 Services'], ['mega', '🌆 Megacity'], ['land', '🗺️ Land'], ['prestige', '🏛️ Legacy']]; html = renderCityPanel(); }
  else if (p === 'companies') { title = '🏢 Companies & Finance'; tabs = [['companies', '🏢 Companies'], ['market', '📊 Market & Ads'], ['invest', '💼 Invest & Startups'], ['directory', '🏛️ Directory & Stocks'], ['contracts', '🤝 Contracts'], ['stocks', '📈 Stocks'], ['bank', '🏦 Bank']]; html = renderCompaniesPanel(); }
  else if (p === 'research') { title = '🔬 Research'; tabs = [['tree', '🔬 Tech Tree'], ['space', '🚀 Space Program']]; html = renderResearchPanel(); }
  else if (p === 'world') { title = '🌍 World'; tabs = [['diplomacy', '🕊️ Diplomacy'], ['trade', '🚢 Trade'], ['map', '🗺️ World Map']]; html = renderWorldPanel(); }
  if (!UI.tabs[p] && tabs.length) UI.tabs[p] = tabs[0][0];
  $('lpTitle').textContent = title;
  tabsEl.innerHTML = tabs.map(function (t) { return '<button class="tab ' + (UI.tabs[p] === t[0] ? 'on' : '') + '" data-act="ptab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('');
  tabsEl.style.display = tabs.length ? 'flex' : 'none';
  body.innerHTML = html;
  body.scrollTop = st;
  drawPanelCharts();
  if (UI.highlight) { const el = body.querySelector('[data-id="' + UI.highlight + '"]'); if (el && force) el.scrollIntoView({ block: 'center' }); }
}

function buildStatLine(d) {
  const s = [];
  if (d.housing) s.push('🏠 ' + d.housing);
  if (d.rev) s.push('💵 $' + d.rev + '/s');
  if (d.cap && d.sector !== 'NONE') s.push('cap ' + fmt(d.cap));
  if (d.goods) s.push('📦 ' + d.goods + '/s');
  if (d.workers) s.push('👷 ' + d.workers);
  if (d.power > 0) s.push('⚡ +' + fmt(d.power)); else if (d.power < 0) s.push('⚡ ' + d.power);
  if (d.water > 0) s.push('💧 +' + fmt(d.water)); else if (d.water < 0) s.push('💧 ' + d.water);
  if (d.pol > 0) s.push('🏭 +' + d.pol); else if (d.pol < 0) s.push('🍃 ' + d.pol);
  if (d.cover) s.push('📡 ' + Math.round(d.cover * TILE_METERS) + 'm');
  if (d.transit) s.push('🚌 ' + fmt(d.transit));
  if (d.tour) s.push('🧳 ' + fmt(d.tour));
  if (d.rp) s.push('🔬 ' + d.rp + '/s');
  if (d.hap) s.push('😊 +' + d.hap);
  return s.join(' · ');
}
function renderBuildPanel() {
  return '<div class="buildSearch"><input id="buildSearch" placeholder="🔍 Search buildings (e.g. factory, park, power)…" value="' + esc(UI.buildSearch || '') + '" autocomplete="off"></div><div id="buildGridWrap">' + buildGridHtml() + '</div>';
}
function buildGridHtml() {
  const cat = UI.tabs.build, q = (UI.buildSearch || '').trim().toLowerCase();
  const match = function (d) { return (d.name + ' ' + d.id + ' ' + d.cat + ' ' + (d.sector || '') + ' ' + (d.desc || '')).toLowerCase().indexOf(q) >= 0; };
  const list = BUILDING_LIST.filter(function (d) { return !d.hidden && (q ? match(d) : d.cat === cat); });
  let html = q ? '<p class="small" style="margin-bottom:6px">' + list.length + ' result' + (list.length === 1 ? '' : 's') + ' for “' + esc(q) + '” in all categories</p>' : '';
  html += '<div class="buildGrid">';
  list.forEach(function (d) {
    const st = unlockStatus(d);
    const cost = buildCost(d), payer = payerFor(d);
    const poor = funds(payer) < cost;
    const ban = S.p5 && challengeBans(d);
    const cls = 'bcard' + (!st.ok || ban ? ' locked' : '') + (st.ok && poor ? ' poor' : '') + (UI.highlight === d.id ? ' highlight' : '');
    html += '<button class="' + cls + '" data-act="pickBuild" data-id="' + d.id + '">' +
      '<span class="sz">' + d.w + '×' + d.h + (d.public ? ' 🏛️' : '') + '</span><span class="bi">' + d.icon + '</span><span class="bn">' + d.name + '</span>' +
      '<span class="bc">' + (ban ? '🚫 Challenge ban' : st.ok ? money(cost) : '🔒 ' + esc(st.reason)) + '</span>' +
      '<span class="bs">' + buildStatLine(d) + '</span></button>';
  });
  if (!list.length) html += '<p class="small">No buildings match.</p>';
  html += '</div><p class="small" style="margin-top:10px">🏛️ = public building paid from the <b>city budget</b>; others use your money. Buildings need a road next to them. Zoned tiles only accept matching building types. Hover a card for full details' +
    (cat === 'Resources' && !q ? '. Mines must touch a matching deposit — turn on the 🗂️ Resources layer.' : '') + '.</p>';
  return html;
}

function kpi(k, v, cls) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>'; }
function barRow(label, val, max, color, right) {
  const w = clamp(val / Math.max(1e-9, max) * 100, 0, 100);
  return '<div style="margin:6px 0"><div class="between small"><span>' + label + '</span><span>' + (right || '') + '</span></div><div class="bar"><i style="width:' + w + '%;background:' + color + '"></i></div></div>';
}
function renderCityPanel() {
  const t = UI.tabs.city, c = S.city;
  let h = '';
  if (t === 'overview') {
    h += '<div class="card between"><div><h3>🏛️ ' + esc(c.name) + '</h3><p>Level ' + cityLevel() + '/20 · ' + cityLevelName() + ' · ' + DIFFICULTIES[c.difficulty].name + ' · ' + seedLabel() + (c.sandbox ? ' · Sandbox' : '') + '<br>🏆 Score <b>' + S.p5.score.cur + '</b> · ' + scoreTitle() + (S.p5.identity.id ? ' · ' + IDENTITIES[S.p5.identity.id].icon + ' ' + IDENTITIES[S.p5.identity.id].name : '') + '</p></div><button class="btn small blue" data-act="cityhall">🏛️ City Hall</button></div>';
    h += '<div class="grid3">' +
      kpi('👥 POPULATION', fmt(Math.floor(c.population)) + ' / ' + fmt(Math.floor(SIM.housingCap))) +
      kpi('😊 HAPPINESS', pct(c.happiness), c.happiness >= 55 ? 'pos' : 'neg') +
      kpi('⭐ REPUTATION', Math.round(c.reputation), c.reputation >= 50 ? 'pos' : 'neg') +
      kpi('🚨 CRIME', Math.round(c.crime), c.crime < 30 ? 'pos' : 'neg') +
      kpi('🏭 POLLUTION', Math.round(c.pollution), c.pollution < 30 ? 'pos' : 'neg') +
      kpi('💼 EMPLOYMENT', pct((1 - SIM.unemployment) * 100), SIM.unemployment < 0.1 ? 'pos' : 'neg') +
      kpi('🚗 TRAFFIC', Math.round(SIM.traffic), SIM.traffic < 50 ? 'pos' : 'neg') +
      kpi('⚡ POWER', fmt(SIM.powerGen) + '/' + fmt(SIM.powerUse), SIM.powerRatio >= 1 ? 'pos' : 'neg') +
      kpi('💧 WATER', fmt(SIM.waterGen) + '/' + fmt(SIM.waterUse), SIM.waterRatio >= 1 ? 'pos' : 'neg') +
      kpi('🎓 EDUCATION', Math.round(c.education) + ' (skill ' + Math.round(c.skill) + ')', c.education >= 40 ? 'pos' : 'neg') +
      kpi('♻️ WASTE', fmt(c.waste) + ' backlog', SIM.wastePenalty < 0.2 ? 'pos' : 'neg') +
      kpi('🧳 TOURISM', c.tourismUnlocked ? fmt(Math.floor(c.tourists)) : '🔒') +
      kpi('💰 PLAYER/min', signMoney((SIM.pNet || 0) * 60), (SIM.pNet || 0) >= 0 ? 'pos' : 'neg') +
      kpi('🏛️ BUDGET/min', signMoney((SIM.bNet || 0) * 60), (SIM.bNet || 0) >= 0 ? 'pos' : 'neg') +
      kpi('📈 CITY NET/min', signMoney(SIM.net * 60), SIM.net >= 0 ? 'pos' : 'neg') + '</div>';
    h += '<div class="secTitle">📈 Population</div><canvas class="chart" data-chart="pop" data-color="#4cc9f0"></canvas>';
    h += '<div class="secTitle">📈 Revenue ($/s)</div><canvas class="chart" data-chart="rev" data-color="#06d6a0"></canvas>';
    h += '<div class="grid2"><div><div class="secTitle">📉 Crime</div><canvas class="chart" data-chart="crime" data-color="#ef476f" style="height:90px"></canvas></div>' +
      '<div><div class="secTitle">📉 Pollution</div><canvas class="chart" data-chart="pol" data-color="#f8961e" style="height:90px"></canvas></div></div>';
    h += '<div class="secTitle">📊 Employment %</div><canvas class="chart" data-chart="emp" data-color="#9b5de5" style="height:90px"></canvas>';
    h += '<div class="secTitle">😊 Happiness factors (target ' + Math.round(SIM.hapTarget || 0) + '%)</div><div class="card">' +
      SIM.hapFactors.map(function (f) { return '<div class="between small"><span>' + f[0] + '</span><b class="' + (f[1] >= 0 ? 'pos' : 'neg') + '">' + (f[1] >= 0 ? '+' : '') + f[1].toFixed(1) + '</b></div>'; }).join('') + '</div>';
  } else if (t === 'score') {
    h += renderScoreTab() + renderAreaRanks();
  } else if (t === 'jobs') {
    h += renderJobsTab();
  } else if (t === 'transit') {
    h += renderTransitTab();
  } else if (t === 'mega') {
    h += renderMegaTab();
  } else if (t === 'economy') {
    h += renderEconCycleCard() + renderInflationCard();
    const line = function (l, v, neg) { return '<div class="between small" style="padding:2px 0"><span>' + l + '</span><b class="' + (neg ? 'neg' : 'pos') + '">' + (neg ? '-' : '+') + money((v || 0) * 60) + '</b></div>'; };
    const P = SIM.P || {}, PE = SIM.PE || {}, B = SIM.B || {}, BE = SIM.BE || {};
    h += '<div class="card"><h3>💰 PLAYER MONEY <span class="tag">per minute</span></h3><p>Your companies: business sales, products, rent. Pays salaries, taxes and utility bills.</p>' +
      '<div class="between" style="font-size:15px;margin:6px 0"><span>Revenue</span><b class="pos">+' + money((SIM.pInc || 0) * 60) + '</b></div>' +
      line('Business sales', P.business) + line('Product sales (supply chain)', P.products) + line('Rent', P.rent) + line('Tourism', P.tourism) + line('Taxi fares', P.transport) + line('Fuel retail', P.fuel) +
      '<div class="between" style="font-size:15px;margin:8px 0 4px"><span>Expenses</span><b class="neg">-' + money((SIM.pExp || 0) * 60) + '</b></div>' +
      line('Employee salaries', PE.salaries, true) + line('Maintenance', PE.maintenance, true) + line('Electricity & water bills', PE.bills, true) + line('Business & property tax', PE.taxes, true) + line('Inputs & imports', PE.imports, true) + line('Loan payments', PE.loans, true) + line('Dividends', PE.dividends, true) +
      '<div class="between" style="font-size:16px;margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><span>NET</span><b class="' + ((SIM.pNet || 0) >= 0 ? 'pos' : 'neg') + '">' + signMoney((SIM.pNet || 0) * 60) + '</b></div></div>';
    h += '<div class="card"><h3>🏛️ CITY BUDGET <span class="tag">per minute</span></h3><p>Taxes & fees fund police, fire, hospitals, roads, education and public transport.</p>' +
      '<div class="between" style="font-size:15px;margin:6px 0"><span>Income</span><b class="pos">+' + money((SIM.bInc || 0) * 60) + '</b></div>' +
      line('Income tax', B.incomeTax) + line('Business tax', B.businessTax) + line('Property tax', B.propertyTax) + line('Utility fees', B.utilities) + line('Public transport fares', B.fares) + line('Tourism & tourist tax', B.tourism) + line('Public housing rent', B.rent) + line('Energy exports', B.energy) + (B.grant ? line('State grant (small towns)', B.grant) : '') + (B.space ? line('Moon mining', B.space) : '') +
      '<div class="between" style="font-size:15px;margin:8px 0 4px"><span>Spending</span><b class="neg">-' + money((SIM.bExp || 0) * 60) + '</b></div>' +
      line('Public salaries (police, fire, health, education, transport)', BE.salaries, true) + line('Public maintenance', BE.maintenance, true) + line('Power plant fuel', BE.fuel, true) + line('Road maintenance', BE.roads, true) +
      '<div class="between" style="font-size:16px;margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><span>BUDGET NET</span><b class="' + ((SIM.bNet || 0) >= 0 ? 'pos' : 'neg') + '">' + signMoney((SIM.bNet || 0) * 60) + '</b></div>' +
      '<div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small" data-act="transfer" data-v="0.1">Transfer 10% of money →🏛️</button><button class="btn small" data-act="transfer" data-v="0.5">Transfer 50% →🏛️</button></div></div>';
    h += '<div class="card"><h3>🧾 City Tax: <span id="taxVal">' + c.tax + '%</span></h3>' +
      '<input type="range" min="0" max="' + MAX_TAX + '" step="1" value="' + c.tax + '" data-input="tax">' +
      '<p>Higher tax → more budget income, but lower happiness, business &amp; population growth. Above 22% with unhappy citizens, people leave.</p></div>';
    h += '<div class="card"><h3>👷 Salary Policy</h3><div class="row">' + ['low', 'normal', 'high'].map(function (p) { return '<button class="btn small ' + (S.workers.salaryPolicy === p ? 'gold' : '') + '" data-act="policy" data-v="' + p + '">' + ({ low: 'Low (-20% pay)', normal: 'Normal', high: 'High (+25% pay)' })[p] + '</button>'; }).join('') + '</div><p style="margin-top:6px">Low: cheaper, -10% efficiency, -5 happiness. High: +10% efficiency, +5 happiness.</p></div>';
    h += '<div class="secTitle">📊 Supply &amp; Demand (real-time)</div><div class="card">';
    SECTORS.forEach(function (s) {
      const d = SIM.dDisp[s] || 0, sp = SIM.sDisp[s] || 0, sm = SIM.saleMult[s] || 1;
      const status = d > sp + 5 ? '<span class="tag g">PROFIT ↑</span>' : sp > d + 5 ? '<span class="tag r">PROFIT ↓</span>' : '<span class="tag">BALANCED</span>';
      h += '<div style="margin:7px 0"><div class="between small"><b style="color:var(--text)">' + SECTOR_ICONS[s] + ' ' + s + '</b>' + status + '</div>' +
        '<div class="between small"><span>Demand ' + Math.round(d) + '</span><span>Supply ' + Math.round(sp) + ' · ×' + sm.toFixed(2) + '</span></div>' +
        '<div class="bar" style="margin-top:2px"><i style="width:' + d + '%;background:#4cc9f0"></i></div><div class="bar" style="margin-top:2px"><i style="width:' + sp + '%;background:#ffd166"></i></div></div>';
    });
    h += '<p class="small">Blue = demand, gold = supply.</p></div>';
  } else if (t === 'housing') {
    h += '<div class="card"><h3>🏘️ Housing Market</h3>' +
      '<div class="between small"><span>Price index</span><b>×' + c.housingPrice.toFixed(2) + '</b></div>' +
      barRow('Housing satisfaction', SIM.housingSat || 0, 100, (SIM.housingSat || 0) > 60 ? '#06d6a0' : '#ef476f', Math.round(SIM.housingSat || 0) + '%') +
      '<div class="between small"><span>Affordable share of homes</span><b>' + pct((SIM.affordableShare || 0) * 100) + '</b></div>' +
      '<div class="between small"><span>Occupancy</span><b>' + fmt(Math.floor(c.population)) + ' / ' + fmt(Math.floor(SIM.housingCap)) + '</b></div>' +
      '<div class="secTitle">Rents (per unit / month)</div>';
    BUILDING_LIST.filter(function (d) { return d.housing; }).forEach(function (d) {
      h += '<div class="between small" style="padding:2px 0"><span>' + d.icon + ' ' + d.name + ' <span class="tag">Q' + d.quality + '</span></span><b>' + money(d.rent * d.unitSize * SECONDS_PER_MONTH * c.housingPrice) + '/mo · cap ' + fmt(d.housing) + '</b></div>';
    });
    h += '<p>Expensive housing lowers satisfaction. Keep ~35% affordable homes (quality ≤ 50) or build Affordable Housing.</p></div>';
    if (!MAP.districts.length) computeDistricts();
    const cnt = [0, 0, 0, 0]; MAP.districts.forEach(function (d) { if (d.built) cnt[d.level]++; });
    h += '<div class="card"><h3>🏙️ District Density</h3><div class="grid2">' + DENSITY_NAMES.map(function (n, i) { return kpi(n.toUpperCase(), cnt[i] + ' districts'); }).join('') + '</div>' +
      '<p style="margin-top:6px">Developers build taller buildings in denser districts: Low → houses, Medium → apartments, High → condos, Mega → skyscrapers.</p><button class="btn small blue" data-act="overlaySet" data-v="' + OVERLAYS.indexOf('DENSITY') + '">Show density overlay</button></div>';
    h += '<div class="card"><h3>🎓 Education & Worker Skill</h3>' +
      barRow('Education', c.education, 100, '#4cc9f0', Math.round(c.education)) +
      barRow('Average worker skill', c.skill, 100, '#ffd166', Math.round(c.skill)) +
      '<div class="between small"><span>School seats / children</span><b>' + fmt(SIM.schoolSeats || 0) + ' / ' + fmt(SIM.children || 0) + '</b></div>' +
      '<div class="between small"><span>University & research seats</span><b>' + fmt(SIM.uniSeats || 0) + '</b></div>' +
      '<div class="between small"><span>Production efficiency from skill</span><b>×' + (0.85 + c.skill * 0.003).toFixed(2) + '</b></div>' +
      '<div class="between small"><span>Research speed from education</span><b>×' + (1 + c.education / 200).toFixed(2) + '</b></div>' +
      '<p>Education raises worker skill, research speed and company growth.</p></div>';
  } else if (t === 'resources') {
    h += renderSupplyCard() + renderProductsTable();
    const R = SIM.sc || { prod: {}, dem: {}, fr: {}, imp: {}, exp: {} };
    const chain = [['⛏️ Mine', S.buildings.list.some(function (b) { return bdef(b).extract && b._op; })], ['🪨 Raw', PRODUCT_IDS.some(function (p) { return PRODUCTS[p].raw && (S.economy.inventory[p] > 1 || R.imp[p] > 0); })],
      ['🏭 Factory', MAP.lists.factories.some(function (b) { return b._op && !bdef(b).noInputs; })], ['📦 Warehouse', MAP.lists.warehouses.some(function (b) { return b._op; })],
      ['🚚 Truck', (SIM.logisticsRatio || 1) >= 0.95], ['🛒 Shop', MAP.lists.shops.some(function (b) { return b._op; })], ['🧑 Customer', (SIM.goodsRatio || 1) >= 0.9]];
    h += '<div class="card"><h3>🔗 Supply Chain</h3><div class="row" style="flex-wrap:wrap;gap:4px">' + chain.map(function (x, i) { return '<span class="tag ' + (x[1] ? 'g' : 'r') + '">' + x[0] + '</span>' + (i < chain.length - 1 ? '→' : ''); }).join('') + '</div><p style="margin-top:6px">Red links are broken or missing — the economy suffers (imports cost more, shops run short).</p></div>';
    h += '<div class="card"><h3>📦 Storage & Logistics</h3>' + barRow('Warehouse storage', SIM.storageUsed || 0, SIM.storageCap || 1, (SIM.storageUsed || 0) / (SIM.storageCap || 1) > 0.9 ? '#ef476f' : '#06d6a0', fmt(SIM.storageUsed || 0) + ' / ' + fmt(SIM.storageCap || 0)) +
      '<div class="between small"><span>Trucks</span><b>' + Math.round(SIM.trucks || 0) + ' (cap 25 each)</b></div>' +
      '<div class="between small"><span>Logistics capacity</span><b>' + (SIM.logisticsCap || 0).toFixed(1) + ' units/s</b></div>' +
      '<div class="between small"><span>Deliveries fulfilled</span><b class="' + ((SIM.logisticsRatio || 1) >= 0.95 ? 'pos' : 'neg') + '">' + pct((SIM.logisticsRatio || 1) * 100) + '</b></div><p>Full storage slows production. Warehouses add capacity and trucks.</p></div>';
    h += '<div class="secTitle">Products & inventory</div><div class="card">';
    PRODUCT_IDS.forEach(function (p) {
      const P = PRODUCTS[p];
      h += '<div class="between small" style="padding:3px 0;border-bottom:1px solid var(--line)"><span>' + P.icon + ' <b style="color:var(--text)">' + P.name + '</b> ' + fmt(S.economy.inventory[p]) + '</span><span>$' + S.economy.prices[p].toFixed(2) + ' · +' + (R.prod[p] || 0).toFixed(1) + ' / -' + (R.dem[p] || 0).toFixed(1) + '/s' + (R.dem[p] > 0 ? ' · <b class="' + ((R.fr[p] || 1) >= 0.95 ? 'pos' : 'neg') + '">' + pct((R.fr[p] || 0) * 100) + '</b>' : '') + '</span></div>';
    });
    h += '<p style="margin-top:6px">Production / demand per second, and % of demand fulfilled. Prices follow supply &amp; demand.</p></div>';
    h += '<div class="secTitle">⛏️ Natural resources</div><div class="card">';
    if (!S.economy.deposits.length) h += '<p>No deposits on this map.</p>';
    S.economy.deposits.forEach(function (dep, i) {
      const R2 = RESOURCE_TYPES[dep.type];
      h += barRow(R2.icon + ' ' + R2.name + ' #' + (i + 1) + (R2.regen ? ' (renewable)' : ''), dep.amount, dep.max, dep.amount / dep.max > 0.3 ? '#06d6a0' : '#ef476f', fmt(dep.amount) + ' / ' + fmt(dep.max));
    });
    h += '<p>Deposits are finite. Recycling, renewables and imports reduce dependency.</p><button class="btn small" data-act="layer" data-k="resources">Toggle resources layer</button></div>';
    h += '<div class="card"><h3>⛽ Fuel & Electric Vehicles</h3>' +
      '<div class="between small"><span>Fuel demand</span><b>' + (SIM.fuelDemand || 0).toFixed(1) + '/s</b></div>' +
      '<div class="between small"><span>Gas station capacity</span><b>' + (SIM.gasCap || 0).toFixed(1) + '/s</b></div>' +
      barRow('Fuel availability', SIM.fuelRatio === undefined ? 1 : SIM.fuelRatio, 1, (SIM.fuelRatio || 0) > 0.8 ? '#06d6a0' : '#ef476f', pct((SIM.fuelRatio === undefined ? 1 : SIM.fuelRatio) * 100)) +
      '<div class="between small"><span>Electric vehicles</span><b>' + pct((SIM.evShare || 0) * 100) + (hasTech('t_ev') ? '' : ' (research Electric Vehicles)') + '</b></div><p>Gasoline & diesel come from Refineries or imports. EVs pollute less, need less maintenance but draw electricity.</p></div>';
    h += '<div class="card"><h3>🗑️ Waste</h3><div class="between small"><span>Waste produced</span><b>' + (SIM.wasteGen || 0).toFixed(1) + '/s</b></div>' +
      '<div class="between small"><span>Processing capacity</span><b>' + (SIM.wasteCap || 0).toFixed(1) + '/s</b></div>' +
      '<div class="between small"><span>Recycled into materials</span><b>' + ((SIM.recycled || 0) * 0.4).toFixed(1) + '/s</b></div>' +
      barRow('Unmanaged waste', SIM.wastePenalty || 0, 1, (SIM.wastePenalty || 0) < 0.2 ? '#06d6a0' : '#ef476f', fmt(c.waste)) + '<p>Uncollected waste raises pollution and lowers happiness.</p></div>';
  } else if (t === 'services') {
    h += '<div class="card"><h3>🚒 Emergency Services Coverage</h3>' +
      barRow('🚒 Fire', SIM.cov.fire, 1, '#ef476f', pct(SIM.cov.fire * 100)) +
      barRow('🚓 Police', SIM.cov.police, 1, '#4361ee', pct(SIM.cov.police * 100)) +
      barRow('🏥 Health', SIM.cov.health, 1, '#06d6a0', pct(SIM.cov.health * 100)) +
      '<p>Buildings outside coverage have higher fire risk, crime and disaster damage. Mitigation: ' + pct(disasterMitigation() * 100) + '</p>' +
      '<div class="row" style="margin-top:6px;flex-wrap:wrap">' + OVERLAYS.map(function (o, i) { return '<button class="btn small ' + (UI.overlay === i ? 'blue' : '') + '" data-act="overlaySet" data-v="' + i + '">' + o + '</button>'; }).join('') + '</div></div>';
    h += '<div class="card"><h3>⚡ Electricity</h3>' + barRow('Generation vs. demand', SIM.powerGen, Math.max(SIM.powerGen, SIM.powerUse, 1), SIM.powerRatio >= 1 ? '#06d6a0' : '#ef476f', fmt(SIM.powerGen) + ' / ' + fmt(SIM.powerUse)) +
      '<p>Season ×' + currentSeason().power.toFixed(2) + (FX.weather === 'heatwave' ? ' · Heatwave: demand +25%' : '') + (FX.weather === 'storm' ? ' · Storm: production -15%' : '') + '. Low-priority buildings shut down first during shortages.</p></div>';
    h += '<div class="card"><h3>💧 Water</h3>' + barRow('Supply vs. demand', SIM.waterGen, Math.max(SIM.waterGen, SIM.waterUse, 1), SIM.waterRatio >= 1 ? '#06d6a0' : '#ef476f', fmt(SIM.waterGen) + ' / ' + fmt(SIM.waterUse)) + '</div>';
    h += '<div class="card"><h3>🚌 Transport</h3>' +
      '<div class="between small"><span>Trips demand</span><b>' + fmt(SIM.trips || 0) + '</b></div>' +
      '<div class="between small"><span>Transit capacity / riders</span><b>' + fmt(SIM.transitCap) + ' / ' + fmt(SIM.riders) + '</b></div>' +
      '<div class="between small"><span>Car trips</span><b>' + fmt(SIM.carTrips || 0) + '</b></div>' +
      '<div class="between small"><span>Weather impact on traffic</span><b>×' + ((SIM.weatherFx && SIM.weatherFx.traffic) || 1).toFixed(2) + '</b></div>' +
      barRow('🚗 Traffic congestion', SIM.traffic, 100, SIM.traffic < 50 ? '#06d6a0' : '#ef476f', Math.round(SIM.traffic)) + '</div>';
  } else if (t === 'land') {
    const maxE = maxExpansionFor(MAP.W), r = unlockedRect();
    h += '<div class="card"><h3>🗺️ Land Expansion</h3><p>Map: ' + MAP.W + '×' + MAP.H + ' grid. Unlocked: ' + (r.x1 - r.x0 + 1) + '×' + (r.y1 - r.y0 + 1) + '. Paid from the city budget.</p>';
    for (let i = 1; i <= maxE; i++) {
      const done = S.city.expansion >= i, next = S.city.expansion + 1 === i, sz = expSizes()[i];
      h += '<div class="between" style="padding:8px 0;border-top:1px solid var(--line)"><span>Region ' + i + ' — ' + sz + '×' + sz + (i === 3 ? ' <span class="tag b">Airport zone</span>' : '') + '</span>' +
        (done ? '<span class="tag g">OWNED</span>' : next ? '<button class="btn small gold ' + (S.budget < expansionCost() ? 'dis' : '') + '" data-act="expand">Buy ' + money(expansionCost()) + ' 🏛️</button>' : '<span class="tag">LOCKED</span>') + '</div>';
    }
    h += '</div><div class="card"><h3>🟩 Zoning</h3><p>' + zonedTiles() + ' tiles zoned (' + zonedEmptyTiles() + ' empty). Paint zones with the 🟩 tool: AI developers and companies build there automatically when demand is high.</p><button class="btn small green" data-act="tool" data-v="zone">Open zone tool</button></div>';
  } else if (t === 'prestige') {
    h += '<div class="card" style="text-align:center"><div style="font-size:32px">🏛️</div><h3 style="justify-content:center">' + fmt(S.meta.pp) + ' Legacy Points</h3><p>City Legacies: ' + S.meta.prestigeCount + ' · New Game+ level: ' + S.meta.ngLevel + (S.meta.crown ? ' · 👑 Crown' : '') + '</p></div>';
    h += '<div class="secTitle">🌳 Legacy Tree</div><div class="techCols">';
    LEGACY_CATS.forEach(function (cat) {
      h += '<div class="techCol"><h4>' + cat + '</h4>';
      PRESTIGE_UPGRADES.filter(function (u) { return u.cat === cat; }).forEach(function (u, i) {
        const l = ppLevel(u.id), max = l >= u.max, locked = u.req && ppLevel(u.req) < 1, cost = legacyCost(u);
        if (i) h += '<div class="tarrow">↓</div>';
        h += '<div class="tnode ' + (max ? 'done' : locked ? 'locked' : 'avail') + '"><div class="tn">' + u.icon + ' ' + u.name + ' <span class="tag">' + l + '/' + u.max + '</span></div><div class="td">' + u.desc + '</div>' +
          (max ? '<span class="tag g">MAX</span>' : '<button class="btn small ' + (locked || S.meta.pp < cost ? 'dis' : 'gold') + '" data-act="ppbuy" data-id="' + u.id + '">' + cost + ' LP</button>') + '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="card"><h3>🏛️ City Legacy</h3><p>Reset your city (same name, difficulty and map size, new seed) and earn Legacy Points. Keeps the Legacy Tree, achievements and meta progress. Requires 10,000 peak population or $25M revenue this run.</p>' +
      '<div class="between" style="margin-top:8px"><span>Gain: <b class="pos">+' + prestigeGain(false) + ' LP</b></span><button class="btn gold ' + (canPrestige() ? '' : 'dis') + '" data-act="prestige">Create Legacy</button></div></div>';
    h += '<div class="card"><h3>♾️ New Game+</h3><p>Unlocked by completing the story missions. Bigger map, neon skin, Hyperloop &amp; Quantum Architecture tech, the Quantum Spire, new achievements and a harder economy. Grants 1.5× LP.</p>' +
      '<div class="between" style="margin-top:8px"><span>Gain: <b class="pos">+' + prestigeGain(true) + ' LP</b></span><button class="btn blue ' + (canNewGamePlus() ? '' : 'dis') + '" data-act="ngplus">Start NG+ ' + (S.meta.ngLevel + 1) + '</button></div></div>';
  }
  return h;
}

function renderCompaniesPanel() {
  const t = UI.tabs.companies;
  let h = '';
  if (t === 'companies') {
    h += '<div class="secTitle">Your companies</div>';
    COMPANY_DEFS.forEach(function (cd) {
      const c = S.companies.list[cd.id];
      if (!c) {
        const cost = Math.round(cd.cost * costMult());
        h += '<div class="card"><h3>' + cd.icon + ' ' + cd.name + '</h3><p>Owns all your ' + cd.sectors.join('/') + ' buildings. Levels up with profit, unlocks products, an exclusive building at Lv3 and more revenue.</p>' +
          '<div class="between" style="margin-top:8px"><span class="tag">Not founded</span><button class="btn gold small ' + (S.money < cost ? 'dis' : '') + '" data-act="found" data-id="' + cd.id + '">Found for ' + money(cost) + '</button></div></div>';
        return;
      }
      const cs = SIM.companies[cd.id] || { rev: 0, cost: 0, profit: 0, emp: 0, count: 0 };
      const next = c.level < 10 ? companyXpFor(c.level + 1) : c.xp, prev = companyXpFor(c.level);
      const prog = c.level < 10 ? (c.xp - prev) / (next - prev) : 1;
      h += '<div class="card" style="border-left:4px solid ' + cd.color + '"><h3>' + cd.icon + ' ' + cd.name + ' <span class="tag y">Lv ' + c.level + ' · ' + companyTitle(c.level) + '</span></h3>' +
        '<div class="bar" style="margin:6px 0"><i style="width:' + (prog * 100) + '%;background:' + cd.color + '"></i></div>' +
        '<div class="grid2">' + kpi('REVENUE/s', money(cs.rev, 1), 'pos') + kpi('PROFIT/s', signMoney(cs.profit), cs.profit >= 0 ? 'pos' : 'neg') + kpi('EMPLOYEES', fmt(Math.round(cs.emp))) + kpi('COMPANY VALUE', money(c.price * SHARES_TOTAL)) + '</div>' +
        '<p style="margin-top:6px">Buildings: ' + cs.count + ' · Ownership: <b>' + Math.round(c.own * 100) + '%</b> · Revenue bonus ×' + companyRevMult(cd.id).toFixed(2) + '</p><div class="secTitle" style="margin-top:8px">Products</div>';
      cd.products.forEach(function (pn, k) {
        const launched = c.products > k, can = c.products === k;
        h += '<div class="between small" style="padding:3px 0"><span>' + (launched ? '✅' : '📦') + ' ' + pn + ' <span class="tag">Lv' + PRODUCT_LEVELS[k] + '</span></span>' +
          (launched ? '<span class="tag g">+' + (k === 3 ? 20 : 10) + '%</span>' : can ? '<button class="btn small ' + (c.level < PRODUCT_LEVELS[k] || S.money < productCost(cd, k) ? 'dis' : 'green') + '" data-act="product" data-id="' + cd.id + '">Launch ' + money(productCost(cd, k)) + '</button>' : '<span class="tag">🔒</span>') + '</div>';
      });
      h += '<p style="margin-top:6px">🏗️ Exclusive: <b>' + BUILDINGS[cd.exclusive].name + '</b> ' + (c.level >= 3 ? '<span class="tag g">UNLOCKED</span>' : '<span class="tag">Lv3</span>') + '</p>' + renderLinesCard(cd.id) + '</div>';
    });
    h += '<div class="secTitle">🤖 AI companies</div>';
    AI_DEFS.forEach(function (a) {
      const st = S.ai[a.id];
      h += '<div class="card" style="border-left:4px solid ' + a.color + ';' + (st.acquired ? 'opacity:.55' : '') + '"><div class="between"><b>' + a.icon + ' ' + a.name + '</b><span class="tag">' + (a.kind === 'dev' ? 'Developer' : 'Rival · ' + a.sectors.join('/')) + '</span></div>' +
        (st.acquired ? '<p>Acquired by you.</p>' : '<p>Lv ' + st.level + ' · Cash ' + money(st.cash) + ' · ' + (st.count || 0) + ' buildings · Profit ' + signMoney(st.profit || 0) + '/s · Quality ' + st.quality.toFixed(2) + ' · Price ×' + st.price.toFixed(2) + (st.adUntil > S.clock.runSec ? ' · 📣 advertising' : '') + '</p>' +
          '<div class="row" style="margin-top:6px"><button class="btn small ' + (S.money < aiValue(a.id) ? 'dis' : 'red') + '" data-act="acquire" data-id="' + a.id + '">Acquire for ' + money(aiValue(a.id)) + '</button></div>') + '</div>';
    });
  } else if (t === 'market') {
    h += renderAdHistory();
    h += '<div class="card"><h3>📊 Market Share</h3><p>Share depends on <b>price</b>, <b>quality</b> (company level, products, worker skill), <b>location</b> (land value), <b>reputation</b> and <b>advertising</b>. Your market reputation: ' + Math.round(S.market.rep) + '.</p></div>';
    MARKET_SECTORS.forEach(function (s) {
      const sh = marketShares(s);
      h += '<div class="card"><div class="between"><h3>' + (SECTOR_ICONS[s] || '') + ' ' + s + '</h3>' + (S.p5.ads.live[s] && S.p5.ads.live[s].until > S.clock.runSec ? '<span class="tag g">' + AD_TIERS[S.p5.ads.live[s].tier].icon + ' ' + S.p5.ads.live[s].tier + ' LIVE</span>' : '') + '</div>' + shareBars(sh);
      if (s !== 'HOUSING') {
        h += '<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:4px"><span class="small">Your price:</span>' + [0.8, 1, 1.2, 1.4].map(function (v) { return '<button class="btn small ' + (S.market.price[s] === v ? 'gold' : '') + '" data-act="mprice" data-id="' + s + '" data-v="' + v + '">' + ({ 0.8: 'Budget', 1: 'Normal', 1.2: 'Premium', 1.4: 'Luxury' })[v] + '</button>'; }).join('') +
          '</div>' + renderAdsCard(s);
      }
      h += '</div>';
    });
  } else if (t === 'invest') {
    h += renderInvestTab();
  } else if (t === 'directory') {
    h += renderDirectoryTab();
  } else if (t === 'contracts') {
    const C = S.contracts, tt = S.clock.runSec;
    h += '<div class="grid2">' + kpi('COMPLETED', C.completed, 'pos') + kpi('FAILED', C.failed, C.failed ? 'neg' : '') + '</div>';
    h += '<div class="secTitle">Active contracts (' + C.active.length + '/3)</div>';
    if (!C.active.length) h += '<p class="small">No active contracts.</p>';
    C.active.forEach(function (c) {
      const left = Math.max(0, c.deadline - tt);
      h += '<div class="card"><div class="between"><b>' + PRODUCTS[c.item].icon + ' Supply ' + fmt(c.qty) + ' ' + PRODUCTS[c.item].name + '</b><span class="tag ' + (left < 60 ? 'r' : '') + '">⏱ ' + Math.floor(left / 60) + ':' + pad2(Math.floor(left % 60)) + '</span></div><p>For ' + esc(c.from) + ' · Reward ' + money(c.reward) + '</p>' +
        barRow('Delivered', c.delivered, c.qty, '#06d6a0', fmt(c.delivered) + ' / ' + fmt(c.qty)) + '<p class="small">Stock: ' + fmt(S.economy.inventory[c.item]) + ' · production ' + ((SIM.sc && SIM.sc.prod[c.item]) || 0).toFixed(1) + '/s</p></div>';
    });
    h += '<div class="secTitle">Offers</div>';
    if (!C.offers.length) h += '<p class="small">New offers arrive every few minutes (80+ population). They match what your city produces.</p>';
    C.offers.forEach(function (c) {
      h += '<div class="card"><div class="between"><b>' + PRODUCTS[c.item].icon + ' Supply ' + fmt(c.qty) + ' ' + PRODUCTS[c.item].name + '</b><span class="tag">offer ' + Math.max(0, Math.floor(c.expires - tt)) + 's</span></div><p>Client: ' + esc(c.from) + ' · Reward <b class="pos">' + money(c.reward) + '</b> · Deadline ' + Math.round(c.dur / 60) + ' min · Failure lowers reputation.</p>' +
        '<div class="row" style="margin-top:6px"><button class="btn small green" data-act="caccept" data-id="' + c.id + '">Accept</button><button class="btn small" data-act="cdecline" data-id="' + c.id + '">Decline</button></div></div>';
    });
  } else if (t === 'stocks') {
    h += '<div class="grid2">' + kpi('PORTFOLIO', money(portfolioValue())) + kpi('TRADING P/L', signMoney(S.companies.tradeProfit), S.companies.tradeProfit >= 0 ? 'pos' : 'neg') + '</div>';
    const own = Object.keys(S.companies.list);
    if (own.length) {
      h += '<div class="secTitle">Your companies (equity)</div>';
      own.forEach(function (id) {
        const c = S.companies.list[id], cd = companyDef(id);
        const ch = c.hist.length > 1 ? (c.price / c.hist[Math.max(0, c.hist.length - 12)] - 1) * 100 : 0;
        h += '<div class="card"><div class="between"><b>' + cd.icon + ' ' + cd.name + '</b><span>$' + c.price.toFixed(2) + ' <span class="' + (ch >= 0 ? 'pos' : 'neg') + '">' + (ch >= 0 ? '▲' : '▼') + Math.abs(ch).toFixed(1) + '%</span></span></div>' +
          '<p>Ownership ' + Math.round(c.own * 100) + '% · Company value ' + money(c.price * SHARES_TOTAL) + '. Investors offer more when your company value and city reputation are high.</p>' +
          '<div class="row" style="margin-top:6px"><button class="btn small red ' + (c.own <= 0.51 ? 'dis' : '') + '" data-act="sellShares" data-id="' + id + '">Sell 5%</button><button class="btn small green ' + (c.own >= 1 ? 'dis' : '') + '" data-act="buyShares" data-id="' + id + '">Buy back 5%</button><button class="btn small" data-act="stockSel" data-id="own:' + id + '">📈 Chart</button></div></div>';
      });
    }
    h += '<div class="secTitle">Block Street market</div>';
    NPC_STOCKS.forEach(function (s) {
      const st = S.companies.stocks[s.id], pf = S.companies.portfolio[s.id];
      const ch = st.hist.length > 1 ? (st.price / st.hist[Math.max(0, st.hist.length - 12)] - 1) * 100 : 0;
      h += '<div class="card"><div class="between"><b data-act="stockSel" data-id="' + s.id + '" style="cursor:pointer">' + s.icon + ' ' + s.name + ' <span class="tag">' + s.id + '</span></b><span>$' + st.price.toFixed(2) + ' <span class="' + (ch >= 0 ? 'pos' : 'neg') + '">' + (ch >= 0 ? '▲' : '▼') + Math.abs(ch).toFixed(1) + '%</span></span></div>' +
        '<p>Owned: ' + (pf ? pf.qty + ' (avg $' + (pf.cost / pf.qty).toFixed(2) + ')' : '0') + ' · follows city ' + s.link + ' demand</p>' +
        '<div class="row" style="margin-top:6px;flex-wrap:wrap"><button class="btn small green" data-act="buy" data-id="' + s.id + '" data-q="10">Buy 10</button><button class="btn small green" data-act="buy" data-id="' + s.id + '" data-q="100">Buy 100</button><button class="btn small red ' + (pf ? '' : 'dis') + '" data-act="sell" data-id="' + s.id + '" data-q="10">Sell 10</button><button class="btn small red ' + (pf ? '' : 'dis') + '" data-act="sell" data-id="' + s.id + '" data-q="999999">Sell all</button></div></div>';
    });
    h += '<div class="secTitle">📈 Chart: ' + esc(stockName(UI.stockSel)) + '</div><canvas class="chart" data-chart="stock" data-color="#ffd166" style="height:140px"></canvas><p class="small" style="margin-top:6px">Fully simulated in-game market. No real money involved.</p>';
  } else if (t === 'bank') {
    const lim = creditLimit();
    h += '<div class="grid2">' + kpi('CREDIT SCORE', Math.round(S.bank.credit) + '/100', S.bank.credit >= 50 ? 'pos' : 'neg') + kpi('CREDIT LIMIT', money(lim)) + '</div>';
    h += '<div class="secTitle">Loan offers</div>';
    LOAN_OFFERS.forEach(function (o, k) {
      const r = loanRate(o), ok = o.amt <= lim && S.bank.loans.length < 5;
      h += '<div class="card between"><div><h3>🏦 ' + money(o.amt) + '</h3><p>Interest ' + (r * 100).toFixed(1) + '% (central bank ' + (interestRate() * 100).toFixed(1) + '%) · Repay ' + money(o.amt * (1 + r)) + ' over ' + Math.round(o.term / 60) + ' min</p></div><button class="btn small gold ' + (ok ? '' : 'dis') + '" data-act="loan" data-v="' + k + '">Take</button></div>';
    });
    h += '<div class="secTitle">Active loans (' + S.bank.loans.length + '/5)</div>';
    if (!S.bank.loans.length) h += '<p class="small">No active loans.</p>';
    S.bank.loans.forEach(function (l) {
      h += '<div class="card"><div class="between"><b>' + money(l.principal) + ' @ ' + (l.rate * 100).toFixed(0) + '%</b><button class="btn small ' + (S.money < l.remaining ? 'dis' : 'green') + '" data-act="repay" data-v="' + l.id + '">Repay ' + money(l.remaining) + '</button></div>' +
        barRow('Repaid', l.total - l.remaining, l.total, '#06d6a0', money(l.total - l.remaining) + ' / ' + money(l.total)) + '</div>';
    });
  }
  return h;
}

function stockName(sel) {
  if (sel.indexOf('own:') === 0) { const cd = companyDef(sel.slice(4)); return cd ? cd.name : ''; }
  const s = NPC_STOCKS.find(function (x) { return x.id === sel; }); return s ? s.name : '';
}
function renderResearchPanel() {
  if (UI.tabs.research === 'space') {
    const built = landmarkBuilt('spacecenter');
    let h = '<div class="card"><h3>🚀 Space Program</h3><p>' + (built ? 'The Space Center is operational. Fund missions with Research Points and the city budget.' : 'Requires the <b>Space Center</b> landmark (City Level 20 — Global Metropolis — and Monumental Architecture).') + '</p></div>';
    SPACE_STAGES.forEach(function (st, i) {
      const done = S.space.stage > i, next = S.space.stage === i, c = spaceCost(st);
      h += '<div class="tnode ' + (done ? 'done' : next ? 'avail' : 'locked') + '" style="margin-bottom:6px"><div class="tn">' + st.icon + ' ' + st.name + '</div><div class="td">' + st.desc + '</div>' +
        (done ? '<span class="tag g">COMPLETED</span>' : next ? '<button class="btn small ' + (built && S.research.rp >= c.rp && S.budget >= c.money ? 'gold' : 'dis') + '" data-act="space">🚀 Launch · ' + fmt(c.rp) + ' RP + ' + money(c.money) + ' 🏛️</button>' : '<span class="tag">🔒</span>') + '</div>';
      if (i < SPACE_STAGES.length - 1) h += '<div class="tarrow">↓</div>';
    });
    return h;
  }
  let h = '<div class="card between"><div><h3>🔬 ' + fmt(S.research.rp) + ' RP</h3><p>+' + SIM.rpRate.toFixed(2) + ' RP/s · education bonus ×' + (1 + S.city.education / 200).toFixed(2) + ' · ' + S.technology.unlocked.length + '/' + TECH_LIST.length + ' researched</p></div></div>';
  h += '<p class="small" style="margin-bottom:6px">Every technology needs Research Points, money and a City Level (you are Lv ' + cityLevel() + '). Universities and research centers produce RP.</p>';
  if (futureTechAvailable() || S.p6.future) { const fc = futureTechCost(); h += '<div class="card" style="border-left:4px solid var(--purple)"><h3>🧬 Future Technology ' + (S.p6.future + 1) + '</h3><p>Infinite research: each level gives +2% revenue and +2% research (now +' + 2 * S.p6.future + '%).</p><button class="btn small ' + (futureTechAvailable() && S.research.rp >= fc.rp && S.money >= fc.money ? 'gold' : 'dis') + '" data-act="future">🔬 ' + fmt(fc.rp) + ' RP + ' + money(fc.money) + '</button></div>'; }
  h += '<div class="techCols">';
  TECH_CATS.forEach(function (cat) {
    h += '<div class="techCol"><h4>' + (TECH_CAT_NAMES[cat] || cat).toUpperCase() + '</h4>';
    TECH_LIST.filter(function (t) { return t.cat === cat; }).forEach(function (t, i) {
      const st = techState(t), cost = techCost(t), mc = techMoney(t), lv = techLevelReq(t), okAll = st === 'avail' && S.research.rp >= cost && (S.city.sandbox || (S.money >= mc && cityLevel() >= lv));
      const reqTxt = t.req.length ? '<div class="small" style="font-size:10px">Requires: ' + t.req.map(function (r) { return (hasTech(r) ? '✅' : '🔒') + TECHS[r].name; }).join(', ') + '</div>' : '';
      if (i > 0) h += '<div class="tarrow">↓</div>';
      h += '<div class="tnode ' + st + '"><div class="tn">' + (st === 'done' ? '✅ ' : '') + t.name + (t.ng ? ' <span class="tag b">NG+</span>' : '') + '</div><div class="td">' + t.desc + '</div>' + reqTxt +
        (st === 'done' ? '<span class="tag g">RESEARCHED</span>' : '<button class="btn small ' + (okAll ? 'gold' : 'dis') + '" data-act="research" data-id="' + t.id + '" style="margin-top:4px">🔬 ' + fmt(cost) + ' RP · ' + money(mc) + (cityLevel() < lv ? ' · 🔒Lv' + lv : '') + '</button>') + '</div>';
    });
    h += '</div>';
  });
  return h + '</div>';
}

function drawPanelCharts() {
  document.querySelectorAll('canvas.chart').forEach(function (cv) {
    const k = cv.dataset.chart;
    if (k === 'world') { drawWorldMap(cv); return; }
    let data;
    if (k === 'stock') {
      const sel = UI.stockSel;
      if (sel.indexOf('own:') === 0) { const c = S.companies.list[sel.slice(4)]; data = c ? c.hist : []; }
      else data = S.companies.stocks[sel] ? S.companies.stocks[sel].hist : [];
    } else if (k === 'rate') data = S.p5.econ.hist;
    else if (k === 'infl') data = S.p6.econ.hist;
    else if (k === 'aistock') data = stockOf(UI.aiStockSel || AI_DEFS[2].id).hist;
    else data = S.statistics.history[k] || [];
    drawChart(cv, data, cv.dataset.color || '#4cc9f0');
  });
}

/* --- World map (simulated world: cities, trade routes, resources, ports & airports) --- */

function drawChart(cv, data, color) {
  const r = cv.getBoundingClientRect();
  const w = Math.max(50, r.width), h = Math.max(40, r.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
  if (!data || data.length < 2) { c.fillStyle = '#6f76a8'; c.font = '11px sans-serif'; c.fillText('Collecting data…', 8, h / 2); return; }
  let mn = Infinity, mx = -Infinity;
  data.forEach(function (v) { mn = Math.min(mn, v); mx = Math.max(mx, v); });
  if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
  const pad = 14;
  const X = function (i) { return i / (data.length - 1) * (w - 4) + 2; };
  const Y = function (v) { return h - pad - (v - mn) / (mx - mn) * (h - pad * 2); };
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, color + '66'); g.addColorStop(1, color + '00');
  c.beginPath(); c.moveTo(X(0), h); data.forEach(function (v, i) { c.lineTo(X(i), Y(v)); }); c.lineTo(X(data.length - 1), h); c.closePath(); c.fillStyle = g; c.fill();
  c.beginPath(); data.forEach(function (v, i) { if (i) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v)); }); c.strokeStyle = color; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#a3a9d6'; c.font = '10px sans-serif';
  c.fillText(fmt(mx, mx < 10 ? 2 : undefined), 4, 10); c.fillText(fmt(mn, mn < 10 ? 2 : undefined), 4, h - 3);
  c.fillStyle = color; c.textAlign = 'right'; c.fillText(fmt(data[data.length - 1], data[data.length - 1] < 10 ? 2 : undefined), w - 4, 10); c.textAlign = 'left';
}

/* --- Right panel: quests / events / notifications -------------------------------------------- */
function renderRight() {
  if (UI.rightCollapsed) return;
  if (uiBusy()) return;
  const body = $('rpBody'); const st = body.scrollTop;
  let h = '';
  if (UI.rtab === 'quests') {
    h += renderDQHtml() + renderStoryQuestsHtml();
    const m = S.quests.mission;
    h += '<div class="secTitle">🎬 Mayor Missions (' + m + '/' + MISSIONS.length + ')</div>';
    h += '<div class="row" style="gap:4px;margin-bottom:8px">' + MISSIONS.map(function (x, i) { return '<div style="flex:1;height:6px;border-radius:4px;background:' + (i < m ? '#9b5de5' : i === m ? '#ffd166' : 'rgba(255,255,255,.12)') + '"></div>'; }).join('') + '</div>';
    if (m < MISSIONS.length) {
      const M = MISSIONS[m];
      h += '<div class="qitem story"><div class="qt">' + M.title + '</div><div class="qd"><i>' + M.story + '</i></div><div class="qd" style="color:var(--text);margin-top:4px">🎯 ' + M.desc + '</div><div class="qd">🎁 ' + rewardText(M.reward) + '</div>' +
        (M.hint ? '<button class="btn small blue" style="margin-top:6px" data-act="hint" data-cat="' + M.hint.cat + '" data-id="' + M.hint.id + '">Show me →</button>' : '') + '</div>';
    } else h += '<div class="qitem story"><div class="qt">👑 Mission chain complete!</div><div class="qd">New Game+ is available in City → Legacy.</div></div>';
    const lv = cityLevel(), nextPop = CITY_LEVEL_POP[lv] || null;
    h += '<div class="qitem"><div class="qt">🏙️ City Level ' + lv + '/20 — ' + cityLevelName() + '</div>' + (nextPop ? barRow('Next level at ' + fmt(nextPop) + ' pop', S.city.peakPop - CITY_LEVEL_POP[lv - 1], nextPop - CITY_LEVEL_POP[lv - 1], '#4cc9f0', fmt(Math.floor(S.city.peakPop))) : '<div class="qd">🌆 Global Metropolis reached!</div>') + '</div>';
    h += '<div class="secTitle">🎯 Quests</div>';
    let shown = 0;
    for (let i = 0; i < SIDE_QUESTS.length && shown < 3; i++) {
      const q = SIDE_QUESTS[i]; if (S.quests.side[q.id]) continue; shown++;
      h += '<div class="qitem"><div class="qt">' + q.desc + '</div><div class="qd">🎁 ' + rewardText(q.reward) + '</div></div>';
    }
    if (!shown) h += '<p class="small">All quests completed! 🎉</p>';
    h += '<p class="small">' + Object.keys(S.quests.side).length + '/' + SIDE_QUESTS.length + ' quests done</p>';
    const ach = ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; }).length;
    h += '<div class="secTitle">🏅 Achievements</div><div class="qitem between"><span>' + ach + '/' + ACHIEVEMENTS.length + ' unlocked' + (S.city.sandbox ? ' (disabled in sandbox)' : '') + '</span><button class="btn small" data-act="achievements">View</button></div>';
  } else if (UI.rtab === 'events') {
    if (S.events.decisions.length) {
      h += '<div class="secTitle">❓ Decisions needed</div>';
      S.events.decisions.forEach(function (d) {
        const T = DECISION_TYPES[d.type];
        h += '<div class="eventItem" style="border-left-color:var(--blue)"><div class="between"><b>' + T.title + '</b><span class="tag">⏱ ' + Math.max(0, Math.ceil(d.expires - S.clock.runSec)) + 's</span></div><div class="small">' + T.text(d.data) + '</div><button class="btn small blue" style="margin-top:6px" data-act="showdecision" data-uid="' + d.uid + '">Decide →</button></div>';
      });
    }
    const act = S.events.active;
    h += '<div class="secTitle">Active</div>';
    if (!act.length) h += '<p class="small">No active events. The city is calm.</p>';
    act.forEach(function (a) {
      const def = a.kind === 'crisis' ? CRISES.find(function (x) { return x.id === a.id; }) : a.kind === 'disaster' ? DISASTERS.find(function (x) { return x.id === a.id; }) : a.kind === 'dyn' ? DYN_EVENTS.find(function (x) { return x.id === a.id; }) : GLOBAL_EVENTS.find(function (x) { return x.id === a.id; });
      const left = Math.max(0, a.ends - S.clock.runSec), good = a.kind === 'global' || (def && def.good);
      h += '<div class="eventItem ' + (good ? 'good' : 'bad') + '"><div class="between"><b>' + def.icon + ' ' + def.name + '</b><span class="tag">' + Math.floor(left / 60) + ':' + pad2(Math.floor(left % 60)) + '</span></div><div class="small">' + def.desc + (a.choice ? ' · Response: <b>' + a.choice + '</b>' : '') + '</div></div>';
    });
    h += '<div class="secTitle">🎉 Global Events</div>';
    if (S.city.peakPop < 3000) h += '<p class="small">🔒 Unlocks at 3,000 population.</p>';
    else GLOBAL_EVENTS.forEach(function (g) {
      const cd = (S.events.cooldowns[g.id] || 0) - S.clock.runSec, running = !!activeEvent(g.id);
      h += '<div class="qitem"><div class="between"><b>' + g.icon + ' ' + g.name + '</b>' + (running ? '<span class="tag g">LIVE</span>' : cd > 0 ? '<span class="tag">⏳ ' + Math.ceil(cd) + 's</span>' : '<button class="btn small gold ' + (S.budget < eventCost(g) ? 'dis' : '') + '" data-act="host" data-id="' + g.id + '">Host ' + money(eventCost(g)) + ' 🏛️</button>') + '</div><div class="qd">' + g.desc + ' Tourism +' + Math.round(g.tour * 100) + '%, happiness +' + g.hap + ', revenue +' + Math.round(g.rev * 100) + '%.</div></div>';
    });
    h += '<div class="secTitle">⚠️ Risks</div><p class="small">Crises, recessions, supply shocks, energy shortages, expos, festivals, floods, storms, wildfires and factory fires can happen. Some ask for your decision. Difficulty: ' + DIFFICULTIES[S.city.difficulty].name + '.</p>';
  } else {
    UI.unread = 0; updateBadge();
    if (!UI.notifs.length) h += '<p class="small" style="padding:8px">No notifications yet.</p>';
    UI.notifs.forEach(function (n) { h += '<div class="notif"><span class="nt">' + n.t + '</span><span>' + esc(n.msg) + '</span></div>'; });
  }
  body.innerHTML = h; body.scrollTop = st;
}

function rewardText(r) { const p = []; if (r.money) p.push(money(r.money)); if (r.rp) p.push(r.rp + ' RP'); if (r.pp) p.push(r.pp + ' ⭐PP'); if (r.special) p.push('👑 Crown + Gold skin'); return p.join(' · '); }
function setRightTab(t) {
  UI.rtab = t;
  document.querySelectorAll('[data-rtab]').forEach(function (b) { b.classList.toggle('on', b.dataset.rtab === t); });
  if (UI.rightCollapsed) toggleRight(false);
  renderRight();
}
function toggleRight(force) {
  UI.rightCollapsed = force !== undefined ? force : !UI.rightCollapsed;
  $('rightPanel').classList.toggle('collapsed', UI.rightCollapsed);
  document.body.classList.toggle('rightCollapsed', UI.rightCollapsed);
  if (!UI.rightCollapsed) renderRight();
}

/* --- Advisor -------------------------------------------------------------------------- */
function showAdvice(a) {
  const el = $('advisor');
  if (!a) { el.classList.remove('show'); UI.advice = null; return; }
  if (!UI.advice || UI.advice.id !== a.id) {
    $('advMsg').textContent = a.msg;
    el.classList.add('show');
    if (UI.rightCollapsed && IS_MOBILE === false) toast('💡 ' + a.msg, '');
  } else $('advMsg').textContent = a.msg;
  UI.advice = a;
}
function doAdviceAction(act) {
  if (!act) return;
  if (act.type === 'build') { UI.highlight = act.id; openPanel('build', act.cat); }
  else if (act.type === 'tool') { setTool(act.tool); toast(act.tool === 'zone' ? '🟩 Pick a zone type and drag over empty land' : '🛣️ Drag on the map to build roads next to your buildings', ''); }
  else if (act.type === 'panel') { openPanel(act.panel, act.tab); }
  else if (act.type === 'rtab') setRightTab(act.tab);
  else if (act.type === 'zone') { UI.zoneType = act.zone; setTool('zone'); toast(ZONES[act.zone].icon + ' Drag over empty land next to roads to paint ' + ZONES[act.zone].name, ''); }
  else if (act.type === 'decision') { if (S.events.decisions[0]) showDecision(S.events.decisions[0]); }
  else if (act.type === 'cityhall') openCityHall();
}

function selectBuilding(b) {
  UI.selected = b;
  const el = $('bottomInfo');
  if (!b) { el.classList.remove('show'); return; }
  el.classList.add('show');
  renderBottomInfo();
}
function buildingStatus(b) {
  const d = bdef(b);
  if (!b.built) return ['🏗️ Under construction ' + Math.floor(b.progress * 100) + '%', '#f8961e'];
  if (b.fire > 0) return ['🔥 ON FIRE', '#ef476f'];
  if (b.closed) return ['🔒 Closed', '#ef476f'];
  if (!d.noRoad && !b._road) return ['🚧 No road access', '#ef476f'];
  if (!b._powered) return ['⚡ No power', '#ef476f'];
  if (b.damaged) return ['🔨 Damaged', '#f8961e'];
  if (b.upg > 0) return ['⬆️ Upgrading ' + Math.floor(b.upg * 100) + '%', '#4cc9f0'];
  if (d.workers && b._actW < b.workers * 0.99) return ['👷 Understaffed', '#f8961e'];
  return ['✅ Operating', '#06d6a0'];
}
function renderBottomInfo() {
  const b = UI.selected; if (!b) return;
  if (!MAP.byId.has(b.id)) { selectBuilding(null); return; }
  const d = bdef(b);
  const st = buildingStatus(b);
  $('biIcon').textContent = d.icon;
  const dist = districtOf(b.x, b.y);
  $('biTitle').innerHTML = d.name + ' <span class="tag y">Lv ' + b.level + '</span><span class="tag" style="color:' + ownerColor(b.owner) + '">' + ownerLabel(b.owner) + '</span><span id="biStatus" style="background:' + st[1] + '33;color:' + st[1] + '">' + st[0] + '</span>';
  const s = [];
  if (b._rev > 0) s.push('Revenue <b class="pos">' + money(b._rev, 2) + '/s</b>');
  if (b._cost > 0) s.push('Costs <b class="neg">' + money(b._cost, 2) + '/s</b>');
  if (d.workers) s.push('Workers <b>' + Math.round(b._actW) + '/' + b.workers + '</b> (max ' + d.maxW + ')');
  s.push('Efficiency <b>' + pct((b._eff || 0) * 100) + '</b>');
  if (d.housing) s.push('Residents <b>' + fmt(Math.round(b._cust || 0)) + '/' + fmt(Math.round(b._hcap || 0)) + '</b> · Rent <b>' + money(d.rent * d.unitSize * SECONDS_PER_MONTH * S.city.housingPrice) + '/mo</b> · Q' + d.quality);
  else if (b._cust > 0) s.push((d.transit ? 'Riders' : 'Customers/h') + ' <b>' + fmt(Math.round(b._cust)) + '</b>');
  if (b._prodItem && b._prod) s.push(PRODUCTS[b._prodItem].icon + ' <b>' + b._prod.toFixed(1) + '/s</b>');
  if (d.extract) { const dep = depositFor(b); s.push('Deposit <b>' + (dep ? fmt(dep.amount) + ' left' : 'none') + '</b>'); }
  if (d.storage) s.push('Storage <b>' + fmt(d.storage * lvlMult(b.level)) + '</b> · Trucks <b>' + d.trucks + '</b>');
  if (d.wasteCap) s.push('Waste <b>' + (d.wasteCap * lvlMult(b.level)).toFixed(1) + '/s</b>');
  if (d.edu) s.push('Students <b>' + fmt(d.edu * lvlMult(b.level)) + '</b>');
  if (d.power > 0) s.push('Power <b>+' + fmt(b._gen || 0) + '</b>'); else if (d.power < 0) s.push('Power <b>' + d.power * lvlMult(b.level) + '</b>');
  if (d.water) s.push('Water <b>' + (d.water > 0 ? '+' : '') + d.water * lvlMult(b.level) + '</b>');
  if (d.cover) s.push('Coverage <b>' + Math.round(coverRadius(b) * TILE_METERS) + 'm</b>');
  if (d.rp) s.push('Research <b>' + (d.rp * lvlMult(b.level) * (b._eff || 0)).toFixed(2) + ' RP/s</b>');
  if (dist) s.push('District <b>' + DENSITY_NAMES[dist.level] + ' density</b> · Land ×' + landValue(b).toFixed(2));
  const cid = b.owner === 'player' ? companyForSector(d.sector) : null; if (cid) s.push('🏢 ' + companyDef(cid).name);
  const ex = bottomInfoExtras(b), ex6 = bottomInfoExtras6(b);
  ex.stats.concat(ex6.stats).forEach(function (x) { s.push(x); });
  ex.actions = ex6.actions.concat(ex.actions);
  $('biStats').innerHTML = s.map(function (x) { return '<span>' + x + '</span>'; }).join('');
  let a = ex.actions.join('');
  if (d.id === 'townhall') a += '<button class="btn small gold" data-act="cityhall">🏛️ City Hall</button>';
  if (isAI(b)) a += '<button class="btn small gold ' + (S.money < buildingValue(b) * 1.3 ? 'dis' : '') + '" data-act="buyai">🤝 Buy ' + money(buildingValue(b) * 1.3) + '</button>';
  else {
    if (d.workers && b.built) a += '<button class="btn small" data-act="wMinus">👷−</button><button class="btn small" data-act="wPlus">👷+</button>';
    if (b.built && b.level < MAX_LEVEL && !b.upg && d.cost > 0) a += '<button class="btn small gold ' + (funds(ownerPayer(b)) < upgradeCost(b) ? 'dis' : '') + '" data-act="upgrade">⬆️ ' + money(upgradeCost(b)) + (b.owner === 'city' ? ' 🏛️' : '') + '</button>';
    if (d.recipes && d.recipes.length > 1 && b.built) a += d.recipes.map(function (r) { return '<button class="btn small ' + (b.recipe === r ? 'blue' : '') + '" data-act="recipe" data-v="' + r + '" title="Produce ' + PRODUCTS[r].name + '">' + PRODUCTS[r].icon + '</button>'; }).join('');
  }
  if (b._tip > S.clock.runSec) a += '<button class="btn small gold" data-act="collectTip">💰 Collect</button>';
  if (b.damaged) a += '<button class="btn small blue" data-act="repair">🔧 ' + money(buildCost(d) * 0.1) + '</button>';
  if (b.built && d.id !== 'tree') a += '<button class="btn small" data-act="skin" title="Cosmetic skin">🎨 ' + BUILDING_SKINS[b.skin | 0].id + '</button><button class="btn small blue" data-act="interior">🔍 Inside</button>';
  if (!d.noDemolish) a += '<button class="btn small red" data-act="demolish">🗑️</button>';
  a += '<button class="btn small" data-act="deselect">✕</button>';
  $('biActions').innerHTML = a;
}

function collectTip(b) {
  if (!(b._tip > S.clock.runSec)) return;
  const amt = Math.max(5, (b._rev || 1) * 12);
  S.money = Math.min(MONEY_CAP, S.money + amt); b._tip = 0;
  if (S.p5) S.p5.tut.tips = (S.p5.tut.tips || 0) + 1;
  const c = buildingCenter(b);
  spawnParticles(c.x, c.y - 20, 'coin', 8); floatText(c.x, c.y - 30, '+' + money(amt), '#ffd166');
  sfx('money');
}

/* --- Building interiors ------------------------------------------------------------------ */
function interiorType(d) { return d.id === 'warehouse' || d.id === 'fueldepot' ? 'warehouse' : (d.interior || (d.housing ? 'home' : (d.cat === 'Industry' || d.cat === 'Resources') ? 'factory' : d.sector === 'FOOD' ? 'restaurant' : 'office')); }

function openInterior(b) {
  const d = bdef(b);
  UI.interior = b;
  showModal(d.icon + ' ' + d.name + ' — Inside', '<div class="interiorWrap"><canvas id="intCanvas"></canvas><div id="intStats"></div></div>', function () { UI.interior = null; });
  updateInteriorStats();
  const cv = $('intCanvas');
  const loop = function (ts) {
    if (UI.interior !== b || !$('intCanvas')) return;
    drawInterior(cv, b, ts / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function updateInteriorStats() {
  const b = UI.interior; if (!b || !$('intStats')) return;
  if (!MAP.byId.has(b.id)) { closeModal(); return; }
  if (uiBusy()) return;
  const d = bdef(b), type = interiorType(d);
  const row = function (k, v) { return '<div class="istat"><span>' + k + '</span><b>' + v + '</b></div>'; };
  let h = '';
  const profit = (b._rev || 0) - (b._cost || 0);
  const perDay = 86400 / TIME_SCALE;
  if (type === 'bank') {
    h += row('👔 Employees', Math.round(b._actW) + ' / ' + b.workers) + row('🧑‍🤝‍🧑 Customers/h', fmt(Math.round(b._cust || 0))) + row('💰 Vault', money(b.vault || 0)) + row('🛡️ Security', Math.round(bankSecurity(b)) + '%') + row('📈 Profit', signMoney(profit) + '/s');
  } else if (type === 'warehouse') {
    h += row('📦 Capacity (city total)', fmt(SIM.storageUsed || 0) + ' / ' + fmt(SIM.storageCap || 0)) + row('🚚 Trucks', d.trucks + ' × 25 units') + row('👷 Workers', Math.round(b._actW) + ' / ' + b.workers);
    h += '<div class="secTitle">Inventory</div>' + PRODUCT_IDS.filter(function (p) { return S.economy.inventory[p] >= 1; }).map(function (p) { return row(PRODUCTS[p].icon + ' ' + PRODUCTS[p].name, fmt(S.economy.inventory[p])); }).join('');
  } else if (type === 'factory') {
    h += row('📦 Output', b._prodItem ? (b._prod || 0).toFixed(1) + ' ' + PRODUCTS[b._prodItem].name + '/s' : '—') + row('👷 Workers (skill ' + Math.round(S.city.skill) + ')', Math.round(b._actW) + ' / ' + b.workers) +
      (d.recipes && !d.noInputs && PRODUCTS[b.recipe] && PRODUCTS[b.recipe].inputs ? row('🔩 Inputs per unit', Object.keys(PRODUCTS[b.recipe].inputs).map(function (k) { return PRODUCTS[b.recipe].inputs[k] + ' ' + PRODUCTS[k].icon; }).join(' ') || 'none') : '') +
      row('🏬 City storage', fmt(SIM.storageUsed || 0) + ' / ' + fmt(SIM.storageCap || 0)) + row('⚙️ Efficiency', pct((b._eff || 0) * 100)) + row('📈 Profit', signMoney(profit) + '/s');
  } else if (type === 'restaurant') {
    h += row('🧑‍🤝‍🧑 Customers/h', fmt(Math.round(b._cust || 0))) + row('🥗 Food supply', pct(((SIM.fulfill && SIM.fulfill.food) || 1) * 100)) + row('👨‍🍳 Staff', Math.round(b._actW) + ' / ' + b.workers) + row('💵 Revenue', money(b._rev || 0, 2) + '/s') + row('📈 Profit', signMoney(profit) + '/s');
  } else if (type === 'home') {
    h += row('🏠 Residents', fmt(Math.round(b._cust || 0)) + ' / ' + fmt(Math.round(b._hcap || 0))) + row('💵 Rent', money(d.rent * d.unitSize * SECONDS_PER_MONTH * S.city.housingPrice) + '/unit/month') + row('⭐ Quality', d.quality) + row('⚡ Powered', b._powered ? 'Yes' : 'No') + row('🚒🚓🏥 Coverage', (b._cov ? ((b._cov.fire ? '🚒' : '') + (b._cov.police ? '🚓' : '') + (b._cov.health ? '🏥' : '')) : '') || 'none');
  } else {
    h += row('👷 Workers', Math.round(b._actW) + ' / ' + b.workers) + row('⚙️ Efficiency', pct((b._eff || 0) * 100)) + row('💵 Revenue', money(b._rev || 0, 2) + '/s') + row('🧾 Costs', money(b._cost || 0, 2) + '/s') + row('👣 Visitors (total)', fmt(b.visitors || 0));
  }
  // Internal simulation for large buildings
  if (d.w * d.h >= 4 && b.built) {
    const units = d.id === 'mall' ? 50 : d.id === 'supermarket' ? 8 : d.id === 'foodcourt' ? 24 : d.id === 'techcampus' || d.id === 'datacenter' ? 12 : d.id === 'hospital' ? 6 : d.id === 'university' ? 10 : d.id === 'stadium' || d.id === 'megastadium' ? 30 : d.id === 'hotel' ? 120 : 4;
    const occ = clamp((b._eff || 0) * (d.rev ? Math.min(1, SIM.saleMult[d.sector] || 1) : 0.8), 0, 1);
    const label = d.id === 'hotel' ? '🛏️ Rooms occupied' : d.id === 'hospital' ? '🏥 Wards' : d.id === 'university' ? '🎓 Faculties' : d.housing ? '🏠 Apartments' : '🏪 Stores / units';
    h += '<div class="secTitle">🏢 Internal simulation</div>' +
      row(label, Math.round(units * lvlMult(b.level) * (d.housing ? 1 : occ)) + ' / ' + Math.round(units * lvlMult(b.level))) +
      row('👥 Employees', fmt(Math.round(b._actW))) +
      row('🚶 Visitors / day', fmt(Math.round((b._cust || 0) * 24))) +
      row('💵 Revenue / day', money((b._rev || 0) * perDay)) +
      row('📈 Profit / day', signMoney(profit * perDay));
  }
  if (d.workers && !isAI(b)) {
    const sal = b.workers * d.sal * salaryPolicy().sal;
    h += '<div class="secTitle">Staffing</div><div class="workerCtl"><button class="btn" data-act="wMinus">−</button><div class="wv">' + b.workers + '</div><button class="btn" data-act="wPlus">+</button></div>' +
      '<p class="small" style="margin-top:6px">Default ' + d.workers + ', max ' + d.maxW + '. Salary cost ≈ ' + money(sal, 2) + '/s. Extra staff boosts output up to +50%.</p>';
  } else if (isAI(b)) h += '<p class="small" style="margin-top:8px">Owned by ' + ownerLabel(b.owner) + '.</p>';
  $('intStats').innerHTML = h;
}

function drawInterior(cv, b, t) {
  const r = cv.getBoundingClientRect();
  const W = Math.max(100, r.width), H = Math.max(100, r.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.floor(W * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = bdef(b), type = interiorType(d);
  const staff = Math.min(10, Math.max(b.workers ? 1 : 0, Math.round(b._actW / Math.max(1, d.workers) * 6)));
  const cust = Math.min(12, Math.round(Math.sqrt(b._cust || 0)));
  const person = function (x, y, col) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x - 4, y + 7, 8, 2); c.fillStyle = col; c.fillRect(x - 4, y - 2, 8, 9); c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(x, y - 6, 4, 0, 6.283); c.fill(); };
  // floor
  const floor = type === 'factory' ? ['#5c6070', '#555968'] : type === 'restaurant' ? ['#a47148', '#9a6840'] : type === 'bank' ? ['#e9dcc9', '#dfd0bb'] : ['#b8c0d0', '#aeb6c6'];
  for (let y = 0; y < H; y += 20) for (let x = 0; x < W; x += 20) { c.fillStyle = ((x + y) / 20) % 2 ? floor[0] : floor[1]; c.fillRect(x, y, 20, 20); }
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, W, 16);
  const eff = b._eff || 0;
  if (type === 'bank') {
    c.fillStyle = '#6b4f3a'; c.fillRect(W * 0.1, H * 0.3, W * 0.55, 16);
    for (let i = 0; i < Math.min(5, staff); i++) person(W * 0.14 + i * W * 0.11, H * 0.24, '#1d3557');
    const vx = W * 0.83, vy = H * 0.4;
    c.fillStyle = '#6c757d'; c.beginPath(); c.arc(vx, vy, 30, 0, 6.283); c.fill(); c.fillStyle = '#adb5bd'; c.beginPath(); c.arc(vx, vy, 24, 0, 6.283); c.fill();
    c.strokeStyle = '#343a40'; c.lineWidth = 3; for (let k = 0; k < 3; k++) { const a = t * 0.8 + k * 2.09; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + Math.cos(a) * 18, vy + Math.sin(a) * 18); c.stroke(); }
    c.fillStyle = '#ffd166'; for (let k = 0; k < Math.min(8, Math.log10(1 + (b.vault || 0)) * 1.5); k++) c.fillRect(vx - 28 + (k % 4) * 14, vy + 40 + Math.floor(k / 4) * 7, 12, 5);
    person(W * 0.06, H * 0.8, '#212529'); c.fillStyle = '#fff'; c.font = '9px sans-serif'; c.fillText('GUARD', W * 0.02, H * 0.95);
    for (let i = 0; i < cust; i++) { const ph = (t * 0.15 + i / Math.max(1, cust)) % 1; person(W * 0.1 + ph * W * 0.5, H * 0.62 + (i % 2) * 14, CITIZEN_COLORS[i % 10]); }
  } else if (type === 'warehouse') {
    const used = SIM.storageCap ? SIM.storageUsed / SIM.storageCap : 0;
    for (let r = 0; r < 3; r++) {
      const sy = 30 + r * (H - 60) / 3;
      c.fillStyle = '#6b4f3a'; c.fillRect(20, sy + 26, W - 40, 4);
      const n = Math.floor((W - 40) / 16);
      for (let k = 0; k < n; k++) if ((k + r * n) / (n * 3) < used) { c.fillStyle = ['#c9a26b', '#8d99ae', '#e76f51', '#2a9d8f'][(k + r) % 4]; c.fillRect(22 + k * 16, sy + 12, 13, 14); }
    }
    for (let i = 0; i < staff; i++) { const ph = (t * 0.2 + i * 0.37) % 1; person(20 + ph * (W - 40), H - 26 - (i % 2) * 12, '#f8961e'); }
    c.fillStyle = '#ffd166'; c.fillRect(W - 60 + Math.sin(t) * 20, H - 40, 26, 12); c.fillStyle = '#222'; c.fillRect(W - 58 + Math.sin(t) * 20, H - 30, 6, 4);
  } else if (type === 'factory') {
    const by = H * 0.5;
    c.fillStyle = '#343a40'; c.fillRect(10, by, W - 20, 14);
    c.fillStyle = '#495057'; for (let x = 10 + ((t * 40 * eff) % 16); x < W - 10; x += 16) c.fillRect(x, by + 2, 2, 10);
    for (let k = 0; k < 6; k++) { const x = 10 + ((t * 40 * eff + k * (W / 6)) % (W - 30)); c.fillStyle = '#c9a26b'; c.fillRect(x, by - 10, 12, 10); c.strokeStyle = '#8a6d45'; c.strokeRect(x, by - 10, 12, 10); }
    for (let k = 0; k < 3; k++) { const mx = W * (0.2 + k * 0.25); c.fillStyle = '#6c757d'; c.fillRect(mx - 18, by - 46, 36, 30); c.fillStyle = Math.floor(t * 3 + k) % 2 && eff > 0 ? '#06d6a0' : '#ef476f'; c.fillRect(mx - 12, by - 40, 6, 6); c.fillStyle = '#ffd166'; c.fillRect(mx + 4, by - 40, 8, 4); }
    for (let i = 0; i < staff; i++) person(W * (0.12 + (i % 5) * 0.18) + Math.sin(t * 2 + i) * 4, by + 36 + Math.floor(i / 5) * 22, '#f8961e');
    const share = SIM.goodsProd > 0 ? (b._prod || 0) / SIM.goodsProd : 0, cap = d.goods * lvlMult(b.level) * 60;
    const fill = cap ? clamp((SIM.goodsStock || 0) * share / cap, 0, 1) : 0;
    c.fillStyle = '#212529'; c.fillRect(W - 44, 22, 34, H * 0.35);
    for (let k = 0; k < Math.round(fill * 8); k++) { c.fillStyle = '#c9a26b'; c.fillRect(W - 40 + (k % 2) * 15, 22 + H * 0.35 - 10 - Math.floor(k / 2) * 11, 12, 9); }
    c.fillStyle = '#fff'; c.font = '9px sans-serif'; c.fillText('STORAGE', W - 48, 18);
  } else if (type === 'restaurant') {
    c.fillStyle = '#dee2e6'; c.fillRect(10, 20, W - 20, 24); c.fillStyle = '#adb5bd'; for (let k = 0; k < 4; k++) c.fillRect(24 + k * 40, 24, 26, 14);
    for (let i = 0; i < Math.min(3, staff); i++) person(30 + i * 40, 58, '#ffffff');
    const tables = 6;
    for (let k = 0; k < tables; k++) {
      const tx = W * (0.18 + (k % 3) * 0.3), ty = H * (0.55 + Math.floor(k / 3) * 0.25);
      c.fillStyle = '#6b4226'; c.beginPath(); c.arc(tx, ty, 14, 0, 6.283); c.fill(); c.fillStyle = '#f8f9fa'; c.beginPath(); c.arc(tx, ty, 10, 0, 6.283); c.fill();
      if (k < cust) { person(tx - 18, ty, CITIZEN_COLORS[k % 10]); if (k + tables < cust * 1.4) person(tx + 18, ty, CITIZEN_COLORS[(k + 3) % 10]); }
    }
    for (let i = 3; i < staff; i++) { const ph = (t * 0.25 + i * 0.3) % 1; const f = ph < 0.5 ? ph * 2 : 2 - ph * 2; person(W * 0.1 + f * W * 0.8, H * 0.45 + (i % 2) * 40, '#212529'); }
  } else if (type === 'home') {
    c.fillStyle = '#8d99ae'; c.fillRect(20, 30, 60, 30); c.fillStyle = '#e63946'; c.fillRect(W - 90, 30, 70, 40);
    c.fillStyle = '#2b2d42'; c.fillRect(W / 2 - 30, 26, 60, 6);
    for (let i = 0; i < Math.min(6, cust); i++) person(W * (0.2 + i * 0.12) + Math.sin(t + i) * 10, H * 0.65 + (i % 2) * 18, CITIZEN_COLORS[i % 10]);
  } else {
    for (let k = 0; k < 8; k++) {
      const dx = W * (0.12 + (k % 4) * 0.22), dy = H * (0.35 + Math.floor(k / 4) * 0.35);
      c.fillStyle = '#6b4f3a'; c.fillRect(dx - 18, dy, 36, 14); c.fillStyle = '#212529'; c.fillRect(dx - 8, dy - 12, 16, 11);
      c.fillStyle = Math.floor(t * 2 + k) % 3 ? '#4cc9f0' : '#90e0ef'; c.fillRect(dx - 6, dy - 10, 12, 7);
      if (k < staff) person(dx, dy + 24, '#4361ee');
    }
  }
  c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, H - 18, W, 18);
  c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText(d.name.toUpperCase() + ' · Lv' + b.level + ' · ' + (b._op ? 'OPEN' : 'CLOSED'), 8, H - 5);
}

/* --- Achievements & settings modals ---------------------------------------------------- */
function openAchievements() {
  let h = '<div class="grid2">';
  ACHIEVEMENTS.forEach(function (a) {
    const got = !!S.achievements[a.id];
    const hidden = a.ng && S.meta.ngLevel < a.ng && !got;
    h += '<div class="card" style="opacity:' + (got ? 1 : 0.55) + '"><h3>' + (hidden ? '❔' : a.icon) + ' ' + (hidden ? 'New Game+ secret' : a.name) + '</h3><p>' + (hidden ? 'Unlocks in New Game+' : a.desc) + '</p>' + (got ? '<span class="tag g">UNLOCKED</span>' : '') + '</div>';
  });
  showModal('🏅 Achievements', h + '</div>');
}
function openSettings() {
  const se = S.settings;
  const opt = function (key, vals, labels) { return '<div class="row" style="flex-wrap:wrap;gap:6px">' + vals.map(function (v, i) { return '<button class="btn small ' + (se[key] === v ? 'gold' : '') + '" data-act="set" data-k="' + key + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  const tog = function (key, label) { return '<div class="between" style="padding:6px 0"><span>' + label + '</span><button class="btn small ' + (se[key] ? 'green' : '') + '" data-act="toggle" data-k="' + key + '">' + (se[key] ? 'ON' : 'OFF') + '</button></div>'; };
  const themes = UI_THEMES.filter(themeAvailable);
  const h = '<div class="secTitle">Audio</div>' + tog('sound', '🔊 Sound effects') + tog('music', '🎵 Music') +
    '<div class="secTitle">UI theme</div>' + opt('theme', themes.map(function (t) { return t.id; }), themes.map(function (t) { return t.name; })) +
    (UI_THEMES.length > themes.length ? '<p class="small" style="margin-top:4px">More themes unlock as rewards from challenges.</p>' : '') +
    '<div class="secTitle">Accessibility</div>' + tog('reducedMotion', '🧘 Reduced motion') + tog('largeText', '🔠 Large text') + tog('highContrast', '◐ High contrast') + tog('colorFriendly', '🎨 Color-friendly mode (color-blind safe)') +
    tog('screenShake', '📳 Screen shake') + tog('particleReduce', '✨ Particle reduction') + tog('bubbles', '💬 Citizen speech bubbles') +
    '<div class="secTitle">Gameplay</div>' + tog('dynDiff', '🎚️ Dynamic difficulty (adapts to your performance)') + tog('deco', '🌳 Procedural decorations') + tog('gamepad', '🎮 Gamepad support') + tog('minimap', '🧭 Minimap') + tog('dailyReport', '📰 Daily city report') + tog('autoEvolve', '✨ Auto-evolve my buildings (when demand is high)') +
    '<div class="secTitle">Graphics quality</div>' + opt('quality', ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']) +
    '<p class="small" style="margin-top:4px">Controls NPC count, vehicles, particles, glow and shadows.</p>' +
    tog('autoQuality', '⚙️ Adaptive performance (auto-reduce effects below 30 FPS)') + tog('showFps', '📟 Show FPS / TPS monitor') +
    '<div class="secTitle">Purchase confirmation</div>' + opt('confirm', ['always', 'expensive', 'never'], ['Always', 'Expensive only', 'Never']) +
    '<div class="secTitle">Building skin</div>' + opt('skin', S.meta.skins, S.meta.skins.map(function (s) { return ({ classic: '🧱 Classic', neon: '🌈 Neon (NG+)', gold: '👑 Gold' })[s]; })) +
    '<div class="secTitle">Save data (version ' + SAVE_VERSION + ')</div><div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn small green" data-act="saveNow">💾 Save now</button><button class="btn small" data-act="exportSave">📤 Export code</button><button class="btn small" data-act="downloadSave">⬇️ Download .json</button><button class="btn small" data-act="importSave">📥 Import</button><button class="btn small red" data-act="resetGame">🗑️ Reset game</button><button class="btn small blue" data-act="mainmenu">🏠 Main menu</button><button class="btn small" data-act="admin">🛡️ Admin panel</button></div>' +
    '<p class="small" style="margin-top:8px">' + (GSET.autosave ? 'Autosaves every ' + autosaveInterval() + ' seconds' : 'Autosave is OFF (enable it under Desktop &amp; system)') + ' with validation and an automatic backup of the previous save. Also saved before crises, after disasters and when leaving the city.</p>' +
    globalSettingsHtml() +
    '<div class="secTitle">Controls</div><p class="small">Drag / one finger: pan · Wheel / pinch: zoom · Click / tap: select · Right-click: cancel.<br>Keys: <b>B</b> build · <b>M</b> map · <b>C</b> city · <b>R</b> research (rotate while placing) · <b>Q</b> quests · <b>T</b> transport/roads · <b>P</b> / <b>Space</b> pause · <b>Esc</b> pause menu · <b>Z</b> zone · <b>X</b> bulldoze · <b>L</b> layers · <b>D</b> dashboard · <b>F</b> photo mode · <b>1-9</b> / <b>+ −</b> speed · <b>N</b> heatmaps · <b>G</b> statistics · <b>F3</b> debug · <b>Shift+M</b> minimap · <b>Ctrl+S</b> save · <b>F11</b> fullscreen · <b>F12</b> screenshot · <b>Ctrl+K</b> command palette · <b>Ctrl+Shift+A</b> admin.<br>Gamepad: left stick pan · triggers zoom · A select · B back · X build · Y city · LB rotate · Start pause.</p>';
  showModal('⚙️ Settings', h);
}

/* --- Tutorial ----------------------------------------------------------------------- */
const TUTORIAL = [
  { title: 'Welcome, Mayor! 🏙️', text: 'This city was generated from its seed: rivers, hills, resources, roads and zones. You start with a small plot, 5 citizens and one Workshop.', el: null },
  { title: 'Two wallets', text: '💰 MONEY belongs to your companies (business profits, rent). 🏛️ BUDGET belongs to the city (taxes) and pays for roads, services, utilities and zoning.', el: 'topbar' },
  { title: 'Build & zone', text: 'Build things yourself from BUILD, or paint 🟩 Residential / 🟦 Commercial / 🟥 Industrial zones — AI developers and rival companies will build there when demand is high.', el: '[data-panel="build"]' },
  { title: 'Roads & layers', text: 'Buildings need road access. Toggle map layers (terrain, zoning, roads, power, water, resources) with 🗂️.', el: '[data-tool="road"]' },
  { title: 'Missions, events & decisions', text: 'The right panel shows missions, quests, events, decisions and the City Advisor. Press “Show me →” when unsure.', el: 'rightPanel' },
  { title: 'Grow into a Global Metropolis', text: 'Manage the supply chain, compete for market share, trade with other cities, research tech and reach City Level 20. Good luck!', el: 'speedBtns' }
];
let tutStep = 0;
function startTutorial() { if (S.p5 && !S.p5.tut.done) { startTutorial2(); return; } tutStep = 0; showTutStep(); }
function showTutStep() {
  document.querySelectorAll('.tutHL').forEach(function (e) { e.classList.remove('tutHL'); });
  const box = $('tutorial');
  if (tutStep >= TUTORIAL.length) { box.classList.add('hidden'); S.tutorial.done = true; return; }
  const s = TUTORIAL[tutStep];
  $('tutTitle').textContent = s.title; $('tutText').textContent = s.text;
  $('tutNext').textContent = tutStep === TUTORIAL.length - 1 ? 'Start! 🚀' : 'Next →';
  box.classList.remove('hidden');
  let el = s.el ? (s.el[0] === '[' ? document.querySelector(s.el) : $(s.el)) : null;
  if (el && el.offsetParent === null && el.id !== 'rightPanel') el = null;
  if (el) {
    el.classList.add('tutHL');
    const r = el.getBoundingClientRect();
    const bw = Math.min(340, window.innerWidth - 24);
    let x = r.right + 12, y = r.top;
    if (x + bw > window.innerWidth - 8) x = Math.max(12, r.left - bw - 12);
    if (x < 8 || r.width > window.innerWidth * 0.6) { x = (window.innerWidth - bw) / 2; y = r.bottom + 12; }
    if (y + 180 > window.innerHeight) y = Math.max(60, r.top - 190);
    box.style.left = x + 'px'; box.style.top = Math.max(60, y) + 'px';
  } else { box.style.left = (window.innerWidth - Math.min(340, window.innerWidth - 24)) / 2 + 'px'; box.style.top = '30%'; }
}

/* --- Tools & placement ---------------------------------------------------------------- */
function setTool(t) {
  UI.tool = t; UI.roadDrag = null; UI.ghost = null; UI.zoneDrag = null;
  if (t !== 'build') UI.placing = null;
  document.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t && t !== 'build'); });
  $('placeBar').classList.add('hidden');
  $('mobRotate').classList.toggle('hidden', t !== 'build');
  if (t === 'road') showRoadPicker(); else $('roadPop').classList.add('hidden');
  if (t === 'zone') showZonePicker(); else $('zonePicker').classList.add('hidden');
}

function startPlacing(d) {
  const st = unlockStatus(d);
  if (!st.ok) { toast('🔒 Locked: ' + st.reason, 'bad'); sfx('error'); return; }
  setTool('build'); UI.placing = d; UI.highlight = null;
  selectBuilding(null);
  if (IS_MOBILE || window.innerWidth < 820) closeLeft();
  UI.rot = 0;
  toast((IS_TOUCH ? 'Tap' : 'Click') + ' the map to place ' + d.name + ' (' + money(buildCost(d)) + ') · ' + (IS_TOUCH ? 'ROTATE button' : 'R') + ' rotates', '');
  sfx('click');
}
function needsConfirm(cost) {
  const c = S.settings.confirm;
  return c === 'always' || (c === 'expensive' && cost >= Math.max(1000, S.money * 0.3));
}
function attemptPlace(x, y) {
  const d0 = UI.placing; if (!d0) return;
  const rot = UI.rot | 0, d = fpDef(d0, rot);
  const chk = canPlace(d, x, y);
  if (!chk.ok) { toast('❌ ' + chk.reason, 'bad'); sfx('error'); return; }
  const cost = buildCost(d);
  if (UI.lastPointer === 'touch' || needsConfirm(cost)) {
    UI.ghost = { x: x, y: y };
    $('placeInfo').innerHTML = '<b>' + d.icon + ' ' + d.name + '</b>' + money(cost) + (chk.warn ? ' · <span class="neg">' + chk.warn + '</span>' : '');
    $('placeConfirm').textContent = '✓ Build';
    $('placeBar').classList.remove('hidden');
    UI.pendingAction = function () { placeBuilding(d0, x, y, rot); UI.ghost = null; };
    return;
  }
  placeBuilding(d0, x, y, rot);
  if (chk.warn) toast('⚠️ ' + chk.warn, 'bad');
}
function roadPreviewConfirm() {
  const rd = UI.roadDrag; if (!rd) return;
  const tiles = lineTiles(rd.x0, rd.y0, rd.x1, rd.y1).filter(function (t) { return canRoad(t[0], t[1]); });
  const cost = tiles.reduce(function (a, t) { return a + tileRoadCost(t[0], t[1]); }, 0), br = tiles.filter(function (t) { return MAP.nature[idx(t[0], t[1])] === 2; }).length;
  $('placeInfo').innerHTML = '<b>🛣️ Road × ' + tiles.length + (br ? ' (🌉 ' + br + ' bridge)' : '') + '</b>' + money(cost);
  $('placeConfirm').textContent = '✓ Build road';
  $('placeBar').classList.remove('hidden');
  UI.pendingAction = function () { placeRoads(lineTiles(rd.x0, rd.y0, rd.x1, rd.y1)); UI.roadDrag = null; };
}

/* --- Part 4 UI: world map, City Hall, zoning, layers, dashboard --- */
function ownerLabel(o) { if (o === 'player') return '👤 You'; if (o === 'city') return '🏛️ City'; const a = aiDef(o); return a ? a.icon + ' ' + a.name : o; }

function ownerColor(o) { if (o === 'player') return '#ffd166'; if (o === 'city') return '#4cc9f0'; const a = aiDef(o); return a ? a.color : '#888'; }

function shareBars(sh) {
  const keys = Object.keys(sh).filter(function (k) { return sh[k] > 0.001; }).sort(function (a, b) { return sh[b] - sh[a]; });
  if (!keys.length) return '<p class="small">No businesses in this market yet.</p>';
  return '<div class="bar" style="height:12px;display:flex">' + keys.map(function (k) { return '<i style="width:' + (sh[k] * 100) + '%;background:' + ownerColor(k) + ';border-radius:0"></i>'; }).join('') + '</div>' +
    keys.map(function (k) { return '<div class="between small"><span><span style="color:' + ownerColor(k) + '">■</span> ' + ownerLabel(k) + '</span><b>' + pct(sh[k] * 100) + '</b></div>'; }).join('');
}

function renderWorldPanel() {
  const t = UI.tabs.world;
  let h = '';
  if (t === 'diplomacy') {
    h += '<p class="small" style="margin-bottom:6px">Relations: Friendly (&gt;30) · Neutral · Hostile (&lt;-30). Hostile cities refuse to trade. Actions are paid from the city budget.</p>';
    WORLD_CITIES.forEach(function (c) {
      const d = S.diplomacy[c.id], rel = d.rel, lab = relationLabel(rel);
      h += '<div class="card" style="' + (UI.worldSel === c.id ? 'border-color:var(--gold)' : '') + '"><div class="between"><b>' + c.icon + ' ' + c.name + '</b><span class="tag ' + (lab === 'Friendly' ? 'g' : lab === 'Hostile' ? 'r' : '') + '">' + lab + ' ' + Math.round(rel) + '</span></div>' +
        '<div class="bar" style="margin:5px 0"><i style="width:' + ((rel + 100) / 2) + '%;background:' + (rel > 30 ? '#06d6a0' : rel < -30 ? '#ef476f' : '#ffd166') + '"></i></div>' +
        '<p>Pop ' + fmt(c.pop) + ' · Exports ' + c.exports.map(function (p) { return PRODUCTS[p].icon; }).join(' ') + ' · Imports ' + c.imports.map(function (p) { return PRODUCTS[p].icon; }).join(' ') + (c.port ? ' · ⚓' : '') + (c.airport ? ' · ✈️' : '') +
        (d.agreement ? ' · <b class="pos">Trade agreement</b>' : '') + (d.tourism ? ' · <b class="pos">Tourism partner</b>' : '') + ' · Trade flow ' + ((SIM.flows && SIM.flows[c.id]) || 0).toFixed(1) + '/s</p>' +
        '<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:4px"><button class="btn small" data-act="diplo" data-id="' + c.id + '" data-v="gift">🎁 Gift ' + money(diploCost('gift')) + '</button>' +
        '<button class="btn small ' + (d.agreement ? 'red' : 'green') + '" data-act="diplo" data-id="' + c.id + '" data-v="agreement">' + (d.agreement ? 'Cancel agreement' : '🤝 Trade agreement ' + money(diploCost('agreement'))) + '</button>' +
        (d.tourism ? '' : '<button class="btn small blue" data-act="diplo" data-id="' + c.id + '" data-v="tourism">✈️ Tourism ' + money(diploCost('tourism')) + '</button>') +
        '<button class="btn small" data-act="diplo" data-id="' + c.id + '" data-v="exchange">🔄 Resource exchange</button></div></div>';
    });
  } else if (t === 'trade') {
    const bal = (SIM.exportValue || 0) - (SIM.importValue || 0);
    h += '<div class="grid3">' + kpi('EXPORTS/min', money((SIM.exportValue || 0) * 60), 'pos') + kpi('IMPORTS/min', money((SIM.importValue || 0) * 60), 'neg') + kpi('BALANCE/min', signMoney(bal * 60), bal >= 0 ? 'pos' : 'neg') + '</div>';
    h += '<div class="card"><div class="between small"><span>Trade capacity</span><b>' + fmt(SIM.tradeCap || 0) + ' units/s</b></div><p>Highway to the map edge ' + (MAP.edgeRoad ? '✅ (+10, +0.05 per road tile)' : '❌ connect a road to the map edge') + ' · Train stations +40 · Airport +40 · Port +250 · Agreements +20% each · Global Metropolis ×2. Lifetime exports ' + money(S.trade.exportTotal) + ', imports ' + money(S.trade.importTotal) + '.</p></div>';
    h += '<div class="secTitle">Import / export policy</div>';
    PRODUCT_IDS.forEach(function (p) {
      const P = PRODUCTS[p], m = S.trade.mode[p], ex = exportDeal(p), im = importDeal(p);
      h += '<div class="card"><div class="between"><b>' + P.icon + ' ' + P.name + '</b><span class="small">stock ' + fmt(S.economy.inventory[p]) + ' · $' + S.economy.prices[p].toFixed(2) + '</span></div>' +
        '<p>Export to ' + (ex ? ex.city.name + ' @ $' + ex.price.toFixed(2) : '—') + ' · Import from ' + (im ? im.city.name + ' @ $' + im.price.toFixed(2) : '—') + ' · flow ' + ((SIM.sc && SIM.sc.exp[p]) || 0).toFixed(1) + ' out / ' + ((SIM.sc && SIM.sc.imp[p]) || 0).toFixed(1) + ' in</p>' +
        '<div class="seg" style="margin-top:4px">' + ['auto', 'export', 'import', 'off'].map(function (v) { return '<button class="' + (m === v ? 'on' : '') + '" data-act="tmode" data-id="' + p + '" data-v="' + v + '">' + v.toUpperCase() + '</button>'; }).join('') + '</div></div>';
    });
  } else {
    h += '<canvas id="worldPanelCanvas" class="chart" data-chart="world" style="height:300px;cursor:pointer"></canvas><p class="small" style="margin-top:6px">Your city (⭐), partner cities, trade routes (animated when goods flow), resources they export, ports ⚓ and airports ✈️. Tap a city to open its diplomacy card. Zoom far out on the city map to open the world map too.</p>' +
      '<button class="btn blue" data-act="worldmap" style="margin-top:6px">🌍 Open full World Map</button>';
  }
  return h;
}

function worldContinents() {
  if (UI._wc && UI._wcSeed === S.city.seed) return UI._wc;
  const rnd = mulberry32((S.city.seed | 0) + 4242), out = [];
  const centers = [[HOME_POS.x, HOME_POS.y]].concat(WORLD_CITIES.map(function (c) { return [c.x, c.y]; }));
  centers.forEach(function (c, i) {
    const pts = [], n = 14, r = 0.09 + rnd() * 0.07 + (i === 0 ? 0.03 : 0);
    for (let k = 0; k < n; k++) { const a = k / n * 6.283, rr = r * (0.7 + rnd() * 0.6); pts.push([c[0] + Math.cos(a) * rr * 1.3, c[1] + Math.sin(a) * rr]); }
    out.push(pts);
  });
  UI._wc = out; UI._wcSeed = S.city.seed;
  return out;
}

function worldPos(c, W, H) { return { x: c.x * W, y: c.y * H }; }

function drawWorldMap(cv) {
  const r = cv.getBoundingClientRect();
  const W = Math.max(200, r.width), H = Math.max(160, r.height), dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.floor(W * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d3b66'); g.addColorStop(1, '#0a2540');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,.05)'; for (let x = 0; x < W; x += 30) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y < H; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  worldContinents().forEach(function (pts) {
    c.fillStyle = '#6a994e'; c.strokeStyle = '#a7c957'; c.lineWidth = 1.5; c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(p[0] * W, p[1] * H); else c.moveTo(p[0] * W, p[1] * H); }); c.closePath(); c.fill(); c.stroke();
  });
  const home = { x: HOME_POS.x * W, y: HOME_POS.y * H }, t = performance.now() / 1000;
  const hasPort = MAP.lists.ports.some(function (b) { return b._op; }), hasAir = S.buildings.list.some(function (b) { return b.type === 'airport' && b._op; });
  WORLD_CITIES.forEach(function (wc) {
    const p = worldPos(wc, W, H), rel = relationOf(wc.id), flow = (SIM.flows && SIM.flows[wc.id]) || 0;
    c.strokeStyle = rel > 30 ? 'rgba(6,214,160,.7)' : rel < -30 ? 'rgba(239,71,111,.5)' : 'rgba(255,209,102,.55)';
    c.lineWidth = S.diplomacy[wc.id].agreement ? 3 : 1.5; c.setLineDash(rel < -30 ? [3, 6] : [8, 5]);
    c.beginPath(); c.moveTo(home.x, home.y); c.quadraticCurveTo((home.x + p.x) / 2, Math.min(home.y, p.y) - 30, p.x, p.y); c.stroke(); c.setLineDash([]);
    if (flow > 0.05) {
      const n = Math.min(6, 1 + Math.floor(flow / 3));
      for (let k = 0; k < n; k++) {
        const f = ((t * 0.25 + k / n) % 1);
        const mx = (home.x + p.x) / 2, my = Math.min(home.y, p.y) - 30;
        const x = (1 - f) * (1 - f) * home.x + 2 * (1 - f) * f * mx + f * f * p.x, y = (1 - f) * (1 - f) * home.y + 2 * (1 - f) * f * my + f * f * p.y;
        c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(hasPort && wc.port ? '🚢' : '🚚', x, y);
      }
    }
    c.fillStyle = UI.worldSel === wc.id ? '#ffd166' : '#fff'; c.beginPath(); c.arc(p.x, p.y, 7, 0, 6.283); c.fill();
    c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(wc.icon, p.x, p.y - 16);
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText(wc.name + (wc.port ? ' ⚓' : '') + (wc.airport ? ' ✈️' : ''), p.x, p.y + 17);
    c.font = '10px sans-serif'; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(wc.exports.map(function (e) { return PRODUCTS[e].icon; }).join('') + ' · ' + relationLabel(rel), p.x, p.y + 30);
  });
  c.fillStyle = '#ffd166'; c.beginPath(); c.arc(home.x, home.y, 10, 0, 6.283); c.fill();
  c.font = '14px sans-serif'; c.fillText('⭐', home.x, home.y);
  c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.fillText(S.city.name + (hasPort ? ' ⚓' : '') + (hasAir ? ' ✈️' : ''), home.x, home.y + 20);
  c.font = '10px sans-serif'; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText('Pop ' + fmt(Math.floor(S.city.population)) + ' · Lv ' + cityLevel(), home.x, home.y + 33);
  if (hasPort) { for (let k = 0; k < 3; k++) { const a = t * 0.2 + k * 2.1; c.fillText('🚢', home.x + Math.cos(a) * 60, home.y + Math.sin(a) * 36 + 40); } }
  if (hasAir) { const a = t * 0.5; c.fillText('✈️', home.x + Math.cos(a) * 80, home.y - 40 + Math.sin(a) * 20); }
  cv.onclick = function (e) {
    const rr = cv.getBoundingClientRect(), x = e.clientX - rr.left, y = e.clientY - rr.top;
    let best = null, bd = 30;
    WORLD_CITIES.forEach(function (wc) { const p = worldPos(wc, W, H), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = wc; } });
    if (best) { UI.worldSel = best.id; closeModal(); openPanel('world', 'diplomacy'); sfx('click'); }
  };
}

function openWorldMap() {
  showModal('🌍 World Map', '<canvas id="worldCanvas"></canvas><div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small" data-act="ptabw" data-v="diplomacy">🕊️ Diplomacy</button><button class="btn small" data-act="ptabw" data-v="trade">🚢 Trade</button><span class="small">Exports/min ' + money((SIM.exportValue || 0) * 60) + ' · Imports/min ' + money((SIM.importValue || 0) * 60) + '</span></div>', function () { UI.worldOpen = false; });
  UI.worldOpen = true;
  const loop = function () { const cv = $('worldCanvas'); if (!UI.worldOpen || !cv) return; drawWorldMap(cv); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

function openCityHall() {
  const c = S.city, lv = cityLevel(), nextPop = CITY_LEVEL_POP[lv] || null;
  if (!MAP.districts.length) computeDistricts();
  const cnt = [0, 0, 0, 0]; MAP.districts.forEach(function (d) { if (d.built) cnt[d.level]++; });
  const h = '<div class="card"><div class="fld">City name<div class="row"><input id="chName" maxlength="32" value="' + esc(c.name) + '"><button class="btn small green" id="chRename">Rename</button></div></div>' +
    '<p style="margin-top:6px">Seed <b>' + c.seed + '</b> · ' + DIFFICULTIES[c.difficulty].name + ' · Map ' + MAP.W + '×' + MAP.H + (c.sandbox ? ' · Sandbox' : '') + '</p></div>' +
    '<div class="card"><h3>🏙️ Level ' + lv + '/20 — ' + cityLevelName() + '</h3>' + (nextPop ? barRow('Next level at ' + fmt(nextPop) + ' population', c.peakPop - CITY_LEVEL_POP[lv - 1], nextPop - CITY_LEVEL_POP[lv - 1], '#4cc9f0', fmt(Math.floor(c.peakPop))) : '<p>🌆 GLOBAL METROPOLIS — Port, Space Center, global trade & investors unlocked.</p>') + '</div>' +
    '<div class="grid3">' + kpi('👥 POP', fmt(Math.floor(c.population))) + kpi('⭐ REPUTATION', Math.round(c.reputation)) + kpi('😊 HAPPY', pct(c.happiness)) +
    kpi('🏛️ BUDGET', money(S.budget)) + kpi('BUDGET/min', signMoney((SIM.bNet || 0) * 60), (SIM.bNet || 0) >= 0 ? 'pos' : 'neg') + kpi('🎓 EDUCATION', Math.round(c.education)) + '</div>' +
    '<div class="card" style="margin-top:8px"><h3>🏙️ Districts</h3><p>' + DENSITY_NAMES.map(function (n, i) { return n + ': ' + cnt[i]; }).join(' · ') + '</p></div>' +
    '<div class="card"><h3>💸 Fund the city</h3><p>Move your personal money into the city budget to pay for services and expansion.</p><div class="row" style="margin-top:6px;flex-wrap:wrap"><button class="btn small" data-act="transfer" data-v="0.1">Transfer 10%</button><button class="btn small" data-act="transfer" data-v="0.5">Transfer 50%</button><button class="btn small" data-act="transfer" data-v="1">Transfer all</button></div></div>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn blue" data-act="openpanel" data-v="city">📊 City Overview</button><button class="btn" data-act="openpanel" data-v="world">🌍 World</button><button class="btn gold" data-act="openlegacy">🏛️ Legacy</button></div>';
  showModal('🏛️ City Hall — ' + esc(c.name), h);
  $('chRename').onclick = function () { renameCity($('chName').value); openCityHall(); };
}

function showZonePicker() {
  const el = $('zonePicker'), btn = $('zoneBtn').getBoundingClientRect();
  if (!UI.zoneType && UI.zoneType !== 0) UI.zoneType = 1;
  el.innerHTML = '<div class="ph">PAINT ZONE ($' + zoneCost() + '/tile, budget)</div>' + ZONES.map(function (z) { return '<button class="' + (UI.zoneType === z.id ? 'on' : '') + '" data-act="zonetype" data-v="' + z.id + '">' + z.icon + ' ' + z.name + '</button>'; }).join('') +
    '<div class="ph" style="margin-top:4px">' + (IS_TOUCH ? 'Tap two corners, then confirm' : 'Drag a rectangle on the map') + '</div>';
  el.classList.remove('hidden');
  el.style.left = Math.min(window.innerWidth - 210, btn.right + 8) + 'px'; el.style.top = Math.max(60, btn.top) + 'px';
  $('zoneBtn').firstChild.textContent = ZONES[UI.zoneType].icon;
}

function showLayers() {
  const el = $('layersPop');
  if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
  const L = S.settings.layers, btn = $('layersBtn').getBoundingClientRect();
  const items = [['terrain', '⛰️ Terrain'], ['zoning', '🟩 Zoning'], ['road', '🛣️ Roads'], ['rail', '🚆 Rail & Metro'], ['power', '⚡ Power grid'], ['water', '💧 Water network'], ['buildings', '🏢 Buildings'], ['resources', '⛏️ Resources']];
  el.innerHTML = '<div class="ph">MAP LAYERS</div>' + items.map(function (x) { return '<button class="' + (L[x[0]] ? 'on' : '') + '" data-act="layer" data-k="' + x[0] + '">' + (L[x[0]] ? '☑ ' : '☐ ') + x[1] + '</button>'; }).join('');
  el.classList.remove('hidden');
  el.style.left = Math.min(window.innerWidth - 210, btn.right + 8) + 'px'; el.style.top = Math.max(60, btn.top - 40) + 'px';
}

function toggleLayer(k) {
  S.settings.layers[k] = !S.settings.layers[k];
  const el = $('layersPop'); if (!el.classList.contains('hidden')) { el.classList.add('hidden'); showLayers(); }
  sfx('click');
}

function zonePreviewConfirm() {
  const zd = UI.zoneDrag; if (!zd) return;
  const tiles = rectTiles(zd.x0, zd.y0, zd.x1, zd.y1);
  $('placeInfo').innerHTML = '<b>' + ZONES[UI.zoneType].icon + ' ' + ZONES[UI.zoneType].name + ' × ' + tiles.length + '</b>' + (UI.zoneType ? money(tiles.length * zoneCost()) + ' 🏛️' : 'free');
  $('placeConfirm').textContent = '✓ Paint';
  $('placeBar').classList.remove('hidden');
  UI.pendingAction = function () { paintZone(tiles, UI.zoneType); UI.zoneDrag = null; };
}
/* --- Live dashboard (last 60 seconds) --- */

const DASH = { pop: [], rev: [], profit: [], pol: [], hap: [], traffic: [] };

function recordDash() {
  const push = function (k, v) { DASH[k].push(v); if (DASH[k].length > 60) DASH[k].shift(); };
  push('pop', S.city.population); push('rev', SIM.income || 0); push('profit', SIM.net || 0); push('pol', S.city.pollution); push('hap', S.city.happiness); push('traffic', SIM.traffic);
}

function toggleDashboard() { S.settings.dashboard = !S.settings.dashboard; $('dashboard').classList.toggle('hidden', !S.settings.dashboard); renderDashboard(); sfx('click'); }

function renderDashboard() {
  const el = $('dashboard'); if (!S.settings.dashboard) return;
  if (!el.dataset.built) {
    el.innerHTML = '<div class="between" style="margin-bottom:6px"><b>📊 LIVE DASHBOARD — <span id="dCity"></span></b><button class="closeX" data-act="dash">✕</button></div><div class="dk" id="dKpi"></div><div class="dc">' +
      [['pop', 'Population', '#4cc9f0'], ['rev', 'Revenue $/s', '#06d6a0'], ['profit', 'Profit $/s', '#ffd166'], ['pol', 'Pollution', '#f8961e'], ['hap', 'Happiness', '#9b5de5'], ['traffic', 'Traffic', '#ef476f']].map(function (x) { return '<div><div class="cl">' + x[1] + ' (60s)</div><canvas data-dash="' + x[0] + '" data-color="' + x[2] + '"></canvas></div>'; }).join('') + '</div>';
    el.dataset.built = '1';
  }
  $('dCity').textContent = S.city.name;
  $('dKpi').innerHTML = kpi('REVENUE', money(SIM.income || 0) + '/s', 'pos') + kpi('EXPENSES', money(SIM.expenses || 0) + '/s', 'neg') + kpi('PROFIT', signMoney(SIM.net || 0) + '/s', (SIM.net || 0) >= 0 ? 'pos' : 'neg') + kpi('POPULATION', fmt(Math.floor(S.city.population))) +
    kpi('HAPPINESS', pct(S.city.happiness)) + kpi('TRAFFIC', pct(SIM.traffic)) + kpi('POLLUTION', pct(S.city.pollution)) + kpi('REPUTATION', Math.round(S.city.reputation));
  el.querySelectorAll('canvas[data-dash]').forEach(function (cv) { drawChart(cv, DASH[cv.dataset.dash], cv.dataset.color); });
}
