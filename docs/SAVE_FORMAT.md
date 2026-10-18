# Save format

Saves are JSON (`CITY_SAVE_V4`, `version` / `saveVersion` **12**). The header names the sections it carries; `header.schema` is **3.1** since v2.6.0.

| Key | Since | Content |
|---|---|---|
| `city`, `buildings`, `economy`, `citizens`, `vehicles`, … | 1.x | core world and simulation |
| `p9` / `p10` / `p11` | 1.3–1.4 | chunks, regions, utilities, services, transport, finance |
| `p15` | 2.4.0 | Visual Engine history |
| `p17` | 2.5.0 | Economy Engine 2.0 (compact) |
| `government` | **2.6.0 (Save 3.1)** | Government Engine 2.0 |

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
