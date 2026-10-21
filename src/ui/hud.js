// ─── HUD ─────────────────────────────────────────────────────────────────────
// Everything in the DOM overlay: score line, next/hold previews, the wall
// timer, banners, popups, the screen flash, the danger vignette, the
// first-run hint, the front door and the pause and game-over screens.

import * as THREE from 'three';
import { RAINBOW_INDEX, BOMB_INDEX, ROW_CLEAR_BONUS } from '../game/rules.js';
import { state } from '../game/state.js';
import { hintSeen, markHintSeen } from '../persistence.js';
import { longDate, formatScore } from '../game/daily.js';
import { COLOR_NAMES, BOMB_BODY, hexToCss } from '../render/palette.js';
import { glyphSvg } from '../render/glyphs.js';
import { camera } from '../render/camera.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score-val');
const bestEl = document.getElementById('best-val');
const levelEl = document.getElementById('level-val');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const newBestEl = document.getElementById('new-best');
const gameOverScreen = document.getElementById('game-over-screen');
const qSlot0 = document.getElementById('q-slot-0');
const qSlot1 = document.getElementById('q-slot-1');
const qSlot2 = document.getElementById('q-slot-2');
const holdBoxEl = document.getElementById('hold-preview');
const clutchEl = document.getElementById('clutch-banner');
const runStatsEl = document.getElementById('run-stats');
const finalBestLabelEl = document.getElementById('final-best-label');
const restartBtn = document.getElementById('restart-btn');
const shareBtn = document.getElementById('share-btn');
const frontDoor = document.getElementById('front-door');
const doorDateEl = document.getElementById('door-date');
const doorDailySubEl = document.getElementById('door-daily-sub');
const doorShareBtn = document.getElementById('door-share');
const doorChipsEl = document.getElementById('door-chips');
const dailyIndicatorEl = document.getElementById('daily-indicator');
const wallWarningEl = document.getElementById('wall-warning');
const levelUpEl = document.getElementById('level-up');
const rowClearEl = document.getElementById('row-clear');
const uiEl = document.getElementById('ui');
const wallTimerEl = document.getElementById('wall-timer');
const wallTimerFillEl = document.getElementById('wall-timer-fill');
const hintEl = document.getElementById('hint');
const pauseScreen = document.getElementById('pause-screen');
const continueScreen = document.getElementById('continue-screen');
const muteBtn = document.getElementById('mute-btn');
const chainCounterEl = document.getElementById('chain-counter');
const flashOverlayEl = document.getElementById('flash-overlay');
const announcerEl = document.getElementById('announcer');

// ─── Score line ──────────────────────────────────────────────────────────────
export function setScore(score) {
  scoreEl.textContent = score;
}

export function setBest(best) {
  bestEl.textContent = best;
}

export function setLevel(level) {
  levelEl.textContent = `Level ${level}`;
}

// ─── Score popups ─────────────────────────────────────────────────────────────
// A popup floats this far up over its life (see score-float in index.html)
const POPUP_RISE_PX = 60;
// Line height of the largest popup (a combo, 30px font, scaled 1.2 on entry)
const POPUP_HEIGHT_PX = 40;
const POPUP_GAP_PX = 6;

// A popup starts over the cubes it scored for, but never inside the
// announcer's band: a clear at the far wall used to put "+60 x2" right on
// top of DOUBLE!. Banners can arrive after the popup (a level-up lands at
// the end of the cascade), so the band is kept clear whether or not one is
// showing.
export function spawnScorePopup(worldX, worldZ, label, extraClass) {
  const pos = new THREE.Vector3(worldX, 1, worldZ);
  pos.project(camera);
  const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
  let sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;
  const band = announcerEl.getBoundingClientRect();
  if (sy - POPUP_RISE_PX < band.bottom && sy + POPUP_HEIGHT_PX > band.top) {
    sy = band.bottom + POPUP_RISE_PX + POPUP_GAP_PX;
  }

  const el = document.createElement('div');
  el.className = 'score-popup' + (extraClass ? ' ' + extraClass : '');
  el.textContent = label;
  el.style.left = `${sx}px`;
  el.style.top = `${sy}px`;
  uiEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Announcer queue ─────────────────────────────────────────────────────────
// Level-up, row-clear, and chain banners used to be five independently
// timed DOM elements at slightly different screen heights; a fast cascade
// left two or three visible at once. Now there is one slot: each banner is
// a queued job with a fixed duration, shown one at a time. Level-up jumps
// the line since it is the rarest and the one the player most needs to see.
const announceQueue = [];
let announceBusy = false;
let announceTimer = null;

function announce(showFn, durationMs, priority = false) {
  if (priority) announceQueue.unshift({ showFn, durationMs });
  else announceQueue.push({ showFn, durationMs });
  pumpAnnouncer();
}

function pumpAnnouncer() {
  if (announceBusy || announceQueue.length === 0) return;
  const job = announceQueue.shift();
  announceBusy = true;
  job.showFn();
  announceTimer = setTimeout(() => {
    announceTimer = null;
    announceBusy = false;
    // The banner's own animationend hides it a frame or few after its slot
    // ends; by then it has faded out, so hide it now rather than share the
    // screen with the next one.
    hideBanners();
    pumpAnnouncer();
  }, job.durationMs);
}

function hideBanners() {
  chainCounterEl.style.display = 'none';
  levelUpEl.style.display = 'none';
  rowClearEl.style.display = 'none';
  clutchEl.style.display = 'none';
}

// Restart: drop queued banners, hide any on screen, and cancel the banner
// timer. Left running, it would free the slot in the middle of the next
// game's first banner and put a second one on screen beside it.
export function resetAnnouncer() {
  announceQueue.length = 0;
  announceBusy = false;
  clearTimeout(announceTimer);
  announceTimer = null;
  hideBanners();
}

// ─── Chain counter display ──────────────────────────────────────────────────
export function showChainCounter(step) {
  if (step < 2) return;
  announce(() => {
    const labels = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'HEXA', 'MEGA', 'ULTRA', 'INSANE'];
    const label = step < labels.length ? labels[step] : `${step}x CHAIN`;

    chainCounterEl.textContent = `${label}!`;
    chainCounterEl.style.display = 'block';
    chainCounterEl.style.animation = 'none';
    void chainCounterEl.offsetWidth;

    // Escalates through the cube palette and grows a little per step
    const colors = ['', '', 'var(--coral)', 'var(--cobalt)', 'var(--amber)', 'var(--teal)', 'var(--orchid)'];
    chainCounterEl.style.color = colors[Math.min(step, colors.length - 1)];
    chainCounterEl.style.fontSize = Math.min(56, 36 + step * 4) + 'px';

    chainCounterEl.style.animation = 'chain-pop 1.2s ease-out forwards';
    chainCounterEl.addEventListener('animationend', () => {
      chainCounterEl.style.display = 'none';
    }, { once: true });
  }, 1200);
}

// Level-up jumps the announcer queue. tintName is set when the level also
// brought a new theme, and names its tint.
export function showLevelUpBanner(level, tintName) {
  announce(() => {
    levelUpEl.innerHTML = `LEVEL ${level}`
      + (tintName ? `<div class="banner-sub">${tintName}</div>` : '')
      + '<div class="banner-sub">WALL STABILIZED</div>';
    levelUpEl.style.display = 'block';
    levelUpEl.style.animation = 'none';
    void levelUpEl.offsetWidth;
    levelUpEl.style.animation = 'lvlup 1.4s ease-out forwards';
    levelUpEl.addEventListener('animationend', () => {
      levelUpEl.style.display = 'none';
    }, { once: true });
  }, 1400, true);
}

// ─── Row clear banner ────────────────────────────────────────────────────────
export function showRowClearBanner(count) {
  announce(() => {
    rowClearEl.textContent = count > 1
      ? `${count}x ROW CLEAR! +${count * ROW_CLEAR_BONUS}`
      : `ROW CLEAR! +${ROW_CLEAR_BONUS}`;
    rowClearEl.style.display = 'block';
    rowClearEl.style.animation = 'none';
    void rowClearEl.offsetWidth;
    rowClearEl.style.animation = 'rowclear 1s ease-out forwards';
    rowClearEl.addEventListener('animationend', () => {
      rowClearEl.style.display = 'none';
    }, { once: true });
  }, 1000);
}

export function showClutchBanner(bonus) {
  announce(() => {
    clutchEl.textContent = `CLUTCH! +${bonus}`;
    clutchEl.style.display = 'block';
    clutchEl.style.animation = 'none';
    void clutchEl.offsetWidth;
    clutchEl.style.animation = 'rowclear 1.1s ease-out forwards';
    clutchEl.addEventListener('animationend', () => {
      clutchEl.style.display = 'none';
    }, { once: true });
  }, 1100, true);
}

// ─── Flash overlay (screen flash on big clears) ─────────────────────────────
let flashTimer = 0;

export function triggerFlash(color, intensity) {
  flashOverlayEl.style.background = '#' + color.toString(16).padStart(6, '0');
  flashOverlayEl.style.opacity = intensity;
  flashTimer = 0.15;
}

// Once per frame: the flash overlay decays
export function updateFlash(dt) {
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0) {
      flashOverlayEl.style.opacity = 0;
    } else {
      flashOverlayEl.style.opacity = parseFloat(flashOverlayEl.style.opacity) * 0.85;
    }
  }
}

export function isFlashing() {
  return flashTimer > 0;
}

export function resetFlash() {
  flashTimer = 0;
  flashOverlayEl.style.opacity = 0;
}

// ─── Next-queue + hold previews ──────────────────────────────────────────────
// Each chip is the cube's colour with the cube's glyph on it, so the queue
// reads without colour too
function colorCssFor(idx) {
  if (idx === RAINBOW_INDEX) {
    return `linear-gradient(135deg, ${COLOR_NAMES.join(', ')})`;
  }
  if (idx === BOMB_INDEX) return hexToCss(BOMB_BODY);
  return COLOR_NAMES[idx];
}

function paintSlot(el, idx) {
  const empty = idx === null || idx === undefined;
  el.style.background = empty ? 'transparent' : colorCssFor(idx);
  el.classList.toggle('filled', !empty);
  // Repaint the glyph only when the colour changes
  if (el.dataset.glyph !== String(idx)) {
    el.dataset.glyph = String(idx);
    el.innerHTML = empty ? '' : glyphSvg(idx);
    const svg = el.firstElementChild;
    if (svg && idx === BOMB_INDEX) svg.classList.add('fuse');
    if (svg && idx === RAINBOW_INDEX) svg.classList.add('on-dark');
  }
}

export function updateNextPreview() {
  paintSlot(qSlot0, state.nextQueue[0]);
  paintSlot(qSlot1, state.nextQueue[1]);
  paintSlot(qSlot2, state.nextQueue[2]);
}

export function updateHoldPreview() {
  paintSlot(holdBoxEl, state.heldColorIndex);
}

// ─── Wall timer ──────────────────────────────────────────────────────────────
// The wall is no longer on a hidden clock: the bar drains for the whole
// interval and turns red for the last three seconds.
export function showWallTimer(timeLeft, interval) {
  const remaining = Math.max(0, Math.min(1, timeLeft / interval));
  wallTimerFillEl.style.transform = `scaleX(${remaining})`;
  wallTimerEl.classList.toggle('imminent', timeLeft <= 3);

  if (timeLeft <= 3 && timeLeft > 0) {
    wallWarningEl.classList.add('active');
  } else {
    wallWarningEl.classList.remove('active');
  }
}

export function hideWallWarning() {
  wallWarningEl.classList.remove('active');
}

export function resetWallTimer() {
  wallTimerFillEl.style.transform = 'scaleX(1)';
  wallTimerEl.classList.remove('imminent');
}

// ─── Danger vignette ─────────────────────────────────────────────────────────
export function setDanger(on) {
  document.body.classList.toggle('danger', on);
}

export function setDailyIndicator(on) {
  dailyIndicatorEl.hidden = !on;
}

// ─── Screens ─────────────────────────────────────────────────────────────────
// best: the best to show under the score: today's best on a Daily (labelled
// so), the all-time best otherwise. newBest: the label for a new best, or null.
export function showGameOver({ score, best, daily, newBest, recap }) {
  finalScoreEl.textContent = formatScore(score);
  finalBestLabelEl.textContent = daily ? "Today's best" : 'Best';
  finalBestEl.textContent = formatScore(best);
  newBestEl.textContent = newBest || '';
  newBestEl.style.display = newBest ? 'block' : 'none';
  // Wrap between the recap's items, never inside one; a separator travels
  // with the item after it, so no line ends on a bullet
  runStatsEl.replaceChildren(...recap.split(' • ').flatMap((item, i) => {
    const span = document.createElement('span');
    span.className = 'recap-item';
    span.textContent = i ? `• ${item}` : item;
    return i ? [' ', span] : [span];
  }));
  restartBtn.textContent = daily ? 'Try again' : 'Play again';
  shareBtn.hidden = !daily;
  resetShareLabels();
  gameOverScreen.style.display = 'flex';
}

// ─── Front door ──────────────────────────────────────────────────────────────
// Where the app opens. dateKey names today's board; best is the day's best
// run so far ({ score, chain }) or null.
export function showFrontDoor({ dateKey, best }) {
  if (!doorChipsEl.childElementCount) {
    // The five colours with their glyphs, as on the cubes
    for (let i = 0; i < COLOR_NAMES.length; i++) {
      const chip = document.createElement('div');
      chip.className = 'q-slot';
      doorChipsEl.appendChild(chip);
      paintSlot(chip, i);
    }
  }
  doorDateEl.textContent = longDate(dateKey);
  doorDailySubEl.textContent = best
    ? `Your best ${formatScore(best.score)}` + (best.chain >= 2 ? ` · ×${best.chain} chain` : '')
    : 'Unlimited tries · your best counts';
  doorShareBtn.hidden = !best;
  resetShareLabels();
  frontDoor.style.display = 'flex';
}

export function hideFrontDoor() {
  frontDoor.style.display = 'none';
}

// After a share: where there is no share sheet the line went to the
// clipboard, and the button says so for a moment
const SHARE_LABEL = "Share today's best";
let shareLabelTimer = null;

export function showShared(how) {
  if (how !== 'clipboard') return;
  for (const btn of [shareBtn, doorShareBtn]) btn.textContent = 'Copied';
  clearTimeout(shareLabelTimer);
  shareLabelTimer = setTimeout(resetShareLabels, 1500);
}

function resetShareLabels() {
  clearTimeout(shareLabelTimer);
  shareLabelTimer = null;
  for (const btn of [shareBtn, doorShareBtn]) btn.textContent = SHARE_LABEL;
}

export function showPause(on) {
  pauseScreen.style.display = on ? 'flex' : 'none';
}

// A run saved by an earlier session, waiting on the board for Continue
export function showContinue(on) {
  continueScreen.style.display = on ? 'flex' : 'none';
}

export function setMuteLabel(muted) {
  muteBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
  muteBtn.setAttribute('aria-pressed', String(muted));
}

// Restart: back to a bare board
export function hideOverlays() {
  wallWarningEl.classList.remove('active');
  pauseScreen.style.display = 'none';
  continueScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  frontDoor.style.display = 'none';
}

// ─── First-run hint ─────────────────────────────────────────────────────────
// No tutorial screen. If a new player's board sits untouched, one line fades
// in; the first touch dismisses it for good.
let hintDismissed = hintSeen();
let idleTimer = 0;

export function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  hintEl.classList.remove('show');
  markHintSeen();
}

// Once per frame while a run is live
export function updateHint(dt) {
  if (!hintDismissed) {
    idleTimer += dt;
    hintEl.classList.toggle('show', idleTimer > 2.5);
  }
}

export function resetIdle() {
  idleTimer = 0;
}
