# Changelog

Full release notes (Turkish) for every version: [.github/RELEASE_NOTES.md](.github/RELEASE_NOTES.md).

## 2.7.0 — Part 19: Advanced Transportation & Mobility 3.0 + Admin World Builder 2.0
- TransportationEngine 3.0 (`transport-engine.js`, `transport-ai.js`, `transport-ui.js`), built on the existing TrafficEngine:
  - Metro (station capacity, passengers, waiting, coverage, revenue, maintenance), Bus (depot, schedules), Train (cargo trains with freight revenue), Airport (Small → Regional → International → Mega), Port (Small → Cargo → Passenger → Industrial → Mega), Bike, Pedestrian, Parking;
  - line editor (create, add / remove / move / reorder stops, colour, frequency, train count; the player's order is kept);
  - Traffic AI 3.0: light modes Fixed / Adaptive / Smart / Emergency Priority, transit priority, congestion prediction, dynamic routing (at most 15 % of cars switch per 10 s, only for a ≥ 15 % gain), emergency pre-emption 16 tiles ahead;
  - City Transport Generator (14 steps, Smart Metro, Smart Bus) with tiers by city size; Transport Validator + Auto Fix.
- TRANSPORTATION panel (10 tabs, 14 dashboard numbers), 10 transport heatmaps, economy integration (commute → labour, coverage → logistics, freight revenue, station rent bonus).
- New buildings: Metro / Bus / Train Depot, Airstrip, Regional Airport, Small Port, Bike Parking, Parking Lot.
- Admin World Builder 2.0, built into the World Engine:
  - pipeline: seed validation → … → transportation → environment / traffic balance → service coverage → validator → auto fix (≤ 5 passes) → balance → performance → final validator; every stage result is recorded;
  - a world that is still broken after repair fails with WORLD GENERATION FAILED, and the previous city is restored;
  - World Quality Score (10 categories, 5 bands); Clean World Balancer, industrial buffer and water protection;
  - 20 presets, 8 quality profiles (Custom within safe limits), the 16-test generation suite, golden rules, WORLD HEALTH REPORT;
  - CREATE OPTIMIZED WORLD (PLAY only after WORLD READY).
- 175 admin tools in 13 categories, with search, favorites, Ctrl+K (admins only) and Ctrl+Z / Ctrl+Y undo / redo. All of them are behind the admin guard.
- Save 3.2: `transportation`, `worldbuilder`, `adminTools` blocks; v2.6.0 saves load with defaults; Windows ↔ Android.
- Fixes found while testing:
  - access roads no longer end on a building's corner tile (a corner is not an entrance);
  - world-generation caches are reset between worlds;
  - large and mega cities keep room under the 16-line limit for metro and rail.
  - a loaded or newly started city now begins from the boot-time simulation values (`SIM`), so the same save always simulates identically, whatever ran before it;
  - per-tile traffic grids (congestion, prediction, one-way) are dropped when a map of another size is created. Before this fix, a stale grid made routes and environment values NaN in the next world.
- Tests:
  - desktop self-test step 56 and Android self-test step 33;
  - QA groups `worldgen` (5), `transport` (4), `stress19` (5);
  - World Builder admin security check.

## 2.6.0 — Part 18: Advanced Government, Public Services & City Governance 2.0
- Government Engine 2.0 (`gov-core.js`, `gov-services.js`, `gov-policy.js`, `gov-ui.js`):
  - budget with 11 income / 15 expense categories, city loans, interest and an emergency reserve;
  - 5 taxes with non-linear effects;
  - 10 public services, plus healthcare / education / police / fire detail;
  - 9 maintenance networks that really fail;
  - district statistics;
  - Citizen Satisfaction 2.0 and City Approval;
  - 12 policies, 12 government projects (built through the construction pipeline) and 12 government events.
- CITY MANAGEMENT panel with 13 tabs (Windows: City → Economy or **K**; Android: **🏛️ MANAGE** in the bottom toolbar).
- Also new: daily CITY GOVERNMENT REPORT, Smart Government Advisor, 10 government heatmaps, Government Service Map.
- New buildings: Large Hospital, Research Hospital, Fire Headquarters, Police Headquarters, Water Treatment Plant, Central Park.
- Save 3.1: `government` block; v2.5.0 saves load with safe defaults; corrupt data is sanitized.
- Admin: government inspector and `government.*` console commands (guarded).
- Tests:
  - desktop self-test step 55 and Android self-test step 32;
  - QA government group (16 scenarios + determinism, migration, UI);
  - government admin security check;
  - mobile toolbar check for 8 buttons.

## 2.5.0 — Part 17: Advanced Economy, Companies & Global Market 2.0
## 2.4.1 — Part 16: QA hardening
## 2.4.0 — Part 15: Visual Engine 2.0
