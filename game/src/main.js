// SUNKEN FOUNDRY — main game: state, loop, physics, input, HUD, shop.
// Canvas 2D, vanilla JS. All art drawn in code; all sound is WebAudio.
import { DEPTHS, RELICS, SHOAL, GOAL_DEFS } from './data.js';
import { AudioEngine } from './audio.js';
import { collideSegment, collideCircle, collideFlipper, clamp, mulberry32 } from './physics.js';
import { buildTable, bezier, BALL_R, GRAVITY, MAX_SPEED } from './table.js';
import { drawTable } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = new AudioEngine();
const params = new URLSearchParams(location.search);
const rng = mulberry32(Number(params.get('seed') || (Date.now() % 100000)));

const $ = (id) => document.getElementById(id);

const G = {
  mode: 'title', // title | playing | paused | shop | victory | gameover
  time: 0,
  frozen: false,
  depthIndex: 0,
  score: 0,
  best: Number(localStorage.getItem('sunkenfoundry.best') || 0),
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
  ballState: 'pocket', // pocket | rail | play
  railT: 0, railPower: 1,
  charging: false, launchPower: 0.2, powerDir: 1,
  hazard: null,
  particles: [], floats: [],
  ink: 0,
  slingCooldown: 0,
  lanesResetIn: 0, targetsResetIn: 0,
  shopOffers: [],
  stats: { bossesDown: 0, ballsLost: 0 },
  table: buildTable(),
};
G.depth = DEPTHS[0];

const hasRelic = (id) => G.relics.includes(id);
const ballSaveBase = () => 3 + (hasRelic('long-fuse') ? 3 : 0);
const comboWindow = () => 3 + (hasRelic('coral-heart') ? 1 : 0);
const flipperPower = () => 1 + (hasRelic('magnet-flipper') ? 0.15 : 0);
const coreDamage = () => (hasRelic('heavy-ball') ? 2 : 1);
const salvageMult = () => (hasRelic('salvage-hook') ? 1.25 : 1);
const inkDurationMult = () => (hasRelic('ink-filter') ? 0.5 : 1);

function addHit() {
  if (G.comboTimer > 0) G.combo += 1;
  else G.combo = 1;
  G.comboTimer = comboWindow();
  G.mult = Math.min(8, 1 + Math.floor(G.combo / 4));
  if (G.combo > G.maxCombo) G.maxCombo = G.combo;
}

function scoreHit(base, x, y, label) {
  addHit();
  const amt = Math.round(base * G.mult * (G.surge.active ? 2 : 1));
  G.score += amt;
  if (x !== undefined) addFloat(x, y, `+${amt}${label ? ' ' + label : ''}`, '#ffd76a');
  return amt;
}

function addScore(base, x, y, label) {
  const amt = Math.round(base * G.mult * (G.surge.active ? 2 : 1));
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

// ---------- depth / boss ----------

function startDepth(i) {
  G.depthIndex = i;
  G.depth = DEPTHS[i];
  const b = G.depth.boss;
  G.boss = { plates: b.plates, platesMax: b.plates, hull: b.hull, hullMax: b.hull, coreHits: 0, broken: Array(b.plates).fill(false), flash: 0, dieAnim: 0 };
  G.goals = { platesBroken: 0, coreHits: 0, targetsDown: 0, targetsDone: false, lanesLit: 0, lanesDone: false, hazardDone: false };
  for (const t of G.table.targets) { t.down = false; t.flash = 0; }
  for (const l of G.table.lanes) l.lit = false;
  for (const bp of G.table.bumpers) { bp.barnacle = false; bp.flash = 0; }
  G.combo = 0; G.comboTimer = 0; G.mult = 1;
  G.ink = 0;
  G.ballState = 'pocket';
  G.ball.x = G.table.launchRail.p0.x;
  G.ball.y = G.table.launchRail.p0.y;
  G.ball.vx = 0; G.ball.vy = 0;
  G.ball.trail = [];
  G.ballSave = 0;
  G.freeSaves = hasRelic('lucky-current') ? 1 : 0;
  spawnHazard();
}

function spawnHazard() {
  const type = G.depth.hazard;
  if (type === 'crab') {
    G.hazard = { type, x: 340, y: 400, vx: (rng() < 0.5 ? -1 : 1) * 42, active: true, t: 0, life: 8, respawnIn: 0 };
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
  G.pearls = 3; G.pearlsMax = 3;
  G.salvage = 0;
  G.relics = [];
  G.ballSave = 0; G.freeSaves = 0;
  G.tiltWarnings = 0; G.tiltedUntil = 0;
  G.surge = { active: false, t: 0, cooldown: 0 };
  G.ink = 0;
  G.particles = []; G.floats = [];
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
  if (G.score > G.best) {
    G.best = G.score;
    localStorage.setItem('sunkenfoundry.best', String(G.best));
  }
  $('victory-score').textContent = G.score.toLocaleString('en-US');
  $('victory-best').textContent = 'BEST ' + G.best.toLocaleString('en-US');
  $('victory-stats').textContent = `5 depths cleared • ${G.stats.bossesDown} bosses down • max combo ${G.maxCombo} • ${G.stats.ballsLost} pearls lost`;
  showOverlay('overlay-victory');
  audio.win();
}

function gameOver() {
  G.mode = 'gameover';
  if (G.score > G.best) {
    G.best = G.score;
    localStorage.setItem('sunkenfoundry.best', String(G.best));
  }
  $('gameover-score').textContent = G.score.toLocaleString('en-US');
  $('gameover-best').textContent = 'BEST ' + G.best.toLocaleString('en-US');
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
    G.pearlsMax = 4;
    G.pearls = Math.min(4, G.pearls + 1);
  }
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

  // Ball trail.
  if (G.ball.visible && G.ballState === 'play') {
    G.ball.trail.push({ x: G.ball.x, y: G.ball.y });
    if (G.ball.trail.length > 12) G.ball.trail.shift();
  } else if (G.ball.trail.length > 0) {
    G.ball.trail.shift();
  }

  if (G.ballState === 'rail') {
    G.railT += dt / 0.45;
    const r = G.table.launchRail;
    const p = bezier(r.p0, r.p1, r.p2, r.p3, Math.min(1, G.railT));
    G.ball.x = p.x; G.ball.y = p.y;
    if (G.railT >= 1) {
      G.ballState = 'play';
      const speed = 380 + 420 * G.railPower;
      G.ball.vx = -0.815 * speed;
      G.ball.vy = 0.58 * speed;
      G.ballSave = ballSaveBase();
    }
    return;
  }

  if (G.ballState === 'play') {
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) stepPhysics(h);
    if (G.ball.y - G.ball.r > 706) handleDrain();
  }
}

function updateFlippers(dt) {
  const speed = 26 * flipperPower();
  const tilted = G.time < G.tiltedUntil;
  for (const side of ['left', 'right']) {
    const f = G.table.flippers[side];
    const target = f.pressed && !tilted ? f.upAngle : f.restAngle;
    const prev = f.angle;
    const diff = target - f.angle;
    const step = clamp(diff, -speed * dt, speed * dt);
    f.angle = prev + step;
    f.omega = dt > 0 ? (f.angle - prev) / dt : 0;
  }
}

function stepPhysics(h) {
  const b = G.ball;
  b.vy += GRAVITY * h;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
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
      }
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
      if (G.goals.lanesLit >= 4 && !G.goals.lanesDone) {
        G.goals.lanesDone = true;
        G.lanesResetIn = 1;
        addScore(1000, 340, 160, 'ALL LANES!');
      }
    }
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
      G.combo = 0; G.mult = 1; G.comboTimer = 0;
      const dx = b.x - hz.x, dy = b.y - hz.y;
      const dd = Math.hypot(dx, dy) || 1;
      b.vx += (dx / dd) * 520;
      b.vy += (dy / dd) * 520;
      G.goals.hazardDone = true;
      hz.active = false;
      hz.respawnIn = 8;
      addFloat(hz.x, hz.y - 24, 'MINE! COMBO LOST', '#ff6a4a');
      spawnParticles(hz.x, hz.y, 22, '#ff6a4a', 300);
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
      hz.inkTimer = 9;
      audio.hazard();
    }
  } else if (hz.type === 'eel') {
    hz.x += hz.dir * 55 * dt;
    if (hz.x < 70 || hz.x > 610) hz.dir *= -1;
    hz.lungeTimer -= dt;
    if (hz.lungeTimer <= 0) {
      hz.lungeTimer = 10;
      if (G.ballState === 'play' && G.ball.y > 500 && G.combo > 0) {
        G.combo = 0; G.mult = 1; G.comboTimer = 0;
        addFloat(G.ball.x, G.ball.y - 24, 'COMBO STOLEN!', '#4a7a5a');
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
    { done: g.lanesDone, label: `Light lanes ${g.lanesLit}/4` },
    { done: g.hazardDone, label: `Deal with the hazard (${g.hazardDone ? 'done' : 'open'})` },
  ];
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
  setText('best', 'BEST ' + (G.best > 0 ? G.best.toLocaleString('en-US') : '—'));
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
$('btn-resume').addEventListener('click', () => { hideOverlays(); G.mode = 'playing'; });
$('btn-restart-pause').addEventListener('click', startGame);
$('btn-continue').addEventListener('click', continueFromShop);
$('btn-again').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);

// ---------- debug hooks (tests only) ----------

window.__game = G;
window.__debug = {
  launch(power = 1) {
    if (G.ballState === 'pocket' && G.mode === 'playing') {
      G.ballState = 'rail'; G.railT = 0; G.railPower = power;
    }
  },
  teleportBall(x, y) {
    G.ball.x = x; G.ball.y = y; G.ball.vx = 0; G.ball.vy = 0; G.ballState = 'play';
  },
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
  score: G.score,
  best: G.best,
  combo: G.combo,
  mult: G.mult,
  pearls: G.pearls,
  salvage: G.salvage,
  ballState: G.ballState,
  ball: { x: Math.round(G.ball.x), y: Math.round(G.ball.y), vx: Math.round(G.ball.vx), vy: Math.round(G.ball.vy) },
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
    G.ball.x = 340; G.ball.y = 420; G.ball.vx = 120; G.ball.vy = -400;
    G.ball.trail = [{ x: 330, y: 450 }, { x: 320, y: 480 }, { x: 310, y: 510 }];
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
  startDepth(0);
  updateHUD();
}
requestAnimationFrame(frame);
