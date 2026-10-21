// ─── Frame meter (?debug=1 only) ─────────────────────────────────────────────
// How long each frame keeps the main thread busy: from the first
// requestAnimationFrame callback of the frame to the end of renderer.render.
// That is the number the frame budget is about (p95 under 12 ms during a
// 10-cube chain, docs/APPSTORE_PLAN.md Phase 4); the interval between frames
// is pinned to the display's refresh and says nothing about headroom.
//
// Drawn as a small histogram in the bottom-left corner, and readable from the
// console or a harness as window.__hsPerf. "LOW" on the meter means the
// frame-budget fallback (budget.js) has engaged.
//
// __hsPerf.bench() is the on-device measurement: from Safari's Web Inspector
// on an iPhone (see the README), `await __hsPerf.bench()` plays the same
// staged chain as `npm run perf` and returns the numbers to paste.

import { DEBUG } from '../debug.js';
import { isLowPower, suspendWatch, LIMIT_MS } from './budget.js';

const WINDOW = 600; // samples kept: 10 s at 60 fps
const BARS = 60; // the most recent frames, one bar each
const SCALE_MS = 25; // full height of the graph
const BUDGET_MS = 12;
const REFRESH_MS = 1000 / 60;

// The bench's chain: far wall first; firing R (0) into lane 3 clears five
// R, and the G pairs above them drop into two G triples. 11 cubes, x2.
const BENCH_BOARD = ['GRR.RRG', 'BGG.GGB', 'RBY.YBR'];
const BENCH_POINTS = 5 * 10 + 6 * 10 * 2;

function summarize(list) {
  const s = [...list].sort((a, b) => a - b);
  const at = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.length ? s[s.length - 1] : 0 };
}

const round1 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function installFrameMeter(scene) {
  if (!DEBUG) return;

  const samples = new Float32Array(WINDOW);
  let head = 0;
  let filled = 0;
  let frameStart = null;
  let lastStart = null;
  let frames = 0;
  // While the bench runs: every frame's work and the interval before it
  let sink = null;

  // The frame's clock starts in a requestAnimationFrame callback of our own.
  // Callbacks run in the order they were requested, and this one is first
  // requested while the render modules load, before main.js starts its
  // loop; it re-requests itself first thing, so it stays ahead of the game
  // loop in every frame.
  const tick = () => {
    requestAnimationFrame(tick);
    frameStart = performance.now();
    if (sink && lastStart !== null) sink.interval.push(frameStart - lastStart);
    lastStart = frameStart;
  };
  requestAnimationFrame(tick);

  // Plain DOM, no canvas: a text line and one div per bar, each scaled with
  // a transform. Redrawn every 10 frames.
  const panel = document.createElement('div');
  panel.id = 'frame-meter';
  Object.assign(panel.style, {
    position: 'fixed',
    left: 'calc(8px + env(safe-area-inset-left))',
    bottom: 'calc(8px + env(safe-area-inset-bottom))',
    width: '168px',
    padding: '4px 5px 3px',
    borderRadius: '6px',
    background: 'rgba(20, 18, 16, 0.72)',
    color: '#fff',
    font: '600 11px ui-monospace, monospace',
    pointerEvents: 'none',
    zIndex: 100,
  });
  const label = document.createElement('div');
  const graph = document.createElement('div');
  Object.assign(graph.style, {
    position: 'relative', height: '32px', marginTop: '3px', display: 'flex', alignItems: 'flex-end', gap: '1px',
  });
  const budgetLine = document.createElement('div');
  Object.assign(budgetLine.style, {
    position: 'absolute', left: 0, right: 0, bottom: `${(BUDGET_MS / SCALE_MS) * 100}%`,
    height: '1px', background: 'rgba(255,255,255,0.45)',
  });
  const bars = [];
  for (let i = 0; i < BARS; i++) {
    const bar = document.createElement('div');
    Object.assign(bar.style, { flex: '1', height: '100%', transformOrigin: 'bottom', transform: 'scaleY(0)' });
    graph.appendChild(bar);
    bars.push(bar);
  }
  graph.appendChild(budgetLine);
  panel.append(label, graph);
  document.body.appendChild(panel);

  function ordered() {
    const out = [];
    for (let i = 0; i < filled; i++) out.push(samples[(head - filled + i + WINDOW) % WINDOW]);
    return out;
  }

  function stats() {
    return summarize(ordered());
  }

  function draw() {
    const recent = ordered().slice(-BARS);
    const offset = BARS - recent.length;
    bars.forEach((bar, i) => {
      const ms = i < offset ? 0 : recent[i - offset];
      bar.style.transform = `scaleY(${Math.min(1, ms / SCALE_MS)})`;
      bar.style.background = ms > REFRESH_MS ? '#f25f5c' : ms > BUDGET_MS ? '#ffb020' : '#2ec4b6';
    });
    const { p95, max } = stats();
    label.textContent = `p95 ${p95.toFixed(1)}  max ${max.toFixed(1)} ms${isLowPower() ? '  LOW' : ''}`;
  }

  const prevAfter = scene.onAfterRender;
  scene.onAfterRender = (...args) => {
    prevAfter.apply(scene, args);
    if (frameStart === null) return;
    const work = performance.now() - frameStart;
    if (sink) sink.work.push(work);
    samples[head] = work;
    head = (head + 1) % WINDOW;
    filled = Math.min(WINDOW, filled + 1);
    frameStart = null;
    if (++frames % 10 === 0) draw();
  };

  // The staged chain of scripts/perf.mjs, `chains` times, timing every frame
  // for `seconds` after each shot: the work in it (as the meter) and the
  // interval before it (what the player sees, GPU included). The fallback
  // is held off meanwhile, so this is the full effects throughout; the
  // result says whether the fallback would have engaged.
  async function bench({ chains = 6, seconds = 3 } = {}) {
    const hs = window.__hs;
    if (!hs) throw new Error('bench: no debug hook');
    if (hs.frontDoor) document.getElementById('door-endless').click();
    else if (hs.gameOver) document.getElementById('restart-btn').click();
    else if (hs.paused) document.getElementById('continue-btn').click();
    await wait(500);
    const cells = [];
    BENCH_BOARD.forEach((line, i) => [...line].forEach((ch, col) => {
      if (ch !== '.') cells.push({ col, row: 11 - i, color: 'RGBYM'.indexOf(ch) });
    }));
    const work = [];
    const interval = [];
    const perChain = [];
    suspendWatch(true);
    try {
      for (let i = 0; i < chains; i++) {
        hs.clearBoard();
        for (const { col, row, color } of cells) hs.placeCube(col, row, color);
        hs.setCur({ col: 3, color: 0 });
        await wait(400);
        const before = hs.score;
        sink = { work: [], interval: [] };
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        await wait(seconds * 1000);
        const run = sink;
        sink = null;
        if (hs.score - before !== BENCH_POINTS) {
          throw new Error(`bench: chain ${i + 1} scored ${hs.score - before}, not ${BENCH_POINTS}; is the run paused or over?`);
        }
        work.push(...run.work);
        interval.push(...run.interval);
        perChain.push(round1({ workP95: summarize(run.work).p95, intervalP95: summarize(run.interval).p95 }));
        hs.clearBoard();
        await wait(500);
      }
    } finally {
      sink = null;
      suspendWatch(false);
    }
    const iv = summarize(interval);
    return {
      work: round1(summarize(work)),
      interval: round1(iv),
      wouldFallBack: iv.p95 > LIMIT_MS,
      lowPower: isLowPower(),
      perChain,
      screen: `${innerWidth}x${innerHeight} @${devicePixelRatio}x`,
      userAgent: navigator.userAgent,
    };
  }

  window.__hsPerf = {
    // Milliseconds of main-thread work per frame, oldest first
    samples: ordered,
    stats,
    reset() {
      head = 0;
      filled = 0;
    },
    get lowPower() { return isLowPower(); },
    bench,
  };
}
