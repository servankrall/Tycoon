'use strict';
/* BLOCK CITY TYCOON — SIMULATION DATA — speeds, seeded RNG, road types, zones, heatmaps, crises, techs */
/* =======================================================================
   PART 6 — MASTER SIMULATION ENGINE
   -----------------------------------------------------------------------
   16. P6 CONFIG ......... speeds, RNG, road types, zones, heatmaps, tech,
                           crises, disasters, mega projects, scenarios
   17. P6 SYSTEMS ........ inflation, stocks, crises, emergency AI, traffic
                           routing, evolution, dynamic quests, reports…
   18. P6 UI ............. minimap, heatmap picker, statistics center,
                           debug (F3), scenario/sandbox screens, search
   ======================================================================= */

/* --- SIMULATION SPEEDS (fixed timestep; the economy never depends on FPS) --- */
const SIM_SPEEDS = [0, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

/* --- DETERMINISTIC RNG: all gameplay randomness (events, crises, companies…) comes
   from one seeded generator whose state is saved, so a CITY SEED reproduces the world. --- */
class SeededRNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() { let a = this.s = (this.s + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}
const RNG = {
  gen: new SeededRNG(1),
  seed: function (s) { this.gen = new SeededRNG(s); },
  sync: function () { if (S && S.p6) S.p6.rng = this.gen.s; },
  next: function () { return this.gen.next(); },
  range: function (a, b) { return this.gen.range(a, b); },
  int: function (a, b) { return this.gen.int(a, b); },
  pick: function (arr) { return this.gen.pick(arr); },
  chance: function (p) { return this.gen.chance(p); }
};

/* --- MAP TYPES (scenario generator) --- */
const MAP_TYPES = {
  standard: { name: 'Standard', icon: '🗺️', rivers: [1, 2], lakes: [1, 2], hill: 0.6, rock: 0.74, desc: 'Balanced rivers, lakes and hills.' },
  river: { name: 'River Valley', icon: '🏞️', rivers: [2, 3], lakes: [0, 1], hill: 0.62, rock: 0.78, desc: 'Wide rivers cut through the land.' },
  lakes: { name: 'Lakeland', icon: '💧', rivers: [0, 1], lakes: [3, 5], hill: 0.64, rock: 0.8, desc: 'Many lakes and waterfronts.' },
  islands: { name: 'Islands', icon: '🏝️', rivers: [0, 1], lakes: [1, 2], hill: 0.64, rock: 0.8, coast: true, desc: 'The sea surrounds the city.' },
  mountains: { name: 'Mountains', icon: '⛰️', rivers: [1, 1], lakes: [0, 1], hill: 0.5, rock: 0.64, desc: 'Hills and rock everywhere — tunnels help.' },
  plains: { name: 'Flat Plains', icon: '🌾', rivers: [0, 1], lakes: [0, 1], hill: 2, rock: 2, desc: 'Flat and easy to build on.' }
};

/* --- ROAD TYPES (value stored in MAP.roads; bridges on water, tunnels through rock) --- */
const ROAD_TYPES = [
  null,
  { id: 1, name: 'Small Road', icon: '🛣️', cost: 5, cap: 6, speed: 0.9, lanes: 1, color: '#454a5a' },
  { id: 2, name: 'Medium Road', icon: '🛣️', cost: 10, cap: 9, speed: 1.05, lanes: 2, color: '#3d4150' },
  { id: 3, name: 'Large Road', icon: '🛤️', cost: 22, cap: 14, speed: 1.2, lanes: 4, color: '#353846' },
  { id: 4, name: 'Highway', icon: '🛣️', cost: 45, cap: 22, speed: 1.55, lanes: 6, color: '#2b2d38', unlock: { pop: 400 } }
];

/* --- ZONES 2.0: new specialised zones (building ids / categories allowed) --- */
ZONES.push(
  { id: 5, name: 'Office', icon: '🏢', color: '#4895ef', cats: [], ids: ['office', 'bank', 'stockexchange', 'techcampus', 'datacenter', 'bankhq', 'startup', 'park', 'plaza'] },
  { id: 6, name: 'Tourism', icon: '🧳', color: '#f15bb5', cats: ['Leisure', 'Landmarks'], ids: ['hotel', 'museum', 'foodstand', 'restaurant'] },
  { id: 7, name: 'Entertainment', icon: '🎭', color: '#b5179e', cats: ['Leisure'], ids: ['nightclub', 'cinema', 'gym', 'foodstand', 'restaurant', 'foodcourt'] },
  { id: 8, name: 'Technology', icon: '💻', color: '#00b4d8', cats: ['Science'], ids: ['office', 'techcampus', 'datacenter', 'startup'] },
  { id: 9, name: 'Luxury', icon: '💎', color: '#ffd60a', cats: [], ids: ['condo', 'skyscraper', 'luxurytower', 'arcology', 'gourmethq', 'mall', 'megamall', 'park', 'plaza', 'restaurant'] }
);
/* What the developers build in each specialised zone (sector demand decides) */
const ZONE_DEVELOP = {
  5: [['office', 'TECHNOLOGY'], ['bank', 'FINANCE'], ['stockexchange', 'FINANCE'], ['techcampus', 'TECHNOLOGY']],
  6: [['hotel', 'TOUR'], ['restaurant', 'FOOD'], ['museum', 'TOUR']],
  7: [['nightclub', 'ENTERTAINMENT'], ['cinema', 'ENTERTAINMENT'], ['gym', 'ENTERTAINMENT'], ['restaurant', 'FOOD']],
  8: [['office', 'TECHNOLOGY'], ['startup', 'TECHNOLOGY'], ['techcampus', 'TECHNOLOGY']],
  9: [['condo', 'HOUSING'], ['luxurytower', 'HOUSING'], ['skyscraper', 'HOUSING'], ['restaurant', 'FOOD']]
};

/* --- HEATMAPS --- */
const HEATMAPS = [
  { id: 'TRAFFIC', icon: '🚗', name: 'Traffic', low: 'Free flow', high: 'Jammed', ramp: 'bad' },
  { id: 'ELECTRICITY', icon: '⚡', name: 'Electricity', low: 'No power', high: 'Powered', ramp: 'good' },
  { id: 'WATER', icon: '💧', name: 'Water', low: 'No water', high: 'Supplied', ramp: 'good' },
  { id: 'LAND VALUE', icon: '🏠', name: 'Land Value', low: 'Cheap', high: 'Prime', ramp: 'value' },
  { id: 'POLLUTION', icon: '🏭', name: 'Pollution', low: 'Clean', high: 'Toxic', ramp: 'bad' },
  { id: 'HAPPINESS', icon: '😊', name: 'Happiness', low: 'Unhappy', high: 'Happy', ramp: 'good' },
  { id: 'SAFETY', icon: '👮', name: 'Safety', low: 'Unsafe', high: 'Safe', ramp: 'good' },
  { id: 'HEALTH', icon: '🏥', name: 'Health', low: 'No care', high: 'Covered', ramp: 'good' },
  { id: 'EDUCATION', icon: '🎓', name: 'Education', low: 'No schools', high: 'Covered', ramp: 'good' },
  { id: 'WEALTH', icon: '💰', name: 'Wealth', low: 'Poor', high: 'Rich', ramp: 'value' },
  { id: 'DEMAND', icon: '🛍️', name: 'Demand (R/C/I)', low: 'Low', high: 'High', ramp: 'value' },
  { id: 'FIRE', icon: '🚒', name: 'Fire coverage', low: 'Unprotected', high: 'Covered', ramp: 'good' },
  { id: 'DENSITY', icon: '🏙️', name: 'Density', low: 'Low', high: 'Very high', ramp: 'value' }
];

/* --- CITIZEN DATA --- */
const JOB_TITLES = { FOOD: 'Chef', SHOPPING: 'Retail clerk', ENTERTAINMENT: 'Entertainer', FINANCE: 'Banker', TECHNOLOGY: 'Engineer', INDUSTRY: 'Factory worker', RESOURCE: 'Miner', ENERGY: 'Plant operator', WATER: 'Water technician', SERVICE: 'Public servant', TRANSPORT: 'Driver', SCIENCE: 'Researcher', EDUCATION: 'Teacher', LOGISTICS: 'Logistics clerk', WASTE: 'Sanitation worker', CIVIC: 'Civil servant', LANDMARK: 'Guide', HOUSING: 'Caretaker' };
const EDU_LEVELS = ['None', 'Primary', 'High school', 'University', 'PhD'];

/* --- DISTRICT NAMES (seeded) --- */
const DISTRICT_PREFIX = ['Oak', 'Maple', 'Cedar', 'Willow', 'Pine', 'Elm', 'Birch', 'Aspen', 'Harbor', 'Sunset', 'Silver', 'Golden', 'Crystal', 'Stone', 'River', 'Lake', 'Hill', 'Rose'];
const STREET_SUFFIX = ['Street', 'Avenue', 'Road', 'Boulevard', 'Lane', 'Drive', 'Way'];

/* --- EVOLUTION CHAINS (buildings grow into bigger types) --- */
const EVOLVE = { shop: 'supermarket', supermarket: 'mall', mall: 'megamall', foodstand: 'restaurant', restaurant: 'foodcourt', house: 'apartment', apartment: 'condo', condo: 'skyscraper', skyscraper: 'arcology', office: 'techcampus', nightclub: 'cinema' };

/* --- PART 6 PRODUCTS (deeper supply chains: farm → wheat → flour → bread; mine → metal → electronics) --- */
PRODUCTS.wheat = { name: 'Wheat', icon: '🌾', base: 0.9, rate: 1.5, inputs: {} };
PRODUCTS.flour = { name: 'Flour', icon: '🥣', base: 1.8, rate: 1, inputs: { wheat: 1 } };
PRODUCTS.bread = { name: 'Bread', icon: '🍞', base: 3.4, rate: 1.1, inputs: { flour: 0.6 } };
PRODUCTS.metal = { name: 'Metal', icon: '🔩', base: 3.6, rate: 0.8, inputs: { iron: 0.8, coal: 0.4 } };
PRODUCTS.electronics.inputs = { rare: 0.4, metal: 0.4 };
PRODUCTS.electronics.alt = { rare: 0.4, materials: 0.6 };
['wheat', 'flour', 'bread', 'metal'].forEach(function (p) { if (PRODUCT_IDS.indexOf(p) < 0) PRODUCT_IDS.push(p); });
const RECIPE_ORDER = ['wheat', 'fuel', 'metal', 'materials', 'flour', 'bread', 'food', 'electronics', 'vehicles'];

/* --- PART 6 BUILDINGS --- */
registerBuilding({ id: 'flourmill', name: 'Flour Mill', icon: '🥣', cat: 'Industry', sector: 'INDUSTRY', w: 2, h: 2, cost: 6500, color: '#ddb892', roof: '#b08968', height: 26, goods: 6, recipes: ['flour'], workers: 10, maxW: 20, power: -6, water: -2, pol: 3, interior: 'factory', unlock: { pop: 120 }, desc: 'Grinds wheat from farms into flour.' });
registerBuilding({ id: 'bakery', name: 'Industrial Bakery', icon: '🍞', cat: 'Industry', sector: 'INDUSTRY', w: 1, h: 1, cost: 3800, color: '#e9c46a', roof: '#c9a227', height: 18, goods: 4, recipes: ['bread'], workers: 6, maxW: 12, power: -3, water: -2, pol: 1, interior: 'factory', unlock: { pop: 120 }, desc: 'Bakes flour into bread for restaurants and markets.' });
registerBuilding({ id: 'smelter', name: 'Steel Smelter', icon: '🔩', cat: 'Industry', sector: 'INDUSTRY', w: 2, h: 2, cost: 16000, color: '#6c757d', roof: '#343a40', height: 34, goods: 8, recipes: ['metal'], workers: 18, maxW: 36, power: -14, water: -4, pol: 14, smoke: true, interior: 'factory', unlock: { pop: 300 }, desc: 'Turns iron and coal into metal for electronics.' });
registerBuilding({ id: 'gym', name: 'Fitness Center', icon: '🏋️', cat: 'Commercial', sector: 'ENTERTAINMENT', w: 1, h: 1, cost: 4200, color: '#f94144', roof: '#c1121f', height: 20, rev: 14, cap: 300, workers: 6, maxW: 12, power: -3, water: -2, hap: 0.5, unlock: { pop: 200 }, desc: 'Citizens work out after work and on weekends.' });
registerBuilding({ id: 'maintdepot', name: 'Maintenance Depot', icon: '🛠️', cat: 'Services', sector: 'SERVICE', w: 1, h: 1, cost: 3000, color: '#f8961e', roof: '#c16c00', height: 16, workers: 6, maxW: 12, power: -2, maint: 0.8, unlock: { pop: 150 }, desc: 'Sends maintenance crews to repair roads, water mains and damaged buildings faster.' });
registerBuilding({ id: 'megamall', name: 'Mega Mall', icon: '🏬', cat: 'Commercial', sector: 'SHOPPING', w: 3, h: 3, cost: 900000, color: '#b5179e', roof: '#7209b7', height: 70, rev: 900, cap: 22000, workers: 200, maxW: 400, power: -60, water: -20, goodsUse: 60, unlock: { tech: 'ar_mega' }, desc: 'The final evolution of a shopping center.' });
registerBuilding({ id: 'arcology', name: 'Arcology', icon: '🏙️', cat: 'Residential', sector: 'HOUSING', w: 3, h: 3, cost: 4000000, color: '#2a9d8f', roof: '#264653', height: 190, housing: 9000, quality: 90, rent: 0.11, unitSize: 4, power: -160, water: -120, hap: 2, unlock: { tech: 'ar_arcology' }, desc: 'A self-contained vertical city. Megacity era.' });
BUILDINGS.farm.recipes = ['food', 'wheat'];
BUILDINGS.factory.recipes = ['food', 'materials', 'electronics', 'vehicles', 'metal', 'flour', 'bread'];
BUILDINGS.megafactory.recipes = ['materials', 'food', 'electronics', 'vehicles', 'metal', 'flour', 'bread'];
AI_BUILD_OPTIONS.ENTERTAINMENT.push(['gym', 0]);
AI_BUILD_OPTIONS.INDUSTRY.push(['flourmill', 1], ['bakery', 1]);

/* --- NEW RIVAL COMPANIES (Block Mart vs City Mart vs Mega Market style competition) --- */
AI_DEFS.push(
  { id: 'ai_citymart', name: 'CITY MART', icon: '🏪', kind: 'rival', zone: 2, color: '#f77f00', sectors: ['SHOPPING'] },
  { id: 'ai_fresh', name: 'FRESH BITES', icon: '🥗', kind: 'rival', zone: 2, color: '#80b918', sectors: ['FOOD'] }
);
const AI_DEFAULT_NAMES = {}; AI_DEFS.forEach(function (a) { AI_DEFAULT_NAMES[a.id] = a.name; });
const COMPANY_REFOUND_NAMES = { SHOPPING: ['MEGA MARKET', 'VALUE HUB', 'CUBE STORES', 'BLOCK OUTLET'], FOOD: ['TASTY TOWN', 'GRILL CO.', 'NOODLE NATION', 'PIXEL DINER'], FINANCE: ['NORTH BANK', 'VAULT & CO.'], TECHNOLOGY: ['BYTEWORKS', 'QUANTUM LEAP'], INDUSTRY: ['FORGE GROUP', 'IRONCLAD'], HOUSING: ['URBAN NEST', 'HOMEWORKS'], ENTERTAINMENT: ['FUNPLEX', 'NIGHTOWL'] };

/* --- TECH TREE 2.0: new categories (money + RP + city level) --- */
const TECH_CAT_NAMES = { ENERGY: 'Energy', TRANSPORT: 'Transportation', BUSINESS: 'Economy', SCIENCE: 'AI & Science', ENVIRONMENT: 'Environment', CITY: 'Architecture', DEFENSE: 'Safety', INDUSTRY: 'Industry', TOURISM: 'Tourism', HEALTH: 'Healthcare', EDUCATION: 'Education' };
['INDUSTRY', 'TOURISM', 'HEALTH', 'EDUCATION'].forEach(function (c) { if (TECH_CATS.indexOf(c) < 0) TECH_CATS.push(c); });
[
  { id: 'i_lean', cat: 'INDUSTRY', name: 'Lean Manufacturing', cost: 80, req: [], desc: 'Industrial production +10%.' },
  { id: 'i_robotics', cat: 'INDUSTRY', name: 'Industrial Robotics', cost: 600, req: ['i_lean', 'automation'], desc: 'Production +15%, industrial pollution -10%.' },
  { id: 'i_chain', cat: 'INDUSTRY', name: 'Integrated Supply Chains', cost: 900, req: ['i_lean', 'b_supply'], desc: 'Logistics capacity +30%, transport costs -25%.' },
  { id: 'tr_marketing', cat: 'TOURISM', name: 'Destination Marketing', cost: 150, req: [], desc: 'Tourism +15%.' },
  { id: 'tr_culture', cat: 'TOURISM', name: 'Cultural Heritage', cost: 500, req: ['tr_marketing'], desc: 'Tourism +20%, happiness +2.' },
  { id: 'tr_global', cat: 'TOURISM', name: 'Global Travel Hub', cost: 1800, req: ['tr_culture', 'aviation'], desc: 'Tourism +30%, trade capacity +15%.' },
  { id: 'h_clinics', cat: 'HEALTH', name: 'Community Clinics', cost: 120, req: [], desc: 'Health coverage radius +20%.' },
  { id: 'h_telemed', cat: 'HEALTH', name: 'Telemedicine', cost: 700, req: ['h_clinics', 's_ai'], desc: 'Health coverage +30% more, happiness +2.' },
  { id: 'ed_stem', cat: 'EDUCATION', name: 'STEM Programs', cost: 160, req: ['s_edu'], desc: 'Research +10%, worker skill grows faster.' },
  { id: 'ed_online', cat: 'EDUCATION', name: 'Online Learning', cost: 650, req: ['ed_stem'], desc: 'Education +10.' },
  { id: 'ai_traffic', cat: 'SCIENCE', name: 'AI Traffic Control', cost: 1100, req: ['s_ai', 't_lights'], desc: 'Traffic -12%, smarter rerouting.' },
  { id: 'ai_grid', cat: 'SCIENCE', name: 'Smart Grid AI', cost: 1000, req: ['s_ai', 'e_grid'], desc: 'Power demand -8%.' },
  { id: 'ai_auto', cat: 'SCIENCE', name: 'Autonomous Vehicles', cost: 3500, req: ['ai_traffic', 't_ev'], level: 16, desc: 'Megacity: traffic -20%, logistics +30%.' },
  { id: 'ar_green', cat: 'CITY', name: 'Green Roofs', cost: 260, req: ['env_green'], desc: 'Pollution -8%, happiness +1.' },
  { id: 'ar_mega', cat: 'CITY', name: 'Mega Structures', cost: 2200, req: ['c_highrise', 'c_landmarks'], level: 14, desc: 'Unlocks the Mega Mall and building evolution to mega scale.' },
  { id: 'ar_arcology', cat: 'CITY', name: 'Arcologies', cost: 4500, req: ['ar_mega', 'env_carbon'], level: 17, desc: 'Unlocks the Arcology (9,000 residents). Housing +10%.' },
  { id: 'ec_fintech', cat: 'BUSINESS', name: 'FinTech', cost: 800, req: ['b_finance'], desc: 'Finance revenue +15%.' },
  { id: 'ec_trade', cat: 'BUSINESS', name: 'Free Trade Zone', cost: 1400, req: ['b_global'], desc: 'Trade capacity +25%.' }
].forEach(function (t) { TECH_LIST.push(t); TECHS[t.id] = t; });

/* --- CITY CRISES (condition-triggered, each with solution options) --- */
const CRISIS6 = {
  powercrisis: { title: '⚡ POWER CRISIS', icon: '⚡', cond: function () { return SIM.powerUse > 30 && SIM.powerRatio < 0.8; }, text: function () { return 'Electricity demand exceeds production (' + pct(SIM.powerRatio * 100) + ' supplied). Businesses are shutting down.'; },
    options: [{ label: 'Emergency power import', desc: '+35% power for 5 min', cost: 0.12, payer: 'budget', eff: { powerProd: 1.35 }, dur: 300 },
      { label: 'Rolling blackouts', desc: 'Demand -25%, happiness -8 for 5 min', cost: 0, eff: { powerDemand: 0.75, hap: -8 }, dur: 300 },
      { label: 'Emergency generator', desc: 'Builds a permanent power plant', cost: 0.2, payer: 'budget', special: 'generator' }] },
  watercrisis: { title: '🚰 WATER CRISIS', icon: '🚰', cond: function () { return SIM.waterUse > 30 && SIM.waterRatio < 0.8; }, text: function () { return 'Water demand is far above supply (' + pct(SIM.waterRatio * 100) + ').'; },
    options: [{ label: 'Water trucks', desc: '+40% water supply for 5 min', cost: 0.1, payer: 'budget', eff: { waterProd: 1.4 }, dur: 300 },
      { label: 'Water restrictions', desc: 'Use -25%, happiness -5 for 5 min', cost: 0, eff: { waterUse: 0.75, hap: -5 }, dur: 300 },
      { label: 'Do nothing', desc: 'Shortage continues', cost: 0 }] },
  trafficcrisis: { title: '🚗 TRAFFIC CRISIS', icon: '🚗', cond: function () { return S.city.population > 400 && SIM.traffic > 82; }, text: function () { return 'Gridlock! Traffic is at ' + pct(SIM.traffic) + '. Deliveries and emergency services are delayed.'; },
    options: [{ label: 'Free transit week', desc: 'Traffic -20%, no fares for 5 min', cost: 0.08, payer: 'budget', eff: { traffic: 0.8, fares: 0 }, dur: 300 },
      { label: 'Congestion charge', desc: 'Traffic -15%, budget +, happiness -3', cost: 0, eff: { traffic: 0.85, hap: -3, charge: 1 }, dur: 300 },
      { label: 'Emergency road works', desc: 'Road capacity +25% for 10 min', cost: 0.15, payer: 'budget', eff: { roadCap: 1.25 }, dur: 600 }] },
  pollutioncrisis: { title: '🏭 POLLUTION CRISIS', icon: '🏭', cond: function () { return S.city.pollution > 70; }, text: function () { return 'Smog alert! Pollution reached ' + Math.round(S.city.pollution) + '. Citizens are getting sick.'; },
    options: [{ label: 'Factory curfew', desc: 'Production -25%, pollution -30% for 5 min', cost: 0, eff: { production: 0.75, pollution: 0.7 }, dur: 300 },
      { label: 'Green emergency fund', desc: 'Pollution -20% for 10 min', cost: 0.12, payer: 'budget', eff: { pollution: 0.8 }, dur: 600 },
      { label: 'Ignore it', desc: 'Happiness -8 for 5 min', cost: 0, eff: { hap: -8 }, dur: 300 }] },
  bankingcrisis: { title: '🏦 BANKING CRISIS', icon: '🏦', cond: function () { return S.p5 && S.p5.econ.phase === 'RECESSION' && S.city.population > 800 && RNG.chance(0.02); }, text: function () { return 'Banks are under pressure — loans are defaulting and savers are nervous.'; },
    options: [{ label: 'Bank bailout', desc: 'Stability restored', cost: 0.2, payer: 'budget', eff: { fin: 1 }, dur: 300 },
      { label: 'Raise interest rates', desc: 'Inflation ↓, growth -10% for 5 min', cost: 0, eff: { growth: 0.9, rateUp: 0.02 }, dur: 300 },
      { label: 'Let banks fail', desc: 'Finance revenue -40%, stocks crash', cost: 0, eff: { fin: 0.6 }, dur: 420, special: 'crash' }] },
  recession6: { title: '📉 ECONOMIC RECESSION', icon: '📉', cond: function () { return S.p5 && S.p5.econ.phase === 'RECESSION' && S.city.population > 300 && RNG.chance(0.03); }, text: function () { return 'The economy is shrinking. Consumers are spending less.'; },
    options: [{ label: 'Stimulus spending', desc: 'Demand +8% for 5 min', cost: 0.15, payer: 'budget', eff: { demand: 1.08 }, dur: 300 },
      { label: 'Tax relief', desc: 'Tax income -40%, happiness +4 for 5 min', cost: 0, eff: { tax: 0.6, hap: 4 }, dur: 300 },
      { label: 'Wait it out', desc: 'No action', cost: 0 }] }
};

/* --- DISASTERS 2.0 --- */
DISASTERS.push(
  { id: 'earthquake', name: 'Earthquake', icon: '🌋', dur: 40, desc: 'The ground shakes — some buildings are damaged.' },
  { id: 'blackout', name: 'Grid Blackout', icon: '🔌', dur: 60, desc: 'A substation failed. Power output is reduced until crews fix it.' },
  { id: 'infrastructure', name: 'Infrastructure Failure', icon: '🚧', dur: 90, desc: 'A water main burst and a road collapsed.' }
);

/* --- MEGACITY ERA: mega projects --- */
const MEGA_PROJECTS = [
  { id: 'elevator', name: 'Space Elevator', icon: '🛰️', stages: 3, cost: 6e6, dur: 240, desc: 'Research +15%, tourism +20%.' },
  { id: 'arcodist', name: 'Arcology District', icon: '🏙️', stages: 3, cost: 4e6, dur: 200, desc: 'Housing +15%, pollution -10%.' },
  { id: 'hyperloop', name: 'Hyperloop Network', icon: '🚄', stages: 4, cost: 5e6, dur: 220, desc: 'Traffic -20%, trade capacity +30%.' },
  { id: 'fusiongrid', name: 'Fusion Grid', icon: '🔆', stages: 3, cost: 7e6, dur: 260, desc: '+20,000 power, electricity costs -30%.' },
  { id: 'exchange', name: 'Global Exchange', icon: '🌐', stages: 3, cost: 5e6, dur: 200, desc: 'Finance +25%, your companies earn +15%.' },
  { id: 'smartcore', name: 'Smart City Core', icon: '🧠', stages: 4, cost: 6e6, dur: 240, desc: 'Happiness +6, crime -20%.' }
];

/* --- DYNAMIC QUEST TEMPLATES (generated from the city's real state) --- */
const DQ_TEMPLATES = [
  { id: 'traffic', icon: '🚗', title: 'Traffic Problem', when: function () { return SIM.traffic > 70; }, goal: function () { return 'Reduce traffic below 45%.'; }, check: function () { return SIM.traffic < 45; }, prog: function () { return clamp((80 - SIM.traffic) / 35, 0, 1); }, dur: 900, reward: { rp: 30, xp: 60, money: 1 } },
  { id: 'health', icon: '🏥', title: 'Expand Healthcare', when: function () { return S.city.population > 1000 && SIM.cov.health < 0.6; }, goal: function () { return 'Reach 70% health coverage.'; }, check: function () { return SIM.cov.health >= 0.7; }, prog: function () { return SIM.cov.health / 0.7; }, dur: 1200, reward: { rp: 40, xp: 80, money: 2 } },
  { id: 'jobs', icon: '💼', title: 'Jobs for Everyone', when: function () { return SIM.unemployment > 0.1 && S.city.population > 100; }, goal: function () { return 'Bring unemployment below 6%.'; }, check: function () { return SIM.unemployment < 0.06; }, prog: function () { return clamp((0.16 - SIM.unemployment) / 0.1, 0, 1); }, dur: 900, reward: { xp: 60, money: 1.5 } },
  { id: 'air', icon: '🍃', title: 'Clean Air', when: function () { return S.city.pollution > 40; }, goal: function () { return 'Lower pollution below 25.'; }, check: function () { return S.city.pollution < 25; }, prog: function () { return clamp((55 - S.city.pollution) / 30, 0, 1); }, dur: 1200, reward: { rp: 30, xp: 70, money: 1 } },
  { id: 'power', icon: '⚡', title: 'Power Up', when: function () { return SIM.powerUse > 20 && SIM.powerGen < SIM.powerUse * 1.08; }, goal: function () { return 'Reach a 20% power reserve.'; }, check: function () { return SIM.powerGen >= SIM.powerUse * 1.2; }, prog: function () { return clamp(SIM.powerGen / Math.max(1, SIM.powerUse * 1.2), 0, 1); }, dur: 900, reward: { xp: 50, money: 1 } },
  { id: 'housing', icon: '🏘️', title: 'Housing Boom', when: function () { return (SIM.housingDemandRatio || 0) > 1.1 && S.city.population > 30; }, target: function () { return Math.round(SIM.housingCap * 1.2 + 20); }, goal: function (q) { return 'Raise housing capacity to ' + fmt(q.target) + '.'; }, check: function (q) { return SIM.housingCap >= q.target; }, prog: function (q) { return SIM.housingCap / q.target; }, dur: 900, reward: { xp: 60, money: 1.5 } },
  { id: 'happy', icon: '😊', title: 'Happy Citizens', when: function () { return S.city.happiness < 55 && S.city.population > 50; }, goal: function () { return 'Reach 65% happiness.'; }, check: function () { return S.city.happiness >= 65; }, prog: function () { return S.city.happiness / 65; }, dur: 1200, reward: { xp: 70, money: 1.5, rp: 20 } },
  { id: 'school', icon: '🎓', title: 'Better Schools', when: function () { return S.city.population > 500 && S.city.education < 40; }, goal: function () { return 'Raise education to 50.'; }, check: function () { return S.city.education >= 50; }, prog: function () { return S.city.education / 50; }, dur: 1500, reward: { rp: 50, xp: 80 } },
  { id: 'crime', icon: '👮', title: 'Safe Streets', when: function () { return S.city.crime > 30 && S.city.population > 200; }, goal: function () { return 'Lower crime below 20.'; }, check: function () { return S.city.crime < 20; }, prog: function () { return clamp((40 - S.city.crime) / 20, 0, 1); }, dur: 1200, reward: { xp: 70, money: 1.5 } },
  { id: 'grow', icon: '📈', title: 'Keep Growing', when: function () { return true; }, target: function () { return Math.round(S.city.population * 1.25 + 30); }, goal: function (q) { return 'Reach ' + fmt(q.target) + ' population.'; }, check: function (q) { return S.city.population >= q.target; }, prog: function (q) { return S.city.population / q.target; }, dur: 1500, reward: { xp: 50, money: 1 } },
  { id: 'earn', icon: '💵', title: 'Revenue Drive', when: function () { return true; }, target: function () { return Math.round(S.statistics.run.revenue + Math.max(2000, (SIM.income || 1) * 400)); }, goal: function (q) { return 'Reach ' + money(q.target) + ' total city revenue.'; }, check: function (q) { return S.statistics.run.revenue >= q.target; }, prog: function (q) { return S.statistics.run.revenue / q.target; }, dur: 900, reward: { xp: 40, rp: 20 } },
  { id: 'tech', icon: '🔬', title: 'Research Push', when: function () { return SIM.rpRate > 0; }, target: function () { return S.technology.unlocked.length + 1; }, goal: function () { return 'Research one new technology.'; }, check: function (q) { return S.technology.unlocked.length >= q.target; }, prog: function () { return 0; }, dur: 1200, reward: { xp: 50, money: 1 } },
  { id: 'megacity', icon: '🌆', title: 'Megacity Ambition', when: function () { return S.p6 && S.p6.mega.era; }, target: function () { return Math.round(S.city.population * 1.15 + 1000); }, goal: function (q) { return 'Reach ' + fmt(q.target) + ' population in the Megacity era.'; }, check: function (q) { return S.city.population >= q.target; }, prog: function (q) { return S.city.population / q.target; }, dur: 2400, reward: { xp: 200, pp: 1, money: 3 } }
];

/* --- SCENARIO OPTIONS --- */
const SCENARIO_WIN = {
  pop: { name: 'Population', vals: [2000, 10000, 50000], fmt: function (v) { return fmt(v) + ' citizens'; }, check: function (v) { return S.city.population >= v; }, prog: function (v) { return S.city.population / v; } },
  money: { name: 'Money', vals: [1e5, 1e6, 1e7], fmt: function (v) { return money(v); }, check: function (v) { return S.money >= v; }, prog: function (v) { return S.money / v; } },
  score: { name: 'City Score', vals: [400, 600, 800], fmt: function (v) { return 'score ' + v; }, check: function (v) { return S.p5.score.cur >= v; }, prog: function (v) { return S.p5.score.cur / v; } },
  level: { name: 'City Level', vals: [8, 12, 16], fmt: function (v) { return 'level ' + v; }, check: function (v) { return cityLevel() >= v; }, prog: function (v) { return cityLevel() / v; } }
};
