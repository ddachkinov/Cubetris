// ─── Camera ──────────────────────────────────────────────────────────────────
// Fitted to the board at any aspect ratio, plus the screen shake on top.

import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../game/rules.js';
import { CUBE_SIZE, COL_CELL, DEPTH_CELL, centerX } from './scene.js';

export const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  80
);

// ─── Camera framing ──────────────────────────────────────────────────────────
// The board must be entirely on screen at every aspect ratio: on a phone in
// portrait the danger rows are the ones you cannot afford to lose off the
// bottom edge. So instead of a fixed position, the camera is *fitted* to the
// board's bounding box — pull back until all eight corners are inside the
// frustum, with a margin.
//
// Portrait wants a steep pitch (the board is 7 wide by 12 deep, which maps
// naturally onto a tall screen) and a wide vertical FOV so the fit distance
// stays close enough to keep real perspective. Landscape can sit lower and
// keep more of the original corridor look.
const FIT_MARGIN = 0.06;
const PORTRAIT = { pitchDeg: 55, fov: 68 };
const LANDSCAPE = { pitchDeg: 34, fov: 55 };

// World-space bounds of everything that must stay visible: the 7x12 grid plus
// the spawn cube in front of it, one cube-radius in every direction.
export const BOARD_BOUNDS = {
  minX: -CUBE_SIZE, maxX: (GRID_COLS - 1) * COL_CELL + CUBE_SIZE,
  minY: -CUBE_SIZE, maxY: CUBE_SIZE,
  minZ: -1 - CUBE_SIZE, maxZ: (GRID_ROWS - 1) * DEPTH_CELL + CUBE_SIZE,
};
const boardCenterZ = (BOARD_BOUNDS.minZ + BOARD_BOUNDS.maxZ) / 2;

// Where the camera sits when nothing is shaking it, set by fitCamera().
const camBase = new THREE.Vector3();
const camLookAt = new THREE.Vector3(centerX, 0, boardCenterZ);

export function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const { pitchDeg, fov } = aspect < 1 ? PORTRAIT : LANDSCAPE;
  const pitch = THREE.MathUtils.degToRad(pitchDeg);

  camera.aspect = aspect;
  camera.fov = fov;

  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * (1 - FIT_MARGIN);
  const tanH = tanV * aspect;

  // Camera-space basis, with the camera on the near side looking down at the
  // board: zAxis points from the look-at target back toward the camera.
  const zAxis = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch));
  const yAxis = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  const xAxis = new THREE.Vector3(1, 0, 0);

  // For a corner at camera-space (u.x, u.y, u.z), the camera must stand at
  // distance d along zAxis such that the corner is inside both half-angles:
  //   |u.x| <= (d - u.z) * tanH   and   |u.y| <= (d - u.z) * tanV
  let dist = 0;
  const corner = new THREE.Vector3();
  for (const x of [BOARD_BOUNDS.minX, BOARD_BOUNDS.maxX]) {
    for (const y of [BOARD_BOUNDS.minY, BOARD_BOUNDS.maxY]) {
      for (const z of [BOARD_BOUNDS.minZ, BOARD_BOUNDS.maxZ]) {
        corner.set(x - centerX, y, z - boardCenterZ);
        const uz = corner.dot(zAxis);
        dist = Math.max(
          dist,
          uz + Math.abs(corner.dot(xAxis)) / tanH,
          uz + Math.abs(corner.dot(yAxis)) / tanV
        );
      }
    }
  }

  camBase.copy(zAxis).multiplyScalar(dist).add(camLookAt);
  camera.position.copy(camBase);
  camera.lookAt(camLookAt);
  camera.updateProjectionMatrix();
}

// ─── Screen shake ────────────────────────────────────────────────────────────
let shakeTimer = 0;
let shakeIntensity = 0;

export function triggerShake(intensity, duration) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeTimer = Math.max(shakeTimer, duration);
}

export function resetShake() {
  shakeTimer = 0;
  shakeIntensity = 0;
}

// Once per frame, before rendering. The shake is applied as an offset from
// the fitted camera position so the board stays framed no matter how hard a
// chain hits.
export function updateCamera(dt) {
  camera.position.copy(camBase);
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    const decay = Math.max(0, shakeTimer) / 0.3;
    camera.position.x += (Math.random() - 0.5) * shakeIntensity * decay * 2;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * decay * 2;
    if (shakeTimer <= 0) shakeIntensity = 0;
  }

  camera.lookAt(camLookAt);
}
