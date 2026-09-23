// Orb look (§7.1): opaque lit stone, dark rim, one tight specular, an engraved
// medallion and a gold inlay band that roll with distance. Lighting is baked into
// sprites that never rotate; only the surface detail turns with the path.

import { COLORS } from '../defs.js';

const SPR = 128; // sprite size (px), orb radius 60 inside → drawn at 60 px diameter
const R = 60;
/** Sprites carry padding around the sphere: draw them at d * SPRITE_K so the stone radius is exactly d / 2. */
const SPRITE_K = SPR / (2 * R);

function makeCanvas(w, h = w) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  if (!c.width) {
    c.width = w;
    c.height = h;
  }
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexA(hex, a) {
  return rgba(hex, a);
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const h = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${h(a[0] + (b[0] - a[0]) * t)}${h(a[1] + (b[1] - a[1]) * t)}${h(a[2] + (b[2] - a[2]) * t)}`;
}

/** Deterministic tiny hash for stone speckle. */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sphereSprite(base, hi, lo, seed) {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const grad = g.createRadialGradient(cx - R * 0.32, cx - R * 0.38, R * 0.05, cx, cx, R);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.38, base);
  grad.addColorStop(0.82, lo);
  grad.addColorStop(1, mix(lo, '#000000', 0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();
  // stone grain
  g.save();
  g.clip();
  const r = rnd(seed);
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R;
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.045)';
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 0.8 + r() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // occlusion toward the rim (dark rim, no halo)
  const occ = g.createRadialGradient(cx, cx, R * 0.62, cx, cx, R);
  occ.addColorStop(0, 'rgba(0,0,0,0)');
  occ.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = occ;
  g.fillRect(0, 0, SPR, SPR);
  g.restore();
  return c;
}

function highlightSprite() {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const hx = cx - R * 0.36;
  const hy = cx - R * 0.42;
  const broad = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.55);
  broad.addColorStop(0, 'rgba(255,250,235,0.16)');
  broad.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = broad;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();
  const tight = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.14);
  tight.addColorStop(0, 'rgba(255,255,250,0.95)');
  tight.addColorStop(0.5, 'rgba(255,255,250,0.45)');
  tight.addColorStop(1, 'rgba(255,255,250,0)');
  g.fillStyle = tight;
  g.beginPath();
  g.arc(hx, hy, R * 0.14, 0, Math.PI * 2);
  g.fill();
  return c;
}

function shadowSprite() {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const grad = g.createRadialGradient(cx, cx, R * 0.2, cx, cx, R * 0.98);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SPR, SPR);
  return c;
}

function glowSprite(hex) {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, SPR / 2);
  grad.addColorStop(0, rgba(hex, 0.9));
  grad.addColorStop(0.35, rgba(hex, 0.35));
  grad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SPR, SPR);
  return c;
}

/** Prismatic layer for Wild orbs (rotated slowly at draw time). */
function prismSprite() {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.clip();
  const n = COLORS.length;
  for (let i = 0; i < n; i++) {
    g.fillStyle = COLORS[i].base;
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, R + 2, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2 + 0.02);
    g.fill();
  }
  const soften = g.createRadialGradient(cx, cx, 0, cx, cx, R);
  soften.addColorStop(0, 'rgba(210,200,180,0.55)');
  soften.addColorStop(0.6, 'rgba(210,200,180,0.15)');
  soften.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = soften;
  g.fillRect(0, 0, SPR, SPR);
  return c;
}

function shadeSprite() {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const grad = g.createRadialGradient(cx - R * 0.32, cx - R * 0.38, R * 0.05, cx, cx, R);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.4, 'rgba(0,0,0,0)');
  grad.addColorStop(0.85, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();
  return c;
}

// --- Engraved glyphs: one per colour, so colours never rely on hue alone ------
// Drawn in a unit box (-1..1).
const GLYPHS = [
  (g) => {
    // red — flame rune
    g.moveTo(0, -0.8);
    g.bezierCurveTo(0.55, -0.2, 0.5, 0.5, 0, 0.75);
    g.bezierCurveTo(-0.5, 0.5, -0.55, -0.2, 0, -0.8);
    g.moveTo(0, -0.1);
    g.lineTo(0, 0.45);
  },
  (g) => {
    // blue — wave
    g.moveTo(-0.75, -0.2);
    g.bezierCurveTo(-0.4, -0.6, -0.1, 0.2, 0.2, -0.2);
    g.bezierCurveTo(0.4, -0.5, 0.6, -0.3, 0.75, -0.2);
    g.moveTo(-0.75, 0.35);
    g.bezierCurveTo(-0.4, -0.05, -0.1, 0.75, 0.2, 0.35);
    g.bezierCurveTo(0.4, 0.05, 0.6, 0.25, 0.75, 0.35);
  },
  (g) => {
    // green — leaf
    g.moveTo(0, -0.8);
    g.quadraticCurveTo(0.75, 0, 0, 0.8);
    g.quadraticCurveTo(-0.75, 0, 0, -0.8);
    g.moveTo(0, -0.55);
    g.lineTo(0, 0.6);
  },
  (g) => {
    // yellow — sun
    g.moveTo(0.32, 0);
    g.arc(0, 0, 0.32, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      g.lineTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78);
    }
  },
  (g) => {
    // purple — star
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = Math.cos(a) * 0.78;
      const y = Math.sin(a) * 0.78;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  },
  (g) => {
    // black — cross knot
    g.moveTo(-0.6, -0.6);
    g.lineTo(0.6, 0.6);
    g.moveTo(0.6, -0.6);
    g.lineTo(-0.6, 0.6);
    g.moveTo(0.3, 0);
    g.arc(0, 0, 0.3, 0, Math.PI * 2);
  },
];

const WILD_GLYPH = (g) => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78);
  }
};

// --- Surface detail as curves on the sphere -----------------------------------
// Glyphs, the medallion ring and the inlay band are curves ON the sphere: rotated by
// the roll, projected orthographically and clipped to the front hemisphere, so they
// foreshorten toward the limb and never leave the silhouette.

const MED_ANG = 0.62; // angular radius of the glyph area around its pole (rad)

/** Records canvas path commands as polylines (so glyphs can be mapped onto the sphere). */
class PathSampler {
  constructor() {
    this.polys = [];
    this.cur = null;
    this.x = 0;
    this.y = 0;
  }

  beginPath() {}

  moveTo(x, y) {
    this.cur = [[x, y]];
    this.polys.push(this.cur);
    this.x = x;
    this.y = y;
  }

  lineTo(x, y) {
    if (!this.cur) return this.moveTo(x, y);
    const n = Math.max(1, Math.ceil(Math.hypot(x - this.x, y - this.y) / 0.06));
    for (let i = 1; i <= n; i++) this.cur.push([this.x + ((x - this.x) * i) / n, this.y + ((y - this.y) * i) / n]);
    this.x = x;
    this.y = y;
  }

  quadraticCurveTo(cx, cy, x, y) {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      this.cur.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
    this.x = x;
    this.y = y;
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      const u = 1 - t;
      this.cur.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ]);
    }
    this.x = x;
    this.y = y;
  }

  arc(cx, cy, r, a0, a1) {
    const sx = cx + Math.cos(a0) * r;
    const sy = cy + Math.sin(a0) * r;
    if (this.cur) this.lineTo(sx, sy);
    else this.moveTo(sx, sy);
    const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 0.06));
    for (let i = 1; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      this.cur.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    this.x = cx + Math.cos(a1) * r;
    this.y = cy + Math.sin(a1) * r;
  }

  closePath() {
    if (this.cur) this.lineTo(this.cur[0][0], this.cur[0][1]);
  }
}

/** Unit-sphere point at angular distance rho from the pole (+z), azimuth phi. */
function polar(rho, phi) {
  return [Math.sin(rho) * Math.cos(phi), Math.sin(rho) * Math.sin(phi), Math.cos(rho)];
}

/** Map a glyph drawn in the -1..1 box onto the medallion cap around the pole. */
function glyphOnSphere(glyph) {
  const rec = new PathSampler();
  glyph(rec);
  return rec.polys.map((poly) => {
    const out = new Float32Array(poly.length * 3);
    poly.forEach(([u, v], i) => out.set(polar(Math.hypot(u, v) * MED_ANG * 0.9, Math.atan2(v, u)), i * 3));
    return out;
  });
}

function circleOnSphere(rho, n) {
  const out = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) out.set(polar(rho, (i / n) * Math.PI * 2), i * 3);
  return out;
}

const BAND = circleOnSphere(Math.PI / 2, 72);
// Resting pose for queued / flying ammo: turned a little so the band shows as an arc
// (at roll 0 it would lie exactly on the silhouette as an outline).
const AMMO_ROLL = 0.5;

/**
 * Rotation for the orb's current pose: a pure roll about the axis across the path, so
 * the medallions travel along the line of motion and the band always lies across the
 * track. Local frame: x forward along the path, y across it, z toward the viewer.
 * `flip` turns the pose half-way round, bringing the opposite medallion to the pole.
 */
function poseMatrix(roll, flip) {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  // M = Ry(roll) [· Ry(π)]
  return flip ? [-c, 0, -s, 0, 1, 0, s, 0, -c] : [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** Visible (front-hemisphere) portions of sphere polylines as a Path2D. */
function frontPath(polys, m, r) {
  const path = new Path2D();
  for (const pts of polys) {
    let down = false;
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i];
      const y = pts[i + 1];
      const z = pts[i + 2];
      if (m[6] * x + m[7] * y + m[8] * z <= 0.02) {
        down = false;
        continue;
      }
      const px = (m[0] * x + m[1] * y + m[2] * z) * r;
      const py = (m[3] * x + m[4] * y + m[5] * z) * r;
      if (down) path.lineTo(px, py);
      else path.moveTo(px, py);
      down = true;
    }
  }
  return path;
}

// Depth buckets for the band: [min segment depth, alpha]. The band wraps a little past
// the silhouette, fading with depth, so as it rolls over the edge its far half fades
// in while the near half fades out — one continuous ring, never a half that jumps sides.
const BAND_FADE = [
  [0.03, 1],
  [-0.1, 0.65],
  [-0.22, 0.3],
];

/** Band polyline split into depth-faded Path2D buckets (parallel to BAND_FADE). */
function bandPaths(pts, m, r) {
  const paths = BAND_FADE.map(() => new Path2D());
  let px0 = 0;
  let py0 = 0;
  let pz0 = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    const z = pts[i + 2];
    const px = (m[0] * x + m[1] * y + m[2] * z) * r;
    const py = (m[3] * x + m[4] * y + m[5] * z) * r;
    const pz = m[6] * x + m[7] * y + m[8] * z;
    if (i > 0) {
      const mid = (pz + pz0) / 2;
      const b = BAND_FADE.findIndex(([min]) => mid >= min);
      if (b >= 0) {
        paths[b].moveTo(px0, py0);
        paths[b].lineTo(px, py);
      }
    }
    px0 = px;
    py0 = py;
    pz0 = pz;
  }
  return paths;
}

/** Limb darkening laid over the surface detail so it sits under the same shading. */
function limbSprite() {
  const c = makeCanvas(SPR);
  const g = c.getContext('2d');
  const cx = SPR / 2;
  const grad = g.createRadialGradient(cx - R * 0.15, cx - R * 0.18, R * 0.55, cx, cx, R);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();
  return c;
}

function glyphGlowSprite(glyph, color) {
  const S = 64;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.scale(S * 0.32, S * 0.32);
  g.beginPath();
  glyph(g);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.lineWidth = 0.14;
  g.stroke();
  return c;
}

// Special orb bases (§2.2: special state shown on the orb itself).
const SPECIAL_BASE = {
  firebolt: '#C4701A',
  purple: '#6E2BAA',
  frost: '#5F95B5',
  decay: '#4B5A2C',
  spark: '#B89A58',
};

export class OrbArt {
  constructor() {
    this.base = COLORS.map((c, i) => sphereSprite(c.base, c.hi, c.lo, 1000 + i * 77));
    this.glow = COLORS.map((c) => glowSprite(c.glow));
    this.glyphGeo = GLYPHS.map((gl) => glyphOnSphere(gl));
    this.glyphGlow = COLORS.map((c, i) => glyphGlowSprite(GLYPHS[i], c.glow));
    this.wildBase = sphereSprite('#8A8374', '#D8CFBE', '#3A362E', 4242);
    this.wildGlyphGeo = glyphOnSphere(WILD_GLYPH);
    this.limb = limbSprite();
    this.wildGlyphGlow = glyphGlowSprite(WILD_GLYPH, '#FFF2D0');
    this.prism = prismSprite();
    this.shade = shadeSprite();
    this.highlight = highlightSprite();
    this.shadow = shadowSprite();
    this.special = {};
    for (const [k, hex] of Object.entries(SPECIAL_BASE)) {
      this.special[k] = sphereSprite(hex, mix(hex, '#FFFFFF', 0.35), mix(hex, '#000000', 0.55), 900 + k.length * 31);
    }
    this.glowBy = {
      gold: glowSprite('#FFC860'),
      violet: glowSprite('#C77DFF'),
      ice: glowSprite('#BFE8FF'),
      sickly: glowSprite('#A8C860'),
      white: glowSprite('#FFF4D8'),
    };
  }

  /** Contact shadow (drawn in a pass before orbs). */
  drawShadow(ctx, x, y, d, alpha = 1) {
    const s = d * 1.18;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.drawImage(this.shadow, x - s / 2 + d * 0.07, y - s / 2 + d * 0.12, s, s);
    ctx.globalAlpha = 1;
  }

  /**
   * Draw a line orb.
   * @param roll rolling phase (radians) — surface detail rotates with distance
   * @param angle path tangent angle
   */
  drawOrb(ctx, x, y, d, color, wild, roll, angle, time, opts = {}) {
    const half = d / 2;
    const sd = d * SPRITE_K;
    const sh = sd / 2;
    const alpha = opts.alpha ?? 1;
    ctx.globalAlpha = alpha;
    if (wild) {
      ctx.drawImage(this.wildBase, x - sh, y - sh, sd, sd);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.35);
      ctx.globalAlpha = alpha * 0.8;
      ctx.drawImage(this.prism, -sh, -sh, sd, sd);
      ctx.restore();
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.shade, x - sh, y - sh, sd, sd);
    } else {
      ctx.drawImage(this.base[color], x - sh, y - sh, sd, sd);
    }
    this.drawSurface(ctx, x, y, d, wild ? this.wildGlyphGeo : this.glyphGeo[color], roll, angle, alpha);
    if (opts.dark) {
      ctx.globalAlpha = opts.dark * alpha;
      ctx.fillStyle = '#050403';
      ctx.beginPath();
      ctx.arc(x, y, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(this.highlight, x - sh, y - sh, sd, sd);
    if (opts.flash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opts.flash * 0.5 * alpha;
      const g = wild ? this.glowBy.white : this.glow[color];
      ctx.drawImage(g, x - d * 0.6, y - d * 0.6, d * 1.2, d * 1.2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Engraved surface detail that rolls with the orb: two opposite carved glyphs and a
   * gold inlay band on the equator between them. Everything is projected from the
   * sphere and clipped to it.
   */
  drawSurface(ctx, x, y, d, glyphGeo, roll, angle, alpha) {
    const r = d / 2;
    const k = d / 60;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    // Light comes from the upper left of the screen; express it in the rotated frame.
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const lx = -0.6 * ca - 0.8 * sa;
    const ly = 0.6 * sa - 0.8 * ca;

    const m0 = poseMatrix(roll, false);
    bandPaths(BAND, m0, r * 0.99).forEach((band, b) => {
      const fade = BAND_FADE[b][1] * alpha;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(30,20,6,0.45)';
      ctx.lineWidth = 2.4 * k;
      ctx.stroke(band);
      ctx.strokeStyle = 'rgba(190,150,66,0.7)';
      ctx.lineWidth = 1.1 * k;
      ctx.stroke(band);
    });
    ctx.globalAlpha = alpha;

    for (const flip of [false, true]) {
      const m = flip ? poseMatrix(roll, true) : m0;
      if (m[8] < -Math.sin(MED_ANG)) continue; // glyph entirely behind the sphere
      // carved glyph: lit lip on the side away from the light, then the dark cut
      const glyph = frontPath(glyphGeo, m, r);
      ctx.save();
      ctx.translate(-lx * 0.9 * k, -ly * 0.9 * k);
      ctx.strokeStyle = 'rgba(255,238,200,0.22)';
      ctx.lineWidth = 2.6 * k;
      ctx.stroke(glyph);
      ctx.restore();
      ctx.strokeStyle = 'rgba(14,9,4,0.72)';
      ctx.lineWidth = 2.4 * k;
      ctx.stroke(glyph);
    }
    ctx.restore();
    // The same limb shading lies over the detail as over the stone.
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.limb, x - r * SPRITE_K, y - r * SPRITE_K, d * SPRITE_K, d * SPRITE_K);
  }

  /** Slinger queue / projectile orb (ammo), special effects shown on the orb itself. */
  drawAmmo(ctx, ammo, x, y, d, time, angle = 0, reduced = false) {
    const half = d / 2;
    const sd = d * SPRITE_K;
    const sh = sd / 2;
    const k = ammo.kind;
    if (k === 'normal' || k === 'splash') {
      ctx.drawImage(this.base[ammo.color], x - sh, y - sh, sd, sd);
      this.drawSurface(ctx, x, y, d, this.glyphGeo[ammo.color], AMMO_ROLL, angle, 1);
      ctx.drawImage(this.highlight, x - sh, y - sh, sd, sd);
      if (k === 'splash') this.drawDroplets(ctx, x, y, d, ammo.color, time);
      return;
    }
    if (k === 'wild') {
      this.drawOrb(ctx, x, y, d, 0, true, AMMO_ROLL, angle, time);
      return;
    }
    ctx.drawImage(this.special[k], x - sh, y - sh, sd, sd);
    ctx.drawImage(this.highlight, x - sh, y - sh, sd, sd);
    if (k === 'firebolt') this.drawFlames(ctx, x, y, d, time, '#FFB347', '#FFE0A0', reduced);
    else if (k === 'purple') this.drawFlames(ctx, x, y, d, time, '#B266FF', '#E8C8FF', reduced);
    else if (k === 'frost') this.drawFrost(ctx, x, y, d, time);
    else if (k === 'decay') this.drawDecay(ctx, x, y, d, time);
    else if (k === 'spark') this.drawSparks(ctx, x, y, d, time);
  }

  /** Soft flame licks rising around the orb (slow; no strobing). */
  drawFlames(ctx, x, y, d, t, outer, inner, reduced) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 8;
    const peak = reduced ? 0.22 : 0.38;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const phase = (t * 0.9 + i / n) % 1; // each lick rises and fades over ~1.1 s
      const px = x + Math.cos(a) * d * 0.4;
      const py = y + Math.sin(a) * d * 0.4 - phase * d * 0.35;
      const r = d * (0.24 - phase * 0.1);
      const alpha = peak * Math.sin(phase * Math.PI);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, hexA(inner, alpha));
      g.addColorStop(0.45, hexA(outer, alpha * 0.8));
      g.addColorStop(1, hexA(outer, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const halo = ctx.createRadialGradient(x, y, d * 0.4, x, y, d * 0.8);
    halo.addColorStop(0, hexA(outer, reduced ? 0.12 : 0.22));
    halo.addColorStop(1, hexA(outer, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, d * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawDroplets(ctx, x, y, d, color, t) {
    const c = COLORS[color];
    for (let i = 0; i < 4; i++) {
      const a = t * 1.6 + (i * Math.PI) / 2;
      const px = x + Math.cos(a) * d * 0.68;
      const py = y + Math.sin(a) * d * 0.68;
      ctx.fillStyle = c.base;
      ctx.beginPath();
      ctx.arc(px, py, d * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(px - d * 0.025, py - d * 0.03, d * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFrost(ctx, x, y, d, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.3);
    ctx.strokeStyle = 'rgba(225,245,255,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(d * 0.52, 0);
      ctx.lineTo(d * 0.72, 0);
      ctx.moveTo(d * 0.62, 0);
      ctx.lineTo(d * 0.68, -d * 0.06);
      ctx.moveTo(d * 0.62, 0);
      ctx.lineTo(d * 0.68, d * 0.06);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDecay(ctx, x, y, d, t) {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + t * 0.5;
      const rr = d * (0.5 + 0.12 * Math.sin(t * 1.3 + i));
      ctx.fillStyle = 'rgba(170,200,90,0.55)';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr - ((t * 12 + i * 7) % 10), d * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSparks(ctx, x, y, d, t) {
    ctx.strokeStyle = 'rgba(255,240,200,0.8)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + t * 0.8;
      const r0 = d * 0.55;
      const r1 = d * (0.66 + 0.05 * Math.sin(t * 2 + i));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }

  /** Engraving glow used by the pop dissolve (§7.3). */
  glyphGlowFor(color, wild) {
    return wild ? this.wildGlyphGlow : this.glyphGlow[color];
  }

  glowFor(color, wild) {
    return wild ? this.glowBy.white : this.glow[color];
  }
}

export { mix, rgba };
