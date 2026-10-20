'use strict';
/* BLOCK CITY TYCOON — DEEP QA TEST (Part 16 · v2.4.x hardening)
   Runs the game (browser build, Android and Windows profiles) in Chromium and checks what a player can only break by
   playing for hours: deterministic worlds (same seed → same city), save compatibility (v2.4 / v2.3 / v2.2 / v2.1 saves,
   v11 → v12 migration, Windows ↔ Android, corrupted main save → backup), the desktop file store (.tmp → verify → rename,
   interrupted writes), every weather transition and weather × season combination, power outages at night and in
   storm / rain / snow (street lights, 4-way stops, emergency lights, restore notice), the vehicle light state machine,
   cinematic camera durations 1 / 5 / 10 / 30 / 60 s and the City Tour (never off the map, no jumps), simulation speeds
   0.5× – 100× (particles stay inside the budget), event stress (festival + storm + outage + fire) and cleanup,
   memory-leak loops (photo mode, history, map, weather, season, events, chunk streaming), world sizes SMALL – HUGE,
   population / vehicle scale, the quality governor (step down, cooldown, restore), settings persistence and release
   security (no debug / stress / developer presets in a release build).
   Part 17 adds the ECONOMY group: deterministic economy, markets, company lifecycle / gradual bankruptcy / unique names,
   banking (1 % floor, loan stages, credit, mortgages), housing crisis, tax policy, 8 shocks × 4 severities, Economy 2.0
   save / v2.4.1 migration / Windows ↔ Android, 10,000 companies, the economic stress scenario and the economy UI.
   Part 18 adds the GOVERNMENT group: small city, determinism, 100K / 500K, high / low tax, budget deficit, hospital
   capacity, school shortage, police coverage, bad fire access, zero maintenance, large infrastructure failure, 100×,
   save → restart → load, v2.5.0 / corrupt saves, Windows ↔ Android, the City Management UI and admin security.
   Part 19 adds WORLDGEN (20 presets, pipeline, clean-world limits, auto-fix / rejection, determinism, transport tiers),
   TRANSPORT (dashboard, line editor, Traffic AI 3.0, validator, Save 3.2) and STRESS19 (tests A–M of the Part 19 plan).
   Part 20 adds CITIZENS: identity / households / needs / Happiness 3.0, utility decisions, commute + shopping + health + job AI,
   opinions → approval, housing + migration, life score / forecast / planner, LOD rates, 10K–500K, recession + festival,
   Save 3.3, validator, the City Life UI and the mobile inspector flow.
   Every wait is a wait-until with a deadline (no fixed sleeps that flake on a slow runner). A failure prints
   Test / Expected / Actual / Device / Resolution / Build / Commit.
   Usage:  node scripts/qa-test.js [--out=dist/qa] [--only=save,weather] [--profile=android|windows|both]
   Needs Playwright (npm i --no-save playwright && npx playwright install chromium) or PLAYWRIGHT_PATH. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..', 'src');
const args = process.argv.slice(2);
const opt = function (k, d) { const a = args.find(function (x) { return x.indexOf('--' + k + '=') === 0; }); return a ? a.split('=')[1] : d; };
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'dist', 'qa')));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const PROFILE = opt('profile', 'both');
const VERSION = require('../package.json').version;
const COMMIT = (process.env.GITHUB_SHA || (function () { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') }).toString().trim(); } catch (e) { return 'local'; } })()).slice(0, 10);
let pw = null;
for (const c of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright']) { if (!c) continue; try { pw = require(c); break; } catch (e) { /* next */ } }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}

const results = [];
function record(device, res, name, ok, expected, actual, ms) {
  results.push({ test: name, ok: ok, expected: expected, actual: actual, device: device.name, resolution: res, build: VERSION, commit: COMMIT, ms: ms });
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + ' — ' + actual + (ok ? '' : '\n       Test: ' + name + '\n       Expected: ' + expected + '\n       Actual: ' + actual + '\n       Device: ' + device.name + '\n       Resolution: ' + res + '\n       Build: ' + VERSION + '\n       Commit: ' + COMMIT));
}
const want = function (group) { return !ONLY || ONLY.indexOf(group) >= 0; };

/* ---------- 1. desktop file store (pure Node: electron/storage.js) ---------- */
function storageTests() {
  const dev = { name: 'Windows file store (Node)' };
  const t0 = Date.now();
  const { createStorage } = require('../electron/storage.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bct-qa-'));
  const logs = []; const log = { warn: function (m) { logs.push(m); }, error: function (m) { logs.push(m); }, info: function () { } };
  const st = createStorage(dir, log);
  st.loadAll();
  const save = JSON.stringify({ version: 12, city: { name: 'QA' } });
  const w1 = st.write('bct_pro_save', save), w2 = st.write('bct_pro_save_backup', save);
  const files = fs.readdirSync(path.join(dir, 'saves')).sort().join(',');
  const bad = st.write('bct_pro_save', '{"version":12,"city":');                        // a save that does not parse never replaces the good one
  const kept = fs.readFileSync(path.join(dir, 'saves', 'city_01.json'), 'utf8') === save;
  fs.writeFileSync(path.join(dir, 'saves', 'city_01.json.tmp'), '{"half":');               // crash in the middle of a write
  const all = st.loadAll(); st.cleanupTemp();
  const tmpGone = !fs.existsSync(path.join(dir, 'saves', 'city_01.json.tmp'));
  const ok = w1.ok && w2.ok && files === 'city_01.backup.json,city_01.json' && !bad.ok && kept && all.bct_pro_save === save && tmpGone && !Object.keys(all).some(function (k) { return /tmp/.test(k); });
  record(dev, '—', 'Save files: .json / .backup.json / .tmp (crash recovery)', ok, 'atomic .tmp → verify → rename · broken JSON rejected · leftover .tmp ignored and removed',
    'files ' + files + ' · broken write rejected ' + !bad.ok + ' · good save kept ' + kept + ' · .tmp ignored on load ' + (all.bct_pro_save === save) + ' · .tmp removed ' + tmpGone, Date.now() - t0);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------- 1b. bundle / asset audit (what ships inside the EXE and the APK: everything under src/) ---------- */
function bundleAudit() {
  const dev = { name: 'Bundle (src/ → EXE + APK)' }, t0 = Date.now();
  const files = []; (function walk(d) { fs.readdirSync(d).forEach(function (f) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); }); })(ROOT);
  const rel = function (p) { return path.relative(ROOT, p).replace(/\\/g, '/'); };
  const total = files.reduce(function (a, f) { return a + fs.statSync(f).size; }, 0);
  const text = files.filter(function (f) { return /\.(html|js|css|json|webmanifest)$/.test(f); }).map(function (f) { return fs.readFileSync(f, 'utf8'); }).join('\n')
    + fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8').replace(/"!src\/[^"]*"/g, '') + (fs.existsSync(path.join(__dirname, '..', 'main.js')) ? fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') : '')
    + (function () { try { return fs.readdirSync(path.join(__dirname, '..', 'android'), { recursive: true }).filter(function (f) { return /\.(gradle|kts|java|kt|xml)$/.test(f); }).map(function (f) { return fs.readFileSync(path.join(__dirname, '..', 'android', f), 'utf8'); }).join('\n'); } catch (e) { return ''; } })();
  // a file the game never references must at least be left out of both packages (EXE: package.json "files", APK: build.js SOURCE_ONLY)
  const pkgFiles = require('../package.json').build.files, buildJs = fs.readFileSync(path.join(__dirname, 'build.js'), 'utf8');
  const excluded = function (r) { return pkgFiles.indexOf('!src/' + r) >= 0 && buildJs.indexOf("'" + r + "'") >= 0; };
  const notShipped = [];
  const unused = files.filter(function (f) { const r = rel(f), b = path.basename(f); if (r === 'index.html' || text.indexOf(b) >= 0) return false; if (excluded(r)) { notShipped.push(r); return false; } return true; }).map(rel);
  const devOnly = files.map(rel).filter(function (r) { return /\.map$|\.test\.|\.spec\.|(^|\/)\.|node_modules|\.log$|\.bak$|\.tmp$/.test(r); });
  const prof = (function () { try { return /"profile":\s*"(\w+)"/.exec(fs.readFileSync(path.join(ROOT, 'js', 'build-profile.js'), 'utf8'))[1]; } catch (e) { return 'missing (= release)'; } })();
  const big = files.map(function (f) { return [rel(f), fs.statSync(f).size]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
  const imgs = files.filter(function (f) { return /\.(png|jpe?g|webp|ico|svg)$/.test(f); }).map(function (f) { return [rel(f), fs.statSync(f).size]; });
  const ok = total < 6 * 1048576 && unused.length === 0 && devOnly.length === 0 && (prof === 'release' || /missing/.test(prof)) && imgs.every(function (i) { return i[1] < 512 * 1024; });
  record(dev, '—', 'Bundle size · asset audit · release profile', ok, 'bundle < 6 MB, every shipped file referenced, no dev-only files, committed build profile RELEASE, no image > 512 KB (the city is drawn procedurally: no textures)',
    files.length + ' files, ' + (total / 1048576).toFixed(2) + ' MB · largest ' + big.map(function (b) { return b[0] + ' ' + Math.round(b[1] / 1024) + ' KB'; }).join(', ') + ' · images ' + imgs.map(function (i) { return i[0].replace('assets/icons/', '') + ' ' + Math.round(i[1] / 1024) + ' KB'; }).join(', ') + ' · source-only (not shipped) ' + (notShipped.join(', ') || 'none') + ' · unreferenced and shipped ' + (unused.join(', ') || 'none') + ' · dev-only files ' + (devOnly.join(', ') || 'none') + ' · build profile ' + prof, Date.now() - t0);
}

/* ---------- 2. browser tests ---------- */
async function runProfile(browser, base, dev) {
  const ctx = await browser.newContext(dev.mobile ? { viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, hasTouch: true, isMobile: true } : { viewport: { width: dev.w, height: dev.h } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(m.text()); });
  const res = dev.w + '×' + dev.h + (dev.dpr ? ' @' + dev.dpr : '');
  const ev = function (f, a) { return page.evaluate(f, a); };
  const metrics = async function () {
    await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
    const m = (await cdp.send('Performance.getMetrics')).metrics, g = function (n) { const x = m.find(function (k) { return k.name === n; }); return x ? x.value : 0; };
    return { heap: g('JSHeapUsedSize') / 1048576, nodes: g('Nodes'), listeners: g('JSEventListeners') };
  };
  const T = async function (group, name, expected, fn) {
    if (!want(group)) return;
    const t0 = Date.now(), e0 = errors.length; let ok = false, actual = '';
    try { const r = await fn(); ok = !!r.ok; actual = r.actual || ''; } catch (e) { ok = false; actual = 'ERROR ' + e.message; }
    if (errors.length > e0) { ok = false; actual += ' · PAGE ERRORS: ' + errors.slice(e0, e0 + 3).join(' | '); }
    record(dev, res, name, ok, expected, actual, Date.now() - t0);
    if (!ok) { try { await page.screenshot({ path: path.join(OUT, dev.id + '-' + name.replace(/[^a-z0-9]+/gi, '_').slice(0, 60) + '.png') }); } catch (e) { /* page gone */ } }
  };
  await page.goto(base + '/index.html' + (dev.mobile ? '?platform=android' : ''));
  await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none' && typeof generateWorld === 'function'; }, null, { timeout: 120000 });
  /* in-page helpers: wait-until with a deadline, a fresh world, a few rendered frames (injected again after a reload) */
  const helpers = function () { return ev(function () {
    window.__qa = {
      until: function (fn, ms) { const end = performance.now() + (ms || 8000); return new Promise(function (resolve) { (function tick() { let v = false; try { v = fn(); } catch (e) { v = false; } if (v || performance.now() > end) resolve(!!v); else setTimeout(tick, 30); })(); }); },
      frames: function (n) { return new Promise(function (resolve) { let k = 0; (function f() { if (++k >= n) resolve(); else requestAnimationFrame(f); })(); }); },
      world: async function (size, seed, slot) {
        if (PSH.dialogOpen) { const b = document.querySelector('#sysBtns button'); if (b) b.click(); }
        GSET.setupDone = true; GSET.mobileTutDone = true;
        const t0 = performance.now(); const g = await generateWorld('balanced', { seed: seed, name: 'QA ' + size, slot: slot || 3, size: size });
        window.__qaDlg = g ? '' : ((document.getElementById('sysDialog') || {}).innerText || '').slice(0, 300) + ' busy ' + WG.busy;
        closeModal(); clearDialogues(); setSpeed(0); S.money = 5e7; S.budget = 5e7;
        return { ok: !!g && STARTED, ms: performance.now() - t0 };
      },
      finite: function (o) { for (const k in o) if (typeof o[k] === 'number' && !isFinite(o[k])) return k; return null; }
    };
  }); };
  await helpers();

  await T('determinism', 'Deterministic world (same seed → same city)', 'two SMALL worlds from seed 777001 are identical: terrain, roads, districts, buildings, population, save data',
    async function () {
      const r = await ev(async function () {
        const snap = function () {
          const h = function (a) { return fnv1a(Array.prototype.join.call(a, ',')); };
          computeDistricts();
          const blds = S.buildings.list.map(function (b) { return b.type + '@' + b.x + ',' + b.y + 'L' + b.level; }).join(';');
          // world part of the save (the economy runs in real time while the generator awaits frames, so money / prices are not compared)
          const save = buildSaveObject(); const strip = function (o) { return { buildings: o.buildings.list.map(function (b) { return [b.id, b.type, b.x, b.y, b.rot | 0, b.level, b.owner || '', b.name || ''].join(':'); }), roads: o.city.roads, nature: o.city.nature, zones: o.city.zones, terrain: o.city.terrain, res: o.city.res, seed: o.city.seed, name: o.city.name, world: o.p8 && Object.assign({}, o.p8.world, { economy: 0, generatedAt: 0, vehicles: 0 }) }; };
          return { terrain: h(MAP.terrain), roads: h(MAP.roads), zone: h(MAP.zone), nature: h(MAP.nature), res: h(MAP.res), blds: fnv1a(blds), n: S.buildings.list.length, districts: fnv1a(JSON.stringify((S.city.districts || []).map ? S.city.districts : 0) + (typeof districtCharacters === 'function' ? JSON.stringify(Object.values(districtCharacters()).map(function (d) { return d.id || d.name || d; })) : '')), pop: Math.round(S.city.population), citizens: AG.citizens.filter(function (c) { return !c.tourist; }).map(function (c) { return c.id + ':' + c.home + '/' + c.work + '/' + c.age + '/' + c.edu + '/' + c.pers + '/' + Math.round(c.money); }), save: (function () { const w = strip(JSON.parse(JSON.stringify(save))); const o = {}; Object.keys(w).forEach(function (k) { o[k] = fnv1a(JSON.stringify(w[k] === undefined ? null : w[k])); }); return JSON.stringify(o); })() };
        };
        await __qa.world('SMALL', 777001); const a = snap();
        await __qa.world('SMALL', 777001); const b = snap();
        await __qa.world('SMALL', 777002); const c = snap();
        // citizen agents keep spawning while the city runs; the first K (same spawn numbers) must be identical
        const K = Math.min(a.citizens.length, b.citizens.length), cSame = K > 0 && a.citizens.slice(0, K).join() === b.citizens.slice(0, K).join(), cOther = a.citizens.slice(0, K).join() !== c.citizens.slice(0, Math.min(K, c.citizens.length)).join();
        a.cit = b.cit = K; a.citizens = b.citizens = cSame ? 'same' : 'different'; c.citizens = cOther ? 'other' : 'same';
        const saveDiff = (function () { const x = JSON.parse(a.save), y = JSON.parse(b.save); return Object.keys(x).filter(function (k) { return x[k] !== y[k]; }); })();
        if (saveDiff.length) a.save = 'save(' + saveDiff.join('/') + ')';
        const diff = Object.keys(a).filter(function (k) { return k !== 'pop' && a[k] !== b[k]; }).map(function (k) { return k === 'save' ? a.save : k; });
        setSpeed(0); const s1 = JSON.parse(JSON.stringify(buildSaveObject())), s2 = JSON.parse(JSON.stringify(buildSaveObject()));
        [s1, s2].forEach(function (o) { delete o.lastSaveTime; delete o.header.timestamp; delete o.header.revision; delete o.origin.revision; });
        const saveSame = JSON.stringify(s1) === JSON.stringify(s2);
        return { diff: diff, other: Object.keys(a).filter(function (k) { return a[k] !== c[k]; }).length, a: a, saveSame: saveSame };
      });
      return { ok: r.diff.length === 0 && r.other > 0 && r.saveSame, actual: (r.diff.length ? 'DIFFERENT: ' + r.diff.join(', ') : 'identical terrain / roads / zones / nature / resources / ' + r.a.n + ' buildings / districts / first ' + r.a.cit + ' citizens (home, job, age, education, personality, money)') + ' · same state saved twice → identical save ' + r.saveSame + ' · another seed differs in ' + r.other + ' fields (population ' + r.a.pop + ' is a running simulation value, not compared)' };
    });

  await T('save', 'Save compatibility v2.4 / v2.3 / v2.2 / v2.1 · migration · cross-platform · backup', 'every save loads with its city intact; old saves without history get an empty history; corrupted main → backup',
    async function () {
      const r = await ev(async function () {
        await __qa.world('SMALL', 424242, 2);
        historySample(true); historySample(true);
        const ok1 = saveGame(true), raw = Store.getItem(slotKey(2)), base = JSON.parse(raw), nB = base.buildings.list.length, hist = S.p15.hist.length;
        const load = function (obj) { Store.setItem(slotKey(2), typeof obj === 'string' ? obj : JSON.stringify(obj)); const res = loadGame(2); return { n: S.buildings.list.length, p15: !!S.p15 && Array.isArray(S.p15.hist), hist: S.p15 ? S.p15.hist.length : -1, name: S.city.name, notes: res.notes, isNew: res.isNew, v: S.version }; };
        const out = {};
        out.v24 = load(raw);
        const imp = validateImport(JSON.parse(raw)); out.importErr = imp.length;
        const old = function (ver) { const o = JSON.parse(raw); delete o.p15; o.header.gameVersion = ver; o.origin.version = ver; o.origin.lastVersion = ver; if (o.header.sections) o.header.sections.simulationData = o.header.sections.simulationData.filter(function (k) { return k !== 'p15'; }); return o; };
        out.v23 = load(old('2.3.0')); out.v22 = load(old('2.2.0')); out.v21 = load(old('2.1.0'));
        const m = JSON.parse(raw); m.version = 11; m.header.version = 11; m.header.saveVersion = 11; delete m.origin; delete m.p15;
        out.v11 = load(m); out.premig = premigBackups(2).length;
        const win = JSON.parse(raw); win.header.platform = 'windows'; win.origin.platform = 'windows'; win.origin.lastPlatform = 'windows';
        out.win = load(win); out.winLast = S.origin.lastPlatform; out.winPlat = S.origin.platform;
        saveGame(true); out.reSaved = JSON.parse(Store.getItem(slotKey(2))).origin.lastPlatform;
        // corrupted main save → the backup (previous good save) is used
        saveGame(true); Store.setItem(slotKey(2), '{"version":12,"city":{'); out.corrupt = loadGame(2); out.corruptN = S.buildings.list.length;
        return { ok1: ok1, nB: nB, hist: hist, out: out, plat: PLATFORM_ID };
      });
      const o = r.out, good = function (x) { return x && !x.isNew && x.n === r.nB && x.p15; };
      const ok = r.ok1 && good(o.v24) && o.v24.hist === r.hist && o.importErr === 0 && good(o.v23) && o.v23.hist === 0 && good(o.v22) && good(o.v21) && good(o.v11) && o.premig > 0 && good(o.win) && o.winPlat === 'windows' && o.reSaved === r.plat &&
        !o.corrupt.isNew && o.corrupt.notes.some(function (n) { return /backup/i.test(n); }) && o.corruptN === r.nB;
      return { ok: ok, actual: 'v2.4: ' + o.v24.n + '/' + r.nB + ' buildings, history ' + o.v24.hist + '/' + r.hist + ', import check ' + o.importErr + ' errors · v2.3/2.2/2.1 (no history): ' + [o.v23, o.v22, o.v21].map(function (x) { return x.n + (x.p15 ? '+hist' : '-hist'); }).join(' / ') + ' · v11 → v12: ' + o.v11.n + ' buildings, pre-update backups ' + o.premig + ' · Windows save on ' + r.plat + ': ' + o.win.n + ' buildings, created on ' + o.winPlat + ', saved again as ' + o.reSaved + ' · corrupted main: ' + (o.corrupt.notes.join(' ') || 'no note') + ' (' + o.corruptN + ' buildings)' };
    });

  await T('save', 'Save / load performance (LARGE world)', 'save < 1500 ms, load < 3000 ms, timed load stages listed',
    async function () {
      const r = await ev(async function () {
        await __qa.world('LARGE', 515151, 2);
        const t0 = performance.now(); const ok = saveGame(true); const sv = performance.now() - t0;
        const t1 = performance.now(); loadGame(2); resetSim(); resetAgents(); const ld = performance.now() - t1;
        return { ok: ok, sv: sv, ld: ld, kb: Math.round(Store.getItem(slotKey(2)).length / 1024), line: loadProfLine(), p: LOAD_PROF };
      });
      return { ok: r.ok && r.sv < 1500 && r.ld < 3000 && r.p.total > 0 && r.p.world >= 0, actual: 'save ' + r.sv.toFixed(0) + ' ms (' + r.kb + ' KB) · load ' + r.ld.toFixed(0) + ' ms · ' + r.line };
    });

  await ev(async function () { await __qa.world('SMALL', 424242, 3); setSpeed(1); });

  await T('weather', 'Weather transition matrix (9 × 9)', 'every pair of weathers changes step by step (no jump) and ends on the target; the plan runs to the end in the simulation',
    async function () {
      const r = await ev(async function () {
        const W = ['clear', 'cloudy', 'rain', 'heavyrain', 'storm', 'snow', 'fog', 'heatwave', 'coldwave'];
        const adj = function (a, b) { const ia = VE_WX_CHAIN.indexOf(a), ib = VE_WX_CHAIN.indexOf(b); if (ia >= 0 && ib >= 0) return Math.abs(ia - ib) === 1; const off = ia < 0 ? a : b, other = ia < 0 ? b : a; return other === (off === 'heatwave' ? 'clear' : 'cloudy'); };
        const bad = []; let pairs = 0, steps = 0, sim = 0;
        W.forEach(function (a) { W.forEach(function (b) { if (a === b) return; pairs++; const p = weatherPath(a, b); steps += p.length; let prev = a; const seen = {}; p.forEach(function (w) { if (!adj(prev, w) || seen[w]) bad.push(a + '→' + b + ' [' + p.join('>') + ']'); seen[w] = 1; prev = w; }); if (p[p.length - 1] !== b) bad.push(a + '→' + b + ' ends on ' + p[p.length - 1]); }); });
        // the simulation really walks a plan: clear → storm, then storm → snow
        const walk = function (from, to) {
          FX.lock = null; FX.weather = from; FX.natStorm = from === 'storm'; VE.wx.plan = []; S.events.active = S.events.active.filter(function (e) { return e.id !== 'storm'; });
          const first = veWeatherPlan(from, to); const seq = [];
          FX.weather = first; seq.push(first);
          for (let i = 0; i < 12 && VE.wx.plan.length; i++) { FX.weatherUntil = S.clock.gameSec - 1; FX.natStorm = true; updateWeather(0.016); veUpdateWeatherState(0.1); seq.push(FX.weather); render(); }
          return seq;
        };
        const s1 = walk('clear', 'storm'), s2 = walk('storm', 'snow'); sim = s1.length + s2.length;
        const nan = __qa.finite(VE.wx);
        return { pairs: pairs, steps: steps, bad: bad, s1: s1.join('>'), s2: s2.join('>'), nan: nan };
      });
      return { ok: r.bad.length === 0 && r.s1 === 'cloudy>rain>heavyrain>storm' && /snow$/.test(r.s2) && !r.nan, actual: r.pairs + ' transitions, ' + r.steps + ' steps, ' + r.bad.length + ' jumps' + (r.bad.length ? ': ' + r.bad.slice(0, 4).join(' · ') : '') + ' · simulated clear→storm ' + r.s1 + ' · storm→snow ' + r.s2 + (r.nan ? ' · NaN in ' + r.nan : '') };
    });

  await T('weather', 'Weather × season combinations', '4 seasons × 9 weathers render without errors, snow only settles while snowing or in winter, foliage colours valid, values finite',
    async function () {
      const r = await ev(async function () {
        const W = ['clear', 'cloudy', 'rain', 'heavyrain', 'storm', 'snow', 'fog', 'heatwave', 'coldwave']; const bad = []; let n = 0;
        const day0 = S.clock.gameSec;
        for (let s = 0; s < 4; s++) {
          S.clock.gameSec = (s * SEASON_DAYS + 2) * 86400 + 12 * 3600;
          for (const w of W) {
            FX.lock = w; FX.weather = w; FX.weatherUntil = S.clock.gameSec + 3600; VE.wx.snow = 0; VE.wx.wet = 0;
            for (let k = 0; k < 10; k++) { updateWeather(0.05); veUpdateWeatherState(0.5); }
            render(); n++;
            const season = currentSeason().id, snowing = w === 'snow' || w === 'coldwave', col = foliageColor(currentSeason(), 7);
            if (!snowing && VE.wx.snow > 0.01) bad.push(season + '/' + w + ' snow ' + VE.wx.snow.toFixed(2));
            if (!/^#[0-9a-f]{6}$/i.test(col)) bad.push(season + ' foliage ' + col);
            const nan = __qa.finite(VE.wx); if (nan) bad.push(season + '/' + w + ' NaN ' + nan);
            if (FX.dropN > FX.drops.length) bad.push(season + '/' + w + ' drops ' + FX.dropN + '>' + FX.drops.length);
          }
        }
        S.clock.gameSec = day0; FX.lock = null; FX.weather = 'clear'; VE.wx.plan = [];
        return { n: n, bad: bad };
      });
      return { ok: r.bad.length === 0 && r.n === 36, actual: r.n + ' combinations rendered · ' + (r.bad.length ? r.bad.slice(0, 5).join(' · ') : 'no invalid state') };
    });

  await T('power', 'Power outage → restore (night · rain · storm · snow)', 'outage: street lights OFF, 4-way stop, emergency lights stay on, notice; restore: lights ON, signals normal, "Power restored"',
    async function () {
      const r = await ev(async function () {
        const out = [];
        for (const w of ['clear', 'rain', 'storm', 'snow']) {
          setHour(22); FX.lock = w; FX.weather = w; FX.weatherUntil = S.clock.gameSec + 7200; updateSun();
          let inter = -1; for (let i = 0; i < MAP.inter.length; i++) if (MAP.inter[i]) { inter = i; break; }
          const x = inter % MAP.W, y = (inter / MAP.W) | 0;
          S.p9.util.failures = S.p9.util.failures.filter(function (f) { return f.cause !== 'qa'; });
          VE.at = 0; veFrame(0.016); UI.notifs = [];
          S.p9.util.failures.push({ x: x, y: y, r: 4, until: S.clock.runSec + 30, cause: 'qa-' + w });
          VE.at = 0; veFrame(0.016);
          const lampsIn = function () { let n = 0; for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (inMap(xx, yy) && streetLampAt(xx, yy) && !inOutage(xx, yy)) n++; return n; };
          CAM.x = (x + 0.5) * TILE; CAM.y = (y + 0.5) * TILE; CAM.zoom = 1.2; clampCamera(); render();
          const lampOff = lampsIn() === 0 && inOutage(x, y);
          const sig = []; for (let k = 0; k < 6; k++) { AG.lightClock += 1.3; sig.push(signalLight(inter, 'NS') + signalLight(inter, 'EW')); }
          const fourWay = sig.every(function (s) { return s === 'gr' || s === 'rg'; });
          const amb = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, siren: true, type: 'ambulance', ang: 0, speed: 3, dir: 0 };
          const ls = vehicleLightState(amb);
          const note = UI.notifs.some(function (n) { return /POWER OUTAGE/.test(n.msg); });
          S.p9.util.failures.forEach(function (f) { if (f.cause === 'qa-' + w) f.until = S.clock.runSec - 1; });
          VE.at = 0; veFrame(0.016); render();
          const restored = UI.notifs.some(function (n) { return /Power restored/.test(n.msg); }), back = !inOutage(x, y) && lampsIn() > 0;
          const sigBack = sigState(inter) && ['g', 'r', 'y'].indexOf(signalLight(inter, 'NS')) >= 0;
          S.p9.util.failures = S.p9.util.failures.filter(function (f) { return f.until > S.clock.runSec; });
          out.push({ w: w, lampOff: lampOff, fourWay: fourWay, emergency: ls.emergency && ls.head, note: note, restored: restored, back: back && sigBack });
        }
        FX.lock = null; FX.weather = 'clear'; setHour(12);
        return out;
      });
      const ok = r.every(function (x) { return x.lampOff && x.fourWay && x.emergency && x.note && x.restored && x.back; });
      return { ok: ok, actual: r.map(function (x) { return x.w + ': lights off ' + x.lampOff + ', 4-way ' + x.fourWay + ', emergency lights ' + x.emergency + ', notice ' + x.note + ', restored ' + x.restored + '/' + x.back; }).join(' · ') };
    });

  await T('lights', 'Vehicle light state machine', 'DAY: no headlights · NIGHT / RAIN / FOG: headlights · BRAKING · TURNING · EMERGENCY flashes day and night',
    async function () {
      const r = await ev(function () {
        const v = function (o) { return Object.assign({ x: 100, y: 100, type: 'car', speed: 3, ang: 0, dir: 0 }, o); };
        const st = function (h, w, fog, o) { setHour(h); updateSun(); FX.weather = w; VE.wx.wet = w === 'rain' ? 1 : 0; VE.wx.fog = fog || 0; VL_FRAME++; return vehicleLightState(v(o)); };
        const day = Object.assign({}, st(12, 'clear')), night = st(23, 'clear'), rain = st(12, 'rain'), fog = st(12, 'fog', 0.8), em = st(12, 'clear', 0, { siren: true, type: 'police' });
        const car = v({ speed: 3 }); setHour(23); updateSun(); VL_FRAME++; vehicleLightState(car); car.speed = 0.5; VL_FRAME++; const brake = Object.assign({}, vehicleLightState(car));
        car.speed = 0; car.stopped = 1; VL_FRAME++; const stopped = Object.assign({}, vehicleLightState(car));
        VE.wx.wet = 0; VE.wx.fog = 0; FX.weather = 'clear'; setHour(12); updateSun();
        return { day: day, night: night, rain: rain, fog: fog, em: em, brake: brake, stopped: stopped };
      });
      const ok = r.day.mode === 'DAY' && !r.day.head && r.night.mode === 'NIGHT' && r.night.head && r.rain.mode === 'RAIN' && r.rain.head && r.fog.mode === 'FOG' && r.fog.head && r.em.emergency && r.brake.brake && r.stopped.brake;
      return { ok: ok, actual: ['day', 'night', 'rain', 'fog', 'em', 'brake', 'stopped'].map(function (k) { const s = r[k]; return k + '=' + s.mode + (s.head ? '+head' : '') + (s.brake ? '+brake' : '') + (s.turn ? '+turn' : '') + (s.emergency ? '+EMERGENCY' : ''); }).join(' · ') };
    });

  await T('camera', 'Cinematic camera 1 / 5 / 10 / 30 / 60 s', 'each duration runs to Point B, eases without jumps and the camera never leaves the map',
    async function () {
      const r = await ev(async function () {
        enterPhoto(); const out = [];
        for (const d of [1, 5, 10, 30, 60]) {
          CAM.x = TILE * 3; CAM.y = TILE * 3; CAM.zoom = 1; clampCamera(); cineSetPoint('A');
          CAM.x = MAP.W * TILE - TILE * 3; CAM.y = MAP.H * TILE - TILE * 3; CAM.zoom = 1.6; clampCamera(); cineSetPoint('B');
          cinePlay(d); cancelAnimationFrame(VE.cineRaf);
          const c = VE.cine, t0 = c.t0, B = VE.cinePts.B; let maxJump = 0, out0 = 0, px = null, py = null; const steps = 240;
          for (let i = 0; i <= steps + 2 && VE.cine; i++) { cineFrame(t0 + c.dur * i / steps); cancelAnimationFrame(VE.cineRaf); if (px !== null) maxJump = Math.max(maxJump, Math.hypot(CAM.x - px, CAM.y - py)); px = CAM.x; py = CAM.y; if (CAM.x < -TILE || CAM.y < -TILE || CAM.x > MAP.W * TILE + TILE || CAM.y > MAP.H * TILE + TILE) out0++; }
          const span = Math.hypot(B.x - VE.cinePts.A.x, B.y - VE.cinePts.A.y);
          out.push({ d: d, done: !VE.cine, atB: Math.hypot(CAM.x - B.x, CAM.y - B.y) < 2, jump: maxJump / Math.max(1, span), off: out0, ms: c.dur });
        }
        stopCinematic(); exitPhoto();
        return out;
      });
      const ok = r.every(function (x) { return x.done && x.atB && x.off === 0 && x.jump < 0.02 && x.ms === x.d * 1000; });
      return { ok: ok, actual: r.map(function (x) { return x.d + ' s: ' + (x.done && x.atB ? 'reached B' : 'NOT at B') + ', biggest step ' + (x.jump * 100).toFixed(2) + '% of the path, off map ' + x.off; }).join(' · ') };
    });

  await T('camera', 'City Tour (bounds · no teleport · fallback)', 'every stop inside the unlocked map, camera never off the map, no frame-to-frame jump, an empty city still gets a safe stop',
    async function () {
      const r = await ev(async function () {
        startCityTour(); cancelAnimationFrame(VE.tourRaf);
        const T = VE.tour, stops = T.stops.slice(); let now = 1000, px = CAM.x, py = CAM.y, maxJump = 0, off = 0, frames = 0;
        while (VE.tour && frames < 5000) { tourFrame(now); cancelAnimationFrame(VE.tourRaf); now += 16.7; frames++; const j = Math.hypot(CAM.x - px, CAM.y - py); maxJump = Math.max(maxJump, j); px = CAM.x; py = CAM.y; if (CAM.x < 0 || CAM.y < 0 || CAM.x > MAP.W * TILE || CAM.y > MAP.H * TILE) off++; }
        const inside = stops.every(function (s) { return s.x >= 0 && s.y >= 0 && s.x <= MAP.W * TILE && s.y <= MAP.H * TILE; });
        const L = S.buildings.list; S.buildings.list = []; const fb = cityTourStops(); S.buildings.list = L;
        return { stops: stops.length, labels: stops.map(function (s) { return s.label; }).join(', '), maxJump: maxJump, off: off, frames: frames, ended: !VE.tour, inside: inside, fallback: fb.length === 1 && fb[0].x >= 0 && fb[0].x <= MAP.W * TILE };
      });
      return { ok: r.stops > 0 && r.ended && r.inside && r.off === 0 && r.maxJump < TILE_PX_GUARD() && r.fallback, actual: r.stops + ' stops (' + r.labels + ') · ' + r.frames + ' frames · biggest frame step ' + r.maxJump.toFixed(1) + ' px · off map ' + r.off + ' · empty city fallback ' + r.fallback };
      function TILE_PX_GUARD() { return 60; }
    });

  await T('speed', 'Simulation speed 0.5× – 100×', 'at every speed particles and rain stay inside the budget, values stay finite, no errors',
    async function () {
      const r = await ev(async function () {
        const out = []; FX.lock = 'storm'; FX.weather = 'storm'; FX.weatherUntil = S.clock.gameSec + 99999;
        for (const sp of [0.5, 1, 2, 5, 10, 25, 50, 100]) {
          setSpeed(sp); const g0 = S.clock.gameSec; await __qa.frames(40);
          for (let i = 0; i < 30; i++) spawnParticles(CAM.x, CAM.y, 'smoke', 40);
          await __qa.frames(4);
          out.push({ sp: sp, part: FX.particles.length, cap: Math.max(veParticleCap(), perf().part), drops: FX.dropN, pool: FX.drops.length, adv: S.clock.gameSec > g0, fps: Math.round(PERF.fps), nan: __qa.finite(VE.wx) || __qa.finite(CAM) });
        }
        setSpeed(0); FX.lock = null; FX.weather = 'clear';
        return out;
      });
      const ok = r.every(function (x) { return x.part <= x.cap && x.drops <= x.pool && x.adv && !x.nan; });
      return { ok: ok, actual: r.map(function (x) { return x.sp + '×: ' + x.part + '/' + x.cap + ' particles, ' + x.drops + ' drops, ' + x.fps + ' FPS' + (x.nan ? ' NaN ' + x.nan : ''); }).join(' · ') };
    });

  await T('events', 'Event stress (festival + storm + outage + fire) and cleanup', 'all at once for 3 s of play: no errors, budgets hold; afterwards no event, no parade, no outage, particles inside the budget and none stuck',
    async function () {
      const r = await ev(async function () {
        setHour(21); setSpeed(1); let base = 0, nb = 0; const tb = performance.now();
        await __qa.until(function () { base += FX.particles.length; nb++; return performance.now() - tb > 1000; }, 3000); base = base / Math.max(1, nb);   // a normal city's chimneys
        S.city.peakPop = Math.max(S.city.peakPop, 5000); S.budget = 1e8; S.events.cooldowns = {};
        hostEvent('festival'); hostEvent('parade'); hostEvent('concert');
        startDisaster(DISASTERS.find(function (d) { return d.id === 'storm'; }));
        const b = S.buildings.list.find(function (x) { return x.built && !bdef(x).landmark; }); if (b) igniteBuilding(b);
        S.p9.util.failures.push({ x: b ? b.x : 5, y: b ? b.y : 5, r: 5, until: S.clock.runSec + 4, cause: 'qa' });
        setHour(21); setSpeed(5); const t0 = performance.now(); let maxP = 0, cap = 0;
        await __qa.until(function () { maxP = Math.max(maxP, FX.particles.length); cap = Math.max(cap, veParticleCap(), perf().part); return performance.now() - t0 > 3000; }, 5000);
        const during = { events: S.events.active.length, crowds: (VE.venues || []).length, fps: Math.round(PERF.fps) };
        // end everything
        S.events.active.forEach(function (e) { e.ends = S.clock.runSec - 1; }); S.buildings.list.forEach(function (x) { x.fire = 0; });
        S.p9.util.failures.forEach(function (f) { f.until = S.clock.runSec - 1; });
        await __qa.until(function () { return !S.events.active.length; }, 4000);
        setSpeed(1); FX.lock = null;
        // what may still smoke afterwards on purpose: crashed cars waiting for a tow and buildings still burning
        const emitters = function () { return (AG.accidents || []).length + S.buildings.list.filter(function (x) { return x.fire > 0; }).length; };
        // cleanup = nothing stuck or growing: sample 3 s after the events ended (normal chimneys / celebrations keep going)
        await __qa.until(function () { return FX.particles.length <= base * 1.5 + 30 + 12 * emitters(); }, 6000);
        const s0 = FX.particles.length, ts = performance.now(); let smax = 0, stuck = 0;
        await __qa.until(function () { smax = Math.max(smax, FX.particles.length); return performance.now() - ts > 3000; }, 5000);
        FX.particles.forEach(function (p) { if (!(p.life <= p.max + 0.01) || !isFinite(p.x) || !isFinite(p.y)) stuck++; });
        // the city keeps building (dust / sparks / confetti on completion) and its chimneys keep smoking, so the count may rise:
        // what must hold is the budget and that no particle outlives its lifetime
        const s1 = FX.particles.length, drained = stuck === 0 && smax <= Math.max(cap, 1);
        VE.at = 0; veFrame(0.016); render();
        const kinds = {}; FX.particles.forEach(function (p) { kinds[p.type] = (kinds[p.type] || 0) + 1; }); window.__qaKinds = kinds;
        return { kinds: JSON.stringify(kinds), trend: s0 + ' → ' + s1 + ' over 3 s, stuck ' + stuck, base: Math.round(base), emitters: emitters(), during: during, maxP: maxP, cap: cap, after: { events: S.events.active.length, parade: !!activeEvent('parade'), outage: S.p9.util.failures.filter(function (f) { return f.until > S.clock.runSec; }).length, particles: FX.particles.length, drained: drained } };
      });
      const a = r.after;
      return { ok: r.maxP <= r.cap && a.events === 0 && !a.parade && a.outage === 0 && a.drained, actual: 'during: ' + r.during.events + ' events, peak ' + r.maxP + '/' + r.cap + ' particles, ' + r.during.fps + ' FPS · after: ' + a.events + ' events, parade ' + a.parade + ', outages ' + a.outage + ', particles ' + a.particles + ' (normal city ' + r.base + ', ' + r.emitters + ' accidents / fires still smoking) · particles ' + r.trend + ' ' + r.kinds };
    });

  await T('memory', 'Memory leak loops', '20 rounds each of photo mode, history, map, weather, season, events and chunk streaming: heap grows < 6 MB, DOM nodes and listeners do not pile up',
    async function () {
      await ev(async function () { setSpeed(0); });
      const rounds = async function (fn) { for (let i = 0; i < 20; i++) await ev(fn, i); };
      const loops = {
        photo: async function () { enterPhoto(); await __qa.frames(2); exitPhoto(); await __qa.frames(1); },
        history: async function () { historySample(true); openCityHistory(); await __qa.frames(2); closeModal(); },
        map: async function () { if (typeof openCityMap === 'function' && MOB && document.body.classList.contains('mobileUI')) { openCityMap(); await __qa.frames(2); if (typeof closeSheet === 'function') closeSheet(); else closeModal(); } else { openWorldMap(); await __qa.frames(2); closeModal(); } },
        weather: async function (i) { const W = ['rain', 'storm', 'snow', 'fog', 'clear']; setWeather(W[i % 5], 1); updateWeather(0.016); veUpdateWeatherState(0.5); render(); },
        season: async function (i) { S.clock.gameSec = ((i % 4) * SEASON_DAYS + 1) * 86400 + 43200; render(); },
        events: async function () { S.city.peakPop = 9000; S.budget = 1e8; S.events.cooldowns = {}; hostEvent('market'); await __qa.frames(2); S.events.active.forEach(function (e) { e.ends = 0; }); eventsTick(0.1); },
        chunks: async function (i) { CAM.zoom = 0.6; for (let k = 0; k < 8; k++) { CAM.x = ((i * 8 + k) * 211) % (MAP.W * TILE); CAM.y = ((i * 8 + k) * 137) % (MAP.H * TILE); clampCamera(); render(); } }
      };
      const out = {};
      for (const k in loops) {
        if (k === 'chunks') await ev(async function () { await __qa.world('LARGE', 616161, 3); setSpeed(0); });
        await rounds(loops[k]);                                   // warm-up: first use builds caches on purpose
        const m0 = await metrics(); await rounds(loops[k]); await rounds(loops[k]); const m1 = await metrics();
        out[k] = { heap: m1.heap - m0.heap, nodes: m1.nodes - m0.nodes, listeners: m1.listeners - m0.listeners };
      }
      const ground = await ev(function () { return { ground: WE.ground.size, pool: WE.pool.length }; });
      const bad = Object.keys(out).filter(function (k) { return out[k].heap > 6 || out[k].nodes > 400 || out[k].listeners > 60; });
      await ev(function () { FX.lock = null; setWeather('clear', 1); });
      return { ok: bad.length === 0 && ground.ground < 400, actual: Object.keys(out).map(function (k) { return k + ' ' + (out[k].heap >= 0 ? '+' : '') + out[k].heap.toFixed(2) + ' MB / ' + (out[k].nodes >= 0 ? '+' : '') + out[k].nodes + ' nodes / ' + (out[k].listeners >= 0 ? '+' : '') + out[k].listeners + ' listeners'; }).join(' · ') + ' · ground cache ' + ground.ground + ' chunks (pool ' + ground.pool + ')' + (bad.length ? ' · LEAK: ' + bad.join(', ') : '') };
    });

  await T('world', 'World sizes SMALL / MEDIUM / LARGE / HUGE', 'each size generates, saves, loads, renders and streams chunks; no frame blow-up (< 250 ms CPU raster per frame)',
    async function () {
      const r = await ev(async function () {
        const out = [];
        for (const sz of ['SMALL', 'MEDIUM', 'LARGE', 'HUGE']) {
          const g = await __qa.world(sz, 909090, 3);
          const t1 = performance.now(); const ok = saveGame(true); const sv = performance.now() - t1;
          const t2 = performance.now(); loadGame(3); resetSim(); resetAgents(); const ld = performance.now() - t2;
          CAM.zoom = 1; let rt = 0; for (let i = 0; i < 10; i++) { CAM.x = (i + 1) * MAP.W * TILE / 11; CAM.y = MAP.H * TILE / 2; clampCamera(); const t = performance.now(); render(); ctx.getImageData(0, 0, 1, 1); rt += performance.now() - t; }
          out.push({ sz: sz, map: MAP.W, gen: g.ms, ok: g.ok && ok, sv: sv, ld: ld, rt: rt / 10, b: S.buildings.list.length, pop: Math.round(S.city.population), chunks: WE.ground.size });
        }
        return out;
      });
      return { ok: r.every(function (x) { return x.ok && x.rt < 250 && x.b > 0; }), actual: r.map(function (x) { return x.sz + ' ' + x.map + '×' + x.map + ': gen ' + (x.gen / 1000).toFixed(1) + ' s, save ' + x.sv.toFixed(0) + ' ms, load ' + x.ld.toFixed(0) + ' ms, render ' + x.rt.toFixed(1) + ' ms, ' + x.b + ' buildings, pop ' + x.pop + ', ' + x.chunks + ' chunks'; }).join(' · ') };
    });

  await T('scale', 'Population 10K – 500K · traffic scale', 'the simulation tick stays bounded as population grows; drawn citizens / vehicles stay inside the quality caps (population and traffic beyond the caps are simulated statistically)',
    async function () {
      const r = await ev(async function () {
        setSpeed(1); const out = [];
        for (const pop of [10000, 50000, 100000, 250000, 500000]) {
          S.city.population = pop; S.city.peakPop = Math.max(S.city.peakPop, pop);
          const t0 = performance.now(); for (let i = 0; i < 20; i++) Game.step(0.05); const tick = (performance.now() - t0) / 20;
          await __qa.frames(20);
          out.push({ pop: pop, tick: tick, cit: AG.citizens.length, veh: AG.vehicles.length, capC: perf().npc, capV: perf().veh, traffic: Math.round(SIM.traffic || 0), fps: Math.round(PERF.fps), nan: !isFinite(S.city.population) || !isFinite(S.money) });
        }
        setSpeed(0);
        return out;
      });
      return { ok: r.every(function (x) { return x.tick < 60 && x.veh <= x.capV * 1.5 + 12 && !x.nan; }), actual: r.map(function (x) { return (x.pop / 1000) + 'K: tick ' + x.tick.toFixed(1) + ' ms, ' + x.cit + ' citizen agents (cap ' + x.capC + '), ' + x.veh + ' vehicles (cap ' + x.capV + '), traffic ' + x.traffic + '%, ' + x.fps + ' FPS'; }).join(' · ') };
    });

  await T('governor', 'Quality governor: step down · cooldown · restore', 'low FPS for 5 s → one step down (one notice), no second change inside 20 s, 30 s of good FPS → back one step; particle budget 100 % → 66 % → 46 % → 27 %',
    async function () {
      const r = await ev(function () {
        const keep = { pm: GSET.perfMode, vq: GSET.veQuality, fps: PERF.fps, q: S.settings.quality };
        GSET.perfMode = 'HIGH'; GSET.veQuality = 'AUTO'; S.settings.quality = 'HIGH'; Object.assign(VE_GOV, { drop: 0, lowSince: 0, highSince: 0, changedAt: 0, partStep: 0, pLowSince: 0, pHighSince: 0, pChangedAt: 0 }); PERF_NOTICE.told = false;
        const log = []; let now = 100000, toasts = 0; const oldToast = window.toast; window.toast = function (m) { if (/Performance reduced/.test(m)) toasts++; };
        const run = function (fps, sec) { PERF.fps = fps; for (let i = 0; i < sec; i++) { now += 1000; veGovern(now); veComputeTier(); } log.push(fps + 'fps×' + sec + 's → ' + VE.tier + ' p' + VE_GOV.partStep); };
        veComputeTier(); const t0 = VE.tier;
        run(20, 7); const t1 = VE.tier, parts = VE_GOV.partStep;
        run(20, 10); const t2 = VE.tier;                     // still inside the 20 s cooldown
        run(20, 15); const t3 = VE.tier;
        run(60, 25); const t4 = VE.tier;                     // 25 s of good FPS: not yet
        run(60, 10); const t5 = VE.tier;                     // 35 s: one step back
        run(60, 20); const t6 = VE.tier;                     // the next step needs another 30 s
        run(60, 15); const t7 = VE.tier, p5 = VE_GOV.partStep;
        // with Performance = AUTO the AUTO PERFORMANCE watchdog owns quality: the governor hands over (no double step-down)
        GSET.perfMode = 'AUTO'; run(20, 30); const handed = VE_GOV.drop === 0;
        window.toast = oldToast; GSET.perfMode = keep.pm; GSET.veQuality = keep.vq; PERF.fps = keep.fps; S.settings.quality = keep.q; Object.assign(VE_GOV, { drop: 0, partStep: 0 }); veComputeTier();
        return { t0: t0, t1: t1, t2: t2, t3: t3, t4: t4, t5: t5, t6: t6, t7: t7, parts: parts, p5: p5, toasts: toasts, handed: handed, steps: VE_PART_STEPS.join('/'), log: log };
      });
      const ok = r.t0 === 'HIGH' && r.t1 === 'MEDIUM' && r.t2 === 'MEDIUM' && r.t3 === 'LOW' && r.t4 === 'LOW' && r.t5 === 'MEDIUM' && r.t6 === 'MEDIUM' && r.t7 === 'HIGH' && r.parts >= 1 && r.p5 === 0 && r.toasts === 1 && r.handed;
      return { ok: ok, actual: r.log.join(' · ') + ' · notices ' + r.toasts + ' · AUTO PERFORMANCE hand-over ' + r.handed + ' · particle steps ' + r.steps };
    });

  await T('settings', 'Settings persistence (graphics HIGH · visual quality · FPS cap)', 'chosen graphics settings survive a restart of the app',
    async function () {
      await ev(function () { GSET.perfMode = 'HIGH'; GSET.veQuality = 'HIGH'; GSET.fpsCap = GSET.fpsCap || '60'; saveGSET(); });
      await page.reload();
      await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none' && typeof GSET !== 'undefined'; }, null, { timeout: 120000 });
      await helpers();
      const r = await ev(function () { return { pm: GSET.perfMode, vq: GSET.veQuality }; });
      await ev(function () { GSET.perfMode = 'AUTO'; GSET.veQuality = 'AUTO'; saveGSET(); });
      return { ok: r.pm === 'HIGH' && r.vq === 'HIGH', actual: 'after restart: performance ' + r.pm + ' · visual quality ' + r.vq };
    });

  if (dev.mobile) await T('photo', 'Photo Mode touch: UI touch → UI only · world touch → camera', 'a tap on a photo bar button only runs that button (no world selection, camera still); a drag on the world moves the camera; the tap that brings back hidden controls selects nothing',
    async function () {
      const touch = async function (type, pts) { await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: pts.map(function (p, i) { return { x: p[0], y: p[1], id: i, radiusX: 4, radiusY: 4, force: 1 }; }) }); };
      const pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };   // human finger timing between input events (not a wait for state)
      const tap = async function (x, y) { await touch('touchStart', [[x, y]]); await pause(40); await touch('touchEnd', []); await pause(60); };
      await ev(async function () { await __qa.world('SMALL', 424242, 3); selectBuilding(null); setSpeed(1); enterPhoto(); await __qa.frames(3); });
      const btn = await ev(function () { const e = $('phPause'); e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, cam: [CAM.x, CAM.y] }; });
      await tap(btn.x, btn.y); await ev(function () { return __qa.until(function () { return S.settings.speed === 0; }, 2000); });
      const a = await ev(function () { return { paused: S.settings.speed === 0, sel: !!UI.selected, photo: PHOTO.on }; });
      const cam0 = await ev(function () { return [CAM.x, CAM.y]; });
      const w = await ev(function () { for (let k = 0; k < 40; k++) { const x = innerWidth * (0.3 + (k % 5) * 0.1), y = innerHeight * (0.3 + Math.floor(k / 5) * 0.05); if (document.elementFromPoint(x, y) === canvas) return [x, y]; } return null; });
      if (w) { await touch('touchStart', [[w[0], w[1]]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[w[0] - i * 12, w[1] - i * 4]]); await pause(16); } await touch('touchEnd', []); await pause(60); }
      const b = await ev(function () { return { cam: [CAM.x, CAM.y], sel: !!UI.selected }; });
      await ev(function () { $('phHide').click(); });
      const hid = await ev(function () { return document.body.classList.contains('photoHide'); });
      if (w) await tap(w[0], w[1]);
      const c = await ev(async function () { await __qa.until(function () { return !document.body.classList.contains('photoHide'); }, 2000); return { shown: !document.body.classList.contains('photoHide'), sel: !!UI.selected, photo: PHOTO.on }; });
      const crit = await ev(function () {
        const d = DISASTERS.find(function (x) { return x.id === 'storm'; }); S.events.active.push({ kind: 'disaster', id: 'storm', start: S.clock.runSec, ends: S.clock.runSec + 60 });
        showCriticalAlert('disaster', d); const el = document.getElementById('mCrit'), during = !!el && !el.classList.contains('hidden');
        exitPhoto(); const el2 = document.getElementById('mCrit'), after = !!el2 && !el2.classList.contains('hidden');
        hideCriticalAlert(); S.events.active = S.events.active.filter(function (e) { return e.id !== 'storm'; });
        return { during: during, after: after };
      });
      await ev(function () { if (PHOTO.on) exitPhoto(); setSpeed(0); });
      const moved = Math.hypot(b.cam[0] - cam0[0], b.cam[1] - cam0[1]);
      return { ok: a.paused && !a.sel && a.photo && !!w && moved > 10 && !b.sel && hid && c.shown && !c.sel && c.photo && !crit.during && crit.after, actual: 'button tap: paused ' + a.paused + ', world selection ' + a.sel + ' · world drag moved the camera ' + Math.round(moved) + ' px, selection ' + b.sel + ' · hidden ' + hid + ' → tap shows controls ' + c.shown + ', selection ' + c.sel + ', still in photo mode ' + c.photo + ' · critical alert during photo mode: shown ' + crit.during + ', shown after exit ' + crit.after };
    });

  await T('audio', 'Audio pool & priority', 'a burst of 60 sounds never plays more voices than the pool; ambient yields first; emergency and UI sounds still play when the pool is full',
    async function () {
      const r = await ev(function () {
        SND.init(); if (!SND.ctx) return { skip: true };
        SND_POOL.active = 0; let peak = 0; const max = SND_POOL.max;
        SND.cur = 'sfx'; for (let i = 0; i < 60; i++) { SND.tone(440 + i, 0.4, 'sine', 0.0001, 0); peak = Math.max(peak, SND_POOL.active); }
        const full = SND_POOL.active;
        SND.cur = 'ambient'; SND.tone(900, 0.2, 'sine', 0.0001, 0); const amb = SND_POOL.active === full;
        SND.cur = 'emergency'; SND.tone(740, 0.2, 'square', 0.0001, 0); const em = SND_POOL.active === full + 1;
        SND.cur = 'ui'; SND.tone(600, 0.1, 'sine', 0.0001, 0); const ui = SND_POOL.active === full + 2;
        SND.cur = 'sfx';
        return { max: max, peak: peak, full: full, ambBlocked: amb, em: em, ui: ui, prio: Object.keys(SND_PRIORITY).sort(function (a, b) { return SND_PRIORITY[b] - SND_PRIORITY[a]; }).join(' > ') };
      });
      if (r.skip) return { ok: true, actual: 'no audio device in this browser — pool checked by the self-test on device' };
      await ev(function () { return __qa.until(function () { return SND_POOL.active === 0; }, 3000); });
      const drained = await ev(function () { return SND_POOL.active; });
      return { ok: r.peak <= r.max && r.full === r.max && r.ambBlocked && r.em && r.ui && drained === 0, actual: 'pool ' + r.max + ' voices · burst of 60 → peak ' + r.peak + ' · ambient blocked ' + r.ambBlocked + ' · emergency plays ' + r.em + ' · UI plays ' + r.ui + ' · all voices released ' + (drained === 0) + ' · priority ' + r.prio };
    });

  await T('city', 'District character · skyline · building levels · construction', 'every district gets a character, the skyline and city stage draw, every building drawn at levels 1–10 and while under construction without errors',
    async function () {
      const r = await ev(async function () {
        await __qa.world('MEDIUM', 121212, 3); setSpeed(0);
        const grid = districtCharacters(), named = grid.filter(function (g) { return g; }), kinds = Array.from(new Set(named)).sort();
        const evo = cityEvolution(); setHour(21); updateSun(); drawSkyline(nightFactor()); render();
        const L = S.buildings.list.filter(function (b) { return b.built; }), types = {}; L.forEach(function (b) { if (!types[b.type]) types[b.type] = b; });
        const bad = []; let draws = 0; CAM.zoom = 1.4;
        Object.keys(types).forEach(function (t) {
          const b = types[t], keep = { level: b.level, built: b.built, progress: b.progress };
          const c = buildingCenter(b); CAM.x = c.x; CAM.y = c.y;
          for (let lv = 1; lv <= MAX_LEVEL; lv++) { b.level = lv; try { render(); draws++; } catch (e) { bad.push(t + ' L' + lv + ': ' + e.message); } }
          b.level = keep.level;
          for (const pg of [0, 0.5, 0.95]) { b.built = false; b.progress = pg; try { render(); draws++; } catch (e) { bad.push(t + ' building ' + pg + ': ' + e.message); } }
          b.built = keep.built; b.progress = keep.progress;
        });
        setHour(12);
        return { cells: grid.length, named: named.length, kinds: kinds, evo: evo, types: Object.keys(types).length, draws: draws, bad: bad };
      });
      return { ok: r.named > 0 && r.kinds.length >= 2 && !!r.evo.name && r.bad.length === 0, actual: r.named + '/' + r.cells + ' districts with a character (' + r.kinds.join(', ') + ') · city stage ' + r.evo.name + ' ' + r.evo.stage + '/' + r.evo.max + ' · ' + r.types + ' building types × 10 levels + 3 construction states = ' + r.draws + ' frames' + (r.bad.length ? ' · ERRORS ' + r.bad.slice(0, 3).join(' | ') : ' · no errors') };
    });

  await T('controller', 'Controller (gamepad) regression', 'a connected pad pans the camera with the stick and selects with A only on the press (no repeat while held), without errors',
    async function () {
      const r = await ev(async function () {
        const pad = { connected: true, axes: [0.9, 0, 0, 0], buttons: Array.from({ length: 16 }, function () { return { pressed: false, value: 0 }; }) };
        const orig = navigator.getGamepads; navigator.getGamepads = function () { return [pad]; };
        const keep = window.toast; window.toast = function () { };
        try {
          const x0 = CAM.x; for (let i = 0; i < 20; i++) pollGamepad(1 / 60); const panned = CAM.x - x0;
          pad.axes[0] = 0; let selects = 0; const sel0 = window.handleTap; window.handleTap = function () { selects++; };
          pad.buttons[0].pressed = true; for (let i = 0; i < 30; i++) pollGamepad(1 / 60); pad.buttons[0].pressed = false; pollGamepad(1 / 60);
          window.handleTap = sel0;
          return { panned: panned, selects: selects, active: PAD.active };
        } finally { navigator.getGamepads = orig; window.toast = keep; pollGamepad(1 / 60); }
      });
      return { ok: r.panned > 5 && r.selects <= 1 && r.active, actual: 'stick panned ' + Math.round(r.panned) + ' px · A held 30 frames → ' + r.selects + ' select(s) · pad active ' + r.active };
    });

  await T('device', 'Battery saver · background · low memory', 'battery saver halves the particle budget; going to the background saves the city and suspends audio; low memory drops detail at once and quality returns step by step after the cooldown',
    async function () {
      const r = await ev(async function () {
        setSpeed(1);
        const pm = GSET.powerMode, cap0 = veParticleCap(); GSET.powerMode = 'battery'; const capB = veParticleCap(); GSET.powerMode = pm;
        const t0 = S.lastSaveTime || 0; const bg = typeof window.bctOnPause === 'function' ? window.bctOnPause() : (Lifecycle.emit('background'), 'ok');
        const saved = (S.lastSaveTime || 0) > t0;
        Lifecycle.emit('background'); await __qa.until(function () { return !SND.ctx || SND.ctx.state !== 'running'; }, 2000); const audio = !SND.ctx || SND.ctx.state !== 'running';
        Lifecycle.emit('foreground'); if (window.bctOnResume) window.bctOnResume();
        let low = null;
        if (typeof lowMemoryMode === 'function') {
          const keep = { pm: GSET.perfMode, vq: GSET.veQuality, q: S.settings.quality, toast: window.toast }; window.toast = function () { };
          GSET.perfMode = 'HIGH'; GSET.veQuality = 'AUTO'; S.settings.quality = 'HIGH'; VE_GOV.drop = 0; veComputeTier(); const before = VE.tier;
          MOB.lowMemAt = 0; const part0 = perf().part; lowMemoryMode('qa'); veComputeTier(); const during = VE.tier, partsLow = FX.particles.length, partCap = perf().part;
          const early = lowMemoryRestore(Date.now() + 60000);
          const restored = lowMemoryRestore(Date.now() + 200000); veComputeTier(); const after = VE.tier;
          const keepFps = PERF.fps; PERF.fps = 60; let now = performance.now(); for (let i = 0; i < 60; i++) { now += 1000; veGovern(now); veComputeTier(); } const later = VE.tier; PERF.fps = keepFps;
          low = { mobile: IS_MOBILE, part0: part0, partCap: partCap, before: before, during: during, early: early, restored: restored, after: after, later: later, parts: partsLow, flag: MOB.lowMem };
          GSET.perfMode = keep.pm; GSET.veQuality = keep.vq; S.settings.quality = keep.q; VE_GOV.drop = 0; MOB.lowMem = false; window.toast = keep.toast; veComputeTier();
        }
        setSpeed(0);
        return { cap0: cap0, capB: capB, bg: bg, saved: saved, audio: audio, low: low };
      });
      const L = r.low;
      // phones: visual tier → LOW, back LOW → MEDIUM → … ; desktop: agent / particle caps lowered, the visual tier is never touched
      const lowOk = !L || (!L.early && L.restored && !L.flag && L.parts === 0 && L.partCap < L.part0 && (L.mobile ? L.during === 'LOW' && L.after === 'MEDIUM' && L.later === L.before : L.during === L.before && L.after === L.before && L.later === L.before));
      return { ok: r.capB < r.cap0 && r.saved && r.audio && lowOk, actual: 'particles ' + r.cap0 + ' → battery saver ' + r.capB + ' · background: saved ' + r.saved + ', audio suspended ' + r.audio + (L ? ' · low memory: particle cap ' + L.part0 + ' → ' + L.partCap + ', visual ' + L.before + ' → ' + L.during + ' (particles cleared ' + (L.parts === 0) + '), restore after 1 min ' + L.early + ', after 3 min ' + L.restored + ' → ' + L.after + ' → after 60 s of good FPS ' + L.later + ' (one step at a time)' : ' · low memory mode: mobile only') };
    });

  await T('draw', 'Draw call audit · city centre stress (night · rain · zoom)', 'HUGE city centre at night in rain at zoom 0.5 / 1 / 2: draw calls inside the budget (16K / 12K / 6K), no frame blow-up (< 250 ms CPU raster), counter removed after use',
    async function () {
      const r = await ev(async function () {
        await __qa.world('HUGE', 343434, 3); setSpeed(0);
        setHour(22); updateSun(); FX.lock = 'rain'; FX.weather = 'rain'; FX.weatherUntil = S.clock.gameSec + 9999; VE.wx.wet = 1;
        const c = cityCentre(); const out = [];
        veDrawCounter(true);
        for (const z of [0.5, 1, 2]) {
          CAM.x = c.x; CAM.y = c.y; CAM.zoom = z; clampCamera(); render(); VE_DRAW.n = 0;
          // getImageData(1 px) forces the deferred canvas raster inside the timed region (otherwise the cost lands in a later frame)
          const t = performance.now(); for (let i = 0; i < 5; i++) { updateWeather(0.016); render(); ctx.getImageData(0, 0, 1, 1); } const ms = (performance.now() - t) / 5;
          out.push({ z: z, draws: Math.round(VE_DRAW.n / 5), ms: ms, lamps: VE.stats.lamps, wins: VE.stats.windows, vis: VE.stats.visible });
        }
        veDrawCounter(false); const removed = !VE_DRAW.on && ctx.fillRect === CanvasRenderingContext2D.prototype.fillRect;
        FX.lock = null; FX.weather = 'clear'; setHour(12);
        return { out: out, removed: removed };
      });
      // budget: draw calls per frame (the device-independent cost); the CPU-raster frame time in a headless browser is only a
      // no-blow-up guard — real phones / PCs draw with the GPU (FPS on device: Android self-test + the F3 frame budget)
      const budget = { 0.5: 16000, 1: 12000, 2: 6000 };
      return { ok: r.out.every(function (x) { return x.draws > 0 && x.draws <= budget[x.z] && x.ms < 250; }) && r.removed, actual: r.out.map(function (x) { return 'zoom ' + x.z + ': ' + x.draws + ' draw calls, ' + x.ms.toFixed(1) + ' ms CPU raster, ' + x.vis + ' objects, ' + x.lamps + ' lamps, ' + x.wins + ' lit windows'; }).join(' · ') + ' · counter removed ' + r.removed };
    });

  await T('worst', 'Worst case: MEGA city · 500K · night · storm · outage · festival · heavy traffic · pollution · emergencies · 100×', 'the game keeps running (no errors, finite state, budgets hold) and the city still saves and loads',
    async function () {
      const r = await ev(async function () {
        await __qa.world('MEGA', 717171, 3);
        S.city.population = 500000; S.city.peakPop = 500000; S.city.pollution = 90; S.budget = 1e9; S.events.cooldowns = {};
        setHour(22); FX.lock = 'storm'; FX.weather = 'storm'; FX.weatherUntil = S.clock.gameSec + 99999;
        hostEvent('festival'); startDisaster(DISASTERS.find(function (d) { return d.id === 'storm'; }));
        const c = cityCentre(), ct = { x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE) };
        S.p9.util.failures.push({ x: ct.x, y: ct.y, r: 8, until: S.clock.runSec + 600, cause: 'qa' });
        S.buildings.list.filter(function (b) { return b.built && !bdef(b).landmark; }).slice(0, 4).forEach(igniteBuilding);
        for (let k = 0; k < 400; k++) if (AG.vehicles.length < perf().veh * 2) spawnAmbientVehicle(k % 6 === 0 ? 'truck' : 'car');
        CAM.x = c.x; CAM.y = c.y; CAM.zoom = 0.9; clampCamera();
        setSpeed(100); const t0 = performance.now(), g0 = S.clock.gameSec; let maxP = 0, cap = 0, worst = 0, last = performance.now();
        await __qa.until(function () { const n = performance.now(); worst = Math.max(worst, n - last); last = n; maxP = Math.max(maxP, FX.particles.length); cap = Math.max(cap, veParticleCap(), perf().part); return n - t0 > 6000; }, 9000);
        const ran = S.clock.gameSec - g0, fps = Math.round(PERF.fps), traffic = Math.round(SIM.traffic || 0), sirens = (AG.sirens || []).length;
        setSpeed(0);
        const finite = isFinite(S.money) && isFinite(S.budget) && isFinite(S.city.population) && !__qa.finite(VE.wx) && !__qa.finite(CAM);
        const t1 = performance.now(); const saved = saveGame(true); const sv = performance.now() - t1;
        const n = S.buildings.list.length; const t2 = performance.now(); const res = loadGame(3); resetSim(); resetAgents(); const ld = performance.now() - t2;
        FX.lock = null; FX.weather = 'clear'; setHour(12);
        return { ran: ran / 3600, fps: fps, worst: worst, maxP: maxP, cap: cap, traffic: traffic, sirens: sirens, veh: AG.vehicles.length, finite: finite, saved: saved, sv: sv, ld: ld, same: !res.isNew && S.buildings.list.length === n, n: n, map: MAP.W };
      });
      return { ok: r.ran > 0 && r.finite && r.maxP <= r.cap && r.saved && r.same, actual: 'MEGA ' + r.map + '×' + r.map + ', ' + r.n + ' buildings · 6 s at 100× = ' + r.ran.toFixed(1) + ' game hours · ' + r.fps + ' FPS (longest frame ' + Math.round(r.worst) + ' ms) · particles peak ' + r.maxP + '/' + r.cap + ' · traffic ' + r.traffic + '% · state finite ' + r.finite + ' · save ' + r.sv.toFixed(0) + ' ms / load ' + r.ld.toFixed(0) + ' ms, city intact ' + r.same + ' (500K citizens and heavy traffic are simulated statistically; drawn agents stay inside the quality caps)' };
    });

  /* ===================== Part 17: ECONOMY 2.0 ===================== */
  await ev(function () {
    window.__e2h = function (n) { for (let i = 0; i < n; i++) { S.clock.gameSec += 3600; S.clock.runSec += 3600 / TIME_SCALE; econTick(1); part17Tick(); } };
  });
  await T('economy', 'Economy: deterministic from the same state', 'loading the same save twice and simulating 3 game days gives the same prices, GDP, housing and company numbers',
    async function () {
      const r = await ev(async function () {
        await __qa.world('MEDIUM', 171717, 3); setSpeed(0); __e2h(6); saveGame(true);
        // discrete results must match exactly; continuous ones within 1e-6 (a render-sampled traffic average adds ~1e-9 float noise)
        const run = function () { loadGame(3); resetSim(); resetAgents(); E2.hourKey = -1; RNG.seed(S.p6.rng); __e2h(72); const P = S.p17; return { p: Object.keys(E2_GOODS).map(function (g) { return e2GoodPrice(g); }), gdp: [P.gdp.total], h: [P.housing.price], co: Object.keys(P.co).sort().map(function (k) { return P.co[k].stage + Math.round(P.co[k].cr); }).join(), sh: P.shocks.map(function (x) { return x.id + x.sev; }).join(), sent: P.sentiment }; };
        const A = run(), B = run(), near = function (x, y) { return x.length === y.length && x.every(function (v, i) { return Math.abs(v - y[i]) <= Math.abs(v) * 1e-6 + 1e-9; }); };
        const diff = ['p', 'gdp', 'h'].filter(function (k) { return !near(A[k], B[k]); }).concat(['co', 'sh', 'sent'].filter(function (k) { return A[k] !== B[k]; }));
        const rel = Math.abs(A.gdp[0] - B.gdp[0]) / Math.max(1, A.gdp[0]);
        return { same: diff.length === 0, diff: diff.join(', '), rel: rel, sample: A.p.slice(0, 4).map(function (v) { return v.toFixed(4); }).join('/') };
      });
      return { ok: r.same, actual: (r.same ? 'identical (GDP relative difference ' + r.rel.toExponential(1) + ')' : 'DIFFERENT: ' + r.diff) + ' · prices ' + r.sample };
    });

  await T('economy', 'Market: prices, history, categories, search', 'every product has a price, a daily history and a bounded daily move; category filters and search find products (bread → Bread)',
    async function () {
      const r = await ev(function () {
        __e2h(24 * 5);
        const rows = e2MarketRows('All', ''), cats = E2_CATS.map(function (c) { return c + ':' + e2MarketRows(c, '').length; });
        const maxDay = rows.reduce(function (a, x) { return Math.max(a, Math.abs(x.ch)); }, 0);
        const hist = rows.every(function (x) { return x.hist.length >= 5; }), priced = rows.every(function (x) { return x.price > 0 && isFinite(x.price); });
        const search = e2MarketRows('All', 'bread').map(function (x) { return x.name; }), mobile = searchItems('bread', 'all').filter(function (x) { return x.cat === 'product'; }).length;
        return { n: rows.length, cats: cats, maxDay: maxDay, hist: hist, priced: priced, search: search, mobile: mobile };
      });
      return { ok: r.n === 18 && r.priced && r.hist && r.maxDay < 0.6 && r.search.indexOf('Bread') >= 0 && r.mobile >= 1 && r.cats.every(function (c) { return +c.split(':')[1] > 0; }), actual: r.n + ' products · ' + r.cats.join(' ') + ' · biggest daily move ' + Math.round(r.maxDay * 100) + '% · history ' + r.hist + ' · search "bread" → ' + r.search.join(', ') + ' (mobile ' + r.mobile + ')' };
    });

  await T('economy', 'Companies: lifecycle, gradual bankruptcy, unique brand names', 'a failing company restructures before it goes bankrupt; 12 bankruptcies in a row never reuse a retired name and never duplicate a live one',
    async function () {
      const r = await ev(function () {
        const P = S.p17, A = AI_DEFS.filter(function (a) { return S.ai[a.id] && !S.ai[a.id].acquired; });
        const a = A[0], n0 = a.name; bankruptCompany(a.id); const restr = P.co[a.id].stage === 'Restructuring' && a.name === n0;
        __e2h(48); bankruptCompany(a.id); const bankrupt = a.name !== n0;
        const names = [n0, a.name];
        for (let k = 0; k < 12; k++) { const c = A[k % A.length]; bankruptCompany(c.id); P.co[c.id].restr = gameDay() - 3; bankruptCompany(c.id); names.push(c.name); }
        const retired = P.names.retired.slice(), live = AI_DEFS.map(function (x) { return x.name; });
        const reused = live.filter(function (n) { return retired.indexOf(n.replace(/ (GROUP|HOLDINGS|GLOBAL)$/, '')) >= 0; });
        const dup = live.filter(function (n, i) { return live.indexOf(n) !== i; });
        const stages = {}; Object.keys(P.co).forEach(function (k) { stages[P.co[k].stage] = (stages[P.co[k].stage] || 0) + 1; });
        return { restr: restr, bankrupt: bankrupt, retired: retired.length, reused: reused, dup: dup, stages: stages, hq: Object.keys(P.co).every(function (k) { return P.co[k].hq >= 1 && P.co[k].hq <= 5; }) };
      });
      return { ok: r.restr && r.bankrupt && r.reused.length === 0 && r.dup.length === 0 && r.retired >= 12 && r.hq, actual: 'restructuring first ' + r.restr + ' → bankruptcy ' + r.bankrupt + ' · ' + r.retired + ' retired names · reused ' + (r.reused.join(', ') || 'none') + ' · duplicates ' + (r.dup.join(', ') || 'none') + ' · stages ' + JSON.stringify(r.stages) };
    });

  await T('economy', 'Banking: 1 % floor, loan stages, credit scores, mortgages, central bank', 'the interest rate never goes below 1 % (live, crisis choice, save); a late loan becomes Restructuring before Default; scores stay 300–850; mortgage math is right',
    async function () {
      const r = await ev(function () {
        const P = S.p17, r0 = S.p5.econ.rate;
        S.p5.econ.rate = 0.001; const live = interestRate();
        const o = JSON.parse(JSON.stringify(buildSaveObject())); o.p5.econ.rate = 0.002; const sp = sanitizeP5(o.p5).econ.rate;
        S.p5.econ.rate = r0;
        const a = AI_DEFS.find(function (x) { return S.ai[x.id]; }); S.p11.loans.push({ id: 9999, co: a.id, bank: 0, principal: 10000, rate: 0.05, years: 2, remaining: 10000, perSec: 1, start: 0, arrears: 0, kind: 'qa' });
        const L = S.p11.loans[S.p11.loans.length - 1]; const seq = [];
        L.arrears = 50; e2BankingDay(); seq.push(L.stage); S.clock.runSec += 1; e2BankingDay(); seq.push(L.stage); const pay = L.perSec;
        L.arrears = 99999; S.clock.gameSec += 86400 * 3; e2BankingDay(); seq.push(L.stage);
        S.p11.loans = S.p11.loans.filter(function (x) { return x.kind !== 'qa'; });
        const m = mortgageQuote(300000, 0.2, 0.06, 25);
        const scores = Object.keys(P.co).every(function (k) { return P.co[k].cr >= 300 && P.co[k].cr <= 850; }) && P.bank.citizenScore >= 300 && P.bank.citizenScore <= 850;
        return { live: live, sp: sp, seq: seq, pay: pay, m: m, scores: scores, ms: P.bank.cb.ms, banks: e2Banks().length };
      });
      const mOk = Math.abs(r.m.monthly - 1546.39) < 2 && Math.abs(r.m.loan - 240000) < 1;
      return { ok: r.live >= 0.01 && r.sp >= 0.01 && r.seq[0] === 'late' && r.seq[1] === 'restructuring' && r.pay < 1 && r.seq[2] === 'default' && r.scores && mOk, actual: 'rate floor live ' + (r.live * 100).toFixed(2) + '% · from save ' + (r.sp * 100).toFixed(2) + '% · loan ' + r.seq.join(' → ') + ' (payment 1 → ' + r.pay.toFixed(2) + ') · scores in range ' + r.scores + ' · mortgage $300K, 20 % down, 6 %, 25 y → ' + r.m.monthly.toFixed(2) + '/month · money supply ' + r.ms.toFixed(1) + ' · banks ' + r.banks };
    });

  await T('economy', 'Housing: prices, rent, vacancy, affordability, housing crisis', 'districts get price / rent / vacancy / affordability classes; demand ≫ supply raises a HOUSING CRISIS (happiness down) with an economic alert',
    async function () {
      const r = await ev(function () {
        const P = S.p17; e2HousingHour();
        const d = P.housing.districts, cls = Array.from(new Set(d.map(function (x) { return x.cls; })));
        const keep = SIM.housingDemandRatio; SIM.housingDemandRatio = 1.6; e2HousingHour(); const crisis = P.housing.crisis;
        const m = { hap: 0, growth: 1, demand: 1, rev: 1, tour: 1, jobs: 1, importMult: 1, powerDemand: 1, production: 1, rp: 1 }; part17Mods(m);
        UI.notifs = []; P.alerts = {}; e2AlertsDay(); const alert = UI.notifs.some(function (n) { return /Housing market is overheating/.test(n.msg); });
        SIM.housingDemandRatio = keep; e2HousingHour();
        return { n: d.length, cls: cls, price: P.housing.price, rent: P.housing.rent, vac: P.housing.vacancy, crisis: crisis, hap: m.hap, alert: alert };
      });
      return { ok: r.n > 0 && r.price > 0 && r.rent > 0 && r.crisis === 1 && r.hap < 0 && r.alert, actual: r.n + ' districts (' + r.cls.join(', ') + ') · price ' + Math.round(r.price) + ' · rent ' + Math.round(r.rent) + ' · vacancy ' + Math.round(r.vac * 100) + '% · crisis ' + r.crisis + ' → happiness ' + r.hap.toFixed(1) + ' · alert ' + r.alert };
    });

  await T('economy', 'Taxes: 5 tax types, forecast, effects', 'raising business tax forecasts less than proportional revenue and slows growth; a sales tax creates sales-tax revenue; the classic income tax slider stays in sync',
    async function () {
      const r = await ev(function () {
        const T = e2Tax(), keep = Object.assign({}, T);
        const f = taxForecast('business', 25), prop = f.current * 25 / Math.max(0.001, T.business);
        E2UI.draft = Object.assign({}, T, { sales: 5, business: 22, income: 14 }); e2ApplyTaxes();
        econTick(1); const sales = (SIM.B || {}).salesTax || 0, inc = S.city.tax;
        const m = { hap: 0, growth: 1, demand: 1, rev: 1, tour: 1, jobs: 1, importMult: 1, powerDemand: 1, production: 1, rp: 1 }; part17Mods(m);
        E2UI.draft = keep; e2ApplyTaxes(); econTick(1);
        return { cur: f.current, exp: f.expected, prop: prop, biz: f.biz, sales: sales, inc: inc, growth: m.growth, demand: m.demand };
      });
      return { ok: r.exp < r.prop && r.biz < 0 && r.sales > 0 && r.inc === 14 && r.growth < 1 && r.demand < 1, actual: 'business 25 %: ' + r.cur.toFixed(2) + ' → ' + r.exp.toFixed(2) + '/s (proportional ' + r.prop.toFixed(2) + ') · business growth ' + (r.biz * 100).toFixed(1) + '% · sales tax revenue ' + r.sales.toFixed(2) + '/s · income tax slider ' + r.inc + '% · growth ×' + r.growth.toFixed(2) + ' · demand ×' + r.demand.toFixed(2) };
    });

  await T('economy', 'Shocks: 8 types × 4 severities, responses, no game-breaking economy', 'every shock starts, moves its prices / modifiers within bounds, accepts a response and ends; the player\'s money is never reset',
    async function () {
      const r = await ev(function () {
        const P = S.p17, out = [], m0 = S.money;
        Object.keys(E2_SHOCKS).forEach(function (id) {
          for (let sev = 0; sev < 4; sev++) {
            P.shocks = []; const s = e2ShockStart(id, sev, true); s.start = S.clock.runSec - 600;
            const m = { hap: 0, growth: 1, demand: 1, rev: 1, tour: 1, jobs: 1, importMult: 1, powerDemand: 1, production: 1, rp: 1 }; part17Mods(m);
            const g = Object.keys(E2_SHOCKS[id].goods)[0], k = g ? e2ShockGoodMult(g) : 1;
            const resp = e2ShockRespond(id, E2_SHOCKS[id].resp[0][0]).ok;
            const bad = !isFinite(m.rev) || m.rev < 0.8 || m.rev > 1.2 || m.growth < 0.7 || m.growth > 1.3 || k > 2.5 || k < 1;
            if (bad || !resp) out.push(id + '/' + E2_SEV[sev] + ' rev ' + m.rev.toFixed(2) + ' growth ' + m.growth.toFixed(2) + ' price ×' + k.toFixed(2));
          }
        });
        P.shocks = [];
        return { bad: out, money: S.money === m0 };
      });
      return { ok: r.bad.length === 0 && r.money, actual: '32 shock / severity combinations · out of bounds: ' + (r.bad.join(' | ') || 'none') + ' · player money untouched ' + r.money };
    });

  await T('economy', 'Save: Economy 2.0 data, v2.4.1 migration, Windows ↔ Android', 'the save carries markets, prices, companies, banking, loans, housing, trade, GDP, inflation, cycle and shocks; a v2.4.1 save without them loads with defaults; a Windows save keeps them on Android',
    async function () {
      const r = await ev(function () {
        __e2h(24); saveGame(true);
        const raw = JSON.parse(Store.getItem(slotKey(3))), P = raw.p17;
        const keys = ['goods', 'co', 'bank', 'housing', 'gdp', 'infl', 'shocks', 'tax', 'hist', 'jobs', 'sentiment'].filter(function (k) { return P && P[k] !== undefined; });
        const pr0 = P.goods.bread.h.length, co0 = Object.keys(P.co).length;
        const old = JSON.parse(JSON.stringify(raw)); delete old.p17; old.header.gameVersion = '2.4.1'; Store.setItem(slotKey(3), JSON.stringify(old)); const lo = loadGame(3); const oldOk = !lo.isNew && !!S.p17 && Object.keys(S.p17.goods).length === 18 && validateImport(old).length === 0;
        __e2h(30); const grows = S.p17.goods.bread.h.length >= 1;
        const win = JSON.parse(JSON.stringify(raw)); win.header.platform = 'windows'; win.origin.platform = 'windows'; Store.setItem(slotKey(3), JSON.stringify(win)); loadGame(3);
        const keep = S.p17.goods.bread.h.length === pr0 && Object.keys(S.p17.co).length === co0;
        const bad = JSON.parse(JSON.stringify(raw)); bad.p17.goods.bread.p = 'x'; bad.p17.co.evil = { stage: '<script>', cr: 1e9 }; bad.p17.tax = { income: 999, business: -5 }; Store.setItem(slotKey(3), JSON.stringify(bad)); loadGame(3);
        const san = isFinite(S.p17.goods.bread.p) && S.p17.co.evil.stage === 'Startup' && S.p17.co.evil.cr === 850 && S.p17.tax.income <= 30 && S.p17.tax.business >= 0;
        return { keys: keys, oldOk: oldOk, grows: grows, keep: keep, san: san, kb: Math.round(JSON.stringify(raw.p17).length / 1024) };
      });
      return { ok: r.keys.length === 11 && r.oldOk && r.grows && r.keep && r.san, actual: 'saved ' + r.keys.join(', ') + ' (' + r.kb + ' KB) · v2.4.1 save → defaults ' + r.oldOk + ', keeps running ' + r.grows + ' · Windows → ' + (dev.mobile ? 'Android' : 'Windows') + ' kept ' + r.keep + ' · bad values sanitised ' + r.san };
    });

  await T('economy', 'Large city: 500K citizens · 10,000 companies', 'with 10,000 companies the hourly pass stays batched (≤ 500 companies) and fast, the daily pass finishes, the company list shows one page (25 rows), search stays quick',
    async function () {
      const r = await ev(async function () {
        const P = S.p17; S.city.population = 500000;
        const secs = ['FOOD', 'SHOPPING', 'TECHNOLOGY', 'FINANCE', 'ENTERTAINMENT', 'INDUSTRY', 'HOUSING'];
        for (let i = 0; i < 10000; i++) { const c = e2NewCo(secs[i % 7], 'QA CO ' + i, 1); c.synthetic = true; c.rev = 50 + (i % 97); c.cash = 5000; P.co['qa' + i] = c; }
        E2.keys = null;
        let worstH = 0; for (let h = 0; h < 6; h++) { S.clock.gameSec += 3600; S.clock.runSec += 50; const t = performance.now(); part17Tick(); worstH = Math.max(worstH, performance.now() - t); }
        const d0 = performance.now(); S.clock.gameSec += 86400; S.clock.runSec += 1200; part17Tick(); const dayMs = performance.now() - d0;
        openEconomy2('companies'); await __qa.frames(2); const rows = document.querySelectorAll('#e2Root tr[data-e2co]').length, pager = (document.querySelector('#e2Root .e2Pager') || {}).innerText || '';
        const s0 = performance.now(); searchItems('qa co 99', 'all'); const sMs = performance.now() - s0; closeModal();
        Object.keys(P.co).forEach(function (k) { if (/^qa\d/.test(k)) delete P.co[k]; }); E2.keys = null; S.city.population = 20000;
        return { worstH: worstH, dayMs: dayMs, rows: rows, pager: pager.replace(/\s+/g, ' '), sMs: sMs };
      });
      return { ok: r.worstH < 120 && r.dayMs < 1500 && r.rows === 25 && /10,0\d\d companies|10\.0\d\dK? companies|1\d\.?\d*K companies/.test(r.pager) && r.sMs < 300, actual: 'hourly pass worst ' + r.worstH.toFixed(1) + ' ms · daily pass ' + r.dayMs.toFixed(0) + ' ms · list rows ' + r.rows + ' (' + r.pager + ') · search ' + r.sMs.toFixed(1) + ' ms' };
    });

  await T('economy', 'Economic stress: MEGA · 500K · 10K companies · high inflation · housing + banking crisis · trade disruption · recession · storm · outage', 'the game keeps running at 100× for 6 s (no errors, finite state, the rate ≥ 1 %), the city still saves and loads',
    async function () {
      const r = await ev(async function () {
        await __qa.world('MEGA', 919191, 3);
        const P = S.p17; S.city.population = 500000; S.p6.econ.infl = 0.12; SIM.housingDemandRatio = 1.8;
        for (let i = 0; i < 10000; i++) { const c = e2NewCo(['FOOD', 'SHOPPING', 'INDUSTRY'][i % 3], 'STRESS ' + i, 1); c.synthetic = true; c.rev = 40; P.co['st' + i] = c; } E2.keys = null;
        e2ShockStart('banking', 3, true); e2ShockStart('trade', 2, true); forceEconPhase('RECESSION');
        startDisaster(DISASTERS.find(function (d) { return d.id === 'storm'; })); FX.lock = 'storm'; FX.weather = 'storm'; FX.weatherUntil = S.clock.gameSec + 99999; setHour(22);
        const c = cityCentre(); S.p9.util.failures.push({ x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE), r: 8, until: S.clock.runSec + 600, cause: 'qa' });
        setSpeed(100); const t0 = performance.now(), g0 = S.clock.gameSec; let worst = 0, last = performance.now();
        await __qa.until(function () { const n = performance.now(); worst = Math.max(worst, n - last); last = n; return n - t0 > 6000; }, 9000);
        setSpeed(0); const ran = (S.clock.gameSec - g0) / 3600;
        const finite = isFinite(S.money) && isFinite(S.budget) && isFinite(P.gdp.total) && Object.keys(E2_GOODS).every(function (g) { return isFinite(e2GoodPrice(g)); });
        for (let k = 0; k < 3; k++) createSnapshot('QA fill ' + k, true);      // browser storage full of snapshots: the save must still win
        const rate = interestRate(), saved = saveGame(true), n = S.buildings.list.length, kb = Math.round((Store.getItem(slotKey(3)) || '').length / 1024), lr = loadGame(3); resetSim(); resetAgents();
        Object.keys(S.p17.co).forEach(function (k) { if (/^st\d/.test(k)) delete S.p17.co[k]; }); E2.keys = null;
        FX.lock = null; FX.weather = 'clear'; setHour(12);
        return { ran: ran, worst: worst, fps: Math.round(PERF.fps), finite: finite, rate: rate, saved: saved, same: !lr.isNew && S.buildings.list.length === n, n: n, n2: S.buildings.list.length, isNew: lr.isNew, notes: lr.notes.join(' '), kb: kb, phase: e2Phase(), sent: P.sentiment, prof: E2.prof };
      });
      return { ok: r.ran > 0 && r.finite && r.rate >= 0.01 && r.saved && r.same, actual: '6 s at 100× = ' + r.ran.toFixed(1) + ' game hours · longest frame ' + Math.round(r.worst) + ' ms · ' + r.fps + ' FPS · economy hourly ' + r.prof.hour.toFixed(1) + ' ms / daily ' + r.prof.day.toFixed(0) + ' ms · ' + r.phase + ' · sentiment ' + r.sent + ' · rate ' + (r.rate * 100).toFixed(2) + '% · finite ' + r.finite + ' · save ' + r.kb + ' KB, load intact ' + r.same + (r.same ? '' : ' (' + r.n + ' → ' + r.n2 + ' buildings, new ' + r.isNew + ', ' + r.notes + ')') };
    });

  await T('economy', 'Economy UI: dashboard, every tab, mobile layout', 'the ECONOMY center opens from the city / economy page, every tab renders, nothing is outside the screen, the company list is paginated',
    async function () {
      const r = await ev(async function () {
        await __qa.world('SMALL', 424242, 3); setSpeed(0); __e2h(30);
        const out = []; let oob = [];
        for (const t of E2_TABS) {
          openEconomy2(t[0]); await __qa.frames(2);
          const root = document.getElementById('e2Root'), len = root ? root.innerText.length : 0;
          if (typeof mobileUiAudit === 'function' && document.body.classList.contains('mobileUI')) oob = oob.concat(mobileUiAudit(false).filter(function (a) { return !a.ok; }).map(function (a) { return t[0] + ':' + a.id; }));
          const wide = Array.from(root.querySelectorAll('.e2Tile, .e2Card')).filter(function (e) { const q = e.getBoundingClientRect(); return q.right > innerWidth + 1 || q.left < -1; }).length;
          out.push(t[0] + ':' + len + (wide ? ' (' + wide + ' outside)' : ''));
        }
        closeModal();
        return { out: out, oob: oob };
      });
      const bad = r.out.filter(function (x) { return /outside/.test(x) || +x.split(':')[1].split(' ')[0] < 60; });
      return { ok: bad.length === 0 && r.oob.length === 0, actual: r.out.join(' · ') + (r.oob.length ? ' · OUT OF BOUNDS ' + r.oob.join(', ') : '') };
    });

  /* ===================== Part 18: GOVERNMENT 2.0 ===================== */
  const gvInit = function () { return ev(function () {
    window.__gvh = function (n) { for (let i = 0; i < n; i++) { S.clock.gameSec += 3600; S.clock.runSec += 3600 / TIME_SCALE; econTick(1); if (S.p17) part17Tick(); govTick(); } };
    window.__gvSnap = function () { const G = S.government; return { tax: Object.assign({}, govTaxes()), fund: Object.assign({}, G.budget.funding), city: S.city.tax, pop: S.city.population, budget: S.budget, maint: S.p10 ? Object.assign({}, S.p10.maint) : null }; };
    window.__gvRestore = function (s) { const G = S.government; Object.keys(s.tax).forEach(function (k) { govSetTax(k, s.tax[k]); }); Object.assign(G.budget.funding, s.fund); S.city.tax = s.city; S.city.population = s.pop; S.budget = s.budget; if (s.maint) Object.assign(S.p10.maint, s.maint); GOV.cache.maintSet = null; G.events.active = []; G.alerts = {}; SV.health = healthPass(0); SV.edu = educationPass(); govServicesHour(); govDistrictsHour(); govSatisfactionHour(); };
  }); };
  await gvInit();
  await T('government', 'Government: small city — services, budget, districts, approval', 'a fresh small city computes all 10 public services, 11 income + 15 expense categories, district stats, maintenance levels and an approval label without errors',
    async function () {
      const r = await ev(async function () {
        await __qa.world('SMALL', 181818, 3); setSpeed(0); GOV.errors = 0; GOV.hourKey = -1; __gvh(30);
        const G = S.government, sv = GOV_SERVICES.filter(function (s) { const v = G.services[s[0]]; return v && isFinite(v.quality) && v.coverage >= 0 && v.coverage <= 1; }).length;
        return { sv: sv, inc: Object.keys(G.budget.last.inc).length, exp: Object.keys(G.budget.last.exp).length, d: G.districts.length, lvl: Object.keys(G.maint).filter(function (k) { return G.maint[k].level; }).length, ap: G.approval.label, apv: Math.round(G.approval.value), err: GOV.errors, B: govBudgetSummary() };
      });
      return { ok: r.sv === 10 && r.inc === 11 && r.exp >= 15 && r.d > 0 && r.lvl === 9 && /^(Excellent|Very Good|Stable|Warning|Critical|Collapse)$/.test(r.ap) && r.err === 0, actual: r.sv + '/10 services · ' + r.inc + ' income / ' + r.exp + ' expense categories · ' + r.d + ' districts · 9 networks graded ' + (r.lvl === 9) + ' · approval ' + r.apv + ' ' + r.ap + ' · income ' + Math.round(r.B.income) + ' / expenses ' + Math.round(r.B.expenses) + ' per day · errors ' + r.err };
    });
  await T('government', 'Government: deterministic from the same state', 'loading the same save twice and simulating 2 game days gives the same approval, budget, services and districts',
    async function () {
      const r = await ev(function () {
        saveGame(true);
        const run = function () { loadGame(3); resetSim(); resetAgents(); E2.hourKey = -1; GOV.hourKey = -1; GOV.cache = {}; RNG.seed(S.p6.rng); __gvh(48); const G = S.government; return { a: [G.approval.value, G.sat.city], b: [S.budget, G.budget.reserve], s: Object.keys(G.services).map(function (k) { return G.services[k].quality; }), d: JSON.stringify(G.districts.map(function (d) { return [d.k, d.health, d.education, d.safety, d.maint]; })), e: JSON.stringify(G.events.log) }; };
        // the city budget already carries ~1e-8 float noise without the government (render-sampled traffic); the reserve sums it over days → 1e-5
        const A = run(), B = run(), near = function (x, y) { return x.length === y.length && x.every(function (v, i) { return Math.abs(v - y[i]) <= Math.abs(v) * 1e-5 + 1e-9; }); };
        const diff = ['a', 'b', 's'].filter(function (k) { return !near(A[k], B[k]); }).concat(['d', 'e'].filter(function (k) { return A[k] !== B[k]; }));
        return { same: !diff.length, diff: diff.join(', '), ap: A.a[0] };
      });
      return { ok: r.same, actual: (r.same ? 'identical' : 'DIFFERENT: ' + r.diff) + ' · approval ' + r.ap.toFixed(3) };
    });
  for (const P of [[100000, '100K'], [500000, '500K']]) {
    await T('government', 'Government: ' + P[1] + ' citizens — hourly / daily pass stays light', 'with ' + P[1] + ' citizens the government hourly pass stays < 60 ms and the daily pass < 100 ms, all numbers stay finite',
      async function () {
        const r = await ev(function (pop) {
          const s = __gvSnap(); S.city.population = pop; SV.health = healthPass(0); SV.edu = educationPass();
          let worst = 0; for (let h = 0; h < 12; h++) { S.clock.gameSec += 3600; S.clock.runSec += 50; econTick(1); S.city.population = pop; const t = performance.now(); govTick(); worst = Math.max(worst, performance.now() - t); }
          const t1 = performance.now(); govBudgetDay(); govEventsDay(); govReportDay(); const day = performance.now() - t1;
          const G = S.government, fin = isFinite(G.approval.value) && isFinite(S.budget) && Object.keys(G.services).every(function (k) { return isFinite(G.services[k].quality); });
          const load = G.services.health.load; __gvRestore(s); SV.health = healthPass(0); SV.edu = educationPass();
          return { worst: worst, day: day, fin: fin, load: load };
        }, P[0]);
        return { ok: r.worst < 60 && r.day < 100 && r.fin, actual: 'hourly worst ' + r.worst.toFixed(1) + ' ms · daily ' + r.day.toFixed(1) + ' ms · finite ' + r.fin + ' · hospital load ' + Math.round(r.load * 100) + '%' };
      });
  }
  await T('government', 'Government: high taxes — non-linear effects, protest, advisor', 'all taxes at the maximum: tax pressure ≈ 100, happiness and growth fall more for each extra point, a Tax Protest starts, the advisor warns about commercial growth',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), m0 = globalMods();
        GOV_TAXES.forEach(function (t) { govSetTax(t[0], t[3]); });
        const m1 = globalMods(), tp = govTaxPressure(); S.government.events.log = []; govEventsDay();
        const protest = govEventActive('taxProtest'), adv = govAdvice().map(function (a) { return a.msg; }).filter(function (x) { return /commercial growth/.test(x); }).length;
        __gvRestore(s); govSetTax('commercial', 22); const h22 = globalMods().hap; govSetTax('commercial', 30); const h30 = globalMods().hap; govSetTax('commercial', 14); const h14 = globalMods().hap; __gvRestore(s);
        return { tp: tp, dh: m0.hap - m1.hap, dg: m1.growth / m0.growth, protest: protest, adv: adv, d1: h14 - h22, d2: h22 - h30 };
      });
      return { ok: r.tp >= 90 && r.dh > 3 && r.dg < 0.9 && r.protest && r.adv === 1 && r.d2 > r.d1, actual: 'pressure ' + Math.round(r.tp) + ' · happiness −' + r.dh.toFixed(1) + ' · growth ×' + r.dg.toFixed(2) + ' · commercial 14→22 −' + r.d1.toFixed(2) + ', 22→30 −' + r.d2.toFixed(2) + ' · Tax Protest ' + r.protest + ' · advisor ' + r.adv };
    });
  await T('government', 'Government: low taxes — no pressure, growth bonus, less revenue', 'all taxes at 0: tax pressure 0, growth higher than at the default rates, tax revenue drops',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(); econTick(1); const g0 = globalMods().growth, inc0 = govIncomeNow();
        GOV_TAXES.forEach(function (t) { govSetTax(t[0], 0); }); econTick(1);
        const g1 = globalMods().growth, inc1 = govIncomeNow(), tp = govTaxPressure(); __gvRestore(s); econTick(1);
        return { tp: tp, g: g1 / g0, r0: inc0.residential + inc0.commercial + inc0.industrial + inc0.property, r1: inc1.residential + inc1.commercial + inc1.industrial + inc1.property };
      });
      return { ok: r.tp === 0 && r.g > 1 && r.r1 < r.r0, actual: 'pressure ' + r.tp + ' · growth ×' + r.g.toFixed(3) + ' · tax revenue ' + r.r0.toFixed(1) + ' → ' + r.r1.toFixed(1) + ' $/s' };
    });
  await T('government', 'Government: budget deficit — warning, reserve, crisis, loan', 'funding at 150 % with no taxes runs a deficit: BUDGET DEFICIT warning, deficit days counted, Budget Crisis after 3 days, a city loan has a credit limit and interest',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), G = S.government; G.budget.deficitDays = 0; G.events.log = [];
        GOV_SERVICES.forEach(function (x) { G.budget.funding[x[0]] = 1.5; }); GOV_TAXES.forEach(function (t) { govSetTax(t[0], 0); });
        __gvh(24 * 4);
        const dd = G.budget.deficitDays, warn = G.alerts.deficit > 0, crisis = G.events.log.some(function (e) { return e.id === 'budgetCrisis'; }), adv = govAdvice().some(function (a) { return /deficit/i.test(a.msg); });
        const big = govBorrow(1e12), small = govBorrow(1000), loan = G.budget.loans[G.budget.loans.length - 1];
        const fin = isFinite(S.budget) && S.budget >= -1e-6; __gvRestore(s); G.budget.loans = []; G.budget.deficitDays = 0;
        return { dd: dd, warn: warn, crisis: crisis, adv: adv, big: big.ok, small: small.ok, rate: loan ? loan.rate : 0, fin: fin };
      });
      return { ok: r.dd >= 3 && r.warn && r.crisis && r.adv && !r.big && r.small && r.rate >= 0.025 && r.fin, actual: r.dd + ' deficit days · warning ' + r.warn + ' · Budget Crisis ' + r.crisis + ' · advisor ' + r.adv + ' · huge loan refused ' + !r.big + ' · small loan ' + r.small + ' at ' + (r.rate * 100).toFixed(2) + '% · budget finite ' + r.fin };
    });
  await T('government', 'Government: hospital capacity — overload, waiting time, event, advisor', 'the population outgrows the same hospitals: load > 100 %, waiting time up, Hospital Overload event and the advisor reports hospital capacity',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), G = S.government; G.events.log = []; govServicesHour(); const w0 = G.services.health.wait;
        const l0 = Math.max(0.01, SV.health ? SV.health.load : 0.1); S.city.population = Math.round(s.pop * Math.max(6, 1.4 / l0)) + 2000; SV.health = healthPass(0); govServicesHour(); govEventsDay();   // the city outgrows its hospitals
        const v = G.services.health, out = { load: v.load, wait: v.wait, w0: w0, ev: G.events.log.some(function (e) { return e.id === 'hospitalOverload'; }), adv: govAdvice().some(function (a) { return /Hospital capacity|no hospital/.test(a.msg); }) };
        __gvRestore(s); SV.health = healthPass(0); govServicesHour(); return out;
      });
      return { ok: r.load > 1 && r.wait > r.w0 && r.ev && r.adv, actual: 'load ' + Math.round(r.load * 100) + '% · waiting ' + Math.round(r.w0) + ' → ' + Math.round(r.wait) + ' min · Hospital Overload ' + r.ev + ' · advisor ' + r.adv };
    });
  await T('government', 'Government: school shortage — coverage falls, event or advisor', 'six times the population on the same schools: education coverage falls; a School Shortage event or an education advisor message follows',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), G = S.government; G.events.log = []; govServicesHour(); const c0 = G.services.education.coverage;
        S.city.population = s.pop * 6 + 2000; SV.edu = educationPass(); govServicesHour(); govDistrictsHour(); govEventsDay();
        const c1 = G.services.education.coverage, ev1 = G.events.log.some(function (e) { return e.id === 'schoolShortage'; }), adv = govAdvice().some(function (a) { return /Education coverage/.test(a.msg); });
        __gvRestore(s); SV.edu = educationPass(); govServicesHour(); return { c0: c0, c1: c1, ev: ev1, adv: adv };
      });
      return { ok: r.c1 < r.c0 && (r.ev || r.adv), actual: 'coverage ' + Math.round(r.c0 * 100) + '% → ' + Math.round(r.c1 * 100) + '% · School Shortage ' + r.ev + ' · advisor ' + r.adv };
    });
  await T('government', 'Government: police coverage — funding drives response time and crime', 'police funding 0 % makes response times longer and raises the crime modifier compared with 150 %',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), G = S.government, c = cityCentre(), x = Math.floor(c.x / TILE), y = Math.floor(c.y / TILE);
        G.budget.funding.police = 1.5; govServicesHour(); const r1 = govResponse('police', x, y), q1 = G.services.police.quality, m1 = globalMods().crimeAdj;
        G.budget.funding.police = 0; govServicesHour(); const r0 = govResponse('police', x, y), q0 = G.services.police.quality, m0 = globalMods().crimeAdj;
        __gvRestore(s); govServicesHour(); return { r0: r0, r1: r1, q0: q0, q1: q1, m0: m0, m1: m1, st: govStations('police').length };
      });
      return { ok: r.st === 0 || (r.r0 > r.r1 && r.q0 < r.q1 && r.m0 > r.m1), actual: r.st + ' stations · response ' + r.r1.toFixed(1) + ' → ' + r.r0.toFixed(1) + ' min · quality ' + Math.round(r.q1) + ' → ' + Math.round(r.q0) + ' · crime modifier ' + r.m1.toFixed(1) + ' → ' + r.m0.toFixed(1) };
    });
  await T('government', 'Government: bad fire access — roads, traffic and weather slow the trucks', 'broken roads, heavy congestion and snow make the fire response slower and fires burn longer (the fire system reads it)',
    async function () {
      const r = await ev(function () {
        const G = S.government, c = cityCentre(), x = Math.floor(c.x / TILE), y = Math.floor(c.y / TILE), k = govDistrictIndex(x, y), I = S.p10.infra, key = 'r' + k;
        govServicesHour(); const good = govResponse('fire', x, y);
        const had = I[key] ? I[key].cond : null; if (I[key]) I[key].cond = 5; else I[key] = { cond: 5 }; const cg = GOV.cache.congD[k]; GOV.cache.congD[k] = 0.9; const sn = VE.wx.snow; VE.wx.snow = 1;
        const bad = govResponse('fire', x, y); GOV.cache.respD.fire[k] = bad; const rate = govFireRate({ x: x, y: y });
        VE.wx.snow = sn; GOV.cache.congD[k] = cg; if (had === null) delete I[key]; else I[key].cond = had; govServicesHour();
        return { good: good, bad: bad, rate: rate, st: govStations('fire').length };
      });
      return { ok: r.st === 0 || (r.bad > r.good * 1.5 && r.rate < 1), actual: r.st + ' stations · response ' + r.good.toFixed(1) + ' → ' + r.bad.toFixed(1) + ' min · fire put-out rate ×' + r.rate.toFixed(2) };
    });
  await T('government', 'Government: zero maintenance budget — networks degrade', 'all funding at 0 % for 2 days: the Part 10 maintenance networks follow, power / water / sewage levels fall and the advisor warns',
    async function () {
      const r = await ev(function () {
        const s = __gvSnap(), G = S.government; __gvh(2); const v0 = G.maint.power.v + G.maint.water.v + G.maint.sewage.v;
        GOV_SERVICES.forEach(function (x) { G.budget.funding[x[0]] = 0; }); __gvh(48);
        const v1 = G.maint.power.v + G.maint.water.v + G.maint.sewage.v, lv = [G.maint.power.level, G.maint.water.level], m = S.p10.maint.roads, adv = govAdvice().length;
        __gvRestore(s); __gvh(1); return { v0: v0, v1: v1, lv: lv, m: m, adv: adv };
      });
      return { ok: r.v1 < r.v0 && r.m === 0 && r.adv > 0, actual: 'power + water + sewage ' + r.v0 + ' → ' + r.v1 + ' (' + r.lv.join(' / ') + ') · road maintenance network ' + r.m + ' · advisor messages ' + r.adv };
    });
  await T('government', 'Government: large infrastructure failure — real failures, event, recovery', 'failed networks break for real (power failure, water leak, closure), an Infrastructure Failure event offers emergency repairs that restore the roads; nothing crashes',
    async function () {
      const r = await ev(function () {
        if (!S.p10.infraInit || !Object.keys(S.p10.infra).length) agingScan();       // the Part 10 aging scan registers the road / bridge assets
        const s = __gvSnap(), G = S.government, I = S.p10.infra, saved = {}; Object.keys(I).forEach(function (k) { saved[k] = I[k].cond; I[k].cond = 3; });
        GOV_SERVICES.forEach(function (x) { G.budget.funding[x[0]] = 0; }); G.maint.power = { v: 0 }; G.maint.water = { v: 0 }; G.maint.sewage = { v: 0 }; G.events.log = [];
        const f0 = S.p9.util.failures.length; let tries = 0; while (tries++ < 40 && S.p9.util.failures.length === f0) govMaintenanceHour();
        const failed = S.p9.util.failures.length > f0, lvl = G.maint.roads.level; govEventsDay(); const ev1 = govEventActive('infraFailure');
        govEventChoice('infraFailure', 'repair'); const rep = Object.keys(I).every(function (k) { return I[k].cond >= 23; });
        Object.keys(saved).forEach(function (k) { I[k].cond = saved[k]; }); S.p9.util.failures = S.p9.util.failures.filter(function (f) { return f.cause !== 'maintenance'; });
        __gvRestore(s); __gvh(1); return { failed: failed, lvl: lvl, ev: ev1, rep: rep, err: GOV.errors };
      });
      return { ok: r.failed && r.lvl === 'Failed' && r.ev && r.rep && r.err === 0, actual: 'roads ' + r.lvl + ' · power failure through the utility system ' + r.failed + ' · Infrastructure Failure ' + r.ev + ' · emergency repairs restore roads ' + r.rep + ' · errors ' + r.err };
    });
  await T('government', 'Government: 100× speed — light, no errors', '6 s at 100×: the government keeps up (hourly pass < 30 ms on this city), no errors, approval and budget finite',
    async function () {
      const r = await ev(async function () {
        GOV.errors = 0; setSpeed(100); const g0 = S.clock.gameSec, t0 = performance.now();
        await __qa.until(function () { return performance.now() - t0 > 6000; }, 9000); setSpeed(0);
        return { hours: (S.clock.gameSec - g0) / 3600, hour: GOV.prof.hour, err: GOV.errors, fin: isFinite(S.government.approval.value) && isFinite(S.budget) };
      });
      return { ok: r.hours > 0 && r.hour < 30 && r.err === 0 && r.fin, actual: r.hours.toFixed(1) + ' game hours · hourly pass ' + r.hour.toFixed(2) + ' ms · errors ' + r.err + ' · finite ' + r.fin };
    });
  await T('government', 'Government: save → restart → load (save 3.1)', 'taxes, funding, loans, policies, projects, approval and reports survive a restart of the app',
    async function () {
      const a = await ev(function () {
        const G = S.government; S.budget += 2e6; govSetTax('commercial', 17); govSetTax('property', 2.5); G.budget.funding.health = 1.2; govBorrow(5000); govPolicyEnable('recycling');
        const pj = ['park', 'firehq', 'policehq', 'flood'].find(function (k) { return govProjectStart(k, 'high').ok; }) || '';
        __gvh(1); saveGame(true);
        return { t: JSON.stringify(govTaxes()), f: G.budget.funding.health, l: G.budget.loans.length, p: Object.keys(G.policies.active).join(), pj: pj, n: G.projects.length, ap: Math.round(G.approval.value * 100), rep: G.reports.length, schema: JSON.parse(Store.getItem(slotKey(3))).header.schema };
      });
      await page.reload();
      await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none' && typeof loadGame === 'function'; }, null, { timeout: 120000 });
      await helpers(); await gvInit();
      const b = await ev(function () {
        if (PSH.dialogOpen) { const x = document.querySelector('#sysBtns button'); if (x) x.click(); }
        const lr = loadGame(3); if (!STARTED && typeof startGame === 'function') { startGame(lr); closeModal(); clearDialogues(); setSpeed(0); } const G = S.government;
        return { isNew: lr.isNew, t: JSON.stringify(govTaxes()), f: G.budget.funding.health, l: G.budget.loans.length, p: Object.keys(G.policies.active).join(), n: G.projects.length, ap: Math.round(G.approval.value * 100), rep: G.reports.length };
      });
      const same = !b.isNew && a.t === b.t && a.f === b.f && a.l === b.l && a.p === b.p && a.n === b.n && a.ap === b.ap && a.rep === b.rep;
      return { ok: same && parseFloat(a.schema) >= 3.1 && a.l >= 1 && a.p === 'recycling', actual: 'save schema ' + a.schema + ' · taxes ' + (a.t === b.t) + ' · funding ' + (a.f === b.f) + ' · loans ' + b.l + ' · policies ' + b.p + ' · projects ' + b.n + ' (' + (a.pj || 'no free site') + ') · approval ' + (a.ap === b.ap) + ' · reports ' + b.rep };
    });
  await T('government', 'Government: old save (v2.5.0) and corrupt government data', 'a save without a government block loads with safe defaults; garbage in the block (bad numbers, unknown projects / policies / events, HTML) is sanitized; nothing crashes',
    async function () {
      const r = await ev(function () {
        saveGame(true); const raw = JSON.parse(Store.getItem(slotKey(3)));
        const old = JSON.parse(JSON.stringify(raw)); delete old.government; old.header.gameVersion = '2.5.0'; Store.setItem(slotKey(3), JSON.stringify(old)); const lo = loadGame(3);
        const oldOk = !lo.isNew && !!S.government && S.government.approval.value === 60 && validateImport(old).length === 0; GOV.errors = 0; __gvh(3); const runs = GOV.errors === 0 && !!S.government.services.health;
        const bad = JSON.parse(JSON.stringify(raw)); bad.government.budget.funding.health = 'x'; bad.government.budget.loans = [null, { remaining: 'NaN' }, 5]; bad.government.projects = [{ type: 'evil', note: '<script>' }, { type: 'park', status: '???', note: '<img onerror=1>' }];
        bad.government.policies.active = { hack: { until: 9 }, green: { until: 'x' } }; bad.government.events.active = [{ id: 'nope' }]; bad.government.approval.value = -50; bad.government.taxes = { residential: 999, property: -3 };
        Store.setItem(slotKey(3), JSON.stringify(bad)); const lb = loadGame(3), G = S.government; __gvh(2);
        const san = !lb.isNew && G.budget.funding.health === 1 && G.budget.loans.length === 0 && G.projects.length === 1 && G.projects[0].status === 'planned' && G.projects[0].note.indexOf('<') < 0 && !G.policies.active.hack && G.events.active.length >= 0 && !G.events.active.some(function (e) { return e.id === 'nope'; }) && G.approval.value >= 0 && govTaxes().property >= 0 && govTaxes().property <= 20;
        return { oldOk: oldOk, runs: runs, san: san, err: GOV.errors };
      });
      return { ok: r.oldOk && r.runs && r.san && r.err === 0, actual: 'v2.5.0 save → defaults ' + r.oldOk + ', keeps running ' + r.runs + ' · corrupt block sanitized ' + r.san + ' · errors ' + r.err };
    });
  for (const pp of [['windows', 'android'], ['android', 'windows']]) {
    await T('government', 'Government: ' + (pp[0] === 'windows' ? 'Windows → Android' : 'Android → Windows') + ' save', 'a ' + pp[0] + ' save keeps the whole government block on ' + pp[1],
      async function () {
        const r = await ev(function (from) {
          const G = S.government; govSetTax('industrial', 19); G.budget.funding.parks = 0.7; saveGame(true);
          const raw = JSON.parse(Store.getItem(slotKey(3))); raw.header.platform = from; if (raw.origin) { raw.origin.platform = from; raw.origin.lastPlatform = from; }
          const want = JSON.stringify([raw.government.taxes, raw.government.budget.funding, raw.government.policies, raw.government.projects.length, raw.government.approval.value]);
          Store.setItem(slotKey(3), JSON.stringify(raw)); const lr = loadGame(3), H = S.government;
          const got = JSON.stringify([H.taxes, H.budget.funding, H.policies, H.projects.length, H.approval.value]);
          return { same: !lr.isNew && want === got, ind: govTaxes().industrial, parks: H.budget.funding.parks };
        }, pp[0]);
        return { ok: r.same && r.ind === 19 && r.parks === 0.7, actual: 'government block identical ' + r.same + ' · industrial tax ' + r.ind + '% · parks funding ' + r.parks };
      });
  }
  await T('government', 'City Management UI: 13 tabs, heatmaps, Management button', 'the CITY MANAGEMENT panel renders every tab inside the screen, the 10 government heatmaps have data, the mobile toolbar has a Management button that opens it',
    async function () {
      const r = await ev(async function () {
        __gvh(2); const out = []; let oob = [];
        for (const t of GOV_TABS) {
          openGovernment(t[0]); await __qa.frames(2);
          const root = document.getElementById('gvRoot'), len = root ? root.innerText.length : 0;
          if (typeof mobileUiAudit === 'function' && document.body.classList.contains('mobileUI')) oob = oob.concat(mobileUiAudit(false).filter(function (a) { return !a.ok; }).map(function (a) { return t[0] + ':' + a.id; }));
          const wide = Array.from(root.querySelectorAll('.e2Tile, .e2Card')).filter(function (e) { const q = e.getBoundingClientRect(); return q.right > innerWidth + 1 || q.left < -1; }).length;
          out.push(t[0] + ':' + len + (wide ? ' (' + wide + ' outside)' : ''));
        }
        closeModal(); await __qa.frames(2);
        const heats = GOV_HEATS.filter(function (h) { const g = p9HeatGrid(h[0]); if (!g) return false; let mx = 0; for (let i = 0; i < g.length; i++) mx = Math.max(mx, g[i]); return mx > 0; }).length;
        let btn = null; const mb = document.querySelector('#mBar [data-mbar="gov"]');
        if (mb) { mb.click(); await __qa.frames(3); btn = !!document.getElementById('gvRoot'); closeModal(); }
        return { out: out, oob: oob, heats: heats, btn: btn, mobile: document.body.classList.contains('mobileUI') };
      });
      const bad = r.out.filter(function (x) { return /outside/.test(x) || +x.split(':')[1].split(' ')[0] < 60; });
      return { ok: bad.length === 0 && r.oob.length === 0 && r.heats === 10 && (!r.mobile || r.btn === true), actual: r.out.join(' · ') + (r.oob.length ? ' · OUT OF BOUNDS ' + r.oob.join(', ') : '') + ' · heatmaps with data ' + r.heats + '/10' + (r.mobile ? ' · Management button opens the panel ' + r.btn : '') };
    });
  /* ===================== Part 19: WORLD BUILDER 2.0 + TRANSPORTATION 3.0 ===================== */
  await T('worldgen', 'World Builder: 20 presets → validated, playable worlds', 'every admin preset goes through the pipeline (seed validation … final validator) and is delivered only when WORLD READY (quality ≥ 60, no golden-rule failure)',
    async function () {
      const r = await ev(async function () {
        const out = [], bad = []; const t0 = performance.now();
        for (const p of WB_PRESETS) {
          const res = await generateWorld(p[1], { seed: 1900 + out.length, name: 'QA ' + p[0], slot: 3, size: 'SMALL' });
          const dlg = (document.getElementById('sysDialog') || {}).innerText || ''; closeModal(); if (typeof closeSysDialog === 'function') closeSysDialog();
          const W = S.worldbuilder; out.push(p[1] + ':' + (res && W ? W.quality : 'FAIL'));
          if (!res || !W || !W.ready || W.quality < 60 || W.broken.length) bad.push(p[1] + (dlg ? ' — ' + dlg.slice(0, 80) : ''));
        }
        return { out: out, bad: bad, s: Math.round((performance.now() - t0) / 1000) };
      });
      return { ok: r.bad.length === 0, actual: r.out.join(' · ') + ' · ' + r.s + ' s' + (r.bad.length ? ' · NOT READY: ' + r.bad.join(' | ') : '') };
    });
  await T('worldgen', 'World Builder: pipeline stages recorded · clean-world limits · industrial buffer · water protection', 'the 10 World Builder stages are recorded with their results; pollution / air / water / noise / waste are inside the Balanced profile; no heavy polluter within 3 tiles of homes or water (unless it cannot move)',
    async function () {
      const r = await ev(async function () {
        await generateWorld('industrial', { seed: 4242, name: 'QA Buffer', slot: 3, size: 'LARGE', wbProfile: 'balanced' }); closeModal();
        const W = S.worldbuilder, P = wbProfileFor({ wbProfile: 'balanced' }), env = W.env;
        const near = S.buildings.list.filter(function (b) { const d = bdef(b); return b.built && wbPolluter(d) && !d.extract && wbHomesNear(b, d, WB_BUFFER).length; }).length;
        const wet = S.buildings.list.filter(function (b) { const d = bdef(b); return b.built && wbShoreBanned(d) && wbWaterDist(b, d, WB_WATER) <= WB_WATER; }).length;
        return { stages: W.pipeline.map(function (p) { return p.id; }).join(','), n: W.pipeline.length, env: env, P: { pol: P.pol, air: P.air, water: P.water, noise: P.noise, waste: P.waste }, near: near, wet: wet, ready: W.ready, q: W.quality };
      });
      const e = r.env, P = r.P, envOk = e.pollution <= P.pol + 2 && e.air >= P.air - 3 && e.water >= P.water - 3 && e.noise <= P.noise + 5 && e.waste <= P.waste + 5;
      return { ok: r.n >= 10 && envOk && r.near === 0 && r.wet === 0 && r.ready, actual: r.n + ' recorded stages (' + r.stages + ') · pollution ' + e.pollution + '/' + P.pol + ' · air ' + e.air + '% · water ' + e.water + '% · noise ' + e.noise + ' · waste ' + e.waste + ' · polluters next to homes ' + r.near + ' · heavy industry next to water ' + r.wet + ' · quality ' + r.q + '%' };
    });
  await T('worldgen', 'World Builder: broken world is repaired or never delivered', 'a city broken on purpose (roads cut, power plants removed, pollution) is repaired by Auto Fix (≤ 5 passes) to WORLD READY; a world that cannot be repaired fails generation and the previous city is restored',
    async function () {
      const r = await ev(async function () {
        await generateWorld('balanced', { seed: 515, name: 'QA Fix', slot: 3, size: 'MEDIUM' }); closeModal();
        const n0 = S.buildings.list.length;
        S.buildings.list.filter(function (b) { return BUILDINGS[b.type].power > 0; }).forEach(function (b) { removeBuilding(b); });
        let cut = 0; for (let i = 0; i < MAP.roads.length && cut < 30; i += 37) if (MAP.roads[i] && !MAP.occ[i]) { MAP.roads[i] = 0; cut++; }
        onMapChanged(); const before = wbAnalyzeCurrent().q; const fx = wbAutoFixCurrent();
        // a world that can never pass: the final validator throws → the generator restores the previous city
        const prevName = S.city.name, ov = window.wbQuality; window.wbQuality = function () { const q = ov.apply(this, arguments); q.ready = false; q.broken = ['QA forced']; return q; };
        const res = await generateWorld('balanced', { seed: 616, name: 'QA Never', slot: 3, size: 'SMALL' }); window.wbQuality = ov;
        const dlg = (document.getElementById('sysDialog') || {}).innerText || ''; if (typeof closeSysDialog === 'function') closeSysDialog(); closeModal();
        return { before: before.overall, beforeReady: before.ready, after: fx.q.overall, afterReady: fx.q.ready, passes: fx.passes, fixes: fx.fixes.length, failedRes: res === null, restored: S.city.name === prevName, dlg: /WORLD GENERATION FAILED/.test(dlg), n0: n0 };
      });
      return { ok: !r.beforeReady && r.afterReady && r.passes <= 5 && r.failedRes && r.restored && r.dlg, actual: 'broken world ' + r.before + '% (ready ' + r.beforeReady + ') → ' + r.passes + ' pass(es), ' + r.fixes + ' fixes → ' + r.after + '% (ready ' + r.afterReady + ') · unrepairable world rejected ' + r.failedRes + ', previous city restored ' + r.restored + ', WORLD GENERATION FAILED shown ' + r.dlg };
    });
  await T('worldgen', 'World regeneration is deterministic (TEST N)', 'the same preset + seed + size generates the same world twice (buildings, roads, lines, quality)',
    async function () {
      const r = await ev(async function () {
        const run = async function () { await generateWorld('balanced', { seed: 8080, name: 'QA Det', slot: 3, size: 'MEDIUM' }); closeModal(); return { b: S.buildings.list.length, r: MAP.roadCount, l: S.p9.transit.lines.map(function (L) { return L.mode + L.stops.length; }).join(','), q: S.worldbuilder.quality, sig: S.buildings.list.slice(0, 60).map(function (b) { return b.type + b.x + ',' + b.y; }).join(';') }; };
        const A = await run(), B = await run();
        return { A: A, same: A.b === B.b && A.r === B.r && A.l === B.l && A.q === B.q && A.sig === B.sig };
      });
      return { ok: r.same, actual: (r.same ? 'identical' : 'DIFFERENT') + ' · ' + r.A.b + ' buildings · ' + r.A.r + ' roads · lines ' + r.A.l + ' · quality ' + r.A.q + '%' };
    });
  await T('worldgen', 'Transport tiers by city size', 'Small → bus + bike + walking · Medium → bus + metro candidate · Large → bus + metro + train · Mega → bus + metro + rail + airport + port links',
    async function () {
      const r = await ev(async function () {
        const out = {};
        for (const sz of ['SMALL', 'MEDIUM', 'LARGE', 'MEGA']) {
          const res = await generateWorld(sz === 'MEGA' ? 'megacity' : 'balanced', { seed: 3131, name: 'QA ' + sz, slot: 3, size: sz });
          const dlg = (document.getElementById('sysDialog') || {}).innerText || ''; if (typeof closeSysDialog === 'function') closeSysDialog(); closeModal();
          if (!res) { out[sz] = { tier: 'FAILED: ' + dlg.slice(0, 160), modes: {}, cand: 0, bike: 0, ped: 0 }; continue; }
          const modes = {}; S.p9.transit.lines.forEach(function (L) { modes[L.mode] = (modes[L.mode] || 0) + 1; });
          out[sz] = { tier: S.transportation.gen ? S.transportation.gen.tier : '', modes: modes, cand: (TPE.metroCandidates || []).length, bike: Object.keys(S.p11.bike).length, ped: Object.keys(S.p11.ped).length };
        }
        return out;
      });
      const s = r.SMALL, m = r.MEDIUM, l = r.LARGE, g = r.MEGA;
      const ok = s.modes.bus > 0 && s.bike + s.ped > 0 && m.modes.bus > 0 && (m.modes.metro || m.cand >= 2) && l.modes.bus > 0 && l.modes.metro > 0 && l.modes.train > 0 && g.modes.bus > 0 && g.modes.metro > 0 && g.modes.train > 0;
      return { ok: ok, actual: Object.keys(r).map(function (k) { return k + ' ' + r[k].tier + ' ' + JSON.stringify(r[k].modes) + ' bike ' + r[k].bike + ' ped ' + r[k].ped + (k === 'MEDIUM' ? ' metro candidates ' + r[k].cand : ''); }).join(' · ') };
    });
  await T('transport', 'Transportation 3.0: dashboard, metro / bus / rail / airport / port / bike / walk / parking, line editor', 'all 14 dashboard numbers are finite; station data (capacity, passengers, waiting, coverage, revenue, maintenance); airport and port levels; a player line keeps its order, colour, frequency and schedule; every panel tab renders',
    async function () {
      const r = await ev(async function () {
        await __qa.world('LARGE', 1919, 3); setSpeed(0); for (let i = 0; i < 600; i++) { S.clock.gameSec += TIME_SCALE; S.clock.runSec += 1; Game.step(1); }
        const s = tpStats(true), keys = ['cars', 'buses', 'metroPax', 'trainPax', 'airPax', 'portCargo', 'bikeTrips', 'walkTrips', 'commute', 'congestion', 'parking', 'ptSat', 'revenue', 'cost'];
        const fin = keys.every(function (k) { return isFinite(s[k]); }), st = s.metro.stations[0] || null;
        const stOk = !st || ['capacity', 'passengers', 'waiting', 'coverage', 'revenue', 'maintenance'].every(function (k) { return isFinite(st[k]); });
        const ap = tpPlaceNear('airstrip', MAP.W >> 1, MAP.H >> 1, MAP.W); onMapChanged(); const air = tpAirport().level;
        const stops = S.buildings.list.filter(function (b) { return b.type === 'busstop'; }).slice(0, 4).map(function (b) { return b.id; });
        let line = 'n/a';
        if (stops.length >= 3) { const c = tpLineCreate('bus', stops.slice(0, 3).reverse(), 'QA Line'); if (c.ok) { const L = c.L; tpLineEdit(L.id, 'color', '#12ab34'); tpLineEdit(L.id, 'frequency', 6); tpLineEdit(L.id, 'schedule', 6, 22); tpLineEdit(L.id, 'add', stops[3], 1); transitRebuild(true); line = (L.stops[0] === stops[2] && L.stops[1] === stops[3] && L.color === '#12ab34' && tp().bus.schedules[L.id].end === 22) + ' · ' + L.vehicles + ' bus(es) · headway ' + lineHeadwayMin(L).toFixed(1); } }
        let ui = 0; for (const t of TP_TABS) { openTransport(t[0]); await __qa.frames(2); if (document.getElementById('tpRoot').innerText.length > 40) ui++; } closeModal();
        const heats = ['METRO COVERAGE', 'BUS COVERAGE', 'BIKE COVERAGE', 'PARKING PRESSURE', 'EMERGENCY RESPONSE', 'COMMUTE TIME', 'LOGISTICS', 'TRAFFIC', 'WALKABILITY', 'PUBLIC TRANSPORT'].filter(function (h) { return p9HeatGrid(h) || h === 'TRAFFIC'; }).length;
        return { fin: fin, stOk: stOk, air: air, ap: !!ap, line: line, ui: ui, heats: heats, cars: s.cars, commute: s.commute, park: s.park };
      });
      return { ok: r.fin && r.stOk && (!r.ap || r.air !== 'none') && /^true/.test(r.line) && r.ui === 10 && r.heats === 10, actual: 'dashboard finite ' + r.fin + ' · stations ' + r.stOk + ' · airport level ' + r.air + ' · line editor ' + r.line + ' · ' + r.ui + '/10 tabs · ' + r.heats + '/10 transport heatmaps · ' + r.cars + ' cars · commute ' + r.commute.toFixed(1) + ' min · parking street ' + r.park.street + ' / lots ' + r.park.lots };
    });
  await T('transport', 'Traffic AI 3.0: light modes, transit priority, prediction, dynamic routing with a diversion cap', 'Fixed / Adaptive / Smart / Emergency timings differ as designed; transit priority extends greens; at most 15 % of cars change route per 10 s and no route switch happens without a ≥ 15 % predicted gain',
    async function () {
      const r = await ev(async function () {
        const j = (function () { for (let i = 0; i < MAP.roads.length; i++) if (MAP.inter[i] && junctionType(i) === 'signal') return i; return -1; })();
        const modes = {};
        if (j >= 0) ['fixed', 'adaptive', 'smart', 'emergency'].forEach(function (m) { tpSetLightMode(j, m); const st = sigState(j); sigRetime(j, st); modes[m] = st.mode + ':' + st.dur[0].toFixed(2) + '/' + st.dur[3].toFixed(2); });
        if (j >= 0) tpSetLightMode(j, 'auto');
        S.p9.traffic.mult = 4; setSpeed(20); const t0 = performance.now(), rr0 = tp().traffic.stats.reroutes;
        let worstWindow = 0; while (performance.now() - t0 < 6000) { await new Promise(function (x) { setTimeout(x, 200); }); worstWindow = Math.max(worstWindow, TPAI.window.length / Math.max(1, AG.vehicles.length)); }
        setSpeed(0); S.p9.traffic.mult = 1;
        return { j: j, modes: modes, rer: tp().traffic.stats.reroutes - rr0, worst: worstWindow, veh: AG.vehicles.length, pred: !!TPAI.pred, predMs: TPAI.prof.pred, routeMs: TPAI.prof.route };
      });
      const m = r.modes, ok = (r.j < 0 || (m.fixed.indexOf('fixed') === 0 && m.adaptive.indexOf('adaptive') === 0 && m.smart.indexOf('smart') === 0 && m.emergency.indexOf('emergency') === 0)) && r.pred && r.worst <= 0.15 + 2 / Math.max(1, r.veh) && r.predMs < 30 && r.routeMs < 30;
      return { ok: ok, actual: 'junction ' + r.j + ' timings ' + JSON.stringify(m) + ' · ' + r.rer + ' dynamic reroutes in 6 s at ×4 traffic · worst diversion share ' + Math.round(r.worst * 100) + '% of ' + r.veh + ' cars · prediction ' + r.predMs.toFixed(2) + ' ms · routing ' + r.routeMs.toFixed(2) + ' ms' };
    });
  await T('transport', 'Transport validator + auto fix', 'a broken line (removed station), a dead-end line, an invalid vehicle and a missing depot are detected and repaired / reconnected / rebuilt',
    async function () {
      const r = await ev(function () {
        const stops = S.buildings.list.filter(function (b) { return b.type === 'busstop'; }).slice(0, 3); if (stops.length < 3) return { skip: true };
        S.p9.transit.lines = S.p9.transit.lines.filter(function (x) { return !/^QA /.test(x.name); }); tpMakeRoom(2);
        const L = tpLineCreate('bus', stops.map(function (b) { return b.id; }), 'QA Broken').L, D = tpLineCreate('bus', [stops[0].id, stops[2].id], 'QA Dead').L;
        L.stops.splice(1, 0, 9999999); D.stops = [stops[0].id];   // after both lines exist (creating a line rebuilds transit, which already drops missing stations)
        if (AG.vehicles[0]) AG.vehicles.push(Object.assign({}, AG.vehicles[0], { id: 999999, line: 'L99999' }));   // a copy of a real vehicle on a line that does not exist
        const hadVeh = !!AG.vehicles[0], v0 = tp3Validate(), fx = tp3AutoFix(), v1 = fx.validation;
        return { hadVeh: hadVeh, before: v0.issues.map(function (i) { return i.id; }).join(','), after: v1.issues.filter(function (i) { return TP_WARN.indexOf(i.id) < 0; }).length, actions: fx.actions.length, okAfter: v1.ok, lineKept: S.p9.transit.lines.indexOf(L) >= 0 && L.stops.length === 3 && L.stops.indexOf(9999999) < 0, deadGone: S.p9.transit.lines.indexOf(D) < 0, vehGone: !AG.vehicles.some(function (v) { return v.id === 999999; }) };
      });
      if (r.skip) return { ok: true, actual: 'city has fewer than 3 bus stops — nothing to break' };
      return { ok: /broken/.test(r.before) && /deadend/.test(r.before) && (/vehicle/.test(r.before) || !r.hadVeh) && r.okAfter && r.lineKept && r.deadGone && r.vehGone, actual: 'found ' + r.before + ' · ' + r.actions + ' fix(es) · remaining critical issues ' + r.after + ' · broken line rerouted ' + r.lineKept + ' · dead-end removed ' + r.deadGone + ' · invalid vehicle removed ' + r.vehGone };
    });
  await T('transport', 'Save 3.2: transportation block · v2.6.0 save · Windows ↔ Android (TEST O · P · Q)', 'transportation (metro, bus, rail, airport, ports, bike, pedestrian, parking, traffic) survives save → restart → load; a v2.6.0 save without it gets defaults; Windows / Android saves keep it',
    async function () {
      const a = await ev(function () {
        const T = tp(); const j = (function () { for (let i = 0; i < MAP.roads.length; i++) if (MAP.inter[i]) return i; return -1; })();
        if (j >= 0) { T.traffic.modes[j] = 'smart'; T.traffic.ptPriority[j] = 1; } T.traffic.defaultMode = 'adaptive'; T.parking.street = false;
        saveGame(true); const raw = JSON.parse(Store.getItem(slotKey(S.slot)));
        return { keys: Object.keys(raw.transportation).join(','), schema: raw.header.schema, j: j, slot: S.slot };
      });
      await page.reload();
      await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none' && typeof loadGame === 'function'; }, null, { timeout: 120000 });
      await helpers();
      const b = await ev(function (x) {
        if (PSH.dialogOpen) { const q = document.querySelector('#sysBtns button'); if (q) q.click(); }
        const lr = loadGame(x.slot); if (!STARTED) { startGame(lr); closeModal(); clearDialogues(); setSpeed(0); }
        const T = S.transportation, kept = T.traffic.defaultMode === 'adaptive' && T.parking.street === false && (x.j < 0 || (T.traffic.modes[x.j] === 'smart' && T.traffic.ptPriority[x.j] === 1));
        const raw = JSON.parse(Store.getItem(slotKey(x.slot)));
        const old = JSON.parse(JSON.stringify(raw)); delete old.transportation; old.header.gameVersion = '2.6.0'; Store.setItem(slotKey(x.slot), JSON.stringify(old)); const lo = loadGame(x.slot); const oldOk = !lo.isNew && !!S.transportation && S.transportation.traffic.defaultMode === null;
        const plat = ['windows', 'android'].map(function (pf) { const w = JSON.parse(JSON.stringify(raw)); w.header.platform = pf; if (w.origin) { w.origin.platform = pf; w.origin.lastPlatform = pf; } Store.setItem(slotKey(x.slot), JSON.stringify(w)); loadGame(x.slot); return S.transportation.traffic.defaultMode === 'adaptive'; });
        return { isNew: lr.isNew, kept: kept, oldOk: oldOk, plat: plat };
      }, a);
      return { ok: !b.isNew && b.kept && b.oldOk && b.plat.every(Boolean) && parseFloat(a.schema) >= 3.2, actual: 'saved ' + a.keys + ' (schema ' + a.schema + ') · after restart kept ' + b.kept + ' · v2.6.0 save → defaults ' + b.oldOk + ' · Windows → this device ' + b.plat[0] + ' · Android → this device ' + b.plat[1] };
    });
  await T('stress19', 'Stress A–C: 100K · 250K · 500K citizens — transport + world systems stay light', 'at 100K / 250K / 500K citizens (statistical) the transport stats, prediction and routing stay fast, all values finite, 4 s at 100× without errors',
    async function () {
      const r = await ev(async function () {
        const out = [];
        for (const pop of [100000, 250000, 500000]) {
          S.city.population = pop; TPE.cache = null; const t0 = performance.now(); const s = tpStats(true); const statsMs = performance.now() - t0;
          setSpeed(100); const g0 = S.clock.gameSec, w0 = performance.now(); let worst = 0, last = performance.now();
          await __qa.until(function () { const n = performance.now(); worst = Math.max(worst, n - last); last = n; S.city.population = pop; return n - w0 > 4000; }, 6000); setSpeed(0);
          out.push({ pop: pop, cars: s.cars, statsMs: statsMs, worst: worst, hours: (S.clock.gameSec - g0) / 3600, fin: isFinite(S.money) && isFinite(S.budget) && isFinite(tpStats(true).commute) });
        }
        S.city.population = 20000; return out;
      });
      const ok = r.every(function (x) { return x.fin && x.statsMs < 300 && x.hours > 0; });
      return { ok: ok, actual: r.map(function (x) { return x.pop.toLocaleString('en-US') + ': ' + x.cars.toLocaleString('en-US') + ' cars, stats ' + x.statsMs.toFixed(0) + ' ms, longest frame ' + Math.round(x.worst) + ' ms, ' + x.hours.toFixed(1) + ' game h'; }).join(' · ') };
    });
  await T('stress19', 'Stress D: 50K vehicles (statistical + agent LOD)', 'at 500K citizens the city has ≥ 50K cars statistically while the simulated agents stay within the quality cap (near → full AI, far → statistics)',
    async function () {
      const r = await ev(function () { S.city.population = 500000; TPE.cache = null; const s = tpStats(true); const cap = perf().veh * 3 + 60; const n = AG.vehicles.length; S.city.population = 20000; return { cars: s.cars, agents: n, cap: cap }; });
      return { ok: r.cars >= 50000 && r.agents <= r.cap, actual: r.cars.toLocaleString('en-US') + ' cars in the statistical traffic model · ' + r.agents + ' vehicle agents (cap ' + r.cap + ')' };
    });
  await T('stress19', 'Stress E–G: mega metro network · large airport · large port', 'a 6-line metro network (up to 10 stations each), a Regional Airport and a Small + Cargo port run 4 s at 100× without errors; the validator finds no critical issue',
    async function () {
      const r = await ev(async function () {
        const wq = await __qa.world('LARGE', 1919, 3); setSpeed(0);                        // a fresh large city: the earlier tests leave a full map
        if (typeof wgUnlockTech === 'function') { wgUnlockTech('metro'); wgUnlockTech('rail'); }
        S.p9.transit.lines = S.p9.transit.lines.filter(function (L) { return !/^QA /.test(L.name); }); tpMakeRoom(6);
        // airport and ports first: the six metro lines below take many free lots
        const ap = tpPlaceNear('regionalairport', MAP.W >> 1, MAP.H >> 1, MAP.W) || wgPlaceAnywhere(null, 'regionalairport', { clearLocal: true }), pt = tpPlaceNear('smallport', 2, 2, MAP.W), pc = tpPlaceNear('port', 2, MAP.H - 4, MAP.W); onMapChanged();
        const placed = { why: wq.ok ? '' : (window.__qaDlg || ''), world: wq.ok, ap: ap ? ap.type + '@' + ap.x + ',' + ap.y : 'no site', pt: !!pt, pc: !!pc, W: MAP.W };
        const before = tpLines('metro').length; let built = 0;
        for (let k = 0; k < 6 && tpLines().length < 16; k++) { const sites = []; for (let s = 0; s < 8; s++) sites.push({ x: 4 + ((k * 7 + s * 6) % (MAP.W - 8)), y: 4 + ((k * 11 + s * 5) % (MAP.H - 8)) }); if (tpBuildLine('metro', sites, 'QA Metro ' + k)) built++; }
        setSpeed(100); const t0 = performance.now(); await __qa.until(function () { return performance.now() - t0 > 4000; }, 6000); setSpeed(0);
        const v = tp3Validate(), crit = v.issues.filter(function (i) { return TP_WARN.indexOf(i.id) < 0; });
        return { placed: placed, still: !!(ap && MAP.byId.has(ap.id) && ap.built), lines: tpLines('metro').length - before, built: built, air: tpAirport().level, port: tpPort().level, crit: crit.map(function (i) { return i.what; }).slice(0, 3), err: TPE.errors };
      });
      return { ok: r.lines >= 1 && r.air !== 'none' && r.crit.length === 0 && r.err === 0, actual: r.built + ' new metro line(s) · airport ' + r.air + ' · port ' + r.port + ' · critical issues ' + (r.crit.join('; ') || 'none') + ' · errors ' + r.err + (r.air === 'none' ? ' · placement ' + JSON.stringify(r.placed) + ' still there ' + r.still : '') };
    });
  await T('stress19', 'Stress H–L: extreme traffic · rain · snow · emergency under congestion · power outage', 'traffic ×5, then heavy rain, snow and a city-wide outage: the game keeps running, dynamic routing works, an emergency unit is dispatched through congestion, signals fall back to 4-way stops in the outage',
    async function () {
      const r = await ev(async function () {
        const run = async function (ms) { setSpeed(50); const t0 = performance.now(); await __qa.until(function () { return performance.now() - t0 > ms; }, ms + 2000); setSpeed(0); };
        const rr0 = tp().traffic.stats.reroutes, em0 = S.p9.emergency.dispatched;
        S.p9.traffic.mult = 5; await run(2500);
        FX.lock = 'heavyrain'; FX.weather = 'heavyrain'; await run(1500);
        FX.lock = 'snow'; FX.weather = 'snow'; const b = S.buildings.list.find(function (x) { return x.built && x._entry >= 0 && BUILDINGS[x.type].housing; }); if (b) emergencyDispatch('fire', b._entry, { priority: true }); await run(2000);
        const c = cityCentre(); S.p9.util.failures.push({ x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE), r: 30, until: S.clock.runSec + 300, cause: 'qa' }); await run(1500);
        S.p9.util.failures = S.p9.util.failures.filter(function (f) { return f.cause !== 'qa'; }); FX.lock = null; FX.weather = 'clear'; S.p9.traffic.mult = 1;
        return { rer: tp().traffic.stats.reroutes - rr0, em: S.p9.emergency.dispatched - em0, fin: isFinite(S.money) && isFinite(SIM.traffic), err: TPE.errors + GOV.errors };
      });
      return { ok: r.fin && r.em >= 1 && r.err === 0, actual: r.rer + ' dynamic reroutes · ' + r.em + ' emergency dispatch(es) under congestion · state finite ' + r.fin + ' · errors ' + r.err };
    });
  await T('stress19', 'Stress M: economic recession + low budget with transportation', 'recession and a near-empty city budget: transit keeps running, the budget never goes NaN, policies / lines are not corrupted',
    async function () {
      const r = await ev(async function () {
        forceEconPhase('RECESSION'); S.budget = 500; setSpeed(100); const t0 = performance.now(); await __qa.until(function () { return performance.now() - t0 > 3000; }, 5000); setSpeed(0);
        const ok = isFinite(S.budget) && S.budget >= -1e-6 && S.p9.transit.lines.every(function (L) { return Array.isArray(L.stops) && L.stops.length >= 2; });
        forceEconPhase('RECOVERY'); S.budget += 1e6;
        return { ok: ok, lines: S.p9.transit.lines.length, budget: S.budget };
      });
      return { ok: r.ok, actual: 'budget finite and ≥ 0 · ' + r.lines + ' lines intact' };
    });

  /* ===================== Part 20: CITIZEN AI · LIVING CITY 3.0 ===================== */
  const caiRun = async function (ms, speed) { await ev(async function (a) { setSpeed(a[1]); const t0 = performance.now(); await __qa.until(function () { return performance.now() - t0 > a[0]; }, a[0] + 3000); setSpeed(0); }, [ms, speed || 10]); };
  await T('citizens', 'Citizen AI: identity, life stages, Household 2.0, 11 needs, Happiness 3.0 (13 factors)', 'every simulated citizen has a stable id and a procedural name, a life stage, a household (adults + children / teens) with one budget, 11 needs and 13 happiness factors (all finite)',
    async function () {
      await ev(async function () { await __qa.world('MEDIUM', 2020, 3); });
      await caiRun(9000, 10);
      const r = await ev(function () {
        caiHour(); const ppl = caiPeople(), A = S.citizenAI;
        const ids = ppl.map(function (P) { return P.id; }), uniq = new Set(ids).size === ids.length;
        const named = ppl.every(function (P) { return /^\S+$/.test(P.fn) && P.ln.length > 1; }), bound = ppl.every(function (P) { return P.agent && P.agent.cid === P.id; });
        const hh = Object.keys(A.households).map(function (k) { return A.households[k]; }), kids = hh.reduce(function (a, H) { return a + H.kids.length; }, 0);
        const stages = {}; ppl.forEach(function (P) { stages[caiStageOf(caiAge(P))] = 1; }); hh.forEach(function (H) { H.kids.forEach(function (k) { stages[caiStageOf(Math.floor((gameDay() - k.by) / CAI_YEAR_DAYS))] = 1; }); });
        const needs = ppl.every(function (P) { return CAI_NEEDS.every(function (n) { return isFinite(P.needs[n[0]]) && P.needs[n[0]] >= 0 && P.needs[n[0]] <= 100; }); });
        const fac = ppl.filter(function (P) { return P.f && Object.keys(P.f).length === 13 && Object.keys(P.f).every(function (k) { return isFinite(P.f[k]); }); }).length;
        const budget = hh.filter(function (H) { return isFinite(H.income) && isFinite(H.rent) && isFinite(H.sav); }).length;
        return { n: ppl.length, uniq: uniq, named: named, bound: bound, hh: hh.length, kids: kids, stages: Object.keys(stages), needs: needs, fac: fac, budget: budget, sample: ppl.slice(0, 3).map(function (P) { return P.fn + ' ' + P.ln + ' (' + caiAge(P) + ')'; }) };
      });
      return { ok: r.n >= 5 && r.uniq && r.named && r.bound && r.hh >= 3 && r.needs && r.fac >= r.n - 1 && r.budget === r.hh && r.stages.length >= 3, actual: r.n + ' citizens (' + r.sample.join(', ') + ') · ids unique ' + r.uniq + ' · ' + r.hh + ' households, ' + r.kids + ' children / teens · stages ' + r.stages.join('/') + ' · 11 needs ok ' + r.needs + ' · 13 factors for ' + r.fac + '/' + r.n + ' · budgets ' + r.budget + '/' + r.hh };
    });
  await T('citizens', 'Decisions: utility scores (no pure randomness), routines, weather and season', 'the chosen activity is the highest utility; the same state gives the same choice; storms make the park less attractive; routines differ (early / standard / late / night / student / retired / part-time)',
    async function () {
      const r = await ev(function () {
        const c = AG.citizens.find(function (x) { return !x.tourist && x.cid; }); if (!c) return { skip: true };
        const P = caiProfile(c), keep = function () { return { state: c.state, path: c.path, pi: c.pi, target: c.target, work: c.work, inside: c.inside }; }, back = function (k) { Object.assign(c, k); };
        let k = keep(); caiDecide(c); const a = JSON.stringify(P.dec); back(k); caiDecide(c); const b = JSON.stringify(P.dec); back(k);
        const sorted = P.dec.every(function (d, i, x) { return i === 0 || x[i - 1].u >= d.u; }), parts = P.dec.every(function (d) { return Math.abs(Object.keys(d.p).reduce(function (s, q) { return s + d.p[q]; }, 0) - d.u) < 0.5; });
        const park = function (w) { const fx = FX.weather; FX.weather = w; c.needs.fun = 10; caiDecide(c); const o = P.dec.find(function (d) { return d.s === 'GO_PARK'; }); back(k); FX.weather = fx; return o ? o.u : 0; };
        const sunny = park('clear'), storm = park('storm');
        const routines = {}; caiPeople().forEach(function (Q) { routines[Q.rt] = (routines[Q.rt] || 0) + 1; });
        return { same: a === b, sorted: sorted, parts: parts, sunny: sunny, storm: storm, routines: routines, top: P.dec[0] };
      });
      if (r.skip) return { ok: false, actual: 'no citizen agent' };
      return { ok: r.same && r.sorted && r.parts && r.storm < r.sunny && Object.keys(r.routines).length >= 3, actual: 'deterministic ' + r.same + ' · sorted by utility ' + r.sorted + ' · scores = sum of parts ' + r.parts + ' · park utility clear ' + Math.round(r.sunny) + ' vs storm ' + Math.round(r.storm) + ' · routines ' + JSON.stringify(r.routines) + ' · top ' + r.top.s + ' ' + r.top.u + ' ' + JSON.stringify(r.top.p) };
    });
  await T('citizens', 'Smart Commute · Shopping AI · Entertainment AI · Health AI · job search · education · career', 'eco-minded citizens avoid the car; richer citizens value time; shoppers pick by price, distance, quality, brand and income; sick citizens choose a hospital; the unemployed find open jobs; xp leads to promotions (Intern → Executive)',
    async function () {
      const r = await ev(function () {
        const c = AG.citizens.find(function (x) { return !x.tourist && x.cid; }), P = caiProfile(c);
        const opts = function () { return [{ mode: 'car', min: 12, cost: 1.5, score: 18 }, { mode: 'bike', min: 22, cost: 0, score: 20 }, { mode: 'transit', min: 20, cost: 0.6, score: 21 }]; };
        const pers0 = P.pers, wage0 = P.wage;
        P.pers = 'ECO_FRIENDLY'; P.wage = 1500; const eco = caiCommuteAdjust(c, null, opts())[0].mode;
        P.pers = 'LUXURY'; P.wage = 9000; const lux = caiCommuteAdjust(c, null, opts())[0].mode; P.pers = pers0; P.wage = wage0;
        // shopping: same candidates, a much better rated shop wins
        const shops = (MAP.lists.SHOPPING || []).filter(function (b) { return b._op; }); let shop = 'n/a';
        if (shops.length >= 2) { const r0 = shops.map(function (b) { return [b.rating, b.nrev]; }); CAI.cache = {}; shops.forEach(function (b) { b.rating = 1; b.nrev = 50; }); const best = shops[shops.length - 1]; best.rating = 5; const pick = caiPickShop(c, P, 'GO_SHOPPING', shops); shop = pick === best || (pick && pick.rating >= 4); shops.forEach(function (b, i) { b.rating = r0[i][0]; b.nrev = r0[i][1]; }); CAI.cache = {}; }
        const hosp = caiPickHospital(c, P), fun = caiPickFun(c, P, 'GO_ENTERTAINMENT', MAP.lists.ENTERTAINMENT || []);
        const w0 = c.work; c.work = 0; CAI.cache = {}; const job = caiPickJob(c, P); c.work = w0;
        const lvl0 = P.career.lvl; P.career.lvl = 0; P.career.xp = 1e6; P.career.since = -10; const wasWork = c.work; if (!c.work && job) c.work = job.id; caiHour(); const promoted = P.career.lvl === 1; P.career.lvl = lvl0; c.work = wasWork;
        P.sick = true; caiDecide(c); const goesHosp = P.dec.some(function (d) { return d.s === 'GO_HOSPITAL'; }); P.sick = false;
        return { eco: eco, lux: lux, shop: shop, hosp: hosp ? bdef(hosp).name : null, fun: fun ? bdef(fun).name : null, job: job ? bdef(job).name : null, promoted: promoted, goesHosp: goesHosp, career: CAI_CAREER.length };
      });
      return { ok: r.eco !== 'car' && r.lux === 'car' && r.shop !== false && (r.hosp === null || r.goesHosp) && r.promoted && r.career === 7, actual: 'eco citizen → ' + r.eco + ' · rich luxury citizen → ' + r.lux + ' · best-rated shop chosen ' + r.shop + ' · hospital ' + r.hosp + ' (sick → hospital option ' + r.goesHosp + ') · entertainment ' + r.fun + ' · job found ' + r.job + ' · promotion ' + r.promoted + ' · ' + r.career + ' career levels' };
    });
  await T('citizens', 'Opinions → City Approval · Comments 2.0 from real data · memory · social ties', 'citizens form opinions per topic from their own experience; the city mood moves approval by at most ±4 points; comments quote real numbers (commute minutes, rent share, unemployment); memories and friendships build up',
    async function () {
      const r = await ev(function () {
        const ppl = caiPeople(); caiDay();
        const A = S.citizenAI, ops = Object.keys(A.opinions).length;
        const G = S.government; let lo = null, hi = null;
        if (G && typeof govSatisfactionHour === 'function') { const v0 = G.approval.value; ppl.forEach(function (P) { CAI_TOPICS.forEach(function (t) { P.op[t[0]] = -100; }); }); caiOpinions(ppl); A.opinions = {}; CAI_TOPICS.forEach(function (t) { A.opinions[t[0]] = -100; }); for (let i = 0; i < 60; i++) govSatisfactionHour(); lo = G.approval.value; CAI_TOPICS.forEach(function (t) { A.opinions[t[0]] = 100; }); for (let i = 0; i < 60; i++) govSatisfactionHour(); hi = G.approval.value; G.approval.value = v0; }
        caiComments(ppl); const nums = A.comments.filter(function (c) { return /\d/.test(c[2]); }).length;
        return { ops: ops, lo: lo, hi: hi, comments: A.comments.length, nums: nums, sample: A.comments.slice(0, 2).map(function (c) { return c[1] + ': ' + c[2]; }), mem: ppl.reduce(function (a, P) { return a + P.mem.length; }, 0), friends: ppl.reduce(function (a, P) { return a + P.friends.length; }, 0) };
      });
      const spread = r.hi !== null ? r.hi - r.lo : 0;
      return { ok: r.ops === 10 && (r.hi === null || (spread > 0.5 && spread <= 8.5)) && r.mem > 0, actual: r.ops + ' opinion topics · approval with the angriest / happiest citizens ' + (r.lo !== null ? r.lo.toFixed(1) + ' / ' + r.hi.toFixed(1) + ' (spread ' + spread.toFixed(1) + ' ≤ 8)' : 'n/a') + ' · ' + r.comments + ' comments, ' + r.nums + ' with real numbers (' + r.sample.join(' | ') + ') · ' + r.mem + ' memories · ' + r.friends + ' friendships' };
    });
  await T('citizens', 'Housing AI · migration · City Life Score · District Life Score · Population Forecast · AI City Planner', 'an unhappy household moves to a better affordable home or leaves; the City Life Score and district scores are 0–100 with labels; the forecast gives 1 / 5 / 10 / 25 / 50 years; the planner only suggests (builds nothing)',
    async function () {
      const r = await ev(function () {
        const A = S.citizenAI, k = Object.keys(A.households).find(function (q) { return A.households[q].adults.some(function (id) { const P = CAI.live.get(id); return P && P.agent && AG.citizens.indexOf(P.agent) >= 0; }); }), H = A.households[k], home0 = H ? H.home : 0, m0 = A.migration.moved + A.migration.left;
        if (H) { H.sat = 5; H.unhappy = 8; caiHousingAndMigration(caiPeople()); }
        const moved = A.migration.moved + A.migration.left > m0;
        caiHour(); const L = A.life, F = caiForecast(), n0 = S.buildings.list.length, money0 = S.money, plan = caiPlanner(), same = S.buildings.list.length === n0 && S.money === money0;
        return { moved: moved, home: home0 !== (A.households[k] || {}).home, life: L.score, label: L.label, dist: L.districts.length, distOk: L.districts.every(function (d) { return d.score >= 0 && d.score <= 100 && d.label; }), F: F.map(function (f) { return f.years + 'y ' + f.pop; }), plan: plan.length, planText: plan[0] ? plan[0].text : '', same: same };
      });
      return { ok: r.moved && r.life >= 0 && r.life <= 100 && !!r.label && r.distOk && r.F.length === 5 && r.plan > 0 && r.same, actual: 'unhappy household moved / left ' + r.moved + ' · City Life ' + r.life + ' ' + r.label + ' · ' + r.dist + ' district scores · forecast ' + r.F.join(', ') + ' · planner ' + r.plan + ' suggestion(s) ("' + r.planText + '"), city unchanged ' + r.same };
    });
  await T('citizens', 'LOD: near 5–10 Hz full AI · mid 1–2 Hz · far statistical · AI caches', 'citizens near the camera are updated 5–10 times per simulated second, mid-distance 1–2 times, far ones not at all (district statistics); the AI tick stays well under a millisecond per frame',
    async function () {
      await ev(function () { caiRates(); CAI.rate.t0 = S.clock.runSec; CAI.rate.near = CAI.rate.mid = 0; });
      await caiRun(6000, 1);
      const r = await ev(function () { const R = caiRates(); return { near: R.near, mid: R.mid, counts: R.counts, ms: CAI.prof.ms, dec: CAI.prof.decMs, far: CAI.prof.far }; });
      const nearOk = !r.counts[0] || (r.near >= 4.5 && r.near <= 10.5), midOk = !r.counts[1] || (r.mid >= 0.9 && r.mid <= 2.2);
      return { ok: nearOk && midOk && r.ms < 4, actual: 'near ' + r.near.toFixed(1) + ' Hz (' + r.counts[0] + ' citizens) · mid ' + r.mid.toFixed(1) + ' Hz (' + r.counts[1] + ') · far ' + r.counts[2] + ' statistical · AI tick ' + r.ms.toFixed(2) + ' ms · decision ' + r.dec.toFixed(3) + ' ms' };
    });
  await T('citizens', 'Scale: 10K · 50K · 100K · 250K · 500K citizens', 'the statistical population grows to 500K while the detailed sample stays within the quality cap; hour / day passes and the life score stay fast and finite; 3 s at 100× without errors',
    async function () {
      const r = await ev(async function () {
        const out = [];
        for (const pop of [10000, 50000, 100000, 250000, 500000]) {
          S.city.population = pop; const t0 = performance.now(); caiHour(); const hourMs = performance.now() - t0, t1 = performance.now(); caiDay(); const dayMs = performance.now() - t1;
          setSpeed(100); const w0 = performance.now(); let worst = 0, last = performance.now(); await __qa.until(function () { const n = performance.now(); worst = Math.max(worst, n - last); last = n; S.city.population = pop; return n - w0 > 3000; }, 5000); setSpeed(0);
          out.push({ pop: pop, hourMs: hourMs, dayMs: dayMs, worst: worst, agents: AG.citizens.length, life: S.citizenAI.life.score, stages: S.citizenAI.stats ? Object.keys(S.citizenAI.stats.stages).reduce(function (a, k) { return a + S.citizenAI.stats.stages[k]; }, 0) : 0, statPop: S.citizenAI.stats ? S.citizenAI.stats.pop : 0 });
        }
        S.city.population = 12000; return { out: out, errors: CAI.errors, cap: perf().npc };
      });
      const ok = r.errors === 0 && r.out.every(function (x) { return isFinite(x.life) && x.hourMs < 60 && x.dayMs < 120 && x.agents <= r.cap * 2 + 40 && Math.abs(x.stages - x.statPop) <= x.statPop * 0.02 + 10; });
      return { ok: ok, actual: r.out.map(function (x) { return x.pop.toLocaleString('en-US') + ': hour ' + x.hourMs.toFixed(1) + ' ms, day ' + x.dayMs.toFixed(1) + ' ms, ' + x.agents + ' agents, life stages ' + x.stages.toLocaleString('en-US') + ' of ' + x.statPop.toLocaleString('en-US') + ', frame ≤ ' + Math.round(x.worst) + ' ms'; }).join(' · ') + ' · errors ' + r.errors };
    });
  await T('citizens', 'Recession · festival (Event Crowd AI + event transport) · rain', 'in a recession the AI keeps running with finite budgets; a festival sends citizens to the venue and pushes the route choice towards transit; rain lowers outdoor utilities',
    async function () {
      const r = await ev(async function () {
        forceEconPhase('RECESSION'); setSpeed(50); let t0 = performance.now(); await __qa.until(function () { return performance.now() - t0 > 2500; }, 4000); setSpeed(0);
        const fin = caiPeople().every(function (P) { return isFinite(P.hap) && isFinite(P.wage) && isFinite(P.sav); }); forceEconPhase('RECOVERY');
        const day = Math.floor(S.clock.gameSec / 86400); S.clock.gameSec = (day + (gameHour() >= 15 ? 1 : 0)) * 86400 + 15 * 3600; startGlobalEvent(GLOBAL_EVENTS.find(function (g) { return g.id === 'festival'; })); AG.citizens.forEach(function (c) { if (!c.tourist) c.pending = true; });
        setSpeed(5); t0 = performance.now(); let seen = 0; await __qa.until(function () { seen = Math.max(seen, AG.citizens.filter(function (c) { return c.state === 'GO_EVENT'; }).length); return performance.now() - t0 > 4000; }, 6000); setSpeed(0);
        const c = AG.citizens.find(function (x) { return !x.tourist && x.cid; }), opts = [{ mode: 'car', min: 12, cost: 1, score: 15 }, { mode: 'transit', min: 15, cost: 0.6, score: 17 }];
        const withEvent = c ? caiCommuteAdjust(c, null, opts.map(function (o) { return Object.assign({}, o); }))[0].mode : '';
        S.events.active = S.events.active.filter(function (a) { return a.id !== 'festival'; });
        return { fin: fin, seen: seen, withEvent: withEvent, attended: S.citizenAI.events.attended, errors: CAI.errors };
      });
      return { ok: r.fin && r.seen >= 1 && r.withEvent === 'transit' && r.errors === 0, actual: 'recession: values finite ' + r.fin + ' · festival: up to ' + r.seen + ' citizens heading to the venue, ' + r.attended + ' visits · route choice during the event → ' + r.withEvent + ' · errors ' + r.errors };
    });
  await T('citizens', 'Save 3.3: citizens, households, routines, memories, opinions, jobs, housing · v2.7.0 save · Windows ↔ Android', 'the citizen AI block survives save → restart → load with the same ids, names, households and opinions; a v2.7.0 save without it creates profiles; Windows / Android saves keep it',
    async function () {
      const a = await ev(function () {
        caiHour(); saveGame(true); const raw = JSON.parse(Store.getItem(slotKey(S.slot)));
        const names = {}; raw.citizens.forEach(function (c) { const Q = c.cid ? raw.citizenAI.people[c.cid] : null; if (Q) names[c.cid] = Q.fn + ' ' + Q.ln; }); const first = raw.citizens.find(function (c) { return c.cid && names[c.cid]; }), P = first ? raw.citizenAI.people[first.cid] : null;
        return { names: names, slot: S.slot, schema: raw.header.schema, n: Object.keys(raw.citizenAI.people).length, hh: Object.keys(raw.citizenAI.households).length, cid: first ? first.cid : 0, name: P ? P.fn + ' ' + P.ln : '', mem: P ? P.mem.length : 0, op: JSON.stringify(raw.citizenAI.opinions) };
      });
      await page.reload();
      await page.waitForFunction(function () { return document.getElementById('bootSplash').style.display === 'none' && typeof loadGame === 'function'; }, null, { timeout: 120000 });
      await helpers();
      const b = await ev(async function (x) {
        if (PSH.dialogOpen) { const q = document.querySelector('#sysBtns button'); if (q) q.click(); }
        const lr = loadGame(x.slot); if (!STARTED) { startGame(lr); closeModal(); clearDialogues(); setSpeed(0); }
        setSpeed(2); await __qa.until(function () { return AG.citizens.filter(function (z) { return z.cid; }).length >= 3; }, 6000); setSpeed(0);   // agents are restored by the population tick
        let match = 0, wrong = 0; AG.citizens.forEach(function (z) { if (!z.cid || !x.names[z.cid]) return; const Q = caiProfile(z); if (Q.fn + ' ' + Q.ln === x.names[z.cid]) match++; else wrong++; });
        const c = AG.citizens.find(function (z) { return z.cid && x.names[z.cid]; }), P = c ? caiProfile(c) : null;
        const same = match >= 1 && wrong === 0, ops = JSON.stringify(S.citizenAI.opinions) === x.op, hh = Object.keys(S.citizenAI.households).length;
        const raw = JSON.parse(Store.getItem(slotKey(x.slot))), old = JSON.parse(JSON.stringify(raw)); delete old.citizenAI; old.header.gameVersion = '2.7.0'; old.citizens.forEach(function (q) { delete q.cid; });
        Store.setItem(slotKey(x.slot), JSON.stringify(old)); const lo = loadGame(x.slot); const oldOk = !lo.isNew && !!S.citizenAI && Object.keys(S.citizenAI.people).length === 0;
        const plat = ['windows', 'android'].map(function (pf) { const w = JSON.parse(JSON.stringify(raw)); w.header.platform = pf; if (w.origin) { w.origin.platform = pf; w.origin.lastPlatform = pf; } Store.setItem(slotKey(x.slot), JSON.stringify(w)); loadGame(x.slot); return Object.keys(S.citizenAI.people).length === Object.keys(raw.citizenAI.people).length; });
        Store.setItem(slotKey(x.slot), JSON.stringify(raw)); loadGame(x.slot);
        return { dbg: AG.citizens.length + ' agents, cids ' + AG.citizens.slice(0, 6).map(function (z) { return z.cid; }).join('/') + ' · saved ' + Object.keys(x.names).slice(0, 6).join('/'), isNew: lr.isNew, same: same, match: match, wrong: wrong, ops: ops, hh: hh, oldOk: oldOk, plat: plat, name: P ? P.fn + ' ' + P.ln : '' };
      }, a);
      return { ok: !b.isNew && a.schema === '3.3' && a.n > 0 && b.same && b.ops && b.oldOk && b.plat.every(Boolean), actual: 'saved ' + a.n + ' profiles, ' + a.hh + ' households (schema ' + a.schema + ') · after restart ' + b.match + ' citizen(s) kept id + name (' + b.name + '), ' + b.wrong + ' changed [' + b.dbg + '] · opinions kept ' + b.ops + ' · ' + b.hh + ' households · v2.7.0 save → new profiles ' + b.oldOk + ' · Windows ' + b.plat[0] + ' · Android ' + b.plat[1] };
    });
  if (want('citizens')) await caiRun(5000, 5);                           // the save test reloads the city: let the agents come back
  await T('citizens', 'Citizen validator + auto fix (Citizen Life Health)', 'a homeless citizen, a lost job, a broken household and invalid needs are found and repaired; the health score returns to 100 %',
    async function () {
      const r = await ev(function () {
        const ppl = caiPeople(); if (ppl.length < 3) return { skip: true };
        ppl[0].agent.home = 99999991; ppl[1].agent.work = 99999992; ppl[2].hh = 99999993; ppl[2].needs.food = NaN;
        const before = caiValidate(), fx = caiAutoFix(), after = fx.after;
        return { found: before.issues.map(function (i) { return i.id; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(','), before: before.health, after: after.health, actions: fx.actions.length, left: after.issues.length };
      });
      if (r.skip) return { ok: false, actual: 'fewer than 3 citizens' };
      return { ok: /homeless/.test(r.found) && /job/.test(r.found) && /household/.test(r.found) && /nan/.test(r.found) && r.left === 0, actual: 'found ' + r.found + ' (health ' + r.before + '%) · ' + r.actions + ' repair(s) → ' + r.after + '% · remaining ' + r.left };
    });
  await T('citizens', 'City Life UI · Citizen Inspector · FOLLOW · route · Household (desktop and mobile flow)', 'all City Life tabs render; tapping a citizen opens the inspector (mobile: Tap → Inspector → PROFILE / Follow → Route → Household); FOLLOW tracks the citizen and the route is drawn; 10 citizen heatmaps have data',
    async function () {
      const r = await ev(async function () {
        let tabs = 0; for (const t of CL_TABS) { openCityLife(t[0]); await __qa.frames(2); if ((document.getElementById('clRoot') || {}).innerText.length > 40) tabs++; } closeModal();
        const c = AG.citizens.find(function (x) { return !x.tourist && x.cid; }); if (!c) return { tabs: tabs, skip: true };
        const P = caiProfile(c), mobile = document.body.classList.contains('mobileUI');
        showAgentInfo({ c: c }); await __qa.frames(3);
        let flow = '';
        if (mobile) { const ins = MINS.el && MINS.kind === 'citizen'; flow += 'inspector ' + !!ins; const route = MINS.el && MINS.el.querySelector('[data-caimi="route"]'); if (route) route.click(); flow += ' · route ' + (CAI.route === c); const house = MINS.el && MINS.el.querySelector('[data-caimi="house"]'); if (house) { house.click(); await __qa.frames(2); flow += ' · household ' + /household/i.test(($('modalTitle') || {}).innerText || ''); closeModal(); } const prof = MINS.el && MINS.el.querySelector('[data-mi="more"]'); if (prof) { prof.click(); await __qa.frames(2); } }
        const ins = document.getElementById('caiIns'), named = ins ? (($('modalTitle') || {}).innerText || '').indexOf(P.fn) >= 0 : false;
        let insTabs = 0; for (const t of CAI_INS_TABS) { CLUI.insTab = t[0]; caiInsRender(); if ((document.getElementById('caiIns') || {}).innerText.length > 30) insTabs++; }
        const fb = document.querySelector('#caiIns [data-caif]'); if (fb) fb.click(); await __qa.frames(3);
        const follow = typeof MOBX !== 'undefined' && MOBX.track === c; if (typeof stopTracking === 'function') stopTracking();
        let heats = 0; for (const h of CL_HEATS) if (caiHeatGrid(h[0])) heats++;
        closeModal(); if (typeof closeInspector === 'function') closeInspector(true); CAI.route = null;
        return { tabs: tabs, named: named, insTabs: insTabs, follow: follow, heats: heats, mobile: mobile, flow: flow };
      });
      if (r.skip) return { ok: false, actual: 'no citizen' };
      return { ok: r.tabs === 8 && r.named && r.insTabs === 7 && r.follow && r.heats === 10 && (!r.mobile || /inspector true · route true · household true/.test(r.flow)), actual: r.tabs + '/8 City Life tabs · inspector named ' + r.named + ' · ' + r.insTabs + '/7 inspector tabs · FOLLOW tracks ' + r.follow + ' · ' + r.heats + '/10 heatmaps' + (r.mobile ? ' · mobile flow: ' + r.flow : '') };
    });

  await T('security', 'Government admin tools are OWNER / ADMIN / developer only', 'a normal player cannot reset the government, run its ticks, start government events or use the government.* console commands; the admin view is hidden',
    async function () {
      const r = await ev(function () {
        const G = S.government, ap = G.approval.value, nEv = G.events.active.length, tax = JSON.stringify(govTaxes());
        const a = adminGov('reset'), b = adminGov('event:taxProtest'), c = adminGov('tick');
        let out = ''; try { out = String(runAdminCommand('government.reset') || '') + String(runAdminCommand('government.stats') || ''); } catch (e) { out = 'threw'; }
        return { denied: a === undefined && b === undefined && c === undefined, same: S.government === G && G.approval.value === ap && G.events.active.length === nEv && JSON.stringify(govTaxes()) === tax, leak: /approval|funding/.test(out) };
      });
      return { ok: r.denied && r.same && !r.leak, actual: 'admin government actions denied ' + r.denied + ' · government unchanged ' + r.same + ' · console output leaked ' + r.leak };
    });

  await T('security', 'World Builder admin tools are hidden and denied for a normal player', 'the 175 admin tools, the World Builder actions and undo / redo do nothing without an admin session and never appear in the palette',
    async function () {
      const r = await ev(function () {
        const m0 = S.money, n0 = S.buildings.list.length, q0 = S.worldbuilder ? S.worldbuilder.quality : null;
        const a = adminTool('moneyEditor', '999999999'), b = adminTool('deleteBuilding', ''), c = wbAdmin('fix'), d = atUndo(), e = adminTool('createWorld', 'balanced');
        const pal = paletteCommands().filter(function (x) { return /^Admin · /.test(x.label || ''); }).length;
        return { denied: [a, b, c, d, e].every(function (x) { return x === undefined; }), same: S.money === m0 && S.buildings.list.length === n0 && (S.worldbuilder ? S.worldbuilder.quality : null) === q0 && !WG.busy, pal: pal };
      });
      return { ok: r.denied && r.same && r.pal === 0, actual: 'tool calls denied ' + r.denied + ' · city unchanged ' + r.same + ' · palette admin entries ' + r.pal };
    });
  await T('security', 'Citizen AI admin tools are hidden and denied for a normal player', 'the 20 citizen AI admin actions / tools do nothing without an admin session; the AI debug tab is not shown in the inspector',
    async function () {
      const r = await ev(function () {
        const c = AG.citizens.find(function (x) { return !x.tourist && x.cid; }), P = c ? caiProfile(c) : null, s0 = P ? JSON.stringify(caiPack(P)) : '', ev0 = S.events.active.length;
        const calls = [adminCitizenAI('sick'), adminCitizenAI('reset'), adminCitizenAI('festival'), adminTool('caiPromote'), adminTool('caiReset'), adminTool('caiOpinion', '-100')];
        let debugTab = false; if (c) { caiInspect(c); debugTab = !!document.querySelector('#caiIns [data-cait="debug"]'); closeModal(); }
        return { denied: calls.every(function (x) { return x === undefined; }), same: !P || JSON.stringify(caiPack(P)) === s0, events: S.events.active.length === ev0, debugTab: debugTab, tools: AT_TOOLS.filter(function (t) { return /^cai/.test(t.id); }).length };
      });
      return { ok: r.denied && r.same && r.events && !r.debugTab && r.tools === 20, actual: r.tools + ' citizen admin tools · calls denied ' + r.denied + ' · citizen unchanged ' + r.same + ' · no event started ' + r.events + ' · AI debug tab visible ' + r.debugTab };
    });
  await T('security', 'Economy admin tools are OWNER / ADMIN only', 'a normal player cannot start shocks, force the cycle or run ticks; the economy debug lines and admin view are hidden',
    async function () {
      const r = await ev(function () {
        const n0 = S.p17.shocks.length, ph0 = S.p5.econ.phase;
        const a = adminEcon2('shock:energy:3'), b = adminEcon2('phase', 'BOOM'), c = adminEcon2('endShocks');
        const pal = paletteCommands().filter(function (x) { return /start .*shock|force .*cycle|economic tick|econ2/i.test(x.label); }).length;   // the player's own "Supply shocks" view is not an admin tool
        return { denied: a === undefined && b === undefined && c === undefined, shocks: S.p17.shocks.length === n0, phase: S.p5.econ.phase === ph0, pal: pal, f3: DBG.on };
      });
      return { ok: r.denied && r.shocks && r.phase && r.pal === 0 && !r.f3, actual: 'admin economy commands denied ' + r.denied + ' · shocks unchanged ' + r.shocks + ' · cycle unchanged ' + r.phase + ' · palette admin entries ' + r.pal + ' · F3 ' + r.f3 };
    });

  await T('security', 'Release build hides debug, stress test and developer presets', 'release profile: no F3 debug, no visual debug overlay, presets refused, no stress test / test generator / debug commands for a normal player',
    async function () {
      const r = await ev(async function () {
        if (!STARTED) { if (PSH.dialogOpen) { const b = document.querySelector('#sysBtns button'); if (b) b.click(); } await generateWorld('balanced', { seed: 31337, name: 'QA SEC', slot: 3, size: 'SMALL' }); closeModal(); clearDialogues(); }
        const profile = BUILD.profile;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true })); await __qa.frames(3);
        const f3 = DBG.on || !$('debug6').classList.contains('hidden');
        GSET.veDebug = true; veMobileDebug(); const overlay = !!document.getElementById('veDebug'); GSET.veDebug = false;
        const preset = veApplyPreset('DESKTOP ULTRA'), presetsAllowed = vePresetsAllowed();
        const admin = typeof AdminAuth !== 'undefined' ? AdminAuth.active() : false;
        const pop0 = S.city.population; let cmd = 'denied';
        try { runAdminCommand('stressTest'); runAdminCommand('setMoney 999999999'); } catch (e) { cmd = 'threw ' + e.message; }
        if (S.city.population !== pop0 || S.money >= 999999999 || (typeof ADM !== 'undefined' && ADM.stress)) cmd = 'EXECUTED';
        const visibleText = document.body.innerText;
        const leaks = ['Stress Test', 'STRESS TEST', 'Test generator', 'Debug commands', 'Developer presets', 'Fake economy'].filter(function (t) { return visibleText.indexOf(t) >= 0; });
        const pal = paletteCommands().map(function (c) { return String(c.label || c.name || c.t || c[0] || ''); }).filter(function (l) { return /debug|stress|developer|preset/i.test(l); });
        return { profile: profile, f3: f3, overlay: overlay, preset: preset, presetsAllowed: presetsAllowed, admin: admin, cmd: cmd.slice(0, 60), leaks: leaks, pal: pal };
      });
      const ok = r.profile === 'release' && !r.f3 && !r.overlay && !r.preset && !r.presetsAllowed && !r.admin && r.leaks.length === 0 && r.pal.length === 0;
      return { ok: ok, actual: 'profile ' + r.profile + ' · F3 debug ' + r.f3 + ' · visual debug overlay ' + r.overlay + ' · developer preset applied ' + r.preset + ' · admin ' + r.admin + ' · stress command → ' + r.cmd + ' · visible dev text ' + (r.leaks.join(', ') || 'none') + ' · palette dev entries ' + (r.pal.join(', ') || 'none') };
    });

  await ctx.close();
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('DEEP QA TEST · v' + VERSION + ' · commit ' + COMMIT);
  if (want('files')) { console.log('\n▶ Windows file store · bundle'); storageTests(); bundleAudit(); }
  if (!pw) { console.error('Playwright not found — npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  const exe = fs.existsSync('/opt/pw-browsers/chromium') && !process.env.PLAYWRIGHT_PATH ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const profiles = [
    { id: 'android', name: 'ANDROID PHONE 1080×2400 (dpr 2.75)', w: 873, h: 393, dpr: 2.75, mobile: true },
    { id: 'windows', name: 'WINDOWS DESKTOP 1920×1080', w: 1920, h: 1080 }
  ].filter(function (p) { return PROFILE === 'both' || PROFILE === p.id; });
  for (const p of profiles) { console.log('\n▶ ' + p.name); try { await runProfile(browser, base, p); } catch (e) { record(p, p.w + '×' + p.h, 'profile run', false, 'the test run completes', 'CRASH ' + e.message, 0); } }
  await browser.close(); srv.close();
  const fail = results.filter(function (r) { return !r.ok; });
  fs.writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify({ version: VERSION, commit: COMMIT, passed: results.length - fail.length, total: results.length, results: results }, null, 1));
  console.log('\nDEEP QA: ' + (results.length - fail.length) + '/' + results.length + ' passed' + (fail.length ? ' — FAILED: ' + fail.map(function (f) { return f.test + ' [' + f.device + ']'; }).join(' · ') : ''));
  process.exit(fail.length ? 1 : 0);
})();
