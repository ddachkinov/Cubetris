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
```

`npm run shots` (`scripts/shoot.mjs`) boots Vite, drives the game in headless Chromium
and screenshots eight scenes: opening, aiming, a greedy bot's game, a staged ×2 chain,
level-up, danger, game over, and desktop. Pass part of a scene name to run only that
one (`npm run shots -- chain`). It reaches the game through `window.__hs`, a debug hook
that exists only when the page is loaded with `?debug=1`.

No assets, no backend, no account. All audio is synthesized with Web Audio at runtime
and all visuals are Three.js primitives, so the whole game is the JavaScript bundle.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD markup, all CSS |
| `src/main.js` | Game loop, board state, rules, rendering, input, SFX |
| `src/music.js` | `MusicEngine` — four synthesized stems driven by gameplay intensity, plus a beat grid used to quantize sound effects |
| `src/themes.js` | Per-theme environment palette, cube palette and music key |
| `scripts/shoot.mjs` | Screenshot harness behind `npm run shots` |
| `docs/APPSTORE_PLAN.md` | Recon, IP audit, design spec and the phased plan to ship on iOS |
| `docs/DESIGN_AUDIT_2026-02.md` | Earlier design audit, kept for history |

Progress is stored in `localStorage` (`hueshot-best`, `-stats`, `-daily-<date>`,
`-hint-seen`). Clear those keys to reset.

## Controls

Touch is the target platform: drag to pick a lane, release to fire. On desktop,
A/D or ←/→ move, Space fires, E holds, Esc pauses.

## Status

Shipping to iOS as a Capacitor app. The plan, its phases and the kill criterion live
in `docs/APPSTORE_PLAN.md`. Earlier Unity and Godot ports were never playable and have
been removed; this repository is the game.
