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
import { openGame, startHarness } from './vclock.mjs';

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

// Fire one shot to start the wall, then leave the board alone until the run
// ends. Every clear from then on would be the wall's own doing.
async function idleUntilGameOver(page, maxFrames) {
  await press(page, 'Space');
  await settle(page);
  const before = await hs(page);
  const after = await page.evaluate((limit) => {
    const h = window.__hs;
    let levelUps = 0;
    let level = h.level;
    for (let i = 0; i < limit && !h.gameOver; i++) {
      window.__replay.run(1);
      if (h.level !== level) {
        levelUps++;
        level = h.level;
      }
    }
    return { level: h.level, score: h.score, gameOver: h.gameOver, frame: window.__replay.frame, levelUps };
  }, maxFrames);
  const secs = ((after.frame - before.frame) / 60).toFixed(1);
  check(after.level === before.level && after.score === before.score,
    `idle board moved on by itself: level ${before.level} -> ${after.level}, score ${before.score} -> ${after.score} in ${secs} s`);
  check(after.gameOver, `no game over after ${secs} s idle`);
  return `level ${after.level}, score ${after.score} for ${secs} s until the wall reached the front`;
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
];

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main() {
  const checks = CHECKS.filter((c) => !filters.length || filters.some((f) => c.name.includes(f)));
  if (!checks.length) throw new Error(`no check matches ${filters.join(', ')}`);

  const harness = await startHarness(ROOT, 5197);
  const errors = [];
  let failed = 0;
  try {
    for (const c of checks) {
      const t0 = Date.now();
      const errorsBefore = errors.length;
      const { context, page } = await openGame(harness.browser, harness.baseUrl, errors);
      try {
        await step(page, 2);
        const note = await c.run(page);
        if (errors.length > errorsBefore) throw new Error(errors[errorsBefore]);
        console.log(`ok   ${c.name}  ${((Date.now() - t0) / 1000).toFixed(1)}s${note ? `  (${note})` : ''}`);
      } catch (err) {
        failed++;
        console.log(`FAIL ${c.name}: ${err.message.split('\n')[0]}`);
      } finally {
        await context.close();
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
