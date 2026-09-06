# Cubetris → App Store: recon, audit, and phased plan

Plan only. No implementation code. Every claim about the current game below is grounded in
the code on this branch (`src/main.js`, `src/music.js`, `src/themes.js`, `index.html`) unless
explicitly marked as an estimate.

---

## Phase 0 — Recon inventory

### 0.1 Stack, build, entry points

| Item | Fact |
|---|---|
| Live game | Vanilla ES-module JavaScript + Three.js 0.183, built with Vite 7. No TypeScript, no lint, no tests. |
| Entry | `index.html` (556 lines: all CSS + all HUD DOM) → `src/main.js` (2,408 lines, one file, module-scope `let` state). |
| Other modules | `src/music.js` (228 lines, `MusicEngine`, four synthesized stems + beat grid), `src/themes.js` (76 lines, 4 themes). |
| Run | `npm run dev` / `npm run build` → `dist/` = 536 kB JS (138 kB gzip), 99% of it Three.js. Builds clean. |
| Assets | Zero. All audio is synthesized with Web Audio; all visuals are Three.js primitives; fonts are system. |
| Persistence | `localStorage` keys `cubetris-best`, `cubetris-stats`, `cubetris-badges`, `cubetris-daily-<date>`, `cubetris-tutorial-seen`. |
| Branches | `claude/cubetris-viral-appstore-YwBc7` and `claude/cubetris-appstore-refactor-j2vnul` are the same commit (`b867999`). This plan lives on the latter. |

Three other codebases live in the repo and none of them is the game you can play:

- `Assets/Scripts/*.cs` — 13 Unity C# files. No `.unity` scene, no prefab, no `.meta` files. `STEAM_RELEASE_ROADMAP.md` marks every phase "NOT STARTED". The README, `PROJECT_STRUCTURE.md`, `QUICK_START.md`, `UNITY_SETUP_GUIDE.md`, `IMPLEMENTATION_SUMMARY.md`, `FUTURE_FEATURES.md` all describe this non-existent Unity game (physics stacking, 20 levels, obstacles, enemies, 3 lives).
- `Assets/Godot/` — a GDScript port of the Unity architecture (autoload singletons, lives, level-complete, enemies). Different design from the live game.
- `godot/` — a single-file GDScript port (1,571 lines) of an older snapshot of `main.js`. It predates Zone, Hold, the 3-deep queue, music, themes, daily, badges, danger/clutch.

### 0.2 The core loop as it exists in code

**Board.** `GRID_COLS = 7`, `GRID_ROWS = 12`. `grid[col][row]`; row 0 is nearest the player (spawn side), row 11 is the far wall. Camera at `z = -6`, spawn cube at `z = -1`, board spans `z = 0..11`.

**Inputs** (`window.addEventListener('keydown')`, touch handlers near the bottom of `main.js`):

| Action | Keyboard | Touch |
|---|---|---|
| Move lane | A/D, ←/→ (`currentCol ± 1`) | horizontal drag, 40 px per lane (`DRAG_COL_PX`) |
| Shoot (animated flight) | Space → `shoot()` | tap, or swipe up |
| Quick drop (instant placement) | W/S, ↑/↓ → `quickDrop()` | swipe down |
| Hold/swap | E → `holdSwap()` | tap hold box |
| Zone | Q → `activateZone()` | tap zone bar |
| Pause / retry | Esc / R, Enter | pause button / Play Again |

**Shot.** `shoot()` spawns a mesh at the spawn point moving at `SHOOT_SPEED = 15` units/s; `updateShooting()` advances it until `landingRow(col)` (first empty cell in front of the nearest occupied cell). Full corridor = 12 units = **0.8 s of flight, during which all input is locked** (`if (shootingCube) return`). `quickDrop()` places instantly with no lock. Both paths then call `placeCube → startSquash → playLandSound → resolveMatches → addScore/registerCleanHit → checkGameOver`.

**Matching.** `resolveMatches()` loops until stable: rainbow cubes clear themselves + 4 orthogonal neighbours; `findMatchGroup()` flood-fills 4-connected same-colour groups, ≥3 removed; bombs adjacent to any removed cell detonate 3×3 (chained up to 10 iterations); a row whose 7 cells are all removed in one step counts as a "row clear" (+200). Each loop pass is one `chainStep`; `applyGravity()` compacts every column toward the far wall (row 11) by **teleporting meshes** (`mesh.position.z = rowToZ(writeRow)`), so the whole cascade resolves in a single frame.

**Scoring** (`addScore`): `cleared × 10 × max(1, chainStep)` + `rowClears × 200`, where `cleared` is the total across all steps and `chainStep` is the final step count. The popups spawned inside `resolveMatches` show `count × 10 × chainStep` per step. **The two disagree**: a 3+3 two-step chain pops "+30" then "+60" but awards 120. Plus clutch +150, groove `streak × 10` from streak 2, zone `15 × cubes cleared in zone`.

**Wall.** `advanceWall()` fires every `getWallInterval()` seconds: if any cube sits in row 0 → game over; otherwise every cube shifts one row toward the player (tweened over ~330 ms by `updateWallAnims`) and a new row of 7 random cubes (`randomWallColorIndex`, not bag-dealt) slides in at row 11. `resolveMatches()` runs on the new row and **the player is awarded score and level progress for matches the wall made by itself**. The timer is invisible except for a red border flash in the last 3 s (`#wall-warning`).

**Difficulty curve** (`getWallInterval`, `getActiveColorCount`, `randomColorIndex`, `checkLevelUp`):

| Level | Wall interval | Incoming cubes/s | Colours | Specials |
|---|---|---|---|---|
| 1 | 12.0 s | 0.58 | 3 | – |
| 2–3 | 11.2 / 10.4 s | 0.63 / 0.67 | 4 | – |
| 4–5 | 9.6 / 8.8 s | 0.73 / 0.80 | 5 | rainbow 5% |
| 6 | 8.0 s | 0.88 | 5 | + bomb 4% |
| 8 | 6.4 s | 1.09 | 5 | |
| 10 | 4.8 s | 1.46 | 5 | |
| 12 | 3.2 s | 2.19 | 5 | |
| 13 | 2.4 s | 2.92 | 5 | |
| 14+ | 2.0 s (floor) | 3.50 | 5 | |

Level = `floor(totalCleared / 10) + 1`. Linear ramp, hard floor at level 14. Each level-up sets `wallAdvanceTimer = -4` (a 4 s breather) and rotates the theme every 3 levels. The board starts **empty**: nothing arrives until 12 s in, and the 2-per-colour bag (`drawColorFromBag`) means a first match usually needs 4–6 shots.

**Fail state.** `checkGameOver()` / `advanceWall()`: any cube occupying row 0. Placement runs `resolveMatches` before `checkGameOver`, so a placement at row 0 that clears survives (a clutch is possible).

**Extra systems layered on top:** Zone (`zoneCharge` 5/clear to 100, 8 s at 15% time scale, wall paused, music low-passed), danger (`isInDanger`: any cube in rows 1–2 → vignette, heartbeat on beat, music intensity 0.55), clutch (clear out of danger → +150, 0.7 s slow-mo), groove streak, 8 badges, lifetime stats, daily seeded RNG (`mulberry32(hashString('cubetris-' + todayKey()))`), 3-deep next queue, hold.

### 0.3 What is already good and should be protected

- **The mechanic is distinct.** Shoot-away-from-you + gravity-toward-the-wall + an advancing wall is not Tetris and not Puzzle Bobble. Cascades are set up by clearing *near* groups so *far* groups fall together. That is a real skill axis.
- **The wall is a good antagonist.** A rhythmic, physical threat that also feeds you material. `advanceWall` + `pushWallAnim` + `playWallPushSound` is the right idea.
- **Zero-asset audio pipeline.** `MusicEngine` (intensity-driven stems, beat grid, `nextGridTime` quantization, `onBeat` heartbeat) and the "organic debris" SFX family are genuinely above average and cost nothing to ship or localize. Keep the architecture; retune the mix.
- **Debris particles** (`spawnParticles`/`updateParticles`: power-law sizes, bounce damping, settle + friction, fade instead of shrink). The look is right; only the allocation pattern is wrong.
- **The daily seed** is already correct in principle (date-keyed PRNG, swappable `rng`).
- **Landing squash, wall tween, hit-freeze, camera lerp** are the right primitives with roughly right timings (200 ms squash, 330 ms wall tween, 80–100 ms freeze).
- **Bag dealing, next ×3, hold** make the game feel fair.

### 0.4 Dead code, half-finished features, and refactor hazards

1. **Three dead ports** (`Assets/`, `Assets/Godot/`, `godot/`) and **seven docs** describing the Unity game. They will mislead anyone (including you) about what the game is.
2. **`quickDrop` dominates `shoot`.** Same result, no 0.8 s lock. The comment in `registerCleanHit` says groove "rewards precision over quick-drop spam" but both paths call it. Two verbs, one strictly better.
3. **Cascades are invisible.** The `while (changed)` loop in `resolveMatches` resolves every chain step in one frame and `applyGravity` teleports. A ×4 chain reads as one big explosion; the chain counter only ever shows the final step.
4. **Score/popup mismatch** (see 0.2).
5. **Wall self-matches award score and level.** With 3 colours, roughly 45% of incoming rows contain a horizontal triple (estimate: 1 − (8/9)^5), so level 1 explodes by itself.
6. **Banner pile-up.** `#level-up`, `#row-clear`, `#zone-banner`, `#chain-counter`, `#clutch-banner` are independent elements at 28–48% from the top. The iPhone render shows four at once.
7. **`#daily-indicator` is always visible** — `#hud span { display:block }` (specificity 1,0,1) beats `#daily-indicator { display:none }` (1,0,0).
8. **Haptics do nothing on iOS.** `navigator.vibrate` is unsupported in Safari/WKWebView.
9. **No lifecycle handling.** No `visibilitychange`, no auto-pause. `MusicEngine._schedule` uses a 30 ms `setInterval`; after backgrounding, `nextStepTime` is seconds behind and the catch-up loop fires a burst of past notes on resume. `audioCtx` is created at module load (suspended on iOS until the first gesture — handled by `ensureAudio`, but there is no interruption recovery).
10. **No safe-area handling.** All HUD is absolute pixels from `top: 20px` despite `viewport-fit=cover`. Four controls are strung along the top right at 20/90/160/210 px.
11. **Keyboard hints on touch** (`#column-indicator`, tutorial `<kbd>`s).
12. **`renderer.shadowMap.enabled = true` with PCFSoft** but no light casts and no mesh casts/receives; dead config.
13. **`THREE.Clock` is deprecated** (console warning on load) — trivial.
14. **Refactor hazard:** ~60 module-scope `let`s read and written from ~80 functions. `restartGame()` resets them by hand (and has a "nuclear cleanup" that deletes every `BoxGeometry` mesh in the group). Any state-save feature written against this shape will drift. This is the reason for the module split in Phase 3, not aesthetics.

### 0.5 Performance characteristics (read from code; not measured on iOS)

- **Draw calls:** ≤84 grid cubes + spawn + ghost + ~50 `THREE.Line` objects for the grid (each line is its own draw call) + ground + lane highlight ≈ 140 baseline. Every cleared cube spawns 14–21 particle meshes (`baseCount × (1 + intensity × 0.5)`), each with its **own `BoxGeometry` and `MeshLambertMaterial`** (GPU buffer upload + shader uniform set per particle), plus ~0.6 trail meshes per frame during flight. A 10-cube chain = 150–200 geometry allocations and disposals in the same frame that also triggers hit-freeze, shake, flash and DOM popups. That is the hitch moment.
- **Per-frame CPU:** `updateSpecialCubeVisuals` walks all 84 cells; `updateGhost` and `isInDanger` re-scan; `resolveMatches` runs `findMatchGroup` from every occupied cell (allocating a `Set` and string keys per flood) — fine at this grid size.
- **GPU:** `setPixelRatio(min(dpr, 2))` + MSAA → ~1.3 MP on a 390×844 phone. Lambert shading, no post-processing. Comfortable for iPhone-class GPUs.
- **DOM:** score popups are DOM nodes with CSS animation; `pos.project(camera)` per popup. Fine.
- **Verdict:** 60 fps is realistic on an iPhone SE 2 after pooling/instancing particles and merging the grid lines into one `LineSegments`. I have not measured it; Phase 4 includes the measurement gate.

### 0.6 Can it reach iOS?

| Path | State in repo | Cost to first TestFlight | Verdict |
|---|---|---|---|
| **Capacitor + WKWebView** wrapping the Vite build | Nothing yet, but the game is already touch-aware and asset-free | ~12 h (shell, lifecycle, haptics, audio session, privacy manifest) | **Recommended.** One codebase, incremental, the web build stays playable at every step. |
| Godot native (`godot/`) | Snapshot missing ~1,500 lines of current features | 2–4 days to reach parity, then every future change is done twice | Better native feel, but it is the rewrite you said not to do. |
| Unity (`Assets/`) | No scene, no prefabs | Everything | Dead. Delete. |

WKWebView risks to spike early: Web Audio behaviour under the silent switch and interruptions, RAF pinned at 60 Hz (no 120 Hz), App Review guideline 4.2 "minimum functionality" for wrapped web content. Mitigations are in the iOS section.

---

## Gate 1 — IP and naming audit

**Bottom line: the concept ships safely. The name does not.** Change the name, scrub the metadata, and there is nothing else here that a rights holder can plausibly enforce.

### What is legally risky

- **"Cubetris".** The Tetris Company (TTC) owns the TETRIS word mark and has a long record of enforcing against `-tris`-suffixed block-puzzle names on the App Store. The 2008 removal of "Tris" from the App Store after a TTC complaint is the on-point precedent: Apple pulled it without litigation. A game named Cubetris in the puzzle category is a textbook likelihood-of-confusion case (similar mark, identical goods/services). Expect either an App Review rejection under guideline 5.2 or a takedown after launch. **Blocking. Rename.**
- **Store metadata.** Any use of "Tetris" in the title, subtitle, keywords, description or screenshots ("Tetris meets match-3") is the same exposure. Zero mentions.
- **Paper trail (minor).** Commit messages and code comments say "Tetris-inspired", "like Tetris's 7-bag", "the classic Tetris banking mechanic". If the repo is public, scrub the comments during the Phase 3 split. Not a legal problem on its own, but it is evidence of intent to trade on the mark if it ever mattered.

### What is safe

- **Game rules.** Not copyrightable in the US. *Tetris Holding v. Xio Interactive* (D.N.J. 2012) protected Tetris's *expression*: the 10×20 well, the seven tetromino shapes and their colours, the ghost piece, the next-piece preview, the garbage lines, together as a look-and-feel. This game has **no tetrominoes, no rotation, no 10×20 well, no fill-a-line clear**. It is a colour flood-fill match with gravity and an advancing wall, closer in lineage to Puzzle Bobble and Collapse than to Tetris. Overlap with the Xio list: a landing ghost, a next queue, a hold slot. Those three are generic across the whole genre (Puyo Puyo, Lumines, Columns all use them) and, combined with a different board and no piece shapes, do not add up to trade dress.
- **Palette.** Five hues red/green/blue/yellow/magenta with per-theme tints. Not the seven-colour tetromino scheme. Safe, and Phase 4 changes it anyway.
- **"Zone".** A Tetris Effect feature name and behaviour (time-stop, cleared lines bank). Behaviour is a rule (safe); the name "Zone" as an in-game label is low risk but easily avoided. Phase 2 proposes cutting the feature regardless.

### Minimum set of changes to be defensible

1. New name (below), applied to the app, bundle ID, localStorage keys, `index.html` title, `package.json`.
2. No "Tetris" in any store field or screenshot.
3. Rename "Zone" if kept. Scrub comments.

That is all. Nothing about the board, rules or presentation needs to change for IP reasons.

### Five candidate names

| Name | Why | Risk to check |
|---|---|---|
| **Tesserae** (recommended) | Latin for the small coloured cubes that form a mosaic. Says "coloured cubes forming patterns" without saying it. Real word, no `-tris`. | "Tessera" is a live mark in class 9 for a semiconductor company (Xperi). Different channel, same class; a trademark search must confirm no games/software use. |
| **Hueshot** | Coined. Describes the verb. Short, App Store-searchable. | Probably clear; confirm no existing app. |
| **Backwall** | Coined-ish. The wall is the antagonist. | Generic word pair; check apps and marks. |
| **Pushback** | The wall pushes back. Punchy. | Common word; likely crowded in class 9 and 41. |
| **Cubecast** | Casting cubes down the corridor. | Check for podcast-tool collisions ("-cast"). |

**Availability check (about 90 minutes total):**
1. App Store: search exact name and the name + "game" on an iPhone (results differ from the Mac App Store). Also check the name isn't reserved in App Store Connect when you create the record.
2. USPTO Trademark Search (the TESS replacement): word search, live marks, classes 009 and 041. EUIPO eSearch plus: same. Look for identical and phonetically similar marks in games/software.
3. Domain: `<name>.app` or `<name>game.com`. The `.app` TLD is cheap and forces HTTPS.
4. Google and Steam search for `"<name>" game` to catch unregistered prior use.
5. Social handles are optional at this scale.

---

## The untouchable core (please confirm)

After reading the code, this is what I consider **the game** and will not change in any phase:

1. A 7-lane, 12-deep 3D corridor. You shoot cubes *away* from you; they stop at the far wall or behind the nearest cube; the stack grows toward you.
2. 4-connected same-colour groups of 3+ clear. Gravity pulls toward the far wall. Cascades are chain steps with rising multipliers.
3. The wall: on a timer, a row of 7 cubes enters at the far end and shoves everything one row toward you. A cube in your row kills you.
4. Colour count ramps 3 → 4 → 5 with level. Next ×3 and hold.
5. Rainbow (cross-clear on landing) and bomb (adjacency-triggered 3×3).
6. 3D perspective presentation with physical debris, and synthesized, intensity-layered music.

**Not core in my reading** (and I propose changing or cutting each): the 0.8 s input lock during flight, quick-drop as a separate verb, the exact camera, the Zone power-up, the groove streak, badges, four themes, the tutorial screen.

Where I disagree with your framing: you described `-tris` piece-shape and line-clear exposure. That does not apply here; the game is not a Tetris variant and that is a strength. The branch name says "viral"; this is a niche score-attack game and the plan treats it as one. The direction in `suggestments.md` (more modes, more specials, more meta) is the wrong direction; this plan removes systems.

---

## Design — Addictive

### The first 10 seconds (proposed opening sequence)

Today: a text tutorial with keyboard glyphs, then 12 seconds of shooting into an empty corridor with nothing to match (bag dealing guarantees no third of a colour until draw 7).

Proposed:

| t | What the player sees | What they do | Code hook |
|---|---|---|---|
| 0.0 s | Board immediately, no menu. Three seeded rows sit at the far end. Spawn cube breathes at the bottom. Score "0" top-centre. Nothing else. | Look. | `initGrid` seeds rows 9–11 via a new `seedOpeningRows(rng)`. |
| 0–2.5 s | If untouched for 2.5 s, a single finger-drag glyph fades in over the board. | Touch anywhere on the board. | New pointer handler. |
| touch | The cube snaps to the lane under the finger; a solid ghost in the cube's colour shows the landing cell; the lane floor lights. | Slide left/right. | Raycast to floor plane → lane. Replaces `DRAG_COL_PX` accumulation. |
| release | Cube launches (≤300 ms flight), thuds, squashes, light haptic. | | `SHOOT_SPEED` 15 → 40; `updateShooting`. |
| shot 1 or 2 | Three cubes pop. Debris, +30, medium haptic, drums enter the mix. | | Seeding guarantees the first two queued colours each have a 2-group with an open lane in front. |
| ~6 s | The wall timer bar, frozen until now, starts draining (10 s). | Keep shooting. | `wallAdvanceTimer` starts on first shot, not on load. |
| ~16 s | First wall advance: rumble, shake, warning haptic, the far slab visibly creeps in. | Learns the threat by feeling it. | `advanceWall` + a continuous 1 s approach of the wall slab before the row lands. |

No tutorial screen. Hold and specials are discovered later (the hold slot pulses once at level 2; the first rainbow arrives at level 4 with a one-word tag on the spawn cube).

### Session shape

- **Run length target:** median 2–3 minutes; novice death at level 2–3 (60–100 s), regular at 6–8 (3–4 min), expert at 12–14 (6–8 min). The curve below is tuned for that; the current curve produces the same shape but with a dead first 15 s and a hard floor that makes expert runs 8–10 min, which is too long for a phone.
- **Restart in ≤3 s:** death → 700 ms freeze-frame with the killing cube outlined and the wall glowing (readability) → recap slides up (score, best, level, best chain, one-line reason: "The wall reached lane 3" or "Lane 5 overfilled") → any tap on the board after 500 ms restarts; the button is for the recap, the board is for retry. Today: overlay, button, keyboard hint.
- **Why the loss is theirs:** three changes make every death attributable. (1) Wall rows are generated with no horizontal triples, so every clear on the board is the player's and every pile-up is theirs. (2) The wall timer is always visible as a thin bar along the far edge, plus the slab physically approaches over the last second; nobody dies to a hidden timer. (3) The danger rows (0–2) tint the floor, ramping with the timer. The existing danger vignette and heartbeat stay.

### Difficulty curve (numbers)

Replace the linear formula with a geometric one and move the colour steps:

`T(level) = max(2.5, 10 × 0.90^(level−1))` seconds between wall advances.

| Level | T | Cubes/s in | Colours | Specials | Clears to next | What the player feels |
|---|---|---|---|---|---|---|
| 1 | 10.0 | 0.70 | 3 | – | 6 | First level-up inside ~30 s. Easy, matches everywhere. |
| 2 | 9.0 | 0.78 | 3 | – | 10 | Rhythm. |
| 3 | 8.1 | 0.86 | **4** | – | 10 | **First hard step**: match probability drops, bag is 8 deep. |
| 4 | 7.3 | 0.96 | 4 | rainbow 5% | 10 | Rainbow reads as relief. |
| 5 | 6.6 | 1.06 | 4 | | 10 | |
| 6 | 5.9 | 1.19 | **5** | | 10 | **Second hard step.** |
| 7 | 5.3 | 1.32 | 5 | bomb 4% | 10 | |
| 8–11 | 4.8 → 3.5 | 1.5 → 2.0 | 5 | | 10 | **Plateau.** A competent player clears about as fast as the wall feeds. Survival = hold discipline and not wasting rainbows. |
| 12–13 | 3.1 / 2.8 | 2.3 / 2.5 | 5 | | 10 | **Mastery zone.** Single 3-clears (≈1 per 1.5 s ≈ 2 cubes/s) no longer keep up; only cascades of 6–10 cubes do. Chains stop being flourish and become the survival mechanic. |
| 14+ | 2.5 (floor) | 2.8 | 5 | | 10 | Reachable by experts, not a wall of death. |

Keep the level-up breather but at 3 s. Keep specials' odds. The bag stays; it is what makes the curve fair.

### Game feel / juice (implementable numbers)

| Element | Now | Proposed |
|---|---|---|
| Touch → lane snap | 40 px drag accumulation | raycast to floor; ≤1 frame after `pointermove`; total budget <50 ms including WKWebView's ~20 ms |
| Shot flight | 15 u/s, 0.8 s, input locked | 40 u/s (300 ms full corridor, ~100 ms near); one queued shot allowed during flight; quick-drop verb removed |
| Landing | 200 ms squash (`t += dt × 5`), thud immediate | keep; add light impact haptic |
| Match | instant removal | 60 ms white flash on the group, then burst; medium haptic |
| Cascade | all steps same frame, gravity teleports | **sequence steps 180 ms apart; gravity tween 120 ms ease-in**; chain counter increments per step (this is the biggest single feel change in the plan) |
| Hit-stop | 80 ms (chain/big), 100 ms (row) | 60 ms on ≥5 cubes, 90 ms on chain ≥3, never during flight |
| Screen shake | random per frame, up to 0.25 u + chain × 0.06 | 14 Hz noise, amplitude 0.05 (3-clear) / 0.10 (5+) / 0.18 (chain ≥3 or row), 150–300 ms, capped 0.18 in portrait |
| Wall advance | 330 ms tween, rumble, 0.08 shake | keep; add 1 s slab approach before, 120 ms anticipation dip, warning haptic |
| Banners | 5 independent elements overlapping | one announcer slot with a queue; max 900 ms each; level-up pre-empts |
| Haptics | `navigator.vibrate` (dead on iOS) | Capacitor Haptics: `selection` lane change, `impact light` land, `impact medium` clear, `impact heavy` chain ≥3 / row clear, `notification warning` wall, `notification error` death, `notification success` level-up. Custom Core Haptics pattern for the wall rumble is a Phase 8 nicety. |
| Audio layering | SFX straight to destination, no master, clear pops quantized to 8ths (up to 288 ms late at 104 bpm) | master → {music bus, sfx bus}; sfx ducks music −3 dB for 120 ms on clears; land thud immediate; pops quantized to **16ths** (≤144 ms, mean 72 ms); chain tones stay quantized (they are the "instrument" moment); mute/volume setting |

### One meta-progression hook: the Daily

**Choose: the Daily Challenge with a per-day Game Center leaderboard and a shareable result.** Unlimited retries on today's seed; your best counts.

Why this and not the alternatives:

- **Daily seed** is already 70% built (`mulberry32`, `todayKey`, swappable `rng`), works offline, gives a reason to return *tomorrow* rather than a compulsion to return *now*, and creates the only share moment this game can have ("Top 8% today, ×5 chain"). Retries on the same board are also the purest skill test the mechanic offers.
- **Streaks**: loss-aversion mechanic. Cheap to add, corrosive to the "not embarrassing" bar. Rejected; flagged below.
- **Unlockable cosmetics**: needs art you don't have, and a shop. The four themes already exist as level rewards; leave them there.
- **All-time leaderboard**: dominated within a week by a handful of players and by anyone who edits a plist. Demotivating for everyone else. A *daily* board resets the field every 24 h and keeps ranks meaningful; keep an all-time board only as a secondary tab.

**Friction / dark-pattern flags for you to decide:** the Daily itself is a soft daily pull (I think acceptable). No push notifications in v1; if ever, ask only after the third completed daily. No streak counter. No "continue?" purchases. No ads.

---

## Design — Beautiful

### Three directions

**A. Ceramic on paper (recommended).** Matte, slightly rounded cubes with soft contact shadows on a warm off-white ground. Light theme by default. References: *Threes!*, *Monument Valley*'s material restraint, *Mini Metro*'s typographic HUD. Achievable entirely with `RoundedBoxGeometry` (three/examples), `MeshStandardMaterial` at roughness 0.9, a gradient contact-shadow plane, and system typography. Distinct from every neon-on-black puzzle game on the store. Matches the "organic debris" audio direction the commits have been moving toward.

**B. Neon corridor (current).** Dark ground, glowing cubes, grid lines, bloom. Genre-standard; reads as an asset-flip in screenshots no matter how good the game is. Bloom post-processing costs frame budget in WKWebView.

**C. Blueprint.** Navy ground, cyan wire edges, cubes as tinted glass with edge lines (the `EdgesGeometry` ghost already does this). Cheap, high-contrast, cold. Good for a trailer; tiring to play for 5 minutes.

**Recommendation: A.** It is the one direction where the lack of an artist is invisible, it photographs well in store screenshots, and it reads on a 4.7" screen because the eye is not fighting glow.

### The system

**Palette**

| Role | Hex |
|---|---|
| Ground (paper) | `#F3EEE6` |
| Board floor | `#E7E0D5` |
| Lane alternate | `#EDE6DA` |
| Grid/edge line | `#D6CDBF` |
| Danger floor tint | `#F2B8A6` at 0–60% by timer |
| Wall slab | `#2B2A28` |
| Text primary | `#2B2A28` |
| Text muted | `#8A8479` |
| Cube 1 Coral | `#F25F5C` |
| Cube 2 Teal | `#2EC4B6` |
| Cube 3 Cobalt | `#3A6FF2` |
| Cube 4 Amber | `#FFB020` |
| Cube 5 Orchid | `#B564E3` |
| Rainbow | animated hue, white base |
| Bomb | `#2B2A28` body, `#F25F5C` fuse glyph |

Coral/teal/cobalt/amber/orchid were picked for deuteranopia separation (no red-vs-green pair). Amber vs coral is still close for protanopes, so **every colour also carries an engraved face glyph** (dot, ring, cross, bar, diamond) from one canvas-generated texture atlas. That is the accessibility story, and it costs one texture.

Themes reduce to three tints of the same system: *Dawn* (above), *Dusk* (ground `#2A2734`, floor `#343047`, cubes lifted 8% in luminance), *Slate* (`#DDE3E8` / `#CFD6DC`). Theme changes at levels 4 and 8 stay as the level reward.

**Type.** HUD: `ui-rounded, system-ui` (SF Pro Rounded on iOS, zero assets), `font-variant-numeric: tabular-nums` on every number so the score doesn't jitter. Sizes: score 28, announcer 40 (single line, 700 weight, tracking +2%), captions 13. No text-shadow glow anywhere.

**Spacing.** 4-pt scale: 4/8/12/16/24/32/48. HUD inset = `max(16px, env(safe-area-inset-*))`.

**Motion.** Enter 200 ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; exit 150 ms `cubic-bezier(0.4, 0, 1, 1)`; squash/pop use the existing sine spring. Durations: 120 (micro), 200 (element), 320 (wall), 900 max (announcer). One thing animates at a time in the announcer slot.

**How the board reads at a glance on a small screen.**
1. Camera reframed for portrait so all 7 lanes and 12 rows are on screen (Phase 1; the current framing clips the near rows and the spawn cube fills the bottom third).
2. Lanes as alternating floor tints, the active lane 12% brighter. Replace the 3%-alpha `columnHighlight` plane.
3. Ghost = solid 45% cube in the shot colour, not a white wireframe.
4. Rows 0–2 tinted; tint intensity ramps with the wall timer.
5. Far wall is a solid slab that visibly approaches; the timer bar runs along its base.
6. HUD is three things: score top-centre, next ×3 top-right, hold top-left. Pause is a small glyph under the safe area. Level and best appear only in the announcer and the recap.

---

## iOS shipping requirements

- **Targets.** iPhone-only at launch, iOS 16+, portrait locked. Minimum device iPhone SE (2nd gen, A13, 4.7"); mainline iPhone 12–16. iPad later (same layout letterboxed is acceptable but not at v1).
- **Frame rate.** 60 fps locked (WKWebView RAF does not deliver 120). Pass criterion: p95 frame time < 16.7 ms during a 10-cube chain on the SE 2; p99 < 25 ms. Verification: a dev-flag frame-time histogram overlay drawn from `performance.now()` deltas, checked on-device via Safari Web Inspector, plus Xcode Instruments Core Animation FPS on the wrapper. Low-power mode: if p95 > 20 ms for 3 s, halve particle count and disable trails at runtime.
- **Safe areas / reachability.** `viewport-fit=cover` is already set; add `env(safe-area-inset-*)` to every HUD inset. All play input is "anywhere on the board", so one-handed reachability is automatic; the only buttons (pause, share) are rare and live at the top. Dynamic Island: nothing within the top inset.
- **Haptics.** `@capacitor/haptics` covers the table above. Custom AHAP patterns via a 50-line Swift plugin are optional polish.
- **Audio session.** Web Audio inside WKWebView follows the ambient category: it obeys the silent switch and mixes with the Music app. Decision: obey the silent switch (puzzle-game convention; haptics still work). Handle `appStateChange` → `audioCtx.suspend()` and a new `MusicEngine.resync()` that resets `nextStepTime = now + 0.1` (fixes the note-burst bug); on resume, `audioCtx.resume()` then `resync()`. Handle the `interrupted` state after a phone call the same way.
- **Lifecycle / state.** On `appStateChange: inactive` → auto-pause, `saveRun()`; on launch → offer Continue if a run exists. Snapshot = 84 colour indices + queue + hold + score + level + `totalClearedCount` + wall timer + `rng` state (`mulberry32`'s single uint32) + daily flag. Store with `@capacitor/preferences`, not raw `localStorage` (WKWebView can evict it). Snapshot on every wall advance and on background.
- **Offline-first.** Everything above runs offline. Game Center submissions queue locally and flush when reachable; the recap shows local best when there is no rank.
- **App Review pitfalls.** 4.2 minimum functionality (web wrappers): mitigated by native haptics, Game Center, offline operation, no remote content, no browser chrome. 2.5.2: all code bundled, nothing downloaded. 5.1.1 privacy: collect nothing → "Data Not Collected" nutrition label; `PrivacyInfo.xcprivacy` declaring UserDefaults (reason CA92.1) because Preferences uses it. No ads at v1 → no ATT prompt. Age rating 4+ (a "bomb" cube is fine). IAP (Phase 7): 3.1.1 compliant via StoreKit, with Restore Purchases visible.
- **Store listing.** Icon: one ceramic cube on paper, no text, no gradient background. Screenshots: 6.9" and 6.5" sets, 4 images, each a real capture with a 5-word caption ("Shoot. Match. Chain.", "The wall is coming.", "One board a day. Everyone.", "No ads. Ever."). Subtitle (30 chars): "Match-3 cube shooter". Keywords (100 chars): `puzzle,match 3,cubes,blocks,arcade,color,chain,combo,daily,offline,brain,casual`. No "tetris". ASO reality: title and subtitle carry most weight; keyword field is a long-tail lottery; the first 20 ratings matter more than either. Expect 0–20 organic installs/day from search alone.

---

## Monetization reality check

Assumptions: unknown indie, no marketing budget, a decent launch post on r/iosgaming and TouchArcade, a 15-second GIF that reads instantly. Apple Small Business Program: 15% cut. These are estimates, not data.

| Model | Year-1 downloads (realistic) | Conversion | Net per convert | Year-1 revenue |
|---|---|---|---|---|
| Paid $1.99 | 200–500 | 100% | $1.69 | **$340–850** |
| Free + interstitial ads | 3,000–8,000 → 50–200 DAU | eCPM ≈ $4 blended | ~$2/day at 200 DAU | $150–700, plus an SDK, ATT, and a cheaper product |
| Free + cosmetic IAP | 3,000–8,000 | 1–2% | $2.54 | $75–400 |
| Free + tip jar | 3,000–8,000 | 0.5–1% | $2.54 | $40–200 |
| **Free daily + $2.99 unlock for endless** | 3,000–8,000 | 3–6% of players who hit the gate (~40%) | $2.54 | **$90–490** |

**Honest answer:** the median outcome for any of these is roughly the fee, not clearly above it, and none of them pays for 90 hours. The plan targets the upper third of outcomes, which does clear $99 with margin, and the thing that decides which third you land in is not in the codebase: the GIF, the launch post, and whether the daily result gets shared.

**Recommendation: free download; Daily Challenge fully free with unlimited retries; Endless is a one-time $2.99 unlock after three free endless runs. No ads, ever, stated on the listing.** The free daily is the shareable, retention-bearing piece; the gate is honest (you have played the full game three times before it asks), and there is no interrupt at a peak moment. The gate is still friction — flagged for your decision. Paid-up-front at $1.99 is the runner-up if you want zero IAP surface; it halves the App Review and privacy work and probably costs you two-thirds of your players.

What would have to change for this to be comfortably profitable: a daily share format people actually post (emoji grid of the run), a launch that gets one press mention, and a second platform (Android via the same Capacitor shell, ~8 h) to double the top of the funnel.

---

## Phased plan

Ordered by impact ÷ effort. Effort assumes an experienced dev new to this codebase. The web build stays playable after every phase; the iOS shell arrives in Phase 5 and every later phase ships to TestFlight.

### Phase 0 — One game in the repo (2 h)
- Delete `Assets/`, `godot/`, and the seven Unity/Steam docs. Move `suggestments.md` to `docs/` as history. Rewrite `README.md` in 30 lines about the real game.
- Fix the `#daily-indicator` specificity bug and the `THREE.Clock` deprecation.
- **Exit:** `npm run build` green; a stranger opening the repo sees one game.
- **Playable:** unchanged.

### Phase 1 — A phone game (12 h)
- **Prototype first (2 h, go/no-go):** portrait camera. Fit-width FOV from aspect ratio, higher pitch, so 7×12 fits a 390×844 screen with a 12% margin. If the 3D corridor cannot be made readable this way, fall back to a steeper near-top-down camera with the same 3D cubes.
- Pointer input: raycast-to-lane on `pointerdown`/`pointermove`, release to fire, drag below the board to cancel. Keyboard stays for desktop. Remove `quickDrop` as a verb. `SHOOT_SPEED` 15 → 40; allow one buffered shot during flight.
- HUD relayout with safe-area insets; delete `#column-indicator`, the tutorial overlay, the `HOLD [E]`/`ZONE [Q]` labels.
- Visible wall timer bar + slab approach.
- Files: `src/main.js` (camera block, `shoot`, `updateShooting`, touch handlers, `updateSpawnCube`), `index.html` (CSS, DOM).
- **Exit:** on an iPhone in Safari, the whole board is visible in portrait, one thumb plays the entire game, no keyboard text anywhere.

### Phase 2 — Fun in the first minute, fair at the end (12 h)
- Opening seed rows with a guaranteed reachable match for the first two queued colours.
- Wall rows generated with no horizontal triples (`randomWallColorIndex` → `generateWallRow(rng)`).
- New curve: `T = max(2.5, 10 × 0.9^(L−1))`, colours 3/3/4/4/4/5, level 1 needs 6 clears, breather 3 s.
- Sequenced cascades: `resolveMatches` becomes a step generator; the loop in `animate` advances one step per 180 ms; `applyGravity` returns moves that `updateFallAnims` tweens over 120 ms. Chain counter increments per step.
- Score = per-step sum (fixes the popup mismatch). 60 ms match flash.
- Death readability: freeze-frame + outline + reason line; tap-board-to-retry.
- Single announcer queue replaces the five banners.
- Feature-flag off: Zone, groove streak, badges (code stays behind `FEATURES` until you confirm the cut).
- Files: `src/main.js` (`resolveMatches`, `applyGravity`, `advanceWall`, `checkLevelUp`, `getWallInterval`, `getActiveColorCount`, `triggerGameOver`, `restartGame`, banner functions), `index.html`.
- **Exit:** a first-time player gets a clear within 3 shots; a ×3 chain is visibly three events; median test-run length ≥ 90 s; retry is one tap.

### Phase 3 — Make it safe to change (8 h)
- Mechanical extraction, not a rewrite: `src/game/state.js` (one `state` object + `serialize/deserialize`), `src/game/rules.js` (pure: `landingRow`, `findMatchGroup`, `resolveStep`, `gravityMoves`, `generateWallRow`, `seedOpeningRows`, curve functions), `src/render/*` (scene, cubes, particles, camera), `src/audio/sfx.js` + `music.js` with a bus graph, `src/ui/hud.js`, `src/input.js`, `src/persistence.js`. `main.js` becomes the loop.
- Vitest on `rules.js` only: flood-fill, gravity, wall-row generator, curve table, seed guarantees, daily determinism. ~25 tests.
- Scrub "Tetris" from comments while touching them.
- **Exit:** tests green; `serialize()` → `deserialize()` round-trips a mid-run board; game plays identically (record a 60 s daily-seed input script before, replay after).

### Phase 4 — The look, and the frame budget (14 h)
- `RoundedBoxGeometry`, `MeshStandardMaterial` roughness 0.9, contact-shadow plane, paper palette, three tint themes, glyph texture atlas, solid ghost, lane tints, danger floor, slab wall.
- `InstancedMesh` for grid cubes (84) and a pooled particle `InstancedMesh` (cap 240); merge grid lines into one `LineSegments`; drop `shadowMap`.
- HUD typography per the system; remove all glows.
- **Exit:** before/after screenshots; p95 frame time < 12 ms in Safari on the SE 2 during a 10-cube chain (the measurement overlay ships behind a flag).

### Phase 5 — iOS shell (12 h)
- Capacitor 6 project, iOS target 16, portrait lock, splash + icon, status bar hidden.
- Plugins: Haptics, App (lifecycle), Preferences, Share, ScreenOrientation.
- Lifecycle: auto-pause, `saveRun`, audio suspend/resume/`resync`, interruption recovery. Silent-switch decision implemented.
- `PrivacyInfo.xcprivacy`, Info.plist, signing, first TestFlight.
- **Spike first (2 h):** Web Audio behaviour in WKWebView on device (silent switch, call interruption, background/foreground) before building on it.
- **Exit:** TestFlight build survives background/foreground, a phone call, a force-quit mid-run (Continue works), haptics fire per the table, silent switch mutes audio only.

### Phase 6 — The Daily (10 h)
- Daily mode is the default screen state ("Today's board" + "Endless"). Unlimited retries; best of day.
- Game Center: recurring daily leaderboard (App Store Connect supports daily-reset recurring leaderboards) via a thin plugin; all-time board secondary. Queue submissions offline.
- Share sheet: `Tesserae · Sep 6 · 4,820 · ×5 chain · Top 8%` plus a 7×3 emoji sketch of the final board.
- Recap screen shows rank when online, local best when not.
- **Exit:** two devices see each other on today's board; share text arrives in Messages; airplane mode plays fine.

### Phase 7 — Money and the listing (10 h)
- StoreKit via RevenueCat's Capacitor SDK (free tier; receipt validation handled) or `@capacitor-community/in-app-purchases`. One non-consumable. Restore Purchases in settings. The gate after three endless runs, never mid-run.
- Store assets: icon, four screenshots per size, subtitle, keywords, description, review notes ("fully offline; Game Center optional").
- **Exit:** sandbox purchase + restore work; App Store Connect record complete; submitted.

### Phase 8 — QA and polish (6 h)
- Device pass (SE 2, 13, 15 Pro), 30-minute soak with no memory growth, colour-blind check with a simulator, mix pass with headphones and phone speaker, low-power fallback verified.
- **Exit:** zero known crashes; a tester who has never seen it plays three runs unprompted.

**Total: ~86 h of code**, plus ~10 h outside the codebase (name checks, GIF, launch posts, listing copy). Call it 100.

### Cut list (delete or postpone)

Delete now: `Assets/` (Unity + second Godot), `godot/`, `README.md` (rewrite), `PROJECT_STRUCTURE.md`, `QUICK_START.md`, `UNITY_SETUP_GUIDE.md`, `IMPLEMENTATION_SUMMARY.md`, `FUTURE_FEATURES.md`, `STEAM_RELEASE_ROADMAP.md`, `quickDrop`, `#column-indicator`, the tutorial overlay, keyboard labels, `shadowMap`, dynamic FOV, the `zone-active` CSS filter.

Flag off in Phase 2, delete if you agree: **Zone** (a hidden "save me" button that lowers the wall's stakes, needs its own UI on mobile, and is the one Tetris Effect tell in the game), **groove streak** (a second multiplier with its own popup), **badges** (eight toasts with no screen to view them), **lifetime stats** except games/best.

Postpone past v1: iPad layout, Android build, custom Core Haptics patterns, new special cubes, any second mode, push notifications, all-time leaderboard prominence, theme unlocks.

### Risks, unknowns, and what to prototype before committing

1. **Portrait camera (Phase 1, 2 h).** The single biggest unknown. If the corridor cannot fit and still read, the presentation changes more than I would like. Go/no-go before anything else.
2. **Lane-under-finger input vs drag accumulation (Phase 1, 1 h).** Test both on a device. The raycast version is my bet for zero-tutorial play, but a 7-lane board under a thumb needs a lane width of ≥44 pt, which depends on the camera answer.
3. **WKWebView audio (Phase 5, 2 h spike).** Silent switch, interruption, background. If Web Audio is unreliable, the fallback is `@capacitor-community/native-audio` for SFX with the music engine staying in-web; that costs ~6 h.
4. **Frame budget on the SE 2 (Phase 4).** Instancing should fix the chain hitch; if not, the particle cap drops to 120 and trails go.
5. **Game Center from Capacitor (Phase 6).** Plugin maturity is uneven. Fallback: local-only daily with share text still works and still ships.
6. **App Review 4.2 (Phase 7).** A rejection round costs a week; the mitigations are standard and usually sufficient.
7. **Name availability.** Unverified. Ninety minutes of checks before you touch the bundle ID.

### Kill criterion

**Before paying the $99** (after Phases 1–2, ~26 h, using the web build on friends' phones via a URL, no developer account needed): hand it to five people who don't owe you anything and say nothing. If fewer than three start a second run without being asked, or the median session is under 90 seconds, or nobody can explain the wall after three runs, stop. Also stop if the portrait prototype fails and you are unwilling to change the framing; the game cannot be one-handed then, and a two-handed 3D corridor game on a phone will not clear the fee.

**After launch:** if 90 days in you have fewer than 300 downloads and no unsolicited review, do not renew.

### Decisions I need from you

1. Confirm the untouchable core list, or edit it.
2. Cut Zone / groove / badges, or keep any of them.
3. Art direction A (ceramic on paper) vs B or C.
4. Monetization: free daily + $2.99 endless unlock, vs paid $1.99.
5. Name shortlist to check, and whether "Tesserae" is worth the class-9 overlap risk.
