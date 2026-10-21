// Capacitor wraps the Vite build (dist/) in a native iOS shell. See
// docs/APPSTORE_PLAN.md, Phase 5. The web build does not depend on this file.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Placeholder until the name clears (docs/APPSTORE_PLAN.md, Gate 1)
  appId: 'com.ddachkinov.hueshot',
  appName: 'Hueshot',
  webDir: 'dist',
  ios: {
    // The game draws edge to edge and handles the safe areas in CSS
    contentInset: 'never',
    // No rubber-band scroll or link previews in a game
    scrollEnabled: false,
    allowsLinkPreview: false,
    backgroundColor: '#f3eee6',
  },
};

export default config;
