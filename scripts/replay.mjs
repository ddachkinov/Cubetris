#!/usr/bin/env node
// Input replay harness: proves a refactor did not change how the game plays.
//
//   npm run replay               replay scripts/replays/daily-60s.json and
//                                require the same final score, grid and hand
//   npm run replay -- --record   re-record it: the greedy bot plays 60 s of
//                                the daily seed on the current build
//
// The page runs on the virtual clock in vclock.mjs: performance.now, Date and
// requestAnimationFrame are replaced before the game loads, and the harness
// steps the game loop one 1/60 s frame at a time. Every input is a DOM event
// (keydown, pointer, click) dispatched at an exact frame number through the
// game's own listeners, so a recording is just a list of (frame, event)
// pairs and replaying it is deterministic: the daily seed drives the bag and
// the wall, the frame count drives every timer, and Math.random (debris,
// shake, sound) is seeded too.
//
// A recording made on one build and replayed on another must end on the
// same score, level, grid and hand; a checkpoint every 5 s narrows down
// where two runs first diverge. The replay then runs a second time with a
// save and load (serialize() -> restore()) halfway through, which must not
// change a thing either.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLS, rankLanes } from './bot.mjs';
import {
  DATE, DEVICE, CHECK_EVERY, openGame, run, snap, look, startHarness,
} from './vclock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'scripts/replays/daily-60s.json');
const RECORD = process.argv.includes('--record');

const FRAMES = 60 * 60; // 60 s at 60 fps
// Taps land at this height, which is on the board in portrait
const TAP_Y = Math.round(DEVICE.viewport.height * 0.6);

// ─── Recording ───────────────────────────────────────────────────────────────
// Screen x of each lane's centre at TAP_Y, found by pressing down across the
// width and reading back the lane the game picked. Done on its own page so
// none of it leaks into the recorded run.
async function calibrateLanes(browser, baseUrl, errors) {
  const { context, page } = await openGame(browser, baseUrl, errors);
  try {
    await run(page, 2, []); // one render, so the camera's world matrix is current
    const hits = await page.evaluate(({ width, y }) => {
      const out = [];
      for (let x = 2; x < width; x += 2) {
        const target = document.elementFromPoint(x, y) || document.body;
        const opts = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true };
        target.dispatchEvent(new PointerEvent('pointerdown', opts));
        out.push([x, window.__hs.cur.col]);
        target.dispatchEvent(new PointerEvent('pointercancel', opts));
      }
      return out;
    }, { width: DEVICE.viewport.width, y: TAP_Y });
    const lanes = [];
    for (let col = 0; col < COLS; col++) {
      const xs = hits.filter(([, c]) => c === col).map(([x]) => x);
      if (!xs.length) throw new Error(`lane ${col} is not reachable by a tap at y=${TAP_Y}`);
      lanes[col] = Math.round((xs[0] + xs[xs.length - 1]) / 2);
    }
    return lanes;
  } finally {
    await context.close();
  }
}

// Small seeded PRNG for the bot's own choices (think time, double taps)
function botRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bot temperament. The seed was picked by trying several: this one plays the
// full minute without topping out, reaches level 6 (rainbows in the bag) and
// sets off chains along the way.
const BOT_SEED = 27;
const THINK_MIN = 8; // frames between shots: THINK_MIN + up to THINK_SPREAD
const THINK_SPREAD = 30;
const SLOPPY = 0.25; // chance a shot goes in any open lane instead of the best one
const IDLE = 0.2; // chance of a few seconds' pause after a shot

// The greedy bot from bot.mjs, playing through real inputs and writing down
// every one. It mixes the input paths on purpose so the replay covers all of
// them: arrow keys, drag-and-release taps, E and the hold box, a buffered
// double-tap now and then, and one pause.
async function record(browser, baseUrl, errors) {
  const laneX = await calibrateLanes(browser, baseUrl, errors);
  const { context, page } = await openGame(browser, baseUrl, errors);
  const rnd = botRandom(BOT_SEED);
  const events = [];
  const checkpoints = [];
  let frame = 0;
  let shots = 0;
  let holds = 0;
  let heldThisShot = false;
  let pauseDone = false;
  let aimed = null;

  async function step(n, evs = []) {
    if (n < 0) throw new Error(`step(${n}) at frame ${frame}`);
    events.push(...evs);
    checkpoints.push(...await run(page, n, evs));
    frame += n;
  }

  try {
    await step(1, [{ f: 0, click: '#daily-btn' }]);
    while (frame < FRAMES) {
      const s = await look(page);
      // Nothing that could run past the last frame: just watch it out
      if (s.gameOver || frame > FRAMES - 10) {
        await step(FRAMES - frame);
        break;
      }
      if (s.busy) {
        await step(1);
        continue;
      }
      if (!pauseDone && frame >= 25 * 60) {
        await step(40, [{ f: frame, key: 'Escape' }]);
        await step(2, [{ f: frame, key: 'Escape' }]);
        pauseDone = true;
        continue;
      }

      let cur = rankLanes(s.grid, s.cur.color, { chains: true });
      // Sloppy now and then, like a person in a hurry: any lane that fits
      if (cur && !aimed && rnd() < SLOPPY) {
        const open = [...Array(COLS).keys()].filter((c) => s.grid[c][0] === null && s.grid[c][3] === null);
        if (open.length) aimed = { col: open[Math.floor(rnd() * open.length)] };
      }
      if (aimed) cur = aimed;
      const alt = rankLanes(s.grid, s.cur.held ?? s.cur.next[0], { chains: true });
      if (!heldThisShot && alt && (!cur || alt.value > cur.value + 200)) {
        await step(3, [holds++ % 2 ? { f: frame, click: '#hold-preview' } : { f: frame, key: 'KeyE' }]);
        heldThisShot = true;
        continue;
      }
      if (!cur) {
        await step(1);
        continue;
      }

      if (shots % 3 === 2) {
        // Thumb down on the lane, release a few frames later
        const at = [laneX[cur.col], TAP_Y];
        await step(4, [{ f: frame, down: at }, { f: frame + 3, up: at }]);
      } else if (s.cur.col !== cur.col) {
        // ArrowLeft moves toward higher lane numbers (the camera looks back up the corridor)
        await step(2, [{ f: frame, key: cur.col > s.cur.col ? 'ArrowLeft' : 'ArrowRight' }]);
        continue;
      } else {
        await step(1, [{ f: frame, key: 'Space' }]);
      }
      shots++;
      heldThisShot = false;
      aimed = null;
      if (rnd() < 0.12) await step(3, [{ f: frame + 2, key: 'Space' }]); // buffered double-tap
      // Look away for a few seconds now and then: the wall gets to stack up,
      // and its pushes and the clean-up after them are where chains come from
      if (rnd() < IDLE) await step(Math.min(FRAMES - frame, 150 + Math.floor(rnd() * 180)));
      await step(Math.min(FRAMES - frame, THINK_MIN + Math.floor(rnd() * THINK_SPREAD)));
    }
    if (frame > FRAMES) throw new Error(`recording overran to frame ${frame}`);
    const final = await snap(page);
    const combos = await page.evaluate(() => window.__replay.combos);
    return { events, checkpoints, final, shots, combos };
  } finally {
    await context.close();
  }
}

// ─── Replay ──────────────────────────────────────────────────────────────────
// With roundtripAt, the run is also saved and loaded back mid-game: at the
// first frame from roundtripAt on with nothing in flight, the board is torn
// down and rebuilt from JSON.parse(JSON.stringify(serialize())). The rest of
// the run must play out exactly as if that never happened.
async function replay(browser, baseUrl, errors, fixture, { roundtripAt = null } = {}) {
  const { context, page } = await openGame(browser, baseUrl, errors, fixture);
  try {
    const checkpoints = [];
    let roundtrip = null;
    let frame = 0;
    while (frame < fixture.frames) {
      let n = Math.min(CHECK_EVERY - (frame % CHECK_EVERY), fixture.frames - frame);
      if (roundtripAt !== null && !roundtrip && frame >= roundtripAt) {
        roundtrip = await page.evaluate(() => {
          if (window.__hs.busy) return null;
          const saved = JSON.stringify(window.__hs.serialize());
          window.__hs.restore(JSON.parse(saved));
          return { frame: window.__replay.frame, same: JSON.stringify(window.__hs.serialize()) === saved };
        });
        if (!roundtrip) n = 1; // busy: try again next frame
      } else if (roundtripAt !== null && !roundtrip) {
        n = Math.min(n, roundtripAt - frame);
      }
      const evs = fixture.events.filter((e) => e.f >= frame && e.f < frame + n);
      checkpoints.push(...await run(page, n, evs));
      frame += n;
    }
    return { checkpoints, final: await snap(page), roundtrip };
  } finally {
    await context.close();
  }
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describe(s) {
  return `frame ${s.frame}: score ${s.score}, level ${s.level}${s.gameOver ? ', game over' : ''}`;
}

function compare(label, expected, actual) {
  const problems = [];
  const diverged = expected.checkpoints.find((c, i) => !same(c, actual.checkpoints[i]));
  if (diverged) {
    const got = actual.checkpoints.find((c) => c.frame === diverged.frame);
    problems.push(`first divergence at checkpoint ${describe(diverged)}`
      + `\n       got ${got ? describe(got) : 'nothing'}`);
  }
  if (!same(expected.final, actual.final)) {
    problems.push(`final state differs\n  expected ${JSON.stringify(expected.final)}\n  got      ${JSON.stringify(actual.final)}`);
  }
  if (problems.length) {
    console.log(`FAIL ${label}`);
    for (const p of problems) console.log(`  ${p}`);
    return false;
  }
  console.log(`ok   ${label}  (${describe(actual.final)})`);
  return true;
}

function formatFixture(fixture) {
  // One event / checkpoint per line keeps the file diffable
  const lines = (list) => `[\n${list.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`;
  return JSON.stringify({ ...fixture, events: '@events', checkpoints: '@checkpoints' }, null, 2)
    .replace('"@events"', lines(fixture.events))
    .replace('"@checkpoints"', lines(fixture.checkpoints))
    + '\n';
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const harness = await startHarness(ROOT, 5198);
  const { baseUrl, browser } = harness;
  const errors = [];
  let ok = true;
  try {
    const t0 = Date.now();
    if (RECORD) {
      const rec = await record(browser, baseUrl, errors);
      const fixture = {
        about: 'Greedy-bot input script for the daily seed, recorded by `npm run replay -- --record`. '
          + 'Replaying it must reproduce `final` exactly.',
        date: DATE,
        frames: FRAMES,
        fps: 60,
        device: DEVICE,
        final: rec.final,
        events: rec.events,
        checkpoints: rec.checkpoints,
      };
      await writeFile(FIXTURE, formatFixture(fixture));
      console.log(`recorded ${rec.shots} shots, ${rec.combos} combo steps, ${rec.events.length} events, ${describe(rec.final)}`
        + `  ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(ROOT, FIXTURE)}`);
      // A recording is only useful if it replays: check it straight away
      ok = compare('replay of the new recording', fixture, await replay(browser, baseUrl, errors, fixture));
    } else {
      const fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
      const name = path.relative(ROOT, FIXTURE);
      ok = compare(`replay ${name}`, fixture, await replay(browser, baseUrl, errors, fixture));

      const rt = await replay(browser, baseUrl, errors, fixture, { roundtripAt: fixture.frames / 2 });
      if (!rt.roundtrip) {
        console.log(`FAIL save/load: never found a frame with nothing in flight after ${fixture.frames / 2}`);
        ok = false;
      } else if (!rt.roundtrip.same) {
        console.log(`FAIL save/load: serialize() after restore() differs from the save, frame ${rt.roundtrip.frame}`);
        ok = false;
      } else {
        ok = compare(`replay with a save/load at frame ${rt.roundtrip.frame}`, fixture, rt) && ok;
      }
      console.log(`     ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  } finally {
    await harness.close();
  }
  for (const e of errors) console.log(e);
  if (!ok || errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
