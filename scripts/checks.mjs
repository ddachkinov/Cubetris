#!/usr/bin/env node
// Gameplay checks on the virtual clock (vclock.mjs): scripted situations
// whose outcome is a rule of the game, played through the real build with
// exact frame timing.
//
//   npm run checks             all checks
//   npm run checks -- idle     only checks whose name contains "idle"
//
// Exits non-zero if a check fails or the page throws or logs a console error.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openGame, startHarness } from './vclock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filters = process.argv.slice(2);

// ─── Page helpers ────────────────────────────────────────────────────────────
const step = (page, n, events = []) => page.evaluate(([count, evs]) => window.__replay.run(count, evs), [n, events]);

// Dispatch a keydown just before the next frame runs
const press = (page, key) => page.evaluate((k) => window.__replay.run(1, [{ f: window.__replay.frame, key: k }]), key);

// Step until nothing is in flight; returns the frames it took
async function settle(page, max = 600) {
  const n = await page.evaluate((limit) => {
    for (let i = 0; i < limit; i++) {
      if (!window.__hs.busy) return i;
      window.__replay.run(1);
    }
    return -1;
  }, max);
  if (n < 0) throw new Error(`still busy after ${max} frames`);
  return n;
}

const hs = (page) => page.evaluate(() => ({
  level: window.__hs.level, score: window.__hs.score, gameOver: window.__hs.gameOver, frame: window.__replay.frame,
}));

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Fire one shot to start the wall, then leave the board alone until the run
// ends. Every clear from then on would be the wall's own doing.
async function idleUntilGameOver(page, maxFrames) {
  await press(page, 'Space');
  await settle(page);
  const before = await hs(page);
  const after = await page.evaluate((limit) => {
    const h = window.__hs;
    for (let i = 0; i < limit && !h.gameOver; i++) window.__replay.run(1);
    return { level: h.level, score: h.score, gameOver: h.gameOver, frame: window.__replay.frame };
  }, maxFrames);
  const secs = ((after.frame - before.frame) / 60).toFixed(1);
  check(after.level === before.level && after.score === before.score,
    `idle board moved on by itself: level ${before.level} -> ${after.level}, score ${before.score} -> ${after.score} in ${secs} s`);
  check(after.gameOver, `no game over after ${secs} s idle`);
  return `level ${after.level}, score ${after.score} for ${secs} s until the wall reached the front`;
}

// Start today's Daily, then play `shots` ({ at, col }, `at` in frames from
// the start) until frame `until`. Returns the hand after every shot, the far
// row after every wall advance, and the board at the end. A shot marked
// `alone` must land with no neighbour of its own colour, so that it cannot
// take part in a match or in how a wall row fits the board.
async function playDaily(page, shots, until) {
  await page.evaluate(() => window.__replay.run(1, [{ f: window.__replay.frame, click: '#daily-btn' }]));
  return page.evaluate(([list, end]) => {
    const h = window.__hs;
    const rp = window.__replay;
    const f0 = rp.frame;
    const hands = [];
    const walls = [];
    const problems = [];
    while (rp.frame < f0 + end) {
      const shot = list.find((s) => s.at === rp.frame - f0);
      const timer = h.wall.timer;
      if (shot) {
        h.setCur({ col: shot.col });
        const row = h.landingRow(shot.col);
        const color = h.cur.color;
        const grid = h.grid;
        const touching = [[shot.col - 1, row], [shot.col + 1, row], [shot.col, row + 1]]
          .some(([c, r]) => grid[c]?.[r] === color);
        if (shot.alone && (row > 10 || touching)) problems.push(`shot at ${shot.at} into lane ${shot.col} is not alone`);
        rp.run(1, [{ f: rp.frame, key: 'Space' }]);
        const { color: cur, next } = h.cur;
        hands.push([cur, ...next]);
      } else {
        rp.run(1);
      }
      if (h.wall.timer < timer) walls.push(h.grid.map((lane) => lane[lane.length - 1]));
    }
    return { hands, walls, grid: h.grid, score: h.score, level: h.level, problems };
  }, [shots, until]);
}

// ─── Checks ──────────────────────────────────────────────────────────────────
const CHECKS = [
  {
    // Bug 1: wall rows matched with the board they were pushed into, and the
    // wall's cascade scored and levelled for them. Three colours at level 1
    // is where a self-match is likeliest.
    name: 'idle-board-level-1',
    async run(page) {
      return idleUntilGameOver(page, 12 * 60 * 12);
    },
  },
  {
    // The review's reproduction: a bot that stopped at level 13 watched the
    // game climb to level 22 on its own. Five colours, 2.8 s wall.
    name: 'idle-board-level-13',
    async run(page) {
      await page.evaluate(() => window.__hs.setLevelClears(116));
      check((await hs(page)).level === 13, 'setLevelClears(116) did not reach level 13');
      return idleUntilGameOver(page, 12 * 60 * 4);
    },
  },
  {
    // Bug 2: the wall waited for a cascade to finish but not for a shot in
    // flight. A cube landing while the wall's cascade was resolving replaced
    // it, and the clears that cascade had already made never counted. Here
    // the wall's cascade has a staged triple to clear, worth the 3 clears
    // that reach level 2, and a shot is half way down a lane when the wall
    // comes due.
    name: 'shot-in-flight-at-wall',
    async run(page) {
      // The first shot starts the wall and times a flight to the far row
      await page.evaluate(() => {
        window.__hs.clearBoard();
        window.__hs.setCur({ col: 5 });
      });
      await press(page, 'Space');
      const flight = await settle(page);
      await page.evaluate(() => {
        const h = window.__hs;
        h.clearBoard();
        h.setLevelClears(3);
        for (let c = 0; c < 3; c++) h.placeCube(c, 11, 0);
        h.setCur({ col: 6 });
      });
      check((await hs(page)).level === 1, 'staged run is not on level 1');

      const r = await page.evaluate((lead) => {
        const h = window.__hs;
        const rp = window.__replay;
        let fired = null;
        for (let i = 0; i < 1200; i++) {
          const before = h.wall.timer;
          if (fired === null && (h.wall.interval - before) * 60 <= lead) {
            fired = rp.frame;
            rp.run(1, [{ f: rp.frame, key: 'Space' }]);
          } else {
            rp.run(1);
          }
          if (fired !== null && h.wall.timer < before) {
            return { fired, advanced: rp.frame, inFlight: h.busy };
          }
        }
        return null;
      }, Math.floor(flight / 2));
      check(r, 'the wall never advanced');
      await settle(page);
      const end = await hs(page);
      check(!r.inFlight, `the wall advanced with a shot in flight (fired at frame ${r.fired}, wall at ${r.advanced})`);
      // It waits for the shot and the cascade the shot sets off (one 180 ms
      // step here), and no longer
      check(r.advanced - r.fired <= flight + 30,
        `the wall waited ${r.advanced - r.fired} frames after a ${flight}-frame shot was fired`);
      check(end.level === 2, `level ${end.level} after the staged triple: its clears were lost`);
      return `wall waited for a ${flight}-frame shot and its cascade, ${r.advanced - r.fired} frames; level 2`;
    },
  },
  {
    // Bug 3: the queue and the wall rows shared one RNG, so a shot fired a
    // little sooner or later changed both from then on. Two runs of the
    // same Daily fire the same three shots into the same lanes; only the
    // third moves, from before the first wall advance to after it. Both
    // must deal the same hand after every shot, bring the same wall rows
    // and end on the same board.
    name: 'daily-shot-timing',
    async run(page, browser, baseUrl, errors) {
      // 2026-10-20 deals 1, 1, 0, 2, ... and seeds colour 1 into lanes 2
      // and 4. The 1s go to the empty edge lanes; the 0 lands on lane 2's
      // seed, next to nothing of its own colour either way.
      const early = [{ at: 10, col: 0 }, { at: 60, col: 6 }, { at: 300, col: 2, alone: true }];
      const late = [{ at: 10, col: 0 }, { at: 60, col: 6 }, { at: 700, col: 2, alone: true }];
      const until = 1900; // three wall advances
      const a = await playDaily(page, early, until);
      const other = await openGame(browser, baseUrl, errors);
      await step(other.page, 2);
      const b = await playDaily(other.page, late, until);

      check(!a.problems.length && !b.problems.length, [...a.problems, ...b.problems].join('; '));
      check(a.walls.length === 3 && b.walls.length === 3, `wall advances: ${a.walls.length} and ${b.walls.length}, expected 3`);
      const diffs = [];
      if (!same(a.hands, b.hands)) diffs.push(`hands: early ${JSON.stringify(a.hands)}, late ${JSON.stringify(b.hands)}`);
      if (!same(a.walls, b.walls)) diffs.push(`wall rows: early ${JSON.stringify(a.walls)}, late ${JSON.stringify(b.walls)}`);
      if (!same(a.grid, b.grid) || a.score !== b.score) diffs.push('final boards');
      check(!diffs.length, `the two timings differ in ${diffs.join('; ')}`);
      return `third shot at frame 300 or 700: same ${a.hands.length} hands, same ${a.walls.length} wall rows, same board`;
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main() {
  const checks = CHECKS.filter((c) => !filters.length || filters.some((f) => c.name.includes(f)));
  if (!checks.length) throw new Error(`no check matches ${filters.join(', ')}`);

  const harness = await startHarness(ROOT, 5197, { browser: false });
  const errors = [];
  let failed = 0;
  try {
    for (const c of checks) {
      const t0 = Date.now();
      const errorsBefore = errors.length;
      // A fresh browser each: a page opened after another closed in the same
      // browser ran the virtual clock some 30 times slower
      const browser = await launchBrowser();
      const { page } = await openGame(browser, harness.baseUrl, errors);
      try {
        await step(page, 2);
        const note = await c.run(page, browser, harness.baseUrl, errors);
        if (errors.length > errorsBefore) throw new Error(errors[errorsBefore]);
        console.log(`ok   ${c.name}  ${((Date.now() - t0) / 1000).toFixed(1)}s${note ? `  (${note})` : ''}`);
      } catch (err) {
        failed++;
        console.log(`FAIL ${c.name}: ${err.message.split('\n')[0]}`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await harness.close();
  }

  for (const e of errors) console.log(e);
  console.log(`\n${checks.length - failed}/${checks.length} checks`
    + (errors.length ? `, ${errors.length} page error(s)` : ''));
  if (failed || errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
