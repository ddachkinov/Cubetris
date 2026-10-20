// ─── Scene ───────────────────────────────────────────────────────────────────
// The renderer, the lights, and the static board: ground, grid lines and side
// walls. Everything that moves lives in gameGroup.

import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../game/rules.js';

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

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

// Theme state — material refs so applyEnvironment can recolor the board
let groundMatRef = null;
let gridCoreMatRef = null;
let gridFadeMatRef = null;

// ─── Coordinate mapping ─────────────────────────────────────────────────────
export function colToX(col) {
  return col * COL_CELL;
}

export function rowToZ(row) {
  return row * DEPTH_CELL;
}

// Take a mesh out of the scene and free its GPU buffers
export function disposeMesh(mesh) {
  gameGroup.remove(mesh);
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
export function createGridVisual() {
  const coreMat = new THREE.LineBasicMaterial({ color: 0x5566aa });
  const fadeMat = new THREE.LineBasicMaterial({ color: 0x334466 });
  gridCoreMatRef = coreMat;
  gridFadeMatRef = fadeMat;
  const floorY = -CUBE_SIZE / 2 + 0.01;

  const farZ = FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL + 1;
  const coreLeftX = -COL_CELL / 2;
  const coreRightX = GRID_COLS * COL_CELL - COL_CELL / 2;
  const extLeftX = coreLeftX - EXTRA_COLS * COL_CELL;
  const extRightX = coreRightX + EXTRA_COLS * COL_CELL;

  for (let i = 1; i <= EXTRA_COLS; i++) {
    const x = coreLeftX - i * COL_CELL;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fadeMat));
  }
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * COL_CELL - COL_CELL / 2;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), coreMat));
  }
  for (let i = 1; i <= EXTRA_COLS; i++) {
    const x = coreRightX + i * COL_CELL;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fadeMat));
  }

  const totalRows = GRID_ROWS + EXTRA_ROWS;
  for (let r = 0; r <= totalRows; r++) {
    const z = r * DEPTH_CELL - DEPTH_CELL / 2;
    const mat = r <= GRID_ROWS ? coreMat : fadeMat;
    const pts = [
      new THREE.Vector3(extLeftX, floorY, z),
      new THREE.Vector3(extRightX, floorY, z),
    ];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  const wallMat = coreMat; // side walls share the theme's core grid color
  const wallHeight = CUBE_SIZE * 2;

  [coreLeftX, coreRightX].forEach((x) => {
    for (let r = 0; r <= GRID_ROWS; r += 2) {
      const z = r * DEPTH_CELL;
      const pts = [
        new THREE.Vector3(x, floorY, z),
        new THREE.Vector3(x, floorY + wallHeight, z),
      ];
      gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wallMat));
    }
    const topPts = [
      new THREE.Vector3(x, floorY + wallHeight, -2),
      new THREE.Vector3(x, floorY + wallHeight, FIELD_DEPTH + 1),
    ];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topPts), wallMat));
  });

  const wallIndicatorMat = new THREE.LineBasicMaterial({ color: 0xff2222 });
  const wallZ = (GRID_ROWS - 1) * DEPTH_CELL + DEPTH_CELL / 2;
  const wallPts = [
    new THREE.Vector3(coreLeftX, floorY, wallZ),
    new THREE.Vector3(coreRightX, floorY, wallZ),
  ];
  gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wallPts), wallIndicatorMat));

  const wallVertPts = [
    new THREE.Vector3(coreLeftX, floorY, wallZ),
    new THREE.Vector3(coreLeftX, floorY + wallHeight, wallZ),
    new THREE.Vector3(coreRightX, floorY + wallHeight, wallZ),
    new THREE.Vector3(coreRightX, floorY, wallZ),
  ];
  gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wallVertPts), wallIndicatorMat));
}

// Background, ground and grid lines for a theme (the cube palette is separate)
export function applyEnvironment(theme) {
  scene.background.setHex(theme.bg);
  if (groundMatRef) groundMatRef.color.setHex(theme.ground);
  if (gridCoreMatRef) gridCoreMatRef.color.setHex(theme.gridCore);
  if (gridFadeMatRef) gridFadeMatRef.color.setHex(theme.gridFade);
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
