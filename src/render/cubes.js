// ─── Cubes ───────────────────────────────────────────────────────────────────
// Cube meshes and everything drawn around the player's aim: the lane tints,
// the landing ghost and the spawn cube. Also the per-cube animations:
// landing squash, wall-push and gravity tweens, and the rainbow and bomb
// shimmer.
//
// Every cube (the board, the one in flight and the one in hand) is drawn by
// one InstancedMesh. What the game holds as a cube's "mesh" is a CubeProxy:
// an Object3D with a position and scale like any mesh, which the game moves
// and tweens as before. Right before each draw, syncCubes() copies every
// live proxy into the instance buffers, along with its colour, its glyph and
// its contact shadow. One draw call for up to 86 cubes (and one for their
// shadows), and placing or clearing a cube allocates nothing on the GPU.
//
// The look is ceramic on paper: rounded, matte (MeshStandardMaterial,
// roughness 0.9), a soft contact shadow under each cube, and an engraved
// glyph on every face so no colour has to be told apart by hue alone.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GRID_COLS, RAINBOW_INDEX, BOMB_INDEX, landingRow } from '../game/rules.js';
import { state } from '../game/state.js';
import { COLORS, RAINBOW_BASE, BOMB_BODY, BOMB_FUSE, currentTint } from './palette.js';
import { createGlyphAtlas, GLYPH_CELLS } from './glyphs.js';
import {
  CUBE_SIZE, COL_CELL, FIELD_DEPTH, gameGroup, colToX, rowToZ, onBeforeRender, uploadIfChanged,
} from './scene.js';

// 84 board cells, the shot in flight and the cube in hand, with room to spare
const MAX_CUBES = 100;
// A hair under a full cell, so neighbours read as separate tiles
const CUBE_BODY = CUBE_SIZE * 0.94;
const FLOOR_Y = -CUBE_SIZE / 2;

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

const cubeGeo = new RoundedBoxGeometry(CUBE_BODY, CUBE_BODY, CUBE_BODY, 3, 0.13);

// ─── Cube material: matte ceramic with an engraved glyph ─────────────────────
// aGlyph picks the atlas cell (the colour index). The glyph darkens the face
// it sits on; the bomb's fuse is drawn in coral instead.
const glyphAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CUBES), 1);
glyphAttr.setUsage(THREE.DynamicDrawUsage);
cubeGeo.setAttribute('aGlyph', glyphAttr);

const glyphUniforms = {
  glyphMap: { value: createGlyphAtlas() },
  fuseColor: { value: new THREE.Color(BOMB_FUSE) },
};

const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
cubeMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, glyphUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aGlyph;\nvarying float vGlyph;\nvarying vec2 vGlyphUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlyph = aGlyph;\nvGlyphUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D glyphMap;
uniform vec3 fuseColor;
varying float vGlyph;
varying vec2 vGlyphUv;`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float glyphInk = texture2D(glyphMap, vec2((vGlyph + vGlyphUv.x) / ${GLYPH_CELLS}.0, vGlyphUv.y)).r;
vec3 ink = vGlyph > ${BOMB_INDEX - 0.5} ? fuseColor : diffuseColor.rgb * 0.58;
diffuseColor.rgb = mix(diffuseColor.rgb, ink, glyphInk);`
    );
};

const cubeMesh = new THREE.InstancedMesh(cubeGeo, cubeMat, MAX_CUBES);
cubeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CUBES * 3), 3);
cubeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cubeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
// The instances move every frame; a bounding sphere computed once would cull them
cubeMesh.frustumCulled = false;
cubeMesh.count = 0;
gameGroup.add(cubeMesh);

// ─── Contact shadows ─────────────────────────────────────────────────────────
// A soft dark blot on the floor under every cube, offset a little away from
// the key light. Grounds the cubes on the paper for the price of one draw.
function shadowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  map: shadowTexture(),
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});
const shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_CUBES);
shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
shadowMesh.frustumCulled = false;
shadowMesh.count = 0;
shadowMesh.renderOrder = 1;
gameGroup.add(shadowMesh);
const SHADOW_Y = FLOOR_Y + 0.006;
const SHADOW_OFFSET_Z = 0.12;

export function createCubeMesh(colorIndex) {
  return new CubeProxy(colorIndex);
}

// ─── Instance sync ───────────────────────────────────────────────────────────
let rainbowTime = 0;
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const flatQuat = new THREE.Quaternion();

// Hue drifts with time and with the cube's place on the board
function rainbowHue(x, z) {
  return (((rainbowTime * 0.5 + x * 0.1 + z * 0.05) % 1) + 1) % 1;
}

function cubeColor(colorIndex, x, z, out) {
  if (colorIndex === RAINBOW_INDEX) return out.setHex(RAINBOW_BASE).lerp(tmpColor.setHSL(rainbowHue(x, z), 0.65, 0.62), 0.55);
  if (colorIndex === BOMB_INDEX) return out.setHex(BOMB_BODY);
  return out.setHex(COLORS[colorIndex]);
}

const staged = {
  matrix: new Float32Array(MAX_CUBES * 16),
  color: new Float32Array(MAX_CUBES * 3),
  glyph: new Float32Array(MAX_CUBES),
  shadow: new Float32Array(MAX_CUBES * 16),
};

function syncCubes() {
  let i = 0;
  for (const cube of liveCubes) {
    if (i >= MAX_CUBES) break;
    const { position: p, scale: s } = cube;
    tmpMatrix.compose(p, cube.quaternion, s).toArray(staged.matrix, i * 16);
    cubeColor(cube.colorIndex, p.x, p.z, tmpColor).toArray(staged.color, i * 3);
    staged.glyph[i] = cube.colorIndex;

    // The shadow stays on the floor and spreads as the cube squashes
    tmpPos.set(p.x, SHADOW_Y, p.z + SHADOW_OFFSET_Z);
    tmpScale.set(s.x, 1, s.z);
    tmpMatrix.compose(tmpPos, flatQuat, tmpScale).toArray(staged.shadow, i * 16);
    i++;
  }
  uploadIfChanged(cubeMesh.instanceMatrix, staged.matrix, i * 16);
  uploadIfChanged(cubeMesh.instanceColor, staged.color, i * 3);
  uploadIfChanged(glyphAttr, staged.glyph, i);
  uploadIfChanged(shadowMesh.instanceMatrix, staged.shadow, i * 16);
  cubeMesh.count = i;
  shadowMesh.count = i;
  // An InstancedMesh with count 0 would still issue a (zero-instance) draw
  cubeMesh.visible = shadowMesh.visible = i > 0;

  // The bomb's fuse glows on and off
  const pulse = Math.sin(rainbowTime * 4) * 0.5 + 0.5;
  glyphUniforms.fuseColor.value.setHex(BOMB_FUSE).lerp(tmpColor.setHex(0xffd27a), pulse * 0.6);
  shadowMat.opacity = currentTint.shadow;
}
onBeforeRender(syncCubes);

// ─── Lanes ───────────────────────────────────────────────────────────────────
// The board floor is seven lane strips in alternating paper tints; the lane
// you are aiming down is lifted toward white. Replaces the 3%-alpha column
// highlight, which could not be seen on a phone.
const LANE_NEAR_Z = -1.5;
const LANE_FAR_Z = FIELD_DEPTH - 0.5;
const laneGeo = new THREE.PlaneGeometry(COL_CELL, LANE_FAR_Z - LANE_NEAR_Z);
laneGeo.rotateX(-Math.PI / 2);
const lanes = new THREE.InstancedMesh(laneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), GRID_COLS);
lanes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRID_COLS * 3), 3);
for (let c = 0; c < GRID_COLS; c++) {
  tmpMatrix.makeTranslation(colToX(c), FLOOR_Y + 0.001, (LANE_NEAR_Z + LANE_FAR_Z) / 2);
  lanes.setMatrixAt(c, tmpMatrix);
}
gameGroup.add(lanes);

const white = new THREE.Color(0xffffff);

export function updateColumnHighlight() {
  for (let c = 0; c < GRID_COLS; c++) {
    tmpColor.setHex(c % 2 ? currentTint.laneAlt : currentTint.floor);
    // How far toward white depends on the tint: a lot on paper, a little on dusk
    if (c === state.currentCol) tmpColor.lerp(white, currentTint.activeLane);
    lanes.setColorAt(c, tmpColor);
  }
  lanes.instanceColor.needsUpdate = true;
}

// ─── Ghost preview (where the shot will land) ────────────────────────────────
// A solid cube at 45% in the shot's colour, not a white wireframe
const ghostMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
const ghostCube = new THREE.Mesh(cubeGeo, ghostMat);
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
  cubeColor(state.currentColorIndex, ghostCube.position.x, ghostCube.position.z, ghostMat.color);
  ghostCube.visible = true;
}

// The ghost holds still at 45%; kept for the frame loop's call
export function pulseGhost() {}

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

// Theme change: cubes take their colour from COLORS at draw time; the lanes
// take the new tint here
export function recolorCubes() {
  updateColumnHighlight();
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
