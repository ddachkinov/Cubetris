import * as THREE from 'three';
import { MusicEngine } from './music.js';
import { THEMES } from './themes.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID_COLS = 7;
const GRID_ROWS = 12;
const CUBE_SIZE = 1;
const COL_CELL = CUBE_SIZE;
const DEPTH_CELL = CUBE_SIZE;
const FIELD_DEPTH = GRID_ROWS * DEPTH_CELL;
const SHOOT_SPEED = 15;
const WALL_ADVANCE_INTERVAL_START = 12;
const WALL_ADVANCE_INTERVAL_MIN = 2;
const CLEARS_PER_LEVEL = 10;
const ROW_CLEAR_BONUS = 200;
const ZONE_CHARGE_MAX = 100;
const ZONE_CHARGE_PER_CLEAR = 5;
const ZONE_DURATION = 8; // seconds
const ZONE_TIME_SCALE = 0.15; // 15% speed during zone
const COLORS = [
  0xff4444, // red
  0x44bb44, // green
  0x4488ff, // blue
  0xffcc00, // yellow
  0xff66ff, // magenta
];
let COLOR_NAMES = COLORS.map((c) => '#' + c.toString(16).padStart(6, '0'));

function refreshColorNames() {
  COLOR_NAMES = COLORS.map((c) => '#' + c.toString(16).padStart(6, '0'));
}

// Special cube indices (beyond normal COLORS array)
const RAINBOW_INDEX = COLORS.length;     // 5
const BOMB_INDEX = COLORS.length + 1;    // 6

// ─── Audio (Web Audio API — synthesized, no external files) ─────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const music = new MusicEngine(audioCtx);

function ensureAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  music.start();
}

// Quantize musical SFX to the next 8th note of the soundtrack (the Lumines
// trick) — clears land ON the beat and the game starts to feel like an
// instrument. Falls back to "now" before the music has started.
function qTime() {
  return music.started ? music.nextGridTime(2) : audioCtx.currentTime;
}
window.addEventListener('keydown', ensureAudio, { once: true });
window.addEventListener('touchstart', ensureAudio, { once: true });

let lastExplosionTime = 0;
const EXPLOSION_COOLDOWN = 0.04;

function playExplosionSound() {
  const now = audioCtx.currentTime;
  if (now - lastExplosionTime < EXPLOSION_COOLDOWN) return;
  lastExplosionTime = now;

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

let lastBounceTime = 0;
const BOUNCE_COOLDOWN = 0.025;

function playBounceSound(velocity) {
  const now = audioCtx.currentTime;
  if (now - lastBounceTime < BOUNCE_COOLDOWN) return;
  lastBounceTime = now;

  const vol = Math.min(0.18, Math.abs(velocity) * 0.03);
  if (vol < 0.005) return;

  const dur = 0.035;
  const baseFreq = 3000 + Math.random() * 2000 + Math.abs(velocity) * 200;

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

function playLevelUpSound() {
  const now = qTime();
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const t = now + i * 0.08;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

function playBombSound() {
  const now = audioCtx.currentTime;
  const duration = 0.4;

  // Heavy low-pass noise
  const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(600, now);
  lp.frequency.exponentialRampToValueAtTime(100, now + duration);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(lp).connect(gain).connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + duration);

  // Deep bass thud
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(oscGain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

function playRowClearSound() {
  const now = qTime();
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, now);
  lp.frequency.exponentialRampToValueAtTime(500, now + 0.3);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(lp).connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

// ─── Zone activation sound ──────────────────────────────────────────────────
function playZoneActivateSound() {
  const now = audioCtx.currentTime;
  // Ascending whoosh
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.25, now);
  g.gain.linearRampToValueAtTime(0.15, now + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.6);

  // Shimmering pad
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(800, now);
  osc2.frequency.linearRampToValueAtTime(1000, now + 0.5);
  const g2 = audioCtx.createGain();
  g2.gain.setValueAtTime(0.12, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc2.connect(g2).connect(audioCtx.destination);
  osc2.start(now);
  osc2.stop(now + 0.8);
}

function playZoneDeactivateSound() {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

// Low thump played on the beat while in danger — synced via music.onBeat
function playHeartbeat(time) {
  const o = audioCtx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(55, time);
  o.frequency.exponentialRampToValueAtTime(35, time + 0.12);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.22, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  o.connect(g).connect(audioCtx.destination);
  o.start(time);
  o.stop(time + 0.2);
}

// Triumphant rising arp for clutch saves
function playClutchSound() {
  const t0 = qTime();
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    const t = t0 + i * 0.05;
    const o = audioCtx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.25);
  });
}

// ─── Enhanced chain combo sounds (pitch + harmony escalation) ───────────────
function playChainSound(chainStep) {
  const now = qTime();
  const baseNote = 523; // C5
  const freq = baseNote * Math.pow(2, (chainStep - 1) * 2 / 12);
  const vol = Math.min(0.3, 0.15 + chainStep * 0.03);
  const dur = 0.12 + chainStep * 0.02;

  // Primary tone - escalating pitch
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + dur * 0.3);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + dur);

  // Harmony - fifth above at chain >= 2
  if (chainStep >= 2) {
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.5, now);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(vol * 0.5, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.8);
    osc2.connect(g2).connect(audioCtx.destination);
    osc2.start(now);
    osc2.stop(now + dur);
  }

  // Octave + sparkle at chain >= 3
  if (chainStep >= 3) {
    const osc3 = audioCtx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 2, now);
    osc3.frequency.exponentialRampToValueAtTime(freq * 2.5, now + dur * 0.5);
    const g3 = audioCtx.createGain();
    g3.gain.setValueAtTime(vol * 0.3, now);
    g3.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc3.connect(g3).connect(audioCtx.destination);
    osc3.start(now);
    osc3.stop(now + dur);
  }

  // Deep resonance at chain >= 4
  if (chainStep >= 4) {
    const osc4 = audioCtx.createOscillator();
    osc4.type = 'sine';
    osc4.frequency.setValueAtTime(freq * 0.5, now);
    const g4 = audioCtx.createGain();
    g4.gain.setValueAtTime(vol * 0.4, now);
    g4.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.2);
    osc4.connect(g4).connect(audioCtx.destination);
    osc4.start(now);
    osc4.stop(now + dur * 1.2);
  }
}

// ─── State ───────────────────────────────────────────────────────────────────
// Progression (must be before randomColorIndex calls)
let level = 1;
let totalClearedCount = 0;
let highScore = parseInt(localStorage.getItem('cubetris-best') || '0', 10);

// Swappable RNG — Math.random normally, a date-seeded PRNG for Daily runs
let rng = Math.random;
let dailyMode = false;

// Bag-based color dealing (like Tetris's 7-bag): 2 of each active color per
// bag, shuffled. Kills droughts/floods so the game feels fair.
let colorBag = [];
let bagColorCount = 0;

let grid = [];
let currentCol = Math.floor(GRID_COLS / 2);
let currentColorIndex = randomColorIndex();
let nextQueue = [randomColorIndex(), randomColorIndex(), randomColorIndex()];
let heldColorIndex = null;
let holdUsedThisTurn = false;
let shootingCube = null;
let shootingVelocity = null;
let score = 0;
let gameOver = false;
let paused = false;
let particles = [];
let wallAdvanceTimer = 0;

// Juice state
let shakeTimer = 0;
let shakeIntensity = 0;
let freezeTimer = 0;

// Rainbow animation timer
let rainbowTime = 0;

// Zone (time-freeze) power-up state
let zoneCharge = 0;
let zoneActive = false;
let zoneTimer = 0;
let zoneClearedInZone = 0; // cubes cleared during zone for bonus

// Dynamic intensity state
let intensityLevel = 0; // 0-1 scale based on recent activity
let lastChainStep = 0;
let flashTimer = 0;
let flashColor = 0xffffff;

// Chain counter display state
let chainDisplayTimer = 0;
let chainDisplayStep = 0;

// Shooting trail particles
let trailParticles = [];

// Danger / clutch state
let dangerActive = false;
let slowMoTimer = 0;

// Run stats (per game) + lifetime stats + badges
let runStats = { bestChain: 0, cleared: 0, zones: 0, clutches: 0 };
let lifeStats = JSON.parse(
  localStorage.getItem('cubetris-stats')
  || '{"cleared":0,"bestChain":0,"games":0,"zones":0,"clutches":0}'
);
let badges = new Set(JSON.parse(localStorage.getItem('cubetris-badges') || '[]'));
let runBadges = [];

// ─── DOM refs ────────────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score-val');
const bestEl = document.getElementById('best-val');
const levelEl = document.getElementById('level-val');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const newBestEl = document.getElementById('new-best');
const gameOverScreen = document.getElementById('game-over-screen');
const restartBtn = document.getElementById('restart-btn');
const qSlot0 = document.getElementById('q-slot-0');
const qSlot1 = document.getElementById('q-slot-1');
const qSlot2 = document.getElementById('q-slot-2');
const holdBoxEl = document.getElementById('hold-preview');
const clutchEl = document.getElementById('clutch-banner');
const badgeToastEl = document.getElementById('badge-toast');
const runStatsEl = document.getElementById('run-stats');
const runBadgesEl = document.getElementById('run-badges');
const dailyResultEl = document.getElementById('daily-result');
const dailyBtn = document.getElementById('daily-btn');
const dailyIndicatorEl = document.getElementById('daily-indicator');
const wallWarningEl = document.getElementById('wall-warning');
const levelUpEl = document.getElementById('level-up');
const rowClearEl = document.getElementById('row-clear');
const uiEl = document.getElementById('ui');
const tutorialEl = document.getElementById('tutorial');
const tutorialBtn = document.getElementById('tutorial-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const zoneBarFill = document.getElementById('zone-fill');
const zoneBarContainer = document.getElementById('zone-bar');
const zoneBannerEl = document.getElementById('zone-banner');
const chainCounterEl = document.getElementById('chain-counter');
const flashOverlayEl = document.getElementById('flash-overlay');

bestEl.textContent = highScore;

// ─── Score popups ─────────────────────────────────────────────────────────────
function spawnScorePopup(worldX, worldZ, label, extraClass) {
  const pos = new THREE.Vector3(worldX, 1, worldZ);
  pos.project(camera);
  const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;

  const el = document.createElement('div');
  el.className = 'score-popup' + (extraClass ? ' ' + extraClass : '');
  el.textContent = label;
  el.style.left = `${sx}px`;
  el.style.top = `${sy}px`;
  uiEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Three.js setup ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const gridWidth = GRID_COLS * COL_CELL;
const centerX = gridWidth / 2 - COL_CELL / 2;

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  50
);
camera.position.set(centerX, 2.5, -6);
camera.lookAt(centerX, 0, FIELD_DEPTH * 0.4);

let cameraTargetX = centerX;
const CAMERA_LERP_SPEED = 8;
const cameraBaseY = 2.5;
const cameraBaseZ = -6;

const renderer = new THREE.WebGLRenderer({ antialias: true });
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
const gameGroup = new THREE.Group();
scene.add(gameGroup);

// Theme state — material refs so applyTheme can recolor the environment
let groundMatRef = null;
let gridCoreMatRef = null;
let gridFadeMatRef = null;
let currentThemeIndex = -1;

// ─── Coordinate mapping ─────────────────────────────────────────────────────
function colToX(col) {
  return col * COL_CELL;
}

function rowToZ(row) {
  return row * DEPTH_CELL;
}

// ─── Ground plane ────────────────────────────────────────────────────────────
const EXTRA_COLS = 6;
const EXTRA_ROWS = 3;
function createGroundPlane() {
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
function createGridVisual() {
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

// ─── Theme application (Lumines-style skins, rotate every 3 levels) ──────────
function applyTheme(idx) {
  const theme = THEMES[idx % THEMES.length];
  currentThemeIndex = idx % THEMES.length;

  scene.background.setHex(theme.bg);
  if (groundMatRef) groundMatRef.color.setHex(theme.ground);
  if (gridCoreMatRef) gridCoreMatRef.color.setHex(theme.gridCore);
  if (gridFadeMatRef) gridFadeMatRef.color.setHex(theme.gridFade);

  // Swap the cube palette (same 5 hue families, theme-tinted)
  for (let i = 0; i < COLORS.length; i++) COLORS[i] = theme.palette[i];
  refreshColorNames();

  // Recolor every existing normal cube on the board
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

  music.setTheme(theme.music);

  updateSpawnCube();
  updateNextPreview();
  updateHoldPreview();
  updateGhost();
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

function updateColumnHighlight() {
  columnHighlight.position.x = currentCol * COL_CELL;
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

function updateGhost() {
  if (gameOver || paused || shootingCube) {
    ghostCube.visible = false;
    return;
  }
  const row = landingRow(currentCol);
  if (row < 0) {
    ghostCube.visible = false;
    return;
  }
  ghostCube.position.set(colToX(currentCol), 0, rowToZ(row));
  if (currentColorIndex === RAINBOW_INDEX) {
    ghostMat.color.setHex(0xffffff);
  } else if (currentColorIndex === BOMB_INDEX) {
    ghostMat.color.setHex(0xff8800);
  } else {
    ghostMat.color.setHex(COLORS[currentColorIndex]);
  }
  ghostCube.visible = true;
}

// ─── Spawn-point cube ────────────────────────────────────────────────────────
const spawnGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const spawnMat = new THREE.MeshLambertMaterial({ color: COLORS[0] });
const spawnCube = new THREE.Mesh(spawnGeo, spawnMat);
spawnCube.position.set(currentCol * COL_CELL, 0, -1);
gameGroup.add(spawnCube);

function updateSpawnCube() {
  spawnCube.position.x = currentCol * COL_CELL;
  if (currentColorIndex === RAINBOW_INDEX) {
    spawnMat.color.setHex(0xffffff);
    spawnMat.emissive.setHex(0x333333);
  } else if (currentColorIndex === BOMB_INDEX) {
    spawnMat.color.setHex(0xff6600);
    spawnMat.emissive.setHex(0x221100);
  } else {
    spawnMat.color.setHex(COLORS[currentColorIndex]);
    spawnMat.emissive.setHex(0x000000);
  }
  cameraTargetX = colToX(currentCol);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getActiveColorCount() {
  if (level >= 4) return 5;
  if (level >= 2) return 4;
  return 3;
}

function getWallInterval() {
  // Tied to level: starts at 12s, drops ~0.8s per level, floors at 2s
  return Math.max(WALL_ADVANCE_INTERVAL_MIN, WALL_ADVANCE_INTERVAL_START - (level - 1) * 0.8);
}

// ─── Seeded RNG (Daily runs) ─────────────────────────────────────────────────
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Bag-based color dealing ─────────────────────────────────────────────────
function drawColorFromBag() {
  const n = getActiveColorCount();
  if (bagColorCount !== n) {
    colorBag = [];
    bagColorCount = n;
  }
  if (colorBag.length === 0) {
    for (let i = 0; i < n; i++) colorBag.push(i, i);
    for (let i = colorBag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [colorBag[i], colorBag[j]] = [colorBag[j], colorBag[i]];
    }
  }
  return colorBag.pop();
}

function randomColorIndex() {
  // Special cubes at higher levels
  if (level >= 6 && rng() < 0.04) return BOMB_INDEX;
  if (level >= 4 && rng() < 0.05) return RAINBOW_INDEX;
  return drawColorFromBag();
}

// Wall rows only get normal colors (not bag-dealt — walls should feel wild)
function randomWallColorIndex() {
  return Math.floor(rng() * getActiveColorCount());
}

function createCubeMesh(colorIndex) {
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

  // Specials don't participate in color flood-fill
  if (cell.colorIndex === BOMB_INDEX || cell.colorIndex === RAINBOW_INDEX) return [];

  const targetColor = cell.colorIndex;
  const visited = new Set();
  const group = [];

  function flood(c, r) {
    const key = `${c},${r}`;
    if (visited.has(key)) return;
    if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return;
    const cell2 = grid[c][r];
    if (!cell2) return;
    // Only match same color; skip specials
    if (cell2.colorIndex !== targetColor) return;

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
  // Particle count scales with intensity level
  const baseCount = colorIndex === BOMB_INDEX ? 8 : 14;
  const count = Math.round(baseCount * (1 + intensityLevel * 0.5));
  for (let i = 0; i < count; i++) {
    let pColor;
    if (colorIndex === RAINBOW_INDEX) {
      pColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    } else if (colorIndex === BOMB_INDEX) {
      pColor = Math.random() < 0.5 ? 0xff6600 : 0xffcc00;
    } else {
      pColor = COLORS[colorIndex];
    }

    const size = 0.08 + Math.random() * 0.14;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshLambertMaterial({ color: pColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    gameGroup.add(mesh);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speedMult = 1 + intensityLevel * 0.4;
    const speed = (colorIndex === BOMB_INDEX ? (3.5 + Math.random() * 4) : (2.5 + Math.random() * 3.5)) * speedMult;
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.abs(Math.sin(angle)) * speed * 0.8 + (colorIndex === BOMB_INDEX ? 3 : 2),
      vz: Math.sin(angle) * speed * 0.5,
      life: 1.2 + Math.random() * 0.6,
      floorY: floorY + size / 2,
      bounceDamping: 0.4 + Math.random() * 0.2,
      spinSpeed: (Math.random() - 0.5) * 12,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 12 * dt;

    if (p.mesh.position.y <= p.floorY && p.vy < 0) {
      playBounceSound(p.vy);
      p.mesh.position.y = p.floorY;
      p.vy = -p.vy * p.bounceDamping;
      p.vx *= 0.8;
      p.vz *= 0.8;
    }

    p.mesh.rotation.x += p.spinSpeed * dt;
    p.mesh.rotation.z += p.spinSpeed * 0.7 * dt;

    p.life -= dt;
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

// ─── Gravity ─────────────────────────────────────────────────────────────────
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

// ─── Screen shake + hit-freeze ───────────────────────────────────────────────
function triggerShake(intensity, duration) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeTimer = Math.max(shakeTimer, duration);
}

function triggerFreeze(duration) {
  freezeTimer = Math.max(freezeTimer, duration);
}

// ─── Flash overlay (screen flash on big clears) ─────────────────────────────
function triggerFlash(color, intensity) {
  flashOverlayEl.style.background = '#' + color.toString(16).padStart(6, '0');
  flashOverlayEl.style.opacity = intensity;
  flashTimer = 0.15;
}

// ─── Danger state + clutch saves ────────────────────────────────────────────
// Danger = any cube within 2 rows of the front. Clearing your way out of
// danger is a "clutch" — slow-mo celebration + bonus. These near-death saves
// are the moments players remember and talk about.
function isInDanger() {
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c] && (grid[c][1] || grid[c][2])) return true;
  }
  return false;
}

function triggerClutch() {
  slowMoTimer = 0.7;
  const bonus = 150;
  score += bonus;
  scoreEl.textContent = score;
  runStats.clutches++;
  lifeStats.clutches = (lifeStats.clutches || 0) + 1;
  awardBadge('clutch-1', 'Clutch Save');

  clutchEl.textContent = `CLUTCH! +${bonus}`;
  clutchEl.style.display = 'block';
  clutchEl.style.animation = 'none';
  void clutchEl.offsetWidth;
  clutchEl.style.animation = 'rowclear 1.1s ease-out forwards';
  clutchEl.addEventListener('animationend', () => {
    clutchEl.style.display = 'none';
  }, { once: true });

  playClutchSound();
  triggerFlash(0x66ffe0, 0.2);
  triggerShake(0.18, 0.3);
  hapticPulse(40);
}

// ─── Badges + lifetime stats ────────────────────────────────────────────────
function saveLifeStats() {
  localStorage.setItem('cubetris-stats', JSON.stringify(lifeStats));
}

function awardBadge(id, label) {
  if (badges.has(id)) return;
  badges.add(id);
  runBadges.push(label);
  localStorage.setItem('cubetris-badges', JSON.stringify([...badges]));
  showBadgeToast(label);
}

function showBadgeToast(label) {
  badgeToastEl.textContent = `🏅 BADGE: ${label}`;
  badgeToastEl.style.display = 'block';
  badgeToastEl.style.animation = 'none';
  void badgeToastEl.offsetWidth;
  badgeToastEl.style.animation = 'badge-in 2.2s ease-out forwards';
  badgeToastEl.addEventListener('animationend', () => {
    badgeToastEl.style.display = 'none';
  }, { once: true });
}

// ─── Zone power-up ──────────────────────────────────────────────────────────
function updateZoneBar() {
  const pct = Math.min(100, (zoneCharge / ZONE_CHARGE_MAX) * 100);
  zoneBarFill.style.height = pct + '%';
  if (zoneActive) {
    zoneBarContainer.className = 'active';
    const zonePct = Math.min(100, (zoneTimer / ZONE_DURATION) * 100);
    zoneBarFill.style.height = zonePct + '%';
  } else if (zoneCharge >= ZONE_CHARGE_MAX) {
    zoneBarContainer.className = 'charged';
  } else {
    zoneBarContainer.className = '';
  }
}

function activateZone() {
  if (zoneCharge < ZONE_CHARGE_MAX || zoneActive || gameOver || paused) return;
  zoneActive = true;
  zoneTimer = ZONE_DURATION;
  zoneCharge = 0;
  zoneClearedInZone = 0;
  document.body.classList.add('zone-active');

  zoneBannerEl.textContent = 'Z O N E';
  zoneBannerEl.style.display = 'block';
  zoneBannerEl.style.animation = 'none';
  void zoneBannerEl.offsetWidth;
  zoneBannerEl.style.animation = 'zone-activate 1.4s ease-out forwards';
  zoneBannerEl.addEventListener('animationend', () => {
    zoneBannerEl.style.display = 'none';
  }, { once: true });

  playZoneActivateSound();
  music.setZoneFilter(true); // underwater lowpass while time is slowed
  runStats.zones++;
  lifeStats.zones = (lifeStats.zones || 0) + 1;
  awardBadge('zone-1', 'In The Zone');
  triggerShake(0.2, 0.3);
  triggerFlash(0xffcc00, 0.25);
  hapticPulse(30);
  updateZoneBar();
}

function deactivateZone() {
  zoneActive = false;
  document.body.classList.remove('zone-active');
  music.setZoneFilter(false);
  playZoneDeactivateSound();

  // Bonus score for cubes cleared during zone
  if (zoneClearedInZone > 0) {
    const bonus = zoneClearedInZone * 15;
    score += bonus;
    scoreEl.textContent = score;
    spawnScorePopup(colToX(3), rowToZ(6), `ZONE +${bonus}`, 'combo');
  }
  updateZoneBar();
}

function chargeZone(clearedCount) {
  if (zoneActive) {
    zoneClearedInZone += clearedCount;
    return;
  }
  zoneCharge = Math.min(ZONE_CHARGE_MAX, zoneCharge + clearedCount * ZONE_CHARGE_PER_CLEAR);
  updateZoneBar();
}

// ─── Chain counter display ──────────────────────────────────────────────────
function showChainCounter(step) {
  if (step < 2) return;
  chainDisplayStep = step;
  chainDisplayTimer = 1.2;

  const labels = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'HEXA', 'MEGA', 'ULTRA', 'INSANE'];
  const label = step < labels.length ? labels[step] : `${step}x CHAIN`;

  chainCounterEl.textContent = `${label}!`;
  chainCounterEl.style.display = 'block';
  chainCounterEl.style.animation = 'none';
  void chainCounterEl.offsetWidth;

  // Color escalation based on chain step
  const colors = ['', '', '#ff6ef5', '#ff4444', '#ffcc00', '#44ff88', '#4488ff', '#ffffff'];
  const color = step < colors.length ? colors[step] : '#ffffff';
  chainCounterEl.style.color = color;
  chainCounterEl.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
  chainCounterEl.style.fontSize = Math.min(72, 40 + step * 8) + 'px';

  chainCounterEl.style.animation = 'chain-pop 1.2s ease-out forwards';
  chainCounterEl.addEventListener('animationend', () => {
    chainCounterEl.style.display = 'none';
  }, { once: true });
}

// ─── Shooting trail particles ───────────────────────────────────────────────
function spawnTrailParticle(x, y, z, color) {
  const size = 0.06 + Math.random() * 0.08;
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z);
  gameGroup.add(mesh);
  trailParticles.push({
    mesh,
    life: 0.3 + Math.random() * 0.2,
    maxLife: 0.3 + Math.random() * 0.2,
    vy: (Math.random() - 0.5) * 0.5,
    vx: (Math.random() - 0.5) * 0.5,
  });
}

function updateTrailParticles(dt) {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const p = trailParticles[i];
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    const alpha = Math.max(0, p.life / p.maxLife);
    p.mesh.material.opacity = alpha * 0.8;
    p.mesh.scale.setScalar(alpha);
    if (p.life <= 0) {
      gameGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      trailParticles.splice(i, 1);
    }
  }
}

// ─── Dynamic intensity ──────────────────────────────────────────────────────
function updateDynamicIntensity(dt, chainStep) {
  // Intensity spikes on chains, decays over time
  const targetIntensity = Math.min(1, chainStep * 0.25);
  if (targetIntensity > intensityLevel) {
    intensityLevel = targetIntensity;
  } else {
    intensityLevel = Math.max(0, intensityLevel - dt * 0.3);
  }

  // Ambient light reacts to intensity
  ambientLight.intensity = 0.4 + intensityLevel * 0.4;

  // Directional light pulses
  dirLight.intensity = 1.0 + intensityLevel * 0.5;

  // Back light color shifts toward warm during intensity
  const r = 0.27 + intensityLevel * 0.5;
  const g = 0.4 - intensityLevel * 0.2;
  const b = 1.0 - intensityLevel * 0.4;
  backLight.color.setRGB(r, g, b);

  // Flash overlay decay
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0) {
      flashOverlayEl.style.opacity = 0;
    } else {
      flashOverlayEl.style.opacity = parseFloat(flashOverlayEl.style.opacity) * 0.85;
    }
  }

  // Drive the music stems: combos and danger both push the mix harder
  music.setIntensity(Math.max(intensityLevel, dangerActive ? 0.55 : 0));
  music.update(dt);
}

// ─── Level progression ───────────────────────────────────────────────────────
function checkLevelUp(clearedThisAction) {
  totalClearedCount += clearedThisAction;
  const newLevel = Math.floor(totalClearedCount / CLEARS_PER_LEVEL) + 1;
  if (newLevel > level) {
    level = newLevel;
    levelEl.textContent = `Level ${level}`;

    // Rotate theme every 3 levels — the level-up becomes an audiovisual reveal
    const themeIdx = Math.floor((level - 1) / 3) % THEMES.length;
    const themeChanged = themeIdx !== currentThemeIndex;
    if (themeChanged) applyTheme(themeIdx);

    if (level >= 5) awardBadge('level-5', 'Survivor');
    if (level >= 10) awardBadge('level-10', 'Veteran');

    levelUpEl.innerHTML = `LEVEL ${level}` + (themeChanged
      ? `<div style="font-size:20px;letter-spacing:6px;margin-top:6px;">${THEMES[themeIdx].name}</div>`
      : '');
    levelUpEl.style.display = 'block';
    levelUpEl.style.animation = 'none';
    void levelUpEl.offsetWidth;
    levelUpEl.style.animation = 'lvlup 1.4s ease-out forwards';
    levelUpEl.addEventListener('animationend', () => {
      levelUpEl.style.display = 'none';
    }, { once: true });

    playLevelUpSound();
    triggerShake(0.15, 0.3);
  }
}

// ─── Row clear banner ────────────────────────────────────────────────────────
function showRowClearBanner(count) {
  const text = count > 1 ? `${count}x ROW CLEAR! +${count * ROW_CLEAR_BONUS}` : `ROW CLEAR! +${ROW_CLEAR_BONUS}`;
  rowClearEl.textContent = text;
  rowClearEl.style.display = 'block';
  rowClearEl.style.animation = 'none';
  void rowClearEl.offsetWidth;
  rowClearEl.style.animation = 'rowclear 1s ease-out forwards';
  rowClearEl.addEventListener('animationend', () => {
    rowClearEl.style.display = 'none';
  }, { once: true });
  playRowClearSound();
}

// ─── Chain-check (with combos, bombs, row clears) ────────────────────────────
function resolveMatches() {
  const dangerBefore = isInDanger();
  let totalCleared = 0;
  let chainStep = 0;
  let changed = true;
  let totalRowClears = 0;
  let anyBombsDetonated = false;

  while (changed) {
    changed = false;
    const toRemove = new Set();

    // 0. Rainbow activation: cross-clear (itself + 4 orthogonal neighbors)
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const cell = grid[c][r];
        if (cell && cell.colorIndex === RAINBOW_INDEX) {
          toRemove.add(`${c},${r}`);
          [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].forEach(([nc, nr]) => {
            if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS && grid[nc][nr]) {
              toRemove.add(`${nc},${nr}`);
            }
          });
        }
      }
    }

    // 1. Find color matches
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        if (!grid[c][r]) continue;
        const group = findMatchGroup(c, r);
        if (group.length >= 3) {
          group.forEach((g) => toRemove.add(`${g.col},${g.row}`));
        }
      }
    }

    // 2. Bomb chain detonation — bombs adjacent to removed cells explode
    if (toRemove.size > 0) {
      for (let iter = 0; iter < 10; iter++) {
        const bombKeys = [];
        for (let c = 0; c < GRID_COLS; c++) {
          for (let r = 0; r < GRID_ROWS; r++) {
            const cell = grid[c][r];
            if (!cell || cell.colorIndex !== BOMB_INDEX) continue;
            if (toRemove.has(`${c},${r}`)) continue;
            // Check if any neighbor is being removed
            const adj = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
            const triggered = adj.some(([ac, ar]) => toRemove.has(`${ac},${ar}`));
            if (triggered) bombKeys.push([c, r]);
          }
        }
        if (bombKeys.length === 0) break;
        anyBombsDetonated = true;
        bombKeys.forEach(([bc, br]) => {
          for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
              const nc = bc + dc, nr = br + dr;
              if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS && grid[nc][nr]) {
                toRemove.add(`${nc},${nr}`);
              }
            }
          }
        });
      }
    }

    if (toRemove.size > 0) {
      changed = true;
      chainStep++;

      // 3. Check for full row clears (all GRID_COLS cells in a row removed)
      for (let r = 0; r < GRID_ROWS; r++) {
        let allCols = true;
        for (let c = 0; c < GRID_COLS; c++) {
          if (!toRemove.has(`${c},${r}`)) {
            allCols = false;
            break;
          }
        }
        if (allCols) totalRowClears++;
      }

      // 4. Process removals
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
        const points = count * 10 * chainStep;
        const isCombo = chainStep > 1;
        const label = isCombo ? `+${points} x${chainStep}` : `+${points}`;
        spawnScorePopup(sumX / count, sumZ / count, label, isCombo ? 'combo' : '');
        if (isCombo) {
          playChainSound(chainStep);
          showChainCounter(chainStep);
          // Flash on big chains
          if (chainStep >= 3) {
            triggerFlash(0xff66ff, 0.15 + chainStep * 0.05);
          }
        }
      }
      applyGravity();
    }
  }

  // Post-resolve effects
  if (anyBombsDetonated) playBombSound();

  if (totalRowClears > 0) {
    showRowClearBanner(totalRowClears);
    triggerShake(0.25, 0.35);
    triggerFreeze(0.1);
  }

  if (totalCleared > 0) {
    const bigClear = totalCleared >= 5;
    const isChain = chainStep > 1;

    if (bigClear || isChain) {
      triggerFreeze(0.08);
      triggerShake(0.12 + chainStep * 0.06, 0.2 + chainStep * 0.05);
    } else {
      triggerShake(0.06, 0.12);
    }

    // Zone charging
    chargeZone(totalCleared);

    // Dynamic intensity spike
    lastChainStep = chainStep;

    // Flash on big clears
    if (totalCleared >= 8) {
      triggerFlash(0xffffff, 0.2);
    }

    // Chain badges
    if (chainStep >= 3) awardBadge('chain-3', 'Chain Reaction');
    if (chainStep >= 5) awardBadge('chain-5', 'Chain Master');

    // Clutch save: this clear pulled us out of the danger zone
    if (dangerBefore && !isInDanger()) triggerClutch();
  }

  return { totalCleared, chainStep, totalRowClears };
}

// ─── Score handling ──────────────────────────────────────────────────────────
function addScore(cleared, chainStep, rowClears) {
  const points = cleared * 10 * Math.max(1, chainStep);
  const rowBonus = rowClears * ROW_CLEAR_BONUS;
  score += points + rowBonus;
  scoreEl.textContent = score;

  // Stats + badges
  runStats.cleared += cleared;
  lifeStats.cleared = (lifeStats.cleared || 0) + cleared;
  if (chainStep > runStats.bestChain) runStats.bestChain = chainStep;
  if (chainStep > (lifeStats.bestChain || 0)) lifeStats.bestChain = chainStep;
  if (lifeStats.cleared >= 1000) awardBadge('cubes-1000', '1,000 Cubes Cleared');
  saveLifeStats();

  checkLevelUp(cleared);
}

// ─── Shooting ────────────────────────────────────────────────────────────────
function shoot() {
  if (gameOver || paused || shootingCube) return;

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

  currentColorIndex = nextQueue.shift();
  nextQueue.push(randomColorIndex());
  holdUsedThisTurn = false;
  updateSpawnCube();
  updateNextPreview();
}

function quickDrop() {
  if (gameOver || paused || shootingCube) return;

  const row = landingRow(currentCol);
  if (row < 0) return;

  // Instant placement — no flight animation
  placeCube(currentCol, row, currentColorIndex);

  const { totalCleared, chainStep, totalRowClears } = resolveMatches();
  if (totalCleared > 0) {
    addScore(totalCleared, chainStep, totalRowClears);
  }

  currentColorIndex = nextQueue.shift();
  nextQueue.push(randomColorIndex());
  holdUsedThisTurn = false;
  updateSpawnCube();
  updateNextPreview();

  checkGameOver();
}

// ─── Hold / swap (the classic Tetris banking mechanic) ───────────────────────
// Bank the current cube for later; once per shot to prevent infinite cycling.
function holdSwap() {
  if (gameOver || paused || shootingCube || holdUsedThisTurn) return;
  if (heldColorIndex === null) {
    heldColorIndex = currentColorIndex;
    currentColorIndex = nextQueue.shift();
    nextQueue.push(randomColorIndex());
  } else {
    const t = heldColorIndex;
    heldColorIndex = currentColorIndex;
    currentColorIndex = t;
  }
  holdUsedThisTurn = true;
  spawnScalePop = 1;
  playTickSound();
  hapticPulse(15);
  updateSpawnCube();
  updateGhost();
  updateNextPreview();
  updateHoldPreview();
}

function updateShooting(dt) {
  if (!shootingCube) return;

  const freshRow = landingRow(shootingCube.col);
  if (freshRow < 0) {
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

    const { totalCleared, chainStep, totalRowClears } = resolveMatches();
    if (totalCleared > 0) {
      addScore(totalCleared, chainStep, totalRowClears);
    }

    shootingCube = null;
    shootingVelocity = null;

    checkGameOver();
  }
}

// ─── Wall advancement ────────────────────────────────────────────────────────
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
    const ci = randomWallColorIndex();
    placeCube(c, GRID_ROWS - 1, ci);
  }

  const { totalCleared, chainStep, totalRowClears } = resolveMatches();
  if (totalCleared > 0) {
    addScore(totalCleared, chainStep, totalRowClears);
  }

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

  const isNewBest = score > highScore;
  if (isNewBest) {
    highScore = score;
    localStorage.setItem('cubetris-best', String(highScore));
    bestEl.textContent = highScore;
  }

  finalBestEl.textContent = highScore;
  newBestEl.style.display = isNewBest ? 'block' : 'none';

  // Run recap — defeat should still feel like progress
  lifeStats.games = (lifeStats.games || 0) + 1;
  saveLifeStats();
  runStatsEl.textContent =
    `Best chain x${Math.max(1, runStats.bestChain)} • ${runStats.cleared} cubes • Level ${level}`
    + (runStats.clutches ? ` • ${runStats.clutches} clutch` : '');
  runBadgesEl.textContent = runBadges.length ? '🏅 ' + runBadges.join(' • ') : '';

  // Daily challenge result
  if (dailyMode) {
    const key = 'cubetris-daily-' + todayKey();
    const prev = parseInt(localStorage.getItem(key) || '0', 10);
    if (score > prev) localStorage.setItem(key, String(score));
    dailyResultEl.textContent = `📅 Daily ${todayKey()} — Best: ${Math.max(prev, score)}`;
    dailyResultEl.style.display = 'block';
  } else {
    dailyResultEl.style.display = 'none';
  }

  if (dangerActive) {
    dangerActive = false;
    document.body.classList.remove('danger');
  }

  gameOverScreen.style.display = 'flex';
}

function restartGame(asDaily = false) {
  // Daily runs use a date-seeded PRNG — everyone gets the same board today
  dailyMode = !!asDaily;
  rng = dailyMode ? mulberry32(hashString('cubetris-' + todayKey())) : Math.random;
  colorBag = [];
  bagColorCount = 0;
  dailyIndicatorEl.style.display = dailyMode ? 'block' : 'none';

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

  // Nuclear cleanup — skip keepers
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
  paused = false;
  wallAdvanceTimer = 0;
  currentCol = Math.floor(GRID_COLS / 2);

  // Reset trail particles
  trailParticles.forEach((p) => {
    gameGroup.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  });
  trailParticles = [];

  // Reset juice
  shakeTimer = 0;
  shakeIntensity = 0;
  freezeTimer = 0;
  flashTimer = 0;
  flashOverlayEl.style.opacity = 0;
  intensityLevel = 0;
  lastChainStep = 0;

  // Reset zone
  zoneCharge = 0;
  zoneActive = false;
  zoneTimer = 0;
  zoneClearedInZone = 0;
  document.body.classList.remove('zone-active');
  updateZoneBar();

  // Reset chain display
  chainDisplayTimer = 0;
  chainDisplayStep = 0;
  chainCounterEl.style.display = 'none';

  // Reset danger / clutch
  slowMoTimer = 0;
  if (dangerActive) {
    dangerActive = false;
    document.body.classList.remove('danger');
  }

  // Reset run stats + badges earned this run
  runStats = { bestChain: 0, cleared: 0, zones: 0, clutches: 0 };
  runBadges = [];

  // Reset progression (theme 0 restores environment + palette + music)
  level = 1;
  totalClearedCount = 0;
  levelEl.textContent = 'Level 1';
  applyTheme(0);

  currentColorIndex = randomColorIndex();
  nextQueue = [randomColorIndex(), randomColorIndex(), randomColorIndex()];
  heldColorIndex = null;
  holdUsedThisTurn = false;

  updateSpawnCube();
  updateColumnHighlight();
  updateNextPreview();
  updateHoldPreview();
  updateGhost();

  cameraTargetX = colToX(currentCol);
  camera.position.set(cameraTargetX, cameraBaseY, cameraBaseZ);

  wallWarningEl.classList.remove('active');
  pauseScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';

  initGrid();
}

// ─── Next-queue + hold previews ──────────────────────────────────────────────
function colorCssFor(idx) {
  if (idx === RAINBOW_INDEX) {
    return `linear-gradient(135deg, ${COLOR_NAMES.join(', ')})`;
  }
  if (idx === BOMB_INDEX) return '#ff6600';
  return COLOR_NAMES[idx];
}

function paintSlot(el, idx) {
  el.style.background = (idx === null || idx === undefined) ? 'transparent' : colorCssFor(idx);
}

function updateNextPreview() {
  paintSlot(qSlot0, nextQueue[0]);
  paintSlot(qSlot1, nextQueue[1]);
  paintSlot(qSlot2, nextQueue[2]);
}

function updateHoldPreview() {
  paintSlot(holdBoxEl, heldColorIndex);
}

// ─── Pause ───────────────────────────────────────────────────────────────────
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  pauseScreen.style.display = paused ? 'flex' : 'none';
  if (!paused) {
    // Discard accumulated delta to prevent dt spike on resume
    clock.getDelta();
  }
}

pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', () => {
  paused = false;
  pauseScreen.style.display = 'none';
  restartGame();
});

// ─── Input ───────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!gameOver) togglePause();
    return;
  }
  // Instant retry — the restart loop IS the addiction loop
  if (gameOver && (e.code === 'KeyR' || e.code === 'Enter')) {
    restartGame(dailyMode);
    return;
  }
  if (gameOver || paused) return;

  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      currentCol = Math.min(GRID_COLS - 1, currentCol + 1);
      updateSpawnCube();
      updateColumnHighlight();
      updateGhost();
      break;
    case 'ArrowRight':
    case 'KeyD':
      currentCol = Math.max(0, currentCol - 1);
      updateSpawnCube();
      updateColumnHighlight();
      updateGhost();
      break;
    case 'Space':
      e.preventDefault();
      shoot();
      break;
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      quickDrop();
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      quickDrop();
      break;
    case 'KeyQ':
      e.preventDefault();
      activateZone();
      break;
    case 'KeyE':
      e.preventDefault();
      holdSwap();
      break;
  }
});

// ─── Touch controls ──────────────────────────────────────────────────────────
let touchStartX = null;
let touchStartY = null;
let touchStartCol = null;
let touchDragged = false;
const DRAG_COL_PX = 40;

let spawnScalePop = 0;

function hapticPulse(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

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
  updateGhost();
  spawnScalePop = 1;
  hapticPulse(12);
  playTickSound();
}

// Taps on interactive UI (zone bar, hold box, buttons) must not shoot
function isUiTarget(e) {
  const t = e.target;
  return t && t.closest && t.closest('#zone-bar, #hold-preview, #pause-btn, #daily-btn, button');
}

window.addEventListener('touchstart', (e) => {
  if (gameOver || paused) return;
  if (isUiTarget(e)) {
    touchStartX = null;
    return;
  }
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartCol = currentCol;
  touchDragged = false;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (gameOver || paused || touchStartX === null) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStartX;

  const colShift = Math.round(-dx / DRAG_COL_PX);
  const newCol = Math.max(0, Math.min(GRID_COLS - 1, touchStartCol + colShift));

  if (newCol !== currentCol) {
    touchDragged = true;
    moveToColumn(newCol);
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (gameOver || paused || touchStartX === null) {
    touchStartX = null;
    return;
  }
  const t = e.changedTouches[0];
  const dy = t.clientY - touchStartY;

  if (!touchDragged && Math.abs(dy) < 30 && Math.abs(t.clientX - touchStartX) < 30) {
    shoot();
  } else if (!touchDragged && dy < -30) {
    shoot();
  } else if (!touchDragged && dy > 40) {
    quickDrop(); // swipe down = instant placement
  }

  touchStartX = null;
  touchStartY = null;
  touchStartCol = null;
  touchDragged = false;
});

restartBtn.addEventListener('click', () => restartGame(false));

// Tappable Zone bar + Hold box (mobile-critical: Zone was keyboard-only)
zoneBarContainer.addEventListener('click', () => activateZone());
holdBoxEl.addEventListener('click', () => holdSwap());

// Daily challenge — same seeded board for everyone, resets each calendar day
dailyBtn.addEventListener('click', () => {
  if (paused) togglePause();
  restartGame(true);
});

// ─── Tutorial ─────────────────────────────────────────────────────────────────
const tutorialSeen = localStorage.getItem('cubetris-tutorial-seen');
if (!tutorialSeen) {
  tutorialEl.style.display = 'flex';
}
tutorialBtn.addEventListener('click', () => {
  tutorialEl.style.display = 'none';
  localStorage.setItem('cubetris-tutorial-seen', '1');
  ensureAudio();
});

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Rainbow + bomb visual animation ─────────────────────────────────────────
function updateSpecialCubeVisuals(dt) {
  rainbowTime += dt;

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid[c][r];
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
  if (currentColorIndex === RAINBOW_INDEX) {
    const hue = (rainbowTime * 0.5) % 1;
    spawnMat.color.setHSL(hue, 0.7, 0.7);
    spawnMat.emissive.setHSL(hue, 1, 0.15);
  } else if (currentColorIndex === BOMB_INDEX) {
    const pulse = Math.sin(rainbowTime * 4) * 0.5 + 0.5;
    spawnMat.emissive.setRGB(0.3 * pulse, 0.15 * pulse, 0);
  }
}

// ─── Init & Game Loop ────────────────────────────────────────────────────────
initGrid();
createGroundPlane();
createGridVisual();
applyTheme(0);
updateSpawnCube();
updateColumnHighlight();
updateNextPreview();
updateHoldPreview();
updateGhost();

// Heartbeat synced to the music's beat while in danger
music.onBeat = (time) => {
  if (dangerActive && !gameOver && !paused) playHeartbeat(time);
};

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  let dt = Math.min(clock.getDelta(), 0.05);

  // When paused, still render but don't update game logic
  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  // Hit-freeze: pause game updates briefly on big clears
  if (freezeTimer > 0) {
    freezeTimer -= dt;
    dt = 0;
  }

  // Zone time scaling
  let gameDt = dt;
  if (zoneActive) {
    gameDt = dt * ZONE_TIME_SCALE;
    zoneTimer -= dt;
    updateZoneBar();
    if (zoneTimer <= 0) {
      deactivateZone();
    }
  }

  // Clutch slow-mo (stacks with zone scaling)
  if (slowMoTimer > 0) {
    slowMoTimer -= dt;
    gameDt *= 0.35;
  }

  // Dynamic intensity update (always uses real dt)
  updateDynamicIntensity(dt, lastChainStep);
  // Decay lastChainStep over time
  if (lastChainStep > 0 && flashTimer <= 0) lastChainStep = 0;

  if (!gameOver) {
    // Danger state tracking — drives vignette, heartbeat, and music push
    const dangerNow = isInDanger();
    if (dangerNow !== dangerActive) {
      dangerActive = dangerNow;
      document.body.classList.toggle('danger', dangerActive);
    }

    updateShooting(gameDt);
    updateParticles(dt); // particles always at full speed
    updateTrailParticles(dt);
    updateSpecialCubeVisuals(dt);
    updateGhost();

    // Spawn trail particles behind shooting cube
    if (shootingCube) {
      const sc = shootingCube;
      const trailColor = sc.colorIndex === RAINBOW_INDEX ? 0xffffff
        : sc.colorIndex === BOMB_INDEX ? 0xff6600
        : COLORS[sc.colorIndex];
      if (Math.random() < 0.6) {
        spawnTrailParticle(sc.mesh.position.x, sc.mesh.position.y, sc.mesh.position.z, trailColor);
      }
    }

    // Wall advance (paused during Zone)
    if (!zoneActive) {
      wallAdvanceTimer += gameDt;
    }
    const currentInterval = getWallInterval();
    const timeLeft = currentInterval - wallAdvanceTimer;
    if (timeLeft <= 3 && timeLeft > 0) {
      wallWarningEl.classList.add('active');
    } else {
      wallWarningEl.classList.remove('active');
    }
    if (wallAdvanceTimer >= currentInterval) {
      wallAdvanceTimer = 0;
      wallWarningEl.classList.remove('active');
      advanceWall();
    }
  } else {
    updateParticles(dt);
    updateTrailParticles(dt);
  }

  // Spawn cube scale-pop feedback
  if (spawnScalePop > 0) {
    spawnScalePop = Math.max(0, spawnScalePop - dt * 8);
    const s = 1 + spawnScalePop * 0.25;
    spawnCube.scale.set(s, s, s);
  } else {
    spawnCube.scale.set(1, 1, 1);
  }

  // Ghost preview pulse
  if (ghostCube.visible) {
    ghostMat.opacity = 0.18 + Math.sin(Date.now() * 0.005) * 0.1;
  }

  // Dynamic FOV: widens slightly during intensity, narrows during zone
  const targetFov = zoneActive ? 55 : (60 + intensityLevel * 8);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();

  // Smooth camera tracking
  const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
  camera.position.x += (cameraTargetX - camera.position.x) * lerpFactor;

  // Screen shake
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    const t = shakeTimer > 0 ? shakeTimer : 0;
    const decay = t / 0.3;
    const ox = (Math.random() - 0.5) * shakeIntensity * decay * 2;
    const oy = (Math.random() - 0.5) * shakeIntensity * decay * 2;
    camera.position.y = cameraBaseY + oy;
    camera.position.z = cameraBaseZ + ox;
    if (shakeTimer <= 0) {
      shakeIntensity = 0;
      camera.position.y = cameraBaseY;
      camera.position.z = cameraBaseZ;
    }
  }

  camera.lookAt(camera.position.x, 0, FIELD_DEPTH * 0.4);

  renderer.render(scene, camera);
}

animate();
