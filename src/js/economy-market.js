'use strict';
/* BLOCK CITY TYCOON — ECONOMY SYSTEM — production chains, storage, logistics, market, trade */
/* ========================= 5b. ECONOMY SYSTEM (Part 4) =========================
   Money flows between three kinds of owners:
     PLAYER  → your companies' money (S.money)
     CITY    → the city budget (S.budget): taxes, utility bills, fares; pays for public services
     AI      → rival companies & developers (S.ai[id].cash)
   Products move through the supply chain: deposits → extraction → factories → warehouses/trucks → shops. */

function weatherEffects() {
  const w = FX.weather;
  return {
    traffic: w === 'rain' ? 1.12 : w === 'snow' ? 1.3 : w === 'storm' ? 1.2 : 1,
    powerProd: w === 'storm' && !hasTech('e_storage') ? 0.85 : 1,
    powerDemand: w === 'heatwave' ? 1.25 : 1,
    hap: w === 'rain' ? -2 : w === 'heatwave' ? -3 : w === 'storm' ? -3 : w === 'snow' ? -1 : 0
  };
}
function tradeableCities() { return WORLD_CITIES.filter(function (c) { return relationOf(c.id) > -30; }); }
function relationOf(id) { return S.diplomacy[id] ? S.diplomacy[id].rel : 0; }
function relationLabel(v) { return v > 30 ? 'Friendly' : v < -30 ? 'Hostile' : 'Neutral'; }
/* Best import partner & price (cities that export an item sell it cheaper) */
function importDeal(p) {
  let best = null, bp = Infinity;
  tradeableCities().forEach(function (c) {
    const f = (c.exports.indexOf(p) >= 0 ? 0.8 : 1.15) * (S.diplomacy[c.id].agreement ? 0.9 : 1);
    if (f < bp) { bp = f; best = c; }
  });
  if (!best) return null;
  return { city: best, price: S.economy.prices[p] * bp * ((SIM.mods && SIM.mods.importMult) || 1) };
}
function exportDeal(p) {
  let best = null, bp = 0;
  tradeableCities().forEach(function (c) {
    const f = (c.imports.indexOf(p) >= 0 ? 1.25 : 0.85) * (S.diplomacy[c.id].agreement ? 1.1 : 1);
    if (f > bp) { bp = f; best = c; }
  });
  if (!best) return null;
  const portBonus = MAP.lists.ports.some(function (b) { return b._op; }) ? 1.1 : 1;
  const railBonus = MAP.lists.trains.some(function (b) { return b._op; }) ? 1.08 : 1;
  return { city: best, price: S.economy.prices[p] * bp * portBonus * railBonus };
}
function tradeCapacity() {
  let cap = MAP.edgeRoad ? 10 + MAP.roadCount * 0.05 : 2;
  S.buildings.list.forEach(function (b) {
    if (!b._op) return;
    if (b.type === 'trainstation') cap += 40 * lvlMult(b.level);
    if (b.type === 'airport') cap += 40;
    if (b.type === 'port') cap += BUILDINGS.port.trade * lvlMult(b.level);
  });
  const agreements = WORLD_CITIES.filter(function (c) { return S.diplomacy[c.id].agreement; }).length;
  return cap * (1 + 0.2 * agreements) * (isGlobalMetropolis() ? 2 : 1) * (SIM.mods && SIM.mods.trade ? SIM.mods.trade : 1);
}
function allowImport(p) { const m = S.trade.mode[p]; return (m === 'auto' || m === 'import'); }
function allowExport(p) { const m = S.trade.mode[p]; return (m === 'auto' || m === 'export'); }

/* --- Supply chain: extraction → production → storage → logistics → consumers → trade --- */
function supplyChainTick(dt, mods, list) {
  const inv = S.economy.inventory, price = S.economy.prices;
  const R = { prod: {}, dem: {}, del: {}, imp: {}, exp: {}, fr: {} };
  PRODUCT_IDS.forEach(function (p) { R.prod[p] = 0; R.dem[p] = 0; R.del[p] = 0; R.imp[p] = 0; R.exp[p] = 0; R.fr[p] = 1; });
  const producers = {}; PRODUCT_IDS.forEach(function (p) { producers[p] = []; });
  SIM.flows = {}; let exportValue = 0, importValue = 0;
  // Storage & trucks
  let cap = 800, trucks = 3, chargers = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    b._prodRev = 0; b._impCost = 0; b._inputCost = 0; b._prod = 0; b._fuelRev = 0;
    if (!b._op) continue;
    if (d.storage) cap += d.storage * lvlMult(b.level) * (hasTech('b_supply') ? 1.2 : 1);
    if (d.trucks) trucks += d.trucks * lvlMult(b.level) * (0.5 + 0.5 * Math.min(1, b._eff));
    if (d.goods) cap += d.goods * lvlMult(b.level) * 30;
    if (d.evCharge) chargers += lvlMult(b.level) * b._eff;
  }
  let used = 0; PRODUCT_IDS.forEach(function (p) { used += inv[p]; });
  const slow = used / cap > 0.97 ? 0.2 : used / cap > 0.9 ? 0.6 : 1;      // full storage slows production
  let tradeLeft = tradeCapacity() * dt;
  SIM.tradeCap = tradeLeft / dt;
  const flow = function (city, units) { SIM.flows[city.id] = (SIM.flows[city.id] || 0) + units / dt; };
  const tryImport = function (p, units, payer) {
    if (units <= 0 || tradeLeft <= 0 || !allowImport(p)) return 0;
    const deal = importDeal(p); if (!deal) return 0;
    const u = Math.min(units, tradeLeft); tradeLeft -= u;
    const cost = u * deal.price;
    if (payer) payer._impCost += cost / dt;
    importValue += cost; R.imp[p] += u / dt; flow(deal.city, u);
    S.trade.importTotal += cost;
    return u;
  };
  // 1. Extraction from finite deposits
  S.economy.deposits.forEach(function (dep) { const rg = RESOURCE_TYPES[dep.type].regen; if (rg) dep.amount = Math.min(dep.max, dep.amount + rg * dt); });
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!d.extract || !b._op) continue;
    const dep = depositFor(b);
    if (!dep || dep.amount <= 0) { b._eff = 0; if (!b._depleted) { b._depleted = true; notify('⛏️ ' + d.name + ': the ' + RESOURCE_TYPES[d.extract.type].name + ' deposit is depleted! Use recycling, renewables or imports.', 'bad'); } continue; }
    const units = Math.min(d.extract.rate * lvlMult(b.level) * b._eff * slow * dt, dep.amount);
    dep.amount -= units; inv[d.extract.type] += units;
    R.prod[d.extract.type] += units / dt; producers[d.extract.type].push({ b: b, u: units }); b._prod = units / dt; b._prodItem = d.extract.type;
  }
  // 2. Factories (recipes)
  const logi = hasTech('b_logistics') ? 1.2 : 1;
  RECIPE_ORDER.forEach(function (p) {
    const P = PRODUCTS[p];
    for (let i = 0; i < list.length; i++) {
      const b = list[i], d = bdef(b);
      if (!d.goods || !b._op || b.recipe !== p) continue;
      let want = d.goods * lvlMult(b.level) * b._eff * logi * mods.production * P.rate * slow * dt * (d.id === 'farm' ? seasonFarmMult() : 1);
      if (want <= 0) continue;
      if (!d.noInputs) {
        // buy missing inputs abroad (if trade allows), then use the primary or alternative recipe
        for (const k in P.inputs) { const need = want * P.inputs[k]; if (inv[k] < need) inv[k] += tryImport(k, need - inv[k], b); }
        let inputs = P.inputs, f = 1;
        for (const k in inputs) { const need = want * inputs[k]; f = Math.min(f, need > 0 ? inv[k] / need : 1); }
        if (f < 1 && P.alt) {
          let fa = 1; for (const k in P.alt) { const need = want * P.alt[k]; fa = Math.min(fa, need > 0 ? inv[k] / need : 1); }
          if (fa > f) { inputs = P.alt; f = fa; }
        }
        want *= clamp(f, 0, 1);
        for (const k in inputs) {
          const used2 = want * inputs[k];
          inv[k] = Math.max(0, inv[k] - used2);
          const val = used2 * price[k];
          b._inputCost += val / dt; payProducers(producers[k], val, dt, k);
          R.del[k] += used2 / dt;
        }
      }
      inv[p] += want; R.prod[p] += want / dt; producers[p].push({ b: b, u: want }); b._prod = want / dt; b._prodItem = p;
    }
  });
  // 3. Recycling: waste → materials
  if (SIM.recycled > 0) { const u = SIM.recycled * 0.4 * dt; inv.materials += u; R.prod.materials += u / dt; }
  // 4. Consumers
  const needs = []; // {b, p, u}
  let evDemand = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (d.goodsUse && b._op) {
      const u = d.goodsUse * lvlMult(b.level) * b._eff * dt;
      if (d.sector === 'FOOD') { const br = inv.bread > 0 ? Math.min(u * 0.3, inv.bread) : 0; needs.push({ b: b, p: 'food', u: u - br }); if (br > 0) needs.push({ b: b, p: 'bread', u: br, optional: true }); }
      else { needs.push({ b: b, p: 'materials', u: u * 0.6 }); needs.push({ b: b, p: 'electronics', u: u * 0.25 }); }
    }
    if (!b.built && b.buildTime > 0) needs.push({ b: b, p: 'materials', u: Math.min(60, bdef(b).cost / 400 / b.buildTime) * dt, construction: true });
  }
  const evShare = hasTech('t_ev') ? Math.min(0.75, 0.2 + 0.08 * chargers) : Math.min(0.15, 0.03 * chargers);
  const fuelMult = 1 - 0.1 * ppLevel('fuel');
  const fuelDemand = ((SIM.carTrips || 0) * 0.0015 * (1 - evShare) + trucks * 0.02 * (1 - evShare * 0.5)) * fuelMult;
  let gasCap = 0; MAP.lists.gas.forEach(function (b) { if (b._op) gasCap += bdef(b).fuelServe * lvlMult(b.level) * b._eff; });
  const fuelToServe = Math.min(fuelDemand, gasCap) * dt;
  if (fuelToServe > 0) MAP.lists.gas.forEach(function (b) { if (b._op && gasCap > 0) needs.push({ b: b, p: 'fuel', u: fuelToServe * bdef(b).fuelServe * lvlMult(b.level) * b._eff / gasCap, fuel: true }); });
  const vehicleDemand = S.city.population * 0.0004 * (1 - evShare * 0.2) * dt;
  needs.push({ b: null, p: 'vehicles', u: vehicleDemand });
  evDemand = (SIM.carTrips || 0) * 0.004 * evShare;
  // Logistics (trucks; diesel shortage slows the fleet)
  const fuelRatioPrev = SIM.fuelRatio === undefined ? 1 : SIM.fuelRatio;
  const logisticsCap = trucks * 1.67 * (1 + 0.1 * ppLevel('logistics')) * (hasTech('b_supply') ? 1.25 : 1) * (0.5 + 0.5 * Math.max(fuelRatioPrev, evShare)) * (1 - SIM.traffic / 300) * (mods.logistics || 1) * dt;
  PRODUCT_IDS.forEach(function (p) {
    const list2 = needs.filter(function (n) { return n.p === p; });
    let want = 0; list2.forEach(function (n) { want += n.u; });
    R.dem[p] += want / dt;
    if (want <= 0) return;
    const fromStock = Math.min(inv[p], want);
    const imp = tryImport(p, want - fromStock, null);
    const got = fromStock + imp;
    R.fr[p] = want > 0 ? got / want : 1;
    inv[p] -= fromStock;
    const deliverVal = fromStock * price[p];
    payProducers(producers[p], deliverVal, dt, p);
    R.del[p] += got / dt;
    // consumers pay only for the imported share (domestic goods are included in their base prices)
    if (imp > 0) { const impCost = imp * (importDeal(p) || { price: price[p] }).price; list2.forEach(function (n) { if (n.b) n.b._impCost += impCost * (n.u / want) / dt; }); }
    list2.forEach(function (n) { if (n.b && !n.optional) n.b._fr = R.fr[p]; if (n.fuel) n.b._fuelRev += n.u * R.fr[p] * price.fuel * 0.35 / dt; });
  });
  // Logistics bottleneck
  let totalMoved = 0; PRODUCT_IDS.forEach(function (p) { if (!PRODUCTS[p].raw) totalMoved += R.del[p] * dt; });
  const logisticsRatio = totalMoved > logisticsCap ? logisticsCap / totalMoved : 1;
  // Transport costs grow with congestion (trucks stuck in traffic)
  SIM.logiCost = totalMoved / dt * 0.012 * (1 + SIM.traffic / 60) * (mods.logiCost || 1) * priceLevel();
  if (logisticsRatio < 1) PRODUCT_IDS.forEach(function (p) { R.fr[p] *= logisticsRatio; });
  // 5. Exports of surplus
  PRODUCT_IDS.forEach(function (p) {
    if (!allowExport(p) || tradeLeft <= 0) return;
    const keep = S.trade.mode[p] === 'export' ? 0 : Math.min(cap * 0.06, 15 + R.dem[p] * 30);
    const surplus = inv[p] - keep; if (surplus <= 0.5) return;
    const deal = exportDeal(p); if (!deal) return;
    const u = Math.min(surplus, tradeLeft); tradeLeft -= u;
    inv[p] -= u; const val = u * deal.price;
    payProducers(producers[p], val, dt, p);
    exportValue += val; R.exp[p] += u / dt; flow(deal.city, u);
    S.trade.exportTotal += val;
  });
  // 6. Dynamic prices from supply & demand
  const vol = difficulty().vol;
  PRODUCT_IDS.forEach(function (p) {
    const sup = R.prod[p] + R.imp[p] + 1, dem = R.dem[p] + R.del[p] * 0.5 + R.exp[p] + 1;
    const pl = priceLevel();
    const target = PRODUCTS[p].base * pl * clamp(Math.sqrt(dem / sup), 0.6, 1.8) * (1 + gauss() * 0.01 * vol);
    price[p] = clamp(lerp(price[p], target, 0.04 * dt * (difficulty().dynamic ? 1.8 : 1)), PRODUCTS[p].base * 0.3 * pl, PRODUCTS[p].base * 4 * pl);
    if (!isFinite(inv[p]) || inv[p] < 0) inv[p] = 0;
  });
  used = 0; PRODUCT_IDS.forEach(function (p) { used += inv[p]; });
  if (used > cap) { const k = cap / used; PRODUCT_IDS.forEach(function (p) { inv[p] *= k; }); used = cap; }
  // Results
  let whIn = 0, whOut = 0; PRODUCT_IDS.forEach(function (p) { whIn += R.prod[p] + R.imp[p]; whOut += R.del[p] + R.exp[p]; });
  SIM.whIn = whIn; SIM.whOut = whOut;
  SIM.sc = R; SIM.fulfill = R.fr; SIM.storageCap = cap; SIM.storageUsed = used; SIM.trucks = trucks; SIM.logisticsCap = logisticsCap / dt; SIM.logisticsRatio = logisticsRatio;
  SIM.evShare = evShare; SIM.evDemand = evDemand; SIM.fuelDemand = fuelDemand; SIM.gasCap = gasCap;
  SIM.fuelRatio = fuelDemand > 0.01 ? Math.min(1, gasCap / fuelDemand) * (R.fr.fuel !== undefined ? R.fr.fuel : 1) : 1;
  SIM.exportValue = exportValue / dt; SIM.importValue = importValue / dt;
  // Part 3 compatibility aggregates
  let gp = 0, gu = 0, gd = 0;
  ['materials', 'food', 'electronics', 'vehicles', 'fuel'].forEach(function (p) { gp += R.prod[p]; gu += R.dem[p]; gd += R.dem[p] * R.fr[p]; });
  SIM.goodsProd = gp; SIM.goodsUse = gu; SIM.goodsRatio = gu > 0 ? gd / gu : 1; SIM.goodsStock = used; SIM.goodsCap = cap;
  SIM.exported = 0; PRODUCT_IDS.forEach(function (p) { SIM.exported += R.exp[p]; }); SIM.exportCap = SIM.tradeCap;
  SIM.goodsRatioSmooth = lerp(SIM.goodsRatioSmooth === undefined ? 1 : SIM.goodsRatioSmooth, R.fr.food, 0.1);
}
/* Split sales value among the buildings that produced the item this tick */
function payProducers(prods, value, dt, p) {
  if (value <= 0) return;
  let tot = 0; prods.forEach(function (x) { tot += x.u; });
  if (tot <= 0) {
    // stock produced earlier: pay current producers of this item by capacity
    const cands = S.buildings.list.filter(function (b) { return b._op && (b.recipe === p || (bdef(b).extract && bdef(b).extract.type === p)); });
    if (!cands.length) { SIM._orphanSales = (SIM._orphanSales || 0) + value / dt; return; }
    cands.forEach(function (b) { b._prodRev += value / cands.length / dt; });
    return;
  }
  prods.forEach(function (x) { x.b._prodRev += value * (x.u / tot) / dt; });
}

/* Owner traits for market share: quality, price, reputation, advertising */
function ownerTraits(owner, sector) {
  const t = S.clock.runSec;
  if (owner === 'player') {
    const cid = sector === 'INDUSTRY' ? companyForSector('INDUSTRY') : companyForSector(sector);
    const c = cid ? S.companies.list[cid] : null;
    return { q: 0.9 + (c ? 0.04 * c.level + 0.05 * Math.min(4, c.products) : 0) + (S.city.skill - 50) / 250, p: S.market.price[sector] || 1,
      rep: 0.7 + (cid && S.p5 && S.p5.lines[cid] ? (S.market.rep + S.p5.lines[cid].brand) / 2 : S.market.rep) / 250, ad: adMult('player', sector) };
  }
  if (owner === 'city') return { q: 0.85, p: 1, rep: 0.9, ad: 1 };
  const a = S.ai[owner] || { quality: 1, price: 1, rep: 50 };
  return { q: a.quality, p: a.price, rep: 0.7 + a.rep / 250, ad: (a.adUntil || 0) > t ? 1.3 : 1 };
}
function landValue(b) {
  const dist = districtOf(b.x, b.y);
  const cov = b._cov ? (b._cov.fire + b._cov.police + b._cov.health) : 0;
  return 0.88 + cov * 0.04 + (dist ? dist.level * 0.04 + dist.green * 0.02 : 0) - SIM.traffic * 0.0008;
}

/* Main economic simulation step (dt in simulated seconds, normally 1). */
function econTick(dt) {
  const list = S.buildings.list;
  const city = S.city;
  const pop = city.population;
  const hour = gameHour();
  const season = currentSeason();
  const mods = globalMods(); SIM.mods = mods;
  const pol = salaryPolicy();
  const diff = difficulty();
  const Wx = weatherEffects(); SIM.weatherFx = Wx;
  const aiMult = hasTech('s_ai') ? 1.1 : 1;
  const skillMult = 0.85 + city.skill * 0.003;
  if (city.sandbox && (!S.p6 || !S.p6.sandbox || S.p6.sandbox.money)) { S.money = Math.max(S.money, 1e12); S.budget = Math.max(S.budget, 1e12); }
  const t0 = performance.now();

  // --- 1. Operating state & labor market --------------------------------
  let jobs = 0, builtTiles = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    b._op = b.built && (d.noRoad || b._road) && !(b.fire > 0) && !b.closed;
    if (b.built && d.id !== 'tree') builtTiles += d.w * d.h;
    if (b._op) jobs += b.workers;
  }
  const effJobs = jobs * mods.jobs;
  const labor = Math.floor(pop * 0.55);
  const staffRatio = jobs > 0 ? Math.min(1, labor / jobs) : 1;
  const employed = Math.min(labor, effJobs);
  const unemployment = Math.max(0, labor - employed) / Math.max(labor, 20);
  SIM.labor = labor; SIM.jobs = jobs; SIM.employed = employed; SIM.unemployment = unemployment; SIM.builtTiles = builtTiles;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    b._actW = b._op ? b.workers * staffRatio : 0;
    b._weff = b._op ? workerEff(d, b._actW) * (d.workers ? pol.eff * skillMult : 1) : 0;
  }

  // --- 2. Electricity ------------------------------------------------------
  let gen = 0, fuelCost = 0;
  const renew = (hasTech('adv_solar') ? 1.5 : 1) * (1 + 0.1 * ppLevel('renew'));
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (d.power > 0 && b._op) {
      let out = d.power * lvlMult(b.level) * b._weff * (b.damaged ? 0.5 : 1) * Wx.powerProd * mods.powerProd;
      if (d.id === 'solar') out *= renew * (hour > 6 && hour < 19 ? 1.15 : 0.6) * (FX.weather === 'rain' || FX.weather === 'storm' ? 0.7 : 1);
      if (d.id === 'wind') out *= renew * (FX.weather === 'storm' ? 1.2 : 1);
      b._gen = out; gen += out; fuelCost += out * (d.fuel || 0);
    } else b._gen = 0;
  }
  gen += city.emergencyPower;
  const useMult = season.power * (hasTech('e_grid') ? 0.9 : 1) * Wx.powerDemand * mods.powerDemand;
  const consumers = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    b._powered = true;
    if (d.power < 0 && b._op) consumers.push(b);
  }
  const prio = { SERVICE: 0, CIVIC: 0, WATER: 1, HOUSING: 2, EDUCATION: 3, TRANSPORT: 3, WASTE: 3, SCIENCE: 4, LANDMARK: 5 };
  const pv = function (b) { const p = prio[bdef(b).sector]; return p === undefined ? 6 : p; };
  consumers.sort(function (a, b) { return pv(a) - pv(b) || a.id - b.id; });
  let powerDemand = (SIM.evDemand || 0) * useMult;
  const imported = S.events.active.some(function (a) { return a.id === 'energyshortage' && a.choice === 'import'; });
  let needTotal = powerDemand; for (let i = 0; i < consumers.length; i++) needTotal += -bdef(consumers[i]).power * lvlMult(consumers[i].level) * useMult;
  if (imported) gen += needTotal * 0.3;
  let remaining = gen - powerDemand;
  for (let i = 0; i < consumers.length; i++) {
    const b = consumers[i];
    const need = -bdef(b).power * lvlMult(b.level) * useMult;
    powerDemand += need; b._pneed = need;
    if (remaining >= need) remaining -= need; else b._powered = false;
  }
  const powerRatio = powerDemand > 0 ? Math.min(1, gen / powerDemand) : 1;
  SIM.powerGen = gen; SIM.powerUse = powerDemand; SIM.powerRatio = powerRatio;

  // --- 3. Water ------------------------------------------------------------
  let wgen = 0, wuse = 0;
  const wMult = hasTech('c_water') ? 0.9 : 1;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!b._op) continue;
    if (d.water > 0) wgen += d.water * lvlMult(b.level) * b._weff * (b._powered ? 1 : 0.3) * (b.damaged ? 0.5 : 1) * (season.id === 'summer' && FX.weather === 'heatwave' ? 0.85 : 1) * mods.waterProd;
    else if (d.water < 0) wuse += -d.water * lvlMult(b.level) * wMult * mods.waterUse;
  }
  const waterRatio = wuse > 0 ? Math.min(1, wgen / wuse) : 1;
  SIM.waterGen = wgen; SIM.waterUse = wuse; SIM.waterRatio = waterRatio;

  // --- 4. Building efficiency ---------------------------------------------
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!b._op) { b._eff = 0; continue; }
    let e = b._weff * (b._powered ? 1 : 0) * (d.power < 0 && powerRatio < 1 ? 0.92 : 1) * (b.damaged ? 0.5 : 1) * aiMult;
    if (b.owner === 'player' && SIM.unpaid > 0) e *= 0.8;
    if (b.owner === 'city' && SIM.budgetUnpaid > 0) e *= 0.6;
    if (SIM.flood && b._nearWater) e *= 0.6;
    if (d.water < 0 && d.sector !== 'HOUSING') e *= 0.7 + 0.3 * waterRatio;
    b._eff = e;
  }

  // --- 5. Housing ------------------------------------------------------------
  let housingCap = 0, affordableCap = 0;
  const housingBonus = (1 + 0.05 * ppLevel('housing')) * mods.housingMult;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!d.housing || !b._op) { b._hcap = 0; continue; }
    const hc = d.housing * lvlMult(b.level) * housingBonus * (b._powered ? 1 : 0.5) * (0.5 + 0.5 * waterRatio) * (b.damaged ? 0.7 : 1);
    b._hcap = hc; housingCap += hc; if (d.quality <= 50) affordableCap += hc;
  }
  SIM.housingCap = housingCap;

  // --- 6. Waste --------------------------------------------------------------
  let indProd = 0, commOp = 0, wasteCap = 0, recycleCap = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!b._op) continue;
    if (d.goods || d.extract) indProd += (b._prod || 0);
    if (d.rev) commOp++;
    if (d.wasteCap) { const c = d.wasteCap * lvlMult(b.level) * b._eff * (hasTech('env_waste') ? 1.3 : 1); wasteCap += c; if (d.recycle) recycleCap += c; }
  }
  const wasteGen = (pop * 0.015 + indProd * 0.015 + commOp * 0.02) * (1 - 0.08 * ppLevel('waste'));
  const wAvail = wasteGen * dt + city.waste;
  const processed = Math.min(wAvail, wasteCap * dt);
  const natural = (pop < 100 ? 3 : 1.5) * dt;
  city.waste = Math.max(0, wAvail - processed - natural);
  SIM.recycled = wasteCap > 0 ? processed / dt * (recycleCap / wasteCap) : 0;
  SIM.wasteGen = wasteGen; SIM.wasteCap = wasteCap; SIM.wastePenalty = clamp(city.waste / (pop * 3 + 300), 0, 1);

  // --- 7. Supply chain & products ---------------------------------------------
  supplyChainTick(dt, mods, list);

  // --- 8. Sector supply & demand ------------------------------------------
  const tourists = city.tourists;
  const trips = pop * 0.35 + tourists * 0.4;
  let transitCap = 0, businessCount = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (d.transit) transitCap += d.transit * lvlMult(b.level) * b._eff * (hasTech('ng_hyperloop') ? 1.5 : 1) * mods.transit;
    if (d.rev && b._op) businessCount++;
  }
  const noise = S.economy.noise;
  SECTORS.forEach(function (s) {
    const v = (noise[s] || 1) + gauss() * 0.004 * (1 + 0.3 * S.meta.ngLevel) * diff.vol;
    noise[s] = clamp(lerp(v, 1, 0.01), 0.8, 1.2);
  });
  const housingWish = pop * 1.04 + 8 + Math.max(0, (city.happiness - 50)) * pop * 0.004 + Math.max(0, city.reputation - 50) * pop * 0.002;
  const demand = {
    FOOD: (pop * 1.0 + tourists * 1.2) * todCurve(hour, [12.5, 19.5], 2.2) * noise.FOOD,
    SHOPPING: (pop * 0.8 + tourists * 1.0) * todCurve(hour, [15], 3.5) * noise.SHOPPING,
    ENTERTAINMENT: (pop * 0.6 + tourists * 1.3) * todCurve(hour, [21], 3) * noise.ENTERTAINMENT,
    TRANSPORT: trips * noise.TRANSPORT,
    HOUSING: housingWish,
    ENERGY: powerDemand,
    FINANCE: (pop * 0.25 + businessCount * 2) * noise.FINANCE,
    TECHNOLOGY: (pop * 0.22 + employed * 0.08) * noise.TECHNOLOGY
  };
  // Part 5: economic cycle, weekends, world events and campaigns scale demand
  ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'].forEach(function (s) { demand[s] *= mods.demand * (mods.demandS[s] || 1); });
  const supply = { FOOD: 0, SHOPPING: 0, ENTERTAINMENT: 0, TRANSPORT: transitCap, HOUSING: housingCap, ENERGY: gen, FINANCE: 0, TECHNOLOGY: 0 };
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (d.cap && supply[d.sector] !== undefined && d.sector !== 'TRANSPORT') supply[d.sector] += d.cap * lvlMult(b.level) * b._eff;
  }
  SECTORS.forEach(function (s) {
    const dd = demand[s], ss = supply[s];
    const r = ss > 0 ? dd / ss : 2;
    SIM.saleMult[s] = saleMultFromRatio(r);
    const M = Math.max(dd, ss, 1);
    const tD = 100 * dd / M, tS = 100 * ss / M;
    SIM.dDisp[s] = SIM.dDisp[s] === undefined ? tD : lerp(SIM.dDisp[s], tD, 0.25);
    SIM.sDisp[s] = SIM.sDisp[s] === undefined ? tS : lerp(SIM.sDisp[s], tS, 0.25);
  });
  SIM.demand = demand; SIM.supply = supply; SIM.housingDemandRatio = housingWish / Math.max(1, housingCap);

  // --- 9. Market share per sector (price, quality, location, reputation, advertising) ---
  const gm = mods.rev * (1 - city.crime * 0.004) * (0.85 + city.happiness * 0.003);
  const trafficMult = 1 - SIM.traffic * 0.0025;
  const util = {}; SIM.share = {};
  ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY'].forEach(function (s) {
    const own = {};
    for (let i = 0; i < list.length; i++) {
      const b = list[i], d = bdef(b);
      if (d.sector !== s || !d.cap || !b._op) continue;
      const o = own[b.owner] || (own[b.owner] = { cap: 0, loc: 0, n: 0 });
      o.cap += d.cap * lvlMult(b.level) * b._eff; o.loc += landValue(b); o.n++;
    }
    let tot = 0; const keys = Object.keys(own);
    keys.forEach(function (k) { const o = own[k], t = ownerTraits(k, s); o.t = t; o.score = o.cap * t.q * Math.pow(t.p, -1.5) * t.rep * t.ad * (o.loc / Math.max(1, o.n)); tot += o.score; });
    const D = demand[s], Stot = supply[s], served = Math.min(D, Stot);
    let left = served;
    keys.forEach(function (k) { const o = own[k]; o.srv = tot > 0 ? Math.min(o.cap, served * o.score / tot) : 0; left -= o.srv; });
    if (left > 0.01) { let rem = 0; keys.forEach(function (k) { rem += own[k].cap - own[k].srv; }); if (rem > 0) keys.forEach(function (k) { const o = own[k]; o.srv += left * (o.cap - o.srv) / rem; }); }
    const premium = D > Stot && Stot > 0 ? Math.min(1.5, 1 + (D / Stot - 1) * 0.5) : 1;
    util[s] = {}; SIM.share[s] = {};
    keys.forEach(function (k) { const o = own[k]; util[s][k] = { u: o.cap > 0 ? o.srv / o.cap : 0, prem: premium * o.t.p }; SIM.share[s][k] = served > 0 ? o.srv / served : 0; });
  });

  // --- 10. Revenue & costs per building, attributed to owners ------------------
  const OWN = {};
  const acc = function (o) { return OWN[o] || (OWN[o] = { rev: 0, cost: 0, tax: 0, bills: 0, imp: 0, sal: 0, maint: 0 }); };
  let tourWeight = 0, transitWeight = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!b._op) continue;
    if (d.tour) tourWeight += d.tour * lvlMult(b.level) * b._eff;
    if (d.transit) transitWeight += d.transit * lvlMult(b.level) * b._eff;
  }
  const riders = Math.min(trips * 0.85, transitCap);
  const fareTotal = riders * FARE_PER_RIDER * gm * mods.fares;
  const tourTotal = tourists * TOURIST_SPEND * 0.5 * gm;
  const occupied = Math.min(pop, housingCap);
  const occRate = housingCap > 0 ? occupied / housingCap : 0;
  const surplus = Math.max(0, gen - powerDemand) * 0.004;
  const compStats = {};
  COMPANY_DEFS.forEach(function (c) { compStats[c.id] = { rev: 0, cost: 0, emp: 0, count: 0, assets: 0 }; });
  const tax = city.tax / 100;
  const B = { incomeTax: 0, businessTax: 0, propertyTax: 0, utilities: 0, fares: 0, tourism: 0, rent: 0, energy: 0, space: 0, grant: 0 };
  const BE = { salaries: 0, maintenance: 0, fuel: fuelCost * mods.electricity, roads: 0 };
  const P = { business: 0, products: 0, rent: 0, tourism: 0, transport: 0, fuel: 0 };
  const PE = { salaries: 0, maintenance: 0, bills: 0, taxes: 0, imports: 0, loans: 0, dividends: 0 };
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    const cid = b.owner === 'player' ? companyForSector(d.sector) : null;
    if (cid && b.built) { compStats[cid].count++; compStats[cid].assets += d.cost * lvlMult(b.level); }
    b._rev = 0; b._cost = 0; b._cust = 0;
    if (!b.built) continue;
    const o = acc(b.owner);
    let r = 0, cat = null;
    if (b._op) {
      const cm = cid ? companyRevMult(cid) : 1;
      if (d.rev && util[d.sector] && util[d.sector][b.owner]) {
        let secMult = 1;
        if (d.cat === 'Commercial' && hasTech('b_marketing')) secMult *= 1.1;
        if (d.sector === 'FINANCE' && hasTech('b_finance')) secMult *= 1.15;
        if (d.sector === 'FINANCE') secMult *= mods.finRev;
        const goodsMult = d.goodsUse ? (0.55 + 0.45 * (b._fr === undefined ? 1 : b._fr)) : 1;
        const U = util[d.sector][b.owner];
        r = d.rev * lvlMult(b.level) * b._eff * U.u * U.prem * gm * secMult * cm * goodsMult * (d.cat === 'Commercial' ? trafficMult * mods.commRev : 1) * (d.sector === 'TECHNOLOGY' ? mods.techRev : 1) * ratingMult(b) * startupMult(b) * (b.discount ? 0.85 : 1);
        b._cust = d.cap * lvlMult(b.level) * b._eff * U.u;
        cat = 'business';
        if (b.owner === 'player') P.business += r;
      }
      if (b._prodRev) { const g = b._prodRev * gm * cm; r += g; if (!cat) cat = 'products'; if (b.owner === 'player') P.products += g; }
      if (b._fuelRev) { const f = b._fuelRev * gm; r += f; if (b.owner === 'player') P.fuel += f; }
      if (d.transit && transitWeight > 0) { const f = fareTotal * d.transit * lvlMult(b.level) * b._eff / transitWeight; r += f; b._cust = riders * d.transit * lvlMult(b.level) * b._eff / transitWeight; if (b.owner === 'city') B.fares += f; else if (b.owner === 'player') P.transport += f; }
      if (d.tour && tourWeight > 0) { const t = tourTotal * d.tour * lvlMult(b.level) * b._eff / tourWeight; r += t; if (b.owner === 'city') B.tourism += t; else if (b.owner === 'player') P.tourism += t; }
      if (d.housing && b._hcap) { const occ = b._hcap * occRate; const h = occ * d.rent * city.housingPrice * gm; r += h; b._cust = occ; if (b.owner === 'city') B.rent += h; else if (b.owner === 'player') P.rent += h; }
      if (d.power > 0 && gen > 0 && b._gen) { const e = surplus * b._gen / gen; r += e; B.energy += e; }
    }
    // costs
    const sal = b._actW * d.sal * pol.sal * mods.wage;
    const mt = b.closed ? 0 : d.maint * lvlMult(b.level) * diff.maint;
    let cost = sal + mt + (d.fuel ? b._gen * d.fuel * mods.electricity : 0) + (b._inputCost || 0) + (b._impCost || 0);
    if (b.owner !== 'city') {
      // private owners pay taxes and utility bills to the city
      const biz = r * tax * 0.6 * mods.taxHoliday;
      const prop = Math.pow(buildingValue(b), 0.8) * 0.0004;
      const bills = (b._powered && b._pneed ? b._pneed * 0.02 : 0) + (d.water < 0 ? -d.water * lvlMult(b.level) * 0.01 : 0);
      cost += biz + prop + bills;
      B.businessTax += biz; B.propertyTax += prop; B.utilities += bills;
      o.tax += biz + prop; o.bills += bills; o.imp += (b._impCost || 0) + (b._inputCost || 0);
      if (b.owner === 'player') { PE.taxes += biz + prop; PE.bills += bills; PE.imports += (b._impCost || 0) + (b._inputCost || 0); PE.salaries += sal; PE.maintenance += mt; }
    } else {
      BE.salaries += sal; BE.maintenance += mt;
    }
    o.rev += r; o.cost += cost; o.sal += sal; o.maint += mt;
    b._rev = r; b._cost = cost;
    if (cid) { compStats[cid].rev += r; compStats[cid].cost += cost; compStats[cid].emp += b._actW; }
  }
  // City-wide budget items
  B.incomeTax = employed * WAGE_PER_WORKER * tax * mods.tax * mods.taxHoliday;
  B.tourism += tourists * TOURIST_SPEND * 0.1;          // tourist tax
  if (S.space.stage >= 3) B.space = 2000 * (1 + 0.1 * ppLevel('spacebonus'));
  if (S.space.stage >= 3) S.economy.inventory.rare += 4 * dt;
  BE.roads = MAP.roadCount * 0.004 * (1 - (SIM.evShare || 0) * 0.3) * diff.maint;
  B.grant = 1.5 * clamp(1 - pop / 1500, 0, 1) / diff.maint * mods.grant;      // state grant for small towns
  // Player companies: dividends to outside shareholders
  for (const cid in compStats) {
    const cs = compStats[cid]; cs.profit = cs.rev - cs.cost;
    const c = S.companies.list[cid];
    if (c && cs.profit > 0 && c.own < 1) PE.dividends += cs.profit * (1 - c.own);
  }
  SIM.companies = compStats;
  S.bank.loans.forEach(function (l) { PE.loans += Math.min(l.perSec, l.remaining / dt); });

  // --- 11. Apply cash flows ---------------------------------------------------------
  const po = OWN.player || { rev: 0, cost: 0 };
  const pInc = po.rev + (SIM._orphanSales || 0);
  const pExpNoLoans = po.cost + PE.dividends;
  const pExp = pExpNoLoans + PE.loans;
  let bInc = 0; for (const k in B) bInc += B[k];
  let bExp = 0; for (const k in BE) bExp += BE[k];
  SIM._orphanSales = 0;
  S.money += (pInc - pExpNoLoans) * dt;
  if (!isFinite(S.money)) S.money = 0;
  if (S.money < 0) { S.money = 0; SIM.unpaid = 5; } else if (SIM.unpaid > 0) SIM.unpaid -= dt;
  S.money = Math.min(S.money, MONEY_CAP);
  S.budget += (bInc - bExp) * dt;
  if (!isFinite(S.budget)) S.budget = 0;
  if (S.budget < 0) { S.budget = 0; SIM.budgetUnpaid = 5; } else if (SIM.budgetUnpaid > 0) SIM.budgetUnpaid -= dt;
  S.budget = Math.min(S.budget, MONEY_CAP);
  AI_DEFS.forEach(function (a) {
    const st = S.ai[a.id], o = OWN[a.id];
    if (!o) { st.rev = 0; st.profit = 0; return; }
    st.rev = o.rev; st.profit = o.rev - o.cost;
    st.cash = Math.max(0, st.cash + st.profit * dt);
  });
  bankTick(dt);
  SIM.P = P; SIM.PE = PE; SIM.B = B; SIM.BE = BE; SIM.owners = OWN;
  SIM.pInc = pInc; SIM.pExp = pExp; SIM.pNet = pInc - pExp; SIM.bInc = bInc; SIM.bExp = bExp; SIM.bNet = bInc - bExp;
  SIM.income = pInc + bInc; SIM.expenses = pExp + bExp; SIM.net = SIM.income - SIM.expenses; SIM.taxIncome = B.incomeTax;
  // Part 3 compatible breakdowns
  SIM.rev = { business: P.business, goods: P.products, rent: P.rent, tax: B.incomeTax, tourism: P.tourism, transport: P.transport, energy: B.energy };
  SIM.exp = { salaries: PE.salaries, maintenance: PE.maintenance, electricity: PE.bills, loans: PE.loans, dividends: PE.dividends };
  S.statistics.totals.revenue += SIM.income * dt;
  S.statistics.run.revenue += SIM.income * dt;
  S.meta.lifetimeRevenue += SIM.income * dt;

  // --- 12. Traffic -------------------------------------------------------------------
  const rush = (hour >= 7 && hour < 9.5) || (hour >= 16.5 && hour < 19) ? 1.3 : (hour < 5 ? 0.4 : 0.9);
  const roadCap = (MAP.roadCapSum || MAP.roadCount * 7) * (hasTech('t_roads') ? 1.25 : 1) * mods.roadCap;
  const carTrips = Math.max(0, trips - riders) * rush + SIM.goodsProd * 0.3;
  let trafficT = 100 * carTrips / (roadCap + 20) * (hasTech('t_lights') ? 0.85 : 1) * (hasTech('ng_hyperloop') ? 0.7 : 1) * Wx.traffic * (1 - 0.05 * ppLevel('traffic')) * mods.traffic;
  if (pop > 150) trafficT *= 1 + (1 - (SIM.fuelRatio === undefined ? 1 : SIM.fuelRatio)) * 0.1;
  if (AG.vehicles.length >= 6) trafficT = trafficT * 0.8 + SIM.visualStopRatio * 100 * 0.2;
  SIM.traffic = lerp(SIM.traffic, clamp(trafficT, 0, 100), 0.1 * dt);
  city.traffic = SIM.traffic;
  SIM.transitCap = transitCap; SIM.riders = riders; SIM.trips = trips; SIM.carTrips = carTrips;

  // --- 13. Pollution -------------------------------------------------------------------
  let raw = 0, absorb = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i], d = bdef(b);
    if (!b.built) continue;
    if (d.pol > 0 && b._op) raw += d.pol * lvlMult(b.level) * Math.max(0.3, b._eff) * (d.cat === 'Industry' || d.cat === 'Resources' || d.smoke ? (hasTech('env_filters') ? 0.7 : 1) * mods.indPol : 1);
    else if (d.pol < 0) absorb += -d.pol * lvlMult(b.level) * (hasTech('env_green') ? 2 : 1);
  }
  raw += pop * 0.004 * (SIM.traffic / 50) * (hasTech('t_ev') ? 0.4 : 1) * (1 - (SIM.evShare || 0) * 0.8);
  raw += SIM.wastePenalty * 25;
  const netPol = Math.max(0, raw - absorb) * (hasTech('env_recycle') ? 0.85 : 1) * (hasTech('env_carbon') ? 0.6 : 1) * (1 - 0.05 * ppLevel('clean')) * mods.pollution;
  const polT = 100 * netPol / (netPol + 30 + builtTiles * 0.6);
  city.pollution = clamp(lerp(city.pollution, polT, 0.06 * dt), 0, 100);

  // --- 14. Crime ------------------------------------------------------------------------
  const density = Math.min(15, pop / (builtTiles * 25 + 1) * 5);
  const small = Math.min(1, pop / 200);
  let crimeT = 3 + (unemployment * 110 + Math.max(0, 55 - city.happiness) * 0.5 + density) * small + (pop > 150 ? (1 - SIM.cov.police) * 30 : 0);
  if (hasTech('d_police')) crimeT *= 0.85;
  if (SIM.budgetUnpaid > 0) crimeT += 8;
  city.crime = clamp(lerp(city.crime, clamp(crimeT, 0, 100), 0.05 * dt), 0, 100);

  // --- 15. Education & worker skill -------------------------------------------------------
  let schoolSeats = 0, uniSeats = 0;
  for (let i = 0; i < list.length; i++) { const b = list[i], d = bdef(b); if (d.edu && b._op) { const s2 = d.edu * lvlMult(b.level) * Math.max(0.3, b._eff); if (d.eduHigh) uniSeats += s2; else schoolSeats += s2; } }
  const children = pop * 0.18;
  const primary = children > 1 ? Math.min(1, schoolSeats / children) : (schoolSeats > 0 ? 1 : 0);
  const higher = Math.min(1, uniSeats / (pop * 0.05 + 1));
  const eduT = clamp(100 * (0.6 * primary + 0.4 * higher) + (hasTech('s_edu') ? 15 : 0) + mods.eduBonus, 0, 100);
  city.education = clamp(lerp(city.education, eduT, 0.03 * dt), 0, 100);
  city.skill = clamp(lerp(city.skill, 25 + city.education * 0.7, (hasTech('s_edu') ? 0.02 : 0.01) * dt), 0, 100);
  SIM.schoolSeats = schoolSeats; SIM.uniSeats = uniSeats; SIM.children = children;

  // --- 16. Housing market -----------------------------------------------------------------
  const priceT = clamp(0.7 + 0.35 * (housingWish / Math.max(1, housingCap)) + (city.reputation - 50) / 150 + (0.05 - interestRate()) * 3, 0.5, 3);
  city.housingPrice = clamp(lerp(city.housingPrice, priceT, 0.02 * dt), 0.3, 4);
  const affordableShare = housingCap > 0 ? affordableCap / housingCap : 1;
  SIM.housingSat = 100 * clamp(1.25 - (city.housingPrice - 1) * 0.8 - Math.max(0, 0.35 - affordableShare) * 1.2, 0, 1);
  SIM.affordableShare = affordableShare;

  // --- 17. Happiness ------------------------------------------------------------------------
  const F = [];
  const add = function (label, v) { if (Math.abs(v) >= 0.05) F.push([label, v]); return v; };
  let h = 58;
  h += add('Services coverage', (SIM.cov.fire + SIM.cov.police + SIM.cov.health) / 3 * 15);
  let green = 0;
  for (let i = 0; i < list.length; i++) { const b = list[i], d = bdef(b); if (d.hap && b._op) green += d.hap * lvlMult(b.level) * Math.max(0.5, b._eff); }
  h += add('Parks & culture', Math.min(12, green * 1.5 / (pop / 100 + 2)));
  if (pop > 20) {
    h += add('Entertainment', 8 * Math.min(1, supply.ENTERTAINMENT / Math.max(1, demand.ENTERTAINMENT)) - 4);
    h += add('Food availability', 6 * Math.min(1, supply.FOOD / Math.max(1, demand.FOOD)) - 3);
  }
  h += add('Tax rate', city.tax > 10 ? -(city.tax - 10) * 1.4 : (10 - city.tax) * 0.5);
  h += add('Unemployment', -unemployment * 45);
  h += add('Crime', -city.crime * 0.18);
  h += add('Pollution', -city.pollution * 0.2);
  h += add('Traffic', -SIM.traffic * 0.1);
  h += add('Power shortage', -(1 - powerRatio) * 25);
  h += add('Water shortage', -(1 - waterRatio) * 30);
  if (pop > housingCap * 1.02 + 1) h += add('Homelessness', -8);
  if (pop > 80) h += add('Housing affordability', (SIM.housingSat - 70) * 0.12);
  if (pop > 100) h += add('Waste', -SIM.wastePenalty * 15);
  if (pop > 150) h += add('Fuel availability', -(1 - SIM.fuelRatio) * 6);
  h += add('Education', city.education * 0.04);
  h += add('Season & weather', season.hap + Wx.hap);
  h += add('Salary policy', pol.hap);
  h += add('Landmarks & events', mods.hap);
  h += add('Civic pride (legacy)', 2 * ppLevel('happy'));
  if (hasTech('c_smart')) h += add('Smart City', 8);
  if (SIM.unpaid > 0) h += add('Unpaid bills', -8);
  if (SIM.budgetUnpaid > 0) h += add('Underfunded services', -10);
  SIM.hapFactors = F; SIM.hapTarget = clamp(h, 0, 100);
  city.happiness = clamp(lerp(city.happiness, SIM.hapTarget, 0.05 * dt), 0, 100);

  // --- 18. City reputation ------------------------------------------------------------------
  const tourScore = Math.min(100, tourists / (pop + 50) * 400);
  const econScore = 50 + 50 * Math.tanh(SIM.net / (pop * 0.05 + 10));
  const infra = 40 * (powerRatio + waterRatio) / 2 + 30 * (SIM.cov.fire + SIM.cov.police + SIM.cov.health) / 3 + 30 * (1 - SIM.traffic / 100);
  const repT = clamp(0.25 * city.happiness + 0.12 * (100 - city.pollution) + 0.13 * (100 - city.crime) + 0.1 * tourScore + 0.2 * econScore + 0.2 * infra - 10 + mods.repBonus + 2 * ppLevel('astro'), 0, 100);
  city.reputation = clamp(lerp(city.reputation, repT, 0.03 * dt), 0, 100);
  S.market.rep = clamp(lerp(S.market.rep, city.reputation, 0.002 * dt), 0, 100);

  // --- 19. Tourism --------------------------------------------------------------------------
  if (!city.tourismUnlocked && city.peakPop >= tourismThreshold()) {
    city.tourismUnlocked = true;
    notify('🧳 TOURISM unlocked! Build hotels, museums and attractions.', 'gold');
    sfx('levelup');
  }
  let touristsT = 0;
  if (city.tourismUnlocked) {
    const partners = WORLD_CITIES.filter(function (c) { return S.diplomacy[c.id].tourism; }).length;
    const attraction = tourWeight + pop * 0.03;
    touristsT = attraction * 0.2 * (1 - city.pollution / 150) * (1 - city.crime / 200) * (0.6 + city.happiness / 250) * (0.6 + city.reputation / 125) * season.tour * mods.tour * (1 + 0.08 * partners);
  }
  city.tourists = Math.max(0, lerp(city.tourists, touristsT, 0.05 * dt));

  // --- 20. Population ---------------------------------------------------------------------------
  let metroBonus = 0;
  MAP.lists.metros.forEach(function (b) { if (b._op) metroBonus += 0.05; });
  MAP.lists.trains.forEach(function (b) { if (b._op) metroBonus += 0.08; });
  const jobsFactor = unemployment < 0.12 ? 0.15 : -(unemployment - 0.12) * 1.6;
  const A = (city.happiness - 50) / 50 + jobsFactor - Math.max(0, city.tax - 10) * 0.035 - city.pollution * 0.004 + Math.min(0.3, metroBonus) + (city.reputation - 50) / 250;
  const gmult = mods.growth * season.growth;
  let p = pop;
  if (A > 0 && p < housingCap) p += Math.min(housingCap - p, (p * 0.006 + 0.3) * A * gmult * dt);
  if (A < 0) p -= p * 0.003 * (-A) * dt;
  if (city.tax > 22 && city.happiness < 45) p -= p * 0.002 * dt;
  if (p > housingCap) p -= Math.min(p - housingCap, (p - housingCap) * 0.04 * dt + 0.05);
  city.population = Math.max(0, p);
  city.peakPop = Math.max(city.peakPop, city.population);
  S.meta.bestPop = Math.max(S.meta.bestPop, city.population);
  SIM.attract = A;

  // --- 21. Research ---------------------------------------------------------------------------
  let rp = 0;
  for (let i = 0; i < list.length; i++) { const b = list[i], d = bdef(b); if (d.rp && b._op) rp += d.rp * lvlMult(b.level) * b._eff * startupMult(b); }
  rp *= (hasTech('s_method') ? 1.15 : 1) * (hasTech('s_quantum') ? 1.3 : 1) * mods.rp * (1 + city.education / 200);
  SIM.rpRate = rp;
  S.research.rp += rp * dt; S.research.total += rp * dt;

  // --- 22. Player companies: XP / levels (faster with skilled workers) --------------------------
  for (const cid in S.companies.list) {
    const c = S.companies.list[cid], cs = compStats[cid];
    if (cs.profit > 0) c.xp += cs.profit * dt * (0.8 + city.skill / 250) * businessGrowthMult();
    while (c.level < 10 && c.xp >= companyXpFor(c.level + 1)) {
      c.level++;
      notify('🏢 ' + companyDef(cid).name + ' reached Level ' + c.level + ' — ' + companyTitle(c.level) + '!', 'gold');
      flashBig(companyDef(cid).name + '<br>LEVEL ' + c.level);
      sfx('levelup');
      if (c.level === 3) notify('🔓 New exclusive building: ' + BUILDINGS[companyDef(cid).exclusive].name, 'gold');
    }
  }
  // --- 23. City level 1 → 20 ---------------------------------------------------------------------
  const lv = cityLevel();
  while (city.level < lv) {
    city.level++;
    const L = city.level;
    const reward = Math.round(400 * L * L), rpR = 8 * L;
    S.money = Math.min(MONEY_CAP, S.money + reward); S.budget = Math.min(MONEY_CAP, S.budget + reward * 2); S.research.rp += rpR;
    notify('🏙️ CITY LEVEL ' + L + ' — ' + cityLevelName(L) + '! +' + money(reward) + ', +' + money(reward * 2) + ' budget, +' + rpR + ' RP', 'gold');
    if (L === 20) { flashBig('🌆 GLOBAL METROPOLIS'); notify('🌆 GLOBAL METROPOLIS! Port, Space Center, international trade ×2 and global investors unlocked. Revenue +10%.', 'gold'); }
    else flashBig('🏙️ CITY LEVEL ' + L);
    sfx('levelup');
    logHistory('🏙️', 'City Level ' + L + ' — ' + cityLevelName(L), 'level');
    if (L % 5 === 0) fireworks(12);
  }
  p5EconAfter(dt);
  if (SIM.logiCost) { S.money = Math.max(0, S.money - SIM.logiCost * dt); SIM.pNet -= SIM.logiCost; SIM.net -= SIM.logiCost; if (SIM.PE) SIM.PE.logistics = SIM.logiCost; }
  if (typeof DBG !== 'undefined') DBG.econMs = lerp(DBG.econMs, performance.now() - t0, 0.2);
}
