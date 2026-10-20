'use strict';
/* BLOCK CITY TYCOON — GOVERNMENT ENGINE 2.0 · CITY MANAGEMENT UI (Part 18)
   One CITY MANAGEMENT panel for Windows and Android (responsive modal, scrollable tabs, touch-sized controls):
   Overview · Budget · Taxes · Healthcare · Education · Safety · Fire · Transport · Maintenance · Policies · Projects ·
   Citizen Satisfaction · Reports. Plus the daily CITY GOVERNMENT REPORT, the Smart Government Advisor, 10 government
   heatmaps (Government Service Map), search / palette entries, F3 debug lines and the guarded admin inspector and
   console commands. The panel only reads the cached government state; it re-renders when the hourly tick marks it
   dirty (never per frame). */
const GVUI = { tab: 'overview', draft: null, prio: 'normal' };
const GOV_TABS = [['overview', '🏛️ Overview'], ['budget', '💰 Budget'], ['taxes', '🧾 Taxes'], ['health', '🏥 Healthcare'], ['education', '🎓 Education'], ['safety', '🚓 Safety'], ['fire', '🚒 Fire'], ['transport', '🚌 Transport'], ['maintenance', '🛠️ Maintenance'], ['policies', '📜 Policies'], ['projects', '🏗️ Projects'], ['satisfaction', '😊 Citizen Satisfaction'], ['reports', '📰 Reports']];
const GOV_HEATS = [
  ['GOV HEALTHCARE', '🏥', 'Healthcare', 'No coverage', 'Covered'], ['GOV EDUCATION', '🎓', 'Education', 'No schools', 'Covered'], ['POLICE COVERAGE', '🚓', 'Police Coverage', 'Uncovered', 'Covered'],
  ['FIRE COVERAGE', '🚒', 'Fire Coverage', 'Uncovered', 'Covered'], ['MAINTENANCE', '🛠️', 'Maintenance', 'Failing', 'Excellent'], ['PUBLIC TRANSPORT', '🚌', 'Public Transport', 'No service', 'Served'],
  ['GOV SATISFACTION', '🏛️', 'Government Satisfaction', 'Unhappy', 'Satisfied'], ['TAX PRESSURE', '🧾', 'Tax Pressure', 'Low', 'High'], ['SERVICE QUALITY', '⭐', 'Service Quality', 'Poor', 'Excellent'], ['INFRA RISK', '⚠️', 'Infrastructure Risk', 'Safe', 'At risk']
];
function gvPct(v) { return Math.round(v * 100) + '%'; }
function gvCls(v, warn, bad) { return v <= bad ? 'bad' : v <= warn ? 'warn' : ''; }
function gvLvlCls(l) { return l === 'Failed' || l === 'Critical' || l === 'Collapse' ? 'bad' : l === 'Warning' ? 'warn' : ''; }
function openGovernment(tab) {
  if (!STARTED || !S) return;
  gov();
  if (GOV.hourKey < 0 || !S.government.services.health) govSafe('first tick', function () { GOV.hourKey = -1; govTick(); if (!S.government.services.health) { govServicesHour(); govMaintenanceHour(); govDistrictsHour(); govSatisfactionHour(); } });
  if (tab) GVUI.tab = tab;
  GVUI.anim = true;
  if (typeof closeMobilePage === 'function' && typeof MPAGE !== 'undefined' && MPAGE.el && !MPAGE.el.classList.contains('hidden')) closeMobilePage();
  showModal('🏛️ CITY MANAGEMENT · ' + esc(S.city.name), '<div id="gvRoot" class="gvRoot"></div>');
  $('modal').classList.add('p10Wide');
  govRender();
}
function govRender() {
  const root = document.getElementById('gvRoot'); if (!root) return;
  const sc = root.querySelector('.e2Body') ? root.querySelector('.e2Body').scrollTop : 0, tsc = root.querySelector('.e2Tabs') ? root.querySelector('.e2Tabs').scrollLeft : 0;
  let body = '';
  try { body = (GOV_VIEWS[GVUI.tab] || GOV_VIEWS.overview)(); } catch (e) { body = '<p class="small">⚠️ ' + esc(e.message) + '</p>'; if (typeof logError === 'function') logError('Government UI', e.message); }
  const G = S.government, B = govBudgetSummary();
  root.innerHTML = '<div class="e2Tabs mScroll">' + GOV_TABS.map(function (t) { return '<button class="btn small ' + (GVUI.tab === t[0] ? 'gold' : '') + '" data-gvt="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="e2Phase">APPROVAL ' + Math.round(G.approval.value) + ' · ' + G.approval.label.toUpperCase() + ' · budget ' + money(S.budget) + ' · ' + (B.deficit ? '<b class="neg">BUDGET DEFICIT</b>' : 'balance ' + signMoney(B.balance) + '/day') + '</div>' +
    '<div class="e2Body gvBody' + (GVUI.anim ? ' gvAnim' : '') + '">' + body + '</div>';
  GVUI.anim = false;
  const b = root.querySelector('.e2Body'); if (b) b.scrollTop = sc;
  const t = root.querySelector('.e2Tabs'); if (t) t.scrollLeft = tsc;
  root.querySelectorAll('canvas[data-gvc]').forEach(function (cv) { govDrawCanvas(cv); });
}
function govDrawCanvas(cv) {
  const k = cv.dataset.gvc, G = S.government;
  let data = [], f = function (v) { return String(Math.round(v)); }, col = '#4cc9f0';
  if (k === 'approval') { data = G.approval.hist.slice(-40); col = '#ffd166'; }
  else if (k === 'budget') { data = G.budget.hist.slice(-40).map(function (h) { return h.inc - h.exp; }); f = signMoney; col = '#06d6a0'; }
  else if (k === 'hourly') { data = G.budget.hourly.slice(); f = money; }
  const W = cv.width = Math.max(260, Math.min(900, (cv.parentNode.clientWidth || 320) - 4)), H = cv.height, g = cv.getContext('2d');
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, H);
  if (data.length < 2) { g.fillStyle = '#8d99ae'; g.font = '12px sans-serif'; g.fillText(k === 'hourly' ? 'Collecting data — one point per game hour' : 'Collecting data — one point per game day', 10, H / 2); return; }
  let lo = Infinity, hi = -Infinity; data.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); if (hi === lo) { hi += Math.abs(hi) * 0.05 + 1; lo -= Math.abs(lo) * 0.05 + 1; }
  if (lo < 0 && hi > 0) { const y0 = H - 16 - (0 - lo) / (hi - lo) * (H - 32); g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
  data.forEach(function (v, i) { const x = 6 + i / (data.length - 1) * (W - 12), y = H - 16 - (v - lo) / (hi - lo) * (H - 32); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#cfd8e3'; g.font = '11px sans-serif'; g.fillText(f(data[data.length - 1]), 8, 13); g.fillStyle = '#8d99ae'; g.fillText('high ' + f(hi) + ' · low ' + f(lo), 8, H - 3);
}
/* ---------- shared widgets ---------- */
function govFundSlider(id) {
  const F = S.government.budget.funding, s = GOV_SERVICES.find(function (x) { return x[0] === id; }), v = Math.round(F[id] * 100);
  return '<div class="gvFund"><label>' + s[2] + ' ' + s[1] + ' funding <b id="gvFv_' + id + '">' + v + '%</b></label><input type="range" min="0" max="150" step="5" value="' + v + '" data-gvfund="' + id + '" aria-label="' + s[1] + ' funding"></div>';
}
function govServiceCard(id, extra) {
  const v = S.government.services[id], s = GOV_SERVICES.find(function (x) { return x[0] === id; });
  if (!v) return '<div class="e2Card"><h4>' + s[2] + ' ' + s[1] + '</h4><p class="small">Collecting data — the first government hour has not run yet.</p></div>';
  return '<div class="e2Grid">' + e2Tile('📦', 'Capacity', fmt(v.capacity), 'used ' + fmt(v.used)) + e2Tile('📍', 'Coverage', gvPct(v.coverage), 'of homes', gvCls(v.coverage * 100, 60, 35)) +
    e2Tile('⭐', 'Quality', Math.round(v.quality), '0–100', gvCls(v.quality, 55, 35)) + e2Tile('💵', 'Budget', money(v.budget) + '/day', 'funding ' + Math.round(v.funding * 100) + '%') +
    e2Tile('👷', 'Workers', fmt(v.workers), 'staffing ' + gvPct(Math.min(1.5, v.staff)), v.staff < 0.6 ? 'warn' : '') + e2Tile('🛠️', 'Maintenance', v.maint + '%', govMaintLabel(v.maint), gvLvlCls(govMaintLabel(v.maint))) +
    e2Tile('😊', 'Satisfaction', Math.round(v.sat), v.buildings + ' buildings') + (extra || '') + '</div>' + govFundSlider(id);
}
function govMapButtons(list) { return '<div class="mActs gvMap">' + list.map(function (h) { const d = GOV_HEATS.find(function (x) { return x[0] === h; }); return '<button class="btn small" data-gvheat="' + h + '">🗺️ ' + d[1] + ' ' + d[2] + '</button>'; }).join('') + '</div>'; }
function govBuildingsOf(test) {
  const out = {}; S.buildings.list.forEach(function (b) { if (b.owner !== 'city' && b.owner !== 'player') return; const d = bdef(b); if (!test(d)) return; const o = out[d.id] || (out[d.id] = { name: d.icon + ' ' + d.name, n: 0, built: 0, w: 0, need: 0, cond: 0 }); o.n++; if (b.built) { o.built++; o.w += b._actW || 0; o.need += b.workers || 0; o.cond += b.cond === undefined ? 100 : b.cond; } });
  return Object.keys(out).map(function (k) { const o = out[k]; return [o.name, o.built + (o.n > o.built ? ' (+' + (o.n - o.built) + ' building)' : ''), fmt(Math.round(o.w)) + ' / ' + fmt(o.need), o.built ? Math.round(o.cond / o.built) + '%' : '—']; });
}
function govTable(head, rows) { return '<div class="e2TblWrap"><table class="e2Tbl"><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + (rows.length ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + head.length + '">None yet</td></tr>') + '</table></div>'; }
function govDistrictRows(cols) { return S.government.districts.filter(function (d) { return d.pop > 0; }).slice(0, 24).map(function (d) { return ['<button class="btn small" data-gvfly="' + d.x + ',' + d.y + '">📍</button> ' + esc(d.name)].concat(cols.map(function (c) { return c(d); })); }); }

/* ---------- views ---------- */
const GOV_VIEWS = {
  overview: function () {
    const G = S.government, B = govBudgetSummary(), sv = G.services, T = govTaxes(), adv = govAdvice();
    const act = Object.keys(G.policies.active), pj = G.projects.filter(function (p) { return p.status === 'building'; });
    return (B.deficit ? '<div class="gvAlert bad">📉 BUDGET DEFICIT — ' + signMoney(B.balance) + ' yesterday · ' + B.deficitDays + ' day(s) in a row</div>' : '') +
      '<div class="e2Grid">' + e2Tile('👥', 'Population', fmt(Math.round(S.city.population)), G.districts.length + ' districts') +
      e2Tile('🏛️', 'City Approval', Math.round(G.approval.value), G.approval.label, gvLvlCls(G.approval.label)) + e2Tile('😊', 'City Satisfaction', Math.round(G.sat.city || 0), 'services ' + Math.round(G.sat.services || 0)) +
      e2Tile('💰', 'City budget', money(S.budget), 'reserve ' + money(B.reserve)) + e2Tile('📈', 'Income', money(B.income) + '/day', 'yesterday') + e2Tile('📉', 'Expenses', money(B.expenses) + '/day', 'yesterday') +
      e2Tile('⚖️', 'Balance', signMoney(B.balance) + '/day', B.deficit ? 'DEFICIT' : 'surplus', B.deficit ? 'bad' : '') + e2Tile('📄', 'City debt', money(B.debt), G.budget.loans.length + ' loan(s)') +
      e2Tile('🧾', 'Tax pressure', Math.round(govTaxPressure(T)), 'res ' + T.residential + '% · com ' + T.commercial + '% · ind ' + T.industrial + '%', govTaxPressure(T) > 45 ? 'warn' : '') +
      e2Tile('🛠️', 'Infrastructure', (G.maint.avg === undefined ? '—' : G.maint.avg + '%'), G.maint.avg === undefined ? '' : govMaintLabel(G.maint.avg), gvLvlCls(govMaintLabel(G.maint.avg === undefined ? 100 : G.maint.avg))) +
      e2Tile('📜', 'Policies', act.length, act.map(function (k) { return GOV_POLICIES[k].icon; }).join(' ') || 'none active') + e2Tile('🏗️', 'Projects', pj.length, 'under construction') + '</div>' +
      '<div class="e2Cols"><div class="e2Card"><h4>🧠 Smart Government Advisor</h4>' + (adv.length ? adv.map(function (a) { return '<div class="e2Row"><span>' + esc(a.msg) + '</span>' + (a.tab ? '<button class="btn small" data-gvt="' + a.tab + '">Open</button>' : '') + '</div>'; }).join('') : '<p class="small">No problems right now — the city is running smoothly.</p>') + '</div>' +
      '<div class="e2Card"><h4>Public services</h4>' + GOV_SERVICES.map(function (s) { const v = sv[s[0]]; return e2Bar(s[2] + ' ' + s[1], v ? v.quality : 0, 100, v ? Math.round(v.quality) + ' · ' + gvPct(v.coverage) : '—'); }).join('') + '</div>' +
      '<div class="e2Card"><h4>⚠️ Government events</h4>' + (G.events.active.length ? G.events.active.map(function (e) { const E = GOV_EVENTS[e.id]; return '<div class="e2Row"><span>' + E.icon + ' ' + E.name + '</span><b class="' + (E.good ? 'pos' : 'neg') + '">until day ' + e.until + '</b></div>'; }).join('') : '<p class="small">No active government events.</p>') + '</div></div>' +
      '<div class="e2Card"><h4>District management</h4>' + govTable(['District', 'Pop', 'Budget/day', 'Health', 'Edu', 'Safety', 'Fire', 'Transit', 'Maint', 'Happy', 'Land', 'Pollution', 'Gov sat'], govDistrictRows([function (d) { return fmt(d.pop); }, function (d) { return money(d.contrib); }, function (d) { return d.health + '%'; }, function (d) { return d.education + '%'; }, function (d) { return d.safety; }, function (d) { return d.fire + '%'; }, function (d) { return d.transport + '%'; }, function (d) { return d.maint + '%'; }, function (d) { return d.hap; }, function (d) { return '×' + d.land.toFixed(2); }, function (d) { return d.pollution; }, function (d) { return d.govSat; }])) + '</div>' +
      '<div class="e2Card"><h4>🗺️ Government Service Map</h4>' + govMapButtons(GOV_HEATS.map(function (h) { return h[0]; })) + '</div>';
  },
  budget: function () {
    const G = S.government, B = govBudgetSummary(), Bb = G.budget, L = Object.keys(Bb.last.inc).length ? Bb.last : Bb.today;
    const inc = GOV_INCOME.map(function (c) { return [c[1], L.inc[c[0]] || 0]; }), exp = GOV_EXPENSE.map(function (c) { return [c[1], L.exp[c[0]] || 0]; });
    const im = Math.max.apply(null, inc.map(function (x) { return x[1]; }).concat([1])), em = Math.max.apply(null, exp.map(function (x) { return x[1]; }).concat([1]));
    const dayInc = Math.max(1, B.income || (SIM.bInc || 0) * 86400 / TIME_SCALE);
    return (B.deficit ? '<div class="gvAlert bad">📉 BUDGET DEFICIT — expenses exceed income by ' + money(-B.balance) + ' per day.</div>' : '') +
      '<div class="e2Grid">' + e2Tile('📈', 'Income', money(B.income) + '/day', '') + e2Tile('📉', 'Expenses', money(B.expenses) + '/day', '') + e2Tile('⚖️', 'Balance', signMoney(B.balance) + '/day', B.deficit ? 'deficit' : 'surplus', B.deficit ? 'bad' : '') +
      e2Tile('📄', 'Debt', money(B.debt), Bb.loans.length + ' loan(s)') + e2Tile('💸', 'Interest', money(B.interest) + '/day', 'paid so far ' + money(Bb.interestPaid)) + e2Tile('🏦', 'Emergency Reserve', money(B.reserve), Math.round(Bb.reserveRate * 100) + '% of surpluses', B.reserve < B.expenses * 0.5 && S.city.population > 300 ? 'warn' : '') +
      e2Tile('🗓️', 'Monthly change', signMoney(B.month), 'last 16 game hours') + e2Tile('📅', 'Yearly change', signMoney(B.year), 'last 8 game days') + '</div>' +
      '<div class="e2Chart"><canvas data-gvc="budget" height="140"></canvas></div>' +
      '<div class="e2Cols"><div class="e2Card"><h4>Income ' + (L === Bb.today ? '(today so far)' : '(yesterday)') + '</h4>' + inc.map(function (x) { return e2Bar(x[0], x[1], im, money(x[1])); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Expenses ' + (L === Bb.today ? '(today so far)' : '(yesterday)') + '</h4>' + exp.map(function (x) { return e2Bar(x[0], x[1], em, money(x[1])); }).join('') + '</div></div>' +
      '<div class="e2Card"><h4>🏦 City loans</h4>' + govTable(['Loan', 'Borrowed', 'Remaining', 'Rate', 'Per day', ''], Bb.loans.map(function (l) { return ['#' + l.id + ' · day ' + l.day, money(l.principal), money(l.remaining), (l.rate * 100).toFixed(2) + '%', money(l.perDay), '<button class="btn small" data-gvrepay="' + l.id + '">Repay</button>']; })) +
      '<div class="mActs">' + [1, 2, 4].map(function (d) { return '<button class="btn small blue" data-gvborrow="' + Math.round(dayInc * d / 4) + '">Borrow ' + money(Math.round(dayInc * d / 4)) + '</button>'; }).join('') + '</div><p class="small">Credit limit: 4 days of income. Rate = central bank + 1.5 % + debt risk. 1 game year = 8 days.</p></div>' +
      '<div class="gvFund"><label>🏦 Emergency reserve — share of each surplus <b id="gvFv_reserve">' + Math.round(Bb.reserveRate * 100) + '%</b></label><input type="range" min="0" max="30" step="1" value="' + Math.round(Bb.reserveRate * 100) + '" data-gvres="1" aria-label="Emergency reserve rate"></div>';
  },
  taxes: function () {
    const T = govTaxes(), D = GVUI.draft || T, B = govIncomeNow(), H = 86400 / TIME_SCALE;
    const now = govTaxPressure(T), nxt = govTaxPressure(D);
    return '<p class="small">Taxes are collected by EconomyEngine 2.0. The effects are non-linear: a little above the comfort level costs little, far above it hurts happiness, growth and business revenue.</p>' +
      GOV_TAXES.map(function (t) {
        const k = t[0], cur = T[k], v = D[k], base = B[k] || 0, el = { residential: 0.012, commercial: 0.018, industrial: 0.016, corporate: 0.02, property: 0.08 }[k], cf = { residential: 12, commercial: 14, industrial: 14, corporate: 10, property: 2 }[k];
        const per = cur > 0 ? base / cur : 0, exp = Math.max(0, per * v * (1 - Math.max(0, v - cf) * el));
        return '<div class="e2Card gvTax"><div class="between"><b>' + t[1] + '</b><b id="gvTv_' + k + '">' + (k === 'property' ? (+v).toFixed(1) : v) + '%</b></div>' +
          '<input type="range" min="' + t[2] + '" max="' + t[3] + '" step="' + (k === 'property' ? 0.5 : 1) + '" value="' + v + '" data-gvtax="' + k + '" aria-label="' + t[1] + '">' +
          '<div class="e2Row"><span>Revenue now</span><b>' + money(base * H) + '/day</b></div><div class="e2Row"><span>Forecast at ' + (k === 'property' ? (+v).toFixed(1) : v) + '%</span><b class="' + (exp >= base ? 'pos' : 'neg') + '">' + (cur > 0 ? money(exp * H) + '/day' : 'starts collecting next hour') + '</b></div></div>';
      }).join('') +
      '<div class="e2Row"><span>Tax pressure</span><b class="' + (nxt > now ? 'neg' : '') + '">' + Math.round(now) + (GVUI.draft ? ' → ' + Math.round(nxt) : '') + '</b></div>' +
      '<div class="mActs"><button class="btn gold" data-gvapply="1"' + (GVUI.draft ? '' : ' disabled') + '>✅ Apply taxes</button><button class="btn" data-gvreset="1">Reset</button></div>' + govMapButtons(['TAX PRESSURE']);
  },
  health: function () {
    const v = S.government.services.health;
    const ex = v ? e2Tile('🛏️', 'Beds', fmt(v.beds), 'load ' + gvPct(v.load), v.load > 0.92 ? 'bad' : v.load > 0.8 ? 'warn' : '') + e2Tile('🧑‍⚕️', 'Doctors', fmt(v.doctors), 'nurses ' + fmt(v.nurses)) + e2Tile('🚑', 'Emergency', fmt(v.er), 'ambulance ' + v.resp.toFixed(1) + ' min') + e2Tile('⏱️', 'Waiting time', Math.round(v.wait) + ' min', 'treatment ' + gvPct(Math.min(1.2, v.treat)), v.wait > 30 ? 'warn' : '') : '';
    return govServiceCard('health', ex) + '<div class="e2Card"><h4>Hospitals</h4>' + govTable(['Type', 'Built', 'Staff', 'Condition'], govBuildingsOf(function (d) { return d.service === 'health'; })) + '<p class="small">Clinic · Hospital · Medical Center · Large Hospital · Research Hospital · University Hospital. Ambulances are dispatched by the Emergency AI.</p></div>' +
      '<div class="e2Card"><h4>Coverage by district</h4>' + govTable(['District', 'Coverage', 'Ambulance', 'Pop'], govDistrictRows([function (d) { return d.health + '%'; }, function (d) { const r = GOV.cache.respD && GOV.cache.respD.health ? GOV.cache.respD.health[d.k] : 0; return r ? r.toFixed(1) + ' min' : '—'; }, function (d) { return fmt(d.pop); }])) + '</div>' + govMapButtons(['GOV HEALTHCARE']);
  },
  education: function () {
    const v = S.government.services.education, st = ['Primary', 'Secondary', 'College', 'University'];
    const ex = v ? e2Tile('🎓', 'Qualification', v.qual.toFixed(2), 'average stage') + e2Tile('🧩', 'Skill fit', gvPct(v.fit), 'skilled jobs filled') + e2Tile('📚', 'Education', Math.round(S.city.education), 'city index') : '';
    return govServiceCard('education', ex) + (v && v.stages.length ? '<div class="e2Card"><h4>Seats per stage</h4>' + v.stages.map(function (c, i) { return e2Bar(st[i] || 'Stage ' + (i + 1), c, 100, c + '%'); }).join('') + '<p class="small">Education → qualification → income, employment, productivity and GDP.</p></div>' : '') +
      '<div class="e2Card"><h4>Schools</h4>' + govTable(['Type', 'Built', 'Staff', 'Condition'], govBuildingsOf(function (d) { return !!(d.edu || d.eduLvl); })) + '</div>' +
      '<div class="e2Card"><h4>Coverage by district</h4>' + govTable(['District', 'Coverage', 'Pop'], govDistrictRows([function (d) { return '<b class="' + (d.education < 40 ? 'neg' : '') + '">' + d.education + '%</b>'; }, function (d) { return fmt(d.pop); }])) + '</div>' + govMapButtons(['GOV EDUCATION']);
  },
  safety: function () {
    const v = S.government.services.police;
    const ex = v ? e2Tile('⏱️', 'Response time', v.resp.toFixed(1) + ' min', 'population weighted', v.resp > 12 ? 'warn' : '') + e2Tile('🚓', 'Patrols', fmt(v.patrols), 'vehicles on duty') + e2Tile('🦹', 'Crime', Math.round(v.crime), 'city index', v.crime > 50 ? 'bad' : '') : '';
    return govServiceCard('police', ex) + '<div class="e2Card"><h4>Crime risk by district</h4>' + govTable(['District', 'Type', 'Safety', 'Response', 'Crime risk'], govDistrictRows([function (d) { return esc(d.type || '—'); }, function (d) { return d.safety; }, function (d) { return d.policeResp ? d.policeResp + ' min' : '—'; }, function (d) { const r = Math.round(govCrimeRisk(d)); return '<b class="' + (r > 60 ? 'neg' : '') + '">' + r + '</b>'; }])) + '</div>' +
      '<div class="e2Card"><h4>Stations</h4>' + govTable(['Type', 'Built', 'Staff', 'Condition'], govBuildingsOf(function (d) { return d.service === 'police'; })) + '</div>' + govMapButtons(['POLICE COVERAGE']);
  },
  fire: function () {
    const v = S.government.services.fire, wx = typeof VE !== 'undefined' ? VE.wx : null;
    const ex = v ? e2Tile('⏱️', 'Response time', v.resp.toFixed(1) + ' min', 'traffic · roads · distance · weather', v.resp > 10 ? 'warn' : '') + e2Tile('🚒', 'Fire trucks', fmt(v.trucks), '') + e2Tile('🔥', 'Burning now', v.burning, '', v.burning > 0 ? 'bad' : '') : '';
    return govServiceCard('fire', ex) + '<p class="small">Response time = distance to the nearest station × congestion × road condition × available crews × weather' + (wx ? ' (now: snow ' + Math.round(wx.snow * 100) + '%, fog ' + Math.round(wx.fog * 100) + '%, wet ' + Math.round(wx.wet * 100) + '%)' : '') + '. Faster response puts fires out sooner.</p>' +
      '<div class="e2Card"><h4>Response by district</h4>' + govTable(['District', 'Coverage', 'Response'], govDistrictRows([function (d) { return d.fire + '%'; }, function (d) { return d.fireResp ? '<b class="' + (d.fireResp > 12 ? 'neg' : '') + '">' + d.fireResp + ' min</b>' : '—'; }])) + '</div>' +
      '<div class="e2Card"><h4>Stations</h4>' + govTable(['Type', 'Built', 'Staff', 'Condition'], govBuildingsOf(function (d) { return d.service === 'fire'; })) + '</div>' + govMapButtons(['FIRE COVERAGE']);
  },
  transport: function () {
    const v = S.government.services.transport;
    const ex = v ? e2Tile('🧍', 'Riders', fmt(v.riders), 'per day') + e2Tile('🚗', 'Traffic', Math.round(v.traffic) + '%', '', v.traffic > 60 ? 'warn' : '') : '';
    return govServiceCard('transport', ex) + govFundSlider('roads') + '<div class="e2Card"><h4>Transit by district</h4>' + govTable(['District', 'Coverage', 'Pop'], govDistrictRows([function (d) { return d.transport + '%'; }, function (d) { return fmt(d.pop); }])) + '</div>' + govMapButtons(['PUBLIC TRANSPORT']);
  },
  maintenance: function () {
    const M = S.government.maint, keys = ['roads', 'bridges', 'tunnels', 'buildings', 'power', 'water', 'sewage', 'transport', 'emergency'];
    return '<p class="small">Excellent 100 · Good 75 · Warning 50 · Critical 25 · Failed 0. A FAILED network breaks for real: road failures, water leaks, power failures, building closures and bridge collapse.</p>' +
      '<div class="e2Grid">' + keys.map(function (k) { const m = M[k]; return m ? e2Tile('🛠️', m.name, m.v + '%', m.level, gvLvlCls(m.level)) : ''; }).join('') + '</div>' +
      ['roads', 'water', 'electricity', 'transport', 'parks', 'waste'].map(govFundSlider).join('') + govMapButtons(['MAINTENANCE', 'INFRA RISK']);
  },
  policies: function () {
    const G = S.government, A = G.policies.active, day = gameDay();
    return '<p class="small">Policies cost money every day, last a fixed time and have side effects. Conflicting policies cannot run together.</p><div class="gvCards">' + Object.keys(GOV_POLICIES).map(function (id) {
      const P = GOV_POLICIES[id], on = A[id], clash = P.conflicts.filter(function (c) { return A[c]; });
      return '<div class="e2Card gvPol ' + (on ? 'on' : '') + '"><h4>' + P.icon + ' ' + P.name + '</h4><div class="small pos">✔ ' + P.good + '</div><div class="small neg">✖ ' + P.bad + '</div>' +
        '<div class="e2Row"><span>Cost</span><b>' + money(govPolicyCost(id)) + '/day · ' + P.days + ' days</b></div>' + (P.conflicts.length ? '<div class="small">Conflicts: ' + P.conflicts.map(function (c) { return GOV_POLICIES[c].name; }).join(', ') + '</div>' : '') +
        (on ? '<div class="e2Row"><span>Active</span><b>' + Math.max(0, on.until - day) + ' day(s) left</b></div><button class="btn small red" data-gvpol="off:' + id + '">End policy</button>' : '<button class="btn small gold" data-gvpol="on:' + id + '"' + (clash.length ? ' disabled' : '') + '>Enact</button>') + '</div>';
    }).join('') + '</div>' + (G.policies.log.length ? '<div class="e2Card"><h4>History</h4>' + G.policies.log.slice(0, 8).map(function (l) { return '<div class="e2Row"><span>Day ' + l.d + '</span><b>' + (GOV_POLICIES[l.id] ? GOV_POLICIES[l.id].name : l.id) + ' ' + (l.on ? 'enacted' : 'ended') + '</b></div>'; }).join('') + '</div>' : '');
  },
  projects: function () {
    const G = S.government, run = G.projects.filter(function (p) { return p.status === 'building'; }), old = G.projects.filter(function (p) { return p.status !== 'building'; }).slice(0, 8);
    return '<div class="e2Chips">Priority: ' + Object.keys(GOV_PRIORITY).map(function (k) { const P = GOV_PRIORITY[k]; return '<button class="btn small ' + (GVUI.prio === k ? 'gold' : '') + '" data-gvsetprio="' + k + '">' + P.name + ' · speed ×' + P.speed + ' · cost ×' + P.cost + '</button>'; }).join('') + '</div>' +
      (run.length ? '<div class="e2Card"><h4>Under construction</h4>' + run.map(function (p) {
        const P = GOV_PROJECTS[p.type];
        return '<div class="gvProj"><div class="between"><b>' + P.icon + ' ' + P.name + '</b><span class="small">' + esc(p.note) + '</span></div><div class="e2BarRow"><span>' + GOV_PRIORITY[p.prio].name + '</span><i><em style="width:' + Math.round(p.progress * 100) + '%"></em></i><b>' + Math.round(p.progress * 100) + '%</b></div>' +
          '<div class="mActs">' + Object.keys(GOV_PRIORITY).filter(function (k) { return k !== p.prio; }).map(function (k) { return '<button class="btn small" data-gvprio="' + p.id + ':' + k + '">→ ' + GOV_PRIORITY[k].name + '</button>'; }).join('') + (p.x >= 0 ? '<button class="btn small" data-gvfly="' + p.x + ',' + p.y + '">📍</button>' : '') + '<button class="btn small red" data-gvcancel="' + p.id + '">Cancel</button></div></div>';
      }).join('') + '</div>' : '') +
      '<div class="gvCards">' + Object.keys(GOV_PROJECTS).map(function (id) {
        const P = GOV_PROJECTS[id], q = govProjectQuote(id, GVUI.prio);
        return '<div class="e2Card gvPj"><h4>' + P.icon + ' ' + P.name + '</h4><div class="small">' + P.benefit + '</div>' +
          (q.cost !== undefined ? '<div class="e2Row"><span>Cost</span><b>' + money(q.cost) + '</b></div><div class="e2Row"><span>Time</span><b>~' + govDur(q.days) + '</b></div><div class="e2Row"><span>Workers</span><b>' + fmt(q.workers) + '</b></div>' +
            (q.mat ? '<div class="e2Row"><span>Materials</span><b>' + Object.keys(q.mat).map(function (k) { return fmt(q.mat[k]) + ' ' + k; }).join(' · ') + '</b></div>' : '') + '<div class="e2Row"><span>Maintenance</span><b>' + money(q.maint * 1200) + '/day</b></div>' : '') +
          (q.reason ? '<div class="small neg">' + esc(q.reason) + '</div>' : '<button class="btn small gold" data-gvproj="' + id + '">Start (' + GOV_PRIORITY[GVUI.prio].name + ')</button>') + '</div>';
      }).join('') + '</div>' +
      (old.length ? '<div class="e2Card"><h4>Finished / cancelled</h4>' + old.map(function (p) { const P = GOV_PROJECTS[p.type]; return '<div class="e2Row"><span>' + P.icon + ' ' + P.name + ' · ' + esc(p.note) + '</span><b class="' + (p.status === 'done' ? 'pos' : 'neg') + '">' + p.status + (p.done ? ' day ' + p.done : '') + '</b></div>'; }).join('') + '</div>' : '');
  },
  satisfaction: function () {
    const G = S.government, s = G.sat, C = [['happiness', '😊 Happiness'], ['safety', '🚓 Safety'], ['healthcare', '🏥 Healthcare'], ['education', '🎓 Education'], ['transport', '🚌 Transport'], ['tax', '🧾 Tax Satisfaction'], ['housing', '🏠 Housing'], ['employment', '💼 Employment'], ['environment', '🌳 Environment'], ['income', '💵 Income'], ['entertainment', '🎡 Entertainment'], ['government', '🏛️ Government']];
    return '<div class="e2Grid">' + e2Tile('😊', 'City Satisfaction', Math.round(s.city || 0), 'weighted') + e2Tile('🏛️', 'City Approval', Math.round(G.approval.value), G.approval.label, gvLvlCls(G.approval.label)) + '</div>' +
      '<div class="e2Chart"><canvas data-gvc="approval" height="140"></canvas></div><p class="small">Approval: Excellent ≥ 90 · Very Good 75–89 · Stable 60–74 · Warning 40–59 · Critical 20–39 · Collapse &lt; 20</p>' +
      '<div class="e2Card"><h4>Satisfaction components</h4>' + C.map(function (c) { return e2Bar(c[1], s[c[0]] || 0, 100, Math.round(s[c[0]] || 0)); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Government satisfaction by district</h4>' + govTable(['District', 'Gov sat', 'Happy', 'Services', 'Pollution'], govDistrictRows([function (d) { return '<b class="' + (d.govSat < 40 ? 'neg' : d.govSat > 70 ? 'pos' : '') + '">' + d.govSat + '</b>'; }, function (d) { return d.hap; }, function (d) { return Math.round((d.health + d.education + d.safety + d.fire + d.transport + d.maint) / 6); }, function (d) { return d.pollution; }])) + '</div>' + govMapButtons(['GOV SATISFACTION', 'SERVICE QUALITY']);
  },
  reports: function () {
    const R = S.government.reports.slice().reverse();
    if (!R.length) return '<p class="small">The first CITY GOVERNMENT REPORT is written at the end of the first full game day.</p>';
    return R.map(function (r) { return '<div class="e2Card"><h4>📰 CITY GOVERNMENT REPORT — Day ' + r.d + '</h4>' + govReportHtml(r) + '</div>'; }).join('');
  }
};

/* ---------- events (one delegated handler) ---------- */
document.addEventListener('click', function (e) {
  if (!e.target.closest || !e.target.closest('#gvRoot')) return;
  const q = function (sel) { return e.target.closest(sel); }, res = function (r) { if (r) toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); };
  let el;
  if ((el = q('[data-gvt]'))) { GVUI.tab = el.dataset.gvt; GVUI.anim = true; }
  else if ((el = q('[data-gvpol]'))) { const p = el.dataset.gvpol.split(':'); res(p[0] === 'on' ? govPolicyEnable(p[1]) : govPolicyDisable(p[1], 'ended by the mayor')); }
  else if ((el = q('[data-gvsetprio]'))) GVUI.prio = el.dataset.gvsetprio;
  else if ((el = q('[data-gvproj]'))) res(govProjectStart(el.dataset.gvproj, GVUI.prio));
  else if ((el = q('[data-gvprio]'))) { const p = el.dataset.gvprio.split(':'); res(govProjectSetPrio(+p[0], p[1])); }
  else if ((el = q('[data-gvcancel]'))) res(govProjectCancel(+el.dataset.gvcancel));
  else if ((el = q('[data-gvborrow]'))) res(govBorrow(+el.dataset.gvborrow));
  else if ((el = q('[data-gvrepay]'))) res(govRepay(+el.dataset.gvrepay));
  else if ((el = q('[data-gvapply]'))) govApplyTaxes();
  else if ((el = q('[data-gvreset]'))) GVUI.draft = null;
  else if ((el = q('[data-gvheat]'))) { closeModal(); setHeatmap(el.dataset.gvheat); toast('🗺️ ' + GOV_HEATS.find(function (h) { return h[0] === el.dataset.gvheat; })[2] + ' map (N to change)', ''); return; }
  else if ((el = q('[data-gvfly]'))) { const p = el.dataset.gvfly.split(','); closeModal(); flyToTile(+p[0], +p[1], 0.9); return; }
  else return;
  sfx('click'); govRender();
});
document.addEventListener('input', function (e) {
  const t = e.target; if (!t.closest || !t.closest('#gvRoot')) return;
  const lab = function (id, txt) { const n = document.getElementById(id); if (n) n.textContent = txt; };
  if (t.dataset.gvfund) lab('gvFv_' + t.dataset.gvfund, t.value + '%');
  else if (t.dataset.gvres) lab('gvFv_reserve', t.value + '%');
  else if (t.dataset.gvtax) lab('gvTv_' + t.dataset.gvtax, (t.dataset.gvtax === 'property' ? (+t.value).toFixed(1) : t.value) + '%');
});
document.addEventListener('change', function (e) {
  const t = e.target; if (!t.closest || !t.closest('#gvRoot')) return;
  const G = S.government;
  if (t.dataset.gvfund) { G.budget.funding[t.dataset.gvfund] = clamp(+t.value / 100, 0, 1.5); govMaintSync(); govRefreshNow(); }
  else if (t.dataset.gvres) G.budget.reserveRate = clamp(+t.value / 100, 0, 0.3);
  else if (t.dataset.gvtax) { GVUI.draft = GVUI.draft || Object.assign({}, govTaxes()); GVUI.draft[t.dataset.gvtax] = +t.value; }
  else return;
  govRender();
});
function govApplyTaxes() {
  const D = GVUI.draft; if (!D) return;
  GOV_TAXES.forEach(function (t) { govSetTax(t[0], D[t[0]]); });
  if (S.p17 && S.p17.tax) { S.p17.tax.income = S.city.tax; S.p17.tax.business = Math.round((D.commercial + D.industrial) / 2); }
  GVUI.draft = null; if (typeof refreshTopbar === 'function') refreshTopbar();
  const T = govTaxes();
  toast('🧾 Taxes: residential ' + T.residential + '% · commercial ' + T.commercial + '% · industrial ' + T.industrial + '% · corporate ' + T.corporate + '% · property ' + T.property.toFixed(1) + '%', 'good');
  if (typeof logHistory === 'function') logHistory('🧾', 'New city tax rates (residential ' + T.residential + '%, commercial ' + T.commercial + '%)', 'policy');
}
/* a funding change shows its effect at once (services re-evaluated; the economy follows on the next tick) */
function govRefreshNow() { govSafe('refresh', function () { govServicesHour(); govSatisfactionHour(); }); }
setInterval(function () { if (GOV.dirtyUi && document.getElementById('gvRoot') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#gvRoot input'))) { GOV.dirtyUi = 0; govRender(); } }, 2000);

/* ---------- Smart Government Advisor (real data only) ---------- */
function govAdvice() {
  if (!S || !S.government || S.city.population < 100) return [];
  const G = S.government, sv = G.services, B = govBudgetSummary(), T = govTaxes(), out = [], add = function (msg, tab) { out.push({ msg: msg, tab: tab }); };
  if (sv.health && sv.health.load > 0.88 && sv.health.beds > 0) add('🏥 Hospital capacity is reaching ' + Math.round(sv.health.load * 100) + '%', 'health');
  if (sv.health && sv.health.beds === 0 && S.city.population > 300) add('🏥 The city has no hospital beds', 'health');
  if (G.maint.roads && G.maint.roads.v < 50) add('🛣️ Road maintenance is below safe levels (' + G.maint.roads.v + '%)', 'maintenance');
  const lowEdu = G.districts.filter(function (d) { return d.pop > 50 && d.education < 40; }).sort(function (a, b) { return b.pop - a.pop; })[0];
  if (lowEdu) add('🎓 Education coverage is low in ' + lowEdu.name + ' (' + lowEdu.education + '%)', 'education');
  if (sv.police && sv.police.resp > 10 && (GOV.cache.prevPol === undefined || sv.police.resp >= GOV.cache.prevPol)) add('🚓 Police response time is increasing (' + sv.police.resp.toFixed(1) + ' min)', 'safety');
  if (sv.fire && sv.fire.resp > 12) add('🚒 Fire response time is ' + sv.fire.resp.toFixed(1) + ' min — build a fire station closer to homes', 'fire');
  if (T.commercial > 18) add('🧾 Your tax rate is reducing commercial growth (commercial ' + T.commercial + '%)', 'taxes');
  if (T.industrial > 20) add('🏭 Industrial tax ' + T.industrial + '% is slowing factories', 'taxes');
  const h = G.budget.hist; if (B.deficit && h.length > 1 && (h[h.length - 1].inc - h[h.length - 1].exp) < (h[h.length - 2].inc - h[h.length - 2].exp)) add('📉 Budget deficit is increasing', 'budget'); else if (B.deficit) add('📉 The city runs a budget deficit', 'budget');
  if (S.city.population > 300 && B.expenses > 0 && G.budget.reserve < B.expenses * 0.1 && S.budget < B.expenses * 2) add('🏦 Emergency reserve is dangerously low (' + money(G.budget.reserve) + ')', 'budget');
  ['power', 'water', 'bridges', 'buildings'].forEach(function (k) { const m = G.maint[k]; if (m && (m.level === 'Critical' || m.level === 'Failed')) add('⚠️ ' + m.name + ' maintenance is ' + m.level.toUpperCase(), 'maintenance'); });
  if (sv.waste && sv.waste.quality < 30 && S.city.population > 500) add('🗑️ Waste is piling up — waste service quality ' + Math.round(sv.waste.quality), 'maintenance');
  if (sv.water && sv.water.coverage < 0.8 && S.city.population > 300) add('💧 Water supply covers only ' + Math.round(sv.water.coverage * 100) + '% of demand', 'maintenance');
  if (sv.electricity && sv.electricity.coverage < 0.8 && S.city.population > 300) add('⚡ Power supply covers only ' + Math.round(sv.electricity.coverage * 100) + '% of demand', 'maintenance');
  if (G.approval.value < 40) add('🏛️ City approval is ' + G.approval.label.toUpperCase() + ' (' + Math.round(G.approval.value) + ')', 'satisfaction');
  return out;
}
function govAdviceRules() { return govAdvice().slice(0, 3).map(function (a, i) { return { id: 'gov_' + i + '_' + a.msg.length, ok: true, msg: a.msg, act: { type: 'gov', tab: a.tab } }; }); }
(function () {
  const da = window.doAdviceAction;
  if (typeof da === 'function' && !da.__p18) { window.doAdviceAction = function (act) { if (act && act.type === 'gov') { openGovernment(act.tab || 'overview'); return; } return da.apply(this, arguments); }; window.doAdviceAction.__p18 = true; }
})();

/* ---------- daily CITY GOVERNMENT REPORT ---------- */
function govReportDay() {
  const G = gov(), sv = G.services, B = govBudgetSummary(), q = function (k) { return sv[k] ? Math.round(sv[k].quality) : 0; };
  const adv = govAdvice(), problems = adv.map(function (a) { return a.msg; }).slice(0, 5);
  const actions = adv.slice(0, 5).map(function (a) { return { health: 'Build clinics / hospitals or raise healthcare funding', education: 'Build schools where coverage is low', safety: 'Build a police station or raise police funding', fire: 'Build a fire station near the slow districts', taxes: 'Lower commercial / industrial tax', budget: 'Cut funding, raise taxes or take a city loan', maintenance: 'Raise maintenance funding or enact Road Maintenance Priority', satisfaction: 'Improve the weakest services' }[a.tab] || 'Review the city services'; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  const r = { d: gameDay() - 1, pop: Math.round(S.city.population), rev: Math.round(B.income), exp: Math.round(B.expenses), bal: Math.round(B.balance), health: q('health'), edu: q('education'), safety: q('police'), fire: q('fire'), transport: q('transport'), maint: G.maint.avg || 0, hap: Math.round(S.city.happiness), approval: Math.round(G.approval.value), problems: problems, actions: actions };
  G.reports.push(r); if (G.reports.length > 10) G.reports.shift();
  GOV.cache.prevPol = sv.police ? sv.police.resp : undefined;
}
function govReportHtml(r) {
  const row = function (k, v, c) { return '<div class="rep"><span>' + k + '</span><b class="' + (c || '') + '">' + v + '</b></div>'; };
  return row('👥 Population', fmt(r.pop)) + row('📈 Revenue', money(r.rev)) + row('📉 Expenses', money(r.exp)) + row('⚖️ Balance', signMoney(r.bal), r.bal < 0 ? 'neg' : 'pos') +
    row('🏥 Healthcare', r.health) + row('🎓 Education', r.edu) + row('🚓 Safety', r.safety) + row('🚒 Fire', r.fire) + row('🚌 Transport', r.transport) + row('🛠️ Maintenance', r.maint + '%') + row('😊 Happiness', r.hap) + row('🏛️ Approval', r.approval + ' · ' + govApprovalLabel(r.approval)) +
    '<div class="rep"><span>⚠️ Major problems</span><b>' + ((r.problems || []).length ? r.problems.map(esc).join('<br>') : 'none') + '</b></div><div class="rep"><span>✅ Recommended actions</span><b>' + ((r.actions || []).length ? r.actions.map(esc).join('<br>') : '—') + '</b></div>';
}
(function () {
  const rl = window.reportLines;
  if (typeof rl === 'function' && !rl.__p18) { window.reportLines = function (r) { const h = rl.apply(this, arguments); if (!S || !S.government || !S.government.reports.length) return h; const g = S.government.reports[S.government.reports.length - 1]; return h + '<div class="rep"><span>🏛️ Approval</span><b>' + g.approval + ' · ' + govApprovalLabel(g.approval) + '</b></div><div class="rep"><span>⚖️ City balance</span><b class="' + (g.bal < 0 ? 'neg' : 'pos') + '">' + signMoney(g.bal) + '</b></div>' + (g.problems.length ? '<div class="rep"><span>⚠️ Government</span><b>' + esc(g.problems[0]) + '</b></div>' : ''); }; window.reportLines.__p18 = true; }
})();

/* ---------- heatmaps: Government Service Map (cached per game hour + map version) ---------- */
GOV_HEATS.forEach(function (h) { HEATMAPS.push({ id: h[0], icon: h[1], name: h[2], low: h[3], high: h[4], ramp: h[0] === 'TAX PRESSURE' || h[0] === 'INFRA RISK' ? 'bad' : 'good' }); if (OVERLAYS.indexOf(h[0]) < 0) OVERLAYS.push(h[0]); });
if (typeof MMAP_HEATS !== 'undefined') ['POLICE COVERAGE', 'FIRE COVERAGE', 'GOV HEALTHCARE', 'SERVICE QUALITY'].forEach(function (id) { if (MMAP_HEATS.indexOf(id) < 0) MMAP_HEATS.push(id); });
function govDistrictTiles(val) {
  const g = new Float32Array(MAP.W * MAP.H), D = GOV.cache.distByK || {};
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) { const d = D[govDistrictIndex(x, y)]; if (d) g[idx(x, y)] = clamp(val(d), 0, 1); }
  return g;
}
function govHeatGrid(mode) {
  if (!GOV_HEATS.some(function (h) { return h[0] === mode; })) return null;
  const key = mode + ':' + GOV.hourKey + ':' + MAP.version, c = GOV.cache;
  if (c.heatKey === key && c.heat) return c.heat;
  const gr = govGrids(), sv = S.government.services, cp = function (src, k) { const g = new Float32Array(src.length); for (let i = 0; i < src.length; i++) g[i] = clamp(src[i] * k, 0, 1); return g; };
  let g = null;
  switch (mode) {
    case 'GOV HEALTHCARE': g = cp(gr.health, 0.6 + 0.4 * (sv.health ? sv.health.quality / 100 : 0.6)); break;
    case 'GOV EDUCATION': g = cp(gr.education, 1); break;
    case 'POLICE COVERAGE': g = cp(gr.police, 1); break;
    case 'FIRE COVERAGE': g = cp(gr.fire, 1); break;
    case 'PUBLIC TRANSPORT': g = cp(gr.transport, 1); break;
    case 'MAINTENANCE': g = govDistrictTiles(function (d) { return d.maint / 100; }); break;
    case 'INFRA RISK': g = govDistrictTiles(function (d) { return (100 - d.maint) / 100; }); break;
    case 'GOV SATISFACTION': g = govDistrictTiles(function (d) { return d.govSat / 100; }); break;
    case 'SERVICE QUALITY': g = govDistrictTiles(function (d) { return (d.health + d.education + d.safety + d.fire + d.transport + d.maint) / 600; }); break;
    case 'TAX PRESSURE': { const tp = govTaxPressure() / 100; g = govDistrictTiles(function (d) { return (0.25 + tp * 0.75) * clamp(d.land, 0.4, 2) / 2 + tp * 0.3; }); break; }
  }
  c.heat = g; c.heatKey = key;
  return g;
}
(function () {
  const ph = window.p9HeatGrid;
  window.p9HeatGrid = function (mode) { if (S && S.government) { const g = govSafe('heatmap', function () { return govHeatGrid(mode); }); if (g) return g; } return typeof ph === 'function' ? ph.apply(this, arguments) : null; };
})();

/* ---------- search and command palette ---------- */
(function () {
  const sc = window.searchCommands;
  if (typeof sc === 'function') window.searchCommands = function (q) {
    const out = sc.apply(this, arguments); if (!S || !S.government) return out;
    GOV_TABS.forEach(function (t) { out.push({ label: 'City Management: ' + t[1].replace(/^\S+\s/, ''), icon: t[1].split(' ')[0], kw: 'government city management ' + t[0], run: function () { openGovernment(t[0]); } }); });
    Object.keys(GOV_POLICIES).forEach(function (id) { out.push({ label: 'Policy: ' + GOV_POLICIES[id].name, icon: GOV_POLICIES[id].icon, kw: 'policy government', run: function () { openGovernment('policies'); } }); });
    Object.keys(GOV_PROJECTS).forEach(function (id) { out.push({ label: 'Project: ' + GOV_PROJECTS[id].name, icon: GOV_PROJECTS[id].icon, kw: 'project government build', run: function () { openGovernment('projects'); } }); });
    return out;
  };
  const pc = window.paletteCommands;
  if (typeof pc === 'function') window.paletteCommands = function () {
    const C = pc.apply(this, arguments); if (!S || !S.government) return C;
    const add = function (label, icon, tab, kw) { C.push({ label: label, icon: icon, run: function () { if (typeof closePalette === 'function') closePalette(); openGovernment(tab); }, kw: kw }); };
    add('Open City Management', '🏛️', 'overview', 'government city management approval');
    add('Open City Budget', '💰', 'budget', 'budget deficit loan debt reserve');
    add('Open City Taxes', '🧾', 'taxes', 'tax residential commercial industrial corporate property');
    add('Open Policies', '📜', 'policies', 'policy green transport education');
    add('Open Government Projects', '🏗️', 'projects', 'project hospital university metro highway');
    add('Open Citizen Satisfaction', '😊', 'satisfaction', 'satisfaction approval');
    add('Open Government Report', '📰', 'reports', 'report daily government');
    return C;
  };
})();

/* ---------- F3 debug lines ---------- */
function govDebugLines() {
  const G = S && S.government; if (!G) return '';
  const sv = G.services, q = function (k) { return sv[k] ? Math.round(sv[k].quality) : '—'; };
  return '\nGOVERNMENT hourly ' + GOV.prof.hour.toFixed(2) + ' ms · daily ' + GOV.prof.day.toFixed(2) + ' ms · errors ' + GOV.errors + ' · approval ' + Math.round(G.approval.value) + ' ' + G.approval.label + ' · sat ' + Math.round(G.sat.city || 0) +
    '\nservices: health ' + q('health') + ' edu ' + q('education') + ' police ' + q('police') + (sv.police ? ' (' + sv.police.resp.toFixed(1) + ' min)' : '') + ' fire ' + q('fire') + (sv.fire ? ' (' + sv.fire.resp.toFixed(1) + ' min)' : '') + ' transit ' + q('transport') + ' · maint ' + (G.maint.avg === undefined ? '—' : G.maint.avg + '%') + ' · policies ' + Object.keys(G.policies.active).length + ' · projects ' + G.projects.filter(function (p) { return p.status === 'building'; }).length + ' · events ' + G.events.active.map(function (e) { return e.id; }).join(',');
}
(function () {
  const dl = window.veDebugLines;
  if (typeof dl === 'function' && !dl.__p18) { window.veDebugLines = function () { return dl.apply(this, arguments) + govDebugLines(); }; window.veDebugLines.__p18 = true; }
})();

/* ---------- admin (OWNER / ADMIN / developer; every action passes AdminAuth.guard) ---------- */
function govInspect(what) {
  const G = gov(), B = govBudgetSummary();
  const o = {
    stats: { approval: Math.round(G.approval.value), label: G.approval.label, satisfaction: G.sat, districts: G.districts.length, errors: GOV.errors, lastError: GOV.lastErr, hourMs: +GOV.prof.hour.toFixed(2), dayMs: +GOV.prof.day.toFixed(2) },
    budget: Object.assign({}, B, { funding: G.budget.funding, loans: G.budget.loans, taxes: govTaxes() }),
    services: Object.keys(G.services).reduce(function (a, k) { const v = G.services[k]; a[k] = { quality: Math.round(v.quality), coverage: +v.coverage.toFixed(2), capacity: v.capacity, used: v.used, workers: v.workers, resp: v.resp !== undefined ? +v.resp.toFixed(1) : undefined }; return a; }, {}),
    projects: G.projects.map(function (p) { return { id: p.id, type: p.type, status: p.status, prio: p.prio, progress: +p.progress.toFixed(2), cost: p.cost, note: p.note }; }),
    policies: G.policies.active,
    approval: { value: +G.approval.value.toFixed(1), label: G.approval.label, hist: G.approval.hist.slice(-10), events: G.events.active },
    districts: G.districts.slice(0, 16).map(function (d) { return { name: d.name, pop: d.pop, health: d.health, education: d.education, safety: d.safety, fire: d.fire, transport: d.transport, maint: d.maint }; })
  };
  return what ? o[what] : o;
}
function adminGov(a) {
  if (a === 'tick') { GOV.hourKey = -1; govTick(); govServicesHour(); govMaintenanceHour(); govDistrictsHour(); govSatisfactionHour(); return { ok: true, msg: 'Government tick run' }; }
  if (a === 'day') { govBudgetDay(); govEventsDay(); govReportDay(); return { ok: true, msg: 'Government day run' }; }
  if (a === 'reset') { S.government = newGov(); GOV.hourKey = -1; GOV.cache = {}; govTick(); return { ok: true, msg: 'Government reset to defaults' }; }
  if (a && a.indexOf('event:') === 0) { const id = a.slice(6); return govEventStart(id, true) ? { ok: true, msg: GOV_EVENTS[id].name + ' started' } : { ok: false, reason: 'unknown or already active' }; }
  return { ok: false, reason: 'unknown action' };
}
if (typeof adminWrap === 'function') adminWrap('adminGov', function (a) { return 'gov:' + String(a).split(':')[0]; });
if (typeof ADMIN_CMD_CAT !== 'undefined') { ['gov:tick', 'gov:day', 'gov:reset', 'gov:event', 'console:government.reset'].forEach(function (k) { ADMIN_CMD_CAT[k] = 'city'; }); ['stats', 'budget', 'services', 'projects', 'approval'].forEach(function (k) { ADMIN_CMD_CAT['console:government.' + k] = 'view'; }); }
if (typeof ADM_COMMANDS !== 'undefined') {
  ['stats', 'budget', 'services', 'projects', 'approval'].forEach(function (k) { ADM_COMMANDS['government.' + k] = { help: 'government ' + k + ' (read only)', run: function () { return JSON.stringify(govInspect(k), null, 1); } }; });
  ADM_COMMANDS['government.reset'] = { help: 'reset the government (budget, taxes, policies, projects) to safe defaults', run: function () { const r = adminGov('reset'); return r.ok ? r.msg : r.reason; } };
}
if (typeof ADM_VIEWS !== 'undefined') {
  WC_CATS.push(['wc_gov', '🏛️', 'GOVERNMENT']);
  if (typeof ADMIN_GROUPS !== 'undefined') { const g = ADMIN_GROUPS.find(function (x) { return x[0] === 'ECONOMY'; }) || ADMIN_GROUPS.find(function (x) { return x[0] === 'CITY'; }); if (g && g[2].indexOf('wc_gov') < 0) g[2].push('wc_gov'); }
  ADM_VIEWS.wc_gov = function () {
    if (!S.government) return '';
    const I = govInspect();
    return aCard('🏛️ GOVERNMENT — INSPECT', '<pre class="small">' + esc(govDebugLines().trim()) + '</pre><div class="grid3">' + aKv('APPROVAL', I.approval.value + ' ' + I.approval.label) + aKv('BUDGET', money(S.budget)) + aKv('DEBT', money(I.budget.debt)) + aKv('RESERVE', money(I.budget.reserve)) + aKv('POLICIES', Object.keys(I.policies).join(', ') || '—') + aKv('PROJECTS', I.projects.filter(function (p) { return p.status === 'building'; }).length) + '</div>') +
      aCard('🧾 BUDGET & TAXES', '<pre class="small">' + esc(JSON.stringify(I.budget, null, 1)) + '</pre>') +
      aCard('🏥 SERVICES', '<pre class="small">' + esc(JSON.stringify(I.services, null, 1)) + '</pre>') +
      aCard('🏗️ PROJECTS · 📜 POLICIES', '<pre class="small">' + esc(JSON.stringify({ projects: I.projects, policies: I.policies }, null, 1)) + '</pre>') +
      aCard('📍 DISTRICT COVERAGE', '<pre class="small">' + esc(JSON.stringify(I.districts, null, 1)) + '</pre>') +
      aCard('⚙️ ACTIONS', '<div class="row admRowWrap"><button class="btn small gold" data-gva="tick">RUN GOVERNMENT TICK</button><button class="btn small" data-gva="day">RUN GOVERNMENT DAY</button>' + Object.keys(GOV_EVENTS).map(function (k) { return '<button class="btn small" data-gva="event:' + k + '">' + GOV_EVENTS[k].icon + ' ' + GOV_EVENTS[k].name + '</button>'; }).join('') + '<button class="btn small red" data-gva="reset">RESET GOVERNMENT</button></div>');
  };
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-gva]'); if (!b) return;
    const r = adminGov(b.dataset.gva); if (r) toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad');
    if (typeof renderAdminCenter === 'function' && ADM.open) renderAdminCenter();
  });
}
