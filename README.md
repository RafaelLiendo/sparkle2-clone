# Sparkle 2 Clone

A marble-shooter puzzle game modeled on *Sparkle 2* (10tons, 2013), built to the spec in
[`sparkle2-glossary.md`](sparkle2-glossary.md). Fill the Rune Circle, clear the remaining
orbs, recover the five enchanted keys. There is no score.

Plain ES modules + Canvas 2D + WebAudio. No dependencies, no build step.

## Run

```sh
npm start        # serves on http://localhost:5173
npm run build    # bundles everything into a single dist/index.html (esbuild)
npm test         # 51 simulation and progress tests (node:test)
```

Any static file server works too; ES modules just need `http://`, not `file://`. The built `dist/index.html` is self-contained and opens directly from disk (fonts still load from Google Fonts).

## Controls

| Action | Pointer | Touch | Keyboard |
|---|---|---|---|
| Aim | move the mouse (guide always visible) | hold (shows the guide) | — |
| Fire | left click (clicks during the cooldown are banked) | release / tap | — |
| Swap | right click or mouse wheel | tap the Slinger | Space or S |
| Pause | pause button | pause button | Esc or P |

**Difficulty** — Normal, Hard or Nightmare — is chosen on the title screen or in Options and applies from the next day started; story progress is shared.

Options include **Reduced Flashing** (softer glows, fewer rings and motes — appearance only), volume and mute.

### Progress feedback

- **Day intro** shows the day's stones, marks any new colour, and lists the power-ups that join the drops from that day on.
- **Level banner** repeats "New: Purple stones" before the line arrives when a day adds a colour.
- **First sighting**: a power-up icon carries its name until you collect that power-up once.
- **Win reveal**: a recovered key or a new enchantment rises in with its own chime. **Choose enchantments** opens the menu with the new card focused. Nothing is equipped for you.
- **"New" tags** stay on enchantments until you have looked at them in the menu, and the Enchantments buttons show a gold dot until then.
- **World Map**: after a first clear, the cleared seal turns, newly reachable days unveil in turn and a recovered key settles into its slot.
- All of it stays within §7.6: soft fades, no flashes. Reduced Flashing drops the glows and `prefers-reduced-motion` skips the animations.

### Dev URL parameters

- `?day=d5` — jump straight into a day.
- `?difficulty=normal|hard|nightmare` — override the saved difficulty for this session.
- `?scene=map|enchant|options` — open a screen directly.
- `?debug` — stats overlay; while playing, keys `1…9 0 q w e r t` drop each of the 15 power-ups at the cursor, `u` drops a random one, `y` fills the Rune Circle.
- `?tune.<key>=<value>` — override any tunable, e.g. `?tune.abyssGrace=5&tune.speedParams.base=2`.

## Layout

```
src/
  config.js        every tunable, with its canonical default (§ references inline)
  defs.js          palette, power-up roster, ammo kinds, enchantments
  path.js          cubic-Bézier path: arc-length LUT, lead-in, Abyss clamp, crossing cover
  pathBuilders.js  rounded polylines, spirals — tangent-continuous by construction
  levels.js        story days, layouts, power-up unlock tiers, narrative text
  progress.js      what each day introduces, which days a clear opens
  game/
    game.js        simulation core: settle/combo, pops, recoil, effects, runes, abyss, win/lose
    track.js       one path: segments, gap attraction, pushers, feed, overtake, insertion
    slinger.js     queue, reload, overflow reserve, input buffer, cadence, fairness
    effects.js     timed-effect registry + Butterflies / Fireflies / Wrath of the Stars
  render/          orb art, painterly backgrounds, VFX, power-up glyphs, scene renderer
  ui/mapArt.js     parchment World Map
  audio.js         synthesised clicks, cracks, shimmer and the ambient bed
  app.js           scenes, DOM overlays, input, fixed-step (120 Hz) loop
test/              node:test suites for the rules in §1–6
```

The simulation (`src/game`, `path.js`, `levels.js`) is DOM-free and deterministic for a
given seed. It emits events that the renderer and audio consume.

## Spec interpretations

§1–6 are implemented as written. Where the spec left room, these choices were made:

- **Line speed.** `CONFIG.speedParams.base` keeps the canonical 4 orbs/s. Each day overrides it
  through its per-level `speedParams` (0.7–1.0 orbs/s): with 50 px orbs, 4 orbs/s crosses a whole
  path in about 18 s. Rollout (×5), danger crawl (×0.5) and 0.4 s smoothing apply as specified.
  Difficulty then multiplies that per-day base (`CONFIG.difficultySpeed`): Normal ×1, Hard ×2,
  Nightmare ×3. Everything else (shots, recoil, Backwards, drain) keeps its canonical speed.
- **Zoom.** Orbs are 50 px. Paths are drawn in pixels, so the orb size sets how many orbs a
  path holds. Shot and pellet speeds (`projSpeed` 32, `pelletSpeed` 19) are tuned for about
  1600 px/s on screen at this zoom. The Abyss hole (`ABYSS_RADIUS` 0.6) is about as wide as the
  groove.
- **Settle deferral** (§3 Wild) applies to any shot whose run touches a colour-linked,
  attracting gap edge, not only Wilds. The shot resolves once the snap lands, as the shot's own match.
- **Wild pops** are real pops but combo-neutral, so they never drop a power-up and so never recoil.
- **Feed.** A feeding pusher prepends an orb each time it reaches the spawn mouth, so fresh orbs
  are always in contact with the line.
- **Colour Splash payload** is a random colour present on the track when the icon is collected.
- **Colour Wipe hit by a colourless special** (Firebolt, Purple Flame…) wipes a random present colour.
- **Refreshing Slow or Backwards** while it is already active restarts its duration instead of stacking.
- **Enchantment magnitudes** (free details): Tar ×0.8, Tranquility ×0.8 speed and ×1.2 rune
  target, Red No More ×1.2, Speed Unleashed ×1.4, Head Start 2 pips, Retreat Orders −4 orbs/s for 2.5 s.
- **Power-up pool** grows with story progress (seven unlock tiers across the first seven days).
