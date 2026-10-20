// ─── Theme system (Lumines-style skins) ──────────────────────────────────────
// A theme = environment palette + cube palette + music definition.
// Cube palettes keep the same five hue families (red, green, blue, yellow,
// magenta) across themes so color learning transfers between them.
// Themes rotate every 3 levels.

export const THEMES = [
  {
    name: 'DEEP OCEAN',
    bg: 0x08141f,
    ground: 0x0c1c2c,
    gridCore: 0x3a7a9a,
    gridFade: 0x1d3d50,
    palette: [0xff5c5c, 0x35d08e, 0x3fa9ff, 0xffd166, 0xff7ad9],
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
    name: 'SOLAR FLARE',
    bg: 0x1a0e08,
    ground: 0x261407,
    gridCore: 0xcc7a33,
    gridFade: 0x66401e,
    palette: [0xff4444, 0x9be564, 0x4fc3f7, 0xffb300, 0xff6ec7],
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
    name: 'NEON CITY',
    bg: 0x120821,
    ground: 0x1b0d30,
    gridCore: 0x9a4dff,
    gridFade: 0x4b2580,
    palette: [0xff3d6e, 0x2ee6a8, 0x38c3ff, 0xffe14d, 0xff5cf0],
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
    name: 'THE VOID',
    bg: 0x050508,
    ground: 0x0a0a10,
    gridCore: 0x8899bb,
    gridFade: 0x333a4d,
    palette: [0xff2e2e, 0x30ff8e, 0x2e8eff, 0xffcf30, 0xff30e0],
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
