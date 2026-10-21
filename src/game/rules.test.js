import { describe, it, expect } from 'vitest';
import {
  GRID_COLS, GRID_ROWS, NUM_COLORS, RAINBOW_INDEX, BOMB_INDEX,
  WALL_ADVANCE_INTERVAL_MIN,
  activeColorCount, wallInterval, levelForClears, themeIndexForLevel,
  mulberry32, dailySeed, dailyRngs, endlessRngs, drawColorFromBag, randomColorIndex,
  generateWallRow, seedOpeningRows,
  landingRow, findMatchGroup, computeRemovalSet, fullRowCount, gravityMoves,
} from './rules.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// grid[col][row], row 0 the player's row, row GRID_ROWS - 1 the far wall.
const FAR = GRID_ROWS - 1;
const A = 0, B = 1, C = 2;

function emptyGrid() {
  return Array.from({ length: GRID_COLS }, () => Array(GRID_ROWS).fill(null));
}

// put(grid, [col, row, colorIndex], ...)
function put(grid, ...cubes) {
  for (const [c, r, colorIndex] of cubes) grid[c][r] = { colorIndex };
  return grid;
}

function keys(cells) {
  return cells.map(({ col, row }) => `${col},${row}`).sort();
}

function sortedKeys(set) {
  return [...set].sort();
}

// Far row first, one character per lane: '.' empty, digit = colour index
function render(grid) {
  const lines = [];
  for (let r = FAR; r >= 0; r--) {
    let line = '';
    for (let c = 0; c < GRID_COLS; c++) {
      line += grid[c][r] ? String(grid[c][r].colorIndex) : '.';
    }
    lines.push(`${String(r).padStart(2)} ${line}`);
  }
  return lines.join('\n');
}

function applyMoves(grid, moves) {
  for (const { col, from, to } of moves) {
    grid[col][to] = grid[col][from];
    grid[col][from] = null;
  }
}

// A board the game can actually be in between wall advances: every lane
// packed against the far wall (gravity has run) and no group of 3+ left
// (the cascade has run). Lanes stop at row 1 so the run is still alive.
function randomSettledBoard(rng, colorCount) {
  const grid = emptyGrid();
  for (let c = 0; c < GRID_COLS; c++) {
    const height = Math.floor(rng() * (GRID_ROWS - 1));
    for (let k = 0; k < height; k++) {
      const r = FAR - k;
      const start = Math.floor(rng() * colorCount);
      let placed = false;
      for (let i = 0; i < colorCount && !placed; i++) {
        grid[c][r] = { colorIndex: (start + i) % colorCount };
        placed = findMatchGroup(grid, c, r).length < 3;
      }
      if (!placed) {
        grid[c][r] = null;
        break;
      }
    }
  }
  return grid;
}

// Every lane steps one row toward the player, leaving the far row empty
function stepLanes(grid) {
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < FAR; r++) grid[c][r] = grid[c][r + 1];
    grid[c][FAR] = null;
  }
}

// The grid half of advanceWall() in main.js: every lane steps one row toward
// the player and a generated row fills the far wall.
function advanceWall(grid, rng, colorCount) {
  stepLanes(grid);
  const row = generateWallRow(rng, colorCount, grid);
  for (let c = 0; c < GRID_COLS; c++) grid[c][FAR] = { colorIndex: row[c] };
}

// ─── Flood fill ──────────────────────────────────────────────────────────────
describe('findMatchGroup', () => {
  it('returns nothing for an empty cell', () => {
    expect(findMatchGroup(emptyGrid(), 3, FAR)).toEqual([]);
  });

  it('finds the same L-shaped group from any of its cubes', () => {
    const grid = put(emptyGrid(), [1, FAR, A], [2, FAR, A], [2, FAR - 1, A], [2, FAR - 2, A]);
    const expected = ['1,11', '2,10', '2,11', '2,9'];
    expect(keys(findMatchGroup(grid, 1, FAR))).toEqual(expected);
    expect(keys(findMatchGroup(grid, 2, FAR - 2))).toEqual(expected);
  });

  it('does not connect diagonally', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [1, FAR - 1, A], [2, FAR - 2, A]);
    expect(findMatchGroup(grid, 1, FAR - 1)).toHaveLength(1);
  });

  it('stops at a different colour', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [1, FAR, A], [2, FAR, B], [3, FAR, A]);
    expect(keys(findMatchGroup(grid, 0, FAR))).toEqual(['0,11', '1,11']);
  });

  it('ignores specials and does not fill through them', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [1, FAR, BOMB_INDEX], [2, FAR, A], [3, FAR, RAINBOW_INDEX]);
    expect(findMatchGroup(grid, 1, FAR)).toEqual([]);
    expect(findMatchGroup(grid, 3, FAR)).toEqual([]);
    expect(findMatchGroup(grid, 0, FAR)).toHaveLength(1);
  });
});

// ─── Removal ─────────────────────────────────────────────────────────────────
describe('computeRemovalSet', () => {
  it('removes groups of three or more and leaves pairs', () => {
    const grid = put(emptyGrid(),
      [0, FAR, A], [1, FAR, A], [2, FAR, A],
      [4, FAR, B], [5, FAR, B]);
    const { toRemove, anyBombsDetonated } = computeRemovalSet(grid);
    expect(sortedKeys(toRemove)).toEqual(['0,11', '1,11', '2,11']);
    expect(anyBombsDetonated).toBe(false);
  });

  it('clears a rainbow and its four neighbours', () => {
    const grid = put(emptyGrid(),
      [3, FAR - 1, RAINBOW_INDEX],
      [2, FAR - 1, A], [4, FAR - 1, B], [3, FAR, C], [3, FAR - 2, A],
      [5, FAR, A]);
    expect(sortedKeys(computeRemovalSet(grid).toRemove))
      .toEqual(['2,10', '3,10', '3,11', '3,9', '4,10']);
  });

  it('detonates a bomb next to a match, and only then', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [1, FAR, A], [2, FAR, BOMB_INDEX], [3, FAR, B], [3, FAR - 1, C]);
    expect(computeRemovalSet(grid).toRemove.size).toBe(0);

    put(grid, [1, FAR - 1, A]);
    const { toRemove, anyBombsDetonated } = computeRemovalSet(grid);
    expect(anyBombsDetonated).toBe(true);
    // The match, the bomb, and everything in its 3×3
    expect(sortedKeys(toRemove)).toEqual(['0,11', '1,10', '1,11', '2,11', '3,10', '3,11']);
  });

  it('counts rows cleared wall to wall', () => {
    const full = new Set();
    for (let c = 0; c < GRID_COLS; c++) full.add(`${c},${FAR}`);
    expect(fullRowCount(full)).toBe(1);
    full.delete(`0,${FAR}`);
    expect(fullRowCount(full)).toBe(0);
  });
});

// ─── Gravity ─────────────────────────────────────────────────────────────────
describe('gravity', () => {
  it('lands a shot one row short of the first cube in the lane', () => {
    const grid = put(emptyGrid(), [2, FAR, A], [2, FAR - 1, B]);
    expect(landingRow(grid, 0)).toBe(FAR);
    expect(landingRow(grid, 2)).toBe(FAR - 2);
  });

  it('has nothing to move on a settled board', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [0, FAR - 1, B], [6, FAR, C]);
    expect(gravityMoves(grid)).toEqual([]);
  });

  it('closes every gap toward the far wall and keeps lane order', () => {
    const grid = put(emptyGrid(), [1, FAR - 2, A], [1, FAR - 5, B], [1, 1, C], [4, 3, A]);
    applyMoves(grid, gravityMoves(grid));
    expect(grid[1].slice(FAR - 2).map((cell) => cell?.colorIndex)).toEqual([C, B, A]);
    expect(grid[1].slice(0, FAR - 2).every((cell) => cell === null)).toBe(true);
    expect(grid[4][FAR]).toEqual({ colorIndex: A });
    expect(gravityMoves(grid)).toEqual([]);
  });

  it('produces moves that are safe to apply one at a time on any board', () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 200; trial++) {
      const grid = emptyGrid();
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          if (rng() < 0.4) grid[c][r] = { colorIndex: Math.floor(rng() * 5), id: `${c},${r}` };
        }
      }
      const before = grid.map((lane) => lane.filter(Boolean).map((cell) => cell.id));
      applyMoves(grid, gravityMoves(grid));
      const after = grid.map((lane) => lane.filter(Boolean).map((cell) => cell.id));
      expect(after).toEqual(before);
      for (let c = 0; c < GRID_COLS; c++) {
        const n = before[c].length;
        expect(grid[c].slice(GRID_ROWS - n).every(Boolean)).toBe(true);
      }
    }
  });
});

// ─── Curves ──────────────────────────────────────────────────────────────────
describe('curve table', () => {
  it.each([
    [1, 10], [2, 9], [3, 8.1], [5, 6.561], [10, 3.874], [14, 2.542], [15, 2.5], [40, 2.5],
  ])('wall interval at level %i is %ss', (level, seconds) => {
    expect(wallInterval(level)).toBeCloseTo(seconds, 3);
  });

  it('never speeds the wall down and never passes the floor', () => {
    for (let level = 2; level <= 60; level++) {
      expect(wallInterval(level)).toBeLessThanOrEqual(wallInterval(level - 1));
      expect(wallInterval(level)).toBeGreaterThanOrEqual(WALL_ADVANCE_INTERVAL_MIN);
    }
  });

  it('steps colours 3/3/4/4/4/5 and stays at five', () => {
    const counts = [1, 2, 3, 4, 5, 6, 7, 20].map(activeColorCount);
    expect(counts).toEqual([3, 3, 4, 4, 4, 5, 5, 5]);
  });

  it('needs 6 clears for level 2, then 10 per level', () => {
    expect([0, 5, 6, 15, 16, 25, 26, 96].map(levelForClears)).toEqual([1, 1, 2, 2, 3, 3, 4, 11]);
  });

  it('rotates themes every three levels', () => {
    expect([1, 3, 4, 6, 7, 9, 10].map((l) => themeIndexForLevel(l, 3))).toEqual([0, 0, 1, 1, 2, 2, 0]);
  });
});

// ─── Dealing ─────────────────────────────────────────────────────────────────
describe('colour bag', () => {
  it('deals exactly two of each active colour per bag', () => {
    const bag = { colors: [], count: 0 };
    const rng = mulberry32(1);
    for (let round = 0; round < 5; round++) {
      const dealt = Array.from({ length: 8 }, () => drawColorFromBag(bag, 4, rng));
      expect(dealt.sort()).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    }
  });

  it('starts a fresh bag when the colour count changes', () => {
    const bag = { colors: [], count: 0 };
    const rng = mulberry32(2);
    drawColorFromBag(bag, 3, rng);
    const dealt = Array.from({ length: 10 }, () => drawColorFromBag(bag, 5, rng));
    expect(dealt.sort()).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

// ─── Wall rows ───────────────────────────────────────────────────────────────
describe('generateWallRow', () => {
  it('fills every lane with an active colour and never three in a row', () => {
    for (const colorCount of [3, 4, 5]) {
      const rng = mulberry32(colorCount);
      for (let trial = 0; trial < 500; trial++) {
        const row = generateWallRow(rng, colorCount);
        expect(row).toHaveLength(GRID_COLS);
        for (let c = 0; c < GRID_COLS; c++) {
          expect(row[c]).toBeGreaterThanOrEqual(0);
          expect(row[c]).toBeLessThan(colorCount);
          if (c >= 2) expect(row[c] === row[c - 1] && row[c] === row[c - 2]).toBe(false);
        }
      }
    }
  });

  // So the n-th wall row of a Daily draws the same numbers on every board
  it('takes exactly one draw per lane, whatever the board', () => {
    const boards = mulberry32(5);
    for (const colorCount of [3, 4, 5]) {
      for (let trial = 0; trial < 100; trial++) {
        const grid = randomSettledBoard(boards, colorCount);
        stepLanes(grid);
        let draws = 0;
        generateWallRow(() => { draws++; return boards(); }, colorCount, grid);
        expect(draws).toBe(GRID_COLS);
      }
    }
  });
});

// ─── Opening seed ────────────────────────────────────────────────────────────
describe('seedOpeningRows', () => {
  // Every lane choice the generator can make: rng() at the ends of [0, 1)
  // and between them.
  const rngValues = [0, 0.2, 0.34, 0.5, 0.67, 0.8, 0.999999];

  it('puts two cubes of the shot colour on the far row with an open lane between', () => {
    for (const v of rngValues) {
      const seeds = seedOpeningRows(() => v, B, C);
      expect(seeds).toHaveLength(2);
      const [left, right] = seeds;
      expect(left).toMatchObject({ row: FAR, colorIndex: B });
      expect(right).toMatchObject({ row: FAR, colorIndex: B, col: left.col + 2 });
      expect(left.col).toBeGreaterThanOrEqual(0);
      expect(right.col).toBeLessThan(GRID_COLS);
    }
  });

  it('guarantees the first shot into the gap clears all three', () => {
    for (const v of rngValues) {
      for (let color = 0; color < NUM_COLORS; color++) {
        const grid = emptyGrid();
        const seeds = seedOpeningRows(() => v, color, A);
        for (const { col, row, colorIndex } of seeds) put(grid, [col, row, colorIndex]);
        expect(computeRemovalSet(grid).toRemove.size).toBe(0);

        const gap = seeds[0].col + 1;
        put(grid, [gap, landingRow(grid, gap), color]);
        const { toRemove } = computeRemovalSet(grid);
        expect(sortedKeys(toRemove)).toEqual(
          [`${gap - 1},${FAR}`, `${gap},${FAR}`, `${gap + 1},${FAR}`].sort());
      }
    }
  });

  it('seeds the next colour when the shot in hand is a special', () => {
    for (const special of [RAINBOW_INDEX, BOMB_INDEX]) {
      const seeds = seedOpeningRows(() => 0.5, special, C);
      expect(seeds.every((s) => s.colorIndex === C)).toBe(true);
    }
  });
});

// ─── Daily determinism ───────────────────────────────────────────────────────
describe('daily determinism', () => {
  const DAILY_SEED_2026_10_20 = 2271995213;
  const FIRST_DRAWS_2026_10_20 = [0.6045638311188668, 0.5123325088061392, 0.4318172540515661];

  const FIRST_WALL_DRAWS_2026_10_20 = [0.08767415257170796, 0.3620250739622861, 0.6966757776681334];

  // Everything a daily run draws before the player acts: the hand from the
  // queue stream; the opening seeds, then the first few wall rows, from the
  // wall stream.
  function dailyOpening(dateKey) {
    const { queueRng, wallRng } = dailyRngs(dateKey);
    const bag = { colors: [], count: 0 };
    const hand = Array.from({ length: 12 }, () => randomColorIndex(bag, 1, queueRng));
    const seeds = seedOpeningRows(wallRng, hand[0], hand[1]);
    const walls = Array.from({ length: 5 }, () => generateWallRow(wallRng, activeColorCount(1)));
    return { hand, seeds, walls };
  }

  it('pins the seeds for a date, so a refactor cannot silently change the board', () => {
    expect(dailySeed('2026-10-20')).toBe(DAILY_SEED_2026_10_20);
    const rng = mulberry32(DAILY_SEED_2026_10_20);
    expect(Array.from({ length: 3 }, () => rng())).toEqual(FIRST_DRAWS_2026_10_20);
    const { queueRng, wallRng } = dailyRngs('2026-10-20');
    expect(Array.from({ length: 3 }, () => queueRng())).toEqual(FIRST_DRAWS_2026_10_20);
    expect(Array.from({ length: 3 }, () => wallRng())).toEqual(FIRST_WALL_DRAWS_2026_10_20);
  });

  it('deals the same opening to everyone on the same date', () => {
    expect(dailyOpening('2026-10-20')).toEqual(dailyOpening('2026-10-20'));
  });

  it('deals a different opening on a different date', () => {
    expect(dailySeed('2026-10-21')).not.toBe(dailySeed('2026-10-20'));
    expect(dailyOpening('2026-10-21')).not.toEqual(dailyOpening('2026-10-20'));
  });

  // Bug 3: one stream fed both the queue and the wall rows, so the numbers
  // a wall row drew depended on how many cubes had been dealt before it.
  // A daily run reduced to the order main.js draws in: the hand at restart,
  // the opening seeds, then a deal for every shot and a row for every wall
  // advance, in whatever order the player's timing put them.
  function drawsInOrder(timing, { queueRng, wallRng }) {
    const bag = { colors: [], count: 0 };
    const deal = () => randomColorIndex(bag, 1, queueRng);
    const queue = [deal(), deal(), deal(), deal()];
    seedOpeningRows(wallRng, queue[0], queue[1]);
    const walls = [];
    for (const event of timing) {
      if (event === 'shot') queue.push(deal());
      else walls.push(generateWallRow(wallRng, activeColorCount(1)));
    }
    return { queue, walls };
  }
  // The same six shots and three wall advances: one player shoots ahead of
  // the wall, the other lets it come first.
  const EARLY = ['shot', 'shot', 'shot', 'wall', 'shot', 'shot', 'wall', 'shot', 'wall'];
  const LATE = ['shot', 'wall', 'shot', 'wall', 'shot', 'shot', 'wall', 'shot', 'shot'];

  it('deals the same queue and wall rows however the shots are timed', () => {
    const early = drawsInOrder(EARLY, dailyRngs('2026-10-20'));
    const late = drawsInOrder(LATE, dailyRngs('2026-10-20'));
    expect(early.queue).toHaveLength(10);
    expect(early.walls).toHaveLength(3);
    expect(late).toEqual(early);
  });

  it('would not with one stream for both, as before the split', () => {
    const shared = () => {
      const rng = mulberry32(dailySeed('2026-10-20'));
      return { queueRng: rng, wallRng: rng };
    };
    const early = drawsInOrder(EARLY, shared());
    const late = drawsInOrder(LATE, shared());
    expect(late.queue).not.toEqual(early.queue);
    expect(late.walls).not.toEqual(early.walls);
  });

  it('resumes a saved run on exactly the same sequence', () => {
    const rng = mulberry32(dailySeed('2026-10-20'));
    for (let i = 0; i < 37; i++) rng();
    const resumed = mulberry32(rng.state());
    const a = Array.from({ length: 50 }, () => rng());
    const b = Array.from({ length: 50 }, () => resumed());
    expect(b).toEqual(a);
  });
});

// ─── Wall advance ────────────────────────────────────────────────────────────
describe('endless streams', () => {
  const draw = (rng, n) => Array.from({ length: n }, () => rng());

  it('deals the same run from the same seed, a different one from another', () => {
    const a = endlessRngs(12345);
    const b = endlessRngs(12345);
    const c = endlessRngs(12346);
    expect(draw(a.queueRng, 8)).toEqual(draw(b.queueRng, 8));
    expect(draw(a.wallRng, 8)).toEqual(draw(b.wallRng, 8));
    expect(draw(c.queueRng, 8)).not.toEqual(draw(endlessRngs(12345).queueRng, 8));
  });

  it('keeps the queue and the wall apart, and resumes either from its state', () => {
    const { queueRng, wallRng } = endlessRngs(777);
    expect(draw(queueRng, 4)).not.toEqual(draw(wallRng, 4));
    const resumed = mulberry32(wallRng.state());
    expect(draw(resumed, 5)).toEqual(draw(wallRng, 5));
  });

  it('does not draw from Math.random', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('Math.random was called'); };
    try {
      const { queueRng, wallRng } = endlessRngs(1);
      const bag = { colors: [], count: 0 };
      for (let i = 0; i < 20; i++) randomColorIndex(bag, 8, queueRng);
      seedOpeningRows(wallRng, 0, 1);
      generateWallRow(wallRng, 5, emptyGrid());
    } finally {
      Math.random = real;
    }
  });
});

describe('wall advance', () => {
  it('test boards are settled and match-free, like the game between advances', () => {
    const rng = mulberry32(11);
    for (let trial = 0; trial < 100; trial++) {
      const grid = randomSettledBoard(rng, 3);
      expect(gravityMoves(grid)).toEqual([]);
      expect(computeRemovalSet(grid).toRemove.size).toBe(0);
    }
  });

  it('moves every lane one row toward the player and fills the far row', () => {
    const grid = put(emptyGrid(), [0, FAR, A], [0, FAR - 1, B], [5, FAR, C]);
    advanceWall(grid, mulberry32(3), 3);
    expect(grid[0][FAR - 1]).toEqual({ colorIndex: A });
    expect(grid[0][FAR - 2]).toEqual({ colorIndex: B });
    expect(grid[5][FAR - 1]).toEqual({ colorIndex: C });
    for (let c = 0; c < GRID_COLS; c++) expect(grid[c][FAR]).not.toBeNull();
  });

  // Bug 1: generateWallRow used to rule out three in a row within the new row
  // only. The flood fill also counts the row behind it, so a pair in the new
  // row over a cube of the same colour (or one cube over a pair in its lane)
  // arrived as a free clear.
  it('never hands the player a match on any settled board', () => {
    for (const colorCount of [3, 4, 5]) {
      for (let trial = 0; trial < 300; trial++) {
        const rng = mulberry32(colorCount * 1000 + trial);
        const grid = randomSettledBoard(rng, colorCount);
        advanceWall(grid, rng, colorCount);
        const { toRemove } = computeRemovalSet(grid);
        expect(toRemove.size,
          `${colorCount} colours, trial ${trial}: free match at ${sortedKeys(toRemove).join(' ')}\n${render(grid)}`,
        ).toBe(0);
      }
    }
  });
});
