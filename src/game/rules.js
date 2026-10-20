// ─── Rules ───────────────────────────────────────────────────────────────────
// The game's rules as plain functions: no Three.js, no DOM, no module state.
// A grid is grid[col][row], row 0 being the player's row and row
// GRID_ROWS - 1 the far wall. Each cell is null or an object with a
// colorIndex; the game's cells also carry a mesh, which nothing here touches.

export const GRID_COLS = 7;
export const GRID_ROWS = 12;
export const SHOOT_SPEED = 40;
// Wall interval decays geometrically instead of linearly: gentle at first,
// steep in the middle, and it plateaus near the floor instead of hitting a
// wall of death. See wallInterval().
export const WALL_ADVANCE_INTERVAL_START = 10;
export const WALL_ADVANCE_INTERVAL_MIN = 2.5;
export const WALL_ADVANCE_DECAY = 0.9;
// Level 1 is a short on-ramp (first level-up inside ~30s); every level after
// costs the full ten.
export const CLEARS_FOR_LEVEL_1 = 6;
export const CLEARS_PER_LEVEL = 10;
export const ROW_CLEAR_BONUS = 200;

// Five plain colours (0-4), then the special cubes
export const NUM_COLORS = 5;
export const RAINBOW_INDEX = NUM_COLORS;     // 5
export const BOMB_INDEX = NUM_COLORS + 1;    // 6

// ─── Curves ──────────────────────────────────────────────────────────────────
export function activeColorCount(level) {
  // Two step-ups (3 colours, then 4, then 5) instead of three, each one a
  // deliberate difficulty spike rather than smoothed-out ramp.
  if (level >= 6) return 5;
  if (level >= 3) return 4;
  return 3;
}

export function wallInterval(level) {
  // Geometric decay: gentle at first, steepest in the middle, and it settles
  // near the floor instead of a linear ramp that eventually walls off a
  // player who was keeping pace one level earlier.
  return Math.max(
    WALL_ADVANCE_INTERVAL_MIN,
    WALL_ADVANCE_INTERVAL_START * Math.pow(WALL_ADVANCE_DECAY, level - 1)
  );
}

// Cumulative clears -> level. Level 1 is a short on-ramp; every level after
// costs the same as the last.
export function levelForClears(totalCleared) {
  if (totalCleared < CLEARS_FOR_LEVEL_1) return 1;
  return 2 + Math.floor((totalCleared - CLEARS_FOR_LEVEL_1) / CLEARS_PER_LEVEL);
}

// Themes rotate every 3 levels
export function themeIndexForLevel(level, themeCount) {
  return Math.floor((level - 1) / 3) % themeCount;
}

// ─── Seeded RNG (Daily runs) ─────────────────────────────────────────────────
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// rng.state() is the generator's whole state: mulberry32(rng.state())
// carries on exactly where rng left off.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => a | 0;
  return rng;
}

// Everyone playing the same date gets the same board
export function dailySeed(dateKey) {
  return hashString('hueshot-' + dateKey);
}

// ─── Bag-based colour dealing ────────────────────────────────────────────────
// 2 of each active colour per bag, shuffled. Kills droughts/floods so the
// game feels fair. `bag` is { colors, count } and is the only thing changed.
export function drawColorFromBag(bag, n, rngFn) {
  if (bag.count !== n) {
    bag.colors = [];
    bag.count = n;
  }
  if (bag.colors.length === 0) {
    for (let i = 0; i < n; i++) bag.colors.push(i, i);
    for (let i = bag.colors.length - 1; i > 0; i--) {
      const j = Math.floor(rngFn() * (i + 1));
      [bag.colors[i], bag.colors[j]] = [bag.colors[j], bag.colors[i]];
    }
  }
  return bag.colors.pop();
}

export function randomColorIndex(bag, level, rngFn) {
  // Special cubes at higher levels
  if (level >= 7 && rngFn() < 0.04) return BOMB_INDEX;
  if (level >= 4 && rngFn() < 0.05) return RAINBOW_INDEX;
  return drawColorFromBag(bag, activeColorCount(level), rngFn);
}

// A wall row that arrives with a free match already built in isn't a threat,
// it's a gift the player didn't earn — so no cube of the new row may complete
// a group of three, along the row or with the lanes it is pushed against.
// `grid` is the board after every lane has stepped toward the player, far
// row still empty; without it the row is only checked against itself. Each
// lane takes exactly one draw: the drawn colour if it is safe, otherwise the
// next safe one round the wheel. A cube has at most two neighbours placed
// before it (the lane behind, the lane to its left), so with three or more
// colours one is always safe. Not bag-dealt: unlike the player's queue,
// walls should still feel wild column-to-column, just never a freebie.
export function generateWallRow(rngFn, colorCount, grid = null) {
  const far = GRID_ROWS - 1;
  const board = grid
    ? grid.map((lane) => lane.slice())
    : Array.from({ length: GRID_COLS }, () => Array(GRID_ROWS).fill(null));
  const row = [];
  for (let c = 0; c < GRID_COLS; c++) {
    const drawn = Math.floor(rngFn() * colorCount);
    let color = drawn;
    for (let i = 0; i < colorCount; i++) {
      const candidate = (drawn + i) % colorCount;
      board[c][far] = { colorIndex: candidate };
      if (findMatchGroup(board, c, far).length < 3) {
        color = candidate;
        break;
      }
    }
    board[c][far] = { colorIndex: color };
    row.push(color);
  }
  return row;
}

// The board used to start empty: nothing arrived until the wall's first
// advance, and the 2-per-colour bag meant a first match usually needed 4-6
// shots. Instead, seed two cubes of the colour the player is about to fire,
// one lane apart, at the far row. Whichever lane they aim first or second,
// the gap between the seeds completes a match on contact -- a guaranteed
// clear inside the first two shots, no matter how the bag shuffled.
// Returns the cubes to place as [{ col, row, colorIndex }].
export function seedOpeningRows(rngFn, currentColor, nextColor) {
  const seedColor = currentColor < NUM_COLORS ? currentColor : nextColor;
  const col = 2 + Math.floor(rngFn() * (GRID_COLS - 4));
  // col + 1 stays open: a shot there lands between the two seeds and clears.
  return [
    { col, row: GRID_ROWS - 1, colorIndex: seedColor },
    { col: col + 2, row: GRID_ROWS - 1, colorIndex: seedColor },
  ];
}

// ─── Board queries ───────────────────────────────────────────────────────────
export function landingRow(grid, col) {
  for (let r = 0; r < GRID_ROWS; r++) {
    if (grid[col][r]) {
      return r - 1;
    }
  }
  return GRID_ROWS - 1;
}

// A cube on the player's row ends the run
export function reachedFront(grid) {
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c][0]) return true;
  }
  return false;
}

// Danger = any cube within 2 rows of the front
export function isInDanger(grid) {
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[c] && (grid[c][1] || grid[c][2])) return true;
  }
  return false;
}

// ─── Adjacency detection ─────────────────────────────────────────────────────
export function findMatchGroup(grid, col, row) {
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

// ─── Removal detection (one cascade step) ────────────────────────────────────
// Rainbow cross-clears, flood-filled colour groups of 3+, and any bombs
// adjacent to what's already being removed (chained up to 10 times so a bomb
// can trigger a bomb). Returns the set of "col,row" keys to remove this step,
// plus whether a bomb went off.
export function computeRemovalSet(grid) {
  const toRemove = new Set();

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

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!grid[c][r]) continue;
      const group = findMatchGroup(grid, c, r);
      if (group.length >= 3) {
        group.forEach((g) => toRemove.add(`${g.col},${g.row}`));
      }
    }
  }

  let anyBombsDetonated = false;
  if (toRemove.size > 0) {
    for (let iter = 0; iter < 10; iter++) {
      const bombKeys = [];
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid[c][r];
          if (!cell || cell.colorIndex !== BOMB_INDEX) continue;
          if (toRemove.has(`${c},${r}`)) continue;
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

  return { toRemove, anyBombsDetonated };
}

// Rows that a removal set clears from wall to wall
export function fullRowCount(toRemove) {
  let rows = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    let allCols = true;
    for (let c = 0; c < GRID_COLS; c++) {
      if (!toRemove.has(`${c},${r}`)) { allCols = false; break; }
    }
    if (allCols) rows++;
  }
  return rows;
}

// Gravity pulls toward the far wall: every lane closes up its gaps. Returns
// the moves as [{ col, from, to }], in an order that is safe to apply one at
// a time to the same grid.
export function gravityMoves(grid) {
  const moves = [];
  for (let c = 0; c < GRID_COLS; c++) {
    let writeRow = GRID_ROWS - 1;
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      if (grid[c][r]) {
        if (r !== writeRow) moves.push({ col: c, from: r, to: writeRow });
        writeRow--;
      }
    }
  }
  return moves;
}
