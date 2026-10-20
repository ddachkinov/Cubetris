// ─── Cube palette ────────────────────────────────────────────────────────────
// The five plain colours, as hex for materials and as CSS for the HUD. The
// active theme swaps them in place, so importers always see the current set.

export const COLORS = [
  0xff4444, // red
  0x44bb44, // green
  0x4488ff, // blue
  0xffcc00, // yellow
  0xff66ff, // magenta
];
export const COLOR_NAMES = [];

function refreshColorNames() {
  COLOR_NAMES.length = 0;
  COLOR_NAMES.push(...COLORS.map((c) => '#' + c.toString(16).padStart(6, '0')));
}
refreshColorNames();

export function setPalette(palette) {
  for (let i = 0; i < COLORS.length; i++) COLORS[i] = palette[i];
  refreshColorNames();
}
