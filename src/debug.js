// ─── Debug flag ──────────────────────────────────────────────────────────────
// ?debug=1 turns on the debug hook (window.__hs, see main.js) and the frame
// meter (render/perf.js). Inside the iOS shell there is no address bar, so
// the same switch is a localStorage flag, set from Safari's Web Inspector:
//
//   localStorage.setItem('hueshot-debug', '1'); location.reload()
//
// and removed the same way. Neither is reachable by a player.

function readFlag() {
  if (new URLSearchParams(location.search).get('debug') === '1') return true;
  try {
    return localStorage.getItem('hueshot-debug') === '1';
  } catch {
    return false;
  }
}

export const DEBUG = readFlag();
