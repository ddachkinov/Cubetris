// ─── App lifecycle ───────────────────────────────────────────────────────────
// In the iOS shell, @capacitor/app reports the app going inactive (a call,
// Control Centre, the app switcher) before the page is hidden, and coming
// back. The game treats both like the tab being hidden and shown. Portrait
// is locked in Info.plist; ScreenOrientation locks it at runtime too, for
// the iPad's multitasking cases. In a browser this does nothing; the page's
// own visibilitychange covers it.

import { isNative } from './native.js';

export function initNativeLifecycle({ onHide, onShow }) {
  if (!isNative) return;
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', ({ isActive }) => (isActive ? onShow() : onHide()));
  }).catch(() => {});
  import('@capacitor/screen-orientation').then(({ ScreenOrientation }) => {
    ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => {});
  }).catch(() => {});
}
