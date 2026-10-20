'use strict';
/* BLOCK CITY TYCOON — ADMIN WORLD BUILDER 2.0 · ADMIN UI (Part 19)
   Two admin tabs (OWNER / ADMIN; every button passes AdminAuth.guard):
   · 🧬 WORLD BUILDER 2.0 — CREATE OPTIMIZED WORLD (20 presets × 8 quality profiles, custom sliders with safe limits, size,
     seed, name, slot), the current world's WORLD QUALITY bar and 10 categories, the WORLD HEALTH REPORT, the recorded
     pipeline, World Validator / Auto Fix / Balance / generation test suite on the open city.
   · 🧰 ADMIN TOOLS — the 175 tools by category, search, favourites, target + value, output, Ctrl+Z / Ctrl+Y undo / redo.
   The tools are also found by the admin search and by the Ctrl+K palette (signed-in admins only). */
const WBUI = { preset: 'balanced', size: 'AUTO', seed: '', name: '', slot: 0, custom: { pollution: 25, density: 50, population: 50, industry: 40, water: 50, mountains: 40, traffic: 50, economy: 50, transport: 50, green: 55 } };

function wbuiView() {
  const W = S.worldbuilder, P = WB_PROFILES[WBLD.profile];
  const presets = WB_PRESETS.map(function (p) { return '<button class="btn small ' + (WBUI.preset === p[1] ? 'gold' : '') + '" data-wbp="' + p[1] + '">' + esc(p[0]) + '</button>'; }).join('');
  const profs = Object.keys(WB_PROFILES).map(function (k) { return '<button class="btn small ' + (WBLD.profile === k ? 'gold' : '') + '" data-wbprof="' + k + '">' + WB_PROFILES[k].name + '</button>'; }).join('');
  const sizes = ['AUTO'].concat(Object.keys(WORLD_SIZES)).map(function (k) { return '<button class="btn small ' + (WBUI.size === k ? 'gold' : '') + '" data-wbsize="' + k + '">' + k + '</button>'; }).join('');
  const custom = WBLD.profile === 'custom' ? '<div class="wbCustom">' + WB_CUSTOM_KEYS.map(function (k) { return '<label class="small">' + k[1] + ' <b id="wbcv_' + k[0] + '">' + WBUI.custom[k[0]] + '</b><input type="range" min="0" max="100" value="' + WBUI.custom[k[0]] + '" data-wbc="' + k[0] + '"></label>'; }).join('') + '<p class="small">The validator still keeps pollution, air, water, noise, waste and industry inside safe limits (pollution ≤ 45, air ≥ 50 %, water ≥ 65 %).</p></div>' : '';
  return aCard('🧬 CREATE OPTIMIZED WORLD', '<p class="small">Generate → Validate → Auto Fix → Balance → Transportation → Services → Economy → Pollution Control → Traffic Optimization → Performance Optimization → Final Validation. PLAY stays disabled until the result is WORLD READY; a world that still fails after 5 repair passes is never opened.</p>' +
      '<div class="small"><b>Preset</b></div><div class="row admRowWrap">' + presets + '</div><div class="small" style="margin-top:6px"><b>Quality profile</b> — pollution ≤ ' + Math.round(P.pol) + ' · air ≥ ' + P.air + '% · water ≥ ' + P.water + '% · noise ≤ ' + P.noise + '</div><div class="row admRowWrap">' + profs + '</div>' + custom +
      '<div class="small" style="margin-top:6px"><b>Size</b></div><div class="row admRowWrap">' + sizes + '</div>' +
      '<div class="row admRowWrap"><input class="admInput" id="wbName" placeholder="City name" value="' + esc(WBUI.name) + '" maxlength="32"><input class="admInput" id="wbSeed" placeholder="Seed (empty = random)" value="' + esc(WBUI.seed) + '"><input class="admInput" id="wbSlot" type="number" min="0" max="12" placeholder="Slot (0 = current)" value="' + (WBUI.slot || '') + '"></div>' +
      '<button class="btn gold" data-wbgo="1" style="width:100%;margin-top:8px"' + (WBLD.running || WG.busy ? ' disabled' : '') + '>🌍 CREATE OPTIMIZED WORLD</button>') +
    aCard('📊 CURRENT WORLD', wbReportHtml(W) + '<div class="row admRowWrap" style="margin-top:8px"><button class="btn small" data-wba="analyze">🔍 World Validator</button><button class="btn small gold" data-wba="fix">🛠 Auto Fix (≤ 5 passes)</button><button class="btn small" data-wba="balance">🌿 Balance World</button><button class="btn small" data-wba="suite">🧪 Generation test suite</button><button class="btn small" data-wba="transport">🚇 Generate Transportation</button></div>' + (WBUI.out ? '<pre class="small atOut">' + esc(WBUI.out) + '</pre>' : ''));
}
function atuiView() {
  const favs = atFavs(), t = STARTED ? atTarget() : null, q = AT.q;
  const btn = function (tool) { return '<span class="atBtn"><button class="btn small ' + (tool.kind === 'view' ? '' : tool.kind === 'gen' || tool.kind === 'del' ? 'red' : 'blue') + '" data-atrun="' + tool.id + '" title="' + esc(tool.kw) + '">' + esc(tool.name) + '</button><button class="atStar ' + (favs.indexOf(tool.id) >= 0 ? 'on' : '') + '" data-atfav="' + tool.id + '" aria-label="Favourite">★</button></span>'; };
  const found = q ? atSearch(q) : null;
  return aCard('🧰 ADMIN TOOLS · ' + AT_TOOLS.length, '<div class="row admRowWrap"><input class="admInput" id="atQ" placeholder="Search tools… (metro, road, pollution)" value="' + esc(q) + '"><input class="admInput" id="atVal" placeholder="VALUE (radius, amount, id…)"><button class="btn small" data-atundo="1"' + (AT.undo.length ? '' : ' disabled') + '>↶ Undo (' + AT.undo.length + ')</button><button class="btn small" data-atredo="1"' + (AT.redo.length ? '' : ' disabled') + '>↷ Redo (' + AT.redo.length + ')</button></div>' +
      '<p class="small">Target: ' + (t ? (t.b ? bdef(t.b).icon + ' ' + bdef(t.b).name + ' #' + t.b.id : 'tile ' + t.x + ',' + t.y + (MAP.roads[t.tile] ? ' (road)' : '')) + ' · ' + esc(districtName(t.x, t.y) || '') : 'no city') + ' — select a building or move the camera. Ctrl+Z / Ctrl+Y undo / redo the last ' + AT.max + ' changes.</p>' +
      (favs.length ? '<div class="small"><b>★ Favourites</b></div><div class="row admRowWrap">' + favs.map(function (id) { return btn(atTool(id)); }).join('') + '</div>' : '') +
      (AT.out ? '<pre class="small atOut">' + esc(AT.out) + '</pre>' : '')) +
    (found ? aCard('🔎 ' + found.length + ' tool(s) for "' + esc(q) + '"', '<div class="row admRowWrap">' + found.map(btn).join('') + '</div>')
      : AT_CATS.map(function (c) { const L = AT_TOOLS.filter(function (x) { return x.cat === c[0]; }); return '<details class="card admCard"' + (AT.open[c[0]] ? ' open' : '') + ' data-atcat="' + c[0] + '"><summary><b>' + c[1] + ' ' + c[2].toUpperCase() + '</b> · ' + L.length + '</summary><div class="row admRowWrap">' + L.map(btn).join('') + '</div></details>'; }).join(''));
}
/* the generation test suite on the open city (all 16 tests + the golden rule) */
function wbSuite() { const a = wbAnalyzeCurrent(); return WB_TESTS.map(function (x) { const r = a.v.tests[x[0]]; return (r.ok ? '✓ ' : '✗ ') + x[1] + ' Test — ' + r.score + ' · ' + r.detail; }).join('\n') + '\nGolden rule: ' + (a.q.broken.length ? 'NOT READY (' + a.q.broken.join(', ') + ')' : 'no broken system') + '\nWORLD QUALITY ' + a.q.overall + '% ' + a.q.label; }
function wbAdmin(a) {
  if (a === 'analyze') { const r = wbAnalyzeCurrent(); return { ok: true, msg: 'World quality ' + r.q.overall + '% ' + r.q.label + (r.q.ready ? ' · WORLD READY' : ' · NOT READY'), out: WB_TESTS.map(function (x) { const t = r.v.tests[x[0]]; return (t.ok ? '✓ ' : '✗ ') + x[1] + ' — ' + t.detail; }).join('\n') }; }
  if (a === 'fix') { const r = wbAutoFixCurrent(); return { ok: true, msg: r.passes + ' repair pass(es) · quality ' + r.q.overall + '%', out: r.fixes.join('\n') || 'Nothing needed fixing' }; }
  if (a === 'balance') { const b = wbBalanceEnvironment(null, wbProfileFor((S.worldbuilder && S.worldbuilder.cfg) || {})); return { ok: true, msg: 'Environment balanced', out: atReport(b.metrics) + '\n' + JSON.stringify(b.log) }; }
  if (a === 'suite') { const t = wbSuite(); return { ok: true, msg: 'Test suite finished', out: t }; }
  if (a === 'transport') { const r = tpGenerateTransport(); return r.ok ? { ok: true, msg: r.tier + ' transport · ' + r.built.length + ' element(s)', out: r.list.map(function (s) { return s[0] + ': ' + s[1]; }).join('\n') } : { ok: false, reason: r.reason }; }
  if (a === 'create') {
    const ov = { name: WBUI.name || undefined, seed: WBUI.seed || undefined, slot: WBUI.slot || undefined, size: WBUI.size !== 'AUTO' ? WBUI.size : undefined, custom: WBLD.profile === 'custom' ? Object.assign({}, WBUI.custom) : null };
    closeAdminCenter(); wbCreateOptimizedWorld(WBUI.preset, WBLD.profile, ov);
    return { ok: true, msg: 'Creating an optimized world…' };
  }
  return { ok: false, reason: 'unknown action' };
}
if (typeof adminWrap === 'function') adminWrap('wbAdmin', function (a) { return 'wb:' + a; });
if (typeof ADMIN_CMD_CAT !== 'undefined') { ADMIN_CMD_CAT['wb:create'] = 'generate'; ['analyze', 'suite'].forEach(function (k) { ADMIN_CMD_CAT['wb:' + k] = 'view'; }); ['fix', 'balance', 'transport'].forEach(function (k) { ADMIN_CMD_CAT['wb:' + k] = 'city'; }); }
if (typeof ADM_VIEWS !== 'undefined') {
  WC_CATS.push(['wc_wb', '🧬', 'WORLD BUILDER 2.0'], ['wc_tools', '🧰', 'ADMIN TOOLS']);
  if (typeof ADMIN_GROUPS !== 'undefined') { const g = ADMIN_GROUPS.find(function (x) { return x[0] === 'WORLD'; }); if (g) ['wc_wb', 'wc_tools'].forEach(function (id) { if (g[2].indexOf(id) < 0) g[2].unshift(id); }); }
  ADM_VIEWS.wc_wb = function () { return wbuiView(); };
  ADM_VIEWS.wc_tools = function () { return atuiView(); };
  // tools in the admin search
  const ash = window.adminSearchHtml;
  if (typeof ash === 'function') window.adminSearchHtml = function (q) { const f = atSearch(q).slice(0, 24); return (f.length ? aCard('🧰 Admin tools', '<div class="row admRowWrap">' + f.map(function (t) { return '<button class="btn small" data-atrun="' + t.id + '">' + esc(t.name) + '</button>'; }).join('') + '</div>') : '') + ash.apply(this, arguments); };
}
document.addEventListener('click', function (e) {
  const q = function (s) { return e.target.closest && e.target.closest(s); }; let el, r = null;
  if ((el = q('[data-atrun]'))) { const v = document.getElementById('atVal') ? document.getElementById('atVal').value : ''; r = adminTool(el.dataset.atrun, v); if (r) { toast(r.ok ? '🧰 ' + r.msg : '❌ ' + (r.reason || r.msg), r.ok ? 'good' : 'bad'); if (ADM.cat !== 'wc_tools' && atTool(el.dataset.atrun).kind !== 'gen') { ADM.cat = 'wc_tools'; ADM.search = ''; } } }
  else if ((el = q('[data-atfav]'))) atToggleFav(el.dataset.atfav);
  else if ((el = q('[data-atundo]'))) { const m = atUndo(); AT.out = m; toast(m, ''); }
  else if ((el = q('[data-atredo]'))) { const m = atRedo(); AT.out = m; toast(m, ''); }
  else if ((el = q('[data-wbp]'))) { WBUI.preset = el.dataset.wbp; if (WB_PRESET_PROFILE[WBUI.preset]) WBLD.profile = WB_PRESET_PROFILE[WBUI.preset]; }
  else if ((el = q('[data-wbprof]'))) WBLD.profile = el.dataset.wbprof;
  else if ((el = q('[data-wbsize]'))) WBUI.size = el.dataset.wbsize;
  else if ((el = q('[data-wbgo]'))) { WBUI.name = ($('wbName') || {}).value || ''; WBUI.seed = ($('wbSeed') || {}).value || ''; WBUI.slot = +(($('wbSlot') || {}).value || 0); r = wbAdmin('create'); if (r) toast(r.ok ? '🧬 ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); return; }
  else if ((el = q('[data-wba]'))) { r = wbAdmin(el.dataset.wba); if (r) { WBUI.out = r.out || ''; toast(r.ok ? '🧬 ' + r.msg : '❌ ' + r.reason, r.ok ? 'good' : 'bad'); } }
  else return;
  if (typeof renderAdminCenter === 'function' && ADM.open) renderAdminCenter();
});
document.addEventListener('toggle', function (e) { const d = e.target; if (d && d.dataset && d.dataset.atcat) AT.open[d.dataset.atcat] = d.open; }, true);
document.addEventListener('input', function (e) {
  const t = e.target;
  if (t.id === 'atQ') { AT.q = t.value; const pos = t.selectionStart; renderAdminCenter(); const n = document.getElementById('atQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* */ } } }
  else if (t.dataset && t.dataset.wbc) { WBUI.custom[t.dataset.wbc] = +t.value; const l = document.getElementById('wbcv_' + t.dataset.wbc); if (l) l.textContent = t.value; }
});
/* Ctrl+Z / Ctrl+Y inside the admin panel undo / redo World Builder changes (the player's own undo is untouched) */
window.addEventListener('keydown', function (e) {
  if (typeof ADM === 'undefined' || !ADM.open || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const m = k === 'z' && !e.shiftKey ? atUndo() : atRedo(); if (m) { AT.out = m; toast(m, ''); renderAdminCenter(); }
}, true);
/* Ctrl+K palette: admin tools (only while an admin is signed in — the guard checks every call again) */
(function () {
  const pc = window.paletteCommands;
  if (typeof pc === 'function') window.paletteCommands = function () {
    const C = pc.apply(this, arguments);
    if (typeof AdminAuth === 'undefined' || !AdminAuth.active()) return C;
    AT_TOOLS.forEach(function (t) { C.push({ label: 'Admin · ' + t.name, icon: '🧰', kw: ('admin ' + t.cat + ' ' + t.kw).toLowerCase(), run: function () { if (typeof closePalette === 'function') closePalette(); const r = adminTool(t.id, ''); if (r) toast(r.ok ? '🧰 ' + r.msg : '❌ ' + (r.reason || r.msg), r.ok ? 'good' : 'bad'); } }); });
    C.push({ label: 'Admin · Create Optimized World', icon: '🧬', kw: 'admin world create optimized', run: function () { if (typeof closePalette === 'function') closePalette(); openAdminCenter('wc_wb'); } });
    return C;
  };
})();
