'use strict';
/* BLOCK CITY TYCOON — GAME ENGINE — fixed timestep loop, interval systems, engine registry */
/* ============================ GAME ENGINE (Loop 2.0) ============================ */
/* Modules group every system by responsibility. Rendering runs every animation frame (target 60 FPS);
   the simulation advances in fixed 50 ms ticks (20 TPS) with interpolation for smooth motion.
   Slower systems run at their own interval: NPC AI 0.25 s, Economy 1 s, Market 5 s, … Each system is
   isolated with error recovery, so one faulty entity can never crash the whole game. */
const Game = {
  GameState: { get: function () { return S; }, sim: SIM },
  Player: { money: function () { return S.money; }, profile: function () { return PROFILE; }, titles: TITLES },
  City: { score: computeScore, rank: playerRank, identity: identityTick, feedback: feedbackTick, districts: computeDistricts },
  World: { init: initMap, generate: generateCity, changed: onMapChanged, districts: computeDistricts },
  Buildings: { register: registerBuilding, place: placeBuilding, construction: function (dt) { constructionTick(dt); }, health: businessHealthTick },
  NPC: { spawn: spawnCitizen, sync: syncCitizens, update: function (dt) { updateCitizens(dt); }, think: npcAiTick, thoughts: thoughtsTick },
  Vehicles: { update: function (dt) { updateTraffic(dt); }, incidents: accidentTick, dispatch: dispatchVehicle },
  Economy: { tick: econTick, stocks: stockTick, supplyChain: supplyChainTick, cycle: econCycleTick, invest: startInvestment },
  Market: { tick: marketTick, reviews: reviewsTick, ads: runAdTier, lines: productLineStats },
  Power: { ratio: function () { return SIM.powerRatio; } },
  Water: { ratio: function () { return SIM.waterRatio; } },
  Transport: { path: roadPath, roads: placeRoads },
  Research: { research: researchTech, space: launchSpace, techIndex: techIndex },
  Companies: { ai: aiTick, acquire: acquireAI, contracts: contractsTick, startups: startupsTick },
  Tourism: { threshold: tourismThreshold },
  Events: { tick: function (dt) { eventsTick(dt); }, part4: part4Tick, world: worldEventsTick },
  Quests: { tick: questTick, story: storyTick, challenges: challengeTick },
  Achievements: { list: ACHIEVEMENTS, milestones: milestoneTick },
  SaveManager: { save: function (s) { return saveGame(s); }, load: function (n) { return loadGame(n); }, exportSave: function () { return exportSave(); }, importSave: function (t) { return importSave(t); } },
  Renderer: { render: function () { render(); } },
  UI: { refresh: function () { refreshTopbar(); } },
  get Audio() { return SND; },
  Input: { bind: function () { bindInput(); } },
  Performance: { perf: function () { return PERF; } },
  Debug: { errors: ERRLOG },
  TPS: 20, tickDt: 0.05, acc: 0, ticks: 0, tpsMeasured: 0, _tpsCount: 0, _tpsT: 0, errors: 0,
  /* interval systems: [name, interval (sim s), tick] */
  simSystems: [
    { name: 'NPC AI', every: 0.25, acc: 0, tick: function () { npcAiTick(); } },
    { name: 'Economy', every: 1, acc: 0, tick: function (dt) { if (!S.p5.admin.freeze) { econTick(dt); stockTick(dt); } } },
    { name: 'Events', every: 1, acc: 0, tick: function (dt) { eventsTick(dt); part4Tick(dt); } },
    { name: 'Part5', every: 1, acc: 0, tick: function (dt) { part5Tick(dt); } },
    { name: 'Feedback', every: 2, acc: 0, tick: function () { feedbackTick(); } },
    { name: 'Thoughts', every: 1.5, acc: 0, tick: function () { thoughtsTick(); } },
    { name: 'Market', every: 5, acc: 0, tick: function () { marketTick(); reviewsTick(); } },
    { name: 'Score', every: 5, acc: 0, tick: function () { computeScore(); rivalsTick(); } },
    { name: 'Districts', every: 5, acc: 0, tick: function () { computeDistricts(); } },
    { name: 'Companies', every: 4, acc: 0, tick: function (dt) { aiTick(dt); } },
    { name: 'Identity', every: 30, acc: 0, tick: function () { identityTick(); } },
    { name: 'Statistics', every: 5, acc: 0, tick: function () { recordHistory(); recordStockHistory(); } },
    { name: 'Cleanup', every: 10, acc: 0, tick: function () { cleanupTick(); } },
    { name: 'Construction', every: 0.25, acc: 0, tick: function (dt) { if (!(S.p9 && S.p9.freeze.buildings)) constructionTick(dt); } },
    { name: 'Incidents', every: 0.25, acc: 0, tick: function (dt) { updateAccidents(dt); } },
    { name: 'Part6', every: 1, acc: 0, tick: function (dt) { part6Tick(dt); } },
    { name: 'Congestion', every: 1, acc: 0, tick: function () { congestionTick(); } },
    { name: 'Crises', every: 5, acc: 0, tick: function () { crisisTick(); } },
    { name: 'StockMarket', every: 5, acc: 0, tick: function (dt) { stockMarketTick(dt); } },
    { name: 'ZoneDevelop', every: 6, acc: 0, tick: function () { if (!(S.p9 && S.p9.freeze.buildings)) zoneDevelopTick(); } },
    { name: 'Evolution', every: 20, acc: 0, tick: function () { if (!(S.p9 && S.p9.freeze.buildings)) evolutionTick(); } },
    { name: 'Districts6', every: 10, acc: 0, tick: function () { computeDistrictNames(); } },
    { name: 'World', every: 1, acc: 0, tick: function (dt) { part9Tick(dt); } },
    { name: 'Living', every: 1, acc: 0, tick: function (dt) { part10Tick(dt); } },
    { name: 'Corridor', every: 0.25, acc: 0, tick: function () { if (S.p11) emergencyCorridorTick(); } },   // Part 11: emergency priority corridors
    { name: 'Part11', every: 1, acc: 0, tick: function (dt) { part11Tick(dt); } }           // Part 11: transport engine, deep economy, smart city          // Part 9: regions, neighbours, grid, water, sewage, environment, households, property, maintenance, incidents, disasters, validator
  ],
  /* fixed-rate (20 TPS) systems */
  tickSystems: [
    { name: 'Population', tick: function (dt) { if (S.p9 && S.p9.freeze.citizens) return; syncCitizens(); updateCitizens(dt); } },
    { name: 'Transportation', tick: function (dt) { if (S.p9 && S.p9.freeze.traffic) return; updateTraffic(dt); updateShips(dt); } }
  ],
  prof: {},
  safe: function (s, dt) {
    const t0 = performance.now();
    try { s.tick(dt); } catch (e) { this.errors++; recoverSystem(s.name, e); }
    const ms = performance.now() - t0, p = this.prof[s.name] || (this.prof[s.name] = { ms: 0, max: 0, n: 0 });   // per-system timing (benchmark, F3)
    p.ms = p.ms * 0.9 + ms * 0.1; p.n++; if (ms > p.max) p.max = ms;
  },
  step: function (simDt) {
    if (simDt <= 0) return;
    const self = this;
    // Slow systems adapt to performance: AI companies tick half as often on weak devices
    this.simSystems[9].every = PERF.scale < 0.6 ? 8 : 4;
    // Fixed timestep: every system consumes exactly the simulated time. At very high speeds (25×–100×)
    // several ticks are merged into bigger steps so no time is ever lost and the frame stays fast.
    this.simSystems.forEach(function (s) {
      s.acc += simDt;
      const n = Math.floor(s.acc / s.every);
      if (n <= 0) return;
      if (n <= 6) { for (let k = 0; k < n; k++) { s.acc -= s.every; self.safe(s, s.every); } return; }
      const big = Math.min(n * s.every / 6, Math.max(s.every, 5));
      let k = 0; while (s.acc >= big && k < 6) { s.acc -= big; self.safe(s, big); k++; }
      if (s.acc > big * 6) s.acc = 0;
    });
    flushMapChanged();                   // one map recompute for everything built during this step
  },
  /* Advance the fixed-tick simulation; returns the interpolation factor for rendering */
  advance: function (simDt) {
    const self = this, dt = this.tickDt;
    this.acc += simDt;
    let n = 0;
    while (this.acc >= dt && n < 12) {
      this.acc -= dt; n++;
      snapshotAgents();
      this.tickSystems.forEach(function (s) { self.safe(s, dt); });
      this.ticks++; this._tpsCount++;
    }
    if (n >= 12) this.acc = 0;           // agents are visual: at extreme speeds they skip ahead (statistical simulation)
    return clamp(this.acc / dt, 0, 1);
  },
  measure: function (realDt) { this._tpsT += realDt; if (this._tpsT >= 1) { this.tpsMeasured = this._tpsCount / this._tpsT; this._tpsCount = 0; this._tpsT = 0; } },
  /* Kept for compatibility (tests / tools call Game.frame(dt) directly) */
  frame: function (simDt) { const self = this; this.tickSystems.forEach(function (s) { self.safe(s, simDt); }); }
};
/* Render interpolation: remember positions at the start of each simulation tick */
function snapshotAgents() {
  const a = AG.citizens, v = AG.vehicles;
  for (let i = 0; i < a.length; i++) { a[i]._px = a[i].x; a[i]._py = a[i].y; }
  for (let i = 0; i < v.length; i++) { v[i]._px = v[i].x; v[i]._py = v[i].y; }
}
function withInterpolation(alpha, fn) {
  const L = [AG.citizens, AG.vehicles], saved = [];
  L.forEach(function (list) { for (let i = 0; i < list.length; i++) { const o = list[i]; if (o._px === undefined) continue; saved.push(o, o.x, o.y); o.x = o._px + (o.x - o._px) * alpha; o.y = o._py + (o.y - o._py) * alpha; } });
  try { fn(); } finally { for (let i = 0; i < saved.length; i += 3) { saved[i].x = saved[i + 1]; saved[i].y = saved[i + 2]; } }
}
