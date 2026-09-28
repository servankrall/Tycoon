'use strict';
/* Crash detection: session.lock exists while the game runs and is removed on a clean exit.
   If it is still there at the next start, the previous session ended unexpectedly (crash, power loss, killed process). */
const fs = require('fs');
const path = require('path');

function createSession(root, log) {
  const file = path.join(root, 'session.lock');
  let previous = null;
  try { if (fs.existsSync(file)) previous = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch (e) { previous = { unreadable: true }; }
  const previousCrashed = !!previous;
  if (previousCrashed) log.warn('Previous session did not exit cleanly (started ' + (previous.started || 'unknown') + ', pid ' + (previous.pid || '?') + ')');
  function open(version) {
    try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), version: version })); } catch (e) { log.warn('session.lock: ' + e.message); }
  }
  function close() { try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { log.warn('session.lock not removed: ' + e.message); } }
  return { previousCrashed: previousCrashed, previous: previous, open: open, close: close };
}

module.exports = { createSession: createSession };
