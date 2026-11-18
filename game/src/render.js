// SUNKEN FOUNDRY — all canvas art, drawn in code. Brass/gold + deep teal.

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawTable(ctx, G) {
  const { w, h } = { w: 680, h: 720 };
  const depth = G.depth;
  // Background: deep teal gradient, depth-tinted.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, depth.tint);
  bg.addColorStop(1, depth.tint2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Faint gear decorations.
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 3;
  for (const [gx, gy, gr] of [[110, 300, 46], [575, 300, 40], [340, 470, 56]]) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + G.time * 0.05;
      const r1 = gr, r2 = gr + 10;
      const x1 = gx + Math.cos(a) * r1, y1 = gy + Math.sin(a) * r1;
      const x2 = gx + Math.cos(a) * r2, y2 = gy + Math.sin(a) * r2;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    circle(ctx, gx, gy, gr - 6); ctx.stroke();
  }
  ctx.restore();

  // Dotted depth texture.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#e8d9a0';
  for (let y = 60; y < h; y += 46) {
    for (let x = 34 + ((y / 46) % 2) * 23; x < w - 20; x += 46) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.restore();

  // Brass frame: outer walls.
  ctx.save();
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 700);
  ctx.lineTo(20, 80);
  ctx.ellipse(340, 80, 320, 54, 0, Math.PI, 0);
  ctx.lineTo(660, 700);
  ctx.stroke();
  ctx.strokeStyle = '#e8c25a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 700);
  ctx.lineTo(24, 82);
  ctx.ellipse(340, 82, 316, 50, 0, Math.PI, 0);
  ctx.lineTo(656, 700);
  ctx.stroke();
  ctx.restore();

  // Rivets along the frame.
  ctx.fillStyle = '#d9b45a';
  for (let i = 0; i < 9; i++) {
    const y = 120 + i * 68;
    circle(ctx, 20, y, 3); ctx.fill();
    circle(ctx, 660, y, 3); ctx.fill();
  }

  // Launch rail (brass tube, top-right).
  drawLaunchRail(ctx, G);

  // Rollover lanes.
  for (const lane of G.table.lanes) {
    circle(ctx, lane.x, lane.y, lane.r);
    ctx.fillStyle = lane.lit ? '#ffd76a' : 'rgba(20,40,44,0.9)';
    ctx.fill();
    ctx.strokeStyle = lane.lit ? '#ffe9a0' : '#5a7a72';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (lane.lit) {
      ctx.fillStyle = '#3a2a08';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('●', lane.x, lane.y + 0.5);
    }
  }

  // Drop targets.
  for (const t of G.table.targets) {
    ctx.save();
    if (t.down) {
      ctx.globalAlpha = 0.35;
      ctx.translate(0, 6);
    }
    rr(ctx, t.x, t.y, t.w, t.h, 4);
    ctx.fillStyle = t.flash > 0 ? '#ffe9a0' : '#b8433a';
    ctx.fill();
    ctx.strokeStyle = '#5a1a14';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', t.x + t.w / 2, t.y + t.h / 2 + 0.5);
    ctx.restore();
  }

  // Slingshots.
  for (const tri of [[[175, 470], [250, 510], [175, 555]], [[505, 470], [430, 510], [505, 555]]]) {
    ctx.beginPath();
    ctx.moveTo(tri[0][0], tri[0][1]);
    ctx.lineTo(tri[1][0], tri[1][1]);
    ctx.lineTo(tri[2][0], tri[2][1]);
    ctx.closePath();
    ctx.fillStyle = '#7a5a20';
    ctx.fill();
    ctx.strokeStyle = '#e8c25a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SLING', (tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3 + 3);
  }

  // Bumpers.
  for (const b of G.table.bumpers) {
    const hot = b.flash > 0;
    circle(ctx, b.x, b.y, b.r + 4);
    ctx.fillStyle = '#5a3a10';
    ctx.fill();
    circle(ctx, b.x, b.y, b.r);
    const g = ctx.createRadialGradient(b.x - 6, b.y - 8, 2, b.x, b.y, b.r);
    g.addColorStop(0, hot ? '#fff6c8' : '#ffe9a0');
    g.addColorStop(0.6, hot ? '#ffd76a' : '#d9a83a');
    g.addColorStop(1, '#8a6a2f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#e8c25a';
    ctx.lineWidth = 2;
    ctx.stroke();
    circle(ctx, b.x, b.y, b.r * 0.45);
    ctx.fillStyle = hot ? '#fff' : '#8a6a2f';
    ctx.fill();
    if (b.barnacle) {
      // Barnacle stuck on the bumper: grey crust.
      circle(ctx, b.x + 8, b.y - 8, 12);
      ctx.fillStyle = '#8a8a7a';
      ctx.fill();
      ctx.strokeStyle = '#5a5a4a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#3a3a30';
      for (const [dx, dy] of [[4, -12], [12, -6], [8, -2]]) {
        circle(ctx, b.x + dx, b.y + dy, 2); ctx.fill();
      }
    }
  }

  // Inlane / outlane guides.
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(90, 585); ctx.lineTo(90, 700);
  ctx.moveTo(590, 585); ctx.lineTo(590, 700);
  ctx.moveTo(150, 585); ctx.lineTo(245, 640);
  ctx.moveTo(530, 585); ctx.lineTo(435, 640);
  ctx.stroke();

  // Outlane / inlane labels.
  ctx.fillStyle = 'rgba(232,201,90,0.55)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OUT', 55, 640);
  ctx.fillText('OUT', 625, 640);

  // Boss.
  drawBoss(ctx, G);

  // Hazard.
  drawHazard(ctx, G);

  // Flippers.
  for (const side of ['left', 'right']) {
    const f = G.table.flippers[side];
    const tipX = f.x + Math.cos(f.angle) * f.len;
    const tipY = f.y + Math.sin(f.angle) * f.len;
    ctx.save();
    ctx.strokeStyle = '#8a6a2f';
    ctx.lineWidth = f.r * 2 + 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = f.r * 2 - 2;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    circle(ctx, f.x, f.y, f.r + 2);
    ctx.fillStyle = '#c9a86a';
    ctx.fill();
    ctx.restore();
  }

  // Ball trail + ball.
  if (G.ball.visible) {
    for (let i = 0; i < G.ball.trail.length; i++) {
      const p = G.ball.trail[i];
      const a = (i / G.ball.trail.length) * 0.35;
      circle(ctx, p.x, p.y, G.ball.r * (0.4 + 0.6 * (i / G.ball.trail.length)));
      ctx.fillStyle = `rgba(255, 214, 106, ${a})`;
      ctx.fill();
    }
    const b = G.ball;
    const bg2 = ctx.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, b.r + 2);
    bg2.addColorStop(0, '#ffffff');
    bg2.addColorStop(0.5, '#ffe9a0');
    bg2.addColorStop(1, '#c9922e');
    circle(ctx, b.x, b.y, b.r + 2);
    ctx.fillStyle = G.surgeActive ? '#ff9a3a' : '#8a6a2f';
    ctx.fill();
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = bg2;
    ctx.fill();
  }

  // Particles.
  for (const p of G.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    circle(ctx, p.x, p.y, p.size);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating score texts.
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // Ball-save glow at the drain.
  if (G.ballSave > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.time * 6);
    ctx.fillStyle = '#7ad9c8';
    ctx.fillRect(20, 690, 640, 10);
    ctx.restore();
  }

  // Surge glow.
  if (G.surgeActive) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ff9a3a';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Ink cloud.
  if (G.ink > 0) {
    ctx.save();
    ctx.globalAlpha = G.ink * 0.55;
    for (let i = 0; i < 14; i++) {
      const cx = 340 + Math.sin(i * 2.7 + G.time * 0.4) * 260;
      const cy = 120 + ((i * 53) % 560);
      const r = 70 + Math.sin(i * 1.3) * 25;
      const g2 = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      g2.addColorStop(0, 'rgba(10,10,24,0.95)');
      g2.addColorStop(1, 'rgba(10,10,24,0)');
      ctx.fillStyle = g2;
      circle(ctx, cx, cy, r);
      ctx.fill();
    }
    ctx.restore();
  }

  // Launch charge meter (when charging).
  if (G.charging) {
    const pw = 200;
    const x0 = 340 - pw / 2, y0 = 660;
    rr(ctx, x0, y0, pw, 16, 6);
    ctx.fillStyle = 'rgba(10,20,22,0.85)';
    ctx.fill();
    ctx.fillStyle = G.launchPower > 0.8 ? '#ff6a3a' : '#ffd76a';
    rr(ctx, x0 + 2, y0 + 2, (pw - 4) * G.launchPower, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#ffe9a0';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD SPACE — RELEASE TO LAUNCH', 340, y0 - 8);
  }

  // "Press SPACE" prompt when ball is waiting at the pocket.
  if (G.mode === 'playing' && G.ballState === 'pocket' && !G.charging) {
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.time * 5);
    ctx.fillStyle = '#ffe9a0';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS SPACE TO LAUNCH', 340, 660);
    ctx.restore();
  }
}

function drawLaunchRail(ctx, G) {
  const r = G.table.launchRail;
  ctx.save();
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r.p0.x, r.p0.y);
  ctx.bezierCurveTo(r.p1.x, r.p1.y, r.p2.x, r.p2.y, r.p3.x, r.p3.y);
  ctx.stroke();
  ctx.strokeStyle = '#e8c25a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r.p0.x, r.p0.y);
  ctx.bezierCurveTo(r.p1.x, r.p1.y, r.p2.x, r.p2.y, r.p3.x, r.p3.y);
  ctx.stroke();
  // Pocket ring.
  circle(ctx, r.p0.x, r.p0.y, 14);
  ctx.strokeStyle = '#e8c25a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawBoss(ctx, G) {
  const boss = G.boss;
  const b = G.table.boss;
  const depth = G.depth;
  const dying = boss.dieAnim > 0;
  ctx.save();
  if (dying) {
    ctx.globalAlpha = Math.max(0.15, boss.dieAnim);
    ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  }
  const flash = boss.flash > 0;

  // Plates: brass arc sectors around the boss.
  const n = boss.platesMax;
  for (let i = 0; i < n; i++) {
    if (boss.broken[i]) continue;
    const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((i + 0.85) / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 8, a0, a1);
    ctx.strokeStyle = flash ? '#fff6c8' : '#e8c25a';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 8, a0, a1);
    ctx.strokeStyle = '#8a6a2f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Core glow when all plates are broken.
  if (boss.plates === 0) {
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 6);
    const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(255, ${120 + Math.floor(80 * pulse)}, 60, 0.9)`);
    g.addColorStop(1, 'rgba(255, 80, 40, 0)');
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Body per boss type.
  const col = depth.boss.color, acc = depth.boss.accent;
  ctx.fillStyle = col;
  ctx.strokeStyle = '#2a1a08';
  ctx.lineWidth = 2.5;
  switch (depth.boss.id) {
    case 'rivet-crab': {
      // Round body + claws + legs.
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 42, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const s of [-1, 1]) {
        circle(ctx, b.x + s * 46, b.y - 8, 12); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x + s * 52, b.y - 16); ctx.lineTo(b.x + s * 62, b.y - 26); ctx.lineTo(b.x + s * 56, b.y - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.x + s * 30, b.y + 22);
        ctx.lineTo(b.x + s * 52, b.y + 34);
        ctx.lineTo(b.x + s * 46, b.y + 14);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // Eyes.
      circle(ctx, b.x - 14, b.y - 12, 6); ctx.fillStyle = '#ffe9a0'; ctx.fill();
      circle(ctx, b.x + 14, b.y - 12, 6); ctx.fill();
      circle(ctx, b.x - 14, b.y - 12, 2.5); ctx.fillStyle = '#1a0a08'; ctx.fill();
      circle(ctx, b.x + 14, b.y - 12, 2.5); ctx.fill();
      // Rivets.
      ctx.fillStyle = acc;
      for (const [dx, dy] of [[-24, 6], [0, 12], [24, 6], [-8, -22], [10, -20]]) { circle(ctx, b.x + dx, b.y + dy, 3); ctx.fill(); }
      break;
    }
    case 'barnacle-maw': {
      // Conical shell with a toothed mouth.
      ctx.beginPath();
      ctx.moveTo(b.x - 44, b.y + 26);
      ctx.quadraticCurveTo(b.x - 40, b.y - 40, b.x, b.y - 46);
      ctx.quadraticCurveTo(b.x + 40, b.y - 40, b.x + 44, b.y + 26);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = acc;
      for (let i = -2; i <= 2; i++) { circle(ctx, b.x + i * 16, b.y - 18 - Math.abs(i) * -4, 3); ctx.fill(); }
      // Mouth.
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 14, 26, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0a08'; ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(b.x + i * 10 - 4, b.y + 4);
        ctx.lineTo(b.x + i * 10 + 4, b.y + 4);
        ctx.lineTo(b.x + i * 10, b.y + 12);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'mine-mother': {
      // Spiky sphere.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a - 0.18) * 30, b.y + Math.sin(a - 0.18) * 30);
        ctx.lineTo(b.x + Math.cos(a) * 52, b.y + Math.sin(a) * 52);
        ctx.lineTo(b.x + Math.cos(a + 0.18) * 30, b.y + Math.sin(a + 0.18) * 30);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      circle(ctx, b.x, b.y, 32); ctx.fill(); ctx.stroke();
      circle(ctx, b.x, b.y, 14);
      ctx.fillStyle = flash ? '#fff6c8' : acc; ctx.fill();
      ctx.fillStyle = '#1a0a08';
      circle(ctx, b.x - 8, b.y - 6, 3); ctx.fill();
      circle(ctx, b.x + 8, b.y - 6, 3); ctx.fill();
      // Small mines.
      ctx.fillStyle = '#3a3a44';
      for (const [dx, dy] of [[-52, 30], [52, 28], [0, 56]]) { circle(ctx, b.x + dx, b.y + dy, 7); ctx.fill(); }
      break;
    }
    case 'ink-squid': {
      // Dome head + tentacles.
      ctx.beginPath();
      ctx.moveTo(b.x - 40, b.y + 10);
      ctx.quadraticCurveTo(b.x - 42, b.y - 46, b.x, b.y - 48);
      ctx.quadraticCurveTo(b.x + 42, b.y - 46, b.x + 40, b.y + 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        const sway = Math.sin(G.time * 2 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(b.x + i * 14, b.y + 8);
        ctx.quadraticCurveTo(b.x + i * 18 + sway, b.y + 34, b.x + i * 12 + sway, b.y + 52);
        ctx.stroke();
      }
      // Eyes + ink sac.
      circle(ctx, b.x - 15, b.y - 14, 7); ctx.fillStyle = '#ffe9a0'; ctx.fill();
      circle(ctx, b.x + 15, b.y - 14, 7); ctx.fill();
      circle(ctx, b.x - 15, b.y - 14, 3); ctx.fillStyle = '#1a0a08'; ctx.fill();
      circle(ctx, b.x + 15, b.y - 14, 3); ctx.fill();
      circle(ctx, b.x, b.y - 30, 8);
      ctx.fillStyle = 'rgba(20,10,40,0.85)'; ctx.fill();
      break;
    }
    default: { // brass-kraken
      // Big brass dome + long tentacles + crown.
      ctx.beginPath();
      ctx.moveTo(b.x - 48, b.y + 16);
      ctx.quadraticCurveTo(b.x - 52, b.y - 50, b.x, b.y - 54);
      ctx.quadraticCurveTo(b.x + 52, b.y - 50, b.x + 48, b.y + 16);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Crown spikes.
      ctx.fillStyle = acc;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(b.x + i * 22 - 8, b.y - 44);
        ctx.lineTo(b.x + i * 22, b.y - 62);
        ctx.lineTo(b.x + i * 22 + 8, b.y - 44);
        ctx.closePath(); ctx.fill();
      }
      // Tentacles.
      ctx.strokeStyle = col;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        const sway = Math.sin(G.time * 1.6 + i * 1.4) * 12;
        ctx.beginPath();
        ctx.moveTo(b.x + i * 18, b.y + 12);
        ctx.quadraticCurveTo(b.x + i * 24 + sway, b.y + 40, b.x + i * 16 + sway * 1.4, b.y + 62);
        ctx.stroke();
      }
      // Eyes (angry).
      ctx.fillStyle = '#ff5a3a';
      circle(ctx, b.x - 17, b.y - 16, 7); ctx.fill();
      circle(ctx, b.x + 17, b.y - 16, 7); ctx.fill();
      ctx.fillStyle = '#1a0a08';
      circle(ctx, b.x - 17, b.y - 16, 3); ctx.fill();
      circle(ctx, b.x + 17, b.y - 16, 3); ctx.fill();
      // Rivet band.
      ctx.fillStyle = acc;
      for (let i = -2; i <= 2; i++) { circle(ctx, b.x + i * 18, b.y + 2, 3); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

function drawHazard(ctx, G) {
  const hz = G.hazard;
  if (!hz || !hz.active) return;
  ctx.save();
  switch (hz.type) {
    case 'crab': {
      ctx.translate(hz.x, hz.y);
      ctx.fillStyle = '#c98a3d';
      ctx.strokeStyle = '#2a1a08';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      circle(ctx, -20, -4, 5); ctx.fill(); ctx.stroke();
      circle(ctx, 20, -4, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe9a0';
      circle(ctx, -6, -4, 2.5); ctx.fill();
      circle(ctx, 6, -4, 2.5); ctx.fill();
      break;
    }
    case 'mine': {
      ctx.translate(hz.x, hz.y);
      const pulse = 1 + 0.12 * Math.sin(G.time * 8);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#3a3a44';
      ctx.strokeStyle = '#8a8a9a';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.2) * 8, Math.sin(a - 0.2) * 8);
        ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
        ctx.lineTo(Math.cos(a + 0.2) * 8, Math.sin(a + 0.2) * 8);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      circle(ctx, 0, 0, 10); ctx.fill(); ctx.stroke();
      circle(ctx, 0, 0, 3); ctx.fillStyle = '#ff5a3a'; ctx.fill();
      break;
    }
    case 'squid': {
      ctx.translate(hz.x, hz.y);
      ctx.fillStyle = '#5a4a7a';
      ctx.beginPath();
      ctx.moveTo(-16, 6);
      ctx.quadraticCurveTo(-18, -18, 0, -18);
      ctx.quadraticCurveTo(18, -18, 16, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a4a7a';
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, 4);
        ctx.quadraticCurveTo(i * 10 + Math.sin(G.time * 3 + i) * 5, 16, i * 8, 24);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe9a0';
      circle(ctx, -6, -6, 3); ctx.fill();
      circle(ctx, 6, -6, 3); ctx.fill();
      break;
    }
    case 'eel': {
      ctx.translate(hz.x, hz.y);
      ctx.fillStyle = '#4a7a5a';
      ctx.strokeStyle = '#1a2a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 10, hz.dir > 0 ? 0.15 : -0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Tail.
      ctx.beginPath();
      ctx.moveTo(-hz.dir * 28, 0);
      ctx.lineTo(-hz.dir * 44, -8);
      ctx.lineTo(-hz.dir * 44, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      circle(ctx, hz.dir * 18, -3, 3); ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
