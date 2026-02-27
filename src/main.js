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
const BOUNCE_COOLDOWN = 0.025; // tight cooldown — candies scatter fast

function playBounceSound(velocity) {
  const now = audioCtx.currentTime;
  if (now - lastBounceTime < BOUNCE_COOLDOWN) return;
  lastBounceTime = now;

  const vol = Math.min(0.18, Math.abs(velocity) * 0.03);
  if (vol < 0.005) return;

  // Hard candy / M&M hitting a hard floor — bright, clicky, short
  const dur = 0.035;
  const baseFreq = 3000 + Math.random() * 2000 + Math.abs(velocity) * 200;

  // Primary click — sharp sine tap
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + dur);
  const g1 = audioCtx.createGain();
  g1.gain.setValueAtTime(vol, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc1.connect(g1).connect(audioCtx.destination);
  osc1.start(now);
  osc1.stop(now + dur);

  // Shell harmonic — tiny square-wave overtone for the candy-coat click
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'square';
  const shellDur = dur * 0.5;
  osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq, now + shellDur);
  const g2 = audioCtx.createGain();
  g2.gain.setValueAtTime(vol * 0.3, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + shellDur);
  osc2.connect(g2).connect(audioCtx.destination);
  osc2.start(now);
  osc2.stop(now + shellDur);

  // Tiny high-passed noise burst — the "hard surface" texture
  const noiseDur = 0.012;
  const bufSize = Math.ceil(audioCtx.sampleRate * noiseDur);
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.25));
  }
  const noiseSrc = audioCtx.createBufferSource();
  noiseSrc.buffer = buf;
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const gn = audioCtx.createGain();
  gn.gain.setValueAtTime(vol * 0.5, now);
  gn.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
  noiseSrc.connect(hp).connect(gn).connect(audioCtx.destination);
  noiseSrc.start(now);
  noiseSrc.stop(now + noiseDur);
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
const wallWarningEl = document.getElementById('wall-warning');
const shootBtn = document.getElementById('shoot-btn');
const uiEl = document.getElementById('ui');

// ─── Score popups (floating "+N" at match positions) ─────────────────────────
function spawnScorePopup(worldX, worldZ, points) {
  const pos = new THREE.Vector3(worldX, 1, worldZ);
  pos.project(camera);
  const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;

  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = `+${points}`;
  el.style.left = `${sx}px`;
  el.style.top = `${sy}px`;
  uiEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Three.js setup ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
// No fog — keep all cubes fully visible

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
const EXTRA_COLS = 6; // extra columns drawn on each side for infinite-track look
const EXTRA_ROWS = 3; // extra depth lines past the back wall
function createGroundPlane() {
  const totalWidth = gridWidth + EXTRA_COLS * 2 * COL_CELL + 4;
  const totalDepth = FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL + 8;
  const groundGeo = new THREE.PlaneGeometry(totalWidth, totalDepth);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -CUBE_SIZE / 2, (FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL) / 2 - 1);
  gameGroup.add(ground);
}

// ─── Grid visual (floor lines — perspective convergence) ─────────────────────
function createGridVisual() {
  const coreMat = new THREE.LineBasicMaterial({ color: 0x5566aa }); // brighter playable area
  const fadeMat = new THREE.LineBasicMaterial({ color: 0x334466 }); // dimmer extension tracks
  const floorY = -CUBE_SIZE / 2 + 0.01; // just above ground

  const farZ = FIELD_DEPTH + EXTRA_ROWS * DEPTH_CELL + 1;
  const coreLeftX = -COL_CELL / 2;
  const coreRightX = GRID_COLS * COL_CELL - COL_CELL / 2;
  const extLeftX = coreLeftX - EXTRA_COLS * COL_CELL;
  const extRightX = coreRightX + EXTRA_COLS * COL_CELL;

  // ── Longitudinal lines (parallel to Z) ────────────────────────────────────
  // Extra columns on the left
  for (let i = 1; i <= EXTRA_COLS; i++) {
    const x = coreLeftX - i * COL_CELL;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fadeMat));
  }
  // Core playable columns
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = c * COL_CELL - COL_CELL / 2;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), coreMat));
  }
  // Extra columns on the right
  for (let i = 1; i <= EXTRA_COLS; i++) {
    const x = coreRightX + i * COL_CELL;
    const pts = [new THREE.Vector3(x, floorY, -2), new THREE.Vector3(x, floorY, farZ)];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fadeMat));
  }

  // ── Cross lines (parallel to X) — span entire width including extensions ──
  const totalRows = GRID_ROWS + EXTRA_ROWS;
  for (let r = 0; r <= totalRows; r++) {
    const z = r * DEPTH_CELL - DEPTH_CELL / 2;
    const mat = r <= GRID_ROWS ? coreMat : fadeMat;
    // Full-width cross line
    const pts = [
      new THREE.Vector3(extLeftX, floorY, z),
      new THREE.Vector3(extRightX, floorY, z),
    ];
    gameGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  // ── Side walls (only on the playable boundary) ────────────────────────────
  const wallMat = new THREE.LineBasicMaterial({ color: 0x5566aa });
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

  // ── Back wall indicator — glowing red line at the far game boundary ───────
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
      let sumX = 0, sumZ = 0, count = 0;
      toRemove.forEach((key) => {
        const [c, r] = key.split(',').map(Number);
        const cell = grid[c][r];
        if (cell) {
          sumX += colToX(c);
          sumZ += rowToZ(r);
          count++;
          spawnParticles(c, r, cell.colorIndex);
          removeCube(c, r);
          totalCleared++;
        }
      });
      if (count > 0) {
        spawnScorePopup(sumX / count, sumZ / count, count * 10);
      }
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

  // Recalculate landing row every frame — grid may have shifted (wall advance)
  const freshRow = landingRow(shootingCube.col);
  if (freshRow < 0) {
    // Column is completely full — discard the shot
    gameGroup.remove(shootingCube.mesh);
    shootingCube.mesh.geometry.dispose();
    shootingCube.mesh.material.dispose();
    shootingCube = null;
    shootingVelocity = null;
    checkGameOver();
    return;
  }
  shootingCube.targetRow = freshRow;

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
  // Remove all grid-tracked cubes
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

  // Nuclear cleanup — remove any orphaned cube meshes that slipped through
  // (e.g., wall advance shifted grid while a cube was in-flight)
  const keepers = new Set([spawnCube, columnHighlight]);
  for (let i = gameGroup.children.length - 1; i >= 0; i--) {
    const child = gameGroup.children[i];
    if (child.isMesh && child.geometry?.type === 'BoxGeometry' && !keepers.has(child)) {
      gameGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
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

  wallWarningEl.classList.remove('active');
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

// ─── Touch controls (hold & drag — responsive with feedback) ─────────────────
let touchStartX = null;
let touchStartY = null;
let touchStartCol = null;
let touchDragged = false;
const DRAG_COL_PX = 40; // pixels of horizontal drag per column shift

// Visual feedback state — scale pop on column change
let spawnScalePop = 0; // 0 = no pop, 1 = full pop, decays over time

// Haptic feedback helper
function hapticPulse(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// Short tick sound on column change
function playTickSound() {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.03);
}

function moveToColumn(newCol) {
  if (newCol === currentCol) return;
  currentCol = newCol;
  updateSpawnCube();
  updateColumnHighlight();
  // Feedback burst
  spawnScalePop = 1;
  hapticPulse(12);
  playTickSound();
}

window.addEventListener('touchstart', (e) => {
  if (gameOver) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartCol = currentCol;
  touchDragged = false;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (gameOver || touchStartX === null) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStartX;

  // Calculate how many columns the drag has shifted
  // Negative screen dx = drag left → +column (visual left = +X)
  const colShift = Math.round(-dx / DRAG_COL_PX);
  const newCol = Math.max(0, Math.min(GRID_COLS - 1, touchStartCol + colShift));

  if (newCol !== currentCol) {
    touchDragged = true;
    moveToColumn(newCol);
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (gameOver || touchStartX === null) {
    touchStartX = null;
    return;
  }
  const t = e.changedTouches[0];
  const dy = t.clientY - touchStartY;

  // Tap (no drag) → shoot
  if (!touchDragged && Math.abs(dy) < 30 && Math.abs(t.clientX - touchStartX) < 30) {
    shoot();
  }
  // Swipe up (no drag) → shoot
  if (!touchDragged && dy < -30) {
    shoot();
  }

  touchStartX = null;
  touchStartY = null;
  touchStartCol = null;
  touchDragged = false;
});

restartBtn.addEventListener('click', restartGame);

// ─── Mobile shoot button ──────────────────────────────────────────────────────
shootBtn.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (!gameOver) shoot();
}, { passive: true });

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
    // Wall advance warning — pulse border in last 3 seconds
    const timeLeft = wallAdvanceInterval - wallAdvanceTimer;
    if (timeLeft <= 3 && timeLeft > 0) {
      wallWarningEl.classList.add('active');
    } else {
      wallWarningEl.classList.remove('active');
    }
    if (wallAdvanceTimer >= wallAdvanceInterval) {
      wallAdvanceTimer = 0;
      wallWarningEl.classList.remove('active');
      advanceWall();
    }
  } else {
    updateParticles(dt);
  }

  // Spawn cube scale-pop feedback (decays quickly)
  if (spawnScalePop > 0) {
    spawnScalePop = Math.max(0, spawnScalePop - dt * 8); // decay in ~0.12s
    const s = 1 + spawnScalePop * 0.25; // peak at 1.25x scale
    spawnCube.scale.set(s, s, s);
  } else {
    spawnCube.scale.set(1, 1, 1);
  }

  // Smooth camera tracking — follow spawn cube's X position
  const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
  camera.position.x += (cameraTargetX - camera.position.x) * lerpFactor;
  camera.lookAt(camera.position.x, 0, FIELD_DEPTH * 0.4);

  renderer.render(scene, camera);
}

animate();
