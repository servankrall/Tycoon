'use strict';
/* BLOCK CITY TYCOON — TRANSPORTATION ENGINE 3.0 · UI (Part 19)
   TRANSPORTATION panel (Windows + Android, responsive, scrollable): Overview dashboard (cars, buses, metro / train /
   airport passengers, port cargo, bike and walking trips, average commute, congestion, parking, public-transport
   satisfaction, revenue, cost), Metro, Bus, Rail, Airport, Port, Bike & Walk, Parking, Traffic AI and the LINE EDITOR
   (create line, add / remove / move station, change order, colour, frequency, vehicle count, bus schedule). Plus the
   transport heatmaps (N), search / palette entries and the F3 debug lines. The panel only reads cached statistics. */
const TPUI = { tab: 'overview', line: null, newMode: 'bus', newStops: [], anim: false };
const TP_TABS = [['overview', '🚦 Overview'], ['metro', '🚇 Metro'], ['bus', '🚌 Bus'], ['rail', '🚆 Rail'], ['airport', '✈️ Airport'], ['port', '⚓ Port'], ['bike', '🚲 Bike & Walk'], ['parking', '🅿️ Parking'], ['traffic', '🧠 Traffic AI'], ['lines', '🛠 Line Editor']];
function openTransport(tab) {
  if (!STARTED || !S) return;
  tp(); if (tab) TPUI.tab = tab; TPUI.anim = true;
  if (typeof closeMobilePage === 'function' && typeof MPAGE !== 'undefined' && MPAGE.el && !MPAGE.el.classList.contains('hidden')) closeMobilePage();
  showModal('🚦 TRANSPORTATION · ' + esc(S.city.name), '<div id="tpRoot" class="gvRoot"></div>');
  $('modal').classList.add('p10Wide');
  tpRender();
}
function tpRender() {
  const root = document.getElementById('tpRoot'); if (!root) return;
  const sc = root.querySelector('.e2Body') ? root.querySelector('.e2Body').scrollTop : 0, tsc = root.querySelector('.e2Tabs') ? root.querySelector('.e2Tabs').scrollLeft : 0;
  let body = '';
  try { body = (TP_VIEWS[TPUI.tab] || TP_VIEWS.overview)(); } catch (e) { body = '<p class="small">⚠️ ' + esc(e.message) + '</p>'; if (typeof logError === 'function') logError('Transportation UI', e.message); }
  const s = tpStats();
  root.innerHTML = '<div class="e2Tabs mScroll">' + TP_TABS.map(function (t) { return '<button class="btn small ' + (TPUI.tab === t[0] ? 'gold' : '') + '" data-tpt="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="e2Phase">COMMUTE ' + s.commute.toFixed(1) + ' MIN · TRAFFIC ' + Math.round(s.congestion) + '% · ' + tpLines().length + ' LINES · PARKING ' + Math.round(clamp(s.parking, 0, 2) * 100) + '%</div>' +
    '<div class="e2Body gvBody' + (TPUI.anim ? ' gvAnim' : '') + '">' + body + '</div>';
  TPUI.anim = false;
  const b = root.querySelector('.e2Body'); if (b) b.scrollTop = sc; const t = root.querySelector('.e2Tabs'); if (t) t.scrollLeft = tsc;
}
function tpT(icon, label, value, sub, cls) { return e2Tile(icon, label, value, sub, cls); }
function tpTbl(head, rows) { return typeof govTable === 'function' ? govTable(head, rows) : ''; }
function tpHeatBtns(list) { return '<div class="mActs gvMap">' + list.map(function (h) { const d = heatDef(h); return d ? '<button class="btn small" data-tpheat="' + h + '">🗺️ ' + d.icon + ' ' + d.name + '</button>' : ''; }).join('') + '</div>'; }
const TP_VIEWS = {
  overview: function () {
    const s = tpStats(), M = s.modal;
    return '<div class="e2Grid">' + tpT('🚗', 'Cars', fmt(s.cars), fmt(s.carAgents) + ' simulated on screen') + tpT('🚌', 'Buses', fmt(s.buses), s.bus.lines.length + ' bus / tram lines') + tpT('🚇', 'Metro Passengers', fmt(s.metroPax) + '/day', s.metro.stations.length + ' stations') +
      tpT('🚆', 'Train Passengers', fmt(s.trainPax) + '/day', s.rail.lines.length + ' rail lines') + tpT('✈️', 'Airport Passengers', fmt(s.airPax) + '/day', s.air.levelName) + tpT('⚓', 'Port Cargo', fmt(s.portCargo) + ' TEU/day', s.port.levelName) +
      tpT('🚲', 'Bike Trips', fmt(s.bikeTrips) + '/day', Math.round((M.bike || 0) * 100) + '% of trips') + tpT('🚶', 'Walking Trips', fmt(s.walkTrips) + '/day', Math.round((M.walk || 0) * 100) + '% of trips') + tpT('⏱️', 'Average Commute', s.commute.toFixed(1) + ' min', 'door to door', s.commute > 35 ? 'warn' : '') +
      tpT('🚦', 'Traffic Congestion', Math.round(s.congestion) + '%', '', s.congestion > 60 ? 'warn' : '') + tpT('🅿️', 'Parking Availability', Math.round(clamp(s.parking, 0, 2) * 100) + '%', 'search ' + s.park.searchMin.toFixed(1) + ' min', s.parking < 0.85 ? 'warn' : '') + tpT('😊', 'Public Transport Satisfaction', Math.round(s.ptSat), '0–100') +
      tpT('💵', 'Transport Revenue', money(s.revenue) + '/day', 'fares') + tpT('🧾', 'Transport Cost', money(s.cost) + '/day', 'stations & lines') + '</div>' +
      '<div class="e2Card"><h4>Modal split</h4>' + [['🚗 Car', M.car], ['🚌 Transit', M.transit], ['🔁 Transfer', M.transfer], ['🅿️ Park & Ride', M.parkride], ['🚲 Bike', M.bike], ['🚶 Walk', M.walk]].map(function (r) { return e2Bar(r[0], r[1] || 0, 1, Math.round((r[1] || 0) * 100) + '%'); }).join('') + '</div>' +
      '<div class="e2Card"><h4>Lines</h4>' + tpTbl(['Line', 'Mode', 'Stations', 'Vehicles', 'Passengers', 'Income/day'], s.lines.map(function (l) { return ['<span style="color:' + l.color + '">■</span> ' + esc(l.name), l.icon + ' ' + l.mode, l.stations, l.vehicles, fmt(Math.round(l.passengers)), money(l.income * 86400 / TIME_SCALE)]; })) + '</div>' +
      tpHeatBtns(['TRAFFIC', 'PUBLIC TRANSPORT', 'METRO COVERAGE', 'BUS COVERAGE', 'WALKABILITY', 'BIKE COVERAGE', 'PARKING PRESSURE', 'EMERGENCY RESPONSE', 'COMMUTE TIME', 'LOGISTICS']);
  },
  metro: function () {
    const m = tpStats().metro;
    return '<div class="e2Grid">' + tpT('🚇', 'Stations', m.stations.length, m.depots + ' depot(s)') + tpT('🛤️', 'Track / Tunnels', m.track.toFixed(1) + ' km', 'underground') + tpT('🚆', 'Trains', m.lines.reduce(function (a, l) { return a + l.trains; }, 0), m.lines.length + ' line(s)') + tpT('🧍', 'Riders', fmt(m.riders) + '/day', '') + '</div>' +
      '<div class="e2Card"><h4>Stations</h4>' + tpTbl(['Station', 'Capacity', 'Passengers', 'Waiting', 'Coverage', 'Revenue/day', 'Maint.', 'Lines'], m.stations.map(function (s) { return ['<button class="btn small" data-tpfly="' + s.x + ',' + s.y + '">📍</button> ' + esc(s.name), fmt(s.capacity), '<b class="' + (s.load > 1 ? 'neg' : '') + '">' + fmt(s.passengers) + ' (' + Math.round(s.load * 100) + '%)</b>', fmt(s.waiting), Math.round(s.coverage * 100) + '%', money(s.revenue * 86400 / TIME_SCALE * 0.2), money(s.maintenance * 1200), esc(s.lines.join(', ') || '—')]; })) + '</div>' +
      '<div class="e2Card"><h4>Lines</h4>' + tpTbl(['Line', 'Stations', 'Trains', 'Headway', 'Track', 'Passengers'], m.lines.map(function (l) { return ['<span style="color:' + l.color + '">■</span> ' + esc(l.name), l.stations, l.trains, l.headway.toFixed(1) + ' min', l.track.toFixed(1) + ' km', fmt(l.pax)]; })) + '<div class="mActs"><button class="btn small gold" data-tpt="lines">🛠 Edit lines</button></div></div>' + tpHeatBtns(['METRO COVERAGE']);
  },
  bus: function () {
    const b = tpStats().bus;
    return '<div class="e2Grid">' + tpT('🚏', 'Stops', b.stops, '') + tpT('🏢', 'Depots', b.depots, b.depots ? '+4 vehicles per line' : 'build a Bus Depot') + tpT('🚌', 'Vehicles', b.vehicles, 'in real traffic') + tpT('🗺️', 'Lines', b.lines.length, '') + '</div>' +
      '<div class="e2Card"><h4>Lines & schedules</h4>' + tpTbl(['Line', 'Mode', 'Stops', 'Vehicles', 'Headway', 'Service', ''], b.lines.map(function (l) { return ['<span style="color:' + l.color + '">■</span> ' + esc(l.name), l.mode, l.stops, l.running + '/' + l.vehicles, l.headway.toFixed(1) + ' min', l.schedule.start + ':00–' + l.schedule.end + ':00 ' + (l.inService ? '<b class="pos">running</b>' : '<b class="neg">depot</b>'), '<button class="btn small" data-tpline="' + l.id + '">Edit</button>']; })) + '</div>' + tpHeatBtns(['BUS COVERAGE', 'PUBLIC TRANSPORT']);
  },
  rail: function () {
    const r = tpStats().rail, T = tp().rail;
    return '<div class="e2Grid">' + tpT('🚉', 'Stations', r.stations, '') + tpT('🏭', 'Depots', r.depots, '') + tpT('🛤️', 'Track', r.track.toFixed(1) + ' km', '') + tpT('📦', 'Cargo capacity', fmt(r.cargoCap) + ' t/day', 'cargo trains → industry logistics') + tpT('🚄', 'Regional services', r.regional, 'neighbour cities') + tpT('💰', 'Freight revenue', money(T.cargoValue), 'since founding') + '</div>' +
      '<div class="e2Card"><h4>Rail lines</h4>' + tpTbl(['Line', 'Type', 'Trains', 'Stations', 'Track'], r.lines.map(function (l) { return [esc(l.name), '<select data-tptype="' + l.id + '">' + ['passenger', 'cargo', 'highspeed'].map(function (k) { return '<option ' + (k === l.type ? 'selected' : '') + '>' + k + '</option>'; }).join('') + '</select>', l.trains, l.stations, l.track.toFixed(1) + ' km']; })) + '</div>';
  },
  airport: function () {
    const a = tpStats().air;
    return '<div class="e2Grid">' + tpT('✈️', 'Level', a.levelName, 'Small → Regional → International → Mega') + tpT('🛬', 'Runways', a.runways, '') + tpT('🏢', 'Terminals', a.terminals, a.gates + ' gates') + tpT('🧍', 'Passengers', fmt(a.passengers) + '/day', 'load ' + Math.round(a.load * 100) + '%', a.load > 1 ? 'warn' : '') +
      tpT('🧳', 'Baggage', fmt(a.baggage) + '/day', '') + tpT('📦', 'Cargo', fmt(a.cargo) + ' t/day', '') + tpT('🛩️', 'Aircraft', fmt(a.aircraft) + ' flights', a.delay ? 'delay ' + Math.round(a.delay) + ' min' : '') + tpT('🅿️', 'Parking', fmt(a.parking), 'spaces near the airport') + tpT('🚌', 'Public transport', a.transitLinks, 'stops / stations nearby', a.level !== 'none' && !a.transitLinks ? 'warn' : '') + '</div>' +
      (a.level === 'none' ? '<p class="small">Build a Small Airport (3,000 citizens), a Regional Airport (8,000) or the International Airport (aviation research).</p>' : '');
  },
  port: function () {
    const p = tpStats().port;
    return '<div class="e2Grid">' + tpT('⚓', 'Level', p.levelName, 'Small → Cargo → Passenger → Industrial → Mega') + tpT('📦', 'Containers', fmt(p.containers) + ' TEU/day', 'capacity ' + fmt(p.capacity), p.load > 1 ? 'warn' : '') + tpT('🚢', 'Ships', p.ships.toFixed(1) + '/day', '') +
      tpT('⬇️', 'Imports', fmt(Math.round(p.imports)) + ' TEU/day', '') + tpT('⬆️', 'Exports', fmt(Math.round(p.exports)) + ' TEU/day', '') + tpT('🏬', 'Warehouses', p.warehouses, 'storage & distribution') + tpT('🚚', 'Logistics cost', money(p.logistics) + '/s', 'EconomyEngine') + '</div>';
  },
  bike: function () {
    const s = tpStats(), b = s.bike, p = s.ped;
    return '<div class="e2Grid">' + tpT('🚲', 'Bike lanes', fmt(b.lanes) + ' tiles', fmt(b.roads) + ' bike-road tiles') + tpT('🅿️', 'Bike parking', fmt(b.parking) + ' spaces', b.stations + ' bike stations') + tpT('📈', 'Bike share', Math.round(b.share * 100) + '%', fmt(s.bikeTrips) + ' trips/day') +
      tpT('🚶', 'Walkability', p.walkScore, '0–100') + tpT('🛣️', 'Sidewalks', fmt(p.sidewalks), fmt(p.streets) + ' pedestrian streets') + tpT('🌉', 'Bridges / tunnels', p.bridges + ' / ' + p.tunnels, 'pedestrian') + tpT('🦓', 'Crosswalks', fmt(p.crosswalks), 'at signal & stop junctions') + '</div>' +
      '<p class="small">Citizens bike short trips when there are bike lanes, stations and dry weather; they walk when sidewalks, shops and crosswalks are close (Part 11 modal choice).</p>' + tpHeatBtns(['BIKE COVERAGE', 'WALKABILITY']);
  },
  parking: function () {
    const p = tpStats().park;
    return '<div class="e2Grid">' + tpT('🅿️', 'Supply', fmt(p.supply), 'spaces') + tpT('🚗', 'Demand', fmt(p.demand), 'cars looking for a space') + tpT('⚠️', 'Deficit', fmt(p.deficit), 'illegal parking ↑ · traffic ↑', p.deficit > 0 ? 'warn' : '') + tpT('⏱️', 'Search time', p.searchMin.toFixed(1) + ' min', 'satisfaction ↓ when long') + '</div>' +
      '<div class="e2Card"><h4>By type</h4>' + [['Street parking', p.street], ['Parking lots', p.lots], ['Parking garages', p.garages], ['Park & Ride', p.parkRide], ['Airport parking', p.airport]].map(function (r) { return e2Bar(r[0], r[1], Math.max(1, p.supply), fmt(r[1])); }).join('') + '<div class="mActs"><button class="btn small ' + (tp().parking.street ? 'gold' : '') + '" data-tpstreet="1">Street parking ' + (tp().parking.street ? 'ON' : 'OFF') + '</button></div></div>' + tpHeatBtns(['PARKING PRESSURE']);
  },
  traffic: function () {
    const T = tp().traffic, s = T.stats, jm = {}; Object.keys(T.modes).forEach(function (k) { jm[T.modes[k]] = (jm[T.modes[k]] || 0) + 1; });
    return '<div class="e2Grid">' + tpT('🧠', 'Default light mode', T.defaultMode ? TL_MODES[T.defaultMode] : 'Automatic', '') + tpT('🔀', 'Dynamic reroutes', fmt(s.reroutes), 'predicted ' + gameMinutes(s.avoided) + ' min saved') + tpT('🚌', 'Transit priority', fmt(s.ptGreen) + ' greens', 'cars waited ' + Math.round(s.privDelay) + ' veh·s') + tpT('🚑', 'Emergency pre-emptions', fmt(s.emPreempt), 'long-range corridor') + '</div>' +
      '<div class="e2Card"><h4>Junction light modes</h4><div class="mActs">' + ['auto', 'fixed', 'adaptive', 'smart', 'emergency'].map(function (m) { return '<button class="btn small ' + ((T.defaultMode || 'auto') === m ? 'gold' : '') + '" data-tpmode="' + m + '">' + (m === 'auto' ? 'Automatic' : TL_MODES[m]) + '</button>'; }).join('') + '</div>' +
      '<p class="small">Fixed: constant timings. Adaptive: green follows the measured queues. Smart: also uses the congestion predicted to arrive. Emergency Priority: sirens get a green corridor up to 16 tiles ahead. Per-junction overrides: ' + (Object.keys(jm).map(function (k) { return TL_MODES[k] + ' ' + jm[k]; }).join(' · ') || 'none') + ' · transit priority at ' + Object.keys(T.ptPriority).length + ' junction(s).</p>' +
      '<div class="mActs"><button class="btn small" data-tpprio="1">🚌 Transit priority at the 10 busiest bus junctions</button></div></div>' + tpHeatBtns(['TRAFFIC', 'EMERGENCY RESPONSE', 'COMMUTE TIME', 'LOGISTICS']);
  },
  lines: function () {
    const L = tpLines(), cur = TPUI.line ? tpLine(TPUI.line) : null;
    let h = '<div class="e2Card"><h4>Lines</h4>' + (L.length ? L.map(function (l) { return '<button class="btn small ' + (cur === l ? 'gold' : '') + '" data-tpline="' + l.id + '"><span style="color:' + l.color + '">■</span> ' + esc(l.name) + ' · ' + l.stops.length + '</button> '; }).join('') : '<p class="small">No lines yet.</p>') + '</div>';
    if (cur) {
      const M = TRANSIT_MODES[cur.mode], sc = tp().bus.schedules[cur.id] || { start: 5, end: 24 }, free = tpBuilt(function (d) { return M.stops.indexOf(d.id) >= 0; }).filter(function (b) { return cur.stops.indexOf(b.id) < 0; });
      h += '<div class="e2Card"><h4>' + M.icon + ' ' + esc(cur.name) + '</h4>' +
        '<div class="gvFund"><label>Name</label><input class="admInput" data-tpname="' + cur.id + '" value="' + esc(cur.name) + '" maxlength="28"></div>' +
        '<div class="gvFund"><label>Colour <input type="color" data-tpcolor="' + cur.id + '" value="' + esc(cur.color || '#4cc9f0') + '"></label></div>' +
        cur.stops.map(function (id, i) { const b = MAP.byId.get(id); return '<div class="e2Row"><span>' + (i + 1) + '. ' + (b ? esc(districtName(b.x, b.y) || bdef(b).name) + ' #' + id : '<b class="neg">missing #' + id + '</b>') + '</span><span><button class="btn small" data-tped="order:' + id + ':-1">↑</button><button class="btn small" data-tped="order:' + id + ':1">↓</button>' +
          (free.length ? '<select data-tpmove="' + id + '"><option value="">move to…</option>' + free.slice(0, 30).map(function (f) { return '<option value="' + f.id + '">' + esc(districtName(f.x, f.y) || bdef(f).name) + ' #' + f.id + '</option>'; }).join('') + '</select>' : '') + '<button class="btn small red" data-tped="remove:' + id + '">✕</button></span></div>'; }).join('') +
        (free.length && cur.stops.length < M.maxStops ? '<div class="e2Row"><span>Add station</span><select data-tpadd="' + cur.id + '"><option value="">choose…</option>' + free.slice(0, 40).map(function (f) { return '<option value="' + f.id + '">' + esc(districtName(f.x, f.y) || bdef(f).name) + ' #' + f.id + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="e2Row"><span>Vehicles (' + cur.vehicles + ') · headway ' + lineHeadwayMin(cur).toFixed(1) + ' min</span><span><button class="btn small" data-tped="trains:' + (cur.vehicles - 1) + '">−</button><button class="btn small" data-tped="trains:' + (cur.vehicles + 1) + '">+</button></span></div>' +
        '<div class="e2Row"><span>Target frequency</span><span>' + [3, 5, 8, 12, 20].map(function (m) { return '<button class="btn small" data-tped="frequency:' + m + '">' + m + ' min</button>'; }).join('') + '</span></div>' +
        (M.road ? '<div class="e2Row"><span>Service hours ' + sc.start + ':00–' + sc.end + ':00</span><span>' + [[5, 24], [6, 22], [0, 24], [7, 20]].map(function (p) { return '<button class="btn small" data-tped="schedule:' + p[0] + ':' + p[1] + '">' + p[0] + '–' + p[1] + '</button>'; }).join('') + '</span></div>' : '') +
        '<div class="mActs">' + (cur.stops.length && MAP.byId.get(cur.stops[0]) ? '<button class="btn small" data-tpfly="' + MAP.byId.get(cur.stops[0]).x + ',' + MAP.byId.get(cur.stops[0]).y + '">📍 Show on map</button>' : '') + '<button class="btn small red" data-tpdel="' + cur.id + '">Delete line</button></div></div>';
    }
    const NM = TRANSIT_MODES[TPUI.newMode], cand = tpBuilt(function (d) { return NM.stops.indexOf(d.id) >= 0; });
    h += '<div class="e2Card"><h4>➕ Create line</h4><div class="mActs">' + Object.keys(TRANSIT_MODES).filter(function (k) { return k !== 'shuttle'; }).map(function (k) { return '<button class="btn small ' + (TPUI.newMode === k ? 'gold' : '') + '" data-tpnew="' + k + '">' + TRANSIT_MODES[k].icon + ' ' + TRANSIT_MODES[k].name + '</button>'; }).join('') + '</div>' +
      (cand.length < 2 ? '<p class="small">Build at least 2 ' + NM.stops.map(function (i) { return BUILDINGS[i] ? BUILDINGS[i].name : i; }).join(' / ') + ' first.</p>' : '<p class="small">Tap stations in the order the line should run (' + TPUI.newStops.length + '/' + NM.maxStops + ').</p><div class="mActs">' + cand.slice(0, 40).map(function (b) { const k = TPUI.newStops.indexOf(b.id); return '<button class="btn small ' + (k >= 0 ? 'gold' : '') + '" data-tppick="' + b.id + '">' + (k >= 0 ? (k + 1) + '. ' : '') + esc(districtName(b.x, b.y) || bdef(b).name) + ' #' + b.id + '</button>'; }).join('') + '</div><div class="mActs"><button class="btn gold" data-tpcreate="1"' + (TPUI.newStops.length >= 2 ? '' : ' disabled') + '>Create ' + NM.name + ' line</button><button class="btn small" data-tpclear="1">Clear</button></div>') + '</div>';
    return h;
  }
};
/* ---------- events ---------- */
document.addEventListener('click', function (e) {
  if (!e.target.closest || !e.target.closest('#tpRoot')) return;
  const q = function (sel) { return e.target.closest(sel); }, res = function (r) { if (r) toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); TPE.cache = null; };
  let el;
  if ((el = q('[data-tpt]'))) { TPUI.tab = el.dataset.tpt; TPUI.anim = true; }
  else if ((el = q('[data-tpline]'))) { TPUI.line = el.dataset.tpline; TPUI.tab = 'lines'; }
  else if ((el = q('[data-tped]'))) { const p = el.dataset.tped.split(':'); res(tpLineEdit(TPUI.line, p[0], p[1], p[2])); }
  else if ((el = q('[data-tpdel]'))) { removeTransitLine(el.dataset.tpdel); TPUI.line = null; res({ ok: true, msg: 'Line deleted' }); }
  else if ((el = q('[data-tpnew]'))) { TPUI.newMode = el.dataset.tpnew; TPUI.newStops = []; }
  else if ((el = q('[data-tppick]'))) { const id = +el.dataset.tppick, k = TPUI.newStops.indexOf(id); if (k >= 0) TPUI.newStops.splice(k, 1); else if (TPUI.newStops.length < TRANSIT_MODES[TPUI.newMode].maxStops) TPUI.newStops.push(id); }
  else if ((el = q('[data-tpclear]'))) TPUI.newStops = [];
  else if ((el = q('[data-tpcreate]'))) { const r = tpLineCreate(TPUI.newMode, TPUI.newStops); res(r); if (r.ok) { TPUI.line = r.L.id; TPUI.newStops = []; } }
  else if ((el = q('[data-tpmode]'))) res(tpSetLightMode('all', el.dataset.tpmode));
  else if ((el = q('[data-tpprio]'))) { const H = {}; AG.vehicles.forEach(function (v) { if (!v.line || !v.path) return; for (let k = v.seg; k < Math.min(v.path.length, v.seg + 20); k++) if (MAP.inter[v.path[k]]) H[v.path[k]] = (H[v.path[k]] || 0) + 1; }); const top = Object.keys(H).sort(function (a, b) { return H[b] - H[a]; }).slice(0, 10); top.forEach(function (t) { tpSetPtPriority(t, true); }); res({ ok: true, msg: 'Transit priority at ' + top.length + ' junction(s)' }); }
  else if ((el = q('[data-tpstreet]'))) { tp().parking.street = !tp().parking.street; if (typeof P11 !== 'undefined') P11.park = null; }
  else if ((el = q('[data-tpheat]'))) { closeModal(); setHeatmap(el.dataset.tpheat); return; }
  else if ((el = q('[data-tpfly]'))) { const p = el.dataset.tpfly.split(','); closeModal(); flyToTile(+p[0], +p[1], 0.9); return; }
  else return;
  sfx('click'); tpRender();
});
document.addEventListener('change', function (e) {
  const t = e.target; if (!t.closest || !t.closest('#tpRoot')) return;
  const res = function (r) { if (r) toast(r.ok ? '✅ ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); TPE.cache = null; };
  if (t.dataset.tpcolor) res(tpLineEdit(t.dataset.tpcolor, 'color', t.value));
  else if (t.dataset.tpname) res(tpLineEdit(t.dataset.tpname, 'rename', t.value));
  else if (t.dataset.tpadd && t.value) res(tpLineEdit(t.dataset.tpadd, 'add', t.value));
  else if (t.dataset.tpmove && t.value) res(tpLineEdit(TPUI.line, 'move', t.dataset.tpmove, t.value));
  else if (t.dataset.tptype) { const r = setTrainType(t.dataset.tptype, t.value); res(r && r.ok === false ? r : { ok: true, msg: 'Train type ' + t.value }); }
  else return;
  tpRender();
});
setInterval(function () { if (document.getElementById('tpRoot') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#tpRoot input,#tpRoot select'))) { TPE.cache = null; tpRender(); } }, 3000);

/* ---------- transport heatmaps ---------- */
const TP_HEATS = [['METRO COVERAGE', '🚇', 'Metro Coverage', 'None', 'Served', 'good'], ['BUS COVERAGE', '🚌', 'Bus Coverage', 'None', 'Served', 'good'], ['BIKE COVERAGE', '🚲', 'Bike Coverage', 'None', 'Bike friendly', 'good'], ['PARKING PRESSURE', '🅿️', 'Parking Pressure', 'Enough', 'Full', 'bad'],
  ['EMERGENCY RESPONSE', '🚑', 'Emergency Response', 'Fast', 'Slow', 'bad'], ['COMMUTE TIME', '⏱️', 'Commute Time', 'Short', 'Long', 'bad'], ['LOGISTICS', '🚚', 'Logistics', 'Poor access', 'Good access', 'good'], ['ELEVATION', '⛰️', 'Elevation', 'Low', 'High', 'value']];
TP_HEATS.forEach(function (h) { if (!heatDef(h[0])) HEATMAPS.push({ id: h[0], icon: h[1], name: h[2], low: h[3], high: h[4], ramp: h[5] }); if (OVERLAYS.indexOf(h[0]) < 0) OVERLAYS.push(h[0]); });
function tpCellGrid(val) { const g = new Float32Array(MAP.W * MAP.H), n = MAP.dN || Math.ceil(MAP.W / 8); for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) g[idx(x, y)] = clamp(val(Math.floor(y / 8) * n + Math.floor(x / 8), x, y), 0, 1); return g; }
function tpHeatGrid(mode) {
  if (!TP_HEATS.some(function (h) { return h[0] === mode; })) return null;
  const key = mode + ':' + MAP.version + ':' + Math.floor(S.clock.runSec / 5), c = TPE;
  if (c.heatKey === key && c.heat) return c.heat;
  let g = null;
  if (mode === 'METRO COVERAGE') g = covGrid(function (b) { return b.type === 'metro' && b.built; }, function () { return 8; });
  else if (mode === 'BUS COVERAGE') g = covGrid(function (b) { return (b.type === 'busstop' || b.type === 'tramstop') && b.built; }, function () { return 5; });
  else if (mode === 'BIKE COVERAGE') { g = covGrid(function (b) { return (b.type === 'bikestation' || bdef(b).bikePark) && b.built; }, function () { return 5; }); const B = S.p11 ? S.p11.bike : {}; Object.keys(B).forEach(function (k) { const x = k % MAP.W, y = (k / MAP.W) | 0; for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (inMap(xx, yy)) { const i = idx(xx, yy); g[i] = Math.max(g[i], 0.6); } }); }
  else if (mode === 'PARKING PRESSURE') { const P = parkingPass(); g = tpCellGrid(function (k) { const cl = P.cells[k]; return cl && cl.dem > 0 ? clamp(cl.dem / Math.max(1, cl.sup) - 0.6, 0, 1) : 0; }); }
  else if (mode === 'EMERGENCY RESPONSE') { const R = S.government && typeof GOV !== 'undefined' && GOV.cache.respD ? GOV.cache.respD : null; g = tpCellGrid(function (k) { if (!R) return 0; const a = [R.fire && R.fire[k], R.police && R.police[k], R.health && R.health[k]].filter(function (v) { return v; }); return a.length ? clamp((a.reduce(function (s, v) { return s + v; }, 0) / a.length - 2) / 18, 0, 1) : 0; }); }
  else if (mode === 'COMMUTE TIME') { const n = MAP.dN || Math.ceil(MAP.W / 8), sum = new Float32Array(n * n), cnt = new Float32Array(n * n); AG.citizens.forEach(function (cz) { if (cz.tourist || !cz.work) return; const h = MAP.byId.get(cz.home), w = MAP.byId.get(cz.work); if (!h || !w) return; const k = Math.floor(h.y / 8) * n + Math.floor(h.x / 8), d = Math.abs(h.x - w.x) + Math.abs(h.y - w.y); let cg = 0; if (MAP.cong) cg = (MAP.cong[h._entry] || 0) + (MAP.cong[w._entry] || 0); sum[k] += d * TILE_METERS / 1000 / 0.45 * (1 + cg); cnt[k]++; }); g = tpCellGrid(function (k) { return cnt[k] ? clamp(sum[k] / cnt[k] / 40, 0, 1) : 0; }); }
  else if (mode === 'LOGISTICS') { g = covGrid(function (b) { const d = bdef(b); return b.built && (b.type === 'distcenter' || d.storage || b.type === 'port' || b.type === 'smallport' || b.type === 'trainstation' || b.type === 'railhub'); }, function () { return 10; }); if (MAP.cong) for (let i = 0; i < g.length; i++) if (MAP.roads[i]) g[i] *= 1 - clamp(MAP.cong[i], 0, 1) * 0.5; }
  else if (mode === 'ELEVATION') { g = new Float32Array(MAP.W * MAP.H); for (let i = 0; i < g.length; i++) g[i] = MAP.nature[i] === 2 ? 0 : MAP.terrain[i] === TERRAIN.ROCK ? 1 : MAP.terrain[i] === TERRAIN.HILL ? 0.65 : MAP.terrain[i] === TERRAIN.SAND ? 0.15 : 0.35; }
  c.heat = g; c.heatKey = key; return g;
}
(function () { const ph = window.p9HeatGrid; window.p9HeatGrid = function (mode) { if (S && S.transportation) { const g = tpSafe('heatmap', function () { return tpHeatGrid(mode); }); if (g) return g; } return typeof ph === 'function' ? ph.apply(this, arguments) : null; }; })();

/* ---------- entry points: search, palette, F3, city panel ---------- */
(function () {
  const pc = window.paletteCommands;
  if (typeof pc === 'function') window.paletteCommands = function () {
    const C = pc.apply(this, arguments); if (!S || !S.transportation) return C;
    const add = function (label, icon, tab, kw) { C.push({ label: label, icon: icon, run: function () { if (typeof closePalette === 'function') closePalette(); openTransport(tab); }, kw: kw }); };
    add('Open Transportation', '🚦', 'overview', 'transport traffic commute dashboard');
    add('Open Line Editor', '🛠', 'lines', 'metro bus line editor station');
    add('Open Metro', '🚇', 'metro', 'metro subway station');
    add('Open Traffic AI', '🧠', 'traffic', 'traffic light smart adaptive');
    return C;
  };
  const sc = window.searchCommands;
  if (typeof sc === 'function') window.searchCommands = function (q) { const out = sc.apply(this, arguments); if (!S || !S.transportation) return out; TP_TABS.forEach(function (t) { out.push({ label: 'Transportation: ' + t[1].replace(/^\S+\s/, ''), icon: t[1].split(' ')[0], kw: 'transport ' + t[0], run: function () { openTransport(t[0]); } }); }); tpLines().forEach(function (L) { out.push({ label: 'Line: ' + L.name, icon: '🛠', kw: 'line ' + L.mode, run: function () { TPUI.line = L.id; openTransport('lines'); } }); }); return out; };
  const dl = window.veDebugLines;
  if (typeof dl === 'function' && !dl.__p19) { window.veDebugLines = function () { const T = S && S.transportation; return dl.apply(this, arguments) + (T ? '\nTRANSPORT 3.0 stats ' + TPE.prof.stats.toFixed(2) + ' ms · predict ' + TPAI.prof.pred.toFixed(2) + ' ms · route ' + TPAI.prof.route.toFixed(2) + ' ms · reroutes ' + T.traffic.stats.reroutes + ' · lines ' + tpLines().length + ' · errors ' + TPE.errors : ''); }; window.veDebugLines.__p19 = true; }
  const rt = window.renderTransitTab;
  if (typeof rt === 'function' && !rt.__p19) { window.renderTransitTab = function () { return (S && S.transportation ? '<button class="btn gold" style="width:100%;margin-bottom:8px" data-act="tp3">🚦 OPEN TRANSPORTATION — dashboard · metro · bus · rail · airport · port · line editor</button>' : '') + rt.apply(this, arguments); }; window.renderTransitTab.__p19 = true; }
})();
