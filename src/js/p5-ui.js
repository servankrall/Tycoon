'use strict';
/* BLOCK CITY TYCOON — PART 5 UI — story dialogues, palette, photo mode, challenges */
/* ============================== 15. P5 UI ============================== */
/* --- Themes & accessibility --------------------------------------------- */
const UI_THEMES = [
  { id: 'classic', name: '🧱 Classic' }, { id: 'neon', name: '🌈 Neon' }, { id: 'dark', name: '🌑 Dark' },
  { id: 'future', name: '🛸 Future' }, { id: 'golden', name: '👑 Golden' },
  { id: 'aurora', name: '🌌 Aurora', cosmetic: 'theme:aurora' }, { id: 'sunset', name: '🌇 Sunset', cosmetic: 'theme:sunset' }
];
function themeAvailable(t) { return !t.cosmetic || hasCosmetic(t.cosmetic) || (S && S.city.sandbox); }
function applyTheme() {
  if (!S) return;
  const t = UI_THEMES.find(function (x) { return x.id === S.settings.theme; });
  document.body.dataset.theme = t && themeAvailable(t) ? t.id : 'classic';
  applyAccessibility();
  applyIdentityTheme();
}
function applyAccessibility() {
  const se = S.settings, cl = document.body.classList;
  cl.toggle('reducedMotion', !!se.reducedMotion);
  cl.toggle('largeText', !!se.largeText);
  cl.toggle('highContrast', !!se.highContrast);
  cl.toggle('colorFriendly', !!se.colorFriendly);
}

/* --- Story dialogue box (portrait, name, text, Continue / choices) ---------------- */
const DLG = { queue: [], cur: null, i: 0, typing: null };
function showDialogue(lines, opts) {
  DLG.queue.push({ lines: lines || [], opts: opts || {} });
  if (!DLG.cur) nextDialogue();
}
function nextDialogue() {
  DLG.cur = DLG.queue.shift() || null; DLG.i = 0;
  UI.dialog = DLG.cur;
  if (!DLG.cur) { $('dialogBox').classList.add('hidden'); return; }
  renderDialogueLine();
}
function renderDialogueLine() {
  const d = DLG.cur, line = d.lines[DLG.i] || ['robo', ''];
  const who = STORY_CAST[line[0]] || STORY_CAST.robo;
  const box = $('dialogBox');
  box.classList.remove('hidden');
  $('dlgPortrait').textContent = who.icon; $('dlgPortrait').style.borderColor = who.color;
  $('dlgName').textContent = who.name; $('dlgName').style.color = who.color;
  $('dlgChapter').textContent = d.opts.chapter !== undefined ? 'CHAPTER ' + (d.opts.chapter + 1) + ' — ' + STORY[d.opts.chapter].title.toUpperCase() : (d.opts.choices ? 'DECISION' : '');
  const last = DLG.i >= d.lines.length - 1;
  const btns = $('dlgBtns');
  if (last && d.opts.choices) {
    btns.innerHTML = d.opts.choices.map(function (o) { return '<button class="btn gold small" data-dlgchoice="' + o.id + '" title="' + esc(o.text) + '">' + o.label + '<br><span style="font-weight:600;font-size:10px">' + esc(o.text) + '</span></button>'; }).join('');
    btns.querySelectorAll('[data-dlgchoice]').forEach(function (b) { b.onclick = function () { const f = d.opts.onChoice; const id = b.dataset.dlgchoice; sfx('click'); nextDialogue(); if (f) f(id); }; });
  } else {
    btns.innerHTML = '<button class="btn gold small" id="dlgNext">' + (last ? 'Continue ✓' : 'Continue →') + '</button>';
    $('dlgNext').onclick = advanceDialogue;
  }
  typeText($('dlgText'), line[1]);
  if (DLG.i === 0) sfx('notify');
}
function typeText(el, text) {
  if (DLG.typing) clearInterval(DLG.typing);
  if (S.settings.reducedMotion) { el.textContent = text; return; }
  let k = 0; el.textContent = '';
  DLG.typing = setInterval(function () { k += 2; el.textContent = text.slice(0, k); if (k >= text.length) { clearInterval(DLG.typing); DLG.typing = null; } }, 18);
}
function advanceDialogue() {
  const d = DLG.cur; if (!d) return;
  if (DLG.typing) { clearInterval(DLG.typing); DLG.typing = null; $('dlgText').textContent = d.lines[DLG.i][1]; return; }
  sfx('click');
  if (DLG.i < d.lines.length - 1) { DLG.i++; renderDialogueLine(); return; }
  const f = d.opts.onDone; nextDialogue(); if (f) f();
}
function clearDialogues() { DLG.queue = []; DLG.cur = null; UI.dialog = null; if (DLG.typing) clearInterval(DLG.typing); $('dialogBox').classList.add('hidden'); }

/* --- First-time experience: one short tip per system, never spammy ---------------------- */
const FTE = { queue: [], last: -1e9, timer: null };
function firstTime(key, title, text) {
  if (!PROFILE || PROFILE.seen[key] || !text) return;
  PROFILE.seen[key] = 1; saveProfile();
  FTE.queue.push({ title: title, text: text });
  pumpFirstTime();
}
function pumpFirstTime() {
  if (!FTE.queue.length || !$('firstTip').classList.contains('hidden')) return;
  const wait = Math.max(0, 12000 - (performance.now() - FTE.last));
  clearTimeout(FTE.timer);
  FTE.timer = setTimeout(function () {
    const t = FTE.queue.shift(); if (!t) return;
    $('ftTitle').textContent = t.title; $('ftText').textContent = t.text;
    $('firstTip').classList.remove('hidden'); FTE.last = performance.now();
    setTimeout(function () { hideFirstTip(); }, 9000);
  }, wait);
}
function hideFirstTip() { $('firstTip').classList.add('hidden'); pumpFirstTime(); }
const PANEL_TIPS = {
  build: ['🏗️ BUILD', 'Pick a building, then tap the map. Press R (or ROTATE) to turn it. Red means it cannot be placed — the label tells you why.'],
  city: ['🏙️ CITY', 'Your City Score, economy cycle, ranking and every statistic live here.'],
  companies: ['🏢 COMPANIES', 'Found companies, set product prices, run ad campaigns, invest and grow startups.'],
  research: ['🔬 TECHNOLOGY UNLOCKED', 'Research new technologies to improve your city.'],
  world: ['🌍 WORLD', 'Trade with other cities, sign agreements and follow global events.']
};

/* --- Smart tooltips ---------------------------------------------------------------------------- */
function buildingTooltip(d) {
  const st = unlockStatus(d), rows = [];
  rows.push('<b>' + d.icon + ' ' + esc(d.name) + '</b> <span class="tag">' + d.w + '×' + d.h + '</span>' + (d.public ? ' <span class="tag b">🏛️ budget</span>' : ''));
  rows.push('<div class="ttd">' + esc(d.desc || '') + '</div>');
  rows.push('<div class="ttr"><span>Cost</span><b>' + money(buildCost(d)) + '</b></div>');
  if (d.rev) rows.push('<div class="ttr"><span>Income</span><b class="pos">up to ' + money(d.rev, 1) + '/s</b></div>');
  if (d.goods) rows.push('<div class="ttr"><span>Production</span><b>' + d.goods + ' goods/s</b></div>');
  if (d.housing) rows.push('<div class="ttr"><span>Housing</span><b>' + d.housing + ' residents · rent ' + money(d.rent * 60, 1) + '/min</b></div>');
  const u = d.unlock || {}, req = [];
  if (u.pop) req.push(fmt(u.pop) + ' pop'); if (u.tech) req.push('🔬 ' + TECHS[u.tech].name); if (u.company) req.push(companyDef(u.company).name + ' Lv' + u.lvl); if (u.cityLevel) req.push('City Lv ' + u.cityLevel);
  if (d.techDistrict) req.push('Technology District'); if (d.needsWater) req.push('next to water'); if (d.extract) req.push(RESOURCE_TYPES[d.extract.type].name + ' deposit');
  if (!d.noRoad) req.push('road access');
  rows.push('<div class="ttr"><span>Requires</span><b>' + (req.join(', ') || '—') + '</b></div>');
  const eff = buildStatLine(d); if (eff) rows.push('<div class="ttr"><span>Effects</span><b>' + eff + '</b></div>');
  if (d.maint) rows.push('<div class="ttr"><span>Upkeep</span><b class="neg">' + money(d.maint, 2) + '/s</b></div>');
  if (!st.ok) rows.push('<div class="ttr"><span>🔒</span><b class="neg">' + esc(st.reason) + '</b></div>');
  return rows.join('');
}
function bindTooltips() {
  const tip = $('tooltip');
  let cur = null;
  document.addEventListener('mouseover', function (e) {
    if (IS_TOUCH && !matchMedia('(hover:hover)').matches) return;
    const el = e.target.closest('[data-tip],.bcard[data-id]');
    if (el === cur) return;
    cur = el;
    if (!el) { tip.classList.add('hidden'); return; }
    let html = '';
    if (el.classList.contains('bcard')) { const d = BUILDINGS[el.dataset.id]; if (d) html = buildingTooltip(d); }
    else html = el.dataset.tip;
    if (!html) { tip.classList.add('hidden'); return; }
    tip.innerHTML = html; tip.classList.remove('hidden');
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.right + 10, y = r.top;
    if (x + tw > innerWidth - 6) x = Math.max(6, r.left - tw - 10);
    if (y + th > innerHeight - 6) y = Math.max(6, innerHeight - th - 6);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('pointerdown', function () { tip.classList.add('hidden'); cur = null; });
}

/* --- Command palette (Ctrl+K) & search ----------------------------------------------------------- */
const PAL = { items: [], sel: 0 };
function paletteCommands() {
  const C = [];
  const add = function (label, icon, run, kw) { C.push({ label: label, icon: icon, run: run, kw: (kw || '').toLowerCase() }); };
  add('Open Build menu', '🏗️', function () { openPanel('build'); }, 'b construct');
  add('Open City overview', '🏙️', function () { openPanel('city', 'overview'); }, 'c stats');
  add('Open City Score & Ranking', '🏆', function () { openPanel('city', 'score'); }, 'rank leaderboard');
  add('Open Economy (cycle, interest rate)', '💹', function () { openPanel('city', 'economy'); }, 'bank interest recession');
  add('Open Companies', '🏢', function () { openPanel('companies', 'companies'); }, 'company products');
  add('Open Market & Ads', '📊', function () { openPanel('companies', 'market'); }, 'advertising campaign roi share');
  add('Open Investments & Startups', '💼', function () { openPanel('companies', 'invest'); }, 'invest startup');
  add('Open Research', '🔬', function () { openPanel('research'); }, 'r tech');
  add('Open Map (World)', '🗺️', function () { openWorldMap(); }, 'm world');
  add('Open World & Trade', '🌍', function () { openPanel('world'); }, 'diplomacy trade');
  add('Open Quests & Story', '🎯', function () { setRightTab('quests'); }, 'q missions chapter');
  add('Open Challenges', '🏅', function () { openChallengesModal(); }, 'daily weekly');
  add('Open Statistics', '📈', function () { showModal('📊 Statistics', statsHtml()); }, 'stats');
  add('Open City Museum', '🏛️', function () { openMuseum(); }, 'history milestones');
  add('Open City Showcase', '🖼️', function () { openShowcase(); }, 'share screenshot');
  add('Open Player Profile', '👤', function () { openProfile(); }, 'title badges');
  add('Open City Hall', '🏛️', function () { openCityHall(); }, 'budget');
  add('City Advisor report', '🤖', function () { openAdvisorReport(); }, 'problems help');
  add('Toggle Live Dashboard', '📊', function () { toggleDashboard(); }, 'd charts');
  add('Map layers', '🗂️', function () { showLayers(); }, 'l');
  add('Road tool', '🛣️', function () { setTool('road'); }, 't transport');
  add('Zone tool', '🟩', function () { setTool('zone'); }, 'z');
  add('Bulldoze tool', '🚜', function () { setTool('bulldoze'); }, 'x demolish');
  add('Photo mode', '📷', function () { enterPhoto(); }, 'camera cinematic');
  add('Export city as PNG', '🖼️', function () { exportCityPNG(); }, 'screenshot');
  add('Save game', '💾', function () { saveGame(false); }, 'save');
  add('Settings', '⚙️', function () { openSettings(); }, 'options theme accessibility');
  add('Pause / resume', '⏸️', function () { setSpeed(S.settings.speed === 0 ? 1 : 0); }, 'p');
  if (typeof AdminAuth !== 'undefined' && AdminAuth.active()) add('Admin panel', '🛡️', function () { openAdmin(); }, 'admin cheat debug');
  add('Main menu', '🏠', function () { returnToMenu(); }, 'menu exit');
  UI_THEMES.forEach(function (t) { if (themeAvailable(t)) add('Theme: ' + t.name.replace(/^\S+\s/, ''), '🎨', function () { S.settings.theme = t.id; applyTheme(); }, 'theme'); });
  BUILDING_LIST.forEach(function (d) { if (d.hidden) return; add('Build ' + d.name, d.icon, function () { startPlacing(d); }, d.cat + ' ' + d.id + ' ' + (d.sector || '')); });
  add('Statistics Center', '📈', function () { openStatsCenter(); }, 'charts graphs report');
  add('Heatmaps', '🌡️', function () { showHeatPicker(); }, 'traffic pollution land value overlay');
  add('Open Jobs & employment', '💼', function () { openPanel('city', 'jobs'); }, 'unemployment salary');
  add('Open Transit lines', '🚇', function () { openPanel('city', 'transit'); }, 'bus metro train');
  add('Open Megacity & mega projects', '🌆', function () { openPanel('city', 'mega'); }, 'endgame');
  add('Open Company directory & stocks', '🏛️', function () { openPanel('companies', 'directory'); }, 'shares stock market');
  if (BUILD.dev || (typeof AdminAuth !== 'undefined' && AdminAuth.can('debugPanel'))) add('Toggle debug panel (F3)', '🐞', function () { toggleDebug6(); }, 'fps debug');
  add('Smart Advisor 2.0', '🧠', function () { openAdvisor2(); }, 'advisor analysis solution problems');
  add('City timeline & history', '📜', function () { openTimeline2(); }, 'timeline history years');
  add('World, regions & neighbouring cities', '🌐', function () { openWorldOverview(); }, 'region neighbour chunks world');
  add('Entity inspector (pick on map)', '🔎', function () { EI.pick = true; toast('🎯 Click a citizen, vehicle, building, road or empty land', ''); }, 'inspect entity');
  if (typeof AdminAuth !== 'undefined' && AdminAuth.active()) add('World Control Center (admin, F10)', '🌐', function () { promptEnableAdmin('wc_world'); }, 'admin world control');
  add('Generate a challenge', '🎲', function () { generateChallenge(); }, 'random challenge');
  if (typeof p10PaletteExtra === 'function' && S && S.p10) p10PaletteExtra(add);
  HEATMAPS.forEach(function (hm) { add('Heatmap: ' + hm.name, hm.icon, function () { setHeatmap(hm.id); }, 'overlay'); });
  return C;
}
function paletteScore(item, q) {
  if (!q) return 1;
  const l = item.label.toLowerCase(), words = q.split(/\s+/).filter(Boolean);
  let sc = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const pos = l.indexOf(w);
    if (pos >= 0) sc += 10 - Math.min(8, pos / 3) + (l.indexOf(' ' + w) >= 0 || pos === 0 ? 4 : 0);
    else if (item.kw.indexOf(w) >= 0) sc += 4;
    else { let k = 0; for (let j = 0; j < l.length && k < w.length; j++) if (l[j] === w[k]) k++; if (k === w.length) sc += 1.5; else return 0; }
  }
  return sc;
}
function openPalette(prefill) {
  if (!STARTED) return;
  $('paletteWrap').classList.remove('hidden');
  const inp = $('palInput'); inp.value = prefill || ''; PAL.sel = 0;
  renderPalette(); setTimeout(function () { inp.focus(); }, 20);
  firstTime('palette', '⌨️ Command palette', 'Type to find any menu, tool or building. Arrow keys + Enter to run.');
}
function closePalette() { $('paletteWrap').classList.add('hidden'); $('palInput').blur(); PAL.v2 = false; }
function renderPalette() {
  const q = $('palInput').value.trim().toLowerCase();
  PAL.items = (PAL.v2 && typeof p10PaletteCommands === 'function' ? p10PaletteCommands().concat(paletteCommands()) : paletteCommands()).concat(q.length >= 1 ? searchCommands(q) : []).map(function (c) { return { c: c, s: paletteScore(c, q) }; }).filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; }).slice(0, 12).map(function (x) { return x.c; });
  PAL.sel = clamp(PAL.sel, 0, Math.max(0, PAL.items.length - 1));
  $('palList').innerHTML = PAL.items.length ? PAL.items.map(function (c, i) {
    return '<div class="palItem' + (i === PAL.sel ? ' on' : '') + '" data-pal="' + i + '"><span>' + c.icon + '</span><span>' + esc(c.label) + '</span></div>';
  }).join('') : '<div class="small" style="padding:10px">No results. Try "factory", "research" or "map".</div>';
  $('palList').querySelectorAll('[data-pal]').forEach(function (el) { el.onclick = function () { runPalette(+el.dataset.pal); }; });
}
function runPalette(i) { const c = PAL.items[i]; if (!c) return; closePalette(); sfx('click'); c.run(); }
function bindPalette() {
  const inp = $('palInput');
  inp.addEventListener('input', function () { PAL.sel = 0; renderPalette(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { PAL.sel = Math.min(PAL.items.length - 1, PAL.sel + 1); renderPalette(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { PAL.sel = Math.max(0, PAL.sel - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === 'Enter') { runPalette(PAL.sel); e.preventDefault(); }
    else if (e.key === 'Escape') { closePalette(); e.preventDefault(); }
  });
  $('paletteWrap').addEventListener('click', function (e) { if (e.target.id === 'paletteWrap') closePalette(); });
}

/* --- Problems bar (City feedback engine) --------------------------------------------------------- */
let issuesSig = '';
function renderIssues() {
  const el = $('issuesBar'); if (!el) return;
  const list = (SIM.issues || []).slice(0, IS_MOBILE ? 2 : 4);
  const sig = list.map(function (i) { return i.id + i.extra; }).join('|') + PHOTO.on;
  if (sig === issuesSig) return;
  issuesSig = sig;
  if (!list.length || PHOTO.on) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = list.map(function (i) { const d = ISSUE_DEFS[i.id]; return '<button class="issue" data-issue="' + i.id + '" data-tip="' + esc('<b>' + d.icon + ' ' + d.text + '</b><div class="ttd">' + d.tip + '</div><div class="ttd">Click to highlight the area.</div>') + '" style="--sev:' + i.sev.toFixed(2) + '">⚠️ ' + d.text + (i.extra ? ' <b>' + esc(i.extra) + '</b>' : '') + '</button>'; }).join('');
  el.querySelectorAll('[data-issue]').forEach(function (b) { b.onclick = function () { focusIssue(b.dataset.issue); }; });
}
/* --- City Advisor report (real game-state analysis) --------------------------------------------- */
function advisorAnalysis() {
  const out = [], c = S.city, pop = c.population;
  (SIM.issues || []).forEach(function (i) { const d = ISSUE_DEFS[i.id]; out.push({ sev: i.sev, icon: d.icon, text: 'Your city has ' + d.text.toLowerCase() + (i.extra ? ' (' + i.extra + ')' : '') + '.', tip: d.tip, issue: i.id }); });
  if (SIM.powerUse > 0 && SIM.powerGen > 0 && SIM.powerGen / SIM.powerUse < 1.12 && SIM.powerRatio >= 0.97) out.push({ sev: 0.4, icon: '⚡', text: 'Your power reserve is low (' + pct((SIM.powerGen / SIM.powerUse - 1) * 100) + ' spare).', tip: 'Build another power plant before the next expansion.', act: { type: 'build', cat: 'Utilities', id: bestAvailable(['smallgen', 'powerplant', 'solar', 'wind', 'nuclear']) } });
  if ((SIM.housingDemandRatio || 0) > 1.02 && pop > 20) out.push({ sev: 0.45, icon: '🏠', text: 'Your population needs more housing.', tip: 'Zone residential land or build homes.', act: { type: 'zone', zone: 1 } });
  if (SIM.traffic > 40) out.push({ sev: SIM.traffic / 100, icon: '🛣️', text: 'Your city has high traffic.', tip: 'Build another road, bus stops or a metro line.', act: { type: 'tool', tool: 'road' } });
  if (S.city.tax > 18) out.push({ sev: 0.35, icon: '🧾', text: 'Taxes are high (' + S.city.tax + '%). Growth slows above 10%.', tip: 'Lower taxes in City → Economy.', act: { type: 'panel', panel: 'city', tab: 'economy' } });
  if (SIM.unemployment < 0.02 && pop > 100 && SIM.jobs > SIM.labor * 1.3) out.push({ sev: 0.3, icon: '👷', text: 'Businesses cannot find workers.', tip: 'More housing brings more workers.', act: { type: 'zone', zone: 1 } });
  const ph = econPhase();
  if (ph.id === 'RECESSION') out.push({ sev: 0.3, icon: '📉', text: 'The economy is in recession — demand is down ' + pct((1 - ph.demand) * 100) + '.', tip: 'Cheap credit (' + (interestRate() * 100).toFixed(1) + '%) makes this a good time to invest.', act: { type: 'panel', panel: 'companies', tab: 'invest' } });
  if (ph.id === 'BOOM') out.push({ sev: 0.2, icon: '🚀', text: 'The economy is booming. Expand businesses while demand is high.', tip: 'Interest rates will rise soon.' });
  advisorLines6(out);
  if (!out.length) out.push({ sev: 0, icon: '✅', text: 'Everything looks healthy. Keep growing!', tip: 'Try raising your City Score (' + S.p5.score.cur + ') or a daily challenge.' });
  out.sort(function (a, b) { return b.sev - a.sev; });
  return out;
}
function openAdvisorReport() {
  const A = advisorAnalysis();
  let h = '<div class="card"><h3>🤖 CITY ADVISOR — analysis of ' + esc(S.city.name) + '</h3><p>Based on live simulation data: population ' + fmt(Math.floor(S.city.population)) + ', happiness ' + pct(S.city.happiness) + ', traffic ' + pct(SIM.traffic) + ', power ' + pct(SIM.powerRatio * 100) + ', water ' + pct(SIM.waterRatio * 100) + '.</p></div>';
  A.forEach(function (a, i) {
    h += '<div class="card"><div class="between"><b>' + a.icon + ' ' + esc(a.text) + '</b>' + (a.issue ? '<button class="btn small blue" data-advissue="' + a.issue + '">Show me →</button>' : a.act ? '<button class="btn small blue" data-advact="' + i + '">Show me →</button>' : '') + '</div><p>' + esc(a.tip) + '</p></div>';
  });
  showModal('🤖 City Advisor', h);
  document.querySelectorAll('[data-advissue]').forEach(function (b) { b.onclick = function () { closeModal(); focusIssue(b.dataset.advissue); }; });
  document.querySelectorAll('[data-advact]').forEach(function (b) { b.onclick = function () { closeModal(); doAdviceAction(A[+b.dataset.advact].act); }; });
}

/* --- Tutorial 2.0: ten guided objectives for the first minutes --------------------------------- */
const TUT2 = [
  { t: 'Build a Generator', d: 'Open BUILD → Utilities and place a Small Generator next to a road.', el: '[data-panel="build"]', act: { type: 'build', cat: 'Utilities', id: 'smallgen' }, check: function () { return countBuilt('smallgen') + countBuilt('powerplant') >= 1; }, r: 150 },
  { t: 'Collect Money', d: 'Tap a 💰 bubble above a business to collect a tip.', check: function () { return (S.p5.tut.tips || 0) >= 1; }, prep: function () { const c = MAP.lists.commercial.concat(MAP.lists.factories).filter(function (b) { return b.built; }); c.forEach(function (b) { b._tip = S.clock.runSec + 120; }); }, r: 100 },
  { t: 'Build a House', d: 'Build a Small House (Residential) so more citizens can move in.', el: '[data-panel="build"]', act: { type: 'build', cat: 'Residential', id: 'house' }, check: function () { return countBuilt('house') >= (S.p5.tut.base.house || 0) + 1; }, r: 100 },
  { t: 'Build a Shop', d: 'Build a Food Stand or Shop (Commercial) — businesses create jobs and revenue.', el: '[data-panel="build"]', act: { type: 'build', cat: 'Commercial', id: 'foodstand' }, check: function () { return countBuilt('foodstand') + countBuilt('shop') + countBuilt('restaurant') >= (S.p5.tut.base.shop || 0) + 1; }, r: 200 },
  { t: 'Hire Workers', d: 'Select a building and press 👷+ to hire more staff.', check: function () { return (S.p5.tut.hired || 0) >= 1; }, r: 150 },
  { t: 'Build a Road', d: 'Use the 🛣️ road tool (T) and drag to build at least 3 road tiles.', el: '[data-tool="road"]', act: { type: 'tool', tool: 'road' }, check: function () { return (S.p5.tut.roads || 0) >= 3; }, r: 150 },
  { t: 'Research a Technology', d: 'Build a Laboratory, then open RESEARCH and unlock your first technology.', el: '[data-panel="research"]', act: { type: 'panel', panel: 'research' }, check: function () { return S.technology.unlocked.length >= 1; }, r: 300 },
  { t: 'Upgrade a Building', d: 'Select one of your buildings and press ⬆️ to upgrade it.', check: function () { return (S.p5.tut.upgraded || 0) >= 1; }, r: 800 },
  { t: 'Open a Company', d: 'COMPANY → found your first company. It boosts every building in its sector.', el: '[data-panel="companies"]', act: { type: 'panel', panel: 'companies', tab: 'companies' }, check: function () { return foundedCompanies() >= 1; }, r: 2500, budget: 2000 },
  { t: 'Expand the District', d: 'CITY → Land: buy more land for your city (paid from the city budget).', el: '[data-panel="city"]', act: { type: 'panel', panel: 'city', tab: 'land' }, check: function () { return S.city.expansion >= 1; }, r: 3000 }
];
function startTutorial2() {
  const t = S.p5.tut;
  t.step = 0; t.done = false; t.base = { house: countBuilt('house'), shop: countBuilt('foodstand') + countBuilt('shop') + countBuilt('restaurant') };
  t.tips = 0; t.hired = 0; t.roads = 0; t.upgraded = 0;
  showDialogue([['ada', 'Welcome, Mayor! I am Ada, your Chief of Staff. Let me show you around in ten quick steps.'], ['robo', 'I am your CITY ADVISOR. I analyse the city and flag problems at the top of the screen. Click one to see where it is!']],
    { onDone: function () { t.step = 1; if (TUT2[0].prep) TUT2[0].prep(); renderTutorial(); } });
}
function tutorialTick() {
  const t = S.p5.tut;
  if (t.done || t.step < 1 || S.city.sandbox) { $('tutObj').classList.add('hidden'); return; }
  const k = t.step - 1, s = TUT2[k];
  if (!s) { t.done = true; S.tutorial.done = true; $('tutObj').classList.add('hidden'); return; }
  let ok = false; try { ok = s.check(); } catch (e) { ok = false; }
  if (ok) {
    S.money = Math.min(MONEY_CAP, S.money + Math.round(s.r * costMult()));
    if (s.budget) S.budget += Math.round(s.budget * costMult());
    toast('✅ Tutorial ' + t.step + '/10: ' + s.t + ' (+' + money(Math.round(s.r * costMult())) + ')', 'good'); sfx('achievement');
    t.step++;
    const n = TUT2[t.step - 1];
    if (n && n.prep) n.prep();
    if (!n) { t.done = true; S.tutorial.done = true; celebrate('🎓 TUTORIAL COMPLETE', 8); notify('🎓 Tutorial complete! Follow the Story Campaign in the Quests tab.', 'gold'); }
  }
  renderTutorial();
}
function renderTutorial() {
  const t = S.p5.tut, box = $('tutObj');
  if (t.done || t.step < 1 || !STARTED || PHOTO.on) { box.classList.add('hidden'); return; }
  const s = TUT2[t.step - 1]; if (!s) return;
  box.classList.remove('hidden');
  const html = '<div class="between"><b>🎓 TUTORIAL ' + t.step + '/10</b><button class="btn small" id="tutSkip2">Skip</button></div><div class="bar" style="margin:6px 0"><i style="width:' + ((t.step - 1) * 10) + '%"></i></div>' +
    '<div class="tt">' + esc(s.t) + '</div><div class="small">' + esc(s.d) + '</div>' + (s.act ? '<button class="btn blue small" id="tutShow" style="margin-top:6px">Show me →</button>' : '');
  if (box.dataset.sig !== html) {
    box.dataset.sig = html; box.innerHTML = html;
    $('tutSkip2').onclick = function () { confirmDialog('Skip tutorial?', 'You can always ask the 🤖 City Advisor for help.', 'Skip', function () { t.done = true; S.tutorial.done = true; renderTutorial(); }); };
    if ($('tutShow')) $('tutShow').onclick = function () { doAdviceAction(s.act); document.querySelectorAll('.tutHL').forEach(function (e) { e.classList.remove('tutHL'); }); const el = s.el ? document.querySelector(s.el) : null; if (el) { el.classList.add('tutHL'); setTimeout(function () { el.classList.remove('tutHL'); }, 4000); } };
  }
}

/* --- Gamepad support (optional; silently ignored when none is connected) ------------------------ */
const PAD = { prev: {}, active: false, repeat: 0 };
function pollGamepad(dt) {
  if (!S || S.settings.gamepad === false || !navigator.getGamepads) return;
  let gp = null;
  try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) if (all[i] && all[i].connected) { gp = all[i]; break; } } catch (e) { return; }
  if (!gp) { if (PAD.active) { PAD.active = false; UI.gamepadCursor = false; } return; }
  if (!PAD.active) { PAD.active = true; toast('🎮 Gamepad connected: left stick pan · triggers zoom · A select · B back · X build · Y city', 'good'); }
  UI.gamepadCursor = STARTED;
  const ax = function (i) { const v = gp.axes[i] || 0; return Math.abs(v) > 0.18 ? v : 0; };
  const btn = function (i) { return !!(gp.buttons[i] && gp.buttons[i].pressed); };
  const edge = function (i) { const p = btn(i), was = PAD.prev[i]; PAD.prev[i] = p; return p && !was; };
  if (!STARTED) { if (edge(0)) $('playBtn').click(); return; }
  const sp = 520 * dt / CAM.zoom;
  CAM.x += ax(0) * sp; CAM.y += ax(1) * sp;
  const zin = (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0) - ax(3) * 0.8;
  if (Math.abs(zin) > 0.05) CAM.zoom = clamp(CAM.zoom * (1 + zin * dt * 1.6), 0.3, 2.6);
  clampCamera();
  if (edge(0)) { if (UI.dialog) advanceDialogue(); else { UI.lastPointer = 'mouse'; UI.hover = tileAtScreen(CW / 2, CH / 2); handleTap(CW / 2, CH / 2); } }
  if (edge(1)) cancelAction();
  if (edge(2)) openPanel('build');
  if (edge(3)) openPanel('city');
  if (edge(9)) setSpeed(S.settings.speed === 0 ? 1 : 0);
  if (edge(4) && UI.placing) rotatePlacement();
  if (edge(8)) openPalette();
  UI.hover = tileAtScreen(CW / 2, CH / 2);
}

/* --- Photo mode 2.0 ----------------------------------------------------------------------------- */
function enterPhoto() {
  if (!STARTED) return;
  PHOTO.on = true; PHOTO.prevWeather = FX.weather; PHOTO.hour = null; PHOTO.rot = 0; PHOTO.fov = 1;
  closeLeft(); closeModal(); selectBuilding(null); setTool('select');
  document.body.classList.add('photo');
  renderPhotoBar();
  firstTime('photo', '📷 Photo mode', 'Rotate the camera, change time and weather, add cinematic bars, then capture a PNG.');
}
function exitPhoto() {
  PHOTO.on = false; PHOTO.rot = 0; PHOTO.hour = null; PHOTO.fov = 1; PHOTO.tilt = 1;
  if (PHOTO.weather) { FX.weather = PHOTO.prevWeather || 'clear'; PHOTO.weather = null; }
  document.body.classList.remove('photo');
  $('photoBar').classList.add('hidden');
}
function renderPhotoBar() {
  const el = $('photoBar'); el.classList.remove('hidden');
  const hr = PHOTO.hour === null ? gameHour() : PHOTO.hour;
  el.innerHTML = '<div class="pbRow"><b>📷 PHOTO MODE</b><button class="btn small green" id="phShot">📸 Capture PNG</button><button class="btn small" id="phUI">👁️ Toggle bar</button><button class="btn small red" id="phExit">✕ Exit</button></div>' +
    '<label>Zoom <input type="range" id="phZoom" min="0.3" max="2.6" step="0.01" value="' + CAM.zoom + '"></label>' +
    '<label>Rotation <input type="range" id="phRot" min="-180" max="180" step="1" value="' + Math.round(PHOTO.rot * 180 / Math.PI) + '"></label>' +
    '<label>Time of day <input type="range" id="phHour" min="0" max="23.9" step="0.1" value="' + hr.toFixed(1) + '"></label>' +
    '<label>Height (building scale) <input type="range" id="phFov" min="0.5" max="1.8" step="0.05" value="' + PHOTO.fov + '"></label>' +
    '<label>Camera angle (tilt) <input type="range" id="phTilt" min="0.55" max="1" step="0.01" value="' + PHOTO.tilt + '"></label>' +
    '<div class="pbRow">Weather: ' + ['clear', 'rain', 'snow', 'storm', 'heatwave'].map(function (w) { return '<button class="btn small ' + (FX.weather === w ? 'gold' : '') + '" data-phw="' + w + '">' + ({ clear: '☀️', rain: '🌧️', snow: '🌨️', storm: '⛈️', heatwave: '🥵' })[w] + '</button>'; }).join('') +
    '<button class="btn small ' + (PHOTO.bars ? 'gold' : '') + '" id="phBars">🎬 Bars</button></div>';
  $('phZoom').oninput = function () { CAM.zoom = +this.value; };
  $('phRot').oninput = function () { PHOTO.rot = +this.value * Math.PI / 180; };
  $('phHour').oninput = function () { PHOTO.hour = +this.value; };
  $('phFov').oninput = function () { PHOTO.fov = +this.value; };
  $('phTilt').oninput = function () { PHOTO.tilt = +this.value; };
  el.querySelectorAll('[data-phw]').forEach(function (b) { b.onclick = function () { PHOTO.weather = b.dataset.phw; FX.weather = PHOTO.weather; FX.weatherUntil = S.clock.runSec + 99999; renderPhotoBar(); }; });
  $('phBars').onclick = function () { PHOTO.bars = !PHOTO.bars; renderPhotoBar(); };
  $('phShot').onclick = function () { exportCityPNG(); };
  $('phUI').onclick = function () { el.classList.toggle('mini'); };
  $('phExit').onclick = exitPhoto;
}

/* --- Screenshot export & City Showcase ---------------------------------------------------------- */
function renderCleanFrame() {
  const keep = { sel: UI.selected, tool: UI.tool, hover: UI.hover, hl: FX.hl, cursor: UI.gamepadCursor, bars: PHOTO.bars };
  UI.selected = null; UI.hover = null; FX.hl = null; UI.gamepadCursor = false; UI.tool = 'select'; PHOTO.bars = false;
  try { render(); } finally { UI.selected = keep.sel; UI.tool = keep.tool; UI.hover = keep.hover; FX.hl = keep.hl; UI.gamepadCursor = keep.cursor; PHOTO.bars = keep.bars; }
  // Watermark with the city's real data
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(8,10,25,.6)'; ctx.fillRect(10, CH - 46, Math.min(CW - 20, 420), 36);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🏙️ ' + S.city.name + ' · ' + scoreTitle() + ' · Score ' + S.p5.score.cur + ' · Pop ' + fmt(Math.floor(S.city.population)), 20, CH - 28);
}
function exportCityPNG() {
  if (!STARTED) return;
  renderCleanFrame();
  const name = (S.city.name.replace(/[^a-z0-9]+/gi, '-') || 'city') + '-' + seedLabel() + '.png';
  const done = function (url) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  if (DESKTOP) {      // Windows: straight into Pictures\BLOCK CITY TYCOON
    Platform.savePicture(canvas.toDataURL('image/png'), name).then(function (r) { toast(r && r.ok ? '🖼️ Saved to ' + r.path : '❌ Export failed: ' + ((r && r.error) || 'unknown'), r && r.ok ? 'good' : 'bad'); });
    sfx('money'); return;
  }
  try {
    if (canvas.toBlob) canvas.toBlob(function (blob) { if (!blob) { toast('❌ Export failed', 'bad'); return; } const url = URL.createObjectURL(blob); done(url); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('🖼️ Exported ' + name, 'good'); }, 'image/png');
    else { done(canvas.toDataURL('image/png')); toast('🖼️ Exported ' + name, 'good'); }
  } catch (e) { toast('❌ Export blocked by the browser', 'bad'); }
  sfx('money');
}
function cityThumbnail() {
  try {
    renderCleanFrame();
    const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * CH / CW);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch (e) { return ''; }
}
function openShowcase() {
  if (!STARTED) { toast('Start a city first', 'bad'); return; }
  computeScore();
  const img = cityThumbnail(), ps = playerStats(), I = IDENTITIES[S.p5.identity.id];
  const kv = function (k, v) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; };
  const h = '<div class="showcase"><img src="' + img + '" alt="City screenshot"><div class="scTitle">🏙️ ' + esc(S.city.name) + '</div>' +
    '<div class="small" style="text-align:center">' + seedLabel() + ' · ' + DIFFICULTIES[S.city.difficulty].name + ' · Mayor ' + esc(PROFILE.name) + ' — ' + esc(PROFILE.title) + (S.p5.admin.used ? ' · 🛡️ admin tools used' : '') + '</div></div>' +
    '<div class="grid3" style="margin-top:8px">' + kv('CITY SCORE', S.p5.score.cur + ' / 1000') + kv('TITLE', scoreTitle()) + kv('WORLD RANK', '#' + playerRank('score')) + kv('POPULATION', fmt(Math.floor(ps.pop))) + kv('WEALTH', money(ps.wealth)) + kv('IDENTITY', I ? I.icon + ' ' + I.name : '—') + '</div>' +
    '<div class="secTitle">Badges</div><p class="small">' + (PROFILE.badges.length ? PROFILE.badges.map(function (b) { return '🏅 ' + esc(b); }).join(' · ') : 'No badges yet — complete challenges!') + '</p>' +
    '<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn green" id="scExport">🖼️ EXPORT CITY (PNG)</button></div>';
  showModal('🖼️ City Showcase', h);
  $('scExport').onclick = function () { closeModal(); setTimeout(exportCityPNG, 60); };
}

/* --- Player profile ---------------------------------------------------------------------------------- */
function profileHtml(inGame) {
  const P = PROFILE, s = S;
  const row = function (k, v) { return '<div class="between small" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>' + k + '</span><b style="color:var(--text)">' + v + '</b></div>'; };
  let comp = Object.keys(s.companies.list).map(function (id) { return companyDef(id).icon + ' ' + companyDef(id).name + ' Lv' + s.companies.list[id].level; }).join(', ') || 'No company yet';
  let h = '<div class="card"><div class="row"><div class="avatar">' + (TITLES.find(function (t) { return t.id === P.title; }) || { icon: '🎖️' }).icon + '</div><div style="flex:1"><h3>' + esc(P.name) + '</h3><p>' + esc(P.title) + ' · ' + esc(P.companyName) + '</p></div><button class="btn small" id="pfRename">✏️ Rename</button></div></div>' +
    '<div class="card">' + row('City', esc(s.city.name) + ' (' + seedLabel() + ')') + row('Company', comp) + row('Total wealth (peak)', money(playerStats().wealth) + ' (' + money(P.peakWealth) + ')') +
    row('Total population (peak)', fmt(Math.floor(s.city.population)) + ' (' + fmt(Math.floor(P.peakPop)) + ')') + row('Achievements', ACHIEVEMENTS.filter(function (a) { return s.achievements[a.id]; }).length + ' / ' + ACHIEVEMENTS.length) +
    row('Play time', Math.floor(P.playSec / 3600) + 'h ' + Math.floor((P.playSec % 3600) / 60) + 'm') + row('Cities created', fmt(P.citiesCreated)) + row('Highest City Score', P.highestScore) +
    row('Challenges completed', Object.keys(P.challenges).length + ' / ' + CHALLENGES.length) + '</div>';
  h += '<div class="secTitle">🎖️ Titles (click to equip)</div><div class="row" style="flex-wrap:wrap;gap:6px">' + TITLES.concat(P.titles.filter(function (t) { return !TITLES.some(function (x) { return x.id === t; }); }).map(function (t) { return { id: t, icon: '🏆', desc: 'Challenge reward' }; })).map(function (t) {
    const has = P.titles.indexOf(t.id) >= 0;
    return '<button class="btn small ' + (P.title === t.id ? 'gold' : has ? '' : 'dis') + '" data-title="' + esc(t.id) + '" data-tip="' + esc('<b>' + t.icon + ' ' + t.id + '</b><div class="ttd">' + t.desc + '</div>') + '">' + t.icon + ' ' + esc(t.id) + (has ? '' : ' 🔒') + '</button>';
  }).join('') + '</div>';
  h += '<div class="secTitle">🏅 Badges & cosmetics</div><p class="small">' + (P.badges.map(function (b) { return '🏅 ' + esc(b); }).concat(P.cosmetics.map(function (c) { return COSMETICS[c].icon + ' ' + COSMETICS[c].name; })).join(' · ') || 'Complete challenges and daily goals to earn badges and cosmetics.') + '</p>';
  return h;
}
function bindProfileButtons(container, rerender) {
  container.querySelectorAll('[data-title]').forEach(function (b) { b.onclick = function () { if (PROFILE.titles.indexOf(b.dataset.title) >= 0) { PROFILE.title = b.dataset.title; saveProfile(); sfx('click'); rerender(); } }; });
  const rn = container.querySelector('#pfRename');
  if (rn) rn.onclick = function () {
    showModal('✏️ Player profile', '<label class="fld">Mayor name<input id="pfName" maxlength="24" value="' + esc(PROFILE.name) + '"></label><label class="fld" style="margin-top:8px">Holding company name<input id="pfComp" maxlength="28" value="' + esc(PROFILE.companyName) + '"></label><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn green" id="pfSave">Save</button></div>');
    $('pfSave').onclick = function () { PROFILE.name = ($('pfName').value || 'Mayor').replace(/[<>]/g, '').trim().slice(0, 24) || 'Mayor'; PROFILE.companyName = ($('pfComp').value || 'BLOCK HOLDINGS').replace(/[<>]/g, '').trim().slice(0, 28) || 'BLOCK HOLDINGS'; saveProfile(); closeModal(); rerender(); };
  };
}
function openProfile() { showModal('👤 Player Profile', profileHtml(true)); bindProfileButtons($('modalBody'), openProfile); }

/* --- City Museum ---------------------------------------------------------------------------------------- */
function openMuseum() {
  const H = S.p5.history;
  let h = '<div class="card"><h3>🏛️ ' + esc(S.city.name) + ' City Museum</h3><p>Founded on seed ' + seedLabel() + '. ' + H.length + ' exhibits · Day ' + gameDay() + '.</p></div>';
  h += '<div class="secTitle">🌟 Firsts</div><div class="grid2">' + [['building', '🏠', 'First building'], ['money1k', '💵', 'First $1,000'], ['sky', '🌆', 'First skyscraper'], ['landmark', '🗼', 'First landmark']].map(function (f) {
    const e = H.find(function (x) { return x.kind === 'first' && (f[0] === 'building' ? x.text.indexOf('First building') === 0 : f[0] === 'money1k' ? x.text.indexOf('$1,000') >= 0 : f[0] === 'sky' ? x.text.indexOf('skyscraper') >= 0 : x.text.indexOf('landmark') >= 0); });
    return '<div class="card" style="opacity:' + (S.p5.firsts[f[0]] ? 1 : 0.45) + '"><h3>' + (e ? e.icon : f[1]) + ' ' + f[2] + '</h3><p>' + (e ? esc(e.text) + ' · Day ' + e.day : 'Not yet') + '</p></div>';
  }).join('') + '</div>';
  h += '<div class="secTitle">🏁 Milestones</div><div class="msGrid">' + MILESTONES.map(function (m) { return '<div class="ms ' + (S.p5.ms[m.id] ? 'got' : '') + '" data-tip="' + esc(m.name) + '">' + m.icon + '<span>' + m.name + '</span></div>'; }).join('') + '</div>';
  h += '<div class="secTitle">🏅 Achievements</div><p class="small">' + (ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; }).map(function (a) { return a.icon + ' ' + a.name; }).join(' · ') || 'None yet.') + '</p>';
  h += '<div class="secTitle">📜 Timeline</div>' + (H.length ? H.slice().reverse().map(function (e) { return '<div class="notif"><span class="nt">Day ' + e.day + '</span><span>' + e.icon + ' ' + esc(e.text) + '</span></div>'; }).join('') : '<p class="small">Your city\'s history starts now.</p>');
  showModal('🏛️ City Museum', h);
}

/* --- Challenges (in-game & main menu) ---------------------------------------------------------------- */
function challengeCardsHtml(inGame) {
  let h = '';
  ['daily', 'weekly'].forEach(function (k) {
    const tc = todaysChallenge(k), mine = S.p5[k], done = PROFILE[k][tc.key];
    const active = mine && mine.key === tc.key && !mine.done && !mine.failed;
    const left = active && tc.tpl.limit ? Math.max(0, tc.tpl.limit - (S.clock.runSec - mine.start)) : 0;
    h += '<div class="card" style="border-left:4px solid ' + (k === 'daily' ? 'var(--blue)' : 'var(--purple)') + '"><div class="between"><h3>' + (k === 'daily' ? '📅 DAILY' : '🗓️ WEEKLY') + ' CHALLENGE <span class="tag">' + tc.key + '</span></h3>' + (done ? '<span class="tag g">DONE ✓</span>' : '') + '</div><p>' + esc(tc.text) + '</p>' +
      '<p class="small">Reward: ' + (k === 'daily' ? 'money, RP and a special cosmetic' : '5 Legacy Points, a badge and a cosmetic') + '</p>' +
      (active ? barRow('Progress', challengeProgress(k) * 100, 100, '#06d6a0', pct(challengeProgress(k) * 100)) + (left ? '<p class="small">⏱ ' + Math.floor(left / 60) + ':' + pad2(Math.floor(left % 60)) + ' left</p>' : '') :
        (!done && inGame ? '<button class="btn small gold" data-accept="' + k + '">Accept in this city</button>' : '')) +
      (mine && mine.key === tc.key && mine.failed ? '<p class="small neg">Failed in this city.</p>' : '') + '</div>';
  });
  if (inGame) { const g = S.p6.gen; h += '<div class="card" style="border-left:4px solid var(--gold)"><div class="between"><h3>🎲 GENERATED CHALLENGE</h3><button class="btn small gold" data-act="genchallenge">Generate new</button></div>' + (g ? '<p>' + esc(g.text) + '</p>' + (g.done ? '<span class="tag g">DONE ✓</span>' : g.failed ? '<span class="tag r">FAILED</span>' : barRow('Progress', genProgress() * 100, 100, '#ffd166', pct(genProgress() * 100))) : '<p class="small">The system creates a challenge that fits your city (e.g. grow fast, keep tax under 5%, stay clean).</p>') + '</div>'; }
  h += '<div class="secTitle">🏆 Challenge mode (starts a new city with special rules)</div>';
  CHALLENGES.forEach(function (c) {
    const done = PROFILE.challenges[c.id], cur = S.p5.challenge && S.p5.challenge.id === c.id;
    h += '<div class="card"><div class="between"><h3>' + c.icon + ' ' + c.name + '</h3>' + (done ? '<span class="tag g">COMPLETED</span>' : '') + '</div><p><b>Rules:</b> ' + esc(c.rules) + '<br><b>Goal:</b> ' + esc(c.goal) + '<br><b>Reward:</b> ' + esc(challengeRewardText(c.reward)) + '</p>' +
      (cur ? barRow('Progress', clamp(c.prog(), 0, 1) * 100, 100, '#ffd166', pct(clamp(c.prog(), 0, 1) * 100)) : '<button class="btn small green" data-chstart="' + c.id + '">Start challenge →</button>') + '</div>';
  });
  return h;
}
function challengeRewardText(r) { const p = []; if (r.title) p.push('title "' + r.title + '"'); if (r.badge) p.push('badge "' + r.badge + '"'); if (r.cosmetic) p.push(COSMETICS[r.cosmetic].name); if (r.pp) p.push(r.pp + ' Legacy Points'); return p.join(', '); }
function bindChallengeButtons(root, rerender) {
  root.querySelectorAll('[data-accept]').forEach(function (b) { b.onclick = function () { acceptChallenge(b.dataset.accept); rerender(); }; });
  root.querySelectorAll('[data-chstart]').forEach(function (b) { b.onclick = function () { startChallengeCity(b.dataset.chstart); }; });
}
function openChallengesModal() { showModal('🏅 Challenges', challengeCardsHtml(true)); bindChallengeButtons($('modalBody'), openChallengesModal); firstTime('challenges', '🏅 Challenges', 'Daily and weekly goals give cosmetics and titles. Challenge mode starts a new city with special rules.'); }
function startChallengeCity(id) {
  const c = challengeDef(id); if (!c) return;
  const slot = MENU.opts.slot || S.slot || 1;
  const go = function () {
    closeModal();
    const settings = S ? S.settings : defaultSettings();
    S = defaultState(newMeta(), settings, null, null, { name: c.name.charAt(0) + c.name.slice(1).toLowerCase() + ' City', seed: Math.floor(Math.random() * 1000000), difficulty: 'NORMAL', size: 40 });
    S.slot = slot; setActiveSlot(slot);
    if (c.start) { if (c.start.money) S.money = Math.round(S.money * c.start.money); if (c.start.budget) S.budget = Math.round(S.budget * c.start.budget); }
    S.p5.challenge = { id: c.id, start: 0, done: false, failed: false };
    S.tutorial.done = true; S.p5.tut.done = true;
    STORY.forEach(function (ch) { S.p5.story.unlocked[ch.unlock] = 1; });
    resetSim(); initMap(true); generateCity(); onMapChanged(); resetAgents(); econTick(1); computeDistricts();
    CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20; CAM.zoom = window.innerWidth < 820 ? 1.1 : 1.35;
    PROFILE.citiesCreated++; saveProfile(); saveGame(true);
    startGame({ isNew: true, notes: ['🏆 Challenge ' + c.name + ' started — ' + c.goal] });
    showDialogue([['robo', 'CHALLENGE: ' + c.name + '. Rules: ' + c.rules + ' Goal: ' + c.goal]], {});
  };
  confirmDialog(c.icon + ' Start ' + c.name + '?', 'A new city will be created in slot ' + slot + (slotInfo(slot).exists ? ' (replacing "' + esc(slotInfo(slot).name) + '")' : '') + '.<br><b>Rules:</b> ' + esc(c.rules) + '<br><b>Goal:</b> ' + esc(c.goal), 'Start', go);
}

/* --- Pause menu (ESC) --------------------------------------------------------------------------------- */
function openPauseMenu() {
  const wasSpeed = S.settings.speed;
  if (wasSpeed) setSpeed(0);
  showModal('⏸️ Paused — ' + esc(S.city.name), '<div class="pauseGrid">' +
    '<button class="btn gold big" data-pm="resume">▶ Resume</button><button class="btn green" data-pm="save">💾 Save</button><button class="btn" data-pm="settings">⚙️ Settings</button>' +
    '<button class="btn" data-pm="palette">⌨️ Commands (Ctrl+K)</button><button class="btn" data-pm="advisor">🤖 Advisor</button><button class="btn" data-pm="photo">📷 Photo mode</button>' +
    '<button class="btn" data-pm="museum">🏛️ Museum</button><button class="btn" data-pm="showcase">🖼️ Showcase</button><button class="btn" data-pm="profile">👤 Profile</button>' +
    '<button class="btn" data-pm="challenges">🏅 Challenges</button><button class="btn" data-pm="admin">🛡️ Admin panel</button><button class="btn blue" data-pm="menu">🏠 Main menu</button></div>', function () { if (wasSpeed && S.settings.speed === 0) setSpeed(wasSpeed); });
  document.querySelectorAll('[data-pm]').forEach(function (b) {
    b.onclick = function () {
      const k = b.dataset.pm; sfx('click');
      if (k === 'resume') { closeModal(); return; }
      if (k === 'save') { saveGame(false); return; }
      modalOnClose = null; if (wasSpeed) setSpeed(wasSpeed);
      if (k === 'menu') { closeModal(); returnToMenu(); return; }
      closeModal();
      ({ settings: openSettings, palette: function () { openPalette(); }, advisor: openAdvisorReport, photo: enterPhoto, museum: openMuseum, showcase: openShowcase, profile: openProfile, challenges: openChallengesModal, admin: openAdmin })[k]();
    };
  });
}

/* --- Placement rotation ------------------------------------------------------------------------------- */
function rotatePlacement() {
  UI.rot = ((UI.rot | 0) + 1) & 3;
  if (UI.ghost && UI.pendingAction && UI.placing) {       // re-arm the confirm bar with the new rotation
    const d = fpDef(UI.placing, UI.rot);
    const chk = canPlace(d, UI.ghost.x, UI.ghost.y);
    $('placeInfo').innerHTML = '<b>' + UI.placing.icon + ' ' + UI.placing.name + ' ↻' + (UI.rot * 90) + '°</b>' + (chk.ok ? money(buildCost(d)) : '<span class="neg">❌ ' + chk.reason + '</span>');
    const gx = UI.ghost.x, gy = UI.ghost.y, dd = UI.placing, rr = UI.rot;
    UI.pendingAction = function () { placeBuilding(dd, gx, gy, rr); UI.ghost = null; };
  }
  toast('↻ Rotation ' + (UI.rot * 90) + '° (entrance ' + ['south', 'east', 'north', 'west'][UI.rot] + ')', '');
  sfx('click');
}

/* --- Siren audio for emergency vehicles ---------------------------------------------------------------- */
let sirenAcc = 0;
function sirenAudioTick(dt) {
  sirenAcc -= dt;
  if (sirenAcc > 0 || !S.settings.sound || !SND.ctx || !AG.sirens || !AG.sirens.length) return;
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
  if (!AG.sirens.some(function (v) { return v.x > tl.x && v.x < br.x && v.y > tl.y && v.y < br.y; })) return;
  sirenAcc = 1.4;
  SND.tone(740, 0.35, 'square', 0.025, 0, 960); SND.tone(960, 0.35, 'square', 0.025, 0.38, 740);
}
