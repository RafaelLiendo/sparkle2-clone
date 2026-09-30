# Sparkle 2 Clone

A marble-shooter puzzle game modeled on *Sparkle 2* (10tons, 2013), built to the spec in
[`sparkle2-glossary.md`](sparkle2-glossary.md). Fill the Rune Circle, clear the remaining
orbs, recover the five enchanted keys. There is no score.

Plain ES modules + Canvas 2D + WebAudio. No dependencies, no build step.

## Run

```sh
npm start        # serves on http://localhost:5173
npm run build    # bundles everything into a single dist/index.html (esbuild)
npm test         # 67 simulation, progress and touch-gesture tests (node:test)
```

Any static file server works too; ES modules just need `http://`, not `file://`. The built `dist/index.html` is self-contained and opens directly from disk (fonts still load from Google Fonts). `dist/` also holds the web app manifest and icons for Add to Home Screen.

## Controls

| Action | Pointer | Touch | Keyboard |
|---|---|---|---|
| Aim | move the mouse (guide always visible) | hold (shows the guide) | — |
| Fire | left click (clicks during the cooldown are banked) | release / tap | — |
| Swap | right click or mouse wheel | tap with two fingers, or tap the Slinger | Space or S |
| Pause | pause button | pause button | Esc or P |
| Full screen | corner button on the title and map, or Pause menu | same (iPhone: Add to Home Screen) | F |

### How to Play

How to Play is a short scripted day. It starts from **Begin the Story** the first time, and again from **How to Play** on the title or the map bar. It always ends on the map.

The game rolls a fixed line in (blue, red, blue, red, blue, red, red, yellow, green, yellow, red, blue, tail to head) and takes aim by itself. At each lesson it stops, spotlights the target and waits for the one input it asks for. Any other click, tap or key is ignored.

1. **Aim and fire**: click or tap the green orb. The shot lands beside it: two greens, no match yet.
2. **Match three**: fire again to make three greens touch. The gap closes because yellow faces yellow.
3. **Swap orbs**: the Slinger holds red, then yellow. Right-click, or tap the Slinger.
4. **Combos**: fire between the yellows. They match, then the reds roll together and match on their own. Three in a row drops Purple Fire, and the recoil opens a gap.
5. **Power-ups**: shoot the power-up through the gap before it closes.
6. **Use them well**: fire the Purple Flame into the middle of the line, which clears it.
7. **The day is won**: the Rune Circle is full and the field is empty. Click or tap anywhere to continue.

The Slinger's orbs, the line and the power-up are scripted, so the run is deterministic. `planTutorial()` (`src/game/tutorialPlan.js`) plays it headlessly and finds each shot's aim by trying angles on forks of the game (`Game.fork()`) until the shot lands on its spot. The live tutorial replays those actions at the same simulation steps. The combo shot and the gap play in slow motion. The Pause menu offers **Skip the tutorial** and **Back to the Title**.

### Mobile

- Touch uses Pointer Events. When a second finger lands, the Slinger swaps once. Nothing fires until every finger has lifted, so a two-finger tap never shoots. Logic in `src/touchGestures.js`.
- Full screen uses the Fullscreen API and, on Android, locks to landscape. iPhone Safari cannot make a page full screen. There, **Add to Home Screen** installs the game from `manifest.webmanifest` (`display: fullscreen`, landscape) and it opens without browser bars.
- In portrait on a touch screen, a screen covers the game and a running day pauses. Until the game is full screen or installed, it first offers full screen for this device: a **Full screen** button where the Fullscreen API exists (Android also turns to landscape), or the Add to Home Screen steps on iPhone. It ends with "or turn your device sideways to play without full screen".
- On touch screens the round buttons are larger, and hover highlights are off so they don't stick after a tap.

**Difficulty** — Normal, Hard or Nightmare — is chosen on the title screen or in Options and applies from the next day started; story progress is shared.

Options include **Reduced Flashing** (softer glows, fewer rings and motes — appearance only), volume and mute.

### Progress feedback

- **Keys** always appear as a key icon, never as text. Each of the five has its own gem colour: Moss green, Tides blue, Embers amber, Stars silver, Night violet. Their names appear only in tooltips and for screen readers.
- **Day intro** shows the day's stones, marks any new colour, and lists the power-ups that join the drops from that day on. A key day shows its key on a medallion in the corner, as an outline until recovered and in gold after. The enchantment its first clear brings sits on its own card, with its medallion.
- **Level banner** repeats "New: Purple stones" before the line arrives when a day adds a colour.
- **First sighting**: a power-up icon carries its name until you collect that power-up once.
- **Win reveal**: on a first clear, a recovered key turns into view and settles into the five-slot key ring, then the new enchantment rises in below. Each has its own cue. **Choose enchantments** opens the new enchantment's group with it chosen. Nothing is equipped for you.
- **Enchantments** come in four groups (Handling, Ammo, Runes, Stones) and the Slinger has one socket per group. They unlock one per first clear, a whole group before the next. Each has its own medallion icon.
- **"New" tags** stay on enchantments until you have looked at them in the menu, and the Enchantments buttons show a gold dot until then.
- **World Map**: a seal's colour shows the day's state: green is cleared, red is ready to play, grey is locked. A cleared day carries a tick. A key day carries its key, pressed into the wax until recovered and gold after. A legend under the map's title explains the seals, and the key ring sits at the top. After a first clear, the cleared seal turns, newly reachable days unveil in turn and a recovered key drops into its slot.
- All of it stays within §7.6: soft fades, no flashes. Reduced Flashing drops the glows and `prefers-reduced-motion` skips the animations.

### Dev URL parameters

- `?day=d5` — jump straight into a day.
- `?difficulty=normal|hard|nightmare` — override the saved difficulty for this session.
- `?scene=map|tutorial|enchant|options` — open a screen directly.
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
  touchGestures.js touch controls: hold/release, Slinger tap, two-finger swap (DOM-free)
  fullscreen.js    Fullscreen API wrapper (webkit fallback, landscape lock)
  game/
    game.js        simulation core: settle/combo, pops, recoil, effects, runes, abyss, win/lose
    track.js       one path: segments, gap attraction, pushers, feed, overtake, insertion
    slinger.js     queue, reload, overflow reserve, input buffer, cadence, fairness
    effects.js     timed-effect registry + Butterflies / Fireflies / Wrath of the Stars
    tutorialPlan.js  the How to Play level and its planned beats (aims found on game forks)
  render/          orb art, painterly backgrounds, VFX, power-up glyphs, scene renderer
  ui/mapArt.js     parchment World Map
  ui/enchantArt.js the enchantment medallions as SVG icons
  ui/keyArt.js     the five keys as SVG icons, and the key ring
  ui/tutorial.js   How to Play run: stepping, input gating, lesson card, spotlight overlay
  ui/rotateHint.js portrait screen: full-screen steps for this device, or turn sideways
  audio.js         synthesised clicks, cracks, shimmer and the ambient bed
  app.js           scenes, DOM overlays, input, fixed-step (120 Hz) loop
test/              node:test suites for the rules in §1–6, the touch gestures and the tutorial script
manifest.webmanifest, icon.svg, icon-*.png   web app manifest and icons
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
