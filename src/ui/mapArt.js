// World Map (§6.1, §7.6): hand-drawn parchment with inked routes between days.

import { CONFIG } from '../config.js';
import { DAYS, DAY_BY_ID } from '../levels.js';
import { Rng } from '../rng.js';

const W = CONFIG.canvasW;
const H = CONFIG.canvasH;
const INK = 'rgba(58,38,20,';

export function paintMap(ctx, save) {
  const rng = new Rng(9001);
  // parchment base
  const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#d9c49a');
  g.addColorStop(0.7, '#c7ad7a');
  g.addColorStop(1, '#8e7248');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // stains and fibres
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const r = rng.range(20, 120);
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, `rgba(120,86,40,${rng.range(0.03, 0.09)})`);
    sg.addColorStop(1, 'rgba(120,86,40,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 900; i++) {
    ctx.strokeStyle = `rgba(90,60,30,${rng.range(0.02, 0.06)})`;
    ctx.lineWidth = 1;
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const a = rng.range(0, Math.PI);
    const l = rng.range(4, 18);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // Ink landscape: marsh tufts, trees, hills.
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) tuft(ctx, rng.range(40, W - 40), rng.range(420, H - 30), rng);
  for (let i = 0; i < 38; i++) tree(ctx, rng.range(40, W - 40), rng.range(60, 380), rng);
  for (let i = 0; i < 8; i++) hill(ctx, rng.range(100, W - 100), rng.range(80, 300), rng);
  // river
  ctx.strokeStyle = `${INK}0.35)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, 380);
  ctx.bezierCurveTo(250, 330, 380, 440, 620, 390);
  ctx.bezierCurveTo(850, 340, 980, 520, 1290, 470);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, 390);
  ctx.bezierCurveTo(250, 340, 380, 450, 620, 400);
  ctx.bezierCurveTo(850, 350, 980, 530, 1290, 480);
  ctx.stroke();

  // Routes between days.
  for (const day of DAYS) {
    for (const req of day.requires) {
      const a = DAY_BY_ID[req].map;
      const b = day.map;
      const done = save.completed.includes(req);
      ctx.strokeStyle = `${INK}${done ? 0.75 : 0.3})`;
      ctx.lineWidth = done ? 3 : 2;
      ctx.setLineDash([2, 9]);
      ctx.beginPath();
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15;
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  compass(ctx, 1170, 110);

  // title cartouche
  ctx.save();
  ctx.translate(200, 70);
  ctx.fillStyle = 'rgba(230,210,170,0.8)';
  ctx.strokeStyle = `${INK}0.7)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-150, -28);
  ctx.lineTo(150, -28);
  ctx.quadraticCurveTo(170, 0, 150, 28);
  ctx.lineTo(-150, 28);
  ctx.quadraticCurveTo(-170, 0, -150, -28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `${INK}0.9)`;
  ctx.font = '600 26px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Sunken Marches', 0, 2);
  ctx.restore();

  // burnt edge
  const e = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.66);
  e.addColorStop(0, 'rgba(60,35,10,0)');
  e.addColorStop(1, 'rgba(60,35,10,0.55)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H);
}

function tuft(ctx, x, y, rng) {
  ctx.strokeStyle = `${INK}${rng.range(0.25, 0.45)})`;
  ctx.lineWidth = 1.2;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * 3, y);
    ctx.quadraticCurveTo(x + k * 5, y - 6, x + k * 7, y - 10 - rng.range(0, 5));
    ctx.stroke();
  }
}

function tree(ctx, x, y, rng) {
  const h = rng.range(14, 26);
  ctx.strokeStyle = `${INK}${rng.range(0.3, 0.5)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  for (let k = 0; k < 4; k++) {
    const yy = y - h * (0.25 + k * 0.2);
    const w = (4 - k) * 3;
    ctx.moveTo(x - w, yy + 4);
    ctx.lineTo(x, yy - 3);
    ctx.lineTo(x + w, yy + 4);
  }
  ctx.stroke();
}

function hill(ctx, x, y, rng) {
  const w = rng.range(60, 120);
  ctx.strokeStyle = `${INK}0.4)`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.3, y - w * 0.6, x, y - w * 0.5);
  ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.45, x + w, y);
  ctx.stroke();
  for (let k = 0; k < 5; k++) {
    const hx = x - w * 0.5 + k * w * 0.22;
    ctx.beginPath();
    ctx.moveTo(hx, y - w * 0.35 + k * 2);
    ctx.lineTo(hx + 8, y - w * 0.15);
    ctx.stroke();
  }
}

function compass(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = `${INK}0.6)`;
  ctx.fillStyle = `${INK}0.55)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 33, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = '600 13px Cinzel, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -52);
  ctx.restore();
}
