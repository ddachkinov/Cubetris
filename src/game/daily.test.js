import { describe, it, expect } from 'vitest';
import { GRID_COLS, GRID_ROWS } from './rules.js';
import {
  shortDate, longDate, formatScore, boardSketch, sketchEmoji, dailyShareText, betterDailyRun,
} from './daily.js';

function emptyGrid() {
  return Array.from({ length: GRID_COLS }, () => Array(GRID_ROWS).fill(null));
}

describe('dates and numbers', () => {
  it('spells the date the same in every locale', () => {
    expect(shortDate('2026-09-06')).toBe('Sep 6');
    expect(shortDate('2026-10-21')).toBe('Oct 21');
    expect(longDate('2026-10-21')).toBe('Wednesday, Oct 21');
    expect(longDate('2027-01-01')).toBe('Friday, Jan 1');
  });

  it('groups thousands', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(620)).toBe('620');
    expect(formatScore(4820)).toBe('4,820');
    expect(formatScore(1234567)).toBe('1,234,567');
  });
});

describe('board sketch', () => {
  it('is the three front rows as the screen shows them', () => {
    const grid = emptyGrid();
    grid[0][0] = { colorIndex: 0 }; // player's row, lane 0: far right on screen
    grid[6][0] = { colorIndex: 1 }; // player's row, lane 6: far left
    grid[3][2] = { colorIndex: 2 }; // third row, middle lane
    grid[3][3] = { colorIndex: 4 }; // out of the sketch
    const sketch = boardSketch(grid);
    expect(sketch).toEqual([
      [null, null, null, 2, null, null, null],
      [null, null, null, null, null, null, null],
      [1, null, null, null, null, null, 0],
    ]);
  });

  it('takes plain colour indices too', () => {
    const grid = emptyGrid();
    grid[6][2] = 5;
    expect(boardSketch(grid)[0][0]).toBe(5);
  });

  it('draws one square per lane, specials included', () => {
    const text = sketchEmoji([[0, 1, 2, 3, 4, 5, 6], Array(7).fill(null)]);
    expect(text).toBe('🟥🟩🟦🟨🟪⭐⬛\n⬜⬜⬜⬜⬜⬜⬜');
  });
});

describe('share line', () => {
  it('names the game, the day, the score and the chain, then the sketch', () => {
    const sketch = [[null, 2, null, null, 0, null, null], Array(7).fill(null), [1, 1, 3, 4, 0, 2, 6]];
    expect(dailyShareText({ dateKey: '2026-09-06', score: 4820, chain: 5, sketch })).toBe(
      'Hueshot · Sep 6 · 4,820 · ×5 chain\n⬜🟦⬜⬜🟥⬜⬜\n⬜⬜⬜⬜⬜⬜⬜\n🟩🟩🟨🟪🟥🟦⬛',
    );
  });

  it('leaves out a chain under x2 and a missing sketch', () => {
    expect(dailyShareText({ dateKey: '2026-10-21', score: 90, chain: 1 })).toBe('Hueshot · Oct 21 · 90');
    expect(dailyShareText({ dateKey: '2026-10-21', score: 90, chain: 0, sketch: [] })).toBe('Hueshot · Oct 21 · 90');
  });
});

describe("the day's best", () => {
  it('is the first run, then only a higher score', () => {
    expect(betterDailyRun(null, { score: 0 })).toBe(true);
    expect(betterDailyRun({ score: 500 }, { score: 400 })).toBe(false);
    expect(betterDailyRun({ score: 500 }, { score: 500 })).toBe(false);
    expect(betterDailyRun({ score: 500 }, { score: 510 })).toBe(true);
  });
});
