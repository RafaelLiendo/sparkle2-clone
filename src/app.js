// App shell: scenes, DOM overlays, input and the fixed-step loop.

import { Audio } from './audio.js';
import { CONFIG } from './config.js';
import { DIFFICULTIES, DIFFICULTY_BY_ID, ENCHANT_BY_ID, ENCHANTMENTS, MAX_LOADOUT, POWERUP_IDS } from './defs.js';
import { Game } from './game/game.js';
import { buildLevel, DAY_BY_ID, DAYS, EPILOGUE, powerupsForTier, PROLOGUE } from './levels.js';
import { makeCanvasEl, paintBackground } from './render/background.js';
import { Renderer } from './render/renderer.js';
import { isAvailable, isCompleted, keysCollected, loadSave, sanitizeLoadout, unlockedEnchantments, writeSave } from './save.js';
import { paintMap } from './ui/mapArt.js';

const W = CONFIG.canvasW;
const H = CONFIG.canvasH;
const STEP = 1 / CONFIG.simHz;
// title-ring angular speed (rad/s) per difficulty; spread wider than the gameplay
// multiplier so a difficulty change is obvious at a glance (~31 s, ~10 s, ~4.5 s per lap)
const TITLE_SPIN = { normal: 0.2, hard: 0.6, nightmare: 1.4 };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class App {
  constructor({ stage, canvas, ui, debug }) {
    this.stage = stage;
    this.canvas = canvas;
    this.ui = ui;
    this.debug = debug;
    this.save = loadSave();
    sanitizeLoadout(this.save);
    this.settings = this.save.options;
    this.audio = new Audio(this.settings);
    this.renderer = new Renderer(canvas, this.settings);
    this.ctx = canvas.getContext('2d');
    this.scene = 'title';
    this.game = null;
    this.day = null;
    this.paused = false;
    this.endTimer = 0;
    this.endShown = false;
    this.acc = 0;
    this.last = performance.now();
    this.time = 0;
    this.pointer = { x: W / 2, y: H / 2, touchHold: false, touchStart: null, type: 'mouse' };
    this.staticLayer = null;
    this.staticKey = null;
    this.fps = 0;
    this.titlePhase = 0;
    this.titleSpin = null;
    this.titleGrow = null;

    this.fit();
    window.addEventListener('resize', () => this.fit());
    canvas.addEventListener('contextrestored', () => {
      this.staticKey = null;
    });
    this.bindInput();
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------------------
  // Layout

  fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = Math.min(vw / W, vh / H);
    this.stage.style.transform = `translate(${(vw - W * k) / 2}px, ${(vh - H * k) / 2}px) scale(${k})`;
    this.renderer.resize(W * k);
    this.staticKey = null;
  }

  toLogical(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  }

  persist() {
    writeSave(this.save);
  }

  // ---------------------------------------------------------------------------
  // Input

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointermove', (e) => {
      const p = this.toLogical(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.type = e.pointerType;
      if (this.scene === 'level' && this.game && (e.pointerType === 'mouse' || this.pointer.touchHold)) this.game.aimAt(p.x, p.y);
    });
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.scene !== 'level' || !this.game || this.paused) return;
      const p = this.toLogical(e);
      this.pointer.type = e.pointerType;
      if (e.pointerType === 'mouse') {
        if (e.button === 0) {
          this.game.aimAt(p.x, p.y);
          this.game.fire();
        } else if (e.button === 2) {
          this.game.swap();
        }
        return;
      }
      // touch / pen: hold shows the guide, release fires; tapping the Slinger swaps
      c.setPointerCapture?.(e.pointerId);
      const s = this.game.slinger;
      this.pointer.touchStart = { x: p.x, y: p.y, onSlinger: Math.hypot(p.x - s.x, p.y - s.y) < 80 };
      this.pointer.touchHold = !this.pointer.touchStart.onSlinger;
      if (this.pointer.touchHold) this.game.aimAt(p.x, p.y);
    });
    const release = (e) => {
      if (e.pointerType === 'mouse' || !this.pointer.touchStart) return;
      const start = this.pointer.touchStart;
      this.pointer.touchStart = null;
      this.pointer.touchHold = false;
      if (this.scene !== 'level' || !this.game || this.paused) return;
      const p = this.toLogical(e);
      if (start.onSlinger) {
        const s = this.game.slinger;
        if (Math.hypot(p.x - s.x, p.y - s.y) < 90) this.game.swap();
        return;
      }
      this.game.aimAt(p.x, p.y);
      this.game.fire();
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', () => {
      this.pointer.touchStart = null;
      this.pointer.touchHold = false;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.scene === 'level' && this.game && !this.paused) {
          e.preventDefault();
          this.game.swap();
        }
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => document.hidden && this.autoPause());
  }

  onKey(e) {
    if (this.scene !== 'level' || !this.game) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (this.paused) this.resume();
      else if (this.game.state === 'playing') this.pauseGame();
      return;
    }
    if (this.paused) return;
    if (e.code === 'Space' || e.code === 'KeyS') {
      e.preventDefault();
      this.game.swap();
    }
    if (this.debug) this.debugKey(e);
  }

  debugKey(e) {
    const g = this.game;
    const keys = '1234567890qwert';
    const i = keys.indexOf(e.key);
    if (i >= 0 && i < POWERUP_IDS.length) g.spawnIcon(this.pointer.x, this.pointer.y, POWERUP_IDS[i]);
    else if (e.key === 'y') g.addRune(g.runeTarget);
    else if (e.key === 'u') g.spawnIcon(this.pointer.x, this.pointer.y);
  }

  autoPause() {
    if (this.scene === 'level' && this.game && this.game.state === 'playing' && !this.paused) this.pauseGame();
  }

  // ---------------------------------------------------------------------------
  // Loop

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    if (this.scene === 'level' && this.game) {
      if (!this.paused) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 24) {
          this.game.update(STEP);
          this.acc -= STEP;
          steps++;
        }
        if (steps >= 24) this.acc = 0;
        const events = this.game.drainEvents();
        this.renderer.handleEvents(events);
        this.audio.handle(events);
        this.renderer.update(dt);
        this.checkEnd(dt);
      }
      const showGuide = this.pointer.type === 'mouse' || this.pointer.touchHold;
      this.renderer.draw(this.game, this.time, { showGuide: showGuide && !this.paused });
      if (this.debug) this.drawDebug();
    } else {
      this.drawStatic(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  drawStatic(dt) {
    const key = `${this.scene}:${this.canvas.width}:${this.save.completed.length}`;
    if (this.staticKey !== key) {
      const layer = makeCanvasEl(this.canvas.width, this.canvas.height);
      const g = layer.getContext('2d');
      const k = this.canvas.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      if (this.scene === 'map') paintMap(g, this.save);
      else paintBackground(g, 'title-marsh');
      this.staticLayer = layer;
      this.staticKey = key;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.staticLayer, 0, 0);
    if (this.scene === 'title') this.drawTitleOrnament(dt);
  }

  drawTitleOrnament(dt) {
    const ctx = this.ctx;
    const k = this.canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const t = this.time;
    const cx = W / 2;
    const cy = 250;
    // a slow ring of stone orbs circling the title, spinning faster and widening by one
    // marble per step on harder difficulties; spin and size ease toward their targets so
    // switching difficulty never jumps the ring
    const ease = Math.min(1, dt * 3);
    const target = TITLE_SPIN[this.settings.difficulty] ?? TITLE_SPIN.normal;
    this.titleSpin ??= target;
    this.titleSpin += (target - this.titleSpin) * ease;
    this.titlePhase += this.titleSpin * dt;
    const step = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === this.settings.difficulty));
    const growTarget = step * CONFIG.orbDiameterPx;
    this.titleGrow ??= growTarget;
    this.titleGrow += (growTarget - this.titleGrow) * ease;
    const rx = 200 + this.titleGrow;
    const ry = (120 / 250) * rx; // keep the ring's tilt as it widens
    const art = this.renderer.art;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.titlePhase;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      const depth = (Math.sin(a) + 1) / 2;
      const d = 34 + depth * 22;
      art.drawShadow(ctx, x, y, d, 0.6);
      art.drawOrb(ctx, x, y, d, i % 6, false, a * 4, a + Math.PI / 2, t, { dark: 0.45 * (1 - depth) });
    }
  }

  drawDebug() {
    const ctx = this.ctx;
    ctx.setTransform(this.renderer.scale, 0, 0, this.renderer.scale, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, H - 58, 330, 50);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '12px monospace';
    const g = this.game;
    ctx.fillText(`fps ${this.fps.toFixed(0)}  orbs ${g.orbCount()}  combo ${g.combo}  rune ${g.runeProgress}/${g.runeTarget}`, 14, H - 40);
    ctx.fillText(`state ${g.state}  pend ${g.pending.length}  buf ${g.slinger.buffer}  grace ${g.tracks.map((t) => t.graceT.toFixed(1)).join('/')}`, 14, H - 22);
  }

  checkEnd(dt) {
    const g = this.game;
    if (this.endShown || (g.state !== 'won' && g.state !== 'lost')) return;
    this.endTimer += dt;
    if (this.endTimer < (g.state === 'won' ? 1.6 : 0.8)) return;
    this.endShown = true;
    if (g.state === 'won') this.onWin();
    else this.showFail();
  }

  // ---------------------------------------------------------------------------
  // Scenes

  setUI(html) {
    this.ui.innerHTML = html;
  }

  bindClicks(map) {
    for (const [sel, fn] of Object.entries(map)) {
      this.ui.querySelectorAll(sel).forEach((el) =>
        el.addEventListener('click', (e) => {
          this.audio.unlock();
          this.audio.ui();
          fn(e, el);
        }),
      );
    }
  }

  /** Normal / Hard / Nightmare selector; wire its buttons to `pickDifficulty`. */
  difficultyPicker() {
    const cur = this.settings.difficulty;
    const btns = DIFFICULTIES.map(
      (d) => `<button class="seg-btn" data-diff="${d.id}" role="radio" aria-checked="${d.id === cur}">${esc(d.name)}</button>`,
    ).join('');
    return `<div class="difficulty"><span class="lbl">Difficulty</span><div class="seg" role="radiogroup" aria-label="Difficulty">${btns}</div></div>`;
  }

  pickDifficulty(btn) {
    this.settings.difficulty = btn.dataset.diff;
    this.persist();
    btn.parentElement.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  }

  /** Day name plus the difficulty the running game was started on. */
  dayLabel() {
    const diff = DIFFICULTY_BY_ID[this.game?.difficulty];
    return diff ? `${this.day.name} · ${diff.name}` : this.day.name;
  }

  showTitle() {
    this.scene = 'title';
    this.game = null;
    const started = this.save.completed.length > 0;
    this.setUI(`
      <div class="screen title-screen">
        <div class="title-block">
          <h1>Sparkle 2 Clone</h1>
          <p class="subtitle">The Five Keys</p>
        </div>
        <nav class="menu">
          <button class="btn primary" data-act="story">${started ? 'Continue the Story' : 'Begin the Story'}</button>
          <button class="btn" data-act="enchant">Enchantments</button>
          <button class="btn" data-act="options">Options</button>
        </nav>
        ${this.difficultyPicker()}
        <p class="hint">Aim with the mouse · click to fire · right-click, wheel or Space to swap</p>
      </div>`);
    this.bindClicks({
      '[data-act=story]': () => this.showMap(),
      '[data-act=enchant]': () => this.showEnchantments(() => this.showTitle()),
      '[data-act=options]': () => this.showOptions(() => this.showTitle()),
      '[data-diff]': (e, el) => this.pickDifficulty(el),
    });
  }

  showMap() {
    this.scene = 'map';
    this.game = null;
    const keys = keysCollected(this.save);
    const nodes = DAYS.map((d) => {
      const done = isCompleted(this.save, d.id);
      const open = isAvailable(this.save, d);
      const cls = done ? 'done' : open ? 'open' : 'locked';
      return `<button class="map-node ${cls}${d.key ? ' key' : ''}" style="left:${d.map.x}px;top:${d.map.y}px"
        data-day="${d.id}" ${open ? '' : 'disabled'} aria-label="${esc(d.name)}${done ? ' (complete)' : open ? '' : ' (locked)'}">
        <span class="seal"></span><span class="label">${esc(d.name)}</span></button>`;
    }).join('');
    const keySlots = [0, 1, 2, 3, 4]
      .map((i) => `<span class="key-slot ${keys[i] ? 'have' : ''}" title="${esc(keys[i] || 'Undiscovered key')}"></span>`)
      .join('');
    this.setUI(`
      <div class="screen map-screen">
        ${nodes}
        <div class="map-bar">
          <button class="btn small" data-act="back">Title</button>
          <div class="keys" aria-label="Enchanted keys recovered: ${keys.length} of 5">${keySlots}</div>
          <button class="btn small" data-act="enchant">Enchantments</button>
          <button class="btn small" data-act="options">Options</button>
        </div>
      </div>`);
    this.bindClicks({
      '[data-act=back]': () => this.showTitle(),
      '[data-act=enchant]': () => this.showEnchantments(() => this.showMap()),
      '[data-act=options]': () => this.showOptions(() => this.showMap()),
      '[data-day]': (e, el) => this.showDayIntro(el.dataset.day),
    });
    if (!this.save.seenPrologue) {
      this.modal(`<h2>Prologue</h2><p class="story">${esc(PROLOGUE)}</p>
        <div class="row"><button class="btn primary" data-act="ok">Take up the Slinger</button></div>`, {
        '[data-act=ok]': () => {
          this.save.seenPrologue = true;
          this.persist();
          this.closeModal();
        },
      });
    }
  }

  modal(inner, handlers) {
    this.closeModal();
    const el = document.createElement('div');
    el.className = 'modal-wrap';
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
    this.ui.appendChild(el);
    for (const [sel, fn] of Object.entries(handlers)) {
      el.querySelectorAll(sel).forEach((b) =>
        b.addEventListener('click', (e) => {
          this.audio.unlock();
          this.audio.ui();
          fn(e, b);
        }),
      );
    }
    const first = el.querySelector('button.primary') || el.querySelector('button');
    first?.focus();
    return el;
  }

  closeModal() {
    this.ui.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  }

  loadoutSummary() {
    if (!this.save.loadout.length) return '<span class="muted">No enchantments equipped</span>';
    return this.save.loadout.map((id) => `<span class="chip">${esc(ENCHANT_BY_ID[id].name)}</span>`).join(' ');
  }

  showDayIntro(id) {
    const d = DAY_BY_ID[id];
    const done = isCompleted(this.save, id);
    const unlocked = unlockedEnchantments(this.save);
    const reward = [];
    if (d.key) reward.push(`<span class="chip key-chip">${esc(d.key)}</span>`);
    if (d.unlock) reward.push(`<span class="chip">${esc(ENCHANT_BY_ID[d.unlock].name)}</span>`);
    this.modal(
      `<h2>${esc(d.name)}</h2>
      <p class="story">${esc(d.intro)}</p>
      ${reward.length ? `<p class="reward">${done ? 'Earned' : 'Reward'}: ${reward.join(' ')}</p>` : ''}
      <div class="loadout"><span class="lbl">Enchantments</span> ${this.loadoutSummary()}</div>
      <div class="row">
        <button class="btn" data-act="cancel">Back</button>
        ${unlocked.length ? '<button class="btn" data-act="enchant">Change enchantments</button>' : ''}
        <button class="btn primary" data-act="go">Begin the day</button>
      </div>`,
      {
        '[data-act=cancel]': () => this.closeModal(),
        '[data-act=enchant]': () => this.showEnchantments(() => this.showDayIntro(id)),
        '[data-act=go]': () => this.startDay(id),
      },
    );
  }

  showEnchantments(onDone) {
    const unlocked = new Set(unlockedEnchantments(this.save));
    const render = () => {
      const cards = ENCHANTMENTS.map((e) => {
        const has = unlocked.has(e.id);
        const on = this.save.loadout.includes(e.id);
        const src = DAYS.find((d) => d.unlock === e.id);
        return `<button class="ench ${has ? '' : 'locked'} ${on ? 'on' : ''}" data-ench="${e.id}" ${has ? '' : 'disabled'} aria-pressed="${on}">
          <span class="name">${esc(e.name)}</span>
          <span class="text">${has ? esc(e.text) : `Complete “${esc(src ? src.name : '?')}” to unlock`}</span></button>`;
      }).join('');
      return `<h2>Enchantments</h2>
        <p class="muted">Equip up to ${MAX_LOADOUT}. Equipped: ${this.save.loadout.length} / ${MAX_LOADOUT}</p>
        <div class="ench-grid">${cards}</div>
        <div class="row"><button class="btn primary" data-act="done">Done</button></div>`;
    };
    const bind = (el) => {
      el.querySelectorAll('[data-ench]').forEach((b) =>
        b.addEventListener('click', () => {
          this.audio.unlock();
          this.audio.ui();
          const id = b.dataset.ench;
          const lo = this.save.loadout;
          if (lo.includes(id)) this.save.loadout = lo.filter((x) => x !== id);
          else if (lo.length < MAX_LOADOUT) lo.push(id);
          this.persist();
          el.querySelector('.modal').innerHTML = render();
          bind(el);
        }),
      );
      el.querySelector('[data-act=done]').addEventListener('click', () => {
        this.audio.ui();
        this.closeModal();
        onDone();
      });
    };
    const el = this.modal(render(), {});
    el.querySelector('.modal').classList.add('wide');
    bind(el);
  }

  showOptions(onDone) {
    const o = this.settings;
    const el = this.modal(
      `<h2>Options</h2>
      ${this.difficultyPicker()}
      <p class="muted">Applies from the next day you begin.</p>
      <label class="opt"><input type="checkbox" data-opt="reducedFlashing" ${o.reducedFlashing ? 'checked' : ''}>
        <span>Reduced Flashing <em>— softer glows, fewer rings and motes</em></span></label>
      <label class="opt"><input type="checkbox" data-opt="muted" ${o.muted ? 'checked' : ''}><span>Mute all sound</span></label>
      <label class="opt range"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-opt="musicVolume" value="${o.musicVolume}"></label>
      <label class="opt range"><span>Effects</span><input type="range" min="0" max="1" step="0.05" data-opt="sfxVolume" value="${o.sfxVolume}"></label>
      <div class="danger-zone">
        <button class="btn small" data-act="reset">Erase story progress…</button>
      </div>
      <div class="row"><button class="btn primary" data-act="done">Done</button></div>`,
      {
        '[data-act=done]': () => {
          this.closeModal();
          onDone();
        },
        '[data-diff]': (e, b) => this.pickDifficulty(b),
        '[data-act=reset]': (e, b) => {
          if (b.dataset.armed) {
            this.save.completed = [];
            this.save.loadout = [];
            this.save.seenPrologue = false;
            this.persist();
            b.textContent = 'Progress erased';
            b.disabled = true;
            this.staticKey = null;
          } else {
            b.dataset.armed = '1';
            b.textContent = 'Click again to erase all progress';
          }
        },
      },
    );
    el.querySelectorAll('[data-opt]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.opt;
        o[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        this.audio.applyVolumes();
        this.persist();
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Level

  startDay(id) {
    const day = DAY_BY_ID[id];
    this.closeModal();
    this.day = day;
    const level = buildLevel(day);
    this.game = new Game(level, {
      seed: (Math.random() * 2 ** 31) | 0,
      enchantments: this.save.loadout,
      powerups: powerupsForTier(day.tier),
      difficulty: this.settings.difficulty,
    });
    this.renderer.setGame(this.game);
    this.scene = 'level';
    this.paused = false;
    this.endTimer = 0;
    this.endShown = false;
    this.acc = 0;
    this.game.aimAt(this.pointer.x, this.pointer.y);
    this.setUI(`
      <div class="screen level-screen">
        <button class="icon-btn pause-btn" data-act="pause" aria-label="Pause">❚❚</button>
        <div class="day-banner">${esc(this.dayLabel())}</div>
      </div>`);
    this.bindClicks({ '[data-act=pause]': () => this.pauseGame() });
  }

  pauseGame() {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.game.pause();
    this.modal(
      `<h2>Paused</h2><p class="muted">${esc(this.dayLabel())}</p>
      <div class="col">
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart the day</button>
        <button class="btn" data-act="options">Options</button>
        <button class="btn" data-act="map">Retreat to the Map</button>
      </div>`,
      {
        '[data-act=resume]': () => this.resume(),
        '[data-act=restart]': () => this.startDay(this.day.id),
        '[data-act=options]': () => this.showOptions(() => this.pauseAgain()),
        '[data-act=map]': () => this.showMap(),
      },
    );
  }

  pauseAgain() {
    this.paused = false;
    this.pauseGame();
  }

  resume() {
    this.closeModal();
    this.paused = false;
    this.last = performance.now();
  }

  onWin() {
    const d = this.day;
    const first = !isCompleted(this.save, d.id);
    if (first) {
      this.save.completed.push(d.id);
      this.persist();
    }
    const lines = [];
    if (d.key) lines.push(`<p class="reward">You recovered the <span class="chip key-chip">${esc(d.key)}</span></p>`);
    if (first && d.unlock) lines.push(`<p class="reward">New enchantment: <span class="chip">${esc(ENCHANT_BY_ID[d.unlock].name)}</span> <em>${esc(ENCHANT_BY_ID[d.unlock].text)}</em></p>`);
    const finale = d.id === DAYS[DAYS.length - 1].id;
    this.modal(
      `<h2>The Circle is sealed</h2><p class="muted">${esc(this.dayLabel())}</p>
      ${lines.join('')}
      ${finale ? `<p class="story">${esc(EPILOGUE)}</p>` : ''}
      <div class="row"><button class="btn" data-act="again">Play again</button>
      <button class="btn primary" data-act="map">Continue</button></div>`,
      {
        '[data-act=again]': () => this.startDay(d.id),
        '[data-act=map]': () => this.showMap(),
      },
    );
  }

  showFail() {
    this.modal(
      `<h2>The Abyss has taken the line</h2><p class="muted">${esc(this.dayLabel())}</p>
      <div class="row"><button class="btn" data-act="map">Retreat to the Map</button>
      <button class="btn primary" data-act="again">Try again</button></div>`,
      {
        '[data-act=again]': () => this.startDay(this.day.id),
        '[data-act=map]': () => this.showMap(),
      },
    );
  }
}

