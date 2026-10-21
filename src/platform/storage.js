// ─── Native storage ──────────────────────────────────────────────────────────
// A persistence backend (see src/persistence.js) on @capacitor/preferences,
// i.e. UserDefaults. WKWebView's localStorage can be evicted by the system;
// UserDefaults is not. Only imported inside the iOS shell.

import { Preferences } from '@capacitor/preferences';

export const preferencesBackend = {
  name: 'preferences',
  async load() {
    const { keys } = await Preferences.keys();
    const out = {};
    await Promise.all(keys.map(async (key) => {
      const { value } = await Preferences.get({ key });
      if (value !== null) out[key] = value;
    }));
    // First launch of the native build: carry over anything a web session
    // in this same WebView already stored
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hueshot-') && !(key in out)) {
        out[key] = localStorage.getItem(key);
        Preferences.set({ key, value: out[key] });
      }
    }
    return out;
  },
  set(key, value) {
    return Preferences.set({ key, value });
  },
  remove(key) {
    return Preferences.remove({ key });
  },
};
