'use strict';
/* BLOCK CITY TYCOON — PLATFORM ADAPTER (Part 14)
   One common game engine (simulation, economy, citizens, traffic, buildings, roads, world, save, events, quests,
   achievements); everything that differs per platform goes through ONE adapter instead of scattered `if Android` checks:

     PlatformAdapter
       ├─ AndroidPlatformAdapter  → TouchInput · MobileUI · SafeArea · Lifecycle · AndroidFileSystem · MobilePerformance · Haptics
       ├─ WindowsPlatformAdapter  → Input (mouse / keyboard / controller) · Window · FileSystem · DesktopUI
       └─ BrowserPlatformAdapter  → the same game in a browser (touch phones get the mobile UI)

   Also here: MOBILE_MODE, the safe-area API (safeLeft / safeRight / safeTop / safeBottom), the lifecycle event bus
   (foreground / background / pause / resume / stop / restart), haptic feedback, the SaveProvider layer (local today,
   ready for a cloud provider later) and the platform-independent ACTION system (Action.Build, Action.Cancel, …) that
   touch, mouse, keyboard and controller all call. Loaded right after config.js. */

const MOBILE_MODE = IS_MOBILE;                     // Android (and touch phones / tablets) → true · Windows → false

/* ---------- lifecycle bus: FOREGROUND · BACKGROUND · PAUSE · RESUME · STOP · RESTART ---------- */
const Lifecycle = (function () {
  const handlers = {}, state = { now: 'foreground', since: Date.now(), backgroundAt: 0 };
  function on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }
  function emit(ev, info) {
    if (ev === 'background' || ev === 'pause') { if (state.now === 'background') return; state.now = 'background'; state.backgroundAt = Date.now(); }
    else if (ev === 'foreground' || ev === 'resume') { if (state.now === 'foreground') return; state.now = 'foreground'; }
    state.since = Date.now();
    (handlers[ev] || []).concat(ev === 'pause' ? handlers.background || [] : ev === 'resume' ? handlers.foreground || [] : []).forEach(function (fn) { try { fn(info || {}); } catch (e) { if (typeof Log !== 'undefined') Log.warn('Lifecycle ' + ev + ': ' + e.message); } });
  }
  return { on: on, emit: emit, state: state };
})();

/* ---------- haptic feedback (Android vibrator through the shell, navigator.vibrate elsewhere) — short, never spammy ---------- */
const HAPTIC_PATTERNS = { tap: 8, success: [12, 40, 18], error: [30, 50, 30], notify: 15, alert: [40, 60, 40, 60, 60] };
let HAPTIC_LAST = 0;
function haptic(kind) {
  try {
    if (typeof GSET === 'undefined' || GSET.haptics === false || !MOBILE_MODE) return false;
    const now = performance.now(); if (kind === 'tap' && now - HAPTIC_LAST < 70) return false; HAPTIC_LAST = now;
    const p = HAPTIC_PATTERNS[kind] || HAPTIC_PATTERNS.tap;
    if (IS_ANDROID_APP && typeof BCTA.vibrate === 'function') { BCTA.vibrate(JSON.stringify(Array.isArray(p) ? p : [p])); return true; }
    if (navigator.vibrate) { navigator.vibrate(p); return true; }
  } catch (e) { /* no vibrator */ }
  return false;
}

/* ---------- SAVE PROVIDERS: the Save Engine talks to a provider, never to a platform API directly ---------- */
const LocalSaveProvider = {
  id: 'local', name: IS_ANDROID_APP ? 'App private storage (files/store, removed on uninstall, kept on update)' : DESKTOP ? '%APPDATA%\\BLOCK CITY TYCOON (files, atomic writes)' : 'Browser storage',
  available: true,
  read: function (key) { return Store.getItem(key); },
  write: function (key, text) { Store.setItem(key, text); return true; },     // Store writes atomically (tmp → validate → rename) on Android and Windows
  remove: function (key) { Store.removeItem(key); },
  keys: function () { return Store.keys(); }
};
/* Prepared, not enabled: the game is offline-first — a cloud provider can sync the same keys later */
const CloudSaveProvider = { id: 'cloud', name: 'Cloud save (not enabled)', available: false, read: function () { return null; }, write: function () { return false; }, remove: function () { }, keys: function () { return []; } };
const SaveProviders = { active: LocalSaveProvider, local: LocalSaveProvider, cloud: CloudSaveProvider };

/* ---------- ACTIONS: one action system for touch · mouse · keyboard · controller ---------- */
const Action = Object.freeze({ Build: 'build', Road: 'road', Zone: 'zone', Cancel: 'cancel', Select: 'select', Rotate: 'rotate', Pause: 'pause', Map: 'map', City: 'city', Economy: 'economy', Undo: 'undo', Search: 'search', Speed: 'speed', ResetCamera: 'resetCamera' });
const Actions = (function () {
  const reg = {}, log = [];
  function register(name, fn) { reg[name] = fn; }
  function run(name, source) {
    const fn = reg[name]; if (!fn) return false;
    log.unshift({ a: name, src: source || '?', t: Date.now() }); if (log.length > 30) log.length = 30;
    try { fn(source); } catch (e) { if (typeof Log !== 'undefined') Log.warn('Action ' + name + ': ' + e.message); return false; }
    return true;
  }
  return { register: register, run: run, has: function (n) { return !!reg[n]; }, log: log };
})();

/* ---------- the adapters ---------- */
function basePlatformAdapter(over) {
  return Object.assign({
    id: PLATFORM_ID, name: PLATFORM_NAME, mobileMode: MOBILE_MODE, input: MOBILE_MODE ? 'touch' : 'mouse', ui: MOBILE_MODE ? 'mobile' : 'desktop',
    fileSystem: LocalSaveProvider, lifecycle: Lifecycle, haptic: haptic,
    /* safe area in CSS px: notch, camera hole, rounded corners, navigation / gesture bar */
    safeArea: function () { const sa = (typeof RESP !== 'undefined' && RESP.sa) || { t: 0, r: 0, b: 0, l: 0 }; return { safeLeft: sa.l, safeRight: sa.r, safeTop: sa.t, safeBottom: sa.b }; },
    performance: { defaultFps: 60, groundPixelBudget: 26e6, autosaveSec: 30 },
    device: function () { return Platform.device(); },
    requirements: null
  }, over || {});
}
const AndroidPlatformAdapter = basePlatformAdapter({
  kind: 'android', input: 'touch', ui: 'mobile',
  performance: { defaultFps: 60, weakFps: 30, groundPixelBudget: 9e6, autosaveSec: 300 },
  requirements: { android: '7.0 (API 24)', ramMB: 2048, recommendedRamMB: 4096, storageMB: 150, gpu: 'OpenGL ES 3.0 class (any phone from 2017+)' },
  fullscreen: true, orientation: 'landscape'
});
const WindowsPlatformAdapter = basePlatformAdapter({
  kind: 'windows', input: 'mouse', ui: 'desktop',
  performance: { defaultFps: 60, groundPixelBudget: 26e6, autosaveSec: 30 },
  requirements: { windows: 'Windows 10 / 11 (64-bit)', ramMB: 4096, recommendedRamMB: 8192, storageMB: 400, gpu: 'any DirectX 11 GPU' }
});
const BrowserPlatformAdapter = basePlatformAdapter({ kind: 'browser', requirements: { browser: 'Chrome / Edge 100+' } });
const PLATFORM_ADAPTER = IS_ANDROID ? AndroidPlatformAdapter : IS_WINDOWS && DESKTOP ? WindowsPlatformAdapter : BrowserPlatformAdapter;
window.PLATFORM_ADAPTER = PLATFORM_ADAPTER;
