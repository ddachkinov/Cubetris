// ─── Glyphs ──────────────────────────────────────────────────────────────────
// Every cube colour carries a face glyph, so the board reads without colour:
// dot, ring, cross, bar, diamond for the five plain colours, a star on the
// rainbow and a fuse on the bomb. On the board they come from one canvas
// texture atlas (one cell per colour index, white on black, sampled by the
// cube shader in cubes.js); the HUD draws the same shapes as SVG.

import * as THREE from 'three';

export const GLYPH_CELLS = 8; // seven glyphs and a blank
const CELL = 128;

// Each shape drawn in a unit cell centred on (0, 0), extent about ±0.25: the
// rest of the cell is margin, so mipmaps never bleed one glyph into the next
const SHAPES = [
  // 0 dot
  (g) => { g.beginPath(); g.arc(0, 0, 0.17, 0, Math.PI * 2); g.fill(); },
  // 1 ring
  (g) => { g.lineWidth = 0.075; g.beginPath(); g.arc(0, 0, 0.19, 0, Math.PI * 2); g.stroke(); },
  // 2 cross
  (g) => { g.fillRect(-0.24, -0.045, 0.48, 0.09); g.fillRect(-0.045, -0.24, 0.09, 0.48); },
  // 3 bar
  (g) => { g.fillRect(-0.25, -0.06, 0.5, 0.12); },
  // 4 diamond
  (g) => {
    g.beginPath();
    g.moveTo(0, -0.25); g.lineTo(0.25, 0); g.lineTo(0, 0.25); g.lineTo(-0.25, 0);
    g.closePath(); g.fill();
  },
  // 5 star (rainbow)
  (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.11 : 0.26;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  },
  // 6 fuse (bomb): a spark with four rays
  (g) => {
    g.beginPath(); g.arc(0, 0, 0.1, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.06; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 0.16, Math.sin(a) * 0.16);
      g.lineTo(Math.cos(a) * 0.26, Math.sin(a) * 0.26);
      g.stroke();
    }
  },
];

export function createGlyphAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * GLYPH_CELLS;
  canvas.height = CELL;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  SHAPES.forEach((draw, i) => {
    g.save();
    g.translate(CELL * (i + 0.5), CELL / 2);
    g.scale(CELL, CELL);
    draw(g);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  // Data, not colour: the shader reads coverage from the red channel
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The same shapes for the HUD, in a 24-unit viewBox centred on 12,12
const SVG = [
  '<circle cx="12" cy="12" r="4.1"/>',
  '<circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  '<path d="M6.2 10.9h11.6v2.2H6.2zM10.9 6.2h2.2v11.6h-2.2z"/>',
  '<rect x="6" y="10.55" width="12" height="2.9" rx="0.6"/>',
  '<path d="M12 6l6 6-6 6-6-6z"/>',
  '<path d="M12 5.8l1.6 3.9 4.2.3-3.2 2.7 1 4.1-3.6-2.2-3.6 2.2 1-4.1-3.2-2.7 4.2-.3z"/>',
  '<circle cx="12" cy="12" r="2.4"/><path d="M14.7 9.3l1.7-1.7M9.3 9.3L7.6 7.6M14.7 14.7l1.7 1.7M9.3 14.7l-1.7 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
];

export function glyphSvg(colorIndex) {
  const body = SVG[colorIndex];
  return body ? `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${body}</svg>` : '';
}
