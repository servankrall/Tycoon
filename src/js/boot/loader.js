/* BLOCK CITY TYCOON — BOOT LOADER
   Loads the game scripts in order and drives the splash screen with the real progress:
   phase 1 = script files (0–15 %), phase 2 = init() steps: World 20 % · Buildings 35 % · Economy 50 % · Citizens 70 % · Traffic 85 % · UI 100 %. */
(function () {
  'use strict';
  const SCRIPTS = [
    ['engine', 'platform.js'], ['engine', 'config.js'], ['engine', 'data-city.js'], ['engine', 'save.js'], ['city', 'world.js'],
    ['economy', 'economy.js'], ['economy', 'economy-market.js'], ['city', 'events.js'], ['citizens', 'citizens.js'], ['city', 'renderer.js'],
    ['city', 'ui.js'], ['city', 'p5-data.js'], ['city', 'p5-profile.js'], ['city', 'p5-systems.js'], ['city', 'city-systems.js'],
    ['engine', 'game.js'], ['city', 'simulation-data.js'], ['city', 'simulation.js'], ['city', 'p5-ui.js'], ['city', 'admin.js'],
    ['city', 'simulation-ui.js'], ['city', 'worldgen.js'], ['city', 'admin-center.js'], ['world', 'world-engine.js'], ['traffic', 'traffic2.js'], ['citizens', 'citylife.js'], ['city', 'utilities2.js'], ['world', 'world-control.js'], ['city', 'audio.js'], ['city', 'main.js'], ['city', 'platform-ui.js'], ['engine', 'selftest.js']
  ];
  const DEFAULT_TEXT = { engine: 'Loading engine...', city: 'Loading city systems...', economy: 'Loading economy...', citizens: 'Loading citizens...', traffic: 'Loading traffic...', world: 'Loading world...', ui: 'Loading interface...', ready: 'Ready!', failed: 'Loading failed' };
  const ROWS = ['rWorld', 'rBuildings', 'rEconomy', 'rCitizens', 'rTraffic', 'rUI'];
  const ROW_PCT = { rWorld: 20, rBuildings: 35, rEconomy: 50, rCitizens: 70, rTraffic: 85, rUI: 100 };
  const ROW_DEFAULT = { rWorld: 'World', rBuildings: 'Buildings', rEconomy: 'Economy', rCitizens: 'Citizens', rTraffic: 'Traffic', rUI: 'UI' };
  const el = function (id) { return document.getElementById(id); };
  const tx = function (k) { try { if (typeof T === 'function') return T(k); } catch (e) { /* platform not loaded yet */ } return DEFAULT_TEXT[k] || ROW_DEFAULT[k] || k; };
  const t0 = performance.now();

  function setProgress(pct, stage) {
    el('bsFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    el('bsPct').textContent = Math.round(pct) + '%';
    if (stage) el('bsStage').textContent = tx(stage);
  }
  function drawRows(active, done) {
    el('bsList').innerHTML = ROWS.map(function (r) {
      const st = done[r] ? 'done' : r === active ? 'active' : '';
      const name = tx(r); const dots = new Array(Math.max(2, 14 - name.length)).join('.');
      return '<li class="' + st + '"><span>' + name + ' ' + dots + '</span><b>' + (done[r] ? ROW_PCT[r] + '% ✓' : r === active ? '…' : '') + '</b></li>';
    }).join('');
  }
  function fail(msg) {
    el('bsStage').textContent = tx('failed');
    el('bsError').textContent = msg;
    el('bsError').style.display = 'block';
    try { if (typeof Log !== 'undefined') Log.error('Boot failed: ' + msg); } catch (e) { /* no logger */ }
  }
  function loadScript(i) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'js/' + SCRIPTS[i][1];
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Missing file: js/' + SCRIPTS[i][1])); };
      document.body.appendChild(s);
    });
  }
  const icon = el('bsIcon');
  icon.onerror = function () { icon.onerror = null; icon.style.display = 'none'; window.BCT_MISSING_ASSETS = (window.BCT_MISSING_ASSETS || []).concat('assets/icons/icon.png'); };   // fallback: text logo only
  icon.src = 'assets/icons/icon.png';
  const done = {};
  drawRows(null, done);
  let chain = Promise.resolve();
  SCRIPTS.forEach(function (sc, i) {
    chain = chain.then(function () { setProgress(i / SCRIPTS.length * 15, sc[0]); return loadScript(i); });
  });
  chain.then(function () {
    el('bsVer').textContent = 'v' + GAME_VERSION;
    (window.BCT_MISSING_ASSETS || []).forEach(function (a) { Log.warn('Missing asset: ' + a + ' (fallback used)'); });
    setProgress(15, 'world');
    return init(function (stage, row, pct, state) {
      if (state === 'start') { setProgress(pct - (row === 'rWorld' ? 5 : 8), stage); drawRows(row, done); }
      else { if (row) done[row] = 1; setProgress(pct, stage === 'ready' ? 'ready' : null); drawRows(null, done); }
      if (stage === 'ready') {
        if (typeof Log !== 'undefined') Log.info('Boot finished in ' + Math.round(performance.now() - t0) + ' ms');
        setTimeout(function () { el('bootSplash').classList.add('gone'); setTimeout(function () { el('bootSplash').style.display = 'none'; }, 500); }, 350);
      }
    });
  }).catch(function (e) { fail(e && e.message ? e.message : String(e)); });
})();
