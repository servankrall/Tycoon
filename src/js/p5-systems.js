'use strict';
/* BLOCK CITY TYCOON — PART 5 SYSTEMS — story, calendar, interest, investments, world events */
/* ============================ 14. P5 SYSTEMS ============================ */
/* --- Calendar: 7-day week, weekends & special weekends --------------------- */
function weekdayIndex() { return (gameDay() - 1) % 7; }
function weekdayName() { return WEEKDAYS[weekdayIndex()]; }
function isWeekend() { return weekdayIndex() >= 5; }
function weekNumber() { return Math.floor((gameDay() - 1) / 7) + 1; }
function specialWeekend() { return isWeekend() && S.p5.week.special ? SPECIAL_WEEKENDS[S.p5.week.special] : null; }
function calendarTick() {
  const w = S.p5.week, n = weekNumber();
  if (w.n !== n) {
    w.n = n;
    w.special = null;
    if (S.city.population >= 30 && RNG.next() < 0.35) {
      w.special = RNG.pick(Object.keys(SPECIAL_WEEKENDS));
      notify(SPECIAL_WEEKENDS[w.special].icon + ' Coming this weekend: ' + SPECIAL_WEEKENDS[w.special].name + ' — ' + SPECIAL_WEEKENDS[w.special].desc, 'gold');
    }
  }
  const wd = weekdayIndex();
  if (wd === 5 && S.p5._wkAnn !== n) {
    S.p5._wkAnn = n;
    const sp = specialWeekend();
    if (sp) { notify(sp.icon + ' ' + sp.name + ' has started!', 'gold'); flashBig(sp.icon + ' ' + sp.name); if (sp.id === 'festival') fireworks(10); }
    else toast('🎉 It is the weekend — tourism & entertainment up, offices quieter', 'good');
  }
}

/* --- Economic cycles & dynamic interest rate --------------------------------- */
function econPhase() { return ECON_PHASES[S.p5.econ.phase] || ECON_PHASES.NORMAL; }
function forceEconPhase(id, dur) {
  const e = S.p5.econ; if (!ECON_PHASES[id]) return;
  e.phase = id; e.until = S.clock.runSec + (dur || RNG.range(ECON_PHASES[id].dur[0], ECON_PHASES[id].dur[1]));
  notify(ECON_PHASES[id].icon + ' Economy: ' + id + ' — ' + ECON_PHASES[id].desc, id === 'RECESSION' || id === 'SLOWDOWN' ? 'bad' : 'good');
  logHistory(ECON_PHASES[id].icon, 'Economy entered ' + id, 'economy');
}
function econCycleTick(dt) {
  const e = S.p5.econ, t = S.clock.runSec;
  if (S.city.population < 40) { e.until = Math.max(e.until, t + 60); }
  else if (t >= e.until) {
    let nxt = econPhase().next;
    if (S.p5.world.active === 'recession' && nxt.indexOf('RECESSION') >= 0) nxt = ['RECESSION'];
    forceEconPhase(S.p11 ? p11NextPhase(nxt) : RNG.pick(nxt));          // Part 11: the city's indicators weigh the next phase
  }
  // Taylor-style rule: the central bank also reacts to inflation (Part 6 economy engine)
  let target = econPhase().rate + (S.p6 ? 1.2 * (S.p6.econ.infl - 0.02) : 0) + (S.p5.world.active === 'recession' ? -0.01 : 0) + (S.city.difficulty === 'HARD' || S.city.difficulty === 'EXTREME' ? 0.005 : 0) + (S.p11 ? p11RateAdjust() : 0);   // Part 11: growth & bank liquidity
  e.rate = clamp(e.rate + (target - e.rate) * 0.012 * dt, 0.01, 0.15);
  e._h = (e._h || 0) + dt;
  if (e._h >= 10) { e._h = 0; e.hist.push(+(e.rate * 100).toFixed(2)); if (e.hist.length > 60) e.hist.shift(); }
}
function interestRate() { return S.p5 ? S.p5.econ.rate : 0.05; }
/* Cheap money helps businesses grow; expensive money slows them down */
function businessGrowthMult() { return clamp(1 + (0.05 - interestRate()) * 6, 0.6, 1.3) * (S && S.p9 ? S.p9.econ.growthMult : 1); }

/* --- Part 5 modifiers feeding the Part 4 economy (see globalMods) ----------------- */
function part5Mods(m) {
  m.demand = 1; m.demandS = {}; m.commRev = 1; m.techRev = 1; m.traffic = 1; m.pollution = 1; m.indPol = 1; m.trade = 1; m.transit = 1; m.grant = 1;
  if (!S.p5) return m;
  const ph = econPhase(), t = S.clock.runSec, p5 = S.p5;
  m.rev *= ph.rev; m.jobs *= ph.jobs; m.growth *= ph.growth; m.demand *= ph.demand;
  m.growth *= 0.9 + 0.1 * businessGrowthMult();
  const ds = function (s, v) { m.demandS[s] = (m.demandS[s] || 1) * v; };
  if (isWeekend()) {
    m.tour *= 1.25; m.traffic *= 1.15; ds('ENTERTAINMENT', 1.25); ds('FOOD', 1.1); ds('TECHNOLOGY', 0.85); ds('FINANCE', 0.85);
    const sp = specialWeekend();
    if (sp && sp.id === 'tourism') m.tour *= 2;
    if (sp && sp.id === 'business') m.commRev *= 2;
    if (sp && sp.id === 'festival') { m.hap += 8; ds('ENTERTAINMENT', 1.5); }
  }
  switch (p5.world.active) {
    case 'energy': m.powerProd *= 0.85; m.electricity *= 1.4; break;
    case 'techboom': ds('TECHNOLOGY', 1.3); m.rp *= 1.2; break;
    case 'tourboom': m.tour *= 1.4; break;
    case 'recession': m.demand *= 0.88; break;
    case 'food': ds('FOOD', 1.15); m.hap -= 4; break;
  }
  switch (p5.identity.id) {
    case 'GREEN': m.hap += 4; m.pollution *= 0.9; break;
    case 'BUSINESS': m.commRev *= 1.08; break;
    case 'TECH': m.rp *= 1.15; break;
    case 'TOURIST': m.tour *= 1.15; break;
    case 'INDUSTRIAL': m.production *= 1.1; m.pollution *= 1.05; break;
  }
  const ch = p5.story.choices;
  if (ch[2] === 'eco') { m.indPol *= 0.8; m.repBonus += 5; } else if (ch[2] === 'mega') { m.production *= 1.15; m.pollution *= 1.1; }
  if (p5.econ.stim > t) m.demand *= 1.06;
  if (p5.econ.aust > t) m.hap -= 5;
  if (ch[6] === 'export') m.trade *= 1.2; else if (ch[6] === 'local') m.commRev *= 1.08;
  if (ch[7] === 'open') m.rp *= 1.1; else if (ch[7] === 'patent') m.techRev *= 1.1;
  const pk = p5.perks;
  if (pk.solar) m.pollution *= 1 - 0.03 * pk.solar;
  if (pk.tech) m.rp *= 1 + 0.03 * pk.tech;
  if (pk.metro) m.transit *= 1 + 0.1 * pk.metro;
  if (pk.harbor) m.trade *= 1 + 0.15 * pk.harbor;
  if (p5.dd.level < 0) { m.grant *= 1 - p5.dd.level; m.rev *= 1 - 0.04 * p5.dd.level; }
  for (const s in p5.ads.live) { const a = p5.ads.live[s]; if (a.until > t) m.tour *= 1 + AD_TIERS[a.tier].tour; }
  if (AG.accidents && AG.accidents.length) m.traffic *= 1 + 0.08 * AG.accidents.length;
  return m;
}
/* Cost factor from the adaptive difficulty (never more than +8%) */
function ddCostFactor() { return S && S.p5 && S.settings.dynDiff !== false ? 1 + 0.08 * Math.max(0, S.p5.dd.level) : 1; }
function ddEventMult() { return S && S.p5 && S.settings.dynDiff !== false ? 1 + 0.25 * S.p5.dd.level : 1; }
function tourismThreshold() { return S.p5 && S.p5.challenge && S.p5.challenge.id === 'MAX_TOURISM' ? 800 : 1500; }

/* --- Investments ----------------------------------------------------------------- */
function investSizes(t) { const base = Math.round(t.min * costMult()); return [base, base * 5, base * 25]; }
function startInvestment(typeId, k) {
  if (!p5Unlocked('invest')) { toast('🔒 Unlocks in Story Chapter 3', 'bad'); sfx('error'); return; }
  const t = INVESTMENT_TYPES.find(function (x) { return x.id === typeId; }); if (!t) return;
  const amt = investSizes(t)[clamp(k | 0, 0, 2)];
  if (S.p5.invest.active.length >= 3) { toast('❌ Maximum 3 active investments', 'bad'); sfx('error'); return; }
  if (S.money < amt) { toast('❌ Not enough money (' + money(amt) + ')', 'bad'); sfx('error'); return; }
  S.money -= amt;
  const dur = t.dur * (S.p5.econ.phase === 'BOOM' ? 0.9 : 1);
  S.p5.invest.active.push({ id: S.p5.invest.nextId++, type: t.id, amount: amt, start: S.clock.runSec, ends: S.clock.runSec + dur });
  toast(t.icon + ' Invested ' + money(amt) + ' in ' + t.name, 'good'); sfx('money');
}
function investOdds(t) {
  const e = S.p5.econ;
  const adj = (0.05 - e.rate) * 2 + ({ BOOM: 0.08, NORMAL: 0, SLOWDOWN: -0.04, RECESSION: -0.1, RECOVERY: 0.03 })[e.phase] + (S.city.reputation - 50) / 500;
  const ps = clamp(t.p[0] + adj, 0.1, 0.85), pn = clamp(t.p[1], 0.1, 1 - ps);
  return { success: ps, neutral: pn, loss: Math.max(0, 1 - ps - pn) };
}
function investmentsTick() {
  const inv = S.p5.invest, t = S.clock.runSec;
  for (let i = inv.active.length - 1; i >= 0; i--) {
    const a = inv.active[i]; if (t < a.ends) continue;
    const T = INVESTMENT_TYPES.find(function (x) { return x.id === a.type; });
    const o = investOdds(T), r = RNG.next();
    let res, back;
    if (r < o.success) { res = 'Success'; back = a.amount * (1 + T.ret * RNG.range(0.8, 1.25)); }
    else if (r < o.success + o.neutral) { res = 'Neutral'; back = a.amount * RNG.range(0.95, 1.1); }
    else { res = 'Loss'; back = a.amount * RNG.range(0.25, 0.65); }
    back = Math.round(back);
    S.money = Math.min(MONEY_CAP, S.money + back);
    inv.profit += back - a.amount;
    inv.history.push({ type: a.type, amount: a.amount, back: back, res: res, day: gameDay() });
    if (inv.history.length > 12) inv.history.shift();
    inv.active.splice(i, 1);
    if (res === 'Success') {
      S.p5.perks[T.perk] = Math.min(10, (S.p5.perks[T.perk] || 0) + 1);
      if (T.perk === 'tech') S.research.rp += 20 + S.city.population * 0.01;
      notify('✅ ' + T.icon + ' ' + T.name + ' succeeded! Returned ' + money(back) + ' (+' + money(back - a.amount) + '). ' + T.perkText.replace('On success: ', ''), 'gold');
      sfx('achievement');
    } else if (res === 'Neutral') notify('➖ ' + T.icon + ' ' + T.name + ' broke even: returned ' + money(back) + '.', '');
    else { notify('❌ ' + T.icon + ' ' + T.name + ' failed. Only ' + money(back) + ' recovered.', 'bad'); sfx('error'); }
    logHistory(T.icon, T.name + ': ' + res + ' (' + signMoney(back - a.amount) + ')', 'invest');
  }
}

/* --- Startups (Technology District) -------------------------------------------------- */
function inTechDistrict(x, y, w, h, selfId) {
  const l = S.buildings.list;
  for (let i = 0; i < l.length; i++) {
    const b = l[i]; if (b.id === selfId || !b.built) continue;
    const d = BUILDINGS[b.type];
    if (!(d.sector === 'TECHNOLOGY' || d.cat === 'Science')) continue;
    const bd = bdef(b);
    const dx = Math.max(0, Math.max(b.x - (x + w - 1), x - (b.x + bd.w - 1))), dy = Math.max(0, Math.max(b.y - (y + h - 1), y - (b.y + bd.h - 1)));
    if (dx <= 4 && dy <= 4) return true;
  }
  return false;
}
function newStartup() {
  return { name: pick(STARTUP_NAMES_A) + pick(STARTUP_NAMES_B), stage: 0, prog: 0, age: 0, value: STARTUP_STAGES[0].value };
}
function startupMult(b) { return b.su ? STARTUP_STAGES[b.su.stage].mult : 1; }
function startupsTick(dt) {
  const t = S.clock.runSec;
  S.buildings.list.forEach(function (b) {
    if (b.type !== 'startup' || !b.built) return;
    if (!b.su) { b.su = newStartup(); S.p5.startups.founded++; }
    const su = b.su;
    su.age += dt;
    if (!b._op) return;
    const maxStage = p5Unlocked('unicorn') ? 3 : 2;
    const speed = (0.35 + S.city.skill / 220 + S.city.education / 350 + (S.p5.identity.id === 'TECH' ? 0.25 : 0) + (p5Unlocked('unicorn') ? 0.35 : 0)) * businessGrowthMult() * clamp(b._eff, 0, 1.3) * (S.p5.world.active === 'techboom' ? 1.3 : 1);
    if (su.stage < maxStage) su.prog += speed * dt / (70 * (su.stage + 1));
    if (su.prog >= 1 && su.stage < maxStage) {
      su.stage++; su.prog = 0;
      notify(STARTUP_STAGES[su.stage].icon + ' ' + su.name + ' reached the ' + STARTUP_STAGES[su.stage].name + ' stage!', 'gold');
      if (su.stage === 3) {
        flashBig('🦄 ' + su.name + '<br>UNICORN!'); fireworks(14);
        const c = S.companies.list.tech; if (c) c.xp += companyXpFor(Math.min(10, c.level + 1)) * 0.25;
        S.city.reputation = Math.min(100, S.city.reputation + 3);
        logHistory('🦄', su.name + ' became a unicorn — a major tech company', 'startup');
      } else logHistory(STARTUP_STAGES[su.stage].icon, su.name + ' grew to ' + STARTUP_STAGES[su.stage].name, 'startup');
    }
    // Risk: startups can fail, especially in recessions or when interest rates are high
    const risk = 0.0006 * dt * (1 + Math.max(0, interestRate() - 0.05) * 20) * (S.p5.econ.phase === 'RECESSION' ? 2.2 : 1) * (b._eff < 0.5 ? 2 : 1) * (su.stage === 0 ? 1.4 : su.stage === 3 ? 0.3 : 1);
    if (Math.random() < risk) {
      if (su.stage > 0) { su.stage--; su.prog = 0.5; notify('📉 ' + su.name + ' struggled and pivoted back to ' + STARTUP_STAGES[su.stage].name + '.', 'bad'); }
      else { const old = su.name; b.su = newStartup(); S.p5.startups.founded++; notify('💥 Startup ' + old + ' failed. ' + b.su.name + ' moved into the hub.', 'bad'); logHistory('💥', old + ' failed', 'startup'); }
    }
    const sv = STARTUP_STAGES[b.su.stage];
    b.su.value = Math.round(sv.value * (0.8 + b.su.prog * 0.6) * costMult() * econPhase().rev);
  });
}
function startupExit(b) {
  if (!b || !b.su || isAI(b)) return;
  if (!p5Unlocked('unicorn')) { toast('🔒 Startup IPOs unlock in Story Chapter 8', 'bad'); sfx('error'); return; }
  if (b.su.stage < 2) { toast('Only Scale-up and Unicorn startups can IPO', 'bad'); sfx('error'); return; }
  const v = b.su.value;
  S.money = Math.min(MONEY_CAP, S.money + v);
  S.p5.startups.exits++; S.p5.startups.exitValue += v;
  notify('🔔 ' + b.su.name + ' IPO! You sold your stake for ' + money(v) + '.', 'gold'); sfx('achievement'); fireworks(8);
  logHistory('🔔', b.su.name + ' IPO for ' + money(v), 'startup');
  b.su = newStartup(); S.p5.startups.founded++;
}

/* --- City score (0-1000), titles & world ranking ----------------------------------------- */
function techIndex() {
  const base = TECH_LIST.filter(function (t) { return !t.ng; }).length;
  return clamp(S.technology.unlocked.length / base * 75 + S.space.stage * 5 + Math.max(0, maxStartupStage() + 1) * 1.25, 0, 100);
}
function scoreGate(pop) { return clamp(Math.log10(pop + 1) / 5, 0.1, 1); }
function computeScore() {
  const c = S.city, pop = c.population;
  const trips = SIM.trips || pop * 0.35;
  const parts = {
    population: clamp(Math.log10(pop + 1) / 5 * 100, 0, 100),
    happiness: c.happiness,
    economy: clamp(50 + 35 * Math.tanh((SIM.net || 0) / (pop * 0.05 + 10)) + 15 * (1 - Math.min(1, SIM.unemployment * 4)), 0, 100),
    environment: clamp(100 - c.pollution * 1.3 - (SIM.wastePenalty || 0) * 25, 0, 100),
    technology: techIndex(),
    tourism: c.tourismUnlocked ? clamp(c.tourists / (pop * 0.25 + 100) * 100, 0, 100) : 0,
    transport: clamp(70 * (1 - SIM.traffic / 100) + 30 * Math.min(1, (SIM.riders || 0) / (trips * 0.3 + 1)), 0, 100),
    education: c.education,
    health: pop < 60 ? 50 : SIM.cov.health * 100,
    safety: clamp(100 - c.crime * 1.5, 0, 100)
  };
  const g = scoreGate(pop);
  let tot = parts.population;
  for (const k in parts) if (k !== 'population') tot += parts[k] * g;
  S.p5.score.comp = parts; S.p5.score.tech = parts.technology;
  S.p5.score.cur = clamp(Math.round(tot), 0, 1000);
  S.p5.score.best = Math.max(S.p5.score.best, S.p5.score.cur);
  if (PROFILE && S.p5.score.cur > PROFILE.highestScore && !S.city.sandbox) { PROFILE.highestScore = S.p5.score.cur; }
  return S.p5.score.cur;
}
function scoreTitle(sc) {
  if (sc === undefined) sc = S.p5.score.cur;
  if (S.p5.story.unlocked.future && sc >= 900) return 'Future Civilization';
  let t = SCORE_TITLES[0][1]; SCORE_TITLES.forEach(function (x) { if (sc >= x[0]) t = x[1]; }); return t;
}
function rivalScore(r) {
  const parts = [clamp(Math.log10(r.pop + 1) / 5 * 100, 0, 100)];
  const g = scoreGate(r.pop);
  const rest = r.hap + r.wealth * 100 + r.env + r.tech + r.tour + (r.hap + r.env) / 2 + (r.tech * 0.8 + 20) + r.hap + Math.min(100, r.hap + 10);
  return clamp(Math.round(parts[0] + rest * g), 0, 1000);
}
function rivalsTick() {
  const wa = S.p5.world.active, ph = econPhase();
  WORLD_CITIES.forEach(function (c, i) {
    const r = S.p5.rivals[c.id];
    const target = c.pop * 0.04 + S.city.peakPop * (0.55 + 0.5 * r.g) + S.clock.runSec * 0.02 * r.g;
    const gr = (wa === 'recession' ? 0.5 : 1) * ph.growth;
    r.pop = Math.max(10, lerp(r.pop, target, 0.012 * gr) * (1 + gauss() * 0.002));
    r.wealth = clamp(r.wealth + gauss() * 0.01 + (wa === 'recession' ? -0.004 : 0.001), 0.1, 1);
    r.tech = clamp(lerp(r.tech, techIndex() * (0.6 + 0.6 * r.g) + 10, 0.01) + (wa === 'techboom' ? 0.15 : 0) + gauss() * 0.4, 0, 100);
    r.tour = clamp(r.tour + gauss() * 0.6 + (wa === 'tourboom' ? 0.3 : 0), 0, 100);
    r.hap = clamp(r.hap + gauss() * 0.5 + (wa === 'food' ? -0.2 : 0) + (60 - r.hap) * 0.01, 10, 98);
    r.env = clamp(r.env + gauss() * 0.4 + (wa === 'energy' ? 0.1 : 0) + (55 - r.env) * 0.005, 5, 100);
    if (i === 0 && Math.random() < 0.01) r.g = clamp(r.g + gauss() * 0.05, 0.4, 1.8);
  });
}
function playerStats() {
  let wealth = S.money + S.budget; for (const id in S.companies.list) { const c = S.companies.list[id]; wealth += c.price * SHARES_TOTAL * c.own; }
  return { score: S.p5.score.cur, pop: S.city.population, wealth: wealth, tech: techIndex(), tour: S.p5.score.comp.tourism || 0, hap: S.city.happiness, env: S.p5.score.comp.environment || 0 };
}
function rankingTable(cat) {
  const me = playerStats();
  const rows = [{ id: 'me', name: S.city.name, icon: '⭐', v: me[cat], me: true }];
  WORLD_CITIES.forEach(function (c) {
    const r = S.p5.rivals[c.id];
    const v = cat === 'score' ? rivalScore(r) : cat === 'pop' ? r.pop : cat === 'wealth' ? r.pop * r.wealth * 60 : r[cat];
    rows.push({ id: c.id, name: c.name, icon: c.icon, v: v });
  });
  rows.sort(function (a, b) { return b.v - a.v; });
  return rows;
}
function playerRank(cat) { const t = rankingTable(cat); for (let i = 0; i < t.length; i++) if (t[i].me) return i + 1; return t.length; }

/* --- World events -------------------------------------------------------------------- */
function worldEvent() { return S.p5.world.active ? WORLD_EVENTS.find(function (x) { return x.id === S.p5.world.active; }) : null; }
function startWorldEvent(id) {
  const ev = WORLD_EVENTS.find(function (x) { return x.id === id; }) || RNG.pick(WORLD_EVENTS);
  const w = S.p5.world;
  w.active = ev.id; w.ends = S.clock.runSec + ev.dur; w.count++;
  notify('🌐 WORLD EVENT: ' + ev.icon + ' ' + ev.name + ' — ' + ev.desc, ev.good ? 'gold' : 'bad');
  flashBig('🌐 ' + ev.icon + ' ' + ev.name); sfx('event');
  logHistory(ev.icon, 'World event: ' + ev.name, 'world');
  if (ev.id === 'recession' && (S.p5.econ.phase === 'NORMAL' || S.p5.econ.phase === 'BOOM')) forceEconPhase('SLOWDOWN', 200);
  if (ev.id === 'food') S.economy.prices.food = Math.min(PRODUCTS.food.base * 5, S.economy.prices.food * 1.6);
}
function worldEventsTick() {
  const w = S.p5.world, t = S.clock.runSec;
  if (w.active && t >= w.ends) { const ev = worldEvent(); notify('🌐 World event over: ' + (ev ? ev.name : ''), ''); w.active = null; w.nextAt = t + RNG.range(900, 1800) / Math.max(0.5, ddEventMult()); }
  if (!w.active && S.city.population >= 300 && t >= w.nextAt && !S.p5.admin.noEvents) startWorldEvent();
}

/* --- City identity ------------------------------------------------------------------------ */
function identityTick() {
  const p = S.p5.identity, list = S.buildings.list;
  let green = 0, biz = 0, tech = 0, ind = 0, renew = 0, power = 0, fin = 0, ent = 0;
  list.forEach(function (b) {
    if (!b._op || isAI(b)) return; const d = BUILDINGS[b.type];
    if (d.hap || d.pol < 0) green += 1;
    if (d.cat === 'Commercial' && d.sector !== 'TECHNOLOGY') biz += b._rev || 0;
    if (d.sector === 'FINANCE') fin += b._rev || 0;
    if (d.sector === 'ENTERTAINMENT') ent += (b._rev || 0) + (d.tour || 0) * 0.01;
    if (d.sector === 'TECHNOLOGY' || d.cat === 'Science') tech += (b._rev || 0) + (d.rp || 0) * 40;
    if (d.goods || d.extract) ind += b._prodRev || b._prod || 0;
    if (d.power > 0) { power += b._gen || 0; if (!d.fuel) renew += b._gen || 0; }
  });
  const pop = Math.max(20, S.city.population);
  const raw = {
    GREEN: green / (list.length + 5) * 2 + (power > 0 ? renew / power : 0) * 0.6 + (1 - S.city.pollution / 100) * 0.4,
    BUSINESS: biz / (biz + tech + ind + 5) * 1.6,
    TECH: tech / (biz + tech + ind + 5) * 1.6 + techIndex() / 200,
    TOURIST: Math.min(1.5, S.city.tourists / (pop * 0.15)),
    FINANCIAL: fin / (biz + tech + ind + fin + 5) * 1.6,
    ENTERTAINMENT: ent / (biz + tech + ind + ent + 5) * 1.6 + (isWeekend() ? 0.05 : 0),
    INDUSTRIAL: ind / (biz + tech + ind + 5) * 1.6 + S.city.pollution / 200
  };
  let sum = 0; for (const k in raw) sum += raw[k];
  for (const k in raw) p.pts[k] += raw[k] / Math.max(0.01, sum);
  let tot = 0, best = null; for (const k in p.pts) { tot += p.pts[k]; if (!best || p.pts[k] > p.pts[best]) best = k; }
  if (tot < 20 || S.city.population < 120) return;
  const share = p.pts[best] / tot;
  if (share > 0.25 && best !== p.id && (!p.id || p.pts[best] > p.pts[p.id] * 1.15)) {
    const had = p.id; p.id = best;
    const I = IDENTITIES[best];
    notify(I.icon + ' Your city identity is now ' + I.name + '! Bonus: ' + I.bonus, 'gold'); flashBig(I.icon + ' ' + I.name);
    logHistory(I.icon, (had ? 'Identity changed to ' : 'City identity: ') + I.name, 'identity');
    applyIdentityTheme();
  }
}
function applyIdentityTheme() {
  const I = S && S.p5 && IDENTITIES[S.p5.identity.id];
  document.documentElement.style.setProperty('--accent', I ? I.color : '#ffd166');
}

/* --- Milestones, firsts & the museum ------------------------------------------------------ */
function milestoneTick() {
  const rev = S.statistics.run.revenue, pop = S.city.population, tech = S.p5.score.tech;
  MILESTONES.forEach(function (m) {
    if (S.p5.ms[m.id]) return;
    const v = m.kind === 'money' ? rev : m.kind === 'pop' ? pop : tech;
    if (v >= m.v) {
      S.p5.ms[m.id] = 1;
      logHistory(m.icon, 'Milestone: ' + m.name, 'milestone');
      if (S.clock.runSec > 5) celebrate(m.icon + ' MILESTONE<br>' + m.name.toUpperCase(), 10);
    }
  });
  if (S.money >= 1000) markFirst('money1k', '💵', 'First $1,000 in the bank');
  if (builtCount() >= 1 && S.statistics.totals.built >= 1) {
    const fb = S.buildings.list.find(function (b) { return b.owner === 'player' && b.built && b.type !== 'tree'; });
    if (fb) markFirst('building', BUILDINGS[fb.type].icon, 'First building: ' + BUILDINGS[fb.type].name);
  }
}
function celebrate(html, fw) { flashBig(html); fireworks(S.settings.particleReduce ? Math.ceil((fw || 8) / 3) : (fw || 8)); sfx('achievement'); }
/* Called once when a building finishes construction */
function p5OnBuilt(b) {
  const d = BUILDINGS[b.type];
  if (isAI(b)) return;
  if (d.id === 'skyscraper' && markFirst('sky', '🌆', 'First skyscraper: ' + d.name)) cinematic(b, 'FIRST SKYSCRAPER!');
  else if (d.landmark && markFirst('landmark', d.icon, 'First landmark: ' + d.name)) cinematic(b, 'NEW LANDMARK!');
  else if (d.landmark) { logHistory(d.icon, 'Landmark built: ' + d.name, 'landmark'); cinematic(b, 'NEW LANDMARK!'); }
  if (d.id === 'startup' && !b.su) { b.su = newStartup(); S.p5.startups.founded++; notify('💡 Startup ' + b.su.name + ' opened in your Technology District!', 'good'); }
}

/* --- Challenges (mode, daily, weekly) ------------------------------------------------------ */
function challengeDef(id) { return CHALLENGES.find(function (c) { return c.id === id; }); }
function activeChallenge() { const c = S.p5.challenge; return c && !c.done && !c.failed ? challengeDef(c.id) : null; }
function challengeBans(d) { const c = activeChallenge(); return c && c.ban && c.ban(d) ? c : null; }
function challengeTick() {
  const c = S.p5.challenge;
  if (c && !c.done && !c.failed) {
    const def = challengeDef(c.id);
    if (def.id === 'NO_TAX') S.city.tax = 0;
    if (def.limit && S.clock.runSec - c.start > def.limit) { c.failed = true; notify('⏱️ Challenge failed: ' + def.name + ' — time is up. Try again from the main menu!', 'bad'); }
    else if (def.check()) {
      c.done = true; PROFILE.challenges[def.id] = 1; saveProfile();
      celebrate('🏆 CHALLENGE COMPLETE<br>' + def.name, 16);
      grantP5Reward(def.reward, 'Challenge ' + def.name + ' complete');
      logHistory('🏆', 'Challenge completed: ' + def.name, 'challenge');
    }
  }
  [['daily', DAILY_TEMPLATES], ['weekly', WEEKLY_TEMPLATES]].forEach(function (pair) {
    const x = S.p5[pair[0]]; if (!x || x.done || x.failed) return;
    const tpl = pair[1].find(function (t) { return t.id === x.id; }); if (!tpl) return;
    if (x.key !== (pair[0] === 'daily' ? dailyKey() : weeklyKey())) { x.failed = true; return; }
    if (tpl.limit && S.clock.runSec - x.start > tpl.limit) { x.failed = true; notify('⏱️ ' + (pair[0] === 'daily' ? 'Daily' : 'Weekly') + ' challenge failed — out of time.', 'bad'); return; }
    if (x.tainted) { x.failed = true; notify('❌ Weekly challenge failed: you built a factory.', 'bad'); return; }
    if (challengeProgress(pair[0]) >= 1) {
      x.done = true;
      PROFILE[pair[0]][x.key] = 1; saveProfile();
      const pool = Object.keys(COSMETICS).filter(function (k) { return !hasCosmetic(k); });
      const r = pair[0] === 'daily' ? { money: Math.round(2000 * costMult() * cityLevel()), rp: 20 * cityLevel() } : { pp: 5, badge: 'Weekly ' + x.key };
      if (pool.length) r.cosmetic = pool[0]; else if (pair[0] === 'daily') r.pp = 2;
      celebrate('🎯 ' + (pair[0] === 'daily' ? 'DAILY' : 'WEEKLY') + ' CHALLENGE<br>COMPLETE', 12);
      grantP5Reward(r, (pair[0] === 'daily' ? 'Daily' : 'Weekly') + ' challenge');
      logHistory('🎯', (pair[0] === 'daily' ? 'Daily' : 'Weekly') + ' challenge completed', 'challenge');
    }
  });
}
function dateHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function dailyKey() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function weeklyKey() { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); const wk = Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7); return d.getFullYear() + '-W' + wk; }
function todaysChallenge(kind) {
  const key = kind === 'daily' ? dailyKey() : weeklyKey(), h = dateHash(key + kind);
  const tpl = kind === 'daily' ? DAILY_TEMPLATES[h % DAILY_TEMPLATES.length] : WEEKLY_TEMPLATES[h % WEEKLY_TEMPLATES.length];
  const v = tpl.vals ? tpl.vals[(h >>> 5) % tpl.vals.length] : tpl.v;
  return { key: key, tpl: tpl, v: v, text: tpl.text(v) };
}
function challengeMetric(m) {
  switch (m) {
    case 'pop': return S.city.population;
    case 'revenue': return S.statistics.run.revenue;
    case 'built': return S.statistics.totals.built;
    case 'happy': return S.city.happiness;
    case 'techs': return S.technology.unlocked.length;
    case 'happyPop': return S.city.happiness >= 90 && S.city.population > 5000 ? 1 : 0;
    case 'tourists': return S.city.tourists;
    case 'contracts': return S.contracts.completed;
    case 'score': return S.p5.score.cur;
  }
  return 0;
}
function acceptChallenge(kind) {
  if (S.city.sandbox) { toast('Challenges are disabled in sandbox cities', 'bad'); return; }
  const tc = todaysChallenge(kind);
  if (PROFILE[kind][tc.key]) { toast('✅ Already completed — come back ' + (kind === 'daily' ? 'tomorrow' : 'next week') + '!', 'good'); return; }
  const m = tc.tpl.metric;
  S.p5[kind] = { key: tc.key, id: tc.tpl.id, v: tc.v, start: S.clock.runSec, base: { m: tc.tpl.abs ? 0 : challengeMetric(m) }, done: false, failed: false, tainted: false };
  toast('🎯 ' + (kind === 'daily' ? 'Daily' : 'Weekly') + ' challenge accepted: ' + tc.text, 'good'); sfx('click');
}
function challengeProgress(kind) {
  const x = S.p5[kind]; if (!x) return 0;
  const tpl = (kind === 'daily' ? DAILY_TEMPLATES : WEEKLY_TEMPLATES).find(function (t) { return t.id === x.id; }); if (!tpl) return 0;
  return clamp((challengeMetric(tpl.metric) - (x.base.m || 0)) / Math.max(1e-9, x.v), 0, 1);
}

/* --- Player titles & profile stats ----------------------------------------------------------- */
function profileTick(dt) {
  if (!PROFILE) return;
  PROFILE.playSec += dt;
  if (!S.city.sandbox) {
    PROFILE.peakPop = Math.max(PROFILE.peakPop, S.city.population);
    PROFILE.peakWealth = Math.max(PROFILE.peakWealth, playerStats().wealth);
    TITLES.forEach(function (t) { if (PROFILE.titles.indexOf(t.id) < 0 && t.check()) grantTitle(t.id); });
  }
  S.p5._profAcc = (S.p5._profAcc || 0) + dt;
  if (S.p5._profAcc >= 15) { S.p5._profAcc = 0; saveProfile(); }
}

/* --- Story campaign ------------------------------------------------------------------------------ */
function storyChapter() { return STORY[S.p5.story.ch] || null; }
function storyActive() { return !S.city.sandbox && !S.p5.challenge && S.p5.story.ch < STORY.length; }
function storyTick() {
  if (S.city.sandbox || S.p5.challenge) { STORY.forEach(function (c) { S.p5.story.unlocked[c.unlock] = 1; }); return; }
  const st = S.p5.story, C = storyChapter();
  if (!C) return;
  if (S.p5._ff) { storyFastForward(); return; }
  if (UI.dialog) return;
  if (st.phase === 'intro') {
    if (!STARTED || $('modalWrap').classList.contains('show') || (!S.tutorial.done && S.p5.tut.step < 1)) return;
    showDialogue(C.intro, { chapter: st.ch, onDone: function () { st.phase = 'active'; st.hold = 0; if (C.start) C.start(); } });
  } else if (st.phase === 'active') {
    if (C.check()) {
      if (C.choice && !st.choices[st.ch]) { st.phase = 'choice'; showStoryChoice(C); }
      else finishChapter();
    }
  } else if (st.phase === 'choice') { if (!st.choices[st.ch]) showStoryChoice(C); else finishChapter(); }
}
function showStoryChoice(C) {
  const st = S.p5.story;
  showDialogue([[C.choice.who, C.choice.q]], { choices: C.choice.opts, onChoice: function (id) { chooseStory(st.ch, id); } });
}
function chooseStory(chIdx, optId) {
  const C = STORY[chIdx]; if (!C || !C.choice) return;
  const o = C.choice.opts.find(function (x) { return x.id === optId; }); if (!o) return;
  S.p5.story.choices[chIdx] = optId;
  if (optId === 'stimulus') { const c = Math.round(S.budget * 0.15); S.budget -= c; S.p5.econ.stim = S.clock.runSec + 600; }
  if (optId === 'austerity') { S.budget = Math.min(MONEY_CAP, S.budget * 1.1); S.p5.econ.aust = S.clock.runSec + 600; }
  logHistory('⚖️', 'Chapter ' + (chIdx + 1) + ' decision: ' + o.label.replace(/^\S+\s/, ''), 'story');
  toast('✅ Decision: ' + o.label + ' — ' + o.text, 'good');
  finishChapter();
}
function finishChapter() {
  const st = S.p5.story, C = storyChapter(); if (!C) return;
  st.phase = 'outro';
  showDialogue(C.outro, { onDone: function () {
    st.unlocked[C.unlock] = 1;
    const r = grantP5Reward(C.reward, null);
    notify('📖 Chapter ' + (st.ch + 1) + ' — ' + C.title + ' complete! 🔓 ' + C.unlockText + (r ? ' · 🎁 ' + r : ''), 'gold');
    logHistory('📖', 'Chapter ' + (st.ch + 1) + ' complete: ' + C.title, 'story');
    celebrate('📖 CHAPTER ' + (st.ch + 1) + ' COMPLETE<br>' + C.title.toUpperCase(), st.ch >= 8 ? 20 : 8);
    if (C.unlock === 'mega') { const tall = S.buildings.list.filter(function (b) { return b.built && !isAI(b); }).sort(function (a, b) { return buildingHeight(b) - buildingHeight(a); })[0]; if (tall) cinematic(tall, 'MEGA CITY!'); }
    if (C.unlock === 'future') { S.settings.theme = 'golden'; applyTheme(); grantTitle('Global Architect'); }
    st.ch++; st.phase = 'intro'; st.hold = 0;
    firstTime('story_' + C.unlock, '🔓 ' + C.unlockText, unlockHelp(C.unlock));
  } });
}
function unlockHelp(k) {
  return ({ reviews: 'Select a shop or restaurant to read its customer reviews. Higher ratings bring more customers.', ads: 'Companies → Market: run LOCAL, REGIONAL or GLOBAL campaigns and compare their ROI.',
    invest: 'Companies → Investments: fund projects with different risk and return.', bank: 'City → Economy shows the economic cycle and the central bank interest rate.',
    startups: 'Build a Startup Hub (Commercial) next to offices, labs or campuses.', ranking: 'City → Ranking compares you with other world cities.',
    global: 'GLOBAL ad campaigns reach the whole world and bring tourists.', unicorn: 'Scale-up startups can now IPO from their building panel.',
    mega: 'Your skyline is legendary. Keep raising your City Score.', future: 'The golden era begins. Try Challenges and daily goals from the main menu!' })[k] || '';
}
/* Old (v4) saves and experienced players: silently complete chapters whose goals are already met */
function storyFastForward() {
  const st = S.p5.story; delete S.p5._ff;
  let n = 0;
  while (st.ch < STORY.length) {
    const C = STORY[st.ch];
    // A migrated city counts a chapter as done when its goal is met or the city is clearly past that stage
    const past = [100, 250, 150, 400, 1500, 2500, 4000, 6000, 1e9, 1e9][st.ch];
    let ok = st.ch < 9 && S.city.peakPop >= past;
    if (!ok && st.ch !== 3 && st.ch !== 4 && st.ch !== 9) { try { ok = C.check(); } catch (e) { ok = false; } }
    if (!ok) break;
    st.unlocked[C.unlock] = 1; st.ch++; n++;
  }
  st.phase = 'intro';
  if (n) notify('📖 Story campaign: ' + n + ' chapter(s) already accomplished by your city. Continuing at Chapter ' + Math.min(STORY.length, st.ch + 1) + '.', 'gold');
}

/* --- Dynamic difficulty (fair: small, visible adjustments) --------------------------------------------- */
function dynDifficultyTick() {
  const dd = S.p5.dd, t = S.clock.runSec;
  if (S.settings.dynDiff === false || S.city.sandbox || S.p5.challenge) { dd.level = 0; return; }
  if (t - dd.lastEval < 60) return;
  const pop = S.city.population, growth = pop - dd.lastPop;
  dd.lastEval = t; dd.lastPop = pop;
  const fast = growth > Math.max(10, pop * 0.05) && S.city.happiness > 65 && (SIM.pNet || 0) > 0 && (SIM.bNet || 0) > 0;
  const struggle = SIM.unpaid > 0 || SIM.budgetUnpaid > 0 || ((SIM.pNet || 0) < 0 && S.money < 300) || S.city.happiness < 40 || growth < -Math.max(3, pop * 0.02);
  const before = dd.level;
  if (fast) dd.level = Math.min(1, dd.level + 0.1);
  else if (struggle) dd.level = Math.max(-1, dd.level - 0.15);
  else dd.level += (0 - dd.level) * 0.1;
  if (before < 0.5 && dd.level >= 0.5) notify('📈 Adaptive difficulty: your city is thriving — prices are slightly higher (+' + Math.round(8 * dd.level) + '%) and events a bit more frequent.', '');
  if (struggle && dd.level <= -0.3 && S.money < 400 && t >= dd.fundAt) {
    const gift = Math.round(600 * (1 + cityLevel()) * costMult());
    S.money += gift; S.budget += gift; dd.fundAt = t + 900;
    notify('🤝 Mayor support fund: +' + money(gift) + ' money and budget to help you recover. Tip: ' + (SIM.pNet < 0 ? 'reduce workers or demolish unprofitable buildings.' : 'check the ⚠️ problems bar at the top.'), 'gold');
  }
}

/* --- City feedback engine ---------------------------------------------------------------------------------- */
function feedbackTick() {
  const c = S.city, pop = c.population, out = [];
  const add = function (id, sev, extra) { out.push({ id: id, sev: clamp(sev, 0.1, 1), extra: extra || '' }); };
  if ((SIM.housingDemandRatio || 0) > 1.08 && pop >= SIM.housingCap * 0.95 && pop > 8) add('housing', (SIM.housingDemandRatio - 1) * 2);
  if (c.pollution > 35) add('pollution', c.pollution / 80, Math.round(c.pollution) + '%');
  if (SIM.traffic > 55) add('traffic', SIM.traffic / 90, Math.round(SIM.traffic) + '%');
  if (SIM.unemployment > 0.12 && pop > 40) add('unemployment', SIM.unemployment * 3, pct(SIM.unemployment * 100));
  if (SIM.powerRatio < 0.97 && SIM.powerUse > 0) add('power', 1 - SIM.powerRatio + 0.3, pct(SIM.powerRatio * 100));
  if (SIM.waterRatio < 0.97 && SIM.waterUse > 0) add('water', 1 - SIM.waterRatio + 0.3, pct(SIM.waterRatio * 100));
  if (c.crime > 35 && pop > 150) add('crime', c.crime / 70, Math.round(c.crime) + '%');
  if (c.happiness < 40) add('happiness', (50 - c.happiness) / 40, pct(c.happiness));
  if ((SIM.wastePenalty || 0) > 0.3) add('waste', SIM.wastePenalty);
  if ((SIM.bNet || 0) < 0 && S.budget < -SIM.bNet * 120) add('budget', 0.8, signMoney(SIM.bNet) + '/s');
  if (pop > 400 && SIM.cov.health < 0.4) add('service', 0.5, pct(SIM.cov.health * 100) + ' covered');
  const bad = S.buildings.list.filter(function (b) { return b.owner === 'player' && b.health !== undefined && b.health < 25 && b.built; });
  if (bad.length) add('business', 0.6, bad.length + ' building' + (bad.length > 1 ? 's' : ''));
  out.sort(function (a, b) { return b.sev - a.sev; });
  SIM.issues = out;
}
function issueRects(id) {
  const R = [], list = S.buildings.list;
  const pushB = function (b) { const d = bdef(b); R.push({ x: b.x, y: b.y, w: d.w, h: d.h }); };
  switch (id) {
    case 'housing': list.forEach(function (b) { if (b._hcap && b._cust >= b._hcap * 0.95) pushB(b); }); if (!R.length) MAP.lists.homes.forEach(pushB); break;
    case 'pollution': list.forEach(function (b) { if (b._op && BUILDINGS[b.type].pol > 0) pushB(b); }); break;
    case 'traffic': {
      const seen = {};
      AG.vehicles.forEach(function (v) { if (v.speed === 0 && v.path) { const t = v.path[v.seg]; if (!seen[t]) { seen[t] = 1; R.push({ x: t % MAP.W, y: (t / MAP.W) | 0, w: 1, h: 1 }); } } });
      if (!R.length) for (let i = 0; i < MAP.roads.length && R.length < 60; i++) if (MAP.roads[i] && MAP.inter[i]) R.push({ x: i % MAP.W, y: (i / MAP.W) | 0, w: 1, h: 1 });
    } break;
    case 'unemployment': case 'happiness': case 'waste': MAP.lists.homes.forEach(pushB); break;
    case 'power': list.forEach(function (b) { if (b.built && !b._powered) pushB(b); }); if (!R.length) list.forEach(function (b) { if (BUILDINGS[b.type].power > 0) pushB(b); }); break;
    case 'water': list.forEach(function (b) { if (b._op && BUILDINGS[b.type].water < 0) pushB(b); }); break;
    case 'crime': list.forEach(function (b) { if (b.built && b._cov && !b._cov.police && BUILDINGS[b.type].id !== 'tree') pushB(b); }); break;
    case 'service': list.forEach(function (b) { if (b.built && b._cov && !b._cov.health && BUILDINGS[b.type].id !== 'tree') pushB(b); }); break;
    case 'budget': list.forEach(function (b) { if (b.owner === 'city' && b.built && BUILDINGS[b.type].maint > 1) pushB(b); }); break;
    case 'business': list.forEach(function (b) { if (b.owner === 'player' && b.health !== undefined && b.health < 25) pushB(b); }); break;
  }
  return R.slice(0, 200);
}
function focusIssue(id) {
  const R = issueRects(id), def = ISSUE_DEFS[id];
  if (!def) return;
  FX.hl = { rects: R, until: FX.time + 7, color: id === 'traffic' || id === 'pollution' ? '#ff9f1c' : '#ef476f' };
  if (R.length) {
    let sx = 0, sy = 0; R.forEach(function (r) { sx += r.x + r.w / 2; sy += r.y + r.h / 2; });
    camFlyTo(sx / R.length * TILE, sy / R.length * TILE, Math.max(CAM.zoom, 0.8));
  }
  toast(def.icon + ' ' + def.text + ' — ' + def.tip, 'bad');
  sfx('click');
  if (id === 'business') { const b = S.buildings.list.find(function (x) { return x.owner === 'player' && x.health < 25; }); if (b) selectBuilding(b); }
}
function camFlyTo(x, y, zoom) {
  if (S.settings.reducedMotion) { CAM.x = x; CAM.y = y; if (zoom) CAM.zoom = zoom; clampCamera(); return; }
  FX.fly = { x0: CAM.x, y0: CAM.y, z0: CAM.zoom, x1: x, y1: y, z1: zoom || CAM.zoom, t: 0, dur: 0.9 };
}

/* --- Citizen thoughts (speech bubbles backed by real city data) ------------------------------------------ */
function thoughtCandidates(c) {
  const out = [];
  const pc = function (id, w) { if (w > 0) out.push([id, w]); };
  if (c.tourist) { pc('park', c.parkUntil ? 2 : 0); pc('happy', S.city.happiness > 65 ? 1 : 0); pc('weekend', isWeekend() ? 0.6 : 0); return out; }
  pc('traffic', SIM.traffic > 50 ? SIM.traffic / 30 : 0);
  pc('park', c.parkUntil ? 2.5 : 0);
  pc('food', SIM.supply && SIM.demand && SIM.supply.FOOD < SIM.demand.FOOD * 0.8 && S.city.population > 25 ? 1.5 : 0);
  pc('rent', (SIM.housingSat || 100) < 55 ? 1.6 : 0);
  pc('transit', (SIM.riders || 0) > 80 && SIM.traffic < 45 ? 1.2 : 0);
  pc('pollution', S.city.pollution > 35 ? S.city.pollution / 30 : 0);
  pc('jobs', !c.work && SIM.unemployment > 0.08 ? 2 : 0);
  pc('crime', S.city.crime > 30 ? S.city.crime / 30 : 0);
  pc('power', SIM.powerRatio < 0.95 ? 2 : 0);
  pc('waste', (SIM.wastePenalty || 0) > 0.3 ? 1.5 : 0);
  pc('happy', c.happiness > 75 && S.city.happiness > 65 ? 1 : 0);
  pc('shop', c.state === 'GO_SHOPPING' ? 0.6 : 0);
  pc('weekend', isWeekend() ? 0.4 : 0);
  pc('fav', c.mem && c.target && (c.target === c.mem.favShop || c.target === c.mem.favFood) ? 1 : 0);
  // Part 6 voices
  pc('metroFar', S.city.population > 2500 && !countAny('metro') ? 1.3 : 0);
  pc('parksUp', S.p6 && S.p6.day.snap && MAP.lists.parks.length > (S.p6.day.snap.parks || 0) && c.parkUntil ? 1.5 : 0);
  pc('pricesUp', S.p6 && S.p6.econ.infl > 0.045 ? S.p6.econ.infl * 25 : 0);
  pc('trafficToday', SIM.traffic > 65 ? 1.2 : 0);
  pc('winter', currentSeason().id === 'winter' ? 0.4 : 0);
  return out;
}
function thoughtsTick() {
  if (S.settings.bubbles === false || !AG.citizens.length) return;
  let active = 0; AG.citizens.forEach(function (c) { if (c.bubble && c.bubble.until > FX.time) active++; });
  if (active >= (PERF.scale < 0.7 ? 1 : 4)) return;
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
  const vis = AG.citizens.filter(function (c) { return !c.inside && !c.driving && c.x > tl.x && c.x < br.x && c.y > tl.y && c.y < br.y; });
  if (!vis.length) return;
  const c = pick(vis);
  const cands = thoughtCandidates(c); if (!cands.length) return;
  const th = weightedPick(cands, function (x) { return x[1]; }); if (!th) return;
  const def = THOUGHTS.find(function (t) { return t.id === th[0]; });
  c.bubble = { text: pick(def.t), until: FX.time + 4.5, bad: !!def.bad };
  SIM.voices = SIM.voices || {};
  SIM.voices[def.id] = (SIM.voices[def.id] || 0) + 1;
}

/* --- Traffic incidents & emergency response -------------------------------------------------------------- */
AG.accidents = [];
function accidentTick(dt) {
  if (S.p5.admin.noEvents) return;
  const moving = AG.vehicles.filter(function (v) { return !v.siren && v.speed > 5 && v.path && v.seg > 0; });
  if (S.city.population < 60 || moving.length < 8 || AG.accidents.length >= 2) return;
  const wx = FX.weather === 'rain' || FX.weather === 'snow' || FX.weather === 'storm' ? 1.6 : 1;
  const p = 0.0009 * dt * (SIM.traffic / 50 + 0.3) * Math.min(2, moving.length / 20) * wx * ddEventMult();
  if (RNG.next() < p) triggerAccident(RNG.pick(moving));
}
function triggerAccident(v, atTile) {
  if (!v && atTile === undefined) { const m = AG.vehicles.filter(function (x) { return !x.siren && x.path; }); v = pick(m); }
  let tile;
  if (atTile !== undefined && atTile >= 0 && MAP.roads[atTile]) tile = atTile;
  else if (v) tile = v.path[Math.min(v.seg, v.path.length - 1)];
  else { const roads = []; for (let i = 0; i < MAP.roads.length; i++) if (MAP.roads[i]) roads.push(i); if (!roads.length) return null; tile = pick(roads); }
  if (AG.accidents.some(function (a) { return a.tile === tile; })) return null;
  const c = tileCenter(tile);
  const acc = { tile: tile, x: c.x, y: c.y, t: 0, cols: [v ? v.color : '#e63946', pick(VEHICLE_SPECS.car.colors)], needAmb: countAny('hospital') > 0, needPol: countAny('police') > 0, amb: false, pol: false, clearing: -1 };
  if (v) { const i = AG.vehicles.indexOf(v); if (i >= 0) removeVehicle(i, false); }
  MAP.blocked[tile] = 1; MAP.pathCache.clear();
  AG.accidents.push(acc);
  S.p5.stats.accidents++;
  const src = function (type) { const l = S.buildings.list.filter(function (b) { return b.type === type && b._op && b._entry >= 0 && MAP.comp[b._entry] === MAP.comp[tile]; }); return nearestOf(l, c.x, c.y); };
  if (S.p9) {          // Emergency AI 2.0: best unit by travel time, congestion, road status and station capacity
    const e1 = acc.needAmb ? emergencyDispatch('medical', tile, { priority: 3 }) : null; if (e1) e1.accident = acc; else acc.needAmb = false;
    const e2 = acc.needPol ? emergencyDispatch('police', tile, { priority: 2 }) : null; if (e2) e2.accident = acc; else acc.needPol = false;
  } else {
    const hosp = src('hospital'), pol = src('police');
    if (hosp) { const e = dispatchToTile('ambulance', hosp, tile); if (e) e.accident = acc; else acc.needAmb = false; } else acc.needAmb = false;
    if (pol) { const e = dispatchToTile('police', pol, tile); if (e) e.accident = acc; else acc.needPol = false; } else acc.needPol = false;
  }
  notify('🚗💥 Traffic accident! ' + (acc.needAmb || acc.needPol ? (acc.needAmb ? '🚑 ' : '') + (acc.needPol ? '🚓 ' : '') + 'Emergency services are on the way.' : 'No hospital or police nearby — the road stays blocked longer.'), 'bad');
  if (S.settings.screenShake !== false) shake(2);
  return acc;
}
function dispatchToTile(type, from, tile) {
  if (!from || from._entry < 0) return null;
  let p = roadPath(from._entry, tile, true);
  if (!p) return null;
  if (p.length === 1) p = [p[0], p[0]];
  return makeVehicle(type, p, {});
}
function onEmergencyArrive(v) {
  const a = v.accident; if (!a || AG.accidents.indexOf(a) < 0) return;
  if (v.type === 'ambulance') a.amb = true;
  if (v.type === 'police') a.pol = true;
}
function updateAccidents(dt) {
  for (let i = AG.accidents.length - 1; i >= 0; i--) {
    const a = AG.accidents[i]; a.t += dt;
    const served = (!a.needAmb || a.amb) && (!a.needPol || a.pol);
    if (a.clearing < 0 && (served && (a.needAmb || a.needPol) || a.t > 95)) a.clearing = 6;
    if (a.clearing >= 0) {
      a.clearing -= dt;
      if (a.clearing <= 0) {
        MAP.blocked[a.tile] = 0; MAP.pathCache.clear(); AG.accidents.splice(i, 1); S.p5.stats.cleared++;
        toast('✅ Accident cleared — traffic is flowing again', 'good');
      }
    }
  }
}

/* --- Market system: reviews, business health, brand, product lines, AI competition, ad ROI ---------------------- */
function ratingMult(b) { return b.nrev ? (0.85 + 0.06 * b.rating) * (b.promo > S.clock.runSec ? 1.1 : 1) : 1; }
function reviewTarget(b) {
  const d = BUILDINGS[b.type];
  const staff = d.workers ? clamp(b._actW / Math.max(1, b.workers), 0, 1) : 1;
  const fr = b._fr === undefined ? 1 : b._fr;
  const tr = ownerTraits(b.owner, d.sector);
  const price = b.owner === 'player' ? (S.market.price[d.sector] || 1) : tr.p;
  const priceAdj = ({ 0.8: 0.5, 1: 0, 1.2: -0.4, 1.4: -0.85 })[price] !== undefined ? ({ 0.8: 0.5, 1: 0, 1.2: -0.4, 1.4: -0.85 })[price] : (1 - price) * 2;
  const capNow = d.cap * lvlMult(b.level) * Math.max(0.01, b._eff);
  const crowd = b._cust > capNow * 0.97 ? 0.35 : 0;
  return clamp(1.3 + 1.6 * staff + 0.8 * fr + (tr.q - 0.9) * 2 + priceAdj + (landValue(b) - 0.9) * 2 + (b.level - 1) * 0.15 - crowd - (SIM.traffic > 60 ? 0.3 : 0) + (b.discount ? 0.4 : 0) + (b.promo > S.clock.runSec ? 0.3 : 0), 1, 5);
}
function reviewsTick() {
  if (!p5Unlocked('reviews')) return;
  S.buildings.list.forEach(function (b) {
    const d = BUILDINGS[b.type];
    if (!d.rev || !b._op || !d.cap) return;
    if (Math.random() > 0.35) return;
    const stars = clamp(Math.round(reviewTarget(b) + gauss() * 0.9), 1, 5);
    const n = Math.min(200, b.nrev || 0);
    b.rating = n ? (b.rating * n + stars) / (n + 1) : stars;
    b.nrev = n + 1;
    b._reviews = b._reviews || [];
    b._reviews.unshift({ s: stars, t: pick(REVIEW_TEXT[stars]) });
    if (b._reviews.length > 5) b._reviews.pop();
    S.p5.stats.reviews++;
  });
}
function businessHealthTick(dt) {
  const t = S.clock.runSec;
  S.buildings.list.forEach(function (b) {
    const d = BUILDINGS[b.type];
    if (b.owner !== 'player' || !b.built || !(d.rev || d.goods)) return;
    if (b.closed) {
      if (b.closed < 9e15 && t >= b.closed) { b.closed = 0; b.health = 30; b.lowT = 0; notify('🔓 ' + d.name + ' reopened. Keep an eye on its finances.', ''); }
      return;
    }
    if (b.health === undefined) b.health = 60;
    const margin = (b._rev - b._cost) / Math.max(0.5, b._cost);
    const staff = d.workers ? clamp(b._actW / Math.max(1, b.workers), 0, 1) : 1;
    const target = clamp(50 + 40 * Math.tanh(margin * 1.5) + (b.nrev ? (b.rating - 3) * 6 : 0) + (staff - 0.8) * 20 + (b.discount ? 5 : 0) + (b.promo > t ? 8 : 0), 0, 100);
    b.health = clamp(lerp(b.health, target, 0.04 * dt), 0, 100);
    if (b.health < 10) {
      b.lowT = (b.lowT || 0) + dt;
      if (b.lowT >= 60) {
        b.closed = t + 150; b.lowT = 0;
        b.workers = Math.max(0, Math.floor(b.workers * 0.7));
        if (b.nrev) b.rating = Math.max(1, b.rating - 0.3);
        S.market.rep = Math.max(0, S.market.rep - 1);
        S.p5.stats.closures++;
        notify('🔒 ' + d.name + ' has temporarily CLOSED — it lost money for too long and staff left. Restructure or wait 2.5 min.', 'bad');
        logHistory('🔒', d.name + ' closed temporarily', 'business');
      }
    } else b.lowT = Math.max(0, (b.lowT || 0) - dt);
  });
}
function recoveryCost(b, k) { const base = buildCost(BUILDINGS[b.type]); return Math.max(50, Math.round(base * ({ restructure: 0.15, marketing: 0.08, staff: 0.05, reopen: 0.05 })[k])); }
function businessAction(b, k) {
  if (!b || b.owner !== 'player') return;
  const d = BUILDINGS[b.type], t = S.clock.runSec;
  if (k === 'discount') { b.discount = !b.discount; toast(b.discount ? '🏷️ Price reduction active: -15% revenue, happier customers' : 'Price reduction ended', 'good'); sfx('click'); return; }
  if (k === 'close') { confirmDialog('🔒 Close ' + d.name + '?', 'The business stops operating (no revenue, no staff costs). You can reopen it later for ' + money(recoveryCost(b, 'reopen')) + '.', 'Close', function () { b.closed = 9e15; b.health = 40; renderBottomInfo(); onMapChanged(); }); return; }
  if ((b._rc || 0) > t && k !== 'reopen') { toast('⏳ Wait ' + Math.ceil(b._rc - t) + 's before the next recovery action', 'bad'); return; }
  const cost = recoveryCost(b, k);
  if (S.money < cost) { toast('❌ Need ' + money(cost), 'bad'); sfx('error'); return; }
  S.money -= cost; b._rc = t + 45;
  if (k === 'restructure') { b.closed = 0; b.health = 55; b.lowT = 0; b.workers = d.workers; toast('🔧 Restructured: new management, default staffing, reopened', 'good'); }
  if (k === 'reopen') { b.closed = 0; b.health = Math.max(b.health || 40, 40); toast('🔓 Reopened', 'good'); }
  if (k === 'marketing') { b.health = Math.min(100, (b.health || 50) + 12); b.promo = t + 180; toast('📣 Local promotion running for 3 minutes', 'good'); }
  if (k === 'staff') { b.workers = Math.max(b.workers, Math.round(d.maxW * 0.8)); b.health = Math.min(100, (b.health || 50) + 10); if (b.nrev) b.rating = Math.min(5, b.rating + 0.2); toast('👷 Hired and trained staff', 'good'); S.p5.tut.hired = (S.p5.tut.hired || 0) + 1; }
  sfx('money'); renderBottomInfo();
}
function lineState(cid) {
  if (!S.p5.lines[cid]) S.p5.lines[cid] = { focus: 0, price: [1, 1, 1], brand: 50 };
  return S.p5.lines[cid];
}
function companyBrand(cid) { return S.p5.lines[cid] ? S.p5.lines[cid].brand : 50; }
function productLineStats(cid) {
  const c = S.companies.list[cid]; if (!c) return null;
  const L = lineState(cid), defs = PRODUCT_LINES[cid], cs = (SIM.companies && SIM.companies[cid]) || { rev: 0 };
  const env = econPhase().demand * (S.p5.world.active === 'food' && cid === 'foods' ? 1.25 : 1) * (S.p5.world.active === 'techboom' && cid === 'tech' ? 1.25 : 1);
  const brandF = 0.6 + L.brand / 125;
  let idx = 0;
  const rows = defs.map(function (p, k) {
    const q = 0.8 + 0.05 * c.level + 0.04 * Math.min(4, c.products) + (L.focus === k ? 0.15 : 0) + S.city.skill / 400;
    const price = L.price[k];
    const dem = p.base * Math.pow(q, 1.2) * brandF * Math.pow(price, -p.el) * env;
    const sup = 2.4 * (L.focus === k ? 0.5 : 0.25);
    const sold = Math.min(dem, sup);
    idx += sold * price;
    return { n: p.n, i: p.i, q: q, price: price, dem: dem, sup: sup, sold: sold };
  });
  const scale = cs.rev * 0.08;
  rows.forEach(function (r) { r.rev = r.sold * r.price * scale; });
  return { rows: rows, total: idx * scale, brand: L.brand, focus: L.focus };
}
function setLinePrice(cid, k, dir) {
  const L = lineState(cid); const i = LINE_PRICES.indexOf(L.price[k]);
  L.price[k] = LINE_PRICES[clamp(i + dir, 0, LINE_PRICES.length - 1)]; sfx('click');
}
function setLineFocus(cid, k) { lineState(cid).focus = clamp(k | 0, 0, 2); sfx('click'); }
/* Runs right after the Part 4 economy tick: product-line sales, sector revenue tracking, ad ROI */
function p5EconAfter(dt) {
  if (!S.p5) return;
  let lines = 0;
  for (const cid in S.companies.list) { const st = productLineStats(cid); if (st) lines += st.total; }
  SIM.lineRev = lines;
  if (lines > 0) { S.money = Math.min(MONEY_CAP, S.money + lines * dt); SIM.pInc += lines; SIM.pNet += lines; SIM.income += lines; SIM.net += lines; if (SIM.P) SIM.P.products += lines; }
  const sec = {}; S.buildings.list.forEach(function (b) { if (b.owner === 'player' && b._rev > 0) { const s = BUILDINGS[b.type].sector; sec[s] = (sec[s] || 0) + b._rev; } });
  SIM.secRev = sec; SIM.secAvg = SIM.secAvg || {};
  const t = S.clock.runSec;
  MARKET_SECTORS.forEach(function (s) {
    const a = S.p5.ads.live[s], v = sec[s] || 0;
    if (a && a.until > t) a.inc += (v - a.base) * dt;
    else {
      if (a) {
        S.p5.ads.hist.push({ sector: s, tier: a.tier, cost: a.cost, inc: a.inc, day: gameDay() });
        if (S.p5.ads.hist.length > 10) S.p5.ads.hist.shift();
        const roi = (a.inc - a.cost) / Math.max(1, a.cost);
        notify(AD_TIERS[a.tier].icon + ' ' + a.tier + ' campaign in ' + s + ' finished — ROI ' + (roi >= 0 ? '+' : '') + Math.round(roi * 100) + '%', roi >= 0 ? 'good' : 'bad');
        delete S.p5.ads.live[s];
      }
      SIM.secAvg[s] = SIM.secAvg[s] === undefined ? v : lerp(SIM.secAvg[s], v, 0.05 * dt);
    }
  });
}
function adTierCost(tier) { return Math.round(adCost() * AD_TIERS[tier].costMult); }
function runAdTier(sector, tier) {
  const T = AD_TIERS[tier]; if (!T) return;
  if (!p5Unlocked('ads')) { toast('🔒 Advertising unlocks in Story Chapter 2', 'bad'); sfx('error'); return; }
  if (T.need && !p5Unlocked(T.need)) { toast('🔒 ' + tier + ' campaigns unlock later in the story', 'bad'); sfx('error'); return; }
  if (S.p5.ads.live[sector] && S.p5.ads.live[sector].until > S.clock.runSec) { toast('A campaign is already running in ' + sector, 'bad'); return; }
  const c = adTierCost(tier);
  if (S.money < c) { toast('❌ Not enough money (' + money(c) + ')', 'bad'); sfx('error'); return; }
  S.money -= c;
  const until = S.clock.runSec + T.dur;
  S.market.ads[sector] = until;
  S.p5.ads.live[sector] = { tier: tier, until: until, cost: c, base: (SIM.secAvg && SIM.secAvg[sector]) || 0, inc: 0 };
  const cid = companyForSector(sector); if (cid) lineState(cid).brand = Math.min(100, lineState(cid).brand + T.brand);
  S.market.rep = Math.min(100, S.market.rep + T.brand * 0.3);
  toast(T.icon + ' ' + tier + ' campaign in ' + sector + ' for ' + Math.round(T.dur / 60) + ' min (demand ×' + T.mult + ')', 'good'); sfx('money');
}
function adMult(owner, sector) {
  const t = S.clock.runSec;
  if (owner === 'player') { const a = S.p5 && S.p5.ads.live[sector]; if (a && a.until > t) return AD_TIERS[a.tier].mult; return (S.market.ads[sector] || 0) > t ? 1.2 : 1; }
  return 1;
}
function marketTick() {
  // Brand reputation: quality and reviews push the brand up, bad reviews pull it down
  COMPANY_DEFS.forEach(function (cd) {
    if (!S.companies.list[cd.id]) return;
    const L = lineState(cd.id); let rs = 0, n = 0;
    S.buildings.list.forEach(function (b) { if (b.owner === 'player' && b.nrev && cd.sectors.indexOf(BUILDINGS[b.type].sector) >= 0) { rs += b.rating; n++; } });
    const q = ownerTraits('player', cd.sectors[0]).q;
    const target = clamp(35 + (q - 0.9) * 60 + (n ? (rs / n - 3) * 18 : 0) + (S.p5.ads.live[cd.sectors[0]] ? 8 : 0), 0, 100);
    L.brand = clamp(lerp(L.brand, target, 0.04), 0, 100);
  });
  // AI competition: react to the player's market share with prices and product launches
  AI_DEFS.forEach(function (a) {
    const st = S.ai[a.id]; if (a.kind !== 'rival' || st.acquired) return;
    const sec = a.sectors[0];
    if (Math.random() < 0.012 * businessGrowthMult() && st.cash > 2000 && S.city.population > 200) {
      st.quality = Math.min(1.6, st.quality + 0.05); st.cash -= Math.min(st.cash * 0.2, 20000);
      const nm = a.name.split(' ')[0];
      notify(a.icon + ' ' + nm + ' launched a new product: ' + nm.charAt(0) + nm.slice(1).toLowerCase() + ' ' + pick(['X', 'Pro', 'Max', 'Go', 'Ultra', '2.0']) + ' — its quality is rising in ' + sec + '.', '');
    }
  });
}

/* --- Fireworks & cinematic camera ---------------------------------------------------------------------------- */
FX.rockets = [];
function fireworks(n, x, y) {
  if (!STARTED) return;
  const tl = screenToWorld(0, 0), br = screenToWorld(CW, CH);
  const cap = S.settings.particleReduce ? 4 : 18;
  n = Math.min(cap, n || 8);
  for (let i = 0; i < n; i++) {
    const px = x !== undefined ? x + rand(-60, 60) : rand(tl.x + 40, br.x - 40), py = y !== undefined ? y : br.y - (br.y - tl.y) * rand(0.05, 0.25);
    FX.rockets.push({ x: px, y: py, vy: -rand(170, 240), fuse: rand(0.7, 1.2), delay: i * 0.18 + Math.random() * 0.2, col: pick(['#ff006e', '#ffd166', '#06d6a0', '#4cc9f0', '#f15bb5', '#fff']) });
  }
}
function updateRockets(dt) {
  for (let i = FX.rockets.length - 1; i >= 0; i--) {
    const r = FX.rockets[i];
    if (r.delay > 0) { r.delay -= dt; continue; }
    r.y += r.vy * dt; r.vy += 60 * dt; r.fuse -= dt;
    if (Math.random() < 0.6) spawnParticles(r.x, r.y, 'spark', 1);
    if (r.fuse <= 0) {
      spawnParticles(r.x, r.y, 'firework', S.settings.particleReduce ? 10 : 28);
      if (S.settings.sound && SND.ctx && Math.random() < 0.7) SND.noise(0.3, 0.07, 1500);
      FX.rockets.splice(i, 1);
    }
  }
}
function cinematic(b, text) {
  if (!STARTED || !b) return;
  const c = buildingCenter(b);
  FX.cine = { t: 0, dur: S.settings.reducedMotion ? 2.5 : 5, b: b, text: text, x: c.x, y: c.y - buildingHeight(b) * 0.4, z0: CAM.zoom, lit: false };
  b._rise = S.settings.reducedMotion ? 1 : 0;
}
function updateCinematic(dt) {
  const k = FX.cine; if (!k) return;
  k.t += dt;
  const rm = S.settings.reducedMotion;
  if (!rm && k.t < 1.4) { const f = k.t / 1.4, e = f * f * (3 - 2 * f); CAM.x = lerp(CAM.x, k.x, e * 0.25); CAM.y = lerp(CAM.y, k.y, e * 0.25); CAM.zoom = lerp(CAM.zoom, 0.85, e * 0.2); }
  if (k.b && k.b._rise !== undefined && k.b._rise < 1) k.b._rise = Math.min(1, rm ? 1 : Math.max(0, (k.t - 1) / 2));
  if (!k.lit && k.t > 2.6) { k.lit = true; flashBig('🌟 ' + k.text); fireworks(12, k.x, k.y - 40); sfx('levelup'); }
  if (k.t >= k.dur) { if (k.b) delete k.b._rise; FX.cine = null; }
}
function updateCameraFly(dt) {
  const f = FX.fly; if (!f) return;
  f.t += dt; const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
  CAM.x = lerp(f.x0, f.x1, e); CAM.y = lerp(f.y0, f.y1, e); CAM.zoom = lerp(f.z0, f.z1, e); clampCamera();
  if (u >= 1) FX.fly = null;
}

/* --- Error recovery & memory hygiene --------------------------------------------------------------------------- */
const ERRLOG = [];
function logError(where, err) {
  ERRLOG.unshift({ t: new Date().toLocaleTimeString(), where: where, msg: String(err && err.message || err).slice(0, 200) });
  if (ERRLOG.length > 50) ERRLOG.pop();
  console.warn('[' + where + '] recovered:', err && err.message ? err.message : err);
  if (typeof Log !== 'undefined') Log.warn('[' + where + '] recovered: ' + String(err && err.message || err).slice(0, 300));
}
function recoverSystem(name, err) {
  logError(name, err);
  try {
    if (name === 'Population' || name === 'NPC AI' || name === 'Thoughts') sanitizeCitizens();
    else if (name === 'Transportation' || name === 'Incidents') sanitizeVehicles();
    else if (name === 'Buildings' || name === 'Economy' || name === 'Market') repairBuildings();
  } catch (e2) { logError(name + ' recovery', e2); }
  if (!FX.errShown) { FX.errShown = true; toast('⚠️ Recovered from an error in ' + name + ' — the faulty entity was removed. Your save is safe.', 'bad'); setTimeout(function () { FX.errShown = false; }, 15000); }
}
function sanitizeCitizens() {
  for (let i = AG.citizens.length - 1; i >= 0; i--) {
    const c = AG.citizens[i];
    if (!c || !isFinite(c.x) || !isFinite(c.y) || !c.needs || (!c.tourist && !MAP.byId.has(c.home))) AG.citizens.splice(i, 1);
    else { if (c.work && !MAP.byId.has(c.work)) c.work = 0; if (c.path && !Array.isArray(c.path)) c.path = null; }
  }
}
/* A single citizen threw an error: reset it to a safe idle state at home, or remove it if it cannot be repaired. */
function recoverCitizen(c, err) {
  logError('Citizen #' + (c && c.id), err);
  if (!c || c.tourist || !MAP.byId.has(c.home)) return true;
  try {
    const p = doorPoint(MAP.byId.get(c.home));
    c.x = p.x; c.y = p.y; c.path = null; c.pi = 0; c.driving = false; c.inside = 0; c.parkUntil = 0; c.target = null; c.state = 'IDLE'; c.pending = true;
    if (!c.needs || typeof c.needs !== 'object') c.needs = {};
    ['food', 'fun', 'shopping', 'work', 'housing'].forEach(function (k) { c.needs[k] = num(c.needs[k], 60, 0, 100); });
    c.energy = num(c.energy, 70, 0, 100); c.money = num(c.money, 100, 0, 1e9);
    if (c.work && !MAP.byId.has(c.work)) c.work = 0;
    return false;
  } catch (e2) { return true; }
}
function sanitizeVehicles() {
  for (let i = AG.vehicles.length - 1; i >= 0; i--) {
    const v = AG.vehicles[i];
    if (!v || !isFinite(v.x) || !isFinite(v.y) || !Array.isArray(v.wp) || !v.wp.length) { AG.vehicles.splice(i, 1); if (v && v.passenger) { v.passenger.driving = false; v.passenger.path = null; } }
  }
}
function repairBuildings() {
  for (let i = S.buildings.list.length - 1; i >= 0; i--) {
    const b = S.buildings.list[i];
    if (!b || !BUILDINGS[b.type]) { S.buildings.list.splice(i, 1); continue; }
    ['_eff', '_rev', '_cost', '_actW', 'health', 'rating'].forEach(function (k) { if (b[k] !== undefined && !isFinite(b[k])) b[k] = 0; });
    if (!isFinite(b.progress)) b.progress = 1;
  }
  rebuildOcc();
}
/* Periodic cleanup: drop references to removed entities so nothing leaks */
function cleanupTick() {
  AG.citizens.forEach(function (c) {
    if (c.work && !MAP.byId.has(c.work)) c.work = 0;
    if (c.mem) { ['favShop', 'favFood', 'favFun'].forEach(function (k) { if (c.mem[k] && !MAP.byId.has(c.mem[k])) c.mem[k] = 0; }); for (const k in c.mem.visits) if (!MAP.byId.has(+k)) delete c.mem.visits[k]; }
    if (c.bubble && c.bubble.until < FX.time) c.bubble = null;
  });
  AG.vehicles.forEach(function (v) { if (v.dest && !MAP.byId.has(v.dest.id)) v.dest = null; });
  if (UI.selected && !MAP.byId.has(UI.selected.id)) selectBuilding(null);
  const cap = perf().part * (S.settings.particleReduce ? 0.3 : 1);
  if (FX.particles.length > cap) FX.particles.splice(0, FX.particles.length - cap);
  if (FX.cine && FX.cine.b && !MAP.byId.has(FX.cine.b.id)) FX.cine = null;
  if (MAP.pathCache.size > 1500) MAP.pathCache.clear();
  S.p5.stats.bubbles = 0;
}

/* --- Part 5 per-second tick (called by the Game engine) ---------------------------------------------------------- */
function part5Tick(dt) {
  calendarTick();
  econCycleTick(dt);
  investmentsTick();
  startupsTick(dt);
  worldEventsTick();
  storyTick();
  challengeTick();
  dynDifficultyTick();
  businessHealthTick(dt);
  milestoneTick();
  profileTick(dt);
  accidentTick(dt);
  tutorialTick();
}
