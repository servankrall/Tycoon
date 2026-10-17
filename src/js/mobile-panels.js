'use strict';
/* BLOCK CITY TYCOON — MOBILE UI 2.0 (Part 13) — panels
   Bottom sheets (BUILD with 8 categories and touch cards, TRANSPORT), the building / citizen / vehicle / road inspector
   cards, the CITY and ECONOMY pages (cards + touch graphs with drag tooltip and pinch zoom), the full-screen CITY MAP,
   the minimap, toasts + NOTIFICATION CENTER, the mobile PAUSE menu with one-tap SAVE, mobile SETTINGS (cards),
   the 7-step touch tutorial, autosave after important events, LOW MEMORY MODE, the FPS target, ERROR RECOVERY,
   the automatic UI BOUNDS audit and (development builds only) SHOW UI BOUNDS. Tablets get side panels. */

/* ===================================== BOTTOM SHEET (phones) / SIDE PANEL (tablets) ===================================== */
const MSHEET = { open: false, kind: '', el: null, cat: 'res', drag: null };
function sheetEl() {
  if (MSHEET.el) return MSHEET.el;
  const el = document.createElement('div'); el.id = 'mSheet'; el.className = 'hidden';
  el.innerHTML = '<div class="mSheetHead"><i class="mGrab"></i><b class="mSheetTitle"></b><div class="mSheetTools"></div><button class="mX" data-msx="1" aria-label="Close">✕</button></div><div class="mSheetBody mScroll"></div>';
  document.body.appendChild(el); MSHEET.el = el;
  el.querySelector('[data-msx]').onclick = function () { closeSheet(); sfx('click'); };
  /* swipe down to close: from the header, or from the body while it is scrolled to the top */
  const body = el.querySelector('.mSheetBody');
  el.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.mX') || document.body.classList.contains('tablet')) return;
    const inHead = !!e.target.closest('.mSheetHead');
    if (!inHead && body.scrollTop > 2) return;
    MSHEET.drag = { y: e.clientY, x: e.clientX, id: e.pointerId, head: inHead, dy: 0, on: false };
  });
  el.addEventListener('pointermove', function (e) {
    const d = MSHEET.drag; if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y, dx = e.clientX - d.x;
    if (!d.on && dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.3 && (d.head || body.scrollTop <= 2)) { d.on = true; try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } }
    if (d.on) { d.dy = Math.max(0, dy); el.style.transform = 'translateY(' + d.dy + 'px)'; }
  });
  const end = function (e) { const d = MSHEET.drag; if (!d || d.id !== e.pointerId) return; MSHEET.drag = null; el.style.transform = ''; if (d.on && d.dy > Math.min(90, el.offsetHeight * 0.25)) { closeSheet(); sfx('click'); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('click', function (e) { if (MSHEET.drag && MSHEET.drag.on) e.stopPropagation(); }, true);
  return el;
}
function openSheet(kind, title, html, tools) {
  const el = sheetEl();
  closeInspector();
  MSHEET.open = true; MSHEET.kind = kind;
  el.dataset.kind = kind;
  el.querySelector('.mSheetTitle').innerHTML = title;
  el.querySelector('.mSheetTools').innerHTML = tools || '';
  el.querySelector('.mSheetBody').innerHTML = html;
  el.classList.remove('hidden'); el.style.transform = '';
  document.body.classList.add('mSheetOpen');
  refreshMobileBar(); auditSoon();
}
function closeSheet() {
  if (!MSHEET.open) return false;
  MSHEET.open = false; MSHEET.kind = '';
  if (MSHEET.el) MSHEET.el.classList.add('hidden');
  document.body.classList.remove('mSheetOpen');
  refreshMobileBar();
  return true;
}

/* ===================================== BUILD MENU: 8 categories, touch cards ===================================== */
const MCATS = [['res', '🏠', 'Residential'], ['com', '🛍️', 'Commercial'], ['ind', '🏭', 'Industrial'], ['off', '🏢', 'Office'],
  ['svc', '🏥', 'Service'], ['park', '🌳', 'Park'], ['util', '⚡', 'Utility'], ['spec', '⭐', 'Special']];
const MCAT_OF_CAT = { Residential: 'res', Commercial: 'com', Industry: 'ind', Resources: 'ind', Logistics: 'ind', Services: 'svc', Waste: 'svc', Science: 'svc', Transport: 'svc', Leisure: 'park', Utilities: 'util', Landmarks: 'spec' };
const OFFICE_IDS = ['office', 'bank', 'stockexchange', 'techcampus', 'datacenter', 'bankhq', 'startup'];
function mcatOf(d) { if (OFFICE_IDS.indexOf(d.id) >= 0 || ((d.sector === 'TECHNOLOGY' || d.sector === 'FINANCE') && d.cat !== 'Science')) return 'off'; return MCAT_OF_CAT[d.cat] || 'spec'; }
function reqLevel(d) {
  const u = d.unlock || {};
  if (u.cityLevel) return u.cityLevel;
  if (u.pop) { for (let i = 0; i < CITY_LEVEL_POP.length; i++) if (CITY_LEVEL_POP[i] >= u.pop) return i + 1; return 20; }
  return 1;
}
function cardCapacity(d) { return d.housing ? '🏠 ' + fmt(d.housing) : d.beds ? '🛏 ' + fmt(d.beds) : d.transit ? '🚌 ' + fmt(d.transit) : d.power > 0 ? '⚡ ' + fmt(d.power) : d.water > 0 ? '💧 ' + fmt(d.water) : d.edu ? '🎓 ' + fmt(d.edu) : d.cap && d.sector !== 'NONE' ? '📦 ' + fmt(d.cap) : '—'; }
/* Card: icon · name · cost · workers · capacity · required level · BUILD — the whole card is the touch target */
function buildCardHtml(d) {
  const st = unlockStatus(d), cost = buildCost(d), poor = funds(payerFor(d)) < cost, ban = S.p5 && challengeBans(d);
  const lock = !st.ok || ban, lvl = reqLevel(d);
  return '<button class="mCard' + (lock ? ' locked' : poor ? ' poor' : '') + '" data-mbuild="' + d.id + '">' +
    '<span class="mcIcon">' + d.icon + '</span><span class="mcName">' + esc(d.name) + '</span>' +
    '<span class="mcMeta"><b class="mcCost">' + money(cost) + (d.public ? ' 🏛' : '') + '</b><i class="mcLvl' + (cityLevel() < lvl ? ' no' : '') + '">LV ' + lvl + '</i></span>' +
    '<span class="mcStats"><span>👷 ' + fmt(d.workers || 0) + '</span><span>' + cardCapacity(d) + '</span></span>' +
    '<span class="mcGo">' + (ban ? '🚫 BANNED' : !st.ok ? '🔒 ' + esc(st.reason) : poor ? '💸 NEED FUNDS' : 'BUILD') + '</span></button>';
}
function buildSheetHtml() {
  const list = BUILDING_LIST.filter(function (d) { return !d.hidden && mcatOf(d) === MSHEET.cat; });
  list.sort(function (a, b) { const la = unlockStatus(a).ok ? 0 : 1, lb = unlockStatus(b).ok ? 0 : 1; return la - lb || a.cost - b.cost; });
  return '<div class="mChips mCats">' + MCATS.map(function (c) { return '<button class="mChip' + (MSHEET.cat === c[0] ? ' on' : '') + '" data-mcat="' + c[0] + '"><span>' + c[1] + '</span>' + c[2] + '</button>'; }).join('') + '</div>' +
    '<div class="mCards">' + (list.length ? list.map(buildCardHtml).join('') : '<p class="small">No buildings in this category yet.</p>') + '</div>';
}
function openBuildSheet(cat) {
  if (cat) MSHEET.cat = cat;
  openSheet('build', '🏗️ BUILD', buildSheetHtml(), '<button class="btn small" data-mtool="bulldoze">🚜 DEMOLISH</button>');
  const b = MSHEET.el.querySelector('.mChip.on'); if (b && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function openTransportSheet() {
  const list = BUILDING_LIST.filter(function (d) { return !d.hidden && d.cat === 'Transport'; }).sort(function (a, b) { return a.cost - b.cost; });
  const lines = S.p9 && S.p9.transit ? S.p9.transit.lines.length : 0;
  openSheet('transport', '🚇 TRANSPORT', '<div class="mActs">' +
    '<button class="btn blue" data-mtr="road">🛣️ Build roads</button><button class="btn" data-mtr="lines">🚌 Lines & routes (' + lines + ')</button><button class="btn" data-mtr="map">🗺️ Transit map</button><button class="btn" data-mtr="traffic">🚦 Traffic ' + Math.round(SIM.traffic || 0) + '%</button></div>' +
    '<div class="mCards">' + list.map(buildCardHtml).join('') + '</div>');
}
function sheetClick(e) {
  if (!MSHEET.el || !MSHEET.el.contains(e.target)) return;
  const c = e.target.closest('[data-mcat]'), b = e.target.closest('[data-mbuild]'), t = e.target.closest('[data-mtool]'), tr = e.target.closest('[data-mtr]');
  if (c) { MSHEET.cat = c.dataset.mcat; MSHEET.el.querySelector('.mSheetBody').innerHTML = buildSheetHtml(); sfx('click'); const on = MSHEET.el.querySelector('.mChip.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' }); return; }
  if (b) {
    const d = BUILDINGS[b.dataset.mbuild]; if (!d) return;
    const st = unlockStatus(d);
    if (!st.ok) { toast('🔒 ' + d.name + ': ' + st.reason, 'bad'); sfx('error'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    closeSheet(); startPlacing(d); return;
  }
  if (t) { closeSheet(); setTool('bulldoze'); toast('🚜 DEMOLISH: tap a building or road — you confirm before anything is removed', ''); showToolHint('🚜 DEMOLISH MODE — tap a building or road', function () { setTool('select'); }); return; }
  if (tr) {
    const k = tr.dataset.mtr; sfx('click'); closeSheet();
    if (k === 'road') enterDrawMode('road'); else if (k === 'lines') openPanel('city', 'transit'); else if (k === 'map') openCityMap('transit'); else if (k === 'traffic') { if (typeof showHeatPicker === 'function') showHeatPicker(); }
  }
}
/* small banner for tools without their own bar (demolish) */
function showToolHint(text, onClose) {
  let el = document.getElementById('mToolHint');
  if (!el) { el = document.createElement('div'); el.id = 'mToolHint'; document.body.appendChild(el); }
  el.innerHTML = '<span>' + text + '</span><button class="btn small red" id="mToolHintX">✕ DONE</button>';
  el.classList.remove('hidden');
  el.querySelector('#mToolHintX').onclick = function () { el.classList.add('hidden'); if (onClose) onClose(); sfx('click'); };
}
function hideToolHint() { const el = document.getElementById('mToolHint'); if (el) el.classList.add('hidden'); }

/* ===================================== INSPECTOR CARDS ===================================== */
const MINS = { kind: null, ref: null, el: null, demo: 0, timer: null, tab: 'overview' };
function inspectorEl() {
  if (MINS.el) return MINS.el;
  const el = document.createElement('div'); el.id = 'mInspect'; el.className = 'hidden';
  document.body.appendChild(el); MINS.el = el;
  el.addEventListener('click', inspectorClick);
  return el;
}
function openInspector(kind, ref) {
  inspectorEl();
  if (MSHEET.open) closeSheet();
  closeNotificationCenter();
  if (MINS.kind !== kind || MINS.ref !== ref) MINS.tab = 'overview';
  MINS.kind = kind; MINS.ref = ref; MINS.demo = 0;
  renderInspector();
  MINS.el.classList.remove('hidden'); document.body.classList.add('mInsOpen');
  clearInterval(MINS.timer); MINS.timer = setInterval(function () { if (MINS.kind && !uiBusyM()) renderInspector(); }, 1000);
  auditSoon();
}
function uiBusyM() { return performance.now() < (UI.busyUntil || 0); }
function closeInspector(fromSelect) {
  if (!MINS.kind) return false;
  const k = MINS.kind; MINS.kind = null; MINS.ref = null; clearInterval(MINS.timer);
  if (MINS.el) MINS.el.classList.add('hidden');
  if (!MNOTE.open) document.body.classList.remove('mInsOpen');
  if (k === 'building' && !fromSelect && UI.selected) MOBP.selectBuilding0(null);
  return true;
}
function insRow(label, value, cls) { return '<div class="miRow"><span>' + label + '</span><b class="' + (cls || '') + '">' + value + '</b></div>'; }
function insBar(label, v) { v = clamp(v || 0, 0, 100); return '<div class="miBar"><span>' + label + '</span><i><em style="width:' + v + '%;background:' + (v > 50 ? '#06d6a0' : v > 25 ? '#ffd166' : '#ef476f') + '"></em></i><b>' + Math.round(v) + '%</b></div>'; }
function importantBuilding(b) { const d = bdef(b); return !!(d.landmark || d.unique || d.id === 'townhall' || buildCost(d) >= 50000 || (b.level || 1) >= 5); }
/* road helpers: same-type connected segment (length), traffic on and around a tile */
function roadSegment(x, y) {
  const t0 = MAP.roads[idx(x, y)], seen = new Set([idx(x, y)]), q = [[x, y]];
  while (q.length && seen.size < 600) { const c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { const nx = c[0] + o[0], ny = c[1] + o[1]; if (!inMap(nx, ny)) return; const i = idx(nx, ny); if (seen.has(i) || MAP.roads[i] !== t0 || MAP.inter[i]) return; seen.add(i); q.push([nx, ny]); }); }
  return Array.from(seen);
}
function roadTraffic(x, y, rt) {
  const vs = AG.vehicles.filter(function (v) { return Math.abs(v.x / TILE - (x + 0.5)) < 1.5 && Math.abs(v.y / TILE - (y + 0.5)) < 1.5; });
  const avg = vs.length ? vs.reduce(function (a, v) { return a + (v.speed || 0) / Math.max(1, v.maxSpeed || 1); }, 0) / vs.length : 1;
  const load = clamp(Math.round(vs.length / Math.max(1, rt.cap) * 100), 0, 100);
  return { n: vs.length, load: load, perHour: Math.round(vs.length * 60 * rt.speed * 3.2 + rt.cap * rt.lanes * load / 2), kmh: Math.round(rt.speed * 50 * avg) };
}
function agentEta(v) {
  if (!v.path || !v.path.length) return null;
  let tiles = Math.max(0, v.path.length - 1 - (v.seg || 0));
  return Math.round(tiles * TILE / Math.max(8, v.speed || v.maxSpeed || 20) * (TIME_SCALE ? 1 : 1));
}
/* UNIFIED INSPECTOR — one card for buildings, companies, utilities, roads, citizens and vehicles:
   tabs (Overview · Statistics · Economy · Connections) + quick actions; never covers the whole screen */
const INS_TABS = { building: [['overview', 'Overview'], ['stats', 'Statistics'], ['economy', 'Economy'], ['links', 'Connections']], road: [['overview', 'Overview'], ['edit', 'Edit']], citizen: [['overview', 'Overview'], ['needs', 'Needs']], vehicle: [['overview', 'Overview']] };
function renderInspector() {
  const el = MINS.el; if (!el || !MINS.kind) return;
  let head = '', body = '', acts = '';
  const tabs = INS_TABS[MINS.kind] || [];
  if (!tabs.some(function (t) { return t[0] === MINS.tab; })) MINS.tab = 'overview';
  const tab = MINS.tab;
  if (MINS.kind === 'building') {
    const b = MINS.ref; if (!b || !MAP.byId.has(b.id)) { closeInspector(); return; }
    const d = bdef(b), st = buildingStatus(b), net = (b._rev || 0) - (b._cost || 0), dist = districtOf(b.x, b.y);
    head = '<span class="miIcon">' + d.icon + '</span><div class="miTitle"><b>' + esc(d.name) + '</b><small>BUILDING SELECTED · LV ' + b.level + ' · ' + esc(ownerLabel(b.owner)) + '</small></div>';
    if (tab === 'overview') body = '<div class="miStatus" style="color:' + st[1] + ';border-color:' + st[1] + '66">' + st[0] + '</div>' +
      insRow('🏆 Level', b.level + ' / ' + MAX_LEVEL) +
      (d.workers ? insRow('👷 Employees', Math.round(b._actW || 0) + ' / ' + b.workers) : d.housing ? insRow('🏠 Residents', fmt(Math.round(b._cust || 0)) + ' / ' + fmt(Math.round(b._hcap || 0))) : '') +
      insRow('💵 Income', money((b._rev || 0) * 60) + '/min', 'pos') + insRow('🛠 Maintenance', money((b._cost || 0) * 60) + '/min', 'neg') +
      insRow('🧰 Condition', b.health !== undefined ? Math.round(b.health) + '%' + (b.damaged ? ' · damaged' : '') : (b.damaged ? 'Damaged' : b.built ? 'Good' : 'Building ' + Math.floor((b.progress || 0) * 100) + '%'), b.damaged || (b.health !== undefined && b.health < 30) ? 'neg' : '');
    else if (tab === 'stats') body = insRow('⚙️ Efficiency', pct((b._eff || 0) * 100)) + (d.housing ? insRow('🏠 Housing', fmt(d.housing) + ' · Q' + d.quality) : '') + (b._cust > 0 && !d.housing ? insRow(d.transit ? '🚌 Riders' : '🛍 Customers/h', fmt(Math.round(b._cust))) : '') +
      (d.edu ? insRow('🎓 Students', fmt(d.edu * lvlMult(b.level))) : '') + (d.beds ? insRow('🛏 Beds', fmt(d.beds)) : '') + (d.cover ? insRow('📡 Coverage', Math.round(coverRadius(b) * TILE_METERS) + ' m') : '') + (d.pol ? insRow('🏭 Pollution', (d.pol > 0 ? '+' : '') + d.pol, d.pol > 0 ? 'neg' : 'pos') : '') + insRow('📐 Size', d.w + '×' + d.h + ' · ↻' + ((b.rot | 0) * 90) + '°');
    else if (tab === 'economy') body = insRow('💵 Revenue', money((b._rev || 0) * 60) + '/min', 'pos') + insRow('🛠 Costs', money((b._cost || 0) * 60) + '/min', 'neg') + insRow('📊 Net', (net >= 0 ? '+' : '') + money(net * 60) + '/min', net >= 0 ? 'pos' : 'neg') +
      insRow('🏷 Value', money(typeof buildingValue === 'function' ? buildingValue(b) : buildCost(d))) + (dist ? insRow('🗺 Land value', '×' + landValue(b).toFixed(2)) : '') + (!isAI(b) && b.level < MAX_LEVEL ? insRow('⬆ Next level', money(upgradeCost(b))) : '');
    else body = insRow('⚡ Power', d.power > 0 ? '+' + fmt(Math.round(b._gen || d.power)) : d.power < 0 ? (b._powered === false ? '✕ No power' : '✓ ' + fmt(-d.power * lvlMult(b.level))) : '—', d.power < 0 && b._powered === false ? 'neg' : '') +
      insRow('💧 Water', d.water > 0 ? '+' + fmt(d.water * lvlMult(b.level)) : d.water < 0 ? '✓ ' + fmt(-d.water * lvlMult(b.level)) : '—') + insRow('🛣 Road access', d.noRoad || b._road ? '✓ Connected' : '✕ No road', d.noRoad || b._road ? 'pos' : 'neg') +
      insRow('🗺 District', esc(districtName(b.x, b.y)) + (typeof districtCharacterAt === 'function' && districtCharacterAt(b.x, b.y) ? ' · ' + esc(districtCharacterAt(b.x, b.y)) : '')) + insRow('📍 Location', b.x + ', ' + b.y);
    if (!isAI(b) && b.built && b.level < MAX_LEVEL && !b.upg && d.cost > 0) acts += '<button class="btn gold' + (funds(ownerPayer(b)) < upgradeCost(b) ? ' dis' : '') + '" data-mi="upgrade">⬆ UPGRADE</button>';
    if (b._tip > S.clock.runSec) acts += '<button class="btn gold" data-mi="tip">💰 COLLECT</button>';
    acts += '<button class="btn" data-mi="more">ℹ INFO</button>';
    if (!d.noDemolish) acts += '<button class="btn red" data-mi="demolish">🗑 DEMOLISH</button>';
  } else if (MINS.kind === 'citizen') {
    const c = MINS.ref, n = c.needs || {};
    if (typeof citizenProfile === 'function') citizenProfile(c);
    const home = citizenBuilding(c.home), work = citizenBuilding(c.work), dest = c.target ? citizenBuilding(c.target) : null;
    head = '<span class="miIcon">' + (c.tourist ? '🧳' : '🧑') + '</span><div class="miTitle"><b>' + (c.tourist ? 'Tourist #' : 'Citizen #') + c.id + '</b><small>CITIZEN · ' + esc(String(c.state || 'IDLE').replace(/_/g, ' ')) + (MOBX.track === c ? ' · 🎥 TRACKING' : '') + '</small></div>';
    if (tab === 'overview') body = insRow('🎂 Age', c.age || '—') + insRow('💼 Job', esc(typeof citizenJob === 'function' ? citizenJob(c).title : work ? bdef(work).name : 'Unemployed')) +
      insRow('🏠 Home', home ? esc(districtName(home.x, home.y)) : '—') + insRow('🏢 Workplace', work ? esc(districtName(work.x, work.y)) : c.tourist ? 'On vacation' : '—') +
      insRow('📍 Destination', dest ? esc(bdef(dest).name) : 'Wandering') + insRow('😊 Happiness', Math.round(c.happiness || 0) + '%') + insRow('💰 Money', money(c.money || 0));
    else body = '<div class="miNeeds">' + insBar('🍔 Food', n.food) + insBar('🏠 Housing', n.housing) + insBar('🎉 Fun', n.fun) + insBar('💼 Work', n.work) + insBar('🛍 Shopping', n.shopping) + insBar('😴 Energy', c.energy) + '</div>';
    acts = '<button class="btn blue" data-mi="track">🎥 TRACK</button><button class="btn" data-mi="more">👤 PROFILE</button>' + (work ? '<button class="btn" data-mi="gowork">💼 WORK</button>' : '') + (home ? '<button class="btn" data-mi="gohome">🏠 HOME</button>' : '');
  } else if (MINS.kind === 'vehicle') {
    const v = MINS.ref, emerg = ['ambulance', 'firetruck', 'police'].indexOf(v.type) >= 0, eta = agentEta(v);
    head = '<span class="miIcon">' + ({ car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', ambulance: '🚑', firetruck: '🚒', police: '🚓', garbage: '🚛', tanker: '⛽', tram: '🚋', shuttle: '🚐', maint: '🛠️' }[v.type] || '🚗') + '</span><div class="miTitle"><b>' + esc(String(v.type || 'vehicle').toUpperCase()) + '</b><small>VEHICLE' + (MOBX.track === v ? ' · 🎥 TRACKING' : '') + '</small></div>';
    body = insRow('🚦 Status', esc(emerg ? (v.dest ? 'Responding' : 'Returning') : (v.state || 'moving'))) + insRow('📍 Destination', v.dest && v.dest.type ? esc(bdef(v.dest).name) : v.type === 'bus' ? 'Next stop' : 'Roaming') +
      (eta !== null ? insRow('⏱ ETA', eta + ' sec') : '') + insRow('💨 Speed', Math.round(v.speed || 0) + ' / ' + Math.round(v.maxSpeed || 0)) + (v.line && typeof lineById === 'function' && lineById(v.line) ? insRow('🚌 Line', esc(lineById(v.line).name)) : '') +
      (v.routeInfo && typeof routeInfoText === 'function' ? '<p class="small miNote">🧭 ' + esc(routeInfoText(v.routeInfo)) + '</p>' : '');
    acts = '<button class="btn blue" data-mi="track">🎥 TRACK</button><button class="btn" data-mi="route">🧭 ROUTE</button><button class="btn" data-mi="more">ℹ STATUS</button>';
  } else if (MINS.kind === 'road') {
    const r = MINS.ref, i = idx(r.x, r.y), t = MAP.roads[i]; if (!t) { closeInspector(); return; }
    const rt = ROAD_TYPES[t], tr = roadTraffic(r.x, r.y, rt), seg = roadSegment(r.x, r.y);
    const inc = S.p9 && S.p9.traffic ? S.p9.traffic.incidents.find(function (x) { return x.tile === i; }) : null;
    const next = ROAD_TYPES[t + 1], nlock = next && next.unlock && S.city.peakPop < next.unlock.pop && !S.city.sandbox;
    const rname = MAP.rnames && MAP.rnames[i] ? MAP.rnames[i] : (typeof roadNameAt === 'function' ? roadNameAt(r.x, r.y) : '');
    head = '<span class="miIcon">' + (MAP.nature[i] === 2 ? '🌉' : MAP.terrain[i] === TERRAIN.ROCK ? '🚇' : rt.icon) + '</span><div class="miTitle"><b>' + esc(rname || rt.name) + '</b><small>ROAD · ' + esc(rt.name) + (MAP.inter[i] ? ' · junction' : '') + '</small></div>';
    if (tab === 'overview') body = insBar('🚗 Traffic', tr.load) + insRow('🚙 Vehicles/hour', fmt(tr.perHour)) + insRow('💨 Average speed', tr.kmh + ' km/h') + insRow('📏 Length', fmt(seg.length * TILE_METERS) + ' m') +
      insRow('📦 Capacity', fmt(rt.cap * rt.lanes * 50) + ' vehicles/h · ' + rt.lanes + ' lane' + (rt.lanes > 1 ? 's' : '')) + insRow('🛠 Condition', inc ? '⚠ ' + esc((INCIDENT_TYPES[inc.type] || {}).name || inc.type) : MAP.blocked[i] ? '🚧 Closed' : '✓ Good', inc || MAP.blocked[i] ? 'neg' : 'pos');
    else {
      const jt = MAP.inter[i] && typeof junctionType === 'function' ? junctionType(i) : null;
      body = '<div class="miSub">CHANGE TYPE (whole segment, ' + seg.length + ' tiles)</div><div class="mChips miTypes">' + ROAD_TYPES.slice(1).map(function (R) { const lock = R.unlock && S.city.peakPop < R.unlock.pop && !S.city.sandbox; return '<button class="mChip small' + (R.id === t ? ' on' : '') + (lock ? ' dis' : '') + '" data-mrt="' + R.id + '">' + esc(R.name) + '</button>'; }).join('') + '</div>' +
        '<div class="mActs miEdit"><button class="btn" data-mi="extend">➕ Extend</button><button class="btn" data-mi="split">✂ Split here</button>' +
        '<button class="btn' + (MAP.inter[i] ? '' : ' dis') + '" data-mi="signal">🚦 Traffic light' + (jt === 'signal' ? ' ✓' : '') + '</button><button class="btn' + (MAP.inter[i] ? '' : ' dis') + '" data-mi="roundabout">⭕ Roundabout' + (jt === 'roundabout' ? ' ✓' : '') + '</button>' +
        '<button class="btn red" data-mi="roadsegdel">🗑 Delete segment</button></div>' + (MAP.inter[i] ? '' : '<p class="small miNote">Traffic lights and roundabouts go on junctions (3–4 roads meeting).</p>');
    }
    if (next) acts += '<button class="btn gold' + (nlock || S.budget < roadTypeCost(t + 1) ? ' dis' : '') + '" data-mi="roadup">⬆ UPGRADE ' + (nlock ? '🔒' : money(roadTypeCost(t + 1))) + '</button>';
    acts += '<button class="btn' + (tab === 'edit' ? ' blue' : '') + '" data-mi="edit">✏ EDIT</button><button class="btn" data-mi="traffic">🚦 TRAFFIC</button><button class="btn red" data-mi="roaddel">🗑 DEMOLISH</button>';
  }
  el.innerHTML = '<div class="miHead">' + head + '<button class="mX" data-mi="close" aria-label="Close">✕</button></div>' +
    (tabs.length > 1 ? '<div class="mChips miTabs">' + tabs.map(function (t) { return '<button class="mChip small' + (t[0] === tab ? ' on' : '') + '" data-mitab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' : '') +
    '<div class="miBody mScroll" id="mInspectBody">' + body + '</div>' + (acts ? '<div class="miActs">' + acts + '</div>' : '');
}
/* SAFE DEMOLISH: always asks first (KEEP / DEMOLISH); right after, the UNDO toast can bring the building back */
function confirmDemolish(b) {
  const d = bdef(b), refund = isAI(b) ? 0 : Math.round(buildCost(d) * (b.built ? 0.5 : 0.9));
  sysDialog('🗑 DEMOLISH ' + (importantBuilding(b) ? 'IMPORTANT BUILDING' : 'BUILDING') + '?', '<p><b>' + esc(d.name) + '</b>' + (b.level > 1 ? ' (level ' + b.level + ')' : '') + ' will be removed.' + (refund ? ' You get back <b>' + money(refund) + '</b>.' : '') + '</p><p class="small">You can UNDO right after demolishing.</p>',
    [['KEEP', 'green', null], ['DEMOLISH', 'red', function () { demolish(b); closeInspector(); if (typeof haptic === 'function') haptic('success'); }]], 0);
}
function inspectorClick(e) {
  const tb = e.target.closest('[data-mitab]'); if (tb) { MINS.tab = tb.dataset.mitab; renderInspector(); sfx('click'); return; }
  const rtb = e.target.closest('[data-mrt]');
  if (rtb && MINS.kind === 'road') { roadChangeType(MINS.ref, +rtb.dataset.mrt); return; }
  const a = e.target.closest('[data-mi]'); if (!a) return;
  const k = a.dataset.mi; sfx('click'); UI.busyUntil = 0; if (typeof haptic === 'function') haptic('tap');
  if (k === 'close') { closeInspector(); return; }
  if (MINS.kind === 'building') {
    const b = MINS.ref; if (!b) return;
    if (k === 'upgrade') { upgradeBuilding(b); renderInspector(); }
    else if (k === 'tip') { collectTip(b); renderInspector(); }
    else if (k === 'more') { renderBottomInfo(); showModal(bdef(b).icon + ' ' + esc(bdef(b).name), '<div class="mMoreStats">' + $('biStats').innerHTML + '</div><div class="mMoreActs">' + $('biActions').innerHTML.replace(/<button class="btn small" data-act="deselect">✕<\/button>/, '') + '</div>'); }
    else if (k === 'demolish') confirmDemolish(b);
  } else if (MINS.kind === 'road') {
    const r = MINS.ref, i = idx(r.x, r.y);
    if (k === 'roadup') { const t = MAP.roads[i], keep = UI.roadType; UI.roadType = t + 1; const n = placeRoads([[r.x, r.y]]); UI.roadType = keep; if (n) toast('⬆ Road upgraded to ' + ROAD_TYPES[t + 1].name, 'good'); renderInspector(); }
    else if (k === 'edit') { MINS.tab = MINS.tab === 'edit' ? 'overview' : 'edit'; renderInspector(); }
    else if (k === 'traffic') { closeInspector(); openCityMap('heat:TRAFFIC'); }
    else if (k === 'extend') { closeInspector(); enterDrawMode('road'); UI.roadType = MAP.roads[i] || UI.roadType; UI.roadDrag = { x0: r.x, y0: r.y, x1: r.x, y1: r.y, touch: true }; MOB.road.step = 1; updateRoadSheet(); toast('➕ Drag from the highlighted road end, then CONFIRM', ''); }
    else if (k === 'split') { const ok = roadSplit(r); toast(ok ? '✂ Road split — the two parts can now get different types' : '✂ Split needs a straight road tile (not a junction)', ok ? 'good' : 'bad'); renderInspector(); }
    else if (k === 'signal' || k === 'roundabout') { if (!MAP.inter[i]) return; const ok = typeof setJunctionType === 'function' && setJunctionType(i, k); toast(ok ? (k === 'signal' ? '🚦 Traffic lights installed' : '⭕ Roundabout built') : '❌ Not available here', ok ? 'good' : 'bad'); renderInspector(); }
    else if (k === 'roaddel') sysDialog('🗑 DEMOLISH ROAD TILE?', '<p>The road tile is removed (40% refund). You can UNDO right after.</p>', [['KEEP', 'green', null], ['DEMOLISH', 'red', function () { bulldozeTile(r.x, r.y); closeInspector(); }]], 0);
    else if (k === 'roadsegdel') { const seg = roadSegment(r.x, r.y); sysDialog('🗑 DELETE ROAD SEGMENT?', '<p>' + seg.length + ' road tiles of this segment are removed.</p>', [['KEEP', 'green', null], ['DELETE', 'red', function () { seg.forEach(function (j) { bulldozeTile(j % MAP.W, Math.floor(j / MAP.W)); }); closeInspector(); }]], 0); }
  } else {
    const o = MINS.ref;
    if (k === 'more') { const ref = MINS.kind === 'vehicle' ? { v: o } : { c: o }; MOBP.showAgentInfo0(ref); }
    else if (k === 'track') { if (typeof startTracking === 'function') startTracking(o); renderInspector(); }
    else if (k === 'gowork' || k === 'gohome') { const bb = citizenBuilding(k === 'gowork' ? o.work : o.home); if (bb) { const c = buildingCenter(bb); camFlyTo(c.x, c.y, Math.max(CAM.zoom, 1.2)); } }
    else if (k === 'route') { if (o.dest && o.dest.type) { const c = buildingCenter(o.dest); camFlyTo(c.x, c.y, Math.max(CAM.zoom, 1)); toast('🧭 Destination: ' + bdef(o.dest).name + (agentEta(o) !== null ? ' · ETA ' + agentEta(o) + ' s' : ''), ''); } else toast('🧭 No fixed destination (roaming / line service)', ''); }
  }
}
/* ROAD EDIT: change the type of the whole segment, split it into two segments */
function roadChangeType(r, t) {
  const R = ROAD_TYPES[t]; if (!R) return;
  if (R.unlock && S.city.peakPop < R.unlock.pop && !S.city.sandbox) { toast('🔒 ' + R.name + ' unlocks at ' + fmt(R.unlock.pop) + ' population', 'bad'); return; }
  const seg = roadSegment(r.x, r.y), keep = UI.roadType; UI.roadType = t;
  const n = placeRoads(seg.map(function (j) { return [j % MAP.W, Math.floor(j / MAP.W)]; })); UI.roadType = keep;
  toast(n ? '🛣️ ' + n + ' tiles → ' + R.name : '❌ City budget too low', n ? 'good' : 'bad'); renderInspector();
}
function roadSplit(r) {
  const i = idx(r.x, r.y); if (MAP.inter[i]) return false;
  const t = MAP.roads[i], other = t === 1 ? 2 : t - 1, keep = UI.roadType; UI.roadType = other;     // one tile of a neighbouring type is the split point
  const n = placeRoads([[r.x, r.y]]); UI.roadType = keep; return !!n;
}
function showRoadInspector(x, y) { openInspector('road', { x: x, y: y }); }

/* ===================================== PAGES: CITY · ECONOMY ===================================== */
const MPAGE = { kind: '', el: null, timer: null, graph: 'money', range: 75 };
function pageEl() {
  if (MPAGE.el) return MPAGE.el;
  const el = document.createElement('div'); el.id = 'mPage'; el.className = 'hidden';
  el.innerHTML = '<div class="mPageHead"><b class="mPageTitle"></b><div class="mPageTools"></div><button class="mX big" data-mpx="1" aria-label="Close">✕</button></div><div class="mPageBody mScroll"></div>';
  document.body.appendChild(el); MPAGE.el = el;
  el.querySelector('[data-mpx]').onclick = function () { closeMobilePage(); sfx('click'); };
  el.addEventListener('click', pageClick);
  return el;
}
function openMobilePage(kind) {
  const el = pageEl();
  closeMobileOverlays(); closeNotificationCenter();
  MPAGE.kind = kind; el.dataset.kind = kind;
  el.classList.remove('hidden'); document.body.classList.add('mPageOpen');
  renderMobilePage(true);
  clearInterval(MPAGE.timer); MPAGE.timer = setInterval(function () { if (MPAGE.kind && !uiBusyM()) renderMobilePage(false); }, 1000);
  auditSoon();
}
function closeMobilePage() { if (!MPAGE.kind) return false; MPAGE.kind = ''; clearInterval(MPAGE.timer); if (MPAGE.el) MPAGE.el.classList.add('hidden'); document.body.classList.remove('mPageOpen'); return true; }
function statCard(icon, label, value, sub, bar, cls) {
  return '<div class="mStatCard ' + (cls || '') + '"><div class="msTop"><span class="msIcon">' + icon + '</span><span class="msLabel">' + label + '</span></div><b class="msValue">' + value + '</b>' +
    (sub ? '<span class="msSub">' + sub + '</span>' : '') + (bar !== undefined && bar !== null ? '<i class="msBar"><em style="width:' + clamp(bar, 0, 100) + '%"></em></i>' : '') + '</div>';
}
function histTrend(k, n) { const h = S.statistics.history[k]; if (!h || h.length < 2) return 0; const a = h[Math.max(0, h.length - 1 - (n || 10))], b = h[h.length - 1]; return a ? (b - a) / Math.abs(a) : 0; }
function trendTxt(v) { return v > 0.002 ? '<em class="pos">▲ ' + (v * 100).toFixed(1) + '%</em>' : v < -0.002 ? '<em class="neg">▼ ' + (-v * 100).toFixed(1) + '%</em>' : '<em>— stable</em>'; }
function avgLandValue() { const L = S.buildings.list; if (!L.length) return 1; let s = 0, n = 0; for (let i = 0; i < L.length; i += Math.max(1, Math.floor(L.length / 400))) { try { s += landValue(L[i]); n++; } catch (e) { /* no value */ } } return n ? s / n : 1; }
function renderMobilePage(first) {
  const el = MPAGE.el; if (!el || !MPAGE.kind || !STARTED) return;
  const body = el.querySelector('.mPageBody'), st = body.scrollTop;
  let title = '', h = '', tools = '';
  if (MPAGE.kind === 'city') {
    const c = S.city, hf = (SIM.hapFactors || []).slice().sort(function (a, b) { return a[1] - b[1]; }), inc = SIM.income || 0, ex = SIM.expenses || 0;
    const pg = SIM.powerGen || 0, pu = SIM.powerUse || 0, wg = SIM.waterGen || 0, wu = SIM.waterUse || 0, safety = clamp(100 - (c.crime || 0), 0, 100);
    title = '🏙️ CITY OVERVIEW · ' + esc(c.name) + ' · LV ' + cityLevel();
    tools = '<button class="btn small" data-mpg="hall">🏛 City Hall</button>';
    h = '<div class="mStatGrid">' +
      statCard('👥', 'Population', fmt(Math.floor(c.population)), 'peak ' + fmt(Math.floor(c.peakPop)) + ' · ' + trendTxt(histTrend('pop')) + ' · homes ' + fmt(Math.round(SIM.housingCap || 0))) +
      statCard('💰', 'Money', money(S.money), 'city budget ' + money(S.budget), null, S.money < 0 ? 'warn' : '') +
      statCard('📈', 'Income', money(inc * 60) + '/min', 'taxes, rent and sales') +
      statCard('📉', 'Expenses', money(ex * 60) + '/min', 'maintenance, wages, services', null, ex > inc ? 'warn' : '') +
      statCard(c.happiness >= 70 ? '😊' : c.happiness >= 45 ? '😐' : '😠', 'Happiness', pct(c.happiness), hf.length ? 'worst: ' + esc(hf[0][0]) + ' ' + (hf[0][1] > 0 ? '+' : '') + hf[0][1].toFixed(0) : '', c.happiness, c.happiness < 45 ? 'warn' : '') +
      statCard('💼', 'Employment', pct((1 - (SIM.unemployment || 0)) * 100), fmt(Math.round(SIM.employed || 0)) + ' of ' + fmt(Math.round(SIM.labor || 0)) + ' workers · ' + fmt(Math.round(SIM.jobs || 0)) + ' jobs', 100 - (SIM.unemployment || 0) * 100, (SIM.unemployment || 0) > 0.12 ? 'warn' : '') +
      statCard('🚦', 'Traffic', pct(SIM.traffic || 0), (SIM.traffic || 0) > 70 ? 'congestion — add roads or transit' : 'flowing · ' + fmt(AG.vehicles.length) + ' vehicles', SIM.traffic || 0, (SIM.traffic || 0) > 70 ? 'warn' : '') +
      statCard('🏭', 'Pollution', Math.round(c.pollution || 0), 'lower is better', clamp(c.pollution || 0, 0, 100), (c.pollution || 0) > 50 ? 'warn' : '') +
      statCard('⚡', 'Power', fmt(Math.round(pu)) + ' / ' + fmt(Math.round(pg)), pu > pg ? '✕ shortage — build power plants' : '✓ ' + pct(pg ? pu / pg * 100 : 0) + ' used', pg ? clamp(pu / pg * 100, 0, 100) : 100, pu > pg ? 'warn' : '') +
      statCard('💧', 'Water', fmt(Math.round(wu)) + ' / ' + fmt(Math.round(wg)), wu > wg ? '✕ shortage — build water towers' : '✓ ' + pct(wg ? wu / wg * 100 : 0) + ' used', wg ? clamp(wu / wg * 100, 0, 100) : 100, wu > wg ? 'warn' : '') +
      statCard('🎓', 'Education', Math.round(c.education || 0) + ' / 100', 'schools, universities and research', c.education) +
      statCard('🏥', 'Health', pct((SIM.cov.health || 0) * 100), 'healthcare coverage of homes', (SIM.cov.health || 0) * 100, (SIM.cov.health || 0) < 0.5 ? 'warn' : '') +
      statCard('🚓', 'Safety', pct(safety), 'police ' + pct((SIM.cov.police || 0) * 100) + ' · fire ' + pct((SIM.cov.fire || 0) * 100) + ' · crime ' + Math.round(c.crime || 0), safety, safety < 60 ? 'warn' : '') +
      statCard('🏷️', 'Land Value', '×' + avgLandValue().toFixed(2), 'average of all buildings') +
      '</div><div class="mActs"><button class="btn blue" data-mpg="stats">📊 All statistics</button><button class="btn" data-mpg="services">🚒 Services</button><button class="btn" data-mpg="housing">🏘 Housing & education</button><button class="btn" data-mpg="research">🔬 Research</button><button class="btn" data-mpg="companies">🏢 Companies</button><button class="btn" data-mpg="world">🌍 World</button><button class="btn" data-mpg="quests">🎯 Quests</button><button class="btn" data-mpg="report">📰 Daily report</button><button class="btn" data-mpg="history">📈 City history</button><button class="btn" data-mpg="tour">🎥 City tour</button></div>';
  } else if (MPAGE.kind === 'economy') {
    const inc = SIM.income || 0, ex = SIM.expenses || 0, infl = S.p6 && S.p6.econ ? S.p6.econ.infl || 0 : 0, rate = typeof interestRate === 'function' ? interestRate() : 0;
    const debt = (S.bank && S.bank.loans ? S.bank.loans.reduce(function (a, l) { return a + l.remaining; }, 0) : 0);
    const stocks = typeof stockOf === 'function' ? AI_DEFS.map(function (a) { try { return stockOf(a.id).price; } catch (e) { return 0; } }).filter(Boolean) : [];
    const stockIdx = stocks.length ? stocks.reduce(function (a, v) { return a + v; }, 0) / stocks.length : 0;
    const ET = MPAGE.etab || 'overview';
    title = '💰 ECONOMY';
    tools = '<button class="btn small" data-mpg="taxes">🏛 Taxes & budget</button>';
    const tabsH = '<div class="mChips mEcoTabs">' + [['overview', '💰 Treasury'], ['market', '📈 Market'], ['trade', '🚢 Trade & production']].map(function (t) { return '<button class="mChip' + (ET === t[0] ? ' on' : '') + '" data-metab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    let cards = '';
    if (ET === 'overview') cards = statCard('💰', 'Treasury', money(S.money), 'your companies · ' + trendTxt(histTrend('money')), null, S.money < 0 ? 'warn' : '') +
      statCard('🏛', 'City Budget', money(S.budget), signMoney((SIM.bNet || 0) * 60) + '/min', null, (SIM.bNet || 0) < 0 ? 'warn' : '') +
      statCard('📈', 'Income', money(inc * 60) + '/min', 'taxes, rent and sales') + statCard('📉', 'Expenses', money(ex * 60) + '/min', 'maintenance, wages, services', null, ex > inc ? 'warn' : '') +
      statCard('🧾', 'Debt', money(debt), (S.bank && S.bank.loans ? S.bank.loans.length : 0) + ' active loan(s)', null, debt > Math.max(1, S.money) * 2 ? 'warn' : '') + statCard('🌍', 'GDP', money(hudGdp()), 'per year');
    else if (ET === 'market') cards = statCard('💹', 'Inflation', (infl * 100).toFixed(1) + '%', 'CPI ' + (S.p6 && S.p6.econ ? S.p6.econ.cpi.toFixed(1) : '—'), null, Math.abs(infl) > 0.05 ? 'warn' : '') +
      statCard('🏦', 'Interest Rate', (rate * 100).toFixed(2) + '%', 'central bank rate') + statCard('🧮', 'Tax', (S.city.tax || 0) + '%', 'income tax rate') +
      statCard('📊', 'Stock Market', stockIdx ? '$' + stockIdx.toFixed(2) : '—', 'average share price of ' + stocks.length + ' companies') +
      statCard('🏢', 'Companies', fmt(foundedCompanies()) + ' yours', fmt(AI_DEFS.length) + ' rival companies') + statCard('🌍', 'GDP', money(hudGdp()), 'per year');
    else cards = statCard('🚢', 'Trade', money((SIM.exportValue || 0) * 60) + '/min', 'exports · imports ' + money((SIM.importValue || 0) * 60) + '/min') +
      statCard('🏭', 'Production', fmt(Math.round((SIM.goodsProd || 0) * 60)) + '/min', 'goods produced') + statCard('🛒', 'Consumption', fmt(Math.round((SIM.goodsUse || 0) * 60)) + '/min', 'goods used by the city',
        null, (SIM.goodsUse || 0) > (SIM.goodsProd || 0) * 1.3 ? 'warn' : '');
    h = tabsH + '<div class="mStatGrid">' + cards + '</div>' + graphBlockHtml() +
      '<div class="mActs"><button class="btn blue" data-mpg="taxes">🏛 Taxes & budget</button><button class="btn" data-mpg="companies">🏢 Companies & stocks</button><button class="btn" data-mpg="bank">🏦 Bank</button><button class="btn" data-mpg="trade">🚢 Trade</button></div>';
  }
  el.querySelector('.mPageTitle').innerHTML = title;
  el.querySelector('.mPageTools').innerHTML = tools;
  if (first || !body.querySelector('.mGraphWrap')) { body.innerHTML = h; body.scrollTop = first ? 0 : st; }
  else { const g = body.querySelector('.mStatGrid'), tmp = document.createElement('div'); tmp.innerHTML = h; const ng = tmp.querySelector('.mStatGrid'); if (g && ng) g.innerHTML = ng.innerHTML; }
  const cv = body.querySelector('#mGraph'); if (cv) drawGraph(cv);
}
function pageClick(e) {
  const et = e.target.closest('[data-metab]'); if (et) { MPAGE.etab = et.dataset.metab; MPAGE.el.querySelector('.mPageBody').innerHTML = ''; renderMobilePage(true); sfx('click'); return; }
  const a = e.target.closest('[data-mpg]'), g = e.target.closest('[data-mgr]'), rg = e.target.closest('[data-mrange]');
  if (g) { MPAGE.graph = g.dataset.mgr; const cv = $('mGraph'); if (cv) { cv._g = null; } MPAGE.el.querySelector('.mPageBody').innerHTML = ''; renderMobilePage(true); sfx('click'); return; }
  if (rg) { MPAGE.range = +rg.dataset.mrange; const cv = $('mGraph'); if (cv) cv._g = null; MPAGE.el.querySelectorAll('[data-mrange]').forEach(function (b) { b.classList.toggle('on', b === rg); }); if (cv) drawGraph(cv); sfx('click'); return; }
  if (!a) return;
  const k = a.dataset.mpg; sfx('click');
  const deskp = { stats: ['city', 'overview'], services: ['city', 'services'], housing: ['city', 'housing'], research: ['research'], companies: ['companies'], world: ['world'], taxes: ['city', 'economy'], bank: ['companies', 'bank'], trade: ['world', 'trade'] }[k];
  if (k === 'hall') { openCityHall(); return; }
  if (k === 'quests') { if (typeof openQuestPage === 'function') openQuestPage(); else { closeMobilePage(); openQuestsPanel(); } return; }
  if (k === 'report') { closeMobilePage(); if (typeof openDailyReport === 'function') openDailyReport(); return; }
  if (k === 'history') { closeMobilePage(); if (typeof openCityHistory === 'function') openCityHistory(); return; }
  if (k === 'tour') { closeMobilePage(); if (typeof startCityTour === 'function') startCityTour(); return; }
  if (deskp) { closeMobilePage(); openPanel(deskp[0], deskp[1]); }
}

/* ===================================== GRAPHS: fit the screen, drag tooltip, pinch zoom, swipe scroll ===================================== */
const MGRAPHS = [['money', '💰 Money', function () { return [{ d: S.statistics.history.money, c: '#ffd166', n: 'Money' }]; }, money],
  ['flow', '📈 Income / Expenses', function () { return [{ d: S.statistics.history.inc.map(function (v) { return v * 60; }), c: '#06d6a0', n: 'Income' }, { d: S.statistics.history.exp.map(function (v) { return v * 60; }), c: '#ef476f', n: 'Expenses' }]; }, function (v) { return money(v) + '/min'; }],
  ['gdp', '🌍 GDP', function () { return [{ d: (S.p10 && S.p10.graphs && S.p10.graphs.gdp) || [], c: '#4cc9f0', n: 'GDP' }]; }, money],
  ['pop', '👥 Population', function () { return [{ d: S.statistics.history.pop, c: '#9b5de5', n: 'Population' }]; }, function (v) { return fmt(Math.round(v)); }],
  ['cpi', '💹 Prices (CPI)', function () { return [{ d: S.statistics.history.cpi || [], c: '#f8961e', n: 'CPI' }]; }, function (v) { return (+v).toFixed(1); }]];
function graphBlockHtml() {
  return '<div class="mGraphBlock"><div class="mChips">' + MGRAPHS.map(function (g) { return '<button class="mChip' + (MPAGE.graph === g[0] ? ' on' : '') + '" data-mgr="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div>' +
    '<div class="mGraphWrap"><canvas id="mGraph"></canvas></div><div class="mGraphFoot"><span class="small">Drag: values · pinch: zoom · swipe: scroll</span><div class="mRange">' +
    [30, 75, 150].map(function (n) { return '<button class="mChip small' + (MPAGE.range === n ? ' on' : '') + '" data-mrange="' + n + '">' + n + '</button>'; }).join('') + '</div></div></div>';
}
function graphDef() { return MGRAPHS.find(function (g) { return g[0] === MPAGE.graph; }) || MGRAPHS[0]; }
function drawGraph(cv) {
  const wrap = cv.parentNode, dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(120, wrap.clientWidth), H = Math.max(110, Math.min(220, wrap.clientHeight || 150));
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  if (!cv._bound) bindGraph(cv);
  const def = graphDef(), series = def[2](), n = series.reduce(function (a, s) { return Math.max(a, s.d.length); }, 0);
  const g = cv._g || (cv._g = { win: Math.min(MPAGE.range, Math.max(2, n)), off: 0, tip: -1 });
  g.win = clamp(g.win, 2, Math.max(2, n)); g.off = clamp(g.off, 0, Math.max(0, n - g.win));
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  if (n < 2) { c.fillStyle = '#a3a9d6'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText('Collecting data…', W / 2, H / 2); return; }
  const i1 = n - g.off, i0 = Math.max(0, i1 - g.win);
  let lo = Infinity, hi = -Infinity; series.forEach(function (s) { for (let i = i0; i < Math.min(i1, s.d.length); i++) { lo = Math.min(lo, s.d[i]); hi = Math.max(hi, s.d[i]); } });
  if (!isFinite(lo)) { lo = 0; hi = 1; } if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const L = 8, R = 8, T = 18, B = 16, x = function (i) { return L + (i - i0) / Math.max(1, i1 - i0 - 1) * (W - L - R); }, y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
  c.strokeStyle = 'rgba(140,150,255,.15)'; c.lineWidth = 1; for (let k = 0; k <= 3; k++) { const yy = T + k * (H - T - B) / 3; c.beginPath(); c.moveTo(L, yy); c.lineTo(W - R, yy); c.stroke(); }
  series.forEach(function (s) { c.strokeStyle = s.c; c.lineWidth = 2; c.beginPath(); for (let i = i0; i < Math.min(i1, s.d.length); i++) { if (i === i0) c.moveTo(x(i), y(s.d[i])); else c.lineTo(x(i), y(s.d[i])); } c.stroke(); });
  c.font = '11px sans-serif'; c.fillStyle = '#a3a9d6'; c.textAlign = 'left'; c.fillText(def[3](hi), L, 12); c.fillText(def[3](lo), L, H - 4);
  c.textAlign = 'right'; c.fillText((i1 - i0) + ' samples' + (g.off ? ' · −' + g.off : ''), W - R, 12);
  if (g.tip >= i0 && g.tip < i1) {                                      // tooltip — always fully inside the canvas
    const tx = x(g.tip); c.strokeStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(tx, T); c.lineTo(tx, H - B); c.stroke();
    const lines = series.map(function (s) { const v = s.d[g.tip], p = s.d[g.tip - 1]; return s.n + ': ' + (v !== undefined ? def[3](v) + (p ? ' (' + ((v - p) / Math.abs(p) * 100 >= 0 ? '+' : '') + ((v - p) / Math.abs(p) * 100).toFixed(1) + '%)' : '') : '—'); });
    c.font = 'bold 12px sans-serif'; const bw = Math.max.apply(null, lines.map(function (t) { return c.measureText(t).width; })) + 14, bh = lines.length * 16 + 8;
    const bx = clamp(tx + 10 + bw > W ? tx - 10 - bw : tx + 10, 2, W - bw - 2), by = clamp(T + 4, 2, H - bh - 2);
    c.fillStyle = 'rgba(12,14,34,.94)'; c.fillRect(bx, by, bw, bh); c.strokeStyle = 'rgba(140,150,255,.4)'; c.strokeRect(bx, by, bw, bh);
    lines.forEach(function (t, k) { c.fillStyle = series[k].c; c.textAlign = 'left'; c.fillText(t, bx + 7, by + 16 + k * 16); });
    series.forEach(function (s) { if (s.d[g.tip] !== undefined) { c.fillStyle = s.c; c.beginPath(); c.arc(tx, y(s.d[g.tip]), 3.5, 0, 6.283); c.fill(); } });
  }
}
function bindGraph(cv) {
  cv._bound = true;
  const P = new Map(); let st = null;
  const idxAt = function (cx) { const g = cv._g; if (!g) return -1; const series = graphDef()[2](), n = series.reduce(function (a, s) { return Math.max(a, s.d.length); }, 0), i1 = n - g.off, i0 = Math.max(0, i1 - g.win), r = cv.getBoundingClientRect(); return clamp(Math.round(i0 + (cx - r.left - 8) / Math.max(1, r.width - 16) * (i1 - i0 - 1)), i0, i1 - 1); };
  cv.addEventListener('pointerdown', function (e) { e.stopPropagation(); P.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } const g = cv._g; if (!g) return; if (P.size === 2) { const p = Array.from(P.values()); st = { pinch: Math.abs(p[0].x - p[1].x) || 1, win: g.win }; } else st = { x: e.clientX, off: g.off, mode: 'tip' }; g.tip = idxAt(e.clientX); drawGraph(cv); });
  cv.addEventListener('pointermove', function (e) {
    if (!P.has(e.pointerId)) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); const g = cv._g; if (!g || !st) return;
    if (P.size >= 2 && st.pinch) { const p = Array.from(P.values()), d = Math.abs(p[0].x - p[1].x) || 1; g.win = Math.round(st.win * st.pinch / d); g.tip = -1; }
    else if (g.win < 1e9) { const dx = e.clientX - st.x; if (st.mode !== 'scroll' && Math.abs(dx) > 24 && e.pointerType !== 'mouse' && g.win < graphDef()[2]()[0].d.length) st.mode = 'scroll'; if (st.mode === 'scroll') { const r = cv.getBoundingClientRect(); g.off = Math.round(st.off + dx / Math.max(1, r.width) * g.win); g.tip = -1; } else g.tip = idxAt(e.clientX); }
    drawGraph(cv);
  });
  const up = function (e) { P.delete(e.pointerId); if (!P.size) st = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

/* ===================================== CITY MAP (full screen) ===================================== */
const MMAP = { open: false, el: null, layers: { roads: true, districts: true, buildings: true, transit: false, water: false, power: false }, heat: '', base: null, ver: -1, raf: 0 };
const MMAP_HEATS = ['TRAFFIC', 'ELECTRICITY', 'WATER', 'POLLUTION', 'LAND VALUE', 'HAPPINESS', 'SAFETY', 'HEALTH', 'EDUCATION', 'WEALTH', 'DEMAND'];
const MMAP_LAYERS = [['roads', '🛣️', 'Roads'], ['districts', '🏘️', 'Districts'], ['buildings', '🏢', 'Buildings'], ['transit', '🚇', 'Transit'], ['water', '💧', 'Water'], ['power', '⚡', 'Electricity']];
function openCityMap(focus) {
  if (!MMAP.el) {
    const el = document.createElement('div'); el.id = 'mMap'; el.className = 'hidden';
    el.innerHTML = '<div class="mMapHead"><b>🗺️ CITY MAP</b><div class="mChips" id="mMapLayers"></div><button class="mX big" id="mMapX" aria-label="Close map">✕</button></div><div class="mChips mMapHeats" id="mMapHeats"></div><div class="mMapBody"><canvas id="mMapCv"></canvas><div class="mMapLegend small" id="mMapLegend"></div></div>';
    document.body.appendChild(el); MMAP.el = el;
    el.querySelector('#mMapX').onclick = function () { closeCityMap(); sfx('click'); };
    el.querySelector('#mMapLayers').addEventListener('click', function (e) { const b = e.target.closest('[data-mml]'); if (!b) return; MMAP.layers[b.dataset.mml] = !MMAP.layers[b.dataset.mml]; renderMapLayers(); drawCityMap(); sfx('click'); });
    el.querySelector('#mMapHeats').addEventListener('click', function (e) { const b = e.target.closest('[data-mmh]'); if (!b) return; MMAP.heat = MMAP.heat === b.dataset.mmh ? '' : b.dataset.mmh; renderMapLayers(); drawCityMap(); sfx('click'); });
    const cv = el.querySelector('#mMapCv'); let down = null;
    cv.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    cv.addEventListener('pointerup', function (e) {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; } down = null;
      const m = cv._m; if (!m) return; const r = cv.getBoundingClientRect();
      const tx = (e.clientX - r.left - m.ox) / m.k, ty = (e.clientY - r.top - m.oy) / m.k;
      if (tx < 0 || ty < 0 || tx > MAP.W || ty > MAP.H) return;
      CAM.x = tx * TILE; CAM.y = ty * TILE; clampCamera(); closeCityMap(); sfx('click'); toast('🎯 Camera moved', '');
    });
  }
  closeMobileOverlays(); closeMobilePage(); closeNotificationCenter();
  if (focus && String(focus).indexOf('heat:') === 0) MMAP.heat = String(focus).slice(5);
  else if (focus === 'power') { MMAP.layers.power = true; MMAP.layers.water = false; } else if (focus === 'water') { MMAP.layers.water = true; MMAP.layers.power = false; } else if (focus === 'transit') MMAP.layers.transit = true;
  MMAP.open = true; MMAP.ver = -1; MMAP.el.classList.remove('hidden'); document.body.classList.add('mMapOpen');
  renderMapLayers();
  requestAnimationFrame(drawCityMap);
  clearInterval(MMAP.raf); MMAP.raf = setInterval(function () { if (MMAP.open) drawCityMap(); }, 1000);
  refreshMobileBar();
}
function closeCityMap() { if (!MMAP.open) return false; MMAP.open = false; clearInterval(MMAP.raf); MMAP.el.classList.add('hidden'); document.body.classList.remove('mMapOpen'); return true; }
function renderMapLayers() {
  $('mMapLayers').innerHTML = MMAP_LAYERS.map(function (l) { return '<button class="mChip' + (MMAP.layers[l[0]] ? ' on' : '') + '" data-mml="' + l[0] + '"><span>' + l[1] + '</span>' + l[2] + '</button>'; }).join('');
  $('mMapHeats').innerHTML = '<span class="mHeatLbl">HEATMAP</span>' + MMAP_HEATS.map(function (id) { const H = heatDef(id); return H ? '<button class="mChip small' + (MMAP.heat === id ? ' on' : '') + '" data-mmh="' + id + '"><span>' + H.icon + '</span>' + esc(H.name) + '</button>' : ''; }).join('');
}
const CAT_COLORS = { Residential: '#80ed99', Commercial: '#4cc9f0', Industry: '#ef476f', Resources: '#b08968', Logistics: '#f8961e', Utilities: '#ffd166', Waste: '#8d99ae', Services: '#f15bb5', Transport: '#9b5de5', Leisure: '#52b788', Science: '#90e0ef', Landmarks: '#ffd60a' };
function drawCityMap() {
  if (!MMAP.open || !STARTED) return;
  const cv = $('mMapCv'), wrap = cv.parentNode, dpr = Math.min(2, window.devicePixelRatio || 1), W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  const k = Math.min(W / MAP.W, H / MAP.H) * 0.96, ox = (W - MAP.W * k) / 2, oy = (H - MAP.H * k) / 2, L = MMAP.layers;
  cv._m = { k: k, ox: ox, oy: oy };
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  c.save(); c.translate(ox, oy);
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    const i = idx(x, y);
    c.fillStyle = MAP.nature[i] === 2 ? '#2f6fa8' : MAP.terrain[i] === TERRAIN.ROCK ? '#5e5a55' : MAP.nature[i] === 1 ? '#264d3a' : '#33533d';
    c.fillRect(x * k, y * k, k + 0.6, k + 0.6);
    if (!inUnlocked(x, y)) { c.fillStyle = 'rgba(8,10,25,.55)'; c.fillRect(x * k, y * k, k + 0.6, k + 0.6); }
  }
  if (L.districts && MAP.districts && MAP.districts.length) {
    const cols = ['rgba(255,255,255,0)', 'rgba(128,237,153,.16)', 'rgba(76,201,240,.2)', 'rgba(255,209,102,.24)', 'rgba(241,91,181,.26)'];
    MAP.districts.forEach(function (d, j) { if (!d || !d.built) return; const dx = (j % MAP.dN) * 8, dy = Math.floor(j / MAP.dN) * 8; c.fillStyle = cols[clamp(d.level | 0, 0, 4)]; c.fillRect(dx * k, dy * k, 8 * k, 8 * k); c.strokeStyle = 'rgba(255,255,255,.08)'; c.strokeRect(dx * k, dy * k, 8 * k, 8 * k); });
  }
  if (L.roads) for (let i = 0; i < MAP.roads.length; i++) { const t = MAP.roads[i]; if (!t) continue; c.fillStyle = MAP.blocked[i] ? '#ef476f' : t >= 4 ? '#ffe8a3' : t === 3 ? '#e9ecef' : t === 2 ? '#c4c9d4' : '#9aa1ad'; c.fillRect((i % MAP.W) * k, Math.floor(i / MAP.W) * k, k + 0.4, k + 0.4); }
  if (L.buildings || L.power || L.water) S.buildings.list.forEach(function (b) {
    const d = bdef(b); let col = L.buildings ? (CAT_COLORS[BUILDINGS[b.type].cat] || '#e5e5e5') : 'rgba(200,200,220,.35)';
    if (L.power) col = d.power > 0 ? '#ffd166' : d.power < 0 ? (b._powered === false ? '#ef476f' : 'rgba(255,209,102,.45)') : col;
    if (L.water) col = d.water > 0 ? '#4cc9f0' : d.water < 0 ? (SIM.waterUse > SIM.waterGen ? '#ef476f' : 'rgba(76,201,240,.45)') : col;
    c.fillStyle = col; c.fillRect(b.x * k + 0.5, b.y * k + 0.5, Math.max(1, d.w * k - 1), Math.max(1, d.h * k - 1));
  });
  if (L.power || L.water) S.buildings.list.forEach(function (b) { const d = bdef(b); if ((L.power && d.power > 0) || (L.water && d.water > 0)) { const cc = buildingCenter(b); c.strokeStyle = L.power && d.power > 0 ? '#ffd166' : '#4cc9f0'; c.lineWidth = 1.5; c.beginPath(); c.arc(cc.x / TILE * k, cc.y / TILE * k, Math.max(3, k * 1.6), 0, 6.283); c.stroke(); } });
  if (L.transit) {
    const lines = S.p9 && S.p9.transit ? S.p9.transit.lines : [];
    lines.forEach(function (Ln, j) {
      const pts = (Ln.stops || []).map(function (id) { return MAP.byId.get(id); }).filter(Boolean).map(function (b) { const cc = buildingCenter(b); return [cc.x / TILE * k, cc.y / TILE * k]; });
      if (pts.length < 2) return; c.strokeStyle = Ln.color || ['#f15bb5', '#4cc9f0', '#ffd166', '#06d6a0', '#9b5de5'][j % 5]; c.lineWidth = 3; c.beginPath(); pts.forEach(function (p, q) { if (q) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      pts.forEach(function (p) { c.fillStyle = '#fff'; c.beginPath(); c.arc(p[0], p[1], 2.6, 0, 6.283); c.fill(); });
    });
    S.buildings.list.forEach(function (b) { if (BUILDINGS[b.type].cat !== 'Transport') return; const cc = buildingCenter(b); c.fillStyle = '#9b5de5'; c.beginPath(); c.arc(cc.x / TILE * k, cc.y / TILE * k, Math.max(2.5, k * 0.8), 0, 6.283); c.fill(); });
  }
  if (L.districts && typeof districtCenters === 'function' && MAP.dnames) { c.font = 'bold ' + Math.max(10, Math.round(k * 2.2)) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; districtCenters().forEach(function (d) { if (d.name.indexOf('Outskirts') >= 0) return; c.fillStyle = 'rgba(8,10,25,.6)'; const tw = c.measureText(d.name).width + 8; c.fillRect(d.x * k - tw / 2, d.y * k - 8, tw, 16); c.fillStyle = '#ffd166'; c.fillText(d.name, d.x * k, d.y * k); }); }
  if (MMAP.heat && typeof computeHeat6 === 'function') {                            // heatmap overlay (same data as the in-game heatmaps)
    const H = heatDef(MMAP.heat);
    if (H) { if (HEAT6.mode !== MMAP.heat || FX.time - HEAT6.at > 1.5) computeHeat6(MMAP.heat); const g = HEAT6.grid; if (g) for (let i = 0; i < g.length; i++) { const v = g[i]; if (v <= 0.02 && H.ramp !== 'good') continue; c.fillStyle = rampColor(H.ramp, v, 0.6); c.fillRect((i % MAP.W) * k, Math.floor(i / MAP.W) * k, k + 0.5, k + 0.5); } }
  }
  S.buildings.list.forEach(function (b) {                                            // important buildings · emergencies
    const d = BUILDINGS[b.type];
    if (d.landmark || b.type === 'townhall') { c.strokeStyle = '#ffd60a'; c.lineWidth = 2; c.strokeRect(b.x * k, b.y * k, bdef(b).w * k, bdef(b).h * k); }
    if (b.fire > 0) { const cc = buildingCenter(b); c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(cc.x / TILE * k, cc.y / TILE * k, Math.max(4, k * 1.2), 0, 6.283); c.fill(); }
  });
  AG.accidents.forEach(function (a) { c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(a.x / TILE * k, a.y / TILE * k, Math.max(3.5, k), 0, 6.283); c.fill(); });
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);                       // the camera view
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(tl.x / TILE * k, tl.y / TILE * k, (br.x - tl.x) / TILE * k, (br.y - tl.y) / TILE * k);
  c.restore();
  const HH = MMAP.heat ? heatDef(MMAP.heat) : null;
  $('mMapLegend').innerHTML = (HH ? '<b>' + HH.icon + ' ' + esc(HH.name) + '</b> ' + (MMAP.heat === 'TRAFFIC' ? ['Low', 'Medium', 'High', 'Critical'].map(function (t, j) { return '<i class="mLeg" style="background:' + rampColor(HH.ramp, j / 3, 0.95) + '"></i>' + t; }).join(' ') : '<i class="mLeg" style="background:' + rampColor(HH.ramp, 0, 0.95) + '"></i>' + esc(HH.low) + ' → <i class="mLeg" style="background:' + rampColor(HH.ramp, 1, 0.95) + '"></i>' + esc(HH.high)) + ' · ' : '') + 'Tap the map to move the camera there · 🔴 emergencies · ' + (L.power ? '⚡ <b style="color:#ffd166">■</b> plants · <b style="color:#ef476f">■</b> no power · ' + fmt(Math.round(SIM.powerUse || 0)) + '/' + fmt(Math.round(SIM.powerGen || 0)) + ' · ' : '') + (L.water ? '💧 <b style="color:#4cc9f0">■</b> water · ' + fmt(Math.round(SIM.waterUse || 0)) + '/' + fmt(Math.round(SIM.waterGen || 0)) + ' · ' : '') + (L.transit ? '🚇 ' + (S.p9 && S.p9.transit ? S.p9.transit.lines.length : 0) + ' lines · ' : '') + MAP.W + '×' + MAP.H;
}

/* ===================================== TOASTS & NOTIFICATION CENTER ===================================== */
const MNOTE = { list: [], unread: 0, recent: [], last: '', lastAt: 0, held: 0, el: null, open: false };
const NOTE_SKIP = /^(↻ Rotation|Tap the map|Click the map|⏱️ Simulation|🎯 Camera moved)/;
function logNote(msg, cls) {
  MNOTE.list.unshift({ t: Date.now(), msg: String(msg), cls: cls || '', day: S && S.clock ? gameDay() : 0 });
  if (MNOTE.list.length > 120) MNOTE.list.length = 120;
  if (!MNOTE.open) MNOTE.unread++;
  refreshBell();
  if (MNOTE.open) renderNotificationCenter();
}
function mobileToast(msg, cls) {
  msg = String(msg);
  if (/^(Tap|Click) the map to place/.test(msg)) return;                 // the build bar explains placement
  const now = Date.now();
  if (msg === MNOTE.last && now - MNOTE.lastAt < 4000) return;            // duplicates
  MNOTE.last = msg; MNOTE.lastAt = now;
  if (!NOTE_SKIP.test(msg) && STARTED) logNote(msg, cls);
  MNOTE.recent = MNOTE.recent.filter(function (t) { return now - t < 3500; });
  if (MNOTE.recent.length >= 2 && cls !== 'bad') { MNOTE.held++; heldPill(); return; }   // bursts go to the notification center
  MNOTE.recent.push(now);
  MOBP.toast0(msg, cls);
}
function heldPill() {
  let p = document.getElementById('mHeld');
  if (!p) { p = document.createElement('button'); p.id = 'mHeld'; p.onclick = function () { openNotificationCenter(); }; document.body.appendChild(p); }
  p.textContent = '🔔 +' + MNOTE.held + ' more'; p.classList.remove('hidden');
  clearTimeout(p._t); p._t = setTimeout(function () { p.classList.add('hidden'); MNOTE.held = 0; }, 3500);
}
function refreshBell() { const n = document.getElementById('mBellN'); if (!n) return; n.textContent = MNOTE.unread > 99 ? '99+' : String(MNOTE.unread); n.classList.toggle('hidden', !MNOTE.unread); }
function openNotificationCenter() {
  if (!MNOTE.el) {
    const el = document.createElement('div'); el.id = 'mNotes'; el.className = 'hidden';
    el.innerHTML = '<div class="miHead"><span class="miIcon">🔔</span><div class="miTitle"><b>Notifications</b><small id="mNotesSub"></small></div><button class="mX" data-mn="close" aria-label="Close">✕</button></div>' +
      '<div class="mChips mNoteTabs"><button class="mChip" data-mn="quests">🎯 Quests</button><button class="mChip" data-mn="events">⚡ Events</button><button class="mChip" data-mn="clear">🧹 Clear</button></div><div class="miBody mScroll" id="mNotesList"></div>';
    document.body.appendChild(el); MNOTE.el = el;
    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-mn]'); if (!b) return; sfx('click');
      const k = b.dataset.mn;
      if (k === 'close') closeNotificationCenter();
      else if (k === 'clear') { MNOTE.list = []; renderNotificationCenter(); }
      else { closeNotificationCenter(); openQuestsPanel(k); }
    });
  }
  if (MNOTE.open) { closeNotificationCenter(); return; }
  closeInspector(); closeSheet();
  MNOTE.open = true; MNOTE.unread = 0; refreshBell();
  MNOTE.el.classList.remove('hidden'); document.body.classList.add('mInsOpen'); renderNotificationCenter(); auditSoon();
}
function closeNotificationCenter() { if (!MNOTE.open) return false; MNOTE.open = false; if (MNOTE.el) MNOTE.el.classList.add('hidden'); if (!MINS.kind) document.body.classList.remove('mInsOpen'); return true; }
function renderNotificationCenter() {
  if (!MNOTE.el) return;
  $('mNotesSub').textContent = MNOTE.list.length + ' messages';
  const ago = function (t) { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; };
  $('mNotesList').innerHTML = MNOTE.list.length ? MNOTE.list.map(function (n) { return '<div class="mNote ' + esc(n.cls) + '"><span>' + esc(n.msg) + '</span><small>' + ago(n.t) + (n.day ? ' · D' + n.day : '') + '</small></div>'; }).join('') : '<p class="small" style="padding:10px">No notifications yet — construction, companies, population milestones and traffic warnings appear here.</p>';
}
/* Quests / events (the desktop right panel) as a mobile side panel */
function openQuestsPanel(tab) {
  closeMobileOverlays();
  toggleRight(false); setRightTab(tab === 'events' ? 'events' : 'quests');
  document.body.classList.add('mRightOpen');
}
function closeQuestsPanel() { if (!document.body.classList.contains('mRightOpen')) return false; document.body.classList.remove('mRightOpen'); toggleRight(true); return true; }

/* ===================================== PAUSE MENU · SAVE ===================================== */
function mobilePauseMenu() {
  if (!STARTED) return;
  const wasSpeed = S.settings.speed;
  if (wasSpeed) setSpeed(0);
  closeMobileOverlays(); closeMobilePage(); closeCityMap(); closeNotificationCenter();
  showModal('⏸ PAUSED · ' + esc(S.city.name), '<div class="mPause">' +
    '<button class="btn gold big" data-mp="resume">▶ RESUME</button><button class="btn green big" data-mp="save">💾 SAVE</button>' +
    '<button class="btn big" data-mp="settings">⚙️ SETTINGS</button><button class="btn big" data-mp="controls">🎮 CONTROLS</button>' +
    '<button class="btn blue big" data-mp="menu">🏠 EXIT TO MENU</button></div>' +
    '<div class="mPauseMore"><button class="btn small" data-mp="load">📂 Load</button><button class="btn small" data-mp="advisor">🤖 Advisor</button><button class="btn small" data-mp="photo">📷 Photo</button><button class="btn small" data-mp="achievements">🏅 Achievements</button>' +
    (typeof AdminAuth !== 'undefined' && AdminAuth.active() ? '<button class="btn small" data-mp="admin">🛡️ Admin</button>' : '') + '</div><div id="mSaveState" class="small"></div>',
  function () { if (wasSpeed && S.settings.speed === 0) setSpeed(wasSpeed); });
  $('modal').classList.add('mPauseModal');
  document.querySelectorAll('[data-mp]').forEach(function (b) {
    b.onclick = function () {
      const k = b.dataset.mp; sfx('click');
      if (k === 'resume') { closeModal(); return; }
      if (k === 'save') { mobileSave(); return; }
      modalOnClose = null; if (wasSpeed) setSpeed(wasSpeed);
      if (k === 'menu') { closeModal(); returnToMenu(); return; }
      closeModal();
      if (k === 'settings') openSettings();
      else if (k === 'controls') openControlsHelp();
      else if (k === 'load') { returnToMenu(); showMenu('load'); }
      else if (k === 'advisor') openAdvisorReport();
      else if (k === 'photo') enterPhoto();
      else if (k === 'achievements') openAchievements();
      else if (k === 'admin') openAdmin();
    };
  });
}
/* One tap: SAVING CITY... → CITY SAVED (or the reason it failed) */
function mobileSave() {
  saveChip('💾 SAVING CITY...', '');
  const st = $('mSaveState'); if (st) st.textContent = '💾 SAVING CITY...';
  setTimeout(function () {
    let ok = false; try { ok = saveGame(true); } catch (e) { ok = false; }
    if (ok && typeof clearRecovery === 'function') { /* saved city is the new recovery point */ }
    saveChip(ok ? '✅ CITY SAVED' : '❌ SAVE FAILED', ok ? 'good' : 'bad');
    const s2 = $('mSaveState'); if (s2) s2.textContent = ok ? '✅ CITY SAVED · ' + new Date().toLocaleTimeString() : '❌ Save failed — storage full or blocked';
    sfx(ok ? 'money' : 'error');
  }, 60);
}
function saveChip(text, cls) {
  let el = document.getElementById('mSaveChip');
  if (!el) { el = document.createElement('div'); el.id = 'mSaveChip'; document.body.appendChild(el); }
  el.className = cls || ''; el.textContent = text;
  clearTimeout(el._t); if (cls) el._t = setTimeout(function () { el.className = 'hidden'; }, 2200);
}
function openControlsHelp() {
  const row = function (i, t, d) { return '<div class="mHelpRow"><span>' + i + '</span><div><b>' + t + '</b><p>' + d + '</p></div></div>'; };
  showModal('🎮 TOUCH CONTROLS', '<div class="mHelp">' + row('✋', 'Move the camera', 'Drag with one finger.') + row('🤏', 'Zoom', 'Pinch with two fingers.') + row('🔄', 'Rotate', 'Twist two fingers (🧭 Settings → Camera can turn it off). ↺ turns north up again.') +
    row('✌️', 'Pan with two fingers', 'Move both fingers together.') + row('👆', 'Inspect', 'Tap a building, citizen, vehicle or road.') + row('🏗️', 'Build', 'BUILD → card → drag the ghost (green = buildable) → ROTATE → CONFIRM.') +
    row('🛣️', 'Roads & zones', 'ROAD / ZONE → touch START → DRAG → lift (END) → CONFIRM.') + row('🎯', 'Reset camera', 'City centre, north up, default zoom.') + row('◀', 'Back button', 'Closes windows, cancels building, opens the pause menu.') + '</div>' +
    '<div class="mActs"><button class="btn gold" data-mh2="tut">🎓 Replay tutorial</button><button class="btn" data-mh2="set">⚙️ Control settings</button></div>');
  $('modalBody').querySelector('[data-mh2="tut"]').onclick = function () { closeModal(); GSET.mobileTutDone = false; startMobileTutorial(true); };
  $('modalBody').querySelector('[data-mh2="set"]').onclick = function () { openSettings('controls'); };
}
/* Autosave after important events (big buildings, a new city level) in addition to the timer (Settings → Simulation) */
let MOB_SAVE_SOON = 0;
function mobileAutosaveSoon(why) { if (!GSET.autosave || MOB.errorStorm) return; clearTimeout(MOB_SAVE_SOON); MOB_SAVE_SOON = setTimeout(function () { if (STARTED && saveGame(true)) Log.info('Autosave (' + why + ')'); }, 4000); }

/* ===================================== SETTINGS (mobile cards) ===================================== */
function mSetCard(icon, title, desc, ctl) { return '<div class="mSetCard"><div class="mscText"><b>' + icon + ' ' + title + '</b>' + (desc ? '<span>' + desc + '</span>' : '') + '</div><div class="mscCtl">' + ctl + '</div></div>'; }
function mSeg(attr, key, vals, labels, cur) { return '<div class="mSeg">' + vals.map(function (v, i) { return '<button class="' + (String(cur) === String(v) ? 'on' : '') + '" ' + attr + '="' + key + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; }
function mTog(attr, key, on, extra) { return '<button class="mTog' + (on ? ' on' : '') + '" ' + attr + '="' + key + '" data-v="' + (extra !== undefined ? extra : on ? '0' : '1') + '" aria-pressed="' + !!on + '"><i></i>' + (on ? 'ON' : 'OFF') + '</button>'; }
const MSET_TABS = [['graphics', '🎨', 'Graphics'], ['performance', '🚀', 'Performance'], ['camera', '🎥', 'Camera'], ['controls', '🎮', 'Controls'], ['audio', '🔊', 'Audio'], ['haptics', '📳', 'Haptics'],
  ['uiscale', '🔍', 'UI Scale'], ['language', '🌐', 'Language'], ['accessibility', '♿', 'Accessibility'], ['save', '💾', 'Save'], ['notifications', '🔔', 'Notifications']];
const MSET_ALIAS = { system: 'save', simulation: 'performance' };
const POWER_MODES = { performance: { perfMode: 'MEDIUM', fpsTarget: '60', simQuality: 'MEDIUM' }, balanced: { perfMode: 'AUTO', fpsTarget: 'AUTO', simQuality: 'MEDIUM' }, quality: { perfMode: 'HIGH', fpsTarget: '60', simQuality: 'HIGH' }, battery: { perfMode: 'LOW', fpsTarget: '30', simQuality: 'LOW' } };
function deviceCardHtml() {
  const dv = Platform.device(), req = PLATFORM_ADAPTER.requirements || {}, ram = dv.ramMB || 0;
  let gpu = '';
  try { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? 'WebGL' : 'Canvas 2D'; } catch (e) { gpu = 'Canvas 2D'; }
  const rec = !ram || ram >= (req.recommendedRamMB || 4096) ? 'HIGH' : ram >= (req.ramMB || 2048) ? 'MEDIUM' : 'LOW';
  return mSetCard('📱', 'Device', (dv.model ? esc(dv.model) + ' · ' : '') + (IS_ANDROID_APP ? 'Android ' + esc(ANDROID_INFO.release || '?') + ' (API ' + dv.sdk + ') · ' : '') + dv.cores + ' cores · ' + (ram ? Math.round(ram / 1024 * 10) / 10 + ' GB RAM' : 'RAM ?') + ' · ' + esc(String(gpu).slice(0, 40)) +
    '<br>Recommended profile: <b>' + rec + '</b>' + (AUTOP.benchmark ? ' · benchmark ' + AUTOP.benchmark.score : '') + (req.android ? '<br>Minimum: Android ' + req.android + ', ' + Math.round(req.ramMB / 1024) + ' GB RAM, ' + req.storageMB + ' MB storage · recommended ' + Math.round(req.recommendedRamMB / 1024) + ' GB RAM · GPU ' + esc(req.gpu) : ''),
    '<button class="btn small" data-mset="applyRec" data-v="' + rec + '">Use ' + rec + '</button>');
}
function mobileSettings(tab) {
  if (tab) SET2.tab = MSET_ALIAS[tab] || tab;
  if (!MSET_TABS.some(function (t) { return t[0] === SET2.tab; })) SET2.tab = MSET_ALIAS[SET2.tab] || 'graphics';
  const se = S.settings, G = 'data-gs2', A = 'data-mset';
  const sTog = function (k) { return '<button class="mTog' + (se[k] ? ' on' : '') + '" data-act="toggle" data-k="' + k + '"><i></i>' + (se[k] ? 'ON' : 'OFF') + '</button>'; };
  const sSeg = function (k, vals, labels) { return '<div class="mSeg">' + vals.map(function (v, i) { return '<button class="' + (se[k] === v ? 'on' : '') + '" data-act="set" data-k="' + k + '" data-v="' + v + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>'; };
  const gsSeg = function (k, vals, labels) { return mSeg('data-gset', k, vals, labels, GSET[k]); };
  const gsTg = function (k) { return mTog('data-gset', k, !!GSET[k]); };
  const aTog = function (k, def) { const on = GSET[k] === undefined ? def !== false : !!GSET[k]; return mTog(A, k, on); };
  const vol = function (k, label) { const v = GSET[k] === undefined ? 100 : GSET[k]; return mSetCard('🎚️', label + ' (' + v + '%)', '', mSeg(A, k, [0, 25, 50, 75, 100], ['0', '25', '50', '75', '100'], v)); };
  const slider = function (k, label, desc) { const lv = ['LOW', 'MEDIUM', 'HIGH'], ci = Math.max(0, lv.indexOf(GSET[k] || 'MEDIUM')); return mSetCard('🎚️', label, desc, '<div class="mSlider"><input type="range" min="0" max="2" step="1" value="' + ci + '" data-mrange="' + k + '" aria-label="' + label + '"><div class="mSliderLbl"><span>Low</span><span>Medium</span><span>High</span></div></div>'); };
  const asIv = !GSET.autosave ? 'off' : String(GSET.autosaveInterval || 300);
  let h = '';
  switch (SET2.tab) {
    case 'graphics':
      h = mSetCard('🎨', 'Graphics', 'Now ' + perfModeLabel() + '. AUTO measures the device and lowers detail when it gets slow or hot.', mSeg(G, 'perfMode', ['LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'AUTO'], null, GSET.perfMode)) +
        mSetCard('🌗', T('shadows'), '', gsTg('shadows')) + mSetCard('✨', T('particles'), '', gsSeg('particles', ['ON', 'REDUCED', 'OFF'])) +
        mSetCard('🌳', 'Decorations', 'Procedural trees, lamps and details.', sTog('deco')) + mSetCard('📟', 'Show FPS', 'Small FPS counter.', sTog('showFps')) +
        mSetCard('🌆', 'Visual Engine', 'Day / night, weather, seasons, city lights, clouds, water and crowds. Now ' + (typeof VE !== 'undefined' ? VE.tier : '—') + '. AUTO steps down when the phone is slow or hot.', mSeg(G, 'veQuality', ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], null, GSET.veQuality || 'AUTO')) +
        (typeof vePresetsAllowed === 'function' && vePresetsAllowed() ? mSetCard('🧪', 'Visual presets', 'Developer / admin test presets.', '<div class="mBtns">' + Object.keys(VE_PRESETS).map(function (p) { return '<button class="btn small" data-gs2="vePreset" data-v="' + p + '">' + p.replace('MOBILE ', '📱 ').replace('DESKTOP ', '🖥 ') + '</button>'; }).join('') + '</div>') : '') +
        ((BUILD.dev || BUILD.test) ? mSetCard('🐞', 'Visual debug overlay', 'FPS, frame time, simulation time, objects, chunks, particles, memory (development build).', mTog(G, 'veDebug', !!GSET.veDebug)) : '') +
        (IS_ANDROID ? mSetCard('🖼', 'Screen orientation', 'Landscape is recommended on phones.', mSeg(G, 'orientation', ['landscape', 'auto', 'portrait'], ['Landscape', 'Auto', 'Portrait'], GSET.orientation)) : '') +
        (BUILD.dev ? mSetCard('📐', 'SHOW UI BOUNDS', 'Development build only: X · Y · width · height of every UI element.', mTog(A, 'uiBounds', !!MOB.bounds)) : '');
      break;
    case 'performance':
      h = mSetCard('🔋', 'Power mode', 'Performance · Balanced · Quality · Battery Saver set graphics, FPS and simulation together.', mSeg(A, 'powerMode', ['performance', 'balanced', 'quality', 'battery'], ['Performance', 'Balanced', 'Quality', 'Battery Saver'], GSET.powerMode || 'balanced')) +
        mSetCard('🎞️', 'FPS target', 'AUTO: 60 FPS on strong devices, 30 FPS on weak or hot ones, in menus and while idle.', mSeg(A, 'fpsTarget', ['AUTO', '30', '45', '60'], ['AUTO', '30', '45', '60'], GSET.fpsTarget || 'AUTO')) +
        mSetCard('🧠', 'Simulation quality', 'Near citizens & vehicles: full AI · mid: reduced · far: statistical flow.', mSeg(G, 'simQuality', ['LOW', 'MEDIUM', 'HIGH'], null, GSET.simQuality)) +
        mSetCard('📉', 'Low-end device mode', 'Short render distance, no shadows, fewer citizens.', mTog(G, 'lowEnd', GSET.lowEnd)) +
        mSetCard('👥', T('npc'), '', gsSeg('npcDensity', [25, 50, 75, 100, 150, 200], ['25%', '50%', '75%', '100%', '150%', '200%'])) +
        mSetCard('🚗', T('traffic2'), '', gsSeg('trafficDensity', [25, 50, 75, 100, 150, 200], ['25%', '50%', '75%', '100%', '150%', '200%'])) +
        mSetCard('🛡️', 'Safe speed limit', 'Heavy speeds slow down on a struggling device (now ' + SAFE.cap + '×).', mTog(G, 'safeSpeed', GSET.safeSpeed)) + deviceCardHtml();
      break;
    case 'camera':
      h = slider('camSens', 'Camera Sensitivity', 'How far the camera moves per finger movement.') + slider('zoomSpeed', 'Zoom Speed', 'Pinch zoom speed.') + slider('rotSpeed', 'Rotation Speed', 'Two-finger twist speed.') +
        mSetCard('↕️', 'Invert Vertical', '', aTog('invertV', false)) + mSetCard('↔️', 'Invert Horizontal', '', aTog('invertH', false)) +
        mSetCard('🤏', 'Gesture Camera', 'Pinch zoom and two-finger rotate. OFF shows + / − zoom buttons instead.', aTog('gestureCam', true)) +
        mSetCard('🔄', 'Two-finger rotation', '', mTog(G, 'rotateCam', GSET.rotateCam)) +
        (IS_DESKTOP ? mSetCard('🖱', 'Edge Pan', 'Move the camera at the screen edge (mouse).', mTog(G, 'edgePan', GSET.edgePan)) : mSetCard('🖱', 'Edge Pan', 'Mouse only — used on Windows.', '<span class="small">—</span>')) +
        mSetCard('🧭', 'Minimap', '', sTog('minimap')) + mSetCard('🎯', 'RESET CAMERA', 'City centre, north up, default zoom.', '<button class="btn small" data-mset="resetCam" data-v="1">Reset</button>');
      break;
    case 'controls':
      h = mSetCard('👆', 'LARGE TOUCH MODE', 'Bigger buttons, text and touch areas.', mTog(G, 'largeTouch', GSET.largeTouch)) +
        mSetCard('🧾', 'Purchase confirmation', '', sSeg('confirm', ['always', 'expensive', 'never'], ['Always', 'Expensive', 'Never'])) +
        mSetCard('🎮', 'Controller', PAD.active ? 'Controller connected' : 'Bluetooth / USB controllers (touch keeps working without one)', sTog('gamepad')) +
        mSetCard('✋', 'Touch controls', 'Swipe = move camera · pinch = zoom · two fingers = rotate · tap = select · drag = place.', '<button class="btn small" data-mset="training" data-v="1">Show</button>') +
        mSetCard('🎓', 'Tutorial', 'Camera, road, homes, utilities, jobs, traffic, expansion.', '<button class="btn small" data-gs2="replayTut" data-v="1">Replay</button>') +
        mSetCard('📖', 'Help', 'All touch controls.', '<button class="btn small" data-mset="help" data-v="1">Open</button>');
      break;
    case 'audio':
      h = mSetCard('🔊', 'Sound effects', '', sTog('sound')) + mSetCard('🎵', 'Music', '', sTog('music')) +
        mSetCard('🔈', 'Master (' + GSET.masterVolume + '%)', '', gsSeg('masterVolume', [0, 25, 50, 80, 100], ['0', '25', '50', '80', '100'])) +
        vol('volMusic', 'Music') + vol('volSfx', 'SFX') + vol('volUi', 'UI') + vol('volEnv', 'Environment') + mSetCard('💬', 'Citizen speech bubbles', '', sTog('bubbles'));
      break;
    case 'haptics':
      h = mSetCard('📳', 'Haptic Feedback', 'Light vibration for buttons, build success, invalid placement, notifications and major alerts.', aTog('haptics', true)) +
        mSetCard('🧪', 'Test', '', '<div class="mBtns"><button class="btn small" data-mset="hapticTest" data-v="tap">Tap</button><button class="btn small" data-mset="hapticTest" data-v="success">Build</button><button class="btn small" data-mset="hapticTest" data-v="error">Invalid</button><button class="btn small" data-mset="hapticTest" data-v="alert">Alert</button></div>');
      break;
    case 'uiscale':
      h = mSetCard('🔍', 'UI SCALE (' + GSET.uiScale + '%)', 'Resize the whole interface for your phone or tablet.', mSeg(G, 'uiScale', [80, 90, 100, 110, 120, 130], ['80%', '90%', '100%', '110%', '120%', '130%'], GSET.uiScale)) +
        mSetCard('🔠', 'Text size', '', mSeg(G, 'textSize', ['S', 'M', 'L', 'XL'], ['S', 'M', 'L', 'XL'], GSET.textSize)) +
        mSetCard('👆', 'LARGE TOUCH MODE', 'Buttons, text and touch hitboxes grow.', mTog(G, 'largeTouch', GSET.largeTouch)) +
        mSetCard('≡', 'HUD', 'FULL · COMPACT · MINIMAL (≡ in the top right).', mSeg(A, 'hudMode', ['full', 'compact', 'minimal'], ['Full', 'Compact', 'Minimal'], GSET.hudMode || 'full'));
      break;
    case 'language':
      h = mSetCard('🌐', T('language'), 'The whole game, also the mobile UI.', gsSeg('language', ['en', 'tr'], ['English', 'Türkçe']));
      break;
    case 'accessibility':
      h = mSetCard('◐', 'High contrast', '', sTog('highContrast')) + mSetCard('🧘', 'Reduced motion', '', sTog('reducedMotion')) + mSetCard('✨', 'Reduced effects', 'Fewer particles.', sTog('particleReduce')) +
        '<div class="mSetCard"><div class="mscText"><b>📳 Screen shake off</b></div><div class="mscCtl"><button class="mTog' + (se.screenShake === false ? ' on' : '') + '" data-act="toggle" data-k="screenShake"><i></i>' + (se.screenShake === false ? 'ON' : 'OFF') + '</button></div></div>' +
        mSetCard('📴', 'Vibration', 'Haptic feedback.', aTog('haptics', true)) + mSetCard('🎨', 'Colour-blind heatmaps', 'Information is also shown with icons and text, never colour only.', mTog(G, 'cbHeat', GSET.cbHeat)) +
        mSetCard('🔠', 'Large text', '', mSeg(G, 'textSize', ['M', 'L', 'XL'], ['Normal', 'Large', 'Extra large'], GSET.textSize)) + mSetCard('👆', 'Large touch controls', '', mTog(G, 'largeTouch', GSET.largeTouch)) +
        mSetCard('💡', 'Tutorial hints', '', mTog(G, 'tutorialHints', GSET.tutorialHints));
      break;
    case 'save':
      h = mSetCard('💾', 'Save now', 'CITY_SAVE_V4 (save v' + SAVE_VERSION + ') · atomic writes with validation and a backup copy.', '<div class="mBtns"><button class="btn small green" data-mset="save" data-v="1">💾 Save</button><button class="btn small" data-act="downloadSave">📤 Export</button><button class="btn small" data-act="importSave">📥 Import</button></div>') +
        mSetCard('⏱️', 'Autosave', 'Plus a save after important events.', mSeg(A, 'autosave', ['off', '300', '600', '900', '1800'], ['OFF', '5 min', '10 min', '15 min', '30 min'], asIv)) +
        mSetCard('📸', 'Event snapshots', 'Before disasters and economic crises, after big construction and city expansion (last 3 kept).', aTog('autoSnap', true)) +
        mSetCard('📁', 'Storage', esc(SaveProviders.active.name) + ' · Cloud save: not enabled (offline-first)', '<span class="small">' + (IS_ANDROID_APP ? 'Uninstalling deletes the saves — EXPORT first.' : '') + '</span>') +
        (AdminAuth.active() ? mSetCard('🛡️', 'Admin session', 'Auto-lock ' + GSET.adminLockMin + ' min', '<button class="btn small red" data-gs2="adminLogout" data-v="1">⏏ LOG OUT</button>') : '') +
        (typeof stressAllowed === 'function' && stressAllowed() ? mSetCard('🧪', 'MOBILE STRESS TEST', 'Developer / test builds and authorized developers only: FPS, frame time, memory, citizens, vehicles, buildings at 10×.', '<button class="btn small" data-mset="stress" data-v="1">Open</button>') : '') +
        '<div class="mSetCard"><div class="mscText"><b>ℹ️ About</b><span class="verTap" id="setVersion">' + T('version') + ' ' + GAME_VERSION + ' · ' + PLATFORM_NAME + ' · save v' + SAVE_VERSION + ' · build ' + BUILD.profile.toUpperCase() + '</span><span>Offline-first: the whole city simulation works without internet.</span></div></div>';
      break;
    case 'notifications':
      h = mSetCard('🚨', 'Critical alerts', 'Major fire, power failure, water shortage, bank crisis, earthquake, flood, collapse.', aTog('critAlerts', true)) +
        mSetCard('💬', 'Citizen comments', 'Occasional comments from citizens (with a cooldown).', aTog('comments', true)) +
        NOTIFY_CATS.map(function (c) { const on = GSET.notify[c[0]] !== false; return mSetCard(c[1], c[2], '', '<button class="mTog' + (on ? ' on' : '') + '" data-gs2="notify" data-v="' + c[0] + '"><i></i>' + (on ? 'ON' : 'OFF') + '</button>'); }).join('') +
        mSetCard('🎚️', 'Dynamic difficulty', '', sTog('dynDiff')) + mSetCard('📰', 'Daily city report', '', sTog('dailyReport'));
      break;
  }
  const tabs = '<div class="mChips mSetTabs">' + MSET_TABS.map(function (t) { return '<button class="mChip' + (SET2.tab === t[0] ? ' on' : '') + '" data-s2tab="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + '</button>'; }).join('') + '</div>';
  const keep = $('modalWrap').classList.contains('show') && $('modal').classList.contains('mSettings') ? $('modalBody').scrollTop : 0;
  showModal('⚙️ SETTINGS', tabs + '<div class="mSetList">' + h + '</div>');
  $('modal').classList.add('mSettings');
  $('modalBody').scrollTop = keep;
  const on = $('modalBody').querySelector('.mSetTabs .on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
const MSET_BOOL = ['invertV', 'invertH', 'gestureCam', 'haptics', 'autoSnap', 'critAlerts', 'comments'];
function msetApply(k, v) {
  if (MSET_BOOL.indexOf(k) >= 0) { GSET[k] = v === '1'; if (k === 'invertV' || k === 'invertH') GSET.invertPan = false; if (k === 'haptics' && GSET.haptics) haptic('tap'); }
  else if (k === 'fpsTarget' || k === 'camSens' || k === 'zoomSpeed' || k === 'rotSpeed') GSET[k] = v;
  else if (k === 'volMusic' || k === 'volSfx' || k === 'volUi' || k === 'volEnv') { GSET[k] = clamp(+v || 0, 0, 100); if (SND.applyVolumes) SND.applyVolumes(); }
  else if (k === 'hudMode') { GSET.hudMode = v; if (typeof applyHudMode === 'function') applyHudMode(); }
  else if (k === 'powerMode') { GSET.powerMode = v; Object.assign(GSET, POWER_MODES[v] || {}); if (v === 'battery') GSET.particles = 'REDUCED'; if (GSET.perfMode === 'AUTO') GSET.autoPerfLevel = ''; GSET._rev++; toast('🔋 ' + ({ performance: 'Performance', balanced: 'Balanced', quality: 'Quality', battery: 'Battery Saver' })[v] + ' mode', 'good'); }
  else if (k === 'autosave') { if (v === 'off') GSET.autosave = false; else { GSET.autosave = true; GSET.autosaveInterval = +v; } }
  else if (k === 'applyRec') { GSET.perfMode = v; GSET._rev++; }
  else if (k === 'hapticTest') { haptic(v); return; }
  else if (k === 'uiBounds') { setUiBounds(v === '1'); return; }
  else if (k === 'resetCam') { closeModal(); resetCamera(); return; }
  else if (k === 'help') { openControlsHelp(); return; }
  else if (k === 'training') { closeModal(); if (typeof showTouchTraining === 'function') showTouchTraining(true); return; }
  else if (k === 'stress') { closeModal(); if (typeof openStressTest === 'function') openStressTest(); return; }
  else if (k === 'save') { mobileSave(); return; }
  saveGSET(); applySettings2(); updateFpsCap();
  if ($('modalWrap').classList.contains('show')) openSettings();
}
document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('[data-mset]'); if (!el) return; e.preventDefault(); sfx('click'); msetApply(el.dataset.mset, el.dataset.v); });
document.addEventListener('change', function (e) { const el = e.target; if (el && el.dataset && /^(camSens|zoomSpeed|rotSpeed)$/.test(el.dataset.mrange || '')) msetApply(el.dataset.mrange, ['LOW', 'MEDIUM', 'HIGH'][clamp(+el.value | 0, 0, 2)]); });

/* ===================================== MOBILE TUTORIAL (touch) ===================================== */
const MOBILE_TUTORIAL = [
  ['✋', 'Camera', 'Drag with one finger to move around the city. Two fingers moving together also pan. 🎯 on the left brings you back to the city centre.', null],
  ['🤏', 'Zoom', 'Pinch with two fingers to zoom in and out. Twist two fingers to rotate — ↺ turns north up again.', null],
  ['🏗️', 'Build', 'BUILD → choose a category and a card → drag the ghost (green = BUILDABLE, red = CANNOT BUILD) → ROTATE → CONFIRM.', '[data-mbar="build"]'],
  ['🛣️', 'Road', 'ROAD → pick Small, Medium, Large, Highway, Bridge or Tunnel → touch START, DRAG your finger, lift to END, then CONFIRM.', '[data-mbar="road"]'],
  ['🗺️', 'Map', 'MAP opens the full city map with roads, districts, buildings, transit, water and electricity. Tap it to jump there.', '[data-mbar="map"]'],
  ['💰', 'Economy', 'ECONOMY shows money, income, expenses, GDP, inflation, interest and companies with touch graphs.', '[data-mbar="economy"]'],
  ['💾', 'Save', 'The game autosaves. ⏸ (left) or the back button opens the pause menu — SAVE saves with one tap.', '#mPause']
];
function startMobileTutorial(force) {
  if (!IS_MOBILE || (!force && (GSET.mobileTutDone || GSET.tutorialHints === false)) || MOB.tut) return;
  MOB.tut = { i: 0 };
  const el = document.createElement('div'); el.id = 'mTut'; document.body.appendChild(el);
  renderMobileTutorial();
}
function renderMobileTutorial() {
  const el = document.getElementById('mTut'); if (!el || !MOB.tut) return;
  const s = MOBILE_TUTORIAL[MOB.tut.i], tgt = s[3] ? document.querySelector(s[3]) : null, r = tgt && shown(tgt) ? tgt.getBoundingClientRect() : null;
  el.innerHTML = (r ? '<i class="mtRing" style="left:' + (r.left - 4) + 'px;top:' + (r.top - 4) + 'px;width:' + (r.width + 8) + 'px;height:' + (r.height + 8) + 'px"></i>' : '') +
    '<div class="mtCard' + (r && r.top > window.innerHeight / 2 ? ' up' : '') + '"><div class="mtIcon">' + s[0] + '</div><div class="mtTitle">' + (MOB.tut.i + 1) + '/' + MOBILE_TUTORIAL.length + ' · ' + s[1].toUpperCase() + '</div><p>' + s[2] + '</p>' +
    '<div class="mtDots">' + MOBILE_TUTORIAL.map(function (x, i) { return '<i class="' + (i === MOB.tut.i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
    '<div class="mtBtns"><button class="btn" id="mtSkip">SKIP</button><button class="btn gold" id="mtNext">' + (MOB.tut.i === MOBILE_TUTORIAL.length - 1 ? 'START! 🚀' : 'NEXT →') + '</button></div></div>';
  el.querySelector('#mtSkip').onclick = function () { endMobileTutorial(true); sfx('click'); };
  el.querySelector('#mtNext').onclick = function () { sfx('click'); MOB.tut.i++; if (MOB.tut.i >= MOBILE_TUTORIAL.length) endMobileTutorial(false); else renderMobileTutorial(); };
}
function endMobileTutorial(skipped) { const el = document.getElementById('mTut'); if (el) el.remove(); MOB.tut = null; GSET.mobileTutDone = true; saveGSET(); Log.info('Mobile tutorial ' + (skipped ? 'skipped' : 'completed')); }

/* ===================================== FPS TARGET · LOW MEMORY MODE · ERROR RECOVERY ===================================== */
window.BCT_FPS_CAP = 0;
function updateFpsCap() {
  const t = GSET.fpsTarget;
  let cap = t && t !== 'AUTO' ? +t || 0 : 0;
  if ((!t || t === 'AUTO') && IS_MOBILE) cap = GSET.lowEnd || MOB.lowMem || (S && S.settings && S.settings.quality === 'LOW') || Platform.thermal() >= 3 ? 30 : 0;
  window.BCT_FPS_CAP = cap >= 60 ? 0 : cap;
}
/* LOW MEMORY: distant ground chunks + unused textures unloaded, far agents aggregated (lower caps), fewer particles, no
   shadows. The active city (buildings, roads, citizens in the save) is never touched. */
const _perfPresetM = window.perfPreset, LOWMEM_CACHE = new WeakMap();
window.perfPreset = function (q) {
  const o = _perfPresetM(q);
  if (!MOB.lowMem) return o;
  let r = LOWMEM_CACHE.get(o);
  if (!r) { r = Object.assign({}, o, { npc: Math.max(4, Math.round(o.npc * 0.5)), veh: Math.max(2, Math.round(o.veh * 0.6)), part: Math.min(o.part, 40), shadow: false, glow: false }); LOWMEM_CACHE.set(o, r); }
  return r;
};
function lowMemoryMode(why) {
  const now = Date.now(); if (MOB.lowMemAt && now - MOB.lowMemAt < 30000) return;
  MOB.lowMemAt = now; const first = !MOB.lowMem; MOB.lowMem = true;
  try {
    FX.particles.length = 0; if (FX.pool) FX.pool.length = 0;
    if (typeof WE !== 'undefined' && WE.ground) { const t = FX.time; WE.ground.forEach(function (g, k) { if (t - g.used > 0.05) { WE.pixels -= g.cv.width * g.cv.height; WE.ground.delete(k); WE.unloads++; } }); WE.pool.length = 0; }
    if (typeof MINI !== 'undefined') MINI.base = null;
    if (MAP.pathCache) MAP.pathCache.clear();
    if (typeof GROUND !== 'undefined') GROUND.layerKey = '';
  } catch (e) { Log.warn('Low memory cleanup: ' + e.message); }
  updateFpsCap();
  Log.warn('LOW MEMORY MODE (' + why + '): chunks/textures unloaded, agents aggregated, particles and shadows reduced');
  if (first) toast('🧹 Low memory: distant detail reduced — your city is safe', '');
}
window.bctLowMemory = function (level) { lowMemoryMode('Android trim level ' + level); return 'ok'; };
/* Part 16: LOW MEMORY RESTORE — 3 min without a new low-memory signal and the heap below 60 % → the mode ends, and
   quality climbs back ONE step at a time (the visual governor / AUTO PERFORMANCE raise it again after good FPS),
   never straight back to full detail. Low-RAM devices stay in the mode. */
function lowMemoryRestore(now) {
  if (!MOB.lowMem || (IS_ANDROID_APP && ANDROID_INFO.lowRam) || !MOB.lowMemAt || now - MOB.lowMemAt < 180000) return false;
  const m = performance.memory; if (m && m.jsHeapSizeLimit && m.usedJSHeapSize / m.jsHeapSizeLimit > 0.6) return false;
  MOB.lowMem = false;
  // first step: LOW → MEDIUM; every further step needs good FPS for a while (AUTO PERFORMANCE: 60 s, visual governor: 30 s).
  // Only phones drop the visual tier to LOW in low-memory mode (visual-engine.js), so only they climb back step by step.
  if (!IS_MOBILE) { /* desktop: only the agent / particle caps were lowered — they return with the flag */ }
  else if (GSET.perfMode === 'AUTO' && S && S.settings && typeof setQualityLevel === 'function') { if (QUALITY_ORDER.indexOf(S.settings.quality) > 1) setQualityLevel('MEDIUM'); }
  else if (typeof VE_GOV !== 'undefined' && typeof veComputeTier === 'function') {
    const base = Math.max(0, VE_TIERS.indexOf(GSET.veQuality && GSET.veQuality !== 'AUTO' ? GSET.veQuality : S.settings.quality));
    VE_GOV.drop = Math.max(VE_GOV.drop, base - 1); VE_GOV.changedAt = performance.now(); VE_GOV.highSince = 0; VE_GOV.log.unshift('low memory over → restore step by step');
  }
  updateFpsCap(); Log.info('LOW MEMORY MODE ended: quality returns step by step');
  return true;
}
setInterval(function () {
  try {
    const m = performance.memory; if (m && m.jsHeapSizeLimit && m.usedJSHeapSize / m.jsHeapSizeLimit > 0.85) lowMemoryMode('heap ' + Math.round(m.usedJSHeapSize / 1048576) + ' MB');
    if (IS_ANDROID_APP && ANDROID_INFO.lowRam && !MOB.lowMem && STARTED) lowMemoryMode('low-RAM device');
    lowMemoryRestore(Date.now());
    updateFpsCap();
  } catch (e) { /* never break the game */ }
}, 5000);
/* ERROR RECOVERY: many errors in a short time → stop autosave (the last good autosave stays), offer to continue or
   reload the last save instead of letting the app die */
const MERR = { t: [], shown: false };
window.addEventListener('error', function (e) { if (e && e.target && e.target !== window) return; noteError(); });
window.addEventListener('unhandledrejection', function () { noteError(); });
function noteError() {
  if (!IS_MOBILE || !STARTED) return;
  const now = Date.now(); MERR.t = MERR.t.filter(function (t) { return now - t < 20000; }); MERR.t.push(now);
  if (MERR.t.length >= 25 && !MERR.shown) {
    MERR.shown = true; MOB.errorStorm = true;
    Log.error('ERROR RECOVERY: ' + MERR.t.length + ' errors in 20 s — autosave paused, recovery offered');
    try { setSpeed(0); } catch (e) { /* ignore */ }
    sysDialog('⚠️ ERROR RECOVERY', '<p>Something went wrong. Your recovery save is safe.</p>', [['RETURN', 'gold', function () { MERR.shown = false; MERR.t = []; MOB.errorStorm = false; setSpeed(1); }], ['RECOVER SAVE', 'blue', function () { MERR.shown = false; MERR.t = []; MOB.errorStorm = false; loadSlot(S.slot || 1); }]], 0);
  }
}

/* ===================================== UI BOUNDS AUDIT (automatic) & SHOW UI BOUNDS (development builds) ===================================== */
/* Full-screen layers (#mPage, #mMap, #adminCenter) paint their background edge to edge on purpose (under the notch);
   their header and content are what has to stay inside the safe area, so those are audited */
const AUDIT_SEL = ['#photoBar', '#mChooser', '#mCrit', '#mAch', '#mAdv', '#mComment', '#mTrack', '#mMiniCtl', '#undoBar', '#mHud', '#mSide', '#mBar', '#mBuildBar', '#mRoad', '#mSheet', '#mInspect', '#mNotes', '#mPage .mPageHead', '#mPage .mPageBody', '#mMap .mMapHead', '#mMap .mMapBody', '#modal', '#sysBox', '#minimap', '#leftPanel.open', '#rightPanel', '#mTut .mtCard', '#dialogBox', '#admPill', '#mToolHint', '#mSaveChip', '#mHeld', '#issuesBar', '#wgBox', '#admLoginBox', '#admTop', '#admMain', '#dailyCard', '#fpsBox'];
function safeRect() { return { l: RESP.sa.l, t: RESP.sa.t, r: window.innerWidth - RESP.sa.r, b: window.innerHeight - RESP.sa.b }; }
function visibleEl(el) { if (!el || el.classList.contains('hidden')) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; }
/* finite entrance animations (slide / pop) jump to their end before measuring; endless effects (pulse) are left alone */
function settleAnimations(el) {
  if (!el.getAnimations) return;
  el.getAnimations().forEach(function (an) { try { const t = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming() : null; if (an.playState === 'running' && t && isFinite(t.endTime)) an.finish(); } catch (e) { /* not finishable */ } });
}
/* Checks x ≥ left, x + width ≤ right, y ≥ top, y + height ≤ bottom against the safe area; fix = move / shrink offenders */
function mobileUiAudit(fix) {
  if (!IS_MOBILE) return [];
  const sa = safeRect(), out = [];
  AUDIT_SEL.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (!visibleEl(el) || el.closest('.hidden')) return;
      settleAnimations(el);                       // judge where the element comes to rest, not a frame of its slide-in (slow devices)
      if (fix && el._afix) { el.style.translate = ''; el.style.maxWidth = el._afix.mw; el.style.maxHeight = el._afix.mh; el._afix = null; }
      let r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const bad = function (q) { return q.left < sa.l - 0.5 || q.top < sa.t - 0.5 || q.right > sa.r + 0.5 || q.bottom > sa.b + 0.5; };
      let fixed = false;
      if (bad(r) && fix && getComputedStyle(el).position === 'fixed' && el.id !== 'mHud' && el.id !== 'mBar') {
        el._afix = { mw: el.style.maxWidth, mh: el.style.maxHeight };
        if (r.width > sa.r - sa.l) el.style.maxWidth = (sa.r - sa.l) + 'px';
        if (r.height > sa.b - sa.t) el.style.maxHeight = (sa.b - sa.t) + 'px';
        r = el.getBoundingClientRect();
        const dx = r.left < sa.l ? sa.l - r.left : r.right > sa.r ? sa.r - r.right : 0, dy = r.top < sa.t ? sa.t - r.top : r.bottom > sa.b ? sa.b - r.bottom : 0;
        if (dx || dy) el.style.translate = Math.round(dx) + 'px ' + Math.round(dy) + 'px';
        r = el.getBoundingClientRect(); fixed = true;
      }
      out.push({ sel: sel, id: el.id || sel, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), ok: !bad(r), fixed: fixed });
    });
  });
  if (MOB.hud && shown(MOB.hud) && hudOverflows()) out.push({ sel: '#mHud .mGrp', id: 'HUD groups', x: 0, y: 0, w: 0, h: 0, ok: false, fixed: false });
  return out;
}
/* Touch target check: every visible button of the mobile UI is at least 40 CSS px and not covered by another element */
function mobileTouchAudit() {
  const out = [];
  document.querySelectorAll('#mChooser button,#mCrit button,#mAdv button,#undoBar button,#mHud button,#mSide button,#mBar button,#mBuildBar button,#mRoad button,#mSheet button,#mInspect button,#mPage button,#mMap button,#mNotes button,#modal button').forEach(function (b) {
    if (!visibleEl(b) || b.closest('.hidden')) return;
    const r = b.getBoundingClientRect(); if (!r.width) return;
    const cx = clamp(r.left + r.width / 2, 0, window.innerWidth - 1), cy = clamp(r.top + r.height / 2, 0, window.innerHeight - 1);
    const scroller = b.closest('.mScroll,.mChips,#modalBody');
    if (scroller) { const s = scroller.getBoundingClientRect(); if (cx < s.left || cx > s.right || cy < s.top || cy > s.bottom) return; }   // scrolled out of view
    const top = document.elementFromPoint(cx, cy), hit = !!top && (top === b || b.contains(top));
    if (!hit && top && top.closest && top.closest('#mPage,#mMap,#modalWrap,#sysDialog,#mTut,#leftPanel,#mRotateMsg,#adminCenter,#mSheet,#mInspect,#mNotes') && !b.closest('#mPage,#mMap,#modalWrap,#sysDialog,#mTut,#leftPanel,#adminCenter')) return;   // under an open full-screen page / panel
    out.push({ text: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), small: Math.min(r.width, r.height) < 36, covered: !hit });
  });
  return out;
}
let AUDIT_T = 0;
function auditSoon() { clearTimeout(AUDIT_T); AUDIT_T = setTimeout(function () { mobileUiAudit(true); if (MOB.bounds) drawUiBounds(); }, 320); }
function setUiBounds(on) {
  if (!BUILD.dev) { MOB.bounds = false; toast('SHOW UI BOUNDS is only available in development builds', 'bad'); return; }
  MOB.bounds = !!on; drawUiBounds();
  clearInterval(MOB.boundsT); if (MOB.bounds) MOB.boundsT = setInterval(drawUiBounds, 700);
  if ($('modalWrap').classList.contains('show')) openSettings();
}
function drawUiBounds() {
  let ov = document.getElementById('mBounds');
  if (!MOB.bounds || !BUILD.dev) { if (ov) ov.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'mBounds'; document.body.appendChild(ov); }
  const sa = safeRect();
  ov.innerHTML = '<i class="mbSafe" style="left:' + sa.l + 'px;top:' + sa.t + 'px;width:' + (sa.r - sa.l) + 'px;height:' + (sa.b - sa.t) + 'px"></i>' +
    mobileUiAudit(false).map(function (a) { return '<i class="' + (a.ok ? '' : 'bad') + '" style="left:' + a.x + 'px;top:' + a.y + 'px;width:' + a.w + 'px;height:' + a.h + 'px"><b>' + esc(a.id) + ' X' + a.x + ' Y' + a.y + ' W' + a.w + ' H' + a.h + '</b></i>'; }).join('');
}

/* ===================================== BACK BUTTON PANELS ===================================== */
function mobileBackPanels() {
  if (closeCityMap()) return true;
  if (closeMobilePage()) return true;
  if (UI.panel) { closeLeft(); return true; }
  if (closeNotificationCenter()) return true;
  if (closeQuestsPanel()) return true;
  if (closeInspector()) return true;
  if (closeSheet()) return true;
  if (UI.tool === 'bulldoze') { setTool('select'); hideToolHint(); return true; }
  return false;
}

/* ===================================== BOOT ===================================== */
const MOBP = {};
function mobilePanelsBoot() {
  MOBP.toast0 = window.toast; window.toast = mobileToast;
  MOBP.selectBuilding0 = window.selectBuilding;
  window.selectBuilding = function (b) { const r = MOBP.selectBuilding0.apply(this, arguments); if (b) openInspector('building', b); else if (MINS.kind === 'building') closeInspector(true); return r; };
  MOBP.showAgentInfo0 = window.showAgentInfo;
  window.showAgentInfo = function (a) { if (!a) return; sfx('click'); openInspector(a.v ? 'vehicle' : 'citizen', a.v || a.c); };
  MOBP.openSettings0 = window.openSettings; window.openSettings = function (tab) { mobileSettings(tab); };
  MOBP.openPauseMenu0 = window.openPauseMenu; window.openPauseMenu = mobilePauseMenu;
  window.startTutorial = function () { startMobileTutorial(false); };          // the touch tutorial replaces the desktop one
  window.firstTime = function () { };                                         // desktop first-time tips (keyboard hints) are not shown on touch
  const om = window.showModal;
  window.showModal = function () { const r = om.apply(this, arguments); $('modal').classList.remove('mSettings', 'mPauseModal'); auditSoon(); return r; };
  const ol = window.openPanel;
  window.openPanel = function () { closeSheet(); closeInspector(); closeMobilePage(); const r = ol.apply(this, arguments); auditSoon(); return r; };
  const sg = window.saveGame;
  window.saveGame = function (silent) { if (MOB.errorStorm && silent) { Log.warn('Autosave skipped (error recovery active)'); return false; } return sg.apply(this, arguments); };
  /* the right panel (quests / events) gets a close button on mobile */
  const rp = $('rightPanel');
  if (rp && !document.getElementById('mRpClose')) { const x = document.createElement('button'); x.id = 'mRpClose'; x.className = 'mX'; x.textContent = '✕'; x.onclick = function () { closeQuestsPanel(); sfx('click'); }; rp.insertBefore(x, rp.firstChild); }
  document.addEventListener('click', sheetClick);
  /* wgProgress: one big headline "Generating Terrain 20%" above the stage list */
  if (typeof wgRenderProgress === 'function') {
    const wr = window.wgRenderProgress;
    window.wgRenderProgress = function () {
      const r = wr.apply(this, arguments);
      try {
        let hl = document.getElementById('wgHead'); if (!hl) { hl = document.createElement('div'); hl.id = 'wgHead'; $('wgBox').insertBefore(hl, $('wgRows')); }
        const cur = WG.stages.find(function (s) { return s.p < 1; }) || WG.stages[WG.stages.length - 1], done = WG.stages.reduce(function (a, s) { return a + s.p; }, 0) / Math.max(1, WG.stages.length);
        hl.innerHTML = '<b>' + esc(cur ? cur.name : 'Validating World') + ' ' + Math.round(done * 100) + '%</b><i><em style="width:' + Math.round(done * 100) + '%"></em></i>';
        const act = $('wgRows').querySelector('.act'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      } catch (e) { /* progress UI only */ }
      return r;
    };
  }
  /* city level → autosave soon */
  let lv = 0; setInterval(function () { if (!STARTED) { lv = 0; return; } const l = cityLevel(); if (lv && l > lv) mobileAutosaveSoon('city level ' + l); lv = l; }, 3000);
  updateFpsCap();
}
