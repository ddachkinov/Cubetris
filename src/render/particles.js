// ─── Particles ───────────────────────────────────────────────────────────────
// Debris from cleared cubes, and the trail behind a cube in flight.

import * as THREE from 'three';
import { RAINBOW_INDEX, BOMB_INDEX } from '../game/rules.js';
import { state } from '../game/state.js';
import { playExplosionSound, playBounceSound } from '../audio/sfx.js';
import { COLORS } from './palette.js';
import { CUBE_SIZE, gameGroup, colToX, rowToZ, disposeMesh } from './scene.js';

let particles = [];
let trailParticles = [];

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

    // Power-law size distribution: lots of small shards, occasional big chunk
    const size = 0.06 + Math.pow(Math.random(), 2.2) * 0.22;
    // Irregular shard shapes instead of perfect little cubes
    const geo = new THREE.BoxGeometry(
      size,
      size * (0.5 + Math.random() * 0.9),
      size * (0.5 + Math.random() * 0.9)
    );
    // Per-fragment shade variation so the debris doesn't look uniform
    const shade = new THREE.Color(pColor).multiplyScalar(0.75 + Math.random() * 0.45);
    const mat = new THREE.MeshLambertMaterial({ color: shade, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    // Fragments originate throughout the cube's volume, not its center point
    mesh.position.set(
      cx + (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.6,
      cz + (Math.random() - 0.5) * 0.7
    );
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    gameGroup.add(mesh);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speedMult = 1 + state.intensityLevel * 0.4;
    const speed = (colorIndex === BOMB_INDEX ? (3.5 + Math.random() * 4) : (2 + Math.random() * 3.5)) * speedMult;
    // Tumble energy follows launch energy, on all three axes
    const spin = speed * (0.8 + Math.random() * 1.6);
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.abs(Math.sin(angle)) * speed * 0.7 + 1.2 + Math.random() * 1.8 + (colorIndex === BOMB_INDEX ? 1.5 : 0),
      vz: Math.sin(angle) * speed * 0.5,
      life: 1.2 + Math.random() * 0.6,
      floorY: floorY + size / 2,
      bounceDamping: 0.35 + Math.random() * 0.2,
      spinX: (Math.random() - 0.5) * spin,
      spinY: (Math.random() - 0.5) * spin,
      spinZ: (Math.random() - 0.5) * spin,
      settled: false,
    });
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 12 * dt;

    if (p.mesh.position.y <= p.floorY && p.vy < 0) {
      playBounceSound(p.vy);
      p.mesh.position.y = p.floorY;
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
      p.mesh.rotation.x += p.spinX * dt;
      p.mesh.rotation.y += p.spinY * dt;
      p.mesh.rotation.z += p.spinZ * dt;
    }

    p.life -= dt;
    // Debris keeps its size and fades out (sinking into the floor when at
    // rest) instead of shrinking — shrinking reads as cartoon
    const fadeStart = 0.35;
    if (p.life < fadeStart) {
      p.mesh.material.opacity = Math.max(0, p.life / fadeStart);
      if (p.settled) p.mesh.position.y -= dt * 0.3;
    }

    if (p.life <= 0) {
      disposeMesh(p.mesh);
      particles.splice(i, 1);
    }
  }
}

export function clearDebris() {
  particles.forEach((p) => disposeMesh(p.mesh));
  particles = [];
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

export function updateTrailParticles(dt) {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const p = trailParticles[i];
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    const alpha = Math.max(0, p.life / p.maxLife);
    p.mesh.material.opacity = alpha * 0.8;
    p.mesh.scale.setScalar(alpha);
    if (p.life <= 0) {
      disposeMesh(p.mesh);
      trailParticles.splice(i, 1);
    }
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
  trailParticles.forEach((p) => disposeMesh(p.mesh));
  trailParticles = [];
}
