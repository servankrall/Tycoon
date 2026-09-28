'use strict';
/* BLOCK CITY TYCOON — CONFIG & DATA — constants, quality presets, buildings, technologies, companies, quests, achievements */
/* =======================================================================
   BLOCK CITY TYCOON — MASTER SIMULATION ENGINE (Part 6)
   -----------------------------------------------------------------------
   Architecture (all in this single file):
     1. CONFIG ............ constants, quality presets, debug switch
     2. DATA .............. buildings, technologies, companies, quests,
                            achievements, events, prestige upgrades
     3. STATE & SAVE ...... versioned JSON game state, migration, validation
     4. MAP ............... tile grid, roads, placement, pathfinding
     5. ECONOMY SIM ....... supply/demand, labor, power, water, pollution,
                            crime, tourism, population, finances
     6. EVENTS ............ crises, disasters, global events, advisor
     7. AGENTS ............ citizen AI (utility state machine) & traffic AI
     8. RENDER ............ canvas world renderer, particles, weather, FX
     9. UI ................ panels, modals, interiors, tutorial
    10. AUDIO ............. Web Audio synthesized SFX & music
    11. LOOP / INPUT ...... main loop, camera, touch, adaptive performance
    12. DEBUG ............. developer tools (only when DEBUG = true)
   ======================================================================= */

/* ============================== 1. CONFIG ============================== */
const DEBUG = /[?&]debug\b/.test(location.search);   // open with ?debug for the debug HUD + dev console functions
const SAVE_VERSION = 7;
const SAVE_KEY = 'bct_pro_save';
const SAVE_BACKUP_KEY = 'bct_pro_save_backup';
const LEGACY_SAVE_KEYS = ['blockCityTycoonSave_v1'];
const TIME_SCALE = 72;               // 1 real second = 72 game seconds (1 game day = 20 real minutes)
const SEASON_DAYS = 2;               // game days per season
const TILE = 32;                     // world units per map tile
const TILE_METERS = 80;              // for coverage display ("500m")
const MAX_LEVEL = 10;
const MAX_OFFLINE_SEC = 4 * 3600;    // offline progress is capped (anti-exploit)
const OFFLINE_EFFICIENCY = 0.5;
const MAX_TAX = 30;
const GOODS_PRICE = 2.5;             // domestic goods price
const EXPORT_PRICE = 1.5;            // export price for surplus goods
const RENT_PER_CITIZEN = 0.07;       // $/s per housed citizen
const WAGE_PER_WORKER = 0.45;        // $/s average citizen wage (taxable)
const TOURIST_SPEND = 0.11;          // $/s per tourist
const FARE_PER_RIDER = 0.035;        // $/s per transit rider
const MONEY_CAP = 1e15;

const QUALITY_PRESETS = {
  LOW:    { npc: 24,  veh: 14,  part: 80,   glow: false, shadow: false, weather: 0.35, trafficHz: 12, windows: false },
  MEDIUM: { npc: 60,  veh: 32,  part: 240,  glow: false, shadow: true,  weather: 0.6,  trafficHz: 20, windows: true },
  HIGH:   { npc: 120, veh: 60,  part: 500,  glow: true,  shadow: true,  weather: 0.85, trafficHz: 30, windows: true },
  ULTRA:  { npc: 200, veh: 100, part: 1000, glow: true,  shadow: true,  weather: 1,    trafficHz: 60, windows: true }
};
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 820;

const SECTORS = ['FOOD', 'SHOPPING', 'ENTERTAINMENT', 'TRANSPORT', 'HOUSING', 'ENERGY', 'FINANCE', 'TECHNOLOGY'];
const SECTOR_ICONS = { FOOD: '🍔', SHOPPING: '🛍️', ENTERTAINMENT: '🎉', TRANSPORT: '🚌', HOUSING: '🏠', ENERGY: '⚡', FINANCE: '🏦', TECHNOLOGY: '💻', INDUSTRY: '🏭' };
const SEASONS = [
  { id: 'spring', name: 'Spring', icon: '🌸', grass: '#5fae4e', grass2: '#58a348', power: 1.0,  tour: 1.0, hap: 1,  growth: 1.05 },
  { id: 'summer', name: 'Summer', icon: '☀️', grass: '#79b843', grass2: '#70ad3d', power: 1.15, tour: 1.2, hap: 2,  growth: 1.0 },
  { id: 'autumn', name: 'Autumn', icon: '🍂', grass: '#a3a04a', grass2: '#989442', power: 1.0,  tour: 0.95, hap: 0, growth: 1.0 },
  { id: 'winter', name: 'Winter', icon: '❄️', grass: '#dfe8f0', grass2: '#d3dde8', power: 1.25, tour: 0.8, hap: -2, growth: 0.9 }
];
const CITY_TIERS = [
  { pop: 0, name: 'Village' }, { pop: 100, name: 'Town' }, { pop: 500, name: 'Small City' },
  { pop: 2000, name: 'City' }, { pop: 6000, name: 'Large City' }, { pop: 12000, name: 'Metropolis' },
  { pop: 25000, name: 'Mega City' }
];
// Unlocked square sizes per expansion level, per map size (40 = Small, 48 = NG+, 52 = Medium, 64 = Large)
const EXPANSION_TABLE = { 40: [14, 22, 30, 40], 48: [14, 22, 30, 40, 48], 52: [18, 28, 38, 46, 52], 64: [22, 34, 46, 56, 64] };
const EXPANSION_COSTS = [0, 5000, 60000, 800000, 12000000];
const MAP_SIZES = [{ id: 40, name: 'Small (40×40)' }, { id: 52, name: 'Medium (52×52)' }, { id: 64, name: 'Large (64×64)' }];

/* =============================== 2. DATA =============================== */
const CATEGORIES = [
  { id: 'Residential', icon: '🏠' }, { id: 'Commercial', icon: '🛍️' }, { id: 'Industry', icon: '🏭' },
  { id: 'Resources', icon: '⛏️' }, { id: 'Logistics', icon: '📦' }, { id: 'Utilities', icon: '⚡' },
  { id: 'Waste', icon: '♻️' }, { id: 'Services', icon: '🚒' }, { id: 'Transport', icon: '🚇' },
  { id: 'Leisure', icon: '🌳' }, { id: 'Science', icon: '🎓' }, { id: 'Landmarks', icon: '🗼' }
];
/* City-owned (public) buildings are paid from the CITY BUDGET, everything else from PLAYER MONEY */
const PUBLIC_CATS = ['Utilities', 'Waste', 'Services', 'Science', 'Landmarks'];
const PUBLIC_IDS = ['tree', 'park', 'plaza', 'busstop', 'metro', 'trainstation', 'airport', 'port', 'socialhousing', 'townhall', 'museum'];

/* Building definitions.
   rev: $/s base revenue (lvl 1, full efficiency, balanced demand)
   cap: sector capacity (supply units)   workers/maxW: default & max staff
   power/water: +generation / -consumption   pol: pollution (+/-)
   goods: goods production/s (industry)  goodsUse: goods consumption/s
   cover: service coverage radius in tiles   transit: riders capacity
   tour: tourist attraction   rp: research points / s
   unlock: requirements  (pop, tech, company+lvl, ng, exp)            */
const BUILDING_LIST = [
  // ---------- Residential ----------
  { id: 'house', name: 'Small House', icon: '🏠', cat: 'Residential', sector: 'HOUSING', w: 1, h: 1, cost: 50, color: '#e76f51', roof: '#c4452d', height: 14, housing: 6, quality: 35, rent: 0.06, desc: 'Cozy home for 6 citizens. Needs no utilities.' },
  { id: 'apartment', name: 'Apartment', icon: '🏢', cat: 'Residential', sector: 'HOUSING', w: 1, h: 1, cost: 1200, color: '#f4a261', roof: '#d9823d', height: 34, housing: 40, quality: 50, rent: 0.07, power: -3, water: -3, unlock: { pop: 40 }, desc: 'Mid-rise housing for 40.' },
  { id: 'condo', name: 'Condo Tower', icon: '🏬', cat: 'Residential', sector: 'HOUSING', w: 2, h: 2, cost: 20000, color: '#8ecae6', roof: '#5aa3c7', height: 62, housing: 260, quality: 70, rent: 0.09, power: -14, water: -12, unlock: { tech: 'c_zoning', pop: 300 }, desc: 'Dense modern living.' },
  { id: 'skyscraper', name: 'Residential Skyscraper', icon: '🌆', cat: 'Residential', sector: 'HOUSING', w: 2, h: 2, cost: 350000, color: '#577590', roof: '#3d5a75', height: 135, housing: 1400, quality: 80, rent: 0.1, unitSize: 4, power: -50, water: -40, unlock: { tech: 'c_highrise', pop: 2500 }, desc: 'A true skyscraper. Houses 1,400.' },

  // ---------- Commercial ----------
  { id: 'foodstand', name: 'Food Stand', icon: '🌭', cat: 'Commercial', sector: 'FOOD', w: 1, h: 1, cost: 120, color: '#ffb703', roof: '#e63946', height: 10, rev: 1.0, cap: 15, workers: 2, maxW: 4, goodsUse: 0.1, interior: 'restaurant', desc: 'Quick bites. Serves 15.' },
  { id: 'restaurant', name: 'Restaurant', icon: '🍔', cat: 'Commercial', sector: 'FOOD', w: 1, h: 1, cost: 1800, color: '#ef476f', roof: '#b7294e', height: 22, rev: 7, cap: 150, workers: 8, maxW: 16, power: -3, water: -3, goodsUse: 0.6, interior: 'restaurant', unlock: { pop: 50 }, desc: 'Full-service dining.' },
  { id: 'foodcourt', name: 'Food Court', icon: '🍱', cat: 'Commercial', sector: 'FOOD', w: 2, h: 2, cost: 45000, color: '#fb8500', roof: '#c96600', height: 34, rev: 120, cap: 3200, workers: 40, maxW: 80, power: -12, water: -10, goodsUse: 6, interior: 'restaurant', unlock: { pop: 1500 }, desc: 'Dozens of vendors under one roof.' },
  { id: 'gourmethq', name: 'Block Foods HQ', icon: '👨‍🍳', cat: 'Commercial', sector: 'FOOD', w: 2, h: 2, cost: 250000, color: '#d62828', roof: '#9d0208', height: 70, rev: 620, cap: 14000, workers: 90, maxW: 180, power: -30, water: -20, goodsUse: 20, interior: 'restaurant', unlock: { company: 'foods', lvl: 3 }, desc: 'Company flagship. Exclusive to BLOCK FOODS Lv3.' },
  { id: 'shop', name: 'Shop', icon: '🛒', cat: 'Commercial', sector: 'SHOPPING', w: 1, h: 1, cost: 500, color: '#2a9d8f', roof: '#1f776c', height: 18, rev: 2.2, cap: 30, workers: 3, maxW: 8, power: -2, water: -1, goodsUse: 0.5, unlock: { pop: 10 }, desc: 'Sells everyday goods.' },
  { id: 'supermarket', name: 'Supermarket', icon: '🏪', cat: 'Commercial', sector: 'SHOPPING', w: 2, h: 2, cost: 9000, color: '#43aa8b', roof: '#2f8068', height: 24, rev: 32, cap: 850, workers: 18, maxW: 36, power: -8, water: -3, goodsUse: 4, unlock: { pop: 250 }, desc: 'Large store, needs goods.' },
  { id: 'mall', name: 'Mall', icon: '🛍️', cat: 'Commercial', sector: 'SHOPPING', w: 2, h: 2, cost: 70000, color: '#9b5de5', roof: '#7338c2', height: 50, rev: 200, cap: 4800, workers: 70, maxW: 140, power: -25, water: -10, goodsUse: 22, unlock: { pop: 1500 }, desc: 'Shopping paradise.' },
  { id: 'nightclub', name: 'Nightclub', icon: '🪩', cat: 'Commercial', sector: 'ENTERTAINMENT', w: 1, h: 1, cost: 3000, color: '#3a0ca3', roof: '#7209b7', height: 20, rev: 12, cap: 260, workers: 6, maxW: 12, power: -4, water: -2, neon: true, unlock: { pop: 150 }, desc: 'Neon nights and loud music.' },
  { id: 'cinema', name: 'Cinema', icon: '🎬', cat: 'Commercial', sector: 'ENTERTAINMENT', w: 1, h: 1, cost: 7500, color: '#6a4c93', roof: '#4a2f70', height: 26, rev: 28, cap: 620, workers: 12, maxW: 24, power: -6, water: -2, neon: true, unlock: { pop: 400 }, desc: 'Blockbusters every night.' },
  { id: 'office', name: 'Office', icon: '💼', cat: 'Commercial', sector: 'TECHNOLOGY', w: 1, h: 1, cost: 10000, color: '#4895ef', roof: '#2f6fc0', height: 46, rev: 30, cap: 420, workers: 30, maxW: 60, power: -8, water: -3, interior: 'office', unlock: { pop: 300 }, desc: 'Tech & services jobs.' },
  { id: 'techcampus', name: 'Tech Campus', icon: '💻', cat: 'Commercial', sector: 'TECHNOLOGY', w: 2, h: 2, cost: 220000, color: '#4361ee', roof: '#2b44c2', height: 70, rev: 520, cap: 6500, workers: 150, maxW: 300, power: -40, water: -12, interior: 'office', unlock: { tech: 'b_tech', pop: 2000 }, desc: 'Silicon block valley.' },
  { id: 'datacenter', name: 'Block Tech Data Center', icon: '🖥️', cat: 'Commercial', sector: 'TECHNOLOGY', w: 2, h: 2, cost: 600000, color: '#3f37c9', roof: '#231e8a', height: 44, rev: 1500, cap: 16000, workers: 120, maxW: 240, power: -120, water: -30, interior: 'office', unlock: { company: 'tech', lvl: 3 }, desc: 'Exclusive to BLOCK TECH Lv3.' },
  { id: 'bank', name: 'Bank', icon: '🏦', cat: 'Commercial', sector: 'FINANCE', w: 1, h: 1, cost: 25000, color: '#06d6a0', roof: '#04a57b', height: 40, rev: 60, cap: 1600, workers: 10, maxW: 25, power: -5, water: -2, interior: 'bank', unlock: { pop: 500 }, desc: 'Loans, deposits, and a vault.' },
  { id: 'stockexchange', name: 'Stock Exchange', icon: '📊', cat: 'Commercial', sector: 'FINANCE', w: 2, h: 2, cost: 450000, color: '#118ab2', roof: '#0b6384', height: 60, rev: 900, cap: 22000, workers: 80, maxW: 160, power: -25, water: -8, interior: 'bank', unlock: { tech: 'b_finance', pop: 5000 }, desc: 'The financial heart of the city.' },
  { id: 'bankhq', name: 'Block Bank Tower', icon: '💰', cat: 'Commercial', sector: 'FINANCE', w: 2, h: 2, cost: 1500000, color: '#2ec4b6', roof: '#1a8f84', height: 150, rev: 3200, cap: 70000, workers: 160, maxW: 320, power: -60, water: -20, interior: 'bank', unlock: { company: 'bank', lvl: 3 }, desc: 'Exclusive to BLOCK BANK Lv3.' },

  // ---------- Industry ----------
  { id: 'workshop', name: 'Workshop', icon: '🔧', cat: 'Industry', sector: 'INDUSTRY', w: 1, h: 1, cost: 80, color: '#8d99ae', roof: '#6c7689', height: 16, goods: 1.2, recipes: ['materials'], noInputs: true, workers: 2, maxW: 5, pol: 2, interior: 'factory', desc: 'Basic production machine. Makes goods. Needs no power.' },
  { id: 'factory', name: 'Factory', icon: '🏭', cat: 'Industry', sector: 'INDUSTRY', w: 2, h: 2, cost: 4500, color: '#e07a5f', roof: '#b25a42', height: 32, goods: 12, recipes: ['food', 'materials', 'electronics', 'vehicles'], workers: 20, maxW: 40, power: -10, water: -4, pol: 10, interior: 'factory', smoke: true, unlock: { pop: 40 }, desc: 'Mass production of goods.' },
  { id: 'megafactory', name: 'Automated Plant', icon: '🤖', cat: 'Industry', sector: 'INDUSTRY', w: 2, h: 2, cost: 140000, color: '#bc4749', roof: '#8a3032', height: 40, goods: 170, recipes: ['materials', 'food', 'electronics', 'vehicles'], workers: 60, maxW: 120, power: -40, water: -15, pol: 22, interior: 'factory', smoke: true, unlock: { tech: 'automation' }, desc: 'Robotic production line.' },
  { id: 'roboticsplant', name: 'Block Robotics Plant', icon: '🦾', cat: 'Industry', sector: 'INDUSTRY', w: 3, h: 3, cost: 900000, color: '#9a031e', roof: '#6a0215', height: 46, goods: 950, recipes: ['electronics', 'vehicles', 'materials', 'food'], workers: 120, maxW: 240, power: -120, water: -30, pol: 20, interior: 'factory', smoke: true, unlock: { company: 'industries', lvl: 3 }, desc: 'Exclusive to BLOCK INDUSTRIES Lv3.' },

  // ---------- Utilities ----------
  { id: 'smallgen', name: 'Small Generator', icon: '⚡', cat: 'Utilities', sector: 'ENERGY', w: 1, h: 1, cost: 150, color: '#f4c430', roof: '#c99a14', height: 14, power: 12, workers: 1, maxW: 2, pol: 4, fuel: 0.02, smoke: true, desc: '+12 power. Burns fuel.' },
  { id: 'powerplant', name: 'Power Plant', icon: '🏭', cat: 'Utilities', sector: 'ENERGY', w: 2, h: 2, cost: 10000, color: '#6c757d', roof: '#495057', height: 40, power: 160, workers: 12, maxW: 24, pol: 14, fuel: 0.015, smoke: true, unlock: { pop: 80 }, desc: '+160 power. Coal-fired.' },
  { id: 'solar', name: 'Solar Plant', icon: '☀️', cat: 'Utilities', sector: 'ENERGY', w: 2, h: 2, cost: 28000, color: '#1d3557', roof: '#274c77', height: 6, power: 100, workers: 3, maxW: 6, pol: 0, fuel: 0, unlock: { tech: 'solar' }, desc: '+100 clean power.' },
  { id: 'wind', name: 'Wind Farm', icon: '🌬️', cat: 'Utilities', sector: 'ENERGY', w: 2, h: 2, cost: 40000, color: '#a8dadc', roof: '#7fb8ba', height: 8, power: 140, workers: 4, maxW: 8, pol: 0, fuel: 0, unlock: { tech: 'wind' }, desc: '+140 clean power.' },
  { id: 'nuclear', name: 'Nuclear Plant', icon: '☢️', cat: 'Utilities', sector: 'ENERGY', w: 3, h: 3, cost: 550000, color: '#adb5bd', roof: '#868e96', height: 52, power: 2500, workers: 60, maxW: 120, pol: 3, fuel: 0.004, unlock: { tech: 'nuclear' }, desc: '+2,500 power.' },
  { id: 'fusion', name: 'Fusion Reactor', icon: '🔆', cat: 'Utilities', sector: 'ENERGY', w: 3, h: 3, cost: 4000000, color: '#7b2cbf', roof: '#5a189a', height: 58, power: 10000, workers: 80, maxW: 160, pol: 0, fuel: 0.001, neon: true, unlock: { tech: 'fusion' }, desc: '+10,000 limitless power.' },
  { id: 'watertower', name: 'Water Tower', icon: '🚰', cat: 'Utilities', sector: 'WATER', w: 1, h: 1, cost: 200, color: '#48cae4', roof: '#0096c7', height: 30, water: 18, maint: 0.08, desc: '+18 water.' },
  { id: 'waterplant', name: 'Water Plant', icon: '💧', cat: 'Utilities', sector: 'WATER', w: 2, h: 2, cost: 12000, color: '#00b4d8', roof: '#0077b6', height: 18, water: 220, workers: 8, maxW: 16, power: -10, maint: 2, unlock: { pop: 150 }, desc: '+220 water.' },
  { id: 'megawater', name: 'Mega Water Plant', icon: '🌊', cat: 'Utilities', sector: 'WATER', w: 3, h: 3, cost: 350000, color: '#0096c7', roof: '#023e8a', height: 24, water: 2600, workers: 30, maxW: 60, power: -60, maint: 20, unlock: { tech: 'c_water' }, desc: '+2,600 water.' },

  // ---------- Services ----------
  { id: 'fire', name: 'Fire Station', icon: '🚒', cat: 'Services', sector: 'SERVICE', service: 'fire', w: 1, h: 1, cost: 3500, color: '#d62828', roof: '#9d0208', height: 22, cover: 6, workers: 10, maxW: 20, power: -3, water: -2, maint: 1.2, unlock: { pop: 80 }, desc: 'Fights fires, reduces disaster damage.' },
  { id: 'police', name: 'Police Station', icon: '🚓', cat: 'Services', sector: 'SERVICE', service: 'police', w: 1, h: 1, cost: 4500, color: '#1d4ed8', roof: '#1e3a8a', height: 22, cover: 6, workers: 12, maxW: 24, power: -3, water: -1, maint: 1.5, unlock: { pop: 80 }, desc: 'Reduces crime in its coverage area.' },
  { id: 'hospital', name: 'Hospital', icon: '🏥', cat: 'Services', sector: 'SERVICE', service: 'health', w: 2, h: 2, cost: 18000, color: '#f1faee', roof: '#e63946', height: 38, cover: 9, workers: 30, maxW: 60, power: -10, water: -8, maint: 5, interior: 'office', unlock: { pop: 250 }, desc: 'Healthcare & ambulances.' },

  // ---------- Transport ----------
  { id: 'busstop', name: 'Bus Stop', icon: '🚏', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 800, color: '#ffd166', roof: '#e0ad3a', height: 8, transit: 150, workers: 2, maxW: 4, maint: 0.3, unlock: { pop: 60 }, desc: 'Buses run between stops. -Traffic.' },
  { id: 'taxi', name: 'Taxi Depot', icon: '🚕', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 5000, color: '#fcbf49', roof: '#d9941f', height: 14, transit: 120, workers: 8, maxW: 16, maint: 2, unlock: { pop: 300 }, desc: 'Taxi fleet. Earns fares.' },
  { id: 'metro', name: 'Metro Station', icon: '🚇', cat: 'Transport', sector: 'TRANSPORT', w: 1, h: 1, cost: 35000, color: '#e5383b', roof: '#a4161a', height: 12, transit: 1500, workers: 12, maxW: 24, power: -15, maint: 15, unlock: { tech: 'metro' }, desc: 'Underground rail. Attracts residents.' },
  { id: 'trainstation', name: 'Train Station', icon: '🚆', cat: 'Transport', sector: 'TRANSPORT', w: 2, h: 2, cost: 140000, color: '#bc6c25', roof: '#8a4d17', height: 30, transit: 4000, workers: 30, maxW: 60, power: -25, maint: 60, unlock: { tech: 'rail' }, desc: 'Regional rail. Better export prices.' },
  { id: 'airport', name: 'International Airport', icon: '✈️', cat: 'Transport', sector: 'TRANSPORT', w: 6, h: 4, cost: 2500000, color: '#ced4da', roof: '#adb5bd', height: 22, transit: 3000, tour: 3000, workers: 300, maxW: 600, power: -150, water: -80, pol: 12, maint: 900, unique: true, unlock: { tech: 'aviation', pop: 5000, exp: 3 }, desc: 'End-game hub. Tourists ×1.8, growth ↑, revenue ↑.' },

  // ---------- Leisure / Tourism ----------
  { id: 'tree', name: 'Tree', icon: '🌳', cat: 'Leisure', sector: 'NONE', w: 1, h: 1, cost: 10, color: '#2d6a4f', roof: '#40916c', height: 16, pol: -0.8, noRoad: true, desc: 'Absorbs pollution.' },
  { id: 'park', name: 'Park', icon: '🌷', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 1, h: 1, cost: 40, color: '#52b788', roof: '#74c69d', height: 2, cap: 25, pol: -3, hap: 4, maint: 0.05, noRoad: true, desc: 'Happiness +, pollution -.' },
  { id: 'plaza', name: 'Fountain Plaza', icon: '⛲', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 2, h: 2, cost: 6000, color: '#b7e4c7', roof: '#95d5b2', height: 3, cap: 320, pol: -6, hap: 10, maint: 1, noRoad: true, unlock: { pop: 200 }, desc: 'Big happiness boost.' },
  { id: 'hotel', name: 'Hotel', icon: '🏨', cat: 'Leisure', sector: 'TOURISM', w: 2, h: 2, cost: 70000, color: '#e9c46a', roof: '#c9a23f', height: 64, tour: 400, workers: 40, maxW: 80, power: -15, water: -15, maint: 10, unlock: { tourism: true }, desc: 'Houses tourists. Tourism +.' },
  { id: 'museum', name: 'Museum', icon: '🏛️', cat: 'Leisure', sector: 'TOURISM', w: 2, h: 2, cost: 110000, color: '#f8f9fa', roof: '#dee2e6', height: 30, tour: 700, workers: 20, maxW: 40, power: -10, maint: 12, hap: 4, unlock: { tourism: true }, desc: 'Culture attracts tourists.' },
  { id: 'stadium', name: 'Stadium', icon: '🏟️', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 3, h: 3, cost: 450000, color: '#90be6d', roof: '#577590', height: 26, tour: 1500, rev: 300, cap: 12000, workers: 80, maxW: 160, power: -30, water: -10, unlock: { tourism: true, pop: 4000 }, desc: 'Sports & concerts.' },
  { id: 'themepark', name: 'Theme Park', icon: '🎢', cat: 'Leisure', sector: 'ENTERTAINMENT', w: 3, h: 3, cost: 1100000, color: '#f72585', roof: '#b5179e', height: 30, tour: 3000, rev: 620, cap: 20000, workers: 150, maxW: 300, power: -50, water: -20, neon: true, unlock: { tech: 'c_tourism', tourism: true }, desc: 'Rollercoasters & fun.' },

  // ---------- Science ----------
  { id: 'lab', name: 'Laboratory', icon: '🧪', cat: 'Science', sector: 'SCIENCE', w: 1, h: 1, cost: 1500, color: '#caf0f8', roof: '#90e0ef', height: 24, rp: 0.15, workers: 5, maxW: 10, power: -4, water: -1, maint: 0.4, unlock: { pop: 30 }, desc: '+0.15 RP/s.' },
  { id: 'university', name: 'University', icon: '🎓', cat: 'Science', sector: 'SCIENCE', w: 2, h: 2, cost: 38000, color: '#b08968', roof: '#7f5539', height: 40, rp: 0.9, edu: 1500, eduHigh: true, workers: 40, maxW: 80, power: -15, water: -8, maint: 6, hap: 5, unlock: { pop: 600 }, desc: '+0.9 RP/s, happiness +.' },
  { id: 'research', name: 'Research Center', icon: '🔭', cat: 'Science', sector: 'SCIENCE', w: 2, h: 2, cost: 280000, color: '#ade8f4', roof: '#48cae4', height: 56, rp: 4.5, edu: 500, eduHigh: true, workers: 60, maxW: 120, power: -40, water: -10, maint: 40, unlock: { tech: 's_physics' }, desc: '+4.5 RP/s.' },

  // ---------- Landmarks (unique) ----------
  { id: 'cityhall', name: 'Grand City Hall', icon: '🏛️', cat: 'Landmarks', sector: 'LANDMARK', w: 3, h: 3, cost: 2500000, color: '#f1e3c8', roof: '#c9b58f', height: 60, workers: 60, maxW: 60, power: -20, maint: 50, unique: true, landmark: true, tour: 500, bonus: { tax: 0.15, hap: 5 }, unlock: { pop: 5000 }, desc: 'Tax income +15%, happiness +5.' },
  { id: 'megatower', name: 'Mega Tower', icon: '🗼', cat: 'Landmarks', sector: 'LANDMARK', w: 2, h: 2, cost: 8000000, color: '#4cc9f0', roof: '#4361ee', height: 250, workers: 100, maxW: 100, power: -80, maint: 120, unique: true, landmark: true, neon: true, tour: 2500, bonus: { rev: 0.10 }, unlock: { tech: 'c_landmarks' }, desc: 'All revenue +10%.' },
  { id: 'wheel', name: 'Giant Wheel', icon: '🎡', cat: 'Landmarks', sector: 'LANDMARK', w: 3, h: 3, cost: 5000000, color: '#ff4d6d', roof: '#c9184a', height: 20, workers: 40, maxW: 40, power: -30, maint: 60, unique: true, landmark: true, neon: true, tour: 3500, bonus: { tour: 0.20, hap: 6 }, unlock: { tech: 'c_landmarks' }, desc: 'Tourism +20%, happiness +6.' },
  { id: 'megastadium', name: 'Mega Stadium', icon: '🏟️', cat: 'Landmarks', sector: 'LANDMARK', w: 4, h: 4, cost: 15000000, color: '#2b9348', roof: '#007f5f', height: 40, workers: 200, maxW: 200, power: -100, maint: 200, unique: true, landmark: true, tour: 8000, bonus: { tour: 0.35, event: 0.5 }, unlock: { tech: 'c_landmarks' }, desc: 'Tourism +35%, events cost 50% less.' },
  { id: 'spacecenter', name: 'Space Center', icon: '🚀', cat: 'Landmarks', sector: 'LANDMARK', w: 4, h: 4, cost: 50000000, color: '#e9ecef', roof: '#6c757d', height: 90, workers: 300, maxW: 300, power: -300, maint: 500, unique: true, landmark: true, tour: 6000, bonus: { rp: 0.5, rev: 0.15 }, unlock: { tech: 'c_landmarks', cityLevel: 20 }, desc: 'RP +50%, revenue +15%. Opens the Space Program.' },
  { id: 'quantumspire', name: 'Quantum Spire', icon: '💠', cat: 'Landmarks', sector: 'LANDMARK', w: 2, h: 2, cost: 100000000, color: '#b388ff', roof: '#7c4dff', height: 290, workers: 150, maxW: 150, power: -200, maint: 600, unique: true, landmark: true, neon: true, tour: 10000, bonus: { rev: 0.25, growth: 0.2 }, unlock: { tech: 'ng_spire', ng: 1 }, desc: 'NEW GAME+ landmark. Revenue +25%, growth +20%.' }
];
const BUILDINGS = {};
/* Data-driven building registry. New buildings only need a data object:
   registerBuilding({ id:'factory', name:'Factory', cost:5000, size:{x:2,y:2}, jobs:20, pollution:10, power:-10, water:-4, ... }) */
function registerBuilding(d) {
  if (d.size) { d.w = d.size.x; d.h = d.size.y; }
  if (d.jobs !== undefined && d.workers === undefined) d.workers = d.jobs;
  if (d.pollution !== undefined && d.pol === undefined) d.pol = d.pollution;
  d.w = d.w || 1; d.h = d.h || 1; d.cat = d.cat || 'Commercial'; d.sector = d.sector || 'NONE';
  d.color = d.color || '#8d99ae'; d.roof = d.roof || shadeHex(d.color); d.height = d.height || 20; d.icon = d.icon || '🏢';
  d.workers = d.workers || 0; d.maxW = d.maxW || d.workers;
  d.rev = d.rev || 0; d.cap = d.cap || 0; d.power = d.power || 0; d.water = d.water || 0;
  d.pol = d.pol || 0; d.housing = d.housing || 0; d.rp = d.rp || 0; d.tour = d.tour || 0;
  d.transit = d.transit || 0; d.goods = d.goods || 0; d.goodsUse = d.goodsUse || 0; d.hap = d.hap || 0;
  d.unlock = d.unlock || {};
  // Derived salary per worker ($/s): about 20% of the revenue the building makes at default staff
  if (d.sal === undefined) {
    var base = d.rev || (d.goods * EXPORT_PRICE) || (d.power > 0 ? d.power * 0.01 : 0) || (d.transit * 0.01) || 0.5;
    d.sal = d.workers > 0 ? Math.max(0.02, base * 0.2 / d.workers) : 0;
  }
  if (d.maint === undefined) d.maint = d.rev ? d.rev * 0.06 : (d.goods ? d.goods * GOODS_PRICE * 0.05 : (d.power > 0 ? d.power * 0.004 : 0.02));
  d.public = d.public !== undefined ? d.public : (PUBLIC_CATS.indexOf(d.cat) >= 0 || PUBLIC_IDS.indexOf(d.id) >= 0);
  d.edu = d.edu || 0; d.storage = d.storage || 0; d.trucks = d.trucks || 0; d.wasteCap = d.wasteCap || 0;
  d.fuelServe = d.fuelServe || 0; d.trade = d.trade || 0; d.evCharge = d.evCharge || 0;
  if (d.housing) { d.quality = d.quality || 40; d.rent = d.rent || 0.06; d.unitSize = d.unitSize || 3; }
  if (d.goods && !d.recipes) d.recipes = ['materials'];
  if (!BUILDINGS[d.id]) BUILDING_LIST.indexOf(d) < 0 && BUILDING_LIST.push(d);
  BUILDINGS[d.id] = d;
  return d;
}
function shadeHex(hex) { const v = parseInt(hex.slice(1), 16); const f = function (c) { return Math.max(0, Math.round(c * 0.75)).toString(16).padStart(2, '0'); }; return '#' + f((v >> 16) & 255) + f((v >> 8) & 255) + f(v & 255); }
BUILDING_LIST.slice().forEach(registerBuilding);

/* Technology tree. Each tech unlocks others through `req`. */
const TECH_CATS = ['ENERGY', 'TRANSPORT', 'BUSINESS', 'SCIENCE', 'ENVIRONMENT', 'CITY', 'DEFENSE'];
const TECH_LIST = [
  { id: 'e_grid', cat: 'ENERGY', name: 'Efficient Grid', cost: 20, req: [], desc: 'Power consumption -10%.' },
  { id: 'solar', cat: 'ENERGY', name: 'Solar Energy', cost: 60, req: ['e_grid'], desc: 'Unlocks Solar Plant.' },
  { id: 'wind', cat: 'ENERGY', name: 'Wind Power', cost: 90, req: ['e_grid'], desc: 'Unlocks Wind Farm.' },
  { id: 'adv_solar', cat: 'ENERGY', name: 'Advanced Solar', cost: 200, req: ['solar'], desc: 'Solar & wind output +50%.' },
  { id: 'nuclear', cat: 'ENERGY', name: 'Nuclear Power', cost: 700, req: ['wind', 's_physics'], desc: 'Unlocks Nuclear Plant.' },
  { id: 'fusion', cat: 'ENERGY', name: 'Fusion Power', cost: 2500, req: ['adv_solar', 'nuclear'], desc: 'Unlocks Fusion Reactor.' },

  { id: 't_roads', cat: 'TRANSPORT', name: 'Road Engineering', cost: 20, req: [], desc: 'Road capacity +25%.' },
  { id: 't_lights', cat: 'TRANSPORT', name: 'Smart Traffic Lights', cost: 70, req: ['t_roads'], desc: 'Traffic -15%.' },
  { id: 'metro', cat: 'TRANSPORT', name: 'Metro Systems', cost: 250, req: ['t_lights'], desc: 'Unlocks Metro Station.' },
  { id: 't_ev', cat: 'TRANSPORT', name: 'Electric Vehicles', cost: 450, req: ['t_lights', 'env_recycle'], desc: 'Vehicle pollution -60%.' },
  { id: 'rail', cat: 'TRANSPORT', name: 'Rail Network', cost: 550, req: ['metro'], desc: 'Unlocks Train Station.' },
  { id: 'aviation', cat: 'TRANSPORT', name: 'Aviation', cost: 1500, req: ['rail'], desc: 'Unlocks International Airport.' },
  { id: 'ng_hyperloop', cat: 'TRANSPORT', name: 'Hyperloop', cost: 4000, req: ['aviation'], ng: 1, desc: 'NG+: Traffic -30%, transit +50%.' },

  { id: 'b_marketing', cat: 'BUSINESS', name: 'Marketing', cost: 30, req: [], desc: 'Commercial revenue +10%.' },
  { id: 'b_logistics', cat: 'BUSINESS', name: 'Logistics', cost: 90, req: ['b_marketing'], desc: 'Goods production +20%.' },
  { id: 'b_finance', cat: 'BUSINESS', name: 'Financial Markets', cost: 250, req: ['b_marketing'], desc: 'Finance +15%, loans -1% interest, Stock Exchange.' },
  { id: 'automation', cat: 'BUSINESS', name: 'Automation', cost: 320, req: ['b_logistics'], desc: 'Unlocks Automated Plant.' },
  { id: 'b_tech', cat: 'BUSINESS', name: 'Tech Industry', cost: 400, req: ['b_marketing', 's_method'], desc: 'Unlocks Tech Campus.' },
  { id: 'b_global', cat: 'BUSINESS', name: 'Global Trade', cost: 1200, req: ['automation', 'b_finance'], desc: 'All revenue +15%.' },

  { id: 's_method', cat: 'SCIENCE', name: 'Scientific Method', cost: 25, req: [], desc: 'Research +15%.' },
  { id: 's_physics', cat: 'SCIENCE', name: 'Applied Physics', cost: 220, req: ['s_method'], desc: 'Unlocks Research Center.' },
  { id: 's_ai', cat: 'SCIENCE', name: 'Artificial Intelligence', cost: 900, req: ['s_physics'], desc: 'All building efficiency +10%.' },
  { id: 's_quantum', cat: 'SCIENCE', name: 'Quantum Computing', cost: 2800, req: ['s_ai'], desc: 'Research +30%.' },

  { id: 'env_recycle', cat: 'ENVIRONMENT', name: 'Recycling', cost: 40, req: [], desc: 'Pollution -15%.' },
  { id: 'env_filters', cat: 'ENVIRONMENT', name: 'Smoke Scrubbers', cost: 130, req: ['env_recycle'], desc: 'Industrial pollution -30%.' },
  { id: 'env_green', cat: 'ENVIRONMENT', name: 'Green City', cost: 320, req: ['env_filters'], desc: 'Parks & trees absorb 2× pollution.' },
  { id: 'env_carbon', cat: 'ENVIRONMENT', name: 'Carbon Capture', cost: 1300, req: ['env_green'], desc: 'Pollution -40%.' },

  { id: 'c_zoning', cat: 'CITY', name: 'Urban Zoning', cost: 40, req: [], desc: 'Unlocks Condo Tower.' },
  { id: 'c_water', cat: 'CITY', name: 'Water Engineering', cost: 150, req: ['c_zoning'], desc: 'Water use -10%, Mega Water Plant.' },
  { id: 'c_tourism', cat: 'CITY', name: 'Tourism Board', cost: 180, req: ['c_zoning'], desc: 'Tourism +25%, Theme Park.' },
  { id: 'c_highrise', cat: 'CITY', name: 'High-Rise Construction', cost: 280, req: ['c_zoning'], desc: 'Unlocks Residential Skyscraper.' },
  { id: 'c_smart', cat: 'CITY', name: 'Smart City', cost: 950, req: ['c_highrise', 's_ai'], desc: 'Happiness +8.' },
  { id: 'c_landmarks', cat: 'CITY', name: 'Monumental Architecture', cost: 1600, req: ['c_highrise', 'c_tourism'], desc: 'Unlocks Landmarks.' },
  { id: 'ng_spire', cat: 'CITY', name: 'Quantum Architecture', cost: 5000, req: ['c_landmarks'], ng: 1, desc: 'NG+: Unlocks the Quantum Spire.' },

  { id: 'd_fire', cat: 'DEFENSE', name: 'Fire Safety', cost: 30, req: [], desc: 'Disaster damage -30%, fire risk -50%.' },
  { id: 'd_police', cat: 'DEFENSE', name: 'Community Policing', cost: 90, req: ['d_fire'], desc: 'Crime -15%.' },
  { id: 'd_emergency', cat: 'DEFENSE', name: 'Emergency Network', cost: 260, req: ['d_police'], desc: 'Service coverage +30%.' },
  { id: 'd_warning', cat: 'DEFENSE', name: 'Early Warning', cost: 650, req: ['d_emergency'], desc: 'Disaster & crisis impact -50%.' },
  // Part 4 technologies
  { id: 'b_supply', cat: 'BUSINESS', name: 'Supply Chain Management', cost: 160, req: ['b_logistics'], desc: 'Logistics capacity +25%, storage +20%.' },
  { id: 's_edu', cat: 'SCIENCE', name: 'Education Reform', cost: 120, req: ['s_method'], desc: 'Education +15, worker skill grows faster.' },
  { id: 'env_waste', cat: 'ENVIRONMENT', name: 'Waste Management', cost: 110, req: ['env_recycle'], desc: 'Waste processing capacity +30%.' },
  { id: 'c_density', cat: 'CITY', name: 'Density Planning', cost: 200, req: ['c_zoning'], desc: 'Developers build one density tier higher.' },
  { id: 'e_storage', cat: 'ENERGY', name: 'Grid Storage', cost: 350, req: ['wind'], desc: 'Storms no longer reduce power output.' }
];
const TECHS = {};
TECH_LIST.forEach(function (t) { TECHS[t.id] = t; });

/* Player companies */
const COMPANY_DEFS = [
  { id: 'industries', name: 'BLOCK INDUSTRIES', icon: '🏭', sectors: ['INDUSTRY'], cost: 5000, color: '#e07a5f', exclusive: 'roboticsplant',
    products: ['Block Bricks', 'Cube Motors', 'Voxel Steel', 'Mega Machines'] },
  { id: 'foods', name: 'BLOCK FOODS', icon: '🍔', sectors: ['FOOD'], cost: 8000, color: '#ef476f', exclusive: 'gourmethq',
    products: ['Block Burger', 'Cube Cola', 'Pixel Pizza', 'Voxel Organic'] },
  { id: 'bank', name: 'BLOCK BANK', icon: '🏦', sectors: ['FINANCE'], cost: 40000, color: '#06d6a0', exclusive: 'bankhq',
    products: ['Block Card', 'Cube Savings', 'Pixel Pay', 'Voxel Wealth'] },
  { id: 'tech', name: 'BLOCK TECH', icon: '💻', sectors: ['TECHNOLOGY'], cost: 60000, color: '#4895ef', exclusive: 'datacenter',
    products: ['BlockOS', 'CubePhone', 'PixelCloud', 'VoxelAI'] }
];
const COMPANY_TITLES = [[1, 'Small Business'], [3, 'Growing Company'], [5, 'Corporation'], [7, 'Conglomerate'], [10, 'Mega Corporation']];
const PRODUCT_LEVELS = [2, 4, 6, 8];
const SHARES_TOTAL = 1000000;
/* Virtual third-party stocks (in-game simulation only) */
const NPC_STOCKS = [
  { id: 'CUBE', name: 'Cube Corp', icon: '🟦', base: 42, vol: 0.018, link: 'TECHNOLOGY' },
  { id: 'PXM', name: 'Pixel Motors', icon: '🚗', base: 18, vol: 0.022, link: 'TRANSPORT' },
  { id: 'VOXE', name: 'Voxel Energy', icon: '🔋', base: 27, vol: 0.02, link: 'ENERGY' },
  { id: 'BRKF', name: 'Brick Foods', icon: '🥪', base: 12, vol: 0.015, link: 'FOOD' }
];
/* Loan offers (credit limit decides which are available) */
const LOAN_OFFERS = [
  { amt: 1000, rate: 0.05, term: 300 }, { amt: 10000, rate: 0.05, term: 600 },
  { amt: 100000, rate: 0.05, term: 900 }, { amt: 1000000, rate: 0.07, term: 1200 },
  { amt: 10000000, rate: 0.08, term: 1800 }
];

/* Story mission chain */
const MISSIONS = [
  { title: 'MISSION 1 — Humble Beginnings', story: 'The council has given you a small plot. Industry is the spark of every great city.', desc: 'Build your first Factory.', reward: { money: 3000 }, check: function () { return countBuilt('factory') >= 1; }, hint: { cat: 'Industry', id: 'factory' } },
  { title: 'MISSION 2 — The Workforce', story: 'Machines alone do nothing. Put your people to work.', desc: 'Hire 10 workers across your buildings.', reward: { money: 5000 }, check: function () { return totalAssignedWorkers() >= 10; } },
  { title: 'MISSION 3 — Cash Flow', story: 'Investors want proof that Block City means business.', desc: 'Reach $100,000 total revenue.', reward: { money: 20000, rp: 30 }, check: function () { return S.statistics.totals.revenue >= 100000; } },
  { title: 'MISSION 4 — Money Talks', story: 'A real city needs a real bank.', desc: 'Build a Bank.', reward: { money: 40000 }, check: function () { return countBuilt('bank') >= 1; }, hint: { cat: 'Commercial', id: 'bank' } },
  { title: 'MISSION 5 — Growing Pains', story: 'People are hearing about your city. Make room for them.', desc: 'Reach 1,000 population.', reward: { money: 80000, rp: 80 }, check: function () { return S.city.population >= 1000; } },
  { title: 'MISSION 6 — Reach for the Sky', story: 'Every skyline starts with a single tower.', desc: 'Build your first Residential Skyscraper.', reward: { money: 400000, rp: 200 }, check: function () { return countBuilt('skyscraper') >= 1; }, hint: { cat: 'Residential', id: 'skyscraper' } },
  { title: 'MISSION 7 — Open Skies', story: 'Connect Block City to the world.', desc: 'Open the International Airport.', reward: { money: 3000000, rp: 500 }, check: function () { return countBuilt('airport') >= 1; }, hint: { cat: 'Transport', id: 'airport' } },
  { title: 'MISSION 8 — Mega City', story: 'The final chapter. Become a legend.', desc: 'Reach 25,000 population (Mega City).', reward: { money: 20000000, pp: 5, special: true }, check: function () { return S.city.population >= 25000; } }
];

/* Side quests (three are active at a time, in order) */
const SIDE_QUESTS = [
  { id: 'q_houses', desc: 'Build 3 Small Houses', reward: { money: 150 }, check: function () { return countBuilt('house') >= 3; } },
  { id: 'q_food', desc: 'Build a Food Stand', reward: { money: 150 }, check: function () { return countBuilt('foodstand') >= 1; } },
  { id: 'q_roads', desc: 'Own 40 road tiles', reward: { money: 200 }, check: function () { return MAP.roadCount >= 40; } },
  { id: 'q_pop25', desc: 'Reach 25 population', reward: { money: 300 }, check: function () { return S.city.population >= 25; } },
  { id: 'q_gen', desc: 'Build a Small Generator', reward: { money: 250 }, check: function () { return countBuilt('smallgen') >= 1; } },
  { id: 'q_water', desc: 'Build a Water Tower', reward: { money: 250 }, check: function () { return countBuilt('watertower') >= 1; } },
  { id: 'q_park', desc: 'Build 2 Parks', reward: { money: 200 }, check: function () { return countBuilt('park') >= 2; } },
  { id: 'q_pop100', desc: 'Reach 100 population', reward: { money: 1500 }, check: function () { return S.city.population >= 100; } },
  { id: 'q_lab', desc: 'Build a Laboratory', reward: { money: 1000, rp: 10 }, check: function () { return countBuilt('lab') >= 1; } },
  { id: 'q_tech1', desc: 'Research 1 technology', reward: { money: 1500 }, check: function () { return S.technology.unlocked.length >= 1; } },
  { id: 'q_company', desc: 'Found your first company', reward: { money: 5000 }, check: function () { return foundedCompanies() >= 1; } },
  { id: 'q_bus', desc: 'Build 2 Bus Stops', reward: { money: 2500 }, check: function () { return countBuilt('busstop') >= 2; } },
  { id: 'q_services', desc: 'Build a Police & a Fire Station', reward: { money: 6000 }, check: function () { return countBuilt('police') >= 1 && countBuilt('fire') >= 1; } },
  { id: 'q_pop500', desc: 'Reach 500 population', reward: { money: 10000 }, check: function () { return S.city.population >= 500; } },
  { id: 'q_happy', desc: 'Reach 70% happiness with 300+ citizens', reward: { money: 8000, rp: 20 }, check: function () { return S.city.population >= 300 && S.city.happiness >= 70; } },
  { id: 'q_loan', desc: 'Take a loan and fully repay it', reward: { money: 5000 }, check: function () { return S.bank.repaid >= 1; } },
  { id: 'q_employ', desc: 'Unemployment below 5% with 500+ citizens', reward: { money: 15000 }, check: function () { return S.city.population >= 500 && SIM.unemployment < 0.05; } },
  { id: 'q_tech5', desc: 'Research 5 technologies', reward: { money: 20000, rp: 40 }, check: function () { return S.technology.unlocked.length >= 5; } },
  { id: 'q_expand', desc: 'Expand your city land once', reward: { money: 10000 }, check: function () { return S.city.expansion >= 1; } },
  { id: 'q_trade', desc: 'Earn $5,000 profit trading stocks', reward: { money: 25000 }, check: function () { return S.companies.tradeProfit >= 5000; } },
  { id: 'q_tourism', desc: 'Unlock Tourism (1,500 population)', reward: { money: 50000 }, check: function () { return S.city.tourismUnlocked; } },
  { id: 'q_complv5', desc: 'Get any company to Level 5', reward: { money: 150000, rp: 150 }, check: function () { return maxCompanyLevel() >= 5; } },
  { id: 'q_income', desc: 'Reach $1,000/s net income', reward: { money: 100000 }, check: function () { return SIM.net >= 1000; } },
  { id: 'q_event', desc: 'Host a global event', reward: { money: 100000 }, check: function () { return S.events.hosted >= 1; } },
  { id: 'q_tech15', desc: 'Research 15 technologies', reward: { money: 300000, rp: 300 }, check: function () { return S.technology.unlocked.length >= 15; } },
  { id: 'q_landmark', desc: 'Build a Landmark', reward: { money: 1000000 }, check: function () { return countLandmarks() >= 1; } },
  { id: 'q_pop50k', desc: 'Reach 50,000 population', reward: { money: 20000000, pp: 3 }, check: function () { return S.city.population >= 50000; } }
];

/* Achievements (persist across prestige) */
const ACHIEVEMENTS = [
  { id: 'a_first', name: 'First Brick', icon: '🧱', desc: 'Construct a building.', check: function () { return S.statistics.totals.built >= 1; } },
  { id: 'a_b10', name: 'Developer', icon: '🏗️', desc: 'Own 10 buildings.', check: function () { return builtCount() >= 10; } },
  { id: 'a_b50', name: 'Urban Planner', icon: '📐', desc: 'Own 50 buildings.', check: function () { return builtCount() >= 50; } },
  { id: 'a_b150', name: 'Master Builder', icon: '🏙️', desc: 'Own 150 buildings.', check: function () { return builtCount() >= 150; } },
  { id: 'a_p100', name: 'Town', icon: '👪', desc: 'Reach 100 population.', check: function () { return S.city.population >= 100; } },
  { id: 'a_p1k', name: 'Small City', icon: '🏘️', desc: 'Reach 1,000 population.', check: function () { return S.city.population >= 1000; } },
  { id: 'a_p10k', name: 'Metropolis', icon: '🌃', desc: 'Reach 10,000 population.', check: function () { return S.city.population >= 10000; } },
  { id: 'a_p50k', name: 'Megalopolis', icon: '🌐', desc: 'Reach 50,000 population.', check: function () { return S.city.population >= 50000; } },
  { id: 'a_m1', name: 'Millionaire', icon: '💵', desc: 'Earn $1M total revenue.', check: function () { return S.statistics.totals.revenue >= 1e6; } },
  { id: 'a_m1b', name: 'Billionaire', icon: '💎', desc: 'Earn $1B total revenue.', check: function () { return S.statistics.totals.revenue >= 1e9; } },
  { id: 'a_t10', name: 'Scholar', icon: '📚', desc: 'Research 10 technologies.', check: function () { return S.technology.unlocked.length >= 10; } },
  { id: 'a_tall', name: 'Omniscient', icon: '🧠', desc: 'Research every base technology.', check: function () { return TECH_LIST.every(function (t) { return t.ng || hasTech(t.id); }); } },
  { id: 'a_comp', name: 'Tycoon', icon: '🎩', desc: 'Found all 4 companies.', check: function () { return foundedCompanies() >= 4; } },
  { id: 'a_mega', name: 'Mega Corporation', icon: '🏆', desc: 'Get a company to Level 10.', check: function () { return maxCompanyLevel() >= 10; } },
  { id: 'a_trader', name: 'Wolf of Block Street', icon: '📈', desc: 'Earn $100,000 from stock trading.', check: function () { return S.companies.tradeProfit >= 100000; } },
  { id: 'a_disaster', name: 'Survivor', icon: '🛟', desc: 'Survive a natural disaster.', check: function () { return S.statistics.totals.disasters >= 1; } },
  { id: 'a_crisis', name: 'Crisis Manager', icon: '📉', desc: 'Survive an economic crisis.', check: function () { return S.statistics.totals.crises >= 1; } },
  { id: 'a_airport', name: 'Jet Setter', icon: '✈️', desc: 'Open the International Airport.', check: function () { return countBuilt('airport') >= 1; } },
  { id: 'a_land3', name: 'Wonders of Blocks', icon: '🗼', desc: 'Build 3 Landmarks.', check: function () { return countLandmarks() >= 3; } },
  { id: 'a_clean', name: 'Clean Air', icon: '🍃', desc: 'Pollution under 10 with 2,000+ citizens.', check: function () { return S.city.population >= 2000 && S.city.pollution < 10; } },
  { id: 'a_safe', name: 'Safe Streets', icon: '🛡️', desc: 'Crime under 10 with 2,000+ citizens.', check: function () { return S.city.population >= 2000 && S.city.crime < 10; } },
  { id: 'a_happy', name: 'Paradise', icon: '😍', desc: 'Happiness 90%+ with 1,000+ citizens.', check: function () { return S.city.population >= 1000 && S.city.happiness >= 90; } },
  { id: 'a_traffic', name: 'Flow State', icon: '🚦', desc: 'Traffic under 20 with 5,000+ citizens.', check: function () { return S.city.population >= 5000 && SIM.traffic < 20; } },
  { id: 'a_debtfree', name: 'Debt Free', icon: '🧾', desc: 'Repay 3 loans.', check: function () { return S.bank.repaid >= 3; } },
  { id: 'a_missions', name: 'Legend of Block City', icon: '👑', desc: 'Complete the mission chain.', check: function () { return S.quests.mission >= MISSIONS.length; } },
  { id: 'a_prestige', name: 'Reborn', icon: '⭐', desc: 'Prestige once.', check: function () { return S.meta.prestigeCount >= 1; } },
  // New Game+ achievements
  { id: 'a_ng1', name: 'New Game+', icon: '♾️', desc: 'Start a New Game+.', ng: 1, check: function () { return S.meta.ngLevel >= 1; } },
  { id: 'a_ngpop', name: 'Déjà Vu', icon: '🔁', desc: 'Reach 10,000 population in NG+.', ng: 1, check: function () { return S.meta.ngLevel >= 1 && S.city.population >= 10000; } },
  { id: 'a_spire', name: 'Quantum Leap', icon: '💠', desc: 'Build the Quantum Spire.', ng: 1, check: function () { return countBuilt('quantumspire') >= 1; } },
  { id: 'a_hyper', name: 'Hyperspeed', icon: '🚄', desc: 'Research the Hyperloop.', ng: 1, check: function () { return hasTech('ng_hyperloop'); } }
];

/* PRESTIGE 3 — CITY LEGACY. Legacy Points (LP) buy permanent bonuses in the Legacy Tree.
   Each node requires the previous node of its category (req) to have at least 1 level. */
const LEGACY_CATS = ['ECONOMY', 'TECHNOLOGY', 'TRANSPORT', 'POPULATION', 'ENVIRONMENT', 'SPACE'];
const PRESTIGE_UPGRADES = [
  { id: 'income', cat: 'ECONOMY', name: 'Permanent Income', icon: '💰', per: 0.10, max: 20, desc: '+10% income per level' },
  { id: 'tax', cat: 'ECONOMY', name: 'Tax Efficiency', icon: '🧾', per: 0.05, max: 10, req: 'income', desc: '+5% tax income per level' },
  { id: 'start', cat: 'ECONOMY', name: 'Starting Capital', icon: '🏦', per: 2500, max: 10, req: 'tax', desc: '+$2,500 starting money & budget per level' },
  { id: 'research', cat: 'TECHNOLOGY', name: 'Research Boost', icon: '🔬', per: 0.05, max: 20, desc: '+5% research per level' },
  { id: 'build', cat: 'TECHNOLOGY', name: 'Construction Speed', icon: '🏗️', per: 0.10, max: 10, req: 'research', desc: '+10% construction speed per level' },
  { id: 'techcost', cat: 'TECHNOLOGY', name: 'Efficient Science', icon: '🧪', per: 0.05, max: 8, req: 'build', desc: '-5% technology cost per level' },
  { id: 'traffic', cat: 'TRANSPORT', name: 'Traffic Engineering', icon: '🚦', per: 0.05, max: 8, desc: '-5% traffic per level' },
  { id: 'logistics', cat: 'TRANSPORT', name: 'Fleet Logistics', icon: '🚚', per: 0.10, max: 10, req: 'traffic', desc: '+10% logistics capacity per level' },
  { id: 'fuel', cat: 'TRANSPORT', name: 'Fuel Economy', icon: '⛽', per: 0.10, max: 5, req: 'logistics', desc: '-10% fuel consumption per level' },
  { id: 'growth', cat: 'POPULATION', name: 'Population Growth', icon: '👥', per: 0.05, max: 20, desc: '+5% population growth per level' },
  { id: 'happy', cat: 'POPULATION', name: 'Civic Pride', icon: '😊', per: 2, max: 5, req: 'growth', desc: '+2 happiness per level' },
  { id: 'housing', cat: 'POPULATION', name: 'Housing Standards', icon: '🏘️', per: 0.05, max: 10, req: 'happy', desc: '+5% housing capacity per level' },
  { id: 'clean', cat: 'ENVIRONMENT', name: 'Clean Air Act', icon: '🍃', per: 0.05, max: 10, desc: '-5% pollution per level' },
  { id: 'waste', cat: 'ENVIRONMENT', name: 'Zero Waste', icon: '♻️', per: 0.08, max: 8, req: 'clean', desc: '-8% waste production per level' },
  { id: 'renew', cat: 'ENVIRONMENT', name: 'Renewable Legacy', icon: '☀️', per: 0.10, max: 10, req: 'waste', desc: '+10% solar & wind output per level' },
  { id: 'spacecost', cat: 'SPACE', name: 'Launch Contracts', icon: '🚀', per: 0.10, max: 5, desc: '-10% space program cost per level' },
  { id: 'spacebonus', cat: 'SPACE', name: 'Orbital Legacy', icon: '🛰️', per: 0.10, max: 10, req: 'spacecost', desc: '+10% space program bonuses per level' },
  { id: 'astro', cat: 'SPACE', name: 'Astronaut Fame', icon: '👩‍🚀', per: 2, max: 5, req: 'spacebonus', desc: '+2 city reputation per level' }
];

/* Global events (unlock at 3,000 population) */
const GLOBAL_EVENTS = [
  { id: 'festival', name: 'City Festival', icon: '🎡', cost: 20000, dur: 150, tour: 0.3, hap: 8, rev: 0.10, desc: 'Parades and stalls across the city.' },
  { id: 'racing', name: 'Racing Event', icon: '🏎️', cost: 60000, dur: 120, tour: 0.5, hap: 5, rev: 0.12, desc: 'Race cars roar through the streets.' },
  { id: 'fireworks', name: 'Firework Night', icon: '🎆', cost: 35000, dur: 120, tour: 0.25, hap: 10, rev: 0.08, desc: 'Spectacular fireworks after dark.' },
  { id: 'music', name: 'Music Festival', icon: '🎵', cost: 80000, dur: 180, tour: 0.6, hap: 9, rev: 0.15, desc: 'Headliners from around the world.' }
];
const CRISES = [
  { id: 'crash', name: 'MARKET CRASH', icon: '📉', dur: 180, desc: 'Revenue -20%, stock prices tumble.' },
  { id: 'energy', name: 'ENERGY CRISIS', icon: '🌍', dur: 300, desc: 'Electricity cost +50%.' },
  { id: 'shortage', name: 'SUPPLY SHORTAGE', icon: '🚚', dur: 240, desc: 'Factory production -30%.' }
];
const DISASTERS = [
  { id: 'storm', name: 'Storm', icon: '🌪️', dur: 45, desc: 'High winds damage buildings.' },
  { id: 'flood', name: 'Flood', icon: '🌊', dur: 60, desc: 'Low areas near water flood.' },
  { id: 'wildfire', name: 'Wildfire', icon: '🔥', dur: 40, desc: 'Fires break out in the city.' }
];
