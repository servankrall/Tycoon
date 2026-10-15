'use strict';
/* BLOCK CITY TYCOON — MOBILE 2.0 EXTRAS (Part 14)
   Touch features on top of the mobile UI: SMART SELECTION chooser, long press / double tap, citizen + vehicle TRACKING,
   the SPEED bottom sheet, MOBILE SEARCH, QUESTS with GO TO LOCATION, the DAILY REPORT, the TOUCH TRAINING card,
   CRITICAL ALERTS (VIEW · DISPATCH · IGNORE, the game keeps running), notifications that know their location, the
   ACHIEVEMENT popup, the SMART ADVISOR chip, citizen comments, MINIMAP 2.0, zoom buttons (Gesture Camera off),
   automatic event snapshots, touch PHOTO MODE (Hide UI), battery-friendly FPS rules and the MOBILE STRESS TEST
   (development / test builds and authorized developers only — never visible to normal players).
   Everything here is installed by mobileExtraBoot(), which runs after the mobile panels booted (phones and tablets only);
   the ACTION registrations at the bottom are shared by all platforms. */

const MOBX = { track: null, trackRaf: 0, trackN: 0, chooser: null, lastTap: null, loc: null, snapAt: 0, commentAt: 0, adviceId: '', crit: null, critT: 0, stress: null };

/* ===================================== LOCATIONS: fly the camera to a building / tile / point ===================================== */
function locOf(o) {
  if (!o) return null;
  if (o.type && BUILDINGS[o.type] && o.x !== undefined) { const c = buildingCenter(o); return { x: c.x, y: c.y, b: o }; }
  if (o.wx !== undefined) return { x: o.wx, y: o.wy };
  if (o.tile !== undefined) return { x: (o.tile % MAP.W + 0.5) * TILE, y: (Math.floor(o.tile / MAP.W) + 0.5) * TILE };
  if (o.x !== undefined) return { x: (o.x + 0.5) * TILE, y: (o.y + 0.5) * TILE };
  return null;
}
function flyToLoc(l, select) {
  if (!l || !STARTED) return;
  closeMobileOverlays(); closeMobilePage(); closeCityMap(); closeNotificationCenter();
  stopTracking();
  camFlyTo(l.x, l.y, Math.max(CAM.zoom, 1.1));
  if (select && l.b && MAP.byId.has(l.b.id)) setTimeout(function () { selectBuilding(l.b); }, 380);
}
/* the next notification / toast belongs to this place (set right before the game posts it) */
function noteAt(o) { const l = locOf(o); if (l) { l.t = performance.now(); MOBX.loc = l; } }
function freshLoc() { const l = MOBX.loc; return l && performance.now() - l.t < 60 ? l : null; }

/* ===================================== TRACKING (citizen / vehicle) ===================================== */
function startTracking(o) {
  if (!o) return;
  if (MOBX.track === o) { stopTracking(); return; }
  MOBX.track = o; MOBX.trackN = 0;
  stopCameraMotion(); CAM.zoom = Math.max(CAM.zoom, 1.25);
  let pill = document.getElementById('mTrack');
  if (!pill) { pill = document.createElement('button'); pill.id = 'mTrack'; pill.onclick = function () { stopTracking(); sfx('click'); }; document.body.appendChild(pill); }
  pill.textContent = '🎥 TRACKING · ' + (o.type ? String(o.type).toUpperCase() : (o.tourist ? 'Tourist #' : 'Citizen #') + o.id) + '  ✕';
  pill.classList.remove('hidden');
  cancelAnimationFrame(MOBX.trackRaf); MOBX.trackRaf = requestAnimationFrame(trackFrame);
  toast('🎥 Tracking — drag the map or tap ✕ to stop', '');
}
function trackFrame() {
  const o = MOBX.track; if (!o || !STARTED) { stopTracking(); return; }
  if (++MOBX.trackN % 30 === 0 && AG.citizens.indexOf(o) < 0 && AG.vehicles.indexOf(o) < 0) { stopTracking(); toast('🎥 Tracking ended — it left the city', ''); return; }
  if (GST.mode === 'pan' || GST.mode === 'multi') { stopTracking(); return; }      // the player's finger always wins
  CAM.x += (o.x - CAM.x) * 0.18; CAM.y += (o.y - CAM.y) * 0.18; clampCamera();
  MOBX.trackRaf = requestAnimationFrame(trackFrame);
}
function stopTracking() {
  if (!MOBX.track) return false;
  MOBX.track = null; cancelAnimationFrame(MOBX.trackRaf);
  const p = document.getElementById('mTrack'); if (p) p.classList.add('hidden');
  if (MINS.kind === 'citizen' || MINS.kind === 'vehicle') renderInspector();
  return true;
}

/* ===================================== SMART SELECTION: which object did the finger mean? ===================================== */
const CHOOSE_ICON = { building: '🏢', road: '🛣️', citizen: '🧑', vehicle: '🚗', tile: '📍' };
function candidateLabel(c) {
  if (c.kind === 'building') return bdef(c.ref).icon + ' ' + bdef(c.ref).name;
  if (c.kind === 'citizen') return '🧑 ' + (c.ref.tourist ? 'Tourist #' : 'Citizen #') + c.ref.id;
  if (c.kind === 'vehicle') return '🚗 ' + String(c.ref.type || 'Vehicle').replace(/^./, function (s) { return s.toUpperCase(); });
  if (c.kind === 'road') { const n = roadNameAt(c.ref.x, c.ref.y), t = ROAD_TYPES[MAP.roads[idx(c.ref.x, c.ref.y)]]; return '🛣️ ' + (n || (t ? t.name : 'Road')); }
  return '📍 Tile ' + c.ref.x + ', ' + c.ref.y;
}
function openSelectChooser(cands, sx, sy, title) {
  closeSelectChooser();
  const el = document.createElement('div'); el.id = 'mChooser';
  el.innerHTML = '<div class="mchHead"><b>' + (title || 'SELECT OBJECT') + '</b><button class="mX" data-mch="x" aria-label="Close">✕</button></div>' +
    cands.map(function (c, i) { return '<button class="mchItem" data-mch="' + i + '"><small>' + ({ building: 'Building', road: 'Road', citizen: 'Citizen', vehicle: 'Vehicle', tile: 'Location' })[c.kind] + '</small><span>' + esc(candidateLabel(c)) + '</span></button>'; }).join('');
  document.body.appendChild(el); MOBX.chooser = { el: el, c: cands, sx: sx, sy: sy };
  const sa = safeRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = clamp(sx - w / 2, sa.l + 6, sa.r - w - 6) + 'px';
  el.style.top = clamp(sy + 18, sa.t + 6, sa.b - h - 6) + 'px';
  el.addEventListener('click', function (e) {
    const b = e.target.closest('[data-mch]'); if (!b) return;
    sfx('click'); haptic('tap');
    const k = b.dataset.mch, ch = MOBX.chooser; closeSelectChooser();
    if (k === 'x' || !ch) return;
    const c = ch.c[+k]; if (!c) return;
    if (c.kind === 'tile') tileInfo(c.ref.x, c.ref.y); else selectCandidate(c, ch.sx, ch.sy);
  });
  haptic('tap'); auditSoon();
}
function closeSelectChooser() { if (!MOBX.chooser) return false; MOBX.chooser.el.remove(); MOBX.chooser = null; return true; }
document.addEventListener('pointerdown', function (e) { if (MOBX.chooser && !MOBX.chooser.el.contains(e.target)) closeSelectChooser(); }, true);
/* LONG PRESS: everything under the finger + the tile itself (district, land value, terrain) */
function mobileLongPress(sx, sy) {
  if (!STARTED || UI.tool !== 'select') return false;
  const t = tileAtScreen(sx, sy); if (!inMap(t.x, t.y)) return false;
  const c = touchCandidates(sx, sy); c.push({ kind: 'tile', ref: { x: t.x, y: t.y } });
  haptic('notify'); openSelectChooser(c, sx, sy, '👆 LONG PRESS · ' + t.x + ', ' + t.y);
  return true;
}
function tileInfo(x, y) {
  const i = idx(x, y), z = MAP.zone[i], d = districtOf(x, y);
  showModal('📍 LOCATION ' + x + ', ' + y, '<div class="mTileInfo">' + insRow('🗺 District', esc(districtName(x, y) || '—')) + insRow('🌍 Terrain', MAP.nature[i] === 2 ? 'Water' : MAP.terrain[i] === TERRAIN.ROCK ? 'Rock / hill' : MAP.nature[i] === 1 ? 'Forest' : 'Grass') +
    insRow('🟩 Zone', z && ZONES[z] ? ZONES[z].icon + ' ' + esc(ZONES[z].name) : '—') + insRow('🛣 Road', MAP.roads[i] ? esc(ROAD_TYPES[MAP.roads[i]].name) : '—') + insRow('🔓 Land', inUnlocked(x, y) ? 'Owned' : 'Locked — CITY → expand') +
    (d && typeof d === 'object' && d.lv ? insRow('💎 Land value', '×' + (+d.lv).toFixed(2)) : '') + '</div>');
}
/* DOUBLE TAP: zoom in towards the finger */
function mobileDoubleTap(sx, sy) {
  const w = screenToWorld(sx, sy), z = clamp(CAM.zoom * 1.5, 0.3, 2.6);
  if (z === CAM.zoom) camFlyTo(w.x, w.y, 1); else camFlyTo(w.x, w.y, z);
  haptic('tap');
}

/* ===================================== SPEED bottom sheet ===================================== */
const MSPEEDS = [[0, '⏸', 'Pause'], [0.5, '0.5×', 'Slow'], [1, '1×', 'Normal'], [2, '2×', 'Fast'], [5, '5×', ''], [10, '10×', ''], [25, '25×', ''], [50, '50×', ''], [100, '100×', 'Max']];
function openSpeedSheet() {
  if (!STARTED) return;
  if (MSHEET.open && MSHEET.kind === 'speed') { closeSheet(); return; }
  closeMobileOverlays('sheet');
  const cur = S.settings.speed;
  openSheet('speed', '⏱️ SIMULATION SPEED', '<div class="mSpeedGrid">' + MSPEEDS.map(function (s) { return '<button class="mSpd' + (s[0] === cur ? ' on' : '') + '" data-mspd="' + s[0] + '"><b>' + s[1] + '</b><small>' + s[2] + '</small></button>'; }).join('') + '</div>' +
    '<p class="small mSpeedNote">The simulation keeps a fixed time step at every speed. 25× and faster use more battery.</p>');
}
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('[data-mspd]'); if (!b) return;
  const v = +b.dataset.mspd; sfx('click'); haptic('tap'); setSpeed(v); closeSheet();
  toast(v === 0 ? '⏸ Paused' : '⏱️ Speed ' + v + '×', '');
});

/* ===================================== MOBILE SEARCH ===================================== */
const MSEARCH_CATS = [['all', '🔎', 'All'], ['building', '🏢', 'Building'], ['citizen', '🧑', 'Citizen'], ['road', '🛣️', 'Road'], ['district', '🏘️', 'District'], ['company', '🏭', 'Company'], ['vehicle', '🚗', 'Vehicle'], ['location', '📍', 'Location']];
const MSEARCH = { cat: 'all', q: '', res: [] };
function roadNameAt(x, y) {
  const L = MAP.roadNames || [];
  for (let k = 0; k < L.length; k++) {
    const r = L[k];
    if (r.y === y && Math.abs(r.x - x) <= r.len / 2) return r.name;
    if (r.x === x && Math.abs(r.y - y) <= r.len / 2) return r.name;
  }
  return '';
}
function searchItems(q, cat) {
  q = String(q || '').toLowerCase().trim();
  const out = [], hit = function (s) { return !q || String(s).toLowerCase().indexOf(q) >= 0; }, want = function (c) { return cat === 'all' || cat === c; }, MAX = 60;
  const push = function (o) { if (out.length < MAX) out.push(o); };
  const coord = q.match(/^(\d{1,4})\s*[, ]\s*(\d{1,4})$/);
  if (coord && want('location') || (cat === 'location' && coord)) { const x = clamp(+coord[1], 0, MAP.W - 1), y = clamp(+coord[2], 0, MAP.H - 1); push({ cat: 'location', icon: '📍', label: 'Location ' + x + ', ' + y, sub: districtName(x, y), loc: { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE } }); }
  if (want('district')) districtCenters().forEach(function (d) { if (hit(d.name)) push({ cat: 'district', icon: '🏘️', label: d.name, sub: 'District', loc: { x: d.x * TILE, y: d.y * TILE } }); });
  if (want('company')) AI_DEFS.forEach(function (a) { if (!hit(a.name)) return; const b = S.buildings.list.find(function (x) { return x.owner === a.id; }); if (b) push({ cat: 'company', icon: a.icon, label: a.name, sub: 'Company · ' + districtName(b.x, b.y), loc: locOf(b) }); });
  if (want('road')) (MAP.roadNames || []).forEach(function (r) { if (hit(r.name)) push({ cat: 'road', icon: '🛣️', label: r.name, sub: 'Road · ' + Math.round(r.len * TILE_METERS) + ' m', loc: { x: (r.x + 0.5) * TILE, y: (r.y + 0.5) * TILE }, road: { x: Math.round(r.x), y: Math.round(r.y) } }); });
  if (want('building') && (q || cat === 'building')) S.buildings.list.forEach(function (b) { const d = bdef(b); if (d.id === 'tree' || out.length >= MAX) return; if (hit(d.name) || hit('#' + b.id) || hit(d.cat)) push({ cat: 'building', icon: d.icon, label: d.name + ' #' + b.id, sub: districtName(b.x, b.y) + ' · LV ' + b.level, loc: locOf(b), b: b }); });
  if (want('citizen') && (q || cat === 'citizen')) { const n = q.replace(/^#/, ''); AG.citizens.forEach(function (c) { if (out.length >= MAX) return; if (!q || String(c.id).indexOf(n) === 0 || hit(c.tourist ? 'tourist' : 'citizen')) push({ cat: 'citizen', icon: c.tourist ? '🧳' : '🧑', label: (c.tourist ? 'Tourist #' : 'Citizen #') + c.id, sub: String(c.state || '').replace(/_/g, ' ').toLowerCase(), agent: c }); }); }
  if (want('vehicle') && (q || cat === 'vehicle')) AG.vehicles.forEach(function (v) { if (out.length < MAX && hit(v.type || 'vehicle')) push({ cat: 'vehicle', icon: '🚗', label: String(v.type || 'vehicle').toUpperCase(), sub: v.dest && v.dest.type ? '→ ' + bdef(v.dest).name : 'on the road', agent: v }); });
  return out;
}
function openSearch() {
  if (!STARTED) return;
  closeMobileOverlays(); closeSelectChooser();
  showModal('🔍 SEARCH', '<input id="mSearchQ" class="mSearchQ" type="search" autocomplete="off" placeholder="Building, citizen #, road, district, company, x,y …" value="' + esc(MSEARCH.q) + '">' +
    '<div class="mChips mSearchCats">' + MSEARCH_CATS.map(function (c) { return '<button class="mChip small' + (c[0] === MSEARCH.cat ? ' on' : '') + '" data-msc="' + c[0] + '">' + c[1] + ' ' + c[2] + '</button>'; }).join('') + '</div><div id="mSearchRes" class="mSearchRes"></div>');
  const inp = $('mSearchQ'); inp.oninput = function () { MSEARCH.q = inp.value; renderSearch(); };
  $('modalBody').addEventListener('click', searchClick);
  renderSearch();
  setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { /* no keyboard */ } }, 60);
}
function renderSearch() {
  const box = $('mSearchRes'); if (!box) return;
  MSEARCH.res = searchItems(MSEARCH.q, MSEARCH.cat);
  box.innerHTML = MSEARCH.res.length ? MSEARCH.res.map(function (r, i) { return '<button class="mSRow" data-msr="' + i + '"><span class="mSIcon">' + r.icon + '</span><span class="mSText"><b>' + esc(r.label) + '</b><small>' + esc(r.sub || '') + '</small></span><span class="mSGo">GO →</span></button>'; }).join('')
    : '<p class="small mSEmpty">' + (MSEARCH.q || MSEARCH.cat !== 'all' ? 'Nothing found.' : 'Type a name — or pick a category above.') + '</p>';
}
function searchClick(e) {
  const c = e.target.closest('[data-msc]');
  if (c) { MSEARCH.cat = c.dataset.msc; sfx('click'); document.querySelectorAll('[data-msc]').forEach(function (x) { x.classList.toggle('on', x === c); }); renderSearch(); return; }
  const r = e.target.closest('[data-msr]'); if (!r) return;
  const it = MSEARCH.res[+r.dataset.msr]; if (!it) return;
  sfx('click'); haptic('tap'); closeModal();
  if (it.agent) { camFlyTo(it.agent.x, it.agent.y, Math.max(CAM.zoom, 1.3)); setTimeout(function () { showAgentInfo(it.cat === 'vehicle' ? { v: it.agent } : { c: it.agent }); }, 380); return; }
  flyToLoc(it.loc, true);
  if (it.road) setTimeout(function () { if (inMap(it.road.x, it.road.y) && MAP.roads[idx(it.road.x, it.road.y)]) showRoadInspector(it.road.x, it.road.y); }, 420);
}

/* ===================================== QUESTS with GO TO LOCATION ===================================== */
function questTargetType(text, hint) {
  if (hint && hint.id) return hint.id;
  const t = String(text || '').toLowerCase(); let best = null, bl = 0;
  Object.keys(BUILDINGS).forEach(function (id) { const n = BUILDINGS[id].name.toLowerCase(); if (n.length > bl && t.indexOf(n) >= 0) { best = id; bl = n.length; } });
  return best;
}
function questLocation(type) {
  if (type) { const b = S.buildings.list.find(function (x) { return x.type === type && !isAI(x); }); if (b) return locOf(b); }
  const c = cityCentre(); return { x: c.x, y: c.y };
}
function openQuestPage() {
  if (!STARTED) return;
  closeMobileOverlays();
  const cards = [];
  const m = S.quests.mission;
  if (m < MISSIONS.length) { const M = MISSIONS[m]; cards.push({ icon: '🎬', title: M.title, desc: M.desc, story: M.story, reward: M.reward, type: questTargetType(M.desc, M.hint) }); }
  let n = 0;
  SIDE_QUESTS.forEach(function (q) { if (S.quests.side[q.id] || n >= 3) return; n++; cards.push({ icon: '🎯', title: 'Side quest', desc: q.desc, reward: q.reward, type: questTargetType(q.desc) }); });
  if (S.p6 && S.p6.dq && S.p6.dq.active) S.p6.dq.active.slice(0, 3).forEach(function (q) { cards.push({ icon: '📋', title: 'City quest', desc: q.desc || q.name || q.id, reward: q.reward || null, type: questTargetType(q.desc || q.name) }); });
  const lv = cityLevel(); if (CITY_LEVEL_POP[lv] !== undefined) cards.push({ icon: '🏙️', title: 'City goal · level ' + (lv + 1), desc: 'Reach ' + fmt(CITY_LEVEL_POP[lv]) + ' population (now ' + fmt(Math.floor(S.city.population)) + ') — zone homes and create jobs.', reward: null, type: null });
  MOBX.quests = cards;
  const rew = function (r) { if (!r) return ''; const p = []; if (r.money) p.push('💰 ' + money(r.money)); if (r.rp) p.push('🔬 ' + r.rp + ' RP'); if (r.pp) p.push('⭐ ' + r.pp + ' PP'); return p.length ? '<small class="mqRew">Reward: ' + p.join(' · ') + '</small>' : ''; };
  showModal('🎯 QUESTS', '<div class="mQuests">' + (cards.length ? cards.map(function (c, i) {
    return '<div class="mQuest"><div class="mqHead"><span>' + c.icon + '</span><b>' + esc(c.title) + '</b></div><p>' + esc(c.desc) + '</p>' + (c.story ? '<small class="mqStory">' + esc(c.story) + '</small>' : '') + rew(c.reward) +
      '<div class="mActs"><button class="btn blue" data-mq="go" data-i="' + i + '">📍 GO TO LOCATION</button>' + (c.type && BUILDINGS[c.type] ? '<button class="btn gold" data-mq="build" data-i="' + i + '">🏗️ BUILD ' + esc(BUILDINGS[c.type].name) + '</button>' : '') + '</div></div>';
  }).join('') : '<p class="small">All quests are complete — the city is yours! 👑</p>') + '</div>');
  $('modalBody').addEventListener('click', function (e) {
    const b = e.target.closest('[data-mq]'); if (!b) return;
    const c = MOBX.quests[+b.dataset.i]; if (!c) return; sfx('click'); closeModal();
    if (b.dataset.mq === 'go') { flyToLoc(questLocation(c.type), true); toast('📍 ' + c.desc, ''); }
    else { const d = BUILDINGS[c.type]; openBuildSheet(mcatOf(d)); UI.highlight = c.type; }
  });
}

/* ===================================== DAILY REPORT cards ===================================== */
function histDelta(k, n) { const h = S.statistics.history[k]; if (!h || h.length < 2) return 0; const a = h[Math.max(0, h.length - 1 - (n || 24))]; return h[h.length - 1] - (a || 0); }
function openDailyReport() {
  if (!STARTED) return;
  closeMobileOverlays();
  const dp = histDelta('pop'), dm = histDelta('money'), inc = (S.statistics.history.inc || []).slice(-1)[0] || 0, exp = (S.statistics.history.exp || []).slice(-1)[0] || 0;
  const sign = function (v, f) { return (v >= 0 ? '+' : '−') + f(Math.abs(v)); };
  const card = function (icon, label, value, sub, cls) { return '<div class="mRep ' + (cls || '') + '"><span>' + icon + '</span><div><small>' + label + '</small><b>' + value + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div></div>'; };
  showModal('📰 DAILY REPORT · DAY ' + gameDay(), '<div class="mReport">' +
    card('👥', 'Population', fmt(Math.floor(S.city.population)), sign(dp, fmt) + ' today', dp >= 0 ? 'pos' : 'neg') +
    card('💰', 'Money', money(S.money), sign(dm, money) + ' today', dm >= 0 ? 'pos' : 'neg') +
    card('📈', 'Income', money(inc), 'per period', 'pos') + card('📉', 'Expenses', money(exp), 'per period', 'neg') +
    card('😊', 'Happiness', Math.round(S.city.happiness || 0) + '%', trendTxt(histTrend('hap')).replace(/<[^>]+>/g, '')) +
    card('🚗', 'Traffic', Math.round(SIM.traffic || 0) + '%', SIM.traffic > 65 ? 'congested' : 'flowing', SIM.traffic > 65 ? 'neg' : '') +
    card('🚓', 'Crime', Math.round(S.city.crime || 0) + '%', '', (S.city.crime || 0) > 40 ? 'neg' : '') +
    card('🏗️', 'Buildings', fmt(S.buildings.list.length), 'level ' + cityLevel()) + '</div>' +
    (UI.advice ? '<div class="mRepAdv">💡 ' + esc(UI.advice.msg) + '</div>' : ''));
}

/* ===================================== TOUCH TRAINING card ===================================== */
function showTouchTraining(force) {
  if (!IS_MOBILE || (!force && GSET.touchTrainDone)) return;
  const g = function (i, t, d) { return '<div class="mTrain"><span>' + i + '</span><b>' + t + '</b><small>' + d + '</small></div>'; };
  showModal('✋ TOUCH CONTROLS', '<div class="mTrainGrid">' + g('👆', 'Tap', 'Select a building, road, citizen or car') + g('👆👆', 'Double tap', 'Zoom in there') + g('✋', 'Drag', 'Move the camera') +
    g('⏳', 'Long press', 'Everything under your finger + tile info') + g('🤏', 'Pinch', 'Zoom in / out') + g('🔄', 'Twist', 'Rotate (↺ = north up)') + g('✌️', 'Two-finger drag', 'Pan while zoomed') + g('◀', 'Back', 'Close · cancel · pause') + '</div>' +
    '<div class="mActs"><button class="btn gold" data-mtt="ok">GOT IT 👍</button></div>', function () { GSET.touchTrainDone = true; saveGSET(); });
  $('modalBody').querySelector('[data-mtt]').onclick = function () { sfx('click'); closeModal(); };
}

/* ===================================== CRITICAL ALERTS (the game keeps running) ===================================== */
const CRIT_UNIT = { fire: 'fire', wildfire: 'fire', earthquake: 'medical', epidemic: 'medical', pandemic: 'medical', storm: 'maintenance', flood: 'maintenance', blackout: 'maintenance', infrastructure: 'maintenance', crime: 'police', riot: 'police', crimewave: 'police' };
function critTarget() {
  const L = S.buildings.list; let best = null;
  for (let i = 0; i < L.length; i++) { const b = L[i]; if (b.fire > 0) return b; if (b.damaged && !best) best = b; }
  return best;
}
function showCriticalAlert(kind, def, force) {
  if (!mobOn() || GSET.critAlerts === false || !STARTED || (selftestActive() && !force)) return;
  const b = critTarget(), unit = CRIT_UNIT[def.id] || (kind === 'crisis' ? null : 'maintenance');
  MOBX.crit = { b: b, unit: unit, loc: b ? locOf(b) : null };
  let el = document.getElementById('mCrit');
  if (!el) {
    el = document.createElement('div'); el.id = 'mCrit'; document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      const k = e.target.closest('[data-mcr]'); if (!k) return; sfx('click');
      const c = MOBX.crit; hideCriticalAlert();
      if (!c) return;
      if (k.dataset.mcr === 'view') { if (c.loc) flyToLoc(c.loc, true); else if (kind === 'crisis') openMobilePage('economy'); else openCityMap('heat:SAFETY'); }
      else if (k.dataset.mcr === 'dispatch') {
        const tile = c.b && c.b._entry !== undefined ? c.b._entry : null, v = tile !== null && c.unit && typeof emergencyDispatch === 'function' ? emergencyDispatch(c.unit, tile, { priority: true, dest: c.b }) : null;
        toast(v ? '🚨 ' + EMERGENCY_UNITS[c.unit].name + ' dispatched' : '🚨 No free unit can reach it — build ' + (c.unit === 'fire' ? 'a Fire Station' : c.unit === 'medical' ? 'a Hospital' : c.unit === 'police' ? 'a Police Station' : 'a Maintenance Depot') + ' nearby', v ? 'good' : 'bad');
        if (v && c.loc) flyToLoc(c.loc, false);
      }
    });
  }
  el.innerHTML = '<div class="mcrHead"><span>' + def.icon + '</span><div><small>⚠️ CRITICAL ALERT</small><b>' + esc(String(def.name).toUpperCase()) + '</b></div></div><p>' + esc(def.desc || '') + '</p>' +
    '<div class="mcrBtns"><button class="btn gold" data-mcr="view">👁 VIEW</button>' + (unit ? '<button class="btn red" data-mcr="dispatch">🚨 DISPATCH</button>' : '') + '<button class="btn" data-mcr="ignore">IGNORE</button></div>';
  el.classList.remove('hidden');
  haptic('alert');
  clearTimeout(MOBX.critT); MOBX.critT = setTimeout(hideCriticalAlert, 20000);
  auditSoon();
}
function hideCriticalAlert() { const el = document.getElementById('mCrit'); if (el) el.classList.add('hidden'); MOBX.crit = null; }

/* ===================================== ACHIEVEMENT popup · ADVISOR chip · CITIZEN comments ===================================== */
/* small, never blocks a touch (pointer-events: none); a burst (e.g. right after loading a city) shows one popup + a count */
function showAchievementPopup(text) {
  if (!STARTED || selftestActive()) return;
  let el = document.getElementById('mAch');
  if (!el) { el = document.createElement('div'); el.id = 'mAch'; el.className = 'hidden'; document.body.appendChild(el); }
  const now = Date.now();
  if (!el.classList.contains('hidden') && now - (el._at || 0) < 4000) { el._more = (el._more || 0) + 1; const m = el.querySelector('em'); if (m) m.textContent = '+' + el._more + ' more'; return; }
  el._at = now; el._more = 0;
  el.innerHTML = '<span>🏅</span><div><small>ACHIEVEMENT UNLOCKED</small><b>' + esc(text) + '</b><em></em></div>';
  el.classList.remove('hidden'); haptic('success');
  clearTimeout(el._t); el._t = setTimeout(function () { el.classList.add('hidden'); }, 4000);
}
function advisorLoc(a) {
  const t = String(a.msg || '').toLowerCase(), L = S.buildings.list;
  if (/traffic|congest|jam/.test(t) && MAP.cong) { let bi = -1, bv = 0.3; for (let i = 0; i < MAP.cong.length; i++) if (MAP.roads[i] && MAP.cong[i] > bv) { bv = MAP.cong[i]; bi = i; } if (bi >= 0) return locOf({ tile: bi }); }
  if (/power|electric/.test(t)) { const b = L.find(function (x) { return x._powered === false; }); if (b) return locOf(b); }
  if (/water/.test(t)) { const b = L.find(function (x) { return x._water === false; }); if (b) return locOf(b); }
  if (/road/.test(t)) { const b = L.find(function (x) { return !x._road && !bdef(x).noRoad && x.owner === 'player'; }); if (b) return locOf(b); }
  if (/fire|burn/.test(t)) { const b = L.find(function (x) { return x.fire > 0; }); if (b) return locOf(b); }
  return null;
}
/* SMART ADVISOR: a 💡 button in the side column lights up; tapping it opens the tip with SHOW LOCATION / DO IT */
function showAdvisorChip(a) {
  if (!a || !mobOn()) return;
  const btn = document.getElementById('mAdvBtn'); if (!btn) return;
  btn.classList.remove('hidden');
  if (a.id !== MOBX.adviceId) { MOBX.adviceId = a.id; btn.classList.add('new'); }
}
function openAdvisorCard() {
  const a = UI.advice, btn = document.getElementById('mAdvBtn');
  if (!a) { if (btn) btn.classList.add('hidden'); return; }
  if (btn) btn.classList.remove('new');
  let el = document.getElementById('mAdv');
  if (!el) {
    el = document.createElement('div'); el.id = 'mAdv'; el.className = 'hidden'; document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      const k = e.target.closest('[data-madv]'); if (!k) return; sfx('click');
      const a2 = UI.advice; el.classList.add('hidden');
      if (k.dataset.madv === 'loc' && el._loc) flyToLoc(el._loc, true);
      else if (k.dataset.madv === 'do' && a2 && a2.act) { closeMobileOverlays(); doAdviceAction(a2.act); }
    });
  }
  if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
  const loc = advisorLoc(a); el._loc = loc;
  el.innerHTML = '<div class="maHead"><span class="maIcon">💡</span><b>CITY ADVISOR</b><button class="mX" data-madv="x" aria-label="Close">✕</button></div><p>' + esc(a.msg) + '</p><div class="maBtns">' + (loc ? '<button class="btn small blue" data-madv="loc">📍 SHOW LOCATION</button>' : '') + (a.act ? '<button class="btn small gold" data-madv="do">DO IT</button>' : '') + '</div>';
  el.classList.remove('hidden');
  const r = btn ? btn.getBoundingClientRect() : { right: 60, top: 80 }, sa = safeRect();
  el.style.left = Math.round(r.right + 8) + 'px'; el.style.top = Math.round(clamp(r.top, sa.t, sa.b - el.offsetHeight - 4)) + 'px';
  auditSoon();
}
document.addEventListener('pointerdown', function (e) { const el = document.getElementById('mAdv'); if (el && !el.classList.contains('hidden') && !el.contains(e.target) && !(e.target.closest && e.target.closest('#mAdvBtn'))) el.classList.add('hidden'); }, true);
const COMMENT_COOLDOWN_MS = 75000;
function commentTick() {
  if (!STARTED || !mobOn() || GSET.comments === false || S.settings.speed === 0 || MSHEET.open || MINS.kind || MMAP.open || MPAGE.kind || $('modalWrap').classList.contains('show')) return;
  const now = Date.now(); if (now - MOBX.commentAt < COMMENT_COOLDOWN_MS) return;
  const c = AG.citizens.find(function (x) { return x.bubble && x.bubble.until > FX.time && !x.inside; }); if (!c) return;
  MOBX.commentAt = now;
  let el = document.getElementById('mComment');
  if (!el) { el = document.createElement('button'); el.id = 'mComment'; document.body.appendChild(el); el.onclick = function () { el.classList.add('hidden'); if (el._c && AG.citizens.indexOf(el._c) >= 0) { camFlyTo(el._c.x, el._c.y, Math.max(CAM.zoom, 1.3)); openInspector('citizen', el._c); } }; }
  el._c = c; el.className = c.bubble.bad ? 'bad' : '';
  const sr = MOB.side && shown(MOB.side) ? MOB.side.getBoundingClientRect() : null; el.style.left = sr ? Math.round(sr.right + 8) + 'px' : '';
  el.innerHTML = '<span>💬</span><b>Citizen #' + c.id + '</b> “' + esc(c.bubble.text) + '”';
  clearTimeout(el._t); el._t = setTimeout(function () { el.classList.add('hidden'); }, 5500);
}

/* ===================================== AUTOMATIC EVENT SNAPSHOTS (keeps the last 3) ===================================== */
const AUTO_SNAP_KEEP = 3;
function autoSnapshot(name) {
  try {
    if (!GSET.autoSnap || !STARTED || (typeof WG !== 'undefined' && WG.busy) || selftestActive() || typeof createSnapshot !== 'function') return null;
    const now = Date.now(); if (now - MOBX.snapAt < 90000) return null; MOBX.snapAt = now;
    const meta = createSnapshot('📸 ' + name, true, { auto: true }); if (!meta) return null;
    const autos = snapshotIndex().filter(function (s) { return s.auto; });
    while (autos.length > AUTO_SNAP_KEEP) deleteSnapshot(autos.shift().id);
    Log.info('Auto snapshot: ' + name);
    return meta;
  } catch (e) { Log.warn('Auto snapshot failed: ' + e.message); return null; }
}

/* ===================================== MINIMAP 2.0 · ZOOM BUTTONS ===================================== */
const MINI_SIZES = ['s', 'm', 'l'];
function applyMiniSize() { const s = MINI_SIZES.indexOf(GSET.miniSize) >= 0 ? GSET.miniSize : 'm'; MINI_SIZES.forEach(function (x) { document.body.classList.toggle('mini-' + x, x === s); }); if (typeof MINI !== 'undefined') MINI.ver = -1; requestAnimationFrame(function () { drawMinimap(true); }); }
function buildMinimap2() {
  const cv = $('minimap'); if (!cv || document.getElementById('mMiniCtl')) return;
  const ctl = document.createElement('div'); ctl.id = 'mMiniCtl';
  ctl.innerHTML = '<button data-mmc="size" aria-label="Minimap size">⤢</button><button data-mmc="map" aria-label="Full map">🗺️</button><button data-mmc="close" aria-label="Close minimap">✕</button>';
  document.body.appendChild(ctl);
  ctl.addEventListener('click', function (e) {
    const b = e.target.closest('[data-mmc]'); if (!b || !STARTED) return; sfx('click'); haptic('tap');
    const k = b.dataset.mmc;
    if (k === 'size') { GSET.miniSize = MINI_SIZES[(MINI_SIZES.indexOf(GSET.miniSize) + 1) % 3] || 'l'; saveGSET(); applyMiniSize(); }
    else if (k === 'map') openCityMap();
    else { S.settings.minimap = false; cv.classList.add('hidden'); syncGSETFromGame(); refreshMobileHud(true); }
    syncMiniCtl();
  });
  /* a quick tap (not a drag) on the minimap opens the full city map */
  let down = null;
  cv.addEventListener('pointerdown', function (e) { if (mobOn()) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', function (e) { const d = down; down = null; if (!d || !mobOn()) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && performance.now() - d.t < 350) setTimeout(function () { openCityMap(); }, 0); });
  applyMiniSize(); syncMiniCtl();
}
window.addEventListener('resize', function () { syncMiniCtl(); });
function syncMiniCtl() {
  const ctl = document.getElementById('mMiniCtl'), cv = $('minimap'); if (!ctl || !cv) return;
  const on = STARTED && !cv.classList.contains('hidden') && shown(cv);
  ctl.classList.toggle('hidden', !on);
  const z = document.getElementById('mZoomBox'); if (z) z.classList.toggle('hidden', GSET.gestureCam !== false);
}
/* emergencies + important buildings on the minimap */
function drawMinimapMarks() {
  const cv = $('minimap'); if (!cv || cv.classList.contains('hidden') || !STARTED) return;
  const c = cv.getContext('2d'), k = cv.width / MAP.W, t = performance.now() / 300;
  c.save();
  S.buildings.list.forEach(function (b) {
    if (b.fire > 0 || b.damaged) { const d = bdef(b), r = (3 + Math.sin(t) * 1.2) * Math.min(2, window.devicePixelRatio || 1); c.fillStyle = b.fire > 0 ? '#ff3b30' : '#ff9f1c'; c.beginPath(); c.arc((b.x + d.w / 2) * k, (b.y + d.h / 2) * k, r, 0, 6.283); c.fill(); }
  });
  c.restore();
}
function buildZoomButtons() {
  if (document.getElementById('mZoomBox') || !MOB.side) return;
  const z = document.createElement('div'); z.id = 'mZoomBox'; z.className = 'hidden';
  z.innerHTML = '<button class="mFab" data-mz="1" aria-label="Zoom in">＋</button><button class="mFab" data-mz="-1" aria-label="Zoom out">－</button>';
  MOB.side.appendChild(z);
  z.addEventListener('click', function (e) { const b = e.target.closest('[data-mz]'); if (!b || !STARTED) return; sfx('click'); haptic('tap'); const w = screenToWorld(CW / 2, CH / 2); camFlyTo(w.x, w.y, clamp(CAM.zoom * (+b.dataset.mz > 0 ? 1.35 : 1 / 1.35), 0.3, 2.6)); });
}

/* ===================================== PHOTO MODE (touch): Hide UI · screenshot without HUD ===================================== */
function photoTouchBar() {
  const el = $('photoBar'); if (!el || !mobOn() || el.querySelector('#phHide')) return;
  const row = el.querySelector('.pbRow'); if (!row) return;
  const b = document.createElement('button'); b.className = 'btn small gold'; b.id = 'phHide'; b.textContent = '🙈 HIDE UI';
  b.onclick = function () { document.body.classList.add('photoHide'); toast('Tap anywhere to show the photo controls again', ''); };
  row.insertBefore(b, row.querySelector('#phExit'));
}
document.addEventListener('pointerdown', function (e) { if (document.body.classList.contains('photoHide') && !(e.target.closest && e.target.closest('#photoBar'))) { document.body.classList.remove('photoHide'); } }, true);

/* ===================================== MOBILE STRESS TEST (development / test builds · authorized developers only) ===================================== */
function stressAllowed() {
  if (BUILD.dev || BUILD.test) return true;
  return typeof AdminAuth !== 'undefined' && AdminAuth.active() && ['OWNER', 'DEVELOPER', 'DEBUG'].indexOf(AdminAuth.role()) >= 0;
}
function openStressTest() {
  if (!stressAllowed()) {
    if (typeof AdminAuth !== 'undefined') AdminAuth.security('ADMIN COMMAND DENIED', 'mobile stress test — not authorized');
    toast('🔒 Not available', 'bad'); return;
  }
  if (!STARTED) { toast('Start or load a city first', 'bad'); return; }
  if (typeof AdminAuth !== 'undefined' && AdminAuth.active()) AdminAuth.record('mobileStressTest', S.city.name, 'started');
  const keep = S.settings.speed, frames = [], t0 = performance.now(), heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  MOBX.stress = { on: true };
  setSpeed(10);
  toast('🧪 MOBILE STRESS TEST — 10 s at 10× …', '');
  let last = t0;
  const step = function (now) {
    frames.push(now - last); last = now;
    if (now - t0 < 10000 && MOBX.stress && MOBX.stress.on) { requestAnimationFrame(step); return; }
    setSpeed(keep); MOBX.stress = null;
    const ms = frames.slice(1).sort(function (a, b) { return a - b; }), avg = ms.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, ms.length), p99 = ms[Math.floor(ms.length * 0.99)] || 0;
    const heap = performance.memory ? performance.memory.usedJSHeapSize : 0, dev = Platform.device ? Platform.device() : {};
    const res = { fps: Math.round(1000 / Math.max(1, avg)), low1: Math.round(1000 / Math.max(1, p99)), frameMs: +avg.toFixed(1), heapMB: Math.round(heap / 1048576), heapDeltaMB: Math.round((heap - heap0) / 1048576), citizens: AG.citizens.length, vehicles: AG.vehicles.length, buildings: S.buildings.list.length, map: MAP.W + '×' + MAP.H };
    Log.info('MOBILE STRESS TEST: ' + JSON.stringify(res));
    if (typeof AdminAuth !== 'undefined' && AdminAuth.active()) AdminAuth.record('mobileStressTest', S.city.name, res.fps + ' FPS');
    showModal('🧪 MOBILE STRESS TEST', '<div class="mReport">' + [['🎞', 'Average FPS', res.fps], ['📉', '1% low FPS', res.low1], ['⏱', 'Frame time', res.frameMs + ' ms'], ['🧠', 'JS heap', res.heapMB ? res.heapMB + ' MB (' + (res.heapDeltaMB >= 0 ? '+' : '') + res.heapDeltaMB + ')' : 'n/a'],
      ['🧑', 'Citizens', fmt(res.citizens)], ['🚗', 'Vehicles', fmt(res.vehicles)], ['🏢', 'Buildings', fmt(res.buildings)], ['🗺', 'World', res.map]].map(function (r) { return '<div class="mRep"><span>' + r[0] + '</span><div><small>' + r[1] + '</small><b>' + r[2] + '</b></div></div>'; }).join('') + '</div>' +
      '<p class="small">' + esc(PLATFORM_NAME + ' · ' + (dev.model || navigator.userAgent.slice(0, 60))) + ' · quality ' + esc(String(S.settings.quality)) + ' · FPS cap ' + (window.BCT_FPS_CAP || 60) + '</p>');
  };
  requestAnimationFrame(step);
}

/* ===================================== BATTERY / IDLE FPS rules ===================================== */
function extraFpsCap() {
  if (!IS_MOBILE) return 0;
  if (Lifecycle.state.now === 'background') return 15;
  if (!STARTED) return 30;                                                      // menus: no need for 60 FPS
  if (GSET.powerMode === 'battery') return 30;
  if (S && S.settings && S.settings.speed === 0 && (UI.idleTimer || 0) > 30 && !GST.pts.size) return 30;   // paused and untouched
  return 0;
}

/* ===================================== MOBILE TUTORIAL (city-building steps) ===================================== */
const MOBILE_TUTORIAL2 = [
  ['✋', 'Move the camera', 'Drag with one finger. Pinch to zoom, twist to rotate — 🎯 brings you back to the city centre, ↺ turns north up.', null],
  ['🛣️', 'Build a road', 'ROAD → pick a type → touch START, DRAG, lift to END, then ✓ BUILD. The preview shows length, cost, capacity and slope.', '[data-mbar="road"]'],
  ['🏠', 'Build homes', 'ZONE → Residential and paint next to your road — or BUILD → RESIDENTIAL → a house card. Green ghost = VALID.', '[data-mbar="zone"]'],
  ['⚡', 'Connect utilities', 'BUILD → UTILITY: a power plant and a water pump. The HUD shows ⚡ and 💧 — tap them to see the network map.', '[data-mbar="build"]'],
  ['🏭', 'Create jobs', 'BUILD → COMMERCIAL, INDUSTRIAL or OFFICE. Citizens need work — the cards show workers and capacity.', '[data-mbar="build"]'],
  ['🚦', 'Watch traffic', 'MAP → TRAFFIC heatmap. Tap a road for Traffic %, vehicles/hour and average speed — then UPGRADE or EDIT it.', '[data-mbar="map"]'],
  ['🌆', 'Expand the city', 'CITY shows your level and land. ⏸ → SAVE saves with one tap, ⏸ → HELP replays this tutorial any time.', '[data-mbar="city"]']
];

/* ===================================== BOOT (phones and tablets) ===================================== */
const MOBX0 = {};
function mobileExtraBoot() {
  MOBILE_TUTORIAL.length = 0; MOBILE_TUTORIAL2.forEach(function (s) { MOBILE_TUTORIAL.push(s); });
  const wrap = function (name, fn) { const f0 = window[name]; if (typeof f0 !== 'function') return; MOBX0[name] = f0; window[name] = fn(f0); };
  /* critical alerts + snapshots before disasters and economy crises */
  wrap('startDisaster', function (f0) { return function (d) { autoSnapshot('Before Disaster: ' + d.name); const r = f0.apply(this, arguments); try { const b = critTarget(); if (b) noteAt(b); showCriticalAlert('disaster', d); } catch (e) { Log.warn('Critical alert: ' + e.message); } return r; }; });
  wrap('startCrisis', function (f0) { return function (c) { autoSnapshot('Before Economy Crisis: ' + c.name); const r = f0.apply(this, arguments); try { showCriticalAlert('crisis', c); } catch (e) { Log.warn('Critical alert: ' + e.message); } return r; }; });
  wrap('igniteBuilding', function (f0) { return function (b) { if (b) noteAt(b); return f0.apply(this, arguments); }; });
  wrap('placeBuilding', function (f0) { return function () { const b = f0.apply(this, arguments); try { if (b && !isAI(b) && STARTED && (bdef(b).landmark || buildCost(bdef(b)) >= 50000)) { const nm = bdef(b).name; setTimeout(function () { autoSnapshot('After Major Construction: ' + nm); }, 2500); } } catch (e) { /* snapshot only */ } return b; }; });
  /* notifications remember where they happened; the achievement popup */
  wrap('notify', function (f0) { return function (msg) { const s = String(msg || ''); if (s.indexOf('🏅 Achievement unlocked:') === 0) showAchievementPopup(s.replace('🏅 Achievement unlocked:', '').trim()); return f0.apply(this, arguments); }; });
  wrap('logNote', function (f0) { return function () { const r = f0.apply(this, arguments); const l = freshLoc(); if (l && MNOTE.list[0]) { MNOTE.list[0].loc = l; if (MNOTE.open) renderNotificationCenter(); } return r; }; });
  wrap('toast', function (f0) { return function (msg) { const r = f0.apply(this, arguments); const l = freshLoc(), box = $('toasts'), el = box && box.lastElementChild; if (l && el && el.textContent === String(msg)) { el.classList.add('hasLoc'); el.textContent += ' 📍'; el.onclick = function () { flyToLoc(l, true); }; } return r; }; });
  wrap('renderNotificationCenter', function (f0) {
    return function () {
      const r = f0.apply(this, arguments);
      const rows = document.querySelectorAll('#mNotesList .mNote');
      MNOTE.list.forEach(function (n, i) { if (n.loc && rows[i]) { rows[i].classList.add('hasLoc'); rows[i].dataset.mnloc = i; rows[i].insertAdjacentHTML('beforeend', '<em class="mnGo">📍 GO</em>'); } });
      return r;
    };
  });
  document.addEventListener('click', function (e) { const n = e.target.closest && e.target.closest('[data-mnloc]'); if (!n) return; const it = MNOTE.list[+n.dataset.mnloc]; if (it && it.loc) { sfx('click'); flyToLoc(it.loc, true); } });
  /* smart advisor chip */
  wrap('showAdvice', function (f0) { return function (a) { const r = f0.apply(this, arguments); try { if (a) showAdvisorChip(a); } catch (e) { /* advice only */ } return r; }; });
  /* FPS: battery and idle rules on top of the FPS target */
  wrap('updateFpsCap', function (f0) { return function () { f0.apply(this, arguments); const x = extraFpsCap(); if (x && (!window.BCT_FPS_CAP || x < window.BCT_FPS_CAP)) window.BCT_FPS_CAP = x; }; });
  Lifecycle.on('background', function () { updateFpsCap(); });
  Lifecycle.on('foreground', function () { updateFpsCap(); });
  /* minimap emergency markers, photo mode HIDE UI, touch training after the tutorial, HELP in the pause menu */
  wrap('drawMinimap', function (f0) { return function () { const r = f0.apply(this, arguments); try { if (mobOn()) drawMinimapMarks(); } catch (e) { /* markers only */ } return r; }; });
  wrap('renderPhotoBar', function (f0) { return function () { const r = f0.apply(this, arguments); photoTouchBar(); return r; }; });
  wrap('exitPhoto', function (f0) { return function () { document.body.classList.remove('photoHide'); return f0.apply(this, arguments); }; });
  wrap('endMobileTutorial', function (f0) { return function (skipped) { const r = f0.apply(this, arguments); if (!skipped && !GSET.touchTrainDone) setTimeout(function () { showTouchTraining(false); }, 400); return r; }; });
  wrap('openPauseMenu', function (f0) {
    return function () {
      const r = f0.apply(this, arguments);
      const more = document.querySelector('#modal .mPauseMore');
      if (more && !more.querySelector('[data-mp2]')) {
        more.insertAdjacentHTML('afterbegin', '<button class="btn small gold" data-mp2="help">❓ HELP</button><button class="btn small" data-mp2="quests">🎯 Quests</button><button class="btn small" data-mp2="report">📰 Report</button>');
        more.querySelectorAll('[data-mp2]').forEach(function (b) { b.onclick = function () { sfx('click'); const k = b.dataset.mp2; closeModal(); if (k === 'help') openControlsHelp(); else if (k === 'quests') openQuestPage(); else openDailyReport(); }; });
      }
      return r;
    };
  });
  wrap('openControlsHelp', function (f0) {
    return function () {
      const r = f0.apply(this, arguments);
      const acts = document.querySelector('#modalBody .mActs');
      if (acts && !acts.querySelector('[data-mh3]')) { acts.insertAdjacentHTML('beforeend', '<button class="btn" data-mh3="train">✋ Touch training</button>'); acts.querySelector('[data-mh3]').onclick = function () { sfx('click'); closeModal(); showTouchTraining(true); }; }
      return r;
    };
  });
  /* back button: the chooser and the critical alert close first */
  wrap('mobileBackPanels', function (f0) { return function () { if (closeSelectChooser()) return true; if (document.body.classList.contains('photoHide')) { document.body.classList.remove('photoHide'); return true; } return f0.apply(this, arguments); }; });
  wrap('returnToMenu', function (f0) { return function () { stopTracking(); closeSelectChooser(); hideCriticalAlert(); return f0.apply(this, arguments); }; });
  buildMinimap2(); buildZoomButtons();
  if (MOB.side && !document.getElementById('mAdvBtn')) { const ab = document.createElement('button'); ab.className = 'mFab hidden'; ab.id = 'mAdvBtn'; ab.setAttribute('aria-label', 'City advisor'); ab.textContent = '💡'; ab.onclick = function () { if (!STARTED) return; sfx('click'); openAdvisorCard(); }; MOB.side.insertBefore(ab, MOB.side.querySelector('#mRotReset')); }
  let exp = -1;
  setInterval(function () {
    try {
      syncMiniCtl(); commentTick();
      const ab = document.getElementById('mAdvBtn'); if (ab) ab.classList.toggle('hidden', !UI.advice || !STARTED);
      if (!STARTED) { exp = -1; return; }
      const e = S.city.expansion || 0; if (exp >= 0 && e > exp) autoSnapshot('After City Expansion'); exp = e;
    } catch (err) { /* never break the game */ }
  }, 1000);
  updateFpsCap();
}
if (typeof mobilePanelsBoot === 'function') { const mpb0 = mobilePanelsBoot; window.mobilePanelsBoot = function () { const r = mpb0.apply(this, arguments); try { mobileExtraBoot(); } catch (e) { Log.warn('Mobile extras: ' + e.message); } return r; }; }

/* ===================================== ACTIONS (touch · mouse · keyboard · controller) ===================================== */
Actions.register(Action.Pause, function () { if (STARTED) openPauseMenu(); });
Actions.register(Action.Speed, function () { if (!STARTED) return; if (mobOn()) openSpeedSheet(); else { const i = SIM_SPEEDS.indexOf(S.settings.speed); setSpeed(SIM_SPEEDS[(i + 1) % SIM_SPEEDS.length]); } });
Actions.register(Action.Search, function () { if (!STARTED) return; if (mobOn()) openSearch(); else openPalette(); });
Actions.register(Action.ResetCamera, function () { if (STARTED) resetCamera(); });
Actions.register(Action.Build, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('build'); else openPanel('build'); });
Actions.register(Action.Road, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('road'); else setTool('road'); });
Actions.register(Action.Zone, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('zone'); else setTool('zone'); });
Actions.register(Action.Select, function () { if (STARTED) setTool('select'); });
Actions.register(Action.Rotate, function () { if (STARTED && UI.placing) rotatePlacement(); });
Actions.register(Action.Cancel, function () { if (mobOn() && typeof bctOnBack === 'function') bctOnBack(); else cancelAction(); });
Actions.register(Action.Map, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('map'); else { S.settings.minimap = !S.settings.minimap; $('minimap').classList.toggle('hidden', !S.settings.minimap); drawMinimap(true); } });
Actions.register(Action.City, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('city'); else openCityHall(); });
Actions.register(Action.Economy, function () { if (!STARTED) return; if (mobOn()) mobileToolbar('economy'); else openPanel('city'); });
