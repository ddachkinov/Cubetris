// ─── Haptics ─────────────────────────────────────────────────────────────────
// The haptic table from docs/APPSTORE_PLAN.md (Game feel), one name per game
// event. In the iOS shell each maps to a Taptic Engine call through
// @capacitor/haptics; in a browser, to a short navigator.vibrate pattern
// where that exists (Android) and to nothing where it doesn't (iOS Safari).

import { isNative } from './native.js';

// event: [native call, web vibrate pattern in ms]
const TABLE = {
  select: [(h) => h.Haptics.selectionChanged(), 8], // lane change, hold swap
  land: [(h) => h.Haptics.impact({ style: h.ImpactStyle.Light }), 10], // cube lands
  clear: [(h) => h.Haptics.impact({ style: h.ImpactStyle.Medium }), 18], // a group clears
  heavy: [(h) => h.Haptics.impact({ style: h.ImpactStyle.Heavy }), 35], // chain x3+, row clear, clutch
  wall: [(h) => h.Haptics.notification({ type: h.NotificationType.Warning }), [20, 40, 20]], // wall advances
  gameOver: [(h) => h.Haptics.notification({ type: h.NotificationType.Error }), [40, 60, 40]],
  levelUp: [(h) => h.Haptics.notification({ type: h.NotificationType.Success }), [15, 30, 15]],
};

let plugin = null;
if (isNative) {
  import('@capacitor/haptics').then((m) => {
    plugin = m;
    // selectionChanged() is a no-op on iOS until a selection generator
    // exists; keep one alive for the whole session
    m.Haptics.selectionStart().catch(() => {});
  }).catch(() => {});
}

export function haptic(event) {
  const entry = TABLE[event];
  if (!entry) return;
  const [native, pattern] = entry;
  if (isNative) {
    // Fire and forget: a haptic that fails is not worth an error
    if (plugin) native(plugin).catch(() => {});
    return;
  }
  if (navigator.vibrate) navigator.vibrate(pattern);
}
