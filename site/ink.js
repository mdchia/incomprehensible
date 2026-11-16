// Ink. The colours on the paper are read off the stylesheet, so that the
// lamp changes the paper too.

// A colour, or anything else, as the stylesheet has it now.
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// One pixel of canvas, as the four bytes are laid in memory.
const pack = (c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];

// Fill two tables of 256 colours, indexed by how much ink (lib/paper.js,
// ink()): one for bare paper and one for where a ruled line is printed.
export function mix(paper, rule) {
  const p = rgb(css('--paper'));
  const g = rgb(css('--grat'));
  const k = rgb(css('--ink'));
  for (let i = 0; i < 256; i++) {
    const d = i / 255;
    paper[i] = pack(p.map((v, j) => Math.round(v + (k[j] - v) * d)));
    rule[i] = pack(g.map((v, j) => Math.round(v + (k[j] - v) * d)));
  }
}
