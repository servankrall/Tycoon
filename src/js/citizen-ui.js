'use strict';
/* BLOCK CITY TYCOON — Part 20: Living City 3.0 UI
   CITY LIFE panel (City Life Score, district scores, Population Statistics 3.0, Smart City Analytics, Population Forecast,
   AI City Planner, opinions & comments, events, citizens), Citizen Inspector + Household Inspector, FOLLOW CITIZEN and
   route view, 10 citizen heatmaps, palette / search entries, mobile flow (Tap → Inspector → Follow → Route → Household),
   admin CITIZEN AI debug panel (real decision scores) and 20 guarded admin citizen tools. */

const CLUI = { tab: 'overview', anim: false, q: '', ins: null, insTab: 'profile' };
const CL_TABS = [['overview', '🌆 City Life'], ['population', '👥 Population'], ['analytics', '📊 Analytics'], ['forecast', '🔮 Forecast'], ['planner', '🧭 AI Planner'], ['opinions', '💬 Opinions'], ['events', '🎉 Events'], ['citizens', '🧑 Citizens']];
function clT(icon, label, value, sub, cls) { return e2Tile(icon, label, value, sub, cls); }
function clTbl(head, rows) { return typeof govTable === 'function' ? govTable(head, rows) : ''; }
function clBar(label, v, max, cls) { return e2Bar(label, clamp(v / (max || 100), 0, 1), Math.round(v) + (max === 100 || !max ? '' : ''), cls); }
function caiName(P) { return P ? esc(P.fn + ' ' + P.ln) : '—'; }
function caiPeople() { const out = []; AG.citizens.forEach(function (c) { if (!c.tourist) { const P = caiProfile(c); if (P) out.push(P); } }); return out; }

function openCityLife(tab) {
  if (!STARTED || !S) return;
  caiInstallInspector();
  cai(); if (!cai().stats) caiSafe('hour', caiHour); if (tab) CLUI.tab = tab; CLUI.anim = true;
  if (typeof closeMobilePage === 'function' && typeof MPAGE !== 'undefined' && MPAGE.el && !MPAGE.el.classList.contains('hidden')) closeMobilePage();
  showModal('🌆 CITY LIFE · ' + esc(S.city.name), '<div id="clRoot" class="gvRoot"></div>');
  $('modal').classList.add('p10Wide');
  clRender();
}
function clRender() {
  const root = document.getElementById('clRoot'); if (!root) return;
  const sc = root.querySelector('.e2Body') ? root.querySelector('.e2Body').scrollTop : 0;
  let body = '';
  try { body = (CL_VIEWS[CLUI.tab] || CL_VIEWS.overview)(); } catch (e) { body = '<p class="small">⚠️ ' + esc(e.message) + '</p>'; if (typeof logError === 'function') logError('City Life UI', e.message); }
  const A = cai(), s = A.stats || {};
  root.innerHTML = '<div class="e2Tabs mScroll">' + CL_TABS.map(function (t) { return '<button class="btn small ' + (CLUI.tab === t[0] ? 'gold' : '') + '" data-clt="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="e2Phase">CITY LIFE ' + Math.round(A.life.score) + ' · ' + esc(A.life.label).toUpperCase() + ' · ' + fmt(Math.round(S.city.population)) + ' CITIZENS · ' + (s.agents || 0) + ' SIMULATED</div>' +
    '<div class="e2Body gvBody' + (CLUI.anim ? ' gvAnim' : '') + '">' + body + '</div>';
  CLUI.anim = false;
  const b = root.querySelector('.e2Body'); if (b) b.scrollTop = sc;
}
function clHeatBtns() { return '<div class="mActs gvMap">' + CL_HEATS.map(function (h) { return '<button class="btn small" data-clheat="' + h[0] + '">🗺️ ' + h[1] + ' ' + h[2] + '</button>'; }).join('') + '</div>'; }
const CL_VIEWS = {
  overview: function () {
    const A = cai(), L = A.life, p = L.parts || {}, s = A.stats || {};
    const parts = [['😊 Happiness', p.happiness], ['🏛 Services', p.services], ['🌿 Environment', p.environment], ['🛡 Safety', p.safety], ['🏠 Housing', p.housing], ['💼 Jobs', p.jobs], ['🚦 Commute', p.commute], ['💬 Social', p.social], ['🗳 Approval', p.approval]];
    return '<div class="e2Grid">' + clT('🌆', 'City Life Score', Math.round(L.score), L.label, L.score < 45 ? 'warn' : '') + clT('😊', 'Happiness 3.0', Math.round(s.hap || 0), '13 factors · ' + (s.agents || 0) + ' citizens') +
      clT('💼', 'Employment', Math.round(s.employment || 0) + '%', fmt(Math.round(SIM.employed || 0)) + ' employed') + clT('🚦', 'Commute', (s.commute || 0).toFixed(1) + ' min', 'average') + clT('🏠', 'Households', fmt(s.households || 0), s.hhSize + ' people each') + clT('🤝', 'Social ties', (s.friends || 0).toFixed(1), 'friends per citizen') + '</div>' +
      '<div class="e2Card"><h4>City Life Score</h4>' + parts.map(function (r) { return e2Bar(r[0], (r[1] || 0) / 100, Math.round(r[1] || 0), (r[1] || 0) < 45 ? 'neg' : ''); }).join('') + '</div>' +
      '<div class="e2Card"><h4>District Life Score</h4>' + clTbl(['District', 'Score', 'Rating', 'Residents', 'Happiness', ''], (L.districts || []).map(function (d) { return [esc(d.name), d.score, d.label, fmt(d.pop), d.hap, '<button class="btn small" data-clfly="' + d.x + ',' + d.y + '">📍</button>']; })) + '</div>' +
      '<div class="e2Card"><h4>Happiness 3.0 — 13 factors (city average)</h4>' + CAI_FACTORS.map(function (f) { const v = (s.factors || {})[f[0]] || 0; return e2Bar(f[1] + ' ' + f[2], v / 100, v, v < 45 ? 'neg' : ''); }).join('') + '</div>' + clHeatBtns();
  },
  population: function () {
    const A = cai(), s = A.stats || {}, st = s.stages || {}, tot = Object.keys(st).reduce(function (a, k) { return a + st[k]; }, 0) || 1, edu = s.edu || [0, 0, 0, 0, 0], en = edu.reduce(function (a, b) { return a + b; }, 0) || 1, P10 = S.p10 ? S.p10.pop : null;
    return '<div class="e2Grid">' + clT('👥', 'Population', fmt(Math.round(S.city.population)), (s.agents || 0) + ' simulated in detail') + clT('🏠', 'Households', fmt(s.households || 0), s.hhSize + ' per household') + clT('💰', 'Average wage', money(s.income || 0) + '/mo', 'simulated citizens') +
      clT('🤒', 'Sick', s.sick || 0, 'in the sample') + (P10 ? clT('👶', 'Births (year)', fmt(Math.round(P10.year.births)), '') + clT('🕊', 'Deaths (year)', fmt(Math.round(P10.year.deaths)), '') + clT('🧳', 'Migration (year)', '+' + fmt(Math.round(P10.year.migIn)) + ' / −' + fmt(Math.round(P10.year.migOut)), '') : '') + '</div>' +
      '<div class="e2Card"><h4>Life stages</h4>' + CAI_STAGES.map(function (x) { return e2Bar(x[1] + ' (' + x[2] + (x[3] < 200 ? '–' + x[3] : '+') + ')', (st[x[0]] || 0) / tot, fmt(st[x[0]] || 0)); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Education</h4>' + edu.map(function (n, i) { return e2Bar(typeof EDU_LEVELS !== 'undefined' ? EDU_LEVELS[i] : 'Level ' + i, n / en, Math.round(n / en * 100) + '%'); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Commute modes</h4>' + Object.keys(s.modes || {}).map(function (k) { const n = (s.agents || 1); return e2Bar(k, s.modes[k] / n, Math.round(s.modes[k] / n * 100) + '%'); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Migration</h4><p class="small">Moved within the city: <b>' + A.migration.moved + '</b> households · left the city: <b>' + A.migration.left + '</b> · the City Life Score makes the city ' + (A.life.score >= 60 ? 'more' : 'less') + ' attractive to newcomers.</p></div>';
  },
  analytics: function () {
    const A = cai(), H = A.hist, s = A.stats || {};
    const spark = function (key, label) { const v = H.map(function (x) { return x[key]; }); return '<div class="e2Card"><h4>' + label + '</h4>' + (typeof e2Spark === 'function' ? e2Spark(v) : '<p class="small">' + v.slice(-10).join(' · ') + '</p>') + '<p class="small">' + (v.length ? 'now ' + v[v.length - 1] + ' · ' + v.length + ' days' : 'collecting — one sample per game day') + '</p></div>'; };
    return '<div class="e2Grid">' + clT('🧠', 'Decisions', fmt(CAI.prof.decisions), 'utility-scored') + clT('⏱', 'AI cost', CAI.prof.ms.toFixed(2) + ' ms', 'per tick') + clT('🤝', 'Friends', (s.friends || 0).toFixed(1), 'per citizen') + clT('🎉', 'Event visits', fmt(A.events.attended), '') + '</div>' +
      spark('life', '🌆 City Life Score') + spark('hap', '😊 Happiness') + spark('emp', '💼 Employment %') + spark('commute', '🚦 Commute (min)') + spark('approval', '🗳 Approval') + spark('pop', '👥 Population');
  },
  forecast: function () {
    const F = caiForecast(), pop = S.city.population || 1;
    return '<div class="e2Card"><h4>Population Forecast</h4><p class="small">From today\'s births, deaths and migration (EconomyEngine / living world) and the City Life Score; the range widens with time.</p>' +
      clTbl(['In', 'Population', 'Range', 'Change', 'Seniors'], F.map(function (f) { return [f.years + (f.years === 1 ? ' year' : ' years'), fmt(f.pop), fmt(f.low) + ' – ' + fmt(f.high), (f.pop >= pop ? '+' : '') + Math.round((f.pop / pop - 1) * 100) + '%', fmt(f.seniors)]; })) + '</div>';
  },
  planner: function () {
    const out = caiPlanner();
    return '<div class="e2Card"><h4>🧭 AI City Planner</h4><p class="small">Suggestions only — the planner never builds anything. Each one names the data it comes from.</p>' +
      out.map(function (p) { return '<div class="between small" style="margin:6px 0"><span>' + p.icon + ' <b>' + esc(p.text) + '</b><br><span class="muted">' + esc(p.why) + '</span></span>' + (p.at ? '<button class="btn small" data-clfly="' + p.at.x + ',' + p.at.y + '">📍</button>' : '') + '</div>'; }).join('') + '</div>';
  },
  opinions: function () {
    const A = cai();
    return '<div class="e2Card"><h4>Opinions (city average, −100 … +100)</h4>' + CAI_TOPICS.map(function (t) { const v = A.opinions[t[0]] || 0; return e2Bar(t[1], (v + 100) / 200, (v > 0 ? '+' : '') + v, v < -20 ? 'neg' : ''); }).join('') + '<p class="small">Opinions come from each citizen\'s own experience (commute, rent, job, air, safety …) and move City Approval by up to ±4 points.</p></div>' +
      '<div class="e2Card"><h4>What citizens say</h4>' + (A.comments.length ? A.comments.slice(0, 14).map(function (c) { return '<p class="small">' + (c[3] ? '😟' : '🙂') + ' <b>' + esc(c[1]) + '</b> “' + esc(c[2]) + '”</p>'; }).join('') : '<p class="small">Comments appear after the first game day.</p>') + '</div>';
  },
  events: function () {
    const A = cai(), ev = S.events.active.filter(function (a) { return a.kind === 'global' || a.kind === 'dyn'; });
    const going = AG.citizens.filter(function (c) { return c.state === 'GO_EVENT'; }).length, at = AG.citizens.filter(function (c) { return c.state === 'GO_EVENT' && c.inside; }).length;
    return '<div class="e2Grid">' + clT('🎉', 'Running events', ev.length, ev.map(function (e) { return e.id; }).join(', ') || 'none') + clT('🚶', 'On the way', going, 'Event Crowd AI') + clT('🏟', 'At the venue', at, '') + clT('📈', 'Visits so far', fmt(A.events.attended), '') + '</div>' +
      '<div class="e2Card"><p class="small">During an event citizens with fun and social needs head to the venue (stadium, arena, plaza or park). Parking near the venue fills, so more of them take transit; car drivers get an extra penalty in the route choice.</p></div>';
  },
  citizens: function () {
    const q = CLUI.q.toLowerCase(), list = caiPeople().filter(function (P) { return !q || (P.fn + ' ' + P.ln).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return a.ln.localeCompare(b.ln); }).slice(0, 80);
    return '<div class="e2Card"><input id="clSearch" class="mInput" placeholder="Search a citizen by name…" value="' + esc(CLUI.q) + '" style="width:100%"></div>' +
      '<div class="e2Card">' + clTbl(['Name', 'Age', 'Stage', 'Job', 'Happiness', ''], list.map(function (P) { const a = caiAge(P); return [caiName(P), a, caiStageName(caiStageOf(a)), P.agent && P.agent.work ? CAI_CAREER[P.career.lvl] : P.rt === 'student' ? 'Student' : a >= 65 ? 'Retired' : 'Looking for work', Math.round(P.hap), '<button class="btn small" data-clins="' + P.id + '">🔍</button>']; })) + '</div>';
  }
};
document.addEventListener('click', function (e) {
  if (!e.target.closest || !e.target.closest('#clRoot')) return;
  const q = function (sel) { return e.target.closest(sel); }; let el;
  if ((el = q('[data-clt]'))) { CLUI.tab = el.dataset.clt; CLUI.anim = true; }
  else if ((el = q('[data-clheat]'))) { closeModal(); setHeatmap(el.dataset.clheat); return; }
  else if ((el = q('[data-clfly]'))) { const p = el.dataset.clfly.split(','); closeModal(); flyToTile(+p[0], +p[1], 0.9); return; }
  else if ((el = q('[data-clins]'))) { const P = CAI.live.get(+el.dataset.clins); if (P && P.agent) caiInspect(P.agent); return; }
  else return;
  sfx('click'); clRender();
});
document.addEventListener('input', function (e) { if (e.target && e.target.id === 'clSearch') { CLUI.q = e.target.value.slice(0, 40); const pos = e.target.selectionStart; clRender(); const n = document.getElementById('clSearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });
setInterval(function () { if (document.getElementById('clRoot') && !(document.activeElement && document.activeElement.id === 'clSearch')) clRender(); if (document.getElementById('caiIns')) caiInsRender(); }, 3000);

/* ---------- Citizen Inspector · Household Inspector ---------- */
const CAI_INS_TABS = [['profile', '🧑 Profile'], ['needs', '📊 Needs'], ['happy', '😊 Happiness'], ['routine', '🗓 Routine'], ['house', '🏠 Household'], ['social', '🤝 Social & memory'], ['opinions', '💬 Opinions']];
function caiAdmin() { return typeof AdminAuth !== 'undefined' && AdminAuth.active && AdminAuth.active(); }
function caiInspect(c, tab) {
  const P = caiProfile(c); if (!P) return;
  CLUI.ins = c; if (tab) CLUI.insTab = tab;
  showModal('🧑 ' + caiName(P), '<div id="caiIns" class="gvRoot"></div>');
  caiInsRender();
}
function caiInsRender() {
  const root = document.getElementById('caiIns'), c = CLUI.ins; if (!root || !c) return;
  const P = caiProfile(c); if (!P) return;
  const tabs = CAI_INS_TABS.concat(caiAdmin() ? [['debug', '🧠 AI debug']] : []);
  if (!tabs.some(function (t) { return t[0] === CLUI.insTab; })) CLUI.insTab = 'profile';
  const row = function (k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; }, age = caiAge(P), H = caiHousehold(P), home = citizenBuilding(c.home), work = citizenBuilding(c.work), dest = c.target ? citizenBuilding(c.target) : null, R = CAI_ROUTINES[P.rt] || CAI_ROUTINES.standard;
  let body = '';
  if (CLUI.insTab === 'profile') body = row('Citizen ID', '#' + P.id) + row('Age', age + ' · ' + caiStageName(caiStageOf(age))) + row('Personality', esc(c.pers || P.pers)) + row('Education', typeof EDU_LEVELS !== 'undefined' ? EDU_LEVELS[P.edu] : P.edu) +
    row('Job', work ? esc(bdef(work).name) + ' · ' + CAI_CAREER[P.career.lvl] : P.rt === 'student' ? 'Student' : age >= 65 ? 'Retired' : 'Looking for work') + row('Wage', money(P.wage) + '/mo') + row('Savings', money(P.sav)) + row('Home', home ? esc(districtName(home.x, home.y)) + ' · ' + esc(bdef(home).name) : '—') +
    row('Health', Math.round(P.health) + (P.sick ? ' · 🤒 sick' : '')) + row('Car', P.car ? '🚗 yes' : 'no') + row('Now', esc(String(c.state || 'IDLE').replace(/_/g, ' ')) + (dest ? ' → ' + esc(bdef(dest).name) : ''));
  else if (CLUI.insTab === 'needs') body = CAI_NEEDS.map(function (n) { const v = P.needs[n[0]]; return e2Bar(n[1] + ' ' + n[2], v / 100, Math.round(v), v < 30 ? 'neg' : ''); }).join('');
  else if (CLUI.insTab === 'happy') body = '<p class="small">Happiness 3.0: <b>' + Math.round(P.hap) + '</b></p>' + CAI_FACTORS.map(function (f) { const v = (P.f || {})[f[0]] || 0; return e2Bar(f[1] + ' ' + f[2], v / 100, Math.round(v), v < 40 ? 'neg' : ''); }).join('');
  else if (CLUI.insTab === 'routine') body = row('Routine', R[0] + (R[1] || R[2] ? ' · ' + R[1] + ':00–' + R[2] + ':00' : '')) + row('Today', esc(typeof citizenRoutine === 'function' ? citizenRoutine(c) : '')) + row('Commute', P.commute.mode !== 'none' ? P.commute.mode + ' · ' + P.commute.min.toFixed(1) + ' min' : '—') +
    (P.commuteOpts ? '<p class="small">Smart Commute options: ' + P.commuteOpts.map(function (o) { return o.m + ' ' + o.min + ' min'; }).join(' · ') + '</p>' : '') + row('Route', c.path && c.path.length ? (c.path.length - (c.pi || 0)) + ' waypoints' + (c.driving ? ' · driving' : '') : c.driving ? 'driving' : c.inside ? 'inside a building' : '—');
  else if (CLUI.insTab === 'house') body = H ? caiHouseholdHtml(H) : '<p class="small">No household.</p>';
  else if (CLUI.insTab === 'social') body = '<h4>Friends</h4>' + (P.friends.length ? P.friends.map(function (id) { const F = CAI.live.get(id); return F ? '<button class="btn small" data-caiins="' + id + '">' + caiName(F) + '</button> ' : ''; }).join('') : '<p class="small">No friends yet — coworkers and neighbours become friends over time.</p>') +
    '<h4>Memory</h4>' + (P.mem.length ? P.mem.map(function (m) { return '<p class="small">' + m[1] + ' Day ' + m[0] + ': ' + esc(m[2]) + '</p>'; }).join('') : '<p class="small">—</p>');
  else if (CLUI.insTab === 'opinions') body = CAI_TOPICS.map(function (t) { const v = Math.round(P.op[t[0]] || 0); return e2Bar(t[1], (v + 100) / 200, (v > 0 ? '+' : '') + v, v < -20 ? 'neg' : ''); }).join('');
  else if (CLUI.insTab === 'debug') body = caiDebugHtml(P);
  root.innerHTML = '<div class="e2Tabs mScroll">' + tabs.map(function (t) { return '<button class="btn small ' + (CLUI.insTab === t[0] ? 'gold' : '') + '" data-cait="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="e2Body gvBody">' + body + '</div><div class="mActs">' +
    '<button class="btn blue" data-caif="1">🎥 ' + (typeof MOBX !== 'undefined' && MOBX.track === c ? 'STOP FOLLOWING' : 'FOLLOW CITIZEN') + '</button><button class="btn" data-cair="1">🧭 ' + (CAI.route === c ? 'HIDE ROUTE' : 'SHOW ROUTE') + '</button>' + (H ? '<button class="btn" data-caih="' + H.id + '">🏠 HOUSEHOLD</button>' : '') + '</div>';
}
function caiHouseholdHtml(H) {
  const row = function (k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; }, home = citizenBuilding(H.home);
  return row('Household', 'The ' + esc(H.ln) + ' household') + row('Home', home ? esc(bdef(home).name) + ' · ' + esc(districtName(home.x, home.y)) : '—') + row('Members', H.adults.length + ' adult(s) · ' + H.kids.length + ' child(ren)') +
    row('Income', money(H.income) + '/mo') + row('Rent', money(H.rent) + '/mo' + (H.income > 0 ? ' · ' + Math.round(H.rent / H.income * 100) + '%' : '')) + row('Savings', money(H.sav)) + row('Cars', H.car) + row('Satisfaction', Math.round(H.sat)) +
    '<h4>Members</h4>' + H.adults.map(function (id) { const F = CAI.live.get(id); return F ? '<button class="btn small" data-caiins="' + id + '">' + caiName(F) + ' · ' + caiAge(F) + '</button> ' : ''; }).join('') +
    H.kids.map(function (k) { const a = Math.floor((gameDay() - k.by) / CAI_YEAR_DAYS); return '<span class="small">' + esc(k.fn) + ' · ' + a + ' (' + caiStageName(caiStageOf(a)) + ')</span> '; }).join('');
}
function caiHouseholdInspect(id) { const H = cai().households[id]; if (!H) return; showModal('🏠 The ' + esc(H.ln) + ' household', '<div class="gvRoot"><div class="e2Body gvBody">' + caiHouseholdHtml(H) + '</div></div>'); }
/* AI debug panel: the real utility scores of the last decision, split into their parts */
function caiDebugHtml(P) {
  const R = caiRates();
  return '<p class="small">Last decision (utility, highest first):</p>' + (P.dec || []).map(function (d, i) { return '<div class="small"><b>' + (i === 0 ? '▶ ' : '') + d.s.replace(/_/g, ' ') + '</b> = ' + d.u + ' <span class="muted">(' + Object.keys(d.p).map(function (k) { return k + ' ' + d.p[k]; }).join(' + ') + ')</span></div>'; }).join('') +
    (P.commuteOpts ? '<p class="small">Commute scores: ' + P.commuteOpts.map(function (o) { return o.m + ' ' + o.s; }).join(' · ') + '</p>' : '') +
    '<p class="small">LOD rate: near ' + R.near.toFixed(1) + ' Hz · mid ' + R.mid.toFixed(1) + ' Hz · far statistical · AI tick ' + CAI.prof.ms.toFixed(2) + ' ms · decision ' + CAI.prof.decMs.toFixed(3) + ' ms · errors ' + CAI.errors + '</p>';
}
document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  const inIns = e.target.closest('#caiIns, .gvRoot'); if (!inIns) return;
  const q = function (sel) { return e.target.closest(sel); }; let el;
  if ((el = q('[data-cait]'))) { CLUI.insTab = el.dataset.cait; caiInsRender(); }
  else if ((el = q('[data-caiins]'))) { const P = CAI.live.get(+el.dataset.caiins); if (P && P.agent) caiInspect(P.agent, 'profile'); }
  else if ((el = q('[data-caih]'))) caiHouseholdInspect(+el.dataset.caih);
  else if ((el = q('[data-caif]'))) { const c = CLUI.ins; if (c) { closeModal(); caiFollow(c); } }
  else if ((el = q('[data-cair]'))) { const c = CLUI.ins; CAI.route = CAI.route === c ? null : c; caiInsRender(); }
  else return;
  sfx('click');
});
function caiFollow(c) { if (!c) return; CAI.follow = c; CAI.route = c; if (typeof startTracking === 'function') startTracking(c); }

/* route view: drawn on top of the selection layer (renderer's drawSelection, not the Visual Engine) */
(function () {
  const ds = window.drawSelection; if (typeof ds !== 'function' || ds.__p20) return;
  window.drawSelection = function () {
    ds.apply(this, arguments);
    const c = CAI.route; if (!c) return;
    if (AG.citizens.indexOf(c) < 0) { CAI.route = null; return; }
    let pts = null;
    if (c.driving) { const v = AG.vehicles.find(function (x) { return x.passenger === c; }); if (v && v.path) pts = [{ x: v.x, y: v.y }].concat(v.path.slice(v.seg || 0).map(function (i) { return tileCenter(i); })); }
    else if (c.path && c.path.length) pts = [{ x: c.x, y: c.y }].concat(c.path.slice(c.pi || 0));
    ctx.save(); ctx.lineWidth = 3 / CAM.zoom; ctx.strokeStyle = 'rgba(255,209,102,.9)'; ctx.setLineDash([8 / CAM.zoom, 5 / CAM.zoom]); ctx.lineDashOffset = -FX.time * 30;
    if (pts && pts.length > 1) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
    ctx.setLineDash([]);
    const t = c.target ? citizenBuilding(c.target) : null; if (t) { const tc = buildingCenter(t); ctx.fillStyle = 'rgba(255,209,102,.95)'; ctx.beginPath(); ctx.arc(tc.x, tc.y, 6 / Math.max(0.5, CAM.zoom), 0, 6.283); ctx.fill(); }
    ctx.strokeStyle = '#ffd166'; ctx.beginPath(); ctx.arc(c.x, c.y, 9 / Math.max(0.5, CAM.zoom), 0, 6.283); ctx.stroke();
    ctx.restore();
  };
  window.drawSelection.__p20 = true;
})();

/* citizens open the Citizen Inspector (desktop click; on mobile the inspector's PROFILE button) */
/* installed once the game runs: showAgentInfo lives in main.js (loaded later) and the mobile UI replaces it with its
   own inspector; there the desktop function is kept in MOBP.showAgentInfo0 (the inspector's PROFILE button) */
function caiInstallInspector() {
  const wrap = function (sa) { const f = function (a) { if (a && a.c && !a.c.tourist && caiOn()) { sfx('click'); caiInspect(a.c); return; } return sa.apply(this, arguments); }; f.__p20 = true; return f; };
  if (typeof MOBP !== 'undefined' && typeof MOBP.showAgentInfo0 === 'function') { if (!MOBP.showAgentInfo0.__p20) MOBP.showAgentInfo0 = wrap(MOBP.showAgentInfo0); }
  else if (typeof window.showAgentInfo === 'function' && !window.showAgentInfo.__p20) window.showAgentInfo = wrap(window.showAgentInfo);
}
(function () {
  // mobile inspector: ROUTE + HOUSEHOLD next to TRACK and PROFILE
  const ri = window.renderInspector;
  if (typeof ri === 'function') window.renderInspector = function () {
    const r = ri.apply(this, arguments);
    if (typeof MINS !== 'undefined' && MINS.kind === 'citizen' && MINS.ref && !MINS.ref.tourist && caiOn() && MINS.el) {
      const acts = MINS.el.querySelector('.miActs'), P = caiProfile(MINS.ref);
      if (acts && P && !acts.querySelector('[data-caimi]')) acts.insertAdjacentHTML('beforeend', '<button class="btn" data-caimi="route">🧭 ' + (CAI.route === MINS.ref ? 'HIDE ROUTE' : 'ROUTE') + '</button>' + (P.hh ? '<button class="btn" data-caimi="house">🏠 HOUSEHOLD</button>' : ''));
      const t = MINS.el.querySelector('.miTitle b'); if (t && P) t.textContent = P.fn + ' ' + P.ln;
    }
    return r;
  };
  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('[data-caimi]'); if (!el || typeof MINS === 'undefined' || !MINS.ref) return;
    const c = MINS.ref, P = caiProfile(c); if (!P) return;
    if (el.dataset.caimi === 'route') { CAI.route = CAI.route === c ? null : c; renderInspector(); }
    else if (el.dataset.caimi === 'house') { const H = caiHousehold(P) || (P.hh = 0, caiJoinHousehold(P, c)); caiHouseholdInspect(H.id); }
    sfx('click');
  });
})();

/* ---------- 10 citizen heatmaps ---------- */
const CL_HEATS = [['CITIZEN HAPPINESS', '😊', 'Citizen Happiness', 'Unhappy', 'Happy', 'good'], ['LIFE SCORE', '🌆', 'District Life Score', 'Critical', 'Thriving', 'good'], ['INCOME', '💰', 'Income', 'Low', 'High', 'good'], ['AGE', '🎂', 'Average Age', 'Young', 'Old', 'value'],
  ['EDUCATION LEVEL', '🎓', 'Education Level', 'Low', 'High', 'good'], ['UNEMPLOYMENT', '📉', 'Unemployment', 'Low', 'High', 'bad'], ['CITIZEN HEALTH', '❤️', 'Citizen Health', 'Poor', 'Good', 'good'], ['SOCIAL LIFE', '💬', 'Social Life', 'Lonely', 'Connected', 'good'],
  ['COMMUTE BURDEN', '😩', 'Commute Burden', 'Easy', 'Heavy', 'bad'], ['MIGRATION PRESSURE', '🧳', 'Migration Pressure', 'Staying', 'Leaving', 'bad']];
CL_HEATS.forEach(function (h) { if (typeof heatDef === 'function' && !heatDef(h[0])) HEATMAPS.push({ id: h[0], icon: h[1], name: h[2], low: h[3], high: h[4], ramp: h[5] }); if (typeof OVERLAYS !== 'undefined' && OVERLAYS.indexOf(h[0]) < 0) OVERLAYS.push(h[0]); });
function caiHeatGrid(mode) {
  if (!CL_HEATS.some(function (h) { return h[0] === mode; })) return null;
  const key = mode + ':' + MAP.version + ':' + Math.floor(S.clock.runSec / 5); if (CAI.heatKey === key && CAI.heat) return CAI.heat;
  const n = MAP.dN || Math.ceil(MAP.W / 8), sum = new Float32Array(n * n), cnt = new Float32Array(n * n), cell = function (x, y) { return Math.floor(clamp(y, 0, MAP.H - 1) / 8) * n + Math.floor(clamp(x, 0, MAP.W - 1) / 8); };
  const val = function (P) {
    const f = P.f || {};
    switch (mode) {
      case 'CITIZEN HAPPINESS': return P.hap / 100; case 'INCOME': return clamp(P.wage / 5000, 0, 1); case 'AGE': return clamp(caiAge(P) / 80, 0, 1); case 'EDUCATION LEVEL': return P.edu / 4;
      case 'UNEMPLOYMENT': return P.agent && !P.agent.work && caiAge(P) < 65 && P.rt !== 'student' ? 1 : 0; case 'CITIZEN HEALTH': return P.health / 100; case 'SOCIAL LIFE': return clamp((f.social || 0) / 100, 0, 1);
      case 'COMMUTE BURDEN': return clamp((P.commute.min - 10) / 50, 0, 1); case 'MIGRATION PRESSURE': { const H = caiHousehold(P); return H ? clamp((H.unhappy || 0) / 6 + (55 - H.sat) / 100, 0, 1) : 0; }
    }
    return 0;
  };
  if (mode === 'LIFE SCORE') (cai().life.districts || []).forEach(function (d) { const k = cell(d.x, d.y); sum[k] += d.score / 100; cnt[k]++; });
  else CAI.live.forEach(function (P) { const c = P.agent; if (!c || AG.citizens.indexOf(c) < 0) return; const h = citizenBuilding(c.home) || { x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE) }; const k = cell(h.x, h.y); sum[k] += val(P); cnt[k]++; });
  const g = new Float32Array(MAP.W * MAP.H);
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) { const k = cell(x, y); g[idx(x, y)] = cnt[k] ? clamp(sum[k] / cnt[k], 0, 1) : 0; }
  CAI.heat = g; CAI.heatKey = key; return g;
}
(function () { const ph = window.p9HeatGrid; window.p9HeatGrid = function (mode) { if (S && S.citizenAI) { const g = caiSafe('heatmap', function () { return caiHeatGrid(mode); }); if (g) return g; } return typeof ph === 'function' ? ph.apply(this, arguments) : null; }; })();

/* ---------- entry points: palette, search, F3, comments as thoughts, mobile page, World Builder report ---------- */
(function () {
  const pc = window.paletteCommands;
  if (typeof pc === 'function') window.paletteCommands = function () {
    const C = pc.apply(this, arguments); if (!S || !S.citizenAI) return C;
    const add = function (label, icon, tab, kw) { C.push({ label: label, icon: icon, run: function () { if (typeof closePalette === 'function') closePalette(); openCityLife(tab); }, kw: kw }); };
    add('Open City Life', '🌆', 'overview', 'citizens life score happiness district');
    add('Population Statistics', '👥', 'population', 'population age stages households education');
    add('Population Forecast', '🔮', 'forecast', 'forecast future years growth');
    add('AI City Planner', '🧭', 'planner', 'planner suggestions advice');
    add('Find a Citizen', '🧑', 'citizens', 'citizen inspector person name follow');
    return C;
  };
  const sc = window.searchCommands;
  if (typeof sc === 'function') window.searchCommands = function (q) { const out = sc.apply(this, arguments); if (!S || !S.citizenAI) return out; CL_TABS.forEach(function (t) { out.push({ label: 'City Life: ' + t[1].replace(/^\S+\s/, ''), icon: t[1].split(' ')[0], kw: 'citizen life population ' + t[0], run: function () { openCityLife(t[0]); } }); }); return out; };
  const dl = window.veDebugLines;
  if (typeof dl === 'function' && !dl.__p20) { window.veDebugLines = function () { const R = CAI.rate.last || { near: 0, mid: 0 }; return dl.apply(this, arguments) + (S && S.citizenAI ? '\nCITIZEN AI tick ' + CAI.prof.ms.toFixed(2) + ' ms · near ' + R.near.toFixed(1) + ' Hz · mid ' + R.mid.toFixed(1) + ' Hz · life ' + Math.round(S.citizenAI.life.score) + ' · errors ' + CAI.errors : ''); }; window.veDebugLines.__p20 = true; }
  // Comments 2.0 also appear as speech bubbles (real numbers, not canned lines)
  const tc = window.thoughtCandidates;
  if (typeof tc === 'function' && !tc.__p20) { window.thoughtCandidates = function (c) { const out = tc.apply(this, arguments) || []; if (!caiOn() || !c || c.tourist || !c.cid) return out; const P = CAI.live.get(c.cid); if (!P) return out;
    if (P.commute.mode !== 'none' && P.commute.min > 30) out.push({ text: Math.round(P.commute.min) + ' min to work…', bad: true }); if (P.mem[0] && P.mem[0][0] >= gameDay() - 1 && /Promoted|Graduated|Found a job/.test(P.mem[0][2])) out.push({ text: P.mem[0][2] + '!', bad: false }); if (P.sick) out.push({ text: 'I feel sick 🤒', bad: true });
    return out; }; window.thoughtCandidates.__p20 = true; }
  // City panel / mobile Economy page entry
  document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-act="citylife"]'); if (!el) return; e.preventDefault(); openCityLife('overview'); });
  const rt = window.renderTransitTab;
  if (typeof rt === 'function' && !rt.__p20) { window.renderTransitTab = function () { return (S && S.citizenAI ? '<button class="btn blue" style="width:100%;margin-bottom:8px" data-act="citylife">🌆 OPEN CITY LIFE — citizens · households · life score · forecast · planner</button>' : '') + rt.apply(this, arguments); }; window.renderTransitTab.__p20 = true; }
  const wr = window.wbReportHtml;
  if (typeof wr === 'function' && !wr.__p20) { window.wbReportHtml = function (W) { const h = wr.apply(this, arguments); if (!S || !S.citizenAI) return h; const v = caiValidate(); return h + '<p class="small">👥 Citizen Life Health: <b>' + v.health + '% · ' + v.label + '</b> · City Life Score ' + Math.round(S.citizenAI.life.score) + '</p>'; }; window.wbReportHtml.__p20 = true; }
})();

/* ---------- admin: CITIZEN AI debug panel + 20 citizen tools (guarded, hidden for normal players) ---------- */
function caiTarget() { const c = CLUI.ins && AG.citizens.indexOf(CLUI.ins) >= 0 ? CLUI.ins : (typeof MOBX !== 'undefined' && MOBX.track && MOBX.track.cid ? MOBX.track : null); return c || AG.citizens.find(function (x) { return !x.tourist; }) || null; }
function adminCitizenAI(a, v) {
  const c = caiTarget(), P = c ? caiProfile(c) : null, need = function () { if (!P) throw new Error('No citizen agent in the city'); };
  switch (a) {
    case 'inspect': need(); return { ok: true, msg: caiName(P).replace(/&amp;/g, '&') + ' · ' + caiAge(P) + ' · happiness ' + Math.round(P.hap), out: JSON.stringify(caiPack(P)) };
    case 'debug': need(); return { ok: true, msg: 'Decision scores', out: (P.dec || []).map(function (d) { return d.s + ' = ' + d.u + ' ' + JSON.stringify(d.p); }).join('\n') };
    case 'validate': { const r = caiValidate(); return { ok: true, msg: 'Citizen Life Health ' + r.health + '% · ' + r.label, out: r.issues.map(function (i) { return i.id + ': ' + i.what; }).join('\n') || 'No issues' }; }
    case 'fix': { const r = caiAutoFix(); return { ok: true, msg: r.actions.length + ' fix(es) · health ' + r.after.health + '%', out: r.actions.join('\n') || 'Nothing to fix' }; }
    case 'hour': caiHour(); return { ok: true, msg: 'Citizen AI hour pass run' };
    case 'day': caiDay(); return { ok: true, msg: 'Citizen AI day pass run' };
    case 'sick': need(); P.sick = true; P.health = Math.min(P.health, 30); c.pending = true; return { ok: true, msg: P.fn + ' is sick' };
    case 'heal': need(); P.sick = false; P.health = 100; return { ok: true, msg: P.fn + ' is healthy' };
    case 'promote': need(); P.career.lvl = Math.min(6, P.career.lvl + 1); caiMemory(P, '📈', 'Promoted to ' + CAI_CAREER[P.career.lvl]); return { ok: true, msg: P.fn + ' → ' + CAI_CAREER[P.career.lvl] };
    case 'fire': need(); c.work = 0; c.mem.work = 0; P.job = 0; caiMemory(P, '📉', 'Lost the job'); return { ok: true, msg: P.fn + ' lost the job' };
    case 'job': { need(); const j = caiPickJob(c, P); if (!j) return { ok: false, reason: 'No open job' }; c.work = j.id; c.mem.work = j.id; P.job = j.id; caiMemory(P, '💼', 'Found a job: ' + bdef(j).name); return { ok: true, msg: P.fn + ' works at ' + bdef(j).name }; }
    case 'need': { need(); const k = String(v || 'food'); if (!(k in P.needs)) return { ok: false, reason: 'Unknown need' }; P.needs[k] = 5; if (c.needs && k in c.needs) c.needs[k] = 5; c.pending = true; return { ok: true, msg: k + ' need set to 5' }; }
    case 'age': { need(); const y = clamp(+v || 30, 0, 99); P.by = gameDay() - y * CAI_YEAR_DAYS; c.age = y; return { ok: true, msg: P.fn + ' is now ' + y }; }
    case 'opinion': { const d = clamp(+v || -50, -100, 100); CAI.live.forEach(function (Q) { CAI_TOPICS.forEach(function (t) { Q.op[t[0]] = d; }); }); caiOpinions(caiPeople()); return { ok: true, msg: 'All opinions set to ' + d }; }
    case 'festival': { const g = typeof GLOBAL_EVENTS !== 'undefined' ? GLOBAL_EVENTS.find(function (x) { return x.id === 'festival'; }) : null; if (g && !S.events.active.some(function (x) { return x.id === 'festival'; })) startGlobalEvent(g); AG.citizens.forEach(function (x) { if (!x.tourist) x.pending = true; }); return { ok: true, msg: 'Festival started — Event Crowd AI active' }; }
    case 'migrate': { const H = P ? caiHousehold(P) : null; if (!H) return { ok: false, reason: 'No household' }; H.sat = 10; H.unhappy = 6; caiHousingAndMigration(caiPeople()); return { ok: true, msg: 'Housing AI / migration pass for the ' + H.ln + ' household' }; }
    case 'follow': need(); caiFollow(c); return { ok: true, msg: 'Following ' + P.fn };
    case 'forecast': return { ok: true, msg: 'Population forecast', out: caiForecast().map(function (f) { return f.years + 'y: ' + f.pop; }).join('\n') };
    case 'planner': return { ok: true, msg: 'AI City Planner', out: caiPlanner().map(function (p) { return p.text + ' — ' + p.why; }).join('\n') };
    case 'reset': { caiResetRuntime(); S.citizenAI = newCitizenAI(); AG.citizens.forEach(function (x) { x.cid = 0; }); return { ok: true, msg: 'Citizen AI reset — profiles are rebuilt' }; }
  }
  return { ok: false, reason: 'unknown action' };
}
const CAI_ADMIN_CAT = { inspect: 'view', debug: 'debug', validate: 'view', forecast: 'view', planner: 'view', follow: 'view', reset: 'delete' };
if (typeof adminWrap === 'function') adminWrap('adminCitizenAI', function (a) { return 'cai:' + a; });
if (typeof ADMIN_CMD_CAT !== 'undefined') ['inspect', 'debug', 'validate', 'fix', 'hour', 'day', 'sick', 'heal', 'promote', 'fire', 'job', 'need', 'age', 'opinion', 'festival', 'migrate', 'follow', 'forecast', 'planner', 'reset'].forEach(function (k) { ADMIN_CMD_CAT['cai:' + k] = CAI_ADMIN_CAT[k] || 'city'; });
/* the same 20 actions as admin tools (Admin Center → ADMIN TOOLS → Population, search, Ctrl+K, undo for changes) */
if (typeof atDef === 'function' && typeof AT_TOOLS !== 'undefined' && !AT_TOOLS.some(function (t) { return t.id === 'caiInspect'; })) {
  [['caiInspect', 'Citizen Inspector (AI profile)', 'view', 'inspect'], ['caiDebug', 'Citizen AI Decision Scores', 'view', 'debug'], ['caiValidate', 'Citizen Life Validator', 'view', 'validate'], ['caiAutoFix', 'Citizen Life Auto Fix', 'mut', 'fix'],
    ['caiHour', 'Run Citizen AI Hour', 'mut', 'hour'], ['caiDay', 'Run Citizen AI Day', 'mut', 'day'], ['caiSick', 'Make Citizen Sick', 'mut', 'sick'], ['caiHeal', 'Heal Citizen', 'mut', 'heal'], ['caiPromote', 'Promote Citizen', 'mut', 'promote'],
    ['caiFire', 'Remove Citizen Job', 'mut', 'fire'], ['caiJob', 'Job Search for Citizen', 'mut', 'job'], ['caiNeed', 'Drain Citizen Need', 'mut', 'need'], ['caiAge', 'Set Citizen Age', 'mut', 'age'], ['caiOpinion', 'Set City Opinions', 'mut', 'opinion'],
    ['caiFestival', 'Start Festival Crowd', 'mut', 'festival'], ['caiMigrate', 'Force Housing / Migration Pass', 'mut', 'migrate'], ['caiFollow', 'Follow Citizen', 'view', 'follow'], ['caiForecast', 'Population Forecast', 'view', 'forecast'],
    ['caiPlanner', 'AI City Planner', 'view', 'planner'], ['caiReset', 'Reset Citizen AI', 'del', 'reset']].forEach(function (t) {
    atDef(t[0], 'population', t[1], t[2], function (v) { const r = adminCitizenAI(t[3], v); if (!r) return 'Denied'; return (r.ok ? r.msg : '❌ ' + r.reason) + (r.out ? '\n' + r.out : ''); }, 'citizen ai ' + t[3]);
    if (typeof ADMIN_CMD_CAT !== 'undefined') ADMIN_CMD_CAT['tool:' + t[0]] = t[2] === 'view' ? 'view' : t[2] === 'del' ? 'delete' : 'city';
  });
}
(function () {
  if (typeof WC_CATS === 'undefined' || typeof ADM_VIEWS === 'undefined' || WC_CATS.some(function (c) { return c[0] === 'wc_cai'; })) return;
  WC_CATS.push(['wc_cai', '🧠', 'CITIZEN AI']);
  if (typeof ADMIN_GROUPS !== 'undefined') { const g = ADMIN_GROUPS.find(function (x) { return x[0] === 'CITIZENS'; }); if (g && g[2].indexOf('wc_cai') < 0) g[2].push('wc_cai'); }
  ADM_VIEWS.wc_cai = function () {
    if (!S || !S.citizenAI) return '<p class="small">No city.</p>';
    const R = caiRates(), v = caiValidate(), c = caiTarget(), P = c ? caiProfile(c) : null;
    return '<div class="card"><h4>🧠 Citizen AI · debug</h4><p class="small">Agents ' + AG.citizens.length + ' (near ' + ((R.counts || [])[0] || 0) + ' · mid ' + ((R.counts || [])[1] || 0) + ' · far ' + ((R.counts || [])[2] || 0) + ') · update rate near ' + R.near.toFixed(1) + ' Hz · mid ' + R.mid.toFixed(1) + ' Hz · far statistical</p>' +
      '<p class="small">AI tick ' + CAI.prof.ms.toFixed(2) + ' ms · hour pass ' + CAI.prof.hourMs.toFixed(1) + ' ms · day pass ' + CAI.prof.dayMs.toFixed(1) + ' ms · decisions ' + CAI.prof.decisions + ' (' + CAI.prof.decMs.toFixed(3) + ' ms each) · errors ' + CAI.errors + (CAI.lastErr ? ' · last: ' + esc(CAI.lastErr) : '') + '</p>' +
      '<p class="small">Citizen Life Health: <b>' + v.health + '% · ' + v.label + '</b>' + (v.issues.length ? ' — ' + v.issues.slice(0, 4).map(function (i) { return esc(i.what); }).join('; ') : '') + '</p></div>' +
      (P ? '<div class="card"><h4>' + caiName(P) + ' — real decision scores</h4>' + caiDebugHtml(P) + '</div>' : '') +
      '<div class="card"><div class="mActs">' + [['validate', '🔍 Validate'], ['fix', '🛠 Auto fix'], ['hour', '⏱ Hour pass'], ['day', '📅 Day pass'], ['festival', '🎉 Festival crowd'], ['debug', '🧠 Scores'], ['forecast', '🔮 Forecast'], ['planner', '🧭 Planner']].map(function (b) { return '<button class="btn small" data-caiadm="' + b[0] + '">' + b[1] + '</button>'; }).join('') + '</div></div>';
  };
  document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-caiadm]'); if (!el) return; const r = adminCitizenAI(el.dataset.caiadm); if (r) toast(r.ok ? '🧠 ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); if (typeof renderAdminCenter === 'function') renderAdminCenter(); });
})();
