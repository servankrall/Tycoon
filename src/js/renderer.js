'use strict';
/* BLOCK CITY TYCOON — RENDERER — canvas world renderer, particles, weather, FX */
/* =============================== 8. RENDER =============================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const CAM = { x: 0, y: 0, zoom: 1, tx: null, ty: null };
const FX = { particles: [], pool: [], texts: [], shake: 0, flash: 0, weather: 'clear', weatherUntil: 0, drops: [], lightningAt: 0, time: 0 };
const PERF = { scale: 1, fps: 60, frames: 0, acc: 0, low: 0, high: 0, noGlow: false };
const GROUND = { canvas: document.createElement('canvas'), scale: IS_MOBILE ? 1 : 1.5, season: -1, exp: -1, layerKey: '' };
const OVERLAYS = ['NONE', 'TRAFFIC', 'ELECTRICITY', 'WATER', 'LAND VALUE', 'POLLUTION', 'HAPPINESS', 'SAFETY', 'HEALTH', 'EDUCATION', 'WEALTH', 'DEMAND', 'FIRE', 'DENSITY'];
/* Sun direction for time-of-day shadows (updated every frame) */
const SUN = { dx: 0.4, len: 1, tint: 0, warm: false };
function updateSun() {
  const h = PHOTO.on && PHOTO.hour !== null ? PHOTO.hour : gameHour();
  SUN.dx = clamp((h - 12) / 6, -1, 1) * 0.55;            // morning shadows fall west, evening shadows east
  SUN.len = 0.25 + Math.abs(h - 12) / 12 * 0.5;
  SUN.tint = h >= 5.5 && h < 8.5 ? (1 - Math.abs(h - 7) / 1.5) * 0.14 : h >= 16.5 && h < 19.5 ? (1 - Math.abs(h - 18) / 1.5) * 0.16 : 0;
  SUN.warm = h > 12;
}
const heat = { grid: null, at: 0, mode: '' };
/* Photo mode 2.0 state: rotation, time-of-day, weather and FOV (height) overrides */
const PHOTO = { on: false, rot: 0, hour: null, fov: 1, tilt: 1, bars: true, weather: null, prevWeather: null };
/* World transform (camera + optional photo-mode rotation around the screen centre) */
function applyWorldTransform(sx, sy) {
  const z = CAM.zoom;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.translate(CW / 2 + (sx || 0), CH / 2 + (sy || 0));
  if (PHOTO.on && PHOTO.rot) ctx.rotate(PHOTO.rot);
  if (PHOTO.on && PHOTO.tilt && PHOTO.tilt < 1) ctx.scale(1, PHOTO.tilt);
  ctx.scale(z, z);
  ctx.translate(-CAM.x, -CAM.y);
}

function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2);
  CW = window.innerWidth; CH = window.innerHeight;
  canvas.width = Math.floor(CW * DPR); canvas.height = Math.floor(CH * DPR);
  canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px';
}
function screenToWorld(sx, sy) { return { x: (sx - CW / 2) / CAM.zoom + CAM.x, y: (sy - CH / 2) / CAM.zoom + CAM.y }; }
function worldToScreen(wx, wy) { return { x: (wx - CAM.x) * CAM.zoom + CW / 2, y: (wy - CAM.y) * CAM.zoom + CH / 2 }; }

/* --- Color helpers ---------------------------------------------------------- */
const shadeCache = new Map();
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function shade(hex, amt) {
  const k = hex + amt; let r = shadeCache.get(k); if (r) return r;
  const c = hexToRgb(hex);
  const f = function (v) { return clamp(Math.round(amt < 0 ? v * (1 + amt / 100) : v + (255 - v) * amt / 100), 0, 255); };
  r = 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  shadeCache.set(k, r); return r;
}
function skinColor(hex, part) {
  const skin = S.settings.skin;
  if (skin === 'gold') return part === 'roof' ? '#e9c46a' : shade(hex, -10);
  if (skin === 'neon') return part === 'roof' ? shade(hex, -25) : shade(hex, -38);
  return hex;
}
function nightFactor() {
  const h = PHOTO.on && PHOTO.hour !== null ? PHOTO.hour : gameHour();
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 20) return (h - 17.5) / 2.5;
  if (h >= 20 || h < 5) return 1;
  return 1 - (h - 5) / 2;
}

/* --- Static ground layer (terrain + roads), redrawn only when needed ----------- */
function drawGroundLayer() {
  const g = GROUND.canvas, s = MAP.W > 64 ? (MAP.W > 80 ? 0.75 : 1) : GROUND.scale, T = TILE;   // big maps: lighter ground cache
  g.width = MAP.W * T * s; g.height = MAP.H * T * s;
  const c = g.getContext('2d');
  c.setTransform(s, 0, 0, s, 0, 0);
  const season = currentSeason();
  const rnd = mulberry32(S.city.seed + 7);
  const L = S.settings.layers;
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    const i = idx(x, y), px = x * T, py = y * T;
    if (!L.terrain) {   // terrain layer hidden: flat planning grid
      c.fillStyle = MAP.nature[i] === 2 ? '#3a5a7a' : ((x + y) % 2 ? '#56606e' : '#5b6574'); c.fillRect(px, py, T, T);
      continue;
    }
    if (MAP.nature[i] === 2) {
      c.fillStyle = season.id === 'winter' ? '#a9d6e5' : '#2f7fbf'; c.fillRect(px, py, T, T);
      c.fillStyle = 'rgba(255,255,255,.12)';
      if (rnd() < 0.5) c.fillRect(px + rnd() * 20, py + rnd() * 26, 8, 2);
      continue;
    }
    c.fillStyle = (x + y) % 2 ? season.grass : season.grass2; c.fillRect(px, py, T, T);
    if (rnd() < 0.25) { c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(px + rnd() * 26, py + rnd() * 26, 5, 5); }
    if (season.id === 'spring' && rnd() < 0.08) { c.fillStyle = pick(['#ffafcc', '#fff', '#ffd166']); c.fillRect(px + rnd() * 28, py + rnd() * 28, 2, 2); }
    const tr = MAP.terrain[i];
    if (tr === TERRAIN.SAND) { c.fillStyle = season.id === 'winter' ? 'rgba(255,255,255,.45)' : 'rgba(233,214,160,.7)'; c.fillRect(px, py, T, T); }
    else if (tr === TERRAIN.HILL) {
      c.fillStyle = 'rgba(40,60,20,.22)'; c.fillRect(px, py, T, T);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.arc(px + 16, py + 20, 9, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    } else if (tr === TERRAIN.ROCK) {
      c.fillStyle = season.id === 'winter' ? '#c9ced6' : '#8b8680'; c.fillRect(px, py, T, T);
      c.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 3; k++) c.fillRect(px + rnd() * 26, py + rnd() * 26, 4 + rnd() * 4, 3);
      c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(px + rnd() * 24, py + rnd() * 24, 5, 2);
    }
    if (L.resources && MAP.res[i]) { const dep = S.economy.deposits[MAP.res[i] - 1]; if (dep) { c.fillStyle = RESOURCE_TYPES[dep.type].color; c.globalAlpha = 0.28; c.fillRect(px + 2, py + 2, T - 4, T - 4); c.globalAlpha = 1; } }
  }
  // Zoning layer
  if (L.zoning) for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    const z = MAP.zone[idx(x, y)]; if (!z) continue;
    c.fillStyle = ZONES[z].color; c.globalAlpha = 0.28; c.fillRect(x * T, y * T, T, T);
    c.globalAlpha = 0.7; c.strokeStyle = ZONES[z].color; c.lineWidth = 1; c.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3); c.globalAlpha = 1;
  }
  // Roads (infrastructure layer) — auto-connected shapes: straight, corner, T, crossroad, dead-end, bridge
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
    if (!L.road || !isRoad(x, y)) continue;
    drawRoadTile(c, x, y, season);
  }
  // Locked land
  const r = unlockedRect();
  c.fillStyle = 'rgba(8,10,25,.55)';
  for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) c.fillRect(x * T, y * T, T, T);
  c.strokeStyle = 'rgba(255,209,102,.8)'; c.lineWidth = 2; c.setLineDash([8, 6]);
  c.strokeRect(r.x0 * T + 1, r.y0 * T + 1, (r.x1 - r.x0 + 1) * T - 2, (r.y1 - r.y0 + 1) * T - 2);
  c.setLineDash([]);
  GROUND.season = seasonIndex(); GROUND.exp = S.city.expansion; GROUND.layerKey = layerKey();
  MAP.groundDirty = false;
}

function drawRoadTile(c, x, y, season) {
  const T = TILE, px = x * T, py = y * T, i = idx(x, y);
  const n = isRoad(x, y - 1), so = isRoad(x, y + 1), w = isRoad(x - 1, y), e = isRoad(x + 1, y);
  const code = MAP.shape[i] || roadShapeCode(x, y), shape = code % 10, bridge = code >= 10;
  const rt = ROAD_TYPES[MAP.roads[i]] || ROAD_TYPES[1], tunnel = MAP.terrain[i] === TERRAIN.ROCK;
  const sw = bridge ? 3 : [0, 7, 5, 2, 1][rt.id];
  if (bridge) {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(px + 3, py + 5, T - 2, T - 2);          // shadow on the water
    c.fillStyle = '#9a8f80'; c.fillRect(px + (w ? 0 : 2), py + (n ? 0 : 2), T - (w ? 0 : 2) - (e ? 0 : 2), T - (n ? 0 : 2) - (so ? 0 : 2));
  } else { c.fillStyle = '#b8b8c4'; c.fillRect(px, py, T, T); }
  c.fillStyle = rt.color;
  c.fillRect(px + (w ? 0 : sw), py + (n ? 0 : sw), T - (w ? 0 : sw) - (e ? 0 : sw), T - (n ? 0 : sw) - (so ? 0 : sw));
  if (shape === 1) c.fillRect(px + sw, py + sw, T - 2 * sw, T - 2 * sw);
  if (shape === 2 && !bridge) {                        // dead-end: rounded turnaround
    c.beginPath(); c.arc(px + T / 2, py + T / 2, T / 2 - 3, 0, 6.283); c.fill();
    c.fillStyle = '#b8b8c4'; c.beginPath(); c.arc(px + T / 2, py + T / 2, 3.5, 0, 6.283); c.fill();
  }
  if (shape === 4 && !bridge) {                        // corner: smooth curb
    const cx = e ? px + T : px, cy = so ? py + T : py;
    const a0 = e && so ? Math.PI : e && n ? Math.PI / 2 : w && so ? -Math.PI / 2 : 0;
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, T - sw, a0, a0 + Math.PI / 2); c.closePath(); c.fill();
    c.strokeStyle = '#f7e9a0'; c.lineWidth = 1.2; c.setLineDash([4, 5]);
    c.beginPath(); c.arc(cx, cy, T / 2, a0, a0 + Math.PI / 2); c.stroke(); c.setLineDash([]);
  }
  c.fillStyle = '#f7e9a0';
  if (shape === 3 || (shape === 2 && bridge)) {
    if (w || e) for (let k = 2; k < T; k += 10) c.fillRect(px + k, py + T / 2 - 0.7, 5, 1.4);
    if (n || so) for (let k = 2; k < T; k += 10) c.fillRect(px + T / 2 - 0.7, py + k, 1.4, 5);
  } else if (shape === 5 || shape === 6) {
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (let k = 6; k < T - 4; k += 4) { if (n) c.fillRect(px + k, py + 1, 2, 4); if (so) c.fillRect(px + k, py + T - 5, 2, 4); if (w) c.fillRect(px + 1, py + k, 4, 2); if (e) c.fillRect(px + T - 5, py + k, 4, 2); }
    if (shape === 5) {                                  // T-junction: stop line on the side street
      c.fillStyle = '#fff';
      if (!n) c.fillRect(px + 6, py + T - 7, T - 12, 1.6); else if (!so) c.fillRect(px + 6, py + 5, T - 12, 1.6);
      else if (!w) c.fillRect(px + T - 7, py + 6, 1.6, T - 12); else c.fillRect(px + 5, py + 6, 1.6, T - 12);
    } else { c.fillStyle = 'rgba(255,209,102,.35)'; c.fillRect(px + 12, py + 12, T - 24, T - 24); }
  }
  if (bridge) {                                         // railings with posts
    c.fillStyle = '#e9ecef';
    if (!n) { c.fillRect(px, py + 1, T, 2); for (let k = 0; k <= T; k += 8) c.fillRect(px + k, py, 2, 4); }
    if (!so) { c.fillRect(px, py + T - 3, T, 2); for (let k = 0; k <= T; k += 8) c.fillRect(px + k, py + T - 4, 2, 4); }
    if (!w) { c.fillRect(px + 1, py, 2, T); for (let k = 0; k <= T; k += 8) c.fillRect(px, py + k, 4, 2); }
    if (!e) { c.fillRect(px + T - 3, py, 2, T); for (let k = 0; k <= T; k += 8) c.fillRect(px + T - 4, py + k, 4, 2); }
  } else if (((x * 7 + y * 13 + (S.city.seed | 0)) % 11) === 0) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(px + 9, py + 22, 2.2, 0, 6.283); c.fill(); }   // manhole
  // Road type markings: large roads have lane lines, highways double yellow + white edges
  if (shape === 3 && rt.id >= 3) {
    const hor = w || e;
    c.fillStyle = 'rgba(255,255,255,.7)';
    for (let k = 2; k < T; k += 8) { if (hor) { c.fillRect(px + k, py + T * 0.28, 4, 1); c.fillRect(px + k, py + T * 0.72, 4, 1); } else { c.fillRect(px + T * 0.28, py + k, 1, 4); c.fillRect(px + T * 0.72, py + k, 1, 4); } }
    if (rt.id === 4) { c.fillStyle = '#ffd166'; if (hor) { c.fillRect(px, py + T / 2 - 1.8, T, 1.1); c.fillRect(px, py + T / 2 + 0.7, T, 1.1); } else { c.fillRect(px + T / 2 - 1.8, py, 1.1, T); c.fillRect(px + T / 2 + 0.7, py, 1.1, T); }
      c.fillStyle = 'rgba(255,255,255,.85)'; if (hor) { c.fillRect(px, py + 2, T, 1); c.fillRect(px, py + T - 3, T, 1); } else { c.fillRect(px + 2, py, 1, T); c.fillRect(px + T - 3, py, 1, T); } }
  }
  // Tunnels through rock: darkened roof with portals where the road enters
  if (tunnel) {
    c.fillStyle = 'rgba(40,36,32,.72)'; c.fillRect(px, py, T, T);
    c.fillStyle = 'rgba(255,220,140,.5)'; c.fillRect(px + T / 2 - 1, py + T / 2 - 1, 2, 2);
    c.strokeStyle = '#d6ccc2'; c.lineWidth = 2;
    [[n, x, y - 1, 0], [so, x, y + 1, 1], [w, x - 1, y, 2], [e, x + 1, y, 3]].forEach(function (q) { if (!q[0] || !inMap(q[1], q[2]) || MAP.terrain[idx(q[1], q[2])] === TERRAIN.ROCK) return; c.beginPath(); if (q[3] === 0) c.arc(px + T / 2, py + 2, 9, 0, Math.PI); else if (q[3] === 1) c.arc(px + T / 2, py + T - 2, 9, Math.PI, 0); else if (q[3] === 2) c.arc(px + 2, py + T / 2, 9, -Math.PI / 2, Math.PI / 2); else c.arc(px + T - 2, py + T / 2, 9, Math.PI / 2, Math.PI * 1.5); c.stroke(); });
  }
  if (season.id === 'winter') { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(px, py, T, T); }
}
/* --- Procedural decoration (seeded: the same CITY seed produces the same props) ---------------- */
function decoRand(x, y, k) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul((S.city.seed | 0) + k * 101, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; }
function decoAt(x, y) {
  const i = idx(x, y);
  if (MAP.roads[i] || MAP.occ[i] || MAP.nature[i] || MAP.terrain[i] === TERRAIN.ROCK) return 0;
  const r = decoRand(x, y, inUnlocked(x, y) ? 1 : 7 + S.city.expansion);
  if (!inUnlocked(x, y)) {                        // rural scenery beyond the city limits (changes when the land opens)
    if (r < 0.035) return 7; if (r < 0.055) return 8; if (r < 0.07) return 12; if (r < 0.12) return 3; return 0;
  }
  const road = isRoad(x, y - 1) || isRoad(x, y + 1) || isRoad(x - 1, y) || isRoad(x + 1, y);
  if (road) { if (r < 0.10) return 2; if (r < 0.15) return 6; if (r < 0.19) return 1; if (r < 0.22) return 11; return 0; }
  if (MAP.terrain[i] === TERRAIN.HILL && r < 0.12) return 5;
  if (r < 0.05) return 3; if (r < 0.085) return 4; if (r < 0.095) return 10; if (r < 0.1) return 9;
  return 0;
}
function drawDeco(v) {
  if (S.settings.deco === false || CAM.zoom < 0.5) return;
  const T = TILE, nf = nightFactor(), dens = PERF.scale;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const k = decoAt(x, y); if (!k) continue;
    if (dens < 0.99 && decoRand(x, y, 3) > dens) continue;
    const px = x * T, py = y * T, r2 = decoRand(x, y, 2), ox = 6 + r2 * 18, oy = 8 + decoRand(x, y, 4) * 16;
    ctx.globalAlpha = inUnlocked(x, y) ? 1 : 0.6;
    switch (k) {
      case 1: ctx.fillStyle = '#8d5524'; ctx.fillRect(px + ox - 5, py + oy, 10, 2.5); ctx.fillRect(px + ox - 5, py + oy - 3, 10, 1.5); ctx.fillStyle = '#333'; ctx.fillRect(px + ox - 4, py + oy + 2, 1, 2); ctx.fillRect(px + ox + 3, py + oy + 2, 1, 2); break;
      case 2: ctx.fillStyle = '#495057'; ctx.fillRect(px + ox, py + oy - 12, 1.6, 13); ctx.fillStyle = nf > 0.3 ? '#fff3b0' : '#adb5bd'; ctx.fillRect(px + ox - 1.5, py + oy - 14, 4.5, 2.5); break;
      case 3: ctx.fillStyle = currentSeason().id === 'autumn' ? '#bc6c25' : currentSeason().id === 'winter' ? '#dfe7ec' : '#40916c'; ctx.beginPath(); ctx.arc(px + ox, py + oy, 4 + r2 * 2, 0, 6.283); ctx.arc(px + ox + 4, py + oy + 1, 3, 0, 6.283); ctx.fill(); break;
      case 4: { const cols = ['#ffafcc', '#ffd166', '#cdb4db', '#fff']; for (let q = 0; q < 5; q++) { ctx.fillStyle = cols[(q + x) % 4]; ctx.fillRect(px + ox + decoRand(x, y, 10 + q) * 10 - 5, py + oy + decoRand(x, y, 20 + q) * 8 - 4, 2, 2); } } break;
      case 5: ctx.fillStyle = '#8b8680'; ctx.beginPath(); ctx.ellipse(px + ox, py + oy, 5, 3.5, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px + ox - 2, py + oy - 2, 3, 1); break;
      case 6: { const col = VEHICLE_SPECS.car.colors[Math.floor(r2 * 8) % 8]; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + ox - 6, py + oy - 2, 13, 8); ctx.fillStyle = col; ctx.fillRect(px + ox - 7, py + oy - 4, 13, 7); ctx.fillStyle = 'rgba(160,210,255,.85)'; ctx.fillRect(px + ox + 1, py + oy - 3, 3, 5); } break;
      case 7: ctx.fillStyle = '#c9a26b'; ctx.fillRect(px + ox - 6, py + oy - 6, 12, 9); ctx.fillStyle = '#9d0208'; ctx.beginPath(); ctx.moveTo(px + ox - 8, py + oy - 6); ctx.lineTo(px + ox, py + oy - 12); ctx.lineTo(px + ox + 8, py + oy - 6); ctx.fill(); break;
      case 8: ctx.fillStyle = '#f1faee'; ctx.fillRect(px + ox - 8, py + oy - 7, 16, 11); ctx.fillStyle = '#577590'; ctx.fillRect(px + ox - 9, py + oy - 10, 18, 4); ctx.fillStyle = '#6a994e'; ctx.fillRect(px + 2, py + T - 6, T - 4, 3); break;
      case 9: ctx.fillStyle = '#adb5bd'; ctx.beginPath(); ctx.arc(px + 16, py + 16, 6, 0, 6.283); ctx.fill(); ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(px + 16, py + 16, 4, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(px + 15.5, py + 10 + Math.sin(FX.time * 4) * 1.5, 1.2, 5); break;
      case 10: ctx.fillStyle = '#a0522d'; ctx.fillRect(px + ox - 5, py + oy - 2, 10, 4); ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(px + ox, py + oy - 9, 6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#6b4226'; ctx.fillRect(px + ox - 0.5, py + oy - 9, 1, 8); break;
      case 11: ctx.fillStyle = '#d00000'; ctx.fillRect(px + ox - 1.5, py + oy - 5, 3, 5); ctx.fillRect(px + ox - 2.5, py + oy - 3.5, 5, 1.5); break;
      case 12: ctx.fillStyle = '#9d0208'; ctx.fillRect(px + ox - 5, py + oy - 9, 10, 11); ctx.fillStyle = '#e9ecef'; ctx.fillRect(px + ox + 6, py + oy - 14, 4, 16); ctx.fillStyle = '#adb5bd'; ctx.beginPath(); ctx.arc(px + ox + 8, py + oy - 14, 2.5, Math.PI, 0); ctx.fill(); break;
    }
  }
  ctx.globalAlpha = 1;
}
function layerKey() { const L = S.settings.layers; return (L.terrain ? 1 : 0) + '' + (L.zoning ? 1 : 0) + (L.road ? 1 : 0) + (L.resources ? 1 : 0); }
/* Dynamic skyline behind the map: grows with city level (seeded, so every city has its own silhouette) */
function drawSkyline(nf) {
  const top = worldToScreen(0, 0).y;
  if (top < 30) return;
  const lvl = cityLevel(), rnd = mulberry32((S.city.seed | 0) + 99);
  const count = 8 + lvl * 5, towers = S.buildings.list.filter(function (b) { return b.built && bdef(b).height >= 100; }).length;
  const base = Math.min(top, CH);
  const par = (CAM.x / (MAP.W * TILE) - 0.5) * 60;
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? (nf > 0.5 ? '#0e1433' : '#39457e') : (nf > 0.5 ? '#141b42' : '#4b5793');
    for (let k = 0; k < count; k++) {
      const w = 14 + rnd() * 26, x = (k / count) * (CW + 120) - 60 + rnd() * 20 - par * (layer ? 0.5 : 1);
      let hgt = 20 + rnd() * (18 + lvl * 7) * (layer ? 0.7 : 1);
      if (rnd() < Math.min(0.5, towers * 0.04 + lvl * 0.012)) hgt *= 1.8 + rnd();
      hgt = Math.min(hgt, base - 10);
      ctx.fillRect(x, base - hgt, w, hgt);
      if (nf > 0.3 && !layer) { ctx.fillStyle = 'rgba(255,214,120,' + (0.5 * nf) + ')'; for (let wy = base - hgt + 5; wy < base - 4; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rnd() < 0.35) ctx.fillRect(wx, wy, 2, 3); ctx.fillStyle = nf > 0.5 ? '#141b42' : '#4b5793'; }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(S.city.name.toUpperCase() + ' · LV ' + lvl, CW / 2, Math.max(16, base - 8 - Math.min(base - 30, 20 + lvl * 7) * 1.1));
}

/* --- Particles & floating text -------------------------------------------------- */
function spawnParticles(x, y, type, n) {
  if (!S) return;
  const max = Math.floor(perf().part * PERF.scale * (S.settings.particleReduce ? 0.3 : 1));
  for (let i = 0; i < n && FX.particles.length < max; i++) {
    const p = FX.pool.pop() || {};           // object pooling: particles are recycled
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.life = 1; p.max = 1; p.size = 2; p.color = '#fff'; p.type = type; p.g = 0; p.rot = 0;
    switch (type) {
      case 'dust': p.vx = rand(-25, 25); p.vy = rand(-30, -5); p.max = p.life = rand(0.6, 1.1); p.size = rand(2, 5); p.color = pick(['#c9b79c', '#a89f91', '#d6ccc2']); break;
      case 'spark': p.vx = rand(-60, 60); p.vy = rand(-90, -20); p.g = 160; p.max = p.life = rand(0.3, 0.6); p.size = rand(1.5, 2.5); p.color = pick(['#ffd166', '#fff3b0', '#ff9f1c']); break;
      case 'confetti': p.vx = rand(-60, 60); p.vy = rand(-110, -40); p.g = 90; p.max = p.life = rand(1, 1.8); p.size = rand(2, 4); p.color = pick(['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0', '#9b5de5']); p.rot = rand(0, 6); break;
      case 'smoke': p.vx = rand(-4, 8); p.vy = rand(-16, -8); p.max = p.life = rand(2, 3.4); p.size = rand(3, 5); p.color = 'rgba(120,120,130,'; break;
      case 'fire': p.vx = rand(-10, 10); p.vy = rand(-40, -20); p.max = p.life = rand(0.4, 0.8); p.size = rand(3, 6); p.color = pick(['#ffba08', '#f48c06', '#e85d04', '#dc2f02']); break;
      case 'coin': p.vx = rand(-12, 12); p.vy = rand(-50, -35); p.g = 30; p.max = p.life = 1.2; p.size = 4; p.color = '#ffd166'; break;
      case 'leaf': p.vx = rand(-20, 20); p.vy = rand(-20, 5); p.g = 25; p.max = p.life = rand(1, 2); p.size = 3; p.color = pick(['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f']); break;
      case 'firework': p.vx = rand(-1, 1) * 70; p.vy = rand(-1, 1) * 70; p.g = 40; p.max = p.life = rand(0.9, 1.5); p.size = 2; p.color = pick(['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#fff']); break;
      case 'note': p.vx = rand(-8, 8); p.vy = rand(-25, -15); p.max = p.life = 2; p.size = 10; p.color = pick(['#ff006e', '#ffbe0b', '#3a86ff']); break;
    }
    FX.particles.push(p);
  }
}
function floatText(x, y, text, color) { if (FX.texts.length < 40) FX.texts.push({ x: x, y: y, text: text, color: color || '#fff', life: 1.4 }); }
function shake(v) { if (S && (S.settings.screenShake === false || S.settings.reducedMotion)) return; FX.shake = Math.max(FX.shake, v); }
function updateFX(dt) {
  const ps = FX.particles;
  const max = Math.floor(perf().part * PERF.scale);
  if (ps.length > max) ps.splice(0, ps.length - max);
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt; if (p.life <= 0) { ps.splice(i, 1); if (FX.pool.length < 1500) FX.pool.push(p); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'dust' || p.type === 'smoke') p.size += dt * 3;
    p.rot += dt * 5;
  }
  for (let i = FX.texts.length - 1; i >= 0; i--) { const t = FX.texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) FX.texts.splice(i, 1); }
  FX.shake = Math.max(0, FX.shake - dt * 10);
  FX.flash = Math.max(0, FX.flash - dt * 2.5);
}

/* --- Weather ------------------------------------------------------------------ */
function updateWeather(dt) {
  const storm = activeEvent('storm');
  let w = FX.weather;
  if (storm) w = 'storm';
  else if (FX.lock && S.clock.gameSec < FX.weatherUntil) w = FX.lock;            // weather chosen by the admin / world climate
  else if (S.p9 && S.p9.freeze.weather) { FX.weatherUntil = S.clock.gameSec + 3600; }           // Part 9: frozen weather
  else if (S.clock.gameSec >= FX.weatherUntil || w === 'storm') {
    FX.lock = null;
    const season = currentSeason().id;
    const r = Math.random();
    w = S.p9 ? pickWeather2(season) : season === 'winter' ? (r < 0.45 ? 'snow' : 'clear') : (r < (season === 'autumn' ? 0.35 : season === 'summer' ? 0.12 : 0.25) ? 'rain' : 'clear');
    FX.weatherUntil = S.clock.gameSec + rand(2, 5) * 3600;
  }
  if (w !== FX.weather) { FX.weather = w; FX.drops = []; if (w !== 'clear') sfx('weather'); }
  const precip = FX.weather === 'rain' || FX.weather === 'storm' || FX.weather === 'snow' || FX.weather === 'heavyrain' || FX.weather === 'coldwave';
  const want = !precip ? 0 : Math.floor((FX.weather === 'snow' ? 140 : FX.weather === 'coldwave' ? 70 : FX.weather === 'storm' || FX.weather === 'heavyrain' ? 330 : 200) * perf().weather * PERF.scale);
  while (FX.drops.length < want) FX.drops.push({ x: Math.random() * CW, y: Math.random() * CH, s: rand(0.6, 1.2), o: Math.random() * 6 });
  if (FX.drops.length > want) FX.drops.length = want;
  const snow = FX.weather === 'snow' || FX.weather === 'coldwave';
  const vy = snow ? 40 : (FX.weather === 'storm' ? 700 : FX.weather === 'heavyrain' ? 640 : 500), vx = snow ? 0 : (FX.weather === 'storm' ? -220 : FX.weather === 'heavyrain' ? -120 : -80);
  FX.drops.forEach(function (d) {
    d.y += vy * d.s * dt; d.x += (vx + (snow ? Math.sin(FX.time + d.o) * 20 : 0)) * d.s * dt;
    if (d.y > CH) { d.y = -10; d.x = Math.random() * (CW + 200); }
    if (d.x < -20) d.x = CW + 10;
  });
  if (FX.weather === 'storm' && Math.random() < dt * 0.25) { FX.flash = 1; shake(3); sfx('thunder'); }
  SND.setRain(FX.weather === 'rain' || FX.weather === 'storm' || FX.weather === 'heavyrain');
}

/* --- Heat-map overlays ---------------------------------------------------------- */
function computeHeat(mode) {
  const N = MAP.W * MAP.H;
  if (!heat.grid || heat.grid.length !== N) heat.grid = new Float32Array(N);
  const g = heat.grid; g.fill(0);
  if (mode === 'POLLUTION') {
    S.buildings.list.forEach(function (b) {
      const d = bdef(b); if (!b.built || !d.pol) return;
      const c = buildingCenter(b), R = 6;
      const v = d.pol * lvlMult(b.level) * (d.pol > 0 ? Math.max(0.3, b._eff) : 1);
      const cx = c.x / TILE, cy = c.y / TILE;
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        if (!inMap(x, y)) continue;
        const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (dd > R) continue;
        g[idx(x, y)] += v * (1 - dd / R) * 0.12;
      }
    });
    for (let i = 0; i < N; i++) if (MAP.roads[i]) g[i] += SIM.traffic / 250;
    // Parks & trees clean the air around them
    S.buildings.list.forEach(function (b) { const d = bdef(b); if (!b.built || d.pol >= 0) return; const c = buildingCenter(b); const cx = Math.floor(c.x / TILE), cy = Math.floor(c.y / TILE); for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inMap(x, y)) g[idx(x, y)] = Math.max(0, g[idx(x, y)] + d.pol * 0.05 * (hasTech('env_green') ? 2 : 1)); });
    let mx = 0; for (let i = 0; i < N; i++) if (g[i] > mx) mx = g[i];
    const k = Math.max(1, mx) * (1.2 - S.city.pollution / 100);
    for (let i = 0; i < N; i++) g[i] = g[i] / k;
  } else if (mode === 'FIRE' || mode === 'POLICE' || mode === 'HEALTH') {
    const t = mode === 'FIRE' ? 'fire' : mode === 'POLICE' ? 'police' : 'health';
    MAP.lists[t].forEach(function (s) {
      if (!s.built || !s._road) return;
      const c = buildingCenter(s), R = coverRadius(s), cx = c.x / TILE, cy = c.y / TILE;
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        if (!inMap(x, y)) continue;
        const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (dd <= R) g[idx(x, y)] = Math.max(g[idx(x, y)], 1 - dd / R * 0.5);
      }
    });
  }
  heat.at = FX.time; heat.mode = mode;
}
function drawOverlay(v) {
  const mode = OVERLAYS[UI.overlay];
  if (mode === 'NONE') return;
  if (heatDef(mode)) { drawHeat6(v, mode); return; }
  if (mode === 'POWER') {
    S.buildings.list.forEach(function (b) {
      const d = bdef(b); if (!b.built) return;
      ctx.fillStyle = d.power > 0 ? 'rgba(255,209,102,.55)' : (d.power < 0 ? (b._powered ? 'rgba(6,214,160,.45)' : 'rgba(239,71,111,.6)') : 'rgba(0,0,0,0)');
      ctx.fillRect(b.x * TILE, b.y * TILE, d.w * TILE, d.h * TILE);
    });
    return;
  }
  if (mode === 'DENSITY' || mode === 'LAND VALUE') {
    if (!MAP.districts.length) computeDistricts();
    const n = MAP.dN, cs = 8 * TILE;
    const cols = ['rgba(144,190,109,.35)', 'rgba(249,199,79,.4)', 'rgba(248,150,30,.45)', 'rgba(239,71,111,.5)'];
    MAP.districts.forEach(function (t, k) {
      const x = (k % n) * cs, y = Math.floor(k / n) * cs;
      if (mode === 'DENSITY') ctx.fillStyle = t.built ? cols[t.level] : 'rgba(0,0,0,0)';
      else { const lv = clamp((t.level * 0.04 + t.green * 0.02 + (t.built ? 0.05 : 0)) / 0.25, 0, 1); ctx.fillStyle = 'rgba(' + Math.round(80 + 170 * lv) + ',' + Math.round(200 - 40 * lv) + ',90,' + (0.15 + lv * 0.35) + ')'; }
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      if (t.built && CAM.zoom > 0.45) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mode === 'DENSITY' ? DENSITY_NAMES[t.level] : 'Value ×' + (0.88 + t.level * 0.04 + t.green * 0.02).toFixed(2), x + cs / 2, y + 14); }
    });
    return;
  }
  if (heat.mode !== mode || FX.time - heat.at > 1) computeHeat(mode);
  const g = heat.grid;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const val = g[idx(x, y)];
    if (mode === 'POLLUTION') { if (val <= 0.02) continue; ctx.fillStyle = 'rgba(' + Math.round(120 + 135 * Math.min(1, val)) + ',' + Math.round(90 - 60 * Math.min(1, val)) + ',40,' + Math.min(0.6, val * 0.8) + ')'; }
    else ctx.fillStyle = val > 0 ? 'rgba(6,214,160,' + (0.18 + val * 0.3) + ')' : (MAP.occ[idx(x, y)] ? 'rgba(239,71,111,.35)' : 'rgba(0,0,0,0)');
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
}

/* --- Entities ----------------------------------------------------------------- */
function drawTree(x, y, s, season, seed) {
  const top = season.id === 'autumn' ? (seed % 3 === 0 ? '#e76f51' : seed % 3 === 1 ? '#f4a261' : '#e9c46a') : season.id === 'winter' ? '#dfe7ec' : (season.id === 'spring' && seed % 6 === 0 ? '#ffafcc' : '#2d6a4f');
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + 3 * s, y + 1, 7 * s, 3 * s, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#6b4226'; ctx.fillRect(x - 1.5 * s, y - 7 * s, 3 * s, 7 * s);
  ctx.fillStyle = top; ctx.beginPath(); ctx.arc(x, y - 11 * s, 7 * s, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x - 2 * s, y - 13 * s, 3 * s, 0, 6.283); ctx.fill();
  if (season.id === 'winter') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 15 * s, 4 * s, Math.PI, 0); ctx.fill(); }
}
function drawCitizen(c) {
  const x = c.x, y = c.y;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 2, y, 4, 1.5);
  ctx.fillStyle = c.tourist ? '#ff9f1c' : c.color; ctx.fillRect(x - 2, y - 6, 4, 5);
  ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(x, y - 8, 2, 0, 6.283); ctx.fill();
  if (c.tourist) { ctx.fillStyle = '#222'; ctx.fillRect(x - 1, y - 5, 2, 2); }
}
function drawVehicle(v) {
  const off = (v.pull || 0) * 5;
  ctx.save(); ctx.translate(v.x - v.hy * off, v.y + v.hx * off); ctx.rotate(Math.atan2(v.hy, v.hx));
  const L = v.len, W = v.wid;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-L / 2 + 1, -W / 2 + 2, L, W);
  ctx.fillStyle = v.color; ctx.fillRect(-L / 2, -W / 2, L, W);
  ctx.fillStyle = 'rgba(160,210,255,.85)';
  if (v.type === 'bus' || v.type === 'tram' || v.type === 'shuttle') { for (let k = -L / 2 + 3; k < L / 2 - 3; k += 4) ctx.fillRect(k, -W / 2 + 1, 2.5, W - 2); if (v.type === 'tram') { ctx.fillStyle = '#fff'; ctx.fillRect(-L / 2, -1, L, 2); } }
  else ctx.fillRect(L / 2 - 5, -W / 2 + 1, 3, W - 2);
  if (v.type === 'truck') { ctx.fillStyle = '#e9ecef'; ctx.fillRect(-L / 2, -W / 2, L - 6, W); }
  if (v.type === 'taxi') { ctx.fillStyle = '#222'; ctx.fillRect(-2, -1.5, 4, 3); }
  if (v.type === 'ambulance') { ctx.fillStyle = '#e63946'; ctx.fillRect(-3, -1, 6, 2); ctx.fillRect(-1, -3, 2, 6); }
  if (v.type === 'race') { ctx.fillStyle = '#fff'; ctx.fillRect(-L / 2, -1, L, 2); }
  if (v.type === 'police') { ctx.fillStyle = '#fff'; ctx.fillRect(-2, -W / 2, 4, W); }
  if (v.siren) { const on = Math.floor(FX.time * 8) % 2; ctx.fillStyle = on ? '#ff1744' : '#2979ff'; ctx.fillRect(-2, -W / 2 - 1, 4, 2); }
  if (v.speed === 0 && v.stopped > 0.2) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(-L / 2 - 1, -W / 2 + 1, 1.5, 2); ctx.fillRect(-L / 2 - 1, W / 2 - 3, 1.5, 2); }
  ctx.restore();
}
function drawEmoji(icon, x, y, size) {
  if (size * CAM.zoom < 7) return;
  ctx.font = Math.round(size) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y);
}
function buildingHeight(b) { const d = bdef(b); return d.height * (1 + 0.15 * (b.level - 1)) * (PHOTO.on ? PHOTO.fov : 1) * (b._rise !== undefined ? 0.12 + 0.88 * b._rise : 1); }

function drawBuilding(b) {
  const d = bdef(b);
  const T = TILE, m = 3, season = currentSeason();
  const x0 = b.x * T + m, y0 = b.y * T + m, w = d.w * T - 2 * m, h = d.h * T - 2 * m;
  const q = perf();
  if (d.id === 'tree') { drawTree(b.x * T + T / 2, b.y * T + T - 6, 1.1, season, b.id); return; }
  if (!b.built && S.p9) { drawConstructionSite(b, d, x0, y0, w, h); return; }
  if (!b.built) {
    const H = buildingHeight(b) * b.progress;
    ctx.fillStyle = '#8d8d99'; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
    if (H > 1) {
      ctx.fillStyle = shade(d.color, -20); ctx.globalAlpha = 0.85;
      ctx.fillRect(x0 + 2, y0 + h - H - 2, w - 4, H);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#f4a261'; ctx.lineWidth = 1;
    const top = y0 + h - Math.max(H, 8) - 4;
    for (let k = 0; k <= 3; k++) { const xx = x0 + k * w / 3; ctx.beginPath(); ctx.moveTo(xx, y0 + h); ctx.lineTo(xx, top); ctx.stroke(); }
    for (let yy = y0 + h; yy > top; yy -= 6) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke(); }
    // crane
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + w - 3, y0 + h); ctx.lineTo(x0 + w - 3, top - 14); ctx.lineTo(x0 - 6, top - 14); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 4, top - 14); ctx.lineTo(x0 + 4, top - 14 + 8 + Math.sin(FX.time * 3) * 3); ctx.stroke();
    // progress bar
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0, y0 - 8 - Math.max(H, 8), w, 4);
    ctx.fillStyle = '#06d6a0'; ctx.fillRect(x0, y0 - 8 - Math.max(H, 8), w * b.progress, 4);
    return;
  }
  const sk = BUILDING_SKINS[b.skin | 0];
  const baseC = sk.wall || skinColor(d.color, 'wall'), roofC = sk.roof || skinColor(d.roof, 'roof');
  // --- Flat buildings ---
  if (d.id === 'farm') {
    ctx.fillStyle = season.id === 'winter' ? '#e8eef2' : '#bc8a5f'; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = season.id === 'winter' ? '#cfd8dc' : (season.id === 'autumn' ? '#e9c46a' : '#6a994e');
    for (let yy = y0 + 3; yy < y0 + h - 2; yy += 6) ctx.fillRect(x0 + 3, yy, w - 6, 3);
    ctx.fillStyle = '#9d0208'; ctx.fillRect(x0 + w - 16, y0 + 4, 12, 10); ctx.fillStyle = '#6a040f'; ctx.fillRect(x0 + w - 17, y0 + 2, 14, 3);
    statusIcons(b, x0, y0, w, h, 8); return;
  }
  if (d.id === 'park' || d.id === 'plaza') {
    ctx.fillStyle = season.id === 'winter' ? '#e8eef2' : '#52b788'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0 + h / 2); ctx.lineTo(x0 + w, y0 + h / 2); ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x0 + w / 2, y0 + h); ctx.stroke();
    if (d.id === 'plaza') {
      const cx = x0 + w / 2, cy = y0 + h / 2;
      ctx.fillStyle = '#adb5bd'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; for (let k = 0; k < 5; k++) { const a = FX.time * 2 + k * 1.25; ctx.fillRect(cx + Math.cos(a) * 4, cy - 6 + Math.sin(a * 2) * 2, 1.5, 4); }
      drawTree(x0 + 8, y0 + 14, 0.8, season, b.id); drawTree(x0 + w - 8, y0 + h - 4, 0.8, season, b.id + 1);
    } else {
      drawTree(x0 + 7, y0 + 13, 0.7, season, b.id);
      ctx.fillStyle = '#ffafcc'; ctx.fillRect(x0 + w - 9, y0 + h - 9, 3, 3); ctx.fillStyle = '#ffd166'; ctx.fillRect(x0 + w - 5, y0 + h - 6, 3, 3);
    }
    return;
  }
  if (d.id === 'airport') { if ((b.rot | 0) & 1) { ctx.save(); ctx.translate(x0 + w / 2, y0 + h / 2); ctx.rotate(Math.PI / 2); drawAirport(b, -h / 2, -w / 2, h, w); ctx.restore(); } else drawAirport(b, x0, y0, w, h); return; }
  let H = buildingHeight(b);
  if (d.id === 'solar' || d.id === 'wind') H = d.height;
  // Shadow
  if (q.shadow && PERF.scale >= 0.6) {
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    const shx = H * SUN.dx * SUN.len * 1.6, sxe = shx >= 0 ? x0 + w : x0;
    ctx.beginPath(); ctx.moveTo(sxe, y0 + h); ctx.lineTo(sxe + shx, y0 + h - H * 0.25); ctx.lineTo(sxe + shx, y0 - H * 0.25 + 4); ctx.lineTo(sxe, y0 + 4); ctx.closePath(); ctx.fill();
  }
  if (d.id === 'wheel') { drawWheel(b, x0, y0, w, h); return; }
  if (d.id === 'stadium' || d.id === 'megastadium') { drawStadium(b, x0, y0, w, h, H); return; }
  if (d.id === 'watertower') {
    ctx.fillStyle = '#6c757d'; ctx.fillRect(x0 + w / 2 - 2, y0 + h - H + 8, 4, H - 8);
    ctx.fillStyle = baseC; ctx.fillRect(x0 + 4, y0 + h - H - 2, w - 8, 12);
    ctx.fillStyle = roofC; ctx.beginPath(); ctx.ellipse(x0 + w / 2, y0 + h - H - 2, w / 2 - 4, 4, 0, 0, 6.283); ctx.fill();
    statusIcons(b, x0, y0, w, h, H); return;
  }
  // Front face
  const fy = y0 + h - H;
  const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  grad.addColorStop(0, shade(baseC, -8)); grad.addColorStop(1, shade(baseC, -28));
  ctx.fillStyle = grad; ctx.fillRect(x0, fy, w, H);
  // Windows
  if (q.windows && H >= 14 && d.sector !== 'ENERGY') {
    const nf = nightFactor();
    ctx.fillStyle = nf > 0.5 ? 'rgba(30,30,50,.75)' : 'rgba(40,60,100,.45)';
    const cols = Math.max(1, Math.floor(w / 7)), rows = Math.max(1, Math.floor((H - 6) / 8));
    const cw = w / cols;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) ctx.fillRect(x0 + k * cw + 2, fy + 4 + r * 8, cw - 4, 4);
  }
  // Entrance (faces the building's rotation: 0 south, 1 east, 2 north, 3 west)
  const rot = (b.rot | 0) & 3;
  const dx = rot === 1 ? x0 + w - 10 : rot === 3 ? x0 + 4 : x0 + w / 2 - 3;
  if (rot !== 2) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(dx, y0 + h - 7, 6, 7); ctx.fillStyle = shade(d.color, 25); ctx.fillRect(dx - 2, y0 + h - 9, 10, 2); }
  if (rot === 1 || rot === 3) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rot === 1 ? x0 + w - 2 : x0, fy + 4, 2, H - 4); }
  // Roof (top face shifted up by H)
  ctx.fillStyle = roofC; ctx.fillRect(x0, fy - h, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x0, fy - h, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x0, fy - 2, w, 2);
  if (season.id === 'winter') { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x0 + 1, fy - h + 1, w - 2, h * 0.45); }
  if (rot === 2) { ctx.fillStyle = shade(d.color, 25); ctx.fillRect(x0 + w / 2 - 5, fy - h, 10, 3); }
  if (b.closed) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0, fy - h, w, h + H); }
  if (S.settings.skin === 'gold' || sk.trim) { ctx.strokeStyle = sk.trim || '#ffd166'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 1, fy - h + 1, w - 2, h - 2); }
  if (sk.neon) { ctx.strokeStyle = sk.neon; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2; ctx.strokeRect(x0 + 0.5, fy - h + 0.5, w - 1, h + H - 1); ctx.globalAlpha = 1; }
  if (sk.id === 'Modern' && H >= 14) { ctx.fillStyle = 'rgba(120,180,230,.35)'; ctx.fillRect(x0 + 2, fy + 3, w - 4, H - 10); }
  if (isAI(b) && CAM.zoom > 0.8) { const a = aiDef(b.owner); if (a) { ctx.fillStyle = a.color; ctx.fillRect(x0 + w - 6, fy - h + 2, 4, 4); } }
  if (S.settings.skin === 'neon' && !FX.lightPass) { ctx.strokeStyle = shade(d.color, 30); ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, fy - h + 0.5, w - 1, h + H - 1); }
  // Roof details by type
  if (d.id === 'solar') { ctx.fillStyle = '#26547c'; for (let yy = 2; yy < h - 3; yy += 7) for (let xx = 2; xx < w - 3; xx += 9) { ctx.fillRect(x0 + xx, fy - h + yy, 7, 5); } ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x0 + 2, fy - h + 2, w - 4, 1); }
  else if (d.id === 'wind') {
    for (let k = 0; k < 4; k++) {
      const tx = x0 + 10 + (k % 2) * (w - 20), ty = fy - h + 10 + Math.floor(k / 2) * (h - 20);
      ctx.fillStyle = '#e9ecef'; ctx.fillRect(tx - 1, ty - 22, 2, 22);
      const a = FX.time * 3 + k;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      for (let j = 0; j < 3; j++) { const aa = a + j * 2.094; ctx.beginPath(); ctx.moveTo(tx, ty - 22); ctx.lineTo(tx + Math.cos(aa) * 9, ty - 22 + Math.sin(aa) * 9); ctx.stroke(); }
    }
  } else if (d.smoke) {
    const sx = rot === 1 || rot === 2 ? x0 + 3 : x0 + w - 8, sy = fy - h + 4;
    ctx.fillStyle = shade(baseC, -35); ctx.fillRect(sx, sy - 14, 5, 16);
    ctx.fillStyle = '#e63946'; ctx.fillRect(sx, sy - 14, 5, 2);
    if (b._op && b._eff > 0 && Math.random() < 0.05 * PERF.scale) spawnParticles(sx + 2.5, sy - 15, 'smoke', 1);
  } else if (d.id === 'megatower' || d.id === 'quantumspire') {
    ctx.fillStyle = shade(baseC, 20); ctx.fillRect(x0 + w / 2 - 2, fy - h - 26, 4, 26);
    ctx.fillStyle = Math.floor(FX.time * 2) % 2 ? '#ff1744' : '#fff'; ctx.beginPath(); ctx.arc(x0 + w / 2, fy - h - 27, 2.5, 0, 6.283); ctx.fill();
  } else if (d.id === 'spacecenter') {
    const rx = x0 + w * 0.7, ry = fy - h + h * 0.5;
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(rx - 4, ry - 48, 8, 48);
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(rx - 4, ry - 48); ctx.lineTo(rx, ry - 58); ctx.lineTo(rx + 4, ry - 48); ctx.fill();
    ctx.fillStyle = '#495057'; ctx.fillRect(rx - 7, ry - 6, 3, 8); ctx.fillRect(rx + 4, ry - 6, 3, 8);
    if (Math.random() < 0.08 * PERF.scale) spawnParticles(rx, ry, 'smoke', 1);
  } else if (d.id === 'hospital') {
    ctx.fillStyle = '#e63946'; ctx.fillRect(x0 + w / 2 - 6, fy - h / 2 - 2, 12, 4); ctx.fillRect(x0 + w / 2 - 2, fy - h / 2 - 6, 4, 12);
  } else if (d.id === 'metro') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', x0 + w / 2, fy - h / 2);
  }
  if (d.id !== 'wind' && d.id !== 'solar' && d.id !== 'metro' && d.id !== 'hospital') drawEmoji(d.icon, x0 + w / 2, fy - h / 2, Math.min(w, h) * 0.55);
  // Level stars
  if (b.level >= 6 && H >= 20) { ctx.fillStyle = shade(baseC, 30); ctx.fillRect(x0 + w * 0.3, fy - h - 6 - b.level, 2, 6 + b.level); ctx.fillStyle = Math.floor(FX.time * 2 + b.id) % 2 ? '#ff4d6d' : '#ffd166'; ctx.fillRect(x0 + w * 0.3 - 1, fy - h - 8 - b.level, 4, 3); if (b.level >= 8) { ctx.strokeStyle = 'rgba(255,209,102,.8)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 2, fy - h + 2, w - 4, h - 4); } }
  if (b.level > 1 && CAM.zoom > 0.7) { ctx.fillStyle = '#ffd166'; for (let k = 0; k < b.level - 1; k++) ctx.fillRect(x0 + 2 + k * 4, fy - h + 2, 3, 3); }
  statusIcons(b, x0, y0, w, h, H);
}
function statusIcons(b, x0, y0, w, h, H) {
  const d = bdef(b);
  const top = y0 + h - H - h - 6;
  const cx = x0 + w / 2;
  if (b.fire > 0) {
    for (let k = 0; k < 2; k++) spawnParticles(x0 + rand(0, w), y0 + h - H - rand(0, h), 'fire', 1);
    if (Math.random() < 0.2) spawnParticles(cx, top, 'smoke', 1);
  }
  let icon = null;
  if (!d.noRoad && !b._road) icon = '🚧';
  else if (!b._powered && Math.floor(FX.time * 2) % 2) icon = '⚡';
  else if (b.damaged) icon = '🔨';
  else if (b._tip > S.clock.runSec) icon = '💰';
  if (icon) {
    const bob = Math.sin(FX.time * 4 + b.id) * 2;
    ctx.fillStyle = icon === '💰' ? 'rgba(255,209,102,.95)' : 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(cx, top - 6 + bob, 8, 0, 6.283); ctx.fill();
    drawEmoji(icon, cx, top - 6 + bob, 11);
  }
  if (b.upg > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0, top + 2, w, 4);
    ctx.fillStyle = '#4cc9f0'; ctx.fillRect(x0, top + 2, w * b.upg, 4);
  }
}
function drawAirport(b, x0, y0, w, h) {
  ctx.fillStyle = '#7d8597'; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = '#343a40'; ctx.fillRect(x0 + 6, y0 + h - 34, w - 12, 20);
  ctx.fillStyle = '#fff'; for (let k = x0 + 12; k < x0 + w - 16; k += 16) ctx.fillRect(k, y0 + h - 25, 9, 2);
  const tx = x0 + 10, ty = y0 + 6, tw = w * 0.45, th = h * 0.42;
  ctx.fillStyle = shade('#ced4da', -20); ctx.fillRect(tx, ty + th - 14, tw, 14);
  ctx.fillStyle = '#e9ecef'; ctx.fillRect(tx, ty - 14 + th - th, tw, th);
  ctx.fillStyle = 'rgba(76,201,240,.6)'; ctx.fillRect(tx + 3, ty + th - 11, tw - 6, 5);
  ctx.fillStyle = '#adb5bd'; ctx.fillRect(x0 + w - 40, y0 + 4, 10, 30);
  ctx.fillStyle = '#4cc9f0'; ctx.fillRect(x0 + w - 44, y0, 18, 8);
  drawEmoji('✈️', tx + tw / 2, ty + th / 2 - 14, 22);
  statusIcons(b, x0, y0, w, h, 14);
}
function drawWheel(b, x0, y0, w, h) {
  const cx = x0 + w / 2, cy = y0 + h / 2 - 34, R = 38;
  ctx.fillStyle = '#6c757d'; ctx.fillRect(x0 + 4, y0 + 4, w - 8, h - 8);
  ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 20, y0 + h - 6); ctx.lineTo(cx, cy); ctx.lineTo(cx + 20, y0 + h - 6); ctx.stroke();
  ctx.strokeStyle = shade(b.type === 'wheel' ? '#ff4d6d' : '#fff', 0); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
  const a0 = FX.time * 0.4;
  ctx.lineWidth = 1;
  for (let k = 0; k < 10; k++) {
    const a = a0 + k * 0.628;
    const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = ['#ffd166', '#06d6a0', '#4cc9f0', '#ef476f', '#9b5de5'][k % 5]; ctx.fillRect(px - 3, py, 6, 5);
  }
  statusIcons(b, x0, y0, w, h, 80);
}
function drawStadium(b, x0, y0, w, h, H) {
  const d = bdef(b);
  const cx = x0 + w / 2, cy = y0 + h / 2 - H * 0.6;
  ctx.fillStyle = shade(d.roof, -25); ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.6, w / 2, h / 2.3, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = skinColor(d.roof, 'roof'); ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2.3, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(cx, cy, w / 2.8, h / 3.4, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy - h / 3.4); ctx.lineTo(cx, cy + h / 3.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.283); ctx.stroke();
  statusIcons(b, x0, y0, w, h, H);
}
/* Metro (underground, dashed) and rail lines between stations */
function transitLines() {
  const lines = [];
  const m = MAP.lists.metros.filter(function (b) { return b.built; }).sort(function (a, b) { return a.id - b.id; });
  for (let i = 0; i + 1 < m.length; i++) lines.push({ type: 'metro', a: buildingCenter(m[i]), b: buildingCenter(m[i + 1]) });
  const t = MAP.lists.trains.filter(function (b) { return b.built; }).sort(function (a, b) { return a.id - b.id; });
  for (let i = 0; i + 1 < t.length; i++) lines.push({ type: 'rail', a: buildingCenter(t[i]), b: buildingCenter(t[i + 1]) });
  if (t.length === 1) { const c = buildingCenter(t[0]); lines.push({ type: 'rail', a: c, b: { x: c.x, y: -40 } }); }
  return lines;
}
function drawTransit() {
  const lines = transitLines();
  lines.forEach(function (L, k) {
    const dx = L.b.x - L.a.x, dy = L.b.y - L.a.y, len = Math.hypot(dx, dy) || 1;
    if (L.type === 'metro') {
      ctx.strokeStyle = 'rgba(229,56,59,.55)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(L.a.x, L.a.y); ctx.lineTo(L.b.x, L.b.y); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = '#6b4f3a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(L.a.x, L.a.y); ctx.lineTo(L.b.x, L.b.y); ctx.stroke();
      ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1.2;
      const nx = -dy / len * 2.5, ny = dx / len * 2.5;
      ctx.beginPath(); ctx.moveTo(L.a.x + nx, L.a.y + ny); ctx.lineTo(L.b.x + nx, L.b.y + ny); ctx.moveTo(L.a.x - nx, L.a.y - ny); ctx.lineTo(L.b.x - nx, L.b.y - ny); ctx.stroke();
    }
    const period = len / 40 + 2;
    const ph = ((FX.time + k * 3.1) % (period * 2)) / period;
    const f = ph < 1 ? ph : 2 - ph;
    const px = L.a.x + dx * f, py = L.a.y + dy * f, ang = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    if (L.type === 'metro') { ctx.fillStyle = 'rgba(229,56,59,.9)'; ctx.fillRect(-12, -3, 24, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-9, -1, 18, 2); }
    else { for (let c = 0; c < 3; c++) { ctx.fillStyle = c === 0 ? '#bc6c25' : '#dda15e'; ctx.fillRect(-30 + c * 20, -4, 18, 8); } }
    ctx.restore();
  });
}
function drawTrafficLights(v) {
  if (CAM.zoom < 0.55) return;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const i = idx(x, y); if (!MAP.inter[i]) continue;
    const px = x * TILE, py = y * TILE;
    const ns = lightState(i, 'NS'), ew = lightState(i, 'EW');
    const col = function (s) { return s === 'g' ? '#38f28a' : s === 'y' ? '#ffd166' : '#ff4d4d'; };
    ctx.fillStyle = '#222'; ctx.fillRect(px + 1, py + 1, 4, 4); ctx.fillRect(px + TILE - 5, py + TILE - 5, 4, 4);
    ctx.fillStyle = col(ns); ctx.fillRect(px + 2, py + 2, 2, 2);
    ctx.fillStyle = col(ew); ctx.fillRect(px + TILE - 4, py + TILE - 4, 2, 2);
  }
}

/* --- Night lights pass (additive glow) -------------------------------------------------- */
let LAMP = null;
function lampSprite() {
  if (LAMP) return LAMP;
  LAMP = document.createElement('canvas'); LAMP.width = LAMP.height = 64;
  const c = LAMP.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,215,140,.55)'); g.addColorStop(0.35, 'rgba(255,190,110,.22)'); g.addColorStop(1, 'rgba(255,170,90,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return LAMP;
}
function drawLights(v, vis) {
  const nf = nightFactor();
  if (nf <= 0.05) return;
  ctx.globalCompositeOperation = 'lighter';
  const glow = perf().glow && !PERF.noGlow;
  // Vehicle headlights
  if (glow || PERF.scale > 0.7) { ctx.fillStyle = 'rgba(255,240,180,' + (0.35 * nf) + ')'; AG.vehicles.forEach(function (vh) { if (vh.x < v.x0 || vh.x > v.x1 || vh.y < v.y0 || vh.y > v.y1) return; ctx.beginPath(); ctx.moveTo(vh.x + vh.hx * 6, vh.y + vh.hy * 6); ctx.lineTo(vh.x + vh.hx * 22 - vh.hy * 7, vh.y + vh.hy * 22 + vh.hx * 7); ctx.lineTo(vh.x + vh.hx * 22 + vh.hy * 7, vh.y + vh.hy * 22 - vh.hx * 7); ctx.fill(); }); }
  // Street lamps
  const spr = lampSprite(); const R = glow ? 18 : 12;
  ctx.globalAlpha = nf;
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    if (!MAP.roads[idx(x, y)] || (x + y) % 2) continue;
    ctx.drawImage(spr, x * TILE + 4 - R, y * TILE + 4 - R, R * 2, R * 2);
  }
  ctx.globalAlpha = 1;
  // Windows & neon
  vis.forEach(function (b) {
    const d = bdef(b);
    if (!b.built || !b._powered || d.id === 'tree' || d.id === 'park' || d.id === 'plaza') return;
    const T = TILE, m = 3, x0 = b.x * T + m, y0 = b.y * T + m, w = d.w * T - 2 * m, h = d.h * T - 2 * m;
    const H = buildingHeight(b), fy = y0 + h - H;
    if (H >= 14 && d.sector !== 'ENERGY' && perf().windows) {
      const cols = Math.max(1, Math.floor(w / 7)), rows = Math.max(1, Math.floor((H - 6) / 8)), cw = w / cols;
      const rnd = mulberry32(b.id * 31);
      ctx.fillStyle = 'rgba(255,214,120,' + (0.75 * nf) + ')';
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (rnd() < 0.6) ctx.fillRect(x0 + k * cw + 2, fy + 4 + r * 8, cw - 4, 4);
    }
    if ((d.cat === 'Commercial' || d.sector === 'FUEL') && H >= 10) {   // neon signs
      const col = ['#ff2bd6', '#4cc9f0', '#ffd166', '#06d6a0'][b.id % 4];
      ctx.fillStyle = col; ctx.globalAlpha = 0.85 * nf * (0.75 + 0.25 * Math.sin(FX.time * 3 + b.id)); ctx.fillRect(x0 + w * 0.2, fy + 2, w * 0.6, 3); ctx.globalAlpha = 1;
    }
    if (d.neon || S.settings.skin === 'neon' || BUILDING_SKINS[b.skin | 0].neon) {
      const col = d.neon ? shade(d.color, 40) : shade(d.color, 50);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.8 * nf; ctx.lineWidth = glow ? 3 : 1.5;
      ctx.strokeRect(x0, fy - h, w, h + H);
      if (glow) { ctx.globalAlpha = 0.25 * nf; ctx.lineWidth = 8; ctx.strokeRect(x0, fy - h, w, h + H); }
      ctx.globalAlpha = 1;
    }
  });
  // Headlights
  AG.vehicles.forEach(function (vh) {
    if (vh.x < v.x0 || vh.x > v.x1 || vh.y < v.y0 || vh.y > v.y1) return;
    ctx.fillStyle = 'rgba(255,240,180,' + (0.35 * nf) + ')';
    ctx.beginPath(); ctx.arc(vh.x + vh.hx * (vh.len / 2 + 6), vh.y + vh.hy * (vh.len / 2 + 6), 6, 0, 6.283); ctx.fill();
    if (vh.siren) { ctx.fillStyle = (Math.floor(FX.time * 8) % 2 ? 'rgba(255,23,68,' : 'rgba(41,121,255,') + (0.6 * nf) + ')'; ctx.beginPath(); ctx.arc(vh.x, vh.y, 12, 0, 6.283); ctx.fill(); }
  });
  ctx.globalCompositeOperation = 'source-over';
}

/* --- Main render --------------------------------------------------------------------- */
function render() {
  const season = currentSeason();
  updateSun();
  const L = S.settings.layers;
  weUpdateTiers();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const nf = nightFactor();
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, nf > 0.5 ? '#070a1c' : '#1b2350'); bg.addColorStop(1, nf > 0.5 ? '#0c1030' : '#2a3570');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
  drawSkyline(nf);
  const sx = FX.shake > 0 ? rand(-FX.shake, FX.shake) : 0, sy = FX.shake > 0 ? rand(-FX.shake, FX.shake) : 0;
  const z = CAM.zoom;
  applyWorldTransform(sx, sy);
  // Visible world rect (enlarged when the photo camera is rotated)
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
  const v = { x0: tl.x - 40, y0: tl.y - 40, x1: br.x + 40, y1: br.y + 320 };
  if (PHOTO.on && PHOTO.rot) { const ex = Math.max(CW, CH) / z * 0.5; v.x0 -= ex; v.y0 -= ex; v.x1 += ex; v.y1 += ex; }
  v.tx0 = clamp(Math.floor(v.x0 / TILE), 0, MAP.W - 1); v.ty0 = clamp(Math.floor(v.y0 / TILE), 0, MAP.H - 1);
  v.tx1 = clamp(Math.floor(v.x1 / TILE), 0, MAP.W - 1); v.ty1 = clamp(Math.floor(v.y1 / TILE), 0, MAP.H - 1);
  // Map shadow + ground
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(10, 14, MAP.W * TILE, MAP.H * TILE);
  drawNeighbors();
  ctx.imageSmoothingEnabled = true;
  weDrawGround(v);                 // Part 9 chunk streaming: only the chunks around the camera are loaded
  weDrawLockedBorder();
  // Water shimmer
  if (perf().shadow && PERF.scale >= 0.6) {
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
      if (MAP.nature[idx(x, y)] !== 2) continue;
      const o = Math.sin(FX.time * 1.5 + x * 0.7 + y * 1.3);
      if (o > 0.6) ctx.fillRect(x * TILE + 6 + o * 6, y * TILE + 12, 10, 1.5);
    }
  }
  if (SIM.flood) {
    ctx.fillStyle = 'rgba(47,127,191,.45)';
    S.buildings.list.forEach(function (b) { if (b._nearWater) { const d = bdef(b); ctx.fillRect(b.x * TILE - 6, b.y * TILE - 6, d.w * TILE + 12, d.h * TILE + 12); } });
  }
  drawOverlay(v);
  drawDeco(v);
  if (L.resources && CAM.zoom > 0.4) drawResources(v);
  if (L.power || L.water) drawUtilityNetworks(v, L);
  if (L.rail) { if (!drawTransitNetwork()) drawTransit(); }
  if (L.road) { drawTrafficLights(v); if (S.p9) drawJunctions(v); }
  if (UI.tool === 'build' || UI.tool === 'zone' || UI.tool === 'road') drawGrid(v);
  drawShips();
  // Depth-sorted drawables
  const items = [];
  const vis = weBuildingsInView(v, []);           // spatial partitioning: only chunks around the view are scanned
  for (let i = 0; i < vis.length; i++) { const b = vis[i]; items.push({ y: (b.y + bdef(b).h) * TILE, k: 0, o: b }); }
  if (L.terrain) for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) if (MAP.nature[idx(x, y)] === 1) items.push({ y: y * TILE + TILE - 4, k: 1, x: x, yy: y });
  // Level of detail: citizens only when zoomed in, vehicles hidden in the far "city view"
  const showNPC = CAM.zoom >= 0.55, showVeh = CAM.zoom >= 0.4;
  if (showNPC) for (let i = 0; i < AG.citizens.length; i++) { const c = AG.citizens[i]; if (c.inside || c.driving || c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue; items.push({ y: c.y, k: 2, o: c }); }
  if (showVeh) for (let i = 0; i < AG.vehicles.length; i++) { const vh = AG.vehicles[i]; if (vh.x < v.x0 || vh.x > v.x1 || vh.y < v.y0 || vh.y > v.y1) continue; items.push({ y: vh.y + 4, k: 3, o: vh }); }
  items.sort(function (a, b) { return a.y - b.y; });
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 0) { if (L.buildings) drawBuilding(it.o); else drawFootprint(it.o); }
    else if (it.k === 1) { if (CAM.zoom < 0.42) { ctx.fillStyle = season.id === 'winter' ? '#dfe7ec' : '#2d6a4f'; ctx.fillRect(it.x * TILE + 10, it.yy * TILE + 8, 12, 12); } else drawTree(it.x * TILE + TILE / 2 + ((it.x * 7 + it.yy * 3) % 7) - 3, it.yy * TILE + TILE - 5, 1, season, it.x * 13 + it.yy); }
    else if (it.k === 2) drawCitizen(it.o);
    else drawVehicle(it.o);
  }
  // Selection & placement
  drawSelection();
  // Space launch
  if (FX.rocket) {
    const r = FX.rocket; r.t += 1 / 60;
    const ry = r.y - r.t * r.t * 60;
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(r.x - 4, ry - 30, 8, 30);
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(r.x - 4, ry - 30); ctx.lineTo(r.x, ry - 40); ctx.lineTo(r.x + 4, ry - 30); ctx.fill();
    spawnParticles(r.x, ry + 2, 'fire', 2); spawnParticles(r.x, ry + 6, 'smoke', 1);
    if (r.t > 6) FX.rocket = null;
  }
  // Airplanes
  AG.planes.forEach(function (p) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x + p.alt * 0.6, p.y + p.alt * 0.3, 12, 4, 0, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y - p.alt); ctx.scale(p.vx < 0 ? -1 : 1, 1);
    const s = 1 + p.alt / 120;
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(-14 * s, -3 * s, 28 * s, 6 * s);
    ctx.fillStyle = '#4361ee'; ctx.fillRect(-4 * s, -12 * s, 6 * s, 24 * s); ctx.fillRect(-14 * s, -8 * s, 4 * s, 8 * s);
    ctx.restore();
  });
  // Particles
  const ps = FX.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], a = p.life / p.max;
    if (p.type === 'smoke') { ctx.fillStyle = p.color + (0.45 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill(); continue; }
    ctx.globalAlpha = Math.min(1, a * 1.5);
    if (p.type === 'coin') { ctx.fillStyle = '#e9b340'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(p.x - 0.5, p.y - 0.5, 3, 0, 6.283); ctx.fill(); }
    else if (p.type === 'note') { ctx.fillStyle = p.color; ctx.font = 'bold 11px sans-serif'; ctx.fillText('♪', p.x, p.y); }
    else if (p.type === 'confetti') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  }
  ctx.globalAlpha = 1;
  // Floating texts
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  FX.texts.forEach(function (t) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.font = 'bold ' + Math.round(11 / Math.max(0.6, CAM.zoom) + 3) + 'px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  });
  ctx.globalAlpha = 1;
  // Night overlay + additive lights
  if (nf > 0.02) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgba(8,12,40,' + (0.55 * nf) + ')'; ctx.fillRect(0, 0, CW, CH);
    applyWorldTransform(sx, sy);
    FX.lightPass = true; drawLights(v, vis); FX.lightPass = false;
  }
  if (SUN.tint > 0.005 && !FX.cleanShot) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = SUN.warm ? 'rgba(255,150,60,' + SUN.tint + ')' : 'rgba(255,190,120,' + SUN.tint + ')'; ctx.fillRect(0, 0, CW, CH); }
  // Part 5 world overlays: accident scenes, problem highlights, citizen speech bubbles
  applyWorldTransform(sx, sy);
  drawDistrictLabels();
  drawWorldDebug();
  drawAccidents();
  drawIncidents();
  if (typeof drawP9Overlays === 'function') drawP9Overlays();
  if (typeof drawP10Overlays === 'function') drawP10Overlays();
  drawHighlights();
  drawBubbles(v);
  // Screen-space weather & flash
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (FX.weather === 'cloudy') { ctx.fillStyle = 'rgba(70,80,100,.2)'; ctx.fillRect(0, 0, CW, CH); }
  else if (FX.weather === 'fog') { ctx.fillStyle = 'rgba(215,222,232,.38)'; ctx.fillRect(0, 0, CW, CH); }
  else if (FX.weather !== 'clear' && FX.weather !== 'heatwave') {
    if (FX.weather === 'coldwave') { ctx.fillStyle = 'rgba(160,200,255,.16)'; ctx.fillRect(0, 0, CW, CH); }
    if (FX.weather === 'snow' || FX.weather === 'coldwave') { ctx.fillStyle = 'rgba(255,255,255,.9)'; FX.drops.forEach(function (d) { ctx.fillRect(d.x, d.y, 2.5 * d.s, 2.5 * d.s); }); }
    else {
      ctx.strokeStyle = 'rgba(180,200,255,.45)'; ctx.lineWidth = 1; ctx.beginPath();
      const k = FX.weather === 'storm' ? 0.35 : FX.weather === 'heavyrain' ? 0.25 : 0.15;
      FX.drops.forEach(function (d) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 12 * k * d.s * 2, d.y + 14 * d.s); });
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,60,' + (FX.weather === 'storm' ? 0.25 : FX.weather === 'heavyrain' ? 0.2 : 0.1) + ')'; ctx.fillRect(0, 0, CW, CH);
    }
  }
  if (FX.weather === 'heatwave') { ctx.fillStyle = 'rgba(255,140,40,.10)'; ctx.fillRect(0, 0, CW, CH); }
  if (FX.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (FX.flash * 0.6) + ')'; ctx.fillRect(0, 0, CW, CH); }
  if (PHOTO.on && PHOTO.bars) { const bh = Math.round(CH * 0.1); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, bh); ctx.fillRect(0, CH - bh, CW, bh); }
  if (UI.gamepadCursor && !PHOTO.on) { ctx.strokeStyle = 'rgba(255,209,102,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 10, 0, 6.283); ctx.moveTo(CW / 2 - 16, CH / 2); ctx.lineTo(CW / 2 + 16, CH / 2); ctx.moveTo(CW / 2, CH / 2 - 16); ctx.lineTo(CW / 2, CH / 2 + 16); ctx.stroke(); }
}
function drawAccidents() {
  if (!AG.accidents || !AG.accidents.length) return;
  AG.accidents.forEach(function (a) {
    ctx.save(); ctx.translate(a.x, a.y);
    ctx.rotate(0.5); ctx.fillStyle = a.cols[0]; ctx.fillRect(-9, -8, 13, 7); ctx.rotate(-1.1); ctx.fillStyle = a.cols[1]; ctx.fillRect(-2, 1, 13, 7);
    ctx.restore();
    const on = Math.floor(FX.time * 3) % 2;
    ctx.fillStyle = on ? '#ffd166' : '#f77f00'; ctx.beginPath(); ctx.moveTo(a.x, a.y - 24); ctx.lineTo(a.x + 7, a.y - 12); ctx.lineTo(a.x - 7, a.y - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', a.x, a.y - 15.5);
    ctx.fillStyle = '#ff7b00'; [[-12, 8], [12, -8]].forEach(function (o) { ctx.beginPath(); ctx.moveTo(a.x + o[0], a.y + o[1] - 5); ctx.lineTo(a.x + o[0] + 3, a.y + o[1] + 2); ctx.lineTo(a.x + o[0] - 3, a.y + o[1] + 2); ctx.fill(); });
    if (Math.random() < 0.08 * PERF.scale) spawnParticles(a.x, a.y - 4, 'smoke', 1);
  });
}
function drawHighlights() {
  const h = FX.hl; if (!h) return;
  if (FX.time > h.until) { FX.hl = null; return; }
  const a = 0.45 + 0.35 * Math.sin(FX.time * 6);
  ctx.strokeStyle = h.color; ctx.lineWidth = 3 / CAM.zoom; ctx.globalAlpha = a;
  ctx.fillStyle = h.color;
  h.rects.forEach(function (r) { ctx.globalAlpha = a * 0.25; ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE); ctx.globalAlpha = a; ctx.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.w * TILE - 2, r.h * TILE - 2); });
  ctx.globalAlpha = 1;
}
function drawBubbles(v) {
  if (CAM.zoom < 0.55) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = Math.max(8, 10 / Math.max(0.7, CAM.zoom));
  ctx.font = 'bold ' + fs + 'px sans-serif';
  AG.citizens.forEach(function (c) {
    const b = c.bubble; if (!b || b.until < FX.time || c.inside || c.driving) return;
    if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) return;
    const w = ctx.measureText(b.text).width + 10, hh = fs + 8, x = c.x, y = c.y - 20 - hh / 2;
    const fade = Math.min(1, (b.until - FX.time) * 2);
    ctx.globalAlpha = fade;
    ctx.fillStyle = b.bad ? 'rgba(255,235,238,.95)' : 'rgba(255,255,255,.95)';
    ctx.strokeStyle = b.bad ? '#ef476f' : '#06d6a0'; ctx.lineWidth = 1.2 / CAM.zoom;
    ctx.beginPath(); ctx.rect(x - w / 2, y - hh / 2, w, hh); ctx.moveTo(x - 3, y + hh / 2); ctx.lineTo(x, y + hh / 2 + 5); ctx.lineTo(x + 3, y + hh / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1f40'; ctx.fillText(b.text, x, y + 0.5);
  });
  ctx.globalAlpha = 1;
}
function drawSelection() {
  const b = UI.selected;
  if (b && MAP.byId.has(b.id)) {
    const d = bdef(b);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2 / CAM.zoom; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -FX.time * 20;
    ctx.strokeRect(b.x * TILE + 1, b.y * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
    ctx.setLineDash([]);
    if (d.cover) { const c = buildingCenter(b); ctx.strokeStyle = 'rgba(6,214,160,.7)'; ctx.fillStyle = 'rgba(6,214,160,.08)'; ctx.beginPath(); ctx.arc(c.x, c.y, coverRadius(b) * TILE, 0, 6.283); ctx.fill(); ctx.stroke(); }
  }
  const hv = UI.hover;
  if (UI.tool === 'build' && UI.placing && hv) {
    const d = fpDef(UI.placing, UI.rot | 0);
    const px = UI.ghost ? UI.ghost.x : hv.x - Math.floor((d.w - 1) / 2), py = UI.ghost ? UI.ghost.y : hv.y - Math.floor((d.h - 1) / 2);
    const chk = canPlace(d, px, py);
    ctx.fillStyle = chk.ok ? (chk.warn ? 'rgba(255,170,0,.35)' : 'rgba(6,214,160,.35)') : 'rgba(239,71,111,.4)';
    ctx.fillRect(px * TILE, py * TILE, d.w * TILE, d.h * TILE);
    ctx.strokeStyle = chk.ok ? '#06d6a0' : '#ef476f'; ctx.lineWidth = 2 / CAM.zoom; ctx.strokeRect(px * TILE, py * TILE, d.w * TILE, d.h * TILE);
    ctx.globalAlpha = 0.9; drawEmoji(d.icon, (px + d.w / 2) * TILE, (py + d.h / 2) * TILE, Math.min(d.w, d.h) * 18); ctx.globalAlpha = 1;
    if (d.cover) { ctx.strokeStyle = 'rgba(6,214,160,.7)'; ctx.beginPath(); ctx.arc((px + d.w / 2) * TILE, (py + d.h / 2) * TILE, d.cover * (hasTech('d_emergency') ? 1.3 : 1) * TILE, 0, 6.283); ctx.stroke(); }
    // Entrance arrow (rotation) and the smart placement message
    const r = (UI.rot | 0) & 3, cx = (px + d.w / 2) * TILE, cy = (py + d.h / 2) * TILE;
    const ax = r === 1 ? (px + d.w) * TILE + 6 : r === 3 ? px * TILE - 6 : cx, ay = r === 0 ? (py + d.h) * TILE + 6 : r === 2 ? py * TILE - 6 : cy;
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ax, ay, 4, 0, 6.283); ctx.fill();
    const label = chk.ok ? '✔ ' + d.w + '×' + d.h + (chk.land ? ' · Land ×' + chk.land.toFixed(2) : '') + (chk.warn ? ' · ' + chk.warn : '') : '❌ ' + chk.reason;
    ctx.font = 'bold ' + Math.round(11 / Math.max(0.6, CAM.zoom)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 12, th = 16 / Math.max(0.6, CAM.zoom), ly = py * TILE - 14 / Math.max(0.6, CAM.zoom) - (d.height || 20);
    ctx.fillStyle = chk.ok ? 'rgba(6,40,30,.88)' : 'rgba(60,10,20,.9)'; ctx.fillRect(cx - tw / 2, ly - th / 2, tw, th);
    ctx.fillStyle = chk.ok ? (chk.warn ? '#ffd166' : '#8cffc1') : '#ff8fa3'; ctx.fillText(label, cx, ly);
  }
  if (UI.tool === 'zone' && (UI.zoneDrag || hv)) {
    const zd = UI.zoneDrag || { x0: hv.x, y0: hv.y, x1: hv.x, y1: hv.y };
    const z = ZONES[UI.zoneType || 0];
    ctx.fillStyle = UI.zoneType ? z.color : 'rgba(255,255,255,.6)'; ctx.globalAlpha = 0.35;
    ctx.fillRect(Math.min(zd.x0, zd.x1) * TILE, Math.min(zd.y0, zd.y1) * TILE, (Math.abs(zd.x1 - zd.x0) + 1) * TILE, (Math.abs(zd.y1 - zd.y0) + 1) * TILE);
    ctx.globalAlpha = 1; ctx.strokeStyle = UI.zoneType ? z.color : '#fff'; ctx.lineWidth = 2 / CAM.zoom;
    ctx.strokeRect(Math.min(zd.x0, zd.x1) * TILE, Math.min(zd.y0, zd.y1) * TILE, (Math.abs(zd.x1 - zd.x0) + 1) * TILE, (Math.abs(zd.y1 - zd.y0) + 1) * TILE);
  }
  if (UI.tool === 'road' && hv) {
    const tiles = UI.roadDrag ? lineTiles(UI.roadDrag.x0, UI.roadDrag.y0, UI.roadDrag.x1, UI.roadDrag.y1) : [[hv.x, hv.y]];
    tiles.forEach(function (t) { ctx.fillStyle = canRoad(t[0], t[1]) ? (MAP.nature[idx(t[0], t[1])] === 2 ? 'rgba(155,93,229,.55)' : 'rgba(76,201,240,.45)') : (isRoad(t[0], t[1]) ? 'rgba(255,255,255,.12)' : 'rgba(239,71,111,.4)'); ctx.fillRect(t[0] * TILE, t[1] * TILE, TILE, TILE); });
  }
  if (UI.tool === 'bulldoze' && hv) {
    const bb = buildingAtTile(hv.x, hv.y);
    if (bb) { const d = bdef(bb); ctx.fillStyle = 'rgba(239,71,111,.4)'; ctx.fillRect(bb.x * TILE, bb.y * TILE, d.w * TILE, d.h * TILE); }
    else { ctx.fillStyle = 'rgba(239,71,111,.35)'; ctx.fillRect(hv.x * TILE, hv.y * TILE, TILE, TILE); }
  }
}

/* --- Part 4 render helpers ------------------------------------------------------ */
function drawFootprint(b) {   // BUILDINGS layer hidden
  const d = bdef(b);
  ctx.fillStyle = b.owner === 'player' ? 'rgba(255,209,102,.55)' : b.owner === 'city' ? 'rgba(76,201,240,.5)' : 'rgba(239,71,111,.45)';
  ctx.fillRect(b.x * TILE + 2, b.y * TILE + 2, d.w * TILE - 4, d.h * TILE - 4);
  drawEmoji(d.icon, (b.x + d.w / 2) * TILE, (b.y + d.h / 2) * TILE, Math.min(d.w, d.h) * 14);
}
function drawResources(v) {
  S.economy.deposits.forEach(function (dep) {
    const x = dep.cx * TILE + 16, y = dep.cy * TILE + 16;
    if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) return;
    const R = RESOURCE_TYPES[dep.type], f = dep.amount / dep.max;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.283); ctx.fill();
    drawEmoji(R.icon, x, y, 12);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 12, y + 12, 24, 4);
    ctx.fillStyle = f > 0.3 ? '#06d6a0' : '#ef476f'; ctx.fillRect(x - 12, y + 12, 24 * f, 4);
  });
}
function drawUtilityNetworks(v, L) {
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    if (!MAP.roads[idx(x, y)]) continue;
    const px = x * TILE, py = y * TILE;
    if (L.power) { ctx.fillStyle = SIM.powerRatio >= 1 ? 'rgba(255,209,102,.8)' : 'rgba(239,71,111,.85)'; ctx.fillRect(px + 3, py + 3, TILE - 6, 1.5); if ((x + y) % 3 === 0) { ctx.fillStyle = '#6b4f3a'; ctx.fillRect(px + 2, py + 1, 3, 5); } }
    if (L.water) { ctx.fillStyle = SIM.waterRatio >= 1 ? 'rgba(72,202,228,.8)' : 'rgba(239,71,111,.85)'; ctx.fillRect(px + 3, py + TILE - 5, TILE - 6, 2); }
  }
  S.buildings.list.forEach(function (b) {
    const d = bdef(b); if (!b.built) return;
    if (L.power && d.power > 0) { const c = buildingCenter(b); ctx.strokeStyle = 'rgba(255,209,102,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, 14 + Math.sin(FX.time * 4) * 3, 0, 6.283); ctx.stroke(); }
    if (L.water && d.water > 0) { const c = buildingCenter(b); ctx.strokeStyle = 'rgba(72,202,228,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, 14 + Math.sin(FX.time * 4) * 3, 0, 6.283); ctx.stroke(); }
  });
}
function drawGrid(v) {
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1 / CAM.zoom;
  ctx.beginPath();
  for (let x = v.tx0; x <= v.tx1 + 1; x++) { ctx.moveTo(x * TILE, v.ty0 * TILE); ctx.lineTo(x * TILE, (v.ty1 + 1) * TILE); }
  for (let y = v.ty0; y <= v.ty1 + 1; y++) { ctx.moveTo(v.tx0 * TILE, y * TILE); ctx.lineTo((v.tx1 + 1) * TILE, y * TILE); }
  ctx.stroke();
}
function drawShips() {
  (AG.ships || []).forEach(function (sh) {
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang || 0);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-20, -1, 6, 2);
    ctx.fillStyle = '#343a40'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(12, -6); ctx.lineTo(18, 0); ctx.lineTo(12, 6); ctx.lineTo(-14, 6); ctx.closePath(); ctx.fill();
    for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f'][(k + sh.path.length) % 4]; ctx.fillRect(-11 + k * 5, -4, 4, 8); }
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(8, -3, 4, 6);
    ctx.restore();
  });
}
