// ─── Cubes ───────────────────────────────────────────────────────────────────
// Cube meshes and everything drawn around the player's aim: the lane
// highlight, the landing ghost and the spawn cube. Also the per-cube
// animations: landing squash, wall-push and gravity tweens, and the rainbow
// and bomb shimmer.
//
// Every cube (the board, the one in flight and the one in hand) is drawn by
// one InstancedMesh. What the game holds as a cube's "mesh" is a CubeProxy:
// an Object3D with a position and scale like any mesh, which the game moves
// and tweens as before. Right before each draw, syncCubes() copies every
// live proxy into the instance buffers. One draw call for up to 86 cubes,
// and placing or clearing a cube allocates nothing on the GPU.

import * as THREE from 'three';
import { RAINBOW_INDEX, BOMB_INDEX, landingRow } from '../game/rules.js';
import { state } from '../game/state.js';
import { COLORS } from './palette.js';
import {
  CUBE_SIZE, COL_CELL, FIELD_DEPTH, gameGroup, colToX, rowToZ, onBeforeRender, uploadIfChanged,
} from './scene.js';

// 84 board cells, the shot in flight and the cube in hand, with room to spare
const MAX_CUBES = 100;

const liveCubes = new Set();

class CubeProxy extends THREE.Object3D {
  constructor(colorIndex) {
    super();
    this.colorIndex = colorIndex;
    // Never drawn itself; syncCubes reads position/quaternion/scale directly
    this.matrixAutoUpdate = false;
    liveCubes.add(this);
  }

  dispose() {
    liveCubes.delete(this);
  }
}

const cubeMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
  new THREE.MeshLambertMaterial({ color: 0xffffff }),
  MAX_CUBES
);
cubeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CUBES * 3), 3);
cubeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cubeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
// The instances move every frame; a bounding sphere computed once would cull them
cubeMesh.frustumCulled = false;
cubeMesh.count = 0;
gameGroup.add(cubeMesh);

export function createCubeMesh(colorIndex) {
  return new CubeProxy(colorIndex);
}

// ─── Instance sync ───────────────────────────────────────────────────────────
let rainbowTime = 0;
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

function cubeColor(cube, out) {
  if (cube.colorIndex === RAINBOW_INDEX) {
    // Hue drifts with time and with the cube's place on the board
    const hue = (rainbowTime * 0.5 + cube.position.x * 0.1 + cube.position.z * 0.05) % 1;
    return out.setHSL(hue, 0.7, 0.7);
  }
  if (cube.colorIndex === BOMB_INDEX) {
    const pulse = Math.sin(rainbowTime * 4) * 0.5 + 0.5;
    return out.setHex(0xff6600).offsetHSL(0, 0, 0.12 * pulse);
  }
  return out.setHex(COLORS[cube.colorIndex]);
}

const staged = {
  matrix: new Float32Array(MAX_CUBES * 16),
  color: new Float32Array(MAX_CUBES * 3),
};

function syncCubes() {
  let i = 0;
  for (const cube of liveCubes) {
    if (i >= MAX_CUBES) break;
    tmpMatrix.compose(cube.position, cube.quaternion, cube.scale).toArray(staged.matrix, i * 16);
    cubeColor(cube, tmpColor).toArray(staged.color, i * 3);
    i++;
  }
  uploadIfChanged(cubeMesh.instanceMatrix, staged.matrix, i * 16);
  uploadIfChanged(cubeMesh.instanceColor, staged.color, i * 3);
  cubeMesh.count = i;
  // An InstancedMesh with count 0 would still issue a (zero-instance) draw
  cubeMesh.visible = i > 0;
}
onBeforeRender(syncCubes);

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
export const spawnCube = createCubeMesh(state.currentColorIndex);
spawnCube.position.set(state.currentCol * COL_CELL, 0, -1);
gameGroup.add(spawnCube);

export function updateSpawnCube() {
  spawnCube.position.x = state.currentCol * COL_CELL;
  spawnCube.colorIndex = state.currentColorIndex;
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

// Theme change: every cube takes its colour from COLORS at draw time, so
// there is nothing to repaint
export function recolorCubes() {}

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
// The shimmer itself is computed per instance in syncCubes; this keeps time
export function updateSpecialCubeVisuals(dt) {
  rainbowTime += dt;
}

// Restart's nuclear cleanup: any stray cube still alive (an orphaned shot, a
// cube that missed its dispose) goes, except the spawn cube
export function sweepStrayCubes() {
  for (const cube of [...liveCubes]) {
    if (cube === spawnCube) continue;
    gameGroup.remove(cube);
    cube.dispose();
  }
}
