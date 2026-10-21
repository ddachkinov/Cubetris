// ─── Frame meter (?debug=1 only) ─────────────────────────────────────────────
// How long each frame keeps the main thread busy: from the first
// requestAnimationFrame callback of the frame to the end of renderer.render.
// That is the number the frame budget is about (p95 under 12 ms during a
// 10-cube chain, docs/APPSTORE_PLAN.md Phase 4); the interval between frames
// is pinned to the display's refresh and says nothing about headroom.
//
// Drawn as a small histogram in the bottom-left corner, and readable from the
// console or a harness as window.__hsPerf.

const WINDOW = 600; // samples kept: 10 s at 60 fps
const BARS = 60; // the most recent frames, one bar each
const SCALE_MS = 25; // full height of the graph
const BUDGET_MS = 12;
const REFRESH_MS = 1000 / 60;

export function installFrameMeter(scene) {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;

  const samples = new Float32Array(WINDOW);
  let head = 0;
  let filled = 0;
  let frameStart = null;
  let frames = 0;

  // The frame's clock starts in a requestAnimationFrame callback of our own.
  // Callbacks run in the order they were requested, and this one is first
  // requested while the render modules load, before main.js starts its
  // loop; it re-requests itself first thing, so it stays ahead of the game
  // loop in every frame.
  const tick = () => {
    requestAnimationFrame(tick);
    frameStart = performance.now();
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
    font: '600 11px ui-monospace, Menlo, monospace',
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
    const s = ordered().sort((a, b) => a - b);
    const at = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
    return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.length ? s[s.length - 1] : 0 };
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
    label.textContent = `p95 ${p95.toFixed(1)}  max ${max.toFixed(1)} ms`;
  }

  const prevAfter = scene.onAfterRender;
  scene.onAfterRender = (...args) => {
    prevAfter.apply(scene, args);
    if (frameStart === null) return;
    samples[head] = performance.now() - frameStart;
    head = (head + 1) % WINDOW;
    filled = Math.min(WINDOW, filled + 1);
    frameStart = null;
    if (++frames % 10 === 0) draw();
  };

  window.__hsPerf = {
    // Milliseconds of main-thread work per frame, oldest first
    samples: ordered,
    stats,
    reset() {
      head = 0;
      filled = 0;
    },
  };
}
