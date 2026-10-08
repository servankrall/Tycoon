'use strict';
/* BLOCK CITY TYCOON — PART 5 STATE — player profile, titles, cosmetics */
/* ============================ 14. P5 STATE ============================ */
function newRivals() {
  const o = {};
  WORLD_CITIES.forEach(function (c, i) {
    const r = mulberry32((c.pop | 0) + i * 17);
    o[c.id] = { pop: c.pop * (0.02 + r() * 0.02), wealth: 0.4 + r() * 0.5, tech: 5 + r() * 15, tour: 5 + r() * 20, hap: 50 + r() * 20, env: 40 + r() * 30, g: 0.8 + r() * 0.5 };
  });
  return o;
}
function newP5() {
  return {
    econ: { phase: 'NORMAL', until: 480, rate: 0.05, hist: [], stim: 0, aust: 0 },
    week: { n: -1, special: null },
    invest: { active: [], history: [], nextId: 1, profit: 0 },
    startups: { founded: 0, exits: 0, exitValue: 0 },
    score: { cur: 0, best: 0, comp: {}, tech: 0 },
    rivals: newRivals(),
    world: { active: null, ends: 0, nextAt: 1200, count: 0 },
    identity: { pts: { GREEN: 0, BUSINESS: 0, TECH: 0, TOURIST: 0, INDUSTRIAL: 0, FINANCIAL: 0, ENTERTAINMENT: 0 }, id: null },
    history: [], ms: {}, firsts: {},
    challenge: null, daily: null, weekly: null,
    story: { ch: 0, phase: 'intro', choices: {}, hold: 0, unlocked: {} },
    dd: { level: 0, lastPop: 0, lastEval: 0, fundAt: 0 },
    perks: {},
    ads: { hist: [], live: {} },
    lines: {},
    tut: { step: 0, done: false, base: {} },
    admin: { used: false, god: false, instant: false, freeze: false, noEvents: false },
    stats: { accidents: 0, cleared: 0, reviews: 0, closures: 0 }
  };
}
/* Validate every Part 5 field (used by load, import and migration). */
function sanitizeP5(src) {
  const p = newP5();
  if (!src || typeof src !== 'object') return p;
  const e = src.econ || {};
  p.econ.phase = ECON_PHASES[e.phase] ? e.phase : 'NORMAL';
  p.econ.until = num(e.until, 480, 0, 1e12); p.econ.rate = num(e.rate, 0.05, 0.005, 0.15);
  p.econ.hist = Array.isArray(e.hist) ? e.hist.map(Number).filter(isFinite).slice(-60) : [];
  p.econ.stim = num(e.stim, 0, 0, 1e12); p.econ.aust = num(e.aust, 0, 0, 1e12);
  const w = src.week || {};
  p.week.n = num(w.n, -1, -1, 1e7) | 0; p.week.special = SPECIAL_WEEKENDS[w.special] ? w.special : null;
  const inv = src.invest || {};
  p.invest.nextId = num(inv.nextId, 1, 1, 1e9) | 0; p.invest.profit = num(inv.profit, 0, -1e15, 1e15);
  p.invest.active = (Array.isArray(inv.active) ? inv.active : []).filter(function (a) { return a && INVESTMENT_TYPES.some(function (t) { return t.id === a.type; }); }).slice(0, 4).map(function (a) {
    return { id: num(a.id, 0) | 0, type: a.type, amount: num(a.amount, 0, 0, 1e13), start: num(a.start, 0, 0, 1e12), ends: num(a.ends, 0, 0, 1e12) };
  });
  p.invest.history = (Array.isArray(inv.history) ? inv.history : []).filter(function (a) { return a && INVESTMENT_TYPES.some(function (t) { return t.id === a.type; }); }).slice(-12).map(function (a) {
    return { type: a.type, amount: num(a.amount, 0, 0, 1e13), back: num(a.back, 0, 0, 1e14), res: ['Success', 'Neutral', 'Loss'].indexOf(a.res) >= 0 ? a.res : 'Neutral', day: num(a.day, 1, 0, 1e7) | 0 };
  });
  const su = src.startups || {};
  p.startups.founded = num(su.founded, 0, 0, 1e6) | 0; p.startups.exits = num(su.exits, 0, 0, 1e6) | 0; p.startups.exitValue = num(su.exitValue, 0, 0, 1e15);
  const sc = src.score || {};
  p.score.cur = num(sc.cur, 0, 0, 1000); p.score.best = num(sc.best, 0, 0, 1000); p.score.tech = num(sc.tech, 0, 0, 100);
  if (src.rivals) WORLD_CITIES.forEach(function (c) {
    const r = src.rivals[c.id]; if (!r) return;
    const t = p.rivals[c.id];
    t.pop = num(r.pop, t.pop, 0, 1e8); t.wealth = num(r.wealth, t.wealth, 0, 100); t.tech = num(r.tech, t.tech, 0, 100);
    t.tour = num(r.tour, t.tour, 0, 100); t.hap = num(r.hap, t.hap, 0, 100); t.env = num(r.env, t.env, 0, 100); t.g = num(r.g, t.g, 0.3, 2);
  });
  const wo = src.world || {};
  p.world.active = WORLD_EVENTS.some(function (x) { return x.id === wo.active; }) ? wo.active : null;
  p.world.ends = num(wo.ends, 0, 0, 1e12); p.world.nextAt = num(wo.nextAt, 1200, 0, 1e12); p.world.count = num(wo.count, 0, 0, 1e6) | 0;
  const id = src.identity || {};
  for (const k in p.identity.pts) p.identity.pts[k] = num(id.pts && id.pts[k], 0, 0, 1e9);
  p.identity.id = IDENTITIES[id.id] ? id.id : null;
  p.history = (Array.isArray(src.history) ? src.history : []).filter(function (h) { return h && typeof h.text === 'string'; }).slice(-80).map(function (h) {
    return { day: num(h.day, 1, 0, 1e7) | 0, icon: String(h.icon || '📌').slice(0, 8), text: String(h.text).slice(0, 120), kind: String(h.kind || 'event').slice(0, 16) };
  });
  if (src.ms) MILESTONES.forEach(function (m) { if (src.ms[m.id]) p.ms[m.id] = 1; });
  if (src.firsts && typeof src.firsts === 'object') for (const k in src.firsts) if (/^[a-z_0-9]{1,24}$/.test(k)) p.firsts[k] = 1;
  const ch = src.challenge;
  if (ch && CHALLENGES.some(function (c) { return c.id === ch.id; })) p.challenge = { id: ch.id, start: num(ch.start, 0, 0, 1e12), done: !!ch.done, failed: !!ch.failed };
  const vChal = function (x, tpl) {
    if (!x || !tpl.some(function (t) { return t.id === x.id; })) return null;
    const base = {}; if (x.base && typeof x.base === 'object') for (const k in x.base) if (/^[a-zA-Z]{1,16}$/.test(k)) base[k] = num(x.base[k], 0, -1e15, 1e15);
    return { key: String(x.key || '').slice(0, 16), id: x.id, v: num(x.v, 0, 0, 1e15), start: num(x.start, 0, 0, 1e12), base: base, done: !!x.done, failed: !!x.failed, tainted: !!x.tainted };
  };
  p.daily = vChal(src.daily, DAILY_TEMPLATES); p.weekly = vChal(src.weekly, WEEKLY_TEMPLATES);
  const st = src.story || {};
  p.story.ch = num(st.ch, 0, 0, STORY.length) | 0;
  p.story.phase = ['intro', 'active', 'choice', 'outro'].indexOf(st.phase) >= 0 ? st.phase : 'intro';
  p.story.hold = num(st.hold, 0, 0, 1e6);
  if (st.choices && typeof st.choices === 'object') STORY.forEach(function (c, i) { if (c.choice && c.choice.opts.some(function (o) { return o.id === st.choices[i]; })) p.story.choices[i] = st.choices[i]; });
  if (st.unlocked && typeof st.unlocked === 'object') STORY.forEach(function (c) { if (st.unlocked[c.unlock]) p.story.unlocked[c.unlock] = 1; });
  const dd = src.dd || {};
  p.dd.level = num(dd.level, 0, -1, 1); p.dd.lastPop = num(dd.lastPop, 0, 0, 1e8); p.dd.lastEval = num(dd.lastEval, 0, 0, 1e12); p.dd.fundAt = num(dd.fundAt, 0, 0, 1e12);
  if (src.perks && typeof src.perks === 'object') ['solar', 'tech', 'metro', 'harbor'].forEach(function (k) { if (src.perks[k]) p.perks[k] = num(src.perks[k], 0, 0, 10) | 0; });
  const ad = src.ads || {};
  p.ads.hist = (Array.isArray(ad.hist) ? ad.hist : []).filter(function (a) { return a && AD_TIERS[a.tier] && MARKET_SECTORS.indexOf(a.sector) >= 0; }).slice(-10).map(function (a) {
    return { sector: a.sector, tier: a.tier, cost: num(a.cost, 0, 0, 1e13), inc: num(a.inc, 0, -1e13, 1e14), day: num(a.day, 1, 0, 1e7) | 0 };
  });
  if (ad.live && typeof ad.live === 'object') MARKET_SECTORS.forEach(function (s) {
    const a = ad.live[s]; if (!a || !AD_TIERS[a.tier]) return;
    p.ads.live[s] = { tier: a.tier, until: num(a.until, 0, 0, 1e12), cost: num(a.cost, 0, 0, 1e13), base: num(a.base, 0, 0, 1e13), inc: num(a.inc, 0, -1e13, 1e14) };
  });
  if (src.lines && typeof src.lines === 'object') COMPANY_DEFS.forEach(function (cd) {
    const l = src.lines[cd.id]; if (!l) return;
    p.lines[cd.id] = { focus: num(l.focus, 0, 0, 2) | 0, price: [0, 1, 2].map(function (k) { const v = Array.isArray(l.price) ? +l.price[k] : 1; return LINE_PRICES.indexOf(v) >= 0 ? v : 1; }), brand: num(l.brand, 50, 0, 100) };
  });
  const tu = src.tut || {};
  p.tut.step = num(tu.step, 0, 0, 20) | 0; p.tut.done = !!tu.done;
  if (tu.base && typeof tu.base === 'object') for (const k in tu.base) if (/^[a-zA-Z]{1,16}$/.test(k)) p.tut.base[k] = num(tu.base[k], 0, -1e15, 1e15);
  const adm = src.admin || {};
  p.admin.used = !!adm.used;           // Part 12: admin effects (free/instant build, frozen economy, no events) never come from a save
  ['god', 'instant', 'freeze', 'noEvents'].forEach(function (k) { p.admin[k] = false; });
  const sts = src.stats || {};
  for (const k in p.stats) p.stats[k] = num(sts[k], 0, 0, 1e9) | 0;
  return p;
}

/* --- Player profile (global, survives every city & slot) ---------------------------- */
const PROFILE_KEY = 'bct_profile';
let PROFILE = null;
function newProfile() {
  return { name: 'Mayor', title: 'Beginner', titles: ['Beginner'], badges: [], cosmetics: [], citiesCreated: 0, highestScore: 0, peakWealth: 0, peakPop: 0,
    playSec: 0, challenges: {}, daily: {}, weekly: {}, seen: {}, pin: '', created: Date.now(), companyName: 'BLOCK HOLDINGS' };
}
function loadProfile() {
  let p = null;
  try { const raw = Store.getItem(PROFILE_KEY); if (raw) p = JSON.parse(raw); } catch (e) { p = null; }
  const d = newProfile();
  if (p && typeof p === 'object') {
    d.name = typeof p.name === 'string' && p.name.trim() ? p.name.replace(/[<>]/g, '').trim().slice(0, 24) : 'Mayor';
    d.titles = Array.isArray(p.titles) ? p.titles.filter(function (t, i) { return typeof t === 'string' && t.length < 32 && p.titles.indexOf(t) === i; }).slice(0, 40) : ['Beginner'];
    if (d.titles.indexOf('Beginner') < 0) d.titles.unshift('Beginner');
    d.title = d.titles.indexOf(p.title) >= 0 ? p.title : 'Beginner';
    d.badges = Array.isArray(p.badges) ? p.badges.filter(function (t) { return typeof t === 'string' && t.length < 32; }).slice(0, 40) : [];
    d.cosmetics = Array.isArray(p.cosmetics) ? p.cosmetics.filter(function (t) { return COSMETICS[t]; }) : [];
    ['citiesCreated', 'highestScore', 'peakWealth', 'peakPop', 'playSec'].forEach(function (k) { d[k] = num(p[k], 0, 0, 1e18); });
    ['challenges', 'daily', 'weekly', 'seen'].forEach(function (k) { if (p[k] && typeof p[k] === 'object') for (const kk in p[k]) if (String(kk).length < 40) d[k][kk] = p[k][kk] ? 1 : 0; });
    d.pin = typeof p.pin === 'string' && /^[0-9a-f]{0,16}$/.test(p.pin) ? p.pin : '';
    d.created = num(p.created, Date.now(), 0);
    d.companyName = typeof p.companyName === 'string' && p.companyName.trim() ? p.companyName.replace(/[<>]/g, '').trim().slice(0, 28) : 'BLOCK HOLDINGS';
  }
  PROFILE = d;
  return d;
}
function saveProfile() { try { Store.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch (e) { /* storage blocked: profile stays in memory */ } }
function hashPin(s) { let h = 2166136261; s = 'bct' + String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
function hasCosmetic(id) { return PROFILE && PROFILE.cosmetics.indexOf(id) >= 0; }
function grantTitle(t) { if (PROFILE.titles.indexOf(t) < 0) { PROFILE.titles.push(t); saveProfile(); notify('🎖️ New title unlocked: ' + t, 'gold'); sfx('achievement'); } }
function grantBadge(t) { if (PROFILE.badges.indexOf(t) < 0) { PROFILE.badges.push(t); saveProfile(); notify('🏅 New badge: ' + t, 'gold'); } }
function grantCosmetic(id) { if (COSMETICS[id] && !hasCosmetic(id)) { PROFILE.cosmetics.push(id); saveProfile(); notify(COSMETICS[id].icon + ' Cosmetic unlocked: ' + COSMETICS[id].name, 'gold'); } }
/* Rewards: money, research, prestige (legacy) points, cosmetics, titles and badges */
function grantP5Reward(r, why) {
  if (!r) return '';
  const out = [];
  if (r.money) { S.money = Math.min(MONEY_CAP, S.money + r.money); out.push(money(r.money)); }
  if (r.budget) { S.budget = Math.min(MONEY_CAP, S.budget + r.budget); out.push(money(r.budget) + ' budget'); }
  if (r.rp) { S.research.rp += r.rp; out.push(r.rp + ' RP'); }
  if (r.pp) { S.meta.pp += r.pp; out.push(r.pp + ' LP'); }
  if (r.cosmetic) { grantCosmetic(r.cosmetic); out.push(COSMETICS[r.cosmetic].name); }
  if (r.title) { grantTitle(r.title); out.push('title "' + r.title + '"'); }
  if (r.badge) { grantBadge(r.badge); out.push('badge "' + r.badge + '"'); }
  if (why && out.length) notify('🎁 ' + why + ': ' + out.join(' · '), 'gold');
  return out.join(' · ');
}

/* --- Helpers used by story/challenges -------------------------------------------- */
function playerEarners() { let n = 0; S.buildings.list.forEach(function (b) { if (b.owner === 'player' && b._rev > 0 && BUILDINGS[b.type].rev) n++; }); return n; }
function maxStartupStage() { let m = -1; S.buildings.list.forEach(function (b) { if (b.su && !isAI(b)) m = Math.max(m, b.su.stage); }); return m; }
function storyTimer(sec, ok) { const st = S.p5.story; st.hold = ok ? (st.hold || 0) + 1 : Math.max(0, (st.hold || 0) - 2); return st.hold >= sec; }
function p5Unlocked(k) { return !!(S.city.sandbox || S.p5.story.unlocked[k] || S.debugUnlockAll); }
function seedLabel(seed) { return 'CITY-' + String((seed === undefined ? S.city.seed : seed) >>> 0).padStart(6, '0'); }
function parseSeed(txt) { const m = String(txt || '').toUpperCase().replace(/\s/g, '').match(/^(?:CITY-)?(\d{1,7})$/); return m ? (+m[1]) % 1000000 : NaN; }
function logHistory(icon, text, kind) {
  S.p5.history.push({ day: gameDay(), icon: icon, text: String(text).slice(0, 120), kind: kind || 'event' });
  if (S.p9 && (['landmark', 'first', 'milestone'].indexOf(kind) >= 0 || (kind === 'level' && /Level (5|10|15|20)\b/.test(text)))) timelineAdd(icon, text, kind);      // Part 9 city timeline
  if (S.p5.history.length > 80) S.p5.history.shift();
}
function markFirst(key, icon, text) { if (S.p5.firsts[key]) return false; S.p5.firsts[key] = 1; logHistory(icon, text, 'first'); return true; }
