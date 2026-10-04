'use strict';
/* BLOCK CITY TYCOON — preload (contextIsolation: true, nodeIntegration: false, sandbox: true).
   Exposes a small, fixed API as window.bct; the page never gets Node.js or Electron objects. */
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info') || {};
const sessionInfo = ipcRenderer.sendSync('session:info') || {};
const str = function (v) { return String(v === undefined || v === null ? '' : v); };

contextBridge.exposeInMainWorld('bct', {
  isDesktop: true,
  version: str(info.version),
  dev: !!info.dev,
  portable: !!info.portable,
  session: { previousCrashed: !!sessionInfo.previousCrashed },
  store: {
    loadAll: function () { return ipcRenderer.sendSync('store:loadAll'); },
    write: function (key, value) { return ipcRenderer.sendSync('store:write', str(key), str(value)); },
    remove: function (key) { return ipcRenderer.sendSync('store:remove', str(key)); }
  },
  log: function (level, msg) { ipcRenderer.send('log:write', str(level), str(msg)); },
  adminLog: function (line) { ipcRenderer.send('log:admin', str(line)); },
  files: {
    saveText: function (o) { return ipcRenderer.invoke('files:saveText', { defaultName: str(o && o.defaultName), text: str(o && o.text), filters: (o && o.filters) || [] }); },
    openText: function (o) { return ipcRenderer.invoke('files:openText', { filters: (o && o.filters) || [] }); },
    selectFolder: function (o) { return ipcRenderer.invoke('files:selectFolder', { title: str(o && o.title) }); },
    savePicture: function (o) { return ipcRenderer.invoke('files:savePicture', { name: str(o && o.name), dataUrl: str(o && o.dataUrl) }); }
  },
  window: {
    screenshot: function (o) { return ipcRenderer.invoke('window:screenshot', { name: str(o && o.name) }); },
    toggleFullscreen: function () { return ipcRenderer.invoke('window:toggleFullscreen'); },
    apply: function (o) { return ipcRenderer.invoke('window:apply', { resolution: str(o && o.resolution), fullscreen: !!(o && o.fullscreen), borderless: !!(o && o.borderless) }); }
  },
  app: {
    quit: function () { ipcRenderer.send('app:quit'); },
    relaunch: function () { ipcRenderer.send('app:relaunch'); },
    openFolder: function (kind) { return ipcRenderer.invoke('app:openFolder', str(kind)); }
  },
  updates: {
    check: function () { return ipcRenderer.invoke('updates:check'); },
    download: function () { return ipcRenderer.invoke('updates:download'); },
    install: function () { return ipcRenderer.invoke('updates:install'); },
    onProgress: function (cb) { ipcRenderer.on('updates:progress', function (e, p) { cb(Number(p) || 0); }); }
  },
  /* X button / Alt+F4: the game autosaves and asks EXIT / CANCEL */
  onCloseRequest: function (cb) {
    ipcRenderer.on('app:close-request', function () { ipcRenderer.send('app:close-ack'); cb(); });
    ipcRenderer.send('app:close-handler-ready');
  }
});
