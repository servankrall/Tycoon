'use strict';
/* BLOCK CITY TYCOON — DATA — Part 4 city simulation (terrain, resources, products, AI companies, world cities) */
/* ===================== 2b. DATA — PART 4: ULTRA CITY SIMULATION ===================== */
/* Difficulty presets: economy multipliers used by the Economy, Events and Buildings systems */
const DIFFICULTIES = {
  EASY: { name: 'Easy', cost: 0.85, income: 1.25, maint: 0.8, events: 0.6, vol: 0.7, budget: 4000, money: 250, desc: 'Cheaper buildings, more income, calm events.' },
  NORMAL: { name: 'Normal', cost: 1, income: 1, maint: 1, events: 1, vol: 1, budget: 2000, money: 100, desc: 'The intended experience.' },
  HARD: { name: 'Hard', cost: 1.1, income: 0.85, maint: 1.25, events: 1.4, vol: 1.3, budget: 1200, money: 100, desc: 'Higher maintenance, lower income, harsher events.' },
  EXTREME: { name: 'Extreme', cost: 1.3, income: 0.75, maint: 1.4, events: 2, vol: 2, budget: 800, money: 100, dynamic: true, desc: 'Dynamic economy, frequent crises, expensive buildings.' }
};
/* City level 1 → 20 by peak population. Level 20 = GLOBAL METROPOLIS */
const CITY_LEVEL_POP = [0, 20, 50, 100, 180, 300, 500, 800, 1200, 1800, 2600, 3600, 5000, 6800, 9000, 12000, 15500, 19500, 24500, 30000];
const CITY_LEVEL_NAMES = ['Hamlet', 'Village', 'Village', 'Town', 'Town', 'Small City', 'Small City', 'City', 'City', 'Big City', 'Big City', 'Large City', 'Large City',
  'Metropolis', 'Metropolis', 'Megacity', 'Megacity', 'World City', 'World City', 'GLOBAL METROPOLIS'];
const SECONDS_PER_MONTH = 2400;   // economic "month" used to display rents (40 real minutes)

/* Products & raw resources (supply chain) */
const PRODUCTS = {
  iron: { name: 'Iron', icon: '⛏️', base: 1.2, raw: true },
  coal: { name: 'Coal', icon: '🪨', base: 1.0, raw: true },
  oil: { name: 'Oil', icon: '🛢️', base: 1.6, raw: true },
  rare: { name: 'Rare Minerals', icon: '💎', base: 6, raw: true },
  wood: { name: 'Wood', icon: '🌲', base: 0.8, raw: true },
  materials: { name: 'Materials', icon: '🏗️', base: 2.5, rate: 1, inputs: { iron: 0.5, coal: 0.3 }, alt: { wood: 1.0 } },
  food: { name: 'Food', icon: '🍔', base: 2.2, rate: 1.2, inputs: {} },
  electronics: { name: 'Electronics', icon: '📱', base: 9, rate: 0.35, inputs: { rare: 0.4, materials: 0.6 } },
  vehicles: { name: 'Vehicles', icon: '🚗', base: 22, rate: 0.15, inputs: { materials: 2, electronics: 0.8 } },
  fuel: { name: 'Fuel', icon: '⛽', base: 2.8, rate: 1, inputs: { oil: 1 } }
};
const PRODUCT_IDS = Object.keys(PRODUCTS);
/* Natural resource deposits generated procedurally on the map */
const RESOURCE_TYPES = {
  iron: { name: 'Iron', icon: '⛏️', color: '#b5651d', min: 60000, max: 100000, regen: 0 },
  coal: { name: 'Coal', icon: '🪨', color: '#343a40', min: 70000, max: 110000, regen: 0 },
  oil: { name: 'Oil', icon: '🛢️', color: '#111111', min: 80000, max: 120000, regen: 0 },
  rare: { name: 'Rare Minerals', icon: '💎', color: '#9d4edd', min: 20000, max: 40000, regen: 0 },
  wood: { name: 'Wood', icon: '🌲', color: '#2d6a4f', min: 30000, max: 50000, regen: 2 }
};
const RES_IDS = Object.keys(RESOURCE_TYPES);
const TERRAIN = { GRASS: 0, WATER: 1, HILL: 2, ROCK: 3, SAND: 4 };
const TERRAIN_NAMES = ['Grass', 'Water', 'Hill', 'Rock', 'Sand'];
const ZONES = [
  { id: 0, name: 'Unzone', icon: '⬜', color: 'rgba(0,0,0,0)' },
  { id: 1, name: 'Residential', icon: '🟩', color: '#38b000', cats: ['Residential'] },
  { id: 2, name: 'Commercial', icon: '🟦', color: '#3a86ff', cats: ['Commercial', 'Logistics'] },
  { id: 3, name: 'Industrial', icon: '🟥', color: '#ef233c', cats: ['Industry', 'Resources', 'Logistics', 'Waste'] },
  { id: 4, name: 'Special', icon: '🟪', color: '#9d4edd', cats: ['Utilities', 'Services', 'Transport', 'Science', 'Landmarks', 'Leisure', 'Waste'] }
];
const BUILDING_SKINS = [
  { id: 'Industrial', icon: '🧱' },
  { id: 'Modern', icon: '🏢', wall: '#dfe7ef', roof: '#9fb7c9' },
  { id: 'Cyber', icon: '🌆', wall: '#241245', roof: '#3c1f7a', neon: '#ff2bd6' },
  { id: 'Future', icon: '🚀', wall: '#f4f1ea', roof: '#2ec4b6', trim: '#ffd166' }
];

/* --- Part 4 buildings (data-driven, registered through the Buildings system) --- */
[
  { id: 'townhall', name: 'Town Hall', icon: '🏛️', cat: 'Services', sector: 'CIVIC', size: { x: 2, y: 2 }, cost: 0, color: '#f1e3c8', roof: '#b08968', height: 34, public: true, unique: true, hidden: true, noDemolish: true, maint: 0, desc: 'Seat of government. Click to open the City Overview.' },
  { id: 'school', name: 'School', icon: '🏫', cat: 'Science', sector: 'EDUCATION', size: { x: 2, y: 2 }, cost: 6000, color: '#ffb4a2', roof: '#e5989b', height: 24, edu: 300, jobs: 15, maxW: 30, power: -5, water: -3, maint: 1.5, hap: 2, unlock: { pop: 120 }, desc: 'Educates 300 students. Raises worker skill.' },
  { id: 'socialhousing', name: 'Affordable Housing', icon: '🏘️', cat: 'Residential', sector: 'HOUSING', size: { x: 2, y: 2 }, cost: 15000, color: '#cdb4db', roof: '#a2809f', height: 40, housing: 120, quality: 25, rent: 0.02, power: -6, water: -5, maint: 4, unlock: { pop: 300 }, desc: 'City-run low-rent housing. Keeps housing affordable.' },
  { id: 'luxurytower', name: 'Luxury Tower', icon: '🏙️', cat: 'Residential', sector: 'HOUSING', size: { x: 2, y: 2 }, cost: 900000, color: '#e0aaff', roof: '#9d4edd', height: 175, housing: 600, quality: 95, rent: 0.2, unitSize: 10, power: -40, water: -30, neon: true, unlock: { tech: 'c_highrise', pop: 6000 }, desc: 'Penthouses (~$5,000/month). Very high rent.' },
  { id: 'farm', name: 'Farm', icon: '🌾', cat: 'Industry', sector: 'INDUSTRY', size: { x: 2, y: 2 }, cost: 2500, color: '#a7c957', roof: '#6a994e', height: 6, goods: 3, recipes: ['food'], noInputs: true, jobs: 6, maxW: 12, pol: 1, desc: 'Grows food for restaurants.' },
  { id: 'refinery', name: 'Oil Refinery', icon: '⚗️', cat: 'Industry', sector: 'INDUSTRY', size: { x: 2, y: 2 }, cost: 60000, color: '#6c757d', roof: '#adb5bd', height: 36, goods: 4, recipes: ['fuel'], jobs: 30, maxW: 60, power: -15, water: -8, pol: 16, smoke: true, unlock: { pop: 500 }, desc: 'Turns oil into fuel.' },
  { id: 'ironmine', name: 'Iron Mine', icon: '⛏️', cat: 'Resources', sector: 'RESOURCE', size: { x: 2, y: 2 }, cost: 6000, color: '#8d6e63', roof: '#5d4037', height: 18, extract: { type: 'iron', rate: 4 }, jobs: 15, maxW: 30, power: -5, pol: 6, desc: 'Must touch an iron deposit.' },
  { id: 'coalmine', name: 'Coal Mine', icon: '🪨', cat: 'Resources', sector: 'RESOURCE', size: { x: 2, y: 2 }, cost: 5000, color: '#495057', roof: '#212529', height: 18, extract: { type: 'coal', rate: 4 }, jobs: 15, maxW: 30, power: -4, pol: 8, desc: 'Must touch a coal deposit.' },
  { id: 'oilwell', name: 'Oil Well', icon: '🛢️', cat: 'Resources', sector: 'RESOURCE', size: { x: 1, y: 1 }, cost: 12000, color: '#343a40', roof: '#111111', height: 28, extract: { type: 'oil', rate: 3 }, jobs: 6, maxW: 12, power: -4, pol: 5, unlock: { pop: 200 }, desc: 'Must sit on an oil deposit.' },
  { id: 'raremine', name: 'Rare Mineral Mine', icon: '💎', cat: 'Resources', sector: 'RESOURCE', size: { x: 2, y: 2 }, cost: 40000, color: '#7b2cbf', roof: '#3c096c', height: 20, extract: { type: 'rare', rate: 1.5 }, jobs: 25, maxW: 50, power: -10, pol: 6, unlock: { pop: 800 }, desc: 'Must touch a rare mineral deposit.' },
  { id: 'lumbermill', name: 'Lumber Mill', icon: '🪵', cat: 'Resources', sector: 'RESOURCE', size: { x: 2, y: 2 }, cost: 3000, color: '#6f4518', roof: '#99582a', height: 16, extract: { type: 'wood', rate: 4 }, jobs: 8, maxW: 16, pol: 2, desc: 'Must touch a forest (wood) deposit. Wood regrows.' },
  { id: 'waterpump', name: 'Water Pump', icon: '🚿', cat: 'Utilities', sector: 'WATER', size: { x: 1, y: 1 }, cost: 2000, color: '#90e0ef', roof: '#0096c7', height: 14, water: 60, jobs: 2, maxW: 4, power: -3, maint: 0.6, needsWater: true, unlock: { pop: 40 }, desc: '+60 water. Must be next to a river or lake.' },
  { id: 'warehouse', name: 'Warehouse', icon: '📦', cat: 'Logistics', sector: 'LOGISTICS', size: { x: 2, y: 2 }, cost: 8000, color: '#b08968', roof: '#7f5539', height: 22, storage: 10000, trucks: 6, jobs: 10, maxW: 20, power: -4, maint: 2, unlock: { pop: 60 }, desc: 'Stores 10,000 units and runs 6 delivery trucks.' },
  { id: 'fueldepot', name: 'Fuel Depot', icon: '🛢️', cat: 'Logistics', sector: 'LOGISTICS', size: { x: 2, y: 2 }, cost: 20000, color: '#e9c46a', roof: '#bc6c25', height: 20, storage: 3000, trucks: 4, fuelServe: 4, jobs: 8, maxW: 16, power: -3, pol: 2, maint: 4, unlock: { pop: 300 }, desc: 'Fuel storage, 4 tankers, supplies diesel for trucks.' },
  { id: 'gasstation', name: 'Gas Station', icon: '⛽', cat: 'Logistics', sector: 'FUEL', size: { x: 1, y: 1 }, cost: 4000, color: '#e63946', roof: '#f1faee', height: 12, fuelServe: 3, jobs: 3, maxW: 6, power: -1, pol: 1, unlock: { pop: 80 }, desc: 'Sells gasoline & diesel to vehicles.' },
  { id: 'evcharger', name: 'EV Charging Station', icon: '🔌', cat: 'Logistics', sector: 'FUEL', size: { x: 1, y: 1 }, cost: 10000, color: '#06d6a0', roof: '#118ab2', height: 10, evCharge: 5, jobs: 1, maxW: 2, power: -10, unlock: { tech: 't_ev' }, desc: 'Charges electric vehicles. More EVs = less pollution.' },
  { id: 'garbage', name: 'Garbage Station', icon: '🗑️', cat: 'Waste', sector: 'WASTE', size: { x: 1, y: 1 }, cost: 2500, color: '#6c757d', roof: '#495057', height: 14, wasteCap: 8, jobs: 4, maxW: 8, pol: 2, maint: 0.5, unlock: { pop: 60 }, desc: 'Collects 8 waste/s.' },
  { id: 'recycling', name: 'Recycling Plant', icon: '♻️', cat: 'Waste', sector: 'WASTE', size: { x: 2, y: 2 }, cost: 30000, color: '#2a9d8f', roof: '#1d6f66', height: 24, wasteCap: 15, recycle: true, jobs: 15, maxW: 30, power: -8, maint: 6, unlock: { tech: 'env_recycle' }, desc: 'Turns 15 waste/s into materials.' },
  { id: 'wastecenter', name: 'Waste Processing Center', icon: '🔥', cat: 'Waste', sector: 'WASTE', size: { x: 3, y: 3 }, cost: 250000, color: '#6d597a', roof: '#355070', height: 34, wasteCap: 60, power: 30, fuel: 0, jobs: 40, maxW: 80, pol: 8, maint: 30, smoke: true, unlock: { pop: 3000 }, desc: 'Burns 60 waste/s and generates +30 power.' },
  { id: 'port', name: 'Port', icon: '🚢', cat: 'Transport', sector: 'TRANSPORT', size: { x: 4, y: 3 }, cost: 5000000, color: '#adb5bd', roof: '#495057', height: 18, trade: 250, transit: 500, tour: 800, jobs: 200, maxW: 400, power: -60, maint: 400, unique: true, needsSea: true, unlock: { cityLevel: 20 }, desc: 'End-game. Ships, imports & exports. Must touch sea-connected water.' }
].forEach(registerBuilding);

/* AI companies: developers build housing, rivals compete for market share */
const AI_DEFS = [
  { id: 'dev_block', name: 'BLOCK DEVELOPMENT', icon: '🏗️', kind: 'dev', zone: 1, color: '#f4a261', sectors: ['HOUSING'] },
  { id: 'dev_sky', name: 'SKYLINE ESTATES', icon: '🌇', kind: 'dev', zone: 1, color: '#8ecae6', sectors: ['HOUSING'] },
  { id: 'ai_burger', name: 'BURGER KINGDOM', icon: '🍟', kind: 'rival', zone: 2, color: '#e63946', sectors: ['FOOD'] },
  { id: 'ai_mart', name: 'MEGAMART GROUP', icon: '🛒', kind: 'rival', zone: 2, color: '#2a9d8f', sectors: ['SHOPPING', 'ENTERTAINMENT'] },
  { id: 'ai_crown', name: 'CROWN BANK', icon: '👑', kind: 'rival', zone: 2, color: '#ffd166', sectors: ['FINANCE'] },
  { id: 'ai_nova', name: 'NOVATECH', icon: '🛰️', kind: 'rival', zone: 2, color: '#4361ee', sectors: ['TECHNOLOGY'] },
  { id: 'ai_titan', name: 'TITAN INDUSTRIES', icon: '⚙️', kind: 'rival', zone: 3, color: '#6c757d', sectors: ['INDUSTRY'] }
];
const MARKET_SECTORS = ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'FINANCE', 'TECHNOLOGY', 'INDUSTRY', 'HOUSING'];
const AI_BUILD_OPTIONS = {
  HOUSING: [['house', 0], ['apartment', 1], ['condo', 2], ['skyscraper', 3], ['luxurytower', 3]],
  FOOD: [['foodstand', 0], ['restaurant', 1], ['foodcourt', 2]],
  SHOPPING: [['shop', 0], ['supermarket', 1], ['mall', 2]],
  ENTERTAINMENT: [['nightclub', 0], ['cinema', 1]],
  FINANCE: [['bank', 1], ['stockexchange', 3]],
  TECHNOLOGY: [['office', 1], ['techcampus', 3]],
  INDUSTRY: [['workshop', 0], ['farm', 0], ['factory', 1], ['warehouse', 1], ['megafactory', 2]]
};

/* Other cities for diplomacy, trade and the world map (fully simulated) */
const WORLD_CITIES = [
  { id: 'neon', name: 'Neon Valley', icon: '🌃', pop: 180000, x: 0.74, y: 0.28, exports: ['electronics', 'rare'], imports: ['food', 'materials'], port: true, airport: true, rel: 20 },
  { id: 'aurora', name: 'Port Aurora', icon: '⚓', pop: 95000, x: 0.28, y: 0.7, exports: ['oil', 'fuel', 'food'], imports: ['vehicles', 'electronics'], port: true, airport: false, rel: 10 },
  { id: 'iron', name: 'Iron Ridge', icon: '⛰️', pop: 60000, x: 0.58, y: 0.78, exports: ['iron', 'coal', 'materials'], imports: ['fuel', 'food'], port: false, airport: true, rel: 0 },
  { id: 'sun', name: 'Sun Harbor', icon: '🌅', pop: 140000, x: 0.18, y: 0.26, exports: ['wood', 'food'], imports: ['vehicles', 'materials'], port: true, airport: true, rel: -10 },
  { id: 'frost', name: 'Frosthold', icon: '❄️', pop: 40000, x: 0.88, y: 0.66, exports: ['coal', 'wood'], imports: ['electronics', 'fuel'], port: true, airport: false, rel: -35 }
];
const HOME_POS = { x: 0.48, y: 0.46 };

/* Dynamic events — several offer the player a decision */
const DYN_EVENTS = [
  { id: 'boom', name: 'Economic Boom', icon: '📈', dur: 180, good: true, desc: 'Revenue +15%, growth +20%.' },
  { id: 'recession', name: 'Recession', icon: '📉', dur: 240, desc: 'Revenue -15%, fewer jobs.', decision: true },
  { id: 'supplycrisis', name: 'Supply Crisis', icon: '🚢', dur: 200, desc: 'Import prices ×1.8, production -20%.', decision: true },
  { id: 'energyshortage', name: 'Energy Shortage', icon: '⚡', dur: 240, desc: 'Power production -25%.', decision: true },
  { id: 'expo', name: 'International Expo', icon: '🏆', dur: 200, good: true, desc: 'The world wants to visit!', decision: true },
  { id: 'megafest', name: 'Mega Festival', icon: '🎉', dur: 150, good: true, desc: 'Tourism +40%, happiness +10.' },
  { id: 'factoryfire', name: 'Factory Fire', icon: '🔥', dur: 40, desc: 'An industrial building is burning!', decision: true },
  { id: 'flood', name: 'Flood', icon: '🌊', dur: 60, desc: 'Rivers overflow near low areas.' }
];

/* Space program stages (require the Space Center) */
const SPACE_STAGES = [
  { id: 'satellite', name: 'Satellite', icon: '🛰️', rp: 2000, cost: 5e6, desc: 'Research +10%, disaster mitigation +10%.' },
  { id: 'orbital', name: 'Orbital Station', icon: '🛸', rp: 5000, cost: 2e7, desc: 'All revenue +15%, reputation +5.' },
  { id: 'moon', name: 'Moon Mining', icon: '🌕', rp: 12000, cost: 8e7, desc: '+4 rare minerals/s and +$2,000/s to the budget.' },
  { id: 'mars', name: 'Mars Program', icon: '🔴', rp: 30000, cost: 3e8, desc: 'Revenue +25%, tourism +20%, reputation +10.' }
];

/* Part 4 quests & achievements */
SIDE_QUESTS.splice(6, 0,
  { id: 'q_zone', desc: 'Paint 20 tiles of zoning', reward: { money: 300 }, check: function () { return (S.city.zonedByPlayer || 0) >= 20; } },
  { id: 'q_garbage', desc: 'Build a Garbage Station', reward: { money: 1000 }, check: function () { return countBuilt('garbage') >= 1; } });
SIDE_QUESTS.splice(14, 0,
  { id: 'q_school', desc: 'Build a School', reward: { money: 3000, rp: 15 }, check: function () { return countBuilt('school') >= 1; } },
  { id: 'q_warehouse', desc: 'Build a Warehouse', reward: { money: 4000 }, check: function () { return countBuilt('warehouse') >= 1; } },
  { id: 'q_mine', desc: 'Build a resource extraction facility', reward: { money: 5000 }, check: function () { return S.buildings.list.some(function (b) { return b.built && BUILDINGS[b.type].extract && !isAI(b); }); } },
  { id: 'q_contract', desc: 'Complete a supply contract', reward: { money: 10000 }, check: function () { return S.contracts.completed >= 1; } });
SIDE_QUESTS.push(
  { id: 'q_share', desc: 'Reach 40% market share in any sector', reward: { money: 200000 }, check: function () { return bestPlayerShare() >= 0.4; } },
  { id: 'q_lv15', desc: 'Reach City Level 15', reward: { money: 2000000, rp: 500 }, check: function () { return cityLevel() >= 15; } });
ACHIEVEMENTS.push(
  { id: 'a_zoner', name: 'Urban Designer', icon: '🗺️', desc: 'Zone 200 tiles.', check: function () { return (S.city.zonedByPlayer || 0) >= 200; } },
  { id: 'a_trader2', name: 'Trade Empire', icon: '🚢', desc: 'Export goods worth $1M.', check: function () { return S.trade.exportTotal >= 1e6; } },
  { id: 'a_contracts', name: 'Reliable Partner', icon: '🤝', desc: 'Complete 5 contracts.', check: function () { return S.contracts.completed >= 5; } },
  { id: 'a_acquire', name: 'Hostile Takeover', icon: '🦈', desc: 'Acquire a rival company.', check: function () { return AI_DEFS.some(function (a) { return S.ai[a.id] && S.ai[a.id].acquired; }); } },
  { id: 'a_share', name: 'Market Leader', icon: '🥇', desc: 'Hold 60% share of a market.', check: function () { return bestPlayerShare() >= 0.6; } },
  { id: 'a_edu', name: 'City of Scholars', icon: '🎓', desc: 'Reach 80 education.', check: function () { return S.city.education >= 80; } },
  { id: 'a_rep', name: 'World Famous', icon: '⭐', desc: 'Reach 85 city reputation.', check: function () { return S.city.reputation >= 85; } },
  { id: 'a_global', name: 'Global Metropolis', icon: '🌆', desc: 'Reach City Level 20.', check: function () { return cityLevel() >= 20; } },
  { id: 'a_mars', name: 'Red Planet', icon: '🔴', desc: 'Complete the Mars Program.', check: function () { return S.space.stage >= 4; } },
  { id: 'a_friends', name: 'Diplomat', icon: '🕊️', desc: 'Be Friendly with 3 cities.', check: function () { return WORLD_CITIES.filter(function (c) { return relationOf(c.id) > 30; }).length >= 3; } }
);
