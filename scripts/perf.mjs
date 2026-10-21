#!/usr/bin/env node
// Frame-budget harness: the chain hitch, measured.
//
//   npm run perf             6 chains, 4x CPU throttle
//   npm run perf -- 10 6     10 chains, 6x throttle
//
// Stages an 11-cube x2 chain (5 cubes, then 6) on a 1440x900 desktop page
// with Chrome's CPU throttled through CDP (Emulation.setCPUThrottlingRate, as
// DevTools' "4x slowdown"), fires it, and times every frame for the next 3 s:
// main-thread work from the first requestAnimationFrame callback of a frame
// to the end of its last, which covers the game update and renderer.render.
// Prints p50/p95/p99/max over all chains and per chain, and fails if p95 is
// over the 12 ms budget (docs/APPSTORE_PLAN.md, Phase 4).
//
// Headless Chromium renders with SwiftShader, so GPU time is not in these
// numbers; on a real desktop the same work is measured by the ?debug=1 frame
// meter (src/render/perf.js).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarness } from './vclock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAINS = Number(process.argv[2] || 6);
const THROTTLE = Number(process.argv[3] || 4);
const BUDGET_MS = 12;

// Far wall first. Firing R (0) into lane 3 clears five R; the G pairs above
// them drop into two G triples.
const BOARD = ['GRR.RRG', 'BGG.GGB', 'RBY.YBR'];
const CELLS = [];
BOARD.forEach((line, i) => [...line].forEach((ch, col) => {
  if (ch !== '.') CELLS.push({ col, row: 11 - i, color: 'RGBYM'.indexOf(ch) });
}));
const CHAIN_POINTS = 5 * 10 + 6 * 10 * 2;

// Installed before the game loads: sums the time each frame's rAF callbacks
// take, keyed by the frame's timestamp
function instrument() {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frameWork = { byFrame: new Map(), recording: false };
  window.requestAnimationFrame = (cb) => raf((t) => {
    const start = performance.now();
    cb(t);
    const w = window.__frameWork;
    if (w.recording) w.byFrame.set(t, (w.byFrame.get(t) || 0) + performance.now() - start);
  });
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] };
}

const fmt = ({ n, p50, p95, p99, max }) =>
  `${String(n).padStart(4)} frames  p50 ${p50.toFixed(1).padStart(5)}  p95 ${p95.toFixed(1).padStart(5)}`
  + `  p99 ${p99.toFixed(1).padStart(5)}  max ${max.toFixed(1).padStart(6)} ms`;

async function main() {
  const harness = await startHarness(ROOT, 5196);
  const errors = [];
  try {
    const context = await harness.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('hueshot-hint-seen', '1'));
    await context.addInitScript(instrument);
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push(err.message));
    // The full effects: the throttled page must not switch to low power
    await page.goto(`${harness.baseUrl}?debug=1&lowpower=0`);
    await page.waitForFunction(() => window.__hs, null, { timeout: 15_000 });
    // Past the front door, into Endless
    await page.click('#door-endless');
    await page.waitForTimeout(1_500);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await page.waitForTimeout(1_000);

    const all = [];
    for (let i = 0; i < CHAINS; i++) {
      await page.evaluate((cells) => {
        window.__hs.clearBoard();
        for (const { col, row, color } of cells) window.__hs.placeCube(col, row, color);
        window.__hs.setCur({ col: 3, color: 0 });
      }, CELLS);
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => window.__hs.score);
      await page.evaluate(() => { window.__frameWork.byFrame = new Map(); window.__frameWork.recording = true; });
      await page.keyboard.press('Space');
      await page.waitForTimeout(3_000);
      const frames = await page.evaluate(() => {
        window.__frameWork.recording = false;
        return [...window.__frameWork.byFrame.values()];
      });
      const gained = (await page.evaluate(() => window.__hs.score)) - before;
      if (gained !== CHAIN_POINTS) throw new Error(`chain ${i + 1} scored ${gained}, expected ${CHAIN_POINTS}: the staged chain did not play`);
      console.log(`chain ${i + 1}  ${fmt(stats(frames))}`);
      all.push(...frames);
      await page.evaluate(() => window.__hs.clearBoard());
      await page.waitForTimeout(500);
    }
    const total = stats(all);
    console.log(`\nall      ${fmt(total)}  (${THROTTLE}x CPU throttle, 1440x900)`);
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
    if (total.p95 >= BUDGET_MS) throw new Error(`p95 ${total.p95.toFixed(1)} ms is over the ${BUDGET_MS} ms budget`);
  } finally {
    await harness.close();
  }
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exitCode = 1;
});
