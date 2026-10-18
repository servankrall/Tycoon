# Admin commands

Admin tools are invisible to normal players. Every action passes `AdminAuth.guard`: it needs a signed-in OWNER / ADMIN — or a DEVELOPER / DEBUG role where the category allows it (read-only government inspection: all four roles; changes: OWNER / ADMIN). Every attempt is written to the admin action log. There are no plain-text passwords in the game files.

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
