# BLOCK CITY TYCOON — Architecture

The game is one vanilla-JavaScript engine (classic scripts, no bundler) that runs unchanged in the browser, the Windows EXE (Electron) and the Android APK (WebView). `src/js/boot/loader.js` loads the scripts in a fixed order; later modules extend earlier ones by wrapping global functions (`window.fn = wrapper`, guarded by a `__pXX` flag so a wrapper is never applied twice) and by appending fixed-timestep systems to `Game.simSystems`.

```
boot/loader.js → config / data → world → simulation (econTick …) → citizens → traffic → services (Part 10)
  → transport / finance (Part 11) → admin-auth → mobile UI → Visual Engine 2.0 (Part 15)
  → Economy Engine 2.0 (Part 17: economy2.js, economy2-ui.js)
  → Government Engine 2.0 (Part 18: gov-core.js, gov-services.js, gov-policy.js, gov-ui.js)
  → main.js → platform-ui.js → selftest.js
```

Rules every module follows:

- **Simulation and UI are separate.** Simulation runs in fixed steps (`Game.step`); panels only read cached state and re-render when a tick marks them dirty, never every frame.
- **Determinism.** Random choices use the city's saved, seeded `RNG` stream (`RNG.next()`); no module adds its own random source.
- **Fault isolation.** A failing subsystem is caught and logged, and the rest of the game keeps running.
- **Saves.** Each part owns one top-level save key with a `new…()` default and a `sanitize…()` that turns missing or corrupt data into safe defaults.

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
