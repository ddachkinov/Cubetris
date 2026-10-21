// ─── Frame budget fallback ───────────────────────────────────────────────────
// docs/APPSTORE_PLAN.md, iOS shipping requirements: "Low-power mode: if p95
// > 20 ms for 3 s, halve particle count and disable trails at runtime." A
// phone that cannot hold 60 fps with every effect on (an iPhone SE 2 in the
// middle of a chain, or any iPhone in Low Power Mode, where WebKit runs
// animation frames at 30 fps) switches to lighter effects for the rest of
// the session rather than stutter. Nothing about the rules changes.
//
// Measured on the interval between animation frames, not the work inside
// one (that is what the ?debug=1 meter in perf.js shows): a frame the GPU
// delivers late is as much a dropped frame as one the main thread is late
// with, and only the interval shows both.
//
// ?lowpower=1 starts in low power and ?lowpower=0 never enters it, for
// measuring either look on purpose (scripts/perf.mjs and scripts/shoot.mjs
// pin it off, so their numbers and pictures are the full effects).

// p95 is taken over the last second of frames, and has to stay over the
// limit for three seconds on end: a chain's hitch passes, a phone that
// cannot keep up does not.
export const LIMIT_MS = 20; // a frame slower than this was dropped at 60 fps
export const SUSTAIN_MS = 3000;
const WINDOW_MS = 1000;
const SLOW_SHARE = 0.05; // p95 over the limit: more than 5% of frames over it
// A gap this long is a stall (a hidden page, the app switcher, a debugger
// breakpoint), not a slow frame: it starts the window over
const STALL_MS = 250;

const pinned = new URLSearchParams(location.search).get('lowpower');
let lowPower = pinned === '1';
let suspended = pinned === '0';

// The window: frame intervals oldest first, their sum, and how many are
// slow; and how long its p95 has been over the limit without a break
const intervals = [];
let spanMs = 0;
let slowCount = 0;
let overMs = 0;

const listeners = [];

// Called with fn(true) when the fallback engages, and right away if it
// already has
export function onLowPower(fn) {
  listeners.push(fn);
  if (lowPower) fn(true);
}

export function isLowPower() {
  return lowPower;
}

function startOver() {
  intervals.length = 0;
  spanMs = 0;
  slowCount = 0;
  overMs = 0;
}

// Once per animation frame, with the milliseconds since the previous one
export function watchFrame(ms) {
  if (lowPower || suspended) return;
  if (ms > STALL_MS) {
    startOver();
    return;
  }
  intervals.push(ms);
  spanMs += ms;
  if (ms > LIMIT_MS) slowCount++;
  // Keep exactly the frames that span the last WINDOW_MS
  while (spanMs - intervals[0] >= WINDOW_MS) {
    const old = intervals.shift();
    spanMs -= old;
    if (old > LIMIT_MS) slowCount--;
  }
  const over = spanMs >= WINDOW_MS && slowCount > intervals.length * SLOW_SHARE;
  overMs = over ? overMs + ms : 0;
  if (overMs >= SUSTAIN_MS) {
    lowPower = true;
    startOver();
    for (const fn of listeners) fn(true);
  }
}

// The bench (perf.js) holds the watch off while it measures, so that what
// it measures is the full effects all the way through
export function suspendWatch(on) {
  suspended = on || pinned === '0';
  startOver();
}
