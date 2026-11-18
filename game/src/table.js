// SUNKEN FOUNDRY — pinball table geometry (canvas 680x720).
// Walls are segments {x1,y1,x2,y2,rest,sling?}. All coordinates in table space.

export const TABLE = { w: 680, h: 720 };
export const BALL_R = 9;
export const GRAVITY = 1500;
export const MAX_SPEED = 1150;

export function buildTable() {
  const walls = [];

  // Top arc: ellipse from left wall (20,80) over apex (340,26) to right wall.
  const arcPts = [];
  for (let i = 0; i <= 12; i++) {
    const th = Math.PI - (i / 12) * Math.PI; // pi -> 0
    arcPts.push({ x: 340 + 320 * Math.cos(th), y: 80 - 54 * Math.sin(th) });
  }
  for (let i = 0; i < arcPts.length - 1; i++) {
    walls.push({ x1: arcPts[i].x, y1: arcPts[i].y, x2: arcPts[i + 1].x, y2: arcPts[i + 1].y, rest: 0.4 });
  }
  // Side walls.
  walls.push({ x1: 20, y1: 80, x2: 20, y2: 700, rest: 0.35 });
  walls.push({ x1: 660, y1: 80, x2: 660, y2: 700, rest: 0.35 });

  // Outlane dividers (ball left of these drains).
  walls.push({ x1: 90, y1: 585, x2: 90, y2: 700, rest: 0.35 });
  walls.push({ x1: 590, y1: 585, x2: 590, y2: 700, rest: 0.35 });

  // Inlane guides (funnel the ball onto the flipper pivots).
  walls.push({ x1: 150, y1: 585, x2: 245, y2: 640, rest: 0.35 });
  walls.push({ x1: 530, y1: 585, x2: 435, y2: 640, rest: 0.35 });

  // Slingshots: triangles above the inlane guides. Edges flagged sling.
  const slingL = [[175, 470], [250, 510], [175, 555]];
  const slingR = [[505, 470], [430, 510], [505, 555]];
  for (const tri of [slingL, slingR]) {
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3];
      walls.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], rest: 0.7, sling: true, cx: 208, cy: 512 });
    }
  }
  // Fix sling centroids (left vs right).
  walls.forEach((w) => { if (w.sling) w.cx = w.x1 < 340 ? 208 : 472; });

  const bumpers = [
    { x: 200, y: 228, r: 26, rest: 0.6, boost: 430, flash: 0 },
    { x: 340, y: 238, r: 26, rest: 0.6, boost: 430, flash: 0 },
    { x: 480, y: 228, r: 26, rest: 0.6, boost: 430, flash: 0 },
  ];

  const targets = [];
  for (let i = 0; i < 5; i++) {
    targets.push({ x: 230 + i * 60 - 17, y: 330, w: 34, h: 14, down: false, flash: 0 });
  }

  const lanes = [
    { x: 130, y: 122, r: 14, lit: false },
    { x: 250, y: 102, r: 14, lit: false },
    { x: 430, y: 102, r: 14, lit: false },
    { x: 550, y: 122, r: 14, lit: false },
  ];

  const boss = { x: 340, y: 128, r: 58 };

  // Launch rail: cubic bezier from the pocket (top-right) over the top arc
  // into the playfield. p0 pocket, p3 entry point.
  const launchRail = {
    p0: { x: 628, y: 132 }, p1: { x: 648, y: 42 }, p2: { x: 560, y: 18 }, p3: { x: 470, y: 82 },
  };

  const flippers = {
    left: { x: 245, y: 640, len: 90, r: 9, restAngle: (28 * Math.PI) / 180, upAngle: (-28 * Math.PI) / 180, angle: (28 * Math.PI) / 180, omega: 0, pressed: false },
    right: { x: 435, y: 640, len: 90, r: 9, restAngle: (152 * Math.PI) / 180, upAngle: (208 * Math.PI) / 180, angle: (152 * Math.PI) / 180, omega: 0, pressed: false },
  };

  return { walls, bumpers, targets, lanes, boss, launchRail, flippers };
}

// Cubic bezier point.
export function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
