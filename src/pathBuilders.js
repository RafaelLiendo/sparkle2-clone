// Authoring helpers that emit cubic Bézier chains (§2.5: never Catmull-Rom, no sharp
// corners). Every helper produces tangent-continuous joins by construction.

const pt = (x, y) => ({ x, y });

function line(a, b) {
  return [a, pt(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3), pt(a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3), b];
}

/**
 * Polyline with every interior vertex rounded by a circular arc of `radius` px
 * (square-like turns with rounded corners). `radius` may be a number or per-vertex array.
 */
export function roundedPolyline(points, radius) {
  const P = points.map(([x, y]) => pt(x, y));
  const out = [];
  let cursor = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const V = P[i];
    const a = unit(P[i - 1], V);
    const b = unit(V, P[i + 1]);
    const cos = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
    const theta = Math.acos(cos); // turn angle
    if (theta < 1e-4) continue;
    if (theta > Math.PI - 0.05) throw new Error('roundedPolyline: U-turn at a single vertex');
    const inLen = Math.hypot(V.x - P[i - 1].x, V.y - P[i - 1].y);
    const outLen = Math.hypot(P[i + 1].x - V.x, P[i + 1].y - V.y);
    let r = Array.isArray(radius) ? radius[i - 1] : radius;
    const tanHalf = Math.tan(theta / 2);
    const maxTrim = Math.min(inLen, outLen) * 0.5;
    r = Math.min(r, maxTrim / tanHalf);
    const trim = r * tanHalf;
    const p1 = pt(V.x - a.x * trim, V.y - a.y * trim);
    const p2 = pt(V.x + b.x * trim, V.y + b.y * trim);
    if (Math.hypot(p1.x - cursor.x, p1.y - cursor.y) > 1e-6) out.push(line(cursor, p1));
    const k = (4 / 3) * Math.tan(theta / 4) * r;
    out.push([p1, pt(p1.x + a.x * k, p1.y + a.y * k), pt(p2.x - b.x * k, p2.y - b.y * k), p2]);
    cursor = p2;
  }
  const last = P[P.length - 1];
  if (Math.hypot(last.x - cursor.x, last.y - cursor.y) > 1e-6) out.push(line(cursor, last));
  return out;
}

function unit(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/**
 * Archimedean-style spiral from angle a0 to a1 (radians, screen coords), radius r0→r1,
 * emitted as Hermite-derived cubic pieces of at most a quarter turn each.
 */
export function spiral(cx, cy, r0, r1, a0, a1) {
  const pieces = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 4)));
  const dr = (r1 - r0) / (a1 - a0);
  const P = (a) => {
    const r = r0 + dr * (a - a0);
    return pt(cx + r * Math.cos(a), cy + r * Math.sin(a));
  };
  const T = (a) => {
    const r = r0 + dr * (a - a0);
    return pt(dr * Math.cos(a) - r * Math.sin(a), dr * Math.sin(a) + r * Math.cos(a));
  };
  const out = [];
  for (let i = 0; i < pieces; i++) {
    const s = a0 + ((a1 - a0) * i) / pieces;
    const e = a0 + ((a1 - a0) * (i + 1)) / pieces;
    const h = (e - s) / 3;
    const p0 = P(s);
    const p3 = P(e);
    const t0 = T(s);
    const t3 = T(e);
    out.push([p0, pt(p0.x + t0.x * h, p0.y + t0.y * h), pt(p3.x - t3.x * h, p3.y - t3.y * h), p3]);
  }
  return out;
}

/** Straight lead of `len` px ending at the start of `chain`, along its entry tangent. */
export function leadInto(chain, len) {
  const b = chain[0];
  const d = unit(b[0], b[1]);
  const start = pt(b[0].x - d.x * len, b[0].y - d.y * len);
  return [line(start, b[0]), ...chain];
}

/** Straight exit of `len` px continuing from the end of `chain`. */
export function extendOut(chain, len) {
  const b = chain[chain.length - 1];
  const d = unit(b[2], b[3]);
  return [...chain, line(b[3], pt(b[3].x + d.x * len, b[3].y + d.y * len))];
}

/** Mirror a chain (and a point) across the canvas. */
export function mirrorChain(chain, { x = false, y = false, W = 1280, H = 720 }) {
  return chain.map((b) => b.map((p) => pt(x ? W - p.x : p.x, y ? H - p.y : p.y)));
}

export function mirrorPoint(p, { x = false, y = false, W = 1280, H = 720 }) {
  return { x: x ? W - p.x : p.x, y: y ? H - p.y : p.y };
}
