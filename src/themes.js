// ─── Themes ──────────────────────────────────────────────────────────────────
// A theme is a paper tint (render/palette.js) and a key and tempo for the
// music. The level picks the theme (themeIndexForLevel: every 3 levels), so a
// theme change is the level-up's reveal: the board takes a new tint, the
// music a new key. Four themes, three tints: Dawn, Dusk, Slate, then Dusk
// again (in C minor, the fastest), so every theme change is a visible one.

export const THEMES = [
  {
    tint: 'dawn',
    music: {
      bpm: 104,
      progression: [
        { root: 45, minor: true },  // Am
        { root: 41, minor: false }, // F
        { root: 36, minor: false }, // C
        { root: 43, minor: false }, // G
      ],
    },
  },
  {
    tint: 'dusk',
    music: {
      bpm: 118,
      progression: [
        { root: 40, minor: true },  // Em
        { root: 36, minor: false }, // C
        { root: 43, minor: false }, // G
        { root: 38, minor: false }, // D
      ],
    },
  },
  {
    tint: 'slate',
    music: {
      bpm: 126,
      progression: [
        { root: 38, minor: true },  // Dm
        { root: 34, minor: false }, // Bb
        { root: 41, minor: false }, // F
        { root: 36, minor: false }, // C
      ],
    },
  },
  {
    tint: 'dusk',
    music: {
      bpm: 134,
      progression: [
        { root: 36, minor: true },  // Cm
        { root: 32, minor: false }, // Ab
        { root: 39, minor: false }, // Eb
        { root: 34, minor: false }, // Bb
      ],
    },
  },
];
