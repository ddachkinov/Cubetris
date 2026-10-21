# Hueshot

> Renamed from "Cubetris" for trademark reasons — see Gate 1 in
> [`docs/APPSTORE_PLAN.md`](docs/APPSTORE_PLAN.md). A USPTO/EUIPO clearance
> search is still outstanding before the bundle ID is registered.

A 3D match-3 cube shooter. You fire coloured cubes down a seven-lane corridor; they
stack against the far wall and grow back toward you. Groups of three or more touching
cubes of the same colour clear, and everything above them falls into the gap — so the
real game is setting up cascades. On a timer, a new row enters at the far end and
shoves the whole board one step closer. When a cube reaches your row, the run is over.

## Run it

```sh
nvm use          # Node 22, from .nvmrc
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run shots    # 9 scene screenshots -> shots/, non-zero exit on any page error
npm run replay   # replay a recorded 60 s daily run, fail unless it ends identically
npm run checks   # scripted gameplay checks on a virtual clock, e.g. an idle board stays put
npm test         # Vitest on src/game/rules.js and the music scheduler
```

`npm run shots` (`scripts/shoot.mjs`) boots Vite, drives the game in headless Chromium
and screenshots nine scenes: opening, aiming, a greedy bot's game, a staged ×2 chain,
level-up, danger, game over, desktop, and banners taking turns after a restart. Pass part of a scene name to run only that
one (`npm run shots -- chain`). It reaches the game through `window.__hs`, a debug hook
that exists only when the page is loaded with `?debug=1`.

`?debug=1` also puts a frame meter in the bottom-left corner: main-thread work per frame
(game update plus `renderer.render`, not the refresh-locked interval), the last 60
frames as bars against a 12 ms budget line, and p95/max over the last 10 s. The same
numbers are on `window.__hsPerf` (`stats()`, `samples()`, `reset()`).

`npm run replay` (`scripts/replay.mjs`) is the refactoring safety net. It runs the game
on a virtual clock (fixed 1/60 s frames, a fixed date, seeded `Math.random`) and feeds it
`scripts/replays/daily-60s.json`: 60 s of daily-seed play recorded from a bot as plain
DOM events (keys, taps, clicks) at exact frame numbers. The run must end on the recorded
score, level, grid and hand, or the script fails and names the first 5 s checkpoint
where the two runs diverge. It then replays a second time with a `serialize()` →
`restore()` of the run halfway through, which must not change the outcome either.
`npm run replay -- --record` re-records the script, for when the gameplay is *meant* to
change.

`npm test` covers the music scheduler (no notes while paused, no burst on resume) and
the pure rules: flood fill, removal, gravity, the curve table,
the bag, wall rows, the opening-seed guarantee and daily determinism, including a
property test that a freshly advanced wall never hands the player a match.

`npm run checks` (`scripts/checks.mjs`) plays scripted situations through the real
build on the same virtual clock as the replay (`scripts/vclock.mjs`) and fails unless
each ends the way the rules say: an idle board, left alone after one shot, must not
score or level up before the wall reaches the front; a wall that comes due while
a shot is in flight waits for it to land; a level-up holds the wall off for a 3 s
breather on top of the next interval; and two runs of the same Daily that time
their shots differently still get the same hand and the same wall rows; a run is saved
at every wall advance (only while nothing is in flight) and a reload offers Continue and
puts back exactly the run that was left; and hiding the page suspends the audio and
pauses the run, and showing it again plays no burst of missed notes. Pass part of a check's name to run only
that one. A cascade starting while another is still resolving logs a console error,
which fails every harness.

The look is "ceramic on paper" from `docs/APPSTORE_PLAN.md`: matte rounded cubes on a
warm paper board, in three tints that change with the level. Every colour carries a
face glyph (dot, ring, cross, bar, diamond; a star on the rainbow, a fuse on the bomb),
on the cubes and in the hold and next chips, so no colour has to be told apart by hue.

No assets, no backend, no account. All audio is synthesized with Web Audio at runtime
and all visuals are Three.js primitives, so the whole game is the JavaScript bundle.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD markup, all CSS |
| `src/main.js` | Game flow (shooting, cascades, the wall, levels, game over, restart) and the frame loop |
| `src/game/rules.js` | Pure rules: landing, flood-fill matching, removal sets, gravity, wall rows, opening seeds, the bag, the seeded RNG and the difficulty curves |
| `src/game/rules.test.js` | Vitest suite for `rules.js` (`npm test`) |
| `src/game/state.js` | The one `state` object a run is made of, `serialize`/`deserialize` (version 2, both Daily streams) and `isBusy` |
| `src/render/` | Three.js: `scene.js` (renderer, lights, static board), `camera.js` (fit to any aspect, shake), `cubes.js` (every cube drawn by one `InstancedMesh`; aim visuals, cube tweens), `particles.js` (debris and shot trail, one pooled `InstancedMesh` of 240), `palette.js` (the paper palette and its three tints, Dawn/Dusk/Slate), `glyphs.js` (the face glyph per colour, as a texture atlas and as SVG), `perf.js` (the `?debug=1` frame meter) |
| `src/audio/sfx.js` | The `AudioContext`, the bus graph (master with mute, music bus ducked -3 dB on clears, sfx bus), suspend/resume on visibility, and every synthesized sound effect |
| `src/audio/music.js` | `MusicEngine` — four synthesized stems driven by gameplay intensity, plus a beat grid used to quantize sound effects; `pause`/`resume`/`resync` keep it from bursting after a stall |
| `src/ui/hud.js` | The DOM overlay: score line, previews, wall timer, banners, popups, flash, pause and game-over screens, first-run hint |
| `src/ui/haptics.js` | Vibration |
| `src/input.js` | Keyboard, pointer aiming and the HUD buttons |
| `src/persistence.js` | Everything that outlives a run, behind a small storage-backend interface (localStorage on the web), read into memory once at boot |
| `src/themes.js` | Per-theme music key; each theme maps to a paper tint in `render/palette.js` (its own environment and cube colours are no longer drawn) |
| `scripts/shoot.mjs` | Screenshot harness behind `npm run shots` |
| `scripts/replay.mjs` | Input record/replay harness behind `npm run replay`; the recording is in `scripts/replays/` |
| `scripts/checks.mjs` | Scripted gameplay checks behind `npm run checks` |
| `scripts/vclock.mjs` | The virtual clock and page driver `replay.mjs` and `checks.mjs` share |
| `scripts/bot.mjs` | The greedy bot and seeded `Math.random` both harnesses use |
| `docs/APPSTORE_PLAN.md` | Recon, IP audit, design spec and the phased plan to ship on iOS |
| `docs/DESIGN_AUDIT_2026-02.md` | Earlier design audit, kept for history |

Progress is stored in `localStorage` (`hueshot-best`, `-stats`, `-daily-<date>`,
`-hint-seen`, `-muted`, and `-run`, the run in progress; see `src/persistence.js`).
Clear those keys to reset.

## Controls

Touch is the target platform: drag to pick a lane, release to fire. On desktop,
A/D or ←/→ move, Space fires, E holds, Esc pauses, M mutes.

## Status

Shipping to iOS as a Capacitor app. The plan, its phases and the kill criterion live
in `docs/APPSTORE_PLAN.md`. Earlier Unity and Godot ports were never playable and have
been removed; this repository is the game.
