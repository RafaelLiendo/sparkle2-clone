# Sparkle 2 Clone — Design Glossary

> **The single authoritative specification for the Sparkle 2 Clone prototype**, a
> marble-shooter puzzle game modeled on *Sparkle 2* (10tons, 2013) with deliberate
> divergences. Every rule in **§1–6 is a final decision: implement as written**.
> **§7 (Presentation) is direction, not spec** — it describes the look and feel to
> capture; only its explicitly marked hard constraints are binding. Anything not
> specified here is a free implementation detail. There is **no score** of any kind —
> the goal of the game is to fill the Rune Circle and clear the remaining orbs.

## Conventions

- **Plain text** — canonical rule (in §1–6). Implement as written.
- ***(tunable `key` = value)*** — a config-exposed parameter with its canonical default.
  The default is binding until changed through tuning, not a suggestion.
- Where a presentation note (§7) meets a gameplay rule (§1–6), **gameplay wins**.
- All gameplay lengths are measured in **orbs** (1 orb = one orb diameter) and all
  speeds in **orbs/s**. The logical canvas is 1280×720 px; *(tunable
  `orbDiameterPx` = 60)* maps orb units to canvas px.

## Canonical terminology

The word **"chain"** is ambiguous in the wild (physical line vs. combo counter). Code,
UI, and documentation MUST use these disambiguated names:

| Canonical term | Meaning | Forbidden aliases (never in code/UI) |
|---|---|---|
| **Orb** | The colored ball, basic unit of play | marble, ball |
| **Orb Line** | The physical moving sequence of orbs on a path | chain, line, snake, string, train |
| **Combo Counter** | Count of consecutive successful matches (drives power-up drops) | chain, chain counter, combo multiplier |
| **Slinger** | The player's launcher | launcher, spinner, shooter |
| **Pusher** | The object driving an orb line forward | evil pusher, golden hook |
| **Abyss** | The fail endpoint of a path | black hole, sink hole, drain, hole |
| **Path** | The fixed route orbs travel | track, trail, rail |
| **Rune Circle** | The level-objective meter around the Slinger | runes, rune ring, runic charge |
| **Power-up** | Shootable dropped icon granting a one-time effect | powerup, rune reward |
| **Enchantment** | Permanent passive perk equipped on the Slinger | buff, perk |

---

## 1. Core game loop

```
1. Level starts: path(s) load, pusher(s) spawn feeding orb lines toward the Abyss.
2. Player aims the Slinger, optionally swaps current/next orb, and fires.
3. Fired orb inserts into the orb line at the collision point.
4. If insertion creates 3+ contiguous same-color orbs → they pop (a Match).
5. Popping leaves a gap; line ends slide together (Collapse). If same-color groups
   meet with 3+ total, they auto-pop (Cascade) — repeat until stable.
6. Each match event increments the Combo Counter and adds Rune Circle progress.
7. Every 3rd combo increment drops a Power-up icon on the field (shoot it to collect).
8. When the Rune Circle is full: the level is "sealed" — no new orbs or pushers spawn.
9. Win: rune circle full AND all remaining orbs cleared.
   Lose: orbs enter the Abyss and are not recovered within the grace period.
```

### 1.1 Match

Firing an orb so that **3 or more same-color orbs become contiguous** pops that group.
Requires the fired orb plus ≥2 same-color orbs already adjacent in the line. A fired orb
landing between two same-color groups **bridges** them into one larger match — plain
contiguity, resolved as a single pop; not a separately named mechanic.

- The match check runs **0.13 s after insertion** *(tunable `insertSettleDelay`)* so the
  fly-in/shove animation completes before resolution — never on the collision frame.
- **Rapid-shove hold:** the settle check additionally waits while **any insert-capable
  projectile (normal or Wild) is in flight or a buffered shot is banked** (§2.2 input
  buffer). A group pops only once fully settled with nothing else inbound — a shove
  started before the previous one resolved joins the same resolution. (The hold is what
  makes rapid-shove possible: flight time + `fireCooldown` (§2.2) always exceeds
  `insertSettleDelay`.) The *no-match* combo reset (§1.3) is part of the same
  settle check and defers identically — a follow-up shot can turn a would-be miss into a
  match before the group settles. Cascades from gap-close merges (§1.2) are **unaffected**
  by the hold.
- **Per-run coalescing:** settle checks whose orbs share one contiguous run resolve
  **together when the last of them is due** — a coalesced run pops **once**, as a single
  match event (§1.3).
- Re-run match detection after **every** insertion or removal event. Recolor effects
  (Colour Splash, Fireflies) trigger **no** match check of their own: a 3+ run formed in
  place by a recolor stays on the line as a set-up. A recolor produces pops only
  indirectly — recolored **gap edges** that now match engage gap attraction (§1.2), and
  the snap-merge pops as an ordinary cascade.

### 1.2 Collapse & Cascade

After a pop, the forward cut end of the orb line slides backward to rejoin the trailing
end (**gap attraction**). If the meeting orbs are same-color and total 3+, they pop
automatically, possibly chaining further. Implement as an explicit loop:
`close gap → re-check adjacency for 3+ → pop → repeat`.

Gap-attraction motion model:

- The forward segment accelerates from **8 orbs/s** at **45 orbs/s²**, capped at
  **40 orbs/s** *(tunables `attractBase` / `attractAccel` / `attractMax`)*.
- Segments snap together once the gap ≤ **0.04 orbs**.
- **Snaps are kick-free:** an attraction snap applies no impulse of its own — recoil
  belongs solely to power-up-dropping pops (§2.3). Contacts closed by the pusher alone
  (non-matching edges, no attraction) never kick either.
- Attraction engages only when the facing edge orbs are same-color (or Wild).
- **Shove recalculation:** an insertion landing at a facing edge of an attracting gap
  replaces that edge; the attraction re-evaluates against the new pair immediately. If
  the new facing edges still link, the pull **continues seamlessly at its current
  speed** — never reset to `attractBase`. If they no longer link, the attraction stops
  and the pulled segment **coasts out on the standard recoil decay** (its remaining pull
  speed becomes a §2.3 recoil-style velocity decaying at `recoilDecay` — carried
  momentum, so its travel is whatever that speed implies, deliberately **not** the
  fixed 2-orb kick distance) rather than halting on the spot. An insertion elsewhere in either segment leaves the edge pair untouched; per
  §2.3 a shove displaces only the contiguous stretch ahead of it — it eats into the gap,
  never pushes orbs across it.
- **Direction rule:** attraction **always pulls the forward segment backward** — away
  from the Abyss. The trailing (usually pusher-driven) segment never accelerates forward
  to close a gap. Abyss rescue via gap attraction (§1.6) falls out of this same rule — a
  swallowed forward segment is pulled backward out of the hole — not a special case. The
  Pusher obeys the same rule from the other side: a gap between the pusher and its
  rearmost segment engages **pusher gap attraction** (§2.4).
- Attraction is **suspended while Backwards is active** (the hard override moves every
  segment uniformly, §2.3); it re-engages from base speed afterward.

Cascade pops **increment the Combo Counter** exactly like fired matches.

### 1.3 Combo Counter

A running count of **consecutive successful match events**. It exists solely to drive
power-up drops (§1.4). Purely event-based — **no timer** anywhere.

| Event | Effect on counter |
|---|---|
| Match created by a fired **normal** orb | **+1** |
| Each cascade auto-pop (regardless of what started the sequence) | **+1** |
| Fired normal orb that settles with **no match** | **reset to 0** |
| Fired normal orb that leaves the field without hitting anything | **reset to 0** |
| Firing any **special orb** (Firebolt, Purple Flame, Wild) — hit or miss | **neutral** (no change) |
| Shooting/collecting a power-up icon | **neutral** |
| Swapping | **neutral** |
| Coalesced rapid-shove pop (§1.1) with ≥1 normal contributor | **single +1** (one pop = one match event) |
| Contributing normal shove that would **not** have matched alone at the instant it landed | **reset to 0 before** the pop's +1 |

Special-shot neutrality is precise: orbs a Purple Flame or Firebolt destroys directly,
and a match completed by a Wild, do **not** increment the counter; a special shot that
achieves nothing does **not** reset it. Direct effect destruction is **silent** (§4) —
not a pop at all — whereas a Wild match is a real pop that is merely combo-neutral.
Either way, **cascades that follow** (gap-close auto-pops) increment normally.

The same neutrality extends to power-up effects: silent destruction (§4) never touches
the counter, and a recolor pops nothing by itself (§1.1) — its snap-merge matches are
ordinary cascades (+1). A projectile that collects a power-up icon is **consumed** by
the collection — it never flies on to become a combo-resetting miss.

**Rapid-shove combo rules** (see §1.1 for the hold/coalescing): each shove records **at
the instant it lands** whether it alone completed a 3+ run — the *hypothetical per-shove
match test*. Prior rapid-shoved orbs already in the line count toward that hypothetical
(they are physically present). When a coalesced run finally settles and pops, any
contributing **normal** shove that failed its hypothetical **resets the counter first**;
the pop's single +1 then lands on the reset counter. Example: rapid-building a lone orb
1 → 2 → 3 still pops, but combo 5 → 0 → 1 — the first shove made only a pair. A run that
settles below 3 keeps the ordinary reset rule (each normal contributor settled with no
match). A pending orb destroyed while held (cascade, Firebolt, board-wide effect) is
**never a miss**: its check is consumed silently. Intent: rapid-shove lets a skilled
player grow one bigger match or dump unwanted orbs without breaking the combo — while
panic clicking risks the combo *and* the pop.

### 1.4 Power-up drop rule

A power-up icon drops onto the field on **every 3rd Combo Counter increment**
(counter = 3, 6, 9, 12…).

- **Spawn position:** the centroid of the triggering match's popped group, clamped to a
  **1.6 orb** margin inside the field edges.
- **Drift:** icons drift at **0.5 orbs/s** *(tunable `runeDriftSpeed`)* with a sinusoidal
  heading wobble, a vertical bob, and bounces off the same field margin. Direction bias:
  **away from the Slinger** by default *(tunable `runeTowardBias` = 0.2)*; the
  **Power Magnetism** enchantment flips the bias toward the Slinger (`runeTowardBias` = 0.8).
- **Lifetime:** **8 s** *(tunable `runeLife`)*, then the icon disappears.
- **Concurrency cap:** at least **3** icons may coexist *(tunable `runeMax` = 3)*.
- **Collection:** shoot the icon with an orb. Collection is combo-neutral and
  consumes the projectile (§1.3). Armed-type power-ups load as special orbs at the
  **front of the Slinger queue** (§2.2), displacing excess orbs into the overflow
  reserve; instant types take effect on collection — the armed/instant split is
  canonical in §4.
- **Effect selection:** randomized from the player's unlocked power-up pool using
  per-type weights, with an anti-repeat rule: a roll matching the previous drop's type is
  rerolled with **80%** probability. 15-type weights *(tunable `powerupWeights`)*:
  Purple Fire **30**, Slow **25**, Wild **25**, Backwards **20**, Firebolts x3 **14**,
  Colour Wipe **10**, Colour Splash **10**, Flight of the Butterflies **10**,
  Fire Spinner **10**, Fireflies **10**, Frost Ray **10**, Orb of Decay **10**,
  Wrath of the Stars **10**, Spark Shot **10**, Rune Reward **6**.
- **Colour Wipe icons take their color from the shot that collects them**: the wipe
  removes the color of the orb that hits the icon. The icon's displayed color mirrors the
  **currently loaded orb**, updating live as the player swaps — what the player sees on
  the icon is what firing right now would wipe. A Wild loaded orb shows the icon's
  neutral hue (its color is unknown until fired); a Wild collector wipes the concrete
  color the shot resolved to at fire time.

Acquisition model is **drop-and-shoot only** — there is no chargeable "pick your effect"
meter.

### 1.5 Rune Circle (level objective)

A ring of runes around the Slinger that fills as the player pops orbs. When full, the
level is **sealed**: no new orbs, lines, or pushers spawn. The player then clears the
remaining orbs to win.

- **Fill rule:** each popped orb adds progress — including orbs destroyed by special
  shots and power-up effects; orbs lost to the Abyss drain add nothing. The level defines
  a target *(per-level `runeTarget`, in orbs popped)*. Power-up collection does **not**
  fill the ring — with one exception by definition: **Rune Reward** (§4), whose entire
  effect is lighting one pip.
- **Visual:** a 12-pip ring lit proportionally to progress (`orbsPopped / runeTarget`).
- An **objective meter, not a spendable currency**.
- Enchantment interactions: Head Start (pre-lit runes), Rune Fire (Fire Spinner every 6
  runes lit), Retreat Orders (push-back on completion), March of the Furious
  (Butterflies on completion).

### 1.6 Lose condition — the Abyss grace period

The fail is **recoverable**, not instant:

**Entering the Abyss.**
- The Abyss has **no collision**. Orbs are never stopped, held, or destroyed by touching
  it — they keep traveling along the path's extension **into** the Abyss at normal line
  speed, visually sinking as they go.
- The **grace timer** *(tunable `abyssGrace` = 3 s)* starts when the first orb crosses
  the track end into the Abyss. While any orb is inside, the timer runs; if **all** orbs
  leave the Abyss (recovered or destroyed), the timer resets fully. On multi-path levels
  (§2.5) each Abyss runs its **own grace timer** over the orbs inside it — a rescue out
  of one Abyss resets that timer only, and activity on one path never masks an overrun
  on another.
- If **any** Abyss's timer expires with orbs still inside **and no timed power-up effect
  is active** (any duration-based effect — Slow, Backwards, and future ones
  automatically): a **global** drain animation consumes every remaining line on every
  path, each into its own Abyss (accelerating suck-in, **12 orbs/s + 21 orbs/s²**), then
  the fail screen appears with **"Try again"** / **"Retreat to the Map"**. While such an
  effect runs, the drain is **deferred** — the grace timer keeps counting and the drain
  fires the instant the last effect ends — so a last-second Backwards (or even a Slow)
  always gets its chance at a comeback. "Active" is defined by the **timed-effect
  registry** (§4). Armed but unfired charges (e.g. a held Purple Fire shot) are not
  effects, never enter the registry, and do **not** defer the drain — the window
  cannot be stalled indefinitely.
- Once the drain fires, **gameplay is over and the suck-in is the only motion**: the
  Slinger cannot fire, no new orbs feed in, and gap attraction / recoil / the speed
  model no longer apply. The **Pusher drains with its line** at the same accelerating
  speed — consumed together with the orbs it was driving, never left marching at normal
  speed behind them.

**During the grace period.**
- Play continues completely normally for all orbs **outside** the Abyss: aiming, firing,
  matching, cascades, power-up drops.
- The head orb is a legal target even at the brink: a front-side insertion may land the
  fired orb **inside** the Abyss, shoving the line deeper. High-risk / high-reward — a
  match formed there pops normally (swallowed orbs included) and can open the gap that
  pulls the line back out; a non-match is an ordinary miss (§1.3).
- Orbs **inside** the Abyss cannot be hit by fired orbs (no collision inside the Abyss).
  They can only be affected by (this rescue list is **closed** — do not add routes):
  - **Gap attraction** — popping orbs just behind the swallowed group opens a gap; if
    the facing edges match, attraction pulls the head segment **backward out of the
    Abyss**.
  - **Pusher gap attraction** (§2.4) — a gapped pusher pulls the nearest segment
    backward toward itself, dragging swallowed orbs back out. The deep-rescue route:
    costs shots at the rear while the head keeps sinking.
  - **Recoil** — a power-up-dropping pop (§2.3) directly behind the swallowed stretch
    kicks it backward, carrying inside orbs back out.
  - **Backwards** power-up — reverses the whole line, pulling swallowed orbs back out.
  - **Board-wide power-ups** — Colour Wipe removes its color everywhere, including
    inside the Abyss; Fireflies may recolor inside orbs, and matches that include them
    pop them.
  - **Area-of-effect blasts** — Purple Flame, Frost Ray, and any other destructive
    power-up affect orbs inside the Abyss **only where the blast radius/line overlaps
    the Abyss region**. The blast, not the projectile, is what reaches inside.

The **danger crawl** (§2.3) slows the line near the Abyss, effectively extending the
grace distance.

### 1.7 Win condition

Level is won when: the Rune Circle is full (spawning sealed) **and** zero orbs remain on
any track **and** no projectile is still in flight. The level does **not** end the
moment the circle fills — the cleanup phase continues and the abyss-loss check keeps
running every frame, so late losses are possible.

**Soft-lock failsafe:** if every wave's stock is exhausted and the field is cleared
while the circle is still unfilled, the circle is treated as sealed so the win can
resolve. Level definitions should make this unreachable (stock ≫ `runeTarget`).

---

## 2. Entities

### 2.1 Orb

The basic colored unit. Data shape: `Orb { color, specialType?, wild: bool, flags }`.

- **Palette (6 colors)** red: #B82A09; blue: #095FB8; green: #0FB809; yellow: #B8860C; purple: #B80E9E; black: #33302A; — each with hi/lo/glow shade variants. 
- **Material, motion feel, pop VFX and audio direction: §7.** Orbs read as heavy
  stone, never bubbles or candy.
- **Wild is a flag** on the orb, not a seventh color.
- The active color set per level is `allowedColors[]`; difficulty scales it (fewer +
  slower early; more + faster later). Red and blue are referenced by name in
  enchantments (Red No More, Orbs Unhatched, March Blue).

### 2.2 Slinger

The player-controlled launcher, positioned on the level (often central), pivoting to aim
(full 360° in some layouts).

- **Ammo queue: 3 orbs** (1 loaded + 2 preview); **4 with Horn of Plenty** (1 + 3).
  Filled instantly at level start.
- **Non-instant reload:** firing does **not** refill the queue on the same frame. While
  the queue is below capacity, one orb reloads every **0.25 s** *(tunable `reloadTime`)*,
  appended at the tail — drawn from the **overflow reserve** first, else freshly
  generated. `reloadTime` > `fireCooldown` on purpose: mash-firing genuinely drains the
  queue; a relaxed cadence never notices. The queue can run empty; firing on an empty
  queue is a no-op (no projectile, no cooldown). The head is always the loaded slot, so
  the first orb reloaded after emptying is immediately fireable.
- **Overflow reserve:** orbs displaced past queue capacity by a power-up pickup move to
  a secondary reserve instead of being destroyed — a pickup never destroys ammo. The
  reserve preserves the displaced orbs' original relative order and has **priority when
  reloading**. Reserve orbs participate in fairness rerolls; they never participate in
  swaps. The reserve has **no on-screen indicator** — banked orbs surface only as they
  reload into the queue.
- **Ammo fairness rule:** loaded colors are drawn uniformly from colors **still present
  on the track**, and queued orbs (including the overflow reserve) are rerolled if their
  color disappears mid-play. Special orbs are exempt from rerolls — a Colour Splash orb
  keeps its payload color even if that color leaves the track (Splash *reintroduces* a
  color rather than matching one).
- **Swap** exchanges the loaded and next orb (O(1)). With **Eternity Swap**, swap
  instead sends the loaded orb to the **back** of the queue (full cycle). Power-up orbs
  swap like any other orb — swap is how the player times a held power-up.
- **Aim guide:** a dotted trajectory line, stopping at the first orb it would hit,
  tinted to the effective next shot (loaded orb's special > loaded orb's color; Colour
  Splash keeps the orb's color since that's what it paints). On pointer platforms the
  guide is **always visible** during play; on touch, hold shows the guide and release
  fires, tap fires immediately.
- **Fire:** every click/tap fires immediately; cooldown **0.17 s** *(tunable
  `fireCooldown`)*; projectile speed **27 orbs/s** *(tunable `projSpeed`)*.
- **Rapid-fire input buffer:** a click/tap blocked **only by the cooldown** is banked
  instead of dropped, up to **the number of orbs currently in the queue** — excess
  clicks are dropped, so the buffer can never out-run the ammo. Buffered shots launch
  automatically as the cooldown allows, each using the **live aim at its launch
  instant** (the buffer is a bare counter; no aim is captured at click time). Nothing
  banks while not playing or while the Abyss drains, and the buffer is cleared on
  pause/win/fail/drain — no posthumous shots. The cap is **derived from the live queue
  length**, not a tunable. Mash-firing thus empties the queue at exactly one shot per
  `fireCooldown`, and drives the §1.1 rapid-shove hold.
- **Power-up orbs:** collecting an armed-type power-up loads matching special orb(s) at
  the **front of the queue** (the loaded slot) — Firebolts x3 loads **three one-shot
  Firebolt orbs**. Power-up orbs are ordinary queue members: they can be swapped,
  Eternity-cycled, and held until the player chooses to fire them, so up to queue
  capacity of power-up orbs may be held at once. The special state is shown **on the
  orb itself**: flame orbs are engulfed (violet/golden), Splash orbits paint
  droplets, Wild goes prismatic — no HUD text.
- **Appearance and queue presentation direction: §7.5.**
- Enchantment loadout (up to 4) attaches to the Slinger; every-Nth-loaded-orb cadence
  counters for special-orb enchantments (§3) live here.

### 2.3 Orb Line

An ordered, moving sequence of orbs following a path.

- **Segments:** orbs on a path are ordered by track distance; contiguous **segments are
  recomputed every frame** wherever the gap between neighbors exceeds **1.04 orbs**
  (one diameter plus the 0.04-orb snap epsilon), so splits and merges fall out for free.
- **Overlap & merge resolution:** overlapping neighbors resolve by **forward-packing**
  (the rear orb pushes the front orb toward the head). A merge is any cross-segment gap
  that closes during a frame; every merge runs a junction match check and auto-pops at
  3+ (a cascade).
- A level can have **multiple simultaneous lines** on one or more paths.
- **Speed model** *(per-level tunable `speedParams`)*:
  - Base pusher speed **4 orbs/s**.
  - **Rollout feed-in:** the line enters at **20 orbs/s** (rollout multiplier ×5);
    once the head reaches **25%** of the **visible span** (§2.5) the multiplier drops
    to ×1 and the line eases down to base speed (4 orbs/s).
  - **Danger crawl:** once the head passes **75%** of the visible span the line slows
    again, **×0.5** (2 orbs/s at base) — a built-in comeback softener, independent of
    the abyss grace window.
  - Multiplier changes are smoothed with a **0.4 s** time constant (inertia) — the
    smoothing is what makes the 25% and 75% thresholds read as gradual slow-downs,
    never steps.
  - **Recoil kick:** a pop whose combo increment **drops a power-up** (every 3rd
    increment, §1.4) kicks the line; ordinary pops do **not** recoil. The kick
    displaces each attached stretch by exactly **2 orbs** *(tunable `recoilDistance`)*,
    applied as an exponential-decay velocity layered additively on the base motion:
    initial speed `recoilDistance × recoilDecay` = **6 orbs/s**, decaying `e^(−3t)`
    *(tunable `recoilDecay` = 3)*, whose integral is exactly `recoilDistance` — the
    same travel **regardless of the line's current speed**. A fresh kick on a stretch
    still recoiling restarts the remaining travel at `recoilDistance` (no stacking).
    The kick opens the line around the match centroid at the exact moment an icon
    spawns there, clearing room to shoot it (§1.4). Recoil belongs to **power-up pops
    only**: ordinary pops, and silent power-up/special destruction (§4), never kick
    the line.
  - **Recoil locality rule:** recoil is carried by the orbs that took the hit, never by
    the line as a whole. A power-up pop kicks its two attached stretches **apart**: the
    contiguous stretch behind kicks **backward 2 orbs**, and the contiguous stretch
    ahead kicks **forward 2 orbs** — unless the front stretch's head orb is inside the
    Abyss, in which case it kicks backward instead (the §1.6 rescue). Attraction snaps
    are kick-free (§1.2). Nothing crosses a gap: in
    `pusher → A → gap → B → gap → C → pop → D`, C kicks back and D kicks forward while A
    keeps marching and B holds still — the pop's gap opens from both sides, leaving room
    to shoot the power-up dropped at the match centroid (§1.4). This holds even when the
    pop lands at a segment's edge beside a gap that attraction is still closing: until
    the segments snap together they are **not attached**, so the far segment takes no
    recoil.
  - **Contact absorbs recoil:** when a moving stretch reaches another segment and they
    merge, all residual recoil in the merged body zeroes. Recoil never travels through a
    merge — otherwise the pusher segment would jerk backward whenever it caught up to a
    stretch still carrying the tail of an old kick from an event it was never attached
    to.
- **Modifier stacking policy (three tiers):** slow-type factors **multiply** into one
  multiplier (rollout × Slow × danger-crawl × Tar × Tranquility), which is then
  time-smoothed; **Backwards is a hard velocity override** (discards the multiplier
  stack for its duration); **recoil is additive** on top of whichever base applies.
- **Backward overrun:** the track has no rear wall. Backward drivers (Backwards, recoil,
  attraction) may carry orbs to arbitrary **negative track distance**, so a retreating
  line simply continues off-screen (geometry: §2.5 lead-in extrapolation). Feeding
  pauses while the tail is behind the mouth and resumes once it returns; the feed-guard
  nudge applies only to the pusher's own contiguous stretch, never across a gap (§2.4
  contact-gated drive holds during recovery).
- **Shove:** an inserted orb pushes the contiguous stretch ahead of it **as one block**
  (behind is untouched); the block settles into place with at most a slight, bounded
  overshoot of the block as a whole (§7.2). Insertion plays a dry orb-on-orb click
  (§7.4).

### 2.4 Pusher

A gold, forked/hooked object at the tail of an orb line that drives it forward.

- **Spawn model:** continuous, **position-gated** feed (no spawn timer) — while the tail
  orb sits at/past the spawn mouth and less than **1.5 orbs** of buffer remain
  behind it, new orbs are prepended. Each level defines an orb stock / spawn schedule;
  sealing the Rune Circle stops all further spawning.
- **Drive is contact-gated:** the pusher pushes only the segment it is touching. A
  segment in contact with neither the pusher nor another segment never self-propels —
  it moves only under recoil, attraction, or a board-wide override. ("Rearmost segment
  always gets base speed" is the wrong rule: it teleports the drive across the gap the
  moment the pusher's stretch dies.)
- **Pusher gap attraction:** when the stretch attached to the pusher is destroyed
  entirely and the pusher cannot feed replacements (stock exhausted or sealed), the
  pusher pulls the nearest segment **backward** toward itself using the §1.2 attraction
  motion model (`attractBase` / `attractAccel` / `attractMax`), with **no color gate** —
  the pusher has no color. The pusher keeps marching at the line's current velocity
  during the pull. On contact, normal pushing resumes: the contact is kick-free (§1.2)
  and absorbs residual recoil (§2.3); there is no junction orb pair, so no cascade
  check. While the pusher can still feed it is never gapped — fresh orbs
  enter at the mouth already in contact — so the mechanic only engages late in a wave,
  exactly when Abyss rescue (§1.6) matters. Suspended during Backwards like all
  attraction (§1.2).
- **Destruction:** a pusher dies when its line is empty **and** it can feed no more orbs
  (circle sealed or stock exhausted), or when overtaken.
- **Overtake/merge rule:** pushers can move at different speeds on different path
  portions; if a faster rear line catches a slower front line's pusher, the overtaken
  pusher is destroyed and its orbs merge into the surviving line. Trigger: the rear head
  within **1.6 orbs** of the front tail; the merged line resumes speed scale
  1.0 and the junction gets a cascade check.

### 2.5 Path & Abyss

- **Path:** fixed route from spawn point to the Abyss, authored as a **cubic Bézier
  spline** (chained cubic Bézier segments, tangent-continuous at every join) — **never
  Catmull-Rom**. Path shapes are smooth sweeping curves or square-like turns with
  **rounded corners**; sharp corners and cusps are forbidden. Layouts include
  single-path, multi-path, and circular routes; later levels demand split attention
  across lines. Two path sections passing close together are an intended target for
  AoE/recolor power-ups.
- **Multi-path levels:** a level may define several paths. Each path is a complete,
  independent route with its **own spawn lead-in, own Pusher waves, and own Abyss**
  (per-path grace, §1.6). Orb Lines on different paths **never interact**: no cross-path
  matching, gap attraction, recoil, shove, or Pusher overtake/merge. Board-wide and area
  effects (§4) are the only things that reach across paths.
- **Crossings:** paths may cross. Z-order is the path's index in the level definition —
  later paths render **on top** (the bridge). The covered stretch of the lower path is
  computed once at level load: every track position whose point lies within *(tunable
  `crossoverCover` = 0.8 orbs)* of a higher path's centerline is covered, merged into
  contiguous **covered intervals**. Covered orbs are **not targetable**, exactly like
  orbs inside the Abyss (§1.6): projectiles pass over them (no collision, no insertion)
  and the aim guide ignores them. Everything else still applies: covered orbs keep
  moving, matching, cascading, attracting, and recoiling, and every §4 effect (blasts,
  beams, wipes, recolors, stars, butterflies) reaches them — the cover blocks **shots**,
  nothing else. The top path at a crossing is fully hittable.
- **Spawn lead-in:** every path is prepended with a straight off-screen lead of
  *(tunable `spawnLeadOrbs` = 20)* orb diameters, extended along the reversed entry
  tangent. Orbs **always spawn off-screen** — including prefilled waves, whose head sits
  at the spawn boundary (leftover stock feeds normally). The lead gives the player prep
  time and puts a full line behind the head the moment it appears, so recoil works from
  screen entry. All progress fractions (rollout, danger crawl) are measured over the
  **visible span**: 0 at the lead's end, 1 at the Abyss edge. The lead-in has no floor:
  track coordinates below 0 extrapolate the entry tangent as a straight line; only the
  far end clamps, at the hole's center (§2.3 backward overrun).
- **Abyss:** terminal region of the path. **Non-colliding** — orbs travel into it and
  projectiles cannot reach orbs inside (§1.6). Model as a terminal path extension +
  grace-timer trigger. Flight of the Butterflies visually emerges from it.
- **Abyss geometry:** one constant, *(tunable `ABYSS_RADIUS` = 1.2 orbs)*. The path ends at
  the hole's center, so the visible hole radius and the swallowed path depth are the
  same length — "inside the Abyss" is exactly what the player sees as the hole. All
  renderer dimensions derive from it.

### 2.6 Power-up entity

Independent field entity: `PowerupEntity { type, position, driftVelocity, ttl }`.
Spawned per §1.4, collected by orb collision. Never attach power-ups to the HUD — their
spatial (shoot-to-collect, drifting) nature is a core skill element.

---

## 3. Special orbs

Special orbs live in the Slinger queue like any other orb. They arrive by two routes:
enchantment cadence replaces a freshly generated orb (every Nth loaded), and power-up
pickups load special orb(s) at the **front** of the queue (§2.2). Either way they swap
freely and fire when the player chooses. Firing one is **combo-neutral** in both
directions (§1.3).

| Special orb | Effect | Source |
|---|---|---|
| **Firebolt** | Destroys exactly **one** orb on impact — silent destruction (§4): not a pop, no recoil, no cascade. The opened gap can still match indirectly via gap attraction (§1.2). | Firebolts x3 power-up (three one-shot Firebolt orbs at the queue front); Sudden Fire enchantment (every 10th loaded orb). |
| **Purple Flame** | AoE blast on impact: destroys **all orbs within a 6-orb radius** *(tunable `bombRadius`)* of the impact point, **regardless of color**. Destroyed orbs are grouped into contiguous runs; each run is destroyed **silently** (§4) — only follow-on gap-close cascades pop and increment. One asset — the Purple Fire power-up and the Flame Purple enchantment fire the same effect. | Purple Fire power-up; Flame Purple enchantment (every 20th loaded orb). |
| **Frost Ray charge** | Firing releases the §4 Frost Ray beam along the aim instead of a projectile. | Frost Ray power-up (pickup only — no enchantment cadence). |
| **Decay charge** | Ordinary projectile; on impact triggers the §4 Orb of Decay effect. | Orb of Decay power-up (pickup only). |
| **Spark charge** | Firing releases the §4 Spark Shot pellet fan along the aim instead of a projectile. | Spark Shot power-up (pickup only). |
| **Wild Orb** | Color wildcard. `sameColor(a,b)` returns true whenever either orb is Wild; run detection is **pairwise adjacency chaining** — a run is the maximal contiguous stretch where every adjacent pair satisfies `sameColor`, which walks outward **through** the Wild in both directions. A Wild between two *different*-colored groups merges them into **one contiguous run** that pops as a single event if the combined length ≥ 3 — the sides need not individually reach 3 (e.g. 2 red + Wild + 1 blue = 4 → all four pop); the Wild must sit **between** the groups it bridges. Fired shots may also complete matches of 1 colored orb + 2 Wilds, or of 3+ Wilds (combined ≥ 3 is the only size rule). A fired *normal* orb completing a match through an in-line Wild counts as a normal shot (combo +1). **Deferred resolution:** a Wild at a run's segment-edge links across the adjacent gap, so gap attraction engages (§1.2); the shot's match check **waits until every such adjacent attraction has snapped**, then the merged run pops as **one event credited to the shot** (combo per §1.3 — neutral for a Wild shot; +1 for a normal shot), never as a cascade. Any insertion whose settle window overlaps a junction merge likewise resolves as the shot's match, not a cascade. Deferral is skipped while Backwards suspends attraction (§1.2). **All-Wild auto-pop:** a remaining line consisting entirely of Wilds pops itself (it could never self-match) — **whole line only**; a lone all-Wild *segment* is left alone, since attraction links it to any neighbor. | Wild power-up; Call of the Wild enchantment (every 10th loaded orb). |

---

## 4. Power-ups (field-drop roster)

All power-ups are beneficial (none must be dodged). Full roster of 15:

| Power-up | Effect |
|---|---|
| **Purple Fire** | Loads one Purple Flame orb (§3) at the front of the Slinger queue. |
| **Wild** | Loads one Wild Orb (§3, merged-run resolution) at the front of the Slinger queue. |
| **Backwards** | Hard velocity override: the whole line rolls backward at **−4 orbs/s** for **4 s**, applied to every segment uniformly so ordering is preserved. Pulls swallowed orbs back out of the Abyss (§1.6). |
| **Slow** | Line speed **×0.4** for **6 s** — a partial slow, never a full stop. |
| **Firebolts x3** | Loads three one-shot Firebolt orbs (single-orb destroyers) at the front of the Slinger queue (§2.2). |
| **Flight of the Butterflies** | *(tunable `butterflyCount` = 6)* butterflies emerge from the Abyss and fly **backward along the path** toward the spawn point (the visible span's start) at *(tunable `butterflySpeed`)* orbs/s, launch-staggered *(tunable `critterStagger`)*. Each butterfly silently destroys the **first orb it meets** outside the Abyss (§4) and is consumed by it; one that reaches the spawn point unspent despawns. "Meets" is literal: an orb that surfaces in a butterfly's wake (e.g. pulled back out of the Abyss by an attraction the sweep itself opened) was never met by it and is left to butterflies still above — no retroactive kills behind the sweep. **The effect ends when every butterfly is consumed or reaches the spawn point** — its timed-effect registry entry (§1.6 drain deferral) lives exactly that long, no fixed duration. **Outside the Abyss only:** swallowed orbs are overflown harmlessly — §1.6's rescue list stays closed. **Multi-path levels:** the `butterflyCount` flights are dealt round-robin across the level's paths — each butterfly emerges from its own path's Abyss and sweeps that path only; the total stays `butterflyCount`, so the power-up's strength does not scale with path count. |
| **Fire Spinner** | Ring of *(tunable `spinnerPellets` = 12)* fireballs emitted 360° around the Slinger at *(tunable `pelletSpeed`)* orbs/s; each fireball destroys the **first** orb it touches (silent one-orb destruction, §4) and is consumed. Pellets are effects, not shots (mechanic shared with Spark Shot): they cannot collect power-up icons, don't hold §1.1 settle checks, and cannot touch orbs inside the Abyss (§1.6). Also auto-triggered by the Rune Fire enchantment (§5). |
| **Colour Splash** | Recolors all orbs within **2.8 orbs** *(tunable `splashRadius`)* of the impact point to the **fired orb's color** — a pure recolor: destroys nothing, never shoves the line or changes its speed, and the projectile vanishes on impact. Indirect pops only, via gap attraction (§1.1). Sets up big matches, especially across close path sections. |
| **Colour Wipe** | Removes **all orbs of one color** from the entire board, including inside the Abyss (§1.6). The wiped color comes from the collecting shot (icon color rule: §1.4). Graceful no-op if the color is absent (reachable: the collecting orb's color can vanish from the board while the shot is in flight). |
| **Fireflies** | Recolors scattered orbs to match neighbors, creating matchable groups (destroys nothing). **Selection rule:** up to *(tunable `fireflyCount` = 4)* orbs that sit **linked** beside a different-colored, non-Wild neighbor are picked at random (seeded rng, without replacement); each firefly homes to its orb over *(tunable `fireflyTravel`)* s and recolors it to that neighbor's color — scattered pair-making, never a uniform area. Indirect pops only, via gap attraction (§1.1). Board-wide: swallowed orbs are legal targets (§1.6). Registry-timed. |
| **Frost Ray** | Armed type: loads a Frost Ray charge at the queue front (§2.2/§3). Firing releases an **instant piercing beam** along the aim instead of a projectile. The beam **widens as it travels**: local width = *(tunable `frostBaseWidth` = 3 orbs)* + *(tunable `frostWidthGain` = 0.05)* × distance from the muzzle (in orbs) — ≈ **4 orbs** wide after one screen width (1280 px ≈ 21.3 orbs), no cap. Destroys ALL orbs whose center lies within **half the local beam width** of the beam line, from the muzzle outward — **including orbs inside the Abyss** where the beam overlaps it (§1.6). Hit orbs are grouped into contiguous runs; each is destroyed silently (§4). |
| **Orb of Decay** | Armed type: loads a Decay charge (§2.2/§3). On impact the projectile destroys the hit orb **plus up to** *(tunable `decaySpread` = 6)* **orbs on each side**, within the hit orb's contiguous stretch — **never across a gap** — as **one** silent destruction event (§4). May consume orbs just inside the Abyss when the impact lands at the brink (§1.6 blast-overlap rule). Index-based and stretch-bounded — distinct from Purple Flame's radius blast, which crosses path bends and gaps. |
| **Wrath of the Stars** | *(tunable `starCount` = 8)* shooting stars rain from above the field, each homing on a random (seeded rng) orb outside the Abyss, staggered by `critterStagger` and falling for *(tunable `starFall`)* s. Each landing blasts a *(tunable `starRadius` = 0.5 orbs)* radius: every orb inside it is destroyed (contiguous runs destroyed silently, §4), reaching inside the Abyss only via radius overlap (§1.6). Registry-timed (defers the drain). |
| **Spark Shot** | Armed type: loads a Spark charge (§2.2/§3). Firing releases a fan of *(tunable `sparkPellets` = 7)* pellets spread across *(tunable `sparkSpread` = 0.55)* rad centered on the aim — same pellet rules as Fire Spinner (first orb touched destroyed silently, §4; no icon collection, no reach inside the Abyss). |
| **Rune Reward** | Instantly lights **one rune** — one pip of the 12-pip ring (§1.5): `ceil(runeTarget / 12)` orbs of progress, capped at the target. The **only** power-up whose collection fills the ring; it can seal the circle, and newly lit pips count toward Rune Fire (§5). Rarest weight (6): direct objective progress. |

**Armed / instant split (canonical):** Purple Fire, Wild, Firebolts x3, Colour Splash,
Frost Ray, Orb of Decay, and Spark Shot load as queue charges (§2.2 — they need an aim
or an impact point); Slow, Backwards, Colour Wipe, Flight of the Butterflies, Fire
Spinner, Fireflies, Wrath of the Stars, and Rune Reward take effect instantly on
collection.

**Effect-projectile size (canonical):** small effect projectiles — Firebolt shots,
Fire Spinner / Spark Shot pellets, Wrath shooting stars, butterflies, and any similar
future effect — have a **0.5-orb** collision diameter *(tunable `effectProjSize`)*.
`starRadius` deliberately matches it: a star blast is near single-target, destroying
its homed orb and at most an immediate neighbor.

Distinction rules that must be preserved:

- **Colour Splash** (uniform area recolor) ≠ **Fireflies** (scattered pair-making
  recolor) ≠ **Colour Wipe** (whole-board single-color *removal*). Three distinct
  effects.
- **Slow** (temporary power-up) ≠ **Tar** (permanent enchantment slow).
- **Backwards** (temporary power-up) ≠ **Retreat Orders** (enchantment, auto-push-back
  on rune-circle completion).

**Silent destruction rule:** direct power-up and special-orb destruction is **not a
pop**. It never recoils the line (§2.3) and never touches the Combo Counter (§1.3).
Destroyed orbs still add rune progress (§1.5). The only way an effect causes a pop is
**indirect**: a removal or recolor leaves matching gap edges, gap attraction closes them
(§1.2), and the snap-merge pops as an **ordinary cascade** (+1 combo; recoil only when
that increment drops a power-up, §2.3). The **Wild Orb is the sole exception**: its
matches are real, recoiling pops (§1.3/§3).

**Timed-effect registry:** every duration-based effect (Slow, Backwards, Butterflies,
Fireflies, Wrath of the Stars, and any future one) starts through one game-wide
registry; the §1.6 drain gate and the HUD read it generically, so new timed effects join
both without code changes. Instantaneous effects (pellets, beams, wipes) deliberately
don't register.

---

## 5. Enchantments

Permanent passive perks equipped on the Slinger between levels. **16 total; free
selection of any 4 active at once.** Unlocked automatically by completing levels. Once
unlocked they can be swapped any time. There is **no purchase currency** —
meta-progression is level-completion-gated only.

| # | Enchantment | Effect |
|---|---|---|
| 1 | **Sudden Fire** | Every 10th orb loaded into the Slinger is a **Firebolt**. |
| 2 | **Flame Purple** | Every 20th loaded orb is a **Purple Flame** shot. |
| 3 | **Call of the Wild** | Every 10th loaded orb is a **Wild Orb**. |
| 4 | **Horn of Plenty** | Slinger holds **4** orbs instead of 3. |
| 5 | **Eternity Swap** | Swap sends the loaded orb to the **back** of the queue (cycle) instead of swapping the first two. |
| 6 | **Speed Unleashed** | Fired orbs travel faster. |
| 7 | **Power Magnetism** | Dropped power-up icons drift **toward** the Slinger (`runeTowardBias` 0.2 → 0.8). |
| 8 | **Head Start** | Rune Circle starts each level with some runes pre-lit. |
| 9 | **Rune Fire** | **Fire Spinner** auto-triggers after every 6 runes lit — pips of the 12-pip ring (§1.5); Head Start's pre-lit pips don't count, pips lit by Rune Reward do. |
| 10 | **Retreat Orders** | On rune-circle completion, the orb line is pushed backward for a while. |
| 11 | **March of the Furious** | On rune-circle completion, **Flight of the Butterflies** auto-triggers. |
| 12 | **March Blue** | Every **blue**-orb match triggers **Flight of the Butterflies**. |
| 13 | **Orbs Unhatched** | Every **red**-orb match spawns a **Fireflies** effect. |
| 14 | **Red No More** | **Red orbs no longer spawn**, but the orb line moves faster (trade-off). |
| 15 | **Tar** | Orb line moves slower (permanent; stacks multiplicatively per §2.3). |
| 16 | **Tranquility** | Game is easier but levels take longer (slower pace / lower spawn intensity). |

- Modifier stacking follows the three-tier policy in §2.3 (multiplicative slow-stack /
  Backwards override / additive recoil).
- **Cadence precedence** when multiple enchantment cadences collide on one loaded orb:
  Flame Purple wins the slot; with both Sudden Fire and Call of the Wild equipped,
  their shared cadence slot **alternates** between them.
- A "red/blue-orb match" is any shot or cascade pop whose run contains a ruby/sapphire
  orb (Wilds count as neither).
- Cadence counters tick at orb *generation* time, so overflow-reserve reuse slows
  cadence arrival in wall-clock terms (accepted).

---

## 6. Game mode

### 6.1 Story Mode

The main campaign: a sequence of levels called **"days"** (don't hard-code the count),
framed by a dark-fantasy narrative about reuniting **five enchanted keys** scattered
across the lands. Keys are **narrative collectibles only** — not currency. Progression
on a **World Map** with occasional branch choices that **reconverge** (no missable
content). Enchantments unlock progressively as levels are completed (§5).

---

## 7. Presentation

Look-and-feel **direction, not a spec**. The goal is to capture the mood of the
original *Sparkle 2* — not to copy it. Exact colors, timings, layer recipes, animation
curves, and asset details are free implementation choices. Only two things in this
section are binding: the **flash-safety constraints in §7.6**, and gameplay rules
restated here for context (the gameplay section always governs).

The target feeling is **ancient fantasy ritual — calm, heavy, satisfying**. Orbs are
carved stone spheres with gold inlay: opaque, polished, closer to billiard balls than
to anything soft. The two failure modes to steer away from: orbs reading as **bubbles**
(translucent, floaty, poppy) or **candy** (glossy, squishy, crackable), and the game
reading as a frenetic arcade light show.

### 7.1 Orb look

- Opaque lit stone: a dark rim, one small tight specular highlight, an engraved
  medallion on the face, and a gold inlay band. Base colors are §2.1 exactly, never
  lightened toward pastel.
- Orbs **roll** as they travel (surface detail rotating with distance) and cast contact
  shadows — a line of orbs should read as pressed-together solids.
- Glow shades are emissive accents only (pop VFX, special-orb pulse, power-up icons),
  never a base fill.
- Avoid anything that produces the bubble/candy read: translucency, rim-light halos,
  iridescence, outline strokes, pastel bases, flat cel shading.

### 7.2 Motion feel

- A segment moves as a **rigid block** with constant orb spacing — no per-orb stagger,
  ripple, jiggle, squash-and-stretch, bobbing, or idle wobble.
- Shoves and collapse snaps feel weighty and abrupt: arrive at speed, stop clean, at
  most one slight bounded overshoot of the block as a whole.

### 7.3 Pop VFX

- A pop is a **dissolution, not an explosion**: the engraving glows, the body brightens
  briefly, then disperses into rising glowing motes. Nothing shatters or falls — no
  debris, shards, confetti, or star sprites.
- Combos escalate ritual detail (an extra ground ring, more gold in the motes, a longer
  afterimage) — never brightness, screen area, or speed.
- Silent destruction (§4) uses a reduced version of the same dissolve.

### 7.4 Audio

- The core collision sound is a **dry ceramic click** — pool balls, mahjong tiles:
  sharp attack, short clean decay, slight per-hit pitch variation, louder and brighter
  with impact speed. Collapse snaps play a quick descending cluster of clicks; pops add
  a stone crack with a short crystalline shimmer; combos step the shimmer up a scale.
- The music bed is ambient and low-key (soft strings, flutes, distant wordless choir
  over nature sounds). It never pushes the player — no rising combat music, no failure
  sting.
- Avoid bubble pops, water bloops, cartoon boings, xylophone chimes, and any soft, wet,
  or springy impact sound.

### 7.5 Slinger

- An ornate, rooted artifact: a dark stone plinth with a faintly lit rune ring (the
  Rune Circle display, §1.5) and a metal cradle holding the loaded orb. The plinth
  stays fixed; the cradle and ammo queue rotate with the aim.
- The ammo queue (§2.2) is drawn **in a line along the aim axis**: loaded orb frontmost
  and largest, preview orbs receding in size behind it. Receding size is the queue
  cue — no HUD ammo panel, numbers, or slots. Special orbs show their effect on the
  orb itself (flames, droplets, shimmer), not as a badge or text.
- Firing gives a small cosmetic recoil of the cradle-and-queue assembly. This is visual
  only — distinct from the gameplay recoil kick on the orb line (§2.3) — and the aim
  vector used for firing stays exact and instantaneous (§2.2); any rotational smoothing
  of the sprite is cosmetic.
- Out of ammo is shown by the visibly empty cradle and a dimmed rune ring — no text.

### 7.6 Pace, mood & flash safety

Mood and pace direction:

- Backgrounds are **painterly, dim, and essentially static** — mossy standing stones,
  foggy swamp water, root-tangled ruins; deep greens, wet browns, slate blues. The
  Abyss reads as a carved stone maw; the World Map as hand-drawn parchment. The orbs
  are the brightest objects on screen — achieved by darkening the world, never by
  making the orbs glassy.
- Tension is **slow encroachment — dread, not panic**: the player should see failure
  coming well in advance (the §2.3 danger crawl and §1.6 grace period protect this).
  No timers, countdown UI, hurry-up prompts, or surprise mid-level difficulty spikes.
- The core payoff is the **collapse** — the line clacking back together — and it is
  primarily auditory and tactile. When a moment needs more impact, add sound, not
  light.
- Level clear is a mild flourish, not a fanfare; there is no score, so nothing tallies.
- No arcade grammar: score/combo popups, "COMBO!" typography, announcer voice, speed
  lines, confetti, neon palettes, aggressive percussion stings.

**Flash safety — binding, not guidance:**

- No fullscreen flashes; every effect is localized and bounded around its origin.
- No screen shake, strobing, rapid color cycling, or fast camera moves; the camera is
  static.
- At most **3 luminance transitions per second** anywhere on screen (WCAG 2.3.1
  general flash threshold), and no single transition covering more than **10%** of the
  viewport.
- Effect edges fade softly (≥ **80 ms** in and out); when several bright effects
  resolve near-simultaneously, stagger and attenuate their peaks rather than letting
  them overlap at full intensity.
- A **Reduced Flashing** accessibility toggle reduces bloom, rings, and glow. It
  changes appearance only — gameplay, timing, and hitboxes are untouched.
