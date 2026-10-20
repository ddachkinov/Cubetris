// ─── Haptics ─────────────────────────────────────────────────────────────────
// navigator.vibrate where it exists (Android browsers); a no-op elsewhere.

export function hapticPulse(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}
