// ─── Particles ───────────────────────────────────────────────────────────────
// Debris from cleared cubes, and the trail behind a cube in flight.
//
// Both come out of one pool drawn by one InstancedMesh of MAX_PARTICLES unit
// boxes, each scaled into a shard. A 10-cube chain used to create and dispose
// ~200 meshes, each with its own geometry and material, in the frame of the
// clear; now a burst only writes numbers into arrays that already exist. When
// the pool is full the oldest particle makes way for the new one.
//
// The pool is opaque: one material, no blending, no sorting. Debris that has
// come to rest sinks through the floor at the end of its life; anything
// still in the air then shrinks away. (A per-instance dithered fade in the
// shader looked a little softer, but intermittently wedged the software GL
// every headless harness runs on, and took the page down with it.)

import * as THREE from 'three';
import { RAINBOW_INDEX, BOMB_INDEX } from '../game/rules.js';
import { state } from '../game/state.js';
import { playExplosionSound, playBounceSound } from '../audio/sfx.js';
import { COLORS } from './palette.js';
import { CUBE_SIZE, gameGroup, colToX, rowToZ, onBeforeRender, uploadIfChanged } from './scene.js';

export const MAX_PARTICLES = 240;

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

const pool = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
pool.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pool.instanceColor.setUsage(THREE.DynamicDrawUsage);
pool.frustumCulled = false;
pool.count = 0;
gameGroup.add(pool);

// Live particles, oldest first. Each holds its own transform; writeInstances
// packs them into the pool right before every draw.
let particles = [];

function makeParticle() {
  return {
    trail: false,
    position: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    size: new THREE.Vector3(1, 1, 1),
    color: new THREE.Color(),
    scale: 1,
  };
}

// Recycled particle objects, so a burst allocates nothing once warm
const spare = [];

function takeParticle() {
  if (particles.length >= MAX_PARTICLES) spare.push(particles.shift());
  const p = spare.pop() || makeParticle();
  p.scale = 1;
  p.rotation.set(0, 0, 0);
  particles.push(p);
  return p;
}

function release(i) {
  spare.push(particles[i]);
  particles.splice(i, 1);
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

const staged = {
  matrix: new Float32Array(MAX_PARTICLES * 16),
  color: new Float32Array(MAX_PARTICLES * 3),
};

function writeInstances() {
  const n = particles.length;
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    tmpQuat.setFromEuler(p.rotation);
    tmpScale.copy(p.size).multiplyScalar(p.scale);
    tmpMatrix.compose(p.position, tmpQuat, tmpScale).toArray(staged.matrix, i * 16);
    p.color.toArray(staged.color, i * 3);
  }
  uploadIfChanged(pool.instanceMatrix, staged.matrix, n * 16);
  uploadIfChanged(pool.instanceColor, staged.color, n * 3);
  pool.count = n;
  // Draw nothing while the pool is empty, except on the very first frame:
  // that draw compiles the pool's shader at load instead of in the middle
  // of the first clear (a ~90 ms hitch on the frame the debris appears)
  pool.visible = n > 0 || !warmedUp;
  warmedUp = true;
}
let warmedUp = false;
onBeforeRender(writeInstances);

// ─── Particle explosion ─────────────────────────────────────────────────────
export function spawnParticles(col, row, colorIndex) {
  playExplosionSound();
  const cx = colToX(col);
  const cz = rowToZ(row);
  const floorY = -CUBE_SIZE / 2;
  // Particle count scales with intensity level
  const baseCount = colorIndex === BOMB_INDEX ? 8 : 14;
  const count = Math.round(baseCount * (1 + state.intensityLevel * 0.5));
  for (let i = 0; i < count; i++) {
    let pColor;
    if (colorIndex === RAINBOW_INDEX) {
      pColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    } else if (colorIndex === BOMB_INDEX) {
      pColor = Math.random() < 0.5 ? 0xff6600 : 0xffcc00;
    } else {
      pColor = COLORS[colorIndex];
    }

    const p = takeParticle();
    p.trail = false;
    // Power-law size distribution: lots of small shards, occasional big chunk
    const size = 0.06 + Math.pow(Math.random(), 2.2) * 0.22;
    // Irregular shard shapes instead of perfect little cubes
    p.size.set(size, size * (0.5 + Math.random() * 0.9), size * (0.5 + Math.random() * 0.9));
    // Per-fragment shade variation so the debris doesn't look uniform
    p.color.setHex(pColor).multiplyScalar(0.75 + Math.random() * 0.45);
    // Fragments originate throughout the cube's volume, not its center point
    p.position.set(
      cx + (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.6,
      cz + (Math.random() - 0.5) * 0.7
    );
    p.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speedMult = 1 + state.intensityLevel * 0.4;
    const speed = (colorIndex === BOMB_INDEX ? (3.5 + Math.random() * 4) : (2 + Math.random() * 3.5)) * speedMult;
    // Tumble energy follows launch energy, on all three axes
    const spin = speed * (0.8 + Math.random() * 1.6);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.abs(Math.sin(angle)) * speed * 0.7 + 1.2 + Math.random() * 1.8 + (colorIndex === BOMB_INDEX ? 1.5 : 0);
    p.vz = Math.sin(angle) * speed * 0.5;
    p.life = 1.2 + Math.random() * 0.6;
    p.floorY = floorY + size / 2;
    p.bounceDamping = 0.35 + Math.random() * 0.2;
    p.spinX = (Math.random() - 0.5) * spin;
    p.spinY = (Math.random() - 0.5) * spin;
    p.spinZ = (Math.random() - 0.5) * spin;
    p.settled = false;
  }
}

function updateDebris(p, dt) {
  p.position.x += p.vx * dt;
  p.position.y += p.vy * dt;
  p.position.z += p.vz * dt;
  p.vy -= 12 * dt;

  if (p.position.y <= p.floorY && p.vy < 0) {
    playBounceSound(p.vy);
    p.position.y = p.floorY;
    if (Math.abs(p.vy) < 1.0) {
      // Fragment has come to rest: no more bouncing or tumbling
      p.settled = true;
      p.vy = 0;
    } else {
      p.vy = -p.vy * p.bounceDamping;
      // Each bounce bleeds energy from spin and slide
      p.spinX *= 0.5;
      p.spinY *= 0.5;
      p.spinZ *= 0.5;
      p.vx *= 0.75;
      p.vz *= 0.75;
    }
  }

  if (p.settled) {
    // Ground friction slides fragments to a stop — resting debris
    // that keeps spinning is an instant fake-tell
    const friction = Math.pow(0.02, dt);
    p.vx *= friction;
    p.vz *= friction;
  } else {
    p.rotation.x += p.spinX * dt;
    p.rotation.y += p.spinY * dt;
    p.rotation.z += p.spinZ * dt;
  }

  p.life -= dt;
  // At the end of its life, debris at rest keeps its size and sinks
  // through the floor (shrinking reads as cartoon); a shard still in the
  // air shrinks away
  const fadeStart = 0.35;
  if (p.life < fadeStart) {
    if (p.settled) p.position.y -= dt * (p.size.y / fadeStart);
    else p.scale = Math.max(0, p.life / fadeStart);
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.trail) continue;
    updateDebris(p, dt);
    if (p.life <= 0) release(i);
  }
}

export function clearDebris() {
  for (let i = particles.length - 1; i >= 0; i--) if (!particles[i].trail) release(i);
}

// ─── Shooting trail particles ───────────────────────────────────────────────
function spawnTrailParticle(x, y, z, color) {
  const p = takeParticle();
  p.trail = true;
  const size = 0.06 + Math.random() * 0.08;
  p.size.set(size, size, size);
  p.color.setHex(color);
  p.position.set(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z);
  p.life = 0.3 + Math.random() * 0.2;
  p.maxLife = 0.3 + Math.random() * 0.2;
  p.vy = (Math.random() - 0.5) * 0.5;
  p.vx = (Math.random() - 0.5) * 0.5;
}

export function updateTrailParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p.trail) continue;
    p.life -= dt;
    p.position.x += p.vx * dt;
    p.position.y += p.vy * dt;
    p.scale = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) release(i);
  }
}

// Once per frame: spawn trail particles behind the shooting cube
export function emitShotTrail() {
  if (state.shootingCube) {
    const sc = state.shootingCube;
    const trailColor = sc.colorIndex === RAINBOW_INDEX ? 0xffffff
      : sc.colorIndex === BOMB_INDEX ? 0xff6600
      : COLORS[sc.colorIndex];
    if (Math.random() < 0.6) {
      spawnTrailParticle(sc.mesh.position.x, sc.mesh.position.y, sc.mesh.position.z, trailColor);
    }
  }
}

export function clearTrail() {
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].trail) release(i);
}
