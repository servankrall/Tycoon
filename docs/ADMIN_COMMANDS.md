# Admin commands

Admin tools are invisible to normal players. Every action passes `AdminAuth.guard`: it needs a signed-in OWNER / ADMIN — or a DEVELOPER / DEBUG role where the category allows it (read-only government inspection: all four roles; changes: OWNER / ADMIN). Every attempt is written to the admin action log. There are no plain-text passwords in the game files.

## World Builder 2.0 and admin tools (v2.7.0)

Admin Center → **WORLD → 🧬 WORLD BUILDER 2.0**:
- 20 presets, 8 quality profiles (Custom sliders stay inside safe limits) and SMALL … MEGA sizes;
- **CREATE OPTIMIZED WORLD**: the world opens paused, and PLAY appears only after WORLD READY;
- *🔍 World Validator*, *🛠 Auto Fix (≤ 5 passes)*, *🌿 Balance World*, *🧪 Generation test suite* (16 tests), *🚇 Generate Transportation*;
- the WORLD HEALTH REPORT with the quality score, 10 categories, every test, the pipeline stages and the fixes.

These map to `wbAdmin('create' | 'analyze' | 'suite' | 'fix' | 'balance' | 'transport')`. The guard id is `wb:<action>`. `create` needs the **generate** category (OWNER); `analyze` / `suite` need **view**; the others need **city** (OWNER / ADMIN).

Admin Center → **WORLD → 🧰 ADMIN TOOLS** has 175 tools in 13 categories, with search, ★ favorites and ↶ / ↷ undo / redo (Ctrl+Z / Ctrl+Y, 10 steps, from save snapshots). The Ctrl+K palette also finds them, but only while an admin is signed in. Console: `adminTool('<id>', value)`, `atUndo()`, `atRedo()`; the guard id is `tool:<id>`. Guard categories:
- **view**: read-only tools (all four roles);
- **debug**: read-only debug tools (OWNER / ADMIN / DEVELOPER);
- **perf**: the performance / memory / FPS / entity monitors (OWNER / DEVELOPER / DEBUG);
- **city**: changes (OWNER / ADMIN);
- **generate**: world creation (OWNER);
- **delete**: destructive tools (OWNER).

Tools work on the selected building, or on the tile at the camera centre.

For a normal player every tool returns nothing and changes nothing; `scripts/qa-test.js` checks this ("World Builder admin tools are hidden and denied for a normal player").

### World (20)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 1 | Create World | `createWorld` | world creation | generate |
| 2 | Delete World | `deleteWorld` | destructive | delete |
| 3 | Clone World | `cloneWorld` | change (undoable) | city |
| 4 | Duplicate World | `duplicateWorld` | change (undoable) | city |
| 5 | Rename World | `renameWorld` | change (undoable) | city |
| 6 | Change Seed | `changeSeed` | read only | view |
| 7 | Regenerate World | `regenerateWorld` | world creation | generate |
| 8 | Regenerate Terrain | `regenTerrain` | change (undoable) | city |
| 9 | Regenerate Districts | `regenDistricts` | change (undoable) | city |
| 10 | Regenerate Roads | `regenRoads` | change (undoable) | city |
| 11 | Regenerate Buildings | `regenBuildings` | change (undoable) | city |
| 12 | Regenerate Population | `regenPopulation` | change (undoable) | city |
| 13 | Regenerate Economy | `regenEconomy` | change (undoable) | city |
| 14 | Regenerate Transportation | `regenTransport` | change (undoable) | city |
| 15 | World Validator | `worldValidator` | read only | view |
| 16 | Auto Fix World | `autoFixWorld` | change (undoable) | city |
| 17 | Balance World | `balanceWorld` | change (undoable) | city |
| 18 | Optimize World | `optimizeWorld` | change (undoable) | city |
| 19 | World Quality Score | `worldQuality` | read only | view |
| 20 | World Snapshot | `worldSnapshot` | read only | view |

### Terrain (15)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 21 | Raise Terrain | `raiseTerrain` | change (undoable) | city |
| 22 | Lower Terrain | `lowerTerrain` | change (undoable) | city |
| 23 | Flatten Terrain | `flattenTerrain` | change (undoable) | city |
| 24 | Smooth Terrain | `smoothTerrain` | change (undoable) | city |
| 25 | Create Mountain | `createMountain` | change (undoable) | city |
| 26 | Create Hill | `createHill` | change (undoable) | city |
| 27 | Create Valley | `createValley` | change (undoable) | city |
| 28 | Create River | `createRiver` | change (undoable) | city |
| 29 | Create Lake | `createLake` | change (undoable) | city |
| 30 | Create Coast | `createCoast` | change (undoable) | city |
| 31 | Create Island | `createIsland` | change (undoable) | city |
| 32 | Create Canyon | `createCanyon` | change (undoable) | city |
| 33 | Terrain Noise Control | `terrainNoise` | change (undoable) | city |
| 34 | Terrain Height Map | `terrainHeightMap` | read only | view |
| 35 | Terrain Undo | `terrainUndo` | read only | view |

### Water (10)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 36 | Create Water | `createWater` | change (undoable) | city |
| 37 | Remove Water | `removeWater` | change (undoable) | city |
| 38 | Change Water Level | `waterLevel` | change (undoable) | city |
| 39 | River Generator | `riverGen` | change (undoable) | city |
| 40 | Lake Generator | `lakeGen` | change (undoable) | city |
| 41 | Coast Generator | `coastGen` | change (undoable) | city |
| 42 | Water Quality Editor | `waterQuality` | change (undoable) | city |
| 43 | Water Pollution Editor | `waterPollution` | change (undoable) | city |
| 44 | Water Flow Debugger | `waterFlow` | read only | view |
| 45 | Flood Risk Editor | `floodRisk` | change (undoable) | city |

### Roads (15)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 46 | Road Generator | `roadGen` | change (undoable) | city |
| 47 | Highway Generator | `highwayGen` | change (undoable) | city |
| 48 | Bridge Generator | `bridgeGen` | change (undoable) | city |
| 49 | Tunnel Generator | `tunnelGen` | change (undoable) | city |
| 50 | Roundabout Generator | `roundaboutGen` | change (undoable) | city |
| 51 | Intersection Generator | `intersectionGen` | change (undoable) | city |
| 52 | Road Upgrade | `roadUpgrade` | change (undoable) | city |
| 53 | Road Repair | `roadRepair` | change (undoable) | city |
| 54 | Road Delete | `roadDelete` | change (undoable) | city |
| 55 | Lane Editor | `laneEditor` | change (undoable) | city |
| 56 | Traffic Light Editor | `lightEditor` | change (undoable) | city |
| 57 | Speed Limit Editor | `speedLimit` | change (undoable) | city |
| 58 | Road Priority Editor | `roadPriority` | change (undoable) | city |
| 59 | One-Way Editor | `oneWay` | change (undoable) | city |
| 60 | Road Validator | `roadValidator` | read only | view |

### City (15)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 61 | District Generator | `districtGen` | change (undoable) | city |
| 62 | District Rename | `districtRename` | change (undoable) | city |
| 63 | District Resize | `districtResize` | change (undoable) | city |
| 64 | Zoning Editor | `zoningEditor` | change (undoable) | city |
| 65 | Residential Zone | `zoneRes` | change (undoable) | city |
| 66 | Commercial Zone | `zoneCom` | change (undoable) | city |
| 67 | Industrial Zone | `zoneInd` | change (undoable) | city |
| 68 | Office Zone | `zoneOffice` | change (undoable) | city |
| 69 | Tourism Zone | `zoneTour` | change (undoable) | city |
| 70 | Technology Zone | `zoneTech` | change (undoable) | city |
| 71 | Park Zone | `zonePark` | change (undoable) | city |
| 72 | Government Zone | `zoneGov` | change (undoable) | city |
| 73 | Landmark Generator | `landmarkGen` | change (undoable) | city |
| 74 | City Center Generator | `cityCenter` | change (undoable) | city |
| 75 | Subcenter Generator | `subCenter` | change (undoable) | city |

### Buildings (13)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 76 | Spawn Building | `spawnBuilding` | change (undoable) | city |
| 77 | Delete Building | `deleteBuilding` | change (undoable) | city |
| 78 | Upgrade Building | `upgradeBuilding` | change (undoable) | city |
| 79 | Repair Building | `repairBuilding` | change (undoable) | city |
| 80 | Level Editor | `levelEditor` | change (undoable) | city |
| 81 | Building Density Editor | `densityEditor` | change (undoable) | city |
| 82 | Building Height Editor | `heightEditor` | change (undoable) | city |
| 83 | Mega Building Generator | `megaBuilding` | change (undoable) | city |
| 84 | Mega Mall Generator | `megaMall` | change (undoable) | city |
| 85 | Arcology Generator | `arcology` | change (undoable) | city |
| 86 | Landmark Placement | `landmarkPlace` | change (undoable) | city |
| 87 | Building Validator | `buildingValidator` | read only | view |
| 88 | Building Replacement | `buildingReplace` | change (undoable) | city |

### Utilities (10)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 89 | Power Generator | `powerGen` | change (undoable) | city |
| 90 | Power Grid Repair | `powerRepair` | change (undoable) | city |
| 91 | Water Network Generator | `waterNetGen` | change (undoable) | city |
| 92 | Water Network Repair | `waterNetRepair` | change (undoable) | city |
| 93 | Sewage Generator | `sewageGen` | change (undoable) | city |
| 94 | Waste Network Generator | `wasteGen` | change (undoable) | city |
| 95 | Utility Validator | `utilityValidator` | read only | view |
| 96 | Utility Load Editor | `utilityLoad` | change (undoable) | city |
| 97 | Outage Simulator | `outageSim` | change (undoable) | city |
| 98 | Utility Stress Test | `utilityStress` | read only | view |

### Population (11)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 99 | Population Generator | `popGen` | change (undoable) | city |
| 100 | Population Density Editor | `popDensity` | change (undoable) | city |
| 101 | Citizen Spawn | `citizenSpawn` | change (undoable) | city |
| 102 | Citizen Remove | `citizenRemove` | change (undoable) | city |
| 103 | Household Generator | `householdGen` | change (undoable) | city |
| 104 | Job Generator | `jobGen` | change (undoable) | city |
| 105 | Education Editor | `educationEditor` | change (undoable) | city |
| 106 | Income Editor | `incomeEditor` | change (undoable) | city |
| 107 | Age Distribution Editor | `ageEditor` | change (undoable) | city |
| 108 | Migration Simulator | `migrationSim` | change (undoable) | city |
| 109 | Population Validator | `popValidator` | read only | view |

### Economy (11)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 110 | Money Editor | `moneyEditor` | change (undoable) | city |
| 111 | GDP Editor | `gdpEditor` | change (undoable) | city |
| 112 | Company Generator | `companyGen` | change (undoable) | city |
| 113 | Market Simulator | `marketSim` | change (undoable) | city |
| 114 | Inflation Editor | `inflationEditor` | change (undoable) | city |
| 115 | Interest Editor | `interestEditor` | change (undoable) | city |
| 116 | Trade Simulator | `tradeSim` | read only | view |
| 117 | Economic Shock | `econShock` | change (undoable) | city |
| 118 | Recession Simulator | `recessionSim` | change (undoable) | city |
| 119 | Economic Recovery | `econRecovery` | change (undoable) | city |
| 120 | Economy Validator | `econValidator` | read only | view |

### Environment (10)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 121 | Pollution Editor | `pollutionEditor` | change (undoable) | city |
| 122 | Air Quality Editor | `airEditor` | change (undoable) | city |
| 123 | Noise Editor | `noiseEditor` | change (undoable) | city |
| 124 | Waste Editor | `wasteEditor` | change (undoable) | city |
| 125 | Green Space Generator | `greenSpace` | change (undoable) | city |
| 126 | Forest Generator | `forestGen` | change (undoable) | city |
| 127 | Tree Generator | `treeGen` | change (undoable) | city |
| 128 | Climate Editor | `climateEditor` | change (undoable) | city |
| 129 | Weather Controller | `weatherCtl` | change (undoable) | city |
| 130 | Environmental Validator | `envValidator` | read only | view |

### Transportation (15)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 131 | Metro Generator | `metroGen` | change (undoable) | city |
| 132 | Bus Network Generator | `busGen` | change (undoable) | city |
| 133 | Train Network Generator | `trainGen` | change (undoable) | city |
| 134 | Airport Generator | `airportGen` | change (undoable) | city |
| 135 | Port Generator | `portGen` | change (undoable) | city |
| 136 | Bicycle Network Generator | `bikeGen` | change (undoable) | city |
| 137 | Pedestrian Network Generator | `pedGen` | change (undoable) | city |
| 138 | Parking Generator | `parkingGen` | change (undoable) | city |
| 139 | Transit Line Editor | `lineEditor` | read only | view |
| 140 | Transit Station Editor | `stationEditor` | change (undoable) | city |
| 141 | Transit Vehicle Editor | `vehicleEditor` | change (undoable) | city |
| 142 | Transport Validator | `transportValidator` | read only | view |
| 143 | Traffic AI Debugger | `trafficDebugger` | read only | view |
| 144 | Route Recalculator | `routeRecalc` | change (undoable) | city |
| 145 | Transit Stress Test | `transitStress` | read only | view |

### Disaster / Emergency (10)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 146 | Earthquake Simulator | `earthquake` | change (undoable) | city |
| 147 | Flood Simulator | `floodSim` | change (undoable) | city |
| 148 | Storm Simulator | `stormSim` | change (undoable) | city |
| 149 | Fire Simulator | `fireSim` | change (undoable) | city |
| 150 | Power Outage Simulator | `outageDisaster` | change (undoable) | city |
| 151 | Infrastructure Failure | `infraFailure` | change (undoable) | city |
| 152 | Emergency Dispatch Test | `dispatchTest` | change (undoable) | city |
| 153 | Emergency Vehicle Spawn | `emergencySpawn` | change (undoable) | city |
| 154 | Disaster Recovery | `disasterRecovery` | change (undoable) | city |
| 155 | Emergency Validator | `emergencyValidator` | read only | view |

### Debug / Development (20)

| # | Tool | Id | Kind | Guard category |
|---|---|---|---|---|
| 156 | Entity Inspector | `entityInspector` | read only | debug |
| 157 | Citizen Inspector | `citizenInspector` | read only | debug |
| 158 | Vehicle Inspector | `vehicleInspector` | read only | debug |
| 159 | Building Inspector | `buildingInspector` | read only | debug |
| 160 | Road Inspector | `roadInspector` | read only | debug |
| 161 | Economy Inspector | `economyInspector` | read only | debug |
| 162 | Traffic Inspector | `trafficInspector` | read only | debug |
| 163 | Simulation Inspector | `simInspector` | read only | debug |
| 164 | Save Inspector | `saveInspector` | read only | debug |
| 165 | Performance Monitor | `perfMonitor` | read only | perf |
| 166 | Memory Monitor | `memMonitor` | read only | perf |
| 167 | FPS Monitor | `fpsMonitor` | read only | perf |
| 168 | Entity Counter | `entityCounter` | read only | perf |
| 169 | Error Console | `errorConsole` | read only | debug |
| 170 | Event Log | `eventLog` | read only | debug |
| 171 | Simulation Timeline | `simTimeline` | read only | debug |
| 172 | Time Machine | `timeMachine` | read only | debug |
| 173 | Snapshot Manager | `snapshotManager` | read only | debug |
| 174 | World Compare | `worldCompare` | read only | debug |
| 175 | Seed Compare | `seedCompare` | read only | debug |

## Government (v2.6.0)

| Command (console) | Category | What it does |
|---|---|---|
| `government.stats` | view (read only · OWNER / ADMIN / DEVELOPER / DEBUG) | approval, satisfaction components, districts, error count, hourly / daily pass time |
| `government.budget` | view (read only · OWNER / ADMIN / DEVELOPER / DEBUG) | budget summary, funding per service, loans, taxes |
| `government.services` | view (read only · OWNER / ADMIN / DEVELOPER / DEBUG) | quality, coverage, capacity, use, workers, response times per service |
| `government.projects` | view (read only · OWNER / ADMIN / DEVELOPER / DEBUG) | every project: type, status, priority, progress, cost |
| `government.approval` | view (read only · OWNER / ADMIN / DEVELOPER / DEBUG) | approval value / label / history, active government events |
| `government.reset` | city (OWNER / ADMIN) | resets the government block (budget, taxes, policies, projects) to safe defaults |

Admin Center → **ECONOMY → 🏛️ GOVERNMENT** shows the inspector: Government, Budget & Taxes, Services, Projects & Policies, District Coverage. It also has guarded buttons: *RUN GOVERNMENT TICK*, *RUN GOVERNMENT DAY*, one button per government event, and *RESET GOVERNMENT*. They map to `adminGov('tick' | 'day' | 'event:<id>' | 'reset')` (guard ids `gov:*`, category `city`).

For a normal player these functions return nothing and change nothing; `scripts/qa-test.js` checks this ("Government admin tools are OWNER / ADMIN / developer only").

## Economy (v2.5.0)

`adminEcon2('shock:<id>:<severity>' | 'endShocks' | 'tick' | 'phase')` — guard ids `econ2:*`, category `city`.
