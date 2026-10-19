# Save format

Saves are JSON (`CITY_SAVE_V4`, `version` / `saveVersion` **12**). The header names the sections it carries; `header.schema` is **3.2** since v2.7.0 (3.1 in v2.6.0).

| Key | Since | Content |
|---|---|---|
| `city`, `buildings`, `economy`, `citizens`, `vehicles`, … | 1.x | core world and simulation |
| `p9` / `p10` / `p11` | 1.3–1.4 | chunks, regions, utilities, services, transport, finance |
| `p15` | 2.4.0 | Visual Engine history |
| `p17` | 2.5.0 | Economy Engine 2.0 (compact) |
| `government` | 2.6.0 (Save 3.1) | Government Engine 2.0 |
| `transportation` | **2.7.0 (Save 3.2)** | TransportationEngine 3.0 |
| `worldbuilder` | 2.7.0 | World Builder 2.0 report of a generated world (null for other cities) |
| `adminTools` | 2.7.0 | admin tool multipliers (power, water, wage, GDP; null when unused) |

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
