// ─── Scene ───────────────────────────────────────────────────────────────────
// The renderer, the lights, and the static board: ground, grid lines and side
// walls. Everything that moves lives in gameGroup.

import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../game/rules.js';
import { installFrameMeter } from './perf.js';

export const CUBE_SIZE = 1;
export const COL_CELL = CUBE_SIZE;
export const DEPTH_CELL = CUBE_SIZE;
export const FIELD_DEPTH = GRID_ROWS * DEPTH_CELL;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

export const gridWidth = GRID_COLS * COL_CELL;
export const centerX = gridWidth / 2 - COL_CELL / 2;

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// No shadow map: nothing casts or receives one
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

// Work that must see this frame's final positions (the instanced cubes copy
// their proxies' transforms) runs here, after the game loop has moved
// everything and right before the draw.
const beforeRenderHooks = [];
export function onBeforeRender(fn) {
  beforeRenderHooks.push(fn);
}
scene.onBeforeRender = () => {
  for (const fn of beforeRenderHooks) fn();
};
installFrameMeter(scene);

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x8888cc, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(centerX, 8, -2);
dirLight.target.position.set(centerX, 0, FIELD_DEPTH / 2);
scene.add(dirLight);
scene.add(dirLight.target);

const backLight = new THREE.PointLight(0x4466ff, 0.6, 35);
backLight.position.set(centerX, 2, FIELD_DEPTH + 2);
scene.add(backLight);

// ─── Game group ──────────────────────────────────────────────────────────────
export const gameGroup = new THREE.Group();
scene.add(gameGroup);

// Theme state — refs so applyEnvironment can recolor the board
let groundMatRef = null;
let gridLines = null;

// ─── Coordinate mapping ─────────────────────────────────────────────────────
export function colToX(col) {
  return col * COL_CELL;
}

export function rowToZ(row) {
  return row * DEPTH_CELL;
}

// Instance buffers are filled in a staging copy every frame and uploaded
// only when they differ from what the GPU already has, and then only the
// part in use: a board at rest costs no buffer traffic at all.
export function uploadIfChanged(attr, staging, length) {
  const a = attr.array;
  for (let k = 0; k < length; k++) {
    if (a[k] !== staging[k]) {
      a.set(staging.subarray(0, length));
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, length);
      attr.needsUpdate = true;
      return;
    }
  }
}

// Take a mesh out of the scene and free what it holds. Cubes are proxies
// drawn by one InstancedMesh (see cubes.js) and release their instance.
export function disposeMesh(mesh) {
  gameGroup.remove(mesh);
  if (mesh.dispose) {
    mesh.dispose();
    return;
  }
  mesh.geometry.dispose();
  mesh.material.dispose();
}

// ─── Ground plane ────────────────────────────────────────────────────────────
const EXTRA_COLS = 2;
const EXTRA_ROWS = 1;
export function createGroundPlane() {
  const totalWidth = gridWidth + EXTRA_COLS * 2 * COL_CELL + 4;
  const totalDepth = FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL + 8;
  const groundGeo = new THREE.PlaneGeometry(totalWidth, totalDepth);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
  groundMatRef = groundMat;
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -CUBE_SIZE / 2, (FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL) / 2 - 1);
  gameGroup.add(ground);
}

// ─── Grid visual ─────────────────────────────────────────────────────────────
// Every line on the board (lanes, rows, the extended side tracks, the side
// walls and the red far-wall frame) is one LineSegments with a colour per
// vertex: one draw call instead of ~50. Each segment is tagged core, fade or
// wall so applyEnvironment can repaint them.
const LINE_CORE = 0;
const LINE_FADE = 1;
const LINE_WALL = 2;

export function createGridVisual() {
  const floorY = -CUBE_SIZE / 2 + 0.01;
  const positions = [];
  const kinds = [];
  const seg = (kind, x1, y1, z1, x2, y2, z2) => {
    positions.push(x1, y1, z1, x2, y2, z2);
    kinds.push(kind, kind);
  };

  const farZ = FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL + 1;
  const coreLeftX = -COL_CELL / 2;
  const coreRightX = GRID_COLS * COL_CELL - COL_CELL / 2;
  const extLeftX = coreLeftX - EXTRA_COLS * COL_CELL;
  const extRightX = coreRightX + EXTRA_COLS * COL_CELL;

  for (let i = 1; i <= EXTRA_COLS; i++) {
    seg(LINE_FADE, coreLeftX - i * COL_CELL, floorY, -2, coreLeftX - i * COL_CELL, floorY, farZ);
    seg(LINE_FADE, coreRightX + i * COL_CELL, floorY, -2, coreRightX + i * COL_CELL, floorY, farZ);
  }
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * COL_CELL - COL_CELL / 2;
    seg(LINE_CORE, x, floorY, -2, x, floorY, farZ);
  }

  const totalRows = GRID_ROWS + EXTRA_ROWS;
  for (let r = 0; r <= totalRows; r++) {
    const z = r * DEPTH_CELL - DEPTH_CELL / 2;
    seg(r <= GRID_ROWS ? LINE_CORE : LINE_FADE, extLeftX, floorY, z, extRightX, floorY, z);
  }

  // Side walls share the theme's core grid color
  const wallHeight = CUBE_SIZE * 2;
  for (const x of [coreLeftX, coreRightX]) {
    for (let r = 0; r <= GRID_ROWS; r += 2) {
      seg(LINE_CORE, x, floorY, r * DEPTH_CELL, x, floorY + wallHeight, r * DEPTH_CELL);
    }
    seg(LINE_CORE, x, floorY + wallHeight, -2, x, floorY + wallHeight, FIELD_DEPTH + 1);
  }

  // The far wall's frame
  const wallZ = (GRID_ROWS - 1) * DEPTH_CELL + DEPTH_CELL / 2;
  seg(LINE_WALL, coreLeftX, floorY, wallZ, coreRightX, floorY, wallZ);
  seg(LINE_WALL, coreLeftX, floorY, wallZ, coreLeftX, floorY + wallHeight, wallZ);
  seg(LINE_WALL, coreLeftX, floorY + wallHeight, wallZ, coreRightX, floorY + wallHeight, wallZ);
  seg(LINE_WALL, coreRightX, floorY + wallHeight, wallZ, coreRightX, floorY, wallZ);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(kinds.length * 3), 3));
  gridLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
  gridLines.userData.kinds = kinds;
  gameGroup.add(gridLines);
  paintGridLines(0x5566aa, 0x334466, 0xff2222);
}

function paintGridLines(core, fade, wall) {
  if (!gridLines) return;
  const colors = [new THREE.Color(core), new THREE.Color(fade), new THREE.Color(wall)];
  const attr = gridLines.geometry.getAttribute('color');
  gridLines.userData.kinds.forEach((kind, i) => {
    const c = colors[kind];
    attr.setXYZ(i, c.r, c.g, c.b);
  });
  attr.needsUpdate = true;
}

// Background, ground and grid lines for a theme (the cube palette is separate)
export function applyEnvironment(theme) {
  scene.background.setHex(theme.bg);
  if (groundMatRef) groundMatRef.color.setHex(theme.ground);
  paintGridLines(theme.gridCore, theme.gridFade, 0xff2222);
}

// Lights react to the dynamic intensity (0-1)
export function setIntensityLighting(intensityLevel) {
  // Ambient light reacts to intensity
  ambientLight.intensity = 0.4 + intensityLevel * 0.4;

  // Directional light pulses
  dirLight.intensity = 1.0 + intensityLevel * 0.5;

  // Back light color shifts toward warm during intensity
  const r = 0.27 + intensityLevel * 0.5;
  const g = 0.4 - intensityLevel * 0.2;
  const b = 1.0 - intensityLevel * 0.4;
  backLight.color.setRGB(r, g, b);
}
