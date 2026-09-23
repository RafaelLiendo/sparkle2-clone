// Painterly, dim, static backgrounds (§7.6): mossy standing stones, foggy swamp water,
// root-tangled ruins. Paths are carved stone grooves; each Abyss is a carved maw.

import { CONFIG } from '../config.js';
import { hashString, Rng } from '../rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const PALETTES = [
  { sky: ['#1b2419', '#121a14', '#0b100c'], blobs: ['#2c3b24', '#3a3322', '#22302e', '#1d2a1f', '#403a2a'], fog: '#9fb3a1', stone: '#4a4a40' },
  { sky: ['#1a2225', '#121819', '#0a0e0f'], blobs: ['#263537', '#2e3a2a', '#3a352a', '#1c2a2c', '#34403a'], fog: '#a8b8bc', stone: '#48494a' },
  { sky: ['#221f18', '#16140f', '#0d0c09'], blobs: ['#3b3322', '#2c3322', '#44392a', '#262a1c', '#3a2f24'], fog: '#b8ae98', stone: '#4c463a' },
];

/** Paint the static field background for a level (logical 1280×720 space). */
export function paintBackground(ctx, themeKey) {
  const W = CONFIG.canvasW;
  const H = CONFIG.canvasH;
  const rng = new Rng(hashString(themeKey || 'bg'));
  const pal = PALETTES[hashString(themeKey || 'bg') % PALETTES.length];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(0.55, pal.sky[1]);
  g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Painterly dabs: many soft blobs of muted colour.
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-100, W + 100);
    const y = rng.range(-100, H + 100);
    const r = rng.range(40, 190);
    const col = rng.pick(pal.blobs);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(col, rng.range(0.18, 0.4)));
    rg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(x, y, r * rng.range(0.9, 1.8), r, rng.range(-0.4, 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // Swamp water pools (dark, faintly reflective).
  for (let i = 0; i < 5; i++) {
    const x = rng.range(0, W);
    const y = rng.range(H * 0.35, H);
    const rx = rng.range(120, 300);
    const ry = rx * rng.range(0.25, 0.4);
    const wg = ctx.createRadialGradient(x, y, 0, x, y, rx);
    wg.addColorStop(0, 'rgba(18,30,32,0.55)');
    wg.addColorStop(0.8, 'rgba(18,30,32,0.3)');
    wg.addColorStop(1, 'rgba(18,30,32,0)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,190,190,0.05)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x + rng.range(-20, 20), y + rng.range(-8, 8), rx * rng.range(0.3, 0.8), ry * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Roots.
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    let x = rng.range(-50, W + 50);
    let y = rng.pick([rng.range(-20, 80), rng.range(H - 80, H + 20)]);
    let a = rng.range(0, Math.PI * 2);
    let w = rng.range(5, 14);
    ctx.strokeStyle = `rgba(20,14,8,${rng.range(0.35, 0.6)})`;
    for (let k = 0; k < 14; k++) {
      const nx = x + Math.cos(a) * rng.range(20, 50);
      const ny = y + Math.sin(a) * rng.range(20, 50);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + nx) / 2 + rng.range(-10, 10), (y + ny) / 2 + rng.range(-10, 10), nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
      a += rng.range(-0.6, 0.6);
      w *= 0.88;
    }
  }

  // Standing stones along the edges (silhouettes with moss).
  for (let i = 0; i < 9; i++) {
    const edge = rng.int(4);
    let x;
    let y;
    if (edge === 0) {
      x = rng.range(0, W);
      y = rng.range(-10, 40);
    } else if (edge === 1) {
      x = rng.range(0, W);
      y = rng.range(H - 30, H + 20);
    } else if (edge === 2) {
      x = rng.range(-20, 30);
      y = rng.range(0, H);
    } else {
      x = rng.range(W - 30, W + 20);
      y = rng.range(0, H);
    }
    standingStone(ctx, x, y, rng.range(40, 80), rng.range(90, 170), rng, pal.stone);
  }

  // Low fog bands.
  for (let i = 0; i < 7; i++) {
    const y = rng.range(0, H);
    const fg = ctx.createLinearGradient(0, y - 60, 0, y + 60);
    fg.addColorStop(0, hexA(pal.fog, 0));
    fg.addColorStop(0.5, hexA(pal.fog, rng.range(0.025, 0.06)));
    fg.addColorStop(1, hexA(pal.fog, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, y - 60, W, 120);
  }

  // Fine grain.
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.025)';
    ctx.fillRect(rng.range(0, W), rng.range(0, H), 1.5, 1.5);
  }

  // Vignette.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function standingStone(ctx, x, y, w, h, rng, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rng.range(-0.15, 0.15));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(8, h * 0.45, w * 0.7, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, shadeHex(color, 0.1));
  g.addColorStop(1, shadeHex(color, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  ctx.quadraticCurveTo(-w * 0.55, -h * 0.2, -w * 0.2, -h / 2);
  ctx.quadraticCurveTo(w * 0.1, -h * 0.58, w * 0.4, -h * 0.35);
  ctx.quadraticCurveTo(w * 0.55, 0, w / 2, h / 2);
  ctx.closePath();
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${60 + rng.int(40)},${90 + rng.int(40)},${40 + rng.int(20)},0.25)`;
    ctx.beginPath();
    ctx.arc(rng.range(-w / 2, w / 2), rng.range(-h / 2, h * 0.1), rng.range(3, 10), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** Carved groove for one path, with its Abyss hole at the end. */
export function paintPathGroove(ctx, path) {
  const D = CONFIG.orbDiameterPx;
  const pts = path.polyline(-3, path.length, 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // cast shadow
  ctx.save();
  ctx.translate(3, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = D * 1.34;
  strokePath(ctx, pts);
  ctx.restore();
  // stone lip
  ctx.strokeStyle = '#4a473d';
  ctx.lineWidth = D * 1.28;
  strokePath(ctx, pts);
  ctx.strokeStyle = 'rgba(120,112,92,0.35)';
  ctx.lineWidth = D * 1.2;
  ctx.save();
  ctx.translate(-1.5, -2);
  strokePath(ctx, pts);
  ctx.restore();
  ctx.strokeStyle = '#3b392f';
  ctx.lineWidth = D * 1.14;
  strokePath(ctx, pts);
  // channel (inner shadow from the upper-left lip)
  ctx.strokeStyle = '#191a15';
  ctx.lineWidth = D * 1.02;
  strokePath(ctx, pts);
  ctx.save();
  ctx.translate(2, 3);
  ctx.strokeStyle = '#23241d';
  ctx.lineWidth = D * 0.9;
  strokePath(ctx, pts);
  ctx.restore();
  // faint gold studs along the lip
  ctx.fillStyle = 'rgba(200,160,80,0.35)';
  const off = D * 0.6;
  for (let s = 0.5; s < path.visibleEnd - 0.5; s += 2) {
    const p = path.pointAt(s);
    const a = path.angleAt(s);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(p.x - Math.sin(a) * off * side, p.y + Math.cos(a) * off * side, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  paintAbyssHole(ctx, path);
}

function paintAbyssHole(ctx, path) {
  const D = CONFIG.orbDiameterPx;
  const R = path.abyssRadius * D;
  const { x, y } = path.end;
  // outer carved stone ring
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(x + 3, y + 5, R + 14, 0, Math.PI * 2);
  ctx.fill();
  const ring = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.6, x, y, R + 12);
  ring.addColorStop(0, '#5d5848');
  ring.addColorStop(1, '#2a2820');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, R + 12, 0, Math.PI * 2);
  ctx.fill();
  // the hole
  const hole = ctx.createRadialGradient(x, y, 0, x, y, R);
  hole.addColorStop(0, '#000000');
  hole.addColorStop(0.6, '#040303');
  hole.addColorStop(0.92, '#15110c');
  hole.addColorStop(1, '#2a241b');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

/** Lip of the maw, drawn over sinking orbs: stone teeth around the rim. */
export function makeAbyssLip(path) {
  const D = CONFIG.orbDiameterPx;
  const R = path.abyssRadius * D;
  const size = Math.ceil((R + 24) * 2);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  ctx.translate(cx, cx);
  // ring band
  ctx.lineWidth = 10;
  const rg = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.5, 0, 0, R + 12);
  rg.addColorStop(0, '#6e6754');
  rg.addColorStop(1, '#2c2a22');
  ctx.strokeStyle = rg;
  ctx.beginPath();
  ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
  ctx.stroke();
  // teeth
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const a0 = a - 0.1;
    const a1 = a + 0.1;
    ctx.fillStyle = i % 2 ? '#3e3a2f' : '#48443a';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * (R + 1), Math.sin(a0) * (R + 1));
    ctx.lineTo(Math.cos(a) * (R - 9), Math.sin(a) * (R - 9));
    ctx.lineTo(Math.cos(a1) * (R + 1), Math.sin(a1) * (R + 1));
    ctx.closePath();
    ctx.fill();
  }
  // engraved rune notches on the band
  ctx.strokeStyle = 'rgba(210,170,90,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R + 2), Math.sin(a) * (R + 2));
    ctx.lineTo(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7));
    ctx.stroke();
  }
  return { canvas: c, size };
}

export { canvas as makeCanvasEl };
