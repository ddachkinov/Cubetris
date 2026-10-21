// ─── Palette ─────────────────────────────────────────────────────────────────
// "Ceramic on paper" (docs/APPSTORE_PLAN.md, Design — Beautiful): one colour
// system in three tints. Each theme in themes.js names its tint; the tint
// picks every colour on screen, the theme the music.
//
// COLORS / COLOR_NAMES are the five plain cube colours, as hex for materials
// and as CSS for the HUD. The active tint swaps them in place, so importers
// always see the current set.

// Coral, teal, cobalt, amber, orchid: no red-vs-green pair. Amber vs coral is
// still close for protanopes, so every colour also carries a glyph (GLYPHS).
const DAWN_CUBES = [0xf25f5c, 0x2ec4b6, 0x3a6ff2, 0xffb020, 0xb564e3];

// Dusk sits on a dark ground, so its cubes are lifted 8% in luminance
function lift(hex, amount) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const up = (v) => Math.round(v + (255 - v) * amount);
  return (up(r) << 16) | (up(g) << 8) | up(b);
}

export const TINTS = {
  dawn: {
    name: 'DAWN',
    ground: 0xf3eee6,
    floor: 0xe7e0d5,
    laneAlt: 0xede6da,
    line: 0xd6cdbf,
    danger: 0xf2b8a6,
    slab: 0x2b2a28,
    shadow: 0.2,
    activeLane: 0.45,
    cubes: DAWN_CUBES,
  },
  dusk: {
    name: 'DUSK',
    ground: 0x2a2734,
    floor: 0x343047,
    laneAlt: 0x3a364e,
    line: 0x4a4560,
    danger: 0xc9705e,
    slab: 0x15131b,
    shadow: 0.45,
    activeLane: 0.1,
    cubes: DAWN_CUBES.map((c) => lift(c, 0.08)),
  },
  slate: {
    name: 'SLATE',
    ground: 0xdde3e8,
    floor: 0xcfd6dc,
    laneAlt: 0xd6dde2,
    line: 0xbac3cb,
    danger: 0xf2b8a6,
    slab: 0x2b2a28,
    shadow: 0.2,
    activeLane: 0.45,
    cubes: DAWN_CUBES,
  },
};

export function tintForTheme(theme) {
  return TINTS[theme.tint];
}

// Specials: rainbow is an animated hue on a white base; the bomb is a dark
// body with a coral fuse glyph
export const RAINBOW_BASE = 0xffffff;
export const BOMB_BODY = 0x2b2a28;
export const BOMB_FUSE = 0xf25f5c;

// Face glyph per colour index, same order as the atlas in cubes.js and the
// SVGs in the HUD: dot, ring, cross, bar, diamond, then rainbow and bomb
export const GLYPHS = ['dot', 'ring', 'cross', 'bar', 'diamond', 'star', 'fuse'];

export let currentTint = TINTS.dawn;
export const COLORS = [...DAWN_CUBES];
export const COLOR_NAMES = [];

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

function refreshColorNames() {
  COLOR_NAMES.length = 0;
  COLOR_NAMES.push(...COLORS.map(css));
}
refreshColorNames();

export function setTint(tint) {
  currentTint = tint;
  for (let i = 0; i < COLORS.length; i++) COLORS[i] = tint.cubes[i];
  refreshColorNames();
}

export { css as hexToCss };
