// ─── State ───────────────────────────────────────────────────────────────────
// Everything a run is made of, in one object. The game flow in main.js writes
// it (input.js only moves the aim); render and HUD just read it.

import { GRID_COLS, mulberry32 } from './rules.js';

export const state = {
  // Progression
  level: 1,
  totalClearedCount: 0,

  // Two seeded streams, one deals the queue and one builds the board: by
  // the date for a Daily (dailyRngs), afresh for each Endless run
  // (endlessRngs)
  queueRng: Math.random,
  wallRng: Math.random,
  dailyMode: false,

  // Bag-based colour dealing, see drawColorFromBag()
  bag: { colors: [], count: 0 },

  // grid[col][row] = { mesh, colorIndex } or null; row 0 is the player's row
  grid: [],
  currentCol: Math.floor(GRID_COLS / 2),
  currentColorIndex: 0,
  nextQueue: [],
  heldColorIndex: null,
  holdUsedThisTurn: false,
  shootingCube: null,
  shootingVelocity: null,
  // Pressed while a shot is in flight or a cascade resolves; fired after
  queuedShot: false,
  score: 0,
  gameOver: false,
  gameOverAt: 0,
  paused: false,
  wallAdvanceTimer: 0,
  // The wall doesn't start closing in until the player fires their first
  // shot -- a board that starts advancing before you've touched it teaches
  // the wrong lesson in the first second.
  wallStarted: false,

  // Hit-freeze and clutch slow-mo bend game time, so they count as state
  freezeTimer: 0,
  slowMoTimer: 0,

  // Dynamic intensity: 0-1, spikes on chains and decays
  intensityLevel: 0,
  lastChainStep: 0,
  dangerActive: false,

  // The cascade being resolved, one step per beat (see runCascadeStep)
  cascade: null,
  cascadeTimer: 0,

  // Run stats (per run). Badges and Zone were cut in the App Store rework:
  // a hidden "save me" power-up and eight toasts with no screen to view them
  // added a system without adding a reason to come back.
  runStats: { bestChain: 0, cleared: 0, clutches: 0 },
};

// ─── Save / restore ──────────────────────────────────────────────────────────
// A run as plain JSON, enough to put it back exactly as it was between
// shots. What is in flight (a cube mid-air, a cascade mid-step, a shot
// buffered to go after them) is not saved, so save only when the run is not
// busy; tweens, particles and the camera shake are cosmetic and start
// fresh. Version 2 stores both random streams (the queue's and the wall's,
// see dailyRngs and endlessRngs). An Endless run saved before it had streams
// of its own dealt from Math.random; it saves null for them and resumes on
// Math.random.
export const SAVE_VERSION = 2;

// A shot in flight, a cascade still resolving, or a shot buffered to go
// after them. The debug hook's `busy` is the same test.
export function isBusy(s = state) {
  return !!(s.shootingCube || s.cascade || s.queuedShot);
}

const rngState = (rng) => (rng.state ? rng.state() : null);
const resumeRng = (saved) => (saved === null ? Math.random : mulberry32(saved));

export function serialize(s = state) {
  if (isBusy(s)) throw new Error('serialize: a shot or cascade is still resolving');
  return {
    v: SAVE_VERSION,
    level: s.level,
    totalClearedCount: s.totalClearedCount,
    dailyMode: s.dailyMode,
    queueRng: rngState(s.queueRng),
    wallRng: rngState(s.wallRng),
    bag: { colors: [...s.bag.colors], count: s.bag.count },
    grid: s.grid.map((lane) => lane.map((cell) => (cell ? cell.colorIndex : null))),
    currentCol: s.currentCol,
    currentColorIndex: s.currentColorIndex,
    nextQueue: [...s.nextQueue],
    heldColorIndex: s.heldColorIndex,
    holdUsedThisTurn: s.holdUsedThisTurn,
    score: s.score,
    wallAdvanceTimer: s.wallAdvanceTimer,
    wallStarted: s.wallStarted,
    freezeTimer: s.freezeTimer,
    slowMoTimer: s.slowMoTimer,
    runStats: { ...s.runStats },
  };
}

// Writes a saved run into `s`. Grid cells come back without meshes; the
// caller builds those.
export function deserialize(data, s = state) {
  if (data.v !== SAVE_VERSION) throw new Error(`deserialize: unknown save version ${data.v}`);
  s.level = data.level;
  s.totalClearedCount = data.totalClearedCount;
  s.dailyMode = data.dailyMode;
  s.queueRng = resumeRng(data.queueRng);
  s.wallRng = resumeRng(data.wallRng);
  s.bag = { colors: [...data.bag.colors], count: data.bag.count };
  s.grid = data.grid.map((lane) => lane.map((c) => (c === null ? null : { mesh: null, colorIndex: c })));
  s.currentCol = data.currentCol;
  s.currentColorIndex = data.currentColorIndex;
  s.nextQueue = [...data.nextQueue];
  s.heldColorIndex = data.heldColorIndex;
  s.holdUsedThisTurn = data.holdUsedThisTurn;
  s.score = data.score;
  s.wallAdvanceTimer = data.wallAdvanceTimer;
  s.wallStarted = data.wallStarted;
  s.freezeTimer = data.freezeTimer;
  s.slowMoTimer = data.slowMoTimer;
  s.runStats = { ...data.runStats };

  s.shootingCube = null;
  s.shootingVelocity = null;
  s.queuedShot = false;
  s.cascade = null;
  s.cascadeTimer = 0;
  s.gameOver = false;
  s.paused = false;
  return s;
}
