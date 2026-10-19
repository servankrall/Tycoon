# BLOCK CITY TYCOON — Architecture

The game is one vanilla-JavaScript engine (classic scripts, no bundler) that runs unchanged in the browser, the Windows EXE (Electron) and the Android APK (WebView). `src/js/boot/loader.js` loads the scripts in a fixed order; later modules extend earlier ones by wrapping global functions (`window.fn = wrapper`, guarded by a `__pXX` flag so a wrapper is never applied twice) and by appending fixed-timestep systems to `Game.simSystems`.

```
boot/loader.js → config / data → world → simulation (econTick …) → citizens → traffic → services (Part 10)
  → transport / finance (Part 11) → admin-auth → mobile UI → Visual Engine 2.0 (Part 15)
  → Economy Engine 2.0 (Part 17: economy2.js, economy2-ui.js)
  → Government Engine 2.0 (Part 18: gov-core.js, gov-services.js, gov-policy.js, gov-ui.js)
  → TransportationEngine 3.0 (Part 19: transport-engine.js, transport-ai.js, transport-ui.js)
  → World Builder 2.0 + admin tools (Part 19: worldbuilder.js, admin-tools.js, worldbuilder-ui.js)
  → main.js → platform-ui.js → selftest.js
```

Rules every module follows:

- **Simulation and UI are separate.** Simulation runs in fixed steps (`Game.step`); panels only read cached state and re-render when a tick marks them dirty, never every frame.
- **Determinism.** Random choices use the city's saved, seeded `RNG` stream (`RNG.next()`); no module adds its own random source.
- **Fault isolation.** A failing subsystem is caught and logged, and the rest of the game keeps running.
- **Saves.** Each part owns one top-level save key with a `new…()` default and a `sanitize…()` that turns missing or corrupt data into safe defaults.

## TransportationEngine 3.0 (Part 19)

TransportationEngine 3.0 extends the existing traffic and transit code (`traffic2.js` lines and agents, `transport3.js` metro / regional rail, `TRANSIT`, `JX` junctions, `roadPath` A*). It does not run a second traffic simulation.

| File | Systems |
|---|---|
| `transport-engine.js` | state (`newTransportation`, `sanitizeTransportation`); new buildings (metro / bus / train depot, airstrip, regional airport, small port, bike parking, parking lot); **Metro**, **Bus**, **Train** (cargo freight revenue), **Airport** (Small → Regional → International → Mega), **Port** (Small → Cargo → Passenger → Industrial → Mega), **Bike**, **Pedestrian**, **Parking**; the line editor; dashboard stats; economy hooks |
| `transport-ai.js` | **TrafficAI** / **IntersectionAI** (light modes Fixed · Adaptive · Smart · Emergency, transit priority), congestion prediction, **Routing** (dynamic reroute with a diversion cap), **EmergencyPriority** (16-tile pre-emption), **City Transport Generator** (14 steps), **Transport Validator** + **Auto Fix** |
| `transport-ui.js` | TRANSPORTATION panel (10 tabs), 8 new heatmaps (10 with TRAFFIC, WALKABILITY and PUBLIC TRANSPORT), search / palette entries, F3 lines, the Transit tab button, the mobile button |

Scheduling: `Transportation3` runs `tpHour` (freight revenue, crosswalks) every game hour and `tpDay` (history) every game day. `TrafficAI3` runs prediction once per game minute; rerouting checks at most 12 vehicles per tick and diverts at most 15 % of the cars in any 10 s window, and only for a predicted gain of at least 15 %. `tpStats()` is cached for 2 s.

Economy: `partTpMods(m)` wraps `globalMods()`. Commute time feeds `labor`, transit coverage feeds `logistics`, cargo trains add freight revenue, and stations raise `rentMult()` nearby (capped). Lines, depots and stations are paid through the existing transit and building upkeep.

```js
tp()                                   // S.transportation (created with defaults if missing)
tpStats(force)                         // 14 dashboard numbers + metro / bus / rail / airport / port / bike / walk / parking detail
tpLineCreate(mode, stopIds, name)      // {ok, L | reason} — keeps the player's stop order
tpLineEdit(id, op, a, b)               // op: add | remove | move | order | color | trains | frequency | schedule | rename
tpSetLightMode(tile | 'all', mode)     // fixed | adaptive | smart | emergency | auto
tpSetPtPriority(tile, on)              // transit priority at one junction
tpSetOneWay(tile, dir)                 // admin: one-way road tile (roadPath honours MAP.oneway)
tpGenerateTransport({only, tier})      // City Transport Generator → {ok, tier, steps, built, list, ms}
tp3Validate() / tp3AutoFix()           // {ok, issues[{id, what, ref}], counts} · {actions, validation, before}
tpTier()                               // small | medium | large | mega (map size or population)
openTransport(tab)                     // the TRANSPORTATION panel
```

Service by city size (`tpTier`): Small → bus, bike, walking. Medium → bus plus metro candidates. Large → bus, metro and train. Mega → bus, metro, rail, airport and port links, bike and walking. When the 16-line limit is full, a large or mega city drops its weakest bus lines (automatic lines first) to make room for metro and rail (`tpMakeRoom`).

## World Builder 2.0 (Part 19)

`worldbuilder.js` adds its stages to the existing World Engine (`generateWorld` in `worldgen.js`, both `WG_STAGES` and the 32-step `MEGA_STAGES`). It does not use a separate generator:

```
Seed validation (wb_seed) → terrain … zoning … utilities (World Engine) → Transportation (wb_transport)
  → Environment balance (wb_env) → Traffic balance → Service coverage → World validator → Auto fix (≤ 5 passes)
  → Balance pass → Performance pass → Final validator (wb_final) → start → PLAYABLE WORLD
```

Each stage's result is recorded in `S.worldbuilder.pipeline`. If the final validator still reports a golden-rule failure or quality < 60 after five repair passes in total, `wb_final` throws. `generateWorld` then restores the previous city and shows **WORLD GENERATION FAILED**, so a broken world is never delivered.

- **Profiles** (`WB_PROFILES`): Balanced, Eco, Dense, Industrial, Tourism, Technology, Mega City, Custom. Each one sets pollution / air / water / noise / waste / industry limits. Custom sliders are clamped to `WB_HARD`.
- **Clean World Balancer** (`wbBalanceEnvironment`). It runs these steps in order:
  1. Polluters move away from homes (Industrial → green → road → residential buffer, `WB_BUFFER`).
  2. Heavy industry, waste, oil and sewage move away from water (`WB_WATER`).
  3. A coal plant that can't move becomes a wind farm; a waste facility that can't move is closed and rebuilt on a protected site; heavy industry with no site becomes a workshop.
  4. Green buffers are planted and waste capacity is checked.
  5. Up to 10 pollution passes run, then the industrial density limit is applied.
  While the builder runs, `wgCanPlace` refuses sites that would break the buffer or water rules (`WBLD.enforce`).
- **Validator** (`wbValidate`): 16 tests (terrain, water, roads, districts, buildings, power, water network, sewage, population, economy, pollution, traffic, transportation, emergency, performance, save) and 13 golden rules (`WB_GOLDEN`). `wbQuality(v)` gives 10 category scores, an overall 0–100 score and a band: Excellent ≥ 95, Very Good 85–94, Good 75–84, Needs Optimization 60–74, Invalid < 60.
- **Repair** (`wbRepairPass`): road connectors and access roads, utilities, world / economy fix (tax step, then a starting reserve), coverage, environment balance, transport auto fix, traffic fix, agent trim.
- **CREATE OPTIMIZED WORLD** (`wbCreateOptimizedWorld`): the world opens paused; PLAY only appears once the report says WORLD READY.

`admin-tools.js` holds 175 admin tools (`AT_TOOLS`) in 13 categories. `adminTool(id, value)` runs one tool behind `AdminAuth.guard` (guard id `tool:<id>`). Before a change it takes an undo snapshot (`buildSaveObject`, at most 10): `atUndo()` / `atRedo()`, **Ctrl+Z / Ctrl+Y** in the admin panel. Favorites and search (`atSearch`) are available, and the Ctrl+K palette lists admin tools only for a signed-in admin. `worldbuilder-ui.js` adds the **WORLD BUILDER 2.0** and **ADMIN TOOLS** tabs to the Admin Center's WORLD group. Commands: [ADMIN_COMMANDS.md](ADMIN_COMMANDS.md).

## Government Engine 2.0 (Part 18)

| File | Systems |
|---|---|
| `gov-core.js` | state (`newGov`, `sanitizeGov`), **BudgetSystem**, **TaxSystem**, economy modifiers (`partGovMods`), maintenance funding sync, scheduler (`govTick`) |
| `gov-services.js` | **PublicServiceSystem** (+ Healthcare, Education, Police, FireDepartment, UtilityService, TransportService), **MaintenanceSystem**, district statistics, **CitizenSatisfaction**, **CityApproval**, citizen comments |
| `gov-policy.js` | **PolicySystem** (12 policies), **ProjectSystem** (12 projects), government events (12) through the decision / news engine |
| `gov-ui.js` | CITY MANAGEMENT panel (13 tabs), **GovernmentReportSystem**, Smart Government Advisor, 10 heatmaps, search / palette, F3 lines, admin inspector and console commands |

### Scheduling

`govTick()` is registered as the `Government` system in `Game.simSystems` (1 sim second; the work itself is keyed to the game clock):

| Every game hour | Every game day |
|---|---|
| taxes sync → maintenance funding sync → budget accumulation (+ emergency reserve) → services → maintenance → districts → satisfaction / approval → policies (daily cost, expiry) → projects (progress, completion) | debt payments + interest, reserve deposit, deficit check → government events → CITY GOVERNMENT REPORT → approval history |

Each step runs inside `govSafe(name, fn)`. Errors are counted in `GOV.errors`, the last one is kept in `GOV.lastErr`, and the game goes on. Coverage grids are cached per `MAP.version`, heatmaps per game hour plus map version, and project sites per map version plus hour. Loading another city resets the runtime caches.

### Economy integration (no parallel economy)

`partGovMods(m)` wraps `globalMods()`. The government only sets modifiers that the existing economy (`econTick`, EconomyEngine 2.0) already reads:

| Government | Modifier → effect |
|---|---|
| commercial / industrial tax | `bizTaxCom`, `bizTaxInd` → business tax by category (econTick) |
| corporate tax | `corpTax` → % of each company's positive profit |
| property tax | `propTax` → EconomyEngine 2.0 property tax |
| tax pressure (non-linear) | `hap −= (p/100)^1.4 · 9`, `growth ×= 1 − (p/100)^1.6 · 0.25`, `commRev`, `production`, `rev` above 18 % |
| healthcare quality | `labor` (workforce) |
| education quality | `rev` (productivity); funding → `p10EduTarget` |
| roads / transport | `logistics`, `logiCost`, `transit` |
| police | `crimeAdj` |
| maintenance average | `growth` (company / city growth); failed roads → `roadCap`, failed water → `waterProd` |
| service funding | `govFund(d)` scales salaries + maintenance of city buildings of that service |
| government spending | added to `cityGDP()` (G in C + I + G) |
| district services | `rentMult()` × 0.9–1.12 (property value, capped for affordability) |
| policies / events | their own modifiers (`govPolicyMods`, `govEventMods`) |

### API

```js
// state
gov()                       // S.government (created with defaults if missing)
newGov() / sanitizeGov(obj) // defaults · old / corrupt save → safe values
// budget & taxes
govBudgetSummary()          // {income, expenses, balance, debt, interest, reserve, month, year, budget, deficit, deficitDays}
govIncomeNow() / govExpenseNow()   // current $/s by category
govBorrow(amount) / govRepay(id)   // {ok, msg | reason}
govTaxes()                  // {residential, commercial, industrial, corporate, property}
govSetTax(kind, value)      // clamped (0–30, property 0–20)
govTaxPressure([taxes])     // 0–100
// services, maintenance, districts, approval
S.government.services[id]   // {capacity, used, coverage, quality, budget, workers, staff, maint, funding, sat, …}
govResponse(kind, x, y)     // minutes for 'police' | 'fire' | 'health'
govFireRate(b)              // fire put-out multiplier used by events.js
govDistrictAt(x, y) / govCrimeRisk(district)
S.government.maint[net]     // {v, level: Excellent|Good|Warning|Critical|Failed}
S.government.approval       // {value, label, hist}
govApprovalLabel(v) / govMaintLabel(v)
// policies, projects, events
govPolicyEnable(id) / govPolicyDisable(id) / govPolicyActive(id) / govPolicyCost(id)
govProjectQuote(type, prio) // {cost, days, workers, mat, maint, reason}
govProjectStart(type, prio) / govProjectSetPrio(id, prio) / govProjectCancel(id)
govEventStart(id, force) / govEventActive(id)
// report, advisor, UI
govReportDay() / govAdvice() / openGovernment(tab) / govHeatGrid(mode)
govInspect(section)         // read-only snapshot for the admin tools
```
