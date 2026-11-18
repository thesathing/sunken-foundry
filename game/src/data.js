// SUNKEN FOUNDRY — static game data: depths, bosses, relics, shoal hazards.
// All original. No external assets.

// Difficulty tiers: meaningfully different, not cosmetic.
// Easy: slower ball, stronger flippers, 4 pearls, long ball save, one fewer
// boss plate, gentle hazards, score x1. Medium: the base tuning. Hard: faster
// ball, weaker flippers, 3 pearls, short ball save, one extra boss plate,
// fiercer hazards, score x1.5.
export const DIFFICULTIES = {
  easy: { id: 'easy', label: 'EASY', gravity: 0.85, maxSpeed: 0.85, flipper: 1.2, pearls: 4, ballSave: 6, platesDelta: -1, scoreMult: 1, hazard: 'gentle' },
  medium: { id: 'medium', label: 'MEDIUM', gravity: 1.0, maxSpeed: 1.0, flipper: 1.0, pearls: 3, ballSave: 3, platesDelta: 0, scoreMult: 1, hazard: 'normal' },
  hard: { id: 'hard', label: 'HARD', gravity: 1.12, maxSpeed: 1.08, flipper: 0.9, pearls: 3, ballSave: 1.5, platesDelta: 1, scoreMult: 1.5, hazard: 'fierce' },
};

export const DEPTHS = [
  {
    name: 'Sunken Dock',
    sub: 'The tide gate is rusted shut.',
    tint: '#0d3b42',
    tint2: '#082a30',
    boss: {
      id: 'rivet-crab',
      name: 'RIVET CRAB',
      desc: 'Clockwork crab guarding the dock gate',
      plates: 3,
      hull: 8,
      color: '#c98a3d',
      accent: '#e8b34b',
    },
    hazard: 'crab',
    current: 'Rivet Crab scuttles the lanes — hit it for +150.',
  },
  {
    name: 'Coral Works',
    sub: 'The coral has grown over the gears.',
    tint: '#123f3a',
    tint2: '#0a2e2b',
    boss: {
      id: 'barnacle-maw',
      name: 'BARNACLE MAW',
      desc: 'A shell that eats bumpers',
      plates: 4,
      hull: 10,
      color: '#b06a4a',
      accent: '#d98a5a',
    },
    hazard: 'barnacle',
    current: 'Barnacle deadens a bumper — scrape it off with 3 hits.',
  },
  {
    name: 'Pressure Vault',
    sub: 'The vault holds its breath.',
    tint: '#17384a',
    tint2: '#0d2733',
    boss: {
      id: 'mine-mother',
      name: 'PRESSURE MINE MOTHER',
      desc: 'She lays mines in the dark',
      plates: 4,
      hull: 12,
      color: '#7a8ba0',
      accent: '#a8b8cc',
    },
    hazard: 'mine',
    current: 'Pressure mines drift the table — touch one and your combo blows.',
  },
  {
    name: 'Furnace Deep',
    sub: 'The furnace still burns below.',
    tint: '#3a2417',
    tint2: '#2a1a10',
    boss: {
      id: 'ink-squid',
      name: 'INK SQUID',
      desc: 'It clouds the glass with ink',
      plates: 5,
      hull: 14,
      color: '#5a4a7a',
      accent: '#8a76b8',
    },
    hazard: 'squid',
    current: 'Ink Squid clouds the table — the ball still glows through.',
  },
  {
    name: 'The Foundry Heart',
    sub: 'Something vast turns the great wheel.',
    tint: '#3d1a12',
    tint2: '#2a100a',
    boss: {
      id: 'brass-kraken',
      name: 'THE BRASS KRAKEN',
      desc: 'Clockwork kraken at the bottom of the world',
      plates: 6,
      hull: 18,
      color: '#c9922e',
      accent: '#f0c040',
    },
    hazard: 'eel',
    current: 'Gulper Eel stalks the drain — it steals combos.',
  },
];

export const SHOAL = [
  { id: 'crab', name: 'Rivet Crab', desc: 'scuttles the lanes: hit it for +150', mult: 'x2' },
  { id: 'barnacle', name: 'Barnacle', desc: 'deadens a bumper: hit 3x to scrape', mult: 'x3' },
  { id: 'mine', name: 'Pressure Mine', desc: 'blasts the ball: combo lost on touch', mult: 'x1' },
  { id: 'squid', name: 'Ink Squid', desc: 'clouds the table: hit to scatter ink', mult: 'x1' },
  { id: 'eel', name: 'Gulper Eel', desc: 'steals your combo: hit it first for x2', mult: 'x2' },
];

// Relics: concrete effects, applied in main.js via relic flags.
export const RELICS = [
  { id: 'lucky-current', name: 'Lucky Current', cost: 60, desc: 'One free ball save every depth. A drained ball returns once, free.' },
  { id: 'long-fuse', name: 'Long Fuse', cost: 50, desc: '+3s ball save at the start of every depth.' },
  { id: 'coral-heart', name: 'Coral Heart', cost: 55, desc: 'Combos last 1s longer before they fade.' },
  { id: 'bounty-chart', name: 'Bounty Chart', cost: 70, desc: '+50% salvage from bosses and plates.' },
  { id: 'magnet-flipper', name: 'Magnet Flipper', cost: 80, desc: 'Flipper power +15%. The ball flies harder.' },
  { id: 'copper-bumpers', name: 'Copper Bumpers', cost: 45, desc: 'Bumpers score +50 and give +2 salvage.' },
  { id: 'heavy-ball', name: 'Heavy Ball', cost: 90, desc: 'Core hits deal 2 damage instead of 1.' },
  { id: 'plunger-spring', name: 'Plunger Spring', cost: 65, desc: '+1 pearl (max 4) and a stronger launch.' },
  { id: 'ink-filter', name: 'Ink Filter', cost: 40, desc: 'Ink clouds last half as long.' },
  { id: 'salvage-hook', name: 'Salvage Hook', cost: 75, desc: '+25% salvage from every source.' },
];

export const GOAL_DEFS = [
  { id: 'plates', label: (g) => `Break plates ${g.platesBroken}/${g.platesMax}` },
  { id: 'core', label: (g) => `Crack the core ${g.coreHits}/${g.hullMax}` },
  { id: 'targets', label: (g) => `Drop targets ${g.targetsDown}/5: opens a plate` },
  { id: 'lanes', label: (g) => `Light lanes F-O-U-N-D ${g.lanesLit}/5: plate + kickback` },
  { id: 'hazard', label: (g) => `Deal with the hazard (${g.hazardDone ? 'done' : 'open'})` },
];
