'use strict';
/* =======================================================================
   BLOCK CITY TYCOON — Electron main process (Windows desktop edition)
   - creates the game window (1280×720, min 1024×600, resizable / maximize / fullscreen / borderless)
   - stores saves, settings and logs in the user data folder (%APPDATA%\BLOCK CITY TYCOON)
   - atomic save files, crash detection (session.lock), renderer crash recovery
   - native Windows dialogs (open / save / select folder), screenshots to Pictures\BLOCK CITY TYCOON
   - exit confirmation, single instance, DevTools only in development mode (npm run dev)
   ======================================================================= */
const { app, BrowserWindow, ipcMain, dialog, shell, screen, Menu, net, session: electronSession } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStorage } = require('./electron/storage');
const { createLogger } = require('./electron/logger');
const { createSession } = require('./electron/session');
const { createUpdater } = require('./electron/updater');
const pkg = require('./package.json');

const DEV = process.argv.includes('--dev') || process.env.BCT_DEV === '1';
const PRODUCT = 'BLOCK CITY TYCOON';
const ICON = path.join(__dirname, 'src', 'assets', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const INDEX = path.join(__dirname, 'src', 'index.html');
const MIN_W = 1024, MIN_H = 600;

/* --- User data location: %APPDATA%\BLOCK CITY TYCOON (portable build: next to the .exe; tests: BCT_USER_DATA) --- */
if (process.env.BCT_USER_DATA) app.setPath('userData', path.resolve(process.env.BCT_USER_DATA));
else if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'BLOCK CITY TYCOON Data'));

/* Smooth simulation when the window is in the background (Alt+Tab) */
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
if (process.platform === 'win32') app.setAppUserModelId('com.blockcitytycoon.game');

let log = null, storage = null, sessionLock = null, updater = null;
let win = null;
let quitting = false;            // true once the player confirmed EXIT (or the OS is shutting down)
let closeHandlerReady = false;   // the renderer registered its exit dialog
let closeAck = false, closeWatch = null;
let rendererCrashed = false;     // a renderer crash in this run → the reloaded page offers recovery
let createdBorderless = false;

/* --- Single instance: two windows writing the same save files would be unsafe --- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', function () { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(start);
}

function start() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  log = createLogger(path.join(userData, 'logs'));
  log.info('Game started — ' + PRODUCT + ' v' + app.getVersion() + ' (Electron ' + process.versions.electron + ', ' + process.platform + ' ' + process.arch + (DEV ? ', DEVELOPMENT' : '') + ')');
  log.info('User data: ' + userData);
  storage = createStorage(userData, log);
  storage.cleanupTemp();
  sessionLock = createSession(userData, log);
  sessionLock.open(app.getVersion());
  updater = createUpdater({ app: app, net: net, shell: shell, log: log, manifestUrl: (pkg.bctUpdate && pkg.bctUpdate.manifestUrl) || '' });
  process.on('uncaughtException', function (e) { log.error('Main process: ' + (e && e.stack || e)); });

  if (!DEV) Menu.setApplicationMenu(null);                  // no menu bar, no reload / DevTools shortcuts for players
  hardenSession();
  registerIpc();
  createWindow();
}

function readWindowSettings() {
  const s = storage.readSettings();
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(s.resolution || '');
  return { width: m ? +m[1] : 1280, height: m ? +m[2] : 720, fullscreen: !!s.fullscreen, borderless: !!s.borderless };
}

function createWindow() {
  const ws = readWindowSettings();
  const display = screen.getPrimaryDisplay();
  const wa = display.workAreaSize;
  createdBorderless = ws.borderless;
  const opts = {
    title: PRODUCT, icon: ICON, show: false, backgroundColor: '#12152b', autoHideMenuBar: true,
    minWidth: MIN_W, minHeight: MIN_H, resizable: true, maximizable: true, minimizable: true, fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      backgroundThrottling: false, spellcheck: false, devTools: DEV
    }
  };
  if (ws.borderless) {                                         // borderless window covering the whole display
    Object.assign(opts, display.bounds, { frame: false, resizable: false, maximizable: false, thickFrame: false });
  } else {
    Object.assign(opts, { width: Math.max(MIN_W, Math.min(ws.width, wa.width)), height: Math.max(MIN_H, Math.min(ws.height, wa.height)), useContentSize: true, center: true, fullscreen: ws.fullscreen });
  }
  win = new BrowserWindow(opts);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.once('ready-to-show', function () { win.show(); win.focus(); log.info('Window shown ' + win.getContentSize().join('×') + (ws.fullscreen ? ' fullscreen' : '') + (ws.borderless ? ' borderless' : '')); });
  win.loadFile(INDEX).catch(function (e) { log.error('Could not load ' + INDEX + ': ' + e.message); });

  win.on('close', onWindowClose);
  win.on('closed', function () { win = null; });
  win.on('session-end', function () { quitting = true; log.warn('Windows session ending — exiting'); });
  win.on('unresponsive', onUnresponsive);
  win.on('responsive', function () { log.info('Renderer responsive again'); });
  win.on('enter-full-screen', function () { log.info('Fullscreen ON'); });
  win.on('leave-full-screen', function () { log.info('Fullscreen OFF'); });

  const wc = win.webContents;
  wc.on('render-process-gone', function (e, d) {
    log.error('Renderer process gone: ' + d.reason + ' (exit code ' + d.exitCode + ')');
    if (quitting || d.reason === 'clean-exit') return;
    rendererCrashed = true; closeHandlerReady = false;
    setTimeout(function () { if (win && !win.isDestroyed()) win.reload(); }, 800);   // the reloaded game offers PREVIOUS SESSION RECOVERY
  });
  wc.on('preload-error', function (e, p, err) { log.error('Preload error: ' + err.message); });
  wc.on('console-message', function (e, level, message, line, source) {
    const lv = e && e.level !== undefined ? e.level : level;          // Electron ≥ 35 passes the details on the event
    const msg = e && e.message !== undefined ? e.message : message;
    const ln = e && e.lineNumber !== undefined ? e.lineNumber : line, src = e && e.sourceId !== undefined ? e.sourceId : source;
    if (lv === 'error' || lv === 3) log.warn('Renderer console: ' + msg + ' (' + path.basename(String(src || '')) + ':' + ln + ')');
  });
  wc.on('did-fail-load', function (e, code, desc, url) { log.error('Load failed ' + code + ' ' + desc + ' ' + url); });
  wc.on('will-navigate', function (e, url) { if (url !== wc.getURL()) { e.preventDefault(); log.warn('Blocked navigation to ' + url); } });
  wc.setWindowOpenHandler(function (d) { log.warn('Blocked popup ' + d.url); return { action: 'deny' }; });
  wc.on('before-input-event', function (e, input) {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (DEV && ctrl && input.shift && input.key.toLowerCase() === 'i') { wc.toggleDevTools(); e.preventDefault(); }
    else if (DEV && ctrl && input.key.toLowerCase() === 'r') { wc.reload(); e.preventDefault(); }
    else if (!DEV && (input.key === 'F5' || (ctrl && input.key.toLowerCase() === 'r'))) e.preventDefault();   // no accidental reloads in the EXE
  });
  if (DEV && process.env.BCT_OPEN_DEVTOOLS === '1') wc.openDevTools({ mode: 'detach' });
}

/* --- Exit flow: X / Alt+F4 → the game autosaves and shows EXIT BLOCK CITY TYCOON? [EXIT] [CANCEL] --- */
function onWindowClose(e) {
  if (quitting) return;
  if (!closeHandlerReady || win.webContents.isCrashed()) { quitting = true; log.info('Window closed before the game was ready'); return; }
  e.preventDefault();
  closeAck = false;
  win.webContents.send('app:close-request');
  clearTimeout(closeWatch);
  closeWatch = setTimeout(function () {                   // the renderer did not answer: it is frozen
    if (closeAck || quitting || !win) return;
    const r = dialog.showMessageBoxSync(win, { type: 'warning', title: PRODUCT, buttons: ['Exit', 'Wait'], defaultId: 1, cancelId: 1,
      message: 'BLOCK CITY TYCOON is not responding.', detail: 'Your last autosave and the crash-recovery snapshot are kept. Exit anyway?' });
    if (r === 0) { log.warn('Forced exit (renderer not responding)'); quitting = true; win.destroy(); }
  }, 5000);
}
function onUnresponsive() {
  log.warn('Renderer not responding');
  if (!win || quitting) return;
  dialog.showMessageBox(win, { type: 'warning', title: PRODUCT, buttons: ['Wait', 'Restart game'], defaultId: 0, cancelId: 0,
    message: 'BLOCK CITY TYCOON is not responding.', detail: 'You can wait, or restart the game — the next start offers to recover your city.' }).then(function (r) {
    if (r.response === 1 && win) { rendererCrashed = true; closeHandlerReady = false; log.warn('Player restarted the frozen renderer'); win.webContents.forcefullyCrashRenderer(); win.reload(); }
  });
}
function cleanQuit() {
  quitting = true;
  sessionLock.close();
  log.info('Exit (clean)');
  app.quit();
}
app.on('window-all-closed', function () {
  if (sessionLock && quitting) sessionLock.close();
  app.quit();
});

/* --- Security: no permissions, no remote content --- */
function hardenSession() {
  const ses = electronSession.defaultSession;
  ses.setPermissionRequestHandler(function (wc, perm, cb) { cb(perm === 'fullscreen'); });
  ses.setPermissionCheckHandler(function (wc, perm) { return perm === 'fullscreen'; });
  ses.webRequest.onBeforeRequest(function (details, cb) {
    const u = details.url;
    const local = u.startsWith('file://') || u.startsWith('devtools://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('chrome-extension://');
    if (!local) log.warn('Blocked request: ' + u);
    cb({ cancel: !local });
  });
}

/* --- IPC (only accepted from our own page) --- */
function trusted(e) {
  const f = e.senderFrame;
  return !!(win && e.sender === win.webContents && f && f.url && f.url.startsWith('file://'));
}
function safeName(s, ext) {
  let n = String(s || 'file').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
  if (ext && !n.toLowerCase().endsWith('.' + ext)) n += '.' + ext;
  return n;
}
function picturesDir() { const d = path.join(app.getPath('pictures'), PRODUCT); fs.mkdirSync(d, { recursive: true }); return d; }
function uniquePath(dir, name) {
  let p = path.join(dir, name); const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 2; fs.existsSync(p) && i < 1000; i++) p = path.join(dir, base + ' (' + i + ')' + ext);
  return p;
}
function writeFileAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function parseRes(r) { const m = /^(\d{3,4})x(\d{3,4})$/.exec(r || ''); return m ? [+m[1], +m[2]] : [1280, 720]; }
const MAX_FILE = 64 * 1024 * 1024;

function registerIpc() {
  /* storage (synchronous: the game's save code is synchronous) */
  ipcMain.on('store:loadAll', function (e) { e.returnValue = trusted(e) ? storage.loadAll() : {}; });
  ipcMain.on('store:write', function (e, key, value) { e.returnValue = trusted(e) ? storage.write(String(key), value) : { ok: false, error: 'untrusted' }; });
  ipcMain.on('store:remove', function (e, key) { e.returnValue = trusted(e) ? storage.remove(String(key)) : { ok: false }; });
  ipcMain.on('app:info', function (e) {
    e.returnValue = { version: app.getVersion(), dev: DEV, portable: !!process.env.PORTABLE_EXECUTABLE_DIR, platform: process.platform };
  });
  ipcMain.on('session:info', function (e) {
    e.returnValue = { previousCrashed: sessionLock.previousCrashed || rendererCrashed };
  });
  ipcMain.on('log:write', function (e, level, msg) {
    if (!trusted(e)) return;
    const l = ['info', 'warning', 'error', 'debug'].indexOf(level) >= 0 ? level : 'info';
    log.write(l, '[game] ' + String(msg).slice(0, 4000));
  });
  ipcMain.on('app:close-handler-ready', function (e) { if (trusted(e)) closeHandlerReady = true; });
  ipcMain.on('app:close-ack', function (e) { if (trusted(e)) closeAck = true; });

  /* native Windows dialogs */
  ipcMain.handle('files:saveText', async function (e, o) {
    if (!trusted(e)) return { ok: false, error: 'untrusted' };
    const text = String(o && o.text || '');
    if (text.length > MAX_FILE) return { ok: false, error: 'file too large' };
    const ext = (o.filters && o.filters[0] && o.filters[0].extensions && o.filters[0].extensions[0]) || 'json';
    const r = await dialog.showSaveDialog(win, { title: 'Export city', defaultPath: path.join(app.getPath('documents'), safeName(o.defaultName, ext)), filters: o.filters });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try { writeFileAtomic(r.filePath, text); log.info('Exported file ' + r.filePath); return { ok: true, path: r.filePath }; }
    catch (err) { log.error('Export failed: ' + err.message); return { ok: false, error: err.message }; }
  });
  ipcMain.handle('files:openText', async function (e, o) {
    if (!trusted(e)) return { ok: false, error: 'untrusted' };
    const r = await dialog.showOpenDialog(win, { title: 'Import city', properties: ['openFile'], filters: o && o.filters, defaultPath: app.getPath('documents') });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    const f = r.filePaths[0];
    try {
      const st = fs.statSync(f); if (st.size > MAX_FILE) return { ok: false, error: 'file too large' };
      log.info('Imported file ' + f);
      return { ok: true, text: fs.readFileSync(f, 'utf8'), name: path.basename(f), path: f };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('files:selectFolder', async function (e, o) {
    if (!trusted(e)) return { ok: false, error: 'untrusted' };
    const r = await dialog.showOpenDialog(win, { title: (o && o.title) || 'Select folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled || !r.filePaths.length ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] };
  });
  ipcMain.handle('files:savePicture', async function (e, o) {
    if (!trusted(e)) return { ok: false, error: 'untrusted' };
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(o && o.dataUrl || ''));
    if (!m) return { ok: false, error: 'not a PNG image' };
    try { const p = uniquePath(picturesDir(), safeName(o.name, 'png')); writeFileAtomic(p, Buffer.from(m[1], 'base64')); log.info('Picture saved ' + p); return { ok: true, path: p }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  /* window */
  ipcMain.handle('window:screenshot', async function (e, o) {
    if (!trusted(e)) return { ok: false, error: 'untrusted' };
    try {
      const img = await win.webContents.capturePage();
      const p = uniquePath(picturesDir(), safeName(o && o.name || 'screenshot', 'png'));
      writeFileAtomic(p, img.toPNG());
      log.info('Screenshot ' + p);
      return { ok: true, path: p };
    } catch (err) { log.error('Screenshot failed: ' + err.message); return { ok: false, error: err.message }; }
  });
  ipcMain.handle('window:toggleFullscreen', function (e) {
    if (!trusted(e)) return { ok: false };
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return { ok: true, fullscreen: next };
  });
  ipcMain.handle('window:apply', function (e, o) {
    if (!trusted(e)) return { ok: false };
    const borderless = !!(o && o.borderless);
    const restartRequired = borderless !== createdBorderless;
    if (!createdBorderless && !borderless) {
      const fsOn = !!(o && o.fullscreen);
      if (win.isFullScreen() !== fsOn) win.setFullScreen(fsOn);
      if (!fsOn) {
        const wa = screen.getDisplayMatching(win.getBounds()).workAreaSize, r = parseRes(o && o.resolution);
        if (win.isMaximized()) win.unmaximize();
        win.setContentSize(Math.max(MIN_W, Math.min(r[0], wa.width)), Math.max(MIN_H, Math.min(r[1], wa.height)));
        win.center();
      }
    }
    return { ok: true, restartRequired: restartRequired, fullscreen: win.isFullScreen() };
  });

  /* app */
  ipcMain.handle('app:openFolder', async function (e, kind) {
    if (!trusted(e)) return { ok: false };
    const dir = kind === 'screenshots' ? picturesDir() : kind === 'logs' ? log.dir : storage.savesDir;
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return { ok: !err, error: err || undefined, path: dir };
  });
  ipcMain.on('app:quit', function (e) { if (trusted(e)) cleanQuit(); });
  ipcMain.on('app:relaunch', function (e) {
    if (!trusted(e)) return;
    quitting = true; sessionLock.close(); log.info('Relaunch');
    app.relaunch(); app.exit(0);
  });

  /* updates (offline-safe) */
  ipcMain.handle('updates:check', function (e) { return trusted(e) ? updater.check() : { status: 'error' }; });
  ipcMain.handle('updates:download', function (e) {
    if (!trusted(e)) return { ok: false };
    return updater.download(function (p) { if (win) win.webContents.send('updates:progress', p); });
  });
  ipcMain.handle('updates:install', function (e) {
    if (!trusted(e)) return { ok: false };
    return updater.install(function () { quitting = true; sessionLock.close(); });
  });
}
