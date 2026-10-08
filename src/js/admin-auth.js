'use strict';
/* BLOCK CITY TYCOON — SECURE ADMIN SYSTEM (Part 12)
   The World Control Center is NOT part of the normal game. A normal player never sees an admin button, F10 does nothing,
   and every admin command (panel buttons, console, shortcuts, palette, inspector, brushes, Part 10/11 tools) passes
   CHECK ADMIN PERMISSION before it runs — hiding the UI is not the protection, the permission check is.

   ADMIN AUTHENTICATION
   - Hidden access: Ctrl+Shift+F10 (Windows) · tap the version label 7 times (Android / touch) → ADMIN ACCESS login.
   - No password is stored anywhere in the code. Each account is a salted PBKDF2-SHA256 record (120 000 iterations):
       role key  K_role = HMAC(owner master secret, "bct-role:" + role)         (the master secret is not in the code)
       record    wrap   = K_role XOR PBKDF2(password, salt ‖ username)          (OWNER records wrap the master secret)
       check     SHA-256(K_role) must equal the published role check value      (only these hashes are in the code)
     A wrong password produces a random key that fails the check. Nobody can create or upgrade an account by editing
     local storage or a save file without knowing an existing password of that role (OWNER: the owner password).
   - ADMIN SESSION (memory only — never in local storage or a save): user, role, platform, login time, last activity,
     expiration. LOG OUT clears it; AUTO LOCK after N minutes without admin activity (Settings / SYSTEM tab, default 10).
   - FAILED LOGIN PROTECTION: 3 failures → 5 s wait, then 15 s, 30 s, 1 min, 2 min … (max 15 min, never permanent);
     every failure is written to the security log.
   - OWNER RECOVERY: a one-time recovery code (also a PBKDF2 record) lets the owner set a new owner password.
   - Roles OWNER · ADMIN · DEVELOPER · DEBUG with a real permission matrix (ADMIN_PERMS); every admin action is logged
     (timestamp, user, role, command, target, result) — logs/admin.log on Windows.
   - Saves never carry admin state: god mode / instant build / frozen economy / no events / session unlock are removed
     on load and whenever no admin is logged in; "admin": true in a save is rejected as an unknown property. */

/* ===================================== ROLES & PERMISSION MATRIX ===================================== */
const ADMIN_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'DEBUG'];
const ROLE_INFO = {
  OWNER: { icon: '👑', desc: 'Everything: world generation, deleting worlds, accounts, security, all tools.' },
  ADMIN: { icon: '🛡️', desc: 'World, city, economy, citizens, buildings, transport, disasters, weather, technology, saves.' },
  DEVELOPER: { icon: '🧑‍💻', desc: 'Debug and testing: simulation lab, traffic debug, inspector, validator, profiler.' },
  DEBUG: { icon: '🐞', desc: 'Performance and diagnostics only (profiler, benchmark, debug panels).' }
};
/* Command categories → roles that may run them (OWNER may always run everything) */
const ADMIN_PERMS = {
  view: { name: 'Open panel / navigate', roles: ['OWNER', 'ADMIN', 'DEVELOPER', 'DEBUG'] },
  generate: { name: 'Generate world', roles: ['OWNER'] },
  delete: { name: 'Delete world / profile', roles: ['OWNER'] },
  system: { name: 'Accounts & security', roles: ['OWNER'] },
  city: { name: 'World / city / economy control', roles: ['OWNER', 'ADMIN'] },
  save: { name: 'Snapshots, clone, branch, save tools', roles: ['OWNER', 'ADMIN'] },
  lab: { name: 'Simulation lab & testing', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  debug: { name: 'Traffic / world debug, inspector, validator', roles: ['OWNER', 'ADMIN', 'DEVELOPER'] },
  perf: { name: 'Performance profiler & diagnostics', roles: ['OWNER', 'DEVELOPER', 'DEBUG'] }
};
const ADMIN_CMD_CAT = (function () {
  const m = {};
  const put = function (cat, ids) { ids.split(/\s+/).forEach(function (id) { if (id) m[id] = cat; }); };
  put('generate', 'generate regenerate q_generate q_megacity q_newRegion megaGen facGen facPreset importWorld p9_seed expandAll console:generateWorld console:unlockAll');
  put('delete', 'snapDelete presetDelete achReset wipeProfile classic:wipeProfile deleteWorld');
  put('system', 'setPin clearPin classic:setPin classic:clearPin classic:lock sec_create sec_delete sec_clearLog');
  put('save', 'snapCreate snapRollback restore saveNow duplicate exportWorld q_clone q_snapshot p9_snap p9_snapNamed p9_branch p9_autoSnap p9_loadSlot tmSnap tmGo presetSave presetLoad console:snapshot console:rollback console:duplicateWorld classic:save classic:restore classic:downloadJson classic:importJson classic:viewJson');
  put('lab', 'labSet labRun scoreNow scoreFix facSet spawnTraffic console:spawnTraffic');
  put('debug', 'validate p9_validate p9_autoVal recalcPaths resetRoutes dbgLayer debugWorld worldDebug p9_inspect p9_inspectCo p9_inspectPick p9_route p9_thr p9_advRefresh sanitize classic:sanitize classic:clearLog console:validate console:health console:debugWorld console:help console:clear inspector:view');
  put('perf', 'benchmark stressTest openLogs perfProfiler debugPanel console:benchmark console:stressTest');
  put('view', 'panel wgPreset wgSize wgSlot wgDice p9_tab p9_brushMode p9_brushSize p9_brushSign selCitizen selVehicle pickCitizen pickVehicle citFly vehFly flyDistrict p9_flyTile p9_flyChunk pauseOnOpen p9_regionSel bClearSel wBrush wSize sec_lock sec_logout sec_lockMin sec_passwd sec_guide classicAdmin');
  return m;
})();
function adminCategory(id) {
  id = String(id || '');
  if (ADMIN_CMD_CAT[id]) return ADMIN_CMD_CAT[id];
  if (/^console:/.test(id)) return 'city';
  return 'city';                         // unknown admin commands default to world/city control (OWNER / ADMIN)
}
/* Panel layout: 16 sections; each holds the existing World Control Center and admin tool tabs */
const ADMIN_GROUPS = [
  ['WORLD', '🌍', ['wc_world', 'world', 'map', 'wc_factory', 'wc_region', 'wc_brush', 'wc_wd', 'wc_living'], 'city'],
  ['SIMULATION', '🎮', ['wc_sim', 'simulation', 'wc_lab', 'wc_whatif', 'wc_tm', 'ai'], 'lab'],
  ['CITY', '🏙', ['city', 'wc_projects', 'wc_health', 'wc_tu', 'wc_sc', 'quests', 'wc_chal', 'wc_advisor'], 'city'],
  ['ECONOMY', '💰', ['wc_econ', 'economy', 'wc_ec', 'wc_fi', 'wc_td'], 'city'],
  ['CITIZENS', '👥', ['wc_cit', 'citizens', 'wc_cc'], 'city'],
  ['TRAFFIC', '🚦', ['wc_traffic', 'traffic', 'roads'], 'debug'],
  ['BUILDINGS', '🏗', ['wc_build', 'buildings', 'wc_bc'], 'city'],
  ['UTILITIES', '⚡', ['wc_util', 'utilities', 'wc_uc', 'environment'], 'city'],
  ['TRANSPORT', '🚇', ['wc_tr'], 'city'],
  ['COMPANIES', '🏢', ['companies', 'wc_co'], 'city'],
  ['DISASTERS', '🚨', ['wc_disaster', 'wc_dc', 'wc_incidents', 'wc_events', 'events'], 'city'],
  ['WEATHER', '🌦', ['weather', 'wc_cl'], 'city'],
  ['TECHNOLOGY', '🔬', ['technology'], 'city'],
  ['SAVE', '💾', ['save', 'wc_snap', 'wc_time'], 'save'],
  ['DEBUG', '🐞', ['wc_debug', 'debug', 'wc_inspect', 'wc_perf'], 'perfOrDebug'],
  ['SYSTEM', '⚙', ['wc_security', 'system'], 'view']
];
function roleAllows(role, cat) {
  if (!role) return false;
  if (role === 'OWNER') return true;
  if (cat === 'perfOrDebug') return roleAllows(role, 'perf') || roleAllows(role, 'debug');
  const p = ADMIN_PERMS[cat] || ADMIN_PERMS.city;
  return p.roles.indexOf(role) >= 0;
}
function adminGroupOf(cat) { for (let i = 0; i < ADMIN_GROUPS.length; i++) if (ADMIN_GROUPS[i][2].indexOf(cat) >= 0) return ADMIN_GROUPS[i]; return null; }
/* Tab visibility per role (the DEBUG section shows DEBUG-only users just the profiler and the debug panel) */
function adminTabAllowed(role, cat) {
  const g = adminGroupOf(cat); if (!g) return role === 'OWNER';
  if (g[0] === 'DEBUG') return cat === 'wc_perf' ? roleAllows(role, 'perf') : cat === 'debug' ? (roleAllows(role, 'perf') || roleAllows(role, 'debug')) : roleAllows(role, 'debug');
  if (cat === 'system') return role === 'OWNER';
  return roleAllows(role, g[3]);
}

/* ===================================== CRYPTO (PBKDF2-SHA256, HMAC, SHA-256) ===================================== */
const ACRYPTO = (function () {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const W = new Uint32Array(64);
  function sha256(msg) {
    const len = msg.length, bitLen = len * 8, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total);
    buf.set(msg); buf[len] = 0x80;
    const dv = new DataView(buf.buffer); dv.setUint32(total - 4, bitLen >>> 0); dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (v, i) { ov.setUint32(i * 4, v >>> 0); });
    return out;
  }
  function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    return sha256(concat(op, sha256(concat(ip, msg))));
  }
  function utf8(s) { return new TextEncoder().encode(String(s).normalize('NFKC')); }
  function hex(b) { let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function unhex(h) { const o = new Uint8Array(h.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function xor(a, b) { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; }
  function eq(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function random(n) { const o = new Uint8Array(n); crypto.getRandomValues(o); return o; }
  /* PBKDF2-HMAC-SHA256 (one 32-byte block) in plain JS — used only when WebCrypto is unavailable; yields to the UI */
  async function pbkdf2Js(pw, salt, it) {
    const k = pw.length > 64 ? sha256(pw) : pw, kp = new Uint8Array(64); kp.set(k);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = kp[i] ^ 0x36; op[i] = kp[i] ^ 0x5c; }
    const mac = function (m) { return sha256(concat(op, sha256(concat(ip, m)))); };
    let u = mac(concat(salt, new Uint8Array([0, 0, 0, 1])));
    const t = u.slice();
    for (let i = 1; i < it; i++) { u = mac(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; if (i % 4000 === 0) await new Promise(function (r) { setTimeout(r, 0); }); }
    return t;
  }
  async function pbkdf2(pw, salt, it) {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.importKey) {
        const key = await crypto.subtle.importKey('raw', pw, { name: 'PBKDF2' }, false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: it }, key, 256);
        return new Uint8Array(bits);
      }
    } catch (e) { /* insecure context or old engine → plain JS */ }
    return pbkdf2Js(pw, salt, it);
  }
  return { sha256: sha256, hmac: hmac, utf8: utf8, hex: hex, unhex: unhex, xor: xor, eq: eq, random: random, pbkdf2: pbkdf2, pbkdf2Js: pbkdf2Js, concat: concat };
})();

/* Published verification data of the built-in realm: role check hashes and two salted PBKDF2 records
   (owner + one-time owner recovery). They contain no password and no secret key. */
const ADMIN_REALM_BUILTIN = Object.freeze({
  id: 'builtin',
  checks: { OWNER: 'e9cb9231e3c2aedf47642c8a3d4ae0baf648111d17db753642c1ed846b0bc545', ADMIN: '5e62bbae4234957cc511a07794eca619413a11607b7ebeb80937edfb884571da', DEVELOPER: 'c35bde82701fdb5e9f90f52d459f8246164f1a51233abff943c4a196b56dd890', DEBUG: '356e51d3188b50984531283271b1059972b90967bed68bb6f0c6bc8f51e9a20c' },
  records: [
    { u: 'owner', role: 'OWNER', kind: 'master', it: 120000, salt: '148ef7a6314f000b1b801b045752505f', wrap: '3bbc002c479950fee8becb09027ac79c52bc2e1b47ce19156d9b447781d8d07e' },
    { u: 'recovery', role: 'OWNER', kind: 'master', it: 120000, salt: '14800974481c9909e8824805b08ef8b4', wrap: '05b16060b72d24c871898671e9b052b113c21e3babe23f52d4f2731744db2862' }
  ]
});

/* ===================================== AUTHENTICATION & SESSION ===================================== */
const AdminAuth = (function () {
  const ACC_KEY = 'bct_admin_accounts', GUARD_KEY = 'bct_admin_guard', SEC_KEY = 'bct_admin_security', ACT_KEY = 'bct_admin_actions';
  const MAX_SESSION_MS = 8 * 3600 * 1000;
  let session = null;            // { id, user, role, realm, platform, loginAt, lastActive, expiresAt }
  let keyMat = null;             // master secret (OWNER) or role key — memory only, cleared on logout / lock
  let lockedUser = '';           // username remembered after an auto-lock
  let busy = false;
  const realms = { builtin: ADMIN_REALM_BUILTIN };
  const J = function (k, def) { try { const v = JSON.parse(Store.getItem(k) || 'null'); return v === null ? def : v; } catch (e) { return def; } };
  const W = function (k, v) { try { Store.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const now = function () { return Date.now(); };
  const hhmm = function (t) { const d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()); };
  const cleanUser = function (u) { return String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24); };

  /* --- security log (logins, failures, locks, denied commands) --- */
  const secLog = [];
  let denyLogAt = 0;
  function security(event, detail) {
    const e = { t: now(), event: String(event), detail: String(detail || '').slice(0, 200), platform: PLATFORM_ID };
    secLog.push(e); if (secLog.length > 200) secLog.shift();
    const all = J(SEC_KEY, []); all.push(e); W(SEC_KEY, all.slice(-200));
    const line = '[' + hhmm(e.t) + '] SECURITY ' + e.event + (e.detail ? ' — ' + e.detail : '') + ' (' + PLATFORM_NAME + ')';
    Log.info(line);
    if (DESKTOP && BCT.adminLog) { try { BCT.adminLog(line); } catch (err) { /* best effort */ } }
  }
  /* --- admin action log: timestamp · user · role · command · target · result --- */
  function record(cmd, target, result) {
    const e = { t: now(), user: session ? session.user : '-', role: session ? session.role : '-', cmd: String(cmd).slice(0, 60), target: String(target === undefined || target === null ? '' : target).slice(0, 80), result: String(result || 'OK').slice(0, 120) };
    const all = J(ACT_KEY, []); all.push(e); W(ACT_KEY, all.slice(-500));
    const line = '[' + hhmm(e.t) + '] ' + e.user + ' (' + e.role + ') ' + e.cmd + (e.target ? ' → ' + e.target : '') + ' : ' + e.result;
    if (DESKTOP && BCT.adminLog) { try { BCT.adminLog(line); } catch (err) { /* best effort */ } }
    else if (IS_ANDROID_APP) { try { BCTA.log('info', 'ADMIN ' + line); } catch (err) { /* best effort */ } }
  }

  /* --- failed login protection --- */
  function guardState() { const g = J(GUARD_KEY, { fails: 0, until: 0, last: 0 }); if (now() - (g.last || 0) > 3600e3) { g.fails = 0; g.until = 0; } return g; }
  function delayFor(fails) { if (fails < 3) return 0; const steps = [5, 15, 30, 60, 120, 300, 600, 900]; return steps[Math.min(steps.length - 1, fails - 3)] * 1000; }
  function waitLeft() { const g = guardState(); return Math.max(0, (g.until || 0) - now()); }

  /* --- accounts (local, owner-created) --- */
  function accounts() { const a = J(ACC_KEY, null); return a && typeof a === 'object' ? { owner: a.owner || null, ownerRetired: !!a.ownerRetired, list: Array.isArray(a.list) ? a.list : [] } : { owner: null, ownerRetired: false, list: [] }; }
  function saveAccounts(a) { W(ACC_KEY, { v: 1, owner: a.owner, ownerRetired: a.ownerRetired, list: a.list }); }
  function validRecord(r) { return r && typeof r === 'object' && typeof r.u === 'string' && ADMIN_ROLES.indexOf(r.role) >= 0 && (r.kind === 'master' || r.kind === 'role') && /^[0-9a-f]{32}$/.test(r.salt) && /^[0-9a-f]{64}$/.test(r.wrap) && (r.it | 0) >= 10000 && (r.it | 0) <= 2e6; }
  function candidates(user) {
    const out = [], a = accounts();
    if (realms.selftest) realms.selftest.records.forEach(function (r) { if (r.u === user) out.push({ r: r, realm: realms.selftest }); });
    if (user === 'owner' && validRecord(a.owner) && a.owner.kind === 'master') out.push({ r: a.owner, realm: realms.builtin });
    a.list.forEach(function (r) { if (validRecord(r) && r.kind === 'role' && r.u === user && r.role !== 'OWNER') out.push({ r: r, realm: realms.builtin }); });
    ADMIN_REALM_BUILTIN.records.forEach(function (r) { if (r.u === user && r.u !== 'recovery' && !(r.u === 'owner' && a.ownerRetired)) out.push({ r: r, realm: realms.builtin }); });
    return out;
  }
  /* Derive the record key from the password and verify it against the realm's published role check */
  async function verify(c, password) {
    const r = c.r, dk = await ACRYPTO.pbkdf2(ACRYPTO.utf8(password), ACRYPTO.concat(ACRYPTO.unhex(r.salt), ACRYPTO.utf8(r.u)), r.it | 0);
    const k = ACRYPTO.xor(ACRYPTO.unhex(r.wrap), dk);
    const roleKey = r.kind === 'master' ? ACRYPTO.hmac(k, ACRYPTO.utf8('bct-role:' + r.role)) : k;
    const ok = ACRYPTO.eq(ACRYPTO.hex(ACRYPTO.sha256(roleKey)), c.realm.checks[r.role] || '');
    return ok ? { key: k, kind: r.kind } : null;
  }
  async function makeRecord(user, password, role, kind, keyBytes) {
    const salt = ACRYPTO.random(16), it = 120000;
    const dk = await ACRYPTO.pbkdf2(ACRYPTO.utf8(password), ACRYPTO.concat(salt, ACRYPTO.utf8(user)), it);
    return { u: user, role: role, kind: kind, it: it, salt: ACRYPTO.hex(salt), wrap: ACRYPTO.hex(ACRYPTO.xor(keyBytes, dk)), created: new Date().toISOString(), by: session ? session.user : 'recovery' };
  }
  function startSession(user, role, realm, key) {
    const t = now();
    session = { id: ACRYPTO.hex(ACRYPTO.random(8)), user: user, role: role, realm: realm.id, platform: PLATFORM_ID, loginAt: t, lastActive: t, expiresAt: t + MAX_SESSION_MS, state: 'authenticated' };
    keyMat = key; lockedUser = '';
    security('LOGIN OK', user + ' as ' + role);
    setTimeout(function () { if (typeof adminUiRefresh === 'function') adminUiRefresh(); }, 0);
    record('login', user, 'session ' + session.id + ' started (' + PLATFORM_NAME + ')');
  }
  function failed(user, why) {
    const g = guardState(); g.fails = (g.fails || 0) + 1; g.last = now(); g.until = now() + delayFor(g.fails); W(GUARD_KEY, g);
    security('LOGIN FAILED', (user || '?') + ' — ' + why + ' (attempt ' + g.fails + (g.until > now() ? ', wait ' + Math.round((g.until - now()) / 1000) + ' s' : '') + ')');
  }
  async function login(username, password) {
    if (busy) return { ok: false, reason: 'Please wait…' };
    const left = waitLeft(); if (left > 0) return { ok: false, reason: 'Too many failed attempts — wait ' + Math.ceil(left / 1000) + ' s', wait: left };
    const user = cleanUser(username), pw = String(password || '');
    if (!user || !pw) return { ok: false, reason: 'Enter username and password' };
    busy = true;
    try {
      const list = candidates(user);
      for (let i = 0; i < list.length; i++) {
        const v = await verify(list[i], pw);
        if (v) { W(GUARD_KEY, { fails: 0, until: 0, last: 0 }); startSession(user, list[i].r.role, list[i].realm, v.key); return { ok: true, role: list[i].r.role }; }
      }
      failed(user, list.length ? 'wrong password' : 'unknown user');
      const w = waitLeft();
      return { ok: false, reason: 'ACCESS DENIED' + (w ? ' — wait ' + Math.ceil(w / 1000) + ' s' : ''), wait: w };
    } finally { busy = false; }
  }
  /* OWNER RECOVERY: the recovery code unlocks the master secret, then a new owner password replaces the old one */
  async function recover(code, newPassword) {
    const left = waitLeft(); if (left > 0) return { ok: false, reason: 'Too many failed attempts — wait ' + Math.ceil(left / 1000) + ' s' };
    if (String(newPassword || '').length < 10) return { ok: false, reason: 'The new owner password needs at least 10 characters' };
    busy = true;
    try {
      const rec = ADMIN_REALM_BUILTIN.records.find(function (r) { return r.u === 'recovery'; });
      const v = await verify({ r: rec, realm: realms.builtin }, String(code || '').trim().toUpperCase());
      if (!v) { failed('recovery', 'wrong recovery code'); return { ok: false, reason: 'ACCESS DENIED — recovery code not valid' }; }
      const a = accounts(); a.owner = await makeRecord('owner', String(newPassword), 'OWNER', 'master', v.key); a.ownerRetired = true; saveAccounts(a);
      W(GUARD_KEY, { fails: 0, until: 0, last: 0 });
      startSession('owner', 'OWNER', realms.builtin, v.key);
      security('OWNER RECOVERY', 'owner password reset with the recovery code');
      return { ok: true };
    } finally { busy = false; }
  }
  function clearAdminEffects() {
    try { if (typeof ADM !== 'undefined') { if (ADM.open && typeof closeAdminCenter === 'function') closeAdminCenter(); ADM.mode = false; ADM.pick = null; } } catch (e) { /* UI not ready */ }
    try { if (typeof S !== 'undefined' && S && S.p5 && S.p5.admin) { S.p5.admin.god = false; S.p5.admin.instant = false; S.p5.admin.freeze = false; S.p5.admin.noEvents = false; } if (typeof S !== 'undefined' && S) S.debugUnlockAll = false; } catch (e) { /* no city */ }
    try { if (typeof WDBG !== 'undefined' && WDBG.on && typeof toggleWorldDebug === 'function') toggleWorldDebug(false); } catch (e) { /* debugger off */ }
    try { if (typeof WB !== 'undefined') WB.on = false; if (typeof RS !== 'undefined') RS.on = false; if (typeof EI !== 'undefined') EI.pick = false; if (typeof P11 !== 'undefined' && P11.multi) P11.multi.clear(); } catch (e) { /* tools off */ }
    try { if (typeof DBG !== 'undefined' && DBG.on && !BUILD.dev) { DBG.on = false; $('debug6').classList.add('hidden'); } } catch (e) { /* panel off */ }
    try { const m = document.getElementById('p11Multi'); if (m) m.remove(); } catch (e) { /* none */ }
    adminUiRefresh();
  }
  function logout(reason) {
    if (!session) return;
    record('logout', session.user, reason || 'LOG OUT');
    security('LOGOUT', session.user + (reason ? ' — ' + reason : ''));
    session = null; keyMat = null;
    clearAdminEffects();
  }
  function lock(reason) {
    if (!session) return;
    lockedUser = session.user;
    record('lock', session.user, reason || 'locked');
    security('ADMIN PANEL LOCKED', session.user + ' — ' + (reason || 'locked'));
    session = null; keyMat = null;
    clearAdminEffects();
    if (typeof toast === 'function') toast('🔒 ADMIN PANEL LOCKED — ' + (reason || 'locked'), '');
  }
  function active() {
    if (!session) return false;
    if (now() > session.expiresAt) { lock('session expired'); return false; }
    return true;
  }
  function touch() { if (session) session.lastActive = now(); }
  function lockMinutes() { return Math.max(1, Math.min(120, (GSET && GSET.adminLockMin) | 0 || 10)); }
  function can(cmd) { return active() && roleAllows(session.role, adminCategory(cmd)); }
  /* CHECK ADMIN PERMISSION — every admin command calls this before it runs */
  function guard(cmd, target) {
    if (!active()) {
      if (now() - denyLogAt > 3000) { denyLogAt = now(); security('ADMIN COMMAND DENIED', String(cmd) + ' — not authenticated'); }
      return false;
    }
    const cat = adminCategory(cmd);
    if (!roleAllows(session.role, cat)) {
      record(cmd, target, 'DENIED (' + session.role + ' lacks ' + cat + ')');
      if (typeof toast === 'function') toast('⛔ Permission denied — ' + session.role + ' cannot use "' + cmd + '" (' + (ADMIN_PERMS[cat] || {}).name + ')', 'bad');
      return false;
    }
    touch();
    return true;
  }
  function info() { return session ? { user: session.user, role: session.role, platform: session.platform, loginAt: session.loginAt, lastActive: session.lastActive, expiresAt: session.expiresAt, lockMin: lockMinutes(), id: session.id, state: session.state } : null; }

  /* --- account management (OWNER) --- */
  async function createAccount(user, password, role) {
    if (!active() || session.role !== 'OWNER' || !keyMat) return { ok: false, reason: 'Only the OWNER can create accounts' };
    user = cleanUser(user);
    if (!user || user === 'owner' || user === 'recovery' || user === 'selftest') return { ok: false, reason: 'Choose another username' };
    if (ADMIN_ROLES.indexOf(role) < 1) return { ok: false, reason: 'Role must be ADMIN, DEVELOPER or DEBUG' };
    if (String(password || '').length < 10) return { ok: false, reason: 'Passwords need at least 10 characters' };
    if (session.realm !== 'builtin') return { ok: false, reason: 'Accounts can only be created by the real owner' };
    const roleKey = ACRYPTO.hmac(keyMat, ACRYPTO.utf8('bct-role:' + role));
    const a = accounts(); a.list = a.list.filter(function (r) { return r.u !== user; });
    a.list.push(await makeRecord(user, String(password), role, 'role', roleKey)); saveAccounts(a);
    record('sec_create', user, 'account created (' + role + ')'); security('ACCOUNT CREATED', user + ' (' + role + ')');
    return { ok: true, msg: 'Account "' + user + '" (' + role + ') created' };
  }
  function deleteAccount(user) {
    if (!active() || session.role !== 'OWNER') return { ok: false, reason: 'Only the OWNER can delete accounts' };
    const a = accounts(), n = a.list.length; a.list = a.list.filter(function (r) { return r.u !== user; }); saveAccounts(a);
    if (a.list.length === n) return { ok: false, reason: 'No such account' };
    record('sec_delete', user, 'account deleted'); security('ACCOUNT DELETED', user);
    return { ok: true, msg: 'Account "' + user + '" deleted' };
  }
  async function changePassword(newPassword) {
    if (!active() || !keyMat) return { ok: false, reason: 'Log in first' };
    if (String(newPassword || '').length < 10) return { ok: false, reason: 'Passwords need at least 10 characters' };
    if (session.realm !== 'builtin') return { ok: false, reason: 'Not available in this session' };
    const a = accounts();
    if (session.role === 'OWNER' && session.user === 'owner') { a.owner = await makeRecord('owner', String(newPassword), 'OWNER', 'master', keyMat); a.ownerRetired = true; }
    else { const u = session.user, role = session.role; a.list = a.list.filter(function (r) { return r.u !== u; }); a.list.push(await makeRecord(u, String(newPassword), role, 'role', keyMat)); }
    saveAccounts(a);
    record('sec_passwd', session.user, 'password changed'); security('PASSWORD CHANGED', session.user);
    return { ok: true, msg: 'Password changed' };
  }
  function accountList() { const a = accounts(); return [{ u: 'owner', role: 'OWNER', created: a.owner ? a.owner.created : 'built-in', by: a.owner ? 'recovery / password change' : 'developer' }].concat(a.list.filter(validRecord).map(function (r) { return { u: r.u, role: r.role, created: r.created || '', by: r.by || '' }; })); }

  /* --- self-test: isolated realm supplied by the platform shell (Windows EXE / Android APK in self-test mode only) --- */
  async function selftestLogin() {
    let st = null;
    try { if (DESKTOP && BCT.selftest && typeof BCT.selftest.adminRealm === 'function') st = BCT.selftest.adminRealm(); } catch (e) { st = null; }
    try { if (!st && IS_ANDROID_APP && ANDROID_INFO.selftest && typeof BCTA.selftestRealm === 'function') st = JSON.parse(BCTA.selftestRealm()); } catch (e) { st = null; }
    if (st && st.realm && st.realm.checks && Array.isArray(st.realm.records)) {
      realms.selftest = { id: 'selftest', checks: Object.freeze(Object.assign({}, st.realm.checks)), records: st.realm.records.filter(validRecord) };
      return login(st.user, st.password);
    }
    const c = window.__BCT_SELFTEST_CRED;           // browser test harness: the real credentials, checked against the built-in realm
    if (c && c.user && c.password) return login(c.user, c.password);
    return { ok: false, reason: 'No self-test credentials' };
  }
  /* auto lock: no admin activity for N minutes */
  setInterval(function () { if (session && now() - session.lastActive > lockMinutes() * 60000) lock('inactive for ' + lockMinutes() + ' min'); else if (session && now() > session.expiresAt) lock('session expired'); }, 5000);
  return {
    login: login, recover: recover, logout: logout, lock: lock, active: active, touch: touch, can: can, guard: guard, record: record, security: security, info: info,
    role: function () { return session ? session.role : null; }, user: function () { return session ? session.user : null; },
    lockedUser: function () { return lockedUser; }, waitLeft: waitLeft, lockMinutes: lockMinutes,
    createAccount: createAccount, deleteAccount: deleteAccount, changePassword: changePassword, accountList: accountList,
    actions: function () { return J(ACT_KEY, []); }, securityLog: function () { return J(SEC_KEY, []); },
    clearLogs: function () { if (!can('sec_clearLog')) return false; W(ACT_KEY, []); W(SEC_KEY, []); security('LOGS CLEARED', session.user); return true; },
    selftestLogin: selftestLogin, _testIdle: function (ms) { if (session) session.lastActive -= Math.max(0, ms | 0); }   // only makes the lock come sooner
  };
})();

/* ===================================== LEGACY HOOKS (admin "mode" = authenticated session) ===================================== */
window.adminModeEnabled = function () { return AdminAuth.active(); };
window.enableAdminMode = function (on) { if (!on) AdminAuth.logout('admin mode disabled'); else if (!AdminAuth.active()) AdminAuth.security('ADMIN COMMAND DENIED', 'enableAdminMode — not authenticated'); };
window.requestAdmin = function (cat) { if (AdminAuth.active()) { openAdminCenter(cat); return true; } return false; };
window.promptEnableAdmin = function (cat) { if (AdminAuth.active()) openAdminCenter(cat); };
window.openAdmin = function () { if (AdminAuth.active()) openAdminCenter(); };

/* ===================================== COMMAND GUARDS ===================================== */
let ADMIN_DEPTH = 0;
function adminWrap(name, idOf, targetOf) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__guarded) return;
  const g = function () {
    const args = arguments, id = idOf ? idOf.apply(null, args) : name;
    if (id === null) return orig.apply(this, args);                // not an admin action (e.g. a player hub action)
    if (ADMIN_DEPTH > 0) return orig.apply(this, args);            // nested call inside an already checked admin command
    const target = targetOf ? targetOf.apply(null, args) : (args[1] !== undefined && typeof args[1] !== 'object' ? args[1] : '');
    if (!AdminAuth.guard(id, target)) return undefined;
    ADMIN_DEPTH++;
    try { const r = orig.apply(this, args); if (id !== 'panel' && adminCategory(id) !== 'view') AdminAuth.record(id, target, r && r.ok === false ? 'FAILED ' + (r.reason || '') : 'OK'); return r; }
    catch (e) { AdminAuth.record(id, target, 'ERROR ' + (e && e.message)); throw e; }
    finally { ADMIN_DEPTH--; }
  };
  g.__guarded = true; g.__orig = orig;
  window[name] = g;
}
const P10_ADMIN_ACTIONS = ['labSet', 'labRun', 'tmSnap', 'tmGo', 'heal', 'maxCare', 'shockStart', 'shockEnd', 'incSpawn', 'incResolve', 'incResolveAll', 'repSet', 'rankNow', 'found', 'wave', 'megaFinish', 'megaFree', 'facSet', 'facGen', 'facPreset', 'scoreNow', 'scoreFix', 'megaGen'];
function installAdminGuards() {
  const id0 = function (a) { return String(a); };
  // security tab actions are handled here, before the regular admin dispatcher
  const ad = window.adminDo;
  if (typeof ad === 'function' && !ad.__secPatched) {
    window.adminDo = function (a, v, el) {
      if (/^sec_/.test(String(a))) return adminSecDo(a, v, el);
      if (a === 'debugPanelToggle') { if (AdminAuth.guard('debugPanel', 'F3')) (window.toggleDebug6.__orig || window.toggleDebug6)(); return; }
      return ad.apply(this, arguments);
    };
    window.adminDo.__secPatched = true;
  }
  adminWrap('adminDo', id0);
  adminWrap('p9AdminDo', id0);
  adminWrap('adminCmd11', id0);
  adminWrap('quickAction', id0);
  adminWrap('adminAction', function (a) { return 'classic:' + a; });
  adminWrap('runAdminCommand', function (line) { return 'console:' + String(line || '').trim().split(/\s+/)[0]; }, function (line) { return String(line || '').slice(0, 80); });
  adminWrap('p10Do', function (a) { return P10_ADMIN_ACTIONS.indexOf(a) >= 0 ? a : null; });
  adminWrap('openAdminCenter', function () { return 'panel'; }, function (cat) { return cat || ''; });
  adminWrap('renderAdmin', function () { return 'classicAdmin'; });
  adminWrap('toggleWorldDebug', function (on) { return on === false ? null : 'worldDebug'; });
  adminWrap('adminGenerate', function () { return 'generate'; });
  adminWrap('unlockEverything', function () { return 'unlockTech'; });
  adminWrap('maxCity', function () { return 'maxCity'; });
  adminWrap('setBrush', function (on) { return on ? 'p9_brushOn' : null; });
  adminWrap('eiAction', function (a) { return 'inspector:' + a; });
  adminWrap('adminPickAt', function () { return ADM.pick ? 'pickCitizen' : null; });
  adminWrap('stressTest', function () { return 'stressTest'; });
  adminWrap('runBenchmark', function () { return 'benchmark'; });
  // debug panel (F3) and the classic debug HUD: release builds need an authenticated DEVELOPER / DEBUG / OWNER
  const td = window.toggleDebug6;
  if (typeof td === 'function' && !td.__guarded) {
    window.toggleDebug6 = function () { if (!BUILD.dev && !(typeof DBG !== 'undefined' && DBG.on) && !AdminAuth.guard('debugPanel', 'F3')) return; return td.apply(this, arguments); };
    window.toggleDebug6.__guarded = true; window.toggleDebug6.__orig = td;
  }
}
/* Admin state can never come from a save, local storage or a URL: without a session every admin effect is switched off */
function enforceAdminState() {
  if (AdminAuth.active()) return;
  let dirty = false;
  try {
    if (typeof S !== 'undefined' && S && S.p5 && S.p5.admin) ['god', 'instant', 'freeze', 'noEvents'].forEach(function (k) { if (S.p5.admin[k]) { S.p5.admin[k] = false; dirty = true; } });
    if (typeof S !== 'undefined' && S && S.debugUnlockAll) { S.debugUnlockAll = false; dirty = true; }
    if (typeof ADM !== 'undefined' && (ADM.mode || ADM.open)) { if (ADM.open) closeAdminCenter(); ADM.mode = false; dirty = true; }
    if (typeof WB !== 'undefined' && WB.on) { WB.on = false; dirty = true; }
    if (typeof WDBG !== 'undefined' && WDBG.on) { toggleWorldDebug(false); dirty = true; }
  } catch (e) { /* not ready */ }
  if (dirty) AdminAuth.security('ADMIN STATE REMOVED', 'admin flags without an authenticated session were switched off');
}
setInterval(enforceAdminState, 2000);

/* ===================================== ADMIN UI: LOGIN, PILL, NAV, SECURITY TAB, GUIDE ===================================== */
function adminUiRefresh() {
  const on = AdminAuth.active();
  document.body.classList.toggle('adminAuthed', on);
  let pill = document.getElementById('admPill');
  if (on && !pill) {
    pill = document.createElement('button'); pill.id = 'admPill'; pill.type = 'button';
    pill.onclick = function () { AdminAuth.touch(); openAdminCenter(); };
    document.body.appendChild(pill);
  }
  if (!on && pill) pill.remove();
  if (on && pill) { const i = AdminAuth.info(); pill.textContent = (ROLE_INFO[i.role] || {}).icon + ' ' + i.role + ' · ' + i.user; pill.title = 'World Control Center (F10) · auto-lock after ' + i.lockMin + ' min idle'; }
}
setInterval(function () { if (AdminAuth.active() || document.getElementById('admPill')) adminUiRefresh(); }, 15000);
/* Any input while an admin tool is open counts as admin activity (auto-lock timer) */
['pointerdown', 'keydown', 'wheel'].forEach(function (ev) { window.addEventListener(ev, function () { if (AdminAuth.active() && typeof ADM !== 'undefined' && (ADM.open || (typeof WB !== 'undefined' && WB.on))) AdminAuth.touch(); }, { passive: true, capture: true }); });

function closeAdminLogin() { const d = document.getElementById('admLogin'); if (d) d.remove(); }
function openAdminLogin(opts) {
  opts = opts || {};
  if (AdminAuth.active()) { openAdminCenter(opts.cat); return; }
  closeAdminLogin();
  const locked = AdminAuth.lockedUser();
  const d = document.createElement('div'); d.id = 'admLogin';
  d.innerHTML = '<form id="admLoginBox" autocomplete="off" onsubmit="return false">' +
    '<div class="alHead">🛡️ ADMIN ACCESS</div>' +
    '<div class="alSub">' + (locked ? '🔒 ADMIN PANEL LOCKED — sign in again to continue.' : 'Authorized personnel only. All attempts are logged.') + '</div>' +
    '<div id="alLogin"><label>Username<input id="alUser" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(locked || '') + '"></label>' +
    '<label>Password<input id="alPass" type="password" autocomplete="off"></label>' +
    '<div id="alMsg" class="alMsg"></div>' +
    '<div class="alBtns"><button type="button" class="btn" id="alCancel">CANCEL</button><button type="submit" class="btn gold" id="alGo">LOG IN</button></div>' +
    '<button type="button" class="alLink" id="alRecLink">Owner recovery</button></div>' +
    '<div id="alRec" class="hidden"><label>Recovery code<input id="alCode" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>' +
    '<label>New owner password (min. 10)<input id="alNew" type="password" autocomplete="off"></label><label>Repeat new password<input id="alNew2" type="password" autocomplete="off"></label>' +
    '<div id="alRMsg" class="alMsg"></div><div class="alBtns"><button type="button" class="btn" id="alBack">BACK</button><button type="button" class="btn gold" id="alRecGo">RESET OWNER PASSWORD</button></div></div>' +
    '</form>';
  document.body.appendChild(d);
  const msg = function (t, cls, id) { const m = document.getElementById(id || 'alMsg'); if (m) { m.textContent = t; m.className = 'alMsg ' + (cls || ''); } };
  let tick = 0;
  const countdown = function () {
    clearInterval(tick);
    const go = document.getElementById('alGo'); if (!go) return;
    const upd = function () { const w = AdminAuth.waitLeft(); if (!document.getElementById('alGo')) { clearInterval(tick); return; } go.disabled = w > 0; if (w > 0) msg('Too many failed attempts — wait ' + Math.ceil(w / 1000) + ' s', 'neg'); else { clearInterval(tick); if (/wait/.test((document.getElementById('alMsg') || {}).textContent || '')) msg('', ''); } };
    upd(); tick = setInterval(upd, 500);
  };
  const submit = function () {
    const u = document.getElementById('alUser').value, p = document.getElementById('alPass').value;
    msg('Verifying…', '');
    document.getElementById('alGo').disabled = true;
    AdminAuth.login(u, p).then(function (r) {
      if (!document.getElementById('admLogin')) return;
      document.getElementById('alPass').value = '';
      if (r.ok) { closeAdminLogin(); adminUiRefresh(); toast('🛡️ Welcome, ' + AdminAuth.user() + ' (' + r.role + ')', 'good'); if (typeof sfx === 'function') sfx('success'); if (opts.onOk) opts.onOk(); else if (typeof S !== 'undefined' && S && MAP.roads) { openAdminCenter(opts.cat); adminGuideOnce(); } return; }
      msg('⛔ ' + r.reason, 'neg'); if (typeof sfx === 'function') sfx('error');
      document.getElementById('alGo').disabled = false; countdown();
    });
  };
  document.getElementById('alGo').onclick = submit;
  document.getElementById('alPass').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') closeAdminLogin(); };
  document.getElementById('alUser').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); document.getElementById('alPass').focus(); } if (e.key === 'Escape') closeAdminLogin(); };
  document.getElementById('alCancel').onclick = closeAdminLogin;
  document.getElementById('alRecLink').onclick = function () { document.getElementById('alLogin').classList.add('hidden'); document.getElementById('alRec').classList.remove('hidden'); document.getElementById('alCode').focus(); };
  document.getElementById('alBack').onclick = function () { document.getElementById('alRec').classList.add('hidden'); document.getElementById('alLogin').classList.remove('hidden'); };
  ['alCode', 'alNew', 'alNew2'].forEach(function (id) { document.getElementById(id).onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Escape') closeAdminLogin(); }; });
  document.getElementById('alRecGo').onclick = function () {
    const a = document.getElementById('alNew').value, b = document.getElementById('alNew2').value;
    if (a !== b) { msg('The new passwords do not match', 'neg', 'alRMsg'); return; }
    msg('Verifying…', '', 'alRMsg');
    AdminAuth.recover(document.getElementById('alCode').value, a).then(function (r) {
      if (r.ok) { closeAdminLogin(); adminUiRefresh(); toast('👑 Owner password reset — you are logged in as OWNER', 'good'); if (typeof S !== 'undefined' && S && MAP.roads) openAdminCenter('wc_security'); }
      else msg('⛔ ' + r.reason, 'neg', 'alRMsg');
    });
  };
  setTimeout(function () { const f = document.getElementById(locked ? 'alPass' : 'alUser'); if (f) f.focus(); }, 30);
  countdown();
  AdminAuth.security('LOGIN SCREEN OPENED', opts.via || '');
}

/* Panel navigation: 16 sections, filtered by the permission matrix */
function adminNavHtml() {
  const role = AdminAuth.role();
  const names = {}; WC_CATS.concat(ADM_CATS).concat(ADMIN_EXTRA_CATS).forEach(function (c) { names[c[0]] = c; });
  if (!adminTabAllowed(role, ADM.cat)) { const first = adminFirstTab(role); if (first) ADM.cat = first; }
  return ADMIN_GROUPS.map(function (g) {
    const tabs = g[2].filter(function (c) { return names[c] && adminTabAllowed(role, c); });
    if (!tabs.length) return '';
    return '<div class="admNavGroup">' + g[1] + ' ' + g[0] + '</div>' + tabs.map(function (c) { const n = names[c]; return '<button class="admNav ' + (ADM.cat === c ? 'on' : '') + '" data-acat="' + c + '"><span>' + n[1] + '</span>' + n[2] + '</button>'; }).join('');
  }).join('');
}
function adminFirstTab(role) { for (let i = 0; i < ADMIN_GROUPS.length; i++) for (let j = 0; j < ADMIN_GROUPS[i][2].length; j++) if (adminTabAllowed(role, ADMIN_GROUPS[i][2][j])) return ADMIN_GROUPS[i][2][j]; return null; }
const ADMIN_EXTRA_CATS = [['wc_security', '🔐', 'ADMIN SECURITY'], ['wc_perf', '⏱', 'PERFORMANCE PROFILER']];

function adminSecDo(a, v) {
  const say = function (r) { if (!r) return; toast((r.ok === false ? '❌ ' + r.reason : '✅ ' + (r.msg || 'Done')), r.ok === false ? 'bad' : 'good'); if (ADM.open) renderAdminCenter(); };
  if (!AdminAuth.guard(a, v)) return;
  switch (a) {
    case 'sec_lock': AdminAuth.lock('locked by ' + AdminAuth.user()); return;
    case 'sec_logout': AdminAuth.logout(); toast('⏏ Logged out — admin tools are disabled', 'good'); return;
    case 'sec_lockMin': GSET.adminLockMin = clamp(Number(v) | 0, 1, 120); saveGSET(); AdminAuth.record('sec_lockMin', v, 'auto-lock ' + GSET.adminLockMin + ' min'); adminUiRefresh(); return renderAdminCenter();
    case 'sec_guide': return openAdminGuide();
    case 'sec_create': { const u = ($('secUser') || {}).value, p = ($('secPass') || {}).value, r = ($('secRole') || {}).value; toast('⏳ Creating account…', ''); AdminAuth.createAccount(u, p, r).then(say); return; }
    case 'sec_delete': return confirmDialog('🗑 Delete admin account "' + esc(v) + '"?', 'This user can no longer log in.', 'Delete', function () { say(AdminAuth.deleteAccount(v)); });
    case 'sec_passwd': { const a1 = ($('secNew') || {}).value, a2 = ($('secNew2') || {}).value; if (a1 !== a2) { toast('❌ The passwords do not match', 'bad'); return; } toast('⏳ Changing password…', ''); AdminAuth.changePassword(a1).then(say); return; }
    case 'sec_clearLog': say(AdminAuth.clearLogs() ? { msg: 'Logs cleared' } : { ok: false, reason: 'Not allowed' }); return;
  }
}
function adminSecurityHtml() {
  const i = AdminAuth.info(); if (!i) return '';
  const t = function (ms) { return new Date(ms).toLocaleTimeString(); };
  const idle = Math.round((Date.now() - i.lastActive) / 1000), left = Math.max(0, i.lockMin * 60 - idle);
  let h = aCard('🔐 ADMIN SESSION', '<div class="grid3">' + aKv('USER', esc(i.user)) + aKv('ROLE', (ROLE_INFO[i.role] || {}).icon + ' ' + i.role) + aKv('PLATFORM', PLATFORM_NAME) + aKv('LOGIN', t(i.loginAt)) + aKv('AUTO-LOCK IN', Math.floor(left / 60) + ' min ' + (left % 60) + ' s') + aKv('EXPIRES', t(i.expiresAt)) + '</div>' +
    '<div class="admRow"><span>Auto-lock after inactivity</span><div class="seg">' + [1, 5, 10, 15, 30, 60].map(function (m) { return '<button type="button" class="' + (i.lockMin === m ? 'on' : '') + '" data-ac="sec_lockMin" data-v="' + m + '">' + m + ' min</button>'; }).join('') + '</div></div>' +
    aRow(ab('sec_lock', '🔒 LOCK NOW', 'blue') + ab('sec_logout', '⏏ LOG OUT', 'red') + ab('sec_guide', '📖 WORLD CONTROL CENTER GUIDE', 'gold')));
  h += aCard('🧾 PERMISSION MATRIX', '<table class="p10Tbl"><tr><th>Command category</th>' + ADMIN_ROLES.map(function (r) { return '<th>' + ROLE_INFO[r].icon + ' ' + r + '</th>'; }).join('') + '</tr>' +
    Object.keys(ADMIN_PERMS).map(function (k) { return '<tr><td>' + ADMIN_PERMS[k].name + '</td>' + ADMIN_ROLES.map(function (r) { return '<td>' + (roleAllows(r, k) ? '✅' : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' +
    '<p class="small">' + ADMIN_ROLES.map(function (r) { return '<b>' + r + '</b>: ' + ROLE_INFO[r].desc; }).join('<br>') + '</p>');
  const acc = AdminAuth.accountList();
  h += aCard('👥 ADMIN ACCOUNTS', '<table class="p10Tbl"><tr><th>User</th><th>Role</th><th>Created</th><th></th></tr>' + acc.map(function (x) { return '<tr><td>' + esc(x.u) + '</td><td>' + x.role + '</td><td class="small">' + esc(String(x.created).slice(0, 16)) + '</td><td>' + (x.u !== 'owner' && i.role === 'OWNER' ? ab('sec_delete', 'Delete', 'red', x.u) : '') + '</td></tr>'; }).join('') + '</table>' +
    (i.role === 'OWNER' ? '<div class="admRow"><span>New account</span><input class="admInput" id="secUser" placeholder="username" autocomplete="off"><input class="admInput" id="secPass" type="password" placeholder="password (min. 10)" autocomplete="off"><select class="admInput" id="secRole">' + ADMIN_ROLES.slice(1).map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' + ab('sec_create', 'CREATE', 'green') + '</div>' : '') +
    '<div class="admRow"><span>Change my password</span><input class="admInput" id="secNew" type="password" placeholder="new password" autocomplete="off"><input class="admInput" id="secNew2" type="password" placeholder="repeat" autocomplete="off">' + ab('sec_passwd', 'CHANGE', 'blue') + '</div>' +
    '<p class="small">Accounts are stored only as salted PBKDF2 records bound to their role key — copying or editing them in storage gives no access.</p>');
  const act = AdminAuth.actions().slice(-40).reverse();
  h += aCard('📜 ADMIN ACTION LOG', act.length ? '<table class="p10Tbl"><tr><th>Time</th><th>User</th><th>Role</th><th>Command</th><th>Target</th><th>Result</th></tr>' + act.map(function (e) { return '<tr><td>' + new Date(e.t).toLocaleTimeString() + '</td><td>' + esc(e.user) + '</td><td>' + e.role + '</td><td>' + esc(e.cmd) + '</td><td>' + esc(e.target) + '</td><td class="small">' + esc(e.result) + '</td></tr>'; }).join('') + '</table>' : '<p class="small">No admin actions yet.</p>');
  const sec = AdminAuth.securityLog().slice(-30).reverse();
  h += aCard('🚨 SECURITY LOG', sec.length ? '<table class="p10Tbl"><tr><th>Time</th><th>Event</th><th>Detail</th><th>Platform</th></tr>' + sec.map(function (e) { return '<tr><td>' + new Date(e.t).toLocaleString() + '</td><td>' + esc(e.event) + '</td><td class="small">' + esc(e.detail) + '</td><td>' + esc(e.platform || '') + '</td></tr>'; }).join('') + '</table>' + (i.role === 'OWNER' ? aRow(ab('sec_clearLog', '🗑 Clear logs', 'red')) : '') : '<p class="small">No security events.</p>');
  return h;
}
function adminPerfHtml() {
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' / ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB' : 'n/a';
  const sys = (Game.simSystems || []).map(function (s) { return [s.name, s.every + ' s', s.ms !== undefined ? s.ms.toFixed(2) + ' ms' : '—']; });
  return aCard('⏱ PERFORMANCE PROFILER', '<div class="grid3">' + aKv('FPS', Math.round(PERF.fps)) + aKv('TPS', Game.tpsMeasured.toFixed(1)) + aKv('RENDER', (PERF.renderMs || 0).toFixed(2) + ' ms') + aKv('SIMULATION', simMsTotal().toFixed(2) + ' ms') + aKv('JS HEAP', mem) + aKv('QUALITY', (typeof perfModeLabel === 'function' ? perfModeLabel() : S.settings.quality)) +
    aKv('CITIZENS', AG.citizens.length) + aKv('VEHICLES', AG.vehicles.length) + aKv('BUILDINGS', S.buildings.list.length) + '</div>' +
    aRow(ab('benchmark', '⏱ RUN BENCHMARK', 'gold') + ab('stressTest', '🔥 STRESS TEST') + '<button class="btn small" data-ac="debugPanelToggle">🐞 F3 DEBUG PANEL</button>') +
    '<table class="p10Tbl"><tr><th>System</th><th>Interval</th><th>Last tick</th></tr>' + sys.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') + '</table>' +
    (typeof p11DebugLines === 'function' ? '<pre class="small">' + esc(p11DebugLines()) + '</pre>' : ''));
}
ADM_VIEWS.wc_security = adminSecurityHtml;
ADM_VIEWS.wc_perf = adminPerfHtml;
ADMIN_CMD_CAT.debugPanelToggle = 'perf';

/* WORLD CONTROL CENTER GUIDE — only reachable inside the authenticated panel */
function openAdminGuide() {
  const i = AdminAuth.info(); if (!i) return;
  showModal('📖 WORLD CONTROL CENTER GUIDE', '<div class="card"><h3>Welcome, ' + esc(i.user) + ' (' + i.role + ')</h3><p class="small">The World Control Center is separate from the normal game. Everything you do here is checked against your role and written to the ADMIN ACTION LOG.</p></div>' +
    '<div class="card"><h3>⌨️ Access</h3><p class="small"><b>Ctrl+Shift+F10</b> → ADMIN ACCESS (Windows) · tap the version label 7× (Android / touch) · after login: <b>F10</b> or the 🛡️ pill opens the panel · <b>Esc</b> closes it.</p></div>' +
    '<div class="card"><h3>🗂 Sections</h3><p class="small">WORLD (generate, factory, regions, brush) · SIMULATION (lab, what-if, time machine) · CITY · ECONOMY · CITIZENS · TRAFFIC · BUILDINGS · UTILITIES · TRANSPORT · COMPANIES · DISASTERS · WEATHER · TECHNOLOGY · SAVE (snapshots, clone, branch, timeline) · DEBUG (validator, inspector, profiler) · SYSTEM (session, accounts, logs).</p></div>' +
    '<div class="card"><h3>🔐 Security</h3><p class="small">Roles: ' + ADMIN_ROLES.map(function (r) { return '<b>' + r + '</b> — ' + ROLE_INFO[r].desc; }).join('<br>') + '<br>The panel locks after ' + i.lockMin + ' minutes without activity (SYSTEM → ADMIN SECURITY). Always use <b>LOG OUT</b> when you are done — it removes free build, instant build and every other admin effect.</p></div>' +
    '<div class="card"><h3>💡 Tips</h3><p class="small">Take a snapshot before big experiments (SAVE → SNAPSHOTS 2.0). Simulation Lab and What-If run on a copy of the world. The console (bottom) accepts <b>help</b>.</p></div>');
}
function adminGuideOnce() {
  try { const k = 'bct_admin_guide_' + AdminAuth.user(); if (!Store.getItem(k)) { Store.setItem(k, '1'); setTimeout(openAdminGuide, 400); } } catch (e) { /* storage */ }
}

/* ===================================== SECRET ACCESS ===================================== */
/* Ctrl+Shift+F10 → ADMIN LOGIN · F10 → panel (only when authenticated; otherwise nothing at all) */
window.addEventListener('keydown', function (e) {
  if (e.key !== 'F10') return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.ctrlKey && e.shiftKey) { if (AdminAuth.active()) openAdminCenter(); else openAdminLogin({ via: 'Ctrl+Shift+F10' }); return; }
  if (!AdminAuth.active()) { AdminAuth.security('ADMIN COMMAND DENIED', 'F10 — not authenticated'); return; }
  if (typeof S === 'undefined' || !S || !MAP.roads) return;
  if (ADM.open) { closeAdminCenter(); return; }
  if (e.ctrlKey) { openAdminCenter('world'); return; }
  if (typeof WB !== 'undefined' && (WB.on || RS.on)) p9CancelTools();
  openAdminCenter();
}, true);
/* Touch / mobile: 7 quick taps on a version label (title screen, settings) open ADMIN LOGIN */
(function () {
  let taps = 0, last = 0;
  document.addEventListener('click', function (e) {
    const el = e.target && e.target.closest && e.target.closest('#titleVersion, .verTap');
    if (!el) return;
    const t = Date.now(); taps = t - last < 700 ? taps + 1 : 1; last = t;
    if (taps >= 7) { taps = 0; openAdminLogin({ via: 'version label ×7' }); }
  }, true);
})();
installAdminGuards();
