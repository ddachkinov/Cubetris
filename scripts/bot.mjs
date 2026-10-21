// Shared by the headless harnesses (shoot.mjs, replay.mjs): the board shape,
// a seeded Math.random for the page, and the one-ply greedy bot.

export const COLS = 7;
export const ROWS = 12;

// Flood-fill the same 4-connected same-colour group the game matches on.
export function groupAt(grid, col, row) {
  const color = grid[col][row];
  const seen = new Set();
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    const key = `${c},${r}`;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS || seen.has(key)) continue;
    if (grid[c][r] === null || grid[c][r] !== color) continue;
    seen.add(key);
    stack.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
  }
  return [...seen];
}

export function landingRow(grid, col) {
  for (let r = 0; r < ROWS; r++) if (grid[col][r] !== null) return r - 1;
  return ROWS - 1;
}

// Points a cube of `color` landing at (col, row) would score, following the
// cascade through: clear every 3+ group, let the rest fall toward the far
// wall, repeat. Plain colours only; rainbows and bombs are not simulated.
export function cascadePoints(grid, col, row, color) {
  const sim = grid.map((lane) => lane.slice());
  sim[col][row] = color;
  let points = 0;
  for (let step = 1; ; step++) {
    const clear = new Set();
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (sim[c][r] === null || sim[c][r] >= 5 || clear.has(`${c},${r}`)) continue;
        const group = groupAt(sim, c, r);
        if (group.length >= 3) group.forEach((k) => clear.add(k));
      }
    }
    if (!clear.size) return points;
    points += clear.size * 10 * step;
    for (const k of clear) {
      const [c, r] = k.split(',').map(Number);
      sim[c][r] = null;
    }
    for (let c = 0; c < COLS; c++) {
      const kept = sim[c].filter((x) => x !== null);
      sim[c] = [...Array(ROWS - kept.length).fill(null), ...kept];
    }
  }
}

// One-ply greedy: take the biggest clear available; otherwise grow the
// biggest same-colour group; break ties toward the far wall, then the middle.
// Never lands on rows 0-2 unless nothing else is left. With { chains: true }
// a clear is worth the points of the whole cascade it sets off, so a chain
// beats a bigger single clear.
export function rankLanes(grid, color, { chains = false } = {}) {
  let best = null;
  for (let col = 0; col < COLS; col++) {
    const row = landingRow(grid, col);
    if (row < 0) continue;
    let value;
    if (color >= 5) {
      // Rainbow / bomb: fire it into the most crowded spot
      const neighbours = [[-1, 0], [1, 0], [0, 1]]
        .filter(([dc, dr]) => grid[col + dc]?.[row + dr] != null).length;
      value = neighbours * 50 + row * 2;
    } else {
      const sim = grid.map((lane) => lane.slice());
      sim[col][row] = color;
      const size = groupAt(sim, col, row).length;
      value = size >= 3 ? 1000 + (chains ? cascadePoints(grid, col, row, color) : size * 50) : size * 40;
      value += row * 2;
    }
    if (row <= 2) value -= 500;
    value -= Math.abs(col - 3) * 0.1;
    if (!best || value > best.value) best = { col, value };
  }
  return best;
}

export function chooseLane(grid, color) {
  const best = rankLanes(grid, color);
  return best && best.col;
}

// Installed with context.addInitScript, so it runs before the game loads.
// Seeds Math.random (debris, shake, sound), and crypto.getRandomValues for
// 32-bit draws, which is where an Endless run's seed comes from; each from
// its own stream, so how much three.js draws from Math.random never moves
// the Endless board.
export function seededRandom(seed) {
  const stream = (s) => {
    let a = s >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  };
  const next = stream(seed);
  Math.random = () => next() / 4294967296;
  const nextSeed = stream(seed ^ 0x9e3779b9);
  const real = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (arr) => {
    if (!(arr instanceof Uint32Array)) return real(arr);
    for (let i = 0; i < arr.length; i++) arr[i] = nextSeed();
    return arr;
  };
}
