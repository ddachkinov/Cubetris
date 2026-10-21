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
npm run shots    # 10 scene screenshots -> shots/, non-zero exit on any page error
npm run replay   # replay a recorded 60 s daily run, fail unless it ends identically
npm run checks   # scripted gameplay checks on a virtual clock, e.g. an idle board stays put
npm run perf     # frame work during a staged 11-cube chain, 4x CPU throttle; fails over 12 ms p95
npm test         # Vitest on the rules, the Daily's share line and the music scheduler
```

`npm run shots` (`scripts/shoot.mjs`) boots Vite, drives the game in headless Chromium
and screenshots ten scenes: the front door, opening, aiming, a greedy bot's game, a staged ×2 chain,
level-up, danger, game over, desktop, and banners taking turns after a restart. Pass part of a scene name to run only that
one (`npm run shots -- chain`). It reaches the game through `window.__hs`, a debug hook
that exists only when the page is loaded with `?debug=1`. A scene whose page stops
responding for 90 s is retried once in a fresh browser: headless Chromium here now and
then loses the reply to a font lookup and the page waits forever (see the comment at the
top of `shoot.mjs`); a real hang in the game stalls the retry too and fails.

`?debug=1` also puts a frame meter in the bottom-left corner: main-thread work per frame
(game update plus `renderer.render`, not the refresh-locked interval), the last 60
frames as bars against a 12 ms budget line, and p95/max over the last 10 s. The same
numbers are on `window.__hsPerf` (`stats()`, `samples()`, `reset()`). `npm run perf`
(`scripts/perf.mjs`) measures the same thing headless: six staged 11-cube ×2 chains on a
1440×900 page with the CPU throttled 4× through DevTools' protocol. "LOW" on the meter
means the frame-budget fallback has engaged (below).

### Frame budget on a phone

**The fallback.** A phone that keeps dropping frames gets lighter effects for the rest
of the session: half the debris per clear, a pool of 120 instead of 240, and no shot
trail (`src/render/budget.js`). It engages when the p95 of the interval between frames,
over the last second, stays above 20 ms for 3 s, which is the plan's rule. It goes by
the interval, not the work, because a frame the GPU is late with is dropped all the same.
A chain's hitch passes, and so does a gap longer than 250 ms (a hidden page). iOS Low
Power Mode runs pages at 30 fps, so it trips there after about 3 s, by design.
`?lowpower=1` starts in low power and `?lowpower=0` never enters it; `npm run shots` and
`npm run perf` pin it off.

**Measuring on the iPhone.** `__hsPerf.bench()` plays the `npm run perf` chain on the
page itself and returns work and frame-interval p50/p95/p99/max, per chain and overall.
It holds the fallback off while it runs and reports whether it would have engaged. The
pass line (`docs/APPSTORE_PLAN.md`) is interval p95 under 16.7 ms and p99 under 25 ms on
an iPhone SE 2, and work p95 under 12 ms.

- *Safari, from the dev server:* `npm run dev -- --host`, then open
  `http://<your-mac>:5173/?debug=1` on the phone. On the Mac, Safari → Develop →
  *the iPhone* → the page, and in the console: `await __hsPerf.bench()`.
- *Inside the iOS shell:* a debug build's web view shows up in the same Develop menu.
  There is no address bar, so turn debug on from the console with
  `localStorage.setItem('hueshot-debug', '1'); location.reload()`, then run
  `await __hsPerf.bench()`. `localStorage.removeItem('hueshot-debug')` turns it off.

`bench({ chains: 10 })` runs more chains. Run it once at `?debug=1&lowpower=1` too to see
what the fallback buys.

`npm run replay` (`scripts/replay.mjs`) is the refactoring safety net. It runs the game
on a virtual clock (fixed 1/60 s frames, a fixed date, seeded `Math.random` and
`crypto.getRandomValues`) and feeds it
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
pauses the run, and showing it again plays no burst of missed notes; and the app opens
on the front door, Today's board takes unlimited tries and keeps the best, the best is
shared as a line and a sketch, and Home goes back to the door; and a run of slow frames
switches to low power only once it has lasted 3 s. Pass part of a check's name to run only
that one. A cascade starting while another is still resolving logs a console error,
which fails every harness.

The look is "ceramic on paper" from `docs/APPSTORE_PLAN.md`: matte rounded cubes on a
warm paper board, in three tints that change with the level. Every colour carries a
face glyph (dot, ring, cross, bar, diamond; a star on the rainbow, a fuse on the bomb),
on the cubes and in the hold and next chips, so no colour has to be told apart by hue.

## The Daily

The app opens on the front door: **Today's board**, the same seeded board for everyone
that day, or **Endless**. (A run left in progress is offered back first, under
"Welcome back".) The Daily takes unlimited tries and the best one counts; the door and
the game-over screen show the day's best, and Share sends it as one line and a sketch of
the three rows the run ended on:

```
Hueshot · Oct 21 · 4,820 · ×5 chain
⬜⬜🟦⬜⬜⬜⬜
⬜🟥🟦⬜🟨⬜⬜
🟩🟥🟪🟥🟨🟦⬛
```

to the share sheet in the iOS shell, Web Share in a browser that has it, or the
clipboard. Home (on the pause and game-over screens) goes back to the door and drops
the run. Game Center ranks are not in yet (Phase 6); without them the day's best is
local.

No assets, no backend, no account. All audio is synthesized with Web Audio at runtime
and all visuals are Three.js primitives, so the whole game is the JavaScript bundle.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD markup, all CSS |
| `src/main.js` | Game flow (shooting, cascades, the wall, levels, game over, restart) and the frame loop |
| `src/game/rules.js` | Pure rules: landing, flood-fill matching, removal sets, gravity, wall rows, opening seeds, the bag, the seeded RNG and the difficulty curves |
| `src/game/rules.test.js`, `daily.test.js` | Vitest suites for `rules.js` and `daily.js` (`npm test`) |
| `src/game/daily.js` | The Daily's result: the day's best, the board sketch, and the share line |
| `src/game/state.js` | The one `state` object a run is made of, `serialize`/`deserialize` (version 2, both Daily streams) and `isBusy` |
| `src/render/` | Three.js: `scene.js` (renderer, lights, static board), `camera.js` (fit to any aspect, shake), `cubes.js` (every cube drawn by one `InstancedMesh`; aim visuals, cube tweens), `particles.js` (debris and shot trail, one pooled `InstancedMesh` of 240), `palette.js` (the paper palette and its three tints, Dawn/Dusk/Slate), `glyphs.js` (the face glyph per colour, as a texture atlas and as SVG), `perf.js` (the `?debug=1` frame meter and the on-device bench), `budget.js` (the frame-budget fallback) |
| `src/audio/sfx.js` | The `AudioContext`, the bus graph (master with mute, music bus ducked -3 dB on clears, sfx bus), suspend/resume on visibility, and every synthesized sound effect |
| `src/audio/music.js` | `MusicEngine` — four synthesized stems driven by gameplay intensity, plus a beat grid used to quantize sound effects; `pause`/`resume`/`resync` keep it from bursting after a stall |
| `src/ui/hud.js` | The DOM overlay: score line, previews, wall timer, banners, popups, flash, the front door, pause and game-over screens, first-run hint |
| `src/platform/` | The native seam: haptics, storage backend, lifecycle and share, each with a browser fallback |
| `src/input.js` | Keyboard, pointer aiming and the HUD buttons |
| `src/persistence.js` | Everything that outlives a run, behind a small storage-backend interface (localStorage on the web), read into memory once at boot |
| `src/themes.js` | The four themes, each a paper tint (`render/palette.js`) and a music key and tempo |
| `src/debug.js` | The debug flag: `?debug=1`, or `hueshot-debug` in localStorage inside the shell |
| `capacitor.config.ts`, `ios/` | The Capacitor iOS project (see iOS shell) |
| `scripts/shoot.mjs` | Screenshot harness behind `npm run shots` |
| `scripts/replay.mjs` | Input record/replay harness behind `npm run replay`; the recording is in `scripts/replays/` |
| `scripts/checks.mjs` | Scripted gameplay checks behind `npm run checks` |
| `scripts/perf.mjs` | Frame-budget measurement behind `npm run perf` |
| `scripts/vclock.mjs` | The virtual clock and page driver `replay.mjs` and `checks.mjs` share |
| `scripts/bot.mjs` | The greedy bot, and the seeded `Math.random` and `crypto.getRandomValues` (where an Endless run gets its seed) the harnesses use |
| `docs/APPSTORE_PLAN.md` | Recon, IP audit, design spec and the phased plan to ship on iOS |
| `docs/DESIGN_AUDIT_2026-02.md` | Earlier design audit, kept for history |

Progress is stored in `localStorage` (`hueshot-best`, `-stats`, `-daily-<date>` (the
day's best run),
`-hint-seen`, `-muted`, and `-run`, the run in progress; see `src/persistence.js`).
Clear those keys to reset.

## iOS shell

The App Store build is the same web build wrapped by [Capacitor](https://capacitorjs.com)
8 (`capacitor.config.ts`, `ios/`): iPhone only, iOS 16+, portrait, status bar hidden,
with the Haptics, App, Preferences, Share and ScreenOrientation plugins and a
`PrivacyInfo.xcprivacy` (UserDefaults, reason CA92.1; nothing collected, no tracking).

```sh
npm run ios      # vite build && cap sync ios, then open ios/App/App.xcodeproj in Xcode
```

The game reaches native code only through `src/platform/`: `haptics.js` (the haptic
table, Taptic Engine in the shell and `navigator.vibrate` in a browser), `storage.js`
(the persistence backend on Preferences/UserDefaults), `lifecycle.js` (app inactive and
active, the portrait lock), `share.js` (share sheet, Web Share or clipboard). Plugins are
loaded with dynamic `import()` behind a `window.Capacitor` check, so a browser never
fetches them. `.github/workflows/ios.yml` builds an unsigned archive on a macOS runner
on every push that touches the app; signing and TestFlight happen on a Mac with the
team's certificates.

## Controls

Touch is the target platform: drag to pick a lane, release to fire. On desktop,
A/D or ←/→ move, Space fires, E holds, Esc pauses, M mutes.

## Status

Shipping to iOS as a Capacitor app. The plan, its phases and the kill criterion live
in `docs/APPSTORE_PLAN.md`. Earlier Unity and Godot ports were never playable and have
been removed; this repository is the game.
