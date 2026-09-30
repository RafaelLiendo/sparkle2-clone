// How to Play: four short pages (aim and fire, swap, combos and power-ups, full screen),
// each with a small live illustration drawn with the game's own art. The swap page can be
// tried for real, with the same inputs as during a day.

import { CONFIG } from '../config.js';
import { COLORS } from '../defs.js';
import { fullscreenSupported, isFullscreen, platform, toggleFullscreen } from '../fullscreen.js';
import { drawPowerupIcon } from '../render/icons.js';
import { TouchGestures } from '../touchGestures.js';

const COARSE = matchMedia('(pointer: coarse)');
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

const DEMO_W = 440;
const DEMO_H = 170;
const D = CONFIG.orbDiameterPx;
const SWAP_SLINGER = { x: 170, y: 88, k: 0.85 };

const FS_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" aria-label="full-screen button"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>';
const SHARE_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4M7 10H5v11h14V10h-2" /></svg>';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Touch and mouse/keyboard rows; the one for this device comes first and stands out. */
function controls(touch, mouse) {
  const row = (lbl, text, here) => `<div class="ctl${here ? ' here' : ''}"><span class="ctl-lbl">${lbl}</span><span>${text}</span></div>`;
  const t = row('Touch', touch, COARSE.matches);
  const m = row('Mouse &amp; keys', mouse, !COARSE.matches);
  return `<div class="controls">${COARSE.matches ? t + m : m + t}</div>`;
}

function fullscreenCards() {
  const cards = {
    desktop: {
      name: 'Computer',
      text: `Press <kbd>F</kbd>, or click ${FS_GLYPH} in the top-right corner of the title or map. During a day, open the Pause menu and choose <b>Full screen</b>. <kbd>F</kbd> or <kbd>Esc</kbd> leaves it.`,
    },
    android: {
      name: 'Android',
      text: `Tap ${FS_GLYPH} in the top-right corner of the title or map, or <b>Full screen</b> in the Pause menu. The game turns to landscape. Go back to leave.`,
    },
    ios: {
      name: 'iPhone &amp; iPad',
      text: `Safari can't make a page full screen on iPhone. Tap Share ${SHARE_GLYPH}, choose <b>Add to Home Screen</b>, then open the game from its new icon: it plays full screen, without the browser bars. On iPad, ${FS_GLYPH} works as well.`,
    },
  };
  const here = platform();
  const order = [here, ...Object.keys(cards).filter((k) => k !== here)];
  return `<div class="fs-cards">${order
    .map((k) => `<div class="fs-card${k === here ? ' here' : ''}"><div class="fs-name">${cards[k].name}${k === here ? '<span class="new-tag">This device</span>' : ''}</div><p>${cards[k].text}</p></div>`)
    .join('')}</div>`;
}

const PAGES = [
  {
    id: 'aim',
    title: 'Aim and fire',
    demo: true,
    body: () => `<p class="tut-text">Orbs roll along the track toward the Abyss. Fire an orb into the line: three or more of one colour together crumble away. Fill the Rune Circle around the Slinger, then clear what is left.</p>
      ${controls('Hold anywhere to aim: a dotted guide shows the path. Lift your finger to fire.', 'Move the mouse to aim along the dotted guide. Click to fire.')}`,
  },
  {
    id: 'swap',
    title: 'Swap orbs',
    demo: true,
    body: () => `<p class="tut-text">The Slinger holds the <b>loaded</b> orb, large and in front, and the <b>next</b> orb, smaller, behind it. A swap trades the two. Use it when the loaded colour has nowhere good to go, or to hold a power-up orb back for the right moment. Swapping never breaks a combo.</p>
      ${controls('Tap with <b>two fingers</b> anywhere, or tap the Slinger.', '<b>Right-click</b>, roll the <b>mouse wheel</b>, or press <kbd>Space</kbd>.')}
      <p class="try" aria-live="polite">Try it here: ${COARSE.matches ? 'tap with two fingers' : 'right-click or press Space'}.</p>`,
  },
  {
    id: 'combo',
    title: 'Combos and power-ups',
    demo: true,
    body: () => `<p class="tut-text">Each match in a row adds to your combo. Every <b>third</b> one (3, 6, 9…) drops a power-up onto the field: <b>shoot it</b> with any orb to collect it before it fades. A shot that matches nothing starts the combo over.</p>
      <p class="tut-text small">Some power-ups load a special orb into the Slinger to fire when you choose; the rest act the moment you collect them.</p>`,
  },
  {
    id: 'fullscreen',
    title: 'Play in full screen',
    body: () => `${fullscreenCards()}
      ${fullscreenSupported() ? `<div class="row tight"><button class="btn small" data-act="fullscreen">${isFullscreen() ? 'Exit full screen' : 'Full screen'}</button></div>` : ''}`,
  },
];

/**
 * Open the How to Play modal.
 * @param app the App (modal, audio, renderer, settings)
 * @param opts.first first run before a day: offers Skip and ends with "Begin the day"
 * @param opts.onDone called after the last page, or after Skip
 */
export function showTutorial(app, { first = false, onDone }) {
  const renderer = app.renderer;
  const art = renderer.art;
  let page = 0;
  let tried = false; // the player swapped on the swap page
  let lastSwap = -10; // demo clock time of the latest swap (drives the arrows)
  let autoSwaps = 0;
  const queue = [
    { kind: 'normal', color: 1 },
    { kind: 'normal', color: 3 },
    { kind: 'normal', color: 0 },
  ];
  const start = performance.now();
  const clock = () => (performance.now() - start) / 1000;

  const el = app.modal('', {});
  const modal = el.querySelector('.modal');
  modal.classList.add('roomy', 'tutorial');

  const onSwapPage = () => PAGES[page].id === 'swap';
  const swap = (byPlayer) => {
    [queue[0], queue[1]] = [queue[1], queue[0]];
    lastSwap = clock();
    if (!byPlayer) return;
    app.audio.unlock();
    app.audio.handle([{ type: 'swap' }]);
    if (!tried) {
      tried = true;
      const msg = modal.querySelector('.try');
      if (msg) msg.textContent = 'That’s a swap: the next orb is loaded now.';
    }
  };

  // --- try-the-swap input: the same gestures as in a day ---------------------------
  const demoPoint = (e) => {
    const c = modal.querySelector('canvas.tut-demo');
    if (!c) return { x: -1e4, y: -1e4 };
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * DEMO_W, y: ((e.clientY - r.top) / r.height) * DEMO_H };
  };
  const gestures = new TouchGestures({
    aim() {},
    fire() {},
    swap: () => onSwapPage() && swap(true),
    onSlinger: (x, y, r) => Math.hypot(x - SWAP_SLINGER.x, y - SWAP_SLINGER.y) < r * SWAP_SLINGER.k,
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 2 && onSwapPage()) swap(true);
      return;
    }
    const p = demoPoint(e);
    gestures.down(e.pointerId, p.x, p.y);
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    const p = demoPoint(e);
    gestures.up(e.pointerId, p.x, p.y);
  });
  el.addEventListener('pointercancel', (e) => gestures.cancel(e.pointerId));
  el.addEventListener(
    'wheel',
    (e) => {
      if (!onSwapPage()) return;
      e.preventDefault();
      swap(true);
    },
    { passive: false },
  );
  const isSwapKey = (e) => e.code === 'Space' || e.code === 'KeyS';
  const onKeyDown = (e) => {
    if (!el.isConnected) return cleanup();
    if (onSwapPage() && isSwapKey(e)) {
      // Space would otherwise press the focused button
      e.preventDefault();
      if (!e.repeat) swap(true);
    } else if (e.code === 'ArrowRight' && page < PAGES.length - 1) go(page + 1);
    else if (e.code === 'ArrowLeft' && page > 0) go(page - 1);
  };
  const onKeyUp = (e) => {
    if (onSwapPage() && isSwapKey(e)) e.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  function cleanup() {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  }

  // --- pages -------------------------------------------------------------------------
  const finish = () => {
    cleanup();
    app.closeModal();
    onDone();
  };
  const go = (i) => {
    page = i;
    render();
  };
  const render = () => {
    const p = PAGES[page];
    const last = page === PAGES.length - 1;
    const dots = PAGES.map((_, i) => `<span class="dot${i === page ? ' on' : ''}"></span>`).join('');
    const nextLabel = last ? (first ? 'Begin the day' : 'Done') : 'Next';
    modal.innerHTML = `
      ${first && !last ? '<button class="btn small tut-skip" data-act="skip">Skip</button>' : ''}
      <p class="tut-step">How to Play · ${page + 1} of ${PAGES.length}</p>
      <h2>${p.title}</h2>
      ${p.demo ? `<canvas class="tut-demo" aria-hidden="true"></canvas>` : ''}
      ${p.body()}
      <div class="tut-nav">
        <div class="tut-side">${page > 0 ? '<button class="btn small" data-act="back">Back</button>' : ''}</div>
        <div class="dots" aria-hidden="true">${dots}</div>
        <div class="tut-side right"><button class="btn primary" data-act="next">${nextLabel}</button></div>
      </div>`;
    const c = modal.querySelector('canvas.tut-demo');
    if (c) {
      const k = renderer.scale;
      c.style.width = `${DEMO_W}px`;
      c.style.height = `${DEMO_H}px`;
      c.width = Math.round(DEMO_W * k);
      c.height = Math.round(DEMO_H * k);
    }
    const on = (sel, fn) =>
      modal.querySelector(sel)?.addEventListener('click', () => {
        app.audio.unlock();
        app.audio.ui();
        fn();
      });
    on('[data-act=next]', () => (last ? finish() : go(page + 1)));
    on('[data-act=back]', () => go(page - 1));
    on('[data-act=skip]', finish);
    on('[data-act=fullscreen]', () => toggleFullscreen());
    modal.querySelector('[data-act=next]').focus();
  };

  // --- illustrations -----------------------------------------------------------------
  const fakeGame = (q, angle) => ({ slinger: { x: 0, y: 0, queue: q, angle, kick: 0 }, pipsLit: () => 5, sealed: false });
  const slinger = (ctx, x, y, k, q, angle, t) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    renderer.drawSlinger(ctx, fakeGame(q, angle), t);
    ctx.restore();
  };
  const label = (ctx, text, x, y, color = '#e9dcc0', size = 15, align = 'left') => {
    ctx.font = `600 ${size}px Cinzel, Georgia, serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  const pip = (ctx, x, y, s, lit) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (lit) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
      g.addColorStop(0, `rgba(255,210,122,${app.settings.reducedFlashing ? 0.2 : 0.4})`);
      g.addColorStop(1, 'rgba(255,210,122,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = lit ? 'rgba(255,214,130,0.95)' : 'rgba(120,105,80,0.6)';
    ctx.lineWidth = 2 / s;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.5, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-3.5, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  const AIM_ROW = [0, 0, 1, 3, 3, 2, 1, 1, 3, 0, 2, 2, 1];
  const drawAim = (ctx, t) => {
    const y0 = 30;
    AIM_ROW.forEach((c, i) => {
      const x = 22 + i * 33;
      art.drawShadow(ctx, x, y0, 30, 0.5);
      art.drawOrb(ctx, x, y0, 30, c, false, 0.9, 0, t);
    });
    const sx = 220;
    const sy = 118;
    const k = 0.72;
    const a = -Math.PI / 2 + (REDUCED_MOTION.matches ? 0.3 : 0.5 * Math.sin(t * 0.8));
    // dotted guide in the loaded orb's colour, stopping at the line
    const len = (sy - (y0 + 16)) / -Math.sin(a);
    ctx.fillStyle = COLORS[queue[0].color].glow;
    for (let d = D * k * 0.9; d < len; d += 13) {
      ctx.globalAlpha = 0.85 * (1 - (d / len) * 0.6);
      ctx.beginPath();
      ctx.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    slinger(ctx, sx, sy, k, queue, a, t);
  };

  const drawSwap = (ctx, t) => {
    const { x, y, k } = SWAP_SLINGER;
    // demonstrate on a loop until the player has tried it
    if (!tried && !REDUCED_MOTION.matches) {
      const n = Math.floor((t - 1.2) / 2.6);
      if (n >= 0 && n + 1 > autoSwaps) {
        autoSwaps = n + 1;
        swap(false);
      }
    }
    slinger(ctx, x, y, k, queue, -Math.PI / 2, t);
    // loaded / next callouts
    const loadedY = y - 0.17 * D * k;
    const nextY = y + 0.57 * D * k;
    ctx.strokeStyle = 'rgba(212,171,85,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + D * k * 0.52, loadedY - 4);
    ctx.lineTo(x + 92, y - 32);
    ctx.lineTo(x + 108, y - 32);
    ctx.moveTo(x + D * k * 0.36, nextY + 3);
    ctx.lineTo(x + 92, y + 42);
    ctx.lineTo(x + 108, y + 42);
    ctx.stroke();
    label(ctx, 'Loaded', x + 114, y - 32, '#f2d58c');
    label(ctx, 'Next', x + 114, y + 42, '#e9dcc0');
    label(ctx, 'fires now', x + 114, y - 14, '#b8a888', 12);
    label(ctx, 'waits behind', x + 114, y + 60, '#b8a888', 12);
    // swap arrows, fading after each swap
    const since = t - lastSwap;
    if (since < 1.1) {
      const alpha = 1 - clamp01((since - 0.5) / 0.6);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#f2d58c';
      ctx.lineWidth = 2;
      const ax = x - D * k * 0.75;
      ctx.beginPath();
      ctx.arc(ax + 18, (loadedY + nextY) / 2, (nextY - loadedY) / 2 + 6, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
      ctx.beginPath();
      const top = (loadedY + nextY) / 2 - ((nextY - loadedY) / 2 + 6) * Math.sin(Math.PI * 0.4);
      ctx.moveTo(ax + 18 - 6, top - 1);
      ctx.lineTo(ax + 18 + 1, top - 5);
      ctx.lineTo(ax + 18 - 1, top + 5);
      ctx.stroke();
      if (!tried) label(ctx, COARSE.matches ? 'two-finger tap' : 'right-click', x, y + 72, '#f2d58c', 13, 'center');
      ctx.restore();
    }
    if (!tried && COARSE.matches && since < 0.6) {
      // two ghost fingertips
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - since / 0.6);
      ctx.strokeStyle = '#e9dcc0';
      ctx.lineWidth = 2;
      for (const fx of [x - 104, x - 74]) {
        ctx.beginPath();
        ctx.arc(fx, y + 10, 11 + since * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const COMBO_COLORS = [0, 1, 2];
  const drawCombo = (ctx, t) => {
    const T = REDUCED_MOTION.matches ? 3.8 : t % 7.2;
    const reduced = app.settings.reducedFlashing;
    COMBO_COLORS.forEach((color, i) => {
      const cx = 64 + i * 104;
      const popAt = 0.8 + i;
      const u = clamp01((T - popAt) / 0.3);
      const back = clamp01((T - 6.6) / 0.5);
      const gone = T >= popAt && T < 6.6;
      const alpha = T >= 6.6 ? back : T < popAt ? 1 : 1 - u;
      const s = gone ? 1 - 0.35 * u : 1;
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        for (let j = -1; j <= 1; j++) {
          const d = 26 * s;
          art.drawShadow(ctx, cx + j * 26, 52, d, 0.5);
          art.drawOrb(ctx, cx + j * 26, 52, d, color, false, 0.9, 0, t);
        }
        ctx.restore();
      }
      const ring = T - popAt;
      if (ring >= 0 && ring < 0.7) {
        ctx.strokeStyle = `rgba(255,214,130,${(reduced ? 0.25 : 0.5) * (1 - ring / 0.7)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, 52, 24 + ring * 50, 0, Math.PI * 2);
        ctx.stroke();
      }
      pip(ctx, cx, 104, 1.8, gone);
      label(ctx, `combo ${i + 1}`, cx, 132, gone ? '#f2d58c' : '#b8a888', 13, 'center');
    });
    // every third match drops a power-up; a shot collects it
    const ix = 386;
    const iy = 72 + (REDUCED_MOTION.matches ? 0 : Math.sin(t * 1.6) * 4);
    const dropAt = 3.1;
    const hitAt = 5.0;
    if (T >= dropAt && T < hitAt + 0.6) {
      const a = T < hitAt ? clamp01((T - dropAt) / 0.4) : 1 - clamp01((T - hitAt) / 0.4);
      drawPowerupIcon(ctx, 'purpleFire', ix, iy, 18, t, a, null, reduced);
      label(ctx, 'power-up', ix, 132, `rgba(242,213,140,${a})`, 13, 'center');
      ctx.strokeStyle = `rgba(212,171,85,${0.6 * a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(300, iy);
      ctx.lineTo(340, iy);
      ctx.moveTo(334, iy - 5);
      ctx.lineTo(340, iy);
      ctx.lineTo(334, iy + 5);
      ctx.stroke();
    }
    const shotAt = 4.3;
    if (T >= shotAt && T < hitAt) {
      const v = (T - shotAt) / (hitAt - shotAt);
      const oy = DEMO_H + 10 + (iy - DEMO_H - 10) * v;
      art.drawOrb(ctx, ix, oy, 20, 1, false, 0.9, 0, t);
    }
    const ring = T - hitAt;
    if (ring >= 0 && ring < 0.7) {
      ctx.strokeStyle = `rgba(255,214,130,${(reduced ? 0.3 : 0.6) * (1 - ring / 0.7)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ix, iy, 20 + ring * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const DEMOS = { aim: drawAim, swap: drawSwap, combo: drawCombo };
  const loop = () => {
    if (!el.isConnected) return cleanup();
    const c = modal.querySelector('canvas.tut-demo');
    const draw = DEMOS[PAGES[page].id];
    if (c && draw) {
      const ctx = c.getContext('2d');
      const k = c.width / DEMO_W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      draw(ctx, clock());
    }
    requestAnimationFrame(loop);
  };

  render();
  requestAnimationFrame(loop);
  return el;
}
