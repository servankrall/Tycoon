'use strict';
/* BLOCK CITY TYCOON — PART 5 DATA — story, identities, thoughts, challenges */
/* =======================================================================
   PART 5 — ULTIMATE / AAA BROWSER EDITION
   -----------------------------------------------------------------------
   13. P5 DATA ........... calendar, economy cycles, investments, startups,
                           score, ranking, world events, identity, story,
                           challenges, titles, personalities, feedback
   14. P5 SYSTEMS ........ connected simulation systems (see Game engine)
   15. P5 UI ............. palette, tooltips, photo mode, admin panel…
   ======================================================================= */

/* --- Calendar ---------------------------------------------------------- */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SPECIAL_WEEKENDS = {
  tourism: { id: 'tourism', name: 'DOUBLE TOURISM WEEKEND', icon: '🧳', desc: 'Tourist arrivals ×2 all weekend.' },
  business: { id: 'business', name: 'DOUBLE BUSINESS WEEKEND', icon: '💼', desc: 'Commercial revenue ×2 all weekend.' },
  festival: { id: 'festival', name: 'CITY FESTIVAL WEEKEND', icon: '🎪', desc: 'Happiness +8, entertainment demand ×1.5.' }
};

/* --- Economic cycles & central bank ------------------------------------ */
const ECON_PHASES = {
  BOOM:      { id: 'BOOM', icon: '🚀', color: '#06d6a0', demand: 1.12, rev: 1.08, jobs: 1.05, growth: 1.15, rate: 0.08, dur: [300, 540], next: ['SLOWDOWN'], desc: 'Strong demand and rising prices. The central bank raises rates to cool the economy.' },
  NORMAL:    { id: 'NORMAL', icon: '⚖️', color: '#4cc9f0', demand: 1, rev: 1, jobs: 1, growth: 1, rate: 0.05, dur: [360, 720], next: ['BOOM', 'SLOWDOWN'], desc: 'Stable, balanced growth.' },
  SLOWDOWN:  { id: 'SLOWDOWN', icon: '🐢', color: '#ffd166', demand: 0.95, rev: 0.97, jobs: 0.98, growth: 0.92, rate: 0.045, dur: [240, 420], next: ['RECESSION', 'NORMAL'], desc: 'Growth is cooling. Businesses become cautious.' },
  RECESSION: { id: 'RECESSION', icon: '📉', color: '#ef476f', demand: 0.86, rev: 0.9, jobs: 0.93, growth: 0.75, rate: 0.015, dur: [240, 420], next: ['RECOVERY'], desc: 'Demand falls and unemployment rises. Rates are cut to stimulate investment.' },
  RECOVERY:  { id: 'RECOVERY', icon: '🌱', color: '#9bf6ff', demand: 0.97, rev: 0.99, jobs: 1, growth: 1.05, rate: 0.03, dur: [240, 420], next: ['NORMAL', 'BOOM'], desc: 'The economy is healing. Cheap credit fuels new investment.' }
};

/* --- Investment projects --------------------------------------------- */
const INVESTMENT_TYPES = [
  { id: 'solar', name: 'Solar Project', icon: '☀️', risk: 'LOW', p: [0.62, 0.3], ret: 0.28, dur: 240, min: 2000, perk: 'solar', perkText: 'On success: pollution -3% (permanent, this city)' },
  { id: 'startup', name: 'Tech Startup', icon: '💡', risk: 'HIGH', p: [0.36, 0.26], ret: 1.3, dur: 360, min: 5000, perk: 'tech', perkText: 'On success: +RP burst and research +3%' },
  { id: 'metro', name: 'Metro Project', icon: '🚇', risk: 'MEDIUM', p: [0.5, 0.32], ret: 0.5, dur: 480, min: 20000, perk: 'metro', perkText: 'On success: transit capacity +10%' },
  { id: 'harbor', name: 'Harbor Expansion', icon: '⚓', risk: 'MEDIUM', p: [0.46, 0.32], ret: 0.66, dur: 600, min: 50000, perk: 'harbor', perkText: 'On success: trade capacity +15%' }
];

/* --- Startups (Technology District) --------------------------------------- */
const STARTUP_STAGES = [
  { name: 'Seed', icon: '🌱', mult: 1, value: 20000 },
  { name: 'Growth', icon: '📈', mult: 2.2, value: 150000 },
  { name: 'Scale-up', icon: '🚀', mult: 4.5, value: 1200000 },
  { name: 'Unicorn', icon: '🦄', mult: 9, value: 12000000 }
];
const STARTUP_NAMES_A = ['Pixel', 'Cube', 'Voxel', 'Quantum', 'Nova', 'Byte', 'Brick', 'Hyper', 'Cloud', 'Neon', 'Blocky', 'Orbit'];
const STARTUP_NAMES_B = ['Labs', 'AI', 'Pay', 'Health', 'Ride', 'Grid', 'Mind', 'Stack', 'Works', 'Robotics', 'Foods', 'Games'];

/* --- City score & titles ---------------------------------------------- */
const SCORE_PARTS = [
  { id: 'population', name: 'Population', icon: '👥' }, { id: 'happiness', name: 'Happiness', icon: '😊' },
  { id: 'economy', name: 'Economy', icon: '💹' }, { id: 'environment', name: 'Environment', icon: '🌳' },
  { id: 'technology', name: 'Technology', icon: '🔬' }, { id: 'tourism', name: 'Tourism', icon: '🧳' },
  { id: 'transport', name: 'Transportation', icon: '🚇' }, { id: 'education', name: 'Education', icon: '🎓' },
  { id: 'health', name: 'Healthcare', icon: '🏥' }, { id: 'safety', name: 'Safety (crime)', icon: '🛡️' }
];
const SCORE_TITLES = [[0, 'Small Town'], [150, 'Growing City'], [300, 'Major City'], [500, 'Metropolis'], [680, 'Mega City'], [850, 'Global City']];
const RANK_CATS = [['score', 'Total Score', '🏆'], ['pop', 'Population', '👥'], ['wealth', 'Wealth', '💰'], ['tech', 'Technology', '🔬'], ['tour', 'Tourism', '🧳'], ['hap', 'Happiness', '😊'], ['env', 'Environment', '🌳']];

/* --- World (global) events: affect every city in the ranking ---------------- */
const WORLD_EVENTS = [
  { id: 'energy', name: 'GLOBAL ENERGY SHORTAGE', icon: '🔌', dur: 300, desc: 'Power output -15%, electricity costs +40% worldwide.' },
  { id: 'techboom', name: 'TECH BOOM', icon: '💾', dur: 300, good: true, desc: 'Technology demand +30%, research +20% worldwide.' },
  { id: 'tourboom', name: 'TOURISM BOOM', icon: '✈️', dur: 300, good: true, desc: 'Tourism +40% worldwide.' },
  { id: 'recession', name: 'GLOBAL RECESSION', icon: '🌧️', dur: 360, desc: 'Demand -12% worldwide; national economies slide toward recession.' },
  { id: 'food', name: 'FOOD SHORTAGE', icon: '🌾', dur: 300, desc: 'Food prices +60%; food businesses earn more but happiness -4.' }
];

/* --- City identity ------------------------------------------------------ */
const IDENTITIES = {
  GREEN:      { id: 'GREEN', name: 'GREEN CITY', icon: '🌿', color: '#52b788', bonus: 'Happiness +4, pollution -10%' },
  BUSINESS:   { id: 'BUSINESS', name: 'BUSINESS CITY', icon: '💼', color: '#ffd166', bonus: 'Commercial revenue +8%' },
  TECH:       { id: 'TECH', name: 'TECH CITY', icon: '💻', color: '#4cc9f0', bonus: 'Research +15%, startups grow faster' },
  TOURIST:    { id: 'TOURIST', name: 'TOURIST CITY', icon: '🗺️', color: '#f15bb5', bonus: 'Tourism +15%' },
  INDUSTRIAL: { id: 'INDUSTRIAL', name: 'INDUSTRIAL CITY', icon: '🏭', color: '#e07a5f', bonus: 'Production +10%, pollution +5%' },
  FINANCIAL: { id: 'FINANCIAL', name: 'FINANCIAL CITY', icon: '🏦', color: '#06d6a0', bonus: 'Finance revenue +10%' },
  ENTERTAINMENT: { id: 'ENTERTAINMENT', name: 'ENTERTAINMENT CITY', icon: '🎭', color: '#b5179e', bonus: 'Happiness +3, tourism +5%' }
};

/* --- Milestones --------------------------------------------------------- */
const MILESTONES = [
  { id: 'm_rev1k', kind: 'money', v: 1e3, icon: '💵', name: 'First $1,000' }, { id: 'm_rev100k', kind: 'money', v: 1e5, icon: '💵', name: '$100,000 earned' },
  { id: 'm_rev1m', kind: 'money', v: 1e6, icon: '💰', name: '$1M earned' }, { id: 'm_rev10m', kind: 'money', v: 1e7, icon: '💰', name: '$10M earned' },
  { id: 'm_rev1b', kind: 'money', v: 1e9, icon: '💎', name: '$1B earned' },
  { id: 'm_pop100', kind: 'pop', v: 100, icon: '👪', name: '100 citizens' }, { id: 'm_pop1k', kind: 'pop', v: 1000, icon: '🏘️', name: '1K citizens' },
  { id: 'm_pop10k', kind: 'pop', v: 10000, icon: '🌃', name: '10K citizens' }, { id: 'm_pop100k', kind: 'pop', v: 100000, icon: '🌐', name: '100K citizens' },
  { id: 'm_pop1m', kind: 'pop', v: 1000000, icon: '🪐', name: '1M citizens' },
  { id: 'm_tech10', kind: 'tech', v: 10, icon: '🔬', name: 'Technology Index 10' }, { id: 'm_tech25', kind: 'tech', v: 25, icon: '🧪', name: 'Technology Index 25' },
  { id: 'm_tech50', kind: 'tech', v: 50, icon: '🤖', name: 'Technology Index 50' }, { id: 'm_tech100', kind: 'tech', v: 100, icon: '🧠', name: 'Technology Index 100' }
];

/* --- Challenges ----------------------------------------------------------- */
const CHALLENGES = [
  { id: 'ZERO_POLLUTION', name: 'ZERO POLLUTION', icon: '🍃', rules: 'Polluting buildings are banned.', goal: 'Reach 1,500 population.', reward: { title: 'Eco Mayor', pp: 3 }, ban: function (d) { return d.pol > 0; }, check: function () { return S.city.population >= 1500; }, prog: function () { return S.city.population / 1500; } },
  { id: 'NO_TAX', name: 'NO TAX', icon: '🚫', rules: 'Income tax is locked at 0%.', goal: 'Reach 2,000 population with $50K budget.', reward: { cosmetic: 'theme:aurora', pp: 3 }, check: function () { return S.city.population >= 2000 && S.budget >= 50000; }, prog: function () { return Math.min(S.city.population / 2000, S.budget / 50000); } },
  { id: 'RICH_CITY', name: 'RICH CITY', icon: '💎', rules: 'Start with 5× money. Small houses and apartments are banned.', goal: 'Hold $5M money.', start: { money: 5 }, reward: { badge: 'Diamond', pp: 3 }, ban: function (d) { return d.id === 'house' || d.id === 'apartment'; }, check: function () { return S.money >= 5e6; }, prog: function () { return S.money / 5e6; } },
  { id: 'POOR_CITY', name: 'POOR CITY', icon: '🪙', rules: 'Start with $300 money and $800 budget. No bank loans.', goal: 'Reach 1,000 population.', start: { money: 0.03, budget: 0.1 }, noLoans: true, reward: { title: 'Scrappy Mayor', pp: 3 }, check: function () { return S.city.population >= 1000; }, prog: function () { return S.city.population / 1000; } },
  { id: 'FAST_GROWTH', name: 'FAST GROWTH', icon: '⚡', rules: 'You have 25 minutes of play time.', goal: 'Reach 2,000 population in 25 minutes.', limit: 1500, reward: { cosmetic: 'theme:sunset', pp: 3 }, check: function () { return S.city.population >= 2000; }, prog: function () { return S.city.population / 2000; } },
  { id: 'HIGH_DENSITY', name: 'HIGH DENSITY', icon: '🏙️', rules: 'Small houses are banned.', goal: 'Reach 3,000 population on fewer than 260 built tiles.', ban: function (d) { return d.id === 'house'; }, reward: { badge: 'Skyline', pp: 3 }, check: function () { return S.city.population >= 3000 && SIM.builtTiles < 260; }, prog: function () { return S.city.population / 3000; } },
  { id: 'NO_FACTORIES', name: 'NO FACTORIES', icon: '🏭', rules: 'All Industry buildings are banned.', goal: 'Hold $500K money.', ban: function (d) { return d.cat === 'Industry'; }, reward: { title: 'Service Baron', pp: 3 }, check: function () { return S.money >= 5e5; }, prog: function () { return S.money / 5e5; } },
  { id: 'MAX_TOURISM', name: 'MAX TOURISM', icon: '🧳', rules: 'Tourism unlocks at 800 population instead of 1,500.', goal: 'Welcome 1,500 tourists at once.', reward: { cosmetic: 'skin:aurora', pp: 3 }, check: function () { return S.city.tourists >= 1500; }, prog: function () { return S.city.tourists / 1500; } }
];

/* Daily / weekly challenge templates (chosen from the date — the same for everyone on that day) */
const DAILY_TEMPLATES = [
  { id: 'd_pop', text: function (v) { return 'Reach ' + fmt(v) + ' population within 20 minutes.'; }, vals: [300, 600, 1000], limit: 1200, metric: 'pop', abs: true },
  { id: 'd_rev', text: function (v) { return 'Earn ' + money(v) + ' revenue within 20 minutes.'; }, vals: [20000, 60000, 150000], limit: 1200, metric: 'revenue' },
  { id: 'd_build', text: function (v) { return 'Construct ' + v + ' buildings within 15 minutes.'; }, vals: [8, 14, 20], limit: 900, metric: 'built' },
  { id: 'd_happy', text: function (v) { return 'Reach ' + v + '% happiness within 15 minutes.'; }, vals: [70, 76, 82], limit: 900, metric: 'happy', abs: true },
  { id: 'd_tech', text: function (v) { return 'Research ' + v + ' technologies within 20 minutes.'; }, vals: [2, 3, 4], limit: 1200, metric: 'techs' }
];
const WEEKLY_TEMPLATES = [
  { id: 'w_nofac', text: function () { return 'Earn $10M revenue without building factories.'; }, metric: 'revenue', v: 1e7, noFactories: true },
  { id: 'w_happy', text: function () { return 'Reach 90% happiness while population exceeds 5,000.'; }, metric: 'happyPop', v: 1 },
  { id: 'w_tour', text: function () { return 'Welcome 3,000 tourists at once.'; }, metric: 'tourists', v: 3000, abs: true },
  { id: 'w_contracts', text: function () { return 'Complete 5 supply contracts.'; }, metric: 'contracts', v: 5 },
  { id: 'w_score', text: function () { return 'Reach a City Score of 600.'; }, metric: 'score', v: 600, abs: true }
];
const COSMETICS = {
  'theme:aurora': { name: 'Aurora UI theme', icon: '🌌' }, 'theme:sunset': { name: 'Sunset UI theme', icon: '🌇' },
  'skin:aurora': { name: 'Aurora building trim', icon: '✨' }, 'skin:sunset': { name: 'Sunset building trim', icon: '🌅' }
};

/* --- Player titles ---------------------------------------------------------- */
const TITLES = [
  { id: 'Beginner', icon: '🌱', desc: 'Start playing.', check: function () { return true; } },
  { id: 'Builder', icon: '🧱', desc: 'Construct 50 buildings (lifetime).', check: function () { return S.statistics.totals.built >= 50; } },
  { id: 'Entrepreneur', icon: '💼', desc: 'Found a company.', check: function () { return foundedCompanies() >= 1; } },
  { id: 'CEO', icon: '👔', desc: 'Get a company to Level 5.', check: function () { return maxCompanyLevel() >= 5; } },
  { id: 'Tycoon', icon: '🎩', desc: 'Hold $1M money.', check: function () { return S.money >= 1e6; } },
  { id: 'Industrialist', icon: '🏭', desc: 'Produce 100 goods per second.', check: function () { return (SIM.goodsProd || 0) >= 100; } },
  { id: 'Visionary', icon: '🔭', desc: 'Research 20 technologies.', check: function () { return S.technology.unlocked.length >= 20; } },
  { id: 'Mega Mayor', icon: '🏙️', desc: 'Reach 25,000 population.', check: function () { return S.city.population >= 25000; } },
  { id: 'Global Architect', icon: '🌐', desc: 'Reach City Level 20.', check: function () { return cityLevel() >= 20; } }
];

/* --- Story campaign: 10 chapters, advisor characters, choices ----------------- */
const STORY_CAST = {
  ada: { name: 'Ada — Chief of Staff', icon: '👩‍💼', color: '#4cc9f0' },
  victor: { name: 'Victor — City Economist', icon: '🧔', color: '#ffd166' },
  mira: { name: 'Mira — City Engineer', icon: '👷‍♀️', color: '#f8961e' },
  rex: { name: 'Rex — Investor', icon: '🕴️', color: '#9b5de5' },
  robo: { name: 'CITY ADVISOR', icon: '🤖', color: '#06d6a0' }
};
const STORY = [
  { title: 'The Empty Lot', goal: 'Build a Small Generator and 2 Small Houses.', unlock: 'reviews', unlockText: 'Customer Reviews',
    intro: [['ada', 'Welcome, Mayor. Right now Block City is little more than an empty lot, a workshop and five hopeful citizens.'], ['mira', 'Homes need power sooner or later. A Small Generator and a couple of houses will get us started.']],
    check: function () { return countBuilt('smallgen') + countBuilt('powerplant') >= 1 && countBuilt('house') >= 2; },
    prog: function () { return (Math.min(1, countBuilt('smallgen') + countBuilt('powerplant')) + Math.min(2, countBuilt('house'))) / 3; },
    outro: [['ada', 'Lights on, doors open. Citizens will now start rating the places they visit — watch your ⭐ reviews.']], reward: { money: 600 } },
  { title: 'First Business', goal: 'Own 3 businesses earning revenue.', unlock: 'ads', unlockText: 'Advertising campaigns',
    intro: [['victor', 'A city without commerce is just a campsite. Open shops and food places — people want to spend.']],
    check: function () { return playerEarners() >= 3; }, prog: function () { return playerEarners() / 3; },
    outro: [['victor', 'Revenue is flowing. You can now run advertising campaigns — and I will track their ROI for you.']], reward: { money: 1500 } },
  { title: 'Growing Town', goal: 'Reach 150 population.', unlock: 'invest', unlockText: 'Investment projects',
    intro: [['ada', 'Word is spreading. Families want to move here — give them homes and jobs.']],
    check: function () { return S.city.population >= 150; }, prog: function () { return S.city.population / 150; },
    choice: { q: 'Factory expansion?', who: 'mira', opts: [
      { id: 'eco', label: '🌿 A: Eco Factory', text: 'Industrial pollution -20%, reputation +5.' },
      { id: 'mega', label: '🏭 B: Mega Production', text: 'Production +15%, pollution +10%.' }] },
    outro: [['rex', 'A growing town attracts capital. I have projects you can invest in — for the right price.']], reward: { money: 4000, rp: 10 } },
  { title: 'Economic Challenge', goal: 'Survive the recession: keep happiness ≥ 50 and a positive budget for 3 minutes.', unlock: 'bank', unlockText: 'Central Bank view & regional campaigns',
    intro: [['victor', 'Bad news: the national economy has slipped into RECESSION. Demand is falling. Keep the city stable.']],
    start: function () { forceEconPhase('RECESSION', 420); },
    check: function () { return storyTimer(180, S.city.happiness >= 50 && S.budget > 0); }, prog: function () { return (S.p5.story.hold || 0) / 180; },
    choice: { q: 'How do we respond to the recession?', who: 'victor', opts: [
      { id: 'stimulus', label: '💸 A: Stimulus package', text: 'Pay 15% of the budget; demand +6% for 10 minutes.' },
      { id: 'austerity', label: '✂️ B: Austerity', text: 'Budget +10% now; happiness -5 for 10 minutes.' }] },
    outro: [['victor', 'We made it through. From now on you can follow the central bank and interest rates closely.']], reward: { money: 8000, rp: 20 } },
  { title: 'The Big Investment', goal: 'Complete one investment project.', unlock: 'startups', unlockText: 'Startups in Technology Districts',
    intro: [['rex', 'Money makes money. Fund a project in Companies → Investments — success is never guaranteed.']],
    check: function () { return (S.p5.invest.history || []).length >= 1; }, prog: function () { return S.p5.invest.active.length ? 0.5 : 0; },
    outro: [['rex', 'Now we are talking. Build a Startup Hub near offices or labs — a Technology District — and grow the next unicorn.']], reward: { money: 20000, rp: 30 } },
  { title: 'Metropolitan Expansion', goal: 'Expand your land once and reach 1,000 population.', unlock: 'ranking', unlockText: 'World City Ranking',
    intro: [['mira', 'We are running out of room. Buy more land at City → Land and keep growing.']],
    check: function () { return S.city.expansion >= 1 && S.city.population >= 1000; }, prog: function () { return (Math.min(1, S.city.expansion) + Math.min(1, S.city.population / 1000)) / 2; },
    outro: [['ada', 'Other cities have noticed us. You can now compare Block City with the world in the City Ranking.']], reward: { money: 60000, rp: 50 } },
  { title: 'Global Business', goal: 'Get a company to Level 3 or sign a trade agreement.', unlock: 'global', unlockText: 'Global ad campaigns',
    intro: [['victor', 'Time to think bigger than our borders. Grow a company or sign a trade agreement with another city.']],
    check: function () { return maxCompanyLevel() >= 3 || WORLD_CITIES.some(function (c) { return S.diplomacy[c.id].agreement; }); }, prog: function () { return Math.min(1, maxCompanyLevel() / 3); },
    choice: { q: 'Where should our companies focus?', who: 'victor', opts: [
      { id: 'export', label: '🚢 A: Export focus', text: 'Trade capacity +20%.' },
      { id: 'local', label: '🏪 B: Local focus', text: 'Commercial revenue +8%.' }] },
    outro: [['victor', 'Global campaigns are now available. The whole world is our market.']], reward: { money: 250000, rp: 100 } },
  { title: 'Technology Revolution', goal: 'Research 12 technologies and grow a startup to Growth stage.', unlock: 'unicorn', unlockText: 'Startup exits (IPO) & faster growth',
    intro: [['mira', 'The future is written in code. Push research and grow our startup scene.']],
    check: function () { return S.technology.unlocked.length >= 12 && maxStartupStage() >= 1; }, prog: function () { return (Math.min(1, S.technology.unlocked.length / 12) + Math.min(1, maxStartupStage())) / 2; },
    choice: { q: 'Patent policy?', who: 'mira', opts: [
      { id: 'open', label: '🔓 A: Open data', text: 'Research +10%.' },
      { id: 'patent', label: '🔒 B: Private patents', text: 'Technology revenue +10%.' }] },
    outro: [['rex', 'Startups can now IPO for a fortune — or keep growing into giants.']], reward: { money: 1000000, rp: 250 } },
  { title: 'Mega City', goal: 'Reach 10,000 population.', unlock: 'mega', unlockText: 'Mega City title & cinematic skyline',
    intro: [['ada', 'Ten thousand citizens. It sounds impossible — until it is not.']],
    check: function () { return S.city.population >= 10000; }, prog: function () { return S.city.population / 10000; },
    outro: [['ada', 'Look at that skyline. Block City is a Mega City.']], reward: { money: 5000000, rp: 500 } },
  { title: 'Global Capital', goal: 'Reach City Score 850 and rank #1 in the world.', unlock: 'future', unlockText: 'FUTURE CIVILIZATION era',
    intro: [['robo', 'Final objective detected: become the Global Capital — the highest-scoring city on the planet.']],
    check: function () { return S.p5.score.cur >= 850 && playerRank('score') === 1; }, prog: function () { return Math.min(1, S.p5.score.cur / 850); },
    outro: [['ada', 'Mayor… we did it. Block City is the Global Capital — the dawn of a Future Civilization.'], ['robo', 'FUTURE CIVILIZATION era unlocked. Gold theme and the Global Architect legacy await.']], reward: { money: 50000000, pp: 10 } }
];

/* --- Citizen personalities ------------------------------------------------------ */
const PERSONALITIES = {
  WORKAHOLIC: { icon: '💼', w: 14, work: 1.4, fun: 0.6, shop: 0.8, drive: 0.7 },
  SHOPPER: { icon: '🛍️', w: 16, work: 1, fun: 1, shop: 1.7, drive: 0.6 },
  ECO_FRIENDLY: { icon: '🌿', w: 12, work: 1, fun: 1, shop: 0.8, park: 1.8, drive: 0.15 },
  LUXURY: { icon: '💎', w: 8, work: 1, fun: 1.2, shop: 1.3, spend: 1.8, drive: 0.9 },
  FAMILY: { icon: '👨‍👩‍👧', w: 18, work: 1, fun: 0.9, shop: 1, park: 1.5, home: 1.3, drive: 0.6 },
  TECH_LOVER: { icon: '🤖', w: 12, work: 1.1, fun: 1.2, shop: 1.1, tech: 1.6, drive: 0.5 },
  TOURIST: { icon: '🧳', w: 0, work: 0, fun: 1.4, shop: 1.2, drive: 0 }
};

/* --- City feedback engine: problems with click-to-highlight ----------------------- */
const ISSUE_DEFS = {
  housing: { icon: '🏠', text: 'NOT ENOUGH HOUSING', tip: 'Citizens want to move in but homes are full. Build or zone residential.' },
  pollution: { icon: '🏭', text: 'HIGH POLLUTION', tip: 'Industry and traffic pollute the air. Add parks, trees, filters or clean power.' },
  traffic: { icon: '🚗', text: 'TRAFFIC CONGESTION', tip: 'Roads are jammed. Add parallel roads, bus stops or a metro.' },
  unemployment: { icon: '💼', text: 'HIGH UNEMPLOYMENT', tip: 'Not enough jobs. Build commercial or industrial buildings, or hire more staff.' },
  power: { icon: '⚡', text: 'LOW POWER', tip: 'Demand exceeds generation. Build a power plant.' },
  water: { icon: '💧', text: 'LOW WATER', tip: 'Water supply is short. Build a water tower or water plant.' },
  crime: { icon: '🚨', text: 'HIGH CRIME', tip: 'Areas without police coverage are unsafe. Build police stations.' },
  happiness: { icon: '😠', text: 'LOW HAPPINESS', tip: 'Citizens are unhappy. Check taxes, services and entertainment.' },
  waste: { icon: '🗑️', text: 'GARBAGE PILING UP', tip: 'Waste capacity is too low. Build garbage stations or recycling.' },
  budget: { icon: '🏛️', text: 'CITY BUDGET DEFICIT', tip: 'The budget is shrinking. Raise taxes a little or cut public upkeep.' },
  service: { icon: '🚑', text: 'NO HEALTH COVERAGE', tip: 'Many buildings have no hospital nearby.' },
  business: { icon: '📉', text: 'BUSINESS IN TROUBLE', tip: 'One of your businesses is failing. Open it to restructure or recover.' }
};
/* Thoughts citizens say out loud (only when the matching condition is true in the simulation) */
const THOUGHTS = [
  { id: 'traffic', t: ['Traffic is terrible!', 'Stuck in traffic again…', 'We need more roads!'], bad: true },
  { id: 'park', t: ['Love this park!', 'What a lovely park.', 'So green here!'] },
  { id: 'food', t: ['Need more restaurants.', 'Where can I eat around here?'], bad: true },
  { id: 'rent', t: ['Rent is too expensive.', 'I can barely pay rent…'], bad: true },
  { id: 'transit', t: ['Great public transport!', 'The metro is so fast!'] },
  { id: 'pollution', t: ['The air is so dirty…', 'Too much smog!'], bad: true },
  { id: 'jobs', t: ['I need a job!', 'No jobs anywhere…'], bad: true },
  { id: 'crime', t: ["I don't feel safe here.", 'More police please!'], bad: true },
  { id: 'power', t: ['Power went out again!', 'Blackout?!'], bad: true },
  { id: 'waste', t: ['Garbage everywhere!', 'Who picks up the trash?'], bad: true },
  { id: 'happy', t: ['I love this city!', 'Best city ever!', 'What a great day!'] },
  { id: 'shop', t: ['Great shopping here!', 'Found a bargain!'] },
  { id: 'weekend', t: ['Finally, the weekend!', 'Weekend vibes!'] },
  { id: 'fav', t: ['My favorite place!', 'Back to my favorite spot.'] },
  { id: 'metroFar', t: ['The metro is too far away.', 'We need a metro line!'], bad: true },
  { id: 'parksUp', t: ['There are more parks lately!', 'Nice new park!'] },
  { id: 'pricesUp', t: ['Market prices went up again.', 'Everything is getting expensive!'], bad: true },
  { id: 'trafficToday', t: ['Traffic is really bad today.', 'Rush hour never ends…'], bad: true },
  { id: 'winter', t: ['Brr, so cold today!', 'Stay warm, everyone!'] }
];
const REVIEW_TEXT = {
  5: ['Great service!', 'Love this place.', 'Absolutely perfect!', 'Best in town!'],
  4: ['Really good.', 'Nice place, will come back.', 'Friendly staff.'],
  3: ['It was OK.', 'Average experience.', 'Decent, nothing special.'],
  2: ['Too expensive.', 'Long waiting times.', 'Staff seemed overwhelmed.'],
  1: ['Terrible experience.', 'Never again.', 'Empty shelves, rude staff.']
};
/* Advertising tiers */
const AD_TIERS = {
  LOCAL: { id: 'LOCAL', icon: '📣', mult: 1.2, costMult: 1, dur: 180, brand: 2, tour: 0 },
  REGIONAL: { id: 'REGIONAL', icon: '📺', mult: 1.35, costMult: 4, dur: 300, brand: 5, tour: 0.05, need: 'bank' },
  GLOBAL: { id: 'GLOBAL', icon: '🌍', mult: 1.5, costMult: 15, dur: 480, brand: 10, tour: 0.1, need: 'global' }
};
/* Product lines per player company */
const PRODUCT_LINES = {
  foods: [{ n: 'Burger', i: '🍔', base: 1, el: 1.4 }, { n: 'Pizza', i: '🍕', base: 0.8, el: 1.2 }, { n: 'Coffee', i: '☕', base: 0.6, el: 0.9 }],
  tech: [{ n: 'Phone', i: '📱', base: 1, el: 1.3 }, { n: 'Laptop', i: '💻', base: 0.7, el: 1.1 }, { n: 'Robot', i: '🤖', base: 0.4, el: 0.8 }],
  industries: [{ n: 'Bricks', i: '🧱', base: 1, el: 1.5 }, { n: 'Steel', i: '🔩', base: 0.8, el: 1.2 }, { n: 'Machines', i: '⚙️', base: 0.5, el: 0.9 }],
  bank: [{ n: 'Cards', i: '💳', base: 1, el: 1.3 }, { n: 'Savings', i: '🐖', base: 0.8, el: 1 }, { n: 'Mortgages', i: '🏡', base: 0.6, el: 1.1 }]
};
const LINE_PRICES = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.8];

/* --- New Part 5 building: Startup Hub (needs a Technology District) ---------------- */
registerBuilding({ id: 'startup', name: 'Startup Hub', icon: '💡', cat: 'Commercial', sector: 'TECHNOLOGY', w: 1, h: 1, cost: 6000, color: '#7209b7', roof: '#4a0680', height: 24,
  rev: 6, cap: 90, workers: 6, maxW: 12, power: -3, water: -1, rp: 0.08, interior: 'office', techDistrict: true, unlock: { pop: 120 },
  desc: 'Home of a startup company. Must be built in a Technology District (near offices, labs or campuses). Grows through Seed → Growth → Scale-up → Unicorn.' });
