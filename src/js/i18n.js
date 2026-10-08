'use strict';
/* BLOCK CITY TYCOON — LANGUAGES: English (source) + Türkçe
   The game code stays in English; this layer translates what the player sees, everywhere (menus, HUD, panels, dialogs,
   toasts, settings, hub, admin panel, canvas labels) on Windows, Android and in the browser:
   - exact phrases from the dictionary (js/i18n-tr.js)
   - templates: numbers become {n} and building names {b} ("Hospital construction finished." → "{b} construction finished.")
   - mixed text is split at " · ", " — ", " | " and ": " and every part is translated on its own
   - a MutationObserver translates new UI before it is painted; canvas text goes through the same lookup
   Proper names (cities, companies, districts, streets) stay as they are. Settings → SYSTEM → Language switches live. */

const I18N = { lang: 'en', dict: null, cache: new Map(), orig: new WeakMap(), out: new WeakMap(), bre: null, nre: null, nreSig: '', observer: null, count: 0 };
const I18N_NUM = /[-+±]?\$?\d[\d,]*(?:\.\d+)?[KMBT%×x]?(?![A-Za-zÇĞİÖŞÜçğıöşü])/g;
const I18N_SPLIT = /(\s+[·|—]\s+|:\s+|\s+→\s+|\s+(?=“))/;
const I18N_EDGE = /^([^A-Za-z(\"'$\d{]*)([\s\S]*?)([^A-Za-z)\"'%\d}.!?]*)$/;
function i18nOn() { return I18N.lang !== 'en' && !!I18N.dict; }
function i18nBuildingRegex() {
  if (typeof BUILDINGS === 'undefined') return false;
  const n = Object.keys(BUILDINGS).length;                     // later parts add buildings while loading
  if (I18N.bre !== null && I18N.breN === n) return I18N.bre;
  I18N.breN = n;
  try {
    const names = Object.keys(BUILDINGS).map(function (k) { return BUILDINGS[k].name; }).filter(function (n) { return n && n.length > 2; }).sort(function (a, b) { return b.length - a.length; });
    I18N.bre = names.length ? new RegExp('(?<![A-Za-z])(' + names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![A-Za-z])', 'g') : false;
  } catch (e) { I18N.bre = false; }
  return I18N.bre;
}
/* proper names stay as they are but may sit inside a phrase: district / city names, quoted names and ALL-CAPS company names → {c} */
function i18nNameRegex() {
  let names = [];
  try {
    if (typeof MAP !== 'undefined' && MAP.dnames) names = names.concat(MAP.dnames);
    if (typeof S !== 'undefined' && S && S.city && S.city.name) names.push(S.city.name);
    names.push('North Region', 'South Region', 'East Region', 'West Region', 'Central Region');
    if (typeof WORLD_CITIES !== 'undefined') WORLD_CITIES.forEach(function (c) { names.push(c.name); });
  } catch (e) { /* no city yet */ }
  names = names.filter(function (n, i, a) { return n && n.length > 2 && a.indexOf(n) === i; }).sort(function (a, b) { return b.length - a.length; });
  const sig = names.join('|');
  if (I18N.nre && I18N.nreSig === sig) return I18N.nre;
  const alt = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  alt.push('"[^"{}]{1,60}"', "\\b[A-Z][A-Z0-9&'.]+(?:[ -][A-Z][A-Z0-9&'.]+)*\\b");
  I18N.nre = new RegExp('(?<![A-Za-z])(' + alt.join('|') + ')(?![a-z])', 'g'); I18N.nreSig = sig;
  return I18N.nre;
}
function i18nFill(tpl, nums, bs, cs) {
  const at = { n: 0, b: 0, c: 0 }, src = { n: nums, b: bs, c: cs || [] };   // {n}/{b}/{c} in order, {n2}/{b1}/{c2} by position (Turkish word order differs)
  return tpl.replace(/\{([nbc])(\d?)\}/g, function (m, k, d) {
    const v = d ? src[k][+d - 1] : src[k][at[k]++];
    if (v === undefined) return m;
    return k === 'n' ? v : (I18N.dict[v] || v);
  });
}
function i18nCore(core) {
  const D = I18N.dict;
  if (D[core] !== undefined) return D[core];
  if (/[A-Z]{2}/.test(core) && core === core.toUpperCase()) {   // "WORLD CITY" → "DÜNYA ŞEHRİ" from "World City"
    if (!I18N.upper) { I18N.upper = {}; Object.keys(D).forEach(function (k) { const K = k.toUpperCase(); if (D[K] === undefined && I18N.upper[K] === undefined) I18N.upper[K] = D[k]; }); }
    if (I18N.upper[core] !== undefined) return I18N.upper[core].toLocaleUpperCase('tr-TR');
  }
  const nums = [];
  const k1 = core.replace(I18N_NUM, function (m) { nums.push(m); return '{n}'; });
  if (nums.length && D[k1] !== undefined) return i18nFill(D[k1], nums, [], []);
  const re = i18nBuildingRegex(), bs = [];
  const k2 = re ? k1.replace(re, function (m) { bs.push(m); return '{b}'; }) : k1;
  if (bs.length && D[k2] !== undefined) return i18nFill(D[k2], nums, bs, []);
  const cs = [];
  const k3 = k2.replace(i18nNameRegex(), function (m) { if (m.charAt(0) === '"') { cs.push(m.slice(1, -1)); return '"{c}"'; } cs.push(m); return '{c}'; });
  if (cs.length && D[k3] !== undefined) return i18nFill(D[k3], nums, bs, cs);
  return null;
}
function i18nPart(part, nested) {
  if (!/[A-Za-z]{2}/.test(part)) return part;
  const m = I18N_EDGE.exec(part); if (!m) return part;
  let r = i18nCore(m[2]);
  if (r !== null) return m[1] + r + m[3];
  const t = /^(.*?)([.!?…]+)$/.exec(m[2]);                     // "Done." → "Done" + "."
  if (t) { r = i18nCore(t[1]); if (r !== null) return m[1] + r + t[2] + m[3]; }
  if (!nested && /,\s/.test(part)) return part.split(/(,\s+)/).map(function (p, i) { return i % 2 ? p : i18nPart(p, true); }).join('');   // "✅Wind Power, ✅Applied Physics"
  return part;
}
/* translate one string (cached) */
function tr(text) {
  if (!i18nOn() || typeof text !== 'string' || !/[A-Za-z]{2}/.test(text)) return text;
  const c = I18N.cache.get(text); if (c !== undefined) return c;
  const lead = /^\s*/.exec(text)[0], trail = /\s*$/.exec(text)[0], body = text.trim();
  let r = i18nPart(body, true);
  if (r === body && I18N_SPLIT.test(body)) r = body.split(I18N_SPLIT).map(function (p, i) { return i % 2 ? p : i18nPart(p); }).join('');
  if (r === body) r = i18nPart(body);
  r = lead + r + trail;
  if (I18N.cache.size > 20000) I18N.cache.clear();
  I18N.cache.set(text, r);
  return r;
}
/* ---------------- DOM ---------------- */
const I18N_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CANVAS: 1, PRE: 1 };
function i18nText(node) {
  const cur = node.data;
  if (I18N.out.get(node) === cur) return;                    // already our translation
  const t = tr(cur);
  I18N.orig.set(node, cur);
  if (t !== cur) { node.data = t; I18N.count++; }
  I18N.out.set(node, t);
}
function i18nAttrs(el) {
  ['title', 'placeholder', 'aria-label'].forEach(function (a) {
    const v = el.getAttribute(a); if (!v) return;
    const key = 'data-i18n-' + a, o = el.getAttribute(key);
    if (o !== null && tr(o) === v) return;
    const t = tr(v); if (t !== v) { el.setAttribute(key, v); el.setAttribute(a, t); }
  });
}
function i18nWalk(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (root.parentNode && !I18N_SKIP[root.parentNode.nodeName] && !(root.parentNode.closest && root.parentNode.closest('.noTr'))) i18nText(root); return; }
  if (root.nodeType !== 1 || (root.classList && root.classList.contains('noTr'))) return;
  if (root.hasAttribute && (root.hasAttribute('title') || root.hasAttribute('placeholder') || root.hasAttribute('aria-label'))) i18nAttrs(root);
  if (I18N_SKIP[root.nodeName]) return;
  for (let n = root.firstChild; n; n = n.nextSibling) i18nWalk(n);
}
function i18nRevert(root) {
  if (!root) return;
  if (root.nodeType === 3) { const o = I18N.orig.get(root); if (o !== undefined && I18N.out.get(root) === root.data) root.data = o; I18N.out.delete(root); return; }
  if (root.nodeType !== 1) return;
  ['title', 'placeholder', 'aria-label'].forEach(function (a) { const o = root.getAttribute && root.getAttribute('data-i18n-' + a); if (o !== null && o !== undefined) { root.setAttribute(a, o); root.removeAttribute('data-i18n-' + a); } });
  for (let n = root.firstChild; n; n = n.nextSibling) i18nRevert(n);
}
function i18nObserve() {
  if (I18N.observer) return;
  I18N.observer = new MutationObserver(function (list) {
    if (!i18nOn()) return;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.type === 'characterData') i18nWalk(m.target);
      else if (m.type === 'attributes') { if (m.target.nodeType === 1) i18nAttrs(m.target); }
      else for (let k = 0; k < m.addedNodes.length; k++) i18nWalk(m.addedNodes[k]);
    }
  });
  I18N.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
}
/* ---------------- canvas labels ---------------- */
(function () {
  const P = CanvasRenderingContext2D.prototype, ft = P.fillText, st = P.strokeText, mt = P.measureText;
  P.fillText = function (s, x, y, w) { return w === undefined ? ft.call(this, i18nOn() ? tr(String(s)) : s, x, y) : ft.call(this, i18nOn() ? tr(String(s)) : s, x, y, w); };
  P.strokeText = function (s, x, y, w) { return w === undefined ? st.call(this, i18nOn() ? tr(String(s)) : s, x, y) : st.call(this, i18nOn() ? tr(String(s)) : s, x, y, w); };
  P.measureText = function (s) { return mt.call(this, i18nOn() ? tr(String(s)) : s); };
})();
/* ---------------- language switch ---------------- */
function setLanguage(lang) {
  lang = lang === 'tr' ? 'tr' : 'en';
  const was = I18N.lang;
  I18N.lang = lang; I18N.dict = lang === 'tr' && typeof I18N_TR !== 'undefined' ? I18N_TR : null; I18N.cache.clear(); I18N.upper = null;
  document.documentElement.lang = lang;
  if (was !== lang && was !== 'en') i18nRevert(document.body);
  if (i18nOn()) { i18nWalk(document.body); i18nObserve(); }
  try {                                                   // re-render live panels in the new language
    if (typeof STARTED !== 'undefined' && STARTED) { if (UI.panel) renderLeft(true); if (typeof renderRight === 'function' && !UI.rightCollapsed) renderRight(); refreshTopbar(); }
    if (typeof ADM !== 'undefined' && ADM.open) renderAdminCenter();
  } catch (e) { /* UI not ready */ }
  if (typeof Log !== 'undefined') Log.info('Language: ' + (lang === 'tr' ? 'Türkçe' : 'English') + (i18nOn() ? ' (' + Object.keys(I18N.dict).length + ' phrases)' : ''));
}
function i18nBoot() { setLanguage(GSET && GSET.language === 'tr' ? 'tr' : 'en'); }
try { i18nBoot(); } catch (e) { /* settings not ready: platformBoot() switches later */ }
