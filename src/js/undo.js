'use strict';
/* BLOCK CITY TYCOON — UNDO (Part 14, all platforms)
   The player's last construction actions can be undone: building placement, road placement, zoning, demolition and
   road removal. Every record stores exactly what changed (tiles, the building object, money / budget deltas), so an
   undo restores the previous state precisely. Only actions the player started are recorded (not AI developers, world
   generation or admin tools). Windows: Ctrl+Z · Android: the UNDO button on the "Building demolished [UNDO]" toast. */

const UNDO = { stack: [], max: 20, ttlMs: 120000, depth: 0, lastInput: 0, bar: null, barTimer: 0 };
['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { UNDO.lastInput = performance.now(); }, true); });
function undoRecording() {
  return typeof STARTED !== 'undefined' && STARTED && UNDO.depth === 0 && !(typeof WG !== 'undefined' && WG.busy) && performance.now() - UNDO.lastInput < 2500;
}
function undoFunds() { return { m: S.money, b: S.budget }; }
function undoPush(rec, label) {
  rec.t = performance.now(); rec.label = label;
  UNDO.stack.push(rec); if (UNDO.stack.length > UNDO.max) UNDO.stack.shift();
  showUndoBar(label);
}
function tileState(tiles) { return tiles.map(function (t) { const i = idx(t[0], t[1]); return [i, MAP.roads[i], MAP.nature[i], MAP.zone[i], MAP.blocked[i]]; }); }
function wrapUndo(name, makeRec) {
  const f0 = window[name]; if (typeof f0 !== 'function') return;
  window[name] = function () {
    if (makeRec.skip && makeRec.skip.apply(null, arguments)) return f0.apply(this, arguments);     // recorded by the inner call instead
    if (!undoRecording()) { UNDO.depth++; try { return f0.apply(this, arguments); } finally { UNDO.depth--; } }
    const pre = makeRec.before ? makeRec.before.apply(null, arguments) : {}, f = undoFunds();
    UNDO.depth++;
    let r; try { r = f0.apply(this, arguments); } finally { UNDO.depth--; }
    try { const rec = makeRec.after(pre, r, arguments); if (rec) { rec.dm = S.money - f.m; rec.db = S.budget - f.b; undoPush(rec, rec.label); } } catch (e) { Log.warn('Undo record ' + name + ': ' + e.message); }
    return r;
  };
}
wrapUndo('placeBuilding', { after: function (pre, b) { return b ? { kind: 'build', b: b, label: '🏗️ ' + bdef(b).name + ' placed' } : null; } });
wrapUndo('demolish', {
  before: function (b) { return { b: b, had: MAP.byId.has(b.id) }; },
  after: function (pre) { return pre.had && !MAP.byId.has(pre.b.id) && !isAI(pre.b) ? { kind: 'demolish', b: pre.b, label: '🗑️ ' + BUILDINGS[pre.b.type].name + ' demolished' } : null; }
});
wrapUndo('placeRoads', {
  before: function (tiles) { return { tiles: tileState(tiles) }; },
  after: function (pre, n) { return n ? { kind: 'tiles', tiles: pre.tiles, label: '🛣️ ' + n + ' road tile' + (n > 1 ? 's' : '') + ' built' } : null; }
});
wrapUndo('paintZone', {
  before: function (tiles) { return { tiles: tileState(tiles) }; },
  after: function (pre, n) { return n ? { kind: 'tiles', tiles: pre.tiles, label: '🟩 ' + n + ' tiles zoned' } : null; }
});
wrapUndo('bulldozeTile', {
  skip: function (x, y) { return inMap(x, y) && !!buildingAtTile(x, y); },
  before: function (x, y) { return inMap(x, y) && !buildingAtTile(x, y) && MAP.roads[idx(x, y)] ? { tiles: tileState([[x, y]]) } : null; },
  after: function (pre) { return pre && !MAP.roads[pre.tiles[0][0]] ? { kind: 'tiles', tiles: pre.tiles, label: '🚜 Road removed' } : null; }
});
function canUndo() { const r = UNDO.stack[UNDO.stack.length - 1]; return !!r && performance.now() - r.t < UNDO.ttlMs; }
/* Undo the newest action → {ok, msg} */
function undoLast() {
  const r = UNDO.stack[UNDO.stack.length - 1];
  if (!r || performance.now() - r.t > UNDO.ttlMs) { UNDO.stack.length = 0; return { ok: false, msg: 'Nothing to undo' }; }
  UNDO.depth++;
  try {
    if (r.kind === 'build') {
      if (!MAP.byId.has(r.b.id)) { UNDO.stack.pop(); return { ok: false, msg: 'The building is already gone' }; }
      removeBuilding(r.b);
    } else if (r.kind === 'demolish') {
      const d = bdef(r.b);
      for (let y = r.b.y; y < r.b.y + d.h; y++) for (let x = r.b.x; x < r.b.x + d.w; x++) { const i = idx(x, y); if (MAP.occ[i] || MAP.roads[i]) return { ok: false, msg: 'Cannot undo — the space is used now' }; }
      addBuildingToMap(r.b);
    } else if (r.kind === 'tiles') {
      r.tiles.forEach(function (s) { MAP.roads[s[0]] = s[1]; MAP.nature[s[0]] = s[2]; MAP.zone[s[0]] = s[3]; MAP.blocked[s[0]] = s[4]; });
      MAP.pathCache.clear();
    }
    S.money -= r.dm || 0; S.budget -= r.db || 0;              // exact money / budget back
    onMapChanged();
    UNDO.stack.pop();
    if (typeof sfx === 'function') sfx('click');
    Log.info('UNDO: ' + r.label);
    return { ok: true, msg: '↶ Undone: ' + r.label };
  } finally { UNDO.depth--; }
}
function runUndo() { const r = undoLast(); toast(r.ok ? r.msg : '↶ ' + r.msg, r.ok ? 'good' : 'bad'); hideUndoBar(); if (r.ok && typeof haptic === 'function') haptic('success'); return r; }
/* "Building demolished [UNDO]" — a few seconds, then it hides (Ctrl+Z / Action.Undo keeps working) */
function showUndoBar(label) {
  if (typeof document === 'undefined') return;
  let el = UNDO.bar;
  if (!el) { el = UNDO.bar = document.createElement('div'); el.id = 'undoBar'; el.className = 'hidden'; document.body.appendChild(el); el.addEventListener('click', function (e) { if (e.target.closest('[data-undo]')) runUndo(); else if (e.target.closest('[data-undox]')) hideUndoBar(); }); }
  el.innerHTML = '<span>' + esc(label) + '</span><button class="btn small gold" data-undo="1">↶ UNDO</button><button class="closeX" data-undox="1" aria-label="Close">✕</button>';
  el.classList.remove('hidden');
  clearTimeout(UNDO.barTimer); UNDO.barTimer = setTimeout(hideUndoBar, 6000);
}
function hideUndoBar() { if (UNDO.bar) UNDO.bar.classList.add('hidden'); }
window.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && STARTED && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); Actions.run(Action.Undo, 'keyboard'); }
});
Actions.register(Action.Undo, function () { runUndo(); });
