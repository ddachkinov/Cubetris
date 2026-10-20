// ─── Cubes ───────────────────────────────────────────────────────────────────
// Cube meshes and everything drawn around the player's aim: the lane
// highlight, the landing ghost and the spawn cube. Also the per-cube
// animations: landing squash, wall-push and gravity tweens, and the rainbow
// and bomb shimmer.

import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS, RAINBOW_INDEX, BOMB_INDEX, landingRow } from '../game/rules.js';
import { state } from '../game/state.js';
import { COLORS } from './palette.js';
import { CUBE_SIZE, COL_CELL, FIELD_DEPTH, gameGroup, colToX, rowToZ } from './scene.js';

export function createCubeMesh(colorIndex) {
  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  if (colorIndex === RAINBOW_INDEX) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 });
    return new THREE.Mesh(geo, mat);
  }
  if (colorIndex === BOMB_INDEX) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: 0x331100 });
    return new THREE.Mesh(geo, mat);
  }
  const mat = new THREE.MeshLambertMaterial({ color: COLORS[colorIndex] });
  return new THREE.Mesh(geo, mat);
}

// ─── Column highlight ────────────────────────────────────────────────────────
const highlightGeo = new THREE.PlaneGeometry(CUBE_SIZE, FIELD_DEPTH + 4);
const highlightMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.03,
});
const columnHighlight = new THREE.Mesh(highlightGeo, highlightMat);
columnHighlight.rotation.x = -Math.PI / 2;
columnHighlight.position.y = -CUBE_SIZE / 2 + 0.02;
columnHighlight.position.z = FIELD_DEPTH / 2;
gameGroup.add(columnHighlight);

export function updateColumnHighlight() {
  columnHighlight.position.x = state.currentCol * COL_CELL;
}

// ─── Ghost preview (wireframe at landing position) ───────────────────────────
const ghostGeo = new THREE.BoxGeometry(CUBE_SIZE * 0.98, CUBE_SIZE * 0.98, CUBE_SIZE * 0.98);
const ghostEdges = new THREE.EdgesGeometry(ghostGeo);
const ghostMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.25,
});
const ghostCube = new THREE.LineSegments(ghostEdges, ghostMat);
ghostCube.visible = false;
gameGroup.add(ghostCube);

export function updateGhost() {
  if (state.gameOver || state.paused || state.shootingCube) {
    ghostCube.visible = false;
    return;
  }
  const row = landingRow(state.grid, state.currentCol);
  if (row < 0) {
    ghostCube.visible = false;
    return;
  }
  ghostCube.position.set(colToX(state.currentCol), 0, rowToZ(row));
  if (state.currentColorIndex === RAINBOW_INDEX) {
    ghostMat.color.setHex(0xffffff);
  } else if (state.currentColorIndex === BOMB_INDEX) {
    ghostMat.color.setHex(0xff8800);
  } else {
    ghostMat.color.setHex(COLORS[state.currentColorIndex]);
  }
  ghostCube.visible = true;
}

// Pulse the ghost's outline (once per frame)
export function pulseGhost() {
  if (ghostCube.visible) {
    ghostMat.opacity = 0.18 + Math.sin(Date.now() * 0.005) * 0.1;
  }
}

// ─── Spawn-point cube ────────────────────────────────────────────────────────
const spawnGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const spawnMat = new THREE.MeshLambertMaterial({ color: COLORS[0] });
export const spawnCube = new THREE.Mesh(spawnGeo, spawnMat);
spawnCube.position.set(state.currentCol * COL_CELL, 0, -1);
gameGroup.add(spawnCube);

export function updateSpawnCube() {
  spawnCube.position.x = state.currentCol * COL_CELL;
  if (state.currentColorIndex === RAINBOW_INDEX) {
    spawnMat.color.setHex(0xffffff);
    spawnMat.emissive.setHex(0x333333);
  } else if (state.currentColorIndex === BOMB_INDEX) {
    spawnMat.color.setHex(0xff6600);
    spawnMat.emissive.setHex(0x221100);
  } else {
    spawnMat.color.setHex(COLORS[state.currentColorIndex]);
    spawnMat.emissive.setHex(0x000000);
  }
}

// Scale-pop feedback on the spawn cube when the lane or the hand changes
let spawnScalePop = 0;

export function popSpawnCube() {
  spawnScalePop = 1;
}

export function updateSpawnPop(dt) {
  if (spawnScalePop > 0) {
    spawnScalePop = Math.max(0, spawnScalePop - dt * 8);
    const s = 1 + spawnScalePop * 0.25;
    spawnCube.scale.set(s, s, s);
  } else {
    spawnCube.scale.set(1, 1, 1);
  }
}

// Theme change: repaint every plain cube on the board and in flight
export function recolorCubes() {
  const { grid, shootingCube } = state;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid[c] && grid[c][r];
      if (cell && cell.colorIndex < COLORS.length) {
        cell.mesh.material.color.setHex(COLORS[cell.colorIndex]);
      }
    }
  }
  if (shootingCube && shootingCube.colorIndex < COLORS.length) {
    shootingCube.mesh.material.color.setHex(COLORS[shootingCube.colorIndex]);
  }
}

// ─── Landing squash & stretch ────────────────────────────────────────────────
let landingAnims = [];

export function startSquash(mesh) {
  landingAnims.push({ mesh, t: 0 });
}

export function updateLandingAnims(dt) {
  for (let i = landingAnims.length - 1; i >= 0; i--) {
    const a = landingAnims[i];
    a.t += dt * 5;
    if (a.t >= 1) {
      a.mesh.scale.set(1, 1, 1);
      landingAnims.splice(i, 1);
    } else {
      const s = Math.sin(Math.PI * a.t);
      a.mesh.scale.set(1 + 0.25 * s, 1 - 0.35 * s, 1 + 0.25 * s);
    }
  }
}

// ─── Mesh-position tween (rows grind forward, cleared columns fall) ─────────
// One mechanism, two speeds: the wall entering a row is a ~330ms grind
// (speed 3), a cascade step's gravity is a snappier ~120ms drop (speed
// CASCADE_FALL_SPEED). Always cancels any tween already running on this
// mesh first, so gravity landing on a still-sliding wall row (or vice
// versa) replaces it cleanly instead of the two fighting over one mesh.
let wallAnims = [];

export function pushWallAnim(mesh, toZ, speed = 3) {
  cancelWallAnimFor(mesh);
  wallAnims.push({ mesh, fromZ: mesh.position.z, toZ, t: 0, speed });
}

export function cancelWallAnimFor(mesh) {
  for (let i = wallAnims.length - 1; i >= 0; i--) {
    if (wallAnims[i].mesh === mesh) wallAnims.splice(i, 1);
  }
}

export function updateWallAnims(dt) {
  for (let i = wallAnims.length - 1; i >= 0; i--) {
    const a = wallAnims[i];
    a.t += dt * a.speed;
    if (a.t >= 1) {
      a.mesh.position.z = a.toZ;
      wallAnims.splice(i, 1);
    } else {
      const e = 1 - Math.pow(1 - a.t, 3); // ease-out cubic
      a.mesh.position.z = a.fromZ + (a.toZ - a.fromZ) * e;
    }
  }
}

export function resetCubeAnims() {
  landingAnims = [];
  wallAnims = [];
}

// ─── Rainbow + bomb visual animation ─────────────────────────────────────────
let rainbowTime = 0;

export function updateSpecialCubeVisuals(dt) {
  rainbowTime += dt;

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = state.grid[c][r];
      if (!cell) continue;

      if (cell.colorIndex === RAINBOW_INDEX) {
        const hue = (rainbowTime * 0.5 + c * 0.1 + r * 0.05) % 1;
        cell.mesh.material.color.setHSL(hue, 0.7, 0.7);
        cell.mesh.material.emissive.setHSL(hue, 1, 0.15);
      }

      if (cell.colorIndex === BOMB_INDEX) {
        const pulse = Math.sin(rainbowTime * 4) * 0.5 + 0.5;
        cell.mesh.material.emissive.setRGB(0.3 * pulse, 0.15 * pulse, 0);
      }
    }
  }

  // Spawn cube special animations
  if (state.currentColorIndex === RAINBOW_INDEX) {
    const hue = (rainbowTime * 0.5) % 1;
    spawnMat.color.setHSL(hue, 0.7, 0.7);
    spawnMat.emissive.setHSL(hue, 1, 0.15);
  } else if (state.currentColorIndex === BOMB_INDEX) {
    const pulse = Math.sin(rainbowTime * 4) * 0.5 + 0.5;
    spawnMat.emissive.setRGB(0.3 * pulse, 0.15 * pulse, 0);
  }
}

// Restart's nuclear cleanup: any stray cube-shaped mesh still in the group
// (debris, trail, an orphaned cube) goes, except the spawn cube and the lane
// highlight
export function sweepStrayCubes() {
  const keepers = new Set([spawnCube, columnHighlight]);
  for (let i = gameGroup.children.length - 1; i >= 0; i--) {
    const child = gameGroup.children[i];
    if (child.isMesh && child.geometry?.type === 'BoxGeometry' && !keepers.has(child)) {
      gameGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
  }
}
