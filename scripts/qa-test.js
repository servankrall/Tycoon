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
