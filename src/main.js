import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID_COLS = 7;
const GRID_ROWS = 12;
const CUBE_SIZE = 1;
const COL_CELL = CUBE_SIZE; // cubes fill columns exactly, no gap
const DEPTH_CELL = CUBE_SIZE; // cubes fill rows exactly, no gap
const FIELD_DEPTH = GRID_ROWS * DEPTH_CELL; // 12 units deep
const SHOOT_SPEED = 15; // tuned for shorter field
const WALL_ADVANCE_INTERVAL_START = 15;
const WALL_ADVANCE_INTERVAL_MIN = 5;
const WALL_ADVANCE_SPEEDUP = 0.5;
const COLORS = [
  0xff4444, // red
  0x44bb44, // green
  0x4488ff, // blue
  0xffcc00, // yellow
  0xff66ff, // magenta
];
const COLOR_NAMES = ['#ff4444', '#44bb44', '#4488ff', '#ffcc00', '#ff66ff'];

// ─── Audio (Web Audio API — synthesized, no external files) ─────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Unlock AudioContext on first user interaction (browser policy)
function ensureAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
window.addEventListener('keydown', ensureAudio, { once: true });
window.addEventListener('touchstart', ensureAudio, { once: true });

function playExplosionSound() {
  const now = audioCtx.currentTime;

  // Noise burst through bandpass filter for a crunchy pop
  const duration = 0.25;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(800, now);
  bandpass.frequency.exponentialRampToValueAtTime(200, now + duration);
  bandpass.Q.value = 1.5;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(bandpass).connect(gain).connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + duration);

  // Low thump underneath
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(oscGain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

// Throttle bounce sounds so they don't overwhelm
let lastBounceTime = 0;
const BOUNCE_COOLDOWN = 0.04; // seconds between bounce sounds

function playBounceSound(velocity) {
  const now = audioCtx.currentTime;
  if (now - lastBounceTime < BOUNCE_COOLDOWN) return;
  lastBounceTime = now;

  // Volume scales with impact velocity
  const vol = Math.min(0.15, Math.abs(velocity) * 0.025);
  if (vol < 0.005) return; // too quiet, skip

  const duration = 0.06;
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  // Higher pitch for harder impacts
  const freq = 800 + Math.abs(velocity) * 120 + Math.random() * 200;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ─── State ───────────────────────────────────────────────────────────────────
let grid = [];
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
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 6, 18); // fog fades distant cubes

const gridWidth = GRID_COLS * COL_CELL;
const centerX = gridWidth / 2 - COL_CELL / 2;

// Perspective camera — eye-level, standing right behind the spawn cube
const camera = new THREE.PerspectiveCamera(
  60, // wider FOV for dramatic perspective
  window.innerWidth / window.innerHeight,
  0.1,
  50
);
camera.position.set(centerX, 2.5, -6); // elevated, pulled further back
camera.lookAt(centerX, 0, FIELD_DEPTH * 0.4); // angled down the corridor

// Camera tracking state
let cameraTargetX = centerX;
const CAMERA_LERP_SPEED = 8; // how fast camera catches up

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x8888cc, 0.4);
scene.add(ambientLight);

// Main light from above-front to cast shadows down the corridor
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(centerX, 8, -2);
dirLight.target.position.set(centerX, 0, FIELD_DEPTH / 2);
scene.add(dirLight);
scene.add(dirLight.target);

// Subtle fill light from the far wall (cool tone)
const backLight = new THREE.PointLight(0x4466ff, 0.6, 35);
backLight.position.set(centerX, 2, FIELD_DEPTH + 2);
scene.add(backLight);

// ─── Game group (no tilt needed — perspective does the work) ─────────────────
const gameGroup = new THREE.Group();
scene.add(gameGroup);

// ─── Coordinate mapping ─────────────────────────────────────────────────────
// Columns → X axis (left-right)
// Rows → Z axis (depth — row 0 is near player, row 11 is at the far wall)
// Y axis → vertical height (cubes sit on the ground)

function colToX(col) {
  return col * COL_CELL;
}

function rowToZ(row) {
  return row * DEPTH_CELL;
}

// ─── Ground plane ────────────────────────────────────────────────────────────
function createGroundPlane() {
  const groundGeo = new THREE.PlaneGeometry(gridWidth + 4, FIELD_DEPTH + 8);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -CUBE_SIZE / 2, FIELD_DEPTH / 2 - 1);
  gameGroup.add(ground);
}

// ─── Grid visual (floor lines — perspective convergence) ─────────────────────
function createGridVisual() {
  const material = new THREE.LineBasicMaterial({ color: 0x444477 });
  const brightMat = new THREE.LineBasicMaterial({ color: 0x555599 });
  const floorY = -CUBE_SIZE / 2 + 0.01; // just above ground

  // Lines parallel to Z (one per column boundary) — converge to vanishing point
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * COL_CELL - COL_CELL / 2;
    const points = [
      new THREE.Vector3(x, floorY, -2),
      new THREE.Vector3(x, floorY, FIELD_DEPTH + 1),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    gameGroup.add(new THREE.Line(geo, material));
  }

  // Lines parallel to X (one per row boundary) — horizontal rungs
  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = r * DEPTH_CELL - DEPTH_CELL / 2;
    const points = [
      new THREE.Vector3(-COL_CELL / 2, floorY, z),
      new THREE.Vector3(GRID_COLS * COL_CELL - COL_CELL / 2, floorY, z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    gameGroup.add(new THREE.Line(geo, material));
  }

  // Side walls (subtle vertical planes for corridor feel)
  const wallMat = new THREE.LineBasicMaterial({ color: 0x444477 });
  const leftX = -COL_CELL / 2;
  const rightX = GRID_COLS * COL_CELL - COL_CELL / 2;
  const wallHeight = CUBE_SIZE * 2;

  [leftX, rightX].forEach((x) => {
    // Vertical lines along the side walls
    for (let r = 0; r <= GRID_ROWS; r += 2) {
      const z = r * DEPTH_CELL;
      const pts = [
        new THREE.Vector3(x, floorY, z),
        new THREE.Vector3(x, floorY + wallHeight, z),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      gameGroup.add(new THREE.Line(geo, wallMat));
    }
    // Horizontal edge along top of side walls
    const topPts = [
      new THREE.Vector3(x, floorY + wallHeight, -2),
      new THREE.Vector3(x, floorY + wallHeight, FIELD_DEPTH + 1),
    ];
    const topGeo = new THREE.BufferGeometry().setFromPoints(topPts);
    gameGroup.add(new THREE.Line(topGeo, wallMat));
  });

  // Back wall indicator — glowing red line at the far wall
  const wallIndicatorMat = new THREE.LineBasicMaterial({ color: 0xff2222 });
  const wallZ = (GRID_ROWS - 1) * DEPTH_CELL + DEPTH_CELL / 2;
  const wallPts = [
    new THREE.Vector3(leftX, floorY, wallZ),
    new THREE.Vector3(rightX, floorY, wallZ),
  ];
  const wallGeo = new THREE.BufferGeometry().setFromPoints(wallPts);
  gameGroup.add(new THREE.Line(wallGeo, wallIndicatorMat));

  // Back wall vertical line
  const wallVertPts = [
    new THREE.Vector3(leftX, floorY, wallZ),
    new THREE.Vector3(leftX, floorY + wallHeight, wallZ),
    new THREE.Vector3(rightX, floorY + wallHeight, wallZ),
    new THREE.Vector3(rightX, floorY, wallZ),
  ];
  const wallVertGeo = new THREE.BufferGeometry().setFromPoints(wallVertPts);
  gameGroup.add(new THREE.Line(wallVertGeo, wallIndicatorMat));
}

// ─── Column highlight (a strip on the ground going into the distance) ────────
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

function updateColumnHighlight() {
  columnHighlight.position.x = currentCol * COL_CELL;
}

// ─── Spawn-point cube (right in front of the player — big and close) ─────────
const spawnGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const spawnMat = new THREE.MeshLambertMaterial({ color: COLORS[currentColorIndex] });
const spawnCube = new THREE.Mesh(spawnGeo, spawnMat);
spawnCube.position.set(currentCol * COL_CELL, 0, -1); // just in front of camera
gameGroup.add(spawnCube);

function updateSpawnCube() {
  spawnCube.position.x = currentCol * COL_CELL;
  spawnMat.color.setHex(COLORS[currentColorIndex]);
  cameraTargetX = colToX(currentCol);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomColorIndex() {
  return Math.floor(Math.random() * COLORS.length);
}

function createCubeMesh(colorIndex) {
  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const mat = new THREE.MeshLambertMaterial({ color: COLORS[colorIndex] });
  return new THREE.Mesh(geo, mat);
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
  mesh.position.set(colToX(col), 0, rowToZ(row));
  gameGroup.add(mesh);
  grid[col][row] = { mesh, colorIndex };
  return grid[col][row];
}

function removeCube(col, row) {
  const cell = grid[col][row];
  if (!cell) return;
  gameGroup.remove(cell.mesh);
  cell.mesh.geometry.dispose();
  cell.mesh.material.dispose();
  grid[col][row] = null;
}

function landingRow(col) {
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[col][r]) {
      return r - 1;
    }
  }
  return GRID_ROWS - 1;
}

// ─── Adjacency detection ─────────────────────────────────────────────────────
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
  playExplosionSound();
  const cx = colToX(col);
  const cz = rowToZ(row);
  const floorY = -CUBE_SIZE / 2;
  const count = 14;
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.14;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS[colorIndex] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    gameGroup.add(mesh);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = 2.5 + Math.random() * 3.5;
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.abs(Math.sin(angle)) * speed * 0.8 + 2, // strong upward burst
      vz: Math.sin(angle) * speed * 0.5,
      life: 1.2 + Math.random() * 0.6, // longer life for bounces
      floorY: floorY + size / 2, // ground level accounting for particle size
      bounceDamping: 0.4 + Math.random() * 0.2, // energy kept per bounce
      spinSpeed: (Math.random() - 0.5) * 12, // tumble rotation
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 12 * dt; // gravity

    // Bounce off ground
    if (p.mesh.position.y <= p.floorY && p.vy < 0) {
      playBounceSound(p.vy);
      p.mesh.position.y = p.floorY;
      p.vy = -p.vy * p.bounceDamping; // reverse and dampen
      p.vx *= 0.8; // friction on bounce
      p.vz *= 0.8;
    }

    // Tumble rotation
    p.mesh.rotation.x += p.spinSpeed * dt;
    p.mesh.rotation.z += p.spinSpeed * 0.7 * dt;

    p.life -= dt;
    // Fade out over the last 0.4s of life
    const fadeStart = 0.4;
    const scale = p.life < fadeStart ? p.life / fadeStart : 1;
    p.mesh.scale.setScalar(Math.max(0, scale));

    if (p.life <= 0) {
      gameGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ─── Gravity (cubes slide toward the wall after matches) ─────────────────────
function applyGravity() {
  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[c][r]) {
        if (r !== writeRow) {
          grid[c][writeRow] = grid[c][r];
          grid[c][r] = null;
          grid[c][writeRow].mesh.position.z = rowToZ(writeRow);
        }
        writeRow--;
      }
    }
  }
}

// ─── Chain-check ─────────────────────────────────────────────────────────────
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

// ─── Shooting (cube flies forward into the corridor) ─────────────────────────
function shoot() {
  if (gameOver || shootingCube) return;

  const row = landingRow(currentCol);
  if (row < 0) return;

  const mesh = createCubeMesh(currentColorIndex);
  mesh.position.set(colToX(currentCol), 0, spawnCube.position.z);
  gameGroup.add(mesh);

  shootingCube = {
    mesh,
    col: currentCol,
    targetRow: row,
    colorIndex: currentColorIndex,
  };
  shootingVelocity = SHOOT_SPEED;

  currentColorIndex = nextColorIndex;
  nextColorIndex = randomColorIndex();
  updateSpawnCube();
  updateNextPreview();
}

function updateShooting(dt) {
  if (!shootingCube) return;

  const targetZ = rowToZ(shootingCube.targetRow);
  shootingCube.mesh.position.z += shootingVelocity * dt;

  if (shootingCube.mesh.position.z >= targetZ) {
    shootingCube.mesh.position.z = targetZ;

    gameGroup.remove(shootingCube.mesh);
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

// ─── Wall advancement (wall pushes toward the player) ────────────────────────
function advanceWall() {
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c][0]) {
      triggerGameOver();
      return;
    }
  }

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      grid[c][r] = grid[c][r + 1];
      if (grid[c][r]) {
        grid[c][r].mesh.position.z = rowToZ(r);
      }
    }
    grid[c][GRID_ROWS - 1] = null;
  }

  for (let c = 0; c < GRID_COLS; c++) {
    const ci = randomColorIndex();
    placeCube(c, GRID_ROWS - 1, ci);
  }

  const cleared = resolveMatches();
  if (cleared > 0) {
    score += cleared * 10;
    scoreEl.textContent = score;
  }

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
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (grid[c][r]) {
        gameGroup.remove(grid[c][r].mesh);
        grid[c][r].mesh.geometry.dispose();
        grid[c][r].mesh.material.dispose();
        grid[c][r] = null;
      }
    }
  }

  particles.forEach((p) => {
    gameGroup.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  });
  particles = [];

  if (shootingCube) {
    gameGroup.remove(shootingCube.mesh);
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

  // Reset camera to center
  cameraTargetX = colToX(currentCol);
  camera.position.x = cameraTargetX;

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
      currentCol = Math.min(GRID_COLS - 1, currentCol + 1);
      updateSpawnCube();
      updateColumnHighlight();
      break;
    case 'ArrowRight':
    case 'KeyD':
      currentCol = Math.max(0, currentCol - 1);
      updateSpawnCube();
      updateColumnHighlight();
      break;
    case 'Space':
      e.preventDefault();
      shoot();
      break;
  }
});

// ─── Touch / swipe controls (mobile) ─────────────────────────────────────────
let touchStartX = null;
let touchStartY = null;
const SWIPE_THRESHOLD = 30; // min px to count as a swipe

window.addEventListener('touchstart', (e) => {
  if (gameOver) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (gameOver || touchStartX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  touchStartX = null;
  touchStartY = null;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Must exceed threshold
  if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

  if (absDy > absDx) {
    // Vertical swipe — only care about up (shoot)
    if (dy < 0) {
      shoot();
    }
  } else {
    // Horizontal swipe — move column
    // Camera faces +Z so screen-left = +X, screen-right = -X
    if (dx < 0) {
      // swipe left on screen → visual left → +X column
      currentCol = Math.min(GRID_COLS - 1, currentCol + 1);
    } else {
      // swipe right on screen → visual right → -X column
      currentCol = Math.max(0, currentCol - 1);
    }
    updateSpawnCube();
    updateColumnHighlight();
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
createGroundPlane();
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

    wallAdvanceTimer += dt;
    if (wallAdvanceTimer >= wallAdvanceInterval) {
      wallAdvanceTimer = 0;
      advanceWall();
    }
  } else {
    updateParticles(dt);
  }

  // Smooth camera tracking — follow spawn cube's X position
  const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
  camera.position.x += (cameraTargetX - camera.position.x) * lerpFactor;
  camera.lookAt(camera.position.x, 0, FIELD_DEPTH * 0.4);

  renderer.render(scene, camera);
}

animate();
