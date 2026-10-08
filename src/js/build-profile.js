'use strict';
/* Build profile — RELEASE by default (admin hidden behind authentication, debug off, production UI).
   scripts/build.js overwrites this file while packaging (--profile=development|test|release) and restores it afterwards;
   npm run dev switches a local checkout to DEVELOPMENT. */
window.BCT_BUILD = { "profile": "release", "target": "source", "version": "", "builtAt": "" };
