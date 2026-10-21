// ─── Share ───────────────────────────────────────────────────────────────────
// The share sheet for a result line (the Daily's share, Phase 6): the native
// sheet in the iOS shell, the Web Share API where a browser has it, and the
// clipboard otherwise. Resolves to how it was shared, or null.

import { isNative } from './native.js';

export async function shareText(text) {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text });
      return 'native';
    }
    if (navigator.share) {
      await navigator.share({ text });
      return 'web';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    }
  } catch {
    // Dismissed or refused: nothing was shared
  }
  return null;
}
