# Cubetris

> **Working title.** The name is being retired for trademark reasons before release —
> see Gate 1 in [`docs/APPSTORE_PLAN.md`](docs/APPSTORE_PLAN.md).

A 3D match-3 cube shooter. You fire coloured cubes down a seven-lane corridor; they
stack against the far wall and grow back toward you. Groups of three or more touching
cubes of the same colour clear, and everything above them falls into the gap — so the
real game is setting up cascades. On a timer, a new row enters at the far end and
shoves the whole board one step closer. When a cube reaches your row, the run is over.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

No assets, no backend, no account. All audio is synthesized with Web Audio at runtime
and all visuals are Three.js primitives, so the whole game is the JavaScript bundle.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD markup, all CSS |
| `src/main.js` | Game loop, board state, rules, rendering, input, SFX |
| `src/music.js` | `MusicEngine` — four synthesized stems driven by gameplay intensity, plus a beat grid used to quantize sound effects |
| `src/themes.js` | Per-theme environment palette, cube palette and music key |
| `docs/APPSTORE_PLAN.md` | Recon, IP audit, design spec and the phased plan to ship on iOS |
| `docs/DESIGN_AUDIT_2026-02.md` | Earlier design audit, kept for history |

Progress is stored in `localStorage` (`cubetris-best`, `-stats`, `-badges`,
`-daily-<date>`). Clear those keys to reset.

## Controls

Touch is the target platform: drag to pick a lane, release to fire. On desktop,
A/D or ←/→ move, Space fires, E holds, Esc pauses.

## Status

Shipping to iOS as a Capacitor app. The plan, its phases and the kill criterion live
in `docs/APPSTORE_PLAN.md`. Earlier Unity and Godot ports were never playable and have
been removed; this repository is the game.
