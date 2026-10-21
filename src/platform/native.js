// ─── Native shell detection ──────────────────────────────────────────────────
// Inside the Capacitor iOS shell the native bridge defines window.Capacitor
// before any page script runs; in a browser it is absent. Reading the global
// rather than importing @capacitor/core keeps the web bundle as it was: the
// plugin packages are only ever loaded with a dynamic import() behind this
// check, so they land in their own chunks that a browser never fetches.

export const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
