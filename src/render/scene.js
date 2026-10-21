// ─── Scene ───────────────────────────────────────────────────────────────────
// The renderer, the lights, and the static board: the paper ground, the grid
// lines, the danger floor and the far-wall slab. Everything that moves lives
// in gameGroup.

import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS, wallInterval } from '../game/rules.js';
import { state } from '../game/state.js';
import { TINTS, currentTint, setTint, tintForTheme } from './palette.js';
import { installFrameMeter } from './perf.js';

export const CUBE_SIZE = 1;
export const COL_CELL = CUBE_SIZE;
export const DEPTH_CELL = CUBE_SIZE;
export const FIELD_DEPTH = GRID_ROWS * DEPTH_CELL;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(TINTS.dawn.ground);

export const gridWidth = GRID_COLS * COL_CELL;
export const centerX = gridWidth / 2 - COL_CELL / 2;

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// No shadow map: nothing casts one. Cubes get a cheap contact shadow instead
// (see cubes.js).
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
// Soft daylight on paper: a warm sky/ground fill and one key light from
// above and behind the player's shoulder
const hemiLight = new THREE.HemisphereLight(0xfffaf2, 0xcfc6b8, 1.9);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(centerX - 3, 10, -4);
dirLight.target.position.set(centerX, 0, FIELD_DEPTH / 2);
scene.add(dirLight);
scene.add(dirLight.target);

// ─── Game group ──────────────────────────────────────────────────────────────
export const gameGroup = new THREE.Group();
scene.add(gameGroup);

const FLOOR_Y = -CUBE_SIZE / 2;

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
// Paper all the way to the horizon: the same colour as the background, so
// its edge never shows
const groundMat = new THREE.MeshBasicMaterial({ color: TINTS.dawn.ground });
export function createGroundPlane() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, FLOOR_Y - 0.002, FIELD_DEPTH / 2);
  gameGroup.add(ground);
}

// ─── Grid visual ─────────────────────────────────────────────────────────────
// The lane and row lines on the board are one LineSegments: one draw call
// instead of ~50 separate lines. The lane tints themselves are in cubes.js.
const gridMat = new THREE.LineBasicMaterial({ color: TINTS.dawn.line });

export function createGridVisual() {
  const y = FLOOR_Y + 0.004;
  const nearZ = -1.5;
  const farZ = FIELD_DEPTH - DEPTH_CELL / 2;
  const leftX = -COL_CELL / 2;
  const rightX = GRID_COLS * COL_CELL - COL_CELL / 2;
  const positions = [];
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * COL_CELL - COL_CELL / 2;
    positions.push(x, y, nearZ, x, y, farZ);
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = r * DEPTH_CELL - DEPTH_CELL / 2;
    positions.push(leftX, y, z, rightX, y, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  gameGroup.add(new THREE.LineSegments(geo, gridMat));
}

// ─── Wall progress ───────────────────────────────────────────────────────────
// 0 just after an advance (or during a level-up breather), 1 when the wall
// is due
function wallProgress() {
  if (!state.wallStarted || state.gameOver) return 0;
  return THREE.MathUtils.clamp(state.wallAdvanceTimer / wallInterval(state.level), 0, 1);
}

// ─── Danger floor ────────────────────────────────────────────────────────────
// Rows 0-2, where a cube ends the run, are tinted; the tint deepens from 0 to
// 60% as the wall timer runs down, and holds at 60% while a cube is in them
const DANGER_ROWS = 3;
const dangerMat = new THREE.MeshBasicMaterial({
  color: TINTS.dawn.danger,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const dangerGeo = new THREE.PlaneGeometry(gridWidth, DANGER_ROWS * DEPTH_CELL);
dangerGeo.rotateX(-Math.PI / 2);
const dangerFloor = new THREE.Mesh(dangerGeo, dangerMat);
dangerFloor.position.set(centerX, FLOOR_Y + 0.002, (DANGER_ROWS * DEPTH_CELL) / 2 - DEPTH_CELL / 2);
dangerFloor.renderOrder = 0;
gameGroup.add(dangerFloor);

// ─── Wall slab ───────────────────────────────────────────────────────────────
// The far wall is a solid slab behind the last row. Over each interval it
// creeps toward the board, and when the wall advances it is right behind the
// row that slides in; then it eases back. The wall timer runs along its base.
const SLAB_HEIGHT = 1.25;
const SLAB_DEPTH = 0.45;
const SLAB_REST_GAP = 0.9; // how far back it sits just after an advance
// Front face when the wall is due: right behind where a new row appears
const SLAB_DUE_FRONT = rowToZ(GRID_ROWS - 1) + DEPTH_CELL * 1.5;
const slabMat = new THREE.MeshStandardMaterial({ color: TINTS.dawn.slab, roughness: 0.9, metalness: 0 });
const slab = new THREE.Mesh(new THREE.BoxGeometry(gridWidth + 0.4, SLAB_HEIGHT, SLAB_DEPTH), slabMat);
slab.position.set(centerX, FLOOR_Y + SLAB_HEIGHT / 2, SLAB_DUE_FRONT + SLAB_REST_GAP + SLAB_DEPTH / 2);
gameGroup.add(slab);

const timerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const timerBar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), timerMat);
// On the slab's front face (which looks toward the player, -z), at its base
timerBar.rotation.y = Math.PI;
timerBar.position.set(0, -SLAB_HEIGHT / 2 + 0.12, -SLAB_DEPTH / 2 - 0.002);
slab.add(timerBar);

const TIMER_IMMINENT_S = 3;
const TIMER_CALM = new THREE.Color(0xf3eee6);
const TIMER_IMMINENT = new THREE.Color(0xf25f5c);
let lastFrameAt = performance.now();

function updateBoard() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;

  const progress = wallProgress();
  const target = SLAB_DUE_FRONT + SLAB_REST_GAP * (1 - progress) + SLAB_DEPTH / 2;
  // Ease, so the recoil after an advance is a motion rather than a jump
  slab.position.z += (target - slab.position.z) * (1 - Math.exp(-dt * 12));

  const interval = wallInterval(state.level);
  const left = state.wallStarted ? 1 - progress : 1;
  timerBar.scale.x = Math.max(0.001, left * gridWidth);
  // Drains from the right, anchored at the left edge as seen from the player
  timerBar.position.x = gridWidth / 2 - (left * gridWidth) / 2;
  const imminent = state.wallStarted && !state.gameOver && (1 - progress) * interval <= TIMER_IMMINENT_S;
  timerMat.color.copy(imminent ? TIMER_IMMINENT : TIMER_CALM);

  dangerMat.opacity = 0.6 * Math.max(progress, state.dangerActive ? 1 : 0);
}
onBeforeRender(updateBoard);

// ─── Theme ───────────────────────────────────────────────────────────────────
// A theme picks a tint (palette.js): background, ground, lines, danger floor
// and slab here; the cube colours through setPalette; the HUD through the
// data-tint attribute its CSS keys on.
export function applyEnvironment(theme) {
  const tint = tintForTheme(theme);
  setTint(tint);
  scene.background.setHex(tint.ground);
  groundMat.color.setHex(tint.ground);
  gridMat.color.setHex(tint.line);
  dangerMat.color.setHex(tint.danger);
  slabMat.color.setHex(tint.slab);
  hemiLight.groundColor.setHex(tint.floor);
  document.documentElement.dataset.tint = tint.name.toLowerCase();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#' + tint.ground.toString(16).padStart(6, '0');
}

// Lights react to the dynamic intensity (0-1): a chain warms and brightens
// the key light a little
export function setIntensityLighting(intensityLevel) {
  dirLight.intensity = 1.6 + intensityLevel * 0.5;
  dirLight.color.setRGB(1, 1 - intensityLevel * 0.08, 1 - intensityLevel * 0.18);
}

export { currentTint };
