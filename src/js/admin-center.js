'use strict';
/* BLOCK CITY TYCOON — ADMIN CONTROL CENTER (Part 8)
   Hidden by default. F10 = Admin panel · Ctrl+F10 = World generator · Ctrl+Shift+F10 = World debugger (Ctrl+Shift+A still works).
   20 categories, one-click world generation, validator / FIX WORLD, snapshots & rollback, admin presets, stress test,
   benchmark, citizen / vehicle / company inspectors, command console and an admin action log (logs/admin.log). */

/* ---------------- Part 8 state (saved in S.p8) ---------------- */
function newP8() {
  return { world: null, unlockAll: false, companies: [], shareBoost: {}, shareTarget: {}, mods: { demand: 1, supply: 1 }, adminUsed: false, copyOf: '' };
}
function sanitizeP8(src) {
  const p = newP8();
  if (!src || typeof src !== 'object') return p;
  p.unlockAll = !!src.unlockAll; p.adminUsed = !!src.adminUsed;
  p.copyOf = typeof src.copyOf === 'string' ? src.copyOf.slice(0, 40) : '';
  if (src.world && typeof src.world === 'object') {
    const w = src.world, o = {};
    ['seed', 'size', 'population', 'buildings', 'roads', 'companies', 'vehicles', 'health', 'generationVersion'].forEach(function (k) { if (w[k] !== undefined) o[k] = num(w[k], 0, 0, 1e12); });
    ['seedLabel', 'preset', 'mapType', 'sizeName', 'climate', 'status', 'generatedAt'].forEach(function (k) { if (typeof w[k] === 'string') o[k] = w[k].slice(0, 60); });
    o.districts = Array.isArray(w.districts) ? w.districts.slice(0, 120).filter(function (d) { return d && typeof d.name === 'string'; }).map(function (d) { return { name: d.name.replace(/[<>]/g, '').slice(0, 40), type: DTYPES.indexOf(d.type) >= 0 ? d.type : 'RESIDENTIAL', x: num(d.x, 0, 0, 999) | 0, y: num(d.y, 0, 0, 999) | 0 }; }) : [];
    o.cellNames = Array.isArray(w.cellNames) ? w.cellNames.slice(0, 400).map(function (n) { return String(n).replace(/[<>]/g, '').slice(0, 40); }) : [];
    if (w.economy && typeof w.economy === 'object') o.economy = { money: num(w.economy.money, 0, 0, 1e15), budget: num(w.economy.budget, 0, 0, 1e15), tax: num(w.economy.tax, 10, 0, 50), phase: String(w.economy.phase || 'NORMAL').slice(0, 12) };
    if (w.settings && typeof w.settings === 'object') { o.settings = {}; for (const k in w.settings) if (/^[a-zA-Z]{1,20}$/.test(k) && (typeof w.settings[k] === 'number' || typeof w.settings[k] === 'string')) o.settings[k] = typeof w.settings[k] === 'string' ? w.settings[k].slice(0, 40) : w.settings[k]; }
    p.world = o;
  }
  p.companies = (Array.isArray(src.companies) ? src.companies : []).filter(function (c) { return c && /^cx_[a-z0-9]{1,12}$/.test(c.id) && MARKET_SECTORS.indexOf(c.sector) >= 0; }).slice(0, 12).map(function (c) {
    return { id: c.id, name: String(c.name || 'NEW COMPANY').replace(/[<>]/g, '').toUpperCase().slice(0, 24), icon: String(c.icon || '🏢').slice(0, 4), sector: c.sector, color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#adb5bd' };
  });
  ['shareBoost', 'shareTarget'].forEach(function (k) { if (src[k] && typeof src[k] === 'object') for (const id in src[k]) if (/^[a-z_0-9]{2,20}$/.test(id)) p[k][id] = num(src[k][id], k === 'shareBoost' ? 1 : 0.2, k === 'shareBoost' ? 0.05 : 0, k === 'shareBoost' ? 50 : 1); });
  if (src.mods && typeof src.mods === 'object') { p.mods.demand = num(src.mods.demand, 1, 0.2, 5); p.mods.supply = num(src.mods.supply, 1, 0.2, 5); }
  return p;
}
/* Custom companies are registered as AI companies before the save is validated, so their state survives reloads */
function registerCustomCompanies(p8) {
  for (let i = AI_DEFS.length - 1; i >= 0; i--) if (/^cx_/.test(AI_DEFS[i].id)) AI_DEFS.splice(i, 1);
  const list = p8 && Array.isArray(p8.companies) ? sanitizeP8({ companies: p8.companies }).companies : [];
  list.forEach(function (c) {
    AI_DEFS.push({ id: c.id, name: c.name, icon: c.icon, kind: c.sector === 'HOUSING' ? 'dev' : 'rival', zone: c.sector === 'INDUSTRY' ? 3 : c.sector === 'HOUSING' ? 1 : 2, color: c.color, sectors: [c.sector], custom: true });
    AI_DEFAULT_NAMES[c.id] = c.name;
  });
}
function shareBoost(owner) { return S.p8 && S.p8.shareBoost[owner] ? S.p8.shareBoost[owner] : 1; }
/* "Set market share": a controller nudges the company's competitiveness until its share reaches the target */
function shareTargetTick(sector) {
  if (!S.p8) return;
  const sh = SIM.share[sector] || {};
  for (const id in S.p8.shareTarget) {
    const a = aiDef(id) || (id === 'player' ? { sectors: MARKET_SECTORS } : null);
    if (!a || a.sectors.indexOf(sector) < 0) continue;
    const cur = sh[id] || 0, tgt = S.p8.shareTarget[id];
    S.p8.shareBoost[id] = clamp((S.p8.shareBoost[id] || 1) * Math.pow((tgt + 0.02) / (cur + 0.02), 0.35), 0.05, 50);
  }
}
function part8Mods(m) { if (S.p8) { m.demand = (m.demand || 1) * S.p8.mods.demand; m.production *= S.p8.mods.supply; } return m; }

/* ---------------- Admin action log (logs/admin.log on Windows) ---------------- */
const ADM = { open: false, cat: 'wc_world', mode: false, pauseOnOpen: true, prevSpeed: null, log: [], pick: null, sel: null, selV: null, wgPreset: 'balanced', wgCustom: null, search: '', bench: null, stress: null, consoleOut: [], history: [], hi: -1, menuButton: false };
function adminLog(msg) {
  const d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
  const line = '[' + p(d.getHours()) + ':' + p(d.getMinutes()) + '] Admin: ' + String(msg).slice(0, 400);
  ADM.log.push(line); if (ADM.log.length > 300) ADM.log.shift();
  if (S && S.p8) S.p8.adminUsed = true;
  if (S && S.p5) S.p5.admin.used = true;
  if (DESKTOP && BCT.adminLog) { try { BCT.adminLog(line); } catch (e) { /* best effort */ } }
  else { try { const prev = JSON.parse(Store.getItem('bct_admin_log') || '[]'); prev.push(line); Store.setItem('bct_admin_log', JSON.stringify(prev.slice(-300))); } catch (e) { /* storage blocked */ } }
  Log.info(line);
  if (ADM.open) { const el = $('admLogTail'); if (el) el.textContent = ADM.log.slice(-4).join('\n'); }
}

/* ---------------- Open / close ---------------- */
function openAdminCenter(cat) {
  if (!S) return;
  if (PROFILE.pin && !ADMIN.ok) {
    showModal('🛡️ Admin panel — locked', '<p class="small">Enter your admin PIN.</p><input id="admPin" type="password" inputmode="numeric" maxlength="12" class="admInput" autocomplete="off"><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn green" id="admUnlock">Unlock</button></div>');
    const go = function () { if (hashPin($('admPin').value) === PROFILE.pin) { ADMIN.ok = true; closeModal(); openAdminCenter(cat); } else { toast('❌ Wrong PIN', 'bad'); sfx('error'); } };
    $('admUnlock').onclick = go; $('admPin').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    setTimeout(function () { $('admPin').focus(); }, 30);
    return;
  }
  if (cat) ADM.cat = cat;
  if (!ADM.open) {
    ADM.open = true; ADM.mode = true; ADM.menuButton = true;
    const mb = document.querySelector('[data-menu="admin"]'); if (mb) mb.classList.remove('hidden');
    if (STARTED && ADM.pauseOnOpen && S.settings.speed > 0) { ADM.prevSpeed = S.settings.speed; setSpeed(0); }
    adminLog('Opened admin panel');
  }
  $('adminCenter').classList.remove('hidden');
  document.body.classList.add('admOpen');
  renderAdminCenter();
}
function closeAdminCenter() {
  if (!ADM.open) return;
  ADM.open = false;
  $('adminCenter').classList.add('hidden');
  document.body.classList.remove('admOpen');
  if (ADM.prevSpeed !== null && STARTED && S.settings.speed === 0) setSpeed(ADM.prevSpeed);
  ADM.prevSpeed = null;
  refreshTopbar(); if (UI.panel) renderLeft(true);
}
/* Leaving admin mode removes every temporary admin effect; the normal game is exactly as before */
function exitAdminMode() {
  closeAdminCenter();
  ADM.mode = false; S.p5.admin.god = false; S.p5.admin.instant = false; S.debugUnlockAll = false;
  if (WDBG.on) toggleWorldDebug(false);
  ADM.pick = null;
  const mb = document.querySelector('[data-menu="admin"]'); if (mb) mb.classList.add('hidden');
  adminLog('Exited admin mode (free build, instant build, session unlock and debugger off)');
  toast('🛡️ Admin mode off — normal game', 'good');
}

/* ---------------- Layout ---------------- */
const ADM_CATS = [
  ['world', '🌍', 'WORLD'], ['map', '🗺', 'MAP'], ['city', '🏙', 'CITY'], ['buildings', '🏗', 'BUILDINGS'], ['roads', '🛣', 'ROADS'], ['citizens', '👥', 'CITIZENS'], ['traffic', '🚗', 'TRAFFIC'],
  ['economy', '💰', 'ECONOMY'], ['companies', '🏢', 'COMPANIES'], ['utilities', '⚡', 'UTILITIES'], ['environment', '🌳', 'ENVIRONMENT'], ['weather', '🌦', 'WEATHER'], ['events', '🚨', 'EVENTS'],
  ['technology', '🔬', 'TECHNOLOGY'], ['quests', '📋', 'QUESTS'], ['ai', '🤖', 'AI'], ['simulation', '🎮', 'SIMULATION'], ['save', '💾', 'SAVE'], ['debug', '🐞', 'DEBUG'], ['system', '⚙', 'SYSTEM']
];
function ab(act, label, cls, v, extra) { return '<button class="btn small ' + (cls || '') + '" data-ac="' + act + '"' + (v !== undefined ? ' data-v="' + esc(String(v)) + '"' : '') + (extra || '') + '>' + label + '</button>'; }
function aRow(html) { return '<div class="row admRowWrap">' + html + '</div>'; }
function aCard(title, html) { return '<div class="card admCard"><h3>' + title + '</h3>' + html + '</div>'; }
function aInput(id, label, val, act, type) { return '<div class="admRow"><span>' + label + '</span><input class="admInput" id="' + id + '" value="' + esc(String(val)) + '"' + (type ? ' type="' + type + '"' : '') + '>' + ab(act, 'Set', 'blue') + '</div>'; }
function aToggle(act, label, on) { return '<div class="between" style="padding:5px 0"><span>' + label + '</span>' + ab(act, on ? 'ON' : 'OFF', on ? 'green' : '') + '</div>'; }
function aKv(k, v) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v" style="font-size:14px">' + v + '</div></div>'; }
function aVal(id) { const e = $(id); return e ? e.value : ''; }

function renderAdminCenter() {
  const navBtn = function (c) { return '<button class="admNav ' + (ADM.cat === c[0] ? 'on' : '') + '" data-acat="' + c[0] + '"><span>' + c[1] + '</span>' + c[2] + '</button>'; };
  const nav = '<div class="admNavGroup">🌐 WORLD CONTROL CENTER</div>' + WC_CATS.map(navBtn).join('') + '<div class="admNavGroup">🛡️ ADMIN TOOLS</div>' + ADM_CATS.map(navBtn).join('');
  $('admNavList').innerHTML = nav;
  let body = '';
  try { body = ADM.search ? adminSearchHtml(ADM.search) : (ADM_VIEWS[ADM.cat] || ADM_VIEWS.world)(); }
  catch (e) { body = '<p class="neg">Panel error: ' + esc(e.message) + '</p>'; logError('Admin panel', e); }
  $('admBody').innerHTML = body;
  bindAdvisorButtons($('admBody'));
  renderWorldStatusBar();
  $('admLogTail').textContent = ADM.log.slice(-4).join('\n');
  $('admStatus').textContent = (S.city ? S.city.name : '') + ' · ' + seedLabel() + ' · Pop ' + fmt(Math.floor(S.city.population)) + ' · ' + S.buildings.list.length + ' buildings · ' + (STARTED ? (S.settings.speed ? S.settings.speed + '×' : 'paused') : 'main menu');
  $('admPauseBtn').textContent = ADM.pauseOnOpen ? '⏸ Sim paused while open' : '▶ Sim runs while open';
  $('admOut').innerHTML = ADM.consoleOut.slice(-60).map(function (l) { return '<div class="' + l[0] + '">' + esc(l[1]) + '</div>'; }).join('');
  $('admOut').scrollTop = 1e9;
}

/* ---------------- Category views ---------------- */
const ADM_VIEWS = {
  world: function () {
    const cur = S.p8.world;
    let h = aCard('🌍 One-click world generator', '<p class="small">Generates terrain, water, a road hierarchy, named districts, zoning, utilities, homes, businesses, supply chains, transport, services, citizens, jobs, traffic and a balanced economy — then validates, auto-fixes and starts the simulation.</p>' +
      '<div class="admPresets">' + Object.keys(WORLD_PRESETS).map(function (k) { return '<button class="admPreset ' + (ADM.wgPreset === k ? 'on' : '') + '" data-ac="wgPreset" data-v="' + k + '"><b>' + WORLD_PRESETS[k].name + '</b><span>' + WORLD_PRESETS[k].desc + '</span></button>'; }).join('') +
      '<button class="admPreset ' + (ADM.wgPreset === 'custom' ? 'on' : '') + '" data-ac="wgPreset" data-v="custom"><b>🛠 Custom World</b><span>Set every generator parameter yourself.</span></button></div>' +
      '<div class="admRow"><span>World size</span><div class="seg">' + Object.keys(WORLD_SIZES).map(function (k) { return '<button type="button" class="' + ((ADM.wgSize || 'preset') === k ? 'on' : '') + '" data-ac="wgSize" data-v="' + k + '">' + k + ' ' + WORLD_SIZES[k] + '</button>'; }).join('') + '<button type="button" class="' + (!ADM.wgSize ? 'on' : '') + '" data-ac="wgSize" data-v="">PRESET</button></div></div>' +
      '<div class="admRow"><span>City name</span><input class="admInput" id="wgName" value="' + esc(ADM.wgName || 'New Metropolis') + '" maxlength="32"></div>' +
      '<div class="admRow"><span>World seed</span><input class="admInput" id="wgSeed" value="' + esc(ADM.wgSeed || seedLabel(Math.floor(Math.random() * 1000000))) + '" maxlength="12">' + ab('wgDice', '🎲') + '</div>' +
      '<div class="admRow"><span>Save into</span><div class="seg">' + [0, 1, 2, 3, 4].map(function (n) { return '<button type="button" class="' + ((ADM.wgSlot | 0) === n ? 'on' : '') + '" data-ac="wgSlot" data-v="' + n + '">' + (n ? 'CITY 0' + n : 'Current') + '</button>'; }).join('') + '</div></div>' +
      (ADM.wgPreset === 'custom' ? customWorldHtml() : '') +
      aRow('<button class="btn gold big admBig" data-ac="generate">🌍 GENERATE COMPLETE WORLD</button>'));
    if (cur) {
      h += aCard('🗂 World profile', '<div class="grid3">' + aKv('SEED', esc(cur.seedLabel || '') + (S.p8.copyOf ? ' (copy)' : '')) + aKv('PRESET', esc(cur.preset || '')) + aKv('MAP', esc(cur.mapType || '') + ' ' + (cur.size || '') + '²') +
        aKv('POPULATION', fmt(cur.population || 0)) + aKv('BUILDINGS', fmt(cur.buildings || 0)) + aKv('DISTRICTS', (cur.districts || []).length) + aKv('CLIMATE', esc(cur.climate || '')) + aKv('HEALTH', (cur.health || 0) + '%') + aKv('GENERATOR', 'v' + (cur.generationVersion || 1)) + '</div>' +
        '<p class="small" style="margin-top:6px">Districts: ' + (cur.districts || []).map(function (d) { return '<a href="#" data-ac="flyDistrict" data-v="' + d.x + ',' + d.y + '">' + esc(d.name) + '</a>'; }).join(' · ') + '</p>' +
        aRow(ab('regenerate', '🔁 Regenerate same seed') + ab('duplicate', '📄 DUPLICATE WORLD')));
    } else h += aCard('🗂 World profile', '<p class="small">This city was built by hand (not generated).</p>' + aRow(ab('duplicate', '📄 DUPLICATE WORLD')));
    return h;
  },
  map: function () {
    let land = 0, water = 0, rock = 0, forest = 0; const N = MAP.W * MAP.H;
    for (let i = 0; i < N; i++) { const t = MAP.terrain[i]; if (t === TERRAIN.WATER) water++; else if (t === TERRAIN.ROCK) rock++; else land++; if (MAP.nature[i] === 1) forest++; }
    const L = WDBG.layers;
    return aCard('🗺 Map', '<div class="grid3">' + aKv('SIZE', MAP.W + '×' + MAP.H) + aKv('LAND', Math.round(land / N * 100) + '%') + aKv('WATER', Math.round(water / N * 100) + '%') + aKv('STEEP (unbuildable)', Math.round(rock / N * 100) + '%') +
      aKv('FOREST', Math.round(forest / N * 100) + '%') + aKv('DEPOSITS', S.economy.deposits.length) + aKv('UNLOCKED', 'stage ' + S.city.expansion + '/' + maxExpansionFor(S.city.size)) + aKv('MAP TYPE', esc(S.city.mapType)) + aKv('SEED', seedLabel()) + '</div>' +
      aRow(ab('expandAll', '🔓 Unlock all regions') + ab('debugWorld', WDBG.on ? '🧪 WORLD DEBUGGER: ON' : '🧪 WORLD DEBUGGER', WDBG.on ? 'green' : '') + ab('plantTrees', '🌳 Plant 50 trees'))) +
      aCard('🧪 Debugger layers', Object.keys(L).map(function (k) { return aToggle('dbgLayer" data-v="' + k, k, L[k]); }).join(''));
  },
  city: function () {
    return aCard('🏙 City', aInput('acName', 'City name', S.city.name, 'cityName') + aInput('acPop', 'Set population', Math.floor(S.city.population), 'setPop') +
      aRow([100, 1000, 10000, 100000].map(function (n) { return ab('addPop', '+' + fmt(n) + ' citizens', '', n); }).join('')) +
      aInput('acHap', 'Set happiness (0-100)', Math.round(S.city.happiness), 'setHap') + aInput('acRep', 'Reputation (0-100)', Math.round(S.city.reputation), 'setRep') + aInput('acLvl', 'City level (1-20)', cityLevel(), 'setLevel') +
      aRow('<button class="btn gold" data-ac="maxCity">🏙️ MAX CITY</button>' + ab('mayorMax', '🎖 Mayor level MAX') + ab('megaEra', '🌆 Start MEGACITY ERA')));
  },
  buildings: function () {
    const cats = { Residential: ['Residential'], Commercial: ['Commercial'], Industrial: ['Industry', 'Resources', 'Logistics', 'Waste'], Office: ['office', 'bank', 'stockexchange', 'startup'], Tourism: ['hotel', 'museum'],
      Entertainment: ['nightclub', 'cinema', 'gym', 'stadium', 'themepark', 'park', 'plaza'], Technology: ['techcampus', 'datacenter', 'lab', 'university', 'research'], Luxury: ['luxurytower', 'condo', 'skyscraper', 'arcology', 'gourmethq', 'megamall'],
      Infrastructure: ['Utilities'], Transport: ['Transport'], Government: ['Services', 'school', 'socialhousing'], Landmark: ['Landmarks'], 'Mega Project': ['arcology', 'megamall', 'spacecenter', 'megastadium', 'quantumspire'] };
    const cat = ADM.buildCat || 'Residential';
    const list = Object.values(BUILDINGS).filter(function (d) { return !d.hidden && cats[cat].some(function (c) { return d.cat === c || d.id === c; }); });
    let h = aCard('🏗 Admin build menu', '<div class="tabs" style="flex-wrap:wrap;padding:0 0 6px">' + Object.keys(cats).map(function (k) { return '<button class="tab ' + (k === cat ? 'on' : '') + '" data-ac="buildCat" data-v="' + k + '">' + k + '</button>'; }).join('') + '</div>' +
      '<div class="admBuildGrid">' + list.map(function (d) { return '<button class="admBuild" data-ac="adminPlace" data-v="' + d.id + '"><span>' + d.icon + '</span><b>' + esc(d.name) + '</b><i>' + d.w + '×' + d.h + (d.housing ? ' · 🏠' + d.housing : '') + (d.workers ? ' · 💼' + d.workers : '') + '</i></button>'; }).join('') + '</div>');
    h += aCard('⚙ Build modes', aToggle('freeBuild', '🆓 FREE BUILD (no money, unlock rules ignored)', S.p5.admin.god) + aToggle('instantBuild', '⚡ INSTANT BUILD (0 s construction)', S.p5.admin.instant) +
      aRow(ab('maxUpgrade', '⬆ MAX UPGRADE selected building (Level ' + MAX_LEVEL + ')', 'gold') + ab('finishAll', '🏁 Finish all construction') + ab('repairAll', '🔧 Repair all') + ab('fireOut', '🧯 Extinguish fires')) +
      '<p class="small">Selected: ' + (UI.selected ? esc(BUILDINGS[UI.selected.type].name) + ' Lv' + UI.selected.level : 'none — click a building on the map') + '</p>');
    return h;
  },
  roads: function () {
    const rc = mainRoadComp(), by = [0, 0, 0, 0, 0];
    for (let i = 0; i < MAP.roads.length; i++) by[MAP.roads[i]]++;
    return aCard('🛣 Roads', '<div class="grid3">' + aKv('ROAD TILES', fmt(MAP.roadCount)) + aKv('NETWORKS', rc.comps) + aKv('PATH CACHE', MAP.pathCache.size) + aKv('SMALL', by[1]) + aKv('MEDIUM', by[2]) + aKv('LARGE', by[3]) + aKv('HIGHWAY', by[4]) + aKv('TUNNELS', countTunnels()) + aKv('BRIDGES', countBridges()) + '</div>' +
      aRow(ab('connectRoads', '🔗 Connect all road networks', 'gold') + ab('accessRoads', '🚪 Access roads for isolated buildings') + ab('upgradeMain', '⬆ Upgrade main streets to Large') + ab('recalcPaths', '🧭 Recalculate paths')));
  },
  citizens: function () {
    const c = ADM.sel ? AG.citizens.find(function (x) { return x.id === ADM.sel; }) : null;
    let h = aCard('👥 Population', '<div class="grid3">' + aKv('POPULATION', fmt(Math.floor(S.city.population))) + aKv('AGENTS', AG.citizens.length) + aKv('HOMES CAP', fmt(SIM.housingCap || 0)) + aKv('EMPLOYED', Math.round((1 - SIM.unemployment) * 100) + '%') + aKv('HAPPINESS', Math.round(S.city.happiness) + '%') + aKv('TOURISTS', fmt(S.city.tourists)) + '</div>' +
      aRow([100, 1000, 10000, 100000].map(function (n) { return ab('addPop', '+' + fmt(n), '', n); }).join('') + ab('pickCitizen', '🎯 Pick citizen on map', 'blue')));
    h += aCard('🧍 Citizen inspector', c ? citizenAdminHtml(c) : '<p class="small">Pick a citizen on the map or from the list.</p>');
    h += aCard('📋 Citizens (' + AG.citizens.length + ' agents)', '<div class="admList">' + AG.citizens.slice(0, 60).map(function (x) { return '<button class="admLi" data-ac="selCitizen" data-v="' + x.id + '">' + esc(citLabel(x)) + ' · ' + Math.round(x.happiness || 0) + '%</button>'; }).join('') + '</div>');
    return h;
  },
  traffic: function () {
    const v = ADM.selV ? AG.vehicles.find(function (x) { return x.id === ADM.selV; }) : null;
    const stopped = AG.vehicles.filter(function (x) { return x.stopped > 1; }).length;
    let h = aCard('🚗 Traffic', '<div class="grid3">' + aKv('VEHICLES', AG.vehicles.length) + aKv('STOPPED', stopped) + aKv('TRAFFIC', Math.round(SIM.traffic || 0) + '%') + aKv('ACCIDENTS', AG.accidents.length) + aKv('REROUTES', S.p6.stats.reroutes) + aKv('PATH REQ/S', (typeof pathReqRate !== 'undefined' ? pathReqRate : 0).toFixed(1)) + '</div>' +
      aRow(ab('clearTraffic', '🧹 CLEAR TRAFFIC', 'red') + ab('spawnTraffic', '🚙 SPAWN TRAFFIC (+40)', 'gold', 40) + ab('resetRoutes', '↩ RESET ROUTES') + ab('recalcPaths', '🧭 RECALCULATE PATHS') + ab('pickVehicle', '🎯 Pick vehicle on map', 'blue')));
    h += aCard('🚘 Vehicle inspector', v ? vehicleAdminHtml(v) : '<p class="small">Pick a vehicle on the map or from the list.</p>');
    h += aCard('📋 Vehicles', '<div class="admList">' + AG.vehicles.slice(0, 60).map(function (x) { return '<button class="admLi" data-ac="selVehicle" data-v="' + x.id + '">#' + x.id + ' ' + x.type + (x.stopped > 1 ? ' ⛔' : '') + '</button>'; }).join('') + '</div>');
    return h;
  },
  economy: function () {
    return aCard('💰 Money', aRow(ab('money', '+ $1,000', 'gold', 1e3) + ab('money', '+ $100,000', 'gold', 1e5) + ab('money', '+ $1,000,000', 'gold', 1e6) + ab('maxMoney', 'MAX MONEY', 'gold') + ab('resetMoney', 'RESET MONEY', 'red')) +
      aInput('aeMoney', 'Money', Math.floor(S.money), 'setMoney') + aInput('aeBudget', 'Government budget', Math.floor(S.budget), 'setBudget')) +
      aCard('📈 Economy', aInput('aeTax', 'Tax %', S.city.tax, 'setTax') + aInput('aeInfl', 'Inflation % (yearly)', (S.p6.econ.infl * 100).toFixed(1), 'setInfl') + aInput('aeRate', 'Interest rate % (min 1)', (S.p5.econ.rate * 100).toFixed(2), 'setRate') +
        aInput('aeDem', 'Demand multiplier', S.p8.mods.demand, 'setDemand') + aInput('aeSup', 'Supply / production multiplier', S.p8.mods.supply, 'setSupply') +
        '<div class="row admRowWrap">' + Object.keys(ECON_PHASES).map(function (k) { return ab('phase', ECON_PHASES[k].icon + ' ' + k, S.p5.econ.phase === k ? 'gold' : '', k); }).join('') + '</div>' +
        '<p class="small">CPI ' + S.p6.econ.cpi.toFixed(1) + ' · company net ' + signMoney(SIM.pNet || 0) + '/s · budget net ' + signMoney(SIM.bNet || 0) + '/s</p>');
  },
  companies: function () {
    const rows = AI_DEFS.map(function (a) {
      const st = S.ai[a.id] || {}, s = stockOf(a.id), sec = a.sectors[0];
      const sh = SIM.share && SIM.share[sec] ? (SIM.share[sec][a.id] || 0) : 0;
      return '<div class="admCo"><div><b>' + a.icon + ' ' + esc(a.name) + '</b> <span class="tag">' + sec + '</span>' + (st.acquired ? ' <span class="tag r">INACTIVE</span>' : '') + (a.custom ? ' <span class="tag b">CUSTOM</span>' : '') +
        '<div class="small">cash ' + money(st.cash || 0) + ' · share ' + Math.round(sh * 100) + '%' + (S.p8.shareTarget[a.id] !== undefined ? ' → target ' + Math.round(S.p8.shareTarget[a.id] * 100) + '%' : '') + ' · rep ' + Math.round(st.rep || 0) + ' · stock $' + s.price.toFixed(2) + ' · ' + (st.count || 0) + ' buildings</div></div>' +
        '<div class="row admRowWrap">' + ab('coMoney', '+$1M', '', a.id) + ab('coShare', 'Market share…', '', a.id) + ab('coRep', 'Reputation…', '', a.id) + ab('coExpand', 'Force expansion', '', a.id) + ab('coStock', 'Stock price…', '', a.id) + ab('coBankrupt', 'Force bankruptcy', 'red', a.id) + ab('coDelete', 'Delete', 'red', a.id) + '</div></div>';
    }).join('');
    return aCard('🏢 Companies', rows) +
      aCard('➕ Create company', '<div class="admRow"><span>Name</span><input class="admInput" id="coName" maxlength="24" value="NEW VENTURES"></div><div class="admRow"><span>Sector</span><select id="coSector" class="admInput">' + ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY', 'INDUSTRY', 'HOUSING'].map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div><div class="admRow"><span>Icon</span><input class="admInput" id="coIcon" maxlength="4" value="🏢"></div>' + aRow(ab('coCreate', 'Create Company', 'gold'))) +
      aCard('📈 Stock market', aRow(ab('marketBoom', '🚀 Market Boom', 'green') + ab('marketCrash', '📉 Market Crash', 'red')) + '<p class="small">NPC stocks: ' + NPC_STOCKS.map(function (s) { return s.name + ' $' + S.companies.stocks[s.id].price.toFixed(2); }).join(' · ') + '</p>');
  },
  utilities: function () {
    return aCard('⚡ Utilities', '<div class="grid3">' + aKv('POWER', Math.round(SIM.powerGen) + ' / ' + Math.round(SIM.powerUse) + ' MW') + aKv('WATER', Math.round(SIM.waterGen) + ' / ' + Math.round(SIM.waterUse)) + aKv('SEWAGE & WASTE', Math.round(SIM.wasteCap || 0) + ' / ' + Math.round(SIM.wasteGen || 0)) +
      aKv('POWER RATIO', Math.round(SIM.powerRatio * 100) + '%') + aKv('WATER RATIO', Math.round(SIM.waterRatio * 100) + '%') + aKv('UNPOWERED', S.buildings.list.filter(function (b) { return bdef(b).power < 0 && !b._powered; }).length) + '</div>' +
      aRow(ab('autoPower', '⚡ Auto-connect power network', 'gold') + ab('autoWater', '💧 Auto-connect water network', 'gold') + ab('autoWaste', '🗑 Add sewage & waste capacity')));
  },
  environment: function () {
    return aCard('🌳 Environment', '<div class="grid3">' + aKv('POLLUTION', Math.round(S.city.pollution)) + aKv('WASTE', fmt(S.city.waste)) + aKv('PARKS', MAP.lists.parks.length) + '</div>' +
      aRow(ab('clearPollution', '🧼 Clear pollution', 'green') + ab('clearWaste', '🗑 Clear waste') + ab('plantTrees', '🌳 Plant 50 trees') + ab('addParks', '🏞 Add 10 parks')));
  },
  weather: function () {
    return aCard('🌦 Weather', aRow(WEATHER_TYPES.map(function (w) { return ab('weather', { clear: '☀️', cloudy: '☁️', rain: '🌧', storm: '⛈', snow: '❄️', fog: '🌫', heatwave: '🔥' }[w] + ' ' + w, FX.weather === w ? 'gold' : '', w); }).join(''))) +
      aCard('🕒 Time', aRow([['06:00', 6], ['12:00', 12], ['18:00', 18], ['00:00', 0]].map(function (t) { return ab('hour', t[0], '', t[1]); }).join('')) +
        aInput('awHour', 'Set hour (0-23)', Math.floor(gameHour()), 'setHour') + aInput('awDay', 'Set day', gameDay(), 'setDay') + aInput('awYear', 'Set year', gameYear(), 'setYear') +
        aRow(SEASONS.map(function (s, i) { return ab('season', s.icon + ' ' + s.name, seasonIndex() === i ? 'gold' : '', i); }).join('')) +
        '<p class="small">Day ' + gameDay() + ' · ' + currentSeason().name + ' · Year ' + gameYear() + ' · ' + pad2(Math.floor(gameHour())) + ':00</p>');
  },
  events: function () {
    return aCard('🚨 Disasters', aRow(DISASTERS.map(function (d) { return ab('disaster', d.icon + ' ' + d.name, '', d.id); }).join(''))) +
      aCard('🔥 Crises', aRow(Object.keys(CRISIS6).map(function (k) { return ab('crisis6', CRISIS6[k].icon + ' ' + CRISIS6[k].title.replace(/^\S+\s/, ''), '', k); }).join('') + CRISES.map(function (c) { return ab('crisis', c.icon + ' ' + c.name, '', c.id); }).join(''))) +
      aCard('🎲 Dynamic & world events', aRow(DYN_EVENTS.map(function (c) { return ab('dyn', c.icon + ' ' + c.name, '', c.id); }).join('') + WORLD_EVENTS.map(function (e) { return ab('world', e.icon + ' ' + e.name, '', e.id); }).join(''))) +
      aCard('🛑 Random events', aToggle('noEvents', 'Disable Random Events (crises, disasters, accidents)', S.p5.admin.noEvents) + aRow(ab('endEvents', 'End all active events', 'red')));
  },
  technology: function () {
    const n = TECH_LIST.filter(function (t) { return hasTech(t.id); }).length;
    return aCard('🔬 Technology', '<div class="grid3">' + aKv('RESEARCHED', n + ' / ' + TECH_LIST.length) + aKv('FUTURE TECH', 'Lv ' + S.p6.future) + aKv('RP', fmt(S.research.rp)) + '</div>' +
      aRow('<button class="btn gold" data-ac="unlockTech">🔬 UNLOCK ALL TECHNOLOGY</button>' + ab('unlockTechNg', '🧪 incl. New Game+ tech (test mode)') + ab('future10', '♾ +10 future technologies') + ab('rp', '+100K RP', '', 1e5)));
  },
  quests: function () {
    const q = S.p6.dq;
    return aCard('📋 Quests', '<p class="small">Active: ' + (q.active.length ? q.active.map(function (a) { const T = DQ_TEMPLATES.find(function (x) { return x.id === a.tpl; }); return T ? T.icon + ' ' + T.title : a.tpl; }).join(' · ') : 'none') + ' — done ' + q.done + ', failed ' + q.failed + '</p>' +
      aRow(ab('questGen', 'Generate Quest', 'gold') + ab('questGen10', 'Generate 10 Quests') + ab('questComplete', 'Complete Quest', 'green') + ab('questFail', 'Fail Quest', 'red') + ab('questClear', 'Clear Quests'))) +
      aCard('🏅 Achievements', '<p class="small">' + ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; }).length + ' / ' + ACHIEVEMENTS.length + ' unlocked</p>' + aRow(ab('achAll', 'Unlock All Achievements', 'gold') + ab('achReset', 'Reset Achievements', 'red')));
  },
  ai: function () {
    return aCard('🤖 AI', '<p class="small">Rival companies build where demand is not covered, close shops after 180 s of losses, re-found after bankruptcy and fight for market share. Developers build homes in zoned land.</p>' +
      aRow(ab('aiExpand', '🏗 Run AI expansion ×10', 'gold') + ab('aiCash', '💵 Give every AI company $500K') + ab('aiTick', '⏩ Simulate AI for 5 minutes')) +
      '<p class="small">Developers: ' + AI_DEFS.filter(function (a) { return a.kind === 'dev'; }).map(function (a) { return a.icon + ' ' + esc(a.name) + ' ' + money((S.ai[a.id] || {}).cash || 0); }).join(' · ') + '</p>');
  },
  simulation: function () {
    const b = ADM.bench, st = ADM.stress;
    return aCard('🎮 Simulation', aRow(SIM_SPEEDS.map(function (sp) { return ab('speed', sp ? sp + '×' : '⏸', S.settings.speed === sp ? 'gold' : '', sp); }).join('')) +
      aToggle('freeze', '🧊 Freeze economy', S.p5.admin.freeze) + aToggle('freeBuild', '🆓 FREE BUILD', S.p5.admin.god) + aToggle('instantBuild', '⚡ INSTANT BUILD', S.p5.admin.instant)) +
      aCard('⏱ SIMULATION BENCHMARK', aRow(ab('benchmark', '▶ Run benchmark (6 s)', 'gold')) + (b ? benchHtml(b) : '')) +
      aCard('⚡ STRESS TEST', '<p class="small">Raises NPC & traffic density to the maximum, boosts the simulated population to 100,000 (far citizens use the statistical simulation, near ones are agents) and runs 10 s at 10× speed. A snapshot is taken first; everything is restored afterwards.</p>' + aRow(ab('stressTest', '⚡ START STRESS TEST', 'red')) + (st ? benchHtml(st) : ''));
  },
  save: function () {
    const snaps = snapshotIndex();
    return aCard('📸 World snapshots', aRow(ab('snapCreate', '📸 CREATE WORLD SNAPSHOT', 'gold')) + (snaps.length ? '<div class="admList">' + snaps.map(function (s) {
      return '<div class="admCo"><div><b>' + esc(s.id) + '</b> ' + esc(s.name) + '<div class="small">' + esc(s.city) + ' · pop ' + fmt(s.pop) + ' · ' + new Date(s.created).toLocaleString() + '</div></div><div class="row">' + ab('snapRollback', '⏪ ROLLBACK WORLD', 'blue', s.id) + ab('snapDelete', '🗑', 'red', s.id) + '</div></div>';
    }).join('') + '</div>' : '<p class="small">No snapshots yet.</p>')) +
      aCard('🎛 Admin presets', '<div class="admRow"><span>Preset name</span><input class="admInput" id="apName" maxlength="32" value="My Test"></div>' + aRow(ab('presetSave', '💾 Create / Save Preset', 'gold')) +
        '<div class="admList">' + Object.keys(allAdminPresets()).map(function (k) { const p = allAdminPresets()[k]; return '<div class="admCo"><div><b>' + esc(k) + '</b>' + (p.builtin ? ' <span class="tag">BUILT-IN</span>' : '') + '<div class="small">' + esc(p.desc || presetSummary(p)) + '</div></div><div class="row">' + ab('presetLoad', 'Load', 'green', k) + (p.builtin ? '' : ab('presetDelete', 'Delete', 'red', k)) + '</div></div>'; }).join('') + '</div>') +
      aCard('💾 World files', aRow(ab('saveNow', '💾 Save now', 'green') + ab('exportWorld', '📤 EXPORT WORLD') + ab('importWorld', '📥 IMPORT WORLD') + ab('duplicate', '📄 DUPLICATE WORLD') + ab('restore', '♻️ Restore backup')));
  },
  debug: function () {
    const h = worldHealth(), prof = Game.prof || {};
    return aCard('❤️ WORLD HEALTH', healthHtml(h)) +
      aCard('✅ World validator', aRow(ab('validate', '✅ Run validator', 'gold') + '<button class="btn gold" data-ac="fixWorld">🔧 FIX WORLD</button>' + ab('debugWorld', WDBG.on ? '🧪 WORLD DEBUGGER: ON' : '🧪 WORLD DEBUGGER', WDBG.on ? 'green' : '')) + (ADM.lastValidation ? validationHtml(ADM.lastValidation) : '') + (ADM.lastFix ? '<p class="small">' + ADM.lastFix.map(esc).join('<br>') + '</p>' : '')) +
      aCard('⏱ System timings', '<div class="grid3">' + Object.keys(prof).map(function (k) { return aKv(esc(k), prof[k].ms.toFixed(2) + ' ms'); }).join('') + aKv('Renderer', (PERF.renderMs || 0).toFixed(2) + ' ms') + '</div>') +
      aCard('🧾 Error log (' + ERRLOG.length + ')', ERRLOG.length ? ERRLOG.slice(0, 20).map(function (e) { return '<div class="small">' + e.t + ' <b>' + esc(e.where) + '</b>: ' + esc(e.msg) + '</div>'; }).join('') : '<p class="small">No errors. 🎉</p>') +
      aCard('📜 Admin log', '<pre class="admPre">' + esc(ADM.log.slice(-40).join('\n')) + '</pre>');
  },
  system: function () {
    return aCard('⚙ System', aToggle('pauseOnOpen', '⏸ Pause the simulation while the admin panel is open', ADM.pauseOnOpen) +
      '<p class="small">Admin mode is hidden from normal players and must be enabled first (⚙️ Settings → ENABLE ADMIN MODE, or <b>Ctrl+Alt+F10</b>). Then: <b>F10</b> World Control Center · <b>Ctrl+F10</b> world generator · <b>Ctrl+Shift+F10</b> world debugger · <b>Ctrl+Shift+A</b> admin panel.</p>' + aToggle('p9_adminMode', '🛡️ ADMIN MODE ENABLED on this device', adminModeEnabled()) +
      aRow(ab('exitAdmin', '🚪 EXIT ADMIN MODE', 'red') + ab('openLogs', '📜 Open logs folder') + ab('classicAdmin', '🛡️ Classic admin tools'))) +
      aCard('🔐 Admin PIN', '<p class="small">' + (PROFILE.pin ? 'A PIN protects the admin panel.' : 'No PIN set — anyone on this device can open the admin panel.') + '</p><div class="admRow"><span>New PIN (4-12 digits)</span><input class="admInput" id="acPin" type="password" inputmode="numeric" maxlength="12">' + ab('setPin', 'Set PIN', 'green') + '</div>' + (PROFILE.pin ? aRow(ab('clearPin', 'Remove PIN', 'red')) : '')) +
      aCard('ℹ️ Build', '<p class="small">BLOCK CITY TYCOON v' + GAME_VERSION + ' · save v' + SAVE_VERSION + ' · world generator v' + WORLDGEN_VERSION + ' · ' + (DESKTOP ? 'Windows desktop' : 'browser') + '</p>');
  }
};
function customWorldHtml() {
  const c = ADM.wgCustom || (ADM.wgCustom = Object.assign({}, WG_DEFAULT));
  const sl = function (k, label) { return '<div class="admRow"><span>' + label + '</span><input type="range" min="0" max="2" step="0.1" data-wgc="' + k + '" value="' + c[k] + '"><b class="admRange">' + Number(c[k]).toFixed(1) + '</b></div>'; };
  const sel = function (k, label, vals) { return '<div class="admRow"><span>' + label + '</span><select class="admInput" data-wgc="' + k + '">' + vals.map(function (v) { return '<option value="' + v + '"' + (String(c[k]) === String(v) ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>'; };
  return '<div class="admCustom">' + sel('size', 'Map size', Object.keys(WORLD_SIZES)) + sel('mapType', 'Terrain', Object.keys(MAP_TYPES)) + sel('coast', 'Coast', ['none', 'side', 'islands']) +
    sl('water', 'Water') + sl('mountains', 'Mountain density') + sl('rivers', 'River density') + sl('forest', 'Forest density') + sl('roadDensity', 'Road density') + sl('buildingDensity', 'Building density') +
    sl('popDensity', 'Population density') + sl('industry', 'Industry density') + sl('tourism', 'Tourism density') + sl('traffic', 'Traffic density') +
    sel('infrastructure', 'Starting infrastructure', ['basic', 'standard', 'green', 'advanced']) + sl('economy', 'Economy strength') + sl('disasters', 'Disaster frequency') +
    sel('weather', 'Weather', ['auto', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'heatwave']) + sel('climate', 'Climate', ['temperate', 'cold', 'tropical', 'arid']) + '</div>';
}
function citizenAdminHtml(c) {
  citizenProfile(c);
  const job = citizenJob(c), home = MAP.byId.get(c.home), work = c.work ? MAP.byId.get(c.work) : null, dest = c.target ? citizenBuilding(c.target) : null;
  const row = function (k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; };
  return row('ID', '#' + c.id + (c.tourist ? ' (tourist)' : '')) + row('Age', c.age) + row('Education', EDU_LEVELS[c.edu] || c.edu) + row('Income', money(job.income || 0) + '/month' + (c.incomeOverride !== undefined ? ' (admin)' : '')) + row('Job', work ? esc(BUILDINGS[work.type].name) + ' (' + esc(districtName(work.x, work.y)) + ')' : 'unemployed') +
    row('Home', home ? esc(BUILDINGS[home.type].name) + ' (' + esc(districtName(home.x, home.y)) + ')' : '⚠ none') + row('Happiness', Math.round(c.happiness || 0) + '%') +
    row('Needs', 'food ' + Math.round(c.needs.food) + ' · fun ' + Math.round(c.needs.fun) + ' · shop ' + Math.round(c.needs.shopping) + ' · energy ' + Math.round(c.energy)) + row('State', esc(c.state || '') + (c.driving ? ' (driving)' : '') + (c.inside ? ' (inside)' : '')) +
    row('Destination', dest ? esc(BUILDINGS[dest.type].name) : '—') +
    aRow(ab('citTeleport', '📍 Teleport to camera', '', c.id) + ab('citJob', '💼 Give Job', '', c.id) + ab('citIncome', '💵 Set Income…', '', c.id) + ab('citHap', '😊 Set Happiness…', '', c.id) + ab('citFly', '🎥 Show', '', c.id));
}
function vehicleAdminHtml(v) {
  const row = function (k, val) { return '<div class="between small"><span>' + k + '</span><b>' + val + '</b></div>'; };
  const origin = v.path && v.path.length ? v.path[0] : -1, dst = v.dest && v.dest.type ? BUILDINGS[v.dest.type].name : (v.path ? 'tile ' + v.path[v.path.length - 1] : '—');
  return row('Vehicle', '#' + v.id + ' ' + v.type + (v.ev ? ' (EV)' : '')) + row('Owner', v.passenger ? 'citizen #' + v.passenger.id : v.cargo ? esc(v.cargo.from || 'logistics') : v.siren ? 'city services' : 'ambient') +
    row('Origin', origin >= 0 ? (origin % MAP.W) + ',' + ((origin / MAP.W) | 0) + ' ' + esc(districtName(origin % MAP.W, (origin / MAP.W) | 0)) : '—') + row('Destination', esc(dst)) +
    row('Speed', (v.speed || 0).toFixed(1) + ' / ' + (v.maxSpeed || 0).toFixed(1)) + row('Route', (v.path ? v.path.length : 0) + ' tiles · segment ' + v.seg) + row('Traffic state', v.stopped > 3 ? 'stuck (' + v.stopped.toFixed(1) + ' s)' : v.stopped > 0.5 ? 'waiting' : 'moving') +
    (v.cargo ? row('Cargo', v.cargo.qty + ' × ' + esc(v.cargo.item)) : '') +
    aRow(ab('vehTeleport', '📍 Teleport', '', v.id) + ab('vehRoute', '↩ Reset Route', '', v.id) + ab('vehRemove', '🗑 Remove Vehicle', 'red', v.id) + ab('vehFly', '🎥 Show', '', v.id));
}
function benchHtml(b) {
  if (b.running) return '<p class="small">⏳ Running… ' + Math.round(b.progress * 100) + '%</p>';
  const row = function (k, v) { return '<div class="between small"><span>' + k + '</span><b>' + v + '</b></div>'; };
  return '<div class="admBench">' + (b.title ? '<b>' + esc(b.title) + '</b>' : '') + row('Average FPS', b.fps.toFixed(1) + ' (min ' + b.minFps.toFixed(0) + ')') + row('Simulation TPS', b.tps.toFixed(1)) + row('Citizen update time', b.cit.toFixed(2) + ' ms') +
    row('Traffic update time', b.traffic.toFixed(2) + ' ms') + row('Economy update time', b.econ.toFixed(2) + ' ms') + row('Renderer time', b.render.toFixed(2) + ' ms') + row('Frame time', b.frame.toFixed(2) + ' ms') + row('Memory estimate', b.mem) +
    row('Entities', fmt(b.entities) + ' (citizens ' + b.citizens + ', vehicles ' + b.vehicles + ', buildings ' + b.buildings + ')') + (b.population ? row('Simulated population', fmt(b.population)) : '') + (b.verdict ? '<p class="small" style="margin-top:4px">' + esc(b.verdict) + '</p>' : '') + '</div>';
}
function countTunnels() { let n = 0; for (let i = 0; i < MAP.roads.length; i++) if (isTunnel(i)) n++; return n; }
function countBridges() { let n = 0; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && MAP.nature[i] === 2) n++; return n; }

/* ---------------- Search ---------------- */
function adminSearchHtml(q) {
  q = q.toLowerCase();
  const out = [];
  if (typeof p10SearchHtml === 'function') Array.prototype.push.apply(out, p10SearchHtml(q));      // Part 10: feature search (e.g. "traffic")
  Object.keys(ADM_COMMANDS).filter(function (k) { return k.toLowerCase().indexOf(q) >= 0; }).slice(0, 12).forEach(function (k) { out.push('<button class="admLi" data-ac="runCmd" data-v="' + k + '">⌨ ' + k + ' — ' + esc(ADM_COMMANDS[k].help) + '</button>'); });
  ADM_CATS.filter(function (c) { return c[2].toLowerCase().indexOf(q) >= 0; }).forEach(function (c) { out.push('<button class="admLi" data-acat="' + c[0] + '">' + c[1] + ' ' + c[2] + '</button>'); });
  Object.values(BUILDINGS).filter(function (d) { return !d.hidden && d.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 12).forEach(function (d) { out.push('<button class="admLi" data-ac="adminPlace" data-v="' + d.id + '">🏗 Build ' + d.icon + ' ' + esc(d.name) + '</button>'); });
  AG.citizens.filter(function (c) { return String(c.id) === q.replace('#', '') || citLabel(c).toLowerCase().indexOf(q) >= 0; }).slice(0, 10).forEach(function (c) { out.push('<button class="admLi" data-ac="selCitizen" data-v="' + c.id + '">👤 ' + esc(citLabel(c)) + '</button>'); });
  AI_DEFS.filter(function (a) { return a.name.toLowerCase().indexOf(q) >= 0; }).forEach(function (a) { out.push('<button class="admLi" data-acat="companies">🏢 ' + a.icon + ' ' + esc(a.name) + '</button>'); });
  districtCenters().filter(function (d) { return d.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 10).forEach(function (d) { out.push('<button class="admLi" data-ac="flyDistrict" data-v="' + Math.round(d.x) + ',' + Math.round(d.y) + '">📍 ' + esc(d.name) + '</button>'); });
  return aCard('🔎 Search results for "' + esc(q) + '"', out.length ? '<div class="admList">' + out.join('') + '</div>' : '<p class="small">Nothing found.</p>');
}

/* ---------------- Actions ---------------- */
function admRe(msg, cls) { if (msg) { toast('🛡️ ' + msg, cls || 'good'); adminLog(msg); } refreshTopbar(); if (ADM.open) renderAdminCenter(); }
let ADM_PROMPT_VALUE = '';
function citLabel(c) { citizenProfile(c); return '#' + c.id + ' · ' + (c.tourist ? 'tourist' : 'age ' + c.age) + ' · ' + citizenJob(c).title; }
function admNum(v, def) { const n = Number(String(v).replace(/[, $_]/g, '')); return isFinite(n) ? n : def; }
function flyToTile(x, y, z) { UI.camFly = null; CAM.x = (x + 0.5) * TILE; CAM.y = (y + 0.5) * TILE; if (z) CAM.zoom = z; clampCamera(); }

function adminDo(a, v, el) {
  const n = Number(v);
  switch (a) {
    /* world */
    case 'wgPreset': ADM.wgPreset = v; return renderAdminCenter();
    case 'wgSize': ADM.wgSize = v || null; return renderAdminCenter();
    case 'wgSlot': ADM.wgSlot = n; return renderAdminCenter();
    case 'wgDice': ADM.wgSeed = seedLabel(Math.floor(Math.random() * 1000000)); return renderAdminCenter();
    case 'generate': return adminGenerate();
    case 'regenerate': { const w = S.p8.world; if (!w) return; ADM.wgSeed = w.seedLabel; ADM.wgPreset = WORLD_PRESETS[w.preset] ? w.preset : 'custom'; if (w.settings) ADM.wgCustom = Object.assign({}, WG_DEFAULT, w.settings); ADM.wgSize = w.sizeName || null; return adminGenerate(); }
    case 'duplicate': return duplicateWorld();
    case 'flyDistrict': { const p = String(v).split(','); closeAdminCenter(); flyToTile(+p[0], +p[1], 0.9); return; }
    /* map */
    case 'expandAll': S.city.expansion = maxExpansionFor(S.city.size); onMapChanged(); return admRe('All regions unlocked');
    case 'debugWorld': toggleWorldDebug(); return renderAdminCenter();
    case 'dbgLayer': WDBG.layers[v] = !WDBG.layers[v]; return renderAdminCenter();
    case 'plantTrees': { let k = 0; for (let t = 0; t < 400 && k < 50; t++) { const x = randInt(0, MAP.W - 1), y = randInt(0, MAP.H - 1), i = idx(x, y); if (!MAP.occ[i] && !MAP.roads[i] && MAP.nature[i] === 0 && MAP.terrain[i] !== TERRAIN.WATER && inUnlocked(x, y)) { MAP.nature[i] = 1; k++; } } MAP.groundDirty = true; return admRe('Planted ' + k + ' trees'); }
    /* city */
    case 'cityName': { const nm = aVal('acName').replace(/[<>]/g, '').trim().slice(0, 32); if (nm) S.city.name = nm; return admRe('City renamed → ' + S.city.name); }
    case 'setPop': return admSetPop(admNum(aVal('acPop'), S.city.population));
    case 'addPop': return admAddPop(n);
    case 'setHap': S.city.happiness = clamp(admNum(aVal('acHap'), 60), 0, 100); AG.citizens.forEach(function (c) { c.happiness = S.city.happiness; }); return admRe('Happiness → ' + Math.round(S.city.happiness) + '%');
    case 'setRep': S.city.reputation = clamp(admNum(aVal('acRep'), 50), 0, 100); return admRe('Reputation → ' + Math.round(S.city.reputation));
    case 'setLevel': { const x = clamp(admNum(aVal('acLvl'), 1) | 0, 1, 20); S.city.peakPop = Math.max(S.city.peakPop, CITY_LEVEL_POP[x - 1]); return admRe('City level → ' + cityLevel()); }
    case 'maxCity': return maxCity();
    case 'mayorMax': S.p6.mayorLv = 50; S.p6.xp = xpForLevel(50); return admRe('Mayor level → MAX (50)');
    case 'megaEra': S.p6.mega.era = true; return admRe('MEGACITY ERA started');
    /* buildings */
    case 'buildCat': ADM.buildCat = v; return renderAdminCenter();
    case 'adminPlace': { const d = BUILDINGS[v]; if (!d) return; S.debugUnlockAll = true; S.p5.admin.god = true; ADM.search = ''; closeAdminCenter(); if (!STARTED) { toast('Start or continue a city first', 'bad'); return; } startPlacing(d); adminLog('Admin build: placing ' + d.name + ' (free)'); return; }
    case 'freeBuild': S.p5.admin.god = !S.p5.admin.god; if (S.p5.admin.god) S.debugUnlockAll = true; return admRe('FREE BUILD ' + (S.p5.admin.god ? 'ON' : 'OFF'));
    case 'instantBuild': S.p5.admin.instant = !S.p5.admin.instant; return admRe('INSTANT BUILD ' + (S.p5.admin.instant ? 'ON' : 'OFF'));
    case 'maxUpgrade': { const b = UI.selected; if (!b) return admRe('Select a building on the map first', 'bad'); b.built = true; b.progress = 1; b.upg = 0; b.level = MAX_LEVEL; onMapChanged(); renderBottomInfo(); return admRe(BUILDINGS[b.type].name + ' → Level ' + MAX_LEVEL); }
    case 'finishAll': { let k = 0; S.buildings.list.forEach(function (b) { if (!b.built || b.upg > 0) { if (b.upg > 0) { b.level = Math.min(MAX_LEVEL, b.level + 1); b.upg = 0; } b.built = true; b.progress = 1; k++; } }); onMapChanged(); return admRe('Finished ' + k + ' construction site(s)'); }
    case 'repairAll': S.buildings.list.forEach(function (b) { b.damaged = 0; b.repair = 0; }); return admRe('All buildings repaired');
    case 'fireOut': S.buildings.list.forEach(function (b) { b.fire = 0; b._truck = false; }); return admRe('Fires extinguished');
    /* roads */
    case 'connectRoads': { const k = wgConnectRoads(); return admRe('Connected ' + k + ' road network(s)'); }
    case 'accessRoads': { let k = 0; S.buildings.list.forEach(function (b) { const d = bdef(b); if (!d.noRoad && b._entry < 0 && wgSpurRoad(b.x, b.y, d)) k++; }); onMapChanged(); return admRe('Built ' + k + ' access road(s)'); }
    case 'upgradeMain': { let k = 0; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] === 2) { MAP.roads[i] = 3; k++; } onMapChanged(); return admRe('Upgraded ' + k + ' road tiles to Large'); }
    case 'recalcPaths': return recalcAllPaths();
    /* citizens */
    case 'pickCitizen': ADM.pick = 'citizen'; closeAdminCenter(); toast('🎯 Click a citizen on the map', ''); return;
    case 'pickVehicle': ADM.pick = 'vehicle'; closeAdminCenter(); toast('🎯 Click a vehicle on the map', ''); return;
    case 'selCitizen': ADM.sel = n; ADM.search = ''; ADM.cat = 'citizens'; return renderAdminCenter();
    case 'selVehicle': ADM.selV = n; ADM.cat = 'traffic'; return renderAdminCenter();
    case 'citTeleport': { const c = AG.citizens.find(function (x) { return x.id === n; }); if (!c) return; if (c.driving) return admRe('Citizen is driving — try again', 'bad'); c.inside = 0; c.x = CAM.x; c.y = CAM.y; c.path = null; c.pending = true; return admRe('Citizen #' + n + ' teleported'); }
    case 'citJob': { const c = AG.citizens.find(function (x) { return x.id === n; }); const jobs = MAP.lists.jobs.filter(function (b) { return b._op && b.workers > 0; }); if (!c || !jobs.length) return admRe('No job available', 'bad'); const b = pick(jobs); c.work = b.id; if (c.mem) c.mem.work = b.id; return admRe('Citizen #' + n + ' now works at ' + BUILDINGS[b.type].name); }
    case 'citIncome': { const c = AG.citizens.find(function (x) { return x.id === n; }); if (!c) return; admPromptAsk('💵 Set income', 'Monthly income for citizen #' + n, Math.round(citizenJob(c).income || 2000), function (val) { c.incomeOverride = clamp(admNum(val, 2000), 0, 1e7); c.money = Math.max(c.money, c.incomeOverride / 10); admRe('Citizen #' + n + ' income → ' + money(c.incomeOverride) + '/month'); }); return; }
    case 'citHap': { const c = AG.citizens.find(function (x) { return x.id === n; }); if (!c) return; admPromptAsk('😊 Set happiness', 'Happiness 0-100 for citizen #' + n, Math.round(c.happiness || 60), function (val) { const hv = clamp(admNum(val, 60), 0, 100); c.happiness = hv; ['food', 'fun', 'shopping', 'work', 'housing'].forEach(function (k) { c.needs[k] = hv; }); c.energy = Math.max(c.energy, hv); admRe('Citizen #' + n + ' happiness → ' + hv); }); return; }
    case 'citFly': { const c = AG.citizens.find(function (x) { return x.id === n; }); if (c) { closeAdminCenter(); CAM.x = c.x; CAM.y = c.y; CAM.zoom = 1.6; } return; }
    /* traffic */
    case 'clearTraffic': { const k = AG.vehicles.length; while (AG.vehicles.length) removeVehicle(AG.vehicles.length - 1, false); AG.accidents.forEach(function (x) { MAP.blocked[x.tile] = 0; }); AG.accidents.length = 0; MAP.pathCache.clear(); return admRe('Cleared ' + k + ' vehicles'); }
    case 'spawnTraffic': return admSpawnTraffic(n || 40);
    case 'resetRoutes': { let k = 0; AG.vehicles.forEach(function (x) { x.stopped = 0; x.ghost = 0; }); AG.citizens.forEach(function (c) { if (!c.driving && c.path) { c.path = null; c.pending = true; k++; } }); MAP.pathCache.clear(); return admRe('Routes reset (' + k + ' citizens re-plan)'); }
    case 'vehTeleport': { const v2 = AG.vehicles.find(function (x) { return x.id === n; }); if (!v2) return; const roads = []; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i] && MAP.comp[i] === mainRoadComp().main) roads.push(i); const dest = v2.dest && v2.dest._entry >= 0 ? v2.dest._entry : pick(roads); const p = roadPath(pick(roads), dest); if (!p || p.length < 2) return admRe('No route', 'bad'); const idxv = AG.vehicles.indexOf(v2); removeVehicle(idxv, false); const nv = makeVehicle(v2.type, p, { dest: v2.dest, cargo: v2.cargo, ambient: v2.ambient, route: v2.route }); ADM.selV = nv ? nv.id : null; return admRe('Vehicle teleported'); }
    case 'vehRoute': { const v2 = AG.vehicles.find(function (x) { return x.id === n; }); if (!v2) return; resetVehicleRoute(v2); return admRe('Vehicle #' + n + ' route reset'); }
    case 'vehRemove': { const i = AG.vehicles.findIndex(function (x) { return x.id === n; }); if (i >= 0) removeVehicle(i, false); ADM.selV = null; return admRe('Vehicle #' + n + ' removed'); }
    case 'vehFly': { const v2 = AG.vehicles.find(function (x) { return x.id === n; }); if (v2) { closeAdminCenter(); CAM.x = v2.x; CAM.y = v2.y; CAM.zoom = 1.6; } return; }
    /* economy */
    case 'money': S.money = Math.min(MONEY_CAP, S.money + n); return admRe('+' + money(n));
    case 'maxMoney': S.money = MONEY_CAP; S.budget = MONEY_CAP; return admRe('MAX MONEY');
    case 'resetMoney': S.money = 0; return admRe('Money reset to $0');
    case 'setMoney': S.money = clamp(admNum(aVal('aeMoney'), S.money), 0, MONEY_CAP); return admRe('Money → ' + money(S.money));
    case 'setBudget': S.budget = clamp(admNum(aVal('aeBudget'), S.budget), 0, MONEY_CAP); return admRe('Budget → ' + money(S.budget));
    case 'setTax': S.city.tax = clamp(Math.round(admNum(aVal('aeTax'), S.city.tax)), 0, MAX_TAX); return admRe('Tax → ' + S.city.tax + '%');
    case 'setInfl': S.p6.econ.infl = clamp(admNum(aVal('aeInfl'), 2) / 100, -0.1, 0.5); return admRe('Inflation → ' + (S.p6.econ.infl * 100).toFixed(1) + '%');
    case 'setRate': S.p5.econ.rate = clamp(admNum(aVal('aeRate'), 5) / 100, 0.01, 0.15); return admRe('Interest → ' + (S.p5.econ.rate * 100).toFixed(2) + '% (floor 1%)');
    case 'setDemand': S.p8.mods.demand = clamp(admNum(aVal('aeDem'), 1), 0.2, 5); return admRe('Demand ×' + S.p8.mods.demand);
    case 'setSupply': S.p8.mods.supply = clamp(admNum(aVal('aeSup'), 1), 0.2, 5); return admRe('Supply ×' + S.p8.mods.supply);
    case 'phase': forceEconPhase(v); return admRe('Economy → ' + v);
    /* companies */
    case 'coMoney': S.ai[v].cash = Math.min(MONEY_CAP, (S.ai[v].cash || 0) + 1e6); return admRe(aiDef(v).name + ' +$1M');
    case 'coShare': admPromptAsk('📊 Set market share', 'Target market share % for ' + aiDef(v).name + ' (empty = remove target)', S.p8.shareTarget[v] !== undefined ? Math.round(S.p8.shareTarget[v] * 100) : 30, function (val) { if (String(val).trim() === '') { delete S.p8.shareTarget[v]; delete S.p8.shareBoost[v]; return admRe('Market share target removed'); } S.p8.shareTarget[v] = clamp(admNum(val, 30) / 100, 0, 1); admRe(aiDef(v).name + ' market share target → ' + Math.round(S.p8.shareTarget[v] * 100) + '%'); }); return;
    case 'coRep': admPromptAsk('⭐ Set reputation', 'Reputation 0-100 for ' + aiDef(v).name, Math.round(S.ai[v].rep || 50), function (val) { S.ai[v].rep = clamp(admNum(val, 50), 0, 100); admRe(aiDef(v).name + ' reputation → ' + S.ai[v].rep); }); return;
    case 'coExpand': { const a2 = aiDef(v); let k = 0; S.ai[v].cash = Math.max(S.ai[v].cash, 2e6); S.ai[v].acquired = false; for (let t = 0; t < 8; t++) if (aiBuild(v, a2.sectors[0], a2.zone, null)) k++; return admRe(a2.name + ' expanded: ' + k + ' new building(s)' + (k ? '' : ' (no free zoned land — zone more ' + ['', 'residential', 'commercial', 'industrial'][a2.zone] + ' land)')); }
    case 'coStock': admPromptAsk('💹 Set stock price', 'Share price for ' + aiDef(v).name, stockOf(v).price.toFixed(2), function (val) { const s = stockOf(v); s.price = clamp(admNum(val, s.price), 0.05, 1e6); s.hist.push(s.price); admRe(aiDef(v).name + ' stock → $' + s.price.toFixed(2)); }); return;
    case 'coBankrupt': confirmDialog('📉 Force bankruptcy?', aiDef(v).name + ' goes bankrupt and is re-founded under a new name.', 'Bankrupt', function () { bankruptCompany(v); admRe('Forced bankruptcy: ' + aiDef(v).name); }); return;
    case 'coDelete': confirmDialog('🗑 Delete company?', aiDef(v).name + ' is removed. Its buildings become yours.', 'Delete', function () { deleteCompany(v); }); return;
    case 'coCreate': return createCompany(aVal('coName'), aVal('coSector'), aVal('coIcon'));
    case 'marketBoom': AI_DEFS.forEach(function (a2) { const s = stockOf(a2.id); s.price = +(s.price * 1.35).toFixed(3); }); NPC_STOCKS.forEach(function (s) { S.companies.stocks[s.id].price *= 1.35; }); forceEconPhase('BOOM'); return admRe('Market Boom: stocks +35%');
    case 'marketCrash': AI_DEFS.forEach(function (a2) { const s = stockOf(a2.id); s.price = Math.max(0.05, +(s.price * 0.55).toFixed(3)); }); NPC_STOCKS.forEach(function (s) { S.companies.stocks[s.id].price = Math.max(0.5, S.companies.stocks[s.id].price * 0.55); }); forceEconPhase('RECESSION'); return admRe('Market Crash: stocks −45%', 'bad');
    /* utilities & environment */
    case 'autoPower': econTick(1); wgAddPower(null, Math.max(10, SIM.powerUse * 1.2 - SIM.powerGen)); onMapChanged(); econTick(1); return admRe('Power network: ' + Math.round(SIM.powerGen) + ' / ' + Math.round(SIM.powerUse) + ' MW');
    case 'autoWater': econTick(1); wgAddWater(null, Math.max(10, SIM.waterUse * 1.2 - SIM.waterGen)); onMapChanged(); econTick(1); return admRe('Water network: ' + Math.round(SIM.waterGen) + ' / ' + Math.round(SIM.waterUse));
    case 'autoWaste': wgAddWaste(null); return admRe('Sewage & waste capacity ' + Math.round(SIM.wasteCap || 0));
    case 'clearPollution': S.city.pollution = 0; return admRe('Pollution cleared');
    case 'clearWaste': S.city.waste = 0; return admRe('Waste cleared');
    case 'addParks': { let k = 0; for (let t = 0; t < 10; t++) if (wgPlaceAnywhere(null, 'park', {})) k++; onMapChanged(); return admRe('Added ' + k + ' parks'); }
    /* weather & time */
    case 'weather': setWeather(v, 6); return admRe('Weather → ' + v);
    case 'hour': setHour(n); return admRe('Time → ' + pad2(n) + ':00');
    case 'setHour': setHour(clamp(admNum(aVal('awHour'), 12), 0, 23.99)); return admRe('Time → ' + pad2(Math.floor(gameHour())) + ':00');
    case 'setDay': setDay(clamp(admNum(aVal('awDay'), 1), 1, 1e6)); return admRe('Day → ' + gameDay());
    case 'setYear': setYear(clamp(admNum(aVal('awYear'), 1), 1, 1e5)); return admRe('Year → ' + gameYear());
    case 'season': setSeason(n); MAP.groundDirty = true; return admRe('Season → ' + currentSeason().name);
    /* events */
    case 'disaster': startDisaster(DISASTERS.find(function (d) { return d.id === v; })); return admRe('Started disaster: ' + v);
    case 'crisis6': createDecision('c6_' + v, { base: Math.round(8000 * costMult() + S.budget * 0.5) }); return admRe('Started crisis: ' + v);
    case 'crisis': startCrisis(CRISES.find(function (c) { return c.id === v; })); return admRe('Started crisis: ' + v);
    case 'dyn': startDynEvent(DYN_EVENTS.find(function (c) { return c.id === v; })); return admRe('Started event: ' + v);
    case 'world': startWorldEvent(v); return admRe('World event: ' + v);
    case 'noEvents': S.p5.admin.noEvents = !S.p5.admin.noEvents; return admRe('Random events ' + (S.p5.admin.noEvents ? 'DISABLED' : 'ENABLED'));
    case 'endEvents': S.events.active.length = 0; S.events.decisions.length = 0; S.p5.world.ends = S.clock.runSec; return admRe('All active events ended');
    /* technology & quests */
    case 'unlockTech': TECH_LIST.forEach(function (t) { if (!t.ng && !hasTech(t.id)) S.technology.unlocked.push(t.id); }); onMapChanged(); return admRe('All technology unlocked');
    case 'unlockTechNg': TECH_LIST.forEach(function (t) { if (!hasTech(t.id)) S.technology.unlocked.push(t.id); }); onMapChanged(); return admRe('All technology incl. New Game+ unlocked (test mode)');
    case 'future10': S.p6.future += 10; return admRe('Future technology → Lv ' + S.p6.future);
    case 'rp': S.research.rp += n; return admRe('+' + fmt(n) + ' RP');
    case 'questGen': return admRe(admQuestGen(1) ? 'Quest generated' : 'No quest available right now', 'good');
    case 'questGen10': return admRe('Generated ' + admQuestGen(10) + ' quest(s)');
    case 'questComplete': return admRe(admQuestFinish(true));
    case 'questFail': return admRe(admQuestFinish(false));
    case 'questClear': S.p6.dq.active.length = 0; return admRe('Quests cleared');
    case 'achAll': ACHIEVEMENTS.forEach(function (x) { S.achievements[x.id] = 1; }); return admRe('All achievements unlocked');
    case 'achReset': S.achievements = {}; return admRe('Achievements reset');
    /* AI & simulation */
    case 'aiExpand': { let k = 0; for (let t = 0; t < 10; t++) AI_DEFS.forEach(function (a2) { if (!S.ai[a2.id] || S.ai[a2.id].acquired) return; S.ai[a2.id].cash = Math.max(S.ai[a2.id].cash, 1e6); if (aiBuild(a2.id, a2.sectors[0], a2.zone, null)) k++; }); return admRe('AI expansion: ' + k + ' new building(s)'); }
    case 'aiCash': AI_DEFS.forEach(function (a2) { if (S.ai[a2.id]) S.ai[a2.id].cash += 5e5; }); return admRe('Every AI company +$500K');
    case 'aiTick': for (let t = 0; t < 75; t++) aiTick(4); return admRe('AI simulated for 5 minutes');
    case 'speed': setSpeed(n); return admRe('Speed → ' + (n ? n + '×' : 'paused'));
    case 'freeze': S.p5.admin.freeze = !S.p5.admin.freeze; return admRe('Economy ' + (S.p5.admin.freeze ? 'frozen' : 'running'));
    case 'benchmark': runBenchmark(6, null); return;
    case 'stressTest': confirmDialog('⚡ Start stress test?', 'A snapshot is created first. NPC & traffic density go to the maximum and the simulated population to 100,000 for 10 seconds, then everything is restored.', 'Start', runStressTest); return;
    /* save */
    case 'snapCreate': admPromptAsk('📸 Create world snapshot', 'Snapshot name', S.city.name + ' — ' + new Date().toLocaleTimeString(), function (val) { const s = createSnapshot(val); if (s) admRe('Snapshot ' + s.id + ' created'); }); return;
    case 'snapRollback': confirmDialog('⏪ Roll back the world?', 'The current city is replaced by snapshot <b>' + esc(v) + '</b>. Unsaved progress since then is lost (a safety snapshot is taken first).', 'Rollback', function () { rollbackSnapshot(v); }); return;
    case 'snapDelete': confirmDialog('🗑 Delete snapshot ' + esc(v) + '?', 'This cannot be undone.', 'Delete', function () { deleteSnapshot(v); admRe('Snapshot ' + v + ' deleted'); }); return;
    case 'presetSave': { const nm = aVal('apName').replace(/[<>]/g, '').trim().slice(0, 32); if (!nm) return; saveAdminPreset(nm); return admRe('Admin preset saved: ' + nm); }
    case 'presetLoad': return loadAdminPreset(v);
    case 'presetDelete': deleteAdminPreset(v); return admRe('Admin preset deleted: ' + v);
    case 'saveNow': if (saveGame(false)) clearRecovery(); return admRe('Saved');
    case 'exportWorld': adminLog('Export world'); downloadSaveFile(); return;
    case 'importWorld': adminLog('Import world'); closeAdminCenter(); importAnyFile(); return;
    case 'restore': adminAction('restore'); return;
    /* debug & system */
    case 'validate': ADM.lastValidation = validateWorld(); return admRe('Validator: ' + (ADM.lastValidation.liveable ? 'LIVEABLE' : ADM.lastValidation.failed.length + ' issue(s)'), ADM.lastValidation.liveable ? 'good' : 'bad');
    case 'fixWorld': { const r = fixWorld(false); ADM.lastFix = r.actions; ADM.lastValidation = validateWorld(); return admRe('FIX WORLD: ' + r.actions.length + ' action(s) · ' + (ADM.lastValidation.liveable ? 'LIVEABLE' : ADM.lastValidation.failed.length + ' issue(s) left')); }
    case 'pauseOnOpen': ADM.pauseOnOpen = !ADM.pauseOnOpen; return renderAdminCenter();
    case 'exitAdmin': return exitAdminMode();
    case 'openLogs': Platform.openFolder('logs'); return;
    case 'classicAdmin': closeAdminCenter(); ADMIN.ok = true; renderAdmin(); return;
    case 'setPin': { const pin = aVal('acPin'); if (!/^\d{4,12}$/.test(pin)) return admRe('PIN must be 4-12 digits', 'bad'); PROFILE.pin = hashPin(pin); ADMIN.ok = true; saveProfile(); return admRe('Admin PIN set'); }
    case 'clearPin': PROFILE.pin = ''; saveProfile(); return admRe('Admin PIN removed');
    case 'runCmd': ADM.search = ''; $('admSearch').value = ''; runAdminCommand(v); return;
    default: return p9AdminDo(a, v, el);              // Part 9 World Control Center actions
  }
}
function admPromptAsk(title, label, def, cb) {
  sysDialog(title, '<p class="small">' + esc(label) + '</p><input id="admPromptIn" class="admInput" style="width:100%;margin-top:8px" value="' + esc(String(def)) + '">', [['OK', 'gold', function () { cb(ADM_PROMPT_VALUE); }], ['CANCEL', '', null]]);
  const i = $('admPromptIn');
  i.oninput = function () { ADM_PROMPT_VALUE = i.value; }; ADM_PROMPT_VALUE = i.value;
  i.onkeydown = function (e) { if (e.key === 'Enter') { ADM_PROMPT_VALUE = i.value; } };
  setTimeout(function () { i.focus(); i.select(); }, 30);
}
function admSetPop(target) {
  target = clamp(Math.round(target), 0, 1e7);
  econTick(1);
  if (target > (SIM.housingCap || 0)) {                         // more citizens need more homes: upgrade & build housing first
    let guard = 0;
    while ((SIM.housingCap || 0) < target * 1.02 && guard++ < 400) {
      const homes = S.buildings.list.filter(function (b) { return BUILDINGS[b.type].housing && b.level < MAX_LEVEL && b.built; });
      if (homes.length && guard % 3) homes.forEach(function (b) { if (b.level < MAX_LEVEL) b.level++; });
      else if (!wgPlaceAnywhere(null, hasTech('c_highrise') ? 'skyscraper' : hasTech('c_zoning') ? 'condo' : 'apartment', {})) { if (!homes.length) break; }
      if (guard % 3 === 0) onMapChanged();
      econTick(1);
    }
  }
  S.city.population = target; S.city.peakPop = Math.max(S.city.peakPop, target); S.meta.bestPop = Math.max(S.meta.bestPop, target);
  return admRe('Population → ' + fmt(target) + (target > (SIM.housingCap || 0) ? ' (housing ' + fmt(SIM.housingCap || 0) + ' — some will move out)' : ''));
}
function admAddPop(n) { return admSetPop(S.city.population + n); }
function admSpawnTraffic(n) {
  let k = 0;
  for (let t = 0; t < n * 2 && k < n; t++) if (spawnAmbientVehicle(t % 6 === 0 ? 'truck' : 'car')) k++;
  return admRe('Spawned ' + k + ' vehicles');
}
function resetVehicleRoute(v) {
  if (!v.path || !v.path.length) return false;
  const cur = v.path[Math.min(v.seg, v.path.length - 1)], dest = v.dest && v.dest._entry >= 0 ? v.dest._entry : v.path[v.path.length - 1];
  MAP.pathCache.clear();
  const p = roadPath(cur, dest, !!v.siren);
  if (!p || p.length < 2) return false;
  const i = AG.vehicles.indexOf(v);
  removeVehicle(i, false);
  const nv = makeVehicle(v.type, p, { dest: v.dest, cargo: v.cargo, ambient: v.ambient, route: v.route, passenger: v.passenger });
  if (nv && v.passenger) v.passenger.driving = true;
  return !!nv;
}
function recalcAllPaths() {
  MAP.pathCache.clear();
  let k = 0;
  AG.vehicles.slice().forEach(function (v) { if (resetVehicleRoute(v)) k++; });
  AG.citizens.forEach(function (c) { if (!c.driving && c.path && !c.parkUntil) { c.path = null; c.pending = true; } });
  return admRe('Recalculated ' + k + ' vehicle route(s)');
}
function maxCity() {
  S.city.peakPop = Math.max(S.city.peakPop, CITY_LEVEL_POP[19]);
  S.p6.mayorLv = 50; S.p6.xp = xpForLevel(50);
  S.research.rp = Math.max(S.research.rp, 1e9);
  TECH_LIST.forEach(function (t) { if (!t.ng && !hasTech(t.id)) S.technology.unlocked.push(t.id); });
  ACHIEVEMENTS.forEach(function (x) { S.achievements[x.id] = 1; });
  S.city.expansion = maxExpansionFor(S.city.size);
  S.p6.mega.era = true;
  onMapChanged();
  return admRe('🏙️ MAX CITY: level ' + cityLevel() + ', mayor 50, research & technology & achievements unlocked, all districts open');
}
function unlockEverything() {
  S.p8.unlockAll = true;
  S.city.expansion = maxExpansionFor(S.city.size);
  TECH_LIST.forEach(function (t) { if (!hasTech(t.id)) S.technology.unlocked.push(t.id); });
  STORY.forEach(function (c) { S.p5.story.unlocked[c.unlock] = 1; }); S.p5.story.ch = STORY.length;
  S.p5.tut.done = true; S.tutorial.done = true; clearDialogues();
  S.p6.mega.era = true; S.city.tourismUnlocked = true;
  saveProfile(); onMapChanged();
  return admRe('🔓 UNLOCK EVERYTHING: regions, buildings, roads, technologies, vehicles, landmarks, mega projects, story & quests');
}
function admQuestGen(n) {
  const q = S.p6.dq; let k = 0;
  for (let t = 0; t < n; t++) {
    const pool = DQ_TEMPLATES.filter(function (T) { return !q.active.some(function (a) { return a.tpl === T.id; }); });
    if (!pool.length) break;
    const T = pool[Math.floor(Math.random() * pool.length)];
    let target = 0; try { target = T.target ? T.target() : 0; } catch (e) { target = 0; }
    q.active.push({ tpl: T.id, target: target, start: S.clock.runSec, deadline: S.clock.runSec + T.dur });
    k++;
  }
  return k;
}
function admQuestFinish(ok) {
  const q = S.p6.dq; if (!q.active.length) return 'No active quest';
  const a = q.active[0], T = DQ_TEMPLATES.find(function (x) { return x.id === a.tpl; });
  if (ok) { const keep = T.check; T.check = function () { return true; }; try { dqTick(); } finally { T.check = keep; } return 'Quest completed: ' + T.title; }
  a.deadline = -1; dqTick(); return 'Quest failed: ' + T.title;
}
function createCompany(name, sector, icon) {
  name = String(name || '').replace(/[<>]/g, '').trim().toUpperCase().slice(0, 24);
  if (!name) return admRe('Enter a company name', 'bad');
  if (MARKET_SECTORS.indexOf(sector) < 0) sector = 'SHOPPING';
  if (S.p8.companies.length >= 12) return admRe('Maximum 12 custom companies', 'bad');
  const id = 'cx_' + Date.now().toString(36).slice(-8);
  const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#8338ec', '#3a86ff', '#ff006e', '#06d6a0'];
  S.p8.companies.push({ id: id, name: name, icon: String(icon || '🏢').slice(0, 4), sector: sector, color: colors[S.p8.companies.length % colors.length] });
  registerCustomCompanies(S.p8);
  S.ai[id] = newAIState(S.city.difficulty)[id] || { cash: 50000, rep: 50, quality: 1, price: 1, level: 1, acquired: false, profit: 0, rev: 0 };
  S.ai[id].cash = 250000;
  stockOf(id);
  return admRe('Company created: ' + name + ' (' + sector + ')');
}
function deleteCompany(id) {
  const a = aiDef(id); if (!a) return;
  S.buildings.list.forEach(function (b) { if (b.owner === id) b.owner = 'player'; });
  if (a.custom) {
    S.p8.companies = S.p8.companies.filter(function (c) { return c.id !== id; });
    delete S.ai[id]; delete S.p6.stocks[id];
    registerCustomCompanies(S.p8);
  } else S.ai[id].acquired = true;
  delete S.p8.shareTarget[id]; delete S.p8.shareBoost[id];
  onMapChanged();
  return admRe('Company deleted: ' + a.name + ' (buildings transferred to you)');
}
function adminGenerate() {
  const name = aVal('wgName') || ADM.wgName || 'New Metropolis', seed = aVal('wgSeed') || ADM.wgSeed;
  ADM.wgName = name; ADM.wgSeed = seed;
  const ov = Object.assign({}, ADM.wgPreset === 'custom' ? ADM.wgCustom : {}, { name: name, seed: seed, slot: ADM.wgSlot | 0 });
  if (ADM.wgSize) ov.size = ADM.wgSize;
  const run = function () { closeAdminCenter(); generateWorld(ADM.wgPreset, ov); };
  if (STARTED || (ADM.wgSlot && slotInfo(ADM.wgSlot).exists)) confirmDialog('🌍 Generate a new world?', 'The city in ' + (ADM.wgSlot ? 'CITY 0' + ADM.wgSlot : 'the current slot') + ' is replaced by the generated world (take a snapshot first if you want to keep it).', 'Generate', run);
  else run();
}
function duplicateWorld() {
  let slot = 0; for (let n = 1; n <= SLOT_COUNT; n++) if (!slotInfo(n).exists && n !== (S.slot || 1)) { slot = n; break; }
  if (!slot) return admRe('No free city slot — delete a city first', 'bad');
  const obj = buildSaveObject();
  obj.city.name = (S.city.name + ' COPY').slice(0, 32);
  obj.p8 = Object.assign({}, obj.p8, { copyOf: seedLabel() + '-COPY' });
  obj.header = Object.assign({}, obj.header, { cityName: obj.city.name, city: obj.city.name, slot: slot });
  try { Store.setItem(slotKey(slot), JSON.stringify(obj)); } catch (e) { return admRe('Could not write the copy: ' + e.message, 'bad'); }
  return admRe('World duplicated → CITY 0' + slot + ' "' + obj.city.name + '" (' + seedLabel() + '-COPY)');
}

/* ---------------- Snapshots & rollback ---------------- */
const SNAP_INDEX = 'bct_snap_index', SNAP_MAX = 20;
function snapshotIndex() { try { const a = JSON.parse(Store.getItem(SNAP_INDEX) || '[]'); return Array.isArray(a) ? a.filter(function (s) { return s && /^snapshot_\d{3}$/.test(s.id); }) : []; } catch (e) { return []; } }
function snapKey(id) { return 'bct_snap_' + id.slice(9); }
/* Time Machine snapshots (meta.tm) are kept when old snapshots make room */
function snapEvict(idx) { let k = idx.findIndex(function (s) { return !s.tm; }); if (k < 0) k = 0; return idx.splice(k, 1)[0]; }
function createSnapshot(name, silent, extra) {
  const idx0 = snapshotIndex();
  let n = 1; idx0.forEach(function (s) { n = Math.max(n, (+s.id.slice(9)) + 1); }); if (n > 999) n = 1;
  const id = 'snapshot_' + String(n).padStart(3, '0');
  let json;
  try {
    const obj = buildSaveObject();
    if (validateSaveObject(obj).length) { if (!silent) admRe('Snapshot blocked: invalid world data', 'bad'); return null; }
    json = JSON.stringify(obj);
  } catch (e) { if (!silent) admRe('Snapshot failed: ' + e.message, 'bad'); return null; }
  // Browser storage is small (≈5 MB): the oldest snapshots make room; the desktop app stores them as files
  for (let tries = 0; ; tries++) {
    try { Store.setItem(snapKey(id), json); break; }
    catch (e) {
      if (!idx0.length || tries > 20) { if (!silent) admRe('Snapshot failed: storage full (' + e.message + ')', 'bad'); return null; }
      const old = snapEvict(idx0); Store.removeItem(snapKey(old.id));
    }
  }
  if (!DESKTOP) while (idx0.length > 7) { const old = snapEvict(idx0); Store.removeItem(snapKey(old.id)); }
  const meta = { id: id, name: String(name || id).replace(/[<>]/g, '').slice(0, 48), created: Date.now(), city: S.city.name, pop: Math.floor(S.city.population), seed: seedLabel(), slot: S.slot || 1,
    timeline: S.p9 ? S.p9.branch.name : 'Original Timeline', branchId: S.p9 ? S.p9.branch.id : 'original', year: typeof gameYear === 'function' ? gameYear() : 1 };
  idx0.push(meta);
  if (extra) Object.assign(meta, extra);
  while (idx0.length > SNAP_MAX) { const old = snapEvict(idx0); Store.removeItem(snapKey(old.id)); }
  Store.setItem(SNAP_INDEX, JSON.stringify(idx0));
  return meta;
}
function rollbackSnapshot(id) {
  const raw = Store.getItem(snapKey(id)); if (!raw) return admRe('Snapshot ' + id + ' is missing', 'bad');
  createSnapshot('Before rollback to ' + id);
  const slot = S.slot || 1;
  const r = importSave(raw);
  if (!r.ok) return admRe('Rollback failed: ' + r.errors.join('; '), 'bad');
  S.slot = slot; saveGame(true); clearDialogues(); CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; selectBuilding(null); applyTheme();
  if (!STARTED) startGame({ isNew: false, notes: ['World rolled back to ' + id + '.'] });
  return admRe('ROLLBACK WORLD → ' + id);
}
function deleteSnapshot(id) {
  Store.removeItem(snapKey(id));
  Store.setItem(SNAP_INDEX, JSON.stringify(snapshotIndex().filter(function (s) { return s.id !== id; })));
}

/* ---------------- Admin presets ---------------- */
const ADMIN_PRESET_KEY = 'bct_admin_presets';
const BUILTIN_ADMIN_PRESETS = {
  'Mega City Test': { builtin: true, desc: 'Generates a Mega City world, free & instant build, speed 5×', generate: 'megacity', god: true, instant: true, speed: 5 },
  'Economic Crisis Test': { builtin: true, desc: 'Recession + banking crisis, market crash, demand ×0.7', phase: 'RECESSION', crisis: 'bankingcrisis', crash: true, demand: 0.7 },
  'Traffic Stress Test': { builtin: true, desc: 'Traffic density 200 %, +60 vehicles, rush hour 08:00', trafficDensity: 200, spawnTraffic: 60, hour: 8 },
  'Population Stress Test': { builtin: true, desc: '+100,000 citizens (housing grows), NPC density 200 %', addPop: 100000, npcDensity: 200 },
  'Disaster Test': { builtin: true, desc: 'Earthquake + flood + storm, random events on', disasters: ['earthquake', 'flood', 'storm'], noEvents: false }
};
function userAdminPresets() { try { const o = JSON.parse(Store.getItem(ADMIN_PRESET_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function allAdminPresets() { return Object.assign({}, BUILTIN_ADMIN_PRESETS, userAdminPresets()); }
function presetSummary(p) { return Object.keys(p).filter(function (k) { return k !== 'builtin' && k !== 'desc'; }).map(function (k) { return k + '=' + JSON.stringify(p[k]); }).join(', ').slice(0, 140); }
function saveAdminPreset(name) {
  const o = userAdminPresets();
  o[name] = { god: S.p5.admin.god, instant: S.p5.admin.instant, freeze: S.p5.admin.freeze, noEvents: S.p5.admin.noEvents, speed: S.settings.speed, weather: FX.lock || null, npcDensity: GSET.npcDensity, trafficDensity: GSET.trafficDensity, demand: S.p8.mods.demand, supply: S.p8.mods.supply, worldPreset: ADM.wgPreset, worldSize: ADM.wgSize || null };
  Store.setItem(ADMIN_PRESET_KEY, JSON.stringify(o));
}
function deleteAdminPreset(name) { const o = userAdminPresets(); delete o[name]; Store.setItem(ADMIN_PRESET_KEY, JSON.stringify(o)); }
function loadAdminPreset(name) {
  const p = allAdminPresets()[name]; if (!p) return;
  if (p.generate) { closeAdminCenter(); generateWorld(p.generate, { name: name.replace(' Test', ''), slot: S.slot || 1 }).then(function () { applyAdminPresetFlags(p); }); adminLog('Loaded admin preset: ' + name); return; }
  applyAdminPresetFlags(p);
  admRe('Admin preset loaded: ' + name);
}
function applyAdminPresetFlags(p) {
  ['god', 'instant', 'freeze', 'noEvents'].forEach(function (k) { if (p[k] !== undefined) S.p5.admin[k] = !!p[k]; });
  if (p.god) S.debugUnlockAll = true;
  if (p.speed !== undefined && STARTED) setSpeed(p.speed);
  if (p.weather) setWeather(p.weather, 6);
  if (p.npcDensity) GSET.npcDensity = p.npcDensity;
  if (p.trafficDensity) GSET.trafficDensity = p.trafficDensity;
  if (p.npcDensity || p.trafficDensity) { GSET = Object.assign(sanitizeGSET(GSET), { _rev: GSET._rev }); saveGSET(); }
  if (p.demand) S.p8.mods.demand = p.demand;
  if (p.supply) S.p8.mods.supply = p.supply;
  if (p.worldPreset) ADM.wgPreset = p.worldPreset;
  if (p.worldSize !== undefined) ADM.wgSize = p.worldSize;
  if (p.phase) forceEconPhase(p.phase);
  if (p.crisis) createDecision('c6_' + p.crisis, { base: Math.round(8000 * costMult() + S.budget * 0.5) });
  if (p.crash) adminDo('marketCrash');
  if (p.spawnTraffic) admSpawnTraffic(p.spawnTraffic);
  if (p.hour !== undefined) setHour(p.hour);
  if (p.addPop) admAddPop(p.addPop);
  if (Array.isArray(p.disasters)) p.disasters.forEach(function (id, i) { setTimeout(function () { const d = DISASTERS.find(function (x) { return x.id === id; }); if (d && STARTED) startDisaster(d); }, i * 4000); });
}

/* ---------------- Benchmark & stress test ---------------- */
function memEstimate() {
  if (performance.memory) return (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB (JS heap)';
  return '~' + ((AG.citizens.length * 0.6 + AG.vehicles.length * 0.9 + FX.particles.length * 0.15 + S.buildings.list.length * 0.4 + MAP.W * MAP.H * 0.05 + (S._saveBytes || 0) / 1024) / 1024).toFixed(2) + ' MB (estimate)';
}
function runBenchmark(seconds, title, done) {
  const b = { running: true, progress: 0, title: title || '' }; ADM.bench = title ? ADM.bench : b; if (title) ADM.stress = b;
  if (ADM.open) renderAdminCenter();
  const wasOpen = ADM.open; if (wasOpen && !title) $('adminCenter').classList.add('admGhost');
  const resume = STARTED && S.settings.speed === 0 && !title; if (resume) setSpeed(1);       // measure a running simulation
  const t0 = performance.now(), ticks0 = Game.ticks; let frames = 0, minFps = 999, last = t0;
  const acc = { cit: 0, traffic: 0, econ: 0, render: 0, frame: 0, n: 0 };
  const step = function () {
    const now = performance.now(), dt = now - last; last = now; frames++;
    if (dt > 0) minFps = Math.min(minFps, 1000 / dt);
    const pr = Game.prof;
    acc.cit += pr.Population ? pr.Population.ms : 0; acc.traffic += pr.Transportation ? pr.Transportation.ms : 0; acc.econ += pr.Economy ? pr.Economy.ms : 0;
    acc.render += PERF.renderMs || 0; acc.frame += PERF.frameMs || 0; acc.n++;
    b.progress = (now - t0) / (seconds * 1000);
    if (now - t0 < seconds * 1000) { requestAnimationFrame(step); return; }
    const secs = (now - t0) / 1000;
    Object.assign(b, { running: false, fps: frames / secs, minFps: minFps === 999 ? 0 : minFps, tps: (Game.ticks - ticks0) / secs, cit: acc.cit / acc.n, traffic: acc.traffic / acc.n, econ: acc.econ / acc.n, render: acc.render / acc.n, frame: acc.frame / acc.n, mem: memEstimate(),
      entities: AG.citizens.length + AG.vehicles.length + FX.particles.length + S.buildings.list.length, citizens: AG.citizens.length, vehicles: AG.vehicles.length, buildings: S.buildings.list.length, population: Math.floor(S.city.population) });
    b.verdict = b.fps >= 50 ? 'Excellent — smooth at this load.' : b.fps >= 30 ? 'Good — playable; adaptive quality keeps it stable.' : 'Heavy — lower NPC/traffic density or graphics quality.';
    $('adminCenter').classList.remove('admGhost');
    if (resume && S.settings.speed === 1) setSpeed(0);
    adminLog((title || 'Benchmark') + ': ' + b.fps.toFixed(1) + ' FPS, ' + b.tps.toFixed(1) + ' TPS, citizens ' + b.cit.toFixed(2) + ' ms, traffic ' + b.traffic.toFixed(2) + ' ms, economy ' + b.econ.toFixed(2) + ' ms, render ' + b.render.toFixed(2) + ' ms');
    if (done) done(b);
    if (ADM.open) renderAdminCenter();
  };
  requestAnimationFrame(step);
  return b;
}
function runStressTest() {
  if (!STARTED) { toast('Start or continue a city first', 'bad'); return; }
  const snap = createSnapshot('Before stress test');
  const keep = { npc: GSET.npcDensity, traffic: GSET.trafficDensity, quality: S.settings.quality, pop: S.city.population, peak: S.city.peakPop, freeze: S.p5.admin.freeze, speed: S.settings.speed };
  adminLog('Stress test started (snapshot ' + (snap ? snap.id : 'n/a') + ')');
  GSET.npcDensity = 200; GSET.trafficDensity = 200; GSET._rev++; S.settings.quality = 'ULTRA'; S.settings.autoQuality = true;
  S.p5.admin.freeze = true;                                   // the economy holds the stress population (no move-outs during the test)
  S.city.population = Math.max(S.city.population, 100000);
  setSpeed(10);
  let spawned = 0; for (let k = 0; k < 600 && AG.vehicles.length < perf().veh; k++) if (spawnAmbientVehicle(k % 6 === 0 ? 'truck' : 'car')) spawned++;
  for (let k = 0; k < perf().npc && AG.citizens.length < perf().npc; k++) spawnCitizen(false);
  runBenchmark(10, '⚡ Stress test — 100,000 simulated citizens, max traffic', function (b) {
    b.verdict = 'Peak load: ' + b.citizens + ' citizen agents + ' + b.vehicles + ' vehicles rendered (LOD: near = full, medium = reduced, far = statistical) while ' + fmt(b.population) + ' citizens were simulated. ' + b.verdict + ' Everything was restored.';
    GSET.npcDensity = keep.npc; GSET.trafficDensity = keep.traffic; GSET._rev++; S.settings.quality = keep.quality;
    S.city.population = keep.pop; S.city.peakPop = keep.peak; S.p5.admin.freeze = keep.freeze; setSpeed(keep.speed);
    while (AG.vehicles.length > perf().veh) removeVehicle(AG.vehicles.length - 1, false);
    while (AG.citizens.length > perf().npc) AG.citizens.pop();
    adminLog('Stress test finished: ' + b.fps.toFixed(1) + ' FPS at peak, restored');
  });
}

/* ---------------- Command console ---------------- */
const ADM_COMMANDS = {
  help: { help: 'list commands', run: function () { return Object.keys(ADM_COMMANDS).map(function (k) { return k + ' — ' + ADM_COMMANDS[k].help; }).join('\n'); } },
  giveMoney: { help: 'giveMoney <amount>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n <= 0) throw new Error('amount must be a positive number'); S.money = Math.min(MONEY_CAP, S.money + n); return '+' + money(n) + ' → ' + money(S.money); } },
  setMoney: { help: 'setMoney <amount>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n < 0) throw new Error('amount must be ≥ 0'); S.money = Math.min(MONEY_CAP, n); return 'money = ' + money(S.money); } },
  giveBudget: { help: 'giveBudget <amount>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n <= 0) throw new Error('amount must be a positive number'); S.budget = Math.min(MONEY_CAP, S.budget + n); return 'budget = ' + money(S.budget); } },
  unlockAll: { help: 'unlock everything', run: function () { unlockEverything(); return 'everything unlocked'; } },
  maxCity: { help: 'max city level, mayor, research, achievements', run: function () { maxCity(); return 'MAX CITY'; } },
  spawnCitizens: { help: 'spawnCitizens <n>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n <= 0 || n > 1e7) throw new Error('n must be 1…10,000,000'); admAddPop(Math.round(n)); return 'population = ' + fmt(S.city.population); } },
  setPopulation: { help: 'setPopulation <n>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n < 0) throw new Error('n must be ≥ 0'); admSetPop(n); return 'population = ' + fmt(S.city.population); } },
  setHappiness: { help: 'setHappiness <0-100>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n)) throw new Error('value must be a number'); S.city.happiness = clamp(n, 0, 100); return 'happiness = ' + S.city.happiness; } },
  setWeather: { help: 'setWeather <clear|cloudy|rain|storm|snow|fog|heatwave>', args: 1, run: function (a) { if (!setWeather(String(a[0]).toLowerCase(), 6)) throw new Error('unknown weather "' + a[0] + '"'); return 'weather = ' + FX.weather; } },
  setTime: { help: 'setTime <hour 0-23>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n < 0 || n >= 24) throw new Error('hour must be 0…23'); setHour(n); return 'time = ' + pad2(Math.floor(n)) + ':00'; } },
  setDay: { help: 'setDay <day>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n < 1) throw new Error('day must be ≥ 1'); setDay(n); return 'day = ' + gameDay(); } },
  setSeason: { help: 'setSeason <spring|summer|autumn|winter>', args: 1, run: function (a) { const i = SEASONS.findIndex(function (s) { return s.id === String(a[0]).toLowerCase(); }); if (i < 0) throw new Error('unknown season'); setSeason(i); MAP.groundDirty = true; return 'season = ' + currentSeason().name; } },
  setTax: { help: 'setTax <0-30>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n)) throw new Error('tax must be a number'); S.city.tax = clamp(Math.round(n), 0, MAX_TAX); return 'tax = ' + S.city.tax + '%'; } },
  setInterest: { help: 'setInterest <percent ≥ 1>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n)) throw new Error('rate must be a number'); S.p5.econ.rate = clamp(n / 100, 0.01, 0.15); return 'interest = ' + (S.p5.econ.rate * 100).toFixed(2) + '%'; } },
  setInflation: { help: 'setInflation <percent>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n)) throw new Error('inflation must be a number'); S.p6.econ.infl = clamp(n / 100, -0.1, 0.5); return 'inflation = ' + (S.p6.econ.infl * 100).toFixed(1) + '%'; } },
  clearTraffic: { help: 'remove all vehicles', run: function () { adminDo('clearTraffic'); return 'traffic cleared'; } },
  spawnTraffic: { help: 'spawnTraffic <n>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (!isFinite(n) || n <= 0 || n > 2000) throw new Error('n must be 1…2000'); admSpawnTraffic(Math.round(n)); return AG.vehicles.length + ' vehicles'; } },
  generateWorld: { help: 'generateWorld [preset] [SMALL|MEDIUM|LARGE|HUGE|MEGA] [CITY-seed]', run: function (a) {
    const preset = a[0] && (WORLD_PRESETS[a[0]] || a[0] === 'custom') ? a[0] : 'balanced'; if (a[0] && preset !== a[0]) throw new Error('unknown preset — ' + Object.keys(WORLD_PRESETS).join(', '));
    const ov = { name: (WORLD_PRESETS[preset] ? WORLD_PRESETS[preset].name.replace(/^\S+\s/, '') : 'Custom World'), slot: S.slot || 1 };
    if (a[1]) { if (!WORLD_SIZES[String(a[1]).toUpperCase()]) throw new Error('size must be SMALL, MEDIUM, LARGE, HUGE or MEGA'); ov.size = String(a[1]).toUpperCase(); }
    if (a[2]) { const sd = parseSeed(a[2]); if (!isFinite(sd)) throw new Error('invalid seed'); ov.seed = sd; }
    closeAdminCenter(); generateWorld(preset, ov); return 'generating ' + preset + '…'; } },
  fixWorld: { help: 'analyse & repair the world', run: function () { const r = fixWorld(false); return r.actions.join('\n'); } },
  validate: { help: 'run the world validator', run: function () { const r = validateWorld(); ADM.lastValidation = r; return r.checks.map(function (c) { return (c.ok ? '✓ ' : '⚠ ') + c.label + ' — ' + c.detail; }).join('\n') + '\nWORLD STATUS: ' + (r.liveable ? 'LIVEABLE' : 'NEEDS ATTENTION'); } },
  health: { help: 'world health score', run: function () { const h = worldHealth(); return h.rows.map(function (r) { return r[0] + ': ' + r[1] + '%'; }).join('\n') + '\nOVERALL: ' + h.overall + '% ' + h.label; } },
  snapshot: { help: 'snapshot [name]', run: function (a) { const s = createSnapshot(a.join(' ') || 'Console snapshot'); if (!s) throw new Error('snapshot failed'); return s.id + ' created'; } },
  rollback: { help: 'rollback <snapshot_001>', args: 1, run: function (a) { const id = /^\d+$/.test(a[0]) ? 'snapshot_' + String(a[0]).padStart(3, '0') : a[0]; if (!snapshotIndex().some(function (s) { return s.id === id; })) throw new Error('unknown snapshot ' + id); rollbackSnapshot(id); return 'rolled back to ' + id; } },
  startDisaster: { help: 'startDisaster <' + 'storm|flood|wildfire|earthquake|blackout|infrastructure>', args: 1, run: function (a) { const d = DISASTERS.find(function (x) { return x.id === a[0] || (a[0] === 'fire' && x.id === 'wildfire'); }); if (!d) throw new Error('unknown disaster'); startDisaster(d); return d.name + ' started'; } },
  startCrisis: { help: 'startCrisis <power|water|traffic|pollution|banking|recession>', args: 1, run: function (a) { const map = { power: 'powercrisis', water: 'watercrisis', traffic: 'trafficcrisis', pollution: 'pollutioncrisis', banking: 'bankingcrisis', recession: 'recession6' }; const id = map[a[0]] || a[0]; if (!CRISIS6[id]) throw new Error('unknown crisis'); adminDo('crisis6', id); return id + ' started'; } },
  disableEvents: { help: 'disableEvents <on|off>', args: 1, run: function (a) { S.p5.admin.noEvents = a[0] === 'on' || a[0] === 'true' || a[0] === '1'; return 'random events ' + (S.p5.admin.noEvents ? 'disabled' : 'enabled'); } },
  unlockTech: { help: 'unlock all technology', run: function () { adminDo('unlockTech'); return 'all technology unlocked'; } },
  generateQuest: { help: 'generateQuest [n]', run: function (a) { const n = a[0] ? admNum(a[0], 1) : 1; return admQuestGen(clamp(n | 0, 1, 20)) + ' quest(s) generated'; } },
  completeQuest: { help: 'complete the first active quest', run: function () { return admQuestFinish(true); } },
  speed: { help: 'speed <0|0.25|0.5|1|2|5|10|25|50|100>', args: 1, run: function (a) { const n = admNum(a[0], NaN); if (SIM_SPEEDS.indexOf(n) < 0) throw new Error('speed must be one of ' + SIM_SPEEDS.join(', ')); setSpeed(n); return 'speed = ' + n + '×'; } },
  freeBuild: { help: 'freeBuild <on|off>', args: 1, run: function (a) { S.p5.admin.god = a[0] === 'on'; if (S.p5.admin.god) S.debugUnlockAll = true; return 'free build ' + a[0]; } },
  instantBuild: { help: 'instantBuild <on|off>', args: 1, run: function (a) { S.p5.admin.instant = a[0] === 'on'; return 'instant build ' + a[0]; } },
  debugWorld: { help: 'debugWorld <on|off>', run: function (a) { toggleWorldDebug(a[0] ? a[0] === 'on' : undefined); return 'world debugger ' + (WDBG.on ? 'on' : 'off'); } },
  benchmark: { help: 'run a 6 s benchmark', run: function () { runBenchmark(6, null); return 'benchmark running…'; } },
  stressTest: { help: 'run the stress test', run: function () { runStressTest(); return 'stress test running…'; } },
  duplicateWorld: { help: 'copy the city into a free slot', run: function () { duplicateWorld(); return 'done'; } },
  marketBoom: { help: 'stocks +35 %', run: function () { adminDo('marketBoom'); return 'market boom'; } },
  marketCrash: { help: 'stocks −45 %', run: function () { adminDo('marketCrash'); return 'market crash'; } },
  clear: { help: 'clear the console', run: function () { ADM.consoleOut = []; return ''; } }
};
function runAdminCommand(line) {
  line = String(line || '').trim(); if (!line) return;
  ADM.history.push(line); if (ADM.history.length > 50) ADM.history.shift(); ADM.hi = ADM.history.length;
  ADM.consoleOut.push(['cmdIn', '> ' + line]);
  const parts = line.split(/\s+/), name = parts[0], args = parts.slice(1);
  const cmd = ADM_COMMANDS[name] || ADM_COMMANDS[Object.keys(ADM_COMMANDS).find(function (k) { return k.toLowerCase() === name.toLowerCase(); }) || ''];
  if (!cmd) ADM.consoleOut.push(['neg', 'Unknown command "' + name + '" — type help']);
  else if (cmd.args && args.length < cmd.args) ADM.consoleOut.push(['neg', 'Usage: ' + cmd.help]);
  else {
    try { const out = cmd.run(args); if (out) String(out).split('\n').forEach(function (l) { ADM.consoleOut.push(['pos', l]); }); if (name !== 'help' && name !== 'clear' && name !== 'validate' && name !== 'health') adminLog('Console: ' + line); }
    catch (e) { ADM.consoleOut.push(['neg', 'Error: ' + (e && e.message || e)]); }
  }
  refreshTopbar();
  if (ADM.open) renderAdminCenter();
}

/* ---------------- Map picking (citizen / vehicle inspector) ---------------- */
function adminPickAt(sx, sy) {
  if (!ADM.pick) return false;
  const w = screenToWorld(sx, sy), hit = pickAgent(w.x, w.y);
  const mode = ADM.pick; ADM.pick = null;
  if (mode === 'citizen' && hit && hit.c) { ADM.sel = hit.c.id; openAdminCenter('citizens'); return true; }
  if (mode === 'vehicle' && hit && hit.v) { ADM.selV = hit.v.id; openAdminCenter('traffic'); return true; }
  toast('Nothing picked — open the panel and try again', 'bad');
  return true;
}

/* ---------------- Binding (keys, clicks, console, search) ---------------- */
function bindAdminCenter() {
  const root = $('adminCenter');
  root.addEventListener('click', function (e) {
    const cat = e.target.closest('[data-acat]'); if (cat) { ADM.cat = cat.dataset.acat; ADM.search = ''; $('admSearch').value = ''; renderAdminCenter(); $('admBody').scrollTop = 0; sfx('click'); return; }
    const el = e.target.closest('[data-ac]'); if (!el) return;
    e.preventDefault();
    try { adminDo(el.dataset.ac, el.dataset.v, el); } catch (err) { logError('Admin action ' + el.dataset.ac, err); toast('⚠️ ' + err.message, 'bad'); }
  });
  root.addEventListener('input', function (e) {
    const k = e.target.dataset && e.target.dataset.wgc; if (!k || !ADM.wgCustom) return;
    ADM.wgCustom[k] = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'range' && e.target.nextElementSibling) e.target.nextElementSibling.textContent = Number(e.target.value).toFixed(1);
  });
  $('admClose').onclick = closeAdminCenter;
  $('admPauseBtn').onclick = function () { ADM.pauseOnOpen = !ADM.pauseOnOpen; if (STARTED) { if (ADM.pauseOnOpen && S.settings.speed > 0) { ADM.prevSpeed = S.settings.speed; setSpeed(0); } else if (!ADM.pauseOnOpen && ADM.prevSpeed !== null) { setSpeed(ADM.prevSpeed); ADM.prevSpeed = null; } } renderAdminCenter(); };
  $('admGenBig').onclick = function () { ADM.cat = 'world'; ADM.search = ''; renderAdminCenter(); adminGenerate(); };
  $('admFixBig').onclick = function () { ADM.cat = 'wc_debug'; quickAction('q_repairWorld'); };
  $('admUnlockBig').onclick = function () { confirmDialog('🔓 Unlock everything?', 'All regions, buildings, roads, technologies, vehicles, landmarks, mega projects, scenarios and quests are unlocked for this city.', 'Unlock', unlockEverything); };
  $('admMaxBig').onclick = function () { maxCity(); };
  $('admSearch').oninput = function () { ADM.search = this.value.trim(); renderAdminCenter(); };
  const inp = $('admCmd');
  inp.onkeydown = function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { runAdminCommand(inp.value); inp.value = ''; }
    else if (e.key === 'ArrowUp') { ADM.hi = Math.max(0, ADM.hi - 1); inp.value = ADM.history[ADM.hi] || ''; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { ADM.hi = Math.min(ADM.history.length, ADM.hi + 1); inp.value = ADM.history[ADM.hi] || ''; e.preventDefault(); }
    else if (e.key === 'Tab') { e.preventDefault(); const m = Object.keys(ADM_COMMANDS).filter(function (k) { return k.toLowerCase().indexOf(inp.value.toLowerCase()) === 0; }); if (m.length === 1) inp.value = m[0] + ' '; else if (m.length) ADM.consoleOut.push(['', m.join('  ')]), renderAdminCenter(); }
  };
  $('admSearch').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Escape') { this.value = ''; ADM.search = ''; renderAdminCenter(); } };
  // Hidden main-menu ADMIN button: shown only after admin mode was opened (F10) in this session
  const mb = document.querySelector('[data-menu="admin"]'); if (mb) mb.classList.toggle('hidden', !ADM.menuButton);
  // Five clicks on the version label also reveal it
  const ver = $('titleVersion'); let clicks = 0, tmr = 0;
  if (ver) ver.addEventListener('click', function () { clicks++; clearTimeout(tmr); tmr = setTimeout(function () { clicks = 0; }, 1500); if (clicks >= 5) { clicks = 0; ADM.menuButton = true; const b = document.querySelector('[data-menu="admin"]'); if (b) b.classList.remove('hidden'); toast('🛡️ Admin button revealed', ''); } });
}
/* Admin security (Part 9): F10 works only when ADMIN MODE is enabled (⚙️ Settings or Ctrl+Alt+F10 + confirmation) */
window.addEventListener('keydown', function (e) {
  if (e.key !== 'F10') return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (typeof S === 'undefined' || !S || !MAP.roads) return;
  if (e.ctrlKey && e.altKey) { promptEnableAdmin('wc_world'); return; }
  if (ADM.open) { closeAdminCenter(); return; }
  if (e.ctrlKey && e.shiftKey) { if (adminModeEnabled()) toggleWorldDebug(); else requestAdmin(); return; }
  if (e.ctrlKey) { requestAdmin('world'); return; }
  if (WB.on || RS.on) p9CancelTools();
  requestAdmin();
}, true);
window.addEventListener('keydown', function (e) {
  if (!ADM.open || e.key !== 'Escape') return;
  const t = e.target && e.target.tagName;
  if (!$('sysDialog').classList.contains('hidden') || $('modalWrap').classList.contains('show')) return;
  if (t === 'INPUT' && e.target.value) return;
  e.preventDefault(); e.stopImmediatePropagation(); closeAdminCenter();
}, true);
