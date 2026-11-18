// SUNKEN FOUNDRY — circle physics helpers (segments, circles, flippers).
// Ball is a circle {x, y, vx, vy, r}. Walls are segments {x1,y1,x2,y2,rest}.

export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t, t };
}

// Circle vs static segment. Pushes the ball out and reflects velocity.
// Returns the hit normal {nx, ny} and impact speed, or null.
export function collideSegment(ball, seg) {
  const c = closestOnSegment(ball.x, ball.y, seg.x1, seg.y1, seg.x2, seg.y2);
  let dx = ball.x - c.x, dy = ball.y - c.y;
  let d = Math.hypot(dx, dy);
  const rest = seg.rest !== undefined ? seg.rest : 0.35;
  if (d >= ball.r) return null;
  if (d < 0.0001) { dx = 0; dy = -1; d = 1; }
  const nx = dx / d, ny = dy / d;
  const push = ball.r - d;
  ball.x += nx * push;
  ball.y += ny * push;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    // Small tangential damping so the ball does not slide forever.
    ball.vx *= 0.999;
    ball.vy *= 0.999;
    return { nx, ny, impact: -vn };
  }
  return { nx, ny, impact: 0 };
}

// Circle vs circle (bumper). With boost, the circle actively kicks the ball.
export function collideCircle(ball, circ, boost = 0) {
  const dx = ball.x - circ.x, dy = ball.y - circ.y;
  const d = Math.hypot(dx, dy);
  const minD = ball.r + circ.r;
  if (d >= minD || d < 0.0001) return null;
  const nx = dx / d, ny = dy / d;
  ball.x = circ.x + nx * minD;
  ball.y = circ.y + ny * minD;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0 || boost > 0) {
    const rest = circ.rest !== undefined ? circ.rest : 0.6;
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    if (boost > 0) {
      ball.vx += nx * boost;
      ball.vy += ny * boost;
    }
    return { nx, ny, impact: Math.max(0, -vn) + boost };
  }
  return { nx, ny, impact: 0 };
}

// Flipper: a rotating capsule segment. pivot {x,y}, length, angle (radians,
// 0 = pointing right), angular velocity omega (rad/s), radius fr.
// On contact, the ball gets the flipper surface velocity at the contact
// point, which is what makes flippers actually fling the ball.
export function collideFlipper(ball, fl) {
  const tipX = fl.x + Math.cos(fl.angle) * fl.len;
  const tipY = fl.y + Math.sin(fl.angle) * fl.len;
  const c = closestOnSegment(ball.x, ball.y, fl.x, fl.y, tipX, tipY);
  let dx = ball.x - c.x, dy = ball.y - c.y;
  let d = Math.hypot(dx, dy);
  const minD = ball.r + fl.r;
  if (d >= minD) return null;
  if (d < 0.0001) { dx = 0; dy = -1; d = 1; }
  const nx = dx / d, ny = dy / d;
  ball.x += nx * (minD - d);
  ball.y += ny * (minD - d);
  // Surface velocity at contact point: v = omega x r (perpendicular).
  const rx = c.x - fl.x, ry = c.y - fl.y;
  const svx = -fl.omega * ry, svy = fl.omega * rx;
  // Relative velocity along the normal.
  const rvx = ball.vx - svx, rvy = ball.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const rest = 0.3;
    ball.vx -= (1 + rest) * vn * nx;
    ball.vy -= (1 + rest) * vn * ny;
    // Add a share of the flipper's own motion so a fast flip really throws.
    ball.vx += svx * 0.35;
    ball.vy += svy * 0.35;
    return { nx, ny, impact: -vn };
  }
  return { nx, ny, impact: 0 };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
