// Power-up icons: a carved stone tablet with a gold rim and a softly glowing glyph.
// Each glyph is drawn in a unit box (-1..1).

import { COLORS } from '../defs.js';

const TINT = {
  purpleFire: '#C77DFF',
  slow: '#E8B860',
  wild: '#F2E6D0',
  backwards: '#7FD6C8',
  firebolts: '#FFB050',
  colourWipe: '#D8D0C0',
  colourSplash: '#F07AB8',
  butterflies: '#9CCBFF',
  fireSpinner: '#FF9A40',
  fireflies: '#D8F070',
  frostRay: '#BFE8FF',
  orbOfDecay: '#A8C860',
  wrathOfStars: '#FFE8A0',
  sparkShot: '#FFF0C8',
  runeReward: '#FFD27A',
};

function flame(g, x, y, s) {
  g.moveTo(x, y - s);
  g.bezierCurveTo(x + s * 0.7, y - s * 0.2, x + s * 0.6, y + s * 0.7, x, y + s * 0.75);
  g.bezierCurveTo(x - s * 0.6, y + s * 0.7, x - s * 0.7, y - s * 0.2, x, y - s);
}

const GLYPHS = {
  purpleFire: (g) => {
    g.beginPath();
    flame(g, 0, 0, 0.8);
    g.fill();
  },
  slow: (g) => {
    g.beginPath();
    g.moveTo(-0.5, -0.75);
    g.lineTo(0.5, -0.75);
    g.lineTo(-0.5, 0.75);
    g.lineTo(0.5, 0.75);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(-0.25, 0.55);
    g.lineTo(0.25, 0.55);
    g.lineTo(0, 0.2);
    g.closePath();
    g.fill();
  },
  wild: (g, t) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = COLORS[i].glow;
      g.beginPath();
      const a0 = (i / 6) * Math.PI * 2 + t * 0.4;
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a0) * 0.85, Math.sin(a0) * 0.85);
      g.lineTo(Math.cos(a0 + 0.52) * 0.35, Math.sin(a0 + 0.52) * 0.35);
      g.closePath();
      g.fill();
    }
  },
  backwards: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.6, -0.3, Math.PI * 1.5, false);
    g.stroke();
    g.beginPath();
    g.moveTo(0.64, -0.5);
    g.lineTo(0.3, -0.05);
    g.lineTo(0.85, 0.05);
    g.closePath();
    g.fill();
  },
  firebolts: (g) => {
    g.beginPath();
    flame(g, -0.45, 0.2, 0.42);
    flame(g, 0.45, 0.2, 0.42);
    flame(g, 0, -0.25, 0.48);
    g.fill();
  },
  colourWipe: (g, t, extra) => {
    g.save();
    g.fillStyle = extra?.color != null ? COLORS[extra.color].glow : '#D8D0C0';
    g.beginPath();
    g.moveTo(0, -0.8);
    g.bezierCurveTo(0.6, -0.1, 0.6, 0.6, 0, 0.7);
    g.bezierCurveTo(-0.6, 0.6, -0.6, -0.1, 0, -0.8);
    g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(-0.8, 0.45);
    g.lineTo(0.8, -0.35);
    g.stroke();
  },
  colourSplash: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.32, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.1 + (i % 2) * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  },
  butterflies: (g, t) => {
    const f = 0.75 + 0.25 * Math.sin(t * 3);
    g.save();
    g.scale(f, 1);
    g.beginPath();
    g.ellipse(-0.42, -0.25, 0.4, 0.3, -0.5, 0, Math.PI * 2);
    g.ellipse(0.42, -0.25, 0.4, 0.3, 0.5, 0, Math.PI * 2);
    g.ellipse(-0.3, 0.3, 0.26, 0.2, 0.4, 0, Math.PI * 2);
    g.ellipse(0.3, 0.3, 0.26, 0.2, -0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(0, -0.5);
    g.lineTo(0, 0.55);
    g.stroke();
  },
  fireSpinner: (g, t) => {
    g.beginPath();
    g.arc(0, 0, 0.2, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.8;
      g.beginPath();
      g.arc(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0.11, 0, Math.PI * 2);
      g.fill();
    }
  },
  fireflies: (g, t) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + t * 0.6;
      g.beginPath();
      g.arc(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.16, 0, Math.PI * 2);
      g.fill();
    }
  },
  frostRay: (g) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.moveTo(0, 0);
      g.lineTo(c * 0.8, s * 0.8);
      g.moveTo(c * 0.5, s * 0.5);
      g.lineTo(c * 0.5 + Math.cos(a + 0.8) * 0.22, s * 0.5 + Math.sin(a + 0.8) * 0.22);
      g.moveTo(c * 0.5, s * 0.5);
      g.lineTo(c * 0.5 + Math.cos(a - 0.8) * 0.22, s * 0.5 + Math.sin(a - 0.8) * 0.22);
    }
    g.stroke();
  },
  orbOfDecay: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.62, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.1, -0.62);
    g.lineTo(0.08, -0.2);
    g.lineTo(-0.15, 0.1);
    g.lineTo(0.12, 0.62);
    g.moveTo(0.08, -0.2);
    g.lineTo(0.45, -0.1);
    g.stroke();
  },
  wrathOfStars: (g) => {
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.34 : 0.82;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  },
  sparkShot: (g) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.32;
      g.moveTo(0, 0.7);
      g.lineTo(Math.cos(a) * 0.9, 0.7 + Math.sin(a) * 1.4);
    }
    g.stroke();
  },
  runeReward: (g) => {
    g.beginPath();
    g.moveTo(0, -0.8);
    g.lineTo(0.55, 0);
    g.lineTo(0, 0.8);
    g.lineTo(-0.55, 0);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(0, -0.4);
    g.lineTo(0, 0.4);
    g.moveTo(-0.2, -0.1);
    g.lineTo(0.2, 0.15);
    g.stroke();
  },
};

/**
 * Draw a power-up icon.
 * @param extra { color } for Colour Wipe (mirrors the loaded orb; null = neutral hue)
 */
export function drawPowerupIcon(ctx, type, x, y, r, t, alpha = 1, extra = null, reduced = false) {
  const tint = TINT[type] || '#fff';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // soft glow
  const glowA = reduced ? 0.18 : 0.3;
  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.7);
  glow.addColorStop(0, hexA(tint, glowA));
  glow.addColorStop(1, hexA(tint, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  // stone tablet
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.arc(3, 4, r, 0, Math.PI * 2);
  ctx.fill();
  const tab = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  tab.addColorStop(0, '#5a564a');
  tab.addColorStop(1, '#23211b');
  ctx.fillStyle = tab;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C9A24E';
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  // glyph
  ctx.scale(r * 0.62, r * 0.62);
  ctx.fillStyle = tint;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = tint;
  ctx.shadowBlur = reduced ? 2 : 6;
  (GLYPHS[type] || GLYPHS.runeReward)(ctx, t, extra);
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export { TINT as ICON_TINT };
