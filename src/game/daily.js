// ─── The Daily's result ──────────────────────────────────────────────────────
// What a day's Daily leaves behind: its best run (the score, the best chain,
// and a sketch of the board it ended on), and the line that gets shared.
// Plain functions: no DOM, no storage.

import { GRID_COLS, GRID_ROWS } from './rules.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
}

// 'YYYY-MM-DD' -> 'Oct 21'. Spelled out here rather than by the locale, so
// the share line reads the same on every phone.
export function shortDate(dateKey) {
  const { m, d } = parseKey(dateKey);
  return `${MONTHS[m - 1]} ${d}`;
}

// 'YYYY-MM-DD' -> 'Wednesday, Oct 21'
export function longDate(dateKey) {
  const { y, m, d } = parseKey(dateKey);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${shortDate(dateKey)}`;
}

// 4820 -> '4,820'
export function formatScore(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── Board sketch ────────────────────────────────────────────────────────────
// The rows nearest the player, where a run is lost, as colour indices (null =
// empty). Laid out as the screen shows them: the far row of the three first,
// the player's row last, and lanes left to right as seen, which is lane 6
// down to lane 0.
export const SKETCH_ROWS = 3;

export function boardSketch(grid) {
  const rows = [];
  for (let r = Math.min(SKETCH_ROWS, GRID_ROWS) - 1; r >= 0; r--) {
    const line = [];
    for (let c = GRID_COLS - 1; c >= 0; c--) {
      const cell = grid[c][r];
      line.push(cell === null || cell === undefined ? null : (typeof cell === 'object' ? cell.colorIndex : cell));
    }
    rows.push(line);
  }
  return rows;
}

// Coral, teal, cobalt, amber, orchid, then the rainbow (its glyph is a star)
// and the bomb. The squares are the nearest the emoji set has.
const EMOJI = ['🟥', '🟩', '🟦', '🟨', '🟪', '⭐', '⬛'];
const EMPTY = '⬜';

export function sketchEmoji(sketch) {
  return sketch.map((line) => line.map((c) => (c === null ? EMPTY : EMOJI[c] || EMPTY)).join('')).join('\n');
}

// ─── The share line ──────────────────────────────────────────────────────────
// Hueshot · Oct 21 · 4,820 · ×5 chain
// ⬜🟦⬜⬜🟥⬜⬜
// ...
// The chain is left out below ×2, and the sketch when there is none.
export function dailyShareText({ dateKey, score, chain, sketch }) {
  const parts = ['Hueshot', shortDate(dateKey), formatScore(score)];
  if (chain >= 2) parts.push(`×${chain} chain`);
  const head = parts.join(' · ');
  return sketch && sketch.length ? `${head}\n${sketchEmoji(sketch)}` : head;
}

// ─── The day's best ──────────────────────────────────────────────────────────
// Unlimited tries, and the best one counts. A run only replaces the day's
// best by scoring more; the first run of the day is the best so far.
export function betterDailyRun(prev, run) {
  return !prev || run.score > prev.score;
}
