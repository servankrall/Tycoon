# Test report — v2.7.0 (Part 19)

All results below come from real runs in headless Chromium, on Linux, in the development sandbox. CI runs the same suites on Windows, an Android emulator and Linux for every push (`.github/workflows/release.yml`). In CI each QA group now runs as its own step.

| Suite | Result |
|---|---|
| `scripts/check.js` | all checks passed (Turkish dictionary 4152 phrases, version 2.7.0) |
| `scripts/qa-test.js` (full, Android + Windows profiles) | **143/143** |
| `scripts/qa-test.js --only=worldgen` · `transport` · `stress19` · `security` · `economy,government` (isolated, as in CI) | 10/10 · 8/8 · 10/10 · 8/8 · 60/60 |
| `scripts/mobile-ui-test.js` | **306/306** on 9 screen sizes |
| Desktop self-test (`?selftest=1`, 1366×768) | 49/56 · **step 56 Transportation 3.0 / World Builder 2.0 / Admin Tools passes** |
| Android self-test (`?platform=android`) | 31/33 · **step 33 passes** |

The self-test failures are not caused by this release; they failed in the same way in v2.6.0:

- desktop steps 41–44 and Android steps 13–14 need admin test credentials, which do not exist in this sandbox;
- desktop steps 30, 31 and 35 fail on the generated test city in this environment.

## Part 19 QA scenarios

- **worldgen:**
  - 20 presets (quality 96–100, all WORLD READY);
  - pipeline stages recorded, clean-world limits, industrial buffer and water protection (0 violations);
  - broken world repaired (73 % → 99 %), or never delivered (WORLD GENERATION FAILED, previous city restored);
  - deterministic regeneration;
  - transport tiers: Small bus · Medium bus + metro candidates · Large metro + train + bus · Mega metro + train + bus.
- **transport:** dashboard (14 numbers), all transport modes and their stations, line editor, 10 tabs and 10 heatmaps, Traffic AI (light modes, transit priority, prediction, diversion cap), validator + auto fix, Save 3.2 / v2.6.0 / Windows ↔ Android.
- **stress19 (A–Q):**
  - 100K, 250K and 500K citizens;
  - 50K+ vehicles (statistical);
  - mega metro network, regional airport and cargo port;
  - extreme traffic, rain, snow, emergency under congestion, outage;
  - recession with a low budget;
  - regeneration, and save / restart / load with Windows ↔ Android (in the transport group).

## Fixed during Part 19 testing

- **Back-to-back worlds failed:**
  - access roads could end on a building's corner tile, which is not an entrance (a port stayed unreachable);
  - the economy reserve was sized before other repairs changed the running cost;
  - metro and rail could not get a line once 16 bus lines existed;
  - dense cities had no lot for a train station.
- **Water protection:** the shore rule now covers waste, oil and untreated sewage. Sewage treatment plants are exempt, because they clean the water.
- **Loading a save gave a slightly different first simulation tick** depending on what ran before. `SIM` derived values now start from the boot snapshot (`resetSim`).
- **Stale traffic grid:** a congestion grid from a map of another size made A* costs, noise and water quality NaN in the next world. Map initialisation now drops these grids, and the readers guard against a size mismatch.

## Government QA scenarios (`qa-test.js`, group `government`)

1. Small city — 10 services, 11 income / 15 expense categories, districts, 9 graded networks, approval label, 0 errors.
2. Deterministic from the same state — identical within 1e-5. The city budget already carries about 1e-8 float noise without the government (render-sampled traffic), and the reserve sums it over days.
3. 100K citizens — hourly pass ≈ 11 ms at most, daily < 1 ms.
4. 500K citizens — hourly ≈ 1–2 ms, daily ≈ 3 ms, hospital load 394 %.
5. High taxes — pressure 100, happiness −9, growth ×0.51. The effect is non-linear: commercial tax 14 → 22 % costs 0.79 happiness, 22 → 30 % costs 1.30. A Tax Protest starts and the advisor warns.
6. Low taxes — pressure 0, growth ×1.04, tax revenue falls to 0.
7. Budget deficit — 4 deficit days, BUDGET DEFICIT warning, Budget Crisis event, advisor. A huge loan is refused; a small loan is granted at 6.5 %.
8. Hospital capacity — load 141 %, waiting time 15 → 94 min, Hospital Overload event, advisor message.
9. School shortage — coverage 100 % → 29 %, School Shortage event.
10. Police coverage — police funding 0 % vs 150 %: response 1.8 → 2.2 min, quality 100 → 55, crime modifier −7.0 → −3.2.
11. Bad fire access — broken roads + congestion + snow: response 2.3 → 12.2 min, fires go out at ×0.74 speed.
12. Zero maintenance budget — power, water and sewage drop to Failed; the road maintenance network goes to 0; 3 advisor messages.
13. Large infrastructure failure — roads Failed, a real power failure through the utility system, an Infrastructure Failure event, and emergency repairs restore the roads.
14. 100× speed — 6 s real time, hourly pass ≈ 1.2 ms, 0 errors.
15. Save → restart → load — schema 3.1; taxes, funding, loans, policies, projects, approval and reports are identical after an app restart.
16. Windows → Android and Android → Windows saves — the government block is identical.

Also tested:

- **Old and corrupt saves:** a v2.5.0 save loads with defaults; a corrupt government block is sanitized.
- **City Management UI:** all 13 tabs render inside the screen, 10/10 heatmaps have data, and the Management button opens the panel on Android.
- **Security:** a normal player cannot use the government admin tools or `government.*` commands.

Performance: on a LARGE city (45K pop, 1,012 buildings) the government adds about 1–2 % to simulation time (3.3 ms per game hour).

## Fixed during testing

- The Part 17 tax slider's business rate was overwritten by the government's commercial / industrial average. The QA economy test caught it; the wrapper order is fixed.
- Project quotes rounded short builds to "0 days"; they now show game hours.
- Big projects could not find a building site in a packed city; they now fall back to the smaller variant (e.g. Fire HQ → Fire Station) and say so when no lot exists.
- "Emergency reserve is dangerously low" appeared while the city budget was large; it now needs both the reserve and the budget to be low.
