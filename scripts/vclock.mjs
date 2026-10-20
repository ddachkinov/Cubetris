// Virtual-clock page driver shared by the harnesses that need exact timing
// (replay.mjs, checks.mjs). performance.now, Date and requestAnimationFrame
// are replaced before the game loads, and the harness steps the game loop one
// 1/60 s frame at a time, dispatching DOM events at exact frame numbers
// through the game's own listeners. Math.random is seeded too, so a run is
// the same every time.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { seededRandom } from './bot.mjs';

export const DATE = '2026-10-20T12:00:00';
export const CHECK_EVERY = 300; // checkpoint every 5 s
export const DEVICE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  timezoneId: 'UTC',
};

// ─── In-page virtual clock + event driver ────────────────────────────────────
// Installed with addInitScript, so it is in place before src/main.js runs.
function installReplayDriver({ dateIso, checkEvery }) {
  const FRAME_MS = 1000 / 60;
  const RealDate = Date;
  const epoch = new RealDate(dateIso).getTime();
  let now = 0;

  performance.now = () => now;
  window.Date = class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(epoch + now);
    }

    static now() {
      return epoch + now;
    }
  };
  let callbacks = [];
  window.requestAnimationFrame = (cb) => {
    callbacks.push(cb);
    return callbacks.length;
  };
  window.cancelAnimationFrame = () => {};

  function pointer(type, [x, y]) {
    const target = document.elementFromPoint(x, y) || document.body;
    target.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  }

  function dispatch(ev) {
    if (ev.key) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: ev.key, bubbles: true, cancelable: true }));
    } else if (ev.down) {
      pointer('pointerdown', ev.down);
    } else if (ev.up) {
      pointer('pointerup', ev.up);
    } else if (ev.cancel) {
      pointer('pointercancel', ev.cancel);
    } else if (ev.click) {
      document.querySelector(ev.click).click();
    } else {
      throw new Error(`unknown replay event ${JSON.stringify(ev)}`);
    }
  }

  // Far wall first, one character per lane: R G B Y M, * rainbow, ! bomb
  function snapshot(frame) {
    const hs = window.__hs;
    const grid = hs.grid;
    const rows = [];
    for (let r = grid[0].length - 1; r >= 0; r--) {
      rows.push(grid.map((lane) => (lane[r] === null ? '.' : 'RGBYM*!'[lane[r]])).join(''));
    }
    return { frame, score: hs.score, level: hs.level, gameOver: hs.gameOver, cur: hs.cur, grid: rows };
  }

  // Combo popups seen, so a recording can say whether it covers chains
  let combos = 0;
  new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) if (node.classList?.contains('combo')) combos++;
    }
  }).observe(document, { childList: true, subtree: true });

  window.__replay = {
    frame: 0,
    get combos() {
      return combos;
    },
    snapshot() {
      return snapshot(this.frame);
    },
    // Step n frames. Events carry absolute frame numbers; each is dispatched
    // just before its frame runs. Returns the checkpoints passed on the way.
    run(n, events = []) {
      const checkpoints = [];
      const end = this.frame + n;
      while (this.frame < end) {
        for (const ev of events) if (ev.f === this.frame) dispatch(ev);
        now += FRAME_MS;
        const due = callbacks;
        callbacks = [];
        for (const cb of due) cb(now);
        this.frame++;
        if (this.frame % checkEvery === 0) checkpoints.push(snapshot(this.frame));
      }
      return checkpoints;
    },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────
export async function openGame(browser, baseUrl, errors, { device = DEVICE, date = DATE } = {}) {
  const context = await browser.newContext(device);
  await context.addInitScript(seededRandom, 0x5eed);
  await context.addInitScript(() => localStorage.setItem('hueshot-hint-seen', '1'));
  await context.addInitScript(installReplayDriver, { dateIso: date, checkEvery: CHECK_EVERY });
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  await page.goto(`${baseUrl}?debug=1`);
  await page.waitForFunction(() => window.__hs && window.__replay, null, { timeout: 15_000 });
  return { context, page };
}

export const run = (page, n, events) => page.evaluate(([count, evs]) => window.__replay.run(count, evs), [n, events]);
export const snap = (page) => page.evaluate(() => window.__replay.snapshot());
// What the bot sees: grid[col][row] as colour indices, plus the hand
export const look = (page) => page.evaluate(() => ({
  grid: window.__hs.grid, cur: window.__hs.cur, busy: window.__hs.busy, gameOver: window.__hs.gameOver,
}));


// Headless Chromium has no GPU; SwiftShader gives three.js a WebGL context
export function launchBrowser() {
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

// Vite on `port` and, unless { browser: false }, a browser. close() stops both.
export async function startHarness(root, port, { browser: withBrowser = true } = {}) {
  const server = await createServer({ root, logLevel: 'error', server: { port, open: false } });
  await server.listen();
  const browser = withBrowser ? await launchBrowser() : null;
  return {
    baseUrl: server.resolvedUrls.local[0],
    browser,
    async close() {
      await browser?.close();
      await server.close();
    },
  };
}
