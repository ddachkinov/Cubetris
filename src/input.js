// ─── Input ───────────────────────────────────────────────────────────────────
// Keyboard, pointer aiming and the HUD buttons. Moving the aim is handled
// here; everything that changes the run goes through the actions main.js
// hands to initInput().

import * as THREE from 'three';
import { GRID_COLS } from './game/rules.js';
import { state } from './game/state.js';
import { playTickSound } from './audio/sfx.js';
import { camera, BOARD_BOUNDS } from './render/camera.js';
import { CUBE_SIZE, COL_CELL } from './render/scene.js';
import { updateSpawnCube, updateColumnHighlight, updateGhost, popSpawnCube } from './render/cubes.js';
import { haptic } from './platform/haptics.js';
import { dismissHint } from './ui/hud.js';

// The tap that ends a run must not immediately start the next one
const RETRY_GUARD_MS = 500;

// Aim at a lane: the cube snaps there with a tick and a pop
function moveToColumn(newCol) {
  if (newCol === state.currentCol) return;
  state.currentCol = newCol;
  updateSpawnCube();
  updateColumnHighlight();
  updateGhost();
  popSpawnCube();
  haptic('select');
  playTickSound();
}

// Taps on interactive UI (hold box, buttons) must not fire a shot
function isUiTarget(target) {
  return target && target.closest
    && target.closest('#hold-preview, #pause-btn, #daily-btn, button');
}

// ─── Pointer aiming ──────────────────────────────────────────────────────────
// One verb: put your thumb anywhere on the board, the cube snaps to that lane,
// release to drop. No drag-accumulation, no separate quick-drop gesture, and
// the same code path drives the mouse on desktop.
const aimRaycaster = new THREE.Raycaster();
const aimNdc = new THREE.Vector2();
// The board floor, as a plane the pointer ray can be intersected with
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), CUBE_SIZE / 2);
const aimPoint = new THREE.Vector3();

let aimPointerId = null;
let aimCancelled = false;

// Restart drops any aim in progress
export function resetAim() {
  aimPointerId = null;
}

// Screen point -> board lane. Returns null when the ray misses the floor or
// lands behind the near edge, which is how a shot gets cancelled.
function laneFromPointer(clientX, clientY) {
  aimNdc.x = (clientX / window.innerWidth) * 2 - 1;
  aimNdc.y = -(clientY / window.innerHeight) * 2 + 1;
  aimRaycaster.setFromCamera(aimNdc, camera);
  if (!aimRaycaster.ray.intersectPlane(aimPlane, aimPoint)) return null;
  if (aimPoint.z < BOARD_BOUNDS.minZ - 0.5) return null;
  return Math.max(0, Math.min(GRID_COLS - 1, Math.round(aimPoint.x / COL_CELL)));
}

// actions: { shoot, holdSwap, togglePause, restartGame(asDaily), toggleSound }
export function initInput({ shoot, holdSwap, togglePause, restartGame, toggleSound }) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!state.gameOver) togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      toggleSound();
      return;
    }
    // Instant retry — the restart loop IS the addiction loop
    if (state.gameOver && (e.code === 'KeyR' || e.code === 'Enter')) {
      restartGame(state.dailyMode);
      return;
    }
    if (state.gameOver || state.paused) return;

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        state.currentCol = Math.min(GRID_COLS - 1, state.currentCol + 1);
        updateSpawnCube();
        updateColumnHighlight();
        updateGhost();
        break;
      case 'ArrowRight':
      case 'KeyD':
        state.currentCol = Math.max(0, state.currentCol - 1);
        updateSpawnCube();
        updateColumnHighlight();
        updateGhost();
        break;
      case 'Space':
        e.preventDefault();
        shoot();
        break;
      case 'KeyE':
        e.preventDefault();
        holdSwap();
        break;
    }
  });

  function onAimStart(e) {
    if (state.gameOver) {
      if (!isUiTarget(e.target) && performance.now() - state.gameOverAt > RETRY_GUARD_MS) {
        restartGame(state.dailyMode);
      }
      return;
    }
    if (state.paused || aimPointerId !== null) return;
    if (isUiTarget(e.target)) return;
    aimPointerId = e.pointerId;
    aimCancelled = false;
    dismissHint();
    const lane = laneFromPointer(e.clientX, e.clientY);
    if (lane !== null) moveToColumn(lane);
  }

  function onAimMove(e) {
    if (e.pointerId !== aimPointerId || state.gameOver || state.paused) return;
    const lane = laneFromPointer(e.clientX, e.clientY);
    // Dragging off the near edge of the board arms a cancel; coming back disarms
    aimCancelled = lane === null;
    if (lane !== null) moveToColumn(lane);
  }

  function onAimEnd(e) {
    if (e.pointerId !== aimPointerId) return;
    aimPointerId = null;
    if (state.gameOver || state.paused || aimCancelled) return;
    shoot();
  }

  window.addEventListener('pointerdown', onAimStart);
  window.addEventListener('pointermove', onAimMove);
  window.addEventListener('pointerup', onAimEnd);
  window.addEventListener('pointercancel', () => { aimPointerId = null; });
  // Stop the page itself from panning/zooming under the thumb
  window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // ─── Buttons ───────────────────────────────────────────────────────────────
  document.getElementById('pause-btn').addEventListener('click', togglePause);
  document.getElementById('resume-btn').addEventListener('click', togglePause);
  // restartGame() unpauses and hides the pause screen itself
  document.getElementById('pause-restart-btn').addEventListener('click', () => restartGame());
  document.getElementById('restart-btn').addEventListener('click', () => restartGame(false));
  document.getElementById('hold-preview').addEventListener('click', () => holdSwap());
  document.getElementById('mute-btn').addEventListener('click', () => toggleSound());

  // Daily challenge — same seeded board for everyone, resets each calendar day
  document.getElementById('daily-btn').addEventListener('click', () => {
    if (state.paused) togglePause();
    restartGame(true);
  });
}
