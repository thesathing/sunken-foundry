// SUNKEN FOUNDRY — main game: state, loop, physics, input, HUD, shop.
// Canvas 2D, vanilla JS. All art drawn in code; all sound is WebAudio.
import { DEPTHS, RELICS, SHOAL, GOAL_DEFS, DIFFICULTIES } from './data.js';
import { AudioEngine } from './audio.js';
import { collideSegment, collideCircle, collideFlipper, clamp, mulberry32 } from './physics.js';
import { buildTable, bezier, BALL_R, GRAVITY, MAX_SPEED } from './table.js';
import { drawTable } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = new AudioEngine();
const params = new URLSearchParams(location.search);
const rng = mulberry32(Number(params.get('seed') || (Date.now() % 100000)));
// Ambient bubbles/plankton use their own seeded stream so they never disturb
// gameplay randomness (and stay deterministic in shot scenes).
const ambRng = mulberry32(20261118);

const $ = (id) => document.getElementById(id);

const G = {
  mode: 'title', // title | playing | paused | shop | victory | gameover
  time: 0,
  frozen: false,
  depthIndex: 0,
  difficulty: 'medium',
  score: 0,
  best: Number(localStorage.getItem('sunkenfoundry.best.medium') || localStorage.getItem('sunkenfoundry.best') || 0),
  combo: 0, comboTimer: 0, mult: 1, maxCombo: 0,
  pearls: 3, pearlsMax: 3,
  salvage: 0,
  relics: [],
  ballSave: 0, freeSaves: 0,
  tiltWarnings: 0, lastNudge: -10, tiltedUntil: 0,
  surge: { active: false, t: 0, cooldown: 0 },
  boss: { plates: 3, platesMax: 3, hull: 8, hullMax: 8, coreHits: 0, broken: [false, false, false], flash: 0, dieAnim: 0 },
  goals: { platesBroken: 0, coreHits: 0, targetsDown: 0, targetsDone: false, lanesLit: 0, lanesDone: false, hazardDone: false },
  ball: { x: 628, y: 132, vx: 0, vy: 0, r: BALL_R, visible: true, trail: [] },
  extraBall: null, // second ball during multiball
  multiball: false,
  locks: 0,
  orbits: { left: false, right: false },
  orbitInside: { left: false, right: false },
  kickback: false,
  skill: 0, // skill-shot band reached this ball (0 none, 1/2/3)
  shake: 0,
  transition: 0,
  justBought: false,
  ballState: 'pocket', // pocket | rail | ramp | play
  railT: 0, railPower: 1,
  charging: false, launchPower: 0.2, powerDir: 1,
  hazard: null,
  particles: [], floats: [], rings: [],
  ambient: [],
  ink: 0,
  slingCooldown: 0,
  lanesResetIn: 0, targetsResetIn: 0,
  shopOffers: [],
  stats: { bossesDown: 0, ballsLost: 0 },
  table: buildTable(),
};
G.depth = DEPTHS[0];
G.diff = DIFFICULTIES[G.difficulty];

const hasRelic = (id) => G.relics.includes(id);
const ballSaveBase = () => G.diff.ballSave + (hasRelic('long-fuse') ? 3 : 0);
const comboWindow = () => 3 + (hasRelic('coral-heart') ? 1 : 0);
const flipperPower = () => G.diff.flipper * (1 + (hasRelic('magnet-flipper') ? 0.15 : 0));
const coreDamage = () => (hasRelic('heavy-ball') ? 2 : 1);
const salvageMult = () => (hasRelic('salvage-hook') ? 1.25 : 1);
const inkDurationMult = () => (hasRelic('ink-filter') ? 0.5 : 1);
const scoreMult = () => G.diff.scoreMult * (G.multiball ? 2 : 1);

// Ambient bubbles/plankton: fixed initial positions, drift upward slowly.
for (let i = 0; i < 24; i++) {
  G.ambient.push({ x: 30 + ambRng() * 620, y: 40 + ambRng() * 660, r: 1 + ambRng() * 3, speed: 8 + ambRng() * 18, phase: ambRng() * Math.PI * 2 });
}

function bestKey(diff) { return `sunkenfoundry.best.${diff}`; }
function loadBest(diff) {
  return Number(localStorage.getItem(bestKey(diff)) || (diff === 'medium' ? localStorage.getItem('sunkenfoundry.best') : 0) || 0);
}
function saveBest() {
  if (G.score > G.best) {
    G.best = G.score;
    localStorage.setItem(bestKey(G.difficulty), String(G.best));
    localStorage.setItem('sunkenfoundry.best', String(G.best));
  }
}
function setDifficulty(id) {
  if (!DIFFICULTIES[id]) return;
  G.difficulty = id;
  G.diff = DIFFICULTIES[id];
  G.best = loadBest(id);
  document.querySelectorAll('.diff-btn').forEach((b) => b.classList.toggle('selected', b.dataset.diff === id));
  setText('title-best', 'BEST ' + (G.best > 0 ? G.best.toLocaleString('en-US') : '—') + ` (${G.diff.label})`);
  setText('difficulty', G.diff.label);
  const DIFF_DESC = {
    easy: 'Gentle dive — slower ball, stronger flippers, 4 pearls, score x1.',
    medium: 'Balanced dive — the foundry as built, score x1.',
    hard: 'Deep dive — faster ball, weaker flippers, +1 boss plate, score x1.5.',
  };
  setText('diff-desc', DIFF_DESC[id]);
}

function addHit() {
  if (G.comboTimer > 0) G.combo += 1;
  else G.combo = 1;
  G.comboTimer = comboWindow();
  G.mult = Math.min(8, 1 + Math.floor(G.combo / 4));
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
}

function scoreHit(base, x, y, label) {
  addHit();
  const amt = Math.round(base * G.mult * scoreMult() * (G.surge.active ? 2 : 1));
  G.score += amt;
  if (x !== undefined) addFloat(x, y, `+${amt}${label ? ' ' + label : ''}`, '#ffd76a');
  return amt;
}

function addScore(base, x, y, label) {
  const amt = Math.round(base * G.mult * scoreMult() * (G.surge.active ? 2 : 1));
  G.score += amt;
  if (x !== undefined) addFloat(x, y, `+${amt}${label ? ' ' + label : ''}`, '#ffd76a');
  return amt;
}

function addSalvage(n, bossBonus = false) {
  let amt = Math.round(n * salvageMult() * (bossBonus && hasRelic('bounty-chart') ? 1.5 : 1));
  G.salvage += amt;
  return amt;
}

function addFloat(x, y, text, color) {
  G.floats.push({ x, y, text, life: 1, maxLife: 1, color: color || '#ffd76a' });
  if (G.floats.length > 24) G.floats.shift();
}

function spawnParticles(x, y, n, color, speed = 180) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const s = speed * (0.3 + rng() * 0.7);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + rng() * 0.4, maxLife: 1, size: 2 + rng() * 3, color });
  }
  if (G.particles.length > 300) G.particles.splice(0, G.particles.length - 300);
}

function spawnRing(x, y, color, maxR = 70) {
  G.rings.push({ x, y, r: 6, maxR, life: 0.45, maxLife: 0.45, color });
  if (G.rings.length > 12) G.rings.shift();
}

function addShake(n) { G.shake = Math.min(9, G.shake + n); }

// ---------- depth / boss ----------

function startDepth(i) {
  G.depthIndex = i;
  G.depth = DEPTHS[i];
  const b = G.depth.boss;
  const plates = Math.max(1, b.plates + G.diff.platesDelta);
  G.boss = { plates, platesMax: plates, hull: b.hull, hullMax: b.hull, coreHits: 0, broken: Array(plates).fill(false), flash: 0, dieAnim: 0 };
  G.goals = { platesBroken: 0, coreHits: 0, targetsDown: 0, targetsDone: false, lanesLit: 0, lanesDone: false, hazardDone: false };
  for (const t of G.table.targets) { t.down = false; t.flash = 0; }
  for (const l of G.table.lanes) l.lit = false;
  for (const bp of G.table.bumpers) { bp.barnacle = false; bp.flash = 0; }
  G.table.spinner.angle = Math.PI / 2;
  G.table.spinner.omega = 0;
  G.table.spinner.spins = 0;
  G.locks = 0;
  G.orbits = { left: false, right: false };
  G.orbitInside = { left: false, right: false };
  G.kickback = false;
  G.skill = 0;
  G.multiball = false;
  G.extraBall = null;
  G.combo = 0; G.comboTimer = 0; G.mult = 1;
  G.ink = 0;
  G.ballState = 'pocket';
  G.ball.x = G.table.launchRail.p0.x;
  G.ball.y = G.table.launchRail.p0.y;
  G.ball.vx = 0; G.ball.vy = 0;
  G.ball.trail = [];
  G.ballSave = 0;
  G.freeSaves = hasRelic('lucky-current') ? 1 : 0;
  if (!G.frozen && G.mode === 'playing') G.transition = 1;
  if (G.justBought) {
    G.justBought = false;
    spawnParticles(G.ball.x, G.ball.y - 20, 18, '#ffd76a', 200);
    spawnRing(G.ball.x, G.ball.y - 20, '#ffd76a', 60);
  }
  spawnHazard();
}

function spawnHazard() {
  const type = G.depth.hazard;
  if (type === 'crab') {
    G.hazard = { type, x: 220, y: 405, vx: (rng() < 0.5 ? -1 : 1) * 42, active: true, t: 0, life: G.diff.hazard === 'fierce' ? 12 : 8, respawnIn: 0 };
  } else if (type === 'barnacle') {
    const bi = Math.floor(rng() * 3);
    G.table.bumpers[bi].barnacle = true;
    G.hazard = { type, bumper: bi, hits: 0, active: true, t: 0 };
  } else if (type === 'mine') {
    G.hazard = { type, x: 340, y: 300, vx: 26, vy: 18, active: true, t: 0, respawnIn: 0 };
  } else if (type === 'squid') {
    G.hazard = { type, x: 340, y: 250, active: true, t: 0, inkTimer: 9 };
  } else if (type === 'eel') {
    G.hazard = { type, x: 120, y: 678, dir: 1, active: true, t: 0, lungeTimer: 10 };
  }
}

function resetRun() {
  G.score = 0;
  G.combo = 0; G.comboTimer = 0; G.mult = 1; G.maxCombo = 0;
  G.pearls = G.diff.pearls; G.pearlsMax = G.diff.pearls;
  G.salvage = 0;
  G.relics = [];
  G.ballSave = 0; G.freeSaves = 0;
  G.tiltWarnings = 0; G.tiltedUntil = 0;
  G.surge = { active: false, t: 0, cooldown: 0 };
  G.ink = 0;
  G.particles = []; G.floats = []; G.rings = [];
  G.shake = 0; G.transition = 0;
  G.stats = { bossesDown: 0, ballsLost: 0 };
  G.depthIndex = 0;
  startDepth(0);
}

function breakPlate(source) {
  const idx = G.boss.broken.findIndex((b) => !b);
  if (idx < 0) return false;
  G.boss.broken[idx] = true;
  G.boss.plates -= 1;
  G.goals.platesBroken += 1;
  G.boss.flash = 0.25;
  addScore(1000, G.table.boss.x, G.table.boss.y - 70, 'PLATE!');
  addSalvage(25, true);
  spawnParticles(G.table.boss.x, G.table.boss.y, 22, '#ffd76a', 260);
  spawnRing(G.table.boss.x, G.table.boss.y, '#ffd76a', 90);
  addShake(4);
  audio.plate();
  if (G.boss.plates === 0) addFloat(G.table.boss.x, G.table.boss.y + 80, 'CORE EXPOSED!', '#ff6a4a');
  return true;
}

function bossHit(cx, cy) {
  if (G.boss.dieAnim > 0) return;
  const b = G.table.boss;
  if (G.boss.plates > 0) {
    const ang = Math.atan2(cy - b.y, cx - b.x);
    const norm = ((ang + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.min(G.boss.platesMax - 1, Math.floor(norm / (Math.PI * 2 / G.boss.platesMax)));
    if (!G.boss.broken[idx]) {
      G.boss.broken[idx] = true;
      G.boss.plates -= 1;
      G.goals.platesBroken += 1;
      G.boss.flash = 0.2;
      scoreHit(1000, cx, cy, 'PLATE!');
      addSalvage(25, true);
      spawnParticles(cx, cy, 18, '#ffd76a', 240);
      spawnRing(cx, cy, '#ffd76a', 70);
      addShake(4);
      audio.plate();
      if (G.boss.plates === 0) addFloat(b.x, b.y + 84, 'CORE EXPOSED!', '#ff6a4a');
      return;
    }
    // Hit an already-broken plate sector: just a bounce.
    return;
  }
  // Core exposed: crack it.
  const dmg = coreDamage();
  G.boss.hull -= dmg;
  G.goals.coreHits += dmg;
  G.boss.flash = 0.15;
  scoreHit(500, cx, cy, 'CORE!');
  spawnParticles(cx, cy, 12, '#ff9a3a', 200);
  addShake(2);
  audio.core();
  if (G.boss.hull <= 0) bossDie();
}

function bossDie() {
  G.boss.dieAnim = 1.4;
  G.boss.hull = 0;
  G.stats.bossesDown += 1;
  addScore(2500 + 100 * G.pearls, G.table.boss.x, G.table.boss.y - 90, 'BOSS DOWN!');
  addSalvage(50, true);
  spawnParticles(G.table.boss.x, G.table.boss.y, 46, '#ffd76a', 340);
  spawnParticles(G.table.boss.x, G.table.boss.y, 24, '#ff6a4a', 260);
  spawnRing(G.table.boss.x, G.table.boss.y, '#ffd76a', 130);
  addShake(8);
  audio.bossDie();
}

function depthClear() {
  if (G.depthIndex >= 4) {
    victory();
    return;
  }
  openShop();
}

function victory() {
  G.mode = 'victory';
  saveBest();
  $('victory-score').textContent = G.score.toLocaleString('en-US');
  $('victory-best').textContent = 'BEST ' + G.best.toLocaleString('en-US') + ` (${G.diff.label})`;
  $('victory-stats').textContent = `5 depths cleared • ${G.stats.bossesDown} bosses down • max combo ${G.maxCombo} • ${G.stats.ballsLost} pearls lost`;
  showOverlay('overlay-victory');
  audio.win();
}

function gameOver() {
  G.mode = 'gameover';
  saveBest();
  $('gameover-score').textContent = G.score.toLocaleString('en-US');
  $('gameover-best').textContent = 'BEST ' + G.best.toLocaleString('en-US') + ` (${G.diff.label})`;
  $('gameover-stats').textContent = `Reached depth ${G.depthIndex + 1} (${G.depth.name}) • ${G.stats.bossesDown} bosses down • max combo ${G.maxCombo}`;
  showOverlay('overlay-gameover');
  audio.lose();
}

function handleDrain() {
  const b = G.ball;
  spawnParticles(b.x, 700, 12, '#7ad9c8', 160);
  if (G.ballSave > 0) {
    G.ballSave = 0;
    respawnBall();
    addFloat(340, 640, 'BALL SAVED!', '#7ad9c8');
    audio.save();
    return;
  }
  if (G.freeSaves > 0) {
    G.freeSaves -= 1;
    respawnBall();
    addFloat(340, 640, 'LUCKY CURRENT!', '#7ad9c8');
    audio.save();
    return;
  }
  G.pearls -= 1;
  G.stats.ballsLost += 1;
  G.combo = 0; G.mult = 1; G.comboTimer = 0;
  audio.drain();
  if (G.pearls <= 0) {
    G.ballState = 'gone';
    b.visible = false;
    gameOver();
  } else {
    respawnBall();
  }
}

function respawnBall() {
  G.ballState = 'pocket';
  G.ball.x = G.table.launchRail.p0.x;
  G.ball.y = G.table.launchRail.p0.y;
  G.ball.vx = 0; G.ball.vy = 0;
  G.ball.trail = [];
}

// ---------- shop ----------

function openShop() {
  G.mode = 'shop';
  const unowned = RELICS.filter((r) => !hasRelic(r.id));
  const offers = [];
  const pool = [...unowned];
  while (offers.length < 3 && pool.length > 0) {
    offers.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  G.shopOffers = offers;
  $('shop-sub').textContent = `${G.depth.name} cleared. The next gate grinds open — spend your salvage.`;
  $('shop-next').textContent = DEPTHS[G.depthIndex + 1].name;
  renderShop();
  showOverlay('overlay-shop');
}

function renderShop() {
  $('shop-salvage').textContent = `⚙ ${G.salvage}`;
  const wrap = $('shop-items');
  wrap.innerHTML = '';
  if (G.shopOffers.length === 0) {
    wrap.innerHTML = '<div class="shop-item"><h3>Relic vault empty</h3><p>You own every relic. Descend, diver.</p></div>';
    return;
  }
  G.shopOffers.forEach((r, i) => {
    const owned = hasRelic(r.id);
    const afford = G.salvage >= r.cost;
    const div = document.createElement('div');
    div.className = 'shop-item' + (owned ? ' owned' : '');
    div.innerHTML = `<h3>[${i + 1}] ${r.name}</h3><p>${r.desc}</p><div class="cost">⚙ ${r.cost}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = owned ? 'OWNED' : afford ? 'BUY' : 'TOO PRICEY';
    btn.disabled = owned || !afford;
    btn.addEventListener('click', () => buyRelic(r.id));
    div.appendChild(btn);
    wrap.appendChild(div);
  });
}

function buyRelic(id) {
  const r = RELICS.find((x) => x.id === id);
  if (!r || hasRelic(id) || G.salvage < r.cost) { audio.deny(); return; }
  G.salvage -= r.cost;
  G.relics.push(id);
  if (id === 'plunger-spring') {
    G.pearlsMax = Math.min(5, G.pearlsMax + 1);
    G.pearls = Math.min(G.pearlsMax, G.pearls + 1);
  }
  G.justBought = true;
  audio.buy();
  renderShop();
}

function continueFromShop() {
  hideOverlays();
  G.mode = 'playing';
  startDepth(G.depthIndex + 1);
}

// ---------- update ----------

function update(dt) {
  G.slingCooldown = Math.max(0, G.slingCooldown - dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - G.shake * 6 * dt - 2 * dt);
  if (G.transition > 0) G.transition = Math.max(0, G.transition - dt * 1.4);
  // Spinner free-spin with damping.
  const sp = G.table.spinner;
  sp.angle += sp.omega * dt;
  sp.omega *= Math.max(0, 1 - 2.2 * dt);
  // Ambient bubbles drift upward, wrap around.
  for (const a of G.ambient) {
    a.y -= a.speed * dt;
    a.x += Math.sin(G.time * 0.5 + a.phase) * 6 * dt;
    if (a.y < 20) { a.y = 700; a.x = 30 + ((a.x * 7 + 130) % 620); }
  }
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) { G.combo = 0; G.mult = 1; }
  }
  if (G.ballSave > 0) G.ballSave -= dt;
  if (G.surge.active) {
    G.surge.t -= dt;
    if (G.surge.t <= 0) G.surge.active = false;
  }
  if (G.surge.cooldown > 0) G.surge.cooldown -= dt;
  if (G.time - G.lastNudge > 3) G.tiltWarnings = 0;
  if (G.ink > 0) G.ink = Math.max(0, G.ink - dt / (2.5 * inkDurationMult()));
  if (G.boss.flash > 0) G.boss.flash -= dt;
  for (const bp of G.table.bumpers) if (bp.flash > 0) bp.flash -= dt;
  for (const t of G.table.targets) if (t.flash > 0) t.flash -= dt;

  if (G.boss.dieAnim > 0) {
    G.boss.dieAnim -= dt;
    if (G.boss.dieAnim <= 0) { G.boss.dieAnim = 0; depthClear(); return; }
  }

  if (G.lanesResetIn > 0) {
    G.lanesResetIn -= dt;
    if (G.lanesResetIn <= 0) for (const l of G.table.lanes) l.lit = false;
  }
  if (G.targetsResetIn > 0) {
    G.targetsResetIn -= dt;
    if (G.targetsResetIn <= 0) {
      for (const t of G.table.targets) t.down = false;
      G.goals.targetsDown = 0;
    }
  }

  updateFlippers(dt);
  updateHazard(dt);
  updateParticles(dt);

  // Ball trails.
  for (const b of [G.ball, G.extraBall]) {
    if (!b) continue;
    if (b.visible && G.ballState === 'play') {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 16) b.trail.shift();
    } else if (b.trail.length > 0) {
      b.trail.shift();
    }
  }

  if (G.ballState === 'rail' || G.ballState === 'ramp') {
    const isRamp = G.ballState === 'ramp';
    G.railT += dt / (isRamp ? 0.6 : 0.45);
    const r = isRamp ? G.table.ramp.rail : G.table.launchRail;
    const p = bezier(r.p0, r.p1, r.p2, r.p3, Math.min(1, G.railT));
    G.ball.x = p.x; G.ball.y = p.y;
    if (G.railT >= 1) {
      G.ballState = 'play';
      if (isRamp) {
        G.ball.vx = G.table.ramp.exit.vx;
        G.ball.vy = G.table.ramp.exit.vy;
      } else {
        const speed = 380 + 420 * G.railPower;
        G.ball.vx = -0.815 * speed;
        G.ball.vy = 0.58 * speed;
        G.ballSave = ballSaveBase();
        awardSkillShot();
      }
    }
    return;
  }

  if (G.ballState === 'play') {
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      // A substep can change ballState (lock capture, ramp entry) — re-check.
      if (G.ballState === 'play') stepPhysics(h, G.ball, false);
      if (G.extraBall) stepPhysics(h, G.extraBall, true);
    }
    if (G.ballState === 'play' && G.ball.y - G.ball.r > 706) handleDrain();
    if (G.extraBall && G.extraBall.y - G.extraBall.r > 706) {
      spawnParticles(G.extraBall.x, 700, 10, '#7ad9c8', 140);
      G.extraBall = null;
      addFloat(340, 640, 'EXTRA BALL DRAINED', '#8aa8a0');
    }
  }
}

function awardSkillShot() {
  const p = G.railPower;
  if (p >= 0.9) {
    G.skill = 3;
    scoreHit(1000, 470, 120, 'PERFECT SKILL SHOT!');
    spawnRing(470, 120, '#ffd76a', 80);
  } else if (p >= 0.65) {
    G.skill = 2;
    scoreHit(500, 470, 120, 'SKILL SHOT!');
  } else if (p >= 0.4) {
    G.skill = 1;
    scoreHit(100, 470, 120, 'SKILL SHOT');
  } else {
    G.skill = 0;
  }
}

function startMultiball() {
  G.multiball = true;
  G.locks = 0;
  G.extraBall = { x: G.table.lock.x, y: G.table.lock.y, vx: -260, vy: -420, r: BALL_R, visible: true, trail: [] };
  addFloat(340, 360, 'MULTIBALL!', '#ffd76a');
  spawnParticles(G.table.lock.x, G.table.lock.y, 26, '#ffd76a', 300);
  spawnRing(G.table.lock.x, G.table.lock.y, '#ffd76a', 100);
  audio.bossDie();
}

function updateFlippers(dt) {
  const tilted = G.time < G.tiltedUntil;
  for (const side of ['left', 'right']) {
    const f = G.table.flippers[side];
    const target = f.pressed && !tilted ? f.upAngle : f.restAngle;
    // Snap up fast, ease back down — gives the flip a punchy feel.
    const speed = (target === f.upAngle ? 34 : 20) * flipperPower();
    const prev = f.angle;
    const diff = target - f.angle;
    const step = clamp(diff, -speed * dt, speed * dt);
    f.angle = prev + step;
    f.omega = dt > 0 ? (f.angle - prev) / dt : 0;
  }
}

function stepPhysics(h, b, isExtra) {
  b.vy += GRAVITY * G.diff.gravity * h;
  const maxSp = MAX_SPEED * G.diff.maxSpeed;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > maxSp) { b.vx *= maxSp / sp; b.vy *= maxSp / sp; }
  b.x += b.vx * h;
  b.y += b.vy * h;

  // Walls.
  for (const w of G.table.walls) {
    const hit = collideSegment(b, w);
    if (hit && w.sling && hit.impact > 80 && G.slingCooldown <= 0) {
      const dx = b.x - w.cx, dy = b.y - w.cy;
      const d = Math.hypot(dx, dy) || 1;
      b.vx += (dx / d) * 260;
      b.vy += (dy / d) * 260 - 60;
      G.slingCooldown = 0.15;
      scoreHit(50, b.x, b.y, '');
      audio.sling();
      spawnParticles(b.x, b.y, 5, '#ffd76a', 140);
    }
  }

  // Bumpers.
  for (const bp of G.table.bumpers) {
    const hit = collideCircle(b, bp, bp.boost);
    if (hit) {
      bp.flash = 0.15;
      if (bp.barnacle) {
        const hz = G.hazard;
        if (hz && hz.type === 'barnacle') {
          hz.hits += 1;
          audio.target();
          if (hz.hits >= 3) {
            bp.barnacle = false;
            G.goals.hazardDone = true;
            addFloat(bp.x, bp.y - 36, 'BARNACLE SCRAPED!', '#7ad9c8');
            scoreHit(150, bp.x, bp.y, '');
            audio.plate();
          } else {
            addFloat(bp.x, bp.y - 36, `SCRAPE ${hz.hits}/3`, '#8aa8a0');
          }
        }
      } else {
        const bonus = hasRelic('copper-bumpers') ? 50 : 0;
        scoreHit(100 + bonus, bp.x, bp.y - 34, '');
        addSalvage(5 + (hasRelic('copper-bumpers') ? 2 : 0));
        audio.bumper();
        spawnParticles(bp.x, bp.y, 7, '#ffd76a', 180);
        spawnRing(bp.x, bp.y, '#ffd76a', 46);
      }
    }
  }

  // Spinner: rotating brass bar. A hit spins it and scores.
  const spn = G.table.spinner;
  const sx1 = spn.x - Math.cos(spn.angle) * spn.len, sy1 = spn.y - Math.sin(spn.angle) * spn.len;
  const sx2 = spn.x + Math.cos(spn.angle) * spn.len, sy2 = spn.y + Math.sin(spn.angle) * spn.len;
  const spinHit = collideSegment(b, { x1: sx1, y1: sy1, x2: sx2, y2: sy2, rest: 0.6 });
  if (spinHit && spinHit.impact > 60) {
    const side = (b.x - spn.x) * -Math.sin(spn.angle) + (b.y - spn.y) * Math.cos(spn.angle) > 0 ? 1 : -1;
    spn.omega += side * 5;
    spn.spins += 1;
    scoreHit(100, spn.x, spn.y - 40, 'SPIN!');
    audio.target();
    if (spn.spins % 5 === 0) {
      addScore(250, spn.x, spn.y - 40, 'SPIN BONUS!');
      spawnRing(spn.x, spn.y, '#ffd76a', 60);
    }
  }

  // Boss.
  const bossC = G.table.boss;
  const bossHitRes = collideCircle(b, { x: bossC.x, y: bossC.y, r: bossC.r, rest: 0.5 }, 0);
  if (bossHitRes) {
    const cx = bossC.x + ((b.x - bossC.x) / (Math.hypot(b.x - bossC.x, b.y - bossC.y) || 1)) * bossC.r;
    const cy = bossC.y + ((b.y - bossC.y) / (Math.hypot(b.x - bossC.x, b.y - bossC.y) || 1)) * bossC.r;
    bossHit(cx, cy);
  }

  // Drop targets (circle vs AABB).
  for (const t of G.table.targets) {
    if (t.down) continue;
    const cx = clamp(b.x, t.x, t.x + t.w);
    const cy = clamp(b.y, t.y, t.y + t.h);
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < b.r) {
      t.down = true;
      t.flash = 0.2;
      G.goals.targetsDown += 1;
      scoreHit(150, t.x + t.w / 2, t.y - 10, '');
      addSalvage(10);
      audio.target();
      spawnParticles(t.x + t.w / 2, t.y, 6, '#ff6a4a', 150);
      // Push the ball out of the target.
      const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
      b.x += nx * (b.r - d);
      b.y += ny * (b.r - d);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
      if (G.goals.targetsDown >= 5 && !G.goals.targetsDone) {
        G.goals.targetsDone = true;
        G.targetsResetIn = 0.8;
        if (G.boss.plates > 0) {
          breakPlate('targets');
          addFloat(340, 300, 'TARGETS OPEN A PLATE!', '#7ad9c8');
        } else {
          addScore(1000, 340, 300, 'BANK BONUS!');
        }
      }
    }
  }

  // Rollover lanes (sensors).
  for (const lane of G.table.lanes) {
    if (lane.lit) continue;
    if (Math.hypot(b.x - lane.x, b.y - lane.y) < lane.r + b.r) {
      lane.lit = true;
      G.goals.lanesLit += 1;
      scoreHit(200, lane.x, lane.y + 24, 'LANE!');
      addSalvage(15);
      audio.lane();
      if (G.goals.lanesLit >= 5 && !G.goals.lanesDone) {
        G.goals.lanesDone = true;
        G.lanesResetIn = 1;
        addScore(1000, 340, 160, 'FOUND!');
        if (!G.kickback) {
          G.kickback = true;
          addFloat(340, 190, 'KICKBACK CHARGED!', '#7ad9c8');
        }
        if (G.boss.plates > 0) breakPlate('lanes');
        else addScore(1000, 340, 300, 'LANE BONUS!');
      }
    }
  }

  // Orbit sensors: rolling down an outer corridor lights that orbit.
  // Entry only — the sensor must not re-fire while the ball is still
  // passing through it, or the bonus would pay twice on one roll.
  for (const side of ['left', 'right']) {
    const o = G.table.orbits[side];
    const inside = Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.r;
    if (inside && !G.orbitInside[side] && !G.orbits[side] && b.vy > 0) {
      G.orbits[side] = true;
      scoreHit(250, o.x, o.y, side === 'left' ? 'LEFT ORBIT!' : 'RIGHT ORBIT!');
      audio.lane();
      if (G.orbits.left && G.orbits.right) {
        G.orbits.left = false; G.orbits.right = false;
        addScore(1000, 340, 160, 'ORBIT BONUS!');
        spawnRing(340, 160, '#7ad9c8', 90);
      }
    }
    G.orbitInside[side] = inside;
  }

  // Return ramp: a fast upward shot into the gate rides the rail over the
  // top and drops back at the upper-left playfield.
  if (!isExtra) {
    const re = G.table.ramp.entry;
    if (b.vy < -150 && Math.hypot(b.x - re.x, b.y - re.y) < re.r + b.r) {
      G.ballState = 'ramp';
      G.railT = 0;
      addFloat(re.x, re.y - 30, 'RAMP!', '#7ad9c8');
      audio.launch();
      return;
    }
  }

  // Multiball lock: the saucer swallows the ball. Three locks start multiball.
  const lk = G.table.lock;
  if (!isExtra && !G.multiball && Math.hypot(b.x - lk.x, b.y - lk.y) < lk.r + b.r * 0.4) {
    G.locks += 1;
    spawnParticles(lk.x, lk.y, 16, '#ffd76a', 220);
    spawnRing(lk.x, lk.y, '#ffd76a', 70);
    audio.plate();
    if (G.locks >= 3) {
      addScore(1500, lk.x, lk.y - 30, 'LOCK 3/3!');
      startMultiball();
      respawnBall();
    } else {
      addScore(500, lk.x, lk.y - 30, `LOCK ${G.locks}/3!`);
      respawnBall();
    }
    return;
  }
  if (isExtra) {
    // The lock is a solid saucer for the extra ball: bounce it out.
    collideCircle(b, { x: lk.x, y: lk.y, r: lk.r, rest: 0.5 }, 0);
  }

  // Kickback: a charged kickback fires a ball out of the left outlane.
  if (!isExtra && G.kickback && b.x < 88 && b.y > 600 && b.y < 660 && b.vy > 0) {
    G.kickback = false;
    b.vy = -780;
    b.vx = 280;
    addFloat(b.x, b.y - 24, 'KICKBACK!', '#7ad9c8');
    spawnParticles(b.x, b.y, 14, '#7ad9c8', 220);
    audio.save();
  }

  // Flippers.
  for (const side of ['left', 'right']) {
    collideFlipper(b, G.table.flippers[side]);
  }

  // Hazard contact.
  const hz = G.hazard;
  if (hz && hz.active && hz.type !== 'barnacle') {
    const d = Math.hypot(b.x - hz.x, b.y - hz.y);
    if (hz.type === 'crab' && d < 30) {
      G.goals.hazardDone = true;
      hz.active = false;
      scoreHit(150, hz.x, hz.y - 24, 'CRAB!');
      spawnParticles(hz.x, hz.y, 10, '#c98a3d', 180);
      audio.hazard();
    } else if (hz.type === 'mine' && d < 26) {
      if (G.diff.hazard === 'gentle') {
        G.combo = Math.floor(G.combo / 2);
        G.mult = Math.min(8, 1 + Math.floor(G.combo / 4));
        addFloat(hz.x, hz.y - 24, 'MINE! COMBO HALVED', '#ff6a4a');
      } else {
        G.combo = 0; G.mult = 1; G.comboTimer = 0;
        addFloat(hz.x, hz.y - 24, 'MINE! COMBO LOST', '#ff6a4a');
      }
      const dx = b.x - hz.x, dy = b.y - hz.y;
      const dd = Math.hypot(dx, dy) || 1;
      b.vx += (dx / dd) * 520;
      b.vy += (dy / dd) * 520;
      G.goals.hazardDone = true;
      hz.active = false;
      hz.respawnIn = G.diff.hazard === 'fierce' ? 4 : 8;
      spawnParticles(hz.x, hz.y, 22, '#ff6a4a', 300);
      addShake(6);
      audio.hazard();
    } else if (hz.type === 'squid' && d < 30) {
      G.goals.hazardDone = true;
      hz.active = false;
      G.ink = 0;
      scoreHit(150, hz.x, hz.y - 24, 'SQUID!');
      spawnParticles(hz.x, hz.y, 10, '#8a76b8', 180);
      audio.hazard();
    } else if (hz.type === 'eel' && d < 36) {
      G.goals.hazardDone = true;
      hz.active = false;
      scoreHit(150, hz.x, hz.y - 24, 'EEL!');
      spawnParticles(hz.x, hz.y, 10, '#4a7a5a', 180);
      audio.hazard();
    }
  }
}

function updateHazard(dt) {
  const hz = G.hazard;
  if (!hz) return;
  hz.t += dt;
  if (!hz.active) {
    if (hz.respawnIn !== undefined && hz.respawnIn > 0) {
      hz.respawnIn -= dt;
      if (hz.respawnIn <= 0 && !G.goals.hazardDone) {
        if (hz.type === 'crab') { hz.active = true; hz.t = 0; hz.life = 8; hz.x = 340; }
        if (hz.type === 'mine') { hz.active = true; hz.t = 0; hz.x = 340; hz.y = 300; }
      }
    }
    return;
  }
  if (hz.type === 'crab') {
    hz.x += hz.vx * dt;
    if (hz.x < 130 || hz.x > 550) hz.vx *= -1;
    if (hz.t > hz.life) { hz.active = false; hz.respawnIn = 6; }
  } else if (hz.type === 'mine') {
    hz.x += hz.vx * dt;
    hz.y += hz.vy * dt;
    if (hz.x < 70 || hz.x > 610) hz.vx *= -1;
    if (hz.y < 130 || hz.y > 620) hz.vy *= -1;
    if (hz.t > 22) { hz.active = false; hz.respawnIn = 8; }
  } else if (hz.type === 'squid') {
    hz.x = 340 + Math.sin(hz.t * 0.7) * 60;
    hz.y = 250 + Math.sin(hz.t * 1.1) * 20;
    hz.inkTimer -= dt;
    if (hz.inkTimer <= 0) {
      G.ink = 1;
      hz.inkTimer = G.diff.hazard === 'fierce' ? 6 : G.diff.hazard === 'gentle' ? 12 : 9;
      audio.hazard();
    }
  } else if (hz.type === 'eel') {
    hz.x += hz.dir * 55 * dt;
    if (hz.x < 70 || hz.x > 610) hz.dir *= -1;
    hz.lungeTimer -= dt;
    if (hz.lungeTimer <= 0) {
      hz.lungeTimer = G.diff.hazard === 'fierce' ? 6 : 10;
      if (G.ballState === 'play' && G.ball.y > 500 && G.combo > 0) {
        if (G.diff.hazard === 'gentle') {
          G.combo = Math.floor(G.combo / 2);
          G.mult = Math.min(8, 1 + Math.floor(G.combo / 4));
          addFloat(G.ball.x, G.ball.y - 24, 'COMBO NIBBLED!', '#4a7a5a');
        } else {
          G.combo = 0; G.mult = 1; G.comboTimer = 0;
          addFloat(G.ball.x, G.ball.y - 24, 'COMBO STOLEN!', '#4a7a5a');
        }
        audio.hazard();
      }
    }
  }
}

function updateParticles(dt) {
  for (const p of G.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const rg of G.rings) {
    rg.r += (rg.maxR - rg.r) * dt * 6;
    rg.life -= dt;
  }
  G.rings = G.rings.filter((rg) => rg.life > 0);
  for (const f of G.floats) {
    f.y -= 34 * dt;
    f.life -= dt;
  }
  G.floats = G.floats.filter((f) => f.life > 0);
}

// ---------- input ----------

const keys = {};
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  audio.ensure();
  keys[e.code] = true;
  const fl = G.table.flippers;
  switch (e.code) {
    case 'KeyZ':
    case 'ArrowLeft':
      fl.left.pressed = true;
      if (G.mode === 'playing') audio.flip();
      break;
    case 'Slash':
    case 'ArrowRight':
      fl.right.pressed = true;
      if (G.mode === 'playing') audio.flip();
      break;
    case 'Space':
      if (G.mode === 'title') { startGame(); break; }
      if (G.mode === 'victory' || G.mode === 'gameover') { startGame(); break; }
      if (G.mode === 'shop') { continueFromShop(); break; }
      if (G.mode === 'playing' && G.ballState === 'pocket') {
        G.charging = true;
        G.launchPower = 0.2;
        G.powerDir = 1;
      }
      break;
    case 'Enter':
      if (G.mode === 'title' || G.mode === 'victory' || G.mode === 'gameover') startGame();
      else if (G.mode === 'shop') continueFromShop();
      break;
    case 'KeyE':
      if (G.mode === 'playing' && !G.surge.active && G.surge.cooldown <= 0) {
        G.surge.active = true;
        G.surge.t = 4;
        G.surge.cooldown = 15;
        addFloat(340, 360, 'SURGE!', '#ff9a3a');
        audio.surge();
      }
      break;
    case 'KeyA':
    case 'KeyD':
    case 'KeyW':
      if (G.mode === 'playing' && G.ballState === 'play' && G.time >= G.tiltedUntil) {
        const b = G.ball;
        if (e.code === 'KeyA') b.vx -= 200;
        if (e.code === 'KeyD') b.vx += 200;
        if (e.code === 'KeyW') b.vy -= 260;
        if (G.time - G.lastNudge < 1.5) G.tiltWarnings += 1;
        else G.tiltWarnings = 1;
        G.lastNudge = G.time;
        audio.nudge();
        if (G.tiltWarnings >= 3) {
          G.tiltedUntil = G.time + 3;
          G.tiltWarnings = 0;
          G.combo = 0; G.mult = 1; G.comboTimer = 0;
          addFloat(340, 360, 'TILT!', '#ff6a4a');
          audio.tilt();
        }
      }
      break;
    case 'KeyP':
      if (G.mode === 'playing') {
        G.mode = 'paused';
        showOverlay('overlay-pause');
      } else if (G.mode === 'paused') {
        hideOverlays();
        G.mode = 'playing';
      }
      break;
    case 'KeyM':
      audio.enabled = !audio.enabled;
      break;
    case 'KeyR':
      if (G.mode === 'victory' || G.mode === 'gameover' || G.mode === 'paused') startGame();
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
      if (G.mode === 'shop') {
        const offer = G.shopOffers[Number(e.code.slice(-1)) - 1];
        if (offer) buyRelic(offer.id);
      } else if (G.mode === 'title') {
        setDifficulty(['easy', 'medium', 'hard'][Number(e.code.slice(-1)) - 1]);
        audio.lane();
      }
      break;
    default:
      break;
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  const fl = G.table.flippers;
  if (e.code === 'KeyZ' || e.code === 'ArrowLeft') fl.left.pressed = false;
  if (e.code === 'Slash' || e.code === 'ArrowRight') fl.right.pressed = false;
  if (e.code === 'Space' && G.charging) {
    G.charging = false;
    if (G.mode === 'playing' && G.ballState === 'pocket') {
      G.ballState = 'rail';
      G.railT = 0;
      G.railPower = G.launchPower;
      audio.launch();
    }
  }
});

function startGame() {
  hideOverlays();
  audio.ensure();
  resetRun();
  G.mode = 'playing';
}

// ---------- HUD ----------

function setText(id, v) {
  const el = $(id);
  if (el && el._v !== v) { el.textContent = v; el._v = v; }
}
function setWidth(id, pct) {
  const el = $(id);
  const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  if (el && el._v !== v) { el.style.width = v; el._v = v; }
}

function updateHUD() {
  const d = G.depth;
  const boss = G.boss;
  setText('depth-num', `${G.depthIndex + 1}/5`);
  setText('depth-name', d.name);
  setText('depth-sub', d.sub);
  setText('depth-current', 'CURRENT: ' + d.current);
  const depthProg = ((G.depthIndex + (G.goals.platesBroken + boss.coreHits) / (boss.platesMax + boss.hullMax)) / 5) * 100;
  setWidth('depth-fill', depthProg);

  const phase = 1 + Math.min(2, Math.floor(((G.goals.platesBroken + boss.coreHits) / (boss.platesMax + boss.hullMax)) * 3));
  setText('boss-phase', `PHASE ${phase}/3`);
  setText('boss-name', d.boss.name);
  setText('boss-desc', d.boss.desc);
  const hullState = boss.plates > 0 ? 'ARMORED' : boss.hull > boss.hullMax * 0.25 ? 'EXPOSED' : 'CRITICAL';
  setText('boss-hull-state', hullState);
  setText('boss-hull-num', `${Math.max(0, boss.hull)}/${boss.hullMax}`);
  setWidth('boss-hull-fill', (Math.max(0, boss.hull) / boss.hullMax) * 100);
  setText('boss-plates', Array.from({ length: boss.platesMax }, (_, i) => (boss.broken[i] ? '□' : '■')).join(' '));
  setText('boss-plates-open', boss.plates > 0
    ? `${boss.plates} PLATE${boss.plates > 1 ? 'S' : ''} — BREAK THEM TO EXPOSE THE CORE`
    : 'CORE EXPOSED — CRACK IT!');

  const g = G.goals;
  const doneCount = (boss.plates === 0 ? 1 : 0) + (boss.hull <= 0 ? 1 : 0) + (g.targetsDone ? 1 : 0) + (g.lanesDone ? 1 : 0) + (g.hazardDone ? 1 : 0);
  setText('goals-done', `${doneCount}/5 done`);
  const goalItems = [
    { done: boss.plates === 0, label: `Break plates ${g.platesBroken}/${boss.platesMax}` },
    { done: boss.hull <= 0, label: `Crack the core ${Math.min(boss.coreHits, boss.hullMax)}/${boss.hullMax}` },
    { done: g.targetsDone, label: `Drop targets ${g.targetsDown}/5: opens a plate` },
    { done: g.lanesDone, label: `Light lanes F-O-U-N-D ${g.lanesLit}/5: plate + kickback` },
    { done: g.hazardDone, label: `Deal with the hazard (${g.hazardDone ? 'done' : 'open'})` },
  ];
  setText('lose-cond', `LOSE: all ${G.pearlsMax} pearls drain`);
  const gl = $('goals-list');
  const gh = goalItems.map((x) => `<li class="${x.done ? 'done' : ''}">${x.done ? '☑' : '☐'} ${x.label}</li>`).join('');
  if (gl._v !== gh) { gl.innerHTML = gh; gl._v = gh; }

  const sl = $('shoal-list');
  const sh = SHOAL.map((s) => {
    const active = G.depth.hazard === s.id;
    return `<li class="${active ? 'active' : ''}">${active ? '▶ ' : ''}${s.name} <span class="mult">${s.mult}</span><br><span class="dim">${s.desc}</span></li>`;
  }).join('');
  if (sl._v !== sh) { sl.innerHTML = sh; sl._v = sh; }
  setText('shoal-count', '5 on table');

  setText('score', G.score.toLocaleString('en-US'));
  setText('best', 'BEST ' + (G.best > 0 ? G.best.toLocaleString('en-US') : '—') + ` (${G.diff.label})`);
  setText('difficulty', G.diff.label);
  setText('locks', G.multiball ? 'MULTIBALL!' : Array.from({ length: 3 }, (_, i) => (i < G.locks ? '●' : '○')).join(' '));
  setText('combo-best', `best ${G.maxCombo} hits`);
  setText('combo-val', `x${G.mult}`);
  setText('combo-hits', `${G.combo} hits`);
  setWidth('combo-fill', (G.comboTimer / comboWindow()) * 100);
  setText('combo-note', G.combo > 0 ? `${G.comboTimer.toFixed(1)}s left to keep the chain alive.` : 'Hit anything to keep the chain alive.');
  setText('pearls', Array.from({ length: G.pearlsMax }, (_, i) => (i < G.pearls ? '●' : '○')).join(' '));
  setText('pearls-left', `${G.pearls} left`);
  setText('salvage', `⚙ ${G.salvage}`);
  setText('ball-save', G.ballSave > 0 ? `ON — ${G.ballSave.toFixed(1)}s` : (G.freeSaves > 0 ? 'LUCKY CURRENT READY' : 'OFF'));
  setText('tilt', G.time < G.tiltedUntil ? 'TILTED!' : `${G.tiltWarnings}/3 warnings`);
  setText('surge', G.surge.active ? `SURGING ${G.surge.t.toFixed(1)}s — x2 SCORE` : G.surge.cooldown > 0 ? `recharging ${G.surge.cooldown.toFixed(0)}s` : 'READY');
  setWidth('surge-fill', G.surge.active ? (G.surge.t / 4) * 100 : G.surge.cooldown > 0 ? (1 - G.surge.cooldown / 15) * 100 : 100);
  setText('relics-count', `${G.relics.length} held`);
  const rl = $('relics-list');
  const rh = G.relics.length === 0
    ? '<li><span class="rdesc">No relics yet — clear a depth to visit the shop.</span></li>'
    : G.relics.map((id) => {
      const r = RELICS.find((x) => x.id === id);
      return `<li>◆ ${r.name}<span class="rdesc">${r.desc}</span></li>`;
    }).join('');
  if (rl._v !== rh) { rl.innerHTML = rh; rl._v = rh; }
  setText('title-best', 'BEST ' + (G.best > 0 ? G.best.toLocaleString('en-US') : '—'));
}

// ---------- overlays ----------

function showOverlay(id) {
  for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
  $(id).classList.remove('hidden');
}
function hideOverlays() {
  for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
}

$('btn-start').addEventListener('click', startGame);
document.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));
$('btn-resume').addEventListener('click', () => { hideOverlays(); G.mode = 'playing'; });
$('btn-restart-pause').addEventListener('click', startGame);
$('btn-continue').addEventListener('click', continueFromShop);
$('btn-again').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);

// ---------- debug hooks (tests only) ----------

window.__game = G;
window.__debug = {
  setDifficulty(d) { setDifficulty(d); },
  launch(power = 1) {
    if (G.ballState === 'pocket' && G.mode === 'playing') {
      G.ballState = 'rail'; G.railT = 0; G.railPower = power;
    }
  },
  teleportBall(x, y, vx = 0, vy = 0) {
    G.ball.x = x; G.ball.y = y; G.ball.vx = vx; G.ball.vy = vy; G.ballState = 'play';
  },
  restart() { startGame(); },
  setLocks(n) { G.locks = n; },
  setKickback(v) { G.kickback = v; },
  setOrbit(side, v) { G.orbits[side] = v; },
  setSkill(v) { G.skill = v; },
  damageBoss(n = 1) {
    if (G.boss.plates > 0) breakPlate('debug');
    else { G.boss.hull -= n; G.goals.coreHits += n; if (G.boss.hull <= 0) bossDie(); }
  },
  breakPlate() { breakPlate('debug'); },
  setPearls(n) { G.pearls = n; },
  drainBall() { G.ball.y = 720; G.ball.vy = 0; G.ballState = 'play'; },
  winDepth() { G.boss.dieAnim = 0.01; G.boss.hull = 0; },
  setScore(n) { G.score = n; },
  giveSalvage(n) { G.salvage += n; },
  openShop() { openShop(); },
  setDepth(n) { startDepth(n); },
  buyRelic(id) { buyRelic(id); },
  setCombo(n) { G.combo = n; G.comboTimer = comboWindow(); G.mult = Math.min(8, 1 + Math.floor(n / 4)); },
  clearHazard() { if (G.hazard) G.hazard.active = false; G.goals.hazardDone = true; },
};
window.render_game_to_text = () => JSON.stringify({
  mode: G.mode,
  depth: G.depthIndex,
  depthName: G.depth.name,
  difficulty: G.difficulty,
  score: G.score,
  best: G.best,
  combo: G.combo,
  mult: G.mult,
  pearls: G.pearls,
  pearlsMax: G.pearlsMax,
  salvage: G.salvage,
  ballState: G.ballState,
  ball: { x: Math.round(G.ball.x), y: Math.round(G.ball.y), vx: Math.round(G.ball.vx), vy: Math.round(G.ball.vy) },
  extraBall: G.extraBall ? { x: Math.round(G.extraBall.x), y: Math.round(G.extraBall.y) } : null,
  multiball: G.multiball,
  locks: G.locks,
  orbits: G.orbits,
  kickback: G.kickback,
  skill: G.skill,
  spinnerSpins: G.table.spinner.spins,
  balls: G.extraBall ? 2 : 1,
  boss: { name: G.depth.boss.name, plates: G.boss.plates, platesMax: G.boss.platesMax, hull: G.boss.hull, hullMax: G.boss.hullMax, coreHits: G.boss.coreHits },
  goals: G.goals,
  relics: G.relics,
  hazard: G.hazard ? { type: G.hazard.type, active: G.hazard.active } : null,
  surge: { active: G.surge.active, cooldown: Math.round(G.surge.cooldown) },
  tiltWarnings: G.tiltWarnings,
  ballSave: Math.round(G.ballSave * 10) / 10,
});

// ---------- shot scenes (deterministic, for screenshots) ----------

function setupShot(shot) {
  G.frozen = true;
  G.time = 1; // fixed clock so every time-based visual is deterministic
  if (shot === 'cover') {
    resetRun();
    G.mode = 'playing';
    startDepth(1);
    G.score = 45230;
    G.best = Math.max(G.best, G.score);
    G.combo = 14; G.comboTimer = 2.5; G.mult = 4; G.maxCombo = 14;
    G.salvage = 180;
    G.relics = ['coral-heart', 'copper-bumpers'];
    G.boss.broken[0] = true; G.boss.broken[2] = true;
    G.boss.plates = 2; G.goals.platesBroken = 2;
    G.boss.hull = 6; G.boss.coreHits = 4; G.goals.coreHits = 4;
    G.table.targets[0].down = true; G.table.targets[2].down = true; G.table.targets[4].down = true;
    G.goals.targetsDown = 3;
    G.table.lanes[0].lit = true; G.table.lanes[2].lit = true;
    G.goals.lanesLit = 2;
    G.ballState = 'play';
    G.ball.x = 300; G.ball.y = 360; G.ball.vx = 180; G.ball.vy = -320;
    G.ball.trail = [{ x: 290, y: 380 }, { x: 280, y: 400 }, { x: 270, y: 420 }];
    if (G.hazard) { G.hazard.x = 420; G.hazard.y = 400; G.hazard.active = true; }
  } else if (shot === 'shop') {
    resetRun();
    G.mode = 'playing';
    startDepth(0);
    G.score = 32100;
    G.best = Math.max(G.best, G.score);
    G.salvage = 240;
    openShop();
  } else if (shot === 'boss') {
    resetRun();
    G.mode = 'playing';
    startDepth(4);
    G.score = 128400;
    G.best = Math.max(G.best, G.score);
    G.combo = 20; G.comboTimer = 2.8; G.mult = 6; G.maxCombo = 20;
    G.salvage = 320;
    G.relics = ['heavy-ball', 'magnet-flipper', 'coral-heart'];
    G.boss.broken = [true, true, true, true, false, false];
    G.boss.plates = 2; G.goals.platesBroken = 4;
    G.boss.hull = 8; G.boss.coreHits = 10; G.goals.coreHits = 10;
    G.ballState = 'play';
    G.ball.x = 280; G.ball.y = 400; G.ball.vx = 120; G.ball.vy = -400;
    G.ball.trail = [{ x: 270, y: 430 }, { x: 260, y: 460 }, { x: 250, y: 490 }];
  } else if (shot === 'victory') {
    resetRun();
    startDepth(4); // background HUD shows the final depth behind the overlay
    G.score = 214800;
    G.best = 214800;
    G.mode = 'victory';
    $('victory-score').textContent = G.score.toLocaleString('en-US');
    $('victory-best').textContent = 'BEST ' + G.best.toLocaleString('en-US');
    $('victory-stats').textContent = '5 depths cleared • 5 bosses down • max combo 32 • 1 pearl lost';
    showOverlay('overlay-victory');
  }
  hideOverlaysExceptForShot(shot);
  updateHUD();
  setTimeout(() => { window.__shotReady = true; }, 400);
}

function hideOverlaysExceptForShot(shot) {
  if (shot === 'shop') { showOverlay('overlay-shop'); return; }
  if (shot === 'victory') { showOverlay('overlay-victory'); return; }
  hideOverlays();
}

// ---------- main loop ----------

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (!G.frozen) G.time += dt;
  if (G.charging && G.mode === 'playing' && G.ballState === 'pocket') {
    G.launchPower += G.powerDir * dt * 1.8;
    if (G.launchPower >= 1) { G.launchPower = 1; G.powerDir = -1; }
    if (G.launchPower <= 0.2) { G.launchPower = 0.2; G.powerDir = 1; }
  }
  if (!G.frozen) {
    if (G.mode === 'playing') update(dt);
    else updateParticles(dt);
  }
  drawTable(ctx, G);
  updateHUD();
}

if (params.get('shot')) {
  setupShot(params.get('shot'));
} else {
  setDifficulty('medium');
  startDepth(0);
  updateHUD();
}
requestAnimationFrame(frame);
