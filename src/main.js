// ─── Hueshot ─────────────────────────────────────────────────────────────────
// The game flow (shooting, cascades, the wall, levels, game over, restart)
// and the frame loop. Rules live in game/rules.js, the run's state in
// game/state.js; render/, audio/, ui/ and input.js are the outputs and
// inputs around them.

import { THEMES } from './themes.js';
import {
  GRID_COLS, GRID_ROWS, SHOOT_SPEED, ROW_CLEAR_BONUS,
  activeColorCount, wallInterval, levelForClears, themeIndexForLevel,
  mulberry32, dailySeed, randomColorIndex, generateWallRow, seedOpeningRows,
  landingRow, reachedFront, isInDanger, computeRemovalSet, fullRowCount, gravityMoves,
} from './game/rules.js';
import { state, serialize, deserialize } from './game/state.js';
import { todayKey, loadBest, saveBest, loadLifeStats, saveLifeStats, recordDailyScore } from './persistence.js';
import {
  music, playLevelUpSound, playBombSound, playRowClearSound, playHeartbeat, playLandSound,
  playWallPushSound, playClutchSound, playChainSound, playTickSound,
} from './audio/sfx.js';
import {
  DEPTH_CELL, scene, renderer, gameGroup, colToX, rowToZ, disposeMesh,
  createGroundPlane, createGridVisual, applyEnvironment, setIntensityLighting,
} from './render/scene.js';
import { camera, fitCamera, triggerShake, resetShake, updateCamera } from './render/camera.js';
import { setPalette } from './render/palette.js';
import {
  spawnCube, createCubeMesh, updateColumnHighlight, updateGhost, pulseGhost, updateSpawnCube,
  popSpawnCube, updateSpawnPop, recolorCubes, startSquash, updateLandingAnims, pushWallAnim,
  cancelWallAnimFor, updateWallAnims, resetCubeAnims, updateSpecialCubeVisuals, sweepStrayCubes,
} from './render/cubes.js';
import {
  spawnParticles, updateParticles, clearDebris, updateTrailParticles, emitShotTrail, clearTrail,
} from './render/particles.js';
import {
  setScore, setBest, setLevel, spawnScorePopup, resetAnnouncer, showChainCounter,
  showLevelUpBanner, showRowClearBanner, showClutchBanner, triggerFlash, updateFlash, isFlashing,
  resetFlash, updateNextPreview, updateHoldPreview, showWallTimer, hideWallWarning, resetWallTimer,
  setDanger, setDailyIndicator, showGameOver, showPause, hideOverlays, updateHint, resetIdle,
} from './ui/hud.js';
import { hapticPulse } from './ui/haptics.js';
import { initInput, resetAim } from './input.js';

// ─── Progress that outlives a run ────────────────────────────────────────────
let highScore = loadBest();
const lifeStats = loadLifeStats();
let currentThemeIndex = -1;

// Next cube for the hand: from the bag, or a special at higher levels
function dealColor() {
  return randomColorIndex(state.bag, state.level, state.rng);
}

state.currentColorIndex = dealColor();
state.nextQueue = [dealColor(), dealColor(), dealColor()];

setBest(highScore);

// ─── Theme application (Lumines-style skins, rotate every 3 levels) ──────────
function applyTheme(idx) {
  const theme = THEMES[idx % THEMES.length];
  currentThemeIndex = idx % THEMES.length;

  applyEnvironment(theme);

  // Swap the cube palette (same 5 hue families, theme-tinted) and recolor
  // every existing normal cube on the board
  setPalette(theme.palette);
  recolorCubes();

  music.setTheme(theme.music);

  updateSpawnCube();
  updateNextPreview();
  updateHoldPreview();
  updateGhost();
}

// ─── Grid ────────────────────────────────────────────────────────────────────
function initGrid() {
  state.grid = [];
  for (let c = 0; c < GRID_COLS; c++) {
    state.grid[c] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      state.grid[c][r] = null;
    }
  }
}

function placeCube(col, row, colorIndex) {
  if (row < 0 || row >= GRID_ROWS) return null;
  const mesh = createCubeMesh(colorIndex);
  mesh.position.set(colToX(col), 0, rowToZ(row));
  gameGroup.add(mesh);
  state.grid[col][row] = { mesh, colorIndex };
  return state.grid[col][row];
}

function removeCube(col, row) {
  const cell = state.grid[col][row];
  if (!cell) return;
  cancelWallAnimFor(cell.mesh);
  disposeMesh(cell.mesh);
  state.grid[col][row] = null;
}

// A guaranteed first clear, see seedOpeningRows()
function placeOpeningSeeds() {
  const seeds = seedOpeningRows(state.rng, state.currentColorIndex, state.nextQueue[0]);
  for (const { col, row, colorIndex } of seeds) placeCube(col, row, colorIndex);
}

// ─── Juice ───────────────────────────────────────────────────────────────────
// Hit-freeze: pause game updates briefly on big clears
function triggerFreeze(duration) {
  state.freezeTimer = Math.max(state.freezeTimer, duration);
}

// Danger = any cube within 2 rows of the front. Clearing your way out of
// danger is a "clutch" — slow-mo celebration + bonus. These near-death saves
// are the moments players remember and talk about.
function triggerClutch() {
  state.slowMoTimer = 0.7;
  const bonus = 150;
  addPoints(bonus);
  state.runStats.clutches++;

  playClutchSound();
  triggerFlash(0x66ffe0, 0.2);
  triggerShake(0.18, 0.3);
  hapticPulse(40);
  showClutchBanner(bonus);
}

function updateDynamicIntensity(dt, chainStep) {
  // Intensity spikes on chains, decays over time
  const targetIntensity = Math.min(1, chainStep * 0.25);
  if (targetIntensity > state.intensityLevel) {
    state.intensityLevel = targetIntensity;
  } else {
    state.intensityLevel = Math.max(0, state.intensityLevel - dt * 0.3);
  }

  setIntensityLighting(state.intensityLevel);
  updateFlash(dt);

  // Drive the music stems: combos and danger both push the mix harder
  music.setIntensity(Math.max(state.intensityLevel, state.dangerActive ? 0.55 : 0));
  music.update(dt);
}

// ─── Level progression ───────────────────────────────────────────────────────
function checkLevelUp(clearedThisAction) {
  state.totalClearedCount += clearedThisAction;
  const newLevel = levelForClears(state.totalClearedCount);
  if (newLevel > state.level) {
    state.level = newLevel;
    setLevel(state.level);

    // Rotate theme every 3 levels — the level-up becomes an audiovisual reveal
    const themeIdx = themeIndexForLevel(state.level, THEMES.length);
    const themeChanged = themeIdx !== currentThemeIndex;
    if (themeChanged) applyTheme(themeIdx);

    // Tension-release pacing: level-up buys a calm breather before the
    // next wall advance (negative timer = extra time)
    state.wallAdvanceTimer = Math.min(state.wallAdvanceTimer, -4);

    playLevelUpSound();
    triggerShake(0.15, 0.3);
    showLevelUpBanner(state.level, themeChanged ? THEMES[themeIdx].name : null);
  }
}

function addPoints(n) {
  state.score += n;
  setScore(state.score);
}

// ─── Cascade sequencing ───────────────────────────────────────────────────────
// A chain used to resolve in one synchronous loop: every step's matches,
// removals, and gravity happened inside a single animation frame, so a x4
// chain read as one big explosion and the chain counter only ever showed
// the final step. Now each step is a beat: cubes clear, gravity eases them
// down over 120ms, then there's a matching pause before the next step is
// scanned — 180ms cadence in total, so a real chain plays as a sequence of
// events instead of a single frame of noise.
const CASCADE_STEP_SECONDS = 0.18;
const CASCADE_FALL_SPEED = 1 / 0.12; // 120ms fall, expressed the way pushWallAnim wants it

function beginCascade(onDone) {
  state.cascade = {
    dangerBefore: isInDanger(state.grid),
    totalCleared: 0,
    chainStep: 0,
    totalRowClears: 0,
    anyBombsDetonated: false,
    onDone,
  };
  runCascadeStep();
}

function runCascadeStep() {
  const { grid, cascade } = state;
  const { toRemove, anyBombsDetonated } = computeRemovalSet(grid);
  if (toRemove.size === 0) {
    finishCascade();
    return;
  }

  cascade.chainStep++;
  if (anyBombsDetonated) cascade.anyBombsDetonated = true;

  const rowClearsThisStep = fullRowCount(toRemove);
  cascade.totalRowClears += rowClearsThisStep;

  let sumX = 0, sumZ = 0, count = 0;
  toRemove.forEach((key) => {
    const [c, r] = key.split(',').map(Number);
    const cell = grid[c][r];
    if (cell) {
      sumX += colToX(c);
      sumZ += rowToZ(r);
      count++;
      spawnParticles(c, r, cell.colorIndex);
      removeCube(c, r);
      cascade.totalCleared++;
    }
  });

  if (count > 0) {
    const points = count * 10 * cascade.chainStep;
    const isCombo = cascade.chainStep > 1;
    addPoints(points);
    spawnScorePopup(sumX / count, sumZ / count, isCombo ? `+${points} x${cascade.chainStep}` : `+${points}`, isCombo ? 'combo' : '');
    if (isCombo) {
      playChainSound(cascade.chainStep);
      showChainCounter(cascade.chainStep);
      if (cascade.chainStep >= 3) triggerFlash(0xff66ff, 0.15 + cascade.chainStep * 0.05);
    }
    if (count >= 5 || isCombo) {
      triggerFreeze(0.08);
      triggerShake(0.12 + cascade.chainStep * 0.06, 0.2 + cascade.chainStep * 0.05);
    } else {
      triggerShake(0.06, 0.12);
    }
    if (cascade.totalCleared >= 8) triggerFlash(0xffffff, 0.2);
  }

  if (rowClearsThisStep > 0) {
    addPoints(rowClearsThisStep * ROW_CLEAR_BONUS);
    playRowClearSound();
    showRowClearBanner(rowClearsThisStep);
    triggerShake(0.25, 0.35);
    triggerFreeze(0.1);
  }

  state.lastChainStep = cascade.chainStep;
  applyGravityTweened(CASCADE_FALL_SPEED);

  state.cascadeTimer = CASCADE_STEP_SECONDS;
}

// Gravity, but tweened instead of teleported: grid state (the source of
// truth for matching) updates immediately, the mesh position eases into
// place over `speed`-controlled seconds. Reuses the wall-push tween array —
// same mechanism, just faster — so a mesh mid-fall never fights a mesh
// mid-wall-push (cancelWallAnimFor already guards exactly that overlap).
function applyGravityTweened(speed) {
  const { grid } = state;
  for (const { col, from, to } of gravityMoves(grid)) {
    grid[col][to] = grid[col][from];
    grid[col][from] = null;
    pushWallAnim(grid[col][to].mesh, rowToZ(to), speed);
  }
}

function updateCascade(dt) {
  if (!state.cascade) return;
  state.cascadeTimer -= dt;
  if (state.cascadeTimer <= 0) runCascadeStep();
}

function finishCascade() {
  const { totalCleared, chainStep, totalRowClears, anyBombsDetonated, dangerBefore, onDone } = state.cascade;
  state.cascade = null;

  if (anyBombsDetonated) playBombSound();

  if (totalCleared > 0) {
    const { runStats } = state;
    runStats.cleared += totalCleared;
    lifeStats.cleared = (lifeStats.cleared || 0) + totalCleared;
    if (chainStep > runStats.bestChain) runStats.bestChain = chainStep;
    if (chainStep > (lifeStats.bestChain || 0)) lifeStats.bestChain = chainStep;
    saveLifeStats(lifeStats);

    checkLevelUp(totalCleared);

    if (dangerBefore && !isInDanger(state.grid)) triggerClutch();
  }

  onDone(totalCleared, chainStep, totalRowClears);
}

// ─── Shooting ────────────────────────────────────────────────────────────────
function shoot() {
  if (state.gameOver || state.paused) return;
  // Mid-flight input is buffered rather than dropped: at 40 u/s a shot lands
  // in ~300ms, and swallowing a press in that window feels like a missed
  // tap. Also buffered while a cascade is still resolving -- firing a
  // second cube mid-chain would try to start a second cascade on top of
  // the first one and corrupt both.
  if (state.shootingCube || state.cascade) {
    state.queuedShot = true;
    return;
  }

  const row = landingRow(state.grid, state.currentCol);
  if (row < 0) return;

  state.wallStarted = true;

  const mesh = createCubeMesh(state.currentColorIndex);
  mesh.position.set(colToX(state.currentCol), 0, spawnCube.position.z);
  gameGroup.add(mesh);

  state.shootingCube = {
    mesh,
    col: state.currentCol,
    targetRow: row,
    colorIndex: state.currentColorIndex,
  };
  state.shootingVelocity = SHOOT_SPEED;

  state.currentColorIndex = state.nextQueue.shift();
  state.nextQueue.push(dealColor());
  state.holdUsedThisTurn = false;
  updateSpawnCube();
  updateNextPreview();
}

// ─── Hold / swap ─────────────────────────────────────────────────────────────
// Bank the current cube for later; once per shot to prevent infinite cycling.
function holdSwap() {
  if (state.gameOver || state.paused || state.shootingCube || state.holdUsedThisTurn) return;
  if (state.heldColorIndex === null) {
    state.heldColorIndex = state.currentColorIndex;
    state.currentColorIndex = state.nextQueue.shift();
    state.nextQueue.push(dealColor());
  } else {
    const t = state.heldColorIndex;
    state.heldColorIndex = state.currentColorIndex;
    state.currentColorIndex = t;
  }
  state.holdUsedThisTurn = true;
  popSpawnCube();
  playTickSound();
  hapticPulse(15);
  updateSpawnCube();
  updateGhost();
  updateNextPreview();
  updateHoldPreview();
}

function updateShooting(dt) {
  const shot = state.shootingCube;
  if (!shot) return;

  const freshRow = landingRow(state.grid, shot.col);
  if (freshRow < 0) {
    disposeMesh(shot.mesh);
    state.shootingCube = null;
    state.shootingVelocity = null;
    checkGameOver();
    return;
  }
  shot.targetRow = freshRow;

  const targetZ = rowToZ(shot.targetRow);
  shot.mesh.position.z += state.shootingVelocity * dt;

  if (shot.mesh.position.z >= targetZ) {
    shot.mesh.position.z = targetZ;

    disposeMesh(shot.mesh);

    const cell = placeCube(shot.col, shot.targetRow, shot.colorIndex);
    if (cell) startSquash(cell.mesh);
    playLandSound();

    state.shootingCube = null;
    state.shootingVelocity = null;

    beginCascade(() => {
      checkGameOver();
      if (state.queuedShot) {
        state.queuedShot = false;
        if (!state.gameOver) shoot();
      }
    });
  }
}

// ─── Wall advancement ────────────────────────────────────────────────────────
function advanceWall() {
  if (reachedFront(state.grid)) {
    triggerGameOver();
    return;
  }

  // The wall grinding forward is an EVENT: rumble + shake + tweened motion
  playWallPushSound();
  triggerShake(0.08, 0.3);

  const { grid } = state;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      grid[c][r] = grid[c][r + 1];
      if (grid[c][r]) {
        pushWallAnim(grid[c][r].mesh, rowToZ(r));
      }
    }
    grid[c][GRID_ROWS - 1] = null;
  }

  const wallRow = generateWallRow(state.rng, activeColorCount(state.level));
  for (let c = 0; c < GRID_COLS; c++) {
    const cell = placeCube(c, GRID_ROWS - 1, wallRow[c]);
    if (cell) {
      // New row slides in from behind the back wall with a pop
      cell.mesh.position.z = rowToZ(GRID_ROWS - 1) + DEPTH_CELL;
      pushWallAnim(cell.mesh, rowToZ(GRID_ROWS - 1));
      startSquash(cell.mesh);
    }
  }

  beginCascade(() => {
    checkGameOver();
  });
}

// ─── Game Over ───────────────────────────────────────────────────────────────
function checkGameOver() {
  if (reachedFront(state.grid)) triggerGameOver();
}

function triggerGameOver() {
  const { score, runStats } = state;
  state.gameOver = true;
  state.gameOverAt = performance.now();
  state.queuedShot = false;

  const isNewBest = score > highScore;
  if (isNewBest) {
    highScore = score;
    saveBest(highScore);
    setBest(highScore);
  }

  // Run recap — defeat should still feel like progress
  lifeStats.games = (lifeStats.games || 0) + 1;
  saveLifeStats(lifeStats);
  const recap = `Best chain x${Math.max(1, runStats.bestChain)} • ${runStats.cleared} cubes • Level ${state.level}`
    + (runStats.clutches ? ` • ${runStats.clutches} clutch` : '');

  // Daily challenge result
  const daily = state.dailyMode
    ? `📅 Daily ${todayKey()} — Best: ${recordDailyScore(todayKey(), score)}`
    : null;

  if (state.dangerActive) {
    state.dangerActive = false;
    setDanger(false);
  }

  showGameOver({ score, best: highScore, isNewBest, recap, daily });
}

// Take every cube off the board
function clearBoard() {
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) removeCube(c, r);
  }
}

function restartGame(asDaily = false) {
  // Daily runs use a date-seeded PRNG — everyone gets the same board today
  state.dailyMode = !!asDaily;
  state.rng = state.dailyMode ? mulberry32(dailySeed(todayKey())) : Math.random;
  state.bag = { colors: [], count: 0 };
  setDailyIndicator(state.dailyMode);

  clearBoard();
  clearDebris();

  if (state.shootingCube) {
    disposeMesh(state.shootingCube.mesh);
    state.shootingCube = null;
  }

  sweepStrayCubes();

  state.score = 0;
  setScore(0);
  state.gameOver = false;
  state.paused = false;
  state.wallAdvanceTimer = 0;
  state.currentCol = Math.floor(GRID_COLS / 2);

  clearTrail();

  // Reset juice
  resetShake();
  state.freezeTimer = 0;
  resetFlash();
  state.intensityLevel = 0;
  state.lastChainStep = 0;

  // Reset cascade + announcer state
  state.cascade = null;
  state.cascadeTimer = 0;
  resetAnnouncer();

  // Reset danger / clutch
  state.slowMoTimer = 0;
  if (state.dangerActive) {
    state.dangerActive = false;
    setDanger(false);
  }

  // Reset input + timer state
  state.queuedShot = false;
  resetAim();
  resetIdle();
  resetWallTimer();

  resetCubeAnims();

  state.runStats = { bestChain: 0, cleared: 0, clutches: 0 };

  // Reset progression (theme 0 restores environment + palette + music)
  state.level = 1;
  state.totalClearedCount = 0;
  setLevel(1);
  applyTheme(0);

  state.currentColorIndex = dealColor();
  state.nextQueue = [dealColor(), dealColor(), dealColor()];
  state.heldColorIndex = null;
  state.holdUsedThisTurn = false;

  updateSpawnCube();
  updateColumnHighlight();
  updateNextPreview();
  updateHoldPreview();
  updateGhost();

  fitCamera();

  hideOverlays();

  initGrid();
  placeOpeningSeeds();
  state.wallStarted = false;
}

// Put a saved run (see serialize in game/state.js) on the board in place of
// the current one. Only between shots: nothing may be in flight.
function loadRun(data) {
  if (state.shootingCube || state.cascade) throw new Error('loadRun: a shot or cascade is still resolving');
  clearBoard();
  deserialize(data);
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = state.grid[c][r];
      if (!cell) continue;
      cell.mesh = createCubeMesh(cell.colorIndex);
      cell.mesh.position.set(colToX(c), 0, rowToZ(r));
      gameGroup.add(cell.mesh);
    }
  }
  setScore(state.score);
  setLevel(state.level);
  setDailyIndicator(state.dailyMode);
  showPause(false);
  applyTheme(themeIndexForLevel(state.level, THEMES.length));
  updateColumnHighlight();
}

// ─── Pause ───────────────────────────────────────────────────────────────────
function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  showPause(state.paused);
  if (!state.paused) {
    // Discard accumulated delta to prevent dt spike on resume
    clock.getDelta();
  }
}

// ─── Init & Game Loop ────────────────────────────────────────────────────────
initInput({ shoot, holdSwap, togglePause, restartGame });

window.addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initGrid();
placeOpeningSeeds();
createGroundPlane();
createGridVisual();
fitCamera();
applyTheme(0);
updateSpawnCube();
updateColumnHighlight();
updateNextPreview();
updateHoldPreview();
updateGhost();

// Heartbeat synced to the music's beat while in danger
music.onBeat = (time) => {
  if (state.dangerActive && !state.gameOver && !state.paused) playHeartbeat(time);
};

// Frame timer. THREE.Clock is deprecated in three 0.183; this is the same
// contract (seconds since the previous call) without the console warning.
const clock = {
  _last: performance.now(),
  getDelta() {
    const now = performance.now();
    const dt = (now - this._last) / 1000;
    this._last = now;
    return dt;
  },
};

function animate() {
  requestAnimationFrame(animate);

  let dt = Math.min(clock.getDelta(), 0.05);

  // When paused, still render but don't update game logic
  if (state.paused) {
    renderer.render(scene, camera);
    return;
  }

  // Hit-freeze: pause game updates briefly on big clears
  if (state.freezeTimer > 0) {
    state.freezeTimer -= dt;
    dt = 0;
  }

  let gameDt = dt;

  // Clutch slow-mo
  if (state.slowMoTimer > 0) {
    state.slowMoTimer -= dt;
    gameDt *= 0.35;
  }

  // Dynamic intensity update (always uses real dt)
  updateDynamicIntensity(dt, state.lastChainStep);
  // Decay lastChainStep over time
  if (state.lastChainStep > 0 && !isFlashing()) state.lastChainStep = 0;

  if (!state.gameOver) {
    // Danger state tracking — drives vignette, heartbeat, and music push
    const dangerNow = isInDanger(state.grid);
    if (dangerNow !== state.dangerActive) {
      state.dangerActive = dangerNow;
      setDanger(state.dangerActive);
    }

    updateHint(dt);

    updateShooting(gameDt);
    updateCascade(gameDt);
    updateParticles(dt); // particles always at full speed
    updateTrailParticles(dt);
    updateLandingAnims(dt);
    updateWallAnims(dt);
    updateSpecialCubeVisuals(dt);
    updateGhost();
    emitShotTrail();

    // Wall advance -- frozen until the first shot, and while a cascade is
    // still resolving (advancing on top of an in-progress chain would try
    // to start a second cascade and corrupt both).
    if (state.wallStarted && !state.cascade) {
      state.wallAdvanceTimer += gameDt;
      const currentInterval = wallInterval(state.level);
      showWallTimer(currentInterval - state.wallAdvanceTimer, currentInterval);
      if (state.wallAdvanceTimer >= currentInterval) {
        state.wallAdvanceTimer = 0;
        hideWallWarning();
        advanceWall();
      }
    }
  } else {
    updateParticles(dt);
    updateTrailParticles(dt);
  }

  updateSpawnPop(dt);
  pulseGhost();
  updateCamera(dt);

  renderer.render(scene, camera);
}

animate();

// ─── Debug hook (?debug=1 only) ──────────────────────────────────────────────
// Read/stage access for scripts/shoot.mjs, scripts/replay.mjs and anyone
// poking at the console. Not exposed without the query flag, so a player
// can't reach it by accident.
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__hs = {
    // grid[col][row] as colour indices (null = empty); row 0 is the player's row
    get grid() {
      return state.grid.map((col) => col.map((cell) => (cell ? cell.colorIndex : null)));
    },
    get level() { return state.level; },
    get score() { return state.score; },
    get cur() {
      return { col: state.currentCol, color: state.currentColorIndex, next: [...state.nextQueue], held: state.heldColorIndex };
    },
    // A shot in flight or a cascade still resolving; input pressed now is buffered
    get busy() { return !!(state.shootingCube || state.cascade); },
    get gameOver() { return state.gameOver; },
    get danger() { return state.dangerActive; },
    landingRow: (col) => landingRow(state.grid, col),
    // Stage a cube without resolving matches; returns false if the cell is taken
    placeCube(col, row, colorIndex) {
      if (state.grid[col]?.[row] !== null) return false;
      return !!placeCube(col, row, colorIndex);
    },
    clearBoard,
    // Set the cube in hand and/or the aimed lane: setCur({ color, col })
    setCur({ color, col } = {}) {
      if (color !== undefined) state.currentColorIndex = color;
      if (col !== undefined) state.currentCol = Math.max(0, Math.min(GRID_COLS - 1, col));
      updateSpawnCube();
      updateColumnHighlight();
      updateGhost();
    },
    // Jump progression to n cumulative clears, silently (no banner, no breather)
    setLevelClears(n) {
      state.totalClearedCount = n;
      state.level = levelForClears(n);
      setLevel(state.level);
      const themeIdx = themeIndexForLevel(state.level, THEMES.length);
      if (themeIdx !== currentThemeIndex) applyTheme(themeIdx);
    },
    // The run as JSON, and putting one back; only while not busy
    serialize: () => serialize(),
    restore: (data) => loadRun(data),
  };
}
