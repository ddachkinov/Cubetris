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
npm run shots    # 8 scene screenshots -> shots/, non-zero exit on any page error
npm run replay   # replay a recorded 60 s daily run, fail unless it ends identically
npm run checks   # scripted gameplay checks on a virtual clock, e.g. an idle board stays put
npm test         # Vitest on src/game/rules.js
```

`npm run shots` (`scripts/shoot.mjs`) boots Vite, drives the game in headless Chromium
and screenshots eight scenes: opening, aiming, a greedy bot's game, a staged ×2 chain,
level-up, danger, game over, and desktop. Pass part of a scene name to run only that
one (`npm run shots -- chain`). It reaches the game through `window.__hs`, a debug hook
that exists only when the page is loaded with `?debug=1`.

`npm run replay` (`scripts/replay.mjs`) is the refactoring safety net. It runs the game
on a virtual clock (fixed 1/60 s frames, a fixed date, seeded `Math.random`) and feeds it
`scripts/replays/daily-60s.json`: 60 s of daily-seed play recorded from a bot as plain
DOM events (keys, taps, clicks) at exact frame numbers. The run must end on the recorded
score, level, grid and hand, or the script fails and names the first 5 s checkpoint
where the two runs diverge. It then replays a second time with a `serialize()` →
`restore()` of the run halfway through, which must not change the outcome either.
`npm run replay -- --record` re-records the script, for when the gameplay is *meant* to
change.

`npm test` covers the pure rules only: flood fill, removal, gravity, the curve table,
the bag, wall rows, the opening-seed guarantee and daily determinism, including a
property test that a freshly advanced wall never hands the player a match.

`npm run checks` (`scripts/checks.mjs`) plays scripted situations through the real
build on the same virtual clock as the replay (`scripts/vclock.mjs`) and fails unless
each ends the way the rules say: an idle board, left alone after one shot, must not
score or level up before the wall reaches the front; a wall that comes due while
a shot is in flight waits for it to land; and two runs of the same Daily that time
their shots differently still get the same hand and the same wall rows. Pass part of a check's name to run only
that one. A cascade starting while another is still resolving logs a console error,
which fails every harness.

No assets, no backend, no account. All audio is synthesized with Web Audio at runtime
and all visuals are Three.js primitives, so the whole game is the JavaScript bundle.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD markup, all CSS |
| `src/main.js` | Game flow (shooting, cascades, the wall, levels, game over, restart) and the frame loop |
| `src/game/rules.js` | Pure rules: landing, flood-fill matching, removal sets, gravity, wall rows, opening seeds, the bag, the seeded RNG and the difficulty curves |
| `src/game/rules.test.js` | Vitest suite for `rules.js` (`npm test`) |
| `src/game/state.js` | The one `state` object a run is made of, and `serialize`/`deserialize` for saving one between shots |
| `src/render/` | Three.js: `scene.js` (renderer, lights, static board), `camera.js` (fit to any aspect, shake), `cubes.js` (cube meshes, aim visuals, cube tweens), `particles.js` (debris, shot trail), `palette.js` (the theme's cube colours) |
| `src/audio/sfx.js` | The `AudioContext` and every synthesized sound effect |
| `src/audio/music.js` | `MusicEngine` — four synthesized stems driven by gameplay intensity, plus a beat grid used to quantize sound effects |
| `src/ui/hud.js` | The DOM overlay: score line, previews, wall timer, banners, popups, flash, pause and game-over screens, first-run hint |
| `src/ui/haptics.js` | Vibration |
| `src/input.js` | Keyboard, pointer aiming and the HUD buttons |
| `src/persistence.js` | Everything in `localStorage` |
| `src/themes.js` | Per-theme environment palette, cube palette and music key |
| `scripts/shoot.mjs` | Screenshot harness behind `npm run shots` |
| `scripts/replay.mjs` | Input record/replay harness behind `npm run replay`; the recording is in `scripts/replays/` |
| `scripts/checks.mjs` | Scripted gameplay checks behind `npm run checks` |
| `scripts/vclock.mjs` | The virtual clock and page driver `replay.mjs` and `checks.mjs` share |
| `scripts/bot.mjs` | The greedy bot and seeded `Math.random` both harnesses use |
| `docs/APPSTORE_PLAN.md` | Recon, IP audit, design spec and the phased plan to ship on iOS |
| `docs/DESIGN_AUDIT_2026-02.md` | Earlier design audit, kept for history |

Progress is stored in `localStorage` (`hueshot-best`, `-stats`, `-daily-<date>`,
`-hint-seen`; see `src/persistence.js`). Clear those keys to reset.

## Controls

Touch is the target platform: drag to pick a lane, release to fire. On desktop,
A/D or ←/→ move, Space fires, E holds, Esc pauses.

## Status

Shipping to iOS as a Capacitor app. The plan, its phases and the kill criterion live
in `docs/APPSTORE_PLAN.md`. Earlier Unity and Godot ports were never playable and have
been removed; this repository is the game.
