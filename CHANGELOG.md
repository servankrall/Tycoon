# Changelog

Full release notes (Turkish) for every version: [.github/RELEASE_NOTES.md](.github/RELEASE_NOTES.md).

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
