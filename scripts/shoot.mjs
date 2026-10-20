#!/usr/bin/env node
// Screenshot harness. Boots the Vite dev server, drives the game in headless
// Chromium through the ?debug=1 hook (window.__hs, see the end of
// src/main.js), and writes one PNG per scene to shots/.
//
//   npm run shots              all scenes
//   npm run shots -- chain     only scenes whose name contains "chain"
//   SHOTS_DIR=/tmp/x npm run shots
//
// Exits non-zero if any page throws or logs a console error, or if a scene
// fails its own check (the chain must reach x2, the level-up must land, ...).

import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.SHOTS_DIR || 'shots');
const filters = process.argv.slice(2);

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const COLS = 7;
const ROWS = 12;

// ─── Staged boards ───────────────────────────────────────────────────────────
// One string per row, starting at the far wall (row 11) and coming toward the
// player. Each character is a lane, col 0 first: R G B Y M = colour 0-4,
// '.' = empty. Columns must be contiguous from the far wall, like real play.
const COLOR = { R: 0, G: 1, B: 2, Y: 3, M: 4 };

// Firing R into lane 4 clears the R row; the two G above it drop next to the
// G at lane 1 and clear again.
const CHAIN_BOARD = [
  'BGRR.BG',
  'R.GG.RB',
  'G....GR',
];

// Played at level 3 (25 clears): firing R into lane 4 is the 28th clear.
const LEVEL_UP_BOARD = [
  'GBRR.YB',
  'Y.BG.GR',
  'B.Y..RG',
];

// Lane 3 reaches row 2, lane 2 row 3: danger is any cube in rows 1-2.
const DANGER_BOARD = [
  'RGBRGBR',
  'GBRGBRG',
  'RRGBRGB',
  'BGBRG.R',
  'G.RGB.G',
  'R.GRR.B',
  '..BGB..',
  '..RRG..',
  '..GB...',
  '...G...',
];

// Lane 3 is full to row 1; one more cube there lands on row 0.
const GAME_OVER_BOARD = [
  'RGBRGBR',
  'GBRGBRG',
  'RRGBRGB',
  'BGBRG.R',
  'G.RGB.G',
  'R.GRR.B',
  '..BGB..',
  '..RRG..',
  '..GB...',
  '...G...',
  '...B...',
];

function parseBoard(rows) {
  const cells = [];
  rows.forEach((line, i) => {
    if (line.length !== COLS) throw new Error(`board row "${line}" is not ${COLS} lanes`);
    [...line].forEach((ch, col) => {
      if (ch === '.') return;
      if (!(ch in COLOR)) throw new Error(`board row "${line}": unknown colour "${ch}"`);
      cells.push({ col, row: ROWS - 1 - i, color: COLOR[ch] });
    });
  });
  const grid = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
  for (const { col, row, color } of cells) grid[col][row] = color;
  for (let c = 0; c < COLS; c++) {
    for (let r = 1; r < ROWS; r++) {
      if (grid[c][r - 1] !== null && grid[c][r] === null) {
        throw new Error(`board lane ${c} has a gap at row ${r}`);
      }
    }
  }
  // A staged board that already contains a match would clear on the first
  // cascade and stage something other than what the scene claims.
  const seen = new Set();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[c][r] === null || seen.has(`${c},${r}`)) continue;
      const group = groupAt(grid, c, r);
      group.forEach((k) => seen.add(k));
      if (group.length >= 3) throw new Error(`board already has a match at lane ${c}, row ${r}`);
    }
  }
  return cells;
}

// ─── Greedy bot ──────────────────────────────────────────────────────────────
// Flood-fill the same 4-connected same-colour group the game matches on.
function groupAt(grid, col, row) {
  const color = grid[col][row];
  const seen = new Set();
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    const key = `${c},${r}`;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS || seen.has(key)) continue;
    if (grid[c][r] === null || grid[c][r] !== color) continue;
    seen.add(key);
    stack.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
  }
  return [...seen];
}

function landingRow(grid, col) {
  for (let r = 0; r < ROWS; r++) if (grid[col][r] !== null) return r - 1;
  return ROWS - 1;
}

// One-ply greedy: take the biggest clear available; otherwise grow the
// biggest same-colour group; break ties toward the far wall, then the middle.
// Never lands on rows 0-2 unless nothing else is left.
function chooseLane(grid, color) {
  let best = null;
  for (let col = 0; col < COLS; col++) {
    const row = landingRow(grid, col);
    if (row < 0) continue;
    let value;
    if (color >= 5) {
      // Rainbow / bomb: fire it into the most crowded spot
      const neighbours = [[-1, 0], [1, 0], [0, 1]]
        .filter(([dc, dr]) => grid[col + dc]?.[row + dr] != null).length;
      value = neighbours * 50 + row * 2;
    } else {
      const sim = grid.map((lane) => lane.slice());
      sim[col][row] = color;
      const size = groupAt(sim, col, row).length;
      value = size >= 3 ? 1000 + size * 50 : size * 40;
      value += row * 2;
    }
    if (row <= 2) value -= 500;
    value -= Math.abs(col - 3) * 0.1;
    if (!best || value > best.value) best = { col, value };
  }
  return best && best.col;
}

// ─── Page helpers ────────────────────────────────────────────────────────────
// Math.random is replaced with a fixed-seed PRNG before the game loads, so the
// bag, the opening seeds and the bot's game are the same on every run.
function seededRandom(seed) {
  let a = seed >>> 0;
  Math.random = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let i = 0;
    const tick = () => (++i >= count ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

async function stage(page, rows) {
  const cells = parseBoard(rows);
  await page.evaluate((list) => {
    window.__hs.clearBoard();
    for (const { col, row, color } of list) window.__hs.placeCube(col, row, color);
  }, cells);
}

// Aim and fire through the real keyboard path, then wait for the shot and any
// cascade it starts to finish.
async function fire(page, col, color) {
  await page.evaluate(({ col, color }) => window.__hs.setCur({ col, color }), { col, color });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.__hs.busy, null, { timeout: 10_000 });
}

async function playBot(page, shots, thinkMs) {
  for (let i = 0; i < shots; i++) {
    const state = await page.evaluate(() => ({
      grid: window.__hs.grid, color: window.__hs.cur.color, over: window.__hs.gameOver,
    }));
    if (state.over) return i;
    const col = chooseLane(state.grid, state.color);
    if (col === null) return i;
    await fire(page, col);
    if (thinkMs) await page.waitForTimeout(thinkMs);
  }
  return shots;
}

function hsState(page) {
  return page.evaluate(() => ({
    score: window.__hs.score, level: window.__hs.level, over: window.__hs.gameOver, danger: window.__hs.danger,
  }));
}

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─── Scenes ──────────────────────────────────────────────────────────────────
const SCENES = [
  {
    name: '01-opening',
    // What a new player sees sitting idle: the seeded pair and the hint
    hintSeen: false,
    async run(page) {
      await page.waitForSelector('#hint.show', { timeout: 6_000 });
      await page.waitForTimeout(500);
    },
  },
  {
    name: '02-aiming',
    // Thumb down and dragged across lanes, not yet released
    async run(page) {
      const { width, height } = page.viewportSize();
      const before = (await page.evaluate(() => window.__hs.cur)).col;
      await page.mouse.move(width * 0.5, height * 0.6);
      await page.mouse.down();
      await page.mouse.move(width * 0.25, height * 0.62, { steps: 6 });
      await frames(page, 4);
      const after = (await page.evaluate(() => window.__hs.cur)).col;
      check(after !== before, `dragging did not change lane (stayed on ${before})`);
    },
  },
  {
    name: '03-bot',
    // Half a minute of greedy play: the wall has advanced, there's a real board
    async run(page) {
      const fired = await playBot(page, 30, 150);
      const s = await hsState(page);
      check(s.score > 0, 'greedy bot never cleared anything');
      return `${fired} shots, score ${s.score}, level ${s.level}${s.over ? ', game over' : ''}`;
    },
  },
  {
    name: '04-chain-x2',
    async run(page) {
      await stage(page, CHAIN_BOARD);
      await page.evaluate(() => window.__hs.setCur({ col: 4, color: 0 }));
      await page.keyboard.press('Space');
      await page.waitForFunction(() => {
        const el = document.getElementById('chain-counter');
        return el.style.display === 'block' && el.textContent === 'DOUBLE!';
      }, null, { timeout: 5_000 });
      await page.waitForTimeout(250);
    },
  },
  {
    name: '05-level-up',
    async run(page) {
      await page.evaluate(() => window.__hs.setLevelClears(25));
      await stage(page, LEVEL_UP_BOARD);
      await fire(page, 4, 0);
      await page.waitForFunction(
        () => document.getElementById('level-up').style.display === 'block',
        null, { timeout: 5_000 },
      );
      await page.waitForTimeout(450);
      const s = await hsState(page);
      check(s.level === 4, `expected level 4 after the staged clear, got ${s.level}`);
    },
  },
  {
    name: '06-danger',
    async run(page) {
      await stage(page, DANGER_BOARD);
      await page.waitForFunction(() => document.body.classList.contains('danger'), null, { timeout: 5_000 });
      await page.waitForTimeout(700);
    },
  },
  {
    name: '07-game-over',
    async run(page) {
      await stage(page, GAME_OVER_BOARD);
      await fire(page, 3, 0);
      await page.waitForFunction(
        () => document.getElementById('game-over-screen').style.display === 'flex',
        null, { timeout: 5_000 },
      );
      await page.waitForTimeout(400);
      check((await hsState(page)).over, 'game-over screen up but the game is not over');
    },
  },
  {
    name: '08-desktop',
    device: DESKTOP,
    async run(page) {
      await playBot(page, 8, 100);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────
async function runScene(browser, baseUrl, scene, errors) {
  const context = await browser.newContext(scene.device || PHONE);
  await context.addInitScript(seededRandom, 0x5eed);
  if (scene.hintSeen !== false) {
    await context.addInitScript(() => localStorage.setItem('hueshot-hint-seen', '1'));
  }
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(`[${scene.name}] pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${scene.name}] console.error: ${msg.text()}`);
  });
  try {
    await page.goto(`${baseUrl}?debug=1`);
    await page.waitForFunction(() => window.__hs, null, { timeout: 15_000 });
    await frames(page, 10);
    const note = await scene.run(page);
    const file = path.join(OUT, `${scene.name}.png`);
    await page.screenshot({ path: file });
    return note;
  } finally {
    await context.close();
  }
}

async function main() {
  const scenes = SCENES.filter((s) => !filters.length || filters.some((f) => s.name.includes(f)));
  if (!scenes.length) throw new Error(`no scene matches ${filters.join(', ')}`);

  await mkdir(OUT, { recursive: true });
  if (!filters.length) {
    for (const f of await readdir(OUT)) if (f.endsWith('.png')) await rm(path.join(OUT, f));
  }

  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 5199, open: false },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];

  // Headless Chromium has no GPU; SwiftShader gives three.js a WebGL context
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const errors = [];
  let failed = 0;
  try {
    for (const scene of scenes) {
      const t0 = Date.now();
      try {
        const note = await runScene(browser, baseUrl, scene, errors);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`ok   ${scene.name}.png  ${secs}s${note ? `  (${note})` : ''}`);
      } catch (err) {
        failed++;
        console.log(`FAIL ${scene.name}: ${err.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  for (const e of errors) console.log(e);
  console.log(`\n${scenes.length - failed}/${scenes.length} scenes -> ${path.relative(ROOT, OUT) || '.'}/`
    + (errors.length ? `, ${errors.length} page error(s)` : ''));
  if (failed || errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
