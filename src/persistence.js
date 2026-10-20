// ─── Persistence ─────────────────────────────────────────────────────────────
// Everything that outlives a run lives in localStorage: the best score,
// lifetime stats, the best score per daily, and whether the first-run hint
// has been seen.

const BEST_KEY = 'hueshot-best';
const STATS_KEY = 'hueshot-stats';
const DAILY_PREFIX = 'hueshot-daily-';
const HINT_KEY = 'hueshot-hint-seen';

// Local calendar date, YYYY-MM-DD: names the daily's seed and its best score
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadBest() {
  return parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
}

export function saveBest(score) {
  localStorage.setItem(BEST_KEY, String(score));
}

export function loadLifeStats() {
  return JSON.parse(
    localStorage.getItem(STATS_KEY)
    || '{"cleared":0,"bestChain":0,"games":0}'
  );
}

export function saveLifeStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Records a daily score; returns the best for that day including this one
export function recordDailyScore(dateKey, score) {
  const key = DAILY_PREFIX + dateKey;
  const prev = parseInt(localStorage.getItem(key) || '0', 10);
  if (score > prev) localStorage.setItem(key, String(score));
  return Math.max(prev, score);
}

export function hintSeen() {
  return localStorage.getItem(HINT_KEY) === '1';
}

export function markHintSeen() {
  localStorage.setItem(HINT_KEY, '1');
}
