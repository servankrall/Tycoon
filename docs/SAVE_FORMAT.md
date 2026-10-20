# Save format

Saves are JSON (`CITY_SAVE_V4`, `version` / `saveVersion` **12**). The header names the sections it carries; `header.schema` is **3.3** since v2.8.0 (3.2 in v2.7.0, 3.1 in v2.6.0).

| Key | Since | Content |
|---|---|---|
| `city`, `buildings`, `economy`, `citizens`, `vehicles`, … | 1.x | core world and simulation |
| `p9` / `p10` / `p11` | 1.3–1.4 | chunks, regions, utilities, services, transport, finance |
| `p15` | 2.4.0 | Visual Engine history |
| `p17` | 2.5.0 | Economy Engine 2.0 (compact) |
| `government` | 2.6.0 (Save 3.1) | Government Engine 2.0 |
| `transportation` | 2.7.0 (Save 3.2) | TransportationEngine 3.0 |
| `citizenAI` | **2.8.0 (Save 3.3)** | CitizenAIEngine: citizen profiles, households, opinions, life score, history |
| `worldbuilder` | 2.7.0 | World Builder 2.0 report of a generated world (null for other cities) |
| `adminTools` | 2.7.0 | admin tool multipliers (power, water, wage, GDP; null when unused) |

## `citizenAI` block (Save 3.3)

```json
{
  "v": 1, "on": true, "nextCid": 58, "nextHh": 41,
  "people": { "12": { "id": 12, "fn": "Selin", "ln": "Kaya", "sx": "F", "by": -301.4, "hh": 7, "edu": 3, "pers": "FAMILY", "rt": "standard", "car": 1,
                      "cr": [3, 140, 2], "job": 412, "home": 388, "wage": 2950, "sav": 6400, "nd": [80, 66, 90, 88, 72, 54, 61, 70, 65, 100, 66], "hap": 71, "hl": 92, "sk": 0,
                      "cm": ["transit", 21.4], "mem": [[3, "📈", "Promoted to Senior"]], "op": [-12, -30, 18, 5, 22, 40, 33, 51, 10, 8], "fr": [14, 31], "sh": [233, 0, 241] } },
  "households": { "7": { "id": 7, "ln": "Kaya", "home": 388, "adults": [12, 14], "kids": [{ "fn": "Mei", "by": -78.2, "sx": "F" }], "income": 5200, "rent": 1300, "spend": 210, "sav": 9100, "sat": 68, "car": 1, "unhappy": 0 } },
  "opinions": { "taxes": -12, "traffic": -25, "transit": 14, "housing": 3, "jobs": 20, "health": 37, "education": 30, "safety": 48, "environment": 9, "fun": 6 },
  "life": { "score": 74.2, "label": "Very Good", "hist": [70, 72, 74] },
  "hist": [{ "d": 3, "life": 74, "hap": 66, "emp": 93, "commute": 19, "pop": 12480, "approval": 86 }],
  "events": { "attended": 12, "crowd": 0, "last": "" }, "migration": { "moved": 2, "left": 1, "arrived": 0 },
  "comments": [[3, "Selin K.", "Only 12 minutes to work by transit. Love it.", 0]]
}
```

- **Profiles:** only the profiles of the saved citizens (the 400-agent sample, `citizens[i].cid`) are kept; dirty flags mean only changed profiles are re-packed on each save. Needs (`nd`) and opinions (`op`) are arrays in the fixed order of `CAI_NEEDS` / `CAI_TOPICS`. `by` is the birth day (game day; 1 game year = 8 days).
- **Statistical population:** life stages, households and education of the whole population (up to 500K) are derived from the sample plus the statistical population model; they are not stored per person.
- **Migration:**
  - v2.7.0 and older saves (no `citizenAI`, citizens without `cid`) load with an empty block, and profiles are created for the citizens as they appear;
  - corrupt data is sanitized: numbers are clamped, `<` / `>` are stripped from strings, at most 1200 profiles and 800 households are kept, and unknown keys are dropped;
  - the block is platform-independent (Windows ↔ Android).

## `transportation` block (Save 3.2)

```json
{
  "v": 1,
  "metro": { "lines": { "L4": { "color": "#e63946", "headway": 4, "trains": 6, "order": true } }, "depots": 1, "stationHist": {} },
  "bus": { "schedules": { "L7": { "start": 6, "end": 22, "headway": 6 } } },
  "rail": { "cargoTons": 1840, "cargoValue": 92000, "hist": [] },
  "airport": { "level": "regional", "paxDay": 3100, "cargoDay": 120 },
  "ports": { "level": "cargo", "teuDay": 410, "imports": 0, "exports": 0 },
  "bike": { "roads": {} },
  "pedestrian": { "crosswalks": { "1234": 1 } },
  "parking": { "street": true, "searchMin": 1.4 },
  "traffic": { "defaultMode": "adaptive", "modes": { "2210": "smart" }, "ptPriority": { "2210": 1 }, "oneway": {}, "speedMult": 1,
               "stats": { "reroutes": 51, "predicted": 640, "avoided": 12, "ptGreen": 33, "privDelay": 0.4, "emPreempt": 3 } },
  "gen": { "tier": "large", "built": ["🚇 Metro 1 (7 stations)"], "at": 3 },
  "validation": { "ok": true, "issues": 0, "fixed": 4, "at": 3 },
  "hist": [{ "d": 2, "cars": 2100, "pt": 0.31, "commute": 21.5 }]
}
```

Lines and stops stay in `p9.transit` (unchanged). The block holds only the TransportationEngine 3.0 settings for them: player order, colour, trains, frequency and schedule. It also holds the light modes, transit priority, one-way tiles, parking and statistics.

### Migration and validation (Save 3.2)

- **v2.6.0 and older** (no `transportation` block): `sanitizeTransportation(undefined)` returns defaults. Light mode is automatic, street parking is on, and there are no player overrides. Existing lines keep running.
- **Corrupt data:** modes outside Fixed / Adaptive / Smart / Emergency are dropped, numbers are clamped (headway, trains, speed multiplier), and keys that are not tile indexes or line ids are removed.
- `worldbuilder` is sanitized by `sanitizeWorldbuilder` (strings cleaned and cut, scores clamped 0–100, at most 40 pipeline entries).
- `adminTools` multipliers are clamped (power / water 0.3–3, wage / GDP 0.5–2).
- **Windows ↔ Android:** all three blocks are platform-independent.

## `government` block (Save 3.1)

```json
{
  "v": 1, "day": 12,
  "budget": { "funding": { "health": 1, "education": 1.2, "...": 1 }, "loans": [{ "id": 1, "principal": 5000, "remaining": 5203, "rate": 0.065, "perDay": 325, "day": 10 }],
              "nextLoan": 2, "reserve": 23027, "reserveRate": 0.05, "deficitDays": 0, "interestPaid": 41,
              "today": { "inc": {}, "exp": {} }, "last": { "inc": { "residential": 432086 }, "exp": { "health": 169479 }, "balance": 750159 },
              "hist": [{ "d": 11, "inc": 1405920, "exp": 655760, "budget": 2960414 }], "hourly": [2960414] },
  "taxes": { "residential": 11, "commercial": 14, "industrial": 14, "corporate": 0, "property": 1 },
  "services": { "health": { "capacity": 900, "coverage": 0.98, "quality": 87, "...": 0 } },
  "maint": { "roads": { "name": "Roads", "v": 88, "level": "Excellent" }, "avg": 93 },
  "districts": [{ "k": 11, "name": "Harbor Estates", "pop": 1848, "health": 100, "education": 99, "safety": 100, "...": 0 }],
  "sat": { "happiness": 49, "safety": 92, "city": 80 },
  "approval": { "value": 85.7, "label": "Very Good", "hist": [63, 84, 87] },
  "policies": { "active": { "recycling": { "since": 10, "until": 16 } }, "log": [{ "d": 10, "id": "recycling", "on": true }] },
  "projects": [{ "id": 1, "type": "park", "prio": "high", "status": "building", "b": 740, "progress": 0.4, "cost": 51750, "paid": 51750, "start": 10, "done": 0, "note": "Central Park · Sun Forge", "x": 11, "y": 29 }],
  "nextProject": 2,
  "events": { "active": [{ "id": "eduBoom", "start": 6, "until": 9 }], "log": [{ "d": 6, "id": "eduBoom" }] },
  "reports": [{ "d": 5, "pop": 19015, "rev": 1473533, "exp": 659194, "bal": 814339, "approval": 88, "problems": [], "actions": [] }],
  "alerts": { "deficit": 0 }
}
```

`services`, `maint`, `districts` and `sat` are recomputed every game hour. They are saved so the panel shows real numbers straight after loading.

## Migration and validation

- **v2.5.0 and older** (no `government` block): `sanitizeGov(undefined)` returns safe defaults. Funding is 100 %; taxes are taken from the city's current rates on the first tick (residential = the classic tax slider, commercial / industrial = the Part 17 business tax, property = the Part 17 property tax); approval is 60.
- **Corrupt data** is sanitized field by field:
  - numbers are clamped (funding 0–1.5, taxes 0–30 / property 0–20, approval 0–100);
  - loans without a remaining amount are dropped;
  - unknown project types, policies and events are removed;
  - an invalid status becomes `planned`;
  - strings lose `<` / `>` and are cut to length.
- **Windows ↔ Android:** the block is platform-independent and loads identically on both.
