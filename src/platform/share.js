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
  } catch {
    // Dismissed, or the plugin is missing: nothing was shared
    return null;
  }
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'web';
    } catch (err) {
      // The player closed the sheet: that is an answer. Anything else (a
      // desktop browser that has the API but no sheet, a missing user
      // gesture) falls through to the clipboard.
      if (err && err.name === 'AbortError') return null;
    }
  }
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    }
  } catch {
    // Clipboard refused
  }
  return null;
}
