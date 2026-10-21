// ─── Persistence ─────────────────────────────────────────────────────────────
// Everything that outlives a run: the best score, lifetime stats, the best
// score per daily, whether the first-run hint has been seen, the mute
// setting, and a run in progress (so a run survives the app being killed).
//
// Storage sits behind a small backend interface, so the iOS shell can keep
// it in UserDefaults (@capacitor/preferences) instead of WKWebView's
// localStorage, which the system may evict:
//
//   backend = {
//     name,
//     load(): Promise<{ [key]: string }>  every hueshot- key, once at boot
//     set(key, value)                      write through; may return a promise
//     remove(key)
//   }
//
// The whole store is read into memory once, before the game starts (this
// module awaits it at the top level, so importers see it loaded), and every
// read after that is synchronous.

import { isNative } from './platform/native.js';

const PREFIX = 'hueshot-';
const BEST_KEY = PREFIX + 'best';
const STATS_KEY = PREFIX + 'stats';
const DAILY_PREFIX = PREFIX + 'daily-';
const HINT_KEY = PREFIX + 'hint-seen';
const MUTED_KEY = PREFIX + 'muted';
const RUN_KEY = PREFIX + 'run';

export const localStorageBackend = {
  name: 'localStorage',
  async load() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX)) out[key] = localStorage.getItem(key);
      }
    } catch {
      // Storage disabled (private mode, blocked site data): play without it
    }
    return out;
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* full or blocked */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* blocked */ }
  },
};

// In the iOS shell, UserDefaults through @capacitor/preferences (see
// src/platform/storage.js); in a browser, localStorage. The native module
// is a dynamic import, so the web bundle never loads it.
async function chooseBackend() {
  if (isNative) {
    try {
      const { preferencesBackend } = await import('./platform/storage.js');
      return preferencesBackend;
    } catch {
      // Plugin missing: fall back rather than not start
    }
  }
  return localStorageBackend;
}

const backend = await chooseBackend();
const cache = await backend.load();

function read(key) {
  return key in cache ? cache[key] : null;
}

function write(key, value) {
  cache[key] = value;
  Promise.resolve(backend.set(key, value)).catch(() => {});
}

function erase(key) {
  delete cache[key];
  Promise.resolve(backend.remove(key)).catch(() => {});
}

export const storageBackendName = backend.name;

// Local calendar date, YYYY-MM-DD: names the daily's seed and its best score
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadBest() {
  return parseInt(read(BEST_KEY) || '0', 10);
}

export function saveBest(score) {
  write(BEST_KEY, String(score));
}

export function loadLifeStats() {
  try {
    return JSON.parse(read(STATS_KEY) || '{"cleared":0,"bestChain":0,"games":0}');
  } catch {
    return { cleared: 0, bestChain: 0, games: 0 };
  }
}

export function saveLifeStats(stats) {
  write(STATS_KEY, JSON.stringify(stats));
}

// Records a daily score; returns the best for that day including this one
export function recordDailyScore(dateKey, score) {
  const key = DAILY_PREFIX + dateKey;
  const prev = parseInt(read(key) || '0', 10);
  if (score > prev) write(key, String(score));
  return Math.max(prev, score);
}

export function hintSeen() {
  return read(HINT_KEY) === '1';
}

export function markHintSeen() {
  write(HINT_KEY, '1');
}

export function loadMuted() {
  return read(MUTED_KEY) === '1';
}

export function saveMuted(muted) {
  write(MUTED_KEY, muted ? '1' : '0');
}

// ─── A run in progress ───────────────────────────────────────────────────────
// { run: serialize() output, dailyDate: 'YYYY-MM-DD' or null, savedAt: ms }
export function writeSavedRun(saved) {
  write(RUN_KEY, JSON.stringify(saved));
}

// The saved run, or null if there is none or it can't be read
export function readSavedRun() {
  const raw = read(RUN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSavedRun() {
  if (read(RUN_KEY) !== null) erase(RUN_KEY);
}
