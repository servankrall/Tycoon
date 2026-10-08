'use strict';
/* BLOCK CITY TYCOON — MAIN — loop, input, menus, boot (init is called by boot/loader.js) */
/* =========================== 11. LOOP / INPUT =========================== */
let STARTED = false;
const INPUT = { pointers: new Map(), down: null, moved: false, pinch: null, lastTap: 0 };

function clampCamera() {
  CAM.zoom = clamp(CAM.zoom, 0.3, 2.6);
  CAM.x = clamp(CAM.x, 0, MAP.W * TILE); CAM.y = clamp(CAM.y, -120, MAP.H * TILE);
}
function tileAtScreen(sx, sy) { const w = screenToWorld(sx, sy); return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE), wx: w.x, wy: w.y }; }
/* Pick the building under a screen point, including its drawn roof */
function pickBuilding(wx, wy) {
  const list = S.buildings.list.slice().sort(function (a, b) { return (b.y + bdef(b).h) - (a.y + bdef(a).h); });
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    const H = (d.id === 'park' || d.id === 'plaza' || d.id === 'airport') ? 0 : buildingHeight(b);
    const x0 = b.x * TILE, y0 = b.y * TILE, w = d.w * TILE, h = d.h * TILE;
    if (wx >= x0 && wx <= x0 + w && wy >= y0 - H && wy <= y0 + h) return b;
  }
  return null;
}
function handleTap(sx, sy) {
  if (ADM.pick && adminPickAt(sx, sy)) return;          // admin inspector: pick a citizen / vehicle
  if (p9TapHook(sx, sy)) return;                       // Part 9: entity inspector / disaster location pickers
  const t = tileAtScreen(sx, sy);
  UI.idleTimer = 0;
  if (!inMap(t.x, t.y) && UI.tool !== 'select') return;
  if (UI.tool === 'build' && UI.placing) {
    const d = fpDef(UI.placing, UI.rot | 0);
    attemptPlace(t.x - Math.floor((d.w - 1) / 2), t.y - Math.floor((d.h - 1) / 2));
    return;
  }
  if (UI.tool === 'zone') {
    if (!UI.zoneDrag) UI.zoneDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    else { UI.zoneDrag.x1 = t.x; UI.zoneDrag.y1 = t.y; }
    zonePreviewConfirm();
    return;
  }
  if (UI.tool === 'road') {
    if (!UI.roadDrag) UI.roadDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    else { UI.roadDrag.x1 = t.x; UI.roadDrag.y1 = t.y; }
    roadPreviewConfirm();
    return;
  }
  if (UI.tool === 'bulldoze') {
    const b = buildingAtTile(t.x, t.y);
    if (b) {
      const d = bdef(b);
      if (buildCost(d) < 200 && UI.lastPointer !== 'touch') demolish(b);
      else confirmDialog('🚜 Demolish ' + d.name + '?', 'You will get back ' + money(Math.round(buildCost(d) * (b.built ? 0.5 : 0.9))) + '.', 'Demolish', function () { demolish(b); });
    } else bulldozeTile(t.x, t.y);
    return;
  }
  const b = pickBuilding(t.wx, t.wy);
  if (b && b._tip > S.clock.runSec) { collectTip(b); selectBuilding(b); return; }
  const ag = pickAgent(t.wx, t.wy);
  if (ag) { showAgentInfo(ag); return; }
  selectBuilding(b);
  if (b) sfx('click');
  if (b && b.type === 'townhall') openCityHall();
}
/* Citizens & vehicles can be inspected to see their AI state */
function pickAgent(wx, wy) {
  const r = 9 / Math.max(0.6, CAM.zoom);
  let best = null, bd = r;
  AG.vehicles.forEach(function (v) { const d = Math.hypot(v.x - wx, v.y - wy); if (d < bd) { bd = d; best = { v: v }; } });
  AG.citizens.forEach(function (c) { if (c.inside || c.driving) return; const d = Math.hypot(c.x - wx, c.y - wy + 5); if (d < bd) { bd = d; best = { c: c }; } });
  return best;
}
function needBar(label, v) { return barRow(label, v, 100, v > 50 ? '#06d6a0' : v > 25 ? '#ffd166' : '#ef476f', Math.round(v) + '%'); }
function showAgentInfo(a) {
  sfx('click');
  if (a.v) {
    const v = a.v;
    const dest = v.dest ? bdef(v.dest).name : (v.type === 'bus' ? 'Next bus stop' : 'Roaming');
    showModal(({ car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', ambulance: '🚑', firetruck: '🚒', race: '🏎️', police: '🚓', garbage: '🚛', tanker: '⛽', tram: '🚋', shuttle: '🚐', maint: '🛠️' }[v.type] || '🚗') + ' ' + v.type.toUpperCase(),
      '<div class="card"><div class="between small"><span>Destination</span><b>' + dest + '</b></div><div class="between small"><span>Speed</span><b>' + Math.round(v.speed) + ' / ' + Math.round(v.maxSpeed) + '</b></div><div class="between small"><span>Lane</span><b>' + (S.p9 ? 'Lane ' + ((v.lane || 0) + 1) + ' of ' + lanesPerDir(v.path[Math.min(v.seg, v.path.length - 1)]) + ' (right-hand)' : 'Right-hand') + '</b></div><div class="between small"><span>Traffic state</span><b>' + (v.state || 'moving') + '</b></div>' + (v.passenger ? '<div class="between small"><span>Passenger</span><b>Citizen #' + v.passenger.id + '</b></div>' : '') + (v.line && lineById(v.line) ? '<div class="between small"><span>Line</span><b>' + esc(lineById(v.line).name) + ' · ' + (v.pax || []).length + ' aboard</b></div>' : '') + (v.routeInfo ? '<p class="small">🧭 ' + esc(routeInfoText(v.routeInfo)) + '</p>' : '') + '</div>');
    return;
  }
  const c = a.c, n = c.needs;
  const home = citizenBuilding(c.home), work = citizenBuilding(c.work);
  const mm = c.mem || {}, nm = function (id) { const b = citizenBuilding(id); return b ? BUILDINGS[b.type].name : '—'; };
  const persHtml = '<div class="card"><div class="between small"><span>Personality</span><b>' + ((PERSONALITIES[c.pers] || {}).icon || '') + ' ' + String(c.pers || '').replace('_', ' ') + '</b></div><div class="between small"><span>Favourite shop</span><b>' + nm(mm.favShop) + '</b></div><div class="between small"><span>Favourite restaurant</span><b>' + nm(mm.favFood) + '</b></div><div class="between small"><span>Favourite venue</span><b>' + nm(mm.favFun) + '</b></div><div class="between small"><span>Last event</span><b>' + (mm.lastEvent || '—') + '</b></div>' + (c.bubble && c.bubble.until > FX.time ? '<p class="small">💬 “' + esc(c.bubble.text) + '”</p>' : '') + '</div>';
  showModal((c.tourist ? '🧳 Tourist #' : '🧑 Citizen #') + c.id,
    '<div class="card"><div class="between small"><span>AI state</span><b class="tag b">' + c.state + '</b></div><div class="between small"><span>Home</span><b>' + (home ? bdef(home).name : '—') + '</b></div><div class="between small"><span>Workplace</span><b>' + (c.tourist ? 'On vacation' : work ? bdef(work).name : 'Unemployed') + '</b></div><div class="between small"><span>Money</span><b>' + money(c.money) + '</b></div><div class="between small"><span>Happiness</span><b>' + Math.round(c.happiness) + '%</b></div></div>' +
    '<div class="card">' + needBar('🍔 Food', n.food) + needBar('🏠 Housing', n.housing) + needBar('🎉 Entertainment', n.fun) + needBar('💼 Work', n.work) + needBar('🛍️ Shopping', n.shopping) + needBar('😴 Energy / Rest', c.energy) + '</div>' + persHtml + citizenDetailsHtml(c) + '<p class="small">Citizens follow a daily schedule (wake 06, work 08, lunch 12, shopping 17, fun 19, home 22) shaped by their personality and memory, and walk or drive along the road network (A* pathfinding).</p>');
}
function onPointerDown(e) {
  canvas.setPointerCapture(e.pointerId);
  UI.lastPointer = e.pointerType;
  INPUT.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (INPUT.pointers.size === 2) {
    const p = Array.from(INPUT.pointers.values());
    INPUT.pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: CAM.zoom };
    INPUT.down = null; return;
  }
  if (e.button === 2) return;
  INPUT.down = { x: e.clientX, y: e.clientY, camX: CAM.x, camY: CAM.y, t: performance.now() };
  INPUT.moved = false;
  if (p9PointerDown(e)) { INPUT.down.tool = true; return; }      // Part 9: world brush / region selector
  if (UI.tool === 'road' && e.pointerType === 'mouse') {
    const t = tileAtScreen(e.clientX, e.clientY);
    UI.roadDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, mouse: true };
  }
  if (UI.tool === 'zone' && e.pointerType === 'mouse') {
    const t = tileAtScreen(e.clientX, e.clientY);
    UI.zoneDrag = { x0: t.x, y0: t.y, x1: t.x, y1: t.y, mouse: true };
  }
}
function onPointerMove(e) {
  const t = tileAtScreen(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') UI.hover = t;
  if (!INPUT.pointers.has(e.pointerId)) return;
  INPUT.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (INPUT.pinch && INPUT.pointers.size >= 2) {
    const p = Array.from(INPUT.pointers.values());
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    const before = screenToWorld(mid.x, mid.y);
    CAM.zoom = clamp(INPUT.pinch.zoom * d / Math.max(10, INPUT.pinch.d), 0.3, 2.6);
    const after = screenToWorld(mid.x, mid.y);
    CAM.x += before.x - after.x; CAM.y += before.y - after.y; clampCamera();
    return;
  }
  const dn = INPUT.down; if (!dn) return;
  if (dn.tool) { p9PointerMove(e); return; }
  const dx = e.clientX - dn.x, dy = e.clientY - dn.y;
  if (!INPUT.moved && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 5 : 10)) INPUT.moved = true;
  if (UI.roadDrag && UI.roadDrag.mouse) { UI.roadDrag.x1 = t.x; UI.roadDrag.y1 = t.y; return; }
  if (UI.zoneDrag && UI.zoneDrag.mouse) { UI.zoneDrag.x1 = t.x; UI.zoneDrag.y1 = t.y; return; }
  if (INPUT.moved) {
    let px = dx, py = dy;
    const pr = PHOTO.on ? PHOTO.rot : CAM.rot;
    if (pr) { const c = Math.cos(-pr), sn = Math.sin(-pr); px = dx * c - dy * sn; py = dx * sn + dy * c; }
    if (GSET.invertPan) { px = -px; py = -py; }
    CAM.x = dn.camX - px / CAM.zoom; CAM.y = dn.camY - py / CAM.zoom; clampCamera();
    if (e.pointerType !== 'mouse') UI.hover = null;
  }
}
function onPointerUp(e) {
  INPUT.pointers.delete(e.pointerId);
  if (INPUT.pointers.size < 2) INPUT.pinch = null;
  const dn = INPUT.down; INPUT.down = null;
  if (!dn) return;
  if (dn.tool) { p9PointerUp(); return; }
  if (UI.roadDrag && UI.roadDrag.mouse) {
    const rd = UI.roadDrag; UI.roadDrag = null;
    placeRoads(lineTiles(rd.x0, rd.y0, rd.x1, rd.y1));
    return;
  }
  if (UI.zoneDrag && UI.zoneDrag.mouse) {
    const zd = UI.zoneDrag; UI.zoneDrag = null;
    const n = paintZone(rectTiles(zd.x0, zd.y0, zd.x1, zd.y1), UI.zoneType);
    if (n) toast(ZONES[UI.zoneType].icon + ' ' + n + ' tiles ' + (UI.zoneType ? 'zoned ' + ZONES[UI.zoneType].name : 'unzoned'), 'good');
    return;
  }
  if (!INPUT.moved && e.button !== 2) {
    if (PHOTO.on) return;
    if (e.pointerType !== 'mouse') UI.hover = tileAtScreen(e.clientX, e.clientY);
    handleTap(e.clientX, e.clientY);
  }
}
function cancelAction() {
  if (PHOTO.on) { exitPhoto(); return; }
  if (S && S.p9 && p9CancelTools()) return;
  if (!$('paletteWrap').classList.contains('hidden')) { closePalette(); return; }
  if (UI.dialog) return;
  if (!$('zonePicker').classList.contains('hidden') && UI.tool !== 'zone') $('zonePicker').classList.add('hidden');
  if (!$('layersPop').classList.contains('hidden')) { $('layersPop').classList.add('hidden'); return; }
  if ($('modalWrap').classList.contains('show')) { closeModal(); return; }
  if (UI.tool !== 'select') { setTool('select'); return; }
  if (UI.selected) { selectBuilding(null); return; }
  if (UI.panel) { closeLeft(); return; }
  if (STARTED) openPauseMenu();
}

function bindInput() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', function (e) { INPUT.pointers.delete(e.pointerId); INPUT.down = null; INPUT.pinch = null; });
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') UI.hover = null; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); cancelAction(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    if (e.deltaY > 0 && CAM.zoom <= 0.301) { UI.zoomOut = (UI.zoomOut || 0) + 1; if (UI.zoomOut >= 3 && STARTED) { UI.zoomOut = 0; openWorldMap(); } } else UI.zoomOut = 0;   // leaving the city → world map
    CAM.zoom = clamp(CAM.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.3, 2.6);
    const after = screenToWorld(e.clientX, e.clientY);
    CAM.x += before.x - after.x; CAM.y += before.y - after.y; clampCamera();
  }, { passive: false });
  window.addEventListener('resize', function () { resizeCanvas(); });
  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); if ($('paletteWrap').classList.contains('hidden')) openPalette(); else closePalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'a') { e.preventDefault(); if (S) openAdmin(); return; }
    if (e.key === 'F3') { e.preventDefault(); if (STARTED) toggleDebug6(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!STARTED) return;
    if (UI.dialog && (k === 'enter' || k === ' ')) { e.preventDefault(); advanceDialogue(); return; }
    if (k === 'escape') { cancelAction(); return; }
    if (PHOTO.on) { if (k === 'f') exitPhoto(); return; }
    if ($('modalWrap').classList.contains('show')) return;
    if (k === 'b') openPanel('build');
    else if (k === 'm') openWorldMap();
    else if (k === 'c') openPanel('city');
    else if (k === 'r') { if (UI.tool === 'build' && UI.placing) rotatePlacement(); else openPanel('research'); }
    else if (k === 'q') setRightTab('quests');
    else if (k === 't') setTool(UI.tool === 'road' ? 'select' : 'road');
    else if (k === 'p' || k === ' ') { e.preventDefault(); setSpeed(S.settings.speed === 0 ? 1 : 0); toast(S.settings.speed === 0 ? '⏸️ Paused' : '▶ Resumed', ''); }
    else if (k === 'x') setTool('bulldoze');
    else if (k === 'z') setTool('zone');
    else if (k === 'l') showLayers();
    else if (k === 'd') toggleDashboard();
    else if (k === 'f') enterPhoto();
    else if (k === 'h') openAdvisorReport();
    else if (k === '+' || k === '=' || k === '.') stepSpeed(1);
    else if (k === '-' || k === ',') stepSpeed(-1);
    else if (k === 'n') showHeatPicker();
    else if (k === 'g') openStatsCenter();
    else if (k >= '1' && k <= '9') setSpeed(SIM_SPEEDS[+k]);
  });
  // Keep panels from rebuilding while the user interacts with them
  ['lpBody', 'rpBody', 'modalBody', 'bottomInfo'].forEach(function (id) {
    const el = $(id);
    el.addEventListener('pointerdown', function () { UI.busyUntil = performance.now() + 1200; });
    el.addEventListener('pointermove', function (e) { if (e.buttons) UI.busyUntil = performance.now() + 800; });
    el.addEventListener('scroll', function () { UI.busyUntil = performance.now() + 500; }, { passive: true });
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && STARTED) saveGame(true); });
  window.addEventListener('beforeunload', function () { if (STARTED) saveGame(true); });
}
function setSpeed(s) {
  S.settings.speed = SIM_SPEEDS.indexOf(s) >= 0 ? s : 1;
  renderSpeedUI();
}

/* Central click dispatcher for all [data-act] buttons */
function bindUI() {
  document.querySelectorAll('.navbtn[data-panel]').forEach(function (b) { b.addEventListener('click', function () { openPanel(b.dataset.panel); }); });
  $('navSettings').onclick = function () { closeLeft(); openSettings(); sfx('click'); };
  $('lpClose').onclick = closeLeft;
  $('modalClose').onclick = closeModal;
  $('modalWrap').addEventListener('click', function (e) { if (e.target.id === 'modalWrap') closeModal(); });
  $('settingsBtn').onclick = function () { openSettings(); sfx('click'); };
  $('dashBtn').onclick = function () { toggleDashboard(); };
  $('layersBtn').onclick = function () { showLayers(); sfx('click'); };
  $('logo').onclick = function () { openCityHall(); sfx('click'); };
  $('rightToggle').onclick = function () { toggleRight(); sfx('click'); };
  document.querySelectorAll('[data-rtab]').forEach(function (b) { b.onclick = function () { setRightTab(b.dataset.rtab); sfx('click'); }; });
  $('speedPause').onclick = function () { setSpeed(S.settings.speed === 0 ? (UI.lastSpeed || 1) : (UI.lastSpeed = S.settings.speed, 0)); sfx('click'); };
  $('speedDown').onclick = function () { stepSpeed(-1); sfx('click'); };
  $('speedUp').onclick = function () { stepSpeed(1); sfx('click'); };
  $('speedLabel').onclick = function () { setSpeed(1); sfx('click'); };
  $('roadToolBtn').addEventListener('contextmenu', function (e) { e.preventDefault(); showRoadPicker(); });
  $('overlayBtn').oncontextmenu = function (e) { e.preventDefault(); showHeatPicker(); };
  $('heatBtn').onclick = function () { showHeatPicker(); sfx('click'); };
  $('statsBtn').onclick = function () { openStatsCenter(); sfx('click'); };
  bindMinimap();
  document.querySelectorAll('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(UI.tool === b.dataset.tool ? 'select' : b.dataset.tool); sfx('click'); if (b.dataset.tool === 'road' && UI.tool === 'road') toast(IS_TOUCH ? 'Tap start and end tiles, then confirm' : 'Click & drag to draw roads', ''); }; });
  $('overlayBtn').onclick = function () { setHeatmap(OVERLAYS[(UI.overlay + 1) % OVERLAYS.length]); sfx('click'); };
  $('centerBtn').onclick = function () { CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; sfx('click'); };
  $('placeConfirm').onclick = function () { const f = UI.pendingAction; UI.pendingAction = null; $('placeBar').classList.add('hidden'); if (f) f(); };
  $('placeRotate').onclick = function () { UI.pendingAction = null; UI.ghost = null; UI.roadDrag = null; $('placeBar').classList.add('hidden'); };
  $('placeRotateBtn').onclick = function () { rotatePlacement(); };
  $('mobRotate').onclick = function () { rotatePlacement(); };
  $('advisorBtn').onclick = function () { openAdvisorReport(); };
  $('photoBtn').onclick = function () { enterPhoto(); };
  $('paletteBtn').onclick = function () { openPalette(); };
  $('ftClose').onclick = hideFirstTip;
  bindPalette(); bindTooltips();
  document.addEventListener('input', function (e) {
    if (e.target.id === 'buildSearch') { UI.buildSearch = e.target.value; const w = $('buildGridWrap'); if (w) w.innerHTML = buildGridHtml(); }
  });
  $('advGo').onclick = function () { if (UI.advice) doAdviceAction(UI.advice.act); sfx('click'); };
  $('advDismiss').onclick = function () { if (UI.advice) { S.tutorial.dismissed[UI.advice.id] = S.clock.runSec + 180; showAdvice(null); } };
  $('tutNext').onclick = function () { tutStep++; showTutStep(); sfx('click'); };
  $('tutSkip').onclick = function () { tutStep = TUTORIAL.length; showTutStep(); };

  document.addEventListener('input', function (e) {
    const k = e.target.dataset && e.target.dataset.input;
    if (k === 'tax') { S.city.tax = clamp(Math.round(+e.target.value), 0, MAX_TAX); const tv = $('taxVal'); if (tv) tv.textContent = S.city.tax + '%'; UI.busyUntil = performance.now() + 800; }
  });
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
    UI.busyUntil = 0;
    const b = UI.selected;
    switch (a) {
      case 'closeModal': closeModal(); break;
      case 'mega': startMegaStage(id); renderLeft(true); break;
      case 'global': goGlobal(id); renderLeft(true); break;
      case 'aibuy': UI.aiStockSel = id; tradeAIShares(id, +v); renderLeft(true); break;
      case 'evolve': if (b) { evolveBuilding(b, false); if (UI.selected) renderBottomInfo(); } break;
      case 'future': researchFuture(); renderLeft(true); break;
      case 'genchallenge': generateChallenge(); closeModal(); openChallengesModal(); break;
      case 'statscenter': openStatsCenter(); break;
      case 'rankcat': UI.rankCat = v; renderLeft(true); break;
      case 'invest': startInvestment(id, +v); renderLeft(true); break;
      case 'ipo': { const sb = MAP.byId.get(+id); startupExit(sb); renderLeft(true); if (UI.selected) renderBottomInfo(); } break;
      case 'lfocus': setLineFocus(id, +v); renderLeft(true); break;
      case 'lprice': { const pr = String(v).split(':'); setLinePrice(id, +pr[0], +pr[1]); renderLeft(true); } break;
      case 'adtier': runAdTier(id, v); renderLeft(true); break;
      case 'biz': if (b) { businessAction(b, v); renderBottomInfo(); } break;
      case 'reviews': if (b) openReviews(b); break;
      case 'challenges': openChallengesModal(); break;
      case 'museum': openMuseum(); break;
      case 'advisor': openAdvisorReport(); break;
      case 'admin': closeModal(); openAdmin(); break;
      case 'downloadSave': downloadSaveFile(); break;
      case 'storyreplay': S.p5.story.phase = 'intro'; clearDialogues(); storyTick(); break;
      case 'cityhall': openCityHall(); break;
      case 'transfer': transferToBudget(+v); if ($('modalTitle').textContent.indexOf('City Hall') >= 0) openCityHall(); else renderLeft(true); break;
      case 'acquire': confirmDialog('🦈 Acquire ' + aiDef(id).name + '?', 'Price: <b>' + money(aiValue(id)) + '</b>. All its buildings and cash become yours.', 'Acquire', function () { acquireAI(id); renderLeft(true); }); break;
      case 'mprice': setMarketPrice(id, +v); renderLeft(true); break;
      case 'advert': runAdCampaign(id); renderLeft(true); break;
      case 'caccept': acceptContract(+id); renderLeft(true); break;
      case 'cdecline': declineContract(+id); renderLeft(true); break;
      case 'tmode': S.trade.mode[id] = v; sfx('click'); renderLeft(true); break;
      case 'diplo': UI.worldSel = id; diploAction(id, v); renderLeft(true); break;
      case 'worldmap': openWorldMap(); break;
      case 'ptabw': closeModal(); openPanel('world', v); break;
      case 'space': launchSpace(); renderLeft(true); break;
      case 'recipe': if (b) { setRecipe(b, v); renderBottomInfo(); } break;
      case 'skin': if (b) { cycleSkin(b); renderBottomInfo(); } break;
      case 'buyai': if (b) { buyBuildingFromAI(b); renderBottomInfo(); } break;
      case 'zonetype': UI.zoneType = +v; setTool('zone'); break;
      case 'layer': toggleLayer(el.dataset.k); renderLeft(true); break;
      case 'dash': toggleDashboard(); break;
      case 'showdecision': { const dd = S.events.decisions.find(function (x) { return x.uid === +el.dataset.uid; }); if (dd) showDecision(dd); } break;
      case 'decide': resolveDecision(+el.dataset.uid, +v, false); break;
      case 'openpanel': closeModal(); openPanel(v); break;
      case 'openlegacy': closeModal(); openPanel('city', 'prestige'); break;
      case 'tool': setTool(v); break;
      case 'mainmenu': closeModal(); returnToMenu(); break;
      case 'ptab': UI.tabs[UI.panel] = v; $('lpBody').scrollTop = 0; renderLeft(true); sfx('click'); break;
      case 'pickBuild': startPlacing(BUILDINGS[id]); break;
      case 'policy': S.workers.salaryPolicy = v; renderLeft(true); sfx('click'); break;
      case 'expand': expandLand(); renderLeft(true); break;
      case 'overlaySet': setHeatmap(OVERLAYS[+v] || 'NONE'); renderLeft(true); break;
      case 'found': foundCompany(id); renderLeft(true); break;
      case 'product': launchProduct(id); renderLeft(true); break;
      case 'sellShares': tradeOwnShares(id, true); renderLeft(true); break;
      case 'buyShares': tradeOwnShares(id, false); renderLeft(true); break;
      case 'stockSel': UI.stockSel = id; renderLeft(true); break;
      case 'buy': tradeStock(id, +el.dataset.q); UI.stockSel = id; renderLeft(true); break;
      case 'sell': tradeStock(id, -(+el.dataset.q)); renderLeft(true); break;
      case 'loan': takeLoan(+v); renderLeft(true); break;
      case 'repay': repayLoan(+v); renderLeft(true); break;
      case 'research': researchTech(id); renderLeft(true); break;
      case 'ppbuy': buyPPUpgrade(id); renderLeft(true); break;
      case 'prestige': confirmDialog('⭐ Prestige?', 'Your city will restart. You keep PP, upgrades, achievements and gain <b>+' + prestigeGain(false) + ' PP</b>.', 'Prestige', function () { doPrestige(false); }); break;
      case 'ngplus': confirmDialog('♾️ Start New Game+?', 'Bigger map, new tech &amp; landmark, harder economy. Gain <b>+' + prestigeGain(true) + ' PP</b>.', 'Start NG+', function () { doPrestige(true); }); break;
      case 'host': hostEvent(id); renderRight(); break;
      case 'hint': doAdviceAction({ type: 'build', cat: el.dataset.cat, id: id }); break;
      case 'achievements': openAchievements(); break;
      case 'upgrade': if (b) { upgradeBuilding(b); renderBottomInfo(); } break;
      case 'interior': if (b) openInterior(b); break;
      case 'demolish': if (b) { const d = bdef(b); confirmDialog('🗑️ Demolish ' + d.name + '?', 'Refund: ' + money(Math.round(buildCost(d) * (b.built ? 0.5 : 0.9))) + '.', 'Demolish', function () { demolish(b); }); } break;
      case 'repair': if (b) { repairBuilding(b); renderBottomInfo(); } break;
      case 'collectTip': if (b) { collectTip(b); renderBottomInfo(); } break;
      case 'wMinus': { const t = UI.interior || b; if (t) { setWorkers(t, t.workers - Math.max(1, Math.round(bdef(t).workers / 10))); renderBottomInfo(); UI.busyUntil = 0; updateInteriorStats(); } } break;
      case 'wPlus': { const t = UI.interior || b; if (t) { setWorkers(t, t.workers + Math.max(1, Math.round(bdef(t).workers / 10))); renderBottomInfo(); UI.busyUntil = 0; updateInteriorStats(); } } break;
      case 'deselect': selectBuilding(null); break;
      case 'set': S.settings[el.dataset.k] = v; if (el.dataset.k === 'quality') { FX.particles.length = 0; } if (el.dataset.k === 'theme') applyTheme(); syncGSETFromGame(); openSettings(); sfx('click'); break;
      case 'toggle': {
        const k = el.dataset.k; S.settings[k] = !S.settings[k];
        if (k === 'music') { if (S.settings.music) SND.startMusic(); else SND.stopMusic(); }
        if (k === 'sound' && !S.settings.sound) SND.setRain(false);
        if (k === 'showFps') $('fpsBox').classList.toggle('hidden', !S.settings.showFps);
        if (k === 'autoQuality' && !S.settings.autoQuality) { PERF.scale = 1; PERF.noGlow = false; }
        applyAccessibility(); syncGSETFromGame();
        openSettings(); sfx('click');
      } break;
      case 'saveNow': saveGame(false); break;
      case 'exportSave': {
        const code = exportSave();
        showModal('📤 Export Save', '<p class="small">Copy this code to back up or move your city:</p><textarea id="exportBox" style="width:100%;height:160px;margin-top:8px;background:#0f1226;color:#9ff;border-radius:8px;border:1px solid var(--line);padding:8px;font-size:10px;user-select:text;-webkit-user-select:text" readonly>' + code + '</textarea><div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn green" id="copyExp">📋 Copy</button></div>');
        $('copyExp').onclick = function () { const t = $('exportBox'); t.select(); try { navigator.clipboard.writeText(t.value).then(function () { toast('Copied!', 'good'); }, function () { document.execCommand('copy'); toast('Copied!', 'good'); }); } catch (err) { document.execCommand('copy'); toast('Copied!', 'good'); } };
      } break;
      case 'importSave': openImportDialog(); break;
      case 'resetGame': confirmDialog('🗑️ Reset everything?', 'This permanently deletes your city, prestige and achievements.', 'Delete', function () {
        try { Store.removeItem(SAVE_KEY); Store.removeItem(SAVE_BACKUP_KEY); } catch (err) { }
        const slot = S.slot || 1;
        clearDialogues(); S = defaultState(); S.slot = slot; resetSim(); initMap(true); generateCity(); onMapChanged(); resetAgents(); selectBuilding(null); econTick(1); computeDistricts();
        CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2; saveGame(true); toast('New city created', 'good');
      }); break;
    }
  });
}

function recordHistory() {
  const h = S.statistics.history;
  const push = function (k, v) { h[k].push(+(+v).toFixed(2)); if (h[k].length > 150) h[k].shift(); };
  push('pop', S.city.population); push('rev', SIM.income); push('crime', S.city.crime); push('pol', S.city.pollution); push('emp', (1 - SIM.unemployment) * 100);
  push('money', S.money); push('inc', SIM.income || 0); push('exp', SIM.expenses || 0); push('traffic', SIM.traffic); push('hap', S.city.happiness);
  push('prod', SIM.goodsProd || 0); push('cons', SIM.goodsUse || 0); push('tour', S.city.tourists); push('edu', S.city.education); push('health', SIM.cov.health * 100); push('cpi', S.p6.econ.cpi);
}
function adaptivePerformance() {
  if (!S.settings.autoQuality) return;
  if (PERF.fps < 30) {
    PERF.low++; PERF.high = 0;
    if (PERF.low >= 2) { PERF.scale = Math.max(0.35, PERF.scale - 0.15); PERF.noGlow = true; PERF.low = 0; }
  } else if (PERF.fps > 50) {
    PERF.high++; PERF.low = 0;
    if (PERF.high >= 4 && PERF.scale < 1) { PERF.scale = Math.min(1, PERF.scale + 0.1); PERF.high = 0; if (PERF.scale >= 0.99) PERF.noGlow = false; }
  } else { PERF.low = 0; PERF.high = 0; }
}
function cosmeticEffects(dt) {
  // Money particles from earning buildings
  FX.coinTimer = (FX.coinTimer || 0) - dt;
  if (FX.coinTimer <= 0) {
    FX.coinTimer = 2.2;
    const earners = MAP.lists.commercial.concat(MAP.lists.factories).filter(function (b) { return b._rev > 0; });
    if (earners.length) {
      const b = pick(earners), c = buildingCenter(b);
      spawnParticles(c.x, c.y - buildingHeight(b) - 6, 'coin', 1);
      floatText(c.x, c.y - buildingHeight(b) - 12, '+' + money(b._rev * 2.2, b._rev < 5 ? 1 : undefined), '#ffd166');
    }
  }
  // Global event visuals
  const nf = nightFactor();
  FX.evTimer = (FX.evTimer || 0) - dt;
  if (FX.evTimer <= 0) {
    FX.evTimer = 0.35;
    const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
    if ((activeEvent('fireworks') || activeEvent('festival')) && nf > 0.3) {
      const x = rand(tl.x, br.x), y = rand(tl.y, br.y) * 0.7 + tl.y * 0.3;
      spawnParticles(x, y, 'firework', activeEvent('fireworks') ? 30 : 16);
      if (Math.random() < 0.4) SND.noise(0.25, 0.08, 1800);
    }
    if (activeEvent('festival') && nf <= 0.3) { const p = pick(MAP.lists.parks.concat(MAP.lists.ENTERTAINMENT)); if (p) { const c = buildingCenter(p); spawnParticles(c.x, c.y - 20, 'confetti', 6); } }
    if (activeEvent('music')) { const p = pick(MAP.lists.parks.concat(MAP.lists.ENTERTAINMENT)); if (p) { const c = buildingCenter(p); spawnParticles(c.x, c.y - 20, 'note', 2); } }
    if (currentSeason().id === 'autumn' && Math.random() < 0.5) spawnParticles(rand(tl.x, br.x), rand(tl.y, br.y), 'leaf', 1);
  }
}
function updateHud() {
  if (S.settings.showFps) {
    $('fpsBox').textContent = 'FPS ' + Math.round(PERF.fps) + '  TPS ' + Game.tpsMeasured.toFixed(0) + (PERF.scale < 1 ? ' (adaptive ' + Math.round(PERF.scale * 100) + '%)' : '') + '\nNPC ' + AG.citizens.length + '  Vehicles ' + AG.vehicles.length + '\nParticles ' + FX.particles.length + '  Quality ' + S.settings.quality;
  }
  if (DEBUG) {
    $('debugBox').classList.remove('hidden');
    $('debugBox').textContent = 'DEBUG MODE\nFPS: ' + Math.round(PERF.fps) + '\nGame time: Day ' + gameDay() + ' ' + $('tClock').textContent + '\nMoney/sec: ' + signMoney(SIM.net) + '\nNPC: ' + AG.citizens.length + '  Vehicles: ' + AG.vehicles.length + '\nBuildings: ' + S.buildings.list.length + '\nTraffic: ' + SIM.traffic.toFixed(1) + '\nPopulation: ' + Math.floor(S.city.population) + '\nRunSec: ' + Math.floor(S.clock.runSec);
  }
}

let lastTs = 0, uiAcc = 0, panelAcc = 0, saveAcc = 0, advAcc = 0, dashAcc = 0, issueAcc = 0, miniAcc = 0;
/* Main loop (Loop 2.0): rendering every frame; the simulation advances in fixed ticks via the Game engine. */
function loop(ts) {
  const tWork = performance.now();
  const dt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  FX.time += dt;
  let alpha = 1;
  try {
    pollGamepad(dt);
    if (STARTED) {
      const simDt = dt * (typeof safeSpeed === 'function' ? safeSpeed(S.settings.speed) : S.settings.speed);      // Part 12: safe speed limit on slow devices
      if (simDt > 0) {
        S.clock.gameSec += simDt * TIME_SCALE;
        S.clock.runSec += simDt;
        Game.step(simDt);           // interval systems: NPC AI 0.25s, economy 1s, market 5s, …
      }
      alpha = Game.advance(simDt);  // fixed 20 TPS: construction, citizens, traffic, ships, incidents
      Game.measure(dt);
      S.statistics.totals.playSec += dt;
      cosmeticEffects(dt);
      sirenAudioTick(dt);
      UI.idleTimer += dt;
      uiAcc += dt; panelAcc += dt; saveAcc += dt; advAcc += dt; dashAcc += dt; issueAcc += dt;
      if (uiAcc >= 0.25) { uiAcc = 0; refreshTopbar(); }
      if (issueAcc >= 1) { issueAcc = 0; renderIssues(); renderDebug6(); }
      miniAcc += dt; if (miniAcc >= 0.25) { miniAcc = 0; drawMinimap(false); }
      if (dashAcc >= 1) { dashAcc = 0; recordDash(); renderDashboard(); }
      if (panelAcc >= 1) {
        panelAcc = 0;
        questTick(); renderLeft(false);
        if (UI.rtab !== 'notifs') renderRight();
        renderBottomInfo(); updateInteriorStats();
      }
      if (advAcc >= 3) { advAcc = 0; advisorTick(); }
      if (saveAcc >= autosaveInterval()) { saveAcc = 0; if (GSET.autosave) { saveGame(true); if (typeof Log !== 'undefined') Log.debug('Autosave'); } }
      recoveryTick(dt);
    }
    updateWeather(dt);
    updateFX(dt);
    updateRockets(dt);
    updateCinematic(dt);
    updateCameraFly(dt);
    if (STARTED) p9FrameTick(dt);
  } catch (err) {
    logError('Loop', err);
    if (!FX.errShown) { FX.errShown = true; toast('⚠️ Recovered from an error: ' + err.message, 'bad'); setTimeout(function () { FX.errShown = false; }, 15000); }
  }
  if (!document.hidden) { const tr = performance.now(); try { withInterpolation(alpha, render); } catch (err) { logError('Render', err); } PERF.renderMs = (PERF.renderMs || 0) * 0.9 + (performance.now() - tr) * 0.1; }   // minimized: simulate, don't draw
  PERF.frameMs = (PERF.frameMs || 0) * 0.9 + (performance.now() - tWork) * 0.1;   // CPU time per frame (F3)
  PERF.frames++; PERF.acc += dt;
  if (PERF.acc >= 1) { PERF.fps = PERF.frames / PERF.acc; PERF.frames = 0; PERF.acc = 0; adaptivePerformance(); updateHud(); }
  requestAnimationFrame(loop);
}

/* Offline progress: capped, uses the lower of saved vs recomputed income (anti-exploit) */
function applyOffline() {
  let elapsed = (Date.now() - S.lastSaveTime) / 1000;
  if (!isFinite(elapsed) || elapsed < 0) elapsed = 0;          // clock moved backwards → ignore
  elapsed = Math.min(elapsed, MAX_OFFLINE_SEC);
  econTick(1);
  constructionTick(Math.min(elapsed, 900));
  const rate = Math.min(S.lastNet, Math.max(0, SIM.pNet || 0));
  const brate = Math.min(S.lastBudgetNet || 0, Math.max(0, SIM.bNet || 0));
  const earned = rate * elapsed * OFFLINE_EFFICIENCY, bEarned = brate * elapsed * OFFLINE_EFFICIENCY;
  if (elapsed > 60 && (earned > 1 || bEarned > 1)) {
    S.money = Math.min(MONEY_CAP, S.money + earned);
    S.budget = Math.min(MONEY_CAP, S.budget + bEarned);
    return { sec: elapsed, earned: earned, budget: bEarned };
  }
  return null;
}

/* --- Main menu (PLAY CITY / NEW CITY / LOAD CITY / CITY BUILDER / SETTINGS / STATISTICS / ACHIEVEMENTS) --- */
const MENU = { pending: null, offline: null, opts: { difficulty: 'NORMAL', size: 40, slot: 1, sandbox: false } };
function showMenu(screen) {
  ['menuMain', 'menuNew', 'menuLoad', 'menuStats', 'menuProfile', 'menuChallenges', 'menuScenario', 'menuSandbox'].forEach(function (id) { $(id).classList.add('hidden'); });
  const ts = $('titleScreen'); ts.style.display = ''; ts.classList.remove('fade');
  if (screen === 'new') { renderNewCity(false); $('menuNew').classList.remove('hidden'); }
  else if (screen === 'builder' || screen === 'sandbox') { renderSandboxScreen(); $('menuSandbox').classList.remove('hidden'); }
  else if (screen === 'scenario') { renderScenarioScreen(); $('menuScenario').classList.remove('hidden'); }
  else if (screen === 'load') { renderSlots(); $('menuLoad').classList.remove('hidden'); }
  else if (screen === 'stats') { $('statsList').innerHTML = statsHtml(); $('menuStats').classList.remove('hidden'); }
  else if (screen === 'profile') { const r = function () { $('profileList').innerHTML = profileHtml(false); bindProfileButtons($('profileList'), r); }; r(); $('menuProfile').classList.remove('hidden'); }
  else if (screen === 'challenges') { const r = function () { $('challengeList').innerHTML = challengeCardsHtml(false); bindChallengeButtons($('challengeList'), r); }; r(); $('menuChallenges').classList.remove('hidden'); }
  else if (screen === 'admin') { renderContinueCard(); $('menuMain').classList.remove('hidden'); openAdmin(); }
  else if (screen === 'showcase') { renderContinueCard(); $('menuMain').classList.remove('hidden'); if (slotInfo(S.slot || 1).exists) { STARTED = true; openShowcase(); STARTED = false; } else toast('Save a city first', 'bad'); }
  else {
    renderContinueCard(); $('menuMain').classList.remove('hidden');
    if (screen === 'settings') openSettings();
    if (screen === 'achievements') openAchievements();
  }
  sfx('click');
}
function fmtPlayTime(sec) { sec = Math.max(0, sec || 0); return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm'; }
function renderContinueCard() {
  const info = slotInfo(S.slot || activeSlot());
  $('continueCard').innerHTML = info.exists
    ? '<h3>🏙️ ' + esc(info.name) + (info.sandbox ? ' <span class="tag b">SANDBOX</span>' : '') + '</h3><p>CITY ' + String(info.n).padStart(2, '0') + ' · Pop ' + fmt(Math.floor(info.pop)) + ' · Lv ' + info.level + ' · ' + (DIFFICULTIES[info.difficulty] || DIFFICULTIES.NORMAL).name + ' · ' + info.size + '×' + info.size + ' · ⏱️ played ' + fmtPlayTime(info.playSec) + (info.saved ? ' · saved ' + new Date(info.saved).toLocaleString() : '') + '</p>'
    : '<h3>🆕 ' + esc(S.city.name) + '</h3><p>No saved city in CITY ' + String(S.slot || 1).padStart(2, '0') + ' yet. CONTINUE starts this freshly generated city (' + seedLabel() + '), or create your own with NEW CITY.</p>';
}
function segButtons(elId, items, cur, onPick) {
  const el = $(elId);
  el.innerHTML = items.map(function (it) { return '<button type="button" class="' + (it[0] === cur ? 'on' : '') + '" data-v="' + it[0] + '">' + it[1] + '</button>'; }).join('');
  el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { onPick(b.dataset.v); sfx('click'); }; });
}
function renderNewCity(sandbox) {
  const o = MENU.opts; o.sandbox = sandbox;
  $('newTitle').textContent = sandbox ? '🧱 City Builder (Sandbox)' : '🏗️ New City';
  if (!$('ncSeed').value) $('ncSeed').value = seedLabel(Math.floor(Math.random() * 1000000));
  segButtons('ncDiff', Object.keys(DIFFICULTIES).map(function (k) { return [k, DIFFICULTIES[k].name]; }), o.difficulty, function (v) { o.difficulty = v; renderNewCity(sandbox); });
  $('ncDiffDesc').textContent = sandbox ? 'Sandbox: unlimited money & budget, everything unlocked, no achievements.' : DIFFICULTIES[o.difficulty].desc;
  segButtons('ncSize', MAP_SIZES.map(function (m) { return [String(m.id), m.name]; }), String(o.size), function (v) { o.size = +v; renderNewCity(sandbox); });
  if (!o.mapType) { o.mapType = 'standard'; o.money = 1; o.economy = 'NORMAL'; o.disasters = 1; }
  segButtons('ncMap', Object.keys(MAP_TYPES).map(function (k) { return [k, MAP_TYPES[k].icon + ' ' + MAP_TYPES[k].name]; }), o.mapType, function (v) { o.mapType = v; renderNewCity(sandbox); });
  $('ncMapDesc').textContent = MAP_TYPES[o.mapType].desc;
  segButtons('ncMoney', [['0.5', 'Low'], ['1', 'Normal'], ['2', 'High'], ['5', 'Rich']], String(o.money), function (v) { o.money = +v; renderNewCity(sandbox); });
  segButtons('ncEcon', [['BOOM', '🚀 Boom'], ['NORMAL', '⚖️ Stable'], ['SLOWDOWN', '🐢 Slowdown'], ['RECESSION', '📉 Recession']], o.economy, function (v) { o.economy = v; renderNewCity(sandbox); });
  segButtons('ncDis', [['0', 'None'], ['0.5', 'Low'], ['1', 'Normal'], ['2', 'High']], String(o.disasters), function (v) { o.disasters = +v; renderNewCity(sandbox); });
  const slots = []; for (let n = 1; n <= SLOT_COUNT; n++) { const inf = slotInfo(n); slots.push([String(n), 'CITY ' + String(n).padStart(2, '0') + (inf.exists ? ' · ' + esc(inf.name) : ' · empty')]); }
  segButtons('ncSlot', slots, String(o.slot), function (v) { o.slot = +v; renderNewCity(sandbox); });
}
function createNewCity() {
  const o = MENU.opts;
  const name = ($('ncName').value || 'Block City').replace(/[<>]/g, '').trim().slice(0, 32) || 'Block City';
  let seed = parseSeed($('ncSeed').value); if (!isFinite(seed) || seed < 0) seed = Math.floor(Math.random() * 1000000);
  const go = function () {
    const settings = S ? S.settings : defaultSettings();
    S = defaultState(newMeta(), settings, null, null, { name: name, seed: seed, difficulty: o.difficulty, size: o.size, sandbox: o.sandbox, mapType: o.mapType || 'standard' });
    S.slot = o.slot; setActiveSlot(o.slot);
    const money = o.money || 1;
    S.money = Math.round(S.money * money); S.budget = Math.round(S.budget * Math.max(0.5, Math.sqrt(money)));
    S.p6.cfg = { disasters: o.disasters === undefined ? 1 : o.disasters, economy: o.economy || 'NORMAL', money: money };
    S.p5.econ.phase = S.p6.cfg.economy; S.p5.econ.until = 360;
    clearDialogues(); PROFILE.citiesCreated++; saveProfile();
    resetSim(); initMap(true); generateCity(); onMapChanged(); resetAgents(); econTick(1); computeDistricts();
    CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20; CAM.zoom = window.innerWidth < 820 ? 1.1 : 1.35;
    saveGame(true);
    startGame({ isNew: true, notes: ['City "' + name + '" generated from seed ' + seedLabel() + ' (' + DIFFICULTIES[o.difficulty].name + ', ' + MAP.W + '×' + MAP.H + ').'] });
  };
  if (slotInfo(o.slot).exists) confirmDialog('Overwrite slot ' + o.slot + '?', 'The city "' + esc(slotInfo(o.slot).name) + '" (and its Legacy progress) will be replaced.', 'Overwrite', go);
  else go();
}
function renderSlots() {
  let h = '';
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const inf = slotInfo(n);
    h += '<div class="slot"><div class="si">' + (inf.exists ? '<b>' + esc(inf.name) + (inf.sandbox ? ' 🧱' : '') + '</b>CITY ' + String(n).padStart(2, '0') + ' · Pop ' + fmt(Math.floor(inf.pop)) + ' · Lv ' + inf.level + ' · ' + (DIFFICULTIES[inf.difficulty] || DIFFICULTIES.NORMAL).name + ' · ⏱️ ' + fmtPlayTime(inf.playSec) + (inf.saved ? '<br>' + new Date(inf.saved).toLocaleString() : '') : '<b>CITY ' + String(n).padStart(2, '0') + '</b>' + (inf.corrupt ? 'Corrupted save (backup will be tried)' : 'Empty')) + '</div>' +
      (inf.exists || inf.corrupt ? '<button class="btn small green" data-slot-load="' + n + '">Load</button><button class="btn small red" data-slot-del="' + n + '">🗑️</button>' : '<button class="btn small" data-slot-new="' + n + '">New</button>') + '</div>';
  }
  $('slotList').innerHTML = h;
  document.querySelectorAll('[data-slot-load]').forEach(function (b) { b.onclick = function () { loadSlot(+b.dataset.slotLoad); }; });
  document.querySelectorAll('[data-slot-del]').forEach(function (b) { b.onclick = function () { const n = +b.dataset.slotDel; confirmDialog('Delete slot ' + n + '?', 'This cannot be undone.', 'Delete', function () { deleteSlot(n); renderSlots(); }); }; });
  document.querySelectorAll('[data-slot-new]').forEach(function (b) { b.onclick = function () { MENU.opts.slot = +b.dataset.slotNew; showMenu('new'); }; });
}
function loadSlot(n) {
  clearDialogues();
  const res = loadGame(n);
  setActiveSlot(n);
  resetSim(); resetAgents();
  const offline = res.isNew ? null : applyOffline();
  if (res.isNew) econTick(1);
  computeDistricts();
  CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20;
  startGame({ isNew: res.isNew, notes: res.notes, offline: offline });
}
function statsHtml() {
  const t = S.statistics.totals, m = S.meta;
  const row = function (k, v) { return '<div class="between small" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>' + k + '</span><b style="color:var(--text)">' + v + '</b></div>'; };
  return '<div class="card"><h3>🏙️ ' + esc(S.city.name) + '</h3>' +
    row('Population (peak)', fmt(Math.floor(S.city.population)) + ' (' + fmt(Math.floor(S.city.peakPop)) + ')') + row('City level', cityLevel() + ' — ' + cityLevelName()) +
    row('Buildings (yours / all)', builtCount() + ' / ' + S.buildings.list.length) + row('Reputation', Math.round(S.city.reputation)) +
    row('Contracts completed / failed', S.contracts.completed + ' / ' + S.contracts.failed) + row('Exports / imports (lifetime)', money(S.trade.exportTotal) + ' / ' + money(S.trade.importTotal)) + '</div>' +
    '<div class="card"><h3>📈 Lifetime</h3>' + row('Total revenue', money(t.revenue)) + row('Money spent', money(t.spent)) + row('Buildings constructed', fmt(t.built)) +
    row('Disasters survived', t.disasters) + row('Crises survived', t.crises) + row('Play time', Math.floor(t.playSec / 3600) + 'h ' + Math.floor((t.playSec % 3600) / 60) + 'm') +
    row('Best population', fmt(Math.floor(m.bestPop))) + row('City legacies / NG+', m.prestigeCount + ' / ' + m.ngLevel) + row('Legacy Points', fmt(m.pp)) +
    row('Achievements', ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; }).length + ' / ' + ACHIEVEMENTS.length) + '</div>';
}
function startGame(opts) {
  opts = opts || {};
  applyGlobalSettingsToGame();
  SND.init();
  $('titleScreen').classList.add('fade');
  setTimeout(function () { if (STARTED) $('titleScreen').style.display = 'none'; }, 550);
  STARTED = true;
  Log.info('City started: "' + S.city.name + '" (' + seedLabel() + ', slot ' + (S.slot || 1) + ', ' + (opts.isNew ? 'new city' : 'loaded save') + ')');
  selectBuilding(null); closeLeft(); setTool('select');
  UI.notifs = []; UI.unread = 0; updateBadge();
  setSpeed(S.settings.speed || 1);
  $('dashboard').classList.toggle('hidden', !S.settings.dashboard); $('dashboard').dataset.built = '';
  applyTheme(); applyCompanyNames(); RNG.seed(S.p6.rng); computeScore(); feedbackTick(); computeDistricts(); computeDistrictNames(); computeRoadNames(); issuesSig = ''; renderIssues();
  $('minimap').classList.toggle('hidden', !S.settings.minimap); MINI.ver = -1; renderSpeedUI(); renderHeatLegend();
  refreshTopbar(); if (!UI.rightCollapsed) renderRight();
  sfx('levelup');
  if (S.settings.music) SND.startMusic();
  (opts.notes || []).forEach(function (n) { notify('💾 ' + n, 'gold'); });
  if (opts.offline) showModal('🌙 Welcome back!', '<p style="font-size:14px;line-height:1.5">You were away for <b>' + Math.floor(opts.offline.sec / 3600) + 'h ' + Math.floor((opts.offline.sec % 3600) / 60) + 'm</b>. Your companies earned <b class="pos">' + money(opts.offline.earned) + '</b> and the city budget <b class="pos">' + money(opts.offline.budget || 0) + '</b> (50% offline rate, max 4h).</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn gold" data-act="closeModal">Collect</button></div>');
  else if (!S.tutorial.done && !S.p5.tut.done && !S.city.sandbox) startTutorial();
  if (S.p5.tut.step >= 1 && !S.p5.tut.done) renderTutorial();
}
function returnToMenu() {
  if (saveGame(true)) clearRecovery();
  Log.info('Returned to main menu (city saved)');
  STARTED = false;
  SND.stopMusic(); SND.setRain(false);
  $('tutorial').classList.add('hidden');
  if (PHOTO.on) exitPhoto();
  clearDialogues(); $('tutObj').classList.add('hidden'); $('issuesBar').classList.add('hidden'); issuesSig = '';
  $('dailyCard').classList.add('hidden'); $('debug6').classList.add('hidden'); DBG.on = false;
  saveProfile();
  showMenu('main');
}
function bindMenu() {
  document.querySelectorAll('[data-menu]').forEach(function (b) { b.onclick = function () { showMenu(b.dataset.menu); }; });
  $('playBtn').onclick = function () {
    const p = MENU.pending || { notes: [] };
    startGame({ isNew: p.isNew, notes: p.notes, offline: MENU.offline });
    MENU.pending = null; MENU.offline = null;
  };
  $('ncDice').onclick = function () { $('ncSeed').value = seedLabel(Math.floor(Math.random() * 1000000)); sfx('click'); };
  $('ncCreate').onclick = createNewCity;
  $('scCreate').onclick = createScenario;
  $('sbxCreate').onclick = createSandbox;
}

/* Boot: every step does real work and reports its progress to the splash screen (see boot/loader.js). */
function bootSteps() {
  let res = null;
  return [
    ['world', 'rWorld', 20, function () {
      loadProfile();
      resizeCanvas();
      const tb = $('titleBlocks');
      ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0', '#9b5de5', '#f8961e', '#43aa8b'].forEach(function (c, i) { const el = document.createElement('i'); el.style.background = c; el.style.animationDelay = (i * 0.15) + 's'; tb.appendChild(el); });
      document.querySelector('#loadBar i').style.width = '40%';
      try { res = loadGame(); }
      catch (err) { Log.error('Save could not be loaded: ' + err.message); S = defaultState(); S.slot = activeSlot(); initMap(true); generateCity(); onMapChanged(); res = { isNew: true, notes: ['Save could not be loaded — a new city was created.'] }; }
      applyGlobalSettingsToGame();
      Log.info('World loaded: "' + S.city.name + '" ' + MAP.W + '×' + MAP.H + ' (' + (res.isNew ? 'new' : 'slot ' + S.slot) + ')');
    }],
    ['city', 'rBuildings', 35, function () {
      CAM.x = MAP.W * TILE / 2; CAM.y = MAP.H * TILE / 2 + 20;
      CAM.zoom = window.innerWidth < 820 ? 1.1 : 1.35;
      computeDistricts(); computeDistrictNames();
      Log.info('Buildings loaded: ' + S.buildings.list.length);
    }],
    ['economy', 'rEconomy', 50, function () {
      MENU.pending = res;
      MENU.offline = res.isNew ? null : applyOffline();
      if (res.isNew) econTick(1);
      Log.info('Economy initialized (CPI ' + S.p6.econ.cpi.toFixed(1) + ', interest ' + (interestRate() * 100).toFixed(1) + '%)');
    }],
    ['citizens', 'rCitizens', 70, function () {
      resetAgents();
      Log.info('Citizens ready: ' + Math.floor(S.city.population) + ' residents (' + (S._rawCitizens ? S._rawCitizens.length : 0) + ' stored profiles)');
    }],
    ['traffic', 'rTraffic', 85, function () {
      computeRoadNames();
      Log.info('Traffic network ready: ' + MAP.roadCount + ' road tiles' + (S._rawVehicles ? ', ' + S._rawVehicles.length + ' vehicles in transit' : ''));
    }],
    ['ui', 'rUI', 100, function () {
      MENU.opts.slot = S.slot || 1;
      bindInput(); bindUI(); bindMenu();
      applyTheme();
      setSpeed(S.settings.speed || 1);
      if (window.innerWidth < 820) toggleRight(true); else renderRight();
      $('fpsBox').classList.toggle('hidden', !S.settings.showFps);
      refreshTopbar();
      document.querySelector('#loadBar i').style.width = '100%';
    }]
  ];
}
function bootYield() { return new Promise(function (r) { let done = false; const f = function () { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 40); }); }
/* init(report): report(stageKey, rowKey, percent, state) updates the splash. Returns a Promise. */
function init(report) {
  report = report || function () { };
  const steps = bootSteps();
  let i = 0;
  const next = function () {
    if (i >= steps.length) {
      $('loadBar').style.display = 'none';
      showMenu('main');
      if (DEBUG) installDebug();
      requestAnimationFrame(loop);
      platformBoot();
      Log.info('Ready');
      report('ready', null, 100, 'done');
      return Promise.resolve();
    }
    const st = steps[i++];
    report(st[0], st[1], st[2], 'start');
    return bootYield().then(function () {
      st[3]();
      report(st[0], st[1], st[2], 'done');
      return next();
    });
  };
  return next();
}

/* =============================== 12. DEBUG =============================== */
/* Developer tools — only installed when DEBUG = true (see CONFIG). Use from the browser console. */
function installDebug() {
  window.addMoney = function (n) { S.money = Math.min(MONEY_CAP, S.money + num(n, 100000, 0)); refreshTopbar(); return S.money; };
  window.unlockAllBuildings = function () { S.debugUnlockAll = true; renderLeft(true); return 'All buildings unlocked'; };
  window.unlockAllTech = function () { TECH_LIST.forEach(function (t) { if (!hasTech(t.id)) S.technology.unlocked.push(t.id); }); onMapChanged(); return 'All technologies unlocked'; };
  window.setPopulation = function (n) { S.city.population = num(n, 10000, 0, 1e7); S.city.peakPop = Math.max(S.city.peakPop, S.city.population); return S.city.population; };
  window.addRP = function (n) { S.research.rp += num(n, 1000, 0); return S.research.rp; };
  window.triggerCrisis = function (id) { startCrisis(CRISES.find(function (c) { return c.id === id; }) || pick(CRISES)); };
  window.triggerDisaster = function (id) { startDisaster(DISASTERS.find(function (c) { return c.id === id; }) || pick(DISASTERS)); };
  window.triggerEvent = function (id) { startGlobalEvent(GLOBAL_EVENTS.find(function (c) { return c.id === id; }) || pick(GLOBAL_EVENTS), false); };
  window.triggerDyn = function (id) { startDynEvent(DYN_EVENTS.find(function (c) { return c.id === id; }) || pick(DYN_EVENTS)); };
  window.addBudget = function (n) { S.budget = Math.min(MONEY_CAP, S.budget + num(n, 100000, 0)); return S.budget; };
  window.setCityLevel = function (l) { S.city.peakPop = CITY_LEVEL_POP[clamp((l | 0) - 1, 0, 19)]; S.city.population = Math.max(S.city.population, S.city.peakPop); return cityLevel(); };
  window.setTime = function (h) { S.clock.gameSec = Math.floor(S.clock.gameSec / 86400) * 86400 + num(h, 12, 0, 23.99) * 3600; };
  window.triggerWorldEvent = function (id) { startWorldEvent(id); };
  window.GAME = { S: function () { return S; }, SIM: SIM, MAP: MAP, AG: AG, Game: Game, P5: function () { return S.p5; } };
  console.log('%cBLOCK CITY TYCOON DEBUG: addMoney(), unlockAllBuildings(), unlockAllTech(), setPopulation(), addRP(), triggerCrisis(), triggerDisaster(), triggerEvent(), setTime()', 'color:#ffd166');
}

