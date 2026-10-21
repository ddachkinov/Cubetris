// ─── Hueshot ─────────────────────────────────────────────────────────────────
// The game flow (shooting, cascades, the wall, levels, game over, restart)
// and the frame loop. Rules live in game/rules.js, the run's state in
// game/state.js; render/, audio/, ui/ and input.js are the outputs and
// inputs around them.

import { THEMES } from './themes.js';
import {
  GRID_COLS, GRID_ROWS, SHOOT_SPEED, ROW_CLEAR_BONUS, LEVEL_UP_BREATHER,
  activeColorCount, wallInterval, levelForClears, themeIndexForLevel,
  dailyRngs, endlessRngs, randomColorIndex, generateWallRow, seedOpeningRows,
  landingRow, reachedFront, isInDanger, computeRemovalSet, fullRowCount, gravityMoves,
} from './game/rules.js';
import { state, serialize, deserialize, isBusy, SAVE_VERSION } from './game/state.js';
import { boardSketch, dailyShareText } from './game/daily.js';
import {
  todayKey, loadBest, saveBest, loadLifeStats, saveLifeStats, loadDailyBest, recordDailyRun,
  writeSavedRun, readSavedRun, clearSavedRun,
} from './persistence.js';
import {
  music, playLevelUpSound, playBombSound, playRowClearSound, playHeartbeat, playLandSound,
  playWallPushSound, playClutchSound, playChainSound, playTickSound, toggleMute, isMuted,
  suspendAudio, resumeAudio,
} from './audio/sfx.js';
import {
  DEPTH_CELL, scene, renderer, gameGroup, colToX, rowToZ, disposeMesh,
  createGroundPlane, createGridVisual, applyEnvironment, setIntensityLighting,
} from './render/scene.js';
import { camera, fitCamera, triggerShake, resetShake, updateCamera } from './render/camera.js';
import { tintForTheme } from './render/palette.js';
import { watchFrame, isLowPower } from './render/budget.js';
import {
  spawnCube, createCubeMesh, updateColumnHighlight, updateGhost, pulseGhost, updateSpawnCube,
  popSpawnCube, updateSpawnPop, recolorCubes, startSquash, updateLandingAnims, pushWallAnim,
  cancelWallAnimFor, updateWallAnims, resetCubeAnims, updateSpecialCubeVisuals, sweepStrayCubes,
} from './render/cubes.js';
import {
  spawnParticles, updateParticles, clearDebris, updateTrailParticles, emitShotTrail, clearTrail,
  particleStats,
} from './render/particles.js';
import {
  setScore, setBest, setLevel, spawnScorePopup, resetAnnouncer, showChainCounter,
  showLevelUpBanner, showRowClearBanner, showClutchBanner, triggerFlash, updateFlash, isFlashing,
  resetFlash, updateNextPreview, updateHoldPreview, showWallTimer, hideWallWarning, resetWallTimer,
  setDanger, setDailyIndicator, showGameOver, showPause, hideOverlays, updateHint, resetIdle,
  showContinue, setMuteLabel, showFrontDoor, showShared,
} from './ui/hud.js';
import { haptic } from './platform/haptics.js';
import { initNativeLifecycle } from './platform/lifecycle.js';
import { shareText } from './platform/share.js';
import { initInput, resetAim } from './input.js';
import { DEBUG } from './debug.js';

// ─── Progress that outlives a run ────────────────────────────────────────────
let highScore = loadBest();
const lifeStats = loadLifeStats();
let currentThemeIndex = -1;
// The date of the Daily on the board: its seed, and the day its score
// counts for, even if the run ends after midnight
let dailyDate = null;
// The front door is up (see openFrontDoor)
let atFrontDoor = false;

// An Endless run's seed: from the platform's random source, not Math.random
// (see endlessRngs)
function freshSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Next cube for the hand: from the bag, or a special at higher levels
function dealColor() {
  return randomColorIndex(state.bag, state.level, state.queueRng);
}

setBest(highScore);

// ─── Theme application (a tint and a key, every 3 levels) ────────────────────
function applyTheme(idx) {
  const theme = THEMES[idx % THEMES.length];
  currentThemeIndex = idx % THEMES.length;

  // The tint: ground, lines, lights and the cube colours, then every cube
  // already on the board takes the new colours
  applyEnvironment(theme);
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
  const seeds = seedOpeningRows(state.wallRng, state.currentColorIndex, state.nextQueue[0]);
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
  haptic('heavy');
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
    state.wallAdvanceTimer = Math.min(state.wallAdvanceTimer, -LEVEL_UP_BREATHER);

    playLevelUpSound();
    haptic('levelUp');
    triggerShake(0.15, 0.3);
    showLevelUpBanner(state.level, themeChanged ? tintForTheme(THEMES[themeIdx]).name : null);
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
  // Never two at once: the second would replace the first, and the first's
  // clears would never reach checkLevelUp. The harnesses fail on this.
  if (state.cascade) console.error('beginCascade: a cascade is already resolving');
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
    // Chain x3 and up is the heavy one; a row clear below is heavy too
    haptic(cascade.chainStep >= 3 ? 'heavy' : 'clear');
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
    haptic('heavy');
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
  // the first one and corrupt both. And buffered while the wall is due: it
  // waits for a shot in flight to land, so a stream of shots must not keep
  // it waiting.
  if (state.shootingCube || state.cascade || wallDue()) {
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
  haptic('select');
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
    haptic('land');

    state.shootingCube = null;
    state.shootingVelocity = null;

    beginCascade(afterCascade);
  }
}

// After a shot's or the wall's cascade: the run may be over, and a shot
// pressed meanwhile goes now
function afterCascade() {
  checkGameOver();
  if (state.queuedShot) {
    state.queuedShot = false;
    if (!state.gameOver) shoot();
  }
}

// ─── Wall advancement ────────────────────────────────────────────────────────
function wallDue() {
  return state.wallStarted && state.wallAdvanceTimer >= wallInterval(state.level);
}

function advanceWall() {
  if (reachedFront(state.grid)) {
    triggerGameOver();
    return;
  }

  // The wall grinding forward is an EVENT: rumble + shake + tweened motion
  playWallPushSound();
  haptic('wall');
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

  const wallRow = generateWallRow(state.wallRng, activeColorCount(state.level), grid);
  for (let c = 0; c < GRID_COLS; c++) {
    const cell = placeCube(c, GRID_ROWS - 1, wallRow[c]);
    if (cell) {
      // New row slides in from behind the back wall with a pop
      cell.mesh.position.z = rowToZ(GRID_ROWS - 1) + DEPTH_CELL;
      pushWallAnim(cell.mesh, rowToZ(GRID_ROWS - 1));
      startSquash(cell.mesh);
    }
  }

  beginCascade(afterCascade);
  // Snapshot the run once the wall's cascade (if any) has settled
  saveRunWhenIdle();
}

// ─── Saving a run in progress ────────────────────────────────────────────────
// A run is snapshotted (serialize(), see game/state.js) on every wall
// advance and when the page is hidden, so it survives the app being killed
// and is offered back on the next launch. Only between shots: if a shot or a
// cascade is still resolving, the save waits for the first idle frame.
let savePending = false;

function saveRun() {
  savePending = false;
  writeSavedRun({ run: serialize(), dailyDate: state.dailyMode ? dailyDate : null, savedAt: Date.now() });
}

// A run that has not had its first shot is not worth offering back
function saveRunWhenIdle() {
  if (state.gameOver || !state.wallStarted) return;
  if (isBusy(state)) savePending = true;
  else saveRun();
}

// Once per frame: a save that was waiting for the board to settle
function flushPendingSave() {
  if (savePending && !state.gameOver && !isBusy(state)) saveRun();
}

// A saved run is offered back if it can still be played: a Daily only on
// its own day, since tomorrow's Daily is a different board
function resumableRun() {
  const saved = readSavedRun();
  if (!saved || !saved.run || saved.run.v !== SAVE_VERSION) return null;
  if (saved.dailyDate && saved.dailyDate !== todayKey()) return null;
  return saved;
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
  haptic('gameOver');
  // A finished run is not offered back
  savePending = false;
  clearSavedRun();

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

  if (state.dangerActive) {
    state.dangerActive = false;
    setDanger(false);
  }

  if (state.dailyMode) {
    // Unlimited tries; the day's best is what is shown and shared
    const { best, prev } = recordDailyRun(dailyDate, {
      score, chain: runStats.bestChain, sketch: boardSketch(state.grid),
    });
    const newBest = isNewBest ? 'NEW BEST!' : prev && best !== prev ? 'NEW BEST TODAY' : null;
    showGameOver({ score, best: best.score, daily: true, newBest, recap });
  } else {
    showGameOver({ score, best: highScore, daily: false, newBest: isNewBest ? 'NEW BEST!' : null, recap });
  }
}

// ─── The Daily's share ───────────────────────────────────────────────────────
// Today's best run as one line and a sketch of the board it ended on (see
// game/daily.js), to the share sheet; the clipboard where there is none
async function shareDaily() {
  const dateKey = state.dailyMode && dailyDate ? dailyDate : todayKey();
  const best = loadDailyBest(dateKey);
  if (!best) return;
  showShared(await shareText(dailyShareText({ dateKey, ...best })));
}

// Take every cube off the board
function clearBoard() {
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) removeCube(c, r);
  }
}

function restartGame(asDaily = false) {
  // A new run replaces any saved one
  savePending = false;
  clearSavedRun();

  // Daily runs use date-seeded PRNGs — everyone gets the same board today
  state.dailyMode = !!asDaily;
  dailyDate = state.dailyMode ? todayKey() : null;
  const { queueRng, wallRng } = state.dailyMode
    ? dailyRngs(dailyDate)
    : endlessRngs(freshSeed());
  state.queueRng = queueRng;
  state.wallRng = wallRng;
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

  atFrontDoor = false;
  hideOverlays();

  initGrid();
  placeOpeningSeeds();
  state.wallStarted = false;
}

// Put a saved run (see serialize in game/state.js) on the board in place of
// the current one. Only between shots: nothing may be in flight. A Daily
// comes back as the Daily of `date`, today's unless the save says otherwise.
function loadRun(data, date = todayKey()) {
  if (state.shootingCube || state.cascade) throw new Error('loadRun: a shot or cascade is still resolving');
  clearBoard();
  deserialize(data);
  dailyDate = state.dailyMode ? date : null;
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

// ─── The front door ──────────────────────────────────────────────────────────
// Where the app opens, unless a run was saved: today's board, or Endless.
// Today's board is dealt behind it, paused, so the door reads as a cover
// over the board rather than a menu in front of nothing. Leaving it is any
// restartGame() (the door buttons, the Daily button), which takes it down.
function openFrontDoor() {
  restartGame(true);
  atFrontDoor = true;
  state.paused = true;
  showFrontDoor({ dateKey: dailyDate, best: loadDailyBest(dailyDate) });
}

// ─── Pause ───────────────────────────────────────────────────────────────────
function togglePause() {
  if (state.gameOver || atFrontDoor) return;
  state.paused = !state.paused;
  showPause(state.paused);
  showContinue(false);
  if (!state.paused) {
    // Discard accumulated delta to prevent dt spike on resume
    clock.getDelta();
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
// The page hidden (another tab, the app switcher, a call): pause a live run
// and save it. Shown again, it waits on the pause screen for the player.
// The audio side (suspend, resume, resync) is in audio/sfx.js.
function onHide() {
  if (state.gameOver || atFrontDoor) return;
  if (!state.paused) togglePause();
  saveRunWhenIdle();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) onHide();
});
// In the iOS shell the app goes inactive (a call, the app switcher) before
// the page is hidden; treat it the same, audio included
initNativeLifecycle({
  onHide() {
    onHide();
    suspendAudio();
  },
  onShow: resumeAudio,
});
window.addEventListener('pagehide', onHide);

function toggleSound() {
  setMuteLabel(toggleMute());
}

// ─── Init & Game Loop ────────────────────────────────────────────────────────
initInput({ shoot, holdSwap, togglePause, restartGame, toggleSound, openFrontDoor, shareDaily });
setMuteLabel(isMuted());

window.addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initGrid();
createGroundPlane();
createGridVisual();

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

  const frameSeconds = clock.getDelta();
  // A phone that keeps dropping frames gets lighter effects (render/budget.js)
  watchFrame(frameSeconds * 1000);
  let dt = Math.min(frameSeconds, 0.05);

  flushPendingSave();

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
    // to start a second cascade and corrupt both). Once due it also waits
    // for a shot in flight: that cube would land on the wall's cascade and
    // replace it. Shots pressed while it waits are buffered (see shoot()).
    if (state.wallStarted && !state.cascade) {
      const currentInterval = wallInterval(state.level);
      if (!wallDue()) {
        state.wallAdvanceTimer += gameDt;
        showWallTimer(currentInterval - state.wallAdvanceTimer, currentInterval);
      }
      if (wallDue() && !state.shootingCube) {
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

// A run saved by an earlier session: put it on the board, paused, and ask.
// Otherwise the app opens on the front door.
const resumable = resumableRun();
if (resumable) {
  try {
    // Not through restartGame(): that would drop the save, and a player
    // who closes the app on this screen must still find the run next time
    fitCamera();
    loadRun(resumable.run, resumable.dailyDate || todayKey());
    state.paused = true;
    showContinue(true);
  } catch (err) {
    // An unreadable save is dropped, not fatal
    console.warn('saved run could not be restored', err);
    clearSavedRun();
    openFrontDoor();
  }
} else {
  openFrontDoor();
}

// Continue: the saved run carries on from where it was
document.getElementById('continue-btn').addEventListener('click', () => {
  if (state.paused) togglePause();
});
// New run: drop the save, back to the front door
document.getElementById('new-run-btn').addEventListener('click', openFrontDoor);

animate();

// ─── Debug hook (?debug=1 only, see debug.js) ────────────────────────────────
// Read/stage access for scripts/shoot.mjs, scripts/replay.mjs and anyone
// poking at the console. Not exposed without the flag, so a player can't
// reach it by accident.
if (DEBUG) {
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
    // A shot in flight, a cascade still resolving or a buffered shot waiting
    // to go; a shot pressed now is buffered
    get busy() { return !!(state.shootingCube || state.cascade || state.queuedShot); },
    get gameOver() { return state.gameOver; },
    get paused() { return state.paused; },
    get frontDoor() { return atFrontDoor; },
    get daily() { return state.dailyMode; },
    get danger() { return state.dangerActive; },
    // The frame-budget fallback (render/budget.js) and what it changes
    get lowPower() { return isLowPower(); },
    get particles() { return particleStats(); },
    // Seconds on the wall timer (negative = breather), the current interval
    get wall() {
      return { started: state.wallStarted, timer: state.wallAdvanceTimer, interval: wallInterval(state.level) };
    },
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
