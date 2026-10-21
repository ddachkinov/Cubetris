// ─── Sound effects (Web Audio API — synthesized, no external files) ─────────
// One AudioContext for everything: these one-shot effects, and the music
// engine whose beat grid the musical effects are quantized to.
//
// The mix is a small bus graph:
//
//   music stems ─> music bus ─┐
//                             ├─> master (mute) ─> speakers
//   effects ─────> sfx bus ───┘
//
// A clear ducks the music bus by 3 dB for 120 ms so the debris reads over
// the soundtrack; mute is the master's gain.

import { MusicEngine } from './music.js';
import { loadMuted, saveMuted } from '../persistence.js';

export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const masterBus = audioCtx.createGain();
masterBus.connect(audioCtx.destination);
const musicBus = audioCtx.createGain();
musicBus.connect(masterBus);
const sfxBus = audioCtx.createGain();
sfxBus.connect(masterBus);

export const music = new MusicEngine(audioCtx, musicBus);

// ─── Mute ────────────────────────────────────────────────────────────────────
let muted = loadMuted();
masterBus.gain.value = muted ? 0 : 1;

export function isMuted() {
  return muted;
}

export function setMuted(on) {
  muted = !!on;
  saveMuted(muted);
  // A short ramp, so muting mid-note doesn't click
  masterBus.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.015);
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

// ─── Ducking ─────────────────────────────────────────────────────────────────
const DUCK_GAIN = Math.pow(10, -3 / 20); // -3 dB
const DUCK_HOLD_S = 0.12;

function duckMusic() {
  const now = audioCtx.currentTime;
  const g = musicBus.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.setTargetAtTime(DUCK_GAIN, now, 0.008);
  g.setTargetAtTime(1, now + DUCK_HOLD_S, 0.05);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
// Hidden (tab in the background, app inactive): stop the scheduler and
// suspend the context, so nothing plays and nothing piles up. Shown again:
// resume the context, then restart the scheduler from "now" (resync), so the
// steps missed while away are skipped rather than played as a burst.
let hidden = false;

export function ensureAudio() {
  if (hidden) return;
  if (audioCtx.state !== 'running') audioCtx.resume();
  music.start();
}

export function suspendAudio() {
  hidden = true;
  music.pause();
  if (audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
}

export function resumeAudio() {
  hidden = false;
  if (!music.started) return;
  audioCtx.resume().then(() => music.resume()).catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendAudio();
  else resumeAudio();
});

// iOS: a phone call or Siri puts the context in 'interrupted'; when it comes
// back to 'running' the clock has moved on without the scheduler
audioCtx.addEventListener('statechange', () => {
  if (audioCtx.state === 'running' && !hidden) music.resync();
});

// ─── Quantizing ──────────────────────────────────────────────────────────────
// Musical effects land on the soundtrack's grid (the Lumines trick), so the
// game starts to feel like an instrument. Pops (row clear, level-up, clutch)
// wait at most a 16th note (<= 144 ms at 104 bpm); chain tones keep the 8th
// grid, they are the instrument moment. Falls back to "now" before the music
// has started.
const SIXTEENTH = 1;
const EIGHTH = 2;

function qTime(division = SIXTEENTH) {
  return music.started ? music.nextGridTime(division) : audioCtx.currentTime;
}

// Audio can only start from a user gesture
window.addEventListener('keydown', ensureAudio, { once: true });
window.addEventListener('touchstart', ensureAudio, { once: true });

let lastExplosionTime = 0;
const EXPLOSION_COOLDOWN = 0.04;

// Layered debris explosion: crack transient + broadband body with a darkening
// filter sweep + sub thump. The filter start point is randomized so repeated
// explosions never sound identical (a big realism tell).
export function playExplosionSound() {
  const now = audioCtx.currentTime;
  if (now - lastExplosionTime < EXPLOSION_COOLDOWN) return;
  lastExplosionTime = now;
  duckMusic();

  // Master variation per explosion — repetition is the biggest synth tell
  const v = 0.8 + Math.random() * 0.3;

  // 1. Crack — a few ms of noise, bandpassed so it snaps without hissing
  const crackDur = 0.016 + Math.random() * 0.008;
  const crackSize = Math.ceil(audioCtx.sampleRate * crackDur);
  const crackBuf = audioCtx.createBuffer(1, crackSize, audioCtx.sampleRate);
  const cd = crackBuf.getChannelData(0);
  for (let i = 0; i < crackSize; i++) {
    cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackSize * 0.18));
  }
  const crack = audioCtx.createBufferSource();
  crack.buffer = crackBuf;
  const crackBp = audioCtx.createBiquadFilter();
  crackBp.type = 'bandpass';
  crackBp.frequency.value = 2400 + Math.random() * 900;
  crackBp.Q.value = 0.8;
  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(0.12 * v, now);
  crack.connect(crackBp).connect(crackGain).connect(sfxBus);
  crack.start(now);
  crack.stop(now + crackDur);

  // 2. Body — broadband rumble that darkens as fragments disperse
  const bodyDur = 0.24 + Math.random() * 0.1;
  const bodySize = Math.ceil(audioCtx.sampleRate * bodyDur);
  const bodyBuf = audioCtx.createBuffer(1, bodySize, audioCtx.sampleRate);
  const bd = bodyBuf.getChannelData(0);
  for (let i = 0; i < bodySize; i++) {
    bd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bodySize * 0.22));
  }
  const body = audioCtx.createBufferSource();
  body.buffer = bodyBuf;
  const bodyLp = audioCtx.createBiquadFilter();
  bodyLp.type = 'lowpass';
  bodyLp.frequency.setValueAtTime(2800 + Math.random() * 1800, now);
  bodyLp.frequency.exponentialRampToValueAtTime(200, now + bodyDur);
  bodyLp.Q.value = 0.7;
  const bodyGain = audioCtx.createGain();
  bodyGain.gain.setValueAtTime(0.24 * v, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + bodyDur);
  body.connect(bodyLp).connect(bodyGain).connect(sfxBus);
  body.start(now);
  body.stop(now + bodyDur);

  // 3. Sub thump — the weight of the impact. Short attack ramp kills the
  //    click; randomized start pitch keeps repeats from ringing identically
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(78 + Math.random() * 22, now);
  osc.frequency.exponentialRampToValueAtTime(34, now + 0.15);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.22 * v, now + 0.004);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
  osc.connect(oscGain).connect(sfxBus);
  osc.start(now);
  osc.stop(now + 0.17);
}

let lastBounceTime = 0;
const BOUNCE_COOLDOWN = 0.03;

// Debris tick: a filtered-noise TAP, not a tone. Real fragments hitting a
// floor read as dull clicks that blend into a scatter texture — so soft hits
// are silent, only some bounces sound at all, and every tick sits at a
// slightly different pitch. No oscillators = no beeping.
export function playBounceSound(velocity) {
  const now = audioCtx.currentTime;
  if (now - lastBounceTime < BOUNCE_COOLDOWN) return;

  const impact = Math.min(1, Math.abs(velocity) / 6);
  if (impact < 0.12) return; // too soft to hear
  if (Math.random() < 0.45) return; // gate: scattered ticks, not machine-gun
  lastBounceTime = now;

  const vol = 0.015 + impact * 0.05;
  const dur = 0.008 + Math.random() * 0.014;

  const size = Math.ceil(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.2));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  // Harder impacts are brighter, but everything stays dull and woody
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700 + impact * 1300 + Math.random() * 700;
  bp.Q.value = 1.1;

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(bp).connect(lp).connect(g).connect(sfxBus);
  src.start(now);
  src.stop(now + dur);
}

// Level-up: a rising noise swell ("whoosh") under warm, detuned, lowpassed
// chimes — an achievement swell in the same organic family as the debris
// sounds, instead of a beepy NES arpeggio.
export function playLevelUpSound() {
  const now = qTime();

  // Foundation: filtered noise sweeping upward
  const swellDur = 0.75;
  const size = Math.ceil(audioCtx.sampleRate * swellDur);
  const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
  const swell = audioCtx.createBufferSource();
  swell.buffer = buf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(350, now);
  bp.frequency.exponentialRampToValueAtTime(2800, now + swellDur * 0.8);
  bp.Q.value = 1.6;
  const sg = audioCtx.createGain();
  sg.gain.setValueAtTime(0.0001, now);
  sg.gain.linearRampToValueAtTime(0.11, now + swellDur * 0.55);
  sg.gain.exponentialRampToValueAtTime(0.001, now + swellDur);
  swell.connect(bp).connect(sg).connect(sfxBus);
  swell.start(now);
  swell.stop(now + swellDur);

  // Chimes: detuned triangle pairs through a lowpass, soft attack —
  // warm and pad-like rather than pure-tone beeps
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const t = now + i * 0.09;
    for (const detune of [-4, 4]) {
      const o = audioCtx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      o.connect(lp).connect(g).connect(sfxBus);
      o.start(t);
      o.stop(t + 0.55);
    }
  });
}

export function playBombSound() {
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
  noise.connect(lp).connect(gain).connect(sfxBus);
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
  osc.connect(oscGain).connect(sfxBus);
  osc.start(now);
  osc.stop(now + 0.3);
}

export function playRowClearSound() {
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
  osc.connect(lp).connect(gain).connect(sfxBus);
  osc.start(now);
  osc.stop(now + 0.3);
}

// Low thump played on the beat while in danger — synced via music.onBeat
export function playHeartbeat(time) {
  const o = audioCtx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(55, time);
  o.frequency.exponentialRampToValueAtTime(35, time + 0.12);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.22, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  o.connect(g).connect(sfxBus);
  o.start(time);
  o.stop(time + 0.2);
}

// Weighty thud when a cube lands (immediate — impact must not feel laggy)
export function playLandSound() {
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, now);
  o.frequency.exponentialRampToValueAtTime(70, now + 0.08);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.15, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  o.connect(g).connect(sfxBus);
  o.start(now);
  o.stop(now + 0.1);
}

// Low rumble as the wall grinds forward
export function playWallPushSound() {
  const now = audioCtx.currentTime;
  const dur = 0.35;
  const size = Math.ceil(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * (1 - i / size);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, now);
  lp.frequency.exponentialRampToValueAtTime(90, now + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.35, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(lp).connect(g).connect(sfxBus);
  src.start(now);
  src.stop(now + dur);
}

// Triumphant rising arp for clutch saves
export function playClutchSound() {
  const t0 = qTime();
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    const t = t0 + i * 0.05;
    const o = audioCtx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.25);
  });
}

// ─── Enhanced chain combo sounds (pitch + harmony escalation) ───────────────
export function playChainSound(chainStep) {
  const now = qTime(EIGHTH);
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
  osc.connect(g).connect(sfxBus);
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
    osc2.connect(g2).connect(sfxBus);
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
    osc3.connect(g3).connect(sfxBus);
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
    osc4.connect(g4).connect(sfxBus);
    osc4.start(now);
    osc4.stop(now + dur * 1.2);
  }
}

// Lane-change tick
export function playTickSound() {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.connect(gain).connect(sfxBus);
  osc.start(now);
  osc.stop(now + 0.03);
}

// ?debug=1: the audio graph for harness checks and the console
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__hsAudio = { ctx: audioCtx, music, masterBus, musicBus, sfxBus, isMuted };
}
