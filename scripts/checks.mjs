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
import { chooseLane } from './bot.mjs';
import { launchBrowser, openGame, startHarness } from './vclock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filters = process.argv.slice(2);

// ─── Page helpers ────────────────────────────────────────────────────────────
const step = (page, n, events = []) => page.evaluate(([count, evs]) => window.__replay.run(count, evs), [n, events]);

// Dispatch a keydown just before the next frame runs
const press = (page, key) => page.evaluate((k) => window.__replay.run(1, [{ f: window.__replay.frame, key: k }]), key);

// Click an element just before the next frame runs
const click = (page, selector) => page.evaluate((sel) => window.__replay.run(1, [{ f: window.__replay.frame, click: sel }]), selector);

const shown = (page, id) => page.evaluate((el) => getComputedStyle(document.getElementById(el)).display !== 'none', id);

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
  await click(page, '#daily-btn');
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
    // Bug 5: a level-up buys a 3 s breather (the plan's number) before the
    // next wall advance; it was 4 s. Clear the triple that reaches level 2
    // and time the wall: breather + level 2's interval.
    name: 'level-up-breather',
    async run(page) {
      await page.evaluate(() => {
        window.__hs.clearBoard();
        window.__hs.setCur({ col: 5 });
      });
      await press(page, 'Space'); // starts the wall
      await settle(page);
      await page.evaluate(() => {
        const h = window.__hs;
        h.setLevelClears(3);
        h.placeCube(0, 11, 0);
        h.placeCube(1, 11, 0);
        h.setCur({ col: 2, color: 0 });
      });
      const r = await page.evaluate(() => {
        const h = window.__hs;
        const rp = window.__replay;
        rp.run(1, [{ f: rp.frame, key: 'Space' }]);
        let levelUp = null;
        for (let i = 0; i < 1200; i++) {
          const timer = h.wall.timer;
          rp.run(1);
          if (levelUp === null && h.level === 2) levelUp = { frame: rp.frame, interval: h.wall.interval };
          if (levelUp && h.wall.timer === 0 && timer > 0) return { ...levelUp, advanced: rp.frame };
        }
        return levelUp;
      });
      check(r, 'no level-up');
      check(r.advanced, 'no wall advance within 20 s of the level-up');
      const gap = (r.advanced - r.frame) / 60;
      const breather = gap - r.interval;
      check(Math.abs(breather - 3) <= 2 / 60,
        `wall came ${gap.toFixed(2)} s after the level-up: ${breather.toFixed(2)} s breather + ${r.interval} s interval, expected 3 s`);
      return `wall ${gap.toFixed(2)} s after the level-up = 3 s breather + ${r.interval} s`;
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
  {
    // W2-B: a run is saved on every wall advance, once nothing is in flight,
    // and a reload offers Continue and puts back exactly that run. The bot
    // plays five shots of today's Daily, then leaves the board to the wall
    // (a bot that keeps clearing keeps levelling up, and every level-up's
    // breather holds the wall off) until it has been saved twice. Each save
    // must equal the live run at the frame it was written. After a reload
    // the Continue screen must be up with exactly the run that was left
    // (serialize() equal field for field), and Continue must play it on.
    name: 'continue-after-reload',
    async run(page) {
      await click(page, '#daily-btn');
      const saves = [];
      for (let turn = 0; saves.length < 2 && turn < 60; turn++) {
        if (turn < 5) {
          const { grid, cur } = await page.evaluate(() => ({ grid: window.__hs.grid, cur: window.__hs.cur }));
          const col = chooseLane(grid, cur.color);
          check(col !== null, 'the bot ran out of lanes');
          await page.evaluate((c) => window.__hs.setCur({ col: c }), col);
          await press(page, 'Space');
        }
        // 40 frames, watching for a save on every one
        const seen = await page.evaluate(() => {
          const out = [];
          for (let i = 0; i < 40; i++) {
            const before = localStorage.getItem('hueshot-run');
            window.__replay.run(1);
            const after = localStorage.getItem('hueshot-run');
            if (after && after !== before) {
              out.push({
                frame: window.__replay.frame,
                busy: window.__hs.busy,
                saved: JSON.parse(after),
                live: window.__hs.busy ? null : window.__hs.serialize(),
              });
            }
          }
          return out;
        });
        saves.push(...seen);
        check(!(await hs(page)).gameOver, 'the run ended before two saves');
      }
      check(saves.length >= 2, `${saves.length} saves in 2400 frames`);
      for (const s of saves) {
        check(!s.busy, `a save was written at frame ${s.frame} while a shot or cascade was in flight`);
        check(same(s.saved.run, s.live), `the save at frame ${s.frame} is not the run at that frame`);
      }
      // Leaving the page saves the run once more (pagehide), so what comes
      // back is the run as it was at the moment of the reload
      await settle(page);
      const live = await page.evaluate(() => window.__hs.serialize());

      await page.reload();
      await page.waitForFunction(() => window.__hs && window.__replay, null, { timeout: 15_000 });
      await step(page, 2);
      const offered = await page.evaluate(() => getComputedStyle(document.getElementById('continue-screen')).display !== 'none');
      check(offered, 'no Continue screen after a reload with a saved run');
      // The restored run waits, paused, on the Continue screen: it must be
      // the saved run to the last field
      const restored = await page.evaluate(() => window.__hs.serialize());
      const differ = Object.keys(live).filter((k) => !same(restored[k], live[k]));
      check(!differ.length, `the restored run differs from the one left in ${differ.join(', ')}`);
      check(await page.evaluate(() => window.__hs.paused), 'the restored run is not waiting for Continue');
      await page.evaluate(() => window.__replay.run(1, [{ f: window.__replay.frame, click: '#continue-btn' }]));
      // And Continue plays it on: the wall timer moves again
      const t0 = await page.evaluate(() => window.__hs.wall.timer);
      await step(page, 30);
      const t1 = await page.evaluate(() => window.__hs.wall.timer);
      check(t1 > t0, 'the restored run is not running after Continue');
      return `${saves.length} wall-advance saves, each equal to the live run; reload -> Continue -> the same run (score ${live.score}, level ${live.level}, wall ${live.wallAdvanceTimer.toFixed(2)} s)`;
    },
  },
  {
    // W2-B: hiding the page suspends the audio and pauses the run, and
    // showing it again does not play the steps missed meanwhile as a burst
    // of notes. Real time here: the audio clock is not virtual.
    name: 'hidden-tab-no-burst',
    async run(page) {
      // A real key press: audio may only start on user activation, which a
      // dispatched event does not carry
      await page.keyboard.press('Space');
      await settle(page);
      const audio = () => page.evaluate(() => ({ state: window.__hsAudio.ctx.state, running: window.__hsAudio.music.running }));
      // Wait (real time) for an audio condition, saying which one failed.
      // Polled on a timer: requestAnimationFrame only fires here when the
      // virtual clock is stepped.
      const until = async (what, fn) => {
        try {
          await page.waitForFunction(fn, null, { timeout: 10_000, polling: 50 });
        } catch {
          throw new Error(`timed out waiting for ${what} (audio: ${JSON.stringify(await audio())})`);
        }
      };
      await until('the audio to start', () => window.__hsAudio.ctx.state === 'running' && window.__hsAudio.music.running);
      await page.evaluate(() => {
        const a = window.__hsAudio;
        window.__notes = [];
        const play = a.music._playStep.bind(a.music);
        a.music._playStep = (s, time) => {
          window.__notes.push({ time, at: a.ctx.currentTime });
          play(s, time);
        };
      });
      await page.waitForTimeout(500);
      check(await page.evaluate(() => window.__notes.length) > 0, 'no music was scheduled before hiding');

      const setHidden = (h) => page.evaluate((hidden) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, h);

      await setHidden(true);
      await until('the audio to suspend', () => window.__hsAudio.ctx.state === 'suspended');
      const paused = await page.evaluate(() => document.getElementById('pause-screen').style.display === 'flex');
      check(paused, 'hiding the page did not pause the run');
      const a1 = await audio();
      check(!a1.running, 'the music scheduler kept running while hidden');
      const n0 = await page.evaluate(() => window.__notes.length);
      await page.waitForTimeout(2_000);
      check(await page.evaluate(() => window.__notes.length) === n0, 'notes were scheduled while hidden');

      await setHidden(false);
      await until('the audio to resume', () => window.__hsAudio.ctx.state === 'running' && window.__hsAudio.music.running);
      await page.waitForTimeout(300);
      const after = await page.evaluate((from) => window.__notes.slice(from), n0);
      const late = after.filter((n) => n.time < n.at - 0.001);
      // 300 ms of music is ~3 16ths at 104 bpm, plus 120 ms of lookahead
      check(late.length === 0, `${late.length} notes scheduled in the past after showing the page`);
      check(after.length <= 6, `${after.length} notes in the first 300 ms after showing the page: a burst`);
      return `hidden 2 s: suspended, paused, 0 notes; shown: ${after.length} notes in 300 ms, none late`;
    },
  },
  {
    // W3-A: a phone that keeps dropping frames (p95 over 20 ms for 3 s)
    // switches to half the debris, half the pool and no shot trail, and
    // stays there. At a steady 60 fps it never does; neither does a
    // stretch of slow frames shorter than that, or a long gap (a hidden
    // page). Frames are slowed by running the virtual clock longer.
    name: 'low-power-fallback',
    async run(page) {
      const setFrameMs = (ms) => page.evaluate((m) => { window.__replay.frameMs = m; }, ms);
      const low = () => page.evaluate(() => window.__hs.lowPower);
      // Fire the cube in hand into lane 0 on top of two of its colour;
      // returns the debris of the clear, and the most trail seen in flight
      const clear = () => page.evaluate(() => {
        const h = window.__hs;
        const rp = window.__replay;
        h.clearBoard();
        h.placeCube(0, 11, 4);
        h.placeCube(0, 10, 4);
        h.setCur({ col: 0, color: 4 });
        rp.run(1, [{ f: rp.frame, key: 'Space' }]);
        let trail = 0;
        for (let i = 0; i < 120; i++) {
          rp.run(1);
          const p = h.particles;
          trail = Math.max(trail, p.trail);
          if (p.debris > 0) return { debris: p.debris, trail, cap: p.cap };
        }
        return null;
      });

      // Steady 60 fps, with 1.5 s of 40 ms frames and a 2 s gap: no. (The
      // p95 is over a 1 s window, so it reads high for up to a second
      // after the slow frames end: 1.5 s of them is 2.5 s over.)
      await step(page, 240);
      await setFrameMs(40);
      await step(page, 37);
      await setFrameMs(1000 / 60);
      await step(page, 120);
      await setFrameMs(2000);
      await step(page, 1);
      await setFrameMs(1000 / 60);
      await step(page, 60);
      check(!(await low()), 'low power at 60 fps with 1.5 s of slow frames and one gap');
      const full = await clear();
      check(full, 'the staged clear threw no debris');
      check(full.trail > 0, 'no shot trail at full power');
      await settle(page);
      await step(page, 150); // the debris dies down

      // 30 fps, as in iOS Low Power Mode: on after 3 s and a few frames
      await setFrameMs(1000 / 30);
      let frames = 0;
      while (!(await low()) && frames < 300) {
        await step(page, 10);
        frames += 10;
      }
      check(await low(), 'still full power after 10 s at 30 fps');
      const secs = (frames / 30).toFixed(1);
      check(frames / 30 >= 3 && frames / 30 <= 3.5, `low power took ${secs} s at 30 fps`);
      await setFrameMs(1000 / 60);
      await step(page, 150);
      const lite = await clear();
      check(lite, 'the staged clear threw no debris in low power');
      check(lite.trail === 0, `${lite.trail} trail particles in low power`);
      check(lite.cap === 120, `the pool's cap is ${lite.cap} in low power`);
      check(Math.abs(lite.debris * 2 - full.debris) <= 3, `debris ${full.debris} at full power, ${lite.debris} in low power`);
      // And it stays: a minute back at 60 fps does not undo it
      await step(page, 600);
      check(await low(), 'low power wore off');
      return `on after ${secs} s at 30 fps; debris ${full.debris} -> ${lite.debris}, trail ${full.trail} -> 0, cap 240 -> 120`;
    },
  },
  {
    // W3-B: the app opens on the front door, today's board is a tap away
    // with unlimited tries, the day's best is kept and shared, and Home
    // goes back to the door. The all-time best is set high so a better try
    // reads as today's best, not the all-time one.
    name: 'front-door',
    door: false,
    async run(page) {
      await page.evaluate(() => localStorage.setItem('hueshot-best', '99999'));
      await page.reload();
      await page.waitForFunction(() => window.__hs && window.__replay, null, { timeout: 15_000 });
      await step(page, 2);
      // Whatever share there is, the text lands here
      await page.evaluate(() => {
        window.__shared = [];
        navigator.share = async ({ text }) => { window.__shared.push(text); };
      });

      check(await shown(page, 'front-door'), 'the app did not open on the front door');
      check(!(await shown(page, 'continue-screen')), 'a fresh launch offered Continue');
      check(await page.evaluate(() => window.__hs.paused && window.__hs.daily), "today's board is not waiting behind the door");
      check(await page.evaluate(() => document.getElementById('door-share').hidden), 'Share offered before the Daily was played');
      // Nothing behind the door may be played, and the door cannot be paused away
      await press(page, 'Space');
      await press(page, 'Escape');
      await step(page, 30);
      check(await page.evaluate(() => !window.__hs.busy && !window.__hs.wall.started), 'a shot was fired through the front door');
      check(await shown(page, 'front-door') && !(await shown(page, 'pause-screen')), 'Escape took the front door down');

      // A losing board: a full lane 3, and the cube in hand fired into it.
      // `clear` first stages a triple in lane 0 to score with.
      const lose = async (clear) => {
        await page.evaluate((withClear) => {
          const h = window.__hs;
          h.clearBoard();
          if (withClear) {
            h.placeCube(0, 11, 4);
            h.placeCube(0, 10, 4);
            h.setCur({ col: 0, color: 4 });
          }
        }, clear);
        if (clear) {
          await press(page, 'Space');
          await settle(page);
        }
        await page.evaluate(() => {
          const h = window.__hs;
          for (let r = 1; r < 12; r++) h.placeCube(3, r, r % 2 ? 1 : 2);
          h.setCur({ col: 3, color: 0 });
        });
        await press(page, 'Space');
        for (let i = 0; i < 120 && !(await hs(page)).gameOver; i++) await step(page, 5);
        check((await hs(page)).gameOver, 'the staged board did not end the run');
      };
      const dailyRecord = () => page.evaluate(() => JSON.parse(localStorage.getItem('hueshot-daily-2026-10-20')));
      const text = (id) => page.evaluate((el) => document.getElementById(el).textContent, id);

      // Try 1 on today's board: 0 points
      await click(page, '#door-daily');
      check(!(await shown(page, 'front-door')) && !(await page.evaluate(() => window.__hs.paused)), "Today's board did not start");
      await lose(false);
      let rec = await dailyRecord();
      check(rec && rec.score === 0 && rec.sketch.length === 3, `try 1 recorded ${JSON.stringify(rec)}`);
      check(await text('final-best-label') === "Today's best", 'the game over does not show the day\'s best');
      check(!(await page.evaluate(() => document.getElementById('share-btn').hidden)), 'no Share after a Daily');

      // Try again: the same board again, and a better score replaces the best
      await click(page, '#restart-btn');
      check(await page.evaluate(() => window.__hs.daily && !window.__hs.gameOver), 'Try again left the Daily');
      await lose(true);
      rec = await dailyRecord();
      check(rec.score === 30, `try 2 scored 30 but the day's best is ${rec.score}`);
      check(await text('new-best') === 'NEW BEST TODAY', `a better try reads "${await text('new-best')}"`);
      // The front row of the sketch is the lane 3 cube that ended the run;
      // lane 3 is the middle of the seven on screen
      check(same(rec.sketch[2], [null, null, null, 0, null, null, null]), `sketch front row ${JSON.stringify(rec.sketch[2])}`);

      // Share: one line and the sketch
      await click(page, '#share-btn');
      await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 5_000 });
      const shared = await page.evaluate(() => window.__shared[0]);
      const lines = shared.split('\n');
      check(lines[0] === 'Hueshot · Oct 20 · 30', `share line "${lines[0]}"`);
      check(lines.length === 4 && lines.slice(1).every((l) => [...l].length === 7), `share sketch ${JSON.stringify(lines.slice(1))}`);
      check(lines[3] === '⬜⬜⬜🟥⬜⬜⬜', `share front row ${lines[3]}`);

      // A worse try keeps the best
      await click(page, '#restart-btn');
      await lose(false);
      check((await dailyRecord()).score === 30, 'a worse try replaced the day\'s best');
      check(await text('final-best') === '30', `the game over shows today's best as ${await text('final-best')}`);

      // Home: the door again, now with the day's best and Share
      await click(page, '#home-btn');
      check(await shown(page, 'front-door'), 'Home did not open the front door');
      check(/Your best 30/.test(await text('door-daily-sub')), `the door reads "${await text('door-daily-sub')}"`);
      check(!(await page.evaluate(() => document.getElementById('door-share').hidden)), 'no Share on the door after a Daily');

      // Endless from the door: no Share at its game over
      await click(page, '#door-endless');
      check(await page.evaluate(() => !window.__hs.daily && !window.__hs.paused), 'Endless did not start');
      await lose(false);
      check(await page.evaluate(() => document.getElementById('share-btn').hidden), 'Share offered after Endless');
      check(await text('final-best-label') === 'Best', 'Endless shows a day\'s best');

      // Pause, Home: the run is dropped, and a reload opens on the door
      await click(page, '#restart-btn');
      await press(page, 'Space');
      await settle(page);
      await press(page, 'Escape');
      await click(page, '#pause-home-btn');
      check(await shown(page, 'front-door') && !(await shown(page, 'pause-screen')), 'Home from pause did not open the door');
      await page.reload();
      await page.waitForFunction(() => window.__hs && window.__replay, null, { timeout: 15_000 });
      await step(page, 2);
      check(await shown(page, 'front-door') && !(await shown(page, 'continue-screen')), 'a run left for Home came back after a reload');
      return 'door -> 3 Daily tries (best 30 kept, shared with its sketch) -> Home -> Endless -> pause -> Home -> reload -> door';
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
        // The app opens on the front door; most checks play Endless from it
        if (c.door !== false) await click(page, '#door-endless');
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
