import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID_COLS = 7;
const GRID_ROWS = 12;
const CUBE_SIZE = 1;
const GAP = 0.05;
const CELL = CUBE_SIZE + GAP;
const SHOOT_SPEED = 20;
const WALL_ADVANCE_INTERVAL_START = 15; // seconds
const WALL_ADVANCE_INTERVAL_MIN = 5;
const WALL_ADVANCE_SPEEDUP = 0.5; // seconds faster each advance
const COLORS = [
  0xff4444, // red
  0x44bb44, // green
  0x4488ff, // blue
  0xffcc00, // yellow
  0xff66ff, // magenta
];
const COLOR_NAMES = ['#ff4444', '#44bb44', '#4488ff', '#ffcc00', '#ff66ff'];

// ─── State ───────────────────────────────────────────────────────────────────
let grid = []; // grid[col][row] = { mesh, colorIndex } | null
let currentCol = Math.floor(GRID_COLS / 2);
let currentColorIndex = randomColorIndex();
let nextColorIndex = randomColorIndex();
let shootingCube = null;
let shootingVelocity = null;
let score = 0;
let gameOver = false;
let particles = [];
let wallAdvanceTimer = 0;
let wallAdvanceInterval = WALL_ADVANCE_INTERVAL_START;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score-val');
const finalScoreEl = document.getElementById('final-score');
const gameOverScreen = document.getElementById('game-over-screen');
const restartBtn = document.getElementById('restart-btn');
const nextColorBox = document.getElementById('next-color-box');

// ─── Three.js setup ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const gridWidth = GRID_COLS * CELL;
const gridHeight = GRID_ROWS * CELL;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
const centerX = gridWidth / 2 - CELL / 2;
const centerY = gridHeight / 2 - CELL / 2;
camera.position.set(centerX, centerY - 5, 16);
camera.lookAt(centerX, centerY + 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 10);
scene.add(dirLight);

// ─── Grid visual (floor lines) ──────────────────────────────────────────────
function createGridVisual() {
  const material = new THREE.LineBasicMaterial({ color: 0x333355 });

  // Vertical lines
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * CELL - CELL / 2 - GAP / 2;
    const points = [
      new THREE.Vector3(x, -CELL / 2 - GAP / 2, -0.5),
      new THREE.Vector3(x, GRID_ROWS * CELL - CELL / 2 - GAP / 2, -0.5),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    scene.add(new THREE.Line(geo, material));
  }

  // Horizontal lines
  for (let r = 0; r <= GRID_ROWS; r++) {
    const y = r * CELL - CELL / 2 - GAP / 2;
    const points = [
      new THREE.Vector3(-CELL / 2 - GAP / 2, y, -0.5),
      new THREE.Vector3(GRID_COLS * CELL - CELL / 2 - GAP / 2, y, -0.5),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    scene.add(new THREE.Line(geo, material));
  }

  // Back wall indicator (the far wall where cubes stack)
  const wallMat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
  const wallY = (GRID_ROWS - 1) * CELL + CELL / 2 + GAP / 2;
  const wallPoints = [
    new THREE.Vector3(-CELL / 2 - GAP / 2, wallY, -0.5),
    new THREE.Vector3(GRID_COLS * CELL - CELL / 2 - GAP / 2, wallY, -0.5),
  ];
  const wallGeo = new THREE.BufferGeometry().setFromPoints(wallPoints);
  scene.add(new THREE.Line(wallGeo, wallMat));
}

// ─── Column highlight ────────────────────────────────────────────────────────
const highlightGeo = new THREE.PlaneGeometry(CUBE_SIZE, GRID_ROWS * CELL);
const highlightMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.04,
});
const columnHighlight = new THREE.Mesh(highlightGeo, highlightMat);
columnHighlight.position.z = -0.4;
scene.add(columnHighlight);

function updateColumnHighlight() {
  columnHighlight.position.x = currentCol * CELL;
  columnHighlight.position.y = (GRID_ROWS * CELL) / 2 - CELL / 2;
}

// ─── Spawn-point cube (preview at bottom) ────────────────────────────────────
const spawnGeo = new THREE.BoxGeometry(CUBE_SIZE * 0.9, CUBE_SIZE * 0.9, CUBE_SIZE * 0.9);
const spawnMat = new THREE.MeshLambertMaterial({ color: COLORS[currentColorIndex] });
const spawnCube = new THREE.Mesh(spawnGeo, spawnMat);
spawnCube.position.y = -CELL * 1.5;
scene.add(spawnCube);

function updateSpawnCube() {
  spawnCube.position.x = currentCol * CELL;
  spawnMat.color.setHex(COLORS[currentColorIndex]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomColorIndex() {
  return Math.floor(Math.random() * COLORS.length);
}

function colToX(col) {
  return col * CELL;
}

function rowToY(row) {
  return row * CELL;
}

function createCubeMesh(colorIndex) {
  const geo = new THREE.BoxGeometry(CUBE_SIZE * 0.9, CUBE_SIZE * 0.9, CUBE_SIZE * 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: COLORS[colorIndex] });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ─── Grid logic ──────────────────────────────────────────────────────────────
function initGrid() {
  grid = [];
  for (let c = 0; c < GRID_COLS; c++) {
    grid[c] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      grid[c][r] = null;
    }
  }
}

function placeCube(col, row, colorIndex) {
  if (row < 0 || row >= GRID_ROWS) return null;
  const mesh = createCubeMesh(colorIndex);
  mesh.position.set(colToX(col), rowToY(row), 0);
  scene.add(mesh);
  grid[col][row] = { mesh, colorIndex };
  return grid[col][row];
}

function removeCube(col, row) {
  const cell = grid[col][row];
  if (!cell) return;
  scene.remove(cell.mesh);
  cell.mesh.geometry.dispose();
  cell.mesh.material.dispose();
  grid[col][row] = null;
}

function landingRow(col) {
  // Cubes stack against the wall (top). Find the lowest occupied row,
  // then land one row below it. If column is empty, land at the top.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[col][r]) {
      return r - 1; // one below the lowest cube in the stack
    }
  }
  return GRID_ROWS - 1; // empty column — land at the wall
}

// ─── Adjacency detection (flood fill for same color) ─────────────────────────
function findMatchGroup(col, row) {
  const cell = grid[col][row];
  if (!cell) return [];

  const targetColor = cell.colorIndex;
  const visited = new Set();
  const group = [];

  function flood(c, r) {
    const key = `${c},${r}`;
    if (visited.has(key)) return;
    if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return;
    const cell2 = grid[c][r];
    if (!cell2 || cell2.colorIndex !== targetColor) return;

    visited.add(key);
    group.push({ col: c, row: r });

    flood(c - 1, r);
    flood(c + 1, r);
    flood(c, r - 1);
    flood(c, r + 1);
  }

  flood(col, row);
  return group;
}

// ─── Particle explosion ─────────────────────────────────────────────────────
function spawnParticles(col, row, colorIndex) {
  const cx = colToX(col);
  const cy = rowToY(row);
  const count = 12;
  for (let i = 0; i < count; i++) {
    const size = 0.1 + Math.random() * 0.15;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS[colorIndex] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, 0);
    scene.add(mesh);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = 3 + Math.random() * 4;
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: (Math.random() - 0.5) * speed,
      life: 0.6 + Math.random() * 0.4,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 9.8 * dt;
    p.life -= dt;
    p.mesh.scale.setScalar(Math.max(0, p.life));

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ─── Gravity (cubes float up toward the wall after matches) ──────────────────
function applyGravity() {
  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[c][r]) {
        if (r !== writeRow) {
          grid[c][writeRow] = grid[c][r];
          grid[c][r] = null;
          grid[c][writeRow].mesh.position.y = rowToY(writeRow);
        }
        writeRow--;
      }
    }
  }
}

// ─── Chain-check: after gravity, check for new matches ───────────────────────
function resolveMatches() {
  let totalCleared = 0;
  let changed = true;

  while (changed) {
    changed = false;
    const toRemove = new Set();

    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        if (!grid[c][r]) continue;
        const group = findMatchGroup(c, r);
        if (group.length >= 3) {
          group.forEach((g) => toRemove.add(`${g.col},${g.row}`));
        }
      }
    }

    if (toRemove.size > 0) {
      changed = true;
      toRemove.forEach((key) => {
        const [c, r] = key.split(',').map(Number);
        const cell = grid[c][r];
        if (cell) {
          spawnParticles(c, r, cell.colorIndex);
          removeCube(c, r);
          totalCleared++;
        }
      });
      applyGravity();
    }
  }

  return totalCleared;
}

// ─── Shooting ────────────────────────────────────────────────────────────────
function shoot() {
  if (gameOver || shootingCube) return;

  const row = landingRow(currentCol);
  if (row < 0) return; // column full

  const mesh = createCubeMesh(currentColorIndex);
  mesh.position.set(colToX(currentCol), spawnCube.position.y, 0);
  scene.add(mesh);

  shootingCube = {
    mesh,
    col: currentCol,
    targetRow: row,
    colorIndex: currentColorIndex,
  };
  shootingVelocity = SHOOT_SPEED;

  // Advance colors
  currentColorIndex = nextColorIndex;
  nextColorIndex = randomColorIndex();
  updateSpawnCube();
  updateNextPreview();
}

function updateShooting(dt) {
  if (!shootingCube) return;

  const targetY = rowToY(shootingCube.targetRow);
  shootingCube.mesh.position.y += shootingVelocity * dt;

  if (shootingCube.mesh.position.y >= targetY) {
    shootingCube.mesh.position.y = targetY;

    // Place in grid
    scene.remove(shootingCube.mesh);
    shootingCube.mesh.geometry.dispose();
    shootingCube.mesh.material.dispose();

    placeCube(shootingCube.col, shootingCube.targetRow, shootingCube.colorIndex);

    const cleared = resolveMatches();
    if (cleared > 0) {
      score += cleared * 10;
      scoreEl.textContent = score;
    }

    shootingCube = null;
    shootingVelocity = null;

    checkGameOver();
  }
}

// ─── Wall advancement (wall pushes down toward the player) ───────────────────
function advanceWall() {
  // Check if any column has a cube at row 0 — can't shift down
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c][0]) {
      triggerGameOver();
      return;
    }
  }

  // Shift everything down by one row
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      grid[c][r] = grid[c][r + 1];
      if (grid[c][r]) {
        grid[c][r].mesh.position.y = rowToY(r);
      }
    }
    grid[c][GRID_ROWS - 1] = null;
  }

  // Add a new random row at the top (against the wall)
  for (let c = 0; c < GRID_COLS; c++) {
    const ci = randomColorIndex();
    placeCube(c, GRID_ROWS - 1, ci);
  }

  // Check matches after wall advance
  const cleared = resolveMatches();
  if (cleared > 0) {
    score += cleared * 10;
    scoreEl.textContent = score;
  }

  // Speed up
  wallAdvanceInterval = Math.max(WALL_ADVANCE_INTERVAL_MIN, wallAdvanceInterval - WALL_ADVANCE_SPEEDUP);

  checkGameOver();
}

// ─── Game Over ───────────────────────────────────────────────────────────────
function checkGameOver() {
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c][0]) {
      triggerGameOver();
      return;
    }
  }
}

function triggerGameOver() {
  gameOver = true;
  finalScoreEl.textContent = score;
  gameOverScreen.style.display = 'flex';
}

function restartGame() {
  // Clear grid
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (grid[c][r]) {
        scene.remove(grid[c][r].mesh);
        grid[c][r].mesh.geometry.dispose();
        grid[c][r].mesh.material.dispose();
        grid[c][r] = null;
      }
    }
  }

  // Clear particles
  particles.forEach((p) => {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  });
  particles = [];

  // Clear shooting cube
  if (shootingCube) {
    scene.remove(shootingCube.mesh);
    shootingCube.mesh.geometry.dispose();
    shootingCube.mesh.material.dispose();
    shootingCube = null;
  }

  score = 0;
  scoreEl.textContent = '0';
  gameOver = false;
  wallAdvanceTimer = 0;
  wallAdvanceInterval = WALL_ADVANCE_INTERVAL_START;
  currentCol = Math.floor(GRID_COLS / 2);
  currentColorIndex = randomColorIndex();
  nextColorIndex = randomColorIndex();

  updateSpawnCube();
  updateColumnHighlight();
  updateNextPreview();

  gameOverScreen.style.display = 'none';

  initGrid();
}

// ─── Next-cube preview ───────────────────────────────────────────────────────
function updateNextPreview() {
  nextColorBox.style.backgroundColor = COLOR_NAMES[nextColorIndex];
}

// ─── Input ───────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (gameOver) return;

  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      currentCol = Math.max(0, currentCol - 1);
      updateSpawnCube();
      updateColumnHighlight();
      break;
    case 'ArrowRight':
    case 'KeyD':
      currentCol = Math.min(GRID_COLS - 1, currentCol + 1);
      updateSpawnCube();
      updateColumnHighlight();
      break;
    case 'Space':
      e.preventDefault();
      shoot();
      break;
  }
});

restartBtn.addEventListener('click', restartGame);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init & Game Loop ────────────────────────────────────────────────────────
initGrid();
createGridVisual();
updateSpawnCube();
updateColumnHighlight();
updateNextPreview();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (!gameOver) {
    updateShooting(dt);
    updateParticles(dt);

    // Wall advancement timer
    wallAdvanceTimer += dt;
    if (wallAdvanceTimer >= wallAdvanceInterval) {
      wallAdvanceTimer = 0;
      advanceWall();
    }
  } else {
    updateParticles(dt);
  }

  renderer.render(scene, camera);
}

animate();
